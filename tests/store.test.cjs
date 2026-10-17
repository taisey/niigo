const test = require('node:test');
const assert = require('node:assert/strict');

function fixture() {
  const rows = {
    Tasks: [
      ['custom', 'round', 'id', 'title', 'due_date', 'assignees', 'status', 'category', 'description', 'categoryId', 'assigneeIds', 'roundId'],
      ['keep', 'Sprint 1', 't1', '洗濯', '2026-10-20', '太郎', 'Todo', '家事', '洗う', 'c1', '["m1"]', 'r1'],
      ['also keep', 'Sprint 1', 't2', '掃除', '2026-10-21', '', 'Done', '', '', '', '', 'r1']
    ],
    Categories: [['name', 'description', 'id'], ['家事', '', 'c1']],
    Rounds: [['status', 'id', 'name', 'description', 'start_date', 'end_date'], ['Active', 'r1', 'Sprint 1', '', '2026-10-01', '2026-10-31'], ['Planned', 'r2', 'Sprint 2', '', '2026-11-01', '2026-11-30']],
    Members: [['name', 'id'], ['太郎', 'm1']]
  };
  const names = Object.keys(rows);
  const notes = {Tasks: {'1:1': 'NIIGO:["r1"]', '1:5': 'NIIGO:["m1"]', '2:1': 'NIIGO:["r1"]'}};
  const writes = [];
  const gateway = {
    async read() {
      return {sheets: names.map((name, sheetId) => ({
        properties: {title: name, sheetId, gridProperties: {rowCount: 100}},
        data: [{rowData: rows[name].map((row, rowIndex) => ({values: row.map((value, columnIndex) => ({formattedValue: value, note: notes[name]?.[`${rowIndex}:${columnIndex}`]}))}))}]
      }))};
    },
    async write(requests) {
      writes.push(...requests);
      for (const request of requests) {
        if (request.appendDimension) continue;
        if (request.moveDimension) {
          const {startIndex} = request.moveDimension.source;
          const [item] = rows.Tasks.splice(startIndex, 1);
          const destination = request.moveDimension.destinationIndex;
          rows.Tasks.splice(destination > startIndex ? destination - 1 : destination, 0, item);
          continue;
        }
        const {range, rows: changes, fields} = request.updateCells;
        const name = names[range.sheetId];
        const row = range.startRowIndex, column = range.startColumnIndex;
        while (rows[name].length <= row) rows[name].push([]);
        const cell = changes[0].values[0];
        rows[name][row][column] = cell.userEnteredValue.numberValue === undefined
          ? cell.userEnteredValue.stringValue
          : new Date(Date.UTC(1899, 11, 30) + cell.userEnteredValue.numberValue * 86400000).toISOString().slice(0, 10);
        if (fields.includes('note')) (notes[name] ||= {})[`${row}:${column}`] = cell.note;
      }
    }
  };
  return {rows, notes, writes, gateway};
}

test('reorders tasks within a round by moving complete sheet rows', async () => {
  const {SheetStore} = await import('../dist/server/sheets/store.js');
  const {rows, writes, gateway} = fixture();
  const store = new SheetStore(gateway);
  await store.reorderTask('t2', 't1', 'Rounds', 'r1', ['t1', 't2']);
  assert.deepEqual(rows.Tasks.slice(1).map(row => row[2]), ['t2', 't1']);
  assert.equal(rows.Tasks[2][0], 'keep');
  assert.equal(writes[0].moveDimension.destinationIndex, 1);
  await store.reorderTask('t2', '', 'Rounds', 'r1', ['t2', 't1']);
  assert.deepEqual(rows.Tasks.slice(1).map(row => row[2]), ['t1', 't2']);
  assert.equal(writes[1].moveDimension.destinationIndex, 3);
});

test('rejects stale order and tasks outside the selected group', async () => {
  const {SheetStore} = await import('../dist/server/sheets/store.js');
  const {writes, gateway} = fixture();
  const store = new SheetStore(gateway);
  await assert.rejects(store.reorderTask('t2', 't1', 'Rounds', 'r1', ['t2', 't1']), /順番が変更されました/);
  await assert.rejects(store.reorderTask('t2', 't1', 'Categories', 'c1', ['t1']), /タスクが見つかりません/);
  assert.equal(writes.length, 0);
});

test('reorders tasks in a category using the same sheet order', async () => {
  const {SheetStore} = await import('../dist/server/sheets/store.js');
  const {rows, gateway} = fixture();
  rows.Tasks[2][7] = '家事';
  rows.Tasks[2][9] = 'c1';
  await new SheetStore(gateway).reorderTask('t2', 't1', 'Categories', 'c1', ['t1', 't2']);
  assert.deepEqual(rows.Tasks.slice(1).map(row => row[2]), ['t2', 't1']);
});

test('writes task and round dates as Sheets date cells', async () => {
  const {SheetStore} = await import('../dist/server/sheets/store.js');
  const {gateway, writes} = fixture();
  const store = new SheetStore(gateway);
  const task = (await store.read()).Tasks[0];
  await store.save('Tasks', {...task, due_date: '2026-12-31'}, JSON.stringify(task));
  const due = writes.find(request => request.updateCells?.range.startColumnIndex === 4)?.updateCells;
  assert.deepEqual(due.rows[0].values[0].userEnteredValue, {numberValue: 46387});
  assert.deepEqual(due.rows[0].values[0].userEnteredFormat.numberFormat, {type: 'DATE', pattern: 'yyyy-mm-dd'});
  assert.match(due.fields, /userEnteredFormat.numberFormat/);

  writes.length = 0;
  const round = (await store.read()).Rounds[0];
  await store.save('Rounds', {...round, start_date: '2026-10-02', end_date: ''}, JSON.stringify(round));
  for (const column of [4, 5]) {
    const change = writes.find(request => request.updateCells?.range.sheetId === 2 && request.updateCells.range.startColumnIndex === column)?.updateCells;
    assert.equal(change.rows[0].values[0].userEnteredFormat.numberFormat.type, 'DATE');
    assert.match(change.fields, /userEnteredFormat.numberFormat/);
  }
  assert.deepEqual(writes.find(request => request.updateCells?.range.sheetId === 2 && request.updateCells.range.startColumnIndex === 5).updateCells.rows[0].values[0].userEnteredValue, {stringValue: ''});
});

test('reads moved columns, writes by ID, and preserves custom cells', async () => {
  const {SheetStore} = await import('../dist/server/sheets/store.js');
  const {rows, gateway} = fixture();
  const store = new SheetStore(gateway);
  const before = (await store.read()).Tasks[0];
  assert.deepEqual(before.roundIds, ['r1']);
  [rows.Tasks[1], rows.Tasks[2]] = [rows.Tasks[2], rows.Tasks[1]];
  await store.save('Tasks', {...before, title: '洗濯物を干す'}, JSON.stringify(before));
  assert.equal(rows.Tasks[2][3], '洗濯物を干す');
  assert.equal(rows.Tasks[2][0], 'keep');
  assert.equal(rows.Tasks[2][10], '["m1"]');
  await assert.rejects(store.save('Tasks', {...before, title: '古い変更'}, JSON.stringify(before)), /変更されました/);
});

test('saving a task clears legacy ID notes', async () => {
  const {SheetStore} = await import('../dist/server/sheets/store.js');
  const {notes, gateway} = fixture();
  const store = new SheetStore(gateway);
  const task = (await store.read()).Tasks[0];
  await store.save('Tasks', {...task, title: '洗濯物を干す'}, JSON.stringify(task));
  assert.equal(notes.Tasks['1:5'], '');
  assert.equal(notes.Tasks['1:1'], '');
});

test('renaming a master retains task references', async () => {
  const {SheetStore} = await import('../dist/server/sheets/store.js');
  const {rows, gateway} = fixture();
  const store = new SheetStore(gateway);
  const category = (await store.read()).Categories[0];
  await store.save('Categories', {...category, name: '暮らし'}, JSON.stringify(category));
  assert.equal(rows.Tasks[1][7], '暮らし');
  assert.equal(rows.Tasks[1][9], 'c1');
});

test('category ID remains linked when its displayed task label is stale', async () => {
  const {SheetStore} = await import('../dist/server/sheets/store.js');
  const {rows, gateway} = fixture();
  rows.Categories[1][0] = '暮らし';
  const data = await new SheetStore(gateway).read();
  assert.deepEqual(data.Tasks[0].categoryIds, ['c1']);
});

test('assignee ID remains linked when its displayed name is stale', async () => {
  const {SheetStore} = await import('../dist/server/sheets/store.js');
  const {rows, gateway} = fixture();
  rows.Members[1][0] = '花子';
  const data = await new SheetStore(gateway).read();
  assert.deepEqual(data.Tasks[0].assigneesIds, ['m1']);
});

test('closing a round moves pending tasks and retains completed tasks', async () => {
  const {SheetStore} = await import('../dist/server/sheets/store.js');
  const {rows, gateway} = fixture();
  const store = new SheetStore(gateway);
  const round = (await store.read()).Rounds[0];
  await store.close('r1', {t1: 'r2'}, JSON.stringify(round));
  assert.equal(rows.Tasks[1][1], 'Sprint 2');
  assert.equal(rows.Tasks[1][11], 'r2');
  assert.equal(rows.Tasks[1][4], '2026-10-20');
  assert.equal(rows.Tasks[2][1], 'Sprint 1');
  assert.equal(rows.Rounds[1][0], 'Closed');
});

test('duplicate header stops writes before reaching Sheets', async () => {
  const {SheetStore} = await import('../dist/server/sheets/store.js');
  const {rows, gateway} = fixture();
  rows.Tasks[0][0] = 'title';
  let writes = 0;
  gateway.write = async () => {writes++;};
  await assert.rejects(new SheetStore(gateway).read(), /Tasks タブのヘッダー「title」が重複/);
  assert.equal(writes, 0);
});

test('creates a task without a category or round', async () => {
  const {SheetStore} = await import('../dist/server/sheets/store.js');
  const {rows, gateway} = fixture();
  const store = new SheetStore(gateway);
  const data = await store.save('Tasks', {
    title: '買い物', description: '', due_date: '', status: 'Todo',
    assigneesIds: [], categoryIds: [], roundIds: []
  }, '');
  const task = data.Tasks.find(item => item.title === '買い物');
  assert.deepEqual(task.categoryIds, []);
  assert.equal(rows.Tasks[3][9], '');
  assert.equal(rows.Tasks[3][10], '');
  assert.equal(rows.Tasks[3][11], '');
  assert.deepEqual(task.roundIds, []);
  assert.equal(rows.Tasks[3][7], '');
  assert.equal(rows.Tasks[3][1], '');
});

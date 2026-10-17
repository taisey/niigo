const test = require('node:test');
const assert = require('node:assert/strict');

function row(...items) {
  return {values: items.map(item => typeof item === 'string' ? {formattedValue: item} : item)};
}

function fixture(hasCategoryId = false) {
  const headers = ['title', 'category', 'assignees', 'round', ...(hasCategoryId ? ['categoryId'] : [])];
  const task = [
    '洗濯',
    {formattedValue: '古いカテゴリ名', note: 'NIIGO:["c1"]'},
    {formattedValue: '太郎', note: 'NIIGO:["m1"]'},
    {formattedValue: 'Sprint 1', note: 'NIIGO:["r1"]'},
    ...(hasCategoryId ? ['c1'] : [])
  ];
  const raw = {sheets: [
    {properties: {title: 'Tasks', sheetId: 10, gridProperties: {columnCount: headers.length}}, data: [{rowData: [row(...headers), row(...task)]}]},
    {properties: {title: 'Categories', sheetId: 20}, data: [{rowData: [row('name', 'id'), row('家事', 'c1')]}]},
    {properties: {title: 'Members', sheetId: 30}, data: [{rowData: [row('name', 'id'), row('太郎', 'm1')]}]},
    {properties: {title: 'Rounds', sheetId: 40}, data: [{rowData: [row('name', 'id'), row('Sprint 1', 'r1')]}]}
  ]};
  const writes = [];
  const gateway = {read: async () => raw, write: async requests => {writes.push(...requests);}};
  return {gateway, writes};
}

test('migration creates hidden ID columns and removes legacy ID notes', async () => {
  const {ensureReferenceIdColumns} = await import('../dist/server/reference-id-migration.js');
  const {gateway, writes} = fixture();
  assert.deepEqual(await ensureReferenceIdColumns(gateway), {
    created: ['categoryId', 'assigneeIds', 'roundId'], backfilled: 3, clearedNotes: 3
  });
  assert.equal(writes[0].appendDimension.length, 3);
  const values = writes.filter(request => request.updateCells?.fields === 'userEnteredValue')
    .map(request => request.updateCells.rows[0].values[0].userEnteredValue.stringValue);
  assert.deepEqual(values, ['categoryId', 'assigneeIds', 'roundId', 'c1', '["m1"]', 'r1']);
  assert.equal(writes.filter(request => request.updateCells?.fields === 'note').length, 3);
  assert.equal(writes.filter(request => request.updateDimensionProperties?.properties.hiddenByUser).length, 3);
});

test('migration preserves an existing categoryId and adds only missing columns', async () => {
  const {ensureReferenceIdColumns} = await import('../dist/server/reference-id-migration.js');
  const {gateway, writes} = fixture(true);
  assert.deepEqual(await ensureReferenceIdColumns(gateway), {
    created: ['assigneeIds', 'roundId'], backfilled: 2, clearedNotes: 3
  });
  assert.equal(writes[0].appendDimension.length, 2);
  assert.equal(writes.filter(request => request.addProtectedRange).length, 2);
});

test('moves task IDs from H to AA and keeps reference IDs beside them', async () => {
  const {moveTaskIdToHiddenColumn} = await import('../dist/server/reference-id-migration.js');
  const headers = Array(29).fill('');
  headers[7] = 'id';
  headers[26] = 'categoryId';
  headers[27] = 'assigneeIds';
  headers[28] = 'roundId';
  const values = [headers, Array(29).fill('')];
  values[1][7] = 'task-1';
  values[1][26] = 'category-1';
  values[1][27] = '["member-1"]';
  values[1][28] = 'round-1';
  const gateway = {
    read: async () => ({sheets: [{
      properties: {title: 'Tasks', sheetId: 10},
      data: [{rowData: values.map(items => row(...items))}]
    }]}),
    write: async requests => {
      for (const request of requests) {
        if (request.insertDimension) {
          for (const items of values) items.splice(request.insertDimension.range.startIndex, 0, '');
        } else if (request.copyPaste) {
          for (const items of values) items[request.copyPaste.destination.startColumnIndex] = items[request.copyPaste.source.startColumnIndex];
        } else if (request.deleteDimension) {
          for (const items of values) items.splice(request.deleteDimension.range.startIndex, 1);
        }
      }
    }
  };
  assert.equal(await moveTaskIdToHiddenColumn(gateway), true);
  assert.deepEqual(values[0].slice(26, 30), ['id', 'categoryId', 'assigneeIds', 'roundId']);
  assert.deepEqual(values[1].slice(26, 30), ['task-1', 'category-1', '["member-1"]', 'round-1']);
  assert.equal(values[0][7], '');
  assert.equal(await moveTaskIdToHiddenColumn(gateway), false);
});

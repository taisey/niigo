const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Sheet {
  constructor(name, rows) { this.name = name; this.rows = rows; this.notes = {}; }
  getName() { return this.name; }
  getParent() { return {getSpreadsheetTimeZone: () => 'Etc/UTC'}; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows[0].length; }
  getMaxRows() { return 100; }
  getRange(row, column, height = 1, width = 1) {
    const sheet = this;
    return {
      getSheet() { return sheet; },
      getRow() { return row; },
      getLastRow() { return row + height - 1; },
      getColumn() { return column; },
      getNumRows() { return height; },
      getNumColumns() { return width; },
      getDisplayValues() { return Array.from({length: height}, (_, r) => Array.from({length: width}, (_, c) => display(sheet.rows[row+r-1]?.[column+c-1]))); },
      getDisplayValue() { return display(sheet.rows[row-1]?.[column-1]); },
      getNote() { return sheet.notes[`${row}:${column}`] || ''; },
      setNote(value) { sheet.notes[`${row}:${column}`] = value; return this; },
      setValue(value) { while (sheet.rows.length < row) sheet.rows.push(Array(sheet.rows[0].length).fill('')); sheet.rows[row-1][column-1] = value; return this; },
      setDataValidation() { return this; },
      setNumberFormat() { return this; }
    };
  }
}

function display(value) { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? ''); }

function fixture() {
  const sheets = {
    Tasks: new Sheet('Tasks', [
      ['custom', 'round', 'id', 'title', 'due_date', 'assignees', 'status', 'category', 'description', 'categoryId', 'assigneeIds', 'roundId'],
      ['keep', 'Sprint 1', 't1', '洗濯', '2026-10-20', '太郎', 'Todo', '家事', '洗う', 'c1', '["m1"]', 'r1'],
      ['also keep', 'Sprint 1', 't2', '掃除', '2026-10-21', '', 'Done', '', '', '', '', 'r1']
    ]),
    Categories: new Sheet('Categories', [['name','description','id'],['家事','','c1']]),
    Rounds: new Sheet('Rounds', [['status','id','name','description','start_date','end_date'],['Active','r1','Sprint 1','','2026-10-01','2026-10-31'],['Planned','r2','Sprint 2','','2026-11-01','2026-11-30']]),
    Members: new Sheet('Members', [['name','id'],['太郎','m1']])
  };
  const spreadsheet = {getSheetByName: name => sheets[name]};
  const context = {
    SpreadsheetApp: {
      openById: () => spreadsheet,
      newDataValidation: () => ({requireValueInList() {return this;},requireValueInRange() {return this;},setAllowInvalid() {return this;},build() {return {};}})
    },
    PropertiesService: {getScriptProperties: () => ({getProperty: () => 'spreadsheet'})},
    LockService: {getScriptLock: () => ({waitLock() {},releaseLock() {}})},
    Utilities: {getUuid: () => 'new-id', parseDate: value => new Date(`${value}T00:00:00Z`)},
    console
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('gas/dynamic/Runtime.js', 'utf8'), context);
  return {context, sheets};
}

test('reads moved columns and preserves custom cells on update', () => {
  const {context, sheets} = fixture();
  const data = context.getData();
  assert.equal(data.Tasks[0].title, '洗濯');
  assert.deepEqual(Array.from(data.Tasks[0].roundIds), ['r1']);
  const task = {...data.Tasks[0], title: '洗濯物を干す'};
  context.saveEntity('Tasks', task, JSON.stringify(data.Tasks[0]));
  assert.equal(sheets.Tasks.rows[1][3], '洗濯物を干す');
  assert.equal(sheets.Tasks.rows[1][0], 'keep');
});

test('saves task and round dates as native spreadsheet dates', () => {
  const {context, sheets} = fixture();
  const task = context.getData().Tasks[0];
  context.saveEntity('Tasks', {...task, due_date: '2026-12-31'}, JSON.stringify(task));
  assert.equal(sheets.Tasks.rows[1][4] instanceof Date, true);
  assert.equal(sheets.Tasks.rows[1][4].toISOString(), '2026-12-31T00:00:00.000Z');
  assert.equal(context.getData().Tasks[0].due_date, '2026-12-31');

  const round = context.getData().Rounds[0];
  context.saveEntity('Rounds', {...round, start_date: '2026-10-02', end_date: ''}, JSON.stringify(round));
  assert.equal(sheets.Rounds.rows[1][4] instanceof Date, true);
  assert.equal(sheets.Rounds.rows[1][4].toISOString(), '2026-10-02T00:00:00.000Z');
  assert.equal(sheets.Rounds.rows[1][5], '');
});

test('round close moves pending tasks and keeps completed tasks and due dates', () => {
  const {context, sheets} = fixture();
  const round = context.getData().Rounds[0];
  context.closeRound('r1', {t1: 'r2'}, JSON.stringify(round));
  assert.equal(sheets.Tasks.rows[1][1], 'Sprint 2');
  assert.equal(sheets.Tasks.rows[1][11], 'r2');
  assert.equal(sheets.Tasks.rows[1][4], '2026-10-20');
  assert.equal(sheets.Tasks.rows[2][1], 'Sprint 1');
  assert.equal(sheets.Rounds.rows[1][0], 'Closed');
});

test('duplicate header stops writes with a useful error', () => {
  const {context, sheets} = fixture();
  sheets.Tasks.rows[0][0] = 'title';
  assert.throws(() => context.getData(), /Tasks タブのヘッダー「title」が重複/);
  assert.equal(sheets.Tasks.rows[1][3], '洗濯');
});

test('master rename updates visible references by ID', () => {
  const {context, sheets} = fixture();
  const category = context.getData().Categories[0];
  context.saveEntity('Categories', {...category, name: '暮らし'}, JSON.stringify(category));
  assert.equal(sheets.Tasks.rows[1][7], '暮らし');
  assert.equal(sheets.Tasks.rows[1][9], 'c1');
});

test('category ID remains linked when its displayed task label is stale', () => {
  const {context, sheets} = fixture();
  sheets.Categories.rows[1][0] = '暮らし';
  assert.deepEqual(Array.from(context.getData().Tasks[0].categoryIds), ['c1']);
});

test('an unrelated sheet edit repairs category and round IDs from their displayed names', () => {
  const {context, sheets} = fixture();
  sheets.Categories.rows.push(['仕事', '', 'c2']);
  sheets.Tasks.rows[1][9] = 'c2';
  sheets.Tasks.rows[1][11] = 'r2';
  sheets.Tasks.getRange(2, 4).setValue('洗濯物を干す');
  context.sheetEdited({range: sheets.Tasks.getRange(2, 4), value: '洗濯物を干す', oldValue: '洗濯'});
  assert.equal(sheets.Tasks.rows[1][7], '家事');
  assert.equal(sheets.Tasks.rows[1][9], 'c1');
  assert.equal(sheets.Tasks.rows[1][1], 'Sprint 1');
  assert.equal(sheets.Tasks.rows[1][11], 'r1');
});

test('editing a round name refreshes its task label without changing the ID', () => {
  const {context, sheets} = fixture();
  sheets.Rounds.getRange(2, 3).setValue('来週');
  context.sheetEdited({range: sheets.Rounds.getRange(2, 3), value: '来週', oldValue: 'Sprint 1'});
  assert.equal(sheets.Tasks.rows[1][1], '来週');
  assert.equal(sheets.Tasks.rows[1][11], 'r1');
});

test('assignee ID remains linked when its displayed name is stale', () => {
  const {context, sheets} = fixture();
  sheets.Members.rows[1][0] = '花子';
  assert.deepEqual(Array.from(context.getData().Tasks[0].assigneesIds), ['m1']);
});

test('editing a task category updates its stored category ID', () => {
  const {context, sheets} = fixture();
  sheets.Categories.rows.push(['仕事', '', 'c2']);
  sheets.Tasks.getRange(2, 8).setValue('仕事');
  context.sheetEdited({range: sheets.Tasks.getRange(2, 8), value: '仕事', oldValue: '家事'});
  assert.deepEqual(Array.from(context.getData().Tasks[0].categoryIds), ['c2']);
  assert.equal(sheets.Tasks.rows[1][9], 'c2');
});

test('editing a task round updates its stored round ID', () => {
  const {context, sheets} = fixture();
  sheets.Tasks.getRange(2, 2).setValue('Sprint 2');
  context.sheetEdited({range: sheets.Tasks.getRange(2, 2), value: 'Sprint 2', oldValue: 'Sprint 1'});
  assert.deepEqual(Array.from(context.getData().Tasks[0].roundIds), ['r2']);
  assert.equal(sheets.Tasks.rows[1][11], 'r2');
});

test('a pasted range starting at the header still updates task reference IDs', () => {
  const {context, sheets} = fixture();
  sheets.Categories.rows.push(['仕事', '', 'c2']);
  sheets.Tasks.getRange(2, 8).setValue('仕事');
  context.sheetEdited({range: sheets.Tasks.getRange(1, 8, 2, 1)});
  assert.equal(sheets.Tasks.rows[1][9], 'c2');
});

test('editing assignees updates hidden IDs and clears old notes', () => {
  const {context, sheets} = fixture();
  sheets.Members.rows.push(['花子', 'm2']);
  sheets.Tasks.getRange(2, 6).setNote('NIIGO:["m1"]');
  sheets.Tasks.getRange(2, 6).setValue('太郎, 花子');
  context.sheetEdited({range: sheets.Tasks.getRange(2, 6)});
  assert.deepEqual(Array.from(context.getData().Tasks[0].assigneesIds), ['m1', 'm2']);
  assert.equal(sheets.Tasks.rows[1][10], '["m1","m2"]');
  assert.equal(sheets.Tasks.getRange(2, 6).getNote(), '');
});

test('pasting task categories updates hidden IDs for every row', () => {
  const {context, sheets} = fixture();
  sheets.Categories.rows.push(['仕事', '', 'c2']);
  sheets.Tasks.getRange(2, 8).setValue('仕事');
  sheets.Tasks.getRange(3, 8).setValue('仕事');
  context.sheetEdited({range: sheets.Tasks.getRange(2, 8, 2, 1)});
  assert.equal(sheets.Tasks.rows[1][9], 'c2');
  assert.equal(sheets.Tasks.rows[2][9], 'c2');
});

test('pasting category names refreshes task labels by category ID', () => {
  const {context, sheets} = fixture();
  sheets.Categories.rows.push(['仕事', '', 'c2']);
  sheets.Categories.getRange(2, 1).setValue('暮らし');
  sheets.Categories.getRange(3, 1).setValue('職場');
  context.sheetEdited({range: sheets.Categories.getRange(2, 1, 2, 1)});
  assert.equal(sheets.Tasks.rows[1][7], '暮らし');
  assert.equal(sheets.Tasks.rows[1][9], 'c1');
});

test('updates the intended ID after rows move and rejects stale edits', () => {
  const {context, sheets} = fixture();
  const before = context.getData().Tasks[0];
  [sheets.Tasks.rows[1], sheets.Tasks.rows[2]] = [sheets.Tasks.rows[2], sheets.Tasks.rows[1]];
  context.saveEntity('Tasks', {...before, title: '新しい名前'}, JSON.stringify(before));
  assert.equal(sheets.Tasks.rows[2][3], '新しい名前');
  assert.equal(sheets.Tasks.rows[1][3], '掃除');
  assert.throws(() => context.saveEntity('Tasks', {...before, title: '古い変更'}, JSON.stringify(before)), /変更されました/);
});

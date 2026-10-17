const test = require('node:test');
const assert = require('node:assert/strict');

function row(...items) {
  return {values: items.map(item => typeof item === 'string' ? {formattedValue: item} : item)};
}

function fixture(hasColumn = false) {
  const tasks = [
    row(...(hasColumn ? ['title', 'category', 'categoryId'] : ['title', 'category'])),
    row('洗濯', {formattedValue: '古い名前', note: 'NIIGO:["c1"]'}, ...(hasColumn ? [''] : [])),
    row('掃除', '家事', ...(hasColumn ? [''] : []))
  ];
  const raw = {sheets: [
    {properties: {title: 'Tasks', sheetId: 10, gridProperties: {columnCount: hasColumn ? 3 : 2}}, data: [{rowData: tasks}]},
    {properties: {title: 'Categories', sheetId: 20}, data: [{rowData: [row('name', 'id'), row('家事', 'c1')]}]}
  ]};
  const writes = [];
  const gateway = {read: async () => raw, write: async requests => {writes.push(...requests);}};
  return {gateway, writes};
}

test('migration creates a hidden categoryId column and backfills by ID', async () => {
  const {ensureCategoryIdColumn} = await import('../server/category-id-migration.js');
  const {gateway, writes} = fixture();
  assert.deepEqual(await ensureCategoryIdColumn(gateway), {created: true, backfilled: 2});
  assert.equal(writes[0].appendDimension.dimension, 'COLUMNS');
  assert.equal(writes[1].updateCells.rows[0].values[0].userEnteredValue.stringValue, 'categoryId');
  assert.equal(writes[2].updateCells.rows[0].values[0].userEnteredValue.stringValue, 'c1');
  assert.equal(writes[3].updateCells.rows[0].values[0].userEnteredValue.stringValue, 'c1');
  assert.equal(writes[4].updateDimensionProperties.properties.hiddenByUser, true);
  assert.equal(writes[5].addProtectedRange.protectedRange.warningOnly, true);
});

test('migration backfills an existing categoryId column without adding another', async () => {
  const {ensureCategoryIdColumn} = await import('../server/category-id-migration.js');
  const {gateway, writes} = fixture(true);
  assert.deepEqual(await ensureCategoryIdColumn(gateway), {created: false, backfilled: 2});
  assert.equal(writes.length, 2);
  assert.ok(writes.every(request => request.updateCells));
});

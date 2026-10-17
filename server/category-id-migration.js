function cell(row, index) {
  return row?.values?.[index];
}

function value(row, index) {
  return cell(row, index)?.formattedValue || '';
}

function column(headers, name) {
  const positions = headers.flatMap((header, index) => header === name ? [index] : []);
  if (positions.length !== 1) throw new Error(`${name} 列が${positions.length ? '重複しています。' : 'ありません。'}`);
  return positions[0];
}

function writeCell(sheetId, row, columnIndex, text) {
  return {updateCells: {
    range: {sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1},
    rows: [{values: [{userEnteredValue: {stringValue: text}}]}],
    fields: 'userEnteredValue'
  }};
}

export async function ensureCategoryIdColumn(gateway) {
  const raw = await gateway.read();
  const tasks = raw.sheets.find(sheet => sheet.properties?.title === 'Tasks');
  const categories = raw.sheets.find(sheet => sheet.properties?.title === 'Categories');
  if (!tasks && !categories) return {created: false, backfilled: 0};
  if (!tasks || !categories) throw new Error('Tasks と Categories の両方のタブが必要です。');

  const taskRows = tasks.data?.[0]?.rowData || [];
  const categoryRows = categories.data?.[0]?.rowData || [];
  const taskHeaders = (taskRows[0]?.values || []).map(item => item?.formattedValue || '');
  const categoryHeaders = (categoryRows[0]?.values || []).map(item => item?.formattedValue || '');
  const taskCategory = column(taskHeaders, 'category');
  const categoryName = column(categoryHeaders, 'name');
  const categoryId = column(categoryHeaders, 'id');
  const existingColumns = taskHeaders.flatMap((header, index) => header === 'categoryId' ? [index] : []);
  if (existingColumns.length > 1) throw new Error('Tasks タブの categoryId 列が重複しています。');
  const created = existingColumns.length === 0;
  const targetColumn = created ? tasks.properties.gridProperties?.columnCount : existingColumns[0];
  if (!Number.isInteger(targetColumn)) throw new Error('Tasks タブの列数を取得できません。');

  const byName = new Map();
  const byId = new Set();
  for (const row of categoryRows.slice(1)) {
    const name = value(row, categoryName).trim();
    const id = value(row, categoryId).trim();
    if (!name && !id) continue;
    if (!name || !id || byName.has(name) || byId.has(id)) throw new Error('Categories タブの名前と ID を確認してください。');
    byName.set(name, id);
    byId.add(id);
  }

  const updates = [];
  for (let row = 1; row < taskRows.length; row++) {
    const current = created ? '' : value(taskRows[row], targetColumn).trim();
    if (current) {
      if (!byId.has(current)) throw new Error(`Tasks タブの ${row + 1} 行目の categoryId が不正です。`);
      continue;
    }
    let id = '';
    const note = cell(taskRows[row], taskCategory)?.note || '';
    if (note.startsWith('NIIGO:')) {
      try {
        const ids = JSON.parse(note.slice(6));
        if (Array.isArray(ids) && ids.length === 1 && byId.has(ids[0])) id = ids[0];
      } catch { /* Use the displayed category below. */ }
    }
    if (!id) {
      const name = value(taskRows[row], taskCategory).trim();
      if (name) {
        id = byName.get(name);
        if (!id) throw new Error(`Tasks タブの ${row + 1} 行目のカテゴリが見つかりません: ${name}`);
      }
    }
    if (id) updates.push(writeCell(tasks.properties.sheetId, row, targetColumn, id));
  }

  if (created) {
    await gateway.write([
      {appendDimension: {sheetId: tasks.properties.sheetId, dimension: 'COLUMNS', length: 1}},
      writeCell(tasks.properties.sheetId, 0, targetColumn, 'categoryId'),
      ...updates,
      {updateDimensionProperties: {
        range: {sheetId: tasks.properties.sheetId, dimension: 'COLUMNS', startIndex: targetColumn, endIndex: targetColumn + 1},
        properties: {hiddenByUser: true}, fields: 'hiddenByUser'
      }},
      {addProtectedRange: {protectedRange: {
        range: {sheetId: tasks.properties.sheetId, startColumnIndex: targetColumn, endColumnIndex: targetColumn + 1},
        description: 'NIIGO categoryId', warningOnly: true
      }}}
    ]);
  } else if (updates.length) {
    await gateway.write(updates);
  }
  return {created, backfilled: updates.length};
}

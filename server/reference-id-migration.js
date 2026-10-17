const REFERENCES = [
  {visible: 'category', hidden: 'categoryId', master: 'Categories', multiple: false},
  {visible: 'assignees', hidden: 'assigneeIds', master: 'Members', multiple: true},
  {visible: 'round', hidden: 'roundId', master: 'Rounds', multiple: false}
];

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

function updateCell(sheetId, row, columnIndex, update, fields) {
  return {updateCells: {
    range: {sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1},
    rows: [{values: [update]}], fields
  }};
}

function writeValue(sheetId, row, columnIndex, text) {
  return updateCell(sheetId, row, columnIndex, {userEnteredValue: {stringValue: text}}, 'userEnteredValue');
}

function mastersFor(sheet) {
  if (!sheet) throw new Error('参照先のタブがありません。');
  const rows = sheet.data?.[0]?.rowData || [];
  const headers = (rows[0]?.values || []).map(item => item?.formattedValue || '');
  const nameColumn = column(headers, 'name');
  const idColumn = column(headers, 'id');
  const byName = new Map();
  const byId = new Set();
  for (const row of rows.slice(1)) {
    const name = value(row, nameColumn).trim();
    const id = value(row, idColumn).trim();
    if (!name && !id) continue;
    if (!name || !id || byName.has(name) || byId.has(id)) throw new Error(`${sheet.properties.title} タブの名前と ID を確認してください。`);
    byName.set(name, id);
    byId.add(id);
  }
  return {byName, byId};
}

function resolveIds(row, visibleColumn, masters, multiple, rowNumber) {
  const visibleCell = cell(row, visibleColumn);
  const note = visibleCell?.note || '';
  if (note.startsWith('NIIGO:')) {
    try {
      const ids = JSON.parse(note.slice(6));
      if (Array.isArray(ids) && (multiple || ids.length <= 1) && ids.every(id => masters.byId.has(id))) return ids;
    } catch { /* Use displayed names below. */ }
  }
  const names = value(row, visibleColumn).split(',').map(name => name.trim()).filter(Boolean);
  if (!multiple && names.length > 1) throw new Error(`Tasks タブの ${rowNumber} 行目の参照先が複数あります。`);
  return names.map(name => {
    const id = masters.byName.get(name);
    if (!id) throw new Error(`Tasks タブの ${rowNumber} 行目の参照先が見つかりません: ${name}`);
    return id;
  });
}

export async function ensureReferenceIdColumns(gateway) {
  const raw = await gateway.read();
  const tasks = raw.sheets.find(sheet => sheet.properties?.title === 'Tasks');
  if (!tasks) return {created: [], backfilled: 0, clearedNotes: 0};
  const rows = tasks.data?.[0]?.rowData || [];
  const headers = (rows[0]?.values || []).map(item => item?.formattedValue || '');
  const sheetId = tasks.properties.sheetId;
  const columnCount = tasks.properties.gridProperties?.columnCount;
  if (!Number.isInteger(columnCount)) throw new Error('Tasks タブの列数を取得できません。');

  const planned = REFERENCES.map(reference => {
    const visibleColumn = column(headers, reference.visible);
    const existing = headers.flatMap((header, index) => header === reference.hidden ? [index] : []);
    if (existing.length > 1) throw new Error(`Tasks タブの ${reference.hidden} 列が重複しています。`);
    return {...reference, visibleColumn, existing: existing[0], masters: mastersFor(raw.sheets.find(sheet => sheet.properties?.title === reference.master))};
  });
  const created = planned.filter(reference => reference.existing === undefined).map(reference => reference.hidden);
  let nextColumn = columnCount;
  for (const reference of planned) reference.targetColumn = reference.existing ?? nextColumn++;

  const requests = [];
  if (created.length) requests.push({appendDimension: {sheetId, dimension: 'COLUMNS', length: created.length}});
  for (const reference of planned) {
    if (reference.existing !== undefined) continue;
    requests.push(writeValue(sheetId, 0, reference.targetColumn, reference.hidden));
  }

  let backfilled = 0;
  let clearedNotes = 0;
  for (let row = 1; row < rows.length; row++) {
    for (const reference of planned) {
      const current = reference.existing === undefined ? '' : value(rows[row], reference.targetColumn).trim();
      if (current) {
        const ids = reference.multiple ? (() => {
          try { return JSON.parse(current); } catch { return null; }
        })() : [current];
        if (!Array.isArray(ids) || (!reference.multiple && ids.length !== 1) || ids.some(id => !reference.masters.byId.has(id))) {
          throw new Error(`Tasks タブの ${row + 1} 行目の ${reference.hidden} が不正です。`);
        }
      } else {
        const ids = resolveIds(rows[row], reference.visibleColumn, reference.masters, reference.multiple, row + 1);
        if (ids.length) {
          requests.push(writeValue(sheetId, row, reference.targetColumn, reference.multiple ? JSON.stringify(ids) : ids[0]));
          backfilled++;
        }
      }
      if (cell(rows[row], reference.visibleColumn)?.note?.startsWith('NIIGO:')) {
        requests.push(updateCell(sheetId, row, reference.visibleColumn, {note: ''}, 'note'));
        clearedNotes++;
      }
    }
  }

  for (const reference of planned) {
    if (reference.existing !== undefined) continue;
    requests.push({updateDimensionProperties: {
      range: {sheetId, dimension: 'COLUMNS', startIndex: reference.targetColumn, endIndex: reference.targetColumn + 1},
      properties: {hiddenByUser: true}, fields: 'hiddenByUser'
    }});
    requests.push({addProtectedRange: {protectedRange: {
      range: {sheetId, startColumnIndex: reference.targetColumn, endColumnIndex: reference.targetColumn + 1},
      description: `NIIGO ${reference.hidden}`, warningOnly: true
    }}});
  }
  if (requests.length) await gateway.write(requests);
  return {created, backfilled, clearedNotes};
}

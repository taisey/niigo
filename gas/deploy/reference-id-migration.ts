const REFERENCES = [
  {visible: 'category', hidden: 'categoryId', master: 'Categories', multiple: false},
  {visible: 'assignees', hidden: 'assigneeIds', master: 'Members', multiple: true},
  {visible: 'round', hidden: 'roundId', master: 'Rounds', multiple: false}
];

function cell(row: SheetRow | undefined, index: number): SheetCell | undefined {
  return row?.values?.[index];
}

function value(row: SheetRow | undefined, index: number): string {
  return cell(row, index)?.formattedValue || '';
}

function column(headers: string[], name: string): number {
  const positions = headers.flatMap((header, index) => header === name ? [index] : []);
  if (positions.length !== 1) throw new Error(`${name} 列が${positions.length ? '重複しています。' : 'ありません。'}`);
  return positions[0];
}

function updateCell(sheetId: number, row: number, columnIndex: number, update: object, fields: string) {
  return {updateCells: {
    range: {sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1},
    rows: [{values: [update]}], fields
  }};
}

function writeValue(sheetId: number, row: number, columnIndex: number, text: string) {
  return updateCell(sheetId, row, columnIndex, {userEnteredValue: {stringValue: text}}, 'userEnteredValue');
}

function mastersFor(sheet: Sheet | undefined) {
  if (!sheet) throw new Error('参照先のタブがありません。');
  const rows = sheet.data?.[0]?.rowData || [];
  const headers = (rows[0]?.values || []).map(item => item?.formattedValue || '');
  const nameColumn = column(headers, 'name');
  const idColumn = column(headers, 'id');
  const byName = new Map<string, string>();
  const byId = new Set<string>();
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

function resolveIds(row: SheetRow | undefined, visibleColumn: number, masters: ReturnType<typeof mastersFor>, multiple: boolean, rowNumber: number): string[] {
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

export async function ensureReferenceIdColumns(gateway: SheetsGateway) {
  const raw = await gateway.read();
  const tasks = raw.sheets.find(sheet => sheet.properties?.title === 'Tasks');
  if (!tasks) return {created: [], backfilled: 0, clearedNotes: 0};
  const rows = tasks.data?.[0]?.rowData || [];
  const headers = (rows[0]?.values || []).map(item => item?.formattedValue || '');
  const sheetId = tasks.properties.sheetId;
  const columnCount = tasks.properties.gridProperties?.columnCount;
  if (typeof columnCount !== 'number' || !Number.isInteger(columnCount)) throw new Error('Tasks タブの列数を取得できません。');

  const planned = REFERENCES.map(reference => {
    const visibleColumn = column(headers, reference.visible);
    const existing = headers.flatMap((header, index) => header === reference.hidden ? [index] : []);
    if (existing.length > 1) throw new Error(`Tasks タブの ${reference.hidden} 列が重複しています。`);
    return {...reference, visibleColumn, existing: existing[0], targetColumn: existing[0] ?? -1, masters: mastersFor(raw.sheets.find(sheet => sheet.properties?.title === reference.master))};
  });
  const created = planned.filter(reference => reference.existing === undefined).map(reference => reference.hidden);
  let nextColumn = columnCount;
  for (const reference of planned) reference.targetColumn = reference.existing ?? nextColumn++;

  const requests: object[] = [];
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
      if (!current) {
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

export async function reconcileTaskReferenceIds(gateway: SheetsGateway): Promise<number> {
  const raw = await gateway.read();
  const tasks = raw.sheets.find(sheet => sheet.properties?.title === 'Tasks');
  if (!tasks) return 0;
  const rows = tasks.data?.[0]?.rowData || [];
  const headers = (rows[0]?.values || []).map(item => item?.formattedValue || '');
  const references = REFERENCES.map(reference => {
    const master = mastersFor(raw.sheets.find(sheet => sheet.properties?.title === reference.master));
    return {...reference, visibleColumn: column(headers, reference.visible), hiddenColumn: column(headers, reference.hidden), byName: master.byName};
  });
  const requests: object[] = [];
  for (let row = 1; row < rows.length; row++) {
    for (const reference of references) {
      const names = value(rows[row], reference.visibleColumn).split(',').map(name => name.trim()).filter(Boolean);
      if (!reference.multiple && names.length > 1) throw new Error(`Tasks タブの ${row + 1} 行目の ${reference.visible} が複数あります。`);
      const ids = [...new Set(names.map(name => {
        const id = reference.byName.get(name);
        if (!id) throw new Error(`Tasks タブの ${row + 1} 行目の参照先が見つかりません: ${name}`);
        return id;
      }))];
      const expected = reference.multiple && ids.length ? JSON.stringify(ids) : ids[0] || '';
      if (value(rows[row], reference.hiddenColumn) !== expected) {
        requests.push(writeValue(tasks.properties.sheetId, row, reference.hiddenColumn, expected));
      }
    }
  }
  if (requests.length) await gateway.write(requests);
  return requests.length;
}

export async function moveTaskIdToHiddenColumn(gateway: SheetsGateway) {
  const raw = await gateway.read();
  const tasks = raw.sheets.find(sheet => sheet.properties?.title === 'Tasks');
  if (!tasks) return false;
  const headers = (tasks.data?.[0]?.rowData?.[0]?.values || []).map(item => item?.formattedValue || '');
  const idColumn = column(headers, 'id');
  if (idColumn === 26) return false;
  if (idColumn !== 7 || headers[26] !== 'categoryId' || headers[27] !== 'assigneeIds' || headers[28] !== 'roundId') {
    throw new Error('Tasks タブの ID 列を移動できません。列の配置を確認してください。');
  }
  const sheetId = tasks.properties.sheetId;
  await gateway.write([
    {insertDimension: {range: {sheetId, dimension: 'COLUMNS', startIndex: 26, endIndex: 27}, inheritFromBefore: false}},
    {copyPaste: {
      source: {sheetId, startColumnIndex: 7, endColumnIndex: 8},
      destination: {sheetId, startColumnIndex: 26, endColumnIndex: 27},
      pasteType: 'PASTE_VALUES'
    }},
    {deleteDimension: {range: {sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8}}},
    {insertDimension: {range: {sheetId, dimension: 'COLUMNS', startIndex: 25, endIndex: 26}, inheritFromBefore: false}},
    {updateDimensionProperties: {
      range: {sheetId, dimension: 'COLUMNS', startIndex: 26, endIndex: 30},
      properties: {hiddenByUser: true}, fields: 'hiddenByUser'
    }},
    {addProtectedRange: {protectedRange: {
      range: {sheetId, startColumnIndex: 26, endColumnIndex: 27},
      description: 'NIIGO ID', warningOnly: true
    }}}
  ]);
  return true;
}
import type {Sheet, SheetCell, SheetRow, SheetsGateway} from '../../server/sheets/types.js';

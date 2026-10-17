import type {SheetsGateway} from '../../server/sheets/types.js';

const DATE_COLUMNS = {Tasks: ['due_date'], Rounds: ['start_date', 'end_date']} as const;
const SHEETS_EPOCH = Date.UTC(1899, 11, 30);
const DAY_MS = 86400000;
const DATE_FORMAT = {type: 'DATE', pattern: 'yyyy-mm-dd'};

function serial(value: string, location: string): number {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new Error(`${location} の日付が不正です: ${value}`);
  }
  return (timestamp - SHEETS_EPOCH) / DAY_MS;
}

export async function migrateDateCells(gateway: SheetsGateway): Promise<number> {
  const raw = await gateway.read();
  const requests: object[] = [];
  let converted = 0;
  for (const [name, fields] of Object.entries(DATE_COLUMNS)) {
    const sheet = raw.sheets.find(item => item.properties?.title === name);
    if (!sheet) throw new Error(`${name} タブがありません。`);
    const rows = sheet.data?.[0]?.rowData || [];
    const headers = (rows[0]?.values || []).map(cell => cell?.formattedValue || '');
    for (const field of fields) {
      const columns = headers.flatMap((header, index) => header === field ? [index] : []);
      if (columns.length !== 1) throw new Error(`${name} タブの ${field} 列が${columns.length ? '重複しています。' : 'ありません。'}`);
      const column = columns[0];
      for (let row = 1; row < rows.length; row++) {
        const cell = rows[row]?.values?.[column];
        const text = cell?.userEnteredValue?.stringValue;
        if (!text) continue;
        const numberValue = serial(text, `${name} タブの ${row + 1} 行目 ${field}`);
        requests.push({updateCells: {
          range: {sheetId: sheet.properties.sheetId, startRowIndex: row, endRowIndex: row + 1,
            startColumnIndex: column, endColumnIndex: column + 1},
          rows: [{values: [{userEnteredValue: {numberValue}}]}], fields: 'userEnteredValue'
        }});
        converted++;
      }
      requests.push({repeatCell: {
        range: {sheetId: sheet.properties.sheetId, startRowIndex: 1, startColumnIndex: column, endColumnIndex: column + 1},
        cell: {userEnteredFormat: {numberFormat: DATE_FORMAT}}, fields: 'userEnteredFormat.numberFormat'
      }});
    }
  }
  if (requests.length) await gateway.write(requests);
  return converted;
}

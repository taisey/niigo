import { randomUUID } from 'node:crypto';
import type {DataSnapshot} from '../web/api-generated/models/DataSnapshot.js';
import type {Sheet, SheetCell, SheetsGateway, Spreadsheet} from './sheets-types.js';

type SheetName = keyof DataSnapshot;
type SheetRecord = {_row: number; _cells: SheetCell[]; id: string; name: string; [field: string]: any};
type ParsedSheet = {sheetId: number; rowCount: number; columns: Record<string, number>; rows: SheetRecord[]};
type ParsedData = Record<SheetName, SheetRecord[]>;
type RefField = 'category' | 'round' | 'assignees';

export const COLUMNS = Object.freeze({
  Tasks: ['title', 'description', 'due_date', 'status', 'assignees', 'category', 'round', 'id', 'categoryId', 'assigneeIds', 'roundId'],
  Categories: ['id', 'name', 'description'],
  Rounds: ['id', 'name', 'description', 'start_date', 'end_date', 'status'],
  Members: ['id', 'name']
});
const TASK_STATUSES = ['Todo', 'In Progress', 'Done'];
const ROUND_STATUSES = ['Planned', 'Active', 'Closed'];
const REFS: Record<RefField, SheetName> = { category: 'Categories', round: 'Rounds', assignees: 'Members' };
const REF_ID_COLUMNS: Record<RefField, string> = { category: 'categoryId', round: 'roundId', assignees: 'assigneeIds' };

function readSheet(name: SheetName, sheet: Sheet | undefined): ParsedSheet {
  if (!sheet) throw new Error(`${name} タブがありません。`);
  const cells = sheet.data?.[0]?.rowData || [];
  const headers = (cells[0]?.values || []).map(cell => cell?.formattedValue || '');
  const columns: Record<string, number> = {};
  for (const field of COLUMNS[name]) {
    const positions = headers.flatMap((header, index) => header === field ? [index] : []);
    if (positions.length !== 1) throw new Error(`${name} タブのヘッダー「${field}」が${positions.length ? '重複しています。' : 'ありません。'}`);
    columns[field] = positions[0];
  }
  const rows = cells.slice(1).map((values, index) => {
    const row = {_row: index + 1, _cells: values?.values || []} as SheetRecord;
    for (const field of COLUMNS[name]) row[field] = values?.values?.[columns[field]]?.formattedValue || '';
    return row;
  }).filter(row => COLUMNS[name].some(field => field !== 'id' && !Object.values(REF_ID_COLUMNS).includes(field) && row[field]));
  const ids = new Set();
  for (const row of rows) {
    if (!row.id) throw new Error(`${name} タブの ${row._row + 1} 行目に ID がありません。`);
    if (ids.has(row.id)) throw new Error(`${name} タブに重複した ID があります: ${row.id}`);
    ids.add(row.id);
  }
  if (name !== 'Tasks') {
    const names = new Set();
    for (const row of rows) {
      if (!row.name.trim()) throw new Error(`${name} タブの ${row._row + 1} 行目に名前がありません。`);
      if (names.has(row.name.trim())) throw new Error(`${name} タブで名前が重複しています: ${row.name}`);
      names.add(row.name.trim());
    }
  }
  return { sheetId: sheet.properties.sheetId, rowCount: sheet.properties.gridProperties?.rowCount || 0, columns, rows };
}

function idsFor(cell: SheetCell | undefined, visible: string, masters: SheetRecord[], multiple: boolean): string[] {
  const labels = visible ? visible.split(',').map(name => name.trim()).filter(Boolean) : [];
  let ids: string[] | undefined;
  if (cell?.note?.startsWith('NIIGO:')) {
    try { ids = JSON.parse(cell.note.slice(6)); } catch { /* Use the displayed names. */ }
  }
  if (!Array.isArray(ids) || ids.some(id => !masters.some(master => master.id === id))) {
    ids = labels.map(label => {
      const master = masters.find(item => item.name === label);
      if (!master) throw new Error(`参照先が見つかりません: ${label}`);
      return master.id;
    });
  }
  if (!multiple && ids.length > 1) throw new Error('参照先は1件だけ選択してください。');
  return [...new Set(ids)];
}

export function parseSnapshot(raw: Spreadsheet): {sheets: Record<SheetName, ParsedSheet>; data: ParsedData} {
  const sheets = {} as Record<SheetName, ParsedSheet>;
  for (const name of Object.keys(COLUMNS) as SheetName[]) sheets[name] = readSheet(name, raw.sheets.find(sheet => sheet.properties?.title === name));
  for (const task of sheets.Tasks.rows) {
    for (const field of Object.keys(REFS) as RefField[]) {
      const master = REFS[field];
      try {
        const hidden = REF_ID_COLUMNS[field];
        if (task[hidden]) {
          const ids = field === 'assignees' ? JSON.parse(task[hidden]) : [task[hidden]];
          if (!Array.isArray(ids) || ids.some(id => !sheets[master].rows.some(record => record.id === id))) {
            throw new Error(`${hidden} が不正です。`);
          }
          task[`${field}Ids`] = ids;
        } else {
          task[`${field}Ids`] = idsFor(task._cells[sheets.Tasks.columns[field]], task[field], sheets[master].rows, field === 'assignees');
        }
      }
      catch (error) { throw new Error(`Tasks タブの ${task._row + 1} 行目: ${(error as Error).message}`); }
    }
  }
  const data = {} as ParsedData;
  for (const name of Object.keys(sheets) as SheetName[]) data[name] = sheets[name].rows.map(({_row, _cells, ...row}) => row as SheetRecord);
  return { sheets, data };
}

function date(value: string, label: string): string {
  if (!value) return '';
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label}は YYYY-MM-DD 形式で入力してください。`);
  }
  return value;
}

function validate(name: SheetName, item: Record<string, any>, data: ParsedData, current: SheetRecord | null) {
  if (name === 'Tasks') {
    if (!String(item.title || '').trim()) throw new Error('タスク名を入力してください。');
    if (!TASK_STATUSES.includes(item.status)) throw new Error('ステータスが不正です。');
    date(item.due_date, '期限');
    for (const field of Object.keys(REFS) as RefField[]) {
      const master = REFS[field];
      const ids = item[`${field}Ids`] || [];
      if (!Array.isArray(ids) || (field !== 'assignees' && ids.length > 1) || ids.some(id => !data[master].some(row => row.id === id))) {
        throw new Error(`${field} の参照先が不正です。`);
      }
    }
  } else {
    if (!String(item.name || '').trim()) throw new Error('名前を入力してください。');
    if (data[name].some(row => row.id !== current?.id && row.name === item.name.trim())) throw new Error('同じ名前が既にあります。');
    if (name === 'Rounds') {
      if (!ROUND_STATUSES.includes(item.status)) throw new Error('ステータスが不正です。');
      date(item.start_date, '開始日'); date(item.end_date, '終了日');
      if (item.start_date && item.end_date && item.start_date > item.end_date) throw new Error('終了日は開始日以降にしてください。');
      if (item.status === 'Active' && data.Rounds.some(row => row.id !== current?.id && row.status === 'Active')) throw new Error('進行中のラウンドは1つだけにしてください。');
      if (item.status === 'Closed' && current?.status !== 'Closed') throw new Error('ラウンド終了画面から未完了タスクの移動先を選んでください。');
    }
  }
}

function writeCell(sheet: ParsedSheet, row: number, field: string, value: unknown, note?: string) {
  const cell: {userEnteredValue: {stringValue: string}; note?: string} = {userEnteredValue: {stringValue: value == null ? '' : String(value)}};
  let fields = 'userEnteredValue';
  if (note !== undefined) { cell.note = note; fields += ',note'; }
  return { updateCells: {
    range: { sheetId: sheet.sheetId, startRowIndex: row, endRowIndex: row + 1,
      startColumnIndex: sheet.columns[field], endColumnIndex: sheet.columns[field] + 1 },
    rows: [{ values: [cell] }], fields
  } };
}

function rowFor(sheet: ParsedSheet, id: string): number {
  const matches = sheet.rows.filter(row => row.id === id);
  if (matches.length !== 1) throw new Error('更新対象を一意に特定できません。再読み込みしてください。');
  return matches[0]._row;
}

export class SheetStore {
  private queue: Promise<void> = Promise.resolve();
  constructor(private gateway: SheetsGateway) {}
  async read(): Promise<DataSnapshot> { return parseSnapshot(await this.gateway.read()).data as unknown as DataSnapshot; }
  async #exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { return await fn(); } finally { release(); }
  }
  async save(name: SheetName, item: Record<string, any>, expected: string): Promise<DataSnapshot> {
    if (!COLUMNS[name]) throw new Error('未対応のデータです。');
    return this.#exclusive(async () => {
      const {sheets, data} = parseSnapshot(await this.gateway.read());
      const current = item.id ? data[name].find(row => row.id === item.id) ?? null : null;
      if (item.id && !current) throw new Error('更新対象が見つかりません。再読み込みしてください。');
      if (current && JSON.stringify(current) !== expected) throw new Error('シートが変更されました。再読み込みしてから編集してください。');
      validate(name, item, data, current);
      const sheet = sheets[name];
      const row = current ? rowFor(sheet, item.id) : Math.max(1, ...sheet.rows.map(item => item._row + 1));
      const id = item.id || randomUUID();
      const requests = [];
      if (row >= sheet.rowCount) requests.push({appendDimension: {sheetId: sheet.sheetId, dimension: 'ROWS', length: row - sheet.rowCount + 1}});
      for (const field of COLUMNS[name]) {
        if (field === 'id' || Object.values(REF_ID_COLUMNS).includes(field) || field in REFS) continue;
        requests.push(writeCell(sheet, row, field, item[field] || ''));
      }
      if (name === 'Tasks') {
        for (const field of Object.keys(REFS) as RefField[]) {
          const master = REFS[field];
          const ids: string[] = item[`${field}Ids`] || [];
          requests.push(writeCell(sheet, row, field, ids.map(ref => data[master].find(record => record.id === ref)!.name).join(', '), ''));
          requests.push(writeCell(sheet, row, REF_ID_COLUMNS[field], field === 'assignees' && ids.length ? JSON.stringify(ids) : ids[0] || ''));
        }
      }
      if (!current) requests.push(writeCell(sheet, row, 'id', id));
      if (name !== 'Tasks' && current && current.name !== item.name) {
        const field = (Object.keys(REFS) as RefField[]).find(key => REFS[key] === name)!;
        for (const task of sheets.Tasks.rows) {
          if (!task[`${field}Ids`].includes(id)) continue;
          const names = task[`${field}Ids`].map((ref: string) => ref === id ? item.name : data[name].find(record => record.id === ref)!.name);
          requests.push(writeCell(sheets.Tasks, task._row, field, names.join(', '), ''));
        }
      }
      await this.gateway.write(requests);
      return this.read();
    });
  }
  async deleteTask(taskId: string, expected: string): Promise<DataSnapshot> {
    return this.#exclusive(async () => {
      const {sheets, data} = parseSnapshot(await this.gateway.read());
      const task = data.Tasks.find(item => item.id === taskId);
      if (!task) throw new Error('削除対象のタスクが見つかりません。再読み込みしてください。');
      if (JSON.stringify(task) !== expected) throw new Error('タスクが変更されました。再読み込みしてから削除してください。');
      const row = rowFor(sheets.Tasks, taskId);
      await this.gateway.write([{
        deleteDimension: {
          range: {sheetId: sheets.Tasks.sheetId, dimension: 'ROWS', startIndex: row, endIndex: row + 1}
        }
      }]);
      return this.read();
    });
  }
  async close(roundId: string, destinations: Record<string, string>, expected: string): Promise<DataSnapshot> {
    return this.#exclusive(async () => {
      const {sheets, data} = parseSnapshot(await this.gateway.read());
      const round = data.Rounds.find(item => item.id === roundId);
      if (!round || round.status === 'Closed') throw new Error('終了できるラウンドがありません。');
      if (JSON.stringify(round) !== expected) throw new Error('ラウンドが変更されました。再読み込みしてください。');
      const pending = sheets.Tasks.rows.filter(task => task.roundIds.includes(roundId) && task.status !== 'Done');
      const requests = [];
      for (const task of pending) {
        if (!Object.hasOwn(destinations, task.id)) throw new Error('全ての未完了タスクの移動先を選んでください。');
        const dest = destinations[task.id];
        if (dest && (!data.Rounds.some(item => item.id === dest && item.status !== 'Closed') || dest === roundId)) throw new Error('移動先のラウンドが不正です。');
        const label = dest ? data.Rounds.find(item => item.id === dest)!.name : '';
        requests.push(writeCell(sheets.Tasks, task._row, 'round', label, ''));
        requests.push(writeCell(sheets.Tasks, task._row, 'roundId', dest || ''));
      }
      requests.push(writeCell(sheets.Rounds, rowFor(sheets.Rounds, roundId), 'status', 'Closed'));
      await this.gateway.write(requests);
      return this.read();
    });
  }
}

const NIIGO = Object.freeze({
  Tasks: ['title', 'description', 'due_date', 'status', 'assignees', 'category', 'round', 'id', 'categoryId'],
  Categories: ['id', 'name', 'description'],
  Rounds: ['id', 'name', 'description', 'start_date', 'end_date', 'status'],
  Members: ['id', 'name']
});
const TASK_STATUSES = ['Todo', 'In Progress', 'Done'];
const ROUND_STATUSES = ['Planned', 'Active', 'Closed'];
const REF_COLUMNS = { category: 'Categories', round: 'Rounds', assignees: 'Members' };

function setup() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('対象のスプレッドシートに紐付けた Apps Script で setup() を実行してください。');
  const id = spreadsheet.getId();
  props.setProperty('SPREADSHEET_ID', id);
  Object.keys(NIIGO).forEach((name, index) => {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      sheet = index === 0 && spreadsheet.getSheets().length === 1 &&
        spreadsheet.getSheets()[0].getLastRow() === 0 ? spreadsheet.getSheets()[0] : spreadsheet.insertSheet(name);
      sheet.setName(name);
      sheet.getRange(1, 1, 1, NIIGO[name].length).setValues([NIIGO[name]]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, NIIGO[name].length).setFontWeight('bold');
    }
  });
  const taskSheet = spreadsheet.getSheetByName('Tasks');
  const taskHeaders = taskSheet.getRange(1, 1, 1, taskSheet.getLastColumn()).getDisplayValues()[0];
  if (!taskHeaders.includes('categoryId')) {
    const last = taskSheet.getLastColumn();
    taskSheet.insertColumnAfter(last);
    taskSheet.getRange(1, last + 1).setValue('categoryId');
  }
  spreadsheet.setActiveSheet(spreadsheet.getSheetByName('Tasks'));
  const task = schema_(spreadsheet.getSheetByName('Tasks'));
  task.sheet.hideColumns(task.columns.id);
  task.sheet.hideColumns(task.columns.categoryId);
  const protections = task.sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  const idProtection = protections.find(p => p.getDescription() === 'NIIGO ID');
  if (idProtection) idProtection.setWarningOnly(true);
  else {
    task.sheet.getRange(1, task.columns.id, task.sheet.getMaxRows()).protect()
      .setDescription('NIIGO ID').setWarningOnly(true);
  }
  const categoryIdProtection = protections.find(p => p.getDescription() === 'NIIGO categoryId');
  if (categoryIdProtection) categoryIdProtection.setWarningOnly(true);
  else {
    task.sheet.getRange(1, task.columns.categoryId, task.sheet.getMaxRows()).protect()
      .setDescription('NIIGO categoryId').setWarningOnly(true);
  }
  for (const name of ['Categories', 'Rounds', 'Members']) {
    const s = schema_(spreadsheet.getSheetByName(name));
    if (!s.sheet.isColumnHiddenByUser(s.columns.id)) s.sheet.hideColumns(s.columns.id);
    const existing = s.sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE)
      .find(p => p.getDescription() === 'NIIGO ID');
    if (existing) existing.setWarningOnly(true);
    else {
      s.sheet.getRange(1, s.columns.id, s.sheet.getMaxRows()).protect()
        .setDescription('NIIGO ID').setWarningOnly(true);
    }
  }
  // Repair rows that were added before the installable edit trigger existed.
  // This also makes setup a safe one-time recovery action for older sheets.
  ensureIds_(spreadsheet);
  backfillCategoryIds_(spreadsheet);
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (['sheetEdited', 'sheetOpened'].includes(trigger.getHandlerFunction())) ScriptApp.deleteTrigger(trigger);
  }
  ScriptApp.newTrigger('sheetEdited').forSpreadsheet(spreadsheet).onEdit().create();
  rebuildValidations_(spreadsheet);
  return { spreadsheetUrl: spreadsheet.getUrl(), spreadsheetId: id };
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('先に Apps Script の setup() を実行してください。');
  return SpreadsheetApp.openById(id);
}

function schema_(sheet) {
  if (!sheet) throw new Error('必要なタブがありません。');
  const name = sheet.getName();
  const required = NIIGO[name];
  if (!required) throw new Error('未対応のタブです: ' + name);
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0];
  const columns = {};
  required.forEach(header => {
    const positions = [];
    headers.forEach((value, i) => { if (value === header) positions.push(i + 1); });
    if (positions.length !== 1) {
      throw new Error(name + ' タブのヘッダー「' + header + '」が' +
        (positions.length ? '重複しています。' : 'ありません。'));
    }
    columns[header] = positions[0];
  });
  return { sheet, columns, name };
}

function allSchemas_(spreadsheet) {
  const result = {};
  Object.keys(NIIGO).forEach(name => { result[name] = schema_(spreadsheet.getSheetByName(name)); });
  return result;
}

function rows_(schema) {
  const last = schema.sheet.getLastRow();
  if (last < 2) return [];
  const values = schema.sheet.getRange(2, 1, last - 1, schema.sheet.getLastColumn()).getDisplayValues();
  return values.map((cells, i) => {
    const item = { _row: i + 2 };
    NIIGO[schema.name].forEach(key => { item[key] = cells[schema.columns[key] - 1] || ''; });
    return item;
  }).filter(item => NIIGO[schema.name].some(key => key !== 'id' && key !== 'categoryId' && item[key]));
}

function ensureIds_(spreadsheet) {
  for (const name of Object.keys(NIIGO)) {
    const schema = schema_(spreadsheet.getSheetByName(name));
    const last = schema.sheet.getLastRow();
    if (last < 2) continue;
    for (let row = 2; row <= last; row++) {
      const hasData = NIIGO[name].some(field => field !== 'id' && field !== 'categoryId' &&
        schema.sheet.getRange(row, schema.columns[field]).getDisplayValue().trim());
      const idCell = schema.sheet.getRange(row, schema.columns.id);
      if (hasData && !idCell.getDisplayValue().trim()) idCell.setValue(Utilities.getUuid());
    }
  }
}

function backfillCategoryIds_(spreadsheet) {
  const schemas = allSchemas_(spreadsheet);
  const categories = rows_(schemas.Categories);
  assertIds_(categories, 'Categories');
  uniqueNames_(categories, 'Categories');
  for (const task of rows_(schemas.Tasks)) {
    if (task.categoryId) continue;
    const cell = schemas.Tasks.sheet.getRange(task._row, schemas.Tasks.columns.category);
    const ids = referenceIds_(cell, task.category, categories, false);
    if (ids.length) schemas.Tasks.sheet.getRange(task._row, schemas.Tasks.columns.categoryId).setValue(ids[0]);
  }
}

function assertIds_(rows, name) {
  const seen = new Set();
  rows.forEach(row => {
    if (!row.id) throw new Error(name + ' タブの ' + row._row + ' 行目に ID がありません。');
    if (seen.has(row.id)) throw new Error(name + ' タブに重複した ID があります: ' + row.id);
    seen.add(row.id);
  });
}

function uniqueNames_(rows, name) {
  const seen = new Set();
  rows.forEach(row => {
    const value = row.name.trim();
    if (!value) throw new Error(name + ' タブの ' + row._row + ' 行目に名前がありません。');
    if (seen.has(value)) throw new Error(name + ' タブで名前が重複しています: ' + value);
    seen.add(value);
  });
}

function referenceIds_(cell, text, masters, multiple) {
  const note = cell.getNote();
  let ids = null;
  if (note.startsWith('NIIGO:')) {
    try { ids = JSON.parse(note.slice(6)); } catch (_) { /* Resolve visible text below. */ }
  }
  const visibleNames = text ? text.split(',').map(value => value.trim()).filter(Boolean) : [];
  if (!Array.isArray(ids) || ids.some(id => !masters.some(row => row.id === id))) {
    ids = visibleNames.map(name => {
      const found = masters.find(row => row.name === name);
      if (!found) throw new Error('参照先が見つかりません: ' + name);
      return found.id;
    });
  }
  if (!multiple && ids.length > 1) throw new Error('参照先は1件だけ選択してください。');
  return [...new Set(ids)];
}

function snapshot_() {
  const schemas = allSchemas_(spreadsheet_());
  const data = {};
  Object.keys(schemas).forEach(name => {
    data[name] = rows_(schemas[name]);
    assertIds_(data[name], name);
    if (name !== 'Tasks') uniqueNames_(data[name], name);
  });
  data.Tasks.forEach(task => {
    for (const [field, masterName] of Object.entries(REF_COLUMNS)) {
      const cell = schemas.Tasks.sheet.getRange(task._row, schemas.Tasks.columns[field]);
      try {
        if (field === 'category' && task.categoryId) {
          if (!data.Categories.some(category => category.id === task.categoryId)) throw new Error('カテゴリ ID が見つかりません: ' + task.categoryId);
          task.categoryIds = [task.categoryId];
        } else {
          task[field + 'Ids'] = referenceIds_(cell, task[field], data[masterName], field === 'assignees');
        }
      }
      catch (error) { throw new Error('Tasks タブの ' + task._row + ' 行目: ' + error.message); }
    }
  });
  Object.keys(data).forEach(name => data[name].forEach(row => { delete row._row; }));
  return data;
}

function getData() { return snapshot_(); }

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function findRow_(schema, id) {
  const matches = rows_(schema).filter(row => row.id === id);
  if (matches.length !== 1) throw new Error(schema.name + ' タブで ID を一意に特定できません: ' + id);
  return matches[0];
}

function validateDate_(value, label) {
  if (!value) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) {
    throw new Error(label + 'は YYYY-MM-DD 形式で入力してください。');
  }
  return value;
}

function validatePayload_(name, item, data, currentId) {
  if (name === 'Tasks') {
    if (!String(item.title || '').trim()) throw new Error('タスク名を入力してください。');
    if (!TASK_STATUSES.includes(item.status)) throw new Error('ステータスが不正です。');
    validateDate_(item.due_date, '期限');
    ['category', 'round', 'assignees'].forEach(field => {
      const ids = item[field + 'Ids'] || [];
      if (!Array.isArray(ids) || (field !== 'assignees' && ids.length > 1) ||
          ids.some(id => !data[REF_COLUMNS[field]].some(row => row.id === id))) {
        throw new Error(field + ' の参照先が不正です。');
      }
    });
  } else {
    if (!String(item.name || '').trim()) throw new Error('名前を入力してください。');
    if (data[name].some(row => row.id !== currentId && row.name === item.name.trim())) {
      throw new Error('同じ名前が既にあります。');
    }
    if (name === 'Rounds') {
      if (!ROUND_STATUSES.includes(item.status)) throw new Error('ステータスが不正です。');
      validateDate_(item.start_date, '開始日');
      validateDate_(item.end_date, '終了日');
      if (item.start_date && item.end_date && item.start_date > item.end_date) {
        throw new Error('終了日は開始日以降にしてください。');
      }
      if (item.status === 'Active' && data.Rounds.some(row => row.id !== currentId && row.status === 'Active')) {
        throw new Error('進行中のラウンドは1つだけにしてください。');
      }
    }
  }
}

function writeCell_(schema, row, field, value) {
  schema.sheet.getRange(row, schema.columns[field]).setValue(value == null ? '' : value);
}

function writeRefs_(schema, row, item, data) {
  for (const [field, masterName] of Object.entries(REF_COLUMNS)) {
    const ids = item[field + 'Ids'] || [];
    const cell = schema.sheet.getRange(row, schema.columns[field]);
    cell.setValue(ids.map(id => data[masterName].find(master => master.id === id).name).join(', '));
    if (field === 'category') {
      schema.sheet.getRange(row, schema.columns.categoryId).setValue(ids[0] || '');
      cell.setNote('');
    } else {
      cell.setNote(ids.length ? 'NIIGO:' + JSON.stringify(ids) : '');
    }
  }
}

function saveEntity(name, item, expected) {
  if (!NIIGO[name]) throw new Error('未対応のデータです。');
  return withLock_(() => {
    const spreadsheet = spreadsheet_();
    const schemas = allSchemas_(spreadsheet);
    const data = snapshot_();
    const id = item.id || Utilities.getUuid();
    const current = item.id ? data[name].find(row => row.id === id) : null;
    if (item.id && !current) throw new Error('更新対象が見つかりません。再読み込みしてください。');
    if (current && JSON.stringify(current) !== expected) {
      throw new Error('シートが変更されました。再読み込みしてから編集してください。');
    }
    if (name === 'Rounds' && current && current.status !== 'Closed' && item.status === 'Closed') {
      throw new Error('ラウンド終了画面から未完了タスクの移動先を選んでください。');
    }
    if (name === 'Rounds' && !current && item.status === 'Closed') {
      throw new Error('新しいラウンドを終了状態では作成できません。');
    }
    validatePayload_(name, item, data, id);
    const schema = schemas[name];
    const row = current ? findRow_(schema, id)._row : Math.max(schema.sheet.getLastRow() + 1, 2);
    NIIGO[name].filter(field => !['id', 'category', 'categoryId', 'round', 'assignees'].includes(field))
      .forEach(field => writeCell_(schema, row, field, item[field] || ''));
    if (name === 'Tasks') writeRefs_(schema, row, item, data);
    if (!current) writeCell_(schema, row, 'id', id);
    if (name !== 'Tasks' && current && current.name !== item.name) refreshReferences_(schemas, data, name, id, item.name);
    rebuildValidations_(spreadsheet);
    return snapshot_();
  });
}

function refreshReferences_(schemas, data, masterName, id, newName) {
  const field = Object.keys(REF_COLUMNS).find(key => REF_COLUMNS[key] === masterName);
  data.Tasks.forEach(task => {
    const ids = task[field + 'Ids'];
    if (!ids.includes(id)) return;
    const cell = schemas.Tasks.sheet.getRange(findRow_(schemas.Tasks, task.id)._row, schemas.Tasks.columns[field]);
    const names = ids.map(refId => refId === id ? newName : data[masterName].find(row => row.id === refId).name);
    cell.setValue(names.join(', '));
    if (field === 'category') cell.setNote('');
    else cell.setNote('NIIGO:' + JSON.stringify(ids));
  });
}

function closeRound(roundId, destinations, expected) {
  return withLock_(() => {
    const spreadsheet = spreadsheet_();
    const schemas = allSchemas_(spreadsheet);
    const data = snapshot_();
    const round = data.Rounds.find(item => item.id === roundId);
    if (!round || round.status === 'Closed') throw new Error('終了できるラウンドがありません。');
    if (JSON.stringify(round) !== expected) throw new Error('ラウンドが変更されました。再読み込みしてください。');
    const pending = data.Tasks.filter(task => task.roundIds.includes(roundId) && task.status !== 'Done');
    pending.forEach(task => {
      if (!Object.prototype.hasOwnProperty.call(destinations, task.id)) throw new Error('全ての未完了タスクの移動先を選んでください。');
      const dest = destinations[task.id];
      if (dest && (!data.Rounds.some(item => item.id === dest && item.status !== 'Closed') || dest === roundId)) {
        throw new Error('移動先のラウンドが不正です。');
      }
    });
    pending.forEach(task => {
      const row = findRow_(schemas.Tasks, task.id)._row;
      const dest = destinations[task.id];
      const cell = schemas.Tasks.sheet.getRange(row, schemas.Tasks.columns.round);
      cell.setValue(dest ? data.Rounds.find(item => item.id === dest).name : '');
      cell.setNote(dest ? 'NIIGO:' + JSON.stringify([dest]) : '');
    });
    writeCell_(schemas.Rounds, findRow_(schemas.Rounds, roundId)._row, 'status', 'Closed');
    return snapshot_();
  });
}

function rebuildValidations_(spreadsheet) {
  const schemas = allSchemas_(spreadsheet);
  const task = schemas.Tasks;
  const round = schemas.Rounds;
  const rows = task.sheet.getMaxRows() - 1;
  const roundRows = round.sheet.getMaxRows() - 1;
  const listRule = values => SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
  task.sheet.getRange(2, task.columns.status, rows).setDataValidation(listRule(TASK_STATUSES));
  round.sheet.getRange(2, round.columns.status, roundRows).setDataValidation(listRule(ROUND_STATUSES));
  task.sheet.getRange(2, task.columns.due_date, rows).setNumberFormat('yyyy-mm-dd');
  round.sheet.getRange(2, round.columns.start_date, roundRows).setNumberFormat('yyyy-mm-dd');
  round.sheet.getRange(2, round.columns.end_date, roundRows).setNumberFormat('yyyy-mm-dd');
  for (const [field, masterName] of Object.entries({category: 'Categories', round: 'Rounds'})) {
    const master = schemas[masterName];
    const source = master.sheet.getRange(2, master.columns.name, master.sheet.getMaxRows() - 1);
    task.sheet.getRange(2, task.columns[field], rows).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInRange(source, true).setAllowInvalid(false).build());
  }
}

function sheetEdited(e) {
  if (!e || !e.range || e.range.getRow() === 1) return;
  const sheet = e.range.getSheet();
  if (!NIIGO[sheet.getName()]) return;
  withLock_(() => {
    const spreadsheet = spreadsheet_();
    const schemas = allSchemas_(spreadsheet);
    const schema = schemas[sheet.getName()];
    const start = Math.max(2, e.range.getRow());
    const end = e.range.getLastRow();
    for (let row = start; row <= end; row++) {
      const values = NIIGO[schema.name].filter(field => field !== 'id' && field !== 'categoryId')
        .map(field => sheet.getRange(row, schema.columns[field]).getDisplayValue());
      if (!values.some(Boolean)) continue;
      const idCell = sheet.getRange(row, schema.columns.id);
      if (!idCell.getDisplayValue()) idCell.setValue(Utilities.getUuid());
    }
    const editedCol = e.range.getColumn();
    const single = e.range.getNumRows() === 1 && e.range.getNumColumns() === 1;
    if (single && schema.name === 'Rounds' && editedCol === schema.columns.status && e.value === 'Closed') {
      sheet.getRange(start, editedCol).setValue(e.oldValue || 'Planned');
      spreadsheet.toast('ラウンドを終了するには、Web 画面で未完了タスクの移動先を選んでください。');
    }
    if (schema.name === 'Tasks') {
      for (const field of Object.keys(REF_COLUMNS)) {
        if (schema.columns[field] < editedCol || schema.columns[field] >= editedCol + e.range.getNumColumns()) continue;
        if (field !== 'category' && !single) continue;
        const master = rows_(schemas[REF_COLUMNS[field]]);
        assertIds_(master, REF_COLUMNS[field]);
        uniqueNames_(master, REF_COLUMNS[field]);
        for (let row = start; row <= end; row++) {
          const cell = sheet.getRange(row, schema.columns[field]);
          const names = cell.getDisplayValue().split(',').map(s => s.trim()).filter(Boolean);
          if (field !== 'assignees' && names.length > 1) throw new Error('参照先は1件だけ選択してください。');
          const ids = names.map(name => {
            const found = master.find(item => item.name === name);
            if (!found) throw new Error('参照先が見つかりません: ' + name);
            return found.id;
          });
          if (field === 'category') {
            sheet.getRange(row, schema.columns.categoryId).setValue(ids[0] || '');
            cell.setNote('');
          } else {
            cell.setNote(ids.length ? 'NIIGO:' + JSON.stringify([...new Set(ids)]) : '');
          }
        }
      }
    }
    if (single && schema.name !== 'Tasks' && editedCol === schema.columns.name) {
      const id = sheet.getRange(start, schema.columns.id).getDisplayValue();
      const currentName = sheet.getRange(start, editedCol).getDisplayValue().trim();
      const masters = rows_(schema);
      if (!currentName || masters.some(item => item.id !== id && item.name === currentName)) {
        sheet.getRange(start, editedCol).setValue(e.oldValue || '');
        throw new Error('名前は必須で、重複できません。');
      }
      if (e.oldValue && e.oldValue !== currentName) {
        const field = Object.keys(REF_COLUMNS).find(key => REF_COLUMNS[key] === schema.name);
        for (const task of rows_(schemas.Tasks)) {
          const cell = schemas.Tasks.sheet.getRange(task._row, schemas.Tasks.columns[field]);
          const names = cell.getDisplayValue().split(',').map(value => value.trim()).filter(Boolean);
          if (!names.includes(e.oldValue)) continue;
          cell.setValue(names.map(name => name === e.oldValue ? currentName : name).join(', '));
        }
      }
      const data = snapshot_();
      refreshReferences_(schemas, data, schema.name, id, currentName);
    }
    if (!single && schema.name === 'Categories' &&
        schema.columns.name >= editedCol && schema.columns.name < editedCol + e.range.getNumColumns()) {
      const data = snapshot_();
      data.Categories.forEach(category => refreshReferences_(schemas, data, 'Categories', category.id, category.name));
    }
    rebuildValidations_(spreadsheet);
  });
}

// Generated from this file for the bound Apps Script project. Keep the source
// file ID in .env and run `npm run apps-script:bootstrap` after changing it.
const NIIGO_DYNAMIC_SOURCE_FILE_ID = '__NIIGO_APPS_SCRIPT_SOURCE_FILE_ID__';

function loadNiigoBundle_() {
  if (NIIGO_DYNAMIC_SOURCE_FILE_ID.startsWith('__')) {
    throw new Error('NIIGO_APPS_SCRIPT_SOURCE_FILE_ID を設定して apps-script:bootstrap を実行してください。');
  }
  const text = DriveApp.getFileById(NIIGO_DYNAMIC_SOURCE_FILE_ID).getBlob().getDataAsString('UTF-8');
  const bundle = JSON.parse(text);
  if (!bundle || typeof bundle.code !== 'string' || typeof bundle.sidebarHtml !== 'string') {
    throw new Error('NIIGO の動的ソースファイルの形式が正しくありません。');
  }
  return bundle;
}

function loadNiigoRuntime_() {
  const bundle = loadNiigoBundle_();
  return new Function(
    bundle.code + '\nreturn {' + [
      'setup', 'sheetEdited', 'rebuildValidations', 'getData', 'saveEntity',
      'closeRound', 'getSelectedTask', 'setSelectedAssignees'
    ].map(name => name + ': ' + name).join(',') + '};'
  )();
}

function callNiigo_(name, args) {
  const handler = loadNiigoRuntime_()[name];
  if (typeof handler !== 'function') throw new Error('NIIGO の処理が見つかりません: ' + name);
  return handler.apply(null, Array.from(args));
}

// Simple trigger: keep this self-contained because it cannot read Drive files.
function onOpen() {
  SpreadsheetApp.getUi().createMenu('NIIGO')
    .addItem('初期設定', 'setup')
    .addItem('担当者を選択', 'showAssignees')
    .addItem('ラウンドを終了', 'showRoundClose')
    .addItem('入力規則を更新', 'rebuildValidations')
    .addToUi();
}

function setup() { return callNiigo_('setup', arguments); }
function sheetEdited(e) { return callNiigo_('sheetEdited', [e]); }
function rebuildValidations() { return callNiigo_('rebuildValidations', arguments); }
function getData() { return callNiigo_('getData', arguments); }
function saveEntity(name, item, expected) { return callNiigo_('saveEntity', arguments); }
function closeRound(roundId, destinations, expected) {
  return callNiigo_('closeRound', arguments);
}
function getSelectedTask() { return callNiigo_('getSelectedTask', arguments); }
function setSelectedAssignees(taskId, ids) { return callNiigo_('setSelectedAssignees', arguments); }

function showSidebar_(mode, title) {
  const template = HtmlService.createTemplate(loadNiigoBundle_().sidebarHtml);
  template.mode = mode;
  SpreadsheetApp.getUi().showSidebar(template.evaluate().setTitle(title));
}

function showAssignees() { showSidebar_('assignees', '担当者を選択'); }
function showRoundClose() { showSidebar_('close', 'ラウンドを終了'); }

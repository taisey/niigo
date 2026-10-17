// Generated from this file for the bound Apps Script project.
// Run `npm run gas:bootstrap` after changing the source file ID in .env.
const NIIGO_DYNAMIC_SOURCE_FILE_ID = '__NIIGO_APPS_SCRIPT_SOURCE_FILE_ID__';

function loadNiigoBundle_() {
  if (NIIGO_DYNAMIC_SOURCE_FILE_ID.startsWith('__')) {
    throw new Error('.env に動的ソースの Drive ファイル ID を設定して gas:bootstrap を実行してください。');
  }
  const text = DriveApp.getFileById(NIIGO_DYNAMIC_SOURCE_FILE_ID).getBlob().getDataAsString('UTF-8');
  const bundle = JSON.parse(text);
  if (!bundle || typeof bundle.code !== 'string') {
    throw new Error('NIIGO の動的ソースファイルの形式が正しくありません。');
  }
  return bundle;
}

function loadNiigoRuntime_() {
  const bundle = loadNiigoBundle_();
  return new Function(
    bundle.code + '\nreturn {' + [
      'setup', 'sheetEdited', 'getData', 'saveEntity',
      'closeRound'
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
  SpreadsheetApp.getUi().createMenu('GAS')
    .addItem('初期設定', 'setup')
    .addToUi();
}

function setup() { return callNiigo_('setup', arguments); }
function sheetEdited(e) { return callNiigo_('sheetEdited', [e]); }
function getData() { return callNiigo_('getData', arguments); }
function saveEntity(name, item, expected) { return callNiigo_('saveEntity', arguments); }
function closeRound(roundId, destinations, expected) {
  return callNiigo_('closeRound', arguments);
}

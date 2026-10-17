import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { GoogleAuth } from 'google-auth-library';
import { GoogleSheetsGateway } from '../server/google-sheets-gateway.js';
import { ensureCategoryIdColumn } from '../server/category-id-migration.js';

const sourceFileId = process.env.NIIGO_APPS_SCRIPT_SOURCE_FILE_ID?.trim();
if (!sourceFileId) throw new Error('NIIGO_APPS_SCRIPT_SOURCE_FILE_ID is required in .env');
const spreadsheetId = process.env.NIIGO_SPREADSHEET_ID?.trim();
if (!spreadsheetId) throw new Error('NIIGO_SPREADSHEET_ID is required in .env');

let credentials;
try {
  credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '');
} catch {
  throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must contain a valid service account JSON value');
}
if (!credentials.client_email || !credentials.private_key) {
  throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key');
}

const code = await readFile(new URL('../apps-script/dynamic/Runtime.js', import.meta.url), 'utf8');

const requiredHandlers = [
  'setup', 'sheetEdited', 'getData', 'saveEntity',
  'closeRound'
];
for (const name of requiredHandlers) {
  if (!new RegExp(`function\\s+${name}\\s*\\(`).test(code)) {
    throw new Error(`Dynamic Apps Script is missing handler: ${name}`);
  }
}
new Function(code + `\nreturn {${requiredHandlers.join(',')}};`);

const bundle = JSON.stringify({ format: 1, code });
const sha256 = createHash('sha256').update(bundle).digest('hex');
const migration = await ensureCategoryIdColumn(new GoogleSheetsGateway(spreadsheetId, credentials));
console.log(`Checked Tasks.categoryId (${migration.created ? 'created' : 'existing'}, ${migration.backfilled} rows backfilled)`);
const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive'] });
const client = await auth.getClient();
const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(sourceFileId)}?uploadType=media`;
await client.request({
  url: uploadUrl,
  method: 'PATCH',
  data: bundle,
  headers: { 'Content-Type': 'application/json; charset=utf-8' }
});

const readback = await client.request({
  url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sourceFileId)}?alt=media`,
  method: 'GET',
  responseType: 'text'
});
const returnedText = typeof readback.data === 'string' ? readback.data : String(readback.data);
if (returnedText !== bundle) throw new Error('Drive source verification failed: uploaded content does not match');

console.log(`Updated Apps Script source file ${sourceFileId} (${sha256})`);

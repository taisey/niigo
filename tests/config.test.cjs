const test = require('node:test');
const assert = require('node:assert/strict');

test('reads a service account JSON value directly from the environment', async () => {
  const {readConfig} = await import('../server/config.js');
  const account = {client_email: 'niigo@example.iam.gserviceaccount.com', private_key: 'line 1\nline 2'};
  const config = readConfig({
    NIIGO_SPREADSHEET_ID: 'sheet-id',
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(account),
    PORT: '3100'
  });
  assert.equal(config.spreadsheetId, 'sheet-id');
  assert.deepEqual(config.serviceAccount, account);
  assert.equal(config.port, 3100);
});

test('rejects missing or invalid service account JSON before startup', async () => {
  const {readConfig} = await import('../server/config.js');
  assert.throws(() => readConfig({NIIGO_SPREADSHEET_ID: 'sheet-id'}), /GOOGLE_SERVICE_ACCOUNT_JSON を設定/);
  assert.throws(() => readConfig({NIIGO_SPREADSHEET_ID: 'sheet-id', GOOGLE_SERVICE_ACCOUNT_JSON: '{'}), /有効な JSON/);
  assert.throws(() => readConfig({NIIGO_SPREADSHEET_ID: 'sheet-id', GOOGLE_SERVICE_ACCOUNT_JSON: '{}'}), /client_email と private_key/);
});

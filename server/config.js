export function readConfig(env = process.env) {
  const spreadsheetId = env.NIIGO_SPREADSHEET_ID?.trim();
  if (!spreadsheetId) throw new Error('NIIGO_SPREADSHEET_ID を設定してください。');
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT は 1〜65535 の整数にしてください。');
  return { spreadsheetId, port, host: '127.0.0.1' };
}

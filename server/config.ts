export type ServiceAccount = {client_email: string; private_key: string; [key: string]: unknown};

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const spreadsheetId = env.NIIGO_SPREADSHEET_ID?.trim();
  if (!spreadsheetId) throw new Error('NIIGO_SPREADSHEET_ID を設定してください。');
  const rawCredentials = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!rawCredentials) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON を設定してください。');
  let serviceAccount: unknown;
  try { serviceAccount = JSON.parse(rawCredentials); }
  catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON は有効な JSON で指定してください。'); }
  if (!serviceAccount || typeof serviceAccount !== 'object' || Array.isArray(serviceAccount) ||
      !('client_email' in serviceAccount) || typeof serviceAccount.client_email !== 'string' ||
      !('private_key' in serviceAccount) || typeof serviceAccount.private_key !== 'string') {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON に client_email と private_key が必要です。');
  }
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT は 1〜65535 の整数にしてください。');
  return { spreadsheetId, serviceAccount: serviceAccount as ServiceAccount, port, host: '127.0.0.1' };
}

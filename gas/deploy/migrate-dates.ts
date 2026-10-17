import {GoogleSheetsGateway} from '../../server/sheets/google-sheets-gateway.js';
import {migrateDateCells} from './date-migration.js';

const spreadsheetId = process.env.NIIGO_SPREADSHEET_ID?.trim();
if (!spreadsheetId) throw new Error('NIIGO_SPREADSHEET_ID is required in .env');
let credentials;
try { credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || ''); }
catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must contain a valid service account JSON value'); }
if (!credentials.client_email || !credentials.private_key) {
  throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key');
}
const count = await migrateDateCells(new GoogleSheetsGateway(spreadsheetId, credentials));
console.log(`Converted ${count} text dates to Google Sheets dates`);

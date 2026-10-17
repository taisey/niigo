import {GoogleAuth} from 'google-auth-library';
import type {ServiceAccount} from './config.js';
import type {Spreadsheet} from './sheets-types.js';

export class GoogleSheetsGateway {
  constructor(private spreadsheetId: string, serviceAccount: ServiceAccount, private auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  })) {
  }

  async read(): Promise<Spreadsheet> {
    const query = new URLSearchParams({
      includeGridData: 'true',
      fields: 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)),data(rowData(values(formattedValue,note))))'
    });
    for (const name of ['Tasks', 'Categories', 'Rounds', 'Members']) query.append('ranges', `'${name}'`);
    const client = await this.auth.getClient();
    const {data} = await client.request<Spreadsheet>({url: `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}?${query}`});
    return data;
  }

  async write(requests: object[]): Promise<void> {
    const client = await this.auth.getClient();
    await client.request({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}:batchUpdate`,
      method: 'POST', data: {requests}
    });
  }
}

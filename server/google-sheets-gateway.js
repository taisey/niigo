import {GoogleAuth} from 'google-auth-library';

export class GoogleSheetsGateway {
  constructor(spreadsheetId, serviceAccount, auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  })) {
    this.spreadsheetId = spreadsheetId;
    this.auth = auth;
  }

  async read() {
    const query = new URLSearchParams({
      includeGridData: 'true',
      fields: 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)),data(rowData(values(formattedValue,note))))'
    });
    for (const name of ['Tasks', 'Categories', 'Rounds', 'Members']) query.append('ranges', `'${name}'`);
    const client = await this.auth.getClient();
    const {data} = await client.request({url: `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}?${query}`});
    return data;
  }

  async write(requests) {
    const client = await this.auth.getClient();
    await client.request({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}:batchUpdate`,
      method: 'POST', data: {requests}
    });
  }
}

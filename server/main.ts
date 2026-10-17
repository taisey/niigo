import {readConfig} from './config.js';
import {GoogleSheetsGateway} from './sheets/google-sheets-gateway.js';
import {SheetStore} from './sheets/store.js';
import {createApp} from './http/app.js';

const config = readConfig();
const store = new SheetStore(new GoogleSheetsGateway(config.spreadsheetId, config.serviceAccount));
createApp(store).listen(config.port, config.host, () => {
  console.log(`NIIGO: http://${config.host}:${config.port}`);
});

import {readConfig} from './config.js';
import {GoogleSheetsGateway} from './google-sheets-gateway.js';
import {SheetStore} from './store.js';
import {createApp} from './http.js';

const config = readConfig();
const store = new SheetStore(new GoogleSheetsGateway(config.spreadsheetId));
createApp(store).listen(config.port, config.host, () => {
  console.log(`NIIGO: http://${config.host}:${config.port}`);
});

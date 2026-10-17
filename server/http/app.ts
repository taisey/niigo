import {createServer, type ServerResponse} from 'node:http';
import type {SheetStore} from '../sheets/store.js';
import {serveAsset} from './assets.js';
import {routes} from './routes.js';

function send(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'});
  response.end(JSON.stringify(value));
}

export function createApp(store: SheetStore) {
  const apiRoutes = routes(store);
  return createServer(async (request, response) => {
    try {
      const path = new URL(request.url || '/', 'http://localhost').pathname;
      const route = apiRoutes.find(route => route.method === request.method && route.path.test(path));
      if (route) send(response, 200, await route.handle(request, path.match(route.path)!));
      else if (request.method !== 'GET' || !await serveAsset(path, response)) send(response, 404, {error: '見つかりません。'});
    } catch (error) {
      const failure = error as Error & {response?: unknown};
      const message = failure.message || '処理に失敗しました。';
      const status = failure.response ? 502 : /変更されました|再読み込み/.test(message) ? 409 : 400;
      send(response, status, {error: failure.response ? 'Google Sheets への接続に失敗しました。' : message});
    }
  });
}

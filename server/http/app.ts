import {createServer, type ServerResponse} from 'node:http';
import type {SheetStore} from '../sheets/store.js';
import {serveAsset} from './assets.js';
import {matchRoute} from './generated-routes.js';
import {handlers} from './handlers.js';

function send(response: ServerResponse, status: number, value: unknown) {
  const body = JSON.stringify(value);
  response.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'});
  response.end(body);
}

export function createApp(store: SheetStore) {
  const apiHandlers = handlers(store);
  return createServer(async (request, response) => {
    try {
      const path = new URL(request.url || '/', 'http://localhost').pathname;
      const route = matchRoute(request.method, path);
      if (route) send(response, 200, await apiHandlers[route.operationId](request, route.params));
      else if (request.method !== 'GET' || !await serveAsset(path, response)) send(response, 404, {error: '見つかりません。'});
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      const failure = error as Error & {response?: unknown};
      const message = failure.message || '処理に失敗しました。';
      const status = failure.response ? 502 : /変更されました|再読み込み/.test(message) ? 409 : 400;
      send(response, status, {error: failure.response ? 'Google Sheets への接続に失敗しました。' : message});
    }
  });
}

import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';

const assets = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8']
};

function send(response, status, value) {
  response.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'});
  response.end(JSON.stringify(value));
}

async function json(request) {
  let content = '';
  for await (const chunk of request) {
    content += chunk;
    if (content.length > 1024 * 1024) throw new Error('送信データが大きすぎます。');
  }
  try { return JSON.parse(content); }
  catch { throw new Error('JSON を読み取れません。'); }
}

export function createApp(store) {
  return createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      if (request.method === 'GET' && assets[path]) {
        const [filename, type] = assets[path];
        response.writeHead(200, {'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'});
        response.end(await readFile(new URL(`../web/${filename}`, import.meta.url)));
      } else if (request.method === 'GET' && path === '/api/data') {
        send(response, 200, await store.read());
      } else if (request.method === 'POST' && path === '/api/save') {
        const {name, item, expected} = await json(request);
        send(response, 200, await store.save(name, item, expected));
      } else if (request.method === 'POST' && path === '/api/rounds/close') {
        const {roundId, destinations, expected} = await json(request);
        send(response, 200, await store.close(roundId, destinations, expected));
      } else send(response, 404, {error: '見つかりません。'});
    } catch (error) {
      const message = error.message || '処理に失敗しました。';
      const status = error.response ? 502 : /変更されました|再読み込み/.test(message) ? 409 : 400;
      send(response, status, {error: error.response ? 'Google Sheets への接続に失敗しました。' : message});
    }
  });
}

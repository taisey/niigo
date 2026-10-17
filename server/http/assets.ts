import {readFile} from 'node:fs/promises';
import type {ServerResponse} from 'node:http';

const assets: Record<string, [URL, string]> = {
  '/': [new URL('../../../web/index.html', import.meta.url), 'text/html; charset=utf-8'],
  '/app.js': [new URL('../../web/app.js', import.meta.url), 'text/javascript; charset=utf-8'],
  '/style.css': [new URL('../../../web/style.css', import.meta.url), 'text/css; charset=utf-8']
};

export async function serveAsset(path: string, response: ServerResponse): Promise<boolean> {
  const asset = assets[path] ?? (path.match(/^\/api-client\/(?:index|(?:core|models|services)\/[A-Za-z][A-Za-z0-9]*)\.js$/)
    ? [new URL(`../../web/api-generated/${path.slice('/api-client/'.length)}`, import.meta.url), 'text/javascript; charset=utf-8'] as [URL, string]
    : undefined);
  if (!asset) return false;
  const [filename, type] = asset;
  let body: Buffer;
  try {
    body = await readFile(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
  response.writeHead(200, {'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'});
  response.end(body);
  return true;
}

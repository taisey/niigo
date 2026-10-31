import {readFile} from 'node:fs/promises';
import type {ServerResponse} from 'node:http';

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function asset(path: string): [URL, string] | undefined {
  if (path === '/') return [new URL('../../ui/index.html', import.meta.url), contentTypes['.html']];

  // Vite emits fingerprinted bundles under assets/ and copies these two public files.
  if (/^\/(?:assets\/)?[A-Za-z0-9._-]+\.(?:css|js|svg|woff2?)$/.test(path)) {
    const relativePath = path.slice(1);
    const extension = relativePath.slice(relativePath.lastIndexOf('.'));
    return [new URL(`../../ui/${relativePath}`, import.meta.url), contentTypes[extension]];
  }

  // The generated client is also used by the server tests and remains available to older clients.
  if (/^\/api-client\/(?:index|(?:core|models|services)\/[A-Za-z][A-Za-z0-9]*)\.js$/.test(path)) {
    return [new URL(`../../ui/api-generated/${path.slice('/api-client/'.length)}`, import.meta.url), contentTypes['.js']];
  }
  return undefined;
}

export async function serveAsset(path: string, response: ServerResponse): Promise<boolean> {
  const selected = asset(path);
  if (!selected) return false;
  const [filename, type] = selected;
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

import {readdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

async function sources(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  return (await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sources(path) : entry.name.endsWith('.ts') ? [path] : [];
  }))).flat();
}

for (const path of await sources('web/api-generated')) {
  const original = await readFile(path, 'utf8');
  const patched = original.replace(/(from ['"]\.{1,2}\/[A-Za-z0-9_/-]+)(['"])/g, '$1.js$2').replace(/\n+$/, '\n');
  if (patched !== original) await writeFile(path, patched);
}

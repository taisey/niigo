import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const sourceFileId = process.env.NIIGO_APPS_SCRIPT_SOURCE_FILE_ID?.trim();
if (!sourceFileId) throw new Error('NIIGO_APPS_SCRIPT_SOURCE_FILE_ID is required in .env');
if (!/^[a-zA-Z0-9_-]+$/.test(sourceFileId)) {
  throw new Error('NIIGO_APPS_SCRIPT_SOURCE_FILE_ID contains invalid characters');
}

const staticSource = await readFile(new URL('../apps-script/static/Code.js', import.meta.url), 'utf8');
const generatedCode = staticSource.replaceAll('__NIIGO_APPS_SCRIPT_SOURCE_FILE_ID__', sourceFileId);
if (generatedCode.includes('__NIIGO_APPS_SCRIPT_SOURCE_FILE_ID__')) {
  throw new Error('Failed to inject NIIGO_APPS_SCRIPT_SOURCE_FILE_ID');
}

const outputDir = new URL('../apps-script/deploy/', import.meta.url);
await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(new URL('Code.js', outputDir), generatedCode),
  writeFile(
    new URL('appsscript.json', outputDir),
    await readFile(new URL('../apps-script/static/appsscript.json', import.meta.url))
  )
]);

const claspPath = fileURLToPath(new URL('../node_modules/.bin/clasp', import.meta.url));
const result = spawnSync(claspPath, ['push', '--force'], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

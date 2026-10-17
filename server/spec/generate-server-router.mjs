import {readFile, writeFile} from 'node:fs/promises';
import yaml from 'js-yaml';

const spec = yaml.load(await readFile(new URL('./openapi.yaml', import.meta.url), 'utf8'));
const methods = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
const routes = [];
const operationIds = new Set();

for (const [path, item] of Object.entries(spec.paths || {})) {
  for (const [method, operation] of Object.entries(item)) {
    if (!methods.has(method)) continue;
    const operationId = operation.operationId;
    if (typeof operationId !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(operationId) || operationIds.has(operationId)) {
      throw new Error(`${method.toUpperCase()} ${path}: operationId がないか重複しています。`);
    }
    operationIds.add(operationId);
    const params = [];
    const pattern = path.split('/').map(segment => {
      const parameter = segment.match(/^\{([^{}]+)\}$/);
      if (parameter) {
        params.push(parameter[1]);
        return '([^/]+)';
      }
      if (/[{}]/.test(segment)) throw new Error(`${path}: パスパラメータの形式が不正です。`);
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('/');
    routes.push({method: method.toUpperCase(), pattern: `^${pattern}$`, operationId, params});
  }
}

if (!routes.length) throw new Error('OpenAPI 定義にルートがありません。');
const definitions = routes.map(route =>
  `  {method: ${JSON.stringify(route.method)}, pattern: new RegExp(${JSON.stringify(route.pattern)}), operationId: ${JSON.stringify(route.operationId)}, params: ${JSON.stringify(route.params)}}`
).join(',\n');
const output = `// Generated from server/spec/openapi.yaml. Do not edit.\n` +
  `const routes = [\n${definitions}\n] as const;\n\n` +
  `export type OperationId = typeof routes[number]['operationId'];\n\n` +
  `export function matchRoute(method: string | undefined, path: string): {operationId: OperationId; params: Record<string, string>} | undefined {\n` +
  `  for (const route of routes) {\n` +
  `    if (route.method !== method) continue;\n` +
  `    const match = route.pattern.exec(path);\n` +
  `    if (!match) continue;\n` +
  `    const params: Record<string, string> = {};\n` +
  `    route.params.forEach((name, index) => { params[name] = decodeURIComponent(match[index + 1]); });\n` +
  `    return {operationId: route.operationId, params};\n` +
  `  }\n` +
  `}\n`;
await writeFile(new URL('../http/generated-routes.ts', import.meta.url), output);

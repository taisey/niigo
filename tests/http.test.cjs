const test = require('node:test');
const assert = require('node:assert/strict');
const {once} = require('node:events');

test('serves the compiled TypeScript UI and routes data requests', async () => {
  const {createApp} = await import('../dist/server/http/app.js');
  const server = createApp({
    read: async () => ({Tasks: [], Categories: [], Rounds: [], Members: []}),
    save: async (name, item) => ({name, item}),
    close: async (roundId, destinations) => ({roundId, destinations}),
    deleteTask: async taskId => ({taskId}),
    reorderTask: async (taskId, beforeTaskId, group, groupId, expectedOrder) => ({taskId, beforeTaskId, group, groupId, expectedOrder})
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const root = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(root);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /src="\/app\.js"/);
    assert.match(html, /src="\/niigo-logo\.svg"/);
    assert.match(html, /href="\/favicon\.svg"/);
    for (const assetPath of ['/niigo-logo.svg', '/favicon.svg']) {
      const asset = await fetch(`${root}${assetPath}`);
      assert.equal(asset.status, 200);
      assert.equal(asset.headers.get('content-type'), 'image/svg+xml');
      assert.match(await asset.text(), /<svg\b/);
    }
    const script = await fetch(`${root}/app.js`);
    assert.match(await script.text(), /from '\/api-client\/index\.js'/);
    const client = await fetch(`${root}/api-client/index.js`);
    assert.equal(client.status, 200);
    assert.match(await client.text(), /DataService/);
    const service = await fetch(`${root}/api-client/services/DataService.js`);
    assert.equal(service.status, 200);
    assert.match(await service.text(), /class DataService/);
    const missingAsset = await fetch(`${root}/api-client/models/Nonexistent.js`);
    assert.equal(missingAsset.status, 404);
    const data = await fetch(`${root}/data`);
    assert.deepEqual(await data.json(), {Tasks: [], Categories: [], Rounds: [], Members: []});
    const save = await fetch(`${root}/save`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({name: 'Tasks', item: {title: '洗濯'}})});
    assert.deepEqual(await save.json(), {name: 'Tasks', item: {title: '洗濯'}});
    assert.equal((await fetch(`${root}/api/data`)).status, 404);
    const {OpenAPI, DataService, RoundsService, TasksService} = await import('../dist/web/api-generated/index.js');
    OpenAPI.BASE = root;
    assert.deepEqual(await DataService.getData(), {Tasks: [], Categories: [], Rounds: [], Members: []});
    assert.deepEqual(await DataService.saveEntity({requestBody: {name: 'Tasks', item: {title: '掃除', status: 'Todo'}, expected: ''}}), {name: 'Tasks', item: {title: '掃除', status: 'Todo'}});
    assert.deepEqual(await RoundsService.closeRound({requestBody: {roundId: 'round-1', destinations: {}, expected: ''}}), {roundId: 'round-1', destinations: {}});
    assert.deepEqual(await TasksService.deleteTask({taskId: 'task-1', requestBody: {expected: ''}}), {taskId: 'task-1'});
    const order = {taskId: 'task-2', beforeTaskId: 'task-1', group: 'Rounds', groupId: 'round-1', expectedOrder: ['task-1', 'task-2']};
    assert.deepEqual(await TasksService.reorderTask({requestBody: order}), order);
    OpenAPI.BASE = '';
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

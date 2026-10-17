const test = require('node:test');
const assert = require('node:assert/strict');
const {once} = require('node:events');

test('serves the compiled TypeScript UI and routes data requests', async () => {
  const {createApp} = await import('../dist/server/http.js');
  const server = createApp({
    read: async () => ({Tasks: [], Categories: [], Rounds: [], Members: []}),
    save: async (name, item) => ({name, item}),
    close: async (roundId, destinations) => ({roundId, destinations}),
    deleteTask: async taskId => ({taskId})
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const root = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(root);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /src="\/app\.js"/);
    const script = await fetch(`${root}/app.js`);
    assert.match(await script.text(), /from '\/api-client\/index\.js'/);
    const client = await fetch(`${root}/api-client/index.js`);
    assert.equal(client.status, 200);
    assert.match(await client.text(), /DataService/);
    const service = await fetch(`${root}/api-client/services/DataService.js`);
    assert.equal(service.status, 200);
    assert.match(await service.text(), /class DataService/);
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
    OpenAPI.BASE = '';
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const {once} = require('node:events');

test('serves the independent JavaScript UI and routes data requests', async () => {
  const {createApp} = await import('../server/http.js');
  const server = createApp({
    read: async () => ({Tasks: [], Categories: [], Rounds: [], Members: []}),
    save: async (name, item) => ({name, item}),
    close: async (roundId, destinations) => ({roundId, destinations})
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const root = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(root);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /src="\/app\.js"/);
    const script = await fetch(`${root}/app.js`);
    assert.match(await script.text(), /fetch\(path/);
    const data = await fetch(`${root}/api/data`);
    assert.deepEqual(await data.json(), {Tasks: [], Categories: [], Rounds: [], Members: []});
    const save = await fetch(`${root}/api/save`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({name: 'Tasks', item: {title: '洗濯'}})});
    assert.deepEqual(await save.json(), {name: 'Tasks', item: {title: '洗濯'}});
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

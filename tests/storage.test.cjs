const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createStore, KEY, RECOVERY } = require('../src/storage.cjs');
const state = n => JSON.stringify({ version: 2, config: { price: n }, activeId: '', plans: [] });
function memory(initial = null) {
  const data = new Map(initial === null ? [] : [[KEY, initial]]);
  return { data, getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, value); } };
}
test('rapid edits and import persist in order, with a backup before replacement', async () => {
  const adapter = memory(state(1));
  const writes = [];
  adapter.setItem = async (key, raw) => {
    await new Promise(resolve => setTimeout(resolve, raw === state(2) ? 20 : 1));
    writes.push(key); adapter.data.set(key, raw);
  };
  const store = createStore(adapter);
  await store.load();
  await Promise.all([store.save(state(2)), store.save(state(3)), store.replace(state(4))]);
  assert.equal(await store.raw(), state(4));
  assert.equal(await store.recovery(), state(3));
  assert.deepEqual(writes, [KEY, KEY, RECOVERY, KEY]);
  assert.equal(await createStore(adapter).load(), state(4));
});
test('corrupt existing data is preserved until explicit import', async () => {
  const adapter = memory('broken JSON');
  const store = createStore(adapter);
  await assert.rejects(store.load());
  await assert.rejects(store.save(state(1)));
  assert.equal(await store.raw(), 'broken JSON');
  await store.replace(state(2));
  assert.equal(await store.recovery(), 'broken JSON');
  assert.equal(await store.load(), state(2));
});
test('invalid import and recovery-write failure leave current data untouched', async () => {
  const adapter = memory(state(1));
  const store = createStore(adapter); await store.load();
  await assert.rejects(store.replace('{"version":999}'));
  assert.equal(await store.raw(), state(1));
  adapter.setItem = async () => { throw Error('Disk full'); };
  await assert.rejects(store.replace(state(2)), /Disk full/);
  assert.equal(await store.raw(), state(1));
});
test('a failed save does not poison later retries', async () => {
  const adapter = memory(state(1));
  const normalWrite = adapter.setItem;
  const store = createStore(adapter); await store.load();
  adapter.setItem = async () => { throw Error('Disk full'); };
  await assert.rejects(store.save(state(2)));
  adapter.setItem = normalWrite;
  await store.save(state(3));
  assert.equal(await store.raw(), state(3));
});

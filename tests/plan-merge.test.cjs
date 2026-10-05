const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../web/ledger.js');
const { createStore, KEY, MERGE_RECOVERY } = require('../src/storage.cjs');
const blank = (id, date = '2026-09-30') => ({ id, suggested: date, order: null, orderDate: '', items: [{ name: '', category: '其他', quantity: 1, unit: '件' }], amount: null, purchaseDate: '', actualService: '', bookingDate: '' });
const first = { id: 'first', accountId: '1', start: '2026-09-30', config: { start: '2026-09-30', count: 5, price: 65 }, rows: [
  { ...blank('paid'), amount: 60, purchaseDate: '2026-09-29', actualService: '2026-09-30', bookingDate: '2026-09-30', items: [{ name: '柔顺剂', category: '柔顺剂', quantity: 1, unit: '瓶' }] },
  ...[1, 2, 3, 4].map(i => blank('empty-' + i, '2026-10-' + String(i + 10))),
] };
const make = extra => ({ version: 3, activeAccount: '1', accounts: { '1': { config: { price: 99 }, activeId: 'duplicate' }, '2': { config: {}, activeId: 'partner' } }, plans: [structuredClone(first), { ...structuredClone(first), id: 'second', start: '2026-11-27' }, { ...structuredClone(first), id: 'partner', accountId: '2' }, { ...structuredClone(first), id: 'duplicate', rows: [blank('d0'), ...extra] }] });

test('same start merges only within an account and keeps earliest recorded round unchanged', () => {
  const raw = make([]), original = structuredClone(raw);
  const result = L.mergeDuplicatePlans(raw);
  assert.deepEqual(raw, original, 'migration must not mutate its input');
  assert.deepEqual(result.plans.map(p => p.id), ['first', 'second', 'partner']);
  assert.deepEqual(result.plans[0], first);
  assert.deepEqual(result.plans[2], raw.plans[2], 'partner is isolated');
  assert.equal(result.accounts['1'].activeId, 'first');
  assert.deepEqual(result.accounts['1'].config, first.config);
  assert.deepEqual(L.mergeDuplicatePlans(result), result, 'idempotent');
});
test('conflicting data and zero-cost or name-only drafts survive without overwriting originals', () => {
  const conflict = { ...blank('paid'), amount: 19, purchaseDate: '2026-09-29', items: [{ name: '牙刷', category: '其他', quantity: 1, unit: '件' }] };
  const zero = { ...blank('zero', '2026-10-11'), amount: 0 };
  const draft = { ...blank('draft', '2026-10-12'), items: [{ name: '待购买纸巾', category: '其他', quantity: 1, unit: '件' }] };
  const result = L.mergeDuplicatePlans(make([conflict, zero, draft]));
  assert.deepEqual(result.plans[0].rows[0], first.rows[0]);
  assert.equal(result.plans[0].rows.length, 6, 'conflicting record is retained beyond generated five rows');
  assert.equal(L.summary(result.plans[0].rows).spent, 79);
  assert.equal(result.plans[0].rows.find(r => r.id === 'zero').amount, 0);
  assert.equal(result.plans[0].rows.find(r => r.id === 'draft').items[0].name, '待购买纸巾');
  const retained = result.plans[0].rows.find(r => r.amount === 19);
  assert.notEqual(retained.id, first.rows[0].id, 'colliding IDs must stay editable independently');
  const { id, mergedFromPlanId, ...contents } = retained;
  assert.equal(mergedFromPlanId, 'duplicate');
  assert.deepEqual(contents, Object.fromEntries(Object.entries(conflict).filter(([key]) => key !== 'id')));
  L.validateState(result);
});
test('copied rows with identical identity and data are not counted twice', () => {
  const result = L.mergeDuplicatePlans(make([structuredClone(first.rows[0])]));
  assert.deepEqual(result.plans[0], first);
});
test('native save preserves a raw pre-merge backup and stops if backing up fails', async () => {
  const raw = JSON.stringify(make([])), merged = JSON.stringify(L.mergeDuplicatePlans(JSON.parse(raw)));
  const values = new Map([[KEY, raw]]);
  const adapter = { getItem: async k => values.get(k) ?? null, setItem: async (k, v) => { values.set(k, v); } };
  const store = createStore(adapter); await store.load(); await store.save(merged);
  assert.equal(values.get(MERGE_RECOVERY), raw); assert.equal(values.get(KEY), merged);
  values.set(KEY, raw);
  adapter.setItem = async () => { throw Error('disk full'); };
  await assert.rejects(store.save(merged), /disk full/);
  assert.equal(values.get(KEY), raw);
});

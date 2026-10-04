// Runs the bundled page and native-storage protocol in an offline mobile browser.
// Real iPhone checks are still required for WKWebView, file picker and sharing.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createStore } = require('../src/storage.cjs');
const template = require('../src/page.generated.json');
const js = value => JSON.stringify(value).replace(/</g, '\\u003c');
const output = path.resolve(__dirname, '../test-results');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, offline: true });
    const page = await context.newPage();
    const failures = [], requests = [], data = new Map();
    page.on('pageerror', e => failures.push(e.message));
    page.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
    const store = createStore({ getItem: async k => data.get(k) ?? null, setItem: async (k, v) => { data.set(k, v); } });
    let exported = null;
    await page.exposeFunction('nativeMessage', async text => {
      const { type, id, payload } = JSON.parse(text);
      if (type === 'save') {
        await store.save(payload);
        await page.evaluate(({ id }) => window.phoneReply(id, null), { id });
      } else if (type === 'replace') {
        await store.replace(payload);
        await page.evaluate(raw => window.phoneCommitImport(raw), payload);
      } else if (type === 'export') exported = payload;
    });
    async function boot() {
      const initial = await store.load();
      const bootstrap = `window.PHONE_INITIAL=${js(initial)};window.ReactNativeWebView={postMessage:raw=>window.nativeMessage(raw)};`;
      await page.setContent(template.replace('/*PHONE_BOOTSTRAP*/', () => bootstrap));
      await page.getByText('已保存到此手机', { exact: true }).waitFor();
    }
    await boot();
    assert.equal(await page.locator('.booking').count(), 5);
    const first = page.locator('.booking').first();
    await first.locator('[data-key="name"]').fill('测试牙膏');
    assert.equal(await first.locator('[data-key="quantity"], [data-key="category"], [data-key="unit"]').count(), 0);
    await first.locator('[data-field="amount"]').fill('65');
    await first.locator('[data-field="purchaseInput"]').fill('2026-09-29');
    await first.locator('[data-action="save-purchase"]').click();
    await page.getByText('已保存到此手机', { exact: true }).waitFor();
    await first.locator('.purchase-area').screenshot({ path: path.join(output, 'name-only-390.png') });
    await first.locator('[data-action="confirm-suggested"]').click();
    await page.getByText('已保存到此手机', { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('.status-pill')?.textContent === '已上门');
    const saved = JSON.parse(await store.raw());
    assert.equal(saved.plans[0].rows[0].amount, 65);
    assert.equal(saved.plans[0].rows[0].items[0].name, '测试牙膏');
    assert.equal(saved.plans[0].rows[0].actualService, '2026-09-30');
    await page.screenshot({ path: path.join(output, 'iphone-390.png'), fullPage: false });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    // Simulate a new WebView using only native persisted data while networking is off.
    await page.goto('about:blank');
    await boot();
    assert((await page.locator('#metrics').innerText()).includes('¥65.00'));
    await page.locator('#export').click();
    await page.waitForTimeout(100);
    assert.deepEqual(JSON.parse(exported), saved);
    const changed = structuredClone(saved);
    changed.plans[0].rows[0].items[0].name = '</script><script>window.hacked=true</script>';
    await page.evaluate(raw => window.phoneImport(raw), JSON.stringify(changed));
    await page.locator('#cancelImport').click();
    assert.deepEqual(JSON.parse(await store.raw()), saved);
    await page.evaluate(raw => window.phoneImport(raw), JSON.stringify(changed));
    await page.locator('#confirmImport').click();
    await page.waitForFunction(() => !document.body.inert);
    assert.equal(JSON.parse(await store.raw()).plans[0].rows[0].items[0].name, changed.plans[0].rows[0].items[0].name);
    assert.deepEqual(JSON.parse(await store.recovery()), saved);
    await page.goto('about:blank'); await boot();
    assert.equal(await page.evaluate(() => window.hacked), undefined);
    const beforeInvalid = await store.raw();
    await page.evaluate(() => window.phoneImport('{"version":999}'));
    assert.equal(await store.raw(), beforeInvalid);
    assert.equal(await page.locator('#importDialog').evaluate(el => el.open), false);
    for (const width of [320, 375, 430]) {
      await page.setViewportSize({ width, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow at ${width}px`);
    }
    assert.deepEqual(requests, []);
    assert.deepEqual(failures, []);
    console.log('PASS: offline page, purchase/service records, persisted reopen, JSON export/import/cancel, recovery backup, script escaping, 320–430px layout, zero HTTP requests');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

// Exercise account isolation and legacy migration through the real offline page.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createStore, KEY } = require('../src/storage.cjs');
const template = require('../src/page.generated.json');
const defaults = { start: '2026-09-30', span: 60, count: 5, min: 1, max: 3, wait: 9, valid: 7, price: 65, buffer: 1, avoidWeekend: true, avoidHoliday: true, history: '', excluded: '' };
const legacyConfig = { ...defaults, start: '2026-09-19', count: 3, price: 70 };
const legacy = { version: 2, config: legacyConfig, activeId: 'old-plan', plans: [{
  id: 'old-plan', start: legacyConfig.start, config: legacyConfig,
  rows: ['2026-09-19', '2026-09-22', '2026-09-25'].map((date, i) => ({
    id: 'old-row-' + i, suggested: date, order: null, orderDate: '',
    items: [{ name: '原有牙膏', category: '牙膏', quantity: 1, unit: '支' }],
    amount: i === 0 ? 65 : null, purchaseDate: i === 0 ? date : '',
    actualService: date, bookingDate: date,
  })),
}] };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, offline: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const data = new Map([[KEY, JSON.stringify(legacy)]]);
    const store = createStore({ getItem: async key => data.get(key) ?? null, setItem: async (key, raw) => { data.set(key, raw); } });
    let exported;
    await page.exposeFunction('nativeMessage', async raw => {
      const { type, payload, id } = JSON.parse(raw);
      if (type === 'save') { await store.save(payload); await page.evaluate(id => window.phoneReply(id, null), id); }
      if (type === 'replace') { await store.replace(payload); await page.evaluate(raw => window.phoneCommitImport(raw), payload); }
      if (type === 'export') exported = payload;
    });
    const saved = () => page.getByText('已保存到此手机', { exact: true }).waitFor();
    async function boot() {
      const raw = await store.load();
      const bootstrap = `window.PHONE_INITIAL=${JSON.stringify(raw).replace(/</g, '\\u003c')};window.ReactNativeWebView={postMessage:raw=>window.nativeMessage(raw)};`;
      await page.setContent(template.replace('/*PHONE_BOOTSTRAP*/', () => bootstrap));
      await saved();
    }
    async function switchTo(id) { await page.locator(`[data-account="${id}"]`).click(); await saved(); }
    async function importBackup(value) {
      await page.evaluate(raw => window.phoneImport(raw), JSON.stringify(value));
      await page.locator('#confirmImport').click();
      await page.waitForFunction(() => !document.body.inert);
      await saved();
    }
    await boot();
    assert.equal(await page.locator('.booking').count(), 3);
    assert.match(await page.locator('#metrics').innerText(), /¥65\.00/);
    await switchTo('2');
    assert.equal(await page.locator('.booking').count(), 0, 'no stale cards from account one');
    assert.equal(await page.locator('#planSelect').isVisible(), false);
    assert.equal(await page.locator('#settingsDetails').getAttribute('open'), '');
    assert.equal(await page.locator('#price').inputValue(), '65', 'account two starts with independent settings');
    const migrated = JSON.parse(await store.raw());
    assert.equal(migrated.version, 3);
    assert.deepEqual(migrated.plans[0].rows, legacy.plans[0].rows, 'legacy records preserved exactly');
    await page.locator('#form button[type=submit]').click(); await saved();
    let second = JSON.parse(await store.raw()).plans.find(p => p.accountId === '2');
    assert.equal(second.rows[0].suggested, '2026-09-30', 'other account history must not delay the plan');
    assert.doesNotMatch(await page.locator('#planWarnings').innerText(), /次数冲突/, 'other account history must not trigger a limit warning');
    const first = page.locator('.booking').first();
    await first.locator('[data-key=name]').fill('原有牙膏');
    await first.locator('[data-field=amount]').fill('35');
    await first.locator('[data-field=purchaseInput]').fill('2026-09-29');
    await first.locator('[data-action=save-purchase]').click(); await saved();
    await first.locator('[data-action=confirm-suggested]').click(); await saved();
    assert.match(await page.locator('#metrics').innerText(), /¥100\.00/);
    assert.equal(await page.locator('#products .stock').count(), 1, 'same product name merges across accounts');
    assert.match(await page.locator('#products').innerText(), /原有牙膏/);
    assert.match(await first.locator('[data-duplicate]').textContent(), /原有牙膏/, 'household duplicate reminders span both accounts');
    await switchTo('1');
    assert.equal(await page.locator('.booking').count(), 3);
    assert.match(await page.locator('#metrics').innerText(), /¥100\.00/, 'switching does not filter family spending');
    assert.equal(await page.locator('#price').inputValue(), '70');
    await page.locator('#settingsDetails>summary').click();
    await page.locator('#start').fill('2026-12-01');
    await page.locator('#count').fill('2');
    await page.locator('#form>.help>summary').click();
    await page.locator('#price').fill('80');
    await page.locator('#form button[type=submit]').click(); await saved();
    const selected = await page.locator('#planSelect').inputValue();
    assert.equal(await page.locator('#planSelect option').count(), 2);
    await switchTo('2');
    assert.equal(await page.locator('#planSelect option').count(), 1);
    assert.equal(await page.locator('#price').inputValue(), '65');
    await switchTo('1');
    assert.equal(await page.locator('#planSelect').inputValue(), selected, 'selected plan remembered per account');
    assert.equal(await page.locator('#price').inputValue(), '80');
    await switchTo('2');
    await page.goto('about:blank'); await boot();
    assert.equal(await page.locator('[data-account="2"]').getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('#metrics').innerText(), /¥100\.00/);
    await page.locator('#export').click();
    await page.waitForTimeout(100);
    const both = JSON.parse(exported);
    assert.equal(both.plans.length, 3);
    assert.deepEqual(both, JSON.parse(await store.raw()));
    await importBackup(both);
    assert.deepEqual(JSON.parse(await store.raw()), both, 'dual-account backup round trip');
    const bad = structuredClone(both);
    bad.accounts['2'].activeId = bad.accounts['1'].activeId;
    await page.evaluate(raw => window.phoneImport(raw), JSON.stringify(bad));
    assert.equal(await page.locator('#importDialog').evaluate(el => el.open), false);
    assert.deepEqual(JSON.parse(await store.raw()), both);
    fs.mkdirSync('test-results', { recursive: true });
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => { scrollTo(0, 0); document.getElementById('toast').textContent = ''; });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `test-results/accounts-${width}.png` });
    }
    await importBackup(legacy);
    assert.equal(JSON.parse(await store.raw()).version, 3, 'old backups also migrate on import');
    assert.deepEqual(JSON.parse(await store.recovery()), both, 'old import preserves both accounts in recovery');
    await switchTo('2');
    assert.equal(await page.locator('.booking').count(), 0);
    assert.match(await page.locator('#metrics').innerText(), /¥65\.00/);
    assert.deepEqual(errors, []);
    console.log('PASS: legacy migration/import, separate plans/settings/history/limits, combined spending/products, selection persistence, dual-account backup/recovery, narrow layouts');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

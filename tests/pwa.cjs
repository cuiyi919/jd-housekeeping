// Real service-worker lifecycle, storage, import failure and offline browser checks.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const KEY = 'jd-housekeeping-ledger-v2';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

(async () => {
  execFileSync(process.execPath, ['scripts/build-pwa.cjs'], { cwd: root });
  const initialVersion = fs.readFileSync(path.join(root, 'dist/pwa/sw.js'), 'utf8').match(/const CACHE = PREFIX \+ '([^']+)'/)[1];
  let revision = 1, failInstall = false;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/jd-housekeeping/')) { res.writeHead(404).end(); return; }
    const name = url.pathname.slice('/jd-housekeeping/'.length) || 'index.html';
    if (!['index.html', 'sw.js', 'manifest.webmanifest', 'icon.png', 'apple-touch-icon.png'].includes(name)) { res.writeHead(404).end(); return; }
    if (failInstall && name === 'icon.png') { res.writeHead(503).end(); return; }
    let data = fs.readFileSync(path.join(root, 'dist/pwa', name));
    if (revision > 1 && ['index.html', 'sw.js'].includes(name)) {
      data = Buffer.from(data.toString().replaceAll(initialVersion, `test-update-${revision}`));
      if (name === 'sw.js') data = Buffer.from(data.toString() + `\n// fixture revision ${revision}\n`);
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(name)], 'Cache-Control': 'no-store' }); res.end(data);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/jd-housekeeping/`;
  const browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
    await context.addInitScript(() => { Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }); });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    context.on('page', next => next.on('pageerror', e => errors.push(e.message)));
    const read = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    await page.goto(url);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    assert.match(await page.locator('#offlineState').innerText(), /离线可用/);
    assert.equal(await page.locator('.booking').count(), 5);
    const manifest = await (await fetch(url + 'manifest.webmanifest')).json();
    assert.equal(new URL(manifest.start_url, url).href, url);
    const cacheUrls = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(r => r.url)))).flat());
    assert(cacheUrls.every(u => u.startsWith(url)), 'cache scope stays inside project path');

    for (const [account, amount] of [['1', '60'], ['2', '35']]) {
      await page.locator(`[data-account="${account}"]`).click();
      if (account === '2') await page.locator('#form button[type=submit]').click();
      const row = page.locator('.booking').first();
      await row.locator('[data-key=name]').fill('牙膏');
      await row.locator('[data-field=amount]').fill(amount);
      await row.locator('[data-field=purchaseInput]').fill('2026-09-29');
      await row.locator('[data-action=save-purchase]').click();
    }
    assert.match(await page.locator('#metrics').innerText(), /¥95\.00/);
    assert.equal((await read()).plans.length, 2);
    await context.setOffline(true);
    await page.reload();
    assert.match(await page.locator('#offlineState').innerText(), /当前离线/);
    assert.match(await page.locator('#metrics').innerText(), /¥95\.00/);
    await page.locator('.booking').first().locator('[data-key=name]').fill('离线牙膏');
    const before = await read();
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto(url);
    assert.match(await reopened.locator('#products').innerText(), /离线牙膏/);
    await reopened.close();
    const exportPage = await context.newPage();
    await exportPage.goto(url);
    const downloadEvent = exportPage.waitForEvent('download');
    await exportPage.locator('#export').click();
    const download = await downloadEvent;
    assert.deepEqual(JSON.parse(fs.readFileSync(await download.path(), 'utf8')), before);

    // Import a compatible native backup through the real browser file picker.
    const imported = structuredClone(before);
    imported.activeAccount = '1'; imported.plans[0].rows[0].amount = 80;
    async function chooseBackup(value) {
      await exportPage.locator('#importFile').setInputFiles({ name: 'native-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
    }
    await chooseBackup(imported);
    await exportPage.locator('#confirmImport').click();
    assert.deepEqual(await exportPage.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), imported);
    assert.deepEqual(await exportPage.evaluate(key => JSON.parse(localStorage.getItem(key + '-before-import')), KEY), before);
    await chooseBackup({ version: 999 });
    assert.equal(await exportPage.locator('#importDialog').evaluate(el => el.open), false);

    await chooseBackup(before);
    await exportPage.evaluate(key => {
      window.originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k, v) { if (k === key) throw new DOMException('full', 'QuotaExceededError'); return window.originalSetItem.call(this, k, v); };
    }, KEY);
    await exportPage.locator('#confirmImport').click();
    assert.deepEqual(await exportPage.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), imported, 'failed import preserves prior data');
    assert.match(await exportPage.locator('#toast').innerText(), /导入未完成/);
    await exportPage.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
    await exportPage.locator('#cancelImport').click();
    await context.setOffline(false);

    // A failed upgrade must not evict the working offline shell.
    revision = 2; failInstall = true;
    await exportPage.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const finished = new Promise(resolve => reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker.addEventListener('statechange', () => { if (worker.state === 'redundant') resolve(); });
      }, { once: true }));
      await reg.update(); await finished;
    });
    await context.setOffline(true);
    await exportPage.reload();
    assert.match(await exportPage.locator('#metrics').innerText(), /¥115\.00/);
    await context.setOffline(false);
    failInstall = false; revision = 3;
    await exportPage.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await exportPage.locator('#updatePwa').waitFor({ state: 'visible' });
    exportPage.once('dialog', dialog => dialog.accept());
    await exportPage.locator('#updatePwa').click();
    await exportPage.waitForFunction(() => document.getElementById('pwaVersion').textContent === 'test-update-3');
    assert.deepEqual(await exportPage.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), imported, 'upgrade preserves ledger');
    await context.setOffline(true);
    await exportPage.reload();
    assert.match(await exportPage.locator('#metrics').innerText(), /¥115\.00/);
    for (const width of [320, 390, 430]) {
      await exportPage.setViewportSize({ width, height: 844 });
      await exportPage.evaluate(() => scrollTo(0, 0));
      assert(await exportPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no overflow at ${width}px`);
      fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
      await exportPage.screenshot({ path: path.join(root, `test-results/pwa-${width}.png`) });
    }
    // Reported regression: generate A, then B, then A while B is selected.
    const originalPlan = structuredClone(imported.plans[0]);
    await exportPage.locator('#settingsDetails>summary').click();
    await exportPage.locator('#start').fill('2026-11-27');
    await exportPage.locator('#form button[type=submit]').click();
    assert.equal(await exportPage.locator('#planSelect option').count(), 2);
    await exportPage.locator('#start').fill(originalPlan.start);
    await exportPage.locator('#count').fill('1');
    await exportPage.locator('#form button[type=submit]').click();
    assert.equal(await exportPage.locator('#planSelect option').count(), 2, 'no third round for the original date');
    assert.equal(await exportPage.locator('#planSelect').inputValue(), originalPlan.id);
    const generated = await exportPage.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    assert.deepEqual(generated.plans[0], originalPlan, 'generation preserves every original record and setting');
    assert.deepEqual(generated.plans.find(p => p.accountId === '2'), imported.plans.find(p => p.accountId === '2'));

    // Existing installations may already contain an empty third round.
    const duplicate = structuredClone(originalPlan);
    duplicate.id = 'old-duplicate';
    duplicate.rows = duplicate.rows.map((r, i) => ({ ...r, id: 'duplicate-' + i, amount: null, purchaseDate: '', actualService: '', bookingDate: '', items: [{ name: '', category: '其他', quantity: 1, unit: '件' }] }));
    generated.plans.push(duplicate); generated.accounts['1'].activeId = duplicate.id;
    const preMerge = JSON.stringify(generated);
    await exportPage.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: KEY, raw: preMerge });
    await exportPage.reload();
    assert.equal(await exportPage.locator('#planSelect option').count(), 2);
    assert.equal(await exportPage.locator('#planSelect').inputValue(), originalPlan.id);
    assert.deepEqual((await exportPage.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY)).plans[0], originalPlan);
    assert.equal(await exportPage.evaluate(key => localStorage.getItem(key + '-before-plan-merge'), KEY), preMerge);
    await exportPage.reload();
    assert.equal(await exportPage.locator('#planSelect option').count(), 2, 'migration survives offline reopening');
    const backupSection = exportPage.locator('details').filter({ has: exportPage.locator('#recoverPlanMerge') });
    await backupSection.locator(':scope > summary').click();
    const mergeDownload = exportPage.waitForEvent('download');
    await exportPage.locator('#recoverPlanMerge').click();
    assert.equal(fs.readFileSync(await (await mergeDownload).path(), 'utf8'), preMerge);
    // An import of an old backup must consolidate again without modifying its records.
    await chooseBackup(generated); await exportPage.locator('#confirmImport').click();
    assert.equal(await exportPage.locator('#planSelect option').count(), 2);
    assert.deepEqual((await exportPage.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY)).plans[0], originalPlan);
    await exportPage.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: KEY, raw: preMerge });
    await exportPage.addInitScript(() => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key.endsWith('-before-plan-merge')) throw new DOMException('full', 'QuotaExceededError');
        return setItem.call(this, key, value);
      };
    });
    await exportPage.reload();
    assert.equal(await exportPage.evaluate(key => localStorage.getItem(key), KEY), preMerge, 'backup failure never overwrites original duplicate ledger');
    assert.equal(await exportPage.locator('#saveState').innerText(), '未能保存');
    assert.deepEqual(errors, []);
    console.log('PWA browser checks passed: offline, accounts, backup, updates, mobile layout, duplicate generation/migration, preserved records and failed migration backup.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

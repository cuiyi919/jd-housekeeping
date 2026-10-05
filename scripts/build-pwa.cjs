// Standalone static output: only explicitly selected public assets are shipped.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'web', name), 'utf8');
const output = path.join(root, 'dist/pwa');
fs.mkdirSync(output, { recursive: true });
let html = read('index.html')
  .replaceAll('/apple-touch-icon.png?v=4', './apple-touch-icon.png')
  .replace('width=device-width,initial-scale=1', 'width=device-width,initial-scale=1,viewport-fit=cover')
  .replace(/<link rel="stylesheet"[^>]+>/, () => '<style>' + read('style.css') + '\n' + read('mobile.css') + '\n' + read('pwa.css') + '</style>')
  .replace('</head>', '<meta name="theme-color" content="#e8f5fa"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default"><link rel="manifest" href="./manifest.webmanifest"></head>')
  .replace('<main>', `<main><section class="pwa-tools" aria-label="安装与离线状态"><span id="offlineState" role="status">正在准备离线使用…</span><button id="installHelp" class="subtle">安装到桌面</button><button id="updatePwa" class="subtle" hidden>更新版本</button></section>
<dialog id="installDialog"><h2>添加到主屏幕</h2><p>iPhone：用 Safari 打开此网址，点分享按钮，再点“添加到主屏幕”，保持“作为网页 App 打开”开启。</p><p>添加后，请从桌面图标打开，等显示“离线可用”再断网使用。</p><p>原 App 或浏览器里的记录不会自动转移。请先导出备份，再从桌面图标打开本工具并导入。</p><p class="quiet">两台手机各自保存，不会自动同步。清除网站数据前请导出备份。</p><button id="closeInstall" class="primary">知道了</button></dialog>`)
  .replace('数据仅保存在当前浏览器；在线与离线版不自动同步。可导出备份，再在其他版本导入。', '记录仅保存在当前设备，不上传服务器，也不会在两台手机间自动同步。请定期导出备份；卸载、清除网站数据或系统回收存储可能导致记录丢失。原 App 的 JSON 备份可直接导入。')
  .replace('建议先导出当前备份。', '导入前会保存当前记录的恢复副本，仍建议先导出备份。')
  .replace('</aside>', '<details class="help rules"><summary>备份与版本</summary><p id="pwaStorage">正在检查本地存储…</p><button id="persistPwa" class="subtle">保护本地存储</button> <button id="recoverPwa" class="subtle">导出导入前记录</button> <button id="recoverPlanMerge" class="subtle" hidden>导出合并前记录</button><p class="quiet">版本 <span id="pwaVersion"></span> · 非京东官方应用</p></details></aside>');
for (const name of ['planner', 'ledger', 'app']) {
  const code = read(name + '.js');
  new vm.Script(code);
  html = html.replace(`<script src="${name}.js"></script>`, () => `<script>${code}</script>`);
}
const runtime = read('pwa.js');
new vm.Script(runtime);
html = html.replace('</body>', () => `<script>${runtime}</script></body>`);
const icon = fs.readFileSync(path.join(root, 'assets/housekeeping-icon.png'));
const size = icon.readUInt32BE(16);
const manifest = JSON.stringify({
  id: './', name: '京东家政 · 家庭记录', short_name: '京东家政', lang: 'zh-CN',
  description: '离线保存家政预约、购买记录和家庭支出。个人记录工具，非京东官方应用。',
  start_url: './', scope: './', display: 'standalone',
  background_color: '#e8f5fa', theme_color: '#e8f5fa',
  icons: [{ src: './icon.png', sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' }],
}, null, 2);
const sw = read('sw.js');
const touchIcon = fs.readFileSync(path.join(root, 'web/apple-touch-icon.png'));
const version = crypto.createHash('sha256').update(html).update(sw).update(manifest).update(icon).update(touchIcon).digest('hex').slice(0, 12);
fs.writeFileSync(path.join(output, 'index.html'), html.replaceAll('__PWA_VERSION__', version));
fs.writeFileSync(path.join(output, 'sw.js'), sw.replaceAll('__PWA_VERSION__', version));
fs.writeFileSync(path.join(output, 'manifest.webmanifest'), manifest);
fs.writeFileSync(path.join(output, 'apple-touch-icon.png'), touchIcon);
fs.writeFileSync(path.join(output, 'icon.png'), icon);
fs.writeFileSync(path.join(output, '.nojekyll'), '');
console.log(`PWA ${version}: ${output}`);

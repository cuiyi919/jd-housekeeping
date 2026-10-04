// Inline every page asset: the mobile application does not load a website.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'web', name), 'utf8');
let html = read('index.html');
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'web/apple-touch-icon.png')).toString('base64');
html = html.replaceAll('/apple-touch-icon.png?v=4', icon);
html = html.replace(/<link rel="stylesheet"[^>]+>/, () => '<style>' + read('style.css') + '</style>');
html = html.replace('width=device-width,initial-scale=1', 'width=device-width,initial-scale=1,viewport-fit=cover');
html = html.replace('</head>', () => `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><style>${read('mobile.css')}</style></head>`);
html = html.replace(/<a href="https:[^"]+" target="_blank" rel="noopener">官方安排<\/a>/, '（沿用原网页的2026年假期数据）');
html = html.replace('仅保存在此浏览器', '正在读取手机记录…');
html = html.replace('数据仅保存在当前浏览器；在线与离线版不自动同步。可导出备份，再在其他版本导入。', '记录保存在当前手机。旧网页中的记录需先导出JSON备份，再在这里导入。请在显示“已保存到此手机”后退出，卸载或清除应用数据前先导出备份。');
let app = read('app.js').replaceAll('localStorage.', 'phoneStore.');
app = app.replace(";$('saveState').textContent='已保存到此浏览器'", '');
app = app.replaceAll('浏览器', '手机');
app += `
  $('export').onclick=()=>nativeSend('export',JSON.stringify(state,null,2));
  $('import').onclick=()=>nativeSend('import',null);
  window.phoneImport=raw=>{try{
    const next=prepareState(JSON.parse(raw),true);pendingImport=next;
    $('importDescription').textContent='备份包含账号一 '+next.plans.filter(p=>p.accountId==='1').length+' 轮、账号二 '+next.plans.filter(p=>p.accountId==='2').length+' 轮计划，将替换两个账号的记录。导入前会在手机保留当前记录的恢复副本。';
    $('importDialog').showModal();
  }catch(e){toast('无法导入：'+e.message)}};
  $('confirmImport').onclick=()=>{if(!pendingImport)return;const raw=JSON.stringify(pendingImport);pendingImport=null;$('importDialog').close();document.body.inert=true;nativeSend('replace',raw)};
  window.phoneImportFailed=()=>{document.body.inert=false;toast('导入未完成，原记录未替换。')};
  window.phoneCommitImport=raw=>{document.body.inert=false;state=prepareState(JSON.parse(raw));storageBlocked=false;$('storageWarning').hidden=true;setForm(account().config);renderAll();$('settingsDetails').open=!active();$('saveState').textContent='已保存到此手机';toast('两个账号的备份已导入。')};
  if(window.PHONE_INITIAL && !storageBlocked)$('saveState').textContent='已保存到此手机';
`;
for (const name of ['planner', 'ledger', 'app']) {
  const code = name === 'app' ? app : read(name + '.js');
  new vm.Script(code);
  html = html.replace(`<script src="${name}.js"></script>`, () => `<script>${code}</script>`);
}
html = html.replace('<script>', () => '<script>/*PHONE_BOOTSTRAP*/\n' + read('bridge.js') + '</script><script>');
if (/<(?:script|link)[^>]+(?:src|href)="(?!data:)/.test(html)) throw Error('An external asset remains');
if (/localStorage\./.test(html)) throw Error('Browser storage remains');
fs.mkdirSync(path.join(root, 'src'), { recursive: true });
fs.writeFileSync(path.join(root, 'src/page.generated.json'), JSON.stringify(html));
console.log('Bundled local page:', Buffer.byteLength(html), 'bytes');

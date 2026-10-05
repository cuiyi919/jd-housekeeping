/* PWA-only behavior: native Expo embedding never includes this file. */
(() => {
  'use strict';
  const recoveryKey = KEY + '-before-import';
  let registration, updateRequested = false, installPrompt;
  const status = $('offlineState');
  try { if (!storageBlocked && $('saveState').textContent !== '未能保存' && localStorage.getItem(KEY)) $('saveState').textContent = '已保存到此浏览器'; } catch { /* Existing storage warning remains visible. */ }
  $('pwaVersion').textContent = '__PWA_VERSION__';
  $('closeInstall').onclick = () => $('installDialog').close();
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
  $('installHelp').onclick = async () => {
    if (installPrompt) { await installPrompt.prompt(); installPrompt = null; }
    else $('installDialog').showModal();
  };
  async function exportRaw(raw, prefix) {
    const file = new File([raw], prefix + '-' + today() + '.json', { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: '家政记录备份' }); }
      catch (error) { if (error.name !== 'AbortError') toast('分享未完成，请重试。'); }
      return;
    }
    const url = URL.createObjectURL(file), a = document.createElement('a');
    a.href = url; a.download = file.name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast('已发起备份下载，请确认文件已保存。');
  }
  $('export').onclick = () => exportRaw(JSON.stringify(state, null, 2), '京东家政记录');
  $('recoverPwa').onclick = () => {
    try {
      const raw = localStorage.getItem(recoveryKey);
      if (raw === null) { toast('尚无导入前的恢复副本。'); return; }
      void exportRaw(raw, '京东家政-导入前记录');
    } catch { toast('无法读取恢复副本，请检查存储权限。'); }
  };
  try { $('recoverPlanMerge').hidden = localStorage.getItem(KEY + '-before-plan-merge') === null; } catch { /* Storage warning already shown. */ }
  $('recoverPlanMerge').onclick = () => {
    try {
      const raw = localStorage.getItem(KEY + '-before-plan-merge');
      if (raw !== null) void exportRaw(raw, '京东家政-合并前记录');
    } catch { toast('无法读取合并前副本，请检查存储权限。'); }
  };
  // Validate and persist first: quota/permission failures cannot replace current state.
  $('confirmImport').onclick = () => {
    if (!pendingImport) return;
    try {
      const next = prepareState(pendingImport, true);
      L.validateState(next);
      const raw = JSON.stringify(next), previous = localStorage.getItem(KEY);
      if (previous !== null) localStorage.setItem(recoveryKey, previous);
      localStorage.setItem(KEY, raw);
      state = next; pendingImport = null; storageBlocked = false;
      $('storageWarning').hidden = true; $('importDialog').close();
      setForm(account().config); renderAll(); $('settingsDetails').open = !active();
      $('saveState').textContent = '已保存到此浏览器'; toast('两个账号的备份已导入。');
    } catch (error) { toast('导入未完成，当前记录未替换：' + error.message); }
  };
  async function storageStatus(request = false) {
    try {
      const persisted = request ? await navigator.storage?.persist?.() : await navigator.storage?.persisted?.();
      $('pwaStorage').textContent = persisted ? '已获得持久存储保护。仍请定期导出备份，清除网站数据会删除记录。' : '记录保存在本机，请定期导出备份。添加到主屏幕后，可申请持久存储保护。';
      $('persistPwa').hidden = !!persisted || !navigator.storage?.persist;
      if (request && !persisted) toast('浏览器暂未授予持久存储。记录仍可保存，请定期备份。');
    } catch { $('pwaStorage').textContent = '请定期导出备份，清除网站数据会删除记录。'; }
  }
  $('persistPwa').onclick = () => storageStatus(true);
  void storageStatus();
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (standalone) { $('installHelp').hidden = true; void storageStatus(true); }
  function offlineStatus() {
    const ready = !!navigator.serviceWorker?.controller;
    status.dataset.ready = String(ready);
    status.textContent = ready ? (navigator.onLine ? '离线可用 · 记录仅存本机' : '当前离线 · 可继续记录') : (navigator.onLine ? '正在准备离线使用…' : '尚未缓存，请联网打开一次');
  }
  function showUpdate() { $('updatePwa').hidden = !registration?.waiting; }
  $('updatePwa').onclick = () => {
    if (!registration?.waiting) return;
    if (storageBlocked || $('saveState').textContent === '未能保存') { toast('请先导出备份，解决保存问题后再更新。'); return; }
    if (!confirm('新版已准备好。请确认购买日期、上门日期和计划设置已提交保存；更新会重新打开页面，未提交的内容不会保留。现在更新？')) return;
    updateRequested = true;
    registration.waiting.postMessage({ type: 'APPLY_UPDATE' });
  };
  if (!('serviceWorker' in navigator) || !isSecureContext) {
    status.textContent = '离线安装需要 HTTPS 网址，请使用正式链接';
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested) location.reload();
    else { offlineStatus(); showUpdate(); }
  });
  window.addEventListener('online', () => { offlineStatus(); registration?.update().catch(() => {}); });
  window.addEventListener('offline', offlineStatus);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { offlineStatus(); showUpdate(); registration?.update().catch(() => {}); }
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(value => {
    registration = value; showUpdate(); offlineStatus();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' || worker.state === 'activated') showUpdate();
        if (worker.state === 'redundant' && !navigator.serviceWorker.controller) status.textContent = '离线准备未完成，请联网重新打开';
      });
    });
    return navigator.serviceWorker.ready;
  }).then(() => { offlineStatus(); showUpdate(); }).catch(() => { status.textContent = '离线准备未完成，请联网重新打开'; });
})();

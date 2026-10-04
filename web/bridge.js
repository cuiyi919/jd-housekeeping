let nativeRevision = 0;
let latestSave = 0;
function nativeSend(type, payload) {
  const id = ++nativeRevision;
  if (type === 'save') {
    latestSave = id;
    document.getElementById('saveState').textContent = '正在保存到手机…';
  }
  window.ReactNativeWebView.postMessage(JSON.stringify({ type, payload, id }));
  return id;
}
const phoneStore = {
  getItem: () => window.PHONE_INITIAL,
  setItem: (key, raw) => nativeSend('save', raw),
};
window.phoneReply = (id, error) => {
  if (error) {
    document.getElementById('saveState').textContent = '未保存，请导出备份';
    storageWarning(error);
  } else if (id === latestSave) {
    document.getElementById('saveState').textContent = '已保存到此手机';
    document.getElementById('storageWarning').hidden = true;
  }
};

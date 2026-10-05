const L = require('../web/ledger.js');
const KEY = 'jd-housekeeping-ledger-v2';
const RECOVERY = KEY + '-before-import';
const MERGE_RECOVERY = KEY + '-before-plan-merge';
function validateRaw(raw) {
  if (typeof raw !== 'string' || raw.length > 5000000) throw Error('备份文件过大或格式错误');
  L.validateState(JSON.parse(raw));
  return raw;
}
// Serialize writes so a slower old edit cannot replace a newer edit or import.
function createStore(adapter) {
  let tail = Promise.resolve();
  let blocked = true;
  const enqueue = action => {
    const next = tail.then(action);
    tail = next.catch(() => {});
    return next;
  };
  return {
    async load() {
      const raw = await adapter.getItem(KEY);
      if (raw !== null) validateRaw(raw);
      blocked = false;
      return raw;
    },
    save(raw) {
      return enqueue(async () => {
        if (blocked) throw Error('旧记录读取失败，已暂停写入，保护原数据。');
        validateRaw(raw);
        const previous = await adapter.getItem(KEY);
        if (previous !== null && L.hasDuplicatePlans(JSON.parse(previous))) await adapter.setItem(MERGE_RECOVERY, previous);
        await adapter.setItem(KEY, raw);
      });
    },
    replace(raw) {
      return enqueue(async () => {
        validateRaw(raw);
        const previous = await adapter.getItem(KEY);
        if (previous !== null) await adapter.setItem(RECOVERY, previous);
        await adapter.setItem(KEY, raw);
        blocked = false;
      });
    },
    raw: () => adapter.getItem(KEY),
    recovery: async () => (await adapter.getItem(RECOVERY)) ?? adapter.getItem(MERGE_RECOVERY),
  };
}
module.exports = { createStore, validateRaw, KEY, RECOVERY, MERGE_RECOVERY };

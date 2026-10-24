// Хранилище на устройстве (IndexedDB): импортированный полевой пакет и данные полевой работы. Никуда не отправляется; в кэш сайта не попадает.
const DB = 'field-platform', STORE = 'kv';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Не удалось открыть хранилище устройства'));
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode), st = t.objectStore(STORE);
    const r = fn(st);
    t.oncomplete = () => { db.close(); resolve(r && r.result !== undefined ? r.result : undefined); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error || new Error('Запись в хранилище отменена')); };
  });
}
export const kvGet = (key) => tx('readonly', (st) => st.get(key));
export const kvSet = (key, val) => tx('readwrite', (st) => st.put(val, key));
export const kvDel = (key) => tx('readwrite', (st) => st.delete(key));

// Просим браузер не удалять данные при нехватке места (для установленного приложения обычно разрешается)
export async function requestPersistence() {
  try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch (e) { return false; }
}
export async function storageInfo() {
  try { const e = await navigator.storage.estimate(); return { used: e.usage || 0, quota: e.quota || 0 }; } catch (e) { return null; }
}

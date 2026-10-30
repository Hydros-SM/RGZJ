// Полевой пакет: чтение файла (.gfield — ZIP, при пароле зашифрованный), сохранение на устройстве и разбор в рабочие структуры.
import { kvGet, kvSet, kvDel } from '../store.js';
import { readZip, sha256Hex } from './zip-pack.js';
import { isEncrypted, decryptBytes } from './field-crypto.js';
import { unpackTerrain } from './field-formats.js';
import { unpackFaultsModel, traceSegments } from './faults-format.js';
import { makeTerrainSampler } from './terrain-sampler.js';

export const SUPPORTED = { format: 'gfield', version: 1 };

export class NeedPassword extends Error { constructor(m) { super(m || 'Пакет защищён паролем'); this.needPassword = true; } }

// Что не так с файлом, если он не открылся как пакет: пустой/обрезанный, не тот файл, неизвестный формат
function diagnose(u8, why, hash) {
  const n = u8.length, mb = (n / 1048576).toFixed(2), head = String.fromCharCode(...u8.subarray(0, 8));
  const size = 'Размер файла на планшете: ' + n.toLocaleString('ru-RU') + ' байт (' + mb + ' МБ). Контрольная сумма SHA-256: ' + (hash || '—') + '. Сверьте её с суммой, которую показала основная платформа после экспорта: если не совпадает, файл изменился при записи или передаче — скачайте и скопируйте его заново (одинаковый размер ещё не значит одинаковое содержимое).';
  if (n < 100) return 'Файл пустой или скачан не полностью. ' + size;
  if (/^s*</.test(head)) return 'Выбран не пакет, а веб-страница (HTML) — например, ссылка или страница облачного хранилища вместо файла. Скачайте сам файл .gfield. ' + size;
  if (/^s*[{[]/.test(head)) return 'Выбран текстовый файл (JSON), а не пакет .gfield. ' + size;
  if (u8[0] === 0x50 && u8[1] === 0x4b) return 'Архив обрезан или повреждён: начало файла верное, но конца нет (' + why + '). Скорее всего, файл не докопировался или изменился при передаче. ' + size;
  return 'Это не полевой пакет (неизвестный формат файла). Выберите файл .gfield, собранный в основной платформе («Подготовка к полевым»). ' + size;
}
const exact = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

// Читает файл пакета в запись для хранилища (ничего не сохраняя); бросает NeedPassword, если нужен пароль
export async function readPackageFile(file, password) {
  let u8 = new Uint8Array(await file.arrayBuffer());
  let hash = ''; try { hash = await sha256Hex(u8); } catch (e) { /* без HTTPS хеш недоступен */ }
  if (isEncrypted(u8)) {
    if (!password) throw new NeedPassword();
    u8 = await decryptBytes(u8, password);
  }
  let z;
  try { z = readZip(u8); } catch (e) { throw new Error(/повреждён/.test(e.message) ? e.message + ' Контрольная сумма файла SHA-256: ' + (hash || '—') + ' — сверьте с суммой в основной платформе.' : diagnose(u8, e.message, hash)); }
  if (!z.has('manifest.json')) throw new Error('В файле нет manifest.json — это не полевой пакет');
  const manifest = await z.json('manifest.json');
  if (manifest.format !== SUPPORTED.format) throw new Error('Неизвестный формат пакета: ' + manifest.format);
  if (manifest.version > SUPPORTED.version) throw new Error('Пакет создан более новой версией платформы (формат ' + manifest.version + '). Обновите полевое приложение: откройте его с интернетом.');
  if (!z.has('terrain.bin') || !z.has('data.json')) throw new Error('В пакете нет рельефа или данных');
  const rec = { fileHash: hash, manifest, data: await z.json('data.json'), terrainBuf: exact(await z.bytes('terrain.bin')) };
  if (z.has('faults.bin')) rec.faultsBuf = exact(await z.bytes('faults.bin'));
  const mapName = manifest.scheme && manifest.scheme.map;
  if (mapName && z.has(mapName)) rec.mapBlob = new Blob([await z.bytes(mapName)], { type: /png$/i.test(mapName) ? 'image/png' : 'image/jpeg' });
  return rec;
}

export async function importPackage(file, password) {
  const rec = await readPackageFile(file, password);
  rec.fileName = file.name; rec.importedAt = new Date().toISOString();
  await kvSet('session', rec);
  return rec;
}
export async function loadStoredSession() { const rec = await kvGet('session'); return rec ? buildSession(rec) : null; }
export async function clearSession() { await kvDel('session'); }

// Рабочие структуры: рельеф и его выборка по Z, разломы и их линии выхода, последние записи точек, выходы воды
export function buildSession(rec) {
  const terrain = unpackTerrain(rec.terrainBuf), sampler = makeTerrainSampler(terrain);
  const faults = rec.faultsBuf ? unpackFaultsModel(rec.faultsBuf) : null;
  const traces = {};
  if (faults) faults.surfaces.forEach((s) => { traces[s.key] = traceSegments(s, faults.origin, sampler.zAt); });
  const pv = derivePoints(rec.data, { scope: 'interest', asOf: '' });
  return {
    rec, manifest: rec.manifest, data: rec.data, terrain, sampler, faults, traces,
    mapUrl: rec.mapBlob ? URL.createObjectURL(rec.mapBlob) : null,
    points: pv.points, history: pv.history, outflows: pv.outflows,
    fileName: rec.fileName, fileHash: rec.fileHash, importedAt: rec.importedAt,
  };
}

// Точки замера по настройкам слоя: scope 'interest' — только точки интереса пакета (если они заданы), 'all' — все; asOf — состояние на дату
export function derivePoints(data, cfg) {
  const rows = data.points || [], asOf = (cfg && cfg.asOf) || '';
  const interest = data.interest && cfg && cfg.scope !== 'all' ? new Set(data.interest.map(String)) : null;
  const okDate = (p) => !asOf || String(p.monitoring_date || '') <= asOf;
  const parentOf = (p) => String(p.kind === 'outflow' ? p.parent_number : p.point_number);
  // выходы воды — постоянные объекты карьера: показываются всегда, независимо от выбора точек интереса
  const use = rows.filter((p) => (p.kind === 'outflow' || !interest || interest.has(parentOf(p))) && okDate(p));
  const measure = use.filter((p) => p.kind !== 'outflow'), outflows = use.filter((p) => p.kind === 'outflow');
  const latest = new Map(), history = new Map();
  measure.forEach((p) => { const c = latest.get(p.point_number); if (!c || String(p.monitoring_date || '') > String(c.monitoring_date || '')) latest.set(p.point_number, p); });
  measure.forEach((p) => { if (!history.has(p.point_number)) history.set(p.point_number, []); history.get(p.point_number).push(p); });
  history.forEach((a) => a.sort((x, y) => String(y.monitoring_date || '').localeCompare(String(x.monitoring_date || ''))));
  return { points: Array.from(latest.values()), history, outflows };
}
// Копия сессии с точками по настройкам (рельеф, разломы и rec те же — 3D-сцена не перестраивается)
export function applyPointsView(session, cfg) { return { ...session, ...derivePoints(session.data, cfg) }; }

// Неделя схемы '2026-W43' → { start, end } (понедельник–воскресенье, ISO-даты)
export function weekRangeOf(weekKey) {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(weekKey || ''); if (!m) return null;
  const y = Number(m[1]), w = Number(m[2]), jan4 = new Date(Date.UTC(y, 0, 4)), dow = (jan4.getUTCDay() + 6) % 7;
  const mon = new Date(jan4.getTime() + ((w - 1) * 7 - dow) * 86400000), sun = new Date(mon.getTime() + 6 * 86400000), iso = (d) => d.toISOString().slice(0, 10);
  return { start: iso(mon), end: iso(sun) };
}

// Точки интереса — что нужно (пере)мерить. date '__all__': последние записи всех точек, «выполнено» — замер на неделе схемы;
// иначе точки, замеренные в выбранный день, «выполнено» — замер позже этого дня. Замеры, сделанные на планшете, считаются выполненными всегда.
export function computePoi(session, cfg) {
  const data = session.data, all = (data.points || []).filter((p) => p.kind !== 'outflow');
  const interest = data.interest && cfg.scope !== 'all' ? new Set(data.interest.map(String)) : null;
  const rows = all.filter((p) => !interest || interest.has(String(p.point_number)));
  const day = (p) => String(p.monitoring_date || '').slice(0, 10);
  const fieldNums = new Set(session.points.filter((p) => p._field && !p._edited).map((p) => p.point_number));
  const latest = new Map();
  const pick = (p) => { const c = latest.get(p.point_number); if (!c || day(p) > day(c)) latest.set(p.point_number, p); };
  const done = {};
  if (cfg.date === '__all__' || !cfg.date) {
    rows.forEach(pick);
    const wr = weekRangeOf(session.manifest.scheme && session.manifest.scheme.weekKey);
    if (wr) rows.forEach((p) => { if (day(p) >= wr.start && day(p) <= wr.end) done[p.point_number] = true; });
  } else {
    rows.filter((p) => day(p) === cfg.date).forEach(pick);
    rows.forEach((p) => { if (day(p) > cfg.date) done[p.point_number] = true; });
  }
  fieldNums.forEach((n) => { if (latest.has(n)) done[n] = true; });
  const items = Array.from(latest.values()).map((p) => session.points.find((q) => q.point_number === p.point_number) || p);
  return { items, done, total: items.length, doneCount: items.filter((p) => done[p.point_number]).length, dates: Array.from(new Set(all.map(day).filter(Boolean))).sort().reverse() };
}

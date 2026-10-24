// Полевой пакет: чтение файла (.gfield — ZIP, при пароле зашифрованный), сохранение на устройстве и разбор в рабочие структуры.
import { kvGet, kvSet, kvDel } from '../store.js';
import { readZip } from './zip-pack.js';
import { isEncrypted, decryptBytes } from './field-crypto.js';
import { unpackTerrain } from './field-formats.js';
import { unpackFaultsModel, traceSegments } from './faults-format.js';
import { makeTerrainSampler } from './terrain-sampler.js';

export const SUPPORTED = { format: 'gfield', version: 1 };

export class NeedPassword extends Error { constructor(m) { super(m || 'Пакет защищён паролем'); this.needPassword = true; } }

// Что не так с файлом, если он не открылся как пакет: пустой/обрезанный, не тот файл, неизвестный формат
function diagnose(u8, why) {
  const n = u8.length, mb = (n / 1048576).toFixed(2), head = String.fromCharCode(...u8.subarray(0, 8));
  const size = 'Размер файла на планшете: ' + n.toLocaleString('ru-RU') + ' байт (' + mb + ' МБ). Сравните с размером исходного файла на компьютере: если они разные, файл не докопировался — скопируйте его заново.';
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
  if (isEncrypted(u8)) {
    if (!password) throw new NeedPassword();
    u8 = await decryptBytes(u8, password);
  }
  let z;
  try { z = readZip(u8); } catch (e) { throw new Error(diagnose(u8, e.message)); }
  if (!z.has('manifest.json')) throw new Error('В файле нет manifest.json — это не полевой пакет');
  const manifest = await z.json('manifest.json');
  if (manifest.format !== SUPPORTED.format) throw new Error('Неизвестный формат пакета: ' + manifest.format);
  if (manifest.version > SUPPORTED.version) throw new Error('Пакет создан более новой версией платформы (формат ' + manifest.version + '). Обновите полевое приложение: откройте его с интернетом.');
  if (!z.has('terrain.bin') || !z.has('data.json')) throw new Error('В пакете нет рельефа или данных');
  const rec = { manifest, data: await z.json('data.json'), terrainBuf: exact(await z.bytes('terrain.bin')) };
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
  const rows = rec.data.points || [];
  const measure = rows.filter((p) => p.kind !== 'outflow'), outflows = rows.filter((p) => p.kind === 'outflow');
  const latest = new Map();
  measure.forEach((p) => { const c = latest.get(p.point_number); if (!c || String(p.monitoring_date || '') > String(c.monitoring_date || '')) latest.set(p.point_number, p); });
  const history = new Map();
  measure.forEach((p) => { if (!history.has(p.point_number)) history.set(p.point_number, []); history.get(p.point_number).push(p); });
  history.forEach((a) => a.sort((x, y) => String(y.monitoring_date || '').localeCompare(String(x.monitoring_date || ''))));
  return {
    rec, manifest: rec.manifest, data: rec.data, terrain, sampler, faults, traces,
    mapUrl: rec.mapBlob ? URL.createObjectURL(rec.mapBlob) : null,
    points: Array.from(latest.values()), history, outflows,
    fileName: rec.fileName, importedAt: rec.importedAt,
  };
}

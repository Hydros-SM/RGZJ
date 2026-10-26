// Выгрузка результатов полевой работы: один обычный текстовый файл JSON (без архива и шифрования) — записи, сведения о пакете и фото
// (фото внутри файла в виде base64). Текст не портится при копировании через флешку, почту и мессенджеры. Рядом — таблица CSV для Excel.
// Журнал выгрузок хранится на планшете: по нему видно, какие записи уже выгружены, а какие новые или изменены после выгрузки.
import { getPhoto } from './work.js';
import { kvGet, kvSet } from '../store.js';

export const RESULT_FORMAT = { format: 'gfield-result', version: 2 };
const LOG_KEY = 'exports';

// Короткий отпечаток записи (FNV-1a): меняется при любой правке записи — по нему определяем «изменена после выгрузки»
export function fingerprint(rec) {
  const s = JSON.stringify(rec); let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16) + '-' + s.length;
}

export async function loadExportLog() { const l = await kvGet(LOG_KEY); return l && Array.isArray(l.items) ? l : { items: [] }; }
export async function addExportLog(log, item) { const next = { items: [...log.items, item].slice(-30) }; await kvSet(LOG_KEY, next); return next; }

// Состояние каждой записи относительно журнала: 'new' — не выгружалась, 'changed' — изменена после выгрузки, 'done' — выгружена как есть
export function recordStates(work, log) {
  const st = new Map(), fps = new Map();
  (log.items || []).forEach((it) => Object.entries(it.fps || {}).forEach(([id, fp]) => { if (!fps.has(id)) fps.set(id, new Set()); fps.get(id).add(fp); }));
  (work.records || []).forEach((r) => { const s = fps.get(r.id); st.set(r.id, !s ? 'new' : s.has(fingerprint(r)) ? 'done' : 'changed'); });
  return st;
}
export const pendingCount = (work, log) => Array.from(recordStates(work, log).values()).filter((s) => s !== 'done').length;

const TYPE_RU = { point: 'Новая точка', measure: 'Новый замер', outflow: 'Выход воды' };
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function toCsv(recs) {
  const head = ['Тип', 'Правка', '№ точки', 'Родитель', 'X', 'Y', 'Z', 'Дата', 'Исполнитель', 'Статус', 'Дебит л/с', 'Интенсивность', 'Домен', 'Борт', 'Горизонт', 'Цвет воды', 'Метод замера', 'Уровень воды Z', 'Комментарий', 'Фото', 'Создана'];
  const rows = recs.map((r) => { const f = r.fields || {}; return [TYPE_RU[r.type] || r.type, r.edit ? 'да' : '', r.point_number, r.parent_number, r.x, r.y, r.z, f.monitoring_date, f.worker, f.status, f.flow_rate, f.intensity, f.domain, f.wall, f.horizon, f.water_color, f.measure_method, f.water_level_z, f.comment, (r.photos || []).length, r.createdAt]; });
  return '﻿' + [head, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
}

const p2 = (n) => String(n).padStart(2, '0');
export function resultFileName(session, ext, now = new Date()) {
  const q = String(session.manifest.quarry || 'карьер').replace(/[^\p{L}\p{N}]+/gu, '_'), w = (session.manifest.scheme && session.manifest.scheme.weekKey) || '';
  return 'Результаты_' + q + (w ? '_' + w : '') + '_' + now.getFullYear() + p2(now.getMonth() + 1) + p2(now.getDate()) + '_' + p2(now.getHours()) + p2(now.getMinutes()) + '.' + ext;
}

function blobToDataUrl(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error || new Error('Не удалось прочитать фото')); r.readAsDataURL(blob); }); }

// Собирает файл результатов. onlyIds — выгрузить только эти записи (по умолчанию все)
export async function buildResult({ session, work, worker, appVersion, onlyIds }) {
  const recs = (work.records || []).filter((r) => !onlyIds || onlyIds.has(r.id));
  if (!recs.length) throw new Error('Нет записей для выгрузки');
  const photos = {}, missing = [];
  for (const r of recs) for (const pid of r.photos || []) {
    if (photos[pid]) continue;
    const blob = await getPhoto(pid);
    if (blob) photos[pid] = await blobToDataUrl(blob); else missing.push({ record: r.point_number, photo: pid });
  }
  const m = session.manifest, now = new Date();
  const counts = { records: recs.length, points: recs.filter((r) => r.type === 'point' && !r.edit).length, measures: recs.filter((r) => r.type === 'measure').length, outflows: recs.filter((r) => r.type === 'outflow' && !r.edit).length, edits: recs.filter((r) => r.edit).length, photos: Object.keys(photos).length };
  const doc = {
    ...RESULT_FORMAT, createdAt: now.toISOString(), worker: worker || '', appVersion: appVersion || '', quarry: m.quarry, weekKey: m.scheme && m.scheme.weekKey,
    package: { hash: session.fileHash || '', fileName: session.fileName || '', createdAt: m.createdAt, createdBy: m.createdBy || '', importedAt: session.importedAt },
    counts, missingPhotos: missing, records: recs, photos,
  };
  const blob = new Blob([JSON.stringify(doc)], { type: 'application/json' });
  const fps = {}; recs.forEach((r) => { fps[r.id] = fingerprint(r); });
  return { blob, doc, counts, size: blob.size, fileName: resultFileName(session, 'json', now), csvName: resultFileName(session, 'csv', now), csv: new Blob([toCsv(recs)], { type: 'text/csv;charset=utf-8' }), fps, missing };
}

// Читает собранный файл обратно, как это сделает основная платформа: JSON целый, записи и фото на месте
export async function verifyResult(blob, counts) {
  try {
    const d = JSON.parse(await blob.text());
    if (d.format !== RESULT_FORMAT.format) throw new Error('неверный формат');
    if (d.records.length !== counts.records) throw new Error('число записей не совпало');
    if (Object.keys(d.photos).length !== counts.photos) throw new Error('число фото не совпало');
    for (const v of Object.values(d.photos)) if (!/^data:image\/jpeg;base64,/.test(v) || v.length < 100) throw new Error('фото повреждено');
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function canShareFile(blob, name) {
  try { return !!(navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type: blob.type })] })); } catch (e) { return false; }
}
export async function shareFile(blob, name, title) {
  await navigator.share({ files: [new File([blob], name, { type: blob.type })], title: title || name });
}

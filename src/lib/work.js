// Полевая работа: записи, сделанные на планшете (новые точки, новые замеры существующих точек, выходы воды), и фото к ним.
// Хранятся только на устройстве (IndexedDB): записи одним списком, фото — отдельными ключами. Поверх пакета записи «накладываются»
// (withWork) — так новые объекты сразу видны на карте, в списке и в 3D. Обратно в основную платформу уходят только эти записи (следующий этап).
import { kvGet, kvSet, kvDel } from '../store.js';

export const WORK_KEY = 'work';
export const newId = (p = 'f') => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
export const todayIso = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };

export async function loadWork() { const w = await kvGet(WORK_KEY); return w && Array.isArray(w.records) ? w : { records: [] }; }
export async function saveWork(work) { await kvSet(WORK_KEY, { records: work.records, savedAt: new Date().toISOString() }); }
export async function clearWork() {
  const w = await loadWork();
  for (const r of w.records) for (const pid of r.photos || []) await kvDel('photo:' + pid);
  await kvDel(WORK_KEY);
}

// Фото: уменьшаем до 1600 px по длинной стороне (JPEG 0.8) — экономим память планшета
export async function shrinkPhoto(file, maxSide = 1600, quality = 0.8) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(bmp, 0, 0, w, h); bmp.close && bmp.close();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Не удалось обработать фото'))), 'image/jpeg', quality));
}
export async function addPhoto(file) { const blob = await shrinkPhoto(file); const id = newId('ph'); await kvSet('photo:' + id, blob); return id; }
export const getPhoto = (id) => kvGet('photo:' + id);
export const deletePhoto = (id) => kvDel('photo:' + id);

// Дебит: единицы и объёмный метод. Значение хранится в л/с (как в основной платформе)
export const toLs = (v, unit) => { if (String(v == null ? '' : v).trim() === '') return null; const n = Number(String(v).replace(',', '.')); if (!Number.isFinite(n)) return null; return unit === 'm3h' ? n / 3.6 : n; };
export const volumetricLs = (volumeL, timeS) => { const v = Number(String(volumeL).replace(',', '.')), t = Number(String(timeS).replace(',', '.')); return v > 0 && t > 0 ? v / t : null; };

// Точка в многоугольнике (кольцо — список [x, y])
function inRing(x, y, ring) { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; } return ins; }
export function domainAt(domains, x, y) { const d = (domains || []).find((dm) => (dm.rings || []).some((r) => inRing(x, y, r))); return d ? d.name : ''; }

// Следующие номера: точка — максимальный целый номер + 1; выход — «родитель-В{n}»
export function nextPointNumber(session, work) {
  let max = 0;
  const upd = (n) => { if (/^\d+$/.test(String(n))) max = Math.max(max, Number(n)); };
  session.points.forEach((p) => upd(p.point_number)); (work.records || []).forEach((r) => { if (r.type === 'point') upd(r.point_number); });
  return String(max + 1);
}
export function nextOutflowNumber(session, work, parent) {
  const taken = new Set(session.outflows.map((o) => o.point_number)); (work.records || []).forEach((r) => { if (r.type === 'outflow') taken.add(r.point_number); });
  let n = 1; while (taken.has(parent + '-В' + n)) n++;
  return parent + '-В' + n;
}

// Накладывает записи на сессию: возвращает копию с обновлёнными points / history / outflows (новые помечены _field и _rec)
export function withWork(session, work) {
  const recs = (work && work.records) || [];
  if (!recs.length) return session;
  const latest = new Map(session.points.map((p) => [p.point_number, p]));
  const history = new Map(Array.from(session.history.entries()).map(([k, v]) => [k, v.slice()]));
  const outflows = session.outflows.slice();
  recs.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).forEach((r) => {
    if (r.edit && r.type === 'point') { // правка точки пакета: заменяем последний замер и его строку в истории
      const base = latest.get(r.point_number) || {};
      const row = { ...base, ...r.fields, id: base.id || r.id, point_number: r.point_number, kind: 'measure', x_local: r.x != null ? r.x : base.x_local, y_local: r.y != null ? r.y : base.y_local, _field: true, _edited: true, _rec: r.id, _photos: r.photos || [] };
      latest.set(r.point_number, row);
      const h = history.get(r.point_number); if (h) { const i = h.findIndex((q) => q.id === base.id); if (i >= 0) h[i] = row; else h.unshift(row); }
    } else if (r.edit && r.type === 'outflow') {
      const i = outflows.findIndex((o) => o.point_number === r.point_number);
      if (i >= 0) outflows[i] = { ...outflows[i], x_local: r.x, y_local: r.y, water_level_z: r.z, status: r.fields.status || outflows[i].status, comment: r.fields.comment || '', monitoring_date: r.fields.monitoring_date || outflows[i].monitoring_date, _field: true, _edited: true, _rec: r.id, _photos: r.photos || [] };
    } else if (r.type === 'point' || r.type === 'measure') {
      const base = latest.get(r.point_number) || {};
      const row = { ...base, ...r.fields, id: r.id, point_number: r.point_number, kind: 'measure', x_local: r.x != null ? r.x : base.x_local, y_local: r.y != null ? r.y : base.y_local, monitoring_date: r.fields.monitoring_date || todayIso(), _field: true, _rec: r.id, _photos: r.photos || [] };
      latest.set(r.point_number, row);
      if (!history.has(r.point_number)) history.set(r.point_number, []);
      history.get(r.point_number).unshift(row);
    } else if (r.type === 'outflow') {
      outflows.push({ id: r.id, point_number: r.point_number, kind: 'outflow', parent_number: r.parent_number, x_local: r.x, y_local: r.y, water_level_z: r.z, status: r.fields.status || 'Активная', comment: r.fields.comment || '', monitoring_date: r.fields.monitoring_date || todayIso(), _field: true, _rec: r.id, _photos: r.photos || [] });
    }
  });
  return { ...session, points: Array.from(latest.values()), history, outflows };
}

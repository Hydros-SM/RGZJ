// Съёмки БПЛА на устройстве (IndexedDB, тот же склад, что и пакет): ортофотоплан/фотомодель и тепловизор. Список — в 'uav:index', данные каждой — в 'uav:<id>'.
import { kvGet, kvSet, kvDel } from '../store.js';
import { unpackLod } from './uav-convert.js';

const IDX = 'uav:index';
export const KINDS = { photo: 'Ортофотоплан / фотомодель', thermal: 'Тепловизионная съёмка' };

export async function listScans() { return (await kvGet(IDX)) || []; }
export async function saveScan(meta, meshBuf, texBlob) {
  await kvSet('uav:' + meta.id, { mesh: new Uint8Array(meshBuf), tex: texBlob || null });
  const l = await listScans();
  await kvSet(IDX, l.filter((x) => x.id !== meta.id).concat([meta]));
}
export async function deleteScan(id) {
  await kvDel('uav:' + id);
  const l = await listScans();
  await kvSet(IDX, l.filter((x) => x.id !== id));
}
// { mesh: unpackLod(...), texture: Blob | null }
export async function loadScan(id) {
  const rec = await kvGet('uav:' + id);
  if (!rec || !rec.mesh) throw new Error('Съёмка не найдена на устройстве');
  return { mesh: unpackLod(rec.mesh), texture: rec.tex || null };
}
export const newScanId = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

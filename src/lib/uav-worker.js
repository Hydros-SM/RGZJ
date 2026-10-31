// Фоновый поток: разбор съёмки БПЛА (OBJ + текстура) прямо на планшете — упрощение сетки и уменьшение текстуры, чтобы модель держалась в памяти
// и в IndexedDB и быстро рисовалась. Вход: { obj: File, tex: File | null, quality: 'light' | 'medium' }.
// Выход: { type: 'stage', stage, frac, info } — ход работы; { type: 'done', result } — готовая сетка (упакованный уровень GMU1) и текстура; { type: 'error', message }.
import { parseObj, buildMesh, meanEdge, decimate, packLod, SMALL_MESH_TRIANGLES } from './uav-convert.js';

const post = (m, transfer) => self.postMessage(m, transfer || []);
const QUALITY = { light: { k: 3.8, tex: 2048 }, medium: { k: 1.7, tex: 4096 } }; // k — размер ячейки упрощения в средних рёбрах (0 — без упрощения)

async function makeTexture(file, max) {
  const probe = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(probe.width, probe.height));
  const w = Math.max(1, Math.round(probe.width * k)), h = Math.max(1, Math.round(probe.height * k));
  probe.close();
  const bmp = await createImageBitmap(file, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
  const c = new OffscreenCanvas(w, h);
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
  return { blob, w, h };
}

self.onmessage = async (e) => {
  const { obj, tex, quality } = e.data || {};
  try {
    const Q = QUALITY[quality] || QUALITY.light;
    const stage = (s, frac, info) => post({ type: 'stage', stage: s, frac, info });
    stage('Чтение OBJ', 0);
    const parsed = await parseObj(obj.stream(), { size: obj.size, onProgress: (f, info) => stage('Чтение OBJ', f * 0.55, info) });
    stage('Сборка вершин', 0.57);
    const mesh = buildMesh(parsed);
    const sourceTriangles = mesh.nt;
    let out = mesh;
    if (mesh.nt > SMALL_MESH_TRIANGLES && Q.k) {
      stage('Упрощение сетки', 0.65);
      out = decimate(mesh, meanEdge(mesh) * Q.k);
    }
    stage('Упаковка', 0.8);
    const raw = packLod(out);
    let texture = null;
    if (tex) { stage('Текстура', 0.88); texture = await makeTexture(tex, Q.tex); }
    stage('Готово', 1);
    const buf = raw.slice().buffer;
    post({ type: 'done', result: { bbox: out.bbox, triangles: out.nt, vertices: out.nv, sourceTriangles, mesh: buf, texture } }, [buf]);
  } catch (err) {
    post({ type: 'error', message: String((err && err.message) || err) });
  }
};

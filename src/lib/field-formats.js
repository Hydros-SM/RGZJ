// Двоичный формат рельефа для полевого пакета (terrain.bin): 'GT3D' | uint32 длина JSON | JSON (выровнен до 4 байт) | Float32 x | Float32 y | Float32 z |
// Uint32 треугольники | Uint8 тип рельефа (0 природный, 1 карьер, 2 отвал). Координаты — относительно начала координат origin (точность Float32 в миллиметрах).
// Общий файл: та же копия лежит в проекте полевой платформы.
const MAGIC = 'GT3D';
function trimMeta(t) { let e = t.length; while (e > 0 && t.charCodeAt(e - 1) <= 32) e--; return t.slice(0, e); }
const align4 = (n) => (n + 3) & ~3;

export function packTerrain(m, extraMeta) {
  const nv = m.xs.length, nt = m.triangles.length / 3;
  let minx = Infinity, miny = Infinity;
  for (let i = 0; i < nv; i++) { if (m.xs[i] < minx) minx = m.xs[i]; if (m.ys[i] < miny) miny = m.ys[i]; }
  const origin = { x: Math.floor(minx / 100) * 100, y: Math.floor(miny / 100) * 100, z: 0 };
  const meta = { v: 1, origin, nv, nt, hasKind: !!m.triKind, bbox: m.bbox, robustBBox: m.robustBBox, zInfo: m.zInfo, stats: m.stats, weekKey: m.weekKey || '', fileName: m.fileName || '', ...(extraMeta || {}) };
  const mb = new TextEncoder().encode(JSON.stringify(meta));
  const head = align4(12 + mb.length);
  const buf = new ArrayBuffer(head + nv * 12 + nt * 12 + align4(nt));
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  for (let i = 0; i < 4; i++) u8[i] = MAGIC.charCodeAt(i);
  dv.setUint32(4, 1, true); dv.setUint32(8, head - 12, true); u8.set(mb, 12);
  const fx = new Float32Array(buf, head, nv), fy = new Float32Array(buf, head + nv * 4, nv), fz = new Float32Array(buf, head + nv * 8, nv);
  for (let i = 0; i < nv; i++) { fx[i] = m.xs[i] - origin.x; fy[i] = m.ys[i] - origin.y; fz[i] = m.zs[i] - origin.z; }
  new Uint32Array(buf, head + nv * 12, nt * 3).set(m.triangles);
  if (m.triKind) u8.set(m.triKind, head + nv * 12 + nt * 12);
  return buf;
}

export function unpackTerrain(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== MAGIC) throw new Error('Файл рельефа повреждён (нет сигнатуры GT3D)');
  const metaLen = dv.getUint32(8, true), meta = JSON.parse(trimMeta(new TextDecoder().decode(u8.subarray(12, 12 + metaLen))));
  const head = 12 + metaLen, { nv, nt, origin } = meta;
  const fx = new Float32Array(buf, head, nv), fy = new Float32Array(buf, head + nv * 4, nv), fz = new Float32Array(buf, head + nv * 8, nv);
  const xs = new Float64Array(nv), ys = new Float64Array(nv), zs = new Float64Array(nv);
  for (let i = 0; i < nv; i++) { xs[i] = fx[i] + origin.x; ys[i] = fy[i] + origin.y; zs[i] = fz[i] + origin.z; }
  const triangles = new Uint32Array(buf.slice(head + nv * 12, head + nv * 12 + nt * 12));
  const triKind = meta.hasKind ? new Uint8Array(buf.slice(head + nv * 12 + nt * 12, head + nv * 12 + nt * 12 + nt)) : null;
  return { xs, ys, zs, triangles, triKind, bbox: meta.bbox, robustBBox: meta.robustBBox, zInfo: meta.zInfo, stats: meta.stats, weekKey: meta.weekKey, fileName: meta.fileName, meta };
}

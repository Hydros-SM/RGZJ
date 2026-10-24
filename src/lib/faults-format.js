// Чтение поверхностей разломов из пакета (двоичный формат PF3D основной платформы), названия/группы по слою DXF и геометрия линий выхода на рельеф.
// Копия нужных частей основной платформы (lib/pit3d-faults.js, lib/pit3d-fault-class.js) без обращения к базе.
const MAGIC = 'PF3D';

export function faultDisplayName(raw) { return String(raw || '').replace(/^GM_-_/, '').replace(/[-_ ]+$/, '') || String(raw || ''); }
export function faultGroup(raw) {
  const n = faultDisplayName(raw);
  if (/^SRG/i.test(n)) return 'ЮРГ (SRG)';
  if (/^NRG/i.test(n)) return 'СРГ (NRG)';
  if (/^F\d/i.test(n)) return 'Серия F';
  if (/^faulth/i.test(n)) return 'faulth';
  if (/^Distance/i.test(n)) return 'Distance';
  return 'Слои с датами';
}
export const FAULT_GROUP_COLORS = { 'ЮРГ (SRG)': '#2563eb', 'СРГ (NRG)': '#dc2626', 'Серия F': '#ea580c', faulth: '#9333ea', Distance: '#0d9488', 'Слои с датами': '#6b7280' };

function trimMeta(t) { let e = t.length; while (e > 0 && t.charCodeAt(e - 1) <= 32) e--; return t.slice(0, e); }
export function unpackFaultsModel(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== MAGIC) throw new Error('Файл разломов повреждён (нет сигнатуры PF3D)');
  const metaLen = dv.getUint32(8, true);
  const meta = JSON.parse(trimMeta(new TextDecoder().decode(u8.subarray(12, 12 + metaLen))));
  const head = 12 + metaLen;
  const surfaces = meta.surfaces.map((s, i) => ({ key: s.key, display: faultDisplayName(s.key), group: faultGroup(s.key), n: s.n, bbox: s.bbox, index: i, tris: new Float32Array(buf, head + s.off * 4, s.n * 9) }));
  return { origin: meta.origin, bbox: meta.bbox, source: meta.source, surfaces };
}

// Класс водообильности и роль (метки как в основной платформе)
export const WATER_CLASSES = { aquifer: 'Водоносный', low: 'Маловодообильный', dry: 'Сухой', unknown: 'Не определён' };
export const WATER_CLASS_COLORS = { aquifer: '#2563eb', low: '#eab308', dry: '#9ca3af', unknown: '#a78bfa' };
export const ROLES = { conductor: 'Проводник', barrier: 'Барьер', neutral: 'Нейтральный', unknown: 'Не определена' };

// Линия выхода поверхности разлома на рельеф: плоские пары концов отрезков [x1, y1, x2, y2, …] (по всему рельефу)
export function traceSegments(s, o, zAt) {
  const T = s.tris, segs = [];
  for (let i = 0; i < T.length; i += 9) {
    const X = [T[i] + o.x, T[i + 3] + o.x, T[i + 6] + o.x], Y = [T[i + 1] + o.y, T[i + 4] + o.y, T[i + 7] + o.y], Z = [T[i + 2] + o.z, T[i + 5] + o.z, T[i + 8] + o.z];
    const F = [0, 1, 2].map((k) => { const zt = zAt(X[k], Y[k]); return zt === zt ? Z[k] - zt : NaN; });
    if (F.some((f) => f !== f)) continue;
    if ((F[0] > 0 && F[1] > 0 && F[2] > 0) || (F[0] < 0 && F[1] < 0 && F[2] < 0)) continue;
    const pts = [];
    for (let k = 0; k < 3; k++) {
      const a = k, c = (k + 1) % 3;
      if ((F[a] > 0) !== (F[c] > 0) && F[a] !== F[c]) { const t = F[a] / (F[a] - F[c]); pts.push([X[a] + t * (X[c] - X[a]), Y[a] + t * (Y[c] - Y[a])]); }
    }
    if (pts.length >= 2) segs.push(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
  }
  return segs;
}

// Отметка рельефа схемы в любой точке X/Y: модель — TIN из pit3d-terrain.js (xs, ys, zs, triangles, triKind). Треугольник ищется по равномерной
// сетке, отметка — барицентрическая интерполяция (точно по треугольнику, без промежуточной растеризации). Вне рельефа — null.
export function makeTerrainSampler(model) {
  const xs = model.xs, ys = model.ys, zs = model.zs, T = model.triangles, kind = model.triKind || null;
  const nT = Math.floor(T.length / 3);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < xs.length; i++) { if (xs[i] < x0) x0 = xs[i]; if (xs[i] > x1) x1 = xs[i]; if (ys[i] < y0) y0 = ys[i]; if (ys[i] > y1) y1 = ys[i]; }
  const G = Math.max(16, Math.min(512, Math.round(Math.sqrt(nT / 2)))), cw = (x1 - x0) / G || 1, ch = (y1 - y0) / G || 1;
  const cellX = (x) => Math.min(G - 1, Math.max(0, Math.floor((x - x0) / cw))), cellY = (y) => Math.min(G - 1, Math.max(0, Math.floor((y - y0) / ch)));
  const range = (t) => {
    const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2];
    return [cellX(Math.min(xs[a], xs[b], xs[c])), cellX(Math.max(xs[a], xs[b], xs[c])), cellY(Math.min(ys[a], ys[b], ys[c])), cellY(Math.max(ys[a], ys[b], ys[c]))];
  };
  const count = new Int32Array(G * G + 1);
  for (let t = 0; t < nT; t++) { const [i0, i1, j0, j1] = range(t); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) count[j * G + i + 1]++; }
  for (let c = 0; c < G * G; c++) count[c + 1] += count[c];
  const start = count, fill = start.slice(0, G * G), items = new Int32Array(start[G * G]);
  for (let t = 0; t < nT; t++) { const [i0, i1, j0, j1] = range(t); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) items[fill[j * G + i]++] = t; }

  // → { z, kind } | null; kind: 0 природный рельеф, 1 карьер, 2 отвал (если в модели есть признак); при нескольких треугольниках в точке — верхний
  function sample(x, y) {
    if (!(x >= x0 && x <= x1 && y >= y0 && y <= y1)) return null;
    const c = cellY(y) * G + cellX(x);
    let best = null;
    for (let p = start[c]; p < start[c + 1]; p++) {
      const t = items[p], a = T[3 * t], b = T[3 * t + 1], d = T[3 * t + 2];
      const ax = xs[a], ay = ys[a], bx = xs[b], by = ys[b], cx = xs[d], cy = ys[d];
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(den) < 1e-12) continue;
      const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den, l3 = 1 - l1 - l2;
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
      const z = l1 * zs[a] + l2 * zs[b] + l3 * zs[d];
      if (!best || z > best.z) best = { z, kind: kind ? kind[t] : null };
    }
    return best;
  }
  return { sample, zAt: (x, y) => { const s = sample(x, y); return s ? s.z : NaN; }, bbox: { xMin: x0, xMax: x1, yMin: y0, yMax: y1 }, triangles: nT };
}

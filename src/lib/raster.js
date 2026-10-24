// Рельеф (TIN из пакета) → canvas со ступенями цвета по высоте: подложка вкладки «Модель» (план) и запасная подложка «Карты», если в пакете нет картинки схемы.
export function makeRaster(m, maxDim = 1800) {
  const { xs, ys, zs, triangles: T } = m;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < xs.length; i++) { if (xs[i] < x0) x0 = xs[i]; if (xs[i] > x1) x1 = xs[i]; if (ys[i] < y0) y0 = ys[i]; if (ys[i] > y1) y1 = ys[i]; if (zs[i] < zmin) zmin = zs[i]; if (zs[i] > zmax) zmax = zs[i]; }
  const s = maxDim / Math.max(x1 - x0, y1 - y0), W = Math.max(2, Math.round((x1 - x0) * s)), H = Math.max(2, Math.round((y1 - y0) * s));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#eef0f2'; ctx.fillRect(0, 0, W, H);
  const B = 16, paths = Array.from({ length: B }, () => new Path2D());
  for (let j = 0; j < T.length; j += 3) {
    const a = T[j], b = T[j + 1], d = T[j + 2];
    const band = Math.max(0, Math.min(B - 1, Math.floor(((zs[a] + zs[b] + zs[d]) / 3 - zmin) / (zmax - zmin || 1) * B)));
    const p = paths[band];
    p.moveTo((xs[a] - x0) * s, H - (ys[a] - y0) * s); p.lineTo((xs[b] - x0) * s, H - (ys[b] - y0) * s); p.lineTo((xs[d] - x0) * s, H - (ys[d] - y0) * s); p.closePath();
  }
  paths.forEach((p, k) => { ctx.fillStyle = `hsl(32, 16%, ${34 + (56 * k) / (B - 1)}%)`; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.7; ctx.fill(p); ctx.stroke(p); });
  return { el: c, bounds: { xMin: x0, xMax: x1, yMin: y0, yMax: y1 }, zmin, zmax };
}

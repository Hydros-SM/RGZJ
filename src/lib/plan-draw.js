// Рисование слоёв плана в мировых координатах (X — восток, Y — север; холст перевёрнут по Y, поэтому тексты рисуются в экранных координатах).
// Общее для вкладок «Карта» (подложка — картинка схемы) и «Модель» (подложка — рельеф).
import { STATUS_COLORS } from './map-style.js';
import { FAULT_GROUP_COLORS, WATER_CLASS_COLORS } from './faults-format.js';

export const LAYERS = [
  ['points', 'Точки замера'], ['outflows', 'Выходы воды'], ['domains', 'Домены'], ['faults2d', 'Разломы (линии карты)'], ['faults3d', 'Разломы 3D (линии выхода)'],
  ['piezo', 'Пьезометры'], ['sensors', 'Датчики'], ['observation', 'Наблюдательные скважины'], ['horizontal', 'Горизонтальные скважины'],
];
export const DEFAULT_LAYERS = { points: true, outflows: true, domains: true, faults2d: false, faults3d: true, piezo: true, sensors: true, observation: true, horizontal: true };
const INTENSITY_PX = { 'Слабая (капёж)': 4.5, 'Умеренная': 7, 'Сильная (поток)': 10.5, 'Очень сильная': 14 };
export const OUTFLOW_COLOR = '#0e7490';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function label(ctx, txt, sx, sy, color, size = 11) {
  ctx.font = '600 ' + size + 'px sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.strokeText(txt, sx, sy); ctx.fillStyle = color; ctx.fillText(txt, sx, sy);
}

// S: { data, layers, points, outflows, traces, faults, selected, sel }; cam: { cx, cy, k }; size: { W, H }. Возвращает список объектов для выбора по касанию.
export function drawOverlay(ctx, cam, size, dpr, S) {
  const { k } = cam, L = S.layers, picks = [];
  const toS = (x, y) => ({ sx: (x - cam.cx) * k + size.W / 2, sy: size.H / 2 - (y - cam.cy) * k });
  const world = () => ctx.setTransform(k * dpr, 0, 0, -k * dpr, (size.W / 2 - cam.cx * k) * dpr, (size.H / 2 + cam.cy * k) * dpr);
  const screen = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const D = S.data, texts = []; // подписи откладываем и рисуем поверх всего
  world(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  if (L.domains && D.domains) D.domains.forEach((d) => {
    (d.rings || []).forEach((r) => { ctx.beginPath(); r.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fillStyle = d.fill || 'rgba(120,120,120,.12)'; ctx.fill(); ctx.strokeStyle = d.stroke || '#888'; ctx.lineWidth = 1.6 / k; ctx.stroke(); });
    const r0 = (d.rings || [])[0];
    if (r0 && k > 0.15) { const c = r0.reduce((a, q) => [a[0] + q[0] / r0.length, a[1] + q[1] / r0.length], [0, 0]); texts.push({ x: c[0], y: c[1], t: d.name, color: d.stroke || '#555', size: 12, bold: true }); }
  });
  const FV0 = S.fview || {};
  if (L.faults2d && D.faults2d) {
    ctx.globalAlpha = FV0.lineOpacity != null ? FV0.lineOpacity : 1; ctx.strokeStyle = (FV0.color || D.faults2d.color || '#e05c5c') + 'cc'; ctx.lineWidth = 1.4 / k;
    ctx.beginPath(); (D.faults2d.lines || []).forEach((ln) => { ln.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); }); ctx.stroke(); ctx.globalAlpha = 1;
  }
  const FV = S.fview || {}, fHidden = new Set(FV.hidden || []);
  if (L.faults3d && S.faults) S.faults.surfaces.forEach((s) => {
    const g = S.traces[s.key]; if (!g || !g.length || fHidden.has(s.key)) return;
    const fp = (D.faultProps || {})[s.key], col = FV.color || (fp && fp.water_class ? WATER_CLASS_COLORS[fp.water_class] : (FAULT_GROUP_COLORS[s.group] || '#888'));
    const sel = S.selected && S.selected.kind === 'fault' && S.selected.key === s.key;
    ctx.beginPath(); for (let i = 0; i < g.length; i += 4) { ctx.moveTo(g[i], g[i + 1]); ctx.lineTo(g[i + 2], g[i + 3]); }
    if (sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 7 / k; ctx.stroke(); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 4 / k; ctx.stroke(); } else { ctx.globalAlpha = FV.lineOpacity != null ? FV.lineOpacity : 1; ctx.strokeStyle = col; ctx.lineWidth = 2.2 / k; ctx.stroke(); ctx.globalAlpha = 1; }
    // центр линии — для подписи и выбора
    let sx = 0, sy = 0, n = 0; for (let i = 0; i < g.length; i += 4) { sx += g[i] + g[i + 2]; sy += g[i + 1] + g[i + 3]; n += 2; }
    const name = (fp && fp.title) || s.display; texts.push({ x: sx / n, y: sy / n, t: name, color: col, size: 11, bold: true, minK: 0.5 });
    picks.push({ kind: 'fault', key: s.key, name, segs: g, rPx: 10 });
  });

  // скважины и пьезометры
  const wellLine = (w, color, dash) => { if (!w.end) return; ctx.beginPath(); ctx.moveTo(w.collar.x, w.collar.y); ctx.lineTo(w.end.x, w.end.y); ctx.strokeStyle = color; ctx.lineWidth = 2.2 / k; ctx.setLineDash(dash ? [6 / k, 4 / k] : []); ctx.stroke(); ctx.setLineDash([]); };
  const dot = (x, y, r, fill, stroke) => { ctx.beginPath(); ctx.arc(x, y, r / k, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke || '#fff'; ctx.lineWidth = 1.4 / k; ctx.stroke(); };
  if (L.horizontal && D.horizontal) D.horizontal.forEach((w) => { wellLine(w, w.isPiezo ? '#7c3aed' : '#475569', false); dot(w.collar.x, w.collar.y, 4, w.isPiezo ? '#7c3aed' : '#475569'); picks.push({ kind: 'horizontal', item: w, x: w.collar.x, y: w.collar.y, rPx: 11 }); if (k > 1.2) texts.push({ x: w.collar.x, y: w.collar.y, t: w.name, color: '#475569', size: 11, dx: 8 }); });
  if (L.piezo && D.piezo) D.piezo.forEach((w) => { wellLine(w, '#0ea5e9', true); dot(w.collar.x, w.collar.y, 4.5, '#0ea5e9'); picks.push({ kind: 'piezo', item: w, x: w.collar.x, y: w.collar.y, rPx: 11 }); if (k > 1.2) texts.push({ x: w.collar.x, y: w.collar.y, t: w.name, color: '#0369a1', size: 11, dx: 8 }); });
  if (L.sensors && D.piezo) D.piezo.forEach((w) => w.sensors.forEach((s) => { dot(s.x, s.y, 3, '#1e3a8a'); picks.push({ kind: 'sensor', item: { ...s, well: w.name }, x: s.x, y: s.y, rPx: 9 }); }));
  if (L.observation && D.observation) D.observation.forEach((w) => {
    const r = 5 / k; ctx.beginPath(); ctx.moveTo(w.collar.x, w.collar.y + r); ctx.lineTo(w.collar.x - r, w.collar.y - r * 0.7); ctx.lineTo(w.collar.x + r, w.collar.y - r * 0.7); ctx.closePath(); ctx.fillStyle = w.kind === 'well_exp' ? '#16a34a' : '#0d9488'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2 / k; ctx.stroke();
    picks.push({ kind: 'observation', item: w, x: w.collar.x, y: w.collar.y, rPx: 11 }); if (k > 1.2) texts.push({ x: w.collar.x, y: w.collar.y, t: w.name, color: '#0f766e', size: 11, dx: 8 });
  });

  // точки замера и выходы воды
  if (L.points) S.points.forEach((p) => {
    if (p.x_local == null || p.y_local == null) return;
    const px = clamp(INTENSITY_PX[p.intensity] || 5.5, 4, 16), col = STATUS_COLORS[p.status] || '#666', sel = S.selected && S.selected.kind === 'point' && S.selected.item.point_number === p.point_number;
    ctx.beginPath(); ctx.arc(p.x_local, p.y_local, px * 1.6 / k, 0, Math.PI * 2); ctx.fillStyle = col + '30'; ctx.fill();
    ctx.beginPath(); ctx.arc(p.x_local, p.y_local, px / k, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = sel ? '#f59e0b' : 'rgba(255,255,255,.9)'; ctx.lineWidth = (sel ? 3 : 1.5) / k; ctx.stroke();
    if (p._field) { ctx.beginPath(); ctx.arc(p.x_local, p.y_local, px * 2.1 / k, 0, Math.PI * 2); ctx.setLineDash([3 / k, 3 / k]); ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 2 / k; ctx.stroke(); ctx.setLineDash([]); } // созданные в поле — с фиолетовым пунктирным кольцом
    picks.push({ kind: 'point', item: p, x: p.x_local, y: p.y_local, rPx: px + 6 });
    if (k > 0.9) texts.push({ x: p.x_local, y: p.y_local, t: String(p.point_number), color: '#fff', size: 10, center: true, plain: true });
  });
  if (L.outflows) S.outflows.forEach((o) => {
    if (o.x_local == null || o.y_local == null) return;
    const col = o._field ? '#7c3aed' : (o.status === 'Пересохла' ? '#8a8f98' : OUTFLOW_COLOR), r = 4.6 / k, sel = S.selected && S.selected.kind === 'outflow' && S.selected.item.id === o.id;
    const par = S.points.find((q) => q.point_number === o.parent_number);
    if (par && par.x_local != null) { ctx.beginPath(); ctx.moveTo(par.x_local, par.y_local); ctx.lineTo(o.x_local, o.y_local); ctx.setLineDash([4 / k, 3 / k]); ctx.strokeStyle = col + 'b0'; ctx.lineWidth = 1 / k; ctx.stroke(); ctx.setLineDash([]); }
    ctx.save(); ctx.translate(o.x_local, o.y_local); ctx.rotate(Math.PI / 4); ctx.fillStyle = col; ctx.strokeStyle = sel ? '#f59e0b' : '#fff'; ctx.lineWidth = (sel ? 2.6 : 1.3) / k; ctx.beginPath(); ctx.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6); ctx.fill(); ctx.stroke(); ctx.restore();
    picks.push({ kind: 'outflow', item: o, x: o.x_local, y: o.y_local, rPx: 11 });
    if (k > 1.3) texts.push({ x: o.x_local, y: o.y_local, t: String(o.point_number).split('-').slice(1).join('-') || o.point_number, color: col, size: 10, dx: 9, dy: -6 });
  });

  screen();
  texts.forEach((t) => { if (t.minK && k < t.minK) return; const p = toS(t.x, t.y); if (t.center) { ctx.font = '700 ' + t.size + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = t.color; ctx.fillText(t.t, p.sx, p.sy + 0.5); } else label(ctx, t.t, p.sx + (t.dx || 0), p.sy + (t.dy || 0), t.color, t.size); });
  return picks;
}

// Ближайший объект к экранной точке (sx, sy); для линий разломов — расстояние до отрезков
export function pickNearest(picks, cam, size, sx, sy) {
  const k = cam.k, wx = (sx - size.W / 2) / k + cam.cx, wy = (size.H / 2 - sy) / k + cam.cy;
  let best = null, bd = Infinity;
  picks.forEach((p) => {
    let d;
    if (p.kind === 'fault') {
      d = Infinity; const g = p.segs;
      for (let i = 0; i < g.length; i += 4) { const dx = g[i + 2] - g[i], dy = g[i + 3] - g[i + 1], L2 = dx * dx + dy * dy, t = L2 < 1e-9 ? 0 : clamp(((wx - g[i]) * dx + (wy - g[i + 1]) * dy) / L2, 0, 1); const e = Math.hypot(wx - (g[i] + dx * t), wy - (g[i + 1] + dy * t)) * k; if (e < d) d = e; }
    } else d = Math.hypot(wx - p.x, wy - p.y) * k;
    const lim = p.rPx + (p.kind === 'fault' ? 0 : 0);
    if (d <= lim && (p.kind === 'fault' ? d + 4 : d) < bd) { bd = p.kind === 'fault' ? d + 4 : d; best = p; } // у разлома небольшой штраф: точки приоритетнее
  });
  return best;
}

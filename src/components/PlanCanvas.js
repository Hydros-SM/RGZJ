// План на canvas: подложка (картинка схемы или рельеф), слои поверх, масштаб колёсиком и щипком, сдвиг пальцем/мышью, выбор касанием.
// base: { kind: 'image' | 'raster', el (картинка или canvas), bounds: { xMin, xMax, yMin, yMax } }
import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { html } from '../lib/html.js';
import { drawOverlay, pickNearest } from '../lib/plan-draw.js';

export function PlanCanvas({ base, overlay, onPick, focus, placing, onPlace }) {
  const wrapRef = useRef(null), cvRef = useRef(null);
  const cam = useRef({ cx: 0, cy: 0, k: 0.3 }), size = useRef({ W: 400, H: 300 }), picks = useRef([]);
  const ptrs = useRef(new Map()), gesture = useRef(null), rafRef = useRef(0);
  const ov = useRef(overlay); ov.current = overlay;
  const pl = useRef({}); pl.current = { placing, onPlace }; // режим «указать место»: касание не выбирает объект, а отдаёт координаты
  const bs = useRef(base); bs.current = base;
  const focusRef = useRef(null); // запрошенный фокус (например, «Показать на карте»): подгонка вида при загрузке подложки его не сбрасывает
  const [coords, setCoords] = useState('');

  function draw() {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const cv = cvRef.current, B = bs.current;
      if (!cv) return;
      const { W, H } = size.current, dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const ctx = cv.getContext('2d'), { cx, cy, k } = cam.current;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#dfe3e8'; ctx.fillRect(0, 0, cv.width, cv.height);
      if (B && B.el) {
        ctx.setTransform(k * dpr, 0, 0, -k * dpr, (W / 2 - cx * k) * dpr, (H / 2 + cy * k) * dpr);
        const b = B.bounds; ctx.save(); ctx.translate(b.xMin, b.yMax); ctx.scale(1, -1); ctx.drawImage(B.el, 0, 0, b.xMax - b.xMin, b.yMax - b.yMin); ctx.restore();
      }
      if (ov.current) picks.current = drawOverlay(ctx, cam.current, size.current, dpr, ov.current);
    });
  }
  function applyFocus(f) { cam.current = { ...cam.current, cx: f.x, cy: f.y, k: Math.max(f.k || 1.5, 1.5) }; draw(); }
  function fit(force) {
    const B = bs.current; if (!B) return;
    if (force === true) focusRef.current = null;
    else if (focusRef.current) { applyFocus(focusRef.current); return; }
    const b = B.bounds, { W, H } = size.current;
    cam.current = { cx: (b.xMin + b.xMax) / 2, cy: (b.yMin + b.yMax) / 2, k: Math.min(W / (b.xMax - b.xMin), H / (b.yMax - b.yMin)) * 0.96 };
    draw();
  }
  const zoomAt = (sx, sy, f) => {
    const c = cam.current, k = Math.max(0.02, Math.min(80, c.k * f)), wx = (sx - size.current.W / 2) / c.k + c.cx, wy = (size.current.H / 2 - sy) / c.k + c.cy;
    cam.current = { k, cx: wx - (sx - size.current.W / 2) / k, cy: wy + (sy - size.current.H / 2) / k }; draw();
  };

  useEffect(() => {
    const wrap = wrapRef.current;
    const ro = new ResizeObserver(() => { const first = !size.current.init; size.current = { W: Math.max(50, wrap.clientWidth), H: Math.max(50, wrap.clientHeight), init: true }; if (first) fit(); else draw(); });
    ro.observe(wrap);
    const cv = cvRef.current, onWheel = (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY > 0 ? 0.85 : 1.18); };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => { ro.disconnect(); cv.removeEventListener('wheel', onWheel); cancelAnimationFrame(rafRef.current); };
  }, []);
  useEffect(() => { if (size.current.init) fit(); }, [base]);
  useEffect(() => { draw(); }); // слои, выбор и т.д. изменились — перерисовать
  useEffect(() => { if (focus) { focusRef.current = focus; applyFocus(focus); } }, [focus]);

  const rel = (e) => { const r = cvRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function down(e) {
    try { cvRef.current.setPointerCapture(e.pointerId); } catch (err) { /* синтетические события или потерянный указатель */ }
    ptrs.current.set(e.pointerId, rel(e));
    if (ptrs.current.size === 1) gesture.current = { moved: false, sx: e.clientX, sy: e.clientY, cx: cam.current.cx, cy: cam.current.cy, t: Date.now() };
    else if (ptrs.current.size === 2) { const [a, b] = Array.from(ptrs.current.values()); gesture.current = { pinch: true, d0: Math.hypot(a.x - b.x, a.y - b.y), k0: cam.current.k, moved: true }; }
  }
  function move(e) {
    const p = rel(e), g = gesture.current;
    if (ptrs.current.has(e.pointerId)) ptrs.current.set(e.pointerId, p);
    if (g && g.pinch && ptrs.current.size >= 2) { const [a, b] = Array.from(ptrs.current.values()); const d = Math.hypot(a.x - b.x, a.y - b.y); if (g.d0 > 5) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (g.k0 * d / g.d0) / cam.current.k); return; }
    if (g && !g.pinch && ptrs.current.size === 1) {
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
      if (Math.abs(dx) + Math.abs(dy) > 5) g.moved = true;
      if (g.moved) { cam.current = { ...cam.current, cx: g.cx - dx / cam.current.k, cy: g.cy + dy / cam.current.k }; draw(); }
    }
    const c = cam.current; setCoords('X ' + ((p.x - size.current.W / 2) / c.k + c.cx).toFixed(1) + '  Y ' + ((size.current.H / 2 - p.y) / c.k + c.cy).toFixed(1));
  }
  function up(e) {
    const g = gesture.current, p = rel(e);
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size === 0) {
      if (g && !g.moved && !g.pinch) {
        if (pl.current.placing && pl.current.onPlace) { const c = cam.current; pl.current.onPlace({ x: (p.x - size.current.W / 2) / c.k + c.cx, y: (size.current.H / 2 - p.y) / c.k + c.cy }); }
        else if (onPick) onPick(pickNearest(picks.current, cam.current, size.current, p.x, p.y));
      }
      gesture.current = null;
    } else if (g && g.pinch && ptrs.current.size < 2) gesture.current = { moved: true, sx: e.clientX, sy: e.clientY, cx: cam.current.cx, cy: cam.current.cy };
  }

  return html`
    <div ref=${wrapRef} class="plan-wrap">
      <canvas ref=${cvRef} class=${'plan-canvas' + (placing ? ' placing' : '')} onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up} />
      <div class="plan-tools">
        <button class="plan-btn" onClick=${() => zoomAt(size.current.W / 2, size.current.H / 2, 1.4)} title="Приблизить"><${ZoomIn} size=${20} /></button>
        <button class="plan-btn" onClick=${() => zoomAt(size.current.W / 2, size.current.H / 2, 1 / 1.4)} title="Отдалить"><${ZoomOut} size=${20} /></button>
        <button class="plan-btn" onClick=${() => fit(true)} title="Вся карта"><${Maximize2} size=${20} /></button>
      </div>
      <div class="plan-coords">${coords || '—'}</div>
    </div>`;
}

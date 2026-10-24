// Вкладки «Карта» (подложка — схема карьера) и «Модель» (подложка — рельеф): общий план со слоями и карточкой объекта.
import React, { useEffect, useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import { html } from '../lib/html.js';
import { LAYERS, DEFAULT_LAYERS } from '../lib/plan-draw.js';
import { makeRaster } from '../lib/raster.js';
import { PlanCanvas } from '../components/PlanCanvas.js';
import { InfoSheet } from '../components/InfoSheet.js';

function useImage(url) {
  const [img, setImg] = useState(null);
  useEffect(() => {
    if (!url) { setImg(null); return undefined; }
    let cancelled = false; const im = new Image();
    im.onload = () => { if (!cancelled) setImg(im); }; im.onerror = () => { if (!cancelled) setImg(null); }; im.src = url;
    return () => { cancelled = true; };
  }, [url]);
  return img;
}

// mode: 'map' | 'model'
export function PlanPage({ session, mode, focusRequest }) {
  const lsKey = 'field-layers-' + mode;
  const [layers, setLayers] = useState(() => { try { return { ...DEFAULT_LAYERS, ...(mode === 'map' ? { faults2d: true, faults3d: false } : {}), ...JSON.parse(localStorage.getItem(lsKey) || '{}') }; } catch (e) { return { ...DEFAULT_LAYERS }; } });
  const [panel, setPanel] = useState(false);
  const [selected, setSelected] = useState(null);
  const [focus, setFocus] = useState(null);
  const img = useImage(mode === 'map' ? session.mapUrl : null);
  const raster = useMemo(() => (mode === 'model' || (mode === 'map' && !session.mapUrl) ? makeRaster(session.terrain) : null), [session, mode]);
  const base = useMemo(() => {
    if (mode === 'map' && img && session.manifest.scheme && session.manifest.scheme.bounds) return { kind: 'image', el: img, bounds: session.manifest.scheme.bounds };
    return raster ? { kind: 'raster', el: raster.el, bounds: raster.bounds } : null;
  }, [mode, img, raster, session]);
  useEffect(() => { try { localStorage.setItem(lsKey, JSON.stringify(layers)); } catch (e) { /* не критично */ } }, [layers]);
  useEffect(() => { if (focusRequest) { setSelected(focusRequest.selected); if (focusRequest.x != null) setFocus({ x: focusRequest.x, y: focusRequest.y, k: 2, n: focusRequest.n }); } }, [focusRequest]);

  const overlay = { data: session.data, layers, points: session.points, outflows: session.outflows, traces: session.traces, faults: session.faults, selected };
  const select = (p) => {
    if (!p) { setSelected(null); return; }
    if (p.kind === 'fault') setSelected({ kind: 'fault', key: p.key });
    else setSelected({ kind: p.kind, item: p.item });
  };
  const noMap = mode === 'map' && !session.mapUrl;
  return html`
    <div class="plan-page">
      <${PlanCanvas} base=${base} overlay=${overlay} onPick=${select} focus=${focus} />
      <button class="layers-btn" onClick=${() => setPanel((v) => !v)}><${Layers} size=${18} /> Слои</button>
      ${panel && html`<div class="layers-panel">
        ${LAYERS.filter(([k]) => (k !== 'faults3d' || session.faults)).map(([k, label]) => html`<label key=${k}><input type="checkbox" checked=${!!layers[k]} onChange=${(e) => setLayers((l) => ({ ...l, [k]: e.target.checked }))} /> ${label}</label>`)}
      </div>`}
      ${noMap && html`<div class="plan-note">В пакете нет картинки схемы — подложка построена по рельефу.</div>`}
      <${InfoSheet} session=${session} selected=${selected} onClose=${() => setSelected(null)} onSelect=${setSelected} />
    </div>`;
}

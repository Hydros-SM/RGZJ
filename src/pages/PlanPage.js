// Вкладки «Карта» (подложка — схема карьера) и «Модель» (подложка — рельеф; есть переключатель «План / 3D»): слои и карточка объекта.
import React, { useEffect, useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import { html } from '../lib/html.js';
import { LAYERS, DEFAULT_LAYERS } from '../lib/plan-draw.js';
import { LAYERS_3D, DEFAULT_LAYERS_3D } from '../lib/scene3d.js';
import { makeRaster } from '../lib/raster.js';
import { PlanCanvas } from '../components/PlanCanvas.js';
import { Scene3D } from '../components/Scene3D.js';
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
const ls = (key, def) => { try { return { ...def, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch (e) { return { ...def }; } };
const lsSet = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* не критично */ } };

// mode: 'map' | 'model'
export function PlanPage({ session, mode, focusRequest }) {
  const [layers, setLayers] = useState(() => ls('field-layers-' + mode, mode === 'map' ? { ...DEFAULT_LAYERS, faults2d: true, faults3d: false } : DEFAULT_LAYERS));
  const [layers3d, setLayers3d] = useState(() => ls('field-layers3d', DEFAULT_LAYERS_3D));
  const [view, setView] = useState(() => (mode === 'model' ? (localStorage.getItem('field-view') || 'plan') : 'plan'));
  const [vexag, setVexag] = useState(1);
  const [terrainOp, setTerrainOp] = useState(0.6);
  const [viewCmd, setViewCmd] = useState(null);
  const [panel, setPanel] = useState(false);
  const [selected, setSelected] = useState(null);
  const [focus, setFocus] = useState(null);
  const is3d = mode === 'model' && view === '3d';
  const img = useImage(mode === 'map' ? session.mapUrl : null);
  const raster = useMemo(() => (mode === 'model' || (mode === 'map' && !session.mapUrl) ? makeRaster(session.terrain) : null), [session, mode]);
  const base = useMemo(() => {
    if (mode === 'map' && img && session.manifest.scheme && session.manifest.scheme.bounds) return { kind: 'image', el: img, bounds: session.manifest.scheme.bounds };
    return raster ? { kind: 'raster', el: raster.el, bounds: raster.bounds } : null;
  }, [mode, img, raster, session]);
  useEffect(() => { lsSet('field-layers-' + mode, layers); }, [layers]);
  useEffect(() => { lsSet('field-layers3d', layers3d); }, [layers3d]);
  useEffect(() => { try { if (mode === 'model') localStorage.setItem('field-view', view); } catch (e) { /* не критично */ } }, [view]);
  useEffect(() => { if (focusRequest) { setSelected(focusRequest.selected); if (focusRequest.x != null) setFocus({ x: focusRequest.x, y: focusRequest.y, k: 2, n: focusRequest.n }); } }, [focusRequest]);

  const overlay = { data: session.data, layers, points: session.points, outflows: session.outflows, traces: session.traces, faults: session.faults, selected };
  const select = (p) => {
    if (!p) { setSelected(null); return; }
    if (p.kind === 'fault') setSelected({ kind: 'fault', key: p.key });
    else setSelected({ kind: p.kind, item: p.item });
  };
  const noMap = mode === 'map' && !session.mapUrl;
  const list = is3d ? LAYERS_3D : LAYERS;
  const cur = is3d ? layers3d : layers, setCur = is3d ? setLayers3d : setLayers;
  const hasFaults = !!session.faults;
  return html`
    <div class="plan-page">
      ${is3d ? html`<${Scene3D} session=${session} layers=${layers3d} vexag=${vexag} terrainOp=${terrainOp} selected=${selected} onPick=${select} focus=${focus} viewCmd=${viewCmd} />`
        : html`<${PlanCanvas} base=${base} overlay=${overlay} onPick=${select} focus=${focus} />`}
      ${mode === 'model' && html`<div class="view-switch">
        <button class=${view === 'plan' ? 'on' : ''} onClick=${() => setView('plan')}>План</button>
        <button class=${view === '3d' ? 'on' : ''} onClick=${() => setView('3d')}>3D</button>
        ${is3d && html`<span class="sep" /><button onClick=${() => setViewCmd({ type: 'fit', n: Date.now() })}>Вся модель</button><button onClick=${() => setViewCmd({ type: 'top', n: Date.now() })}>Сверху</button>
          <label class="vex">Рельеф<select value=${terrainOp} onChange=${(e) => setTerrainOp(Number(e.target.value))}>${[[1, '100%'], [0.6, '60%'], [0.3, '30%']].map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}</select></label>
          <label class="vex">Высота ×<select value=${vexag} onChange=${(e) => setVexag(Number(e.target.value))}>${[1, 1.5, 2, 3, 4].map((v) => html`<option key=${v} value=${v}>${v}</option>`)}</select></label>`}
      </div>`}
      <button class="layers-btn" onClick=${() => setPanel((v) => !v)}><${Layers} size=${18} /> Слои</button>
      ${panel && html`<div class="layers-panel">
        ${list.filter(([k]) => hasFaults || !/^fault/.test(k)).map(([k, label]) => html`<label key=${k}><input type="checkbox" checked=${cur[k] !== false && !!cur[k]} onChange=${(e) => setCur((l) => ({ ...l, [k]: e.target.checked }))} /> ${label}</label>`)}
      </div>`}
      ${noMap && html`<div class="plan-note">В пакете нет картинки схемы — подложка построена по рельефу.</div>`}
      <${InfoSheet} session=${session} selected=${selected} onClose=${() => setSelected(null)} onSelect=${setSelected} />
    </div>`;
}

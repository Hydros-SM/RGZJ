// Вкладки «Карта» (подложка — схема карьера) и «Модель» (подложка — рельеф; есть переключатель «План / 3D»): слои и карточка объекта.
import React, { useEffect, useMemo, useState } from 'react';
import { Layers, Plus, X, Settings } from 'lucide-react';
import { html } from '../lib/html.js';
import { LAYERS, DEFAULT_LAYERS } from '../lib/plan-draw.js';
import { LAYERS_3D, DEFAULT_LAYERS_3D } from '../lib/scene3d.js';
import { makeRaster } from '../lib/raster.js';
import { PlanCanvas } from '../components/PlanCanvas.js';
import { Scene3D } from '../components/Scene3D.js';
import { InfoSheet } from '../components/InfoSheet.js';
import { PointsSettings, FaultsSettings, TerrainSettings, PoiSettings } from '../components/LayerSettings.js';
import { UavSettings } from '../components/UavSettings.js';
import { listScans, loadScan } from '../lib/uav-store.js';
import { computePoi } from '../lib/session.js';

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
const GEAR = { points: 'points', poi: 'poi', outflows: 'points', faults2d: 'faults', faults3d: 'faults', faultSurf: 'faults', faultAir: 'faults', faultLines: 'faults', terrain: 'terrain', contours: 'terrain', uavPhoto: 'uavPhoto', uavThermal: 'uavThermal' };

export function PlanPage({ session, mode, focusRequest, placing, onStart, onPlace, onCancelPlace, vs, setVs, onReady }) {
  const [layers, setLayers] = useState(() => ls('field-layers-' + mode, mode === 'map' ? { ...DEFAULT_LAYERS, faults2d: true, faults3d: false } : DEFAULT_LAYERS));
  const [layers3d, setLayers3d] = useState(() => ls('field-layers3d', DEFAULT_LAYERS_3D));
  const [view, setView] = useState(() => (mode === 'model' ? (localStorage.getItem('field-view') || 'plan') : 'plan'));
  const [vexag, setVexag] = useState(1);
  const terrainOp = vs.terrain.opacity, setTerrainOp = (v) => setVs({ ...vs, terrain: { ...vs.terrain, opacity: v } });
  const [viewCmd, setViewCmd] = useState(null);
  const [panel, setPanel] = useState(false);
  const [selected, setSelected] = useState(null);
  const [focus, setFocus] = useState(null);
  const [fab, setFab] = useState(false);
  const [hint, setHint] = useState('');
  const [dlg, setDlg] = useState('');
  const is3d = mode === 'model' && view === '3d';
  // съёмки БПЛА: список на устройстве и выбранные, загруженные в память (фото, тепловизор)
  const [scans, setScans] = useState([]);
  const [uavData, setUavData] = useState({ photo: null, thermal: null });
  const [uavErr, setUavErr] = useState('');
  const reloadScans = async () => { try { setScans(await listScans()); } catch (e) { setScans([]); } };
  useEffect(() => { reloadScans(); }, []);
  useEffect(() => {
    if (!is3d) return undefined;
    let off = false;
    ['photo', 'thermal'].forEach((k) => {
      const id = vs.uav[k].id;
      if (!id) { setUavData((d) => (d[k] ? { ...d, [k]: null } : d)); return; }
      if (uavData[k] && uavData[k].id === id) return;
      loadScan(id).then((data) => { if (!off) setUavData((d) => ({ ...d, [k]: { id, ...data } })); }).catch((e) => { if (!off) { setUavErr(String(e.message || e)); setUavData((d) => ({ ...d, [k]: null })); } });
    });
    return () => { off = true; };
  }, [is3d, vs.uav.photo.id, vs.uav.thermal.id, scans]);
  const uavProp = { photo: { data: uavData.photo, opacity: vs.uav.photo.opacity, replace: vs.uav.photo.replace }, thermal: { data: uavData.thermal, opacity: vs.uav.thermal.opacity } };
  const [loading3d, setLoading3d] = useState(false);
  const handleReady = () => { setLoading3d(false); onReady && onReady(); };
  useEffect(() => { if (is3d) setLoading3d(true); else { const t = setTimeout(handleReady, 0); return () => clearTimeout(t); } return undefined; }, [is3d]);
  const img = useImage(mode === 'map' ? session.mapUrl : null);
  const raster = useMemo(() => (mode === 'model' || (mode === 'map' && !session.mapUrl) ? makeRaster(session.terrain) : null), [session.terrain, session.mapUrl, mode]);
  const base = useMemo(() => {
    if (mode === 'map' && img && session.manifest.scheme && session.manifest.scheme.bounds) return { kind: 'image', el: img, bounds: session.manifest.scheme.bounds };
    return raster ? { kind: 'raster', el: raster.el, bounds: raster.bounds } : null;
  }, [mode, img, raster, session.manifest]);
  // при фиксации новой точки / выхода нужные слои должны быть видны — иначе записанный объект не увидеть и не выбрать
  useEffect(() => { if (placing) { const on = (l) => (l.points && l.outflows ? l : { ...l, points: true, outflows: true }); setLayers(on); setLayers3d(on); } }, [!!placing]);
  useEffect(() => { lsSet('field-layers-' + mode, layers); }, [layers]);
  useEffect(() => { lsSet('field-layers3d', layers3d); }, [layers3d]);
  useEffect(() => { try { if (mode === 'model') localStorage.setItem('field-view', view); } catch (e) { /* не критично */ } }, [view]);
  useEffect(() => { if (focusRequest) { setSelected(focusRequest.selected); if (focusRequest.x != null) setFocus({ x: focusRequest.x, y: focusRequest.y, k: 2, n: focusRequest.n }); } }, [focusRequest]);

  // Выбранный объект берём из актуальной сессии — после новой записи карточка показывает свежие данные
  const live = useMemo(() => {
    if (!selected || !selected.item) return selected;
    const it = selected.item;
    const fresh = selected.kind === 'point' ? session.points.find((p) => p.point_number === it.point_number)
      : selected.kind === 'outflow' ? session.outflows.find((o) => o.id === it.id) : null;
    return fresh && fresh !== it ? { ...selected, item: fresh } : selected;
  }, [selected, session.points, session.outflows]);
  const poi = useMemo(() => (mode === 'map' || !is3d ? computePoi(session, vs.poi) : null), [session.data, session.points, session.manifest, vs.poi, mode, is3d]);
  const overlay = { poi, pts: vs.pts, data: session.data, layers, points: session.points, outflows: session.outflows, traces: session.traces, faults: session.faults, fview: vs.faults, selected: live };
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
      ${loading3d && html`<div class="progress"><i /></div><div class="progress-msg">Строю 3D-модель…</div>`}
      ${is3d ? html`<${Scene3D} session=${session} fview=${vs.faults} tview=${vs.terrain} pts=${vs.pts} uav=${uavProp} onReady=${handleReady} layers=${layers3d} vexag=${vexag} terrainOp=${terrainOp} selected=${live} onPick=${select} focus=${focus} viewCmd=${viewCmd} placing=${!!placing} onPlace=${onPlace} />`
        : html`<${PlanCanvas} base=${base} overlay=${overlay} onPick=${select} focus=${focus} placing=${!!placing} onPlace=${onPlace} />`}
      ${mode === 'model' && html`<div class="view-switch">
        <button class=${view === 'plan' ? 'on' : ''} onClick=${() => setView('plan')}>План</button>
        <button class=${view === '3d' ? 'on' : ''} onClick=${() => setView('3d')}>3D</button>
        ${is3d && html`<span class="sep" /><button onClick=${() => setViewCmd({ type: 'fit', n: Date.now() })}>Вся модель</button><button onClick=${() => setViewCmd({ type: 'top', n: Date.now() })}>Сверху</button>
          <label class="vex">Рельеф<select value=${terrainOp} onChange=${(e) => setTerrainOp(Number(e.target.value))}>${[[1, '100%'], [0.6, '60%'], [0.3, '30%']].concat([1, 0.6, 0.3].includes(terrainOp) ? [] : [[terrainOp, Math.round(terrainOp * 100) + '%']]).map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}</select></label>
          <label class="vex">Высота ×<select value=${vexag} onChange=${(e) => setVexag(Number(e.target.value))}>${[1, 1.5, 2, 3, 4].map((v) => html`<option key=${v} value=${v}>${v}</option>`)}</select></label>`}
      </div>`}
      <button class="layers-btn" onClick=${() => setPanel((v) => !v)}><${Layers} size=${18} /> Слои</button>
      ${panel && html`<div class="layers-panel">
        ${list.filter(([k]) => hasFaults || !/^fault/.test(k)).map(([k, label]) => html`<div key=${k} class="layer-row"><label><input type="checkbox" checked=${cur[k] !== false && !!cur[k]} onChange=${(e) => setCur((l) => ({ ...l, [k]: e.target.checked }))} /> ${label}</label>${GEAR[k] && html`<button class="layer-gear" title="Настройки слоя" onClick=${() => { setDlg(GEAR[k]); setPanel(false); }}><${Settings} size=${17} /></button>`}</div>`)}
      </div>`}
      ${noMap && html`<div class="plan-note">В пакете нет картинки схемы — подложка построена по рельефу.</div>`}
      ${placing && html`<div class="placing-banner"><span>${placing.type === 'outflow' ? 'Коснитесь места, где вода выходит на поверхность (точка №' + placing.parent + ')' : 'Коснитесь места новой точки водопроявления'}${is3d ? ' — на поверхности рельефа' : ''}</span><button class="btn btn-outline" onClick=${onCancelPlace}>Отмена</button></div>`}
      ${!placing && hint && html`<div class="placing-banner"><span>${hint}</span><button class="btn btn-ghost" onClick=${() => setHint('')}><${X} size=${16} /></button></div>`}
      ${!placing && html`<div class=${'fab' + (selected ? ' with-sheet' : '')}>
        ${fab && html`<div class="fab-menu">
          <button onClick=${() => { setFab(false); onStart({ type: 'point' }); }}>Новая точка водопроявления</button>
          <button onClick=${() => { setFab(false); const p = selected && selected.kind === 'point' ? selected.item.point_number : selected && selected.kind === 'outflow' ? selected.item.parent_number : null; if (p) onStart({ type: 'outflow', parent: p }); else setHint('Сначала коснитесь точки замера, к которой относится выход воды, затем снова «Записать → Выход воды». Или откройте карточку точки и нажмите «Добавить выход воды».'); }}>Выход воды (для выбранной точки)</button>
          <button onClick=${() => { setFab(false); if (selected && selected.kind === 'point') onStart({ type: 'measure', parent: selected.item.point_number }); else setHint('Сначала коснитесь точки замера, затем «Записать → Новый замер».'); }}>Новый замер (для выбранной точки)</button>
        </div>`}
        <button class="fab-main" onClick=${() => setFab((v) => !v)}><${Plus} size=${22} /> Записать</button>
      </div>`}
      <${PoiSettings} open=${dlg === 'poi'} onClose=${() => setDlg('')} session=${session} vs=${vs} setVs=${setVs} poi=${poi} />
      ${!is3d && layers.poi && poi && html`<div class="poi-badge" title="Точки интереса: перемерено / всего">✓ ${poi.doneCount} / ${poi.total}</div>`}
      <${PointsSettings} open=${dlg === 'points'} onClose=${() => setDlg('')} session=${session} vs=${vs} setVs=${setVs} />
      <${TerrainSettings} open=${dlg === 'terrain'} onClose=${() => setDlg('')} session=${session} vs=${vs} setVs=${setVs} />
      <${UavSettings} open=${dlg === 'uavPhoto'} onClose=${() => setDlg('')} kind="photo" vs=${vs} setVs=${setVs} scans=${scans} reload=${reloadScans} />
      <${UavSettings} open=${dlg === 'uavThermal'} onClose=${() => setDlg('')} kind="thermal" vs=${vs} setVs=${setVs} scans=${scans} reload=${reloadScans} />
      ${uavErr && html`<div class="placing-banner"><span>${uavErr}</span><button class="btn btn-ghost" onClick=${() => setUavErr('')}><${X} size=${16} /></button></div>`}
      <${FaultsSettings} open=${dlg === 'faults'} onClose=${() => setDlg('')} session=${session} vs=${vs} setVs=${setVs} />
      <${InfoSheet} session=${session} selected=${live} onClose=${() => setSelected(null)} onSelect=${setSelected} onAction=${onStart} />
    </div>`;
}

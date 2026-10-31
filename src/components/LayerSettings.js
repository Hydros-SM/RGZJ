// Окна настроек слоёв: «Точки замера» (какие точки и на какую дату), «Разломы» (какие рисовать, цвет, прозрачность), «Рельеф 3D».
import React, { useMemo, useState } from 'react';
import { html } from '../lib/html.js';
import { Button, Dialog } from './ui.js';
import { FAULT_GROUP_COLORS } from '../lib/faults-format.js';
import { COLOR_MODES } from '../lib/terrain3d.js';

const fmtDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : (d || '—'); };
const Row = ({ children }) => html`<div class="ls-row">${children}</div>`;

export function PointsSettings({ open, onClose, session, vs: view, setVs: setView }) {
  const cfg = view.points, D = session.data, hasInterest = Array.isArray(D.interest);
  const rows = D.points || [];
  const dates = useMemo(() => Array.from(new Set(rows.filter((p) => p.kind !== 'outflow').map((p) => String(p.monitoring_date || '').slice(0, 10)).filter(Boolean))).sort(), [rows]);
  const nAll = useMemo(() => new Set(rows.filter((p) => p.kind !== 'outflow').map((p) => p.point_number)).size, [rows]);
  const set = (patch) => setView({ ...view, points: { ...cfg, ...patch } });
  const pts = view.pts, setPts = (patch) => setView({ ...view, pts: { ...pts, ...patch } });
  const per = D.period && D.period.mode !== 'all' ? 'С ' + fmtDate(D.period.from) + (D.period.to ? ' по ' + fmtDate(D.period.to) : '') + ' (последний замер каждой точки сохранён)' : 'весь период';
  return html`
    <${Dialog} open=${open} onClose=${onClose} title="Настройки слоя «Точки замера»" width="min(560px, 96vw)" footer=${html`<${Button} variant="outline" onClick=${() => setView({ ...view, points: { ...cfg, scope: 'interest', asOf: '' }, pts: { sizeP: 1, sizeO: 1, colorMode: 'status', colorP: '#1a73e8', colorO: '#0e7490' } })}>Сбросить<//><${Button} onClick=${onClose}>Готово<//>`}>
      <div class="ls-block">
        <b>Размер и цвет точек</b>
        <${Row}><span class="ls-lbl">Точки замера</span><input type="range" min="0.5" max="3" step="0.1" value=${pts.sizeP} onInput=${(e) => setPts({ sizeP: Number(e.target.value) })} /><b>×${pts.sizeP.toFixed(1)}</b><//>
        <${Row}><span class="ls-lbl">Выходы воды</span><input type="range" min="0.5" max="3" step="0.1" value=${pts.sizeO} onInput=${(e) => setPts({ sizeO: Number(e.target.value) })} /><b>×${pts.sizeO.toFixed(1)}</b><//>
        <label class="ls-opt"><input type="radio" name="ptcol" checked=${pts.colorMode !== 'custom'} onChange=${() => setPts({ colorMode: 'status' })} /> Цвет точек замера — по статусу (активная, иссякает, пересохла…)</label>
        <label class="ls-opt"><input type="radio" name="ptcol" checked=${pts.colorMode === 'custom'} onChange=${() => setPts({ colorMode: 'custom' })} /> Свои цвета</label>
        <${Row}><span class="ls-lbl">Точки замера</span><input type="color" value=${pts.colorP} disabled=${pts.colorMode !== 'custom'} onInput=${(e) => setPts({ colorP: e.target.value })} />${['#1a73e8', '#e11d48', '#f59e0b', '#16a34a', '#ffffff', '#111827'].map((c) => html`<button key=${c} class="ls-sw" style=${{ background: c }} onClick=${() => setPts({ colorMode: 'custom', colorP: c })} title=${c}></button>`)}<//>
        <${Row}><span class="ls-lbl">Выходы воды</span><input type="color" value=${pts.colorO} disabled=${pts.colorMode !== 'custom'} onInput=${(e) => setPts({ colorO: e.target.value })} />${['#0e7490', '#06b6d4', '#2563eb', '#f59e0b', '#ffffff', '#111827'].map((c) => html`<button key=${c} class="ls-sw" style=${{ background: c }} onClick=${() => setPts({ colorMode: 'custom', colorO: c })} title=${c}></button>`)}<//>
        <div class="ls-hint">Размер и цвет действуют на плане, на карте и в 3D. Записи, созданные в поле, остаются фиолетовыми, чтобы их было видно. На тёмной съёмке (ортофото, тепловизор) удобны светлые цвета.</div>
      </div>
      <div class="ls-block">
        <b>Какие точки показывать</b>
        <label class="ls-opt"><input type="radio" name="scope" checked=${cfg.scope !== 'all' || !hasInterest} onChange=${() => set({ scope: 'interest' })} /> ${hasInterest ? 'Точки интереса — выбранные при подготовке пакета (' + D.interest.length + ')' : 'Все точки пакета (' + nAll + ')'}</label>
        <label class="ls-opt"><input type="radio" name="scope" checked=${cfg.scope === 'all' && hasInterest} onChange=${() => set({ scope: 'all' })} disabled=${!hasInterest} /> Все точки, которые есть в пакете (${nAll})</label>
        ${!hasInterest && html`<div class="ls-hint">В этом пакете выбор «точек интереса» не задавался — в нём все зарегистрированные точки. Выбирать их можно при подготовке пакета.</div>`}
        ${hasInterest && nAll <= D.interest.length && html`<div class="ls-hint">В пакет положены только точки интереса. Чтобы в поле были и остальные — соберите пакет с отметкой «Положить в пакет и остальные зарегистрированные точки».</div>`}
      </div>
      <div class="ls-block">
        <b>Состояние на дату</b>
        <${Row}>
          <input class="input" type="date" value=${cfg.asOf || ''} min=${dates[0] || ''} max=${dates[dates.length - 1] || ''} onInput=${(e) => set({ asOf: e.target.value })} />
          <button class="btn btn-outline btn-sm" onClick=${() => set({ asOf: '' })}>Последнее</button>
        <//>
        <div class="ls-hint">Для каждой точки берётся последний замер не позже этой даты; точки без замеров к этой дате скрываются. В пакете есть замеры с ${fmtDate(dates[0])} по ${fmtDate(dates[dates.length - 1])}. Период выгрузки: ${per}.</div>
      </div>
    <//>`;
}

export function FaultsSettings({ open, onClose, session, vs: view, setVs: setView }) {
  const cfg = view.faults, surfaces = (session.faults && session.faults.surfaces) || [], props = session.data.faultProps || {};
  const [q, setQ] = useState('');
  const hidden = new Set(cfg.hidden || []);
  const set = (patch) => setView({ ...view, faults: { ...cfg, ...patch } });
  const nameOf = (s) => (props[s.key] && props[s.key].title) || s.display;
  const list = surfaces.filter((s) => !q.trim() || (nameOf(s) + ' ' + s.group).toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => String(nameOf(a)).localeCompare(String(nameOf(b)), 'ru', { numeric: true }));
  const toggle = (k) => { const n = new Set(hidden); if (n.has(k)) n.delete(k); else n.add(k); set({ hidden: Array.from(n) }); };
  return html`
    <${Dialog} open=${open} onClose=${onClose} title="Настройки слоя «Разломы»" width="min(620px, 96vw)" footer=${html`<${Button} variant="outline" onClick=${() => set({ hidden: [], color: '', surfOpacity: 0.4, lineOpacity: 1 })}>Сбросить<//><${Button} onClick=${onClose}>Готово<//>`}>
      ${!surfaces.length ? html`<div class="ls-hint">В пакете нет модели разломов.</div>` : html`
        <div class="ls-block">
          <b>Цвет и прозрачность</b>
          <${Row}>
            <label class="ls-opt"><input type="checkbox" checked=${!!cfg.color} onChange=${(e) => set({ color: e.target.checked ? '#e11d48' : '' })} /> Один цвет для всех</label>
            <input type="color" value=${cfg.color || '#e11d48'} disabled=${!cfg.color} onInput=${(e) => set({ color: e.target.value })} />
            ${['#e11d48', '#f59e0b', '#2563eb', '#7c3aed', '#111827'].map((c) => html`<button key=${c} class="ls-sw" style=${{ background: c }} onClick=${() => set({ color: c })} title=${c}></button>`)}
          <//>
          <div class="ls-hint">Без галочки разломы окрашены по классу водообильности (если он задан) или по группе слоя.</div>
          <${Row}><span class="ls-lbl">Прозрачность поверхностей</span><input type="range" min="0.05" max="1" step="0.05" value=${cfg.surfOpacity} onInput=${(e) => set({ surfOpacity: Number(e.target.value) })} /><b>${Math.round((1 - cfg.surfOpacity) * 100)}%</b><//>
          <${Row}><span class="ls-lbl">Прозрачность линий</span><input type="range" min="0.1" max="1" step="0.05" value=${cfg.lineOpacity} onInput=${(e) => set({ lineOpacity: Number(e.target.value) })} /><b>${Math.round((1 - cfg.lineOpacity) * 100)}%</b><//>
        </div>
        <div class="ls-block">
          <b>Какие разломы рисовать (${surfaces.length - hidden.size} из ${surfaces.length})</b>
          <${Row}>
            <input class="input" placeholder="Поиск" value=${q} onInput=${(e) => setQ(e.target.value)} />
            <button class="btn btn-outline btn-sm" onClick=${() => set({ hidden: [] })}>Все</button>
            <button class="btn btn-outline btn-sm" onClick=${() => set({ hidden: surfaces.map((s) => s.key) })}>Снять все</button>
          <//>
          <div class="ls-list">
            ${list.map((s) => html`<label key=${s.key} class="ls-item"><input type="checkbox" checked=${!hidden.has(s.key)} onChange=${() => toggle(s.key)} /><i class="ls-dot" style=${{ background: FAULT_GROUP_COLORS[s.group] || '#888' }}></i><span>${nameOf(s)}</span><small>${s.group}</small></label>`)}
          </div>
        </div>`}
    <//>`;
}

export function TerrainSettings({ open, onClose, session, vs: view, setVs: setView }) {
  const cfg = view.terrain, hasMap = !!session.mapUrl;
  const set = (patch) => setView({ ...view, terrain: { ...cfg, ...patch } });
  return html`
    <${Dialog} open=${open} onClose=${onClose} title="Настройки рельефа (3D)" width="min(560px, 96vw)" footer=${html`<${Button} variant="outline" onClick=${() => set({ colorMode: 'map', opacity: 0.6, step: 5, labels: true, flat: true })}>Сбросить<//><${Button} onClick=${onClose}>Готово<//>`}>
      <div class="ls-block">
        <b>Окраска рельефа</b>
        ${COLOR_MODES.map(([k, t]) => html`<label key=${k} class="ls-opt"><input type="radio" name="cm" checked=${(cfg.colorMode === k) || (k === 'layers' && cfg.colorMode === 'map' && !hasMap)} disabled=${k === 'map' && !hasMap} onChange=${() => set({ colorMode: k })} /> ${t}</label>`)}
        ${!hasMap && html`<div class="ls-hint">В пакете нет картинки схемы — окраска «Карта схемы» недоступна.</div>`}
      </div>
      <div class="ls-block">
        <${Row}><span class="ls-lbl">Прозрачность рельефа</span><input type="range" min="0.1" max="1" step="0.05" value=${cfg.opacity} onInput=${(e) => set({ opacity: Number(e.target.value) })} /><b>${Math.round((1 - cfg.opacity) * 100)}%</b><//>
        <div class="ls-hint">Чем прозрачнее рельеф, тем лучше видны разломы и скважины под ним.</div>
        <label class="ls-opt"><input type="checkbox" checked=${cfg.flat !== false} onChange=${(e) => set({ flat: e.target.checked })} /> Гранёная поверхность (уступы карьера видны чётче, без сглаживания)</label>
      </div>
      <div class="ls-block">
        <b>Горизонты (изолинии с отметками)</b>
        <${Row}><span class="ls-lbl">Шаг линий, м</span>
          <select class="input" value=${cfg.step} onChange=${(e) => set({ step: Number(e.target.value) })}>${[2, 5, 10, 15, 20, 25].map((v) => html`<option key=${v} value=${v}>${v}</option>`)}</select><//>
        <label class="ls-opt"><input type="checkbox" checked=${cfg.labels !== false} onChange=${(e) => set({ labels: e.target.checked })} /> Подписывать отметки на линиях</label>
        <div class="ls-hint">Линии рисуются через заданный шаг; каждая пятая — темнее (основная). Подписи — на линиях с шагом ${cfg.step < 10 ? cfg.step * 2 : cfg.step} м. Включить или выключить сами линии можно в списке слоёв.</div>
      </div>
    <//>`;
}

export function PoiSettings({ open, onClose, session, vs: view, setVs: setView, poi }) {
  const cfg = view.poi, D = session.data, hasInterest = Array.isArray(D.interest);
  const set = (patch) => setView({ ...view, poi: { ...cfg, ...patch } });
  const wk = session.manifest.scheme && session.manifest.scheme.weekKey;
  return html`
    <${Dialog} open=${open} onClose=${onClose} title="Точки интереса" width="min(560px, 96vw)" footer=${html`<${Button} variant="outline" onClick=${() => set({ scope: 'interest', date: '__all__' })}>Сбросить<//><${Button} onClick=${onClose}>Готово<//>`}>
      <div class="ls-hint" style=${{ marginBottom: '12px' }}>Белые кружки с номерами показывают, какие точки нужно перемерить. Серый — ещё не перемерена, зелёный — перемерена (в том числе замером, сделанным на планшете).</div>
      <div class="ls-block">
        <b>Какие точки</b>
        <label class="ls-opt"><input type="radio" name="poiscope" checked=${cfg.scope !== 'all' || !hasInterest} onChange=${() => set({ scope: 'interest' })} /> ${hasInterest ? 'Выбранные при подготовке пакета (' + D.interest.length + ')' : 'Все точки пакета'}</label>
        <label class="ls-opt"><input type="radio" name="poiscope" checked=${cfg.scope === 'all' && hasInterest} disabled=${!hasInterest} onChange=${() => set({ scope: 'all' })} /> Все точки реестра, что есть в пакете</label>
      </div>
      <div class="ls-block">
        <b>Опорная дата</b>
        <select class="input" value=${cfg.date || '__all__'} onChange=${(e) => set({ date: e.target.value })}>
          <option value="__all__">Все точки реестра (последние замеры)</option>
          ${(poi ? poi.dates : []).map((d) => html`<option key=${d} value=${d}>${fmtDate(d)}</option>`)}
        </select>
        <div class="ls-hint">${cfg.date === '__all__' || !cfg.date ? 'Выполненными считаются точки с замером на неделе схемы' + (wk ? ' (' + wk + ')' : '') + '.' : 'Показаны точки, замеренные в этот день. Выполненные — те, что перемерены позже.'}</div>
      </div>
      ${poi && html`<div class="ls-hint"><b>Сейчас: ✓ ${poi.doneCount} из ${poi.total}</b></div>`}
    <//>`;
}

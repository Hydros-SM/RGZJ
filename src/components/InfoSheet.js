// Карточка выбранного объекта (точка, выход воды, разлом, скважина, датчик): подробности и история замеров.
import React, { useEffect, useState } from 'react';
import { X, ArrowLeft } from 'lucide-react';
import { getPhoto } from '../lib/work.js';
import { html } from '../lib/html.js';
import { STATUS_COLORS } from '../lib/map-style.js';
import { WATER_CLASSES, ROLES } from '../lib/faults-format.js';
import { Badge } from './ui.js';

const fmtDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : (d || '—'); };
const num = (v, d = 2) => (v == null || v === '' || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(d));
const flow = (v) => (v == null || v === '' ? '—' : Number(v).toFixed(2) + ' л/с · ' + (Number(v) * 3.6).toFixed(1) + ' м³/ч');
const Row = ({ k, v }) => html`<div class="info-row"><span>${k}</span><b>${v == null || v === '' ? '—' : v}</b></div>`;

function Gallery({ ids }) {
  const [urls, setUrls] = useState([]);
  useEffect(() => { let dead = false; const made = []; Promise.all((ids || []).map((id) => getPhoto(id))).then((bl) => { if (dead) return; const u = bl.filter(Boolean).map((b) => { const x = URL.createObjectURL(b); made.push(x); return x; }); setUrls(u); }); return () => { dead = true; made.forEach((x) => URL.revokeObjectURL(x)); }; }, [(ids || []).join(',')]);
  return urls.length ? html`<div class="info-h">Фото</div><div class="thumbs">${urls.map((u) => html`<a key=${u} href=${u} target="_blank" rel="noopener"><img class="thumb-img" src=${u} alt="фото" /></a>`)}</div>` : null;
}

// График истории: дебит (линия) и статус (цветные точки) по датам замеров, от старых к новым
function FlowChart({ hist }) {
  const pts = hist.filter((h) => h.monitoring_date).slice().reverse();
  if (pts.length < 2) return null;
  const W = 340, H = 140, L = 34, Rr = 8, T = 10, B = 26;
  const t = (d) => new Date(String(d).slice(0, 10)).getTime(), t0 = t(pts[0].monitoring_date), t1 = t(pts[pts.length - 1].monitoring_date) || t0 + 1;
  const vals = pts.map((p) => (p.flow_rate == null || p.flow_rate === '' ? null : Number(p.flow_rate)));
  const vmax = Math.max(0.1, ...vals.filter((v) => v != null)) * 1.15;
  const x = (d) => L + ((t(d) - t0) / ((t1 - t0) || 1)) * (W - L - Rr), y = (v) => T + (1 - v / vmax) * (H - T - B);
  const line = pts.map((p, i) => (vals[i] == null ? null : (x(p.monitoring_date).toFixed(1) + ',' + y(vals[i]).toFixed(1)))).filter(Boolean).join(' ');
  const ticks = [0, 0.5, 1].map((f) => f * vmax);
  return html`<div class="info-h">График дебита и статуса</div>
    <svg class="flow-chart" viewBox=${'0 0 ' + W + ' ' + H} role="img">
      ${ticks.map((v) => html`<g key=${v}><line x1=${L} x2=${W - Rr} y1=${y(v)} y2=${y(v)} stroke="#e5e2dc" /><text x=${L - 4} y=${y(v) + 4} text-anchor="end" font-size="10" fill="#8a8680">${v.toFixed(v < 1 ? 2 : 1)}</text></g>`)}
      <polyline points=${line} fill="none" stroke="#2563eb" stroke-width="2" />
      ${pts.map((p, i) => html`<circle key=${i} cx=${x(p.monitoring_date)} cy=${vals[i] == null ? H - B : y(vals[i])} r="4.5" fill=${STATUS_COLORS[p.status] || '#888'} stroke="#fff" stroke-width="1.5"><title>${fmtDate(p.monitoring_date)} · ${vals[i] == null ? 'дебит не указан' : vals[i].toFixed(2) + ' л/с'} · ${p.status || '—'}</title></circle>`)}
      <text x=${L} y=${H - 8} font-size="10" fill="#8a8680">${fmtDate(pts[0].monitoring_date)}</text><text x=${W - Rr} y=${H - 8} font-size="10" text-anchor="end" fill="#8a8680">${fmtDate(pts[pts.length - 1].monitoring_date)}</text>
      <text x="4" y="10" font-size="10" fill="#8a8680">л/с</text>
    </svg>
    <div class="chart-legend">${Object.keys(STATUS_COLORS).filter((s) => pts.some((p) => p.status === s)).map((s) => html`<span key=${s}><i style=${{ background: STATUS_COLORS[s] }}></i>${s}</span>`)}</div>`;
}

export function InfoSheet({ session, selected, onClose, onSelect, onAction }) {
  if (!selected) return null;
  const { kind } = selected, D = session.data;
  let title = '', badge = null, body = null, back = null;
  if (kind === 'point') {
    const p = selected.item, hist = session.history.get(p.point_number) || [p], exits = session.outflows.filter((o) => o.parent_number === p.point_number);
    title = 'Точка №' + p.point_number; badge = p.status;
    body = html`
      <${Row} k="Дата мониторинга" v=${fmtDate(p.monitoring_date)} /><${Row} k="Сотрудник" v=${p.worker} /><${Row} k="Домен" v=${p.domain} /><${Row} k="Борт" v=${p.wall} />
      <${Row} k="Интенсивность" v=${p.intensity} /><${Row} k="Дебит" v=${flow(p.flow_rate)} /><${Row} k="Цвет воды" v=${p.water_color} /><${Row} k="Метод замера" v=${p.measure_method} />
      <${Row} k="Горизонт" v=${p.horizon} /><${Row} k="Отметка уровня воды" v=${p.water_level_z != null ? num(p.water_level_z) + ' м' : null} />
      <${Row} k="X / Y" v=${p.x_local != null ? num(p.x_local) + ' / ' + num(p.y_local) : null} />
      ${p.comment && html`<div class="info-comment">«${p.comment}»</div>`}
      ${exits.length > 0 && html`<div class="info-h">Выходы воды (${exits.length})</div>${exits.map((o) => html`<div key=${o.id} class="info-link" onClick=${() => onSelect({ kind: 'outflow', item: o })}><i class="dia" /> <b>${o.point_number}</b><span>${o.water_level_z != null ? 'Z ' + num(o.water_level_z, 1) : 'Z —'} · ${o.status || ''}</span></div>`)}`}
      ${p._photos && p._photos.length > 0 && html`<${Gallery} ids=${p._photos} />`}
      ${onAction && html`<div class="info-actions"><button class="btn btn-primary" onClick=${() => onAction({ type: 'measure', parent: p.point_number })}>Новый замер</button><button class="btn btn-outline" onClick=${() => onAction({ type: 'outflow', parent: p.point_number })}>Добавить выход воды</button><button class="btn btn-ghost" onClick=${() => onAction(p._rec ? { edit: p._rec } : { editBase: { kind: 'point', item: p } })}>Изменить</button></div>`}
      ${hist.length > 1 && html`<${FlowChart} hist=${hist} />`}
      ${hist.length > 1 && html`<div class="info-h">История замеров (${hist.length})</div>
        <table class="info-table"><thead><tr><th>Дата</th><th>Дебит, л/с</th><th>Статус</th><th>Сотрудник</th></tr></thead><tbody>
          ${hist.slice(0, 20).map((h) => html`<tr key=${h.id}><td>${fmtDate(h.monitoring_date)}</td><td>${num(h.flow_rate)}</td><td>${h.status || '—'}</td><td>${h.worker || '—'}</td></tr>`)}
        </tbody></table>`}`;
  } else if (kind === 'outflow') {
    const o = selected.item;
    title = 'Выход воды ' + o.point_number; badge = o.status;
    const parent = session.points.find((q) => q.point_number === o.parent_number);
    back = parent ? html`<button class="info-back" onClick=${() => onSelect({ kind: 'point', item: parent })}><${ArrowLeft} size=${16} /> Точка №${o.parent_number}</button>` : null;
    body = html`<${Row} k="Точка замера" v=${'№' + o.parent_number} /><${Row} k="Дата фиксации" v=${fmtDate(o.monitoring_date)} /><${Row} k="Отметка выхода Z" v=${o.water_level_z != null ? num(o.water_level_z) + ' м' : null} />
      <${Row} k="X / Y" v=${num(o.x_local) + ' / ' + num(o.y_local)} />${o.comment && html`<div class="info-comment">«${o.comment}»</div>`}
      ${o._photos && o._photos.length > 0 && html`<${Gallery} ids=${o._photos} />`}
      ${onAction && html`<div class="info-actions"><button class="btn btn-primary" onClick=${() => onAction(o._rec ? { edit: o._rec } : { editBase: { kind: 'outflow', item: o } })}>Изменить выход воды</button></div>`}
      <div class="info-link" onClick=${() => { const par = session.points.find((q) => q.point_number === o.parent_number); if (par) onSelect({ kind: 'point', item: par }); }}>Открыть точку замера №${o.parent_number}</div>`;
  } else if (kind === 'fault') {
    const s = session.faults.surfaces.find((x) => x.key === selected.key), fp = (D.faultProps || {})[selected.key] || {};
    title = fp.title || (s && s.display) || 'Разлом';
    body = html`<${Row} k="Слой" v=${s && s.display} /><${Row} k="Группа" v=${s && s.group} /><${Row} k="Водообильность" v=${fp.water_class ? WATER_CLASSES[fp.water_class] : 'не задана'} />
      <${Row} k="Роль" v=${fp.role ? ROLES[fp.role] : 'не задана'} />${fp.note && html`<div class="info-comment">«${fp.note}»</div>`}`;
  } else {
    const w = selected.item;
    title = w.name || 'Объект';
    const label = { piezo: 'Пьезометр', sensor: 'Датчик пьезометра', observation: 'Скважина (реестр)', horizontal: 'Горизонтальная скважина' }[kind] || kind;
    body = html`<${Row} k="Тип" v=${label} />${kind === 'sensor' && html`<${Row} k="Скважина" v=${w.well} /><${Row} k="Глубина установки" v=${num(w.depth, 1) + ' м'} /><${Row} k="X / Y / Z" v=${num(w.x, 1) + ' / ' + num(w.y, 1) + ' / ' + num(w.z, 1)} />`}
      ${kind !== 'sensor' && html`<${Row} k="Устье X / Y / Z" v=${w.collar ? num(w.collar.x, 1) + ' / ' + num(w.collar.y, 1) + ' / ' + num(w.collar.z, 1) : null} /><${Row} k="Глубина" v=${w.depth != null ? num(w.depth, 1) + ' м' : null} />`}
      ${kind === 'horizontal' && html`<${Row} k="Азимут / наклон" v=${num(w.azimuth, 0) + '° / ' + num(w.inclination, 0) + '°'} />`}
      ${kind === 'observation' && w.lastLevel && html`<${Row} k="Последний замер уровня" v=${fmtDate(w.lastLevel.date) + ': ' + num(w.lastLevel.depthToWater, 1) + ' м от устья'} />`}
      ${kind === 'piezo' && html`<${Row} k="Датчиков" v=${(w.sensors || []).length} />${(w.sensors || []).map((s) => html`<div key=${s.name} class="info-sub">${s.name} · глубина ${num(s.depth, 1)} м</div>`)}`}`;
  }
  return html`
    <div class="info-sheet">
      <div class="info-head">${back}<b>${title}</b>${selected.item && selected.item._field && html`<span class="badge-field">полевая запись</span>`}${badge && html`<${Badge} style=${{ background: (STATUS_COLORS[badge] || '#888') + '22', color: STATUS_COLORS[badge] || '#555' }}>${badge}<//>`}
        <button class="info-x" onClick=${onClose}><${X} size=${20} /></button></div>
      <div class="info-body">${body}</div>
    </div>`;
}

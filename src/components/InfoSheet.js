// Карточка выбранного объекта (точка, выход воды, разлом, скважина, датчик): подробности и история замеров.
import React from 'react';
import { X } from 'lucide-react';
import { html } from '../lib/html.js';
import { STATUS_COLORS } from '../lib/map-style.js';
import { WATER_CLASSES, ROLES } from '../lib/faults-format.js';
import { Badge } from './ui.js';

const fmtDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : (d || '—'); };
const num = (v, d = 2) => (v == null || v === '' || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(d));
const flow = (v) => (v == null || v === '' ? '—' : Number(v).toFixed(2) + ' л/с · ' + (Number(v) * 3.6).toFixed(1) + ' м³/ч');
const Row = ({ k, v }) => html`<div class="info-row"><span>${k}</span><b>${v == null || v === '' ? '—' : v}</b></div>`;

export function InfoSheet({ session, selected, onClose, onSelect }) {
  if (!selected) return null;
  const { kind } = selected, D = session.data;
  let title = '', badge = null, body = null;
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
      ${hist.length > 1 && html`<div class="info-h">История замеров (${hist.length})</div>
        <table class="info-table"><thead><tr><th>Дата</th><th>Дебит, л/с</th><th>Статус</th><th>Сотрудник</th></tr></thead><tbody>
          ${hist.slice(0, 20).map((h) => html`<tr key=${h.id}><td>${fmtDate(h.monitoring_date)}</td><td>${num(h.flow_rate)}</td><td>${h.status || '—'}</td><td>${h.worker || '—'}</td></tr>`)}
        </tbody></table>`}`;
  } else if (kind === 'outflow') {
    const o = selected.item;
    title = 'Выход воды ' + o.point_number; badge = o.status;
    body = html`<${Row} k="Точка замера" v=${'№' + o.parent_number} /><${Row} k="Дата фиксации" v=${fmtDate(o.monitoring_date)} /><${Row} k="Отметка выхода Z" v=${o.water_level_z != null ? num(o.water_level_z) + ' м' : null} />
      <${Row} k="X / Y" v=${num(o.x_local) + ' / ' + num(o.y_local)} />${o.comment && html`<div class="info-comment">«${o.comment}»</div>`}
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
      <div class="info-head"><b>${title}</b>${badge && html`<${Badge} style=${{ background: (STATUS_COLORS[badge] || '#888') + '22', color: STATUS_COLORS[badge] || '#555' }}>${badge}<//>`}
        <button class="info-x" onClick=${onClose}><${X} size=${20} /></button></div>
      <div class="info-body">${body}</div>
    </div>`;
}

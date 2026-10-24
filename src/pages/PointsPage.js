// Вкладка «Список точек»: последние записи по каждой точке, поиск, фильтр по статусу; справа — карточка с историей. Кнопка «На карте» открывает точку на плане.
import React, { useMemo, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import { html } from '../lib/html.js';
import { STATUS_COLORS } from '../lib/map-style.js';
import { POINT_STATUSES } from '../lib/point-status.js';
import { InfoSheet } from '../components/InfoSheet.js';

const fmtDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : (d || '—'); };

export function PointsPage({ session, onShowOnMap }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(null);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return session.points.filter((p) => (!status || p.status === status) && (!s || [p.point_number, p.worker, p.domain, p.wall, p.comment, p.horizon].join(' ').toLowerCase().includes(s)))
      .sort((a, b) => String(a.point_number).localeCompare(String(b.point_number), 'ru', { numeric: true }));
  }, [session, q, status]);
  const exitsOf = (n) => session.outflows.filter((o) => o.parent_number === n).length;
  return html`
    <div class="points-page">
      <div class="points-list">
        <div class="points-filters">
          <label class="search"><${Search} size=${16} /><input class="input" placeholder="Поиск: номер, сотрудник, домен…" value=${q} onInput=${(e) => setQ(e.target.value)} /></label>
          <select class="input" value=${status} onChange=${(e) => setStatus(e.target.value)}><option value="">Все статусы</option>${Object.keys(POINT_STATUSES).map((s) => html`<option key=${s} value=${s}>${s}</option>`)}</select>
          <span class="count">${rows.length} из ${session.points.length}</span>
        </div>
        <div class="points-scroll">
          ${rows.map((p) => html`
            <div key=${p.point_number} class=${'point-row' + (selected && selected.item.point_number === p.point_number ? ' active' : '')} onClick=${() => setSelected({ kind: 'point', item: p })}>
              <i class="dot" style=${{ background: STATUS_COLORS[p.status] || '#888' }} />
              <div class="main"><b>№${p.point_number}</b><span>${p.status || '—'} · ${p.domain || '—'} · ${p.wall || '—'}</span></div>
              <div class="side"><b>${p.flow_rate != null ? Number(p.flow_rate).toFixed(2) + ' л/с' : '—'}</b><span>${fmtDate(p.monitoring_date)}${exitsOf(p.point_number) ? ' · выходов ' + exitsOf(p.point_number) : ''}</span></div>
              ${p.x_local != null && html`<button class="row-map" title="Показать на карте" onClick=${(e) => { e.stopPropagation(); onShowOnMap({ selected: { kind: 'point', item: p }, x: p.x_local, y: p.y_local }); }}><${MapPin} size=${18} /></button>`}
            </div>`)}
          ${!rows.length && html`<div class="empty">Ничего не найдено</div>`}
        </div>
      </div>
      <div class="points-detail">
        ${selected ? html`<${InfoSheet} session=${session} selected=${selected} onClose=${() => setSelected(null)} onSelect=${setSelected} inline />` : html`<div class="empty">Выберите точку в списке</div>`}
      </div>
    </div>`;
}

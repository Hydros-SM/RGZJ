// Вкладка «Записи»: всё, что сделано в поле на этом планшете (новые точки, замеры, выходы воды) — изменить или удалить.
import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { html } from '../lib/html.js';

const TYPE = { point: 'Новая точка', measure: 'Новый замер', outflow: 'Выход воды' };
const fmtDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : (d || '—'); };

export function RecordsPage({ work, onEdit, onDelete }) {
  const recs = work.records.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return html`
    <div class="records-page">
      <div class="hint" style=${{ margin: '0 0 14px' }}>Записи хранятся только на этом планшете и пока не выгружены в основную платформу (экспорт результатов — следующий этап). Не очищайте данные браузера и не удаляйте приложение, пока записи не выгружены.</div>
      ${!recs.length && html`<div class="empty">Записей пока нет. На вкладке «Карта» или «Модель» нажмите «Записать».</div>`}
      ${recs.map((r) => html`
        <div class="rec-row" key=${r.id}>
          <div class="main"><b>${r.edit ? 'Правка' + (r.type === 'outflow' ? ' выхода' : ' точки') : (TYPE[r.type] || r.type)} · ${r.type === 'outflow' ? r.point_number + ' (точка №' + r.parent_number + ')' : '№' + r.point_number}</b>
            <span>${fmtDate(r.fields.monitoring_date)} · ${r.fields.status || '—'}${r.fields.flow_rate != null ? ' · ' + Number(r.fields.flow_rate).toFixed(3) + ' л/с' : ''}${r.x != null ? ' · X ' + Number(r.x).toFixed(1) + ' / Y ' + Number(r.y).toFixed(1) : ''}${r.z != null ? ' · Z ' + Number(r.z).toFixed(1) : ''}${(r.photos || []).length ? ' · фото: ' + r.photos.length : ''}</span>
            ${r.fields.comment && html`<span>«${r.fields.comment}»</span>`}</div>
          <button class="btn btn-outline" onClick=${() => onEdit(r.id)}><${Pencil} size=${16} /> Изменить</button>
          <button class="btn btn-ghost danger" onClick=${() => onDelete(r.id)}><${Trash2} size=${16} /></button>
        </div>`)}
    </div>`;
}

// Вкладка «Записи»: всё, что сделано в поле на этом планшете (новые точки, замеры, выходы воды) — изменить, удалить, выгрузить.
// Выгрузка собирает файл .gresult (записи + фото), его передают на компьютер и загружают в основную платформу.
import React, { useState } from 'react';
import { Pencil, Trash2, Download, Share2, Lock, CheckCircle2 } from 'lucide-react';
import { html } from '../lib/html.js';
import { buildResult, saveBlob, canShareFile, shareFile, recordStates, addExportLog } from '../lib/export.js';

const TYPE = { point: 'Новая точка', measure: 'Новый замер', outflow: 'Выход воды' };
const STATE = { new: ['не выгружена', '#b45309'], changed: ['изменена после выгрузки', '#b45309'], done: ['выгружена', '#15803d'] };
const fmtDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : (d || '—'); };
const fmtDt = (s) => { try { return new Date(s).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return s || '—'; } };
const mb = (n) => (n / 1048576).toFixed(2);
const worker = () => { try { return localStorage.getItem('field-worker') || ''; } catch (e) { return ''; } };

export function RecordsPage({ session, work, log, onLogged, onEdit, onDelete, appVersion }) {
  const recs = work.records.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const states = recordStates(work, log), pending = recs.filter((r) => states.get(r.id) !== 'done').length;
  const last = log.items[log.items.length - 1];
  const [scope, setScope] = useState('all');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null); // подготовленный файл
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function prepare() {
    setBusy(true); setError(''); setMsg(''); setRes(null);
    try {
      const onlyIds = scope === 'pending' ? new Set(recs.filter((r) => states.get(r.id) !== 'done').map((r) => r.id)) : null;
      setRes(await buildResult({ session, work, password: pw.trim() || null, worker: worker(), appVersion, onlyIds }));
    } catch (e) { setError(e.message || String(e)); } finally { setBusy(false); }
  }
  async function logIt(how) {
    const item = { at: new Date().toISOString(), how, fileName: res.fileName, hash: res.hash, size: res.size, count: res.manifest.counts.records, fps: res.fps };
    await onLogged(await addExportLog(log, item));
  }
  async function doSave() { saveBlob(res.blob, res.fileName); await logIt('save'); setMsg('Файл сохранён в загрузки планшета: ' + res.fileName); }
  async function doShare() {
    try { await shareFile(res.blob, res.fileName, 'Результаты полевой работы'); await logIt('share'); setMsg('Файл отправлен: ' + res.fileName); }
    catch (e) { if (e && e.name !== 'AbortError') setError('Не удалось отправить: ' + (e.message || e) + '. Сохраните файл и перенесите вручную.'); }
  }

  return html`
    <div class="records-page">
      <div class="card export-card" style=${{ padding: '14px 16px', marginBottom: '16px' }}>
        <b style=${{ fontSize: '15px' }}>Выгрузка результатов</b>
        <div class="hint" style=${{ margin: '6px 0 10px' }}>${recs.length
          ? 'Записей: ' + recs.length + ' · ' + (pending ? 'ещё не выгружено или изменено: ' + pending : 'все выгружены') + (last ? ' · последняя выгрузка ' + fmtDt(last.at) + ' (' + last.count + ' зап.)' : '')
          : 'Записей пока нет — выгружать нечего.'}</div>
        ${recs.length > 0 && html`
          <div style=${{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select class="input" value=${scope} onChange=${(e) => { setScope(e.target.value); setRes(null); }} style=${{ minHeight: '44px' }}>
              <option value="all">Все записи (${recs.length})</option>
              <option value="pending" disabled=${!pending}>Только невыгруженные и изменённые (${pending})</option>
            </select>
            <label style=${{ display: 'flex', alignItems: 'center', gap: '6px' }}><${Lock} size=${15} />
              <input type="password" class="input" placeholder="Пароль (необязательно)" value=${pw} onInput=${(e) => { setPw(e.target.value); setRes(null); }} style=${{ minHeight: '44px' }} /></label>
            <button class="btn btn-primary" disabled=${busy} onClick=${prepare}>${busy ? 'Собираю…' : 'Подготовить файл'}</button>
          </div>`}
        ${res && html`
          <div style=${{ marginTop: '12px', padding: '12px', border: '1px solid var(--border-subtle, #ECE9E4)', borderRadius: '10px', background: 'var(--bg-app, #FAF9F7)' }}>
            <div><${CheckCircle2} size=${15} color="#15803d" /> <b>${res.fileName}</b> · ${mb(res.size)} МБ${res.encrypted ? ' · с паролем' : ''}</div>
            <div class="hint" style=${{ margin: '4px 0' }}>Записей ${res.manifest.counts.records} (новых точек ${res.manifest.counts.points}, замеров ${res.manifest.counts.measures}, выходов воды ${res.manifest.counts.outflows}, правок ${res.manifest.counts.edits}) · фото ${res.manifest.counts.photos}</div>
            ${res.hash && html`<div class="hint" style=${{ margin: '4px 0', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>SHA-256: ${res.hash}</div>`}
            ${res.missing.length > 0 && html`<div class="err">Не найдено фото: ${res.missing.length} (записи выгрузятся без них).</div>`}
            <div style=${{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
              <button class="btn btn-primary" onClick=${doSave}><${Download} size=${16} /> Сохранить файл</button>
              ${canShareFile(res.blob, res.fileName) && html`<button class="btn btn-outline" onClick=${doShare}><${Share2} size=${16} /> Отправить…</button>`}
            </div>
          </div>`}
        ${msg && html`<div class="hint" style=${{ color: '#15803d' }}>${msg} Перенесите его на компьютер и загрузите в основной платформе («Подготовка к полевым» → результаты). Сверьте контрольную сумму SHA-256 после переноса. Записи на планшете не удаляются — удалять их безопасно, только когда данные приняты основной платформой.</div>`}
        ${error && html`<div class="err">${error}</div>`}
      </div>
      <div class="hint" style=${{ margin: '0 0 14px' }}>Записи хранятся на этом планшете. Не очищайте данные браузера и не удаляйте приложение, пока записи не выгружены и не приняты основной платформой.</div>
      ${!recs.length && html`<div class="empty">Записей пока нет. На вкладке «Карта» или «Модель» нажмите «Записать».</div>`}
      ${recs.map((r) => { const st = STATE[states.get(r.id)] || STATE.new; return html`
        <div class="rec-row" key=${r.id}>
          <div class="main"><b>${r.edit ? 'Правка' + (r.type === 'outflow' ? ' выхода' : ' точки') : (TYPE[r.type] || r.type)} · ${r.type === 'outflow' ? r.point_number + ' (точка №' + r.parent_number + ')' : '№' + r.point_number} <span style=${{ color: st[1], fontWeight: 600, marginLeft: '6px' }}>${st[0]}</span></b>
            <span>${fmtDate(r.fields.monitoring_date)} · ${r.fields.status || '—'}${r.fields.flow_rate != null ? ' · ' + Number(r.fields.flow_rate).toFixed(3) + ' л/с' : ''}${r.x != null ? ' · X ' + Number(r.x).toFixed(1) + ' / Y ' + Number(r.y).toFixed(1) : ''}${r.z != null ? ' · Z ' + Number(r.z).toFixed(1) : ''}${(r.photos || []).length ? ' · фото: ' + r.photos.length : ''}</span>
            ${r.fields.comment && html`<span>«${r.fields.comment}»</span>`}</div>
          <button class="btn btn-outline" onClick=${() => onEdit(r.id)}><${Pencil} size=${16} /> Изменить</button>
          <button class="btn btn-ghost danger" onClick=${() => onDelete(r.id)}><${Trash2} size=${16} /></button>
        </div>`; })}
    </div>`;
}

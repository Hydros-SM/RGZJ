// Форма полевой записи: новая точка водопроявления, новый замер существующей точки, выход воды. Дебит — числом или объёмным методом (объём / время),
// фото с камеры планшета. Запись сохраняется на устройстве; в основную платформу попадёт только при экспорте результатов.
import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, Crosshair } from 'lucide-react';
import { html } from '../lib/html.js';
import { Button, Dialog } from './ui.js';
import { POINT_STATUSES, INTENSITY_OPTIONS, WALL_OPTIONS, DOMAIN_OPTIONS, WATER_COLOR_OPTIONS, MEASURE_METHOD_OPTIONS } from '../lib/point-status.js';
import { addPhoto, getPhoto, deletePhoto, toLs, volumetricLs, newId, todayIso } from '../lib/work.js';

const TITLES = { point: 'Новая точка водопроявления', measure: 'Новый замер точки', outflow: 'Выход воды' };

function Thumb({ id, onRemove }) {
  const [url, setUrl] = useState('');
  useEffect(() => { let u = ''; let dead = false; getPhoto(id).then((b) => { if (b && !dead) { u = URL.createObjectURL(b); setUrl(u); } }); return () => { dead = true; if (u) URL.revokeObjectURL(u); }; }, [id]);
  return html`<div class="thumb">${url ? html`<img src=${url} alt="фото" />` : html`<span>…</span>`}<button class="thumb-x" onClick=${onRemove} title="Убрать фото"><${X} size=${14} /></button></div>`;
}
const Lbl = ({ t, children, wide }) => html`<label class=${'rf' + (wide ? ' wide' : '')}><span>${t}</span>${children}</label>`;
const numStr = (v) => (v == null || v === '' ? '' : String(v));

export function RecordDialog({ open, draft, onChange, onSave, onClose, onRepick, session, work, busy }) {
  const [error, setError] = useState('');
  const added = useRef([]);
  const fileRef = useRef(null);
  useEffect(() => { if (open) { setError(''); added.current = []; } }, [open]);
  if (!draft) return null;
  const f = draft.fields, set = (patch) => onChange({ ...draft, ...patch }), setF = (patch) => onChange({ ...draft, fields: { ...draft.fields, ...patch } });
  const fl = draft.flow || { mode: 'direct', unit: 'ls', value: '', volume: '', time: '' }, setFlow = (patch) => set({ flow: { ...fl, ...patch } });
  const calcLs = fl.mode === 'volume' ? volumetricLs(fl.volume, fl.time) : toLs(fl.value, fl.unit);
  const domains = ((session.data && session.data.domains) || []).map((d) => d.name), domainOpts = domains.length ? domains : DOMAIN_OPTIONS;
  const isOut = draft.type === 'outflow', isMeasure = draft.type === 'measure';

  async function onFiles(e) {
    const files = Array.from(e.target.files || []); e.target.value = '';
    const ids = [];
    for (const file of files) { try { const id = await addPhoto(file); added.current.push(id); ids.push(id); } catch (err) { setError('Фото не добавлено: ' + err.message); } }
    if (ids.length) onChange({ ...draft, photos: [...(draft.photos || []), ...ids] });
  }
  function removePhoto(id) { onChange({ ...draft, photos: (draft.photos || []).filter((p) => p !== id) }); if (added.current.includes(id)) { deletePhoto(id); added.current = added.current.filter((x) => x !== id); } else (draft._removed = draft._removed || []).push(id); }
  function cancel() { added.current.forEach((id) => deletePhoto(id)); onClose(); }

  function save() {
    const num = String(draft.point_number || '').trim();
    if (!num) { setError('Укажите номер'); return; }
    const x = Number(draft.x), y = Number(draft.y), z = draft.z === '' || draft.z == null ? null : Number(draft.z);
    if (draft.type !== 'measure' && (!Number.isFinite(x) || !Number.isFinite(y))) { setError('Укажите положение на карте (X и Y)'); return; }
    if (z != null && !Number.isFinite(z)) { setError('Z должна быть числом'); return; }
    const used = new Set(); (work.records || []).forEach((r) => { if (r.id !== draft.id && (r.type === draft.type || (draft.type !== 'outflow' && r.type !== 'outflow'))) used.add(r.point_number); });
    if (draft.type === 'point' && !draft.edit && (session.points.some((p) => String(p.point_number) === num && !p._field) || used.has(num))) { setError('Точка с номером «' + num + '» уже есть. Для нового замера существующей точки используйте «Новый замер».'); return; }
    if (isOut && !draft.edit && (session.outflows.some((o) => o.point_number === num && !o._field) || used.has(num))) { setError('Выход «' + num + '» уже есть'); return; }
    if (!isOut && fl.mode === 'direct' && fl.value !== '' && calcLs == null) { setError('Дебит должен быть числом'); return; }
    (draft._removed || []).forEach((id) => deletePhoto(id));
    added.current = [];
    const fields = { ...f, monitoring_date: f.monitoring_date || todayIso() };
    if (!isOut) fields.flow_rate = calcLs != null ? Math.round(calcLs * 1000) / 1000 : null;
    if (fields.worker) { try { localStorage.setItem('field-worker', fields.worker); } catch (e2) { /* не критично */ } }
    onSave({ id: draft.id || newId(), type: draft.type, edit: !!draft.edit, point_number: num, parent_number: draft.parent_number, x: draft.type === 'measure' ? undefined : x, y: draft.type === 'measure' ? undefined : y, z: z, fields, flow: fl, photos: draft.photos || [], createdAt: draft.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
  }

  return html`
    <${Dialog} open=${open} onClose=${cancel} title=${(draft.edit || (draft.id && !draft._new) ? 'Изменить: ' : '') + TITLES[draft.type] + (isOut ? ' · точка №' + draft.parent_number : '')} width="min(760px, 98vw)"
      footer=${html`${error && html`<div class="rf-err">${error}</div>`}<${Button} variant="outline" onClick=${cancel}>Отмена<//><${Button} onClick=${save} disabled=${busy}>Сохранить<//>`}>
      <div class="rf-grid">
        <${Lbl} t=${isOut ? '№ выхода *' : '№ точки *'}><input class="input" value=${draft.point_number} disabled=${isMeasure || !!draft.edit} onInput=${(e) => set({ point_number: e.target.value })} /><//>
        <${Lbl} t="Дата"><input class="input" type="date" value=${f.monitoring_date || ''} onInput=${(e) => setF({ monitoring_date: e.target.value })} /><//>
        ${!isOut && html`<${Lbl} t="Сотрудник"><input class="input" value=${f.worker || ''} onInput=${(e) => setF({ worker: e.target.value })} /><//>`}
        <${Lbl} t="Статус"><select class="input" value=${f.status || ''} onChange=${(e) => setF({ status: e.target.value })}>${Object.keys(POINT_STATUSES).map((s) => html`<option key=${s} value=${s}>${s}</option>`)}</select><//>
        ${!isOut && html`<${Lbl} t="Интенсивность"><select class="input" value=${f.intensity || ''} onChange=${(e) => setF({ intensity: e.target.value })}><option value="">—</option>${INTENSITY_OPTIONS.map((s) => html`<option key=${s} value=${s}>${s}</option>`)}</select><//>`}
      </div>

      ${!isOut && html`
        <div class="rf-flow">
          <div class="rf-flow-head"><b>Дебит</b>
            <div class="seg"><button class=${fl.mode === 'direct' ? 'on' : ''} onClick=${() => setFlow({ mode: 'direct' })}>Числом</button><button class=${fl.mode === 'volume' ? 'on' : ''} onClick=${() => setFlow({ mode: 'volume' })}>Объёмным методом</button></div>
            <span class="rf-flow-res">${calcLs != null ? calcLs.toFixed(3) + ' л/с · ' + (calcLs * 3.6).toFixed(2) + ' м³/ч' : '—'}</span></div>
          ${fl.mode === 'direct' ? html`<div class="rf-grid"><${Lbl} t="Значение"><input class="input" inputmode="decimal" value=${fl.value} onInput=${(e) => setFlow({ value: e.target.value })} /><//>
              <${Lbl} t="Единицы"><select class="input" value=${fl.unit} onChange=${(e) => setFlow({ unit: e.target.value })}><option value="ls">л/с</option><option value="m3h">м³/ч</option></select><//></div>`
            : html`<div class="rf-grid"><${Lbl} t="Объём, л"><input class="input" inputmode="decimal" value=${fl.volume} onInput=${(e) => setFlow({ volume: e.target.value })} /><//>
              <${Lbl} t="Время наполнения, с"><input class="input" inputmode="decimal" value=${fl.time} onInput=${(e) => setFlow({ time: e.target.value })} /><//></div>`}
        </div>
        <div class="rf-grid">
          <${Lbl} t="Домен"><select class="input" value=${f.domain || ''} onChange=${(e) => setF({ domain: e.target.value })}><option value="">—</option>${domainOpts.map((s) => html`<option key=${s} value=${s}>${s}</option>`)}</select><//>
          <${Lbl} t="Борт"><select class="input" value=${f.wall || ''} onChange=${(e) => setF({ wall: e.target.value })}><option value="">—</option>${WALL_OPTIONS.map((s) => html`<option key=${s} value=${s}>${s}</option>`)}</select><//>
          <${Lbl} t="Горизонт"><input class="input" value=${f.horizon || ''} onInput=${(e) => setF({ horizon: e.target.value })} /><//>
          <${Lbl} t="Цвет воды"><select class="input" value=${f.water_color || ''} onChange=${(e) => setF({ water_color: e.target.value })}><option value="">—</option>${WATER_COLOR_OPTIONS.map((s) => html`<option key=${s} value=${s}>${s}</option>`)}</select><//>
          <${Lbl} t="Метод замера"><select class="input" value=${f.measure_method || ''} onChange=${(e) => setF({ measure_method: e.target.value })}><option value="">—</option>${MEASURE_METHOD_OPTIONS.map((s) => html`<option key=${s} value=${s}>${s}</option>`)}</select><//>
          <${Lbl} t="Отметка уровня воды, м"><input class="input" inputmode="decimal" value=${numStr(f.water_level_z)} onInput=${(e) => setF({ water_level_z: e.target.value })} /><//>
        </div>`}

      ${draft.type !== 'measure' && html`
        <div class="rf-pos">
          <div class="rf-pos-head"><b>${isOut ? 'Положение выхода воды' : 'Положение точки'}</b><button class="btn btn-outline btn-sm" onClick=${onRepick}><${Crosshair} size=${15} /> Указать заново на карте</button></div>
          <div class="rf-grid three">
            <${Lbl} t="X, м"><input class="input" inputmode="decimal" value=${numStr(draft.x)} onInput=${(e) => set({ x: e.target.value, zAuto: false })} /><//>
            <${Lbl} t="Y, м"><input class="input" inputmode="decimal" value=${numStr(draft.y)} onInput=${(e) => set({ y: e.target.value, zAuto: false })} /><//>
            <${Lbl} t=${isOut ? 'Z выхода, м' : 'Z (рельеф), м'}><input class="input" inputmode="decimal" value=${numStr(draft.z)} onInput=${(e) => set({ z: e.target.value, zAuto: false })} /><//>
          </div>
          <div class="rf-hint">${draft.zAuto ? 'Z взята по рельефу схемы пакета.' : 'Z введена вручную или рельефа в этой точке нет.'}</div>
        </div>`}

      <${Lbl} t="Комментарий" wide><textarea class="input" rows="3" value=${f.comment || ''} onInput=${(e) => setF({ comment: e.target.value })} /><//>
      <div class="rf-photos">
        <div class="rf-photos-head"><b>Фото</b><button class="btn btn-outline btn-sm" onClick=${() => fileRef.current && fileRef.current.click()}><${Camera} size=${15} /> Снять / добавить</button></div>
        <div class="thumbs">${(draft.photos || []).map((id) => html`<${Thumb} key=${id} id=${id} onRemove=${() => removePhoto(id)} />`)}${!(draft.photos || []).length && html`<span class="rf-hint">Фото нет</span>`}</div>
        <input ref=${fileRef} type="file" accept="image/*" capture="environment" multiple style=${{ display: 'none' }} onChange=${onFiles} />
      </div>
    <//>`;
}

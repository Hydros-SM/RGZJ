// Съёмки БПЛА в полевой платформе: загрузка с планшета файлов OBJ + текстура (ортофотоплан/фотомодель или тепловизор), список сохранённых на устройстве
// съёмок, выбор показываемой, прозрачность, «вместо рельефа». Разбор файлов идёт в фоновом потоке (lib/uav-worker.js), результат хранится в IndexedDB.
import React, { useRef, useState } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import { html } from '../lib/html.js';
import { Button, Dialog, confirmAsk } from './ui.js';
import { saveScan, deleteScan, newScanId, KINDS } from '../lib/uav-store.js';
import { todayIso } from '../lib/work.js';

const mb = (b) => (b < 102400 ? Math.max(1, Math.round(b / 1024)) + ' КБ' : (b / 1048576 >= 10 ? Math.round(b / 1048576) : (b / 1048576).toFixed(1).replace('.', ',')) + ' МБ');
const fmtDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : (d || '—'); };
const isImg = (f) => /\.(jpe?g|png)$/i.test(f.name);

export function UavSettings({ open, onClose, kind, vs: view, setVs: setView, scans, reload }) {
  const cfg = view.uav[kind], list = scans.filter((s) => s.kind === kind).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const set = (patch) => setView({ ...view, uav: { ...view.uav, [kind]: { ...cfg, ...patch } } });
  const [files, setFiles] = useState([]);
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayIso());
  const [quality, setQuality] = useState('light');
  const [prog, setProg] = useState(null); // { stage, frac, info } | { error } | { done, stage }
  const workerRef = useRef(null);
  if (!open) return null;
  const obj = files.find((f) => /\.obj$/i.test(f.name)) || null;
  const tex = files.filter(isImg).sort((a, b) => b.size - a.size)[0] || null;
  const busy = !!(prog && !prog.error && !prog.done);

  function pick(e) {
    const fl = Array.from(e.target.files || []); e.target.value = '';
    setFiles(fl); setProg(null);
    const o = fl.find((f) => /\.obj$/i.test(f.name)); if (o) setName(o.name.replace(/\.obj$/i, ''));
  }
  function start() {
    if (!obj) return;
    setProg({ stage: 'Запуск', frac: 0 });
    let w;
    try { w = new Worker(new URL('../lib/uav-worker.js', import.meta.url), { type: 'module' }); } catch (err) { setProg({ error: 'Браузер не смог запустить фоновую обработку: ' + err.message }); return; }
    workerRef.current = w;
    w.onmessage = async (ev) => {
      const m = ev.data;
      if (m.type === 'stage') setProg({ stage: m.stage, frac: m.frac, info: m.info });
      else if (m.type === 'error') { w.terminate(); setProg({ error: m.message }); }
      else if (m.type === 'done') {
        w.terminate();
        try {
          setProg({ stage: 'Сохранение на устройстве', frac: 0.97 });
          const r = m.result, id = newScanId();
          const meta = { id, kind, name: name.trim() || obj.name, date, triangles: r.triangles, vertices: r.vertices, sourceTriangles: r.sourceTriangles, bytes: r.mesh.byteLength + (r.texture ? r.texture.blob.size : 0), hasTexture: !!r.texture, quality, bbox: r.bbox, createdAt: new Date().toISOString() };
          await saveScan(meta, r.mesh, r.texture && r.texture.blob);
          await reload();
          set({ id });
          setFiles([]); setProg({ done: true, stage: 'Готово: ' + meta.triangles.toLocaleString('ru-RU') + ' треугольников' + (r.texture ? ', текстура ' + r.texture.w + '×' + r.texture.h : ', без текстуры') });
        } catch (err) { setProg({ error: 'Не удалось сохранить на устройстве: ' + (err && err.message ? err.message : err) }); }
      }
    };
    w.onerror = (ev) => { w.terminate(); setProg({ error: 'Ошибка обработки файла: ' + (ev.message || 'неизвестная') }); };
    w.postMessage({ obj, tex, quality });
  }
  function cancel() { if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; } setProg(null); }
  async function remove(s) {
    if (!(await confirmAsk('Удалить съёмку «' + s.name + '» с этого планшета? В основной платформе и на сервере ничего не меняется.', { title: 'Удаление съёмки' }))) return;
    await deleteScan(s.id); if (cfg.id === s.id) set({ id: '' }); await reload();
  }
  const title = KINDS[kind];
  return html`
    <${Dialog} open=${open} onClose=${() => { if (!busy) onClose(); }} title=${'Слой «' + title + '»'} width="min(620px, 96vw)" footer=${html`<${Button} onClick=${onClose} disabled=${busy}>Готово<//>`}>
      <div class="ls-block">
        <b>Загрузить новую съёмку</b>
        <label class="btn btn-outline" style=${{ cursor: busy ? 'default' : 'pointer', alignSelf: 'flex-start' }}>
          <input type="file" multiple accept=".obj,.mtl,.jpg,.jpeg,.png" style=${{ display: 'none' }} onChange=${pick} disabled=${busy} />
          <${Upload} size=${16} /> Выбрать файлы (OBJ + текстура)
        </label>
        <div class="ls-hint">Выберите сразу все файлы съёмки: модель .obj и картинку-текстуру (.jpg или .png). Файл .mtl можно не выбирать. Файлы читаются прямо на планшете и никуда не отправляются.</div>
        ${files.length > 0 && html`<div class="ls-hint"><b>Модель:</b> ${obj ? obj.name + ' (' + mb(obj.size) + ')' : 'не выбрана — нужен файл .obj'}<br /><b>Текстура:</b> ${tex ? tex.name + ' (' + mb(tex.size) + ')' : 'нет — модель будет без изображения'}</div>`}
        ${obj && html`
          <div class="ls-row"><span class="ls-lbl">Название</span><input class="input" value=${name} onInput=${(e) => setName(e.target.value)} disabled=${busy} /></div>
          <div class="ls-row"><span class="ls-lbl">Дата съёмки</span><input class="input" type="date" value=${date} onInput=${(e) => setDate(e.target.value)} disabled=${busy} /></div>
          <div class="ls-row"><span class="ls-lbl">Качество</span>
            <select class="input" value=${quality} onChange=${(e) => setQuality(e.target.value)} disabled=${busy}>
              <option value="light">Лёгкая — быстро и плавно (рекомендуется для планшета)</option>
              <option value="medium">Средняя — детальнее, тяжелее и дольше</option>
            </select></div>
          <div class="ls-hint">Крупные модели упрощаются (до 150–600 тыс. треугольников), текстура уменьшается до 2048 или 4096 px. Обработка большого файла (100+ МБ) на планшете может занять несколько минут — не закрывайте приложение.</div>
          <div class="ls-row">${busy ? html`<${Button} variant="outline" onClick=${cancel}>Отменить<//>` : html`<${Button} onClick=${start}>Загрузить в приложение<//>`}</div>`}
        ${prog && !prog.error && html`<div>
          <div style=${{ height: '10px', borderRadius: '5px', background: 'rgba(181,133,28,.18)', overflow: 'hidden' }}><div style=${{ height: '100%', width: Math.round((prog.frac != null ? prog.frac : 1) * 100) + '%', background: 'var(--gold-500, #B5851C)', transition: 'width .25s' }} /></div>
          <div class="ls-hint" style=${{ marginTop: '4px' }}>${prog.done ? prog.stage : prog.stage + ' — ' + Math.round(prog.frac * 100) + '%' + (prog.info && prog.info.triangles ? ' · ' + Math.round(prog.info.triangles).toLocaleString('ru-RU') + ' треугольников' : '')}</div>
        </div>`}
        ${prog && prog.error && html`<div class="ls-hint" style=${{ color: '#b42318' }}>${prog.error}</div>`}
      </div>
      <div class="ls-block">
        <b>Съёмки на этом планшете (${list.length})</b>
        ${!list.length && html`<div class="ls-hint">Пока нет. Загрузите первую выше.</div>`}
        ${list.length > 0 && html`<div class="ls-list">
          <label class="ls-item"><input type="radio" name=${'uav-' + kind} checked=${!cfg.id} onChange=${() => set({ id: '' })} /><span>Не показывать</span></label>
          ${list.map((s) => html`<label key=${s.id} class="ls-item"><input type="radio" name=${'uav-' + kind} checked=${cfg.id === s.id} onChange=${() => set({ id: s.id })} /><span>${s.name}<br /><small>${fmtDate(s.date)} · ${s.triangles.toLocaleString('ru-RU')} треуг. · ${mb(s.bytes)}${s.hasTexture ? '' : ' · без текстуры'}</small></span><button type="button" class="btn btn-ghost btn-sm" title="Удалить с планшета" onClick=${(e) => { e.preventDefault(); remove(s); }}><${Trash2} size=${16} /></button></label>`)}
        </div>`}
      </div>
      <div class="ls-block">
        <b>Отображение</b>
        <div class="ls-row"><span class="ls-lbl">Прозрачность</span><input type="range" min="0.1" max="1" step="0.05" value=${cfg.opacity} onInput=${(e) => set({ opacity: Number(e.target.value) })} /><b>${Math.round((1 - cfg.opacity) * 100)}%</b></div>
        ${kind === 'photo' && html`<label class="ls-opt"><input type="checkbox" checked=${!!cfg.replace} onChange=${(e) => set({ replace: e.target.checked })} /> Показывать вместо рельефа схемы</label>`}
        <div class="ls-hint">${kind === 'photo' ? 'Фотомодель можно держать поверх рельефа схемы или вместо него. ' : 'Тепловизор показывается поверх рельефа и фотомодели. '}Съёмка видна во вкладке «Модель → 3D»; включать и выключать её можно галочкой в списке слоёв. Точки, выходы воды и разломы рисуются вместе с ней.</div>
      </div>
    <//>`;
}

// Вкладка «Пакет»: «Начать полевую работу» — импорт пакета из основной платформы, сведения о загруженном пакете, очистка данных на планшете.
import React, { useEffect, useRef, useState } from 'react';
import { PackageOpen, Trash2, Lock, HardDrive } from 'lucide-react';
import { html } from '../lib/html.js';
import { importPackage, readPackageFile, buildSession, clearSession } from '../lib/session.js';
import { storageInfo, requestPersistence } from '../store.js';

const fmtDt = (s) => { try { return new Date(s).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return s || '—'; } };
const mb = (n) => (n / 1048576).toFixed(1);

export function PackagePage({ session, onSession }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [needPw, setNeedPw] = useState(false);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(null);
  useEffect(() => { storageInfo().then(setInfo); }, [session]);

  async function doImport(f, password) {
    setBusy(true); setError('');
    try {
      const rec = await importPackage(f, password);
      await requestPersistence();
      onSession(buildSession(rec));
      setFile(null); setNeedPw(false); setPw('');
    } catch (e) {
      if (e.needPassword) { setNeedPw(true); setError(password ? 'Неверный пароль' : ''); } else setError(e.message || String(e));
    } finally { setBusy(false); }
  }
  function onPick(e) {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (session && !confirm('Данные на планшете будут заменены пакетом «' + f.name + '». Продолжить?')) return;
    setFile(f); setNeedPw(false); setPw(''); doImport(f, null);
  }
  async function wipe() {
    if (!confirm('Удалить пакет и все данные полевой работы с этого планшета?')) return;
    await clearSession(); onSession(null);
  }

  const m = session && session.manifest, c = m && m.counts;
  return html`
    <div class="package-page">
      ${!session ? html`
        <div class="start-card">
          <${PackageOpen} size=${46} />
          <h2>Начать полевую работу</h2>
          <p>Загрузите полевой пакет, подготовленный в основной платформе («Подготовка к полевым работам»). После загрузки карта, список точек и модель карьера работают без интернета.</p>
          <button class="btn btn-primary btn-big" disabled=${busy} onClick=${() => fileRef.current && fileRef.current.click()}>${busy ? 'Загрузка…' : 'Выбрать файл пакета (.gfield)'}</button>
          ${needPw && html`<div class="pw-box"><${Lock} size=${16} /> Пакет защищён паролем
            <input type="password" class="input" placeholder="Пароль" value=${pw} onInput=${(e) => setPw(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter' && pw) doImport(file, pw); }} autofocus />
            <button class="btn btn-primary" disabled=${busy || !pw} onClick=${() => doImport(file, pw)}>Открыть</button></div>`}
          ${error && html`<div class="err">${error}</div>`}
        </div>` : html`
        <div class="pkg-grid">
          <div class="card pkg-card">
            <h3>Загруженный пакет</h3>
            <div class="kv"><span>Карьер</span><b>${m.quarry}</b></div>
            <div class="kv"><span>Схема (неделя)</span><b>${m.scheme && m.scheme.weekKey}</b></div>
            <div class="kv"><span>Подготовлен</span><b>${fmtDt(m.createdAt)}${m.createdBy ? ' · ' + m.createdBy : ''}</b></div>
            <div class="kv"><span>Версия основной платформы</span><b>${m.appVersion || '—'}</b></div>
            <div class="kv"><span>Загружен на планшет</span><b>${fmtDt(session.importedAt)}</b></div>
            <div class="kv"><span>Файл</span><b>${session.fileName || '—'}</b></div>
            ${session.fileHash && html`<div class="kv"><span>Контрольная сумма SHA-256</span><b style=${{ fontFamily: 'var(--font-mono)', fontSize: '11px', wordBreak: 'break-all', maxWidth: '60%' }}>${session.fileHash}</b></div>`}
          </div>
          <div class="card pkg-card">
            <h3>Состав</h3>
            <div class="kv"><span>Рельеф, треугольников</span><b>${(c.terrainTriangles || 0).toLocaleString('ru-RU')}</b></div>
            ${c.faults != null && html`<div class="kv"><span>Разломы (поверхности)</span><b>${c.faults}</b></div>`}
            ${c.points != null && html`<div class="kv"><span>Точки замера / выходы воды</span><b>${c.points} / ${c.outflows}</b></div>`}
            ${c.piezo != null && html`<div class="kv"><span>Пьезометры / датчики</span><b>${c.piezo} / ${c.sensors}</b></div>`}
            ${c.observation != null && html`<div class="kv"><span>Наблюдательные скважины</span><b>${c.observation}</b></div>`}
            ${c.horizontal != null && html`<div class="kv"><span>Горизонтальные скважины</span><b>${c.horizontal}</b></div>`}
            ${c.domains != null && html`<div class="kv"><span>Домены</span><b>${c.domains}</b></div>`}
            ${info && html`<div class="kv"><span><${HardDrive} size=${13} /> Память на планшете</span><b>${mb(info.used)} МБ из ${mb(info.quota)} МБ</b></div>`}
          </div>
        </div>
        <div class="pkg-actions">
          <button class="btn btn-outline" disabled=${busy} onClick=${() => fileRef.current && fileRef.current.click()}>Загрузить другой пакет</button>
          <button class="btn btn-ghost danger" onClick=${wipe}><${Trash2} size=${16} /> Удалить данные с планшета</button>
        </div>
        ${needPw && html`<div class="pw-box"><${Lock} size=${16} /> Пакет защищён паролем
          <input type="password" class="input" placeholder="Пароль" value=${pw} onInput=${(e) => setPw(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter' && pw) doImport(file, pw); }} />
          <button class="btn btn-primary" disabled=${busy || !pw} onClick=${() => doImport(file, pw)}>Открыть</button></div>`}
        ${error && html`<div class="err">${error}</div>`}
        <p class="hint">Фиксация новых точек и выходов воды, фото и экспорт результатов появятся на следующих этапах разработки.</p>`}
      <input ref=${fileRef} type="file" accept=".gfield,.zip,application/zip,application/octet-stream" style=${{ display: 'none' }} onChange=${onPick} />
    </div>`;
}

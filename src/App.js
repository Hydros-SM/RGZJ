// Оболочка полевой платформы: вкладки «Карта», «Список точек», «Модель», «Пакет»; без загруженного пакета доступна только «Пакет».
import React, { useEffect, useState } from 'react';
import { Map as MapIcon, ListChecks, Box, PackageOpen } from 'lucide-react';
import { html } from './lib/html.js';
import { loadStoredSession } from './lib/session.js';
import { PlanPage } from './pages/PlanPage.js';
import { PointsPage } from './pages/PointsPage.js';
import { PackagePage } from './pages/PackagePage.js';

export const APP_VERSION = 'v0.1.1 (этап 1)';
const TABS = [['map', 'Карта', MapIcon], ['points', 'Список точек', ListChecks], ['model', 'Модель', Box], ['package', 'Пакет', PackageOpen]];

export function App() {
  const [session, setSession] = useState(undefined); // undefined — читаем хранилище, null — пакета нет
  const [tab, setTab] = useState('package');
  const [focusReq, setFocusReq] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false); // весь код и библиотеки уже в офлайн-кэше устройства
  useEffect(() => {
    loadStoredSession().then((s) => { setSession(s); if (s) setTab('map'); }).catch((e) => { console.error(e); setSession(null); });
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  useEffect(() => {
    if (!('caches' in window)) return undefined;
    let n = 0, stop = false;
    const check = async () => {
      n++;
      try {
        const used = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => /^https?:/.test(u));
        let missing = 0;
        for (const u of used) { if (!(await caches.match(u))) missing++; }
        if (!stop && used.length && missing === 0 && navigator.serviceWorker && navigator.serviceWorker.controller) { setOfflineReady(true); return; }
      } catch (e) { /* кэш недоступен — отметку не показываем */ }
      if (!stop && n < 20) setTimeout(check, 2500);
    };
    setTimeout(check, 2500);
    return () => { stop = true; };
  }, []);
  function onSession(s) { setSession(s); setTab(s ? 'map' : 'package'); }
  function showOnMap(req) { setFocusReq({ ...req, n: Date.now() }); setTab('map'); }

  const need = !session && tab !== 'package';
  return html`
    <div class="field-shell">
      <header class="field-top">
        <div class="brand"><b>Полевая платформа</b><span>${session ? session.manifest.quarry + ' · схема ' + (session.manifest.scheme && session.manifest.scheme.weekKey) : 'пакет не загружен'}</span></div>
        <nav class="tabs">${TABS.map(([k, label, Icon]) => html`<button key=${k} class=${'tab' + (tab === k ? ' active' : '')} disabled=${!session && k !== 'package'} onClick=${() => setTab(k)}><${Icon} size=${20} /><span>${label}</span></button>`)}</nav>
        ${offlineReady && html`<div class="net on" title="Код приложения сохранён на устройстве: оно откроется и без интернета">готово без сети ✓</div>`}
        <div class=${'net ' + (online ? 'on' : 'off')} title=${online ? 'Есть интернет' : 'Нет интернета — работаем офлайн'}>${online ? 'онлайн' : 'офлайн'}</div>
      </header>
      <main class="field-main">
        ${session === undefined && html`<div class="empty">Читаю данные планшета…</div>`}
        ${session !== undefined && (need || tab === 'package') && html`<${PackagePage} session=${session} onSession=${onSession} />`}
        ${session && tab === 'map' && html`<${PlanPage} key="map" session=${session} mode="map" focusRequest=${focusReq} />`}
        ${session && tab === 'model' && html`<${PlanPage} key="model" session=${session} mode="model" focusRequest=${focusReq} />`}
        ${session && tab === 'points' && html`<${PointsPage} session=${session} onShowOnMap=${showOnMap} />`}
      </main>
      <footer class="field-foot">${APP_VERSION}</footer>
    </div>`;
}

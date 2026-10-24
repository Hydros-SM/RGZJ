import React from 'react';
import { createRoot } from 'react-dom/client';
import { html } from './lib/html.js';
import { App } from './App.js';

createRoot(document.getElementById('root')).render(html`<${App} />`);

// Офлайн-кэш: регистрируем на HTTPS-хостинге; на localhost — только с ?sw=1 (чтобы при разработке не подсовывало старый код).
// После регистрации просим Service Worker дозагрузить в кэш всё, что страница уже загрузила (иначе после первого запуска в кэше только каркас).
// Новая версия подхватывается в фоне; чтобы не ждать «второго запуска», показываем плашку «Обновить» (перезагрузка не сбрасывает записи — они в IndexedDB)
if ('serviceWorker' in navigator) {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!had || document.getElementById('upd-bar')) return;
    const bar = document.createElement('div'); bar.id = 'upd-bar'; bar.className = 'upd-bar';
    bar.innerHTML = '<span>Доступна новая версия приложения</span><button>Обновить</button>';
    bar.querySelector('button').onclick = () => location.reload();
    document.body.appendChild(bar);
  });
}
if ('serviceWorker' in navigator && (location.protocol === 'https:' || new URLSearchParams(location.search).has('sw'))) {
  const warm = async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      await navigator.serviceWorker.ready;
      // 3D-библиотека нужна только на вкладке «Модель → 3D», но для офлайна должна лежать в кэше уже после первого запуска
      await Promise.allSettled([import('three'), import('three/addons/controls/OrbitControls.js')]);
      const urls = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => /^https?:/.test(u));
      const sw = reg.active || navigator.serviceWorker.controller;
      if (sw) sw.postMessage({ type: 'cache-urls', urls: urls.concat([location.href]) });
    } catch (e) { console.warn('Офлайн-кэш не включён:', e.message); }
  };
  if (document.readyState === 'complete') setTimeout(warm, 800); else window.addEventListener('load', () => setTimeout(warm, 800));
}

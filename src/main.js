import React from 'react';
import { createRoot } from 'react-dom/client';
import { html } from './lib/html.js';
import { App } from './App.js';

createRoot(document.getElementById('root')).render(html`<${App} />`);

// Офлайн-кэш: регистрируем на HTTPS-хостинге; на localhost — только с ?sw=1 (чтобы при разработке не подсовывало старый код).
// После регистрации просим Service Worker дозагрузить в кэш всё, что страница уже загрузила (иначе после первого запуска в кэше только каркас).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || new URLSearchParams(location.search).has('sw'))) {
  const warm = async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      await navigator.serviceWorker.ready;
      const urls = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => /^https?:/.test(u));
      const sw = reg.active || navigator.serviceWorker.controller;
      if (sw) sw.postMessage({ type: 'cache-urls', urls: urls.concat([location.href]) });
    } catch (e) { console.warn('Офлайн-кэш не включён:', e.message); }
  };
  if (document.readyState === 'complete') setTimeout(warm, 800); else window.addEventListener('load', () => setTimeout(warm, 800));
}

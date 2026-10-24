import React from 'react';
import { createRoot } from 'react-dom/client';
import { html } from './lib/html.js';
import { App } from './App.js';

createRoot(document.getElementById('root')).render(html`<${App} />`);

// Офлайн-кэш: регистрируем на HTTPS-хостинге; на localhost — только с ?sw=1 (чтобы при разработке не подсовывало старый код)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || new URLSearchParams(location.search).has('sw'))) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Офлайн-кэш не включён:', e.message));
}

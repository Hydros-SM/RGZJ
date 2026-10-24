import React, { useEffect, useRef, useState } from 'react';
import { PanelRightOpen, PanelRightClose, CheckCircle2, HelpCircle } from 'lucide-react';
import { html } from '../lib/html.js';

export function Button({ variant = 'primary', size = 'md', icon = false, className = '', ...props }) {
  const cls = ['btn', `btn-${variant}`, size === 'sm' ? 'btn-sm' : '', icon ? 'btn-icon' : '', className].filter(Boolean).join(' ');
  return html`<button class=${cls} ...${props} />`;
}

export function Card({ children, className = '', ...props }) {
  return html`<div class=${'card ' + className} ...${props}>${children}</div>`;
}
export function CardHeader({ children, ...props }) { return html`<div class="card-header" ...${props}>${children}</div>`; }
export function CardTitle({ children, subtitle }) {
  return html`
    <div>
      <div class="card-title">${children}</div>
      ${subtitle && html`<div class="card-subtitle">${subtitle}</div>`}
    </div>
  `;
}
// Кнопка «?» рядом с названием графика: по нажатию — небольшая подсказка, что это за график (закрывается кликом вне неё)
export function InfoHint({ children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return html`
    <span class="info-hint" ref=${ref}>
      <button type="button" class=${'info-hint-btn' + (open ? ' open' : '')} aria-label="Что это за график" title="Что это за график" onClick=${() => setOpen((o) => !o)}>?</button>
      ${open && html`<div class="info-hint-pop" role="tooltip">${children}</div>`}
    </span>
  `;
}
export function CardContent({ children, tight = false }) {
  return html`<div class=${'card-content' + (tight ? ' tight' : '')}>${children}</div>`;
}

export function Badge({ variant = 'default', dot = false, children }) {
  return html`<span class=${'badge ' + (variant !== 'default' ? 'badge-' + variant : '')}>${dot && html`<span class="badge-dot" />`}${children}</span>`;
}

export function Input({ icon, className = '', ...props }) {
  if (icon) {
    return html`<div class="input-icon-wrap">${icon}<input class=${'input ' + className} ...${props} /></div>`;
  }
  return html`<input class=${'input ' + className} ...${props} />`;
}

export function Select({ className = '', children, ...props }) {
  return html`<select class=${'select ' + className} ...${props}>${children}</select>`;
}

export function Field({ label, children }) {
  return html`<div class="field"><label class="field-label">${label}</label>${children}</div>`;
}

export function Skeleton({ width = '100%', height = '14px', style = {} }) {
  return html`<div class="skeleton" style=${{ width, height, ...style }} />`;
}

export function EmptyState({ icon, title, description }) {
  return html`
    <div class="empty-state">
      ${icon}
      <div class="empty-state-title">${title}</div>
      ${description && html`<div>${description}</div>`}
    </div>
  `;
}

export function KpiCard({ label, value, unit, trend, trendLabel }) {
  return html`
    <${Card}>
      <div class="kpi-card">
        <div class="kpi-label">${label}</div>
        <div class="kpi-value">${value}${unit && html`<span style=${{ fontSize: '14px', fontWeight: 600, color: 'var(--text-tertiary)', marginLeft: '4px' }}>${unit}</span>`}</div>
        ${trend != null && html`
          <div class=${'kpi-trend ' + (trend >= 0 ? 'up' : 'down')}>
            <span>${trend >= 0 ? '↑' : '↓'} ${Math.abs(trend)}${typeof trend === 'number' && Math.abs(trend) < 100 ? '%' : ''}</span>
            ${trendLabel && html`<span style=${{ color: 'var(--text-tertiary)', fontWeight: 500 }}>${trendLabel}</span>`}
          </div>
        `}
      </div>
    <//>
  `;
}

export function Tabs({ tabs, value, onChange }) {
  return html`
    <div class="tabs-list">
      ${tabs.map((t) => html`
        <button key=${t.value} class=${'tabs-trigger' + (t.value === value ? ' active' : '')} onClick=${() => onChange(t.value)}>
          ${t.label}
          ${t.badge && html`<span class="tabs-trigger-badge">${t.badge}</span>`}
        </button>
      `)}
    </div>
  `;
}

export function Table({ columns, rows, rowKey, emptyIcon, emptyTitle, emptyDescription, loading, onRowClick }) {
  if (loading) {
    return html`
      <div class="table-wrap"><table class="data-table">
        <thead><tr>${columns.map((c) => html`<th key=${c.key}>${c.header}</th>`)}</tr></thead>
        <tbody>
          ${[0, 1, 2, 3, 4].map((i) => html`
            <tr key=${i}>${columns.map((c) => html`<td key=${c.key}><${Skeleton} height="12px" width=${(40 + (i * 7) % 40) + '%'} /></td>`)}</tr>
          `)}
        </tbody>
      </table></div>
    `;
  }
  if (!rows.length) {
    return html`<${EmptyState} icon=${emptyIcon} title=${emptyTitle} description=${emptyDescription} />`;
  }
  return html`
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>${columns.map((c) => html`<th key=${c.key} style=${c.width ? { width: c.width } : undefined}>${c.header}</th>`)}</tr></thead>
        <tbody>
          ${rows.map((row) => html`
            <tr key=${rowKey(row)} onClick=${onRowClick ? () => onRowClick(row) : undefined} style=${onRowClick ? { cursor: 'pointer' } : undefined}>${columns.map((c) => html`<td key=${c.key}>${c.render ? c.render(row) : row[c.key]}</td>`)}</tr>
          `)}
        </tbody>
      </table>
    </div>
  `;
}

// Оборачивает содержимое страницы: если canEdit=false, блокирует все клики/ввод
// внутри и показывает плашку «Только просмотр» — не требует правок внутри самих
// страниц, работает как общий генерик-гейт для ролей с правом просмотра без записи.
export function ReadOnlyGate({ active, children }) {
  if (!active) return children;
  return html`
    <div style=${{ position: 'relative' }}>
      <div style=${{ position: 'absolute', top: '10px', right: '10px', zIndex: 50, display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '999px', background: 'var(--amber-100)', color: 'var(--amber-600)', fontSize: '11.5px', fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
        👁 Только просмотр
      </div>
      <div style=${{ pointerEvents: 'none', opacity: 0.75 }}>${children}</div>
    </div>
  `;
}

// Сворачиваемая боковая панель — тот же приём, что у главного левого сайдбара
// (data-collapsed + CSS-переменная ширины + transition), но с заголовком-строкой
// вместо плавающей круглой кнопки (панель встроена в поток рядом с другим контентом,
// а не является самостоятельной колонкой на всю высоту экрана).
export function SidePanel({ collapsed, onToggleCollapsed, title, width = '230px', collapsedWidth = '34px', children }) {
  return html`
    <div class="side-panel" data-collapsed=${collapsed ? '1' : '0'} style=${{ '--side-panel-w': width, '--side-panel-w-collapsed': collapsedWidth }}>
      <div class="side-panel-header">
        ${!collapsed && html`<span class="side-panel-title">${title}</span>`}
        <${Button} variant="ghost" size="sm" icon onClick=${onToggleCollapsed} title=${collapsed ? 'Развернуть' : 'Свернуть'}>
          <${collapsed ? PanelRightOpen : PanelRightClose} size=${16} />
        <//>
      </div>
      ${!collapsed && html`<div class="side-panel-body">${children}</div>`}
    </div>
  `;
}

// help — необязательная справка: в шапке появляется кнопка «?», по нажатию справа от окна открывается панель с текстом.
// Все длинные пояснения (как заполнить шаблон, правила разбора и т.п.) выносим сюда, чтобы не раздувать само окно.
export function Dialog({ open, onClose, title, children, footer, width, help, helpTitle }) {
  const [helpOpen, setHelpOpen] = useState(false);
  if (!open) return null;
  const box = html`
    <div class="dialog" style=${width ? { width } : undefined}>
      <div class="dialog-header">
        <div class="dialog-title">${title}</div>
        <div class="dialog-header-btns">
          ${help && html`<${Button} variant="ghost" size="sm" icon className=${helpOpen ? 'io-help-on' : ''} title="Справка" aria-label="Справка" onClick=${() => setHelpOpen((v) => !v)}><${HelpCircle} size=${16} /><//>`}
          <${Button} variant="ghost" size="sm" icon onClick=${onClose}>✕<//>
        </div>
      </div>
      <div class="dialog-body">${children}</div>
      ${footer && html`<div class="dialog-footer">${footer}</div>`}
    </div>`;
  return html`
    <div class="dialog-overlay" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      ${help ? html`<div class="dialog-wrap">${box}${helpOpen && html`<aside class="dialog-help"><h4>${helpTitle || 'Справка'}</h4>${help}</aside>`}</div>` : box}
    </div>
  `;
}

// Замена window.confirm() — в некоторых браузерных окружениях/встроенных
// вебвью (см. аналогичный локальный компонент в Chem.js, где это обнаружили
// первым) нативный confirm() тихо возвращает false без показа пользователю
// диалога вообще, из-за чего действие («Удалить…») выглядит так, будто
// ничего не происходит, без единой ошибки. Обёрнуто в Dialog, чтобы всегда
// реально отрисовываться на странице, а не полагаться на браузер.
export function ConfirmDialog({ open, title, message, confirmLabel, danger, busy, onConfirm, onCancel }) {
  if (!open) return null;
  return html`
    <${Dialog} open=${true} onClose=${busy ? () => {} : onCancel} title=${title || 'Подтверждение'} width="min(480px, 92vw)"
      footer=${html`
        <${Button} variant="outline" onClick=${onCancel} disabled=${busy}>Отмена<//>
        <${Button} onClick=${onConfirm} disabled=${busy} style=${danger ? { background: 'var(--red-500)', borderColor: 'var(--red-500)' } : undefined}>
          ${busy ? 'Удаление…' : (confirmLabel || 'Подтвердить')}
        <//>
      `}>
      <div style=${{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>${message}</div>
    <//>
  `;
}

// ── Глобальные диалоги: confirmAsk(...) и notify(...) ─────────────────────────────
// Нативные confirm()/alert() во встроенных окнах приложения не показываются (confirm молча возвращает false),
// поэтому вызываем свои: `if (!(await confirmAsk('Удалить?'))) return;` и `notify('Текст ошибки')`.
// Сами диалоги рисует <DialogHost /> — он подключён один раз в App.js, поверх всех остальных окон.
let dialogHost = null;
export function confirmAsk(message, { title = 'Удаление', confirmLabel = 'Удалить', danger = true } = {}) {
  if (!dialogHost) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => dialogHost.setAsk({ message, title, confirmLabel, danger, resolve }));
}
export function notify(message, title = 'Сообщение') {
  if (!dialogHost) { window.alert(message); return; }
  dialogHost.setNotice({ message, title });
}
export function DialogHost() {
  const [ask, setAsk] = useState(null);
  const [notice, setNotice] = useState(null);
  useEffect(() => { dialogHost = { setAsk, setNotice }; return () => { dialogHost = null; }; }, []);
  const answer = (value) => { if (ask) ask.resolve(value); setAsk(null); };
  return html`
    <${ConfirmDialog} open=${!!ask} title=${ask && ask.title} message=${ask && ask.message} confirmLabel=${ask && ask.confirmLabel}
      danger=${!!(ask && ask.danger)} onConfirm=${() => answer(true)} onCancel=${() => answer(false)} />
    ${notice && html`
      <${Dialog} open=${true} onClose=${() => setNotice(null)} title=${notice.title} width="min(480px, 92vw)"
        footer=${html`<${Button} onClick=${() => setNotice(null)}>Понятно<//>`}>
        <div style=${{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>${notice.message}</div>
      <//>`}
  `;
}

// Всплывающее подтверждение успеха («Сохранено» и т.п.) — многие диалоги
// сохранения просто закрываются сами по себе после нажатия «Сохранить»,
// без какой-либо реакции, из-за чего непонятно, прошло действие или нет
// (особенно при заметной задержке сети). useToast() хранит текст + таймер
// автоскрытия, <Toast> его отрисовывает — вызывающая страница просто
// добавляет showToast('Сохранено') в конце успешного сохранения и рендерит
// <Toast message=${toastMsg} /> где-нибудь у себя.
export function useToast(duration = 2200) {
  const [msg, setMsg] = useState(null);
  const timerRef = useRef(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  function show(text) {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMsg(text);
    timerRef.current = setTimeout(() => setMsg(null), duration);
  }
  return [msg, show];
}

export function Toast({ message }) {
  if (!message) return null;
  return html`
    <div style=${{
      position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)', zIndex: 5000,
      display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '999px',
      background: 'var(--stone-900, #1c1917)', color: '#fff', fontSize: '13px', fontWeight: 600,
      boxShadow: 'var(--shadow-lg)', pointerEvents: 'none',
    }}>
      <${CheckCircle2} size=${16} style=${{ color: 'var(--green-400, #4ade80)', flexShrink: 0 }} />
      ${message}
    </div>
  `;
}

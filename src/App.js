// Оболочка полевой платформы: вкладки «Карта», «Список точек», «Модель», «Записи», «Пакет»; без загруженного пакета доступна только «Пакет».
// Здесь же живут полевые записи (work): новая точка / замер / выход воды — место указывается касанием, затем форма (RecordDialog).
import React, { useEffect, useMemo, useState } from 'react';
import { Map as MapIcon, ListChecks, Box, PackageOpen, ClipboardList } from 'lucide-react';
import { html } from './lib/html.js';
import { loadStoredSession, clearSession, applyPointsView } from './lib/session.js';
import { loadView, saveView } from './lib/view-settings.js';
import { loadWork, saveWork, clearWork, withWork, nextPointNumber, nextOutflowNumber, domainAt, todayIso, deletePhoto } from './lib/work.js';
import { PlanPage } from './pages/PlanPage.js';
import { PointsPage } from './pages/PointsPage.js';
import { RecordsPage } from './pages/RecordsPage.js';
import { PackagePage } from './pages/PackagePage.js';
import { loadExportLog, pendingCount } from './lib/export.js';
import { RecordDialog } from './components/RecordDialog.js';

export const APP_VERSION = 'v0.5.3 (переименование точки переносит её выходы)';
const TABS = [['map', 'Карта', MapIcon], ['points', 'Список точек', ListChecks], ['model', 'Модель', Box], ['records', 'Записи', ClipboardList], ['package', 'Пакет', PackageOpen]];
const DEFAULT_FLOW = { mode: 'direct', unit: 'ls', value: '', volume: '', time: '' };
const r2 = (v) => Math.round(v * 100) / 100;
const worker = () => { try { return localStorage.getItem('field-worker') || ''; } catch (e) { return ''; } };

export function App() {
  const [session, setSession] = useState(undefined); // undefined — читаем хранилище, null — пакета нет
  const [work, setWork] = useState({ records: [] });
  const [exportLog, setExportLog] = useState({ items: [] });
  const [tab, setTab] = useState('package');
  const [focusReq, setFocusReq] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false);
  const [placing, setPlacing] = useState(null); // { type: 'point' | 'outflow', parent, draft? } — ждём касания карты
  const [dlg, setDlg] = useState({ open: false, draft: null });
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [view, setViewState] = useState(loadView);
  const setView = (v) => { setViewState(v); saveView(v); };

  useEffect(() => {
    Promise.all([loadStoredSession(), loadWork(), loadExportLog()]).then(([s, w, l]) => { setWork(w); setExportLog(l); setSession(s); if (s) setTab('map'); }).catch((e) => { console.error(e); setSession(null); });
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
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(''), 2800); return () => clearTimeout(t); }, [toast]);

  const base = useMemo(() => (session ? applyPointsView(session, view.points) : null), [session, view.points]);
  const eff = useMemo(() => (base ? withWork(base, work) : null), [base, work]);
  // Переход на вкладку: сначала показываем полосу загрузки, потом строим страницу — иначе кажется, что приложение зависло
  function go(k) {
    if (k === tab) return;
    if (k === 'map' || k === 'model') { setLoading(true); requestAnimationFrame(() => setTimeout(() => setTab(k), 30)); } else { setLoading(false); setTab(k); }
  }
  function onSession(s) { setSession(s); setTab(s ? 'map' : 'package'); }
  function showOnMap(req) { setFocusReq({ ...req, n: Date.now() }); setTab('map'); }

  // ── полевые записи ──────────────────────────────────────────────────────
  async function persist(records) { const w = { records }; setWork(w); try { await saveWork(w); } catch (e) { alert('Не удалось сохранить запись на планшете: ' + e.message + '. Освободите память и повторите.'); } }
  function draftFromRecord(rec) { return { ...rec, fields: { ...rec.fields }, flow: rec.flow || DEFAULT_FLOW, photos: (rec.photos || []).slice(), zAuto: false }; }
  function start(req) {
    if (!eff) return;
    if (req.edit) { const rec = work.records.find((r) => r.id === req.edit); if (rec) setDlg({ open: true, draft: draftFromRecord(rec) }); return; }
    if (req.editBase) { // правка точки / выхода из пакета
      const { kind, item } = req.editBase;
      if (kind === 'point') {
        const z = item.x_local != null ? eff.sampler.sample(item.x_local, item.y_local) : null;
        setDlg({ open: true, draft: { edit: true, type: 'point', point_number: String(item.point_number), x: item.x_local, y: item.y_local, z: z ? r2(z.z) : '', zAuto: !!z, flow: { ...DEFAULT_FLOW, value: item.flow_rate != null ? String(item.flow_rate) : '' }, photos: [], fields: { monitoring_date: String(item.monitoring_date || '').slice(0, 10) || todayIso(), worker: item.worker || worker(), status: item.status || 'Активная', intensity: item.intensity || '', domain: item.domain || '', wall: item.wall || '', horizon: item.horizon || '', water_color: item.water_color || '', measure_method: item.measure_method || '', water_level_z: item.water_level_z != null ? item.water_level_z : '', comment: item.comment || '' } } });
      } else {
        setDlg({ open: true, draft: { edit: true, type: 'outflow', point_number: String(item.point_number), parent_number: String(item.parent_number), x: item.x_local, y: item.y_local, z: item.water_level_z != null ? item.water_level_z : '', zAuto: false, flow: DEFAULT_FLOW, photos: [], fields: { monitoring_date: String(item.monitoring_date || '').slice(0, 10) || todayIso(), status: item.status || 'Активная', comment: item.comment || '' } } });
      }
      return;
    }
    if (req.type === 'measure') { // новый замер существующей точки: поля берём из последней записи, положение не меняем
      const base = eff.points.find((p) => String(p.point_number) === String(req.parent)) || {};
      setDlg({ open: true, draft: { _new: true, type: 'measure', point_number: String(req.parent), parent_number: String(req.parent), flow: DEFAULT_FLOW, photos: [], fields: { monitoring_date: todayIso(), worker: worker(), status: base.status || 'Активная', intensity: base.intensity || '', domain: base.domain || '', wall: base.wall || '', horizon: base.horizon || '', water_color: base.water_color || '', measure_method: base.measure_method || '', water_level_z: base.water_level_z != null ? base.water_level_z : '', comment: '' } } });
      return;
    }
    setPlacing({ type: req.type, parent: req.parent });
  }
  function onPlace({ x, y, z }) {
    const p = placing; if (!p || !eff) return;
    let zz = z; if (zz == null) { const r = eff.sampler.sample(x, y); zz = r ? r2(r.z) : ''; } else zz = r2(zz);
    const zAuto = zz !== '', px = r2(x), py = r2(y);
    setPlacing(null);
    if (p.draft) { setDlg({ open: true, draft: { ...p.draft, x: px, y: py, z: zz, zAuto } }); return; }
    if (p.type === 'point') setDlg({ open: true, draft: { _new: true, type: 'point', point_number: nextPointNumber(eff, work), x: px, y: py, z: zz, zAuto, flow: DEFAULT_FLOW, photos: [], fields: { monitoring_date: todayIso(), worker: worker(), status: 'Новая', intensity: '', domain: domainAt(eff.data.domains, px, py), wall: '', horizon: '', water_color: '', measure_method: '', water_level_z: zz, comment: '' } } });
    else setDlg({ open: true, draft: { _new: true, type: 'outflow', parent_number: String(p.parent), point_number: nextOutflowNumber(eff, work, String(p.parent)), x: px, y: py, z: zz, zAuto, flow: DEFAULT_FLOW, photos: [], fields: { monitoring_date: todayIso(), status: 'Активная', comment: '' } } });
  }
  async function saveRecord(rec) {
    setBusy(true);
    const prev = work.records.find((r) => r.id === rec.id);
    let records = prev ? work.records.map((r) => (r.id === rec.id ? rec : r)) : [...work.records, rec];
    // новую точку переименовали — её выходы воды («N-В1») переезжают на новый номер, иначе они остались бы привязаны к несуществующей точке
    const from = prev ? String(prev.point_number) : '', to = String(rec.point_number);
    let moved = 0;
    if (prev && rec.type === 'point' && !rec.edit && from !== to) {
      records = records.map((r) => { if (r.type !== 'outflow' || r.edit || String(r.parent_number) !== from) return r; moved++; return { ...r, parent_number: to, point_number: to + String(r.point_number).slice(from.length), updatedAt: new Date().toISOString() }; });
    }
    await persist(records);
    setBusy(false); setDlg({ open: false, draft: null }); setToast('Запись сохранена на планшете' + (moved ? '; выходов воды перенесено на новый номер: ' + moved : ''));
  }
  async function removeRecord(id) {
    const rec = work.records.find((r) => r.id === id); if (!rec) return;
    if (!confirm('Удалить запись «' + rec.point_number + '» с планшета?')) return;
    for (const pid of rec.photos || []) await deletePhoto(pid);
    await persist(work.records.filter((r) => r.id !== id)); setToast('Запись удалена');
  }
  async function wipeAll() {
    const n = pendingCount(work, exportLog);
    if (!confirm(n ? 'На планшете ' + n + ' полевых записей, которые ещё не выгружены (или изменены после выгрузки). Удалить пакет И эти записи без возможности восстановления?' : 'Удалить пакет и данные полевой работы с этого планшета?')) return;
    await clearWork(); await clearSession(); setWork({ records: [] }); onSession(null);
  }
  function repick() { const d = dlg.draft; setPlacing({ type: d.type, parent: d.parent_number, draft: d }); setDlg({ open: false, draft: d }); }
  function closeDlg() { setDlg({ open: false, draft: null }); }

  const pending = pendingCount(work, exportLog);
  const need = !session && tab !== 'package';
  const sessionProps = eff || session;
  return html`
    <div class="field-shell">
      ${loading && html`<div class="progress progress-top"><i /></div>`}
      <header class="field-top">
        <div class="brand"><b>Полевая платформа</b><span>${session ? session.manifest.quarry + ' · схема ' + (session.manifest.scheme && session.manifest.scheme.weekKey) : 'пакет не загружен'}</span></div>
        <nav class="tabs">${TABS.map(([k, label, Icon]) => html`<button key=${k} class=${'tab' + (tab === k ? ' active' : '')} disabled=${!session && k !== 'package'} onClick=${() => go(k)}><${Icon} size=${20} /><span>${label}${k === 'records' && work.records.length ? ' (' + work.records.length + (pending ? ', новых ' + pending : '') + ')' : ''}</span></button>`)}</nav>
        ${offlineReady && html`<div class="net on" title="Код приложения сохранён на устройстве: оно откроется и без интернета">готово без сети ✓</div>`}
        <div class=${'net ' + (online ? 'on' : 'off')} title=${online ? 'Есть интернет' : 'Нет интернета — работаем офлайн'}>${online ? 'онлайн' : 'офлайн'}</div>
      </header>
      <main class="field-main">
        ${session === undefined && html`<div class="empty">Читаю данные планшета…</div>`}
        ${session !== undefined && (need || tab === 'package') && html`<${PackagePage} session=${session} onSession=${onSession} workCount=${pending} onWipe=${wipeAll} />`}
        ${session && tab === 'map' && html`<${PlanPage} key="map" session=${sessionProps} mode="map" focusRequest=${focusReq} placing=${placing} onStart=${start} onPlace=${onPlace} onCancelPlace=${() => setPlacing(null)} vs=${view} setVs=${setView} onReady=${() => setLoading(false)} />`}
        ${session && tab === 'model' && html`<${PlanPage} key="model" session=${sessionProps} mode="model" focusRequest=${focusReq} placing=${placing} onStart=${start} onPlace=${onPlace} onCancelPlace=${() => setPlacing(null)} vs=${view} setVs=${setView} onReady=${() => setLoading(false)} />`}
        ${session && tab === 'points' && html`<${PointsPage} session=${sessionProps} onShowOnMap=${showOnMap} />`}
        ${session && tab === 'records' && html`<${RecordsPage} session=${session} work=${work} log=${exportLog} onLogged=${setExportLog} appVersion=${APP_VERSION} onEdit=${(id) => start({ edit: id })} onDelete=${removeRecord} />`}
      </main>
      ${eff && html`<${RecordDialog} open=${dlg.open} draft=${dlg.draft} onChange=${(d) => setDlg({ open: true, draft: d })} onSave=${saveRecord} onClose=${closeDlg} onRepick=${repick} session=${eff} work=${work} busy=${busy} />`}
      ${toast && html`<div class="toast">${toast}</div>`}
      <footer class="field-foot">${APP_VERSION}</footer>
    </div>`;
}

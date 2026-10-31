// Настройки отображения (хранятся на планшете в localStorage): точки замера (какие и на какую дату), разломы (какие, цвет, прозрачность), рельеф 3D.
const KEY = 'field-view-v1';

export const DEFAULT_VIEW = {
  points: { scope: 'interest', asOf: '' }, // scope: 'interest' — точки интереса из пакета, 'all' — все зарегистрированные; asOf — «на дату» (пусто — последнее состояние)
  poi: { scope: 'interest', date: '__all__' }, // режим «Точки интереса»: какие точки и опорная дата ('__all__' — последние замеры всех точек)
  faults: { hidden: [], color: '', surfOpacity: 0.4, lineOpacity: 1 }, // color — один цвет для всех разломов ('' — по классу водообильности/группе); surfOpacity — непрозрачность поверхностей под рельефом
  terrain: { colorMode: 'map', opacity: 0.85, step: 5, labels: true, flat: true },
  pts: { sizeP: 1, sizeO: 1, colorMode: 'status', colorP: '#1a73e8', colorO: '#0e7490' }, // размер (множитель) и цвет точек замера и выходов воды; colorMode: 'status' — по статусу, 'custom' — свой цвет
  uav: { photo: { id: '', opacity: 1, replace: false }, thermal: { id: '', opacity: 0.75 } }, // съёмки БПЛА: какая показана, прозрачность, «вместо рельефа»
};

export function loadView() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { points: { ...DEFAULT_VIEW.points, ...(v.points || {}) }, poi: { ...DEFAULT_VIEW.poi, ...(v.poi || {}) }, faults: { ...DEFAULT_VIEW.faults, ...(v.faults || {}) }, terrain: { ...DEFAULT_VIEW.terrain, ...(v.terrain || {}) }, pts: { ...DEFAULT_VIEW.pts, ...(v.pts || {}) }, uav: { photo: { ...DEFAULT_VIEW.uav.photo, ...((v.uav || {}).photo || {}) }, thermal: { ...DEFAULT_VIEW.uav.thermal, ...((v.uav || {}).thermal || {}) } } };
  } catch (e) { return { points: { ...DEFAULT_VIEW.points }, poi: { ...DEFAULT_VIEW.poi }, faults: { ...DEFAULT_VIEW.faults }, terrain: { ...DEFAULT_VIEW.terrain }, pts: { ...DEFAULT_VIEW.pts }, uav: { photo: { ...DEFAULT_VIEW.uav.photo }, thermal: { ...DEFAULT_VIEW.uav.thermal } } }; }
}
export function saveView(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* не критично */ } }

// Настройки отображения (хранятся на планшете в localStorage): точки замера (какие и на какую дату), разломы (какие, цвет, прозрачность), рельеф 3D.
const KEY = 'field-view-v1';

export const DEFAULT_VIEW = {
  points: { scope: 'interest', asOf: '' }, // scope: 'interest' — точки интереса из пакета, 'all' — все зарегистрированные; asOf — «на дату» (пусто — последнее состояние)
  faults: { hidden: [], color: '', surfOpacity: 0.4, lineOpacity: 1 }, // color — один цвет для всех разломов ('' — по классу водообильности/группе); surfOpacity — непрозрачность поверхностей под рельефом
  terrain: { colorMode: 'map', opacity: 0.85, step: 5, labels: true, flat: true },
};

export function loadView() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { points: { ...DEFAULT_VIEW.points, ...(v.points || {}) }, faults: { ...DEFAULT_VIEW.faults, ...(v.faults || {}) }, terrain: { ...DEFAULT_VIEW.terrain, ...(v.terrain || {}) } };
  } catch (e) { return { points: { ...DEFAULT_VIEW.points }, faults: { ...DEFAULT_VIEW.faults }, terrain: { ...DEFAULT_VIEW.terrain } }; }
}
export function saveView(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* не критично */ } }

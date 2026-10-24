// Построение 3D-сцены из пакета: рельеф (по высоте), поверхности разломов, линии выхода, точки, выходы воды, скважины, пьезометры, датчики.
// THREE передаётся снаружи (подгружается по требованию и кэшируется для офлайна). Мировые координаты (X — восток, Y — север, Z — вверх) переводятся в
// систему three.js: x = X − cx, y = Z − cz (вверх), z = −(Y − cy) (север — в сторону −z); такой поворот сохраняет ориентацию треугольников.
import { STATUS_COLORS } from './map-style.js';
import { FAULT_GROUP_COLORS, WATER_CLASS_COLORS } from './faults-format.js';

export const LAYERS_3D = [
  ['terrain', 'Рельеф'], ['contours', 'Горизонты (изолинии с отметками)'], ['faultSurf', 'Разломы под рельефом'], ['faultAir', 'Разломы выше рельефа'], ['faultLines', 'Разломы (линии выхода)'], ['points', 'Точки замера'], ['outflows', 'Выходы воды'],
  ['piezo', 'Пьезометры'], ['sensors', 'Датчики'], ['observation', 'Наблюдательные скважины'], ['horizontal', 'Горизонтальные скважины'],
];
export const DEFAULT_LAYERS_3D = { terrain: true, contours: true, faultSurf: true, faultAir: false, faultLines: true, points: true, outflows: true, piezo: true, sensors: true, observation: true, horizontal: true };

function circleTexture(THREE, color) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fillStyle = color; g.fill(); g.lineWidth = 5; g.strokeStyle = '#fff'; g.stroke();
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}
function diamondTexture(THREE, color) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.beginPath(); g.moveTo(32, 4); g.lineTo(60, 32); g.lineTo(32, 60); g.lineTo(4, 32); g.closePath(); g.fillStyle = color; g.fill(); g.lineWidth = 5; g.strokeStyle = '#fff'; g.stroke();
  return new THREE.CanvasTexture(c);
}

// Возвращает { group, markers, center, radius, layerGroups, terrainMesh, zAt(X, Y) }
export function buildScene(THREE, session) {
  const T = session.terrain, S = session.sampler, D = session.data;
  const bb = T.robustBBox || T.bbox;
  const cx = (bb.xMin + bb.xMax) / 2, cy = (bb.yMin + bb.yMax) / 2, cz = (bb.zMin + bb.zMax) / 2;
  const radius = Math.max(bb.xMax - bb.xMin, bb.yMax - bb.yMin) / 2;
  const v3 = (X, Y, Z) => new THREE.Vector3(X - cx, Z - cz, -(Y - cy));
  const zAt = (X, Y) => { const z = S.zAt(X, Y); return z === z ? z : cz; };
  const group = new THREE.Group(), layerGroups = {}, markers = [];
  const lg = (k) => { const g = new THREE.Group(); g.name = k; layerGroups[k] = g; group.add(g); return g; };

  // рельеф: вершинные цвета по высоте (карьер — тёмно-коричневый → светлый), отвалы — серые; треугольники ориентируем вверх
  const nv = T.xs.length, pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  let zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < nv; i++) { if (T.zs[i] < zmin) zmin = T.zs[i]; if (T.zs[i] > zmax) zmax = T.zs[i]; }
  const kindOfVertex = new Uint8Array(nv).fill(255);
  if (T.triKind) for (let t = 0; t < T.triKind.length; t++) for (let k = 0; k < 3; k++) { const vi = T.triangles[t * 3 + k]; if (kindOfVertex[vi] === 255 || T.triKind[t] === 2) kindOfVertex[vi] = T.triKind[t]; }
  const c1 = new THREE.Color();
  for (let i = 0; i < nv; i++) {
    pos[i * 3] = T.xs[i] - cx; pos[i * 3 + 1] = T.zs[i] - cz; pos[i * 3 + 2] = -(T.ys[i] - cy);
    const u = (T.zs[i] - zmin) / (zmax - zmin || 1);
    if (kindOfVertex[i] === 2) c1.setHSL(0.09, 0.05, 0.42 + 0.3 * u); else c1.setHSL(0.09 - 0.03 * (1 - u), 0.28 + 0.12 * (1 - u), 0.22 + 0.62 * u);
    col[i * 3] = c1.r; col[i * 3 + 1] = c1.g; col[i * 3 + 2] = c1.b;
  }
  const idx = new Uint32Array(T.triangles.length);
  for (let t = 0; t < T.triangles.length; t += 3) {
    let a = T.triangles[t], b = T.triangles[t + 1], c = T.triangles[t + 2];
    const cross = (T.xs[b] - T.xs[a]) * (T.ys[c] - T.ys[a]) - (T.ys[b] - T.ys[a]) * (T.xs[c] - T.xs[a]); // >0 — против часовой сверху (нормаль вверх)
    if (cross < 0) { const tmp = b; b = c; c = tmp; }
    idx[t] = a; idx[t + 1] = b; idx[t + 2] = c;
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(col, 3)); tg.setIndex(new THREE.BufferAttribute(idx, 1)); tg.computeVertexNormals();
  const terrainMesh = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true }));
  lg('terrain').add(terrainMesh); lg('contours');

  // разломы: поверхности (полупрозрачные) и линии выхода на рельеф (приподняты над рельефом)
  const fSurf = lg('faultSurf'), fAir = lg('faultAir'), fLines = lg('faultLines'), faultMeshes = [];
  if (session.faults) {
    const o = session.faults.origin;
    session.faults.surfaces.forEach((s) => {
      const fp = (D.faultProps || {})[s.key] || {}, color = new THREE.Color(fp.water_class ? WATER_CLASS_COLORS[fp.water_class] : (FAULT_GROUP_COLORS[s.group] || '#888888'));
      // треугольники делим по рельефу: центр ниже поверхности (в пределах рельефа) — «под рельефом», остальное — «выше рельефа»
      const under = [], over = [];
      for (let i = 0; i < s.tris.length; i += 9) {
        const mx = (s.tris[i] + s.tris[i + 3] + s.tris[i + 6]) / 3 + o.x, my = (s.tris[i + 1] + s.tris[i + 4] + s.tris[i + 7]) / 3 + o.y, mz = (s.tris[i + 2] + s.tris[i + 5] + s.tris[i + 8]) / 3 + o.z;
        const r = S.sample(mx, my); (r && mz <= r.z + 0.5 ? under : over).push(i);
      }
      [[under, fSurf, 0.4, 'faultSurf'], [over, fAir, 0.16, 'faultAir']].forEach(([list, grp, opacity, layer]) => {
        if (!list.length) return;
        const p = new Float32Array(list.length * 9);
        list.forEach((i, n) => { for (let k = 0; k < 9; k += 3) { p[n * 9 + k] = s.tris[i + k] + o.x - cx; p[n * 9 + k + 1] = s.tris[i + k + 2] + o.z - cz; p[n * 9 + k + 2] = -(s.tris[i + k + 1] + o.y - cy); } });
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.computeVertexNormals();
        const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
        m.userData = { kind: 'fault', key: s.key, layer, baseOpacity: opacity, baseColor: color.clone() }; grp.add(m); faultMeshes.push(m);
      });
      const seg = session.traces[s.key] || [];
      if (seg.length) {
        const lp = new Float32Array((seg.length / 4) * 6);
        for (let i = 0, j = 0; i < seg.length; i += 4, j += 6) { lp[j] = seg[i] - cx; lp[j + 1] = zAt(seg[i], seg[i + 1]) + 1 - cz; lp[j + 2] = -(seg[i + 1] - cy); lp[j + 3] = seg[i + 2] - cx; lp[j + 4] = zAt(seg[i + 2], seg[i + 3]) + 1 - cz; lp[j + 5] = -(seg[i + 3] - cy); }
        const lgm = new THREE.BufferGeometry(); lgm.setAttribute('position', new THREE.BufferAttribute(lp, 3));
        const ls = new THREE.LineSegments(lgm, new THREE.LineBasicMaterial({ color, transparent: true })); ls.userData = { key: s.key, baseColor: color.clone() }; fLines.add(ls);
      }
    });
  }

  // точки на рельефе (постоянный размер на экране)
  const pointsLayer = (key, items, tex, size, mk) => {
    const g = lg(key); if (!items.length) return;
    const arr = new Float32Array(items.length * 3), colors = new Float32Array(items.length * 3), c = new THREE.Color();
    items.forEach((it, i) => { const v = it.v; arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z; c.set(it.color || '#fff'); colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; markers.push({ v, layer: key, ...mk(it) }); });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(arr, 3)); geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.add(new THREE.Points(geo, new THREE.PointsMaterial({ size, sizeAttenuation: false, map: tex, vertexColors: true, transparent: true, alphaTest: 0.4, depthTest: true })));
  };
  const white = circleTexture(THREE, '#ffffff'), dia = diamondTexture(THREE, '#ffffff');
  // точки замера и выходы воды (в том числе созданные в поле — фиолетовые): пересоздаются при изменении записей без перестройки рельефа
  const buildPoints = (sess) => {
    pointsLayer('points', sess.points.filter((p) => p.x_local != null).map((p) => ({ v: v3(p.x_local, p.y_local, zAt(p.x_local, p.y_local) + 2), color: p._field ? '#7c3aed' : (STATUS_COLORS[p.status] || '#666666'), p })), white, 16, (it) => ({ kind: 'point', item: it.p }));
    pointsLayer('outflows', sess.outflows.filter((o) => o.x_local != null).map((o) => ({ v: v3(o.x_local, o.y_local, (o.water_level_z != null ? Number(o.water_level_z) : zAt(o.x_local, o.y_local)) + 1.5), color: o._field ? '#7c3aed' : (o.status === 'Пересохла' ? '#8a8f98' : '#0e7490'), o })), dia, 15, (it) => ({ kind: 'outflow', item: it.o }));
  };
  const refreshPoints = (sess) => {
    ['points', 'outflows'].forEach((k) => { const g = layerGroups[k]; if (g) { g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); group.remove(g); delete layerGroups[k]; } });
    for (let i = markers.length - 1; i >= 0; i--) if (markers[i].layer === 'points' || markers[i].layer === 'outflows') markers.splice(i, 1);
    buildPoints(sess);
  };
  buildPoints(session);
  const wellLines = (key, wells, color) => {
    const g = lg(key); const pts = [];
    wells.forEach((w) => { if (w.end && w.collar.z != null) { pts.push(v3(w.collar.x, w.collar.y, w.collar.z), v3(w.end.x, w.end.y, w.end.z)); } });
    if (pts.length) { const geo = new THREE.BufferGeometry().setFromPoints(pts); g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color }))); }
  };
  const collarMarkers = (key, wells, color, kind, size) => pointsLayer(key + 'C', wells.filter((w) => w.collar && w.collar.z != null).map((w) => ({ v: v3(w.collar.x, w.collar.y, w.collar.z + 2), color, w })), white, size, (it) => ({ kind, item: it.w }));
  const hz = D.horizontal || [], pz = D.piezo || [], ob = D.observation || [];
  wellLines('horizontal', hz, '#475569'); collarMarkers('horizontal', hz, '#475569', 'horizontal', 11);
  wellLines('piezo', pz, '#0ea5e9'); collarMarkers('piezo', pz, '#0ea5e9', 'piezo', 12);
  wellLines('observation', ob, '#0d9488'); collarMarkers('observation', ob, '#0d9488', 'observation', 11);
  pointsLayer('sensors', pz.flatMap((w) => w.sensors.map((s) => ({ v: v3(s.x, s.y, s.z), color: '#1e3a8a', s: { ...s, well: w.name } }))), white, 9, (it) => ({ kind: 'sensor', item: it.s }));
  // слои, у которых несколько объектов-групп, включаются вместе (маркеры устьев — с линиями)
  const alias = { horizontal: ['horizontal', 'horizontalC'], piezo: ['piezo', 'piezoC'], observation: ['observation', 'observationC'] };
  return { group, markers, refreshPoints, T,  center: { x: 0, y: 0, z: 0 }, radius, layerGroups, alias, terrainMesh, faultMeshes, cx, cy, cz, zmin: zmin - cz, zmax: zmax - cz, v3, zAt };
}

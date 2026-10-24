// Стиль рельефа в 3D: цвет (картинка схемы, слои DXF, глубина), гранёная поверхность и изолинии (линии горизонтов) с подписями отметок.
// Всё меняется на готовой сцене без перестройки рельефа. THREE передаётся снаружи.

export const COLOR_MODES = [
  ['map', 'Карта схемы (как на вкладке «Карта»)'],
  ['layers', 'По слоям DXF: карьер, отвал, природный рельеф'],
  ['depth', 'По глубине (гипсометрия)'],
];
const RAMP = [[0, '#1e3a8a'], [0.22, '#0ea5e9'], [0.45, '#65a30d'], [0.7, '#facc15'], [1, '#b45309']];

function rampColor(THREE, u, out) {
  u = Math.max(0, Math.min(1, u));
  for (let i = 1; i < RAMP.length; i++) {
    if (u <= RAMP[i][0]) { const a = RAMP[i - 1], b = RAMP[i], f = (u - a[0]) / (b[0] - a[0] || 1); return out.set(a[1]).lerp(new THREE.Color(b[1]), f); }
  }
  return out.set(RAMP[RAMP.length - 1][1]);
}

function vertexKinds(T) {
  const nv = T.xs.length, kind = new Uint8Array(nv).fill(255);
  if (T.triKind) for (let t = 0; t < T.triKind.length; t++) for (let k = 0; k < 3; k++) { const vi = T.triangles[t * 3 + k]; if (kind[vi] === 255 || T.triKind[t] === 2) kind[vi] = T.triKind[t]; }
  return kind;
}

// Цвета вершин для режимов 'layers' и 'depth' (кэшируются в B._cols)
function colorsFor(THREE, B, T, mode) {
  B._cols = B._cols || {};
  if (B._cols[mode]) return B._cols[mode];
  const nv = T.xs.length, col = new Float32Array(nv * 3), c = new THREE.Color();
  const rb = T.robustBBox || T.bbox;
  let zmin = rb ? rb.zMin : Infinity, zmax = rb ? rb.zMax : -Infinity;
  if (!rb) for (let i = 0; i < nv; i++) { if (T.zs[i] < zmin) zmin = T.zs[i]; if (T.zs[i] > zmax) zmax = T.zs[i]; }
  const kinds = mode === 'layers' ? vertexKinds(T) : null;
  for (let i = 0; i < nv; i++) {
    const u = Math.max(0, Math.min(1, (T.zs[i] - zmin) / (zmax - zmin || 1)));
    if (mode === 'depth') rampColor(THREE, u, c);
    else if (kinds[i] === 1) c.setHSL(0.58, 0.55, 0.24 + 0.4 * u);      // карьер — синий (слой GM_PIT)
    else if (kinds[i] === 2) c.setHSL(0.33, 0.45, 0.28 + 0.34 * u);     // отвалы — зелёный (GM_DUMP)
    else c.setHSL(0.1, 0.1, 0.42 + 0.34 * u);                            // природный рельеф — серо-бежевый (GM_TERRAIN)
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  return (B._cols[mode] = col);
}

function labelTexture(THREE, text) {
  const c = document.createElement('canvas'); c.width = 80; c.height = 36;
  const g = c.getContext('2d'); g.font = '700 24px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.8)'; g.strokeText(text, 40, 19); g.fillStyle = '#3b2a12'; g.fillText(text, 40, 19);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 2; return t;
}

// Отрезки изолиний по всем треугольникам: { уровень: [x1, y1, x2, y2, …] }
function contourSegments(T, step) {
  const out = new Map(), tri = T.triangles, xs = T.xs, ys = T.ys, zs = T.zs;
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t], b = tri[t + 1], c = tri[t + 2], za = zs[a], zb = zs[b], zc = zs[c];
    const lo = Math.min(za, zb, zc), hi = Math.max(za, zb, zc);
    if (hi - lo < 1e-6) continue;
    for (let k = Math.ceil(lo / step); k * step <= hi; k++) {
      const L = k * step, pts = [];
      const edge = (i, j, zi, zj) => { if ((zi < L) !== (zj < L)) { const f = (L - zi) / (zj - zi); pts.push(xs[i] + (xs[j] - xs[i]) * f, ys[i] + (ys[j] - ys[i]) * f); } };
      edge(a, b, za, zb); edge(b, c, zb, zc); edge(c, a, zc, za);
      if (pts.length === 4) { let arr = out.get(L); if (!arr) out.set(L, (arr = [])); arr.push(pts[0], pts[1], pts[2], pts[3]); }
    }
  }
  return out;
}

// Цепочки из отрезков одного уровня — чтобы расставить подписи вдоль линии
function chains(seg) {
  const key = (x, y) => Math.round(x * 20) + ':' + Math.round(y * 20), ends = new Map(), n = seg.length / 4, used = new Uint8Array(n);
  for (let i = 0; i < n; i++) for (const e of [0, 1]) { const k = key(seg[i * 4 + e * 2], seg[i * 4 + e * 2 + 1]); (ends.get(k) || ends.set(k, []).get(k)).push(i); }
  const res = [];
  for (let s = 0; s < n; s++) {
    if (used[s]) continue; used[s] = 1;
    const pts = [[seg[s * 4], seg[s * 4 + 1]], [seg[s * 4 + 2], seg[s * 4 + 3]]];
    for (const dir of [1, 0]) { // растим цепочку в обе стороны
      for (;;) {
        const tip = dir ? pts[pts.length - 1] : pts[0], list = ends.get(key(tip[0], tip[1])) || [];
        const nx = list.find((i) => !used[i]); if (nx === undefined) break;
        used[nx] = 1;
        const p0 = [seg[nx * 4], seg[nx * 4 + 1]], p1 = [seg[nx * 4 + 2], seg[nx * 4 + 3]], same = key(p0[0], p0[1]) === key(tip[0], tip[1]);
        const add = same ? p1 : p0;
        if (dir) pts.push(add); else pts.unshift(add);
      }
    }
    res.push(pts);
  }
  return res;
}

function buildContours(THREE, B, session, cfg) {
  const g = B.layerGroups.contours; if (!g) return;
  while (g.children.length) { const o = g.children.pop(); o.geometry && o.geometry.dispose(); if (o.material) { o.material.map && o.material.map.dispose(); o.material.dispose(); } }
  const step = Number(cfg.step) || 5, T = session.terrain, segs = contourSegments(T, step), rb = T.robustBBox || T.bbox;
  if (rb) for (const L of Array.from(segs.keys())) if (L < rb.zMin - step || L > rb.zMax + step) segs.delete(L);
  const major = step * 5, labelEvery = step < 10 ? step * 2 : step;
  const mk = (list, color, opacity) => {
    if (!list.length) return;
    const p = new Float32Array((list.length / 4) * 6);
    for (let i = 0, j = 0; i < list.length; i += 4, j += 6) { const L = list.lv[i / 4]; p[j] = list[i] - B.cx; p[j + 1] = L + 0.4 - B.cz; p[j + 2] = -(list[i + 1] - B.cy); p[j + 3] = list[i + 2] - B.cx; p[j + 4] = L + 0.4 - B.cz; p[j + 5] = -(list[i + 3] - B.cy); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity })));
  };
  const minor = [], maj = []; minor.lv = []; maj.lv = [];
  segs.forEach((arr, L) => { const tgt = Math.abs(L % major) < 1e-6 ? maj : minor; for (let i = 0; i < arr.length; i += 4) { tgt.push(arr[i], arr[i + 1], arr[i + 2], arr[i + 3]); tgt.lv.push(L); } });
  mk(minor, '#7c5a2b', 0.55); mk(maj, '#2f2008', 0.95);
  if (cfg.labels === false) return;
  // подписи отметок: вдоль длинных цепочек через равные промежутки; размер на экране постоянный
  const spacing = Math.max(260, B.radius * 0.55), cache = new Map(), MAXL = 160;
  let count = 0;
  for (const [L, arr] of segs) {
    if (Math.abs(L % labelEvery) > 1e-6 || count > MAXL) continue;
    for (const ch of chains(arr)) {
      let len = 0; const cum = [0];
      for (let i = 1; i < ch.length; i++) { len += Math.hypot(ch[i][0] - ch[i - 1][0], ch[i][1] - ch[i - 1][1]); cum.push(len); }
      if (len < spacing * 0.5) continue;
      for (let d = Math.min(spacing / 2, len / 2); d < len && count <= MAXL; d += spacing) {
        let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
        const f = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), x = ch[i - 1][0] + (ch[i][0] - ch[i - 1][0]) * f, y = ch[i - 1][1] + (ch[i][1] - ch[i - 1][1]) * f;
        let tex = cache.get(L); if (!tex) { tex = labelTexture(THREE, String(Math.round(L))); cache.set(L, tex); }
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, transparent: true, depthTest: true }));
        sp.scale.set(0.034, 0.0153, 1); sp.position.set(x - B.cx, L + 1.2 - B.cz, -(y - B.cy)); g.add(sp); count++;
      }
    }
  }
}

// cfg: { colorMode, flat, contours (рисовать ли), step, labels }; tex — текстура картинки схемы (или null)
export function styleTerrain(THREE, B, session, cfg, tex, wantContours) {
  const mesh = B.terrainMesh, geo = mesh.geometry, mat = mesh.material, T = session.terrain;
  const bnd = session.manifest.scheme && session.manifest.scheme.bounds;
  let mode = cfg.colorMode || 'map'; if (mode === 'map' && !(tex && bnd)) mode = 'layers';
  if (mode === 'map') {
    if (!geo.getAttribute('uv')) {
      const nv = T.xs.length, uv = new Float32Array(nv * 2), w = bnd.xMax - bnd.xMin, h = bnd.yMax - bnd.yMin;
      for (let i = 0; i < nv; i++) { uv[i * 2] = (T.xs[i] - bnd.xMin) / w; uv[i * 2 + 1] = (T.ys[i] - bnd.yMin) / h; }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    mat.map = tex; mat.vertexColors = false; mat.color.set(0xffffff);
  } else {
    const col = colorsFor(THREE, B, T, mode);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    mat.map = null; mat.vertexColors = true; mat.color.set(0xffffff);
  }
  mat.flatShading = cfg.flat !== false;
  mat.needsUpdate = true;
  B.terrainMode = mode;
  const sig = (cfg.step || 5) + '|' + (cfg.labels !== false);
  if (wantContours && B._contourSig !== sig) { buildContours(THREE, B, session, cfg); B._contourSig = sig; }
}

// Фотомодель карьера по съёмке с БПЛА (OBJ + текстура из Agisoft Metashape): разбор, упрощение, упаковка в компактный формат.
// Модуль без обращений к DOM — работает и в браузере (в фоновом потоке, см. uav-worker.js), и в Node (проверка на реальных файлах).
//
// Формат одного уровня детализации (до сжатия gzip):
//   u32 'GMU1' | u32 длина заголовка | заголовок JSON {nv, nt, bbox:{min,max}} (с выравниванием до 4 байт)
//   | позиции Uint16 ×3 (внутри bbox) | текстурные координаты Uint16 ×2 | u32 длина | индексы: varint-коды «следующая новая вершина − индекс»
// Вершины переупорядочены по первому появлению в треугольниках — коды малы, поэтому индексы сжимаются в несколько раз.

export const UAV_MAGIC = 0x31554d47; // 'GMU1'
export const UAV_PART_BYTES = 4 * 1024 * 1024; // размер части файла при загрузке на сервер (лимит запроса IIS ~30 МБ, плюс видимый прогресс)

class Grow {
  constructor(Type, n = 1 << 20) { this.a = new Type(n); this.n = 0; }
  push(v) { if (this.n === this.a.length) { const b = new this.a.constructor(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = v; }
  done() { return this.a.subarray(0, this.n); }
}

// ── 1. Разбор OBJ потоком (stream — ReadableStream<Uint8Array>, например file.stream()) ────────────────────────────────
// Возвращает { vx: Float64Array (x,y,z подряд), vt: Float32Array (u,v подряд), tri: Uint32Array (на угол: индекс вершины, индекс UV; −1 — нет) }
export async function parseObj(stream, { size = 0, onProgress } = {}) {
  const vx = new Grow(Float64Array, 1 << 21), vt = new Grow(Float32Array, 1 << 21), tri = new Grow(Int32Array, 1 << 22);
  let nv = 0, nvt = 0;
  const handle = (line) => {
    const c0 = line.charCodeAt(0);
    if (c0 === 118) { // v
      const c1 = line.charCodeAt(1);
      if (c1 === 32) { const p = line.split(' '); vx.push(+p[1]); vx.push(+p[2]); vx.push(+p[3]); nv++; }
      else if (c1 === 116) { const p = line.split(' '); vt.push(+p[1]); vt.push(+p[2]); nvt++; }
    } else if (c0 === 102 && line.charCodeAt(1) === 32) { // f
      const p = line.trim().split(/\s+/);
      const n = p.length - 1;
      if (n < 3) return;
      const cv = [], ct = [];
      for (let k = 1; k <= n; k++) {
        const q = p[k].split('/');
        let vi = +q[0], ti = q.length > 1 && q[1] !== '' ? +q[1] : 0;
        if (vi < 0) vi = nv + vi + 1;
        if (ti < 0) ti = nvt + ti + 1;
        cv.push(vi - 1); ct.push(ti - 1);
      }
      for (let k = 1; k + 1 < n; k++) { tri.push(cv[0]); tri.push(ct[0]); tri.push(cv[k]); tri.push(ct[k]); tri.push(cv[k + 1]); tri.push(ct[k + 1]); }
    }
  };
  const dec = new TextDecoder();
  const reader = stream.getReader();
  let carry = '', read = 0, lastReport = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    read += value.length;
    const text = carry + dec.decode(value, { stream: true });
    let start = 0, nl;
    while ((nl = text.indexOf('\n', start)) >= 0) { handle(text.slice(start, nl)); start = nl + 1; }
    carry = text.slice(start);
    if (onProgress && read - lastReport > 1.5e6) { lastReport = read; onProgress(size ? Math.min(1, read / size) : 0, { vertices: nv, triangles: tri.n / 6 }); }
  }
  if (carry) handle(carry);
  if (onProgress) onProgress(1, { vertices: nv, triangles: tri.n / 6 });
  if (!nv || !tri.n) throw new Error('В файле нет вершин или граней — это не OBJ-модель');
  return { vx: vx.done(), vt: vt.done(), tri: tri.done() };
}

// ── 2. Сборка сетки: вершины (позиция + UV) объединяются, порядок — по первому появлению в треугольниках ───────────────
export function buildMesh(parsed) {
  const { vx, vt, tri } = parsed;
  const nt = tri.length / 6, mult = vt.length / 2 + 1;
  const map = new Map();
  const idx = new Uint32Array(nt * 3);
  const X = new Grow(Float64Array, 1 << 20), Y = new Grow(Float64Array, 1 << 20), Z = new Grow(Float64Array, 1 << 20), U = new Grow(Float32Array, 1 << 20), V = new Grow(Float32Array, 1 << 20);
  let nv = 0;
  const nVx = vx.length / 3;
  for (let k = 0; k < nt * 3; k++) {
    const vi = tri[2 * k], ti = tri[2 * k + 1];
    if (vi < 0 || vi >= nVx) throw new Error('Грань ссылается на несуществующую вершину');
    const key = vi * mult + (ti + 1);
    let id = map.get(key);
    if (id === undefined) {
      id = nv++; map.set(key, id);
      X.push(vx[3 * vi]); Y.push(vx[3 * vi + 1]); Z.push(vx[3 * vi + 2]);
      if (ti >= 0 && 2 * ti + 1 < vt.length) { U.push(vt[2 * ti]); V.push(vt[2 * ti + 1]); } else { U.push(0); V.push(0); }
    }
    idx[k] = id;
  }
  return finishMesh({ nv, nt, x: X.done(), y: Y.done(), z: Z.done(), u: U.done(), v: V.done(), idx });
}

function finishMesh(m) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.nv; i++) {
    const a = [m.x[i], m.y[i], m.z[i]];
    for (let k = 0; k < 3; k++) { if (a[k] < mn[k]) mn[k] = a[k]; if (a[k] > mx[k]) mx[k] = a[k]; }
  }
  m.bbox = { min: mn, max: mx };
  return m;
}

// ── 3. Упрощение: кластеризация вершин по трёхмерной сетке (ячейка cell, м) ──────────────────────────────────────────
// Положение вершины — центр её ячейки (одинаковое для вершин по обе стороны шва текстуры — трещин нет); текстурные координаты — среднее
// по вершинам ячейки в одном квадрате атласа (32×32), чтобы не смешивать далёкие участки фото.
export function decimate(m, cell) {
  const mn = m.bbox.min, nv = m.nv;
  const cellOf = new Int32Array(nv), cmap = new Map();
  let nc = 0;
  const sx = new Float64Array(1 << 16), sy = new Float64Array(1 << 16), sz = new Float64Array(1 << 16), cnt = new Uint32Array(1 << 16);
  let SX = sx, SY = sy, SZ = sz, CN = cnt;
  const grow = () => { const n = SX.length * 2; const f = (a, T) => { const b = new T(n); b.set(a); return b; }; SX = f(SX, Float64Array); SY = f(SY, Float64Array); SZ = f(SZ, Float64Array); CN = f(CN, Uint32Array); };
  const KY = 1 << 16, KZ = 1 << 16; // ячеек по Y и Z не больше 65536: ключ (ix·KY+iy)·KZ+iz остаётся целым числом без потери точности
  for (let i = 0; i < nv; i++) {
    const ix = Math.floor((m.x[i] - mn[0]) / cell), iy = Math.floor((m.y[i] - mn[1]) / cell), iz = Math.floor((m.z[i] - mn[2]) / cell);
    const key = (ix * KY + iy) * KZ + iz;
    let c = cmap.get(key);
    if (c === undefined) { c = nc++; cmap.set(key, c); if (nc > SX.length) grow(); }
    cellOf[i] = c; SX[c] += m.x[i]; SY[c] += m.y[i]; SZ[c] += m.z[i]; CN[c]++;
  }
  // узлы = (ячейка, квадрат атласа)
  const nodeOf = new Uint32Array(nv), nmap = new Map();
  const nodeCell = new Grow(Uint32Array, 1 << 18), nu = new Grow(Float64Array, 1 << 18), nvv = new Grow(Float64Array, 1 << 18), ncnt = new Grow(Uint32Array, 1 << 18);
  let nn = 0;
  for (let i = 0; i < nv; i++) {
    const tile = Math.min(31, Math.floor(m.u[i] * 32)) + 32 * Math.min(31, Math.floor(m.v[i] * 32));
    const key = cellOf[i] * 1024 + tile;
    let n = nmap.get(key);
    if (n === undefined) { n = nn++; nmap.set(key, n); nodeCell.push(cellOf[i]); nu.push(0); nvv.push(0); ncnt.push(0); }
    nodeOf[i] = n; nu.a[n] += m.u[i]; nvv.a[n] += m.v[i]; ncnt.a[n]++;
  }
  // треугольники: выбрасываем выродившиеся (две вершины в одной ячейке); вершины нумеруем по первому появлению
  const remap = new Int32Array(nn).fill(-1);
  const X = new Grow(Float64Array, 1 << 18), Y = new Grow(Float64Array, 1 << 18), Z = new Grow(Float64Array, 1 << 18), U = new Grow(Float32Array, 1 << 18), V = new Grow(Float32Array, 1 << 18);
  const idx = new Grow(Uint32Array, 1 << 20);
  let ov = 0;
  const emit = (node) => {
    let r = remap[node];
    if (r < 0) {
      r = ov++; remap[node] = r;
      const c = nodeCell.a[node];
      X.push(SX[c] / CN[c]); Y.push(SY[c] / CN[c]); Z.push(SZ[c] / CN[c]);
      U.push(nu.a[node] / ncnt.a[node]); V.push(nvv.a[node] / ncnt.a[node]);
    }
    idx.push(r);
  };
  for (let t = 0; t < m.nt; t++) {
    const i0 = m.idx[3 * t], i1 = m.idx[3 * t + 1], i2 = m.idx[3 * t + 2];
    if (cellOf[i0] === cellOf[i1] || cellOf[i1] === cellOf[i2] || cellOf[i2] === cellOf[i0]) continue;
    emit(nodeOf[i0]); emit(nodeOf[i1]); emit(nodeOf[i2]);
  }
  const out = { nv: ov, nt: idx.n / 3, x: X.done(), y: Y.done(), z: Z.done(), u: U.done(), v: V.done(), idx: idx.done() };
  return finishMesh(out);
}

// Средняя длина ребра (по выборке треугольников) — от неё считаем размер ячейки упрощения
export function meanEdge(m, sample = 60000) {
  const step = Math.max(1, Math.floor(m.nt / sample));
  let s = 0, n = 0;
  for (let t = 0; t < m.nt; t += step) {
    const a = m.idx[3 * t], b = m.idx[3 * t + 1], c = m.idx[3 * t + 2];
    const d = (p, q) => Math.hypot(m.x[p] - m.x[q], m.y[p] - m.y[q], m.z[p] - m.z[q]);
    s += d(a, b) + d(b, c) + d(c, a); n += 3;
  }
  return n ? s / n : 1;
}

// ── 4. Упаковка / распаковка одного уровня ───────────────────────────────────────────────────────────────────────────
export function packLod(m) {
  const { min, max } = m.bbox;
  const head = new TextEncoder().encode(JSON.stringify({ nv: m.nv, nt: m.nt, bbox: m.bbox }));
  const headPad = (4 - (head.length % 4)) % 4;
  const pos = new Uint16Array(m.nv * 3), uv = new Uint16Array(m.nv * 2);
  const rng = [0, 1, 2].map((k) => (max[k] - min[k]) || 1);
  for (let i = 0; i < m.nv; i++) {
    pos[3 * i] = Math.round((m.x[i] - min[0]) / rng[0] * 65535);
    pos[3 * i + 1] = Math.round((m.y[i] - min[1]) / rng[1] * 65535);
    pos[3 * i + 2] = Math.round((m.z[i] - min[2]) / rng[2] * 65535);
    uv[2 * i] = Math.max(0, Math.min(65535, Math.round(m.u[i] * 65535)));
    uv[2 * i + 1] = Math.max(0, Math.min(65535, Math.round(m.v[i] * 65535)));
  }
  // индексы: код = (следующая новая вершина) − индекс; 0 — новая вершина
  const bytes = new Grow(Uint8Array, Math.max(1024, m.idx.length));
  let next = 0;
  for (let k = 0; k < m.idx.length; k++) {
    let code;
    const id = m.idx[k];
    if (id === next) { code = 0; next++; } else if (id < next) code = next - id; else throw new Error('Нарушен порядок вершин (индекс больше следующей новой вершины)');
    while (code >= 128) { bytes.push((code & 127) | 128); code >>>= 7; }
    bytes.push(code);
  }
  const idxBytes = bytes.done();
  const posBytes = pos.byteLength, uvBytes = uv.byteLength;
  const total = 8 + head.length + headPad + posBytes + ((4 - (posBytes % 4)) % 4) + uvBytes + ((4 - (uvBytes % 4)) % 4) + 4 + idxBytes.length;
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  let o = 0;
  dv.setUint32(o, UAV_MAGIC, true); o += 4; dv.setUint32(o, head.length, true); o += 4;
  out.set(head, o); o += head.length + headPad;
  out.set(new Uint8Array(pos.buffer), o); o += posBytes + ((4 - (posBytes % 4)) % 4);
  out.set(new Uint8Array(uv.buffer), o); o += uvBytes + ((4 - (uvBytes % 4)) % 4);
  dv.setUint32(o, idxBytes.length, true); o += 4;
  out.set(idxBytes, o);
  return out;
}

// Распаковка уровня: { nv, nt, bbox, pos: Uint16Array (3 на вершину), uv: Uint16Array (2 на вершину), idx: Uint32Array }
export function unpackLod(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== UAV_MAGIC) throw new Error('Файл фотомодели повреждён (неверная сигнатура)');
  const hl = dv.getUint32(4, true);
  const head = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + hl)));
  let o = 8 + hl + ((4 - (hl % 4)) % 4);
  const copy = (n, T, bytesPer) => { const a = new T(n); new Uint8Array(a.buffer).set(u8.subarray(o, o + n * bytesPer)); o += n * bytesPer; o += (4 - ((n * bytesPer) % 4)) % 4; return a; };
  const pos = copy(head.nv * 3, Uint16Array, 2);
  const uv = copy(head.nv * 2, Uint16Array, 2);
  const il = dv.getUint32(o, true); o += 4;
  const idx = new Uint32Array(head.nt * 3);
  let next = 0, k = 0, p = o;
  const end = o + il;
  while (p < end && k < idx.length) {
    let code = 0, shift = 0, b;
    do { b = u8[p++]; code |= (b & 127) << shift; shift += 7; } while (b & 128);
    if (code === 0) idx[k++] = next++; else idx[k++] = next - code;
  }
  if (k !== idx.length) throw new Error('Файл фотомодели повреждён (индексы)');
  return { nv: head.nv, nt: head.nt, bbox: head.bbox, pos, uv, idx };
}

// ── 5. Сжатие и нарезка на части ─────────────────────────────────────────────────────────────────────────────────────
export async function gzip(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()); }
export async function gunzip(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()); }
export function splitParts(u8, size = UAV_PART_BYTES) { const out = []; for (let o = 0; o < u8.length; o += size) out.push(u8.subarray(o, Math.min(u8.length, o + size))); return out.length ? out : [new Uint8Array(0)]; }

// ── 6. Весь конвейер: OBJ → три уровня детализации (готовые к загрузке части) ───────────────────────────────────────────
// onStage(текст, доля 0..1 общего прогресса, подробности)
// Лёгкие модели (до 150 тыс. треугольников — например, тепловизор) хранятся в одном уровне детализации: упрощать там нечего.
export const SMALL_MESH_TRIANGLES = 150000;
export async function convertObj(stream, { size = 0, onStage = () => {}, levels: levelsOpt } = {}) {
  onStage('Чтение OBJ', 0);
  const parsed = await parseObj(stream, { size, onProgress: (f, info) => onStage('Чтение OBJ', f * 0.5, info) });
  onStage('Сборка вершин', 0.5);
  const mesh = buildMesh(parsed);
  const stats = { sourceVertices: parsed.vx.length / 3, sourceTriangles: parsed.tri.length / 6 };
  const edge = meanEdge(mesh);
  const levels = levelsOpt || (mesh.nt <= SMALL_MESH_TRIANGLES ? [{ k: 0 }] : [{ k: 0 }, { k: 1.7 }, { k: 3.8 }]);
  const out = [];
  for (let li = 0; li < levels.length; li++) {
    const lv = levels[li];
    onStage(li === 0 ? 'Упаковка: полная детализация' : 'Упрощение: уровень ' + li, 0.55 + 0.3 * (li / levels.length));
    const m = lv.k ? decimate(mesh, edge * lv.k) : mesh;
    const raw = packLod(m);
    onStage('Сжатие: уровень ' + li, 0.55 + 0.3 * ((li + 0.7) / levels.length));
    const gz = await gzip(raw);
    out.push({ level: li, triangles: m.nt, vertices: m.nv, rawBytes: raw.length, bytes: gz.length, parts: splitParts(gz) });
  }
  return { bbox: mesh.bbox, stats, meanEdge: edge, levels: out };
}

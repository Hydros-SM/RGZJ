// ZIP со сжатием (deflate) и чтением — для обмена пакетами между основной и полевой платформой. Без библиотек: CompressionStream /
// DecompressionStream есть в современных браузерах (Edge, Chrome). Общий файл: та же копия лежит в проекте полевой платформы.
//   zipPack([{ name, data: Uint8Array | string | Blob, store?: true }]) → Promise<Blob>   (store: true — без сжатия, для уже сжатых файлов вроде JPEG)
//   readZip(ArrayBuffer | Uint8Array) → { names, has(name), bytes(name), text(name), json(name) }
let CRC_TABLE = null;
export function crc32(u8) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function toBytes(d) {
  if (d instanceof Uint8Array) return d;
  if (typeof d === 'string') return new TextEncoder().encode(d);
  if (d instanceof ArrayBuffer) return new Uint8Array(d);
  return new Uint8Array(await d.arrayBuffer());
}
async function pipe(u8, stream) {
  const w = stream.writable.getWriter();
  w.write(u8); w.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}
export const deflateRaw = (u8) => pipe(u8, new CompressionStream('deflate-raw'));
export const inflateRaw = (u8) => pipe(u8, new DecompressionStream('deflate-raw'));

// SHA-256 файла в виде hex (нужен HTTPS или localhost); для сверки файла до и после переноса
export async function sha256Hex(input) {
  const u8 = input instanceof Uint8Array ? input : input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(await input.arrayBuffer());
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', u8));
  return Array.from(h).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function zipPack(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = enc.encode(f.name), raw = await toBytes(f.data), crc = crc32(raw);
    let data = raw, method = 0;
    if (!f.store && raw.length > 64) { const z = await deflateRaw(raw); if (z.length < raw.length) { data = z; method = 8; } }
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, method, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, raw.length, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, method, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, raw.length, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

export function readZip(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let e = u8.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Это не ZIP-архив (нет записи конца каталога)');
  const n = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const dec = new TextDecoder(), entries = new Map();
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Повреждён каталог ZIP');
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    entries.set(name, { method, csize, usize, off, crc: dv.getUint32(p + 16, true) });
    p += 46 + nl + xl + cl;
  }
  async function bytes(name) {
    const en = entries.get(name);
    if (!en) throw new Error('В пакете нет файла «' + name + '»');
    const lnl = dv.getUint16(en.off + 26, true), lxl = dv.getUint16(en.off + 28, true), start = en.off + 30 + lnl + lxl;
    const raw = u8.subarray(start, start + en.csize);
    const out = en.method === 8 ? await inflateRaw(raw) : raw.slice();
    if (en.usize && out.length !== en.usize) throw new Error('Файл «' + name + '» повреждён (размер не совпадает)');
    if (crc32(out) !== en.crc) throw new Error('Файл «' + name + '» повреждён (контрольная сумма не совпала)');
    return out;
  }
  return {
    names: Array.from(entries.keys()),
    has: (name) => entries.has(name),
    bytes,
    text: async (name) => dec.decode(await bytes(name)),
    json: async (name) => JSON.parse(dec.decode(await bytes(name))),
  };
}

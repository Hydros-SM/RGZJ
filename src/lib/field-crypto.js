// Шифрование полевых пакетов паролем (AES-GCM 256, ключ из пароля через PBKDF2-SHA256, 200 000 итераций). Формат файла:
// 'GFE1' (4 байта) | соль (16) | вектор (12) | шифртекст (с тегом проверки). Файл без шифрования — обычный ZIP (начинается с 'PK').
// Общий файл: та же копия лежит в проекте полевой платформы. Нужен HTTPS или localhost (WebCrypto).
const MAGIC = [0x47, 0x46, 0x45, 0x31];
const ITER = 200000;

async function keyFrom(password, salt, usage) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, usage);
}

export const isEncrypted = (u8) => u8.length > 4 && MAGIC.every((b, i) => u8[i] === b);

export async function encryptBytes(u8, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(password, salt, ['encrypt']), u8));
  const out = new Uint8Array(4 + 16 + 12 + ct.length);
  out.set(MAGIC, 0); out.set(salt, 4); out.set(iv, 20); out.set(ct, 32);
  return out;
}

export async function decryptBytes(u8, password) {
  if (!isEncrypted(u8)) throw new Error('Файл не зашифрован');
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(20, 32) }, await keyFrom(password, u8.subarray(4, 20), ['decrypt']), u8.subarray(32)));
  } catch (e) { throw new Error('Неверный пароль или файл повреждён'); }
}

// Простой статический сервер для разработки и проверки полевой платформы: node dev-server.js [порт]
// (на планшете сервер не нужен — приложение ставится из браузера и работает офлайн; см. README.md)
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname, port = Number(process.env.PORT) || Number(process.argv[2]) || 8940;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
http.createServer((req, res) => {
  // Только для разработки: приём тестового пакета от основной платформы в папку .dev (в git не попадает, после проверки удаляется)
  if ((req.url || '').startsWith('/__dev/upload')) {
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*'); res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const name = path.basename(decodeURIComponent((req.url.split('name=')[1] || 'test.gfield').split('&')[0]));
    fs.mkdirSync(path.join(root, '.dev'), { recursive: true });
    const out = fs.createWriteStream(path.join(root, '.dev', name));
    req.pipe(out); out.on('finish', () => { res.writeHead(200); res.end('ok'); });
    return;
  }
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); res.end('403'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(port, () => console.log('Полевая платформа: http://localhost:' + port));

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'app');
const HOST = '127.0.0.1';
const PORT = 8787;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png'
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const resolved = path.resolve(ROOT, relative);

  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
    return null;
  }

  return resolved;
}

const server = http.createServer((req, res) => {
  try {
    const filePath = safePath(req.url || '/');

    if (!filePath) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8'
      });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const data = fs.readFileSync(filePath);

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store'
    });

    res.end(data);
  } catch (error) {
    console.error(error);

    res.writeHead(500, {
      'Content-Type': 'text/plain; charset=utf-8'
    });

    res.end('Internal server error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Chicago Intel PWA: http://${HOST}:${PORT}/`);
  console.log(`Serving: ${ROOT}`);
  console.log('Press Ctrl+C to stop.');
});

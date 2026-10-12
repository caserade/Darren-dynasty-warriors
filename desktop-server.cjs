'use strict';
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path'),
  { spawn } = require('node:child_process');
const root = path.join(__dirname, 'dist');
const start = process.argv.includes('--pixel') ? '/' : '/3d/';
let port = 8000;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.glb': 'model/gltf-binary',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};
const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  let file = path.resolve(root, '.' + pathname);
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  } catch {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});
function openGame(url) {
  console.log('Darren game: ' + url + '\nKeep this window open. Ctrl+C stops the game server.');
  if (process.platform === 'win32')
    spawn('explorer.exe', [url], { stdio: 'ignore' }).on('error', () => {});
}
// Both games keep their saves in the browser storage of one address. If this game is already
// running (for example the other launcher was opened first), open that address instead of
// starting a second copy on a new port, so saves and settings stay shared.
function alreadyServingGame(p, done) {
  const req = http.get(
    { host: '127.0.0.1', port: p, path: '/shared-save.js', timeout: 1500 },
    (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (body += d));
      res.on('end', () => done(res.statusCode === 200 && body.includes('SnowdayShared')));
    }
  );
  req.on('timeout', () => req.destroy());
  req.on('error', () => done(false));
}
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && port < 8020) {
    alreadyServingGame(port, (yes) => {
      if (yes) {
        openGame('http://127.0.0.1:' + port + start);
        console.log('(The game was already running in another window.)');
        process.exit(0);
      }
      server.listen(++port, '127.0.0.1');
    });
  } else {
    console.error('Could not start the local game:', err.message);
    process.exit(1);
  }
});
server.on('listening', () => openGame('http://127.0.0.1:' + port + start));
server.listen(port, '127.0.0.1');

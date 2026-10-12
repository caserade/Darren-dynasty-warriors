// Serves dist/3d plus the review page for tools/review/shoot.cjs (Claude update 8).
const http = require('http'),
  fs = require('fs'),
  path = require('path');
const ROOT = path.join(__dirname, '../../dist/3d');
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.css': 'text/css',
};
function serve(port = 0) {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file =
      u === '/review.html'
        ? path.join(__dirname, 'review.html')
        : path.join(ROOT, path.normalize(u));
    if (!file.startsWith(ROOT) && !file.startsWith(__dirname)) return res.writeHead(403).end();
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end();
      res
        .writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' })
        .end(data);
    });
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}
module.exports = { serve };

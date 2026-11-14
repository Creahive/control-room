'use strict';
const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', '..', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

function send(res, code, data, type) {
  if (res.headersSent) return;
  const isStr = typeof data === 'string';
  res.writeHead(code, { 'Content-Type': type || (isStr ? 'text/plain; charset=utf-8' : 'application/json'), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(isStr ? data : JSON.stringify(data));
}
/** The JSON body of a request (at most 1 MB). */
function body(req, max = 1_000_000) {
  return new Promise((ok, fail) => {
    let b = '', n = 0;
    req.on('data', d => { n += d.length; if (n > max) { fail(new Error('body too large')); req.destroy(); } else b += d; });
    req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { fail(new Error('bad JSON')); } });
    req.on('error', fail);
  });
}
function serveStatic(res, rel, root = PUB) {
  const f = path.resolve(root, rel);
  if (!f.startsWith(root + path.sep)) return send(res, 404, 'not found');
  fs.readFile(f, (e, buf) => {
    if (e) return send(res, 404, 'not found');
    const hashed = /\/dist\/.+\.[0-9a-f]{8,}\./.test(f);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff',
      'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache' });
    res.end(buf);
  });
}
const ipOf = req => req.socket.remoteAddress || '';
const httpError = (code, msg) => Object.assign(new Error(msg), { code });

module.exports = { send, body, serveStatic, ipOf, httpError, PUB };

'use strict';
/* The HTTP server: setup wizard (until an admin exists), sign-in, the agent API (/internal, token), the browser API
 * (/api, cookie session) and the static UI. */
const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { send, body, serveStatic, PUB } = require('./util');

function makeServer(hub) {
  const { cfg } = hub;
  const login = require('./login')(hub);
  const api = require('./api')(hub);
  const internal = require('./internal')(hub);
  const setup = require('./setup')(hub);

  // the agent API token: created once, readable only by the hub's user
  const TOKEN_F = path.join(cfg.dataDir, 'internal.token');
  if (!fs.existsSync(TOKEN_F)) fs.writeFileSync(TOKEN_F, crypto.randomBytes(24).toString('hex') + '\n', { mode: 0o600 });
  const token = fs.readFileSync(TOKEN_F, 'utf8').trim();
  const tokenOk = t => typeof t === 'string' && t.length === token.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(token));
  const origins = new Set([`http://127.0.0.1:${cfg.port}`, `http://localhost:${cfg.port}`, `http://${cfg.bind}:${cfg.port}`]);
  if (cfg.publicUrl) origins.add(new URL(cfg.publicUrl).origin);

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x'), p = url.pathname;
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');

    if (p.startsWith('/internal/')) {
      if (req.method !== 'POST' || !tokenOk(req.headers['x-cmd-token'])) return send(res, 403, { error: 'token' });
      return internal(req, res, p, await body(req));
    }
    // state-changing browser calls must come from the hub's own origin (the cookie is SameSite=Strict as well)
    if (req.method === 'POST' && req.headers.origin && !origins.has(req.headers.origin)) return send(res, 403, { error: 'origin' });

    if (await setup(req, res, p, url)) return;
    if (/^\/(favicon\.svg|manifest\.webmanifest|vendor\/qrcode\.js|sw\.js|offline\.html|icons\/[a-z0-9-]+\.png)$/.test(p)) return serveStatic(res, p.slice(1));
    if (await login(req, res, p)) return;

    const me = hub.authed(req);
    if (!me) {
      if (p.startsWith('/api/')) return send(res, 401, { error: 'login' });
      res.writeHead(302, { Location: '/login' }); return res.end();
    }
    if (p.startsWith('/api/')) return api(req, res, p, url, me);
    if (p === '/' || p === '/index.html') {
      const built = hub.BUILD.ensureBuilt({ quiet: true });
      return serveStatic(res, built ? path.relative(PUB, built) : 'index.html');
    }
    return serveStatic(res, p.slice(1));
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch(e => { if (!res.headersSent) send(res, e.code >= 400 && e.code < 600 ? e.code : 400, { error: String(e.message || e) }); });
  });
  return server;
}

module.exports = { makeServer };

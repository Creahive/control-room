'use strict';
/* First-run wizard (/setup). Step 1 (no session needed, only while no admin exists): create the admin. Every later
 * step needs that admin's session: two-step sign-in (optional), "connect your agent" (detection), the proposed tree,
 * the settings.json diff, apply. Until the wizard is finished, / sends the admin back to /setup. */
const path = require('path');
const { now, readJSON, writeJSON } = require('../util');
const { send, body, serveStatic } = require('./util');
const { detect } = require('../detect');
const OB = require('../onboard');

module.exports = function setupRoutes(hub) {
  const { cfg } = hub;
  const F = path.join(cfg.dataDir, 'setup.json');
  const st = readJSON(F, null) || { done: false };
  if (hub.demo || (cfg.exists && !hub.setupNeeded())) st.done = true;   // an existing config + admin: nothing to set up
  const save = () => writeJSON(F, st);
  let lastReport = null, lastPlan = null;
  // CMD_HUB_DETECT_HOME / CMD_HUB_DETECT_PROC point detection at a fixture (tests); CMD_HUB_CLI_DIR is where the CLI is linked
  const det = () => detect({ bin: cfg.claude.bin, home: process.env.CMD_HUB_DETECT_HOME || undefined, proc: process.env.CMD_HUB_DETECT_PROC || undefined,
    env: process.env.CMD_HUB_DETECT_HOME ? { PATH: process.env.PATH } : undefined });
  const cliDir = () => process.env.CMD_HUB_CLI_DIR || path.join(require('os').homedir(), '.local', 'bin');
  hub.setupDone = () => !!st.done;

  return async function route(req, res, p) {
    const needAdmin = hub.setupNeeded();
    if (!p.startsWith('/setup') && !p.startsWith('/api/setup/')) {
      // before the admin exists the wizard is the only page; afterwards the admin finishes it before the map
      if (needAdmin && !/^\/(vendor\/qrcode\.js|favicon\.svg|app\.css)$/.test(p)) {
        if (p.startsWith('/api/') || p.startsWith('/internal/')) return send(res, 503, { error: 'not set up yet: open /setup' }), true;
        res.writeHead(302, { Location: '/setup' }); return res.end(), true;
      }
      if (!st.done && (p === '/' || p === '/index.html') && hub.authed(req)) { res.writeHead(302, { Location: '/setup' }); return res.end(), true; }
      return false;
    }
    if (p === '/setup' || p === '/setup.html') {
      if (st.done && !needAdmin) { res.writeHead(302, { Location: '/' }); return res.end(), true; }
      return serveStatic(res, 'setup.html'), true;
    }
    if (p === '/api/setup/state') {
      const me = hub.authed(req);
      return send(res, 200, { needed: needAdmin, done: !!st.done, signedIn: !!me, admin: !!(me && me.admin), mfa: !!(me && me.mfa && me.mfa.on), demo: hub.demo }), true;
    }
    if (p === '/api/setup/admin' && req.method === 'POST') {
      if (!needAdmin) return send(res, 409, { error: 'An admin already exists. Sign in instead.' }), true;
      const b = await body(req);
      let u; try { u = hub.createAdmin(b.name, b.password); } catch (e) { return send(res, 400, { error: e.message }), true; }
      hub.auth.startSession(res, u.id);
      st.adminAt = now(); save();
      return send(res, 200, { ok: true, mfa: hub.beginMfa(u) }), true;
    }

    const me = hub.authed(req);
    if (!me || !me.admin) return send(res, 401, { error: 'sign in as the admin first' }), true;
    if (st.done && p !== '/api/setup/detect') return send(res, 409, { error: 'setup is finished; use Settings' }), true;

    if (p === '/api/setup/mfa' && req.method === 'POST') {
      const b = await body(req);
      if (b.skip) { delete me.mfaPending; hub.users.save(); return send(res, 200, { ok: true, skipped: true }), true; }
      if (b.restart || !me.mfaPending) return send(res, 200, { ok: true, mfa: hub.beginMfa(me) }), true;
      const codes = hub.confirmMfa(me, b.code);
      if (!codes) return send(res, 400, { error: 'That code did not work. Check the time on your phone and try the newest code.' }), true;
      return send(res, 200, { ok: true, recovery: codes }), true;
    }
    if (p === '/api/setup/detect') {
      lastReport = det();
      return send(res, 200, lastReport), true;
    }
    if (p === '/api/setup/proposal' && req.method === 'POST') {
      const b = await body(req);
      const report = lastReport || (lastReport = det());
      const prop = OB.proposal(report, b.include || {});
      lastPlan = OB.hookPlan(prop.config.accounts);
      return send(res, 200, { ...prop, hooks: lastPlan.map(h => ({ account: h.account, file: h.file, exists: h.exists, change: h.change, note: h.note, error: h.error, diff: h.diff })),
        cli: cliDir(), configFile: cfg.file }), true;
    }
    if (p === '/api/setup/apply' && req.method === 'POST') {
      const b = await body(req);
      if (!b.nodes || !b.config) return send(res, 400, { error: 'nodes and config required (from /api/setup/proposal)' }), true;
      const hooks = (lastPlan || []).filter(h => h.change && (b.hooks || []).includes(h.account));
      try {
        const r = OB.apply({ cfgFile: cfg.file, prop: { nodes: b.nodes, config: b.config }, hooks, cli: b.installCli ? cliDir() : null, hub, base: cfg.raw || {} });
        st.done = true; st.doneAt = now(); save();
        hub.logEvent({ type: 'care', from: 'hub', to: 'brain', text: `setup finished: ${r.nodes.length} agents registered` });
        return send(res, 200, r), true;
      } catch (e) { return send(res, 400, { error: e.message }), true; }
    }
    if (p === '/api/setup/skip' && req.method === 'POST') { st.done = true; st.doneAt = now(); save(); return send(res, 200, { ok: true }), true; }
    return send(res, 404, { error: 'unknown setup route' }), true;
  };
};

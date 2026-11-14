'use strict';
/* The whole first run over HTTP on a throwaway HOME: setup wizard (admin, two-step code, detection, proposal, the hook
   diff, apply), then sign-in, an invited member, permissions, the agent API. tmux runs on a private socket, so no real
   pane is ever touched. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { fakeHome } = require('./helpers/fake-home');
const { totp } = require('../src/auth');

const F = fakeHome();
process.env.CONTROL_ROOM_DETECT_HOME = F.home;
process.env.CONTROL_ROOM_DETECT_PROC = F.proc;
process.env.CONTROL_ROOM_CLI_DIR = path.join(F.root, 'bin');
const CONFIG = require('../src/config');
const cfgFile = path.join(F.root, 'config', 'config.json');
const cfg = CONFIG.load({ CONTROL_ROOM_CONFIG: cfgFile, CONTROL_ROOM_DATA: path.join(F.root, 'data'), CONTROL_ROOM_PORT: '0' });
cfg.tmux.socket = 'control-room-test-' + process.pid;
cfg.home = F.home;
const { createHub } = require('../src/hub');
const { makeServer } = require('../src/http/server');
const hub = createHub(cfg, { quiet: true });
const server = makeServer(hub);

let port, jar = {};
function req(method, p, data, { who = 'admin', headers = {} } = {}) {
  return new Promise((ok, fail) => {
    const body = data === undefined ? null : JSON.stringify(data);
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(jar[who] ? { cookie: jar[who] } : {}), ...headers } }, res => {
      let b = ''; res.on('data', d => (b += d));
      res.on('end', () => {
        const sc = res.headers['set-cookie']; if (sc) jar[who] = sc[0].split(';')[0];
        let j = null; try { j = JSON.parse(b); } catch {}
        ok({ status: res.statusCode, json: j, text: b, headers: res.headers });
      });
    });
    r.on('error', fail); r.end(body);
  });
}
const code = secret => totp.totpAt(secret, Math.floor(Date.now() / 30000));

server.listen(0, '127.0.0.1', async () => {
  port = server.address().port;
  try {
    // before setup: only the wizard
    let r = await req('GET', '/');
    assert.strictEqual(r.status, 302); assert.strictEqual(r.headers.location, '/setup');
    assert.strictEqual((await req('GET', '/api/tree')).status, 503);
    assert.strictEqual((await req('GET', '/setup')).status, 200);
    assert.deepStrictEqual((await req('GET', '/api/setup/state')).json.needed, true);
    assert.strictEqual((await req('POST', '/api/setup/detect', {})).status, 401, 'detection needs the admin');

    // 1. admin (a weak password is refused), 2. two-step code
    assert.strictEqual((await req('POST', '/api/setup/admin', { name: 'Sam', password: 'short' })).status, 400);
    r = await req('POST', '/api/setup/admin', { name: 'Sam', password: 'tangerine-orbit-42' });
    assert.strictEqual(r.status, 200); assert.ok(r.json.mfa.secret && /^otpauth:\/\/totp\//.test(r.json.mfa.otpauth));
    assert.strictEqual((await req('POST', '/api/setup/admin', { name: 'X', password: 'tangerine-orbit-43' }, { who: 'other' })).status, 409, 'only once');
    assert.strictEqual((await req('POST', '/api/setup/mfa', { code: '000000' })).status, 400);
    r = await req('POST', '/api/setup/mfa', { code: code(r.json.mfa.secret) });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.recovery.length, 10);
    const admin = hub.users.get('owner'); assert.ok(admin.mfa.on && !JSON.stringify(hub.publicUser(admin)).includes(admin.mfa.secret));

    // until the wizard is finished, the map sends the admin back to it
    r = await req('GET', '/'); assert.strictEqual(r.headers.location, '/setup');

    // 3. detection, 4. proposal with the hook diff (nothing written yet)
    r = await req('GET', '/api/setup/detect');
    assert.deepStrictEqual(r.json.running.map(x => x.pid), [4242, 4343]);
    const work = path.join(F.home, '.claude-work', 'settings.json'), before = fs.readFileSync(work, 'utf8');
    r = await req('POST', '/api/setup/proposal', { include: { projects: [F.shop] } });
    assert.deepStrictEqual(r.json.nodes.map(n => n.id), ['brain', 'front', 'shop']);
    const hw = r.json.hooks.find(h => h.account === 'work');
    assert.ok(hw.change && /\+.*guard\.js/.test(hw.diff));
    assert.strictEqual(fs.readFileSync(work, 'utf8'), before);
    assert.ok(!fs.existsSync(cfgFile), 'no config before apply');

    // 5. apply: the person renamed the lead and ticked the hook for one account only
    const nodes = r.json.nodes.map(n => (n.id === 'shop' ? { ...n, name: 'Shop' } : n));
    r = await req('POST', '/api/setup/apply', { nodes, config: r.json.config, hooks: ['work'], installCli: false });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.ok(fs.existsSync(cfgFile)); assert.ok(r.json.hooks[0].backup && fs.readFileSync(r.json.hooks[0].backup, 'utf8') === before);
    assert.ok(!fs.existsSync(path.join(F.home, '.claude', 'settings.json')), 'the unticked account is untouched');
    assert.ok(!fs.existsSync(path.join(F.root, 'bin')), 'no CLI links when not asked');
    const saved = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
    assert.deepStrictEqual(saved.projects.map(p => p.cwd), [F.shop]);
    const shop = hub.tree.nodes.shop;
    assert.ok(shop && shop.name === 'Shop' && shop.pane === '%7' && shop.sessionId === 'sess-4242' && shop.account === 'work');
    assert.strictEqual((await req('POST', '/api/setup/apply', { nodes, config: saved })).status, 409, 'setup runs once');

    // the map now
    r = await req('GET', '/'); assert.strictEqual(r.status, 200); assert.ok(/<html/i.test(r.text));
    r = await req('GET', '/api/tree');
    assert.deepStrictEqual(r.json.nodes.map(n => n.id).sort(), ['brain', 'front', 'shop']);
    assert.ok(r.json.me.admin && r.json.users.length === 1);
    for (const p of ['/api/settings', '/api/agents', '/api/queue', '/api/tasks', '/api/jobs', '/api/actions', '/api/changelog', '/api/rules', '/api/users', '/api/server', '/api/me'])
      assert.strictEqual((await req('GET', p)).status, 200, p);
    // another origin cannot post with the cookie
    assert.strictEqual((await req('POST', '/api/send', { to: 'brain', text: 'x' }, { headers: { origin: 'https://evil.example' } })).status, 403);

    // sign out, sign in again: password then code
    await req('POST', '/api/logout', {});
    assert.strictEqual((await req('GET', '/api/tree')).status, 401);
    assert.strictEqual((await req('POST', '/api/login', { password: 'wrong-password-1' })).status, 401);
    r = await req('POST', '/api/login', { password: 'tangerine-orbit-42' });
    assert.strictEqual(r.json.mfa, 'verify');
    r = await req('POST', '/api/login/mfa', { ticket: r.json.ticket, code: code(admin.mfa.secret) });
    assert.strictEqual(r.status, 401, 'the code from setup was used already (replay)');
    admin.mfa.lastStep = 0;
    r = await req('POST', '/api/login', { password: 'tangerine-orbit-42' });
    r = await req('POST', '/api/login/mfa', { ticket: r.json.ticket, code: code(admin.mfa.secret) });
    assert.strictEqual(r.status, 200);

    // invite a member (console mail: the link comes back to the admin), the member joins with password + code
    r = await req('POST', '/api/users/new', { name: 'Robin', email: 'robin@example.com', perms: { map: true }, projects: ['shop'] });
    assert.strictEqual(r.status, 200); assert.ok(r.json.link.includes('/invite#') && r.json.sent === false);
    const token = r.json.link.split('#')[1];
    r = await req('POST', '/api/invite/info', { token }, { who: 'robin' });
    assert.strictEqual(r.json.name, 'Robin');
    r = await req('POST', '/api/invite/finish', { token, password: 'violet-harbor-77', code: code(r.json.secret) }, { who: 'robin' });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.recovery.length, 10);
    assert.strictEqual((await req('POST', '/api/invite/info', { token }, { who: 'x' })).status, 404, 'single use');
    r = await req('GET', '/api/tree', undefined, { who: 'robin' });
    assert.deepStrictEqual(r.json.nodes.map(n => n.id).sort(), ['brain', 'desk-robin', 'shop'], 'the member sees their desk, BRAIN and their project');
    assert.ok(!r.json.me.admin && r.json.limits.length === 0);
    assert.strictEqual((await req('GET', '/api/settings', undefined, { who: 'robin' })).status, 403);
    assert.strictEqual((await req('POST', '/api/stop/shop', {}, { who: 'robin' })).status, 403, 'no manage permission');
    assert.strictEqual((await req('GET', '/api/term/shop', undefined, { who: 'robin' })).status, 403, 'no terminal permission');

    // the agent API: token required
    const tok = fs.readFileSync(path.join(cfg.dataDir, 'internal.token'), 'utf8').trim();
    assert.strictEqual((await req('POST', '/internal/tree', { me: 'you' }, { headers: { 'x-cmd-token': 'nope' } })).status, 403);
    r = await req('POST', '/internal/tree', { me: 'you' }, { headers: { 'x-cmd-token': tok } });
    assert.ok(/Shop \[shop\] lead/.test(r.json.text));
    assert.strictEqual((await req('POST', '/internal/tree', { me: 'ghost' }, { headers: { 'x-cmd-token': tok } })).status, 403, 'unknown agent id');
    r = await req('POST', '/internal/ask', { me: 'shop', title: 'Ship it?', questions: [{ label: 'When', type: 'one', options: ['*Now', 'Later'] }] }, { headers: { 'x-cmd-token': tok } });
    assert.ok(/^a\d+$/.test(r.json.id));
    r = await req('POST', '/internal/job', { me: 'shop', op: 'start', title: 'Checkout fix' }, { headers: { 'x-cmd-token': tok } });
    assert.strictEqual(r.json.status, 'working');
    r = await req('POST', '/internal/job', { me: 'shop', op: 'step', text: 'found the cause', pct: 40 }, { headers: { 'x-cmd-token': tok } });
    assert.strictEqual(r.json.pct, 40);
    r = await req('POST', '/internal/changelog', { me: 'shop', title: 'fix', what: 'a', revert: 'b' }, { headers: { 'x-cmd-token': tok } });
    assert.ok(/^c\d+$/.test(r.json.id));
    console.log('http ok');
    process.exit(0);
  } catch (e) { console.error(e); process.exit(1); }
});

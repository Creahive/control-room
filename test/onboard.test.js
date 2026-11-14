'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { detect } = require('../src/detect');
const OB = require('../src/onboard');
const { fakeHome } = require('./helpers/fake-home');

const F = fakeHome();
const r = detect({ home: F.home, env: { PATH: '' }, proc: F.proc, tmuxPanes: F.tmuxPanes, exec: F.exec });

// proposal: BRAIN + front desk on top, a lead per project, the running tmux session adopted into its project's lead
const prop = OB.proposal(r);
const byId = Object.fromEntries(prop.nodes.map(n => [n.id, n]));
assert.ok(byId.brain && byId.brain.role === 'brain' && byId.brain.parent === null);
assert.ok(byId.front && byId.front.role === 'front' && byId.front.user === 'owner');
assert.ok(byId.shop && byId.shop.role === 'lead' && byId.shop.parent === 'brain' && byId.shop.cwd === F.shop);
assert.deepStrictEqual(byId.shop.adopt, { pid: 4242, pane: '%7', sessionId: 'sess-4242' });
assert.strictEqual(byId.shop.account, 'work', 'the lead runs on the account its session used');
assert.ok(byId.blog && !byId.blog.adopt, 'a hub-managed session is not adopted again');
assert.deepStrictEqual(prop.config.accounts.map(a => a.id).sort(), ['main', 'work'], 'only signed-in dirs');
assert.deepStrictEqual(prop.config.projects.map(p => p.name), ['shop', 'blog']);
// include filters: only blog; nothing adopted
const p2 = OB.proposal(r, { projects: [F.blog], adopt: [] });
assert.deepStrictEqual(p2.nodes.map(n => n.id), ['brain', 'front', 'blog']);
// zero detected: still BRAIN + front desk on the default account
const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'control-room-bare-'));
const p0 = OB.proposal({ home: bare, configDirs: [], running: [], projects: [] });
assert.deepStrictEqual(p0.nodes.map(n => n.id), ['brain', 'front']);
assert.strictEqual(p0.config.accounts[0].configDir, path.join(bare, '.claude'));

// the hook plan shows a diff and writes nothing
const work = path.join(F.home, '.claude-work', 'settings.json'), before = fs.readFileSync(work, 'utf8');
const plan = OB.hookPlan(prop.config.accounts, '/usr/bin/node');
const pw = plan.find(h => h.account === 'work'), pm = plan.find(h => h.account === 'main');
assert.ok(pw.change && pw.exists && /\+.*"PreToolUse"/.test(pw.diff) && /\+.*hooks\/guard\.js/.test(pw.diff) && /^-  "theme": "dark"$/m.test(pw.diff) && /^\+  "theme": "dark",$/m.test(pw.diff));
assert.ok(pm.change && !pm.exists, 'main has no settings.json yet');
assert.strictEqual(fs.readFileSync(work, 'utf8'), before, 'planning writes nothing');
assert.ok(!fs.existsSync(pm.file));

// apply: config with backup, hook with backup, CLI links, nothing else touched
const cfgFile = path.join(F.root, 'cfg', 'config.json');
fs.mkdirSync(path.dirname(cfgFile), { recursive: true }); fs.writeFileSync(cfgFile, '{"port": 4000}');
const bin = path.join(F.root, 'bin'); fs.mkdirSync(bin); fs.writeFileSync(path.join(bin, 'heavy'), 'someone else\'s');
const res = OB.apply({ cfgFile, prop, hooks: [pw], cli: bin, base: { port: 4000 } });
const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
assert.strictEqual(cfg.port, 4000, 'existing settings kept');
assert.deepStrictEqual(cfg.projects.map(p => p.name), ['shop', 'blog']);
assert.ok(res.configBackup && fs.readFileSync(res.configBackup, 'utf8') === '{"port": 4000}');
const s = JSON.parse(fs.readFileSync(work, 'utf8'));
assert.strictEqual(s.theme, 'dark'); assert.ok(OB.hasGuard(s));
assert.strictEqual(fs.readFileSync(res.hooks[0].backup, 'utf8'), before);
assert.ok(!fs.existsSync(pm.file), 'an unticked hook is not written');
const links = Object.fromEntries(res.cli.map(c => [c.name, c.state]));
assert.deepStrictEqual(links, { cmd: 'linked', heavy: 'skipped: a different file is already there', 'control-room': 'linked' });
assert.strictEqual(fs.readFileSync(path.join(bin, 'heavy'), 'utf8'), 'someone else\'s');
// a second plan sees the hook already there
assert.ok(!OB.hookPlan(prop.config.accounts).find(h => h.account === 'work').change);
// settings.json changed after the diff was shown: refused
const plan2 = OB.hookPlan(prop.config.accounts).find(h => h.account === 'main');
fs.mkdirSync(path.dirname(plan2.file), { recursive: true }); fs.writeFileSync(plan2.file, '{"x":1}');
assert.throws(() => OB.applyHook({ ...plan2, change: true }), /changed since the diff was shown/);
// diff helper
assert.strictEqual(OB.lineDiff('a\nb\nc', 'a\nx\nc'), ' a\n-b\n+x\n c');
console.log('onboard ok');

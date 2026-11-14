'use strict';
/* `cmd init`: the setup wizard in a terminal. Same steps as /setup: admin login, detection, the proposed map, the
 * settings.json diff (asked per file, backed up), the CLI links. Works with the hub stopped; the hub reads what this
 * writes when it starts. `cmd passwd` sets a new admin password. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const CONFIG = require('./config');
const { detect } = require('./detect');
const OB = require('./onboard');
const { readJSON, writeJSON, now } = require('./util');
const { weakPassword } = require('./auth');

function prompt() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  const ask = q => new Promise(ok => rl.question(q, a => ok(a.trim())));
  // passwords without echo when on a terminal
  const secret = q => new Promise(ok => {
    if (!process.stdin.isTTY) return rl.question(q, a => ok(a));
    process.stdout.write(q);
    const old = rl._writeToOutput; rl._writeToOutput = () => {};
    rl.question('', a => { rl._writeToOutput = old; process.stdout.write('\n'); ok(a); });
  });
  const yes = async (q, def) => { if (prompt.auto) return def; const a = (await ask(`${q} [${def ? 'Y/n' : 'y/N'}] `)).toLowerCase(); return a ? a.startsWith('y') : def; };
  return { ask, secret, yes, close: () => rl.close() };
}
const hashPw = pw => { const salt = crypto.randomBytes(16); return { salt: salt.toString('hex'), hash: crypto.scryptSync(pw, salt, 64).toString('hex') }; };

async function hubUp(cfg) {
  return new Promise(ok => {
    const r = require('http').request({ host: cfg.bind === '0.0.0.0' ? '127.0.0.1' : cfg.bind, port: cfg.port, path: '/login', method: 'GET', timeout: 1500 }, () => ok(true));
    r.on('error', () => ok(false)); r.on('timeout', () => { r.destroy(); ok(false); }); r.end();
  });
}

async function setAdmin(io, cfg, users, { name } = {}) {
  for (;;) {
    const pw = await io.secret('Admin password (at least 10 characters): ');
    const w = weakPassword(pw, { name }); if (w) { console.log('  ' + w); continue; }
    if ((await io.secret('Again: ')) !== pw) { console.log('  The two passwords differ.'); continue; }
    users.owner = { ...(users.owner || { id: 'owner', admin: true, createdAt: now() }), name: name || (users.owner || {}).name || 'Admin', ...hashPw(pw) };
    fs.mkdirSync(cfg.dataDir, { recursive: true, mode: 0o700 });
    writeJSON(path.join(cfg.dataDir, 'users.json'), users);
    return;
  }
}

async function init(fl = {}) {
  prompt.auto = !!fl.yes;
  const cfg = CONFIG.load(), io = prompt();
  try {
    if (await hubUp(cfg)) console.log(`Note: a hub answers on ${cfg.bind}:${cfg.port}. Stop it before applying, or use the web wizard at /setup.\n`);
    console.log(`cmd-hub setup\n  config: ${cfg.file}${cfg.exists ? ' (exists, will be backed up)' : ''}\n  data:   ${cfg.dataDir}\n`);

    // 1. admin
    const users = readJSON(path.join(cfg.dataDir, 'users.json'), null) || {};
    if (!(users.owner && users.owner.hash)) {
      if (fl.yes) throw new Error('no admin yet: run cmd init without --yes once (it asks for the admin password)');
      const name = (await io.ask('Your name [Admin]: ')) || 'Admin';
      await setAdmin(io, cfg, users, { name });
      console.log('  Admin created. Two-step sign-in can be turned on in the browser (Settings > Security).\n');
    } else console.log('Admin login: already set.\n');

    // 2. detect
    console.log('Looking for Claude Code…');
    const r = detect({ bin: cfg.claude.bin });
    console.log(`  Claude Code CLI: ${r.claude.found ? r.claude.path + ' ' + (r.claude.version || '') : 'NOT FOUND (install it and sign in with `claude` once)'}`);
    console.log(`  tmux: ${r.tmux.available ? 'found' : 'NOT FOUND (needed to run agents)'}`);
    for (const d of r.configDirs) console.log(`  account ${d.id}: ${d.dir}, ${d.signedIn ? 'signed in' + (d.email ? ' as ' + d.email : '') : 'not signed in'}, ${d.sessions} sessions${d.running ? ', ' + d.running + ' running' : ''}`);
    if (!r.configDirs.length) console.log('  no Claude Code config dir yet: the map starts empty; sign in with `claude` later');
    for (const s of r.running) console.log(`  running: pid ${s.pid} in ${s.cwd || '?'}${s.pane ? ' (tmux ' + (s.tmux || s.pane) + ')' : ' (not in tmux)'}${s.managed ? ', already a hub agent' : ''}`);

    // 3. the map
    const projects = [];
    for (const p of r.projects.slice(0, 30)) if (await io.yes(`  Lead for ${p.name} (${p.cwd})?`, !!p.running || r.projects.indexOf(p) < 8)) projects.push(p.cwd);
    const prop = OB.proposal(r, { projects });
    console.log('\nProposed map:');
    for (const n of prop.nodes) console.log(`  ${n.parent ? (n.parent === 'brain' ? '  ' : '    ') : ''}${n.name} [${n.id}] ${n.role} · ${n.cwd}${n.adopt ? ' · adopts pane ' + n.adopt.pane : ''}`);
    if (!(await io.yes('Use this map?', true))) { console.log('Nothing written.'); return; }

    // 4. hooks: show the diff, ask per file
    const hooks = [];
    if (!fl['no-hooks']) for (const h of OB.hookPlan(prop.config.accounts)) {
      if (!h.change) { console.log(`\n${h.file}: ${h.error || h.note || 'no change'}`); continue; }
      console.log(`\nThe optional guard hook would change ${h.file}${h.exists ? ' (backed up first)' : ' (new file)'}:\n` + h.diff.split('\n').filter(l => l[0] !== ' ').join('\n'));
      if (await io.yes('Write this change?', false)) hooks.push(h);
    }
    const cli = fl['no-cli'] ? null : (await io.yes(`\nLink cmd, heavy and cmd-hub into ${path.join(os.homedir(), '.local', 'bin')}?`, true)) ? path.join(os.homedir(), '.local', 'bin') : null;

    // 5. apply: config, hooks, CLI, then the agents straight into the data dir
    const res = OB.apply({ cfgFile: cfg.file, prop, hooks, cli, base: cfg.raw || {} });
    const NODES = path.join(cfg.dataDir, 'nodes.json'), tree = readJSON(NODES, null) || { nodes: {} };
    for (const n of prop.nodes) {
      if (tree.nodes[n.id]) continue;
      tree.nodes[n.id] = { id: n.id, name: n.name, role: n.role, parent: n.parent, cwd: n.cwd, account: n.account, brief: n.brief || '', createdAt: now(),
        ...(n.user ? { user: n.user } : {}), ...(n.adopt && n.adopt.pane ? { pane: n.adopt.pane, sessionId: n.adopt.sessionId, adopted: true } : { stopped: true }) };
    }
    writeJSON(NODES, tree);
    writeJSON(path.join(cfg.dataDir, 'setup.json'), { done: true, doneAt: now(), via: 'cmd init' });
    console.log(`\nDone.\n  config: ${res.config}${res.configBackup ? ' (old: ' + res.configBackup + ')' : ''}`);
    for (const h of res.hooks) console.log(`  hook: ${h.file}${h.backup ? ' (old: ' + h.backup + ')' : ''}`);
    for (const c of res.cli) console.log(`  ${c.to}: ${c.state}`);
    console.log(`  agents: ${Object.keys(tree.nodes).length} on the map\nStart the hub with: cmd-hub  (then open http://${cfg.bind}:${cfg.port})`);
  } finally { io.close(); }
}

async function passwd() {
  const cfg = CONFIG.load(), io = prompt();
  try {
    if (await hubUp(cfg)) throw new Error(`the hub is running on ${cfg.bind}:${cfg.port}: stop it first (it would overwrite the change), or change the password in the browser`);
    const users = readJSON(path.join(cfg.dataDir, 'users.json'), null) || {};
    await setAdmin(io, cfg, users, { name: (users.owner || {}).name });
    console.log('Admin password set. Existing sessions stay signed in until they expire; sign out everywhere from Settings if needed.');
  } finally { io.close(); }
}

module.exports = init;
module.exports.passwd = passwd;

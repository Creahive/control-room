'use strict';
/* From a detection report to a running hub: propose a tree (BRAIN on top, a front desk, one lead per project folder,
 * running sessions adopted), show exactly what would change in Claude Code's settings.json (the optional guard hook)
 * before anything is written, then apply: config file, settings.json (with a backup), the `cmd` CLI link, agents.
 * Pure functions except apply(), which touches only the files it names in its result. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { slug } = require('./util');
const CONFIG = require('./config');

const ROOT = path.join(__dirname, '..');
const GUARD = path.join(ROOT, 'hooks', 'guard.js');

/** Accounts from the signed-in config dirs (all dirs when none is signed in, so the wizard can still show them). */
function accountsFrom(report, include = {}) {
  const dirs = report.configDirs.filter(d => (include.accounts ? include.accounts.includes(d.id) : d.signedIn));
  const list = (dirs.length ? dirs : report.configDirs.slice(0, 1)).map(d => ({ id: d.id, label: d.isDefault ? 'Main' : d.label, configDir: d.dir }));
  if (!list.length) list.push({ id: 'main', label: 'Main', configDir: path.join(report.home, '.claude') });
  const ids = new Set(); for (const a of list) { let id = a.id; while (ids.has(id)) id += '-2'; a.id = id; ids.add(id); }
  return list;
}

/**
 * The proposed tree. include = { projects: [cwd...], adopt: [pid...], accounts: [id...] } (defaults: every project
 * folder found and every running session that is not already a hub agent).
 */
function proposal(report, include = {}) {
  const accounts = accountsFrom(report, include);
  const acctOf = dir => (accounts.find(a => a.configDir === dir) || accounts[0]).id;
  const pick = report.projects.filter(p => (include.projects ? include.projects.includes(p.cwd) : true));
  const nodes = [
    { id: 'brain', name: 'BRAIN', role: 'brain', parent: null, cwd: report.home, account: accounts[0].id, brief: 'Route work to the right project lead, create leads on demand, and keep the big picture.' },
    { id: 'front', name: 'Front desk', role: 'front', parent: null, cwd: report.home, account: accounts[0].id, user: 'owner', brief: 'Talk with the person in the browser and delegate real work to BRAIN.' },
  ];
  const used = new Set(nodes.map(n => n.id));
  const uid = base => { let id = slug(base) || 'lead', i = 2; while (used.has(id)) id = slug(base) + '-' + i++; used.add(id); return id; };
  const projects = [];
  const running = report.running.filter(r => !r.managed && (include.adopt ? include.adopt.includes(r.pid) : true));
  for (const p of pick) {
    const here = running.filter(r => r.cwd && (r.cwd === p.cwd || r.cwd.startsWith(p.cwd + '/')));
    const first = here.find(r => r.pane);
    projects.push({ name: p.name, cwd: p.cwd, notes: '' });
    nodes.push({ id: uid(p.name), name: p.name, role: 'lead', parent: 'brain', cwd: p.cwd, account: acctOf(first ? first.configDir : accounts[0].configDir),
      brief: `You lead the project in ${p.cwd}. Get familiar with it (its CLAUDE.md and README first), then wait for tasks from BRAIN.`,
      ...(first ? { adopt: { pid: first.pid, pane: first.pane, sessionId: first.sessionId } } : {}) });
    for (const r of here.filter(r => r !== first && r.pane)) nodes.push({ id: uid(p.name + '-session'), name: `${p.name} session ${r.pid}`, role: 'project', parent: nodes[nodes.length - 1].id,
      cwd: r.cwd, account: acctOf(r.configDir), adopt: { pid: r.pid, pane: r.pane, sessionId: r.sessionId } });
  }
  // running sessions outside every chosen project: adopted under BRAIN as they are
  for (const r of running.filter(r => r.pane && !nodes.some(n => n.adopt && n.adopt.pid === r.pid))) {
    nodes.push({ id: uid(r.name || path.basename(r.cwd || 'session')), name: r.name || path.basename(r.cwd || 'session'), role: 'project', parent: 'brain',
      cwd: r.cwd || report.home, account: acctOf(r.configDir), adopt: { pid: r.pid, pane: r.pane, sessionId: r.sessionId } });
  }
  const config = { accounts, roles: { front: accounts[0].id, brain: accounts[0].id, fleet: accounts.map(a => a.id) }, projects };
  return { nodes, config };
}

/* ---- settings.json: the optional guard hook (a PreToolUse check on Bash commands) */
/** `node` when that is the binary running the hub (portable settings.json), else its full path. */
function nodeBin() {
  for (const d of String(process.env.PATH || '').split(':').filter(Boolean)) {
    const f = path.join(d, 'node');
    try { if (fs.realpathSync(f) === fs.realpathSync(process.execPath)) return 'node'; break; } catch {}
  }
  return process.execPath;
}
const hookEntry = (node = nodeBin()) => ({ matcher: 'Bash', hooks: [{ type: 'command', command: `${node} ${GUARD}`, timeout: 10 }] });
const hasGuard = s => ((s.hooks || {}).PreToolUse || []).some(e => (e.hooks || []).some(h => String(h.command || '').includes('hooks/guard.js')));

/** A small line diff (LCS) in unified style: lines prefixed with ' ', '-' or '+'. */
function lineDiff(a, b) {
  const x = a.split('\n'), y = b.split('\n'), m = x.length, n = y.length;
  const L = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < m && j < n) { if (x[i] === y[j]) { out.push(' ' + x[i]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push('-' + x[i++]); else out.push('+' + y[j++]); }
  while (i < m) out.push('-' + x[i++]); while (j < n) out.push('+' + y[j++]);
  return out.join('\n');
}

/** What installing the guard hook would change in each account's settings.json. Nothing is written here. */
function hookPlan(accounts, node) {
  return accounts.map(a => {
    const file = path.join(a.configDir, 'settings.json');
    let raw = '', cur = {}, error = null, exists = fs.existsSync(file);
    if (exists) { raw = fs.readFileSync(file, 'utf8'); try { cur = JSON.parse(raw || '{}'); } catch (e) { error = 'settings.json is not valid JSON: ' + e.message; } }
    if (error) return { account: a.id, file, exists, error, change: false };
    if (hasGuard(cur)) return { account: a.id, file, exists, change: false, note: 'guard hook already installed' };
    const next = JSON.parse(JSON.stringify(cur));
    next.hooks = next.hooks || {}; next.hooks.PreToolUse = [...(next.hooks.PreToolUse || []), hookEntry(node)];
    const before = exists ? JSON.stringify(cur, null, 2) : '', after = JSON.stringify(next, null, 2);
    return { account: a.id, file, exists, change: true, before, after, diff: exists ? lineDiff(before, after) : after.split('\n').map(l => '+' + l).join('\n') };
  });
}

/** Write one settings.json from a plan entry, after copying the old file to <file>.bak-<time>. */
function applyHook(plan, t = Date.now()) {
  if (!plan.change) return null;
  fs.mkdirSync(path.dirname(plan.file), { recursive: true });
  let backup = null;
  if (fs.existsSync(plan.file)) {
    const cur = JSON.stringify(JSON.parse(fs.readFileSync(plan.file, 'utf8') || '{}'), null, 2);
    if (cur !== plan.before) throw new Error(`${plan.file} changed since the diff was shown; review it again`);
    backup = `${plan.file}.bak-${t}`; fs.copyFileSync(plan.file, backup);
  }
  fs.writeFileSync(plan.file, plan.after + '\n');
  return backup;
}

/** Link bin/cmd and bin/heavy into a bin dir on PATH (default ~/.local/bin). Existing files are left alone. */
function installCli(binDir = path.join(os.homedir(), '.local', 'bin')) {
  fs.mkdirSync(binDir, { recursive: true });
  const done = [];
  for (const name of ['cmd', 'heavy', 'control-room']) {
    const to = path.join(binDir, name), from = path.join(ROOT, 'bin', name);
    let cur = null; try { cur = fs.readlinkSync(to); } catch {}
    if (cur === from) { done.push({ name, to, state: 'already linked' }); continue; }
    if (fs.existsSync(to) || cur) { done.push({ name, to, state: 'skipped: a different file is already there' }); continue; }
    fs.symlinkSync(from, to); done.push({ name, to, state: 'linked' });
  }
  return done;
}

/**
 * Apply a reviewed proposal.
 *   cfgFile    the config file to write (backed up first when it exists)
 *   prop       { nodes, config } (as proposal() made it, possibly edited by the person)
 *   hooks      the hookPlan() entries the person ticked (written with backups), or []
 *   cli        bin dir to link the CLI into, or null
 *   hub        when given (the web wizard), the agents are registered in the running hub at once
 */
function apply({ cfgFile, prop, hooks = [], cli = null, hub = null, base = {} }) {
  const raw = { ...base, accounts: prop.config.accounts, roles: prop.config.roles, projects: prop.config.projects };
  const configBackup = CONFIG.save(cfgFile, raw);
  const hookBackups = hooks.map(h => ({ file: h.file, backup: applyHook(h) }));
  const cliLinks = cli ? installCli(cli) : [];
  const registered = [];
  if (hub) {
    hub.cfg.accounts.splice(0, hub.cfg.accounts.length, ...prop.config.accounts.map(a => ({ ...a, configDir: path.resolve(CONFIG.expand(a.configDir)) })));
    hub.cfg.roles = prop.config.roles;
    hub.saveProjects(prop.config.projects);
    for (const n of prop.nodes) {
      const ex = hub.tree.nodes[n.id];
      if (ex) { Object.assign(ex, { name: n.name, account: n.account, cwd: n.cwd, brief: n.brief || ex.brief }); continue; }
      const parent = n.parent && hub.tree.nodes[n.parent] ? n.parent : n.parent === null ? null : 'brain';
      const x = hub.adopt({ id: n.id, name: n.name, role: n.role, parent, cwd: n.cwd, pane: n.adopt && n.adopt.pane, account: n.account, brief: n.brief });
      if (n.adopt && n.adopt.sessionId) x.sessionId = n.adopt.sessionId;
      registered.push(x.id);
    }
    hub.saveTree();
  }
  return { ok: true, config: cfgFile, configBackup, hooks: hookBackups, cli: cliLinks, nodes: registered };
}

module.exports = { proposal, accountsFrom, hookPlan, applyHook, lineDiff, installCli, apply, hasGuard, GUARD };

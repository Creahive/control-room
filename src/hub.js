'use strict';
/* The hub context. Every module is `function (hub)` that reads what it needs from the shared object and adds its own
 * functions to it; this file builds the object in dependency order and adds the small pieces that tie them together:
 * projects, who may see what, the rules, quiet hours and the periodic loops (watchdog). */
const fs = require('fs');
const path = require('path');
const { now, readJSON, writeJSON, oneLine } = require('./util');
const { makeTmux } = require('./tmux');
const { makeClaude } = require('./claude');
const { makeTasks } = require('./lib/tasks');
const { makeJobs } = require('./lib/jobs');
const RULES = require('./lib/rules');
const QH = require('./lib/quiet-hours');
const PARK = require('./lib/park-until');
const URG = require('./lib/urgent');
const CDONE = require('./lib/card-done');
const BUILD = require('./lib/build');
const makeMailer = require('./mailer');

function createHub(cfg, opts = {}) {
  fs.mkdirSync(cfg.dataDir, { recursive: true, mode: 0o700 });
  if (cfg.demo) {   // demo: nothing from this machine (paths, accounts, CLAUDE.md) shows on the map
    cfg.home = '/work/you';
    cfg.accounts = [{ id: 'main', label: 'Main', configDir: '/work/you/.claude', email: 'you@example.com' }, { id: 'team', label: 'Team', configDir: '/work/you/.claude-team', email: 'team@example.com' }];
    cfg.roles = { front: 'main', brain: 'main', fleet: ['team', 'main'] };
    cfg.projects = [['Webshop', 'webshop'], ['Mobile app', 'mobile-app'], ['Docs site', 'docs'], ['Data pipeline', 'pipeline']].map(([name, d]) => ({ name, cwd: '/srv/projects/' + d, notes: '' }));
    cfg.managedClaudeMd = '';
  }
  const hub = { cfg, demo: !!cfg.demo, startedAt: now(), PARK, QH, CDONE, BUILD, RULES };
  hub.URG = { ...URG, urgentError: (from, to, isAbove) => URG.urgentError(from, to, isAbove, { privileged: ['brain', 'front'] }) };
  hub.tmux = makeTmux({ ...cfg.tmux, cwd: cfg.home });
  hub.claude = makeClaude({ accounts: cfg.accounts, home: cfg.home, ownsPid: (pid, start) => hub.tmux.ownsPid(pid, start), preTrust: cfg.claude.preTrust !== false });
  hub.mailer = makeMailer(cfg);

  const log = (...a) => { if (!opts.quiet) console.log(...a); };
  hub.tasks = makeTasks({ file: path.join(cfg.dataDir, 'tasks.json'), log });
  hub.jobs = makeJobs({ file: path.join(cfg.dataDir, 'jobs.json'), log });
  hub.buildId = () => { try { return String(fs.statSync(path.join(__dirname, '..', 'public', 'app.js')).mtimeMs | 0); } catch { return '0'; } };

  require('./events')(hub);
  require('./agents')(hub);
  hub.lastLine = n => (hub.demo ? n.demoLast || '' : hub.claude.lastLine(n.sessionId));

  /* ---- projects: folders that each get one lead (dataDir/projects.json, seeded from the config) */
  const PROJ_F = path.join(cfg.dataDir, 'projects.json');
  let projects = readJSON(PROJ_F, null) || cfg.projects || [];
  hub.projects = () => projects;
  hub.saveProjects = list => { projects = list; cfg.projects = list; writeJSON(PROJ_F, list); };
  cfg.projects = projects;
  /** The project an agent works in: its own folder under a project's folder, else its nearest ancestor's. */
  hub.projectOf = n => {
    for (let x = n, i = 0; x && i < 30; x = hub.tree.nodes[x.parent], i++) {
      const p = projects.find(p => x.cwd && (x.cwd === p.cwd || x.cwd.startsWith(p.cwd + '/')));
      if (p) return p.name;
    }
    return null;
  };

  require('./prompts')(hub);
  require('./messaging')(hub);
  require('./actions')(hub);
  require('./care')(hub);
  require('./governor')(hub);
  require('./tokens')(hub);
  require('./auth')(hub);

  /* ---- who sees what: an admin everything; a member their desk, BRAIN, and agents in their projects */
  const inProjects = (u, id) => { const n = hub.tree.nodes[id]; if (!n) return false; if (u.admin) return true; const p = hub.projectOf(n); return !!p && (u.projects || []).includes(p); };
  const inView = (u, id) => u.admin || u.seeAll || inProjects(u, id);
  hub.inProjects = inProjects;
  hub.inView = inView;
  hub.visibleTo = (u, ev) => {
    if (u.admin) return true;
    const mine = [hub.deskOf(u), 'u-' + u.id];
    const hidden = id => id && ((hub.tree.nodes[id] && hub.tree.nodes[id].role === 'front' && !mine.includes(id)) || (String(id).startsWith('u-') && !mine.includes(id)));
    if (hidden(ev.from) || hidden(ev.to) || hidden(ev.agent)) return false;
    if (mine.includes(ev.from) || mine.includes(ev.to)) return true;
    const vis = id => !id || id === 'brain' || id === 'hub' || inView(u, id);
    return hub.can(u, 'map') && vis(ev.from) && vis(ev.to);
  };
  hub.snapshotFor = u => {
    const s = hub.snapshot(), mine = hub.deskOf(u);
    if (!u.admin) {
      s.nodes = s.nodes.filter(n => n.id === mine || n.user === u.id || (n.role !== 'front' && (n.id === 'brain' || (hub.can(u, 'map') && inView(u, n.id)))));
      for (const n of s.nodes) if (n.id !== mine && !(hub.can(u, 'talk') && inView(u, n.id))) n.last = '';
      for (const n of s.nodes) if (n.id !== mine && n.user !== u.id && !inProjects(u, n.id)) n.readOnly = true;
      const ok = new Set(s.nodes.map(n => n.id));
      s.tokens = { ...s.tokens, periods: Object.fromEntries(Object.entries(s.tokens.periods || {}).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([id]) => ok.has(id)))])) };
      s.limits = []; s.actionsOpen = 0;
    }
    s.users = (u.admin ? hub.users.all().filter(x => !x.disabled) : [u]).map(x => ({ id: 'u-' + x.id, uid: x.id, name: x.name, admin: !!x.admin, desk: hub.deskOf(x) }));
    s.me = { id: u.id, name: u.name, admin: !!u.admin, desk: mine, perms: hub.publicUser(u).perms, layout: u.layout || null, ui: u.ui || null };
    return s;
  };

  /* ---- rules: dataDir/rules.json, seeded from the shipped default set; their text goes into every agent prompt and,
     when config.managedClaudeMd names a file, into that CLAUDE.md */
  const RULES_F = path.join(cfg.dataDir, 'rules.json');
  let rulesDoc = RULES.load(RULES_F);
  if (!rulesDoc) { rulesDoc = RULES.load(path.join(__dirname, 'lib', 'rules.default.json')); RULES.save(RULES_F, rulesDoc); }
  hub.rulesDoc = () => rulesDoc;
  hub.rulesPrompt = () => RULES.renderPrompt(rulesDoc, { compactK: Math.round((hub.careCfg().turnCompactAt || 150000) / 1000) });
  function syncClaudeMd() {
    if (!cfg.managedClaudeMd || hub.demo) return;
    try {
      const cur = fs.existsSync(cfg.managedClaudeMd) ? fs.readFileSync(cfg.managedClaudeMd, 'utf8') : '';
      if (cur) { const a = RULES.adopt(rulesDoc, cur, now()); if (a.added.length || a.edited.length || a.off.length) RULES.save(RULES_F, rulesDoc); }
      const want = RULES.renderClaudeMd(rulesDoc);
      if (cur !== want) { fs.mkdirSync(path.dirname(cfg.managedClaudeMd), { recursive: true }); fs.writeFileSync(cfg.managedClaudeMd, want); }
    } catch (e) { console.error('[rules]', e.message); }
  }
  hub.setRule = (prov, id, on) => {
    const r = RULES.toggle(rulesDoc, id, on, prov, now());
    if (!r.changed) return { changed: false };
    RULES.save(RULES_F, rulesDoc); syncClaudeMd();
    const ce = RULES.changeEntry(r.rule, !!on, prov), cl = hub.addChange(ce.by, ce.entry);
    try { if (hub.tree.nodes.brain && !hub.tree.nodes.brain.stopped) hub.sendMessage('you', 'brain', RULES.fyiLine(r.rule, !!on, prov, cl.id), { noTask: true }); } catch {}
    return { changed: true, changelog: cl.id };
  };
  syncClaudeMd();

  /* ---- quiet hours (optional): a daily window with no agent loops */
  const qcfg = cfg.quietHours || {};
  hub.quietBlock = (n, text, fromPerson) => (QH.quiet(n, now(), qcfg) && !fromPerson && !/^\s*📨 from (BRAIN|Front desk)/.test(text || '') ? 'held for quiet hours' : null);
  hub.quietView = () => (QH.inWindow(now(), qcfg) ? { on: true, until: QH.windowEnd(now(), qcfg) } : null);

  /* ---- loops */
  const loops = [];
  const every = (ms, f, name) => loops.push(setInterval(() => { try { f(); } catch (e) { console.error(`[${name}]`, e.message); } }, ms));
  hub.startLoops = () => {
    every(2000, hub.flushPending, 'flush');
    every(60_000, hub.reconcile, 'reconcile');
    every(60_000, () => { // parks that ran out
      for (const n of Object.values(hub.tree.nodes)) if (n.parked && n.parked.until && n.parked.until <= now()) hub.unparkNode(n.id, 'hub', 'park time is up');
    }, 'parks');
    every(60_000, () => hub.jobs.tick(hub.tokenRaw()), 'jobs');
    every(15 * 60_000, () => hub.tasks.sweep(), 'tasks');
    every(60_000, keepBusy, 'keep-busy');
    every(60_000, quietTick, 'quiet');
    let tv = hub.tasks.version(), jv = hub.jobs.version(), snap = '';
    every(1000, () => {
      if (hub.tasks.version() !== tv) { tv = hub.tasks.version(); hub.broadcast('tasks', { v: tv }); }
      if (hub.jobs.version() !== jv) { jv = hub.jobs.version(); hub.broadcast('jobs', { v: jv }); }
      if (!hub.clients.size) return;
      const s = JSON.stringify(hub.snapshot().nodes.map(n => [n.id, n.state, n.queued, n.last, n.care, n.parent, n.name, !!n.parked]));
      if (s !== snap) { snap = s; hub.broadcast('tree'); }
    }, 'stream');
  };
  hub.stopLoops = () => loops.forEach(clearInterval);

  /* keep-busy (optional): an agent idle this long with an open task and no park gets one nudge per hour */
  const nudged = {};
  function keepBusy() {
    const kb = cfg.keepBusy || {};
    if (!kb.enabled || hub.demo) return;
    for (const n of Object.values(hub.tree.nodes)) {
      if (n.stopped || n.asleep || n.parked || hub.isDesk(n.id) || hub.statusOf(n).state !== 'idle') continue;
      const open = hub.tasks.items().filter(t => hub.tasks.open(t) && t.to === n.id && !t.fyi);
      if (!open.length || now() - (nudged[n.id] || 0) < 3600e3) continue;
      const last = Math.max(...open.map(t => t.deliveredAt || t.createdAt || 0));
      if (now() - last < (kb.idleMin || 30) * 60e3) continue;
      nudged[n.id] = now();
      hub.deliver(n, `[watchdog] You are idle with ${open.length} open task(s): ${open.map(t => t.id + ' ' + oneLine(t.title, 60)).join('; ')}. Continue, close them with cmd task done, or park yourself (cmd park me "why" --until ...).`);
    }
  }
  /* quiet hours: park non-exempt agents until the window ends */
  function quietTick() {
    if (!QH.inWindow(now(), qcfg)) return;
    for (const n of Object.values(hub.tree.nodes)) {
      if (!QH.quiet(n, now(), qcfg)) continue;
      const p = QH.parkFor(n, now(), x => ({ until: x.until, hold: x.hold }), qcfg);
      if (p) hub.parkNode(n.id, p.why, p.until, false);
    }
  }

  if (hub.demo) require('./demo')(hub);
  return hub;
}

module.exports = { createHub };

'use strict';
/* The agent tree: nodes.json, each agent's status, launching Claude in a tmux window, and the life-cycle verbs
 * (spawn, stop, start, restart, remove, move, rename, park). */
const fs = require('fs');
const path = require('path');
const { now, rid, readJSON, writeJSON, slug, defang } = require('./util');

const LEAKED_ENV = 'CLAUDECODE CLAUDE_CODE_CHILD_SESSION CLAUDE_CODE_SESSION_ID CLAUDE_PID CLAUDE_CODE_MESSAGING_SOCKET CLAUDE_CODE_MESSAGING_TOKEN CLAUDE_CODE_SESSION_ATTENDED CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_EXECPATH CLAUDE_EFFORT CLAUDE_CONFIG_DIR';
const ROLES = ['brain', 'front', 'lead', 'project', 'subagent', 'worker', 'topic'];
const shq = s => `'${String(s).replace(/'/g, `'\\''`)}'`;

module.exports = function agents(hub) {
  const { cfg } = hub;
  const NODES_F = path.join(cfg.dataDir, 'nodes.json');
  const PROMPTS = path.join(cfg.dataDir, 'prompts');
  fs.mkdirSync(PROMPTS, { recursive: true, mode: 0o700 });

  let tree = readJSON(NODES_F, null) || { nodes: {} };
  hub.tree = tree;
  const pending = {}, pendingAt = {};
  hub.pending = pending; hub.pendingAt = pendingAt;

  let snapCache = { at: 0, v: null };
  function saveTree() { writeJSON(NODES_F, tree); snapCache.v = null; }
  const findNode = key => tree.nodes[key] || Object.values(tree.nodes).find(n => n.name.toLowerCase() === String(key).toLowerCase() || slug(n.name) === slug(key));
  /** Is a an ancestor of b (or b itself)? */
  function isAbove(a, b) { let n = tree.nodes[b], i = 0; while (n && i++ < 30) { if (n.id === a) return true; n = tree.nodes[n.parent]; } return false; }
  const kids = id => Object.values(tree.nodes).filter(n => n.parent === id);
  const isDesk = id => id === 'front' || /^desk-/.test(id || '') || (tree.nodes[id] || {}).role === 'front';

  /* ---- accounts */
  function usable(id) { const a = hub.claude.acct(id); return !!a && hub.claude.signedIn(id); }
  function accountFor(n) {
    if (n.account && hub.claude.acct(n.account)) return n.account;
    const r = cfg.roles || {};
    if (n.role === 'front' && r.front) return r.front;
    if (n.role === 'brain' && r.brain) return r.brain;
    const fleet = [].concat(r.fleet || []).filter(a => hub.claude.acct(a));
    return fleet.find(usable) || fleet[0] || (cfg.accounts[0] || {}).id;
  }

  /* ---- launch */
  function launchCmd(n, resume) {
    const acc = hub.claude.acct(accountFor(n));
    hub.claude.ensureTrust(acc && acc.id, n.cwd);
    if (resume && !hub.claude.hasTranscript(resume)) {
      hub.logEvent({ type: 'care', from: 'hub', to: n.id, text: `${n.name}: session ${resume.slice(0, 8)} has no transcript, started fresh` });
      resume = null;
      handoffFresh(n);
    }
    const pf = path.join(PROMPTS, n.id + '.md');
    fs.writeFileSync(pf, hub.promptFor(n), { mode: 0o600 });
    const env = [`CMD_AGENT_ID=${n.id}`, `CMD_HUB_DATA=${shq(cfg.dataDir)}`, `PATH=${shq(path.join(__dirname, '..', 'bin'))}:"$PATH"`];
    if (acc && path.resolve(acc.configDir) !== path.join(require('os').homedir(), '.claude')) env.push(`CLAUDE_CONFIG_DIR=${shq(acc.configDir)}`);
    if (cfg.claude.tmpDir) env.push(`CLAUDE_CODE_TMPDIR=${shq(cfg.claude.tmpDir)}`);
    const model = n.model ? ' --model ' + shq(n.model) : n.role === 'front' && cfg.claude.frontModel ? ' --model ' + shq(cfg.claude.frontModel) : '';
    const deny = (cfg.claude.disallowedTools || []).length && n.role !== 'front' && n.role !== 'brain' ? ' --disallowedTools ' + cfg.claude.disallowedTools.map(shq).join(' ') : '';
    const src = cfg.claude.settingSources ? ' --setting-sources ' + shq(cfg.claude.settingSources) : '';
    return `unset ${LEAKED_ENV}; export ${env.join(' ')}; ${cfg.claude.bin}${model}${deny}${src} --name ${shq(slug(n.name))}` +
      (resume ? ` --resume ${shq(resume)}` : '') + ` --append-system-prompt "$(cat ${shq(pf)})"`;
  }
  /** A relaunch that cannot resume starts fresh: hand it its open tasks and its parent's last message. */
  function handoffFresh(n) {
    try {
      const open = hub.tasks.items().filter(t => hub.tasks.open(t) && t.to === n.id && !t.fyi).slice(-5).map(t => `${t.id} from ${t.from}: ${String(t.title || t.text || '').slice(0, 160)}`);
      const last = hub.recentEvents(4000).filter(e => e.type === 'msg' && e.from === n.parent && e.to === n.id).slice(-1)[0];
      const parts = ['[hub] This session was relaunched fresh (its old conversation could not be resumed). Your role and brief are unchanged.'];
      if (open.length) parts.push('Open tasks for you:\n' + open.join('\n'));
      if (last) parts.push(`Last message from ${n.parent}:\n${String(last.text).slice(0, 1500)}`);
      parts.push(open.length || last ? 'Continue the open work.' : 'Nothing open; acknowledge in one line.');
      (pending[n.id] = pending[n.id] || []).push(parts.join('\n\n'));
    } catch (e) { console.error('handoffFresh', n.id, e.message); }
  }
  function launch(n, resume) {
    if (hub.demo) { n.pane = 'demo'; n.launchedAt = now(); n.stopped = false; delete n.asleep; saveTree(); return true; }
    const pane = hub.tmux.newWindow(n.id, n.cwd || cfg.home);
    if (!pane) return false;
    hub.tmux.runLine(pane, launchCmd(n, resume));
    n.pane = pane; n.launchedAt = now(); n.stopped = false; delete n.asleep;
    saveTree();
    return true;
  }

  /* ---- status */
  function statusOf(n) {
    if (n.stopped) return { state: 'stopped' };
    if (hub.demo) return { state: n.asleep ? 'asleep' : n.demoState || 'idle', sessionId: n.sessionId, account: n.account || 'main' };
    const T = hub.tmux;
    if (n.asleep) {
      if (now() - n.asleep.at > 60000 && T.paneAlive(n.pane) && T.paneCmd(n.pane) === 'claude') { delete n.asleep; saveTree(); }
      else return { state: 'asleep' };
    }
    if (!T.paneAlive(n.pane)) return { state: 'offline' };
    const s = hub.claude.sessionsNow()[n.pane];
    if (s) {
      if (n.sessionId && n.sessionId !== s.sessionId) { n.sessions = [...new Set([...(n.sessions || []), n.sessionId])].slice(-60); n.sessionId = s.sessionId; saveTree(); }
      n.sessionId = s.sessionId;
      if (!hub.claude.signedIn(s.account)) return { state: 'login', sessionId: s.sessionId, account: s.account, pid: s.pid };
      return { state: s.status === 'busy' ? 'working' : 'idle', sessionId: s.sessionId, account: s.account, pid: s.pid };
    }
    const scr = T.screen(n.pane, 30);
    // the trust prompt for a folder the hub chose: answer yes
    if (/Yes, I trust this folder/.test(scr) && !(n._trustAt && now() - n._trustAt < 15000)) {
      const onYes = /❯\s*(\d\.\s*)?Yes, I trust this folder/.test(scr);
      n._trustAt = now(); if (!onYes) T.tmux('send-keys', '-t', n.pane, /❯\s*(\d\.\s*)?No, exit[\s\S]*Yes, I trust/.test(scr) ? 'Down' : 'Up');
      setTimeout(() => T.tmux('send-keys', '-t', n.pane, 'Enter'), 400);
      return { state: 'starting' };
    }
    if (/\/login|Select login method|Paste code here|Not logged in/i.test(scr)) return { state: 'login' };
    if (T.paneCmd(n.pane) !== 'claude' && now() - (n.launchedAt || 0) > 20000) return { state: 'offline' };
    return { state: 'starting' };
  }

  /* ---- life cycle */
  function spawnChild(parentId, { name, role, cwd, brief, account }) {
    const parent = tree.nodes[parentId];
    if (!parent) throw new Error('unknown parent ' + parentId);
    if (!name) throw new Error('name required');
    role = ROLES.includes(role) ? role : 'worker';
    const proj = (cfg.projects || []).find(p => slug(p.name) === slug(name));
    if (proj && (role === 'lead' || !cwd)) cwd = proj.cwd;
    const existing = Object.values(tree.nodes).find(n => !n.stopped && slug(n.name) === slug(name));
    if (existing) return { node: existing, reused: true };
    const old = Object.values(tree.nodes).find(n => n.stopped && slug(n.name) === slug(name));
    if (old) {
      old.parent = parentId; old.stopped = false; delete old.stoppedAt; if (brief) old.brief = brief;
      startNode(old.id);
      if (brief) (pending[old.id] = pending[old.id] || []).push(`📨 from ${parent.name} [${parent.id}]:\n${defang(brief)}\n(reply with: cmd send ${parent.id} "...")`);
      hub.logEvent({ type: 'spawn', from: parentId, to: old.id, text: 'revived: ' + (brief || name).slice(0, 200) });
      return { node: old, reused: true, revived: true };
    }
    if (cwd && !fs.existsSync(cwd)) throw new Error('cwd does not exist: ' + cwd);
    let id = slug(name); while (tree.nodes[id]) id = slug(name) + '-' + rid(2);
    const n = { id, name, role, parent: parentId, cwd: cwd || parent.cwd || cfg.home, brief: brief || '', createdAt: now(), ...(account ? { account } : {}) };
    tree.nodes[id] = n; saveTree();
    launch(n);
    hub.logEvent({ type: 'spawn', from: parentId, to: id, text: brief ? brief.slice(0, 200) : name });
    if (brief) (pending[id] = pending[id] || []).push(`📨 from ${parent.name} [${parent.id}]:\n${defang(brief)}\n(reply with: cmd send ${parent.id} "...")`);
    return { node: n, reused: false };
  }
  /** Add an agent the hub did not start (an existing Claude session in a tmux pane found at setup). */
  function adopt({ id, name, role, parent, cwd, pane, account, brief }) {
    id = slug(id || name); while (tree.nodes[id]) id = slug(name) + '-' + rid(2);
    const n = { id, name, role: ROLES.includes(role) ? role : 'lead', parent: parent || null, cwd: cwd || cfg.home, brief: brief || '', createdAt: now(), adopted: true, ...(pane ? { pane } : { stopped: true }), ...(account ? { account } : {}) };
    tree.nodes[id] = n; saveTree();
    hub.logEvent({ type: 'spawn', from: parent || 'hub', to: id, text: pane ? 'adopted a running session' : 'registered' });
    return n;
  }
  function stopNode(id) {
    const n = tree.nodes[id]; if (!n) throw new Error('unknown ' + id);
    if (!hub.demo && n.pane) hub.tmux.kill(n.pane);
    n.stopped = true; n.stoppedAt = now(); delete n.asleep; delete pending[id]; delete pendingAt[id];
    saveTree();
    hub.logEvent({ type: 'stop', from: 'hub', to: id, text: 'stopped' });
  }
  function startNode(id) {
    const n = tree.nodes[id]; if (!n) throw new Error('unknown ' + id);
    n.stopped = false; delete n.stoppedAt;
    if (!hub.demo && hub.tmux.paneAlive(n.pane) && hub.tmux.paneCmd(n.pane) === 'claude') { saveTree(); return; }
    launch(n, n.sessionId);
    hub.logEvent({ type: 'spawn', from: 'hub', to: id, text: 'restarted' });
  }
  function restartNode(id) {
    const n = tree.nodes[id]; if (!n) throw new Error('unknown ' + id);
    if (!hub.demo && n.pane) hub.tmux.kill(n.pane);
    launch(n, n.sessionId);
    hub.logEvent({ type: 'spawn', from: 'hub', to: id, text: 'restarted' });
  }
  function removeNode(id) {
    const n = tree.nodes[id]; if (!n) throw new Error('unknown ' + id);
    if (!n.stopped) throw new Error('stop it first');
    for (const k of kids(id)) k.parent = n.parent;
    delete tree.nodes[id]; saveTree();
    hub.logEvent({ type: 'stop', from: 'hub', to: id, text: 'removed from the map' });
  }
  function moveNode(id, parentId, role) {
    const n = tree.nodes[id], p = tree.nodes[parentId];
    if (!n || !p) throw new Error('unknown agent');
    if (isAbove(id, parentId)) throw new Error('cannot move an agent under its own branch');
    n.parent = parentId; if (role && ROLES.includes(role)) n.role = role; saveTree();
    return { ok: true };
  }
  function renameNode(id, name) {
    const n = tree.nodes[id]; if (!n) throw new Error('unknown ' + id);
    n.name = String(name).trim().slice(0, 60) || n.name; saveTree();
    return { ok: true, name: n.name };
  }

  /* ---- park: an agent with no work for now; keep-busy leaves it alone until the park ends */
  function parkNode(id, why, until, hold) {
    const n = tree.nodes[id]; if (!n) throw new Error('unknown ' + id);
    n.parked = { at: now(), why: String(why || '').slice(0, 300), until: until || now() + 12 * 3600e3, hold: !!hold };
    saveTree();
    hub.logEvent({ type: 'care', from: 'hub', to: id, text: `parked until ${new Date(n.parked.until).toISOString().slice(0, 16)}Z: ${n.parked.why}` });
    return n.parked;
  }
  function unparkNode(id, by, why) {
    const n = tree.nodes[id]; if (!n || !n.parked) return false;
    delete n.parked; saveTree();
    hub.logEvent({ type: 'care', from: by || 'hub', to: id, text: 'unparked' + (why ? ': ' + why : '') });
    return true;
  }

  /** The two top agents exist from the start: BRAIN (the root) and the admin's front desk. */
  function ensureCore(adminId = 'owner') {
    let ch = false;
    if (!tree.nodes.brain) { tree.nodes.brain = { id: 'brain', name: 'BRAIN', role: 'brain', parent: null, cwd: cfg.home, createdAt: now(), stopped: true, brief: 'Route work to the right project lead, create leads on demand, and keep the big picture.' }; ch = true; }
    if (!tree.nodes.front) { tree.nodes.front = { id: 'front', name: 'Front desk', role: 'front', parent: null, user: adminId, cwd: cfg.home, createdAt: now(), stopped: true, brief: 'Talk with the person in the browser and delegate real work to BRAIN.' }; ch = true; }
    if (ch) saveTree();
  }

  /** Relaunch agents whose pane went away, once a minute (not stopped, not asleep). */
  function reconcile() {
    if (hub.demo) return;
    for (const n of Object.values(tree.nodes)) {
      if (n.stopped || n.asleep) continue;
      if (!hub.tmux.paneAlive(n.pane)) { launch(n, n.sessionId); hub.logEvent({ type: 'care', from: 'hub', to: n.id, text: `${n.name} was offline, relaunched` }); }
    }
  }

  /** Hand queued messages to agents that take input now. */
  function flushPending() {
    for (const [id, q] of Object.entries(pending)) {
      const n = tree.nodes[id];
      if (!n || !q.length) { delete pending[id]; delete pendingAt[id]; continue; }
      if (n.stopped || n.asleep || hub.careHolds(n)) continue;
      const st = statusOf(n);
      if (st.state !== 'idle') continue;
      const text = q.splice(0, q.length).join('\n\n');
      delete pendingAt[id];
      hub.typeInto(n, text);
      try { hub.tasks.delivered(id, [text]); } catch {}
    }
  }

  /* ---- snapshot (shared 1.5 s between browsers) */
  function snapshotRaw() {
    const nodes = Object.values(tree.nodes).map(n => {
      const st = statusOf(n);
      return {
        id: n.id, name: n.name, role: n.role, parent: n.parent, cwd: n.cwd, account: st.account || accountFor(n),
        state: st.state, sessionId: n.sessionId || null, last: n.sessionId ? hub.lastLine(n) : '',
        queued: (pending[n.id] || []).length, subagents: hub.demo ? (n.demoSubs || []) : hub.claude.subagents(n.sessionId), createdAt: n.createdAt, user: n.user || null,
        stoppedAt: n.stopped ? n.stoppedAt || null : null, ctx: hub.contextTokens(n), care: hub.careOp(n.id),
        parked: n.parked ? { until: n.parked.until, why: n.parked.why } : null,
      };
    });
    return { nodes, at: now(), build: hub.buildId(), demo: !!hub.demo, actionsOpen: hub.actions.openCount(), actionsAt: hub.actions.lastAt(),
      tokens: hub.tokenStats(), limits: hub.limitsView(nodes), quiet: hub.quietView ? hub.quietView() : null };
  }
  function snapshot() {
    if (!snapCache.v || now() - snapCache.at > 1500) { snapCache.v = snapshotRaw(); snapCache.at = now(); }
    return structuredClone(snapCache.v);
  }

  Object.assign(hub, { saveTree, findNode, isAbove, kids, isDesk, accountFor, launch, launchCmd, statusOf, spawnChild, adopt, stopNode, startNode, restartNode,
    removeNode, moveNode, renameNode, parkNode, unparkNode, ensureCore, reconcile, flushPending, snapshot, ROLES });
};

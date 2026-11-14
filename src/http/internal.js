'use strict';
/* The agent API (/internal/<verb>) the `cmd` CLI talks to. Caller identity: body.me (the CMD_AGENT_ID the hub set when
 * it launched that agent, or "you" for a shell). Access: the x-cmd-token header must match <dataDir>/internal.token,
 * a file only the hub's user can read. */
const fs = require('fs');
const { now, oneLine, fmtK } = require('../util');
const { send } = require('./util');
const CAP = require('../lib/cap');

module.exports = function internalRoutes(hub) {
  const { tree } = hub;
  const watching = new Map();   // pid -> { task, agent, note }

  /** cmd task wait: tell the agent when the pid it waits on exits. */
  setInterval(() => {
    for (const [pid, w] of watching) {
      let alive = true; try { process.kill(pid, 0); } catch (e) { alive = e.code === 'EPERM'; }
      if (alive) continue;
      watching.delete(pid);
      const n = tree.nodes[w.agent]; if (n && !n.stopped) hub.deliver(n, `[job-done] ${w.task} pid ${pid} exited${w.note ? ' (' + w.note + ')' : ''}. Check its output and continue.`);
    }
  }, 5000).unref();

  const mayManage = (me, id) => me === 'you' || me === 'brain' || (me !== id && hub.isAbove(me, id));
  const need = (v, what) => { if (v === undefined || v === null || String(v).trim() === '') throw new Error(what + ' required'); return v; };
  function treeText() {
    const s = hub.snapshot(), by = {};
    for (const n of s.nodes) (by[n.parent || ''] = by[n.parent || ''] || []).push(n);
    const lines = [];
    const walk = (pid, d) => { for (const n of (by[pid] || []).sort((a, b) => a.createdAt - b.createdAt)) {
      lines.push(`${'  '.repeat(d)}${n.name} [${n.id}] ${n.role} · ${n.state}${n.parked ? ' · parked' : ''}${n.queued ? ` · ${n.queued} queued` : ''}${n.cwd ? ' · ' + n.cwd : ''}`);
      walk(n.id, d + 1);
    } };
    walk('', 0);
    return lines.join('\n') || '(no agents yet)';
  }

  const verbs = {
    health: () => ({ ok: true, at: now(), demo: hub.demo }),
    tree: () => ({ text: treeText(), nodes: hub.snapshot().nodes }),
    spawn: (me, b) => {
      const parent = me === 'you' ? b.parent || 'brain' : me;
      const r = hub.spawnChild(parent, { name: need(b.name, 'name'), role: b.role, cwd: b.cwd, brief: b.brief, account: b.account });
      return { id: r.node.id, reused: r.reused, revived: !!r.revived };
    },
    send: (me, b) => hub.sendMessage(me, need(b.to, 'to'), need(b.text, 'text'), { urgent: !!b.urgent, title: b.title }),
    done: (me, b) => hub.done(me, String(b.text || 'done')),
    tasks: me => ({ items: hub.tasks.items().filter(t => hub.tasks.open(t) && (t.to === me || t.from === me)).map(t => hub.tasks.pub(t)) }),
    task: (me, b) => {
      const T = hub.tasks, t = T.get(String(need(b.id, 'task id')).toUpperCase());
      if (!t) throw new Error('no task ' + b.id);
      if (b.op === 'done') { if (t.to !== me && !mayManage(me, t.to)) throw new Error(`${t.id} is not yours`); T.finish(t, String(b.text || 'done'), me); return T.pub(t); }
      if (b.op === 'wait') { const pid = +b.pid; if (!pid) throw new Error('--pid required'); watching.set(pid, { task: t.id, agent: me, note: b.note || '' }); T.note(t, me, `waiting on pid ${pid}${b.note ? ': ' + b.note : ''}`); return { ok: true, watching: pid }; }
      if (b.op === 'cancel') { T.cancel(t, me, hub.pullQueued); return T.pub(t); }
      return T.pub(t);
    },
    job: (me, b) => {
      const J = hub.jobs, op = b.op;
      if (op === 'list') return { items: J.list({ all: !!b.all, limit: 50 }).map(J.pub) };
      if (op === 'new') { const j = J.create({ title: need(b.title, 'title'), ask: b.ask || '', owner: b.to || me, by: me, budget: b.budget }); return J.pub(j); }
      let j = b.id ? J.get(b.id) : J.activeOf(me);
      if (op === 'start') {
        if (!j && b.title) j = J.create({ title: b.title, owner: me, by: me });
        if (!j) throw new Error('cmd job start "<title>" or J-<n>');
        if (j.owner !== me && !mayManage(me, j.owner)) throw new Error(`${j.id} belongs to ${j.owner}`);
        J.start(j, me, me); return J.pub(j);
      }
      if (!j) throw new Error('no active job: cmd job start "<title>" first');
      if (j.owner !== me && !mayManage(me, j.owner) && !(j.agents || []).includes(me)) throw new Error(`${j.id} belongs to ${j.owner}`);
      if (op === 'step') { J.step(j, me, need(b.text, 'text'), { pct: b.pct != null ? +b.pct : undefined, next: b.next }); return J.pub(j); }
      if (op === 'wait') { J.wait(j, me, b.on || 'agent', b.text || ''); return J.pub(j); }
      if (op === 'done') { J.done(j, me, String(b.text || 'done')); return J.pub(j); }
      if (op === 'cancel') { J.cancel(j, me, b.text || ''); return J.pub(j); }
      return J.pub(j);
    },
    ask: (me, b) => { const it = hub.actions.ask(me, b); return { id: it.id }; },
    actions: me => ({ items: hub.actions.recent().filter(i => me === 'you' || me === 'brain' || i.from === me).map(i => ({ id: i.id, title: i.title, status: i.status, from: i.from })) }),
    reply: (me, b) => { const it = hub.actions.get(need(b.id, 'card id')); if (!it) throw new Error('no card ' + b.id); hub.actions.chat(it, me, need(b.text, 'text')); return { ok: true }; },
    resolve: (me, b) => { const it = hub.actions.get(need(b.id, 'card id')); if (!it) throw new Error('no card ' + b.id); hub.actions.resolve(it, me, b.text); return { ok: true }; },
    withdraw: (me, b) => { const it = hub.actions.get(need(b.id, 'card id')); if (!it) throw new Error('no card ' + b.id); hub.actions.withdraw(it, me, b.text); return { ok: true }; },
    changelog: (me, b) => hub.addChange(me, b),
    cap: (me, b) => {
      const since = CAP.sinceMs(b.since || '00:00', now());
      const r = CAP.count({ items: hub.changelogItems(), nodes: tree.nodes, agent: me, tree: !!b.tree, since });
      return { ...r, max: +b.max || null, over: b.max != null && r.count >= +b.max };
    },
    stop: (me, b) => { if (!mayManage(me, b.id)) throw new Error('stop is for an agent above ' + b.id); hub.stopNode(b.id); return { ok: true }; },
    start: (me, b) => { if (!mayManage(me, b.id)) throw new Error('start is for an agent above ' + b.id); hub.startNode(b.id); return { ok: true }; },
    restart: (me, b) => { if (!mayManage(me, b.id)) throw new Error('restart is for an agent above ' + b.id); hub.restartNode(b.id); return { ok: true }; },
    remove: (me, b) => { if (!mayManage(me, b.id)) throw new Error('remove is for an agent above ' + b.id); hub.removeNode(b.id); return { ok: true }; },
    move: (me, b) => { if (!mayManage(me, b.id)) throw new Error('move is for an agent above ' + b.id); return hub.moveNode(b.id, need(b.parent, 'parent'), b.role); },
    rename: (me, b) => { if (!mayManage(me, b.id)) throw new Error('rename is for an agent above ' + b.id); return hub.renameNode(b.id, need(b.name, 'name')); },
    park: (me, b) => {
      const id = b.id === 'me' ? me : b.id;
      if (id !== me && !mayManage(me, id)) throw new Error('park is for the agent itself or one above it');
      const at = now(), until = b.until ? hub.PARK.parseUntil(b.until, at, null, (hub.cfg.quietHours || {}).tz || 'UTC') : at + 12 * 3600e3;
      if (!(until > at)) throw new Error('could not read --until ' + b.until + ' (use 2026-11-04, "2026-11-04 13:30", 12h or 3d; it must be in the future)');
      if (id === me) { const e = hub.PARK.selfParkError({ until: b.until, hold: !!b.hold, ts: until, at, open: hub.tasks.items().filter(t => hub.tasks.open(t) && t.to === me && !t.fyi).map(t => t.id) }); if (e) throw new Error(e); }
      return hub.parkNode(id, need(b.why, 'why'), until, !!b.hold);
    },
    unpark: (me, b) => ({ ok: hub.unparkNode(b.id === 'me' ? me : b.id, me) }),
    context: me => {
      const n = tree.nodes[me], tok = hub.tokenStats().periods || {};
      const ctx = n ? hub.contextTokens(n) : 0;
      return { context: ctx, contextK: fmtK(ctx), today: ((tok.today || {})[me] || {}).t || 0, month: ((tok.month || {})[me] || {}).t || 0 };
    },
    compact: (me, b) => hub.queueCare(b.agent && mayManage(me, b.agent) ? b.agent : me, { kind: 'compact', focus: b.text || '', by: me }),
    clear: (me, b) => hub.queueCare(b.agent && mayManage(me, b.agent) ? b.agent : me, { kind: 'clear', note: b.text, by: me }),
    limits: () => ({ accounts: hub.limitsView(hub.snapshot().nodes), note: 'Usage limits are shown by Claude Code itself (/usage in a session); the hub lists sign-in state only.' }),
  };

  return async function route(req, res, p, b) {
    const verb = p.slice('/internal/'.length);
    const f = Object.prototype.hasOwnProperty.call(verbs, verb) && verbs[verb];
    if (!f) return send(res, 404, { error: 'unknown command ' + verb });
    const me = String(b.me || 'you');
    if (me !== 'you' && !tree.nodes[me]) return send(res, 403, { error: `unknown agent ${me} (CMD_AGENT_ID)` });
    try { return send(res, 200, (await f(me, b)) || { ok: true }); }
    catch (e) { return send(res, 400, { error: oneLine(e.message, 500) }); }
  };
};
module.exports.readToken = f => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return null; } };

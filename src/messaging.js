'use strict';
/* Messages between agents and people: provenance header, task bookkeeping, delivery now or into the agent's queue. */
const { now, defang } = require('./util');

const URGENT_WORDS = /\b(urgent|asap)\b|^\s*\[(watchdog|actions)/i;

module.exports = function messaging(hub) {
  const { tree, pending, pendingAt } = hub;
  const urgentLog = {};
  const queue = (n, text) => { (pending[n.id] = pending[n.id] || []).push(text); pendingAt[n.id] = pendingAt[n.id] || now(); };

  function typeInto(n, text) {
    if (hub.demo) return hub.demoDeliver(n, text);
    hub.tmux.typeInto(n.pane, text);
  }

  /** Deliver now if the agent takes input, else queue it (and wake a sleeping agent). */
  function deliver(n, text, fromPerson) {
    if (hub.quietBlock) { const q = hub.quietBlock(n, text, fromPerson); if (q) { queue(n, text); return q; } }
    if (!n.asleep && !n.stopped && hub.careHolds(n) && !fromPerson) { queue(n, text); return 'queued until its compact runs'; }
    if (n.asleep && !n.stopped) { queue(n, text); hub.wakeNode(n, fromPerson ? 'message from a person' : 'message'); return 'queued'; }
    const st = hub.statusOf(n);
    if (st.state === 'idle' || st.state === 'working') { typeInto(n, text); return 'delivered'; }
    queue(n, text);
    return 'queued';
  }
  /** A task to an agent that is mid-turn waits in the queue (visible, cancellable) until the turn ends. */
  function deliverTask(n, body, text, fromPerson) {
    if (!n.asleep && !URGENT_WORDS.test(text || '') && hub.statusOf(n).state === 'working') { queue(n, body); return 'queued'; }
    return deliver(n, body, fromPerson);
  }
  /** --urgent: typed in now even mid-turn (Claude Code takes it as an interjection). */
  function urgentDeliver(n, body) {
    if (n.stopped) throw new Error(`${n.name} is stopped`);
    if (n.asleep) { queue(n, body); hub.wakeNode(n, 'urgent message'); return 'queued (waking)'; }
    typeInto(n, body);
    return 'delivered (urgent)';
  }

  /** Does this message open a task? A request from above (a person, a desk, an ancestor), unless it only informs. */
  function taskFor(from, to, text, meta) {
    const T = hub.tasks;
    if (T.isFyi(text)) return null;
    const fromNode = tree.nodes[from.id];
    const fromAbove = !!from.ev || from.id === 'you' || hub.isDesk(from.id) || (fromNode && hub.isAbove(from.id, to.id) && from.id !== to.id);
    if (!fromAbove) return null;
    const named = T.mentioned ? T.mentioned(text) : [];
    const own = named.find(t => t.to === to.id && T.open(t));
    if (own) { T.note(own, from.ev || from.id, text); return null; }
    const parent = named.find(t => t.to === from.id && T.open(t)) || null;
    return T.create({ from: from.id, to: to.id, text, parent: parent ? parent.id : null, by: from.ev || from.id, ...(meta || {}) });
  }
  /** A message that is not a task: a report closing one, or a reply on one. */
  function taskAfter(from, to, text) {
    const T = hub.tasks;
    if (hub.isAbove(to.id, from.id) && /^\s*(✅|done\b)/i.test(text) && T.doneBy(from.id, text)) return;
    T.replied(from.id, to.id, text);
  }

  /** fromId: an agent id, 'you' (a shell), or 'u:<userId>' (a person in the browser). */
  function sendMessage(fromId, toKey, text, opts = {}) {
    const to = hub.findNode(toKey);
    if (!to) throw new Error('no agent named ' + toKey);
    if (to.stopped) throw new Error(`${to.name} is stopped`);
    text = String(text || '');
    if (!text.trim()) return { to: to.id, result: 'dropped: empty message' };
    let from;
    if (String(fromId).startsWith('u:')) {
      const u = hub.users.get(fromId.slice(2));
      if (!u) throw new Error('unknown user');
      const desk = tree.nodes[hub.deskOf(u)];
      if (to.id === hub.deskOf(u) || (to.user === u.id)) {   // a person talking to their own desk: plain text, as typed
        const r = deliver(to, text, true);
        hub.logEvent({ type: 'msg', from: 'u-' + u.id, to: to.id, text: text.slice(0, 240) });
        return { to: to.id, result: r };
      }
      from = { id: desk ? desk.id : 'front', name: u.admin ? 'Admin' : u.name, ev: 'u-' + u.id };
      if (opts.branch) from.branchAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    } else from = tree.nodes[fromId] ? { id: fromId, name: tree.nodes[fromId].name } : { id: fromId, name: fromId === 'you' ? 'a shell' : fromId };

    if (opts.urgent) {
      const e = hub.URG.urgentError({ id: from.id, role: (tree.nodes[from.id] || {}).role }, to, hub.isAbove);
      if (e) throw new Error(e);
      const rc = hub.URG.rateCheck(urgentLog[from.id], now());
      if (!rc.ok) throw new Error(`--urgent limit reached; next in ${rc.retryMin} min (send it without --urgent)`);
      urgentLog[from.id] = rc.log;
    }
    let task = null;
    try { task = opts.task || (opts.noTask ? null : taskFor(from, to, text, opts.title ? { title: opts.title, desc: opts.desc } : null)); } catch (e) { console.error('[tasks] taskFor:', e.message); }
    const reply = opts.branch && from.ev ? 'a person wrote this in your branch of their chat and reads your answer right there: answer in plain text in this turn'
      : from.id === 'you' ? 'it came from a shell, not an agent; reply with cmd send front "..." or cmd ask' : `reply with: cmd send ${from.id} "..."`;
    const hint = task ? `; task ${task.id}: cmd task done ${task.id} "<result>" when finished` : '';
    const body = `📨 from ${from.name} [${from.branchAt ? 'branch, ' + from.branchAt : from.id}]:\n${opts.urgent ? '[urgent] ' : ''}${defang(text)}\n(${reply}${hint})`;
    if (task) task.body = body;
    try { hub.jobs.mention(to.id, text, from.ev || from.id); } catch {}
    // a real task means the agent has work again: a person or an agent above it ends a park that is not a hold
    if (task && to.parked && (from.ev || (!to.parked.hold && hub.isAbove(from.id, to.id)))) hub.unparkNode(to.id, from.ev || from.id, `new task ${task.id}`);
    const r = opts.urgent ? urgentDeliver(to, body) : task ? deliverTask(to, body, text, !!from.ev) : deliver(to, body, !!from.ev);
    try { if (task) hub.tasks.delivery(task, r); else if (!opts.noTask) taskAfter(from, to, text); } catch (e) { console.error('[tasks] delivery:', e.message); }
    hub.logEvent({ type: 'msg', from: from.ev || from.id, to: to.id, text: text.slice(0, 240) });
    return { to: to.id, result: r, task: task ? task.id : undefined };
  }

  /** cmd done: close the newest open task of the agent and report to its parent. */
  function done(id, text) {
    const n = tree.nodes[id];
    try { hub.tasks.doneBy(id, text || 'done'); } catch {}
    try { const j = hub.jobs.activeOf(id); if (j) hub.jobs.autoStep(id, 'cmd done: ' + (text || 'done')); } catch {}
    if (n && n.parent && tree.nodes[n.parent] && !tree.nodes[n.parent].stopped) sendMessage(id, n.parent, '✅ DONE: ' + text, { noTask: true });
    hub.logEvent({ type: 'done', from: id, to: n && n.parent, text: String(text || '').slice(0, 240) });
    return { ok: true };
  }

  /** Remove queued (not yet delivered) copies of a task's body. */
  function pullQueued(t) {
    const q = pending[t.to]; if (!q || !t.body) return false;
    const i = q.indexOf(t.body); if (i < 0) return false;
    q.splice(i, 1); return true;
  }

  Object.assign(hub, { typeInto, deliver, sendMessage, done, pullQueued });
};

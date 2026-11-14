'use strict';
/* Context care. Every turn re-reads the whole conversation, so a long one makes every message expensive. Agents ask the
 * hub to run /compact or /clear on them once their turn ends (cmd compact / cmd clear "handoff note"); a /clear keeps the
 * role prompt (it is --append-system-prompt) and the hub hands the note back. As a safety net the hub compacts an agent
 * that sits idle above a threshold. Nothing runs mid-turn: only idle agents are touched. Also: the changelog. */
const fs = require('fs');
const path = require('path');
const { now, readJSON, writeJSON, fmtK } = require('./util');

const COMPACT_FOCUS = 'Keep: your role and brief, open tasks and who asked for them, decisions made, file paths and ids you still need, anything you promised to report back. Drop finished tool output and resolved detail.';

module.exports = function care(hub) {
  const { cfg, tree, pending, pendingAt } = hub;
  const D = cfg.dataDir;
  const OPS_F = path.join(D, 'care-ops.json'), CARE_F = path.join(D, 'care.json'), NOTES = path.join(D, 'notes');
  let careCfg = { ...cfg.care, ...(readJSON(CARE_F, {}) || {}) };
  const ops = readJSON(OPS_F, {}) || {};
  const idleSince = {};
  const saveOps = () => writeJSON(OPS_F, ops);
  const exempt = id => (careCfg.turnExempt || []).some(p => p.endsWith('*') ? id.startsWith(p.slice(0, -1)) : id === p);

  function contextTokens(n) {
    if (hub.demo) return n.demoCtx || 0;
    return n.sessionId ? (hub.claude.contextOf(n.sessionId) || {}).tokens || 0 : 0;
  }
  function queueCare(id, op) {
    const n = tree.nodes[id]; if (!n || n.stopped) throw new Error('unknown or stopped agent ' + id);
    if (op.kind === 'clear' && String(op.note || '').trim().length < 15) throw new Error('cmd clear needs a handoff note (what is still open, who to report to), at least a sentence');
    ops[id] = { ...op, at: now() }; saveOps();
    if (n.asleep) { hub.wakeNode(n, 'queued ' + op.kind); return { queued: op.kind, when: 'after it wakes' }; }
    return { queued: op.kind, when: hub.statusOf(n).state === 'idle' ? 'now' : 'when its current turn ends' };
  }
  /** Messages wait while a compact is queued, so they land in the compacted session. */
  const careHolds = n => !!(ops[n.id] && ops[n.id].kind === 'compact');

  function deliverAfterClear(n, oldSid, text, tries = 0) {
    const st = hub.statusOf(n);
    const fresh = !oldSid || (st.sessionId && st.sessionId !== oldSid);
    if ((!fresh || st.state !== 'idle') && tries < 15) return setTimeout(() => deliverAfterClear(n, oldSid, text, tries + 1), 2000);
    hub.typeInto(n, text);
  }

  function runOnce() {
    if (hub.demo) return;
    for (const n of Object.values(tree.nodes)) {
      if (n.stopped || n.asleep) continue;
      const sn = hub.statusOf(n);
      if (sn.state !== 'idle') { delete idleSince[n.id]; continue; }
      idleSince[n.id] = idleSince[n.id] || now();
      let op = ops[n.id];
      if (!op && (pending[n.id] || []).length) continue;
      const ctx = n.sessionId ? hub.claude.contextOf(n.sessionId) : null;
      const idleMs = now() - idleSince[n.id], cool = now() - (n.caredAt || 0) >= careCfg.cooldownMin * 60_000;
      if (!op && careCfg.auto && ctx && !ctx.compacted && cool) {
        if (ctx.tokens >= careCfg.compactAt && idleMs >= careCfg.idleSec * 1000) op = { kind: 'compact', by: 'hub', auto: 'idle above ' + fmtK(careCfg.compactAt) };
        else if (careCfg.turnCompactAt && ctx.tokens >= careCfg.turnCompactAt && idleMs >= (careCfg.turnIdleSec || 20) * 1000 && !exempt(n.id))
          op = { kind: 'compact', by: 'hub', auto: 'turn ended above ' + fmtK(careCfg.turnCompactAt) };
      }
      if (!op || idleMs < 3000) continue;
      delete ops[n.id]; saveOps();
      n.caredAt = now(); hub.saveTree();
      const size = ctx ? fmtK(ctx.tokens) : '?';
      if (op.kind === 'compact') {
        hub.tmux.sendCommand(n.pane, '/compact ' + (op.focus ? op.focus + ' ' : '') + COMPACT_FOCUS);
        hub.logEvent({ type: 'care', from: n.id, to: n.id, text: `compacting its context (${size} tokens)${op.auto ? ', automatic: ' + op.auto : ''}` });
      } else {
        fs.mkdirSync(NOTES, { recursive: true });
        const note = String(op.note).trim(), nf = path.join(NOTES, n.id + '.md');
        fs.appendFileSync(nf, `\n## ${new Date().toISOString()} (cleared at ${size} tokens)\n${note}\n`, { mode: 0o600 });
        const text = `[hub] Your context was cleared to save tokens. Your role and brief are unchanged. The handoff note you left:\n\n${note}\n\nEarlier notes: ${nf}. Continue now: start the next step the note names.`;
        const oldSid = sn.sessionId;
        n.clearedAt = now();
        hub.tmux.sendCommand(n.pane, '/clear');
        if (n.model) hub.tmux.sendCommand(n.pane, '/model ' + n.model);
        deliverAfterClear(n, oldSid, text);
        hub.logEvent({ type: 'care', from: n.id, to: n.id, text: `cleared its context (${size} tokens) and kept a handoff note` });
      }
    }
  }
  function setCare(b) {
    careCfg = { ...careCfg, auto: !!b.auto, compactAt: Math.max(30000, Math.min(900000, Number(b.compactAt) || careCfg.compactAt)) };
    writeJSON(CARE_F, careCfg);
    return careCfg;
  }

  /* ---- changelog: every change an agent makes, with how to undo it */
  const CL_F = path.join(D, 'changelog.json');
  const changelog = readJSON(CL_F, null) || { items: [] };
  function addChange(by, b) {
    const s = (v, n) => String(v || '').trim().slice(0, n);
    if (!s(b.title, 1)) throw new Error('title required');
    if (!s(b.what, 1) || !s(b.revert, 1)) throw new Error('--what and --revert are required');
    const top = changelog.items.reduce((m, i) => Math.max(m, +String(i.id).slice(1) || 0), 0);
    const it = { id: 'c' + (top + 1), at: now(), by, title: s(b.title, 160), what: s(b.what, 3000), why: s(b.why, 1500), revert: s(b.revert, 1500), kind: s(b.kind, 20) || 'change' };
    changelog.items.push(it);
    writeJSON(CL_F, changelog);
    hub.logEvent({ type: 'care', from: tree.nodes[by] ? by : 'hub', to: 'brain', text: 'changelog: ' + it.title });
    try { if (hub.jobs.activeOf(by)) hub.jobs.autoStep(by, `changelog ${it.id}: ${it.title}`); } catch {}
    let closed = [];
    try { closed = hub.CDONE.autoClose(hub.actions.items(), it, tree.nodes); if (closed.length) hub.actions.save(); } catch {}
    return closed.length ? { ...it, closedCards: closed.map(c => c.id) } : it;
  }

  setInterval(() => { try { runOnce(); } catch (e) { console.error('[care]', e.message); } }, 5000).unref();
  Object.assign(hub, { contextTokens, queueCare, careHolds, careOp: id => (ops[id] ? ops[id].kind : null), careCfg: () => careCfg, setCare, addChange, changelogItems: () => changelog.items });
};

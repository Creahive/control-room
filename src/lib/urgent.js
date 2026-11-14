'use strict';
/* cmd send --urgent: a correction or stop from a person must reach an agent mid-turn instead of waiting in the hub
   queue until the turn ends. Pure logic; the server does the delivery.
   Who may: the privileged roles (default brain, front), any desk-* agent, a node with role 'front', and any
   agent above the receiver in the tree. Rate limited per sender. */
const RATE_N = 5, RATE_MS = 10 * 60000;
const PRIVILEGED = ['brain', 'front'];

/** null when sender may use --urgent toward receiver, else the reason. isAbove(a, b): a is an ancestor of b.
    opts.privileged: agent ids that may always send urgent (default PRIVILEGED). */
function urgentError(from, to, isAbove, { privileged = PRIVILEGED } = {}) {
  if (!from || !to) return 'unknown sender or receiver';
  if (privileged.includes(from.id) || /^desk-/.test(from.id) || from.role === 'front') return null;
  if (from.id !== to.id && isAbove(from.id, to.id)) return null;
  return `--urgent is only for ${privileged.join(', ')}, desks and an agent's parents; ${from.id} is none of these for ${to.id}`;
}

/** Sliding window per sender: { ok, log } with the updated timestamps (+ retryMin when refused). */
function rateCheck(log, t, n = RATE_N, ms = RATE_MS) {
  const recent = (log || []).filter(x => t - x < ms);
  if (recent.length >= n) return { ok: false, log: recent, retryMin: Math.ceil((recent[0] + ms - t) / 60000) };
  return { ok: true, log: recent.concat(t) };
}

/** Typed in now when the pane takes input (idle or working, awake, not stopped); else first in the queue. */
function urgentPlan(n, state) {
  if (n.stopped) return { how: 'refuse', why: 'stopped' };
  if (n.asleep) return { how: 'first', why: 'asleep, woken now' };
  if (state === 'idle' || state === 'working') return { how: 'type', why: state === 'working' ? 'mid-turn' : 'idle' };
  return { how: 'first', why: state || 'not ready' };
}

module.exports = { urgentError, rateCheck, urgentPlan, RATE_N, RATE_MS, PRIVILEGED };

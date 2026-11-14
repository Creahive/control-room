'use strict';
/* Optional quiet hours: a daily window in which background agent loops stop. Off by default.
   cfg = { enabled, tz, start: 'HH:MM', end: 'HH:MM' }; a window may wrap midnight (22:00-07:00) or not (13:00-14:00);
   start === end means no window.
   In the window the hub parks every non-exempt agent until the window's end and puts it to sleep once idle. Messages
   to it from anyone but a person, the front desk, a desk or brain wait and go in at the end; agent-to-agent traffic and
   watchdog nudges do not wake it. A self-park whose --until falls inside a window lands on that window's end.
   Exempt: brain, front, desk-*, person nodes (u-*), plus whatever the caller's isExempt(n) says. Pure logic. */
const { parts, wallToMs } = require('./tz');

const DEFAULTS = Object.freeze({ enabled: false, tz: 'UTC', start: '01:00', end: '07:00' });
const HM = /^(\d{1,2}):(\d{2})$/;
function norm(cfg) {
  const c = { ...DEFAULTS, ...(cfg || {}) };
  const s = String(c.start).match(HM), e = String(c.end).match(HM);
  if (!s || !e || +s[1] > 23 || +e[1] > 23 || +s[2] > 59 || +e[2] > 59) throw new Error(`quiet hours: start/end want HH:MM, got "${c.start}"-"${c.end}"`);
  return { ...c, sh: +s[1], sm: +s[2], eh: +e[1], em: +e[2], sM: +s[1] * 60 + +s[2], eM: +e[1] * 60 + +e[2] };
}
const parkWhy = cfg => { const c = norm(cfg); return `quiet hours ${c.start}-${c.end} ${c.tz}: no agent loops in this window`; };
const minuteOf = (t, tz) => { const p = parts(t, tz); return { p, m: p.hour * 60 + p.minute }; };

/** Is t inside the window? Always false when disabled or empty. */
function inWindow(t, cfg) {
  const c = norm(cfg);
  if (!c.enabled || c.sM === c.eM) return false;
  const { m } = minuteOf(t, c.tz);
  return c.sM > c.eM ? (m >= c.sM || m < c.eM) : (m >= c.sM && m < c.eM);
}
/** End of the window that contains t; for t outside a window, the end of the next one. */
function windowEnd(t, cfg) {
  const c = norm(cfg), { p, m } = minuteOf(t, c.tz);
  return wallToMs(p.year, p.month, p.day + (m < c.eM ? 0 : 1), c.eh, c.em, c.tz);
}
/** Start of the window t is in, or of the next one. */
function windowStart(t, cfg) {
  const c = norm(cfg), { p, m } = minuteOf(t, c.tz);
  const shift = c.sM > c.eM ? (m < c.eM ? -1 : 0) : (m < c.eM ? 0 : 1);
  return wallToMs(p.year, p.month, p.day + shift, c.sh, c.sm, c.tz);
}
/** cmd park me --until: a wake time inside a window moves to its end; anything else stays. */
const clampUntil = (ts, cfg) => inWindow(ts, cfg) ? windowEnd(ts, cfg) : ts;

/** Never quiet-parked: the coordinating roles, desks, person nodes, and nodes the caller exempts. */
function exempt(n, isExempt) {
  if (!n) return true;
  if (['brain', 'front'].includes(n.id) || /^u-/.test(n.id) || ['brain', 'front'].includes(n.role) || n.account === 'front' || /^desk-/.test(n.id)) return true;
  return !!(isExempt && isExempt(n));
}
/** In the window and not exempt. */
const quiet = (n, t, cfg, isExempt) => !!n && !n.stopped && inWindow(t, cfg) && !exempt(n, isExempt);
/* "you" is any local root shell; only a shell attached by a person (prov.owner) counts as the person. A shell with no
   person behind it (cron scripts) gates as 'you:shell' and waits like an agent. */
const senderKey = (from, prov) => from === 'you' && !(prov && prov.owner) ? 'you:shell' : from;
/** Who may still reach (and wake) a quiet agent: a person, the front desk, a desk, brain. */
const allowedSender = (from, owner) => !!owner || from === 'brain' || from === 'front' || from === 'you' || /^desk-/.test(from || '') || /^u[-:]/.test(from || '');

/** The quiet park a node gets, or null when its own park already lasts past the window's end (or is a hold).
    parkEnd(parked) -> { until, hold } reads the node's current park. */
function parkFor(n, t, parkEnd, cfg) {
  const end = windowEnd(t, cfg), e = n.parked && parkEnd ? parkEnd(n.parked) : null;
  if (e && (e.hold || e.until >= end)) return null;
  return { by: 'hub', at: t, why: parkWhy(cfg), until: end, untilSrc: 'quiet hours', quiet: true };
}
/** Dry run: which nodes the window starting at `at` would park, and which stay up. */
function plan(nodes, at, cfg, isExempt) {
  const park = [], keep = [];
  for (const n of nodes) {
    if (n.stopped) continue;
    (exempt(n, isExempt) ? keep : park).push(n.id);
  }
  return { at, end: windowEnd(at, cfg), park, keep };
}
module.exports = { DEFAULTS, parkWhy, inWindow, windowEnd, windowStart, clampUntil, exempt, quiet, senderKey, allowedSender, parkFor, plan };

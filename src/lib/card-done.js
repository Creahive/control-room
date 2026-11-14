'use strict';
/* Decision cards: an agent asks a person (cmd ask), the person answers, and the agent must then carry the answer out.
   An answered card (status 'sent') stays "waiting" until the agent that asked, or one in its branch, closes it with
   cmd resolve <id> "what was done" (it.done = { at, by, text }). Without this an answered card looks pending forever
   and work gets duplicated or forgotten.
   Options (opts) shared by the functions below:
   - legacyT: cards answered before this ms are 'legacy' (not tracked). Default 0 (everything is tracked).
   - trackT:  cards answered from legacyT up to trackT are a backlog: shown as waiting, never nagged. Default 0.
   - nagH:    a card still waiting this many hours after its answer gets one message to its asker, at most once per
              card per nagH. Default DONE_NAG_H.
   - tz:      time zone for the times in messages. Default UTC.
   An asker that is stopped or removed hands the card to its parent, else to 'brain'. */
const { fmt } = require('./tz');
const LEGACY_T = 0;
const TRACK_T = 0;
const DONE_NAG_H = 24;
const o = (opts = {}) => ({ legacyT: opts.legacyT || LEGACY_T, trackT: opts.trackT || TRACK_T, nagH: opts.nagH || DONE_NAG_H, tz: opts.tz || 'UTC' });

/** { at, by, text } once carried out: it.done, or an older chat close (cmd resolve wrote "✓ ..." into the thread). */
function doneOf(it) {
  if (it.done) return it.done;
  const m = [...(it.thread || [])].reverse().find(x => x.from !== 'owner' && /^✓ /.test(String(x.text || '')));
  return m ? { at: m.at, by: m.from, text: String(m.text).slice(2) } : null;
}
/* The person answered, but the next step is theirs (a key, a login): cmd resolve <id> --waiting "<what>" (or a text
   starting "not done:") sets it.waiting = { at, by, text } instead of it.done. Such a card is 'owner': no nag, it is
   listed as waiting on the person; a later plain cmd resolve sets it.done and wins. */
const NOT_DONE = /^\s*not done\s*:\s*/i;
/** 'done' | 'owner' | 'legacy' | 'waiting' for an answered card; null for open, closed or withdrawn ones. */
function state(it, opts) {
  if (it.status !== 'sent') return null;
  if (it.waiting && !it.done) return 'owner';
  if (doneOf(it)) return 'done';
  return (it.sentAt || 0) < o(opts).legacyT ? 'legacy' : 'waiting';
}
/** Who carries the card out: its asker, or the first live agent above it, else brain. */
function asker(it, nodes) {
  let n = nodes[it.from], i = 0;
  while (n && n.stopped && i++ < 30) n = nodes[n.parent];
  return n && !n.stopped ? n : nodes.brain;
}
/** May agent `me` resolve this card? The asker, anyone above or below it, the coordinating roles and the person. */
function mayResolve(it, me, nodes) {
  if (['brain', 'front', 'you', 'owner'].includes(me)) return true;
  const up = id => { const s = new Set(); let n = nodes[id], i = 0; while (n && i++ < 30) { s.add(n.id); n = nodes[n.parent]; } return s; };
  return up(it.from).has(me) || up(me).has(it.from);
}
/** The person's answer in one line (option labels, typed text, own "other:" answers). */
function answerLine(it) {
  return (it.sent || []).map(({ q, a }) => q.type === 'text' ? String(a || '') : [].concat(a || []).map(v =>
    String(v).startsWith('other:') ? '"' + String(v).slice(6) + '"' : ((q.options || []).find(x => x.v === v) || {}).l || v).join(', '))
    .filter(Boolean).join(' / ');
}
const when = (t, tz) => `${fmt(t, tz)} ${tz}`;

/**
 * One check. st = { sent: { cardId: ms } } is updated by the caller once a message went out. Returns
 * { due: [{ id, to, text }] (cards to message now), lines: [...] (every overdue card, for a health view),
 *   backlog: n, owner: [...] (cards waiting on the person) }.
 */
function check(items, nodes, st, t, opts) {
  const c = o(opts), nagMs = c.nagH * 3600e3;
  st.sent = st.sent || {};
  const due = [], lines = [], owner = []; let backlog = 0;
  for (const it of items) {
    const s = state(it, c);
    if (s === 'owner') { owner.push(`${it.id} ${String(it.waiting.text || it.title).replace(NOT_DONE, '').slice(0, 60)}`); continue; }
    if (s !== 'waiting') continue;
    if ((it.sentAt || 0) < c.trackT) { backlog++; continue; }
    if (t - it.sentAt < nagMs) continue;
    const to = asker(it, nodes); if (!to) continue;
    const ans = answerLine(it).slice(0, 200);
    lines.push(`${it.id} "${String(it.title).slice(0, 80)}" answered ${when(it.sentAt, c.tz)} (${ans || 'see card'}), not resolved; ${to.id} carries it out`);
    if (st.sent[it.id] && t - st.sent[it.id] < nagMs) continue;
    due.push({ id: it.id, to: to.id,
      text: `${it.id} answered ${when(it.sentAt, c.tz)}: "${String(it.title).slice(0, 120)}" -> ${ans || '(see the card)'}. Do it and cmd resolve ${it.id} "<what was done, commit/changelog id>", or cmd resolve ${it.id} "not done: <why>".` });
  }
  return { due, lines, backlog, owner };
}

/** Audit list: answered, unresolved cards, each with any changelog entry naming its id. */
function audit(items, changelog, opts) {
  const out = [];
  for (const it of items) {
    if (state(it, opts) !== 'waiting') continue;
    const re = new RegExp('\\b' + it.id + '\\b');
    const cl = (changelog || []).filter(c => re.test([c.title, c.what, c.why, c.revert].join(' '))).map(c => `${c.id} ${String(c.title).slice(0, 80)}`);
    out.push({ id: it.id, title: it.title, answer: answerLine(it), asker: it.from, sentAt: it.sentAt, changelog: cl });
  }
  return out;
}

/* Agents often log the work in the changelog and forget cmd resolve. A changelog entry whose title or `what` names an
   answered, still-waiting card id (whole word) closes it, when the entry comes from the card's asker, an agent below
   it, or its parent. Open, withdrawn, done and owner-waiting cards and cards of another branch are left alone. */
const CARD_RE = /\ba[0-9]{2,4}\b/g;
/** Card ids an entry names, in order, once each. */
function namedCards(entry, re = CARD_RE) {
  return [...new Set(`${entry.title || ''} ${entry.what || ''}`.match(re) || [])];
}
/** May a changelog entry by `by` close a card asked by `from`? The asker, anyone below it, or its parent. */
function sameBranch(from, by, nodes) {
  if (!from || !by) return false;
  if (by === from || (nodes[from] && nodes[from].parent === by)) return true;
  let n = nodes[by], i = 0;
  while (n && n.parent && i++ < 30) { if (n.parent === from) return true; n = nodes[n.parent]; }
  return false;
}
/** Close every card the entry names and may close (mutates the items). Returns the closed cards.
    opts.cardRe overrides the card id pattern (must be global). */
function autoClose(items, entry, nodes, opts = {}) {
  const out = [];
  for (const id of namedCards(entry, opts.cardRe || CARD_RE)) {
    const it = items.find(i => i.id === id);
    if (!it || !['waiting', 'legacy'].includes(state(it, opts)) || !sameBranch(it.from, entry.by, nodes)) continue;
    const text = `${entry.id}: ${entry.title}`.slice(0, 2000);
    (it.thread = it.thread || []).push({ from: entry.by, text: '✓ ' + text, at: entry.at });
    it.done = { at: entry.at, by: entry.by, text, auto: entry.id };
    it.updatedAt = entry.at;
    out.push(it);
  }
  return out;
}

module.exports = { CARD_RE, namedCards, sameBranch, autoClose, NOT_DONE, LEGACY_T, TRACK_T, DONE_NAG_H, doneOf, state, asker, mayResolve, answerLine, check, audit };

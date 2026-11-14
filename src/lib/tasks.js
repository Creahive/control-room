'use strict';
/* Task queue. Every request a front desk sends to brain becomes a task (T-1, T-2, ...); a brief brain hands to a lead
   becomes a child task linked to it. Status: queued (in the hub's delivery queue, not typed in yet) -> working (typed
   into the agent) -> done (cmd done / cmd task done / brain's answer to the desk once every child is closed). Only a
   queued task can be cancelled: its message is pulled out of the delivery queue, so it never arrives. Done tasks can be
   dismissed (hidden on the map, kept in the file). Stored in one JSON file (the caller passes the path), written
   atomically (tmp + fsync + rename); nothing is ever removed. The hub owns delivery; this module only keeps records.
   Finished work never stays open:
   1. an info-only message (a link, a thank-you, "noted", "FYI", "no reply needed") is an FYI task, closed on delivery
      and not drawn on the map;
   2. a parent closes once every child task it handed out is closed;
   3. a reply on a done task is a note to its agent and keeps it done; new work in it starts a new child task;
   4. sweep(): a working task that got a reply and then 24 h of silence closes with that reply as its result.
   Every task has a short title (one line) and desc (1-2 lines), derived from the brief's GOAL sentence (else its first
   sentence) or given with cmd send --title/--desc. A done task leaves the map MAP_DONE_MS after it finished. */
const fs = require('fs');

const MAP_DONE_MS = 45e3;
const TEXT_MAX = 20000, RESULT_MAX = 8000;
const TID = /\bT-(\d{1,6})\b/g;
const SWEEP_MS = 24 * 3600e3;
// project ids a request may name (stored as t.pm); override with makeTasks({ pmRe })
const PM_RE = /\bB-\d{1,5}\b/;
/* rule 1: info only = an explicit FYI tag, or a short ack/link announcement that asks for nothing */
const FYI_TAG = /^\s*\[?fyi\b|\b(no reply needed|no action needed|info only)\b|\(info\b/i;
const FYI_ACK = /(thanks|thank you|\bnoted\b|\bokay\b|\bpublished\b|\bis live\b)/i;
// words that turn an ack into a request ("okay, go on", "okay but ...")
const ASKS = /\bGOAL\b|\bACCEPTANCE\b|\?|\b(please|fix|check|send me|reply|go on|continue|but)\b/i;
const isFyi = text => { const s = String(text || ''); return !/\bGOAL\b/.test(s) && (FYI_TAG.test(s) || (s.length < 300 && FYI_ACK.test(s) && !ASKS.test(s))); };
/* rule 3: a reply on a done task that asks for new work (else it is a note) */
const NEW_WORK = /\bGOAL\b|\b(please|fix|build|add|change|make|redo|set up|prepare)\b/i;
/* Title + description from a request: the GOAL sentence first, else the first sentence after a "T-n (who; words)"
   preamble. The title is cut at a word near 80 chars, the description is the next sentence(s) up to ~220 chars. */
const SECTION = /\b(?:CONTEXT|ACCEPTANCE|CONSTRAINTS?|REPORT|DONE WHEN|NOTES?|DETAILS?|WHY)\s*:/;
const cut = (s, n) => { s = s.trim(); if (s.length <= n) return s; const w = s.slice(0, n - 1).replace(/[\s,;:(]+\S*$/, ''); return (w.length > n / 2 ? w : s.slice(0, n - 1)) + '…'; };
/** Drops a leading "T-n (who, via whom; their words)." and "Owner:" (the panel already shows who). */
function dropPreamble(s) {
  let m = s.match(/^\s*T-\d+\s*\(/);
  if (m) { let d = 0, i = m[0].length - 1; for (; i < s.length; i++) { if (s[i] === '(') d++; else if (s[i] === ')' && !--d) break; } if (i < s.length) s = s.slice(i + 1).replace(/^[\s.:,;-]+/, ''); }
  return s.replace(/^\s*owner\s*:\s*/i, '');
}
function sentences(s) { return s.split(/(?<=[.!?])\s+(?=[\p{Lu}0-9"'(\[])/u); }
function derive(text) {
  const clean = String(text || '').split('\n').map(l => l.replace(/^\s*\[[^\]]*\]\s*/, '').trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ');
  if (!clean) return { title: '(no text)', desc: '' };
  const g = clean.match(/\bGOAL\s*:?\s*/);
  let body = g ? clean.slice(g.index + g[0].length) : dropPreamble(clean);
  const sec = body.match(SECTION); if (sec && sec.index > 20) body = body.slice(0, sec.index);
  const ss = sentences(body.trim());
  let title = (ss[0] || body).replace(/[.:;]\s*$/, '');
  let rest = ss.slice(1).join(' ');
  if (title.length > 80) { rest = title.slice(cut(title, 80).length - 1) + (rest ? ' ' + rest : ''); title = cut(title, 80); rest = '…' + rest.replace(/^\S*\s*/, ''); }
  if (!rest && g) rest = dropPreamble(clean.slice(0, g.index));
  // capitalise a plain lowercase first word, but not an id ('a12') or a domain ('example.com')
  if (/^\p{Ll}+(?=[\s,:;]|$)/u.test(title)) title = title.charAt(0).toUpperCase() + title.slice(1);
  const desc = rest.replace(/^…\s*/, '').trim() ? cut(rest.replace(/^…\s*/, ''), 220) : '';
  return { title, desc };
}
const isNewWork = text => { const s = String(text || ''); return !isFyi(s) && (s.length >= 300 || NEW_WORK.test(s)); };

/** A result that says nothing about the outcome. */
const noResult = r => !String(r || '').trim() || /^(done|replied|ok|okay|finished)\.?$/i.test(String(r).trim());

/** file: the tasks JSON path (required). now/log: injectable clock and logger. pmRe: project id pattern. */
function makeTasks({ file, now = Date.now, log = () => {}, pmRe = PM_RE }) {
  if (!file) throw new Error('makeTasks needs a file path');
  let st;
  try { st = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { st = null; }
  if (!st || !Array.isArray(st.items)) st = { next: 1, items: [] };
  const byId = new Map(st.items.map(t => [t.id, t]));
  let version = 0;
  const listeners = [];

  function save() {
    const tmp = file + '.tmp';
    const fd = fs.openSync(tmp, 'w', 0o600);
    try { fs.writeSync(fd, JSON.stringify(st, null, 1)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, file);
    version++;
    for (const f of listeners) try { f(); } catch {}
  }
  const get = id => byId.get(String(id || '').toUpperCase());
  const mentioned = text => [...String(text || '').matchAll(TID)].map(m => get('T-' + m[1])).filter(Boolean);

  const pmOf = text => (String(text || '').match(pmRe) || [])[0] || null;
  const kids = t => st.items.filter(c => c.parent === t.id);
  const open = t => t.status === 'queued' || t.status === 'working';

  function create({ from, to, text, parent = null, site = null, body = '', by = null, fyi = false, title = '', desc = '' }) {
    const d = derive(text);
    const t = {
      id: 'T-' + st.next++, title: title ? cut(String(title).replace(/\s+/g, ' '), 120) : d.title, desc: title || desc ? cut(String(desc || '').replace(/\s+/g, ' '), 300) : d.desc, text: String(text || '').slice(0, TEXT_MAX), from, to, parent, site,
      pm: pmOf(text), by, status: 'queued', createdAt: now(), startedAt: null, finishedAt: null, result: null,
      thread: [{ from: by || from, text: String(text || '').slice(0, TEXT_MAX), at: now(), kind: 'request' }],
      body, dismissed: null, cancelled: null,
    };
    if (fyi) t.fyi = true;
    if (title) t.titleBy = by || from;
    st.items.push(t); byId.set(t.id, t);
    return t;   // a new child under a done parent leaves the parent done: the child carries the open work (rule 3)
  }
  /** The hub tried to deliver the task's message: 'delivered' = typed in now, 'queued' = waiting in the queue. */
  function delivery(t, result) {
    if (result === 'delivered') { if (t.status === 'queued') { t.status = 'working'; t.startedAt = now(); } t.body = ''; }
    if (result === 'delivered' && t.fyi) return finish(t, 'FYI, delivered (info only, no reply needed)', 'hub');
    save();
  }
  /** The delivery loop typed these queued texts into agent `to`. */
  function delivered(to, texts) {
    let hit = 0;
    for (const t of st.items) if (t.to === to && t.status === 'queued' && t.body && texts.includes(t.body)) {
      t.status = 'working'; t.startedAt = now(); t.body = ''; hit++;
      log(`${t.id} delivered to ${to}: working`);
      if (t.fyi) finish(t, 'FYI, delivered (info only, no reply needed)', 'hub', true);
    }
    if (hit) save();
  }
  function finish(t, result, by, nosave) {
    if (!open(t)) return false;
    t.status = 'done'; t.finishedAt = now(); t.result = String(result || 'done').slice(0, RESULT_MAX);
    t.thread.push({ from: by || t.to, text: t.result, at: now(), kind: 'result' });
    log(`${t.id} done by ${by || t.to}`);
    parentCheck(t);
    if (!nosave) save();
    return true;
  }
  /** rule 2: once every child task a parent handed out is closed, the parent closes too (FYI children do not count). */
  function parentCheck(t) {
    const p = t.parent && get(t.parent);
    if (!p || !open(p)) return;
    const ks = kids(p).filter(k => !k.fyi);
    if (!ks.length || ks.some(open)) return;
    const last = ks.filter(k => k.status === 'done').sort((a, b) => b.finishedAt - a.finishedAt)[0];
    finish(p, `All child tasks closed (${ks.map(k => k.id + ' ' + k.status).join(', ')}).` + (last && last.result ? `\n\n${last.id}: ${last.result}` : ''), 'hub', true);
  }
  /** Agent `who` ran cmd done: close the task it is working on (a T-id in the text wins, else its newest open one). */
  function doneBy(who, text) {
    const mine = mentioned(text).filter(t => t.to === who && open(t));
    const t = mine[0] || st.items.filter(x => x.to === who && x.status === 'working').sort((a, b) => b.startedAt - a.startedAt)[0];
    return t && finish(t, text, who) ? t : null;
  }
  /** brain answered desk `desk`: that closes a root task from that desk once none of its child tasks is still open.
      The answer must name the task (T-n), or be the only candidate; with several open, nothing is guessed. */
  function answered(brainId, desk, text) {
    const ok = t => t.to === brainId && t.from === desk && !t.parent && t.status === 'working' && !kids(t).some(open);
    const named = mentioned(text).filter(ok), all = st.items.filter(ok);
    const t = named[0] || (all.length === 1 && !mentioned(text).length ? all[0] : null);
    return t && finish(t, text, brainId) ? t : null;
  }
  /** The root task a brief names (T-n of a task that went to brain), else null: a brief is never linked by guess. */
  function parentFor(brainId, text) { return mentioned(text).find(t => t.to === brainId && !t.parent) || null; }
  function link(t, parent) {
    if (parent && (parent === t || parent.parent)) throw new Error('a parent must be a top-level task');
    t.parent = parent ? parent.id : null;
    if (!open(t)) parentCheck(t);
    save(); return t;
  }
  function cancel(t, by, pullFromQueue) {
    if (t.status !== 'queued') throw new Error(`${t.id} is ${t.status}; only a queued task can be cancelled`);
    const pulled = pullFromQueue(t);   // true when the message was still in the delivery queue and is now out of it
    t.status = 'cancelled'; t.cancelled = { at: now(), by, pulled }; t.finishedAt = now(); t.body = '';
    t.thread.push({ from: by, text: 'cancelled before delivery', at: now(), kind: 'note' });
    log(`${t.id} cancelled by ${by}: message ${pulled ? 'pulled from' : 'was not in'} the delivery queue for ${t.to}; never delivered`);
    parentCheck(t);
    save(); return t;
  }
  function dismiss(t, by) {
    if (t.status !== 'done' && t.status !== 'cancelled') throw new Error(`${t.id} is ${t.status}; only a done task can be dismissed`);
    t.dismissed = { at: now(), by }; log(`${t.id} dismissed by ${by}`); save(); return t;
  }
  /** rule 3: a follow-up on a task. On an open task, or a plain reply on a closed one, it is a note on the same task
      (a closed task stays closed). New work (mode 'task', or mode 'auto' and the text asks for work) on a closed task
      becomes a new child task for the same agent: returned, the caller delivers it as a task. */
  function followup(t, by, text, mode = 'auto') {
    const s = String(text).slice(0, TEXT_MAX);
    if (!open(t) && (mode === 'task' || (mode === 'auto' && isNewWork(s)))) {
      const c = create({ from: t.from, to: t.to, text: s, parent: t.parent || t.id, site: t.site, by });
      t.thread.push({ from: by, text: `new work in a reply: ${c.id}`, at: now(), kind: 'note' });
      return c;
    }
    t.thread.push({ from: by, text: s, at: now(), kind: 'followup' }); t.activeAt = now();
    save(); return null;
  }
  /** A message from `from` back to `to` that is no task itself: a reply on the open task `to` gave `from` (named, else
      the only one). Recorded so the sweep (rule 4) can close it. */
  function replied(from, to, text) {
    const ok = t => t.to === from && (t.from === to || t.by === to) && t.status === 'working';
    const named = mentioned(text).filter(ok), all = st.items.filter(ok);
    const t = named[0] || (all.length === 1 && !mentioned(text).length ? all[0] : null);
    if (!t) return null;
    t.thread.push({ from, text: String(text).slice(0, 4000), at: now(), kind: 'reply' }); t.activeAt = now();
    save(); return t;
  }
  /** rule 4: working tasks with a reply and no activity for `ms` close, the last reply as their result. */
  function sweep(ms = SWEEP_MS, only = null) {
    const out = [];
    for (const t of st.items) {
      if (t.status !== 'working' || (only && t.id !== only)) continue;
      const rep = t.thread.filter(m => m.kind === 'reply').pop();
      const last = Math.max(t.startedAt || 0, ...t.thread.map(m => m.at || 0));
      if (!rep || now() - last < ms) continue;
      t.thread.push({ from: 'hub', text: `closed by the sweep: answered, then quiet for ${Math.round(ms / 36e5)} h`, at: now(), kind: 'note' });
      finish(t, rep.text, 'hub', true); out.push(t);
    }
    if (out.length) save();
    return out;
  }
  /** Mark an open task as info only and close it (rule 1 for tasks recorded before the rule). */
  function markFyi(t, by) {
    t.fyi = true; t.thread.push({ from: by, text: 'marked info only (FYI)', at: now(), kind: 'note' });
    if (!finish(t, 'FYI (info only, no reply needed)', by)) save();
    return t;
  }
  /** cmd task title T-n "title" [--desc "..."]: set a task's title (and description) by hand. */
  function setTitle(t, title, desc, by) {
    if (String(title || '').trim()) t.title = cut(String(title).replace(/\s+/g, ' '), 120);
    if (desc !== undefined) t.desc = cut(String(desc || '').replace(/\s+/g, ' '), 300);
    t.titleBy = by; t.thread.push({ from: by, text: `title set: ${t.title}`, at: now(), kind: 'note' });
    save(); return t;
  }
  /** One-off backfill: derive title/desc for tasks that have none, and give a done task whose result says nothing
      ('replied', 'done') the agent's own report from the event log when one is found.
      evs = [{type, from, to, text, ts}]: the agent's last message/done event between pickup and close is used. */
  function backfill(evs = []) {
    let n = 0, r = 0;
    for (const t of st.items) {
      if (t.desc === undefined && !t.titleBy) { const d = derive(t.text); t.title = d.title; t.desc = d.desc; n++; }
      if (t.status === 'done' && noResult(t.result) && !t.resultFrom) {
        const from = t.startedAt || t.createdAt, to = (t.finishedAt || now()) + 5000;
        const xs = evs.filter(e => e.from === t.to && (e.type === 'done' || e.type === 'msg') && e.ts >= from && e.ts <= to && e.text);
        const ids = [t.id, ...mentioned(t.text).map(x => x.id)];
        const e = xs.filter(x => ids.some(id => x.text.includes(id))).pop() || xs.filter(x => x.type === 'done').pop();
        if (e) {
          t.thread.push({ from: 'hub', text: `result filled from ${t.to}'s ${e.type === 'done' ? 'cmd done' : 'message'} of ${new Date(e.ts).toISOString()} (was "${t.result}")`, at: now(), kind: 'note' });
          t.result = String(e.text).slice(0, RESULT_MAX); t.resultFrom = { ts: e.ts, type: e.type }; r++;
        }
      }
    }
    if (n || r) { log(`backfill: ${n} titles, ${r} results`); save(); }
    return { titles: n, results: r };
  }
  function note(t, from, text, kind = 'msg') { t.thread.push({ from, text: String(text).slice(0, 2000), at: now(), kind }); save(); }

  const pub = t => { const { body, ...rest } = t; return rest; };
  const onMap = t => !t.dismissed && !t.fyi && t.status !== 'cancelled' && (t.status !== 'done' || now() - t.finishedAt < MAP_DONE_MS);
  function list(f = {}) {
    let xs = st.items;
    if (f.status === 'dismissed') xs = xs.filter(t => t.dismissed);
    else if (f.status === 'fyi') xs = xs.filter(t => t.fyi);
    else if (f.status) xs = xs.filter(t => t.status === f.status);
    if (f.site) xs = xs.filter(t => t.site === f.site || (f.site === '-' && !t.site));
    if (f.since) xs = xs.filter(t => t.createdAt >= f.since);
    if (f.until) xs = xs.filter(t => t.createdAt < f.until);
    if (f.q) { const q = String(f.q).toLowerCase(); xs = xs.filter(t => (t.id + ' ' + t.title + ' ' + (t.desc || '') + ' ' + t.text + ' ' + (t.result || '')).toLowerCase().includes(q)); }
    return xs.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, f.limit || 300);
  }
  return {
    get, mentioned, create, delivery, delivered, finish, doneBy, answered, parentFor, link, cancel, dismiss, followup, note, save,
    replied, sweep, markFyi, isFyi, isNewWork, setTitle, backfill, derive,
    list, onMap, pub, open, kids, items: () => st.items, version: () => version, onChange: f => listeners.push(f),
  };
}
module.exports = { makeTasks, MAP_DONE_MS, derive, noResult, SWEEP_MS, isFyi, isNewWork };

'use strict';
/* Jobs (J-n): the unit of work a person follows. A task (tasks.js) is a message receipt and closes as soon as the agent
   answers, while the work itself goes on unseen. A job is one card with a title, the person's own words, the agents on
   it, a status, steps with a %, the next step, spend against a budget and what came out (commit, URL, changelog id).
   Spend: every agent has at most ONE active job (st.active[agent] = J-n). Each token-usage snapshot pass adds what an
   agent spent since the previous pass to its active job; an agent with no active job adds it to that day's "unowned"
   bucket. Attribution is time-sliced at the snapshot cadence and nothing is counted twice. Deltas are taken per day key,
   so a snapshot that prunes an old day never shows as negative spend.
   Snapshot shape (raw): { at: unix seconds, days: { 'YYYY-MM-DD': { agentId: { t: tokens, cr: cache reads, usd } } } }.
   Status: planned -> working <-> waiting (on: owner|agent|capacity|job) -> done | cancelled. "stale" is derived:
   working with no step for STALE_MS. Stored in one JSON file the caller names (tmp + fsync + rename); nothing is removed.
   budgetCheck() names open jobs that just passed WARN_PCT / STOP_PCT of their budget (once each; a raised budget
   re-arms them); the server decides what to do (warn, park). noValue (spent NO_VALUE_FRESH, no output) is shown only. */
const fs = require('fs');

const DEFAULT_BUDGET = 10e6;          // fresh tokens per job unless the caller or the job sets another
const STALE_MS = 30 * 60e3;           // working with no step this long: "progress?"
const UNOWNED_DAYS = 14;
const PREV_DAYS = 3;   // days of the last pass kept for deltas: today + 2 (the snapshot itself keeps the full record)
const WARN_PCT = 80, STOP_PCT = 100;   // budget lines: warn, then stop
const NO_VALUE_FRESH = 3e6;           // this much spent and no output (commit, link, changelog): flagged, shown only
const STATUSES = ['planned', 'working', 'waiting', 'done', 'cancelled'];
const WAIT_ON = ['owner', 'agent', 'capacity', 'job'];
const JID = /\bJ-(\d{1,6})\b/g;
const OUTPUT = /\b(c\d{2,6}|[0-9a-f]{7,12}|https?:\/\/\S+)\b/g;   // changelog id, commit, link
const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

/** "10M", "500K", "2.5m", "1200000" -> number of tokens (NaN when unreadable). */
function parseTokens(s) {
  const m = String(s || '').trim().match(/^(\d+(?:\.\d+)?)\s*([kKmM]?)$/);
  if (!m) return NaN;
  return Math.round(+m[1] * (/k/i.test(m[2]) ? 1e3 : /m/i.test(m[2]) ? 1e6 : 1));
}

/** {day: {id: [fresh, usd]}} from a snapshot (fresh = t - cr: cache reads are not fresh work). */
function perDay(raw) {
  const out = {};
  for (const [day, per] of Object.entries((raw && raw.days) || {})) {
    const o = out[day] = {};
    for (const [id, b] of Object.entries(per || {})) o[id] = [Math.max(0, (+b.t || 0) - (+b.cr || 0)), +b.usd || 0];
  }
  return out;
}

/** file: the jobs JSON path (required). defaultBudget: fresh tokens per job when create() names none. */
function makeJobs({ file, now = Date.now, log = () => {}, defaultBudget = DEFAULT_BUDGET }) {
  if (!file) throw new Error('makeJobs needs a file path');
  let st;
  try { st = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { st = null; }
  if (!st || !Array.isArray(st.items)) st = { next: 1, items: [], active: {}, prev: null, unowned: {}, owned: {} };
  st.active = st.active || {}; st.unowned = st.unowned || {}; st.owned = st.owned || {};
  for (const j of st.items) if ((j.status === 'done' || j.status === 'cancelled') && j.waitOn) j.waitOn = null, j.waitWhy = '';   // a closed job never waits
  const byId = new Map(st.items.map(j => [j.id, j]));
  let version = 0;
  const listeners = [];

  function save() {
    const tmp = file + '.tmp';
    const fd = fs.openSync(tmp, 'w', 0o600);
    try { fs.writeSync(fd, JSON.stringify(st)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, file);
    version++;
    for (const f of listeners) try { f(); } catch {}
  }
  const get = id => byId.get(String(id || '').toUpperCase());
  const open = j => !!j && j.status !== 'done' && j.status !== 'cancelled';
  const mentioned = text => [...String(text || '').matchAll(JID)].map(m => get('J-' + m[1])).filter(Boolean);
  const activeOf = agent => { const j = get(st.active[agent]); return open(j) ? j : null; };
  const touch = j => { j.updatedAt = now(); };
  const addStep = (j, by, text, kind = 'step', extra = {}) => {
    const s = { at: now(), by, text: clip(text, 600), kind, ...extra };
    j.steps.push(s); if (j.steps.length > 400) j.steps.splice(1, j.steps.length - 400);
    if (kind === 'step' || kind === 'auto') j.lastStepAt = s.at;
    touch(j); return s;
  };
  const addOutputs = (j, text) => {
    for (const m of String(text || '').matchAll(OUTPUT)) {
      const o = m[1].replace(/[).,;]+$/, '');
      if (/^[0-9a-f]+$/.test(o) && !/[a-f]/.test(o)) continue;   // a plain number is not a commit
      if (!j.outputs.includes(o)) j.outputs.push(o);
    }
    if (j.outputs.length > 60) j.outputs.splice(0, j.outputs.length - 60);
  };

  function create({ title, ask = '', owner, by, budget = defaultBudget, topic = null, task = null, site = null }) {
    title = clip(title, 140);
    if (!title) throw new Error('a job needs a title');
    const j = {
      id: 'J-' + st.next++, title, ask: clip(ask, 2000), owner, by, members: [owner], status: 'planned', waitOn: null, waitWhy: '',
      pct: 0, next: '', budget: budget > 0 ? budget : defaultBudget, f: 0, u: 0, spentBy: {}, activeMs: 0,
      createdAt: now(), startedAt: null, finishedAt: null, lastStepAt: null, updatedAt: now(), result: null,
      outputs: [], topic, task, site, steps: [],
    };
    j.steps.push({ at: j.createdAt, by, text: ask ? clip(ask, 600) : title, kind: 'new' });
    st.items.push(j); byId.set(j.id, j); save();
    log(`${j.id} new by ${by} for ${owner}: ${title}`);
    return j;
  }
  /** agent starts (or joins) job j: it becomes the agent's one active job; its previous active job keeps its status. */
  function start(j, agent, by = agent) {
    if (!open(j)) throw new Error(`${j.id} is ${j.status}`);
    const prev = activeOf(agent);
    st.active[agent] = j.id;
    if (!j.members.includes(agent)) { j.members.push(agent); addStep(j, by, `${agent} joined`, 'note'); }
    if (j.status !== 'working') { if (!j.startedAt) j.startedAt = now(); j.status = 'working'; j.waitOn = null; j.waitWhy = ''; addStep(j, by, prev && prev !== j ? `started (${agent} left ${prev.id})` : 'started', 'state'); }
    if (prev && prev !== j) { addStep(prev, 'hub', `${agent} moved to ${j.id}`, 'note'); if (!Object.entries(st.active).some(([a, id]) => id === prev.id && a !== agent) && prev.status === 'working') prev.status = 'waiting', prev.waitOn = 'agent', prev.waitWhy = `${agent} is on ${j.id}`; }
    touch(j); save(); return j;
  }
  function step(j, by, text, { pct, next } = {}) {
    if (!open(j)) throw new Error(`${j.id} is ${j.status}`);
    if (!clip(text, 10)) throw new Error('a step needs a text: what was done');
    const s = addStep(j, by, text, 'step');
    if (pct != null && pct !== '') { const p = Math.max(0, Math.min(99, Math.round(+pct))); if (Number.isFinite(p)) { j.pct = p; s.pct = p; } }
    if (next != null) j.next = clip(next, 300);
    if (j.status !== 'working') { j.status = 'working'; j.waitOn = null; j.waitWhy = ''; if (!j.startedAt) j.startedAt = now(); }
    if (!activeOf(by) && j.members.includes(by)) st.active[by] = j.id;
    addOutputs(j, text); save(); return j;
  }
  function wait(j, by, on, why) {
    if (!open(j)) throw new Error(`${j.id} is ${j.status}`);
    if (!WAIT_ON.includes(on)) throw new Error('--on owner|agent|capacity|job');
    j.status = 'waiting'; j.waitOn = on; j.waitWhy = clip(why, 300);
    addStep(j, by, `waiting on ${on}${j.waitWhy ? ': ' + j.waitWhy : ''}`, 'state'); save(); return j;
  }
  function release(j) { for (const [a, id] of Object.entries(st.active)) if (id === j.id) delete st.active[a]; }
  function done(j, by, result) {
    if (!open(j)) throw new Error(`${j.id} is ${j.status}`);
    j.status = 'done'; j.pct = 100; j.finishedAt = now(); j.result = clip(result, 2000) || 'done'; j.waitOn = null;
    addStep(j, by, j.result, 'result'); addOutputs(j, result); release(j); save();
    log(`${j.id} done by ${by}`); return j;
  }
  function cancel(j, by, why) {
    if (!open(j)) throw new Error(`${j.id} is ${j.status}`);
    j.status = 'cancelled'; j.finishedAt = now(); j.waitOn = null; j.waitWhy = ''; j.result = clip(why, 600) || 'cancelled';
    addStep(j, by, 'cancelled: ' + j.result, 'state'); release(j); save(); return j;
  }
  function setBudget(j, by, n) {
    if (!(n > 0)) throw new Error('budget: a token count such as 10M or 500K');
    addStep(j, by, `budget ${M(j.budget)} -> ${M(n)}`, 'note'); j.budget = n;
    const p = 100 * j.f / n;
    if (p < WARN_PCT) delete j.warned; if (p < STOP_PCT) delete j.stopped;
    save(); return j;
  }
  /** Open jobs that just crossed a budget line: [{job, level: 'warn'|'stop', pct}], each line once (marked here). */
  function budgetCheck() {
    const out = [];
    for (const j of st.items) {
      if (!open(j)) continue;
      const p = 100 * j.f / (j.budget || defaultBudget);
      if (p >= STOP_PCT && !j.stopped) { j.stopped = { at: now(), f: j.f }; j.warned = j.warned || { at: now() }; out.push({ job: j, level: 'stop', pct: Math.round(p) }); }
      else if (p >= WARN_PCT && !j.warned) { j.warned = { at: now(), f: j.f }; out.push({ job: j, level: 'warn', pct: Math.round(p) }); }
    }
    if (out.length) save();
    return out;
  }
  function mark(j, k, v) { j[k] = v; touch(j); save(); return j; }
  /** Hub-made progress: cmd done / cmd task done / a changelog entry by an agent lands as a step on its active job. */
  function autoStep(agent, text, kind = 'auto') {
    const j = activeOf(agent); if (!j) return null;
    addStep(j, agent, text, kind === 'changelog' ? 'auto' : kind); addOutputs(j, text); save(); return j;
  }
  /** A message naming J-n reaches the job's owner or a member, or comes FROM one of them (the brief is handed down:
   *  front -> brain -> lead -> agent): the job starts for the receiver, which joins it. */
  function mention(to, text, by) {
    const out = [], on = (j, a) => a && (j.owner === a || j.by === a || j.members.includes(a));
    for (const j of mentioned(text)) if (open(j) && (on(j, to) || on(j, by)) && st.active[to] !== j.id) { start(j, to, by || 'hub'); out.push(j); }
    return out;
  }

  /** One snapshot pass. Returns true when anything changed. */
  function tick(raw) {
    if (!raw || !raw.days) return false;
    const cur = perDay(raw), keep = Object.keys(cur).sort().slice(-PREV_DAYS);
    for (const d of Object.keys(cur)) if (!keep.includes(d)) delete cur[d];   // our copy only: the snapshot is the record
    if (st.prev) for (const d of Object.keys(st.prev)) if (!keep.includes(d) && d < keep[0]) delete st.prev[d];
    if (!st.prev) { st.prev = cur; st.prevAt = +raw.at || 0; save(); return true; }   // first pass: baseline only
    if ((+raw.at || 0) && st.prevAt && +raw.at <= st.prevAt) return false;          // same file again
    let changed = false;
    const t = now();
    for (const [day, per] of Object.entries(cur)) {
      const pd = st.prev[day] || {};
      for (const [id, [f, u]] of Object.entries(per)) {
        const [pf, pu] = pd[id] || [0, 0], df = Math.max(0, f - pf), du = Math.max(0, u - pu);
        if (!df && !du) continue;
        const j = activeOf(id);
        if (j) {
          j.f += df; j.u = Math.round((j.u + du) * 1e4) / 1e4;
          const sb = j.spentBy[id] = j.spentBy[id] || [0, 0]; sb[0] += df; sb[1] = Math.round((sb[1] + du) * 1e4) / 1e4;
          j.spendAt = t;
          const od = st.owned[day] = st.owned[day] || [0, 0]; od[0] += df; od[1] = Math.round((od[1] + du) * 1e4) / 1e4;
        } else {
          const ud = st.unowned[day] = st.unowned[day] || {}, o = ud[id] = ud[id] || [0, 0];
          o[0] += df; o[1] = Math.round((o[1] + du) * 1e4) / 1e4;
        }
        changed = true;
      }
    }
    // active time: an open working job accrues the time between passes once (not per agent)
    const dt = st.prevAt && raw.at ? Math.min(10 * 60e3, (raw.at - st.prevAt) * 1000) : 0;
    if (dt > 0) for (const id of new Set(Object.values(st.active))) { const j = get(id); if (j && j.status === 'working') { j.activeMs += dt; changed = true; } }
    st.prev = cur; st.prevAt = +raw.at || 0;
    const days = Object.keys(st.unowned).sort(); while (days.length > UNOWNED_DAYS) delete st.unowned[days.shift()];
    const od = Object.keys(st.owned).sort(); while (od.length > UNOWNED_DAYS) delete st.owned[od.shift()];
    save();
    return changed;
  }

  /** After a person nudged a job: the agent's state at the nudge and its first own step since (answered). */
  function nudgeView(j) {
    if (!j.nudgedAt || !j.nudge || j.nudge.at !== j.nudgedAt) return null;   // only a real nudge has j.nudge; a decision note logs a 'nudge' step without it
    const ans = j.steps.find(s => s.at > j.nudgedAt && ['step', 'auto', 'result', 'state'].includes(s.kind) && s.by !== 'hub' && !/^u-/.test(s.by || ''));
    return { at: j.nudgedAt, state: j.nudge.state, result: j.nudge.result, answeredAt: ans ? ans.at : 0 };
  }
  /** What the board and the CLI show for a job. */
  function pub(j) {
    const last = j.steps.filter(s => s.kind === 'step' || s.kind === 'auto' || s.kind === 'result').slice(-1)[0] || null;
    const ref = j.lastStepAt || j.startedAt || j.createdAt;
    return {
      id: j.id, title: j.title, ask: j.ask, owner: j.owner, by: j.by, members: j.members, status: j.status, waitOn: j.waitOn, waitWhy: j.waitWhy,
      pct: j.pct, next: j.next, budget: j.budget, spent_fresh: j.f, spent_usd: Math.round(j.u * 100) / 100,
      budgetPct: Math.round(100 * j.f / (j.budget || defaultBudget)), activeMs: j.activeMs,
      createdAt: j.createdAt, startedAt: j.startedAt, finishedAt: j.finishedAt, updatedAt: j.updatedAt, lastStepAt: j.lastStepAt,
      stale: j.status === 'working' && now() - ref > STALE_MS, last: last && { at: last.at, by: last.by, text: last.text },
      active: Object.entries(st.active).filter(([, id]) => id === j.id).map(([a]) => a),
      outputs: j.outputs, topic: j.topic, task: j.task, site: j.site, result: j.result, nSteps: j.steps.length,
      spentBy: j.spentBy, noValue: open(j) && j.f >= NO_VALUE_FRESH && !j.outputs.length, card: j.card || null, halted: open(j) && !!j.stopped, nudgedAt: j.nudgedAt || 0, nudge: nudgeView(j), ownerCloses: !!j.ownerCloses, readyAt: j.readyAt || 0,
    };
  }
  /** Spend of a day: owned (on a job) vs unowned, and the unowned agents, biggest first. */
  function spendDay(day, raw) {
    const cur = perDay(raw)[day] || {}, un = st.unowned[day] || {};
    let all = 0, allU = 0; for (const [f, u] of Object.values(cur)) { all += f; allU += u; }
    let unF = 0, unU = 0; for (const [f, u] of Object.values(un)) { unF += f; unU += u; }
    const [ownF, ownU] = st.owned[day] || [0, 0];   // tracked = owned + unowned since the hub started counting
    return { day, fresh: all, usd: Math.round(allU * 100) / 100, unownedFresh: unF, unownedUsd: Math.round(unU * 100) / 100,
      ownedFresh: ownF, ownedUsd: Math.round(ownU * 100) / 100, trackedFresh: ownF + unF,
      top: Object.entries(un).sort((a, b) => b[1][1] - a[1][1] || b[1][0] - a[1][0]).slice(0, 12).map(([id, [f, u]]) => ({ id, fresh: f, usd: Math.round(u * 100) / 100 })) };
  }

  return {
    /** A person nudged a job from the board: logged in its step list, not counted as progress. */
    nudge(j, by, text, info = {}) { const s = addStep(j, by, text, 'nudge'); j.nudgedAt = s.at; if (info.state) j.nudge = { at: s.at, state: info.state, result: String(info.result || '').slice(0, 200) }; else delete j.nudge; save(); return s; },
    get, open, mentioned, activeOf, budgetCheck, mark, create, start, step, wait, done, cancel, setBudget, autoStep, mention, tick, pub, spendDay,
    items: () => st.items, active: () => st.active, version: () => version, onChange: f => listeners.push(f),
    list({ status = '', owner = '', all = false, limit = 200 } = {}) {
      let xs = st.items.slice().reverse();
      if (status) xs = xs.filter(j => j.status === status);
      else if (!all) xs = xs.filter(j => open(j) || now() - (j.finishedAt || 0) < 24 * 3600e3);
      if (owner) xs = xs.filter(j => j.owner === owner || j.members.includes(owner));
      return xs.slice(0, limit);
    },
  };
}
const M = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : Math.round(n / 1000) + 'K';

module.exports = { makeJobs, parseTokens, perDay, M, DEFAULT_BUDGET, STALE_MS, STATUSES, WAIT_ON, WARN_PCT, STOP_PCT, NO_VALUE_FRESH };

'use strict';
/* Per-task cost. Each task carries the fresh (non-cache) tokens and list-price $ its assignee spent while it was open,
   plus the agents under the assignee (children often do the work for a lead's task). Numbers come from token-usage
   snapshots: cum = every node's fresh/$ summed over the days the snapshot keeps. When a task is first seen working,
   the cum of the assignee and its subtree is stored (base); spent = cum now - base. A child that appears later starts
   at 0 if it was spawned after the base, else at its cum when first seen. A done task is settled once a snapshot
   written after it finished arrives, then frozen. Tasks to brain, a front desk or a desk count the assignee only
   (their subtree is the whole fleet).
   Counted vs tree: a lead that keeps a task open while it waits would look expensive if its whole subtree counted.
   Counted = the assignee + members linked to the task: a member that got a task while this one was open which is a
   child of it (parent chain), or which a member sent and that names the task id. A member once linked stays counted.
   Both numbers are kept: counted (alarmed on) and tree (shown).
   State lives in its own object (the caller persists it), so a cost update never rewrites the task records.
   This module only computes; the server sends the warning. */

const DEFAULTS = { taskAlarm: true, taskFreshWarn: 5e6 };
const OWN_ONLY = id => id === 'brain' || id === 'front' || /^desk-/.test(String(id));
const M = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : Math.round(n / 1000) + 'K';
const D = n => '$' + (+n || 0).toFixed(2);

/** {id: [fresh, usd]} over every day in a snapshot (raw = its parsed content). */
function cumulative(raw) {
  const out = {};
  for (const per of Object.values((raw && raw.days) || {})) for (const [id, b] of Object.entries(per)) {
    const o = out[id] = out[id] || [0, 0];
    o[0] += Math.max(0, (+b.t || 0) - (+b.cr || 0)); o[1] += +b.usd || 0;
  }
  return out;
}

/** The assignee and every node under it (stopped ones too: what they spent counts). */
function members(id, nodes) {
  if (OWN_ONLY(id) || (nodes[id] && ['front', 'brain'].includes(nodes[id].role))) return [id];
  const kids = {};
  for (const n of Object.values(nodes)) if (n.parent) (kids[n.parent] = kids[n.parent] || []).push(n.id);
  const out = [], q = [id], seen = new Set();
  while (q.length && out.length < 200) { const x = q.shift(); if (seen.has(x)) continue; seen.add(x); out.push(x); q.push(...(kids[x] || [])); }
  return out;
}

/** f/u = counted (assignee + linked members), of/ou = assignee, tf/tu = whole subtree. */
function spentOf(s, cum) {
  let f = 0, u = 0, of = 0, ou = 0, tf = 0, tu = 0;
  const cnt = new Set([s.to, ...(s.linked || [])]);
  for (const [id, [bf, bu]] of Object.entries(s.base)) {
    const [cf, cu] = cum[id] || [0, 0], df = Math.max(0, cf - bf), du = Math.max(0, cu - bu);
    tf += df; tu += du; if (cnt.has(id)) { f += df; u += du; } if (id === s.to) { of = df; ou = du; }
  }
  const r2 = x => Math.round(x * 100) / 100;
  return { f: Math.round(f), u: r2(u), of: Math.round(of), ou: r2(ou), tf: Math.round(tf), tu: r2(tu) };
}

/** Members (other than the assignee) linked to task t: they got a non-FYI task created while t was open that is
 *  under t (parent chain), or that a member sent and that names t.id, or that is under such a task.
 *  byParent = {parentId: [tasks]}. */
function linkedOf(t, mem, items, byParent, since) {
  const ms = new Set(mem), out = new Set(), re = new RegExp('\\b' + String(t.id).replace(/[^\w-]/g, '') + '\\b');
  const ok = x => !x.fyi && x.id !== t.id && ms.has(x.to) && (x.createdAt || 0) >= since;
  const q = [t.id, ...items.filter(x => ok(x) && ms.has(x.from) && re.test([x.title, x.desc, x.text].join(' '))).map(x => x.id)];
  const under = new Set(q);
  while (q.length) for (const c of byParent[q.shift()] || []) if (!under.has(c.id)) { under.add(c.id); q.push(c.id); }
  for (const x of items) if (ok(x) && under.has(x.id) && x.to !== t.to) out.add(x.to);
  return [...out];
}

/**
 * One pass. st = the cost state ({tasks: {}}), items = every task, nodes = the tree nodes by id, raw = a snapshot,
 * cfg = alarm config merged with DEFAULTS. Returns { changed, warn: [{task, s}] } (warn: open tasks that just passed
 * taskFreshWarn; the caller sends one line each, then sets s.warned).
 */
function tick(st, items, nodes, raw, cfg) {
  st.tasks = st.tasks || {};
  const at = (+raw.at || 0) * 1000, cum = cumulative(raw), warn = [], byParent = {};
  for (const x of items) if (x.parent) (byParent[x.parent] = byParent[x.parent] || []).push(x);
  let changed = false;
  for (const t of items) {
    if (t.fyi) continue;
    let s = st.tasks[t.id];
    if (t.status === 'working') {
      if (!s) {
        const base = {};
        for (const id of members(t.to, nodes)) base[id] = (cum[id] || [0, 0]).slice();
        // late: the task was already working well before this first base (older tasks, hub down): spent is a floor
        s = st.tasks[t.id] = { to: t.to, at, from: t.startedAt || t.createdAt, late: at - (t.startedAt || t.createdAt || at) > 3 * 60e3, base };
        changed = true;
      } else {
        for (const id of members(t.to, nodes)) if (!s.base[id]) {
          const n = nodes[id], born = n && (n.createdAt || n.spawnedAt);
          s.base[id] = born && born >= s.at ? [0, 0] : (cum[id] || [0, 0]).slice(); changed = true;
        }
      }
      const mem = members(t.to, nodes), lk = linkedOf(t, mem, items, byParent, s.from || s.at);
      for (const id of lk) if (!(s.linked = s.linked || []).includes(id)) { s.linked.push(id); changed = true; }
      const sp = spentOf(s, cum);
      if (sp.f !== s.f || sp.u !== s.u || sp.tf !== s.tf) { Object.assign(s, sp, { upd: at }); changed = true; }
      if (cfg.taskAlarm !== false && !s.warned && s.f >= (+cfg.taskFreshWarn || DEFAULTS.taskFreshWarn)) warn.push({ task: t, s });
    } else if (s && !s.final && (t.status === 'done' || t.status === 'cancelled')) {
      Object.assign(s, spentOf(s, cum), { upd: at });
      if (at >= (t.finishedAt || 0)) { s.final = true; s.end = t.finishedAt || at; }
      changed = true;
    }
  }
  return { changed, warn };
}

/** The fields a task shows (cmd tasks, cmd task show, the map), or {} when the hub has no cost for it. */
function fields(s) {
  if (!s) return {};
  return { spent_fresh: s.f || 0, spent_usd: s.u || 0, spent_own_fresh: s.of || 0, spent_own_usd: s.ou || 0,
    spent_tree_fresh: s.tf != null ? s.tf : s.f || 0, spent_tree_usd: s.tu != null ? s.tu : s.u || 0, spent_linked: (s.linked || []).length,
    spent_members: Object.keys(s.base || {}).length, spent_late: !!s.late, spent_final: !!s.final, spent_at: s.upd || s.at || 0 };
}
/** "own 1.2M fresh / $3.40 / tree 5.1M / $76.55 (18 under it)": the first number is the counted one (assignee, or
 *  "+N linked" when children work on it); "≥" when the base came late, "so far" while open. */
function line(f, open) {
  if (f.spent_fresh == null) return '';
  const tree = f.spent_members > 1 && f.spent_tree_fresh > f.spent_fresh
    ? ` / tree ${M(f.spent_tree_fresh)} / ${D(f.spent_tree_usd)} (${f.spent_members - 1} under it)` : '';
  return `${f.spent_late ? '≥' : ''}${f.spent_linked ? `own+${f.spent_linked} linked` : 'own'} ${M(f.spent_fresh)} fresh / ${D(f.spent_usd)}` +
    tree + (open ? ' so far' : '');
}
/** Who hears that a task passed the cap: its asker; a front desk/desk/stopped asker hands it to BRAIN. */
function askerOf(t, nodes) {
  const a = t.by || t.from, n = nodes[a];
  if (!n || n.stopped || n.role === 'front' || /^desk-|^front/.test(a) || a === t.to) return 'brain';
  return a;
}
const STALE_D = 7;
const ageD = (t, now) => Math.floor((now - (t.startedAt || t.createdAt || now)) / 86400e3);
/** "task age N d", plus a hint to close it when it has been open STALE_D days or more. */
function ageNote(t, now) {
  const d = ageD(t, now);
  return `task age ${d} d` + (d >= STALE_D ? `; open ${d} d, probably stale: close it if done (cmd task done ${t.id} "...")` : '');
}
/** The warning line for a task that passed the cap. now = ms for the task age; left out, no age is shown. */
function warnLine(t, s, cfg, now) {
  const f = fields(s), age = now ? '; ' + ageNote(t, now) : '', cap = M(+cfg.taskFreshWarn || DEFAULTS.taskFreshWarn);
  return `[watchdog] ${t.id} "${String(t.title || '').slice(0, 80)}" (${t.to}) passed ${cap} fresh while open: ` +
    `${line(f, true)} since ${new Date(s.from || s.at).toISOString().slice(11, 16)}Z${age}. Per-task cap is ${cap}: ` +
    `decide whether it goes on (warn only, nothing was slept).`;
}

module.exports = { DEFAULTS, cumulative, members, linkedOf, tick, fields, line, askerOf, ageNote, warnLine, M, D };

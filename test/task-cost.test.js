'use strict';
const assert = require('assert');
const TC = require('../src/lib/task-cost');
const nodes = { brain: { id: 'brain', role: 'brain' }, lead: { id: 'lead', parent: 'brain', createdAt: 1 }, kid: { id: 'kid', parent: 'lead', createdAt: 1 },
  other: { id: 'other', parent: 'brain', createdAt: 1 } };
const raw = (at, m) => ({ at, days: { '2026-01-05': Object.fromEntries(Object.entries(m).map(([id, [t, cr, usd]]) => [id, { t, cr, usd }])) } });
const T0 = 1_000_000;   // seconds
const task = { id: 'T-1', status: 'working', from: 'brain', to: 'lead', title: 'trim metas', startedAt: T0 * 1000 - 30e3, createdAt: T0 * 1000 - 40e3 };
const cfg = { ...TC.DEFAULTS };
const st = { tasks: {} };
// first look: base taken, nothing spent
let r = TC.tick(st, [task], nodes, raw(T0, { lead: [10e6, 8e6, 5], kid: [20e6, 15e6, 9], other: [9e9, 0, 999] }), cfg);
assert.ok(r.changed); assert.deepStrictEqual(r.warn, []);
assert.strictEqual(st.tasks['T-1'].f, 0); assert.strictEqual(st.tasks['T-1'].late, false);
assert.deepStrictEqual(Object.keys(st.tasks['T-1'].base).sort(), ['kid', 'lead'], 'other is not under the lead');
// a minute on: lead +1M fresh, kid +3M fresh
r = TC.tick(st, [task], nodes, raw(T0 + 60, { lead: [12e6, 9e6, 6], kid: [30e6, 22e6, 12], other: [9e9, 0, 999] }), cfg);
let f = TC.fields(st.tasks['T-1']);
assert.strictEqual(f.spent_tree_fresh, 4e6); assert.strictEqual(f.spent_own_fresh, 1e6); assert.strictEqual(f.spent_tree_usd, 4); assert.strictEqual(f.spent_members, 2);
// kid has no task linked to T-1, so only the lead counts
assert.strictEqual(f.spent_fresh, 1e6); assert.strictEqual(f.spent_linked, 0);
assert.strictEqual(r.warn.length, 0);
// the lead sends kid work naming T-1 while it is open: kid counts from now on (its whole spend since the base)
const sub = { id: 'T-2', status: 'working', from: 'lead', to: 'kid', title: 'part of T-1: trim', createdAt: T0 * 1000 + 30e3 };
TC.tick(st, [task, sub], nodes, raw(T0 + 61, { lead: [12e6, 9e6, 6], kid: [30e6, 22e6, 12] }), cfg);
assert.strictEqual(st.tasks['T-1'].f, 4e6); assert.deepStrictEqual(st.tasks['T-1'].linked, ['kid']);
// a child spawned after the base starts at 0
nodes.kid2 = { id: 'kid2', parent: 'lead', createdAt: T0 * 1000 + 10e3 };
r = TC.tick(st, [task], nodes, raw(T0 + 120, { lead: [12e6, 9e6, 6], kid: [30e6, 22e6, 12], kid2: [2e6, 0, 1] }), cfg);
assert.strictEqual(st.tasks['T-1'].tf, 6e6); assert.strictEqual(st.tasks['T-1'].f, 4e6, 'kid2 has no linked task'); assert.strictEqual(r.warn.length, 0);
// kid2 gets a child task under T-2 (parent link, no id in text): counted, 6M passes the cap -> one warning
const sub2 = { id: 'T-3', status: 'working', from: 'kid', to: 'kid2', title: 'render', parent: 'T-2', createdAt: T0 * 1000 + 100e3 };
r = TC.tick(st, [task, sub, sub2], nodes, raw(T0 + 121, { lead: [12e6, 9e6, 6], kid: [30e6, 22e6, 12], kid2: [2e6, 0, 1] }), cfg);
assert.strictEqual(st.tasks['T-1'].f, 6e6); assert.strictEqual(r.warn.length, 1);
assert.strictEqual(TC.askerOf(task, nodes), 'brain');
assert.match(TC.warnLine(task, st.tasks['T-1'], cfg), /^\[watchdog\] T-1 "trim metas" \(lead\) passed 5M fresh while open: own\+2 linked 6M fresh \/ \$5\.00 so far/);
assert.match(TC.warnLine(task, st.tasks['T-1'], cfg, task.startedAt + 8 * 86400e3), /task age 8 d; open 8 d, probably stale/);
assert.strictEqual(TC.ageNote(task, task.startedAt + 2 * 86400e3), 'task age 2 d');
st.tasks['T-1'].warned = { at: 1, to: 'brain' };
r = TC.tick(st, [task], nodes, raw(T0 + 180, { lead: [20e6, 9e6, 9], kid: [30e6, 22e6, 12], kid2: [2e6, 0, 1] }), cfg);
assert.strictEqual(r.warn.length, 0, 'warned once only');
// done: settles only once a snapshot written after finishedAt arrives, then frozen
Object.assign(task, { status: 'done', finishedAt: (T0 + 200) * 1000 });
TC.tick(st, [task], nodes, raw(T0 + 190, { lead: [21e6, 9e6, 9], kid: [30e6, 22e6, 12], kid2: [2e6, 0, 1] }), cfg);
assert.ok(!st.tasks['T-1'].final);
TC.tick(st, [task], nodes, raw(T0 + 240, { lead: [22e6, 9e6, 10], kid: [30e6, 22e6, 12], kid2: [2e6, 0, 1] }), cfg);
assert.ok(st.tasks['T-1'].final); const fin = st.tasks['T-1'].f;
TC.tick(st, [task], nodes, raw(T0 + 900, { lead: [99e6, 9e6, 50], kid: [30e6, 22e6, 12], kid2: [2e6, 0, 1] }), cfg);
assert.strictEqual(st.tasks['T-1'].f, fin, 'frozen after settle');
assert.strictEqual(fin, 11e6 + 3e6 + 2e6);
// tasks to brain count brain only; a front-desk asker hands to brain; a late base is flagged
const bt = { id: 'T-4', status: 'working', from: 'front', to: 'brain', title: 'x', startedAt: (T0 - 3600) * 1000 };
TC.tick(st, [bt], nodes, raw(T0 + 300, { brain: [1e6, 0, 1], lead: [1e9, 0, 1] }), cfg);
assert.deepStrictEqual(Object.keys(st.tasks['T-4'].base), ['brain']); assert.ok(st.tasks['T-4'].late);
assert.strictEqual(TC.askerOf({ ...bt, to: 'lead' }, { ...nodes, front: { id: 'front', role: 'front' } }), 'brain');
assert.strictEqual(TC.askerOf({ id: 'T-5', from: 'lead', to: 'kid' }, nodes), 'lead');
// alarm off in config
const st2 = { tasks: {} }, t4 = { ...task, id: 'T-6', status: 'working' };
TC.tick(st2, [t4], nodes, raw(T0, { lead: [0, 0, 0] }), { ...cfg, taskAlarm: false });
r = TC.tick(st2, [t4], nodes, raw(T0 + 60, { lead: [9e6, 0, 3] }), { ...cfg, taskAlarm: false });
assert.strictEqual(r.warn.length, 0);
// a lead waits while its children work on unrelated tasks (no parent link, id not named by a member, or sent before)
const st3 = { tasks: {} }, n3 = { L: { id: 'L', parent: 'brain', createdAt: 1 }, a: { id: 'a', parent: 'L', createdAt: 1 }, b: { id: 'b', parent: 'L', createdAt: 1 }, c: { id: 'c', parent: 'L', createdAt: 1 } };
const w = { id: 'T-7', status: 'working', from: 'brain', to: 'L', title: 'market cost', startedAt: T0 * 1000, createdAt: T0 * 1000 };
const other = [{ id: 'T-8', from: 'L', to: 'a', title: 'mobile build', createdAt: T0 * 1000 + 5e3 },
  { id: 'T-9', from: 'brain', to: 'b', title: 'see T-7 too', createdAt: T0 * 1000 + 5e3 },     // names it, but not sent by a member
  { id: 'U-1', from: 'L', to: 'c', title: 'T-7 prep', createdAt: T0 * 1000 - 5e3 },          // before it opened
  { id: 'U-2', from: 'L', to: 'a', title: 'FYI T-7', fyi: true, createdAt: T0 * 1000 + 5e3 }];
TC.tick(st3, [w, ...other], n3, raw(T0, { L: [0, 0, 0], a: [0, 0, 0], b: [0, 0, 0], c: [0, 0, 0] }), cfg);
r = TC.tick(st3, [w, ...other], n3, raw(T0 + 60, { L: [4e5, 0, 6], a: [2e6, 0, 30], b: [2e6, 0, 30], c: [1e6, 0, 10] }), cfg);
assert.strictEqual(r.warn.length, 0, 'tree 5.4M but counted 400K: no alarm');
assert.strictEqual(TC.line(TC.fields(st3.tasks['T-7']), true), 'own 400K fresh / $6.00 / tree 5.4M / $76.00 (3 under it) so far');
console.log('task-cost ok');

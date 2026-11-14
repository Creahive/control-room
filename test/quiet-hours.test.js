'use strict';
const assert = require('assert');
const Q = require('../src/lib/quiet-hours');
const { fmt, wallToMs } = require('../src/lib/tz');
const TZ = 'Europe/Berlin';
const cfg = { enabled: true, tz: TZ, start: '22:00', end: '07:00' };
const at = (d, h, m = 0) => wallToMs(2026, 11, d, h, m, TZ);
const w = t => fmt(t, TZ);

// off by default, and an empty window never matches
assert.ok(!Q.inWindow(at(10, 23)) && !Q.inWindow(at(10, 23), { ...cfg, enabled: false }));
assert.ok(!Q.inWindow(at(10, 23), { ...cfg, end: '22:00' }));
assert.deepStrictEqual(Q.DEFAULTS, { enabled: false, tz: 'UTC', start: '01:00', end: '07:00' });
assert.throws(() => Q.inWindow(0, { ...cfg, start: '25:00' }));
// a window that wraps midnight, in the configured zone
assert.ok(!Q.inWindow(at(10, 21, 59), cfg) && Q.inWindow(at(10, 22), cfg) && Q.inWindow(at(11, 3), cfg) && Q.inWindow(at(11, 6, 59), cfg) && !Q.inWindow(at(11, 7), cfg));
assert.strictEqual(w(Q.windowEnd(at(10, 22, 30), cfg)), '2026-11-11 07:00');
assert.strictEqual(w(Q.windowEnd(at(11, 2), cfg)), '2026-11-11 07:00');
assert.strictEqual(w(Q.windowStart(at(10, 9, 41), cfg)), '2026-11-10 22:00');
assert.strictEqual(w(Q.windowStart(at(11, 2), cfg)), '2026-11-10 22:00');
// a window inside one day
const day = { enabled: true, tz: 'UTC', start: '13:00', end: '14:30' };
const u = (h, m = 0) => Date.UTC(2026, 10, 10, h, m);
assert.ok(!Q.inWindow(u(12, 59), day) && Q.inWindow(u(13), day) && Q.inWindow(u(14, 29), day) && !Q.inWindow(u(14, 30), day));
assert.strictEqual(Q.windowEnd(u(13, 10), day), u(14, 30));
assert.strictEqual(Q.windowEnd(u(15), day), Date.UTC(2026, 10, 11, 14, 30));
assert.strictEqual(Q.windowStart(u(9), day), u(13));
assert.strictEqual(Q.windowStart(u(15), day), Date.UTC(2026, 10, 11, 13));
// cmd park me --until inside the window lands on its end; outside stays
assert.strictEqual(w(Q.clampUntil(at(10, 23, 30), cfg)), '2026-11-11 07:00');
assert.strictEqual(w(Q.clampUntil(at(11, 5), cfg)), '2026-11-11 07:00');
assert.strictEqual(Q.clampUntil(at(11, 8), cfg), at(11, 8));
assert.strictEqual(Q.clampUntil(at(10, 23, 30)), at(10, 23, 30), 'disabled: unchanged');

// who is exempt
const keepUp = n => n.id === 'ops-site' || /^\/srv\/ops\//.test(n.cwd || '');
for (const n of [{ id: 'brain' }, { id: 'front', role: 'front' }, { id: 'desk-alpha' }, { id: 'u-owner' }, { id: 'ops-site' }, { id: 'ops-app', cwd: '/srv/ops/app' }])
  assert.ok(Q.exempt(n, keepUp), n.id);
for (const n of [{ id: 'growth', cwd: '/srv/blog' }, { id: 'docs-site' }, { id: 'api-lead', parent: 'ops' }, { id: 'server' }])
  assert.ok(!Q.exempt(n, keepUp), n.id);
assert.ok(Q.quiet({ id: 'growth' }, at(10, 23), cfg, keepUp) && !Q.quiet({ id: 'growth' }, at(10, 12), cfg, keepUp) && !Q.quiet({ id: 'growth', stopped: true }, at(10, 23), cfg, keepUp));

// senders that still reach a quiet agent
for (const f of ['brain', 'front', 'desk-alpha', 'u-owner', 'u:owner', 'u-guest', 'you']) assert.ok(Q.allowedSender(f), f);
assert.ok(Q.allowedSender(null, true), 'person flag');
for (const f of [null, undefined, 'server', 'docs-site', 'growth', 'hub']) assert.ok(!Q.allowedSender(f), String(f));
// a shell a person is attached to passes; a script shell is held like an agent
assert.ok(Q.allowedSender(Q.senderKey('you', { owner: true })));
for (const p of [{ owner: false }, null, undefined]) assert.ok(!Q.allowedSender(Q.senderKey('you', p)), JSON.stringify(p));
assert.strictEqual(Q.senderKey('brain', null), 'brain'); assert.strictEqual(Q.senderKey('u:owner', null), 'u:owner');

// quiet park: none when the agent's own park lasts past the end or is a hold; else until the end
const end = e => () => e;
assert.strictEqual(Q.parkFor({ parked: { x: 1 } }, at(10, 22), end({ hold: true }), cfg), null);
assert.strictEqual(Q.parkFor({ parked: { x: 1 } }, at(10, 22), end({ until: at(12, 6) }), cfg), null);
const p = Q.parkFor({ parked: { x: 1 } }, at(10, 22), end({ until: at(10, 23) }), cfg);
assert.ok(p.quiet && w(p.until) === '2026-11-11 07:00' && p.by === 'hub' && /22:00-07:00 Europe\/Berlin/.test(p.why));
assert.ok(Q.parkFor({}, at(10, 22, 1), null, cfg).quiet);

// dry run
const r = Q.plan([{ id: 'brain' }, { id: 'growth' }, { id: 'ops-site' }, { id: 'old', stopped: true }], at(10, 22), cfg, keepUp);
assert.deepStrictEqual(r.park, ['growth']); assert.deepStrictEqual(r.keep, ['brain', 'ops-site']);
assert.strictEqual(w(r.end), '2026-11-11 07:00');
console.log('quiet-hours ok');

'use strict';
const assert = require('assert');
const { urgentError, rateCheck, urgentPlan, RATE_N } = require('../src/lib/urgent');
const tree = { brain: null, ops: 'brain', a: 'ops', b: 'a', x: 'brain' };
const isAbove = (p, c) => { let n = tree[c]; while (n) { if (n === p) return true; n = tree[n]; } return false; };
// who may
assert.strictEqual(urgentError({ id: 'brain' }, { id: 'x' }, isAbove), null);
assert.strictEqual(urgentError({ id: 'front' }, { id: 'b' }, isAbove), null);
assert.strictEqual(urgentError({ id: 'desk-alpha' }, { id: 'b' }, isAbove), null);
assert.strictEqual(urgentError({ id: 'f2', role: 'front' }, { id: 'b' }, isAbove), null);
assert.strictEqual(urgentError({ id: 'a' }, { id: 'b' }, isAbove), null, 'parent');
assert.strictEqual(urgentError({ id: 'ops' }, { id: 'b' }, isAbove), null, 'grandparent');
assert.ok(urgentError({ id: 'b' }, { id: 'a' }, isAbove), 'child to parent refused');
assert.ok(urgentError({ id: 'x' }, { id: 'b' }, isAbove), 'sibling branch refused');
assert.ok(urgentError({ id: 'a' }, { id: 'a' }, isAbove), 'self refused');
assert.ok(urgentError(null, { id: 'a' }, isAbove));
// privileged list is configurable
assert.strictEqual(urgentError({ id: 'ops' }, { id: 'b' }, isAbove, { privileged: ['ops'] }), null);
assert.ok(/only for ops,/.test(urgentError({ id: 'x' }, { id: 'b' }, isAbove, { privileged: ['ops'] })));
// rate limit
let log = [], t = 1e12;
for (let i = 0; i < RATE_N; i++) { const r = rateCheck(log, t + i); assert.ok(r.ok); log = r.log; }
const no = rateCheck(log, t + 10); assert.ok(!no.ok && no.retryMin >= 1);
assert.ok(rateCheck(log, t + 11 * 60000).ok, 'window slides');
// delivery plan
assert.strictEqual(urgentPlan({}, 'working').how, 'type');
assert.strictEqual(urgentPlan({}, 'idle').how, 'type');
assert.strictEqual(urgentPlan({ asleep: true }, 'idle').how, 'first');
assert.strictEqual(urgentPlan({}, 'starting').how, 'first');
assert.strictEqual(urgentPlan({ stopped: true }, 'idle').how, 'refuse');
console.log('urgent ok');

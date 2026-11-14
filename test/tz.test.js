'use strict';
const assert = require('assert');
const Z = require('../src/lib/tz');
const t = Date.UTC(2026, 6, 1, 22, 30);   // summer: Berlin is UTC+2
assert.deepStrictEqual([Z.parts(t).hour, Z.parts(t, 'Europe/Berlin').hour, Z.parts(t, 'Europe/Berlin').day], [22, 0, 2]);
assert.strictEqual(Z.wallToMs(2026, 7, 2, 0, 30, 'Europe/Berlin'), t);
assert.strictEqual(Z.wallToMs(2026, 7, 1, 22, 30), t);
assert.strictEqual(Z.wallToMs(2026, 6, 31, 22, 30), t, 'day overflow normalises');
assert.strictEqual(Z.dayOf(t), '2026-07-01'); assert.strictEqual(Z.dayOf(t, 'Europe/Berlin'), '2026-07-02');
assert.strictEqual(Z.fmt(t, 'Asia/Tokyo'), '2026-07-02 07:30');
// winter: Berlin is UTC+1
assert.strictEqual(Z.wallToMs(2026, 1, 15, 9, 0, 'Europe/Berlin'), Date.UTC(2026, 0, 15, 8, 0));
assert.throws(() => Z.checkTz('Not/AZone')); assert.strictEqual(Z.checkTz('UTC'), 'UTC');
console.log('tz ok');

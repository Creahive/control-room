'use strict';
const assert = require('assert');
const P = require('../src/lib/park-until');
const { fmt } = require('../src/lib/tz');
const TZ = 'Europe/Berlin';                                // UTC+1 in November
const at = Date.UTC(2026, 10, 5, 17, 0);                   // 2026-11-05 18:00 Berlin
const dates = u => { const m = u.match(/^(20\d\d)-(\d\d)-(\d\d)$/); return m ? [Date.UTC(+m[1], +m[2] - 1, +m[3], 6)] : []; };
// a date with a time is wall-clock time in the given zone
for (const u of ['2026-11-06 13:30', '11-06 13:30', '2026-11-06T13:30']) assert.strictEqual(fmt(P.parseUntil(u, at, dates, TZ), TZ), '2026-11-06 13:30', u);
// default zone is UTC
assert.strictEqual(P.parseUntil('2026-11-06 13:30', at), Date.UTC(2026, 10, 6, 13, 30));
// a trailing Z / UTC is always UTC, whatever the zone
for (const u of ['2026-11-07 00:10Z', '2026-11-07T00:10Z', '2026-11-07 00:10 UTC', '2026-11-07T00:10:00Z', '11-07 00:10 utc'])
  assert.strictEqual(P.parseUntil(u, at, dates, TZ), Date.UTC(2026, 10, 7, 0, 10), u);
assert.ok(isNaN(P.parseUntil('2026-11-07Z', at, dates)) && isNaN(P.parseUntil('banana UTC', at, dates)) && isNaN(P.parseUntil('11-06 25:00', at, dates)));
// no year and far in the past: next year
assert.strictEqual(P.parseUntil('01-02 09:00', Date.UTC(2026, 11, 30), null), Date.UTC(2027, 0, 2, 9, 0));
// date only goes to the helper; relative forms
assert.strictEqual(P.parseUntil('2026-11-06', at, dates), Date.UTC(2026, 10, 6, 6));
assert.strictEqual(P.parseUntil('12h', at, dates), at + 12 * 3600e3);
assert.strictEqual(P.parseUntil('3d', at, dates), at + 3 * 86400e3);
assert.strictEqual(P.parseUntil('2026-11-09T10:00:00Z', at), Date.UTC(2026, 10, 9, 10), 'falls back to Date.parse');
// self-park limits
const h = 3600e3;
assert.ok(/needs --until/.test(P.selfParkError({ at, ts: NaN })));
assert.ok(/cannot --hold/.test(P.selfParkError({ at, hold: true, until: '8h', ts: at + 8 * h })));
assert.ok(/at most 36 h/.test(P.selfParkError({ at, until: '2d', ts: at + 48 * h })));
assert.strictEqual(P.selfParkError({ at, until: '36h', ts: at + 36 * h }), '');
// up to 7 days when nothing is open, else the 36 h cap
assert.strictEqual(P.selfParkError({ at, until: '3d', ts: at + 72 * h, open: [] }), '');
assert.strictEqual(P.selfParkError({ at, until: '7d', ts: at + 168 * h, open: [] }), '');
assert.ok(/at most 7 days/.test(P.selfParkError({ at, until: '8d', ts: at + 192 * h, open: [] })));
const e = P.selfParkError({ at, until: '3d', ts: at + 72 * h, open: ['T-4'] });
assert.ok(/at most 36 h ahead; a longer park is your parent's call/.test(e) && /T-4/.test(e));
assert.ok(/at most 36 h/.test(P.selfParkError({ at, until: '3d', ts: at + 72 * h, open: ['worker (child)'] })));
assert.strictEqual(P.selfParkError({ at, until: '30h', ts: at + 30 * h, open: ['T-4'] }), '');
assert.ok(P.isLong(at + 37 * h, at) && !P.isLong(at + 36 * h, at));
console.log('park-until ok');

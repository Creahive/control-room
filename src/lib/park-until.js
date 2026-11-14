'use strict';
/* cmd park --until <value> -> a wake time (ms) or NaN.
   - A date with a time ("2026-11-06 13:30", "11-06 13:30", "2026-11-06T13:30") is wall-clock time in `tz`
     (the hub's configured zone, default UTC).
   - A trailing Z or UTC ("2026-11-07 00:10Z", "2026-11-07T00:10 UTC") is always read as UTC.
   - Nh / Nd are relative to `at`.
   - Anything else goes to the optional parkDates(u, at) helper, then Date.parse.
   The caller rejects a result that is not after `at`. */
const { parts, wallToMs } = require('./tz');

const TM = /^(?:(20\d\d)-)?(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d\d)(?::\d\d(?:\.\d+)?)?$/;
const UTC = /\s*(?:Z|UTC)$/i;
function parseUntil(u, at, parkDates, tz = 'UTC') {
  u = String(u || '').trim();
  const utc = UTC.test(u); if (utc) u = u.replace(UTC, '');
  const zone = utc ? 'UTC' : tz;
  const tm = u.match(TM);
  if (tm) {
    const [, y, mo, d, h, mi] = tm.map(Number), yr = y || parts(at, zone).year;
    if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && h <= 23 && mi <= 59)) return NaN;
    const mk = Y => wallToMs(Y, mo, d, h, mi, zone);
    let ts = mk(yr);
    // a date without a year that is far in the past means next year (e.g. "01-02 09:00" written in late December)
    if (!y && ts < at - 60 * 86400e3) ts = mk(yr + 1);
    return ts;
  }
  if (utc) return NaN;   // "Z"/"UTC" only with a date and a time
  const rel = u.match(/^(\d+(?:\.\d+)?)\s*([hd])$/i);
  if (rel) return at + +rel[1] * (rel[2].toLowerCase() === 'd' ? 86400e3 : 3600e3);
  return (parkDates ? parkDates(u, at)[0] : 0) || Date.parse(u);
}

/* An agent may park itself (cmd park me "why" --until X) when its work is done until a set time. Limits: --until is
   required, at most SELF_MAX_H ahead, no --hold (a hold stays with the parent). Up to SELF_LONG_D days are allowed
   when `open` is an empty list (no open task for the agent and no working child); without that list (unknown) the
   short cap applies. A message or task still wakes a parked agent, so a long park cannot hide work. */
const SELF_MAX_H = 36;
const SELF_LONG_D = 7;
/** Returns an error text, or '' when the self-park is allowed. */
function selfParkError({ until, hold, ts, at, open }) {
  if (hold) return 'cmd park me cannot --hold: a wait on a person is your parent\'s call (cmd send <parent> "...")';
  if (!until) return 'cmd park me needs --until <time> (e.g. "2026-11-06 13:30" in the hub time zone, "2026-11-07 00:10Z" UTC, 8h)';
  if (ts <= at + SELF_MAX_H * 3600e3) return '';
  const free = Array.isArray(open) && !open.length;
  if (free && ts <= at + SELF_LONG_D * 86400e3) return '';
  if (free) return `cmd park me: at most ${SELF_LONG_D} days ahead; a longer park is your parent's call`;
  return `cmd park me: at most ${SELF_MAX_H} h ahead; a longer park is your parent's call` +
    (Array.isArray(open) ? ` (up to ${SELF_LONG_D} days only with nothing open; open now: ${open.slice(0, 5).join(', ')})` : '');
}
const isLong = (ts, at) => ts > at + SELF_MAX_H * 3600e3;
module.exports = { parseUntil, selfParkError, isLong, SELF_MAX_H, SELF_LONG_D };

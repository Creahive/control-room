'use strict';
/* Small time-zone helpers built on Intl, so day boundaries and wall-clock times can follow a configured zone
   instead of the process TZ. Default zone everywhere is UTC. */

/** Wall-clock parts { year, month, day, hour, minute, second } of ms in tz. */
function parts(ms, tz = 'UTC') {
  const o = {};
  for (const p of new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms))) o[p.type] = +p.value;
  return o;
}
/** UTC ms of wall clock y-m-d h:mi in tz (month 1-12; day and hour may overflow, Date.UTC normalises them).
    Two correction passes make it DST-safe outside the switch hour itself. */
function wallToMs(y, m, d, h, mi, tz = 'UTC') {
  const want = Date.UTC(y, m - 1, d, h, mi);
  let g = want;
  for (let i = 0; i < 2; i++) { const p = parts(g, tz); g += want - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute); }
  return g;
}
/** "YYYY-MM-DD" of ms in tz. */
const dayOf = (ms, tz = 'UTC') => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
/** "YYYY-MM-DD HH:MM" of ms in tz. */
const fmt = (ms, tz = 'UTC') => { const p = parts(ms, tz), z = n => String(n).padStart(2, '0');
  return `${p.year}-${z(p.month)}-${z(p.day)} ${z(p.hour)}:${z(p.minute)}`; };
/** Throws on an unknown zone name, so a bad config fails at start rather than at the first day boundary. */
function checkTz(tz) { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; }

module.exports = { parts, wallToMs, dayOf, fmt, checkTz };

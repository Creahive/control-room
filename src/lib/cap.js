'use strict';
/* Daily cap counter for loop agents. Counts an agent's own changelog entries (optionally its whole subtree) since a
   day boundary, one per item id (C123 / #45) when the title names one, so re-logs of the same item count once.
   The boundary is wall-clock time in a configurable zone (default UTC). */
const { parts, wallToMs } = require('./tz');
const TZ = 'UTC';

/** Start of the current window: the latest "HH:MM" (in tz, or UTC with a trailing Z) at or before now. Default 00:00. */
function sinceMs(spec, now = Date.now(), tz = TZ) {
  const m = String(spec || '00:00').trim().match(/^(\d{1,2}):(\d{2})\s*(Z|UTC)?$/i);
  if (!m || +m[1] > 23 || +m[2] > 59) throw new Error(`--since wants HH:MM (${tz}) or HH:MMZ (UTC), got "${spec}"`);
  const zone = m[3] ? 'UTC' : tz, p = parts(now, zone);
  let s = wallToMs(p.year, p.month, p.day, +m[1], +m[2], zone);
  if (s > now) { const y = parts(now - 86400000, zone); s = wallToMs(y.year, y.month, y.day, +m[1], +m[2], zone); }
  return s;
}
/** Agent ids: the agent, plus everything under it when tree. nodes: an array or an object keyed by id. */
function agentsOf(nodes, id, tree) {
  const out = new Set([id]);
  if (!tree) return out;
  if (!Array.isArray(nodes)) nodes = Object.values(nodes || {});
  for (let grew = true; grew;) { grew = false; for (const n of nodes) if (n.parent && out.has(n.parent) && !out.has(n.id)) { out.add(n.id); grew = true; } }
  return out;
}
const ID_RE = /(?:^|[^A-Za-z0-9-])([A-Z]\d{2,5}|#\d+)\b/;
/** The item id a title names (C123, #45), or null. Hyphenated ids (task ids) are not item ids. */
function itemId(title) { const m = String(title || '').match(ID_RE); return m ? m[1] : null; }

/** { count, ids, agents } for the agent (and subtree) since `since` ms. match: optional regex source for the title. */
function count({ items, nodes = [], agent, tree = false, since, match }) {
  const who = agentsOf(nodes, agent, tree), re = match ? new RegExp(match, 'i') : null;
  const seen = new Set(); let n = 0;
  for (const i of items) {
    if (i.void || !who.has(i.by) || !(i.at >= since)) continue;
    if (re && !re.test(i.title || '')) continue;
    const id = itemId(i.title);
    if (id) { if (seen.has(id)) continue; seen.add(id); }
    n++;
  }
  return { count: n, ids: [...seen], agents: [...who] };
}

module.exports = { sinceMs, agentsOf, itemId, count, TZ };

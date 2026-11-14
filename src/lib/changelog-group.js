'use strict';
/* Changelog display grouping. Loop agents can log hundreds of entries a day, one per content item, and real changes
   (hub fixes, server config, deletes, design) get lost among them. Display only: entries are not changed (cmd cap
   counts them by item id). An entry whose title names a content item id (C123, G116de, U46, #320) or whose kind is
   "content" is a content item; those are shown as one collapsed row per site per day. */
const { dayOf: tzDay } = require('./tz');

const ITEM_RE = /(?:^|[^A-Za-z0-9-])([A-Z]\d{2,5}[a-z]{0,2}|#\d+)\b/;
// one-digit series (U1, L1, U4b) only as a word of their own, never a heading tag (H1/H2)
const ITEM1_RE = /(?:^|\s)([A-GI-Z]\d[a-z]?)(?=[:\s,]|$)/;
// only these kinds can be a content item by id; fix, hub, deploy, config, ops, code, delete... always stay listed
const ITEM_KINDS = new Set(['change', 'improve', 'seo', 'site', '', undefined]);
// storage product names, quarters and priorities: not item ids
const STOP1 = /^(R2|S3|V8|E2|Q[1-4]|P[0-4])$/;
const itemOf = title => { const t = String(title || ''), m = t.match(ITEM_RE), o = !m && t.match(ITEM1_RE);
  return m ? m[1] : o && !STOP1.test(o[1]) ? o[1] : null; };
// system words keep an entry listed even when it names an item id ("control-room step 2 #2: header chips")
const SYSTEM_RE = /\b(control-room|nginx|apache|csf|cron|systemd|pm2|dns|ssl|deleted?|archived?|design|theme)\b/i;
const isContent = (it, systemRe = SYSTEM_RE) => !!it && !systemRe.test(it.title || '') && (it.kind === 'content' || (ITEM_KINDS.has(it.kind) && !!itemOf(it.title)));
const dayOf = (ms, tz = 'UTC') => tzDay(ms, tz);
const DOMAIN_RE = /\b([a-z0-9][a-z0-9-]*\.(?:com|net|org|io|so|ai|co|app|dev|me|info|us))\b/i;

/** all: oldest first (as stored). siteOf(item): the agent's site or null. keep: how many normal entries to show.
    opts: { tz (day boundary, default UTC), systemRe (words that keep an entry listed) }.
    Returns { items: newest-first normal entries, groups: newest-first [{key, site, day, at, count, items}] } where
    groups only cover the time span the normal list covers (or everything when there are few normal entries). */
function group(all, siteOf = () => null, keep = 300, opts = {}) {
  const tz = opts.tz || 'UTC', sys = opts.systemRe || SYSTEM_RE;
  const normal = [], content = [];
  for (const it of all) (isContent(it, sys) ? content : normal).push(it);
  const items = normal.slice(-keep).reverse();
  const from = normal.length > keep && items.length ? items[items.length - 1].at : 0;
  const by = new Map();
  for (let i = content.length - 1; i >= 0; i--) {
    const it = content[i]; if (it.at < from) break;
    const m = String(it.title || '').match(DOMAIN_RE), site = (m && m[1].toLowerCase()) || siteOf(it) || it.by || '?', day = dayOf(it.at, tz), key = site + '|' + day;
    if (!by.has(key)) by.set(key, { key, site, day, at: it.at, count: 0, items: [] });
    const g = by.get(key); g.count++;
    if (it.at > g.at) g.at = it.at;
    g.items.push({ id: it.id, at: it.at, by: it.by, title: it.title, kind: it.kind, revert: it.revert, ...(it.void ? { void: it.void } : {}) });
  }
  return { items, groups: [...by.values()].sort((a, b) => b.at - a.at) };
}
module.exports = { ITEM_RE, SYSTEM_RE, itemOf, isContent, dayOf, group };

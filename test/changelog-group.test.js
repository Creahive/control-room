'use strict';
const assert = require('assert');
const G = require('../src/lib/changelog-group');
const t0 = Date.parse('2026-11-09T20:00:00Z');
const e = (id, by, title, kind, dt = 0) => ({ id, by, title, kind, at: t0 + dt, what: 'w', revert: 'r' });
const all = [
  e('c1', 'docs-site', 'example.com C362: new guide', 'change', 1),
  e('c2', 'docs-site', 'example #363: new guide', 'change', 2),
  e('c3', 'ops', 'T-1: tester messages labelled as the tester', 'hub', 3),
  e('c4', 'brain', 'improve round: demand spot check', 'improve', 4),
  e('c5', 'growth', 'example.org: G116de card game page', 'improve', 5),
  e('c6', 'growth', 'example.org: G116es card game page', 'improve', 6),
  e('c7', 'shop-site', 'shop U46 lead verify', 'change', 7),
  e('c8', 'docs-site', 'example.com C364: next day guide', 'change', 4 * 3600e3),
  e('c9', 'ops', 'nginx: H1 fix on example.org', 'fix', 8),
  e('c10', 'x', 'a content row with no id', 'content', 9),
  e('c11', 'ops', 'cmd-hub restart: bb91ad6 live (step 2 #3 inbox)', 'deploy', 10),
];
const siteOf = it => ({ 'shop-site': 'shop.example.net', x: 'x.example.net' })[it.by] || null;
const r = G.group(all, siteOf);
assert.deepStrictEqual(r.items.map(i => i.id), ['c11', 'c9', 'c4', 'c3'], 'deploy, hub fix, improve round and nginx fix stay separate, newest first');
const g = Object.fromEntries(r.groups.map(x => [x.key, x.count]));
assert.deepStrictEqual(g, { 'example.com|2026-11-10': 1, 'x.example.net|2026-11-09': 1, 'shop.example.net|2026-11-09': 1, 'example.org|2026-11-09': 2, 'example.com|2026-11-09': 1, 'docs-site|2026-11-09': 1 });
assert.strictEqual(r.groups[0].site, 'example.com'); assert.strictEqual(r.groups[0].day, '2026-11-10');
// the day boundary follows tz: in a zone behind UTC the late entry is still on the 9th
const rt = G.group(all, siteOf, 300, { tz: 'America/New_York' });
assert.deepStrictEqual(Object.fromEntries(rt.groups.map(x => [x.key, x.count]))['example.com|2026-11-09'], 2);
assert.strictEqual(rt.groups.find(x => x.key === 'example.com|2026-11-09').items[0].id, 'c8', 'group items newest first');
assert.strictEqual(all.length, 11); assert.strictEqual(all[0].what, 'w', 'entries are not changed');
assert.strictEqual(G.itemOf('example.org: G116de card'), 'G116de');
assert.strictEqual(G.itemOf('T-1: x'), null); assert.strictEqual(G.itemOf('U9 corrected calculator'), 'U9');
assert.strictEqual(G.itemOf('shop U10c lead verify'), 'U10c'); assert.strictEqual(G.itemOf('L1 live: links'), 'L1');
assert.strictEqual(G.itemOf('nginx: H1 fix'), null);
assert.strictEqual(G.isContent({ kind: 'improve', title: 'cmd-hub step 2 #2: header chips' }), false);
assert.strictEqual(G.isContent({ kind: 'change', title: 'example.com C362: new guide' }), true);
assert.strictEqual(G.isContent({ kind: 'change', title: 'example.com C362: new guide' }, /\bguide\b/), false, 'systemRe is configurable');
assert.strictEqual(G.itemOf('R2 backup'), null); assert.strictEqual(G.itemOf('P1 fix: login'), null); assert.strictEqual(G.itemOf('title/H1/meta'), null); assert.strictEqual(G.itemOf('improve 55: x'), null);
// keep: groups only cover the span of the normal entries shown
const r2 = G.group(all, siteOf, 1);
assert.deepStrictEqual(r2.items.map(i => i.id), ['c11']);
assert.ok(r2.groups.every(x => x.at >= all.find(i => i.id === 'c11').at));
console.log('changelog-group ok');

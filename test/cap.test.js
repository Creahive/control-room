'use strict';
const assert = require('assert');
const { sinceMs, itemId, count } = require('../src/lib/cap');
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { e.message = name + ': ' + e.message; throw e; } };
const H = 3600000, T0 = Date.UTC(2026, 10, 8, 20, 0);
const nodes = [{ id: 'api-lead', parent: 'brain' }, { id: 'writer', parent: 'api-lead' }, { id: 'sub', parent: 'writer' }, { id: 'other', parent: 'brain' }];
const e = (by, h, title, x = {}) => ({ by, at: T0 + h * H, title, ...x });
const items = [e('writer', -1, 'live C101'), e('writer', -0.5, 'fix C101 typo'), e('writer', 0, 'live #45'), e('writer', 0, 'live #45 again'),
  e('writer', 0, 'no id here'), e('writer', 0, 'T-1 and B-2 are not item ids'), e('api-lead', 0, 'lead note C200'),
  e('other', 0, 'live C300'), e('writer', 0, 'voided C400', { void: true }), e('sub', 0, 'deep C500'), e('writer', -21, 'yesterday C900')];
const since = sinceMs('00:00', T0);
t('since 00:00 = midnight UTC by default', () => assert.strictEqual(since, Date.UTC(2026, 10, 8, 0, 0)));
t('since 06:00 in a zone', () => assert.strictEqual(sinceMs('06:00', T0, 'Europe/Berlin'), Date.UTC(2026, 10, 8, 5, 0)));
t('trailing Z is UTC whatever the zone', () => assert.strictEqual(sinceMs('00:00Z', T0, 'Asia/Tokyo'), Date.UTC(2026, 10, 8, 0, 0)));
t('since later than now: yesterday', () => assert.strictEqual(sinceMs('21:00', T0), Date.UTC(2026, 10, 7, 21, 0)));
t('boundary inclusive', () => assert.strictEqual(count({ items: [{ by: 'a', at: since, title: 'x' }, { by: 'a', at: since - 1, title: 'y' }], agent: 'a', since }).count, 1));
t('bad since throws', () => assert.throws(() => sinceMs('6am', T0)));
t('item ids', () => { assert.strictEqual(itemId('live C101 ok'), 'C101'); assert.strictEqual(itemId('x #45'), '#45'); assert.strictEqual(itemId('T-1 B-2 c9'), null); });
t('dedupe by id, own only', () => assert.strictEqual(count({ items, nodes, agent: 'writer', since }).count, 4));   // C101, #45, no id, the task-id title
t('nodes keyed by id', () => assert.strictEqual(count({ items, nodes: Object.fromEntries(nodes.map(x => [x.id, x])), agent: 'api-lead', tree: true, since }).count, 6));
t('tree adds subtree, not siblings', () => assert.strictEqual(count({ items, nodes, agent: 'api-lead', tree: true, since }).count, 6));
t('void and yesterday skipped', () => assert.ok(!count({ items, nodes, agent: 'writer', tree: true, since }).ids.some(x => x === 'C400' || x === 'C900')));
t('match filter', () => assert.strictEqual(count({ items, nodes, agent: 'writer', since, match: '^live' }).count, 2));
t('DST change day in a zone', () => assert.strictEqual(sinceMs('06:00', Date.UTC(2026, 9, 25, 12, 0), 'Europe/Berlin'), Date.UTC(2026, 9, 25, 5, 0)));
t('summer day in a zone', () => assert.strictEqual(sinceMs('06:00', Date.UTC(2026, 9, 24, 12, 0), 'Europe/Berlin'), Date.UTC(2026, 9, 24, 4, 0)));
console.log(`cap: ${n} ok`);

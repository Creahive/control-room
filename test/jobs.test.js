'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { makeJobs, parseTokens, DEFAULT_BUDGET, STALE_MS } = require('../src/lib/jobs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-test-')), file = path.join(dir, 'jobs.json');
let t = Date.parse('2026-01-12T16:00:00Z');
const now = () => t;
const J = makeJobs({ file, now });
const tok = (at, days) => ({ at: Math.floor(at / 1000), days });
assert.throws(() => makeJobs({}), /file path/);

assert.strictEqual(parseTokens('10M'), 10e6); assert.strictEqual(parseTokens('500k'), 5e5); assert.strictEqual(parseTokens('2.5m'), 2.5e6);
assert.ok(Number.isNaN(parseTokens('lots')));

// create + start + step
const a = J.create({ title: 'Fix the limits chip', ask: 'the limits chip shows 100% but nothing is used', owner: 'docs-site', by: 'front' });
assert.strictEqual(a.id, 'J-1'); assert.strictEqual(a.status, 'planned'); assert.strictEqual(a.budget, DEFAULT_BUDGET);
assert.throws(() => J.create({ title: '  ', owner: 'x', by: 'y' }));
J.start(a, 'docs-site');
assert.strictEqual(J.activeOf('docs-site'), a); assert.strictEqual(a.status, 'working');
J.step(a, 'docs-site', 'staging tested, commit 418d335', { pct: 60, next: 'deploy' });
assert.strictEqual(a.pct, 60); assert.strictEqual(a.next, 'deploy'); assert.ok(a.outputs.includes('418d335'));
J.step(a, 'docs-site', 'more', { pct: 140 }); assert.strictEqual(a.pct, 99, 'only done makes 100');
assert.throws(() => J.step(a, 'docs-site', ''));

// spend: the first pass is a baseline, later deltas go to the active job, the rest is unowned
const D = '2026-01-12';
J.tick(tok(t, { [D]: { 'docs-site': { t: 1000, cr: 0, usd: 1 }, 'api-lead': { t: 500, cr: 0, usd: 0.5 } } }));
assert.strictEqual(a.f, 0);
t += 60e3;
J.tick(tok(t, { [D]: { 'docs-site': { t: 3000, cr: 500, usd: 3 }, 'api-lead': { t: 900, cr: 100, usd: 0.8 } } }));
assert.strictEqual(a.f, 1500); assert.strictEqual(a.u, 2);              // (3000-500) - 1000
const sd = J.spendDay(D, tok(t, { [D]: { 'docs-site': { t: 3000, cr: 500, usd: 3 }, 'api-lead': { t: 900, cr: 100, usd: 0.8 } } }));
assert.strictEqual(sd.unownedFresh, 300); assert.strictEqual(sd.top[0].id, 'api-lead');
assert.strictEqual(a.activeMs, 60e3);
J.tick(tok(t, { [D]: { 'docs-site': { t: 3000, cr: 500, usd: 3 } } })); assert.strictEqual(a.f, 1500, 'the same snapshot again counts nothing');
// an old day pruned + a new day: no negative spend, the new day counts from 0
t += 60e3;
J.tick(tok(t, { '2026-01-13': { 'docs-site': { t: 200, cr: 0, usd: 0.1 } } }));
assert.strictEqual(a.f, 1700);

// one active job per agent: starting another moves the agent; the old one waits on the agent
const b = J.create({ title: 'Second job', owner: 'docs-site', by: 'docs-site' });
J.start(b, 'docs-site');
assert.strictEqual(J.activeOf('docs-site'), b); assert.strictEqual(a.status, 'waiting'); assert.strictEqual(a.waitOn, 'agent');
J.start(b, 'docs-kid'); assert.deepStrictEqual(b.members, ['docs-site', 'docs-kid']);
t += 60e3;
J.tick(tok(t, { '2026-01-13': { 'docs-site': { t: 200, cr: 0, usd: 0.1 }, 'docs-kid': { t: 400, cr: 0, usd: 0.2 } } }));
assert.strictEqual(b.f, 400); assert.strictEqual(b.spentBy['docs-kid'][0], 400); assert.strictEqual(a.f, 1700);

// mention: a message naming J-1 to its owner makes it active again; a handed-down brief makes the receiver join
assert.strictEqual(J.mention('docs-site', 'please finish J-1', 'front').length, 1);
assert.strictEqual(J.activeOf('docs-site'), a); assert.strictEqual(a.status, 'working');
assert.strictEqual(J.mention('nobody', 'J-1').length, 0);
assert.strictEqual(J.mention('docs-kid2', 'do part 2 of J-2', 'docs-kid').length, 1);
assert.ok(b.members.includes('docs-kid2')); assert.strictEqual(J.activeOf('docs-kid2'), b);
assert.strictEqual(J.mention('x', 'J-2', 'stranger').length, 0);

// wait / autoStep / stale / done
J.wait(a, 'docs-site', 'owner', 'needs the OK'); assert.strictEqual(a.status, 'waiting');
assert.throws(() => J.wait(a, 'docs-site', 'moon'));
assert.strictEqual(J.autoStep('docs-site', 'changelog c12: chip fix').id, 'J-1'); assert.ok(a.outputs.includes('c12'));
J.step(a, 'docs-site', 'back on it'); assert.strictEqual(a.status, 'working');
t += STALE_MS + 1; assert.strictEqual(J.pub(a).stale, true);
J.done(a, 'docs-site', 'live, https://example.com/limits shows it');
assert.strictEqual(a.status, 'done'); assert.strictEqual(a.pct, 100); assert.strictEqual(J.activeOf('docs-site'), null);
assert.ok(a.outputs.includes('https://example.com/limits'));
assert.throws(() => J.step(a, 'docs-site', 'late'));
assert.strictEqual(J.pub(a).stale, false);

// budget
J.setBudget(b, 'api-lead', 15e6); assert.strictEqual(b.budget, 15e6); assert.throws(() => J.setBudget(b, 'api-lead', 0));
assert.strictEqual(J.pub(b).budgetPct, 0);

// persisted and reloaded
const J2 = makeJobs({ file, now });
assert.strictEqual(J2.get('j-2').f, 400); assert.strictEqual(J2.activeOf('docs-kid').id, 'J-2');
assert.strictEqual(J2.list().length, 2); assert.strictEqual(J2.list({ status: 'done' }).length, 1);
// budget lines fire once, a raised budget re-arms them; noValue
const c = J2.create({ title: 'Budget test', owner: 'api-lead', by: 'front', budget: 1000 }); J2.start(c, 'api-lead');
t += 60e3; J2.tick(tok(t, { '2026-01-13': { 'docs-site': { t: 200, cr: 0, usd: 0.1 }, 'docs-kid': { t: 400, cr: 0, usd: 0.2 }, 'api-lead': { t: 850, cr: 0, usd: 1 } } }));
let bc = J2.budgetCheck(); assert.deepStrictEqual(bc.map(x => [x.job.id, x.level]), [['J-3', 'warn']]);
assert.strictEqual(J2.budgetCheck().length, 0);
t += 60e3; J2.tick(tok(t, { '2026-01-13': { 'docs-site': { t: 200, cr: 0, usd: 0.1 }, 'docs-kid': { t: 400, cr: 0, usd: 0.2 }, 'api-lead': { t: 1100, cr: 0, usd: 1.2 } } }));
bc = J2.budgetCheck(); assert.strictEqual(bc[0].level, 'stop'); assert.strictEqual(J2.pub(c).halted, true);
J2.setBudget(c, 'front', 3000); assert.strictEqual(J2.pub(c).halted, false); assert.strictEqual(J2.budgetCheck().length, 0);
assert.strictEqual(J2.pub(c).noValue, false);
c.f = 4e6; c.budget = 1e9; assert.strictEqual(J2.pub(c).noValue, true); c.outputs.push('c9x'); assert.strictEqual(J2.pub(c).noValue, false);
// cancel clears the wait and the halted flag; owned vs unowned per day; prev keeps only the newest days
J2.wait(c, 'hub', 'owner', 'card'); c.stopped = true; assert.strictEqual(J2.pub(c).halted, true);
J2.cancel(c, 'api-lead', 'test'); assert.strictEqual(c.waitOn, null); assert.strictEqual(J2.pub(c).halted, false);
const sd2 = J2.spendDay('2026-01-13', tok(t, { '2026-01-13': {} }));
assert.ok(sd2.ownedFresh > 0); assert.strictEqual(sd2.trackedFresh, sd2.ownedFresh + sd2.unownedFresh);
const many = {}; for (let i = 1; i <= 9; i++) many['2026-01-0' + i] = { 'zeta': { t: 100, cr: 0, usd: 0 } };
many['2026-01-13'] = { 'docs-site': { t: 200, cr: 0, usd: 0.1 }, 'docs-kid': { t: 400, cr: 0, usd: 0.2 }, 'api-lead': { t: 1100, cr: 0, usd: 1.2 } };
t += 60e3; J2.tick(tok(t, many));
const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
assert.deepStrictEqual(Object.keys(saved.prev).sort(), ['2026-01-08', '2026-01-09', '2026-01-13']);
assert.strictEqual(J2.spendDay('2026-01-01', tok(t, many)).unownedFresh, 0, 'a day out of the window counts nothing');
fs.writeFileSync(file, JSON.stringify({ ...saved, items: saved.items.map(x => x.id === c.id ? { ...x, waitOn: 'owner' } : x) }));
assert.strictEqual(makeJobs({ file, now }).get(c.id).waitOn, null, 'a closed job never waits after reload');
// a nudge keeps the agent's state at that moment; the agent's own next step marks it answered
{ const n = J.create({ title: 'nudge view', owner: 'alpha', by: 'front' }); J.start(n, 'alpha');
  t += 60e3; J.nudge(n, 'u-owner', 'nudged from the board', { state: 'working', result: 'delivered' });
  let v = J.pub(n).nudge; assert.strictEqual(v.state, 'working'); assert.strictEqual(v.answeredAt, 0);
  t += 60e3; J.step(n, 'alpha', 'next step'); v = J.pub(n).nudge; assert.strictEqual(v.answeredAt, t);
  const o = J.create({ title: 'never nudged', owner: 'beta', by: 'front' }); assert.strictEqual(J.pub(o).nudge, null);
  J.nudge(n, 'u-owner', 'decision noted'); assert.strictEqual(J.pub(n).nudge, null, 'a decision note is no nudge'); }
// defaultBudget option
{ const f2 = path.join(dir, 'jobs2.json'), J3 = makeJobs({ file: f2, now, defaultBudget: 2e6 });
  assert.strictEqual(J3.create({ title: 'small', owner: 'a', by: 'b' }).budget, 2e6); }
fs.rmSync(dir, { recursive: true });
console.log('jobs ok');

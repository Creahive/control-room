'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { makeTasks, derive, noResult, isFyi, isNewWork, MAP_DONE_MS, SWEEP_MS } = require('../src/lib/tasks');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-test-')), file = path.join(dir, 'tasks.json');
let t = Date.parse('2026-01-05T10:00:00Z');
const now = () => t, logs = [];
const T = makeTasks({ file, now, log: s => logs.push(s) });
assert.throws(() => makeTasks({}), /file path/);

// title + description
let d = derive('T-1 (brain, via front; their words: "fix it"). GOAL: Make the signup form accept plus addresses. CONTEXT: users report it.');
assert.strictEqual(d.title, 'Make the signup form accept plus addresses');
d = derive('[relay] fix the footer links. They point to the old domain. Check all pages.');
assert.deepStrictEqual(d, { title: 'Fix the footer links', desc: 'They point to the old domain. Check all pages.' });
d = derive('Owner: please write a much longer title than anyone would ever want to read on a small map node, really very long indeed. Second.');
assert.ok(d.title.length <= 80 && d.title.endsWith('…') && d.desc.startsWith(''), d.title);
assert.deepStrictEqual(derive(''), { title: '(no text)', desc: '' });
assert.strictEqual(derive('example.com needs a new hero image').title, 'example.com needs a new hero image', 'a domain is not capitalised');
// info only / new work / empty results
assert.ok(isFyi('FYI: the staging site is up') && isFyi('Thanks, noted') && isFyi('no reply needed: build ok'));
assert.ok(!isFyi('Thanks, but please also fix the header') && !isFyi('okay, continue with part 2') && !isFyi('GOAL: FYI page'));
assert.ok(isNewWork('please add a dark mode toggle') && !isNewWork('great, thanks') && isNewWork('x'.repeat(300)));
assert.ok(noResult('') && noResult('Done.') && noResult('replied') && !noResult('Shipped v2, commit abc1234'));

// create -> delivery -> finish; a project id is picked up
const a = T.create({ from: 'front', to: 'brain', text: 'B-1: please set up the docs site for example.com.', by: 'front' });
assert.strictEqual(a.id, 'T-1'); assert.strictEqual(a.status, 'queued'); assert.strictEqual(a.pm, 'B-1');
T.delivery(a, 'queued'); assert.strictEqual(a.status, 'queued');
T.delivery(a, 'delivered'); assert.strictEqual(a.status, 'working'); assert.strictEqual(a.startedAt, t);
assert.strictEqual(T.parentFor('brain', 'brief for T-1'), a);
assert.strictEqual(T.parentFor('brain', 'no id'), null);
// two children under it; the parent closes when both are closed
t += 1000;
const k1 = T.create({ from: 'brain', to: 'docs-site', text: 'GOAL: build the docs pages (T-1)', parent: a.id, body: 'b1' });
const k2 = T.create({ from: 'brain', to: 'api-lead', text: 'GOAL: expose the docs API (T-1)', parent: a.id, body: 'b2' });
T.delivered('docs-site', ['b1']); T.delivered('api-lead', ['b2']);
assert.strictEqual(k1.status, 'working'); assert.strictEqual(k1.body, '');
t += 1000;
assert.strictEqual(T.doneBy('docs-site', 'pages live at https://example.com/docs, checked with curl'), k1);
assert.strictEqual(a.status, 'working', 'one child still open');
assert.strictEqual(T.answered('brain', 'front', 'all done'), null, 'brain cannot close a root with open children');
t += 1000;
T.doneBy('api-lead', 'T-3 done: API at /v1/docs');
assert.strictEqual(a.status, 'done'); assert.ok(/All child tasks closed/.test(a.result) && /T-3: T-3 done/.test(a.result));
// brain answers a desk: closes the only open root, else needs the id
const r1 = T.create({ from: 'front', to: 'brain', text: 'what is the uptime?' }); T.delivery(r1, 'delivered');
assert.strictEqual(T.answered('brain', 'front', '99.9% this month'), r1); assert.strictEqual(r1.status, 'done');
const r2 = T.create({ from: 'front', to: 'brain', text: 'question one?' }), r3 = T.create({ from: 'front', to: 'brain', text: 'question two?' });
T.delivery(r2, 'delivered'); T.delivery(r3, 'delivered');
assert.strictEqual(T.answered('brain', 'front', 'answer'), null, 'two open: nothing guessed');
assert.strictEqual(T.answered('brain', 'front', `${r3.id}: answer two`), r3);
// FYI tasks close on delivery and stay off the map
const f = T.create({ from: 'brain', to: 'alpha', text: 'FYI: maintenance tonight', fyi: true, body: 'fyi1' });
T.delivered('alpha', ['fyi1']); assert.strictEqual(f.status, 'done'); assert.ok(!T.onMap(f));
// cancel only while queued
const q = T.create({ from: 'brain', to: 'alpha', text: 'GOAL: rename the repo', body: 'q1' });
assert.strictEqual(T.cancel(q, 'brain', () => true).cancelled.pulled, true); assert.strictEqual(q.status, 'cancelled');
assert.throws(() => T.cancel(a, 'brain', () => true), /only a queued task/);
// dismiss only when closed
assert.throws(() => T.dismiss(r2, 'front'), /only a done task/);
T.dismiss(a, 'front'); assert.ok(a.dismissed && !T.onMap(a));
// map: a done task leaves the map after MAP_DONE_MS
assert.ok(T.onMap(r3)); t += MAP_DONE_MS + 1; assert.ok(!T.onMap(r3));
// follow-ups: a note on a closed task keeps it closed; new work starts a child task
assert.strictEqual(T.followup(r3, 'front', 'thanks!'), null); assert.strictEqual(r3.status, 'done');
const c = T.followup(r3, 'front', 'please also add the monthly chart');
assert.ok(c && c.parent === r3.id && c.to === 'brain' && c.status === 'queued');
assert.strictEqual(T.followup(r2, 'front', 'any news?'), null); assert.strictEqual(r2.thread.at(-1).kind, 'followup');
// replies and the sweep
const w = T.create({ from: 'api-lead', to: 'alpha', text: 'GOAL: rotate the test keys' }); T.delivery(w, 'delivered');
assert.strictEqual(T.replied('alpha', 'api-lead', 'rotated, new ones in the vault'), w);
assert.strictEqual(T.replied('alpha', 'nobody', 'x'), null);
assert.deepStrictEqual(T.sweep(), []);
t += SWEEP_MS + 1;
assert.deepStrictEqual(T.sweep().map(x => x.id), [w.id]); assert.strictEqual(w.result, 'rotated, new ones in the vault');
// markFyi, setTitle, link
T.markFyi(r2, 'brain'); assert.ok(r2.fyi && r2.status === 'done');
T.setTitle(c, 'Monthly chart', 'Add a chart of monthly uptime', 'brain'); assert.deepStrictEqual([c.title, c.desc, c.titleBy], ['Monthly chart', 'Add a chart of monthly uptime', 'brain']);
const top = T.create({ from: 'front', to: 'brain', text: 'GOAL: quarterly report' });
assert.throws(() => T.link(top, c), /top-level/);
T.link(c, top); assert.strictEqual(c.parent, top.id);
// backfill: an empty result gets the agent's own report from the event log
const e1 = T.create({ from: 'brain', to: 'beta', text: 'GOAL: check the backups' }); T.delivery(e1, 'delivered');
t += 1000; T.finish(e1, 'replied', 'beta');
const bf = T.backfill([{ type: 'msg', from: 'beta', to: 'brain', text: `${e1.id}: backups verified, restore tested`, ts: t - 500 }]);
assert.strictEqual(bf.results, 1); assert.strictEqual(e1.result, `${e1.id}: backups verified, restore tested`);
assert.strictEqual(T.backfill([]).results, 0, 'filled once only');
// list filters and pub
assert.strictEqual(T.list({ status: 'cancelled' }).length, 1);
assert.strictEqual(T.list({ status: 'fyi' }).length, 2);
assert.ok(T.list({ q: 'backups' }).some(x => x.id === e1.id));
assert.ok(!('body' in T.pub(k1)));
// persisted and reloaded; ids continue
const T2 = makeTasks({ file, now });
assert.strictEqual(T2.get('t-1').status, 'done'); assert.strictEqual(T2.items().length, T.items().length);
assert.strictEqual(T2.create({ from: 'a', to: 'b', text: 'x' }).id, 'T-' + (T.items().length + 1));
let fired = 0; T2.onChange(() => fired++); T2.save(); assert.strictEqual(fired, 1); assert.ok(T2.version() >= 1);
assert.ok(logs.some(s => /cancelled by brain/.test(s)));
fs.rmSync(dir, { recursive: true });
console.log('tasks ok');

'use strict';
const assert = require('assert');
const C = require('../src/lib/card-done');
const H = 3600e3;
const opts = { legacyT: Date.UTC(2026, 0, 1), trackT: Date.UTC(2026, 0, 8) };
const T = opts.trackT + 100 * H;
const nodes = { brain: { id: 'brain' }, 'api-lead': { id: 'api-lead', parent: 'brain' }, alpha: { id: 'alpha', parent: 'api-lead' },
  gone: { id: 'gone', parent: 'api-lead', stopped: true }, other: { id: 'other', parent: 'brain' } };
const q = { id: 'q1', label: 'X', type: 'one', options: [{ v: 'o1', l: 'Go ahead' }] };
const card = (id, from, sentAt, extra = {}) => ({ id, title: 't ' + id, from, status: 'sent', sentAt, sent: [{ q, a: 'o1', at: sentAt }], thread: [], ...extra });

// --- state and nagging
const items = [
  card('a1', 'alpha', T - 30 * H),                                  // overdue -> nag alpha
  card('a2', 'gone', T - 30 * H),                                   // asker stopped -> parent
  card('a3', 'alpha', T - 2 * H),                                   // too fresh
  card('a4', 'alpha', T - 30 * H, { done: { at: T, by: 'alpha', text: 'ok' } }),
  card('a5', 'alpha', opts.legacyT - H),                            // legacy
  card('a6', 'alpha', opts.trackT - H),                             // backlog, not nagged
  card('a7', 'removed', T - 30 * H),                                // removed asker -> brain
  card('a8', 'alpha', T - 30 * H, { thread: [{ from: 'alpha', text: '✓ chat close', at: T - 29 * H }] }),
  { ...card('a9', 'alpha', T - 30 * H), status: 'closed' },
];
assert.strictEqual(C.state(items[0], opts), 'waiting');
assert.strictEqual(C.state(items[3], opts), 'done');
assert.strictEqual(C.state(items[4], opts), 'legacy');
assert.strictEqual(C.state(items[4]), 'waiting', 'no legacy cut-off by default');
assert.strictEqual(C.state(items[7], opts), 'done');
assert.strictEqual(C.doneOf(items[7]).text, 'chat close');
assert.strictEqual(C.state(items[8], opts), null);
const st = {};
const r = C.check(items, nodes, st, T, opts);
assert.deepStrictEqual(r.due.map(x => x.id + '>' + x.to), ['a1>alpha', 'a2>api-lead', 'a7>brain']);
assert.strictEqual(r.backlog, 1);
assert.strictEqual(r.lines.length, 3);
assert.ok(/cmd resolve a1/.test(r.due[0].text) && /Go ahead/.test(r.due[0].text) && / UTC:/.test(r.due[0].text));
assert.ok(/ Europe\/Berlin:/.test(C.check(items, nodes, {}, T, { ...opts, tz: 'Europe/Berlin' }).due[0].text), 'message times follow tz');
for (const x of r.due) st.sent[x.id] = T;
const r2 = C.check(items, nodes, st, T + 23 * H, opts);
assert.deepStrictEqual(r2.due.map(x => x.id), ['a3']); assert.strictEqual(r2.lines.length, 4);
assert.strictEqual(C.check(items, nodes, st, T + 25 * H, opts).due.length, 4, 'once per nag window');
assert.strictEqual(C.check(items, nodes, {}, T, { ...opts, nagH: 48 }).due.length, 0, 'nagH is configurable');
assert.ok(C.mayResolve(items[0], 'alpha', nodes) && C.mayResolve(items[0], 'api-lead', nodes) && C.mayResolve(items[0], 'brain', nodes));
assert.ok(!C.mayResolve(items[0], 'other', nodes));
const au = C.audit(items, [{ id: 'c1', title: 'did a6', what: '', why: '', revert: '' }, { id: 'c2', title: 'a60 thing' }], opts);
assert.deepStrictEqual(au.find(x => x.id === 'a6').changelog, ['c1 did a6']);
// waiting on the person (a key, a login): no nag, listed as owner; a later done wins
const ow = card('a1', 'alpha', T - 30 * H, { waiting: { at: T - 29 * H, by: 'alpha', text: 'API key' }, thread: [{ from: 'alpha', text: '✓ not done: waiting for key', at: T - 29 * H }] });
assert.strictEqual(C.state(ow, opts), 'owner');
const rw = C.check([ow], nodes, {}, T, opts);
assert.deepStrictEqual(rw.due, []); assert.deepStrictEqual(rw.lines, []); assert.deepStrictEqual(rw.owner, ['a1 API key']);
assert.strictEqual(C.state({ ...ow, done: { at: T, by: 'alpha', text: 'key in, live' } }, opts), 'done');
assert.ok(C.NOT_DONE.test('Not done: waiting for key') && !C.NOT_DONE.test('done, not done later'));

// --- a changelog entry naming an answered card closes it (asker, its branch below, or its parent only)
const tree = { brain: { id: 'brain' }, lead: { id: 'lead', parent: 'brain' }, app: { id: 'app', parent: 'lead' },
  dev: { id: 'dev', parent: 'app' }, other: { id: 'other', parent: 'brain' } };
const ac = (id, extra = {}) => ({ id, title: 't ' + id, from: 'app', status: 'sent', sentAt: T - H, sent: [{ q: { id: 'q', type: 'text' }, a: 'yes', at: T }], thread: [], ...extra });
const set = () => [ac('a10'), ac('a11'), ac('a12'), { ...ac('a13'), status: 'open' }, ac('a14', { waiting: { at: T, by: 'app', text: 'key' } }),
  { ...ac('a15'), status: 'withdrawn' }, ac('a16', { done: { at: T, by: 'app', text: 'ok' } })];
const e = (by, title, what = '') => ({ id: 'c9', at: T, by, title, what });
assert.deepStrictEqual(C.namedCards(e('x', 'a10 + a11 done', 'also a10, not xa12 or a12b or a12345')), ['a10', 'a11']);
let it = set(), cl = C.autoClose(it, e('app', 'reminders live (a10)'), tree);
assert.deepStrictEqual(cl.map(x => x.id), ['a10']);
assert.strictEqual(it[0].done.text, 'c9: reminders live (a10)');
assert.strictEqual(C.state(it[0]), 'done');
assert.strictEqual(it[0].thread.at(-1).text, '✓ c9: reminders live (a10)');
it = set(); assert.deepStrictEqual(C.autoClose(it, e('dev', 'x', 'did a11'), tree).map(x => x.id), ['a11'], 'id in what, from below');
it = set(); assert.deepStrictEqual(C.autoClose(it, e('lead', 'a12 shipped'), tree).map(x => x.id), ['a12'], 'from the parent');
it = set(); assert.deepStrictEqual(C.autoClose(it, e('app', 'a13 a14 a15 a16'), tree), [], 'open, owner-waiting, withdrawn, done: left alone');
assert.strictEqual(it[3].done, undefined); assert.strictEqual(C.state(it[4]), 'owner'); assert.strictEqual(it[6].done.text, 'ok');
it = set(); assert.deepStrictEqual(C.autoClose(it, e('other', 'a10'), tree), []); assert.strictEqual(it[0].done, undefined);
assert.deepStrictEqual(C.autoClose(it, e('brain', 'a10'), tree), [], 'two levels up is not the parent');
assert.deepStrictEqual(C.autoClose(set(), e('app', 'a99'), tree), [], 'unknown id');
// card id pattern is configurable
assert.deepStrictEqual(C.autoClose([ac('Q-1')], e('app', 'did Q-1'), tree, { cardRe: /\bQ-\d+\b/g }).map(x => x.id), ['Q-1']);
console.log('card-done ok');

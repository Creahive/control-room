'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const R = require('../src/lib/rules');
const fresh = () => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'rules.default.json'), 'utf8'));

// the default set is well formed: unique ids, known groups, every rule reaches somewhere, risky ones say why
let doc = fresh();
const ids = doc.rules.map(r => r.id), groups = new Set(R.GROUPS.map(g => g[0]));
assert.strictEqual(new Set(ids).size, ids.length);
assert.ok(doc.rules.length >= 6 && doc.rules.length <= 10);
for (const r of doc.rules) {
  assert.ok(r.title && r.desc && r.source && groups.has(r.group), r.id);
  assert.ok(r.claudeMd || (r.prompt || []).length || r.code, r.id);
  if (r.confirm) assert.ok(r.risk, r.id);
  if (r.claudeMd) assert.ok(/^- /.test(r.claudeMd.text), r.id);
}

// render: head, generated note, on lines in `at` order; prompt blocks joined by their separators
const md = R.renderClaudeMd(doc), mdLines = md.split('\n');
assert.strictEqual(mdLines[0], doc.claudeMdHead); assert.strictEqual(mdLines[1], R.MD_NOTE);
const want = doc.rules.filter(r => r.claudeMd).sort((a, b) => a.claudeMd.at - b.claudeMd.at).map(r => r.claudeMd.text);
assert.strictEqual(md, `${doc.claudeMdHead}\n${R.MD_NOTE}\n\n${want.join('\n')}\n`);
const p0 = R.renderPrompt(doc);
assert.ok(p0.includes('{{compactK}}') && R.renderPrompt(doc, { compactK: 150 }).endsWith('ends above 150K.'));
assert.ok(R.renderPrompt(doc).includes('Never delete files') && R.renderPrompt(doc).includes('\nBefore every change'), 'a "\\n" block stays in the same paragraph');

// a small hand-made document checks join order exactly
const mini = { claudeMdHead: '# H', rules: [
  { id: 'b', group: 'workflow', title: 'B', desc: 'd', source: 's', prompt: [{ at: 2, join: '\n\n', text: 'second' }], claudeMd: { at: 2, text: '- two' } },
  { id: 'a', group: 'safety', title: 'A', desc: 'd', source: 's', prompt: [{ at: 1, join: '\n\n', text: 'first' }, { at: 3, join: '\n', text: 'third' }], claudeMd: { at: 1, text: '- one' } }] };
assert.strictEqual(R.renderPrompt(mini), 'first\n\nsecond\nthird');
assert.strictEqual(R.renderClaudeMd(mini), `# H\n${R.MD_NOTE}\n\n- one\n- two\n`);
R.toggle(mini, 'a', false, 'u-owner', 1);
assert.strictEqual(R.renderPrompt(mini), 'second'); assert.strictEqual(R.renderClaudeMd(mini), `# H\n${R.MD_NOTE}\n\n- two\n`);

// toggle: off drops a rule from both texts, on brings it back verbatim; unknown ids are on
doc = fresh();
assert.ok(R.on(doc, 'no-delete') && R.on(doc, 'no-such-rule') && R.on(null, 'no-delete'));
let t = R.toggle(doc, 'no-delete', false, 'u-owner', 1);
assert.ok(t.changed && !R.on(doc, 'no-delete') && t.rule.changedBy === 'u-owner');
assert.ok(!R.renderClaudeMd(doc).includes(R.byId(doc, 'no-delete').claudeMd.text) && !R.renderPrompt(doc).includes('Never delete files'));
assert.strictEqual(R.toggle(doc, 'no-delete', false, 'u-owner', 2).changed, false);
R.toggle(doc, 'no-delete', true, 'u-owner', 3);
assert.strictEqual(R.renderClaudeMd(doc), md); assert.strictEqual(R.renderPrompt(doc), p0);
assert.throws(() => R.toggle(doc, 'nope', false, 'x', 8), /no rule/);

// hand edits of CLAUDE.md: a new line becomes a rule, a changed line updates its rule, a removed line turns it off
doc = fresh();
const body = md.replace(R.MD_NOTE + '\n', '').replace(/\n$/, '').split('\n');
const edited = body.map(l => l.startsWith('- Report results') ? l + ' EDITED' : l).filter(l => !l.startsWith('- Run heavy jobs')).concat(['- A brand new rule by hand.']).join('\n') + '\n';
const ad = R.adopt(doc, edited, 1000);
assert.strictEqual(ad.added.length, 1); assert.deepStrictEqual(ad.edited, ['report-results']); assert.deepStrictEqual(ad.off, ['heavy-jobs']);
const nr = R.byId(doc, ad.added[0]);
assert.ok(nr.on && nr.adopted && nr.group === 'workflow' && nr.claudeMd.text === '- A brand new rule by hand.');
assert.strictEqual(R.renderClaudeMd(doc).replace(R.MD_NOTE + '\n', ''), edited);
doc = fresh();
assert.deepStrictEqual(R.adopt(doc, R.renderClaudeMd(doc), 1), { added: [], edited: [], off: [] }, 'the generated file adopts nothing');
assert.deepStrictEqual(R.bullets('x\n- a\n  more\n- b\n'), ['- a\n  more', '- b']);

// provenance: a test toggle is labelled TEST and logged under the agent, never as the owner
const owner = { id: 'owner', name: 'Owner', admin: true };
const pt = R.provenance({ user: 'owner', test: 'rules-tab-test' }, owner, '127.0.0.1');
assert.deepStrictEqual([pt.by, pt.test], ['rules-tab-test', true]);
assert.ok(/testsession of rules-tab-test/.test(pt.via) && /TEST/.test(pt.via));
const pb = R.provenance({ user: 'owner' }, owner, '192.0.2.10');
assert.deepStrictEqual(pb, { by: 'u-owner', via: 'owner browser (192.0.2.10)', test: false });
assert.strictEqual(R.provenance(null, { id: 'g1', name: 'Guest' }, '').via, 'Guest browser');
doc = fresh();
const nq = R.toggle(doc, 'quiet-hours', false, pt, 10).rule;
assert.ok(nq.changedTest && nq.changedBy === 'rules-tab-test' && nq.history.length === 1 && nq.history[0].test && nq.history[0].via === pt.via);
let ce = R.changeEntry(nq, false, pt);
assert.strictEqual(ce.by, 'rules-tab-test');
assert.ok(ce.entry.title.startsWith('TEST: Rule turned off: ') && /a test \(testsession/.test(ce.entry.why) && /hub code: quiet-hours window/.test(ce.entry.what));
let fl = R.fyiLine(nq, false, pt, 'c1');
assert.ok(fl.startsWith('FYI: TEST toggle, NOT the owner: testsession of rules-tab-test') && /Do not relay it/.test(fl));
R.toggle(doc, 'quiet-hours', true, pb, 11);
assert.strictEqual(nq.history.length, 2); assert.ok(!nq.changedTest && nq.changedVia === 'owner browser (192.0.2.10)' && !('test' in nq.history[1]));
ce = R.changeEntry(nq, true, pb);
assert.ok(ce.by === 'u-owner' && ce.entry.title === 'Rule turned on: Quiet hours [quiet-hours]' && /the owner \(owner browser/.test(ce.entry.why));
fl = R.fyiLine(nq, true, pb, 'c2');
assert.ok(fl.startsWith('FYI: the owner turned the fleet rule "quiet-hours"') && fl.includes('session: owner browser (192.0.2.10)'));

// view: groups in order, every rule once; custom groups from the document win
const v = R.view(doc, true);
assert.deepStrictEqual(v.map(g => g.label), R.GROUPS.map(g => g[1]));
assert.strictEqual(v.reduce((n, g) => n + g.rules.length, 0), doc.rules.length);
const vr = v.flatMap(g => g.rules).find(r => r.id === 'quiet-hours');
assert.ok(vr.history.length === 2 && vr.history[0].test && vr.where.includes('hub code') && vr.codeWhat);
assert.deepStrictEqual(R.view({ ...mini, groups: [['safety', 'Guard rails']] }).map(g => g.label), ['Guard rails']);

// load / save round trip
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-test-')), f = path.join(dir, 'rules.json');
assert.strictEqual(R.load(f), null);
R.save(f, doc); assert.deepStrictEqual(R.load(f), doc);
fs.rmSync(dir, { recursive: true });
console.log('rules ok');

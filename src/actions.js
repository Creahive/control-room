'use strict';
/* Decision cards: an agent asks the human a short question with tick-box answers (cmd ask); the human answers on the
 * card and the answer goes straight back to the agent that asked. The human can also talk on a card; an agent answers
 * there with cmd reply and closes it with cmd resolve once it carried the decision out. */
const path = require('path');
const { now, readJSON, writeJSON } = require('./util');

module.exports = function actions(hub) {
  const F = path.join(hub.cfg.dataDir, 'actions.json');
  const st = readJSON(F, null) || { next: 1, items: [] };
  const save = () => writeJSON(F, st);
  const tree = hub.tree;
  const askerOf = it => (tree.nodes[it.from] && !tree.nodes[it.from].stopped ? tree.nodes[it.from] : tree.nodes.brain);

  function cleanQuestion(q, i) {
    const type = ['one', 'many', 'text'].includes(q.type) ? q.type : (q.options && q.options.length ? 'one' : 'text');
    const options = type === 'text' ? [] : (q.options || []).slice(0, 8).map((o, j) => typeof o === 'string'
      ? { v: 'o' + (j + 1), l: o.replace(/^\*/, '').trim(), rec: o.startsWith('*') }
      : { v: String(o.v || 'o' + (j + 1)).slice(0, 40), l: String(o.l || o.label || '').slice(0, 120), rec: !!o.rec });
    if (type !== 'text' && options.length < 2) throw new Error(`question ${i + 1} needs at least 2 options`);
    return { id: 'q' + (i + 1), label: String(q.label || '').slice(0, 120), type, options, placeholder: String(q.placeholder || '').slice(0, 120) };
  }
  function ask(fromId, b) {
    const title = String(b.title || '').trim();
    if (!title || title.length > 120) throw new Error('title: one short question, at most 120 characters');
    const qs = (b.questions || []).slice(0, 8).map(cleanQuestion);
    if (!qs.length) throw new Error('at least one question');
    const from = tree.nodes[fromId] ? fromId : 'brain';
    const it = { id: 'a' + st.next++, title, from, detail: String(b.detail || '').slice(0, 4000), questions: qs,
      answers: {}, note: '', status: 'open', createdAt: now(), kind: b.kind === 'delete' ? 'delete' : 'decision', thread: [] };
    st.items.push(it); save();
    hub.logEvent({ type: 'msg', from, to: 'front', text: `asks: ${title}` });
    return it;
  }
  function chat(it, from, text) {
    text = String(text || '').trim().slice(0, 4000); if (!text) throw new Error('empty message');
    (it.thread = it.thread || []).push({ from, text, at: now() });
    it.updatedAt = now(); save();
    if (from === 'owner') {
      const to = askerOf(it);
      hub.deliver(to, `[actions-chat ${it.id}] The human wrote on your decision "${it.title}":\n${text}\n` +
        'If this decides it (in any wording), it IS the answer: carry it out now exactly as they said, then close the card with: ' +
        `cmd resolve ${it.id} "what you did". If it is a question, answer on the card (short, facts, your recommendation): cmd reply ${it.id} "...".`);
      hub.logEvent({ type: 'msg', from: 'front', to: to.id, text: `about ${it.id}: ${text.slice(0, 200)}` });
    } else hub.logEvent({ type: 'msg', from, to: 'front', text: `answers on ${it.id}: ${text.slice(0, 200)}` });
  }
  const answered = (it, q) => { const a = it.answers[q.id]; return q.type === 'text' ? !!String(a || '').trim() : Array.isArray(a) ? a.length > 0 : !!a; };
  const label = (q, a) => (Array.isArray(a) ? a : a ? [a] : []).map(v => q.type === 'text' ? String(v) : String(v).startsWith('other:') ? `own answer: "${String(v).slice(6)}"` : (q.options.find(o => o.v === v) || {}).l || v).join(', ');
  const answerText = (it, qs) => qs.map(q => `- ${q.label || 'Answer'}: ${label(q, it.answers[q.id]) || '-'}`).join('\n') + (it.note ? `\nNote: ${it.note}` : '');

  /** Send what is answered; unanswered questions stay open on the card for later. */
  function send(it, u, extra = '') {
    const done = it.questions.filter(q => answered(it, q)), left = it.questions.filter(q => !answered(it, q));
    if (!done.length && !String(it.note || '').trim()) throw new Error('nothing answered yet');
    const to = askerOf(it), body = answerText(it, done);
    hub.deliver(to, `[actions] ${u.admin ? 'The admin' : u.name} answered decision ${it.id}, "${it.title}"${left.length ? ' (in part)' : ''}:\n${body}` +
      (left.length ? `\nStill open, decided later (do not ask again, do not act on these): ${left.map(q => q.label || 'the main question').join('; ')}` : '') +
      '\n(Act on it; if it changes plans for others, tell them.)' + extra);
    hub.logEvent({ type: 'msg', from: 'u-' + u.id, to: to.id, text: `${it.title}: ${body.slice(0, 200)}` });
    it.sent = (it.sent || []).concat(done.map(q => ({ q, a: it.answers[q.id], at: now() })));
    for (const q of done) delete it.answers[q.id];
    it.questions = left; it.note = ''; it.sentAt = now(); it.sentTo = to.id; it.snoozed = false;
    if (!left.length) it.status = 'sent';
    save();
    if (to.parked && !to.parked.hold) hub.unparkNode(to.id, 'u-' + u.id, `answered ${it.id}`);
  }
  function close(it, u) {
    const to = askerOf(it);
    const ans = (it.sent || []).map(x => label(x.q, x.a)).filter(Boolean);
    hub.deliver(to, ans.length ? `[actions] ${it.id} closed after answering ("${it.title}"): ${ans.join('; ')}.\n(The answer stands. Do not ask it again.)`
      : `[actions] ${it.id} closed: no longer needed ("${it.title}").\n(Do not act on it and do not ask it again.)`);
    it.status = 'closed'; it.closedBy = u.id; it.closedAt = now(); it.updatedAt = now(); it.sentTo = to.id;
    save();
  }
  /** The agent carried out what the human said on the card. */
  function resolve(it, by, text) {
    (it.thread = it.thread || []).push({ from: by, text: '✓ ' + String(text || 'done').slice(0, 2000), at: now() });
    it.done = { at: now(), by, text: String(text || 'done').slice(0, 2000) };
    if (it.status === 'open') { it.status = 'closed'; it.closedAt = now(); it.closedBy = by; }
    it.updatedAt = now(); save();
  }
  function withdraw(it, by, why) {
    if (it.status !== 'open') throw new Error(`${it.id} is ${it.status}`);
    it.status = 'withdrawn'; it.withdrawnAt = now(); it.why = String(why || '').slice(0, 400); it.updatedAt = now(); save();
    hub.logEvent({ type: 'care', from: by, to: 'front', text: `withdrew ${it.id}: ${it.title}` });
  }
  function setAnswers(it, b) {
    if (b.answers && typeof b.answers === 'object') it.answers = Object.fromEntries(Object.entries(b.answers).filter(([k]) => it.questions.some(q => q.id === k))
      .map(([k, v]) => [k, Array.isArray(v) ? v.map(x => String(x).slice(0, 1000)) : String(v).slice(0, 1000)]));
    if (typeof b.note === 'string') it.note = b.note.slice(0, 1000);
    if (typeof b.snoozed === 'boolean') it.snoozed = b.snoozed;
    it.updatedAt = now(); save();
  }
  const get = id => st.items.find(i => i.id === id);
  const recent = () => st.items.filter(i => i.status === 'open' || now() - (i.sentAt || i.withdrawnAt || i.closedAt || 0) < 3 * 86400e3);

  hub.actions = { ask, chat, send, close, resolve, withdraw, setAnswers, get, recent, items: () => st.items, save,
    openCount: () => st.items.filter(i => i.status === 'open' && !i.snoozed).length,
    lastAt: () => Math.max(0, ...st.items.map(i => i.updatedAt || i.sentAt || i.createdAt || 0)) };
};

'use strict';
/* Demo mode (CONTROL_ROOM_DEMO=1 or `control-room --demo`): a made-up fleet with no Claude and no tmux behind it, for trying the
 * UI and for README screenshots. Agents "answer" with canned lines, pass made-up messages around and spend made-up
 * tokens. Everything here is fiction; nothing is read from the machine. */
const { now } = require('./util');

const FLEET = [
  { id: 'brain', name: 'BRAIN', role: 'brain', parent: null, state: 'idle', last: 'Routing: checkout bug -> Webshop lead' },
  { id: 'front', name: 'Front desk', role: 'front', parent: null, state: 'idle', last: 'Passed your request to BRAIN', user: 'owner' },
  { id: 'webshop', name: 'Webshop', role: 'lead', parent: 'brain', cwd: '/srv/projects/webshop', state: 'working', last: 'Running the checkout test suite' },
  { id: 'checkout-fix', name: 'Checkout fix', role: 'worker', parent: 'webshop', cwd: '/srv/projects/webshop', state: 'working', last: 'Editing src/cart/total.ts', subs: ['Explore: tax rules'] },
  { id: 'product-feed', name: 'Product feed', role: 'worker', parent: 'webshop', cwd: '/srv/projects/webshop', state: 'idle', last: 'Feed validated: 1,204 items, 0 errors' },
  { id: 'mobile-app', name: 'Mobile app', role: 'lead', parent: 'brain', cwd: '/srv/projects/mobile-app', state: 'idle', last: 'Release 2.3.0 notes drafted' },
  { id: 'push-notify', name: 'Push notifications', role: 'project', parent: 'mobile-app', cwd: '/srv/projects/mobile-app', state: 'working', last: 'Wiring the token refresh' },
  { id: 'docs-site', name: 'Docs site', role: 'lead', parent: 'brain', cwd: '/srv/projects/docs', state: 'idle', last: 'Broken links: 3 fixed', parked: true },
  { id: 'data-pipeline', name: 'Data pipeline', role: 'lead', parent: 'brain', cwd: '/srv/projects/pipeline', state: 'asleep', last: 'Nightly import finished' },
  { id: 'search-index', name: 'Search index', role: 'worker', parent: 'data-pipeline', cwd: '/srv/projects/pipeline', state: 'stopped', last: '' },
];
const CHAT = {
  front: [
    ['user', 'Can someone look at why the checkout total is off by a cent on some orders?'],
    ['assistant', 'On it: I passed it to BRAIN, who will route it to the Webshop lead. I will tell you what they find.'],
    ['agent', 'Webshop', 'Found it: rounding happened per line instead of per order. Fix in review, tests green.'],
    ['assistant', 'The Webshop team found the cause (rounding per line instead of per order). A fix is in review and the tests pass.'],
  ],
  webshop: [
    ['agent', 'BRAIN', 'Checkout total is off by a cent on some orders. Find the cause and fix it.'],
    ['assistant', 'Spawning a worker for the fix; I will review it.'],
    ['tool', 'Bash: cmd spawn --name "Checkout fix" --role worker ...'],
    ['agent', 'Checkout fix', 'Cause: per-line rounding in total.ts. Patch + 4 new tests.'],
    ['assistant', 'Reviewed: rounding now happens once per order. Running the full suite.'],
  ],
};
const REPLIES = ['On it.', 'Done: tests pass (42/42).', 'Looked into it: the cause is a stale cache key. Fix pushed.', 'Noted, I will pick this up after the current step.', 'Report sent to my lead.'];
const CHATTER = [
  ['brain', 'docs-site', 'FYI: the API changed its pagination; update the examples when you are back.'],
  ['checkout-fix', 'webshop', 'Patch ready for review: src/cart/total.ts, 4 new tests.'],
  ['push-notify', 'mobile-app', 'Token refresh works on both platforms; opening a PR.'],
  ['webshop', 'brain', 'Checkout rounding fixed and deployed to staging.'],
  ['mobile-app', 'brain', 'Release 2.3.0 is ready for store review.'],
  ['product-feed', 'webshop', 'Feed validated: 1,204 items, 0 errors.'],
];

module.exports = function demo(hub) {
  const { tree } = hub;
  const t0 = now();
  if (!Object.keys(tree.nodes).length || !tree.nodes.webshop) {
    for (const [i, f] of FLEET.entries()) {
      tree.nodes[f.id] = { id: f.id, name: f.name, role: f.role, parent: f.parent, account: f.role === 'brain' || f.role === 'front' ? 'main' : 'team', cwd: f.cwd || hub.cfg.home, createdAt: t0 - (FLEET.length - i) * 3600e3,
        brief: `Demo agent (${f.role}).`, sessionId: 'demo-' + f.id, pane: 'demo', demoState: f.state === 'asleep' || f.state === 'stopped' ? 'idle' : f.state,
        demoLast: f.last, demoCtx: 20000 + i * 17000, demoSubs: (f.subs || []).map((l, j) => ({ id: f.id + '-s' + j, label: l, active: true })),
        demoChat: (CHAT[f.id] || []).map(([role, a, b]) => (role === 'agent' ? { role, from: a, fromId: a.toLowerCase(), text: b } : { role, text: a }))
          .map((m, j) => ({ ...m, ts: t0 - (10 - j) * 60e3 })),
        ...(f.user ? { user: f.user } : {}), ...(f.state === 'stopped' ? { stopped: true, stoppedAt: t0 - 7200e3 } : {}),
        ...(f.state === 'asleep' ? { asleep: { at: t0 - 1800e3, why: 'idle while the machine was loaded' } } : {}),
        ...(f.parked ? { parked: { at: t0, why: 'waiting for the API release', until: t0 + 6 * 3600e3, hold: false } } : {}) };
      hub.addDemoTokens(f.id, 150000 + i * 91000, +(1.2 + i * 0.7).toFixed(2));
    }
    hub.saveTree();
    const T = hub.tasks;
    try {
      T.create({ from: 'front', to: 'brain', text: 'Checkout total is off by a cent on some orders', by: 'u-owner' });
      const t = T.create({ from: 'brain', to: 'webshop', text: 'Find and fix the checkout rounding bug', by: 'brain' }); T.delivery(t, 'delivered');
      T.create({ from: 'mobile-app', to: 'push-notify', text: 'Fix push token refresh on Android', by: 'mobile-app' });
      const j = hub.jobs.create({ title: 'Fix checkout rounding', ask: 'checkout total off by a cent', owner: 'webshop', by: 'brain' });
      hub.jobs.start(j, 'webshop'); hub.jobs.step(j, 'webshop', 'Cause found: per-line rounding', { pct: 60, next: 'review + deploy to staging' });
      const j2 = hub.jobs.create({ title: 'Release 2.3.0', owner: 'mobile-app', by: 'brain' });
      hub.jobs.start(j2, 'mobile-app'); hub.jobs.step(j2, 'mobile-app', 'Release notes drafted', { pct: 80, next: 'store review' });
      hub.actions.ask('docs-site', { title: 'Move the docs to the new domain now or after the release?', detail: 'Demo question.',
        questions: [{ label: 'When', type: 'one', options: ['*After the release', 'Now', 'Not at all'] }] });
      hub.addChange('webshop', { title: 'Checkout: round once per order', what: 'src/cart/total.ts (demo)', revert: 'git revert <commit>', why: 'cent differences on orders' });
    } catch (e) { console.error('[demo] seed:', e.message); }
  }

  /** A message "typed" into a demo agent: it shows in its chat, the agent works a moment and answers. */
  hub.demoDeliver = (n, text) => {
    const from = String(text).match(/^📨 from (.+?) \[([a-z0-9.-]+)/);
    (n.demoChat = n.demoChat || []).push(from ? { role: 'agent', from: from[1], fromId: from[2], text: String(text).split('\n').slice(1).join('\n').replace(/\n\([^)]*\)\s*$/, ''), ts: now() } : { role: 'user', text: String(text), ts: now() });
    n.demoState = 'working'; n.demoLast = 'Thinking…'; hub.saveTree();
    setTimeout(() => {
      const r = REPLIES[Math.floor(Math.random() * REPLIES.length)];
      n.demoChat.push({ role: 'assistant', text: r, ts: now() }); n.demoState = 'idle'; n.demoLast = r; hub.saveTree();
      if (from && tree.nodes[from[2]] && from[2] !== n.id && !hub.isDesk(from[2])) hub.logEvent({ type: 'msg', from: n.id, to: from[2], text: r });
    }, 2500 + Math.random() * 2500).unref();
  };
  hub.demoChat = n => n.demoChat || [];
  hub.demoSkills = () => [['code-review', 'Review a diff for bugs, style and missing tests.'], ['release-notes', 'Draft release notes from merged changes.'], ['db-migrate', 'Plan and check a database migration.']]
    .map(([id, d], i) => ({ id, name: id, description: d, on: i < 2, files: ['SKILL.md'], scripts: false, source: '', repo: '', words: 300 + i * 120 }));
  hub.demoServer = () => ({ at: now(), cpu: 23, cores: 8, load: [1.4, 1.2, 1.1], loadP: 18, mem: { used: 6.1e9, total: 16e9, p: 38 }, swap: { used: 0, total: 2e9, p: 0 },
    disk: { used: 120e9, total: 500e9, p: 24 }, uptime: 864000, level: 'ok' });

  let k = 0;
  setInterval(() => {
    const [a, b, text] = CHATTER[k++ % CHATTER.length];
    if (!tree.nodes[a] || !tree.nodes[b]) return;
    const n = tree.nodes[a];
    if (!n.stopped && !n.asleep) { n.demoState = 'working'; n.demoLast = text; setTimeout(() => { n.demoState = 'idle'; hub.saveTree(); }, 4000).unref(); }
    hub.logEvent({ type: 'msg', from: a, to: b, text });
    hub.saveTree();
  }, 7000).unref();
};

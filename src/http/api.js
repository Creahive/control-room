'use strict';
/* The browser API (/api/*) for a signed-in person. Permissions are checked here; the UI only hides what a person
 * may not use. Shapes are documented in docs/API.md. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { now, oneLine, rid } = require('../util');
const { send, body, ipOf } = require('./util');
const CLGROUP = require('../lib/changelog-group');
const { MAP_DONE_MS } = require('../lib/tasks');

const UPLOAD_MAX = 25 * 1024 * 1024;
const SKILL_ID = /^[a-z0-9][a-z0-9._-]{0,80}$/i, SKILL_FILE = /^[\w.-]+\.(md|txt|json|ya?ml)$/i;

module.exports = function apiRoutes(hub) {
  const { cfg, tree } = hub;
  const chatCache = {};

  /* ---- chat history across the sessions an agent had */
  function chatHistory(n, max = 400) {
    if (hub.demo) return hub.demoChat(n).slice(-max);
    const isDesk = id => hub.isDesk(id);
    let out = n.sessionId ? hub.claude.conversation(n.sessionId, max, isDesk) : [];
    for (const sid of [...(n.sessions || [])].reverse().slice(0, 5)) {
      if (out.length >= max) break;
      if (sid !== n.sessionId) out = [...hub.claude.conversation(sid, max, isDesk), ...out];
    }
    return out.slice(-max);
  }
  function chatKey(n, st) {
    if (hub.demo) return (n.demoChat || []).length + '|' + st.state;
    const parts = [n.sessionId, ...(n.sessions || []).slice(-5)].filter(Boolean).map(sid => { try { const x = fs.statSync(hub.claude.transcriptPath(sid, n.cwd)); return x.size + ':' + x.mtimeMs; } catch { return '-'; } });
    return [parts.join(','), (hub.pending[n.id] || []).length, (hub.pending[n.id] || []).join('').length, st.state, n.sessionId].join('|');
  }

  /* ---- tab data */
  function settings() {
    const snap = hub.snapshot();
    const accounts = cfg.accounts.map(a => ({ id: a.id, label: a.label || a.id, configDir: a.configDir, email: hub.demo ? a.email || null : hub.claude.email(a.id),
      signedIn: hub.demo ? true : hub.claude.signedIn(a.id), running: snap.nodes.filter(n => n.account === a.id && !['stopped', 'offline'].includes(n.state)).length,
      agents: snap.nodes.filter(n => n.account === a.id && !['stopped', 'offline'].includes(n.state)).map(n => n.name),
      roles: Object.entries(cfg.roles || {}).filter(([, v]) => [].concat(v).includes(a.id)).map(([k]) => ({ front: 'Front desks', brain: 'BRAIN', fleet: 'Leads + their agents' })[k]) }));
    const projects = hub.projects().map(x => {
      const lead = snap.nodes.find(n => n.role === 'lead' && (tree.nodes[n.id] || {}).cwd === x.cwd);
      let md = null; for (const f of [path.join(x.cwd, 'CLAUDE.md'), path.join(x.cwd, '.claude', 'CLAUDE.md')]) if (fs.existsSync(f)) { md = f; break; }
      return { ...x, lead: lead ? { id: lead.id, state: lead.state } : null, claudeMd: md };
    });
    const agents = snap.nodes.map(n => ({ id: n.id, name: n.name, role: n.role, state: n.state, account: n.account, cwd: n.cwd,
      parent: n.parent ? (tree.nodes[n.parent] || {}).name : null, since: (tree.nodes[n.id] || {}).launchedAt || null, sessionId: n.sessionId }));
    return { care: hub.careCfg(), roles: cfg.roles, projects, accounts, agents, demo: hub.demo,
      config: { file: cfg.file, dataDir: cfg.dataDir, publicUrl: cfg.publicUrl, mail: (cfg.mail || {}).mode || 'console', quietHours: cfg.quietHours, governor: cfg.governor },
      hub: { startedAt: hub.startedAt, sessions: Object.values(hub.auth.sessions).filter(e => e.exp > now() && e.user === 'owner').length } };
  }
  function agentRows() {
    const s = hub.snapshot(), tok = hub.tokenStats(), openT = hub.tasks.items().filter(t => hub.tasks.open(t));
    const cards = hub.actions.items().filter(i => i.status === 'open'), nm = id => (tree.nodes[id] || {}).name || id;
    const per = (k, id) => ((tok.periods || {})[k] || {})[id] || {};
    const rows = s.nodes.map(r => {
      const n = tree.nodes[r.id] || {};
      const mine = openT.filter(t => t.to === r.id).sort((a, b) => (b.startedAt || b.createdAt) - (a.startedAt || a.createdAt));
      return {
        id: r.id, name: r.name, role: r.role, parent: r.parent || null, parentName: r.parent ? nm(r.parent) : null,
        site: hub.projectOf(n), project: hub.projectOf(n), cwd: r.cwd, state: r.state, queued: r.queued,
        asleep: n.asleep && !n.stopped ? { at: n.asleep.at, why: oneLine(n.asleep.why, 200) } : null,
        stoppedAt: n.stopped ? n.stoppedAt || null : null, launchedAt: n.launchedAt || null, createdAt: n.createdAt || null,
        task: mine.length ? { id: mine[0].id, title: mine[0].title, desc: mine[0].desc || '', status: mine[0].status, more: mine.length - 1 } : null,
        brief: oneLine(n.brief, 200),
        tok: { month: per('month', r.id).t || 0, all: per('month', r.id).t || 0, mcr: per('month', r.id).cr || 0, musd: per('month', r.id).usd || 0,
          today: per('today', r.id).t || 0, tcr: per('today', r.id).cr || 0, tusd: per('today', r.id).usd || 0 },
        out: null,
        cards: cards.filter(i => i.from === r.id).map(i => ({ id: i.id, title: i.title, at: i.createdAt, later: !!i.snoozed })),
        waits: openT.filter(t => t.from === r.id && t.to !== r.id).map(t => ({ id: t.id, to: t.to, toName: nm(t.to), title: t.title, status: t.status })),
      };
    });
    return { at: now(), tokAt: tok.at, rows };
  }
  function queueRows() {
    const nm = id => (tree.nodes[id] || {}).name || id, qTasks = hub.tasks.items().filter(t => t.status === 'queued'), rows = [];
    for (const n of Object.values(tree.nodes)) {
      if (n.stopped) continue;
      const st = hub.statusOf(n), q = hub.pending[n.id] || [], op = hub.careOp(n.id), myTasks = qTasks.filter(t => t.to === n.id);
      if (st.state !== 'working' && !q.length && !op && !myTasks.length) continue;
      let quiet = null; if (!hub.demo) try { quiet = now() - fs.statSync(hub.claude.transcriptPath(n.sessionId, n.cwd)).mtimeMs; } catch {}
      rows.push({ id: n.id, name: n.name, role: n.role, parentName: n.parent ? nm(n.parent) : null, state: st.state, account: st.account || null,
        turnMs: null, turnTok: null, quietMs: quiet, job: null, stuck: st.state === 'working' && quiet != null && quiet >= 20 * 60_000,
        hub: q.map(t => oneLine(t, 300)), hubSince: hub.pendingAt[n.id] || null, screen: [], wake: n.asleep ? { why: n.asleep.why, at: n.asleep.at } : null,
        care: op ? { kind: op, at: null } : null, tasks: myTasks.map(t => ({ id: t.id, title: t.title, from: nm(t.from), at: t.createdAt })) });
    }
    return { at: now(), rows, heavy: hub.heavyJobs(), wakeQueue: 0 };
  }
  /* ---- skills: <first account>/skills (on) and <dataDir>/skills-off (off) */
  const SKILLS_ON = path.join((cfg.accounts[0] || {}).configDir || path.join(cfg.home, '.claude'), 'skills'), SKILLS_OFF = path.join(cfg.dataDir, 'skills-off');
  function skillDir(id) {
    if (!SKILL_ID.test(id || '')) return null;
    for (const [base, on] of [[SKILLS_ON, true], [SKILLS_OFF, false]]) {
      const d = path.join(base, id); let real; try { real = fs.realpathSync(d); } catch { continue; }
      return { id, entry: d, real, on };
    }
    return null;
  }
  function listSkills(all) {
    const out = [];
    for (const [base, on] of [[SKILLS_ON, true], [SKILLS_OFF, false]]) {
      if (!on && !all) continue;
      let dirs; try { dirs = fs.readdirSync(base); } catch { continue; }
      for (const id of dirs) {
        const sd = skillDir(id); if (!sd || sd.on !== on) continue;
        let txt; try { txt = fs.readFileSync(path.join(sd.real, 'SKILL.md'), 'utf8'); } catch { continue; }
        const fm = {}; const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/); if (m) for (const l of m[1].split('\n')) { const k = l.match(/^(\w+):\s*(.*)$/); if (k) fm[k[1]] = k[2].replace(/^["']|["']$/g, ''); }
        let files = []; try { files = fs.readdirSync(sd.real).filter(f => SKILL_FILE.test(f)); } catch {}
        let scripts = false; try { scripts = fs.readdirSync(sd.real, { recursive: true }).some(f => /\.(sh|py|js|mjs|cjs|ts|rb|pl|php|bash)$/i.test(String(f))); } catch {}
        out.push({ id, name: fm.name || id, description: (fm.description || '').slice(0, 400), on, files, scripts, source: '', repo: '', words: txt.split(/\s+/).length });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  return async function route(req, res, p, url, me) {
    const deny = () => send(res, 403, { error: "You don't have permission for that. Ask the admin." });
    const adminOnly = () => { if (!me.admin) { deny(); return true; } return false; };
    const othersDesk = id => { const n = tree.nodes[id]; return !!n && n.role === 'front' && n.id !== hub.deskOf(me); };
    let m;

    if (p === '/api/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
      res.write(`event: tree\ndata: ${JSON.stringify(hub.snapshotFor(me))}\n\n`);
      res.write(`event: history\ndata: ${JSON.stringify(hub.recentEvents().filter(e => hub.visibleTo(me, e)))}\n\n`);
      res.write(`event: livehist\ndata: ${JSON.stringify(hub.liveFeed().filter(e => hub.visibleTo(me, e)))}\n\n`);
      const client = { res, user: me };
      hub.clients.add(client);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { hub.clients.delete(client); clearInterval(ping); });
      return;
    }
    if (/^\/api\/(settings|projects|users|logout-others|server|agents|queue|changelog|rules|actions|jobs)(\/|$)/.test(p) && !me.admin && p !== '/api/actions') return deny();
    if (/^\/api\/(spawn|stop|start|remove|restart)(\/|$)/.test(p) && !hub.can(me, 'manage')) return deny();
    if (/^\/api\/(stop|remove)\/(front|brain|desk-.*)$/.test(p) && !me.admin) return deny();
    if (!me.admin && (m = p.match(/^\/api\/(stop|start|remove|restart|care)\/([a-z0-9.-]+)$/)) && !hub.inProjects(me, m[2])) return deny();
    if ((m = p.match(/^\/api\/(chat|term|keys)\/([a-z0-9.-]+)$/)) && !me.admin) {
      const id = m[2];
      if (othersDesk(id) || !(m[1] === 'chat' && req.method === 'GET' ? id === hub.deskOf(me) || hub.inView(me, id) : id === hub.deskOf(me) || hub.inProjects(me, id))) return deny();
      if (m[1] === 'chat' && id !== hub.deskOf(me) && (tree.nodes[id] || {}).user !== me.id && !hub.can(me, 'talk')) return deny();
      if (m[1] !== 'chat' && !hub.can(me, 'terminal')) return deny();
    }

    if (p === '/api/me') return send(res, 200, hub.publicUser(me));
    if (p === '/api/tree') return send(res, 200, hub.snapshotFor(me));
    if (p === '/api/ui' && req.method === 'POST') {
      const b = await body(req), ids = a => (Array.isArray(a) ? a.filter(x => typeof x === 'string' && /^[a-z0-9.-]{1,80}$/.test(x)).slice(0, 200) : []);
      me.ui = { chat: typeof b.chat === 'string' && /^[a-z0-9.-]{0,80}$/.test(b.chat) ? b.chat : '', hidden: ids(b.hidden), leadTabs: ids(b.leadTabs), at: now() };
      hub.users.save(); return send(res, 200, { ok: true });
    }
    if (p === '/api/layout' && req.method === 'POST') {
      const b = await body(req);
      const layout = { combOn: !!b.combOn, combTop: b.combTop && typeof b.combTop === 'object' ? b.combTop : {}, combSub: b.combSub && typeof b.combSub === 'object' ? b.combSub : {} };
      if (JSON.stringify(layout).length > 200_000) return send(res, 400, { error: 'layout too large' });
      me.layout = layout; hub.users.save(); return send(res, 200, { ok: true });
    }
    if ((m = p.match(/^\/api\/care\/([a-z0-9.-]+)$/)) && req.method === 'POST') {
      if (!hub.can(me, 'manage') || (othersDesk(m[1]) && !me.admin)) return deny();
      const n = tree.nodes[m[1]]; if (!n) return send(res, 404, { error: 'unknown agent' });
      const b = await body(req);
      if (b.kind === 'compact') return send(res, 200, hub.queueCare(n.id, { kind: 'compact', by: me.name }));
      hub.sendMessage('u:' + me.id, n.id, `[hub] ${me.name} asked you to clear your context to save tokens. Finish or park what you are doing, then run: cmd clear "<handoff note: what is still open, who is waiting on you, key paths/ids>"`);
      return send(res, 200, { queued: 'asked to clear', when: 'after its turn' });
    }
    if (p === '/api/care' && req.method === 'POST') { if (adminOnly()) return; return send(res, 200, hub.setCare(await body(req))); }
    if (p === '/api/server') {
      const st = hub.demo ? hub.demoServer() : hub.serverStat(), g = hub.govState(), hv = hub.heavyJobs();
      return send(res, 200, { ...st, gov: { enabled: true, pressure: g.pressure, why: g.why, slots: g.slots, asleep: Object.values(tree.nodes).filter(n => n.asleep && !n.stopped).length,
        heavy: { running: hv.filter(j => j.state === 'running').length, waiting: hv.filter(j => j.state === 'waiting').length } }, top: [] });
    }
    if (p === '/api/settings') return send(res, 200, settings());
    if (p === '/api/agents') return send(res, 200, agentRows());
    if (p === '/api/queue') return send(res, 200, queueRows());
    if (p === '/api/queue/esc' && req.method === 'POST') {
      const b = await body(req), n = hub.findNode(String(b.id || ''));
      if (!n) return send(res, 404, { error: 'no such agent' });
      if (hub.statusOf(n).state !== 'working') return send(res, 409, { error: `${n.name} is not in a turn` });
      if (!hub.demo) hub.tmux.tmux('send-keys', '-t', n.pane, 'Escape');
      hub.logEvent({ type: 'care', from: 'u-' + me.id, to: n.id, text: 'turn interrupted (Esc) from the Queue tab' });
      return send(res, 200, { ok: true });
    }
    if (p === '/api/agents/ask' && req.method === 'POST') {
      const b = await body(req), text = String(b.text || '').trim().slice(0, 20000);
      if (!b.to || !text) return send(res, 400, { error: 'to and text required' });
      const to = hub.findNode(String(b.to)); if (!to) return send(res, 404, { error: 'no such agent' });
      if (to.stopped) return send(res, 409, { error: `${to.name} is stopped; start it first` });
      return send(res, 200, hub.sendMessage('u:' + me.id, to.id, text));
    }
    if (p === '/api/changelog') {
      const g = CLGROUP.group(hub.changelogItems(), it => { const n = tree.nodes[it.by]; return n ? hub.projectOf(n) : null; }, 300, { tz: (cfg.quietHours || {}).tz || 'UTC' });
      return send(res, 200, { items: g.items, groups: g.groups });
    }
    if (p === '/api/rules' && req.method === 'GET') return send(res, 200, { groups: hub.RULES.view(hub.rulesDoc(), true) });
    if (p.startsWith('/api/rules/') && req.method === 'POST') {
      const id = decodeURIComponent(p.slice('/api/rules/'.length)), r = hub.RULES.byId(hub.rulesDoc(), id);
      if (!r) return send(res, 404, { error: 'no rule ' + id });
      const b = await body(req), v = !!b.on;
      if (!v && r.confirm && b.sure !== true) return send(res, 409, { confirm: true, risk: r.risk || '' });
      const out = hub.setRule(hub.RULES.provenance(null, me, ipOf(req)), id, v);
      return send(res, 200, { ...out, groups: hub.RULES.view(hub.rulesDoc(), true) });
    }
    if (p === '/api/skills') return send(res, 200, { items: hub.demo ? hub.demoSkills() : listSkills(me.admin && url.searchParams.get('all') === '1') });
    if ((m = p.match(/^\/api\/skills\/([^/]+)\/(toggle|file)$/))) {
      if (adminOnly()) return;
      if (hub.demo) return send(res, 200, { ok: true, items: hub.demoSkills(), id: m[1], file: 'SKILL.md', content: '---\nname: ' + m[1] + '\ndescription: demo skill\n---\n(demo)', files: ['SKILL.md'] });
      const sd = skillDir(decodeURIComponent(m[1])); if (!sd) return send(res, 404, { error: 'no such skill' });
      if (m[2] === 'toggle' && req.method === 'POST') {
        const want = !!(await body(req)).on;
        if (want !== sd.on) {
          const to = path.join(want ? SKILLS_ON : SKILLS_OFF, sd.id);
          fs.mkdirSync(path.dirname(to), { recursive: true }); fs.renameSync(sd.entry, to);
          hub.addChange('u-' + me.id, { title: `skill ${sd.id} turned ${want ? 'on' : 'off'}`, kind: 'skill', what: `${sd.entry} moved to ${to}`, why: 'toggled in the Skills tab', revert: `toggle it back in the Skills tab (or mv ${to} ${sd.entry})` });
        }
        return send(res, 200, { ok: true, items: listSkills(true) });
      }
      const f = String(url.searchParams.get('f') || 'SKILL.md'); if (!SKILL_FILE.test(f)) return send(res, 400, { error: 'bad file' });
      const fp = path.join(sd.real, f);
      if (req.method === 'POST') {
        const content = String((await body(req)).content ?? '');
        if (content.length > 200000) return send(res, 413, { error: 'too big' });
        if (f === 'SKILL.md' && !/^---\r?\n[\s\S]*?\bname:[\s\S]*?\bdescription:[\s\S]*?\r?\n---/.test(content)) return send(res, 400, { error: 'SKILL.md must keep its front matter (--- name: / description: ---)' });
        let old = ''; try { old = fs.readFileSync(fp, 'utf8'); } catch {}
        if (old === content) return send(res, 200, { ok: true, same: true });
        fs.copyFileSync(fp, fp + '.bak-' + now()); fs.writeFileSync(fp, content);
        hub.addChange('u-' + me.id, { title: `skill ${sd.id}: ${f} edited`, kind: 'skill', what: `${fp}, ${old.length} -> ${content.length} chars`, why: 'edited in the Skills tab', revert: `restore ${fp}.bak-* ` });
        return send(res, 200, { ok: true });
      }
      let txt; try { txt = fs.readFileSync(fp, 'utf8'); } catch { return send(res, 404, { error: 'no such file' }); }
      return send(res, 200, { id: sd.id, file: f, content: txt, files: fs.readdirSync(sd.real).filter(x => SKILL_FILE.test(x)) });
    }

    /* ---- decisions */
    if (p === '/api/actions' || p.startsWith('/api/actions/')) {
      if (adminOnly()) return;
      const C = hub.CDONE;
      if (p === '/api/actions') return send(res, 200, { items: hub.actions.items().filter(i => i.status === 'open' || C.state(i) === 'owner' || now() - (i.sentAt || i.withdrawnAt || i.closedAt || 0) < 3 * 86400e3)
        .map(i => (i.status === 'sent' ? { ...i, done: C.doneOf(i), dstate: C.state(i), doer: (C.asker(i, tree.nodes) || {}).id } : i)) });
      const mm = p.match(/^\/api\/actions\/(a\d+)(\/send|\/ask|\/close)?$/), it = mm && hub.actions.get(mm[1]);
      if (!it || req.method !== 'POST') return send(res, 404, { error: 'not found' });
      if (mm[2] === '/ask') { hub.actions.chat(it, 'owner', (await body(req)).text); return send(res, 200, { item: it }); }
      if (it.status !== 'open') return send(res, 409, { error: 'already ' + it.status });
      if (mm[2] === '/close') { hub.actions.close(it, me); return send(res, 200, { item: it }); }
      hub.actions.setAnswers(it, await body(req));
      if (mm[2]) hub.actions.send(it, me);
      return send(res, 200, { item: it });
    }

    /* ---- jobs */
    if (p === '/api/jobs') {
      const q = url.searchParams, J = hub.jobs, name = id => (tree.nodes[id] || {}).name || id, day = new Date().toISOString().slice(0, 10);
      const decide = j => hub.actions.items().filter(i => i.status === 'open' && i.from === j.owner);
      const items = J.list({ status: q.get('status') || '', all: !!q.get('all'), limit: 300 }).map(j => ({ ...J.pub(j), ownerName: name(j.owner), byName: name(j.by), steps: j.steps.slice(-12),
        decide: j.status === 'waiting' && j.waitOn === 'owner' ? decide(j).map(i => ({ id: i.id, title: i.title, detail: String(i.detail || '').slice(0, 600), kind: i.kind || null, from: name(i.from),
          questions: i.questions.map(x => ({ id: x.id, type: x.type, label: x.label || '', placeholder: x.placeholder || '', options: x.options || [] })) })) : undefined }));
      const sd = J.spendDay(day, hub.tokenRaw()); sd.top = (sd.top || []).map(x => ({ ...x, name: name(x.id) }));
      return send(res, 200, { v: J.version(), now: now(), items, spend: sd, budget: 10e6, staleMs: 30 * 60e3 });
    }
    if ((m = p.match(/^\/api\/jobs\/(J-\d+)\/(nudge|close|decide)$/i)) && req.method === 'POST') {
      const J = hub.jobs, j = J.get(m[1].toUpperCase());
      if (!j || !J.open(j)) return send(res, 404, { error: 'no open job ' + m[1] });
      const ag = tree.nodes[j.owner];
      if (m[2] === 'nudge') {
        if (!ag) return send(res, 404, { error: 'the job has no agent' });
        if (ag.stopped) return send(res, 409, { error: `${ag.name} is stopped; start it first` });
        if (now() - (j.nudgedAt || 0) < 10 * 60e3) return send(res, 429, { error: 'Nudged less than 10 minutes ago' });
        const r = hub.sendMessage('u:' + me.id, ag.id, `[nudge] ${me.name} nudged ${j.id} "${j.title}" from the Jobs board. Do the next step, then cmd job step ${j.id} "...". If it is blocked, say so with cmd job wait ${j.id} --on owner|agent "why".`);
        J.nudge(j, 'u-' + me.id, 'nudged from the Jobs board', { state: hub.statusOf(ag).state, result: r.result });
        return send(res, 200, { ok: true, job: J.pub(j) });
      }
      if (m[2] === 'close') { J.done(j, 'u-' + me.id, 'closed from the Jobs board'); return send(res, 200, { ok: true, job: J.pub(j) }); }
      const b = await body(req);
      if (b.card) {
        const it = hub.actions.get(String(b.card)); if (!it || it.status !== 'open') return send(res, 409, { error: 'card is not open: ' + b.card });
        hub.actions.setAnswers(it, b); hub.actions.send(it, me);
      } else {
        const text = String(b.text || '').trim().slice(0, 1500);
        if (text.length < 2) return send(res, 400, { error: 'Write your decision' });
        if (!ag || ag.stopped) return send(res, 409, { error: 'the job\'s agent is not running' });
        hub.deliver(ag, `[actions] ${me.name} decided on ${j.id} "${j.title}" from the Jobs board:\n${text}\n(Act on it now, then cmd job step ${j.id} "...")`, true);
      }
      if (j.status === 'waiting' && j.waitOn === 'owner') J.wait(j, 'u-' + me.id, 'agent', 'decided, the agent carries it out');
      return send(res, 200, { ok: true, job: J.pub(j) });
    }

    /* ---- tasks */
    if (p === '/api/tasks' || p.startsWith('/api/tasks/')) {
      const T = hub.tasks;
      const mineT = t => { const r = t.parent ? T.get(t.parent) || t : t; return me.admin || r.from === hub.deskOf(me); };
      const short = t => ({ ...T.pub(t), text: t.text.slice(0, 400), result: t.result ? t.result.slice(0, 400) : null, thread: undefined, n: (t.thread || []).length });
      if (p === '/api/tasks') {
        const q = url.searchParams;
        if (q.get('list')) {
          const day = s => { const d = s && new Date(s + 'T00:00:00'); return d && !isNaN(d) ? d.getTime() : null; }, until = day(q.get('until'));
          const xs = T.list({ status: q.get('status') || '', site: q.get('project') || q.get('site') || '', since: day(q.get('since')), until: until && until + 864e5, q: q.get('q') || '', limit: 500 }).filter(mineT);
          return send(res, 200, { v: T.version(), items: xs.map(short), projects: [...new Set(T.items().filter(mineT).map(t => t.site).filter(Boolean))].sort() });
        }
        return send(res, 200, { v: T.version(), now: now(), doneMs: MAP_DONE_MS, items: T.items().filter(t => T.onMap(t) && mineT(t)).map(short) });
      }
      const mt = p.match(/^\/api\/tasks\/(T-\d+)(?:\/(cancel|dismiss|followup))?$/i), t = mt && T.get(mt[1].toUpperCase());
      if (!t || !mineT(t)) return send(res, 404, { error: 'no such task' });
      if (!mt[2]) return send(res, 200, { ...T.pub(t), kids: T.kids(t).map(k => ({ id: k.id, to: k.to, status: k.status, title: k.title })) });
      if (req.method !== 'POST') return send(res, 405, { error: 'POST' });
      const who = 'u-' + me.id;
      if (mt[2] === 'cancel') { T.cancel(t, who, hub.pullQueued); return send(res, 200, T.pub(t)); }
      if (mt[2] === 'dismiss') return send(res, 200, T.pub(T.dismiss(t, who)));
      const b = await body(req), text = String(b.text || '').trim().slice(0, 20000);
      if (!text) return send(res, 400, { error: 'text required' });
      const to = tree.nodes[t.to];
      if (!to || to.stopped) return send(res, 409, { error: `${t.to} is not running; ask BRAIN instead` });
      const c = T.followup(t, who, text, ['note', 'task'].includes(b.mode) ? b.mode : 'auto');
      const r = c ? hub.sendMessage('u:' + me.id, t.to, `[new task from a reply on ${t.id}: ${t.title}]\n${text}`, { task: c })
        : hub.sendMessage('u:' + me.id, t.to, `[follow-up on ${t.id}: ${t.title}]\n${text}`, { noTask: true });
      return send(res, 200, { ...T.pub(t), result0: r.result, newTask: c ? c.id : null });
    }

    /* ---- projects */
    if (p === '/api/projects' && req.method === 'POST') {
      const b = await body(req), x = b.project || b.site || b;
      const name = String(x.name || '').trim().slice(0, 60);
      if (!name || !/^[\w .-]+$/.test(name)) return send(res, 400, { error: 'Give the project a short name (letters, digits, . _ -)' });
      if (!x.cwd || !path.isAbsolute(x.cwd) || !fs.existsSync(x.cwd) || !fs.statSync(x.cwd).isDirectory()) return send(res, 400, { error: 'Folder does not exist: ' + (x.cwd || '') });
      const list = hub.projects().slice(), cur = list.find(y => y.name === (b.was || name));
      const rec = { name, cwd: path.resolve(x.cwd), notes: String(x.notes || '').slice(0, 500) };
      if (cur) list[list.indexOf(cur)] = rec; else list.push(rec);
      hub.saveProjects(list);
      return send(res, 200, { ok: true, project: rec });
    }
    if ((m = p.match(/^\/api\/projects\/([^/]+)\/(remove|lead)$/)) && req.method === 'POST') {
      const nm = decodeURIComponent(m[1]), x = hub.projects().find(y => y.name === nm); if (!x) return send(res, 404, { error: 'unknown project' });
      if (m[2] === 'remove') { hub.saveProjects(hub.projects().filter(y => y !== x)); return send(res, 200, { ok: true }); }
      const b = await body(req);
      const r = hub.spawnChild('brain', { name: x.name, role: 'lead', cwd: x.cwd, brief: b.brief || `You are the ${x.name} lead. Get familiar with the project (its CLAUDE.md and README first), then wait for tasks from BRAIN.` });
      return send(res, 200, { id: r.node.id, reused: r.reused });
    }

    /* ---- people */
    if (p === '/api/users') return send(res, 200, { users: hub.users.all().map(hub.publicUser), perms: hub.PERMS, projects: hub.projects().map(x => x.name), mail: hub.mailer.mode });
    if (p === '/api/users/new' && req.method === 'POST') {
      const b = await body(req); let u;
      try { u = hub.addUser({ ...b, projects: b.projects || b.sites }); } catch (e) { return send(res, 400, { error: e.message }); }
      let invite = null;
      try { invite = await hub.inviteUser(u); } catch (e) { return send(res, 200, { user: hub.publicUser(u), inviteError: String(e.message || e) }); }
      return send(res, 200, { user: hub.publicUser(u), invite, link: invite.link, sent: invite.sent });
    }
    if ((m = p.match(/^\/api\/users\/([a-z0-9-]+)\/(invite|mfa-reset|password|delete)$/)) && req.method === 'POST') {
      const u = hub.users.get(m[1]); if (!u) return send(res, 404, { error: 'unknown person' });
      if (u.admin) return send(res, 400, { error: 'Not for the admin (use Security for your own account)' });
      if (m[2] === 'invite') { try { const inv = await hub.inviteUser(u); return send(res, 200, { user: hub.publicUser(u), invite: inv, link: inv.link, sent: inv.sent }); } catch (e) { return send(res, 400, { error: e.message }); } }
      if (m[2] === 'mfa-reset') { u.mfa = null; u.recovery = []; hub.users.save(); hub.auth.dropSessionsOf(u.id); return send(res, 200, { user: hub.publicUser(u) }); }
      if (m[2] === 'password') { const pw = hub.auth.newPassword(); hub.setPassword(u, pw); hub.auth.dropSessionsOf(u.id); return send(res, 200, { password: pw }); }
      const d = tree.nodes[hub.deskOf(u)];
      if (d) { if (!d.stopped) hub.stopNode(d.id); delete tree.nodes[d.id]; hub.saveTree(); }
      delete hub.auth.users[u.id]; hub.users.save(); hub.auth.dropSessionsOf(u.id);
      return send(res, 200, { ok: true });
    }
    if ((m = p.match(/^\/api\/users\/([a-z0-9-]+)$/)) && req.method === 'POST') {
      const u = hub.users.get(m[1]); if (!u) return send(res, 404, { error: 'unknown person' });
      const b = await body(req);
      if (typeof b.name === 'string' && b.name.trim()) u.name = b.name.trim().slice(0, 40);
      if (!u.admin) {
        if (b.perms) for (const k of Object.keys(hub.PERMS)) if (k in b.perms) u.perms[k] = !!b.perms[k];
        const pr = b.projects || b.sites; if (Array.isArray(pr)) u.projects = pr.filter(x => hub.projects().some(y => y.name === x));
        if (typeof b.disabled === 'boolean') { u.disabled = b.disabled; if (u.disabled) hub.auth.dropSessionsOf(u.id); }
        if (typeof b.seeAll === 'boolean') u.seeAll = b.seeAll;
        if (typeof b.email === 'string') {
          const e = b.email.trim().toLowerCase();
          if (e && !/^[^\s<>@,;"]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return send(res, 400, { error: 'That email address does not look right' });
          if (e !== (u.email || '')) { u.email = e; u.invite = null; }
        }
      }
      hub.users.save(); hub.syncDesks();
      const d = tree.nodes[hub.deskOf(u)];
      if (d && !d.stopped && !u.disabled) hub.restartNode(d.id);   // the desk's prompt carries the permissions
      return send(res, 200, { user: hub.publicUser(u) });
    }
    if (p === '/api/password' && req.method === 'POST') {
      const b = await body(req);
      if (!hub.auth.pwOk(me, b.current)) return send(res, 403, { error: 'Current password is wrong' });
      const w = hub.auth.weakPassword(b.next, me); if (w) return send(res, 400, { error: w });
      if (hub.auth.userByPassword(b.next)) return send(res, 400, { error: 'Pick a different password' });
      hub.setPassword(me, b.next); hub.auth.dropSessionsOf(me.id, hub.cookie(req, 'cmdsess'));
      return send(res, 200, { ok: true });
    }
    if (p === '/api/logout-others' && req.method === 'POST') { hub.auth.dropSessionsOf(me.id, hub.cookie(req, 'cmdsess')); return send(res, 200, { ok: true }); }

    /* ---- chat, terminal, keys */
    if ((m = p.match(/^\/api\/chat\/([a-z0-9.-]+)$/))) {
      const n = tree.nodes[m[1]]; if (!n) return send(res, 404, { error: 'unknown' });
      const st = hub.statusOf(n), key = chatKey(n, st);
      let c = chatCache[n.id] && chatCache[n.id].key === key ? chatCache[n.id] : null;
      if (!c) {
        const msgs = chatHistory(n), queued = hub.pending[n.id] || [];
        c = chatCache[n.id] = { key, msgs, queued: queued.slice(), etag: '"' + crypto.createHash('sha1').update(key + JSON.stringify(msgs.slice(-3)) + msgs.length).digest('hex').slice(0, 20) + '"' };
      }
      const tag = c.etag + me.id;
      if (req.headers['if-none-match'] === tag) { res.writeHead(304, { ETag: tag, 'Cache-Control': 'no-cache' }); return res.end(); }
      const since = url.searchParams.has('since') ? +url.searchParams.get('since') : -1, total = c.msgs.length;
      const delta = since >= 0 && since <= total && total - since <= 60 && url.searchParams.get('h') === hub.claude.hashMsg(c.msgs[since - 1]);
      const an = Math.max(0, total - 5), ah = hub.claude.hashMsg(c.msgs[an - 1]);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', ETag: tag, 'X-Content-Type-Options': 'nosniff' });
      const base = { total, a: an, h: ah, queued: c.queued, queuedNote: '', busy: st.state === 'working' };
      return res.end(JSON.stringify(delta ? { since, ...base, messages: c.msgs.slice(since) } : { ...base, messages: c.msgs }));
    }
    if ((m = p.match(/^\/api\/term\/([a-z0-9.-]+)$/))) {
      const n = tree.nodes[m[1]];
      if (hub.demo) return send(res, 200, { screen: n ? `\x1b[2m(demo mode: no real terminal)\x1b[0m\r\n\r\n> ${n.demoLast || ''}` : '', cursor: [0, 0], alive: !!n, cols: 80, rows: 24 });
      if (!n || !hub.tmux.paneAlive(n.pane)) return send(res, 200, { screen: '', alive: false });
      return send(res, 200, hub.tmux.capture(n.pane));
    }
    if ((m = p.match(/^\/api\/keys\/([a-z0-9.-]+)$/)) && req.method === 'POST') {
      const n = tree.nodes[m[1]];
      if (hub.demo) return send(res, 200, { ok: true });
      if (!n || !hub.tmux.paneAlive(n.pane)) return send(res, 409, { error: 'not running' });
      const b = await body(req);
      if (typeof b.data === 'string' && b.data.length < 20000) hub.tmux.sendKeys(n.pane, b.data);
      return send(res, 200, { ok: true });
    }

    /* ---- uploads (chat attachments): the message carries the file path, so the agent can read it */
    if (p === '/api/upload' && req.method === 'POST') {
      const raw = String(url.searchParams.get('name') || 'file').normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/^[._]+/, '').slice(-80) || 'file';
      const day = new Date().toISOString().slice(0, 10), dir = path.join(cfg.dataDir, 'uploads', day), name = rid(4) + '-' + raw, file = path.join(dir, name);
      fs.mkdirSync(dir, { recursive: true });
      const out = fs.createWriteStream(file, { mode: 0o640 });
      let size = 0, over = false;
      req.on('data', d => { size += d.length; if (size > UPLOAD_MAX && !over) { over = true; out.destroy(); req.destroy(); } else if (!over) out.write(d); });
      req.on('end', () => out.end(() => send(res, 200, { path: file, url: '/api/upload/' + day + '/' + encodeURIComponent(name), name: raw, size })));
      req.on('close', () => { if (over) { try { fs.unlinkSync(file); } catch {} send(res, 413, { error: 'file is larger than 25 MB' }); } });
      return;
    }
    if ((m = p.match(/^\/api\/upload\/(\d{4}-\d\d-\d\d)\/([^/]+)$/))) {
      const f = path.join(cfg.dataDir, 'uploads', m[1], path.basename(decodeURIComponent(m[2])));
      if (!fs.existsSync(f)) return send(res, 404, 'not found');
      const img = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }[path.extname(f).toLowerCase()];
      res.writeHead(200, { 'Content-Type': img || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=86400',
        'Content-Security-Policy': "default-src 'none'", ...(img ? {} : { 'Content-Disposition': 'attachment' }) });
      return fs.createReadStream(f).pipe(res);
    }

    /* ---- talking and the life cycle */
    if (p === '/api/send' && req.method === 'POST') {
      const b = await body(req);
      if (!b.text || !b.to) return send(res, 400, { error: 'to and text required' });
      const to = hub.findNode(b.to); if (!to) return send(res, 404, { error: 'no such agent' });
      if (!me.admin && to.id !== hub.deskOf(me) && to.user !== me.id && (!hub.can(me, 'talk') || othersDesk(to.id) || !hub.inProjects(me, to.id))) return deny();
      return send(res, 200, hub.sendMessage('u:' + me.id, to.id, String(b.text).slice(0, 50000), { branch: !!b.branch }));
    }
    if (p === '/api/spawn' && req.method === 'POST') {
      const b = await body(req);
      if (!me.admin && !hub.inProjects(me, b.parent || 'brain')) return deny();
      const r = hub.spawnChild(b.parent || 'brain', b);
      return send(res, 200, { id: r.node.id, reused: r.reused });
    }
    if ((m = p.match(/^\/api\/branch\/(close|open)\/([a-z0-9.-]+)$/)) && req.method === 'POST') {
      if (adminOnly()) return;
      const n = tree.nodes[m[2]], par = n && tree.nodes[n.parent];
      if (!n) return send(res, 404, { error: 'no such agent' });
      if (n.role === 'brain' || n.role === 'front' || n.role === 'lead' || !(n.role === 'topic' || (par && (par.role === 'lead' || par.role === 'topic')))) return send(res, 403, { error: 'only topics and the children of a lead or topic can be closed here' });
      if (m[1] === 'close') { if (!n.stopped) hub.stopNode(n.id); } else { if (par && par.stopped) return send(res, 409, { error: `${par.name} is stopped; open it first` }); hub.startNode(n.id); }
      return send(res, 200, { ok: true, state: m[1] === 'close' ? 'stopped' : 'starting' });
    }
    if ((m = p.match(/^\/api\/(stop|start|remove|restart)\/([a-z0-9.-]+)$/)) && req.method === 'POST') {
      try {
        if (m[1] === 'stop') hub.stopNode(m[2]);
        if (m[1] === 'start') hub.startNode(m[2]);
        if (m[1] === 'restart') hub.restartNode(m[2]);
        if (m[1] === 'remove') hub.removeNode(m[2]);
      } catch (e) { return send(res, 409, { error: e.message }); }
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'unknown route' });
  };
};

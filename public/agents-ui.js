/* Agents tab: one row per agent of the tree, so "N asleep" on the map is not misread as N stuck agents. Loaded after
   app.js and uses its globals (api, post, esc, ago, fmtTok, view, me).
   Each row: status with a plain hint, what it is on (its open task, else its brief), session age, tokens, the last
   report it sent up, what it waits for (decision cards it asked, tasks it handed out) and an Ask box that sends a
   message like cmd send, tracked as a task. Sort: working, waiting on you, idle/asleep, stopped. */
'use strict';
const AG_HINT = {
  working: 'Running a turn right now',
  idle: 'Finished its turn, waiting for the next message',
  asleep: 'Put to sleep by the governor (server load). Not stuck: wakes in the same session on its next message',
  stopped: 'Stopped; gets no messages, comes back with Start on the map',
  offline: 'Its window is closed; the hub reopens it',
  starting: 'Starting',
  login: 'Waiting for an account sign-in',
};
// The default shows only agents that matter now (working + waiting on you); stopped and asleep stay one tap away.
const AG_CHIPS = [['active', 'Active'], ['all', 'All'], ['working', 'Working'], ['waiting', 'Waiting on you'], ['idle', 'Idle'], ['asleep', 'Asleep'], ['stopped', 'Stopped'], ['other', 'Other']];
let agData = null, agFilter = 'active', agLoadT = null, agLastLoad = 0;
const agAsk = {}, agDraft = {}, agMsg = {}, agOpenOut = new Set();
try { agFilter = localStorage.getItem('cmd.agf2') || 'active'; } catch {}

const agDur = ms => { if (!(ms > 0)) return '–'; const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24); return d ? `${d}d ${h % 24}h` : h ? `${h}h ${m % 60}m` : `${m}m`; };
const agWait = r => r.cards.length > 0 && r.state !== 'stopped';
const agNow = r => r.state === 'working' || (r.state !== 'stopped' && r.cards.some(c => !c.later));   // "Active": a card left for later does not count
const agGroup = r => r.state === 'working' ? 0 : r.state === 'stopped' ? 3 : agWait(r) ? 1 : 2;
const agKind = s => ['working', 'idle', 'asleep', 'stopped'].includes(s) ? s : 'other';
const agActive = r => Math.max(r.out ? r.out.at : 0, r.launchedAt || 0, r.asleep ? r.asleep.at : 0, r.stoppedAt || 0);

let agShowN = 60;
async function loadAgents(force) {
  if (view !== 'agents' || !me || !me.admin) return;
  clearTimeout(agLoadT);
  const wait = force ? 0 : Math.max(0, 5000 - (Date.now() - agLastLoad));   // a busy tree pushes every 2 s: at most one fetch per 5 s
  agLoadT = setTimeout(async () => {
    agLastLoad = Date.now();
    try { agData = await api('/api/agents'); } catch (e) { $('#agList').innerHTML = `<div class="act-empty">${esc(e.message)}</div>`; return; }
    renderAgents();
  }, wait);
}

function renderAgents() {
  if (!agData) return;
  // never repaint under someone's cursor (an Ask box being typed in); the next load repaints
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#agentsView .ag-ask textarea')) return;
  const t0 = performance.now();
  const rows = agData.rows.slice().sort((a, b) => agGroup(a) - agGroup(b) || agActive(b) - agActive(a));
  const cnt = { all: rows.length, active: rows.filter(agNow).length, waiting: rows.filter(agWait).length, working: 0, idle: 0, asleep: 0, stopped: 0, other: 0 };
  for (const r of rows) cnt[agKind(r.state)]++;
  if (agFilter !== 'all' && agFilter !== 'active' && !cnt[agFilter]) agFilter = 'active';
  const shown = rows.filter(r => agFilter === 'all' || (agFilter === 'active' ? agNow(r) : agFilter === 'waiting' ? agWait(r) : agKind(r.state) === agFilter));
  $('#agCount').textContent = `${cnt.all} agents`;
  $('#agChips').innerHTML = AG_CHIPS.filter(([k]) => k === 'all' || k === 'active' || cnt[k]).map(([k, l]) =>
    `<button type="button" class="ag-chip c-${k}${agFilter === k ? ' on' : ''}" data-agf="${k}" aria-pressed="${agFilter === k}">${k !== 'all' ? '<i></i>' : ''}${l}<b>${cnt[k]}</b></button>`).join('');
  // 60 rows at a time (a full list can be thousands of DOM nodes)
  const page = shown.slice(0, agShowN);
  $('#agList').innerHTML = shown.length ? page.map(agRow).join('') + (shown.length > agShowN ? `<button type="button" class="chat-more" data-agmore>more (${shown.length - agShowN})</button>` : '') : `<div class="act-empty">${agFilter === 'active' ? 'No agent is working or waiting on you right now.' : 'No agents in this filter.'}</div>`;
  const ms = performance.now() - t0;
  window.__agentsMs = Math.round(ms * 10) / 10;
  console.log(`[agents] rendered ${shown.length} of ${rows.length} rows in ${window.__agentsMs} ms`);
}

function agRow(r) {
  const nowMs = agData.at;
  const sub = [r.role, r.site, r.parentName ? '↑ ' + r.parentName : null].filter(Boolean).map(esc).join(' · ');
  let hint = AG_HINT[r.state] || r.state;
  if (r.asleep) hint += ` · ${ago(r.asleep.at)}`;
  if (r.stoppedAt) hint += ` · ${ago(r.stoppedAt)}`;
  if (r.queued) hint += ` · ${r.queued} queued message${r.queued > 1 ? 's' : ''}`;
  const title = r.task
    ? `<span class="ag-tid t-${esc(r.task.status)}" data-task="${esc(r.task.id)}" role="button" tabindex="0" title="Open the task">${esc(r.task.id)}</span>${esc(r.task.title)}${r.task.more ? ` <small>+${r.task.more} open</small>` : ''}${r.task.desc ? `<small class="ag-desc">${esc(r.task.desc)}</small>` : ''}`
    : r.brief ? `<span class="ag-tid brief">brief</span>${esc(r.brief)}` : '<span class="muted">–</span>';
  const time = r.state === 'stopped'
    ? `<b>–</b><small>stopped${r.stoppedAt ? ' ' + esc(ago(r.stoppedAt)) : ''}</small>`
    : r.launchedAt ? `<b>${agDur(nowMs - r.launchedAt)}</b><small>session age</small>` : `<b>${agDur(nowMs - (r.createdAt || nowMs))}</b><small>on the map</small>`;
  // fresh vs cache reads (cache reads are ~0.1x price) and list-price $, so a big total is not misread
  const split = (t, cr, usd) => t ? `fresh ${fmtTok(t - (cr || 0))} · cache ${fmtTok(cr || 0)} · $${(usd || 0).toFixed(2)}` : '';
  const tok = `<b title="since ${esc(agData.monthFrom || '')}">${fmtTok(r.tok.month)}</b><small title="since ${esc(agData.tokFrom || '')}">this month · ${fmtTok(r.tok.all)} total</small>`
    + (r.tok.month ? `<small class="ag-split" title="This month. Fresh = new input + cache writes + output; cache = cache reads (counted in the total, ~0.1x price). $ = API list price; subscriptions are not billed per token.${r.tok.today ? '\nToday: ' + esc(split(r.tok.today, r.tok.tcr, r.tok.tusd)) : ''}">${esc(split(r.tok.month, r.tok.mcr, r.tok.musd))}</small>` : '');
  const out = r.out
    ? `<details class="ag-out" data-out="${esc(r.id)}"${agOpenOut.has(r.id) ? ' open' : ''}><summary><small>${esc(ago(r.out.at))} → ${esc(r.out.toName)}</small><span>${esc(r.out.text.replace(/\s+/g, ' ').slice(0, 140))}</span></summary><div class="ag-full">${esc(r.out.text)}</div></details>`
    : '<span class="muted">no report yet</span>';
  // at most 4 decision cards and 3 handed-out tasks per row; the rest as "+N" with every id in its tooltip
  const more = (xs, n, f) => xs.slice(0, n).map(f).concat(xs.length > n ? [`<span class="ag-more" title="${esc(xs.slice(n).map(x => x.id + ' ' + x.title).join('\n'))}">+${xs.length - n}</span>`] : []);
  const waits = more(r.cards, 4, c => `<a href="#" class="ag-card" data-card="${esc(c.id)}" title="${esc(c.title)}">${esc(c.id)}${c.later ? ' · later' : ''}</a>`)
    .concat(more(r.waits, 3, t => `<span class="ag-wt" title="${esc(t.title)}">${esc(t.id)} → ${esc(t.toName)}</span>`));
  const stopped = r.state === 'stopped';
  const msg = agMsg[r.id];
  return `<article class="ag-row s-${esc(r.state)}${agWait(r) ? ' wo' : ''}" data-id="${esc(r.id)}">
    <div class="ag-c ag-name" data-l="Agent"><b>${esc(r.name)}</b><small>${sub}</small></div>
    <div class="ag-c ag-st" data-l="Status"><span class="ag-pill"><i></i>${esc(r.state)}</span><small>${esc(hint)}</small></div>
    <div class="ag-c ag-title" data-l="Title">${title}</div>
    <div class="ag-c ag-num" data-l="Time">${time}</div>
    <div class="ag-c ag-num" data-l="Tokens">${tok}</div>
    <div class="ag-c ag-outc" data-l="Output">${out}</div>
    <div class="ag-c ag-wait" data-l="Waiting on">${waits.length ? waits.join('') : '<span class="muted">–</span>'}</div>
    <div class="ag-c ag-askc"><button type="button" class="ghost sm" data-ask="${esc(r.id)}"${stopped ? ' disabled title="A stopped agent gets no messages"' : ''} aria-expanded="${!!agAsk[r.id]}">Ask</button></div>
    ${agAsk[r.id] && !stopped ? `<form class="ag-ask" data-askf="${esc(r.id)}"><textarea rows="2" placeholder="Ask ${esc(r.name)}… (sent like cmd send, tracked as a task)">${esc(agDraft[r.id] || '')}</textarea><button class="primary sm">Send</button>${msg ? `<span class="ag-msg ${msg.ok ? 'ok' : 'bad'}">${esc(msg.text)}</span>` : ''}</form>`
      : msg ? `<div class="ag-ask"><span class="ag-msg ${msg.ok ? 'ok' : 'bad'}">${esc(msg.text)}</span></div>` : ''}
  </article>`;
}

$('#agentsView').addEventListener('click', e => {
  const chip = e.target.closest('[data-agf]');
  if (e.target.closest('[data-agmore]')) { agShowN += 100; return renderAgents(); }
  if (chip) { agShowN = 60; agFilter = chip.dataset.agf; try { localStorage.setItem('cmd.agf2', agFilter); } catch {} return renderAgents(); }
  const ask = e.target.closest('[data-ask]');
  if (ask) { const id = ask.dataset.ask; agAsk[id] = !agAsk[id]; delete agMsg[id]; renderAgents(); if (agAsk[id]) { const ta = document.querySelector(`#agentsView [data-askf="${CSS.escape(id)}"] textarea`); if (ta) ta.focus(); } return; }
  const card = e.target.closest('[data-card]');
  if (card) { e.preventDefault(); setView('actions'); }
  const tk = e.target.closest('[data-task]');   // the task chip opens the task panel (title, description, result)
  if (tk && typeof openTask === 'function') openTask(tk.dataset.task);
});
$('#agentsView').addEventListener('toggle', e => {
  const d = e.target.closest && e.target.closest('[data-out]');
  if (d) d.open ? agOpenOut.add(d.dataset.out) : agOpenOut.delete(d.dataset.out);
}, true);
$('#agentsView').addEventListener('input', e => { const f = e.target.closest('[data-askf]'); if (f) agDraft[f.dataset.askf] = e.target.value; });
$('#agentsView').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && e.target.closest('[data-askf]')) e.target.closest('form').requestSubmit(); });
$('#agentsView').addEventListener('submit', async e => {
  const f = e.target.closest('[data-askf]'); if (!f) return;
  e.preventDefault();
  const id = f.dataset.askf, text = (agDraft[id] || '').trim();
  if (!text) return;
  const btn = f.querySelector('button'); btn.disabled = true;
  try {
    const r = await post('/api/send', { to: id, text });
    agMsg[id] = { ok: true, text: `Sent${r.task ? ' · ' + r.task : ''} · ${r.result === 'delivered' ? 'delivered' : 'queued, it gets it on its turn (on waking if asleep)'}` };
    delete agDraft[id]; agAsk[id] = false;
  } catch (err) { agMsg[id] = { ok: false, text: err.message }; btn.disabled = false; }
  document.activeElement && document.activeElement.blur();
  renderAgents(); loadAgents(true);
});


// leaving the view empties it (a long list keeps thousands of nodes in the page); coming back draws it again
window.agentsView = v => { if (v === 'agents') { renderAgents(); loadAgents(true); } else if ($('#agList').childElementCount) { $('#agList').innerHTML = ''; agShowN = 60; } };
window.agentsTree = () => { if (view === 'agents') loadAgents(); };

/* Queue tab: one row per agent with something waiting (GET /api/queue): its turn time, how long its transcript has
   been quiet, the messages the hub holds, the messages queued in its own input box, the wake queue, a queued compact
   and queued tasks. "Interrupt turn" sends Esc to its terminal. The tab badge counts stuck turns + waiting messages,
   refreshed with the tree. */
let qData = null, qLoadT = null, qLastLoad = 0;
const qMsg = {};
async function loadQueue(force) {
  if (!me || !me.admin) return;
  clearTimeout(qLoadT);
  if (!force && document.hidden) return;   // a hidden tab makes no requests; the next tree after return refreshes
  const wait = force ? 0 : Math.max(0, (view === 'queue' ? 4000 : 60000) - (Date.now() - qLastLoad));   // badge only: once a minute
  qLoadT = setTimeout(async () => {
    if (!force && document.hidden) return;
    qLastLoad = Date.now();
    try { qData = await api('/api/queue'); } catch (e) { if (view === 'queue') $('#qList').innerHTML = `<div class="act-empty">${esc(e.message)}</div>`; return; }
    qBadge();
    if (view === 'queue') renderQueue();
  }, wait);
}
function qBadge() {
  const n = qData.rows.reduce((k, r) => k + (r.stuck ? 1 : 0) + r.hub.length + r.screen.length, 0), stuck = qData.rows.some(r => r.stuck);
  document.querySelectorAll('.qbadge').forEach(b => { b.hidden = !n; b.textContent = n; b.classList.toggle('bad', stuck); });
}
function renderQueue() {
  if (!qData) return;
  const rows = qData.rows, stuck = rows.filter(r => r.stuck).length, msgs = rows.reduce((k, r) => k + r.hub.length + r.screen.length, 0);
  const working = rows.filter(r => r.state === 'working').length, h = qData.heavy || { running: [], waiting: 0 };
  $('#qCount').textContent = `${rows.length} agents`;
  const tile = (n, l, cls) => `<div class="q-tile${cls && n ? ' ' + cls : ''}"><b>${n}</b><small>${l}</small></div>`;
  $('#qSum').innerHTML = tile(stuck, 'stuck turns', 'bad') + tile(msgs, 'waiting messages', 'warn') + tile(working, 'running turns')
    + tile(qData.wakeQueue, 'wake queue') + tile(`${h.running.length}/${h.waiting}`, 'heavy: running/waiting');
  $('#qList').innerHTML = rows.length ? rows.map(qRow).join('') : '<div class="act-empty">The queue is empty. No waiting messages, no running turns.</div>';
}
function qRow(r) {
  const sub = [r.role, r.parentName ? '↑ ' + r.parentName : null, r.account].filter(Boolean).map(esc).join(' · ');
  const turn = r.state === 'working'
    ? `<b>${r.turnMs != null ? agDur(r.turnMs) || '<1m' : '?'}</b><small>turn time${r.turnTok ? ' · ↓ ' + esc(r.turnTok) + ' tok' : ''}</small>`
    : `<b>–</b><small>${esc(r.state)}</small>`;
  const quiet = r.quietMs != null ? `<b>${r.quietMs < 60000 ? '<1m' : agDur(r.quietMs)}</b><small>${r.job ? 'running: ' + esc(r.job) : 'last write'}</small>` : '<b>–</b>';
  const items = [];
  for (const t of r.screen) items.push(`<li><span class="q-k scr" title="Waiting in the agent's own input box: goes in when the turn ends">input box</span>${esc(t)}</li>`);
  for (const t of r.hub) items.push(`<li><span class="q-k hub" title="Held by the hub${r.hubSince ? ' · ' + esc(ago(r.hubSince)) : ''}">hub</span>${esc(t)}</li>`);
  if (r.wake) items.push(`<li><span class="q-k wake">wake</span>${esc(r.wake.why || '')} <small>${esc(ago(r.wake.at))}</small></li>`);
  if (r.care) items.push(`<li><span class="q-k care">${esc(r.care.kind)}</span>queued${r.care.at ? ' · ' + esc(ago(r.care.at)) : ''}</li>`);
  for (const t of r.tasks) items.push(`<li><span class="q-k task">${esc(t.id)}</span>${esc(t.title)} <small>← ${esc(t.from)} · ${esc(ago(t.at))}</small></li>`);
  const m = qMsg[r.id];
  return `<article class="ag-row q-row s-${esc(r.state)}${r.stuck ? ' stuck' : ''}" data-id="${esc(r.id)}">
    <div class="ag-c ag-name" data-l="Agent"><b>${esc(r.name)}</b><small>${sub}</small></div>
    <div class="ag-c ag-st" data-l="Status"><span class="ag-pill"><i></i>${r.stuck ? 'stuck?' : esc(r.state)}</span>${r.stuck ? '<small>turn quiet for 20+ min</small>' : ''}</div>
    <div class="ag-c ag-num" data-l="Turn">${turn}</div>
    <div class="ag-c ag-num" data-l="Quiet">${quiet}</div>
    <div class="ag-c q-items" data-l="Waiting">${items.length ? `<ul>${items.join('')}</ul>` : '<span class="muted">–</span>'}</div>
    <div class="ag-c ag-askc">${r.state === 'working' ? `<button type="button" class="ghost sm${r.stuck ? ' q-esc-hot' : ''}" data-qesc="${esc(r.id)}" title="Esc: interrupts the turn, waiting messages go in right away">Interrupt turn</button>` : ''}${m ? `<small class="ag-msg ${m.ok ? 'ok' : 'bad'}">${esc(m.text)}</small>` : ''}</div>
  </article>`;
}
$('#queueView').addEventListener('click', async e => {
  const b = e.target.closest('[data-qesc]'); if (!b) return;
  const id = b.dataset.qesc; b.disabled = true;
  try { await post('/api/keys/' + encodeURIComponent(id), { data: '\x1b' }); qMsg[id] = { ok: true, text: 'Esc sent' }; }
  catch (err) { qMsg[id] = { ok: false, text: err.message }; }
  setTimeout(() => { delete qMsg[id]; }, 15000);
  setTimeout(() => loadQueue(true), 1500); renderQueue();
});
window.queueView = v => { if (v === 'queue') { renderQueue(); loadQueue(true); } };
window.queueTree = () => loadQueue();

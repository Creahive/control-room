/* Task queue on the map. Loaded after app.js and uses its globals (nodes, gNodes, nodeR, view, me, api, post, esc, md,
   ago, sfxPlay, alertBubble).
   - Satellites: each open or recently finished task is a diamond on an arc above the agent it went to.
     gray = queued, yellow = working, green = done.
   - Click a diamond: task panel (request, result, child tasks, follow-up box on a done task).
   - X on a done diamond: dismiss (hidden from the map, kept in the record). X on a queued one: confirm, then cancel
     (the hub pulls the message out of its delivery queue, so it is never delivered).
   - Command center: list with filters (status, project, date, text).
   - Every task shows a title, a short description and its result ("no result" in amber when a done task says
     nothing). A done task leaves the map doneMs after it finished; the list keeps it. */
'use strict';
const TASK_C = { queued: '#8a93a6', working: '#f4d35e', done: '#46e08a', cancelled: '#4a5162' };
const TASK_T = { queued: 'queued', working: 'working', done: 'done', cancelled: 'cancelled' };
const TASK_MAX = 10;   // dots per agent; the rest show as "+N"
let taskItems = [], tasksBy = {}, taskV = -1, taskOpen = null, taskLoadT = null, taskSkew = 0, taskDoneMs = 45e3;

/** What a done task came to. null = nothing said. A parent closed by its children shows the last
    child's result, with that child's id as `via`. */
function taskResult(t) {
  const r = String(t.result || '').trim();
  if (!r || /^(done|replied|ok|okay|finished)\.?$/i.test(r)) return null;
  const m = r.match(/^All child tasks closed \(([^)]*)\)\.\s*\n\n([A-Z]+-\d+): ([\s\S]+)$/);
  return m ? { text: m[3].trim(), via: m[2], kids: m[1] } : { text: r };
}
const firstLine = (s, n) => { const l = String(s || '').split('\n').map(x => x.trim()).find(Boolean) || ''; return l.length > n ? l.slice(0, n - 1) + '…' : l; };
/** Done tasks leave the map doneMs after they finished (server clock); the list keeps them. */
const onMapNow = t => t.status !== 'done' || Date.now() + taskSkew - (t.finishedAt || 0) < taskDoneMs;
function groupTasks() {
  const rank = { queued: 0, working: 1, done: 2 };
  tasksBy = {};
  for (const t of taskItems) if (onMapNow(t)) (tasksBy[t.to] = tasksBy[t.to] || []).push(t);
  for (const k in tasksBy) tasksBy[k].sort((a, b) => rank[a.status] - rank[b.status] || (b.finishedAt || b.createdAt) - (a.finishedAt || a.createdAt));
}
setInterval(() => {   // drop expired done satellites without waiting for the next task change
  if (!taskItems.some(t => t.status === 'done' && !onMapNow(t) && (tasksBy[t.to] || []).includes(t))) return;
  groupTasks(); drawTasks();
}, 10e3);

async function loadTasks() {
  clearTimeout(taskLoadT);
  taskLoadT = setTimeout(async () => {
    let r; try { r = await api('/api/tasks'); } catch { return; }
    taskV = r.v; taskItems = r.items || [];
    if (r.now) taskSkew = r.now - Date.now();
    if (r.doneMs) taskDoneMs = r.doneMs;
    groupTasks();
    drawTasks();
    if (taskOpen) openTask(taskOpen.id, taskOpen.mode, true);
    if (document.body.classList.contains('v-cc')) loadTaskList();
  }, 120);
}

/** Satellites: called at the end of every render() and after each task change. Only touches the small .tasks group. */
function drawTasks() {
  gNodes.selectAll('g.node').each(function (d) {
    const g = d3.select(this);
    let tg = g.select('g.tasks');
    const list = (tasksBy[d.id] || []);
    if (!list.length && tg.empty()) return;
    if (tg.empty()) tg = g.insert('g', 'g.label').attr('class', 'tasks');
    const shown = list.slice(0, TASK_MAX), R = nodeR(d), rr = R + 27, step = 15 / rr;
    // an open (working) task on an agent that is not working right now (idle, asleep: waiting on someone) is dimmed
    const busy = d.role === 'lead' ? leadLit(d) : d.state === 'working';
    const S = tg.selectAll('g.tsat').data(shown, t => t.id);
    S.exit().remove();
    const E = S.enter().append('g').attr('class', 'tsat').attr('data-task', t => t.id)
      .on('click', (e, t) => { e.stopPropagation(); openTask(t.id); });
    E.append('circle').attr('class', 'thit').attr('r', 9);
    E.append('path').attr('class', 'tdot').attr('d', 'M0,-5.6L5.6,0L0,5.6L-5.6,0Z');   // a diamond, not a circle, so it never reads as an agent dot
    const X = E.append('g').attr('class', 'tx').attr('transform', 'translate(6.5,-6.5)')
      .on('click', (e, t) => { e.stopPropagation(); taskX(t); });
    X.append('circle').attr('r', 4.8);
    X.append('path').attr('d', 'M-1.9,-1.9L1.9,1.9M1.9,-1.9L-1.9,1.9');
    E.append('title');
    tg.selectAll('g.tsat').each(function (t, i) {
      const k = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2), a = -Math.PI / 2 + k * step;
      const s = d3.select(this).attr('transform', `translate(${(Math.cos(a) * rr).toFixed(1)},${(Math.sin(a) * rr).toFixed(1)})`)
        .attr('class', 'tsat s-' + t.status + (t.status === 'working' && !busy ? ' paused' : ''));
      s.select('.tdot').attr('fill', TASK_C[t.status] || '#777');
      s.select('.tx').attr('display', t.status === 'working' ? 'none' : null);
      const W = s.selectAll('text.twait').data(t.wait ? [t.wait] : []);   // cmd task wait
      W.exit().remove();
      W.enter().append('text').attr('class', 'twait').attr('x', 0).attr('y', -8).attr('text-anchor', 'middle').merge(W).text(w => { const s = 'waiting: ' + (w.note || 'pid ' + w.pid); return s.length > 22 ? s.slice(0, 21) + '…' : s; });   // centred just above the diamond (the agent name sits under it), cut at 22
      const res = t.status === 'done' ? taskResult(t) : null;
      s.select('title').text(`${t.id} · ${TASK_T[t.status] || t.status}\n${t.title}${t.desc ? '\n' + firstLine(t.desc, 160) : ''}${t.status === 'done' ? `\nResult: ${res ? firstLine(res.text, 200) : 'no result'}` : ''}${costTxt(t) ? '\ncost: ' + costTxt(t) : ''}${t.wait ? `\nwaiting on pid ${t.wait.pid}${t.wait.note ? ': ' + t.wait.note : ''} since ${when(t.wait.since)}` : ''}${t.status === 'done' ? '\nclick: result + follow-up · x: dismiss' : t.status === 'queued' ? '\nnot delivered yet · x: cancel' : ''}`);
    });
    const more = list.length - shown.length;
    const M = tg.selectAll('text.tmore').data(more > 0 ? [more] : []);
    M.exit().remove();
    M.enter().append('text').attr('class', 'tmore').attr('text-anchor', 'middle');
    const a = -Math.PI / 2 + (Math.ceil(shown.length / 2) + 1) * step;
    tg.selectAll('text.tmore').attr('x', (Math.cos(a) * rr).toFixed(1)).attr('y', (Math.sin(a) * rr + 3).toFixed(1)).text(m => '+' + m)
      .on('click', e => { e.stopPropagation(); setView('cc'); });
  });
}

function taskX(t) {
  if (t.status === 'done') return dismissTask(t.id);
  if (t.status === 'queued') return openTask(t.id, 'cancel');
}
async function dismissTask(id) {
  try { await post(`/api/tasks/${id}/dismiss`); } catch (e) { return alertBubble(e.message); }
  if (taskOpen && taskOpen.id === id) closeTask();
  loadTasks();
}
async function cancelTask(id) {
  let t; try { t = await post(`/api/tasks/${id}/cancel`); } catch (e) { alertBubble(e.message); return openTask(id, null, true); }
  alertBubble(`${t.id} cancelled: the message was ${t.cancelled && t.cancelled.pulled ? 'pulled from the queue' : 'not in the queue'}, it is never delivered.`);
  loadTasks();
}

/* ---------------------------------------------------------------- task panel */
const tPanel = Object.assign(document.createElement('aside'), { className: 'tpanel', hidden: true, id: 'taskPanel' });
tPanel.setAttribute('aria-label', 'Task');
document.body.append(tPanel);
const nm = id => (nodes[id] && nodes[id].name) || (String(id).startsWith('u-') ? (id === 'u-owner' ? 'Owner' : id.slice(2)) : id);
const when = t => t ? new Date(t).toLocaleString(LANG === 'tr' ? 'tr-TR' : undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

async function openTask(id, mode, quiet) {
  let t; try { t = await api('/api/tasks/' + id); } catch (e) { if (!quiet) alertBubble(e.message); return closeTask(); }
  const sig = JSON.stringify([t, mode]);
  if (quiet && !tPanel.hidden && tPanel._sig === sig) return;   // nothing changed: keep the DOM (a click may be on its way)
  tPanel._sig = sig;
  taskOpen = { id, mode: t.status === 'queued' ? mode : null };
  const kids = t.kids || [];   // from the server: done children are off the map after a minute, the panel still lists them
  const thread = (t.thread || []).filter((m, i) => i > 0 && !(m.kind === 'result' && m.text === t.result && i === t.thread.length - 1));
  const draft = (tPanel.querySelector('textarea') || {}).value || '';
  tPanel.innerHTML = `
    <div class="tp-head"><span class="tp-dot" style="background:${TASK_C[t.status]}"></span><b>${esc(t.id)}</b><span class="tp-st s-${t.status}">${TASK_T[t.status] || t.status}${t.fyi ? ' · FYI' : ''}${t.dismissed ? ' · dismissed' : ''}</span>
      <span class="grow"></span><button class="ghost sm icon" data-a="close" aria-label="Close">✕</button></div>
    <h3>${esc(t.title)}</h3>
    ${t.desc ? `<p class="tp-desc">${esc(t.desc)}</p>` : ''}
    <div class="tp-meta">${esc(nm(t.by || t.from))} → ${esc(nm(t.to))}${t.site ? ` · <span>${esc(t.site)}</span>` : ''}${t.pm ? ` · ${esc(t.pm)}` : ''}${t.parent ? ` · part of <a href="#" data-open="${esc(t.parent)}">${esc(t.parent)}</a>` : ''}<br>
      ${t.wait ? `<b>waiting: ${esc(t.wait.note || 'pid ' + t.wait.pid)}</b> (pid ${t.wait.pid}, since ${when(t.wait.since)})<br>` : ''}created ${when(t.createdAt)}${t.startedAt ? ' · picked up ' + when(t.startedAt) : ''}${t.finishedAt ? ` · ${t.status === 'cancelled' ? 'cancelled' : 'finished'} ${when(t.finishedAt)}` : ''}${costTxt(t) ? `<br><span class="tp-cost${t.spent_fresh >= 5e6 ? ' over' : ''}" title="tokens spent while this task was open: own = the assignee plus children given work linked to it (the 5M cap counts this); tree = every agent under the assignee">cost: ${esc(costTxt(t))}</span>` : ''}</div>
    ${t.status === 'done' ? (res => res
      ? `<div class="tp-sec res"><small>Result${res.via ? ` · <a href="#" data-open="${esc(res.via)}">${esc(res.via)}</a>` : ''}</small><div class="tp-md">${md(res.text)}</div></div>`
      : `<div class="tp-sec res none"><small>Result</small><div class="tp-none">no result</div></div>`)(taskResult(t)) : ''}
    <details class="tp-sec" ${t.status !== 'done' ? 'open' : ''}><summary>Request</summary><div class="tp-md">${md(t.text)}</div></details>
    ${kids.length ? `<div class="tp-sec"><small>Handed out</small>${kids.map(k => `<a href="#" class="tp-kid" data-open="${k.id}"><i style="background:${TASK_C[k.status]}"></i>${esc(k.id)} · ${esc(nm(k.to))} · ${esc(TASK_T[k.status])}</a>`).join('')}</div>` : ''}
    ${thread.length ? `<details class="tp-sec"><summary>History (${thread.length})</summary>${thread.map(m => `<div class="tp-msg k-${esc(m.kind)}"><small>${esc(nm(m.from))} · ${when(m.at)}</small><div class="tp-md">${md(String(m.text).slice(0, 1500))}</div></div>`).join('')}</details>` : ''}
    ${t.status === 'queued' && taskOpen.mode === 'cancel' ? `<div class="tp-confirm"><b>Cancel ${esc(t.id)}?</b><span>It has not been delivered yet. Cancelling pulls it out of the queue, so ${esc(nm(t.to))} never gets it.</span>
        <div class="row"><button class="ghost sm" data-a="keep">Keep it</button><button class="ghost sm danger" data-a="cancel-yes">Yes, cancel</button></div></div>`
      : t.status === 'queued' ? `<div class="row"><button class="ghost sm danger" data-a="cancel">Cancel task</button></div>` : ''}
    ${t.status !== 'queued' ? `<form class="tp-follow"><textarea rows="2" placeholder="${t.status === 'working' ? 'Note' : 'Reply'} on this task (goes to ${esc(nm(t.to))})…">${esc(draft)}</textarea>
        <div class="row">${t.status === 'working' ? '' : `<button type="button" class="ghost sm" data-a="dismiss" title="Hide from the map; it stays in the list">Dismiss</button>`}<span class="grow"></span>
          ${t.status === 'working' ? '' : `<button type="button" class="ghost sm" data-a="newtask" title="New work: a new task for ${esc(nm(t.to))}, this one stays done">New task</button>`}
          <button class="primary sm" title="${t.status === 'working' ? 'A note on this task' : 'A note on this task; it stays done'}">Send note</button></div></form>` : ''}`;
  tPanel.hidden = false;
  tPanel.querySelectorAll('[data-open]').forEach(a => a.onclick = e => { e.preventDefault(); openTask(a.dataset.open); });
  tPanel.querySelectorAll('[data-a]').forEach(b => b.onclick = e => {
    e.preventDefault();
    const a = b.dataset.a;
    if (a === 'close') closeTask();
    else if (a === 'cancel') openTask(t.id, 'cancel', true);
    else if (a === 'keep') openTask(t.id, null, true);
    else if (a === 'cancel-yes') cancelTask(t.id);
    else if (a === 'dismiss') dismissTask(t.id);
    else if (a === 'newtask') sendFollow('task');
  });
  const f = tPanel.querySelector('.tp-follow');
  async function sendFollow(mode) {   // note: the task keeps its status; task: new work becomes a new child task
    const ta = f.querySelector('textarea'), text = ta.value.trim(); if (!text) return ta.focus();
    f.querySelectorAll('button').forEach(b => b.disabled = true);
    try {
      const r = await post(`/api/tasks/${t.id}/followup`, { text, mode });
      ta.value = ''; alertBubble(r.newTask ? `New task ${r.newTask} for ${nm(t.to)}` : `Note sent to ${nm(t.to)} on ${t.id}`);
    } catch (err) { alertBubble(err.message); }
    f.querySelectorAll('button').forEach(b => b.disabled = false); loadTasks();
  }
  if (f) f.onsubmit = e => { e.preventDefault(); sendFollow('note'); };
}
function closeTask() { taskOpen = null; tPanel.hidden = true; }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && taskOpen && document.activeElement.tagName !== 'TEXTAREA') closeTask(); });

/* ---------------------------------------------------------------- Command center list */
const tList = Object.assign(document.createElement('section'), { className: 'tlist', id: 'taskList' });
tList.setAttribute('aria-label', 'Tasks');
tList.innerHTML = `<div class="tl-head"><button class="tl-tog" aria-expanded="true"><b>Tasks</b><span id="tlCount"></span></button></div>
  <div class="tl-body">
    <div class="tl-f">
      <select id="tlStatus" aria-label="Status"><option value="">All statuses</option><option value="queued">Queued</option><option value="working">Working</option><option value="done">Done</option><option value="cancelled">Cancelled</option><option value="dismissed">Dismissed</option><option value="fyi">FYI (info only)</option></select>
      <select id="tlSite" aria-label="Project"><option value="">All projects</option></select>
      <label>From<input type="date" id="tlSince"></label><label>To<input type="date" id="tlUntil"></label>
      <input type="search" id="tlQ" placeholder="Search…" aria-label="Search">
    </div>
    <div class="tl-rows" id="tlRows"><p class="muted small">Loading…</p></div>
  </div>`;
(document.getElementById('mapPane') || document.body).append(tList);
try {   // phones start folded so the chat stays readable
  const v = localStorage.getItem('cmd.tlist');
  if (v === 'min' || (v == null && matchMedia('(max-width:599px),(pointer:coarse) and (max-height:499px)').matches)) tList.classList.add('min');
} catch {}
tList.querySelector('.tl-tog').onclick = () => {
  const m = tList.classList.toggle('min'); tList.querySelector('.tl-tog').setAttribute('aria-expanded', !m);
  try { localStorage.setItem('cmd.tlist', m ? 'min' : ''); } catch {}
};
['tlStatus', 'tlSite', 'tlSince', 'tlUntil'].forEach(id => document.getElementById(id).onchange = loadTaskList);
let tlQT = null; document.getElementById('tlQ').oninput = () => { clearTimeout(tlQT); tlQT = setTimeout(loadTaskList, 250); };

async function loadTaskList() {
  const v = id => document.getElementById(id).value;
  const qs = new URLSearchParams({ list: 1, status: v('tlStatus'), site: v('tlSite'), since: v('tlSince'), until: v('tlUntil'), q: v('tlQ') });
  let r; try { r = await api('/api/tasks?' + qs); } catch (e) { document.getElementById('tlRows').innerHTML = `<p class="muted small">${esc(e.message)}</p>`; return; }
  const sel = document.getElementById('tlSite'), cur = sel.value;
  const opts = '<option value="">All projects</option>' + (r.sites || r.projects || []).map(s => `<option${s === cur ? ' selected' : ''}>${esc(s)}</option>`).join('') + `<option value="-"${cur === '-' ? ' selected' : ''}>No project</option>`;
  if (sel._o !== opts) { sel._o = opts; sel.innerHTML = opts; }
  document.getElementById('tlCount').textContent = r.items.length + (r.items.length >= 500 ? '+' : '');
  const resLine = t => { if (t.status !== 'done') return ''; const x = taskResult(t); return x ? `<small class="tl-res">→ ${esc(firstLine(x.text, 160))}</small>` : '<small class="tl-res none">no result</small>'; };
  // up to 500 rows can come in: build 50 at a time
  tlItems = r.items; tlN = 50; tlResLine = resLine; renderTaskRows();
}
/* What the task cost while open (fresh tokens / list-price $). Counted = assignee + children linked to the task (the
   number a budget cap uses); tree = everything under the assignee, shown only. */
const tcM = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : Math.round(n / 1000) + 'K';
function costTxt(t) {
  if (t.spent_fresh == null) return '';
  const tree = t.spent_members > 1 && (t.spent_tree_fresh || 0) > t.spent_fresh ? ` / tree ${tcM(t.spent_tree_fresh)} · $${(+t.spent_tree_usd || 0).toFixed(2)} (${t.spent_members - 1} under it)` : '';
  return `${t.spent_late ? '≥' : ''}${t.spent_linked ? `own+${t.spent_linked} linked` : 'own'} ${tcM(t.spent_fresh)} fresh · $${(+t.spent_usd || 0).toFixed(2)}${tree}${t.status === 'working' ? ' so far' : ''}`;
}
let tlItems = [], tlN = 50, tlResLine = () => '';
function renderTaskRows() {
  const resLine = tlResLine, items = tlItems.slice(0, tlN);
  document.getElementById('tlRows').innerHTML = items.length ? items.map(t => `<button class="tl-row${t.parent ? ' kid' : ''}${t.dismissed ? ' dis' : ''}" data-id="${t.id}">
      <i style="background:${TASK_C[t.status]}"></i><span class="tl-id">${esc(t.id)}</span><span class="tl-t">${esc(t.title)}${t.desc ? `<small class="tl-desc">${esc(firstLine(t.desc, 200))}</small>` : ''}${resLine(t)}<small>${esc(nm(t.from))} → ${esc(nm(t.to))}${t.site ? ' · ' + esc(t.site) : ''}${costTxt(t) ? ' · ' + esc(costTxt(t)) : ''}</small></span>
      <span class="tl-w">${esc(TASK_T[t.status])}${t.fyi ? ' · FYI' : ''}${t.dismissed ? '<br>dismissed' : ''}<br>${esc(ago(t.createdAt))}</span></button>`).join('')
    + (tlItems.length > tlN ? `<button type="button" class="chat-more" id="tlMore">more (${tlItems.length - tlN})</button>` : '')
    : '<p class="muted small">No tasks match.</p>';
  const mb = document.getElementById('tlMore'); if (mb) mb.onclick = () => { tlN += 100; renderTaskRows(); };
  document.querySelectorAll('#tlRows .tl-row').forEach(b => b.onclick = () => openTask(b.dataset.id));
}
function tasksView(v) { if (v === 'cc') loadTaskList(); }

loadTasks();
if (document.body.classList.contains('v-cc')) loadTaskList();

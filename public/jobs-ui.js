/* Jobs board. Loaded after app.js and uses its globals (api, esc, ago, fmtTok, view, me, $). One card per job: who has
   it, status, progress bar, last step, next step, spend against its budget, outputs, and the step list on demand. Tiles
   on top: open, working, waiting on you, stale (no step for 30 min) and today's spend that belongs to no job. Agents
   update the cards with cmd job; a person can nudge a stuck one (at most once per 10 min). The board reloads on the
   hub's 'jobs' event and once a minute while open. */
'use strict';
const JB_ST = { planned: 'planned', working: 'working', waiting: 'waiting', done: 'done', cancelled: 'cancelled' };
const JB_ON = { owner: 'you', agent: 'an agent', capacity: 'capacity', job: 'another job' };
let jbData = null, jbFilter = 'open', jbLoadT = null, jbLast = 0;
const jbOpen = new Set();
try { jbFilter = localStorage.getItem('cmd.jbf') || 'open'; } catch {}

const jbDur = ms => { if (!(ms > 0)) return '–'; const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24); return d ? `${d}d ${h % 24}h` : h ? `${h}h ${m % 60}m` : `${m || '<1'}m`; };
const jbAgo = t => t ? jbDur(Date.now() - t) + ' ago' : '';
function jbOut(o) {
  if (/^https?:/.test(o)) return `<a href="${esc(o)}" target="_blank" rel="noopener">${esc(o.replace(/^https?:\/\//, '').slice(0, 48))}</a>`;
  if (/^c\d+$/.test(o)) return `<span class="jb-o cl" title="Changelog">${esc(o)}</span>`;
  return `<span class="jb-o" title="${esc(o)}">${esc(o.slice(0, 12))}</span>`;
}

function loadJobs(force) {
  clearTimeout(jbLoadT);
  if (!me || !me.admin) return;
  if (!force && document.hidden) return;
  const wait = force ? 0 : Math.max(0, (view === 'jobs' ? 1500 : 60000) - (Date.now() - jbLast));
  jbLoadT = setTimeout(async () => {
    jbLast = Date.now();
    try { jbData = await api('/api/jobs' + (jbFilter === 'open' ? '' : '?all=1')); }
    catch (e) { if (view === 'jobs') $('#jbList').innerHTML = `<div class="act-empty">${esc(e.message)}</div>`; return; }
    jbBadge();
    if (view === 'jobs' && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('.jb-dec'))) renderJobs();
  }, wait);
}
function jbBadge() {
  if (!jbData) return;
  const open = jbData.items.filter(j => j.status !== 'done' && j.status !== 'cancelled');
  const owner = open.filter(j => j.status === 'waiting' && j.waitOn === 'owner').length, stale = open.filter(j => j.stale).length;
  document.querySelectorAll('.jbadge').forEach(b => { const n = open.length; b.hidden = !n; b.textContent = n; b.classList.toggle('bad', !!(owner || stale)); });
}
function renderJobs() {
  if (!jbData) return;
  const all = jbData.items, open = all.filter(j => j.status !== 'done' && j.status !== 'cancelled');
  const xs = jbFilter === 'open' ? open : jbFilter === 'done' ? all.filter(j => j.status === 'done' || j.status === 'cancelled') : all;
  const sp = jbData.spend || {}, tracked = sp.trackedFresh || 0;   // owned + unowned since the hub counts, not the whole day
  const pctOwned = tracked ? Math.round(100 * (sp.ownedFresh || 0) / tracked) : null;
  $('#jbCount').textContent = `${open.length} open jobs`;
  document.querySelectorAll('#jbFs [data-jf]').forEach(b => b.classList.toggle('on', b.dataset.jf === jbFilter));
  const tile = (n, l, cls, title) => `<div class="q-tile${cls ? ' ' + cls : ''}"${title ? ` title="${esc(title)}"` : ''}><b>${n}</b><small>${l}</small></div>`;
  const wOwner = open.filter(j => j.status === 'waiting' && j.waitOn === 'owner').length, stale = open.filter(j => j.stale).length;
  const top = (sp.top || []).slice(0, 6).map(x => `${x.name}: ${fmtTok(x.fresh)} / $${x.usd}`).join('\n');
  $('#jbSum').innerHTML = tile(open.length, 'open jobs') + tile(open.filter(j => j.status === 'working').length, 'working')
    + tile(wOwner, 'waiting on you', wOwner ? 'warn' : '') + tile(stale, 'stuck?', stale ? 'bad' : '', 'No step written for 30+ minutes')
    + tile(pctOwned == null ? '–' : pctOwned + '%', 'spend tied to a job today', pctOwned != null && pctOwned < 50 ? 'warn' : '', `Share of the fresh tokens the hub counted today (${fmtTok(tracked)}) that belongs to a job. The rest has no job.`)
    + tile('$' + (sp.unownedUsd || 0), `no job today (${fmtTok(sp.unownedFresh || 0)})`, '', top ? 'Top spenders without a job:\n' + top : '');
  const order = j => j.status === 'waiting' && j.waitOn === 'owner' ? 0 : j.stale ? 1 : j.status === 'working' ? 2 : j.status === 'waiting' ? 3 : j.status === 'planned' ? 4 : 5;
  xs.sort((a, b) => order(a) - order(b) || (b.updatedAt || 0) - (a.updatedAt || 0));
  $('#jbList').innerHTML = xs.length ? xs.map(jbCard).join('')
    : `<div class="act-empty">${jbFilter === 'open' ? 'No open jobs. When work is handed out (or an agent starts one with cmd job start) it shows here as a card.' : 'Nothing here.'}</div>`;
}
/* Decide on the card: a job waiting on you shows its open decision cards (chips as in Actions) or, with none, a box for
   a free decision; both go to the agent and the job moves to "waiting on the agent". Drafts live in jbDraft so a board
   reload does not wipe them; the board does not redraw while a decision box has focus. */
const jbDraft = {};   // key (card id or job id) -> { answers, note, text }
const jbD = k => jbDraft[k] || (jbDraft[k] = { answers: {}, note: '', text: '' });
function jbDecide(j) {
  const cards = j.decide || [];
  const qHtml = (c, q) => {
    const a = jbD(c.id).answers[q.id];
    const body = q.type === 'text'
      ? `<input class="atext jb-dtext" data-jdc="${esc(c.id)}" data-jq="${esc(q.id)}" value="${esc(a || '')}" placeholder="${esc(q.placeholder || '')}" autocomplete="off">`
      : `<div class="achips">${q.options.map(op => { const on = q.type === 'many' ? [].concat(a || []).includes(op.v) : a === op.v;
          return `<button type="button" class="achip ${esc(q.type)}" data-jdc="${esc(c.id)}" data-jq="${esc(q.id)}" data-jv="${esc(op.v)}" aria-pressed="${on}"><span class="bx"></span><span>${esc(op.l)}</span>${op.rec ? '<span class="rec">recommended</span>' : ''}</button>`; }).join('')}</div>`;
    return `<div class="jb-dq">${q.label ? `<span class="aql">${esc(q.label)}</span>` : ''}${body}</div>`;
  };
  const body = cards.length ? cards.map(c => `<div class="jb-dcard" data-jcard="${esc(c.id)}">
      <div class="jb-dt"><b>${esc(c.title)}</b> <small>${esc(c.id)} · ${esc(c.from)}${c.kind === 'delete' ? ' · <span class="akind del">DELETE</span>' : ''}</small></div>
      ${c.detail ? `<div class="jb-ddet">${esc(c.detail)}</div>` : ''}
      ${c.questions.map(q => qHtml(c, q)).join('')}
      <textarea class="anote jb-dnote" data-jdn="${esc(c.id)}" rows="2" placeholder="Your own answer or condition (you can send just this)">${esc(jbD(c.id).note)}</textarea>
      <div class="jb-df"><span class="jb-dmsg"></span><button type="button" class="asend jb-dsend" data-jsend="${esc(j.id)}" data-jsc="${esc(c.id)}">Send decision</button></div>
    </div>`).join('')
    : `<div class="jb-dcard"><textarea class="anote jb-dnote" data-jdn="${esc(j.id)}" rows="2" placeholder="Write your decision: ${esc(j.ownerName || 'the agent')} carries it out">${esc(jbD(j.id).text)}</textarea>
      <div class="jb-df"><span class="jb-dmsg"></span><button type="button" class="asend jb-dsend" data-jsend="${esc(j.id)}">Send decision</button></div></div>`;
  return `<div class="jb-dec"><div class="jb-dh">Decide</div>${body}</div>`;
}
function jbCard(j) {
  const st = j.stale ? 'stuck?' : JB_ST[j.status] || j.status;
  const bud = Math.min(100, j.budgetPct || 0), budCls = j.budgetPct >= 100 ? ' over' : j.budgetPct >= 80 ? ' hot' : '';
  const wait = j.status === 'waiting' ? `<div class="jb-wait${j.waitOn === 'owner' ? ' you' : ''}">⏳ waiting on ${esc(JB_ON[j.waitOn] || j.waitOn || '')}${j.waitWhy ? ': ' + esc(j.waitWhy) : ''}</div>` : '';
  // after a nudge the card says what happened (the agent was busy / asleep and woken / idle) until it answers
  const nd = j.nudge, ndOk = nd && j.status !== 'done' && j.status !== 'cancelled' && Date.now() - nd.at < 6 * 3600e3;
  const ndSt = nd && ({ working: 'was working, message delivered; it sees it after its current step', asleep: 'was asleep, woken up', idle: 'was idle, message delivered' }[nd.state] || (nd.state ? nd.state + ', message sent' : 'message sent'));
  const nud = !ndOk ? '' : nd.answeredAt ? `<div class="jb-nud ok" title="The agent's first step after the nudge">✓ answered ${esc(jbAgo(nd.answeredAt))} (nudged ${esc(jbAgo(nd.at))})</div>`
    : `<div class="jb-nud" title="${esc(nd.result || '')}">👉 nudged ${esc(jbAgo(nd.at))}: ${esc(j.ownerName || 'the agent')} ${esc(ndSt)}. Waiting for an answer.</div>`;
  const who = [j.ownerName, j.active && j.active.length > 1 ? `+${j.active.length - 1} agents` : '', j.startedAt ? 'started ' + jbAgo(j.startedAt) : 'created ' + jbAgo(j.createdAt), j.activeMs ? 'active ' + jbDur(j.activeMs) : '', j.byName && j.by !== j.owner ? 'from: ' + j.byName : ''].filter(Boolean).map(esc).join(' · ');
  const steps = (j.steps || []).slice().reverse().map(s => `<li><small>${esc(new Date(s.at).toLocaleString('sv-SE').slice(5, 16))} · ${esc(s.by)}${s.pct != null ? ' · ' + s.pct + '%' : ''}</small>${esc(s.text)}</li>`).join('');
  const isOpen = jbOpen.has(j.id);
  return `<article class="jb-card s-${esc(j.status)}${j.stale ? ' stale' : ''}" data-jid="${esc(j.id)}">
    <div class="jb-h"><span class="jb-id">${esc(j.id)}</span><b class="jb-t">${esc(j.title)}</b>${j.halted ? `<span class="jb-flag over" title="Budget used up, the job was halted${j.card ? '; decision card ' + esc(j.card) : ''}">budget used up</span>` : ''}${j.noValue ? '<span class="jb-flag" title="3M+ tokens spent and no commit, link or changelog yet (shown only)">no output</span>' : ''}${j.status !== 'done' && j.status !== 'cancelled' && !(j.status === 'waiting' && j.waitOn === 'owner') ? `<button type="button" class="ghost sm jb-nudge" data-jnudge="${esc(j.id)}" title="${esc('Nudge ' + (j.ownerName || 'the agent') + ': a message asks it to pick the job up where it left off')}"${Date.now() - (j.nudgedAt || 0) < 600e3 ? ' disabled' : ''}>${Date.now() - (j.nudgedAt || 0) < 600e3 ? 'nudged' : '👉 Nudge'}</button>` : ''}${j.ownerCloses && j.status !== 'done' && j.status !== 'cancelled' ? `<button type="button" class="ghost sm jb-close${j.readyAt ? ' ready' : ''}" data-jclose="${esc(j.id)}" title="${esc(j.readyAt ? 'The agent says it is done; you choose when to close it' : 'You decided on this job from the board; only you close it')}">✓ Close</button>` : ''}<span class="jb-pill"><i></i>${esc(st)}</span></div>
    <div class="jb-who">${who}</div>
    ${j.ask && j.ask !== j.title ? `<div class="jb-ask">“${esc(j.ask.slice(0, 260))}”</div>` : ''}
    <div class="jb-bar" title="Progress"><i style="width:${Math.max(0, Math.min(100, j.pct || 0))}%"></i><span>${j.pct || 0}%</span></div>
    ${wait}${nud}
    ${j.status === 'waiting' && j.waitOn === 'owner' ? jbDecide(j) : ''}
    ${j.status === 'done' || j.status === 'cancelled' ? `<div class="jb-res"><b>Result:</b> ${esc(j.result || '')}</div>`
      : `${j.last ? `<div class="jb-last"><b>Last step</b> <small>${esc(jbAgo(j.last.at))}</small> ${esc(j.last.text)}</div>` : '<div class="jb-last muted">No step written yet.</div>'}
    ${j.next ? `<div class="jb-next"><b>Next</b> ${esc(j.next)}</div>` : ''}`}
    <div class="jb-cost"><span title="Fresh tokens booked to this job / budget">${fmtTok(j.spent_fresh)} / ${fmtTok(j.budget)} token</span><span>$${j.spent_usd}</span><div class="jb-bud${budCls}"><i style="width:${bud}%"></i></div></div>
    ${j.outputs && j.outputs.length ? `<div class="jb-outs">${j.outputs.slice(-8).map(jbOut).join('')}</div>` : ''}
    ${j.nSteps > 1 ? `<details class="jb-steps"${isOpen ? ' open' : ''}><summary>Steps (${j.nSteps})</summary><ol>${steps}</ol></details>` : ''}
  </article>`;
}
$('#jobsView').addEventListener('click', e => {
  const ch = e.target.closest('.achip[data-jdc]');
  if (ch) {
    const d = jbD(ch.dataset.jdc), q = ch.dataset.jq, v = ch.dataset.jv, many = ch.classList.contains('many');
    if (many) { const cur = [].concat(d.answers[q] || []); d.answers[q] = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]; }
    else d.answers[q] = d.answers[q] === v ? '' : v;
    ch.parentNode.querySelectorAll('.achip').forEach(b => b.setAttribute('aria-pressed', String(many ? d.answers[q].includes(b.dataset.jv) : d.answers[q] === b.dataset.jv)));
    return;
  }
  const ds = e.target.closest('[data-jsend]');
  if (ds) {
    const card = ds.dataset.jsc || '', k = card || ds.dataset.jsend, d = jbD(k), msg = ds.parentNode.querySelector('.jb-dmsg');
    const payload = card ? { card, answers: d.answers, note: d.note } : { text: d.text };
    ds.disabled = true; msg.textContent = 'sending…';
    api('/api/jobs/' + encodeURIComponent(ds.dataset.jsend) + '/decide', { method: 'POST', body: JSON.stringify(payload) })
      .then(() => { delete jbDraft[k]; msg.textContent = 'sent, the agent carries it out (the job stays open; you choose when to close it)'; if (document.activeElement) document.activeElement.blur(); setTimeout(() => loadJobs(true), 600); })
      .catch(err => { ds.disabled = false; msg.textContent = err.message; });
    return;
  }
  const cb = e.target.closest('[data-jclose]');
  if (cb) {   // close a job you decided on: two clicks, no browser dialog
    if (!cb.dataset.arm) { cb.dataset.arm = '1'; cb.textContent = 'Sure? Close'; setTimeout(() => { if (cb.isConnected && cb.dataset.arm) { delete cb.dataset.arm; cb.textContent = '✓ Close'; } }, 4000); return; }
    cb.disabled = true; cb.textContent = '…';
    api('/api/jobs/' + encodeURIComponent(cb.dataset.jclose) + '/close', { method: 'POST', body: '{}' })
      .then(() => loadJobs(true))
      .catch(err => { cb.disabled = false; delete cb.dataset.arm; cb.textContent = 'failed'; cb.title = err.message; });
    return;
  }
  const nb = e.target.closest('[data-jnudge]');
  if (nb) {
    nb.disabled = true; nb.textContent = '…';
    api('/api/jobs/' + encodeURIComponent(nb.dataset.jnudge) + '/nudge', { method: 'POST', body: '{}' })
      .then(() => { nb.textContent = 'nudged'; nb.title = 'Message sent; the agent will carry on'; loadJobs(true); })
      .catch(err => { nb.textContent = 'failed'; nb.title = err.message; setTimeout(() => { nb.disabled = false; nb.textContent = '👉 Nudge'; }, 4000); });
    return;
  }
  const f = e.target.closest('[data-jf]');
  if (f) { jbFilter = f.dataset.jf; try { localStorage.setItem('cmd.jbf', jbFilter); } catch {} renderJobs(); loadJobs(true); }
});
$('#jobsView').addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.jdn) { const d = jbD(t.dataset.jdn); if (/^J-/.test(t.dataset.jdn)) d.text = t.value; else d.note = t.value; }
  else if (t.dataset.jdc && t.dataset.jq) jbD(t.dataset.jdc).answers[t.dataset.jq] = t.value;
});
$('#jobsView').addEventListener('toggle', e => {
  const c = e.target.closest && e.target.closest('[data-jid]'); if (!c || !e.target.matches('details')) return;
  if (e.target.open) jbOpen.add(c.dataset.jid); else jbOpen.delete(c.dataset.jid);
}, true);
setInterval(() => { if (view === 'jobs') loadJobs(); }, 60000);
window.jobsView = v => { if (v === 'jobs') { renderJobs(); loadJobs(true); } };
setTimeout(() => loadJobs(), 3000);

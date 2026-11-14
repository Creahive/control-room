'use strict';
/* The event log (events.jsonl) and the browser streams. Every spawn, message, stop and system note is one event; the
 * map animates it and the live feed shows a one-line version of it. */
const fs = require('fs');
const path = require('path');
const { now } = require('./util');

module.exports = function events(hub) {
  const FILE = path.join(hub.cfg.dataDir, 'events.jsonl');
  const clients = new Set();
  const live = [];
  hub.clients = clients;

  function broadcast(type, data) {
    for (const c of clients) {
      if ((type === 'pulse' || type === 'live') && !hub.visibleTo(c.user, data)) continue;
      const d = type === 'tree' ? hub.snapshotFor(c.user) : data;
      c.res.write(`event: ${type}\ndata: ${JSON.stringify(d)}\n\n`);
    }
  }
  function recentEvents(n = 60) {
    try { return fs.readFileSync(FILE, 'utf8').trim().split('\n').slice(-n).map(l => JSON.parse(l)); } catch { return []; }
  }
  const nm = id => (hub.tree.nodes[id] && hub.tree.nodes[id].name) || id;
  /** The feed line of an event (null = not shown in the feed). */
  function feedLine(ev) {
    const t = String(ev.text || '').replace(/\s+/g, ' ').trim();
    if (!t) return null;
    if (ev.type === 'msg' && (ev.from === ev.to || String(ev.from).startsWith('u-') || String(ev.to).startsWith('u-'))) return null;
    let kind, text;
    if (ev.type === 'spawn') { kind = 'eco-start'; text = t === 'restarted' ? 'restarted' : `started by ${nm(ev.from)}: ${t}`; }
    else if (ev.type === 'done') { kind = 'eco-done'; text = `done: ${t}`; }
    else if (ev.type === 'stop') { kind = 'eco-stop'; text = t; }
    else if (ev.type === 'msg') { kind = 'eco-msg'; text = `→ ${nm(ev.to)}: ${t}`; }
    else if (ev.type === 'care') { kind = 'eco-sys'; text = t; }
    else return null;
    const agent = ev.type === 'spawn' || ev.type === 'stop' || (ev.type === 'care' && ev.to !== 'brain') ? ev.to : ev.from;
    return { agent, from: ev.from, to: ev.to, kind, text: text.length > 220 ? text.slice(0, 217) + '…' : text, at: ev.ts, eco: 1 };
  }
  function logEvent(ev) {
    ev.ts = ev.ts || now();
    try { fs.appendFileSync(FILE, JSON.stringify(ev) + '\n'); } catch (e) { console.error('[events]', e.message); }
    broadcast('pulse', ev);
    const l = feedLine(ev);
    if (l) { live.push(l); if (live.length > 200) live.splice(0, live.length - 200); broadcast('live', l); }
  }
  for (const ev of recentEvents(400)) { const l = feedLine(ev); if (l) live.push(l); }

  Object.assign(hub, { broadcast, recentEvents, logEvent, liveFeed: () => live.slice(-120) });
};

'use strict';
/* Token spend per agent, read from its Claude Code transcripts (every session the hub saw it run). "Fresh" tokens are
 * input + cache writes + output; cache reads are counted apart (they are cheap). The dollar figure is an estimate from
 * a small per-model price table (USD per million tokens), overridable in config.prices. Files are read incrementally. */
const fs = require('fs');
const path = require('path');
const { now, readJSON, writeJSON } = require('./util');

const PRICES = {   // [input, output, cacheWrite, cacheRead] per 1M tokens; matched by substring of the model id
  opus: [15, 75, 18.75, 1.5],
  sonnet: [3, 15, 3.75, 0.3],
  haiku: [1, 5, 1.25, 0.1],
};

module.exports = function tokens(hub) {
  const { cfg, tree } = hub;
  const F = path.join(cfg.dataDir, 'tokens.json');
  const st = readJSON(F, null) || { files: {}, days: {} };   // files: path -> { off, id }; days: 'YYYY-MM-DD' -> { id: { t, cr, usd } }
  const prices = { ...PRICES, ...(cfg.prices || {}) };
  const priceOf = model => { const m = String(model || '').toLowerCase(); for (const [k, v] of Object.entries(prices)) if (m.includes(k)) return v; return prices.sonnet; };
  const dayOf = ts => new Date(ts).toISOString().slice(0, 10);
  let view = { at: 0, periods: {} };

  function addUsage(id, ts, model, u) {
    const p = priceOf(model);
    const fresh = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0), cr = u.cache_read_input_tokens || 0;
    const usd = ((u.input_tokens || 0) * p[0] + (u.output_tokens || 0) * p[1] + (u.cache_creation_input_tokens || 0) * p[2] + cr * p[3]) / 1e6;
    const d = st.days[dayOf(ts)] = st.days[dayOf(ts)] || {};
    const r = d[id] = d[id] || { t: 0, cr: 0, usd: 0 };
    r.t += fresh; r.cr += cr; r.usd = Math.round((r.usd + usd) * 10000) / 10000;
  }
  function scanFile(f, id) {
    let size; try { size = fs.statSync(f).size; } catch { return; }
    const rec = st.files[f] = st.files[f] || { off: 0, id };
    if (size <= rec.off) { if (size < rec.off) rec.off = 0; return; }
    const len = Math.min(size - rec.off, 50_000_000), b = Buffer.alloc(len), fd = fs.openSync(f, 'r');
    fs.readSync(fd, b, 0, len, rec.off); fs.closeSync(fd);
    const text = b.toString('utf8'), cut = text.lastIndexOf('\n');
    if (cut < 0) return;
    for (const line of text.slice(0, cut).split('\n')) {
      if (!line.includes('"usage"')) continue;
      try { const e = JSON.parse(line), m = e.message || {}; if (e.type === 'assistant' && m.usage) addUsage(rec.id, Date.parse(e.timestamp) || now(), m.model, m.usage); } catch {}
    }
    rec.off += Buffer.byteLength(text.slice(0, cut + 1));
  }
  function tick() {
    if (hub.demo) return;
    for (const n of Object.values(tree.nodes)) for (const sid of new Set([...(n.sessions || []), n.sessionId].filter(Boolean))) {
      const f = hub.claude.transcriptPath(sid, n.cwd); if (f) scanFile(f, n.id);
    }
    const keep = new Date(now() - 62 * 864e5).toISOString().slice(0, 10);
    for (const d of Object.keys(st.days)) if (d < keep) delete st.days[d];
    try { writeJSON(F, st); } catch {}
    rebuild();
  }
  function sum(days) {
    const out = {};
    for (const d of days) for (const [id, r] of Object.entries(st.days[d] || {})) { const o = out[id] = out[id] || { t: 0, cr: 0, usd: 0 }; o.t += r.t; o.cr += r.cr; o.usd = Math.round((o.usd + r.usd) * 100) / 100; }
    return out;
  }
  function rebuild() {
    const today = dayOf(now()), all = Object.keys(st.days).sort();
    const week = all.filter(d => d > new Date(now() - 7 * 864e5).toISOString().slice(0, 10)), month = all.filter(d => d.slice(0, 7) === today.slice(0, 7));
    view = { at: now(), periods: { today: sum([today]), week: sum(week), month: sum(month) } };
  }
  /** Raw per-day numbers in the snapshot shape the jobs module reads ({ at, days: { day: { id: { t, cr, usd } } } }, t includes cr). */
  const raw = () => ({ at: Math.floor(now() / 1000), days: Object.fromEntries(Object.entries(st.days).map(([d, ids]) => [d, Object.fromEntries(Object.entries(ids).map(([id, r]) => [id, { t: r.t + r.cr, cr: r.cr, usd: r.usd }]))])) });

  function limitsView(nodes) {
    return (cfg.accounts || []).map(a => ({
      id: a.id, label: a.label || a.id, email: hub.demo ? (a.email || null) : hub.claude.email(a.id), signedIn: hub.demo ? true : hub.claude.signedIn(a.id),
      running: nodes.filter(n => n.account === a.id && !['stopped', 'offline', 'asleep'].includes(n.state)).length, short: a.label || a.id,
    }));
  }

  rebuild();
  setInterval(() => { try { tick(); } catch (e) { console.error('[tokens]', e.message); } }, 60_000).unref();
  setTimeout(() => { try { tick(); } catch {} }, 3000).unref();
  Object.assign(hub, { tokenStats: () => view, tokenRaw: raw, limitsView, addDemoTokens: (id, t, usd) => { const d = st.days[dayOf(now())] = st.days[dayOf(now())] || {}; d[id] = { t, cr: t * 8, usd }; rebuild(); } });
};

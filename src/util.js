'use strict';
const fs = require('fs');
const crypto = require('crypto');

const now = () => Date.now();
const rid = (n = 6) => crypto.randomBytes(n).toString('hex');
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
function writeJSON(f, v) { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(v, null, 1), { mode: 0o600 }); fs.renameSync(t, f); }
const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'agent';
const oneLine = (s, n = 200) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const fmtK = t => t >= 1e6 ? (t / 1e6).toFixed(1) + 'M' : Math.round(t / 1000) + 'K';
/** Neutralise the hub's own provenance markers inside a message body, so forwarded text cannot pose as the hub. */
const defang = t => String(t == null ? '' : t).replace(/📨/g, '✉').replace(/^(\s*)\[actions/gim, '$1(actions');

module.exports = { now, rid, readJSON, writeJSON, slug, oneLine, fmtK, defang };

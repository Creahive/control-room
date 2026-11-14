'use strict';
/* People and sign-in. The admin is created by the setup wizard (password, optional two-step code). Other people are
 * invited: a one-time link (48 h; only its sha256 is kept) where they set their own password and enrol an authenticator
 * (TOTP), getting 10 recovery codes. Each person has a front desk agent (the admin's is "front", others "desk-<id>")
 * and permissions the admin picks; they are enforced here, not only hidden in the UI.
 * Passwords: scrypt. Sessions: random 32-byte token in the HttpOnly cookie cmdsess, 30 days. Tokens, secrets and codes
 * are never logged. */
const crypto = require('crypto');
const path = require('path');
const { now, rid, readJSON, writeJSON, slug } = require('./util');

const PERMS = {
  map: 'See the agent map and what agents are doing',
  talk: 'Read agents\' conversations and message them directly',
  manage: 'Start, stop, restart and add agents',
  terminal: 'Use agent terminals (this is shell access as the user the hub runs as)',
};
const INVITE_HOURS = 48;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');

function b32enc(buf) { let bits = 0, v = 0, out = ''; for (const b of buf) { v = (v << 8) | b; bits += 8; while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) out += B32[(v << (5 - bits)) & 31]; return out; }
function b32dec(s) { let bits = 0, v = 0; const out = []; for (const c of String(s).replace(/[\s=]/g, '').toUpperCase()) { const i = B32.indexOf(c); if (i < 0) continue; v = (v << 5) | i; bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
function totpAt(secret, step) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', b32dec(secret)).update(msg).digest(), o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}
/** The time step a 6-digit code matches (±30 s of clock drift), or 0. Steps at or before `last` are replays. */
function totpStep(secret, code, last = 0, t = now()) {
  code = String(code || '').replace(/\D/g, ''); if (code.length !== 6) return 0;
  const s0 = Math.floor(t / 30000);
  for (const s of [s0, s0 - 1, s0 + 1]) if (s > last && crypto.timingSafeEqual(Buffer.from(totpAt(secret, s)), Buffer.from(code))) return s;
  return 0;
}
const newTotpSecret = () => b32enc(crypto.randomBytes(20));
const hashPw = pw => { const salt = crypto.randomBytes(16); return { salt: salt.toString('hex'), hash: crypto.scryptSync(pw, salt, 64).toString('hex') }; };
const pwOk = (rec, pw) => !!rec && !!rec.salt && typeof pw === 'string' &&
  crypto.timingSafeEqual(crypto.scryptSync(pw, Buffer.from(rec.salt, 'hex'), 64), Buffer.from(rec.hash, 'hex'));
const newPassword = () => crypto.randomBytes(9).toString('base64url');
/** A password that is too short, too uniform or contains the person's name. */
function weakPassword(pw, u = {}) {
  if (typeof pw !== 'string' || pw.length < 10) return 'Use at least 10 characters';
  if (pw.length > 200) return 'That password is too long';
  const l = pw.toLowerCase(), nm = String(u.name || '').toLowerCase(), local = String(u.email || '').split('@')[0].toLowerCase();
  if (new Set(l).size < 6 || (nm.length >= 3 && l.includes(nm)) || (local.length >= 3 && l.includes(local)) ||
    /password|123456|qwerty|letmein|welcome|admin|iloveyou|abc123|111111|monkey|dragon|football/.test(l)) return 'Choose another password: this one is too common or too easy to guess.';
  return null;
}

module.exports = function auth(hub) {
  const { cfg } = hub;
  const USERS_F = path.join(cfg.dataDir, 'users.json'), SESS_F = path.join(cfg.dataDir, 'sessions.json');
  const users = readJSON(USERS_F, null) || {};
  const sessions = readJSON(SESS_F, null) || {};
  const tries = new Map(), mfaTickets = new Map();
  const saveUsers = () => writeJSON(USERS_F, users);
  const saveSessions = () => writeJSON(SESS_F, sessions);
  const issuer = cfg.publicUrl ? new URL(cfg.publicUrl).hostname : 'Control Room';
  const secure = /^https:/.test(cfg.publicUrl || '');

  const admin = () => Object.values(users).find(u => u.admin && u.hash) || null;
  const setupNeeded = () => !admin();
  const can = (u, perm) => !!u && (u.admin || !!(u.perms && u.perms[perm]));
  const deskOf = u => (u.admin && u.id === 'owner' ? 'front' : 'desk-' + u.id);
  const needsMfa = u => !!u && (!u.admin || !!(u.mfa && u.mfa.on));
  const otpauth = (u, secret) => `otpauth://totp/${encodeURIComponent(issuer + ':' + (u.email || u.name))}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

  function userByPassword(pw) {
    return Object.values(users).find(u => !u.disabled && pwOk(u, pw)) || null;
  }
  function newRecoveryCodes(u) {
    const codes = Array.from({ length: 10 }, () => crypto.randomBytes(5).toString('hex').replace(/(.{5})/, '$1-'));
    u.recovery = codes.map(c => sha256(c.replace(/-/g, '')));
    return codes;
  }
  function useRecoveryCode(u, code) {
    const h = sha256(String(code || '').toLowerCase().replace(/[^0-9a-f]/g, ''));
    const i = (u.recovery || []).indexOf(h); if (i < 0) return false;
    u.recovery.splice(i, 1); saveUsers(); return true;
  }
  /** At most `max` failures per key in 15 minutes. */
  const limited = (key, max) => (tries.get(key) || []).filter(x => now() - x < 15 * 60_000).length >= max;
  function failed(...keys) { for (const k of keys) { const t = (tries.get(k) || []).filter(x => now() - x < 15 * 60_000); t.push(now()); tries.set(k, t); } }

  function cookieHeader(tok, maxAge) { return `cmdsess=${tok}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`; }
  function startSession(res, uid) {
    const tok = rid(32);
    sessions[tok] = { exp: now() + 30 * 86400_000, user: uid, at: now() }; saveSessions();
    res.setHeader('Set-Cookie', cookieHeader(tok, 30 * 86400));
  }
  function endSession(res, tok) { delete sessions[tok]; saveSessions(); res.setHeader('Set-Cookie', cookieHeader('', 0)); }
  function dropSessionsOf(uid, keep) { for (const [k, v] of Object.entries(sessions)) if (v.user === uid && k !== keep) delete sessions[k]; saveSessions(); }
  const cookie = (req, name) => { const m = String(req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)')); return m ? m[1] : null; };
  function authed(req) {
    const tok = cookie(req, 'cmdsess'), s = tok && Object.prototype.hasOwnProperty.call(sessions, tok) && sessions[tok];
    if (!s || s.exp < now()) return null;
    const u = users[s.user];
    if (!u || u.disabled) return null;
    if (!u.seen || now() - u.seen > 60_000) { u.seen = now(); saveUsers(); }
    return u;
  }

  function publicUser(u) {
    const d = hub.tree.nodes[deskOf(u)];
    return { id: u.id, name: u.name, admin: !!u.admin, disabled: !!u.disabled, perms: u.admin ? Object.fromEntries(Object.keys(PERMS).map(k => [k, true])) : { ...u.perms },
      projects: u.admin ? 'all' : (u.projects || []), desk: deskOf(u), deskState: d ? hub.statusOf(d).state : null, seen: u.seen || null, createdAt: u.createdAt,
      email: u.email || '', seeAll: !u.admin && !!u.seeAll, hasPassword: !!u.hash, mfa: !!(u.mfa && u.mfa.on), mfaRequired: needsMfa(u),
      recoveryLeft: (u.recovery || []).length, invite: u.invite ? { sentAt: u.invite.sentAt || null, exp: u.invite.exp, expired: u.invite.exp < now() } : null, joinedAt: u.joinedAt || null };
  }

  /* ---- setup (the first admin) */
  function createAdmin(name, password, { demo = false } = {}) {
    if (!setupNeeded()) throw new Error('already set up');
    const w = demo ? null : weakPassword(password, { name }); if (w) throw new Error(w);
    users.owner = { id: 'owner', name: String(name || 'Admin').trim().slice(0, 40) || 'Admin', admin: true, createdAt: now(), ...hashPw(password) };
    saveUsers();
    hub.ensureCore('owner');
    return users.owner;
  }
  function setPassword(u, password) { Object.assign(u, hashPw(password)); saveUsers(); }
  function beginMfa(u) { u.mfaPending = newTotpSecret(); saveUsers(); return { secret: u.mfaPending, otpauth: otpauth(u, u.mfaPending) }; }
  function confirmMfa(u, code) {
    const st = u.mfaPending && totpStep(u.mfaPending, code);
    if (!st) return null;
    u.mfa = { on: true, secret: u.mfaPending, at: now(), lastStep: st }; delete u.mfaPending;
    const codes = newRecoveryCodes(u); saveUsers();
    return codes;
  }

  /* ---- members */
  function syncDesks() {
    for (const u of Object.values(users)) {
      const id = deskOf(u);
      if (u.admin || hub.tree.nodes[id]) continue;
      hub.tree.nodes[id] = { id, name: u.name + "'s desk", role: 'front', parent: null, user: u.id, cwd: cfg.home, createdAt: now(), stopped: true,
        brief: `Talk with ${u.name} in the browser and pass real work to BRAIN.` };
    }
    hub.saveTree();
  }
  function addUser(b) {
    const name = String(b.name || '').trim().slice(0, 40);
    if (!name) throw new Error('Give them a name');
    if (Object.values(users).some(u => u.name.toLowerCase() === name.toLowerCase())) throw new Error('Someone already has that name');
    let id = slug(name).replace(/\./g, '-'); while (users[id] || id === 'owner') id = slug(name).replace(/\./g, '-') + '-' + rid(2);
    const email = String(b.email || '').trim().toLowerCase();
    if (email && !/^[^\s<>@,;"]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) throw new Error('That email address does not look right');
    if (email && Object.values(users).some(u => u.email === email)) throw new Error('Someone already has that email');
    users[id] = { id, name, admin: false, perms: { map: true, talk: false, manage: false, terminal: false, ...(b.perms || {}) },
      projects: Array.isArray(b.projects) ? b.projects.filter(x => hub.projects().some(p => p.name === x)) : [], createdAt: now(), ...(email ? { email } : {}) };
    saveUsers(); syncDesks();
    return users[id];
  }
  /** A fresh invite link (the previous one stops working). Mailed when mail is configured, else returned to show. */
  async function inviteUser(u) {
    const token = crypto.randomBytes(32).toString('base64url');
    u.invite = { hash: sha256(token), exp: now() + INVITE_HOURS * 3600e3, createdAt: now() };
    saveUsers();
    const link = (cfg.publicUrl || `http://${cfg.bind === '0.0.0.0' ? 'localhost' : cfg.bind}:${cfg.port}`).replace(/\/$/, '') + '/invite#' + token;
    let sent = false;
    if (u.email && hub.mailer.mode !== 'console') {
      await hub.mailer.send(u.email, 'Your invite to Control Room',
        `Hello ${u.name},\n\nYou were invited to Control Room. Open this link within ${INVITE_HOURS} hours to set your password and two-step sign-in:\n\n${link}\n\nThe link works once.\n`);
      sent = true;
    } else console.log(`[invite] link for ${u.name} (valid ${INVITE_HOURS} h, show it to them yourself)`);
    u.invite.sentAt = now(); saveUsers();
    hub.logEvent({ type: 'care', from: 'front', to: deskOf(u), text: `invite ${sent ? 'mailed' : 'link made'} for ${u.name}` });
    return { link, sent, exp: u.invite.exp };
  }
  function userByInvite(token) {
    if (typeof token !== 'string' || token.length < 20) return null;
    const h = sha256(token);
    return Object.values(users).find(u => !u.admin && !u.disabled && u.invite && u.invite.hash && u.invite.exp > now() &&
      crypto.timingSafeEqual(Buffer.from(u.invite.hash), Buffer.from(h))) || null;
  }

  hub.users = { get: id => users[id], all: () => Object.values(users), save: saveUsers, raw: users };
  Object.assign(hub, {
    PERMS, can, deskOf, needsMfa, publicUser, authed, cookie, setupNeeded, createAdmin, setPassword, beginMfa, confirmMfa, syncDesks, addUser, inviteUser,
    auth: { users, sessions, saveSessions, tries, mfaTickets, limited, failed, startSession, endSession, dropSessionsOf, userByPassword, userByInvite,
      totpStep, newTotpSecret, otpauth, newRecoveryCodes, useRecoveryCode, hashPw, pwOk, newPassword, weakPassword, INVITE_HOURS },
  });
};
module.exports.totp = { totpAt, totpStep, b32enc, b32dec };
module.exports.weakPassword = weakPassword;

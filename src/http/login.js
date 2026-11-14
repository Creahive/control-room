'use strict';
/* Sign-in routes (no session needed): password, two-step code, invite links, logout. */
const { now } = require('../util');
const { send, body, serveStatic, ipOf } = require('./util');

module.exports = function loginRoutes(hub) {
  const A = () => hub.auth;
  const TOO_MANY = { error: 'Too many attempts. Wait 15 minutes.' };

  return async function route(req, res, p) {
    const a = A();
    if (p === '/login' || p === '/login.html') { serveStatic(res, 'login.html'); return true; }
    if (p === '/invite' || p === '/invite.html') { serveStatic(res, 'invite.html'); return true; }

    if (p === '/api/login' && req.method === 'POST') {
      const ip = ipOf(req);
      if (a.limited(ip, 8) || a.limited('__global__', 30)) return send(res, 429, TOO_MANY), true;
      const b = await body(req), who = a.userByPassword(b.password);
      if (!who) { a.failed(ip, '__global__'); return send(res, 401, { error: 'Wrong password' }), true; }
      if (hub.needsMfa(who)) {
        for (const [k, v] of a.mfaTickets) if (v.exp < now()) a.mfaTickets.delete(k);
        const ticket = require('../util').rid(24), tk = { uid: who.id, exp: now() + 5 * 60_000, fails: 0 };
        a.mfaTickets.set(ticket, tk);
        if (who.mfa && who.mfa.on) return send(res, 200, { mfa: 'verify', ticket }), true;
        tk.enrolSecret = a.newTotpSecret();   // a member whose two-step sign-in was reset enrols again now
        return send(res, 200, { mfa: 'enrol', ticket, secret: tk.enrolSecret, otpauth: a.otpauth(who, tk.enrolSecret) }), true;
      }
      a.startSession(res, who.id);
      return send(res, 200, { ok: true }), true;
    }
    if (p === '/api/login/mfa' && req.method === 'POST') {
      const ip = ipOf(req), b = await body(req), tk = a.mfaTickets.get(String(b.ticket || ''));
      if (a.limited('mfa:' + ip, 10) || a.limited('__mfa__', 40)) return send(res, 429, TOO_MANY), true;
      if (!tk || tk.exp < now()) { a.mfaTickets.delete(String(b.ticket || '')); return send(res, 401, { error: 'Sign-in timed out. Enter your password again.', restart: true }), true; }
      const u = hub.users.get(tk.uid);
      if (!u || u.disabled || a.limited('mfau:' + tk.uid, 10)) return send(res, 429, TOO_MANY), true;
      let ok = false, codes = null;
      if (tk.enrolSecret) {
        const st = a.totpStep(tk.enrolSecret, b.code);
        if (st) { u.mfa = { on: true, secret: tk.enrolSecret, at: now(), lastStep: st }; codes = a.newRecoveryCodes(u); hub.users.save(); ok = true; }
      } else if (u.mfa && u.mfa.on) {
        const st = a.totpStep(u.mfa.secret, b.code, u.mfa.lastStep || 0);
        if (st) { u.mfa.lastStep = st; hub.users.save(); ok = true; }
        else if (!/^\d{6}$/.test(String(b.code || '').replace(/\s/g, '')) && a.useRecoveryCode(u, b.code)) ok = true;   // not 6 digits: a recovery code
      }
      if (!ok) {
        a.failed('mfa:' + ip, '__mfa__', 'mfau:' + tk.uid);
        if (++tk.fails >= 5) { a.mfaTickets.delete(String(b.ticket)); return send(res, 401, { error: 'Too many wrong codes. Enter your password again.', restart: true }), true; }
        return send(res, 401, { error: 'That code did not work' }), true;
      }
      a.mfaTickets.delete(String(b.ticket));
      a.startSession(res, u.id);
      return send(res, 200, { ok: true, recovery: codes, recoveryLeft: (u.recovery || []).length }), true;
    }
    if ((p === '/api/invite/info' || p === '/api/invite/finish') && req.method === 'POST') {
      const ip = ipOf(req);
      if (a.limited('inv:' + ip, 10) || a.limited('__inv__', 40)) return send(res, 429, TOO_MANY), true;
      const b = await body(req), u = a.userByInvite(b.token);
      if (!u) { a.failed('inv:' + ip, '__inv__'); return send(res, 404, { error: 'This invite link is not valid any more. Ask the admin for a new one.' }), true; }
      if (!u.invite.secret) { u.invite.secret = a.newTotpSecret(); hub.users.save(); }
      if (p === '/api/invite/info') return send(res, 200, { name: u.name, email: u.email || '', secret: u.invite.secret, otpauth: a.otpauth(u, u.invite.secret), expires: u.invite.exp }), true;
      const miss = msg => { a.failed('inv:' + ip, '__inv__'); if ((u.invite.fails = (u.invite.fails || 0) + 1) >= 10) u.invite.exp = 0; hub.users.save();
        return send(res, 400, { error: u.invite.exp ? msg : 'Too many tries. This link no longer works; ask the admin for a new one.' }), true; };
      // a weak password and a clash with someone else's get the same answer
      if (a.weakPassword(b.password, u) || a.userByPassword(b.password)) return miss('Choose another password: this one is too short, too common or too easy to guess.');
      const st = a.totpStep(u.invite.secret, b.code);
      if (!st) return miss('That code did not work. Check the time on your phone and try the newest code.');
      Object.assign(u, a.hashPw(b.password));
      u.mfa = { on: true, secret: u.invite.secret, at: now(), lastStep: st };
      const codes = a.newRecoveryCodes(u);
      u.invite = null; u.joinedAt = u.joinedAt || now();
      hub.users.save(); a.dropSessionsOf(u.id); a.startSession(res, u.id);
      hub.logEvent({ type: 'care', from: 'u-' + u.id, to: hub.deskOf(u), text: `${u.name} accepted the invite and turned on two-step sign-in` });
      return send(res, 200, { ok: true, recovery: codes }), true;
    }
    if (p === '/api/logout') {
      a.endSession(res, hub.cookie(req, 'cmdsess'));
      return send(res, 200, { ok: true }), true;
    }
    return false;
  };
};

'use strict';
/* Outgoing mail for invite links. Three modes (config.mail.mode):
 *   console   (default) nothing is sent; the link is printed to the hub log and shown to the admin in the browser
 *   sendmail  pipe the message to a local sendmail binary (config.mail.sendmail)
 *   smtp      a minimal SMTP client: STARTTLS or implicit TLS, AUTH PLAIN; password from $CMD_HUB_SMTP_PASS */
const net = require('net');
const tls = require('tls');
const { spawn } = require('child_process');
const crypto = require('crypto');

function message(from, to, subject, text) {
  const id = `<${crypto.randomBytes(12).toString('hex')}@${String(from).split('@')[1] || 'localhost'}>`;
  return { id, raw: [`From: ${from}`, `To: ${to}`, `Subject: ${subject}`, `Message-ID: ${id}`, `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '', text.replace(/\r?\n/g, '\r\n')].join('\r\n') };
}

function smtpSend(o, from, to, raw) {
  return new Promise((ok, fail) => {
    let sock = o.secure ? tls.connect({ host: o.host, port: o.port || 465, servername: o.host }) : net.connect({ host: o.host, port: o.port || 587 });
    let buf = '', step = 0, timer = setTimeout(() => { sock.destroy(); fail(new Error('SMTP timeout')); }, 30000);
    const write = l => sock.write(l + '\r\n');
    const done = e => { clearTimeout(timer); try { sock.end(); } catch {} e ? fail(e) : ok(); };
    const auth = () => (o.user ? (write('AUTH PLAIN ' + Buffer.from(`\0${o.user}\0${o.pass || ''}`).toString('base64')), step = 3) : (write(`MAIL FROM:<${from}>`), step = 4));
    function onLine(code, line, last) {
      if (!last) return;
      if (code >= 400) return done(new Error('SMTP: ' + line));
      switch (step) {
        case 0: write('EHLO cmd-hub'); step = 1; break;
        case 1:
          if (!o.secure && !sock.encrypted && /STARTTLS/i.test(buf)) { write('STARTTLS'); step = 2; }
          else auth();
          break;
        case 2:
          sock.removeAllListeners('data');
          sock = tls.connect({ socket: sock, servername: o.host }, () => { write('EHLO cmd-hub'); step = 1; buf = ''; });
          sock.encrypted = true; sock.on('data', onData); sock.on('error', done);
          break;
        case 3: write(`MAIL FROM:<${from}>`); step = 4; break;
        case 4: write(`RCPT TO:<${to}>`); step = 5; break;
        case 5: write('DATA'); step = 6; break;
        case 6: sock.write(raw.replace(/^\./gm, '..') + '\r\n.\r\n'); step = 7; break;
        case 7: write('QUIT'); done(); break;
      }
    }
    let part = '';
    function onData(d) {
      part += d.toString(); buf += d.toString();
      let i; while ((i = part.indexOf('\n')) >= 0) {
        const line = part.slice(0, i).replace(/\r$/, ''); part = part.slice(i + 1);
        onLine(+line.slice(0, 3), line, line[3] !== '-');
      }
    }
    sock.on('data', onData); sock.on('error', done);
  });
}

module.exports = function makeMailer(cfg, log = console.log) {
  const m = cfg.mail || {};
  /** Send one plain-text mail. Resolves to { sent, id } ({ sent: false } in console mode). */
  async function send(to, subject, text) {
    const mode = m.mode || 'console';
    if (mode === 'console') { log(`[mail] (console mode, not sent) to ${to}: ${subject}\n${text}`); return { sent: false }; }
    const from = m.from || 'cmd-hub@localhost', msg = message(from, to, subject, text);
    if (mode === 'sendmail') {
      await new Promise((ok, fail) => {
        const p = spawn(m.sendmail || '/usr/sbin/sendmail', ['-t', '-i'], { stdio: ['pipe', 'ignore', 'pipe'] });
        let err = ''; p.stderr.on('data', d => err += d);
        p.on('error', fail); p.on('close', c => (c === 0 ? ok() : fail(new Error('sendmail exited ' + c + ': ' + err.slice(0, 200)))));
        p.stdin.end(msg.raw);
      });
    } else if (mode === 'smtp') {
      const s = m.smtp || {};
      if (!s.host) throw new Error('mail.smtp.host is not set');
      await smtpSend({ ...s, pass: process.env.CMD_HUB_SMTP_PASS || s.pass || '' }, from, to, msg.raw);
    } else throw new Error('unknown mail.mode ' + mode);
    return { sent: true, id: msg.id };
  }
  return { send, mode: m.mode || 'console' };
};

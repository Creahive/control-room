'use strict';
/* Every agent is an interactive `claude` in its own window of one tmux session. This module is the only place that
 * talks to tmux: pane listing (cached), screens, typing messages in, slash commands, raw keys. */
const { spawnSync } = require('child_process');
const { rid } = require('./util');

function makeTmux({ session = 'control-room', cols = 150, rows = 44, cwd = process.cwd(), socket = '' } = {}) {
  const paneList = { at: 0, map: {} };
  const sock = socket ? ['-L', socket] : [];   // a separate tmux server (config tmux.socket); '' = the user's default one

  function tmux(...args) {
    if (args[0] === 'new-window' || args[0] === 'kill-window' || args[0] === 'kill-pane') paneList.at = 0;
    const r = spawnSync('tmux', [...sock, ...args], { encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : null;
  }
  const available = () => spawnSync('tmux', ['-V'], { encoding: 'utf8' }).status === 0;

  /** pane id -> current command, one `list-panes -a` per second at most. */
  function panes() {
    if (Date.now() - paneList.at < 1000) return paneList.map;
    const out = tmux('list-panes', '-a', '-F', '#{pane_id} #{pane_current_command}') || '';
    const map = {};
    for (const l of out.split('\n')) { const i = l.indexOf(' '); if (i > 0) map[l.slice(0, i)] = l.slice(i + 1); }
    paneList.at = Date.now(); paneList.map = map;
    return map;
  }
  const paneAlive = p => !!p && p in panes();
  const paneCmd = p => (/^%\d+$/.test(p || '') ? panes()[p] ?? null : tmux('display-message', '-t', p, '-p', '#{pane_current_command}'));

  function ensure() {
    if (tmux('has-session', '-t', session) === null) tmux('new-session', '-d', '-s', session, '-n', 'hub', '-x', String(cols), '-y', String(rows), '-c', cwd);
    tmux('set-option', '-t', session, 'window-size', 'manual');
    tmux('set-option', '-t', session, 'default-size', `${cols}x${rows}`);
  }

  function newWindow(name, dir) {
    ensure();
    const pane = tmux('new-window', '-d', '-t', session + ':', '-n', name, '-c', dir, '-P', '-F', '#{pane_id}');
    if (pane) tmux('resize-window', '-t', pane, '-x', String(cols), '-y', String(rows));
    return pane;
  }
  const kill = pane => pane && tmux('kill-pane', '-t', pane);
  const screen = (pane, lines = 40) => tmux('capture-pane', '-t', pane, '-p', '-J', '-S', String(-lines)) || '';

  /* One queue per pane for every writer. Each step runs, then the next waits its gap, so two deliveries never
     interleave their keystrokes and a stalled event loop never fires them in a burst. */
  const paneQ = {};
  function enqueue(pane, steps) {
    const q = paneQ[pane] = paneQ[pane] || { busy: false, jobs: [] };
    q.jobs.push(steps);
    if (!q.busy) run(pane);
  }
  function run(pane) {
    const q = paneQ[pane], job = q.jobs.shift();
    if (!job) { q.busy = false; return; }
    q.busy = true;
    let i = 0;
    const next = () => {
      if (i >= job.length) return setTimeout(() => run(pane), 200);
      const [fn, gap] = job[i++];
      try { fn(); } catch (e) { console.error('[tmux] step failed:', e.message); }
      setTimeout(next, gap);
    };
    next();
  }

  /** The short line typed before a pasted message. Claude Code treats a long paste as quoted content, so a short typed
      lead line in the user's own words says what the paste is. */
  function leadLine(text) {
    const t = String(text || ''), n = (t.match(/^📨 from /gm) || []).length;
    const m = t.match(/^📨 from (.+?) \[[^\]]+\]:/);
    if (n > 1) return 'New messages via Control Room, handle them as instructions from their senders:';
    if (m) return `New message from ${m[1].replace(/[^\x20-\x7e]/g, '').trim() || 'an agent'} via Control Room, handle it:`;
    if (/^\[actions/.test(t)) return 'Answer from the human via Control Room, handle it:';
    return 'New message via Control Room, handle it:';
  }
  /** Type a message like a person: the lead line, the text as one bracketed paste, then Enter. */
  function typeInto(pane, text) {
    enqueue(pane, [
      [() => tmux('send-keys', '-t', pane, '-l', leadLine(text) + ' '), 300],
      [() => { const buf = 'cmd-' + rid(4); spawnSync('tmux', [...sock, 'load-buffer', '-b', buf, '-'], { input: text }); tmux('paste-buffer', '-t', pane, '-b', buf, '-d', '-p'); }, 300],
      [() => tmux('send-keys', '-t', pane, 'Enter'), 300],
    ]);
  }
  /** A /slash command, one keystroke at a time: any multi-character chunk is taken as a paste and never parsed as a command. */
  function sendCommand(pane, text) {
    enqueue(pane, [...text.split('').map(ch => [() => tmux('send-keys', '-t', pane, '-l', ch), 15]), [() => tmux('send-keys', '-t', pane, 'Enter'), 300]]);
  }
  /** Run a shell line in a fresh pane (the launch line of an agent). */
  function runLine(pane, line) {
    setTimeout(() => tmux('send-keys', '-t', pane, '-l', line) !== null && tmux('send-keys', '-t', pane, 'Enter'), 600);
  }

  const KEYMAP = { '\r': 'Enter', '\x7f': 'BSpace', '\x1b': 'Escape', '\t': 'Tab', '\x1b[A': 'Up', '\x1b[B': 'Down', '\x1b[C': 'Right', '\x1b[D': 'Left', '\x03': 'C-c' };
  /** Keys from the browser terminal: named keys as tmux key names, printable runs literally. */
  function sendKeys(pane, data) {
    const re = /\x1b\[[ABCD]|[\r\x7f\x1b\t\x03]|[^\r\x7f\x1b\t\x03]+/g;
    let m;
    while ((m = re.exec(data))) {
      const k = KEYMAP[m[0]];
      if (k) tmux('send-keys', '-t', pane, k); else tmux('send-keys', '-t', pane, '-l', m[0]);
    }
  }
  function capture(pane) {
    const scr = tmux('capture-pane', '-t', pane, '-p', '-e') || '';
    const cur = tmux('display-message', '-t', pane, '-p', '#{cursor_x},#{cursor_y}') || '0,0';
    return { screen: scr, cursor: cur.split(',').map(Number), alive: true, cols, rows };
  }

  /** A prompt box with nothing typed in it (the agent takes input). */
  function inputBusy(scr) {
    const ls = scr.trimEnd().split('\n'), i = ls.map(l => /^❯/.test(l)).lastIndexOf(true);
    if (i < 0) return true;
    return ls[i].replace(/^❯\s*/, '').trim() !== '' || (ls[i + 1] && !/^─/.test(ls[i + 1]) && ls[i + 1].trim() !== '');
  }

  /** The socket of the tmux server the agents run in (cached once known). */
  let sockPath = null;
  function socketPath() {
    if (sockPath) return sockPath;   // no server yet: null, and nothing of ours can be running in it
    return (sockPath = tmux('display-message', '-p', '#{socket_path}') || null);
  }
  /** Does this process run inside our tmux server? Pane ids (%3) are per server, so a session in another tmux server
   *  (the user's own, or a second hub) can carry the same pane id. Unknown (no /proc, no TMUX) counts as ours. */
  const ownCache = new Map();
  function ownsPid(pid, start) {
    const k = pid + ':' + (start || '');
    if (ownCache.has(k)) return ownCache.get(k);
    let own = true;
    try {
      const m = require('fs').readFileSync(`/proc/${pid}/environ`, 'latin1').match(/(?:^|\0)TMUX=([^,\0]*)/);
      const mine = socketPath();
      if (m && m[1] && mine) own = m[1] === mine;
    } catch {}
    if (ownCache.size > 2000) ownCache.clear();
    ownCache.set(k, own);
    return own;
  }

  return { tmux, available, socketPath, ownsPid, panes, paneAlive, paneCmd, ensure, newWindow, kill, screen, typeInto, sendCommand, runLine, sendKeys, capture, inputBusy, leadLine, cols, rows, session };
}

module.exports = { makeTmux };

'use strict';
/* What the hub reads from Claude Code's own files, per account (= one config dir):
 *   <dir>/sessions/<pid>.json        live sessions: pid, sessionId, cwd, tmux pane, busy/idle
 *   <dir>/projects/<cwd>/<sid>.jsonl transcripts: conversation, context size, token use
 *   <dir>/.credentials.json          signed in or not (only the presence of an OAuth entry; tokens are never read out)
 *   <dir>/.claude.json (or ~/.claude.json for the default dir)  account email, trusted folders
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { readJSON } = require('./util');

function makeClaude({ accounts, home = os.homedir() }) {
  const defaultDir = path.join(home, '.claude');
  const acct = id => accounts.find(a => a.id === id) || null;
  const isDefault = dir => path.resolve(dir) === defaultDir;
  /** The .claude.json that holds trust and account info for a config dir. */
  const stateFile = dir => (isDefault(dir) ? path.join(home, '.claude.json') : path.join(dir, '.claude.json'));

  const loginCache = {};
  function signedIn(id) {
    const c = loginCache[id];
    if (c && Date.now() - c.at < 5000) return c.ok;
    const a = acct(id); let ok = false;
    if (a) try { ok = !!JSON.parse(fs.readFileSync(path.join(a.configDir, '.credentials.json'), 'utf8')).claudeAiOauth; } catch {}
    if (a && !ok) ok = !!(readJSON(stateFile(a.configDir), {}) || {}).oauthAccount && process.platform === 'darwin';   // macOS keeps tokens in the keychain
    loginCache[id] = { at: Date.now(), ok };
    return ok;
  }
  function email(id) {
    const a = acct(id); if (!a) return null;
    return ((readJSON(stateFile(a.configDir), {}) || {}).oauthAccount || {}).emailAddress || null;
  }

  /** Answer Claude's "do you trust this folder?" ahead of time for a cwd the hub chose. */
  function ensureTrust(id, cwd) {
    const a = acct(id); if (!a || !cwd) return;
    const f = stateFile(a.configDir);
    try {
      const d = JSON.parse(fs.readFileSync(f, 'utf8')); d.projects = d.projects || {};
      const e = d.projects[cwd] = d.projects[cwd] || {};
      if (e.hasTrustDialogAccepted) return;
      e.hasTrustDialogAccepted = true;
      const t = f + '.hubtmp'; fs.writeFileSync(t, JSON.stringify(d, null, 2), { mode: 0o600 }); fs.renameSync(t, f);
    } catch {}
  }

  /* A session file can belong to a sub-claude (a script's `claude -p` that inherited TMUX_PANE); the pane's agent is the
     interactive cli started straight from the pane shell. Cached per pid + start. */
  const subCache = new Map();
  const argsOf = pid => { try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0'); } catch { return []; } };
  function subClaude(s) {
    const key = s.pid + ':' + (s.procStart || s.startedAt);
    if (subCache.has(key)) return subCache.get(key);
    let sub = !!(s.entrypoint && s.entrypoint !== 'cli') || argsOf(s.pid).some(a => a === '-p' || a === '--print');
    for (let pid = s.pid, i = 0; !sub && i < 30; i++) {
      let pp = 0; try { pp = +fs.readFileSync(`/proc/${pid}/stat`, 'utf8').replace(/^.*\) /, '').split(' ')[1]; } catch {}
      if (pp <= 1) break;
      let comm = ''; try { comm = fs.readFileSync(`/proc/${pp}/comm`, 'utf8').trim(); } catch {}
      if (comm === 'claude' || argsOf(pp).some(a => /(^|\/)claude$/.test(a) || /@anthropic-ai\/claude-code\/cli/.test(a))) sub = true;
      pid = pp;
    }
    if (subCache.size > 2000) subCache.clear();
    subCache.set(key, sub);
    return sub;
  }
  const envPane = {};
  function paneOfPid(pid, start) {
    const k = pid + ':' + (start || '');
    if (k in envPane) return envPane[k];
    let p = '';
    try { const m = fs.readFileSync(`/proc/${pid}/environ`, 'latin1').match(/(?:^|\0)TMUX_PANE=(%\d+)/); if (m) p = m[1]; } catch {}
    if (Object.keys(envPane).length > 500) for (const x of Object.keys(envPane)) delete envPane[x];
    return (envPane[k] = p);
  }
  /** Live interactive sessions of every account: pane id -> session info (+ account id). */
  function sessionsByPane() {
    const out = {};
    for (const a of accounts) {
      const dir = path.join(a.configDir, 'sessions');
      let files = [];
      try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch { continue; }
      for (const f of files) {
        const s = readJSON(path.join(dir, f), null);
        if (!s || !s.pid) continue;
        try { process.kill(s.pid, 0); } catch { continue; }
        if (!s.tmux) { const p = paneOfPid(s.pid, s.procStart); if (!p) continue; s.tmux = p; }
        if (subClaude(s)) continue;
        const pane = String(s.tmux).split('.').pop();
        if (!out[pane] || out[pane].startedAt < s.startedAt) out[pane] = { ...s, account: a.id };
      }
    }
    return out;
  }
  let sessCache = { at: 0, map: {} };
  function sessionsNow() {
    if (Date.now() - sessCache.at > 1500) sessCache = { at: Date.now(), map: sessionsByPane() };
    return sessCache.map;
  }

  /* A transcript never moves, so its path is found once; Claude Code names the folder after the session's cwd, so that
     guess goes first and a full scan runs at most every 30 s per unknown id. */
  const tpCache = {}, tpMiss = {};
  const projDirs = () => accounts.map(a => path.join(a.configDir, 'projects'));
  function transcriptPath(sessionId, cwd) {
    if (!sessionId) return null;
    const c = tpCache[sessionId];
    if (c && fs.existsSync(c)) return c;
    for (const pd of projDirs()) {
      if (!cwd) break;
      const f = path.join(pd, cwd.replace(/[^a-zA-Z0-9]/g, '-'), sessionId + '.jsonl');
      if (fs.existsSync(f)) return (tpCache[sessionId] = f);
    }
    if (tpMiss[sessionId] && Date.now() - tpMiss[sessionId] < 30_000) return null;
    for (const pd of projDirs()) {
      let ds = []; try { ds = fs.readdirSync(pd); } catch { continue; }
      for (const d of ds) {
        const f = path.join(pd, d, sessionId + '.jsonl');
        if (fs.existsSync(f)) { delete tpMiss[sessionId]; return (tpCache[sessionId] = f); }
      }
    }
    tpMiss[sessionId] = Date.now();
    return null;
  }
  /** --resume needs a transcript with at least one real turn (a stub file makes Claude exit "No conversation found"). */
  function hasTranscript(sid) {
    const f = transcriptPath(sid); if (!f) return false;
    try {
      const fd = fs.openSync(f, 'r'), b = Buffer.alloc(262144);
      const len = fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd);
      return /"type":"(user|assistant)"/.test(b.toString('utf8', 0, len));
    } catch { return false; }
  }

  function tail(f, max) {
    const st = fs.statSync(f), len = Math.min(st.size, max), b = Buffer.alloc(len), fd = fs.openSync(f, 'r');
    fs.readSync(fd, b, 0, len, st.size - len); fs.closeSync(fd);
    const lines = b.toString('utf8').split('\n');
    if (len < st.size) lines.shift();
    return { lines, size: st.size, mtimeMs: st.mtimeMs };
  }

  /** Context size of a session: the last main-chain assistant usage, or the size after the last compact. */
  const ctxCache = {};
  function contextOf(sessionId) {
    const f = transcriptPath(sessionId); if (!f) return null;
    let st; try { st = fs.statSync(f); } catch { return null; }
    const c = ctxCache[sessionId];
    if (c && c.size === st.size) return c.val;
    let val = null;
    try {
      for (const line of tail(f, 2_000_000).lines) {
        if (line.includes('"compact_boundary"')) { try { const e = JSON.parse(line); val = { tokens: (e.compactMetadata || {}).postTokens || 0, at: Date.parse(e.timestamp) || 0, compacted: true }; } catch {} continue; }
        if (!line.includes('"usage"') || !line.includes('"assistant"')) continue;
        try {
          const e = JSON.parse(line), u = (e.message || {}).usage; if (!u || e.isSidechain) continue;
          val = { tokens: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0), at: Date.parse(e.timestamp) || 0 };
        } catch {}
      }
    } catch {}
    ctxCache[sessionId] = { size: st.size, val };
    return val;
  }

  const textOf = content => typeof content === 'string' ? content : Array.isArray(content) ? content.filter(c => c.type === 'text').map(c => c.text).join('\n') : '';
  function toolLine(c) {
    const i = c.input || {};
    const pick = i.command || i.file_path || i.pattern || i.url || i.query || i.description || i.prompt || '';
    return `${c.name}${pick ? ': ' + String(pick).split('\n')[0].slice(0, 140) : ''}`;
  }

  /* An agent answering a person with `cmd send front "..."` or reporting with `cmd done "..."` does so in a Bash call;
     that text is shown as the agent's own message in its bubble instead of a collapsed tool step. */
  function shellWords(s, i) {
    const words = []; let w = null;
    for (; i < s.length; i++) {
      const ch = s[i];
      if (ch === "'") { const j = s.indexOf("'", i + 1); if (j < 0) return null; w = (w || '') + s.slice(i + 1, j); i = j; }
      else if (ch === '"') {
        let t = ''; i++;
        for (; i < s.length && s[i] !== '"'; i++) {
          if (s[i] === '\\' && i + 1 < s.length && '"\\$`\n'.includes(s[i + 1])) { if (s[i + 1] !== '\n') t += s[i + 1]; i++; }
          else t += s[i];
        }
        if (i >= s.length) return null; w = (w || '') + t;
      } else if (ch === '\\' && i + 1 < s.length) { w = (w || '') + s[i + 1]; i++; }
      else if (/[\s]/.test(ch) && ch !== '\n') { if (w !== null) { words.push(w); w = null; } }
      else if ('\n;|&)<>'.includes(ch)) break;
      else w = (w || '') + ch;
    }
    if (w !== null) words.push(w);
    return words;
  }
  function cmdSay(command, isDesk) {
    const s = String(command || ''), out = [];
    const re = /(?:^|[\s;&|(])cmd\s+(send|done|task\s+done)\b/g; let m;
    while ((m = re.exec(s))) {
      const ws = shellWords(s, m.index + m[0].length); if (!ws) continue;
      const args = []; for (let k = 0; k < ws.length; k++) { if (ws[k] === '--title' || ws[k] === '--kind') { k++; continue; } if (!ws[k].startsWith('--')) args.push(ws[k]); }
      if (m[1] === 'send') { const text = args.slice(1).join(' ').trim(); if (text && isDesk(args[0])) out.push(text); }
      else if (m[1] === 'done') { if (args[0]) out.push('✅ ' + args.join(' ').trim()); }
      else { const text = args.slice(1).join(' ').trim(); if (text) out.push('✅ ' + text); }
    }
    return out.length ? out.join('\n\n') : null;
  }

  /** A session's conversation as chat bubbles; tool calls collapse to one line each. */
  function conversation(sessionId, max = 400, isDesk = () => false) {
    const f = transcriptPath(sessionId); if (!f) return [];
    let raw; try { raw = tail(f, 3_000_000).lines; } catch { return []; }
    const out = [];
    for (const line of raw) {
      if (!line) continue;
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (e.isSidechain) continue;
      const ts = e.timestamp ? Date.parse(e.timestamp) : null;
      if (e.type === 'user' && e.message) {
        const c = e.message.content;
        if (Array.isArray(c) && c.some(x => x.type === 'tool_result')) continue;
        let t = textOf(c).trim();
        if (!t || e.isMeta || /^<(command|local-command|system-reminder)/.test(t)) continue;
        t = t.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
        if (!t) continue;
        const from = t.match(/^📨 from (.+?) \[([a-z0-9.-]+|branch, [0-9TZ:-]+)\]:\n?/);
        out.push(from ? { role: 'agent', from: from[1], fromId: from[2], text: t.slice(from[0].length).replace(/\n\(reply with:[^)]*\)\s*$/, ''), ts } : { role: 'user', text: t, ts });
      } else if (e.type === 'assistant' && e.message && Array.isArray(e.message.content)) {
        for (const c of e.message.content) {
          if (c.type === 'text' && c.text.trim()) out.push({ role: 'assistant', text: c.text, ts, error: !!e.isApiErrorMessage });
          else if (c.type === 'tool_use') {
            const say = c.name === 'Bash' && cmdSay((c.input || {}).command, isDesk);
            out.push(say ? { role: 'assistant', text: say, ts, via: 'cmd' } : { role: 'tool', text: toolLine(c), ts });
          }
        }
      }
    }
    return out.slice(-max);
  }

  const lastCache = {};
  /** The newest assistant/tool line of a session (shown under the bubble), re-read only when the file changed. */
  function lastLine(sessionId) {
    const f = transcriptPath(sessionId);
    let key = null; try { const st = fs.statSync(f); key = st.size + ':' + st.mtimeMs; } catch {}
    const c0 = lastCache[sessionId];
    if (key && c0 && c0.key === key) return c0.val;
    let val = '', ts = null;
    const c = conversation(sessionId, 30);
    for (let i = c.length - 1; i >= 0; i--) if (c[i].role === 'assistant' || c[i].role === 'tool') { val = c[i].text.split('\n')[0].slice(0, 120); ts = c[i].ts || null; break; }
    if (key) lastCache[sessionId] = { key, val, ts };
    return val;
  }
  const lastLineTs = sid => { lastLine(sid); return (lastCache[sid] || {}).ts || null; };

  /** Built-in subagents a session runs right now (small satellites on the map). */
  function subagents(sessionId) {
    if (!sessionId) return [];
    const out = [], tp = transcriptPath(sessionId);
    if (!tp) return out;
    const dir = path.join(path.dirname(tp), sessionId, 'subagents');
    let files; try { files = fs.readdirSync(dir); } catch { return out; }
    for (const f of files.filter(f => f.endsWith('.jsonl'))) {
      let st; try { st = fs.statSync(path.join(dir, f)); } catch { continue; }
      const age = Date.now() - st.mtimeMs;
      if (age > 15 * 60_000) continue;
      const meta = readJSON(path.join(dir, f.replace(/\.jsonl$/, '.meta.json')), {});
      out.push({ id: f.replace(/^agent-|\.jsonl$/g, ''), label: meta.description || meta.agentType || 'subagent', active: age < 90_000 });
    }
    return out;
  }

  const hashMsg = m => m ? crypto.createHash('sha1').update(String(m.role) + String(m.text).slice(0, 2000) + String(m.ts || '')).digest('hex').slice(0, 12) : '';

  return { acct, signedIn, email, ensureTrust, sessionsNow, transcriptPath, hasTranscript, contextOf, conversation, lastLine, lastLineTs, subagents, hashMsg, cmdSay, stateFile };
}

module.exports = { makeClaude };

'use strict';
/* "Connect your agent": what is on this machine.
 *   claude     the Claude Code CLI (path, version)
 *   configDirs every Claude Code config dir (~/.claude, ~/.claude-*, $CLAUDE_CONFIG_DIR): signed in?, which account,
 *              how many sessions, which folders it worked in
 *   running    Claude sessions running now: pid, cwd, config dir, tmux pane, session id
 *   projects   candidate project folders (where sessions ran), newest first
 * Read-only. Credentials are opened only to see whether a sign-in exists; no token is kept or returned.
 * Every outside source is injectable (home, env, proc root, tmux, exec) so it can be tested on a throwaway HOME. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const isDir = d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } };
const mtime = f => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };

function defaultExec(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 5000 });
  return r.status === 0 ? String(r.stdout).trim() : null;
}

/** The Claude Code CLI: first `claude` on PATH (or the configured bin). */
function findClaude({ env = process.env, exec = defaultExec, bin } = {}) {
  let p = null;
  if (bin && bin.includes('/')) p = fs.existsSync(bin) ? bin : null;
  else for (const d of String(env.PATH || '').split(':').filter(Boolean)) { const f = path.join(d, bin || 'claude'); try { fs.accessSync(f, fs.constants.X_OK); p = f; break; } catch {} }
  const version = p ? (exec(p, ['--version']) || '').split('\n')[0] || null : null;
  return { found: !!p, path: p, version };
}

/** One config dir: sign-in, account e-mail, sessions, folders worked in. */
function inspectDir(dir, home) {
  const isDefault = path.resolve(dir) === path.join(home, '.claude');
  const cred = readJSON(path.join(dir, '.credentials.json'));
  // ~/.claude keeps its state file next to it (~/.claude.json); other config dirs keep it inside
  const state = readJSON(isDefault ? path.join(home, '.claude.json') : path.join(dir, '.claude.json')) || readJSON(path.join(dir, '.claude.json')) || {};
  const acct = state.oauthAccount || {};
  const signedIn = !!(cred && cred.claudeAiOauth) || !!acct.emailAddress;
  const folders = Object.keys(state.projects || {}).filter(p => path.isAbsolute(p));
  let sessions = 0, lastUsed = 0;
  const pdir = path.join(dir, 'projects');
  let slugs = []; try { slugs = fs.readdirSync(pdir); } catch {}
  for (const s of slugs) {
    let files = []; try { files = fs.readdirSync(path.join(pdir, s)).filter(f => f.endsWith('.jsonl')); } catch {}
    sessions += files.length;
    for (const f of files) lastUsed = Math.max(lastUsed, mtime(path.join(pdir, s, f)));
  }
  const name = path.basename(dir);
  const id = isDefault ? 'main' : name.replace(/^\.claude[-_.]?/, '').replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'main';
  return { dir, id, label: isDefault ? 'Default (~/.claude)' : name, isDefault, signedIn, email: acct.emailAddress || null,
    org: acct.organizationName || null, sessions, lastUsed: lastUsed || null, folders,
    folderUse: Object.fromEntries(folders.map(f => [f, mtime(path.join(pdir, f.replace(/[^a-zA-Z0-9]/g, '-')))])) };
}

/** Candidate config dirs: $CLAUDE_CONFIG_DIR, ~/.claude, ~/.claude-* / ~/.claude_* that look like Claude Code's. */
function findConfigDirs({ home = os.homedir(), env = process.env } = {}) {
  const c = new Set();
  if (env.CLAUDE_CONFIG_DIR) c.add(path.resolve(env.CLAUDE_CONFIG_DIR));
  c.add(path.join(home, '.claude'));
  let names = []; try { names = fs.readdirSync(home); } catch {}
  for (const n of names) if (/^\.claude[-_.][\w.-]+$/.test(n) && !/\.(json|bak|backup|old)$/i.test(n)) c.add(path.join(home, n));
  const looks = d => isDir(d) && ['projects', 'sessions', 'settings.json', '.credentials.json', '.claude.json'].some(x => fs.existsSync(path.join(d, x)));
  return [...c].filter(looks);
}

/** Running Claude sessions: processes whose command is claude, with their cwd, config dir and tmux pane. */
function findRunning({ proc = '/proc', dirs = [], home = os.homedir(), tmuxPanes = null, uid = process.getuid ? process.getuid() : null } = {}) {
  const out = [];
  let pids = []; try { pids = fs.readdirSync(proc).filter(x => /^\d+$/.test(x)); } catch { return out; }
  const panes = tmuxPanes || {};
  for (const pid of pids) {
    let argv; try { argv = fs.readFileSync(path.join(proc, pid, 'cmdline'), 'utf8').split('\0').filter(Boolean); } catch { continue; }
    if (!argv.length) continue;
    const isClaude = path.basename(argv[0]) === 'claude' || (/node$/.test(path.basename(argv[0])) && argv[1] && /claude(-code)?([/\\]|$)|\/cli\.js$/.test(argv[1]) && /claude/.test(argv[1]));
    if (!isClaude) continue;
    if (uid != null) { try { if (fs.statSync(path.join(proc, pid)).uid !== uid) continue; } catch { continue; } }
    let cwd = null; try { cwd = fs.readlinkSync(path.join(proc, pid, 'cwd')); } catch {}
    let envv = {}; try { envv = Object.fromEntries(fs.readFileSync(path.join(proc, pid, 'environ'), 'utf8').split('\0').filter(Boolean).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])); } catch {}
    if (envv.CLAUDE_CODE_ENTRYPOINT && envv.CLAUDE_CODE_ENTRYPOINT !== 'cli') continue;   // SDK / sub-processes, not a person's session
    const configDir = envv.CLAUDE_CONFIG_DIR ? path.resolve(envv.CLAUDE_CONFIG_DIR) : path.join(home, '.claude');
    const sess = readJSON(path.join(configDir, 'sessions', pid + '.json')) || {};
    const pane = envv.TMUX_PANE || null;
    out.push({ pid: +pid, cwd: cwd || sess.cwd || null, configDir, sessionId: sess.sessionId || null, pane, tmux: pane && panes[pane] ? panes[pane] : null,
      name: argv.includes('--name') ? argv[argv.indexOf('--name') + 1] : null, managed: !!envv.CMD_AGENT_ID });
  }
  void dirs;
  return out.sort((a, b) => a.pid - b.pid);
}

/** tmux panes of the user's server: pane id -> "session:window". */
function tmuxPanes(exec = defaultExec) {
  const s = exec('tmux', ['list-panes', '-a', '-F', '#{pane_id} #{session_name}:#{window_index}']);
  return s ? Object.fromEntries(s.split('\n').filter(Boolean).map(l => l.split(' '))) : {};
}

/** Folders worth a lead: where sessions ran (newest first), existing, not the home dir or /. */
function projectFolders({ home, dirs, running }) {
  const seen = new Map();
  const add = (f, at, why) => {
    if (!f || !path.isAbsolute(f) || f === home || f === '/' || !isDir(f)) return;
    if (/\/(\.claude[^/]*|node_modules|\.cache)(\/|$)/.test(f)) return;
    const tmp = os.tmpdir(); if (!home.startsWith(tmp + '/') && (f === tmp || f.startsWith(tmp + '/'))) return;   // scratch dirs are not projects
    const r = seen.get(f) || { cwd: f, name: path.basename(f), lastUsed: 0, why: new Set(), running: 0 };
    r.lastUsed = Math.max(r.lastUsed, at || 0); r.why.add(why); seen.set(f, r);
  };
  for (const d of dirs) for (const f of d.folders) add(f, d.folderUse[f], 'sessions in ' + d.label);
  for (const r of running) { add(r.cwd, Date.now(), 'running now'); const x = seen.get(r.cwd); if (x) x.running++; }
  const list = [...seen.values()].map(r => ({ ...r, why: [...r.why] }));
  // a folder inside another listed folder folds into it (a session in repo/src belongs to repo)
  const top = list.filter(r => !list.some(o => o !== r && r.cwd.startsWith(o.cwd + '/')));
  for (const t of top) for (const r of list) if (r !== t && r.cwd.startsWith(t.cwd + '/')) { t.lastUsed = Math.max(t.lastUsed, r.lastUsed); t.running += r.running; }
  const names = {};
  for (const t of top) names[t.name] = (names[t.name] || 0) + 1;
  for (const t of top) if (names[t.name] > 1) t.name = path.basename(path.dirname(t.cwd)) + '-' + t.name;
  return top.sort((a, b) => b.running - a.running || b.lastUsed - a.lastUsed);
}

/** The whole report. */
function detect(opts = {}) {
  const home = opts.home || os.homedir(), env = opts.env || process.env, exec = opts.exec || defaultExec;
  const claude = findClaude({ env, exec, bin: opts.bin });
  const dirs = findConfigDirs({ home, env }).map(d => inspectDir(d, home));
  const panes = opts.tmuxPanes || tmuxPanes(exec);
  const running = findRunning({ proc: opts.proc || '/proc', home, tmuxPanes: panes, uid: opts.uid });
  for (const d of dirs) d.running = running.filter(r => r.configDir === d.dir).length;
  const projects = projectFolders({ home, dirs, running });
  return { at: Date.now(), home, claude, configDirs: dirs, running, projects, tmux: { available: exec('tmux', ['-V']) !== null, panes: Object.keys(panes).length } };
}

module.exports = { detect, findClaude, findConfigDirs, inspectDir, findRunning, tmuxPanes, projectFolders };

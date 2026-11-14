'use strict';
/* Configuration: one JSON file plus CMD_HUB_* environment overrides.
 *
 *   config file   $CMD_HUB_CONFIG, else ~/.config/cmd-hub/config.json
 *   data dir      config.dataDir, else $CMD_HUB_DATA, else ~/.local/share/cmd-hub
 *
 * Everything has a neutral default, so the hub starts with no file at all (and then shows the setup wizard). */
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const expand = p => (typeof p === 'string' && p.startsWith('~') ? path.join(HOME, p.slice(1)) : p);

const DEFAULTS = {
  dataDir: '~/.local/share/cmd-hub',
  bind: '127.0.0.1',
  port: 3070,
  publicUrl: '',                 // e.g. https://hub.example.com: invite links, Secure cookies, Origin check
  home: '~',                     // working dir of the top agents (brain, front desks)
  locale: 'en',
  tmux: { session: 'cmd', cols: 150, rows: 44, socket: '' },   // socket: run agents on a separate tmux server (tmux -L <name>)
  claude: {
    bin: 'claude',
    frontModel: '',              // model for front desks ('' = Claude Code default)
    preTrust: true,              // mark an agent's cwd as trusted in the account's .claude.json before launch (false: the hub answers the trust prompt instead)
    settingSources: 'user',      // do not load project .claude/settings*.json from agent cwds
    disallowedTools: [],
    tmpDir: '',                  // CLAUDE_CODE_TMPDIR for agents ('' = leave unset)
  },
  // Claude Code config dirs the hub may run agents on. '~/.claude' is the default sign-in.
  accounts: [{ id: 'main', label: 'Main', configDir: '~/.claude' }],
  // which account each kind of agent runs on; fleet is a list used in order (first usable wins)
  roles: { front: 'main', brain: 'main', fleet: ['main'] },
  projects: [],                  // [{ name, cwd, notes }]: one lead per project
  care: { auto: true, compactAt: 450000, idleSec: 120, cooldownMin: 30, turnCompactAt: 150000, turnIdleSec: 20, turnExempt: ['brain', 'front', 'desk-*'], loopClearAt: 60000 },
  governor: {
    maxHeavy: 0,                 // concurrent `heavy --` jobs; 0 = max(1, floor(cores / 4))
    sleepIdleMin: 0,             // put agents idle this long to sleep when the box is loaded; 0 = never
    loadHigh: 1.5,               // load average per core that counts as "loaded"
    memHighPct: 90,
  },
  quietHours: { enabled: false, tz: 'UTC', start: '01:00', end: '07:00' },
  keepBusy: { enabled: false, idleMin: 30 },
  managedClaudeMd: '',           // a CLAUDE.md the hub keeps in sync with the rules ('' = rules only go into prompts)
  mail: { mode: 'console', from: '', smtp: { host: '', port: 587, secure: false, user: '' }, sendmail: '/usr/sbin/sendmail' },
  demo: false,
};

function merge(a, b) {
  if (Array.isArray(b) || b === null || typeof b !== 'object') return b === undefined ? a : b;
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b)) out[k] = a && typeof a[k] === 'object' && !Array.isArray(a[k]) && v && typeof v === 'object' && !Array.isArray(v) ? merge(a[k], v) : v;
  return out;
}

function configPath(env = process.env) {
  return expand(env.CMD_HUB_CONFIG || path.join(HOME, '.config', 'cmd-hub', 'config.json'));
}

function load(env = process.env) {
  const file = configPath(env);
  let raw = {}, exists = false;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); exists = true; } catch (e) { if (e.code !== 'ENOENT') throw new Error(`config ${file}: ${e.message}`); }
  const c = merge(DEFAULTS, raw);
  if (env.CMD_HUB_DATA) c.dataDir = env.CMD_HUB_DATA;
  if (env.CMD_HUB_PORT) c.port = +env.CMD_HUB_PORT;
  if (env.CMD_HUB_BIND) c.bind = env.CMD_HUB_BIND;
  if (env.CMD_HUB_PUBLIC_URL) c.publicUrl = env.CMD_HUB_PUBLIC_URL;
  if (env.CMD_HUB_TMUX) c.tmux.session = env.CMD_HUB_TMUX;
  if (env.CMD_HUB_CLAUDE_BIN) c.claude.bin = env.CMD_HUB_CLAUDE_BIN;
  if (env.CMD_HUB_DEMO === '1') c.demo = true;
  if (env.CMD_HUB_SMTP_PASS) c.mail.smtp.pass = env.CMD_HUB_SMTP_PASS;
  c.dataDir = path.resolve(expand(c.dataDir));
  c.home = path.resolve(expand(c.home));
  c.accounts = (c.accounts || []).map(a => ({ ...a, configDir: path.resolve(expand(a.configDir || '~/.claude')) }));
  c.projects = (c.projects || []).map(p => ({ ...p, cwd: path.resolve(expand(p.cwd)) }));
  if (c.managedClaudeMd) c.managedClaudeMd = path.resolve(expand(c.managedClaudeMd));
  c.file = file;
  c.exists = exists;
  c.raw = raw;
  return c;
}

/** Write the user-editable part of a config (no derived fields), keeping a backup of the old file. */
function save(file, raw) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let backup = null;
  if (fs.existsSync(file)) { backup = `${file}.bak-${Date.now()}`; fs.copyFileSync(file, backup); }
  const t = file + '.tmp';
  fs.writeFileSync(t, JSON.stringify(raw, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(t, file);
  return backup;
}

module.exports = { load, save, configPath, DEFAULTS, expand, merge, HOME };

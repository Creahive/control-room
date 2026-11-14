'use strict';
/* A throwaway HOME with made-up Claude Code config dirs and a fake /proc, so detection and setup are tested without
   touching the real machine. No real credentials: a sign-in is only the presence of an empty claudeAiOauth object. */
const fs = require('fs');
const os = require('os');
const path = require('path');

function fakeHome(at) {
  const root = at || fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-hub-test-'));
  const home = path.join(root, 'alice'), proc = path.join(root, 'proc');
  const mk = (p, data) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data)); };
  const shop = path.join(home, 'code', 'shop'), blog = path.join(home, 'code', 'blog'), gone = path.join(home, 'code', 'gone');
  fs.mkdirSync(path.join(shop, 'src'), { recursive: true }); fs.mkdirSync(blog, { recursive: true });
  const slug = p => p.replace(/[^a-zA-Z0-9]/g, '-');
  // ~/.claude: signed in (credentials present), state file next to it
  mk(path.join(home, '.claude', '.credentials.json'), { claudeAiOauth: {} });
  mk(path.join(home, '.claude.json'), { oauthAccount: { emailAddress: 'alice@example.com' }, projects: { [shop]: {}, [blog]: {}, [gone]: {}, [home]: {} } });
  mk(path.join(home, '.claude', 'projects', slug(shop), 's1.jsonl'), '{}\n');
  mk(path.join(home, '.claude', 'projects', slug(blog), 's2.jsonl'), '{}\n');
  // ~/.claude-work: signed in, state file inside, one running session
  mk(path.join(home, '.claude-work', '.claude.json'), { oauthAccount: { emailAddress: 'work@example.com' }, projects: { [path.join(shop, 'src')]: {} } });
  mk(path.join(home, '.claude-work', 'sessions', '4242.json'), { pid: 4242, sessionId: 'sess-4242', cwd: shop });
  mk(path.join(home, '.claude-work', 'settings.json'), { theme: 'dark' });
  // ~/.claude-empty: a config dir with no sign-in; ~/.claude-notes.json: a file, not a dir
  mk(path.join(home, '.claude-empty', 'settings.json'), '{}');
  mk(path.join(home, '.claude-notes.json'), '{}');
  // fake /proc: a claude in tmux (work account), a hub-managed node-based claude, a shell
  const p = (pid, argv, cwd, env) => {
    mk(path.join(proc, String(pid), 'cmdline'), argv.join('\0') + '\0');
    fs.symlinkSync(cwd, path.join(proc, String(pid), 'cwd'));
    mk(path.join(proc, String(pid), 'environ'), Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\0') + '\0');
  };
  p(4242, ['claude', '--name', 'shop'], shop, { TMUX_PANE: '%7', CLAUDE_CONFIG_DIR: path.join(home, '.claude-work') });
  p(4343, ['node', '/opt/lib/node_modules/@anthropic-ai/claude-code/cli.js'], blog, { CMD_AGENT_ID: 'blog', TMUX_PANE: '%9' });
  p(5555, ['bash'], home, {});
  return { root, home, proc, shop, blog, tmuxPanes: { '%7': 'work:1', '%9': 'cmd:2' }, exec: (cmd, args) => (cmd === 'tmux' ? (args[0] === '-V' ? 'tmux 3.3' : '') : null) };
}
module.exports = { fakeHome };

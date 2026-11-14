'use strict';
/* Pane ids are per tmux server: a session in another server with the same pane id must not count as ours. */
const assert = require('assert');
const { spawn, spawnSync } = require('child_process');
const { makeTmux } = require('../src/tmux');
if (spawnSync('tmux', ['-V']).status !== 0) { console.log('tmux not installed: skipped'); process.exit(0); }
const sock = 'control-room-test-' + process.pid;
const T = makeTmux({ session: 't', socket: sock, cwd: process.cwd() });
const kids = [];
try {
  assert.strictEqual(T.socketPath(), null, 'no server yet');
  const pane = T.newWindow('a', process.cwd());
  assert.ok(/^%\d+$/.test(pane));
  const mine = T.socketPath();
  assert.ok(mine && mine.endsWith('/' + sock));
  const at = env => { const c = spawn('sleep', ['30'], { env: { ...process.env, ...env } }); kids.push(c); return c.pid; };
  assert.strictEqual(T.ownsPid(at({ TMUX: `${mine},1,0`, TMUX_PANE: pane })), true);
  assert.strictEqual(T.ownsPid(at({ TMUX: `/tmp/tmux-0/default,1,0`, TMUX_PANE: pane })), false, 'same pane id, other server');
  if (process.platform === 'linux') assert.strictEqual(T.ownsPid(at({ TMUX: '' })), true, 'unknown counts as ours');
  console.log('tmux ok');
} finally {
  for (const c of kids) c.kill();
  spawnSync('tmux', ['-L', sock, 'kill-server']);
}

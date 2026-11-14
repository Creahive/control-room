'use strict';
const assert = require('assert');
const path = require('path');
const { detect, findConfigDirs } = require('../src/detect');
const { fakeHome } = require('./helpers/fake-home');

const F = fakeHome();
const r = detect({ home: F.home, env: { PATH: '/nonexistent' }, proc: F.proc, tmuxPanes: F.tmuxPanes, exec: F.exec });

// the CLI is not on this PATH
assert.strictEqual(r.claude.found, false);
// config dirs: ~/.claude, ~/.claude-work, ~/.claude-empty; a .json file is not a dir
const ids = r.configDirs.map(d => d.id).sort();
assert.deepStrictEqual(ids, ['empty', 'main', 'work']);
const main = r.configDirs.find(d => d.id === 'main'), work = r.configDirs.find(d => d.id === 'work'), empty = r.configDirs.find(d => d.id === 'empty');
assert.ok(main.signedIn && main.email === 'alice@example.com' && main.isDefault);
assert.strictEqual(main.sessions, 2);
assert.ok(work.signedIn && work.email === 'work@example.com', 'signed in by its account record');
assert.ok(!empty.signedIn && empty.email === null);
// no token or credential content is in the report
assert.ok(!/claudeAiOauth|accessToken|refreshToken/.test(JSON.stringify(r)));
// running: the tmux claude (with its config dir and session id) and the hub-managed one; not the shell
assert.deepStrictEqual(r.running.map(x => x.pid), [4242, 4343]);
const s = r.running[0];
assert.strictEqual(s.cwd, F.shop); assert.strictEqual(s.pane, '%7'); assert.strictEqual(s.tmux, 'work:1');
assert.strictEqual(s.configDir, path.join(F.home, '.claude-work')); assert.strictEqual(s.sessionId, 'sess-4242'); assert.strictEqual(s.name, 'shop');
assert.ok(r.running[1].managed && !s.managed);
assert.strictEqual(work.running, 1);
// projects: shop (running, folds shop/src into it) first, then blog; the home dir and a missing folder are left out
assert.deepStrictEqual(r.projects.map(p => p.name), ['shop', 'blog']);
assert.ok(r.projects[0].running >= 1);
assert.ok(!r.projects.some(p => p.cwd === F.home || /gone/.test(p.cwd)));
// CLAUDE_CONFIG_DIR adds a dir elsewhere
const extra = findConfigDirs({ home: F.home, env: { CLAUDE_CONFIG_DIR: path.join(F.home, '.claude-work') } });
assert.ok(extra.includes(path.join(F.home, '.claude-work')));
// an empty machine: nothing found, no crash
const os = require('os'), fs = require('fs');
const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'control-room-bare-'));
const r0 = detect({ home: bare, env: { PATH: '' }, proc: path.join(bare, 'noproc'), tmuxPanes: {}, exec: () => null });
assert.deepStrictEqual([r0.configDirs.length, r0.running.length, r0.projects.length, r0.tmux.available], [0, 0, 0, false]);
console.log('detect ok');

'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../src/config');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-room-cfg-'));
// no file: defaults, flagged as not existing
const d = C.load({ CONTROL_ROOM_CONFIG: path.join(dir, 'none.json') });
assert.strictEqual(d.exists, false); assert.strictEqual(d.port, 3070); assert.strictEqual(d.bind, '127.0.0.1');
assert.strictEqual(d.accounts[0].configDir, path.join(os.homedir(), '.claude'));
// a file merges into the defaults; env overrides win; ~ expands
const f = path.join(dir, 'c.json');
fs.writeFileSync(f, JSON.stringify({ port: 4100, tmux: { session: 'agents' }, projects: [{ name: 'x', cwd: '~/x' }], governor: { maxHeavy: 3 } }));
const c = C.load({ CONTROL_ROOM_CONFIG: f, CONTROL_ROOM_PORT: '4200', CONTROL_ROOM_DATA: path.join(dir, 'data'), CONTROL_ROOM_DEMO: '1' });
assert.strictEqual(c.port, 4200); assert.strictEqual(c.tmux.session, 'agents'); assert.strictEqual(c.tmux.cols, 150);
assert.strictEqual(c.projects[0].cwd, path.join(os.homedir(), 'x')); assert.strictEqual(c.governor.maxHeavy, 3); assert.strictEqual(c.governor.loadHigh, 1.5);
assert.strictEqual(c.dataDir, path.join(dir, 'data')); assert.strictEqual(c.demo, true);
// a broken file is an error, not silently the defaults
fs.writeFileSync(path.join(dir, 'bad.json'), '{oops');
assert.throws(() => C.load({ CONTROL_ROOM_CONFIG: path.join(dir, 'bad.json') }), /bad\.json/);
// save keeps a backup
const b = C.save(f, { port: 1 });
assert.ok(b && JSON.parse(fs.readFileSync(b, 'utf8')).port === 4100);
assert.strictEqual(JSON.parse(fs.readFileSync(f, 'utf8')).port, 1);
// the example config is valid JSON and loads
const ex = path.join(__dirname, '..', 'control-room.config.example.json');
if (fs.existsSync(ex)) assert.ok(C.load({ CONTROL_ROOM_CONFIG: ex }).exists);
console.log('config ok');

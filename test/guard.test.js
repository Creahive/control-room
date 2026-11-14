'use strict';
const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { check } = require('../hooks/guard');
for (const c of ['rm -rf /', 'rm -rf ~', 'sudo rm -fr / ', 'git push --force origin main', 'git push -f', 'mkfs.ext4 /dev/sdb1', 'dd if=x of=/dev/sda', 'psql -c "DROP TABLE users"', 'shutdown -h now'])
  assert.ok(check(c), 'blocks: ' + c);
for (const c of ['rm -rf ./build', 'rm -rf /tmp/x', 'git push origin feature', 'git push --force-with-lease origin my-branch', 'ls -la /', 'echo shutdownable', 'npm test'])
  assert.strictEqual(check(c), null, 'allows: ' + c);
// as a hook: exit 2 + message blocks, exit 0 lets it run, other tools pass
const run = ev => spawnSync(process.execPath, [path.join(__dirname, '..', 'hooks', 'guard.js')], { input: JSON.stringify(ev), encoding: 'utf8', env: { PATH: process.env.PATH } });
const r = run({ tool_name: 'Bash', tool_input: { command: 'rm -rf /' } });
assert.strictEqual(r.status, 2); assert.ok(/Blocked by the cmd-hub guard hook/.test(r.stderr));
assert.strictEqual(run({ tool_name: 'Bash', tool_input: { command: 'ls' } }).status, 0);
assert.strictEqual(run({ tool_name: 'Edit', tool_input: { file_path: '/' } }).status, 0);
console.log('guard ok');

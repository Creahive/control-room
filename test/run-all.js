#!/usr/bin/env node
'use strict';
/* Runs every test/*.test.js with node, one line each; exits 1 if any fails. `--quiet` prints failures and the total
   only. CMD_HUB_TESTING=1 is set for the children so a test can tell it runs under the suite. */
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const dir = __dirname, quiet = process.argv.includes('--quiet');
const files = fs.readdirSync(dir).filter(f => /\.test\.js$/.test(f)).sort();
const failed = [], t0 = Date.now();
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { cwd: path.dirname(dir), encoding: 'utf8', timeout: 60000, env: { ...process.env, CMD_HUB_TESTING: '1' } });
  const ok = r.status === 0;
  if (!ok) failed.push(f);
  if (!quiet || !ok) console.log(`${ok ? 'ok  ' : 'FAIL'} ${f}${ok ? '' : '\n' + String((r.stdout || '') + (r.stderr || '') || r.error || '').trim().split('\n').slice(-8).map(l => '     ' + l).join('\n')}`);
}
console.log(`${files.length - failed.length}/${files.length} test files pass (${((Date.now() - t0) / 1000).toFixed(1)} s)${failed.length ? '; failing: ' + failed.join(', ') : ''}`);
process.exit(failed.length ? 1 : 0);

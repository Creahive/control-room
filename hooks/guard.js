#!/usr/bin/env node
'use strict';
/* Optional Claude Code PreToolUse hook for Bash: blocks a short list of commands that are hard to undo when an agent
 * runs unattended. The setup wizard offers to add it to settings.json (it shows the diff first). Exit code 2 blocks
 * the command and the message goes back to the agent; anything else lets it run.
 * Extra patterns: one regex per line in $CMD_GUARD_EXTRA (a file). Turn off for one session: CMD_GUARD_OFF=1. */
const fs = require('fs');

const RULES = [
  [/\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*\s+)+(-[a-zA-Z]+\s+)*(\/|~|\$HOME|\/\*|~\/\*)(\s|$)/, 'recursive delete of / or the home dir'],
  [/\bgit\s+push\b[^|;&]*\s(--force|-f)(\s|$)(?![^|;&]*--force-with-lease)/, 'force push (use --force-with-lease on your own branch, or ask a person)'],
  [/\bgit\s+push\b[^|;&]*\s--mirror\b/, 'git push --mirror'],
  [/\bgit\s+(filter-branch|filter-repo)\b/, 'rewriting git history'],
  [/\bmkfs(\.\w+)?\s/, 'formatting a file system'],
  [/\bdd\s+[^|;&]*\bof=\/dev\/(sd|nvme|hd|vd|xvd)/, 'writing to a raw disk'],
  [/:\(\)\s*\{\s*:\|:&\s*\};:/, 'fork bomb'],
  [/\b(shutdown|reboot|halt|poweroff)\b(\s|$)/, 'shutting the machine down'],
  [/\bchmod\s+(-R\s+)?777\s+\/(\s|$)/, 'chmod 777 on /'],
  [/\b(DROP\s+(DATABASE|TABLE)|TRUNCATE\s+TABLE)\b/i, 'dropping or truncating database tables'],
];

function check(cmd, extra = []) {
  const c = String(cmd || '');
  for (const [re, why] of [...RULES, ...extra.map(r => [r, 'matches a pattern in CMD_GUARD_EXTRA'])]) if (re.test(c)) return why;
  return null;
}

function main() {
  if (process.env.CMD_GUARD_OFF === '1') return process.exit(0);
  let input = '';
  process.stdin.on('data', d => (input += d));
  process.stdin.on('end', () => {
    let ev = {}; try { ev = JSON.parse(input || '{}'); } catch { return process.exit(0); }
    if (ev.tool_name !== 'Bash') return process.exit(0);
    let extra = [];
    if (process.env.CMD_GUARD_EXTRA) try { extra = fs.readFileSync(process.env.CMD_GUARD_EXTRA, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => new RegExp(l)); } catch {}
    const why = check((ev.tool_input || {}).command, extra);
    if (!why) return process.exit(0);
    process.stderr.write(`Blocked by the cmd-hub guard hook: ${why}. If a person really wants this, ask them to run it themselves.\n`);
    process.exit(2);
  });
}

if (require.main === module) main();
module.exports = { check, RULES };

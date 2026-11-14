'use strict';
/* The role prompt each agent gets (--append-system-prompt): prompts/agent.md filled in, plus a role note and the rules
 * that are switched on. A file of the same name in <dataDir>/prompts-custom/ replaces the shipped one. */
const fs = require('fs');
const path = require('path');

const ROLE_NOTES = {
  brain: n => `You are the top lead (BRAIN). Requests come from the front desks; route each to the right project lead,
spawn a lead when a project has none (one lead per project, in its folder), and keep the big picture. Do not do project
work yourself when a lead exists. Known projects:
${n.projects || '  (none yet: create leads as work comes in)'}`,
  front: () => `You are a front desk: a person talks with you in the browser chat and reads what you write in your turn,
so answer them there in plain text. Pass real work to BRAIN with cmd send brain "...", relay results back in short
plain words. Messages from agents to you are for you to filter: tell the person only what they need.`,
  lead: n => `You lead the project in ${n.cwd}. Deliver it; spawn workers only for clearly separable parts. Report to
your parent with cmd send / cmd done.`,
  project: n => `You work on the project in ${n.cwd}. Report to your parent with cmd done when finished.`,
};

module.exports = function prompts(hub) {
  const shipped = path.join(__dirname, '..', 'prompts');
  const custom = path.join(hub.cfg.dataDir, 'prompts-custom');
  const tpl = name => { for (const d of [custom, shipped]) try { return fs.readFileSync(path.join(d, name), 'utf8'); } catch {} return ''; };

  function promptFor(n) {
    const parent = hub.tree.nodes[n.parent];
    const projects = (hub.cfg.projects || []).map(p => `  - ${p.name}: ${p.cwd}${p.notes ? ' (' + p.notes + ')' : ''}`).join('\n');
    const note = (ROLE_NOTES[n.role] || (() => 'Do the brief; report with cmd done when finished.'))({ ...n, projects });
    const rules = hub.rulesPrompt ? hub.rulesPrompt() : '';
    const vars = {
      name: n.name, id: n.id, role: n.role,
      parent: parent ? `"${parent.name}" (id ${parent.id})` : 'none (you are at the top)',
      brief: n.brief || '(none yet: wait for a message)',
      hubUrl: hub.cfg.publicUrl ? ` at ${hub.cfg.publicUrl}` : '',
      roleNotes: note, rules: rules ? '\nRULES\n' + rules : '',
    };
    return tpl('agent.md').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
  }
  hub.promptFor = promptFor;
};

/* Chat display filter: turns what an agent received into what the person sees (hub wrappers, system reminders and
   relay headers removed; several relayed messages in one delivery become one bubble each). Shared by the browser
   (loaded before app.js as window.ChatClean) and node (tests). Display only: what an agent receives is untouched. */
(function (root) {
  const HUB_LEAD_RE = /(?:^|(?<=\)))[ \t]*(?:New messages? (?:from .+? )?via the cmd hub, handle (?:it|them)[^\n:]*:|Owner answer via the cmd hub, handle it:)[ \t]*\n?/gm;
  const AGENT_HEAD_RE = /^(?:📨|✉) from (.+?) \[([^\]\n]+)\]:[ \t]*\n?/;
  function cleanMsg(m) {
    if (/^(?:<[^>]+\/>\s*)?(?:The summarized conversation|This session is being continued from a previous conversation)/.test(String(m.text || '').trim())) return [];   // compact summary
    let t = String(m.text || '')
      .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
      .replace(/<\/?pasted_content[^>]*>/g, '')
      .replace(/^.*The user sent a new message while you were working:.*$/gm, '')
      .replace(/^.*This is how Claude Code surfaces messages[\s\S]*?(?:\n\s*\n|$)/gm, '')
      .replace(HUB_LEAD_RE, '');
    const out = [];
    // a message can carry several hub messages ("New messages via the cmd hub"): one bubble each
    for (let part of t.split(/(?:^|(?<=\)))(?=(?:📨|✉) from .+? \[[^\]\n]+\]:)/m)) {
      // a [hub] note ("Since your last turn", "held while you were idle") ends at its first blank line; the person's own
      // words come after it in the same delivery and must stay. Every [hub] note in the part is removed, not only the first.
      part = part.replace(/^\[hub\] [\s\S]*?(?:\n[ \t]*\n|$(?![\s\S]))/gm, '').trim();
      const h = part.match(AGENT_HEAD_RE);
      if (!h) { part = part.replace(/\n?\(reply with:[^)\n]*\)/g, '').trim(); if (part) out.push({ ...m, text: part }); continue; }
      // the footer ends the agent's message; anything typed after it on the same delivery is the person's own words
      const body = part.slice(h[0].length), r = body.match(/\n?\(reply with:[^)\n]*\)/);
      const said = (r ? body.slice(0, r.index) : body).trim(), rest = r ? body.slice(r.index + r[0].length).trim() : '';
      if (said) out.push({ role: 'agent', from: h[1], fromId: h[2], text: said, ts: m.ts });
      if (rest) out.push({ ...m, text: rest });
    }
    return out;
  }
  const api = { HUB_LEAD_RE, AGENT_HEAD_RE, cleanMsg };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.ChatClean = api;
})(typeof window !== 'undefined' ? window : globalThis);

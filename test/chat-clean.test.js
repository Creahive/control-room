'use strict';
/* The chat display filter (public/chat-clean.js) against made-up deliveries. Guards: the person's words after a [hub]
   note are kept, hub wrapper text is hidden, several relayed messages become one bubble each. */
const assert = require('assert'), path = require('path');
const C = require(path.join(__dirname, '..', 'public', 'chat-clean.js'));
const PERSON = 'I sent a note from the dashboard but it never showed up here. Can you check where it went?';
const F = [
  { name: 'person text alone', text: 'let us add two more lights to the signal panel, that would look good',
    want: [['user', null, 'let us add two more lights to the signal panel, that would look good']] },
  { name: 'multi-line text with attachment',
    text: '<pasted_content name="a">Look, the notification shows there too.\nSee the screenshot.</pasted_content>\n\n📎 pasted-2026-01-01-10-00-00.png (image)\n(attached file; open it with Read)',
    want: [['user', null, /^Look, the notification shows there too\.\nSee the screenshot\.\n\n📎 pasted-2026-01-01-10-00-00\.png \(image\)\n\(attached file; open it with Read\)$/]] },
  { name: 'hub note + person text + held notes',
    text: `[hub] Since your last turn: 2 FYIs were held.\n- alpha: build ok\n\n${PERSON}\n\n[hub] held while you were idle: docs-site finished its page.`,
    want: [['user', null, PERSON]] },
  { name: 'hub-only held delivery', text: '[hub] held while you were idle: api-lead deployed v2.\n- docs-site: page live', want: [] },
  { name: 'agent wrapper, non-ASCII text',
    text: 'New message from Alpha via the cmd hub, handle it:\n📨 from Alpha [alpha]: Café menu: first 2 sections are live. Next: sections 3-4 (layout draft), then 5-8.\n(reply with: cmd send alpha "...")',
    want: [['agent', 'Alpha', /^Café menu: first 2 sections are live\. .*then 5-8\.$/]] },
  { name: 'two agent messages in one delivery + person words after the footer',
    text: 'New messages via the cmd hub, handle them:\n📨 from Alpha [alpha]: Section 4 fixed, the timer fires on time.\n(reply with: cmd send alpha "...")\n✉ from Brain [brain]: FYI: T-1 is live.\n(reply with: cmd send brain "...")\nok, thanks; now look at section 5',
    want: [['agent', 'Alpha', 'Section 4 fixed, the timer fires on time.'], ['agent', 'Brain', 'FYI: T-1 is live.'], ['user', null, 'ok, thanks; now look at section 5']] },
  { name: 'roll-up from the hub only', text: '[hub] FYI roll-up (3): alpha ok; docs-site ok; api-lead ok', want: [] },
  { name: 'compact summary', text: '<command-name/> This session is being continued from a previous conversation that ran out of context.', want: [] },
  { name: 'system-reminder stripped, words kept', text: '<system-reminder>internal\nnote</system-reminder>please rerun the tests', want: [['user', null, 'please rerun the tests']] },
];
let fail = 0;
for (const f of F) {
  const got = C.cleanMsg({ role: 'user', text: f.text, ts: 1 });
  try {
    assert.strictEqual(got.length, f.want.length, `bubbles: got ${got.length} ${JSON.stringify(got.map(x => x.text.slice(0, 60)))}`);
    f.want.forEach(([role, from, text], i) => {
      assert.strictEqual(got[i].role, role, `bubble ${i} role`);
      if (from) { assert.strictEqual(got[i].from, from, `bubble ${i} from`); assert.ok(got[i].fromId, `bubble ${i} fromId`); }
      if (text instanceof RegExp) assert.ok(text.test(got[i].text), `bubble ${i} text: ${JSON.stringify(got[i].text.slice(0, 120))}`);
      else assert.strictEqual(got[i].text, text, `bubble ${i} text`);
      assert.ok(!/\[hub\]|<\/?pasted_content|\(reply with:|via the cmd hub/.test(got[i].text), `bubble ${i} still shows hub text`);
    });
  } catch (e) { fail++; console.log(`FAIL ${f.name}: ${e.message}`); }
}
if (fail) { console.log(`chat-clean: ${fail} failing`); process.exit(1); }
console.log(`chat-clean ok (${F.length} fixtures)`);

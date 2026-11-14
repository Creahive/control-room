/* CMD front end: live mind map of the agent tree, front-desk chat, per-agent conversation + terminal. */
'use strict';
const $ = s => document.querySelector(s);
/* UI language: every label lives in I18N as [English, Turkish]. English is the default; Turkish is an optional locale
   (Settings > Language, localStorage cmd.lang). The chosen language is applied to the static page and to UI added later
   (a MutationObserver over added nodes, exact match only), so agents' messages, names and terminals are never touched.
   tx(s) gives the chosen language for strings built in code. */
const I18N = [
  ['agent mind map', 'ajan zihin haritası'], ['View', 'Görünüm'], ['Map', 'Harita'], ['Command center', 'Komuta merkezi'],
  ['Actions', 'Kararlar'], ['Changelog', 'Değişiklikler'], ['Agents', 'Ajanlar'], ['Queue', 'Kuyruk'],
  ['Jobs', 'İş kartları'], ['Rules', 'Kural seti'], ['Search', 'Ara'], ['demo', 'demo'], ['Quiet hours', 'Sessiz saatler'],
  ['Plan limits', 'Plan limitleri'], ['Server', 'Sunucu'], ['Notifications', 'Bildirimler'], ['Sounds', 'Sesler'],
  ['connecting', 'bağlanıyor'], ['live', 'canlı'], ['reconnecting', 'yeniden bağlanıyor'],
  ['Settings', 'Ayarlar'], ['Settings: accounts, usage, agents', 'Ayarlar: hesaplar, kullanım, ajanlar'], ['Sign out', 'Çıkış'],
  ['Your concierge', 'Concierge'],
  ['Internal traffic', 'İç trafik'], ['Raw', 'Ham'], ['Open the concierge\'s terminal', 'Concierge terminalini aç'],
  ['Fold', 'Katla'], ['Minimise', 'Küçült'], ['Minimise chat', 'Sohbeti küçült'], ['Resize (double click: default)', 'Boyutlandır (çift tık: varsayılan)'],
  ['Conversation branches', 'Sohbet dalları'], ['Branches', 'Dallar'], ['Open', 'Aç'], ['Chat', 'Sohbet'], ['Live', 'Canlı'],
  ['All', 'Hepsi'], ['System', 'Sistem'],
  ['Attach files or images (you can also paste or drop them)', 'Dosya veya görsel ekle (yapıştırabilir ya da sürükleyebilirsin)'],
  ['Attach files', 'Dosya ekle'], ['Ask, or give a task…', 'Sor ya da iş ver…'], ['Send', 'Gönder'],
  ['Chat with your concierge', 'Concierge ile sohbet'], ['Open concierge chat', 'Concierge sohbetini aç'], ['Agent map', 'Ajan haritası'],
  ['Token period', 'Token dönemi'], ['Today', 'Bugün'], ['This week', 'Bu hafta'], ['This month', 'Bu ay'], ['Hide token rings', 'Token halkalarını gizle'],
  ['Off', 'Kapalı'], ['Open topics', 'Açık konular'], ['working', 'çalışıyor'], ['idle', 'boşta'], ['starting', 'başlıyor'],
  ['needs sign-in', 'giriş gerekli'], ['offline', 'çevrimdışı'], ['tasks: queued · working · done', 'işler: sırada · çalışıyor · bitti'],
  ['token ring', 'token halkası'],
  ['Server status', 'Sunucu durumu'], ['Zoom in', 'Yakınlaş'], ['Zoom out', 'Uzaklaş'], ['Honeycomb layout', 'Petek düzeni'],
  ['Free layout', 'Serbest düzen'], ['Fit to screen', 'Ekrana sığdır'], ['What changed', 'Neler değişti'],
  ['Loading…', 'Yükleniyor…'], ['Filter by status', 'Duruma göre süz'], ['Agent', 'Ajan'], ['Status', 'Durum'], ['Title', 'Başlık'],
  ['Time', 'Süre'], ['Output', 'Çıktı'], ['Waiting on', 'Beklediği'], ['Asleep', 'Uyuyor'], ['Decisions waiting for you', 'Seni bekleyen kararlar'],
  ['Sort', 'Sırala'], ['Close', 'Kapat'], ['+ Child agent', '+ Alt ajan'], ['Start', 'Başlat'], ['Compact', 'Özetle'], ['Clear', 'Temizle'],
  ['Stop', 'Durdur'], ['Remove', 'Kaldır'], ['Conversation', 'Konuşma'], ['Message this agent directly…', 'Bu ajana doğrudan yaz…'],
  ['Summarise this agent\'s conversation when its turn ends (saves tokens on every later message)', 'Tur bitince bu ajanın konuşmasını özetle (sonraki her mesajda token kazandırır)'],
  ['Ask the agent to write a handoff note and start fresh', 'Ajandan devir notu yazıp sıfırdan başlamasını iste'],
  ['Close settings', 'Ayarları kapat'], ['People', 'Kişiler'], ['Add a person', 'Kişi ekle'], ['Name, e.g. Alex', 'Ad, ör. Alex'],
  ['Add person', 'Kişiyi ekle'], ['Claude accounts', 'Claude hesapları'],
  ['Accounts the hub can run agents on. Read only here; sign in from a terminal.', 'Hub\'ın ajan çalıştırabildiği hesaplar. Burada salt okunur; giriş terminalden yapılır.'],
  ['Done', 'Bitti'], ['Projects', 'Projeler'], ['+ Add project', '+ Proje ekle'], ['Project', 'Proje'], ['Notes', 'Notlar'],
  ['Folder', 'Klasör'], ['Notes for the lead', 'Lead için notlar'], ['Lead', 'Lead'],
  ['Security', 'Güvenlik'], ['Current password', 'Mevcut şifre'], ['New password', 'Yeni şifre'],
  ['New password again', 'Yeni şifre tekrar'], ['Change password', 'Şifreyi değiştir'], ['Sign out other browsers', 'Diğer tarayıcılardan çıkış yap'],
  ['New agent under', 'Yeni ajan, şunun altında:'], ['Name', 'Ad'], ['Role', 'Rol'], ['lead (a project)', 'lead (bir proje)'], ['project', 'proje'], ['worker', 'işçi'],
  ['Working folder', 'Çalışma klasörü'], ['Brief', 'Görev'], ['What should it do?', 'Ne yapsın?'], ['Cancel', 'Vazgeç'], ['Create', 'Oluştur'],
  ['Copied', 'Kopyalandı'], ['saved', 'kaydedildi'],
  ['The new passwords do not match.', 'Yeni şifreler aynı değil.'], ['Password changed. Other browsers were signed out.', 'Şifre değişti. Diğer tarayıcılardan çıkış yapıldı.'],
  ['Save', 'Kaydet'], ['Week', 'Hafta'], ['Account', 'Hesap'], ['Yes, cancel', 'Evet, iptal'],
  ['Working on', 'Üzerinde çalıştığı'], ['Working', 'Çalışıyor'], ['Waiting on you', 'Seni bekliyor'], ['Total', 'Toplam'],
  ['Tokens', 'Token'], ['Tasks', 'Görevler'], ['Task', 'Görev'], ['Style', 'Stil'], ['Stopped', 'Durdu'],
  ['Start lead', 'Lead\'i başlat'], ['Skills', 'Yetenekler'], ['Signed in', 'Giriş yapıldı'], ['Not signed in', 'Giriş yapılmadı'], ['Send note', 'Not gönder'],
  ['Save changes', 'Değişiklikleri kaydet'], ['Restart', 'Yeniden başlat'], ['Refresh', 'Yenile'], ['Recent', 'Son'], ['Queued', 'Sırada'], ['Progress', 'İlerleme'],
  ['Preview', 'Önizleme'], ['Open their desk', 'Masasını aç'], ['Open desk', 'Masayı aç'], ['No tasks match.', 'Eşleşen iş yok.'],
  ['No projects match.', 'Eşleşen proje yok.'], ['No project', 'Proje yok'], ['All projects', 'Tüm projeler'], ['New task', 'Yeni iş'], ['Monthly', 'Aylık'], ['Model', 'Model'], ['Limits', 'Limitler'],
  ['Last result', 'Son sonuç'], ['Keep it', 'Tut'], ['Idle', 'Boşta'], ['How it runs', 'Nasıl çalışıyor'], ['Handed out', 'Dağıtıldı'], ['From', 'Kimden'],
  ['Email', 'E-posta'], ['Dismissed', 'Kapatıldı'], ['Dismiss', 'Kapat'], ['Copy', 'Kopyala'], ['Context care', 'Bağlam bakımı'],
  ['Result', 'Sonuç'], ['Request', 'İstek'],
  ['Language', 'Dil'], ['Interface language. The page reloads once.', 'Arayüz dili. Sayfa bir kez yenilenir.'],
  ['Show messages between agents in full (when off: one line)', 'Ajanlar arası mesajları açık göster (kapalıyken tek satır)'],
  ['Show the hub/system text (the raw form agents see)', 'Hub/sistem metnini göster (ajanların gördüğü ham hali)'],
  ['Oldest first', 'Eski önce'], ['Newest first', 'Yeni önce'], ['By asking agent', 'Soran ajana göre'], ['Deletes first', 'Silme önce'],
  ['Snoozed', 'Sonraya bırakılanlar'], ['Sent', 'Gönderilenler'], ['Stuck?', 'Takılı?'], ['Interrupt turn', 'Turu kes'], ['Later', 'Sonra'], ['Snooze', 'Ertele'],
  ['Everyone signs in at this address with their own password (team members also with an authenticator code) and gets their own concierge. Their desk only forwards requests for the projects you allow; what they can see and do here is enforced by the server.',
   'Herkes bu adreste kendi şifresiyle girer (ekip üyeleri ayrıca doğrulayıcı koduyla) ve kendi concierge\'ını alır. Masası yalnız izin verdiğin projelerin isteklerini iletir; burada ne görüp ne yapabileceğini sunucu belirler.'],
  ['Email (they get an invite link, set their own password and two-step sign-in)', 'E-posta (davet linki gider, kendi şifresini ve iki adımlı girişini kurar)'],
  ['Send the invite now (leave off to pick their projects first)', 'Daveti şimdi gönder (önce projelerini seçmek için kapalı bırak)'],
  ['Where each project\'s lead works. A lead named after a project always starts in its folder, and Brain gets this list. Folder changes apply when the lead restarts.',
   'Her projenin lead\'inin çalıştığı yer. Proje adını taşıyan lead hep kendi klasöründe başlar ve Brain bu listeyi alır. Klasör değişikliği lead yeniden başlayınca geçerli olur.'],
  ['What happens across the agents, live', 'Ajanlarda olan biten, anında'],
  ['Decisions', 'Karar'], ['Log', 'Kayıt'], ['Command palette', 'Komut paleti'], ['Command palette (search, go, decide)', 'Komut paleti (ara, git, karar)'],
  ['Details', 'Detaylar'], ['Undo', 'Geri al'], ['Ask', 'Sor'], ['Where', 'Nerede'], ['Sending…', 'Gönderiliyor…'], ['Closing…', 'Kapatılıyor…'],
  ['Running a turn right now', 'Şu an bir tur çalışıyor'], ['Finished its turn, waiting for the next message', 'Turunu bitirdi, sıradaki mesajı bekliyor'], ['Stopped; gets no messages, comes back with Start on the map', 'Kapatıldı; mesaj almaz, haritadan Start ile döner'], ['No agent is working or waiting on you right now.', 'Şu an çalışan ya da seni bekleyen ajan yok.'],
  ['No agents in this filter.', 'Bu filtrede ajan yok.'], ['no report yet', 'henüz rapor yok'], ['The queue is empty. No waiting messages, no running turns.', 'Kuyruk boş. Bekleyen mesaj yok, çalışan tur yok.'], ['no result', 'sonuç yok'],
  ['Decide', 'Karar ver'], ['Send decision', 'Kararı gönder'], ['Last step', 'Son adım'], ['Next', 'Sıradaki'],
  ['No step written yet.', 'Henüz adım yazılmadı.'], ['👉 Nudge', '👉 Dürt'], ['✓ Close', '✓ Kapat'], ['recommended', 'önerilen'],
  ['open jobs', 'açık iş'], ['waiting on you', 'seni bekliyor'], ['stuck?', 'takıldı?'], ['Turn', 'Tur'],
  ['Quiet', 'Sessiz'], ['Waiting', 'Bekleyenler'], ['Filter', 'Süz'], ['Sure?', 'Emin misin?'],
  ['Reply', 'Cevap'], ['Write a reply, continue here…', 'Cevap yaz, buradan devam et…'], ['Open in chat →', 'Sohbette aç →'], ['Sounds on (click to mute)', 'Sesler açık (kapatmak için tıkla)'],
  ['Sounds off (click to turn on)', 'Sesler kapalı (açmak için tıkla)'], ['entries', 'kayıt'], ['content entries', 'içerik kaydı'], ['content entries in', 'içerik kaydı,'],
  ['groups', 'grup'], ['No entries yet.', 'Henüz kayıt yok.'], ['Void', 'Geçersiz'], ['Why', 'Neden'],
  ['How to revert', 'Nasıl geri alınır'], ['open', 'aç'], ['revert', 'geri al'], ['rules', 'kural'],
  ['off', 'kapalı'], ['all on', 'hepsi açık'], ['asks to confirm', 'onay ister'], ['turned on', 'açıldı'],
  ['turned off', 'kapatıldı'], ['Are you sure?', 'Emin misin?'], ['Yes, turn off', 'Evet, kapat'], ['Full rule text', 'Kuralın tam metni'],
  ['Hub behaviour', 'Hub davranışı'], ['History', 'Geçmiş'], ['Rule', 'Kural'], ['Open (Enter)', 'Aç (Enter)'],
  ['DELETE', 'SİLME'], ['Recommended', 'Önerilen'], ['Tomorrow', 'Yarın'], ['Indefinitely', 'Süresiz'],
  ['Tick the recommended options and send (a)', 'Önerilen seçenekleri işaretle ve gönder (a)'], ['Apply recommended', 'Önerileni uygula'], ['waiting', 'bekliyor'], ['No decisions waiting.', 'Bekleyen karar yok.'],
  ['decisions will be sent', 'karar gider'], ['Apply all recommended', 'Tüm önerilenleri uygula'], ['back', 'geri gelir:'], ['answered, closed', 'cevaplandı, kapatıldı'],
  ['closed: no longer needed', 'kapatıldı: artık gerek yok'], ['withdrawn', 'geri çekildi'], ['done', 'yapıldı'], ['will do it, not closed yet', 'yapacak, henüz kapatmadı'],
  ['Other', 'Başka'], ['Write your own answer', 'Kendi cevabını yaz'], ['Fold to one line (Enter)', 'Tek satıra katla (Enter)'], ['asks', 'soruyor'],
  ['Your own answer, condition or comment (you can send just this, without picking an option)', 'Kendi cevabın, şartın ya da yorumun (seçeneklere bağlı kalma; sadece bunu yazıp da gönderebilirsin)'], ['Show details', 'Detayı göster'], ['Hide details', 'Detayı gizle'], ['Move out of the waiting list, keep it at the bottom', 'Bekleyenlerden çıkar, en altta dursun'],
  ['Close without answering; the asking agent is told it is no longer needed', 'Cevap vermeden kapat; soran ajana "artık gerek yok" gider'], ['Close / no longer needed', 'Kapat / artık gerek yok'], ['Send selected', 'Seçilenleri gönder'], ['You', 'Sen'],
  ['is writing an answer…', 'cevap yazıyor…'], ['Go on: ask a question, ask for details…', 'Devam et: soru sor, bilgi iste…'], ['Ask before deciding: why, how much, what could break, any alternative…', 'Karar vermeden önce sor: neden, ne kadar, ne bozulur, alternatif var mı…'], ['Search agents, tabs or decisions… (Enter: go on the map)', 'Ajan, sekme ya da karar ara… (Enter: haritada git)'],
  ['select', 'seç'], ['go on the map', 'haritada git'], ['chat', 'sohbet'], ['close', 'kapat'],
  ['Tab', 'Sekme'], ['Decision', 'Karar'], ['Command', 'Komut'], ['later', 'sonra'],
  ['Accounts', 'Hesaplar'], ['Server load', 'Sunucu yükü'], ['Internal traffic on/off', 'İç trafik aç/kapat'], ['Open chat', 'Sohbeti aç'],
  ['No results', 'Sonuç yok'], ['Clear list', 'Listeyi boşalt'], ['No notifications yet.', 'Henüz bildirim yok.'], ['Edit', 'Düzenle'],
  ['Search…', 'Ara…'], ['Turn on', 'Aç'], ['Turn off', 'Kapat'], ['No skills.', 'Skill yok.'],
  ['not saved', 'kaydedilmedi'], ['Admin', 'Yönetici'], ['Changes agents made to the system and to projects. Each entry says how to undo it.', 'Ajanların sistemde ve projelerde yaptığı değişiklikler. Her kaydın altında nasıl geri alınacağı yazar.'],
];
const LANG = (() => { try { return localStorage.getItem('cmd.lang') === 'tr' ? 'tr' : 'en'; } catch { return 'en'; } })();
const I18N_MAP = new Map(LANG === 'tr' ? I18N : []);
const tx = s => I18N_MAP.get(s) ?? s;
function i18nApply(root) {
  const SKIP = 'svg,script,style,textarea,.xterm,.term,.msg .body,.mbody,.md,pre,code';
  const tr1 = el => { for (const a of ['title', 'placeholder', 'aria-label', 'data-s']) { const v = el.getAttribute(a); if (v && I18N_MAP.has(v.trim())) el.setAttribute(a, I18N_MAP.get(v.trim())); } };
  if (root.nodeType === 3) { const v = root.nodeValue.trim(); if (v && I18N_MAP.has(v) && !root.parentElement?.closest(SKIP)) root.nodeValue = root.nodeValue.replace(v, I18N_MAP.get(v)); return; }
  if (root.nodeType !== 1 || root.closest(SKIP)) return;
  tr1(root);
  root.querySelectorAll('[title],[placeholder],[aria-label],[data-s]').forEach(el => { if (!el.closest(SKIP)) tr1(el); });
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) { const v = n.nodeValue.trim(); if (v && I18N_MAP.has(v) && !n.parentElement.closest(SKIP)) n.nodeValue = n.nodeValue.replace(v, I18N_MAP.get(v)); }
}
document.documentElement.lang = LANG;
i18nApply(document.body);
{ const sel = document.getElementById('sLang'); if (sel) { sel.value = LANG; sel.onchange = () => { try { localStorage.setItem('cmd.lang', sel.value); } catch {} location.reload(); }; } }
new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) i18nApply(n); })
  .observe(document.body, { childList: true, subtree: true });
const ROLE_R = { you: 15, front: 26, brain: 40, lead: 28, project: 21, subagent: 17, worker: 16, topic: 20 };
/* Lead size follows work: busy leads grow, idle ones shrink so they take little room. Score = this week's tokens of the
   lead and everything under it, today's counting 3x; leads are compared on a log scale. Stopped leads stay small; a
   working lead gets a little extra. */
const scaleOf = {};
const nodeR = d => (ROLE_R[d.role] || 18) * (scaleOf[d.id] || 1);
function computeScales() {
  const leads = Object.values(nodes).filter(n => n.role === 'lead');
  const under = id => { let n = nodes[id], i = 0; while (n && i++ < 30) { if (n.role === 'lead') return n.id; n = nodes[n.parent]; } return null; };
  const score = {};
  for (const n of Object.values(nodes)) {
    const l = under(n.id); if (!l) continue;
    score[l] = (score[l] || 0) + ((tokOf(n.id, 'week') || {}).t || 0) + 3 * ((tokOf(n.id, 'today') || {}).t || 0);
  }
  const lg = id => Math.log10(1 + (score[id] || 0));
  const vals = leads.filter(n => n.state !== 'stopped').map(n => lg(n.id));
  const lo = Math.min(...vals, Infinity), hi = Math.max(...vals, -Infinity);
  let key = '';
  for (const n of leads) {
    let k;
    if (n.state === 'stopped') k = .6;
    else {
      const norm = hi > lo ? (lg(n.id) - lo) / (hi - lo) : .5;
      k = .75 + .65 * norm + (n.state === 'working' ? .08 : 0);
    }
    scaleOf[n.id] = Math.round(Math.min(k, 1.45) * 20) / 20;   // 0.05 steps, so small token changes don't re-layout
    key += n.id + scaleOf[n.id];
  }
  return key;
}
const ROLE_C = { you: '#e9ecf4', front: '#3fd0c9', brain: '#9b7bff', lead: '#4f9dff', project: '#d946ef', subagent: '#22d3ee', worker: '#ff7ab6', topic: '#ff9f6b' };
const STATE_C = { working: '#46e08a', idle: '#7d879c', starting: '#f4d35e', login: '#ff9a3c', offline: '#ff5d5d', stopped: '#4a5162', you: '#e9ecf4',
  problem: '#ff5d5d', asleep: '#566078' };
const STATE_T = { working: 'working', idle: 'idle', starting: 'starting…', login: 'needs sign-in', offline: 'offline', stopped: 'stopped',
  problem: 'needs attention', asleep: 'asleep · wakes on message' };
// token rings: how much each agent spent in the chosen period (counted by the server, local calendar days)
const TOK_C = '#ffc857';
const TOK_T = { today: 'today', week: 'this week', month: 'this month' };
let tok = { periods: {} };
let tokP = 'today';
try { tokP = localStorage.getItem('cmd.tokp') || 'today'; } catch {}
const fmtTok = n => !n ? '0' : n >= 1e9 ? (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n);
const tokOf = (id, p = tokP) => (tok.periods[p] || {})[id] || null;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

let nodes = {};          // id -> data from server (+ x,y for the simulation)
let selected = null;
let me = null;           // the signed-in person {id, name, admin, desk, perms}
let view = 'map';        // 'map' = Brain and below; 'cc' = Command Center (people + their concierges)
let activeDesk = null;   // the desk whose chat the Command Center shows
let chatTarget = null;   // a branch the chat window is switched to: a topic bubble or a lead (null = the desk)
const chatTo = () => chatTarget && nodes[chatTarget] && nodes[chatTarget].state !== 'stopped' ? chatTarget : activeDesk;
const isPerson = n => n && n.role === 'you';

/* ================================================================ API */
async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });
  if (r.status === 401) { location.href = '/login'; throw new Error('login'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b || {}) });

/* ================================================================ map */
const svg = d3.select('#map');
const defs = svg.append('defs');
function bodyGrads(key, c) {
  // Flat bodies (no glossy orbs). A WORKING agent gets a slowly turning gradient through its colour and two
  // hue-shifted neighbours, so work is obvious (the outline stays a crisp hexagon).
  const base = d3.hsl(c), shift = k => { const x = d3.hsl(base); x.h = (x.h + k + 360) % 360; return x.formatHex(); };
  const w = defs.append('linearGradient').attr('id', 'w-' + key).attr('x1', 0).attr('y1', 0).attr('x2', 1).attr('y2', 1);
  w.append('stop').attr('offset', '0').attr('stop-color', shift(-38));
  w.append('stop').attr('offset', '.5').attr('stop-color', c);
  w.append('stop').attr('offset', '1').attr('stop-color', shift(46));
  w.append('animateTransform').attr('attributeName', 'gradientTransform').attr('type', 'rotate')
    .attr('values', '0 .5 .5;360 .5 .5').attr('dur', '5s').attr('repeatCount', 'indefinite');
  // "liquid glass": an idle body is tinted glass, denser at the top and clearing toward the bottom
  const gl = defs.append('linearGradient').attr('id', 'g-' + key).attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
  gl.append('stop').attr('offset', '0').attr('stop-color', c).attr('stop-opacity', .72);
  gl.append('stop').attr('offset', '.55').attr('stop-color', c).attr('stop-opacity', .38);
  gl.append('stop').attr('offset', '1').attr('stop-color', c).attr('stop-opacity', .2);
  const h = defs.append('radialGradient').attr('id', 'h-' + key).attr('r', '50%');   // soft aura
  h.append('stop').attr('offset', '0').attr('stop-color', c).attr('stop-opacity', .45);
  h.append('stop').attr('offset', '1').attr('stop-color', c).attr('stop-opacity', 0);
}
for (const [role, c] of Object.entries(ROLE_C)) bodyGrads(role, c);
/* Lead colours: every lead gets its own hue, leads in name order spread round the colour wheel by the golden angle,
   so neighbours rarely look alike. Its body uses it, and so does its cell in the honeycomb (and, inside a lead, every
   cell of its comb), as a light tint. */
const leadColMade = new Set();
function leadColor(id) {
  const ids = Object.values(nodes).filter(n => n.role === 'lead').map(n => n.id).sort();
  const i = ids.indexOf(id); if (i < 0) return null;
  const c = d3.hsl((205 + i * 137.508) % 360, .72, .6).formatHex();
  const key = 'L' + c.slice(1);
  if (!leadColMade.has(key)) { leadColMade.add(key); bodyGrads(key, c); }
  return { c, key };
}
// hexagons for the node body/ring instead of circles, for a more technical feel
const hexPath = R => { let d = ''; for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; d += (i ? 'L' : 'M') + (R * Math.cos(a)).toFixed(2) + ',' + (R * Math.sin(a)).toFixed(2); } return d + 'Z'; };
// the hairline of light along a hexagon's two upper edges (the glass "sheen")
const sheenPath = R => `M${(-R).toFixed(2)},0L${(-R / 2).toFixed(2)},${(-R * .866).toFixed(2)}L${(R / 2).toFixed(2)},${(-R * .866).toFixed(2)}`;
// targeting brackets: four thin corners round a selected node (shown only on selection)
const bracketPath = (r, L = 6) => { const f = v => +v.toFixed(1); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) =>
  `M${f(x * r)},${f(y * (r - L))}V${f(y * r)}H${f(x * (r - L))}`).join(''); };
// holographic scanlines over each body
const scanPat = defs.append('pattern').attr('id', 'scan').attr('patternUnits', 'userSpaceOnUse').attr('width', 6).attr('height', 3);
scanPat.append('rect').attr('width', 6).attr('height', 1).attr('fill', '#fff').attr('fill-opacity', .07);
const blobLine = d3.line().curve(d3.curveCatmullRomClosed.alpha(.5));
const seedOf = id => { let h = 7; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 9973; return h / 97; };
/** A working agent's outline: two gentle waves that travel round the rim in opposite directions at a steady pace, so
    the shape flows continuously instead of wobbling and settling. The waves run over the hexagon. */
const HEX_IN = Math.cos(Math.PI / 6), SIXTH = Math.PI / 3;
function blobPath(R, t, seed) {
  const pts = [];
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2;
    const hex = HEX_IN / Math.cos((a % SIXTH) - SIXTH / 2);
    const r = R * hex * (1 + .035 * Math.sin(3 * a + t * .9 + seed) + .02 * Math.sin(2 * a - t * .55 + seed * 1.7));
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return blobLine(pts);
}
// a working node keeps its crisp hexagon (no per-frame outline animation); the turning colour gradient and the halo
// show the work.
const glow = defs.append('filter').attr('id', 'glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
glow.append('feGaussianBlur').attr('stdDeviation', 4).attr('result', 'b');
const fm = glow.append('feMerge'); fm.append('feMergeNode').attr('in', 'b'); fm.append('feMergeNode').attr('in', 'SourceGraphic');
const shadow = defs.append('filter').attr('id', 'shadow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
shadow.append('feDropShadow').attr('dx', 0).attr('dy', 4).attr('stdDeviation', 6).attr('flood-color', '#000').attr('flood-opacity', .55);

// 24x24 line icons, drawn pressed into each orb (bounding box measured once per icon so it can be centred)
const icBoxes = new Map();
function icBox(dstr) {
  let b = icBoxes.get(dstr); if (b) return b;
  const svg = document.querySelector('svg'), p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', dstr); p.setAttribute('visibility', 'hidden'); svg.append(p);
  try { const r = p.getBBox(); b = { x: r.x, y: r.y, width: r.width, height: r.height }; } catch { b = { x: 0, y: 0, width: 24, height: 24 }; }
  p.remove(); if (b.width || b.height) icBoxes.set(dstr, b); return b;
}
const ICONS = {
  brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3 3 3 0 0 0 3-2 3 3 0 0 0 3 2 3 3 0 0 0 3-3 3 3 0 0 0 2-5 3 3 0 0 0-2-5 3 3 0 0 0-3-3 3 3 0 0 0-3 2 3 3 0 0 0-3-2zM12 6v12M9 10h-2M17 10h-2M9 14H7M17 14h-2',
  lead: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  project: 'M12 2.5c3.2 2.3 4.8 5.6 4.6 9.8L14.5 15h-5l-2.1-2.7C7.2 8.1 8.8 4.8 12 2.5zM12 9.2a1.5 1.5 0 1 0 0-.01M9.5 15l-2.8 2 1.3-4.6M14.5 15l2.8 2-1.3-4.6M10.7 17.5 12 21l1.3-3.5',   // rocket
  worker: 'M13 2 4 14h7l-1 8 9-12h-7z',
  subagent: 'M12 3v3M7 6h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3zM9 11v1.5M15 11v1.5M9.5 15.5h5M2 11v3M22 11v3',   // bot (standing specialist)
  front: 'M4 5h16v11H10l-5 4v-4H4z',
  topic: 'M3 6h12v8H8l-4 3v-3H3zM17 9h4v8h-1v3l-3-3h-6v-1',
  you: 'M12 4a4 4 0 1 0 0 8 4 4 0 1 0 0-8zM4 21a8 8 0 0 1 16 0',
};
// a subagent's icon says what it does: first keyword in its name wins, robot if none matches
const SUB_ICONS = [
  [/seo|search|rank/i, 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.3 15.3 20 20M7.5 12.5l2-2 1.5 1.5 2.5-3'],            // magnifier + trend
  [/\bads?\b|advert|campaign/i, 'M3 10v4h3l6 4V6L6 10zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12'],          // megaphone
  [/social|instagram|tiktok|twitter/i, 'M18 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8.6 10.6l6.8-3.9M8.6 13.4l6.8 3.9'], // share
  [/support|success|customer|mail/i, 'M4 13v-1a8 8 0 0 1 16 0v1M4 13h3v5H5a1 1 0 0 1-1-1zM20 13h-3v5h2a1 1 0 0 0 1-1zM17 18c0 1.7-2 3-5 3'], // headset
  [/content|blog|writ|copy/i, 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4'],                                                      // pen
  [/analytic|data|report|metric/i, 'M4 20V10M10 20V4M16 20v-7M22 20H2'],                                                       // bars
];
/* Brain's own art: a filled two-hemisphere brain centred on the hex, signals running along its folds, sparks orbiting it
   and short lightning arcs that crack between the brain and the hex edge now and then. Built once, rescaled on render;
   the arcs pause while the tab is hidden or another view is open, and everything is still under reduced motion. */
const BRAIN_ART = (() => {
  const lobes = (sx) => {                                    // one hemisphere: a scalloped half-ellipse, top view
    const gap = 2.2, rx = 43, ry = 37, n = 7, pts = [];
    for (let i = 0; i <= n; i++) { const t = -Math.PI / 2 + Math.PI * i / n; pts.push([gap + rx * Math.cos(t), ry * Math.sin(t)]); }
    let p = `M${sx * pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const tm = -Math.PI / 2 + Math.PI * (i - .5) / n, bulge = 1.13;
      const cx = gap + rx * bulge * Math.cos(tm), cy = ry * bulge * Math.sin(tm);
      p += ` Q${(sx * cx).toFixed(1)},${cy.toFixed(1)} ${(sx * pts[i][0]).toFixed(1)},${pts[i][1].toFixed(1)}`;
    }
    return p + 'Z';
  };
  const folds = ['M8,-29C17,-34 25,-22 33,-27', 'M6,-16C14,-21 19,-9 27,-13S38,-15 41,-7', 'M5,-1C13,-6 18,6 27,1S36,2 42,8',
    'M7,13C14,9 20,20 29,16', 'M8,26C15,22 22,31 30,27', 'M20,-24C22,-18 18,-14 21,-8', 'M17,5C20,10 16,14 19,20'];
  return { left: lobes(-1), right: lobes(1), folds };
})();
function brainArt(g, R) {
  let a = g.select('.brainart');
  if (!a.node()) {
    if (!defs.select('#brainFill').node()) {
      const rg = defs.append('radialGradient').attr('id', 'brainFill').attr('cx', '50%').attr('cy', '38%').attr('r', '70%');
      rg.append('stop').attr('offset', '0%').attr('stop-color', '#f4d8ff');
      rg.append('stop').attr('offset', '35%').attr('stop-color', '#c39bff');
      rg.append('stop').attr('offset', '75%').attr('stop-color', '#7f5cf0');
      rg.append('stop').attr('offset', '100%').attr('stop-color', '#4a2fb8');
    }
    a = g.insert('g', '.ring').attr('class', 'brainart');
    const art = a.append('g').attr('class', 'bscale');
    art.append('ellipse').attr('class', 'baura').attr('rx', 56).attr('ry', 50);
    for (const side of [BRAIN_ART.left, BRAIN_ART.right]) art.append('path').attr('class', 'lobe').attr('d', side);
    [1, -1].forEach((sx, h) => {                             // right hemisphere's folds, then the same mirrored
      const side = art.append('g').attr('transform', `scale(${sx},1)`);
      for (const f of BRAIN_ART.folds) side.append('path').attr('class', 'fold').attr('d', f);
      BRAIN_ART.folds.forEach((f, i) => { if ((i + h) % 2 === 0) side.append('path').attr('class', 'synapse').attr('d', f).style('animation-delay', `${((i + h * 3) * .43) % 2.6}s`); });
    });
    art.append('path').attr('class', 'bshine').attr('d', 'M-30,-24C-22,-34 -8,-36 -3,-33M8,-34C16,-36 26,-31 31,-25');
    a.append('g').attr('class', 'bolts');
    const orb = a.append('g').attr('class', 'sparkorbits');
    [[1.18, 9, 0], [1.32, 14, 120], [1.25, 11, 240], [1.42, 19, 60]].forEach(([k, dur, start], i) => {
      const o = orb.append('g').attr('class', 'sorbit').style('animation-duration', dur + 's').style('animation-direction', i % 2 ? 'reverse' : 'normal')
        .attr('data-k', k).attr('data-start', start);
      o.append('circle').attr('class', 'spark').attr('r', i === 3 ? 1.6 : 2.1);
    });
    if (!reduce) brainBolts(a);
  }
  const k = R * 1.28 / 96;                                   // brain width (~96 units) to about 1.3 x the hex radius
  a.select('.bscale').attr('transform', `scale(${k})`);
  a.selectAll('.sorbit').each(function () {
    const o = d3.select(this), r = R * +o.attr('data-k'), st = +o.attr('data-start') * Math.PI / 180;
    o.select('circle').attr('cx', (r * Math.cos(st)).toFixed(1)).attr('cy', (r * Math.sin(st)).toFixed(1));
  });
  a.attr('data-r', R);
}
function brainBolts(a) {
  const jag = (r1, r2, ang, spread) => {                      // a jagged arc from r1 to r2 around angle ang
    const n = 6, pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, r = r1 + (r2 - r1) * t, aa = ang + (Math.random() - .5) * spread * (i && i < n ? 1 : .2);
      pts.push([(r * Math.cos(aa)).toFixed(1), (r * Math.sin(aa)).toFixed(1)]);
    }
    return 'M' + pts.map(p => p.join(',')).join('L');
  };
  const fire = () => {
    const R = +a.attr('data-r') || 40;
    if (quiet() || view !== 'map' || !document.body.contains(a.node())) return setTimeout(fire, 1500);
    const bolts = a.select('.bolts'), count = Math.random() < .35 ? 2 : 1;
    for (let c = 0; c < count; c++) {
      const ang = Math.random() * Math.PI * 2, out = Math.random() < .55;
      const d = out ? jag(R * .62, R * (1.25 + Math.random() * .3), ang, .5) : jag(R * .55, R * .95, ang, .35);
      const p = bolts.append('path').attr('class', 'bolt' + (out ? ' out' : '')).attr('d', d);
      if (c === 0 && typeof zap === 'function') { const b = a.node().getBoundingClientRect(); zap((b.left + b.width / 2 - innerWidth / 2) * 1.2); }
      if (Math.random() < .5) bolts.append('path').attr('class', 'bolt thin').attr('d', jag(R * .8, R * 1.1, ang + .25, .4));
      setTimeout(() => bolts.selectAll('path').remove(), 230 + Math.random() * 120);
    }
    setTimeout(fire, 700 + Math.random() * 1900);
  };
  setTimeout(fire, 900);
}
const iconFor = d => d.role === 'subagent' ? ((SUB_ICONS.find(([re]) => re.test(d.name)) || [])[1] || ICONS.subagent)
  : ICONS[d.role] || ICONS.worker;

const world = svg.append('g');
const gBack = world.append('g').attr('class', 'back');
const gLinks = world.append('g'), gFlow = world.append('g').attr('class', 'flows'), gNodes = world.append('g'), gFx = world.append('g');
const zoom = d3.zoom().scaleExtent([0.25, 3]).on('zoom', e => {
  world.attr('transform', e.transform);
  svg.classed('far', e.transform.k < .62).classed('mid', e.transform.k >= .62 && e.transform.k < .9).classed('tiny', e.transform.k < .45);
  // names never shrink below 11 px on screen; zooming in still makes them bigger
  svg.style('--lz', Math.max(1, 1 / e.transform.k).toFixed(3));
});
svg.call(zoom).on('dblclick.zoom', null);

let W = 800, H = 600;
function measure() { const r = $('#map').getBoundingClientRect(); W = r.width; H = r.height; }
measure();

const sim = d3.forceSimulation()
  .force('link', d3.forceLink().id(d => d.id).distance(l => l.target.role === 'lead' ? 200 : 150).strength(() => combActive() ? 0 : .7))
  .force('charge', d3.forceManyBody().strength(d => combActive() ? 0 : d.role === 'brain' ? -1400 : -650))
  .force('collide', d3.forceCollide(d => combActive() ? 0 : nodeR(d) + (d.role === 'subagent' || d.role === 'project' ? 48 : 30)))
  .force('radial', d3.forceRadial(d => d.depth * 180, 0, 0).strength(d => d.depth > 0 ? .35 : 0))
  .force('branch', branchForce)
  .force('comb', combForce)
  .alphaDecay(.03)
  .on('tick', simTick);
/* In the honeycomb every node is pulled into its own cell; once nothing moves any more the remaining cooling ticks
   would only redraw every link and plug at the same spot. Stop there (alpha 0 = cool for renderMap). */
function simTick() {
  ticked();
  if (!combActive() || sim.alphaTarget() > 0) return;
  let m = 0; for (const n of sim.nodes()) { const v = Math.max(Math.abs(n.vx || 0), Math.abs(n.vy || 0)); if (v > m) m = v; }
  if (m < .02) { sim.stop(); sim.alpha(0); }
}

/* Focus: with many leads the map gets crowded. Brain and the leads are always on the map; what sits under a lead
   (subagents, projects, workers) orbits it as small dots until that lead is focused (clicked). One lead is open at a
   time; clicking the background closes it. */
let focusLead = null;
/* Nested folding: inside the open lead only its direct children show; anything deeper shows once its parent is opened
   too (openSet). Opening another lead or clicking the background folds everything again. */
const openSet = new Set();
const isOpen = d => d.id === focusLead || openSet.has(d.id);
function shownUnderFocus(n) {
  let p = mapParentOf(n), i = 0;
  while (p && p !== focusLead && i++ < 20) { if (!openSet.has(p)) return false; p = mapParentOf(nodes[p] || {}); }
  return p === focusLead;
}

/* Branch layout: when a lead opens, other bubbles are pushed away and its agents are laid out like the branch of a
   tree, in clusters. The open lead drifts outward along its own angle from Brain; its children fan out
   further along that angle in rows (a second row when one is full), and their children fan out from them the same way.
   Everything else is pushed out of the branch's area, which gets a soft aura. */
let branch = null;   // { lead, th, t: Map id -> {x, y, a} relative to the lead, cx, cy, R }
const KID_ORDER = { project: 0, subagent: 1, worker: 2 };
function computeBranch(all, mapParent) {
  const lead = focusLead && nodes[focusLead];
  if (!lead || !all.includes(lead)) { branch = null; return; }
  const th = branch && branch.lead === lead.id ? branch.th : (lead.x || lead.y ? Math.atan2(lead.y, lead.x) : 0);
  const kidsOf = id => all.filter(n => mapParent(n) === id)
    .sort((a, b) => (KID_ORDER[a.role] ?? 5) - (KID_ORDER[b.role] ?? 5) || (a.createdAt || 0) - (b.createdAt || 0) || a.name.localeCompare(b.name));
  const t = new Map([[lead.id, { x: 0, y: 0, a: th }]]);
  // gap = room per bubble along a row (labels are wider than bubbles); later rows sit 78 px further out and are offset by
  // half a step, so their labels fall between the ones in front
  const fan = (id, dir, d0, span, depth) => {
    const kids = kidsOf(id); if (!kids.length || depth > 4) return;
    const p = t.get(id), gap = 78;
    for (let i = 0, ring = 0; i < kids.length; ring++) {
      const r = d0 + ring * 78, cap = Math.max(1, Math.floor(span * r / gap) + 1), row = kids.slice(i, i + cap);
      const w = row.length > 1 ? Math.min(span, (row.length - 1) * gap / r) : 0, off = ring % 2 && row.length > 1 ? w / (row.length - 1) / 2 : 0;
      row.forEach((k, j) => { const a = dir - w / 2 + off + (row.length > 1 ? j * w / (row.length - 1) : 0); t.set(k.id, { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, a }); });
      i += cap;
    }
    // a lone child may spread its own children wide; crowded rows keep them narrow
    for (const k of kids) fan(k.id, t.get(k.id).a, 120, kids.length <= 2 ? Math.PI * 1.25 : Math.PI * .7, depth + 1);
  };
  fan(lead.id, th, 155, Math.PI * 1.05, 0);
  const pts = [...t.values()], cx = d3.mean(pts, q => q.x), cy = d3.mean(pts, q => q.y);
  const R = Math.max(90, ...pts.map(q => Math.hypot(q.x - cx, q.y - cy))) + 45;
  branch = { lead: lead.id, th, t, cx, cy, R };
  for (const [id, q] of t) { const n = nodes[id]; if (n && n.x == null && lead.x != null) { n.x = lead.x + q.x; n.y = lead.y + q.y; } }   // new bubbles start in place
}
function branchForce(alpha) {
  if (!branch || combActive()) return;
  const L = nodes[branch.lead]; if (!L || L.x == null) return;
  const want = 230 + branch.R * .45;   // the open lead steps outward to make room for its branch
  if (L.fx == null) { L.vx += (Math.cos(branch.th) * want - L.x) * .1 * alpha; L.vy += (Math.sin(branch.th) * want - L.y) * .1 * alpha; }
  for (const [id, q] of branch.t) {
    if (id === branch.lead) continue;
    const n = nodes[id]; if (!n || n.x == null || n.fx != null) continue;
    n.vx += (L.x + q.x - n.x) * .35 * alpha; n.vy += (L.y + q.y - n.y) * .35 * alpha;
  }
  const cx = L.x + branch.cx, cy = L.y + branch.cy;
  for (const n of sim.nodes()) {
    if (branch.t.has(n.id) || n.fx != null || n.x == null) continue;
    const dx = n.x - cx, dy = n.y - cy, d = Math.hypot(dx, dy) || 1, min = branch.R + nodeR(n) + 24;
    if (d < min) { const k = (min - d) / d * .6 * alpha; n.vx += dx * k; n.vy += dy * k; }
  }
}
/* Honeycomb: the bubbles are already
   flat-top hexagons, so the map can sit on a flat-top hex grid: Brain in the centre cell, the open lead and its branch
   in neighbouring cells growing outward from Brain, every other lead in the nearest free cell (keeping its cell between
   renders when it can), faint honey-coloured cells behind. Physics is switched off and a force eases each bubble into
   its cell. A button by the zoom controls flips between this and the free layout; the choice is kept per browser. */
let combOn = true;
try { combOn = localStorage.getItem('cmd.layout') !== 'free'; } catch {}
const combActive = () => combOn && view === 'map';
let comb = null;                       // { S, cells: Map key -> {q, r, x, y, id|null} }
const combCell = new Map();            // id -> 'q,r' (sticky between renders)
const subCells = new Map();            // lead id -> its own comb's id -> 'q,r'
/* Drag in the honeycomb: a dragged bubble settles in the cell
   it is dropped on (an empty cell: it moves there; a taken one: the two swap). Brain, and the lead in the middle of its
   own comb, stay put. Cells are kept per browser, so the arrangement survives a reload. */
try {
  for (const [id, k] of Object.entries(JSON.parse(localStorage.getItem('cmd.combTop') || '{}'))) combCell.set(id, k);
  for (const [l, m] of Object.entries(JSON.parse(localStorage.getItem('cmd.combSub') || '{}'))) subCells.set(l, new Map(Object.entries(m)));
} catch {}
function combSave() {
  const top = Object.fromEntries(combCell), sub = Object.fromEntries([...subCells].map(([l, m]) => [l, Object.fromEntries(m)]));
  try {
    localStorage.setItem('cmd.combTop', JSON.stringify(top));
    localStorage.setItem('cmd.combSub', JSON.stringify(sub));
  } catch {}
  layoutSaveRemote(top, sub);
}
/* Mirror the honeycomb arrangement (and the comb/free choice) onto the signed-in person's own account, not just this
   browser's localStorage, so it follows them to any device. Debounced: a drag fires combSave once, but this keeps it
   cheap either way. */
let layoutSaveT = null;
function layoutSaveRemote(top, sub) {
  clearTimeout(layoutSaveT);
  layoutSaveT = setTimeout(() => {
    post('/api/layout', { combOn, combTop: top !== undefined ? top : Object.fromEntries(combCell), combSub: sub !== undefined ? sub : Object.fromEntries([...subCells].map(([l, m]) => [l, Object.fromEntries(m)])) }).catch(() => {});
  }, 500);
}
let layoutHydrated = false;
function hydrateLayout(layout) {
  if (layoutHydrated || !layout) return;
  layoutHydrated = true;
  if (typeof layout.combOn === 'boolean') { combOn = layout.combOn; try { localStorage.setItem('cmd.layout', combOn ? 'comb' : 'free'); } catch {} }
  combCell.clear(); for (const [id, k] of Object.entries(layout.combTop || {})) combCell.set(id, k);
  subCells.clear(); for (const [l, m] of Object.entries(layout.combSub || {})) subCells.set(l, new Map(Object.entries(m)));
  try {
    localStorage.setItem('cmd.combTop', JSON.stringify(layout.combTop || {}));
    localStorage.setItem('cmd.combSub', JSON.stringify(layout.combSub || {}));
  } catch {}
  shapeKey = ''; if (typeof render === 'function' && nodes && Object.keys(nodes).length) { render(); if (sim) sim.alpha(.6).restart(); }
}
function combDrop(d, x, y) {
  if (!comb || !combActive() || d.id === 'brain' || (combZoomed() && d.id === focusLead)) return;
  const S = comb.S, fq = x / (1.5 * S), fr = y / (Math.sqrt(3) * S) - fq / 2;
  let q = Math.round(fq), r = Math.round(fr), s3 = Math.round(-fq - fr);
  const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s3 + fq + fr);
  if (dq > dr && dq > ds) q = -r - s3; else if (dr > ds) r = -q - s3;
  const k = q + ',' + r, map = combZoomed() ? subCells.get(focusLead) : combCell, mine = map && map.get(d.id);
  if (!map || !mine || k === mine || k === '0,0') return;
  const other = [...map].find(([id, kk]) => kk === k && id !== d.id && nodes[id] && sim.nodes().includes(nodes[id]));
  if (other) map.set(other[0], mine);
  map.set(d.id, k);
  combSave(); shapeKey = ''; render(); sim.alpha(.5).restart();
}
const combZoomed = () => combActive() && !!focusLead && !!nodes[focusLead];
const HEX_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const cellXY = (q, r, S) => ({ x: S * 1.5 * q, y: S * Math.sqrt(3) * (r + q / 2) });
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
function ringCells(c, k) {             // cells exactly k steps from c
  if (k === 0) return [{ q: c.q, r: c.r }];
  const out = []; let q = c.q + HEX_DIRS[4][0] * k, r = c.r + HEX_DIRS[4][1] * k;
  for (let i = 0; i < 6; i++) for (let j = 0; j < k; j++) { out.push({ q, r }); q += HEX_DIRS[i][0]; r += HEX_DIRS[i][1]; }
  return out;
}
function computeComb(all, mapParent) {
  if (!combActive()) { comb = null; return; }
  // inside a lead (see combDive) the lead is the centre of its own comb, with cells of its own, so the main comb is
  // exactly as it was when we come back out
  const zoomed = combZoomed();
  const cellMap = zoomed ? (subCells.get(focusLead) || subCells.set(focusLead, new Map()).get(focusLead)) : combCell;
  const maxR = Math.max(30, ...all.map(nodeR));
  const S = Math.max(62, (2 * maxR + 46) / Math.sqrt(3));
  const used = new Map(), at = {};
  const take = (id, c) => { const k = c.q + ',' + c.r; used.set(k, id); at[id] = c; cellMap.set(id, k); };
  const parse = k => { const [q, r] = k.split(',').map(Number); return { q, r }; };
  /* A folded agent keeps the cell it had while its lead was open, and nobody else may settle there; when its lead
     opens again it goes straight back to it. */
  const shownNow = new Set(all.map(n => n.id)), held = new Map();
  for (const [id, k] of cellMap) if (nodes[id] && !shownNow.has(id) && !held.has(k)) held.set(k, id);
  const free = c => { const k = c.q + ',' + c.r; return !used.has(k) && !held.has(k); };
  const ownCell = id => { const k = cellMap.get(id); return k && held.get(k) === id ? parse(k) : null; };
  const O = { q: 0, r: 0 };
  /** nearest free cell to `near`, ties broken by `score` (lower wins) */
  const nearestFree = (near, score) => {
    for (let k = 1; k < 40; k++) { const ring = ringCells(near, k).filter(free); if (ring.length) return ring.sort((a, b) => score(a) - score(b))[0]; }
    return null;
  };
  const brain = all.find(n => n.id === 'brain');
  if (zoomed) take(focusLead, O);
  else if (brain) take('brain', O);
  const kidsOf = id => all.filter(n => mapParent(n) === id && n.id !== 'brain')
    .sort((a, b) => (KID_ORDER[a.role] ?? 5) - (KID_ORDER[b.role] ?? 5) || (a.createdAt || 0) - (b.createdAt || 0) || a.name.localeCompare(b.name));
  // 1) the open lead next to Brain on its own side, its branch outward from it
  const lead = !zoomed && focusLead && all.find(n => n.id === focusLead);
  if (lead) {
    const prev = cellMap.get(lead.id), pc = prev ? parse(prev) : null;
    const ang = pc ? Math.atan2(cellXY(pc.q, pc.r, 1).y, cellXY(pc.q, pc.r, 1).x) : Math.atan2(lead.y || 0, lead.x || 1);
    const angOf = c => { const p = cellXY(c.q, c.r, 1); return Math.atan2(p.y, p.x); };
    const angDiff = c => { let d = Math.abs(angOf(c) - ang); return d > Math.PI ? 2 * Math.PI - d : d; };
    // the lead stays where it is and its agents open right round it (so they form clusters), pushing unfolded bubbles
    // aside; only a lead with no cell yet starts next to Brain
    const r1 = pc && free(pc) && !(pc.q === 0 && pc.r === 0) ? pc : ringCells(O, 1).filter(free).sort((a, b) => angDiff(a) - angDiff(b))[0] || nearestFree(O, angDiff);
    if (r1) take(lead.id, r1);
    const queue = [lead.id];
    while (queue.length) {
      const pid = queue.shift(), pc2 = at[pid];
      for (const k of kidsOf(pid)) {
        if (at[k.id] || !pc2) continue;
        const mine = ownCell(k.id);
        if (mine) { held.delete(mine.q + ',' + mine.r); take(k.id, mine); queue.push(k.id); continue; }
        // closest to its parent, then farthest from Brain, then closest to the lead's own direction
        const c = nearestFree(pc2, c => hexDist(c, at[lead.id]) * 2 - hexDist(c, O) * .5 + angDiff(c));
        if (c) { take(k.id, c); queue.push(k.id); }
      }
    }
  }
  // 2) everyone else: keep last cell if still free, else the nearest free cell to it (or to its parent / Brain)
  const rest = all.filter(n => !at[n.id]).sort((a, b) => depthOf(a.id) - depthOf(b.id) || nodeR(b) - nodeR(a) || a.name.localeCompare(b.name));
  for (const n of rest) {
    const prev = cellMap.get(n.id), pc = prev && parse(prev);
    if (pc && free(pc) && !(pc.q === 0 && pc.r === 0)) { take(n.id, pc); continue; }
    const p = at[mapParent(n)] || O;
    const c = nearestFree(pc || p, c => hexDist(c, O) + (pc ? 0 : hexDist(c, p)) * .5);
    if (c) take(n.id, c);
  }
  // 3) targets, honey cells (occupied + one ring of empty ones around them)
  const cells = new Map();
  for (const [k, id] of used) { const c = parse(k); cells.set(k, { ...c, ...cellXY(c.q, c.r, S), id }); }
  for (const [k] of used) for (const c of ringCells(parse(k), 1)) { const kk = c.q + ',' + c.r; if (!cells.has(kk)) cells.set(kk, { ...c, ...cellXY(c.q, c.r, S), id: null }); }
  for (const [k] of held) if (!cells.has(k)) { const c = parse(k); cells.set(k, { ...c, ...cellXY(c.q, c.r, S), id: null }); }
  for (const n of all) {
    const c = at[n.id]; if (!c) continue;
    const p = cellXY(c.q, c.r, S); n.cx = p.x; n.cy = p.y;
    if (n.x == null) { const par = nodes[mapParent(n)]; n.x = par && par.x != null ? par.x : 0; n.y = par && par.y != null ? par.y : 0; }
  }
  comb = { S, cells, walls: combWalls(cells, S), routes: new Map() };
  // every two neighbouring agents are joined through the middle of their shared side; messages hop cell to cell
  // along these
  const mesh = [];
  for (const c of cells.values()) if (c.id) for (const [dq, dr] of HEX_DIRS.slice(0, 3)) {
    const o = cells.get((c.q + dq) + ',' + (c.r + dr)); if (!o || !o.id) continue;
    const x = (c.x + o.x) / 2, y = (c.y + o.y) / 2;
    mesh.push({ id: c.id + '~' + o.id, a: c.id, b: o.id, key: vkey(x, y), x, y, ang: Math.atan2(o.y - c.y, o.x - c.x) * 180 / Math.PI });
  }
  comb.mesh = mesh; comb.nb = new Map();
  for (const m of mesh) { (comb.nb.get(m.a) || comb.nb.set(m.a, []).get(m.a)).push(m.b); (comb.nb.get(m.b) || comb.nb.set(m.b, []).get(m.b)).push(m.a); }
}
/* Fiber lines: in the honeycomb a link no longer cuts across cells. The cell walls form a graph (each cell's 6 corners
   plus the middle of each side, its "ports"); a link leaves its cell through the middle of one side, runs along the
   walls by the shortest way with sharp corners, and enters the other cell through the middle of a side, where a plug
   (cyan, the cable's) sits in a socket (amber, the cell's). The bottom side is under the label, so it is avoided; a cell
   spreads its cables over free sides. Routes are cached per comb; pulses and flows follow the same path. */
const vkey = (x, y) => Math.round(x * 2) + ',' + Math.round(y * 2);
const PORT_COST = [1.5, 40, 1.5, 0, 0, 0];   // side j faces 60j+30 deg (y down): 1 = bottom (label), 0/2 = lower sides
function cellPorts(n, S) {
  const a = S * Math.sqrt(3) / 2;
  return [0, 1, 2, 3, 4, 5].map(j => { const t = Math.PI / 3 * j + Math.PI / 6, x = n.cx + a * Math.cos(t), y = n.cy + a * Math.sin(t); return { key: vkey(x, y), x, y, j, ang: t * 180 / Math.PI + 180 }; });
}
function combWalls(cells, S) {
  const pos = new Map(), adj = new Map();
  const add = (a, b) => { (adj.get(a) || adj.set(a, new Set()).get(a)).add(b); (adj.get(b) || adj.set(b, new Set()).get(b)).add(a); };
  for (const c of cells.values()) {
    const ks = [];
    for (let i = 0; i < 12; i++) {   // corner, side middle, corner, ...
      const t = Math.PI / 6 * i, r = i % 2 ? S * Math.sqrt(3) / 2 : S, x = c.x + r * Math.cos(t), y = c.y + r * Math.sin(t), k = vkey(x, y);
      pos.set(k, [x, y]); ks.push(k);
    }
    for (let i = 0; i < 12; i++) add(ks[i], ks[(i + 1) % 12]);
  }
  return { pos, adj, use: new Map() };
}
function combRoute(a, b) {
  const id = a.id + '>' + b.id;
  if (comb.routes.has(id)) return comb.routes.get(id);
  const { pos, adj, use } = comb.walls, used = (n, p) => (use.get(n.id + '@' + p.j) || 0) * 2;
  const pa = cellPorts(a, comb.S), pb = cellPorts(b, comb.S), ends = new Map(pb.map(p => [p.key, p]));
  const dist = new Map(), prev = new Map(), from = new Map(), q = [];
  for (const p of pa) if (pos.has(p.key)) { dist.set(p.key, PORT_COST[p.j] + used(a, p)); from.set(p.key, p); q.push(p.key); }
  let best = null, bestD = Infinity;
  while (q.length) {
    q.sort((x, y) => dist.get(x) - dist.get(y) || (x < y ? -1 : 1));
    const k = q.shift(), d = dist.get(k);
    if (d >= bestD) break;
    if (ends.has(k)) { const p = ends.get(k), e = d + PORT_COST[p.j] + used(b, p); if (e < bestD) { bestD = e; best = k; } }
    for (const m of [...(adj.get(k) || [])].sort()) {
      const nd = d + 1;
      if (nd < (dist.has(m) ? dist.get(m) : Infinity)) { dist.set(m, nd); prev.set(m, k); from.set(m, from.get(k)); if (!q.includes(m)) q.push(m); }
    }
  }
  let r = null;
  if (best) {
    const pts = []; for (let k = best; k; k = prev.get(k)) pts.unshift(pos.get(k));
    r = { pts, pa: from.get(best), pb: ends.get(best) };
    for (const [n, p] of [[a, r.pa], [b, r.pb]]) use.set(n.id + '@' + p.j, (use.get(n.id + '@' + p.j) || 0) + 1);
  }
  comb.routes.set(id, r);
  return r;
}
function fiberPath(s, t) {
  const r = combRoute(s, t); if (!r) return null;
  const pts = r.pts, rim = (n, p) => { const dx = p[0] - n.x, dy = p[1] - n.y, L = Math.hypot(dx, dy) || 1, k = nodeR(n) + 4; return [n.x + dx / L * k, n.y + dy / L * k]; };
  const all = [rim(s, pts[0]), ...pts, rim(t, pts[pts.length - 1])].filter((p, i, A) => !i || Math.hypot(p[0] - A[i - 1][0], p[1] - A[i - 1][1]) > .5);
  return 'M' + all.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L');
}
/* A mesh line leaves its bubble toward the shared side, but never across the bubble's name and meta lines: where it
   would, it starts just past the label box instead. */
function meshEnd(n, m) {
  const dx = m.x - n.x, dy = m.y - n.y, D = Math.hypot(dx, dy) || 1, ux = dx / D, uy = dy / D, R = nodeR(n);
  let t = R + 4;
  if (uy > .05) {
    const hw = n._lw || 60, t0 = (R + 5) / uy, t1 = Math.min((R + 38) / uy, Math.abs(ux) > .01 ? hw / Math.abs(ux) : Infinity);
    if (t1 > t0 && t1 > t) t = Math.max(t, t1 + 3);
  }
  return t >= D - 2 ? [m.x, m.y] : [n.x + ux * t, n.y + uy * t];
}
function meshPts(m, rev) {
  const a = nodes[m.a], b = nodes[m.b]; if (!a || !b || a.x == null || b.x == null) return null;
  const p = [meshEnd(a, m), [m.x, m.y], meshEnd(b, m)];
  return rev ? p.reverse() : p;
}
const ptsD = p => 'M' + p.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('L');
function meshPath(m) { const p = meshPts(m); return p ? ptsD(p) : 'M0,0'; }
/** a working agent's flow in the honeycomb: from its parent cell to its own, hop by hop along the mesh */
function flowPath(l) {
  if (!(comb && combActive() && comb.nb)) return linkPath(l);
  const s = nodeOf(l.source), t = nodeOf(l.target); if (!s || !t) return linkPath(l);
  const hs = hops(s.id, t.id); if (!hs.length) return linkPath(l);
  let d = '';
  for (const [a, b] of hs) { let m = comb.mesh.find(x => x.a === a && x.b === b), rev = false; if (!m) { m = comb.mesh.find(x => x.a === b && x.b === a); rev = true; } const p = m && meshPts(m, rev); if (!p) return linkPath(l); d += ptsD(p); }
  return d;
}
function drawMesh() {
  const M = gLinks.selectAll('path.mesh').data(comb && combActive() ? comb.mesh : [], d => d.id);
  M.exit().remove();
  M.enter().insert('path', ':first-child').attr('class', 'mesh').attr('data-id', d => d.id);
}
/** plug-in-socket at both ends of every fiber, one per port */
function drawPlugs(links) {
  const ps = new Map();
  if (comb && combActive() && !comb.mesh) for (const l of links) {
    const s = nodeOf(l.source), t = nodeOf(l.target); if (!s || !t || s.cx == null || t.cx == null) continue;
    const r = combRoute(s, t); if (!r) continue;
    for (const p of [r.pa, r.pb]) if (!ps.has(p.key)) ps.set(p.key, { ...p, dim: false });
  }
  if (comb && combActive()) for (const m of comb.mesh) if (!ps.has(m.key)) ps.set(m.key, { key: m.key, x: m.x, y: m.y, ang: m.ang, dim: false });
  const P = gLinks.selectAll('g.plug').data([...ps.values()], d => d.key + '|' + d.ang.toFixed(0));
  P.exit().remove();
  const E = P.enter().append('g').attr('class', 'plug');
  E.append('path').attr('class', 'sock').attr('d', 'M4.6,-4.6H8.4V4.6H4.6');
  E.append('path').attr('class', 'pins').attr('d', 'M2.6,-1.8H6.6M2.6,1.8H6.6');
  E.append('rect').attr('class', 'male').attr('x', -1.2).attr('y', -3.2).attr('width', 3.8).attr('height', 6.4).attr('rx', .6);
  gLinks.selectAll('g.plug').attr('transform', d => `translate(${d.x.toFixed(1)},${d.y.toFixed(1)}) rotate(${d.ang.toFixed(0)})`).classed('dim', d => d.dim);
  if (!E.empty()) gLinks.selectAll('g.plug').raise();
}
function combForce(alpha) {
  if (!comb || !combActive()) return;
  for (const n of sim.nodes()) {
    if (n.cx == null || n.fx != null) continue;
    n.vx += (n.cx - n.x) * .22 * alpha * 4; n.vy += (n.cy - n.y) * .22 * alpha * 4;
  }
}
/* A cell shows its lead colour while its bubble works (see drawComb) or while the pointer is on it (inside a lead: the
   whole comb, while on the lead in the middle). */
function combHover(id) {
  gBack.selectAll('path.combcell').classed('hl', d => !!id && (d.id === id || (combZoomed() && id === focusLead)));
}
function drawComb() {
  const cells = comb ? [...comb.cells.values()] : [];
  const C = gBack.selectAll('path.combcell').data(cells, d => d.q + ',' + d.r);
  C.exit().transition().duration(300).attr('opacity', 0).remove();
  C.enter().insert('path', ':first-child').attr('class', 'combcell').attr('opacity', 0).transition().duration(500).attr('opacity', 1);
  if (!comb) return;   // comb off (free layout or another view): the old cells only fade out; comb.S would throw
  const cellD = hexPath(comb.S - 3);
  gBack.selectAll('path.combcell').each(function (d) {   // only cells that moved or resized are rewritten
    const k = cellD + d.x + ',' + d.y; if (this.__k === k) return; this.__k = k;
    this.setAttribute('d', cellD); this.setAttribute('transform', `translate(${d.x},${d.y})`);
  })
    .classed('on', d => !!d.id).classed('hot', d => !!d.id && nodes[d.id] && nodes[d.id].state === 'working')
    .each(function (d) {   // a lead's cell, or inside a lead every cell, takes the lead's colour
      const lid = combZoomed() ? focusLead : d.id && nodes[d.id] && nodes[d.id].role === 'lead' ? d.id : null, lc = lid && leadColor(lid);
      if (lc) this.style.setProperty('--lc', lc.c); else this.style.removeProperty('--lc');
      this.classList.toggle('lc', !!lc);
      // lit while that bubble (a lead: anything under it) works; the rest stay grey
      const n = d.id && nodes[d.id];
      this.classList.toggle('lit', !!n && (n.role === 'lead' ? leadLit(n) : n.state === 'working'));
    });
}
/* In the honeycomb a lead does not open in place. The camera dives into it (scale up + fade), the lead's own comb comes
   in (lead in the middle, its agents round it), and a click on the background or on the lead again dives back out to
   the main comb, untouched. */
function combDive(id) {
  measure();
  const t = d3.zoomTransform(svg.node()), d = id ? nodes[id] : null;
  const cx = d && d.x != null ? d.x : (W / 2 - t.x) / t.k, cy = d && d.y != null ? d.y : (H / 2 - t.y) / t.k;
  const k2 = id ? Math.min(3, t.k * 2.6) : Math.max(.25, t.k / 2.6);
  svg.interrupt(); world.interrupt();
  svg.transition().duration(360).ease(d3.easeCubicIn).call(zoom.transform, d3.zoomIdentity.translate(W / 2 - k2 * cx, H / 2 - k2 * cy).scale(k2));
  world.transition().duration(360).style('opacity', 0).on('end', () => {
    focusLead = id; openSet.clear(); render();
    for (const n of sim.nodes()) if (n.cx != null) { n.x = n.cx; n.y = n.cy; n.vx = 0; n.vy = 0; }
    ticked();
    fit(false);
    const f = d3.zoomTransform(svg.node()), s0 = id ? .5 : 1.9, k = f.k * s0;
    const wx = (W / 2 - f.x) / f.k, wy = (H / 2 - f.y) / f.k;
    svg.call(zoom.transform, d3.zoomIdentity.translate(W / 2 - wx * k, H / 2 - wy * k).scale(k));
    svg.transition().duration(560).ease(d3.easeCubicOut).call(zoom.transform, f);
    world.transition().duration(460).style('opacity', 1);
  });
}
function setComb(on) {
  combOn = on; try { localStorage.setItem('cmd.layout', on ? 'comb' : 'free'); } catch {}
  layoutSaveRemote();
  const b = $('#zcomb'); if (b) { b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.title = on ? 'Free layout' : 'Honeycomb layout'; }
  for (const n of Object.values(nodes)) { n.cx = null; n.cy = null; }
  sim.force('link').strength(sim.force('link').strength()); sim.force('charge').strength(sim.force('charge').strength());
  sim.force('collide').radius(sim.force('collide').radius());
  shapeKey = ''; render(); sim.alpha(.9).restart(); setTimeout(() => fit(true), 900);
}
let shownIds = new Set();
function leadOf(n) { let x = n, i = 0; while (x && i++ < 30) { if (x.role === 'lead') return x; x = nodes[x.parent]; } return null; }
const collapsedUnder = lead => Object.values(nodes).filter(n => n.role !== 'topic' && n.role !== 'lead' && n.id !== lead.id && leadOf(n) === lead);
/* Moons: a folded lead shows only its DIRECT children, in their role colour, and what goes on further down shows on
   that child's moon: green ring when anything under it works, red when something needs attention. */
const mapParentOf = n => { let p = nodes[n.parent]; while (p && p.role === 'topic') p = nodes[p.parent]; return p ? p.id : null; };
/* subtreeOf would scan every node at every level, hundreds of times per map update. Children of each map parent (leads
   excluded, same order as nodes) are indexed once; the index drops at the end of the task and whenever the tree changes
   (applyTree / renderMap call kidsReset). */
let kidsIdx = null;
function kidsReset() { kidsIdx = null; }
function kidsOf(pid) {
  if (!kidsIdx) {
    kidsIdx = new Map();
    for (const c of Object.values(nodes)) if (c.role !== 'lead') { const p = mapParentOf(c); if (!kidsIdx.has(p)) kidsIdx.set(p, []); kidsIdx.get(p).push(c); }
    queueMicrotask(kidsReset);
  }
  return kidsIdx.get(pid) || [];
}
const moonsOf = lead => kidsOf(lead.id).filter(n => n.role !== 'topic' && n.state !== 'stopped');   // a stopped agent is not a moon
function subtreeOf(id) { const out = []; const walk = pid => { for (const c of kidsOf(pid)) { out.push(c); walk(c.id); } }; walk(id); return out; }
const moonBusy = m => m.state === 'working' || subtreeOf(m.id).some(c => c.state === 'working');
/* Lead dimming: short timer ticks under a lead would keep every lead lit. A lead is lit only when it works itself, or
   when an agent session under it (role project or subagent; not a worker or topic) has been working for LIT_MIN
   minutes in a row. */
const LIT_MIN = 3, LIT_ROLES = new Set(['project', 'subagent']);
const leadLit = l => l.state === 'working' || subtreeOf(l.id).some(c => LIT_ROLES.has(c.role) && c.state === 'working' && c.wAt && Date.now() - c.wAt >= LIT_MIN * 60000);
const moonBad = m => ['problem', 'offline', 'login'].includes(m.state) || subtreeOf(m.id).some(c => ['problem', 'offline', 'login'].includes(c.state));
/** The nearest node that is actually drawn, for pulses and flashes aimed at a folded-away agent. */
function shownAnc(id) { let n = nodes[id], i = 0; while (n && i++ < 30) { if (shownIds.has(n.id)) return n.id; n = nodes[n.parent]; } return null; }
function depthOf(id) {
  let d = 0, n = nodes[id];
  while (n && n.id !== 'brain' && d < 20) { n = nodes[n.parent]; d++; }
  return n ? d : 0;
}

function graphData() {
  const list = Object.values(nodes);
  const all = [];
  for (const n of list) { n.fx = null; n.fy = null; }
  if (view === 'map') {
    // topics are not on the map; they float beside it (see renderTopicHeads)
    for (const n of list) {
      if (n.role === 'front' || n.role === 'topic' || isPerson(n)) continue;
      if (combZoomed() && n.id !== focusLead && !(n.role !== 'lead' && leadOf(n) && leadOf(n).id === focusLead && shownUnderFocus(n))) continue;
      const ld = n.role === 'lead' ? null : leadOf(n);
      if (ld && ld.id !== focusLead) continue;   // folded into its lead's orbit
      if (ld && !shownUnderFocus(n)) continue;   // folded into its parent's orbit inside the open lead
      n.depth = depthOf(n.id); all.push(n);
    }
    if (nodes.brain) { nodes.brain.fx = 0; nodes.brain.fy = 0; }
  } else {
    // people on the left, their desks in the middle, Brain on the right; fixed positions, no physics
    const adminDesk = d => list.some(x => isPerson(x) && x.desk === d.id && x.admin);
    const desks = list.filter(n => n.role === 'front').sort((a, b) => adminDesk(b) - adminDesk(a) || a.name.localeCompare(b.name));
    const gap = 150, y0 = -(desks.length - 1) * gap / 2;
    desks.forEach((d, i) => {
      d.depth = 0; d.fx = 0; d.fy = y0 + i * gap; all.push(d);
      const u = list.find(x => isPerson(x) && x.desk === d.id);
      if (u) { u.depth = 0; u.fx = -230; u.fy = d.fy; all.push(u); }
    });
    if (nodes.brain) { nodes.brain.depth = 0; nodes.brain.fx = 300; nodes.brain.fy = 0; all.push(nodes.brain); }
  }
  const ids = new Set(all.map(n => n.id));
  shownIds = ids;
  // an agent a topic spawned hangs off the topic's own parent while the topic floats
  const mapParent = n => { let p = nodes[n.parent]; while (p && p.role === 'topic') p = nodes[p.parent]; return p ? p.id : null; };
  const links = all.map(n => [mapParent(n), n]).filter(([p]) => p && ids.has(p)).map(([p, n]) => ({ source: p, target: n.id, id: p + '>' + n.id }));
  return { all, links };
}

/** Lines stop at the orb's rim, so they read as connections rather than spokes through the bubbles. */
function linkPath(l) {
  const s = l.source, t = l.target;
  if (comb && combActive() && s.cx != null && t.cx != null) { const f = fiberPath(s, t); if (f) return f; }
  const dx = t.x - s.x, dy = t.y - s.y, len = Math.hypot(dx, dy) || 1;
  const rs = nodeR(s) + 4, rt = nodeR(t) + 4;
  if (len <= rs + rt) return `M${s.x},${s.y}L${s.x},${s.y}`;
  return `M${s.x + dx / len * rs},${s.y + dy / len * rs}L${t.x - dx / len * rt},${t.y - dy / len * rt}`;
}
const nodeOf = x => typeof x === 'object' ? x : nodes[x];
const metaText = d => {
  if (isPerson(d)) return d.admin ? 'admin' : 'team member';
  const st = d.care ? (d.care === 'compact' ? 'compacting next' : 'clearing next') : STATE_T[d.state] || d.state;
  const role = d.role === 'front' ? 'concierge' : d.role === 'topic' ? '💬 topic' : d.role;
  return [role, st, d.queued ? `${d.queued} waiting` : '', d.ctx ? 'ctx ' + fmtTok(d.ctx) : ''].filter(Boolean).join(' · ');
};

let shapeKey = '', scaleKey = '';
// Every role/lead colour has a turning SMIL gradient, and each one would repaint the map every frame even when nothing
// wears it. Keep the turn only on gradients a working node uses.
function syncSpin() {
  const on = render.spinning || new Set();
  defs.selectAll('linearGradient[id^="w-"]').each(function () {
    const a = this.querySelector('animateTransform');
    if (!on.has(this.id)) { if (a) a.remove(); return; }
    if (!a) d3.select(this).append('animateTransform').attr('attributeName', 'gradientTransform').attr('type', 'rotate')
      .attr('values', '0 .5 .5;360 .5 .5').attr('dur', '5s').attr('repeatCount', 'indefinite');
  });
}
function render() {
  try { return renderMap(); } finally { syncSpin(); }
}
function nodeSig(d, R) {
  const moons = view === 'map' && !isOpen(d) && !['brain', 'front', 'topic'].includes(d.role) && !isPerson(d) ? moonsOf(d) : [];
  const tk = tokOf(d.id);
  return [d.state, d.role, d.name, R, selected === d.id, view, activeDesk === d.id, d.role === 'lead' && leadLit(d), d.role === 'lead' ? leadColor(d.id).key : '',
    metaText(d), tokP, tk ? tk.t : '', d.cwd, d.last,
    (d.subagents || []).filter(x => x.active).map(x => x.id + x.label).join(','), moons.map(m => m.id + m.state + (moonBad(m) ? 'b' : '')).join(','),
    moons.length ? subtreeOf(d.id).map(m => m.state).join('') : ''].join('\u0001');
}
function renderMap() {
  kidsReset();
  renderTopicHeads();
  const g0 = graphData(), all = g0.all;
  let links = g0.links;
  const key = view + '|' + all.map(n => n.id).sort().join(',') + '|' + links.map(l => l.id).sort().join(',');
  const sk = computeScales(), resized = sk !== scaleKey; scaleKey = sk;
  const reshaped = key !== shapeKey || resized; shapeKey = key;
  if (resized) sim.force('collide').radius(sim.force('collide').radius());   // re-read each node's radius
  // same shape: keep the simulation's own link objects (their ends are node objects with x/y; fresh ones are bare ids)
  computeBranch(all, mapParentOf);
  computeComb(all, mapParentOf);
  // a change in the number of cells restarts the simulation so bubbles settle into the new grid
  if (comb) { const c0 = comb.cells.size; if (c0 !== render.combN) { render.combN = c0; sim.alpha(Math.max(sim.alpha(), .5)).restart(); } }
  drawComb();
  drawMesh();
  document.body.classList.toggle('combmap', !!comb);
  if (reshaped) {
    sim.nodes(all); sim.force('link').links(links);
    sim.force('radial').strength(d => !combActive() && d.depth > 0 && !(branch && branch.t.has(d.id) && d.id !== branch.lead) ? .35 : 0);   // the branch places its own
  } else links = sim.force('link').links();
  const BA = gBack.selectAll('circle.branchaura').data(branch && !comb ? [branch.lead] : [], d => d);
  BA.exit().transition().duration(400).attr('opacity', 0).remove();
  BA.enter().insert('circle', ':first-child').attr('class', 'branchaura').attr('fill', 'url(#h-lead)').attr('opacity', 0).transition().duration(600).attr('opacity', 1);

  const L = gLinks.selectAll('path.link').data(links, d => d.id);
  L.exit().remove();
  L.enter().append('path').attr('class', 'link').attr('data-id', d => d.id);
  // thin white strings instead of role-coloured links; the role colour still flows along .flow when a node is working,
  // so no information is lost, just quieter at rest
  gLinks.selectAll('path.link')
    .attr('stroke', '#e9ecf4')
    .attr('stroke-width', d => ({ lead: 1.3, front: 1.2, project: 1, subagent: .9, worker: .85, you: .85, topic: 1 })[nodeOf(d.target).role] || .9);
  // signal flowing toward agents that are working right now
  const active = links.filter(l => nodeOf(l.target).state === 'working');
  const F = gFlow.selectAll('path.flow').data(active, d => d.id);
  F.exit().remove();
  F.enter().append('path').attr('class', 'flow');
  gFlow.selectAll('path.flow').attr('stroke', d => ROLE_C[nodeOf(d.target).role] || '#fff');

  const N = gNodes.selectAll('g.node').data(all, d => d.id);
  N.exit().remove();
  const E = N.enter().append('g').attr('class', 'node').attr('data-id', d => d.id)
    .on('click', (e, d) => { e.stopPropagation(); nodeClick(d); })
    .on('mouseenter', (e, d) => { highlight(d.id); combHover(d.id); if (d.role === 'lead') hoverScale(d, true); })
    .on('mouseleave', (e, d) => { highlight(null); combHover(null); if (d.role === 'lead') hoverScale(d, false); })
    .call(d3.drag().on('start', (e, d) => { if (!e.active) sim.alphaTarget(.2).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); if (view === 'map' && d.id !== 'brain') { d.fx = null; d.fy = null; combDrop(d, e.x, e.y); } }));
  E.append('circle').attr('class', 'halo');
  E.append('path').attr('class', 'body');
  E.append('path').attr('class', 'scan').attr('fill', 'url(#scan)');
  E.append('path').attr('class', 'sheen');
  E.append('path').attr('class', 'brk');
  const IC = E.append('g').attr('class', 'icon');   // small, thin, centred, pressed into the body
  IC.append('path').attr('class', 'ic-hi'); IC.append('path').attr('class', 'ic-sh'); IC.append('path').attr('class', 'ic');
  E.append('path').attr('class', 'ring');
  E.append('g').attr('class', 'ebolts');
  E.append('circle').attr('class', 'toktrack');
  E.append('path').attr('class', 'tokarc');
  E.append('text').attr('class', 'tokt').attr('text-anchor', 'middle');
  E.append('g').attr('class', 'orbit');
  E.append('g').attr('class', 'moons');
  const lab = E.append('g').attr('class', 'label');
  lab.append('rect').attr('class', 'pill');
  lab.append('text').attr('class', 'name').attr('text-anchor', 'middle');
  E.append('text').attr('class', 'meta').attr('text-anchor', 'middle');
  E.append('g').attr('class', 'badgewrap');
  E.append('title');

  const spinning = render.spinning = new Set();
  gNodes.selectAll('g.node').each(function (d) {
    /* A node whose inputs did not change since the last update is skipped (rebuilding every node on every tree update is
       a long task); the spinning set still learns about it. */
    const R0 = nodeR(d), sig0 = nodeSig(d, R0);
    if (this.__sig === sig0) { if (d.state === 'working') { const lc0 = d.role === 'lead' ? leadColor(d.id) : null; spinning.add('w-' + (lc0 ? lc0.key : d.role)); } return; }
    this.__sig = sig0;
    const g = d3.select(this), R = R0, sc = STATE_C[d.state] || '#777';
    g.attr('class', `node ${d.state} r-${d.role} ${selected === d.id || (view === 'cc' && activeDesk === d.id) ? 'sel' : ''}${d.role === 'lead' && leadLit(d) ? ' lit' : ''}`);
    g.select('.halo').attr('r', R + 4).attr('stroke', sc);
    const busy = d.state === 'working';
    const lc = d.role === 'lead' ? leadColor(d.id) : null, gk = lc ? lc.key : d.role, bc = lc ? lc.c : ROLE_C[d.role];
    if (busy) spinning.add('w-' + gk);
    g.select('.body').attr('fill', busy ? `url(#w-${gk})` : bc ? `url(#g-${gk})` : '#777')
      .attr('fill-opacity', busy ? .8 : 1).attr('stroke', bc ? d3.hsl(bc).brighter(.45).formatHex() : '#999');
    g.selectAll('.body, .scan').attr('d', hexPath(R));
    g.select('.sheen').attr('d', sheenPath(R - 2.2));
    g.select('.brk').attr('d', bracketPath(R + 9));
    const k = (R * 1.05) / 24;
    if (d.id === 'brain') brainArt(g, R);
    {   // icon: centred on its own drawn box (the 24x24 artwork is not centred), scaled to one size, debossed in the body colour
      const ic = d.role === 'lead' || d.id === 'brain' ? null : iconFor(d), gi = g.select('.icon');
      gi.attr('display', ic ? null : 'none');
      if (ic) {
        const bb = icBox(ic), k = (R * .74) / Math.max(bb.width, bb.height, 1);
        const at = (dx, dy) => `translate(${dx - (bb.x + bb.width / 2) * k},${dy - (bb.y + bb.height / 2) * k}) scale(${k})`;
        // translucent dark groove = the body's own colour, a shade deeper; light catches the lower lip, shadow the upper one
        gi.selectAll('path').attr('d', ic).attr('vector-effect', 'non-scaling-stroke').style('stroke-width', '1.3px');
        gi.select('.ic-hi').attr('transform', at(.55, .65)).style('stroke', 'rgba(255,255,255,.26)');
        gi.select('.ic-sh').attr('transform', at(-.45, -.55)).style('stroke', 'rgba(0,0,0,.42)');
        gi.select('.ic').attr('transform', at(0, 0)).style('stroke', 'rgba(0,0,0,.30)');
      }
    }
    g.select('.ring').attr('d', hexPath(R + 3.5));
    g.select('.ring').attr('stroke', sc).attr('stroke-opacity', isPerson(d) ? .25 : d.state === 'idle' ? .55 : .95);
    const name = d.id === 'brain' ? 'BRAIN' : d.name;
    const t = g.select('.name').attr('y', R + 19);
    if (t.text() !== name) {
      t.text(name);
      const bb = t.node().getBBox();
      d._lw = bb.width / 2 + 8;
      g.select('.pill').attr('x', bb.x - 8).attr('y', bb.y - 3).attr('width', bb.width + 16).attr('height', bb.height + 6).attr('rx', (bb.height + 6) / 2);
    }
    g.select('.meta').attr('y', R + 33).text(metaText(d));
    const tk = tokP === 'off' || isPerson(d) ? null : tokOf(d.id);
    let frac = 0, col = TOK_C, txt = '';
    if (tk && tk.t) txt = fmtTok(tk.t) + ' tokens';
    const tr = R + 9;
    g.select('.toktrack').attr('r', tr).style('display', tokP === 'off' || isPerson(d) ? 'none' : null);
    g.select('.tokarc').attr('fill', col).attr('d', frac ? d3.arc()({ innerRadius: tr - .8, outerRadius: tr + .8, startAngle: 0, endAngle: Math.min(frac, .9999) * 2 * Math.PI }) : null);
    g.select('.tokt').attr('y', R + 46).attr('fill', col).text(txt);
    const tokTip = tk && tk.t ? `\n${fmtTok(tk.t)} tokens ${TOK_T[tokP] || ''}` : '';
    g.select('title').text(isPerson(d) ? d.name : `${d.name}\n${d.cwd || ''}\n${d.last || ''}` + tokTip);
    const bw = g.select('.badgewrap').selectAll('*').remove() && g.select('.badgewrap');
    if (d.state === 'login') {
      bw.append('rect').attr('x', -30).attr('y', -R - 24).attr('width', 60).attr('height', 16).attr('rx', 8).attr('fill', STATE_C.login);
      bw.append('text').attr('class', 'badge').attr('y', -R - 12.5).attr('text-anchor', 'middle').text('SIGN IN');
    }
    // a folded lead: everything under it orbits as dots, lit when working (click the lead to open them out)
    const moons = view === 'map' && !isOpen(d) && !['brain', 'front', 'topic'].includes(d.role) && !isPerson(d) ? moonsOf(d).sort((a, b) => (a.role > b.role) - (a.role < b.role) || (a.createdAt || 0) - (b.createdAt || 0)) : [];
    // moons always circle, a bit faster when something under them works; hover stops them
    const mg = g.select('.moons').classed('spinning', moons.length > 0).classed('fast', moons.some(moonBusy));
    const M = mg.selectAll('circle').data(moons, m => m.id);
    M.exit().remove();
    M.enter().append('circle')
      .on('mouseenter', (e, m) => moonTip(e, m)).on('mousemove', e => moonTip(e)).on('mouseleave', () => moonTip(null))
      .on('click', (e, m) => { e.stopPropagation(); moonTip(null); openDrawer(m.id); });
    const mr = R + 17;
    mg.selectAll('circle').each(function (m, i) {
      const a = (i / Math.max(moons.length, 1)) * Math.PI * 2 - Math.PI / 2, busy = moonBusy(m), bad = moonBad(m);
      d3.select(this).attr('cx', Math.cos(a) * mr).attr('cy', Math.sin(a) * mr)
        .attr('r', busy ? 3.6 : 2.8)   // plain size; the colour says what it is
        .attr('fill', busy ? STATE_C.working : '#5d6577').attr('opacity', busy ? 1 : .6)   // only working moons have colour, the rest are grey
        .classed('busy', busy).classed('bad', bad && !busy);   // glow: green = something under it works, red = needs attention
    });
    if (moons.length) {
      const all = subtreeOf(d.id), w = all.filter(m => m.state === 'working').length;
      g.select('title').text(`${d.name}\n${all.length} under it, ${w} working. Click to open them out.`);
    }
    // satellites = the agent's own built-in subagents
    // only helpers running right now (a finished one would linger as a faint dot nobody can read)
    const subs = (d.subagents || []).filter(s => s.active);
    const orbit = g.select('.orbit');
    const S = orbit.selectAll('circle').data(subs, s => s.id);
    S.exit().remove();
    S.enter().append('circle').attr('r', 3).attr('class', 'busy').append('title');
    orbit.selectAll('circle').each(function (s, i) {
      const a = (i / Math.max(subs.length, 1)) * Math.PI * 2;
      d3.select(this).attr('cx', Math.cos(a) * (R + 13)).attr('cy', Math.sin(a) * (R + 13))
        .attr('fill', ROLE_C.subagent)
        .select('title').text(`built-in helper, running · ${s.label}`);
    });
    orbit.classed('orbit', true).style('animation-play-state', subs.some(s => s.active) ? 'running' : 'paused');
  });

  if (window.drawTasks) drawTasks();   // task satellites (tasks-ui.js)
  if (hlId && !nodes[hlId]) highlight(null); else if (hlId) highlight(hlId);
  if (reshaped) sim.alpha(Math.max(sim.alpha(), .35)).restart(); else ticked(sim.alpha() < sim.alphaMin());
}

/** Hover: light up the node, the path up to Brain and everything below it; dim the rest. */
let hlId = null;
function highlight(id) {
  hlId = id;
  if (!id) { svg.classed('focus', false); gNodes.selectAll('g.node').classed('hl', false); gLinks.selectAll('path.link').classed('hl', false); return; }
  const keep = new Set([id]);
  let n = nodes[id]; while (n && n.parent && !keep.has(n.parent)) { keep.add(n.parent); n = nodes[n.parent]; }
  const kids = p => Object.values(nodes).filter(c => c.parent === p).forEach(c => { if (!keep.has(c.id)) { keep.add(c.id); kids(c.id); } });
  kids(id);
  svg.classed('focus', true);
  gNodes.selectAll('g.node').classed('hl', d => keep.has(d.id));
  gLinks.selectAll('path.link').classed('hl', l => keep.has(nodeOf(l.source).id) && keep.has(nodeOf(l.target).id));
}

/* hover card for an orbiting dot: who it is and what it is doing right now */
const tipEl = Object.assign(document.createElement('div'), { className: 'mtip', hidden: true });
document.body.append(tipEl);
function moonTip(e, m) {
  if (!e) { tipEl.hidden = true; return; }
  if (m) {
    const tk = tokOf(m.id);
    const doing = m.last;
    tipEl.innerHTML = `<b>${esc(m.name)}</b><small><i style="background:${STATE_C[m.state] || '#777'}"></i>${esc(m.role)} · ${esc(STATE_T[m.state] || m.state)}</small>`
      + (doing ? `<p>${esc(String(doing).slice(0, 220))}</p>` : '')
      + (() => { const k = subtreeOf(m.id); if (!k.length) return ''; const w = k.filter(c => c.state === 'working').length, b = k.filter(c => ['problem', 'offline', 'login'].includes(c.state)).length;
          return `<p>${k.length} under it${w ? `, ${w} working` : ''}${b ? `, ${b} need attention` : ''}</p>`; })()
      + (tk && tk.t ? `<em>${fmtTok(tk.t)} tokens ${TOK_T[tokP] || ''}</em>` : '')
      + `<span>click for details</span>`;
    tipEl.hidden = false;
  }
  const x = Math.min(e.clientX + 14, innerWidth - tipEl.offsetWidth - 8), y = Math.min(e.clientY + 14, innerHeight - tipEl.offsetHeight - 8);
  tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
}

/* a lead grows a little under the pointer so its orbiting dots are easier to reach */
function hoverScale(d, on) {
  d._st = on ? 1.14 : 1;
  if (d._sAnim) return;
  d._sAnim = true;
  (function step() {
    d._s = (d._s || 1) + ((d._st || 1) - (d._s || 1)) * .25;
    if (Math.abs(d._s - d._st) < .004) d._s = d._st;
    gNodes.selectAll('g.node').filter(x => x === d).attr('transform', `translate(${d.x},${d.y}) scale(${d._s})`);
    if (d._s !== d._st) requestAnimationFrame(step); else d._sAnim = false;
  })();
}

/* light = a map update with the same nodes and links while the simulation is cool: nothing moved, so only what the new
   data can change is redrawn (flows toward newly working agents, the branch aura) */
function ticked(light) {
  if (branch && nodes[branch.lead] && nodes[branch.lead].x != null) { const L = nodes[branch.lead]; gBack.selectAll('circle.branchaura').attr('cx', L.x + branch.cx).attr('cy', L.y + branch.cy).attr('r', branch.R + 30); }
  gFlow.selectAll('path.flow').attr('d', flowPath);
  if (light !== true) {
    gLinks.selectAll('path.link').attr('d', linkPath);
    gLinks.selectAll('path.mesh').attr('d', meshPath);
    drawPlugs(gLinks.selectAll('path.link').data());
    gNodes.selectAll('g.node').attr('transform', d => `translate(${d.x},${d.y})${d._s && d._s !== 1 ? ` scale(${d._s})` : ''}`);
  }
}

function fit(animate = true) {
  measure();
  const xs = (sim.nodes().length ? sim.nodes() : Object.values(nodes)).filter(n => n.x != null);   // what is on the map now
  if (!xs.length) return;
  const x0 = d3.min(xs, n => n.x) - 90, x1 = d3.max(xs, n => n.x) + 90, y0 = d3.min(xs, n => n.y) - 80, y1 = d3.max(xs, n => n.y) + 90;
  // touch tablet: keep the map out from under the topic-bubble column and the legend
  let iR = 0, iB = 0, iT = 0;
  if (matchMedia('(pointer:coarse) and (min-width:600px) and (max-width:1400px) and (min-height:500px)').matches) {
    const th = $('#topicHeads'); if (th && !th.hidden && th.offsetWidth) iR = th.offsetWidth + 16;
    iB = 56;
    const tb = $('#tokBar'); if (tb && tb.offsetHeight) iT = tb.offsetHeight + 16;
  } else if (matchMedia('(max-width:599px),(pointer:coarse) and (max-height:499px)').matches) {
    // phone: fit between the token bar and the lowest overlay above the tab bar, left of the zoom buttons
    const r = $('#map').getBoundingClientRect(), vis = s => { const e = $(s); return e && e.offsetHeight ? e.getBoundingClientRect() : null; };
    const tb = vis('#tokBar'); if (tb) iT = tb.bottom - r.top + 6;
    const lows = ['.legend', '#srv', '.mobnav'].map(vis).filter(b => b && b.top > r.top + r.height / 2).map(b => b.top);
    if (lows.length) iB = r.bottom - Math.min(...lows) + 6;
    iR = matchMedia('(max-height:499px)').matches ? 0 : 60;
  }
  const w = W - iR, h = H - iB - iT;
  const k = Math.min(1.4, Math.min(w / (x1 - x0), h / (y1 - y0)) * .92);
  const t = d3.zoomIdentity.translate(w / 2 - k * (x0 + x1) / 2, iT + h / 2 - k * (y0 + y1) / 2).scale(k);
  (animate ? svg.transition().duration(600) : svg).call(zoom.transform, t);
}
$('#zin').onclick = () => svg.transition().call(zoom.scaleBy, 1.3);
$('#zout').onclick = () => svg.transition().call(zoom.scaleBy, 1 / 1.3);
$('#zfit').onclick = () => fit();
// the legend folds to one line on phones; a tap opens or closes it
if ($('.legend')) $('.legend').onclick = e => { e.stopPropagation(); e.currentTarget.classList.toggle('open'); };
if ($('#zcomb')) { $('#zcomb').onclick = e => { e.stopPropagation(); setComb(!combOn); }; $('#zcomb').setAttribute('aria-pressed', combOn ? 'true' : 'false'); }
addEventListener('resize', () => { measure(); });
// turning a tablet changes the map's shape, so fit the map again once the new layout has settled
matchMedia('(orientation: portrait)').addEventListener('change', () => setTimeout(() => fit(true), 350));
svg.on('click', () => { closeDrawer(); if (focusLead && combActive()) { sfxPlay('close', 0); combDive(null); return; } if (focusLead) { focusLead = null; openSet.clear(); render(); setTimeout(() => fit(true), 700); } });

/* ================================================================ background neurons */
// Very faint drifting points that link up when close: a living backdrop behind the map. Stops when the tab is hidden.
// hidden tab or idle page: nothing decorative moves
const quiet = () => document.hidden || document.body.classList.contains('idle');
const bgfx = {}, idleTree = { t: null, timer: null };
(function neurons() {
  const c = $('#bgfx'), x = c.getContext('2d'); let P = [], w = 0, h = 0;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  function size() { const r = c.getBoundingClientRect(); w = r.width; h = r.height; c.width = w * dpr; c.height = h * dpr;
    P = Array.from({ length: Math.min(90, Math.round(w * h / 22000)) }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * .12, vy: (Math.random() - .5) * .12 })); }
  size(); addEventListener('resize', size);
  // A full-screen redraw every frame under many backdrop blurs costs a whole core.
  // Draw at ~15fps (the drift is slow, it looks the same) and not at all while the page is idle (body.idle).
  let last = 0;
  function tick(ts) {
    if (document.body.classList.contains('idle') || document.body.classList.contains('v-actions')) { bgfx.paused = true; return; }   // nor behind a full-screen view
    if (!reduce) requestAnimationFrame(tick);
    if (ts && ts - last < 66) return;
    const step = last ? Math.min((ts - last) / 16.7, 6) : 1; last = ts || 0;
    if (!document.hidden) {
      x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
      for (const p of P) { if (!reduce) { p.x += p.vx * step; p.y += p.vy * step; } if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < 0 || p.y > h) p.vy *= -1; }
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
        const a = P[i], b = P[j], dx = a.x - b.x, dy = a.y - b.y, q = dx * dx + dy * dy;
        if (q < 16000) { x.strokeStyle = `rgba(155,123,255,${.07 * (1 - q / 16000)})`; x.lineWidth = 1; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke(); }
      }
      x.fillStyle = 'rgba(160,190,255,.22)';
      for (const p of P) { x.beginPath(); x.arc(p.x, p.y, 1.1, 0, 7); x.fill(); }
    }
  }
  bgfx.resume = () => { if (bgfx.paused) { bgfx.paused = false; last = 0; requestAnimationFrame(tick); } };
  tick();
})();
/* Idle mode: after 90s without mouse/keys/touch the map holds still: CSS animations pause and the
   neuron canvas stops, so an open-but-unwatched tab costs ~nothing. Data still updates; any input wakes it. */
(function idleMode() {
  let t;
  const wake = () => {
    clearTimeout(t); t = setTimeout(() => { document.body.classList.add('idle'); svg.node().pauseAnimations(); }, 90000);
    if (document.body.classList.contains('idle')) {
      document.body.classList.remove('idle'); svg.node().unpauseAnimations(); bgfx.resume && bgfx.resume();
      if (idleTree.t) { const x = idleTree.t; idleTree.t = null; applyTree(x); }
    }
  };
  for (const e of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(e, wake, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  wake();
})();

/* ================================================================ floating topic bubbles
   Topics (subjects the concierge opened) float over the map instead of sitting in the tree. Body = topic colour,
   dimmed when idle; the dot is its state. Click opens its drawer; the chat stays with the desk. */
// each key gets its own colour from a rainbow, shown only while it is touched
const KEY_HUES = [8, 32, 48, 145, 190, 215, 268, 318];
const tkArm = { id: null, t: 0 };   // the key whose × was tapped once
function renderTopicHeads() {
  const box = $('#topicHeads');
  const tops = view === 'map' ? Object.values(nodes).filter(n => n.role === 'topic' && n.state !== 'stopped').sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)) : [];
  box.hidden = !tops.length;
  // phones (< 600 px): the bubbles fold into one dock button at the right edge
  const dock = $('#topicDock');
  dock.hidden = !tops.length; dock.querySelector('b').textContent = tops.length || '';
  dock.classList.toggle('working', tops.some(t => t.state === 'working'));
  if (!dock.onclick) dock.onclick = () => { const o = document.body.classList.toggle('tdock-open'); dock.setAttribute('aria-expanded', o); };
  if (!tops.length) document.body.classList.remove('tdock-open');
  const jobOf = id => window.jobOfTopic ? jobOfTopic(id) : null;   // the bubble's job card progress
  const sig = chatTo() + '#' + (tkArm.id || '') + '#' + tops.map(t => { const J = jobOf(t.id); return [t.id, t.name, t.state, t.care, J ? J.pct + J.status + J.stale : ''].join(':'); }).join('|');
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  const have = new Map([...box.children].map(el => [el.dataset.id, el]));
  for (const [id, el] of have) if (!tops.some(t => t.id === id)) el.remove();
  tops.forEach((t, i) => {
    let el = have.get(t.id);
    if (!el) {
      el = document.createElement('div'); el.className = 'thead'; el.dataset.id = t.id; el.tabIndex = 0; el.setAttribute('role', 'button');
      // piano keys: a key opens the topic as a branch in the chat; its drawer (terminal, stop) is the chat head's
      // terminal button
      el.innerHTML = '<span class="tb"><i class="tdot"></i></span><span class="tn"></span><span class="tx" role="button" tabindex="0">×</span>';
      // × closes the branch (stops the topic, like Kapat in the branch graph; it stays reopenable there for a week).
      // First tap arms it, a second within 4 s closes.
      el.querySelector('.tx').onclick = ev => {
        ev.stopPropagation(); clearTimeout(tkArm.t);
        if (tkArm.id !== t.id) { tkArm.id = t.id; tkArm.t = setTimeout(() => { tkArm.id = null; renderTopicHeads(); }, 4000); return renderTopicHeads(); }
        tkArm.id = null; el.classList.add('closing'); sfxPlay('tick'); setTimeout(() => branchAct('close', t.id).then(() => render()), 220);
      };
      el.onkeydown = ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === el) { ev.preventDefault(); el.click(); } };
      el.onclick = () => { document.body.classList.remove('tdock-open'); el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); sfxPlay('tick'); switchChat(t.id);
        // phones have no floating chat: the branch opens full screen in the Command center
        const coarse = matchMedia('(pointer:coarse)').matches, tablet = coarse && innerHeight >= 500 && innerWidth >= 600 && innerWidth <= 1400;
        if (view !== 'cc' && !tablet && (innerWidth <= 860 || (coarse && innerHeight < 500))) setView('cc');
        else if (view !== 'cc' && !chatUI.open) openChat(); };
      box.appendChild(el);
    }
    el.className = `thead ${t.state}${chatTo() === t.id ? ' sel' : ''}${tkArm.id === t.id ? ' armed' : ''}`;
    el.style.setProperty('--h', KEY_HUES[i % KEY_HUES.length]);
    const x = el.querySelector('.tx'), can = !!(me && me.admin);   // canClose() rule for a topic
    x.hidden = !can; x.textContent = tkArm.id === t.id ? 'Close?' : '×';
    x.title = tkArm.id === t.id ? 'Tap again to close this branch' : 'Close this branch (stops the topic; reopen it from the branch graph)';
    x.setAttribute('aria-label', `Close the ${t.name} branch`);
    el.querySelector('.tdot').style.background = STATE_C[t.state] || '#777';
    el.querySelector('.tn').textContent = t.name;
    const J = jobOf(t.id); let jb = el.querySelector('.tjob');
    if (J && !jb) { jb = document.createElement('span'); jb.className = 'tjob'; jb.innerHTML = '<i></i>'; el.appendChild(jb); }
    if (!J && jb) { jb.remove(); jb = null; }
    if (jb) { jb.className = 'tjob' + (J.stale ? ' stale' : J.status === 'waiting' ? ' wait' : ''); jb.firstChild.style.width = Math.max(4, J.pct) + '%'; }
    el.title = `${t.name} · topic · ${STATE_T[t.state] || t.state}${t.parent && nodes[t.parent] ? ' · under ' + nodes[t.parent].name : ''}${J ? `\n${J.id}: ${J.pct}%${J.last ? ' · last step: ' + J.last.text.slice(0, 80) : ''}` : ''}\nClick to talk to it as a branch.`;
    el.setAttribute('aria-label', `${t.name} topic, ${STATE_T[t.state] || t.state}`);
  });
}
function pingHead(id, color) {
  const el = document.querySelector(`#topicHeads .thead[data-id="${CSS.escape(id)}"] .tb`); if (!el) return;
  el.style.setProperty('--ping', color || '#ffffff');
  el.classList.remove('ping'); void el.offsetWidth; el.classList.add('ping');
}

/* ================================================================ neuron pulses */
function ancestors(id) { const a = []; let n = nodes[id]; while (n && a.length < 30) { a.push(n.id); n = nodes[n.parent]; } return a; }
function hops(from, to) {
  if (from === to || !nodes[from] || !nodes[to]) return [];
  if (comb && combActive() && comb.mesh.length) {   // honeycomb: shortest way cell to cell
    const f = shownAnc(from), t = shownAnc(to);
    if (f && t && f !== t) {
      const nb = comb.nb;
      const prev = new Map([[f, null]]), q = [f];
      while (q.length && !prev.has(t)) { const x = q.shift(); for (const y of nb.get(x) || []) if (!prev.has(y)) { prev.set(y, x); q.push(y); } }
      if (prev.has(t)) { const out = []; for (let y = t; prev.get(y); y = prev.get(y)) out.unshift([prev.get(y), y]); return out; }
    }
  }
  const A = ancestors(from), B = ancestors(to);
  const lca = A.find(x => B.includes(x));
  if (!lca) return [];
  const up = A.slice(0, A.indexOf(lca) + 1), down = B.slice(0, B.indexOf(lca)).reverse();
  const seq = [...up, ...down];
  const out = [];
  for (let i = 0; i < seq.length - 1; i++) out.push([seq[i], seq[i + 1]]);
  return out;
}
function linkEl(a, b) {
  if (comb && combActive()) {
    let m = gLinks.select(`path.mesh[data-id="${CSS.escape(a + '~' + b)}"]`).node(); if (m) return { el: m, rev: false };
    m = gLinks.select(`path.mesh[data-id="${CSS.escape(b + '~' + a)}"]`).node(); if (m) return { el: m, rev: true };
  }
  let el = gLinks.select(`path[data-id="${CSS.escape(a + '>' + b)}"]`).node();
  if (el) return { el, rev: false };
  el = gLinks.select(`path[data-id="${CSS.escape(b + '>' + a)}"]`).node();
  return el ? { el, rev: true } : null;
}
/* Sound: synapse-like whooshes when agents message each other, plus general UI and state sounds. Web Audio only, no
   files. Messages: a band-passed noise whoosh with a gliding tone, panned along the line they travel (spawn rises high,
   done rises, stop falls). Also: an agent starts working (soft blip up) or goes idle (blip down), something breaks (low
   thud), a new decision lands in Actions (two-note chime), a lead or branch opens/closes (pop), a click on a bubble
   (tick). Throttled so bursts are not a wall of noise; the speaker button in the top bar mutes all of it (remembered per browser). Browsers allow sound only
   after the first click or tap on the page. */
const sfx = { on: true, ctx: null, noise: null, recent: [] };
try { sfx.on = localStorage.getItem('cmd.sound') !== 'off'; } catch {}
function sfxCtx() {
  if (!sfx.ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    sfx.ctx = new AC();
    const n = sfx.ctx.createBuffer(1, sfx.ctx.sampleRate, sfx.ctx.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    sfx.noise = n; sfx.master = sfx.ctx.createGain(); sfx.master.gain.value = .2;
    // gentle top/bottom trim + a short filtered echo: sounds read as glass in a quiet room, never boomy or piercing
    const hp = sfx.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 140;
    const lp = sfx.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
    const comp = sfx.ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 4;
    sfx.master.connect(hp).connect(lp).connect(comp).connect(sfx.ctx.destination);
    sfx.dry = hp;   // after the echo: sounds that must not repeat (the Brain sparks) go in here
    const dl = sfx.ctx.createDelay(.5), fb = sfx.ctx.createGain(), wet = sfx.ctx.createGain(), dlp = sfx.ctx.createBiquadFilter();
    dl.delayTime.value = .11; fb.gain.value = .22; wet.gain.value = .16; dlp.type = 'lowpass'; dlp.frequency.value = 2600;
    sfx.master.connect(dl); dl.connect(dlp).connect(fb).connect(dl); dlp.connect(wet).connect(hp);
  }
  return sfx.ctx;
}
// pointerdown, plus touchend for older iOS Safari (it only unlocks audio on the end of a tap); 'interrupted' is iOS after a call or lock
const sfxUnlock = () => { if (sfx.on) { const c = sfxCtx(); if (c && c.state !== 'running' && c.state !== 'closed') c.resume().then(crkTick, () => {}); } };
for (const ev of ['pointerdown', 'touchend']) addEventListener(ev, sfxUnlock, { passive: true, capture: true });
/** Ready to make a sound now? (on, visible, audio unlocked, and not more than `max` sounds in the last 400 ms) */
function sfxGo(max = 4) {
  if (!sfx.on || reduce || document.visibilityState !== 'visible') return null;
  const c = sfxCtx(); if (!c || c.state !== 'running') return null;
  const t = performance.now(); sfx.recent = sfx.recent.filter(x => t - x < 400);
  if (sfx.recent.length >= max) return null; sfx.recent.push(t);
  return c;
}
const sfxPan = x => Math.max(-.9, Math.min(.9, (x || 0) / 650));
function sfxOut(c, pan0, pan1, now, end) {
  if (!c.createStereoPanner) return sfx.master;
  const p = c.createStereoPanner(); p.pan.setValueAtTime(pan0, now); p.pan.linearRampToValueAtTime(pan1 ?? pan0, end); p.connect(sfx.master); return p;
}
function whoosh(type, ms, x0, x1) {
  const c = sfxGo(); if (!c) return;
  const now = c.currentTime, dur = Math.max(.28, Math.min(.75, ms / 1000)), end = now + dur;
  const [f0, f1] = { spawn: [700, 2600], done: [500, 1500], stop: [1500, 380] }[type] || [420, 1900];
  const out = sfxOut(c, sfxPan(x0), sfxPan(x1), now, end);
  const src = c.createBufferSource(); src.buffer = sfx.noise; src.playbackRate.value = .9 + Math.random() * .2;   // the "fffiyuvv"
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.6;
  bp.frequency.setValueAtTime(f0, now); bp.frequency.exponentialRampToValueAtTime(f1, end);
  const g = c.createGain(); g.gain.setValueAtTime(.0001, now); g.gain.exponentialRampToValueAtTime(.9, now + dur * .35); g.gain.exponentialRampToValueAtTime(.0001, end);
  src.connect(bp).connect(g).connect(out); src.start(now, Math.random() * .5); src.stop(end + .02);
  tone(c, out, f0 * .5, f1 * .5, now, dur, .12, 'sine');   // a quiet glide under it, so it reads as a zip, not only air
}
function tone(c, out, f0, f1, at, dur, vol, type = 'sine') {
  const o = c.createOscillator(), g = c.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur);
  g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + Math.min(.03, dur * .3)); g.gain.exponentialRampToValueAtTime(.0001, at + dur);
  o.connect(g).connect(out); o.start(at); o.stop(at + dur + .02);
}
/** Short UI and state sounds: up/down (working/idle), thud (broke), chime (new decision), open/close (branch), tick (click). */
/** A short burst of filtered noise (the "air" in swipes and slides). */
function air(c, out, f0, f1, at, dur, vol, q = 2) {
  const src = c.createBufferSource(); src.buffer = sfx.noise;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, at); bp.frequency.exponentialRampToValueAtTime(f1, at + dur);
  const g = c.createGain(); g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + dur * .3); g.gain.exponentialRampToValueAtTime(.0001, at + dur);
  src.connect(bp).connect(g).connect(out); src.start(at, Math.random() * .5); src.stop(at + dur + .02);
}
/** Glass ping: two slightly detuned sines, the "futuristic" shimmer comes from the beat between them. */
function glass(c, out, f, at, dur, vol) { tone(c, out, f, f * 1.002, at, dur, vol); tone(c, out, f * 2.01, f * 2.0, at, dur * .6, vol * .35); }
/** Brain's sparks, a faint Tesla-coil crackle. A spark gap is
 *  a train of sharp broadband cracks; at 150-300 per second the ear hears that as a raspy, pitched "bzzzrrt", and the
 *  arc flickering makes it stutter. So each zap writes its own buffer: one tiny decaying crack per period (period
 *  jittered, pitch drifting), loudness jumping in uneven chunks with short dropouts, one harder crack at the strike.
 *  Dry (skips the echo), quiet, at most one per 1.6 s, about half the bolts, never on top of another sound. */
function zap(x, arc) {
  const t = performance.now();
  if (!anyBusy()) return;                                   // arcs sound only while work runs; idle belongs to the crickets
  if (t - (sfx.lastZap || 0) < 400) return;                   // any arc: at most one per 400 ms
  if (!arc && (t - (sfx.lastBrainZap || 0) < 1600 || Math.random() < .45)) return;
  const c = sfxGo(arc ? 3 : 1); if (!c || !sfx.dry) return;
  sfx.lastZap = t; if (!arc) sfx.lastBrainZap = t;
  console.debug(`[sfx] ${new Date().toISOString()} arc ${arc ? 'node' : 'brain'}`);
  const sr = c.sampleRate, len = arc ? .05 + Math.random() * .07 : .14 + Math.random() * .22, N = Math.floor(sr * len);
  const buf = c.createBuffer(1, N, sr), d = buf.getChannelData(0);
  const f0 = 150 + Math.random() * 120, f1 = f0 * (.8 + Math.random() * .5);
  let chunkEnd = 0, chunkAmp = 1;
  for (let pos = 0; pos < N;) {
    const p = pos / N;
    if (pos >= chunkEnd) {                                     // the arc flickers: uneven chunks, some nearly silent
      chunkEnd = pos + sr * (.008 + Math.random() * .035);
      chunkAmp = Math.random() < .18 ? .05 : .45 + Math.random() * .55;
    }
    const env = Math.min(1, p * 30) * (1 - Math.pow(p, 3));   // fast strike, tail fades
    const amp = chunkAmp * env * (.7 + Math.random() * .3);
    const crackLen = 6 + Math.floor(Math.random() * 18);       // a crack: 0.1-0.5 ms of decaying noise
    for (let k = 0; k < crackLen && pos + k < N; k++) d[pos + k] += (Math.random() * 2 - 1) * amp * Math.exp(-k / (crackLen / 3));
    const f = f0 + (f1 - f0) * p;
    pos += Math.max(1, Math.round(sr / f * (.85 + Math.random() * .3)));
  }
  for (let k = 0; k < 90 && k < N; k++) d[k] += (Math.random() * 2 - 1) * 1.1 * Math.exp(-k / 25);   // the strike
  const src = c.createBufferSource(); src.buffer = buf;
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 220;
  const pk = c.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 2400 + Math.random() * 1200; pk.Q.value = .8; pk.gain.value = 5;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
  const g = c.createGain(); g.gain.value = arc ? .026 : .035;      // master is .2 and bypassed here, so this is the real level
  let out = g;
  if (c.createStereoPanner) { const pn = c.createStereoPanner(); pn.pan.value = sfxPan(x); g.connect(pn); out = pn; }
  out.connect(sfx.dry);
  src.connect(hp).connect(pk).connect(lp).connect(g); src.start(c.currentTime);
}
/* Idle crickets: while nothing works, a
   faint field of two or three crickets: each a pure 4-5 kHz sine gated into 3-4 pulse chirps, at its own pitch, pan
   and pace, singing in bouts with long uneven rests so it never settles into a pattern. They share one gain that
   fades out in about a second when anything starts working (then the arcs above take over) and back in when all is
   idle again. Same mute button, same unlock; silent while the tab is hidden. */
const anyBusy = () => Object.values(nodes).some(n => n.state === 'working' && n.role !== 'you');
const crk = { on: false, bus: null, bugs: [
  { f: 4400, pan: -.45, vol: .03, gap: [.55, .8] },
  { f: 4780, pan: .4, vol: .022, gap: [.7, 1.05] },
  { f: 3980, pan: .05, vol: .016, gap: [.9, 1.4], shy: true },
] };
function crkChirp(c, b, at) {
  const o = c.createOscillator(), g = c.createGain(), n = Math.random() < .6 ? 3 : 4, f = b.f * (.99 + Math.random() * .02);
  o.frequency.setValueAtTime(f, at); o.frequency.linearRampToValueAtTime(f * .985, at + n * .036);   // a hair of droop per chirp
  g.gain.setValueAtTime(0, at);
  for (let k = 0; k < n; k++) {                                // one wing stroke: 14 ms pulse, soft edges, 22 ms apart
    const s = at + k * .036, v = b.vol * (k === n - 1 ? .7 : 1);
    g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(v, s + .004); g.gain.setValueAtTime(v, s + .01); g.gain.linearRampToValueAtTime(0, s + .014);
  }
  let out = crk.bus;
  if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = b.pan; p.connect(crk.bus); out = p; }
  o.connect(g).connect(out); o.start(at); o.stop(at + n * .036 + .03);
}
function crkTick() {
  const c = sfx.ctx;
  const want = !!(sfx.on && !reduce && document.visibilityState === 'visible' && c && c.state === 'running' && !anyBusy() && !(mapQuiet && mapQuiet.on));   // no crickets during quiet hours
  if (!c || c.state !== 'running') { crk.on = false; return; }
  if (!crk.bus) { crk.bus = c.createGain(); crk.bus.gain.value = 0; crk.bus.connect(sfx.master); }
  if (want !== crk.on) {
    crk.on = want;
    crk.bus.gain.cancelScheduledValues(c.currentTime); crk.bus.gain.setValueAtTime(crk.bus.gain.value, c.currentTime);
    crk.bus.gain.setTargetAtTime(want ? 1 : 0, c.currentTime, want ? .6 : sfx.on ? .3 : .04);   // in over ~2 s, out over ~1 s, mute at once
    console.debug(`[sfx] ${new Date().toISOString()} crickets ${want ? 'on' : 'off'}`);
  }
  if (!want) return;
  const now = c.currentTime;
  for (const b of crk.bugs) {
    if (!b.next || b.next < now) { b.next = now + .2 + Math.random() * 1.5; b.left = 0; }
    while (b.next < now + .45) {
      if (b.left <= 0) {                                      // between bouts: rest, then a bout of 5-14 chirps
        b.left = 5 + Math.floor(Math.random() * 10);
        b.next += (b.shy ? 5 : 1.5) + Math.random() * (b.shy ? 9 : 4.5);
        if (b.shy && Math.random() < .5) { b.left = 0; continue; }
      }
      crkChirp(c, b, b.next); b.left--;
      b.next += b.gap[0] + Math.random() * (b.gap[1] - b.gap[0]);
    }
  }
}
setInterval(crkTick, 200);
document.addEventListener('visibilitychange', crkTick);
/* The palette: short,
   quiet, soft attacks, no square waves, nothing over ~0.45 s except message whooshes. */
function sfxPlay(kind, x) {
  const c = sfxGo(['tick', 'select', 'swipe'].includes(kind) ? 6 : 4); if (!c) return;
  const now = c.currentTime, out = sfxOut(c, sfxPan(x), null, now, now + .6);
  switch (kind) {
    case 'select': glass(c, out, 1480, now, .09, .05); break;                                         // chips, toggles, picks
    case 'tick': tone(c, out, 2400, 2100, now, .03, .025); break;                                      // small buttons, links
    case 'swipe': air(c, out, 900, 3200, now, .11, .18, 1.4); tone(c, out, 700, 1100, now, .08, .025); break;   // tabs, views
    case 'confirm': glass(c, out, 880, now, .12, .07); glass(c, out, 1320, now + .07, .2, .06); break;           // send, save
    case 'dismiss': tone(c, out, 900, 520, now, .1, .045); air(c, out, 2400, 800, now, .1, .08); break;          // close
    case 'slidein': air(c, out, 500, 2200, now, .2, .14, 1.2); tone(c, out, 360, 620, now, .16, .035); break;    // drawer/panel opens
    case 'slideout': air(c, out, 2000, 500, now, .17, .1, 1.2); break;                                          // drawer/panel closes
    case 'open': tone(c, out, 330, 660, now, .12, .07); glass(c, out, 1320, now + .06, .14, .035); break;        // branch opens
    case 'close': tone(c, out, 660, 330, now, .12, .06); break;                                                 // branch folds
    case 'up': glass(c, out, 990, now, .12, .04); break;                                                         // agent starts working
    case 'down': tone(c, out, 700, 520, now, .14, .025); break;                                                  // agent goes idle
    case 'thud': tone(c, out, 220, 110, now, .26, .12, 'triangle'); tone(c, out, 330, 220, now + .08, .18, .04); break;  // something broke
    case 'chime': glass(c, out, 1046, now, .3, .07); glass(c, out, 1568, now + .13, .42, .06); break;           // new decision
    case 'notify': glass(c, out, 1240, now, .18, .045); break;                                                   // a toast
  }
}
/* Every click in the page gets its sound by what was clicked (the map's bubbles have their own in nodeClick). */
document.addEventListener('click', e => {
  const el = e.target.closest('button, a, summary, [role=tab], .achip, input[type=checkbox], input[type=radio], select');
  if (!el || el.disabled || el.closest('#map svg') || el.id === 'soundBtn' || el.id === 'dClose') return;   // dClose: closeDrawer plays its own
  const cls = el.className && typeof el.className === 'string' ? el.className : '';
  const x = (el.getBoundingClientRect().left + el.offsetWidth / 2 - innerWidth / 2) * 1.2;
  if (el.matches('[data-view], [role=tab], [data-tab], [data-ctab]')) sfxPlay('swipe', x);
  else if (/\b(asend|send)\b/.test(cls) || el.type === 'submit') sfxPlay('confirm', x);
  else if (/close|dClose|sClose/i.test(el.id) || el.getAttribute('aria-label') === 'Close') sfxPlay('dismiss', x);
  else if (el.matches('.achip, input[type=checkbox], input[type=radio], [aria-pressed], summary, .atog')) sfxPlay('select', x);
  else sfxPlay('tick', x);
}, true);
function setSound(on, quiet) {
  sfx.on = on; try { localStorage.setItem('cmd.sound', on ? 'on' : 'off'); } catch {}
  const b = $('#soundBtn'); if (b) { b.setAttribute('aria-pressed', String(on)); b.classList.toggle('muted', !on); b.title = on ? 'Sounds on (click to mute)' : 'Sounds off (click to turn on)'; }
  if (on && !quiet) { const c = sfxCtx(); if (c && c.state === 'suspended') c.resume(); setTimeout(() => whoosh('msg', 450, -300, 300), 60); }
  crkTick();   // mute or unmute the crickets now, not on the next tick
}
if ($('#soundBtn')) { $('#soundBtn').onclick = e => { e.stopPropagation(); setSound(!sfx.on); }; setSound(sfx.on, true); }
let sfxActOpen = null;   // last Actions count, so only a NEW decision chimes

function pulse(ev) {
  const from = ev.from, to = ev.to;
  const color = ev.type === 'spawn' ? '#9b7bff' : ev.type === 'done' ? '#46e08a' : ev.type === 'stop' ? '#ff5d5d' : '#ffffff';
  if (nodes[from] && nodes[from].role === 'topic') pingHead(from, color);
  const path = hops(from, to);
  if (reduce || !path.length) { flash(to, color, ev.text); return; }
  let i = 0;
  const step = () => {
    if (i >= path.length) { flash(to, color, ev.text); return; }
    const [a, b] = path[i++];
    const L = linkEl(a, b);
    if (!L) return step();
    const len = L.el.getTotalLength(), dur = Math.max(380, Math.min(800, len * 2.6));
    { const p0 = L.el.getPointAtLength(L.rev ? len : 0), p1 = L.el.getPointAtLength(L.rev ? 0 : len); whoosh(ev.type, dur, p0.x, p1.x); }
    const g = gFx.append('g').attr('class', 'pulse');
    const tail = [0, 1, 2, 3].map(k => g.append('circle').attr('r', 5 - k).attr('fill', color).attr('opacity', .9 - k * .2).attr('filter', 'url(#glow)'));
    const t0 = performance.now();
    (function frame(t) {
      const p = Math.min(1, (t - t0) / dur);
      tail.forEach((c, k) => {
        const q = Math.max(0, p - k * .035), at = (L.rev ? 1 - q : q) * len, pt = L.el.getPointAtLength(at);
        c.attr('cx', pt.x).attr('cy', pt.y);
      });
      if (p < 1) requestAnimationFrame(frame); else { g.remove(); step(); }
    })(t0);
  };
  step();
}
/* A short burst of jagged bolts around a node, reused from Brain's own art (brainBolts) but generic to any
   node: one burst when a message lands on a node, then a rare ambient one while it keeps working (see the
   interval below). Skips Brain (it already crackles constantly). */
function electrify(n, count) {
  if (reduce || n.id === 'brain' || !n || n.x == null || view !== 'map' || quiet()) return;
  const g = gNodes.selectAll('g.node').filter(d => d.id === n.id);
  if (g.empty()) return;
  const R = nodeR(n), bolts = g.select('.ebolts');
  const jag = (r1, r2, ang, spread) => {
    const steps = 6, pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, r = r1 + (r2 - r1) * t, aa = ang + (Math.random() - .5) * spread * (i && i < steps ? 1 : .2);
      pts.push([(r * Math.cos(aa)).toFixed(1), (r * Math.sin(aa)).toFixed(1)]);
    }
    return 'M' + pts.map(p => p.join(',')).join('L');
  };
  for (let c = 0; c < (count || (Math.random() < .35 ? 2 : 1)); c++) {
    const ang = Math.random() * Math.PI * 2;
    bolts.append('path').attr('class', 'bolt out').attr('d', jag(R * .55, R * (1.15 + Math.random() * .3), ang, .5));
    if (Math.random() < .5) bolts.append('path').attr('class', 'bolt thin').attr('d', jag(R * .7, R * 1.0, ang + .25, .4));
  }
  { const r = g.node().getBoundingClientRect(); zap((r.left + r.width / 2 - innerWidth / 2) * 1.2, true); }   // each arc jump crackles softly
  setTimeout(() => bolts.selectAll('path').remove(), 230 + Math.random() * 120);
}
// a child crossing LIT_MIN changes no state, so look again every 30 s and redraw only when a lead's lit flips
let litKey = '';
setInterval(() => {
  const k = Object.values(nodes).filter(n => n.role === 'lead' && leadLit(n)).map(n => n.id).join();
  if (k !== litKey) { litKey = k; if (!document.hidden) render(); }
}, 30000);
/* While a node stays in 'working' state, give it a rare spark so a long job still shows a sign of life
   between message pulses, rarer than Brain's own constant crackle: a working node sparks roughly once every 30-45s on average. */
setInterval(() => {
  if (reduce || document.hidden || view !== 'map') return;
  for (const id of shownIds) {
    const n = nodes[id];
    if (n && n.state === 'working' && n.id !== 'brain' && Math.random() < .13) electrify(n, 1);
  }
}, 5000);
function flash(id, color, text) {
  const n = nodes[id];
  if (n && n.role === 'topic') return pingHead(id, color);
  if (n && view === 'map' && !shownIds.has(id)) { const a = shownAnc(id); if (a && a !== id) return flash(a, color, text ? `${n.name}: ${text}` : text); }
  if (!n || n.x == null) return;
  const R = nodeR(n);
  electrify(n);
  const c = gFx.append('circle').attr('cx', n.x).attr('cy', n.y).attr('r', R).attr('fill', 'none').attr('stroke', color).attr('stroke-width', 3).attr('opacity', .9);
  c.transition().duration(900).attr('r', R + 26).attr('opacity', 0).remove();
  if (text) {
    // one caption per node, at most two on the map: stacked captions turned into unreadable overprinted text
    gFx.selectAll('text.caption').filter(function () { return this.dataset.id === id; }).interrupt().remove();
    const old = gFx.selectAll('text.caption').nodes(); old.slice(0, Math.max(0, old.length - 1)).forEach(e => d3.select(e).interrupt().remove());
    const t = gFx.append('text').attr('class', 'caption').attr('data-id', id).attr('x', n.x).attr('y', n.y - R - 34).attr('text-anchor', 'middle')
      .text(text.length > 70 ? text.slice(0, 68) + '…' : text).attr('opacity', 0);
    t.transition().duration(250).attr('opacity', 1).transition().delay(3200).duration(600).attr('opacity', 0).remove();
  }
}

function feedItem(ev, quiet) {
  const name = id => nodes[id] ? nodes[id].name : id === 'you' ? 'You' : id;
  const verb = { spawn: 'started', msg: '→', done: 'finished, reports to', stop: 'stopped' }[ev.type] || '→';
  const el = document.createElement('div');
  el.className = 'ev';
  const head = ev.type === 'spawn' ? `<b>${esc(name(ev.from))}</b> started <b>${esc(name(ev.to))}</b>`
    : ev.type === 'done' ? `<b>${esc(name(ev.from))}</b> ✓ done`
    : ev.type === 'stop' ? `<b>${esc(name(ev.to))}</b> stopped`
    : ev.type === 'care' ? `<b>${esc(name(ev.from))}</b> 🧹`
    : `<b>${esc(name(ev.from))}</b> ${verb} <b>${esc(name(ev.to))}</b>`;
  el.innerHTML = head + (ev.text && ev.type !== 'stop' ? `<div class="t">${esc(ev.text)}</div>` : '');
  const f = $('#feed'); reportStackEl();
  f.prepend(el);
  while (f.children.length > 4) f.lastChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 500); }, quiet ? 4000 : TOAST_MS);
}

/* ================================================================ chat rendering */
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function inline(s) {
  return s.replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
}
/* md() runs over the whole chat on every poll, so its result is cached by text. */
const mdCache = new Map();
function md(text) {
  const k = String(text || ''), hit = mdCache.get(k); if (hit !== undefined) return hit;
  const h = mdRaw(k); if (mdCache.size > 800) mdCache.delete(mdCache.keys().next().value); mdCache.set(k, h); return h;
}
function mdRaw(text) {
  const parts = String(text).split(/```[a-z]*\n?/);
  let html = '';
  parts.forEach((p, i) => {
    if (i % 2) { html += `<pre><code>${esc(p.replace(/\n$/, ''))}</code></pre>`; return; }
    const lines = esc(p).split('\n');
    let list = null, table = null;
    const close = () => { if (list) { html += `</${list}>`; list = null; } if (table) { html += '</table>'; table = null; } };
    for (const raw of lines) {
      const l = raw.trimEnd();
      if (/^\s*\|.*\|\s*$/.test(l)) {
        if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) continue;
        if (!table) { close(); html += '<table>'; table = true; }
        html += '<tr>' + l.trim().slice(1, -1).split('|').map(c => `<td>${inline(c.trim())}</td>`).join('') + '</tr>';
        continue;
      }
      let m;
      if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; continue; }
      if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; continue; }
      close();
      if (!l.trim()) continue;
      if ((m = l.match(/^#{1,6}\s+(.*)/))) { html += `<p><b>${inline(m[1])}</b></p>`; continue; }
      html += `<p>${inline(l)}</p>`;
    }
    close();
  });
  return html;
}
const ago = ts => { if (!ts) return ''; const s = (Date.now() - ts) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + 'm ago' : s < 86400 ? Math.round(s / 3600) + 'h ago' : s < 86400 * 45 ? Math.round(s / 86400) + 'd ago' : new Date(ts).toLocaleDateString(); };

/* The chat hides the hub's delivery text by default. What an agent receives is untouched; this is display only.
   "Raw" in the chat header shows it raw again.
   Hidden: the "New message ... via the cmd hub, handle it:" lead line, <pasted_content> tags, <system-reminder> blocks,
   "📨 from <name> [<id>]:" headers (the sender becomes the bubble name), "(reply with: ...)" footers, "[hub] ..." blocks
   (held FYIs, "since your last turn") and Claude Code's mid-turn note. The message body itself is never changed. */
let sysRaw = false;
try { sysRaw = localStorage.getItem('cmdSysRaw') === '1'; } catch {}
let innerOpen = false;   // "Internal traffic" on = agent messages drawn open, not folded to one line
try { innerOpen = localStorage.getItem('cmdInner') === '1'; } catch {}
const { cleanMsg } = window.ChatClean;   // chat-clean.js (shared with its tests)
function renderChat(box, msgs, localPending, emptyText, busy, queued) {
  box._chatArgs = [msgs, localPending, emptyText, busy, queued];
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
  const tid = box.id === 'dMsgs' ? selected : chatTo(), toName = tid && me && tid === me.desk ? 'Concierge' : uiName((nodes[tid] || {}).name || tid || '');
  const sig = (sysRaw ? 'R' : '') + (innerOpen ? 'I' : '') + (box.dataset.all ? 'A' : '') + msgs.length + '|' + (msgs.length ? msgs[msgs.length - 1].text.length : 0) + '|' + localPending.length + '|' + (busy ? 1 : 0) + '|' + ((queued && queued.note) || '');
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  let html = '', steps = [];
  // while the agent works, the last group of steps says what it is doing now
  const flushSteps = (last) => {
    if (!steps.length) return;
    const now = last && busy ? `⏳ working · ${esc(steps[steps.length - 1].slice(0, 110))}` : `${steps.length} step${steps.length > 1 ? 's' : ''} · ${esc(steps[steps.length - 1].split(':')[0])}`;
    html += `<details class="steps"><summary>${now}</summary>${steps.map(s => `<div>${esc(s)}</div>`).join('')}</details>`;
    steps = [];
  };
  // only the last 50 messages are built; "older messages" shows the rest
  const all = +(box.dataset.all || 0), cut = all ? 0 : Math.max(0, msgs.length - 50);
  if (cut) html += `<button type="button" class="chat-more">⬆ older messages (${cut})</button>`;
  for (const m of cut ? msgs.slice(cut) : msgs) {
    if (m.role === 'tool') { steps.push(m.text); continue; }
    flushSteps();
    for (const c of sysRaw || (m.role !== 'user' && m.role !== 'agent') ? [m] : cleanMsg(m)) {
      if (c.role === 'agent') {
        // agent-to-agent traffic is one line "✉ X → Concierge"; a tap (or "Internal traffic") opens it
        const pv = c.text.replace(/^FYI:\s*/i, '').replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim();
        html += `<details class="msg agent ifold"${innerOpen ? ' open' : ''}><summary><span class="ito">✉ <b>${esc(uiName(c.from))}</b> → ${esc(toName)}</span><span class="ipv">${esc(pv.slice(0, 140))}</span><span class="itime">${ago(c.ts)}</span></summary><div class="ibody">${md(c.text)}</div></details>`;
      }
      else html += `<div class="msg ${c.role}${c.error ? ' err' : ''}">${c.role === 'user' ? `<p>${userHtml(c.text)}</p>` : md(c.text)}<div class="time">${ago(c.ts)}</div></div>`;
    }
  }
  const tail = steps.length > 0;
  flushSteps(true);
  if (busy && !tail && msgs.length) html += `<details class="steps"><summary>⏳ working…</summary></details>`;
  // a message the hub holds in its queue says why and until when, not an endless "sending…"
  for (const p of localPending) html += `<div class="msg user pending"><p>${userHtml(p)}</p><div class="time">${queued && queued.note && queued.list.includes(p) ? esc(queued.note) : 'sending…'}</div></div>`;
  box.innerHTML = html || `<div class="empty">${emptyText}</div>`;
  if (atBottom || localPending.length) box.scrollTop = box.scrollHeight;
}

/* ================================================================ concierge */
const frontPending = [];
async function pollFront() {
  try {
    const target = chatTo(); if (!target) return;
    /* ETag (304 when nothing changed) and ?since= (only new messages) keep polling cheap. */
    const box = $('#frontMsgs');
    let C = pollFront.c && pollFront.c.target === target ? pollFront.c : null;
    if (!C) { C = pollFront.c = { target, msgs: null }; box.dataset.all = ''; }
    if (!box.dataset.sig) C.etag = null;   // the box was cleared: draw it again even if nothing changed
    const qs = C.msgs ? `?since=${C.a != null ? C.a : C.msgs.length}&h=${encodeURIComponent(C.h || '')}` : '';
    const r = await fetch('/api/chat/' + target + qs, { cache: 'no-store', headers: C.etag && C.msgs ? { 'If-None-Match': C.etag } : {} });
    if (r.status === 401) { location.href = '/login'; return; }
    if (target !== chatTo()) return;
    C.busy = false;
    if (r.status === 304) { C.busy = C.lastBusy; return; }
    if (!r.ok) return;
    const d = await r.json();
    C.msgs = d.since != null && C.msgs ? C.msgs.slice(0, d.since).concat(d.messages) : d.messages;
    C.etag = r.headers.get('ETag'); C.h = d.h; C.a = d.a; C.lastBusy = C.busy = !!d.busy;
    const j = { messages: C.msgs, queued: d.queued || [], queuedNote: d.queuedNote || '' };
    // the hub may put a note in front of a message ([hub] …), so "arrived" means the text is inside a recent user turn
    const userTexts = j.messages.filter(m => m.role === 'user').slice(-20).map(m => m.text);
    for (let i = frontPending.length - 1; i >= 0; i--) if (userTexts.some(u => u.includes(frontPending[i].trim()))) frontPending.splice(i, 1);
    const queued = (j.queued || []);
    const assistantMsgs = j.messages.filter(m => m.role === 'assistant');
    const lastA = assistantMsgs.length;
    if (pollFront.seen !== undefined && lastA > pollFront.seen) {
      if (view !== 'cc' && !chatUI.open) fab.classList.add('unread');
      // pop a card when a reply lands, so it's not lost in the scrollback if you're looking elsewhere.
      const latest = assistantMsgs[assistantMsgs.length - 1];
      const looking = nodes[target] && nodes[target].role === 'lead' && (view === 'cc' || chatUI.open);   // its branch is open on screen
      if (latest && latest.text && !looking) pushReportCard(target, (nodes[target] && nodes[target].name) || '', latest.text);
    }
    pollFront.seen = lastA;
    renderChat($('#frontMsgs'), j.messages, [...queued.filter(q => !frontPending.includes(q)), ...frontPending],
      nodes[target] && nodes[target].role === 'lead' ? `This is the <b>${esc(nodes[target].name)}</b> branch. What you write here goes straight to its lead; its answers show here, and your concierge gets a copy.` : nodes[target] && nodes[target].role === 'topic' ? `This is the <b>${esc(nodes[target].name)}</b> bubble. It is starting up with what you said at the desk; keep talking here.` : target === (me && me.desk) ? 'Say hi to your concierge. It answers quick questions and hands real work to Brain.<br><br>Try: <i>“Check the status of the docs site build”</i>' : 'No conversation yet.',
      !!(nodes[target] && nodes[target].role !== 'front' && nodes[target].state === 'working'), { list: queued, note: j.queuedNote || '' });
  } catch {}
}
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#frontMsgs .chat-more'); if (b) { $('#frontMsgs').dataset.all = 1; pollFront.redraw(); } });
pollFront.redraw = () => { $('#frontMsgs').dataset.sig = ''; if (pollFront.c) pollFront.c.etag = null; pollFront(); };
/* Poll pace: 2 s while the agent works or a message is on its way, 15 s when idle, nothing while the tab is hidden
   (one pull as soon as it is shown again). */
(function frontLoop() {
  const busy = (pollFront.c && pollFront.c.busy) || frontPending.length || (nodes[chatTo()] && nodes[chatTo()].state === 'working') || Date.now() - (pollFront.sentAt || 0) < 60000;
  if (!document.hidden) pollFront();
  setTimeout(frontLoop, busy ? 2000 : 15000);
})();
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollFront(); });

function autosize(t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 180) + 'px'; }
function bindComposer(form, input, onSend) {
  input.addEventListener('input', () => autosize(input));
  // iPad: the bottom nav pill pops up oddly over the keyboard when typing, so hide it while a composer is focused
  // (no viewport/height math).
  input.addEventListener('focus', () => document.body.classList.add('kb-open'));
  input.addEventListener('blur', () => document.body.classList.remove('kb-open'));
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = input.value.trim(); if (!text && !(form === $('#frontForm') && att.length)) return;
    input.value = ''; autosize(input);
    try { await onSend(text); } catch (err) { alertBubble(err.message); input.value = text; }
  });
}
/* Files and images in the chat: the 📎 button, paste (a copied screenshot) or drop on the chat.
   Each file goes to /api/upload first; the message then carries one "📎 name: <dataDir>/uploads/…" line per file,
   a path the agent can open with Read. Those lines show as a thumbnail (images) or a link in the chat. */
const att = [];
function addFiles(list) {
  for (const f of list) {
    if (f.size > 25 * 1024 * 1024) { alertBubble(`${f.name}: larger than 25 MB`); continue; }
    if (att.length >= 10) { alertBubble('At most 10 files per message'); break; }
    const name = f.name && f.name !== 'image.png' ? f.name : 'pasted-' + new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-') + '.' + ((f.type.split('/')[1] || 'png').replace('jpeg', 'jpg'));
    att.push({ file: f, name, img: /^image\//.test(f.type) ? URL.createObjectURL(f) : null });
  }
  drawAtt();
}
function drawAtt() {
  const row = $('#frontAtt'); row.hidden = !att.length;
  row.innerHTML = att.map((a, i) => `<span class="attchip">${a.img ? `<img src="${a.img}" alt="">` : '<i>📄</i>'}<b>${esc(a.name)}</b><small>${fmtSize(a.file.size)}</small><button type="button" data-i="${i}" aria-label="Remove">×</button></span>`).join('');
  row.querySelectorAll('button').forEach(b => b.onclick = () => { const [a] = att.splice(+b.dataset.i, 1); if (a.img) URL.revokeObjectURL(a.img); drawAtt(); });
}
const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
async function uploadAtt() {
  const lines = [];
  for (const a of att) {
    const r = await fetch('/api/upload?name=' + encodeURIComponent(a.name), { method: 'POST', body: a.file, headers: { 'content-type': a.file.type || 'application/octet-stream' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${a.name}: ${j.error || r.statusText}`);
    lines.push(`📎 ${j.name} (${a.file.type || 'file'}, ${fmtSize(j.size)}): ${j.path}`);
  }
  for (const a of att) if (a.img) URL.revokeObjectURL(a.img);
  att.length = 0; drawAtt();
  return lines;
}
$('#frontAttBtn').onclick = () => $('#frontFile').click();
$('#frontFile').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
$('#frontInput').addEventListener('paste', e => {
  const files = [...(e.clipboardData && e.clipboardData.files || [])];
  if (files.length) { e.preventDefault(); addFiles(files); }
});
{ const pane = $('#chatPane');
  pane.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); pane.classList.add('dropping'); } });
  pane.addEventListener('dragleave', e => { if (!pane.contains(e.relatedTarget)) pane.classList.remove('dropping'); });
  pane.addEventListener('drop', e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); pane.classList.remove('dropping'); addFiles(e.dataTransfer.files); });
}
// a user message's 📎 lines -> thumbnail / link
function userHtml(text) {
  // Claude Code wraps long typed-in messages as <pasted_content id="…">; that is delivery plumbing, not what the person wrote
  text = String(text).replace(/<\/?pasted_content[^>]*>\n?/g, '').replace(/\n?\(attached files?; open (?:it|them) with Read\)/g, '').trim();
  return esc(text).replace(/📎 ([^\n]*?): \S*?\/uploads\/(\d{4}-\d\d-\d\d)\/([^\s<]+)/g, (all, label, day, file) => {
    const u = `/api/upload/${day}/${encodeURIComponent(file)}`;
    return /\.(png|jpe?g|gif|webp)$/i.test(file) ? `<a class="attimg" href="${u}" target="_blank" rel="noopener"><img src="${u}" alt="${label}" loading="lazy"></a>` : `<a class="attfile" href="${u}">📎 ${label}</a>`;
  }).replace(/\n/g, '<br>');
}
bindComposer($('#frontForm'), $('#frontInput'), async text => {
  if (att.length) {
    const lines = await uploadAtt();
    text = (text ? text + '\n\n' : '') + lines.join('\n') + '\n(attached ' + (lines.length > 1 ? 'files; open them' : 'file; open it') + ' with Read)';
  }
  frontPending.push(text); pollFront.sentAt = Date.now();
  $('#frontMsgs').insertAdjacentHTML('beforeend', `<div class="msg user pending"><p>${userHtml(text)}</p><div class="time">sending…</div></div>`);
  $('#frontMsgs').scrollTop = $('#frontMsgs').scrollHeight; pollFront();
  const to = chatTo();
  const r = await post('/api/send', to === activeDesk ? { to, text } : { to, text, branch: true });
  if (r && r.moved) followMoved(r.moved);
});
/** A message typed in one bubble was about another subject and went to that bubble: follow it there. */
function followMoved(mv) {
  if (!mv || followMoved.last === mv.to + mv.from && Date.now() - followMoved.at < 5000) return;
  followMoved.last = mv.to + mv.from; followMoved.at = Date.now();
  const fromName = nodes[mv.from] ? nodes[mv.from].name : 'that';
  const go = () => { if (chatTo() === mv.from || !nodes[mv.from]) { frontPending.length = 0; switchChat(mv.to); } };
  if (nodes[mv.to]) go(); else setTimeout(go, 2500);   // a new bubble shows up with the next tree
  alertBubble(`Moved to the ${mv.name} bubble (it is not about ${fromName})`);
}
function alertBubble(msg) { sfxPlay('notify'); addNote('CMD', undefined, msg); const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = msg; document.body.append(el); setTimeout(() => el.classList.add('out'), TOAST_MS - 400); setTimeout(() => el.remove(), TOAST_MS); }

/* Replies get lost in the chat scrollback, so pop the reply as a card that stays on screen until you act on
   it (minimize, close, or jump into the conversation), instead of a toast that fades on its own. */
function reportStackEl() {
  let el = document.getElementById('reportStack');
  if (!el) { el = document.createElement('div'); el.id = 'reportStack'; el.className = 'report-stack'; document.body.append(el); el.append($('#feed')); }
  return el;
}
// iPad landscape: the cards line up with the topic bubbles, in the same column. Their right edge is
// the bubbles' right edge; if the bubbles are wider than a card, the card widens so both edges match.
const ipadLand = matchMedia('(pointer:coarse) and (min-width:600px) and (max-width:1400px) and (min-height:500px) and (orientation:landscape)');
function alignReports() {
  const st = document.getElementById('reportStack'); if (!st) return;
  const th = [...document.querySelectorAll('.topicheads .thead')].map(e => e.getBoundingClientRect()).filter(r => r.width);
  if (!ipadLand.matches || !th.length) { st.style.right = st.style.left = st.style.width = ''; return; }
  const l = Math.min(...th.map(r => r.left)), r = Math.max(...th.map(r => r.right));
  st.style.left = 'auto'; st.style.right = Math.max(8, innerWidth - r) + 'px';
  st.style.width = r - l > 260 ? (r - l) + 'px' : '';
}
addEventListener('resize', alignReports);
function pushReportCard(targetId, name, text) {
  sfxPlay('notify');
  addNote(name, targetId, text);
  const stack = reportStackEl();
  alignReports();
  const card = document.createElement('div');
  card.className = 'report-card';
  // The desk writes a plain first paragraph (what happened, what it means for you, anything you need to do) and the details after a blank line.
  const paras = String(text).trim().split(/\n\s*\n/), sum = paras[0], rest = paras.slice(1).join('\n\n');
  card.innerHTML = `<div class="rc-head"><b>${esc(name)}</b><span class="rc-time">${esc(ago(Date.now()))}</span>
      <div class="rc-x"><button class="rc-min" title="Minimise" aria-label="Minimise">–</button><button class="rc-close" title="Close" aria-label="Close">×</button></div></div>
    <div class="rc-body"><div class="rc-sum">${md(sum)}</div>${rest ? `<details class="rc-det"><summary>Details</summary><div class="rc-more">${md(rest)}</div></details>` : ''}</div>
    <form class="rc-reply"><textarea rows="1" placeholder="Write a reply, continue here…" aria-label="Reply"></textarea><button class="rc-send" type="submit" aria-label="Send">Send</button></form>
    <div class="rc-foot"><button class="ghost sm rc-go">Open in chat →</button></div>`;
  card.querySelector('.rc-head').addEventListener('click', e => { if (e.target.closest('button')) return; card.classList.toggle('min'); });
  card.querySelector('.rc-min').onclick = () => card.classList.toggle('min');
  card.querySelector('.rc-close').onclick = () => card.remove();
  const goChat = () => { switchChat(nodes[targetId] && isBranch(nodes[targetId]) ? targetId : null); if (view !== 'cc') openChat(); };
  card.querySelector('.rc-go').onclick = () => { goChat(); card.remove(); };
  const form = card.querySelector('.rc-reply'), ta = form.querySelector('textarea');
  ta.addEventListener('input', () => autosize(ta));
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const t = ta.value.trim(); if (!t) return;
    ta.disabled = true;
    try {
      await post('/api/send', { to: targetId, text: t });
      if (targetId === chatTo()) { frontPending.push(t); pollFront.sentAt = Date.now(); pollFront(); }
      form.outerHTML = `<div class="rc-sent">✓ Sent: ${esc(t.length > 120 ? t.slice(0, 117) + '…' : t)}</div>`;
      setTimeout(() => card.classList.add('min'), 1500);
    } catch (err) { ta.disabled = false; alertBubble(err.message); }
  });
  // compact cards; tapping the summary opens reply/details (hover does it on desktop)
  card.querySelector('.rc-body').addEventListener('click', e => { if (e.target.closest('a,summary,button,textarea')) return; card.classList.toggle('open'); });
  // notes that need no answer fade on their own; a card that waits on the person stays.
  // After TOAST_MS a routine card closes and a card that waits on you folds to its one-line head;
  // both stay in the notification center (bell).
  const routine = isRoutine(text);
  if (routine) card.classList.add('routine');
  let left = TOAST_MS;
  const tick = setInterval(() => {
    if (!card.isConnected) return clearInterval(tick);
    if (card.matches(':hover,:focus-within,.open')) return;
    if ((left -= 1000) > 0) return;
    clearInterval(tick);
    if (routine) { card.classList.add('out'); setTimeout(() => card.remove(), 400); } else card.classList.add('min');
  }, 1000);
  stack.prepend(card);
  const cs = stack.querySelectorAll('.report-card'); for (let i = 6; i < cs.length; i++) cs[i].remove();
}
const TOAST_MS = 6000;
// A short status note with no ask and no problem in it ("all healthy", "FYI: …", "no change") is information and
// fades after TOAST_MS; a card stays only when it waits on the person (a question, a decision, an OK, a warning).
function isRoutine(text) {
  return !/\?|need(s|ed)? (you|your|an? (answer|ok|decision|reply))|decide|decision|approve|approval|confirm|warning|urgent|⚠|❌/i.test(String(text));
}

function updateFrontHead() {
  const f = nodes[chatTo()]; if (!f) return;
  const mine = me && f.id === me.desk, topic = f.role === 'topic', lead = f.role === 'lead';
  renderBranches();
  const oc = topic || lead ? ROLE_C[f.role] : '';
  $('#chatPane .orb').style.background = oc; $('#chatPane .orb').style.color = oc;
  $('#frontName').textContent = topic || lead ? f.name : mine ? 'Your concierge' : f.name;
  $('#frontState').textContent = `${STATE_T[f.state] || f.state}${f.last && f.state === 'working' ? ' · ' + f.last : ''}`;
  $('#frontInput').placeholder = lead ? `Write to the ${f.name} lead…` : topic ? `Talk about ${f.name}…` : mine ? 'Ask, or give a task…' : `Message this desk as ${me && me.admin ? 'the admin' : me.name}…`;
  $('#frontTerm').hidden = !(me && (me.admin || me.perms.terminal));
  const n = $('#frontNotice');
  if (f.state === 'login') { n.hidden = false; n.innerHTML = me.admin ? `This desk's Claude account isn't signed in. Open <b>Settings</b> to sign it in.` : 'The concierge is not ready yet. An admin has been asked to sign it in.'; }
  else if (f.state === 'offline' || f.state === 'stopped') { n.hidden = false; n.textContent = lead ? 'This lead is not running right now.' : topic ? 'This bubble is not running right now.' : 'This concierge is not running right now.'; }
  else if (f.state === 'starting') { n.hidden = false; n.textContent = topic ? `Opening the ${f.name} bubble…` : 'Concierge is waking up…'; }
  else n.hidden = true;
}
$('#frontTerm').onclick = () => openDrawer(chatTo(), 'term');
// "Raw" off (default) = clean chat; on = the raw text the agent received. Remembered per browser.
function sysRawSync() { document.querySelectorAll('.sysraw').forEach(b => b.setAttribute('aria-pressed', sysRaw ? 'true' : 'false')); }
$('#dSysRaw').onclick = $('#sysRawBtn').onclick = () => {
  sysRaw = !sysRaw; sysRawSync();
  try { localStorage.setItem('cmdSysRaw', sysRaw ? '1' : '0'); } catch {}
  for (const id of ['#frontMsgs', '#dMsgs']) { const b = $(id); if (b && b._chatArgs) renderChat(b, ...b._chatArgs); }
};
sysRawSync();
function innerSync() { document.querySelectorAll('.innerbtn').forEach(b => b.setAttribute('aria-pressed', innerOpen ? 'true' : 'false')); }
document.querySelectorAll('.innerbtn').forEach(b => b.onclick = () => {
  innerOpen = !innerOpen; innerSync();
  try { localStorage.setItem('cmdInner', innerOpen ? '1' : '0'); } catch {}
  for (const id of ['#frontMsgs', '#dMsgs']) { const x = $(id); if (x && x._chatArgs) { x.dataset.sig = ''; renderChat(x, ...x._chatArgs); } }
});
innerSync();

/* conversation branches, like git branches: the desk is the main
   line, the leads and topic bubbles of the existing tree are the branches. Picking one shows that agent's own thread and
   the composer writes to it directly; the hub hands the desk a copy (deskNotes), so the desk never has to relay. */
const isBranch = n => n && (n.role === 'topic' || (n.role === 'lead' && canLeadBranch()));
const canLeadBranch = () => !!(me && (me.admin || (me.perms && me.perms.talk)));   // same rule as /api/send
function switchChat(id) {
  chatTarget = id && isBranch(nodes[id]) ? id : null;
  if (chatTarget && hiddenTabs.delete(chatTarget)) saveHiddenTabs();
  if (chatTarget && nodes[chatTarget].role === 'lead' && !leadTabs.includes(chatTarget)) { leadTabs.push(chatTarget); saveLeadTabs(); }
  frontPending.length = 0; $('#frontMsgs').dataset.sig = ''; $('#frontMsgs').innerHTML = ''; pollFront.seen = undefined;
  // On a narrow screen (iPad/phone) don't auto-open the floating chat panel just because a bubble was switched.
  // Tapping a bubble still switches which conversation is loaded; the chat bubble/FAB is how you open it on purpose.
  if (view !== 'cc' && !chatUI.open && innerWidth > 860) openChat();
  if (ctab !== 'chat') { ctab = 'chat'; placeLive(); }
  updateFrontHead(); pollFront(); render(); uiSaveRemote();
}
// × on a tab only hides it in this browser (closing a tab must not stop an agent).
// Stopping or removing a bubble's agent is done from its drawer, like any other agent.
let hiddenTabs = new Set();
try { hiddenTabs = new Set(JSON.parse(localStorage.getItem('cmd.hiddenTabs') || '[]')); } catch {}
const saveHiddenTabs = () => { try { localStorage.setItem('cmd.hiddenTabs', JSON.stringify([...hiddenTabs])); } catch {} uiSaveRemote(); };
// lead branches picked from the graph stay as tabs in this browser until their × is pressed
let leadTabs = [];
try { leadTabs = JSON.parse(localStorage.getItem('cmd.leadTabs') || '[]'); } catch {}
const saveLeadTabs = () => { try { localStorage.setItem('cmd.leadTabs', JSON.stringify(leadTabs)); } catch {} uiSaveRemote(); };
/* The open bubble and the tab list follow the
   person to every device: saved on their account (/api/ui), applied once when a page loads. The conversation itself is
   always read from the hub, so it is the same everywhere. */
let uiSaveT = null, uiReady = false;
function uiSaveRemote() {
  if (!uiReady) return;
  clearTimeout(uiSaveT);
  uiSaveT = setTimeout(() => post('/api/ui', { chat: chatTarget || '', hidden: [...hiddenTabs], leadTabs }).catch(() => {}), 400);
}
function hydrateUI(ui) {
  if (ui) {
    hiddenTabs = new Set(ui.hidden || []); leadTabs = (ui.leadTabs || []).slice();
    try { localStorage.setItem('cmd.hiddenTabs', JSON.stringify([...hiddenTabs])); localStorage.setItem('cmd.leadTabs', JSON.stringify(leadTabs)); } catch {}
  }
  uiReady = true;
  if (ui && ui.chat && isBranch(nodes[ui.chat]) && nodes[ui.chat].state !== 'stopped') switchChat(ui.chat);
}
const myTopic = n => n.role === 'topic' && n.state !== 'stopped' && (n.user === (me && me.id) || (me && me.admin && !n.user));
function myTopics() { return Object.values(nodes).filter(n => myTopic(n) && !hiddenTabs.has(n.id)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); }
/** The git graph: main line (desk), then every lead with its topic bubbles, then topics under no lead. */
// a branch the admin closed stays on the graph, greyed, for a week so it can be reopened ("Open") from here
const BR_KEEP_MS = 7 * 86400e3;
const brArm = { id: null, t: 0 };   // the row whose Close was tapped once
const closedTopic = n => n.role === 'topic' && n.state === 'stopped' && (n.user === (me && me.id) || (me && me.admin && !n.user)) && Date.now() - (n.stoppedAt || 0) < BR_KEEP_MS;
// Close/Open: admin only, topics and non-lead children of a lead or topic; never BRAIN, desks or a lead itself (leads: hidden)
const canClose = n => !!(me && me.admin && n && n.role !== 'lead' && n.role !== 'front' && n.id !== 'brain' &&
  (n.role === 'topic' || (nodes[n.parent] && (nodes[n.parent].role === 'lead' || nodes[n.parent].role === 'topic'))));
function branchRows() {
  const all = Object.values(nodes), tops = all.filter(n => myTopic(n) || closedTopic(n)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const leads = canLeadBranch() ? all.filter(n => n.role === 'lead' && n.state !== 'stopped').sort((a, b) => a.name.localeCompare(b.name)) : [];
  const rows = [{ n: nodes[activeDesk], d: 0 }], placed = new Set();
  for (const L of leads) { rows.push({ n: L, d: 1 }); for (const t of tops) if (t.parent === L.id) { rows.push({ n: t, d: 2 }); placed.add(t.id); } }
  for (const t of tops) if (!placed.has(t.id)) rows.push({ n: t, d: 1 });
  return rows.filter(r => r.n);
}
function laneSvg(rows, i) {
  const r = rows[i], X = [9, 23, 37], c = { 0: ROLE_C.front, 1: ROLE_C[r.n.role], 2: ROLE_C.topic }[r.d];
  const more0 = rows.slice(i + 1).some(x => x.d === 1), next2 = rows[i + 1] && rows[i + 1].d === 2;
  const ln = (x, y1, y2, col) => `<path d="M${x} ${y1}V${y2}" stroke="${col}"/>`;
  let g = '';
  if (r.d === 0) { if (rows.length > 1) g += ln(X[0], 16, 34, ROLE_C.front); }
  else {
    if (more0) g += ln(X[0], 0, 34, ROLE_C.front);
    if (r.d === 2 && next2) g += ln(X[1], 0, 34, ROLE_C.lead);
    const a = X[r.d - 1], b = X[r.d];
    g += `<path d="M${a} 0C${a} 11 ${b} 6 ${b} 16" stroke="${r.d === 2 ? ROLE_C.lead : ROLE_C.front}"/>`;
    if (r.d === 1 && next2) g += ln(X[1], 16, 34, c);
  }
  g += `<circle cx="${X[r.d]}" cy="16" r="${r.d === 0 ? 5 : 4}" fill="${c}" style="color:${c}"/>`;
  return `<svg class="lanes" viewBox="0 0 46 32" width="46" height="32" aria-hidden="true">${g}</svg>`;
}
const BR_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="6" cy="5" r="2.2"/><circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="8" r="2.2"/><path d="M6 7.2v9.6M18 10.2c0 4-6 3.5-11 7"/></svg>';
function renderBranches() {
  const cur = chatTo(), desk = nodes[activeDesk];
  leadTabs = leadTabs.filter(id => nodes[id] && nodes[id].role === 'lead' && nodes[id].state !== 'stopped' || !Object.keys(nodes).length);
  const tabs = [...leadTabs.map(id => nodes[id]).filter(n => n && canLeadBranch()), ...myTopics()];
  const open = !$('#bgraph').hidden;
  setHTML($('#branches'), [`<button class="br gtog${open ? ' open' : ''}" data-brgraph title="Branches: the leads and bubbles you can talk to directly" aria-label="Show branches" aria-expanded="${open}">${BR_ICON}</button>`,
    `<button class="br main${cur === activeDesk ? ' on' : ''}" data-br=""><i class="mdot"></i>${esc(desk && me && desk.id === me.desk ? 'Concierge' : desk ? desk.name : 'Desk')}</button>`,
    ...tabs.map(t => `<span class="br ${t.role === 'lead' ? 'l' : 't'}${cur === t.id ? ' on' : ''}"><button data-br="${esc(t.id)}"><i class="st ${esc(t.state)}"></i>${esc(t.name)}</button><button class="x" data-brx="${esc(t.id)}" title="Close this tab (the agent keeps running)" aria-label="Close the ${esc(t.name)} tab">×</button></span>`)].join(''));
  if (renderBranches.cur !== cur) { renderBranches.cur = cur; const on = $('#branches .br.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  if (open) renderGraph();
}
function renderGraph() {
  const rows = branchRows(), cur = chatTo();
  setHTML($('#bgRows'), rows.map((r, i) => {
    const n = r.n, main = r.d === 0, closed = n.state === 'stopped', armed = brArm.id === n.id;
    const act = main || !canClose(n) ? '' : closed
      ? `<button class="bg-act open" data-bropen="${esc(n.id)}" title="Wake this branch again" aria-label="Reopen ${esc(n.name)}">Open</button>`
      : `<button class="bg-act${armed ? ' armed' : ''}" data-brkill="${esc(n.id)}" title="Stop this agent (like cmd stop; it stays on the map)" aria-label="${armed ? 'Confirm: stop' : 'Stop'} ${esc(n.name)}">${armed ? 'Sure?' : 'Close'}</button>`;
    return `<div class="bg-row d${r.d}${n.state === 'asleep' ? ' asleep' : ''}${closed ? ' closed' : ''}${n.id === cur ? ' on' : ''}" role="option" tabindex="0" aria-selected="${n.id === cur}" aria-disabled="${closed}" data-br="${main ? '' : esc(n.id)}">${laneSvg(rows, i)}`
      + `<span class="bg-name"><b>${esc(main ? (me && n.id === me.desk ? 'Concierge' : n.name) : n.name)}</b><small>${main ? 'main' : esc(n.role)} · ${esc(closed ? 'closed' : STATE_T[n.state] || n.state || '')}</small></span>`
      + `<span class="bg-last">${esc(closed ? '' : String(n.last || '').slice(0, 90))}</span>${act}</div>`;
  }).join(''));
}
function toggleGraph(show) {
  const g = $('#bgraph'); g.hidden = show === undefined ? !g.hidden : !show;
  renderBranches();
}
$('#branches').addEventListener('click', async e => {
  const x = e.target.closest('[data-brx]');
  if (x) {
    const id = x.dataset.brx;
    if (leadTabs.includes(id)) { leadTabs = leadTabs.filter(t => t !== id); saveLeadTabs(); } else { hiddenTabs.add(id); saveHiddenTabs(); }
    if (chatTarget === id) switchChat(null); else renderBranches();
    return;
  }
  if (e.target.closest('[data-brgraph]')) return toggleGraph();
  const b = e.target.closest('[data-br]'); if (b) switchChat(b.dataset.br || null);
});
// Close: first tap arms it ("Sure?"), a second tap within 4 s stops the agent; Open wakes a closed one again
async function branchAct(kind, id) {
  try { await post(`/api/branch/${kind}/${encodeURIComponent(id)}`, {}); if (nodes[id]) { nodes[id].state = kind === 'close' ? 'stopped' : 'starting'; if (kind === 'close') nodes[id].stoppedAt = Date.now(); } }
  catch (err) { alertBubble(err.message); }
  if (kind === 'close' && chatTarget === id) switchChat(null); else renderBranches();
}
$('#bgRows').addEventListener('click', e => {
  const k = e.target.closest('[data-brkill]'), o = e.target.closest('[data-bropen]');
  if (k) {
    const id = k.dataset.brkill; clearTimeout(brArm.t);
    if (brArm.id !== id) { brArm.id = id; brArm.t = setTimeout(() => { brArm.id = null; renderBranches(); }, 4000); return renderBranches(); }
    brArm.id = null; sfxPlay('tick'); return branchAct('close', id);
  }
  if (o) { sfxPlay('tick'); return branchAct('open', o.dataset.bropen); }
  const b = e.target.closest('[data-br]'); if (!b || b.classList.contains('closed')) return;
  sfxPlay('tick'); $('#bgraph').hidden = true; switchChat(b.dataset.br || null);
});
$('#bgRows').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('bg-row')) { e.preventDefault(); e.target.click(); } });

/** Map clicks: people do nothing, desks open in the Command Center chat, agents open the drawer (if allowed). */
function nodeClick(d) {
  if (isPerson(d)) return;
  if (!(d.role === 'lead' && view === 'map')) sfxPlay('select', d.x);
  if (d.role === 'front') { if (view !== 'cc') setView('cc'); activeDesk = d.id; chatTarget = null; frontPending.length = 0; $('#frontMsgs').dataset.sig = ''; updateFrontHead(); pollFront(); render(); return; }
  if (d.role !== 'lead' && view === 'map' && focusLead && moonsOf(d).length) {
    const opening = !openSet.has(d.id);
    sfxPlay(opening ? 'open' : 'close', d.x);
    if (opening) openSet.add(d.id); else { openSet.delete(d.id); for (const c of subtreeOf(d.id)) openSet.delete(c.id); }
    render(); if (opening) setTimeout(() => fit(true), 700);
  }
  if (d.role === 'lead' && view === 'map' && combActive()) {
    const opening = focusLead !== d.id;
    sfxPlay(opening ? 'open' : 'close', d.x);
    combDive(opening ? d.id : null);
  } else if (d.role === 'lead' && view === 'map') {
    const opening = focusLead !== d.id;
    sfxPlay(opening ? 'open' : 'close', d.x);
    focusLead = opening ? d.id : null; openSet.clear(); render();
    if (opening) setTimeout(() => fit(true), 700);
  }
  if (!me || !(me.admin || me.perms.talk || me.perms.terminal || me.perms.manage)) return;
  openDrawer(d.id);
}
/* floating front-desk chat on the map */
const chatEl = $('#chatPane'), fab = $('#chatFab');
let chatUI = { open: false, x: null, y: null };
try { Object.assign(chatUI, JSON.parse(localStorage.getItem('cmd.chat') || '{}')); } catch {}
const saveChatUI = () => { try { localStorage.setItem('cmd.chat', JSON.stringify(chatUI)); } catch {} };
function placeChat() {
  const floating = view !== 'cc';
  // Phone widths: the floating/draggable pop-over chat doesn't render usably, so it stays closed there no matter what's
  // in chatUI/localStorage and "Command center" in the bottom nav is the way to reach chat full-screen. iPad widths: a
  // fixed left sidebar instead (CSS docks it, static, full height): always open, never floating, never minimised.
  const coarse = matchMedia('(pointer:coarse)').matches;
  const phoneSide = coarse && innerHeight < 500;   // a phone on its side: a phone, not a tablet
  const tablet = coarse && !phoneSide && innerWidth >= 600 && innerWidth <= 1400;
  const mobile = (innerWidth <= 860) || tablet || phoneSide;
  const open = tablet ? true : (mobile ? false : chatUI.open);
  chatEl.classList.toggle('min', floating && !open);
  fab.classList.toggle('hide', !floating || open || mobile);
  // the floating chat keeps the size you dragged it to and can fold to its head line
  const sized = floating && !mobile && innerWidth > 700;
  chatEl.classList.toggle('fold', sized && !!chatUI.fold);
  $('#chatFold').setAttribute('aria-pressed', !!chatUI.fold);
  if (sized && chatUI.w) { const lb = $('.layout').getBoundingClientRect(); chatEl.style.width = Math.min(chatUI.w, lb.width - 16) + 'px'; chatEl.style.height = chatUI.fold ? '' : Math.min(chatUI.h, lb.height - 16) + 'px'; }
  else chatEl.style.width = chatEl.style.height = '';
  if (floating && !mobile && chatUI.x != null && innerWidth > 700) {
    const box = $('.layout').getBoundingClientRect(), w = chatEl.offsetWidth || 380, h = chatEl.offsetHeight || 520;
    chatEl.style.left = Math.max(8, Math.min(chatUI.x, box.width - w - 8)) + 'px';
    chatEl.style.top = Math.max(8, Math.min(chatUI.y, box.height - h - 8)) + 'px';
    chatEl.style.bottom = 'auto';
  } else { chatEl.style.left = chatEl.style.top = chatEl.style.bottom = ''; }
}
function openChat() {
  chatUI.open = true; fab.classList.remove('unread'); saveChatUI(); placeChat();
  const m = $('#frontMsgs'); m.scrollTop = m.scrollHeight; setTimeout(() => $('#frontInput').focus(), 50);
}
fab.onclick = openChat;
$('#chatMin').onclick = () => { chatUI.open = false; saveChatUI(); placeChat(); };
$('#chatFold').onclick = () => { chatUI.fold = !chatUI.fold; saveChatUI(); placeChat(); };
// resize from the top-right corner: the left and bottom edges stay where they are
$('#chatGrip').addEventListener('pointerdown', e => {
  if (view === 'cc' || innerWidth <= 700) return;
  e.preventDefault(); e.stopPropagation();
  const lb = $('.layout').getBoundingClientRect(), r = chatEl.getBoundingClientRect(), anchored = chatUI.x != null;
  chatUI.fold = false; chatEl.classList.add('dragging'); e.currentTarget.setPointerCapture(e.pointerId);
  const move = ev => {
    chatUI.w = Math.max(320, Math.min(ev.clientX - r.left, lb.right - r.left - 8));
    chatUI.h = Math.max(260, Math.min(r.bottom - ev.clientY, r.bottom - lb.top - 8));
    if (anchored) chatUI.y = r.bottom - lb.top - chatUI.h;
    placeChat();
  };
  const up = () => { chatEl.classList.remove('dragging'); removeEventListener('pointermove', move); removeEventListener('pointerup', up); saveChatUI(); };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
});
$('#chatGrip').addEventListener('dblclick', () => { chatUI.w = chatUI.h = null; saveChatUI(); placeChat(); });
addEventListener('resize', () => placeChat());
$('#chatPane .chat-head').addEventListener('pointerdown', e => {
  if (view === 'cc' || innerWidth <= 700 || e.target.closest('button')) return;
  const box = $('.layout').getBoundingClientRect(), r = chatEl.getBoundingClientRect();
  const dx = e.clientX - r.left, dy = e.clientY - r.top;
  chatEl.classList.add('dragging'); e.currentTarget.setPointerCapture(e.pointerId);
  const move = ev => { chatUI.x = ev.clientX - box.left - dx; chatUI.y = ev.clientY - box.top - dy; placeChat(); };
  const up = () => { chatEl.classList.remove('dragging'); removeEventListener('pointermove', move); removeEventListener('pointerup', up); saveChatUI(); };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
});
$('#chatPane .chat-head').addEventListener('dblclick', e => { if (view !== 'cc' && !e.target.closest('button')) { chatUI.x = chatUI.y = null; saveChatUI(); placeChat(); } });

function setView(v) {
  if (v === 'map' && me && !me.admin && !me.perms.map) v = 'cc';
  if (v === 'actions' && me && !me.admin) v = 'cc';
  if (v === 'agents' && me && !me.admin) v = 'cc';
  if (v === 'queue' && me && !me.admin) v = 'cc';
  if (v === 'jobs' && me && !me.admin) v = 'cc';
  view = v;
  document.body.classList.toggle('v-cc', v === 'cc');
  if (v === 'log' && me && !me.admin) v = 'cc';
  if (v === 'rules' && me && !me.admin) v = 'cc';   // admin only
  document.body.classList.toggle('v-actions', v === 'actions' || v === 'log' || v === 'rules' || v === 'agents' || v === 'queue' || v === 'jobs');
  if (!document.body.classList.contains('v-actions') && bgfx.resume) bgfx.resume();
  $('#agentsView').hidden = v !== 'agents';
  $('#queueView').hidden = v !== 'queue';
  $('#jobsView').hidden = v !== 'jobs';
  $('#actionsView').hidden = v !== 'actions';
  $('#logView').hidden = v !== 'log';
  $('#rulesView').hidden = v !== 'rules';
  if (v === 'actions') loadActions();
  if (v === 'log') loadLog();
  if (v === 'rules') loadRules();
  // a view you left keeps no DOM (Actions alone was ~600 nodes behind the map); entering it reloads it.
  // Actions answers and notes are saved as they are typed (actSave), so nothing typed is lost.
  const drop = ids => ids.forEach(id => { const e = $(id); if (e) { e.innerHTML = ''; e._html = ''; } });
  if (v !== 'actions') drop(['#actList', '#actLater', '#actDone']);
  if (v !== 'log') drop(['#logList']);
  if (v !== 'rules') drop(['#rulesList']);
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  if (selected && v === 'cc') closeDrawer();
  placeChat(); renderLimits(); placeLive(); renderTopicHeads();
  render(); setTimeout(() => fit(), 60);
  if (window.tasksView) tasksView(v);
  if (window.agentsView) agentsView(v);
  if (window.queueView) queueView(v);
  if (window.jobsView) jobsView(v);
  try { localStorage.setItem('cmd.view', v); } catch {}
}
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));

/* ================================================================ drawer */
let tab = 'talk', drawerTimer = null;
const drawer = $('#drawer');
/** Swap HTML only when it actually changed, so a refresh doesn't flicker or reset scroll. */
function setHTML(el, html) { if (el._html !== html) { el._html = html; el.innerHTML = html; } }
function tokTable(id) {
  const rows = ['today', 'week', 'month'].map(p => [p, tokOf(id, p) || { t: 0, cr: 0, usd: 0 }]);
  if (!rows.some(([, b]) => b.t)) return '<p class="muted small">No tokens recorded this month.</p>';
  return `<table class="toktab"><thead><tr><th>Tokens</th><th>Total</th><th title="Fresh = new input + cache writes + output; cache = cache reads (in the total, about 0.1x the price)">Fresh / cache</th><th title="What the same tokens would cost at API list price. Subscription plans are not billed per token.">$ list</th></tr></thead><tbody>${rows.map(([p, b]) =>
    `<tr class="${p === tokP ? 'on' : ''}"><td>${TOK_T[p]}</td><td><b>${fmtTok(b.t)}</b></td><td>${b.t ? fmtTok(b.t - (b.cr || 0)) + ' / ' + fmtTok(b.cr || 0) : ''}</td><td>${b.usd ? '$' + b.usd.toFixed(2) : ''}</td></tr>`).join('')}</tbody></table>`;
}

function openDrawer(id, wantTab) {
  if (!nodes[id]) return;
  if (!drawer.classList.contains('open')) sfxPlay('slidein', 520);
  selected = id; drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false');
  $('#dMsgs').dataset.sig = '';
  const may = k => me && (me.admin || (me.perms || {})[k]);
  setTab(wantTab === 'skills' && id === 'brain' && me && me.admin ? 'skills' : tab === 'skills' && id === 'brain' && me && me.admin ? 'skills' : wantTab && wantTab !== 'skills' && may(wantTab === 'term' ? 'terminal' : 'talk') ? wantTab : may('talk') && nodes[id].state !== 'login' ? 'talk' : may('terminal') ? 'term' : 'talk');
  fillDrawer(); render();
  clearInterval(drawerTimer); drawerTimer = setInterval(drawerTick, 2000); drawerTick();
}
function closeDrawer() {
  if (!selected) return;
  sfxPlay('slideout', 520);
  selected = null; drawer.classList.remove('open', 'wide'); drawer.setAttribute('aria-hidden', 'true');
  clearInterval(drawerTimer); stopTerm(); render();
}
$('#dClose').onclick = closeDrawer;
function fillDrawer() {
  const n = nodes[selected]; if (!n) return closeDrawer();
  drawer.classList.toggle('ro', !!n.readOnly);   // a member may see agents outside their projects, read only
  $('#dOrb').style.background = ROLE_C[n.role]; $('#dOrb').style.color = ROLE_C[n.role];
  $('#dName').textContent = n.name;
  const tk = tokOf(n.id), tkm = tokOf(n.id, 'month');
  $('#dMeta').textContent = `${n.role} · ${STATE_T[n.state] || n.state}${n.ctx ? ' · context ' + fmtTok(n.ctx) : ''}${n.account ? ' · ' + n.account : ''}${n.cwd ? ' · ' + n.cwd : ''}${tk || tkm ? ` · ${fmtTok((tk || {}).t || 0)} tokens ${TOK_T[tokP] || 'today'}, ${fmtTok((tkm || {}).t || 0)} this month` : ''}`;
  const chain = ancestors(n.id).reverse();
  $('#dPath').innerHTML = chain.map(id => id === n.id ? esc(nodes[id].name) : `<a data-go="${esc(id)}">${esc(nodes[id].name)}</a>`).join(' › ');
  $('#dPath').querySelectorAll('a').forEach(a => a.onclick = () => openDrawer(a.dataset.go));
  setHTML($('#dLast'), n.last ? esc('↳ ' + n.last) : '');
  const fixed = n.role === 'front' || n.id === 'brain';
  const may = k => me && (me.admin || (me.perms || {})[k]);
  $('#dStop').hidden = !may('manage') || fixed || n.state === 'stopped';
  $('#dRemove').hidden = !may('manage') || n.state !== 'stopped';
  $('#dStart').hidden = !may('manage') || !['offline', 'stopped', 'asleep'].includes(n.state);
  $('#dSpawn').hidden = !may('manage') || n.role === 'front' || n.state === 'stopped';
  $('#dCompact').hidden = $('#dClear').hidden = !may('manage') || isPerson(n) || ['stopped', 'offline', 'login'].includes(n.state);
  document.querySelector('.tabs [data-tab="term"]').hidden = !may('terminal');
  document.querySelector('.tabs [data-tab="talk"]').hidden = !may('talk');
  document.querySelector('.tabs [data-tab="skills"]').hidden = !(n.id === 'brain' && me && me.admin);
  $('#dInput').placeholder = `Message ${n.name} directly (as you)…`;
  termHint();
}
async function drawerTick() {
  if (!selected || document.hidden) return;   // nothing while the tab is hidden
  if (tab === 'talk') {
    try {
      const box = $('#dMsgs'), D = drawerTick.c && drawerTick.c.id === selected && box.dataset.sig ? drawerTick.c : (drawerTick.c = { id: selected });
      const r = await fetch('/api/chat/' + selected, { cache: 'no-store', headers: D.etag ? { 'If-None-Match': D.etag } : {} });
      if (r.status === 304 || !r.ok) return;
      D.etag = r.headers.get('ETag');
      const j = await r.json();
      renderChat($('#dMsgs'), j.messages, j.queued || [], nodes[selected] && nodes[selected].state === 'login' ? 'Not signed in yet: open the Terminal tab.' : 'No conversation yet.', false, { list: j.queued || [], note: j.queuedNote || '' });
    } catch {}
  }
}
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
function setTab(t) {
  tab = t;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $('#tabTalk').hidden = t !== 'talk'; $('#tabTerm').hidden = t !== 'term'; $('#tabSkills').hidden = t !== 'skills';
  drawer.classList.toggle('wide', t === 'term' || t === 'skills');
  if (t === 'term') setTimeout(startTerm, 300); else { stopTerm(); $('#dMsgs').dataset.sig = ''; drawerTick(); }
  if (t === 'skills') loadSkills();
}

/* Brain's Skills tab: turn skills on/off and edit their files. ON = loaded by every Claude session on this host;
   skills that ship scripts arrive switched off until someone turns them on. */
const SK = { items: [], edit: null };
async function loadSkills() {
  try { SK.items = (await api('/api/skills?all=1')).items; } catch (e) { SK.items = []; }
  if (!SK.edit) renderSkills();
}
function renderSkills() {
  const box = $('#tabSkills'), on = SK.items.filter(s => s.on).length;
  box.innerHTML = `<div class="sk-top"><b>Skills</b><span class="muted small">${on} on · ${SK.items.length - on} off</span>
      <input class="sk-q" type="search" placeholder="Search…" aria-label="Search skills" value="${esc(SK.q || '')}"></div>
    <p class="muted small sk-lede">Every agent uses the skills that are on. Skills that contain scripts start off; you turn them on.</p>
    <div class="sk-list">${SK.items.filter(s => !SK.q || (s.name + ' ' + s.description).toLowerCase().includes(SK.q.toLowerCase())).map(s => `
      <div class="sk-item${s.on ? ' on' : ''}">
        <label class="sk-sw" title="${s.on ? 'Turn off' : 'Turn on'}"><input type="checkbox" data-sk-tog="${esc(s.id)}"${s.on ? ' checked' : ''}><span></span></label>
        <div class="sk-main"><div class="sk-name">${esc(s.name)}${s.scripts ? '<span class="sk-b warn" title="This skill contains executable files">script</span>' : ''}${s.source ? `<a class="sk-b" href="${esc(s.source)}" target="_blank" rel="noopener">source ↗</a>` : s.repo ? '<span class="sk-b">local</span>' : ''}</div>
          <div class="sk-desc">${esc(s.description || '')}</div></div>
        <button class="ghost sm" data-sk-edit="${esc(s.id)}">Edit</button>
      </div>`).join('') || '<div class="empty">No skills.</div>'}</div>`;
  const qi = box.querySelector('.sk-q');
  qi.oninput = () => { SK.q = qi.value; const pos = qi.selectionStart; renderSkills(); const n = $('#tabSkills .sk-q'); n.focus(); n.setSelectionRange(pos, pos); };
  box.querySelectorAll('[data-sk-tog]').forEach(c => c.onchange = async () => {
    c.disabled = true;
    try { SK.items = (await post(`/api/skills/${encodeURIComponent(c.dataset.skTog)}/toggle`, { on: c.checked })).items; alertBubble(`${c.dataset.skTog} turned ${c.checked ? 'on' : 'off'}. Applies to new sessions.`); }
    catch (e) { alertBubble(e.message); }
    renderSkills();
  });
  box.querySelectorAll('[data-sk-edit]').forEach(b => b.onclick = () => editSkill(b.dataset.skEdit, 'SKILL.md'));
}
async function editSkill(id, file) {
  let j; try { j = await api(`/api/skills/${encodeURIComponent(id)}/file?f=${encodeURIComponent(file)}`); } catch (e) { return alertBubble(e.message); }
  SK.edit = { id, file, orig: j.content };
  const box = $('#tabSkills');
  box.innerHTML = `<div class="sk-top"><button class="ghost sm" id="skBack">← Skills</button><b>${esc(id)}</b></div>
    <div class="sk-files">${j.files.map(f => `<button class="sk-f${f === file ? ' on' : ''}" data-sk-f="${esc(f)}">${esc(f)}</button>`).join('')}</div>
    <textarea class="sk-ed" spellcheck="false" aria-label="${esc(file)}">${esc(j.content)}</textarea>
    <div class="sk-bar"><span class="muted small" id="skState"></span><button class="ghost sm" id="skCancel">Cancel</button><button class="sm primary" id="skSave">Save</button></div>`;
  const ta = box.querySelector('.sk-ed'), st = $('#skState');
  const dirty = () => ta.value !== SK.edit.orig;
  ta.oninput = () => { st.textContent = dirty() ? 'not saved' : ''; };
  const leave = () => !dirty() || confirm('Unsaved changes will be lost. Continue?');
  $('#skBack').onclick = $('#skCancel').onclick = () => { if (!leave()) return; SK.edit = null; loadSkills(); };
  box.querySelectorAll('[data-sk-f]').forEach(b => b.onclick = () => { if (leave()) editSkill(id, b.dataset.skF); });
  $('#skSave').onclick = async () => {
    try { await post(`/api/skills/${encodeURIComponent(id)}/file?f=${encodeURIComponent(file)}`, { content: ta.value }); SK.edit.orig = ta.value; st.textContent = '✓ saved'; }
    catch (e) { st.textContent = e.message; }
  };
}
// a direct message to an agent is answered in that agent's own chat, not relayed by the desk
bindComposer($('#dForm'), $('#dInput'), async text => { await post('/api/send', { to: selected, text, branch: selected !== activeDesk }); $('#dMsgs').dataset.sig = ''; setTimeout(drawerTick, 800); });

$('#dStop').onclick = async () => { if (confirm(`Stop ${nodes[selected].name} and everything under it?`)) { await post('/api/stop/' + selected); } };
$('#dStart').onclick = () => post('/api/start/' + selected);
$('#dCompact').onclick = async () => { try { const r = await post('/api/care/' + selected, { kind: 'compact' }); alertBubble(`${nodes[selected].name} compacts ${r.when === 'now' ? 'now' : 'when its current turn ends'}.`); } catch (e) { alertBubble(e.message); } };
$('#dClear').onclick = async () => { if (!confirm(`Ask ${nodes[selected].name} to write a handoff note and clear its context?`)) return; try { await post('/api/care/' + selected, { kind: 'clear' }); alertBubble(`Asked ${nodes[selected].name} to leave a note and clear itself.`); } catch (e) { alertBubble(e.message); } };
$('#dRemove').onclick = async () => { await post('/api/remove/' + selected); closeDrawer(); };
$('#dSpawn').onclick = () => {
  $('#spParent').textContent = nodes[selected].name;
  const f = $('#spawnForm'); f.reset(); f.cwd.placeholder = nodes[selected].cwd || 'working folder';
  f.role.value = nodes[selected].role === 'brain' ? 'lead' : 'project';
  $('#spawnDlg').showModal();
};
$('#spawnDlg').addEventListener('close', async () => {
  if ($('#spawnDlg').returnValue !== 'ok') return;
  const f = $('#spawnForm');
  try { await post('/api/spawn', { parent: selected, name: f.name.value.trim(), role: f.role.value, cwd: f.cwd.value.trim() || undefined, brief: f.brief.value.trim() }); }
  catch (e) { alertBubble(e.message); }
});

/* ================================================================ terminal bridge */
/** One xterm mirroring one tmux pane (by agent id); polls the screen, forwards keys. */
let xtermP = null;
function loadXterm() {
  return xtermP || (xtermP = new Promise((ok, no) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'vendor/xterm.css'; document.head.append(l);
    const sc = document.createElement('script'); sc.src = 'vendor/xterm.js'; sc.onload = ok; sc.onerror = () => { xtermP = null; no(new Error('xterm')); }; document.head.append(sc);
  }));
}
function TermBridge(container, emptyText) {
  let term = null, timer = null, last = '', target = null, q = [], busy = false;
  const self = {
    get target() { return target; },
    start(id) {
      target = id;
      // xterm (~290 KB) is loaded the first time a terminal opens, not with the page
      if (!window.Terminal) { loadXterm().then(() => { if (target === id) self.start(id); }); return; }
      if (!term) {
        term = new Terminal({ cols: 150, rows: 44, fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, cursorBlink: true, scrollback: 0,
          theme: { background: '#05070a', foreground: '#e9ecf4', cursor: '#9b7bff', selectionBackground: '#3a2f73' }, allowProposedApi: true });
        term.open(container);
        term.onData(d => { q.push(d); pump(); });
      }
      self.size(); last = ''; term.reset();
      clearInterval(timer); timer = setInterval(pull, 650); pull();
      term.focus();
    },
    stop() { clearInterval(timer); timer = null; target = null; },
    size() {
      if (!term) return;
      const w = container.clientWidth - 24;
      const fs = Math.max(6, Math.min(13, Math.floor(w / (150 * 0.602))));
      if (term.options.fontSize !== fs) term.options.fontSize = fs;
    },
    focus() { term && term.focus(); },
    async keys(...seq) {
      for (const d of seq) { if (target) await post('/api/keys/' + target, { data: d }).catch(() => {}); await new Promise(r => setTimeout(r, 350)); }
      setTimeout(pull, 400); self.focus();
    },
  };
  async function pull() {
    if (!target) return;
    try {
      const j = await api('/api/term/' + target);
      if (!j.alive) { if (last !== '∅') { term.reset(); term.write(`\r\n  \x1b[90m${emptyText}\x1b[0m`); last = '∅'; } return; }
      const key = j.screen + j.cursor;
      if (key === last) return;
      last = key;
      const lines = j.screen.split('\n').slice(0, j.rows);
      term.write('\x1b[H\x1b[2J' + lines.join('\r\n') + `\x1b[${(j.cursor[1] || 0) + 1};${(j.cursor[0] || 0) + 1}H`);
    } catch {}
  }
  async function pump() {
    if (busy) return; busy = true;
    while (q.length) {
      let d = q.shift();
      const printable = s => /^[^\x00-\x1f\x7f]+$/.test(s) && !s.startsWith('\x1b');
      while (printable(d) && q.length && printable(q[0])) d += q.shift();
      if (target) try { await post('/api/keys/' + target, { data: d }); } catch {}
    }
    busy = false; setTimeout(pull, 120);
  }
  addEventListener('resize', () => timer && self.size());
  return self;
}
const drawerTerm = TermBridge($('#term'), '(no live window — press Start)');
const startTerm = () => selected && drawerTerm.start(selected);
const stopTerm = () => drawerTerm.stop();

function termHint() {
  const n = nodes[selected]; if (!n) return;
  $('#termHint').innerHTML = n.state === 'login'
    ? `<b>One-time sign-in</b> <button class="ghost sm" id="startLogin">Start sign-in</button> then pick <b>1. Claude account</b>, open the link it prints, approve, and paste the code into this terminal. Agents on the same account sign in together.`
    : n.state === 'offline' ? 'Claude is not running in this window. Press <b>Start</b> above.' : 'Live view of this agent. Click in and type to drive it directly.';
}
document.addEventListener('click', e => {
  if (e.target.id === 'startLogin' && selected) drawerTerm.keys('\x1b', '/login', '\r');
});

/* ================================================================ settings */
const setEl = $('#settings');
let setTimer = null;
const fmtWhen = t => { if (!t) return ''; const d = new Date(t); const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }); };
const since = t => { if (!t) return '—'; const s = (Date.now() - t) / 1000; return s < 3600 ? Math.max(1, Math.round(s / 60)) + 'm' : s < 86400 ? Math.round(s / 3600) + 'h' : Math.round(s / 86400) + 'd'; };

/** One Claude account, read only: who it is signed in as and which agents run on it. Accounts are signed in on the
    host itself (claude /login in that account's config dir); the hub only reports them. */
function acctCard(a) {
  const chip = a.signedIn ? '<span class="chip working">Signed in</span>' : '<span class="chip login">Not signed in</span>';
  const used = Array.isArray(a.agents) ? a.agents : [];
  return `<article class="acct">
    <header><div><b>${esc(a.label || a.id)}</b>${a.label && a.label !== a.id ? `<code>${esc(a.id)}</code>` : ''}</div>${chip}</header>
    ${a.signedIn && a.email ? `<div class="who2">${esc(a.email)}${a.plan ? `<small>${esc(a.plan)}</small>` : ''}</div>` : ''}
    ${a.signedIn ? '' : '<p class="muted small">Sign it in on the host: start <code>claude</code> with this account\'s config dir and run <code>/login</code>.</p>'}
    <div class="muted small">Used by: ${used.length ? used.map(esc).join(', ') : a.running ? a.running + ' running' : 'nothing running'}</div>
  </article>`;
}
/* ---------------- people */
let peopleData = null;
const projNames = meta => (meta.projects || meta.sites || []).map(x => typeof x === 'string' ? x : x.name);
function personCard(u, meta) {
  const ago2 = t => t ? since(t) + ' ago' : 'never';
  const desk = u.deskState ? `<span class="chip ${esc(u.deskState)}">desk ${esc(STATE_T[u.deskState] || u.deskState)}</span>` : '';
  if (u.admin) return `<article class="person" data-uid="${esc(u.id)}">
    <header><div><input class="pname" value="${esc(u.name)}" aria-label="Name" maxlength="40"><span class="badge2 owner">Admin</span></div>${desk}</header>
    <p class="muted small">Can do everything. Last seen ${ago2(u.seen)}.</p>
    <div class="row2"><button class="primary sm" data-psave hidden>Save</button><button class="ghost sm" data-pdesk="${esc(u.desk)}">Open desk</button></div></article>`;
  const all = projNames(meta), mine = u.projects || u.sites || [];
  const box = x => `<label class="sitechk"><input type="checkbox" name="proj" value="${esc(x)}"${mine.includes(x) ? ' checked' : ''}>${esc(x)}</label>`;
  return `<article class="person${u.disabled ? ' off' : ''}" data-uid="${esc(u.id)}">
    <header><div><input class="pname" value="${esc(u.name)}" aria-label="Name" maxlength="40"><span class="badge2">Team member${u.disabled ? ' · disabled' : ''}</span></div>${desk}</header>
    <p class="muted small">Last seen ${ago2(u.seen)} · added ${esc(new Date(u.createdAt).toLocaleDateString())}</p>
    <label class="pemail">Email<input class="pmail" type="email" value="${esc(u.email || '')}" placeholder="name@example.com" maxlength="120"></label>
    <p class="small psec">${signInState(u)}</p>
    <label class="perm"><input type="checkbox" name="seeAll"${u.seeAll ? ' checked' : ''}><span>See every project on the map (read only); they can only ask for work on the projects ticked below</span></label>
    <fieldset><legend>Can</legend>${Object.entries(meta.perms || {}).map(([k, label]) => `<label class="perm${k === 'terminal' ? ' danger' : ''}"><input type="checkbox" name="perm" value="${k}"${(u.perms || {})[k] ? ' checked' : ''}><span>${esc(label)}</span></label>`).join('')}
      <label class="perm always"><input type="checkbox" checked disabled><span>Chat with their own concierge</span></label></fieldset>
    <fieldset><legend>Projects their desk may send work for</legend>${all.length ? `<div class="sitechks">${all.map(box).join('')}</div>` : '<p class="muted small">No projects yet (Settings › Projects).</p>'}</fieldset>
    <div class="row2">
      <button class="primary sm" data-psave hidden>Save changes</button>
      <button class="ghost sm" data-pdesk="${esc(u.desk)}">Open their desk</button>
      ${u.email ? `<button class="ghost sm" data-pinv>${u.invite || !u.hasPassword ? (u.invite && u.invite.sentAt ? 'Resend invite' : 'Send invite') : 'Send new invite'}</button>` : ''}
      ${u.mfa ? '<button class="ghost sm" data-pmfa>Reset two-step</button>' : ''}
      ${u.email ? '' : '<button class="ghost sm" data-ppw>New password</button>'}
      <button class="ghost sm" data-poff="${u.disabled ? '0' : '1'}">${u.disabled ? 'Enable' : 'Disable'}</button>
      <button class="ghost sm danger" data-prm>Remove</button>
    </div></article>`;
}
function signInState(u) {
  const t = x => new Date(x).toLocaleString();
  const inv = u.invite ? (u.invite.expired ? `<span class="bad">invite expired ${esc(t(u.invite.exp))}</span>` : u.invite.sentAt ? `invite sent ${esc(t(u.invite.sentAt))}, valid until ${esc(t(u.invite.exp))}` : 'invite link made, not sent') : '';
  const two = u.mfa ? `<span class="ok">two-step on</span> · ${u.recoveryLeft} recovery codes left` : u.hasPassword ? '<span class="bad">two-step not set up</span> (asked at their next sign-in)' : '';
  return [u.hasPassword ? 'password set by them' : 'no password yet', two, inv].filter(Boolean).join(' · ');
}
async function loadPeople(force) {
  const box = $('#sPeople');
  if (!force && box.querySelector('.person.dirty')) return;        // don't overwrite unsaved edits
  let j; try { j = await api('/api/users'); } catch { return; }
  peopleData = j;
  box.innerHTML = j.users.map(u => personCard(u, j)).join('');
}
function showNewPw(name, pw) {
  const el = $('#newPw'); el.hidden = false;
  el.innerHTML = `<b>Password for ${esc(name)}</b><div class="pwshow"><code>${esc(pw)}</code><button class="ghost sm" data-copy="${esc(pw)}">Copy</button></div>
    <p class="muted small">Send it to them with the address <b>${esc(location.origin)}</b>. It is shown only once; you can make a new one any time.</p>`;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
/** An invite link the server made but could not mail (no mailer set up): show it so the admin can pass it on. */
function showInviteLink(name, link) {
  const el = $('#newPw'); el.hidden = false;
  el.innerHTML = `<b>Invite link for ${esc(name)}</b><div class="pwshow"><code>${esc(link)}</code><button class="ghost sm" data-copy="${esc(link)}">Copy</button></div>
    <p class="muted small">Send it to them yourself. With it they set their own password and two-step sign-in.</p>`;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
const inviteUrl = r => r && (r.link || r.url || (r.invite && (r.invite.link || r.invite.url))) || '';
$('#sPeople').addEventListener('input', e => { const c = e.target.closest('.person'); if (c) { c.classList.add('dirty'); c.querySelector('[data-psave]').hidden = false; } });
$('#sPeople').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  const card = b.closest('.person'), uid = card && card.dataset.uid, u = peopleData && peopleData.users.find(x => x.id === uid);
  try {
    if (b.hasAttribute('data-psave')) {
      b.disabled = true;
      const body = { name: card.querySelector('.pname').value };
      if (!u.admin) {
        body.perms = Object.fromEntries([...card.querySelectorAll('input[name=perm]')].map(i => [i.value, i.checked]));
        body.projects = [...card.querySelectorAll('input[name=proj]:checked')].map(i => i.value);
        body.email = card.querySelector('.pmail').value;
        body.seeAll = card.querySelector('input[name=seeAll]').checked;
        if (body.perms.terminal && !(u.perms || {}).terminal && !confirm(`Terminal access lets ${u.name} type straight into agent terminals, with the rights of the user the hub runs as. Allow it?`)) { b.disabled = false; return; }
      }
      await post('/api/users/' + uid, body);
      card.classList.remove('dirty'); alertBubble(u.admin ? 'Saved.' : `Saved. ${u.name}'s desk restarts with the new rules.`); loadPeople(true);
    }
    if (b.dataset.pdesk) { closeSettings(); setView('cc'); nodeClick(nodes[b.dataset.pdesk] || { role: 'front', id: b.dataset.pdesk }); }
    if (b.hasAttribute('data-ppw')) { if (!confirm(`Make a new password for ${u.name}? The old one stops working and they are signed out.`)) return; const r = await post(`/api/users/${uid}/password`); showNewPw(u.name, r.password); }
    if (b.hasAttribute('data-pinv')) {
      if (!confirm(`Make a new invite link for ${u.name} (${u.email})? Any earlier link stops working.`)) return;
      b.disabled = true; const r = await post(`/api/users/${uid}/invite`);
      if (inviteUrl(r) && !r.sent) showInviteLink(u.name, inviteUrl(r)); else alertBubble(`Invite sent to ${u.email}.`);
      loadPeople(true);
    }
    if (b.hasAttribute('data-pmfa')) { if (!confirm(`Reset ${u.name}'s two-step sign-in? They are signed out and set up a new authenticator at their next sign-in. Anyone who knows their current password could do that step, so if the password may have leaked, use Send new invite instead.`)) return; await post(`/api/users/${uid}/mfa-reset`); alertBubble('Two-step sign-in reset.'); loadPeople(true); }
    if (b.dataset.poff) { await post('/api/users/' + uid, { disabled: b.dataset.poff === '1' }); loadPeople(true); }
    if (b.hasAttribute('data-prm')) { if (!confirm(`Remove ${u.name}? Their password and concierge are deleted.`)) return; await post(`/api/users/${uid}/delete`); loadPeople(true); }
  } catch (err) { alertBubble(err.message); b.disabled = false; }
});
$('#addPerson').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  const email = f.email.value.trim();
  try {
    const r = await post('/api/users/new', { name: f.name.value, email, sendInvite: !!email && f.send.checked });
    f.reset(); await loadPeople(true);
    if (r.password) showNewPw(r.user.name, r.password);
    else if (inviteUrl(r) && !r.sent) showInviteLink(r.user ? r.user.name : 'them', inviteUrl(r));
    else alertBubble(r.inviteError ? 'Added, but the invite could not be sent: ' + r.inviteError : r.invite ? `Added. Invite sent to ${email}.` : 'Added. Pick their projects, then press Send invite.');
  }
  catch (err) { alertBubble(err.message); }
});
document.addEventListener('click', e => { const b = e.target.closest('[data-copy]'); if (b) { navigator.clipboard && navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; } });

async function loadSettings() {
  let j; try { j = await api('/api/settings'); } catch { return; }
  $('#sAccounts').innerHTML = (j.accounts || []).map(acctCard).join('') || '<div class="muted">No Claude accounts configured.</div>';
  projData = j.projects || []; renderProjects(); loadPeople();
  const care = j.care || {};
  if (!$('#sFleet').contains(document.activeElement)) $('#sFleet').innerHTML = `
    <form id="careForm" class="careform">
      <b>Context care</b>
      <label class="tog"><input type="checkbox" name="auto"${care.auto ? ' checked' : ''}> Compact idle agents automatically above</label>
      <label class="num"><input name="compactAt" type="number" min="30" max="900" step="10" value="${Math.round((care.compactAt || 200000) / 1000)}"> K tokens</label>
      <button class="ghost sm">Save</button>
    </form>
    <p class="muted small">Agents also compact or clear themselves (<code>cmd context</code>, <code>cmd compact</code>, <code>cmd clear "note"</code>) when a task ends or their context grows. A cleared agent keeps its role and gets its handoff note back. Applies to agents started or restarted after a change.</p>`;
  $('#sAgents').innerHTML = `<table><thead><tr><th>Agent</th><th>Role</th><th>State</th><th>Account</th><th>Folder</th><th>Up</th><th></th></tr></thead><tbody>${
    (j.agents || []).map(a => `<tr><td><span class="dot" style="background:${ROLE_C[a.role] || '#888'}"></span>${esc(a.name)}${a.parent ? `<small>under ${esc(a.parent)}</small>` : ''}</td><td>${esc(a.role)}</td>
      <td><span class="chip ${esc(a.state)}">${esc(STATE_T[a.state] || a.state)}</span></td><td>${a.account ? esc(a.account) : '—'}</td>
      <td><code>${esc(a.cwd || '')}</code></td><td>${a.state === 'stopped' ? '—' : since(a.since)}</td>
      <td class="acts"><button class="ghost sm" data-restart="${esc(a.id)}" title="Restart this agent, keeping its conversation">Restart</button><button class="ghost sm" data-open="${esc(a.id)}">Open</button></td></tr>`).join('')}</tbody></table>`;
  $('#sHub').textContent = j.hub ? `Hub up ${since(j.hub.startedAt)} · ${j.hub.sessions} signed-in browser${j.hub.sessions === 1 ? '' : 's'}` : '';
}
/* ---------------- projects: the folders leads work in (name, folder, notes for the lead) */
let projData = [];
function renderProjects() {
  const tb = $('#sProjects'); if (!tb) return;
  // don't clobber a row someone is typing in
  if (tb.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  tb.innerHTML = projData.map(x => `<tr data-proj="${esc(x.name)}">
    <td><b>${esc(x.name)}</b></td>
    <td><input class="cell" name="cwd" value="${esc(x.cwd || '')}" spellcheck="false" aria-label="Folder for ${esc(x.name)}"></td>
    <td><input class="cell" name="notes" value="${esc(x.notes || '')}" placeholder="e.g. run the tests before every push" aria-label="Notes for ${esc(x.name)}"></td>
    <td>${x.lead ? `<span class="chip ${esc(x.lead.state)}">${esc(STATE_T[x.lead.state] || x.lead.state)}</span>` : '<span class="muted small">none</span>'}</td>
    <td class="acts">${x.lead ? `<button class="ghost sm" data-open="${esc(x.lead.id)}">Open</button>` : `<button class="ghost sm" data-lead="${esc(x.name)}">Start lead</button>`}<button class="ghost sm danger" data-proj-rm="${esc(x.name)}">Remove</button></td>
  </tr>`).join('') || '<tr><td colspan="5" class="muted">No projects yet. Add one: a name and the folder its lead works in.</td></tr>';
}
function projMsg(t, ok) { const m = $('#projMsg'); if (!m) return; m.textContent = t; m.className = 'formmsg ' + (ok ? 'ok' : 'bad'); clearTimeout(projMsg.t); projMsg.t = setTimeout(() => m.textContent = '', 4000); }
async function saveProject(tr) {
  const nameIn = tr.querySelector('[name=name]'), name = nameIn ? nameIn.value.trim() : tr.dataset.proj, x = projData.find(y => y.name === name) || {};
  const cwd = tr.querySelector('[name=cwd]').value.trim(), notes = tr.querySelector('[name=notes]').value.trim();
  if (!nameIn && cwd === (x.cwd || '') && notes === (x.notes || '')) return;
  if (!name || !cwd) return projMsg('A project needs a name and a folder.', false);
  try {
    await post('/api/projects', { name, cwd, notes });
    projMsg(`Saved ${name}.` + (x.lead && cwd !== x.cwd ? ' Restart its lead to move it to the new folder.' : ''), true);
    document.activeElement.blur(); loadSettings();
  } catch (err) { projMsg(err.message, false); }
}
$('#sProjects').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input.cell')) { e.preventDefault(); saveProject(e.target.closest('tr')); } if (e.key === 'Escape') { e.stopPropagation(); e.target.blur(); renderProjects(); } });
$('#sProjects').addEventListener('focusout', e => { const tr = e.target.closest('tr'); setTimeout(() => { if (tr && tr.isConnected && !tr.contains(document.activeElement) && !tr.querySelector('[name=name]')) saveProject(tr); }, 0); });
$('#projAdd').onclick = () => {
  if ($('#sProjects tr.new')) return $('#sProjects tr.new input').focus();
  const tr = document.createElement('tr'); tr.className = 'new'; tr.dataset.proj = '';
  tr.innerHTML = `<td><input class="cell" name="name" placeholder="my-app" aria-label="Project name"></td><td><input class="cell" name="cwd" placeholder="/srv/my-app" aria-label="Folder"></td><td><input class="cell" name="notes" placeholder="Notes for the lead" aria-label="Notes"></td><td></td><td class="acts"><button class="primary sm" data-proj-save>Save</button><button class="ghost sm" data-proj-cancel>Cancel</button></td>`;
  $('#sProjects').prepend(tr); tr.querySelector('input').focus();
};
function openSettings() {
  setEl.hidden = false; document.body.classList.add('in-settings');
  loadPeople(true); loadSettings(); clearInterval(setTimer); setTimer = setInterval(loadSettings, 10000);
  try { history.replaceState(null, '', '#settings'); } catch {}
}
function closeSettings() {
  setEl.hidden = true; document.body.classList.remove('in-settings');
  clearInterval(setTimer);
  try { history.replaceState(null, '', location.pathname); } catch {}
}
$('#openSettings').onclick = openSettings;
$('#sClose').onclick = closeSettings;
setEl.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.restart) { b.disabled = true; await post('/api/restart/' + b.dataset.restart).catch(err => alertBubble(err.message)); setTimeout(loadSettings, 1500); }
  if (b.dataset.open) { closeSettings(); openDrawer(b.dataset.open); }
  if (b.dataset.lead) { b.disabled = true; try { await post(`/api/projects/${encodeURIComponent(b.dataset.lead)}/lead`); projMsg(`${b.dataset.lead} lead is starting under Brain.`, true); setTimeout(loadSettings, 1500); } catch (err) { projMsg(err.message, false); b.disabled = false; } }
  if (b.dataset.projRm) { if (!confirm(`Remove the project ${b.dataset.projRm}? Its folder is not touched.`)) return; await post(`/api/projects/${encodeURIComponent(b.dataset.projRm)}/remove`).catch(err => projMsg(err.message, false)); loadSettings(); }
  if (b.hasAttribute('data-proj-save')) saveProject(b.closest('tr'));
  if (b.hasAttribute('data-proj-cancel')) b.closest('tr').remove();
  if (b.id === 'sLogoutOthers') { await post('/api/logout-others'); loadSettings(); }
});
$('#sFleet').addEventListener('submit', async e => {
  if (e.target.id !== 'careForm') return;
  e.preventDefault(); const f = e.target;
  try { await post('/api/care', { auto: f.auto.checked, compactAt: Number(f.compactAt.value) * 1000 }); alertBubble('Context care saved.'); } catch (err) { alertBubble(err.message); }
});
$('#pwForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, msg = $('#pwMsg');
  if (f.next.value !== f.again.value) { msg.textContent = 'The new passwords do not match.'; msg.className = 'formmsg bad'; return; }
  try { await post('/api/password', { current: f.current.value, next: f.next.value }); msg.textContent = 'Password changed. Other browsers were signed out.'; msg.className = 'formmsg ok'; f.reset(); }
  catch (err) { msg.textContent = err.message; msg.className = 'formmsg bad'; }
});
if (location.hash === '#settings') setTimeout(openSettings, 0);

/* ================================================================ live stream */
/* Accounts and server load are small header chips; a click opens the full card under the chip */
let hpopCur = null, srvPull = () => {};
const hpopOpen = id => hpopCur === id;
// under its button, right edges lined up, never past either side of the screen
function popAt(box, btn, w) {
  const r = btn.getBoundingClientRect(); w = Math.min(w, innerWidth - 16);
  box.style.top = (r.bottom + 8) + 'px'; box.style.right = Math.min(Math.max(8, innerWidth - r.right), innerWidth - w - 8) + 'px';
}
function hpop(id, on = hpopCur !== id) {
  hpopCur = on ? id : (hpopCur === id ? null : hpopCur);
  for (const [pid, cid] of [['limitsBox', 'limChip'], ['srv', 'srvChip']]) {
    const box = document.getElementById(pid), chip = document.getElementById(cid), o = hpopCur === pid;
    chip.setAttribute('aria-expanded', o); chip.classList.toggle('on', o);
    if (box.parentNode !== document.body) document.body.append(box);
    if (pid === 'srv') { box.setAttribute('aria-expanded', o); box.hidden = !o || !box.innerHTML; }
    if (o) popAt(box, chip, pid === 'srv' ? 280 : 340);
  }
  if (id !== 'notif') notifShow(false);
  renderLimits(); if (hpopOpen('srv')) srvPull();
}
$('#limChip').onclick = e => { e.stopPropagation(); hpop('limitsBox'); };
$('#srvChip').onclick = e => { e.stopPropagation(); hpop('srv'); };
document.addEventListener('pointerdown', e => {
  if (hpopCur && !e.target.closest('.hpop,.hchip')) hpop(hpopCur, false);
  if (!$('#notifPanel').hidden && !e.target.closest('#notifPanel,#notifBtn,.report-card')) notifShow(false);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (hpopCur) hpop(hpopCur, false); notifShow(false); } });
addEventListener('resize', () => { if (hpopCur) hpop(hpopCur, true); });

/* Notification center. Every report card and alert lands here (last 60, kept in this browser); the bell shows
   how many arrived since you last opened it. Cards on screen close on their own, this list is where they stay. */
document.body.insertAdjacentHTML('beforeend', '<div class="npanel" id="notifPanel" hidden role="dialog" aria-label="Notifications"><div class="nhead"><b>Notifications</b><button class="ghost sm" id="notifClear">Clear list</button></div><div class="nlist" id="notifList"></div></div>');
let notes = [];
try { notes = JSON.parse(localStorage.getItem('cmd.notes') || '[]'); } catch {}
const saveNotes = () => { try { localStorage.setItem('cmd.notes', JSON.stringify(notes.slice(0, 60))); } catch {} };
function addNote(name, target, text) {
  notes.unshift({ t: Date.now(), name, target, text: String(text), read: false });
  notes.length = Math.min(notes.length, 60); saveNotes(); notifBadge();
  if (!$('#notifPanel').hidden) notifDraw();
}
function notifBadge() {
  const n = notes.filter(x => !x.read).length, b = $('#notifBtn b');
  b.hidden = !n; b.textContent = n > 9 ? '9+' : n;
}
function notifDraw() {
  $('#notifList').innerHTML = notes.length ? notes.map((x, i) => `<div class="nitem${x.read ? '' : ' new'}${isRoutine(x.text) ? '' : ' ask'}" data-n="${i}"><div class="nh"><b>${esc(x.name)}</b><span>${esc(ago(x.t))}</span></div><div class="nt">${esc(String(x.text).trim())}</div>${x.target !== undefined ? '<button class="ghost sm ngo">Open in chat →</button>' : ''}</div>`).join('')
    : '<p class="nempty">No notifications yet.</p>';
}
function notifShow(on = $('#notifPanel').hidden) {
  const p = $('#notifPanel'); if (p.hidden === !on) return;
  p.hidden = !on; $('#notifBtn').setAttribute('aria-expanded', on);
  if (on) {
    if (hpopCur) hpop(hpopCur, false);
    popAt(p, $('#notifBtn'), 340);
    notifDraw(); for (const x of notes) x.read = true; saveNotes(); notifBadge();
  } else $('#notifList').innerHTML = '';
}
$('#notifBtn').onclick = e => { e.stopPropagation(); notifShow(); };
$('#notifClear').onclick = () => { notes = []; saveNotes(); notifBadge(); notifDraw(); };
$('#notifList').addEventListener('click', e => {
  const it = e.target.closest('[data-n]'), x = it && notes[+it.dataset.n]; if (!x) return;
  if (!e.target.closest('.ngo')) return void it.classList.toggle('open');
  switchChat(x.target && nodes[x.target] && isBranch(nodes[x.target]) ? x.target : null); if (view !== 'cc') openChat(); notifShow(false);
});
notifBadge();
let limitsData = [];
/* Quiet hours (optional, from the hub config): a header chip says the map is quiet on purpose and until when */
let mapQuiet = null;
function renderQuiet() {
  const c = $('#quietChip'); if (!c) return;
  const q = mapQuiet && mapQuiet.on ? mapQuiet : null;
  c.hidden = !q;
  if (!q) return;
  c.className = 'hchip quietchip q-quiet';
  c.textContent = 'Quiet hours' + (q.until ? ' · until ' + fmtWhen(q.until) : '');
  c.title = 'Quiet hours: routine work waits until they end.';
}
/* Claude accounts chip: how many accounts are signed in; the popover lists each one and how many agents it runs */
function renderLimits() {
  const box = $('#limitsBox'), chip = $('#limChip');
  const rows = limitsData;
  chip.hidden = !rows.length;
  box.hidden = !rows.length || !hpopOpen('limitsBox');
  if (!rows.length) return;
  const on = rows.filter(l => l.signedIn).length, cls = on < rows.length ? 'warn' : 'ok';
  setHTML(chip, `<span>Accounts</span><b class="${cls}">${on}/${rows.length}</b>`);
  chip.title = `${on} of ${rows.length} Claude accounts signed in`;
  if (box.hidden) return;
  setHTML(box, `<button class="lhead" id="limitsToggle" aria-expanded="true"><span>Claude accounts</span><b class="${cls}">${on}/${rows.length}</b><small>signed in</small><span class="chev">▾</span></button>
    <div class="lhdr"><span>Account</span><span>Sign-in</span><span>Agents</span></div>${rows.map(l => `<div class="lrow${l.signedIn ? '' : ' spare'}" data-acct="${esc(l.id)}">
      <div class="lwho" title="${esc(l.label || l.id)}"><b>${esc(l.short || l.label || l.id)}</b><small>${esc(l.email || '')}</small></div>
      ${l.signedIn ? '<span class="lm"><b class="ok">signed in</b></span>' : '<span class="lm none crit">not signed in</span>'}
      <span class="lm"><small>${l.running ? esc(String(l.running)) + ' running' : 'none running'}</small></span>
    </div>`).join('')}`);
  $('#limitsToggle').onclick = () => hpop('limitsBox', false);
}
function tokBar() {
  for (const b of document.querySelectorAll('#tokBar [data-p]')) b.classList.toggle('on', b.dataset.p === tokP);
  const per = tok.periods[tokP] || {};
  const visible = Object.keys(nodes).filter(id => view === 'map' ? nodes[id].role !== 'front' && !isPerson(nodes[id]) : true);
  const sum = tokP === 'off' ? 0 : visible.reduce((a, id) => a + ((per[id] || {}).t || 0), 0);
  $('#tokSum').textContent = tokP === 'off' ? '' : fmtTok(sum);
  $('#tokSum').title = tok.at ? `Counted ${ago(tok.at < 1e12 ? tok.at * 1000 : tok.at)}. Input (cached reads included) + cache writes + output, from Claude Code transcripts.` : '';
}
document.querySelectorAll('#tokBar [data-p]').forEach(b => b.onclick = () => { tokP = b.dataset.p; try { localStorage.setItem('cmd.tokp', tokP); } catch {} tokBar(); render(); if (selected) fillDrawer(); });
let BUILD = null;
// 'Front desk' is shown as 'Concierge', and 'BRAIN' as 'Brain', everywhere except the map hexagon
const uiName = s => String(s || '').replace(/\bFront desk\b/g, 'Concierge').replace(/\bfront desk\b/g, 'concierge').replace(/\bBRAIN\b/g, 'Brain');
const VIEWS = ['map', 'cc', 'jobs', 'actions', 'log', 'rules', 'agents', 'queue'];
function applyTree(t) {
  kidsReset();
  // the hub's browser files changed: reload, unless the person is in the middle of typing (then on the next tree after)
  if (t.build) { if (!BUILD) BUILD = t.build; else if (t.build !== BUILD && !($('#frontInput').value || '').trim() && !document.querySelector('.drawer.open textarea:focus, .drawer.open input:focus')) { location.reload(); return; } }
  if (t.tokens) tok = t.tokens;
  limitsData = t.limits || [];
  mapQuiet = t.quiet || null; renderQuiet();
  document.body.classList.toggle('demo', !!t.demo);
  { const db = $('#demoBadge'); if (db) db.hidden = !t.demo; }
  document.querySelectorAll('.abadge').forEach(b => { b.hidden = !t.actionsOpen; b.textContent = t.actionsOpen || ''; });
  if (t.me && t.me.admin) { actTitle(t.actionsOpen || 0); actWake(); }
  if (sfxActOpen != null && (t.actionsOpen || 0) > sfxActOpen) sfxPlay('chime');
  sfxActOpen = t.actionsOpen || 0;
  if (t.actionsAt && t.actionsAt !== actionsAt) { actionsAt = t.actionsAt; if (view === 'actions') loadActions(); }
  const first = !me;
  me = t.me;
  if (first && me.layout) hydrateLayout(me.layout);
  document.body.classList.toggle('is-admin', !!me.admin);
  for (const k of ['map', 'talk', 'manage', 'terminal']) document.body.classList.toggle('can-' + k, !!(me.admin || (me.perms || {})[k]));
  if (!activeDesk || !t.nodes.some(n => n.id === activeDesk)) activeDesk = me.desk;
  const seen = new Set();
  for (const n of t.nodes) {
    seen.add(n.id);
    const was = nodes[n.id] && nodes[n.id].state;
    const c = Object.assign(nodes[n.id] || {}, n);
    c.rawName = n.name; c.name = uiName(n.name);
    if (was && was !== c.state && c.x != null && shownIds.has(c.id)) {   // a state change on a bubble you can see
      if (c.state === 'working') sfxPlay('up', c.x);
      else if (['offline', 'problem', 'login'].includes(c.state)) sfxPlay('thud', c.x);
      else if (was === 'working' && c.state === 'idle') sfxPlay('down', c.x);
    }
    if (c.state !== 'working') delete c.wAt; else if (!c.wAt) c.wAt = Date.now();   // working since (seen by this page), for leadLit
    if (c.role === 'front') c.parent = 'brain';         // drawn as a branch into Brain in the Command Center
    nodes[n.id] = c;
  }
  for (const u of t.users || []) {
    seen.add(u.id);
    nodes[u.id] = Object.assign(nodes[u.id] || {}, { id: u.id, name: u.uid === me.id ? 'You' : u.name, role: 'you', parent: u.desk, desk: u.desk, admin: u.admin, state: 'you' });
  }
  for (const id of Object.keys(nodes)) if (!seen.has(id)) delete nodes[id];
  if (first) { let v = 'map'; try { v = localStorage.getItem('cmd.view') || 'map'; } catch {} setView(VIEWS.includes(v) ? v : 'map'); hydrateUI(me.ui); pollFront(); }
  render(); updateFrontHead(); tokBar(); renderLimits(); placeLive();
  if (window.agentsTree) agentsTree();
  if (window.queueTree) queueTree();
  if (selected) fillDrawer();
}
// date/time locale: the browser's own in English mode, Turkish when that interface language is picked
const LOC = typeof LANG !== 'undefined' && LANG === 'tr' ? 'tr-TR' : undefined;
/* ================================================================ Actions: decisions agents put to the admin
   One card per decision: short question, tick-box answers, the long context folded behind a caret. Send relays the
   answer to the agent that asked (server side), so nothing here talks to an agent directly. */
/* Changelog tab: what agents changed, newest first, each with how to revert it. */
async function loadLog() {
  let r; try { r = await api('/api/changelog'); } catch (e) { $('#logList').innerHTML = `<div class="act-empty">${esc(e.message)}</div>`; return; }
  $('#logCount').textContent = `${r.items.length} ${tx('entries')}`;
  const groups = r.groups || [], nGr = groups.reduce((a, g) => a + g.count, 0);
  if (nGr) $('#logCount').textContent += ` · ${nGr} ${tx('content entries in')} ${groups.length} ${tx('groups')}`;
  if (!r.items.length && !groups.length) { $('#logList').innerHTML = `<div class="act-empty">${tx('No entries yet.')}</div>`; return; }
  const dayOf = at => new Date(at).toLocaleDateString(LOC, { weekday: 'long', day: 'numeric', month: 'long' });
  const hm = at => new Date(at).toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' });
  // per day the real changes first, then one folded row per group for its routine content entries
  const days = [], byDay = {};
  const slot = at => { const d = dayOf(at); if (!byDay[d]) { byDay[d] = { d, at, items: [], groups: [] }; days.push(byDay[d]); } return byDay[d]; };
  for (const i of r.items) slot(i.at).items.push(i);
  for (const g of groups) slot(g.at).groups.push(g);
  days.sort((a, b) => b.at - a.at);
  const item = i => `<article class="log-item k-${esc(i.kind || 'change')}${i.void ? ' is-void' : ''}"${i.void ? ` title="${tx('Void')}: ${esc(i.void.why)}"` : ''}>
      <div class="log-meta"><span>${esc(hm(i.at))}</span><span>${esc(i.by)}</span><span class="log-kind">${esc(i.kind || 'change')}</span></div>
      <div class="log-title">${i.void ? `<span class="log-void">${tx('Void')}</span> ` : ''}${esc(i.title)}</div>
      ${i.what ? `<p class="log-what">${esc(i.what)}</p>` : ''}${i.why ? `<p class="log-why"><b>${tx('Why')}:</b> ${esc(i.why)}</p>` : ''}
      ${i.revert ? `<details class="log-rev"><summary>${tx('How to revert')}</summary><p>${esc(i.revert)}</p></details>` : ''}
    </article>`;
  const grp = g => `<details class="log-item log-group" data-key="${esc(g.key)}"${logOpen[g.key] ? ' open' : ''}>
      <summary><div class="log-meta"><span>${esc(hm(g.at))}</span><span class="log-kind">content</span></div>
      <div class="log-title">${esc(g.label || g.site || g.key)}: ${g.count} ${tx('content entries')} <span class="log-grp-hint">${tx('open')}</span></div></summary>
      <ul class="log-grp-list">${g.items.map(i => `<li${i.void ? ' class="is-void"' : ''}><span class="log-grp-t">${esc(hm(i.at))}</span> ${esc(i.title)}${i.revert ? ` <details class="log-rev"><summary>${tx('revert')}</summary><p>${esc(i.revert)}</p></details>` : ''}</li>`).join('')}</ul>
    </details>`;
  $('#logList').innerHTML = days.map(x => `<h3 class="log-day">${esc(x.d)}</h3>${x.items.map(item).join('')}${x.groups.map(grp).join('')}`).join('');
  $('#logList').querySelectorAll('.log-group').forEach(el => el.addEventListener('toggle', () => { logOpen[el.dataset.key] = el.open; }));
}
const logOpen = {};   // group key -> unfolded, kept across reloads of the tab

/* Rules tab: every rule as one line with a tick box, grouped. Unticking turns it off everywhere (server side: the rules
   file, the managed CLAUDE.md, agent prompts, hub behaviour). A rule marked `confirm` asks "Are you sure?" with its
   risk line first, inline (no browser dialog). */
let rulesData = null, rulesAsk = null;
async function loadRules() {
  try { rulesData = (await api('/api/rules')).groups; } catch (e) { $('#rulesList').innerHTML = `<div class="act-empty">${esc(e.message)}</div>`; return; }
  renderRules();
}
function renderRules() {
  if (!rulesData) return;
  const all = rulesData.flatMap(g => g.rules), off = all.filter(r => !r.on).length;
  $('#rulesCount').textContent = `${all.length} ${tx('rules')}${off ? ` · ${off} ${tx('off')}` : ' · ' + tx('all on')}`;
  const when = at => new Date(at).toLocaleString(LOC, { dateStyle: 'short', timeStyle: 'short' });
  const row = r => `<article class="log-item rule-item${r.on ? '' : ' is-off'}" data-rule="${esc(r.id)}">
      <label class="rule-row"><input type="checkbox" class="rule-cb" ${r.on ? 'checked' : ''} aria-label="${esc(r.title)}"><span class="log-title">${esc(r.title)}</span></label>
      <p class="log-what">${esc(r.desc)}</p>
      <div class="log-meta"><span>${esc(r.source)}</span><span class="log-kind">${esc(r.where.join(' + '))}</span>${r.confirm ? `<span class="log-kind">${tx('asks to confirm')}</span>` : ''}${r.changedAt ? `<span>${r.changedTest ? '<b>TEST</b> ' : ''}${tx(r.on ? 'turned on' : 'turned off')} ${esc(when(r.changedAt))}${r.changedVia ? ' · ' + esc(r.changedVia) : ''}</span>` : ''}</div>
      ${rulesAsk === r.id ? `<div class="rule-ask" role="alert"><b>${tx('Are you sure?')}</b> ${esc(r.risk)}<span class="rule-ask-b"><button type="button" class="ghost sm danger" data-rsure="${esc(r.id)}">${tx('Yes, turn off')}</button><button type="button" class="ghost sm" data-rno>${tx('Cancel')}</button></span></div>` : ''}
      <details class="log-rev"><summary>${tx('Full rule text')}</summary><p class="rule-text">${esc(r.text)}</p>${r.codeWhat ? `<p><b>${tx('Hub behaviour')}:</b> ${esc(r.codeWhat)}</p>` : ''}${(r.history || []).length ? `<p><b>${tx('History')}:</b></p><ul class="log-grp-list">${r.history.slice().reverse().map(h => `<li>${esc(when(h.at))} ${tx(h.on ? 'turned on' : 'turned off')}${h.test ? ' <b>TEST</b>' : ''} · ${esc(h.via || h.by)}</li>`).join('')}</ul>` : ''}</details>
    </article>`;
  $('#rulesList').innerHTML = rulesData.map(g => `<h3 class="log-day">${esc(g.label)} <small>${g.rules.length}</small></h3>${g.rules.map(row).join('')}`).join('');
  $('#rulesList').querySelectorAll('.rule-cb').forEach(cb => cb.onchange = () => {
    const id = cb.closest('[data-rule]').dataset.rule, r = all.find(x => x.id === id);
    if (!cb.checked && r.confirm) { cb.checked = true; rulesAsk = id; renderRules(); return; }
    ruleSave(id, cb.checked, false);
  });
  $('#rulesList').querySelectorAll('[data-rsure]').forEach(b => b.onclick = () => ruleSave(b.dataset.rsure, false, true));
  $('#rulesList').querySelectorAll('[data-rno]').forEach(b => b.onclick = () => { rulesAsk = null; renderRules(); });
}
async function ruleSave(id, on, sure) {
  rulesAsk = null;
  try { const r = await post('/api/rules/' + encodeURIComponent(id), { on, sure }); rulesData = r.groups; if (r.changelog) alertBubble(`${tx('Rule')} ${tx(on ? 'turned on' : 'turned off')} · ${r.changelog}`); }
  catch (e) { alertBubble(e.message); }
  renderRules();
}

let actionsAt = 0, actItems = [];
const actOpen = {};       // card id -> 'det' | 'note' panels the person unfolded
const actSaveT = {};
async function loadActions() {
  if (!me || !me.admin) return;
  // never repaint under someone's cursor; the next tree update repaints
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#actionsView .atext, #actionsView .anote, #actionsView .achatin')) return;
  try { actItems = (await api('/api/actions')).items; } catch (e) { $('#actList').innerHTML = `<div class="act-empty">${esc(e.message)}</div>`; return; }
  renderActions();
}
const actAnswered = (it, q) => { const a = it.answers[q.id]; return q.type === 'text' ? !!String(a || '').trim() : Array.isArray(a) ? a.length > 0 : !!a; };
// anything answered can go: the rest stays on the card for later
const actReady = it => it.questions.some(q => actAnswered(it, q)) || !!it.note.trim();
const actAll = it => it.questions.every(q => actAnswered(it, q));
function actLabel(it) { const n = nodes[it.from]; return n ? n.name : it.from; }
/* The Actions tab as an inbox. Open decisions are one-line rows (Enter or a click unfolds the full card), "Apply
   recommended" answers the recommended options and sends in one tap, j/k move, sort + timed snooze (the until time is
   kept in this browser; the server only knows snoozed yes/no), the open count sits in the tab title and the favicon. */
const actX = {};                       // card id -> unfolded
let actSel = null, actBulkArm = 0, actBulkT = 0;
const actRecArm = { id: null, t: 0 };
let actSort = 'old'; try { actSort = localStorage.getItem('cmd.actSort') || 'old'; } catch {}
const actSnz = (() => { try { return JSON.parse(localStorage.getItem('cmd.actSnz') || '{}'); } catch (e) { return {}; } })();
const actSnzSave = () => { try { localStorage.setItem('cmd.actSnz', JSON.stringify(actSnz)); } catch {} };
// recommended answers for the pick questions still unanswered: { qid: value | [values] }
function actRecs(it) {
  const r = {};
  for (const q of it.questions) {
    if (q.type === 'text' || actAnswered(it, q)) continue;
    const rec = (q.options || []).filter(o => o.rec).map(o => o.v);
    if (rec.length) r[q.id] = q.type === 'many' ? rec : rec[0];
  }
  return r;
}
const actRecText = it => it.questions.filter(q => q.type !== 'text').map(q => {
  const rec = (q.options || []).filter(o => o.rec).map(o => o.l); return rec.join(', ');
}).filter(Boolean).join(' · ');
const actBulkList = () => actItems.filter(i => i.status === 'open' && !i.snoozed && i.kind !== 'delete' && Object.keys(actRecs(i)).length);
async function actApply(it) {
  Object.assign(it.answers, actRecs(it)); clearTimeout(actSaveT[it.id]);
  await post('/api/actions/' + it.id + '/send', { answers: it.answers, note: it.note });
}
function actSorted(list) {
  const t = i => i.createdAt || 0;
  if (actSort === 'new') return list.slice().sort((a, b) => t(b) - t(a));
  if (actSort === 'from') return list.slice().sort((a, b) => actLabel(a).localeCompare(actLabel(b)) || t(a) - t(b));
  if (actSort === 'del') return list.slice().sort((a, b) => (b.kind === 'delete') - (a.kind === 'delete') || t(a) - t(b));
  return list.slice().sort((a, b) => t(a) - t(b));
}
function actRow(it, n) {
  const recs = Object.keys(actRecs(it)).length, rt = actRecText(it), o = actOpen[it.id] || {};
  const arm = actRecArm.id === it.id;
  return `<article class="acard aline${actReady(it) ? ' ready' : ''}${actSel === it.id ? ' sel' : ''}" data-card="${it.id}">
    <button type="button" class="aexp" data-exp="${it.id}" aria-expanded="false" title="${tx('Open (Enter)')}"><span class="anum">${n}</span>
      <span class="atl">${it.kind === 'delete' ? `<span class="akind del">${tx('DELETE')}</span>` : ''}<b>${esc(it.title)}</b></span>
      <span class="ameta1">${it.project ? esc(it.project) + ' · ' : ''}${esc(actLabel(it))}${it.createdAt ? ' · ' + esc(actWhen(it.createdAt)) : ''}${(it.thread || []).length ? ' · 💬' + it.thread.length : ''}</span>
      ${rt ? `<span class="arecsum" title="${tx('Recommended')}: ${esc(rt)}">${esc(rt)}</span>` : ''}</button>
    ${o.snz ? `<span class="asnzm" role="group" aria-label="${tx('Snooze')}"><button type="button" data-snz="${it.id}" data-for="1h">1 h</button><button type="button" data-snz="${it.id}" data-for="4h">4 h</button><button type="button" data-snz="${it.id}" data-for="tm">${tx('Tomorrow')}</button><button type="button" data-snz="${it.id}" data-for="0">${tx('Indefinitely')}</button></span>`
      : `<button type="button" class="asnz" data-snzm="${it.id}" title="${tx('Snooze')}">${tx('Snooze')}</button>`}
    ${recs ? `<button type="button" class="arec${arm ? ' armed' : ''}" data-rec="${it.id}" title="${tx('Tick the recommended options and send (a)')}">${tx(arm ? 'Are you sure?' : 'Apply recommended')}</button>` : ''}
  </article>`;
}
function actTitle(n) {
  document.title = (n ? '(' + n + ') ' : '') + 'CMD';
  const l = document.querySelector('link[rel="icon"]'); if (!l) return;
  if (!n) { l.href = 'favicon.svg'; return; }
  const t = n > 99 ? '99+' : String(n), w = t.length > 2 ? 40 : t.length > 1 ? 34 : 28;
  l.href = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#07090d"/><circle cx="32" cy="32" r="12" fill="#9b7bff"/><circle cx="12" cy="16" r="6" fill="#3fd0c9"/><rect x="${64 - w}" y="0" width="${w}" height="30" rx="15" fill="#ff4d5e"/><text x="${64 - w / 2}" y="23" font-family="Arial,sans-serif" font-weight="700" font-size="${t.length > 2 ? 18 : 22}" fill="#fff" text-anchor="middle">${t}</text></svg>`);
}
// a snooze whose time is up goes back to the open list (checked on every tree update)
function actWake() {
  const now = Date.now();
  for (const [id, until] of Object.entries(actSnz)) {
    if (!until || until > now) continue;
    delete actSnz[id]; actSnzSave();
    const it = actItems.find(i => i.id === id);
    if (it && it.status === 'open' && it.snoozed) { it.snoozed = false; if (view === 'actions') renderActions(); }
    post('/api/actions/' + id, it ? { answers: it.answers, note: it.note, snoozed: false } : { snoozed: false }).catch(() => {});
  }
}
function renderActions() {
  const snoozed = actItems.filter(i => i.status === 'open' && i.snoozed);
  const open = actSorted(actItems.filter(i => i.status === 'open' && !i.snoozed)), done = actItems.filter(i => i.status !== 'open').sort((a, b) => (b.dstate === 'owner') - (a.dstate === 'owner') || (b.sentAt || b.withdrawnAt || b.closedAt || 0) - (a.sentAt || a.withdrawnAt || a.closedAt || 0));
  $('#actCount').textContent = open.length ? open.length + ' ' + tx('waiting') : '';
  if (actSel && !open.some(i => i.id === actSel)) actSel = null;
  $('#actList').innerHTML = open.length ? open.map((it, i) => actX[it.id] ? actCard(it, i + 1) : actRow(it, i + 1)).join('') : `<div class="act-empty">${tx('No decisions waiting.')}</div>`;
  const bulk = actBulkList().length, bb = $('#actBulk');
  bb.hidden = bulk < 2; bb.classList.toggle('armed', !!actBulkArm);
  bb.textContent = actBulkArm ? tx('Are you sure?') + ' ' + bulk + ' ' + tx('decisions will be sent') : tx('Apply all recommended') + ' (' + bulk + ')';
  $('#actSort').value = actSort;
  $('#actLaterBox').hidden = !snoozed.length;
  $('#actLaterN').textContent = snoozed.length ? '(' + snoozed.length + ')' : '';
  $('#actLater').innerHTML = snoozed.map(it => { const u = actSnz[it.id]; return `<div class="adone"><div class="arow"><b>${esc(it.title)}</b>${u ? `<small class="asnzu">${tx('back')} ${esc(actWhen(u))}</small>` : ''}<button type="button" class="atog nocaret" data-unsnooze="${it.id}">${tx('Undo')}</button></div></div>`; }).join('');
  $('#actDoneBox').hidden = !done.length;
  const owe = done.filter(i => i.dstate === 'owner').length;   // answered cards whose next step is the admin's
  $('#actDoneN').innerHTML = done.length ? '(' + done.length + ')' + (owe ? ` <span class="adst owner">· ${owe} ${tx('waiting on you')}</span>` : '') : '';
  $('#actDone').innerHTML = done.map(it => `<div class="adone"><b>${esc(it.title)}</b><span>${it.status === 'sent' ? '→ ' + esc((nodes[it.sentTo] || {}).name || it.sentTo) + ' · ' + esc(actSummary(it)) : it.status === 'closed' ? tx(String(it.why || '').startsWith('owner closed after answering') ? 'answered, closed' : 'closed: no longer needed') : tx('withdrawn') + (it.why ? ': ' + esc(it.why) : '')}</span>${actDoneLine(it)}</div>`).join('');
}
// was the answer carried out? done = the agent closed it with `cmd resolve`; waiting = not yet
function actDoneLine(it) {
  if (it.dstate === 'done' && it.done) {   // a chat close already shows its text as the answer: only the tick then
    const tx = String(it.done.text), dup = actSummary(it).includes(tx.slice(0, 80));
    return `<small class="adst ok">${tx('done')} ✓ ${esc(actWhen(it.done.at))}${dup ? '' : ': ' + esc(tx.slice(0, 160))}</small>`;
  }
  if (it.dstate === 'owner' && it.waiting) return `<small class="adst owner">${tx('Waiting on you')}: ${esc(String(it.waiting.text).slice(0, 160))}</small>`;
  if (it.dstate === 'waiting') return `<small class="adst wait">${esc((nodes[it.doer] || {}).name || it.doer || it.from)} ${tx('will do it, not closed yet')}</small>`;
  return '';
}
// "+ Other": a free-text answer to a pick question travels as the value "other:<text>"
const actOther = a => [].concat(a || []).find(v => String(v).startsWith('other:'));
const actVal = (q, v) => String(v).startsWith('other:') ? '“' + String(v).slice(6) + '”' : (q.options.find(o => o.v === v) || {}).l || v;
function actSummary(it) {
  return (it.sent || []).map(({ q, a }) => { return q.type === 'text' ? a : [].concat(a || []).map(v => actVal(q, v)).join(', '); }).filter(Boolean).join(' · ') + '';
}
function actCard(it, n) {
  const o = actOpen[it.id] || {};
  const qs = it.questions.map(q => {
    const a = it.answers[q.id];
    const body = q.type === 'text'
      ? `<input class="atext" data-a="${it.id}" data-q="${q.id}" value="${esc(a || '')}" placeholder="${esc(q.placeholder || '')}" autocomplete="off">`
      : `<div class="aopts"><div class="achips" role="group" aria-label="${esc(q.label || it.title)}">${q.options.map(op => {
          const on = q.type === 'many' ? [].concat(a || []).includes(op.v) : a === op.v;
          return `<button type="button" class="achip ${q.type}" data-a="${it.id}" data-q="${q.id}" data-v="${esc(op.v)}" aria-pressed="${on}"><span class="bx"></span><span>${esc(op.l)}</span>${op.rec ? `<span class="rec">${tx('recommended')}</span>` : ''}</button>`;
        }).join('')}${(() => {
          const ot = actOther(a), open = ot !== undefined || (o.other || {})[q.id];
          return `<button type="button" class="achip ${q.type} aother" data-a="${it.id}" data-q="${q.id}" aria-pressed="${!!open}" aria-expanded="${!!open}"><span class="bx"></span><span>+ ${tx('Other')}</span></button></div>${open ? `<input class="atext aothertxt" data-a="${it.id}" data-q="${q.id}" data-other="1" value="${esc(ot ? ot.slice(6) : '')}" placeholder="${tx('Write your own answer')}" maxlength="400" autocomplete="off">` : ''}`;
        })()}</div>`;
    return `<div class="aq${q.label ? '' : ' nolabel'}">${q.label ? `<span class="aql">${esc(q.label)}</span>` : ''}${body}</div>`;
  }).join('');
  return `<article class="acard${actReady(it) ? ' ready' : ''}${actSel === it.id ? ' sel' : ''}" data-card="${it.id}">
    <div class="ahead"><button type="button" class="anum aexp" data-exp="${it.id}" aria-expanded="true" title="${tx('Fold to one line (Enter)')}">${n}</button><div class="atitle"><b>${esc(it.title)}</b><div class="ameta">${it.kind === 'delete' ? `<span class="akind del">${tx('DELETE')}</span>` : ''}${it.project ? `<span class="site">${esc(it.project)}</span>` : ''}<span>${esc(actLabel(it))} ${tx('asks')}${it.createdAt ? ' · ' + esc(actWhen(it.createdAt)) : ''}</span></div></div></div>
    ${it.detail && !o.hideDet ? `<div class="apanel adetail">${esc(it.detail)}</div>` : ''}
    ${it.sent && it.sent.length ? `<div class="apanel asent">${tx('Sent')}: ${esc(actSummary(it))}</div>` : ''}
    ${qs}
    <div class="apanel"><textarea class="anote" data-a="${it.id}" rows="2" placeholder="${tx('Your own answer, condition or comment (you can send just this, without picking an option)')}">${esc(it.note)}</textarea></div>
    ${actThread(it)}
    <div class="afoot">
      ${it.detail ? `<button type="button" class="atog" data-tog="hideDet" data-a="${it.id}" aria-expanded="${!o.hideDet}">${tx(o.hideDet ? 'Show details' : 'Hide details')}</button>` : ''}
      <span class="asaved" data-sv="${it.id}"></span>
      <button type="button" class="atog nocaret" data-snooze="${it.id}" title="${tx('Move out of the waiting list, keep it at the bottom')}">${tx('Later')}</button>
      <button type="button" class="aclose${actArm.id === it.id ? ' armed' : ''}" data-aclose="${it.id}" title="${tx('Close without answering; the asking agent is told it is no longer needed')}">${tx(actArm.id === it.id ? 'Are you sure?' : 'Close / no longer needed')}</button>
      ${Object.keys(actRecs(it)).length ? `<button type="button" class="arec${actRecArm.id === it.id ? ' armed' : ''}" data-rec="${it.id}" title="${tx('Tick the recommended options and send (a)')}">${tx(actRecArm.id === it.id ? 'Are you sure?' : 'Apply recommended')}</button>` : ''}
      <button type="button" class="asend" data-send="${it.id}" ${actReady(it) ? '' : 'disabled'}>${tx(actReady(it) && !actAll(it) ? 'Send selected' : 'Send')}</button>
    </div>
  </article>`;
}
function actWhen(t) { const d = new Date(t); return d.toLocaleString(LOC, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
/** The conversation about a decision: the admin asks, the agent that asked answers with `cmd reply`. */
function actThread(it) {
  const th = it.thread || [], last = th[th.length - 1], waiting = last && last.from === 'owner';
  return `<div class="athread">
    ${th.map(m => `<div class="amsg ${m.from === 'owner' ? 'me' : 'them'}"><span class="awho">${m.from === 'owner' ? tx('You') : esc((nodes[m.from] || {}).name || m.from)} · ${esc(actWhen(m.at))}</span><div>${esc(m.text)}</div></div>`).join('')}
    ${waiting ? `<div class="await">${esc(actLabel(it))} ${tx('is writing an answer…')}</div>` : ''}
    <form class="achat" data-chat="${it.id}"><input class="achatin" placeholder="${tx(th.length ? 'Go on: ask a question, ask for details…' : 'Ask before deciding: why, how much, what could break, any alternative…')}" autocomplete="off"><button type="submit">${tx('Ask')}</button></form>
  </div>`;
}
$('#actionsView').addEventListener('submit', async e => {
  const f = e.target.closest('.achat'); if (!f) return;
  e.preventDefault();
  const inp = f.querySelector('.achatin'), text = inp.value.trim(); if (!text) return;
  const it = actItems.find(i => i.id === f.dataset.chat); if (!it) return;
  inp.disabled = true;
  try { const r = await post('/api/actions/' + it.id + '/ask', { text }); Object.assign(it, { thread: r.item.thread }); inp.value = ''; renderActions(); }
  catch (err) { alertBubble(err.message); inp.disabled = false; }
});
function actSave(it, now) {
  clearTimeout(actSaveT[it.id]);
  const go = () => post('/api/actions/' + it.id, { answers: it.answers, note: it.note })
    .then(() => { const s = document.querySelector(`[data-sv="${it.id}"]`); if (s) { s.textContent = tx('saved'); s.classList.remove('err'); } })
    .catch(e => { const s = document.querySelector(`[data-sv="${it.id}"]`); if (s) { s.textContent = e.message; s.classList.add('err'); } });
  if (now) return go();
  actSaveT[it.id] = setTimeout(go, 600);
}
function actRefreshCard(it) {
  const c = document.querySelector(`[data-card="${it.id}"]`);
  if (!c) return;
  c.classList.toggle('ready', actReady(it));
  const b = c.querySelector('.asend'); b.disabled = !actReady(it); b.textContent = tx(actReady(it) && !actAll(it) ? 'Send selected' : 'Send');
}
// "Close / no longer needed" arms on the first tap ("Are you sure?"), closes on a second tap within 4 s
const actArm = { id: null, t: 0 };
$('#actionsView').addEventListener('click', async e => {
  const ac = e.target.closest('[data-aclose]');
  if (ac) {
    const id = ac.dataset.aclose; clearTimeout(actArm.t);
    if (actArm.id !== id) { actArm.id = id; actArm.t = setTimeout(() => { actArm.id = null; renderActions(); }, 4000); return renderActions(); }
    actArm.id = null; clearTimeout(actSaveT[id]); ac.disabled = true; ac.textContent = tx('Closing…');
    try { await post('/api/actions/' + id + '/close', {}); } catch (err) { alertBubble(err.message); renderActions(); return; }
    return loadActions();
  }
  const sz = e.target.closest('[data-snooze],[data-unsnooze]');
  if (sz) {
    const id = sz.dataset.snooze || sz.dataset.unsnooze, it = actItems.find(i => i.id === id);
    clearTimeout(actSaveT[id]);
    it.snoozed = !!sz.dataset.snooze; if (!it.snoozed && actSnz[id]) { delete actSnz[id]; actSnzSave(); } renderActions();
    try { await post('/api/actions/' + id, { answers: it.answers, note: it.note, snoozed: it.snoozed }); } catch (err) { it.snoozed = !it.snoozed; renderActions(); }
    return;
  }
  const chip = e.target.closest('.achip'), tog = e.target.closest('.atog'), snd = e.target.closest('.asend');
  if (chip && chip.classList.contains('aother')) {
    const it = actItems.find(i => i.id === chip.dataset.a), q = it.questions.find(x => x.id === chip.dataset.q);
    const o = actOpen[it.id] = actOpen[it.id] || {}, oo = o.other = o.other || {};
    const open = actOther(it.answers[q.id]) !== undefined || oo[q.id];
    if (open) {   // closing drops the typed answer
      oo[q.id] = false;
      if (q.type === 'many') it.answers[q.id] = [].concat(it.answers[q.id] || []).filter(v => !String(v).startsWith('other:'));
      else if (actOther(it.answers[q.id]) !== undefined) it.answers[q.id] = '';
      actSave(it);
    } else oo[q.id] = true;
    renderActions();
    if (!open) { const t = document.querySelector(`.aothertxt[data-a="${it.id}"][data-q="${q.id}"]`); if (t) t.focus(); }
  } else if (chip) {
    const it = actItems.find(i => i.id === chip.dataset.a), q = it.questions.find(x => x.id === chip.dataset.q), v = chip.dataset.v;
    if (q.type !== 'many' && ((actOpen[it.id] || {}).other || {})[q.id]) { actOpen[it.id].other[q.id] = false; it.answers[q.id] = it.answers[q.id] === v ? '' : v; renderActions(); actSave(it); return; }
    if (q.type === 'many') { const cur = [].concat(it.answers[q.id] || []); it.answers[q.id] = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]; }
    else it.answers[q.id] = it.answers[q.id] === v ? '' : v;
    chip.closest('.achips').querySelectorAll('.achip:not(.aother)').forEach(b => b.setAttribute('aria-pressed', String(q.type === 'many' ? it.answers[q.id].includes(b.dataset.v) : it.answers[q.id] === b.dataset.v)));
    actRefreshCard(it); actSave(it);
  } else if (tog) {
    const o = actOpen[tog.dataset.a] = actOpen[tog.dataset.a] || {};
    o[tog.dataset.tog] = !o[tog.dataset.tog];
    renderActions();
    if (tog.dataset.tog === 'note' && o.note) { const t = document.querySelector(`.anote[data-a="${tog.dataset.a}"]`); if (t) t.focus(); }
  } else if (snd) {
    const it = actItems.find(i => i.id === snd.dataset.send);
    snd.disabled = true; snd.textContent = tx('Sending…');
    clearTimeout(actSaveT[it.id]);
    try { await post('/api/actions/' + it.id + '/send', { answers: it.answers, note: it.note }); }
    catch (err) { snd.disabled = false; snd.textContent = tx('Send'); const s = document.querySelector(`[data-sv="${it.id}"]`); if (s) { s.textContent = err.message; s.classList.add('err'); } return; }
    loadActions();
  }
});
$('#actionsView').addEventListener('input', e => {
  const el = e.target, it = el.dataset.a && actItems.find(i => i.id === el.dataset.a);
  if (!it) return;
  if (el.dataset.other) {
    const q = it.questions.find(x => x.id === el.dataset.q), t = el.value.trim(), ov = t ? 'other:' + t : null;
    if (q.type === 'many') it.answers[q.id] = [].concat(it.answers[q.id] || []).filter(v => !String(v).startsWith('other:')).concat(ov ? [ov] : []);
    else {
      it.answers[q.id] = ov || '';
      el.closest('.aq').querySelectorAll('.achip:not(.aother)').forEach(b => b.setAttribute('aria-pressed', 'false'));
    }
  } else if (el.classList.contains('atext')) it.answers[el.dataset.q] = el.value; else if (el.classList.contains('anote')) it.note = el.value; else return;
  actRefreshCard(it); actSave(it);
});

$('#actionsView').addEventListener('click', async e => {
  const ex = e.target.closest('[data-exp]'), rc = e.target.closest('[data-rec]'), sm = e.target.closest('[data-snzm]'), sn = e.target.closest('[data-snz]');
  if (ex) { const id = ex.dataset.exp; actSel = id; actX[id] = !actX[id]; renderActions(); actFocus(); return; }
  if (sm) { const o = actOpen[sm.dataset.snzm] = actOpen[sm.dataset.snzm] || {}; o.snz = true; actSel = sm.dataset.snzm; return renderActions(); }
  if (sn) {
    const id = sn.dataset.snz, it = actItems.find(i => i.id === id), f = sn.dataset.for, d = new Date();
    (actOpen[id] || {}).snz = false;
    const until = f === '1h' ? Date.now() + 3600e3 : f === '4h' ? Date.now() + 4 * 3600e3 : f === 'tm' ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 9).getTime() : 0;
    if (until) actSnz[id] = until; else delete actSnz[id]; actSnzSave();
    it.snoozed = true; renderActions();
    try { await post('/api/actions/' + id, { answers: it.answers, note: it.note, snoozed: true }); } catch (err) { it.snoozed = false; renderActions(); }
    return;
  }
  if (rc) {
    const id = rc.dataset.rec, it = actItems.find(i => i.id === id); clearTimeout(actRecArm.t);
    // a delete card is never one tap: the first tap arms it ("Are you sure?")
    if (it.kind === 'delete' && actRecArm.id !== id) { actRecArm.id = id; actRecArm.t = setTimeout(() => { actRecArm.id = null; renderActions(); }, 4000); return renderActions(); }
    actRecArm.id = null; rc.disabled = true; rc.textContent = tx('Sending…');
    try { await actApply(it); } catch (err) { alertBubble(err.message); renderActions(); return; }
    return loadActions();
  }
  if (e.target.closest('#actBulk')) {
    clearTimeout(actBulkT);
    if (!actBulkArm) { actBulkArm = 1; actBulkT = setTimeout(() => { actBulkArm = 0; renderActions(); }, 5000); return renderActions(); }
    actBulkArm = 0; const list = actBulkList(), bb = $('#actBulk'); bb.disabled = true;
    let ok = 0;
    for (const it of list) { bb.textContent = tx('Sending…') + ' ' + (ok + 1) + '/' + list.length; try { await actApply(it); ok++; } catch (err) { alertBubble(it.title + ': ' + err.message); } }
    bb.disabled = false; return loadActions();
  }
});
$('#actSort').addEventListener('change', e => { actSort = e.target.value; try { localStorage.setItem('cmd.actSort', actSort); } catch {} renderActions(); });
function actFocus() {
  const c = actSel && document.querySelector(`#actList [data-card="${actSel}"]`); if (!c) return;
  c.scrollIntoView({ block: 'nearest' }); const b = c.querySelector('.aexp'); if (b) b.focus({ preventScroll: true });
}
// j/k move, Enter folds/unfolds, a = apply recommended (not while typing)
document.addEventListener('keydown', e => {
  if (view !== 'actions' || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
  const tg = e.target; if (tg.closest && tg.closest('input,textarea,select,[contenteditable="true"]')) return;
  const ids = [...document.querySelectorAll('#actList [data-card]')].map(c => c.dataset.card); if (!ids.length) return;
  const i = ids.indexOf(actSel);
  if (e.key === 'j' || e.key === 'k') {
    e.preventDefault(); actSel = ids[Math.max(0, Math.min(ids.length - 1, i < 0 ? 0 : i + (e.key === 'j' ? 1 : -1)))];
    document.querySelectorAll('#actList .acard.sel').forEach(c => c.classList.remove('sel'));
    const c = document.querySelector(`#actList [data-card="${actSel}"]`); c.classList.add('sel'); actFocus();
  } else if (e.key === 'Enter' && actSel && !(tg.closest && tg.closest('button:not(.aexp)'))) {
    e.preventDefault(); actX[actSel] = !actX[actSel]; renderActions(); actFocus();
  } else if (e.key === 'a' && actSel) {
    const b = document.querySelector(`#actList [data-rec="${actSel}"]`); if (b) { e.preventDefault(); b.click(); }
  }
});

/* ================================================================ live feed */
const shortName = id => { const n = nodes[id]; return n ? n.name.replace(/ (agent|team|desk)$/i, '') : id; };
/* The feed lives in liveBuf (newest first, 120 max); its rows are in the DOM only while the Live tab is open, so a long
   feed does not keep ~1000 elements behind the chat. */
const liveBuf = [];
function liveItem(e, quiet) {
  liveBuf.unshift(e); if (liveBuf.length > 120) liveBuf.length = 120;
  if (!quiet) { flash(e.agent, e.kind === 'ai' ? '#3fd0c9' : e.kind === 'eco-done' ? '#6ee7a0' : e.kind === 'eco-sys' ? '#ffc46b' : '#a3e05f'); } liveBadge();
  const n = nodes[e.agent]; if (n && e.kind !== 'eco-sys') { n.liveText = e.text; n.liveAt = e.at; }
  if (ctab !== 'live') return;
  const list = $('#liveList'); const empty = list.querySelector('.lempty'); if (empty) empty.remove();
  const el = liveRow(e, !quiet);
  list.prepend(el);
  while (list.querySelectorAll('.li').length > 120) list.querySelector('.li:last-of-type').remove();
  if (!quiet) setTimeout(() => el.classList.remove('new'), 1200);
}
/* The Live badge counts only unread rows: newer than the last time the Live tab was open (cmd.liveSeen, kept across
   reloads), in the group filter picked there, and never the 'System' noise unless that filter is picked. */
let liveSeen = 0; try { liveSeen = +localStorage.getItem('cmd.liveSeen') || 0; } catch {}
const liveAt = e => { const v = typeof e.at === 'number' ? e.at : Date.parse(e.at); return isNaN(v) ? 0 : v; };
const liveGrp = e => e.kind === 'eco-sys' ? 'sys' : 'agents';
function liveBadge() {
  if (ctab === 'live' && !document.hidden && liveBuf.length) {
    const top = liveAt(liveBuf[0]);
    if (top > liveSeen) { liveSeen = top; try { localStorage.setItem('cmd.liveSeen', String(liveSeen)); } catch {} }
  }
  liveUnseen = ctab === 'live' ? 0 : liveBuf.filter(e => liveAt(e) > liveSeen && (liveFilter === 'all' ? liveGrp(e) !== 'sys' : liveGrp(e) === liveFilter)).length;
  $('#liveCount').textContent = liveUnseen ? String(liveUnseen > 99 ? '99+' : liveUnseen) : '';
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) liveBadge(); });
function liveDraw() {
  const list = $('#liveList'); list.querySelectorAll('.li').forEach(x => x.remove());
  if (ctab !== 'live' || !liveBuf.length) return;
  const empty = list.querySelector('.lempty'); if (empty) empty.remove();
  const f = document.createDocumentFragment(); liveBuf.forEach(e => f.append(liveRow(e, false))); list.append(f);
}
function liveRow(e, fresh) {
  const el = document.createElement('div');
  el.className = 'li ' + (e.kind || 'log') + (fresh ? ' new' : '');
  el.dataset.at = e.at;
  const nd = nodes[e.agent], ic = nd ? (nd.role === 'lead' || nd.id === 'brain' ? ICONS[nd.id === 'brain' ? 'brain' : 'lead'] : iconFor(nd)) : ICONS.worker;
  el.dataset.grp = liveGrp(e);
  if (liveFilter !== 'all' && el.dataset.grp !== liveFilter) el.hidden = true;
  el.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ic}"/></svg>
    <div class="lb"><div class="lt1"><b>${esc(shortName(e.agent))}</b><time>${esc(ago(e.at))}</time></div>
    <div class="lt2">${esc(e.text)}</div></div>`;
  el.onclick = ev => { if (!ev.target.closest('a') && nodes[e.agent]) nodeClick(nodes[e.agent]); };
  return el;
}
let liveFilter = 'all';
try { liveFilter = localStorage.getItem('cmd.liveFilter') || 'all'; } catch {}
if (!['all', 'agents', 'sys'].includes(liveFilter)) liveFilter = 'all';
function setLiveFilter(f) {
  liveFilter = f; try { localStorage.setItem('cmd.liveFilter', f); } catch {}
  document.querySelectorAll('[data-lf]').forEach(b => b.classList.toggle('on', b.dataset.lf === f));
  document.querySelectorAll('#liveList .li').forEach(x => { x.hidden = f !== 'all' && x.dataset.grp !== f; });
}
document.querySelectorAll('[data-lf]').forEach(b => b.onclick = () => setLiveFilter(b.dataset.lf));
setLiveFilter(liveFilter);
/* chat window tabs: Chat | Live */
let ctab = 'chat', liveUnseen = 0;
try { ctab = localStorage.getItem('cmd.ctab') || 'chat'; } catch {}
function placeLive() {
  document.querySelectorAll('[data-ctab]').forEach(b => b.classList.toggle('on', b.dataset.ctab === ctab));
  chatEl.classList.toggle('t-live', ctab === 'live');
  $('#livePane').hidden = ctab !== 'live';
  if ((ctab === 'live') !== !!placeLive.drawn) { placeLive.drawn = ctab === 'live'; liveDraw(); }
  liveBadge();
}
document.querySelectorAll('[data-ctab]').forEach(b => b.onclick = () => { ctab = b.dataset.ctab; try { localStorage.setItem('cmd.ctab', ctab); } catch {} placeLive(); if (ctab === 'chat') setTimeout(() => $('#frontInput').focus(), 30); });
setInterval(() => { for (const el of document.querySelectorAll('#liveList .li')) { const t = el.querySelector('time'); if (t) t.textContent = ago(+el.dataset.at); } }, 15000);
let firstFit = true;
function connect() {
  const es = new EventSource('/api/stream');
  es.addEventListener('tree', e => {
    // idle page: take the newest tree at most every 20s instead of redrawing the whole map on every change
    if (document.body.classList.contains('idle') && !firstFit) {
      idleTree.t = JSON.parse(e.data);
      if (!idleTree.timer) idleTree.timer = setTimeout(() => { idleTree.timer = null; if (idleTree.t) { const x = idleTree.t; idleTree.t = null; applyTree(x); } }, 20000);
      return;
    }
    applyTree(JSON.parse(e.data));
    if (firstFit) { firstFit = false; setTimeout(() => fit(false), 900); }
  });
  es.addEventListener('tasks', () => { if (window.loadTasks) loadTasks(); });
  es.addEventListener('jobs', () => { if (window.loadJobs) loadJobs(); });
  es.addEventListener('pulse', e => { const ev = JSON.parse(e.data); if (!quiet()) pulse(ev); feedItem(ev); });
  // a desk opened a topic: show it on the map only; the chat stays with the desk, which relays
  es.addEventListener('moved', e => { try { followMoved(JSON.parse(e.data)); } catch {} });
  es.addEventListener('focus', e => { const f = JSON.parse(e.data); setTimeout(() => { if (nodes[f.id]) flash(f.id, ROLE_C.topic, f.reused ? 'back to ' + f.name : 'new bubble: ' + f.name); }, nodes[f.id] ? 0 : 2200); });
  es.addEventListener('live', e => { const ev = JSON.parse(e.data); liveItem(ev); const n = nodes[ev.agent]; if (n) gNodes.select(`g.node[data-id="${ev.agent}"] text.meta`).text(metaText(n)); });
  es.addEventListener('livehist', e => { $('#liveList').querySelectorAll('.li').forEach(x => x.remove()); liveBuf.length = 0; JSON.parse(e.data).forEach(ev => liveItem(ev, true)); if (!liveSeen && liveBuf.length) liveSeen = liveAt(liveBuf[0]); liveBadge(); });  // first visit: history counts as read
  es.addEventListener('history', e => { JSON.parse(e.data).slice(-3).forEach(ev => feedItem(ev, true)); });
  es.onopen = () => { $('#livePill').classList.add('on'); $('#livePill').lastChild.textContent = tx('live'); };
  es.onerror = () => {
    $('#livePill').classList.remove('on'); $('#livePill').lastChild.textContent = tx('reconnecting');
    fetch('/api/tree').then(r => { if (r.status === 401) location.href = '/login'; });
  };
}
connect();

/* ================================================================ chrome */
$('#logout').onclick = async () => { await post('/api/logout'); location.href = '/login'; };

document.addEventListener('keydown', e => { if (e.key === 'Escape' && !setEl.hidden) return closeSettings(); if (e.key === 'Escape' && selected && document.activeElement.tagName !== 'TEXTAREA' && tab !== 'term') closeDrawer(); });

/* ================================================================ server health widget (admin only, bottom right of the map) */
(function srvWidget() {
  const el = $('#srv'); if (!el) return;
  const gb = b => b >= 1e12 ? (b / 1e12).toFixed(1) + 'T' : (b / 1e9).toFixed(b >= 1e10 ? 0 : 1) + 'G';
  const cls = p => p >= 90 ? 'b' : p >= 75 ? 'w' : '';
  const row = (k, p, t) => `<span>${k}</span><div class="bar"><u class="${cls(p)}" style="width:${Math.min(100, p)}%"></u></div><em title="${t || ''}">${p}%</em>`;
  const word = { ok: 'SERVER OK', warn: 'SERVER BUSY', bad: 'SERVER STRAINED' };
  const open = () => hpopOpen('srv');
  srvPull = () => pull();
  let lastHtml = '';
  async function pull() {
    if (!me || !me.admin) { el.hidden = true; return; }
    if (document.hidden) return;
    try {
      const s = await (await fetch('/api/server', { credentials: 'same-origin' })).json();
      if (!s || !s.at) return;
      el.className = 'srv hpop ' + s.level; el.hidden = !open();
      const chip = $('#srvChip'); chip.hidden = false; chip.className = 'hchip srv-' + s.level;
      setHTML(chip, `<i></i><span>Server</span><b>${s.cpu == null ? s.load[0] : s.cpu + '%'}</b>`);
      chip.title = `${word[s.level] || 'SERVER'} · load ${s.load.join(' / ')} on ${s.cores} cores · RAM ${s.mem.p}%`;
      const up = s.uptime > 86400 ? Math.floor(s.uptime / 86400) + 'd' : Math.floor(s.uptime / 3600) + 'h';
      const html = `<div class="sh"><i></i>${word[s.level] || 'SERVER'}<b>load ${s.load[0]} / ${s.cores}</b></div>
        <div class="rows">${row('CPU', s.cpu == null ? 0 : s.cpu)}${row('RAM', s.mem.p, gb(s.mem.used) + ' / ' + gb(s.mem.total))}${row('SWAP', s.swap.p, gb(s.swap.used) + ' / ' + gb(s.swap.total))}${s.disk ? row('DISK', s.disk.p, gb(s.disk.used) + ' / ' + gb(s.disk.total)) : ''}</div>
        ${s.gov ? `<div class="gov${s.gov.pressure ? ' on' : ''}"><span>GOVERNOR</span>${!s.gov.enabled ? 'off' : s.gov.pressure ? 'easing load' : 'standing by'}${s.gov.asleep.length ? ` · ${s.gov.asleep.length} asleep` : ''}${s.gov.heavy.running.length || s.gov.heavy.waiting ? ` · heavy ${s.gov.heavy.running.length}/${s.gov.slots}${s.gov.heavy.waiting ? ' +' + s.gov.heavy.waiting + ' queued' : ''}` : ''}</div>` : ''}
        <div class="more"><div>load 1/5/15 <b>${s.load.join(' · ')}</b></div><div>uptime <b>${up}</b></div>${s.gov && s.gov.asleep.length ? `<div>asleep<b>${s.gov.asleep.map(id => esc((nodes[id] && nodes[id].name) || id)).join(', ')}</b></div>` : ''}${s.gov ? s.gov.heavy.running.map(h => `<div>heavy · ${esc(h.agent || '?')}<b>${esc(h.cmd.slice(0, 34))}</b></div>`).join('') : ''}${(s.top || []).map(t => `<div>${esc(t.name)} ×${t.n}<b>${t.cpu}% · ${gb(t.mem)}</b></div>`).join('')}</div>`;
      if (html !== lastHtml) { lastHtml = html; el.innerHTML = html; }
      el.title = `RAM ${gb(s.mem.used)}/${gb(s.mem.total)} · swap ${gb(s.swap.used)}/${gb(s.swap.total)}${s.disk ? ' · disk ' + gb(s.disk.used) + '/' + gb(s.disk.total) : ''}`;
    } catch {}
  }
  // every 30 s on the map, 60 s on an idle page, every 5 s only while the panel is open
  (function loop() { setTimeout(() => { pull(); loop(); }, open() ? 5000 : document.body.classList.contains('idle') ? 60000 : 30000); })(); setTimeout(pull, 800);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
})();

/* Cmd+K / Ctrl+K command palette. One box to jump anywhere: views, any agent (Enter opens its
   panel, Shift+Enter its chat bubble when it has one), open Actions cards and a few toggles. Arrows move, Esc closes. */
(() => {
  document.body.insertAdjacentHTML('beforeend', `<div class="kpal" id="kpal" hidden><div class="kbox" role="dialog" aria-label="${tx('Command palette')}">
    <input id="kpIn" placeholder="${tx('Search agents, tabs or decisions… (Enter: go on the map)')}" autocomplete="off" spellcheck="false">
    <div class="klist" id="kpList" role="listbox"></div>
    <div class="kfoot"><span><kbd>↑</kbd><kbd>↓</kbd> ${tx('select')}</span><span><kbd>Enter</kbd> ${tx('go on the map')}</span><span><kbd>Shift</kbd>+<kbd>Enter</kbd> ${tx('chat')}</span><span><kbd>Esc</kbd> ${tx('close')}</span></div></div></div>`);
  const box = $('#kpal'), inp = $('#kpIn'), list = $('#kpList');
  let items = [], shown = [], cur = 0;
  const VIEWS = [['map', 'Map'], ['cc', 'Command center'], ['actions', 'Actions'], ['log', 'Changelog'], ['rules', 'Rules'], ['agents', 'Agents'], ['queue', 'Queue'], ['jobs', 'Jobs']];
  const ST = { working: 0, idle: 1, asleep: 2, starting: 1, login: 1, offline: 3, stopped: 4 };
  function build() {
    const adm = me && me.admin, out = [];
    for (const [v, l] of VIEWS) if (adm || v === 'map' || v === 'cc') out.push({ k: 'Tab', t: tx(l), s: v === view ? tx('open') : '', go: () => setView(v) });
    if (adm) for (const it of actItems.filter(i => i.status === 'open')) out.push({ k: 'Decision', t: it.title, s: actLabel(it) + (it.snoozed ? ' · ' + tx('later') : ''), go: () => { if (it.snoozed) return setView('actions'); actX[it.id] = true; actSel = it.id; setView('actions'); setTimeout(() => { renderActions(); actFocus(); }, 400); } });
    Object.values(nodes).filter(n => n.name).sort((a, b) => (ST[a.state] ?? 2) - (ST[b.state] ?? 2) || String(a.name).localeCompare(String(b.name)))
      .forEach(n => out.push({ k: 'Agent', t: uiName(n.name), s: [n.role, n.state, leadOf(n) && leadOf(n).id !== n.id ? uiName(leadOf(n).name) : ''].filter(Boolean).join(' · '), st: n.state, id: n.id, chat: isBranch(n), go: sh => { if (sh && isBranch(n)) { switchChat(n.id); openChat(); } else mapGoTo(n.id); } }));
    out.push({ k: 'Command', t: tx('Notifications'), go: () => notifShow(true) });
    if (adm) out.push({ k: 'Command', t: tx('Accounts'), go: () => hpop('limitsBox', true) }, { k: 'Command', t: tx('Server load'), go: () => hpop('srv', true) });
    out.push({ k: 'Command', t: tx('Internal traffic on/off'), go: () => { const b = document.querySelector('.innerbtn'); if (b) b.click(); } });
    out.push({ k: 'Command', t: tx('Open chat'), go: () => openChat() });
    if (adm) out.push({ k: 'Command', t: tx('Settings'), go: () => openSettings() });
    return out;
  }
  // subsequence match, scored: prefix > word start > anywhere; locale-aware lower case
  const low = s => String(s || '').toLocaleLowerCase(LOC);
  function score(q, it) {
    const t = low(it.t), s = low(it.s);
    if (!q) return 1;
    if (t.startsWith(q)) return 100 - t.length / 100;
    const i = t.indexOf(q); if (i >= 0) return (/[\s.·:\-/(]/.test(t[i - 1]) ? 80 : 60) - i / 100;
    if (s.includes(q) || low(it.k).startsWith(q)) return 30;
    let j = 0; for (const c of t) if (c === q[j]) j++;
    return j === q.length ? 10 : 0;
  }
  function draw() {
    const q = low(inp.value.trim());
    let sc = items.map(it => [score(q, it) - (it.st === 'stopped' ? 5 : 0), it]).filter(x => x[0] > 0);
    if (sc.filter(x => x[0] > 20).length >= 5) sc = sc.filter(x => x[0] > 20);   // enough real matches: drop the loose ones
    shown = sc.sort((a, b) => b[0] - a[0]).slice(0, 40).map(x => x[1]);
    if (cur >= shown.length) cur = Math.max(0, shown.length - 1);
    list.innerHTML = shown.length ? shown.map((it, i) => `<div class="kit${i === cur ? ' on' : ''}" role="option" aria-selected="${i === cur}" data-i="${i}"><span class="kk k-${esc(it.k)}">${esc(tx(it.k))}</span>${it.st ? `<i class="kdot s-${esc(it.st)}"></i>` : ''}<b>${esc(it.t)}</b><small>${esc(it.s || '')}${it.chat ? ' · ⇧↵ ' + tx('chat') : ''}</small></div>`).join('') : `<div class="kempty">${tx('No results')}</div>`;
    const on = list.querySelector('.kit.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function open() { items = build(); inp.value = ''; cur = 0; box.hidden = false; draw(); inp.focus(); }
  function close() { box.hidden = true; }
  function run(i, sh) { const it = shown[i]; if (!it) return; close(); it.go(sh); }
  window.kpalOpen = open;
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); return box.hidden ? open() : close(); }
  });
  inp.addEventListener('input', () => { cur = 0; draw(); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % Math.max(1, shown.length); draw(); }
    else if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); run(cur, e.shiftKey); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  list.addEventListener('click', e => { const k = e.target.closest('.kit'); if (k) run(+k.dataset.i, e.shiftKey); });
  box.addEventListener('pointerdown', e => { if (e.target === box) close(); });
})();

/* The palette's agent pick flies the map to the bubble: dives into its lead, opens every parent between them, centres it, pulses it, opens its panel.
   Topics are not drawn on the map, so a topic opens its chat instead. */
function mapGoTo(id) {
  const n = nodes[id]; if (!n) return;
  if (n.role === 'front') return nodeClick(n);
  if (n.role === 'topic') { switchChat(n.id); openChat(); return; }
  const lead = leadOf(n), chain = [];
  for (let p = mapParentOf(n), i = 0; p && lead && p !== lead.id && i++ < 20; p = mapParentOf(nodes[p] || {})) chain.push(p);
  if (view !== 'map') setView('map');
  const pulse = () => {
    const el = document.querySelectorAll(`#map [data-id="${CSS.escape(id)}"], svg [data-id="${CSS.escape(id)}"]`);
    el.forEach(e => { e.classList.remove('kgo'); void e.getBBox; e.classList.add('kgo'); setTimeout(() => e.classList.remove('kgo'), 2600); });
  };
  const after = () => {
    openSet.clear(); chain.forEach(c => openSet.add(c)); if (moonsOf(n).length && n.id !== (lead && lead.id)) openSet.add(n.id);
    render(); setTimeout(() => { fit(true); pulse(); }, 650);
  };
  if (lead && lead.id !== 'brain') {
    if (combActive() && focusLead !== lead.id) { combDive(lead.id); setTimeout(after, 700); }
    else { focusLead = lead.id; after(); }
  } else { focusLead = null; openSet.clear(); render(); setTimeout(() => { fit(true); pulse(); }, 650); }
  if (me && (me.admin || me.perms.talk || me.perms.terminal || me.perms.manage)) openDrawer(id);
}
{ const b = document.getElementById('kpalBtn'); if (b) b.onclick = e => { e.stopPropagation(); if (window.kpalOpen) window.kpalOpen(); }; }

/* phones get the command palette from the bottom bar */
{ const b = document.getElementById('mPal'); if (b) b.onclick = e => { e.stopPropagation(); if (window.kpalOpen) window.kpalOpen(); }; }

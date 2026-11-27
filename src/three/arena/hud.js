// Arena DOM HUD: player card (level/XP ring, health, energy, combo), Q/W/E/R + SMASH buttons, leaderboard (crown + bounty),
// kill feed, banners, event bar, boss bar, toasts, DOM chat with history, minimap, connection modals (incl. 4010).
import { takeover } from '../../core/Identity.js';
import { WORLD_W, WORLD_H } from './source.js';
import { levelTitle } from './view.js';
import { skillCost } from './input.js';

const LEVEL_XP = [0, 60, 600, 1800, 4500, 10000]; // mirrors server XP curve
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const CSS = `
.bsa{position:fixed;inset:0;pointer-events:none;z-index:6;font:13px "Segoe UI",system-ui,sans-serif;color:#e8eefc;user-select:none;-webkit-user-select:none}
.bsa *{box-sizing:border-box}.bsa .pe{pointer-events:auto}
.bsa-card{position:absolute;left:10px;top:10px;display:flex;gap:10px;align-items:center;background:rgba(10,14,24,.72);border:1px solid #2b3347;border-radius:12px;padding:8px 12px 8px 8px}
.bsa-ring{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#ffd23f var(--p,0%),#2b3347 0)}
.bsa-ring i{font-style:normal;width:42px;height:42px;border-radius:50%;background:#0d1220;display:grid;place-items:center;font:700 18px monospace;color:#ffd23f}
.bsa-name{font-weight:700;font-size:14px}.bsa-sub{font:11px monospace;color:#9fb0d0}
.bsa-bar{height:10px;width:170px;background:#151a26;border-radius:5px;overflow:hidden;margin-top:4px;border:1px solid #2b3347}.bsa-bar b{display:block;height:100%;width:0;transition:width .15s}
.bsa-combo{position:absolute;left:12px;top:84px;font:900 22px monospace;text-shadow:0 2px 0 #000;display:none}
.bsa-lb{position:absolute;right:10px;top:178px;min-width:170px;background:rgba(10,14,24,.68);border:1px solid #2b3347;border-radius:10px;padding:6px 9px;font:12px monospace}
.bsa-lb div{display:flex;justify-content:space-between;gap:10px;white-space:nowrap}.bsa-lb .me{color:#ffd23f}.bsa-lb h4{margin:0 0 3px;font:700 11px monospace;color:#7ed957;letter-spacing:1px}
.bsa-mm{position:absolute;right:10px;top:10px;border:1px solid #2b3347;border-radius:8px;background:rgba(10,14,24,.7);overflow:hidden}
.bsa-menu{position:absolute;right:182px;top:10px;width:36px;height:36px;border-radius:9px;border:1px solid #2b3347;background:rgba(10,14,24,.72);color:#e8eefc;font-size:18px;cursor:pointer}
.bsa-feed{position:absolute;left:10px;top:132px;display:flex;flex-direction:column;gap:2px;font:12px monospace;text-shadow:0 1px 2px #000;max-width:46vw}
.bsa-feed div{background:rgba(10,14,24,.5);padding:1px 6px;border-radius:4px;transition:opacity .6s}.bsa-feed .mine{outline:1px solid #ffd23f}
.bsa-chat{position:absolute;left:10px;bottom:10px;width:min(360px,60vw);display:flex;flex-direction:column;gap:3px;font:12px monospace}
.bsa-chat .log{display:flex;flex-direction:column;gap:2px;max-height:150px;overflow:hidden;text-shadow:0 1px 2px #000}.bsa-chat .log div{background:rgba(10,14,24,.5);padding:1px 6px;border-radius:4px;word-break:break-word}
.bsa-chat input{pointer-events:auto;width:100%;background:rgba(10,14,24,.85);color:#fff;border:1px solid #39c2ff;border-radius:6px;padding:5px 8px;font:12px monospace;display:none}
.bsa-chatbtn{pointer-events:auto;align-self:flex-start;background:rgba(10,14,24,.72);border:1px solid #2b3347;color:#9fb0d0;border-radius:8px;padding:3px 9px;font:11px monospace;cursor:pointer}
.bsa-ev{position:absolute;left:50%;top:10px;transform:translateX(-50%);min-width:240px;text-align:center;background:rgba(10,14,24,.78);border:2px solid var(--c,#ff9800);border-radius:10px;padding:4px 14px;display:none}
.bsa-ev b{display:block;height:5px;margin-top:3px;background:var(--c,#ff9800);border-radius:3px;width:100%}
.bsa-boss{position:absolute;left:50%;top:62px;transform:translateX(-50%);width:min(520px,52vw);display:none;text-align:center;font:700 13px monospace;text-shadow:0 1px 2px #000}
.bsa-boss div{height:16px;background:#2a0f12;border:2px solid #ff3b3b;border-radius:8px;overflow:hidden}.bsa-boss b{display:block;height:100%;background:linear-gradient(#ff5a4a,#c71f1f);width:100%}
.bsa-banner{position:absolute;left:50%;top:21%;transform:translate(-50%,-10px);text-align:center;opacity:0;transition:opacity .25s,transform .25s;background:rgba(10,14,24,.82);border:2px solid var(--c,#ffd23f);border-radius:12px;padding:10px 22px;max-width:86vw}
.bsa-banner.on{opacity:1;transform:translate(-50%,0)}.bsa-banner h2{margin:0;font:900 24px "Segoe UI",system-ui;color:var(--c,#ffd23f)}.bsa-banner.big h2{font-size:34px}.bsa-banner p{margin:4px 0 0;color:#cfd8f0}
.bsa-toast{position:absolute;left:50%;bottom:150px;transform:translateX(-50%);background:rgba(10,14,24,.85);border:1px solid var(--c,#7ed957);border-radius:10px;padding:7px 14px;color:#fff;opacity:0;transition:opacity .3s;max-width:88vw;text-align:center}
.bsa-toast.on{opacity:1}
.bsa-tip{position:absolute;left:50%;bottom:70px;transform:translateX(-50%);background:rgba(20,27,54,.78);border:1px dashed #39c2ff;border-radius:8px;padding:5px 12px;font:12px monospace;color:#bfe8ff;display:none;max-width:80vw;text-align:center}
.bsa-skills{position:absolute;right:14px;bottom:14px;display:flex;gap:10px;align-items:flex-end}
.bsa-sk{pointer-events:auto;position:relative;width:62px;height:62px;border-radius:50%;border:2px solid #39c2ff;background:rgba(14,22,44,.85);color:#fff;font:700 20px monospace;cursor:pointer;display:grid;place-items:center;touch-action:none}
.bsa-sk small{position:absolute;bottom:-1px;left:0;right:0;text-align:center;font:10px monospace;color:#9fb0d0}.bsa-sk em{position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:#0d1220;border:1px solid #2b3347;border-radius:6px;font:10px monospace;font-style:normal;padding:0 4px;color:#9fb0d0}
.bsa-sk .cd{position:absolute;inset:0;border-radius:50%;background:conic-gradient(rgba(0,0,0,.7) var(--cd,0%),transparent 0)}
.bsa-sk.off{opacity:.4}.bsa-smash{width:84px;height:84px;border-color:#7ed957;font-size:15px}
.bsa-broken{position:absolute;inset:0;background:rgba(40,0,0,.45);display:none;place-items:center;text-align:center}.bsa-broken h1{margin:0;font:900 34px "Segoe UI",system-ui;color:#ff8a8a;text-shadow:0 2px 0 #000}
.bsa-modal{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;background:rgba(5,8,18,.8);padding:16px;pointer-events:auto}
.bsa-modal div.box{max-width:440px;width:100%;background:#141b36;border:2px solid #39c2ff;border-radius:12px;padding:20px;text-align:center}
.bsa-modal h3{margin:0 0 8px;font-size:20px}.bsa-modal p{white-space:pre-line;color:#b8c4e4;margin:0 0 14px}.bsa-modal button{margin:0 5px;padding:10px 16px;border-radius:8px;border:0;background:#7ed957;color:#10230a;font-weight:700;cursor:pointer;font-size:14px}
.bsa-conn{position:absolute;left:50%;top:48px;transform:translateX(-50%);background:#5a2a10;border:1px solid #ff9800;color:#ffd9a8;border-radius:8px;padding:3px 12px;font:12px monospace;display:none}
@media (max-width:760px){.bsa-lb{display:none}.bsa-bar{width:120px}.bsa-menu{right:10px;top:104px}.bsa-sk{width:54px;height:54px}.bsa-feed{top:112px}}
`;

export function createArenaHud({ source, view, input, root: parent = document.body, onExit, getTips = true }) {
  const style = el('style'); style.textContent = CSS; document.head.appendChild(style);
  const root = el('div', 'bsa'); parent.appendChild(root);
  const offs = [], timers = [];
  let dead = false, tNow = 0, acc = 0, me = null, chatOpen = false, lastLevel = 0;

  // ---- player card ----
  const card = el('div', 'bsa-card'); const ring = el('div', 'bsa-ring'), lvl = el('i', '', '1'); ring.appendChild(lvl);
  const info = el('div'), nameEl = el('div', 'bsa-name', '...'), sub = el('div', 'bsa-sub', 'Intern'), hpBar = el('div', 'bsa-bar'), hpF = el('b'), enBar = el('div', 'bsa-bar'), enF = el('b');
  hpF.style.background = '#59e08a'; enF.style.background = '#39c2ff'; hpBar.appendChild(hpF); enBar.appendChild(enF);
  info.append(nameEl, sub, hpBar, enBar); card.append(ring, info); root.appendChild(card);
  const combo = el('div', 'bsa-combo'); root.appendChild(combo);

  // ---- leaderboard + minimap + menu ----
  const lb = el('div', 'bsa-lb'); root.appendChild(lb);
  const mmCv = el('canvas'); const mm = el('div', 'bsa-mm'); const MW = 160, MH = Math.round(MW * WORLD_H / WORLD_W); mmCv.width = MW; mmCv.height = MH; mm.appendChild(mmCv); root.appendChild(mm);
  const mmg = mmCv.getContext('2d');
  const menuBtn = el('button', 'bsa-menu pe', '☰'); menuBtn.title = 'Break room (leave)'; menuBtn.onclick = () => showExitConfirm(); root.appendChild(menuBtn);

  // ---- feed / banner / toast / tips / event / boss ----
  const feedEl = el('div', 'bsa-feed'); root.appendChild(feedEl);
  const banner = el('div', 'bsa-banner'), bh = el('h2'), bp = el('p'); banner.append(bh, bp); root.appendChild(banner);
  const toastEl = el('div', 'bsa-toast'); root.appendChild(toastEl);
  const tipEl = el('div', 'bsa-tip'); root.appendChild(tipEl);
  const ev = el('div', 'bsa-ev'), evT = el('span'), evB = el('b'); ev.append(evT, evB); root.appendChild(ev);
  const bossEl = el('div', 'bsa-boss'), bossName = el('span', '', '⏰ THE DEADLINE'), bossBar = el('div'), bossF = el('b'), bossTxt = el('span'); bossBar.appendChild(bossF); bossEl.append(bossName, bossBar, bossTxt); root.appendChild(bossEl);
  const connEl = el('div', 'bsa-conn'); root.appendChild(connEl);
  const brokenEl = el('div', 'bsa-broken'), brokenH = el('h1'), brokenP = el('div'); brokenEl.append((() => { const d = el('div'); d.append(brokenH, brokenP); return d; })()); root.appendChild(brokenEl);

  const later = (fn, ms) => { const t = setTimeout(() => { if (!dead) fn(); }, ms); timers.push(t); return t; };
  function addFeed(m) {
    if (!m || !m.text) return; const d = el('div', !!source.localId && (m.a === source.localId || m.b === source.localId) ? 'mine' : '', String(m.text).slice(0, 110));
    if (m.color) d.style.color = m.color; feedEl.appendChild(d); while (feedEl.childNodes.length > 6) feedEl.firstChild.remove();
    later(() => { d.style.opacity = '0'; later(() => d.remove(), 700); }, 9000);
  }
  let bannerT = 0; const bq = [];
  function showBanner(b) {
    bh.textContent = b.title || ''; bp.textContent = b.sub || ''; banner.style.setProperty('--c', b.color || '#ffd23f'); banner.classList.toggle('big', !!b.big);
    banner.classList.add('on'); clearTimeout(bannerT); bannerT = setTimeout(() => { banner.classList.remove('on'); setTimeout(() => { if (!dead && bq.length) showBanner(bq.shift()); }, 300); }, b.urgent ? 4200 : 3000);
  }
  const bannerBusy = () => banner.classList.contains('on');
  function pushBanner(b) { if (b.urgent || !bannerBusy()) { bq.length = 0; showBanner(b); } else if (bq.length < 3) bq.push(b); }
  let toastT = 0;
  function toast(text, color = '#7ed957', ms = 3000) { toastEl.textContent = text; toastEl.style.setProperty('--c', color); toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), ms); }

  // ---- chat (DOM, with history) ----
  const chat = el('div', 'bsa-chat'), chatLog = el('div', 'log'), chatIn = el('input'), chatBtn = el('button', 'bsa-chatbtn', 'chat (Enter)');
  chatIn.type = 'text'; chatIn.maxLength = 120; chatIn.placeholder = 'Say something (Enter sends, Esc cancels). HR is watching.';
  chat.append(chatLog, chatIn, chatBtn); root.appendChild(chat);
  function addChat(m, hist) {
    if (!m || !m.text) return; const isMe = m.sid && m.sid === source.localId, kind = m.kind || '';
    const d = el('div'); const n = el('span', '', (kind === 'pm' ? 'PM' : m.name || 'anon') + ': '); n.style.color = isMe ? '#ffd23f' : kind === 'pm' ? '#ffb347' : kind === 'bot' ? '#c3cfe0' : '#9ad0ff';
    d.append(n, document.createTextNode(String(m.text).slice(0, 140))); chatLog.appendChild(d); while (chatLog.childNodes.length > 40) chatLog.firstChild.remove();
    chatLog.scrollTop = chatLog.scrollHeight;
  }
  function openChat() { chatOpen = true; input.setChatOpen(true); chatIn.style.display = 'block'; chatLog.style.maxHeight = '260px'; chatLog.style.overflowY = 'auto'; chatIn.focus(); }
  function closeChat() { chatOpen = false; input.setChatOpen(false); chatIn.style.display = 'none'; chatIn.value = ''; chatIn.blur(); chatLog.style.maxHeight = '150px'; chatLog.style.overflowY = 'hidden'; chatLog.scrollTop = chatLog.scrollHeight; }
  let lastChat = 0;
  chatIn.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { const t = chatIn.value.trim(); if (t && Date.now() - lastChat > 650) { lastChat = Date.now(); source.send('chat', { text: t }); } closeChat(); }
    else if (e.key === 'Escape') closeChat();
  });
  chatBtn.onclick = () => (chatOpen ? closeChat() : openChat());

  // ---- skill buttons ----
  const sk = el('div', 'bsa-skills'); root.appendChild(sk);
  const SK = [['q', 'DASH'], ['w', 'SHIELD'], ['e', 'JUMP'], ['r', 'ULT']], btns = {};
  const mkBtn = (cls, label, sub, fn) => { const b = el('button', 'bsa-sk pe ' + cls); b.append(el('span', '', label), el('small', '', sub)); const cd = el('div', 'cd'); b.appendChild(cd); b._cd = cd; b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); }); return b; };
  const smashBtn = mkBtn('bsa-smash', 'SMASH', input.isTouch ? 'tap' : 'SPACE', () => input.smash()); sk.appendChild(smashBtn);
  for (const [k, nm] of SK) { const b = mkBtn('', k.toUpperCase(), nm, () => input.cast(k)); const cost = el('em', '', ''); b.appendChild(cost); b._cost = cost; btns[k] = b; sk.appendChild(b); }

  // ---- connection modals ----
  const modal = el('div', 'bsa-modal'); document.body.appendChild(modal);
  function showModal(title, body, buttons) {
    modal.innerHTML = ''; const box = el('div', 'box'); box.append(el('h3', '', title), el('p', '', body));
    for (const b of buttons) { const bt = el('button', '', b.label); bt.onclick = () => { try { b.fn(); } catch (e) { console.error(e); } }; box.appendChild(bt); }
    modal.appendChild(box); modal.style.display = 'flex';
  }
  const closeModal = () => { modal.style.display = 'none'; modal.innerHTML = ''; };
  function showExitConfirm() { showModal('Break room', 'Clock out and leave the arena?\nYour laptop stays here. Probably.', [{ label: 'KEEP SMASHING', fn: closeModal }, { label: 'CLOCK OUT', fn: () => { closeModal(); onExit && onExit(); } }]); }
  function dupTab() {
    showModal('Replaced by another tab', 'You joined the arena from another tab or window, so this one was closed.\nOnly one live tab per player.', [
      { label: 'PLAY HERE', fn: async () => { showModal('Closing the other tab...', '', []); await takeover(); setTimeout(() => location.reload(), 400); } },
      { label: 'MENU', fn: () => { closeModal(); onExit && onExit(); } }]);
  }
  offs.push(source.onConnection((o) => {
    if (dead) return;
    if (o.state === 'connecting') { connEl.textContent = 'connecting...'; connEl.style.display = 'block'; }
    else if (o.state === 'ok' || o.state === 'back') { connEl.style.display = 'none'; if (o.state === 'back') toast('Reconnected. Your laptop kept your seat warm.', '#7ed957'); closeModal(); }
    else if (o.state === 'stalled') { connEl.textContent = 'connection stalled... (Wi-Fi vs. the deadline)'; connEl.style.display = 'block'; }
    else if (o.state === 'lost') showModal('Connection lost', `Reconnecting... ${o.left}s\n(the server keeps your seat)`, [{ label: 'GIVE UP', fn: () => { closeModal(); onExit ? onExit() : location.reload(); } }]);
    else if (o.state === 'dead') { if (o.code === 4010) dupTab(); else showModal('Disconnected', `Lost the arena server (code ${o.code}).`, [{ label: 'RELOAD', fn: () => location.reload() }, { label: 'MENU', fn: () => { closeModal(); onExit && onExit(); } }]); }
  }));

  // ---- server messages ----
  const defs = () => source.events || {};
  offs.push(
    source.on('feed', addFeed),
    source.on('chat', (m) => addChat(m)),
    source.on('chatHistory', (a) => { if (Array.isArray(a)) for (const m of a) addChat({ sid: null, name: m.name, text: m.text, kind: m.kind }, true); }),
    source.on('announce', (m) => { if (m.kind === 'eventEnd') return; pushBanner({ title: m.title, sub: m.sub, color: m.color, big: !!m.big || m.kind === 'event', urgent: m.kind === 'event' }); }),
    source.on('kill', (m) => { const g = m.gain | 0; if (g > 0 && m.kind !== 'bug-golden' && me) view.pop(`+${g}`, '#ffe680', me.x, me.y - 20, g >= 50); }),
    source.on('ko', () => { if (me) view.pop('KO!', '#ff8a8a', me.x, me.y - 40, true); }),
    source.on('reward', (m) => {
      const xp = m.xp | 0;
      if (m.kind === 'boss') toast(`Deadline shipped! +${xp} XP (${m.share | 0}% of the damage)`, '#7ed957', 3400);
      else if (m.kind === 'golden') toast(`You fixed the CEO's bug! +${xp} XP`, '#ffd700', 3400);
      else if (m.kind === 'bounty') toast(`Bounty claimed! +${xp} XP`, '#ffd700', 3000);
      if (xp > 0 && me) view.pop(`+${xp}`, '#ffd700', me.x, me.y - 60, true);
    }),
    source.on('brokenBy', (m) => { const ms = Number(m.ms) > 0 ? Number(m.ms) : 20000; toast(`Laptop broken by ${m.by || 'something'}. IT says ${Math.round(ms / 1000)}s. IT is lying.${m.kept ? ' Career kept.' : ''}`, '#ff8a8a', 3600); }),
    source.on('crowned', (m) => pushBanner({ title: "YOU'RE THE TECH LEAD", color: '#ffd700', sub: `Everyone wants your ${m.bounty | 0} XP bounty. Watch your back.` })),
    source.on('bossSlam', (m) => view.telegraph(m)),
    source.on('bossSlamHit', (m) => view.slamHit(m)),
  );

  // ---- tips (first sessions) ----
  const TIPS = [
    input.isTouch ? 'Tap a bug to run over and smash it' : 'Click a bug, or press SPACE next to it, to smash it',
    'Bugs give XP: fill the gold ring to get promoted (and bigger)',
    'Green + pickups heal you and refill energy',
    input.isTouch ? 'DASH / SHIELD / JUMP / ULT buttons cost energy' : 'Q dash, W shield, E jump, R ult. Skills cost energy',
    'Listen to the PM: world events change the rules',
    "Break the Tech Lead's laptop to claim their bounty",
    'Health 0 = broken laptop. Back to Intern for a few seconds',
  ];
  let tipsSeen = false; try { tipsSeen = localStorage.getItem('bs3d.tipsArena') === '1'; } catch (_) { /* private mode */ }
  if (getTips && !tipsSeen) {
    let i = 0; const next = () => { if (i >= TIPS.length) { try { localStorage.setItem('bs3d.tipsArena', '1'); } catch (_) { /* ignore */ } tipEl.style.display = 'none'; return; } tipEl.textContent = '</> Dev tip: ' + TIPS[i++]; tipEl.style.display = 'block'; later(next, 7000); };
    later(next, 3000);
  }

  // ---- per-frame (DOM writes throttled to ~10 Hz) ----
  const last = {};
  const setTxt = (k, node, v) => { if (last[k] !== v) { last[k] = v; node.textContent = v; } };
  const setW = (k, node, pct) => { const v = Math.round(pct); if (last[k] !== v) { last[k] = v; node.style.width = v + '%'; } };
  const comboCol = (c) => (c >= 10 ? '#ff5252' : c >= 5 ? '#ff9800' : '#ffd23f');
  const comboLbl = (c) => (c >= 10 ? 'x3' : c >= 5 ? 'x2' : c >= 3 ? 'x1.5' : '');
  const tmpP = { x: 0, y: 0, visible: false };
  const rows = [];
  function refresh(st) {
    me = st.me; const srv = source.srvNow();
    if (me) {
      setTxt('name', nameEl, me.name || '...'); setTxt('lv', lvl, String(me.level | 0));
      const i = Math.max(0, Math.min(5, (me.level | 0) - 1)), span = i === 5 ? 1 : LEVEL_XP[i + 1] - LEVEL_XP[i], p = i === 5 ? 100 : Math.max(0, Math.min(100, ((me.xp | 0) - LEVEL_XP[i]) / span * 100));
      const pr = Math.round(p); if (last.xp !== pr) { last.xp = pr; ring.style.setProperty('--p', pr + '%'); }
      setTxt('sub', sub, `${levelTitle(me.level)} | ${me.score | 0} pts${st.crownSid === source.localId ? ' | TECH LEAD' : ''}`);
      setW('hp', hpF, me.maxHealth ? me.health / me.maxHealth * 100 : 0); setW('en', enF, me.maxEnergy ? me.energy / me.maxEnergy * 100 : 0);
      const c = me.combo | 0; if (c >= 3) { combo.style.display = 'block'; combo.style.color = comboCol(c); setTxt('combo', combo, `COMBO ${c}  ${comboLbl(c)}`); } else if (last.combo !== '') { last.combo = ''; combo.style.display = 'none'; }
      if ((me.level | 0) > lastLevel && lastLevel) pushBanner({ title: `PROMOTED: ${levelTitle(me.level)}`, sub: 'You got bigger. So did your responsibilities.', color: '#ffd23f' });
      lastLevel = me.level | 0;
      // skill buttons
      for (const [k] of SK) {
        const b = btns[k], cost = skillCost(k, st), ok = !me.broken && (me.energy | 0) >= cost;
        const cdMs = (me['cd' + k.toUpperCase()] || 0) - srv; b.classList.toggle('off', !ok || cdMs > 0);
        setTxt('c' + k, b._cost, st.event === 'hackathon' ? 'FREE' : String(cost));
        b._cd.style.setProperty('--cd', cdMs > 0 ? Math.min(100, cdMs / 80) + '%' : '0%');
      }
      // broken overlay
      if (me.broken) { brokenEl.style.display = 'grid'; const left = Math.max(0, Math.ceil(((me.brokenUntil || 0) - srv) / 1000)); brokenH.textContent = 'LAPTOP BROKEN'; setTxt('bk', brokenP, `IT says ${left}s. IT is lying.`); } else brokenEl.style.display = 'none';
    }
    // leaderboard
    rows.length = 0; st.players.forEach((p, sid) => rows.push({ p, sid })); rows.sort((a, b) => b.p.score - a.p.score);
    let h = '', n = 0; const shown = rows.slice(0, 6);
    if (me && !shown.some((r) => r.sid === source.localId)) { const mine = rows.find((r) => r.sid === source.localId); if (mine) shown[5] = mine; }
    lb.textContent = ''; lb.appendChild(el('h4', '', 'LEADERBOARD'));
    for (const r of shown) { if (!r) continue; n++; const d = el('div', r.sid === source.localId ? 'me' : ''); const crown = r.sid === st.crownSid; d.append(el('span', '', `${crown ? '\u{1F451} ' : ''}${r.p.isBot ? '[BOT] ' : ''}${(r.p.name || '?').slice(0, 11)}${crown && st.bounty ? ` (+${st.bounty} XP)` : ''}`), el('span', '', String(r.p.score | 0))); lb.appendChild(d); }
    // event bar
    if (st.event) {
      const def = defs()[st.event] || { title: st.event.replace(/_/g, ' ').toUpperCase(), color: '#ff9800' };
      ev.style.display = 'block'; ev.style.setProperty('--c', def.color || '#ff9800'); setTxt('evt', evT, `${def.title} | ${Math.max(0, Math.ceil(st.eventLeftMs / 1000))}s`); evB.style.width = (st.eventTotalMs > 0 ? Math.max(0, Math.min(100, st.eventLeftMs / st.eventTotalMs * 100)) : 100) + '%';
    } else ev.style.display = 'none';
    // boss bar
    const b = view.boss;
    if (b && b.alive) { bossEl.style.display = 'block'; bossF.style.width = Math.max(0, b.hp / Math.max(1, b.maxHp) * 100) + '%'; setTxt('bt', bossTxt, `${b.hp | 0} / ${b.maxHp | 0}${b.phase >= 2 ? '  |  ENRAGED' : ''}`); } else bossEl.style.display = 'none';
  }
  function drawMinimap(st) {
    const g = mmg; g.fillStyle = '#0c1018'; g.fillRect(0, 0, MW, MH); const kx = MW / WORLD_W, ky = MH / WORLD_H;
    g.fillStyle = '#3b4a6b'; st.obstacles.forEach((o) => g.fillRect(o.x * kx, o.y * ky, Math.max(2, o.w * kx), Math.max(2, o.h * ky)));
    g.fillStyle = '#7ed957'; st.bugs.forEach((b) => { if (b.alive && !b.hidden) g.fillRect(b.x * kx - 1, b.y * ky - 1, 2, 2); });
    g.fillStyle = '#59e08a'; st.pickups.forEach((p) => { if (p.alive) g.fillRect(p.x * kx - 1.5, p.y * ky - 1.5, 3, 3); });
    g.fillStyle = '#6bd45a'; st.clouds.forEach((c) => { g.beginPath(); g.arc(c.x * kx, c.y * ky, 3, 0, 7); g.fill(); });
    st.players.forEach((p, sid) => { g.fillStyle = sid === source.localId ? '#ffd23f' : sid === st.crownSid ? '#ffd700' : p.isBot ? '#8fa3c7' : '#39c2ff'; g.fillRect(p.x * kx - 2, p.y * ky - 2, sid === source.localId ? 5 : 4, sid === source.localId ? 5 : 4); });
    const b = view.boss; if (b && b.alive) { g.fillStyle = '#ff3b3b'; g.beginPath(); g.arc(b.x * kx, b.y * ky, 5, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.strokeRect(0, 0, MW, MH);
  }
  function update(dt, nowMs) {
    if (dead) return; tNow = nowMs; acc += dt; if (acc < 0.1) return; acc = 0;
    const st = source.state(); refresh(st); drawMinimap(st);
  }
  return {
    update, toast, banner: pushBanner, showModal, closeModal, openChat,
    dispose() { dead = true; offs.forEach((f) => f()); timers.forEach(clearTimeout); clearTimeout(bannerT); clearTimeout(toastT); root.remove(); style.remove(); modal.remove(); },
  };
}

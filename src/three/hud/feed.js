// Feed, chat, announce banner, toasts, coaching tip and the rollback vote prompt (C6).
// Subscribes to source.on('feed'|'announce'|'chat'|'chatHistory'|'vote'|'voteEnd'|'voteDeny'|'dummyDps'); sends 'chat' and 'vote'.
const FEED_MAX = 6, FEED_TTL = 10000, CHAT_MAX = 7, CHAT_TTL = 14000;
const VOTE_MS = 20000; // mirrors shared/moba/rules.js ROLLBACK_VOTE_MS (bar length only)
const VOTE_DENY = {
  early: '🏳 Rollback opens at 12:00. Keep shipping, the sprint is not over.', cooldown: '🏳 Rollback on cooldown. The last one was rejected, remember?',
  active: '🏳 You already voted. This is not a democracy of one.', phase: '🏳 Not now. The match is not running.',
};
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export function createFeed({ source, root, left, now: clock = () => Date.now() }) {
  const offs = [], timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  let dead = false;

  // ---- kill feed ----
  const feedEl = el('div', 'bsh-feed bsh-mono bsh-stroke'); root.appendChild(feedEl);
  const feed = [];
  function addFeed(m) {
    if (!m || !m.text) return;
    const me = source.localId, d = el('div', me && (m.a === me || m.b === me) ? 'mine' : '', String(m.text).slice(0, 96));
    if (m.color) d.style.color = m.color;
    d._born = clock(); feed.push(d); feedEl.appendChild(d);
    while (feed.length > FEED_MAX) feed.shift().remove();
  }

  // ---- chat ----
  const chatEl = el('div', 'bsh-chat bsh-mono bsh-stroke'); root.appendChild(chatEl);
  const chatLog = el('div'); chatLog.style.cssText = 'display:flex;flex-direction:column;gap:2px';
  const input = el('input'); input.type = 'text'; input.maxLength = 120; input.placeholder = 'Say something (Enter sends, Esc cancels). HR is watching.'; input.hidden = true;
  chatEl.append(chatLog, input);
  const chat = [];
  function addChat(m, mine) {
    if (!m || !m.text) return;
    const who = m.kind === 'bot' ? `🤖 ${m.name || 'bot'}` : (m.name || '?');
    const d = el('div', mine ? 'mine' : '', `${who}: ${String(m.text).slice(0, 140)}`);
    d._born = clock(); chat.push(d); chatLog.appendChild(d);
    while (chat.length > CHAT_MAX) chat.shift().remove();
  }
  const openChat = () => { input.hidden = false; input.value = ''; input.focus(); };
  const closeChat = () => { input.hidden = true; input.blur(); };
  const onInputKey = (e) => {
    e.stopPropagation(); // typing must not trigger Q/W/E/R etc. in Input.js (window listeners)
    if (e.key === 'Enter') { const text = input.value.trim(); if (text) { if (/^\/(yes|no)$/i.test(text)) castVote(/yes/i.test(text)); else source.send('chat', { text: text.slice(0, 120) }); } closeChat(); } else if (e.key === 'Escape') closeChat();
  };
  input.addEventListener('keydown', onInputKey); input.addEventListener('keyup', (e) => e.stopPropagation());
  const onGlobalKey = (e) => { if (dead || e.key !== 'Enter' || !input.hidden || e.repeat) return; const t = e.target; if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return; openChat(); };
  addEventListener('keydown', onGlobalKey);

  // ---- announce banner (queued) ----
  const bannerEl = el('div', 'bsh-banner bsh-stroke'); bannerEl.hidden = true; root.appendChild(bannerEl);
  const bq = []; let bcur = false;
  function banner(b) {
    if (!b || !b.title) return;
    bq.push(b);
    while (bq.length > 4) { const i = bq.findIndex((x) => !x.big); bq.splice(i >= 0 ? i : 0, 1); }
    if (!bcur) nextBanner();
  }
  function nextBanner() {
    const b = bq.shift(); if (!b || dead) { bcur = false; bannerEl.hidden = true; return; }
    bcur = true; bannerEl.hidden = false;
    bannerEl.className = `bsh-banner bsh-stroke show${b.big ? ' big' : ''}`;
    bannerEl.replaceChildren(); const t = el('div', 'bt', String(b.title)); t.style.color = b.color || '#ffd23f'; bannerEl.appendChild(t);
    if (b.sub) bannerEl.appendChild(el('div', 'bs bsh-mono', String(b.sub)));
    later(() => { bannerEl.classList.remove('show'); bannerEl.classList.add('out'); later(nextBanner, 280); }, b.big ? 2800 : 2000);
  }

  // ---- toasts (max 2 visible, queue 4, dupes dropped) ----
  const toastEl = el('div', 'bsh-toasts bsh-stroke'); root.appendChild(toastEl);
  const tq = [], tvis = []; let lastT = '', lastTAt = 0;
  function toast(text, color = '#ffffff', ms = 1600) {
    if (!text) return; const n = clock();
    if (lastT === text && n - lastTAt < 700) return;
    if (tvis.some((t) => t._text === text) || tq.some((q) => q.text === text)) return;
    lastT = text; lastTAt = n; tq.push({ text: String(text), color, ms });
    while (tq.length > 4) tq.shift();
    pump();
  }
  function pump() {
    while (!dead && tvis.length < 2 && tq.length) {
      const q = tq.shift(), d = el('div', '', q.text); d.style.color = q.color; d._text = q.text;
      tvis.push(d); toastEl.appendChild(d);
      later(() => { d.style.opacity = '0'; later(() => { const i = tvis.indexOf(d); if (i >= 0) tvis.splice(i, 1); d.remove(); pump(); }, 220); }, tq.length ? Math.min(q.ms, 1100) : q.ms);
    }
  }

  // ---- coaching tip + status line ----
  const status = el('div', 'bsh-status bsh-mono'); left.appendChild(status);
  const tipEl = el('div', 'bsh-card bsh-tip'); tipEl.hidden = true; left.appendChild(tipEl);
  let tipTimer = 0;
  function tip(text, ms = 7000) {
    if (!text) return; tipEl.textContent = String(text); tipEl.hidden = !!(vote && !voteEl.hidden);
    tipEl._want = true; clearTimeout(tipTimer); timers.delete(tipTimer);
    tipTimer = later(() => { tipEl._want = false; tipEl.hidden = true; }, ms);
  }
  function setStatus(text, color) { status.textContent = text || ''; if (color) status.style.color = color; }

  // ---- vote prompt ----
  const voteEl = el('div', 'bsh-card bsh-vote'); voteEl.hidden = true;
  voteEl.innerHTML = '<div class="vby"></div><div class="vcount bsh-mono"></div><div class="bsh-vbar"><i></i></div><div class="bsh-vbtns"><button class="bsh-btn yes">✔ YES (Y)</button><button class="bsh-btn no">✖ NO (N)</button></div><div class="bsh-vmine"></div>';
  left.appendChild(voteEl);
  const vby = voteEl.querySelector('.vby'), vcount = voteEl.querySelector('.vcount'), vbar = voteEl.querySelector('.bsh-vbar > i'), vmine = voteEl.querySelector('.bsh-vmine');
  const btnYes = voteEl.querySelector('.yes'), btnNo = voteEl.querySelector('.no');
  const rbBtn = el('button', 'bsh-btn bsh-rollback', '🏳 ROLLBACK'); rbBtn.title = 'Ask the team to roll back to last Friday\'s build'; rbBtn.hidden = true; left.appendChild(rbBtn);
  let vote = null, mine = null, reqAt = 0;
  function castVote(yes) {
    if (!vote || mine != null || source.kind === 'offline') return;
    mine = !!yes; source.send('vote', { yes: !!yes }); renderVote();
  }
  function startVote() {
    if (source.kind === 'offline') { toast('🏳 No rollbacks in practice. The bots never give up.', '#ffb347'); return; }
    if (vote) { if (mine == null) castVote(true); else toast('🏳 You already voted', '#ffb347'); return; }
    reqAt = Date.now(); mine = true; source.send('vote', { yes: true });
  }
  btnYes.onclick = () => castVote(true); btnNo.onclick = () => castVote(false); rbBtn.onclick = startVote;
  function renderVote() {
    const open = !!vote; voteEl.hidden = !open; if (open) tipEl.hidden = true;
    if (!open) { if (tipEl._want) tipEl.hidden = false; return; }
    const can = mine == null; btnYes.hidden = btnNo.hidden = !can;
    vby.textContent = `${String(vote.by || 'Someone').slice(0, 18)} wants last Friday's build back`;
    vcount.textContent = `✔ ${vote.yes | 0} / ${vote.need | 0} needed   ✖ ${vote.no | 0}`;
    const lm = Math.max(0, vote.endsAt - source.srvNow());
    vbar.style.width = `${Math.max(0, Math.min(1, lm / VOTE_MS)) * 100}%`;
    vmine.textContent = mine == null ? '' : `you ${mine === 'voted' ? 'already voted' : mine ? 'voted ✔ yes' : 'voted ✖ no'} · ${Math.ceil(lm / 1000)}s left`;
  }
  const onVoteKey = (e) => { if (dead || !vote || mine != null || (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName))) return; if (e.code === 'KeyN') castVote(false); };
  addEventListener('keydown', onVoteKey); // Y is shared with the camera lock (Input.js); the YES button / /yes cover it. N is vote-only.

  // ---- source subscriptions (every callback guarded) ----
  const sub = (type, fn) => { const off = source.on(type, (m) => { if (dead) return; fn(m); }); if (typeof off === 'function') offs.push(off); };
  sub('feed', addFeed);
  sub('announce', (m) => banner({ title: m && m.title, sub: m && m.sub, color: m && m.color, big: !!(m && m.big) }));
  sub('chat', (m) => addChat(m, !!source.localId && m && m.sid === source.localId));
  sub('chatHistory', (m) => { if (Array.isArray(m)) for (const c of m.slice(-5)) addChat(c); });
  sub('dummyDps', (m) => setStatus(`DUMMY · Hit: ${m.dmg} · 3s: ${m.total} · DPS: ${m.dps}`, '#7ed957'));
  sub('vote', (m) => {
    if (!m || !Number.isFinite(m.endsAt)) return;
    const fresh = !vote || vote.endsAt !== m.endsAt;
    if (m.mine === true) mine = typeof mine === 'boolean' ? mine : 'voted'; else if (m.mine === false) mine = null; else if (fresh) mine = Date.now() - reqAt < 4000 ? true : null;
    if (fresh && !(Date.now() - reqAt < 4000 || m.mine === true)) banner({ title: '🏳 ROLLBACK THE RELEASE?', sub: `${String(m.by || 'A teammate').slice(0, 18)} wants last Friday's build back (${m.yes | 0}/${m.need | 0})`, color: '#ffb347' });
    vote = { yes: m.yes | 0, no: m.no | 0, need: m.need | 0 || 4, endsAt: m.endsAt, by: m.by }; renderVote();
  });
  sub('voteEnd', (m) => {
    const was = vote; vote = null; mine = null; renderVote();
    if (m && m.passed) toast("🔙 Rollback approved. Shipping last Friday's build.", '#ffb347', 2400);
    else if (was) toast('Rollback rejected. The sprint continues 😩', '#ffd23f', 2400);
  });
  sub('voteDeny', (m) => { toast(VOTE_DENY[m && m.reason] || '🏳 Rollback not possible right now', '#ffb347', 2200); if (!vote) mine = null; });

  return {
    toast, tip, setStatus, banner, castVote, startVote,
    /** per-update tick: expire feed/chat, refresh vote timer, show the ROLLBACK button (online, playing, no vote) */
    update(phase, srvNow) {
      const n = clock();
      while (feed.length && n - feed[0]._born > FEED_TTL) { const d = feed.shift(); d.classList.add('bsh-fade'); later(() => d.remove(), 300); }
      while (chat.length && n - chat[0]._born > CHAT_TTL) { const d = chat.shift(); d.classList.add('bsh-fade'); later(() => d.remove(), 300); }
      if (vote) { if (srvNow > vote.endsAt + 2500 || phase !== 'playing') { vote = null; mine = null; } renderVote(); }
      rbBtn.hidden = !(phase === 'playing' && source.kind !== 'offline' && !vote);
    },
    dispose() {
      dead = true; offs.forEach((o) => { try { o(); } catch (_) { /* ignore */ } }); offs.length = 0;
      timers.forEach(clearTimeout); timers.clear();
      removeEventListener('keydown', onGlobalKey); removeEventListener('keydown', onVoteKey);
      for (const e of [feedEl, chatEl, bannerEl, toastEl, status, tipEl, voteEl, rbBtn]) e.remove();
    },
  };
}

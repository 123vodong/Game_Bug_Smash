// Three.js HUD (C6): DOM overlay, parity with MobaHud.update(ctx). createHud({source,project,mode,opts}) -> {update(ctx), dispose, toast, tip, setStatus, setTarget}
// ctx (from Renderer, ~20 Hz): {st, myId, srvNow, now, phase, mode}. Optional extras, used when the caller provides them:
//   me (else st.champions.get(myId)), mePos {x,y} predicted, view {x,y,width,height} camera rect in world px (else estimated via project()),
//   selectedId (target frame; else me.targetId), canShop (bool), held {slot,mode,since,spec} (hold-charge ring).
// Shop / augments / scoreboard / end screen belong to C8.
import { CHAMPIONS, resolveSkill, nextStance, parseKitTags, parseCcTags, CC_TYPES } from '../../../shared/moba/champions.js';
import { ITEMS } from '../../../shared/moba/items.js';
import { TEAM_INFO, XP_TABLE, MAX_LEVEL, ULT_UNLOCK_LEVEL, RECALL_MS, EPICS } from '../../../shared/moba/rules.js';
import { SPELLS, spellCooldownMs } from '../../../shared/moba/spells.js';
import { createMinimap } from './minimap.js';
import { createFeed } from './feed.js';
import { createTarget } from './target.js';
import { createExtras } from './extras.js';
import { createTooltip, skillCardHtml, skillIconUrl, spellCardHtml, champCardHtml, itemCardHtml, esc } from './tooltip.js';
import { AudioManager } from '../../core/AudioManager.js';
import { clearMatch } from '../../core/Identity.js';
import { t, onLangChange } from '../../core/I18n.js';
import { createShop } from './shop.js';
import { createScoreboard } from './scoreboard.js';
import { createAugments } from './augments.js';
import { createEndScreen } from './endscreen.js';
import { createNameplates } from './nameplates.js';

const SLOTS = ['q', 'w', 'e', 'r'], SPELL_SLOTS = ['d', 'f'];
const hex = (n) => '#' + ((n >>> 0) & 0xffffff).toString(16).padStart(6, '0');
const fmtTime = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const toArr = (a) => (!a ? [] : Array.isArray(a) ? a : Array.from(a));
const CSS_URL = new URL('./hud.css', import.meta.url).href, CSS2_URL = new URL('./hud-lol.css', import.meta.url).href;
const CC_ICONS_MAX = 4;

function el(parent, tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; }
/** Dirty-checked textContent. */
const setText = (e, v) => { if (e._v !== v) { e._v = v; e.textContent = v; } };
const setStyle = (e, k, v) => { const key = `_s${k}`; if (e[key] !== v) { e[key] = v; e.style.setProperty(k, v); } };
const setHidden = (e, h) => { if (e.hidden !== h) e.hidden = h; };

export function createHud({ source, project, mode, opts = {} }) {
  if (!document.getElementById('bsh-css')) { const l = document.createElement('link'); l.id = 'bsh-css'; l.rel = 'stylesheet'; l.href = CSS_URL; document.head.appendChild(l); const l2 = document.createElement('link'); l2.id = 'bsh-css2'; l2.rel = 'stylesheet'; l2.href = CSS2_URL; document.head.appendChild(l2); }
  const old = document.getElementById('bsh-root'); if (old) old.remove();
  const root = document.createElement('div'); root.id = 'bsh-root';
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  root.addEventListener('wheel', (e) => {
    if (!e.target.closest('.bsx-shop-l, .bsx-shop-r, .bsx-pb, .lob-list')) e.preventDefault();
  }, { passive: false });
  document.body.appendChild(root);
  let disposed = false;

  // ---- top bar ----
  const top = el(root, 'div', 'bsh-top bsh-stroke');
  const topRow = el(top, 'div', 'bsh-top-row');
  const kb = el(topRow, 'span', 'bsh-kb'), clockEl = el(topRow, 'span', 'bsh-clock'), kr = el(topRow, 'span', 'bsh-kr');
  const epicEl = el(top, 'div', 'bsh-epic bsh-mono'), buffEl = el(top, 'div', 'bsh-buff');

  // ---- left column: minimap, status, tip, vote, rollback ----
  const left = el(root, 'div', 'bsh-left');
  const mmBox = el(root, 'div', 'bsh-mmbox');
  const mm = createMinimap({ source, project, parent: mmBox, hooks: opts.input ? { onTap: (x, y) => opts.input.minimapTap(x, y), onView: (x, y, ph) => opts.input.minimapView(x, y, ph) } : null });
  const feeds = createFeed({ source, root, left });
  const target = createTarget({ parent: root });

  // ---- bottom panel ----
  const kit = el(root, 'div', 'bsh-kit bsh-stroke'), ccRow = el(root, 'div', 'bsh-ccrow bsh-stroke');
  const hidePill = el(root, 'div', 'bsh-hidepill bsh-stroke'); hidePill.hidden = true;
  const recallBox = el(root, 'div', 'bsh-recall bsh-stroke', '<span></span><i></i>'); recallBox.hidden = true;
  const recallTxt = recallBox.firstChild, recallFill = recallBox.lastChild;
  const death = el(root, 'div', 'bsh-death bsh-stroke', '<div class="dt">💀 YOU WERE PUSHED TO PRODUCTION</div><div class="dc"></div><div class="dh bsh-mono">🛒 The shop is open while you are dead. Spend while you wait.</div>'); death.hidden = true;
  const deathC = death.querySelector('.dc');

  const panel = el(root, 'div', 'bsh-panel bsh-pop');
  const lcol = el(panel, 'div', 'bsh-lcol');
  const who = el(lcol, 'div', 'bsh-who'), ring = el(who, 'div', 'bsh-ring'), face = el(who, 'div', 'bsh-face bsh-stroke'), lvEl = el(who, 'div', 'bsh-lv');
  const statsEl = el(lcol, 'div', 'bsh-stats'), statCells = {};
  for (const [k, ic, tt] of [['ad', '⚔', 'Attack Damage'], ['ap', '✦', 'Ability Power'], ['ar', '🛡', 'Armor'], ['as', '⚡', 'Attack Speed'], ['rg', '🎯', 'Attack Range'], ['ms', '👟', 'Move Speed']]) { const c = el(statsEl, 'div', 'st', `<span class="i">${ic}</span><b class="bsh-mono">0</b>`); c.title = tt; statCells[k] = c.lastChild; }
  const mid = el(panel, 'div', 'bsh-mid');
  const slotsRow = el(mid, 'div', 'bsh-slots');
  const hpBar = el(mid, 'div', 'bsh-bar', '<i></i><i class="sh"></i><u></u><b></b>'), hpFill = hpBar.children[0], shFill = hpBar.children[1], hpTicks = hpBar.children[2], hpTxt = hpBar.children[3];
  const mpBar = el(mid, 'div', 'bsh-bar mp', '<i></i><b></b>'), mpFill = mpBar.children[0], mpTxt = mpBar.children[1];
  const slots = {};
  const mkSlot = (k, sp) => {
    const s = el(slotsRow, 'div', `bsh-slot${sp ? ' sp' : ''}`);
    const box = el(s, 'div', 'bsh-sbox', '<span class="ic bsh-stroke"></span><div class="dim"></div><div class="nm"></div><div class="lock"></div><div class="cd"></div><div class="hold"></div><span class="key"></span><span class="mana"></span><span class="chg"></span>');
    box.style.pointerEvents = 'auto'; box.style.cursor = 'pointer';
    box.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.button === 2) return;
      const inp = opts.input; if (!inp) return; if (sp) inp.spell(k, true); else inp.cast(k, true);
    });
    if (!sp) {
      const rel = (e) => { const inp = opts.input; if (inp && typeof inp.release === 'function') { e.stopPropagation(); inp.release(k); } };
      box.addEventListener('pointerup', rel);
      box.addEventListener('pointercancel', rel);
    }
    const o = { s, box, id: null, spec: null, cdTotal: 300, prev: undefined, ready: false };
    for (const c of ['ic', 'dim', 'nm', 'lock', 'cd', 'hold', 'key', 'mana', 'chg']) o[c] = box.querySelector(`.${c}`);
    o.key.textContent = k.toUpperCase(); o.nm.hidden = o.lock.hidden = o.hold.hidden = o.chg.hidden = true;
    if (!sp) {
      o.pips = el(s, 'div', 'bsh-pips'); o.sub = el(s, 'div', 'bsh-sub bsh-mono');
      o.up = el(s, 'button', 'bsh-up', '+'); o.up.hidden = true; o.up.title = `Level up ${k.toUpperCase()}`;
      o.up.onclick = () => { if (opts.input) opts.input.upgrade(k); else { try { source.send('upgrade', { slot: k }); } catch (_) { /* closed */ } } };
    }
    slots[k] = o; return o;
  };
  for (const k of SLOTS) mkSlot(k, false);
  el(slotsRow, 'div', 'gap');
  for (const k of SPELL_SLOTS) mkSlot(k, true);
  const right = el(panel, 'div', 'bsh-right');
  const goldEl = el(right, 'div', 'bsh-gold-t bsh-stroke');
  const itemsEl = el(right, 'div', 'bsh-items'), items = [];
  for (let i = 0; i < 6; i++) { const d = el(itemsEl, 'div', 'bsh-item', ''); d._id = ''; d.dataset.k = String(i + 1); items.push(d); }
  const kdaEl = el(right, 'div', 'bsh-kda bsh-stroke');

  const nameplates = createNameplates({ source, project, root });
  const rootEl = root;
  const SCALE_KEY = 'bugsmash.hud.scale';
  // Start at the smallest supported HUD size. The minimap has its own fixed
  // medium-size CSS token and deliberately does not use this scale.
  let userScale = 0.7;
  try { const sv = parseFloat(localStorage.getItem(SCALE_KEY)); if (Number.isFinite(sv)) userScale = Math.max(0.7, Math.min(1.25, sv)); } catch (_) { /* ignore */ }
  const fit = () => { const w = innerWidth, h = innerHeight, compact = w < 900 || matchMedia('(pointer: coarse)').matches || root.classList.contains('bsx-touch'); root.classList.toggle('bsh-compact', compact); const base = compact ? Math.max(0.6, Math.min(1, w / 900, h / 460)) : Math.max(0.72, Math.min(1.3, w / 1280, h / 720)); const hs = Math.max(0.5, Math.min(1.6, base * userScale)); rootEl.style.setProperty('--hs', hs.toFixed(3)); };
  const scaleBox = el(panel, 'div', 'bsh-scale');
  const bScaleUp = el(scaleBox, 'button', 'bsh-scb', '+'); bScaleUp.title = 'Increase HUD size';
  const bScaleDn = el(scaleBox, 'button', 'bsh-scb', '−'); bScaleDn.title = 'Decrease HUD size';
  const setUserScale = (delta) => {
    userScale = Math.round(Math.max(0.7, Math.min(1.25, userScale + delta)) * 100) / 100;
    try { localStorage.setItem(SCALE_KEY, String(userScale)); } catch (_) { /* ignore */ }
    fit(); AudioManager.uiClick?.();
    feeds.toast(`HUD size: ${Math.round(userScale * 100)}%`, '#ffd23f', 1200);
  };
  bScaleUp.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); setUserScale(0.1); });
  bScaleDn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); setUserScale(-0.1); });
  let fitted = false; fit(); addEventListener('resize', fit);

  // ---- C8 panels: tooltip + shop + scoreboard (TAB) + augment picker + end screen ----
  const hk = opts.hooks || {};
  const hooksOut = { onPlayAgain: opts.onPlayAgain || hk.onPlayAgain, onExit: opts.onExit || hk.onExit };
  const tooltip = createTooltip(root);
  const shop = createShop({ root, source, toast: (m, c) => feeds.toast(m, c), tooltip });
  const sbd = createScoreboard({ root, source });
  const augs = createAugments({ root, source, toast: (m, c, ms) => feeds.toast(m, c, ms) });
  const endScr = createEndScreen({ root, source, hooks: hooksOut, toast: (m, c, ms) => feeds.toast(m, c, ms) });
  const extras = createExtras({ root, source, opts, hudApi: { toast: (m, c) => feeds.toast(m, c), setScoreboard: (on) => sbd.set(on), scoreboardOpen: () => sbd.isOpen(), shop, onExit: () => (hooksOut.onExit ? hooksOut.onExit() : (location.href = location.pathname + '?scene=menu&renderer=3d')) } });
  const modalOpen = () => augs.isOpen() || endScr.isOpen() || extras.pauseOpen();

  // ---- Waiting / Lobby phase overlay (online lobby / select / loading) ----
  const lobbyEl = el(root, 'div', 'bsx-lobby bsh-pop'); lobbyEl.hidden = true;
  let lobbySig = '';
  lobbyEl.addEventListener('click', (e) => {
    const t = e.target.closest('[data-la]'); if (!t) return;
    AudioManager.uiClick?.();
    if (t.dataset.la === 'start') { try { source.send('startNow', {}); } catch (_) { /* closed */ } }
    else if (t.dataset.la === 'leave') {
      clearMatch();
      if (typeof hooksOut.onExit === 'function') hooksOut.onExit();
      else location.href = location.pathname + '?scene=menu&renderer=3d';
    }
  });
  function updateLobby(st, phase, srvNow) {
    const show = phase === 'lobby' || phase === 'select' || phase === 'loading';
    setHidden(lobbyEl, !show);
    if (!show || !st) { lobbySig = ''; return; }
    const rows = [];
    if (st.champions && st.champions.forEach) st.champions.forEach((c, id) => rows.push({ id, c }));
    const leftMs = st.phaseEndsAt ? Math.max(0, st.phaseEndsAt - srvNow) : 0;
    const sec = Math.ceil(leftMs / 1000);
    const sig = `${phase}|${sec}|${rows.map((r) => `${r.id}:${r.c.champ}:${r.c.team}:${r.c.ready ? 1 : 0}`).join(',')}`;
    if (sig === lobbySig) return; lobbySig = sig;
    const title = phase === 'loading' ? '⏳ LOADING INTO THE OFFICE…' : phase === 'select' ? '🎯 CHAMPION SELECT IN PROGRESS' : '☕ WAITING IN LOBBY';
    const listHtml = rows.map(({ id, c }) => {
      const d = CHAMPIONS[c.champ];
      const tc = c.team === 'red' ? '#ff5e5e' : '#39c2ff';
      return `<div class="lob-r" style="--tc:${tc}"><span>${d ? d.emoji : '🐞'} <b>${esc(c.name || id)}</b> <small>${d ? esc(d.name) : ''}</small></span><span>${c.isBot ? '🤖 bot' : (c.ready ? '✅ ready' : '…')}</span></div>`;
    }).join('') || '<div class="lob-empty">Connecting coworkers…</div>';
    lobbyEl.innerHTML = `<div class="lob-box"><div class="lob-t">${title}</div>`
      + (sec > 0 ? `<div class="lob-cd">Starting in ${sec}s</div>` : '')
      + `<div class="lob-list">${listHtml}</div>`
      + `<div class="lob-acts">${phase === 'lobby' ? `<button class="bsh-btn yes" data-la="start">${esc(t('ui.startNow'))}</button>` : ''}<button class="bsh-btn no" data-la="leave">${esc(t('ui.leave'))}</button></div></div>`;
  }

  // ---- First-session coach tips ----
  const coachSeen = new Set();
  let coachAt = 0;
  function tickCoach(me, st, srvNow, now, canShop, phase) {
    if (!me || phase !== 'playing' || now < coachAt) return;
    coachAt = now + 1500;
    const say = (id, msg, ms = 5500) => { if (coachSeen.has(id)) return false; coachSeen.add(id); feeds.tip(msg, ms); return true; };
    if (me.dead) { say('dead_shop', '💡 Tip: Shop (P) is open while dead — spend your gold before respawning!'); return; }
    if ((me.maxHp || 0) > 0 && me.hp / me.maxHp < 0.28 && !canShop) { if (say('low_hp', '💡 Low HP! Press B to Recall to your break room and heal up.')) return; }
    if ((me.level || 1) >= ULT_UNLOCK_LEVEL) { if (say('ult', '💡 Level 6 reached! Your Ultimate (R) is now unlocked.')) return; }
    if (canShop && (me.gold | 0) >= 350) { if (say('fountain_gold', '💡 You have gold in the break room — press P to open the Office Supply Store!')) return; }
    const epSoon = (at) => at > srvNow && at - srvNow <= 30000;
    if (st && (epSoon(st.epicGoldenAt || 0) || epSoon(st.epicDeadlineAt || 0))) { if (say('epic_soon', '💡 An Epic objective spawns in the river in <30s! Group with your team.')) return; }
    if (st && st.startedAt && srvNow - st.startedAt > 18000) { say('space_atk', '💡 Tip: Hold SPACE to attack the nearest enemy or tower, TAB for Standup Board.'); }
  }

  // ---- Rich hover tooltips & bottom HUD interactions ----
  let meRef = null;
  const setHoverSlot = (slot) => {
    const inp = opts.input; if (!inp) return;
    if (typeof inp.setHoverSlot === 'function') inp.setHoverSlot(slot);
    else if (typeof inp.hoverSlot === 'function') inp.hoverSlot(slot);
  };
  for (const k of SLOTS) {
    const sl = slots[k];
    sl.box.addEventListener('pointerenter', () => {
      const me = meRef, def = me && CHAMPIONS[me.champ]; if (!def) return;
      const stance = kitTags && kitTags.stance, sk = resolveSkill(def, k, stance); if (!sk) return;
      tooltip.show(skillCardHtml(def, k, stance, me), sl.box, { above: true, color: hex(sk.color == null ? 0x39c2ff : sk.color) });
      setHoverSlot(k);
    });
    sl.box.addEventListener('pointerleave', () => { tooltip.hide(); setHoverSlot(null); });
  }
  for (const k of SPELL_SLOTS) {
    const sl = slots[k];
    sl.box.addEventListener('pointerenter', () => {
      const me = meRef, sp = sl.id && SPELLS[sl.id]; if (!sp) return;
      tooltip.show(spellCardHtml(sp, k, (me && me.level) || 1), sl.box, { above: true, color: hex(sp.color == null ? 0x39c2ff : sp.color) });
      setHoverSlot(k);
    });
    sl.box.addEventListener('pointerleave', () => { tooltip.hide(); setHoverSlot(null); });
  }
  who.style.pointerEvents = 'auto'; who.style.cursor = 'pointer';
  who.addEventListener('pointerenter', () => {
    const me = meRef, def = me && CHAMPIONS[me.champ]; if (!def) return;
    tooltip.show(champCardHtml(def, me), who, { above: true });
  });
  who.addEventListener('pointerleave', () => { tooltip.hide(); });
  items.forEach((d, i) => {
    d.style.pointerEvents = 'auto';
    d.addEventListener('pointerenter', () => {
      if (!d._id || !meRef) return;
      tooltip.show(itemCardHtml(d._id, toArr(meRef.items), meRef.gold | 0, (meRef._boughtAt && meRef._boughtAt[i]) || 0, Date.now()), d, { above: true });
    });
    d.addEventListener('pointerleave', () => { tooltip.hide(); });
    d.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const it = d._id && ITEMS[d._id];
      if (it && (it.active || it.consumable)) {
        try { source.send('active', {}); } catch (_) { /* closed */ }
        AudioManager.uiClick?.();
      } else {
        AudioManager.uiClick?.();
        extras.toggleShop();
      }
    });
  });
  goldEl.style.pointerEvents = 'auto'; goldEl.style.cursor = 'pointer'; goldEl.title = 'Open Shop (P)';
  goldEl.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); AudioManager.uiClick?.(); extras.toggleShop(); });

  // gold pop pool (world-anchored at spawn)
  const goldPool = []; let goldI = 0;
  for (let i = 0; i < 8; i++) goldPool.push(el(root, 'div', 'bsh-gold bsh-stroke'));
  const offs = [onLangChange(() => { lobbySig = ''; tooltip.hide(); })];
  const sub = (type, fn) => { const o = source.on(type, (m) => { if (disposed) return; fn(m); }); if (typeof o === 'function') offs.push(o); };
  sub('gold', (m) => {
    if (!m || !Number.isFinite(m.n) || !Number.isFinite(m.x) || !Number.isFinite(m.y)) return;
    const p = project ? project(m.x, m.y) : null; if (!p || !p.visible) return;
    const d = goldPool[goldI++ % goldPool.length];
    d.textContent = `+${Math.round(m.n)}🪙`; d.style.left = `${p.x}px`; d.style.top = `${p.y}px`;
    d.classList.remove('go'); void d.offsetWidth; d.classList.add('go');
  });

  // ---- per-update state ----
  let slowAt = 0, mmAt = 0, endClock = null, kitBuffs = null, kitTags = {}, kitSince = {}, ccBuffs = null, ccList = [], ccSince = {}, ccIcons = [], kitNodes = [];
  const cdPrev = {};
  const ccFx = {};
  sub('fx', (m) => { // v6.1: cc / ccBreak about the local champion set / clear the ring length
    if (!m || !m.type || (m.k !== 'cc' && m.k !== 'ccBreak')) return;
    if (m.id && m.id !== source.localId && m.target !== source.localId) { if (m.id || m.target) return; }
    if (m.k === 'cc') ccFx[m.type] = { at: Date.now(), ms: Math.max(1, Number(m.ms) || (CC_TYPES[m.type] && CC_TYPES[m.type].typMs) || 1000) }; else delete ccFx[m.type];
  });

  function applySpec(slot, sk) {
    const sl = slots[slot]; sl.spec = sk;
    const url = skillIconUrl(sk.iconKey);
    if (url) {
      let img = sl.ic.querySelector('img');
      if (!img) { sl.ic.replaceChildren(); img = document.createElement('img'); img.alt = ''; sl.ic.appendChild(img); }
      img.src = url;
      img.onerror = () => {
        if (sl.ic.dataset.iconKey !== sk.iconKey) return;
        sl.ic.replaceChildren(); sl.ic._v = null; setText(sl.ic, sk.icon || '✨');
      };
      sl.ic.dataset.iconKey = sk.iconKey;
    } else {
      delete sl.ic.dataset.iconKey;
      sl.ic.replaceChildren(); sl.ic._v = null; setText(sl.ic, sk.icon || '✨');
    }
    setText(sl.mana, String(sk.mana)); setStyle(sl.box, '--c', hex(sk.color == null ? 0x3a4a66 : sk.color));
    sl.box.title = '';
  }

  function updateKit(me, def, now) {
    const buffs = me.buffs || '';
    if (buffs !== kitBuffs) {
      kitBuffs = buffs; kitTags = parseKitTags(buffs);
      for (const k of Object.keys(kitSince)) if (!(k in kitTags)) delete kitSince[k];
      for (const k of Object.keys(kitTags)) if (!(k in kitSince)) kitSince[k] = now;
    }
    const chips = []; // {str,color,bar?,win?}
    const kt = kitTags, dur = (get) => { for (const s of Object.values((def && def.skills) || {})) { const v = get(s); if (v) return v; } return 0; };
    const timed = (tag, get) => { const d = dur(get); return d > 0 ? 1 - (now - (kitSince[tag] || now)) / d : undefined; };
    if (def) {
      if (kt.stance !== undefined) chips.push({ str: `Stance: ${kt.stance}`, color: 0xbfe6ff });
      const rs = def.kit && def.kit.res;
      if (rs && kt[rs.key] !== undefined) { const v = Math.max(0, Math.min(rs.max, Number(kt[rs.key]) || 0)); chips.push({ str: `${rs.key} ${'●'.repeat(v)}${'○'.repeat(rs.max - v)}`, color: rs.key === 'orbs' ? 0x6cffd6 : 0xff8ac8 }); }
      if (def.kit && def.kit.mix) { const L = kt.mix || '', a = []; for (let i = 0; i < def.kit.mix.max; i++) a.push(L[i] || '_'); chips.push({ str: `mix ${a.join(' ')}`, color: 0xc8864a }); }
      if (kt.pkg !== undefined) { const p = Number(kt.pkg) || 0; chips.push({ str: `tip ${p}%`, color: 0xffc04d, bar: p / 100 }); }
      if (kt.turrets) chips.push({ str: `turrets ${kt.turrets}`, color: 0x00e5ff });
      if (kt.pins) chips.push({ str: `pins ${kt.pins}`, color: 0xff7675 });
      if (kt.shadow) chips.push({ str: 'shadow', color: 0xb084ff, bar: timed('shadow', (s) => s.shadow && s.shadow.mode === 'place' && s.shadow.ms) });
      if (kt.echo) chips.push({ str: 'echo armed', color: 0x91a7ff, bar: timed('echo', (s) => s.echo && s.echo.armMs) });
      if (kt.tbox) chips.push({ str: 'timebox', color: 0xffe066, bar: timed('tbox', (s) => s.timebox && s.timebox.ms) });
      if (kt.tether) chips.push({ str: 'tether', color: 0x7ed957, bar: timed('tether', (s) => s.tether && s.tether.durationMs) });
      if (kt.link) { const c = source.state() && source.state().champions && source.state().champions.get(kt.link); chips.push({ str: `link: ${(c && c.name) || '?'}`, color: 0x7ed957, bar: timed('link', (s) => s.link && s.link.ms) }); }
      if (kt.reload) {
        const sp = Object.values(def.skills).find((s) => s.reload); const rl = sp && sp.reload;
        chips.push({ str: 'Reloading', color: 0xffffff, bar: rl ? Math.min(1, (now - (kitSince.reload || now)) / rl.ms) : 0, win: rl && rl.perfect });
      }
    }
    while (kitNodes.length < chips.length) { const s = el(kit, 'span', '', '<em></em><span class="kb"><i></i><u></u></span>'); kitNodes.push(s); }
    kitNodes.forEach((n, i) => {
      const c = chips[i]; setHidden(n, !c); if (!c) return;
      const lab = n.firstChild, kbar = n.lastChild; setText(lab, c.str); setStyle(n, 'color', hex(c.color));
      setHidden(kbar, c.bar === undefined);
      if (c.bar !== undefined) { setStyle(kbar.firstChild, 'width', `${Math.max(0, Math.min(1, c.bar)) * 100}%`); const w = c.win; setHidden(kbar.lastChild, !w); if (w) { setStyle(kbar.lastChild, 'left', `${w[0] * 100}%`); setStyle(kbar.lastChild, 'width', `${(w[1] - w[0]) * 100}%`); } }
    });
  }

  function updateCc(me, now) {
    const buffs = me.buffs || '';
    if (buffs !== ccBuffs) {
      ccBuffs = buffs; const list = parseCcTags(buffs).slice(0, CC_ICONS_MAX);
      for (const k of Object.keys(ccSince)) if (!list.includes(k)) { delete ccSince[k]; delete ccFx[k]; }
      for (const k of list) if (!(k in ccSince)) ccSince[k] = now;
      ccList = list;
      while (ccIcons.length < CC_ICONS_MAX) ccIcons.push(el(ccRow, 'div', 'bsh-cc', '<div class="ci"></div><div class="cl"></div>'));
      ccIcons.forEach((n, i) => { const k = list[i]; setHidden(n, !k); if (!k) return; const ty = CC_TYPES[k]; setStyle(n, '--c', hex(ty.color)); setText(n.firstChild, ty.icon); setText(n.lastChild, ty.label); });
    }
    ccList.forEach((k, i) => {
      const ty = CC_TYPES[k], fx = ccFx[k], since = ccSince[k] == null ? now : ccSince[k], useFx = fx && fx.at >= since - 600;
      const start = useFx ? fx.at : since, ms = useFx ? fx.ms : ty.typMs;
      setStyle(ccIcons[i], '--f', String(Math.round(Math.max(0, Math.min(1, 1 - (now - start) / ms)) * 100)));
    });
  }

  function updateSlots(me, def, srvNow, ctx) {
    const lv = me.level || 1, stance = kitTags && kitTags.stance;
    const hasRanks = !!me.ranks || Number.isFinite(me.rankQ);
    for (const slot of SLOTS) {
      const sl = slots[slot], sk = resolveSkill(def, slot, stance); if (!sk) continue;
      if (sl.spec !== sk) applySpec(slot, sk);
      const nxt = sk.type === 'stance' && stance ? nextStance(sk, stance) : '';
      setHidden(sl.sub, !nxt); if (nxt) setText(sl.sub, `> ${String(nxt).slice(0, 6)}`);
      const readyAt = me['cd' + slot.toUpperCase()] || 0, left = readyAt > srvNow ? readyAt - srvNow : 0;
      if (readyAt !== sl.prev) { sl.prev = readyAt; if (left > 0) sl.cdTotal = Math.max(left, 300); }
      const locked = slot === 'r' && lv < ULT_UNLOCK_LEVEL;
      const rank = me.ranks ? (me.ranks[slot] || 0) : (Number.isFinite(me.rankQ) ? (me[`rank${slot.toUpperCase()}`] || 0) : (locked ? 0 : 1));
      const maxR = slot === 'r' ? 3 : 5, canUp = (me.skillPoints || 0) > 0 && !locked && rank < maxR && !me.dead;
      setHidden(sl.up, !canUp);
      setText(sl.pips, hasRanks ? '●'.repeat(rank) + '○'.repeat(Math.max(0, maxR - rank)) : '');
      const unlearned = hasRanks && rank <= 0 && !locked, noMana = !locked && !unlearned && left <= 0 && (me.mana || 0) < sk.mana;
      setHidden(sl.lock, !(locked || unlearned)); setText(sl.lock, locked ? `🔒\nLv ${ULT_UNLOCK_LEVEL}` : (unlearned ? 'Lv 0' : ''));
      setHidden(sl.nm, !noMana); sl.ic.style.opacity = locked || unlearned ? '0.3' : '1';
      const dimSolid = locked || unlearned || !!me.dead;
      setHidden(sl.dim, !(dimSolid || left > 0)); sl.dim.classList.toggle('solid', dimSolid && !(left > 0));
      setStyle(sl.dim, '--f', String(left > 0 ? Math.round(Math.min(1, left / sl.cdTotal) * 100) : 0));
      setText(sl.cd, left > 0 && !locked && !unlearned ? (left >= 1000 ? String(Math.ceil(left / 1000)) : (left / 1000).toFixed(1)) : '');
      const h = ctx.held && ctx.held.slot === slot && ctx.held.mode === 'hold' ? ctx.held : null; // charge ring
      setHidden(sl.hold, !h);
      if (h) { const hd = h.spec.hold, el2 = ctx.now - h.since, f = Math.max(0, Math.min(1, el2 / hd.maxMs)); setStyle(sl.hold, '--hf', String(Math.round(f * 100))); setStyle(sl.hold, '--hc', el2 < hd.minMs ? '#9fb0c8' : f >= 1 ? '#ff5e5e' : '#ffd23f'); }
    }
    for (const slot of SPELL_SLOTS) {
      const sl = slots[slot], K = slot.toUpperCase(), id = me['spell' + K] || '', sp = SPELLS[id] || null;
      if (sl.id !== id) { sl.id = id; setText(sl.ic, (sp && sp.icon) || '·'); setStyle(sl.box, '--c', hex(sp ? sp.color : 0x3a4a66)); sl.box.title = ''; }
      const readyAt = me['cd' + K] || 0, left = readyAt > srvNow ? readyAt - srvNow : 0;
      const hasCh = !!(sp && sp.maxCharges > 1), chg = hasCh ? (me['charges' + K] == null ? sp.maxCharges : me['charges' + K]) : 0;
      setHidden(sl.chg, !hasCh); if (hasCh) { setText(sl.chg, String(chg)); setStyle(sl.chg, 'color', chg > 0 ? '#ffd23f' : '#ff6b6b'); }
      if (readyAt !== sl.prev) { sl.prev = readyAt; if (left > 0) sl.cdTotal = Math.max(left, sp ? (hasCh && chg > 0 ? (sp.castCd || 10) * 1000 : spellCooldownMs(sp, lv)) : 300); }
      const dimSolid = !!me.dead || !sp;
      setHidden(sl.dim, !(dimSolid || left > 0)); sl.dim.classList.toggle('solid', dimSolid && !(left > 0));
      setStyle(sl.dim, '--f', String(left > 0 ? Math.round(Math.min(1, left / sl.cdTotal) * 100) : 0));
      setText(sl.cd, left > 0 ? (left >= 1000 ? String(Math.ceil(left / 1000)) : (left / 1000).toFixed(1)) : '');
    }
  }

  function updatePanel(me, srvNow, ctx) {
    const def = CHAMPIONS[me.champ] || null;
    if (face._champ !== me.champ) { face._champ = me.champ; setText(face, (def && def.emoji) || '🐞'); }
    updateKit(me, def, ctx.now); updateCc(me, ctx.now);
    const maxHp = Math.max(1, me.maxHp || 1), hp = Math.max(0, me.hp || 0), sh = me.shield || 0, p = Math.min(1, hp / maxHp);
    setStyle(hpFill, 'width', `${p * 100}%`); setStyle(shFill, 'left', `${p * 100}%`); setStyle(shFill, 'width', `${Math.max(0, Math.min(1 - p, sh / maxHp)) * 100}%`);
    setText(hpTxt, `${Math.round(hp)} / ${Math.round(maxHp)}${sh > 0 ? `  (+${Math.round(sh)})` : ''}`);
    const maxMp = Math.max(1, me.maxMana || 1), mp = Math.max(0, me.mana || 0);
    setStyle(mpFill, 'width', `${Math.min(1, mp / maxMp) * 100}%`); setText(mpTxt, `${Math.round(mp)} / ${Math.round(maxMp)}`);
    const lv = me.level || 1, xp = me.xp || 0, lo = XP_TABLE[lv - 1] || 0, hi = XP_TABLE[lv] == null ? lo : XP_TABLE[lv];
    setText(lvEl, String(lv)); setStyle(ring, '--p', String(lv >= MAX_LEVEL || hi <= lo ? 100 : Math.round(Math.max(0, Math.min(1, (xp - lo) / (hi - lo))) * 100)));
    if (def) updateSlots(me, def, srvNow, ctx);
    const its = toArr(me.items);
    items.forEach((d, i) => { const id = its[i] || ''; if (d._id !== id) { d._id = id; d.textContent = (ITEMS[id] && ITEMS[id].emoji) || ''; d.title = ''; d.classList.toggle('on', !!id); } });
    setText(goldEl, `🪙 ${me.gold | 0}`); goldEl.classList.toggle('shop', !!ctx.canShop);
    setText(kdaEl, `⚔ ${me.kills | 0} / ${me.deaths | 0} / ${me.assists | 0}   🐛 ${me.cs | 0}`);
    setText(statCells.ad, String(me.ad | 0)); setText(statCells.ap, String(me.ap | 0)); setText(statCells.ar, String(me.armor | 0)); setText(statCells.as, Number(me.as || 0).toFixed(2)); setText(statCells.rg, String(me.range | 0)); setText(statCells.ms, String(me.ms | 0));
    setStyle(hpTicks, '--tk', `${Math.max(3, 100 * (maxHp > 3000 ? 500 : maxHp > 1400 ? 250 : 100) / maxHp * (hpBar.clientWidth || 400) / 100).toFixed(2)}px`);
    const rec = (me.recallUntil || 0) > srvNow && !me.dead; setHidden(recallBox, !rec);
    if (rec) { const l = me.recallUntil - srvNow; setStyle(recallFill, 'width', `${Math.max(0, 1 - l / RECALL_MS) * 100}%`); setText(recallTxt, `🏠 Recalling to the break room… ${(l / 1000).toFixed(1)}s`); }
    const dead = !!me.dead && ctx.phase === 'playing'; setHidden(death, !dead);
    if (dead) { const l = Math.max(0, (me.respawnAt || 0) - srvNow); setText(deathC, l > 0 ? `Respawning in ${Math.ceil(l / 1000)} s` : 'Respawning…'); }
    const hid = me.inBush && !me.dead && ctx.phase === 'playing' ? (ctx.hidden || 'hidden') : (ctx.hidden && !me.dead && ctx.phase === 'playing' ? ctx.hidden : null);
    setHidden(hidePill, !hid);
    if (hid) { setText(hidePill, hid === 'hidden' ? "🌿 HIDDEN: enemies can't see you" : hid === 'enemy' ? '👀 An enemy is in your bush: you are visible' : '🌿 Revealed: you attacked (hidden again in 1.5s)'); hidePill.classList.toggle('warn', hid !== 'hidden'); }
  }

  function update(ctx = {}) {
    if (disposed) return;
    const st = ctx.st || source.state(), srvNow = ctx.srvNow == null ? source.srvNow() : ctx.srvNow, now = ctx.now || Date.now(), myId = ctx.myId || source.localId;
    const phase = ctx.phase || (st && st.phase);
    const c2 = { ...ctx, st, srvNow, now, myId, phase };
    nameplates.setMePos(ctx.mePos || null); if (!fitted) { fitted = true; fit(); }
    feeds.update(phase, srvNow);
    if (!st) return;
    const me = ctx.me || (st.champions && st.champions.get && st.champions.get(myId)) || null, myTeam = me && me.team;
    meRef = me;
    setText(kb, `${TEAM_INFO.blue.emoji} ${st.blueKills | 0}`); setText(kr, `${st.redKills | 0} ${TEAM_INFO.red.emoji}`);
    const t = phase === 'playing' && st.startedAt ? srvNow - st.startedAt : (phase === 'ended' && st.startedAt ? (endClock == null ? (endClock = srvNow - st.startedAt) : endClock) : 0);
    setText(clockEl, fmtTime(t));
    if (now >= slowAt) {
      slowAt = now + 250;
      const ep = (at, icon) => (at > srvNow ? `${icon} ${fmtTime(at - srvNow)}` : (phase === 'playing' ? `${icon} UP` : `${icon} -`));
      let tb = 0, tr = 0; if (st.structures && st.structures.forEach) st.structures.forEach((s) => { if (s.kind === 'tower' && s.alive !== false) { if (s.team === 'blue') tb++; else tr++; } });
      setText(epicEl, `${ep(st.epicGoldenAt || 0, '✨')}  ${ep(st.epicDeadlineAt || 0, '⏰')}  🗼 ${tb}:${tr}`);
      const buffs = [];
      for (const team of ['blue', 'red']) {
        const id = team === 'blue' ? st.buffBlue : st.buffRed, until = team === 'blue' ? st.buffBlueUntil : st.buffRedUntil;
        if (id && until > srvNow) buffs.push({ team, str: `${TEAM_INFO[team].emoji} ${id === 'deadline' ? `${EPICS.deadline.title} buff` : id} ${fmtTime(until - srvNow)}` });
      }
      setText(buffEl, buffs.map((b) => b.str).join('   ')); if (buffs.length) setStyle(buffEl, 'color', TEAM_INFO[buffs[0].team].css);
    }
    if (now >= mmAt) { mmAt = now + 120; mm.draw(st, myId, ctx.mePos || null, ctx.view || null); }
    const selId = ctx.selectedId || (me && me.targetId) || null;
    target.update(st, selId, myTeam);
    if (me) updatePanel(me, srvNow, c2);
    if (!me && !panel.hidden) tooltip.hide();
    panel.hidden = !me;
    extras.update(me, c2);
    shop.update(me, c2); augs.update(me, c2); sbd.update(now); endScr.update(st, phase, srvNow);
    nameplates.setHidden(modalOpen() || extras.panelOpen() || shop.isOpen() || sbd.isOpen());
    updateLobby(st, phase, srvNow);
    tickCoach(me, st, srvNow, now, !!ctx.canShop, phase);
  }

  return {
    setScoreboard(on) { sbd.set(on); }, scoreboardOpen: () => modalOpen(), // holding TAB is non-blocking like 2D Scoreboard
    blocked: modalOpen, onPlayAgain: (f) => { hooksOut.onPlayAgain = f; }, onExit: (f) => { hooksOut.onExit = f; },
    toggleShop: extras.toggleShop, openShop: shop.open, toggleInfo: extras.toggleInfo, togglePause: extras.togglePause,
    pauseOpen: extras.pauseOpen, isPauseOpen: extras.pauseOpen,
    closePanels: extras.closePanels, panelOpen: extras.panelOpen,
    update, toast: feeds.toast, tip: feeds.tip, setStatus: feeds.setStatus, setTarget: target.set, setMinimapAim: mm.setAim,
    dispose() {
      if (disposed) return; disposed = true; offs.forEach((o) => { try { o(); } catch (_) { /* ignore */ } });
      tooltip.hide(); lobbyEl.remove();
      nameplates.dispose(); removeEventListener('resize', fit); extras.dispose(); shop.dispose(); sbd.dispose(); augs.dispose(); endScr.dispose(); tooltip.dispose(); feeds.dispose(); mm.dispose(); target.dispose(); root.remove();
    },
  };
}

export default createHud;

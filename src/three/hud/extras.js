// hud/extras.js - the HUD parts that the Phaser MobaHud/TeamModeScene had but the first 3D HUD lacked:
//   * sandbox toolbar (SWAP CHAMP, 0s CD, NO MANA, NO DMG, +LV, +5000g, +30s, +DUMMY, CLEAR)   [offline sandbox only]
//   * action buttons: SHOP (P), INFO (C), SCORE (TAB), RECALL (B)
//   * shop panel (items from shared/moba/items.js, buy / sell through source.send, same place rules as the sim)
//   * info panel (champion + skill descriptions, C)
//   * touch controls (virtual joystick left, Q/W/E/R/D/F + attack right) on touch devices only
// createExtras({root, source, opts, hudApi}) -> {update(me, ctx), toggleShop(), toggleInfo(), closePanels(), panelOpen(), dispose()}
// Everything is dirty-checked (cached text / signatures) and only written from update() (~10 Hz).
import { CHAMPIONS, CHAMPION_IDS, resolveSkill, parseKitTags } from '../../../shared/moba/champions.js';
import { ITEMS, SHOP_ORDER, recipePlan, buyBlocker } from '../../../shared/moba/items.js';
import { sellValue, INVENTORY_SLOTS, ULT_UNLOCK_LEVEL } from '../../../shared/moba/rules.js';
import { SPELLS, spellCooldownMs } from '../../../shared/moba/spells.js';
import { AudioManager } from '../../core/AudioManager.js';
import { SaveManager } from '../../core/SaveManager.js';
import { clearMatch } from '../../core/Identity.js';

const el = (parent, tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const setText = (e, v) => { if (e._v !== v) { e._v = v; e.textContent = v; } };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toArr = (a) => (!a ? [] : Array.isArray(a) ? a : Array.from(a));
const evalAmt = (a, me) => {
  if (!a || !me) return 0;
  return Math.round(
    (a.base || 0)
    + (a.perLevel || 0) * Math.max(0, (me.level || 1) - 1)
    + (a.ad || 0) * (me.ad || 0)
    + (a.ap || 0) * (me.ap || 0)
    + (a.hp || 0) * (me.maxHp || 0)
  );
};
export const isTouchDevice = () => {
  try { if (/[?&]touch=1/.test(location.search)) return true; return !!(('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.matchMedia && matchMedia('(pointer: coarse)').matches)); } catch (_) { return false; }
};

export function createExtras({ root, source, opts = {}, hudApi = {} }) {
  const input = opts.input || null;
  const sim = source.sim || null, sandbox = !!(sim && sim.sandbox);
  let disposed = false, meRef = null, canShopNow = false, nowMs = 0, srvNowMs = 0;
  const send = (type, msg) => { try { source.send(type, msg || {}); } catch (_) { /* closed */ } };
  const toast = (m, c) => { try { hudApi.toast && hudApi.toast(m, c); } catch (_) { /* ignore */ } };
  const cleanup = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); cleanup.push(() => t.removeEventListener(ev, fn, o)); };
  const press = (btn, fn) => on(btn, 'pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(e); });

  const getCamLocked = () => (opts.camera && typeof opts.camera.locked === 'boolean' ? opts.camera.locked : true);
  function doToggleCam() {
    if (opts.camera && typeof opts.camera.toggleLock === 'function') opts.camera.toggleLock();
    else if (input && typeof input.toggleCamLock === 'function') input.toggleCamLock();
    else if (opts.camera && typeof opts.camera.locked === 'boolean') opts.camera.locked = !opts.camera.locked;
    AudioManager.uiClick?.();
    const locked = getCamLocked();
    setText(bCam, locked ? '🔒 CAM (Y)' : '🔓 FREE (Y)');
    syncPauseUi();
    toast(locked ? '🔒 Camera locked (Y)' : '🔓 Free camera (Y)', '#9fdcff');
  }
  function doToggleMute() {
    const m = AudioManager.toggleMute();
    SaveManager.setMuted(m);
    setText(bMute, m ? '🔇' : '🔊');
    syncPauseUi();
    if (!m) AudioManager.uiClick?.();
    toast(m ? '🔇 Sound muted' : '🔊 Sound unmuted', m ? '#ff8a8a' : '#7ed957');
  }

  // ---------- action buttons (above the bottom panel, right side) ----------
  const acts = el(root, 'div', 'bsx-acts bsh-pop');
  const bShop = el(acts, 'button', 'bsh-btn', '🛒 SHOP (P)'), bInfo = el(acts, 'button', 'bsh-btn', 'ℹ INFO (C)');
  const bScore = el(acts, 'button', 'bsh-btn', '📊 TAB'), bRecall = el(acts, 'button', 'bsh-btn bsx-recall', '🏠 RECALL (B)');
  const bCam = el(acts, 'button', 'bsh-btn', getCamLocked() ? '🔒 CAM (Y)' : '🔓 FREE (Y)');
  bCam.title = 'Toggle Camera Lock (Y)';
  const bMute = el(acts, 'button', 'bsh-btn', AudioManager.isMuted() ? '🔇' : '🔊');
  bMute.title = 'Toggle Sound (M)';
  bShop.onclick = () => { AudioManager.uiClick?.(); toggleShop(); };
  bInfo.onclick = () => { AudioManager.uiClick?.(); toggleInfo(); };
  bScore.onclick = () => { AudioManager.uiClick?.(); hudApi.setScoreboard && hudApi.setScoreboard(!(hudApi.scoreboardOpen && hudApi.scoreboardOpen())); };
  bRecall.onclick = () => { AudioManager.uiClick?.(); if (input) input.recall(); else send('recall', {}); };
  bCam.onclick = doToggleCam;
  bMute.onclick = doToggleMute;

  // ---------- sandbox toolbar ----------
  let sbx = null; const sbxBtns = {};
  if (sandbox) {
    sbx = el(root, 'div', 'bsx-sbx bsh-pop');
    el(sbx, 'div', 'bsx-sbx-t', 'PRACTICE MODE · sandbox');
    const row = el(sbx, 'div', 'bsx-sbx-row');
    const mk = (k, label, color, fn) => { const b = el(row, 'button', 'bsh-btn bsx-sb', label); b.style.setProperty('--c', color); b.onclick = () => { fn(); }; sbxBtns[k] = b; return b; };
    mk('swap', 'SWAP CHAMP', '#ffb347', () => { AudioManager.uiClick?.(); openSwap(); });
    mk('cd', '0s CD: ON', '#39c2ff', () => { send('setNoCd', { enabled: !sim.noCd }); });
    mk('mana', 'NO MANA: ON', '#7ec8ff', () => { send('setNoMana', { enabled: !sim.noMana }); });
    mk('god', 'NO DMG: ON', '#7ed957', () => { send('setGodMode', { enabled: !sim.godMode }); });
    mk('lv', '+LV', '#ffd23f', () => { const m = meRef; if (m && source.debug) { source.debug('level', (m.level || 1) + 1); try { if (sim && sim._checkAugmentOffer) sim._checkAugmentOffer(m); } catch (_) { /* sandbox only: debug level skips the natural augment trigger */ } } });
    mk('gold', '+5000g', '#ffd23f', () => { if (source.debug) source.debug('gold', 5000); });
    mk('wave', '+30s', '#b084ff', () => { for (let i = 0; i < 300; i++) sim.update(100); }); // fast-forward the sim 30 s (same as the Phaser sandbox)
    mk('dummy', '+DUMMY', '#ff8a8a', () => send('spawnDummy', {}));
    mk('clear', 'CLEAR', '#ff5e5e', () => send('clearDummies', {}));
  }

  // ---------- in-match Pause / Settings modal ----------
  const pauseEl = el(root, 'div', 'bsx-pause bsh-pop'); pauseEl.hidden = true;
  let curQuality = (opts.getQuality && opts.getQuality()) || (SaveManager.getSettings && SaveManager.getSettings().quality) || 'high';
  pauseEl.innerHTML = `<div class="bsx-pause-box">`
    + `<div class="bsx-pause-t">⏸ PAUSED · OFFICE SETTINGS</div>`
    + `<div class="bsx-pause-row"><span>FX Quality</span><div class="bsx-qgrp">`
    + `<button class="bsh-btn" data-q="low">LOW</button><button class="bsh-btn" data-q="med">MED</button><button class="bsh-btn" data-q="high">HIGH</button>`
    + `</div></div>`
    + `<div class="bsx-pause-row"><span>Camera</span><button class="bsh-btn" data-pa="cam"></button></div>`
    + `<div class="bsx-pause-row"><span>Audio</span><button class="bsh-btn" data-pa="mute"></button></div>`
    + `<div class="bsx-pause-acts"><button class="bsh-btn yes" data-pa="resume">▶ RESUME</button><button class="bsh-btn no" data-pa="leave">🚪 LEAVE MATCH</button></div>`
    + `</div>`;
  const pCamBtn = pauseEl.querySelector('[data-pa="cam"]');
  const pMuteBtn = pauseEl.querySelector('[data-pa="mute"]');
  const pQBtns = Array.from(pauseEl.querySelectorAll('[data-q]'));
  function syncPauseUi() {
    const locked = getCamLocked();
    setText(pCamBtn, locked ? '🔒 LOCKED (Y)' : '🔓 FREE (Y)');
    setText(pMuteBtn, AudioManager.isMuted() ? '🔇 MUTED' : '🔊 SOUND ON');
    for (const b of pQBtns) b.classList.toggle('on', b.dataset.q === curQuality);
  }
  syncPauseUi();
  on(pauseEl, 'click', (e) => {
    if (e.target === pauseEl) { togglePause(false); return; }
    const qb = e.target.closest('[data-q]');
    if (qb) {
      curQuality = qb.dataset.q;
      try { opts.setQuality?.(curQuality); } catch (_) { /* ignore */ }
      AudioManager.uiClick?.();
      syncPauseUi();
      toast(`✨ FX Quality: ${curQuality.toUpperCase()}`, '#ffd23f');
      return;
    }
    const pa = e.target.closest('[data-pa]'); if (!pa) return;
    const act = pa.dataset.pa;
    if (act === 'cam') doToggleCam();
    else if (act === 'mute') doToggleMute();
    else if (act === 'resume') togglePause(false);
    else if (act === 'leave') {
      AudioManager.uiClick?.();
      clearMatch();
      const exitFn = opts.onExit || hudApi.onExit;
      if (typeof exitFn === 'function') exitFn();
      else location.href = location.pathname + '?scene=menu&renderer=3d';
    }
  });
  function pauseOpen() { return !pauseEl.hidden; }
  function togglePause(force) {
    const next = typeof force === 'boolean' ? force : pauseEl.hidden;
    if (next) {
      close();
      syncPauseUi();
      pauseEl.hidden = false;
      AudioManager.pause?.();
    } else if (!pauseEl.hidden) {
      pauseEl.hidden = true;
      AudioManager.resume?.();
    }
  }

  // ---------- panels (info / champ swap) ----------
  const panel = el(root, 'div', 'bsx-panel bsh-pop'); panel.hidden = true;
  const pHead = el(panel, 'div', 'bsx-ph'), pTitle = el(pHead, 'div', 'bsx-pt'), pClose = el(pHead, 'button', 'bsh-btn', '✕ close');
  const pBody = el(panel, 'div', 'bsx-pb');
  let kind = ''; // '' | 'info' | 'swap'  (shop lives in shop.js, reached through hudApi.shop)
  const shopApi = hudApi.shop || null;
  let shopSig = '', infoSig = '';
  const close = () => { kind = ''; panel.hidden = true; if (shopApi) shopApi.close(); };
  pClose.onclick = () => { AudioManager.uiClick?.(); close(); };
  const open = (k) => { if (shopApi) shopApi.close(); pauseEl.hidden = true; kind = k; panel.hidden = false; shopSig = infoSig = ''; render(); };
  function toggleShop() { if (!shopApi) return; if (shopApi.isOpen()) { close(); } else { kind = ''; panel.hidden = true; pauseEl.hidden = true; shopApi.open(); } }
  function toggleInfo() { if (kind === 'info') close(); else open('info'); }
  function openSwap() { if (kind === 'swap') close(); else open('swap'); }
  // event delegation for buy / sell / swap
  on(pBody, 'click', (e) => {
    const t = e.target.closest('[data-act]'); if (!t || t.disabled || t.classList.contains('off')) return;
    const act = t.dataset.act, v = t.dataset.v;
    if (act === 'buy') { if (!canShopNow) { toast('🛒 Shop only in your break room (or while dead)', '#ff8a8a'); return; } send('buy', { item: v }); shopSig = ''; }
    else if (act === 'sell') { if (!canShopNow) { toast('🛒 Sell in your break room (or while dead)', '#ff8a8a'); return; } send('sell', { slot: Number(v) }); shopSig = ''; }
    else if (act === 'swap') { AudioManager.uiClick?.(); send('switchChamp', { champ: v }); close(); }
  });

  function render() {
    const me = meRef;
    if (kind === 'swap') {
      setText(pTitle, 'SWAP CHAMPION (PRACTICE)');
      const sig = 'swap' + (me && me.champ); if (sig === infoSig) return; infoSig = sig;
      pBody.innerHTML = '<div class="bsx-grid">' + CHAMPION_IDS.map((id) => { const d = CHAMPIONS[id]; return `<button class="bsh-btn bsx-ch${me && me.champ === id ? ' on' : ''}" data-act="swap" data-v="${id}">${d.emoji} ${esc(d.name)}<small>${esc(d.role)}</small></button>`; }).join('') + '</div>';
    } else if (kind === 'info') {
      const def = me && CHAMPIONS[me.champ]; setText(pTitle, def ? `${def.emoji} ${def.name} ${def.title}` : 'INFO');
      if (!def) { pBody.textContent = 'No champion.'; return; }
      const sr = srvNowMs || nowMs;
      const kt = parseKitTags(me.buffs || ''), stance = kt && kt.stance;
      const cdSnap = ['Q', 'W', 'E', 'R', 'D', 'F'].map((K) => Math.ceil(Math.max(0, (me['cd' + K] || 0) - sr) / 500)).join(',');
      const sig = ['info', me.champ, me.level | 0, me.ad | 0, me.ap | 0, me.armor | 0, Math.round((me.as || 0) * 100), Math.round((me.haste || 0) * 100), Math.round((me.lifesteal || 0) * 100), me.ms | 0, me.maxHp | 0, me.spellD, me.spellF, stance || '', cdSnap].join('|');
      if (sig === infoSig) return; infoSig = sig;

      const ar = Math.max(0, me.armor || 0);
      const arRed = Math.round((ar / (100 + ar)) * 100);
      const hastePct = Math.round((me.haste || 0) * 100);
      const lsPct = Math.round((me.lifesteal || 0) * 100);
      const as = Number(me.as || 0);
      const dps = Math.round((me.ad || 0) * as);
      const statsHtml = `<div class="bsx-info-stats">`
        + `<div class="st-h">LIVE STATS · Lv ${me.level || 1}</div>`
        + `<div><span>❤️ HP</span><b>${Math.round(me.hp || 0)} / ${Math.round(me.maxHp || 0)}</b></div>`
        + `<div><span>💧 Mana</span><b>${Math.round(me.mana || 0)} / ${Math.round(me.maxMana || 0)}</b></div>`
        + `<div><span>⚔ AD</span><b>${me.ad | 0}</b></div>`
        + `<div><span>✦ AP</span><b>${me.ap | 0}</b></div>`
        + `<div><span>🛡 Armor</span><b>${Math.round(ar)} <small>(-${arRed}% dmg)</small></b></div>`
        + `<div><span>⚡ Atk Spd</span><b>${as.toFixed(2)}/s <small>(${dps} DPS)</small></b></div>`
        + `<div><span>⏱ Haste / CDR</span><b>${hastePct}%</b></div>`
        + `<div><span>🩸 Lifesteal</span><b>${lsPct}%</b></div>`
        + `<div><span>🎯 Range</span><b>${me.range | 0}</b></div>`
        + `<div><span>👟 Move Spd</span><b>${me.ms | 0}</b></div>`
        + `</div>`;

      const skillsHtml = ['q', 'w', 'e', 'r'].map((k) => {
        const s = resolveSkill(def, k, stance); if (!s) return '';
        const left = Math.max(0, (me['cd' + k.toUpperCase()] || 0) - sr);
        const locked = k === 'r' && (me.level || 1) < ULT_UNLOCK_LEVEL;
        const cdBadge = locked ? `<span class="sk-cd lock">🔒 Lv ${ULT_UNLOCK_LEVEL}</span>`
          : left > 0 ? `<span class="sk-cd wait">${(left / 1000).toFixed(1)}s</span>`
          : '<span class="sk-cd ok">READY</span>';
        const nums = [];
        if (s.dmg) nums.push(`⚔ ${evalAmt(s.dmg, me)} dmg`);
        if (s.heal) nums.push(`💚 ${evalAmt(s.heal, me)} heal`);
        if (s.shield) nums.push(`🛡 ${evalAmt(s.shield, me)} shield`);
        return `<div class="bsx-sk"><div class="bsx-sk-h"><b>${k.toUpperCase()}</b> ${esc(s.icon || '')} <b>${esc(s.name)}</b> <i>${s.mana || 0} mana · ${s.cd || 0}s</i> ${cdBadge}</div>`
          + (nums.length ? `<div class="bsx-sk-num">${nums.join(' · ')}</div>` : '')
          + `<div>${esc(s.desc || '')}</div></div>`;
      }).join('');

      const spellsHtml = ['d', 'f'].map((k) => {
        const K = k.toUpperCase(), id = me['spell' + K] || '', sp = SPELLS[id];
        if (!sp) return '';
        const left = Math.max(0, (me['cd' + K] || 0) - sr);
        const hasCh = sp.maxCharges > 1, chg = hasCh ? (me['charges' + K] == null ? sp.maxCharges : me['charges' + K]) : 0;
        const cdSec = +(spellCooldownMs(sp, me.level || 1) / 1000).toFixed(1);
        const cdBadge = left > 0 ? `<span class="sk-cd wait">${(left / 1000).toFixed(1)}s</span>` : '<span class="sk-cd ok">READY</span>';
        return `<div class="bsx-sk"><div class="bsx-sk-h"><b>${K}</b> ${esc(sp.icon || '')} <b>${esc(sp.name)}</b> <i>${cdSec}s CD${hasCh ? ` · ${chg}/${sp.maxCharges} charges` : ''}</i> ${cdBadge}</div><div>${esc(sp.desc || '')}</div></div>`;
      }).join('');

      pBody.innerHTML = `<div class="bsx-blurb">${esc(def.role)} · ${esc(def.blurb || '')}</div>`
        + `<div class="bsx-info-grid">${statsHtml}<div class="bsx-info-kit">${skillsHtml}`
        + (spellsHtml ? `<div class="st-h" style="margin-top:8px">SUMMONER SPELLS</div>${spellsHtml}` : '')
        + `</div></div>`
        + '<div class="bsx-blurb">Keys: Q W E R skills · D F spells · right-click move · SPACE attack · B recall · P shop · C info · TAB scoreboard · ESC pause</div>';
    } else if (kind === 'shop') {
      const items = me ? toArr(me.items) : [], gold = me ? me.gold | 0 : 0;
      setText(pTitle, `🛒 SHOP · 🪙 ${gold}` + (canShopNow ? '' : '  (go to your fountain / break room to buy)'));
      const rows = [];
      for (const id of SHOP_ORDER) {
        const it = ITEMS[id]; if (!it) continue;
        const plan = recipePlan(items, id), cost = it.consumable ? it.cost : plan.cost, why = buyBlocker(items, id);
        rows.push({ id, it, plan, cost, why, off: !canShopNow || gold < cost || !!why });
      }
      const sig = `${items.join(',')}|${canShopNow ? 1 : 0}|${rows.map((r) => (r.off ? 1 : 0) + ':' + r.cost).join('')}`; if (sig === shopSig) return; shopSig = sig;
      let h = '<div class="bsx-inv">' + Array.from({ length: INVENTORY_SLOTS }, (_, i) => {
        const id = items[i] || '', it = ITEMS[id];
        if (!it) return '<div class="bsx-slot"></div>';
        const bought = me && me._boughtAt ? me._boughtAt[i] : 0;
        return `<button class="bsx-slot on${canShopNow ? '' : ' off'}" data-act="sell" data-v="${i}" title="${esc(it.name)}: sell for ${sellValue(it.cost, bought, nowMs)}">${it.emoji}<small>sell ${sellValue(it.cost, bought, nowMs)}</small></button>`;
      }).join('') + '</div><div class="bsx-grid">';
      for (const { id, it, plan, cost, why, off } of rows) {
        h += `<button class="bsh-btn bsx-it${off ? ' off' : ''}" data-act="buy" data-v="${id}" title="${esc(it.desc || '')}${why ? ' [' + esc(why) + ']' : ''}"><span class="e">${it.emoji}</span><span class="n">${esc(it.name)}</span><span class="c">🪙 ${cost}${plan.discount ? ' <s>' + it.cost + '</s>' : ''}</span></button>`;
      }
      pBody.innerHTML = h + '</div>';
    }
  }

  // ---------- touch controls ----------
  let touch = null, touchTick = null; const touchBtns = {};
  if (isTouchDevice()) {
    root.classList.add('bsx-touch');
    touch = el(root, 'div', 'bsx-touchui');
    // joystick (left)
    const base = el(touch, 'div', 'bsx-joy bsh-pop'), knob = el(base, 'div', 'bsx-knob');
    let jid = -1, jx = 0, jy = 0, lastSend = 0, moving = false;
    const R = 55;
    const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px,${dy}px)`; };
    const jmove = (e) => {
      const r = base.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / R);
      dx = dx / d * k * R; dy = dy / d * k * R; jx = dx / R; jy = dy / R; setKnob(dx, dy);
    };
    on(base, 'pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); jid = e.pointerId; try { base.setPointerCapture(jid); } catch (_) { /* ignore */ } jmove(e); moving = true; });
    on(base, 'pointermove', (e) => { if (e.pointerId === jid) { e.preventDefault(); jmove(e); } });
    const jend = (e) => { if (e.pointerId !== jid) return; jid = -1; jx = jy = 0; setKnob(0, 0); if (moving) { moving = false; if (input) input.stop(); else send('order', { type: 'stop' }); } };
    on(base, 'pointerup', jend); on(base, 'pointercancel', jend);
    touchTick = (now) => { // called from update() at the HUD rate; sends a move order toward the stick direction
      if (jid < 0 || !meRef || (Math.abs(jx) < 0.12 && Math.abs(jy) < 0.12) || now - lastSend < 100) return;
      lastSend = now; const p = (input && input.pred) || meRef, m = Math.hypot(jx, jy), tx = p.x + (jx / m) * 500, ty = p.y + (jy / m) * 500;
      if (input) input.minimapTap(tx, ty); else send('order', { type: 'move', x: tx, y: ty });
    };
    // touch chat button (bottom-left above joystick)
    const chatBtn = el(touch, 'button', 'bsh-btn bsx-chatbtn bsh-pop', '💬');
    chatBtn.title = 'Open Chat';
    press(chatBtn, () => {
      AudioManager.uiClick?.();
      try { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true })); } catch (_) { /* ignore */ }
    });
    // action buttons (right)
    const pad = el(touch, 'div', 'bsx-pad');
    const atk = el(pad, 'button', 'bsx-abtn bsx-atk bsh-pop', '⚔'); press(atk, () => { if (input) input.attackNearest(); });
    atk.dataset.k = 'atk';
    for (const k of ['q', 'w', 'e', 'r']) {
      const b = el(pad, 'button', `bsx-abtn bsx-s bsx-${k} bsh-pop`, `<span class="ic">${k.toUpperCase()}</span><small class="kl">${k.toUpperCase()}</small><i></i>`);
      b.dataset.k = k;
      press(b, () => { if (input) input.cast(k, true); });
      const rel = (e) => { e.preventDefault(); e.stopPropagation(); input?.release?.(k); };
      on(b, 'pointerup', rel);
      on(b, 'pointercancel', rel);
      touchBtns[k] = { btn: b, ic: b.querySelector('.ic'), cd: b.querySelector('i'), chg: null };
    }
    for (const k of ['d', 'f']) {
      const b = el(pad, 'button', `bsx-abtn bsx-sp bsx-${k} bsh-pop`, `<span class="ic">${k.toUpperCase()}</span><b class="chg" hidden></b><i></i>`);
      b.dataset.k = k;
      press(b, () => { if (input) input.spell(k, true); });
      touchBtns[k] = { btn: b, ic: b.querySelector('.ic'), cd: b.querySelector('i'), chg: b.querySelector('.chg') };
    }
  }

  function update(me, ctx) {
    if (disposed) return;
    meRef = me || null; nowMs = ctx.now || Date.now(); srvNowMs = ctx.srvNow || nowMs; canShopNow = !!ctx.canShop;
    if (opts.camera) setText(bCam, getCamLocked() ? '🔒 CAM (Y)' : '🔓 FREE (Y)');
    setText(bMute, AudioManager.isMuted() ? '🔇' : '🔊');
    if (touchTick) touchTick(nowMs);
    if (sbx && sim) {
      setText(sbxBtns.cd, `0s CD: ${sim.noCd ? 'ON' : 'OFF'}`); setText(sbxBtns.mana, `NO MANA: ${sim.noMana ? 'ON' : 'OFF'}`); setText(sbxBtns.god, `NO DMG: ${sim.godMode ? 'ON' : 'OFF'}`);
    }
    if (me && touchBtns.q) {
      const sr = srvNowMs;
      const def = CHAMPIONS[me.champ];
      const stance = parseKitTags(me.buffs || '').stance;
      for (const k of ['q', 'w', 'e', 'r']) {
        const tb = touchBtns[k], sk = def && resolveSkill(def, k, stance);
        if (sk && sk.icon) setText(tb.ic, sk.icon);
        const left = Math.max(0, (me['cd' + k.toUpperCase()] || 0) - sr);
        setText(tb.cd, left > 0 ? (left >= 1000 ? String(Math.ceil(left / 1000)) : (left / 1000).toFixed(1)) : '');
        const dim = left > 0 || (k === 'r' && (me.level || 1) < ULT_UNLOCK_LEVEL) || !!me.dead;
        if (tb.btn._d !== dim) { tb.btn._d = dim; tb.btn.classList.toggle('cd', dim); }
      }
      for (const k of ['d', 'f']) {
        const tb = touchBtns[k], K = k.toUpperCase(), sp = SPELLS[me['spell' + K]];
        setText(tb.ic, (sp && sp.icon) || K);
        const left = Math.max(0, (me['cd' + K] || 0) - sr);
        setText(tb.cd, left > 0 ? (left >= 1000 ? String(Math.ceil(left / 1000)) : (left / 1000).toFixed(1)) : '');
        const hasCh = !!(sp && sp.maxCharges > 1), chg = hasCh ? (me['charges' + K] == null ? sp.maxCharges : me['charges' + K]) : 0;
        if (tb.chg.hidden === hasCh) tb.chg.hidden = !hasCh;
        if (hasCh) setText(tb.chg, String(chg));
        const dim = left > 0 || !!me.dead || !sp;
        if (tb.btn._d !== dim) { tb.btn._d = dim; tb.btn.classList.toggle('cd', dim); }
      }
    }
    if (kind) render();
  }

  return {
    update, toggleShop, toggleInfo, openSwap, togglePause, pauseOpen, closePanels: close, panelOpen: () => !panel.hidden || !!(shopApi && shopApi.isOpen()),
    dispose() { disposed = true; cleanup.forEach((f) => { try { f(); } catch (_) { /* ignore */ } }); for (const n of [acts, sbx, panel, pauseEl, touch]) if (n) n.remove(); },
  };
}

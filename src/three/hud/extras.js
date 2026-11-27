// hud/extras.js - the HUD parts that the Phaser MobaHud/TeamModeScene had but the first 3D HUD lacked:
//   * sandbox toolbar (SWAP CHAMP, 0s CD, NO MANA, NO DMG, +LV, +5000g, +30s, +DUMMY, CLEAR)   [offline sandbox only]
//   * action buttons: SHOP (P), INFO (C), SCORE (TAB), RECALL (B)
//   * shop panel (items from shared/moba/items.js, buy / sell through source.send, same place rules as the sim)
//   * info panel (champion + skill descriptions, C)
//   * touch controls (virtual joystick left, Q/W/E/R/D/F + attack right) on touch devices only
// createExtras({root, source, opts, hudApi}) -> {update(me, ctx), toggleShop(), toggleInfo(), closePanels(), panelOpen(), dispose()}
// Everything is dirty-checked (cached text / signatures) and only written from update() (~10 Hz).
import { CHAMPIONS, CHAMPION_IDS } from '../../../shared/moba/champions.js';
import { ITEMS, SHOP_ORDER, recipePlan, buyBlocker } from '../../../shared/moba/items.js';
import { sellValue, INVENTORY_SLOTS } from '../../../shared/moba/rules.js';

const el = (parent, tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const setText = (e, v) => { if (e._v !== v) { e._v = v; e.textContent = v; } };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toArr = (a) => (!a ? [] : Array.isArray(a) ? a : Array.from(a));
export const isTouchDevice = () => {
  try { if (/[?&]touch=1/.test(location.search)) return true; return !!(('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.matchMedia && matchMedia('(pointer: coarse)').matches)); } catch (_) { return false; }
};

export function createExtras({ root, source, opts = {}, hudApi = {} }) {
  const input = opts.input || null;
  const sim = source.sim || null, sandbox = !!(sim && sim.sandbox);
  let disposed = false, meRef = null, canShopNow = false, nowMs = 0;
  const send = (type, msg) => { try { source.send(type, msg || {}); } catch (_) { /* closed */ } };
  const toast = (m, c) => { try { hudApi.toast && hudApi.toast(m, c); } catch (_) { /* ignore */ } };
  const cleanup = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); cleanup.push(() => t.removeEventListener(ev, fn, o)); };
  const press = (btn, fn) => on(btn, 'pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(e); });

  // ---------- action buttons (above the bottom panel, right side) ----------
  const acts = el(root, 'div', 'bsx-acts bsh-pop');
  const bShop = el(acts, 'button', 'bsh-btn', '🛒 SHOP (P)'), bInfo = el(acts, 'button', 'bsh-btn', 'ℹ INFO (C)');
  const bScore = el(acts, 'button', 'bsh-btn', '📊 TAB'), bRecall = el(acts, 'button', 'bsh-btn bsx-recall', '🏠 RECALL (B)');
  bShop.onclick = () => toggleShop(); bInfo.onclick = () => toggleInfo();
  bScore.onclick = () => hudApi.setScoreboard && hudApi.setScoreboard(!(hudApi.scoreboardOpen && hudApi.scoreboardOpen()));
  bRecall.onclick = () => { if (input) input.recall(); else send('recall', {}); };

  // ---------- sandbox toolbar ----------
  let sbx = null; const sbxBtns = {};
  if (sandbox) {
    sbx = el(root, 'div', 'bsx-sbx bsh-pop');
    el(sbx, 'div', 'bsx-sbx-t', 'PRACTICE MODE · sandbox');
    const row = el(sbx, 'div', 'bsx-sbx-row');
    const mk = (k, label, color, fn) => { const b = el(row, 'button', 'bsh-btn bsx-sb', label); b.style.setProperty('--c', color); b.onclick = () => { fn(); }; sbxBtns[k] = b; return b; };
    mk('swap', 'SWAP CHAMP', '#ffb347', () => openSwap());
    mk('cd', '0s CD: ON', '#39c2ff', () => { send('setNoCd', { enabled: !sim.noCd }); });
    mk('mana', 'NO MANA: ON', '#7ec8ff', () => { send('setNoMana', { enabled: !sim.noMana }); });
    mk('god', 'NO DMG: ON', '#7ed957', () => { send('setGodMode', { enabled: !sim.godMode }); });
    mk('lv', '+LV', '#ffd23f', () => { const m = meRef; if (m && source.debug) { source.debug('level', (m.level || 1) + 1); try { if (sim && sim._checkAugmentOffer) sim._checkAugmentOffer(m); } catch (_) { /* sandbox only: debug level skips the natural augment trigger */ } } });
    mk('gold', '+5000g', '#ffd23f', () => { if (source.debug) source.debug('gold', 5000); });
    mk('wave', '+30s', '#b084ff', () => { for (let i = 0; i < 300; i++) sim.update(100); }); // fast-forward the sim 30 s (same as the Phaser sandbox)
    mk('dummy', '+DUMMY', '#ff8a8a', () => send('spawnDummy', {}));
    mk('clear', 'CLEAR', '#ff5e5e', () => send('clearDummies', {}));
  }

  // ---------- panels (shop / info / champ swap) ----------
  const panel = el(root, 'div', 'bsx-panel bsh-pop'); panel.hidden = true;
  const pHead = el(panel, 'div', 'bsx-ph'), pTitle = el(pHead, 'div', 'bsx-pt'), pClose = el(pHead, 'button', 'bsh-btn', '✕ close');
  const pBody = el(panel, 'div', 'bsx-pb');
  let kind = ''; // '' | 'info' | 'swap'  (shop lives in shop.js, reached through hudApi.shop)
  const shopApi = hudApi.shop || null;
  let shopSig = '', infoSig = '';
  const close = () => { kind = ''; panel.hidden = true; if (shopApi) shopApi.close(); };
  pClose.onclick = close;
  const open = (k) => { if (shopApi) shopApi.close(); kind = k; panel.hidden = false; shopSig = infoSig = ''; render(); };
  function toggleShop() { if (!shopApi) return; if (shopApi.isOpen()) { close(); } else { kind = ''; panel.hidden = true; shopApi.open(); } }
  function toggleInfo() { if (kind === 'info') close(); else open('info'); }
  function openSwap() { if (kind === 'swap') close(); else open('swap'); }
  // event delegation for buy / sell / swap
  on(pBody, 'click', (e) => {
    const t = e.target.closest('[data-act]'); if (!t || t.disabled || t.classList.contains('off')) return;
    const act = t.dataset.act, v = t.dataset.v;
    if (act === 'buy') { if (!canShopNow) { toast('🛒 Shop only in your break room (or while dead)', '#ff8a8a'); return; } send('buy', { item: v }); shopSig = ''; }
    else if (act === 'sell') { if (!canShopNow) { toast('🛒 Sell in your break room (or while dead)', '#ff8a8a'); return; } send('sell', { slot: Number(v) }); shopSig = ''; }
    else if (act === 'swap') { send('switchChamp', { champ: v }); close(); }
  });

  function render() {
    const me = meRef;
    if (kind === 'swap') {
      setText(pTitle, 'SWAP CHAMPION (PRACTICE)');
      const sig = 'swap' + (me && me.champ); if (sig === infoSig) return; infoSig = sig;
      pBody.innerHTML = '<div class="bsx-grid">' + CHAMPION_IDS.map((id) => { const d = CHAMPIONS[id]; return `<button class="bsh-btn bsx-ch${me && me.champ === id ? ' on' : ''}" data-act="swap" data-v="${id}">${d.emoji} ${esc(d.name)}<small>${esc(d.role)}</small></button>`; }).join('') + '</div>';
    } else if (kind === 'info') {
      const def = me && CHAMPIONS[me.champ]; setText(pTitle, def ? `${def.emoji} ${def.name} ${def.title}` : 'INFO');
      const sig = 'info' + (me && me.champ); if (sig === infoSig) return; infoSig = sig;
      if (!def) { pBody.textContent = 'No champion.'; return; }
      pBody.innerHTML = `<div class="bsx-blurb">${esc(def.role)} · ${esc(def.blurb || '')}</div>` + ['q', 'w', 'e', 'r'].map((k) => { const s = def.skills[k]; return s ? `<div class="bsx-sk"><b>${k.toUpperCase()}</b> ${esc(s.icon || '')} <b>${esc(s.name)}</b> <i>${s.mana || 0} mana · ${s.cd || 0}s</i><div>${esc(s.desc || '')}</div></div>` : ''; }).join('')
        + '<div class="bsx-blurb">Keys: Q W E R skills · D F spells · right-click move · SPACE attack · B recall · P shop · C info · TAB scoreboard</div>';
    } else if (kind === 'shop') {
      const items = me ? toArr(me.items) : [], gold = me ? me.gold | 0 : 0;
      setText(pTitle, `🛒 SHOP · 🪙 ${gold}` + (canShopNow ? '' : '  (go to your fountain / break room to buy)'));
      const rows = [];
      for (const id of SHOP_ORDER) {
        const it = ITEMS[id]; if (!it) continue;
        const plan = recipePlan(items, id), cost = it.consumable ? it.cost : plan.cost, why = buyBlocker(items, id);
        rows.push({ id, it, plan, cost, why, off: !canShopNow || gold < cost || !!why });
      }
      // rebuild only when something visible changed (gold ticks every frame; the DOM must stay stable under the finger)
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
    // action buttons (right)
    const pad = el(touch, 'div', 'bsx-pad');
    const atk = el(pad, 'button', 'bsx-abtn bsx-atk bsh-pop', '⚔'); press(atk, () => { if (input) input.attackNearest(); });
    atk.dataset.k = 'atk';
    for (const k of ['q', 'w', 'e', 'r']) {
      const b = el(pad, 'button', `bsx-abtn bsx-s bsx-${k} bsh-pop`, `<span>${k.toUpperCase()}</span><i></i>`); b.dataset.k = k;
      press(b, () => { if (input) input.cast(k, true); }); touchBtns[k] = b;
    }
    for (const k of ['d', 'f']) {
      const b = el(pad, 'button', `bsx-abtn bsx-sp bsx-${k} bsh-pop`, `<span>${k.toUpperCase()}</span><i></i>`); b.dataset.k = k;
      press(b, () => { if (input) input.spell(k, true); }); touchBtns[k] = b;
    }
  }

  function update(me, ctx) {
    if (disposed) return;
    meRef = me || null; nowMs = ctx.now || Date.now(); canShopNow = !!ctx.canShop;
    if (touchTick) touchTick(nowMs);
    if (sbx && sim) {
      setText(sbxBtns.cd, `0s CD: ${sim.noCd ? 'ON' : 'OFF'}`); setText(sbxBtns.mana, `NO MANA: ${sim.noMana ? 'ON' : 'OFF'}`); setText(sbxBtns.god, `NO DMG: ${sim.godMode ? 'ON' : 'OFF'}`);
    }
    if (me && touchBtns.q) {
      const sr = ctx.srvNow || nowMs;
      for (const k of ['q', 'w', 'e', 'r', 'd', 'f']) {
        const left = Math.max(0, (me['cd' + k.toUpperCase()] || 0) - sr), cd = touchBtns[k].lastChild;
        setText(cd, left > 0 ? (left >= 1000 ? String(Math.ceil(left / 1000)) : (left / 1000).toFixed(1)) : '');
        const dim = left > 0 || (k === 'r' && (me.level || 1) < 6) || !!me.dead;
        if (touchBtns[k]._d !== dim) { touchBtns[k]._d = dim; touchBtns[k].classList.toggle('cd', dim); }
      }
    }
    if (kind) render();
  }

  return {
    update, toggleShop, toggleInfo, openSwap, closePanels: close, panelOpen: () => !panel.hidden || !!(shopApi && shopApi.isOpen()),
    dispose() { disposed = true; cleanup.forEach((f) => { try { f(); } catch (_) { /* ignore */ } }); for (const n of [acts, sbx, panel, touch]) if (n) n.remove(); },
  };
}

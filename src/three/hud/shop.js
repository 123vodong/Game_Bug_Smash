// hud/shop.js - DOM shop (C8): grid + detail card (stats / recipe tree / passive) + hover tooltip + inventory with refund prices,
// recommended build per champion, can-afford states, 10 s undo, touch (tap = select, tap again / BUY button = buy).
// createShop({root, source, toast, tooltip}) -> {update(me, ctx), toggle(), open(), close(), isOpen(), dispose()}
// Buying goes through source.send('buy',{item}) / source.send('sell',{slot}); the sim/server validate (same rules as shared/moba/items.js).
import { CHAMPIONS } from '../../../shared/moba/champions.js';
import { ITEMS, SHOP_ORDER, recipePlan, buyBlocker } from '../../../shared/moba/items.js';
import { sellValue, INVENTORY_SLOTS, SELL_UNDO_MS, SELL_REFUND_PCT } from '../../../shared/moba/rules.js';
import { AudioManager } from '../../core/AudioManager.js';
import { itemCardHtml, esc, TIER_CSS, buildsInto } from './tooltip.js';

const el = (parent, tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const toArr = (a) => (!a ? [] : Array.isArray(a) ? a : Array.from(a));
const SECTIONS = [['consumable', 'SNACKS'], ['basic', 'BASIC GEAR'], ['core', 'CORE (combine components, cheaper)']];
const UNDO_MS = SELL_UNDO_MS > 0 ? SELL_UNDO_MS : 10000;

export function createShop({ root, source, toast = () => {}, tooltip = null }) {
  const panel = el(root, 'div', 'bsx-panel bsx-shop bsh-pop'); panel.hidden = true;
  const head = el(panel, 'div', 'bsx-ph'), title = el(head, 'div', 'bsx-pt'), undoBtn = el(head, 'button', 'bsh-btn bsx-undo', '↶ UNDO'), closeBtn = el(head, 'button', 'bsh-btn', '✕ close');
  undoBtn.hidden = true;
  const body = el(panel, 'div', 'bsx-shop-b'), left = el(body, 'div', 'bsx-shop-l'), right = el(body, 'div', 'bsx-shop-r');
  const detail = el(right, 'div', 'bsx-detail'), actRow = el(right, 'div', 'bsx-act'), invWrap = el(right, 'div', 'bsx-inv'), recWrap = el(right, 'div', 'bsx-rec');
  const nudge = el(root, 'button', 'bsx-nudge bsh-pop'); nudge.hidden = true;
  let open = false, meRef = null, ctxRef = {}, selItem = '', selSlot = -1, sig = '', lastUndoSlot = -1, disposed = false;
  let prevItems = null, prevChamp = '', lastPointerType = 'mouse', nudgeItem = '', nudgeTxt = '';
  const localBoughtAt = [0, 0, 0, 0, 0, 0];
  const cleanup = [];
  const on = (t, ev, fn) => { t.addEventListener(ev, fn); cleanup.push(() => t.removeEventListener(ev, fn)); };
  const send = (type, msg) => { try { source.send(type, msg || {}); } catch (_) { /* closed */ } };

  const inv = () => (meRef ? toArr(meRef.items) : []);
  const boughtAt = (i) => {
    if (localBoughtAt[i]) return localBoughtAt[i];
    const b = meRef && (meRef._boughtAt || meRef.boughtAt);
    return b && b[i] ? b[i] : 0;
  };
  const undoable = (i) => { const b = boughtAt(i); return !!b && Date.now() - b <= UNDO_MS; };
  const refund = (i) => {
    const it = ITEMS[inv()[i]]; if (!it) return 0;
    const b = boughtAt(i), now = Date.now();
    if (SELL_UNDO_MS > 0) return sellValue(it.cost, b, now);
    return b && now - b <= UNDO_MS ? it.cost : sellValue(it.cost, b, now);
  };
  const rowInfo = (id) => { const it = ITEMS[id], items = inv(), gold = meRef ? meRef.gold | 0 : 0, plan = recipePlan(items, id), cost = it.consumable ? it.cost : plan.cost, why = buyBlocker(items, id); return { it, cost, why, afford: gold >= cost, canShop: !!ctxRef.canShop, gold, plan }; };
  const reason = (r) => (!r.canShop ? '🛒 Walk back to your fountain (or die) to shop' : r.why ? `🛒 ${r.why[0].toUpperCase() + r.why.slice(1)}` : r.gold < r.cost ? `🛒 Need ${r.cost - r.gold} more gold. Ship more bugs.` : '');

  function syncBoughtAt(me) {
    if (!me) { prevItems = null; prevChamp = ''; localBoughtAt.fill(0); return; }
    const cur = toArr(me.items);
    if (prevItems === null || (me.champ && me.champ !== prevChamp)) {
      prevChamp = me.champ || '';
      prevItems = cur.slice();
      localBoughtAt.fill(0);
      return;
    }
    const now = Date.now();
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const id = cur[i] || '';
      if (!id) localBoughtAt[i] = 0;
      else if (id !== (prevItems[i] || '')) localBoughtAt[i] = now;
    }
    prevItems = cur.slice();
  }

  function buy(id) {
    const r = rowInfo(id), why = reason(r);
    if (why) { AudioManager.failure?.(); toast(why, '#ff8a8a'); return; }
    AudioManager.reward?.();
    send('buy', { item: id }); sig = '';
  }
  function sell(slot) {
    if (!ctxRef.canShop) { AudioManager.failure?.(); toast('🛒 Sell in your break room (or while dead)', '#ff8a8a'); return; }
    if (!inv()[slot]) return;
    AudioManager.uiClick?.();
    send('sell', { slot }); selSlot = -1; sig = '';
  }

  // ---------- events (delegation; DOM is rebuilt only when the signature changes) ----------
  on(panel, 'pointerdown', (e) => { lastPointerType = e.pointerType || 'mouse'; });
  on(panel, 'click', (e) => {
    const pickNode = e.target.closest('[data-pick]');
    if (pickNode) {
      const pid = pickNode.dataset.pick;
      if (pid && ITEMS[pid]) { AudioManager.uiClick?.(); selItem = pid; selSlot = -1; sig = ''; render(); }
      return;
    }
    const t = e.target.closest('[data-act]'); if (!t) return;
    const act = t.dataset.act, v = t.dataset.v;
    const pt = e.pointerType || lastPointerType;
    const touch = pt === 'touch' || pt === 'pen';
    if (act === 'close') { AudioManager.uiClick?.(); close(); return; }
    if (act === 'item') {
      selItem = v; selSlot = -1;
      if (touch) { buy(v); } else { AudioManager.uiClick?.(); sig = ''; }
      render();
    } else if (act === 'buy') { selItem = v; selSlot = -1; buy(v); render(); }
    else if (act === 'pick') { AudioManager.uiClick?.(); selItem = v; selSlot = -1; sig = ''; render(); }
    else if (act === 'slot') { AudioManager.uiClick?.(); selSlot = selSlot === Number(v) ? -1 : Number(v); sig = ''; render(); }
    else if (act === 'sell') sell(Number(v));
    else if (act === 'undo') { if (lastUndoSlot >= 0) sell(lastUndoSlot); }
  });
  on(panel, 'dblclick', (e) => {
    const t = e.target.closest('[data-act="item"]'); if (!t) return;
    const v = t.dataset.v; if (!v) return;
    selItem = v; selSlot = -1; buy(v); render();
  });
  on(panel, 'contextmenu', (e) => { const t = e.target.closest('[data-act="slot"]'); if (t) { e.preventDefault(); sell(Number(t.dataset.v)); } });
  on(panel, 'pointerover', (e) => {
    if (!tooltip || e.pointerType !== 'mouse') return;
    const t = e.target.closest('[data-act="item"],[data-act="buy"],[data-act="pick"],[data-pick],[data-act="slot"]'); if (!t) { tooltip.hide(); return; }
    const id = t.dataset.pick || (t.dataset.act === 'slot' ? inv()[Number(t.dataset.v)] : t.dataset.v);
    if (id && ITEMS[id]) tooltip.show(itemCardHtml(id, inv(), 0), t); else tooltip.hide();
  });
  on(panel, 'pointerleave', () => tooltip && tooltip.hide());
  closeBtn.onclick = () => { AudioManager.uiClick?.(); close(); };
  undoBtn.onclick = () => { if (lastUndoSlot >= 0) sell(lastUndoSlot); };
  nudge.onclick = () => { AudioManager.uiClick?.(); if (nudgeItem) selItem = nudgeItem; openIt(); };

  function recommended(me) { const d = me && CHAMPIONS[me.champ]; return d && Array.isArray(d.build) ? d.build.filter((id) => ITEMS[id]) : []; }
  const owns = (id) => inv().includes(id);

  function wireRecipeClicks(showId) {
    const it = ITEMS[showId]; if (!it) return;
    const recs = detail.querySelectorAll('.ic-rec');
    let ri = 0;
    if (it.recipe && recs[ri]) {
      const nodes = recs[ri].querySelectorAll('.rc:not(.fin)');
      it.recipe.forEach((cid, idx) => {
        const n = nodes[idx];
        if (n && ITEMS[cid]) { n.dataset.pick = cid; n.classList.add('rc-click'); }
      });
      ri++;
    }
    const into = !it.consumable && it.tier !== 'core' ? buildsInto(showId) : [];
    if (into.length && recs[ri]) {
      const nodes = recs[ri].querySelectorAll('.rc');
      into.forEach((oid, idx) => {
        const n = nodes[idx];
        if (n && ITEMS[oid]) { n.dataset.pick = oid; n.classList.add('rc-click'); }
      });
    }
  }

  function updateNudge() {
    if (open || !ctxRef.canShop || !meRef) { if (!nudge.hidden) nudge.hidden = true; return; }
    const items = inv(), gold = meRef.gold | 0;
    const rec = recommended(meRef);
    const nextRec = rec.find((id) => {
      if (owns(id) || buyBlocker(items, id)) return false;
      const it = ITEMS[id], cost = it.consumable ? it.cost : recipePlan(items, id).cost;
      return gold >= cost;
    }) || '';
    if (!nextRec) { if (!nudge.hidden) nudge.hidden = true; nudgeItem = ''; return; }
    const it = ITEMS[nextRec];
    const txt = `🛒 Buy ${it.emoji} ${it.name} (P)`;
    nudgeItem = nextRec;
    if (txt !== nudgeTxt) { nudgeTxt = txt; nudge.textContent = txt; }
    if (nudge.hidden) nudge.hidden = false;
  }

  function render() {
    if (!open) return;
    const me = meRef, items = inv(), gold = me ? me.gold | 0 : 0, canShop = !!ctxRef.canShop, now = Date.now();
    // undo candidate: most recent purchase inside the undo window
    let u = -1, ub = 0; items.forEach((id, i) => { const b = id ? boughtAt(i) : 0; if (b && now - b <= UNDO_MS && b > ub) { ub = b; u = i; } });
    lastUndoSlot = u;
    const rec = recommended(me), nextRec = rec.find((id) => !owns(id) && !buyBlocker(items, id)) || '';
    if (!selItem && selSlot < 0) selItem = nextRec || 'mouse';
    const def = me && CHAMPIONS[me.champ];
    const rows = SHOP_ORDER.filter((id) => ITEMS[id]).map((id) => rowInfo(id));
    const s = [items.join(','), gold >= 0 ? rows.map((r) => (r.afford ? 1 : 0) + (r.why ? 'x' : '') + r.cost).join('') : '', canShop ? 1 : 0, selItem, selSlot, u, u >= 0 ? Math.floor((now - ub) / 1000) : '', me && me.champ].join('|');
    title.textContent = `🛒 SHOP · 🪙 ${gold}${canShop ? '' : '  · away from base'}`;
    if (undoBtn.hidden === (u >= 0)) undoBtn.hidden = u < 0;
    if (u >= 0) undoBtn.textContent = `↶ UNDO ${ITEMS[items[u]].emoji} +${refund(u)}g (${Math.max(0, Math.ceil((UNDO_MS - (now - ub)) / 1000))}s)`;
    if (s === sig) return; sig = s;
    // grid
    let h = '';
    for (const [tier, label] of SECTIONS) {
      h += `<div class="bsx-sec" style="color:${TIER_CSS[tier]}">${label}</div><div class="bsx-grid">`;
      for (const r of rows) {
        if (r.it.tier !== tier) continue;
        const state = !canShop ? 'away' : r.why ? 'blocked' : r.afford ? 'ok' : 'poor', off = state !== 'ok';
        const isRec = rec.includes(r.it.id), got = isRec && owns(r.it.id);
        h += `<button class="bsh-btn bsx-it ${state}${off ? ' off' : ''}${selItem === r.it.id && selSlot < 0 ? ' sel' : ''}${isRec ? ' rec' : ''}" data-act="item" data-v="${r.it.id}"><span class="e">${r.it.emoji}</span><span class="n">${esc(r.it.name)}</span><span class="c">🪙 ${r.cost}${r.plan.discount ? ' <s>' + r.it.cost + '</s>' : ''}</span>${isRec ? `<i class="star">${got ? '✓' : '⭐'}</i>` : ''}</button>`;
      }
      h += '</div>';
    }
    left.innerHTML = h;
    // detail + action
    const showId = selSlot >= 0 ? items[selSlot] : selItem;
    detail.innerHTML = showId ? itemCardHtml(showId, items, gold) : '<div class="ic-d">Pick an item. Your wallet is watching.</div>';
    if (showId) wireRecipeClicks(showId);
    const pct = Math.round((SELL_REFUND_PCT || 0.75) * 100);
    if (selSlot >= 0 && items[selSlot]) {
      actRow.innerHTML = `<button class="bsh-btn bsx-sellb" data-act="sell" data-v="${selSlot}">SELL +${refund(selSlot)}g${undoable(selSlot) ? ' (UNDO, full refund)' : ` (${pct}%)`}</button>`;
    } else if (showId) {
      const r = rowInfo(showId), why = reason(r);
      actRow.innerHTML = `<button class="bsh-btn bsx-buyb${why ? ' off' : ''}" data-act="buy" data-v="${showId}">BUY 🪙 ${r.cost}</button>${why ? `<div class="bsx-why">${esc(why.replace('🛒 ', ''))}</div>` : '<div class="bsx-hint">Click to inspect · Double-click or BUY to purchase</div>'}`;
    } else actRow.innerHTML = '';
    // inventory
    let ih = `<div class="lab">INVENTORY ${items.filter(Boolean).length}/${INVENTORY_SLOTS} <small>(click = select, right-click = sell)</small></div><div class="row">`;
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const it = ITEMS[items[i]];
      ih += it ? `<button class="bsx-slot on${selSlot === i ? ' sel' : ''}${undoable(i) ? ' undo' : ''}" data-act="slot" data-v="${i}">${it.emoji}<small>${refund(i)}g</small></button>` : '<div class="bsx-slot"></div>';
    }
    invWrap.innerHTML = ih + '</div>';
    // recommended
    recWrap.innerHTML = rec.length ? `<div class="lab">⭐ RECOMMENDED · ${def ? def.emoji + ' ' + esc(def.name) : ''}</div><div class="row">${rec.map((id) => `<button class="bsx-slot rcm${owns(id) ? ' have' : ''}${id === nextRec ? ' next' : ''}" data-act="pick" data-v="${id}" title="${esc(ITEMS[id].name)}">${ITEMS[id].emoji}<small>${owns(id) ? '✓' : recipePlan(items, id).cost}</small></button>`).join('')}</div>` + (nextRec ? `<div class="bsx-why">next: ${ITEMS[nextRec].emoji} ${esc(ITEMS[nextRec].name)}</div>` : '') : '';
  }

  function close() { if (!open) return; open = false; panel.hidden = true; if (tooltip) tooltip.hide(); updateNudge(); }
  function openIt() { open = true; panel.hidden = false; nudge.hidden = true; sig = ''; selSlot = -1; render(); }
  return {
    update(me, ctx) { if (disposed) return; meRef = me || null; ctxRef = ctx || {}; syncBoughtAt(meRef); if (open) render(); else updateNudge(); },
    toggle() { if (open) close(); else openIt(); }, open: openIt, close, isOpen: () => open,
    dispose() { disposed = true; cleanup.forEach((f) => { try { f(); } catch (_) { /* ignore */ } }); panel.remove(); nudge.remove(); },
  };
}

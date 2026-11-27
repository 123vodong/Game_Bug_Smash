// hud/augments.js - Code Augment picker (levels 5/10/15): 3 cards, per-card reroll, rarity colours, synergy hints, keys 1-3 / R.
// createAugments({root, source, toast}) -> {update(me, ctx), isOpen(), dispose()}
// Offer comes from me.augmentOffer (offline sim, object) or me.augmentOfferJson (server schema). Messages: 'augmentPick' {id}, 'augmentReroll' {slot} | {}.
// Like the 2D game the picker opens by itself while you are dead or at your fountain (never mid-fight); otherwise a pulsing "AUGMENT READY" pill opens it.
// While open isOpen() is true; hud.js exposes it through hud.blocked() / scoreboardOpen() so Input.isBlocked() pauses orders and hotkeys.
import { AUGMENTS, RARITY_COLOR, AUGMENT_SYNERGIES } from '../../../shared/moba/augments.js';
import { esc } from './tooltip.js';

const el = (parent, tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const hex = (n) => '#' + ((n >>> 0) & 0xffffff).toString(16).padStart(6, '0');
const QUIPS = { 5: 'Merge request #1: approved without review.', 10: 'Senior engineer unlocked. Meetings +3.', 15: 'Principal level. Still debugging prod on Friday.' };

export function createAugments({ root, source, toast = () => {} }) {
  const pill = el(root, 'button', 'bsx-augpill bsh-pop', ''); pill.hidden = true;
  const modal = el(root, 'div', 'bsx-aug bsh-pop'); modal.hidden = true;
  let offer = null, owned = [], shown = false, dismissed = false, sig = '', lastJson = '', lastCsv = '', ownedCache = [], disposed = false, lastLevel = 0;
  const send = (type, msg) => { try { source.send(type, msg || {}); } catch (_) { /* closed */ } };
  const pick = (id) => { if (!offer || !offer.choices.includes(id)) return; send('augmentPick', { id }); toast(`⚡ Augment installed: ${AUGMENTS[id] ? AUGMENTS[id].name : id}`, '#ffd23f', 2000); close(true); };
  const reroll = (slot) => { if (!offer) return; send('augmentReroll', Number.isInteger(slot) ? { slot } : {}); sig = ''; };
  function close(done) { shown = false; modal.hidden = true; sig = ''; if (done) { offer = null; dismissed = false; } else dismissed = true; }

  modal.addEventListener('click', (e) => {
    const t = e.target.closest('[data-a]'); if (!t) return;
    if (t.dataset.a === 'pick') pick(t.dataset.v); else if (t.dataset.a === 'reroll') reroll(t.dataset.v === '' ? undefined : Number(t.dataset.v)); else if (t.dataset.a === 'later') close(false);
  });
  pill.addEventListener('click', () => { if (offer) { shown = true; dismissed = false; sig = ''; render(); } });
  const onKey = (e) => {
    if (!shown || !offer || e.repeat) return;
    const i = e.code === 'Digit1' ? 0 : e.code === 'Digit2' ? 1 : e.code === 'Digit3' ? 2 : -1;
    if (i >= 0 && offer.choices[i]) { e.preventDefault(); e.stopPropagation(); pick(offer.choices[i]); }
    else if (e.code === 'KeyR' && !Array.isArray(offer.slotRerolls) && (offer.rerolls || 0) > 0) { e.preventDefault(); e.stopPropagation(); reroll(); }
    else if (e.code === 'Escape') { e.stopPropagation(); close(false); }
  };
  window.addEventListener('keydown', onKey, true);

  function render() {
    if (!shown || !offer) return;
    const s = `${offer.level}:${offer.rerolls}:${(offer.slotRerolls || []).join(',')}:${offer.choices.join(',')}:${owned.join(',')}`;
    if (s === sig) return; sig = s;
    const ownedSet = new Set(owned);
    const cards = offer.choices.map((id, i) => {
      const a = AUGMENTS[id]; if (!a) return '';
      const col = hex(RARITY_COLOR[a.rarity] || 0x39c2ff);
      const syn = AUGMENT_SYNERGIES.find((sy) => sy.requires.includes(id) && sy.requires.some((r) => r !== id && ownedSet.has(r)));
      const canRoll = Array.isArray(offer.slotRerolls) ? (offer.slotRerolls[i] || 0) > 0 : false;
      return `<div class="aug-card ${a.rarity}" style="--rc:${col}"><div class="rar">${esc(a.rarity.toUpperCase())} · ${esc(a.group.toUpperCase())}</div><button class="aug-pick" data-a="pick" data-v="${id}"><div class="ico">${a.icon || '⚡'}</div><div class="nm">${esc(a.name)}</div><div class="ds">${esc(a.desc)}</div>${syn ? `<div class="syn">✨ Synergy: ${esc(syn.name)}</div>` : ''}<div class="ph">PICK [${i + 1}]</div></button>${Array.isArray(offer.slotRerolls) ? `<button class="bsh-btn aug-rr${canRoll ? '' : ' off'}" ${canRoll ? `data-a="reroll" data-v="${i}"` : 'disabled'}>${canRoll ? '🎲 REROLL' : 'rerolled'}</button>` : ''}</div>`;
    }).join('');
    const global = !Array.isArray(offer.slotRerolls) && (offer.rerolls || 0) > 0 ? `<button class="bsh-btn aug-rr big" data-a="reroll" data-v="">🎲 REROLL ALL [R] · ${offer.rerolls} left</button>` : '';
    const ownedRow = owned.length ? `<div class="aug-own">INSTALLED: ${owned.map((id) => AUGMENTS[id] ? `<span title="${esc(AUGMENTS[id].name)}">${AUGMENTS[id].icon || '⚡'}</span>` : '').join('')}</div>` : '';
    modal.innerHTML = `<div class="aug-box"><div class="aug-t">⚡ CODE AUGMENT · Lv ${offer.level}</div><div class="aug-s">${esc(QUIPS[offer.level] || 'Choose one patch. No rollbacks.')} The match is paused for you (keys 1-3).</div><div class="aug-cards">${cards}</div><div class="aug-f">${global}<button class="bsh-btn aug-later" data-a="later">decide later</button></div>${ownedRow}</div>`;
  }

  function parseOffer(me) {
    if (me.augmentOffer && Array.isArray(me.augmentOffer.choices)) return me.augmentOffer;
    const raw = me.augmentOfferJson || ''; if (raw !== lastJson) { lastJson = raw; ownedCache._o = null; if (raw) { try { ownedCache._o = JSON.parse(raw); } catch (_) { /* bad json */ } } }
    return ownedCache._o && Array.isArray(ownedCache._o.choices) ? ownedCache._o : null;
  }
  function parseOwned(me) {
    if (Array.isArray(me.augments)) return me.augments;
    const csv = me.augmentsCsv || ''; if (csv !== lastCsv) { lastCsv = csv; ownedCache._a = csv ? csv.split(',') : []; } return ownedCache._a || [];
  }
  return {
    update(me, ctx) {
      if (disposed) return;
      const o = me ? parseOffer(me) : null;
      if (!o || !o.choices.length) { offer = null; if (shown) close(true); pill.hidden = true; dismissed = false; lastLevel = 0; return; }
      if (offer && offer.level !== o.level) { dismissed = false; }
      offer = o; owned = parseOwned(me);
      if (lastLevel !== o.level) { lastLevel = o.level; toast(`⚡ Code Augment ready (Lv ${o.level})`, '#ffd23f', 2200); }
      const safe = !!(me.dead || (ctx && ctx.canShop));
      if (!shown && safe && !dismissed && ctx && ctx.phase === 'playing') { shown = true; sig = ''; }
      if (shown) { modal.hidden = false; render(); }
      const showPill = !shown; if (pill.hidden === showPill) pill.hidden = !showPill;
      if (showPill) { const t = `⚡ AUGMENT READY (Lv ${o.level}) - click`; if (pill._t !== t) { pill._t = t; pill.textContent = t; } }
    },
    isOpen: () => shown,
    dispose() { disposed = true; window.removeEventListener('keydown', onKey, true); pill.remove(); modal.remove(); },
  };
}

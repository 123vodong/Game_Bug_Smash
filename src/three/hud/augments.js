// hud/augments.js - Code Augment picker (levels 5/10/15): 3 cards, per-card reroll, rarity colours, synergy hints, keys 1-3 / R.
// createAugments({root, source, toast}) -> {update(me, ctx), isOpen(), dispose()}
// Offer comes from me.augmentOffer (offline sim, object) or me.augmentOfferJson (server schema). Messages: 'augmentPick' {id}, 'augmentReroll' {slot} | {}.
// Like the 2D game the picker ONLY opens while you are dead (never at fountain / mid-fight); once opened it stays open until you pick, unless a newer level offer replaces it while alive.
// While open isOpen() is true; hud.js exposes it through hud.blocked() / scoreboardOpen() so Input.isBlocked() pauses orders and hotkeys.
import { AUGMENTS, RARITY_COLOR, AUGMENT_SYNERGIES } from '../../../shared/moba/augments.js';
import { t, tText, getLang, onLangChange } from '../../core/I18n.js';
import { esc } from './tooltip.js';

const el = (parent, tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const hex = (n) => '#' + ((n >>> 0) & 0xffffff).toString(16).padStart(6, '0');
const QUIPS = { 5: 'Merge request #1: approved without review.', 10: 'Senior engineer unlocked. Meetings +3.', 15: 'Principal level. Still debugging prod on Friday.' };

export function createAugments({ root, source, toast = () => {} }) {
  const pill = el(root, 'div', 'bsx-augpill bsh-pop', '');
  pill.style.pointerEvents = 'none';
  pill.style.opacity = '0.85';
  pill.hidden = true;
  const modal = el(root, 'div', 'bsx-aug bsh-pop'); modal.hidden = true;
  let offer = null, owned = [], shown = false, canShow = false, shownLv = 0, sig = '', lastJson = '', lastCsv = '', ownedCache = [], disposed = false, lastLevel = 0;
  const send = (type, msg) => { try { source.send(type, msg || {}); } catch (_) { /* closed */ } };
  const pick = (id) => { if (!offer || !offer.choices.includes(id)) return; send('augmentPick', { id }); toast(`⚡ Augment installed: ${AUGMENTS[id] ? AUGMENTS[id].name : id}`, '#ffd23f', 2000); close(true); };
  const reroll = (slot) => { if (!offer) return; send('augmentReroll', Number.isInteger(slot) ? { slot } : {}); sig = ''; };
  function close(done) { shown = false; modal.hidden = true; sig = ''; if (done) { offer = null; canShow = false; shownLv = 0; } }

  modal.addEventListener('click', (e) => {
    const t = e.target.closest('[data-a]'); if (!t) return;
    if (t.dataset.a === 'pick') pick(t.dataset.v); else if (t.dataset.a === 'reroll') reroll(t.dataset.v === '' ? undefined : Number(t.dataset.v));
  });
  const onKey = (e) => {
    if (!shown || !offer || e.repeat) return;
    const i = e.code === 'Digit1' ? 0 : e.code === 'Digit2' ? 1 : e.code === 'Digit3' ? 2 : -1;
    if (i >= 0 && offer.choices[i]) { e.preventDefault(); e.stopPropagation(); pick(offer.choices[i]); }
    else if (e.code === 'KeyR' && !Array.isArray(offer.slotRerolls) && (offer.rerolls || 0) > 0) { e.preventDefault(); e.stopPropagation(); reroll(); }
  };
  window.addEventListener('keydown', onKey, true);
  const offLang = onLangChange(() => { sig = ''; if (shown) render(); });

  function render() {
    if (!shown || !offer) return;
    const s = `${getLang()}:${offer.level}:${offer.rerolls}:${(offer.slotRerolls || []).join(',')}:${offer.choices.join(',')}:${owned.join(',')}`;
    if (s === sig) return; sig = s;
    const ownedSet = new Set(owned);
    const cards = offer.choices.map((id, i) => {
      const a = AUGMENTS[id]; if (!a) return '';
      const col = hex(RARITY_COLOR[a.rarity] || 0x39c2ff);
      const syn = AUGMENT_SYNERGIES.find((sy) => sy.requires.includes(id) && sy.requires.some((r) => r !== id && ownedSet.has(r)));
      const canRoll = Array.isArray(offer.slotRerolls) ? (offer.slotRerolls[i] || 0) > 0 : false;
      const desc = tText(`aug.${id}`, a.desc || '');
      return `<div class="aug-card ${a.rarity}" style="--rc:${col}"><div class="rar">${esc(a.rarity.toUpperCase())} · ${esc(a.group.toUpperCase())}</div><button class="aug-pick" data-a="pick" data-v="${id}"><div class="ico">${a.icon || '⚡'}</div><div class="nm">${esc(a.name)}</div><div class="ds">${esc(desc)}</div>${syn ? `<div class="syn">✨ ${esc(t('aug.synergy', { name: syn.name }))}</div>` : ''}<div class="ph">${esc(t('aug.pickHint', { n: i + 1 }))}</div></button>${Array.isArray(offer.slotRerolls) ? `<button class="bsh-btn aug-rr${canRoll ? '' : ' off'}" ${canRoll ? `data-a="reroll" data-v="${i}"` : 'disabled'}>${canRoll ? `🎲 ${esc(t('aug.reroll'))}` : esc(t('aug.rerolled'))}</button>` : ''}</div>`;
    }).join('');
    const global = !Array.isArray(offer.slotRerolls) && (offer.rerolls || 0) > 0 ? `<button class="bsh-btn aug-rr big" data-a="reroll" data-v="">🎲 ${esc(t('aug.reroll'))} [R] · ${offer.rerolls}</button>` : '';
    const ownedRow = owned.length ? `<div class="aug-own">INSTALLED: ${owned.map((id) => AUGMENTS[id] ? `<span title="${esc(AUGMENTS[id].name)}">${AUGMENTS[id].icon || '⚡'}</span>` : '').join('')}</div>` : '';
    modal.innerHTML = `<div class="aug-box"><div class="aug-t">⚡ ${esc(t('aug.title', { lv: offer.level }))}</div><div class="aug-s">${esc(t('aug.sub'))} (${esc(QUIPS[offer.level] || '')})</div><div class="aug-cards">${cards}</div>${global ? `<div class="aug-f">${global}</div>` : ''}${ownedRow}</div>`;
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
      if (!o || !o.choices.length) { offer = null; canShow = false; shownLv = 0; lastLevel = 0; if (shown) close(true); pill.hidden = true; return; }
      offer = o; owned = parseOwned(me);
      if (lastLevel !== o.level) { lastLevel = o.level; toast(`⚡ ${t('aug.readyOnDeath', { lv: o.level })}`, '#ffd23f', 2200); }
      if (shownLv && shownLv !== o.level && !me.dead) { canShow = false; shownLv = 0; }
      const safe = !!me.dead;
      if (safe && ctx && ctx.phase === 'playing') { canShow = true; shownLv = o.level; }
      if (canShow) {
        if (!shown) { shown = true; sig = ''; }
        modal.hidden = false; render();
      } else if (shown) {
        close(false);
      }
      const showPill = !shown; if (pill.hidden === showPill) pill.hidden = !showPill;
      if (showPill) { const txt = `⚡ ${t('aug.readyOnDeath', { lv: o.level })}`; if (pill._t !== txt) { pill._t = txt; pill.textContent = txt; } }
    },
    isOpen: () => shown,
    dispose() { disposed = true; offLang(); window.removeEventListener('keydown', onKey, true); pill.remove(); modal.remove(); },
  };
}

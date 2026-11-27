// hud/tooltip.js - item card (stats, recipe tree, cost, passive) shared by the shop detail pane and the hover tooltip.
// itemCardHtml(id, items, gold, boughtAt, now) -> html string;  createTooltip(root) -> {show(html, anchorEl), hide(), dispose()}
import { ITEMS, SHOP_ORDER, recipePlan } from '../../../shared/moba/items.js';

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const TIER_CSS = { consumable: '#7ed957', basic: '#7ec8ff', core: '#ffd23f' };
const STAT_LABEL = { ad: ['AD', 0], ap: ['AP', 0], hp: ['HP', 0], mana: ['Mana', 0], manaRegen: ['Mana/s', 1], armor: ['Armor', 0], armorPen: ['Armor Pen', 2], mr: ['MR', 0], mrPen: ['MR Pen', 2], ms: ['Move Speed', 0], as: ['Atk Speed', 2], haste: ['CDR', 2], lifesteal: ['Lifesteal', 2], apPct: ['Total AP', 2] };
const fmtStat = (k, v) => { const [lab, mode] = STAT_LABEL[k] || [k, 0]; return `<span class="st"><b>${mode === 2 ? '+' + Math.round(v * 100) + '%' : '+' + v}</b> ${lab}</span>`; };
export const buildsInto = (id) => SHOP_ORDER.filter((o) => ITEMS[o] && ITEMS[o].recipe && ITEMS[o].recipe.includes(id)).slice(0, 5);

/** Recipe tree (components with owned marks) + builds-into row. */
function recipeHtml(it, items) {
  if (!it.recipe) return '';
  const pool = items.slice(), comp = it.recipe.map((c) => { const ci = ITEMS[c], k = pool.indexOf(c), have = k >= 0; if (have) pool[k] = null; return `<span class="rc${have ? ' have' : ''}" title="${esc(ci && ci.name)} (${ci ? ci.cost : 0}g)">${ci ? ci.emoji : '?'}<i>${have ? '✓' : (ci ? ci.cost : '')}</i></span>`; }).join('<u>+</u>');
  return `<div class="ic-rec"><span class="lab">RECIPE</span>${comp}<u>=</u><span class="rc fin">${it.emoji}</span></div>`;
}

export function itemCardHtml(id, items, gold, boughtAt, now) {
  const it = ITEMS[id]; if (!it) return '';
  const plan = recipePlan(items, id), cost = it.consumable ? it.cost : plan.cost;
  const stats = it.stats ? Object.entries(it.stats).map(([k, v]) => fmtStat(k, v)).join('') : '';
  const eff = it.effect ? `<div class="ic-pas">Use: heal ${it.effect.heal || 0} HP, ${it.effect.mana || 0} mana over ${(it.effect.ms || 0) / 1000}s</div>` : '';
  const pas = it.passive ? `<div class="ic-pas">${it.active ? '⚡ ' : '✦ '}${esc(it.passive.desc)}</div>` : '';
  const into = !it.consumable && it.tier !== 'core' ? buildsInto(id) : [];
  const intoHtml = into.length ? `<div class="ic-rec"><span class="lab">BUILDS INTO</span>${into.map((o) => `<span class="rc" title="${esc(ITEMS[o].name)}">${ITEMS[o].emoji}</span>`).join('')}</div>` : '';
  const tier = it.tier === 'consumable' ? 'CONSUMABLE' : it.tier === 'basic' ? 'BASIC' : 'CORE' + (it.group ? ' · ' + it.group.toUpperCase() : '');
  return `<div class="ic-h"><span class="e">${it.emoji}</span><div><div class="ic-n">${esc(it.name)}</div><div class="ic-t" style="color:${TIER_CSS[it.tier] || '#fff'}">${tier}</div></div><div class="ic-c">🪙 ${cost}${plan.discount ? ` <s>${it.cost}</s>` : ''}</div></div>`
    + (stats ? `<div class="ic-st">${stats}</div>` : '') + eff + pas + recipeHtml(it, items) + intoHtml
    + `<div class="ic-d">${esc(it.desc || '')}</div>`;
}

export function createTooltip(root) {
  const tip = document.createElement('div'); tip.className = 'bsx-tip'; tip.hidden = true; root.appendChild(tip);
  let sig = '';
  return {
    show(html, anchor) {
      if (html !== sig) { sig = html; tip.innerHTML = html; }
      tip.hidden = false;
      const r = anchor.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, W = window.innerWidth, H = window.innerHeight;
      let x = r.right + 8; if (x + w > W - 6) x = Math.max(6, r.left - w - 8);
      let y = Math.min(Math.max(6, r.top), H - h - 6);
      tip.style.left = `${Math.round(x)}px`; tip.style.top = `${Math.round(y)}px`;
    },
    hide() { if (!tip.hidden) tip.hidden = true; },
    dispose() { tip.remove(); },
  };
}

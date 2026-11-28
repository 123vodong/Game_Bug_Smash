// hud/tooltip.js - rich tooltip cards (items, skills, spells, champion) shared by the shop detail pane and HUD hover tooltips.
// itemCardHtml(id, items, gold, boughtAt, now) | skillCardHtml(def, slot, stance, me) | spellCardHtml(sp, slot, lv) | champCardHtml(def, me)
// createTooltip(root) -> {show(html, anchorEl, opts), hide(), dispose()}
import { ITEMS, SHOP_ORDER, recipePlan } from '../../../shared/moba/items.js';
import { resolveSkill, nextStance } from '../../../shared/moba/champions.js';
import { ULT_UNLOCK_LEVEL } from '../../../shared/moba/rules.js';
import { spellCooldownMs } from '../../../shared/moba/spells.js';

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const TIER_CSS = { consumable: '#7ed957', basic: '#7ec8ff', core: '#ffd23f' };
const STAT_LABEL = { ad: ['AD', 0], ap: ['AP', 0], hp: ['HP', 0], mana: ['Mana', 0], manaRegen: ['Mana/s', 1], armor: ['Armor', 0], armorPen: ['Armor Pen', 2], mr: ['MR', 0], mrPen: ['MR Pen', 2], ms: ['Move Speed', 0], as: ['Atk Speed', 2], haste: ['CDR', 2], lifesteal: ['Lifesteal', 2], apPct: ['Total AP', 2] };
const fmtStat = (k, v) => { const [lab, mode] = STAT_LABEL[k] || [k, 0]; return `<span class="st"><b>${mode === 2 ? '+' + Math.round(v * 100) + '%' : '+' + v}</b> ${lab}</span>`; };
export const buildsInto = (id) => SHOP_ORDER.filter((o) => ITEMS[o] && ITEMS[o].recipe && ITEMS[o].recipe.includes(id)).slice(0, 5);
const sec = (ms) => `${+(Math.max(0, ms || 0) / 1000).toFixed(1)}s`;
const pctMul = (a) => `x${+a[0].toFixed(2)} to x${+a[1].toFixed(2)}`;

function amountText(a) {
  if (!a) return '';
  const parts = [`${a.base || 0}${a.perLevel ? ` (+${a.perLevel}/lv)` : ''}`];
  for (const [k, lbl] of [['ad', 'AD'], ['ap', 'AP'], ['hp', 'max HP']]) if (a[k]) parts.push(`+${Math.round(a[k] * 100)}% ${lbl}`);
  return parts.join(' ');
}

function kitMechanics(sk, L) {
  const hd = sk.hold;
  if (sk.input === 'hold' && hd) {
    L.push(`Hold ${sec(hd.minMs)} to ${sec(hd.maxMs)} to charge (you move ${Math.round((hd.moveSlow || 0) * 100)}% slower), release to fire. Tap = quick cast at ${Math.round((hd.quick || 0) * 100)}% charge.`);
    const sc = Object.entries(hd.scale || {}).map(([k, v]) => `${k} ${pctMul(v)}`).join(', ');
    if (sc) L.push(`Charge scales: ${sc}`);
  }
  if (sk.input === 'drag') L.push('Drag: press at the first point, release at the second.');
  if (sk.targets === 'ally') L.push('Targets an ally (hover one, or the nearest is chosen).');
  const sp = sk.spend;
  if (sp) {
    const per = Object.entries(sp.per || {}).map(([k, v]) => (v && typeof v === 'object' ? `${k} per unit` : `${k} +${v}`)).join(', ');
    L.push(`Spends ${sp.min}-${sp.max} ${sp.res}${per ? `: ${per} each` : ''}`);
  }
  const ob = sk.obj;
  if (ob) {
    L.push(`Places a ${ob.pin ? `${ob.pin} pin` : ob.kind}${ob.ms ? ` for ${sec(ob.ms)}` : ''}${ob.maxActive ? ` (max ${ob.maxActive})` : ''}${ob.hp ? ', has HP' : ''}`);
    if (ob.kind === 'wall') L.push(`Wall length up to ${ob.len}px, hits every ${sec(ob.rehitMs)}`);
    if (ob.kind === 'portal') L.push(`Second press within ${sec(sk.recast?.ms)} places the exit; ${sec(ob.gapMs)} between uses`);
    if (ob.kind === 'turret') L.push(`Fires every ${sec(ob.atkMs)} (range ${ob.range}); heat +${ob.heat?.perShot} per shot, explodes at ${ob.heat?.max}`);
    if (ob.kind === 'beacon') L.push(`Allies recall to it in ${sec(ob.allyRecallMs)}`);
    if (ob.trigger) L.push(`Triggers on the first ${ob.trigger === 'ally' ? 'ally' : 'enemy'} that enters`);
  }
  if (sk.rewind) L.push(`Rewinds ${sk.rewind.allies ? `you and allies within ${sk.rewind.radius}px` : 'you'} by ${sec(sk.rewind.lookbackMs)}${sk.rewind.hp ? ' (position and HP)' : ' (position)'}${sk.rewind.cleanse ? ', cleanses' : ''}`);
  if (sk.tether) L.push(`Heal link for ${sec(sk.tether.durationMs)}: ${Math.round((sk.tether.selfPct || 0) * 100)}% back to you, you move ${Math.round((sk.tether.casterSlow || 0) * 100)}% slower${sk.tether.recastEnds ? '. Press again to cut it' : ''}`);
  if (sk.link) L.push(`Shares ${Math.round(sk.link.sharePct * 100)}% of damage between two allies for ${sec(sk.link.ms)} (breaks past ${sk.link.breakRange}px)`);
  if (sk.type === 'stance' && sk.cycle) L.push(`Cycles: ${sk.cycle.join(' > ')}`);
  if (sk.shadow) L.push(sk.shadow.mode === 'swap' ? 'Swaps places with your shadow' : `Places a shadow clone for ${sec(sk.shadow.ms)}`);
  if (sk.alsoAtShadow) L.push('Also strikes around your shadow');
  if (sk.shadowAt === 'origin') L.push('Leaves a shadow where you stood');
  if (sk.summon) L.push(`Sends a drone for ${sec(sk.summon.ms)} (vision ${sk.summon.vision}px, marks ${sk.summon.mark?.tag})`);
  if (sk.echo) L.push(`Stores your next ${['q', 'w', 'e', 'r'].filter((x) => !(sk.echo.exclude || []).includes(x)).join('/').toUpperCase()}: a copy fires ${sec(sk.echo.delayMs)} later at ${Math.round(sk.echo.mulPct * 100)}% power`);
  if (sk.timebox) L.push(`${sec(sk.timebox.ms)} timebox: ${Math.round(sk.timebox.refundPct * 100)}% of the cooldown of skills cast inside is refunded`);
  if (sk.reload) L.push(`Reload ${sec(sk.reload.ms)}. Press again in the gold window for an instant reload; a miss jams (+${sec(sk.reload.jamMs)})`);
  if (sk.pickup) L.push('Loads a package; the farther you travel, the bigger the tip');
  if (sk.deliver) L.push('Needs a package: delivers to an ally or allied tower; reward scales with the tip');
  if (sk.serve) L.push('Outcome depends on your mix; fewer ingredients = weaker serve');
  if (sk.addMix) L.push(`Adds ${{ S: 'SHOT', M: 'MILK', G: 'SYRUP' }[sk.addMix] || sk.addMix} to your mix`);
  if (sk.resolve) L.push('Detonates every pin you have placed');
  if (sk.objcmd) L.push(`Command for all your turrets: ${sk.objcmd.cmd}`);
}

export function skillMechanics(sk, def) {
  const L = [];
  const petName = def?.pet?.name || 'your pet';
  if (sk.dmg) L.push(`⚔ ${amountText(sk.dmg)} dmg${sk.type === 'zone' ? ' per tick' : ''}`);
  if (sk.heal) L.push(`💚 heal ${amountText(sk.heal)}${sk.type === 'zone' ? ' per tick to allies inside' : ''}`);
  if (sk.shield) L.push(`🛡 shield ${amountText(sk.shield)}`);
  if (sk.type === 'zone') L.push(`🟦 Zone lasts ${sec(sk.duration)} · ticks every ${sec(sk.tickMs)}`);
  if ((sk.count | 0) > 1) L.push(`📱 Fan of ${sk.count} across ${sk.spread || 0}° · each enemy hit once`);
  if (sk.boomerang) L.push(`🪃 Boomerang: returns to you${sk.returnTrueDmg ? ' dealing True Damage' : ''}`);
  if (sk.chain) L.push(`⚡ Chains up to ${sk.chain.bounces || 2} nearby enemies`);
  if (sk.pull) L.push('🪝 Hook: pulls enemy toward you');
  if (sk.pullIn) L.push('🌀 Pulls enemies inward toward center');
  if (sk.trap) L.push(`💣 Trap: arms briefly, lasts ${sec(sk.trap.durationMs || 25000)} (max ${sk.trap.maxActive || 3})`);
  if (sk.behindTarget) L.push('🗡 Blinks directly behind target');
  if (sk.invisMs) L.push(`👻 Stealth for ${sec(sk.invisMs)}`);
  if (sk.spellShieldMs) L.push(`🛡️ Spell Shield blocks next enemy skill (${sec(sk.spellShieldMs)})`);
  if (sk.killReset) L.push('♻ Resets cooldown on champion kill');
  if (sk.healOnHit) L.push(`💚 Heals ${amountText(sk.healOnHit)} per champion hit`);
  if (sk.cdRefundOnHit) L.push(`⏩ Refunds ${sec(sk.cdRefundOnHit.ms || 1000)} CD on champion hit`);
  if (sk.pierce) L.push('➡ pierces every enemy in the line');
  if (sk.champOnly) L.push('🎯 flies past minions');
  if (sk.knockback) L.push(`💨 Knockback ${sk.knockback.dist}px${sk.wallStun ? ` · into a WALL → stun ${sec(sk.wallStun.ms)}` : ''}`);
  if (sk.at === 'pet') L.push(`🤖 Centered on ${petName}`);
  if (sk.buff?.petPct) L.push(`🤖 ${petName}: +${Math.round(sk.buff.petPct * 100)}% dmg & attack speed`);
  if (sk.stun) L.push(`💫 Stun ${sec(sk.stun.ms)}`);
  if (sk.root) L.push(`🌿 Root ${sec(sk.root.ms)}`);
  if (sk.slow) L.push(`🐌 Slow ${Math.round(sk.slow.pct * 100)}% for ${sec(sk.slow.ms)}`);
  if (sk.silence) L.push(`🔇 Silence ${sec(sk.silence.ms)}`);
  if (sk.charm) L.push(`💘 Charm ${sec(sk.charm.ms)}`);
  if (sk.fear) L.push(`😱 Fear ${sec(sk.fear.ms)}`);
  if (sk.taunt) L.push(`🤬 Taunt ${sec(sk.taunt.ms)}`);
  if (sk.blind) L.push(`🙈 Blind ${sec(sk.blind.ms)}`);
  if (sk.disarm) L.push(`🚫 Disarm ${sec(sk.disarm.ms)}`);
  if (sk.suppress) L.push(`⛓ Suppress ${sec(sk.suppress.ms)}`);
  if (sk.airborne) L.push(`🌪 Airborne ${sec(sk.airborne.ms)}`);
  if (sk.untarget) L.push(`👻 Untargetable ${sec(sk.untarget.ms)}`);
  if (sk.reviveGuard) L.push(`🪽 Revive guard ${sec(sk.reviveGuard.ms)} (${Math.round((sk.reviveGuard.hpPct || 0.3) * 100)}% HP)`);
  if (sk.execute) L.push(`☠ +${Math.round(sk.execute.missingHpPct * 100)}% of missing HP`);
  if (sk.delay) L.push(`⏳ lands after ${sec(sk.delay)}`);
  if (sk.duration && sk.type !== 'zone') L.push(`⏱ lasts ${sec(sk.duration)}`);
  if (sk.recast) L.push(sk.recast.mode === 'back' ? `🔁 Press again within ${sec(sk.recast.ms)}: return to start (free)` : `🔁 Press again within ${sec(sk.recast.ms)}: cast again (free)`);
  if (sk.type === 'swap') L.push('🔄 Swap places with an allied champion');
  if (sk.trail) L.push(`🌊 Leaves a ${sec(sk.trail.duration)} zone behind`);
  if (sk.mark) L.push(`🏷 Applies ${sk.mark.tag} mark (max ${sk.mark.max || 1}, ${sec(sk.mark.ms)})`);
  if (sk.detonate) L.push(`💥 Consumes ${sk.detonate.tag} marks: +${Math.round(sk.detonate.pctPerStack * 100)}% true dmg per stack`);
  if (sk.stasis) L.push(`⏳ Stasis ${sec(sk.stasis.ms)}: invulnerable, cannot act`);
  if (sk.phase) L.push('🧱 Crosses thin walls');
  else if (sk.type === 'dash') L.push('🧱 stops at walls');
  if (sk.type === 'blink') L.push('🧱 lands beside walls');
  kitMechanics(sk, L);
  return L;
}

export function skillCardHtml(def, slot, stance, me) {
  const sk = resolveSkill(def, slot, stance);
  if (!sk) return '';
  const isVariant = !!(def?.skills && sk !== def.skills[slot] && stance);
  const range = sk.at === 'pet' ? ` · radius ${sk.radius}` : sk.range ? ` · range ${sk.range}${sk.radius ? ` · radius ${sk.radius}` : ''}` : (sk.radius ? ` · radius ${sk.radius}` : '');
  const nextSt = sk.type === 'stance' && stance ? ` · Next: ${nextStance(sk, stance)}` : '';
  const mech = skillMechanics(sk, def);
  const ultBadge = slot === 'r' ? `<span class="sk-badge">Lv ${ULT_UNLOCK_LEVEL}+</span>` : '';
  const stBadge = isVariant ? `<span class="sk-badge st">${esc(stance)}</span>` : '';
  return `<div class="ic-h"><span class="e">${esc(sk.icon || '✨')}</span><div><div class="ic-n">${esc(sk.name || '')} <span class="sk-badge">[${esc(slot.toUpperCase())}]</span>${ultBadge}${stBadge}</div><div class="sk-meta">${sk.mana || 0} mana · ${sk.cd || 0}s CD${esc(range)}${esc(nextSt)}</div></div></div>`
    + (sk.desc ? `<div class="sk-desc">${esc(sk.desc)}</div>` : '')
    + (mech.length ? `<div class="sk-mech">${mech.map((m) => `<div>${esc(m)}</div>`).join('')}</div>` : '');
}

export function spellCardHtml(sp, slot, lv) {
  if (!sp) return '';
  const cdSec = +(spellCooldownMs(sp, lv || 1) / 1000).toFixed(1);
  const chg = sp.maxCharges > 1 ? ` · ${sp.maxCharges} charges (${sp.castCd || 10}s cast CD)` : '';
  const rng = sp.range ? ` · range ${sp.range}` : (sp.radius ? ` · radius ${sp.radius}` : '');
  return `<div class="ic-h"><span class="e">${esc(sp.icon || '✨')}</span><div><div class="ic-n">${esc(sp.name || sp.id || '')} <span class="sk-badge">[${esc(slot.toUpperCase())}]</span></div><div class="sk-meta">${cdSec}s CD${esc(chg)}${esc(rng)}</div></div></div>`
    + (sp.desc ? `<div class="sk-desc">${esc(sp.desc)}</div>` : '');
}

export function champCardHtml(def, me) {
  if (!def) return '';
  const kitParts = [];
  if (def.kit?.res) kitParts.push(`Resource: ${def.kit.res.key} (max ${def.kit.res.max})`);
  if (def.kit?.stance) kitParts.push(`Stances: ${(def.kit.stance.names || []).join(' / ')}`);
  if (def.kit?.mix) kitParts.push(`Mix kit (max ${def.kit.mix.max})`);
  if (def.kit?.pkg) kitParts.push('Package delivery tip kit');
  if (def.pet) kitParts.push(`Pet: ${def.pet.emoji || '🤖'} ${def.pet.name}`);
  const b = def.base || {};
  const hp = me ? `${Math.round(me.hp || 0)}/${Math.round(me.maxHp || 0)}` : String(b.hp || 0);
  const ad = me ? (me.ad | 0) : (b.ad | 0);
  const ap = me ? (me.ap | 0) : (b.ap | 0);
  const ar = me ? (me.armor | 0) : (b.armor | 0);
  const as = Number(me ? (me.as || 0) : (b.as || 0)).toFixed(2);
  const rg = me ? (me.range | 0) : (b.range | 0);
  const ms = me ? (me.ms | 0) : (b.ms | 0);
  const stats = [
    ['HP', hp], ['AD', ad], ['AP', ap], ['Armor', ar], ['AS', as], ['Range', rg], ['MS', ms],
  ].map(([k, v]) => `<span class="st"><b>${esc(v)}</b> ${k}</span>`).join('');
  return `<div class="ic-h"><span class="e">${esc(def.emoji || '🐞')}</span><div><div class="ic-n">${esc(def.name || '')} ${def.title ? `<span class="sk-badge st">${esc(def.title)}</span>` : ''}</div><div class="sk-meta">${esc(def.role || '')}</div></div></div>`
    + (def.blurb ? `<div class="sk-desc">${esc(def.blurb)}</div>` : '')
    + (kitParts.length ? `<div class="sk-mech">${kitParts.map((p) => `<div>✦ ${esc(p)}</div>`).join('')}</div>` : '')
    + `<div class="ic-st">${stats}</div>`;
}

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
    show(html, anchor, opts = {}) {
      if (!html || !anchor) return;
      if (html !== sig) { sig = html; tip.innerHTML = html; }
      tip.style.borderColor = opts.color || '#ffd23f';
      tip.hidden = false;
      const r = anchor.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, W = window.innerWidth, H = window.innerHeight;
      let x, y;
      if (opts.above || r.top > H * 0.55) {
        x = Math.max(6, Math.min(W - w - 6, r.left + r.width / 2 - w / 2));
        y = Math.max(6, r.top - h - 10);
      } else {
        x = r.right + 8; if (x + w > W - 6) x = Math.max(6, r.left - w - 8);
        y = Math.min(Math.max(6, r.top), H - h - 6);
      }
      tip.style.left = `${Math.round(x)}px`; tip.style.top = `${Math.round(y)}px`;
    },
    hide() { if (!tip.hidden) tip.hidden = true; },
    dispose() { tip.remove(); },
  };
}

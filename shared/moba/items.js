// shared/moba/items.js — Team Mode shop (office gear). Shared by server + client.
//
// Buying happens inside your fountain (or while dead). 6 inventory slots, no
// recipes (buy directly). Pass 2: items can be SOLD (rules.sellValue: 70 %, or 100 % within
// 10 s of buying). Stat fields (all additive):
//   ad, ap, hp, mana, armor, ms (flat move speed), as (attack-speed %),
//   haste (cooldown reduction, capped by rules.MAX_HASTE_PCT), lifesteal (fraction
//   of attack + skill damage healed), apPct (× total AP)
// `group`: only one item per group may be owned (e.g. boots).
// `consumable`: used on purchase (no slot), with an `effect`.

export const ITEMS = {
  // ── consumable ──
  coffee: {
    id: 'coffee', name: 'Coffee', emoji: '☕', cost: 50, tier: 'consumable', consumable: true,
    effect: { heal: 160, mana: 70, ms: 6000 },
    desc: 'Restores 160 HP and 70 mana over 6 s. Fuel for one more deploy.',
  },

  // ── basic ──
  mouse:      { id: 'mouse',      name: 'Gaming Mouse',      emoji: '🖱️', cost: 350, tier: 'basic', stats: { ad: 12 },        desc: '+12 attack damage. 16,000 DPI of pure precision.' },
  tech_book:  { id: 'tech_book',  name: 'Tech Book',         emoji: '📘', cost: 400, tier: 'basic', stats: { ap: 25 },        desc: '+25 ability power. Chapter 1 is finally read.' },
  chair:      { id: 'chair',      name: 'Ergonomic Chair',   emoji: '🪑', cost: 400, tier: 'basic', stats: { hp: 160 },       desc: '+160 health. Your back says thank you.' },
  hoodie:     { id: 'hoodie',     name: 'Company Hoodie',    emoji: '🧥', cost: 350, tier: 'basic', stats: { armor: 16 },     desc: '+16 armor. Free swag, surprisingly durable.' },
  power_bank: { id: 'power_bank', name: 'Power Bank',        emoji: '🔋', cost: 350, tier: 'basic', stats: { mana: 220, manaRegen: 2.5 },     desc: '+220 mana, +2.5 mana/s. Never die at 1%.' },
  pomodoro:   { id: 'pomodoro',   name: 'Pomodoro Timer',    emoji: '⏱️', cost: 450, tier: 'basic', stats: { haste: 0.1 },    desc: '10% cooldown reduction. 25 minutes of pure focus.' },
  sneakers:   { id: 'sneakers',   name: 'Office Sneakers',   emoji: '👟', cost: 300, tier: 'basic', group: 'boots', stats: { ms: 25 }, desc: '+25 move speed. Boots — only one pair.' },
  sticky_notes: { id: 'sticky_notes', name: 'Sticky Notes',    emoji: '🗒️', cost: 350, tier: 'basic', stats: { ap: 12, mana: 120, manaRegen: 2.0 }, desc: '+12 AP, +120 mana, +2.0 mana/s. Every idea, stuck somewhere.' },
  // ── 2026-11-25 ──
  caffeine:   { id: 'caffeine',   name: 'Caffeine Pills',    emoji: '💊', cost: 350, tier: 'basic', stats: { as: 0.12 },      desc: '+12% attack speed. Your heart rate is now a feature.' },
  red_pen:    { id: 'red_pen',    name: 'Red Pen',           emoji: '🖊️', cost: 450, tier: 'basic', stats: { ad: 6, lifesteal: 0.06 }, desc: '+6 attack damage, 6% lifesteal. Every correction heals your ego a little.' },

  // ── core ──
  rgb_keyboard:  { id: 'rgb_keyboard',  name: 'RGB Mechanical Keyboard', emoji: '⌨️', cost: 1300, tier: 'core', recipe: ['mouse', 'caffeine'], stats: { ad: 35, as: 0.15 },             desc: '+35 attack damage, +15% attack speed. Clicky = faster.' },
  ultrawide:     { id: 'ultrawide',     name: 'Ultrawide Monitor',       emoji: '🖥️', cost: 2700, tier: 'core', recipe: ['mouse', 'caffeine'], stats: { ad: 65, as: 0.25 }, passive: { id: 'crit', desc: 'Precision: 20% chance for basic attacks to deal 160% damage.' }, desc: '+65 AD, +25% AS. Passive: 20% crit chance (160% dmg).' },
  gauntlet:      { id: 'gauntlet',      name: 'Git Blame Gauntlet',      emoji: '🩸', cost: 1500, tier: 'core', recipe: ['mouse', 'red_pen'], stats: { ad: 30, lifesteal: 0.12 }, passive: { id: 'execute', desc: 'Executioner: +15% bonus damage to enemies below 35% HP.' }, desc: '+30 AD, 12% lifesteal. Passive: +15% dmg vs low HP.' },
  headphones:    { id: 'headphones',    name: 'Noise-Cancelling Headphones', emoji: '🎧', cost: 1400, tier: 'core', recipe: ['tech_book', 'pomodoro'], stats: { ap: 60, haste: 0.1 },        desc: '+60 ability power, 10% cooldown reduction. Meetings can\'t reach you.' },
  stackoverflow: { id: 'stackoverflow', name: 'Stack Overflow Premium',  emoji: '🧠', cost: 2800, tier: 'core', recipe: ['tech_book', 'sticky_notes'], stats: { ap: 110, apPct: 0.25 }, passive: { id: 'overclock', desc: 'Overclock: +12% skill damage against targets above 50% HP.' }, desc: '+110 AP, +25% total AP. Passive: +12% skill dmg vs >50% HP.' },
  standing_desk: { id: 'standing_desk', name: 'Standing Desk',           emoji: '🛡️', cost: 1300, tier: 'core', recipe: ['chair', 'hoodie'], stats: { hp: 220, armor: 30, mr: 20 },          desc: '+220 HP, +30 armor, +20 MR. Posture is a defensive stat.' },
  server_rack:   { id: 'server_rack',   name: 'Server Rack Armor',       emoji: '🗄️', cost: 2600, tier: 'core', recipe: ['chair', 'hoodie'], stats: { hp: 400, armor: 45, mr: 30 }, passive: { id: 'fortress', desc: 'Fortress: Reduces all incoming damage by 10%.' }, desc: '+400 HP, +45 armor, +30 MR. Passive: -10% damage taken.' },
  rubber_duck:   { id: 'rubber_duck',   name: 'Rubber Duck',             emoji: '🦆', cost: 1100, tier: 'core', recipe: ['power_bank', 'pomodoro'], stats: { haste: 0.2, mana: 250, manaRegen: 4.5 },       desc: '20% CDR, +250 mana, +4.5 mana/s. Explains your bugs back to you.' },
  jetpack:       { id: 'jetpack',       name: 'Jetpack Sneakers',        emoji: '🚀', cost: 1100, tier: 'core', group: 'boots', recipe: ['sneakers', 'caffeine'], stats: { ms: 45, as: 0.2 }, desc: '+45 move speed, +20% attack speed. Boots — only one pair.' },
  // ── Pass 2 RP-09 ──
  slippers:       { id: 'slippers',       name: 'Fuzzy Slippers',     emoji: '🥿', cost: 1000, tier: 'core', group: 'boots', recipe: ['sneakers', 'hoodie'], stats: { ms: 45, armor: 20 }, desc: '+45 move speed, +20 armor. Work-from-home comfort. Boots — only one pair.' },
  smartwatch:     { id: 'smartwatch',     name: 'Smartwatch',         emoji: '⌚', cost: 1000, tier: 'core', group: 'boots', recipe: ['sneakers', 'pomodoro'], stats: { ms: 45, haste: 0.12 }, desc: '+45 move speed, 12% cooldown reduction. Reminds you to stand up. Boots slot — only one.' },
  second_monitor: { id: 'second_monitor', name: 'Second Monitor',     emoji: '📺', cost: 1250, tier: 'core', recipe: ['mouse', 'pomodoro'], stats: { ad: 25, haste: 0.15 }, desc: '+25 attack damage, 15% cooldown reduction. Docs on the left, code on the right.' },
  cloud_credits:  { id: 'cloud_credits',  name: 'Cloud Credits',      emoji: '☁️', cost: 1350, tier: 'core', recipe: ['tech_book', 'chair'], stats: { ap: 55, hp: 220 }, desc: '+55 ability power, +220 health. Free tier, for now.' },
  energy_crate:   { id: 'energy_crate',   name: 'Energy Drink Crate', emoji: '🥤', cost: 1250, tier: 'core', recipe: ['caffeine', 'caffeine'], stats: { as: 0.3, ms: 15 }, desc: '+30% attack speed, +15 move speed. Sleep is a deprecated feature.' },
  vpn_hoodie:     { id: 'vpn_hoodie',     name: 'VPN Hoodie',         emoji: '🦺', cost: 2400, tier: 'core', recipe: ['chair', 'hoodie'], stats: { hp: 300, armor: 35, mr: 45, haste: 0.1 }, desc: '+300 HP, +35 armor, +45 MR, 10% CDR. Untraceable, unkillable.' },
  letter_opener:  { id: 'letter_opener',  name: 'Letter Opener',      emoji: '🗡️', cost: 2900, tier: 'core', recipe: ['mouse', 'red_pen'], stats: { ad: 55, as: 0.2, lifesteal: 0.1 }, desc: '+55 attack damage, +20% attack speed, 10% lifesteal. Opens mail. And wounds.' },
  // ── 2026-11-25: fighters, supports, battle mages ──
  kanban:       { id: 'kanban',       name: 'Kanban Board',       emoji: '🗂️', cost: 1800, tier: 'core', recipe: ['mouse', 'chair'], stats: { ad: 30, hp: 250, haste: 0.1 }, desc: '+30 attack damage, +250 health, 10% cooldown reduction. To Do → Doing → Done. You live in Doing.' },
  team_lunch:   { id: 'team_lunch',   name: 'Team Lunch',         emoji: '🍱', cost: 1500, tier: 'core', recipe: ['chair', 'power_bank'], stats: { hp: 200, mana: 200, haste: 0.15, manaRegen: 4.0 }, desc: '+200 HP, +200 mana, 15% CDR, +4.0 mana/s. Nobody fights on a full stomach.' },
  firewall:     { id: 'firewall',     name: 'Firewall Appliance', emoji: '🧱', cost: 2000, tier: 'core', recipe: ['tech_book', 'hoodie'], stats: { ap: 65, armor: 30, mr: 30 }, desc: '+65 AP, +30 armor, +30 MR. Blocks port 22, and spells.' },
  midnight_oil: { id: 'midnight_oil', name: 'Midnight Oil',       emoji: '🕯️', cost: 2200, tier: 'core', recipe: ['tech_book', 'red_pen'], stats: { ap: 80, lifesteal: 0.12, mrPen: 0.25 }, passive: { id: 'burn', desc: 'Burnout: Skills deal +25 bonus burn damage.' }, desc: '+80 AP, 12% lifesteal, +25% MR Pen. Passive: +25 skill burn dmg.' },
  // ── 2026-11-26: AoV-style passive core items ──
  thornmail_rack:  { id: 'thornmail_rack',  name: 'Thornmail Firewall', emoji: '🌵', cost: 2100, tier: 'core', recipe: ['chair', 'hoodie'], stats: { hp: 320, armor: 55 }, passive: { id: 'thorns', desc: 'Thorns: Reflects 18% of basic-attack damage back to attackers.' }, desc: '+320 HP, +55 armor. Passive: Reflect 18% attack dmg.' },
  grievous_linter: { id: 'grievous_linter', name: 'Strict Linter',      emoji: '✂️', cost: 1900, tier: 'core', recipe: ['mouse', 'pomodoro'], stats: { ad: 45, haste: 0.1 }, passive: { id: 'grievous', desc: 'Grievous: Attacks & skills reduce enemy healing by 40% for 3s.' }, desc: '+45 AD, 10% CDR. Passive: -40% enemy healing (3s).' },
  crit_compiler:   { id: 'crit_compiler',   name: 'JIT Compiler',       emoji: '⚡', cost: 2600, tier: 'core', recipe: ['mouse', 'caffeine'], stats: { ad: 55, as: 0.25 }, passive: { id: 'crit3', desc: 'Crit Surge: Every 3rd basic attack deals +60% bonus damage.' }, desc: '+55 AD, +25% AS. Passive: Every 3rd hit +60% dmg.' },
  frost_cache:     { id: 'frost_cache',     name: 'Cold Cache',         emoji: '❄️', cost: 2200, tier: 'core', recipe: ['tech_book', 'chair'], stats: { ap: 65, hp: 240 }, passive: { id: 'frost', desc: 'Frostbite: Skills slow enemies by 25% for 1.5s.' }, desc: '+65 AP, +240 HP. Passive: Skills slow 25% (1.5s).' },
  guardian_backup: { id: 'guardian_backup', name: 'Cloud Backup',       emoji: '🪽', cost: 2500, tier: 'core', recipe: ['chair', 'hoodie'], stats: { hp: 280, armor: 35, mr: 35 }, passive: { id: 'lifeline', desc: 'Lifeline: Dropping below 30% HP grants a 260 shield for 3s (45s CD).' }, desc: '+280 HP, +35 armor, +35 MR. Passive: 260 emergency shield <30% HP.' },
  // ── 2026-11-26 P1: Counter & Active Items (trigger with key 1) ──
  armor_shredder:  { id: 'armor_shredder',  name: 'Root Sudo',          emoji: '🔑', cost: 2400, tier: 'core', recipe: ['mouse', 'mouse'], stats: { ad: 50, armorPen: 0.3 }, passive: { id: 'shred', desc: 'Sudo Access: Ignores 30% of target armor.' }, desc: '+50 AD, +30% Armor Pen. Melts tanks and firewalls.' },
  freeze_frame:    { id: 'freeze_frame',    name: 'Debugger Breakpoint', emoji: '⏸️', cost: 2500, tier: 'core', group: 'active', recipe: ['tech_book', 'hoodie'], stats: { ap: 70, armor: 35 }, passive: { id: 'stasis', desc: 'Active [1] (60s CD, max 1 active item): Stasis — invulnerable & untargetable for 2s (not usable while stunned).' }, active: { id: 'stasis', cd: 60, ms: 2000, usableWhileStunned: false }, desc: '+70 AP, +35 armor. Active [1]: 2s invulnerable stasis.' },
  git_revert:      { id: 'git_revert',      name: 'Git Revert Charm',   emoji: '↩️', cost: 1800, tier: 'core', group: 'active', recipe: ['chair', 'hoodie'], stats: { hp: 250, armor: 20, mr: 25 }, passive: { id: 'cleanse', desc: 'Active [1] (50s CD, max 1 active item): Cleanse all stuns/roots/slows + 35% MS (2s). Usable while stunned.' }, active: { id: 'cleanse', cd: 50, ms: 2000, usableWhileStunned: true }, desc: '+250 HP, +20 armor, +25 MR. Active [1]: Cleanse CC + 35% MS.' },
  shield_breaker:  { id: 'shield_breaker',  name: 'CORS Bypass',        emoji: '🔓', cost: 2100, tier: 'core', recipe: ['mouse', 'caffeine'], stats: { ad: 45, as: 0.15 }, passive: { id: 'anti_shield', desc: 'Bypass: Deals +50% bonus damage to enemy shields.' }, desc: '+45 AD, +15% AS. Passive: +50% bonus damage to shields.' },
  shadow_proxy:    { id: 'shadow_proxy',    name: 'Shadow Proxy',       emoji: '🕶️', cost: 2400, tier: 'core', group: 'active', recipe: ['mouse', 'caffeine'], stats: { ad: 50, as: 0.2 }, passive: { id: 'veil', desc: 'Active [1] (60s CD, max 1 active item): Veil — 240 shield + 30% MS + stealth for 1.8s (broken on attack/cast).' }, active: { id: 'veil', cd: 60, ms: 1800, shield: 240, usableWhileStunned: false }, desc: '+50 AD, +20% AS. Active [1]: 1.8s stealth veil + 240 shield + 30% MS.' },
};

export const ITEM_IDS = Object.keys(ITEMS);
/** Shop display order (rows of 5): consumables · basics (attack, magic / defence) · core (boots +
 *  utility · attack · magic / defence · late · counter & actives). */
export const SHOP_ORDER = [
  'coffee',
  'mouse', 'caffeine', 'red_pen', 'tech_book', 'sticky_notes',
  'chair', 'hoodie', 'power_bank', 'pomodoro', 'sneakers',
  'jetpack', 'slippers', 'smartwatch', 'rubber_duck', 'team_lunch',
  'rgb_keyboard', 'second_monitor', 'energy_crate', 'gauntlet', 'kanban',
  'headphones', 'cloud_credits', 'firewall', 'standing_desk', 'vpn_hoodie',
  'ultrawide', 'letter_opener', 'stackoverflow', 'midnight_oil', 'server_rack',
  'crit_compiler', 'grievous_linter', 'frost_cache', 'thornmail_rack', 'guardian_backup',
  'armor_shredder', 'shield_breaker', 'freeze_frame', 'git_revert', 'shadow_proxy',
];

/** Active passive ids owned by an inventory. */
export function itemPassives(inventory) {
  const set = new Set();
  for (const id of inventory || []) {
    const p = id && ITEMS[id]?.passive?.id;
    if (p) set.add(p);
  }
  return set;
}

/** First owned active-item spec in an inventory (triggered via key 1). */
export function ownedActiveItem(inventory) {
  for (const id of inventory || []) {
    const it = id && ITEMS[id];
    if (it?.active) return it;
  }
  return null;
}

export function isItemId(id) { return typeof id === 'string' && Object.hasOwn(ITEMS, id); }

/** Sum item stats for an inventory (array of item ids, '' = empty slot). */
export function itemStats(inventory) {
  const s = { ad: 0, ap: 0, hp: 0, mana: 0, manaRegen: 0, armor: 0, armorPen: 0, mr: 0, mrPen: 0, ms: 0, as: 0, haste: 0, lifesteal: 0, apPct: 0 };
  for (const id of inventory || []) {
    const it = id && ITEMS[id];
    if (!it || !it.stats) continue;
    for (const [k, v] of Object.entries(it.stats)) s[k] = (s[k] || 0) + v;
  }
  return s;
}

/** Compute combine discount and consumed slots for Basic -> Core upgrades. */
export function recipePlan(inventory, id) {
  const it = ITEMS[id];
  const components = it?.recipe || [];
  if (!it) return { cost: 0, baseCost: 0, discount: 0, consumedSlots: [], components: [] };
  const inv = inventory || [];
  const used = new Set();
  const consumedSlots = [];
  let discount = 0;
  for (const cid of components) {
    for (let i = 0; i < inv.length; i++) {
      if (!used.has(i) && inv[i] === cid) {
        used.add(i);
        consumedSlots.push(i);
        discount += ITEMS[cid]?.cost || 0;
        break;
      }
    }
  }
  return { cost: Math.max(0, it.cost - discount), baseCost: it.cost, discount, consumedSlots, components };
}

/**
 * Can this inventory buy `id`? Returns null if OK, else a short reason.
 * Accounts for consumed recipe components so full 6/6 inventories and
 * upgraded boots (`sneakers` -> core boots) succeed cleanly.
 */
export function buyBlocker(inventory, id) {
  const it = ITEMS[id];
  if (!it) return 'unknown item';
  if (it.consumable) return null;
  const plan = recipePlan(inventory, id);
  const consumed = new Set(plan.consumedSlots);
  const kept = (inventory || []).filter((o, i) => o && !consumed.has(i));
  if (kept.length >= 6) return 'inventory full';
  if (it.group && kept.some((o) => ITEMS[o]?.group === it.group)) return `already own ${it.group}`;
  return null;
}

/** Apply a non-consumable purchase/combine in-place on `inventory` and `boughtAt`. */
export function applyBuy(inventory, boughtAt, id, now) {
  const plan = recipePlan(inventory, id);
  for (const s of plan.consumedSlots) {
    inventory[s] = '';
    if (boughtAt) boughtAt[s] = 0;
  }
  const slot = plan.consumedSlots.length ? plan.consumedSlots[0] : inventory.indexOf('');
  if (slot < 0) return { ok: false };
  inventory[slot] = id;
  if (boughtAt) boughtAt[slot] = now;
  return { ok: true, slot, cost: plan.cost, consumedSlots: plan.consumedSlots, discount: plan.discount };
}

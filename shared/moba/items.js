// shared/moba/items.js — Team Mode shop (office gear). Shared by server + client.
//
// Buying happens inside your fountain (or while dead). 6 inventory slots, no
// recipes (buy directly), no selling in v1. Stat fields (all additive):
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
  power_bank: { id: 'power_bank', name: 'Power Bank',        emoji: '🔋', cost: 350, tier: 'basic', stats: { mana: 220 },     desc: '+220 mana. Never die at 1%.' },
  pomodoro:   { id: 'pomodoro',   name: 'Pomodoro Timer',    emoji: '⏱️', cost: 450, tier: 'basic', stats: { haste: 0.1 },    desc: '10% cooldown reduction. 25 minutes of pure focus.' },
  sneakers:   { id: 'sneakers',   name: 'Office Sneakers',   emoji: '👟', cost: 300, tier: 'basic', group: 'boots', stats: { ms: 25 }, desc: '+25 move speed. Boots — only one pair.' },

  // ── core ──
  rgb_keyboard:  { id: 'rgb_keyboard',  name: 'RGB Mechanical Keyboard', emoji: '⌨️', cost: 1300, tier: 'core', stats: { ad: 35, as: 0.15 },             desc: '+35 attack damage, +15% attack speed. Clicky = faster.' },
  ultrawide:     { id: 'ultrawide',     name: 'Ultrawide Monitor',       emoji: '🖥️', cost: 2700, tier: 'core', stats: { ad: 65, as: 0.25 },             desc: '+65 attack damage, +25% attack speed. See the whole fight.' },
  gauntlet:      { id: 'gauntlet',      name: 'Git Blame Gauntlet',      emoji: '🩸', cost: 1500, tier: 'core', stats: { ad: 30, lifesteal: 0.12 },      desc: '+30 attack damage, 12% lifesteal. Heal off everyone else\'s mistakes.' },
  headphones:    { id: 'headphones',    name: 'Noise-Cancelling Headphones', emoji: '🎧', cost: 1400, tier: 'core', stats: { ap: 60, haste: 0.1 },        desc: '+60 ability power, 10% cooldown reduction. Meetings can\'t reach you.' },
  stackoverflow: { id: 'stackoverflow', name: 'Stack Overflow Premium',  emoji: '🧠', cost: 2800, tier: 'core', stats: { ap: 110, apPct: 0.25 },         desc: '+110 ability power, +25% total ability power. Every answer, instantly.' },
  standing_desk: { id: 'standing_desk', name: 'Standing Desk',           emoji: '🛡️', cost: 1300, tier: 'core', stats: { hp: 220, armor: 35 },          desc: '+220 health, +35 armor. Posture is a defensive stat.' },
  server_rack:   { id: 'server_rack',   name: 'Server Rack Armor',       emoji: '🗄️', cost: 2600, tier: 'core', stats: { hp: 450, armor: 50 },          desc: '+450 health, +50 armor. Enterprise-grade uptime.' },
  rubber_duck:   { id: 'rubber_duck',   name: 'Rubber Duck',             emoji: '🦆', cost: 1100, tier: 'core', stats: { haste: 0.2, mana: 250 },       desc: '20% cooldown reduction, +250 mana. Explains your bugs back to you.' },
  jetpack:       { id: 'jetpack',       name: 'Jetpack Sneakers',        emoji: '🚀', cost: 1100, tier: 'core', group: 'boots', stats: { ms: 45, as: 0.2 }, desc: '+45 move speed, +20% attack speed. Boots — only one pair.' },
};

export const ITEM_IDS = Object.keys(ITEMS);
/** Shop display order: consumables, basics, core. */
export const SHOP_ORDER = [
  'coffee',
  'mouse', 'tech_book', 'chair', 'hoodie', 'power_bank', 'pomodoro', 'sneakers',
  'rgb_keyboard', 'gauntlet', 'headphones', 'rubber_duck', 'standing_desk', 'jetpack',
  'ultrawide', 'stackoverflow', 'server_rack',
];

export function isItemId(id) { return typeof id === 'string' && Object.hasOwn(ITEMS, id); }

/** Sum item stats for an inventory (array of item ids, '' = empty slot). */
export function itemStats(inventory) {
  const s = { ad: 0, ap: 0, hp: 0, mana: 0, armor: 0, ms: 0, as: 0, haste: 0, lifesteal: 0, apPct: 0 };
  for (const id of inventory || []) {
    const it = id && ITEMS[id];
    if (!it || !it.stats) continue;
    for (const [k, v] of Object.entries(it.stats)) s[k] = (s[k] || 0) + v;
  }
  return s;
}

/**
 * Can this inventory buy `id`? Returns null if OK, else a short reason.
 * (Gold + location are checked by the server separately.)
 */
export function buyBlocker(inventory, id) {
  const it = ITEMS[id];
  if (!it) return 'unknown item';
  if (it.consumable) return null;
  const owned = (inventory || []).filter(Boolean);
  if (owned.length >= 6) return 'inventory full';
  if (it.group && owned.some((o) => ITEMS[o]?.group === it.group)) return `already own ${it.group}`;
  return null;
}

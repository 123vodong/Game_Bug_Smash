// shared/moba/rules.js — Team Mode (office MOBA) tunables.
// Imported by BOTH the server (server/rooms/TeamRoom.js) and the client
// (src/scenes/TeamModeScene.js), so numbers shown in the UI always match the
// simulation. Pure data + pure helpers only — no imports, no side effects.

export const TEAM_SIZE = 5;                 // 5v5; bots fill empty slots
export const TEAMS = ['blue', 'red'];
export const TEAM_INFO = {
  blue: { name: 'Startup',  emoji: '🚀', color: 0x39c2ff, css: '#39c2ff' },
  red:  { name: 'MegaCorp', emoji: '🏢', color: 0xff5e5e, css: '#ff5e5e' },
};

// ── Match flow ──
export const LOBBY_MS = 8000;               // quick-play queue: countdown from the first human join (or startNow) → champion select
export const LOBBY_SOLO_MS = 3000;          // EP-19 r2: only one human in the queue → start this soon (others can still join meanwhile)
// v3 match flow: lobby (queue) → select (champion select) → loading → playing → ended.
export const SELECT_MS = 30000;             // champion select timer (humans auto-lock their hover / a random free champ)
export const SELECT_BOT_PICK_MS = [1000, 3000];  // EP-19 r2: bots lock fast (was 3–22 s → 1.5–6 s → 1–3 s)
export const SELECT_ALL_LOCKED_MS = 1500;   // everyone locked → select ends this soon after (was 3 s)
export const LOADING_MS = 2500;             // loading screen (10 champions) before playing (was 4 s)
export const PICK_RATE_MS = 150;            // min interval between accepted pick / spells messages
export const END_LINGER_MS = 20000;         // victory screen before the room closes
export const TICK_MS = 50;                  // 20 Hz simulation

// ── Leveling (1–12) ──
export const MAX_LEVEL = 12;
// Cumulative XP to reach level i+1 (index 0 = level 1).
export const XP_TABLE = [0, 280, 660, 1140, 1720, 2400, 3180, 4060, 5040, 6120, 7300, 8580];
export const ULT_UNLOCK_LEVEL = 6;          // R becomes available
export function levelForXp(xp) {
  let lv = 1;
  for (let i = 0; i < XP_TABLE.length; i++) if (xp >= XP_TABLE[i]) lv = i + 1;
  return Math.min(MAX_LEVEL, lv);
}

// ── Economy ──
export const START_GOLD = 500;
export const PASSIVE_GOLD_PER_SEC = 2.4;    // starts at 0:30
export const PASSIVE_GOLD_DELAY_MS = 30000;
export const KILL_GOLD = 300;               // champion kill
export const ASSIST_GOLD = 150;             // split between assisters
export const FIRST_BLOOD_BONUS = 100;
export const TOWER_GOLD_TEAM = 120;         // to every member of the destroying team
export const ASSIST_WINDOW_MS = 10000;      // damage within this window = assist
export const XP_SHARE_RADIUS = 1300;        // champions this close to a dying unit share its XP
export const KILL_XP_BASE = 140;            // + 30 × victim level
export const KILL_XP_PER_VICTIM_LEVEL = 30;

// ── Death / respawn / base ──
export function respawnMs(level) { return Math.round((5 + 1.6 * level) * 1000); } // L1 6.6 s … L12 24 s
export const RECALL_MS = 4000;              // channel; interrupted by damage or moving/casting
export const FOUNTAIN_RADIUS = 520;         // shop + heal zone
export const FOUNTAIN_HEAL_PER_SEC = 0.12;  // × max HP / s
export const FOUNTAIN_MANA_PER_SEC = 0.15;  // × max mana / s
export const FOUNTAIN_LASER_DPS = 600;      // to ENEMY champions inside the enemy fountain
export const SHOP_ONLY_IN_FOUNTAIN = true;  // or while dead
export const INVENTORY_SLOTS = 6;

// ── Combat ──
export function damageAfterArmor(raw, armor) { return raw * 100 / (100 + Math.max(0, armor)); }
export const OUT_OF_COMBAT_MS = 6000;       // regen boost after this long without damage
export const HP_REGEN_PCT_PER_SEC = 0.006;  // × max HP / s (×4 out of combat)
export const MANA_REGEN_PCT_PER_SEC = 0.012;
export const MOVE_ORDER_RATE_MS = 50;       // min interval between accepted `order`s
export const CAST_RATE_MS = 120;            // min interval between accepted `cast`s (any slot)

// ── Minions — each team ships a squad of office robots at the other's server ──
// v2: robots instead of bugs. `sprite` keys are procedural textures made by the
// client (src/entities/moba/looks.js → ensureMobaLooks); `fallback` is the old
// bug PNG used if a texture is missing. `name` is shown in tooltips/kill feed.
export const WAVE_FIRST_MS = 20000;         // first wave at 0:20
export const WAVE_EVERY_MS = 30000;
export const SIEGE_EVERY_N_WAVES = 3;
export const WAVE_COMPOSITION = ['melee', 'melee', 'melee', 'ranged', 'ranged', 'ranged'];
export const MINION_GROWTH_PER_WAVE = 0.025; // +2.5 % hp/dmg per wave
export const MINIONS = {
  melee:  { sprite: 'bot-vacuum', fallback: 'bug-ladybug', name: 'Robo-Vacuum', hp: 460, dmg: 14, range: 70,  atkMs: 1250, speed: 170, gold: 21, xp: 60, size: 46 },
  ranged: { sprite: 'bot-project', fallback: 'bug-null', name: 'Project Bot', hp: 300, dmg: 24, range: 330, atkMs: 1550, speed: 170, gold: 15, xp: 30, size: 42 },
  siege:  { sprite: 'bot-printer', fallback: 'bug-robot', name: 'Printer Tank', hp: 950, dmg: 42, range: 320, atkMs: 2000, speed: 170, gold: 60, xp: 92, size: 60 },
};
export const MINION_AGGRO_RANGE = 520;

// ── Structures ──
// Ranged auto-attacks + tower shots land after travel time at this speed (the
// client animates its projectiles with the same number).
export const ATK_PROJ_SPEED = 1500;

// Tower reach on a champion = range + champ radius (30); a champion's reach on
// a tower = its range + tower radius (70) + slack — so range must exceed the
// longest champion range (500) + ~40 or ranged champions siege for free.
export const TOWER = {
  range: 600, atkMs: 1000, dmgChamp: 150, dmgChampRampPct: 0.25, // +25 % per consecutive hit on the same champ
  dmgMinionPctMaxHp: 0.28, armor: 40,
  hp: { 1: 2100, 2: 2500, 3: 2900 },  // lowered 2026-11-07: first tower fell ~8:50 live  // tier 1 outer, 2 inner, 3 core firewall
};
export const CORE = { hp: 5000, armor: 30 };
// Structure damage taken without allied minions nearby is reduced ("backdoor" guard).
export const BACKDOOR_RADIUS = 700;
export const BACKDOOR_DAMAGE_MUL = 0.4;
// "Crunch Time" — long games must end: from CRUNCH_MS on, structures take ×CRUNCH_STRUCT_MUL
// damage and the backdoor guard is off (bots-only sims had 45-min stalemates at an open core).
export const CRUNCH_MS = 30 * 60000;
export const CRUNCH_STRUCT_MUL = 2;

// ── Jungle ("legacy code" zones) + river objectives ──
// v2: each camp size has a list of `variants`; a camp picks one by its map id
// (see campVariant: top jungle = robots, bot jungle = bugs; mirrored camps match).
//   variant { sprite, fallback, name } — render + names only, stats are per size.
export const CAMPS = {
  small:  { sprite: 'bot-drone', fallback: 'bug-ladybug', name: 'Coffee Drones',
            variants: [{ sprite: 'bot-drone', fallback: 'bug-ladybug', name: 'Coffee Drones' }, { sprite: 'bug-ladybug', fallback: 'bug-ladybug', name: 'Loose Bugs' }],
            count: 3, hp: 320,  dmg: 16, atkMs: 1300, gold: 15, xp: 40,  respawnMs: 60000,  size: 44 },
  medium: { sprite: 'bot-shredder', fallback: 'bug-beetle', name: 'Shredder Bots',
            variants: [{ sprite: 'bot-shredder', fallback: 'bug-beetle', name: 'Shredder Bots' }, { sprite: 'bug-beetle', fallback: 'bug-beetle', name: 'Legacy Beetles' }],
            count: 2, hp: 720,  dmg: 28, atkMs: 1400, gold: 40, xp: 90,  respawnMs: 75000,  size: 54 },
  big:    { sprite: 'bot-mainframe', fallback: 'bug-robot', name: 'Legacy Mainframe',
            variants: [{ sprite: 'bot-mainframe', fallback: 'bug-robot', name: 'Legacy Mainframe' }, { sprite: 'bot-mainframe', fallback: 'bug-robot', name: 'Legacy Mainframe' }],
            count: 1, hp: 1500, dmg: 48, atkMs: 1600, gold: 110, xp: 200, respawnMs: 90000, size: 72 },
};
export const CAMP_LEASH_RADIUS = 620;       // monsters reset if pulled further than this
export const EPICS = {
  golden: {  // the CEO's golden bug — team gold (3:00 + 150 g: a 2:00/200 g bug snowballed)
    sprite: 'bug-ladybug', tint: 0xffd700, hp: 2600, dmg: 40, atkMs: 1300, size: 80,
    firstSpawnMs: 180000, respawnMs: 180000, teamGold: 150, xp: 300,
    title: "✨ THE CEO'S GOLDEN BUG", reward: '+150 gold for the whole team',
  },
  deadline: { // THE DEADLINE — team buff (reuses assets/boss/deadline.png)
    sprite: 'boss-deadline', hp: 4500, dmg: 110, atkMs: 1700, size: 150,
    firstSpawnMs: 240000, respawnMs: 240000, teamGold: 150, xp: 500,
    buff: { id: 'deadline', ms: 120000, dmgPct: 0.2, minionBuffPct: 0.5 },
    title: '⏰ THE DEADLINE', reward: '+20% damage + empowered bug waves for 2 min',
  },
};

/** Camp variant for a camp id from map.js CAMPS (e.g. 'blue_bj_small'): top-jungle
 *  camps (tj_*) use variant 0 (robots), bot-jungle camps (bj_*) variant 1 (bugs).
 *  Stable per camp and identical for mirrored camps (fair + recognisable). */
export function campVariant(campId, type) {
  const c = CAMPS[type];
  if (!c) return null;
  const list = c.variants || [c];
  const base = String(campId || '').replace(/^(blue|red)_/, '');
  return list[(base.startsWith('bj_') ? 1 : 0) % list.length];
}

// ── v2: walls, knockbacks, pets ──
export const KNOCKBACK_MS = 200;             // displacement travel time
export const PET_SPEED_MUL = 1.15;           // pets move at owner ms × this (catch up)
export const PET_LEASH = 900;                // farther than this from the owner → teleport back
export const PET_OWNER_HIT_MEMORY_MS = 3000; // pet attacks the last enemy champ its owner hit within this

// ── v4: bushes, auto-aim, custom rooms ──
export const BUSH_REVEAL_MS = 1500;          // attacking / casting from a bush reveals you this long
export const AUTO_AIM_SLACK = 150;           // auto-aim looks for enemies within skill range + this
export const ROOM_NAME_MAX = 24;             // custom room name length
export const ROOM_MAX_HUMANS = 10;           // custom rooms: up to 10 humans (5 per side)

// ── Experience Pass 1: "Rollback" (concede) vote — EXPERIENCE_PASS_BREAKDOWN.md §3.3 ──
export const ROLLBACK_FROM_MS = 720000;      // votes allowed from 12:00
export const ROLLBACK_VOTE_MS = 20000;       // a vote stays open this long
export const ROLLBACK_COOLDOWN_MS = 180000;  // per team, after a failed vote
export const ROLLBACK_NEED = 4;              // yes votes (of 5 seats) — and no human may vote no

// ── Champion leveling helper ──
/** Stat at a level: base + growth × (level − 1). */
export function statAt(base, growth, level) { return base + (growth || 0) * (Math.max(1, level) - 1); }
/** Skill damage/heal/shield amount: base + perLevel×(lv−1) + adRatio×AD + apRatio×AP (+ hpRatio×maxHp). */
export function scaledAmount(spec, level, ad, ap, maxHp = 0) {
  if (!spec) return 0;
  return (spec.base || 0) + (spec.perLevel || 0) * (Math.max(1, level) - 1)
    + (spec.ad || 0) * ad + (spec.ap || 0) * ap + (spec.hp || 0) * maxHp;
}
/** Cooldown after haste (percent cooldown reduction, capped). */
export const MAX_HASTE_PCT = 0.4;
export function cooldownMs(baseSec, hastePct) {
  return Math.round(baseSec * 1000 * (1 - Math.min(MAX_HASTE_PCT, hastePct || 0)));
}

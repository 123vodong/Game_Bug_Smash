// rules.js — every tunable number + pure helper for the MP arena.
//
// Single source of truth for the server (ArenaRoom, BotDirector, EventDirector
// all import from here). Client mirrors a few of these (WORLD_W/H, XP curve,
// broken duration) — when you change one here, mirror it in MultiPlayScene.
// See .claude/context/design/09_BALANCE.md for the design rationale.

// ───── World ─────
// Large arena tuned to feel uncrowded with 20-32 simultaneous players.
// 6000×3375 = 16:9. ~2.25× the previous area, so per-player space roughly doubles.
export const ARENA_W = 6000;
export const ARENA_H = 3375;
// Server smash range includes a latency buffer (~32px) so that fast-fleeing
// bugs don't drift out of range during the ~100ms message round-trip.
export const SMASH_RADIUS  = 96;
export const TICK_MS  = 50;          // 20 Hz simulation + broadcast
// Tuned 2026-05-30 — was 160/450ms. 160 bugs × 20Hz patch broadcast was the
// dominant client-side cost (~3200 onChange callbacks/sec + binary deserialize).
// Cutting to 100 ~halves the schema sync work while keeping the arena dense.
export const SPAWN_EVERY_MS = 600;
export const MAX_BUGS = 100;
export const BUG_LIFETIME_MS = 30000;
// Bug spawn rate scales with the hunters in the room (humans + bots), so a
// full room doesn't starve: ~1.5 bugs/s solo → ~3.9/s with 9 → capped at 5/s.
export function spawnIntervalFor(players) {
  return Math.max(200, Math.min(650, 1000 / (1.2 + 0.3 * players)));
}
// Share of regular spawns placed near a human (off-screen-ish ring) instead of
// uniformly — keeps the action on screen in a 6000×3375 world.
export const SPAWN_NEAR_HUMAN_CHANCE = 0.45;
export const SPAWN_NEAR_HUMAN_RING = [500, 1100];
// Absolute ceiling across ALL spawn paths (nests, drops, minions, surges) —
// event caps are soft; this protects client performance (schema sync cost).
export const HARD_MAX_BUGS = 150;
// Bugs stop eating code obstacles while the field is this crowded, so a bug
// surge can't chain-crack every nest on the map (Prod Down stripped 24 → 8).
export const EAT_PAUSE_ABOVE_BUGS = 110;
// A few easy bugs right on screen the moment a human joins (first 3 s were empty).
export const WELCOME_BUGS = 5;
export const WELCOME_BUG_RING = [180, 460];

export const FLEE_RADIUS_PX = 220;
export const WANDER_SPEED   = 35;    // px/s when not panicked
export const FLEE_SPEED_MUL = 2.2;
export const TURN_LERP      = 6;     // how fast bug heading lerps to target

// Aggressive bugs (Phase B 2026-05-31 — bumped 2026-05-31 difficulty pass)
export const BUG_ATTACK = {
  'bug-beetle': { aggro: 320, reach: 42, dmg: 6,  cooldownMs: 900,  chaseMul: 1.25 },
  'bug-robot':  { aggro: 420, reach: 48, dmg: 12, cooldownMs: 1800, chaseMul: 1.4 },
};

// Bugs eat code-obstacles over time
export const BUG_EAT_INTERVAL_MS = 1500;  // every 1.5 s, scan + chew (was 2500)
export const BUG_EAT_RADIUS      = 80;    // bug within this distance of obstacle = it eats
export const LADYBUG_EAT_BONUS   = 2;     // ladybugs munch 2 HP per tick (others = 1)
export const MAX_EAT_PER_TICK    = 4;     // cap so a single tick can't fully break an obstacle

// Toxic death cloud (Phase C 2026-05-31 — bumped 2026-05-31 difficulty pass)
export const TOXIC_CLOUD_RADIUS    = 70;
export const TOXIC_CLOUD_LIFETIME  = 1800;  // ms (was 1500)
export const TOXIC_CLOUD_TICK_MS   = 600;   // damage interval per cloud
export const TOXIC_CLOUD_DAMAGE    = 6;     // HP per tick — TTD ~5s for intern, fair

// Combo
export const COMBO_TIMEOUT_MS = 1500;
export function comboMult(c) {
  if (c >= 10) return 3;
  if (c >= 5)  return 2;
  if (c >= 3)  return 1.5;
  return 1;
}

// Pick a random point at least MIN_DIST from (x,y) for the "dive away" hide
export function pickFarPoint(x, y) {
  const MIN_DIST = 600;
  for (let i = 0; i < 12; i++) {
    const nx = 80 + Math.random() * (ARENA_W - 160);
    const ny = 100 + Math.random() * (ARENA_H - 200);
    if (Math.hypot(nx - x, ny - y) >= MIN_DIST) return { x: nx, y: ny };
  }
  return { x: 80 + Math.random() * (ARENA_W - 160), y: 100 + Math.random() * (ARENA_H - 200) };
}

// Round flow (Team Mode reference — Personal Mode has no rounds)
export const PHASE_PLAYING_MS = 90_000;  // 90s rounds
export const PHASE_RESULTS_MS = 8_000;   // 8s end screen

// ---- Stickyman Growth System (see develop_notes/STICKYMAN_GROWTH_BREAKDOWN.md) ----
// Cumulative XP per level. Curve is intentionally steep at the top end so
// that Lv5–6 (Senior / Super Senior) feel earned.
// EP-20 (2026-11-18): Lv2 at 60 XP (was 150) so a new hire is promoted within
// their first minute. Client mirror: MultiPlayScene LEVEL_XP_THRESHOLDS.
export const LEVEL_XP_THRESHOLDS = [0, 60, 600, 1800, 4500, 10000];
export const LEVEL_MAX_ENERGY     = [50,  90, 120, 150, 180, 220];
export const LEVEL_MAX_HEALTH     = [50,  90, 130, 180, 230, 290];
// Titles mirror the client's LEVEL_TITLES (used for kill-feed promotion lines).
export const LEVEL_TITLES = ['Intern', 'Fresher', 'Junior', 'Middle', 'Senior', 'Super Senior'];
// Basic smash is FREE — it's the main attack. Energy only fuels MOBA skills.
// Energy does NOT passively regen; only health pickups restore it.
export const ENERGY_COST = { smash: 0, punch: 0, kick: 0, parry: 0, jump: 0 };
export const SKILL_ENERGY = {
  q: 10, // Bug Dash      (was 20)
  w: 15, // Laptop Shield (was 25)
  e: 8,  // Debug Roll    (was 15)
  r: 25, // Deadline Break (was 40)
};
export const ENERGY_REGEN_PER_SEC = 0;  // disabled — pickups are the only refill

// Bug Dash tuning — short directional strike, requires an enemy target (client-side)
export const DASH_DISTANCE = 140;     // shorter than ROLL (180) — dash closes the gap, not flees
export const DASH_HIT_RADIUS = 50;    // bugs within this distance from dash line are hit

// Laptop Shield tuning
export const SHIELD_DURATION_MS = 3000; // shield expires after this if not consumed

// Debug Roll tuning
export const ROLL_DISTANCE = 180;       // px traveled (shorter than dash)
export const ROLL_INVULN_MS = 600;      // invulnerability window after rolling

// Deadline Break ult tuning (re-balanced 2026-06-01 — no longer a one-shot button)
export const ULT_RADIUS = 160;          // damage + knockback circle (was 200)
export const ULT_KNOCKBACK = 120;       // px push away from caster
export const ULT_STUN_MS = 1000;        // enemy stun window (was 1500)

/** Shortest distance from point (px,py) to line segment (ax,ay)-(bx,by). */
export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// ───── Unified damage model (rebalanced 2026-06-06; unified bugs+players 2026-06-06b) ─────
// ONE base damage drives every attack, against bugs AND players alike:
//
//     base = PVP_BASE_BY_LEVEL[attackerLv] × PVP_SKILL_MUL[source]
//
//   • PVP_BASE_BY_LEVEL ≈ player maxHealth / ~4.8 per tier, so a SAME-level PvP
//     fight is a consistent ~5 smash hits at every level.
//   • PVP_SKILL_MUL rewards energy spent: smash < dash < ult (same for bugs).
//
// Players additionally take a level-gap MATCHUP modifier (bugs don't — they
// have no level): bonus when an underdog hits UP, penalty when stomping DOWN,
// clamped so neither extreme is degenerate.
//
// Bug HP is scaled into this same domain (×12 vs the old 1–6) so bug TTK is
// unchanged AND the floating damage numbers read on the same scale as PvP.
export const PVP_BASE_BY_LEVEL    = [12, 20, 28, 38, 48, 60]; // attacker level → base
export const PVP_SKILL_MUL        = { smash: 1.0, dash: 1.5, ult: 2.0 };
export const PVP_MATCHUP_PER_LEVEL = 0.20; // ± per level of (defenderLv − attackerLv)
export const PVP_MATCHUP_MIN      = 0.35;  // floor when stomping far-lower levels
export const PVP_MATCHUP_MAX      = 1.80;  // cap when an underdog hits far-higher levels

export function pvpBaseForLevel(lv) {
  return PVP_BASE_BY_LEVEL[Math.max(0, Math.min(PVP_BASE_BY_LEVEL.length - 1, lv - 1))];
}
export function pvpMatchupMul(attackerLv, defenderLv) {
  const m = 1 + PVP_MATCHUP_PER_LEVEL * (defenderLv - attackerLv);
  return Math.max(PVP_MATCHUP_MIN, Math.min(PVP_MATCHUP_MAX, m));
}
/** Shared base damage (no matchup). `source` ∈ {'smash','dash','ult'}. */
export function attackBase(attackerLv, source) {
  const skillMul = PVP_SKILL_MUL[source] ?? PVP_SKILL_MUL.smash;
  return pvpBaseForLevel(attackerLv) * skillMul;
}
/** Damage to a BUG — unified base, no level-gap modifier (bugs have no level). */
export function bugDamage(attacker, source) {
  return Math.round(attackBase(attacker.level, source));
}
/** Damage to a PLAYER — same base, plus the level-gap matchup modifier. */
export function pvpDamage(attacker, defender, source) {
  return Math.round(attackBase(attacker.level, source)
    * pvpMatchupMul(attacker.level, defender.level));
}

// Broken (defeat) time scales with the level you had when you fell (EP-02):
// Interns are back in 8 s, Super Seniors sit out 20 s. Index = level - 1.
export const BROKEN_MS_BY_LEVEL   = [8000, 10000, 12000, 15000, 18000, 20000];
export function brokenMsForLevel(lv) {
  return BROKEN_MS_BY_LEVEL[Math.max(0, Math.min(BROKEN_MS_BY_LEVEL.length - 1, (lv | 0) - 1))];
}
// Reconnect grace (EP-01): a non-consented drop keeps your stickman (away,
// frozen, still damageable by humans) for this long. Sent in `welcome.reconnectS`.
export const RECONNECT_GRACE_S    = 20;
// Spawn protection — fresh joins and freshly-repaired laptops get a short
// invulnerability window so nobody gets farmed the instant they appear.
export const SPAWN_PROTECT_MS     = 3000;

// ───── Personal catch-up (EP-20) ─────
// ×2 bug-kill XP for a human's first 3 minutes in a session (a reconnect keeps
// the original session start, so a blip doesn't restart the window).
export const NEW_SESSION_XP_MUL = 2;
export const NEW_SESSION_XP_MS  = 180000;
// "Warm" bots (already at their desks) start with 0..this XP, squared-random
// so most are near 0 — a new human passes a few of them within a minute.
export const BOT_WARM_XP_MAX    = 240;

// Health pickups (Personal Mode only — Phase B)
export const PICKUP_TARGET_COUNT  = 5;     // keep this many alive on the map
export const PICKUP_RESPAWN_MS    = 5000;  // spawn cadence when below target
export const PICKUP_ENERGY_GAIN   = 40;    // health restored per pickup (name is legacy)
export const PICKUP_ENERGY_REFILL = 25;    // energy restored per pickup
export const PICKUP_RADIUS        = 26;    // collision radius
export const PLAYER_PICKUP_RADIUS = 28;    // player half-width for overlap

export function levelFromXP(xp) {
  let lv = 1;
  for (let i = 0; i < LEVEL_XP_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_XP_THRESHOLDS[i]) lv = i + 1;
  }
  return lv;
}
export function maxEnergyForLevel(lv) {
  return LEVEL_MAX_ENERGY[Math.max(0, Math.min(LEVEL_MAX_ENERGY.length - 1, lv - 1))];
}
export function maxHealthForLevel(lv) {
  return LEVEL_MAX_HEALTH[Math.max(0, Math.min(LEVEL_MAX_HEALTH.length - 1, lv - 1))];
}
export function levelTitle(lv) {
  return LEVEL_TITLES[Math.max(0, Math.min(LEVEL_TITLES.length - 1, (lv | 0) - 1))];
}

// 16-color palette so up to 32 players still get visually distinct hues
// (colors cycle after 16 — acceptable for a chaotic 32-player free-for-all).
export const PALETTE = [
  0xff6b6b, 0x4ecdc4, 0xffd23f, 0x7ed957, 0x7ec8ff, 0xff8a3d, 0xff66ff, 0x39c2ff,
  0xb084ff, 0xff5e94, 0x00d4aa, 0xffa84a, 0x6cffb6, 0xff9bd1, 0x8aff52, 0x52d0ff,
];

// Bug catalog — distinct personalities per kind. HP is in the UNIFIED damage
// domain (×12 vs the old 1–6) so a player's smash deals the same numbers to
// bugs as to players: a fresh Lv1 (smash 12) needs ~1 hit on a ladybug … ~6 on a robot.
export const BUG_KINDS = [
  { kind: 'bug-ladybug', hp: 12, weight: 7, speed: 35  }, // basic — most common
  { kind: 'bug-null',    hp: 24, weight: 4, speed: 45  }, // common, slightly tougher
  { kind: 'bug-race',    hp: 24, weight: 2, speed: 130 }, // speedster
  { kind: 'bug-beetle',  hp: 36, weight: 2, speed: 55  }, // tanky aggressor
  { kind: 'bug-toxic',   hp: 48, weight: 1, speed: 60  }, // tanky, faster
  { kind: 'bug-scarab',  hp: 60, weight: 1, speed: 35  }, // armored
  { kind: 'bug-robot',   hp: 72, weight: 1, speed: 75  }, // boss-tier
];
export const BUG_KIND_SCORE = {
  'bug-ladybug': 5,
  'bug-null':    8,
  'bug-race':    15,
  'bug-beetle':  20,
  'bug-toxic':   25,
  'bug-scarab':  30,
  'bug-robot':   50,
};
// Human-readable names used in kill-feed lines ("a killer robot broke X's laptop").
export const BUG_DISPLAY_NAME = {
  'bug-ladybug': 'ladybug',
  'bug-null':    'NullPointer bug',
  'bug-race':    'race condition',
  'bug-beetle':  'beetle',
  'bug-toxic':   'toxic bug',
  'bug-scarab':  'legacy scarab',
  'bug-robot':   'killer robot',
  'bug-golden':  'golden bug',
};

export function rollBugKind() {
  const total = BUG_KINDS.reduce((s, b) => s + b.weight, 0);
  let r = Math.random() * total;
  for (const b of BUG_KINDS) { r -= b.weight; if (r <= 0) return b; }
  return BUG_KINDS[0];
}

// ── Map obstacles ─────────────────────────────────────────────────────────
// Initial fixed layout + dynamic respawn that maintains a target count.
export const OBSTACLE_LAYOUT = [
  // Corner clusters
  { x:  400, y:  300, w: 220, h:  80, kind: 'code-block' },
  { x:  720, y:  500, w: 160, h: 160, kind: 'desk' },
  { x: 1100, y:  340, w: 180, h: 100, kind: 'whiteboard' },
  { x: 4900, y:  300, w: 220, h:  80, kind: 'code-block' },
  { x: 5200, y:  500, w: 160, h: 160, kind: 'desk' },
  { x: 4700, y:  720, w: 180, h: 100, kind: 'whiteboard' },
  { x:  400, y: 2900, w: 220, h:  80, kind: 'code-block' },
  { x:  720, y: 2700, w: 160, h: 160, kind: 'desk' },
  { x: 1100, y: 2900, w: 180, h: 100, kind: 'whiteboard' },
  { x: 4900, y: 2900, w: 220, h:  80, kind: 'code-block' },
  { x: 5200, y: 2700, w: 160, h: 160, kind: 'desk' },
  { x: 4700, y: 2800, w: 180, h: 100, kind: 'whiteboard' },
  // Mid-map walls
  { x: 2400, y: 1100, w: 320, h:  60, kind: 'code-block' },
  { x: 3280, y: 1100, w: 320, h:  60, kind: 'code-block' },
  { x: 2400, y: 2240, w: 320, h:  60, kind: 'code-block' },
  { x: 3280, y: 2240, w: 320, h:  60, kind: 'code-block' },
  { x: 1900, y: 1600, w: 180, h: 100, kind: 'whiteboard' },
  { x: 3920, y: 1600, w: 180, h: 100, kind: 'whiteboard' },
  // Mid-edge structures
  { x: 1700, y:  900, w: 160, h: 130, kind: 'desk' },
  { x: 4140, y:  900, w: 160, h: 130, kind: 'desk' },
  { x: 1700, y: 2400, w: 160, h: 130, kind: 'desk' },
  { x: 4140, y: 2400, w: 160, h: 130, kind: 'desk' },
];

// Dynamic respawn: keeps the map populated as obstacles are destroyed.
export const OBSTACLE_TARGET = 26;       // maintain ~this many at all times
export const OBSTACLE_RESPAWN_MS = 3500; // check + spawn cadence
export const OBSTACLE_VARIANTS = [
  { w: 220, h:  80, kind: 'code-block' },
  { w: 320, h:  60, kind: 'code-block' },
  { w: 160, h: 100, kind: 'code-block' },
  { w: 160, h: 160, kind: 'desk' },
  { w: 200, h: 120, kind: 'desk' },
  { w: 140, h: 140, kind: 'desk' },
  { w: 180, h: 100, kind: 'whiteboard' },
  { w: 240, h:  90, kind: 'whiteboard' },
];
export const OBSTACLE_MIN_DIST_FROM_PLAYER = 220; // px — don't spawn on top of someone
export const OBSTACLE_PADDING = 30;               // px between obstacles

/** Does point (x, y) sit inside the given obstacle? */
export function pointInRect(x, y, ob) {
  return x >= ob.x && x <= ob.x + ob.w && y >= ob.y && y <= ob.y + ob.h;
}

/** Return the first obstacle the point sits inside, or null. */
export function firstObstacleAt(state, x, y) {
  let hit = null;
  state.obstacles.forEach((ob) => { if (!hit && pointInRect(x, y, ob)) hit = ob; });
  return hit;
}

/** Slide-along clamp: given a desired movement from (fromX, fromY) to (toX, toY),
 *  resolve obstacle collisions by attempting the move axis-by-axis. Returns the
 *  final position. Skips clamping entirely if `passThrough` is true. */
export function clampToFreeSpace(state, fromX, fromY, toX, toY, passThrough) {
  if (passThrough) return { x: toX, y: toY };
  // Already inside one (dash/jump landing, knockback, spawn)? Let them walk
  // out — otherwise every step from inside lands inside and they're stuck.
  if (firstObstacleAt(state, fromX, fromY)) return { x: toX, y: toY };
  // Try X movement first; if it lands inside an obstacle, revert X.
  let x = toX, y = fromY;
  if (firstObstacleAt(state, x, y)) x = fromX;
  // Then try Y movement from the (possibly reverted) X.
  let y2 = toY;
  if (firstObstacleAt(state, x, y2)) y2 = fromY;
  return { x, y: y2 };
}

// ───── Drama systems (Office Chaos update) ─────
// PvP kill streaks — announced room-wide at these thresholds.
export const STREAK_TIERS = [
  { at: 3,  label: 'ON FIRE',             icon: '🔥' },
  { at: 5,  label: 'a 10x ENGINEER',      icon: '💻' },
  { at: 8,  label: 'DEPLOYING TO PROD',   icon: '🚀' },
  { at: 12, label: 'a PRINCIPAL ENGINEER', icon: '☠️' },
];
export const SHUTDOWN_MIN_STREAK = 3;    // ending a streak this long is announced
export const SHUTDOWN_XP_PER_KO  = 40;   // bonus XP per KO in the ended streak

// Tech Lead crown — the top scorer wears it and carries a bounty.
export const CROWN_MIN_SCORE   = 200;    // need at least this to be crowned
export const CROWN_CHECK_MS    = 1000;
// Hysteresis: a challenger must lead the holder by max(25, 10%) to take the
// crown — near-tied players were ping-ponging it every few seconds.
export const CROWN_SWAP_MARGIN_ABS = 25;
export const CROWN_SWAP_MARGIN_PCT = 0.10;
export const CROWNED_NOTICE_COOLDOWN_MS = 30000; // personal "you're Tech Lead" banner
export function bountyForScore(score) {
  return Math.round((100 + score * 0.25) / 10) * 10;
}

// Combo milestones worth a feed line (local HUD already shows every combo).
export const COMBO_FEED_AT = [15, 25, 40];

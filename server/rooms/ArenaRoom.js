// ArenaRoom — Phase 2 slice 2: bug AI (flee + wander) + round flow.
//
// State machine:
//   playing  — bugs spawn + roam, players smash, timer counts down
//   results  — short pause showing the winner, then auto-restart
//
// Bugs that detect a player within FLEE_RADIUS run away; otherwise they
// wander idly. The whole world is server-authoritative; clients are visual.
import { Room } from '@colyseus/core';
import { Schema, MapSchema, type } from '@colyseus/schema';

// Large arena tuned to feel uncrowded with 20-32 simultaneous players.
// 6000×3375 = 16:9. ~2.25× the previous area, so per-player space roughly doubles.
const ARENA_W = 6000;
const ARENA_H = 3375;
// Server smash range includes a latency buffer (~32px) so that fast-fleeing
// bugs don't drift out of range during the ~100ms message round-trip.
const SMASH_RADIUS  = 96;
const TICK_MS  = 50;          // 20 Hz simulation + broadcast
// Tuned 2026-05-30 — was 160/450ms. 160 bugs × 20Hz patch broadcast was the
// dominant client-side cost (~3200 onChange callbacks/sec + binary deserialize).
// Cutting to 100 ~halves the schema sync work while keeping the arena dense.
const SPAWN_EVERY_MS = 600;
const MAX_BUGS = 100;
const BUG_LIFETIME_MS = 30000;

const FLEE_RADIUS_PX = 220;
const WANDER_SPEED   = 35;    // px/s when not panicked
const FLEE_SPEED_MUL = 2.2;
const TURN_LERP      = 6;     // how fast bug heading lerps to target

// Aggressive bugs (Phase B 2026-05-31 — bumped 2026-05-31 difficulty pass)
const BUG_ATTACK = {
  'bug-beetle': { aggro: 320, reach: 42, dmg: 6,  cooldownMs: 900,  chaseMul: 1.25 },
  'bug-robot':  { aggro: 420, reach: 48, dmg: 12, cooldownMs: 1800, chaseMul: 1.4 },
};

// Bugs eat code-obstacles over time
const BUG_EAT_INTERVAL_MS = 1500;  // every 1.5 s, scan + chew (was 2500)
const BUG_EAT_RADIUS      = 80;    // bug within this distance of obstacle = it eats
const LADYBUG_EAT_BONUS   = 2;     // ladybugs munch 2 HP per tick (others = 1)
const MAX_EAT_PER_TICK    = 4;     // cap so a single tick can't fully break an obstacle

// Toxic death cloud (Phase C 2026-05-31 — bumped 2026-05-31 difficulty pass)
const TOXIC_CLOUD_RADIUS    = 70;
const TOXIC_CLOUD_LIFETIME  = 1800;  // ms (was 1500)
const TOXIC_CLOUD_TICK_MS   = 600;   // damage interval per cloud
const TOXIC_CLOUD_DAMAGE    = 6;     // HP per tick — TTD ~5s for intern, fair

// Combo
const COMBO_TIMEOUT_MS = 1500;
function comboMult(c) {
  if (c >= 10) return 3;
  if (c >= 5)  return 2;
  if (c >= 3)  return 1.5;
  return 1;
}

// Pick a random point at least MIN_DIST from (x,y) for the "dive away" hide
function pickFarPoint(x, y) {
  const MIN_DIST = 600;
  for (let i = 0; i < 12; i++) {
    const nx = 80 + Math.random() * (ARENA_W - 160);
    const ny = 100 + Math.random() * (ARENA_H - 200);
    if (Math.hypot(nx - x, ny - y) >= MIN_DIST) return { x: nx, y: ny };
  }
  return { x: 80 + Math.random() * (ARENA_W - 160), y: 100 + Math.random() * (ARENA_H - 200) };
}

// Round flow
const PHASE_PLAYING_MS = 90_000;  // 90s rounds
const PHASE_RESULTS_MS = 8_000;   // 8s end screen

// ---- Stickyman Growth System (see develop_notes/STICKYMAN_GROWTH_BREAKDOWN.md) ----
// Cumulative XP per level. Curve is intentionally steep at the top end so
// that Lv5–6 (Senior / Super Senior) feel earned. Each tier costs roughly
// 2× the previous. Lv6 ≈ 50 kills at base XP (or ~17 with a sustained ×3 combo).
// Harder progression — XP curve is steeper at every step. Intern is fragile.
const LEVEL_XP_THRESHOLDS = [0, 150, 600, 1800, 4500, 10000];
const LEVEL_MAX_ENERGY     = [50,  90, 120, 150, 180, 220];
const LEVEL_MAX_HEALTH     = [50,  90, 130, 180, 230, 290];
// (Damage to bugs is now the unified `bugDamage()` — see the damage model
// below. The old per-level LEVEL_BUG_DAMAGE table was removed in the unify pass.)
// Basic smash is FREE — it's the main attack. Energy only fuels MOBA skills.
// Energy does NOT passively regen; only health pickups restore it.
// Effect: players spam basic smash for combat, save energy for tactical skills.
const ENERGY_COST = { smash: 0, punch: 0, kick: 0, parry: 0, jump: 0 };
const SKILL_ENERGY = {
  q: 10, // Bug Dash      (was 20)
  w: 15, // Laptop Shield (was 25)
  e: 8,  // Debug Roll    (was 15)
  r: 25, // Deadline Break (was 40)
};
const ENERGY_REGEN_PER_SEC = 0;  // disabled — pickups are the only refill

// Bug Dash tuning — short directional strike, requires an enemy target (client-side)
const DASH_DISTANCE = 140;     // shorter than ROLL (180) — dash is for closing the gap, not fleeing
const DASH_HIT_RADIUS = 50;    // bugs within this distance from dash line are hit
// (Dash/ult bug-damage multipliers now come from PVP_SKILL_MUL — see the
// unified damage model below — so bugs and players share dash ×1.5 / ult ×2.0.)

// Laptop Shield tuning
const SHIELD_DURATION_MS = 3000; // shield expires after this if not consumed

// Debug Roll tuning
const ROLL_DISTANCE = 180;       // px traveled (shorter than dash)
const ROLL_INVULN_MS = 600;      // invulnerability window after rolling

// Deadline Break ult tuning
// Ult — re-balanced 2026-06-01. With harsher leveling + smaller intern HP,
// the old numbers made R a one-shot-KO button. Trimmed across the board:
// smaller radius, lower per-level damage, lower cap, shorter stun, costlier
// energy. Still feels devastating, but no longer auto-wins a fight.
const ULT_RADIUS = 160;          // damage + knockback circle (was 200)
// Ult damage (bugs AND players) now flows through the shared model via
// PVP_SKILL_MUL.ult (×2.0) — no separate bug multiplier or per-level cap.
// Ult PvP damage now flows through the shared PvP model (PVP_SKILL_MUL.ult +
// matchup scaling) instead of its own per-level/cap constants — see below.
const ULT_KNOCKBACK = 120;       // px push away from caster (unchanged)
const ULT_STUN_MS = 1000;        // enemy stun window (was 1500)

/** Shortest distance from point (px,py) to line segment (ax,ay)-(bx,by). */
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
// (ENERGY_REGEN_PER_SEC redefined to 0 above — passive regen disabled)

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
// clamped so neither extreme is degenerate. This fixes the old problems where
// (a) energy skills did the same damage as a free smash, and (b) a Lv6 one-shot
// a Lv1 while a Lv1 needed ~25 hits on a Lv6.
//
// Bug HP is scaled into this same domain (×12 vs the old 1–6) so bug TTK is
// unchanged AND the floating damage numbers read on the same scale as PvP.
const PVP_BASE_BY_LEVEL    = [12, 20, 28, 38, 48, 60]; // attacker level → base
const PVP_SKILL_MUL        = { smash: 1.0, dash: 1.5, ult: 2.0 };
const PVP_MATCHUP_PER_LEVEL = 0.20; // ± per level of (defenderLv − attackerLv)
const PVP_MATCHUP_MIN      = 0.35;  // floor when stomping far-lower levels
const PVP_MATCHUP_MAX      = 1.80;  // cap when an underdog hits far-higher levels

function pvpBaseForLevel(lv) {
  return PVP_BASE_BY_LEVEL[Math.max(0, Math.min(PVP_BASE_BY_LEVEL.length - 1, lv - 1))];
}
function pvpMatchupMul(attackerLv, defenderLv) {
  const m = 1 + PVP_MATCHUP_PER_LEVEL * (defenderLv - attackerLv);
  return Math.max(PVP_MATCHUP_MIN, Math.min(PVP_MATCHUP_MAX, m));
}
/** Shared base damage (no matchup). `source` ∈ {'smash','dash','ult'}. */
function attackBase(attackerLv, source) {
  const skillMul = PVP_SKILL_MUL[source] ?? PVP_SKILL_MUL.smash;
  return pvpBaseForLevel(attackerLv) * skillMul;
}
/** Damage to a BUG — unified base, no level-gap modifier (bugs have no level). */
function bugDamage(attacker, source) {
  return Math.round(attackBase(attacker.level, source));
}
/** Damage to a PLAYER — same base, plus the level-gap matchup modifier. */
function pvpDamage(attacker, defender, source) {
  return Math.round(attackBase(attacker.level, source)
    * pvpMatchupMul(attacker.level, defender.level));
}

const BROKEN_DURATION_MS   = 20000; // 20s — broken players take real time to recover

// Health pickups (Personal Mode only — Phase B)
const PICKUP_TARGET_COUNT  = 5;     // keep this many alive on the map
const PICKUP_RESPAWN_MS    = 5000;  // spawn cadence when below target
const PICKUP_ENERGY_GAIN   = 40;    // restored per pickup
const PICKUP_RADIUS        = 26;    // collision radius
const PLAYER_PICKUP_RADIUS = 28;    // player half-width for overlap

function levelFromXP(xp) {
  let lv = 1;
  for (let i = 0; i < LEVEL_XP_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_XP_THRESHOLDS[i]) lv = i + 1;
  }
  return lv;
}
function maxEnergyForLevel(lv) {
  return LEVEL_MAX_ENERGY[Math.max(0, Math.min(LEVEL_MAX_ENERGY.length - 1, lv - 1))];
}
function maxHealthForLevel(lv) {
  return LEVEL_MAX_HEALTH[Math.max(0, Math.min(LEVEL_MAX_HEALTH.length - 1, lv - 1))];
}

// ---------------- schema ----------------
class Player extends Schema {
  constructor() {
    super();
    this.x = ARENA_W / 2;
    this.y = ARENA_H / 2;
    this.name = '';
    this.color = 0xffffff;
    this.score = 0;
    this.combo = 0;
    this.action = 'idle';
    this.action_seq = 0;
    // Growth system
    this.level = 1;
    this.xp = 0;
    this.energy = LEVEL_MAX_ENERGY[0];
    this.maxEnergy = LEVEL_MAX_ENERGY[0];
    // Health = damage receiver; defeat (broken) triggers at 0
    this.health = LEVEL_MAX_HEALTH[0];
    this.maxHealth = LEVEL_MAX_HEALTH[0];
    this.broken = false;
    this.broken_seq = 0; // bumps every time broken state flips; clients use this to play VFX
    // MOBA skill cooldowns (Date.now() timestamps; 0 = ready)
    this.cdQ = 0;
    this.cdW = 0;
    this.cdE = 0;
    this.cdR = 0;
    // Skill effect flags (used by Phases 3-5)
    this.shielded = false;
    this.invulnUntil = 0;
    this.stunnedUntil = 0;
  }
}
type('number')(Player.prototype, 'x');
type('number')(Player.prototype, 'y');
type('string')(Player.prototype, 'name');
type('uint32')(Player.prototype, 'color');
type('uint32')(Player.prototype, 'score');
type('uint16')(Player.prototype, 'combo');
type('string')(Player.prototype, 'action');
type('uint32')(Player.prototype, 'action_seq');
type('uint8')(Player.prototype, 'level');
type('uint32')(Player.prototype, 'xp');
type('uint16')(Player.prototype, 'energy');
type('uint16')(Player.prototype, 'maxEnergy');
type('uint16')(Player.prototype, 'health');
type('uint16')(Player.prototype, 'maxHealth');
type('boolean')(Player.prototype, 'broken');
type('uint32')(Player.prototype, 'broken_seq');
type('number')(Player.prototype, 'cdQ');
type('number')(Player.prototype, 'cdW');
type('number')(Player.prototype, 'cdE');
type('number')(Player.prototype, 'cdR');
type('boolean')(Player.prototype, 'shielded');
type('number')(Player.prototype, 'invulnUntil');
type('number')(Player.prototype, 'stunnedUntil');

class Bug extends Schema {
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.kind = 'bug-null';
    this.hp = 1;
    this.alive = true;
    this.hidden = false;
    this.hit_seq = 0; // bumped on every non-fatal hit so client can flash
  }
}
type('number')(Bug.prototype, 'x');
type('number')(Bug.prototype, 'y');
type('string')(Bug.prototype, 'kind');
type('uint8')(Bug.prototype, 'hp');
type('boolean')(Bug.prototype, 'alive');
type('uint32')(Bug.prototype, 'hit_seq');
type('boolean')(Bug.prototype, 'hidden');

class HealthPickup extends Schema {
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.alive = true;
  }
}
type('number')(HealthPickup.prototype, 'x');
type('number')(HealthPickup.prototype, 'y');
type('boolean')(HealthPickup.prototype, 'alive');

class ToxicCloud extends Schema {
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.expiresAt = 0; // Date.now() ms
  }
}
type('number')(ToxicCloud.prototype, 'x');
type('number')(ToxicCloud.prototype, 'y');
type('number')(ToxicCloud.prototype, 'expiresAt');

class Obstacle extends Schema {
  constructor() {
    super();
    this.x = 0; this.y = 0; this.w = 0; this.h = 0;
    this.kind = 'code-block';
    this.hp = 4;
    this.maxHp = 4;
    this.hit_seq = 0; // bumped each time the obstacle takes damage (client flash trigger)
  }
}
type('number')(Obstacle.prototype, 'x');
type('number')(Obstacle.prototype, 'y');
type('number')(Obstacle.prototype, 'w');
type('number')(Obstacle.prototype, 'h');
type('string')(Obstacle.prototype, 'kind');
type('uint8')(Obstacle.prototype, 'hp');
type('uint8')(Obstacle.prototype, 'maxHp');
type('uint32')(Obstacle.prototype, 'hit_seq');

class ArenaState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.bugs = new MapSchema();
    this.pickups = new MapSchema(); // health pickups (Personal Mode)
    this.clouds  = new MapSchema(); // toxic death clouds (Phase C)
    this.obstacles = new MapSchema(); // static map obstacles (collision rects)
    // Personal Mode is a persistent online world — no round timer, no results
    // screen, no auto-restart. `phase` stays at 'playing' forever; `timeLeftMs`
    // = -1 is the sentinel telling clients to show "infinite" instead of a
    // countdown. (Future Team Mode will live in its own room class with
    // real rounds + stages.)
    this.phase = 'playing';
    this.timeLeftMs = -1;
    this.round = 1; // session-counter; never increments in Personal Mode
    this.winnerName = '';  // unused in Personal Mode
    this.winnerScore = 0;  // unused in Personal Mode
    this.friendlyFire = true; // Personal Mode = FFA
  }
}
type({ map: Player })(ArenaState.prototype, 'players');
type({ map: Bug })(ArenaState.prototype, 'bugs');
type({ map: HealthPickup })(ArenaState.prototype, 'pickups');
type({ map: ToxicCloud })(ArenaState.prototype, 'clouds');
type({ map: Obstacle })(ArenaState.prototype, 'obstacles');
type('string')(ArenaState.prototype, 'phase');
type('int32')(ArenaState.prototype, 'timeLeftMs');
type('uint16')(ArenaState.prototype, 'round');
type('string')(ArenaState.prototype, 'winnerName');
type('uint32')(ArenaState.prototype, 'winnerScore');
type('boolean')(ArenaState.prototype, 'friendlyFire');

// 16-color palette so up to 32 players still get visually distinct hues
// (colors cycle after 16 — acceptable for a chaotic 32-player free-for-all).
const PALETTE = [
  0xff6b6b, 0x4ecdc4, 0xffd23f, 0x7ed957, 0x7ec8ff, 0xff8a3d, 0xff66ff, 0x39c2ff,
  0xb084ff, 0xff5e94, 0x00d4aa, 0xffa84a, 0x6cffb6, 0xff9bd1, 0x8aff52, 0x52d0ff,
];
// Bug catalog — distinct personalities per kind. HP / speed / spawn weight
// tuned 2026-05-31 so harder kinds are rarer + reward more score on kill.
// Phase B/C/D will layer on unique behaviors (beetle attacks, toxic cloud, robot charge).
// HP is in the UNIFIED damage domain (×12 vs the old 1–6) so a player's smash
// deals the same numbers to bugs as to players, while bug TTK is unchanged: a
// fresh Lv1 (smash 12) still needs ~1 hit on a ladybug … ~6 on a robot.
const BUG_KINDS = [
  { kind: 'bug-ladybug', hp: 12, weight: 7, speed: 35  }, // basic — most common
  { kind: 'bug-null',    hp: 24, weight: 4, speed: 45  }, // common, slightly tougher
  { kind: 'bug-race',    hp: 24, weight: 2, speed: 130 }, // speedster
  { kind: 'bug-beetle',  hp: 36, weight: 2, speed: 55  }, // tanky aggressor
  { kind: 'bug-toxic',   hp: 48, weight: 1, speed: 60  }, // tanky, faster
  { kind: 'bug-scarab',  hp: 60, weight: 1, speed: 35  }, // armored
  { kind: 'bug-robot',   hp: 72, weight: 1, speed: 75  }, // boss-tier
];
const BUG_KIND_SCORE = {
  'bug-ladybug': 5,
  'bug-null':    8,
  'bug-race':    15,
  'bug-beetle':  20,
  'bug-toxic':   25,
  'bug-scarab':  30,
  'bug-robot':   50,
};

function rollBugKind() {
  const total = BUG_KINDS.reduce((s, b) => s + b.weight, 0);
  let r = Math.random() * total;
  for (const b of BUG_KINDS) { r -= b.weight; if (r <= 0) return b; }
  return BUG_KINDS[0];
}

// ── Map obstacles ─────────────────────────────────────────────────────────
// Initial fixed layout + dynamic respawn that maintains a target count.
const OBSTACLE_LAYOUT = [
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
const OBSTACLE_TARGET = 26;       // maintain ~this many at all times
const OBSTACLE_RESPAWN_MS = 3500; // check + spawn cadence
const OBSTACLE_VARIANTS = [
  { w: 220, h:  80, kind: 'code-block' },
  { w: 320, h:  60, kind: 'code-block' },
  { w: 160, h: 100, kind: 'code-block' },
  { w: 160, h: 160, kind: 'desk' },
  { w: 200, h: 120, kind: 'desk' },
  { w: 140, h: 140, kind: 'desk' },
  { w: 180, h: 100, kind: 'whiteboard' },
  { w: 240, h:  90, kind: 'whiteboard' },
];
const OBSTACLE_MIN_DIST_FROM_PLAYER = 220; // px — don't spawn on top of someone
const OBSTACLE_PADDING = 30;               // px between obstacles

/** Does point (x, y) sit inside the given obstacle? */
function pointInRect(x, y, ob) {
  return x >= ob.x && x <= ob.x + ob.w && y >= ob.y && y <= ob.y + ob.h;
}

/** Return the first obstacle the point sits inside, or null. */
function firstObstacleAt(state, x, y) {
  let hit = null;
  state.obstacles.forEach((ob) => { if (!hit && pointInRect(x, y, ob)) hit = ob; });
  return hit;
}

/** Slide-along clamp: given a desired movement from (fromX, fromY) to (toX, toY),
 *  resolve obstacle collisions by attempting the move axis-by-axis. Returns the
 *  final position. Skips clamping entirely if `passThrough` is true. */
function clampToFreeSpace(state, fromX, fromY, toX, toY, passThrough) {
  if (passThrough) return { x: toX, y: toY };
  // Try X movement first; if it lands inside an obstacle, revert X.
  let x = toX, y = fromY;
  if (firstObstacleAt(state, x, y)) x = fromX;
  // Then try Y movement from the (possibly reverted) X.
  let y2 = toY;
  if (firstObstacleAt(state, x, y2)) y2 = fromY;
  return { x, y: y2 };
}

// ---------------- room ----------------
export class ArenaRoom extends Room {
  onCreate(_options) {
    this.maxClients = 32;
    this.setState(new ArenaState());
    this._seedObstacles();
    // Patch rate (12.5 Hz) is intentionally slower than the AI sim tick (50 ms / 20 Hz).
    // Server simulates bug movement smoothly; client lerps between snapshots.
    // Halves network traffic + client deserialize cost. Bumped from 50 → 80 ms 2026-05-30.
    this.setPatchRate(80);

    this._nextBugId = 1;
    this._nextObstacleId = 1000; // start above the seeded id range
    this._lastSpawnAt = 0;
    this._nextPickupId = 1;
    this._lastPickupSpawnAt = 0;
    this._nextCloudId = 1;
    // Off-schema: id -> nextDamageAt (so cloud doesn't damage every server tick)
    this._cloudDamageAt = new Map();
    // Off-schema bug AI bookkeeping: id -> { vx, vy, spawnedAt, headingX, headingY, hideUntil }
    this._bugAI = new Map();
    // Off-schema per-bug contact-attack cooldown: id -> nextAttackAllowed ms
    this._bugAttackCD = new Map();
    // Off-schema player bookkeeping: sessionId -> { lastKillAt }
    this._playerState = new Map();
    // Off-schema chat rate-limit: sessionId -> last chat timestamp (ms)
    this._lastChatAt = new Map();
    // Recent chat buffer so players who join later see the conversation so far.
    this._chatLog = [];
    this._chatLogMax = 30;

    this.onMessage('move', (client, msg) => {
      if (this.state.phase !== 'playing') return;
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      if (Date.now() < (p.stunnedUntil || 0)) return; // stunned — can't move
      if (typeof msg?.x === 'number' && typeof msg?.y === 'number') {
        const toX = Math.max(0, Math.min(ARENA_W, msg.x));
        const toY = Math.max(0, Math.min(ARENA_H, msg.y));
        // Slide-along obstacle collision (Phase A — map obstacles).
        // Q dash + E jump get a 350 ms pass-through window after cast.
        const passThrough = Date.now() < (p._passThroughUntil || 0);
        const out = clampToFreeSpace(this.state, p.x, p.y, toX, toY, passThrough);
        p.x = out.x;
        p.y = out.y;
      }
    });

    // ───── MOBA skill cast — energy-gated, broken-gated ─────
    this.onMessage('castSkill', (client, msg) => {
      if (this.state.phase !== 'playing') return;
      const p = this.state.players.get(client.sessionId);
      if (!p || p.broken) return;
      if (Date.now() < (p.stunnedUntil || 0)) return; // stunned — can't cast
      const slot = msg?.slot;
      if (slot !== 'q' && slot !== 'w' && slot !== 'e' && slot !== 'r') return;
      const cost = SKILL_ENERGY[slot];
      if (p.energy < cost) return;
      p.energy -= cost;

      // Animation broadcast — each slot reuses a matching pose
      const kindForAnim = (slot === 'q') ? 'punch'
                       :  (slot === 'w') ? 'parry'
                       :  (slot === 'e') ? 'jump'
                       :                   'kick';
      p.action = kindForAnim;
      p.action_seq = (p.action_seq + 1) >>> 0;
      // Q dash + E jump pass through obstacles — open a brief server-side window
      // during which 'move' handler skips the obstacle clamp.
      if (slot === 'q' || slot === 'e') {
        p._passThroughUntil = Date.now() + 350;
      }
      const animMs = (slot === 'r') ? 500 : (slot === 'w' ? 620 : 320);
      this.clock.setTimeout(() => {
        const cur = this.state.players.get(client.sessionId);
        if (cur && cur.action === kindForAnim) cur.action = 'idle';
      }, animMs);

      // ───── Phase 5: Deadline Break ult mechanic ─────
      if (slot === 'r') {
        const cx = p.x, cy = p.y;
        const r2 = ULT_RADIUS * ULT_RADIUS;
        const bugDmg = bugDamage(p, 'ult');
        const nowMs = Date.now();
        // 1. Bugs in range — damage + knockback (instant teleport)
        this.state.bugs.forEach((bug, id) => {
          if (!bug.alive || bug.hidden) return;
          const dx = bug.x - cx, dy = bug.y - cy;
          if (dx * dx + dy * dy <= r2) {
            this._applyDashHit(p, bug, id, bugDmg);
            if (bug.alive) { // only knock back survivors
              const d = Math.hypot(dx, dy) || 1;
              bug.x = Math.max(20, Math.min(ARENA_W - 20, bug.x + (dx / d) * ULT_KNOCKBACK));
              bug.y = Math.max(40, Math.min(ARENA_H - 40, bug.y + (dy / d) * ULT_KNOCKBACK));
            }
          }
        });
        // 2. Enemy players in range — damage + knockback + stun
        this.state.players.forEach((other, sid) => {
          if (sid === client.sessionId || other.broken) return;
          const dx = other.x - cx, dy = other.y - cy;
          if (dx * dx + dy * dy <= r2) {
            this._applyPvpHit(p, other, sid, 'ult');
            if (!other.broken) {
              const d = Math.hypot(dx, dy) || 1;
              other.x = Math.max(20, Math.min(ARENA_W - 20, other.x + (dx / d) * ULT_KNOCKBACK));
              other.y = Math.max(40, Math.min(ARENA_H - 40, other.y + (dy / d) * ULT_KNOCKBACK));
              other.stunnedUntil = nowMs + ULT_STUN_MS;
            }
          }
        });
      }

      // ───── Phase 4: Debug Roll mechanic ─────
      if (slot === 'e') {
        let dx = Number(msg?.dirX) || 0;
        let dy = Number(msg?.dirY) || 0;
        const dlen = Math.hypot(dx, dy);
        if (dlen < 0.01) { dx = 1; dy = 0; } else { dx /= dlen; dy /= dlen; }
        p.x = Math.max(20, Math.min(ARENA_W - 20, p.x + dx * ROLL_DISTANCE));
        p.y = Math.max(40, Math.min(ARENA_H - 40, p.y + dy * ROLL_DISTANCE));
        p.invulnUntil = Date.now() + ROLL_INVULN_MS;
      }

      // ───── Phase 3: Laptop Shield mechanic ─────
      if (slot === 'w') {
        p.shielded = true;
        const sid = client.sessionId;
        this.clock.setTimeout(() => {
          const cur = this.state.players.get(sid);
          if (cur && cur.shielded) cur.shielded = false; // natural expiry
        }, SHIELD_DURATION_MS);
      }

      // ───── Phase 2: Bug Dash mechanic — bugs + PvP along the line ─────
      if (slot === 'q') {
        let dx = Number(msg?.dirX) || 0;
        let dy = Number(msg?.dirY) || 0;
        const dlen = Math.hypot(dx, dy);
        if (dlen < 0.01) { dx = 1; dy = 0; } else { dx /= dlen; dy /= dlen; }
        const startX = p.x, startY = p.y;
        const endX = Math.max(20, Math.min(ARENA_W - 20, p.x + dx * DASH_DISTANCE));
        const endY = Math.max(40, Math.min(ARENA_H - 40, p.y + dy * DASH_DISTANCE));
        p.x = endX;
        p.y = endY;
        // Bugs in line: dash-tier unified damage (×1.5 base)
        const bugDmg = bugDamage(p, 'dash');
        this.state.bugs.forEach((bug, id) => {
          if (!bug.alive || bug.hidden) return;
          if (distToSegment(bug.x, bug.y, startX, startY, endX, endY) <= DASH_HIT_RADIUS) {
            this._applyDashHit(p, bug, id, bugDmg);
          }
        });
        // Enemy players in line: dash-tier PvP damage (rewards the energy spend)
        this.state.players.forEach((other, sid) => {
          if (sid === client.sessionId || other.broken) return;
          if (distToSegment(other.x, other.y, startX, startY, endX, endY) <= DASH_HIT_RADIUS) {
            this._applyPvpHit(p, other, sid, 'dash');
          }
        });
      }
    });

    // Action message — broadcasts a transient animation state (no target required).
    // Used for jump (movement-only) and for triggering attack poses.
    this.onMessage('action', (client, msg) => {
      if (this.state.phase !== 'playing') return;
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const a = msg?.kind;
      if (a !== 'jump' && a !== 'punch' && a !== 'kick' && a !== 'smash' && a !== 'parry') return;
      p.action = a;
      p.action_seq = (p.action_seq + 1) >>> 0;
      // Auto-clear the action after a short window so other clients return to idle
      const ms = (a === 'parry') ? 620 : (a === 'jump' ? 420 : 260);
      this.clock.setTimeout(() => {
        // Only clear if no newer action has come in
        const cur = this.state.players.get(client.sessionId);
        if (cur && cur.action === a) cur.action = 'idle';
      }, ms);
    });

    this.onMessage('smash', (client, msg) => {
      if (this.state.phase !== 'playing') return;
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      // Broken or stunned stickymen can't attack
      if (p.broken) return;
      if (Date.now() < (p.stunnedUntil || 0)) return;
      const kind = msg?.kind || 'smash';

      // Every smash also damages any obstacles within reach. Breaks open
      // "bug nests" — destroyed obstacles spawn 2–4 bugs at the rubble.
      this._trySmashObstacles(p);

      // Energy gate
      const cost = ENERGY_COST[kind] ?? 0;
      if (p.energy < cost) return;

      // Kick is an AOE spin — damages every bug within reach on both sides.
      if (kind === 'kick') {
        p.energy = Math.max(0, p.energy - cost);
        const reach = 88;
        const reach2 = reach * reach;
        const targets = [];
        this.state.bugs.forEach((bug, id) => {
          if (!bug.alive || bug.hidden) return;
          const dx = p.x - bug.x, dy = p.y - bug.y;
          if (dx * dx + dy * dy <= reach2) targets.push({ id, bug });
        });
        for (const { id, bug } of targets) {
          this._applyHit(client.sessionId, p, id, bug);
        }
        // Kick also nicks any other player within range (PvP AOE)
        this.state.players.forEach((other, sid) => {
          if (sid === client.sessionId || other.broken) return;
          const dx = p.x - other.x, dy = p.y - other.y;
          if (dx * dx + dy * dy <= reach2) this._applyPvpHit(p, other, sid);
        });
        // Energy depletion no longer triggers broken — health does. Self-attacks
        // just leave the attacker temporarily without resources to swing again.
        return;
      }

      if (msg?.targetSid) {
        const other = this.state.players.get(msg.targetSid);
        if (!other || other.broken) return;
        const dx = p.x - other.x, dy = p.y - other.y;
        const reach = (kind === 'punch') ? 112 : SMASH_RADIUS;
        if (Math.hypot(dx, dy) > reach) return;
        p.energy = Math.max(0, p.energy - cost);
        this._applyPvpHit(p, other, msg.targetSid);
        return;
      }

      const bug = this.state.bugs.get(msg?.id);
      if (!bug || !bug.alive || bug.hidden) return;
      const dx = p.x - bug.x, dy = p.y - bug.y;
      const d = Math.hypot(dx, dy);
      const reach = (kind === 'punch') ? 112 : SMASH_RADIUS;
      if (d > reach) return;

      p.energy = Math.max(0, p.energy - cost);
      this._applyHit(client.sessionId, p, msg.id, bug);
    });

    this.onMessage('setName', (client, msg) => {
      const p = this.state.players.get(client.sessionId);
      if (p && typeof msg?.name === 'string') p.name = msg.name.slice(0, 16);
    });

    // Chat — sanitize, rate-limit, broadcast, and buffer for late joiners.
    this.onMessage('chat', (client, msg) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      let text = (typeof msg?.text === 'string') ? msg.text : '';
      text = text.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 140);
      if (!text) return;
      const now = Date.now();
      const last = this._lastChatAt.get(client.sessionId) || 0;
      if (now - last < 600) return; // ~1.6 msgs/sec max — basic spam guard
      this._lastChatAt.set(client.sessionId, now);
      const name = p.name || 'anon';
      this.broadcast('chat', { sid: client.sessionId, name, text });
      this._chatLog.push({ name, text });
      if (this._chatLog.length > this._chatLogMax) this._chatLog.shift();
    });

    // A freshly-joined client requests the recent history once its handlers are
    // wired up (requesting avoids a race with onJoin message delivery).
    this.onMessage('getChatHistory', (client) => {
      if (this._chatLog.length) client.send('chatHistory', this._chatLog);
    });

    this.setSimulationInterval((dt) => this._tick(dt));
    console.log('[ArenaRoom] created', this.roomId);
  }

  // -------- simulation tick --------
  _tick(dtMs) {
    // Personal Mode: never decrement timeLeftMs (stays at -1 sentinel) and
    // never leave 'playing' phase. Tick always runs the playing-phase code.
    if (this.state.phase === 'playing') {
      // Spawn cadence — slows when many players are around (because their
      // bug-drops on defeat are seeding the map for us).
      this._lastSpawnAt += dtMs;
      const aliveBugs = this._countAliveBugs();
      const playerCount = this.state.players.size;
      const spawnDelay = playerCount > 4 ? 850 : SPAWN_EVERY_MS;
      if (aliveBugs < MAX_BUGS && this._lastSpawnAt > spawnDelay) {
        this._lastSpawnAt = 0;
        this._spawnBug();
      }

      // Per-player ticks: combo decay + energy regen + pickup collection
      const now = Date.now();
      const dtSec = dtMs / 1000;
      this.state.players.forEach((p, sid) => {
        const ps = this._playerState.get(sid);
        if (p.combo > 0 && ps && (now - ps.lastKillAt) > COMBO_TIMEOUT_MS) {
          p.combo = 0;
        }
        if (!p.broken && p.energy < p.maxEnergy) {
          p.energy = Math.min(p.maxEnergy, p.energy + ENERGY_REGEN_PER_SEC * dtSec);
        }
        // Pickup overlap (broken players skip — proposal §Recovery Restrictions)
        if (!p.broken) this._tryCollectPickups(p);
      });

      // Health pickup spawn cadence — maintain PICKUP_TARGET_COUNT alive
      this._lastPickupSpawnAt += dtMs;
      if (this.state.pickups.size < PICKUP_TARGET_COUNT && this._lastPickupSpawnAt > PICKUP_RESPAWN_MS) {
        this._lastPickupSpawnAt = 0;
        this._spawnPickup();
      }

      // Bug AI + movement
      const dt = dtMs / 1000;
      const players = [];
      this.state.players.forEach((p, sid) => players.push({ p, sid }));
      const wallNow = Date.now();

      this.state.bugs.forEach((bug, id) => {
        if (!bug.alive) return;
        const ai = this._bugAI.get(id);
        if (!ai) return;

        // Expire 'hidden' state — bug pops back into play
        if (bug.hidden && ai.hideUntil && now > ai.hideUntil) {
          bug.hidden = false;
          ai.hideUntil = 0;
        }
        // Hidden bugs don't move + can't be hit
        if (bug.hidden) return;

        // Find nearest non-broken player (target for pursuit + flee reference)
        let nearest = null, nearestSid = null, nearestD2 = Infinity;
        for (const { p, sid } of players) {
          if (p.broken) continue;
          const dx = p.x - bug.x, dy = p.y - bug.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < nearestD2) { nearestD2 = d2; nearest = p; nearestSid = sid; }
        }

        const attackCfg = BUG_ATTACK[bug.kind];
        const nearestD = Math.sqrt(nearestD2);

        // ───── Aggressive AI (beetle, robot) ─────
        if (attackCfg && nearest && nearestD < attackCfg.aggro) {
          // Contact damage when in reach + cooldown elapsed
          if (nearestD < attackCfg.reach) {
            const cdAt = this._bugAttackCD.get(id) || 0;
            if (wallNow >= cdAt) {
              this._bugAttackCD.set(id, wallNow + attackCfg.cooldownMs);
              this._applyBugContactDamage(nearest, nearestSid, attackCfg.dmg);
            }
          }
          // Pursue: head straight at the target (robot skips lerp for relentless feel)
          const px = nearest.x - bug.x, py = nearest.y - bug.y;
          const pl = Math.hypot(px, py) || 1;
          const tx = px / pl, ty = py / pl;
          if (bug.kind === 'bug-robot') {
            ai.headingX = tx; ai.headingY = ty;
          } else {
            ai.headingX += (tx - ai.headingX) * Math.min(1, TURN_LERP * dt);
            ai.headingY += (ty - ai.headingY) * Math.min(1, TURN_LERP * dt);
          }
          const hl = Math.hypot(ai.headingX, ai.headingY) || 1;
          ai.headingX /= hl; ai.headingY /= hl;
          const chaseSpeed = ai.baseSpeed * attackCfg.chaseMul;
          const _ox = bug.x, _oy = bug.y;
          const _nx = bug.x + ai.headingX * chaseSpeed * dt;
          const _ny = bug.y + ai.headingY * chaseSpeed * dt;
          const _c = clampToFreeSpace(this.state, _ox, _oy, _nx, _ny, false);
          bug.x = _c.x; bug.y = _c.y;
          // Wall clamp + age check still apply below
          if (bug.x < 30)         { bug.x = 30; ai.headingX = Math.abs(ai.headingX); }
          if (bug.x > ARENA_W-30) { bug.x = ARENA_W - 30; ai.headingX = -Math.abs(ai.headingX); }
          if (bug.y < 60)         { bug.y = 60; ai.headingY = Math.abs(ai.headingY); }
          if (bug.y > ARENA_H-60) { bug.y = ARENA_H - 60; ai.headingY = -Math.abs(ai.headingY); }
          if (Date.now() - ai.spawnedAt > BUG_LIFETIME_MS) {
            this.state.bugs.delete(id);
            this._bugAI.delete(id);
            this._bugAttackCD.delete(id);
            this._bugAttackCD.delete(id);
          }
          return; // skip the flee/wander block below
        }

        // ───── Default flee/wander ─────
        const fleeR2 = FLEE_RADIUS_PX * FLEE_RADIUS_PX;
        let tx, ty, speed;
        if (nearest && nearestD2 < fleeR2) {
          const dx = bug.x - nearest.x, dy = bug.y - nearest.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          tx = dx / d; ty = dy / d;
          speed = ai.baseSpeed * FLEE_SPEED_MUL;
        } else {
          ai.nextWanderAt -= dtMs;
          if (ai.nextWanderAt <= 0) {
            const a = Math.random() * Math.PI * 2;
            ai.wanderX = Math.cos(a);
            ai.wanderY = Math.sin(a);
            ai.nextWanderAt = 1500 + Math.random() * 1500;
          }
          tx = ai.wanderX; ty = ai.wanderY;
          speed = ai.baseSpeed * 0.6;
        }

        // Lerp heading toward target dir for smoother motion
        ai.headingX = ai.headingX + (tx - ai.headingX) * Math.min(1, TURN_LERP * dt);
        ai.headingY = ai.headingY + (ty - ai.headingY) * Math.min(1, TURN_LERP * dt);
        const hl = Math.hypot(ai.headingX, ai.headingY) || 1;
        ai.headingX /= hl; ai.headingY /= hl;

        // Apply movement (obstacle-clamped)
        const _ox = bug.x, _oy = bug.y;
        const _nx = bug.x + ai.headingX * speed * dt;
        const _ny = bug.y + ai.headingY * speed * dt;
        const _c = clampToFreeSpace(this.state, _ox, _oy, _nx, _ny, false);
        bug.x = _c.x; bug.y = _c.y;
        // Bounce off arena walls
        if (bug.x < 30)         { bug.x = 30; ai.headingX = Math.abs(ai.headingX); }
        if (bug.x > ARENA_W-30) { bug.x = ARENA_W - 30; ai.headingX = -Math.abs(ai.headingX); }
        if (bug.y < 60)         { bug.y = 60; ai.headingY = Math.abs(ai.headingY); }
        if (bug.y > ARENA_H-60) { bug.y = ARENA_H - 60; ai.headingY = -Math.abs(ai.headingY); }

        // Aging
        if (Date.now() - ai.spawnedAt > BUG_LIFETIME_MS) {
          this.state.bugs.delete(id);
          this._bugAI.delete(id);
          this._bugAttackCD.delete(id);
        }
      });

      // ───── Toxic clouds (Phase C) ─────
      const r2Cloud = TOXIC_CLOUD_RADIUS * TOXIC_CLOUD_RADIUS;
      this.state.clouds.forEach((cloud, cid) => {
        if (wallNow >= cloud.expiresAt) {
          this.state.clouds.delete(cid);
          this._cloudDamageAt.delete(cid);
          return;
        }
        const nextAt = this._cloudDamageAt.get(cid) || 0;
        if (wallNow >= nextAt) {
          this._cloudDamageAt.set(cid, wallNow + TOXIC_CLOUD_TICK_MS);
          this.state.players.forEach((p, sid) => {
            if (p.broken) return;
            const dx = p.x - cloud.x, dy = p.y - cloud.y;
            if (dx * dx + dy * dy <= r2Cloud) {
              this._applyBugContactDamage(p, sid, TOXIC_CLOUD_DAMAGE);
            }
          });
        }
      });

      // ───── Obstacle respawn — keep at OBSTACLE_TARGET ─────
      this._obstacleRespawnTimer = (this._obstacleRespawnTimer || 0) + dtMs;
      if (this._obstacleRespawnTimer >= OBSTACLE_RESPAWN_MS) {
        this._obstacleRespawnTimer = 0;
        if (this.state.obstacles.size < OBSTACLE_TARGET) {
          this._spawnRandomObstacle();
        }
      }

      // ───── Bugs eat nearby obstacles ─────
      // Each bug in range contributes per-kind eat-rate. Ladybugs munch 2x
      // (they're the swarm-eater). Damage capped per tick so a single chomp
      // can't fully break a heavy obstacle on its own.
      this._bugEatTimer = (this._bugEatTimer || 0) + dtMs;
      if (this._bugEatTimer >= BUG_EAT_INTERVAL_MS) {
        this._bugEatTimer = 0;
        const eatR2 = BUG_EAT_RADIUS * BUG_EAT_RADIUS;
        const toBreak = [];
        this.state.obstacles.forEach((ob, id) => {
          let dmg = 0;
          this.state.bugs.forEach((bug) => {
            if (!bug.alive || bug.hidden) return;
            const cx = Math.max(ob.x, Math.min(bug.x, ob.x + ob.w));
            const cy = Math.max(ob.y, Math.min(bug.y, ob.y + ob.h));
            const dx = bug.x - cx, dy = bug.y - cy;
            if (dx * dx + dy * dy <= eatR2) {
              dmg += (bug.kind === 'bug-ladybug') ? LADYBUG_EAT_BONUS : 1;
            }
          });
          if (dmg > 0) {
            dmg = Math.min(MAX_EAT_PER_TICK, dmg);
            ob.hp = Math.max(0, ob.hp - dmg);
            ob.hit_seq = (ob.hit_seq + 1) >>> 0;
            if (ob.hp <= 0) toBreak.push({ id, x: ob.x + ob.w / 2, y: ob.y + ob.h / 2 });
          }
        });
        for (const t of toBreak) {
          this.state.obstacles.delete(t.id);
          const count = 2 + Math.floor(Math.random() * 3);
          for (let n = 0; n < count; n++) {
            const a = Math.random() * Math.PI * 2;
            const r = 24 + Math.random() * 36;
            this._spawnBugAt(t.x + Math.cos(a) * r, t.y + Math.sin(a) * r);
          }
        }
      }

      // Personal Mode: no round-end check. World runs forever.
    }
    // (no 'results' branch — Personal Mode never reaches that phase)
  }

  /** Spawn one new obstacle at a randomly-chosen safe position.
   *  Tries up to N times to avoid overlapping other obstacles + players. */
  _spawnRandomObstacle() {
    const variant = OBSTACLE_VARIANTS[Math.floor(Math.random() * OBSTACLE_VARIANTS.length)];
    const w = variant.w, h = variant.h;
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = 120 + Math.random() * (ARENA_W - w - 240);
      const y = 120 + Math.random() * (ARENA_H - h - 240);
      // Reject overlap with existing obstacles (with padding)
      let overlap = false;
      this.state.obstacles.forEach((other) => {
        if (overlap) return;
        if (x < other.x + other.w + OBSTACLE_PADDING &&
            x + w + OBSTACLE_PADDING > other.x &&
            y < other.y + other.h + OBSTACLE_PADDING &&
            y + h + OBSTACLE_PADDING > other.y) overlap = true;
      });
      if (overlap) continue;
      // Reject if any player is too close (don't drop it on their head)
      let tooClose = false;
      const cx = x + w / 2, cy = y + h / 2;
      const minD2 = OBSTACLE_MIN_DIST_FROM_PLAYER * OBSTACLE_MIN_DIST_FROM_PLAYER;
      this.state.players.forEach((p) => {
        if (tooClose) return;
        const dx = p.x - cx, dy = p.y - cy;
        if (dx * dx + dy * dy < minD2) tooClose = true;
      });
      if (tooClose) continue;
      // Good spot — commit
      const ob = new Obstacle();
      ob.x = x; ob.y = y; ob.w = w; ob.h = h; ob.kind = variant.kind;
      ob.maxHp = 4; ob.hp = 4;
      this.state.obstacles.set('ob' + (this._nextObstacleId++), ob);
      return true;
    }
    return false; // gave up — try again next tick
  }

  /** Seed the static map obstacles into state. Called once on room create. */
  _seedObstacles() {
    let i = 0;
    for (const def of OBSTACLE_LAYOUT) {
      const ob = new Obstacle();
      ob.x = def.x; ob.y = def.y; ob.w = def.w; ob.h = def.h; ob.kind = def.kind;
      ob.maxHp = 4;
      ob.hp = ob.maxHp;
      this.state.obstacles.set('ob' + (i++), ob);
    }
  }

  /** Player smashed near an obstacle — damage it. On break, delete + emerge bugs. */
  _trySmashObstacles(p) {
    if (!p) return;
    const reach = 110; // a bit larger than SMASH_RADIUS to make obstacle hits feel generous
    const reach2 = reach * reach;
    const toBreak = [];
    this.state.obstacles.forEach((ob, id) => {
      // Distance from player to nearest point on obstacle rect
      const cx = Math.max(ob.x, Math.min(p.x, ob.x + ob.w));
      const cy = Math.max(ob.y, Math.min(p.y, ob.y + ob.h));
      const dx = p.x - cx, dy = p.y - cy;
      if (dx * dx + dy * dy <= reach2) {
        ob.hp = Math.max(0, ob.hp - 1);
        ob.hit_seq = (ob.hit_seq + 1) >>> 0;
        if (ob.hp <= 0) toBreak.push({ id, x: ob.x + ob.w / 2, y: ob.y + ob.h / 2 });
      }
    });
    for (const t of toBreak) {
      this.state.obstacles.delete(t.id);
      // Crack open the bug nest — 2 to 4 bugs emerge at the obstacle position
      const count = 2 + Math.floor(Math.random() * 3);
      for (let n = 0; n < count; n++) {
        const a = Math.random() * Math.PI * 2;
        const r = 24 + Math.random() * 36;
        this._spawnBugAt(t.x + Math.cos(a) * r, t.y + Math.sin(a) * r);
      }
    }
  }

  // NOTE: _enterResults and _enterPlaying below are unused in Personal Mode
  // (no round flow). They're kept as a reference for the Team Mode room class
  // we'll create in Phase C.
  _enterResults() {
    this.state.phase = 'results';
    this.state.timeLeftMs = PHASE_RESULTS_MS;
    // Find the winner
    let best = null;
    this.state.players.forEach((p) => {
      if (!best || p.score > best.score) best = p;
    });
    this.state.winnerName  = best?.name  || '—';
    this.state.winnerScore = best?.score || 0;
    console.log(`[ArenaRoom] round ${this.state.round} end — winner "${this.state.winnerName}" score ${this.state.winnerScore}`);
  }

  _enterPlaying() {
    this.state.phase = 'playing';
    this.state.timeLeftMs = PHASE_PLAYING_MS;
    this.state.round += 1;
    // Reset scores; clear bugs
    this.state.players.forEach((p) => {
      p.score = 0; p.combo = 0; p.action = 'idle';
      p.level = 1; p.xp = 0;
      p.maxEnergy = LEVEL_MAX_ENERGY[0];
      p.energy = p.maxEnergy;
      p.maxHealth = LEVEL_MAX_HEALTH[0];
      p.health = p.maxHealth;
      p.broken = false;
    });
    this._playerState.forEach((ps) => { ps.lastKillAt = 0; });
    this.state.bugs.forEach((_, id) => this.state.bugs.delete(id));
    this._bugAI.clear();
    this._lastSpawnAt = 0;
    this.state.pickups.forEach((_, id) => this.state.pickups.delete(id));
    this._lastPickupSpawnAt = 0;
    this.state.clouds.forEach((_, id) => this.state.clouds.delete(id));
    this._cloudDamageAt.clear();
    console.log(`[ArenaRoom] round ${this.state.round} begin`);
  }

  /** Apply one hit to a bug from a player. Shared by all attack kinds. */
  _applyHit(sessionId, p, bugId, bug) {
    // Clamp at 0 — bug.hp is uint8, and a big hit (e.g. an ult) can exceed
    // remaining HP; an unclamped negative would wrap on serialization and break
    // the client's damage-number delta on the killing blow.
    bug.hp = Math.max(0, bug.hp - bugDamage(p, 'smash'));
    bug.hit_seq = (bug.hit_seq + 1) >>> 0;
    if (bug.hp <= 0) {
      const ps = this._playerState.get(sessionId);
      const now = Date.now();
      if (ps && (now - ps.lastKillAt) < COMBO_TIMEOUT_MS) {
        p.combo = Math.min(99, (p.combo | 0) + 1);
      } else {
        p.combo = 1;
      }
      if (ps) ps.lastKillAt = now;
      const base = BUG_KIND_SCORE[bug.kind] ?? 10;
      const mult = comboMult(p.combo);
      const gain = Math.round(base * mult);
      p.score += gain;
      p.xp += gain;
      // Level up?
      const newLevel = levelFromXP(p.xp);
      if (newLevel !== p.level) {
        p.level = newLevel;
        // Bump max energy + max health + top up by the increment (don't fully refill)
        const newMaxE = maxEnergyForLevel(newLevel);
        const incE = Math.max(0, newMaxE - p.maxEnergy);
        p.maxEnergy = newMaxE;
        p.energy = Math.min(p.maxEnergy, p.energy + incE);
        const newMaxH = maxHealthForLevel(newLevel);
        const incH = Math.max(0, newMaxH - p.maxHealth);
        p.maxHealth = newMaxH;
        p.health = Math.min(p.maxHealth, p.health + incH);
      }
      bug.alive = false;
      if (bug.kind === 'bug-toxic') this._spawnToxicCloud(bug.x, bug.y);
      this.clock.setTimeout(() => {
        this.state.bugs.delete(bugId);
        this._bugAI.delete(bugId);
        this._bugAttackCD.delete(bugId);
      }, 400);
    }
    // (dive-on-survive disabled for MP — was making lock-on chase frustrating)
  }

  /** Apply dash damage to a bug along the dash path. Like _applyHit but with custom dmg. */
  _applyDashHit(p, bug, bugId, dmg) {
    bug.hp = Math.max(0, bug.hp - dmg); // clamp (uint8) — see _applyHit note
    bug.hit_seq = (bug.hit_seq + 1) >>> 0;
    if (bug.hp <= 0) {
      const ps = this._playerState.get(p === this.state.players.get(p)) ? null : null; // never null path
      // Find sessionId for this player to update kill bookkeeping
      let foundSid = null;
      this.state.players.forEach((pp, sid) => { if (pp === p) foundSid = sid; });
      if (foundSid) {
        const psr = this._playerState.get(foundSid);
        const now = Date.now();
        if (psr && (now - psr.lastKillAt) < COMBO_TIMEOUT_MS) p.combo = Math.min(99, (p.combo | 0) + 1);
        else p.combo = 1;
        if (psr) psr.lastKillAt = now;
      }
      const base = BUG_KIND_SCORE[bug.kind] ?? 10;
      const gain = Math.round(base * comboMult(p.combo));
      p.score += gain;
      p.xp += gain;
      const newLevel = levelFromXP(p.xp);
      if (newLevel !== p.level) {
        p.level = newLevel;
        const newMaxE = maxEnergyForLevel(newLevel);
        p.maxEnergy = newMaxE;
        const newMaxH = maxHealthForLevel(newLevel);
        p.maxHealth = newMaxH;
      }
      bug.alive = false;
      if (bug.kind === 'bug-toxic') this._spawnToxicCloud(bug.x, bug.y);
      this.clock.setTimeout(() => {
        this.state.bugs.delete(bugId);
        this._bugAI.delete(bugId);
        this._bugAttackCD.delete(bugId);
      }, 400);
    }
  }

  _spawnToxicCloud(x, y) {
    const id = 'c' + (this._nextCloudId++);
    const cloud = new ToxicCloud();
    cloud.x = x;
    cloud.y = y;
    cloud.expiresAt = Date.now() + TOXIC_CLOUD_LIFETIME;
    this.state.clouds.set(id, cloud);
    this._cloudDamageAt.set(id, Date.now() + TOXIC_CLOUD_TICK_MS);
  }

  /** Apply contact damage from an aggressive bug to a player. Respects shield + roll-invuln. */
  _applyBugContactDamage(victim, vSid, dmg) {
    if (victim.broken) return;
    if (Date.now() < (victim.invulnUntil || 0)) return;
    if (victim.shielded) { victim.shielded = false; return; }
    victim.health = Math.max(0, victim.health - dmg);
    if (victim.health === 0) this._enterBroken(victim, vSid);
  }

  /** Apply ult health damage to a player. Respects roll-invuln + shield. */
  /**
   * Apply PvP health damage from attacker p to victim other (sessionId vSid).
   * `source` selects the skill multiplier: 'smash' (basic + punch/kick),
   * 'dash' (Q Bug Dash), or 'ult' (R Deadline Break). Damage also scales by the
   * level matchup — see the PvP damage model near the top of the file.
   */
  _applyPvpHit(p, other, vSid, source = 'smash') {
    if (other.broken) return;
    // Debug Roll invulnerability window — drop the hit completely (no consume cost).
    if (Date.now() < (other.invulnUntil || 0)) return;
    // Laptop Shield absorbs the next PvP hit completely and consumes itself.
    if (other.shielded) {
      other.shielded = false;
      return;
    }
    const dmg = pvpDamage(p, other, source);
    other.health = Math.max(0, other.health - dmg);
    if (other.health === 0) this._enterBroken(other, vSid);
  }

  _enterBroken(p, sessionId) {
    if (p.broken) return;
    const wasLevel = p.level; // remember before reset, used for bug-drop count
    const wasScore = p.score; // total points earned this life — drives bug drop count
    p.broken = true;
    p.broken_seq = (p.broken_seq + 1) >>> 0;
    // Reset progression. Health + energy fully restore on exit; while broken
    // they sit at 0 (visible empty bars) so the recovery beat reads clearly.
    p.level = 1;
    p.xp = 0;
    p.maxEnergy = LEVEL_MAX_ENERGY[0];
    p.maxHealth = LEVEL_MAX_HEALTH[0];
    p.energy = 0;
    p.health = 0;
    p.combo = 0;
    p.action = 'parry'; // re-use parry pose as "fixing laptop"
    p.action_seq = (p.action_seq + 1) >>> 0;
    // Skill cooldowns + status flags reset on broken (consistent with level reset)
    p.cdQ = 0; p.cdW = 0; p.cdE = 0; p.cdR = 0;
    p.shielded = false;
    p.invulnUntil = 0;
    p.stunnedUntil = 0;

    // Personal Mode only: defeated players spew bugs onto the map. Drop
    // count scales with the SCORE earned this life. Score then RESETS to
    // zero — death wipes your point bank in Personal Mode. (Team Mode keeps
    // score across deaths because that's how round-based scoring works.)
    if (this.state.friendlyFire) {
      const dropCount = Math.min(10, 2 + Math.floor(wasScore / 50));
      for (let i = 0; i < dropCount; i++) {
        const angle = (Math.PI * 2 * i) / dropCount + Math.random() * 0.6;
        const radius = 30 + Math.random() * 60;
        const dx = Math.cos(angle) * radius;
        const dy = Math.sin(angle) * radius;
        this._spawnBugAt(p.x + dx, p.y + dy);
      }
      p.score = 0; // wipe points on defeat (Personal Mode only)
    }

    const sid = sessionId;
    this.clock.setTimeout(() => {
      const cur = this.state.players.get(sid);
      if (cur && cur.broken) this._exitBroken(cur);
    }, BROKEN_DURATION_MS);
  }

  /** Maintain pickup pool — spawns at a random world position (avoids obstacles). */
  _spawnPickup() {
    const id = String(this._nextPickupId++);
    const h = new HealthPickup();
    let px = 0, py = 0;
    for (let i = 0; i < 6; i++) {
      px = 80 + Math.random() * (ARENA_W - 160);
      py = 100 + Math.random() * (ARENA_H - 200);
      if (!firstObstacleAt(this.state, px, py)) break;
    }
    h.x = px; h.y = py;
    h.alive = true;
    this.state.pickups.set(id, h);
  }

  /** Check player vs all pickups; collect any within range. Pickups restore HEALTH + ENERGY. */
  _tryCollectPickups(p) {
    // Skip if at max on BOTH bars — pickup persists for someone who needs it
    if (p.health >= p.maxHealth && p.energy >= p.maxEnergy) return;
    const r2 = (PICKUP_RADIUS + PLAYER_PICKUP_RADIUS) ** 2;
    this.state.pickups.forEach((h, id) => {
      if (!h.alive) return;
      const dx = p.x - h.x, dy = p.y - h.y;
      if (dx * dx + dy * dy <= r2) {
        p.health = Math.min(p.maxHealth, p.health + PICKUP_ENERGY_GAIN);   // +40 HP
        p.energy = Math.min(p.maxEnergy, p.energy + 25);                    // +25 energy
        h.alive = false;
        this.clock.setTimeout(() => this.state.pickups.delete(id), 300);
      }
    });
  }

  /** Spawn a bug at a specific world position (used by bug-drop on defeat). */
  _spawnBugAt(x, y) {
    const id = String(this._nextBugId++);
    const def = rollBugKind();
    const b = new Bug();
    b.kind = def.kind;
    b.hp = def.hp;
    b.alive = true;
    b.x = Math.max(40, Math.min(ARENA_W - 40, x));
    b.y = Math.max(60, Math.min(ARENA_H - 60, y));
    this.state.bugs.set(id, b);
    this._bugAI.set(id, {
      baseSpeed: def.speed,
      headingX: 0, headingY: 0,
      wanderX: 0, wanderY: 0,
      nextWanderAt: 0,
      spawnedAt: Date.now(),
    });
  }

  _exitBroken(p) {
    p.broken = false;
    p.broken_seq = (p.broken_seq + 1) >>> 0;
    p.energy = p.maxEnergy;
    p.health = p.maxHealth;
    p.action = 'idle';
    p.action_seq = (p.action_seq + 1) >>> 0;
  }

  _countAliveBugs() {
    let n = 0;
    this.state.bugs.forEach((b) => { if (b.alive) n++; });
    return n;
  }

  _spawnBug() {
    const id = String(this._nextBugId++);
    const def = rollBugKind();
    const b = new Bug();
    b.kind = def.kind;
    b.hp = def.hp;
    b.alive = true;
    // Retry up to 6 times to avoid spawning inside an obstacle
    let bx = 0, by = 0;
    for (let i = 0; i < 6; i++) {
      bx = 60 + Math.random() * (ARENA_W - 120);
      by = 80 + Math.random() * (ARENA_H - 160);
      if (!firstObstacleAt(this.state, bx, by)) break;
    }
    b.x = bx; b.y = by;
    this.state.bugs.set(id, b);
    this._bugAI.set(id, {
      baseSpeed: def.speed,
      headingX: 0, headingY: 0,
      wanderX: 0, wanderY: 0,
      nextWanderAt: 0,
      spawnedAt: Date.now(),
    });
  }

  onJoin(client, options) {
    const p = new Player();
    p.name  = (options?.name || 'guest').slice(0, 16);
    p.color = PALETTE[this.state.players.size % PALETTE.length];
    const jitter = 80;
    p.x = ARENA_W / 2 + (Math.random() - 0.5) * jitter * 2;
    p.y = ARENA_H / 2 + (Math.random() - 0.5) * jitter * 2;
    this.state.players.set(client.sessionId, p);
    this._playerState.set(client.sessionId, { lastKillAt: 0 });
    console.log(`[ArenaRoom] +join ${client.sessionId} as "${p.name}" (now ${this.state.players.size})`);
  }

  onLeave(client, _consented) {
    this.state.players.delete(client.sessionId);
    this._playerState.delete(client.sessionId);
    this._lastChatAt.delete(client.sessionId);
    console.log(`[ArenaRoom] -leave ${client.sessionId} (now ${this.state.players.size})`);
  }

  onDispose() {
    console.log('[ArenaRoom] disposed', this.roomId);
  }
}

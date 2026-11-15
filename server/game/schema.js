// schema.js — synced state for the MP arena (Colyseus @colyseus/schema v3).
// The JS client decodes via reflection, so new fields only need adding here.
// Keep NEW fields at the END of each class (field order = wire index).
import { Schema, MapSchema, type } from '@colyseus/schema';
import { ARENA_W, ARENA_H, LEVEL_MAX_ENERGY, LEVEL_MAX_HEALTH } from './rules.js';

export class Player extends Schema {
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
    // Skill effect flags
    this.shielded = false;
    this.invulnUntil = 0;
    this.stunnedUntil = 0;
    // Office Chaos update
    this.isBot = false; // AI coworker (shown with a BOT tag)
    this.hat = '';      // cosmetic id from src/data/cosmetics.js ('' = none)
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
type('boolean')(Player.prototype, 'isBot');
type('string')(Player.prototype, 'hat');

export class Bug extends Schema {
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

export class HealthPickup extends Schema {
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

export class ToxicCloud extends Schema {
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

export class Obstacle extends Schema {
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

/** The Deadline — co-op world boss (lives in ArenaState.bosses while out). */
export class Boss extends Schema {
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.hp = 1;
    this.maxHp = 1;
    this.phase = 1;
    this.alive = true;
    this.kind = 'deadline';
    this.hit_seq = 0;
  }
}
type('number')(Boss.prototype, 'x');
type('number')(Boss.prototype, 'y');
type('uint16')(Boss.prototype, 'hp');
type('uint16')(Boss.prototype, 'maxHp');
type('uint8')(Boss.prototype, 'phase');
type('boolean')(Boss.prototype, 'alive');
type('string')(Boss.prototype, 'kind');
type('uint32')(Boss.prototype, 'hit_seq');

export class ArenaState extends Schema {
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
    // countdown. (Future Team Mode will live in its own room class.)
    this.phase = 'playing';
    this.timeLeftMs = -1;
    this.round = 1; // session-counter; never increments in Personal Mode
    this.winnerName = '';  // unused in Personal Mode
    this.winnerScore = 0;  // unused in Personal Mode
    this.friendlyFire = true; // Personal Mode = FFA
    // Office Chaos update
    this.bosses = new MapSchema(); // 0 or 1 entries ('deadline')
    this.event = '';               // active world event id ('' = none)
    this.eventLeftMs = 0;
    this.eventTotalMs = 0;
    this.crownSid = '';            // top scorer = Tech Lead, wears the crown
    this.bounty = 0;               // XP for whoever breaks the crown holder
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
type({ map: Boss })(ArenaState.prototype, 'bosses');
type('string')(ArenaState.prototype, 'event');
type('int32')(ArenaState.prototype, 'eventLeftMs');
type('int32')(ArenaState.prototype, 'eventTotalMs');
type('string')(ArenaState.prototype, 'crownSid');
type('uint16')(ArenaState.prototype, 'bounty');

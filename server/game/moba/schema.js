// server/game/moba/schema.js — synced state for Team Mode ("Office Siege").
// FROZEN CONTRACT: .claude/context/tasks/TEAM_MODE_BREAKDOWN.md §3.1 (+ V2/V3/V4 appends) — field
// names, types and order follow it exactly. Keep NEW fields at the END of a
// class (field order = wire index) and only after a contract change.
//
// The simulation keeps its own float-precision records (TeamRoom.champs /
// units / structs); these schema objects are a rounded mirror written once per
// tick by TeamRoom._sync*(). Never store gameplay-only data here.
import { Schema, MapSchema, ArraySchema, type, view } from '@colyseus/schema';

/** state.champions — key = sessionId (humans) | 'bot_N' (bots). */
export class TeamChamp extends Schema {
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.team = 'blue';        // 'blue' | 'red'
    this.champ = '';           // champions.js id
    this.name = '';
    this.isBot = false;
    this.level = 3;
    this.xp = 660;
    this.gold = 0;
    this.hp = 1;
    this.maxHp = 1;
    this.mana = 0;
    this.maxMana = 0;
    this.ad = 0;
    this.ap = 0;
    this.armor = 0;
    this.ms = 0;
    this.range = 0;
    this.as = 0;               // attacks per second (current total)
    this.dead = false;
    this.respawnAt = 0;        // server ms (Date.now())
    this.kills = 0;
    this.deaths = 0;
    this.assists = 0;
    this.cs = 0;
    this.items = new ArraySchema('', '', '', '', '', ''); // always 6, '' = empty
    this.cdQ = 0;              // server ms when ready; 0 = ready
    this.cdW = 0;
    this.cdE = 0;
    this.cdR = 0;
    this.stunnedUntil = 0;
    this.rootedUntil = 0;
    this.slowUntil = 0;
    this.slowPct = 0;          // 0–100
    this.shield = 0;
    this.buffs = '';           // comma tags: q,w,e,r,deadline,recall,coffee,ghost,ignited
    this.recallUntil = 0;      // 0 = not recalling
    this.action = 'idle';      // last action: idle|attack|q|w|e|r|recall|dead
    this.action_seq = 0;       // bumped on every action (animation trigger)
    this.targetId = '';        // current auto-attack target ('' = none)
    // v3 "Draft Day" (appended — wire indexes after targetId)
    this.locked = false;       // champion select: pick locked in
    this.spellD = '';          // summoner spell ids (shared/moba/spells.js)
    this.spellF = '';
    this.cdD = 0;              // server ms when ready; 0 = ready (no haste)
    this.cdF = 0;
    // v4 "Bushes" (appended): bush id the champion stands in ('' = none). Enemies never
    // receive a champion that is hidden in a bush (StateView), so in practice only the
    // own team sees a non-empty value (→ "you are hidden" tint).
    this.inBush = '';
    // Experience Pass 1 (appended): cosmetic hat id (server/data/cosmetics.js allowlist, '' = none).
    this.hat = '';
    // Pass 2 (appended): rank badge label ('🎖️ Senior II' / '🆕 Unranked' / '' for bots) and the
    // quick-play lobby ready flag (RP-06 START NOW).
    this.rank = '';
    this.ready = false;
    this.augmentsCsv = '';     // comma-separated augment ids (primitive string avoids StateView ArraySchema refId bug)
    this.augmentOfferJson = '';
    this.skillPoints = 0;
    this.rankQ = 1;
    this.rankW = 1;
    this.rankE = 1;
    this.rankR = 0;
  }
}
// v4 optimisation: positions are integers inside the map (0…6000) → uint16 on the wire
// (2 bytes instead of 3). Clients decode through Reflection, so nothing changes for them.
type('uint16')(TeamChamp.prototype, 'x');
type('uint16')(TeamChamp.prototype, 'y');
type('string')(TeamChamp.prototype, 'team');
type('string')(TeamChamp.prototype, 'champ');
type('string')(TeamChamp.prototype, 'name');
type('boolean')(TeamChamp.prototype, 'isBot');
type('uint8')(TeamChamp.prototype, 'level');
type('uint32')(TeamChamp.prototype, 'xp');
type('uint32')(TeamChamp.prototype, 'gold');
type('uint16')(TeamChamp.prototype, 'hp');
type('uint16')(TeamChamp.prototype, 'maxHp');
type('uint16')(TeamChamp.prototype, 'mana');
type('uint16')(TeamChamp.prototype, 'maxMana');
type('uint16')(TeamChamp.prototype, 'ad');
type('uint16')(TeamChamp.prototype, 'ap');
type('uint16')(TeamChamp.prototype, 'armor');
type('uint16')(TeamChamp.prototype, 'ms');
type('uint16')(TeamChamp.prototype, 'range');
type('number')(TeamChamp.prototype, 'as');
type('boolean')(TeamChamp.prototype, 'dead');
type('number')(TeamChamp.prototype, 'respawnAt');
type('uint16')(TeamChamp.prototype, 'kills');
type('uint16')(TeamChamp.prototype, 'deaths');
type('uint16')(TeamChamp.prototype, 'assists');
type('uint16')(TeamChamp.prototype, 'cs');
type(['string'])(TeamChamp.prototype, 'items');
type('number')(TeamChamp.prototype, 'cdQ');
type('number')(TeamChamp.prototype, 'cdW');
type('number')(TeamChamp.prototype, 'cdE');
type('number')(TeamChamp.prototype, 'cdR');
type('number')(TeamChamp.prototype, 'stunnedUntil');
type('number')(TeamChamp.prototype, 'rootedUntil');
type('number')(TeamChamp.prototype, 'slowUntil');
type('uint8')(TeamChamp.prototype, 'slowPct');
type('uint16')(TeamChamp.prototype, 'shield');
type('string')(TeamChamp.prototype, 'buffs');
type('number')(TeamChamp.prototype, 'recallUntil');
type('string')(TeamChamp.prototype, 'action');
type('uint32')(TeamChamp.prototype, 'action_seq');
type('string')(TeamChamp.prototype, 'targetId');
type('boolean')(TeamChamp.prototype, 'locked');   // v3 (appended)
type('string')(TeamChamp.prototype, 'spellD');
type('string')(TeamChamp.prototype, 'spellF');
type('number')(TeamChamp.prototype, 'cdD');
type('number')(TeamChamp.prototype, 'cdF');
type('string')(TeamChamp.prototype, 'inBush');   // v4 (appended)
type('string')(TeamChamp.prototype, 'hat');      // EP-06 (appended)
type('string')(TeamChamp.prototype, 'rank');     // Pass 2 (appended)
type('boolean')(TeamChamp.prototype, 'ready');   // Pass 2 (appended)
type('string')(TeamChamp.prototype, 'augmentsCsv');
type('string')(TeamChamp.prototype, 'augmentOfferJson');
type('uint8')(TeamChamp.prototype, 'skillPoints');
type('uint8')(TeamChamp.prototype, 'rankQ');
type('uint8')(TeamChamp.prototype, 'rankW');
type('uint8')(TeamChamp.prototype, 'rankE');
type('uint8')(TeamChamp.prototype, 'rankR');

/** state.units — key = 'u<n>'. Minions, jungle monsters, river epics and (v2) pets. */
export class TeamUnit extends Schema {
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.team = 'neutral';     // 'blue' | 'red' | 'neutral'
    this.kind = 'melee';       // melee|ranged|siege|small|medium|big|golden|deadline|pet
    this.hp = 1;
    this.maxHp = 1;
    this.alive = true;
    this.hit_seq = 0;          // bumped on every hit (client flash)
    this.campId = '';          // '' for minions; camp id / 'golden' / 'deadline'
    this.owner = '';           // v2: '' = none; pets: the owner's champion key
  }
}
type('uint16')(TeamUnit.prototype, 'x');   // v4: uint16 (see TeamChamp.x)
type('uint16')(TeamUnit.prototype, 'y');
type('string')(TeamUnit.prototype, 'team');
type('string')(TeamUnit.prototype, 'kind');
type('uint16')(TeamUnit.prototype, 'hp');
type('uint16')(TeamUnit.prototype, 'maxHp');
type('boolean')(TeamUnit.prototype, 'alive');
type('uint32')(TeamUnit.prototype, 'hit_seq');
type('string')(TeamUnit.prototype, 'campId');
type('string')(TeamUnit.prototype, 'owner');   // v2 (appended — wire index after campId)

/** state.structures — key = structure id ('blue_top_1' … 'red_core'). Destroyed ones stay (alive=false). */
export class TeamStructure extends Schema {
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.team = 'blue';
    this.kind = 'tower';       // 'tower' | 'core'
    this.lane = '';            // top|mid|bot|base
    this.tier = 1;
    this.hp = 1;
    this.maxHp = 1;
    this.alive = true;
    this.invulnerable = false;
  }
}
type('number')(TeamStructure.prototype, 'x');
type('number')(TeamStructure.prototype, 'y');
type('string')(TeamStructure.prototype, 'team');
type('string')(TeamStructure.prototype, 'kind');
type('string')(TeamStructure.prototype, 'lane');
type('uint8')(TeamStructure.prototype, 'tier');
type('uint16')(TeamStructure.prototype, 'hp');
type('uint16')(TeamStructure.prototype, 'maxHp');
type('boolean')(TeamStructure.prototype, 'alive');
type('boolean')(TeamStructure.prototype, 'invulnerable');

/**
 * v4 §3.2b — state.scores, key = same as state.champions. ALWAYS visible (not view-filtered):
 * the scoreboard / end screen read this, because a champion hidden in a bush is removed from
 * an enemy client's state.champions. No position / hp / mana here on purpose (no vision leak).
 */
export class TeamScore extends Schema {
  constructor() {
    super();
    this.team = 'blue';
    this.champ = '';
    this.name = '';
    this.isBot = false;
    this.level = 1;
    this.kills = 0;
    this.deaths = 0;
    this.assists = 0;
    this.cs = 0;
    this.items = new ArraySchema('', '', '', '', '', ''); // always 6, '' = empty
    this.dead = false;
    this.respawnAt = 0;        // server ms (0 = alive)
    this.spellD = '';
    this.spellF = '';
    this.rank = '';            // Pass 2 (appended): rank badge label
    this.augmentsCsv = '';     // comma-separated augment ids
  }
}
type('string')(TeamScore.prototype, 'team');
type('string')(TeamScore.prototype, 'champ');
type('string')(TeamScore.prototype, 'name');
type('boolean')(TeamScore.prototype, 'isBot');
type('uint8')(TeamScore.prototype, 'level');
type('uint16')(TeamScore.prototype, 'kills');
type('uint16')(TeamScore.prototype, 'deaths');
type('uint16')(TeamScore.prototype, 'assists');
type('uint16')(TeamScore.prototype, 'cs');
type(['string'])(TeamScore.prototype, 'items');
type('boolean')(TeamScore.prototype, 'dead');
type('number')(TeamScore.prototype, 'respawnAt');
type('string')(TeamScore.prototype, 'spellD');
type('string')(TeamScore.prototype, 'spellF');
type('string')(TeamScore.prototype, 'rank');   // Pass 2 (appended)
type('string')(TeamScore.prototype, 'augmentsCsv');

export class TeamState extends Schema {
  constructor() {
    super();
    this.phase = 'lobby';      // 'lobby' | 'room' (v4 custom) | 'select' | 'loading' | 'playing' | 'ended'
    this.lobbyEndsAt = 0;      // server ms (0 = waiting for the first join)
    this.startedAt = 0;
    this.winner = '';          // '' | 'blue' | 'red'
    this.blueKills = 0;
    this.redKills = 0;
    this.buffBlue = '';        // '' | 'deadline'
    this.buffBlueUntil = 0;
    this.buffRed = '';
    this.buffRedUntil = 0;
    this.epicGoldenAt = 0;     // server ms of next spawn; 0 = currently alive
    this.epicDeadlineAt = 0;
    this.champions = new MapSchema();
    this.units = new MapSchema();
    this.structures = new MapSchema();
    // v3 "Draft Day" (appended)
    this.selectEndsAt = 0;     // server ms: champion select ends (0 = not in select)
    this.loadingEndsAt = 0;    // server ms: loading screen ends (0 = not loading)
    // v4 "Custom Rooms" (appended)
    this.custom = false;       // true = a named custom room (team_custom); phase 'room' before select
    this.roomName = '';        // custom room name ('' for quick play)
    this.hostId = '';          // custom room host's sessionId ('' for quick play)
    // v4 §3.2b (appended): always-visible scoreboard rows (see TeamScore)
    this.scores = new MapSchema();
    // Experience Pass 1 (appended): how the match was decided — '' (not yet) | 'core' | 'rollback'.
    this.winReason = '';
    this.relicsJson = '';
  }
}
type('string')(TeamState.prototype, 'phase');
type('number')(TeamState.prototype, 'lobbyEndsAt');
type('number')(TeamState.prototype, 'startedAt');
type('string')(TeamState.prototype, 'winner');
type('uint16')(TeamState.prototype, 'blueKills');
type('uint16')(TeamState.prototype, 'redKills');
type('string')(TeamState.prototype, 'buffBlue');
type('number')(TeamState.prototype, 'buffBlueUntil');
type('string')(TeamState.prototype, 'buffRed');
type('number')(TeamState.prototype, 'buffRedUntil');
type('number')(TeamState.prototype, 'epicGoldenAt');
type('number')(TeamState.prototype, 'epicDeadlineAt');
type({ map: TeamChamp })(TeamState.prototype, 'champions');
type({ map: TeamUnit })(TeamState.prototype, 'units');
type({ map: TeamStructure })(TeamState.prototype, 'structures');
type('number')(TeamState.prototype, 'selectEndsAt');   // v3 (appended)
type('number')(TeamState.prototype, 'loadingEndsAt');
type('boolean')(TeamState.prototype, 'custom');    // v4 (appended)
type('string')(TeamState.prototype, 'roomName');
type('string')(TeamState.prototype, 'hostId');
type({ map: TeamScore })(TeamState.prototype, 'scores');   // v4 §3.2b (appended, NOT view-filtered)
type('string')(TeamState.prototype, 'winReason');           // EP-04 (appended)
type('string')(TeamState.prototype, 'relicsJson');
// v4 visibility (TEAM_MODE_V4_BREAKDOWN.md §3.2): champions + units are per-client
// StateView filtered — TeamRoom adds/removes each entry per team view (bush vision).
// Wire indexes are unchanged; the view tag is server-side only.
view()(TeamState.prototype, 'champions');
view()(TeamState.prototype, 'units');

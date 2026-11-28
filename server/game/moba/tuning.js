// server/game/moba/tuning.js — server-only Team Mode constants.
//
// Everything a player can SEE (stats, costs, ranges, timers) lives in
// shared/moba/*.js (coordinator-owned, read-only for server-dev). This file
// only holds simulation details the client never needs, plus a few knobs that
// were missing from rules.js. Entries marked ▲ are candidates to promote into
// shared/moba/rules.js (the client may want to match them).

// ── Room / network ──
export const MAX_HUMANS = 10;              // 5v5 — humans beyond this get a new room
export const PATCH_MS = 50;                // state patches at 20 Hz (= TICK_MS)
export const NAME_MAX = 16;
export const CHAT_MAX = 140;
export const CHAT_RATE_MS = 600;
export const CHAT_LOG_MAX = 30;
export const BUY_RATE_MS = 100;
export const RECALL_RATE_MS = 300;

// ── Combat ──
// Promoted to shared/moba/rules.js (the client animates with the same number).
export { ATK_PROJ_SPEED } from '../../../shared/moba/rules.js';
export const MAX_ATTACK_SPEED = 2.5;       // attacks / s cap
export const RANGE_SLACK = 12;             // px of latency slack on attack / cast range checks
export const TARGET_CAST_SLACK = 30;       // extra slack for point-and-click skills
export const UNIT_REMOVE_MS = 600;         // dead units linger with alive=false, then get deleted
export const MIN_MOVE_SPEED = 90;

// ── Towers ──
export const TOWER_AGGRO_MS = 2000;        // "enemy champion that damaged an allied champion (last 2 s)"
export const TOWER_AGGRO_VICTIM_PAD = 200; // the hurt ally must be this close to tower range
export const TOWER_MAX_RAMP_HITS = 6;      // ▲ +25 %/hit ramp capped at +150 %

// ── Minions ──
export const MINION_RETARGET_MS = 250;
export const MINION_CHAMP_AGGRO_MS = 2500; // locked onto an enemy champion that hit an allied champion
export const MINION_CHASE_RANGE = 700;     // drop a target that got this far away
export const MINION_SPACING = 48;          // spawn spacing along the lane
export const MINION_LANE_CAP = 16;         // per team per lane: skip a wave beyond this (anti pile-up)
export const MINION_TOTAL_CAP = 60;        // synced-entity budget (≤ ~110 total)
export const WAYPOINT_REACHED = 45;
export const MINION_CORE_STOP = 160;       // idle this far from the enemy core when it can't be hit yet
export const DEADLINE_MINION_HP_MUL = 1.4; // waves shipped under THE DEADLINE buff (1 + minionBuffPct)

// ── Jungle / epics ──
export const CAMP_SPAWN_MS = 15000;        // camps appear 0:15 into the match
export const MONSTER_SPEED = 300;
export const MONSTER_RETURN_SPEED = 600;
export const MONSTER_REACH = 70;           // melee reach beyond its own radius
export const EPIC_LEASH_RADIUS = 900;      // epics leash further than camps (CAMP_LEASH_RADIUS)
export const DEADLINE_CLEAVE_RADIUS = 150; // THE DEADLINE's slam also hits champions near its target

// ── v2: pets, fans, zones ──
export const PET_RADIUS = 16;              // pets are small + never collide with anything but walls
export const PET_ARRIVE = 24;              // close enough to its follow spot → idle (hover)
export const PET_CHASE_LEASH = 0.6;        // × PET_LEASH: pets only chase targets this close to the owner
export const MAX_FAN_COUNT = 15;           // sanity cap on projectile `count`
export const MIN_ZONE_TICK_MS = 100;       // sanity floor on zone `tickMs`

// ── Fountain ──
export const FOUNTAIN_FX_MS = 400;         // laser `fx hit` cadence per victim

// ── Consumables ──
export const COFFEE_MAX_STACK = 3;

// ── Debug (BUG_SMASH_DEBUG=1 only) ──
export const DEBUG_GOLD_DEFAULT = 3000;
export const DEBUG_GOLD_MAX = 100000;

// ── v4: custom rooms, bushes, interest management ──
export const SIDE_RATE_MS = 400;           // custom room: min interval between accepted `side` messages
export const INTEREST_RADIUS = 1600;       // atk / fx only reach a team with a champion within this (or its own events)
export const VISION_EVERY_TICKS = 1;       // bush visibility pass cadence (1 = every tick, 20 Hz)
export const VIEW_GC_MS = 1000;            // drop pending StateView changes of views nobody is using (memory)

// ── Team reconnect and rollback vote rules ──
export const TEAM_RECONNECT_GRACE_S = 300; // EP-03 → Pass 2: the client keeps auto-retrying this long (welcome.reconnectS);
                                           // the seat itself is held for the whole match (REJOIN from the menu later)
export const VOTE_RATE_MS = 300;           // EP-04: min interval between processed `vote` messages per client
export const VOTE_BOT_DELAY_MS = [800, 3000]; // EP-04: bots cast their rollback vote this long after it opens
export const VOTE_BOT_KILL_GAP = 10;       // EP-04: bots vote yes when their team trails by this many kills …
                                           //        … or has lost more structures than the enemy (§3.3)

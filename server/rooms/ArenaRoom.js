// ArenaRoom — Personal Mode: one persistent, server-authoritative FFA world.
//
// Clients send intent (move / smash / castSkill / action / chat); the server
// validates, simulates bugs + combat, and syncs state via schema diffs.
//
// Office Chaos update (2026-11):
//   • BotDirector   — AI coworkers fill the room when few humans are online.
//                     They act through the SAME _do* handlers as humans.
//   • EventDirector — PM world events (Prod Down, Coffee Break, Code Freeze,
//                     Friday Deploy, Hackathon, Golden Bug) + the Deadline boss.
//   • Drama         — kill feed, PvP streaks + shutdowns, Tech Lead crown with
//                     a bounty, spawn protection.
// Tunables live in server/game/rules.js and server/data/*.js.
import { Room } from '@colyseus/core';
import {
  ARENA_W, ARENA_H, SMASH_RADIUS, MAX_BUGS, BUG_LIFETIME_MS,
  FLEE_RADIUS_PX, FLEE_SPEED_MUL, TURN_LERP, BUG_ATTACK,
  BUG_EAT_INTERVAL_MS, BUG_EAT_RADIUS, LADYBUG_EAT_BONUS, MAX_EAT_PER_TICK,
  TOXIC_CLOUD_RADIUS, TOXIC_CLOUD_LIFETIME, TOXIC_CLOUD_TICK_MS, TOXIC_CLOUD_DAMAGE,
  COMBO_TIMEOUT_MS, comboMult, PHASE_PLAYING_MS, PHASE_RESULTS_MS,
  LEVEL_MAX_ENERGY, LEVEL_MAX_HEALTH, LEVEL_TITLES, ENERGY_COST, SKILL_ENERGY, ENERGY_REGEN_PER_SEC,
  DASH_DISTANCE, DASH_HIT_RADIUS, SHIELD_DURATION_MS, ROLL_DISTANCE, ROLL_INVULN_MS,
  ULT_RADIUS, ULT_KNOCKBACK, ULT_STUN_MS, distToSegment, bugDamage, pvpDamage,
  brokenMsForLevel, SPAWN_PROTECT_MS, RECONNECT_GRACE_S, NEW_SESSION_XP_MUL, NEW_SESSION_XP_MS,
  PICKUP_TARGET_COUNT, PICKUP_RESPAWN_MS, PICKUP_ENERGY_GAIN, PICKUP_ENERGY_REFILL,
  PICKUP_RADIUS, PLAYER_PICKUP_RADIUS,
  levelFromXP, maxEnergyForLevel, maxHealthForLevel, levelTitle,
  PALETTE, BUG_KIND_SCORE, BUG_DISPLAY_NAME, rollBugKind,
  OBSTACLE_LAYOUT, OBSTACLE_TARGET, OBSTACLE_RESPAWN_MS, OBSTACLE_VARIANTS,
  OBSTACLE_MIN_DIST_FROM_PLAYER, OBSTACLE_PADDING, firstObstacleAt, clampToFreeSpace,
  spawnIntervalFor, SPAWN_NEAR_HUMAN_CHANCE, SPAWN_NEAR_HUMAN_RING,
  HARD_MAX_BUGS, EAT_PAUSE_ABOVE_BUGS, WELCOME_BUGS, WELCOME_BUG_RING,
  STREAK_TIERS, SHUTDOWN_MIN_STREAK, SHUTDOWN_XP_PER_KO,
  CROWN_MIN_SCORE, CROWN_CHECK_MS, CROWN_SWAP_MARGIN_ABS, CROWN_SWAP_MARGIN_PCT,
  CROWNED_NOTICE_COOLDOWN_MS, bountyForScore, COMBO_FEED_AT, BUG_KINDS,
} from '../game/rules.js';
import { Player, Bug, HealthPickup, ToxicCloud, Obstacle, ArenaState } from '../game/schema.js';
import { BotDirector } from '../game/BotDirector.js';
import { EventDirector } from '../game/EventDirector.js';
import { GOLDEN_BUG, WORLD_EVENTS } from '../data/events.js';
import { sanitizeHat } from '../data/cosmetics.js';
import { publicIdOf } from '../game/identity.js';
import { Presence } from '../game/Presence.js';
import {
  KO_LINES, BUG_KO_LINES, CLOUD_KO_LINES, BOSS_KO_LINES, JOIN_LINES, LEAVE_LINES,
  AWAY_LINES, BACK_LINES, pickLine,
} from '../data/feed.js';

// Dev-only hooks (force world events) are OPT-IN: start the server with
// BUG_SMASH_DEBUG=1. Fail-closed so a LAN/prod server never exposes them.
const DEBUG_HOOKS = process.env.BUG_SMASH_DEBUG === '1';
// Per-player minimum intervals between intents (anti-script; humans/bots never hit them).
const SMASH_MIN_INTERVAL_MS = 140;  // client swings every 220 ms (room for network jitter)
const CAST_MIN_INTERVAL_MS  = 250;  // per slot — Q→R combos stay possible; Hackathon isn't a machine gun
const ACTION_MIN_INTERVAL_MS = 90;
const MOVE_SPEED_CAP = 240 * 1.6;   // px/s allowed for `move` (client speed 240 + slack)
const MOVE_SLACK_PX = 60;
const SMASH_KINDS = new Set(['smash', 'punch', 'kick']);

/** Finite unit vector from untrusted (dirX, dirY); falls back to (1, 0). */
function unitDir(rawX, rawY) {
  const fx = Number(rawX), fy = Number(rawY);
  let dx = Number.isFinite(fx) ? fx : 0;
  let dy = Number.isFinite(fy) ? fy : 0;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 0.01) return { dx: 1, dy: 0 };
  return { dx: dx / len, dy: dy / len };
}

// ---------------- room ----------------
export class ArenaRoom extends Room {
  onCreate(_options) {
    this.maxClients = 32;
    this.setState(new ArenaState());
    this._seedObstacles();
    // Patch rate (12.5 Hz) is intentionally slower than the AI sim tick.
    // Server simulates bug movement smoothly; client lerps between snapshots.
    this.setPatchRate(80);

    this._nextBugId = 1;
    this._nextObstacleId = 1000; // start above the seeded id range
    this._lastSpawnAt = 0;
    this._nextPickupId = 1;
    this._lastPickupSpawnAt = 0;
    this._nextCloudId = 1;
    this._nextColorIdx = 0;
    // Off-schema: id -> nextDamageAt (so cloud doesn't damage every server tick)
    this._cloudDamageAt = new Map();
    // Off-schema bug AI bookkeeping: id -> { vx, vy, spawnedAt, headingX, headingY, hideUntil }
    this._bugAI = new Map();
    // Off-schema per-bug contact-attack cooldown: id -> nextAttackAllowed ms
    this._bugAttackCD = new Map();
    // Off-schema player bookkeeping: sessionId -> { lastKillAt, koStreak, kos }
    this._playerState = new Map();
    // Off-schema chat rate-limit: sessionId -> last chat timestamp (ms)
    this._lastChatAt = new Map();
    // Recent chat buffer so players who join later see the conversation so far.
    this._chatLog = [];
    this._chatLogMax = 30;
    this._crownCheckAt = 0;
    this._lastCrownFeedAt = 0;
    this._crownedNoticeAt = new Map(); // sid -> last personal "you're Tech Lead" ms

    this.bots = new BotDirector(this);
    this.events = new EventDirector(this);

    // ── Client intent → shared handlers (bots call the same _do* methods) ──
    this.onMessage('move',      (client, msg) => this._doMove(client.sessionId, msg));
    this.onMessage('castSkill', (client, msg) => this._doCastSkill(client.sessionId, msg));
    this.onMessage('action',    (client, msg) => this._doAction(client.sessionId, msg));
    this.onMessage('smash',     (client, msg) => this._doSmash(client.sessionId, msg));

    this.onMessage('setName', (client, msg) => {
      const p = this.state.players.get(client.sessionId);
      if (p && typeof msg?.name === 'string') p.name = msg.name.slice(0, 16);
    });
    this.onMessage('setHat', (client, msg) => {
      const p = this.state.players.get(client.sessionId);
      if (p) p.hat = sanitizeHat(msg?.hat);
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
      this._broadcastChat({ sid: client.sessionId, name: p.name || 'anon', text });
      this.bots.onHumanChat(client.sessionId, text);
    });

    // A freshly-joined client sends this once its handlers are wired up
    // (requesting avoids a race with onJoin message delivery). Answered ONCE
    // per client — each reply is ~6 KB, so an unthrottled loop is a memory DoS.
    const eventTable = Object.fromEntries(Object.entries(WORLD_EVENTS)
      .map(([id, d]) => [id, { title: d.title, sub: d.sub, color: d.color }]));
    this.onMessage('hello', (client) => {
      client.userData = client.userData || {};
      if (client.userData.helloed) return;
      client.userData.helloed = true;
      client.send('welcome', { serverNow: Date.now(), events: eventTable, reconnectS: RECONNECT_GRACE_S });
      if (this._chatLog.length) client.send('chatHistory', this._chatLog);
    });
    this.onMessage('getChatHistory', (client) => {  // legacy clients — once per client
      client.userData = client.userData || {};
      if (client.userData.historySent) return;
      client.userData.historySent = true;
      if (this._chatLog.length) client.send('chatHistory', this._chatLog);
    });

    // Dev-only: force a world event (requires BUG_SMASH_DEBUG=1; own keys only —
    // an inherited key like 'constructor' used to crash the whole process).
    if (DEBUG_HOOKS) {
      this.onMessage('debug', (client, msg) => {
        if (msg?.cmd === 'event' && Object.hasOwn(WORLD_EVENTS, msg.id)) this.events.start(msg.id);
        if (msg?.cmd === 'endEvent') this.events.end('timeout');
        // Grant yourself XP (playtest tools: reach Lv3 fast). Finite, 1..20000.
        if (msg?.cmd === 'xp' && Number.isFinite(msg.n)) {
          const p = this.state.players.get(client.sessionId);
          if (p && !p.broken) this._grantXP(client.sessionId, p, Math.max(1, Math.min(20000, Math.round(msg.n))));
        }
      });
      console.log('[ArenaRoom] debug hooks ENABLED (BUG_SMASH_DEBUG=1)');
    } else {
      // Colyseus drops a client that sends an unregistered type — ignore `debug` quietly instead.
      this.onMessage('debug', () => {});
    }

    this.setSimulationInterval((dt) => this._tick(dt));
    console.log('[ArenaRoom] created', this.roomId);
  }

  // ───────────────────────── population helpers ─────────────────────────
  humanCount() { return Math.max(0, this.state.players.size - this.bots.count); }

  /** Humans who are actually connected (an `away` player in reconnect grace is
   *  skipped: no bug spawns, events or bot wandering aimed at a frozen stickman).
   *  humanCount() still counts them, so a Wi-Fi blip doesn't churn the bots. */
  humanPlayers() {
    const out = [];
    this.state.players.forEach((p, sid) => { if (!this.bots.isBot(sid) && !p.away) out.push(p); });
    return out;
  }

  /** Create + register a player (human or bot). Returns the Player schema. */
  _addPlayer(sid, { name, hat, isBot = false, x, y, startXp = 0 } = {}) {
    const p = new Player();
    p.name  = String(name || 'guest').slice(0, 16);
    p.hat   = sanitizeHat(hat);
    p.isBot = !!isBot;
    p.color = PALETTE[this._nextColorIdx++ % PALETTE.length];
    const jitter = 80;
    p.x = (typeof x === 'number') ? x : ARENA_W / 2 + (Math.random() - 0.5) * jitter * 2;
    p.y = (typeof y === 'number') ? y : ARENA_H / 2 + (Math.random() - 0.5) * jitter * 2;
    if (startXp > 0) {
      p.xp = startXp;
      p.score = startXp;
      p.level = levelFromXP(startXp);
      p.maxEnergy = maxEnergyForLevel(p.level);
      p.maxHealth = maxHealthForLevel(p.level);
      p.energy = p.maxEnergy;
      p.health = p.maxHealth;
    }
    p.invulnUntil = Date.now() + SPAWN_PROTECT_MS;
    this.state.players.set(sid, p);
    // joinedAt = session start (EP-20 new-session XP boost; survives a reconnect).
    this._playerState.set(sid, { lastKillAt: 0, koStreak: 0, kos: 0, joinedAt: Date.now() });
    return p;
  }

  _removePlayer(sid) {
    this.state.players.delete(sid);
    this._playerState.delete(sid);
    this._lastChatAt.delete(sid);
    this._crownedNoticeAt.delete(sid);
    if (this.state.crownSid === sid) { this.state.crownSid = ''; this.state.bounty = 0; }
  }

  _onBotsChanged() {
    try { this.setMetadata({ bots: this.bots.count })?.catch?.(() => {}); } catch (_) { /* ignore */ }
  }

  // ───────────────────────── messaging helpers ─────────────────────────
  _sendTo(sid, type, payload) {
    const c = this.clients.find((cl) => cl.sessionId === sid);
    if (c) c.send(type, payload);
  }
  /** Kill-feed line for everyone. { text, color?, a?, b? } (a/b = involved sids). */
  _feed(entry) { this.broadcast('feed', entry); }
  /** Big center-screen banner for everyone. { title, sub?, color?, big? } */
  _announce(entry) { this.broadcast('announce', { kind: 'banner', ...entry }); }
  _broadcastChat(m) {
    this.broadcast('chat', m);
    this._chatLog.push(m);
    if (this._chatLog.length > this._chatLogMax) this._chatLog.shift();
  }
  _pmSay(text) { this._broadcastChat({ sid: 'pm', name: '📢 PM', text, kind: 'pm' }); }

  // ───────────────────────── intent handlers ─────────────────────────
  _doMove(sid, msg) {
    if (this.state.phase !== 'playing') return;
    const p = this.state.players.get(sid);
    if (!p || p.away) return; // away = frozen until the reconnect lands
    const now = Date.now();
    if (now < (p.stunnedUntil || 0)) return; // stunned — can't move
    // Right after a server-side teleport (dash, roll, knockback) the client is
    // still sending pre-teleport positions — ignore them until it catches up.
    if (now < (p._ignoreMovesUntil || 0)) return;
    if (Number.isFinite(msg?.x) && Number.isFinite(msg?.y)) {
      let toX = Math.max(0, Math.min(ARENA_W, msg.x));
      let toY = Math.max(0, Math.min(ARENA_H, msg.y));
      // Max step: a `move` can't teleport across the map (it used to — two
      // messages beat every range check, incl. the boss / golden bug).
      const elapsed = Math.min(1000, now - (p._lastMoveAt || 0));
      p._lastMoveAt = now;
      const maxStep = MOVE_SPEED_CAP * (elapsed / 1000) + MOVE_SLACK_PX;
      const sx = toX - p.x, sy = toY - p.y;
      const step = Math.hypot(sx, sy);
      if (step > maxStep) {
        toX = p.x + (sx / step) * maxStep;
        toY = p.y + (sy / step) * maxStep;
      }
      // Slide-along obstacle collision. Q dash + E jump get a 350 ms
      // pass-through window after cast.
      const passThrough = Date.now() < (p._passThroughUntil || 0);
      const out = clampToFreeSpace(this.state, p.x, p.y, toX, toY, passThrough);
      p.x = out.x;
      p.y = out.y;
    }
  }

  // ───── MOBA skill cast — energy-gated, broken-gated ─────
  _doCastSkill(sid, msg) {
    if (this.state.phase !== 'playing') return;
    const p = this.state.players.get(sid);
    if (!p || p.broken || p.away) return;
    if (Date.now() < (p.stunnedUntil || 0)) return; // stunned — can't cast
    const slot = msg?.slot;
    if (slot !== 'q' && slot !== 'w' && slot !== 'e' && slot !== 'r') return;
    const nowCast = Date.now();
    p._castAt = p._castAt || {};
    if (nowCast - (p._castAt[slot] || 0) < CAST_MIN_INTERVAL_MS) return; // per-slot rate limit
    // Hackathon makes skills free (skillCostMul = 0).
    const cost = Math.round(SKILL_ENERGY[slot] * this.events.mod('skillCostMul', 1));
    if (!(p.energy >= cost)) return; // also rejects a NaN energy
    p._castAt[slot] = nowCast;
    p.energy -= cost;

    // Animation broadcast — each slot reuses a matching pose
    const kindForAnim = (slot === 'q') ? 'punch'
                     :  (slot === 'w') ? 'parry'
                     :  (slot === 'e') ? 'jump'
                     :                   'kick';
    p.action = kindForAnim;
    p.action_seq = (p.action_seq + 1) >>> 0;
    // Q dash + E jump pass through obstacles — brief server-side window
    // during which the move handler skips the obstacle clamp.
    if (slot === 'q' || slot === 'e') {
      p._passThroughUntil = Date.now() + 350;
    }
    const animMs = (slot === 'r') ? 500 : (slot === 'w' ? 620 : 320);
    this.clock.setTimeout(() => {
      const cur = this.state.players.get(sid);
      if (cur && cur.action === kindForAnim) cur.action = 'idle';
    }, animMs);

    // ───── R: Deadline Break ult ─────
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
          this._damageBug(sid, p, id, bug, bugDmg);
          if (bug.alive) { // only knock back survivors
            const d = Math.hypot(dx, dy) || 1;
            bug.x = Math.max(20, Math.min(ARENA_W - 20, bug.x + (dx / d) * ULT_KNOCKBACK));
            bug.y = Math.max(40, Math.min(ARENA_H - 40, bug.y + (dy / d) * ULT_KNOCKBACK));
          }
        }
      });
      // 2. Enemy players in range — damage + knockback + stun
      this.state.players.forEach((other, osid) => {
        if (osid === sid || other.broken) return;
        const dx = other.x - cx, dy = other.y - cy;
        if (dx * dx + dy * dy <= r2) {
          // Shield / roll i-frames / truce block the WHOLE ult (damage, knockback,
          // stun) — a deliberate rule since 2026-11 (see 09_BALANCE § Ult).
          const landed = this._applyPvpHit(sid, p, other, osid, 'ult');
          if (landed && !other.broken) {
            const d = Math.hypot(dx, dy) || 1;
            other.x = Math.max(20, Math.min(ARENA_W - 20, other.x + (dx / d) * ULT_KNOCKBACK));
            other.y = Math.max(40, Math.min(ARENA_H - 40, other.y + (dy / d) * ULT_KNOCKBACK));
            other.stunnedUntil = nowMs + ULT_STUN_MS;
            other._ignoreMovesUntil = nowMs + 300; // let the knockback stick
          }
        }
      });
      // 3. The Deadline boss
      if (this.events.bossInReach(cx, cy, ULT_RADIUS)) this.events.damageBoss(sid, p, bugDmg);
    }

    // ───── E: Debug Roll ─────
    if (slot === 'e') {
      const { dx, dy } = unitDir(msg?.dirX, msg?.dirY); // finite or (1,0) — never NaN
      p.x = Math.max(20, Math.min(ARENA_W - 20, p.x + dx * ROLL_DISTANCE));
      p.y = Math.max(40, Math.min(ARENA_H - 40, p.y + dy * ROLL_DISTANCE));
      p.invulnUntil = Math.max(p.invulnUntil || 0, Date.now() + ROLL_INVULN_MS);
      p._ignoreMovesUntil = Date.now() + 270; // client is still tweening there
    }

    // ───── W: Laptop Shield ─────
    if (slot === 'w') {
      p.shielded = true;
      // Each cast gets a sequence number so an OLD cast's expiry timer can't
      // strip a newer shield (re-casts are common for bots / during Hackathon).
      const seq = (p._shieldSeq = (p._shieldSeq || 0) + 1);
      this.clock.setTimeout(() => {
        const cur = this.state.players.get(sid);
        if (cur && cur.shielded && cur._shieldSeq === seq) cur.shielded = false; // natural expiry
      }, SHIELD_DURATION_MS);
    }

    // ───── Q: Bug Dash — bugs + PvP + boss along the line ─────
    if (slot === 'q') {
      const { dx, dy } = unitDir(msg?.dirX, msg?.dirY); // finite or (1,0) — never NaN
      p._ignoreMovesUntil = Date.now() + 200;             // client is still tweening there
      const startX = p.x, startY = p.y;
      const endX = Math.max(20, Math.min(ARENA_W - 20, p.x + dx * DASH_DISTANCE));
      const endY = Math.max(40, Math.min(ARENA_H - 40, p.y + dy * DASH_DISTANCE));
      p.x = endX;
      p.y = endY;
      const bugDmg = bugDamage(p, 'dash');
      this.state.bugs.forEach((bug, id) => {
        if (!bug.alive || bug.hidden) return;
        if (distToSegment(bug.x, bug.y, startX, startY, endX, endY) <= DASH_HIT_RADIUS) {
          this._damageBug(sid, p, id, bug, bugDmg);
        }
      });
      this.state.players.forEach((other, osid) => {
        if (osid === sid || other.broken) return;
        if (distToSegment(other.x, other.y, startX, startY, endX, endY) <= DASH_HIT_RADIUS) {
          this._applyPvpHit(sid, p, other, osid, 'dash');
        }
      });
      if (this.events.bossOnSegment(distToSegment, startX, startY, endX, endY, DASH_HIT_RADIUS)) {
        this.events.damageBoss(sid, p, bugDmg);
      }
    }
  }

  // Action — broadcasts a transient animation state (no target required).
  _doAction(sid, msg) {
    if (this.state.phase !== 'playing') return;
    const p = this.state.players.get(sid);
    if (!p || p.away) return;
    const a = msg?.kind;
    if (a !== 'jump' && a !== 'punch' && a !== 'kick' && a !== 'smash' && a !== 'parry') return;
    const nowA = Date.now();
    if (nowA - (p._lastActionAt || 0) < ACTION_MIN_INTERVAL_MS) return; // rate limit
    p._lastActionAt = nowA;
    p.action = a;
    p.action_seq = (p.action_seq + 1) >>> 0;
    const ms = (a === 'parry') ? 620 : (a === 'jump' ? 420 : 260);
    this.clock.setTimeout(() => {
      const cur = this.state.players.get(sid);
      if (cur && cur.action === a) cur.action = 'idle';
    }, ms);
  }

  _doSmash(sid, msg) {
    if (this.state.phase !== 'playing') return;
    const p = this.state.players.get(sid);
    if (!p) return;
    // Broken, away or stunned stickymen can't attack
    if (p.broken || p.away) return;
    const nowS = Date.now();
    if (nowS < (p.stunnedUntil || 0)) return;
    // Server-side swing cooldown (the 220 ms one was client-only → scriptable).
    if (nowS - (p._lastSmashAt || 0) < SMASH_MIN_INTERVAL_MS) return;
    p._lastSmashAt = nowS;
    // Whitelist: an inherited key like 'constructor' used to turn energy into NaN.
    const kind = SMASH_KINDS.has(msg?.kind) ? msg.kind : 'smash';

    // Every smash also damages any obstacles within reach. Breaks open
    // "bug nests" — destroyed obstacles spawn 2–4 bugs at the rubble.
    this._trySmashObstacles(p);

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
        this._damageBug(sid, p, id, bug, bugDamage(p, 'smash'));
      }
      this.state.players.forEach((other, osid) => {
        if (osid === sid || other.broken) return;
        const dx = p.x - other.x, dy = p.y - other.y;
        if (dx * dx + dy * dy <= reach2) this._applyPvpHit(sid, p, other, osid);
      });
      if (this.events.bossInReach(p.x, p.y, reach)) this.events.damageBoss(sid, p, bugDamage(p, 'smash'));
      return;
    }

    const reach = (kind === 'punch') ? 112 : SMASH_RADIUS;

    // The Deadline boss (explicit target from the client / a bot)
    if (msg?.boss) {
      if (this.events.bossInReach(p.x, p.y, reach)) {
        p.energy = Math.max(0, p.energy - cost);
        this.events.damageBoss(sid, p, bugDamage(p, 'smash'));
      }
      return;
    }

    if (msg?.targetSid) {
      if (msg.targetSid === sid) return;
      const other = this.state.players.get(msg.targetSid);
      if (!other || other.broken) return;
      const dx = p.x - other.x, dy = p.y - other.y;
      if (Math.hypot(dx, dy) > reach) return;
      p.energy = Math.max(0, p.energy - cost);
      this._applyPvpHit(sid, p, other, msg.targetSid);
      return;
    }

    const bug = this.state.bugs.get(msg?.id);
    if (!bug || !bug.alive || bug.hidden) return;
    const dx = p.x - bug.x, dy = p.y - bug.y;
    if (Math.hypot(dx, dy) > reach) return;
    p.energy = Math.max(0, p.energy - cost);
    this._damageBug(sid, p, msg.id, bug, bugDamage(p, 'smash'));
  }

  // -------- simulation tick --------
  _tick(dtMs) {
    if (this.state.phase !== 'playing') return;
    const now = Date.now();

    // Directors first: events set this tick's modifiers, bots act on them.
    this.events.tick(dtMs, now);
    this.bots.tick(dtMs, now);

    // Spawn cadence scales with hunters in the room; events can override it.
    this._lastSpawnAt += dtMs;
    const aliveBugs = this._countAliveBugs();
    const playerCount = this.state.players.size;
    const spawnDelay = this.events.mod('spawnEveryMs', spawnIntervalFor(playerCount));
    const maxBugs = this.events.mod('maxBugs', MAX_BUGS);
    if (aliveBugs < maxBugs && this._lastSpawnAt > spawnDelay) {
      this._lastSpawnAt = 0;
      this._spawnBug();
    }

    // Per-player ticks: combo decay + energy regen + pickup collection
    const dtSec = dtMs / 1000;
    this.state.players.forEach((p, sid) => {
      const ps = this._playerState.get(sid);
      if (p.combo > 0 && ps && (now - ps.lastKillAt) > COMBO_TIMEOUT_MS) {
        p.combo = 0;
      }
      if (!p.broken && p.energy < p.maxEnergy && ENERGY_REGEN_PER_SEC > 0) {
        p.energy = Math.min(p.maxEnergy, p.energy + ENERGY_REGEN_PER_SEC * dtSec);
      }
      // Pickup overlap (broken players skip — proposal §Recovery Restrictions)
      if (!p.broken && !p.away) this._tryCollectPickups(p, sid);
    });

    // Health pickup pool — Coffee Break raises the target + refills fast near humans
    const pickupTarget = this.events.mod('pickupTarget', PICKUP_TARGET_COUNT);
    const boosted = pickupTarget > PICKUP_TARGET_COUNT;
    this._lastPickupSpawnAt += dtMs;
    if (this.state.pickups.size < pickupTarget
        && this._lastPickupSpawnAt > (boosted ? 900 : PICKUP_RESPAWN_MS)) {
      this._lastPickupSpawnAt = 0;
      this._spawnPickup(boosted ? this.events._pointNearHuman(140, 820) : null);
    }

    // ───── Bug AI + movement ─────
    const dt = dtMs / 1000;
    const players = [];
    this.state.players.forEach((p, sid) => players.push({ p, sid }));
    const speedMul = this.events.mod('bugSpeedMul', 1);     // Code Freeze = 0
    const bugsAttack = this.events.mod('bugsAttack', true);

    this.state.bugs.forEach((bug, id) => {
      if (!bug.alive) return;
      const ai = this._bugAI.get(id);
      if (!ai) return;

      // Expire 'hidden' state — bug pops back into play
      if (bug.hidden && ai.hideUntil && now > ai.hideUntil) {
        bug.hidden = false;
        ai.hideUntil = 0;
      }
      if (bug.hidden) return;

      // Find nearest non-broken, connected player (target for pursuit + flee reference)
      let nearest = null, nearestSid = null, nearestD2 = Infinity;
      for (const { p, sid } of players) {
        if (p.broken || p.away) continue;
        const dx = p.x - bug.x, dy = p.y - bug.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < nearestD2) { nearestD2 = d2; nearest = p; nearestSid = sid; }
      }

      const attackCfg = bugsAttack ? BUG_ATTACK[bug.kind] : null;
      const nearestD = Math.sqrt(nearestD2);

      // ───── Aggressive AI (beetle, robot) ─────
      if (attackCfg && nearest && nearestD < attackCfg.aggro) {
        if (nearestD < attackCfg.reach) {
          const cdAt = this._bugAttackCD.get(id) || 0;
          if (now >= cdAt) {
            this._bugAttackCD.set(id, now + attackCfg.cooldownMs);
            this._applyBugContactDamage(nearest, nearestSid, attackCfg.dmg, { type: 'bug', kind: bug.kind });
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
        const chaseSpeed = ai.baseSpeed * attackCfg.chaseMul * speedMul;
        const c = clampToFreeSpace(this.state, bug.x, bug.y,
          bug.x + ai.headingX * chaseSpeed * dt, bug.y + ai.headingY * chaseSpeed * dt, false);
        bug.x = c.x; bug.y = c.y;
        this._bounceInArena(bug, ai);
        if (!ai.noAge && now - ai.spawnedAt > BUG_LIFETIME_MS) this._removeBug(id);
        return; // skip the flee/wander block below
      }

      // ───── Default flee/wander ─────
      const fleeR = ai.golden ? GOLDEN_BUG.fleeRadius : FLEE_RADIUS_PX;
      let tx, ty, speed;
      if (nearest && nearestD2 < fleeR * fleeR) {
        const dx = bug.x - nearest.x, dy = bug.y - nearest.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        tx = dx / d; ty = dy / d;
        if (ai.golden) {
          // The CEO's bug zig-zags while it runs — catchable, but slippery.
          const wob = Math.sin(now / 260 + (ai.phase || 0)) * 0.75;
          const ox = tx, oy = ty;
          tx = ox - oy * wob; ty = oy + ox * wob;
          speed = ai.baseSpeed;
        } else {
          speed = ai.baseSpeed * FLEE_SPEED_MUL;
        }
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
      speed *= speedMul;

      // Lerp heading toward target dir for smoother motion
      ai.headingX = ai.headingX + (tx - ai.headingX) * Math.min(1, TURN_LERP * dt);
      ai.headingY = ai.headingY + (ty - ai.headingY) * Math.min(1, TURN_LERP * dt);
      const hl = Math.hypot(ai.headingX, ai.headingY) || 1;
      ai.headingX /= hl; ai.headingY /= hl;

      const c = clampToFreeSpace(this.state, bug.x, bug.y,
        bug.x + ai.headingX * speed * dt, bug.y + ai.headingY * speed * dt, false);
      bug.x = c.x; bug.y = c.y;
      this._bounceInArena(bug, ai);

      if (!ai.noAge && now - ai.spawnedAt > BUG_LIFETIME_MS) this._removeBug(id);
    });

    // ───── Toxic clouds ─────
    const r2Cloud = TOXIC_CLOUD_RADIUS * TOXIC_CLOUD_RADIUS;
    this.state.clouds.forEach((cloud, cid) => {
      if (now >= cloud.expiresAt) {
        this.state.clouds.delete(cid);
        this._cloudDamageAt.delete(cid);
        return;
      }
      const nextAt = this._cloudDamageAt.get(cid) || 0;
      if (now >= nextAt) {
        this._cloudDamageAt.set(cid, now + TOXIC_CLOUD_TICK_MS);
        this.state.players.forEach((p, sid) => {
          if (p.broken) return;
          const dx = p.x - cloud.x, dy = p.y - cloud.y;
          if (dx * dx + dy * dy <= r2Cloud) {
            this._applyBugContactDamage(p, sid, TOXIC_CLOUD_DAMAGE, { type: 'cloud' });
          }
        });
      }
    });

    // ───── Obstacle respawn — keep at OBSTACLE_TARGET ─────
    this._obstacleRespawnTimer = (this._obstacleRespawnTimer || 0) + dtMs;
    if (this._obstacleRespawnTimer >= OBSTACLE_RESPAWN_MS) {
      this._obstacleRespawnTimer = 0;
      if (this.state.obstacles.size < OBSTACLE_TARGET) this._spawnRandomObstacle();
    }

    // ───── Bugs eat nearby obstacles (not while frozen or crowded; never the golden bug) ─────
    this._bugEatTimer = (this._bugEatTimer || 0) + dtMs;
    if (this._bugEatTimer >= BUG_EAT_INTERVAL_MS) {
      this._bugEatTimer = 0;
      if (speedMul > 0 && this._countAliveBugs() < EAT_PAUSE_ABOVE_BUGS) this._bugsEatObstacles();
    }

    // ───── Tech Lead crown ─────
    if (now >= this._crownCheckAt) {
      this._crownCheckAt = now + CROWN_CHECK_MS;
      this._updateCrown(now);
    }
  }

  _bounceInArena(bug, ai) {
    if (bug.x < 30)           { bug.x = 30; ai.headingX = Math.abs(ai.headingX); }
    if (bug.x > ARENA_W - 30) { bug.x = ARENA_W - 30; ai.headingX = -Math.abs(ai.headingX); }
    if (bug.y < 60)           { bug.y = 60; ai.headingY = Math.abs(ai.headingY); }
    if (bug.y > ARENA_H - 60) { bug.y = ARENA_H - 60; ai.headingY = -Math.abs(ai.headingY); }
  }

  _bugsEatObstacles() {
    const eatR2 = BUG_EAT_RADIUS * BUG_EAT_RADIUS;
    const toBreak = [];
    this.state.obstacles.forEach((ob, id) => {
      let dmg = 0;
      this.state.bugs.forEach((bug) => {
        if (!bug.alive || bug.hidden || bug.kind === GOLDEN_BUG.kind) return;
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

  // ───────────────────────── Tech Lead crown ─────────────────────────
  _updateCrown(now) {
    const st = this.state;
    let best = null, bestSid = '';
    st.players.forEach((p, sid) => {
      if (p.broken) return;
      if (!best || p.score > best.score) { best = p; bestSid = sid; }
    });
    // Hysteresis: the holder keeps the crown unless a challenger leads by a
    // clear margin — near-tied players were ping-ponging it every few seconds.
    const cur = st.crownSid ? st.players.get(st.crownSid) : null;
    if (cur && !cur.broken && best && best !== cur) {
      const margin = Math.max(CROWN_SWAP_MARGIN_ABS, cur.score * CROWN_SWAP_MARGIN_PCT);
      if (best.score < cur.score + margin) { best = cur; bestSid = st.crownSid; }
    }
    if (!best || best.score < CROWN_MIN_SCORE) { best = null; bestSid = ''; }

    if (bestSid !== st.crownSid) {
      st.crownSid = bestSid;
      if (best) {
        const bounty = bountyForScore(best.score);
        if (now - this._lastCrownFeedAt > 6000) {
          this._lastCrownFeedAt = now;
          this._feed({ text: `👑 ${best.name} is the new TECH LEAD · bounty ${bounty} XP`, color: '#ffd700', a: bestSid });
        }
        // Personal banner at most every 30 s per player.
        if (now - (this._crownedNoticeAt.get(bestSid) || 0) > CROWNED_NOTICE_COOLDOWN_MS) {
          this._crownedNoticeAt.set(bestSid, now);
          this._sendTo(bestSid, 'crowned', { bounty });
        }
      }
    }
    st.bounty = best ? bountyForScore(best.score) : 0;
  }

  // ───────────────────────── damage + rewards ─────────────────────────
  /** Apply `dmg` to a bug from player p (sid). Handles the kill + rewards. */
  _damageBug(sid, p, bugId, bug, dmg) {
    // The CEO's bug is awarded by damage share, not last hit — record it.
    if (bug.kind === GOLDEN_BUG.kind) this.events.noteGoldenDamage(sid, Math.min(bug.hp, dmg));
    // Clamp at 0 — bug.hp is uint8, and a big hit (e.g. an ult) can exceed
    // remaining HP; an unclamped negative would wrap on serialization.
    bug.hp = Math.max(0, bug.hp - dmg);
    bug.hit_seq = (bug.hit_seq + 1) >>> 0;
    if (bug.hp > 0 || !bug.alive) return;
    bug.alive = false; // first, so a second hit in the same tick can't double-award
    this._awardBugKill(sid, p, bug);
    if (bug.kind === 'bug-toxic') this._spawnToxicCloud(bug.x, bug.y);
    this.clock.setTimeout(() => this._removeBug(bugId), 400);
  }

  _awardBugKill(sid, p, bug) {
    const ps = this._playerState.get(sid);
    const now = Date.now();
    if (ps && (now - ps.lastKillAt) < COMBO_TIMEOUT_MS) {
      p.combo = Math.min(99, (p.combo | 0) + 1);
    } else {
      p.combo = 1;
    }
    if (ps) ps.lastKillAt = now;
    let gain;
    if (bug.kind === GOLDEN_BUG.kind) {
      gain = this.events.onGoldenKilled(sid, p);
    } else {
      const base = BUG_KIND_SCORE[bug.kind] ?? 10;
      gain = Math.round(base * comboMult(p.combo) * this.events.mod('scoreMul', 1)
        * this._newSessionXpMul(sid, now));
    }
    this._grantXP(sid, p, gain);
    this._sendTo(sid, 'kill', { gain, kind: bug.kind, combo: p.combo });
    if (COMBO_FEED_AT.includes(p.combo)) {
      this._feed({ text: `⚡ ${p.name} is on a ×${p.combo} combo!`, color: '#ff9800', a: sid });
    }
    this.bots.onBugKill(sid, p.combo);
  }

  /** EP-20 catch-up: humans earn ×NEW_SESSION_XP_MUL bug-kill XP for the first
   *  NEW_SESSION_XP_MS of their session (bots never — they'd outpace the newbie). */
  _newSessionXpMul(sid, now = Date.now()) {
    if (this.bots.isBot(sid)) return 1;
    const ps = this._playerState.get(sid);
    return (ps && now - ps.joinedAt < NEW_SESSION_XP_MS) ? NEW_SESSION_XP_MUL : 1;
  }

  /** Add score + XP; handles level-ups (max bars grow, topped up by the increment). */
  _grantXP(sid, p, amount) {
    if (!p || !(amount > 0)) return;
    p.score += amount;
    p.xp += amount;
    const newLevel = levelFromXP(p.xp);
    if (newLevel <= p.level) return;
    const oldLevel = p.level;
    p.level = newLevel;
    const newMaxE = maxEnergyForLevel(newLevel);
    const newMaxH = maxHealthForLevel(newLevel);
    if (!p.broken) {
      p.energy = Math.min(newMaxE, p.energy + Math.max(0, newMaxE - p.maxEnergy));
      p.health = Math.min(newMaxH, p.health + Math.max(0, newMaxH - p.maxHealth));
    }
    p.maxEnergy = newMaxE;
    p.maxHealth = newMaxH;
    if (newLevel >= 3) {
      this._feed({ text: `⭐ ${p.name} got promoted to ${levelTitle(newLevel)}!`, color: '#ffd23f', a: sid });
    }
    if (newLevel === LEVEL_TITLES.length && oldLevel < newLevel) {
      this._announce({ title: `👑 ${p.name} IS A SUPER SENIOR`, sub: 'Max level · now try not to burn out', color: '#ffd700', big: true });
    }
    this.bots.onLevelUp(sid, newLevel);
  }

  /**
   * PvP hit from attacker p (aSid) on victim other (vSid). `source` picks the
   * skill multiplier ('smash' | 'dash' | 'ult'); damage also scales by the
   * level matchup. Returns true if damage landed (not dodged/absorbed).
   */
  _applyPvpHit(aSid, p, other, vSid, source = 'smash') {
    if (other.broken || aSid === vSid || p.away) return false;
    // Away (reconnect grace): bots leave a frozen stickman alone, but humans
    // can still land hits — unplugging is never an escape from a fight.
    if (other.away && this.bots.isBot(aSid)) return false;
    // Boss truce: no PvP while the Deadline is out (co-op moment).
    if (this.events.mod('truce', false)) return false;
    // Roll invulnerability / spawn protection — drop the hit completely.
    if (Date.now() < (other.invulnUntil || 0)) return false;
    this.bots.onPlayerHit(aSid, vSid);
    // Laptop Shield absorbs the next hit completely and consumes itself.
    if (other.shielded) {
      other.shielded = false;
      return false;
    }
    const dmg = pvpDamage(p, other, source);
    other.health = Math.max(0, other.health - dmg);
    if (other.health === 0) this._enterBroken(other, vSid, { type: 'player', sid: aSid });
    return true;
  }

  /** Non-player damage (bug bite, toxic cloud, boss slam). Respects shield + invuln.
   *  `killer` = { type: 'bug', kind } | { type: 'cloud' } | { type: 'boss' }.
   *  Returns true if damage landed. */
  _applyBugContactDamage(victim, vSid, dmg, killer = null) {
    if (victim.broken || victim.away) return false; // bugs/clouds/boss ignore away players
    if (Date.now() < (victim.invulnUntil || 0)) return false;
    if (victim.shielded) { victim.shielded = false; return false; }
    victim.health = Math.max(0, victim.health - dmg);
    if (victim.health === 0) this._enterBroken(victim, vSid, killer);
    return true;
  }

  _enterBroken(p, sessionId, killer = null) {
    if (p.broken) return;
    const wasScore = p.score; // points earned this life — drives the bug drop
    const wasCrown = this.state.crownSid === sessionId;
    const bounty = this.state.bounty | 0;
    // EP-02: repair time by the level you fell at (Intern 8 s … Super Senior 20 s).
    const brokenMs = brokenMsForLevel(p.level);
    // EP-20: THE DEADLINE knocking you out during its truce (co-op raid) never
    // costs your career — no level/XP/score reset and no bug spew.
    const keepCareer = killer?.type === 'boss' && this.events.mod('truce', false);
    p.broken = true;
    p.broken_seq = (p.broken_seq + 1) >>> 0;
    p.brokenUntil = Date.now() + brokenMs;
    // Reset progression. Health + energy restore on exit; while broken they
    // sit at 0 (visible empty bars) so the recovery beat reads clearly.
    if (!keepCareer) {
      p.level = 1;
      p.xp = 0;
      p.maxEnergy = LEVEL_MAX_ENERGY[0];
      p.maxHealth = LEVEL_MAX_HEALTH[0];
    }
    p.energy = 0;
    p.health = 0;
    p.combo = 0;
    p.action = 'parry'; // re-use parry pose as "fixing laptop"
    p.action_seq = (p.action_seq + 1) >>> 0;
    p.cdQ = 0; p.cdW = 0; p.cdE = 0; p.cdR = 0;
    p.shielded = false;
    p.invulnUntil = 0;
    p.stunnedUntil = 0;

    // Personal Mode: defeated players spew bugs; score then RESETS to zero.
    if (this.state.friendlyFire && !keepCareer) {
      const dropCount = Math.min(10, 2 + Math.floor(wasScore / 50));
      for (let i = 0; i < dropCount; i++) {
        const angle = (Math.PI * 2 * i) / dropCount + Math.random() * 0.6;
        const radius = 30 + Math.random() * 60;
        this._spawnBugAt(p.x + Math.cos(angle) * radius, p.y + Math.sin(angle) * radius);
      }
      p.score = 0;
    }
    if (wasCrown) { this.state.crownSid = ''; this.state.bounty = 0; }

    // ── Drama: kill feed, streaks, shutdowns, bounty ──
    const vps = this._playerState.get(sessionId);
    const victimStreak = vps ? vps.koStreak : 0;
    if (vps) vps.koStreak = 0;
    const vName = p.name;
    if (killer?.type === 'player') {
      const a = this.state.players.get(killer.sid);
      const aps = this._playerState.get(killer.sid);
      if (a && aps) {
        aps.koStreak += 1;
        aps.kos += 1;
        this._feed({ text: `💻 ${pickLine(KO_LINES, { a: a.name, b: vName })}`, color: '#ff8a8a', a: killer.sid, b: sessionId });
        this._sendTo(killer.sid, 'ko', { victim: vName, streak: aps.koStreak });
        this._sendTo(sessionId, 'brokenBy', { by: a.name, ms: brokenMs });
        const tier = STREAK_TIERS.find((t) => t.at === aps.koStreak)
          || (aps.koStreak > 12 && aps.koStreak % 4 === 0
            ? { icon: '👹', label: 'UNSTOPPABLE — somebody page the CTO' } : null);
        if (tier) {
          this._announce({ title: `${tier.icon} ${a.name} is ${tier.label}`, sub: `${aps.koStreak} laptops broken in a row`, color: '#ff9800' });
        }
        if (victimStreak >= SHUTDOWN_MIN_STREAK) {
          const bonus = SHUTDOWN_XP_PER_KO * victimStreak;
          this._grantXP(killer.sid, a, bonus);
          this._announce({ title: `💥 SHUTDOWN! ${a.name} ended ${vName}'s streak`, sub: `${victimStreak}-KO streak over · +${bonus} XP`, color: '#ff5e94' });
        }
        if (wasCrown && bounty > 0) {
          this._grantXP(killer.sid, a, bounty);
          this._announce({ title: `💰 ${a.name} CLAIMED THE BOUNTY`, sub: `${vName} lost the Tech Lead crown · +${bounty} XP`, color: '#ffd700', big: true });
          this._sendTo(killer.sid, 'reward', { kind: 'bounty', xp: bounty });
        }
        this.bots.onPlayerKO(killer.sid, sessionId);
      }
    } else if (killer?.type === 'bug') {
      const bug = BUG_DISPLAY_NAME[killer.kind] || 'bug';
      this._feed({ text: `🐞 ${pickLine(BUG_KO_LINES, { b: vName, bug })}`, color: '#c9a0ff', b: sessionId });
      this._sendTo(sessionId, 'brokenBy', { by: `a ${bug}`, ms: brokenMs });
    } else if (killer?.type === 'cloud') {
      this._feed({ text: pickLine(CLOUD_KO_LINES, { b: vName }), color: '#7ed957', b: sessionId });
      this._sendTo(sessionId, 'brokenBy', { by: 'toxic fumes', ms: brokenMs });
    } else if (killer?.type === 'boss') {
      this._feed({ text: `⏰ ${pickLine(BOSS_KO_LINES, { b: vName })}`, color: '#ff5252', b: sessionId });
      this._sendTo(sessionId, 'brokenBy', { by: 'THE DEADLINE', ms: brokenMs, kept: keepCareer });
    }
    this.bots.onBroken(sessionId);

    // Only THIS defeat's timer may repair the laptop (seq guard: durations vary now).
    const seq = p.broken_seq;
    this.clock.setTimeout(() => {
      const cur = this.state.players.get(sessionId);
      if (cur && cur.broken && cur.broken_seq === seq) this._exitBroken(cur);
    }, brokenMs);
  }

  _exitBroken(p) {
    p.broken = false;
    p.broken_seq = (p.broken_seq + 1) >>> 0;
    p.brokenUntil = 0;
    p.energy = p.maxEnergy;
    p.health = p.maxHealth;
    p.action = 'idle';
    p.action_seq = (p.action_seq + 1) >>> 0;
    // Freshly repaired laptop — brief spawn protection so nobody farms you.
    p.invulnUntil = Date.now() + SPAWN_PROTECT_MS;
  }

  // ───────────────────────── spawning ─────────────────────────

  /** Spawn one new obstacle at a randomly-chosen safe position. */
  _spawnRandomObstacle() {
    const variant = OBSTACLE_VARIANTS[Math.floor(Math.random() * OBSTACLE_VARIANTS.length)];
    const w = variant.w, h = variant.h;
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = 120 + Math.random() * (ARENA_W - w - 240);
      const y = 120 + Math.random() * (ARENA_H - h - 240);
      let overlap = false;
      this.state.obstacles.forEach((other) => {
        if (overlap) return;
        if (x < other.x + other.w + OBSTACLE_PADDING &&
            x + w + OBSTACLE_PADDING > other.x &&
            y < other.y + other.h + OBSTACLE_PADDING &&
            y + h + OBSTACLE_PADDING > other.y) overlap = true;
      });
      if (overlap) continue;
      let tooClose = false;
      const cx = x + w / 2, cy = y + h / 2;
      const minD2 = OBSTACLE_MIN_DIST_FROM_PLAYER * OBSTACLE_MIN_DIST_FROM_PLAYER;
      this.state.players.forEach((p) => {
        if (tooClose) return;
        const dx = p.x - cx, dy = p.y - cy;
        if (dx * dx + dy * dy < minD2) tooClose = true;
      });
      if (tooClose) continue;
      // The Deadline boss stomps obstacles — don't drop one under it.
      const boss = this.events.bossEntity();
      if (boss && Math.hypot(boss.ent.x - cx, boss.ent.y - cy) < 260) continue;
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
    const reach = 110; // a bit larger than SMASH_RADIUS so obstacle hits feel generous
    const reach2 = reach * reach;
    const toBreak = [];
    this.state.obstacles.forEach((ob, id) => {
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
  // (no round flow). Kept as a reference for the future Team Mode room class.
  _enterResults() {
    this.state.phase = 'results';
    this.state.timeLeftMs = PHASE_RESULTS_MS;
    let best = null;
    this.state.players.forEach((p) => {
      if (!best || p.score > best.score) best = p;
    });
    this.state.winnerName  = best?.name  || '—';
    this.state.winnerScore = best?.score || 0;
  }

  _enterPlaying() {
    this.state.phase = 'playing';
    this.state.timeLeftMs = PHASE_PLAYING_MS;
    this.state.round += 1;
    this.state.players.forEach((p) => {
      p.score = 0; p.combo = 0; p.action = 'idle';
      p.level = 1; p.xp = 0;
      p.maxEnergy = LEVEL_MAX_ENERGY[0];
      p.energy = p.maxEnergy;
      p.maxHealth = LEVEL_MAX_HEALTH[0];
      p.health = p.maxHealth;
      p.broken = false; p.brokenUntil = 0;
    });
    this._playerState.forEach((ps) => { ps.lastKillAt = 0; });
    this.state.bugs.forEach((_, id) => this.state.bugs.delete(id));
    this._bugAI.clear();
    this._lastSpawnAt = 0;
    this.state.pickups.forEach((_, id) => this.state.pickups.delete(id));
    this._lastPickupSpawnAt = 0;
    this.state.clouds.forEach((_, id) => this.state.clouds.delete(id));
    this._cloudDamageAt.clear();
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

  /** Spawn a health pickup — at `at` ({x,y}) if given, else a random free spot. */
  _spawnPickup(at = null) {
    const id = String(this._nextPickupId++);
    const h = new HealthPickup();
    let px = at?.x ?? 0, py = at?.y ?? 0;
    if (!at) {
      for (let i = 0; i < 6; i++) {
        px = 80 + Math.random() * (ARENA_W - 160);
        py = 100 + Math.random() * (ARENA_H - 200);
        if (!firstObstacleAt(this.state, px, py)) break;
      }
    }
    h.x = px; h.y = py;
    h.alive = true;
    this.state.pickups.set(id, h);
  }

  /** Check player vs all pickups; collect any within range. Pickups restore HEALTH + ENERGY. */
  _tryCollectPickups(p, sid) {
    // Skip if at max on BOTH bars — pickup persists for someone who needs it
    if (p.health >= p.maxHealth && p.energy >= p.maxEnergy) return;
    const r2 = (PICKUP_RADIUS + PLAYER_PICKUP_RADIUS) ** 2;
    this.state.pickups.forEach((h, id) => {
      if (!h.alive) return;
      const dx = p.x - h.x, dy = p.y - h.y;
      if (dx * dx + dy * dy <= r2) {
        p.health = Math.min(p.maxHealth, p.health + PICKUP_ENERGY_GAIN);
        p.energy = Math.min(p.maxEnergy, p.energy + PICKUP_ENERGY_REFILL);
        h.alive = false;
        this._sendTo(sid, 'pickup', {});
        this.clock.setTimeout(() => this.state.pickups.delete(id), 300);
      }
    });
  }

  /**
   * Spawn a bug at a position. `def` overrides the random kind roll:
   * { kind, hp, speed, golden? }. Returns the new bug id.
   */
  _spawnBugAt(x, y, def = null) {
    // Hard ceiling across every spawn path (nests, drops, minions, surges) —
    // the CEO's golden bug is exempt. Returns null when capped.
    if (!def?.golden && this.state.bugs.size >= HARD_MAX_BUGS) return null;
    const id = String(this._nextBugId++);
    const d = def || rollBugKind();
    const b = new Bug();
    b.kind = d.kind;
    b.hp = d.hp;
    b.alive = true;
    b.x = Math.max(40, Math.min(ARENA_W - 40, x));
    b.y = Math.max(60, Math.min(ARENA_H - 60, y));
    this.state.bugs.set(id, b);
    this._bugAI.set(id, {
      baseSpeed: d.speed,
      headingX: 0, headingY: 0,
      wanderX: 0, wanderY: 0,
      nextWanderAt: 0,
      spawnedAt: Date.now(),
      golden: !!d.golden,
      noAge: !!d.golden,
      phase: Math.random() * 6,
    });
    return id;
  }

  /** Regular spawn: sometimes near a human (keeps their screen lively), else anywhere. */
  _spawnBug() {
    const humans = this.humanPlayers();
    if (humans.length && Math.random() < SPAWN_NEAR_HUMAN_CHANCE) {
      const h = humans[Math.floor(Math.random() * humans.length)];
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = SPAWN_NEAR_HUMAN_RING[0] + Math.random() * (SPAWN_NEAR_HUMAN_RING[1] - SPAWN_NEAR_HUMAN_RING[0]);
        const x = h.x + Math.cos(a) * r, y = h.y + Math.sin(a) * r;
        if (x < 60 || x > ARENA_W - 60 || y < 80 || y > ARENA_H - 80) continue;
        if (firstObstacleAt(this.state, x, y)) continue;
        this._spawnBugAt(x, y);
        return;
      }
    }
    // Uniform fallback — retry a few times to avoid spawning inside an obstacle
    let bx = 0, by = 0;
    for (let i = 0; i < 6; i++) {
      bx = 60 + Math.random() * (ARENA_W - 120);
      by = 80 + Math.random() * (ARENA_H - 160);
      if (!firstObstacleAt(this.state, bx, by)) break;
    }
    this._spawnBugAt(bx, by);
  }

  _removeBug(id) {
    this.state.bugs.delete(id);
    this._forgetBug(id);
  }
  _forgetBug(id) {
    this._bugAI.delete(id);
    this._bugAttackCD.delete(id);
  }

  _countAliveBugs() {
    let n = 0;
    this.state.bugs.forEach((b) => { if (b.alive) n++; });
    return n;
  }

  // ───────────────────────── lifecycle ─────────────────────────
  /**
   * Pass 2 RP-02: one live session per player id (join option `pid`). A second tab gets 'DUP_TAB'
   * (it can PLAY HERE → POST /api/session/takeover, then join again). This player's own away
   * (held) stickman is dropped first, so a reload never leaves a twin behind.
   */
  onAuth(_client, options) {
    const pub = publicIdOf(options?.pid);
    const why = Presence.check(pub, 'arena', this);
    if (why) throw new Error(why);
    return { pub };
  }

  /** Presence hook: drop this player's away stickman (a new tab of the same player is joining). */
  dropHeld(sid) {
    const w = this._holdWaits?.get(sid);
    if (!w) return;
    this._holdWaits.delete(sid);
    try { w.reject?.(new Error('replaced')); } catch (_) { /* settled */ }
  }

  onJoin(client, options) {
    const pub = (client.auth && client.auth.pub) || '';
    if (pub) { (this._pubs ||= new Map()).set(client.sessionId, pub); Presence.register(pub, { mode: 'arena', room: this, sid: client.sessionId, client }); }
    const wasEmpty = this.humanCount() === 0;
    const p = this._addPlayer(client.sessionId, { name: options?.name, hat: options?.hat });
    console.log(`[ArenaRoom] +join ${client.sessionId} as "${p.name}" (humans ${this.humanCount()}, bots ${this.bots.count})`);
    this._feed({ text: `☕ ${pickLine(JOIN_LINES, { a: p.name })}`, color: '#8fd6a0', a: client.sessionId });
    // First human in: a few coworkers are already at their desks.
    if (wasEmpty && this.bots.count === 0) this.bots.seed(4);
    this._spawnWelcomeBugs(p);
  }

  /** A few easy bugs right on screen so the first seconds aren't empty. */
  _spawnWelcomeBugs(p) {
    const easy = BUG_KINDS.filter((k) => k.kind === 'bug-ladybug' || k.kind === 'bug-null');
    for (let i = 0; i < WELCOME_BUGS; i++) {
      for (let t = 0; t < 6; t++) {
        const a = Math.random() * Math.PI * 2;
        const r = WELCOME_BUG_RING[0] + Math.random() * (WELCOME_BUG_RING[1] - WELCOME_BUG_RING[0]);
        const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
        if (firstObstacleAt(this.state, x, y)) continue;
        this._spawnBugAt(x, y, easy[Math.floor(Math.random() * easy.length)]);
        break;
      }
    }
  }

  /**
   * EP-01 reconnect grace. A consented leave (room.leave() → close 4000) removes
   * the player at once. Any other close (Wi-Fi blip, tab killed, socket error)
   * keeps the stickman for RECONNECT_GRACE_S as `away`: frozen, ignored by bots /
   * bugs / boss, but still damageable by humans. Colyseus resolves the wait when
   * the client calls `client.reconnect(room.reconnectionToken)`; onAuth is NOT
   * run on that path and the new Client inherits the old `userData`.
   */
  async onLeave(client, consented) {
    const sid = client.sessionId;
    const p = this.state.players.get(sid);
    const pub = this._pubs?.get(sid) || '';
    // Pass 2: a tab closed by PLAY HERE (Presence takeover, close 4010) leaves for good — no twin.
    if (client.userData?.takenOver) consented = true;
    if (p && !consented && RECONNECT_GRACE_S > 0) {
      Presence.setConnected(pub, this, sid, false);
      p.away = true;
      p.action = 'idle';
      p.action_seq = (p.action_seq + 1) >>> 0;
      this._feed({ text: `📶 ${pickLine(AWAY_LINES, { a: p.name })}`, color: '#8890a0', a: sid });
      console.log(`[ArenaRoom] ~away ${sid} "${p.name}" (grace ${RECONNECT_GRACE_S}s)`);
      try {
        const wait = this.allowReconnection(client, RECONNECT_GRACE_S);
        (this._holdWaits ||= new Map()).set(sid, wait);
        const newClient = await wait;
        this._holdWaits.delete(sid);
        const cur = this.state.players.get(sid);
        if (cur) {
          Presence.setConnected(pub, this, sid, true, newClient);
          cur.away = false;
          cur._lastMoveAt = Date.now(); // first move after the gap gets a fresh step budget
          // A new Client object: answer its `hello` again (userData was copied over).
          newClient.userData = { ...(newClient.userData || {}), helloed: false, historySent: false };
          this._feed({ text: `🔌 ${pickLine(BACK_LINES, { a: cur.name })}`, color: '#8fd6a0', a: sid });
          console.log(`[ArenaRoom] +back ${sid} "${cur.name}" (Lv${cur.level}, score ${cur.score})`);
          return;
        }
        // Removed while away (shouldn't happen): no stickman to return to.
        try { newClient.leave?.(4000); } catch (_) { /* already closing */ }
      } catch (_) { /* grace expired, replaced by a new tab, or the room is disposing */ }
      this._holdWaits?.delete(sid);
    }
    Presence.unregister(pub, this, sid);
    this._pubs?.delete(sid);
    const name = this.state.players.get(sid)?.name;
    this._removePlayer(sid);
    if (name) this._feed({ text: `🚪 ${pickLine(LEAVE_LINES, { a: name })}`, color: '#8890a0' });
    console.log(`[ArenaRoom] -leave ${sid} (humans ${this.humanCount()}, bots ${this.bots.count})`);
  }

  onDispose() {
    // (Pending reconnections are rejected by Colyseus on dispose → onLeave cleans up.)
    Presence.unregisterRoom(this);
    console.log('[ArenaRoom] disposed', this.roomId);
  }

  /** Safety net: Colyseus wraps every handler / tick / timer with this, so one
   *  bad message or edge case logs instead of taking every room down. */
  onUncaughtException(err, methodName) {
    console.error(`[ArenaRoom] ${methodName} threw:`, err?.message || err);
  }
}

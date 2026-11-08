// BotDirector — AI coworkers that keep the arena alive when few humans are on.
//
// Bots are ordinary Player entries in the synced state (isBot = true). They act
// ONLY through the room's own handler methods (_doMove / _doSmash / _doAction /
// _doCastSkill), so they obey exactly the same energy, range, stun and broken
// rules as humans. Nothing here bypasses the game rules.
//
// Brain loop per bot:
//   think  (every ~300-400 ms) — pick a mode + target, consider skills
//   steer  (every tick)        — walk toward the target, detour around walls
//   attack (every tick)        — swing when the target is in reach
//
// Modes: hunt (bugs) · fight (PvP) · raid (boss) · golden (CEO bug) ·
//        heal (pickup) · flee · wander · broken.
import {
  ARENA_W, ARENA_H, SMASH_RADIUS, SKILL_ENERGY, ULT_RADIUS,
  BUG_KIND_SCORE, BUG_ATTACK, LEVEL_XP_THRESHOLDS, levelTitle, firstObstacleAt,
  DASH_DISTANCE, DASH_HIT_RADIUS, distToSegment,
} from './rules.js';
import {
  BOT_FILL_TARGET, BOT_MAX, BOT_ADJUST_EVERY_MS, BOT_NAMES, BOT_ARCHETYPES,
  BOT_HATS, BOT_LEAVE_REASONS, BOT_LINES, BOT_REPLIES, BOT_CHURN_EVERY_MS,
} from '../data/bots.js';
import { GOLDEN_BUG } from '../data/events.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function pickWeightedKey(obj) {
  const keys = Object.keys(obj);
  const total = keys.reduce((s, k) => s + (obj[k].weight || 1), 0);
  let r = Math.random() * total;
  for (const k of keys) { r -= (obj[k].weight || 1); if (r <= 0) return k; }
  return keys[0];
}

export class BotDirector {
  constructor(room) {
    this.room = room;
    this.bots = new Map();          // sid -> brain
    this._nextId = 1;
    this._nextAdjustAt = 0;
    this._globalChatAt = 0;
    this._nextIdleChatAt = Date.now() + rand(14000, 26000);
    this._nextChurnAt = Date.now() + rand(...BOT_CHURN_EVERY_MS);
  }

  get count() { return this.bots.size; }
  isBot(sid) { return this.bots.has(sid); }

  // ───────────────────────── population ─────────────────────────

  /** Desired bot count for the current human population. */
  desired() {
    const humans = this.room.humanCount();
    if (humans <= 0) return 0;
    return Math.max(0, Math.min(BOT_MAX, BOT_FILL_TARGET - humans));
  }

  /** First human in an empty room: a few coworkers are "already at their desks". */
  seed(n) {
    const want = Math.min(n, this.desired());
    for (let i = 0; i < want; i++) this.addBot({ warm: true, silent: true });
  }

  _adjustPopulation(now) {
    if (now < this._nextAdjustAt) return;
    const desired = this.desired();
    const room = this.room;
    if (this.bots.size < desired && room.state.players.size < room.maxClients) {
      this.addBot({ warm: Math.random() < 0.5 });
    } else if (this.bots.size > desired) {
      this.removeBot();
    } else if (desired > 0 && now >= this._nextChurnAt) {
      // Organic churn: now and then a coworker heads home and someone new
      // clocks in (the next adjust refills), so a solo room doesn't feel scripted.
      this._nextChurnAt = now + rand(...BOT_CHURN_EVERY_MS);
      this.removeBot();
    }
    // Fill quickly while the room is still sparse, then trickle.
    const sparse = this.bots.size < desired / 2;
    this._nextAdjustAt = now + (sparse ? rand(500, 900) : rand(...BOT_ADJUST_EVERY_MS));
  }

  _pickName() {
    const used = new Set();
    this.room.state.players.forEach((p) => used.add(p.name));
    const free = BOT_NAMES.filter((n) => !used.has(n));
    if (free.length) return pick(free);
    return `Contractor_${Math.floor(rand(100, 999))}`;
  }

  /** Spawn spot: some near a human (so they wander on-screen soon), never inside walls. */
  _spawnPoint() {
    const st = this.room.state;
    const humans = this.room.humanPlayers();
    for (let i = 0; i < 16; i++) {
      let x, y;
      if (humans.length && Math.random() < 0.6) {
        const h = pick(humans);
        const a = Math.random() * Math.PI * 2, r = rand(420, 950); // just past the screen edge
        x = h.x + Math.cos(a) * r; y = h.y + Math.sin(a) * r;
      } else {
        x = rand(150, ARENA_W - 150); y = rand(150, ARENA_H - 150);
      }
      x = Math.max(80, Math.min(ARENA_W - 80, x));
      y = Math.max(100, Math.min(ARENA_H - 100, y));
      if (firstObstacleAt(st, x, y)) continue;
      // Don't pop in right on top of a human
      if (humans.some((h) => Math.hypot(h.x - x, h.y - y) < 320)) continue;
      return { x, y };
    }
    return { x: rand(300, ARENA_W - 300), y: rand(300, ARENA_H - 300) };
  }

  addBot({ warm = false, silent = false } = {}) {
    const room = this.room;
    const sid = `bot_${this._nextId++}`;
    const archKey = pickWeightedKey(BOT_ARCHETYPES);
    const arch = BOT_ARCHETYPES[archKey];
    const pos = this._spawnPoint();
    // "Warm" bots joined a while ago — give them some career progress so the
    // leaderboard looks lived-in instead of a row of fresh Interns. Kept modest
    // (0–~450, mostly low) so a new human climbs past a few bots in a minute or two.
    const startXp = warm ? Math.round(rand(0, 1) ** 2 * LEVEL_XP_THRESHOLDS[2] * 0.75) : 0;
    const p = room._addPlayer(sid, {
      name: this._pickName(), hat: pick(BOT_HATS), isBot: true,
      x: pos.x, y: pos.y, startXp,
    });
    const now = Date.now();
    this.bots.set(sid, {
      sid, archKey, arch,
      speed: 200 + arch.skill * 34,                 // humans move at 240
      smashEveryMs: 430 - arch.skill * 170,         // humans can swing every 220
      thinkEveryMs: 520 - arch.skill * 240,
      mode: 'wander', target: null, fightUntil: 0,
      nextThinkAt: now + rand(100, 500), nextSmashAt: 0,
      stuckMs: 0, detourUntil: 0, detourX: 0, detourY: 0,
      provokedBy: null, provokedUntil: 0, lastDamagedAt: 0, lastHealth: p.health,
      // Short initial cooldown — the join greeting fires 1.5–4 s after arriving.
      dodge: null, chatAt: now + rand(800, 1400),
    });
    room._onBotsChanged();
    if (!silent) {
      // Say hi a moment after arriving, like a person settling in.
      room.clock.setTimeout(() => this.say(sid, 'join', {}, { prob: 0.45 }), rand(1500, 4000));
    }
    return sid;
  }

  removeBot(sidArg) {
    const room = this.room;
    let sid = sidArg;
    if (!sid) {
      // Prefer the least-invested bot that isn't wearing the crown.
      let best = null, bestScore = Infinity;
      for (const b of this.bots.values()) {
        const p = room.state.players.get(b.sid);
        if (!p) { best = b.sid; break; }
        if (b.sid === room.state.crownSid) continue;
        const s = p.score + (p.broken ? -10000 : 0);
        if (s < bestScore) { bestScore = s; best = b.sid; }
      }
      sid = best || this.bots.keys().next().value;
    }
    if (!sid) return;
    const p = room.state.players.get(sid);
    const name = p?.name;
    this.bots.delete(sid);
    room._removePlayer(sid);
    room._onBotsChanged();
    if (name) room._feed({ text: `🏠 ${name} ${pick(BOT_LEAVE_REASONS)}`, color: '#8890a0' });
  }

  removeAll() {
    for (const sid of [...this.bots.keys()]) {
      this.bots.delete(sid);
      this.room._removePlayer(sid);
    }
    this.room._onBotsChanged();
  }

  // ───────────────────────── per-tick ─────────────────────────

  tick(dtMs, now) {
    this._adjustPopulation(now);
    for (const b of this.bots.values()) {
      const p = this.room.state.players.get(b.sid);
      if (!p) { this.bots.delete(b.sid); continue; }
      if (p.health < b.lastHealth) b.lastDamagedAt = now;
      b.lastHealth = p.health;
      if (now >= b.nextThinkAt) {
        b.nextThinkAt = now + b.thinkEveryMs * rand(0.8, 1.25);
        this._think(b, p, now);
      }
      const dest = this._destination(b, p, now);
      if (dest) this._steer(b, p, dest, dtMs, now);
      if (!p.broken) this._tryAttack(b, p, now);
    }
    this._idleChatter(now);
  }

  // ───────────────────────── decisions ─────────────────────────

  _think(b, p, now) {
    const room = this.room;
    const ev = room.events;
    b.dodge = null;

    if (p.broken) {
      // Defenseless: drift away from whoever is closest, toward safety.
      const threat = this._nearestThreat(p, 520);
      b.mode = 'broken';
      b.target = threat ? this._fleePoint(p, threat) : this._wanderPoint(p);
      return;
    }

    // Boss slam telegraph under us? React (sharper bots react more often).
    const slam = ev.slamThreat(p.x, p.y, now);
    if (slam && Math.random() < 0.35 + b.arch.skill * 0.6) {
      const dx = p.x - slam.x, dy = p.y - slam.y;
      const d = Math.hypot(dx, dy) || 1;
      const out = slam.r + 50;
      b.dodge = { x: slam.x + (dx / d) * out, y: slam.y + (dy / d) * out };
      // Emergency jump if the circle is about to land and we're deep inside
      if (slam.msLeft < 450 && d < slam.r * 0.7) this._cast(b, p, 'e', dx / d, dy / d);
      return;
    }

    const hRatio = p.health / Math.max(1, p.maxHealth);

    // 1) Heal when hurt
    if (hRatio < b.arch.fleeHp) {
      const pk = this._nearestPickup(p);
      const threat = this._nearestThreat(p, 260);
      if (threat && dist(p, threat) < 120 && Math.random() < 0.5) {
        const dx = p.x - threat.x, dy = p.y - threat.y, d = Math.hypot(dx, dy) || 1;
        this._cast(b, p, 'e', dx / d, dy / d); // panic jump away
      }
      if (pk) { b.mode = 'heal'; b.target = { type: 'pickup', id: pk.id, x: pk.x, y: pk.y }; return; }
      if (threat) { b.mode = 'flee'; b.target = this._fleePoint(p, threat); return; }
    }

    // 2) The Deadline boss — everyone raids
    const boss = ev.bossEntity();
    if (boss && dist(p, boss.ent) < 2600) {
      b.mode = 'raid';
      b.target = { type: 'boss', id: boss.id };
      this._considerSkills(b, p, now, boss.ent);
      return;
    }

    // 3) The CEO's golden bug
    const goldId = ev.goldenBugId();
    const gold = goldId ? room.state.bugs.get(goldId) : null;
    if (gold && gold.alive) {
      const d = dist(p, gold);
      // Humans get a clean head start: no bot races for it until the window
      // is over (cowards only ever go when it's close).
      const headStartOver = ev.activeElapsedMs() > GOLDEN_BUG.botChaseDelayMs;
      if (headStartOver && d < 2400 && (b.archKey !== 'coward' || d < GOLDEN_BUG.botChaseRadius)) {
        b.mode = 'golden';
        b.target = { type: 'bug', id: goldId };
        const gx = (gold.x - p.x) / d, gy = (gold.y - p.y) / d;
        if (d > 110 && d < 300 && Math.random() < 0.3 + b.arch.skill * 0.4
            && !this._wouldDashHitBystander(b, p, gx, gy)) {
          this._cast(b, p, 'q', gx, gy);
        }
        return;
      }
    }

    const truce = ev.mod('truce', false);

    // 4) Keep fighting a current opponent for a while
    if (!truce && b.mode === 'fight' && b.target?.type === 'player' && now < b.fightUntil) {
      const enemy = room.state.players.get(b.target.id);
      if (this._validPvpTarget(enemy, now) && dist(p, enemy) < 700) {
        this._considerSkills(b, p, now, enemy);
        return;
      }
    }

    // 5) Retaliate (or run) when a player hit us recently
    if (!truce && b.provokedBy && now < b.provokedUntil) {
      const enemy = room.state.players.get(b.provokedBy);
      if (this._validPvpTarget(enemy, now) && dist(p, enemy) < 600) {
        if (Math.random() < b.arch.retaliate) {
          this._startFight(b, b.provokedBy, now);
          this._considerSkills(b, p, now, enemy);
        } else {
          b.mode = 'flee';
          b.target = this._fleePoint(p, enemy);
        }
        b.provokedBy = null;
        return;
      }
    }

    // 6) Opportunistic PvP (bounty hunting, finishing weakened enemies)
    const opp = truce ? null : this._findPvpTarget(b, p, now);
    if (opp) {
      this._startFight(b, opp, now);
      return;
    }

    // 7) Hunt bugs
    const bug = this._pickBug(b, p);
    if (bug) {
      b.mode = 'hunt';
      b.target = { type: 'bug', id: bug.id };
      this._considerSkills(b, p, now, bug.ent);
      return;
    }

    // 8) Wander (biased toward humans so their screen stays lively)
    if (b.mode !== 'wander' || !b.target || b.target.type !== 'point'
        || Math.hypot(p.x - b.target.x, p.y - b.target.y) < 40) {
      b.mode = 'wander';
      b.target = this._wanderPoint(p);
    }
  }

  _startFight(b, sid, now) {
    b.mode = 'fight';
    b.target = { type: 'player', id: sid };
    b.fightUntil = now + rand(5000, 9000);
  }

  _validPvpTarget(other, now) {
    return !!other && !other.broken && now >= (other.invulnUntil || 0);
  }

  /** How many bots are currently fighting this player (anti-dogpile for humans). */
  _attackersOn(sid) {
    let n = 0;
    for (const o of this.bots.values()) if (o.mode === 'fight' && o.target?.id === sid) n++;
    return n;
  }

  _findPvpTarget(b, p, now) {
    if (b.arch.aggression <= 0) return null;
    if (p.health / Math.max(1, p.maxHealth) < 0.6) return null;
    const room = this.room;
    const crown = room.state.crownSid;
    let best = null, bestScore = 0;
    room.state.players.forEach((other, sid) => {
      if (sid === b.sid || !this._validPvpTarget(other, now)) return;
      const d = Math.hypot(other.x - p.x, other.y - p.y);
      if (d > 400) return;
      const human = !this.isBot(sid);
      // Fairness: leave fresh human Interns alone unless they wear the crown,
      // don't stomp humans more than a level below, and never let more than
      // 2 bots gang up on one human.
      if (human && sid !== crown && (other.level < 2 || other.level < p.level - 1)) return;
      if (human && this._attackersOn(sid) >= 2) return;
      let s = b.arch.aggression;
      if (sid === crown) s += 0.35;                                   // bounty hunter
      s += (1 - other.health / Math.max(1, other.maxHealth)) * 0.3;  // finish them
      if (other.level > p.level + 1) s -= 0.15;                      // don't pick hopeless fights
      if (s > bestScore) { bestScore = s; best = sid; }
    });
    // Per-think roll (~3×/s): a brawler near a target engages within a few
    // seconds; a grinder almost never starts a fight.
    if (best && Math.random() < bestScore * 0.07) return best;
    return null;
  }

  _pickBug(b, p) {
    const room = this.room;
    const humans = room.humanPlayers();
    const claimed = new Set();
    for (const o of this.bots.values()) {
      if (o !== b && o.target?.type === 'bug') claimed.add(o.target.id);
    }
    const lowHp = p.health / Math.max(1, p.maxHealth) < 0.5;
    let best = null, bestScore = 0;
    room.state.bugs.forEach((bug, id) => {
      if (!bug.alive || bug.hidden) return;
      // The CEO's bug has its own rules (human head start) — see _think step 3.
      if (bug.kind === GOLDEN_BUG.kind) return;
      const d = Math.hypot(bug.x - p.x, bug.y - p.y);
      if (d > 1200) return;
      if (lowHp && BUG_ATTACK[bug.kind]) return; // don't poke the robot while hurt
      let s = ((BUG_KIND_SCORE[bug.kind] ?? 10) + 10) / (d + 150);
      if (bug.kind === 'bug-race' && d > 160) s *= 0.3;             // too fast to run down
      if (claimed.has(id)) s *= 0.45;                               // spread out
      if (humans.some((h) => Math.hypot(h.x - bug.x, h.y - bug.y) < 700)) s *= 1.3; // where the action is
      if (s > bestScore) { bestScore = s; best = { id, ent: bug }; }
    });
    return best;
  }

  _nearestPickup(p) {
    let best = null, bestD = Infinity;
    this.room.state.pickups.forEach((h, id) => {
      if (!h.alive) return;
      const d = Math.hypot(h.x - p.x, h.y - p.y);
      if (d < bestD) { bestD = d; best = { id, x: h.x, y: h.y }; }
    });
    return (best && bestD < 2200) ? best : null;
  }

  /** Nearest aggressive bug or enemy player within `range`. */
  _nearestThreat(p, range) {
    let best = null, bestD = range;
    this.room.state.bugs.forEach((bug) => {
      if (!bug.alive || !BUG_ATTACK[bug.kind]) return;
      const d = Math.hypot(bug.x - p.x, bug.y - p.y);
      if (d < bestD) { bestD = d; best = { x: bug.x, y: bug.y }; }
    });
    this.room.state.players.forEach((o) => {
      if (o === p || o.broken) return;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < bestD) { bestD = d; best = { x: o.x, y: o.y }; }
    });
    return best;
  }

  _fleePoint(p, threat) {
    const dx = p.x - threat.x, dy = p.y - threat.y;
    const d = Math.hypot(dx, dy) || 1;
    return {
      type: 'point',
      x: Math.max(80, Math.min(ARENA_W - 80, p.x + (dx / d) * 420)),
      y: Math.max(100, Math.min(ARENA_H - 100, p.y + (dy / d) * 420)),
    };
  }

  _wanderPoint(p) {
    const humans = this.room.humanPlayers();
    let x, y;
    if (humans.length && Math.random() < 0.6) {
      const h = pick(humans);
      const a = Math.random() * Math.PI * 2, r = rand(200, 650);
      x = h.x + Math.cos(a) * r; y = h.y + Math.sin(a) * r;
    } else {
      const a = Math.random() * Math.PI * 2, r = rand(300, 900);
      x = p.x + Math.cos(a) * r; y = p.y + Math.sin(a) * r;
    }
    return {
      type: 'point',
      x: Math.max(80, Math.min(ARENA_W - 80, x)),
      y: Math.max(100, Math.min(ARENA_H - 100, y)),
    };
  }

  // ───────────────────────── skills ─────────────────────────

  _costOk(p, slot) {
    const mul = this.room.events.mod('skillCostMul', 1);
    const reserve = mul > 0 ? 6 : 0;
    return p.energy >= SKILL_ENERGY[slot] * mul + reserve;
  }

  _cast(b, p, slot, dirX = 0, dirY = 0) {
    if (p.broken || !this._costOk(p, slot)) return false;
    this.room._doCastSkill(b.sid, { slot, dirX, dirY });
    return true;
  }

  _considerSkills(b, p, now, target) {
    const free = this.room.events.mod('skillCostMul', 1) === 0;
    const spam = Math.min(1, b.arch.skillSpam * (free ? 3 : 1));
    // R — ult when it will hit a lot (or a boss / an enemy in a fight)
    let nearBugs = 0;
    this.room.state.bugs.forEach((bug) => {
      if (bug.alive && !bug.hidden && Math.hypot(bug.x - p.x, bug.y - p.y) < ULT_RADIUS * 0.85) nearBugs++;
    });
    const tD = target ? Math.hypot(target.x - p.x, target.y - p.y) : Infinity;
    const bossR = this.room.events.bossRadius();
    const ultWorth = nearBugs >= 4
      || (b.mode === 'fight' && tD < ULT_RADIUS * 0.8)
      || (b.mode === 'raid' && tD < ULT_RADIUS + bossR - 20);
    if (ultWorth && Math.random() < 0.45 * spam && !this._wouldSplashBystander(b, p)
        && this._cast(b, p, 'r')) return;
    // W — shield when taking hits in a fight/raid
    if ((b.mode === 'fight' || b.mode === 'raid') && !p.shielded
        && now - b.lastDamagedAt < 1200 && Math.random() < 0.5 * spam) {
      if (this._cast(b, p, 'w')) return;
    }
    // Q — dash to close the gap on a target (never through a bystander human)
    if (target && tD > 110 && tD < 300 && b.mode !== 'raid' && Math.random() < 0.25 * spam) {
      const qx = (target.x - p.x) / tD, qy = (target.y - p.y) / tD;
      if (!this._wouldDashHitBystander(b, p, qx, qy)) this._cast(b, p, 'q', qx, qy);
    }
  }

  /** Courtesy rule: don't ult when a human we're NOT fighting would get splashed
   *  (unless they wear the crown or just hit us). Irrelevant during a truce. */
  _wouldSplashBystander(b, p) {
    if (this.room.events.mod('truce', false)) return false;
    const crown = this.room.state.crownSid;
    let splash = false;
    this.room.state.players.forEach((o, sid) => {
      if (splash || sid === b.sid || o.broken || this.isBot(sid)) return;
      if (sid === crown || sid === b.provokedBy || b.target?.id === sid) return;
      if (Math.hypot(o.x - p.x, o.y - p.y) < ULT_RADIUS + 25) splash = true;
    });
    return splash;
  }

  /** Same courtesy for Q: a dash aimed at a bug must not clip a human we're not
   *  fighting (playtest: 9 dash hits / 3 KOs on a passive Intern in 15 min). */
  _wouldDashHitBystander(b, p, dirX, dirY) {
    if (this.room.events.mod('truce', false)) return false;
    const crown = this.room.state.crownSid;
    const ex = p.x + dirX * DASH_DISTANCE, ey = p.y + dirY * DASH_DISTANCE;
    let hit = false;
    this.room.state.players.forEach((o, sid) => {
      if (hit || sid === b.sid || o.broken || this.isBot(sid)) return;
      if (sid === crown || sid === b.provokedBy || b.target?.id === sid) return;
      if (distToSegment(o.x, o.y, p.x, p.y, ex, ey) <= DASH_HIT_RADIUS + 10) hit = true;
    });
    return hit;
  }

  // ───────────────────────── movement + attacks ─────────────────────────

  /** Resolve the bot's current destination → { x, y, stop } or null. */
  _destination(b, p, now) {
    if (b.dodge) return { x: b.dodge.x, y: b.dodge.y, stop: 8 };
    const t = b.target;
    if (!t) return null;
    const st = this.room.state;
    if (t.type === 'bug') {
      const bug = st.bugs.get(t.id);
      if (!bug || !bug.alive) { b.target = null; b.nextThinkAt = Math.min(b.nextThinkAt, now + 80); return null; }
      return { x: bug.x, y: bug.y, stop: 26 };
    }
    if (t.type === 'player') {
      const o = st.players.get(t.id);
      if (!this._validPvpTarget(o, now)) { b.target = null; b.mode = 'wander'; return null; }
      return { x: o.x, y: o.y, stop: 40 };
    }
    if (t.type === 'boss') {
      const boss = this.room.events.bossEntity();
      if (!boss) { b.target = null; return null; }
      return { x: boss.ent.x, y: boss.ent.y, stop: this.room.events.bossRadius() + 45 };
    }
    if (t.type === 'pickup') {
      const h = st.pickups.get(t.id);
      if (!h || !h.alive) { b.target = null; b.nextThinkAt = Math.min(b.nextThinkAt, now + 80); return null; }
      return { x: h.x, y: h.y, stop: 0 };
    }
    if (t.type === 'point') return { x: t.x, y: t.y, stop: 20 };
    return null;
  }

  _steer(b, p, dest, dtMs, now) {
    // Mid-teleport (dash/roll/knockback) or stunned: the room ignores moves —
    // wait it out instead of mistaking it for a wall and detouring.
    if (now < (p._ignoreMovesUntil || 0) || now < (p.stunnedUntil || 0)) { b.stuckMs = 0; return; }
    let dx = dest.x - p.x, dy = dest.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d <= dest.stop) { b.stuckMs = 0; return; }
    dx /= d; dy /= d;
    const detouring = now < b.detourUntil;
    if (detouring) { dx = b.detourX; dy = b.detourY; }
    const speed = b.speed * (p.broken ? 0.85 : 1);
    const step = speed * (dtMs / 1000);
    const ox = p.x, oy = p.y;
    this.room._doMove(b.sid, { x: p.x + dx * step, y: p.y + dy * step });
    const moved = Math.hypot(p.x - ox, p.y - oy);
    if (moved < step * 0.35) {
      b.stuckMs += dtMs;
      if (b.stuckMs > 200) {
        b.stuckMs = 0;
        if (detouring) {
          // Detour is blocked too — try the other way round.
          b.detourX = -b.detourX; b.detourY = -b.detourY;
        } else {
          const side = Math.random() < 0.5 ? 1 : -1;
          b.detourX = -dy * side; b.detourY = dx * side;
        }
        b.detourUntil = now + rand(450, 800);
      }
    } else {
      b.stuckMs = 0;
    }
  }

  _tryAttack(b, p, now) {
    if (now < b.nextSmashAt) return;
    const room = this.room;
    const st = room.state;
    const t = b.target;
    let msg = null;
    if (t?.type === 'bug') {
      const bug = st.bugs.get(t.id);
      if (bug && bug.alive && Math.hypot(bug.x - p.x, bug.y - p.y) <= SMASH_RADIUS * 0.92) msg = { id: t.id };
    } else if (t?.type === 'player') {
      const o = st.players.get(t.id);
      if (o && !o.broken && Math.hypot(o.x - p.x, o.y - p.y) <= SMASH_RADIUS * 0.9) msg = { targetSid: t.id };
    } else if (t?.type === 'boss') {
      const boss = room.events.bossEntity();
      if (boss && Math.hypot(boss.ent.x - p.x, boss.ent.y - p.y) <= SMASH_RADIUS + room.events.bossRadius() - 8) {
        msg = { boss: boss.id };
      }
    }
    if (!msg) {
      // Swing at whatever bug wandered into reach (like a human mashing SPACE) —
      // except the CEO's bug during the humans' head start.
      const goldOff = room.events.activeElapsedMs() <= GOLDEN_BUG.botChaseDelayMs;
      let near = null, nearD = SMASH_RADIUS * 0.8;
      st.bugs.forEach((bug, id) => {
        if (!bug.alive || bug.hidden) return;
        if (goldOff && bug.kind === GOLDEN_BUG.kind) return;
        const d = Math.hypot(bug.x - p.x, bug.y - p.y);
        if (d < nearD) { nearD = d; near = id; }
      });
      if (near) msg = { id: near };
    }
    if (!msg) return;
    b.nextSmashAt = now + b.smashEveryMs * rand(0.85, 1.2);
    room._doAction(b.sid, { kind: 'smash' });
    room._doSmash(b.sid, { ...msg, kind: 'smash' });
  }

  // ───────────────────────── chat + reactions ─────────────────────────

  /** Post a line from `sid` (with a short human-like typing delay). */
  say(sid, category, vars = {}, { prob = 1, force = false, delayMs = null } = {}) {
    const b = this.bots.get(sid);
    if (!b) return false;
    const now = Date.now();
    if (!force) {
      if (now < this._globalChatAt || now < b.chatAt) return false;
      if (Math.random() > prob * b.arch.chatty) return false;
    }
    const lines = BOT_LINES[category];
    if (!lines || !lines.length) return false;
    this._globalChatAt = now + rand(2600, 4600);
    b.chatAt = now + rand(12000, 24000);
    const text = pick(lines).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
    const send = () => {
      const p = this.room.state.players.get(sid);
      if (!p || !this.bots.has(sid)) return;
      this.room._broadcastChat({ sid, name: p.name, text, kind: 'bot' });
    };
    const delay = delayMs ?? rand(500, 1600);
    this.room.clock.setTimeout(send, delay);
    return true;
  }

  _randomBot(filter) {
    const list = [...this.bots.values()].filter((b) => !filter || filter(b));
    return list.length ? pick(list) : null;
  }

  _idleChatter(now) {
    if (now < this._nextIdleChatAt) return;
    this._nextIdleChatAt = now + rand(16000, 32000);
    const b = this._randomBot();
    if (b) this.say(b.sid, 'idle', {}, { prob: 0.8 });
  }

  onBugKill(sid, combo) {
    if (!this.isBot(sid)) return;
    if (combo === 10 || combo === 20) this.say(sid, 'streak', {}, { prob: 0.6 });
  }

  onLevelUp(sid, level) {
    if (!this.isBot(sid)) return;
    this.say(sid, 'levelup', { title: levelTitle(level) }, { prob: level >= 3 ? 0.7 : 0.3 });
  }

  onBroken(sid) {
    if (this.isBot(sid)) {
      const b = this.bots.get(sid);
      b.mode = 'broken'; b.target = null; b.provokedBy = null;
      this.say(sid, 'broken', {}, { prob: 0.5 });
    }
  }

  onPlayerHit(attackerSid, victimSid) {
    const b = this.bots.get(victimSid);
    if (!b || attackerSid === victimSid) return;
    const now = Date.now();
    const a = this.room.state.players.get(attackerSid);
    // Count hits from this attacker in a short window.
    if (b.hitBy !== attackerSid || now > (b.hitWindowUntil || 0)) { b.hitBy = attackerSid; b.hitCount = 0; }
    b.hitCount += 1;
    b.hitWindowUntil = now + 6000;
    // New humans mash SPACE and clip a bot by accident — forgive the first
    // couple of hits from a low-level human with a cheeky line instead of a beating.
    const newbie = a && !this.isBot(attackerSid) && a.level <= 2;
    if (newbie && b.hitCount < 3) {
      if (b.hitCount === 1) this.say(victimSid, 'hit', { other: a.name }, { prob: 0.4 });
      return;
    }
    const fresh = b.provokedBy !== attackerSid || now > b.provokedUntil;
    b.provokedBy = attackerSid;
    b.provokedUntil = now + 7000;
    b.nextThinkAt = Math.min(b.nextThinkAt, now + 150 + (1 - b.arch.skill) * 300); // react
    if (fresh && a && !newbie) this.say(victimSid, 'hit', { other: a.name }, { prob: 0.12 });
  }

  onPlayerKO(attackerSid, victimSid) {
    if (!this.isBot(attackerSid)) return;
    const v = this.room.state.players.get(victimSid);
    if (v) this.say(attackerSid, 'ko', { other: v.name }, { prob: 0.45 });
    const b = this.bots.get(attackerSid);
    if (b) { b.mode = 'wander'; b.target = null; }
  }

  onEvent(id) {
    const n = Math.min(2, this.bots.size);
    const used = new Set();
    for (let i = 0; i < n; i++) {
      const b = this._randomBot((x) => !used.has(x.sid));
      if (!b) break;
      used.add(b.sid);
      this.say(b.sid, `ev_${id}`, {}, { force: true, delayMs: rand(900, 3200) + i * 1500 });
    }
  }

  onBossEnd(win) {
    const b = this._randomBot();
    if (b) this.say(b.sid, win ? 'boss_win' : 'boss_fail', {}, { force: true, delayMs: rand(800, 2000) });
  }

  onGoldenEnd(winnerSid) {
    const b = this._randomBot((x) => x.sid !== winnerSid);
    if (b) this.say(b.sid, 'golden_win', {}, { prob: 0.9, delayMs: rand(900, 2200) });
  }

  /** A human said something — maybe a coworker answers. */
  onHumanChat(sid, text) {
    if (this.isBot(sid) || !this.bots.size) return;
    const rule = BOT_REPLIES.find((r) => r.re.test(text));
    if (!rule || Math.random() > 0.85) return;
    const human = this.room.state.players.get(sid);
    // Prefer a bot near the speaker (feels like a real coworker replying)
    let b = null, bestD = Infinity;
    for (const o of this.bots.values()) {
      const p = this.room.state.players.get(o.sid);
      if (!p || !human) continue;
      const d = Math.hypot(p.x - human.x, p.y - human.y) + Math.random() * 900;
      if (d < bestD) { bestD = d; b = o; }
    }
    if (!b) return;
    const line = pick(rule.lines);
    this.room.clock.setTimeout(() => {
      const p = this.room.state.players.get(b.sid);
      if (!p || !this.bots.has(b.sid)) return;
      this.room._broadcastChat({ sid: b.sid, name: p.name, text: line, kind: 'bot' });
    }, rand(1200, 2800));
  }
}

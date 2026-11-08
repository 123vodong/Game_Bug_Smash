// server/game/moba/MobaBots.js — champion bots for Team Mode.
//
// Bots READ the room's simulation records (champs / units / structs) but act
// ONLY through the room's intent handlers — _doOrder / _doCast / _doBuy /
// _doRecall — so they obey exactly the same range, mana, cooldown, stun,
// root and shop rules as humans.
//
// Brain loop (every ~0.3 s per bot):
//   dead / in fountain → shop (build order) · wait to heal
//   recalling          → wait (or bail out when an enemy shows up)
//   tower shooting me  → step out (unless committed to a dive)
//   low HP             → run home with escape skills, recall when safe
//   rich + quiet lane  → recall to shop
//   good fight nearby  → engage (focus the best enemy champion, use skills)
//   team objective     → defend a structure · take a river epic · group-push late
//   role default       → laners hold behind their wave, last-hit, push, siege
//                        towers with minions · jungler clears camps + ganks ·
//                        support follows the bot-lane carry and heals.
// Team plans (per team, every second) pick defend / epic / group-push targets.
//
// v2 ("Walls & New Hires"): movement goes through the room's orders, which
// follow cached findPath routes around walls (TeamRoom → Mover). Bots use the
// new skill shapes: persistent zones, projectile fans (no minion-block check —
// one phone gets through), knockbacks (prefer the ones that pin the target
// against a WALL for the wall-stun; else peel / finish), dashes that a wall
// would cut short are skipped, and the pet ult (at:'pet') fires when an enemy
// champion stands next to the pet.
//
// v4 ("Bushes"): bots obey the same vision as humans — every enemy they sense, count,
// snipe, gank or avoid goes through room.canSee(team, e), so an enemy hiding in a bush
// is invisible to bot decisions too (no wallhack bots).
import { TOWER, ULT_UNLOCK_LEVEL, damageAfterArmor, scaledAmount } from '../../../shared/moba/rules.js';
import { FOUNTAIN, CHAMP_RADIUS, clampToMap } from '../../../shared/moba/map.js';
import { clipMove, segmentClear } from '../../../shared/moba/nav.js';
import { ITEMS, buyBlocker } from '../../../shared/moba/items.js';
import { SPELLS } from '../../../shared/moba/spells.js';
import { classifySkill } from './SkillEngine.js';
import { lanePath, dist, otherTeam, LANE_IDS } from './geo.js';
import { BOT_TEAM_LINES, BOT_TEAM_REPLIES } from './lines.js';

const ROLE_LANE = { top: 'top', jungle: 'mid', mid: 'mid', bot: 'bot', support: 'bot' };
const SLOTS = ['q', 'w', 'e', 'r'];

// ── Bot tunables (server-only) ──
const THINK_MS = [240, 360];          // per-bot decision cadence
const PLAN_EVERY_MS = 1000;           // team plans
const RETREAT_HP = 0.3;               // run home below this HP fraction
const RETREAT_HP_OUTNUMBERED = 0.5;   // … or below this when the local fight is lost
const FIGHT_MIN_HP = 0.4;             // don't start fights below this
const DANGER_RATIO = 1.6;             // enemy power nearby > ours × this → back off to a tower
const TOWER_POWER = 18;               // an allied tower counts like a mid-game champion
const RECALL_GOLD_MIN = 850;          // recall to shop once this rich (and the next item is affordable)
const BASE_HEAL_TO = 0.9;             // wait in the fountain until this HP fraction
const GROUP_AFTER_MS = 13 * 60000;    // late game: the whole team groups and pushes one lane
const GROUP_AFTER_TOWERS = 4;         // … or once this many enemy towers are down
const EPIC_MIN_ALLIES = 3;
const DEADLINE_MIN_AVG_LEVEL = 6;
const GOLDEN_MIN_AVG_LEVEL = 3;
const EPIC_GIVE_UP_MS = 60000;
const GANK_EVERY_MS = [16000, 26000];
const GANK_MIN_LEVEL = 3;
const HUMAN_GANK_GRACE_MS = 5 * 60000; // junglers leave human laners alone early
const BOT_CHAT_GAP_MS = [2800, 5200];
const IDLE_CHAT_EVERY_MS = [45000, 90000];
// v3 summoner spells
const SPELL_FLASH_ESCAPE_HP = 0.22;   // Flash home when chased this low
const SPELL_GHOST_ESCAPE_HP = 0.45;
const SPELL_HEAL_HP = 0.28;           // Coffee Break self below this (in danger) …
const SPELL_HEAL_ALLY_HP = 0.2;       // … or for an ally this low in a fight
const SPELL_BARRIER_HP = 0.32;        // Ctrl+Z when bursted below this
const SPELL_IGNITE_FOE_HP = 0.45;     // Escalate a killable champion below this
const SMITE_STEAL_RANGE = 2600;       // smite holders walk this far to contest an epic the enemy is taking

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
const hpPct = (c) => c.hp / Math.max(1, c.maxHp);

export class MobaBots {
  constructor(room) {
    this.room = room;
    this.brains = new Map(); // sid -> brain
    this.plans = { blue: this._newPlan(), red: this._newPlan() };
    this._planAt = 0;
    this._chatAt = 0;
    this._idleChatAt = Date.now() + rand(...IDLE_CHAT_EVERY_MS);
    this._laneTowers = this._precomputeLaneTowers();
  }

  _newPlan() { return { epic: null, epicSince: 0, epicCooldownUntil: 0, defend: null, group: null, groupUntil: 0 }; }

  get count() { return this.brains.size; }
  isBot(sid) { return this.brains.has(sid); }

  /** Register a bot brain for an existing champion record. */
  add(sid, role, { silent = false } = {}) {
    const ch = this.room.champs.get(sid);
    const skills = {};
    for (const slot of SLOTS) {
      const spec = ch?.def.skills[slot];
      skills[slot] = spec ? { spec, cls: classifySkill(spec) } : null;
    }
    const b = {
      sid, role, lane: ROLE_LANE[role] || 'mid', silent,
      skill: rand(0.55, 0.9),      // reaction + aim quality
      aggro: rand(0.35, 0.75),     // appetite for trades
      side: Math.random() < 0.5 ? -1 : 1,
      thinkMs: rand(...THINK_MS),
      nextThinkAt: Date.now() + rand(100, 600),
      skills, lastHp: ch ? ch.hp : 0, hurtAt: 0,
      gankId: '', gankUntil: 0, nextGankAt: Date.now() + rand(150000, 210000),
      campId: '', diveUntil: 0, lastStopAt: 0, recallChatAt: 0,
    };
    this.brains.set(sid, b);
    return b;
  }

  /** A human left mid-match (or asked for autopilot): a brain takes over their champion. */
  adopt(sid, role, opts = {}) {
    if (this.brains.has(sid)) return;
    this.add(sid, role || 'mid', opts);
    if (opts.silent) return;
    const ch = this.room.champs.get(sid);
    const mate = this._randomBot((x) => x.sid !== sid && this.room.champs.get(x.sid)?.team === ch?.team);
    if (mate && ch) this._say(mate.sid, fill(pick(BOT_TEAM_LINES.takeover), { b: ch.name }), 0.9);
  }

  remove(sid) { this.brains.delete(sid); }

  // ───────────────────────── per tick ─────────────────────────
  /** `rev` alternates per tick (see TeamRoom._tick) so neither team always thinks first. */
  tick(now, rev = false) {
    const room = this.room;
    if (this.paused) return; // debug `freeze` (BUG_SMASH_DEBUG only)
    if (now >= this._planAt) {
      this._planAt = now + PLAN_EVERY_MS;
      this._plan(rev ? 'red' : 'blue', now);
      this._plan(rev ? 'blue' : 'red', now);
    }
    const brains = [...this.brains.values()];
    if (rev) brains.reverse();
    for (const b of brains) {
      const ch = room.champs.get(b.sid);
      if (!ch) { this.brains.delete(b.sid); continue; }
      if (ch.hp < b.lastHp - 1) b.hurtAt = now;
      b.lastHp = ch.hp;
      if (now < b.nextThinkAt) continue;
      b.nextThinkAt = now + b.thinkMs * rand(0.85, 1.2);
      this._think(b, ch, now);
      if (room.state.phase !== 'playing') return;
    }
    if (now >= this._idleChatAt) {
      this._idleChatAt = now + rand(...IDLE_CHAT_EVERY_MS);
      const b = this._randomBot((x) => !x.silent);
      if (b) this._say(b.sid, pick(BOT_TEAM_LINES.idle), 0.7);
    }
  }

  // ───────────────────────── team plans ─────────────────────────
  _plan(team, now) {
    const room = this.room;
    const plan = this.plans[team];
    const mine = [...room.champs.values()].filter((c) => c.team === team);
    const alive = mine.filter((c) => !c.dead);
    const enemiesAlive = [...room.champs.values()].filter((c) => c.team !== team && !c.dead).length;
    const avgLevel = mine.reduce((s, c) => s + c.level, 0) / Math.max(1, mine.length);
    const avgHp = alive.reduce((s, c) => s + hpPct(c), 0) / Math.max(1, alive.length);

    // Defend: one of our structures is being hit with enemy champions next to it.
    plan.defend = null;
    let bestTier = -1;
    for (const s of room.structs.values()) {
      if (s.team !== team || !s.alive || now - s.lastDamagedAt > 3000) continue;
      let threats = 0;
      for (const c of room.champs.values()) if (!c.dead && c.team !== team && dist(c, s) < 1200 && room.canSee(team, c, now)) threats++;
      if (!threats) continue;
      if (s.tier > bestTier) { bestTier = s.tier; plan.defend = s.id; }
    }

    // River epics.
    if (plan.epic && !room._epicUnit(plan.epic)) plan.epic = null;
    if (plan.epic && (alive.length < EPIC_MIN_ALLIES - 1 || now - plan.epicSince > EPIC_GIVE_UP_MS)) {
      plan.epic = null;
      plan.epicCooldownUntil = now + 25000;
    }
    if (!plan.epic && now >= plan.epicCooldownUntil) {
      for (const id of ['deadline', 'golden']) {
        const u = room._epicUnit(id);
        if (!u) continue;
        const minLv = id === 'deadline' ? DEADLINE_MIN_AVG_LEVEL : GOLDEN_MIN_AVG_LEVEL;
        if (alive.length >= EPIC_MIN_ALLIES && alive.length >= enemiesAlive - 1 && avgHp > 0.5 && avgLevel >= minLv) {
          plan.epic = id;
          plan.epicSince = now;
          break;
        }
      }
    }

    // Late game: group up and push one lane together.
    const enemyTowersDown = [...room.structs.values()].filter((s) => s.team !== team && !s.alive).length;
    if (room.matchMs(now) >= GROUP_AFTER_MS || enemyTowersDown >= GROUP_AFTER_TOWERS) {
      if (!plan.group || now >= plan.groupUntil) {
        plan.group = this._pushLane(team);
        plan.groupUntil = now + 45000;
      }
    } else {
      plan.group = null;
    }
  }

  /** Lane with the most enemy towers down (ties: weakest next tower, then mid). */
  _pushLane(team) {
    const room = this.room;
    let best = 'mid', bestScore = -Infinity;
    for (const lane of LANE_IDS) {
      let score = 0;
      for (const t of this._laneTowers[team][lane].enemy) {
        const s = room.structs.get(t.id);
        if (!s) continue;
        if (!s.alive) score += 10;
        else { score += 1 - s.hp / s.maxHp; break; }
      }
      if (lane === 'mid') score += 0.5;
      if (score > bestScore) { bestScore = score; best = lane; }
    }
    return best;
  }

  // ───────────────────────── one decision ─────────────────────────
  _think(b, ch, now) {
    const room = this.room;
    if (ch.dead) { this._shop(b, ch); return; }
    const inBase = room.inFountain(ch);
    if (inBase) this._shop(b, ch);

    if (ch.recallUntil > 0) {
      b.lastMode = 'recalling';
      const threat = this._nearestEnemyChamp(ch, 800);
      if (threat) this._move(b, ch, ...this._awayFrom(ch, threat, 500));
      return;
    }
    const ctx = this._sense(ch, now);
    this._supportCasts(b, ch, ctx, now);
    this._spellUtility(b, ch, ctx, now);

    // Heal up in the fountain before heading out again.
    if (inBase && (ctx.hp < BASE_HEAL_TO || ctx.mana < 0.5) && !ctx.enemyChamps.some((e) => e.d < 1000)) {
      b.lastMode = 'base';
      if (ch.order) this._order(b, { type: 'stop' });
      return;
    }

    // A tower is shooting me and I'm not committed to a dive: step out.
    const shooter = this._towerShootingMe(ch);
    if (shooter && now >= b.diveUntil) {
      b.lastMode = 'stepout';
      this._move(b, ch, ...this._awayFrom(ch, shooter, TOWER.range + 160 - dist(ch, shooter)));
      this._escapeCasts(b, ch, ctx, now, ctx.hp < 0.5);
      if (ctx.hp < 0.4) this._spellEscape(b, ch, ctx, now);
      return;
    }

    if (this._shouldRetreat(b, ch, ctx)) { b.lastMode = 'retreat'; this._retreat(b, ch, ctx, now); return; }
    if (this._shouldRecallToShop(b, ch, ctx, now)) { b.lastMode = 'shop'; this._recall(b, ch, now); return; }

    this._snipe(b, ch, now);
    const foe = this._pickFight(b, ch, ctx, now);
    const danger = this._danger(ch, ctx);
    if (danger && !(foe && ctx.hp > 0.6 && foe.hp <= this._burst(ch, foe, now) * 0.8 && dist(ch, foe) <= ch.range + 60)) {
      b.lastMode = 'backoff';
      this._backOff(b, ch, ctx, danger, now);
      return;
    }
    if (foe) { b.lastMode = 'fight'; this._engage(b, ch, foe, ctx, now); return; }

    b.lastMode = 'objective';
    if (this._objective(b, ch, ctx, now)) return;

    b.lastMode = b.role;
    if (b.role === 'jungle') this._jungle(b, ch, ctx, now);
    else if (b.role === 'support') this._support(b, ch, ctx, now);
    else this._lane(b, ch, ctx, b.lane, now);
  }

  _sense(ch, now) {
    const room = this.room;
    const ctx = { enemyChamps: [], allyChamps: [], enemyMinions: [], allyMinions: [], monsters: [], hp: hpPct(ch), mana: ch.mana / Math.max(1, ch.maxMana), now };
    for (const o of room.champs.values()) {
      if (o === ch || o.dead) continue;
      const d = dist(ch, o);
      if (o.team === ch.team) { if (d < 1500) ctx.allyChamps.push({ e: o, d }); }
      else if (d < 1800 && room.canSee(ch.team, o, now)) ctx.enemyChamps.push({ e: o, d });
    }
    for (const u of room.units.values()) {
      if (!u.alive || u.utype === 'pet') continue; // pets are scenery for decisions
      if (u.team !== ch.team && !room.canSee(ch.team, u, now)) continue; // v4: hidden in a bush
      const d = dist(ch, u);
      if (d > 1300) continue;
      if (u.team === 'neutral') ctx.monsters.push({ e: u, d });
      else if (u.team === ch.team) ctx.allyMinions.push({ e: u, d });
      else ctx.enemyMinions.push({ e: u, d });
    }
    ctx.enemyChamps.sort((a, b) => a.d - b.d);
    return ctx;
  }

  // ───────────────────────── fight evaluation ─────────────────────────
  _power(c) {
    let gold = 0;
    for (const id of c.items) if (id) gold += ITEMS[id].cost;
    return (0.3 + hpPct(c)) * (c.level + 3) * (1 + gold / 4000);
  }

  /** Summed champion power of each side within r of (x, y). */
  _localPowers(team, x, y, r) {
    let ally = 0, enemy = 0;
    for (const c of this.room.champs.values()) {
      if (c.dead || Math.hypot(c.x - x, c.y - y) > r) continue;
      if (c.team === team) ally += this._power(c); else if (this.room.canSee(team, c)) enemy += this._power(c);
    }
    return { ally, enemy };
  }

  _ready(ch, slot, now) {
    const spec = ch.def.skills[slot];
    if (!spec || now < ch.cd[slot] || ch.mana < spec.mana) return false;
    if (slot === 'r' && ch.level < ULT_UNLOCK_LEVEL) return false;
    return true;
  }

  /** Damage the bot could dump on `t` right now (ready damaging skills + two autos). */
  _burst(ch, t, now) {
    let raw = ch.ad * 2;
    for (const slot of SLOTS) {
      const spec = ch.def.skills[slot];
      if (!spec?.dmg || !this._ready(ch, slot, now)) continue;
      raw += scaledAmount(spec.dmg, ch.level, ch.ad, ch.ap, ch.maxHp);
      if (spec.execute) raw += spec.execute.missingHpPct * Math.max(0, t.maxHp - t.hp);
    }
    return damageAfterArmor(raw, t.armor || 0);
  }

  _shouldRetreat(b, ch, ctx) {
    if (ctx.hp < RETREAT_HP) return true;
    if (ctx.hp < RETREAT_HP_OUTNUMBERED && ctx.enemyChamps.some((e) => e.d < 900)) {
      const p = this._localPowers(ch.team, ch.x, ch.y, 1000);
      if (p.enemy > p.ally * 0.85) return true;
    }
    return false;
  }

  _pickFight(b, ch, ctx, now) {
    if (ctx.hp < FIGHT_MIN_HP) return null;
    const reach = Math.max(ch.range + 320, 760);
    const alliesNear = ctx.allyChamps.filter((a) => a.d < 900).length;
    let best = null, bestScore = -Infinity;
    for (const { e, d } of ctx.enemyChamps) {
      if (d > reach) continue;
      const killable = e.hp <= this._burst(ch, e, now) * 0.9;
      const tower = this._enemyTowerAt(e.x, e.y, ch.team, 80);
      if (tower) {
        // Only dive a near-dead target, healthy, while minions tank the tower.
        if (!(killable && ctx.hp > 0.55 && this._towerTanked(tower, ch.team))) continue;
      }
      const p = this._localPowers(ch.team, e.x, e.y, 1050);
      const ratio = p.ally / Math.max(0.1, p.enemy);
      const hpAdv = ctx.hp - hpPct(e);
      let ok = killable || ratio >= 1.1 - b.aggro * 0.35;
      if (!killable && alliesNear === 0) ok = ok && hpAdv >= 0.02 - b.aggro * 0.2; // solo trades need an HP lead
      if (!ok) continue;
      const score = (killable ? 3 : 0) + (1 - hpPct(e)) * 2 - d / 900 - (e.isBot ? 0 : 0.15); // no human focus
      if (score > bestScore) { bestScore = score; best = e; }
    }
    if (best && this._enemyTowerAt(best.x, best.y, ch.team, 80)) b.diveUntil = now + 2500;
    return best;
  }

  _engage(b, ch, foe, ctx, now) {
    this._offensiveCasts(b, ch, foe, ctx, now);
    this._spellOffense(b, ch, foe, ctx, now);
    this._attack(b, ch, foe.id);
  }

  // ───────────────────────── skills ─────────────────────────
  _cast(b, slot, x, y, id) {
    return this.room._doCast(b.sid, { slot, x, y, ...(id ? { id } : {}) });
  }

  /** Aim point with simple lead (target velocity × travel time) + a little human error. */
  _lead(b, ch, t, travelMs) {
    const k = Math.min(1.2, travelMs / 1000) * (0.6 + b.skill * 0.4);
    const err = (1 - b.skill) * 70;
    return {
      x: t.x + (t.vx || 0) * k + rand(-err, err),
      y: t.y + (t.vy || 0) * k + rand(-err, err),
    };
  }

  /** Is the straight line ch → t blocked by an enemy unit (for non-piercing skillshots)? */
  _lineBlocked(ch, t, half) {
    const dx = t.x - ch.x, dy = t.y - ch.y;
    const len = Math.hypot(dx, dy) || 1;
    for (const u of this.room.units.values()) {
      if (!u.alive || u.team === ch.team || u.utype === 'pet' || !this.room.canSee(ch.team, u)) continue;
      const k = ((u.x - ch.x) * dx + (u.y - ch.y) * dy) / len;
      if (k <= 0 || k >= len - 10) continue;
      const px = ch.x + dx / len * k, py = ch.y + dy / len * k;
      if (Math.hypot(u.x - px, u.y - py) <= half + u.radius) return true;
    }
    return false;
  }

  _offensiveCasts(b, ch, foe, ctx, now) {
    if (Math.random() > 0.5 + b.skill * 0.45) return; // hesitate sometimes
    const d = dist(ch, foe);
    for (const slot of ['r', 'q', 'e', 'w']) {
      const k = b.skills[slot];
      if (!k || !this._ready(ch, slot, now)) continue;
      if (this._tryOffensive(b, ch, slot, k.spec, k.cls, foe, d, ctx, now)) return;
    }
  }

  _tryOffensive(b, ch, slot, spec, cls, foe, d, ctx, now) {
    const isR = slot === 'r';
    const foeHp = hpPct(foe);
    switch (spec.type) {
      case 'projectile': {
        if (!cls.damage) return false;
        if (d > spec.range * (spec.champOnly ? 0.95 : 0.88)) return false;
        // A fan ult is worth it on 2+ champions in its cone even when nobody is low.
        if (isR && foeHp > 0.55 && foe.hp > this._burst(ch, foe, now) && !(cls.fan && this._enemiesInCone(ch, foe, spec) >= 2)) return false;
        if (!spec.pierce && !spec.champOnly && !cls.fan && this._lineBlocked(ch, foe, spec.width / 2)) return false;
        const p = this._lead(b, ch, foe, (d / spec.speed) * 1000);
        return this._cast(b, slot, p.x, p.y);
      }
      case 'zone': {
        if (!cls.damage && !cls.cc) return false;
        if (cls.selfCentered) {
          if (d > spec.radius * 0.8) return false;
          return this._cast(b, slot, ch.x, ch.y);
        }
        if (d > spec.range + spec.radius * 0.3) return false;
        const p = this._lead(b, ch, foe, 350); // land it where they're walking: they sit in it for a while
        if (isR && foeHp > 0.65 && this._enemiesNear(ch, p.x, p.y, spec.radius) < 2) return false;
        return this._cast(b, slot, p.x, p.y);
      }
      case 'circle': {
        if (!cls.damage) return false;
        if (cls.atPet) {
          // e.g. Servo EMP: centered on the pet — fire when an enemy champion stands next to it.
          const pet = this.room._petOf(ch);
          if (!pet) return false;
          const n = this._enemiesNear(ch, pet.x, pet.y, spec.radius * 0.7);
          if (n < 1) return false;
          return this._cast(b, slot, pet.x, pet.y);
        }
        if (cls.selfCentered) {
          if (d > spec.radius * 0.85) return false;
          if (isR && foeHp > 0.75 && this._enemiesNear(ch, ch.x, ch.y, spec.radius) < 2) return false;
          return this._cast(b, slot, ch.x, ch.y);
        }
        if (d > spec.range + spec.radius * 0.4) return false;
        const p = this._lead(b, ch, foe, (spec.delay || 0) * 0.85);
        if (isR && foeHp > 0.7 && this._enemiesNear(ch, p.x, p.y, spec.radius) < 2) return false;
        return this._cast(b, slot, p.x, p.y);
      }
      case 'target': {
        if (d > spec.range + foe.radius) return false;
        if (spec.execute && foe.hp > this._burst(ch, foe, now) && foeHp > 0.45) return false;
        if (cls.knockback && !this._knockWouldWall(ch, foe, spec.knockback.dist)) {
          // No wall to pin them on: keep it for a peel (they're on top of us) or a finisher — mostly.
          const peel = ctx.hp < 0.55 && d < 260;
          if (!peel && foeHp > 0.3 && Math.random() < 0.7) return false;
        }
        return this._cast(b, slot, foe.x, foe.y, foe.id);
      }
      case 'dash': {
        if (!(spec.dmg || spec.stun || spec.knockback)) return false; // pure mobility dashes are for escaping
        if (spec.toTarget) {
          if (d > spec.range + foe.radius) return false;
          if (!segmentClear(ch.x, ch.y, foe.x, foe.y, CHAMP_RADIUS)) return false; // a wall would stop the dash
          return this._cast(b, slot, foe.x, foe.y, foe.id);
        }
        if (d > spec.range + foe.radius * 0.5) return false;
        const clip = clipMove(ch.x, ch.y, foe.x, foe.y, CHAMP_RADIUS);
        if (clip.hit && Math.hypot(clip.x - foe.x, clip.y - foe.y) > (spec.hitRadius || 40) + foe.radius) return false;
        if (spec.stopAtFirst && this._lineBlocked(ch, foe, spec.hitRadius || 40)) return false;
        if (this._enemyTowerAt(foe.x, foe.y, ch.team, 0) && now >= b.diveUntil) return false;
        return this._cast(b, slot, foe.x, foe.y);
      }
      case 'blink': {
        // Chase a near-dead target that's just out of reach.
        if (foeHp > 0.25 || d <= ch.range + 30 || d > ch.range + spec.range) return false;
        if (this._enemyTowerAt(foe.x, foe.y, ch.team, 0)) return false;
        return this._cast(b, slot, foe.x, foe.y);
      }
      case 'self': {
        if (cls.steroid && d <= ch.range + 140) return this._cast(b, slot, ch.x, ch.y);
        if (cls.defensive && now - b.hurtAt < 900) return this._cast(b, slot, ch.x, ch.y);
        if (cls.speed && !cls.steroid && d > ch.range + 60 && d < 800) return this._cast(b, slot, ch.x, ch.y);
        return false;
      }
      case 'allies': {
        if (cls.speed && !cls.heal && !cls.shield && d > ch.range && d < 900 && ctx.allyChamps.some((a) => a.d < spec.radius)) {
          return this._cast(b, slot, ch.x, ch.y);
        }
        return false;
      }
      default: return false;
    }
  }

  /** Champion-only long-range ults (e.g. Regression Barrage): finish a low enemy anywhere in range. */
  _snipe(b, ch, now) {
    const k = b.skills.r;
    if (!k || k.spec.type !== 'projectile' || !k.spec.champOnly || !this._ready(ch, 'r', now)) return;
    const raw = scaledAmount(k.spec.dmg, ch.level, ch.ad, ch.ap, ch.maxHp);
    for (const e of this.room.champs.values()) {
      if (e.dead || e.team === ch.team || this.room.inFountain(e) || !this.room.canSee(ch.team, e, now)) continue;
      const d = dist(ch, e);
      if (d > k.spec.range * 0.9 || d < 300) continue;
      if (e.hp > damageAfterArmor(raw, e.armor) * 0.95) continue;
      const p = this._lead(b, ch, e, (d / k.spec.speed) * 1000);
      if (this._cast(b, 'r', p.x, p.y)) return;
    }
  }

  /** Would knocking `foe` straight away from `ch` slam it into a wall (→ wall-stun)? */
  _knockWouldWall(ch, foe, distPx) {
    const dx = foe.x - ch.x, dy = foe.y - ch.y;
    const d = Math.hypot(dx, dy) || 1;
    const want = clampToMap(foe.x + dx / d * distPx, foe.y + dy / d * distPx);
    return clipMove(foe.x, foe.y, want.x, want.y, foe.radius || CHAMP_RADIUS).hit;
  }

  /** Enemy champions inside a projectile fan's cone toward `foe`. */
  _enemiesInCone(ch, foe, spec) {
    const base = Math.atan2(foe.y - ch.y, foe.x - ch.x);
    const half = ((spec.spread || 0) * Math.PI) / 360 + 0.08;
    let n = 0;
    for (const c of this.room.champs.values()) {
      if (c.dead || c.team === ch.team || !this.room.canSee(ch.team, c)) continue;
      const d = dist(ch, c);
      if (d > spec.range * 0.9) continue;
      let a = Math.atan2(c.y - ch.y, c.x - ch.x) - base;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(a) <= half) n++;
    }
    return n;
  }

  _enemiesNear(ch, x, y, r) {
    let n = 0;
    for (const c of this.room.champs.values()) if (!c.dead && c.team !== ch.team && Math.hypot(c.x - x, c.y - y) <= r && this.room.canSee(ch.team, c)) n++;
    return n;
  }

  /** Escape: blink / dash home, shields, speed buffs, slow the chaser. */
  _escapeCasts(b, ch, ctx, now, urgent = true) {
    const home = FOUNTAIN[ch.team];
    const threat = ctx.enemyChamps[0];
    const chased = threat && threat.d < 900;
    for (const slot of SLOTS) {
      const k = b.skills[slot];
      if (!k || !this._ready(ch, slot, now)) continue;
      const { spec, cls } = k;
      if (slot === 'r' && !cls.defensive && !cls.heal) continue;
      if ((spec.type === 'blink' || (spec.type === 'dash' && !spec.toTarget)) && chased && urgent) {
        const dx = home.x - ch.x, dy = home.y - ch.y, d = Math.hypot(dx, dy) || 1;
        const tx = ch.x + dx / d * spec.range, ty = ch.y + dy / d * spec.range;
        // A dash into furniture goes nowhere — only use it if it covers most of its range.
        let ok = spec.type === 'blink';
        if (!ok) { const c = clipMove(ch.x, ch.y, tx, ty, CHAMP_RADIUS); ok = Math.hypot(c.x - ch.x, c.y - ch.y) >= spec.range * 0.45; }
        if (ok && this._cast(b, slot, tx, ty)) return;
      }
      if (spec.type === 'target' && cls.knockback && chased && threat.d <= spec.range + threat.e.radius) {
        if (this._cast(b, slot, threat.e.x, threat.e.y, threat.e.id)) return; // peel: shove the chaser away
      }
      if (spec.type === 'self' && (cls.defensive || cls.speed) && (chased || now - b.hurtAt < 900)) {
        if (this._cast(b, slot, ch.x, ch.y)) return;
      }
      if (spec.type === 'allies' && cls.speed && chased) {
        if (this._cast(b, slot, ch.x, ch.y)) return;
      }
      if (spec.type === 'projectile' && (spec.slow || spec.root) && chased && threat.d < spec.range * 0.8) {
        const p = this._lead(b, ch, threat.e, (threat.d / spec.speed) * 1000);
        if (this._cast(b, slot, p.x, p.y)) return;
      }
    }
  }

  /** Heals / team shields — any mode. */
  _supportCasts(b, ch, ctx, now) {
    for (const slot of SLOTS) {
      const k = b.skills[slot];
      if (!k || !k.cls.allies || !(k.cls.heal || k.cls.shield) || !this._ready(ch, slot, now)) continue;
      const r = (k.spec.radius || 0) + CHAMP_RADIUS;
      let hurt = 0, low = hpPct(ch), sum = hpPct(ch), n = 1;
      if (low < 0.65) hurt++;
      for (const a of ctx.allyChamps) {
        if (a.d > r) continue;
        const p = hpPct(a.e);
        n++; sum += p;
        if (p < 0.65) hurt++;
        low = Math.min(low, p);
      }
      const fighting = ctx.enemyChamps.some((e) => e.d < 1000);
      const want = slot === 'r'
        ? (fighting && ((hurt >= 2 && low < 0.55) || low < 0.3))
        : (low < 0.55 || (hurt >= 2 && sum / n < 0.75));
      if (want && this._cast(b, slot, ch.x, ch.y)) return;
    }
  }

  /** Spammable damage skills on minions / monsters (wave clear + jungle). */
  _farmCasts(b, ch, target, ctx, now, minMana) {
    if (ctx.mana < minMana || Math.random() > 0.6) return;
    for (const slot of ['q', 'e', 'w']) {
      const k = b.skills[slot];
      if (!k || !this._ready(ch, slot, now)) continue;
      const { spec, cls } = k;
      const d = dist(ch, target);
      if (spec.type === 'self' && cls.steroid && d <= ch.range + 100) { if (this._cast(b, slot, ch.x, ch.y)) return; continue; }
      if (!cls.damage || target.etype === 'struct') continue; // skills don't hurt structures
      if (cls.atPet) continue;
      if (spec.type === 'circle' || spec.type === 'zone') {
        if (cls.selfCentered ? d <= spec.radius * 0.8 : d <= spec.range) { if (this._cast(b, slot, target.x, target.y)) return; }
      } else if (spec.type === 'projectile' && !spec.champOnly && d <= spec.range * 0.8) {
        if (this._cast(b, slot, target.x, target.y)) return;
      } else if (spec.type === 'target' && d <= spec.range + target.radius) {
        if (this._cast(b, slot, target.x, target.y, target.id)) return;
      } else if (spec.type === 'dash' && spec.toTarget && d <= spec.range && target.team === 'neutral') {
        if (this._cast(b, slot, target.x, target.y, target.id)) return;
      }
    }
  }

  // ───────────────────────── v3: summoner spells ─────────────────────────
  /** Slot ('d' | 'f') holding a READY spell of this kind, else null. */
  _spellSlot(ch, kind, now) {
    for (const slot of ['d', 'f']) {
      const id = ch.spells?.[slot];
      if (id && SPELLS[id]?.kind === kind && now >= (ch.spellCd?.[slot] || 0)) return slot;
    }
    return null;
  }

  _spell(b, slot, x, y, id) {
    return this.room._doSpell(b.sid, { slot, x, y, ...(id ? { id } : {}) });
  }

  /** Heal / Barrier / Smite — checked on every think. */
  _spellUtility(b, ch, ctx, now) {
    const danger = ctx.enemyChamps.some((e) => e.d < 900) || !!this._towerShootingMe(ch);
    const hurt = now - b.hurtAt < 800;
    let slot = this._spellSlot(ch, 'shield', now);
    if (slot && danger && hurt && ctx.hp < SPELL_BARRIER_HP && this._spell(b, slot, ch.x, ch.y)) return;
    slot = this._spellSlot(ch, 'heal', now);
    if (slot && !this.room.inFountain(ch)) {
      const sp = SPELLS[ch.spells[slot]];
      const allyLow = ctx.enemyChamps.some((e) => e.d < 1000)
        && ctx.allyChamps.some((a) => a.d < sp.radius && hpPct(a.e) < SPELL_HEAL_ALLY_HP);
      if (((danger && hurt && ctx.hp < SPELL_HEAL_HP) || allyLow) && this._spell(b, slot, ch.x, ch.y)) return;
    }
    slot = this._spellSlot(ch, 'smite', now);
    if (slot) {
      const sp = SPELLS[ch.spells[slot]];
      const dmg = scaledAmount(sp.dmg, ch.level, 0, 0);
      const epicUp = !!(this.room._epicUnit('golden') || this.room._epicUnit('deadline'));
      for (const { e, d } of ctx.monsters) {
        if (e.resetting || d > sp.range + e.radius || e.hp > dmg) continue;
        // Epics: always (secure / steal). Camps: the big ones being cleared, unless an epic is up (save it).
        const ok = e.epic || (!epicUp && b.campId === e.campId && (e.kind === 'big' || e.kind === 'medium'));
        if (ok && this._spell(b, slot, e.x, e.y, e.id)) return;
      }
    }
  }

  /** Flash home / Ghost away when chased at low HP. */
  _spellEscape(b, ch, ctx, now) {
    const threat = ctx.enemyChamps[0];
    if (!threat) return;
    const home = FOUNTAIN[ch.team];
    let slot = this._spellSlot(ch, 'blink', now);
    if (slot && threat.d < 520 && ctx.hp < SPELL_FLASH_ESCAPE_HP && now - b.hurtAt < 1500) {
      const sp = SPELLS[ch.spells[slot]];
      const dx = home.x - ch.x, dy = home.y - ch.y, d = Math.hypot(dx, dy) || 1;
      if (this._spell(b, slot, ch.x + dx / d * sp.range, ch.y + dy / d * sp.range)) return;
    }
    slot = this._spellSlot(ch, 'haste', now);
    if (slot && threat.d < 900 && ctx.hp < SPELL_GHOST_ESCAPE_HP) this._spell(b, slot, ch.x, ch.y);
  }

  /** Ignite a killable champion · Flash onto a fleeing near-dead one · Ghost to run them down. */
  _spellOffense(b, ch, foe, ctx, now) {
    if (foe.etype !== 'champ' || foe.dead || this.room.inFountain(foe)) return;
    const d = dist(ch, foe);
    const foeHp = hpPct(foe);
    let slot = this._spellSlot(ch, 'dot', now);
    if (slot && foeHp < SPELL_IGNITE_FOE_HP && !(foe.burns || []).some((x) => x.src === ch.id)) {
      const sp = SPELLS[ch.spells[slot]];
      const total = scaledAmount(sp.dmg, ch.level, 0, 0);
      if (d <= sp.range + foe.radius && foe.hp <= this._burst(ch, foe, now) + total && this._spell(b, slot, foe.x, foe.y, foe.id)) return;
    }
    if (this._enemyTowerAt(foe.x, foe.y, ch.team, 0) && now >= b.diveUntil) return;
    slot = this._spellSlot(ch, 'blink', now);
    if (slot && foeHp < 0.2 && ctx.hp > 0.35 && foe.hp <= this._burst(ch, foe, now) * 0.8 && Math.random() < 0.3 + b.skill * 0.4) {
      const sp = SPELLS[ch.spells[slot]];
      if (d > ch.range + 80 && d < ch.range + sp.range * 0.9) {
        const k = Math.min(sp.range, d - ch.range * 0.6) / (d || 1);
        if (this._spell(b, slot, ch.x + (foe.x - ch.x) * k, ch.y + (foe.y - ch.y) * k)) return;
      }
    }
    slot = this._spellSlot(ch, 'haste', now);
    if (slot && foeHp < 0.35 && d > ch.range + 100 && d < 1000 && ctx.hp > 0.4) this._spell(b, slot, ch.x, ch.y);
  }

  /** Smite holder + the enemy is on a river epic within reach: walk in and try to steal the last hit. */
  _contestEpic(b, ch, ctx, now) {
    const slot = this._spellSlot(ch, 'smite', now);
    if (!slot || ctx.hp < 0.45) return false;
    const room = this.room;
    for (const id of ['deadline', 'golden']) {
      const u = room._epicUnit(id);
      if (!u || u.resetting || u.hp > u.maxHp * 0.5 || dist(ch, u) > SMITE_STEAL_RANGE) continue;
      const camp = room.camps.get(id);
      let enemyOn = false;
      for (const [cid, at] of camp?.attackers || []) {
        const c = room.champs.get(cid);
        if (c && !c.dead && c.team !== ch.team && now - at < 3000) enemyOn = true;
      }
      if (!enemyOn) continue;
      const range = SPELLS[ch.spells[slot]].range;
      const dd = dist(ch, u) || 1;
      if (dd > range * 0.8) this._move(b, ch, u.x + (ch.x - u.x) / dd * range * 0.7, u.y + (ch.y - u.y) / dd * range * 0.7);
      else if (ch.order) this._order(b, { type: 'stop' }); // wait in range for the last hit
      b.lastMode = 'steal';
      return true;
    }
    return false;
  }

  // ───────────────────────── retreat / recall / shop ─────────────────────────
  _retreat(b, ch, ctx, now) {
    const chased = ctx.enemyChamps.some((e) => e.d < 1000);
    const underFire = now - ch.lastDamagedAt < 1800;
    if (!chased && !underFire && !this._enemyTowerAt(ch.x, ch.y, ch.team, 250)) {
      this._recall(b, ch, now);
      return;
    }
    const spot = this._safeSpot(ch);
    this._move(b, ch, spot.x, spot.y);
    this._escapeCasts(b, ch, ctx, now, true);
    this._spellEscape(b, ch, ctx, now);
  }

  /** Enemy champions nearby outgun us (counting an allied tower we stand under)? */
  _danger(ch, ctx) {
    const near = ctx.enemyChamps.filter((e) => e.d < 1100);
    if (!near.length) return null;
    const p = this._localPowers(ch.team, ch.x, ch.y, 1200);
    const ally = p.ally + (this._ownTowerAt(ch.x, ch.y, ch.team, -40) ? TOWER_POWER : 0);
    return p.enemy > ally * DANGER_RATIO ? { near, ratio: p.enemy / Math.max(0.1, ally) } : null;
  }

  _backOff(b, ch, ctx, danger, now) {
    const spot = this._safeSpot(ch);
    this._move(b, ch, spot.x, spot.y);
    const closest = danger.near[0];
    if (closest.d < 650 && (ctx.hp < 0.7 || danger.near.length >= 2)) this._escapeCasts(b, ch, ctx, now, ctx.hp < 0.55);
    if (closest.d < 650 && ctx.hp < 0.5) this._spellEscape(b, ch, ctx, now);
  }

  /** Just behind the nearest allied tower that is behind us (else the fountain). */
  _safeSpot(ch) {
    const home = FOUNTAIN[ch.team];
    const myHome = dist(ch, home);
    let best = null, bestD = Infinity;
    for (const s of this.room.structs.values()) {
      if (!s.alive || s.kind !== 'tower' || s.team !== ch.team) continue;
      if (dist(s, home) > myHome - 150) continue;
      const d = dist(ch, s);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (!best) return { x: home.x, y: home.y };
    const dh = dist(best, home) || 1;
    return { x: best.x + (home.x - best.x) / dh * 220, y: best.y + (home.y - best.y) / dh * 220 };
  }

  /** Allied tower covering (x, y), if any. */
  _ownTowerAt(x, y, team, pad = 0) {
    for (const s of this.room.structs.values()) {
      if (!s.alive || s.kind !== 'tower' || s.team !== team) continue;
      if (Math.hypot(s.x - x, s.y - y) <= TOWER.range + pad) return s;
    }
    return null;
  }

  _shouldRecallToShop(b, ch, ctx, now) {
    const home = FOUNTAIN[ch.team];
    if (dist(ch, home) < 2000) return false;
    if (ctx.enemyChamps.some((e) => e.d < 1400) || now - ch.lastDamagedAt < 3000) return false;
    const next = this._nextItem(ch);
    const plan = this.plans[ch.team];
    const minGold = plan.group ? RECALL_GOLD_MIN * 1.6 : RECALL_GOLD_MIN;
    if (next && ch.gold >= ITEMS[next].cost && ch.gold >= minGold) return true;
    if (ctx.hp < 0.45 || (ctx.mana < 0.12 && ch.maxMana > 0)) return true;
    return false;
  }

  _recall(b, ch, now) {
    if (this.room._doRecall(b.sid) && now >= b.recallChatAt && Math.random() < 0.12) {
      b.recallChatAt = now + 60000;
      this._say(b.sid, pick(BOT_TEAM_LINES.recall), 0.6);
    }
  }

  _nextItem(ch) {
    for (const id of ch.def.build || []) {
      if (!ITEMS[id] || ch.items.includes(id)) continue;
      if (buyBlocker(ch.items, id)) continue;
      return id;
    }
    return null;
  }

  _shop(b, ch) {
    const next = this._nextItem(ch);
    if (next && ch.gold >= ITEMS[next].cost) this.room._doBuy(b.sid, { item: next });
  }

  // ───────────────────────── objectives ─────────────────────────
  _objective(b, ch, ctx, now) {
    const room = this.room;
    const plan = this.plans[ch.team];
    if (this._contestEpic(b, ch, ctx, now)) return true;
    if (plan.defend && ctx.hp > 0.4) {
      const s = room.structs.get(plan.defend);
      if (s && s.alive && dist(ch, s) < 3400) {
        const home = FOUNTAIN[ch.team];
        const d = dist(s, home) || 1;
        // Stand just behind the structure (between it and our fountain).
        this._move(b, ch, s.x + (home.x - s.x) / d * 180, s.y + (home.y - s.y) / d * 180);
        return true;
      }
    }
    if (plan.epic && ctx.hp > 0.45) {
      const u = room._epicUnit(plan.epic);
      if (u && (dist(ch, u) < 4200 || b.role === 'jungle' || b.role === 'support')) {
        let near = 0, alive = 0;
        for (const c of room.champs.values()) {
          if (c.team !== ch.team || c.dead) continue;
          alive++;
          if (dist(c, u) < 950) near++;
        }
        const go = near >= Math.min(EPIC_MIN_ALLIES, alive) || u.hp < u.maxHp * 0.85 || u.target;
        if (go) {
          this._attack(b, ch, u.id);
          this._farmCasts(b, ch, u, ctx, now, 0.2);
          if (u.kind === 'deadline' || hpPct(u) < 0.5) this._offensiveCastsOnUnit(b, ch, u, now);
        } else {
          // Stage just outside its reach on our side of the river.
          const home = FOUNTAIN[ch.team];
          const d = dist(u, home) || 1;
          this._move(b, ch, u.x + (home.x - u.x) / d * 520, u.y + (home.y - u.y) / d * 520);
        }
        return true;
      }
    }
    if (plan.group) {
      this._lane(b, ch, ctx, plan.group, now);
      return true;
    }
    return false;
  }

  /** Use ults / big skills on an epic monster (ignores the champion-only heuristics). */
  _offensiveCastsOnUnit(b, ch, u, now) {
    for (const slot of ['r', 'q', 'e']) {
      const k = b.skills[slot];
      if (!k || !k.cls.damage || !this._ready(ch, slot, now)) continue;
      const { spec } = k;
      if (spec.type === 'projectile' && spec.champOnly) continue;
      const d = dist(ch, u);
      if (k.cls.atPet) {
        const pet = this.room._petOf(ch);
        if (!pet || dist(pet, u) > spec.radius * 0.8) continue;
      } else {
        const range = (spec.type === 'circle' || spec.type === 'zone') && !spec.range ? spec.radius * 0.8 : (spec.range || 0) + u.radius;
        if (d > range) continue;
      }
      if (this._cast(b, slot, u.x, u.y, u.id)) return;
    }
  }

  // ───────────────────────── roles ─────────────────────────
  _lane(b, ch, ctx, lane, now) {
    const room = this.room;
    const team = ch.team;
    const path = lanePath(team, lane);
    // Our wave's front + the next enemy tower on this lane (both as lane progress).
    let frontP = -1;
    for (const u of room.units.values()) {
      if (!u.alive || u.utype !== 'minion' || u.team !== team || u.lane !== lane) continue;
      const p = path.progressOf(u.x, u.y);
      if (p > frontP) frontP = p;
    }
    const towers = this._laneTowers[team][lane];
    let enemyTower = null, enemyTowerP = Infinity;
    for (const t of towers.enemy) {
      const s = room.structs.get(t.id);
      if (s && s.alive) { enemyTower = s; enemyTowerP = t.p; break; }
    }
    // Every tower on the way is down: the enemy core is the siege target.
    const core = enemyTower ? null : room.structs.get(`${otherTeam(team)}_core`);
    if (core && core.alive && !core.invulnerable) {
      const plan = this.plans[team];
      const minionsAtCore = this._minionsNear(team, core, 700);
      let alliesAtCore = 0;
      for (const c of room.champs.values()) if (!c.dead && c.team === team && dist(c, core) < 1400) alliesAtCore++;
      if ((minionsAtCore > 0 || alliesAtCore >= 3 || plan.group) && dist(ch, core) < 2600 && !ctx.enemyChamps.some((e) => e.d < ch.range + 60)) {
        this._attack(b, ch, core.id);
        this._farmCasts(b, ch, core, ctx, now, 0.5);
        return;
      }
    }
    let ownP = 400;
    for (const t of towers.own) {
      const s = room.structs.get(t.id);
      if (s && s.alive) ownP = Math.max(ownP, t.p);
    }
    let targetP = frontP >= 0 ? frontP - (ch.def.ranged ? 240 : 130) : ownP - 260;
    const tanked = enemyTower && this._towerTanked(enemyTower, team);
    if (enemyTower && !tanked) targetP = Math.min(targetP, enemyTowerP - (TOWER.range + 90));
    targetP = Math.max(150, targetP);
    let pos = path.pointAt(targetP);
    // Outgunned around the wave? Farm under our own tower instead.
    const lp = this._localPowers(team, pos.x, pos.y, 1200);
    const allyHere = lp.ally + (dist(ch, pos) > 1200 ? this._power(ch) : 0);
    const unsafe = lp.enemy > allyHere * DANGER_RATIO;
    if (unsafe && targetP > ownP - 80) {
      targetP = Math.max(150, ownP - 80);
      pos = path.pointAt(targetP);
    }

    // 1) Last hits (never under an untanked enemy tower).
    const lh = this._lastHitTarget(ch, ctx, enemyTower, tanked);
    if (lh) { this._attack(b, ch, lh.id); return; }

    // 2) Push: siege a tanked tower, else clear the wave.
    const plan = this.plans[team];
    const contested = ctx.enemyChamps.some((e) => e.d < 1000);
    if (!contested || plan.group) {
      if (enemyTower && tanked && !enemyTower.invulnerable && dist(ch, enemyTower) < 1100) {
        this._attack(b, ch, enemyTower.id);
        this._farmCasts(b, ch, enemyTower, ctx, now, 0.9); // steroids only, really
        return;
      }
      const m = this._farmTarget(ch, ctx, enemyTower, tanked);
      if (m) {
        this._attack(b, ch, m.id);
        if (ctx.enemyMinions.length >= 3) this._farmCasts(b, ch, m, ctx, now, plan.group ? 0.35 : 0.6);
        return;
      }
    }
    // 3) Hold position behind the wave.
    this._move(b, ch, pos.x + b.side * 40, pos.y - b.side * 40);
  }

  /** Enemy minion we can kill with one auto right now. */
  _lastHitTarget(ch, ctx, enemyTower, tanked) {
    let best = null;
    for (const { e, d } of ctx.enemyMinions) {
      if (d > ch.range + 280) continue;
      if (enemyTower && !tanked && dist(e, enemyTower) <= TOWER.range + 40) continue;
      if (e.hp > ch.ad * 1.02) continue;
      if (!best || e.hp < best.hp) best = e;
    }
    return best;
  }

  /** Lowest-HP enemy minion within reach (for pushing). */
  _farmTarget(ch, ctx, enemyTower, tanked) {
    let best = null;
    for (const { e, d } of ctx.enemyMinions) {
      if (d > ch.range + 300) continue;
      if (enemyTower && !tanked && dist(e, enemyTower) <= TOWER.range + 40) continue;
      if (!best || e.hp < best.hp) best = e;
    }
    return best;
  }

  _jungle(b, ch, ctx, now) {
    const room = this.room;
    // Gank: a weak enemy laner near one of our lanes.
    if (!b.gankId && now >= b.nextGankAt && ch.level >= GANK_MIN_LEVEL && ctx.hp > 0.6) {
      b.nextGankAt = now + rand(...GANK_EVERY_MS);
      let best = null, bestScore = 0;
      for (const e of room.champs.values()) {
        if (e.dead || e.team === ch.team || !room.canSee(ch.team, e, now)) continue;
        const d = dist(ch, e);
        if (d > 3200 || this._enemyTowerAt(e.x, e.y, ch.team, 150)) continue;
        if (!e.isBot && room.matchMs(now) < HUMAN_GANK_GRACE_MS) continue; // let new humans learn their lane
        const allyNear = [...room.champs.values()].some((a) => a.team === ch.team && !a.dead && a !== ch && dist(a, e) < 1100);
        const score = (1 - hpPct(e)) + (allyNear ? 0.5 : 0) - d / 6000;
        if (score > bestScore) { bestScore = score; best = e; }
      }
      if (best && bestScore > 0.35) { b.gankId = best.id; b.gankUntil = now + 15000; }
    }
    if (b.gankId) {
      const t = room.champs.get(b.gankId);
      if (!t || t.dead || now > b.gankUntil || this._enemyTowerAt(t.x, t.y, ch.team, 100) || !room.canSee(ch.team, t, now)) {
        b.gankId = '';
      } else {
        this._offensiveCasts(b, ch, t, ctx, now);
        this._spellOffense(b, ch, t, ctx, now);
        this._attack(b, ch, t.id);
        return;
      }
    }
    // Clear our camps.
    const camp = this._pickCamp(b, ch, ctx);
    if (camp) {
      b.campId = camp.id;
      let target = null;
      for (const uid of camp.unitIds) {
        const u = room.units.get(uid);
        if (!u || !u.alive || u.resetting) continue;
        if (!target || (u.target === ch.id && target.target !== ch.id) || (u.target === target.target && u.hp < target.hp)) target = u;
      }
      if (target) {
        this._attack(b, ch, target.id);
        if (dist(ch, target) < 700) this._farmCasts(b, ch, target, ctx, now, 0.25);
        return;
      }
    }
    b.campId = '';
    // Nothing up: help the lane with the most pressure (default mid).
    this._lane(b, ch, ctx, this._busiestLane(ch.team), now);
  }

  _pickCamp(b, ch, ctx) {
    const room = this.room;
    let best = null, bestScore = Infinity;
    for (const camp of room.camps.values()) {
      if (camp.epic || camp.side !== ch.team) continue;
      let alive = 0;
      for (const uid of camp.unitIds) { const u = room.units.get(uid); if (u && u.alive && !u.resetting) alive++; }
      if (!alive) continue;
      // Enemy champions camping it? Skip.
      let danger = false;
      for (const e of room.champs.values()) if (!e.dead && e.team !== ch.team && Math.hypot(e.x - camp.x, e.y - camp.y) < 900 && room.canSee(ch.team, e)) danger = true;
      if (danger) continue;
      // A big camp at low level with low HP is a bad idea.
      if (camp.type === 'big' && ch.level < 3 && hpPct(ch) < 0.8) continue;
      let score = Math.hypot(camp.x - ch.x, camp.y - ch.y);
      if (camp.id === b.campId) score -= 800;
      if (score < bestScore) { bestScore = score; best = camp; }
    }
    return best;
  }

  /** Lane where the enemy wave is deepest into our side. */
  _busiestLane(team) {
    const room = this.room;
    let best = 'mid', bestP = Infinity;
    for (const lane of LANE_IDS) {
      const path = lanePath(team, lane);
      for (const u of room.units.values()) {
        if (!u.alive || u.utype !== 'minion' || u.team === team || u.lane !== lane) continue;
        const p = path.progressOf(u.x, u.y);
        if (p < bestP) { bestP = p; best = lane; }
      }
    }
    return best;
  }

  _support(b, ch, ctx, now) {
    const room = this.room;
    let carry = null;
    for (const c of room.champs.values()) {
      if (c === ch || c.team !== ch.team || c.dead || room.inFountain(c) || c.recallUntil > 0) continue;
      const score = (c.role === 'bot' ? -5000 : 0) + dist(ch, c);
      if (!carry || score < carry.score) carry = { c, score };
    }
    if (!carry || dist(ch, carry.c) > 4500) { this._lane(b, ch, ctx, 'bot', now); return; }
    const c = carry.c;
    // Poke enemy champions that come close to the carry (mana permitting).
    const foe = ctx.enemyChamps.find((e) => e.d < ch.range + 150 && !this._enemyTowerAt(e.e.x, e.e.y, ch.team, 60));
    if (foe && ctx.mana > 0.45) this._offensiveCasts(b, ch, foe.e, ctx, now);
    const home = FOUNTAIN[ch.team];
    const d = dist(c, home) || 1;
    const x = c.x + (home.x - c.x) / d * 170 + b.side * 50;
    const y = c.y + (home.y - c.y) / d * 170 - b.side * 50;
    if (this._enemyTowerAt(x, y, ch.team, 40)) { this._lane(b, ch, ctx, c.role === 'bot' ? 'bot' : b.lane, now); return; }
    if (c.atkTarget && c.order?.type === 'attack') {
      const t = room._ent(c.atkTarget);
      if (t && t.etype === 'champ' && dist(ch, t) < ch.range + 200) { this._attack(b, ch, t.id); return; }
    }
    this._move(b, ch, x, y);
  }

  // ───────────────────────── geometry helpers ─────────────────────────
  _precomputeLaneTowers() {
    const out = {};
    const structs = [...this.room.structs.values()];
    for (const team of ['blue', 'red']) {
      out[team] = {};
      for (const lane of LANE_IDS) {
        const path = lanePath(team, lane);
        const own = [], enemy = [];
        for (const s of structs) {
          const onLane = s.lane === lane || s.lane === 'base';
          if (!onLane || s.kind !== 'tower') continue;
          const rec = { id: s.id, p: path.progressOf(s.x, s.y) };
          (s.team === team ? own : enemy).push(rec);
        }
        own.sort((a, b) => a.p - b.p);
        enemy.sort((a, b) => a.p - b.p);
        out[team][lane] = { own, enemy };
      }
    }
    return out;
  }

  /** Enemy (to `team`) tower covering (x, y), if any. */
  _enemyTowerAt(x, y, team, pad = 0) {
    for (const s of this.room.structs.values()) {
      if (!s.alive || s.kind !== 'tower' || s.team === team) continue;
      if (Math.hypot(s.x - x, s.y - y) <= TOWER.range + CHAMP_RADIUS + pad) return s;
    }
    return null;
  }

  _minionsNear(team, at, r) {
    let n = 0;
    for (const u of this.room.units.values()) if (u.alive && u.utype === 'minion' && u.team === team && dist(u, at) <= r) n++;
    return n;
  }

  /** Is the tower busy with our minions (≥ 2 in range, or it's hitting a healthy one)? */
  _towerTanked(tower, team) {
    let n = 0;
    for (const u of this.room.units.values()) {
      if (!u.alive || u.utype !== 'minion' || u.team !== team) continue;
      if (dist(u, tower) <= TOWER.range + u.radius) {
        n++;
        if (n >= 2) return true;
        if (tower.target === u.id && u.hp > u.maxHp * 0.5) return true;
      }
    }
    return false;
  }

  _towerShootingMe(ch) {
    for (const s of this.room.structs.values()) {
      if (s.alive && s.kind === 'tower' && s.team !== ch.team && s.target === ch.id) return s;
    }
    return null;
  }

  _nearestEnemyChamp(ch, r) {
    let best = null, bestD = r;
    for (const c of this.room.champs.values()) {
      if (c.dead || c.team === ch.team || !this.room.canSee(ch.team, c)) continue;
      const d = dist(ch, c);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  /** [x, y] `len` px from `ch` directly away from `from` (biased home). */
  _awayFrom(ch, from, len) {
    const home = FOUNTAIN[ch.team];
    let dx = ch.x - from.x, dy = ch.y - from.y;
    const d = Math.hypot(dx, dy) || 1;
    const hd = Math.hypot(home.x - ch.x, home.y - ch.y) || 1;
    dx = dx / d + (home.x - ch.x) / hd * 0.6;
    dy = dy / d + (home.y - ch.y) / hd * 0.6;
    const n = Math.hypot(dx, dy) || 1;
    const p = clampToMap(ch.x + dx / n * Math.max(120, len), ch.y + dy / n * Math.max(120, len));
    return [p.x, p.y];
  }

  // ───────────────────────── orders ─────────────────────────
  _order(b, msg) { return this.room._doOrder(b.sid, msg); }

  _move(b, ch, x, y) {
    const o = ch.order;
    if (o && o.type === 'move' && Math.hypot((o.rx ?? o.x) - x, (o.ry ?? o.y) - y) < 25) return true;
    if (!o && Math.hypot(ch.x - x, ch.y - y) < 30) return true; // already there (idle → auto-attacks)
    return this._order(b, { type: 'move', x, y });
  }

  _attack(b, ch, id) {
    if (ch.order && ch.order.type === 'attack' && ch.order.id === id) return true;
    return this._order(b, { type: 'attack', id });
  }

  // ───────────────────────── chat + events ─────────────────────────
  _randomBot(filter) {
    const list = [...this.brains.values()].filter((b) => !filter || filter(b));
    return list.length ? pick(list) : null;
  }

  /** Post a chat line as bot `sid` after a short "typing" delay (globally rate-limited). */
  _say(sid, text, prob = 1, delayMs = null) {
    const b = this.brains.get(sid);
    if (!b || b.silent || !text) return false;
    const now = Date.now();
    if (now < this._chatAt || Math.random() > prob) return false;
    this._chatAt = now + rand(...BOT_CHAT_GAP_MS);
    this.room._later(delayMs ?? rand(500, 1500), () => {
      const ch = this.room.champs.get(sid);
      if (!ch || !this.brains.has(sid)) return;
      this.room._broadcastChat({ sid, name: ch.name, text, kind: 'bot' });
    });
    return true;
  }

  onMatchStart() {
    let i = 0;
    for (const b of this.brains.values()) {
      const ch = this.room.champs.get(b.sid);
      if (!ch || b.silent || Math.random() > 0.35 || i >= 2) continue;
      i++;
      const line = Math.random() < 0.5 ? ch.def.lines?.pick : pick(BOT_TEAM_LINES.start);
      this._chatAt = 0;
      this._say(b.sid, line, 1, rand(1500, 4000) + i * 1800);
    }
  }

  onChampDeath(victim, killer) {
    const vb = this.brains.get(victim.id);
    if (vb) { vb.gankId = ''; vb.diveUntil = 0; }
    if (killer && this.brains.has(killer.id)) {
      const kb = this.brains.get(killer.id);
      if (kb.gankId === victim.id) kb.gankId = '';
      this._say(killer.id, Math.random() < 0.6 ? killer.def.lines?.kill : pick(BOT_TEAM_LINES.kill), 0.3);
    } else if (vb) {
      this._say(victim.id, Math.random() < 0.6 ? victim.def.lines?.death : pick(BOT_TEAM_LINES.death), 0.25);
    }
  }

  onLevelUp(_ch, _lv) { /* stats are recomputed by the room; nothing to do */ }
  onRecalled(_ch) { /* the next think shops + heals */ }

  onEpicSpawn(_id) {
    const b = this._randomBot((x) => !x.silent);
    if (b) this._say(b.sid, pick(BOT_TEAM_LINES.epicSpawn), 0.5, rand(1200, 2600));
  }

  onEpicKilled(id, team) {
    for (const t of ['blue', 'red']) if (this.plans[t].epic === id) this.plans[t].epic = null;
    const b = this._randomBot((x) => !x.silent && this.room.champs.get(x.sid)?.team === team);
    if (b) this._say(b.sid, pick(BOT_TEAM_LINES.epicWon), 0.6);
  }

  onStructureDestroyed(s) {
    const winner = otherTeam(s.team);
    const b = this._randomBot((x) => !x.silent && this.room.champs.get(x.sid)?.team === (Math.random() < 0.6 ? winner : s.team));
    if (!b) return;
    const ch = this.room.champs.get(b.sid);
    this._say(b.sid, pick(ch.team === winner ? BOT_TEAM_LINES.towerWon : BOT_TEAM_LINES.towerLost), 0.45);
  }

  onMatchEnd(winner) {
    this._chatAt = 0;
    const w = this._randomBot((x) => !x.silent && this.room.champs.get(x.sid)?.team === winner);
    const l = this._randomBot((x) => !x.silent && this.room.champs.get(x.sid)?.team !== winner);
    if (w) this._say(w.sid, pick(BOT_TEAM_LINES.win), 1, rand(1200, 2500));
    this._chatAt = 0;
    if (l) this._say(l.sid, pick(BOT_TEAM_LINES.lose), 1, rand(2800, 4500));
  }

  /** A human said something — maybe a bot answers (same rules as the arena bots). */
  onHumanChat(sid, text) {
    if (this.brains.has(sid) || !this.brains.size) return;
    const rule = BOT_TEAM_REPLIES.find((r) => r.re.test(text));
    if (!rule || Math.random() > 0.85) return;
    const human = this.room.champs.get(sid);
    const mate = this._randomBot((x) => !x.silent && this.room.champs.get(x.sid)?.team === human?.team)
      || this._randomBot((x) => !x.silent);
    if (!mate) return;
    this._chatAt = 0;
    this._say(mate.sid, pick(rule.lines), 1, rand(1200, 2800));
  }
}

// Exported for the harness / reviewers.
export const BOT_TUNING = {
  THINK_MS, RETREAT_HP, RETREAT_HP_OUTNUMBERED, FIGHT_MIN_HP, RECALL_GOLD_MIN, GROUP_AFTER_MS,
  GROUP_AFTER_TOWERS, EPIC_MIN_ALLIES, DEADLINE_MIN_AVG_LEVEL, GOLDEN_MIN_AVG_LEVEL,
};

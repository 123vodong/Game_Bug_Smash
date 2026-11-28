// server/game/moba/SkillEngine.js — generic interpreter for the skill specs in
// shared/moba/champions.js (see the spec comment at the top of that file).
//
// The room validates the generic part of a cast (phase, alive, stun, slot,
// level for R, cooldown, mana, rate limit, finite aim) and then calls
// cast(); this module validates the type-specific part (rooted, target in
// range, …) and returns false if the cast can't happen — the room only spends
// mana / starts the cooldown on `true`.
//
// Projectiles, delayed circles and persistent zones are simulated here per
// tick and are NOT in the synced state — clients get `fx` messages and animate
// them locally.
//
// v2 ("Walls & New Hires"): `zone` type (persistent ticking area, `fx zone`),
// projectile fans (`count` + `spread`, ONE hit set shared by the whole cast),
// circles `at:'pet'`, `knockback` / `wallStun` (displacement lives in the room:
// TeamRoom._knockback), dashes stop at walls (nav.clipMove), blinks land on
// nav.nearestFree. Pets are never hit by anything.
// All damage / healing / CC goes through the room (_dealDamage, _heal,
// _addShield, _addBuff, _applyCC) so armor, shields, lifesteal, kill credit
// and assists stay in one place.
import { scaledAmount } from '../../../shared/moba/rules.js';
import { skillDamageType, CC_TUNING } from '../../../shared/moba/champions.js';
import { CHAMP_RADIUS, clampToMap, distToSeg } from '../../../shared/moba/map.js';
import { clipMove, nearestFree, isBlocked, blinkLanding } from '../../../shared/moba/nav.js';
import { MAX_FAN_COUNT, MIN_ZONE_TICK_MS } from './tuning.js';

/** Spec keys handled by CC_HANDLERS (classifySkill lists the ones a spec carries). */
const CC_SPEC_KEYS = ['stun', 'root', 'slow', 'silence', 'airborne', 'charm', 'fear', 'taunt', 'blind', 'disarm', 'suppress'];
const HARD_SPEC_KEYS = ['stun', 'root', 'airborne', 'charm', 'fear', 'taunt', 'suppress'];
const SHAPE_TYPES = new Set(['cone', 'line', 'arc']);
const SELF_TYPES = new Set(['circle', 'zone', 'cone', 'line', 'arc']); // types that accept self{} (applied at cast start)
const AUTO_TARGET_RADIUS = 170; // point-and-click fallback: enemy nearest to the aim point
export const MIN_AIM_DIST = 24;      // aim this close to yourself = use facing direction

/** Unit direction from `from` toward (x, y); falls back to the entity's facing. */
export function aimDir(from, x, y) {
  const dx = x - from.x, dy = y - from.y;
  const d = Math.hypot(dx, dy);
  if (!(d >= MIN_AIM_DIST)) {
    const fl = Math.hypot(from.faceX || 0, from.faceY || 0);
    return fl > 0.01 ? { dx: from.faceX / fl, dy: from.faceY / fl, d: 0 } : { dx: 1, dy: 0, d: 0 };
  }
  return { dx: dx / d, dy: dy / d, d };
}

const round = (v) => Math.round(v);
const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Static classification of a skill spec — used by the bots to decide WHEN to
 * cast what, generically from the data.
 */
export function classifySkill(spec) {
  if (!spec) return null;
  const b = spec.buff || {};
  return {
    type: spec.type,
    damage: !!spec.dmg,
    cc: CC_SPEC_KEYS.filter((k) => spec[k]), // v6.1: LIST of CC keys on the spec (empty = none)
    hardCC: HARD_SPEC_KEYS.some((k) => spec[k]),
    heal: !!spec.heal,
    shield: !!spec.shield,
    defensive: !!(spec.shield || b.dmgReduction || b.armor),
    steroid: !!(b.as || b.apPct || b.adPct || b.petPct),
    speed: !!b.msPct,
    mobility: spec.type === 'dash' || spec.type === 'blink',
    selfCentered: (spec.type === 'circle' || spec.type === 'zone') && !spec.range && spec.at !== 'pet',
    allies: spec.type === 'allies',
    // v2
    zone: spec.type === 'zone',
    fan: spec.type === 'projectile' && (spec.count | 0) > 1,
    knockback: !!(spec.knockback && spec.knockback.dist > 0),
    wallStun: !!(spec.wallStun && spec.wallStun.ms > 0),
    atPet: spec.at === 'pet',
    petBuff: !!b.petPct,
    trap: !!spec.trap,
    pull: !!spec.pull,
    pullIn: !!spec.pullIn,
    boomerang: !!spec.boomerang,
    chain: !!spec.chain,
    spellShield: !!(spec.spellShieldMs > 0),
    stealth: !!(spec.invisMs > 0),
    killReset: !!spec.killReset,
    // v5
    silence: !!spec.silence,
    swap: spec.type === 'swap',
    stasis: !!spec.stasis,
    recast: !!spec.recast,
    mark: !!spec.mark,
    detonate: !!spec.detonate,
    // v6 kit redesign
    hold: spec.input === 'hold',
    drag: spec.input === 'drag',
    place: spec.type === 'place',
    objKind: spec.obj ? spec.obj.kind : '',
    stance: spec.type === 'stance',
    tether: spec.type === 'tether',
    link: spec.type === 'link',
    rewind: spec.type === 'rewind',
    shadow: spec.type === 'shadow',
    summon: spec.type === 'summon',
    echo: spec.type === 'echo',
    timebox: spec.type === 'timebox',
    reload: spec.type === 'reload',
    pickup: spec.type === 'pickup',
    deliver: spec.type === 'deliver',
    serve: spec.type === 'serve',
    resolve: spec.type === 'resolve',
    objcmd: spec.type === 'objcmd',
    spend: !!spec.spend,
    hint: spec.bot || '',
    // v6.1
    shape: SHAPE_TYPES.has(spec.type) ? spec.type : (spec.inner > 0 || spec.objcmd?.inner > 0 ? 'ring' : ''),
    global: !!spec.global,
    phase: !!spec.phase,
    untarget: !!spec.untarget,
    revive: !!spec.reviveGuard,
    suppress: !!spec.suppress,
    self: !!spec.self,
    barrier: spec.obj?.kind === 'barrier',
  };
}

/**
 * Skill type -> handler(engine, ch, slot, spec, aim, now) -> bool. v6.1 extension point: new primitives
 * (cone / line / ring / arc shapes, revive, long-range dashes ...) register here without touching cast().
 */
export const TYPE_HANDLERS = {
  projectile: (e, ch, slot, spec, aim, now) => (spec.global ? e._global(ch, slot, spec, aim, now) : e._projectile(ch, slot, spec, aim)),
  cone: (e, ch, slot, spec, aim, now) => e._shape(ch, slot, spec, aim, now),
  line: (e, ch, slot, spec, aim, now) => e._shape(ch, slot, spec, aim, now),
  arc: (e, ch, slot, spec, aim, now) => e._shape(ch, slot, spec, aim, now),
  circle: (e, ch, slot, spec, aim, now) => e._circle(ch, slot, spec, aim, now),
  target: (e, ch, slot, spec, aim, now) => e._target(ch, slot, spec, aim, now),
  dash: (e, ch, slot, spec, aim, now) => e._dash(ch, slot, spec, aim, now),
  blink: (e, ch, slot, spec, aim, now) => e._blink(ch, slot, spec, aim, now),
  self: (e, ch, slot, spec, aim, now) => e._self(ch, slot, spec, now),
  allies: (e, ch, slot, spec, aim, now) => e._allies(ch, slot, spec, now),
  zone: (e, ch, slot, spec, aim, now) => e._zone(ch, slot, spec, aim, now),
  swap: (e, ch, slot, spec, aim, now) => e._swap(ch, slot, spec, aim, now),
  place: (e, ch, slot, spec, aim, now) => e.room.objects.place(ch, slot, spec, aim, now),
  objcmd: (e, ch, slot, spec, aim, now) => e.room.objects.cmd(ch, slot, spec, now),
  resolve: (e, ch, slot, spec, aim, now) => e.room.objects.resolve(ch, slot, spec, now),
  rewind: (e, ch, slot, spec, aim, now) => e.room.rewind.rewind(ch, slot, spec, now),
  tether: (e, ch, slot, spec, aim, now) => e.room.rewind.tether(ch, slot, spec, aim, now),
  link: (e, ch, slot, spec, aim, now) => e.room.rewind.link(ch, slot, spec, aim, now),
  shadow: (e, ch, slot, spec, aim, now) => e.room.rewind.shadow(ch, slot, spec, aim, now),
  summon: (e, ch, slot, spec, aim, now) => e.room.rewind.summon(ch, slot, spec, aim, now),
  deliver: (e, ch, slot, spec, aim, now) => e.room.rewind.deliver(ch, slot, spec, aim, now),
  stance: (e, ch, slot, spec, aim, now) => e.room.kits.stance(ch, slot, spec, now),
  echo: (e, ch, slot, spec, aim, now) => e.room.kits.echo(ch, slot, spec, now),
  timebox: (e, ch, slot, spec, aim, now) => e.room.kits.timebox(ch, slot, spec, now),
  reload: (e, ch, slot, spec, aim, now) => e.room.kits.reload(ch, slot, spec, aim, now),
  pickup: (e, ch, slot, spec, aim, now) => e.room.kits.pickup(ch, slot, spec, now),
  serve: (e, ch, slot, spec, aim, now) => e.room.kits.serve(ch, slot, spec, aim, now),
};

export class SkillEngine {
  constructor(room) {
    this.room = room;
    this.projectiles = []; // { owner, team, slot, x, y, dx, dy, speed, left, half, pierce, champOnly, spec, amount, color, hit:Set }
    this.zones = [];       // delayed circles { at, owner, team, slot, x, y, r, spec, amount, color }
    this.areas = [];       // v2 persistent zones { owner, team, slot, x, y, r, spec, amount, heal, nextAt, until, tickMs }
    this.traps = [];       // ground traps { tid, owner, ownerId, team, slot, x, y, r, armedAt, until, spec, amount, color }
    this._trapSeq = 0;
    this.shapes = [];      // v6.1 cone / line / arc { owner, team, slot, shape, ox, oy, dx, dy, spec, amount, at, sweepMs, hit }
    this.windups = [];     // v6.1 global shots waiting for their windup { owner, slot, spec, dx, dy, amount, at }
  }

  clear() { this.projectiles.length = 0; this.zones.length = 0; this.areas.length = 0; this.traps.length = 0; this.shapes.length = 0; this.windups.length = 0; }

  /** Cast `slot` (spec) for champion record `ch` at aim { x, y, id }. True if it went off. */
  cast(ch, slot, spec, aim, now) {
    ch._lastCastSlot = slot;
    if (spec && !spec._slot) spec._slot = slot;
    const prevStacks = ch._gradStacks, prevUntil = ch._gradUntil;
    if (ch.champ === 'model') {
      if ((ch._gradUntil || 0) > now) ch._gradStacks = Math.min(3, (ch._gradStacks || 0) + 1);
      else ch._gradStacks = 0;
      ch._gradUntil = now + 4000;
      ch._gradMul = 1 + ch._gradStacks * 0.1;
    } else {
      ch._gradMul = 1;
    }
    const h = TYPE_HANDLERS[spec.type]; // registry: a new skill type = one entry in TYPE_HANDLERS
    if (spec.self && SELF_TYPES.has(spec.type)) this._self(ch, slot, { color: spec.color, ...spec.self }, now); // v6.1: caster gets shield / buff at CAST START
    const ok = h ? !!h(this, ch, slot, spec, aim, now) : false;
    if (ok && spec.untarget) this.room.cc.onCastUntarget(ch, spec, now); // v6.1: untargetable window
    if (!ok) {
      ch._gradStacks = prevStacks;
      ch._gradUntil = prevUntil;
      ch._gradMul = 1;
    }
    return ok;
  }

  /** Amount of an amount spec for the caster's CURRENT stats + skill rank scaling. */
  amount(ch, amountSpec, slot = ch._lastCastSlot) {
    const rank = Math.max(1, ch.ranks?.[slot] || 1);
    let mul = 1 + 0.12 * (rank - 1);
    if (ch._gradMul && ch._gradMul > 1) mul *= ch._gradMul;
    if (ch._kitMul && ch._kitMul !== 1) mul *= ch._kitMul; // v6: hold charge, spent resource units, echo power, serve size
    return scaledAmount(amountSpec, ch.level, ch.ad, ch.ap, ch.maxHp) * mul;
  }

  /**
   * v5 second press of a `recast` skill (free: no mana, no cooldown).
   * rc = { until, x0, y0 } recorded by the room at the first cast.
   */
  recast(ch, slot, spec, aim, now, rc) {
    const mode = spec.recast && spec.recast.mode;
    if (mode === 'back') {
      if (now < ch.rootedUntil) return false;
      const x0 = ch.x, y0 = ch.y;
      const end = nearestFree(rc.x0, rc.y0, CHAMP_RADIUS);
      this.room._teleport(ch, end.x, end.y);
      this.room._fx({ k: 'blink', sid: ch.id, slot, x0: round(x0), y0: round(y0), x1: round(ch.x), y1: round(ch.y) });
      return true;
    }
    if (mode === 'again') return this.cast(ch, slot, { ...spec, recast: null }, aim, now);
    if (mode === 'place2' || mode === 'toObj') return this.room.objects.recast(ch, slot, spec, aim, now);
    return false;
  }

  /** v5 `swap`: trade places with the allied champion nearest the aim within `range`. */
  _swap(ch, slot, spec, aim, now) {
    if (now < ch.rootedUntil) return false; // displacement skills fail while rooted (same rule as blink / dash)
    const reach = (spec.range || 600) + 40;
    const okAlly = (a) => a && a !== ch && !a.dead && a.team === ch.team && Math.hypot(a.x - ch.x, a.y - ch.y) <= reach;
    let ally = aim.id ? this.room.champs.get(aim.id) : null; // the client-chosen ally (targets:'ally') wins
    if (!okAlly(ally)) {
      ally = null;
      let best = 220; // otherwise the ally must be within 220 px of the aim point
      for (const a of this.room.champs.values()) {
        if (!okAlly(a)) continue;
        const d = Math.hypot(a.x - aim.x, a.y - aim.y);
        if (d <= best) { best = d; ally = a; }
      }
    }
    if (!ally) return false;
    const until = now + (spec.duration || 0);
    const ax = ally.x, ay = ally.y, cx = ch.x, cy = ch.y;
    this.room._teleport(ch, ax, ay);
    this.room._teleport(ally, cx, cy);
    if ((ally.suppressUntil || 0) > now) this.room.cc.breakOn(ally, 'teleport', now); // moving a suppressed ally frees it
    this.room._fx({ k: 'blink', sid: ch.id, slot, x0: round(cx), y0: round(cy), x1: round(ax), y1: round(ay) }); // one fx links both ends
    const sh = spec.shield ? this.amount(ch, spec.shield) : 0;
    for (const who of [ch, ally]) {
      if (sh) this.room._addShield(who, sh, until);
      if (spec.buff) this.room._addBuff(who, slot, spec.buff, until);
    }
    this.room._fx({ k: 'buff', sid: ch.id, slot, color: spec.color });
    return true;
  }

  // ───────────────────────── types ─────────────────────────

  /** One projectile, or a fan of `count` across `spread` deg (one `proj` fx each, ONE shared hit set). */
  _projectile(ch, slot, spec, aim, amountOverride) {
    const { dx, dy } = aimDir(ch, aim.x, aim.y);
    const count = Math.max(1, Math.min(MAX_FAN_COUNT, (spec.count | 0) || 1));
    const spread = count > 1 ? ((Number(spec.spread) || 0) * Math.PI) / 180 : 0;
    const base = Math.atan2(dy, dx);
    const hit = new Set();
    const amount = amountOverride ?? this.amount(ch, spec.dmg);
    for (let k = 0; k < count; k++) {
      const a = count > 1 ? base + spread * (k / (count - 1) - 0.5) : base;
      const px = count > 1 ? Math.cos(a) : dx, py = count > 1 ? Math.sin(a) : dy;
      const p = {
        owner: ch, team: ch.team, slot, x: ch.x, y: ch.y, dx: px, dy: py,
        speed: spec.speed || 1200, left: spec.range || 800, half: (spec.width || 60) / 2,
        pierce: !!(spec.pierce || spec.boomerang), champOnly: !!spec.champOnly, spec,
        amount, color: spec.color, hit, returning: false,
      };
      this.projectiles.push(p);
      this.room._fx({
        k: 'proj', sid: ch.id, slot, x: round(ch.x), y: round(ch.y), dx: round3(px), dy: round3(py),
        speed: p.speed, range: p.left, width: spec.width || 60, color: spec.color, boomerang: !!spec.boomerang,
      });
    }
    ch.faceX = dx; ch.faceY = dy;
    return true;
  }

  /**
   * v6.1 global shot (Tester R): direction locked at cast, warning line (`gping`) to BOTH teams, the caster is slowed and
   * cannot cast for windupMs, then the champOnly projectile launches. Hard CC during the windup cancels it (mana stays spent).
   */
  _global(ch, slot, spec, aim, now) {
    const { dx, dy } = aimDir(ch, aim.x, aim.y);
    const range = Math.min(spec.range || 0, 5600);
    const end = clampToMap(ch.x + dx * range, ch.y + dy * range, 0);
    const wind = Math.max(0, spec.windupMs || 0);
    ch.faceX = dx; ch.faceY = dy;
    this.room._fx({ k: 'gping', sid: ch.id, x0: round(ch.x), y0: round(ch.y), x1: round(end.x), y1: round(end.y), ms: CC_TUNING.GLOBAL_WARN_MS });
    ch._castLockUntil = now + wind;
    this.room._applyCC(ch, { slow: { pct: 0.5, ms: wind } }, now);
    this.windups.push({ owner: ch, slot, spec, dx, dy, amount: this.amount(ch, spec.dmg), at: now + wind });
    this.room.kits.feed('global', { a: ch.def?.name || ch.name });
    return true;
  }

  /** Area center for circle / zone: the pet (at:'pet'), the caster (range 0) or the aim clamped to range. */
  _areaCenter(ch, spec, aim) {
    if (spec.at === 'pet') {
      const pet = this.room._petOf(ch);
      return pet ? { x: pet.x, y: pet.y } : { x: ch.x, y: ch.y };
    }
    if (!(spec.range > 0)) return { x: ch.x, y: ch.y };
    const { dx, dy, d } = aimDir(ch, aim.x, aim.y);
    const reach = Math.min(spec.range, d);
    if (d > 0) { ch.faceX = dx; ch.faceY = dy; }
    return clampToMap(ch.x + dx * reach, ch.y + dy * reach, 0);
  }

  _circle(ch, slot, spec, aim, now) {
    const { x, y } = this._areaCenter(ch, spec, aim);
    if (spec.trap) {
      const tr = spec.trap;
      const maxActive = Math.max(1, tr.maxActive || 3);
      const owned = this.traps.filter((tp) => tp.ownerId === ch.id && tp.slot === slot);
      if (owned.length >= maxActive) {
        const idx = this.traps.indexOf(owned[0]);
        if (idx >= 0) {
          this.room._fx({ k: 'trapEnd', tid: owned[0].tid });
          this.traps.splice(idx, 1);
        }
      }
      const dur = Math.max(1000, tr.durationMs || 25000);
      const tid = `tr_${++this._trapSeq}`;
      this.traps.push({
        tid, owner: ch, ownerId: ch.id, team: ch.team, slot, x, y, r: spec.radius || 95,
        armedAt: now + Math.max(0, tr.armMs || 450), until: now + dur,
        spec, amount: this.amount(ch, spec.dmg), color: spec.color,
      });
      this.room._fx({
        k: 'zone', sid: ch.id, team: ch.team, slot, tid, trap: true, enemyRevealMs: 3000, stealthAfterMs: 3000,
        x: round(x), y: round(y), r: spec.radius || 95, ms: dur, tickMs: 1200, color: spec.color,
      });
      return true;
    }
    const delay = Math.max(0, spec.delay || 0);
    const amount = this.amount(ch, spec.dmg);
    const spots = [{ x, y }];
    const sh = ch._shadow;
    if (spec.alsoAtShadow && sh && sh.until > now) spots.push({ x: sh.x, y: sh.y }); // v6: a second identical area at the shadow
    const hit = spots.length > 1 ? new Set() : null; // each target is hit at most once per cast
    for (const p of spots) {
      this.room._fx({ k: 'circle', sid: ch.id, slot, x: round(p.x), y: round(p.y), r: spec.radius, ...(spec.inner > 0 ? { inner: spec.inner } : {}), delay, color: spec.color });
      const zone = { at: now + delay, owner: ch, team: ch.team, slot, x: p.x, y: p.y, r: spec.radius, inner: spec.inner || 0, spec, amount, color: spec.color, hit };
      if (delay > 0) this.zones.push(zone);
      else this._resolveZone(zone, now);
    }
    return true;
  }

  /** v2 persistent zone: ticks every `tickMs` for `duration` (first tick right away). */
  _zone(ch, slot, spec, aim, now) {
    const { x, y } = this._areaCenter(ch, spec, aim);
    return this._spawnArea(ch, slot, spec, x, y, now);
  }

  _spawnArea(ch, slot, spec, x, y, now) {
    const ms = Math.max(0, spec.duration || 0);
    const tickMs = Math.max(MIN_ZONE_TICK_MS, spec.tickMs || 500);
    const r = spec.radius || 0;
    this.areas.push({
      owner: ch, team: ch.team, slot, x, y, r, inner: spec.inner || 0, spec, tickMs, nextAt: now, until: now + ms,
      amount: spec.dmg ? this.amount(ch, spec.dmg) : 0, heal: spec.heal ? this.amount(ch, spec.heal) : 0,
    });
    this.room._fx({ k: 'zone', sid: ch.id, slot, x: round(x), y: round(y), r, ms, tickMs, color: spec.color });
    return true;
  }

  _target(ch, slot, spec, aim, now) {
    const t = this.room._skillTarget(ch, aim, spec.targets === 'enemyChamp', spec.range);
    if (!t) return false;
    const x0 = ch.x, y0 = ch.y;
    const d = Math.hypot(t.x - x0, t.y - y0) || 1;
    const ux = (t.x - x0) / d, uy = (t.y - y0) / d;
    ch.faceX = ux; ch.faceY = uy;
    this.room._fx({ k: 'tgt', sid: ch.id, slot, x0: round(x0), y0: round(y0), x1: round(t.x), y1: round(t.y), color: spec.color });
    if (spec.behindTarget) {
      const behind = clampToMap(t.x + ux * (t.radius + CHAMP_RADIUS + 14), t.y + uy * (t.radius + CHAMP_RADIUS + 14));
      const end = blinkLanding(x0, y0, behind.x, behind.y, CHAMP_RADIUS);
      this.room._teleport(ch, end.x, end.y);
      this.room._fx({ k: 'blink', sid: ch.id, x0: round(x0), y0: round(y0), x1: round(ch.x), y1: round(ch.y) });
    }
    if (spec.shadowAt === 'origin') {
      // v6: leave a shadow where the caster stood (lifetime from the caster's Q shadow spec)
      const ms = ch.def.skills.q?.shadow?.ms || 6000;
      this.room.rewind.placeShadow(ch, x0, y0, ms, now);
    }
    this._applyHit(ch, t, spec, this.amount(ch, spec.dmg), now, ch.x, ch.y);
    return true;
  }

  _dash(ch, slot, spec, aim, now) {
    if (now < ch.rootedUntil) return false;
    const x0 = ch.x, y0 = ch.y;
    let target = null;
    if (spec.toTarget) target = this.room._skillTarget(ch, aim, spec.targets === 'enemyChamp', spec.range);
    let dx, dy, reach;
    if (target) {
      const d = Math.hypot(target.x - x0, target.y - y0) || 1;
      dx = (target.x - x0) / d; dy = (target.y - y0) / d;
      reach = spec.behindTarget
        ? Math.min(spec.range + target.radius + CHAMP_RADIUS, d + target.radius + CHAMP_RADIUS + 12)
        : Math.max(0, Math.min(spec.range, d - (target.radius + CHAMP_RADIUS)));
    } else {
      const a = aimDir(ch, aim.x, aim.y);
      dx = a.dx; dy = a.dy;
      reach = a.d > 0 ? Math.min(spec.range, a.d) : spec.range;
    }
    let end = clampToMap(x0 + dx * reach, y0 + dy * reach);
    const ph = spec.phase && !spec.behindTarget ? this._phase(x0, y0, end.x, end.y, spec.phase.maxWall || 0) : null; // v6.1 terrain-crossing dash
    let clip = ph ? { x: ph.x, y: ph.y, hit: ph.stopped } : spec.behindTarget ? { x: end.x, y: end.y, hit: false } : clipMove(x0, y0, end.x, end.y, CHAMP_RADIUS);
    if (!spec.behindTarget && !ph) {
      const bc = this.room.objects.clip(x0, y0, clip.x, clip.y, CHAMP_RADIUS); // v6: dashes stop at a barricade edge
      if (bc.hit) clip = bc;
    }
    end = spec.behindTarget ? blinkLanding(x0, y0, end.x, end.y, CHAMP_RADIUS) : { x: clip.x, y: clip.y };
    const hits = [];
    const hitR = spec.hitRadius || 0;
    if (target) {
      if (spec.behindTarget || !clip.hit || Math.hypot(target.x - end.x, target.y - end.y) <= target.radius + CHAMP_RADIUS + Math.max(hitR, 40)) hits.push(target);
    } else if (hitR > 0 && (spec.dmg || spec.stun || spec.root || spec.slow)) {
      const along0 = this._alongSegment(ch.team, x0, y0, end.x, end.y, hitR, false);
      const along = ph ? along0.filter((h) => this._phaseFree(ph, h.e)) : along0; // hitRadius only counts on free samples
      if (spec.stopAtFirst && along.length) {
        const first = along[0];
        hits.push(first.e);
        const back = Math.max(0, first.t - (first.e.radius + CHAMP_RADIUS) * 0.6);
        if (back < Math.hypot(end.x - x0, end.y - y0)) end = clampToMap(x0 + dx * back, y0 + dy * back);
      } else {
        for (const h of along) hits.push(h.e);
      }
    }
    this.room._teleport(ch, end.x, end.y);
    ch.faceX = dx; ch.faceY = dy;
    if (spec.invisMs > 0) ch._stealthUntil = now + spec.invisMs;
    this.room._fx({
      k: 'dash', sid: ch.id, slot, x0: round(x0), y0: round(y0), x1: round(ch.x), y1: round(ch.y), color: spec.color,
      ...(ph && ph.crossed ? { phase: 1 } : {}), ...(spec.untarget ? { ghost: 1 } : {}),
    });
    if (spec.trail) {
      const tz = { ...spec.trail, type: 'zone', color: spec.trail.color || spec.color, _slot: slot };
      this._spawnArea(ch, slot, tz, (x0 + ch.x) / 2, (y0 + ch.y) / 2, now);
    }
    if (hits.length) {
      const amt = spec.dmg ? this.amount(ch, spec.dmg) : 0;
      for (const h of hits) this._applyHit(ch, h, spec, amt, now, ch.x, ch.y, dx, dy);
    }
    return true;
  }

  /**
   * v6.1 phase path: sample (x0,y0)->(ex,ey) every PHASE_STEP_PX. A contiguous blocked run (wall, barrier, barricade) is crossed
   * when its estimated thickness (samples x step) <= maxWall and the landing is free (nearestFree within PHASE_LAND_SEARCH_PX);
   * otherwise the dash stops at the last free sample before that run. Returns { x, y, stopped, crossed, pts, upto }.
   */
  _phase(x0, y0, ex, ey, maxWall) {
    const r = CHAMP_RADIUS, step = CC_TUNING.PHASE_STEP_PX, objs = this.room.objects;
    const len = Math.hypot(ex - x0, ey - y0);
    const pts = [{ x: x0, y: y0, b: false }];
    if (!(len > 0)) return { x: x0, y: y0, stopped: false, crossed: false, pts, upto: 0 };
    const n = Math.max(1, Math.ceil(len / step));
    let runStart = -1, stop = -1;
    for (let i = 1; i <= n; i++) {
      const k = Math.min(len, i * step) / len;
      const p = { x: x0 + (ex - x0) * k, y: y0 + (ey - y0) * k, b: false };
      p.b = isBlocked(p.x, p.y, r) || objs.solidAt(p.x, p.y, r);
      pts.push(p);
      if (p.b) { if (runStart < 0) runStart = i; continue; }
      if (runStart >= 0) {
        if ((i - runStart) * step > maxWall) { stop = runStart - 1; break; }
        runStart = -1;
      }
    }
    let land = null;
    if (stop < 0 && runStart >= 0) { // the path ends inside a block: cross to the far side if thin enough, else stop short
      const e = pts[n], f = blinkLanding(x0, y0, e.x, e.y, r, maxWall);
      if ((n + 1 - runStart) * step <= maxWall && !isBlocked(f.x, f.y, r) && Math.hypot(f.x - e.x, f.y - e.y) <= maxWall && !objs.solidAt(f.x, f.y, r)) land = f;
      else stop = runStart - 1;
    }
    const upto = stop >= 0 ? stop : n;
    const to = land || pts[upto];
    return { x: to.x, y: to.y, stopped: stop >= 0, crossed: pts.slice(0, upto + 1).some((p) => p.b), pts, upto };
  }

  /** Is the path sample nearest to `e` (up to the landing) a free one? */
  _phaseFree(ph, e) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i <= ph.upto; i++) {
      const d = Math.hypot(ph.pts[i].x - e.x, ph.pts[i].y - e.y);
      if (d < bd) { bd = d; bi = i; }
    }
    return !ph.pts[bi].b;
  }

  _blink(ch, slot, spec, aim, now) {
    if (now < ch.rootedUntil) return false;
    const x0 = ch.x, y0 = ch.y;
    const { dx, dy, d } = aimDir(ch, aim.x, aim.y);
    const reach = d > 0 ? Math.min(spec.range, d) : spec.range;
    const aimed = clampToMap(x0 + dx * reach, y0 + dy * reach);
    const end = blinkLanding(x0, y0, aimed.x, aimed.y, CHAMP_RADIUS);
    this.room._teleport(ch, end.x, end.y);
    ch.faceX = dx; ch.faceY = dy;
    if (spec.invisMs > 0) ch._stealthUntil = now + spec.invisMs;
    this.room._fx({ k: 'blink', sid: ch.id, slot, x0: round(x0), y0: round(y0), x1: round(ch.x), y1: round(ch.y), ...(spec.untarget ? { ghost: 1 } : {}) });
    return true;
  }

  _self(ch, slot, spec, now) {
    const until = now + (spec.duration || 0);
    if (spec.shield) this.room._addShield(ch, this.amount(ch, spec.shield), until);
    if (spec.heal) this.room._heal(ch, this.amount(ch, spec.heal));
    if (spec.buff) this.room._addBuff(ch, slot, spec.buff, until);
    if (spec.spellShieldMs > 0) ch._spellShieldUntil = Math.max(ch._spellShieldUntil || 0, now + spec.spellShieldMs);
    if (spec.invisMs > 0) ch._stealthUntil = now + spec.invisMs;
    if (spec.reviveGuard) this.room.cc.grantRevive(ch, spec.reviveGuard, now, spec.color);
    if (spec.stasis && spec.stasis.ms > 0) {
      ch._stasisUntil = now + spec.stasis.ms;
      ch.stunnedUntil = Math.max(ch.stunnedUntil || 0, now + spec.stasis.ms);
      ch.rootedUntil = Math.max(ch.rootedUntil || 0, now + spec.stasis.ms);
    }
    this.room._fx({ k: 'buff', sid: ch.id, slot, color: spec.color });
    return true;
  }

  _allies(ch, slot, spec, now) {
    const until = now + (spec.duration || 0);
    const heal = spec.heal ? this.amount(ch, spec.heal) : 0;
    const shield = spec.shield ? this.amount(ch, spec.shield) : 0;
    const r = (spec.radius || 0) + CHAMP_RADIUS;
    for (const a of this.room.champs.values()) {
      if (a.team !== ch.team || a.dead) continue;
      if (Math.hypot(a.x - ch.x, a.y - ch.y) > r) continue;
      if (heal) this.room._heal(a, heal);
      if (shield) this.room._addShield(a, shield, until);
      if (spec.buff) this.room._addBuff(a, slot, spec.buff, until);
      if (spec.spellShieldMs > 0) a._spellShieldUntil = Math.max(a._spellShieldUntil || 0, now + spec.spellShieldMs);
      if (spec.reviveGuard) this.room.cc.grantRevive(a, spec.reviveGuard, now, spec.color); // v6.1: once per ally
    }
    if (heal) this.room._fx({ k: 'heal', sid: ch.id, slot, x: round(ch.x), y: round(ch.y), r: spec.radius, color: spec.color });
    this.room._fx({ k: 'buff', sid: ch.id, slot, color: spec.color });
    return true;
  }

  // ───────────────────────── hits ─────────────────────────

  /**
   * Damage (+ execute bonus), CC and knockback on one target. (ox, oy) = the
   * point the knockback pushes away from (caster / area center); (fx, fy) = a
   * fallback direction when the target stands exactly on that point.
   * quiet = skip the `hit` fx for non-champions (zone ticks; units flash via hit_seq).
   */
  _applyHit(caster, t, spec, amount, now, ox, oy, fx, fy, quiet = false, isChainHop = false) {
    if (!this.room._isAlive(t) || t.utype === 'pet') return;
    if ((t._untargetUntil || 0) > now) return; // v6.1: untargetable units take nothing
    if (t.etype === 'champ' && (t._spellShieldUntil || 0) > now) {
      t._spellShieldUntil = 0;
      this.room._fx({ k: 'hit', id: t.id, color: 0xffffff });
      return;
    }
    const slot = spec._slot || caster._lastCastSlot || 'q';
    if (t.utype === 'obj') { // v6: placed objects take damage only (immune to CC / knockback / execute / marks)
      if (amount > 0) this.room._dealDamage(caster, t, amount, { kind: 'skill', dmgType: skillDamageType(spec) });
      if (!quiet) this.room._fx({ k: 'hit', id: t.id, color: spec.color });
      return;
    }
    if (spec.suppress && spec.suppress.strikeAtEnd && !spec._strike) { this._startSuppress(caster, t, spec, amount, now); return; } // 3.4: dmg/execute/detonate wait for the strike
    let dmg = amount * (caster._overloadCast ? 1.28 : 1);
    const wasChampAlive = t.etype === 'champ' && this.room._isAlive(t);
    const augs = caster.augments || [];
    if (spec.execute && t.maxHp > 0) dmg += (spec.execute.missingHpPct || 0) * Math.max(0, t.maxHp - t.hp);
    const useTrue = !!(spec._returnLeg && spec.returnTrueDmg);
    if (dmg > 0) this.room._dealDamage(caster, t, dmg, { kind: 'skill', dmgType: useTrue ? 'true' : skillDamageType(spec), trueDmg: useTrue });
    if (spec.killReset && wasChampAlive && !this.room._isAlive(t) && caster.cd) {
      caster.cd[slot] = 0;
      this.room._fx({ k: 'buff', sid: caster.id, slot, color: 0xffd23f });
    }
    if (t.etype === 'champ' && spec.healOnHit && this.room._isAlive(caster)) {
      this.room._heal(caster, this.amount(caster, spec.healOnHit, slot));
    }
    if (t.etype === 'champ' && spec.cdRefundOnHit && caster.cd) {
      const refMs = spec.cdRefundOnHit.ms || 1000;
      const targetSlots = spec.cdRefundOnHit.slot === 'all' ? ['q', 'w', 'e', 'r'] : [spec.cdRefundOnHit.slot || slot];
      for (const s of targetSlots) if (caster.cd[s] > now) caster.cd[s] = Math.max(now, caster.cd[s] - refMs);
    }
    if (t.etype === 'champ' && this.room._isAlive(t)) {
      if (spec.detonate && t._marks && t._marks[spec.detonate.tag]) {
        const mk = t._marks[spec.detonate.tag];
        delete t._marks[spec.detonate.tag];
        if (mk.until > now && mk.n > 0) {
          this.room._dealDamage(caster, t, dmg * (spec.detonate.pctPerStack || 0.2) * mk.n, { kind: 'skill', trueDmg: true });
        }
      }
      if (spec.mark && this.room._isAlive(t)) {
        t._marks = t._marks || {};
        const cur = t._marks[spec.mark.tag];
        const n = cur && cur.until > now ? cur.n : 0;
        t._marks[spec.mark.tag] = { n: Math.min(spec.mark.max || 1, n + 1), until: now + (spec.mark.ms || 5000) };
      }
      // v6: the Glitch / Vulnerable / Spotted legacy specials are now data (mark + detonate on the specs).
      if (caster.champ === 'pixel' && slot === 'q' && augs.includes('evo_pixel_split')) { // kept: splits the laser-wall hit
        let n = 0;
        for (const foe of this.room.champs.values()) {
          if (n < 2 && foe.id !== t.id && !foe.dead && foe.team !== caster.team && Math.hypot(foe.x - t.x, foe.y - t.y) <= 260) {
            n++;
            this.room._dealDamage(caster, foe, dmg * 0.45, { kind: 'skill', dmgType: skillDamageType(spec) });
          }
        }
      }
      if (caster.champ === 'model' && slot === 'r' && augs.includes('evo_model_nova')) {
        this.room._applyCC(t, { slow: { pct: 0.3, ms: 2500 } }, now);
        t._auditUntil = now + 2500;
      }
    }
    if (this.room._isAlive(t)) {
      this.room._applyCC(t, spec, now, caster);
      if (spec.pull && t.team !== 'neutral' && !t.epic) {
        const pdx = caster.x - t.x, pdy = caster.y - t.y, pd = Math.hypot(pdx, pdy) || 1;
        const pdist = Math.max(0, pd - (t.radius + CHAMP_RADIUS + 36));
        if (pdist > 20) this.room._knockback(t, pdx / pd, pdy / pd, Math.min(pdist, spec.pullDist || 650), 0, now);
      } else if (spec.pullIn && Number.isFinite(ox) && Number.isFinite(oy)) {
        const pdx = ox - t.x, pdy = oy - t.y, pd = Math.hypot(pdx, pdy) || 1;
        const pdist = Math.min(pd * 0.65, spec.pullInDist || 160);
        if (pdist > 15) this.room._knockback(t, pdx / pd, pdy / pd, pdist, 0, now);
      } else if (spec.knockback && spec.knockback.dist > 0 && Number.isFinite(ox) && Number.isFinite(oy)) {
        let kx = t.x - ox, ky = t.y - oy;
        let kd = Math.hypot(kx, ky);
        if (kd < 1) {
          kx = Number.isFinite(fx) ? fx : (caster.faceX || 1);
          ky = Number.isFinite(fy) ? fy : (caster.faceY || 0);
          kd = Math.hypot(kx, ky) || 1;
        }
        this.room._knockback(t, kx / kd, ky / kd, spec.knockback.dist, spec.wallStun ? spec.wallStun.ms : 0, now);
      }
    }
    if (!quiet || t.etype === 'champ') this.room._fx({ k: 'hit', id: t.id, color: spec.color });
    // Chain lightning bounce to nearby distinct enemies
    if (spec.chain && !isChainHop && amount > 0) {
      const bounces = Math.max(1, spec.chain.bounces || 2);
      const rng = spec.chain.range || 360;
      const decay = spec.chain.decay || 0.85;
      const seen = new Set([t.id]);
      let prev = t, curAmt = amount;
      for (let b = 0; b < bounces; b++) {
        curAmt *= decay;
        let nxt = null, bd = rng;
        for (const c of this.room.champs.values()) {
          if (c.dead || c.team === caster.team || seen.has(c.id)) continue;
          const d = Math.hypot(c.x - prev.x, c.y - prev.y);
          if (d <= bd) { bd = d; nxt = c; }
        }
        if (!nxt) {
          for (const u of this.room.units.values()) {
            if (!u.alive || u.resetting || u.team === caster.team || u.utype === 'pet' || u.utype === 'obj' || seen.has(u.id)) continue;
            const d = Math.hypot(u.x - prev.x, u.y - prev.y);
            if (d <= bd) { bd = d; nxt = u; }
          }
        }
        if (!nxt) break;
        seen.add(nxt.id);
        this.room._fx({ k: 'zap', x0: round(prev.x), y0: round(prev.y), x1: round(nxt.x), y1: round(nxt.y), color: spec.color });
        this._applyHit(caster, nxt, spec, curAmt, now, prev.x, prev.y, fx, fy, quiet, true);
        prev = nxt;
      }
    }
  }

  /** v6.1 Zero R: start the suppress channel; the damage is cashed in by Cc.tick at the end (or never, if it is broken). */
  _startSuppress(caster, t, spec, amount, now) {
    if (t.etype !== 'champ') return; // suppress is champion-only
    this.room._applyCC(t, { suppress: spec.suppress }, now, caster);
    this.room.cc.armStrike(caster, t, spec, amount, spec._slot || caster._lastCastSlot || 'r');
  }

  /** Enemies (champions + units, incl. neutral) within `half + radius` of a segment, sorted by distance along it. */
  _alongSegment(team, x0, y0, x1, y1, half, champOnly) {
    const out = [];
    const sx = x1 - x0, sy = y1 - y0;
    const len = Math.hypot(sx, sy) || 1;
    const nowT = Date.now();
    const visit = (e) => {
      if ((e._untargetUntil || 0) > nowT) return; // v6.1: projectiles pass through untargetable units
      const reach = half + e.radius;
      if (distToSeg(e.x, e.y, x0, y0, x1, y1) > reach) return;
      const t = ((e.x - x0) * sx + (e.y - y0) * sy) / len; // projection length
      out.push({ e, t: Math.max(0, t) });
    };
    for (const c of this.room.champs.values()) if (!c.dead && c.team !== team) visit(c);
    if (!champOnly) for (const u of this.room.units.values()) if (u.alive && !u.resetting && u.team !== team && u.utype !== 'pet') visit(u);
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  /** Hit every enemy inside area z (delayed circle, or one tick of a persistent zone). */
  _resolveZone(z, now, quiet = false) {
    const o = z.owner;
    for (const c of this.room.champs.values()) {
      if (c.dead || c.team === z.team || z.hit?.has(c.id)) continue;
      const dc = Math.hypot(c.x - z.x, c.y - z.y);
      if (dc <= z.r + c.radius * 0.5 && !(z.inner > 0 && dc < z.inner)) { z.hit?.add(c.id); this._applyHit(o, c, z.spec, z.amount, now, z.x, z.y, o.faceX, o.faceY, quiet); }
    }
    for (const u of this.room.units.values()) {
      if (!u.alive || u.resetting || u.team === z.team || u.utype === 'pet' || z.hit?.has(u.id)) continue;
      const du = Math.hypot(u.x - z.x, u.y - z.y);
      if (du <= z.r + u.radius * 0.5 && !(z.inner > 0 && du < z.inner)) { z.hit?.add(u.id); this._applyHit(o, u, z.spec, z.amount, now, z.x, z.y, o.faceX, o.faceY, quiet); }
    }
  }

  // ───────────────────────── v6.1 shapes: cone / line / arc ─────────────────────────
  /**
   * Telegraph + hit of a cone, line or arc. Direction AND origin are locked at cast (the `area` fx carries them); hits happen
   * at `delay`; an arc sweeps from the caster's left to right over sweepMs and hits each target when the sweep front reaches it.
   */
  _shape(ch, slot, spec, aim, now) {
    const { dx, dy } = aimDir(ch, aim.x, aim.y);
    ch.faceX = dx; ch.faceY = dy;
    const delay = Math.max(0, spec.delay || 0);
    const sweepMs = spec.type === 'arc' ? Math.max(0, spec.sweepMs || 0) : 0;
    const s = {
      owner: ch, team: ch.team, slot, shape: spec.type, ox: ch.x, oy: ch.y, dx, dy, spec,
      amount: this.amount(ch, spec.dmg), at: now + delay, sweepMs, hit: new Set(),
    };
    const fx = { k: 'area', shape: spec.type, sid: ch.id, slot, x: round(ch.x), y: round(ch.y), a: round3(Math.atan2(dy, dx)), len: spec.range, delay, color: spec.color, fx: spec.fx };
    if (spec.type === 'line') fx.w = spec.width;
    else fx.ang = round3(((spec.angle || 0) * Math.PI) / 180);
    if (spec.inner > 0) fx.inner = spec.inner;
    if (sweepMs) fx.sweep = sweepMs;
    this.room._fx(fx);
    if (!this._stepShape(s, now)) this.shapes.push(s);
    return true;
  }

  /** Position of `e` in shape `s`: -1 = outside, else 0..1 = sweep fraction (0 for cone / line). */
  _shapeF(s, e) {
    const sp = s.spec, vx = e.x - s.ox, vy = e.y - s.oy, d = Math.hypot(vx, vy), r = e.radius || 0;
    if (s.shape === 'line') {
      const proj = vx * s.dx + vy * s.dy, perp = Math.abs(vx * s.dy - vy * s.dx);
      return proj >= 0 && proj <= sp.range && perp <= (sp.width || 0) / 2 + r ? 0 : -1;
    }
    const half = ((sp.angle || 0) * Math.PI) / 360;
    if (s.shape === 'cone') {
      if (d <= 50) return 0; // always hit this close to the origin
      if (d > sp.range + r) return -1;
      return Math.acos(Math.max(-1, Math.min(1, (vx * s.dx + vy * s.dy) / d))) <= half ? 0 : -1;
    }
    if (d < (sp.inner || 0) || d > sp.range + r) return -1; // arc: annular sector
    const phi = Math.atan2(-vx * s.dy + vy * s.dx, vx * s.dx + vy * s.dy); // angle toward the caster's right
    return Math.abs(phi) > half ? -1 : (phi + half) / (2 * half || 1);
  }

  /** Hit what the shape covers right now. Returns true when the shape is finished. */
  _stepShape(s, now) {
    if (now < s.at) return false;
    const front = s.sweepMs > 0 ? Math.min(1, (now - s.at) / s.sweepMs) : 1;
    const visit = (e) => {
      if (s.hit.has(e.id) || (e._untargetUntil || 0) > now) return;
      const f = this._shapeF(s, e);
      if (f < 0 || f > front) return;
      s.hit.add(e.id);
      this._applyHit(s.owner, e, s.spec, s.amount, now, s.ox, s.oy, s.dx, s.dy);
    };
    for (const c of this.room.champs.values()) if (!c.dead && c.team !== s.team) visit(c);
    for (const u of this.room.units.values()) {
      if (u.alive && !u.resetting && u.team !== s.team && u.utype !== 'pet' && u.utype !== 'obj') visit(u);
    }
    return front >= 1;
  }

  /** One tick of a persistent zone: damage + slow enemies, heal allied champions. */
  _tickArea(a, now) {
    const sp = a.spec;
    if (a.amount > 0 || sp.slow || sp.root || sp.stun || sp.knockback) this._resolveZone(a, now, true);
    if (a.heal > 0) {
      for (const c of this.room.champs.values()) {
        if (c.dead || c.team !== a.team) continue;
        if (Math.hypot(c.x - a.x, c.y - a.y) <= a.r + c.radius * 0.5) this.room._heal(c, a.heal);
      }
    }
  }

  // ───────────────────────── per tick ─────────────────────────

  tick(dtMs, now) {
    // v6.1 global shots leaving their windup
    if (this.windups.length) {
      const due = [];
      this.windups = this.windups.filter((w) => {
        const o = w.owner;
        if (!this.room._isAlive(o) || this.room.cc.hardOn(o, now)) { o._castLockUntil = 0; return false; } // stunned / killed during the windup: the shot is lost
        return w.at <= now ? (due.push(w), false) : true;
      });
      for (const w of due) {
        const o = w.owner;
        o._castLockUntil = 0;
        this._projectile(o, w.slot, w.spec, { x: o.x + w.dx * 100, y: o.y + w.dy * 100 }, w.amount);
      }
    }
    // v6.1 cone / line / arc
    if (this.shapes.length) this.shapes = this.shapes.filter((s) => !this._stepShape(s, now));
    // Delayed circles
    if (this.zones.length) {
      const due = [];
      this.zones = this.zones.filter((z) => (z.at <= now ? (due.push(z), false) : true));
      for (const z of due) this._resolveZone(z, now);
    }
    // Persistent zones (v2): at most one tick per server tick, on their own cadence.
    if (this.areas.length) {
      for (const a of this.areas) {
        if (now >= a.nextAt && a.nextAt < a.until) {
          a.nextAt += a.tickMs;
          this._tickArea(a, now);
          if (this.room.state.phase !== 'playing') return;
        }
      }
      this.areas = this.areas.filter((a) => a.nextAt < a.until);
    }
    // Armed ground traps
    if (this.traps.length) {
      const keepTraps = [];
      for (const tr of this.traps) {
        if (now >= tr.until || !this.room._isAlive(tr.owner)) {
          this.room._fx({ k: 'trapEnd', tid: tr.tid });
          continue;
        }
        if (now < tr.armedAt) { keepTraps.push(tr); continue; }
        let victim = null;
        for (const c of this.room.champs.values()) {
          if (!c.dead && c.team !== tr.team && Math.hypot(c.x - tr.x, c.y - tr.y) <= tr.r + c.radius * 0.5) { victim = c; break; }
        }
        if (!victim) {
          for (const u of this.room.units.values()) {
            if (u.alive && !u.resetting && u.team !== tr.team && u.utype !== 'pet' && Math.hypot(u.x - tr.x, u.y - tr.y) <= tr.r + u.radius * 0.5) { victim = u; break; }
          }
        }
        if (victim) {
          this.room._fx({ k: 'trapEnd', tid: tr.tid });
          this.room._fx({ k: 'circle', x: round(tr.x), y: round(tr.y), r: tr.r, delay: 0, color: tr.color });
          this._applyHit(tr.owner, victim, tr.spec, tr.amount, now, tr.x, tr.y);
        } else {
          keepTraps.push(tr);
        }
      }
      this.traps = keepTraps;
    }
    // Projectiles
    if (!this.projectiles.length) return;
    const dt = dtMs / 1000;
    const keep = [];
    for (const p of this.projectiles) {
      if (p.returning && this.room._isAlive(p.owner)) {
        const rdx = p.owner.x - p.x, rdy = p.owner.y - p.y, rd = Math.hypot(rdx, rdy);
        if (rd <= 42) continue;
        p.dx = rdx / rd; p.dy = rdy / rd;
      }
      const step = Math.min(p.left, p.speed * dt);
      const x1 = p.x + p.dx * step, y1 = p.y + p.dy * step;
      let done = false;
      const along = this._alongSegment(p.team, p.x, p.y, x1, y1, p.half, p.champOnly);
      for (const h of along) {
        if (p.hit.has(h.e.id)) { if (!p.pierce) { done = true; break; } continue; }
        p.hit.add(h.e.id);
        const legSpec = p.returning && p.spec.returnTrueDmg ? { ...p.spec, _returnLeg: true } : p.spec;
        this._applyHit(p.owner, h.e, legSpec, p.amount, now, h.e.x - p.dx * 100, h.e.y - p.dy * 100, p.dx, p.dy);
        if (!p.pierce) { done = true; break; }
      }
      p.x = x1; p.y = y1; p.left -= step;
      if (!done && p.left <= 0.5 && !p.returning && p.spec.boomerang && this.room._isAlive(p.owner)) {
        p.returning = true;
        p.hit.clear();
        p.left = (p.spec.range || 800) + 400;
        p.amount *= (p.spec.returnMul || 1.15);
        keep.push(p);
      } else if (!done && p.left > 0.5) {
        keep.push(p);
      }
    }
    this.projectiles = keep;
  }
}

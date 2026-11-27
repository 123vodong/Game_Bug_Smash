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
import { skillDamageType } from '../../../shared/moba/champions.js';
import { CHAMP_RADIUS, clampToMap, distToSeg } from '../../../shared/moba/map.js';
import { clipMove, nearestFree } from '../../../shared/moba/nav.js';
import { MAX_FAN_COUNT, MIN_ZONE_TICK_MS } from './tuning.js';

const AUTO_TARGET_RADIUS = 170; // point-and-click fallback: enemy nearest to the aim point
export const MIN_AIM_DIST = 24;      // aim this close to yourself = use facing direction

/** Unit direction from `from` toward (x, y); falls back to the entity's facing. */
function aimDir(from, x, y) {
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
    cc: !!(spec.stun || spec.root || spec.slow),
    hardCC: !!(spec.stun || spec.root),
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
  };
}

export class SkillEngine {
  constructor(room) {
    this.room = room;
    this.projectiles = []; // { owner, team, slot, x, y, dx, dy, speed, left, half, pierce, champOnly, spec, amount, color, hit:Set }
    this.zones = [];       // delayed circles { at, owner, team, slot, x, y, r, spec, amount, color }
    this.areas = [];       // v2 persistent zones { owner, team, slot, x, y, r, spec, amount, heal, nextAt, until, tickMs }
    this.traps = [];       // ground traps { owner, ownerId, team, slot, x, y, r, armedAt, until, spec, amount, color }
  }

  clear() { this.projectiles.length = 0; this.zones.length = 0; this.areas.length = 0; this.traps.length = 0; }

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
    let ok = false;
    switch (spec.type) {
      case 'projectile': ok = this._projectile(ch, slot, spec, aim); break;
      case 'circle': ok = this._circle(ch, slot, spec, aim, now); break;
      case 'target': ok = this._target(ch, slot, spec, aim, now); break;
      case 'dash': ok = this._dash(ch, slot, spec, aim, now); break;
      case 'blink': ok = this._blink(ch, slot, spec, aim, now); break;
      case 'self': ok = this._self(ch, slot, spec, now); break;
      case 'allies': ok = this._allies(ch, slot, spec, now); break;
      case 'zone': ok = this._zone(ch, slot, spec, aim, now); break;
      default: ok = false;
    }
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
    const now = Date.now();
    if (slot === 'q' || slot === 'r') {
      if ((ch._empowerUntil || 0) > now) { ch._empowerUntil = 0; mul *= 1.2; }
      if ((ch._overfitUntil || 0) > now) { ch._overfitUntil = 0; mul *= 1.2; }
    }
    if (ch._gradMul && ch._gradMul > 1) mul *= ch._gradMul;
    return scaledAmount(amountSpec, ch.level, ch.ad, ch.ap, ch.maxHp) * mul;
  }

  // ───────────────────────── types ─────────────────────────

  /** One projectile, or a fan of `count` across `spread` deg (one `proj` fx each, ONE shared hit set). */
  _projectile(ch, slot, spec, aim) {
    const { dx, dy } = aimDir(ch, aim.x, aim.y);
    const count = Math.max(1, Math.min(MAX_FAN_COUNT, (spec.count | 0) || 1));
    const spread = count > 1 ? ((Number(spec.spread) || 0) * Math.PI) / 180 : 0;
    const base = Math.atan2(dy, dx);
    const hit = new Set();
    const amount = this.amount(ch, spec.dmg);
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
        if (idx >= 0) this.traps.splice(idx, 1);
      }
      const dur = Math.max(1000, tr.durationMs || 25000);
      this.traps.push({
        owner: ch, ownerId: ch.id, team: ch.team, slot, x, y, r: spec.radius || 95,
        armedAt: now + Math.max(0, tr.armMs || 450), until: now + dur,
        spec, amount: this.amount(ch, spec.dmg), color: spec.color,
      });
      this.room._fx({ k: 'zone', sid: ch.id, slot, x: round(x), y: round(y), r: spec.radius || 95, ms: dur, tickMs: 1200, color: spec.color });
      return true;
    }
    const delay = Math.max(0, spec.delay || 0);
    this.room._fx({ k: 'circle', x: round(x), y: round(y), r: spec.radius, delay, color: spec.color });
    const zone = { at: now + delay, owner: ch, team: ch.team, slot, x, y, r: spec.radius, spec, amount: this.amount(ch, spec.dmg), color: spec.color };
    if (delay > 0) this.zones.push(zone);
    else this._resolveZone(zone, now);
    return true;
  }

  /** v2 persistent zone: ticks every `tickMs` for `duration` (first tick right away). */
  _zone(ch, slot, spec, aim, now) {
    const { x, y } = this._areaCenter(ch, spec, aim);
    const ms = Math.max(0, spec.duration || 0);
    const tickMs = Math.max(MIN_ZONE_TICK_MS, spec.tickMs || 500);
    const r = spec.radius || 0;
    this.areas.push({
      owner: ch, team: ch.team, slot, x, y, r, spec, tickMs, nextAt: now, until: now + ms,
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
    if (spec.behindTarget) {
      const behind = clampToMap(t.x + ux * (t.radius + CHAMP_RADIUS + 14), t.y + uy * (t.radius + CHAMP_RADIUS + 14));
      const end = nearestFree(behind.x, behind.y, CHAMP_RADIUS);
      this.room._teleport(ch, end.x, end.y);
      this.room._fx({ k: 'blink', sid: ch.id, x0: round(x0), y0: round(y0), x1: round(ch.x), y1: round(ch.y) });
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
    const clip = spec.behindTarget ? { x: end.x, y: end.y, hit: false } : clipMove(x0, y0, end.x, end.y, CHAMP_RADIUS);
    end = spec.behindTarget ? nearestFree(end.x, end.y, CHAMP_RADIUS) : { x: clip.x, y: clip.y };
    const hits = [];
    const hitR = spec.hitRadius || 0;
    if (target) {
      if (spec.behindTarget || !clip.hit || Math.hypot(target.x - end.x, target.y - end.y) <= target.radius + CHAMP_RADIUS + Math.max(hitR, 40)) hits.push(target);
    } else if (hitR > 0 && (spec.dmg || spec.stun || spec.root || spec.slow)) {
      const along = this._alongSegment(ch.team, x0, y0, end.x, end.y, hitR, false);
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
    this.room._fx({ k: 'dash', sid: ch.id, x0: round(x0), y0: round(y0), x1: round(ch.x), y1: round(ch.y), color: spec.color });
    if (hits.length) {
      const amt = spec.dmg ? this.amount(ch, spec.dmg) : 0;
      for (const h of hits) this._applyHit(ch, h, spec, amt, now, ch.x, ch.y, dx, dy);
    }
    return true;
  }

  _blink(ch, slot, spec, aim, now) {
    if (now < ch.rootedUntil) return false;
    const x0 = ch.x, y0 = ch.y;
    const { dx, dy, d } = aimDir(ch, aim.x, aim.y);
    const reach = d > 0 ? Math.min(spec.range, d) : spec.range;
    const aimed = clampToMap(x0 + dx * reach, y0 + dy * reach);
    const end = nearestFree(aimed.x, aimed.y, CHAMP_RADIUS);
    this.room._teleport(ch, end.x, end.y);
    ch.faceX = dx; ch.faceY = dy;
    if (spec.invisMs > 0) ch._stealthUntil = now + spec.invisMs;
    this.room._fx({ k: 'blink', sid: ch.id, x0: round(x0), y0: round(y0), x1: round(ch.x), y1: round(ch.y) });
    return true;
  }

  _self(ch, slot, spec, now) {
    const until = now + (spec.duration || 0);
    if (spec.shield) this.room._addShield(ch, this.amount(ch, spec.shield), until);
    if (spec.heal) this.room._heal(ch, this.amount(ch, spec.heal));
    if (spec.buff) this.room._addBuff(ch, slot, spec.buff, until);
    if (spec.spellShieldMs > 0) ch._spellShieldUntil = Math.max(ch._spellShieldUntil || 0, now + spec.spellShieldMs);
    if (spec.invisMs > 0) ch._stealthUntil = now + spec.invisMs;
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
    }
    if (heal) this.room._fx({ k: 'heal', x: round(ch.x), y: round(ch.y), r: spec.radius, color: spec.color });
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
    if (t.etype === 'champ' && (t._spellShieldUntil || 0) > now) {
      t._spellShieldUntil = 0;
      this.room._fx({ k: 'hit', id: t.id, color: 0xffffff });
      return;
    }
    const slot = spec._slot || caster._lastCastSlot || 'q';
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
      if (caster.champ === 'pixel' && slot === 'q') {
        t._pixelMarkUntil = now + 4000;
        if (augs.includes('evo_pixel_split')) {
          let n = 0;
          for (const foe of this.room.champs.values()) {
            if (n < 2 && foe.id !== t.id && !foe.dead && foe.team !== caster.team && Math.hypot(foe.x - t.x, foe.y - t.y) <= 260) {
              n++;
              this.room._dealDamage(caster, foe, dmg * 0.45, { kind: 'skill', dmgType: skillDamageType(spec) });
            }
          }
        }
      }
      if (caster.champ === 'model' && slot === 'r' && augs.includes('evo_model_nova')) {
        this.room._applyCC(t, { slow: { pct: 0.3, ms: 2500 } }, now);
        t._auditUntil = now + 2500;
      }
      if (caster.champ === 'pixel' && slot === 'r' && (t._pixelMarkUntil || 0) > now) {
        t._pixelMarkUntil = 0;
        this.room._dealDamage(caster, t, dmg * 0.25, { kind: 'skill', trueDmg: true });
      }
      if (caster.champ === 'zero' && slot === 'q') t._vulnUntil = now + 4000;
      if (caster.champ === 'zero' && slot === 'e' && (t._vulnUntil || 0) > now) {
        t._vulnUntil = 0;
        this.room._dealDamage(caster, t, dmg * 0.3, { kind: 'skill', trueDmg: true });
        caster.cd.q = Math.max(now, (caster.cd.q || 0) - 1500);
      }
      if (caster.champ === 'tester' && slot === 'r' && (t._bugUntil || 0) > now && (t._bugStacks || 0) > 0) {
        const bonus = dmg * 0.12 * t._bugStacks;
        t._bugStacks = 0;
        this.room._dealDamage(caster, t, bonus, { kind: 'skill', trueDmg: true });
      }
    }
    if (this.room._isAlive(t)) {
      this.room._applyCC(t, spec, now);
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
            if (!u.alive || u.resetting || u.team === caster.team || u.utype === 'pet' || seen.has(u.id)) continue;
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

  /** Enemies (champions + units, incl. neutral) within `half + radius` of a segment, sorted by distance along it. */
  _alongSegment(team, x0, y0, x1, y1, half, champOnly) {
    const out = [];
    const sx = x1 - x0, sy = y1 - y0;
    const len = Math.hypot(sx, sy) || 1;
    const visit = (e) => {
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
      if (c.dead || c.team === z.team) continue;
      if (Math.hypot(c.x - z.x, c.y - z.y) <= z.r + c.radius * 0.5) this._applyHit(o, c, z.spec, z.amount, now, z.x, z.y, o.faceX, o.faceY, quiet);
    }
    for (const u of this.room.units.values()) {
      if (!u.alive || u.resetting || u.team === z.team || u.utype === 'pet') continue;
      if (Math.hypot(u.x - z.x, u.y - z.y) <= z.r + u.radius * 0.5) this._applyHit(o, u, z.spec, z.amount, now, z.x, z.y, o.faceX, o.faceY, quiet);
    }
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
        if (now >= tr.until || !this.room._isAlive(tr.owner)) continue;
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

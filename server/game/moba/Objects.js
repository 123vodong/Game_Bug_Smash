// server/game/moba/Objects.js — v6 placed world objects (docs/02_CHAMPIONS_AND_SKILLS.md [v6 numbering] section 4.5):
// wall, portal, barricade, turret (+ heat), beacon, pin (+ resolve) and the Volt `objcmd`s.
// v6.1 (docs/02_CHAMPIONS_AND_SKILLS.md [v6.1 numbering]): `barrier` = a SOLID segment for everyone (push-out, dash/knock clip), `vent` donut (inner).
// Author: Duke Nguyen
//
// fx-only objects (wall, portal, beacon, pin) live only in this.list and in `fx` messages.
// Objects with HP (barricade, turret) are TeamUnit records (utype 'obj', kind 'obj'); their oid is the unit key.
// All damage / heal / CC goes through the room helpers and SkillEngine._applyHit.
import { KIT_TUNING } from '../../../shared/moba/champions.js';
import { skillDamageType } from '../../../shared/moba/champions.js';
import { CHAMP_RADIUS, clampToMap, distToSeg } from '../../../shared/moba/map.js';
import { nearestFree } from '../../../shared/moba/nav.js';
import { TeamUnit } from './schema.js';
import { UNIT_REMOVE_MS } from './tuning.js';
import { aimDir } from './SkillEngine.js';
import { resolveWalls } from './Mover.js';

const round = (v) => Math.round(v);

// Registries: object kind -> handler. v6.1 extension point: a new kind is one entry in each (placement + per-tick).
const PLACE = {
  wall: (o, ch, slot, spec, aim, now) => o._wall(ch, slot, spec, aim, now),
  portal: (o, ch, slot, spec, aim, now) => o._portalA(ch, slot, spec, aim, now),
  barricade: (o, ch, slot, spec, aim, now) => o._unitObj(ch, slot, spec, aim, now, 'barricade'),
  turret: (o, ch, slot, spec, aim, now) => o._unitObj(ch, slot, spec, aim, now, 'turret'),
  beacon: (o, ch, slot, spec, aim, now) => o._beacon(ch, slot, spec, aim, now),
  pin: (o, ch, slot, spec, aim, now) => o._pin(ch, slot, spec, aim, now),
  barrier: (o, ch, slot, spec, aim, now) => o._barrier(ch, slot, spec, aim, now),
};
const SOLID = new Set(['barricade', 'barrier']); // kinds that block movement (counted in _nBar)
const SOLID_FIT = 0.8;                            // a unit's radius counts this much against solid objects
const CLIP_STEP = 8;                              // ponytail: barrier clip samples the path every 8 px; fine for dashes <= ~1000 px
/** Closest point of segment (x0,y0)-(x1,y1) to (px,py). */
function segPoint(px, py, x0, y0, x1, y1) {
  const sx = x1 - x0, sy = y1 - y0, l2 = sx * sx + sy * sy;
  const k = l2 > 0 ? Math.max(0, Math.min(1, ((px - x0) * sx + (py - y0) * sy) / l2)) : 0;
  return { x: x0 + sx * k, y: y0 + sy * k };
}
const TICK = {
  wall: (o, ob, now) => o._tickWall(ob, now),
  portal: (o, ob, now) => o._tickPortal(ob, now),
  pin: (o, ob, now) => o._tickPin(ob, now),
  turret: (o, ob, now, dt) => o._tickTurret(ob, now, dt),
};
/** Objcmd registry: cmd name -> handler(objects, ch, slot, spec, turrets, now). */
const CMD = {
  overclock: (o, ch, slot, spec, turrets, now) => {
    const c = spec.objcmd;
    for (const t of turrets) { t.ocUntil = now + c.ms; t.oc = { atkMul: c.atkMul, heatMul: c.heatMul }; }
    if (!turrets.length && !o.room._petOf(ch)) return false;
    if (spec.duration && spec.buff) o.room._addBuff(ch, slot, spec.buff, now + spec.duration);
    o.room._fx({ k: 'buff', sid: ch.id, slot, color: spec.color });
    return true;
  },
  vent: (o, ch, slot, spec, turrets, now) => {
    if (!turrets.length) return false;
    const c = spec.objcmd, room = o.room;
    for (const t of turrets) {
      t.heat = 0;
      o._heatFx(t);
      for (const e of o._enemiesIn(ch.team, t.x, t.y, c.radius)) {
        if (c.inner > 0 && Math.hypot(e.x - t.x, e.y - t.y) < c.inner) continue; // v6.1 donut: the centre is safe
        room._applyCC(e, { slow: c.slow }, now, ch);
      }
      room._fx({ k: 'circle', sid: ch.id, slot, x: round(t.x), y: round(t.y), r: c.radius, ...(c.inner > 0 ? { inner: c.inner } : {}), delay: 0, color: spec.color });
    }
    return true;
  },
  detonate: (o, ch, slot, spec, turrets, now) => {
    if (!turrets.length) return false;
    for (const t of turrets) o._explode(t, now, 1 + (t.heat || 0) * (spec.objcmd.heatMulPerPct || 0));
    o.room.kits.feed('detonate');
    return true;
  },
};

export class Objects {
  constructor(room) {
    this.room = room;
    this.list = new Map(); // oid -> object record
    this._seq = 0;
    this._nextAt = 0;
    this._lastAt = 0;
    this._nBar = 0;
  }

  /** Match end / dispose: drop everything (obj units leave state.units too). */
  clear(silent = false) {
    for (const ob of [...this.list.values()]) this._remove(ob, false, silent, true);
    this.list.clear();
    this._nBar = 0;
  }

  // ───────────────────────── registry ─────────────────────────
  _count(pred) { let n = 0; for (const ob of this.list.values()) if (pred(ob)) n++; return n; }

  _oldest(pred) {
    let best = null;
    for (const ob of this.list.values()) if (pred(ob) && (!best || ob.born < best.born)) best = ob;
    return best;
  }

  /** Make room for a new object of `ch` / `slot` (+ optional group): per-owner cap, then the team cap. */
  _makeRoom(ch, slot, o, now) {
    const own = o.group
      ? (ob) => ob.ownerId === ch.id && ob.group === o.group
      : (ob) => ob.ownerId === ch.id && ob.slot === slot && ob.kind === o.kind;
    const cap = Math.max(1, o.maxActive || 1);
    while (this._count(own) >= cap) { const v = this._oldest(own); if (!v) break; this._remove(v, false); }
    const team = (ob) => ob.team === ch.team;
    while (this._count(team) >= KIT_TUNING.MAX_OBJECTS_PER_TEAM) { const v = this._oldest(team); if (!v) break; this._remove(v, false); }
  }

  _register(ob) {
    this.list.set(ob.oid, ob);
    if (ob.kind === 'turret') ob.owner._ntur = (ob.owner._ntur || 0) + 1;
    if (ob.kind === 'pin') ob.owner._npin = (ob.owner._npin || 0) + 1;
    if (SOLID.has(ob.kind)) this._nBar++;
    return ob;
  }

  _remove(ob, boom, silent = false, instant = false) {
    if (!this.list.delete(ob.oid)) return;
    if (ob.kind === 'turret') ob.owner._ntur = Math.max(0, (ob.owner._ntur || 0) - 1);
    if (ob.kind === 'pin') ob.owner._npin = Math.max(0, (ob.owner._npin || 0) - 1);
    if (SOLID.has(ob.kind)) this._nBar = Math.max(0, this._nBar - 1);
    if (ob.unit) {
      const u = ob.unit;
      u.alive = false; u.hp = 0;
      if (silent || instant) { this.room.units.delete(u.id); this.room.state.units.delete(u.id); }
      else { u.removeAt = Date.now() + UNIT_REMOVE_MS; this.room._syncUnit(u); }
    }
    if (!silent) this.room._fx({ k: 'objEnd', oid: ob.oid, ...(boom ? { boom: true } : {}) });
  }

  _newId() { return `ob_${++this._seq}`; }

  _base(ch, slot, kind, spec, x, y, now) {
    const o = spec.obj;
    return {
      oid: this._newId(), kind, owner: ch, ownerId: ch.id, team: ch.team, slot, x, y, r: o.r || 0, born: now,
      until: now + (o.ms || 5000), spec, obj: o, group: o.group || '', color: spec.color,
    };
  }

  /** Placement point: the caster (range 0) or the aim clamped to range (and the map); solid kinds avoid furniture. */
  _center(ch, spec, aim, solidR) {
    let x = ch.x, y = ch.y;
    if (spec.range > 0) {
      const { dx, dy, d } = aimDir(ch, aim.x, aim.y);
      const reach = d > 0 ? Math.min(spec.range, d) : Math.min(spec.range, 350);
      x = ch.x + dx * reach; y = ch.y + dy * reach;
    }
    const c = clampToMap(x, y, 30);
    return solidR ? nearestFree(c.x, c.y, solidR) : c;
  }

  // ───────────────────────── place ─────────────────────────
  place(ch, slot, spec, aim, now) {
    const h = PLACE[spec.obj.kind];
    return h ? h(this, ch, slot, spec, aim, now) : false;
  }

  _wall(ch, slot, spec, aim, now) {
    const o = spec.obj, room = this.room;
    // A: the first point, within spec.range of the caster
    let a = clampToMap(Number.isFinite(aim.x) ? aim.x : ch.x, Number.isFinite(aim.y) ? aim.y : ch.y, 0);
    let cdx = a.x - ch.x, cdy = a.y - ch.y;
    const cd = Math.hypot(cdx, cdy);
    if (cd > spec.range) { a = { x: ch.x + (cdx / cd) * spec.range, y: ch.y + (cdy / cd) * spec.range }; cdx = a.x - ch.x; cdy = a.y - ch.y; }
    let ax = a.x, ay = a.y, bx = NaN, by = NaN;
    if (Number.isFinite(aim.x2) && Number.isFinite(aim.y2)) {
      let ex = aim.x2 - ax, ey = aim.y2 - ay;
      const el = Math.hypot(ex, ey);
      if (el >= KIT_TUNING.DRAG_MIN_PX) {
        const k = Math.min(1, o.len / el);
        bx = ax + ex * k; by = ay + ey * k;
      }
    }
    if (!Number.isFinite(bx)) {
      // tap: centered on A, perpendicular to caster -> A
      let ux = cdx, uy = cdy;
      let ul = Math.hypot(ux, uy);
      if (ul < 1) { ux = ch.faceX || 1; uy = ch.faceY || 0; ul = Math.hypot(ux, uy) || 1; }
      const half = (o.len * KIT_TUNING.DRAG_DEFAULT_FRAC) / 2;
      const px = -uy / ul, py = ux / ul;
      bx = ax + px * half; by = ay + py * half;
      ax -= px * half; ay -= py * half;
    }
    const A = clampToMap(ax, ay, 0), B = clampToMap(bx, by, 0);
    this._makeRoom(ch, slot, o, now);
    const ob = this._base(ch, slot, 'wall', spec, A.x, A.y, now);
    ob.x2 = B.x; ob.y2 = B.y; ob.thick = o.thick;
    ob.amount = spec.dmg ? room.skills.amount(ch, spec.dmg, slot) : 0;
    ob.rehit = new Map();
    this._register(ob);
    room._fx({ k: 'obj', oid: ob.oid, kind: 'wall', sid: ch.id, team: ch.team, x: round(A.x), y: round(A.y), x2: round(B.x), y2: round(B.y), thick: o.thick, ms: o.ms, color: spec.color });
    return true;
  }

  /**
   * v6.1 `barrier`: a solid segment (obj.len x obj.thick) centred on the aim point (clamped to range), perpendicular to
   * the cast direction. Enemies overlapping it at placement take the spec's dmg + CC once, then every unit is pushed out.
   * ponytail: orient 'drag' is treated like 'perp' (the contract only uses perp).
   */
  _barrier(ch, slot, spec, aim, now) {
    const o = spec.obj, room = this.room;
    const { dx, dy, d } = aimDir(ch, aim.x, aim.y);
    const reach = d > 0 ? Math.min(spec.range, d) : Math.min(spec.range, 350);
    let c = clampToMap(ch.x + dx * reach, ch.y + dy * reach, 30);
    c = nearestFree(c.x, c.y, o.thick / 2 + 6);
    ch.faceX = dx; ch.faceY = dy;
    const half = o.len / 2, px = -dy, py = dx;
    const A = clampToMap(c.x - px * half, c.y - py * half, 0), B = clampToMap(c.x + px * half, c.y + py * half, 0);
    this._makeRoom(ch, slot, o, now);
    const ob = this._base(ch, slot, 'barrier', spec, A.x, A.y, now);
    ob.x2 = B.x; ob.y2 = B.y; ob.thick = o.thick;
    this._register(ob);
    room._fx({ k: 'obj', oid: ob.oid, kind: 'barrier', sid: ch.id, team: ch.team, x: round(A.x), y: round(A.y), x2: round(B.x), y2: round(B.y), thick: o.thick, ms: o.ms, color: spec.color });
    if (spec.dmg || spec.root || spec.slow || spec.stun) {
      const amount = spec.dmg ? room.skills.amount(ch, spec.dmg, slot) : 0;
      const hit = [];
      for (const e of room.champs.values()) if (!e.dead && e.team !== ch.team) hit.push(e);
      for (const u of room.units.values()) if (u.alive && !u.resetting && u.team !== ch.team && u.utype !== 'pet' && u.utype !== 'obj' && u.utype !== 'ward') hit.push(u);
      for (const e of hit) {
        if (distToSeg(e.x, e.y, A.x, A.y, B.x, B.y) > o.thick / 2 + (e.radius || CHAMP_RADIUS)) continue;
        room.skills._applyHit(ch, e, spec, amount, now, e.x, e.y, dx, dy);
      }
    }
    this._pushAll();
    return true;
  }

  _portalFilter(ch) { return ch._stance === 'allies' ? 'allies' : 'open'; }

  _portalFx(ob, ms) {
    this.room._fx({
      k: 'obj', oid: ob.oid, kind: 'portal', sid: ob.ownerId, team: ob.team, x: round(ob.x), y: round(ob.y), r: ob.r, ms,
      ...(ob.pair ? { pair: ob.pair } : {}), filter: this._portalFilter(ob.owner), color: ob.color,
    });
  }

  _portalA(ch, slot, spec, aim, now) {
    const o = spec.obj;
    for (const ob of [...this.list.values()]) if (ob.ownerId === ch.id && ob.kind === 'portal') this._remove(ob, false); // a new pair replaces the old
    const c = this._center(ch, spec, aim, o.r);
    this._makeRoom(ch, slot, { ...o, maxActive: 99 }, now);
    const ob = this._base(ch, slot, 'portal', spec, c.x, c.y, now);
    ob.pair = '';
    ob.until = now + (spec.recast?.ms || 6000); // waits for B; the pair then lives obj.ms from B's placement
    this._register(ob);
    this._portalFx(ob, spec.recast?.ms || 6000);
    this.room.kits.feed('portal', { a: ch.name });
    return true;
  }

  _unitObj(ch, slot, spec, aim, now, kind) {
    const o = spec.obj, room = this.room;
    const c = this._center(ch, spec, aim, o.r);
    this._makeRoom(ch, slot, o, now);
    const hp = Math.max(1, Math.min(65535, Math.round(room.skills.amount(ch, o.hp, slot))));
    const id = 'u' + (room._nextUnitId++);
    const s = new TeamUnit();
    const u = {
      id, etype: 'unit', utype: 'obj', team: ch.team, kind: 'obj', campId: kind, owner: ch.champ, ownerId: ch.id, s,
      x: c.x, y: c.y, radius: o.r, faceX: ch.faceX, faceY: ch.faceY, maxHp: hp, hp, alive: true, armor: 0,
      hitSeq: 0, removeAt: 0, stunnedUntil: 0, rootedUntil: 0, slowUntil: 0, slowPct: 0, nav: null, knock: null, par: 0, oid: id,
    };
    s.team = ch.team; s.kind = 'obj'; s.campId = kind; s.owner = ch.champ;
    room.units.set(id, u);
    room._syncUnit(u);
    room.state.units.set(id, s);
    const ob = this._base(ch, slot, kind, spec, c.x, c.y, now);
    ob.oid = id; ob.unit = u;
    if (kind === 'turret') {
      const h = o.heat;
      ob.heat = 0; ob.hSent = 0; ob.lastShotAt = 0; ob.nextShotAt = now + 400; ob.ocUntil = 0; ob.oc = null;
      ob.dmgAmt = room.skills.amount(ch, o.dmg, slot);
      ob.dmgType = skillDamageType({ dmg: o.dmg });
      ob.explodeAmt = room.skills.amount(ch, h.explode.dmg, slot);
    }
    this._register(ob);
    return true;
  }

  _beacon(ch, slot, spec, aim, now) {
    const o = spec.obj;
    this._makeRoom(ch, slot, o, now);
    const c = this._center(ch, spec, aim, 0);
    const ob = this._base(ch, slot, 'beacon', spec, c.x, c.y, now);
    this._register(ob);
    this.room._fx({ k: 'obj', oid: ob.oid, kind: 'beacon', sid: ch.id, team: ch.team, x: round(c.x), y: round(c.y), r: o.r, ms: o.ms, color: spec.color });
    this.room.kits.feed('beacon', { a: ch.name });
    return true;
  }

  _pin(ch, slot, spec, aim, now) {
    const o = spec.obj, room = this.room;
    const c = this._center(ch, spec, aim, 0);
    this._makeRoom(ch, slot, o, now);
    const ob = this._base(ch, slot, 'pin', spec, c.x, c.y, now);
    ob.pin = o.pin; ob.trigger = o.trigger; ob.armedAt = now + (o.armMs || 0);
    ob.amount = spec.dmg ? room.skills.amount(ch, spec.dmg, slot) : 0;
    ob.healAmt = spec.heal ? room.skills.amount(ch, spec.heal, slot) : 0;
    this._register(ob);
    room._fx({
      k: 'obj', oid: ob.oid, kind: 'pin', sid: ch.id, team: ch.team, x: round(c.x), y: round(c.y), r: o.r, ms: o.ms,
      pin: o.pin, hidden: o.hideAfterMs || 0, hiddenAfterMs: o.hideAfterMs || 0, color: spec.color,
    });
    if (ch._npin >= 5) room.kits.feed('pins', { a: ch.name });
    return true;
  }

  // ───────────────────────── recasts (portal B, beacon teleport) ─────────────────────────
  recast(ch, slot, spec, aim, now) {
    const mode = spec.recast.mode, room = this.room;
    if (mode === 'place2') {
      let A = null;
      for (const ob of this.list.values()) if (ob.ownerId === ch.id && ob.kind === 'portal' && !ob.pair) { A = ob; break; }
      if (!A) return false;
      const o = A.obj;
      const { dx, dy, d } = aimDir(ch, aim.x, aim.y);
      const reach = d > 0 ? Math.min(o.range2 || 900, d) : Math.min(o.range2 || 900, 350);
      const cc = clampToMap(ch.x + dx * reach, ch.y + dy * reach, 30);
      const c = nearestFree(cc.x, cc.y, o.r);
      this._makeRoom(ch, slot, { ...o, kind: 'portal', maxActive: 99 }, now);
      const B = this._base(ch, slot, 'portal', A.spec, c.x, c.y, now);
      B.pair = A.oid; A.pair = B.oid;
      B.until = A.until = now + o.ms;
      this._register(B);
      this._portalFx(B, o.ms);
      this._portalFx(A, o.ms);
      return true;
    }
    if (mode === 'toObj') {
      let bc = null;
      for (const ob of this.list.values()) if (ob.ownerId === ch.id && ob.kind === 'beacon') { bc = ob; break; }
      if (!bc || now < ch.rootedUntil) return false;
      const x0 = ch.x, y0 = ch.y;
      const p = nearestFree(bc.x, bc.y, CHAMP_RADIUS);
      room._teleport(ch, p.x, p.y);
      room._cancelRecall(ch);
      room._fx({ k: 'blink', sid: ch.id, slot, x0: round(x0), y0: round(y0), x1: round(ch.x), y1: round(ch.y) });
      this._remove(bc, false);
      return true;
    }
    return false;
  }

  /** Allied beacon a recalling champion of `team` would arrive at (the newest live one), or null. */
  beaconFor(team) {
    let best = null;
    for (const ob of this.list.values()) if (ob.kind === 'beacon' && ob.team === team && (!best || ob.born > best.born)) best = ob;
    return best;
  }

  onStance(ch) {
    for (const ob of this.list.values()) {
      if (ob.ownerId === ch.id && ob.kind === 'portal') this.room._fx({ k: 'objUpd', oid: ob.oid, filter: this._portalFilter(ch) });
    }
  }

  // ───────────────────────── objcmd (Volt) ─────────────────────────
  cmd(ch, slot, spec, now) {
    const h = CMD[spec.objcmd.cmd]; // registry: a new command = one entry in CMD
    if (!h) return false;
    const turrets = [];
    for (const ob of this.list.values()) if (ob.kind === 'turret' && ob.ownerId === ch.id) turrets.push(ob);
    return h(this, ch, slot, spec, turrets, now);
  }

  /** Enemy champions + non-pet units (never objs) within r (+half their radius) of a point. Returns a REUSED buffer: iterate it right away. */
  _enemiesIn(team, x, y, r) {
    const out = this._buf || (this._buf = []);
    out.length = 0;
    for (const c of this.room.champs.values()) if (!c.dead && c.team !== team && Math.hypot(c.x - x, c.y - y) <= r + c.radius * 0.5) out.push(c);
    for (const u of this.room.units.values()) {
      if (!u.alive || u.resetting || u.team === team || u.utype === 'pet' || u.utype === 'obj' || u.utype === 'ward') continue;
      if (Math.hypot(u.x - x, u.y - y) <= r + u.radius * 0.5) out.push(u);
    }
    return out;
  }

  _heatFx(t) {
    const h = Math.max(0, Math.min(10, Math.round(((t.heat || 0) / t.obj.heat.max) * 10)));
    if (h !== t.hSent) { t.hSent = h; this.room._fx({ k: 'objHeat', oid: t.oid, h }); }
  }

  _explode(t, now, mul) {
    if (!this.list.has(t.oid)) return;
    const ex = t.obj.heat.explode, room = this.room, o = t.owner;
    const spec = { dmg: ex.dmg, stun: ex.stun, color: t.color, _slot: t.slot };
    const amount = t.explodeAmt * mul;
    room._fx({ k: 'circle', sid: o.id, slot: t.slot, x: round(t.x), y: round(t.y), r: ex.radius, delay: 0, color: t.color });
    this._remove(t, true);
    for (const e of this._enemiesIn(t.team, t.x, t.y, ex.radius)) room.skills._applyHit(o, e, spec, amount, now, t.x, t.y);
  }

  // ───────────────────────── resolve (Lint R) ─────────────────────────
  resolve(ch, slot, spec, now) {
    const rs = spec.resolve, room = this.room;
    const pins = [...this.list.values()].filter((ob) => ob.kind === 'pin' && ob.ownerId === ch.id && ob.group === rs.group);
    if (!pins.length) return false;
    const hit = new Set();
    let base = 0;
    for (const p of pins) {
      const r = p.r * (rs.radiusMul || 1);
      room._fx({ k: 'pinBoom', oid: p.oid, r: round(r) });
      if (p.trigger === 'ally') this._allyPin(p, now, r);
      else {
        const amt = p.amount * (rs.dmgMul || 1);
        base = Math.max(base, amt);
        for (const e of this._enemiesIn(p.team, p.x, p.y, r)) {
          room.skills._applyHit(ch, e, p.spec, amt, now, p.x, p.y);
          if (e.etype === 'champ') hit.add(e);
        }
      }
      this._remove(p, true);
    }
    const dt = rs.detonate;
    if (dt) {
      for (const e of hit) {
        const mk = e._marks?.[dt.tag];
        if (!mk) continue;
        delete e._marks[dt.tag];
        if (mk.until > now && mk.n > 0 && !e.dead) room._dealDamage(ch, e, base * dt.pctPerStack * mk.n, { kind: 'skill', trueDmg: true });
      }
    }
    room.kits.feed('resolve');
    return true;
  }

  _allyPin(p, now, r = p.r) {
    const room = this.room, sp = p.spec;
    for (const c of room.champs.values()) {
      if (c.dead || c.team !== p.team || Math.hypot(c.x - p.x, c.y - p.y) > r + c.radius * 0.5) continue;
      if (p.healAmt) room._heal(c, p.healAmt);
      if (sp.buff) room._addBuff(c, p.slot, sp.buff, now + (sp.duration || 0));
    }
  }

  // ───────────────────────── solid objects (barricade) ─────────────────────────
  /** Push one entity out of every barricade it overlaps. */
  pushOut(e) {
    for (const ob of this.list.values()) {
      if (ob.kind === 'barrier') { this._pushOutSeg(e, ob); continue; }
      if (ob.kind !== 'barricade') continue;
      const min = ob.r + (e.radius || CHAMP_RADIUS) * 0.8;
      let dx = e.x - ob.x, dy = e.y - ob.y;
      const d = Math.hypot(dx, dy);
      if (d >= min) continue;
      if (d < 0.01) { dx = e.faceX || 1; dy = e.faceY || 0; }
      const l = Math.hypot(dx, dy) || 1;
      e.x = ob.x + (dx / l) * (min + 1);
      e.y = ob.y + (dy / l) * (min + 1);
      resolveWalls(e);
    }
  }

  /** Push `e` out of a barrier segment along the normal. */
  _pushOutSeg(e, ob) {
    const min = ob.thick / 2 + (e.radius || CHAMP_RADIUS) * SOLID_FIT;
    const p = segPoint(e.x, e.y, ob.x, ob.y, ob.x2, ob.y2);
    let nx = e.x - p.x, ny = e.y - p.y;
    const d = Math.hypot(nx, ny);
    if (d >= min) return;
    if (d < 0.01) { // exactly on the line: use the segment normal on the side the unit faces
      const sx = ob.x2 - ob.x, sy = ob.y2 - ob.y, sl = Math.hypot(sx, sy) || 1;
      nx = -sy / sl; ny = sx / sl;
      if (nx * (e.faceX || 0) + ny * (e.faceY || 0) < 0) { nx = -nx; ny = -ny; }
    }
    const l = Math.hypot(nx, ny) || 1;
    e.x = p.x + (nx / l) * (min + 1);
    e.y = p.y + (ny / l) * (min + 1);
    resolveWalls(e);
  }

  /** Is a circle `r` at (x, y) inside any solid object (barricade or barrier)? Phase dashes use it. */
  solidAt(x, y, r) {
    if (!this._nBar) return false;
    for (const ob of this.list.values()) {
      if (ob.kind === 'barricade') { if (Math.hypot(x - ob.x, y - ob.y) < ob.r + r * SOLID_FIT) return true; }
      else if (ob.kind === 'barrier' && distToSeg(x, y, ob.x, ob.y, ob.x2, ob.y2) < ob.thick / 2 + r * SOLID_FIT) return true;
    }
    return false;
  }

  _pushAll() {
    const room = this.room;
    for (const c of room.champs.values()) if (!c.dead) this.pushOut(c);
    for (const u of room.units.values()) {
      if (!u.alive || u.resetting || u.epic || u.utype === 'pet' || u.utype === 'obj' || u.utype === 'ward') continue;
      this.pushOut(u);
    }
  }

  /** Stop a straight move (x0,y0)->(x1,y1) of a circle `r` at the first barricade edge: { x, y, hit }. */
  clip(x0, y0, x1, y1, r) {
    let bestT = 2;
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (!(len > 0) || !this._nBar) return { x: x1, y: y1, hit: false };
    for (const ob of this.list.values()) {
      if (ob.kind === 'barrier') { // segment: sample the path (see CLIP_STEP)
        const half = ob.thick / 2 + r * SOLID_FIT;
        if (distToSeg(x0, y0, ob.x, ob.y, ob.x2, ob.y2) < half) continue; // started inside: pushOut sorts it out
        const n = Math.ceil(len / CLIP_STEP);
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          if (distToSeg(x0 + dx * t, y0 + dy * t, ob.x, ob.y, ob.x2, ob.y2) < half) { if (t < bestT) bestT = (i - 1) / n; break; }
        }
        continue;
      }
      if (ob.kind !== 'barricade') continue;
      const R = ob.r + r * 0.8;
      const fx = x0 - ob.x, fy = y0 - ob.y;
      if (fx * fx + fy * fy < R * R) continue; // started inside: pushOut sorts it out
      const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - R * R;
      const disc = b * b - 4 * a * c;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t >= 0 && t <= 1 && t < bestT) bestT = t;
    }
    if (bestT > 1) return { x: x1, y: y1, hit: false };
    const k = Math.max(0, bestT - 1 / len);
    return { x: x0 + dx * k, y: y0 + dy * k, hit: true };
  }

  /** A barricade unit took lethal damage (TeamRoom._onUnitDeath). */
  onUnitDeath(u, now) {
    u.alive = false; u.hp = 0; u.target = '';
    u.removeAt = now + UNIT_REMOVE_MS;
    const ob = this.list.get(u.oid);
    if (ob) this._remove(ob, true);
  }

  // ───────────────────────── per tick ─────────────────────────
  tick(now) {
    if (!this.list.size) return;
    if (this._nBar) this._pushAll();
    if (now < this._nextAt) return;
    const dt = this._lastAt ? Math.min(500, now - this._lastAt) : KIT_TUNING.OBJ_TICK_MS;
    this._lastAt = now;
    this._nextAt = now + KIT_TUNING.OBJ_TICK_MS;
    const arr = this._iter || (this._iter = []);
    arr.length = 0;
    for (const ob of this.list.values()) arr.push(ob);
    for (let i = 0; i < arr.length; i++) {
      const ob = arr[i];
      if (!this.list.has(ob.oid)) continue;
      if (now >= ob.until) { this._remove(ob, false); continue; }
      const th = TICK[ob.kind];
      if (th) th(this, ob, now, dt);
      if (this.room.state.phase !== 'playing') return;
    }
  }

  _tickWall(w, now) {
    const room = this.room, o = w.owner, half = w.thick / 2;
    const hit = (e) => {
      if (distToSeg(e.x, e.y, w.x, w.y, w.x2, w.y2) > half + (e.radius || CHAMP_RADIUS)) return;
      if ((w.rehit.get(e.id) || 0) > now) return;
      w.rehit.set(e.id, now + (w.obj.rehitMs || 700));
      room.skills._applyHit(o, e, w.spec, w.amount, now, e.x, e.y);
    };
    for (const c of room.champs.values()) if (!c.dead && c.team !== w.team) hit(c);
    for (const u of room.units.values()) {
      if (!u.alive || u.resetting || u.team === w.team || u.utype === 'pet' || u.utype === 'obj' || u.utype === 'ward') continue;
      hit(u);
    }
    if (w.rehit.size > 64) for (const [k, t] of w.rehit) if (t <= now) w.rehit.delete(k);
  }

  _tickPortal(p, now) {
    if (!p.pair) return;
    const q = this.list.get(p.pair);
    if (!q) { this._remove(p, false); return; }
    const room = this.room;
    const alliesOnly = p.owner._stance === 'allies';
    const R = p.r + KIT_TUNING.PORTAL_ENTER_PAD;
    const gap = p.obj.gapMs || 1500;
    const go = (e) => {
      if ((e._tpUntil || 0) > now) return;
      if (alliesOnly && e.team !== p.team) return;
      if (e.knock || Math.hypot(e.x - p.x, e.y - p.y) > R + (e.radius || CHAMP_RADIUS) * 0.5) return;
      let dx = e.x - p.x, dy = e.y - p.y;
      const l = Math.hypot(dx, dy);
      if (l < 0.01) { dx = e.faceX || 1; dy = e.faceY || 0; }
      const n = Math.hypot(dx, dy) || 1;
      const d = nearestFree(q.x + (dx / n) * (q.r + 30), q.y + (dy / n) * (q.r + 30), e.radius || CHAMP_RADIUS);
      const x0 = e.x, y0 = e.y;
      room._teleport(e, d.x, d.y);
      e._tpUntil = now + gap;
      if (e.etype === 'champ') { e.order = null; room._cancelRecall(e); } else if (e.utype === 'minion') room._resumePath?.(e);
      room._fx({ k: 'tp', id: e.id, x0: round(x0), y0: round(y0), x1: round(e.x), y1: round(e.y), via: p.oid });
    };
    for (const c of room.champs.values()) if (!c.dead) go(c);
    for (const u of room.units.values()) {
      if (!u.alive || u.resetting || u.epic || u.utype === 'pet' || u.utype === 'obj' || u.utype === 'ward') continue;
      go(u);
    }
  }

  _tickPin(p, now) {
    if (now < p.armedAt) return;
    const room = this.room;
    if (p.trigger === 'ally') {
      for (const c of room.champs.values()) {
        if (c.dead || c.team !== p.team || Math.hypot(c.x - p.x, c.y - p.y) > p.r + c.radius * 0.5) continue;
        this._allyPin(p, now);
        room._fx({ k: 'pinBoom', oid: p.oid, r: p.r });
        this._remove(p, true);
        return;
      }
      return;
    }
    const victims = this._enemiesIn(p.team, p.x, p.y, p.r);
    if (!victims.length) return;
    const first = victims[0];
    room._fx({ k: 'pinBoom', oid: p.oid, r: p.r });
    this._remove(p, true);
    room.skills._applyHit(p.owner, first, p.spec, p.amount, now, p.x, p.y);
  }

  _turretTarget(t) {
    const room = this.room, now = Date.now();
    const R = t.obj.range;
    let best = null, bd = R;
    for (const c of room.champs.values()) {
      if (c.dead || c.team === t.team || (c._untargetUntil || 0) > now || !room.canSee(t.team, c, now)) continue;
      const d = Math.hypot(c.x - t.x, c.y - t.y) - c.radius * 0.5;
      if (d <= bd) { bd = d; best = c; }
    }
    if (best) return best;
    bd = R;
    for (const u of room.units.values()) {
      if (!u.alive || u.resetting || u.team === t.team || (u.utype !== 'minion' && u.utype !== 'monster') || !room.canSee(t.team, u, now)) continue;
      const d = Math.hypot(u.x - t.x, u.y - t.y) - u.radius * 0.5;
      if (d <= bd) { bd = d; best = u; }
    }
    return best;
  }

  _tickTurret(t, now, dt) {
    const o = t.obj, h = o.heat, room = this.room;
    const oc = t.ocUntil > now ? t.oc : null;
    if (now >= t.nextShotAt) {
      const tgt = this._turretTarget(t);
      if (!tgt) t.nextShotAt = now + KIT_TUNING.OBJ_TICK_MS;
      else {
        t.nextShotAt = now + o.atkMs * (oc ? oc.atkMul : 1);
        t.lastShotAt = now;
        room._fx({ k: 'shot', oid: t.oid, x: round(t.x), y: round(t.y), tx: round(tgt.x), ty: round(tgt.y), color: t.color });
        room._dealDamage(t.owner, tgt, t.dmgAmt, { kind: 'spell', dmgType: t.dmgType });
        if (tgt.etype === 'champ') room._fx({ k: 'hit', id: tgt.id, color: t.color });
        t.heat += h.perShot * (oc ? oc.heatMul : 1);
        if (t.heat >= h.max) {
          t.heat = h.max;
          this._heatFx(t);
          room.kits.feed('overheat', { a: t.owner.name });
          this._explode(t, now, 1);
          return;
        }
      }
    }
    if (t.heat > 0 && now - t.lastShotAt >= h.coolDelayMs) t.heat = Math.max(0, t.heat - (h.coolPerSec * dt) / 1000);
    this._heatFx(t);
  }
}

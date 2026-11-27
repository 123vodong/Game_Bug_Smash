// server/game/moba/Rewind.js — v6 history, rewind, tether, link, shadow, summon (drone) and deliver
// (docs/02_CHAMPIONS_AND_SKILLS.md [v6 numbering] sections 4.3, 4.6, 4.7, 4.9, 4.10).
// Author: Duke Nguyen
import { KIT_TUNING } from '../../../shared/moba/champions.js';
import { CHAMP_RADIUS, clampToMap } from '../../../shared/moba/map.js';
import { clipMove, nearestFree } from '../../../shared/moba/nav.js';
import { TeamUnit } from './schema.js';
import { UNIT_REMOVE_MS } from './tuning.js';
import { aimDir } from './SkillEngine.js';

const round = (v) => Math.round(v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class Rewind {
  constructor(room) {
    this.room = room;
    this.links = new Map();   // lid -> { lid, owner, a, b, until, spec, shareAt }
    this._lid = 0;
    this._tid = 0;
    this._sampleAt = 0;
    this._droneAt = 0;
  }

  clear() {
    this.links.clear();
    for (const ch of this.room.champs.values()) { ch._tether = null; ch._link = null; ch._shadow = null; }
  }

  // ───────────────────────── history + rewind (4.6) ─────────────────────────
  /** Record { t, x, y, hp } for every living champion every HIST_SAMPLE_MS (kept HIST_KEEP_MS). */
  sample(now) {
    if (now < this._sampleAt) return;
    this._sampleAt = now + KIT_TUNING.HIST_SAMPLE_MS;
    for (const ch of this.room.champs.values()) {
      if (ch.dead) { if (ch._hist?.length) ch._hist.length = 0; continue; }
      const h = ch._hist || (ch._hist = []);
      h.push({ t: now, x: ch.x, y: ch.y, hp: ch.hp });
      while (h.length && now - h[0].t > KIT_TUNING.HIST_KEEP_MS) h.shift();
    }
  }

  /** `type:'rewind'`: caster alone (radius 0) or the caster plus living allies within `radius`. */
  rewind(ch, slot, spec, now) {
    const rw = spec.rewind, room = this.room;
    const who = [ch];
    if (rw.allies && rw.radius > 0) {
      for (const a of room.champs.values()) if (a !== ch && !a.dead && a.team === ch.team && dist(a, ch) <= rw.radius) who.push(a);
    }
    const list = [];
    for (const t of who) {
      const h = t._hist || [];
      let s = null;
      for (let i = h.length - 1; i >= 0; i--) if (h[i].t <= now - rw.lookbackMs) { s = h[i]; break; }
      if (!s) s = h[0] || { x: t.x, y: t.y, hp: t.hp };
      const x0 = t.x, y0 = t.y;
      if (rw.cleanse) {
        room.cc.cleanse(t, now); // v6.1: old list + every cleanse:true CC type (airborne / suppress stay)
      }
      if (rw.pos) {
        if ((t.suppressUntil || 0) > now) room.cc.breakOn(t, 'teleport'); // v6.1: teleporting a suppressed ally breaks the suppress
        room._teleport(t, s.x, s.y);
        t.order = null; t.atkTarget = '';
        room._cancelRecall(t);
      }
      if (rw.hp) t.hp = Math.min(t.maxHp, Math.max(t.hp, s.hp));
      if (list.length < 6) list.push({ id: t.id, x0: round(x0), y0: round(y0), x1: round(t.x), y1: round(t.y) });
    }
    room._fx({ k: 'rewind', sid: ch.id, slot, r: rw.radius || 0, list, color: spec.color });
    room.kits.feed(rw.allies ? 'rollback' : 'rewind', { a: ch.name });
    return true;
  }

  // ───────────────────────── ally resolution (3.1) ─────────────────────────
  /** Ally champion for a `targets:'ally'` cast: the sent id, else the ally nearest the aim within range. */
  resolveAlly(ch, spec, aim, allowSelf = false) {
    const room = this.room, range = (spec.range || 0) + 40;
    const ok = (a) => a && !a.dead && a.team === ch.team && (allowSelf || a !== ch) && dist(a, ch) <= range;
    if (aim.id) {
      const a = room.champs.get(aim.id);
      if (ok(a)) return a;
    }
    let best = null, bd = Infinity;
    for (const a of room.champs.values()) {
      if (!ok(a)) continue;
      const d = Math.hypot(a.x - aim.x, a.y - aim.y);
      if (d < bd && d <= (spec.range || 0)) { bd = d; best = a; }
    }
    return best;
  }

  // ───────────────────────── tether (4.3) ─────────────────────────
  tether(ch, slot, spec, aim, now) {
    const t = spec.tether;
    const ally = this.resolveAlly(ch, spec, aim);
    if (!ally) return false;
    if (ch._tether) this.endTether(ch);
    const tid = `tt_${++this._tid}`;
    ch._tether = { tid, to: ally.id, slot, until: now + t.durationMs, nextAt: now + Math.max(KIT_TUNING.TETHER_MIN_TICK_MS, t.tickMs), refreshAt: 0, spec: t };
    this.room._fx({ k: 'tether', tid, sid: ch.id, to: ally.id, ms: t.durationMs, color: spec.color });
    return true;
  }

  endTether(ch) {
    const t = ch._tether;
    if (!t) return false;
    ch._tether = null;
    this.room._fx({ k: 'tetherEnd', tid: t.tid });
    return true;
  }

  _tickTether(ch, now) {
    const t = ch._tether, room = this.room;
    const to = room.champs.get(t.to);
    if (now >= t.until || ch.dead || room.cc.stunLike(ch, now) || ch.knock || !to || to.dead || (to._stasisUntil || 0) > now
      || dist(ch, to) > t.spec.breakRange) { this.endTether(ch); return; }
    if (now >= t.refreshAt) {
      t.refreshAt = now + 150;
      room._applyCC(ch, { slow: { pct: t.spec.casterSlow || 0, ms: 200 } }, now);
      if (t.spec.allyMsPct) room._addBuff(to, 'tether', { msPct: t.spec.allyMsPct }, now + 300, true);
    }
    if (now >= t.nextAt) {
      t.nextAt += Math.max(KIT_TUNING.TETHER_MIN_TICK_MS, t.spec.tickMs);
      const amt = room.skills.amount(ch, t.spec.heal, t.slot);
      room._heal(to, amt);
      room._heal(ch, amt * (t.spec.selfPct || 0));
    }
  }

  // ───────────────────────── link (4.3) ─────────────────────────
  link(ch, slot, spec, aim, now) {
    const lk = spec.link, room = this.room;
    const a = this.resolveAlly(ch, spec, aim) || ch;
    let b = null, bd = Infinity;
    for (const c of room.champs.values()) {
      if (c === a || c.dead || c.team !== ch.team) continue;
      const d = dist(a, c);
      if (d <= lk.pairRange && d < bd) { bd = d; b = c; }
    }
    if (!b) return false;
    this.endLink(ch);
    const lid = `lk_${++this._lid}`;
    const rec = { lid, owner: ch.id, a: a.id, b: b.id, until: now + lk.ms, spec: lk, shareAt: 0 };
    this.links.set(lid, rec);
    ch._link = lid;
    const amt = room.skills.amount(ch, lk.heal, slot);
    room._heal(a, amt); room._heal(b, amt);
    room._fx({ k: 'link', lid, a: a.id, b: b.id, ms: lk.ms, color: spec.color });
    room.kits.feed('link', { a: ch.name });
    return true;
  }

  endLink(ch) {
    const lid = ch._link;
    if (!lid) return;
    ch._link = null;
    if (this.links.delete(lid)) this.room._fx({ k: 'linkEnd', lid });
  }

  /** Partner id of `id` in a live link (for the `kit:link:<id>` tag), else ''. */
  linkPartner(id) {
    if (!this.links.size) return '';
    for (const l of this.links.values()) {
      if (l.a === id) return l.b;
      if (l.b === id) return l.a;
    }
    return '';
  }

  /**
   * Damage hook (TeamRoom._dealDamage, after armor/shield, before hp loss): `sharePct` of `dmg` goes to the
   * partner as already-mitigated damage, never lethal (partner hp floor 1), never re-shared. Returns what
   * the victim still takes.
   */
  shareDamage(t, dmg, now) {
    if (!this.links.size || this._sharing) return dmg;
    for (const l of this.links.values()) {
      let pid = '';
      if (l.a === t.id) pid = l.b; else if (l.b === t.id) pid = l.a; else continue;
      const p = this.room.champs.get(pid);
      if (!p || p.dead) continue;
      const give = Math.max(0, Math.min(dmg * l.spec.sharePct, p.hp - 1));
      if (give <= 0) return dmg;
      this._sharing = true;
      p.hp -= give;
      this._sharing = false;
      if (now - l.shareAt >= 250) { // linkShare is throttled to 4 per second per link
        l.shareAt = now;
        this.room._fx({ k: 'linkShare', lid: l.lid, a: t.id, b: pid, amt: round(give) });
      }
      return dmg - give;
    }
    return dmg;
  }

  _tickLinks(now) {
    for (const l of this.links.values()) {
      const a = this.room.champs.get(l.a), b = this.room.champs.get(l.b);
      if (now >= l.until || !a || !b || a.dead || b.dead || dist(a, b) > l.spec.breakRange) {
        const o = this.room.champs.get(l.owner);
        if (o && o._link === l.lid) o._link = null;
        this.links.delete(l.lid);
        this.room._fx({ k: 'linkEnd', lid: l.lid });
      }
    }
  }

  // ───────────────────────── shadow (4.7) ─────────────────────────
  placeShadow(ch, x, y, ms, now = Date.now()) {
    ch._shadow = { x, y, until: now + ms };
    this.room._fx({ k: 'shadow', sid: ch.id, x: round(x), y: round(y), ms });
  }

  shadow(ch, slot, spec, aim, now) {
    const sh = spec.shadow, room = this.room;
    if (sh.mode === 'place') {
      const { dx, dy, d } = aimDir(ch, aim.x, aim.y);
      const reach = d > 0 ? Math.min(spec.range || 600, d) : spec.range || 600;
      const c = clampToMap(ch.x + dx * reach, ch.y + dy * reach, 0);
      const p = nearestFree(c.x, c.y, CHAMP_RADIUS);
      this.placeShadow(ch, p.x, p.y, sh.ms, now);
      return true;
    }
    // swap
    const s = ch._shadow;
    if (!s || s.until <= now || now < ch.rootedUntil) return false;
    const x0 = ch.x, y0 = ch.y, left = s.until - now;
    room._teleport(ch, s.x, s.y);
    s.x = x0; s.y = y0;
    if (spec.invisMs > 0) ch._stealthUntil = now + spec.invisMs;
    if (spec.buff) room._addBuff(ch, slot, spec.buff, now + (spec.duration || 0));
    room._fx({ k: 'blink', sid: ch.id, slot, x0: round(x0), y0: round(y0), x1: round(ch.x), y1: round(ch.y), shadow: true });
    room._fx({ k: 'shadow', sid: ch.id, x: round(x0), y: round(y0), ms: left });
    return true;
  }

  endShadow(ch) {
    if (!ch._shadow) return;
    ch._shadow = null;
    this.room._fx({ k: 'shadowEnd', sid: ch.id });
  }

  // ───────────────────────── summon: Scout Drone (4.10) ─────────────────────────
  summon(ch, slot, spec, aim, now) {
    const sm = spec.summon, room = this.room;
    this.removeDrone(ch, true);
    const { dx, dy, d } = aimDir(ch, aim.x, aim.y);
    const reach = d > 0 ? Math.min(spec.range || 800, d) : spec.range || 800;
    const tgt = clampToMap(ch.x + dx * reach, ch.y + dy * reach, 0);
    const id = 'u' + (room._nextUnitId++);
    const s = new TeamUnit();
    const u = {
      id, etype: 'unit', utype: 'pet', drone: true, team: ch.team, kind: 'pet', campId: '', owner: ch.champ, ownerId: ch.id, s,
      x: ch.x, y: ch.y, radius: 16, faceX: dx, faceY: dy, maxHp: 1, hp: 1, alive: true, armor: 0,
      tx: tgt.x, ty: tgt.y, speed: sm.speed, until: now + sm.ms, sightRadius: sm.vision, mark: sm.mark, markAt: 0, lastAt: now,
      hitSeq: 0, removeAt: 0, stunnedUntil: 0, rootedUntil: 0, slowUntil: 0, slowPct: 0, nav: null, knock: null,
    };
    s.team = ch.team; s.kind = 'pet'; s.campId = ''; s.owner = ch.champ;
    room.units.set(id, u);
    room._syncUnit(u);
    room.state.units.set(id, s);
    ch._drone = id;
    room.kits.feed('drone', { a: ch.name });
    return true;
  }

  removeDrone(ch, immediate = false) {
    const u = ch._drone && this.room.units.get(ch._drone);
    ch._drone = '';
    if (!u) return;
    u.alive = false;
    u.removeAt = Date.now() + UNIT_REMOVE_MS;
    if (immediate) { this.room.units.delete(u.id); this.room.state.units.delete(u.id); } else this.room._syncUnit(u);
  }

  _tickDrones(now) {
    const room = this.room;
    for (const ch of room.champs.values()) {
      const u = ch._drone && room.units.get(ch._drone);
      if (!u) continue;
      if (!u.alive) { ch._drone = ''; continue; }
      if (now >= u.until) { this.removeDrone(ch); continue; }
      const dt = Math.min(100, now - u.lastAt) / 1000;
      u.lastAt = now;
      const dx = u.tx - u.x, dy = u.ty - u.y, d = Math.hypot(dx, dy);
      if (d > 1) { const st = Math.min(d, u.speed * dt); u.x += (dx / d) * st; u.y += (dy / d) * st; }
      if (now >= u.markAt && u.mark) {
        u.markAt = now + 500;
        for (const e of room.champs.values()) {
          if (e.dead || e.team === u.team || dist(e, u) > u.sightRadius) continue;
          e._marks = e._marks || {};
          e._marks[u.mark.tag] = { n: 1, until: now + (u.mark.ms || 3000) };
        }
      }
    }
  }

  // ───────────────────────── deliver: Rush E (4.9) ─────────────────────────
  deliver(ch, slot, spec, aim, now) {
    const room = this.room, dv = spec.deliver;
    if (!ch._pkg) return false;
    let tgt = this.resolveAlly(ch, spec, aim);
    let struct = false;
    if (!tgt && spec.toStruct) {
      let bd = Infinity;
      for (const st of room.structs.values()) {
        if (!st.alive || st.team !== ch.team || st.kind !== 'tower' || dist(st, ch) > spec.range + 40 + st.radius) continue;
        const d = Math.hypot(st.x - aim.x, st.y - aim.y);
        if (d < bd) { bd = d; tgt = st; }
      }
      struct = !!tgt;
    }
    if (!tgt) return false;
    const x0 = ch.x, y0 = ch.y;
    const d = dist(ch, tgt) || 1;
    const ux = (tgt.x - x0) / d, uy = (tgt.y - y0) / d;
    const reach = Math.max(0, d - ((tgt.radius || 0) + CHAMP_RADIUS));
    const want = clampToMap(x0 + ux * reach, y0 + uy * reach);
    const c = clipMove(x0, y0, want.x, want.y, CHAMP_RADIUS);
    if (dist(c, tgt) - ((tgt.radius || 0) + CHAMP_RADIUS) > 140) return false; // a wall stopped the dash far from contact
    room._teleport(ch, c.x, c.y);
    ch.faceX = ux; ch.faceY = uy;
    room._cancelRecall(ch);
    const tip = room.kits.pkgTip(ch);
    const m = ch._tipMulUntil > now ? ch._tipMul : 1;
    const eff = Math.min(1, tip * m);
    const s = 0.4 + 0.6 * eff;
    if (struct) {
      tgt.hp = Math.min(tgt.maxHp, tgt.hp + dv.structHealPct * tgt.maxHp * s);
      room._syncStruct?.(tgt);
    } else {
      room._addShield(tgt, room.skills.amount(ch, dv.shield, slot) * s, now + dv.buffMs);
      room._addBuff(tgt, slot, dv.buff, now + dv.buffMs);
    }
    room._giveGold(ch, dv.goldBase + dv.goldPerTip * eff);
    ch._pkg = null;
    ch.buffs = ch.buffs.filter((b) => b.tag !== 'pkg');
    room._fx({ k: 'pkg', sid: ch.id, on: false, tip: round(tip * 100) });
    room._fx({ k: 'deliver', sid: ch.id, id: tgt.id, x0: round(x0), y0: round(y0), x1: round(ch.x), y1: round(ch.y), tip: round(tip * 100), ...(struct ? { struct: true } : {}) });
    room.kits.feed('deliver', { a: ch.name });
    return true;
  }

  // ───────────────────────── per tick ─────────────────────────
  tick(now) {
    this.sample(now);
    for (const ch of this.room.champs.values()) {
      if (ch._tether) this._tickTether(ch, now);
      if (ch._shadow && ch._shadow.until <= now) this.endShadow(ch);
    }
    if (this.links.size) this._tickLinks(now);
    this._tickDrones(now);
  }

  /** Champion died: end tether, link, shadow, history (the drone persists). */
  onDeath(ch) {
    this.endTether(ch);
    this.endLink(ch);
    this.endShadow(ch);
    ch._hist = [];
    for (const l of [...this.links.values()]) {
      if (l.a === ch.id || l.b === ch.id) {
        this.links.delete(l.lid);
        const o = this.room.champs.get(l.owner);
        if (o && o._link === l.lid) o._link = null;
        this.room._fx({ k: 'linkEnd', lid: l.lid });
      }
    }
  }
}

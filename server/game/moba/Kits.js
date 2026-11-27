// server/game/moba/Kits.js — v6 per-champion kit systems (docs/02_CHAMPIONS_AND_SKILLS.md [v6 numbering] sections 3.2, 4.1, 4.2, 4.4, 4.8, 4.9).
// Author: Duke Nguyen
//
// Resources + spend, hold scaling, stances, mix + serve, echo, timebox, reload, package pickup and the
// `kit:` tags of TeamChamp.buffs. Everything acts through the room's helpers (_fx, _addBuff, _addShield,
// _heal, _applyCC, _teleport); nothing here is synced state except the tag string.
import { KIT_TUNING, defaultStance, nextStance, resolveSkill } from '../../../shared/moba/champions.js';
import { CHAMP_RADIUS, clampToMap } from '../../../shared/moba/map.js';
import { clipMove } from '../../../shared/moba/nav.js';
import { KIT_FEED } from '../../data/kitFeed.js';

const SLOTS = ['q', 'w', 'e', 'r'];
const round = (v) => Math.round(v);
const lerp = (a, f) => a[0] + (a[1] - a[0]) * f;

export class Kits {
  constructor(room) {
    this.room = room;
    this._feedAt = new Map(); // key -> last feed ms (humor lines are throttled)
  }

  /** Humor line in the kill feed, at most one per `key` every 4 s. */
  feed(key, vars = {}) {
    const now = Date.now();
    if (now - (this._feedAt.get(key) || 0) < 4000) return;
    this._feedAt.set(key, now);
    const pool = KIT_FEED[key.split(':')[0]];
    if (!pool) return;
    const text = pool[0].replace('{a}', vars.a || '').replace('{b}', vars.b || '');
    this.room._feed?.({ text, color: '#c9a0ff' });
  }

  // ───────────────────────── lifecycle ─────────────────────────
  /** Match start / respawn: every kit field back to its default (silent, no fx). */
  reset(ch) {
    const kit = ch.def.kit || {};
    ch._stance = defaultStance(ch.def);
    ch._res = {};
    if (kit.res) ch._res[kit.res.key] = kit.res.start;
    ch._mix = null; ch._pkg = null; ch._echo = null; ch._echoQ = []; ch._tbox = null;
    ch._reload = null; ch._hold = null; ch._tipMulUntil = 0; ch._tipMul = 1;
    ch._shadow = null; ch._tether = null; ch._link = null; ch._hist = [];
    ch._tpUntil = 0;
    this.room.cc?.reset(ch); // v6.1: untarget, revive guard, suppress channel and every CC timer
  }

  /** Death: end every kit state with the right end fx (no refunds). */
  onDeath(ch) {
    const r = this.room;
    if (ch._hold) this.holdCancel(ch);
    if (ch._pkg) { r._fx({ k: 'pkg', sid: ch.id, on: false, tip: 0 }); }
    if (ch._tbox) r._fx({ k: 'timeboxEnd', sid: ch.id, refund: [] });
    if (ch._reload) r._fx({ k: 'reloadEnd', sid: ch.id, perfect: false, jam: false });
    this.reset(ch);
  }

  // ───────────────────────── resources + spend (4.2) ─────────────────────────
  /** Current whole units of resource `key`. */
  units(ch, key) { return Math.floor((ch._res?.[key] || 0) + 1e-6); }

  /**
   * Scale a spec for hold charge `o.f` (0..1) and for spent resource units. Returns
   * { spec, mul, units } or null when the spend gate fails (nothing is spent here).
   */
  prepare(ch, spec0, o = {}) {
    let spec = spec0, mul = o.mul ?? 1, units = 0;
    if (spec0.input === 'hold' && spec0.hold) {
      const h = spec0.hold, sc = h.scale || {};
      const f = Math.max(0, Math.min(1, o.f ?? h.quick ?? 0));
      spec = { ...spec };
      if (sc.dmg) mul *= lerp(sc.dmg, f);
      if (sc.range) spec.range = spec.range * lerp(sc.range, f);
      if (sc.width) spec.width = spec.width * lerp(sc.width, f);
      if (sc.radius) spec.radius = spec.radius * lerp(sc.radius, f);
      if (sc.knockback && spec.knockback) spec.knockback = { ...spec.knockback, dist: spec.knockback.dist * lerp(sc.knockback, f) };
    }
    const sp = spec0.spend;
    if (sp && ch._res && sp.res in ch._res) {
      const have = this.units(ch, sp.res);
      if (have < (sp.min || 0)) return null;
      units = Math.min(have, sp.max ?? have);
      const per = sp.per || {};
      if (units > 0) {
        if (spec === spec0) spec = { ...spec };
        if (per.dmg) mul *= 1 + per.dmg * units;
        if (per.radius && spec.radius) spec.radius = spec.radius * (1 + per.radius * units);
        if (per.radius && spec.obj?.kind === 'barrier') spec.obj = { ...spec.obj, len: spec.obj.len * (1 + per.radius * units) }; // v6.1: longer wall
        if (per.range && spec.range) spec.range = spec.range * (1 + per.range * units);
        if (per.rootMs) spec.root = { ...(spec.root || {}), ms: (spec.root?.ms || 0) + per.rootMs * units };
        if (per.stunMs) spec.stun = { ...(spec.stun || {}), ms: (spec.stun?.ms || 0) + per.stunMs * units };
        if (per.slowPct) spec.slow = { ms: 1500, ...(spec.slow || {}), pct: Math.min(0.9, (spec.slow?.pct || 0) + per.slowPct * units) };
        if (per.count) spec.count = (spec.count || 1) + per.count * units;
      }
    }
    return { spec, mul, units };
  }

  /** After a successful cast: consume spent units, per-unit shield, mix letter, Peak Hours and the echo / timebox hooks. */
  commit(ch, slot, spec0, prep, now, cdMs, aim, o = {}) {
    const room = this.room;
    const sp = spec0.spend;
    if (sp && prep.units > 0 && ch._res) {
      ch._res[sp.res] = Math.max(0, ch._res[sp.res] - prep.units);
      if (sp.per?.shield) room._addShield(ch, room.skills.amount(ch, sp.per.shield, slot) * prep.units, now + (spec0.duration || 3000));
    }
    if (o.echo) return;
    const mix = ch.def.kit?.mix;
    if (spec0.addMix && mix) {
      const m = ch._mix && ch._mix.until > now ? ch._mix : { list: [], until: 0 };
      m.list.push(spec0.addMix);
      while (m.list.length > mix.max) m.list.shift();
      m.until = now + mix.expireMs;
      ch._mix = m;
    }
    if (spec0.resetOnCast) for (const s of spec0.resetOnCast) ch.cd[s] = 0;
    if (spec0.tipMul) { ch._tipMulUntil = now + spec0.tipMul.ms; ch._tipMul = spec0.tipMul.mul; }
    // timebox: remember the cooldown length each slot started inside the box
    if (ch._tbox && now < ch._tbox.until && spec0.type !== 'timebox' && !ch._tbox.spec.exclude?.includes(slot)) ch._tbox.spent[slot] = cdMs;
    // echo: queue a free copy of the first eligible cast after arming
    if (ch._echo && now < ch._echo.until && spec0.type !== 'echo' && !ch._echo.spec.exclude?.includes(slot)) {
      const e = ch._echo.spec;
      const dx = (aim?.x ?? ch.x) - (o.ox ?? ch.x), dy = (aim?.y ?? ch.y) - (o.oy ?? ch.y);
      ch._echoQ.push({ slot, at: now + e.delayMs, dx, dy, mul: e.mulPct });
      ch._echo = null;
      this.feed('echo', { a: ch.name });
    }
  }

  // ───────────────────────── hold (3.1 / 4.4) ─────────────────────────
  holdStart(ch, slot, spec, aim, now) {
    if (ch._hold) this.holdCancel(ch);
    ch._hold = { slot, t0: now, aim, spec };
    this.room._applyCC(ch, { slow: { pct: spec.hold.moveSlow || 0, ms: 150 } }, now);
    this.room._fx({ k: 'charge', sid: ch.id, slot, minMs: spec.hold.minMs, maxMs: spec.hold.maxMs, color: spec.color });
    return true;
  }

  /** Cancel (Esc / stun / death / other cast): free. Returns true if a hold was open. */
  holdCancel(ch) {
    if (!ch._hold) return false;
    ch._hold = null;
    this.room._fx({ k: 'chargeEnd', sid: ch.id });
    return true;
  }

  /** Charge fraction at release. */
  holdFraction(h, now) {
    const { minMs, maxMs } = h.spec.hold;
    return Math.max(0, Math.min(1, (now - h.t0 - minMs) / Math.max(1, maxMs - minMs)));
  }

  // ───────────────────────── typed skills ─────────────────────────
  /** `type:'stance'` (4.1). */
  stance(ch, slot, spec, now) {
    ch._stance = nextStance(spec, ch._stance || defaultStance(ch.def));
    ch._recast = {};
    const until = now + (spec.duration || 0);
    if (spec.shield) this.room._addShield(ch, this.room.skills.amount(ch, spec.shield, slot), until);
    if (spec.buff) this.room._addBuff(ch, slot, spec.buff, until);
    this.room._fx({ k: 'stance', sid: ch.id, name: ch._stance });
    this.room.objects?.onStance(ch);
    if (ch.def.kit?.stance?.affectsSkills) this.feed(`stance:${ch.id}`, { a: ch.name, b: ch._stance });
    return true;
  }

  /** `type:'echo'` (4.8). */
  echo(ch, slot, spec, now) {
    ch._echo = { until: now + spec.echo.armMs, spec: spec.echo };
    this.room._fx({ k: 'echo', sid: ch.id, ms: spec.echo.armMs });
    return true;
  }

  /** `type:'timebox'` (4.8). */
  timebox(ch, slot, spec, now) {
    const t = spec.timebox;
    ch._tbox = { until: now + t.ms, spent: {}, spec: t };
    if (t.buff) this.room._addBuff(ch, slot, t.buff, now + t.ms);
    this.room._fx({ k: 'timebox', sid: ch.id, ms: t.ms });
    return true;
  }

  /** `type:'reload'` first press (4.8). Needs missing ammo. */
  reload(ch, slot, spec, aim, now) {
    const key = ch.def.kit?.res?.key;
    const rl = spec.reload;
    if (!key || this.units(ch, key) >= ch.def.kit.res.max) return false;
    if (ch._reload) return false;
    let dx = (aim?.x ?? ch.x) - ch.x, dy = (aim?.y ?? ch.y) - ch.y;
    const d = Math.hypot(dx, dy);
    if (d < 24) { dx = ch.faceX || 1; dy = ch.faceY || 0; } else { dx /= d; dy /= d; }
    const l = Math.hypot(dx, dy) || 1;
    const end = clampToMap(ch.x - (dx / l) * (rl.step || 0), ch.y - (dy / l) * (rl.step || 0), CHAMP_RADIUS);
    const c = clipMove(ch.x, ch.y, end.x, end.y, CHAMP_RADIUS);
    this.room._teleport(ch, c.x, c.y);
    ch._reload = {
      slot, spec: rl, lock: !!rl.lockCasts, jammed: false,
      until: now + rl.ms, fromAt: now + rl.perfect[0] * rl.ms, toAt: now + rl.perfect[1] * rl.ms,
    };
    this.room._fx({ k: 'reload', sid: ch.id, ms: rl.ms, from: round(rl.perfect[0] * rl.ms), to: round(rl.perfect[1] * rl.ms) });
    return true;
  }

  /** Second press while reloading: perfect / jam. Returns true if the press was consumed. */
  reloadPress(ch, now) {
    const r = ch._reload;
    if (!r) return false;
    if (r.jammed) return true; // further presses ignored
    if (now >= r.fromAt && now <= r.toAt) {
      const key = ch.def.kit.res.key;
      ch._res[key] = ch.def.kit.res.max;
      const pb = r.spec.perfectBonus;
      if (pb?.buff) this.room._addBuff(ch, r.slot, pb.buff, now + (pb.ms || 0));
      ch._reload = null;
      this.room._fx({ k: 'reloadEnd', sid: ch.id, perfect: true, jam: false });
      this.feed('perfect', { a: ch.name });
      return true;
    }
    r.jammed = true;
    r.until += r.spec.jamMs || 0;
    // The bar restarts without a gold window (jam sparks come from reloadEnd jam:true).
    this.room._fx({ k: 'reloadEnd', sid: ch.id, perfect: false, jam: true });
    this.room._fx({ k: 'reload', sid: ch.id, ms: round(r.until - now), from: 0, to: 0 });
    this.feed('jam', { a: ch.name });
    return true;
  }

  /** `type:'pickup'` (4.9). */
  pickup(ch, slot, spec, now) {
    if (ch._pkg) return false;
    const pk = ch.def.kit.pkg;
    ch._pkg = { since: now, dist: 0, lx: ch.x, ly: ch.y };
    const until = now + pk.maxCarryMs;
    if (spec.pickup?.speedPct) this.room._addBuff(ch, 'pkg', { msPct: spec.pickup.speedPct }, until, true);
    this.room._fx({ k: 'pkg', sid: ch.id, on: true, tip: round(this.pkgTip(ch) * 100) });
    return true;
  }

  /** Tip fraction (tipMin..1) of the carried package. */
  pkgTip(ch) {
    const pk = ch.def.kit?.pkg;
    if (!pk || !ch._pkg) return 0;
    return Math.max(pk.tipMin, Math.min(1, ch._pkg.dist / pk.tipDist));
  }

  /** `type:'serve'` (4.9): resolve the mix into one of the five outcomes and run it as an inner spec. */
  serve(ch, slot, spec, aim, now) {
    const sv = spec.serve;
    const list = ch._mix && ch._mix.until > now ? ch._mix.list : [];
    const cnt = { S: 0, M: 0, G: 0 };
    for (const l of list) cnt[l]++;
    let key = 'plain';
    if (list.length) {
      const max = Math.max(cnt.S, cnt.M, cnt.G);
      const top = ['S', 'M', 'G'].filter((l) => cnt[l] === max);
      key = top.length > 1 ? 'mocha' : ({ S: 'shot', M: 'milk', G: 'syrup' })[top[0]];
    }
    const out = sv.outcomes[key];
    const size = Math.max(0, Math.min(sv.sizeMul.length, list.length));
    const mul = size ? sv.sizeMul[size - 1] : 1;
    const inner = { ...out, mana: 0, cd: 0, _slot: slot };
    const room = this.room;
    let cx = ch.x, cy = ch.y;
    if (out.type !== 'allies') {
      const d = Math.hypot(aim.x - ch.x, aim.y - ch.y) || 1;
      const reach = Math.min(out.range || sv.range, d);
      const c = clampToMap(ch.x + ((aim.x - ch.x) / d) * reach, ch.y + ((aim.y - ch.y) / d) * reach, 0);
      cx = c.x; cy = c.y;
    }
    room._fx({ k: 'serve', sid: ch.id, mix: list.join(''), outcome: key, x: round(cx), y: round(cy), r: out.radius || 0, color: out.color, fx: out.fx });
    const prev = ch._kitMul || 1;
    ch._kitMul = prev * mul;
    try { room.skills.cast(ch, slot, inner, aim, now); } finally { ch._kitMul = prev; }
    ch._mix = null;
    this.feed('serve', { a: ch.name, b: out.name });
    return true;
  }

  // ───────────────────────── per tick ─────────────────────────
  tick(now, dt) {
    const room = this.room;
    for (const ch of room.champs.values()) {
      if (ch.dead) continue;
      const kit = ch.def.kit;
      if (kit?.res && kit.res.gainPerSec > 0) {
        const k = kit.res.key;
        ch._res[k] = Math.min(kit.res.max, (ch._res[k] || 0) + (kit.res.gainPerSec * dt) / 1000);
      }
      if (ch._mix && now >= ch._mix.until) ch._mix = null;
      if (ch._echo && now >= ch._echo.until) ch._echo = null;
      if (ch._echoQ.length) this._tickEcho(ch, now);
      if (ch._tbox && now >= ch._tbox.until) this._endTimebox(ch, now);
      if (ch._hold) this._tickHold(ch, now);
      if (ch._reload) this._tickReload(ch, now);
      if (ch._pkg) this._tickPkg(ch, now);
    }
  }

  _tickEcho(ch, now) {
    const q = ch._echoQ;
    for (let i = q.length - 1; i >= 0; i--) {
      const e = q[i];
      if (now < e.at) continue;
      q.splice(i, 1);
      if (ch.knock || this.room.cc.cantCast(ch, now)) continue; // skipped at fire time
      this.room._echoFire(ch, e, now);
    }
  }

  _endTimebox(ch, now) {
    const t = ch._tbox;
    ch._tbox = null;
    const refund = [];
    for (const [slot, len] of Object.entries(t.spent)) {
      ch.cd[slot] = Math.max(now, (ch.cd[slot] || 0) - t.spec.refundPct * len);
      refund.push(slot);
    }
    this.room._fx({ k: 'timeboxEnd', sid: ch.id, refund });
    this.feed('timebox', { a: ch.name });
  }

  _tickHold(ch, now) {
    const h = ch._hold;
    if (ch.knock || this.room.cc.cantCast(ch, now)) { this.holdCancel(ch); return; }
    if (now >= h.t0 + h.spec.hold.maxMs + KIT_TUNING.HOLD_GRACE_MS) { this.room._holdRelease(ch, now); return; }
    this.room._applyCC(ch, { slow: { pct: h.spec.hold.moveSlow || 0, ms: 150 } }, now);
  }

  _tickReload(ch, now) {
    const r = ch._reload;
    if (this.room.cc.stunLike(ch, now) || ch.knock) {
      ch._reload = null;
      this.room._fx({ k: 'reloadEnd', sid: ch.id, perfect: false, jam: false });
      return;
    }
    if (now >= r.until) {
      ch._res[ch.def.kit.res.key] = ch.def.kit.res.max;
      ch._reload = null;
      this.room._fx({ k: 'reloadEnd', sid: ch.id, perfect: false, jam: r.jammed });
    }
  }

  _tickPkg(ch, now) {
    const p = ch._pkg, pk = ch.def.kit.pkg;
    const step = Math.hypot(ch.x - p.lx, ch.y - p.ly);
    if (step <= 700) p.dist += step;
    p.lx = ch.x; p.ly = ch.y;
    if (now - p.since >= pk.maxCarryMs) {
      ch._pkg = null;
      ch.buffs = ch.buffs.filter((b) => b.tag !== 'pkg');
      this.room._fx({ k: 'pkg', sid: ch.id, on: false, tip: 0 });
      this.feed('pkgLost');
    }
  }

  // ───────────────────────── tags (3.2) ─────────────────────────
  /** `kit:` tags in the fixed order of the contract. '' when none. */
  tags(ch, now) {
    const kit = ch.def.kit;
    let out = '';
    const add = (t) => { out = out ? `${out},${t}` : t; };
    if (kit?.stance) add(`kit:stance:${ch._stance || kit.stance.default}`);
    if (kit?.res && kit.res.show) add(`kit:${kit.res.show}:${Math.min(kit.res.max, this.units(ch, kit.res.key))}`);
    if (ch._mix && ch._mix.until > now && ch._mix.list.length) add(`kit:mix:${ch._mix.list.join('')}`);
    if (ch._pkg) add(`kit:pkg:${Math.max(0, Math.min(100, Math.round((this.pkgTip(ch) * 100) / 5) * 5))}`);
    if (ch._shadow && ch._shadow.until > now) add('kit:shadow:1');
    if (ch._echo && ch._echo.until > now) add('kit:echo:1');
    if (ch._tbox && ch._tbox.until > now) add('kit:tbox:1');
    if (ch._tether) add('kit:tether:1');
    const lk = this.room.rewind?.linkPartner(ch.id);
    if (lk) add(`kit:link:${lk}`);
    if (ch._reload) add('kit:reload:1');
    if (ch._ntur > 0) add(`kit:turrets:${ch._ntur}`);
    if (ch._npin > 0) add(`kit:pins:${ch._npin}`);
    return out;
  }
}

export { resolveSkill, SLOTS };

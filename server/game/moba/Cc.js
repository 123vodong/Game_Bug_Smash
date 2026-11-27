// server/game/moba/Cc.js — v6.1 crowd control + states (docs/02_CHAMPIONS_AND_SKILLS.md [v6.1 numbering] sections 3.1 to 3.4, 5).
// Author: Duke Nguyen
//
// airborne, charm, fear, taunt, blind, disarm, suppress (Zero channel), untarget and revive guard.
// The room keeps the CC_HANDLERS table (thin wrappers around apply()) and calls into this class for locks,
// forced movement, the synced `cc:` tags, cleanse and the per-tick suppress channel.
// Server-only unit fields (no schema change): airUntil charmUntil fearUntil tauntUntil blindUntil disarmUntil
// suppressUntil _ccSrc{type:id} _untargetUntil _reviveUntil _reviveCfg _suppressing{tid,until,...}.
import { CC_TUNING, CC_TYPES, CC_PRIORITY } from '../../../shared/moba/champions.js';
import { applyHardCcDuration } from '../../../shared/moba/rules.js';
import { CHAMP_RADIUS, clampToMap } from '../../../shared/moba/map.js';
import { clipMove } from '../../../shared/moba/nav.js';
import { resolveWalls } from './Mover.js';

const round = (v) => Math.round(v);
const C = CC_TUNING;

/** CC_TYPES key -> unit field holding its end time. */
export const CC_FIELD = {
  suppress: 'suppressUntil', airborne: 'airUntil', charm: 'charmUntil', fear: 'fearUntil', taunt: 'tauntUntil',
  disarm: 'disarmUntil', blind: 'blindUntil', untarget: '_untargetUntil', revive: '_reviveUntil',
};
const FORCED = ['charm', 'fear', 'taunt']; // replace one another (latest wins)
const CLEAR_ON_REVIVE = ['airborne', 'charm', 'fear', 'taunt', 'disarm', 'blind'];
const UNTARGET_DASH_TRAVEL_MS = 250; // a dash/blink untarget window is travel + ms; the server dash is instant, so travel is this constant

export class Cc {
  constructor(room) {
    this.room = room;
  }

  // ───────────────────────── locks ─────────────────────────
  /** Cannot move, act, cast, attack, recall or use summoner spells: stun, airborne, suppress (and the Zero channel). */
  stunLike(ch, now) {
    return now < ch.stunnedUntil || now < (ch.airUntil || 0) || now < (ch.suppressUntil || 0) || !!ch._suppressing;
  }

  /** Any hard CC (what cancels a Zero channel). Silence and root alone do not. */
  hardOn(ch, now) {
    return now < ch.stunnedUntil || now < (ch.airUntil || 0) || now < (ch.charmUntil || 0) || now < (ch.fearUntil || 0)
      || now < (ch.tauntUntil || 0) || now < (ch.suppressUntil || 0) || !!ch.knock;
  }

  /** Cannot cast skills: stun-like, silence, charm, fear, taunt, or a global shot windup. */
  cantCast(ch, now) {
    return this.stunLike(ch, now) || now < (ch.silencedUntil || 0) || now < (ch.charmUntil || 0) || now < (ch.fearUntil || 0)
      || now < (ch.tauntUntil || 0) || now < (ch._castLockUntil || 0);
  }

  untargetable(e, now = Date.now()) { return (e._untargetUntil || 0) > now; }

  // ───────────────────────── application (3.2) ─────────────────────────
  /** Apply one new CC. Returns true if it landed. `src` = casting champion / object owner (may be null). */
  apply(t, type, s, now, src) {
    const room = this.room, T = CC_TYPES[type];
    if (!T || !s) return false;
    if (t.etype === 'struct' || t.utype === 'obj' || t.utype === 'pet' || t.epic || t.kind === 'obj' || t.kind === 'pet') return false;
    const champ = t.etype === 'champ';
    if (type === 'suppress' && !champ) return false; // camps and minions are immune to suppress
    if (!room._isAlive(t) || t.resetting) return false;
    if ((t._stasisUntil || 0) > now || (t._untargetUntil || 0) > now) return false;
    const x = round(t.x), y = round(t.y);
    if (champ && (t._spellShieldUntil || 0) > now) {
      t._spellShieldUntil = 0;
      room._fx({ k: 'ccBlock', id: t.id, type, why: 'shield', x, y });
      return false;
    }
    if (champ && T.hard && (t._ccImmuneUntil || 0) > now) {
      room._fx({ k: 'ccBlock', id: t.id, type, why: 'immune', x, y });
      return false;
    }
    const base = Math.max(0, Number(s.ms) || 0);
    if (!(base > 0)) return false;
    let ms = base;
    if (champ && T.hard) {
      ms = applyHardCcDuration(t, base, now);
      if (type === 'suppress') ms = Math.max(ms, base * C.SUPPRESS_MIN_FRAC);
    }
    ms = Math.round(Math.min(C.MAX_MS[type] || ms, ms));
    if (!(ms > 0)) return false;
    const until = now + ms;
    if (!champ) {
      this._applyUnit(t, type, until, src);
    } else {
      if (FORCED.includes(type)) for (const o of FORCED) if (o !== type) t[CC_FIELD[o]] = 0;
      t[CC_FIELD[type]] = Math.max(t[CC_FIELD[type]] || 0, until);
      (t._ccSrc || (t._ccSrc = {}))[type] = src ? src.id : '';
      if (T.hard || type === 'taunt') {
        room._cancelRecall(t);
        if (t._hold) room.kits.holdCancel(t);
        if (t._tether) room.rewind.endTether(t);
      }
      if (type === 'charm' || type === 'fear') { t.order = null; t.atkTarget = ''; }
      if (type === 'fear') { t._fearFrom = { x: src ? src.x : t.x - 1, y: src ? src.y : t.y }; t._fearDir = null; }
      if (type === 'taunt') t._tauntOn = true;
      if (type === 'suppress' && src && src !== t && src.etype === 'champ') {
        src._suppressing = { tid: t.id, until: t.suppressUntil, breakDist: Number(s.breakDist) || 420, cdPct: s.cancelCdPct ?? 0.5, slot: '', spec: null, amount: 0 };
        room._fx({ k: 'suppress', sid: src.id, tid: t.id, ms });
      }
    }
    room._fx({ k: 'cc', id: t.id, type, ms, sid: src ? src.id : '', x, y });
    if (champ && src && src.etype === 'champ') room.kits.feed(type, { a: src.def?.name || src.name, b: t.name });
    return true;
  }

  /** Minions and non-epic monsters: airborne/charm/fear = can't act, taunt = forced target, blind/disarm = can't attack. */
  _applyUnit(t, type, until, src) {
    if (type === 'airborne' || type === 'charm' || type === 'fear') t.stunnedUntil = Math.max(t.stunnedUntil || 0, until);
    else if (type === 'taunt') {
      if (src && this.room._isAlive(src)) { t.target = src.id; t.forcedUntil = until; }
    } else t.disarmUntil = Math.max(t.disarmUntil || 0, until);
  }

  // ───────────────────────── per champion tick ─────────────────────────
  /**
   * Charm / fear / taunt movement for a champion that is not stun-like. Returns true when the champion's turn is
   * consumed (charm, fear). Taunt only forces the attack order and returns false so the normal act code runs.
   */
  forced(ch, dt, now) {
    const room = this.room;
    if (ch._tauntOn && !(now < (ch.tauntUntil || 0))) { ch._tauntOn = false; ch.order = null; ch.atkTarget = ''; }
    if (now < (ch.charmUntil || 0)) {
      const src = this._srcOf(ch, 'charm', now);
      if (!src) { this._end(ch, 'charm', 'src_dead'); return false; }
      ch.atkTarget = '';
      const d = Math.hypot(src.x - ch.x, src.y - ch.y);
      if (d > C.CHARM_STOP_PX) room.mover.move(ch, src.x, src.y, ch.ms, dt, now);
      return true;
    }
    if (now < (ch.fearUntil || 0)) {
      this._flee(ch, dt, now);
      return true;
    }
    if (now < (ch.tauntUntil || 0)) {
      const src = this._srcOf(ch, 'taunt', now);
      if (!src || !room.canSee(ch.team, src, now)) { this._end(ch, 'taunt', 'src_dead'); return false; }
      ch.order = { type: 'attack', id: src.id };
      ch.atkTarget = src.id;
    }
    return false;
  }

  /** The live source champion of an active charm / taunt, or null (dead, gone or untargetable). */
  _srcOf(ch, type, now) {
    const id = ch._ccSrc?.[type];
    const s = id ? this.room.champs.get(id) : null;
    return s && !s.dead && !((s._untargetUntil || 0) > now) ? s : null;
  }

  _end(ch, type, why) {
    ch[CC_FIELD[type]] = 0;
    this.room._fx({ k: 'ccBreak', id: ch.id, type, why });
  }

  _flee(ch, dt, now) {
    const f = ch._fearFrom || { x: ch.x - 1, y: ch.y };
    const src = this._srcOf(ch, 'fear', now);
    const from = src ? src : f; // a dead source: flee from where it was cast
    if (src) ch._fearFrom = { x: src.x, y: src.y };
    if (!ch._fearDir || now >= ch._fearDir.at) {
      let a = Math.atan2(ch.y - from.y, ch.x - from.x);
      if (!Number.isFinite(a) || (ch.x === from.x && ch.y === from.y)) a = Math.random() * Math.PI * 2;
      a += ((Math.random() * 2 - 1) * C.FEAR_JITTER_DEG * Math.PI) / 180;
      ch._fearDir = { a, at: now + C.FEAR_REROLL_MS };
    }
    const step = (ch.ms * C.FEAR_MS_MUL * dt) / 1000;
    const ux = Math.cos(ch._fearDir.a), uy = Math.sin(ch._fearDir.a);
    const r = ch.radius || CHAMP_RADIUS;
    const want = clampToMap(ch.x + ux * step, ch.y + uy * step, Math.max(30, r));
    let c = clipMove(ch.x, ch.y, want.x, want.y, r);
    const bc = this.room.objects.clip(ch.x, ch.y, c.x, c.y, r);
    if (bc.hit) c = bc;
    const moved = Math.hypot(c.x - ch.x, c.y - ch.y);
    ch.x = c.x; ch.y = c.y; ch.nav = null;
    ch.faceX = ux; ch.faceY = uy;
    resolveWalls(ch);
    if (moved < step * 0.3) ch._fearDir.at = 0; // blocked: re-roll next tick
  }

  // ───────────────────────── cleanse (3.2) ─────────────────────────
  /** Clear stun, root, slow, silence, knock plus every CC type with cleanse:true. Airborne and suppress stay. */
  cleanse(t, now) {
    t.stunnedUntil = 0; t.rootedUntil = 0; t.slowUntil = 0; t.slowPct = 0; t.silencedUntil = 0;
    if (t.knock) { t.knock = null; this.room._knocked?.delete(t); }
    for (const type of CC_PRIORITY) {
      if (!CC_TYPES[type].cleanse || !CC_FIELD[type] || !((t[CC_FIELD[type]] || 0) > now)) continue;
      this._end(t, type, 'cleanse');
    }
  }

  // ───────────────────────── untarget / revive guard (3.5) ─────────────────────────
  /** Untargetable for `ms` (+ `extra`, e.g. dash travel). */
  grantUntarget(ch, ms, now, extra = 0, clamp = true) {
    const raw = Math.max(0, (Number(ms) || 0) + extra);
    const total = clamp ? Math.min(C.MAX_MS.untarget, raw) : raw; // revive grants its own untargetMs (1000 > MAX_MS.untarget 800): contract gap, not clamped
    if (!(total > 0)) return;
    ch._untargetUntil = Math.max(ch._untargetUntil || 0, now + total);
    this.room._fx({ k: 'untarget', id: ch.id, ms: round(total), x: round(ch.x), y: round(ch.y) });
  }

  /** untarget on a skill spec: casting types get it now, dash/blink add the travel time. */
  onCastUntarget(ch, spec, now) {
    if (!spec.untarget) return;
    this.grantUntarget(ch, spec.untarget.ms, now, spec.type === 'dash' ? UNTARGET_DASH_TRAVEL_MS : 0);
    if (spec.type === 'blink') this.room.kits.feed('untarget', { a: ch.def?.name || ch.name });
  }

  grantRevive(a, cfg, now, color) {
    if (!cfg || a.dead || a.etype !== 'champ') return;
    a._reviveUntil = now + (cfg.ms || 0);
    a._reviveCfg = { hpPct: cfg.hpPct, untargetMs: cfg.untargetMs, color };
  }

  /** A lethal hit on champion `t`: if a revive guard is armed, reboot instead. True = the unit survived. */
  tryRevive(t, now) {
    if (!((t._reviveUntil || 0) > now) || !t._reviveCfg) return false;
    const cfg = t._reviveCfg;
    t._reviveUntil = 0; t._reviveCfg = null;
    const room = this.room;
    if ((t.suppressUntil || 0) > now) this.breakOn(t, 'revive');
    for (const type of CLEAR_ON_REVIVE) {
      if ((t[CC_FIELD[type]] || 0) > now) this._end(t, type, 'revive');
    }
    t.airUntil = 0; t.suppressUntil = 0;
    t.stunnedUntil = 0; t.rootedUntil = 0; t.slowUntil = 0; t.slowPct = 0; t.silencedUntil = 0;
    if (t.knock) { t.knock = null; room._knocked?.delete(t); }
    t.hp = Math.min(t.maxHp, Math.max(1, Math.ceil(t.maxHp * (cfg.hpPct || 0.3))));
    room._fx({ k: 'revive', id: t.id, x: round(t.x), y: round(t.y), color: cfg.color || 0xfff3a0 });
    this.grantUntarget(t, cfg.untargetMs, now, 0, false);
    room.kits.feed('revive', { a: t.def?.name || t.name });
    return true;
  }

  // ───────────────────────── blind (3.1) ─────────────────────────
  /** A blinded basic attack missed: floating MISS text, throttled per attacker. */
  missFx(att, now) {
    if (now - (att._missAt || 0) < C.MISS_TEXT_THROTTLE_MS) return;
    att._missAt = now;
    this.room._fx({ k: 'miss', id: att.id, x: round(att.x), y: round(att.y) });
  }

  // ───────────────────────── suppress channel (3.4) ─────────────────────────
  /** Called by SkillEngine right after the suppress landed: remember the strike to cash in. */
  armStrike(caster, t, spec, amount, slot) {
    const s = caster._suppressing;
    if (!s || s.tid !== t.id) return false;
    s.spec = spec; s.amount = amount; s.slot = slot;
    return true;
  }

  /** End `caster`'s channel without the strike. why: cancel | revive | teleport (ccBreak reason). */
  breakSuppress(caster, why = 'cancel', noCd = false, now = Date.now()) {
    const s = caster._suppressing;
    if (!s) return false;
    caster._suppressing = null;
    const t = this.room.champs.get(s.tid);
    if (t) t.suppressUntil = 0;
    this.room._fx({ k: 'suppressEnd', tid: s.tid, why: 'cancel' });
    this.room._fx({ k: 'ccBreak', id: s.tid, type: 'suppress', why });
    if (!noCd && s.slot && caster.cd && caster.cd[s.slot] > now) {
      caster.cd[s.slot] = now + Math.round((caster.cd[s.slot] - now) * s.cdPct);
    }
    return true;
  }

  /** The suppressed champion `t` was teleported / revived: free it by cancelling its suppressor's channel. */
  breakOn(t, why, now = Date.now()) {
    const sid = t._ccSrc?.suppress;
    const caster = sid ? this.room.champs.get(sid) : null;
    if (caster && caster._suppressing && caster._suppressing.tid === t.id) return this.breakSuppress(caster, why, false, now);
    t.suppressUntil = 0;
    return false;
  }

  tick(now) {
    for (const ch of this.room.champs.values()) {
      const s = ch._suppressing;
      if (s) this._tickSuppress(ch, s, now);
    }
  }

  _tickSuppress(ch, s, now) {
    const room = this.room;
    const t = room.champs.get(s.tid);
    if (ch.dead || !t || t.dead || this.hardOn(ch, now) || (t._untargetUntil || 0) > now
      || !((t.suppressUntil || 0) > 0) || Math.hypot(t.x - ch.x, t.y - ch.y) > s.breakDist) {
      this.breakSuppress(ch, 'cancel', ch.dead, now);
      return;
    }
    if (now < s.until) return;
    ch._suppressing = null;
    t.suppressUntil = 0;
    room._fx({ k: 'suppressEnd', tid: t.id, why: 'done' });
    if (s.spec) room.skills._applyHit(ch, t, { ...s.spec, suppress: null, _strike: true }, s.amount, now, ch.x, ch.y, ch.faceX, ch.faceY);
  }

  // ───────────────────────── synced tags (3.3) ─────────────────────────
  /** `cc:<tag>` entries in CC_PRIORITY order for the champion's buffs string ('' when none). */
  tags(ch, now) {
    let out = '';
    for (const type of CC_PRIORITY) {
      const f = CC_FIELD[type];
      if ((ch[f] || 0) > now) out = out ? `${out},cc:${CC_TYPES[type].tag}` : `cc:${CC_TYPES[type].tag}`;
    }
    return out;
  }

  /** Death / respawn / match start: no stale CC, guard or channel (the target of a channel is released first). */
  reset(ch, now = Date.now()) {
    if (ch._suppressing) this.breakSuppress(ch, 'cancel', true);
    for (const type of CC_PRIORITY) ch[CC_FIELD[type]] = 0;
    ch._ccSrc = {}; ch._reviveCfg = null; ch._suppressing = null;
    ch._castLockUntil = 0; ch._tauntOn = false; ch._fearDir = null; ch._fearFrom = null; ch._missAt = 0;
  }
}

// EventDirector — the PM's world events + the Deadline boss fight.
//
// Cycle: quiet gap → random event (announced over the PA) → effects while it
// runs → end → gap. Every Nth event is the co-op Deadline boss. Between events
// the PM nags the room in chat. Event modifiers are read by the room and the
// bots through `mod(key, default)`, so the effects stay data-driven
// (server/data/events.js).
import { ARENA_W, ARENA_H, BUG_KINDS, firstObstacleAt } from './rules.js';
import { Boss } from './schema.js';
import {
  WORLD_EVENTS, FIRST_EVENT_DELAY_MS, EVENT_GAP_MS, BOSS_EVERY_N_EVENTS,
  PM_NAG_EVERY_MS, PM_NAGS, GOLDEN_BUG, DEADLINE_BOSS,
} from '../data/events.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class EventDirector {
  constructor(room) {
    this.room = room;
    const now = Date.now();
    this.active = null;            // { id, def, startedAt, endsAt }
    this.nextAt = now + FIRST_EVENT_DELAY_MS;
    this.nextNagAt = now + rand(...PM_NAG_EVERY_MS);
    this.count = 0;
    this._lastId = null;
    this._goldenId = null;
    this.boss = null;              // BossFight while the Deadline is out
  }

  // ───────── queries used by the room + bots ─────────
  mod(key, dflt) {
    // The boss truce lingers briefly after the fight so the packed raid can
    // scatter before PvP resumes (otherwise everyone ults everyone at once).
    if (key === 'truce' && Date.now() < (this._truceUntil || 0)) return true;
    const v = this.active?.def?.mods?.[key];
    return (v === undefined) ? dflt : v;
  }
  goldenBugId() { return this._goldenId; }
  /** ms since the active event started (Infinity when none). */
  activeElapsedMs() { return this.active ? Date.now() - this.active.startedAt : Infinity; }
  isGolden(bugId) { return bugId != null && bugId === this._goldenId; }
  bossEntity() { return this.boss ? this.boss.entityRef() : null; }
  bossRadius() { return DEADLINE_BOSS.radius; }
  slamThreat(x, y, now) { return this.boss ? this.boss.threatAt(x, y, now) : null; }

  /** Boss within `reach` (+ boss radius) of (x, y)? Returns { id, ent } or null. */
  bossInReach(x, y, reach) {
    const ref = this.bossEntity();
    if (!ref) return null;
    const d = Math.hypot(ref.ent.x - x, ref.ent.y - y);
    return d <= reach + DEADLINE_BOSS.radius ? ref : null;
  }
  /** Boss within `width` (+ radius) of the segment a→b (Q dash line)? */
  bossOnSegment(distFn, ax, ay, bx, by, width) {
    const ref = this.bossEntity();
    if (!ref) return null;
    return distFn(ref.ent.x, ref.ent.y, ax, ay, bx, by) <= width + DEADLINE_BOSS.radius ? ref : null;
  }
  damageBoss(sid, p, amount) {
    if (this.boss) this.boss.damage(sid, p, amount);
  }

  // ───────── lifecycle ─────────
  tick(dtMs, now) {
    const st = this.room.state;
    if (!this.active) {
      if (now >= this.nextAt && this.room.humanCount() > 0) this.start(this._pickNext());
      else if (now >= this.nextNagAt) this._nag(now);
      return;
    }
    st.eventLeftMs = Math.max(0, Math.round(this.active.endsAt - now));
    if (this.boss) this.boss.tick(dtMs, now);
    if (this.active && this.active.id === 'golden_bug') {
      const g = this._goldenId ? st.bugs.get(this._goldenId) : null;
      if (!g) this.end('gone');
    }
    if (this.active && now >= this.active.endsAt) this.end('timeout');
  }

  _pickNext() {
    this.count++;
    if (this.count % BOSS_EVERY_N_EVENTS === 0) return 'deadline_boss';
    const ids = Object.keys(WORLD_EVENTS).filter((id) => !WORLD_EVENTS[id].boss && id !== this._lastId);
    const total = ids.reduce((s, id) => s + (WORLD_EVENTS[id].weight || 1), 0);
    let r = Math.random() * total;
    for (const id of ids) { r -= (WORLD_EVENTS[id].weight || 1); if (r <= 0) return id; }
    return ids[0];
  }

  /** Start an event by id (also usable from a debug hook). */
  start(id) {
    if (!Object.hasOwn(WORLD_EVENTS, id)) return; // own keys only ('constructor' etc.)
    const def = WORLD_EVENTS[id];
    if (this.active) this.end('replaced');
    const room = this.room;
    const st = room.state;
    const now = Date.now();
    this._lastId = id;
    this.active = { id, def, startedAt: now, endsAt: now + def.durationMs };
    st.event = id;
    st.eventLeftMs = def.durationMs;
    st.eventTotalMs = def.durationMs;
    const pm = pick(def.pm);
    room.broadcast('announce', { kind: 'event', id, title: def.title, sub: def.sub, color: def.color, pm });
    room._pmSay(pm);
    room._feed({ text: def.title, color: def.color });
    room.bots.onEvent(id);

    if (id === 'prod_down') this._surgeBugs(def.surge || 12);
    if (id === 'coffee_break') this._rainPickups(def.rain || 8);
    if (id === 'golden_bug') this._spawnGolden();
    if (id === 'deadline_boss') {
      this.boss = new BossFight(room, this);
      this.boss.spawn();
    }
    console.log(`[events] start ${id}`);
  }

  /** reason: 'timeout' | 'success' | 'gone' | 'replaced' */
  end(reason) {
    if (!this.active) return;
    const room = this.room;
    const st = room.state;
    const { id, def } = this.active;
    this.active = null; // clear first so re-entrant calls are no-ops

    if (id === 'golden_bug') {
      // Any ending other than a kill removes the CEO's bug — otherwise it would
      // linger forever (it never ages out) still worth +400 XP.
      if (reason !== 'success') {
        const g = this._goldenId ? st.bugs.get(this._goldenId) : null;
        if (g) { st.bugs.delete(this._goldenId); room._forgetBug(this._goldenId); }
      }
      if (reason === 'timeout') {
        room._announce({ title: '🙄 THE CEO FIXED IT HIMSELF', sub: 'Nobody got the promotion', color: '#aab0c0' });
        room._feed({ text: `✨ ${def.end}`, color: '#aab0c0' });
      }
      this._goldenId = null;
    } else if (id === 'deadline_boss') {
      if (this.boss) {
        if (reason === 'timeout') this.boss.fail();
        this.boss.cleanup();
        this.boss = null;
      }
      this._truceUntil = Date.now() + 4000;
    } else if (reason === 'timeout' && def.end) {
      room._feed({ text: def.end, color: '#aab0c0' });
    }

    st.event = '';
    st.eventLeftMs = 0;
    st.eventTotalMs = 0;
    room.broadcast('announce', { kind: 'eventEnd', id, reason });
    const now = Date.now();
    this.nextAt = now + rand(...EVENT_GAP_MS);
    this.nextNagAt = now + rand(14000, 24000);
    console.log(`[events] end ${id} (${reason})`);
  }

  _nag(now) {
    this.nextNagAt = now + rand(...PM_NAG_EVERY_MS);
    const humans = this.room.humanPlayers();
    const name = humans.length ? pick(humans).name : 'team';
    this.room._pmSay(pick(PM_NAGS).replace('{name}', name));
  }

  // ───────── event effects ─────────
  _pointNearHuman(minR, maxR) {
    const humans = this.room.humanPlayers();
    const st = this.room.state;
    for (let i = 0; i < 10; i++) {
      let x, y;
      if (humans.length) {
        const h = pick(humans);
        const a = Math.random() * Math.PI * 2, r = rand(minR, maxR);
        x = h.x + Math.cos(a) * r; y = h.y + Math.sin(a) * r;
      } else {
        x = rand(200, ARENA_W - 200); y = rand(200, ARENA_H - 200);
      }
      x = Math.max(60, Math.min(ARENA_W - 60, x));
      y = Math.max(80, Math.min(ARENA_H - 80, y));
      if (!firstObstacleAt(st, x, y)) return { x, y };
    }
    return null;
  }

  _surgeBugs(n) {
    for (let i = 0; i < n; i++) {
      const pt = this._pointNearHuman(260, 760);
      if (pt) this.room._spawnBugAt(pt.x, pt.y);
    }
  }

  _rainPickups(n) {
    for (let i = 0; i < n; i++) {
      const pt = this._pointNearHuman(140, 820);
      if (pt) this.room._spawnPickup(pt);
    }
  }

  _spawnGolden() {
    const st = this.room.state;
    const humans = this.room.humanPlayers();
    const players = [];
    st.players.forEach((p) => players.push(p));
    const [minR, maxR] = GOLDEN_BUG.spawnFromHuman;
    let spot = null, fallback = null;
    for (let i = 0; i < 40; i++) {
      // A race a human can win: 700–1300 px from a random human, and not right
      // next to anyone else (bots outnumber humans, so measure from a human).
      const h = humans.length ? pick(humans) : null;
      let x, y;
      if (h) {
        const a = Math.random() * Math.PI * 2, r = rand(minR, maxR);
        x = h.x + Math.cos(a) * r; y = h.y + Math.sin(a) * r;
      } else {
        x = rand(300, ARENA_W - 300); y = rand(300, ARENA_H - 300);
      }
      if (x < 200 || x > ARENA_W - 200 || y < 200 || y > ARENA_H - 200) continue;
      if (firstObstacleAt(st, x, y)) continue;
      if (!fallback) fallback = { x, y };
      const crowded = players.some((p) => p !== h && Math.hypot(p.x - x, p.y - y) < GOLDEN_BUG.minDistFromOthers);
      if (!crowded) { spot = { x, y }; break; }
    }
    if (!spot) spot = fallback || { x: ARENA_W / 2, y: ARENA_H / 2 };
    this._goldenDmg = new Map(); // sid -> damage dealt to this golden bug
    this._goldenId = this.room._spawnBugAt(spot.x, spot.y, {
      kind: GOLDEN_BUG.kind, hp: GOLDEN_BUG.hp, speed: GOLDEN_BUG.speed, golden: true,
    });
  }

  /** Room reports damage dealt to the golden bug (for the "most fixing" rule). */
  noteGoldenDamage(sid, amount) {
    if (this._goldenDmg && amount > 0) this._goldenDmg.set(sid, (this._goldenDmg.get(sid) || 0) + amount);
  }

  /**
   * Called by the room when the golden bug dies. The promotion goes to whoever
   * did the MOST fixing (damage), not the last hit — playtest 2026-11-07: a
   * human did ~85% of the work and a bot stole the final hit 2 of 3 times.
   * Grants the reward itself; returns the killer's ordinary kill XP (0).
   */
  onGoldenKilled(killerSid, killerP) {
    if (!this.active || this.active.id !== 'golden_bug') return 0;
    const room = this.room;
    let winSid = killerSid, best = -1, total = 0;
    for (const [sid, d] of (this._goldenDmg || new Map())) {
      total += d;
      if (d > best && room.state.players.get(sid)) { best = d; winSid = sid; }
    }
    const winner = room.state.players.get(winSid) || killerP;
    const pct = total > 0 ? Math.round((Math.max(0, best) / total) * 100) : 100;
    const xp = GOLDEN_BUG.rewardXp;
    room._grantXP(winSid, winner, xp);
    room._announce({ title: `🏆 ${winner.name} FIXED THE CEO'S BUG!`, sub: `did ${pct}% of the fixing · +${xp} XP · instant promotion`, color: '#ffd700', big: true });
    room._feed({ text: `🏆 ${winner.name} fixed the CEO's bug (+${xp}, ${pct}% of the work)`, color: '#ffd700', a: winSid });
    room._sendTo(winSid, 'reward', { kind: 'golden', xp });
    room.bots.onGoldenEnd(winSid);
    this._goldenId = null;
    this.end('success');
    return 0;
  }
}

// ═════════════════════════ The Deadline (co-op boss) ═════════════════════════
class BossFight {
  constructor(room, director) {
    this.room = room;
    this.director = director;
    this.cfg = DEADLINE_BOSS;
    this.id = 'deadline';
    this.dmgBy = new Map();        // sid -> damage dealt
    this.slams = [];               // pending { x, y, r, at }
    this.lastHitSid = null;
    this.done = false;
  }

  entityRef() {
    const ent = this.room.state.bosses.get(this.id);
    return (ent && ent.alive) ? { id: this.id, ent } : null;
  }

  spawn() {
    const room = this.room;
    const st = room.state;
    const cfg = this.cfg;
    const n = st.players.size;
    const hp = Math.min(cfg.hpMax, cfg.hpBase + cfg.hpPerPlayer * n);
    // Arrive near the humans so the fight comes to them.
    const humans = room.humanPlayers();
    let cx = ARENA_W / 2, cy = ARENA_H / 2;
    if (humans.length) {
      cx = humans.reduce((s, p) => s + p.x, 0) / humans.length;
      cy = humans.reduce((s, p) => s + p.y, 0) / humans.length;
    }
    const a = Math.random() * Math.PI * 2;
    const x = Math.max(250, Math.min(ARENA_W - 250, cx + Math.cos(a) * 480));
    const y = Math.max(250, Math.min(ARENA_H - 250, cy + Math.sin(a) * 480));
    const b = new Boss();
    b.x = x; b.y = y; b.hp = hp; b.maxHp = hp; b.phase = 1; b.alive = true; b.kind = 'deadline';
    st.bosses.set(this.id, b);
    this.ent = b; // identity for delayed deletes (a newer fight reuses the id)
    const now = Date.now();
    this.nextSlamAt = now + cfg.firstSlamDelayMs;
    this.nextMinionAt = now + 4500;
    this.nextPizzaAt = now + 6000;
    this.retargetAt = 0;
    this.targetSid = null;
    this.nextWallCheckAt = 0;
  }

  threatAt(x, y, now) {
    for (const s of this.slams) {
      const d = Math.hypot(x - s.x, y - s.y);
      if (d <= s.r + 20) return { x: s.x, y: s.y, r: s.r, msLeft: s.at - now };
    }
    return null;
  }

  _phaseIdx(b) { return b.phase >= 2 ? 1 : 0; }

  tick(dtMs, now) {
    const st = this.room.state;
    const b = st.bosses.get(this.id);
    if (!b || !b.alive || this.done) return;
    const cfg = this.cfg;
    const pi = this._phaseIdx(b);

    // Retarget: nearest standing player within range, else the crowd's center.
    if (now >= this.retargetAt) {
      this.retargetAt = now + 1500;
      let best = null, bestD = 1700;
      st.players.forEach((p, sid) => {
        if (p.broken) return;
        const d = Math.hypot(p.x - b.x, p.y - b.y);
        if (d < bestD) { bestD = d; best = sid; }
      });
      this.targetSid = best;
    }
    const tgt = this.targetSid ? st.players.get(this.targetSid) : null;
    if (tgt) {
      const dx = tgt.x - b.x, dy = tgt.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d > 90) {
        const step = cfg.speed[pi] * (dtMs / 1000);
        b.x = Math.max(120, Math.min(ARENA_W - 120, b.x + (dx / d) * step));
        b.y = Math.max(140, Math.min(ARENA_H - 140, b.y + (dy / d) * step));
      }
    }

    // The Deadline tramples code obstacles it walks into.
    if (now >= this.nextWallCheckAt) {
      this.nextWallCheckAt = now + 300;
      const r = cfg.radius;
      const crushed = [];
      st.obstacles.forEach((ob, id) => {
        const cx = Math.max(ob.x, Math.min(b.x, ob.x + ob.w));
        const cy = Math.max(ob.y, Math.min(b.y, ob.y + ob.h));
        if (Math.hypot(b.x - cx, b.y - cy) < r) crushed.push(id);
      });
      for (const id of crushed) st.obstacles.delete(id);
    }

    // Slams: telegraph now, resolve after the windup.
    if (now >= this.nextSlamAt) {
      this.nextSlamAt = now + cfg.slamEveryMs[pi];
      const near = [];
      st.players.forEach((p) => {
        if (!p.broken && Math.hypot(p.x - b.x, p.y - b.y) < 750) near.push(p);
      });
      if (near.length) {
        const first = tgt && near.includes(tgt) ? tgt : pick(near);
        this._telegraph(first.x, first.y, now);
        if (pi === 1 && near.length >= cfg.secondSlamMinPlayers) {
          const second = pick(near.filter((p) => p !== first));
          if (second) this._telegraph(second.x, second.y, now);
        }
      }
    }
    for (let i = this.slams.length - 1; i >= 0; i--) {
      if (now >= this.slams[i].at) {
        const s = this.slams[i];
        this.slams.splice(i, 1);
        this._resolveSlam(s);
      }
    }

    // "Scope creep" minions (light kinds only — the boss is the threat)
    if (now >= this.nextMinionAt) {
      this.nextMinionAt = now + cfg.minionEveryMs[pi];
      const kinds = cfg.minionKinds[pi];
      for (let i = 0; i < cfg.minions[pi]; i++) {
        const a = Math.random() * Math.PI * 2, r = rand(90, 170);
        const def = BUG_KINDS.find((k) => k.kind === pick(kinds));
        this.room._spawnBugAt(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, def);
      }
    }

    // "The PM ordered pizza" — heal drops near the fight keep the raid going.
    if (now >= this.nextPizzaAt) {
      this.nextPizzaAt = now + cfg.pizzaEveryMs;
      for (let i = 0; i < cfg.pizzaCount; i++) {
        const a = Math.random() * Math.PI * 2, r = rand(260, 460);
        const x = Math.max(80, Math.min(ARENA_W - 80, b.x + Math.cos(a) * r));
        const y = Math.max(100, Math.min(ARENA_H - 100, b.y + Math.sin(a) * r));
        if (!firstObstacleAt(st, x, y)) this.room._spawnPickup({ x, y });
      }
    }
  }

  _telegraph(x, y, now) {
    const cfg = this.cfg;
    const s = { x, y, r: cfg.slamRadius, at: now + cfg.slamWindupMs };
    this.slams.push(s);
    this.room.broadcast('bossSlam', { x: Math.round(x), y: Math.round(y), r: s.r, ms: cfg.slamWindupMs });
  }

  _resolveSlam(s) {
    const room = this.room;
    const cfg = this.cfg;
    room.broadcast('bossSlamHit', { x: Math.round(s.x), y: Math.round(s.y), r: s.r });
    room.state.players.forEach((p, sid) => {
      if (p.broken) return;
      const dx = p.x - s.x, dy = p.y - s.y;
      const d = Math.hypot(dx, dy);
      if (d > s.r) return;
      // % of max HP → every level needs ~6 slams; a flat hit one-shot-ish'd Interns.
      const dmg = Math.max(cfg.slamDamageMin, Math.round(cfg.slamDamagePct * p.maxHealth));
      const hit = room._applyBugContactDamage(p, sid, dmg, { type: 'boss' });
      if (hit && !p.broken) {
        const k = cfg.slamKnockback / (d || 1);
        p.x = Math.max(20, Math.min(ARENA_W - 20, p.x + (d ? dx * k : cfg.slamKnockback)));
        p.y = Math.max(40, Math.min(ARENA_H - 40, p.y + (d ? dy * k : 0)));
        p._ignoreMovesUntil = Date.now() + 300; // let the knockback stick
      }
    });
  }

  damage(sid, p, amount) {
    if (this.done || amount <= 0) return;
    const b = this.room.state.bosses.get(this.id);
    if (!b || !b.alive) return;
    const dealt = Math.min(b.hp, amount);
    b.hp = Math.max(0, b.hp - amount);
    b.hit_seq = (b.hit_seq + 1) >>> 0;
    this.dmgBy.set(sid, (this.dmgBy.get(sid) || 0) + dealt);
    this.lastHitSid = sid;
    if (b.phase === 1 && b.hp <= b.maxHp * 0.5 && b.hp > 0) {
      b.phase = 2;
      this.room._announce({ title: '⚠️ PHASE 2', sub: 'The PM added more requirements! The Deadline is enraged', color: '#ff3b3b' });
      this.room._pmSay('Small change: the deadline moved up. To today. Smash harder!');
    }
    if (b.hp <= 0) this._win();
  }

  _win() {
    const room = this.room;
    const st = room.state;
    const cfg = this.cfg;
    const b = st.bosses.get(this.id);
    this.done = true;
    this.slams.length = 0;
    if (b) b.alive = false;
    const total = [...this.dmgBy.values()].reduce((s, v) => s + v, 0) || 1;
    let mvpSid = null, mvpDmg = 0;
    for (const [sid, d] of this.dmgBy) {
      const p = st.players.get(sid);
      if (!p) continue;
      const share = d / total;
      const lastHit = sid === this.lastHitSid;
      // <1% share: no pool/participation — but the killing blow always pays.
      if (share < 0.01 && !lastHit) continue;
      const xp = (share >= 0.01 ? Math.round(cfg.xpPool * share) + cfg.participationXp : 0)
        + (lastHit ? cfg.lastHitXp : 0);
      room._grantXP(sid, p, xp);
      room._sendTo(sid, 'reward', { kind: 'boss', xp, share: Math.round(share * 100) });
      if (d > mvpDmg) { mvpDmg = d; mvpSid = sid; }
    }
    const mvp = mvpSid ? st.players.get(mvpSid) : null;
    const pct = Math.round((mvpDmg / total) * 100);
    room._announce({
      title: '🚀 DEADLINE MET! SHIPPED!',
      sub: mvp ? `MVP: ${mvp.name} (${pct}% damage) · XP shared by damage dealt` : 'XP shared by damage dealt',
      color: '#7ed957', big: true,
    });
    room._feed({ text: `🚀 The Deadline was met! MVP ${mvp ? mvp.name : '—'} (${pct}%)`, color: '#7ed957', a: mvpSid });
    room._pmSay('Great job team! Anyway, the next deadline is tomorrow.');
    room.bots.onBossEnd(true);
    this._deleteLater();
    this.director.end('success');
  }

  /** Remove THIS fight's boss after the death animation — but never a newer
   *  boss that reused the id (a fight restarted within the 1.6 s window). */
  _deleteLater() {
    const st = this.room.state;
    const ent = this.ent;
    this.room.clock.setTimeout(() => {
      if (ent && st.bosses.get(this.id) === ent) st.bosses.delete(this.id);
    }, 1600);
  }

  fail() {
    if (this.done) return;
    this.done = true;
    const room = this.room;
    const st = room.state;
    const cfg = this.cfg;
    const b = st.bosses.get(this.id);
    this.slams.length = 0;
    room._announce({ title: '⏰ DEADLINE MISSED!', sub: 'Everyone is dragged into a 2-hour post-mortem', color: '#ff5252', big: true });
    room._feed({ text: '⏰ The Deadline was missed. Post-mortem at 9am.', color: '#ff5252' });
    const now = Date.now();
    st.players.forEach((p) => { if (!p.broken) p.stunnedUntil = now + cfg.failStunMs; });
    if (b) {
      for (let i = 0; i < cfg.failBugs; i++) {
        const a = (Math.PI * 2 * i) / cfg.failBugs, r = rand(80, 260);
        room._spawnBugAt(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r);
      }
      b.alive = false;
    }
    room.bots.onBossEnd(false);
  }

  cleanup() {
    this.done = true;
    this.slams.length = 0;
    if (this.ent && this.ent.alive) this.ent.alive = false;
    this._deleteLater();
  }
}

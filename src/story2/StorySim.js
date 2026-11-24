// src/story2/StorySim.js — Story Mode 2.0 world: OfflineSim (champions, skills, damage, knockback,
// zones, pets, bushes) on a story floor, with the adventure layer on top.
//
// Same interface as OfflineSim (TeamModeScene drives it): state · receive(type, msg) · update(dt) ·
// emit(type, payload) · debug(cmd, …). Extra:
//   receive('talk', { id })   talk to an NPC champion within reach (it may join the party)
//   emit('story', m)          m.k: 'say' { who, line } · 'door' { id, state } · 'join' { id, name, champ }
//                             · 'pickup' { kind, key?, amount? } · 'objective' { text, optional } · 'cleared'
//   story                     { doors, pickups, rooms, keys, smashed, allies, objective, optional, room, cleared }
//
// Teams: the party is 'blue' (you + allies + not-yet-met NPCs, which are invulnerable and idle);
// bugs and nests are 'red' units with `_story` set. No waves, towers, camps or epics.
import { OfflineSim } from '../entities/moba/OfflineSim.js';
import * as R from '../../shared/moba/rules.js';
import { CHAMPIONS } from '../../shared/moba/champions.js';
import { CHAMP_RADIUS, distToSeg } from '../../shared/moba/map.js';
import { STORY_BUGS } from './bugs.js';

const DOOR_W = 54;                 // a closed door's wall thickness
const TALK_RANGE = 320;
const PICKUP_RANGE = 85;
const LOCKIN_INSET = 140;          // you must be this far inside a room before its lock-in doors close
const KEY_DOOR_RANGE = 300;
const ALLY_FOLLOW = 300, ALLY_STOP = 170, ALLY_FIGHT = 650, ALLY_TELEPORT = 1700;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const inRect = (r, x, y, inset = 0) => x >= r[0] + inset && y >= r[1] + inset && x <= r[0] + r[2] - inset && y <= r[1] + r[3] - inset;

export class StorySim extends OfflineSim {
  constructor({ floor, world, champ, name, emit, spells = null, hat = '' }) {
    super({ champ, name, emit, lobbyMs: 0, spells, hat, world });
    this.floor = floor;
    this.state.structures.clear();                 // no towers / cores on a story floor
    const me = this.state.champions.get(this.localId);
    me.x = floor.spawn.x; me.y = floor.spawn.y;
    me.level = Math.max(1, Math.min(R.MAX_LEVEL, floor.startLevel || 1));
    me.xp = R.XP_TABLE[me.level - 1];
    this._recalc(me, true);
    me.gold = Number.isFinite(floor.startGold) ? floor.startGold : R.START_GOLD;
    this.story = {
      doors: floor.doors.map((d) => ({ ...d, state: d.kind === 'keycard' || d.kind === 'boss' ? 'locked' : 'open' })),
      pickups: floor.pickups.map((p, i) => ({ ...p, id: `pk${i}`, x: p.at.x, y: p.at.y, taken: false })),
      rooms: floor.rooms, keys: new Set(), smashed: 0, allies: [], objective: '', optional: '',
      room: '', seen: new Set(), locked: new Set(), cleared: false, startedAt: 0,
    };
    this._lockedSayAt = 0;
    for (const d of this.story.doors) if (d.state !== 'open') this._doorNav(d, true);
  }

  // ───────────────────────── client messages ─────────────────────────
  receive(type, m = {}) {
    if (type === 'talk') { if (this.state.phase === 'playing') this._talk(String(m.id || '')); return; }
    super.receive(type, m);
  }

  debug(cmd, a, b) {
    const me = this.state.champions.get(this.localId);
    if (cmd === 'clearRoom') { // harness: smash every bug + nest in a room
      for (const u of [...this.state.units.values()]) if (u.alive && u._story && u._room === a) this._kill(u, me);
      return true;
    }
    if (cmd === 'key') { this.story.keys.add(String(a || 'blue')); this._objective(); return true; }
    if (cmd === 'tpTo') { // harness: next to an NPC / a door (b = y offset, default +160) / a pickup / the exit
      let p = null;
      const c = this.state.champions.get(a), d = this.story.doors.find((x) => x.id === a), pk = this.story.pickups.find((x) => x.id === a);
      if (a === 'exit') p = { x: this.floor.exit.x, y: this.floor.exit.y };
      else if (c) p = { x: c.x, y: c.y + 140 };
      else if (d) p = { x: (d.x1 + d.x2) / 2, y: (d.y1 + d.y2) / 2 + (Number.isFinite(b) ? b : 160) };
      else if (pk) p = { x: pk.x, y: pk.y };
      if (!p) return false;
      const q = this.nav.nearestFree(p.x, p.y, CHAMP_RADIUS);
      me.x = q.x; me.y = q.y; me._order = null; me._nav = null;
      return true;
    }
    return super.debug(cmd, a, b);
  }

  // ───────────────────────── setup ─────────────────────────
  _start() {
    const st = this.state, f = this.floor;
    st.phase = 'playing'; st.startedAt = this.t; this.story.startedAt = this.t;
    f.packs.forEach((p, i) => {
      for (let k = 0; k < p.n; k++) {
        const a = (k / Math.max(1, p.n)) * Math.PI * 2, r = p.n > 1 ? 70 : 0;
        const q = this.nav.nearestFree(p.at.x + Math.cos(a) * r, p.at.y + Math.sin(a) * r, 22);
        this._addStoryUnit(p.kind, q.x, q.y, p.room, `pack${i}`);
      }
    });
    for (const n of f.nests) {
      const id = this._addStoryUnit('nest', n.at.x, n.at.y, n.room, null);
      const u = st.units.get(id); u._nest = n; u._spawnAt = 0; u._spawnIdx = 0;
    }
    for (const n of f.npcs) {
      const c = this._addChamp(n.id, 'blue', CHAMPIONS[n.champ] ? n.champ : 'ops', n.name || CHAMPIONS[n.champ]?.name || 'Coworker', true, CHAMPIONS[n.champ]?.lane);
      c.x = n.at.x; c.y = n.at.y; c._npc = true; c.invulnerable = true; c.level = st.champions.get(this.localId).level;
      c.xp = R.XP_TABLE[c.level - 1]; this._recalc(c, true);
    }
    st.champions.forEach((c) => this._spawnPet(c));
    this._say(f.script?.intro);
    this._objective();
    this.emit('announce', { title: `🏢 ${f.name}`, sub: `${f.clock} · Story Mode`, color: '#ffd23f', big: true });
  }

  _addStoryUnit(kind, x, y, room, pack) {
    const sp = STORY_BUGS[kind] || STORY_BUGS.bug_null;
    const id = this._addUnit({ x, y, team: 'red', kind, hp: sp.hp, spec: { ...sp }, home: { x, y } });
    const u = this.state.units.get(id);
    u._story = true; u._room = room || ''; u._pack = pack || '';
    return id;
  }

  // ───────────────────────── tick ─────────────────────────
  update(dtMs) {
    const now = Date.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.t) / 1000));
    this.t = now;
    const st = this.state;
    if (st.phase === 'lobby') { if (now >= st.lobbyEndsAt) this._start(); return; }
    if (st.phase !== 'playing') return;
    for (let i = this._timers.length - 1; i >= 0; i--) {
      if (this._timers[i][0] <= now) { const fn = this._timers[i][1]; this._timers.splice(i, 1); fn(); }
    }
    st.units.forEach((u) => this._unitTick(u, dt));
    st.champions.forEach((c) => this._champTick(c, dt));
    this._updateBushes();
    this._storyTick();
    if (this._atk.length) { this.emit('atk', this._atk); this._atk = []; }
  }

  _radius(e) {
    if (e && e._story) return e.kind === 'nest' ? 46 : Math.max(18, (e._spec?.size || 44) * 0.45);
    return super._radius(e);
  }

  /** Nearest party champion (not an NPC, not hidden in a bush from `team`) within `range` of `src`. */
  _partyFoe(src, range) {
    let best = null, bd = range;
    this.state.champions.forEach((c) => {
      if (c.dead || c.team === src.team || c._npc || this._hiddenFrom(c, src.team)) return;
      const d = dist(src, c);
      if (d < bd) { bd = d; best = c; }
    });
    return best;
  }

  _unitTick(u, dt) {
    if (!u._story) { super._unitTick(u, dt); return; }
    if (!u.alive) return;
    const sp = u._spec;
    if (u.kind === 'nest') { this._nestTick(u); return; }
    let target = this._ent(u._aggro);
    if (!this._alive(target) || target.team === u.team || target._npc || (sp.leash && dist(target, u._home) > sp.leash)
      || this._hiddenFrom(target, u.team)) { target = null; u._aggro = ''; }
    if (!target) {
      target = this._partyFoe(u, sp.aggro);
      if (target) {
        u._aggro = target.id;
        // the whole pack wakes up
        if (u._pack) this.state.units.forEach((o) => { if (o.alive && o._pack === u._pack && !o._aggro) o._aggro = target.id; });
      }
    }
    if (!target) {
      if (dist(u, u._home) > 30) this._moveAlong(u, u._home, sp.speed, dt, 'home');
      else u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.25 * dt);
      return;
    }
    u._tgt = target.id;
    const reach = (sp.range || 90) + this._radius(target);
    if (dist(u, target) > reach) this._moveAlong(u, target, sp.speed, dt, target.id);
    else if (this.t >= u._atkAt) {
      u._atkAt = this.t + sp.atkMs;
      this._attack(u, target, sp.dmg, (sp.range || 0) > 200);
    }
  }

  _nestTick(u) {
    const n = u._nest;
    if (!n || this.t < (u._spawnAt || 0)) return;
    const near = this._partyFoe(u, u._spec.aggro);
    if (!near) return;
    let alive = 0;
    this.state.units.forEach((o) => { if (o.alive && o._from === u.id) alive++; });
    if (alive >= n.cap) { u._spawnAt = this.t + 1000; return; }
    const kind = n.spawns[(u._spawnIdx++) % n.spawns.length];
    const a = Math.random() * Math.PI * 2;
    const q = this.nav.nearestFree(u.x + Math.cos(a) * 120, u.y + 80 + Math.sin(a) * 60, 22);
    const id = this._addStoryUnit(kind, q.x, q.y, n.room, null);
    const s = this.state.units.get(id);
    s._from = u.id; s._aggro = near.id;
    u._spawnAt = this.t + n.everyMs;
    this.emit('fx', { k: 'circle', x: Math.round(q.x), y: Math.round(q.y), r: 70, delay: 0, color: 0xb084ff });
  }

  // ───────────────────────── party ─────────────────────────
  _botThink(c) {
    if (c._npc) return;                            // waiting to be talked to
    if (this.t < c._thinkAt) return;
    c._thinkAt = this.t + 280 + Math.random() * 200;
    const me = this.state.champions.get(this.localId);
    if (!me) return;
    if (me.dead) {
      const f = this.world.fountain.blue;
      if (dist(c, f) > 220) { c._order = { type: 'move', x: f.x, y: f.y }; c.targetId = ''; }
      return;
    }
    if (dist(c, me) > ALLY_TELEPORT) { // left behind (a lock-in door, a long walk): catch up
      const q = this.nav.nearestFree(me.x - 120, me.y + 90, CHAMP_RADIUS);
      c.x = q.x; c.y = q.y; c._nav = null; c._order = null; this._placePet(c);
    }
    if (this._allyHeal(c, me)) return;
    let foe = me.targetId ? this._ent(me.targetId) : null;
    if (!this._alive(foe) || foe.team === c.team || foe.kind === 'pet' || dist(c, foe) > ALLY_FIGHT + 300) foe = null;
    if (!foe) {
      let bd = ALLY_FIGHT;
      this.state.units.forEach((u) => {
        if (!u.alive || !u._story || u.team === c.team || this._hiddenFrom(u, c.team) || dist(u, me) > 950) return;
        const d = dist(c, u);
        if (d < bd) { bd = d; foe = u; }
      });
    }
    if (foe) {
      c._order = { type: 'attack', id: foe.id }; c.targetId = foe.id;
      this._allyCast(c, foe);
      return;
    }
    const d = dist(c, me);
    if (d > ALLY_FOLLOW) {
      const i = Math.max(0, this.story.allies.indexOf(c.id));
      const bx = -(me._mvx || 0), by = -(me._mvy || 1), side = i % 2 ? 1 : -1;
      const q = this.nav.nearestFree(me.x + bx * 160 - by * 90 * side, me.y + by * 160 + bx * 90 * side, CHAMP_RADIUS);
      c._order = { type: 'move', x: q.x, y: q.y }; c.targetId = '';
    } else if (d < ALLY_STOP && c._order?.type === 'move') c._order = null;
  }

  /** Heals / shields when the party is hurt. → true when it cast one. */
  _allyHeal(c, me) {
    const def = CHAMPIONS[c.champ];
    const party = [me, c];
    for (const slot of ['w', 'e', 'r', 'q']) {
      const sk = def.skills[slot];
      if (!sk || !(sk.heal || sk.shield)) continue;
      if (slot === 'r' && c.level < R.ULT_UNLOCK_LEVEL) continue;
      if (c[`cd${slot.toUpperCase()}`] > this.t || c.mana < sk.mana) continue;
      let want = false, at = c;
      if (sk.type === 'self') want = c.hp < c.maxHp * 0.5;
      else if (sk.type === 'allies') want = party.some((p) => !p.dead && p.hp < p.maxHp * 0.55 && dist(p, c) <= (sk.radius || 0) + 30);
      else if (sk.type === 'zone') { want = party.some((p) => !p.dead && p.hp < p.maxHp * 0.45); at = me; }
      if (want) { this._cast(c, { slot, x: at.x, y: at.y }); return true; }
    }
    return false;
  }

  _allyCast(c, foe) {
    const def = CHAMPIONS[c.champ], d = dist(c, foe);
    for (const slot of ['r', 'q', 'e', 'w']) {
      const sk = def.skills[slot];
      if (!sk || (slot === 'r' && c.level < R.ULT_UNLOCK_LEVEL)) continue;
      if (c[`cd${slot.toUpperCase()}`] > this.t || c.mana < sk.mana || Math.random() < 0.4) continue;
      let ok = false;
      switch (sk.type) {
        case 'projectile': ok = !!sk.dmg && d <= sk.range * 0.9; break;
        case 'circle': case 'zone': ok = !!(sk.dmg || sk.stun || sk.slow) && (sk.range ? d <= sk.range + sk.radius * 0.3 : d <= sk.radius * 0.8); break;
        case 'target': ok = d <= sk.range + 40; break;
        case 'dash': ok = !!(sk.dmg || sk.stun) && d <= sk.range && d > 150; break;
        case 'self': ok = !!(sk.buff?.as || sk.buff?.adPct || sk.buff?.apPct || sk.buff?.petPct) && d <= c.range + 200; break;
        case 'allies': ok = !!(sk.buff?.as || sk.buff?.msPct) && !sk.heal && d <= c.range + 300; break;
        default: ok = false;
      }
      if (ok) { this._cast(c, { slot, x: foe.x, y: foe.y, id: foe.id }); return; }
    }
  }

  _talk(id) {
    const st = this.state, me = st.champions.get(this.localId), c = st.champions.get(id);
    if (!c || !c._npc || c._talking || !me || me.dead || dist(me, c) > TALK_RANGE) return false;
    const npc = this.floor.npcs.find((n) => n.id === id);
    if (!npc) return false;
    c._talking = true;
    this._say(npc.script);
    // join once the lines have been read (the dialogue box types ~22 ms / char, then holds 2.3 s)
    const ms = Math.max(800, (npc.script || []).reduce((t, l) => t + String(l.line || '').length * 24 + 2500, 0));
    this._timers.push([this.t + ms, () => {
      c._talking = false;
      if (!npc.joins) return;
      c._npc = false; c.invulnerable = false; c._joined = true;
      this.story.allies.push(c.id);
      this.emit('story', { k: 'join', id: c.id, name: c.name, champ: c.champ });
      this.emit('announce', { title: `🤝 ${c.name} joined your party`, sub: 'Allies follow you and fight with their full kit', color: '#7ed957' });
      this._objective();
    }]);
    return true;
  }

  // ───────────────────────── kills ─────────────────────────
  _kill(target, src) {
    if (target.champ) {
      const was = target.dead;
      super._kill(target, src);
      if (!was && target.dead) {
        target.respawnAt = this.t + (target.id === this.localId ? 4000 : 7000);
        if (target.id === this.localId) this._say([{ who: 'duck', line: 'Ouch! Back to the break room. Your allies will regroup there.' }]);
      }
      return;
    }
    const wasAlive = target.alive;
    super._kill(target, src);
    if (!wasAlive || target.alive || !target._story) return;
    this.story.smashed++;
    const me = this.state.champions.get(this.localId);
    const killer = src?.champ ? src : null;
    // gold from an ally's kill goes to you (allies don't shop)
    if (killer && killer.id !== this.localId && killer.team === 'blue' && me) me.gold += target._spec?.gold || 0;
    if (target.kind === 'nest' && target._nest) {
      const n = target._nest;
      this.emit('announce', { title: '💥 BUG NEST DESTROYED', color: '#b084ff', big: true });
      // its spawn stops; leftover spawns keep fighting
      if (n.drops) {
        this.story.pickups.push({ ...n.drops, id: `pk${this.story.pickups.length}`, x: target.x, y: target.y + 40, taken: false });
        this._say(this.floor.script?.nestDown);
      }
    }
    this._objective();
  }

  // ───────────────────────── adventure layer ─────────────────────────
  _roomAt(x, y, inset = 0) {
    for (const r of this.story.rooms) if (inRect(r.rect, x, y, inset)) return r;
    return null;
  }

  _roomAlive(roomId) {
    for (const u of this.state.units.values()) if (u.alive && u._story && u._room === roomId) return true;
    return false;
  }

  /** A door's wall in the nav (closed) or not (open); closing pushes anyone standing in it out. */
  _doorNav(d, closed) {
    if (d.kind === 'auto') return;
    if (closed) {
      this.nav.setDynamic(d.id, { kind: 'seg', x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, w: DOOR_W });
      const push = (e, r) => {
        if (distToSeg(e.x, e.y, d.x1, d.y1, d.x2, d.y2) > DOOR_W / 2 + r + 4) return;
        const q = this.nav.pushOut(e.x, e.y, r); e.x = q.x; e.y = q.y; e._nav = null;
      };
      this.state.champions.forEach((c) => push(c, CHAMP_RADIUS));
      this.state.units.forEach((u) => push(u, 22));
    } else this.nav.setDynamic(d.id, null);
  }

  _setDoor(d, state) {
    if (d.state === state) return;
    d.state = state;
    this._doorNav(d, state !== 'open');
    this.emit('story', { k: 'door', id: d.id, state });
  }

  _storyTick() {
    const st = this.state, s = this.story, me = st.champions.get(this.localId);
    if (!me || s.cleared) return;
    // where you are: first visits say their lines; lock-in rooms close behind you
    const room = me.dead ? null : this._roomAt(me.x, me.y);
    if (room && room.id !== s.room) {
      s.room = room.id;
      if (!s.seen.has(room.id)) { s.seen.add(room.id); this._say(this.floor.script?.rooms?.[room.id], 12000); }
    }
    const deep = me.dead ? null : this._roomAt(me.x, me.y, LOCKIN_INSET);
    if (deep && !s.locked.has(deep.id) && this._roomAlive(deep.id)) {
      const doors = s.doors.filter((d) => d.kind === 'lockin' && d.room === deep.id && d.state === 'open');
      if (doors.length) {
        s.locked.add(deep.id);
        // bring the party in with you
        for (const id of s.allies) {
          const c = st.champions.get(id);
          if (c && !c.dead && dist(c, me) < 1600 && this._roomAt(c.x, c.y, 40)?.id !== deep.id) {
            const q = this.nav.nearestFree(me.x - 110, me.y + 80, CHAMP_RADIUS); c.x = q.x; c.y = q.y; c._nav = null; c._order = null; this._placePet(c);
          }
        }
        for (const d of doors) this._setDoor(d, 'closed');
        this.emit('announce', { title: '🔒 LOCKED IN', sub: 'Clear the room to open the doors', color: '#ff8a8a' });
      }
    }
    for (const id of [...s.locked]) {
      if (this._roomAlive(id)) continue;
      s.locked.delete(id);
      for (const d of s.doors) if (d.kind === 'lockin' && d.room === id) this._setDoor(d, 'open');
      this.emit('announce', { title: '🔓 ROOM CLEARED', sub: 'The doors are open', color: '#7ed957' });
      this._objective();
    }
    // keycard doors open when the party has the key and you walk up to them
    for (const d of s.doors) {
      if (d.kind !== 'keycard' || d.state === 'open' || me.dead) continue;
      const near = distToSeg(me.x, me.y, d.x1, d.y1, d.x2, d.y2) <= KEY_DOOR_RANGE;
      if (!near) continue;
      if (s.keys.has(d.key)) { this._setDoor(d, 'open'); this._say(this.floor.script?.doorOpen); this._objective(); }
      else if (this.t >= this._lockedSayAt) { this._lockedSayAt = this.t + 9000; this._say(this.floor.script?.locked); }
    }
    // pickups
    for (const p of s.pickups) {
      if (p.taken || me.dead || Math.hypot(me.x - p.x, me.y - p.y) > PICKUP_RANGE) continue;
      p.taken = true;
      this._pickup(me, p);
    }
    // the stairs up
    const ex = this.floor.exit;
    if (ex && !me.dead && Math.hypot(me.x - ex.x, me.y - ex.y) <= ex.r) this._clearFloor();
  }

  _pickup(me, p) {
    if (p.kind === 'coffee') {
      me.hp = Math.min(me.maxHp, me.hp + me.maxHp * 0.3); me.mana = Math.min(me.maxMana, me.mana + me.maxMana * 0.3);
      me._coffeeUntil = this.t + 3000;
    } else if (p.kind === 'gold') {
      me.gold += p.amount || 50;
      this.emit('gold', { n: p.amount || 50, x: Math.round(p.x), y: Math.round(p.y) });
    } else if (p.kind === 'keycard') {
      this.story.keys.add(p.key || 'blue');
      this.emit('announce', { title: `🔑 ${String(p.key || 'blue').toUpperCase()} KEYCARD`, sub: 'Opens the matching door', color: '#39c2ff' });
      this._say(this.floor.script?.keycard);
    } else if (p.kind === 'note' && p.text) {
      this._say([{ who: 'note', line: p.text }]);
    }
    this.emit('story', { k: 'pickup', id: p.id, kind: p.kind, key: p.key, amount: p.amount });
    this._objective();
  }

  _clearFloor() {
    const st = this.state, s = this.story;
    s.cleared = true;
    this._say(this.floor.script?.cleared);
    this.emit('story', { k: 'cleared', smashed: s.smashed, ms: this.t - s.startedAt, allies: s.allies.length });
    st.phase = 'ended'; st.winner = 'blue';
  }

  /** Recompute the tracker line (main objective + optional one); emits on change. */
  _objective() {
    const s = this.story, st = this.state;
    let text = '🪜 Take the stairs up';
    for (const d of s.doors) {
      if (d.kind !== 'keycard' || d.state === 'open') continue;
      const key = d.key || 'blue', K = key.toUpperCase();
      if (s.keys.has(key)) { text = `🚪 Open the door with the ${K} keycard`; break; }
      const nest = [...st.units.values()].find((u) => u.alive && u.kind === 'nest' && u._nest?.drops?.key === key);
      const drop = s.pickups.find((p) => !p.taken && p.kind === 'keycard' && p.key === key);
      const room = nest && s.rooms.find((r) => r.id === nest._room);
      text = nest ? `🐞 Destroy the bug nest in the ${room?.name || 'nest room'}` : drop ? `🔑 Pick up the ${K} keycard` : `🔑 Find the ${K} keycard`;
      break;
    }
    const npc = [...st.champions.values()].find((c) => c._npc);
    const nroom = npc && this._roomAt(npc.x, npc.y);
    const optional = npc ? `💬 Optional: talk to ${npc.name}${nroom ? ` (${nroom.name})` : ''}` : '';
    if (text !== s.objective || optional !== s.optional) {
      s.objective = text; s.optional = optional;
      this.emit('story', { k: 'objective', text, optional });
    }
  }

  /** ttl (ms): a line still queued that long after it was said is skipped (room-entry lines). */
  _say(lines, ttl = 0) {
    for (const l of lines || []) this.emit('story', { k: 'say', who: l.who, line: l.line, ttl });
  }
}

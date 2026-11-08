// OfflineSim — a TeamState-shaped world + a tiny local simulation so
// TeamModeScene runs with no server (`?scene=team&offline=1`, or the "play
// offline" button when the Team server is unreachable). It is NOT the real rules
// engine (that's server/game/moba/*) — just enough lanes, waves, towers, camps,
// bots, casts and messages to exercise every view, HUD and VFX path.
//
// Interface used by the scene:
//   state                          (phase, champions/units/structures as Maps, …)
//   receive(type, msg)             client → "server" messages (order, cast, buy, …)
//   update(dtMs)                   advance the world; emits via emit(type, payload)
//   debug(cmd, ...args)            harness helpers: level/gold/tp/kill/end/fight/ready/brawl/cast
//
// v2: walls (nav.js — champions follow findPath, everything else steps + pushOut),
// dashes clipMove, blinks nearestFree, knockback + wallStun, persistent zones,
// projectile fans (shared hit set), pets (unit kind 'pet', `owner` = champion key,
// untargetable, zap their owner's target), `at:'pet'` circles, buff petPct.
// v3: summoner spells (`spell {slot, x, y, id?}` -> `fx {k:'spell'}`; spellD/spellF/cdD/cdF,
// buff tags ghost / ignited), phases skip straight to playing (lobbyMs 0), optional
// `spells` [d, f] for the local champion and `allies` / `enemies` picks from an offline draft.
// v4: bushes + rough visibility (contract v4 §3.2). Champions get `inBush`; an entity in a
// bush is hidden from the other team unless one of that team's champions stands in the same
// bush or it attacked / cast within BUSH_REVEAL_MS. `clientState` is the local player's
// view (hidden enemies REMOVED, like the server's StateView); atk / fx involving a hidden
// entity are not emitted; bots + towers can't see / target hidden enemies; orders, target
// skills and ignite / smite at a hidden id are rejected (skillshots + AoE still hit).
import * as R from '../../../shared/moba/rules.js';
import { CHAMPIONS, ROLE_ORDER, ROLE_PICKS } from '../../../shared/moba/champions.js';
import { ITEMS, buyBlocker, itemStats } from '../../../shared/moba/items.js';
import {
  STRUCTURES, CAMPS, EPIC_SPOTS, FOUNTAIN, STRUCTURE_RADIUS, CHAMP_RADIUS, MINION_RADIUS, laneFor, clampToMap, unlockedBy, distToSeg, bushAt,
} from '../../../shared/moba/map.js';
import { pushOut, findPath, clipMove, nearestFree } from '../../../shared/moba/nav.js';
import { SPELLS, DEFAULT_SPELLS, ROLE_SPELLS, validSpellPair } from '../../../shared/moba/spells.js';

const BOT_NAMES = ['Ada', 'Linus', 'Grace', 'Ken', 'Barbara', 'Dennis', 'Margaret', 'Guido', 'Bjarne', 'Yuki'];
const LANE_OF_ROLE = { top: 'top', mid: 'mid', bot: 'bot', support: 'bot', jungle: null };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ENEMY = { blue: 'red', red: 'blue' };
const PET_R = 18;
const isStruct = (e) => e.kind === 'tower' || e.kind === 'core';

export class OfflineSim {
  constructor({ champ, name, emit, lobbyMs = 0, spells = null, allies = null, enemies = null }) {
    this.localId = 'me';
    // Visibility filter on everything sent to the local player (blue).
    this.emit = (type, m) => {
      if (type === 'atk') { const a = m.filter((x) => !this._hidId(x.f) && !this._hidId(x.t)); if (a.length) emit(type, a); return; }
      if (type === 'fx' && (this._hidId(m.sid) || this._hidId(m.id) || this._hidId(m.t))) return;
      emit(type, m);
    };
    this.t = Date.now();
    this._uid = 0;
    this._wave = 0;
    this._waveAt = 0;
    this._atk = [];
    this._timers = [];
    this._firstBlood = false;
    this.state = {
      phase: 'lobby', lobbyEndsAt: this.t + lobbyMs, startedAt: 0, winner: '', blueKills: 0, redKills: 0,
      buffBlue: '', buffBlueUntil: 0, buffRed: '', buffRedUntil: 0, epicGoldenAt: 0, epicDeadlineAt: 0,
      champions: new Map(), units: new Map(), structures: new Map(),
    };
    // The local player's view: hidden enemy champions / units are absent (rebuilt every update).
    this._visC = new Map(); this._visU = new Map();
    const st0 = this.state;
    this.clientState = new Proxy(st0, {
      get: (t, k) => (k === 'champions' ? (t.phase === 'ended' ? t.champions : this._visC) : k === 'units' ? this._visU : t[k]),
    });
    this._picks = { blue: Array.isArray(allies) ? allies : [], red: Array.isArray(enemies) ? enemies : [] };
    const me = this._addChamp('me', 'blue', CHAMPIONS[champ] ? champ : 'pixel', name || 'You', false);
    const sp = Array.isArray(spells) && validSpellPair(spells[0], spells[1]) ? spells : DEFAULT_SPELLS;
    me.spellD = sp[0]; me.spellF = sp[1];
    for (const s of STRUCTURES) {
      const hp = s.kind === 'core' ? R.CORE.hp : R.TOWER.hp[s.tier];
      this.state.structures.set(s.id, {
        id: s.id, x: s.x, y: s.y, team: s.team, kind: s.kind, lane: s.lane, tier: s.tier,
        hp, maxHp: hp, alive: true, invulnerable: unlockedBy(s).length > 0, _req: unlockedBy(s), _atkAt: 0,
      });
    }
  }

  // ───────────────────────── messages from the client ─────────────────────────
  receive(type, m = {}) {
    const me = this.state.champions.get(this.localId);
    if (type === 'hello') { this.emit('welcome', { serverNow: Date.now(), team: me.team, champ: me.champ }); return; }
    if (type === 'startNow') { if (this.state.phase === 'lobby') this._start(); return; }
    if (type === 'chat') { this.emit('chat', { sid: this.localId, name: me.name, text: String(m.text || '').slice(0, 140) }); return; }
    if (this.state.phase !== 'playing' || !me) return;
    if (type === 'order') {
      if (m.type === 'move' && Number.isFinite(m.x) && Number.isFinite(m.y)) { me._order = { type: 'move', ...clampToMap(m.x, m.y) }; me.targetId = ''; }
      else if (m.type === 'attack' && this._ent(m.id) && this._ent(m.id).kind !== 'pet' && !this._hidId(m.id)) { me._order = { type: 'attack', id: m.id }; me.targetId = m.id; }
      else if (m.type === 'stop') { me._order = null; me.targetId = ''; }
      this._cancelRecall(me);
    } else if (type === 'cast') this._cast(me, m);
    else if (type === 'spell') this._spell(me, m);
    else if (type === 'buy') this._buy(me, m.item);
    else if (type === 'recall') this._recall(me);
  }

  debug(cmd, a, b) {
    const me = this.state.champions.get(this.localId), st = this.state;
    if (cmd === 'level') { me.level = Math.max(1, Math.min(R.MAX_LEVEL, a | 0)); me.xp = R.XP_TABLE[me.level - 1]; this._recalc(me, true); }
    else if (cmd === 'gold') me.gold += a | 0;
    else if (cmd === 'tp') { me.x = a; me.y = b; me._order = null; }
    else if (cmd === 'kill') this._kill(me, null);
    else if (cmd === 'end') { st.phase = 'ended'; st.winner = a || 'blue'; }
    else if (cmd === 'fight') { // pull a few red champions next to you
      let i = 0;
      st.champions.forEach((c) => { if (c.team === 'red' && i < 3) { c.x = me.x + 260 + i * 70; c.y = me.y - 120 + i * 90; c.dead = false; i++; } });
    }
    else if (cmd === 'ready') { me.cdQ = me.cdR = me.cdW = me.cdE = me.cdD = me.cdF = 0; me.mana = me.maxMana; }
    else if (cmd === 'spell') { const K = a?.slot === 'f' ? 'F' : 'D'; me['cd' + K] = 0; this._spell(me, { slot: K.toLowerCase(), x: a?.x, y: a?.y, id: a?.id }); }
    else if (cmd === 'cast') { const sl = String(a?.slot || 'q'); me['cd' + sl.toUpperCase()] = 0; me.mana = me.maxMana; this._cast(me, { slot: sl, x: a?.x, y: a?.y, id: a?.id }); }
    else if (cmd === 'brawl') { // all 10 champions into one fight at (a, b), level 8
      const x = Number.isFinite(a) ? a : 2100, y = Number.isFinite(b) ? b : 2500;
      let i = 0;
      st.champions.forEach((c) => {
        const q = nearestFree(x + (i % 5) * 70 + (c.team === 'red' ? 260 : 0), y + Math.floor(i / 5) * 90, CHAMP_RADIUS);
        c.x = q.x; c.y = q.y; c.dead = false; c.level = 8; c.xp = R.XP_TABLE[7]; this._recalc(c, true); c._order = null; c._nav = null; i++;
        this._placePet(c);
      });
    }
    return true;
  }

  // ───────────────────────── world setup ─────────────────────────
  _addChamp(id, team, champId, name, isBot, role) {
    const def = CHAMPIONS[champId];
    const f = FOUNTAIN[team];
    const c = {
      id, x: f.x + (Math.random() - 0.5) * 160, y: f.y + (Math.random() - 0.5) * 160, team, champ: champId, name, isBot,
      level: 1, xp: 0, gold: R.START_GOLD, hp: 1, maxHp: 1, mana: 1, maxMana: 1, ad: 0, ap: 0, armor: 0, ms: 0, range: 0, as: 0,
      dead: false, respawnAt: 0, kills: 0, deaths: 0, assists: 0, cs: 0, items: ['', '', '', '', '', ''],
      cdQ: 0, cdW: 0, cdE: 0, cdR: 0, locked: true, spellD: (ROLE_SPELLS[role || def.lane] || DEFAULT_SPELLS)[0],
      spellF: (ROLE_SPELLS[role || def.lane] || DEFAULT_SPELLS)[1], cdD: 0, cdF: 0, stunnedUntil: 0, rootedUntil: 0, slowUntil: 0, slowPct: 0, shield: 0, buffs: '',
      recallUntil: 0, action: 'idle', action_seq: 0, targetId: '',
      _order: null, _atkAt: 0, _role: role || def.lane, _buffs: {}, _shieldUntil: 0, _thinkAt: 0, _coffeeUntil: 0,
      _ghostUntil: 0, _spMsUntil: 0, _spMsPct: 0, _ignite: null,
    };
    this._recalc(c, true);
    this.state.champions.set(id, c);
    return c;
  }

  _recalc(c, full) {
    const def = CHAMPIONS[c.champ], b = def.base, g = def.growth, it = itemStats(c.items);
    const oldMax = c.maxHp;
    c.maxHp = Math.round(R.statAt(b.hp, g.hp, c.level) + it.hp);
    c.maxMana = Math.round(R.statAt(b.mana, g.mana, c.level) + it.mana);
    c.ad = Math.round(R.statAt(b.ad, g.ad, c.level) + it.ad);
    c.ap = Math.round((b.ap + it.ap) * (1 + it.apPct));
    c.armor = Math.round(R.statAt(b.armor, g.armor, c.level) + it.armor);
    let msMul = 1;
    for (const [tag, until] of Object.entries(c._buffs)) if (until > this.t) msMul += def.skills[tag]?.buff?.msPct || 0;
    if (c._spMsUntil > this.t) msMul += c._spMsPct || 0;
    c.ms = Math.round((b.ms + it.ms) * msMul);
    c.range = b.range;
    c.as = +(R.statAt(b.as, g.as, c.level) * (1 + it.as)).toFixed(3);
    c._haste = it.haste; c._ls = it.lifesteal;
    if (full) { c.hp = c.maxHp; c.mana = c.maxMana; } else if (c.maxHp > oldMax) c.hp += c.maxHp - oldMax;
  }

  _start() {
    const st = this.state;
    st.phase = 'playing'; st.startedAt = this.t;
    let bi = 0;
    for (const team of ['blue', 'red']) {
      // Offline draft picks first (TeamSelectScene): ids or { champ, name?, role?, spells? }.
      for (const p of this._picks[team] || []) {
        const n0 = [...st.champions.values()].filter((c) => c.team === team).length;
        const pid = typeof p === 'string' ? p : p?.champ;
        if (n0 >= R.TEAM_SIZE || !CHAMPIONS[pid] || [...st.champions.values()].some((c) => c.team === team && c.champ === pid)) continue;
        const bot = this._addChamp(`bot_${bi}`, team, pid, p?.name || BOT_NAMES[bi % BOT_NAMES.length], true, p?.role || CHAMPIONS[pid].lane);
        if (Array.isArray(p?.spells) && validSpellPair(p.spells[0], p.spells[1])) { bot.spellD = p.spells[0]; bot.spellF = p.spells[1]; }
        bi++;
      }
      const members = [...st.champions.values()].filter((c) => c.team === team);
      const used = new Set(members.map((c) => c.champ)), roles = new Set(members.map((c) => c._role));
      let n = members.length;
      for (const role of ROLE_ORDER) {
        if (n >= R.TEAM_SIZE) break;
        if (roles.has(role)) continue;
        const free = ROLE_PICKS[role].filter((p) => !used.has(p) && CHAMPIONS[p]);
        const pick = free.length ? free[Math.floor(Math.random() * free.length)] : Object.keys(CHAMPIONS).find((p) => !used.has(p));
        used.add(pick); roles.add(role); n++;
        this._addChamp(`bot_${bi}`, team, pick, BOT_NAMES[bi % BOT_NAMES.length], true, role);
        bi++;
      }
    }
    for (const camp of CAMPS) this._spawnCamp(camp);
    this._spawnEpic('golden'); this._spawnEpic('deadline');
    st.champions.forEach((c) => this._spawnPet(c));
    this._waveAt = this.t + 1500;
    this.emit('announce', { title: '⚔️ SHIP IT!', sub: 'Offline practice — bots fill every seat', color: '#ffd23f', big: true });
  }

  _addUnit(u) {
    const id = `u${++this._uid}`;
    this.state.units.set(id, {
      id, x: u.x, y: u.y, team: u.team, kind: u.kind, hp: u.hp, maxHp: u.hp, alive: true, hit_seq: 0, campId: u.campId || '',
      owner: u.owner || '',
      _spec: u.spec, _path: u.path || null, _wp: 1, _atkAt: 0, _home: u.home || null, _aggro: '', _tgt: '',
    });
    return id;
  }

  _spawnWave() {
    this._wave++;
    const kinds = [...R.WAVE_COMPOSITION];
    if (this._wave % R.SIEGE_EVERY_N_WAVES === 0) kinds.splice(3, 0, 'siege');
    const mul = 1 + R.MINION_GROWTH_PER_WAVE * (this._wave - 1);
    for (const team of ['blue', 'red']) {
      for (const lane of ['top', 'mid', 'bot']) {
        const path = laneFor(team, lane), p0 = path[0], p1 = path[1];
        const d = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1, ux = (p1.x - p0.x) / d, uy = (p1.y - p0.y) / d;
        kinds.forEach((k, i) => {
          const sp = R.MINIONS[k];
          this._addUnit({
            x: p0.x - ux * i * 60, y: p0.y - uy * i * 60, team, kind: k, hp: Math.round(sp.hp * mul),
            spec: { ...sp, dmg: sp.dmg * mul }, path,
          });
        });
      }
    }
  }

  _spawnCamp(camp) {
    const sp = R.CAMPS[camp.type];
    for (let i = 0; i < sp.count; i++) {
      const a = (i / sp.count) * Math.PI * 2, r = sp.count > 1 ? 60 : 0;
      const x = camp.x + Math.cos(a) * r, y = camp.y + Math.sin(a) * r;
      this._addUnit({ x, y, team: 'neutral', kind: camp.type, hp: sp.hp, spec: { ...sp, range: 110, speed: 260 }, campId: camp.id, home: { x, y } });
    }
  }

  _spawnEpic(kind) {
    const sp = R.EPICS[kind], p = EPIC_SPOTS[kind];
    this._addUnit({ x: p.x, y: p.y, team: 'neutral', kind, hp: sp.hp, spec: { ...sp, range: 160, speed: 220 }, home: { ...p } });
    if (kind === 'golden') this.state.epicGoldenAt = 0; else this.state.epicDeadlineAt = 0;
  }

  // ───────────────────────── pets ─────────────────────────
  _petOf(c) { return c._petId ? this.state.units.get(c._petId) || null : null; }
  _spawnPet(c) {
    const pet = CHAMPIONS[c.champ]?.pet;
    if (!pet || c.dead || this._petOf(c)) return;
    const f = FOUNTAIN[c.team];
    const q = nearestFree(c.x + (f.x < c.x ? -1 : 1) * 60, c.y + (f.y < c.y ? -1 : 1) * 60, PET_R);
    c._petId = this._addUnit({ x: q.x, y: q.y, team: c.team, kind: 'pet', hp: 1, owner: c.id, spec: { ...pet } });
  }
  _placePet(c) { const u = this._petOf(c); if (u) { const q = nearestFree(c.x - 70, c.y + 40, PET_R); u.x = q.x; u.y = q.y; } }
  _despawnPet(c) {
    const u = this._petOf(c);
    c._petId = null;
    if (!u) return;
    u.alive = false;
    const id = u.id;
    this._timers.push([this.t + 600, () => this.state.units.delete(id)]);
  }
  /** Follow ~`follow` px behind the owner; zap the owner's target / last enemy champion hit. */
  _petTick(u, dt) {
    const c = this.state.champions.get(u.owner);
    if (!c || c.dead) { if (c) this._despawnPet(c); else { u.alive = false; this.state.units.delete(u.id); } return; }
    const sp = u._spec, t = this.t;
    if (dist(u, c) > R.PET_LEASH) { const q = nearestFree(c.x, c.y + 40, PET_R); u.x = q.x; u.y = q.y; }
    const mvx = c._mvx || (c.team === 'blue' ? 1 : -1), mvy = c._mvy || 0;
    const goal = { x: c.x - mvx * (sp.follow || 110) - mvy * 30, y: c.y - mvy * (sp.follow || 110) + mvx * 30 };
    if (dist(u, goal) > 24) this._step(u, goal, c.ms * R.PET_SPEED_MUL, dt);
    const q = pushOut(u.x, u.y, PET_R); u.x = q.x; u.y = q.y;
    let tgt = c._order?.type === 'attack' ? this._ent(c._order.id) : null;
    if (!this._alive(tgt) || tgt.team === c.team || tgt.kind === 'pet') tgt = null;
    if (!tgt && c._lastChampHit && t - c._lastChampHit.t <= R.PET_OWNER_HIT_MEMORY_MS) {
      const e = this.state.champions.get(c._lastChampHit.id);
      if (this._alive(e) && e.team !== c.team) tgt = e;
    }
    if (!tgt || t < u._atkAt || dist(u, tgt) > (sp.range || 300) + this._radius(tgt)) return;
    let pct = 0;
    for (const [slot, until] of Object.entries(c._buffs)) if (until > t) pct += CHAMPIONS[c.champ].skills[slot]?.buff?.petPct || 0;
    u._atkAt = t + (sp.atkMs || 1000) / (1 + pct);
    this.emit('fx', { k: 'petatk', id: u.id, t: tgt.id });
    this._damage(tgt, R.scaledAmount(sp.dmg, c.level, c.ad, c.ap, c.maxHp) * (1 + pct), c, true);
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
    if (now >= this._waveAt) { this._spawnWave(); this._waveAt = now + 25000; }
    st.units.forEach((u) => this._unitTick(u, dt));
    st.structures.forEach((s) => this._towerTick(s));
    st.champions.forEach((c) => this._champTick(c, dt));
    this._updateBushes();
    if (this._atk.length) { this.emit('atk', this._atk); this._atk = []; }
  }

  // ───────────────────────── v4: bushes / visibility ─────────────────────────
  _updateBushes() {
    const st = this.state;
    st.champions.forEach((c) => { c._bush = c.dead ? '' : bushAt(c.x, c.y); c.inBush = c._bush; });
    st.units.forEach((u) => { u._bush = u.alive ? bushAt(u.x, u.y) : ''; });
    const me = st.champions.get(this.localId), team = me?.team || 'blue';
    this._visC.clear(); this._visU.clear();
    st.champions.forEach((c, id) => { if (!this._hiddenFrom(c, team)) this._visC.set(id, c); });
    st.units.forEach((u, id) => { if (!this._hiddenFrom(u, team)) this._visU.set(id, u); });
  }
  /** Is `e` hidden from `team`? (in a bush, not revealed, no champion of `team` in the same bush) */
  _hiddenFrom(e, team) {
    if (!e || !e._bush || e.team === team || isStruct(e)) return false;
    if ((e._revealUntil || 0) > this.t) return false;
    for (const c of this.state.champions.values()) if (c.team === team && !c.dead && c._bush === e._bush) return false;
    return true;
  }
  /** Hidden from the local player? (id → entity) */
  _hidId(id) {
    if (!id || this.state.phase !== 'playing') return false;
    const me = this.state.champions.get(this.localId);
    return this._hiddenFrom(this._ent(id), me?.team || 'blue');
  }
  _reveal(e) { if (e) e._revealUntil = this.t + R.BUSH_REVEAL_MS; }

  _ent(id) {
    if (!id) return null;
    const st = this.state;
    return st.champions.get(id) || st.units.get(id) || st.structures.get(id) || null;
  }
  _alive(e) { return !!e && (e.dead === undefined ? e.alive !== false : !e.dead); }
  _radius(e) { return e.kind === 'tower' ? STRUCTURE_RADIUS.tower : e.kind === 'core' ? STRUCTURE_RADIUS.core : e.champ ? 30 : 22; }

  _step(e, to, speed, dt) {
    const dx = to.x - e.x, dy = to.y - e.y, d = Math.hypot(dx, dy);
    if (d < 1) return true;
    const s = Math.min(d, speed * dt);
    e.x += (dx / d) * s; e.y += (dy / d) * s;
    if (e.champ) { e._mvx = dx / d; e._mvy = dy / d; }
    return s >= d;
  }
  _navR(e) { return e.champ ? CHAMP_RADIUS : e.kind === 'pet' ? PET_R : (R.EPICS[e.kind] ? 0 : MINION_RADIUS); }
  /** Step then resolve wall overlap (minions, monsters). */
  _stepNav(e, to, speed, dt) {
    const done = this._step(e, to, speed, dt);
    const r = this._navR(e);
    if (r) { const q = pushOut(e.x, e.y, r); e.x = q.x; e.y = q.y; }
    return done;
  }
  /** Follow a cached nav path to `goal` (re-path when the goal moved > 150 px or the order changed). */
  _moveAlong(e, goal, speed, dt, key) {
    const r = this._navR(e) || CHAMP_RADIUS;
    const gm = e._navGoal ? Math.hypot(goal.x - e._navGoal.x, goal.y - e._navGoal.y) : Infinity;
    if (e._navKey !== key || !e._nav || gm > 150 || (!e._nav.length && dist(e, goal) > 6)) {
      e._nav = findPath(e.x, e.y, goal.x, goal.y, r); e._navKey = key; e._navGoal = { x: goal.x, y: goal.y };
    }
    const wp = e._nav[0];
    if (!wp) return true;
    let arrived = false;
    if (this._step(e, wp, speed, dt)) { e._nav.shift(); arrived = !e._nav.length; }
    const q = pushOut(e.x, e.y, r); e.x = q.x; e.y = q.y;
    return arrived;
  }

  /** Nearest enemy of `src` within range; minion > champion > structure for minions. */
  _nearestEnemy(src, range, champFirst) {
    const st = this.state, foe = ENEMY[src.team];
    let bu = null, bud = range, bc = null, bcd = range, bs = null, bsd = range;
    st.units.forEach((u) => {
      if (!u.alive || u.team !== foe || u.kind === 'pet' || this._hiddenFrom(u, src.team)) return;
      const d = dist(src, u); if (d < bud) { bud = d; bu = u; }
    });
    st.champions.forEach((c) => {
      if (c.dead || c.team !== foe || this._hiddenFrom(c, src.team)) return;
      const d = dist(src, c); if (d < bcd) { bcd = d; bc = c; }
    });
    st.structures.forEach((s) => {
      if (!s.alive || s.team !== foe) return;
      const d = dist(src, s) - this._radius(s); if (d < bsd) { bsd = d; bs = s; }
    });
    return champFirst ? (bc || bu || bs) : (bu || bc || bs);
  }

  _unitTick(u, dt) {
    if (!u.alive) return;
    if (u.kind === 'pet') { this._petTick(u, dt); return; }
    const sp = u._spec;
    let target = null;
    if (!u.campId && R.MINIONS[u.kind]) {
      target = this._ent(u._tgt);
      if (!this._alive(target) || dist(u, target) > R.MINION_AGGRO_RANGE) target = this._nearestEnemy(u, R.MINION_AGGRO_RANGE, false);
    } else {
      target = this._ent(u._aggro);
      if (!this._alive(target) || dist(target, u._home) > R.CAMP_LEASH_RADIUS) { u._aggro = ''; target = null; }
      if (!target) {
        if (dist(u, u._home) < 2 || this._moveAlong(u, u._home, sp.speed, dt, 'home')) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.5 * dt);
        return;
      }
    }
    u._tgt = target ? target.id : '';
    if (target) {
      const reach = (sp.range || 90) + this._radius(target);
      if (dist(u, target) > reach) {
        if (u.campId || R.EPICS[u.kind]) this._moveAlong(u, target, sp.speed || 170, dt, target.id);
        else this._stepNav(u, target, sp.speed || 170, dt);
      }
      else if (this.t >= u._atkAt) {
        u._atkAt = this.t + (sp.atkMs || 1300);
        this._attack(u, target, sp.dmg, (sp.range || 0) > 200);
      }
    } else if (u._path) {
      const wp = u._path[Math.min(u._wp, u._path.length - 1)];
      if (this._stepNav(u, wp, sp.speed, dt) && u._wp < u._path.length) u._wp++;
      if (u._wp >= u._path.length) { // march on the enemy core
        const core = this.state.structures.get(`${ENEMY[u.team]}_core`);
        if (core) this._stepNav(u, core, sp.speed, dt);
      }
    }
  }

  _towerTick(s) {
    if (!s.alive || s.kind !== 'tower' || this.t < s._atkAt) return;
    const t = this._nearestEnemy(s, R.TOWER.range, false);
    if (!t || t.kind === 'tower' || t.kind === 'core') return;
    s._atkAt = this.t + R.TOWER.atkMs;
    const dmg = t.champ ? R.TOWER.dmgChamp : t.maxHp * R.TOWER.dmgMinionPctMaxHp;
    this._attack(s, t, dmg, true, true);
  }

  _champTick(c, dt) {
    const t = this.t;
    if (c.dead) { if (t >= c.respawnAt) this._respawn(c); return; }
    // buffs + shield + coffee + regen
    let tags = Object.entries(c._buffs).filter(([, until]) => until > t).map(([k]) => k);
    if (c.recallUntil) tags.push('recall');
    if (c._coffeeUntil > t) { tags.push('coffee'); c.hp = Math.min(c.maxHp, c.hp + 160 / 6 * dt); c.mana = Math.min(c.maxMana, c.mana + 70 / 6 * dt); }
    const team = c.team === 'blue' ? 'Blue' : 'Red';
    if (this.state[`buff${team}`] && this.state[`buff${team}Until`] > t) tags.push('deadline');
    if (c._ghostUntil > t) tags.push('ghost');
    if (c._ignite) {
      const ig = c._ignite;
      if (t >= ig.until + 10) c._ignite = null;
      else {
        tags.push('ignited');
        while (ig.next <= Math.min(t, ig.until)) { ig.next += 500; this._damage(c, ig.tick, this._ent(ig.src), false, true); if (c.dead) return; }
      }
    }
    const msOn = c._spMsUntil > t;
    if (msOn !== !!c._msOn) { c._msOn = msOn; this._recalc(c, false); }
    const bstr = tags.join(',');
    if (bstr !== c.buffs) { c.buffs = bstr; this._recalc(c, false); }
    if (c.shield > 0 && t > c._shieldUntil) c.shield = 0;
    const inFountain = dist(c, FOUNTAIN[c.team]) <= R.FOUNTAIN_RADIUS;
    const hpRate = inFountain ? R.FOUNTAIN_HEAL_PER_SEC : R.HP_REGEN_PCT_PER_SEC;
    c.hp = Math.min(c.maxHp, c.hp + c.maxHp * hpRate * dt * this._healMul(c));
    c.mana = Math.min(c.maxMana, c.mana + c.maxMana * (inFountain ? R.FOUNTAIN_MANA_PER_SEC : R.MANA_REGEN_PCT_PER_SEC) * dt);
    if (t - this.state.startedAt > R.PASSIVE_GOLD_DELAY_MS) c._goldAcc = (c._goldAcc || 0) + R.PASSIVE_GOLD_PER_SEC * dt;
    if (c._goldAcc >= 1) { c.gold += Math.floor(c._goldAcc); c._goldAcc -= Math.floor(c._goldAcc); }
    if (c.recallUntil) {
      if (t >= c.recallUntil) { c.recallUntil = 0; const f = FOUNTAIN[c.team]; c.x = f.x; c.y = f.y; c._order = null; this._placePet(c); }
      return;
    }
    if (c._dispUntil > t) return; // being knocked back
    if (c.isBot) this._botThink(c);
    if (c.stunnedUntil > t) return;
    const o = c._order;
    if (!o) return;
    const speed = c.ms * (c.slowUntil > t ? 1 - c.slowPct / 100 : 1), rooted = c.rootedUntil > t;
    if (o.type === 'move') { if (!rooted && this._moveAlong(c, o, speed, dt, o)) c._order = null; return; }
    const target = this._ent(o.id);
    if (!this._alive(target) || (target.team === c.team) || target.kind === 'pet' || this._hiddenFrom(target, c.team)) { c._order = null; c.targetId = ''; return; }
    if (dist(c, target) > c.range + this._radius(target)) { if (!rooted) this._moveAlong(c, target, speed, dt, o); }
    else if (t >= c._atkAt) {
      c._atkAt = t + 1000 / Math.max(0.2, c.as);
      c.action = 'attack'; c.action_seq++;
      this._attack(c, target, c.ad, CHAMPIONS[c.champ].ranged);
    }
  }

  _botThink(c) {
    if (this.t < c._thinkAt) return;
    c._thinkAt = this.t + 350 + Math.random() * 300;
    const f = FOUNTAIN[c.team];
    if (c.hp < c.maxHp * 0.25 && dist(c, f) > 900) { c._order = { type: 'move', x: f.x, y: f.y }; c.targetId = ''; return; }
    if (c.hp < c.maxHp * 0.95 && dist(c, f) < R.FOUNTAIN_RADIUS * 0.6) return; // heal up
    if (this._botSpells(c)) return;
    const foe = this._nearestEnemy(c, c.range + 380, true);
    if (foe && foe.kind !== 'core' && !(foe.kind === 'tower' && foe.invulnerable)) {
      c._order = { type: 'attack', id: foe.id }; c.targetId = foe.id;
      if (Math.random() < 0.25) {
        const slot = ['q', 'w', 'e', 'r'][Math.floor(Math.random() * 4)];
        this._cast(c, { slot, x: foe.x, y: foe.y, id: foe.id });
      }
      return;
    }
    const lane = LANE_OF_ROLE[c._role];
    let goal;
    if (!lane) {
      const camps = CAMPS.filter((k) => k.side === c.team);
      goal = camps[Math.floor(this.t / 9000) % camps.length];
    } else {
      const tw = [...this.state.structures.values()].filter((s) => s.team === c.team && s.lane === lane && s.alive)
        .sort((a, b) => a.tier - b.tier)[0];
      const path = laneFor(c.team, lane);
      goal = tw ? { x: tw.x + (path[path.length - 1].x - tw.x) * 0.08, y: tw.y + (path[path.length - 1].y - tw.y) * 0.08 } : path[1];
    }
    if (dist(c, goal) > 90) c._order = { type: 'move', x: goal.x + (Math.random() - 0.5) * 120, y: goal.y + (Math.random() - 0.5) * 120 };
  }

  // ───────────────────────── combat ─────────────────────────
  _attack(src, target, raw, ranged, isTower) {
    this._atk.push({ f: src.id, t: target.id, r: ranged ? 1 : 0 });
    this._reveal(src);
    const delay = ranged ? Math.min(600, dist(src, target) / (isTower ? 1.1 : 1.25)) : 0;
    const go = () => { if (this._alive(target) && (src.dead === undefined ? src.alive !== false : !src.dead)) this._damage(target, raw, src); };
    if (delay > 30) this._timers.push([this.t + delay, go]); else go();
  }

  _damage(target, raw, src, byPet = false, trueDmg = false) {
    if (!this._alive(target)) return 0;
    if (target.invulnerable || target.kind === 'pet') return 0;
    if (src?.champ && target.champ && !byPet) src._lastChampHit = { id: target.id, t: this.t };
    const armor = target.champ ? target.armor : target.kind === 'tower' ? R.TOWER.armor : target.kind === 'core' ? R.CORE.armor : 0;
    let dmg = trueDmg ? raw : R.damageAfterArmor(raw, armor);
    if (src?.champ && !trueDmg) { const tm = src.team === 'blue' ? 'Blue' : 'Red'; if (this.state[`buff${tm}`] && this.state[`buff${tm}Until`] > this.t) dmg *= 1.2; }
    if (target.champ) {
      const absorbed = Math.min(target.shield, dmg);
      target.shield -= absorbed; dmg -= absorbed;
      this._cancelRecall(target);
    } else target.hit_seq = (target.hit_seq || 0) + 1;
    if (target.campId !== undefined && !R.MINIONS[target.kind] && src?.id) target._aggro = target._aggro || src.id;
    target.hp = Math.max(0, target.hp - dmg);
    if (src?.champ && src._ls && !byPet) src.hp = Math.min(src.maxHp, src.hp + dmg * src._ls * this._healMul(src));
    if (target.hp <= 0) this._kill(target, src);
    return dmg;
  }

  _kill(target, src) {
    const st = this.state, killer = src?.champ ? src : null;
    if (target.champ) {
      if (target.dead) return;
      target.dead = true; target.hp = 0; target.deaths++; target._order = null; target.targetId = '';
      target._ignite = null; target._ghostUntil = 0; target._spMsUntil = 0;
      target.action = 'dead'; target.action_seq++; target.recallUntil = 0;
      target.respawnAt = this.t + R.respawnMs(target.level);
      this._despawnPet(target);
      if (killer) {
        killer.kills++; killer.gold += R.KILL_GOLD + (this._firstBlood ? 0 : R.FIRST_BLOOD_BONUS);
        killer.xp += R.KILL_XP_BASE + R.KILL_XP_PER_VICTIM_LEVEL * target.level; this._levelCheck(killer);
        if (killer.team === 'blue') st.blueKills++; else st.redKills++;
        if (killer.id === this.localId) this.emit('gold', { n: R.KILL_GOLD, x: Math.round(target.x), y: Math.round(target.y) });
        if (!this._firstBlood) { this._firstBlood = true; this.emit('announce', { title: '🩸 FIRST BLOOD', sub: `${killer.name} drew first blood`, color: '#ff5e5e' }); }
      }
      const verbs = ['pushed {b} to production', 'code-reviewed {b} into oblivion', 'force-merged over {b}'];
      const v = verbs[Math.floor(Math.random() * verbs.length)];
      this.emit('feed', {
        text: killer ? `${killer.name} ${v.replace('{b}', target.name)}` : `${target.name} crashed`,
        color: killer ? (killer.team === 'blue' ? '#7ec8ff' : '#ff8a8a') : '#cccccc', a: killer?.id, b: target.id,
      });
      return;
    }
    if (target.kind === 'tower' || target.kind === 'core') {
      target.alive = false; target.hp = 0;
      const owner = target.team === 'blue' ? 'Startup' : 'MegaCorp';
      if (target.kind === 'core') {
        st.phase = 'ended'; st.winner = ENEMY[target.team];
        this.emit('announce', { title: '💀 PRODUCTION IS DOWN', sub: `${st.winner === 'blue' ? '🚀 Startup' : '🏢 MegaCorp'} ships it!`, color: '#ffd23f', big: true });
        return;
      }
      st.structures.forEach((s) => { if (s._req.includes(target.id)) s.invulnerable = false; });
      st.champions.forEach((c) => { if (c.team !== target.team) c.gold += R.TOWER_GOLD_TEAM; });
      this.emit('announce', { title: `🔥 ${owner}'s ${target.lane} Firewall is down!`, color: target.team === 'blue' ? '#ff8a8a' : '#7ec8ff' });
      this.emit('feed', { text: `🔥 ${owner} lost a Firewall (${target.lane})`, color: '#ffb347' });
      return;
    }
    // unit
    target.alive = false; target.hp = 0;
    const id = target.id;
    this._timers.push([this.t + 600, () => st.units.delete(id)]);
    const sp = target._spec || {};
    if (killer) {
      const gold = sp.gold || sp.teamGold || 0;
      if (R.EPICS[target.kind]) {
        st.champions.forEach((c) => { if (c.team === killer.team) c.gold += sp.teamGold; });
        if (target.kind === 'deadline') {
          const tm = killer.team === 'blue' ? 'Blue' : 'Red';
          st[`buff${tm}`] = 'deadline'; st[`buff${tm}Until`] = this.t + R.EPICS.deadline.buff.ms;
        }
        this.emit('announce', { title: `${R.EPICS[target.kind].title} taken!`, sub: R.EPICS[target.kind].reward, color: '#ffd700', big: true });
      } else {
        killer.gold += gold; killer.cs++;
        if (killer.id === this.localId) this.emit('gold', { n: gold, x: Math.round(target.x), y: Math.round(target.y) });
      }
    }
    // XP to nearby enemy champions
    const near = [...st.champions.values()].filter((c) => !c.dead && c.team !== target.team && dist(c, target) <= R.XP_SHARE_RADIUS);
    for (const c of near) { c.xp += Math.round((sp.xp || 30) / near.length); this._levelCheck(c); }
    if (R.EPICS[target.kind]) {
      const at = this.t + R.EPICS[target.kind].respawnMs;
      if (target.kind === 'golden') st.epicGoldenAt = at; else st.epicDeadlineAt = at;
      this._timers.push([at, () => this._spawnEpic(target.kind)]);
    } else if (target.campId) {
      const campId = target.campId;
      const left = [...st.units.values()].some((u) => u.alive && u.campId === campId);
      if (!left) {
        const camp = CAMPS.find((k) => k.id === campId);
        if (camp) this._timers.push([this.t + R.CAMPS[camp.type].respawnMs, () => this._spawnCamp(camp)]);
      }
    }
  }

  _levelCheck(c) {
    const lv = R.levelForXp(c.xp);
    if (lv !== c.level) { c.level = lv; this._recalc(c, false); }
  }

  _respawn(c) {
    const f = FOUNTAIN[c.team];
    c.dead = false; c.x = f.x; c.y = f.y; c.hp = c.maxHp; c.mana = c.maxMana; c.action = 'idle'; c.action_seq++;
    c._nav = null;
    this._spawnPet(c);
  }

  _cancelRecall(c) { if (c.recallUntil) c.recallUntil = 0; }

  _recall(c) {
    if (c.dead || c.recallUntil) return;
    c.recallUntil = this.t + R.RECALL_MS; c._order = null; c.targetId = ''; c.action = 'recall'; c.action_seq++;
  }

  _buy(c, id) {
    const it = ITEMS[id];
    if (!it) return;
    const inFountain = dist(c, FOUNTAIN[c.team]) <= R.FOUNTAIN_RADIUS;
    if (!(inFountain || c.dead) || c.gold < it.cost || buyBlocker(c.items, id)) return;
    c.gold -= it.cost;
    if (it.consumable) { c._coffeeUntil = this.t + (it.effect?.ms || 6000); return; }
    const slot = c.items.indexOf('');
    if (slot >= 0) { c.items[slot] = id; this._recalc(c, false); }
  }

  /** Knockback `dist` px straight away from (fx, fy), stopped by walls; into a wall → wallStun. */
  _knock(e, fx0, fy0, distPx, wallStunMs) {
    if (!e || isStruct(e) || R.EPICS[e.kind] || e.kind === 'pet' || !this._alive(e)) return;
    const dx = e.x - fx0, dy = e.y - fy0, d = Math.hypot(dx, dy);
    const ux = d > 1 ? dx / d : 1, uy = d > 1 ? dy / d : 0;
    const goal = clampToMap(e.x + ux * distPx, e.y + uy * distPx);
    const r = this._navR(e) || MINION_RADIUS;
    const end = clipMove(e.x, e.y, goal.x, goal.y, r);
    const wall = !!end.hit;
    const x0 = e.x, y0 = e.y;
    e.x = end.x; e.y = end.y;
    if (e.champ) {
      e._dispUntil = this.t + R.KNOCKBACK_MS; e._nav = null; // like the server: the move order survives this._cancelRecall(e);
      if (wall && wallStunMs) e.stunnedUntil = Math.max(e.stunnedUntil, this.t + R.KNOCKBACK_MS + wallStunMs);
    }
    this.emit('fx', { k: 'knock', id: e.id, x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(e.x), y1: Math.round(e.y), ms: R.KNOCKBACK_MS, wall });
  }

  /** Generic skill engine for the skill types (mirrors the contract's fx). */
  _cast(c, m) {
    const slot = m.slot, sk = CHAMPIONS[c.champ].skills[slot], t = this.t;
    if (!sk || c.dead || c.stunnedUntil > t || c._dispUntil > t) return;
    if (slot === 'r' && c.level < R.ULT_UNLOCK_LEVEL) return;
    const key = `cd${slot.toUpperCase()}`;
    if (c[key] > t || c.mana < sk.mana) return;
    if (m.id && this._hiddenFrom(this._ent(m.id), c.team)) return; // point-and-click at a hidden enemy
    this._reveal(c);
    c.mana -= sk.mana; c[key] = t + R.cooldownMs(sk.cd, c._haste);
    c.action = slot; c.action_seq++;
    this._cancelRecall(c);
    const amt = (spec) => R.scaledAmount(spec, c.level, c.ad, c.ap, c.maxHp);
    const fx = (p) => this.emit('fx', p);
    const effects = (e) => {
      if (!e.champ) return;
      if (sk.slow) { e.slowUntil = t + sk.slow.ms; e.slowPct = Math.round(sk.slow.pct * 100); }
      if (sk.root) e.rootedUntil = t + sk.root.ms;
      if (sk.stun) e.stunnedUntil = t + sk.stun.ms;
    };
    const hit = (e, extra = 0, from = null) => {
      this._damage(e, amt(sk.dmg) + extra, c); effects(e); fx({ k: 'hit', id: e.id, color: sk.color });
      if (sk.knockback && from && this._alive(e)) this._knock(e, from.x, from.y, sk.knockback.dist, sk.wallStun?.ms || 0);
    };
    const enemies = (pred) => {
      const out = [];
      const add = (e) => { if (this._alive(e) && e.team !== c.team && !isStruct(e) && e.kind !== 'pet' && pred(e)) out.push(e); };
      this.state.units.forEach(add); this.state.champions.forEach(add);
      return out;
    };
    const aimX = Number.isFinite(m.x) ? m.x : c.x + 100, aimY = Number.isFinite(m.y) ? m.y : c.y;
    const towardRange = (range) => {
      const dx = aimX - c.x, dy = aimY - c.y, d = Math.hypot(dx, dy) || 1, r = Math.min(d, range);
      return clampToMap(c.x + (dx / d) * r, c.y + (dy / d) * r);
    };
    switch (sk.type) {
      case 'projectile': {
        const dx = aimX - c.x, dy = aimY - c.y, d = Math.hypot(dx, dy) || 1;
        const count = Math.max(1, sk.count | 0 || 1), spread = count > 1 ? ((sk.spread || 0) * Math.PI) / 180 : 0;
        const base = Math.atan2(dy / d, dx / d), hitSet = new Set(), from = { x: c.x, y: c.y };
        for (let i = 0; i < count; i++) {
          const an = base + (count > 1 ? (i / (count - 1) - 0.5) * spread : 0), ux = Math.cos(an), uy = Math.sin(an);
          fx({ k: 'proj', sid: c.id, slot, x: Math.round(c.x), y: Math.round(c.y), dx: ux, dy: uy, speed: sk.speed, range: sk.range, width: sk.width, color: sk.color });
          const x1 = c.x + ux * sk.range, y1 = c.y + uy * sk.range;
          const hits = enemies((e) => !hitSet.has(e.id) && (!sk.champOnly || e.champ) && distToSeg(e.x, e.y, c.x, c.y, x1, y1) <= sk.width / 2 + this._radius(e))
            .map((e) => ({ e, d: (e.x - c.x) * ux + (e.y - c.y) * uy })).filter((h) => h.d > 0).sort((a, b) => a.d - b.d);
          for (const h of sk.pierce ? hits : hits.slice(0, 1)) {
            hitSet.add(h.e.id); // one cast = one shared hit set (a fan hits each target once)
            this._timers.push([t + (h.d / sk.speed) * 1000, () => hit(h.e, 0, from)]);
          }
        }
        break;
      }
      case 'circle': {
        const pet = sk.at === 'pet' ? this._petOf(c) : null;
        const p = pet ? { x: pet.x, y: pet.y } : sk.range ? towardRange(sk.range) : { x: c.x, y: c.y };
        fx({ k: 'circle', x: Math.round(p.x), y: Math.round(p.y), r: sk.radius, delay: sk.delay || 0, color: sk.color });
        this._timers.push([t + (sk.delay || 0), () => { for (const e of enemies((e) => dist(e, p) <= sk.radius + this._radius(e))) hit(e, 0, p); }]);
        break;
      }
      case 'zone': {
        const p = sk.range ? towardRange(sk.range) : { x: c.x, y: c.y };
        const tick = Math.max(100, sk.tickMs || 500), dur = Math.max(tick, sk.duration || 3000);
        fx({ k: 'zone', sid: c.id, slot, x: Math.round(p.x), y: Math.round(p.y), r: sk.radius, ms: dur, tickMs: tick, color: sk.color });
        for (let k = 1; k * tick <= dur; k++) {
          this._timers.push([t + k * tick, () => {
            if (this.state.phase !== 'playing') return;
            for (const e of enemies((e) => dist(e, p) <= sk.radius + this._radius(e))) { this._damage(e, amt(sk.dmg), c); effects(e); }
            if (sk.heal) this.state.champions.forEach((a) => { if (!a.dead && a.team === c.team && dist(a, p) <= sk.radius) a.hp = Math.min(a.maxHp, a.hp + amt(sk.heal)); });
          }]);
        }
        break;
      }
      case 'target': {
        const e = this._ent(m.id);
        if (e && e.kind !== 'pet' && this._alive(e) && e.team !== c.team && (sk.targets !== 'enemyChamp' || e.champ) && dist(c, e) <= sk.range + 80) {
          hit(e, sk.execute ? sk.execute.missingHpPct * (e.maxHp - e.hp) : 0, { x: c.x, y: c.y });
        }
        break;
      }
      case 'dash': {
        const x0 = c.x, y0 = c.y, tgt = sk.toTarget ? this._ent(m.id) : null;
        const want = tgt && tgt.kind !== 'pet' && this._alive(tgt) && dist(c, tgt) <= sk.range + 100 ? { x: tgt.x, y: tgt.y } : towardRange(sk.range);
        const p = clipMove(x0, y0, want.x, want.y, CHAMP_RADIUS); // dashes stop at walls
        let end = p, struck = [];
        if (sk.hitRadius) {
          struck = enemies((e) => distToSeg(e.x, e.y, x0, y0, p.x, p.y) <= sk.hitRadius + this._radius(e))
            .sort((a, b) => dist(a, c) - dist(b, c));
          const first = struck[0];
          if (first && sk.stopAtFirst) {
            struck = [first];
            const d = dist(c, first) || 1;
            end = clipMove(x0, y0, first.x - ((first.x - x0) / d) * 50, first.y - ((first.y - y0) / d) * 50, CHAMP_RADIUS);
          }
        }
        c.x = end.x; c.y = end.y; c._order = null; c._nav = null;
        fx({ k: 'dash', sid: c.id, x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(c.x), y1: Math.round(c.y), color: sk.color });
        if (sk.dmg) for (const e of struck) hit(e, 0, { x: c.x, y: c.y });
        break;
      }
      case 'blink': {
        const x0 = c.x, y0 = c.y, tr = towardRange(sk.range), p = nearestFree(tr.x, tr.y, CHAMP_RADIUS); // blinks land on the nearest free spot
        c.x = p.x; c.y = p.y; c._order = null; c._nav = null;
        fx({ k: 'blink', sid: c.id, x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(c.x), y1: Math.round(c.y) });
        break;
      }
      case 'self':
      case 'allies': {
        const group = sk.type === 'self' ? [c] : [...this.state.champions.values()].filter((a) => !a.dead && a.team === c.team && dist(a, c) <= sk.radius);
        for (const a of group) {
          if (sk.heal) a.hp = Math.min(a.maxHp, a.hp + amt(sk.heal));
          if (sk.shield) { a.shield = Math.round(amt(sk.shield)); a._shieldUntil = t + (sk.duration || 3000); }
          if (sk.buff) a._buffs[slot] = t + (sk.duration || 3000);
        }
        if (sk.heal) fx({ k: 'heal', x: Math.round(c.x), y: Math.round(c.y), r: sk.radius || 120, color: sk.color });
        fx({ k: 'buff', sid: c.id, slot, color: sk.color });
        break;
      }
      default: break;
    }
  }

  // ───────────────────────── v3: summoner spells (rough mirror of the server) ─────────────────────────
  /** Healing multiplier (Escalate / ignite cuts all healing). */
  _healMul(c) { return c._ignite && c._ignite.until > this.t ? 1 - (SPELLS.ignite.healCut || 0) : 1; }

  /** `spell {slot:'d'|'f', x, y, id?}` — returns true if it went off. */
  _spell(c, m) {
    const slot = m?.slot === 'f' ? 'F' : m?.slot === 'd' ? 'D' : null;
    if (!slot || this.state.phase !== 'playing') return false;
    const t = this.t, sp = SPELLS[c['spell' + slot]];
    if (!sp || c.dead || c.stunnedUntil > t || c[`cd${slot}`] > t) return false;
    if (m.id && this._hiddenFrom(this._ent(m.id), c.team)) return false;
    if (sp.kind !== 'blink' && sp.kind !== 'heal') this._reveal(c);
    const lvAmt = (spec) => R.scaledAmount(spec, c.level, 0, 0);
    let x0 = c.x, y0 = c.y;
    const fx = (x1, y1) => this.emit('fx', { k: 'spell', sid: c.id, spell: sp.id, x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(x1), y1: Math.round(y1) });
    switch (sp.kind) {
      case 'blink': {
        if (c.rootedUntil > t || c._dispUntil > t || !Number.isFinite(m.x) || !Number.isFinite(m.y)) return false;
        const dx = m.x - c.x, dy = m.y - c.y, d = Math.hypot(dx, dy) || 1, r = Math.min(d, sp.range);
        const aim = clampToMap(c.x + (dx / d) * r, c.y + (dy / d) * r);
        const p = nearestFree(aim.x, aim.y, CHAMP_RADIUS); // crosses walls
        x0 = c.x; y0 = c.y;
        c.x = p.x; c.y = p.y; c._order = null; c._nav = null;
        this._placePet(c);
        fx(p.x, p.y);
        break;
      }
      case 'heal': {
        let ally = null, worst = 1;
        this.state.champions.forEach((a) => {
          if (a === c || a.dead || a.team !== c.team || dist(a, c) > sp.radius) return;
          const f = a.hp / Math.max(1, a.maxHp);
          if (f < worst) { worst = f; ally = a; }
        });
        for (const a of ally ? [c, ally] : [c]) {
          a.hp = Math.min(a.maxHp, a.hp + lvAmt(sp.heal) * this._healMul(a));
          a._spMsUntil = t + sp.ms; a._spMsPct = sp.msPct;
        }
        fx(ally ? ally.x : c.x, ally ? ally.y : c.y);
        break;
      }
      case 'haste': c._ghostUntil = t + sp.ms; c._spMsUntil = t + sp.ms; c._spMsPct = sp.msPct; fx(c.x, c.y); break;
      case 'shield': c.shield = Math.max(c.shield, Math.round(lvAmt(sp.shield))); c._shieldUntil = t + sp.ms; fx(c.x, c.y); break;
      case 'dot': {
        const e = this._ent(m.id);
        if (!e || !e.champ || e.dead || e.team === c.team || dist(c, e) > sp.range + CHAMP_RADIUS) return false;
        const ticks = Math.max(1, Math.round(sp.ms / 500));
        e._ignite = { until: t + sp.ms, next: t + 500, tick: lvAmt(sp.dmg) / ticks, src: c.id };
        c._lastChampHit = { id: e.id, t };
        fx(e.x, e.y);
        break;
      }
      case 'smite': {
        const e = this._ent(m.id);
        const monster = !!e && !e.champ && e.alive && e.team === 'neutral' && (!!e.campId || !!R.EPICS[e.kind]);
        const minion = !!e && !e.champ && e.alive && !!R.MINIONS[e.kind] && e.team !== c.team;
        if (!(monster || minion) || e.kind === 'pet' || dist(c, e) > sp.range + this._radius(e)) return false;
        fx(e.x, e.y);
        this._damage(e, lvAmt(sp.dmg), c, false, true);
        if (monster) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * (sp.healSelf || 0) * this._healMul(c));
        break;
      }
      default: return false;
    }
    c[`cd${slot}`] = t + sp.cd * 1000;
    this._cancelRecall(c);
    return true;
  }

  /** Bots: rough, sensible summoner spell use. Returns true if the bot's think tick is used up. */
  _botSpells(c) {
    const t = this.t, f = FOUNTAIN[c.team];
    const ready = (id) => {
      for (const K of ['D', 'F']) if (c['spell' + K] === id && c['cd' + K] <= t) return K.toLowerCase();
      return null;
    };
    const low = c.hp < c.maxHp * 0.3;
    const foe = this._nearestEnemy(c, 700, true);
    const foeChamp = foe && foe.champ ? foe : null;
    let sl;
    if (low && foeChamp && (sl = ready('barrier'))) this._spell(c, { slot: sl, x: c.x, y: c.y });
    if (low && (sl = ready('heal'))) this._spell(c, { slot: sl, x: c.x, y: c.y });
    if (low && foeChamp && dist(c, foeChamp) < 400 && (sl = ready('flash'))) {
      const dx = f.x - c.x, dy = f.y - c.y, d = Math.hypot(dx, dy) || 1;
      if (this._spell(c, { slot: sl, x: c.x + (dx / d) * 420, y: c.y + (dy / d) * 420 })) { c._order = { type: 'move', x: f.x, y: f.y }; c.targetId = ''; return true; }
    }
    if (low && foeChamp && (sl = ready('ghost'))) this._spell(c, { slot: sl, x: c.x, y: c.y });
    if (foeChamp && foeChamp.hp < foeChamp.maxHp * 0.3 && dist(c, foeChamp) <= SPELLS.ignite.range && (sl = ready('ignite'))) {
      this._spell(c, { slot: sl, x: foeChamp.x, y: foeChamp.y, id: foeChamp.id });
    }
    if ((sl = ready('smite'))) {
      const dmg = R.scaledAmount(SPELLS.smite.dmg, c.level, 0, 0);
      let best = null;
      this.state.units.forEach((u) => {
        if (!u.alive || u.team !== 'neutral' || dist(c, u) > SPELLS.smite.range) return;
        if (u.hp <= dmg && (!best || u.maxHp > best.maxHp)) best = u;
      });
      if (best) this._spell(c, { slot: sl, x: best.x, y: best.y, id: best.id });
    }
    return false;
  }
}

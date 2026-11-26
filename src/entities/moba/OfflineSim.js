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
import { CHAMPIONS, ROLE_ORDER, ROLE_PICKS, championPassive, skillDamageType } from '../../../shared/moba/champions.js';
import { ITEMS, buyBlocker, itemStats, itemPassives, ownedActiveItem, recipePlan, applyBuy } from '../../../shared/moba/items.js';
import { AUGMENT_LEVELS, AUGMENTS, rollAugmentChoices, rollSingleAugment } from '../../../shared/moba/augments.js';
import {
  STRUCTURES, CAMPS, EPIC_SPOTS, STRUCTURE_RADIUS, CHAMP_RADIUS, MINION_RADIUS, laneFor, unlockedBy, distToSeg,
} from '../../../shared/moba/map.js';
import { SPELLS, DEFAULT_SPELLS, ROLE_SPELLS, validSpellPair } from '../../../shared/moba/spells.js';
import { WORLD_5V5 } from './world.js';

const BOT_NAMES = ['Ada', 'Linus', 'Grace', 'Ken', 'Barbara', 'Dennis', 'Margaret', 'Guido', 'Bjarne', 'Yuki'];
const LANE_OF_ROLE = { top: 'top', mid: 'mid', bot: 'bot', support: 'bot', jungle: null };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ENEMY = { blue: 'red', red: 'blue' };
const PET_R = 18;
const isStruct = (e) => e.kind === 'tower' || e.kind === 'core';

export class OfflineSim {
  constructor({ champ, name, emit, lobbyMs = 0, spells = null, allies = null, enemies = null, hat = '', world = null }) {
    this.localId = 'me';
    // 2026-11-25: the floor (size, fountains, bushes, nav). Story Mode passes its own; 5v5 = the Open Office.
    this.world = world || WORLD_5V5;
    this.nav = this.world.nav;
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
    me.hat = typeof hat === 'string' ? hat.slice(0, 16) : ''; // EP-11 cosmetic (ChampionView renders it)
    for (const s of STRUCTURES) {
      const hp = s.kind === 'core' ? R.CORE.hp : R.TOWER.hp[s.tier];
      this.state.structures.set(s.id, {
        id: s.id, x: s.x, y: s.y, team: s.team, kind: s.kind, lane: s.lane, tier: s.tier,
        hp, maxHp: hp, alive: true, invulnerable: unlockedBy(s).length > 0, _req: unlockedBy(s), _atkAt: 0,
        targetId: '', _rampId: '', _rampCount: 0,
      });
    }
    // AoV Tower Heal Relics behind each Tier-1 tower (60s respawn)
    this.state.relics = [];
    for (const s of STRUCTURES) {
      if (s.kind !== 'tower' || s.tier !== 1) continue;
      const core = STRUCTURES.find((x) => x.team === s.team && x.kind === 'core');
      const dx = core.x - s.x, dy = core.y - s.y, d = Math.hypot(dx, dy) || 1;
      this.state.relics.push({
        id: `relic_${s.id}`, team: s.team,
        x: Math.round(s.x + (dx / d) * 185), y: Math.round(s.y + (dy / d) * 185),
        upAt: 0,
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
      if (m.type === 'move' && Number.isFinite(m.x) && Number.isFinite(m.y)) { me._order = { type: 'move', ...this.world.clampToMap(m.x, m.y) }; me.targetId = ''; }
      else if (m.type === 'attack' && this._ent(m.id) && this._ent(m.id).kind !== 'pet' && !this._hidId(m.id)) { me._order = { type: 'attack', id: m.id }; me.targetId = m.id; }
      else if (m.type === 'stop') { me._order = null; me.targetId = ''; }
      this._cancelRecall(me);
    } else if (type === 'cast') this._cast(me, m);
    else if (type === 'upgrade') this._upgradeSkill(me, m?.slot);
    else if (type === 'active') this._useActiveItem(me);
    else if (type === 'ward') this._placeWard(me, m);
    else if (type === 'augmentPick') this._pickAugment(me, m?.id);
    else if (type === 'augmentReroll') this._rerollAugment(me, m?.slot);
    else if (type === 'spell') this._spell(me, m);
    else if (type === 'buy') this._buy(me, m.item);
    else if (type === 'sell') this._sell(me, m.slot);
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
        const q = this.nav.nearestFree(x + (i % 5) * 70 + (c.team === 'red' ? 260 : 0), y + Math.floor(i / 5) * 90, CHAMP_RADIUS);
        c.x = q.x; c.y = q.y; c.dead = false; c.level = 8; c.xp = R.XP_TABLE[7]; this._recalc(c, true); c._order = null; c._nav = null; i++;
        this._placePet(c);
      });
    }
    return true;
  }

  // ───────────────────────── world setup ─────────────────────────
  _addChamp(id, team, champId, name, isBot, role) {
    const def = CHAMPIONS[champId];
    const f = this.world.fountain[team];
    const c = {
      id, x: f.x + (Math.random() - 0.5) * 160, y: f.y + (Math.random() - 0.5) * 160, team, champ: champId, name, isBot,
      level: 3, xp: R.XP_TABLE[2], gold: R.START_GOLD, hp: 1, maxHp: 1, mana: 1, maxMana: 1, ad: 0, ap: 0, armor: 0, mr: 0, ms: 0, range: 0, as: 0,
      dead: false, respawnAt: 0, kills: 0, deaths: 0, assists: 0, cs: 0, items: ['', '', '', '', '', ''],
      cdQ: 0, cdW: 0, cdE: 0, cdR: 0, skillPoints: 0, ranks: { q: 1, w: 1, e: 1, r: 0 },
      locked: true, spellD: (ROLE_SPELLS[role || def.lane] || DEFAULT_SPELLS)[0],
      spellF: (ROLE_SPELLS[role || def.lane] || DEFAULT_SPELLS)[1], cdD: 0, cdF: 0, stunnedUntil: 0, rootedUntil: 0, slowUntil: 0, slowPct: 0, shield: 0, buffs: '',
      recallUntil: 0, action: 'idle', action_seq: 0, targetId: '', hat: '',
      _order: null, _atkAt: 0, _role: role || def.lane, _buffs: {}, _shieldUntil: 0, _thinkAt: 0, _coffeeUntil: 0,
      _ghostUntil: 0, _spMsUntil: 0, _spMsPct: 0, _ignite: null, _atkCount: 0, _tankStacks: 0, _tankUntil: 0, _lifelineCd: 0, _grievousUntil: 0,
      _streak: 0, _activeCd: 0, _stasisUntil: 0, _castCount: 0, _lastTargetId: '', _cacheStacks: 0, _swipeReady: false, _gradStacks: 0, _gradUntil: 0, _auditUntil: 0,
      _mrPen: 0, _manaRegen: 0, _ccChainCount: 0, _ccChainUntil: 0, _ccImmuneUntil: 0, _wardCd: 0, _stealthUntil: 0, _servoOverdriveUntil: 0, _prefetchUntil: 0,
      augments: [], augmentOffer: null, _augNextIdx: 0, _augCd: {}, _lastQAt: 0, _cleaveReady: false, _lastStandUntil: 0, _wasInBush: false,
    };
    if (isBot) this._autoSpendSkills(c);
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
    c.mr = Math.round(R.statAt(b.mr || 30, g.mr || 1.2, c.level) + (it.mr || 0));
    let msMul = 1;
    for (const [tag, until] of Object.entries(c._buffs)) if (until > this.t) msMul += def.skills[tag]?.buff?.msPct || 0;
    if (c._spMsUntil > this.t) msMul += c._spMsPct || 0;
    if (c.augments?.includes('ghost_protocol') && (this.t - (c._lastCombatAt || 0) >= 5000)) msMul += 0.15;
    c.ms = Math.round((b.ms + it.ms) * msMul);
    c.range = b.range;
    const asExtra = (c._prefetchUntil || 0) > this.t ? 0.2 : 0;
    c.as = +(R.statAt(b.as, g.as, c.level) * (1 + it.as + asExtra)).toFixed(3);
    c._haste = it.haste; c._ls = it.lifesteal; c._armorPen = it.armorPen || 0; c._mrPen = it.mrPen || 0; c._manaRegen = it.manaRegen || 0;
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
    // EP-21: epics spawn on the online schedule (firstSpawnMs) — the HUD timers count down like online.
    for (const kind of ['golden', 'deadline']) {
      const at = this.t + R.EPICS[kind].firstSpawnMs;
      if (kind === 'golden') st.epicGoldenAt = at; else st.epicDeadlineAt = at;
      this._timers.push([at, () => this._spawnEpic(kind)]);
    }
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
    const baseKinds = [...R.WAVE_COMPOSITION];
    if (this._wave % R.SIEGE_EVERY_N_WAVES === 0) baseKinds.splice(3, 0, 'siege');
    const mul = 1 + R.MINION_GROWTH_PER_WAVE * (this._wave - 1);
    for (const team of ['blue', 'red']) {
      const enemy = ENEMY[team];
      const tmKey = team === 'blue' ? 'Blue' : 'Red';
      const hasDeadline = this.state[`buff${tmKey}`] === 'deadline' && (this.state[`buff${tmKey}Until`] || 0) > this.t;
      const dlMul = hasDeadline ? (1 + (R.EPICS.deadline.buff?.minionBuffPct || 0.4)) : 1;
      for (const lane of ['top', 'mid', 'bot']) {
        const superLane = !this.state.structures.get(`${enemy}_${lane}_2`)?.alive || !this.state.structures.get(`${enemy}_base_3`)?.alive;
        const kinds = superLane ? ['siege', ...baseKinds.slice(1)] : baseKinds;
        const path = laneFor(team, lane), p0 = path[0], p1 = path[1];
        const d = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1, ux = (p1.x - p0.x) / d, uy = (p1.y - p0.y) / d;
        kinds.forEach((k, i) => {
          const sp = R.MINIONS[k];
          const isSuper = superLane && i === 0;
          const hpMul = mul * dlMul * (isSuper ? 1.85 : 1);
          const dmgMul = mul * dlMul * (isSuper ? 1.55 : 1);
          this._addUnit({
            x: p0.x - ux * i * 60, y: p0.y - uy * i * 60, team, kind: k, hp: Math.round(sp.hp * hpMul),
            spec: { ...sp, dmg: sp.dmg * dmgMul }, path,
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
    const f = this.world.fountain[c.team];
    const q = this.nav.nearestFree(c.x + (f.x < c.x ? -1 : 1) * 60, c.y + (f.y < c.y ? -1 : 1) * 60, PET_R);
    c._petId = this._addUnit({ x: q.x, y: q.y, team: c.team, kind: 'pet', hp: 1, owner: c.id, spec: { ...pet } });
  }
  _placePet(c) { const u = this._petOf(c); if (u) { const q = this.nav.nearestFree(c.x - 70, c.y + 40, PET_R); u.x = q.x; u.y = q.y; } }
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
    if (dist(u, c) > R.PET_LEASH) { const q = this.nav.nearestFree(c.x, c.y + 40, PET_R); u.x = q.x; u.y = q.y; }
    const mvx = c._mvx || (c.team === 'blue' ? 1 : -1), mvy = c._mvy || 0;
    const goal = { x: c.x - mvx * (sp.follow || 110) - mvy * 30, y: c.y - mvy * (sp.follow || 110) + mvx * 30 };
    if (dist(u, goal) > 24) this._step(u, goal, c.ms * R.PET_SPEED_MUL, dt);
    const q = this.nav.pushOut(u.x, u.y, PET_R); u.x = q.x; u.y = q.y;
    let tgt = c._order?.type === 'attack' ? this._ent(c._order.id) : null;
    if (!this._alive(tgt) || tgt.team === c.team || tgt.kind === 'pet') tgt = null;
    if (!tgt && c._lastChampHit && t - c._lastChampHit.t <= R.PET_OWNER_HIT_MEMORY_MS) {
      const e = this.state.champions.get(c._lastChampHit.id);
      if (this._alive(e) && e.team !== c.team) tgt = e;
    }
    if (!tgt || t < u._atkAt || dist(u, tgt) > (sp.range || 300) + this._radius(tgt)) return;
    let pct = 0;
    for (const [slot, until] of Object.entries(c._buffs)) if (until > t) pct += CHAMPIONS[c.champ].skills[slot]?.buff?.petPct || 0;
    const od = (c._servoOverdriveUntil || 0) > t;
    u._atkAt = t + (sp.atkMs || 1000) / (1 + pct + (od ? 0.45 : 0));
    this.emit('fx', { k: 'petatk', id: u.id, t: tgt.id });
    this._damage(tgt, R.scaledAmount(sp.dmg, c.level, c.ad, c.ap, c.maxHp) * (1 + pct + (od ? 0.35 : 0)), c, true, false, 'magic');
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
    if (now >= this._waveAt) { this._spawnWave(); this._waveAt = now + R.WAVE_EVERY_MS; }
    st.units.forEach((u) => this._unitTick(u, dt));
    st.structures.forEach((s) => this._towerTick(s));
    st.champions.forEach((c) => this._champTick(c, dt));
    this._updateBushes();
    if (this._atk.length) { this.emit('atk', this._atk); this._atk = []; }
  }

  // ───────────────────────── v4+: sight / fog-of-war + bushes ─────────────────────────
  _updateBushes() {
    const st = this.state;
    st.champions.forEach((c) => { c._bush = c.dead ? '' : this.world.bushAt(c.x, c.y); c.inBush = c._bush; });
    st.units.forEach((u) => { u._bush = u.alive ? this.world.bushAt(u.x, u.y) : ''; });
    const me = st.champions.get(this.localId), team = me?.team || 'blue';
    this._visC.clear(); this._visU.clear();
    st.champions.forEach((c, id) => { if (!this._hiddenFrom(c, team)) this._visC.set(id, c); });
    st.units.forEach((u, id) => { if (!this._hiddenFrom(u, team)) this._visU.set(id, u); });
  }
  /** Sight radius check (squared-dist for 100-CCU hot-loop speed) + bush, stealth, and ward checks. */
  _hiddenFrom(e, team) {
    if (!e || e.team === team || isStruct(e)) return false;
    if ((e._revealUntil || 0) > this.t) return false;
    const st = this.state, ex = e.x, ey = e.y;
    if (e.champ && (e._stealthUntil || 0) > this.t) {
      const STEALTH_DETECT2 = 280 * 280;
      for (const c of st.champions.values()) {
        if (c.team !== team || c.dead) continue;
        const dx = c.x - ex, dy = c.y - ey;
        if (dx * dx + dy * dy <= STEALTH_DETECT2) return false;
      }
      return true;
    }
    const R_CHAMP2 = 1100 * 1100, R_STRUCT2 = 1050 * 1050, R_MINION2 = 680 * 680;
    const R_WARD2 = R.WARD.sightRadius * R.WARD.sightRadius;
    let inSight = false;
    let sameBush = !e._bush;
    for (const c of st.champions.values()) {
      if (c.team !== team || c.dead) continue;
      if (e._bush && c._bush === e._bush) sameBush = true;
      if (!inSight) {
        const dx = c.x - ex, dy = c.y - ey;
        if (dx * dx + dy * dy <= R_CHAMP2) inSight = true;
      }
      if (inSight && sameBush) return false;
    }
    for (const u of st.units.values()) {
      if (!u.alive || u.team !== team || u.kind !== 'ward') continue;
      if (e._bush && u._bush === e._bush) sameBush = true;
      const dx = u.x - ex, dy = u.y - ey;
      if (dx * dx + dy * dy <= R_WARD2 && sameBush) return false;
    }
    if (!sameBush) return true;
    for (const s of st.structures.values()) {
      if (!s.alive || s.team !== team) continue;
      const dx = s.x - ex, dy = s.y - ey;
      if (dx * dx + dy * dy <= R_STRUCT2) return false;
    }
    for (const u of st.units.values()) {
      if (!u.alive || u.team !== team || u.kind === 'pet' || u.kind === 'ward') continue;
      const dx = u.x - ex, dy = u.y - ey;
      if (dx * dx + dy * dy <= R_MINION2) return false;
    }
    return true;
  }
  /** Hidden from the local player? (id → entity) */
  _hidId(id) {
    if (!id || this.state.phase !== 'playing') return false;
    const me = this.state.champions.get(this.localId);
    return this._hiddenFrom(this._ent(id), me?.team || 'blue');
  }
  _reveal(e) { if (e) { e._revealUntil = this.t + R.BUSH_REVEAL_MS; e._stealthUntil = 0; } }

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
    if (r) { const q = this.nav.pushOut(e.x, e.y, r); e.x = q.x; e.y = q.y; }
    return done;
  }
  /** Follow a cached nav path to `goal` (re-path when the goal moved > 150 px or the order changed). */
  _moveAlong(e, goal, speed, dt, key) {
    const r = this._navR(e) || CHAMP_RADIUS;
    const gm = e._navGoal ? Math.hypot(goal.x - e._navGoal.x, goal.y - e._navGoal.y) : Infinity;
    if (e._navKey !== key || !e._nav || gm > 150 || (!e._nav.length && dist(e, goal) > 6)) {
      e._nav = this.nav.findPath(e.x, e.y, goal.x, goal.y, r); e._navKey = key; e._navGoal = { x: goal.x, y: goal.y };
    }
    const wp = e._nav[0];
    if (!wp) return true;
    let arrived = false;
    if (this._step(e, wp, speed, dt)) { e._nav.shift(); arrived = !e._nav.length; }
    const q = this.nav.pushOut(e.x, e.y, r); e.x = q.x; e.y = q.y;
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
    if (u.kind === 'ward') { if (this.t >= (u._expiresAt || 0)) u.alive = false; return; }
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

  /** AoV Tower AI: aggro enemy champion who hit an ally champion in range, else minions first, else champions; ramping dmg. */
  _towerTick(s) {
    if (!s.alive || s.kind !== 'tower') { s.targetId = ''; return; }
    const rng2 = R.TOWER.range * R.TOWER.range;
    const st = this.state;
    let t = null;
    // 1. Priority aggro: enemy champion who attacked an allied champion within 2.5s
    for (const c of st.champions.values()) {
      if (c.dead || c.team === s.team || this._hiddenFrom(c, s.team)) continue;
      const dx = c.x - s.x, dy = c.y - s.y;
      if (dx * dx + dy * dy > rng2) continue;
      const lh = c._lastChampHit;
      if (lh && this.t - lh.t <= 2500) {
        const vic = st.champions.get(lh.id);
        if (vic && vic.team === s.team && !vic.dead) { t = c; break; }
      }
    }
    // 2. Otherwise prioritize enemy minions in range
    if (!t) {
      let bd = rng2;
      for (const u of st.units.values()) {
        if (!u.alive || u.team === s.team || u.team === 'neutral' || u.kind === 'pet' || this._hiddenFrom(u, s.team)) continue;
        const dx = u.x - s.x, dy = u.y - s.y, d2 = dx * dx + dy * dy;
        if (d2 <= bd) { bd = d2; t = u; }
      }
    }
    // 3. Otherwise nearest enemy champion in range
    if (!t) {
      let bd = rng2;
      for (const c of st.champions.values()) {
        if (c.dead || c.team === s.team || this._hiddenFrom(c, s.team)) continue;
        const dx = c.x - s.x, dy = c.y - s.y, d2 = dx * dx + dy * dy;
        if (d2 <= bd) { bd = d2; t = c; }
      }
    }
    s.targetId = t ? t.id : '';
    if (!t) { s._rampId = ''; s._rampCount = 0; return; }
    if (this.t < s._atkAt) return;
    s._atkAt = this.t + R.TOWER.atkMs;
    let dmg = t.champ ? R.TOWER.dmgChamp : t.maxHp * R.TOWER.dmgMinionPctMaxHp;
    if (t.champ) {
      if (s._rampId === t.id) s._rampCount = Math.min(6, (s._rampCount || 0) + 1);
      else { s._rampId = t.id; s._rampCount = 0; }
      dmg *= 1 + s._rampCount * 0.25;
    } else {
      s._rampId = ''; s._rampCount = 0;
    }
    this._attack(s, t, dmg, true, true);
  }

  _champTick(c, dt) {
    const t = this.t;
    if (c.dead) { if (t >= c.respawnAt) this._respawn(c); return; }
    // Tower Heal Relics pickup (own team only, restores 18% HP + 15% Mana, 60s respawn)
    if (this.state.relics && (c.hp < c.maxHp - 5 || c.mana < c.maxMana - 5)) {
      for (const rl of this.state.relics) {
        if (rl.team !== c.team || rl.upAt > t) continue;
        const dx = c.x - rl.x, dy = c.y - rl.y;
        if (dx * dx + dy * dy <= 68 * 68) {
          rl.upAt = t + 60000;
          c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.18);
          c.mana = Math.min(c.maxMana, c.mana + c.maxMana * 0.15);
          this.emit('fx', { k: 'heal', x: Math.round(c.x), y: Math.round(c.y), r: 75 });
          break;
        }
      }
    }
    // buffs + shield + coffee + Blue/Red jungle buffs + regen
    let tags = Object.entries(c._buffs).filter(([, until]) => until > t).map(([k]) => k);
    if (c.recallUntil) tags.push('recall');
    if (c._coffeeUntil > t) { tags.push('coffee'); c.hp = Math.min(c.maxHp, c.hp + 160 / 6 * dt); c.mana = Math.min(c.maxMana, c.mana + 70 / 6 * dt); }
    if ((c._blueBuffUntil || 0) > t) { tags.push('blueBuff'); c.mana = Math.min(c.maxMana, c.mana + c.maxMana * 0.03 * dt); }
    if ((c._redBuffUntil || 0) > t) { tags.push('redBuff'); }
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
    const pfOn = (c._prefetchUntil || 0) > t;
    if (msOn !== !!c._msOn || pfOn !== !!c._pfOn) { c._msOn = msOn; c._pfOn = pfOn; this._recalc(c, false); }
    // Bush Hacker & Shadow Ops synergy transitions
    const inBush = !!c._bush;
    const augs = c.augments || [];
    if (inBush && !c._wasInBush && augs.includes('bush_hacker') && (c._augCd.bush_hacker || 0) <= t) {
      c._augCd.bush_hacker = t + 12000;
      for (const foe of this.state.champions.values()) {
        if (!foe.dead && foe.team !== c.team && dist(foe, c) <= 750) foe._revealUntil = Math.max(foe._revealUntil || 0, t + 2000);
      }
    }
    if (!inBush && c._wasInBush && augs.includes('bush_hacker') && augs.includes('ghost_protocol') && (c._augCd.shadow_ops || 0) <= t) {
      c._augCd.shadow_ops = t + 8000;
      c._spMsUntil = Math.max(c._spMsUntil || 0, t + 2000);
      c._spMsPct = Math.max(c._spMsPct || 0, 0.2);
      this._recalc(c, false);
    }
    c._wasInBush = inBush;
    const bstr = tags.join(',');
    if (bstr !== c.buffs) { c.buffs = bstr; this._recalc(c, false); }
    if (c.shield > 0 && t > c._shieldUntil) c.shield = 0;
    const inFountain = dist(c, this.world.fountain[c.team]) <= R.FOUNTAIN_RADIUS;
    const hpRate = inFountain ? R.FOUNTAIN_HEAL_PER_SEC : R.HP_REGEN_PCT_PER_SEC;
    c.hp = Math.min(c.maxHp, c.hp + c.maxHp * hpRate * dt * this._healMul(c));
    c.mana = Math.min(c.maxMana, c.mana + (c.maxMana * (inFountain ? R.FOUNTAIN_MANA_PER_SEC : R.MANA_REGEN_PCT_PER_SEC) + (c._manaRegen || 0)) * dt);
    if (t - this.state.startedAt > R.PASSIVE_GOLD_DELAY_MS) c._goldAcc = (c._goldAcc || 0) + R.PASSIVE_GOLD_PER_SEC * dt;
    if (c._goldAcc >= 1) { c.gold += Math.floor(c._goldAcc); c._goldAcc -= Math.floor(c._goldAcc); }
    if (c.recallUntil) {
      if (t >= c.recallUntil) { c.recallUntil = 0; const f = this.world.fountain[c.team]; c.x = f.x; c.y = f.y; c._order = null; this._placePet(c); }
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
    const f = this.world.fountain[c.team];
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

  _damage(target, raw, src, byPet = false, trueDmg = false, dmgType = 'physical') {
    if (!this._alive(target)) return 0;
    if (target.invulnerable || target.kind === 'pet') return 0;
    if (target.champ && (target._stasisUntil || 0) > this.t) return 0;
    if (src?.champ && target.champ && !byPet) src._lastChampHit = { id: target.id, t: this.t };
    const isMagic = dmgType === 'magic';
    let resist = isMagic
      ? (target.champ ? (target.mr || 30) : target.kind === 'tower' ? R.TOWER.armor : target.kind === 'core' ? R.CORE.armor : 0)
      : (target.champ ? target.armor : target.kind === 'tower' ? R.TOWER.armor : target.kind === 'core' ? R.CORE.armor : 0);
    if (!isMagic && target.champ && (target._tankUntil || 0) > this.t) resist += (target._tankStacks || 0) * 3;
    const shred = (target.champ && (target._auditUntil || 0) > this.t) ? 0.15 : 0;
    const pen = src?.champ ? (isMagic ? (src._mrPen || 0) : (src._armorPen || 0)) : 0;
    let dmg = trueDmg ? raw : R.damageAfterResist(raw, resist, shred, pen);
    const baseAfterResist = dmg;
    let didCrit = false;
    // Backdoor Protection, Deadline Siege Bonus & Crunch Time parity with TeamRoom
    if (isStruct(target)) {
      if (src?.champ) {
        const tm = src.team === 'blue' ? 'Blue' : 'Red';
        if (this.state[`buff${tm}`] && this.state[`buff${tm}Until`] > this.t) dmg *= 1 + (R.EPICS.deadline.buff?.structDmgPct || 0.2);
      }
      const crunch = (this.t - (this.state.startedAt || 0)) >= R.CRUNCH_MS;
      if (crunch) {
        dmg *= R.CRUNCH_STRUCT_MUL;
      } else {
        const bdR2 = R.BACKDOOR_RADIUS * R.BACKDOOR_RADIUS;
        let hasMinion = false;
        for (const u of this.state.units.values()) {
          if (!u.alive || u.team === target.team || u.team === 'neutral' || !R.MINIONS[u.kind]) continue;
          const dx = u.x - target.x, dy = u.y - target.y;
          if (dx * dx + dy * dy <= bdR2) { hasMinion = true; break; }
        }
        if (!hasMinion) dmg *= R.BACKDOOR_DAMAGE_MUL;
      }
    }
    if (src?.champ && !trueDmg) {
      const srcP = itemPassives(src.items);
      const roleP = championPassive(CHAMPIONS[src.champ])?.id;
      // Basic-attack & champion-specific passives
      if (!byPet) {
        src._atkCount = (src._atkCount || 0) + 1;
        didCrit = (srcP.has('crit3') && src._atkCount % 3 === 0) || (srcP.has('crit') && Math.random() < 0.2);
        if (didCrit) dmg *= 1.6;
        if (roleP === 'regression_mark') {
          if (src._lastTargetId === target.id) target._bugStacks = Math.min(4, (target._bugStacks || 0) + 1);
          else { src._lastTargetId = target.id; target._bugStacks = 1; }
          target._bugUntil = this.t + 5000;
          if (src._atkCount % 3 === 0) dmg *= 1.35;
        }
        // Zero Q vuln mark consumed by basic attack: +30% burst & -1.5s Q CD
        if (src.champ === 'zero' && target.champ && (target._vulnUntil || 0) > this.t) {
          target._vulnUntil = 0;
          dmg *= 1.3;
          src.cdQ = Math.max(this.t, (src.cdQ || 0) - 1500);
        }
        if (roleP === 'zero_day' && (src._bush || (this.t - (src._lastCombatAt || 0) > 4500))) dmg *= 1.3;
        if (roleP === 'servo_emp' && src._atkCount % 4 === 0 && !isStruct(target)) dmg += 40;
        if (roleP === 'swipe_combo' && src._swipeReady) { src._swipeReady = false; dmg *= 1.28; }
        if (roleP === 'slipstream' && (this.t - (src._lastCombatAt || 0) > 3500)) {
          dmg *= 1.25;
          if (target.champ) { target.slowUntil = Math.max(target.slowUntil || 0, this.t + 1200); target.slowPct = Math.max(target.slowPct || 0, 15); }
        }
        if (roleP === 'cache_hit') {
          if (src._lastTargetId === target.id) src._cacheStacks = Math.min(4, (src._cacheStacks || 0) + 1);
          else { src._lastTargetId = target.id; src._cacheStacks = 0; }
          dmg *= 1 + src._cacheStacks * 0.06;
          if (src._cacheStacks === 4 && (src.augments || []).includes('evo_cache_prefetch')) {
            this._damage(target, 45, src, true, false, 'magic');
            src._prefetchUntil = this.t + 2500;
            this._recalc(src, false);
          }
        }
      }
      if (srcP.has('execute') && target.maxHp > 0 && target.hp / target.maxHp < 0.35) dmg *= 1.15;
      if (srcP.has('overclock') && target.maxHp > 0 && target.hp / target.maxHp > 0.5) dmg *= 1.12;
      if (srcP.has('burn') && !isStruct(target)) dmg += 25;
      if (srcP.has('grievous') && target.champ) target._grievousUntil = this.t + 3000;
      if (roleP === 'hotfix_fury' && src.hp / Math.max(1, src.maxHp) < 0.5) dmg *= 1.12;
      if (roleP === 'pager_alert' && (target.campId || R.EPICS[target.kind])) dmg *= 1.25;
      // Code Augments (Combat + Team Synergy + Cleave)
      const augs = src.augments || [];
      if (augs.includes('execution_protocol') && target.maxHp > 0 && target.hp / target.maxHp < 0.25) dmg *= 1.14;
      if (augs.includes('crowd_control') && target.champ && ((target.stunnedUntil || 0) > this.t || (target.rootedUntil || 0) > this.t || (target.slowUntil || 0) > this.t)) dmg *= 1.15;
      if (augs.includes('coordinated_strike') && target._lastHitBy && target._lastHitBy.id !== src.id && target._lastHitBy.team === src.team && (this.t - target._lastHitBy.t < 3000)) dmg *= 1.12;
      if (!byPet && src._cleaveReady && augs.includes('evo_dev_cleave')) {
        src._cleaveReady = false;
        const cDmg = dmg * 0.4;
        this.state.units.forEach((u) => { if (u.alive && u.id !== target.id && u.team !== src.team && u.kind !== 'pet' && u.kind !== 'ward' && dist(u, target) <= 170) u.hp = Math.max(1, u.hp - cDmg); });
        this.state.champions.forEach((ch) => { if (!ch.dead && ch.id !== target.id && ch.team !== src.team && dist(ch, target) <= 170) ch.hp = Math.max(1, ch.hp - cDmg); });
      }
      target._lastHitBy = { id: src.id, team: src.team, t: this.t };
      src._lastCombatAt = this.t;
      // Cap total percentage amplification at 2.0x outside of critical strike & flat bonuses
      const ampCeiling = (didCrit ? baseAfterResist * 1.6 : baseAfterResist) * 2.0 + 40;
      dmg = Math.min(dmg, ampCeiling);
      // Red Buff on-hit slow + bonus burn damage
      if ((src._redBuffUntil || 0) > this.t && !isStruct(target)) {
        dmg += 18;
        if (target.champ) { target.slowUntil = Math.max(target.slowUntil || 0, this.t + 1500); target.slowPct = Math.max(target.slowPct || 0, 20); }
      }
    }
    if (target.champ) {
      const tgtP = itemPassives(target.items);
      const tgtRoleP = championPassive(CHAMPIONS[target.champ])?.id;
      if (tgtP.has('fortress')) dmg *= 0.9;
      if (tgtRoleP === 'brick_wall') {
        let nearAlly = false;
        for (const al of this.state.champions.values()) if (al.id !== target.id && al.team === target.team && !al.dead && dist(al, target) <= 450) { nearAlly = true; break; }
        if (!nearAlly) for (const st of this.state.structures.values()) if (st.alive && st.team === target.team && st.kind === 'tower' && dist(st, target) <= 600) { nearAlly = true; break; }
        if (nearAlly) dmg *= 0.9;
      }
      if (tgtRoleP === 'failover') { target._tankStacks = Math.min(5, (target._tankStacks || 0) + 1); target._tankUntil = this.t + 4000; }
      if (tgtP.has('thorns') && src && !isStruct(src) && !byPet && !trueDmg) {
        src.hp = Math.max(1, src.hp - dmg * 0.18);
      }
      if (tgtP.has('lifeline') && (target._lifelineCd || 0) <= this.t && (target.hp - dmg) / Math.max(1, target.maxHp) < 0.3) {
        target._lifelineCd = this.t + 45000;
        target.shield = Math.max(target.shield || 0, 260);
        target._shieldUntil = Math.max(target._shieldUntil || 0, this.t + 3000);
      }
      const tAugs = target.augments || [];
      if (tAugs.includes('last_stand')) {
        if ((target._lastStandUntil || 0) > this.t) dmg *= 0.85;
        else if ((target._augCd.last_stand || 0) <= this.t && (target.hp - dmg) / Math.max(1, target.maxHp) < 0.3) {
          target._augCd.last_stand = this.t + 45000;
          target._lastStandUntil = this.t + 3000;
          dmg *= 0.85;
        }
      }
      if (tAugs.includes('pair_shield')) {
        for (const al of this.state.champions.values()) {
          if (al.id !== target.id && al.team === target.team && !al.dead && dist(al, target) <= 450) { dmg *= 0.92; break; }
        }
      }
    }
    if (target.champ) {
      const hadShield = target.shield > 0;
      const shieldDmg = (src?.champ && itemPassives(src.items).has('anti_shield')) ? dmg * 1.5 : dmg;
      const absorbed = Math.min(target.shield, shieldDmg);
      target.shield -= absorbed;
      dmg = Math.max(0, dmg - Math.min(dmg, absorbed));
      // Stack W combo: shield breaking releases an AoE shockwave (80 + 40% armor)
      if (hadShield && target.shield <= 0 && target.champ === 'stack') {
        const waveDmg = 80 + (target.armor || 0) * 0.4;
        this.emit('fx', { k: 'circle', x: Math.round(target.x), y: Math.round(target.y), r: 190, delay: 0, color: 0x7ed957 });
        this.state.champions.forEach((foe) => { if (!foe.dead && foe.team !== target.team && dist(foe, target) <= 190) foe.hp = Math.max(1, foe.hp - waveDmg); });
      }
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
        const bounty = R.bountyBonus(target._streak || 0);
        const kAugs = killer.augments || [];
        const augGold = kAugs.includes('bug_bounty') ? 45 : 0;
        const totalGold = R.KILL_GOLD + (this._firstBlood ? 0 : R.FIRST_BLOOD_BONUS) + bounty + augGold;
        killer.kills++; killer._streak = (killer._streak || 0) + 1;
        killer.gold += totalGold;
        killer.xp += R.KILL_XP_BASE + R.KILL_XP_PER_VICTIM_LEVEL * target.level; this._levelCheck(killer);
        if (killer.team === 'blue') st.blueKills++; else st.redKills++;
        if (killer.id === this.localId) this.emit('gold', { n: totalGold, x: Math.round(target.x), y: Math.round(target.y) });
        if (kAugs.includes('emergency_patch')) {
          const mul = kAugs.includes('last_stand') && killer.hp / Math.max(1, killer.maxHp) < 0.35 ? 0.27 : 0.18;
          killer.hp = Math.min(killer.maxHp, killer.hp + Math.max(0, killer.maxHp - killer.hp) * mul);
        }
        if (kAugs.includes('evo_zero_reset') && (this.t - (killer._lastQAt || 0) <= 3000)) {
          killer.cdQ = Math.max(this.t, this.t + Math.round(Math.max(0, (killer.cdQ || 0) - this.t) * 0.5));
        }
        if (championPassive(CHAMPIONS[killer.champ])?.id === 'velocity_rush') {
          killer.hp = Math.min(killer.maxHp, killer.hp + 45);
          killer._spMsUntil = Math.max(killer._spMsUntil || 0, this.t + 2500); killer._spMsPct = Math.max(killer._spMsPct || 0, 0.25);
        }
        if (bounty > 0) this.emit('announce', { title: `💰 SHUTDOWN +${bounty}g`, sub: `${killer.name} ended ${target.name}'s streak`, color: '#ffd23f' });
        if (!this._firstBlood) { this._firstBlood = true; this.emit('announce', { title: '🩸 FIRST BLOOD', sub: `${killer.name} drew first blood`, color: '#ff5e5e' }); }
      }
      target._streak = 0;
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
    // AoV Jungle Blue / Red Buff on killing large jungle camps
    if (killer && target.kind === 'big' && target.campId) {
      const isBlueBuff = String(target.campId).includes('top') || target.y < 3000;
      if (isBlueBuff) {
        killer._blueBuffUntil = this.t + 75000;
        if (killer.id === this.localId) this.emit('announce', { title: '🔵 BLUE BUFF', sub: '+Mana Regen · +CDR (75s)', color: '#39c2ff' });
      } else {
        killer._redBuffUntil = this.t + 75000;
        if (killer.id === this.localId) this.emit('announce', { title: '🔴 RED BUFF', sub: '+On-hit Burn & Slow (75s)', color: '#ff5e5e' });
      }
    }
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
        const kAugs = killer.augments || [];
        const minionBonus = (kAugs.includes('efficient_farming') && R.MINIONS[target.kind]) ? 5 : 0;
        const jungleBonus = (kAugs.includes('jungle_contract') && (target.kind === 'big' || R.EPICS[target.kind])) ? 35 : 0;
        const totalUnitGold = gold + minionBonus + jungleBonus;
        killer.gold += totalUnitGold; killer.cs++;
        if (championPassive(CHAMPIONS[killer.champ])?.id === 'clean_sweep' && !killer.dead) {
          killer.hp = Math.min(killer.maxHp, killer.hp + 25);
          killer.mana = Math.min(killer.maxMana, killer.mana + 20);
        }
        if (killer.id === this.localId) this.emit('gold', { n: totalUnitGold, x: Math.round(target.x), y: Math.round(target.y) });
      }
    }
    // XP to nearby enemy champions
    const near = [...st.champions.values()].filter((c) => !c.dead && c.team !== target.team && dist(c, target) <= R.XP_SHARE_RADIUS);
    for (const c of near) {
      let xpGain = Math.round((sp.xp || 30) / near.length);
      if (c.augments?.includes('jungle_contract') && (target.kind === 'big' || R.EPICS[target.kind])) xpGain = Math.round(xpGain * 1.15);
      c.xp += xpGain;
      this._levelCheck(c);
    }
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
    if (lv > c.level) {
      c.skillPoints = (c.skillPoints || 0) + (lv - c.level);
      c.level = lv;
      if (c.isBot) this._autoSpendSkills(c);
      this._checkAugmentOffer(c);
      this._recalc(c, false);
    }
  }

  _checkAugmentOffer(c) {
    if (!c || c.augmentOffer) return;
    const nextLv = AUGMENT_LEVELS[c._augNextIdx || 0];
    if (!nextLv || c.level < nextLv) return;
    const choices = rollAugmentChoices(c.champ, c.augments, 3, { guaranteeEpic: nextLv === 10 });
    if (!choices.length) return;
    c._augNextIdx = (c._augNextIdx || 0) + 1;
    if (c.isBot) {
      c.augments.push(choices[0]);
      return;
    }
    c.augmentOffer = { level: nextLv, choices, rerolls: 1 };
    if (c.id === this.localId) this.emit('announce', { title: `⚡ CODE AUGMENT (Lv ${nextLv})`, sub: 'Pick 1 of 3 permanent upgrades', color: '#ffd23f' });
  }

  _pickAugment(c, id) {
    if (!c?.augmentOffer || !AUGMENTS[id] || !c.augmentOffer.choices.includes(id)) return;
    c.augments.push(id);
    c.augmentOffer = null;
    this._recalc(c, false);
    this._checkAugmentOffer(c); // in case player jumped multiple milestone levels
  }

  _rerollAugment(c, slot) {
    if (!c?.augmentOffer) return;
    if (Number.isInteger(slot) && slot >= 0 && slot < c.augmentOffer.choices.length) {
      const srr = c.augmentOffer.slotRerolls || [];
      if (!(srr[slot] > 0)) return;
      const nextId = rollSingleAugment(c.champ, c.augments, c.augmentOffer.choices);
      if (!nextId) return;
      const choices = [...c.augmentOffer.choices];
      const slotRerolls = [...srr];
      choices[slot] = nextId;
      slotRerolls[slot] = 0;
      c.augmentOffer = { ...c.augmentOffer, choices, slotRerolls };
      return;
    }
    if (!(c.augmentOffer.rerolls > 0)) return;
    const choices = rollAugmentChoices(c.champ, c.augments, 3, { guaranteeEpic: c.augmentOffer.level === 10 });
    if (choices.length) c.augmentOffer = { ...c.augmentOffer, choices, rerolls: c.augmentOffer.rerolls - 1 };
  }

  _upgradeSkill(c, slot) {
    if (!c || !['q', 'w', 'e', 'r'].includes(slot) || !(c.skillPoints > 0)) return false;
    const maxR = slot === 'r' ? 3 : 5;
    if (slot === 'r' && c.level < R.ULT_UNLOCK_LEVEL) return false;
    const cur = c.ranks?.[slot] || 0;
    if (cur >= maxR) return false;
    c.ranks[slot] = cur + 1;
    c.skillPoints--;
    return true;
  }

  _useActiveItem(c) {
    if (!c || c.dead) return;
    const it = ownedActiveItem(c.items);
    if (!it || !it.active || (c._activeCd || 0) > this.t) return;
    const act = it.active;
    if (c.stunnedUntil > this.t && !act.usableWhileStunned) return;
    c._activeCd = this.t + act.cd * 1000;
    if (act.id === 'stasis') {
      c._stasisUntil = this.t + act.ms;
      c.stunnedUntil = Math.max(c.stunnedUntil || 0, this.t + act.ms);
      c._order = null;
      this.emit('fx', { k: 'buff', sid: c.id, color: 0xffd23f });
      if (c.id === this.localId) this.emit('announce', { title: '⏸️ STASIS (2s)', color: '#ffd23f' });
    } else if (act.id === 'cleanse') {
      c.stunnedUntil = 0; c.rootedUntil = 0; c.slowUntil = 0; c.slowPct = 0;
      c._spMsUntil = Math.max(c._spMsUntil || 0, this.t + act.ms); c._spMsPct = Math.max(c._spMsPct || 0, 0.35);
      this.emit('fx', { k: 'buff', sid: c.id, color: 0x39ff14 });
      if (c.id === this.localId) this.emit('announce', { title: '↩️ CLEANSED', color: '#39ff14' });
    } else if (act.id === 'veil') {
      c.shield = (c.shield || 0) + (act.shield || 240);
      c._shieldUntil = Math.max(c._shieldUntil || 0, this.t + 3000);
      c._spMsUntil = Math.max(c._spMsUntil || 0, this.t + act.ms); c._spMsPct = Math.max(c._spMsPct || 0, 0.3);
      c._stealthUntil = this.t + act.ms;
      this.emit('fx', { k: 'buff', sid: c.id, color: 0xb084ff });
      if (c.id === this.localId) this.emit('announce', { title: '🕶️ SHADOW VEIL', color: '#b084ff' });
    }
  }

  _placeWard(c, m) {
    if (!c || c.dead || (c._wardCd || 0) > this.t) return;
    const tx = Number.isFinite(m?.x) ? m.x : c.x, ty = Number.isFinite(m?.y) ? m.y : c.y;
    const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy) || 1;
    const r = Math.min(d, R.WARD.castRange);
    const pos = this.world.clampToMap(c.x + (dx / d) * r, c.y + (dy / d) * r);
    const liveWards = [];
    this.state.units.forEach((u) => { if (u.alive && u.kind === 'ward' && u.owner === c.id) liveWards.push(u); });
    if (liveWards.length >= R.WARD.maxActivePerPlayer) {
      liveWards.sort((a, b) => (a._expiresAt || 0) - (b._expiresAt || 0));
      liveWards[0].alive = false;
    }
    const id = this._addUnit({ team: c.team, kind: 'ward', x: pos.x, y: pos.y, hp: 3, owner: c.id });
    const w = this.state.units.get(id);
    if (w) w._expiresAt = this.t + R.WARD.durationMs;
    c._wardCd = this.t + R.WARD.cdMs;
    this.emit('fx', { k: 'circle', x: Math.round(pos.x), y: Math.round(pos.y), r: 120, delay: 0, color: 0x39ff14 });
    if (c.id === this.localId) this.emit('announce', { title: '👁️ WARD PLACED (45s)', color: '#39ff14' });
  }

  _autoSpendSkills(c) {
    const order = ['r', 'q', 'w', 'e'];
    while ((c.skillPoints || 0) > 0) {
      let spent = false;
      for (const sl of order) { if (this._upgradeSkill(c, sl)) { spent = true; break; } }
      if (!spent) break;
    }
  }

  _respawn(c) {
    const f = this.world.fountain[c.team];
    c.dead = false; c.x = f.x; c.y = f.y; c.hp = c.maxHp; c.mana = c.maxMana; c.action = 'idle'; c.action_seq++;
    c._nav = null;
    this._spawnPet(c);
  }

  _cancelRecall(c) { if (c.recallUntil) c.recallUntil = 0; }

  _recall(c) {
    if (c.dead || c.recallUntil) return;
    const dur = c.augments?.includes('recall_opt') ? Math.round(R.RECALL_MS * 0.65) : R.RECALL_MS;
    c.recallUntil = this.t + dur; c._order = null; c.targetId = ''; c.action = 'recall'; c.action_seq++;
  }

  _buy(c, id) {
    const it = ITEMS[id];
    if (!it) return;
    const inFountain = dist(c, this.world.fountain[c.team]) <= R.FOUNTAIN_RADIUS;
    const plan = recipePlan(c.items, id);
    const payCost = it.consumable ? it.cost : plan.cost;
    if (!(inFountain || c.dead) || c.gold < payCost || buyBlocker(c.items, id)) return;
    if (it.consumable) { c.gold -= payCost; c._coffeeUntil = this.t + (it.effect?.ms || 6000); return; }
    const res = applyBuy(c.items, (c._boughtAt ||= []), id, this.t);
    if (!res.ok) return;
    c.gold -= res.cost;
    this._recalc(c, false);
  }

  /** Pass 2 RP-07: sell (same rules as the server — rules.sellValue). */
  _sell(c, slot) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= R.INVENTORY_SLOTS) return;
    const id = c.items[slot], it = id && ITEMS[id];
    if (!it) return;
    const inFountain = dist(c, this.world.fountain[c.team]) <= R.FOUNTAIN_RADIUS;
    if (!(inFountain || c.dead)) return;
    c.gold += R.sellValue(it.cost, (c._boughtAt || [])[slot] || 0, this.t);
    c.items[slot] = '';
    if (c._boughtAt) c._boughtAt[slot] = 0;
    this._recalc(c, false);
  }

  /** Knockback `dist` px straight away from (fx, fy), stopped by walls; into a wall → wallStun. */
  _knock(e, fx0, fy0, distPx, wallStunMs) {
    if (!e || isStruct(e) || R.EPICS[e.kind] || e.kind === 'pet' || !this._alive(e)) return;
    const dx = e.x - fx0, dy = e.y - fy0, d = Math.hypot(dx, dy);
    const ux = d > 1 ? dx / d : 1, uy = d > 1 ? dy / d : 0;
    const goal = this.world.clampToMap(e.x + ux * distPx, e.y + uy * distPx);
    const r = this._navR(e) || MINION_RADIUS;
    const end = this.nav.clipMove(e.x, e.y, goal.x, goal.y, r);
    const wall = !!end.hit;
    const x0 = e.x, y0 = e.y;
    e.x = end.x; e.y = end.y;
    if (e.champ) {
      e._dispUntil = this.t + R.KNOCKBACK_MS; e._nav = null; // like the server: the move order survives this._cancelRecall(e);
      if (wall && wallStunMs) {
        const ws = e.champ ? R.applyHardCcDuration(e, wallStunMs, this.t) : wallStunMs;
        if (ws > 0) e.stunnedUntil = Math.max(e.stunnedUntil, this.t + R.KNOCKBACK_MS + ws);
      }
    }
    this.emit('fx', { k: 'knock', id: e.id, x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(e.x), y1: Math.round(e.y), ms: R.KNOCKBACK_MS, wall });
  }

  /** Generic skill engine for the skill types (mirrors the contract's fx). */
  _cast(c, m) {
    const slot = m.slot, sk = CHAMPIONS[c.champ].skills[slot], t = this.t;
    if (!sk || c.dead || c.stunnedUntil > t || c._dispUntil > t) return;
    if (slot === 'r' && c.level < R.ULT_UNLOCK_LEVEL) return;
    const rank = c.ranks?.[slot] || 0;
    if (rank <= 0) return;
    const key = `cd${slot.toUpperCase()}`;
    if (c[key] > t || c.mana < sk.mana) return;
    if (m.id && this._hiddenFrom(this._ent(m.id), c.team)) return; // point-and-click at a hidden enemy
    this._reveal(c);
    const blueCdr = (c._blueBuffUntil || 0) > t ? 0.15 : 0;
    let rankDmgMul = 1 + (rank - 1) * 0.12;
    c.mana -= sk.mana; c[key] = t + R.skillCooldownMs(sk.cd, (c._haste || 0) + blueCdr, rank);
    c.action = slot; c.action_seq++;
    this._cancelRecall(c);
    const roleP = championPassive(CHAMPIONS[c.champ])?.id;
    const srcP = itemPassives(c.items);
    const augs = c.augments || [];
    c._castCount = (c._castCount || 0) + 1;
    if (slot === 'q') c._lastQAt = t;
    if (augs.includes('evo_dev_cleave')) c._cleaveReady = true;
    if (augs.includes('evo_sprint_surge') && (sk.type === 'dash' || sk.type === 'blink')) {
      c._spMsUntil = Math.max(c._spMsUntil || 0, t + 2000); c._spMsPct = Math.max(c._spMsPct || 0, 0.25);
    }
    const isOverload = augs.includes('overload') && c._castCount % 4 === 0;
    if (isOverload) rankDmgMul *= 1.28;
    if (roleP === 'syntax_surge') { c._spMsUntil = Math.max(c._spMsUntil || 0, t + 1500); c._spMsPct = Math.max(c._spMsPct || 0, 0.12); }
    if (roleP === 'swipe_combo') c._swipeReady = true;
    if (roleP === 'uptime_pulse' && (sk.heal || sk.shield || sk.type === 'allies')) {
      c.cdR = Math.max(t, (c.cdR || 0) - 2000);
      c._spMsUntil = Math.max(c._spMsUntil || 0, t + 1500); c._spMsPct = Math.max(c._spMsPct || 0, 0.15);
    }
    if ((sk.heal || sk.shield || sk.type === 'allies') && augs.includes('shared_resources')) {
      c.hp = Math.min(c.maxHp, c.hp + 40);
    }
    if ((sk.heal || sk.type === 'allies') && augs.includes('evo_ops_field')) {
      this.state.champions.forEach((al) => { if (al.team === c.team && !al.dead && dist(al, c) <= 450) al.hp = Math.min(al.maxHp, al.hp + 70); });
    }
    if (roleP === 'caffeine_brew' && c._castCount % 2 === 0) {
      c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.06);
      let nearAl = null, nearD = 500;
      this.state.champions.forEach((al) => {
        if (al.id !== c.id && al.team === c.team && !al.dead) {
          const d = dist(al, c);
          if (d < nearD) { nearD = d; nearAl = al; }
        }
      });
      if (nearAl) nearAl.hp = Math.min(nearAl.maxHp, nearAl.hp + nearAl.maxHp * 0.06);
      this.emit('fx', { k: 'heal', x: Math.round(c.x), y: Math.round(c.y), r: 70 });
    }
    if (roleP === 'gradient_stack') {
      if ((c._gradUntil || 0) > t) c._gradStacks = Math.min(3, (c._gradStacks || 0) + 1);
      else c._gradStacks = 0;
      c._gradUntil = t + 4000;
      rankDmgMul *= 1 + c._gradStacks * 0.1;
    }
    if (c.champ === 'pixel' && slot === 'e') c._empowerUntil = t + 3500;
    if (c.champ === 'model' && slot === 'w') c._overfitUntil = t + 4500;
    if ((c._empowerUntil || 0) > t && (slot === 'q' || slot === 'r')) { c._empowerUntil = 0; rankDmgMul *= 1.2; }
    if ((c._overfitUntil || 0) > t && (slot === 'q' || slot === 'r')) { c._overfitUntil = 0; rankDmgMul *= 1.2; }
    if (slot === 'r' && c.champ === 'embedded' && augs.includes('evo_volt_overdrive')) c._servoOverdriveUntil = t + 4000;
    const skDmgType = skillDamageType(sk);
    const amt = (spec) => R.scaledAmount(spec, c.level, c.ad, c.ap, c.maxHp) * rankDmgMul;
    const fx = (p) => this.emit('fx', p);
    const effects = (e) => {
      if (!e.champ) return;
      // Champion Skill Combo Marks & Detonations
      if (c.champ === 'pixel' && slot === 'q') e._pixelMarkUntil = t + 4000;
      if (c.champ === 'pixel' && slot === 'r' && (e._pixelMarkUntil || 0) > t) { e._pixelMarkUntil = 0; this._damage(e, amt(sk.dmg) * 0.25, c, false, true, 'true'); }
      if (c.champ === 'zero' && slot === 'q') e._vulnUntil = t + 4000;
      if (c.champ === 'zero' && slot === 'e' && (e._vulnUntil || 0) > t) { e._vulnUntil = 0; this._damage(e, amt(sk.dmg) * 0.3, c, false, true, 'true'); c.cdQ = Math.max(t, (c.cdQ || 0) - 1500); }
      if (c.champ === 'tester' && slot === 'r' && (e._bugUntil || 0) > t && (e._bugStacks || 0) > 0) {
        const bonus = amt(sk.dmg) * 0.12 * e._bugStacks; e._bugStacks = 0;
        this._damage(e, bonus, c, false, true, 'true');
      }
      // CC Diminishing Returns: 1.0x -> 0.50x -> 0.25x within 4s window + 2.0s chain immunity
      if (sk.slow) { e.slowUntil = t + sk.slow.ms; e.slowPct = Math.round(sk.slow.pct * 100); }
      if (srcP.has('frost')) { e.slowUntil = Math.max(e.slowUntil || 0, t + 1500); e.slowPct = Math.max(e.slowPct || 0, 25); }
      if (roleP === 'strict_audit') e._auditUntil = t + 2000;
      if (sk.root) {
        const rms = e.champ ? R.applyHardCcDuration(e, sk.root.ms, t) : sk.root.ms;
        if (rms > 0) e.rootedUntil = Math.max(e.rootedUntil || 0, t + rms);
      }
      if (sk.stun) {
        const sms = e.champ ? R.applyHardCcDuration(e, sk.stun.ms, t) : sk.stun.ms;
        if (sms > 0) e.stunnedUntil = Math.max(e.stunnedUntil || 0, t + sms);
      }
      if (roleP === 'syntax_surge') c.mana = Math.min(c.maxMana, c.mana + c.maxMana * 0.04);
      // Augment skill-hit procs
      if (augs.includes('chain_reaction') && ((c._augCd.chain_reaction || 0) <= t || isOverload)) {
        if (!isOverload) c._augCd.chain_reaction = t + 6000;
        fx({ k: 'circle', x: Math.round(e.x), y: Math.round(e.y), r: 140, delay: 0, color: 0xff9f43 });
        this.state.champions.forEach((foe) => { if (!foe.dead && foe.team !== c.team && dist(foe, e) <= 140) this._damage(foe, 55, c, false, false, 'magic'); });
      }
      if (slot === 'q' && augs.includes('evo_pixel_split')) {
        let n = 0;
        this.state.champions.forEach((foe) => { if (n < 2 && foe.id !== e.id && !foe.dead && foe.team !== c.team && dist(foe, e) <= 260) { n++; this._damage(foe, amt(sk.dmg) * 0.45, c, false, false, skDmgType); } });
      }
      if (slot === 'r' && augs.includes('evo_stack_lock')) { c.shield = (c.shield || 0) + 140; c._shieldUntil = Math.max(c._shieldUntil || 0, t + 3500); }
      if (slot === 'r' && augs.includes('evo_tester_barrage')) { c.cdR = Math.max(t, t + Math.round(Math.max(0, (c.cdR || 0) - t) * 0.65)); }
      if (slot === 'r' && augs.includes('evo_model_nova')) { e.slowUntil = Math.max(e.slowUntil || 0, t + 2500); e.slowPct = Math.max(e.slowPct || 0, 30); e._auditUntil = t + 2500; }
    };
    const hit = (e, extra = 0, from = null) => {
      this._damage(e, amt(sk.dmg) + extra, c, false, false, skDmgType); effects(e); fx({ k: 'hit', id: e.id, color: sk.color });
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
      return this.world.clampToMap(c.x + (dx / d) * r, c.y + (dy / d) * r);
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
          const hits = enemies((e) => !hitSet.has(e.id) && (!sk.champOnly || this._champTargetOk(e)) && distToSeg(e.x, e.y, c.x, c.y, x1, y1) <= sk.width / 2 + this._radius(e))
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
        if (e && e.kind !== 'pet' && this._alive(e) && e.team !== c.team && (sk.targets !== 'enemyChamp' || this._champTargetOk(e)) && dist(c, e) <= sk.range + 80) {
          hit(e, sk.execute ? sk.execute.missingHpPct * (e.maxHp - e.hp) : 0, { x: c.x, y: c.y });
        }
        break;
      }
      case 'dash': {
        const x0 = c.x, y0 = c.y, tgt = sk.toTarget ? this._ent(m.id) : null;
        const okT = !!tgt && tgt.kind !== 'pet' && this._alive(tgt) && tgt.team !== c.team && !isStruct(tgt)
          && (sk.targets !== 'enemyChamp' || this._champTargetOk(tgt)) && dist(c, tgt) <= sk.range + 100;
        let want;
        if (okT) {   // like the server: stop at contact, and only the target is hit
          const d = dist(c, tgt) || 1, reach = Math.max(0, Math.min(sk.range, d - (this._radius(tgt) + CHAMP_RADIUS)));
          want = this.world.clampToMap(x0 + ((tgt.x - x0) / d) * reach, y0 + ((tgt.y - y0) / d) * reach);
        } else want = towardRange(sk.range);
        const p = this.nav.clipMove(x0, y0, want.x, want.y, CHAMP_RADIUS); // dashes stop at walls
        let end = p, struck = [];
        if (okT) {
          if (dist(p, tgt) <= this._radius(tgt) + CHAMP_RADIUS + Math.max(sk.hitRadius || 0, 40)) struck = [tgt];
        } else if (sk.hitRadius) {
          struck = enemies((e) => distToSeg(e.x, e.y, x0, y0, p.x, p.y) <= sk.hitRadius + this._radius(e))
            .sort((a, b) => dist(a, c) - dist(b, c));
          const first = struck[0];
          if (first && sk.stopAtFirst) {
            struck = [first];
            const d = dist(c, first) || 1;
            end = this.nav.clipMove(x0, y0, first.x - ((first.x - x0) / d) * 50, first.y - ((first.y - y0) / d) * 50, CHAMP_RADIUS);
          }
        }
        c.x = end.x; c.y = end.y; c._order = null; c._nav = null;
        fx({ k: 'dash', sid: c.id, x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(c.x), y1: Math.round(c.y), color: sk.color });
        if (sk.dmg) for (const e of struck) hit(e, 0, { x: c.x, y: c.y });
        break;
      }
      case 'blink': {
        const x0 = c.x, y0 = c.y, tr = towardRange(sk.range), p = this.nav.nearestFree(tr.x, tr.y, CHAMP_RADIUS); // blinks land on the nearest free spot
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
  /** May a `targets: 'enemyChamp'` skill hit `e`? (Story Mode 2.0 lets it hit bugs and nests.) */
  _champTargetOk(e) { return !!e.champ; }

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
        const aim = this.world.clampToMap(c.x + (dx / d) * r, c.y + (dy / d) * r);
        const p = this.nav.nearestFree(aim.x, aim.y, CHAMP_RADIUS); // crosses walls
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
    if (c.augments?.includes('flash_cache')) {
      c._spMsUntil = Math.max(c._spMsUntil || 0, t + 2000);
      c._spMsPct = Math.max(c._spMsPct || 0, 0.25);
      this._recalc(c, false);
    }
    this._cancelRecall(c);
    return true;
  }

  /** Bots: rough, sensible summoner spell use. Returns true if the bot's think tick is used up. */
  _botSpells(c) {
    const t = this.t, f = this.world.fountain[c.team];
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

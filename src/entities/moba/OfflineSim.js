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
import {
  CHAMPIONS, ROLE_ORDER, ROLE_PICKS, championPassive, skillDamageType, KIT_TUNING as K, resolveSkill, defaultStance, nextStance,
  CC_TUNING as CCT, CC_TYPES, CC_PRIORITY,
} from '../../../shared/moba/champions.js';
import { ITEMS, buyBlocker, itemStats, itemPassives, ownedActiveItem, recipePlan, applyBuy } from '../../../shared/moba/items.js';
import { AUGMENT_LEVELS, AUGMENTS, rollAugmentChoices, rollSingleAugment } from '../../../shared/moba/augments.js';
import {
  STRUCTURES, CAMPS, EPIC_SPOTS, STRUCTURE_RADIUS, CHAMP_RADIUS, MINION_RADIUS, laneFor, unlockedBy, distToSeg,
} from '../../../shared/moba/map.js';
import { SPELLS, DEFAULT_SPELLS, ROLE_SPELLS, validSpellPair, spellCooldownMs, spellInitialCharges } from '../../../shared/moba/spells.js';
import { WORLD_5V5 } from './world.js';

const BOT_NAMES = ['Ada', 'Linus', 'Grace', 'Ken', 'Barbara', 'Dennis', 'Margaret', 'Guido', 'Bjarne', 'Yuki'];
const LANE_OF_ROLE = { top: 'top', mid: 'mid', bot: 'bot', support: 'bot', jungle: null };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ENEMY = { blue: 'red', red: 'blue' };
const PET_R = 18;
const isStruct = (e) => e.kind === 'tower' || e.kind === 'core';
const clamp01 = (v) => Math.max(0, Math.min(1, v));
/** v6: multiply every numeric field of an amount spec (dmg / heal / shield) by k. */
const scaleAmt = (a, k) => { if (!a) return a; const o = {}; for (const key of Object.keys(a)) o[key] = a[key] * k; return o; };
/** Skill type -> OfflineSim method (ctx, dispatch). Mirrors the server's handler registry; add new primitives here. */
const KIT_HANDLERS = {
  place: '_place', rewind: '_rewind', summon: '_summon', reload: '_reloadStart',
  deliver: '_deliver', serve: '_serve', resolve: '_resolve', objcmd: '_objcmd',
  cone: '_cone', line: '_line', arc: '_arc', // v6.1 delivery shapes
};
/** v6.1 CC spec key -> unit field (the CC_TYPES key equals the spec key). Handlers run in this order. */
const CC_FIELD = { airborne: 'airUntil', charm: 'charmUntil', fear: 'fearUntil', taunt: 'tauntUntil', blind: 'blindUntil', disarm: 'disarmUntil', suppress: 'suppressUntil' };
const CC_KEYS = Object.keys(CC_FIELD);
/** CC_TYPES key -> field that makes the `cc:<tag>` buff tag active. */
const CC_TAG_FIELD = { ...CC_FIELD, untarget: '_untargetUntil', revive: '_reviveUntil' };
/** v6.1: skill types whose `self{}` block is applied to the caster at cast start. */
const SELF_TYPES = new Set(['circle', 'zone', 'cone', 'line', 'arc']);
/** Smallest signed angle (rad) from a to b, in [-PI, PI]. */
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2; return d; };

export class OfflineSim {
  constructor({ champ, name, emit, lobbyMs = 0, spells = null, allies = null, enemies = null, hat = '', world = null, sandbox = false }) {
    this.localId = 'me';
    this._emitRaw = emit; // unfiltered channel (gping goes to BOTH teams even when the caster is in fog)
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
    this.sandbox = !!sandbox;
    this.noCd = this.sandbox;    // Sandbox practice: 0s cooldowns for local player (toggleable)
    this.noMana = this.sandbox;  // Sandbox practice: 0 mana cost for local player (toggleable)
    this.godMode = this.sandbox; // Sandbox practice: 0 HP damage taken for local player (toggleable)
    this._uid = 0;
    this._wave = 0;
    this._waveAt = 0;
    this._atk = [];
    this._timers = [];
    this._traps = [];
    this._objs = [];     // v6 placed objects (fx-only objects + obj units): see _objAdd
    this._objAt = 0;
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
    me.chargesD = spellInitialCharges(me.spellD); me.chargesF = spellInitialCharges(me.spellF);
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
      if (this._orderLocked(me)) return; // v6.1: charm / fear / taunt / suppress / airborne drive the unit
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
    else if (type === 'switchChamp') this._switchChamp(me, m?.champ);
    else if (type === 'setNoCd') this._setNoCd(me, m?.enabled);
    else if (type === 'setNoMana') this._setNoMana(me, m?.enabled);
    else if (type === 'setGodMode') this._setGodMode(me, m?.enabled);
    else if (type === 'spawnDummy') this._spawnDummy(me);
    else if (type === 'clearDummies') this._clearDummies();
  }

  _setNoCd(me, enabled) {
    this.noCd = enabled !== false;
    if (this.noCd && me) this.debug('ready');
    return this.noCd;
  }

  _setNoMana(me, enabled) {
    this.noMana = enabled !== false;
    if (this.noMana && me) me.mana = me.maxMana;
    return this.noMana;
  }

  _setGodMode(me, enabled) {
    this.godMode = enabled !== false;
    if (this.godMode && me && !me.dead) me.hp = me.maxHp;
    return this.godMode;
  }

  _switchChamp(me, champId) {
    if (!me || !CHAMPIONS[champId]) return false;
    this._despawnPet(me);
    this._cancelRecall(me);
    this._traps = this._traps.filter((tp) => {
      if (tp.ownerId !== me.id) return true;
      this.emit('fx', { k: 'trapEnd', tid: tp.tid });
      return false;
    });
    const changing = me.champ !== champId;
    this._kitDown(me);
    this._objClearOwner(me.id);
    me.champ = champId;
    me.dead = false; me.respawnAt = 0;
    me.stunnedUntil = 0; me.rootedUntil = 0; me.slowUntil = 0; me.slowPct = 0; me.silencedUntil = 0; me._recast = {}; me._marks = {};
    me._dispUntil = 0; me._stealthUntil = 0; me._spellShieldUntil = 0;
    me._order = null; me._nav = null; me.targetId = '';
    me._buffs = {}; me.shield = 0; me._shieldUntil = 0;
    me._ext = {}; me._droneId = null;
    this._kitInit(me);
    me._castCount = 0; me._cacheStacks = 0; me._swipeReady = false; me._cleaveReady = false;
    me.ranks = {
      q: Math.max(1, me.ranks?.q || 1),
      w: Math.max(1, me.ranks?.w || 1),
      e: Math.max(1, me.ranks?.e || 1),
      r: me.level >= R.ULT_UNLOCK_LEVEL ? Math.max(1, me.ranks?.r || 0) : (me.ranks?.r || 0),
    };
    this.debug('ready');
    this._recalc(me, true);
    this._spawnPet(me);
    if (changing) {
      const def = CHAMPIONS[champId];
      this.emit('announce', { title: `🔄 ${def.name.toUpperCase()}`, sub: `${def.title || def.lane} · Offline Practice`, color: '#39c2ff' });
    }
    return true;
  }

  debug(cmd, a, b) {
    const me = this.state.champions.get(this.localId), st = this.state;
    if (cmd === 'level') { const before = me.level; me.level = Math.max(1, Math.min(R.MAX_LEVEL, a | 0)); me.xp = R.XP_TABLE[me.level - 1]; me.skillPoints = (me.skillPoints || 0) + Math.max(0, me.level - before); this._recalc(me, true); }
    else if (cmd === 'gold') me.gold += a | 0;
    else if (cmd === 'tp') { me.x = a; me.y = b; me._order = null; }
    else if (cmd === 'kill') this._kill(me, null);
    else if (cmd === 'end') { st.phase = 'ended'; st.winner = a || 'blue'; }
    else if (cmd === 'fight') { // pull a few red champions next to you
      let i = 0;
      st.champions.forEach((c) => { if (c.team === 'red' && i < 3) { c.x = me.x + 260 + i * 70; c.y = me.y - 120 + i * 90; c.dead = false; i++; } });
    }
    else if (cmd === 'ready') {
      me.cdQ = me.cdR = me.cdW = me.cdE = me.cdD = me.cdF = 0;
      me.chargesD = spellInitialCharges(me.spellD); me.chargesF = spellInitialCharges(me.spellF);
      me._spellRechD = me._spellRechF = me._spellCastCdD = me._spellCastCdF = 0;
      me._activeCd = 0; me._wardCd = 0;
      me.mana = me.maxMana;
    }
    else if (cmd === 'champ') return this._switchChamp(me, a);
    else if (cmd === 'noCd') return this._setNoCd(me, a);
    else if (cmd === 'noMana') return this._setNoMana(me, a);
    else if (cmd === 'godMode') return this._setGodMode(me, a);
    else if (cmd === 'spell') {
      const K = a?.slot === 'f' ? 'F' : 'D';
      me['cd' + K] = 0; me['_spellCastCd' + K] = 0;
      if (SPELLS[me['spell' + K]]?.maxCharges > 1 && !(me['charges' + K] > 0)) me['charges' + K] = 1;
      this._spell(me, { slot: K.toLowerCase(), x: a?.x, y: a?.y, id: a?.id });
    }
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
      spellF: (ROLE_SPELLS[role || def.lane] || DEFAULT_SPELLS)[1], cdD: 0, cdF: 0,
      chargesD: 0, chargesF: 0, _spellRechD: 0, _spellRechF: 0, _spellCastCdD: 0, _spellCastCdF: 0,
      stunnedUntil: 0, rootedUntil: 0, slowUntil: 0, slowPct: 0, shield: 0, buffs: '',
      recallUntil: 0, action: 'idle', action_seq: 0, targetId: '', hat: '',
      _order: null, _atkAt: 0, _role: role || def.lane, _buffs: {}, _shieldUntil: 0, _thinkAt: 0, _coffeeUntil: 0,
      _ghostUntil: 0, _spMsUntil: 0, _spMsPct: 0, _ignite: null, _atkCount: 0, _tankStacks: 0, _tankUntil: 0, _lifelineCd: 0, _grievousUntil: 0,
      _streak: 0, _activeCd: 0, _stasisUntil: 0, _castCount: 0, _lastTargetId: '', _cacheStacks: 0, _swipeReady: false, _gradStacks: 0, _gradUntil: 0, _auditUntil: 0,
      _mrPen: 0, _manaRegen: 0, _ccChainCount: 0, _ccChainUntil: 0, _ccImmuneUntil: 0, _wardCd: 0, _stealthUntil: 0, _servoOverdriveUntil: 0, _prefetchUntil: 0,
      augments: [], augmentOffer: null, _augNextIdx: 0, _augCd: {}, _lastQAt: 0, _cleaveReady: false, _lastStandUntil: 0, _wasInBush: false,
    };
    this._kitInit(c);
    if (isBot) this._autoSpendSkills(c);
    c.chargesD = spellInitialCharges(c.spellD);
    c.chargesF = spellInitialCharges(c.spellF);
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
    let msMul = 1, asBuff = 0;
    // v6: the buff object of a slot buff is stored at cast time (_bx) because stances / serve outcomes replace the base spec.
    const addBuff = (bf) => { if (!bf) return; msMul += bf.msPct || 0; asBuff += bf.as || 0; };
    for (const [tag, until] of Object.entries(c._buffs)) if (until > this.t) addBuff(c._bx?.[tag] || def.skills[tag]?.buff);
    for (const ex of Object.values(c._ext || {})) if (ex.until > this.t) addBuff(ex.buff);
    if (c._pkg) msMul += Object.values(def.skills).find((s) => s.pickup)?.pickup?.speedPct || 0;
    if (c._spMsUntil > this.t) msMul += c._spMsPct || 0;
    if (c.augments?.includes('ghost_protocol') && (this.t - (c._lastCombatAt || 0) >= 5000)) msMul += 0.15;
    c.ms = Math.round((b.ms + it.ms) * Math.max(0.4, msMul)); // negative msPct supported, floored at 40% speed
    c.range = b.range;
    const asExtra = ((c._prefetchUntil || 0) > this.t ? 0.2 : 0) + asBuff;
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
        if (Array.isArray(p?.spells) && validSpellPair(p.spells[0], p.spells[1])) {
          bot.spellD = p.spells[0]; bot.spellF = p.spells[1];
          bot.chargesD = spellInitialCharges(bot.spellD); bot.chargesF = spellInitialCharges(bot.spellF);
        }
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
    const mul = Math.min(R.MINION_GROWTH_MAX, 1 + R.MINION_GROWTH_PER_WAVE * (this._wave - 1));
    for (const team of ['blue', 'red']) {
      const enemy = ENEMY[team];
      const tmKey = team === 'blue' ? 'Blue' : 'Red';
      const hasDeadline = this.state[`buff${tmKey}`] === 'deadline' && (this.state[`buff${tmKey}Until`] || 0) > this.t;
      const dlMul = hasDeadline ? (1 + (R.EPICS.deadline.buff?.minionBuffPct || 0.4)) : 1;
      for (const lane of ['top', 'mid', 'bot']) {
        const superLane = !this.state.structures.get(`${enemy}_${lane}_3`)?.alive;
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
    const sc = R.campScaleAt(Math.max(0, this.t - (this.state.startedAt || this.t)), false);
    const hp = Math.round(sp.hp * sc.hpMul);
    const dmg = Math.round(sp.dmg * sc.dmgMul);
    const gold = Math.round(sp.gold * sc.rewardMul);
    const xp = Math.round(sp.xp * sc.rewardMul);
    for (let i = 0; i < sp.count; i++) {
      const a = (i / sp.count) * Math.PI * 2, r = sp.count > 1 ? 60 : 0;
      const x = camp.x + Math.cos(a) * r, y = camp.y + Math.sin(a) * r;
      this._addUnit({ x, y, team: 'neutral', kind: camp.type, hp, spec: { ...sp, hp, dmg, gold, xp, range: 110, speed: 260 }, campId: camp.id, home: { x, y } });
    }
  }

  _spawnEpic(kind) {
    const sp = R.EPICS[kind], p = EPIC_SPOTS[kind];
    const sc = R.campScaleAt(Math.max(0, this.t - (this.state.startedAt || this.t)), true);
    const hp = Math.round(sp.hp * sc.hpMul);
    const dmg = Math.round(sp.dmg * sc.dmgMul);
    this._addUnit({ x: p.x, y: p.y, team: 'neutral', kind, hp, spec: { ...sp, hp, dmg, range: 160, speed: 220 }, home: { ...p } });
    if (kind === 'golden') this.state.epicGoldenAt = 0; else this.state.epicDeadlineAt = 0;
  }

  // ───────────────────────── pets ─────────────────────────
  _petOf(c) { return c._petId ? this.state.units.get(c._petId) || null : null; }
  _spawnPet(c) {
    const pet = CHAMPIONS[c.champ]?.pet;
    if (!pet || pet.summonOnly || c.dead || this._petOf(c)) return; // summonOnly pets (Scout Drone) never auto-spawn
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
    for (const [slot, until] of Object.entries(c._buffs)) if (until > t) pct += (c._bx?.[slot] || CHAMPIONS[c.champ].skills[slot]?.buff)?.petPct || 0;
    const od = (c._servoOverdriveUntil || 0) > t;
    u._atkAt = t + (sp.atkMs || 1000) / (1 + pct + (od ? 0.45 : 0));
    this.emit('fx', { k: 'petatk', id: u.id, t: tgt.id });
    this._damage(tgt, R.scaledAmount(sp.dmg, c.level, c.ad, c.ap, c.maxHp) * (1 + pct + (od ? 0.35 : 0)), c, true, false, 'magic');
  }

  _tickTraps(now) {
    if (!this._traps.length) return;
    const keep = [];
    for (const tr of this._traps) {
      if (now >= tr.until || !this._alive(tr.owner)) {
        this.emit('fx', { k: 'trapEnd', tid: tr.tid });
        continue;
      }
      if (now < tr.armedAt) { keep.push(tr); continue; }
      let vic = null;
      for (const c of this.state.champions.values()) {
        if (!c.dead && c.team !== tr.team && dist(c, tr) <= tr.r + CHAMP_RADIUS * 0.5) { vic = c; break; }
      }
      if (!vic) {
        for (const u of this.state.units.values()) {
          if (u.alive && !u.resetting && u.team !== tr.team && u.kind !== 'pet' && dist(u, tr) <= tr.r + (u.radius || 22) * 0.5) { vic = u; break; }
        }
      }
      if (vic) {
        this.emit('fx', { k: 'trapEnd', tid: tr.tid });
        this.emit('fx', { k: 'circle', x: Math.round(tr.x), y: Math.round(tr.y), r: tr.r, delay: 0, color: tr.color });
        tr.onHit(vic);
      } else keep.push(tr);
    }
    this._traps = keep;
  }

  _teamSeesTrap(team, x, y) {
    const st = this.state;
    for (const c of st.champions.values()) {
      if (c.team === team && !c.dead && Math.hypot(c.x - x, c.y - y) <= 1050) return true;
    }
    for (const s of st.structures.values()) {
      if (s.alive && s.team === team && (s.kind === 'tower' || s.kind === 'core') && Math.hypot(s.x - x, s.y - y) <= 1050) return true;
    }
    for (const u of st.units.values()) {
      if (u.alive && u.kind === 'ward' && u.team === team && Math.hypot(u.x - x, u.y - y) <= (R.WARD?.sightRadius || 750)) return true;
    }
    return false;
  }

  // ───────────────────────── tick ─────────────────────────
  update(dtMs) {
    const now = Date.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.t) / 1000));
    this.t = now;
    const st = this.state;
    if (st.phase === 'lobby') { if (now >= st.lobbyEndsAt) this._start(); return; }
    if (st.phase !== 'playing') { if (this._objs.length) this._objClearAll(); return; } // match end: every placed object is removed
    for (let i = this._timers.length - 1; i >= 0; i--) {
      if (this._timers[i][0] <= now) { const fn = this._timers[i][1]; this._timers.splice(i, 1); fn(); }
    }
    this._tickTraps(now);
    this._tickObjs(now);
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
    for (const u of st.units.values()) { // Scout Drone: a moving ward that also reveals bushes
      if (!u._drone || !u.alive || u.team !== team) continue;
      const dx = u.x - ex, dy = u.y - ey;
      if (dx * dx + dy * dy <= u._drone.vision * u._drone.vision) return false;
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
  _spawnDummy(me) {
    if (!me) return null;
    const live = [];
    this.state.units.forEach((u) => { if (u.alive && u.kind === 'dummy') live.push(u); });
    while (live.length >= 3) {
      const old = live.shift();
      old.alive = false;
      this.state.units.delete(old.id);
    }
    const fl = Math.hypot(me._mvx || 0, me._mvy || 0);
    const dx = fl > 0.01 ? me._mvx / fl : 1, dy = fl > 0.01 ? me._mvy / fl : 0;
    const raw = this.world.clampToMap(me.x + dx * 240, me.y + dy * 240);
    const pos = this.nav.nearestFree(raw.x, raw.y, CHAMP_RADIUS);
    const id = this._addUnit({ team: ENEMY[me.team], kind: 'dummy', x: pos.x, y: pos.y, hp: 10000 });
    const d = this.state.units.get(id);
    if (d) { d.armor = 40; d.mr = 40; d._dmgLog = []; d._lastHitAt = 0; }
    this.emit('fx', { k: 'circle', x: Math.round(pos.x), y: Math.round(pos.y), r: 70, delay: 0, color: 0xffd23f });
    return d;
  }

  _clearDummies() {
    this.state.units.forEach((u, id) => {
      if (u.kind === 'dummy') { u.alive = false; this.state.units.delete(id); }
    });
  }

  _radius(e) { return e.kind === 'tower' ? STRUCTURE_RADIUS.tower : e.kind === 'core' ? STRUCTURE_RADIUS.core : (e.champ || e.kind === 'dummy') ? 30 : 22; }

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
    let bu = null, bud = range, bc = null, bcd = range, bs = null, bsd = range, bo = null, bod = range;
    st.units.forEach((u) => {
      if (!u.alive || u.team !== foe || u.kind === 'pet' || this._hiddenFrom(u, src.team)) return;
      const d = dist(src, u);
      if (u.kind === 'obj') { if (d < bod) { bod = d; bo = u; } return; } // placed objects: last choice only
      if (d < bud) { bud = d; bu = u; }
    });
    st.champions.forEach((c) => {
      if (c.dead || c.team !== foe || this._hiddenFrom(c, src.team) || !this._isTargetable(c)) return;
      const d = dist(src, c); if (d < bcd) { bcd = d; bc = c; }
    });
    st.structures.forEach((s) => {
      if (!s.alive || s.team !== foe) return;
      const d = dist(src, s) - this._radius(s); if (d < bsd) { bsd = d; bs = s; }
    });
    return champFirst ? (bc || bu || bs || bo) : (bu || bc || bs || bo);
  }

  _unitTick(u, dt) {
    if (!u.alive) return;
    if (u.kind === 'dummy') {
      if (u._lastHitAt && this.t - u._lastHitAt >= 2500) {
        u.hp = u.maxHp; u._lastHitAt = 0; u._dmgLog = [];
      }
      return;
    }
    if (u.kind === 'obj') return; // placed objects are driven by _tickObjs
    if (u.kind === 'pet') { if (u._drone) this._droneTick(u, dt); else this._petTick(u, dt); return; }
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

  /** AoV Structure AI (towers & Production Server): aggro enemy champion who hit an ally champion in range, else minions first, else champions; ramping dmg. */
  _towerTick(s) {
    if (!s.alive || (s.kind !== 'tower' && s.kind !== 'core')) { s.targetId = ''; return; }
    const cfg = s.kind === 'core' ? R.CORE : R.TOWER;
    const rng = cfg.range || R.TOWER.range;
    const rng2 = rng * rng;
    const st = this.state;
    let t = null;
    // 1. Priority aggro: enemy champion who attacked an allied champion within 2.5s
    for (const c of st.champions.values()) {
      if (c.dead || c.team === s.team || this._hiddenFrom(c, s.team) || !this._isTargetable(c)) continue;
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
        if (!u.alive || u.team === s.team || u.team === 'neutral' || u.kind === 'pet' || u.kind === 'obj' || this._hiddenFrom(u, s.team)) continue;
        const dx = u.x - s.x, dy = u.y - s.y, d2 = dx * dx + dy * dy;
        if (d2 <= bd) { bd = d2; t = u; }
      }
    }
    // 3. Otherwise nearest enemy champion in range
    if (!t) {
      let bd = rng2;
      for (const c of st.champions.values()) {
        if (c.dead || c.team === s.team || this._hiddenFrom(c, s.team) || !this._isTargetable(c)) continue;
        const dx = c.x - s.x, dy = c.y - s.y, d2 = dx * dx + dy * dy;
        if (d2 <= bd) { bd = d2; t = c; }
      }
    }
    s.targetId = t ? t.id : '';
    if (!t) { s._rampId = ''; s._rampCount = 0; return; }
    if (this.t < s._atkAt) return;
    s._atkAt = this.t + (cfg.atkMs || R.TOWER.atkMs);
    const baseDmg = s.kind === 'core' ? (R.CORE.dmgChamp || 300) : (R.TOWER.dmgChampByTier?.[s.tier] ?? R.TOWER.dmgChamp);
    let dmg = t.champ ? baseDmg : t.maxHp * (cfg.dmgMinionPctMaxHp ?? R.TOWER.dmgMinionPctMaxHp);
    if (t.champ) {
      if (s._rampId === t.id) s._rampCount = Math.min(6, (s._rampCount || 0) + 1);
      else { s._rampId = t.id; s._rampCount = 0; }
      dmg *= 1 + s._rampCount * (cfg.dmgChampRampPct ?? 0.25);
    } else {
      s._rampId = ''; s._rampCount = 0;
    }
    this._attack(s, t, dmg, true, true);
  }

  _refreshInvulnerability() {
    const st = this.state;
    st.structures.forEach((s) => {
      s.invulnerable = s.alive && s._req.length > 0 && !s._req.some((id) => st.structures.get(id)?.alive === false);
    });
  }

  _tickSpellCharges(c, t = this.t) {
    for (const K of ['D', 'F']) {
      const sp = SPELLS[c['spell' + K]];
      if (!sp || !(sp.maxCharges > 1)) continue;
      let charges = c['charges' + K] ?? sp.maxCharges;
      let nextAt = c['_spellRech' + K] || 0;
      if (charges < sp.maxCharges && nextAt > 0 && t >= nextAt) {
        const augMul = c.augments?.includes('flash_cache') ? 0.8 : 1;
        const rechMs = spellCooldownMs(sp, c.level, augMul);
        while (charges < sp.maxCharges && nextAt > 0 && t >= nextAt) {
          charges++;
          nextAt = charges < sp.maxCharges ? nextAt + rechMs : 0;
        }
        c['charges' + K] = charges;
        c['_spellRech' + K] = nextAt;
      }
      const castCd = c['_spellCastCd' + K] || 0;
      c['cd' + K] = charges > 0 ? (castCd > t ? castCd : 0) : Math.max(castCd, nextAt);
    }
  }

  _champTick(c, dt) {
    const t = this.t;
    this._tickSpellCharges(c, t);
    if (c.dead) { if (t >= c.respawnAt) this._respawn(c); return; }
    this._kitTick(c, t, dt);
    if (c.dead) return;
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
    if ((c._spellShieldUntil || 0) > t) tags.push('spellshield');
    if ((c._stealthUntil || 0) > t) tags.push('stealth');
    if ((c.silencedUntil || 0) > t) tags.push('silenced');
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
    tags.push(...this._ccTags(c, t)); // v6.1: `cc:` tags after `silenced`, BEFORE every `kit:` tag, in CC_PRIORITY order
    tags.push(...this._kitTags(c, t)); // v6: `kit:` tags AFTER the existing tags, fixed order (contract 3.2)
    const exSig = Object.entries(c._ext).filter(([, e]) => e.until > t).map(([k]) => k).join('|');
    if (exSig !== c._extSig) { c._extSig = exSig; this._recalc(c, false); }
    const bstr = tags.join(',');
    if (bstr !== c.buffs) { c.buffs = bstr; this._recalc(c, false); }
    if (c.shield > 0 && t > c._shieldUntil) c.shield = 0;
    const inFountain = dist(c, this.world.fountain[c.team]) <= R.FOUNTAIN_RADIUS;
    const enemyFountain = this.world.fountain[ENEMY[c.team]];
    if (enemyFountain && dist(c, enemyFountain) <= R.FOUNTAIN_RADIUS) {
      this._damage(c, R.FOUNTAIN_LASER_DPS * dt, null, false, true);
      if (c.dead) return;
    }
    const hpRate = inFountain ? R.FOUNTAIN_HEAL_PER_SEC : R.HP_REGEN_PCT_PER_SEC;
    c.hp = Math.min(c.maxHp, c.hp + c.maxHp * hpRate * dt * this._healMul(c));
    c.mana = Math.min(c.maxMana, c.mana + (c.maxMana * (inFountain ? R.FOUNTAIN_MANA_PER_SEC : R.MANA_REGEN_PCT_PER_SEC) + (c._manaRegen || 0)) * dt);
    if (t - this.state.startedAt > R.PASSIVE_GOLD_DELAY_MS) c._goldAcc = (c._goldAcc || 0) + R.PASSIVE_GOLD_PER_SEC * dt;
    if (c._goldAcc >= 1) { c.gold += Math.floor(c._goldAcc); c._goldAcc -= Math.floor(c._goldAcc); }
    if (c.recallUntil) {
      if (t >= c.recallUntil) {
        c.recallUntil = 0;
        const bc = c._recallTo && this._objs.find((o) => o.oid === c._recallTo && t < o.until);
        c._recallTo = null;
        if (bc) { const q = this.nav.nearestFree(bc.x, bc.y, CHAMP_RADIUS); c.x = q.x; c.y = q.y; } // no fountain heal
        else { const f = this.world.fountain[c.team]; c.x = f.x; c.y = f.y; }
        c._order = null; c._nav = null; this._placePet(c);
      }
      return;
    }
    if (c._dispUntil > t) return; // being knocked back
    const ccm = this._ccMode(c, t, dt); // v6.1 forced states (suppress > airborne > stun > charm | fear | taunt > root)
    if (ccm === 'done') return;
    if (c.isBot && ccm !== 'forced') this._botThink(c);
    if (c.stunnedUntil > t) return;
    const o = c._order;
    if (!o) return;
    const speed = c.ms * (c.slowUntil > t ? 1 - c.slowPct / 100 : 1), rooted = c.rootedUntil > t;
    if (o.type === 'move') { if (!rooted && this._moveAlong(c, o, speed, dt, o)) c._order = null; return; }
    const target = this._ent(o.id);
    if (!this._alive(target) || (target.team === c.team) || target.kind === 'pet' || this._hiddenFrom(target, c.team) || !this._isTargetable(target)) { c._order = null; c.targetId = ''; return; }
    if (dist(c, target) > c.range + this._radius(target)) { if (!rooted) this._moveAlong(c, target, speed, dt, o); }
    else if (t >= c._atkAt && !((c.disarmUntil || 0) > t)) { // disarm: no basic attacks (skills and movement still work)
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
    if (this._botGlobal(c)) return;
    const foe = this._nearestEnemy(c, c.range + 380, true);
    if (foe && foe.kind !== 'core' && !(foe.kind === 'tower' && foe.invulnerable)) {
      c._order = { type: 'attack', id: foe.id }; c.targetId = foe.id;
      this._botStance(c, foe);
      this._botMaintain(c, foe);
      if (Math.random() < 0.25) this._botCast(c, foe);
      return;
    }
    this._botMaintain(c, null);
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
    const go = () => {
      if (!this._alive(target) || !(src.dead === undefined ? src.alive !== false : !src.dead)) return;
      if (target.champ && (target._untargetUntil || 0) > this.t) return; // untargetable: auto attacks do nothing
      if (src.champ && (src.blindUntil || 0) > this.t) { // blind: 0 damage, no on-hit, MISS text (throttled)
        if (this.t - (src._missAt || 0) >= CCT.MISS_TEXT_THROTTLE_MS) { src._missAt = this.t; this.emit('fx', { k: 'miss', id: src.id, x: Math.round(src.x), y: Math.round(src.y) }); }
        return;
      }
      this._damage(target, raw, src);
    };
    if (delay > 30) this._timers.push([this.t + delay, go]); else go();
  }

  _damage(target, raw, src, byPet = false, trueDmg = false, dmgType = 'physical') {
    if (!this._alive(target)) return 0;
    if (target.invulnerable || target.kind === 'pet') return 0;
    if (this.godMode && target.id === this.localId) return 0;
    if (target.champ && (target._stasisUntil || 0) > this.t) return 0;
    if (target.champ && (target._untargetUntil || 0) > this.t) return 0; // v6.1: untargetable windows take no damage
    if (src?.champ && target.champ && !byPet) src._lastChampHit = { id: target.id, t: this.t };
    const isMagic = dmgType === 'magic';
    let resist = isMagic
      ? (target.champ ? (target.mr || 30) : target.kind === 'dummy' ? (target.mr || 40) : target.kind === 'tower' ? R.TOWER.armor : target.kind === 'core' ? R.CORE.armor : 0)
      : (target.champ ? target.armor : target.kind === 'dummy' ? (target.armor || 40) : target.kind === 'tower' ? R.TOWER.armor : target.kind === 'core' ? R.CORE.armor : 0);
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
    if (target.kind === 'dummy') {
      target.hp = Math.max(1, target.hp - dmg);
      target._lastHitAt = this.t;
      const log = (target._dmgLog ||= []);
      log.push({ t: this.t, dmg });
      const cut = this.t - 3000;
      while (log.length && log[0].t < cut) log.shift();
      let total = 0;
      for (const e of log) total += e.dmg;
      const span = Math.max(1, (this.t - log[0].t) / 1000);
      if (src?.id === this.localId || this.sandbox) {
        this.emit('dummyDps', { dmg: Math.round(dmg), total: Math.round(total), dps: Math.round(total / span) });
      }
      return dmg;
    }
    // v6 link (Hira W): sharePct of every damage instance is redirected, already mitigated, to the partner (never lethal, never re-shared).
    if (target.champ && target._link && !this._sharing && dmg > 0) {
      const lk = target._link, other = this.state.champions.get(lk.a === target.id ? lk.b : lk.a);
      if (other && !other.dead && this.t < lk.until && dist(other, target) <= lk.breakRange) {
        const share = Math.max(0, Math.min(dmg * lk.sharePct, other.hp - 1)); // never lethal: same clamp as the server (Rewind._shareLink)
        dmg -= share;
        other.hp -= share;
        if (this.t - (lk.fxAt || 0) >= 250) { lk.fxAt = this.t; this.emit('fx', { k: 'linkShare', lid: lk.lid, a: target.id, b: other.id, amt: Math.round(share) }); }
      }
    }
    if (target.champ && (target._reviveUntil || 0) > this.t && dmg >= target.hp) { this._reviveTrigger(target); return 0; } // v6.1 revive guard
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
      this._kitDown(target);
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
      this._refreshInvulnerability();
      st.champions.forEach((c) => { if (c.team !== target.team) c.gold += R.TOWER_GOLD_TEAM; });
      const where = target.tier === 3 ? `${target.lane} Core Firewall` : `${target.lane} Firewall`;
      this.emit('announce', {
        title: `🔥 ${owner}'s ${where} is down!`,
        sub: target.tier === 3 ? `Production Server exposed (rebuilds in ${Math.round((R.TOWER.tier3RespawnMs || 180000) / 1000)}s)` : undefined,
        color: target.team === 'blue' ? '#ff8a8a' : '#7ec8ff',
      });
      this.emit('feed', { text: `🔥 ${owner} lost a ${where}`, color: '#ffb347' });
      if (target.tier === 3 && R.TOWER.tier3RespawnMs > 0) {
        const sid = target.id;
        this._timers.push([this.t + R.TOWER.tier3RespawnMs, () => {
          if (st.phase !== 'playing') return;
          const tw = st.structures.get(sid);
          if (!tw || tw.alive) return;
          tw.alive = true; tw.hp = tw.maxHp; tw.targetId = ''; tw._rampId = ''; tw._rampCount = 0; tw._atkAt = 0;
          this._refreshInvulnerability();
          const col = tw.team === 'blue' ? '#39c2ff' : '#ff5e5e';
          this.emit('announce', { title: `🛡️ ${owner}'s ${tw.lane} Core Firewall has respawned!`, sub: `Super minions halted in ${tw.lane} lane`, color: col });
          this.emit('feed', { text: `🛡️ ${owner}'s ${tw.lane} Core Firewall has respawned`, color: col });
        }]);
      }
      return;
    }
    if (target.kind === 'obj') { this._objDie(target, true); return; } // placed objects: no gold, no xp
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
    // Ambient Support economy: award 25% minion gold to the single lowest-gold nearby ally (non-killer).
    if (killer && R.MINIONS[target.kind] && near.length > 1) {
      let lowest = null;
      for (const c of near) if (c !== killer && (!lowest || c.gold < lowest.gold)) lowest = c;
      const share = Math.round((sp.gold || 0) * R.NEARBY_MINION_GOLD_PCT);
      if (lowest && share > 0) {
        lowest.gold += share;
        if (lowest.id === this.localId) this.emit('gold', { n: share, x: Math.round(target.x), y: Math.round(target.y) });
      }
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
    c.augmentOffer = { level: nextLv, choices, slotRerolls: choices.map(() => 1) };
    if (c.id === this.localId) this.emit('announce', { title: `⚡ CODE AUGMENT (Lv ${nextLv})`, sub: 'Ready — opens on your next death', color: '#ffd23f' });
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
      const needEpic = c.augmentOffer.level === 10 && !c.augmentOffer.choices.some((id, idx) => idx !== slot && AUGMENTS[id]?.rarity === 'epic');
      const nextId = rollSingleAugment(c.champ, c.augments, c.augmentOffer.choices, { guaranteeEpic: needEpic });
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
    if (this._ccLocked(c) && !act.usableWhileStunned) return; // v6.1: never under airborne / suppress
    c._activeCd = (this.noCd && c.id === this.localId) ? 0 : this.t + act.cd * 1000;
    if (act.id === 'stasis') {
      c._stasisUntil = this.t + act.ms;
      c.stunnedUntil = Math.max(c.stunnedUntil || 0, this.t + act.ms);
      c._order = null;
      this.emit('fx', { k: 'buff', sid: c.id, color: 0xffd23f });
      if (c.id === this.localId) this.emit('announce', { title: '⏸️ STASIS (2s)', color: '#ffd23f' });
    } else if (act.id === 'cleanse') {
      this._cleanse(c); // v6.1: CC_TYPES cleanse list + stun / root / slow / silence / knock
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
    c._wardCd = (this.noCd && c.id === this.localId) ? 0 : this.t + R.WARD.cdMs;
    this.emit('fx', { k: 'circle', x: Math.round(pos.x), y: Math.round(pos.y), r: 120, delay: 0, color: 0x39ff14 });
    // Sweeper pulse on [4] Ward: reveal enemy stealth + armed traps within sightRadius
    const scanR = R.WARD.sightRadius || 750;
    for (const foe of this.state.champions.values()) {
      if (foe.team !== c.team && !foe.dead && dist(foe, pos) <= scanR) {
        foe._stealthUntil = 0;
        foe._revealUntil = Math.max(foe._revealUntil || 0, this.t + 5000);
      }
    }
    if (c.team === 'blue') {
      for (const tr of this._traps) {
        if (tr.team !== 'blue' && dist(tr, pos) <= scanR) {
          this.emit('fx', {
            k: 'zone', sid: tr.ownerId, team: tr.team, slot: tr.slot, tid: tr.tid, trap: true, fadingStealth: true,
            x: Math.round(tr.x), y: Math.round(tr.y), r: tr.r, ms: 5000, tickMs: 1200, color: tr.color,
          });
        }
      }
    }
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
    this._kitInit(c); // stance back to default, resources to start, history cleared
    this._spawnPet(c);
  }

  _cancelRecall(c) { if (c.recallUntil) c.recallUntil = 0; }

  _recall(c) {
    if (c.dead || c.recallUntil || this._ccLocked(c)) return;
    let dur = c.augments?.includes('recall_opt') ? Math.round(R.RECALL_MS * 0.65) : R.RECALL_MS;
    // v6 beacon: a live allied beacon shortens the recall and ends there instead of the fountain.
    const bc = this._objs.find((o) => o.kind === 'beacon' && o.team === c.team && this.t < o.until);
    c._recallTo = bc ? bc.oid : null;
    if (bc) dur = Math.min(dur, bc.allyRecallMs || dur);
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
    if (!e || isStruct(e) || R.EPICS[e.kind] || e.kind === 'pet' || e.kind === 'obj' || !this._alive(e)) return;
    if ((e.suppressUntil || 0) > this.t || !this._isTargetable(e)) return; // v6.1: suppressed units are not displaceable; untargetable take no CC
    const dx = e.x - fx0, dy = e.y - fy0, d = Math.hypot(dx, dy);
    const ux = d > 1 ? dx / d : 1, uy = d > 1 ? dy / d : 0;
    const goal = this.world.clampToMap(e.x + ux * distPx, e.y + uy * distPx);
    const r = this._navR(e) || MINION_RADIUS;
    let end = this.nav.clipMove(e.x, e.y, goal.x, goal.y, r);
    const co = this._clipObjs(e.x, e.y, end.x, end.y, r); // a barricade stops a knockback like a wall
    if (co.hit) end = { x: co.x, y: co.y, hit: true };
    const wall = !!end.hit;
    const x0 = e.x, y0 = e.y;
    e.x = end.x; e.y = end.y;
    if (e.champ) {
      this._holdEnd(e); // knockback cancels a charge at no cost
      e._dispUntil = this.t + R.KNOCKBACK_MS; e._nav = null; // like the server: the move order survives this._cancelRecall(e);
      if (wall && wallStunMs) {
        const ws = e.champ ? R.applyHardCcDuration(e, wallStunMs, this.t) : wallStunMs;
        if (ws > 0) e.stunnedUntil = Math.max(e.stunnedUntil, this.t + R.KNOCKBACK_MS + ws);
      }
    }
    this.emit('fx', { k: 'knock', id: e.id, x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(e.x), y1: Math.round(e.y), ms: R.KNOCKBACK_MS, wall });
  }

  // ───────────────────────── v6 kit engine (contract: docs/02_CHAMPIONS_AND_SKILLS.md [v6 numbering] sections 3-4) ─────────────────────────
  _kitInit(c) {
    const def = CHAMPIONS[c.champ], kit = def.kit || {};
    c._stance = defaultStance(def);
    c._res = kit.res ? { [kit.res.key]: kit.res.start } : {};
    c._mix = []; c._mixAt = 0; c._pkg = null; c._tipMulUntil = 0;
    c._shadow = null; c._echo = null; c._tbox = null; c._tether = null; c._link = null; c._linkOwn = null; c._reload = null; c._hold = null;
    c._hist = []; c._histAt = 0; c._bx = c._bx || {}; c._ext = c._ext || {}; c._extSig = '';
    this._ccClear(c);
  }

  // ───────────────────────── v6.1 CC + states (contract: docs/02_CHAMPIONS_AND_SKILLS.md [v6.1 numbering] section 3) ─────────────────────────
  /** Reset every v6.1 timer (spawn, respawn, death, champion switch). */
  _ccClear(c) {
    for (const f of Object.values(CC_FIELD)) c[f] = 0;
    c._ccSrc = {}; c._untargetUntil = 0; c._reviveUntil = 0; c._reviveCfg = null; c._suppressing = null; c._windup = null;
    c._fearDir = null; c._fearFrom = null; c._missAt = 0;
  }
  _ccActive(c, k, t = this.t) { return (c[CC_TAG_FIELD[k]] || 0) > t; }
  /** `cc:<tag>` tags in CC_PRIORITY order (only while active). */
  _ccTags(c, t) {
    const out = [];
    for (const k of CC_PRIORITY) if ((c[CC_TAG_FIELD[k]] || 0) > t) out.push(`cc:${CC_TYPES[k].tag}`);
    return out;
  }
  /** Units that cannot move / act: suppress, airborne, or channelling a suppress. */
  _ccLocked(c, t = this.t) { return (c.suppressUntil || 0) > t || (c.airUntil || 0) > t || !!c._suppressing; }
  /** Any hard CC (stun, airborne, charm, fear, taunt, suppress) active. */
  _hardCc(c, t = this.t) {
    return c.stunnedUntil > t || (c.airUntil || 0) > t || (c.charmUntil || 0) > t || (c.fearUntil || 0) > t || (c.tauntUntil || 0) > t || (c.suppressUntil || 0) > t;
  }
  /** Skills cannot be cast: stun/airborne/suppress, charm/fear/taunt, suppress channel, global windup. */
  _noCast(c, t = this.t) { return this._hardCc(c, t) || !!c._suppressing || !!c._windup; }
  /** Summoner spells and items: usable under charm / fear / taunt / silence / disarm / blind, never under stun / airborne / suppress. */
  _noSpell(c, t = this.t) { return c.stunnedUntil > t || this._ccLocked(c, t); }
  _orderLocked(c, t = this.t) { return !!c && (this._ccLocked(c, t) || (c.charmUntil || 0) > t || (c.fearUntil || 0) > t || (c.tauntUntil || 0) > t); }
  _isTargetable(e) { return !(e && e.champ && (e._untargetUntil || 0) > this.t); }

  /** A CC ended early (cleanse / src_dead / cancel / revive / teleport). */
  _ccBreak(e, key, why) {
    this.emit('fx', { k: 'ccBreak', id: e.id, type: key, why });
  }
  /** Cleanse: the old list plus every v6.1 type whose CC_TYPES entry has cleanse:true (airborne / suppress never). */
  _cleanse(e) {
    e.stunnedUntil = 0; e.rootedUntil = 0; e.slowUntil = 0; e.slowPct = 0; e.silencedUntil = 0; e._dispUntil = 0;
    for (const k of CC_KEYS) {
      if (!CC_TYPES[k].cleanse || !((e[CC_FIELD[k]] || 0) > this.t)) continue;
      e[CC_FIELD[k]] = 0; this._ccBreak(e, k, 'cleanse');
    }
  }
  /** Hard CC cancels recall, hold, tether and channels (taunt only recall + hold). */
  _ccInterrupt(e, key) {
    this._cancelRecall(e); this._holdEnd(e);
    if (key === 'taunt') return;
    if (e._tether) this._tetherEnd(e);
    if (e._reload) this._reloadEnd(e, false);
    e._windup = null;
  }

  /**
   * Apply one v6.1 CC (`key` = spec key) from `src` to `e` through the 3.2 pipeline. Returns the applied ms (0 = ignored / blocked).
   * Spell shield is consumed by the caller's hit path (it blocks the whole hit and emits ccBlock there).
   */
  _ccApply(src, e, key, spec) {
    const t = this.t, ty = CC_TYPES[key];
    if (!e || !ty || !spec || isStruct(e) || R.EPICS[e.kind] || e.kind === 'obj' || e.kind === 'pet' || !this._alive(e)) return 0; // 1. immunity
    if (!e.champ && e.kind !== 'dummy') return 0; // minions / camps ignore CC offline (same as stun / slow here)
    const x = Math.round(e.x), y = Math.round(e.y);
    if (e.champ && ((e._stasisUntil || 0) > t || (e._untargetUntil || 0) > t)) return 0; // 2. stasis / untargetable
    if ((key === 'charm' || key === 'fear' || key === 'taunt' || key === 'suppress') && !src) return 0;
    if (key === 'suppress' && !src.champ) return 0;
    const block = (why) => { this.emit('fx', { k: 'ccBlock', id: e.id, type: key, why, x, y }); return 0; };
    let ms = spec.ms;
    if (ty.hard && e.champ) { // 4./5. immunity window + diminishing returns
      if ((e._ccImmuneUntil || 0) > t) return block('immune');
      const d = R.applyHardCcDuration(e, spec.ms, t);
      if (d <= 0) return block('immune');
      ms = key === 'suppress' ? Math.max(d, spec.ms * CCT.SUPPRESS_MIN_FRAC) : d;
    }
    ms = Math.round(Math.min(CCT.MAX_MS[key], ms));
    if (key === 'charm' || key === 'fear' || key === 'taunt') { // they replace one another: the latest wins
      for (const o of ['charm', 'fear', 'taunt']) if (o !== key) e[CC_FIELD[o]] = 0;
      e[CC_FIELD[key]] = t + ms;
    } else e[CC_FIELD[key]] = Math.max(e[CC_FIELD[key]] || 0, t + ms);
    (e._ccSrc ||= {})[key] = src ? src.id : '';
    if (key === 'fear') { e._fearFrom = src ? { x: src.x, y: src.y } : { x: e.x - 1, y: e.y }; e._fearDir = null; }
    if (e.champ) {
      if (ty.hard) this._ccInterrupt(e, key);
      if (key !== 'taunt' && ty.hard) { e._order = null; e._nav = null; e.targetId = ''; }
    }
    this.emit('fx', { k: 'cc', id: e.id, type: key, ms, sid: src ? src.id : '', x, y });
    return ms;
  }
  /** All v6.1 CC keys of `sk` on `e` (skills, objects, pins). `block` = the hit was absorbed by a spell shield. */
  _ccApplyAll(src, sk, e, block = false) {
    for (const k of CC_KEYS) {
      if (!sk[k] || (k === 'suppress' && sk.suppress.strikeAtEnd)) continue; // strikeAtEnd suppress is a channel (see _suppressCast)
      if (block) this.emit('fx', { k: 'ccBlock', id: e.id, type: k, why: 'shield', x: Math.round(e.x), y: Math.round(e.y) });
      else this._ccApply(src, e, k, sk[k]);
    }
  }

  // ── suppress channel (Zero R, 3.4) ──
  /** Start the channel on `e` (blink-behind already done). `strike()` runs at the end unless cancelled. Returns true when the channel started. */
  _suppressCast(c, e, sk, slotKey, strike) {
    const sp = sk.suppress, t = this.t;
    if (e.champ && (e._spellShieldUntil || 0) > t) { // a blocked suppress fizzles: mana spent, no channel
      e._spellShieldUntil = 0;
      this.emit('fx', { k: 'hit', id: e.id, color: 0xffffff });
      this.emit('fx', { k: 'ccBlock', id: e.id, type: 'suppress', why: 'shield', x: Math.round(e.x), y: Math.round(e.y) });
      return false;
    }
    const ms = this._ccApply(c, e, 'suppress', sp);
    if (!ms) return false;
    this._cancelRecall(c); this._holdEnd(c); c._order = null; c._nav = null;
    c._suppressing = { tid: e.id, until: t + ms, breakDist: sp.breakDist || 420, cancelCdPct: sp.cancelCdPct ?? 0.5, key: slotKey, strike };
    this.emit('fx', { k: 'suppress', sid: c.id, tid: e.id, ms });
    return true;
  }
  /** End the channel. why 'done' runs the strike, 'cancel' refunds `cancelCdPct` of the remaining cooldown. */
  _suppressEnd(c, why) {
    const sp = c._suppressing; if (!sp) return;
    c._suppressing = null;
    const e = this._ent(sp.tid);
    if (e) e.suppressUntil = 0;
    this.emit('fx', { k: 'suppressEnd', tid: sp.tid, why });
    if (why === 'done') { if (e && this._alive(e)) sp.strike(e); return; }
    if (e) this._ccBreak(e, 'suppress', 'cancel');
    c[sp.key] = this.t + Math.max(0, ((c[sp.key] || 0) - this.t)) * sp.cancelCdPct;
  }
  _suppressTick(c, t) {
    const sp = c._suppressing; if (!sp) return;
    const e = this._ent(sp.tid);
    if (this._hardCc(c, t) || !e || !this._alive(e) || (e.suppressUntil || 0) <= t && t < sp.until
      || dist(c, e) > sp.breakDist || (e.champ && (e._untargetUntil || 0) > t)) this._suppressEnd(c, 'cancel');
    else if (t >= sp.until) this._suppressEnd(c, 'done');
  }
  /** Anyone channelling a suppress on `e` loses it (rewind teleport, revive). */
  _suppressBroken(e, why) {
    if (!((e.suppressUntil || 0) > this.t)) return;
    this._ccBreak(e, 'suppress', why);
    this.state.champions.forEach((c) => { if (c._suppressing?.tid === e.id) this._suppressEnd(c, 'cancel'); });
    e.suppressUntil = 0;
  }

  // ── untarget / revive guard ──
  _untargetFor(c, ms) {
    const dur = Math.min(CCT.MAX_MS.untarget, ms);
    c._untargetUntil = Math.max(c._untargetUntil || 0, this.t + dur);
    this.emit('fx', { k: 'untarget', id: c.id, ms: dur, x: Math.round(c.x), y: Math.round(c.y) });
    return dur;
  }
  /** A lethal hit on an armed champion becomes a reboot (works against execute and true damage). */
  _reviveTrigger(e) {
    const cfg = e._reviveCfg || {}, t = this.t;
    e._reviveUntil = 0; e._reviveCfg = null;
    e.hp = Math.max(1, Math.ceil(e.maxHp * (cfg.hpPct || 0.3)));
    this._suppressBroken(e, 'revive');
    for (const k of CC_KEYS) if ((e[CC_FIELD[k]] || 0) > t) { e[CC_FIELD[k]] = 0; this._ccBreak(e, k, 'revive'); }
    e.stunnedUntil = 0; e.rootedUntil = 0; e.slowUntil = 0; e.slowPct = 0; e.silencedUntil = 0; e._dispUntil = 0;
    if (e._suppressing) this._suppressEnd(e, 'cancel');
    this._untargetFor(e, cfg.untargetMs || 1000);
    this._ccBreak(e, 'revive', 'revive');
    this.emit('fx', { k: 'revive', id: e.id, x: Math.round(e.x), y: Math.round(e.y), color: CC_TYPES.revive.color });
  }

  /**
   * Per-tick forced states. Returns 'done' (the tick is consumed: locked or forced walk), 'forced' (taunt: the normal
   * attack flow runs but the bot AI must not think) or ''. Priority: suppress > airborne > stun > charm | fear | taunt > root.
   */
  _ccMode(c, t, dt) {
    if (this._ccLocked(c, t)) return 'done';
    if (c.stunnedUntil > t) return '';
    const srcOf = (k) => this.state.champions.get(c._ccSrc?.[k]);
    const speed = c.ms * (c.slowUntil > t ? 1 - c.slowPct / 100 : 1), rooted = c.rootedUntil > t;
    const walk = (dx, dy, sp) => {
      if (rooted) return;
      const d = Math.hypot(dx, dy) || 1, goal = this.world.clampToMap(c.x + (dx / d) * sp * dt, c.y + (dy / d) * sp * dt);
      let end = this.nav.clipMove(c.x, c.y, goal.x, goal.y, CHAMP_RADIUS);
      const co = this._clipObjs(c.x, c.y, end.x, end.y, CHAMP_RADIUS); if (co.hit) end = { x: co.x, y: co.y };
      c.x = end.x; c.y = end.y; c._mvx = dx / d; c._mvy = dy / d; this._placePet(c);
    };
    if ((c.charmUntil || 0) > t) {
      const s = srcOf('charm');
      if (!s || s.dead) { c.charmUntil = 0; this._ccBreak(c, 'charm', 'src_dead'); return ''; }
      if (dist(c, s) > CCT.CHARM_STOP_PX) walk(s.x - c.x, s.y - c.y, speed);
      return 'done';
    }
    if ((c.fearUntil || 0) > t) {
      const s = srcOf('fear'), from = s && !s.dead ? s : c._fearFrom || { x: c.x - 1, y: c.y };
      if (!c._fearDir || t >= c._fearDir.next) {
        const jit = ((Math.random() * 2 - 1) * CCT.FEAR_JITTER_DEG * Math.PI) / 180;
        c._fearDir = { a: Math.atan2(c.y - from.y, c.x - from.x) + jit, next: t + CCT.FEAR_REROLL_MS };
      }
      walk(Math.cos(c._fearDir.a), Math.sin(c._fearDir.a), speed * CCT.FEAR_MS_MUL);
      return 'done';
    }
    if ((c.tauntUntil || 0) > t) {
      const s = srcOf('taunt');
      if (!s || s.dead) { c.tauntUntil = 0; this._ccBreak(c, 'taunt', 'src_dead'); return ''; }
      if (!this._isTargetable(s) || this._hiddenFrom(s, c.team)) { c.tauntUntil = 0; this._ccBreak(c, 'taunt', 'cancel'); return ''; }
      c._order = { type: 'attack', id: s.id }; c.targetId = s.id; // may basic attack ONLY the source
      return 'forced';
    }
    return '';
  }

  /** Death / champion switch: end every channel and personal object without refunds. */
  _kitDown(c) {
    this._holdEnd(c);
    if (c._tether) this._tetherEnd(c);
    if (c._link) this._linkEnd(c._link);
    if (c._linkOwn) this._linkEnd(c._linkOwn);
    if (c._shadow) this._shadowEnd(c);
    if (c._tbox) { c._tbox = null; this.emit('fx', { k: 'timeboxEnd', sid: c.id, refund: [] }); }
    if (c._pkg) this._pkgEnd(c);
    if (c._reload) this._reloadEnd(c, false);
    if (c._suppressing) this._suppressEnd(c, 'cancel');
    this._ccClear(c); // v6.1: untarget / revive / every CC timer cleared on death or switch
    c._echo = null; c._hist = [];
  }

  /** A slot buff: the buff object is kept so stance / serve specs resolve correctly in _recalc. */
  _setBuff(a, slot, buff, ms) { a._buffs[slot] = this.t + ms; (a._bx ||= {})[slot] = buff; this._recalc(a, false); }
  /** A buff with no slot tag (ally buffs from tether / pins / deliver). */
  _setExt(a, key, buff, ms) { (a._ext ||= {})[key] = { until: this.t + ms, buff }; this._recalc(a, false); }

  _pkgTip(c) {
    const pk = CHAMPIONS[c.champ].kit?.pkg;
    return pk && c._pkg ? Math.max(pk.tipMin, Math.min(1, c._pkg.dist / pk.tipDist)) : 0;
  }
  _pkgEnd(c) {
    c._pkg = null; this._recalc(c, false);
    this.emit('fx', { k: 'pkg', sid: c.id, on: false, tip: 0 });
  }

  /** Per-tick state of every champion: resources, history, hold, tether, link, timebox, reload, package, mix, shadow, echo. */
  _kitTick(c, t, dt) {
    const def = CHAMPIONS[c.champ], kit = def.kit || {}, rs = kit.res;
    if (rs && rs.gainPerSec > 0) c._res[rs.key] = Math.min(rs.max, (c._res[rs.key] ?? 0) + rs.gainPerSec * dt);
    if (t >= c._histAt) {
      c._histAt = t + K.HIST_SAMPLE_MS;
      c._hist.push({ t, x: c.x, y: c.y, hp: c.hp });
      const cut = t - K.HIST_KEEP_MS;
      while (c._hist.length > 1 && c._hist[0].t < cut) c._hist.shift();
    }
    const h = c._hold;
    if (h) {
      if (c.stunnedUntil > t || c._dispUntil > t) this._holdEnd(c);
      else if (t >= h.t0 + h.maxMs + K.HOLD_GRACE_MS) { this._cast(c, { slot: h.slot, ph: 'up', x: h.aim.x, y: h.aim.y }); if (c._hold === h) this._holdEnd(c); }
      else { c.slowUntil = Math.max(c.slowUntil || 0, t + 150); c.slowPct = Math.max(c.slowPct || 0, Math.round(h.slow * 100)); } // self slow, refreshed every tick
    }
    const th = c._tether;
    if (th) {
      const to = this.state.champions.get(th.to), tp = th.spec.tether;
      if (t >= th.until || !to || to.dead || (to._stasisUntil || 0) > t || c.stunnedUntil > t || c._dispUntil > t || dist(c, to) > tp.breakRange) this._tetherEnd(c);
      else {
        while (t >= th.next) {
          th.next += Math.max(K.TETHER_MIN_TICK_MS, tp.tickMs);
          to.hp = Math.min(to.maxHp, to.hp + th.amount * this._healMul(to));
          c.hp = Math.min(c.maxHp, c.hp + th.amount * (tp.selfPct || 0) * this._healMul(c));
        }
        c.slowUntil = Math.max(c.slowUntil || 0, t + 200); c.slowPct = Math.max(c.slowPct || 0, Math.round((tp.casterSlow || 0) * 100));
        if (tp.allyMsPct) this._setExt(to, `tether_${c.id}`, { msPct: tp.allyMsPct }, 250);
      }
    }
    const lk = c._link;
    if (lk && lk.a === c.id) { // one end owns the check
      const a = c, b = this.state.champions.get(lk.b);
      if (t >= lk.until || !b || b.dead || a._link !== lk || b._link !== lk || dist(a, b) > lk.breakRange) this._linkEnd(lk);
    }
    const tb = c._tbox;
    if (tb && t >= tb.until) {
      const refund = [];
      for (const [sl, len] of Object.entries(tb.spent)) {
        const k2 = `cd${sl.toUpperCase()}`;
        c[k2] = Math.max(t, (c[k2] || 0) - tb.refundPct * len);
        refund.push(sl);
      }
      c._tbox = null;
      this.emit('fx', { k: 'timeboxEnd', sid: c.id, refund });
    }
    const rl = c._reload;
    if (rl) {
      if (c.stunnedUntil > t) this._reloadEnd(c, false); // stun cancels, ammo unchanged
      else if (t >= rl.until) { c._res.ammo = rs?.max ?? 6; this._reloadEnd(c, false); }
    }
    const pk = c._pkg;
    if (pk) {
      const mv = Math.hypot(c.x - pk.lx, c.y - pk.ly);
      if (mv <= 700) pk.dist += mv; // single steps over 700 px are teleports
      pk.lx = c.x; pk.ly = c.y;
      if (t - pk.since >= (kit.pkg?.maxCarryMs || 25000)) this._pkgEnd(c);
    }
    if (c._mix.length && kit.mix && t - c._mixAt >= kit.mix.expireMs) c._mix = [];
    if (c._shadow && t >= c._shadow.until) this._shadowEnd(c);
    if (c._echo && t >= c._echo.until) c._echo = null;
    this._suppressTick(c, t);
    const wu = c._windup; // global shot windup: moveSlow 0.5, no other cast; a hard CC cancels the shot (mana already spent)
    if (wu) {
      if (this._hardCc(c, t) || c._suppressing) c._windup = null;
      else { c.slowUntil = Math.max(c.slowUntil || 0, t + 150); c.slowPct = Math.max(c.slowPct || 0, Math.round((wu.moveSlow || 0.5) * 100)); }
    }
  }

  /** `kit:<key>:<value>` tags in the fixed contract order (3.2). */
  _kitTags(c, t) {
    const def = CHAMPIONS[c.champ], kit = def.kit || {}, out = [];
    if (kit.stance) out.push(`kit:stance:${c._stance}`);
    if (kit.res) out.push(`kit:${kit.res.key}:${Math.floor((c._res[kit.res.key] ?? 0) + 1e-6)}`);
    if (kit.mix && c._mix.length) out.push(`kit:mix:${c._mix.join('')}`);
    if (c._pkg) out.push(`kit:pkg:${Math.round((this._pkgTip(c) * 100) / 5) * 5}`);
    if (c._shadow) out.push('kit:shadow:1');
    if (c._echo) out.push('kit:echo:1');
    if (c._tbox) out.push('kit:tbox:1');
    if (c._tether) out.push('kit:tether:1');
    if (c._link) out.push(`kit:link:${c._link.a === c.id ? c._link.b : c._link.a}`);
    if (c._reload) out.push('kit:reload:1');
    let nt = 0, np = 0;
    for (const o of this._objs) { if (o.owner !== c.id) continue; if (o.kind === 'turret') nt++; else if (o.kind === 'pin') np++; }
    if (nt) out.push(`kit:turrets:${nt}`);
    if (np) out.push(`kit:pins:${np}`);
    return out;
  }

  /** Reasons a cast must be denied BEFORE anything is spent (contract 3.1 / 4.x). '' = allowed. */
  _kitDeny(c, sk, m) {
    const t = this.t, sp = sk.spend;
    if (sp && Math.floor(c._res?.[sp.res] ?? 0) < sp.min) return 'needRes';
    switch (sk.type) {
      case 'shadow': if (sk.shadow?.mode === 'swap' && !(c._shadow && c._shadow.until > t)) return 'noShadow'; break;
      case 'resolve': if (!this._objs.some((o) => o.owner === c.id && o.kind === 'pin' && o.group === sk.resolve.group)) return 'noPins'; break;
      case 'objcmd': if (!this._objs.some((o) => o.owner === c.id && o.kind === 'turret')) return 'noTurrets'; break;
      case 'reload': { const rs = CHAMPIONS[c.champ].kit?.res; if (rs && Math.floor(c._res[rs.key] ?? 0) >= rs.max) return 'ammoFull'; break; }
      case 'pickup': if (c._pkg) return 'carrying'; break;
      case 'deliver': if (!c._pkg || !this._deliverTarget(c, sk, m)) return 'noPackage'; break;
      case 'tether': if (!this._allyFor(c, sk, m, false)) return 'noAlly'; break;
      case 'link': if (!this._linkPair(c, sk, m)) return 'noAlly'; break;
      default: break;
    }
    return '';
  }

  // ── hold ──
  _holdStart(c, slot, sk, m) {
    this._holdEnd(c);
    const h = sk.hold;
    c._hold = { slot, t0: this.t, aim: { x: m.x, y: m.y }, minMs: h.minMs, maxMs: h.maxMs, slow: h.moveSlow || 0 };
    this._cancelRecall(c);
    this.emit('fx', { k: 'charge', sid: c.id, slot, minMs: h.minMs, maxMs: h.maxMs, color: sk.color });
  }
  _holdEnd(c) {
    if (!c?._hold) return;
    c._hold = null;
    this.emit('fx', { k: 'chargeEnd', sid: c.id });
  }
  /** hold.scale arrays are multipliers at charge 0 and 1 (lerp by f). */
  _holdScale(sk, f) {
    const sc = sk.hold?.scale || {}, lerp = (a) => a[0] + (a[1] - a[0]) * f, o = { ...sk };
    if (sc.dmg && sk.dmg) o.dmg = scaleAmt(sk.dmg, lerp(sc.dmg));
    if (sc.range && sk.range) o.range = sk.range * lerp(sc.range);
    if (sc.width && sk.width) o.width = sk.width * lerp(sc.width);
    if (sc.radius && sk.radius) o.radius = sk.radius * lerp(sc.radius);
    if (sc.knockback && sk.knockback) o.knockback = { ...sk.knockback, dist: sk.knockback.dist * lerp(sc.knockback) };
    return o;
  }
  /** spend.per effects (additive per unit u). Shield per unit is applied after the cast (needs amt()). */
  _spendScale(sk, spend, u) {
    const per = spend.per || {}, o = { ...sk };
    if (per.dmg && sk.dmg) o.dmg = scaleAmt(sk.dmg, 1 + per.dmg * u);
    if (per.radius && sk.radius) o.radius = sk.radius * (1 + per.radius * u);
    if (per.radius && sk.obj?.kind === 'barrier') o.obj = { ...sk.obj, len: sk.obj.len * (1 + per.radius * u) }; // v6.1: per.radius scales the barrier length
    if (per.range && sk.range) o.range = sk.range * (1 + per.range * u);
    if (per.rootMs) o.root = { ...(sk.root || {}), ms: (sk.root?.ms || 0) + per.rootMs * u };
    if (per.stunMs) o.stun = { ...(sk.stun || {}), ms: (sk.stun?.ms || 0) + per.stunMs * u };
    if (per.slowPct) o.slow = { ms: 1500, ...(sk.slow || {}), pct: Math.min(0.9, (sk.slow?.pct || 0) + per.slowPct * u) };
    if (per.count) o.count = Math.max(1, sk.count | 0 || 1) + per.count * u;
    return o;
  }

  // ── echo ──
  _echoQueue(c, slot, m, ox, oy, ec) {
    const ax = Number.isFinite(m.x) ? m.x : ox + 100, ay = Number.isFinite(m.y) ? m.y : oy;
    const dx = ax - ox, dy = ay - oy, id = c.id;
    this._timers.push([this.t + ec.delayMs, () => {
      const cc = this.state.champions.get(id);
      if (!cc || cc.dead || this.state.phase !== 'playing' || cc.stunnedUntil > this.t || (cc.silencedUntil || 0) > this.t) return;
      this.emit('fx', { k: 'echoFire', sid: id, slot });
      this._cast(cc, { slot, x: cc.x + dx, y: cc.y + dy, id: m.id, _echo: true, echoMul: ec.mulPct }); // same direction + distance from the NEW position
    }]);
  }

  // ── reload (Swipe E) ──
  _reloadStart(ctx) {
    const { c, t, fx, slot, aimX, aimY } = ctx, sk = ctx.getSk(), rl = sk.reload, ms = rl.ms;
    c._reload = { until: t + ms, from: t + rl.perfect[0] * ms, to: t + rl.perfect[1] * ms, lock: !!rl.lockCasts, jammed: false, spec: rl, slot };
    const dx = aimX - c.x, dy = aimY - c.y, d = Math.hypot(dx, dy) || 1;
    const goal = this.world.clampToMap(c.x - (dx / d) * rl.step, c.y - (dy / d) * rl.step); // step back, stopped by walls
    let end = this.nav.clipMove(c.x, c.y, goal.x, goal.y, CHAMP_RADIUS);
    const co = this._clipObjs(c.x, c.y, end.x, end.y, CHAMP_RADIUS); if (co.hit) end = co;
    c.x = end.x; c.y = end.y; c._nav = null;
    fx({ k: 'reload', sid: c.id, ms, from: Math.round(rl.perfect[0] * ms), to: Math.round(rl.perfect[1] * ms) });
  }
  /** Second press while reloading: inside the gold window = instant reload + bonus, outside = jam (+jamMs once). */
  _reloadPress(c) {
    const r = c._reload, t = this.t;
    if (!r || r.jammed) return;
    if (t >= r.from && t <= r.to) {
      c._res.ammo = CHAMPIONS[c.champ].kit?.res?.max ?? 6;
      const pb = r.spec.perfectBonus;
      if (pb?.buff) this._setBuff(c, r.slot, pb.buff, pb.ms);
      this._reloadEnd(c, true);
    } else { r.jammed = true; r.until += r.spec.jamMs; }
  }
  _reloadEnd(c, perfect) {
    const r = c._reload; if (!r) return;
    c._reload = null;
    this.emit('fx', { k: 'reloadEnd', sid: c.id, perfect: !!perfect, jam: !!r.jammed });
  }

  // ── tether / link ──
  _tetherEnd(c) {
    const th = c._tether; if (!th) return;
    c._tether = null;
    this.emit('fx', { k: 'tetherEnd', tid: th.tid });
  }
  _linkEnd(lk) {
    if (!lk || lk.ended) return;
    lk.ended = true;
    for (const id of [lk.a, lk.b]) { const e = this.state.champions.get(id); if (e && e._link === lk) e._link = null; }
    const ow = this.state.champions.get(lk.owner); if (ow && ow._linkOwn === lk) ow._linkOwn = null;
    this.emit('fx', { k: 'linkEnd', lid: lk.lid });
  }
  /** Ally champion for targets:'ally' skills: `id` if valid, else the ally nearest the aim within range (null = none). */
  _allyFor(c, sk, m, allowSelf) {
    const rng = sk.range || 600, st = this.state;
    const ok = (a, slack) => !!a && !a.dead && a.team === c.team && (allowSelf || a.id !== c.id) && dist(a, c) <= rng + slack;
    const byId = m.id ? st.champions.get(m.id) : null;
    if (ok(byId, 40)) return byId;
    const ax = Number.isFinite(m.x) ? m.x : c.x, ay = Number.isFinite(m.y) ? m.y : c.y;
    let best = null, bd = Infinity;
    st.champions.forEach((a) => { if (!ok(a, 0)) return; const d = Math.hypot(a.x - ax, a.y - ay); if (d < bd) { bd = d; best = a; } });
    return best;
  }
  /** Hira link: a = the ally (the caster if none), b = nearest OTHER living allied champion to a within pairRange. */
  _linkPair(c, sk, m) {
    const a = this._allyFor(c, sk, m, true) || c;
    let b = null, bd = sk.link.pairRange;
    this.state.champions.forEach((o) => { if (o.id === a.id || o.dead || o.team !== c.team) return; const d = dist(a, o); if (d <= bd) { bd = d; b = o; } });
    return b ? { a, b } : null;
  }

  // ── shadow (Zero) ──
  _shadowSet(c, x, y, ms) {
    c._shadow = { x, y, until: this.t + ms };
    this.emit('fx', { k: 'shadow', sid: c.id, x: Math.round(x), y: Math.round(y), ms });
  }
  _shadowEnd(c) {
    c._shadow = null;
    this.emit('fx', { k: 'shadowEnd', sid: c.id });
  }

  // ── Rush delivery ──
  _deliverTarget(c, sk, m) {
    const a = this._allyFor(c, sk, m, false);
    if (a) return { ally: a, id: a.id, x: a.x, y: a.y };
    if (!sk.toStruct) return null;
    const ax = Number.isFinite(m.x) ? m.x : c.x, ay = Number.isFinite(m.y) ? m.y : c.y;
    let best = null, bd = (sk.range || 700) + 40;
    this.state.structures.forEach((s) => { if (s.kind !== 'tower' || !s.alive || s.team !== c.team) return; const d = Math.hypot(s.x - ax, s.y - ay); if (d <= bd) { bd = d; best = s; } });
    return best ? { tower: best, id: best.id, x: best.x, y: best.y } : null;
  }
  _deliver(ctx) {
    const { c, m, t, slot, key, amt, fx } = ctx, sk = ctx.getSk(), dp = sk.deliver, tg = this._deliverTarget(c, sk, m);
    const refund = () => { c[key] = 0; c.mana = Math.min(c.maxMana, c.mana + sk.mana); };
    if (!tg || !c._pkg) return refund();
    const x0 = c.x, y0 = c.y, rad = tg.ally ? CHAMP_RADIUS * 2 : STRUCTURE_RADIUS.tower + CHAMP_RADIUS;
    const d = dist(c, tg) || 1, reach = Math.min(sk.range, Math.max(0, d - rad));
    let end = this.nav.clipMove(x0, y0, x0 + ((tg.x - x0) / d) * reach, y0 + ((tg.y - y0) / d) * reach, CHAMP_RADIUS);
    const co = this._clipObjs(x0, y0, end.x, end.y, CHAMP_RADIUS); if (co.hit) end = co;
    if (dist(end, tg) > rad + 140) return refund(); // walls stopped the rush too far from the target
    c.x = end.x; c.y = end.y; c._order = null; c._nav = null;
    const tip = this._pkgTip(c), mul = c._tipMulUntil > t ? (CHAMPIONS[c.champ].skills.r?.tipMul?.mul || 1) : 1;
    const eff = Math.min(1, tip * mul), s = 0.4 + 0.6 * eff;
    fx({ k: 'dash', sid: c.id, slot, x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(c.x), y1: Math.round(c.y), color: sk.color });
    if (tg.ally) {
      const a = tg.ally;
      if (dp.shield) { a.shield = Math.round((a.shield || 0) + amt(dp.shield) * s); a._shieldUntil = Math.max(a._shieldUntil || 0, t + dp.buffMs); }
      if (dp.buff) this._setExt(a, `deliver_${c.id}`, dp.buff, dp.buffMs);
    } else tg.tower.hp = Math.min(tg.tower.maxHp, tg.tower.hp + dp.structHealPct * tg.tower.maxHp * s);
    const gold = Math.round(dp.goldBase + dp.goldPerTip * eff);
    c.gold += gold;
    if (c.id === this.localId) this.emit('gold', { n: gold, x: Math.round(c.x), y: Math.round(c.y) });
    const msg = { k: 'deliver', sid: c.id, id: tg.id, x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(c.x), y1: Math.round(c.y), tip: Math.round(Math.min(1, tip) * 100) };
    if (!tg.ally) msg.struct = true;
    fx(msg);
    this._pkgEnd(c);
  }

  // ── Brew serve ──
  _serve(ctx, dispatch) {
    const { c, fx, towardRange } = ctx, sk = ctx.getSk(), sv = sk.serve, mix = c._mix || [], size = mix.length;
    const cnt = { S: 0, M: 0, G: 0 };
    for (const l of mix) cnt[l]++;
    let outcome = 'plain';
    if (size) {
      const mx = Math.max(cnt.S, cnt.M, cnt.G), tops = ['S', 'M', 'G'].filter((l) => cnt[l] === mx);
      outcome = tops.length === 1 ? { S: 'shot', M: 'milk', G: 'syrup' }[tops[0]] : 'mocha';
    }
    const o = sv.outcomes[outcome], mul = sv.sizeMul[Math.max(0, size - 1)] ?? 1;
    const spec = { ...o, mana: sk.mana, cd: sk.cd, icon: sk.icon, dmg: scaleAmt(o.dmg, mul), heal: scaleAmt(o.heal, mul), shield: scaleAmt(o.shield, mul) };
    for (const k of ['dmg', 'heal', 'shield']) if (!spec[k]) delete spec[k];
    const p = o.type === 'allies' ? { x: c.x, y: c.y } : towardRange(o.range || sv.range);
    c._mix = [];
    fx({ k: 'serve', sid: c.id, mix: mix.join(''), outcome, x: Math.round(p.x), y: Math.round(p.y), r: o.radius, color: o.color, fx: o.fx });
    ctx.setSk(spec);
    dispatch(); // the outcome runs through the normal circle / zone / allies branch
  }

  // ── Lint resolve ──
  _resolve(ctx) {
    const { c } = ctx, sk = ctx.getSk(), rp = sk.resolve;
    for (const o of this._objs.filter((x) => x.owner === c.id && x.kind === 'pin' && x.group === rp.group)) {
      this.emit('fx', { k: 'pinBoom', oid: o.oid, r: Math.round(o.r * rp.radiusMul) });
      this._pinTrigger(o, { radiusMul: rp.radiusMul, dmgMul: rp.dmgMul, detonate: rp.detonate });
      this._objRemove(o, true);
    }
  }

  // ── Volt turret commands ──
  _objcmd(ctx) {
    const { c, t, slot, key, fx } = ctx, sk = ctx.getSk(), oc = sk.objcmd;
    const tur = this._objs.filter((o) => o.owner === c.id && o.kind === 'turret');
    if (!tur.length) { c[key] = 0; c.mana = Math.min(c.maxMana, c.mana + sk.mana); return; }
    for (const o of tur) {
      if (oc.cmd === 'overclock') {
        o.ocUntil = t + oc.ms; o.atkMul = oc.atkMul; o.heatMul = oc.heatMul;
        fx({ k: 'circle', sid: c.id, slot, x: Math.round(o.x), y: Math.round(o.y), r: 90, delay: 0, color: sk.color });
      } else if (oc.cmd === 'vent') {
        o.heat = 0; this._turretHeatFx(o);
        fx({ k: 'circle', sid: c.id, slot, x: Math.round(o.x), y: Math.round(o.y), r: oc.radius, delay: 0, color: sk.color, ...(oc.inner ? { inner: oc.inner } : {}) });
        for (const e of this._foesOf(o.team, (e) => dist(e, o) <= oc.radius + this._radius(e) && dist(e, o) >= (oc.inner || 0))) { // donut: the centre is safe
          if (e.champ) { e.slowUntil = Math.max(e.slowUntil || 0, t + oc.slow.ms); e.slowPct = Math.max(e.slowPct || 0, Math.round(oc.slow.pct * 100)); }
        }
      } else if (oc.cmd === 'detonate') this._turretExplode(o, 1 + o.heat * (oc.heatMulPerPct || 0));
    }
    if (sk.buff) this._setBuff(c, slot, sk.buff, sk.duration || 3000);
    fx({ k: 'buff', sid: c.id, slot, color: sk.color });
  }

  // ── Pager / Pixel rewind ──
  _rewind(ctx) {
    const { c, t, slot, fx } = ctx, sk = ctx.getSk(), rw = sk.rewind, targets = [c];
    if (rw.allies) this.state.champions.forEach((a) => { if (a !== c && !a.dead && a.team === c.team && dist(a, c) <= rw.radius) targets.push(a); });
    const list = [];
    for (const e of targets) {
      const hist = e._hist || [];
      if (!hist.length) continue;
      let s = hist[0];
      for (const smp of hist) if (smp.t <= t - rw.lookbackMs) s = smp; // newest sample at least lookbackMs old, else the oldest
      const x0 = e.x, y0 = e.y;
      if (rw.cleanse) this._cleanse(e); // v6.1: also charm / fear / taunt / disarm / blind (airborne + suppress never)
      if (rw.pos) { this._suppressBroken(e, 'teleport'); const p = this.nav.nearestFree(s.x, s.y, CHAMP_RADIUS); e.x = p.x; e.y = p.y; e._order = null; e._nav = null; this._cancelRecall(e); this._placePet(e); }
      if (rw.hp) e.hp = Math.min(e.maxHp, Math.max(e.hp, s.hp));
      list.push({ id: e.id, x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(e.x), y1: Math.round(e.y) });
    }
    fx({ k: 'rewind', sid: c.id, slot, r: rw.radius, list: list.slice(0, 6), color: sk.color });
  }

  // ── Tester drone ──
  _summon(ctx) {
    const { c, t, towardRange } = ctx, sk = ctx.getSk(), sm = sk.summon;
    if (c._droneId) { const old = this.state.units.get(c._droneId); if (old) { old.alive = false; this.state.units.delete(old.id); } }
    const tr = towardRange(sk.range), id = this._addUnit({ x: c.x, y: c.y, team: c.team, kind: 'pet', hp: 1, owner: c.id, spec: { ...CHAMPIONS[c.champ].pet } });
    const u = this.state.units.get(id);
    u._drone = { tx: tr.x, ty: tr.y, speed: sm.speed, until: t + sm.ms, vision: sm.vision, mark: sm.mark, markAt: 0 };
    c._droneId = id;
  }
  _droneTick(u, dt) {
    const d = u._drone, t = this.t, ow = this.state.champions.get(u.owner);
    if (t >= d.until) { u.alive = false; this.state.units.delete(u.id); if (ow && ow._droneId === u.id) ow._droneId = null; return; }
    this._step(u, { x: d.tx, y: d.ty }, d.speed, dt); // flies in a straight line over walls
    if (t >= d.markAt && d.mark) {
      d.markAt = t + 500;
      for (const e of this.state.champions.values()) {
        if (e.dead || e.team === u.team || dist(e, u) > d.vision) continue;
        (e._marks ||= {})[d.mark.tag] = { n: 1, until: t + d.mark.ms };
      }
    }
  }

  // ───────────────────────── placed objects (walls, portals, barricades, turrets, beacons, pins) ─────────────────────────
  /** Enemies (of `team`) that placed objects and skills may hit: champions + non-pet / non-obj / non-ward units. */
  _foesOf(team, pred) {
    const out = [];
    this.state.champions.forEach((e) => { if (!e.dead && e.team !== team && this._isTargetable(e) && pred(e)) out.push(e); });
    this.state.units.forEach((e) => { if (e.alive && e.team !== team && e.kind !== 'pet' && e.kind !== 'obj' && e.kind !== 'ward' && pred(e)) out.push(e); });
    return out;
  }
  /** Register an object (caps: maxActive per champion per slot / group, MAX_OBJECTS_PER_TEAM per team, oldest dropped first). */
  _objAdd(c, rec, maxActive) {
    rec.oid = rec.oid || `ob_${++this._uid}`; rec.owner = c.id; rec.team = c.team; rec.born = this.t;
    const mine = this._objs.filter((o) => o.owner === c.id && !o.isB && (rec.group ? o.group === rec.group : (o.slot === rec.slot && o.kind === rec.kind)));
    while (mine.length >= (maxActive || 1)) this._objRemove(mine.shift(), false);
    const team = this._objs.filter((o) => o.team === c.team && !o.isB);
    while (team.length >= K.MAX_OBJECTS_PER_TEAM) this._objRemove(team.shift(), false);
    this._objs.push(rec);
    return rec;
  }
  _objRemove(rec, boom) {
    const i = this._objs.indexOf(rec);
    if (i < 0) return;
    this._objs.splice(i, 1);
    this.emit('fx', boom ? { k: 'objEnd', oid: rec.oid, boom: true } : { k: 'objEnd', oid: rec.oid });
    if (rec.unit) {
      const u = this.state.units.get(rec.oid);
      if (u) { u.alive = false; u.hp = 0; const id = u.id; this._timers.push([this.t + 600, () => this.state.units.delete(id)]); }
    }
    if (rec.other) { const o2 = rec.other; rec.other = null; o2.other = null; this._objRemove(o2, false); }
  }
  _objDie(u, boom) {
    const rec = this._objs.find((o) => o.oid === u.id);
    if (rec) this._objRemove(rec, boom);
    else { u.alive = false; u.hp = 0; }
  }
  _objClearOwner(id) { for (const o of [...this._objs]) if (o.owner === id) this._objRemove(o, false); }
  _objClearAll() { for (const o of [...this._objs]) this._objRemove(o, false); }

  /** An obj unit (barricade / turret): a TeamUnit kind 'obj' with HP; campId = the object kind. */
  _objUnit(c, rec, hp, p) {
    rec.unit = true;
    this._objAdd(c, rec, rec.maxActive);
    this.state.units.set(rec.oid, {
      id: rec.oid, x: p.x, y: p.y, team: c.team, kind: 'obj', hp, maxHp: hp, alive: true, hit_seq: 0, campId: rec.kind, owner: c.id,
      _spec: null, _path: null, _wp: 1, _atkAt: 0, _home: null, _aggro: '', _tgt: '',
    });
    rec.x = p.x; rec.y = p.y;
  }

  _place(ctx) {
    const { c, m, t, slot, fx, amt, aimX, aimY, towardRange } = ctx, sk = ctx.getSk(), ob = sk.obj;
    const base = { slot, group: ob.group, color: sk.color, sk, ob, kind: ob.kind, until: t + (ob.ms || 10000) };
    const mapClamp = (x, y) => this.world.clampToMap(x, y);
    const send = (rec, extra) => fx({ k: 'obj', oid: rec.oid, kind: rec.kind, sid: c.id, team: c.team, x: Math.round(rec.x), y: Math.round(rec.y), ...extra, color: sk.color });
    switch (ob.kind) {
      case 'wall': {
        const d = Math.hypot(aimX - c.x, aimY - c.y) || 1, ra = Math.min(d, sk.range);
        let A = mapClamp(c.x + ((aimX - c.x) / d) * ra, c.y + ((aimY - c.y) / d) * ra), B = null;
        if (Number.isFinite(m.x2) && Number.isFinite(m.y2)) {
          const bx = m.x2 - A.x, by = m.y2 - A.y, bd = Math.hypot(bx, by);
          if (bd >= K.DRAG_MIN_PX) { const k = Math.min(bd, ob.len) / bd; B = mapClamp(A.x + bx * k, A.y + by * k); }
        }
        if (!B) { // tap: centered on A, perpendicular to caster-to-A, shorter default length
          const ux = (A.x - c.x) / (Math.hypot(A.x - c.x, A.y - c.y) || 1), uy = (A.y - c.y) / (Math.hypot(A.x - c.x, A.y - c.y) || 1);
          const half = (ob.len * K.DRAG_DEFAULT_FRAC) / 2, a0 = A;
          A = mapClamp(a0.x + uy * half, a0.y - ux * half); B = mapClamp(a0.x - uy * half, a0.y + ux * half);
        }
        const rec = this._objAdd(c, { ...base, x: A.x, y: A.y, x2: B.x, y2: B.y, thick: ob.thick, rehitMs: ob.rehitMs || 700, hits: {} }, ob.maxActive);
        send(rec, { x2: Math.round(B.x), y2: Math.round(B.y), thick: ob.thick, ms: ob.ms });
        break;
      }
      case 'barrier': { // v6.1: centred on the aim (clamped to range), perpendicular to the cast direction; dmg + CC hit overlapping enemies once
        const a = this._aimAngle(c, ctx), ux = Math.cos(a), uy = Math.sin(a), d = Math.min(Math.hypot(aimX - c.x, aimY - c.y), sk.range);
        const c0 = mapClamp(c.x + ux * d, c.y + uy * d), ctr = this.nav.nearestFree(c0.x, c0.y, ob.thick / 2), half = ob.len / 2;
        const A = mapClamp(ctr.x - uy * half, ctr.y + ux * half), B = mapClamp(ctr.x + uy * half, ctr.y - ux * half); // ponytail: orient 'drag' has no user in the data; perp for both
        const rec = this._objAdd(c, { ...base, x: A.x, y: A.y, x2: B.x, y2: B.y, thick: ob.thick }, ob.maxActive || 1);
        send(rec, { x2: Math.round(B.x), y2: Math.round(B.y), thick: ob.thick, ms: ob.ms });
        const overlap = this._foesOf(c.team, (e) => distToSeg(e.x, e.y, rec.x, rec.y, rec.x2, rec.y2) <= ob.thick / 2 + this._radius(e)); // before the push-out
        this._barrierPush(rec);
        for (const e of overlap) this._objHit(c, sk, e);
        break;
      }
      case 'portal': {
        const tr = sk.range ? towardRange(sk.range) : { x: c.x, y: c.y }, p = this.nav.nearestFree(tr.x, tr.y, ob.r);
        const rec = this._objAdd(c, { ...base, x: p.x, y: p.y, r: ob.r, until: t + (sk.recast?.ms || 6000), gapMs: ob.gapMs, filter: c._stance === 'allies' ? 'allies' : 'open', other: null }, 1);
        c._portalA = rec;
        send(rec, { r: ob.r, ms: (sk.recast?.ms || 6000) + ob.ms, filter: rec.filter }); // A lives until B is placed (then both live obj.ms)
        break;
      }
      case 'barricade': case 'turret': {
        const tr = sk.range ? towardRange(sk.range) : { x: c.x, y: c.y }, p = this.nav.nearestFree(tr.x, tr.y, ob.r);
        const hp = Math.max(1, Math.round(amt(ob.hp)));
        const rec = { ...base, r: ob.r, maxActive: ob.maxActive, heat: 0, lastShot: 0, atkAt: 0, ocUntil: 0, hidden: 0, dmg: ob.dmg ? amt(ob.dmg) : 0, heatTenths: 0 };
        this._objUnit(c, rec, hp, p);
        break;
      }
      case 'beacon': {
        const rec = this._objAdd(c, { ...base, x: c.x, y: c.y, r: ob.r, allyRecallMs: ob.allyRecallMs }, ob.maxActive || 1);
        send(rec, { r: ob.r, ms: ob.ms });
        break;
      }
      case 'pin': {
        const tr = towardRange(sk.range);
        const rec = this._objAdd(c, { ...base, x: tr.x, y: tr.y, r: ob.r, pinKind: ob.pin, trigger: ob.trigger, armedAt: t + (ob.armMs || 0), hideAfterMs: ob.hideAfterMs || 0 }, ob.maxActive || 5);
        const extra = { r: ob.r, ms: ob.ms, pin: ob.pin };
        if (ob.hideAfterMs > 0) { extra.hidden = ob.hideAfterMs; extra.hiddenAfterMs = ob.hideAfterMs; }
        send(rec, extra);
        break;
      }
      default: break;
    }
  }
  /** Stack E second press: portal B within obj.range2 of the caster. */
  _portalB(c, sk, slot, rc, m) {
    const A = c._portalA, ob = sk.obj, t = this.t;
    if (!A || !this._objs.includes(A) || A.other) return;
    const ax = Number.isFinite(m.x) ? m.x : c.x, ay = Number.isFinite(m.y) ? m.y : c.y;
    const d = Math.hypot(ax - c.x, ay - c.y) || 1, r2 = Math.min(d, ob.range2);
    const tr = this.world.clampToMap(c.x + ((ax - c.x) / d) * r2, c.y + ((ay - c.y) / d) * r2), p = this.nav.nearestFree(tr.x, tr.y, ob.r);
    const B = { ...A, oid: null, x: p.x, y: p.y, isB: true, other: A, until: t + ob.ms };
    B.oid = `ob_${++this._uid}`; B.born = t;
    this._objs.push(B);
    A.other = B; A.until = t + ob.ms;
    c.action = slot; c.action_seq++;
    this.emit('fx', { k: 'obj', oid: B.oid, kind: 'portal', sid: c.id, team: c.team, x: Math.round(p.x), y: Math.round(p.y), r: ob.r, ms: ob.ms, pair: A.oid, filter: A.filter, color: sk.color });
  }
  /** Ops E second press: teleport to the own beacon and consume it. */
  _toBeacon(c, slot) {
    const b = this._objs.find((o) => o.kind === 'beacon' && o.owner === c.id);
    if (!b) return;
    const x0 = c.x, y0 = c.y, p = this.nav.nearestFree(b.x, b.y, CHAMP_RADIUS);
    c.x = p.x; c.y = p.y; c._order = null; c._nav = null; this._placePet(c);
    this.emit('fx', { k: 'blink', sid: c.id, slot, x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(c.x), y1: Math.round(c.y) });
    this._objRemove(b, false);
    c.action = slot; c.action_seq++;
  }

  /** Damage + marks + CC of a placed object's stored spec on `e` (wall crossing, pin trigger, resolve). */
  _objHit(c, sk, e, mul = 1, det = null) {
    if (!this._alive(e)) return;
    const t = this.t, amt = (a) => R.scaledAmount(a, c.level, c.ad, c.ap, c.maxHp);
    if (e.champ && (e._spellShieldUntil || 0) > t) { e._spellShieldUntil = 0; this.emit('fx', { k: 'hit', id: e.id, color: 0xffffff }); this._ccApplyAll(c, sk, e, true); return; }
    const base = sk.dmg ? amt(sk.dmg) * mul : 0, d = det || sk.detonate;
    if (sk.dmg) this._damage(e, base, c, false, false, skillDamageType(sk));
    if (!this._alive(e)) return;
    if (d && e._marks?.[d.tag]) {
      const mk = e._marks[d.tag]; delete e._marks[d.tag];
      if (mk.until > t && mk.n > 0) this._damage(e, base * (d.pctPerStack || 0.2) * mk.n, c, false, true, 'true');
    }
    if (!this._alive(e)) return;
    const markable = e.champ || e.kind === 'dummy';
    if (sk.mark && markable) {
      e._marks = e._marks || {};
      const cur = e._marks[sk.mark.tag], n0 = cur && cur.until > t ? cur.n : 0;
      e._marks[sk.mark.tag] = { n: Math.min(sk.mark.max || 1, n0 + 1), until: t + (sk.mark.ms || 5000) };
    }
    if (sk.slow) { e.slowUntil = Math.max(e.slowUntil || 0, t + sk.slow.ms); e.slowPct = Math.max(e.slowPct || 0, Math.round(sk.slow.pct * 100)); }
    if (sk.root) { const ms = e.champ ? R.applyHardCcDuration(e, sk.root.ms, t) : sk.root.ms; if (ms > 0) e.rootedUntil = Math.max(e.rootedUntil || 0, t + ms); }
    if (sk.stun) { const ms = e.champ ? R.applyHardCcDuration(e, sk.stun.ms, t) : sk.stun.ms; if (ms > 0) e.stunnedUntil = Math.max(e.stunnedUntil || 0, t + ms); }
    if (this._alive(e)) this._ccApplyAll(c, sk, e); // v6.1: disarm (Lint W pin), airborne / charm ... from placed objects
    this.emit('fx', { k: 'hit', id: e.id, color: sk.color });
  }

  /** v6.1 barrier: a solid segment for every champion / minion / monster; overlapping units are pushed out along the normal. */
  _barrierPush(o) {
    const half = o.thick / 2, sx = o.x2 - o.x, sy = o.y2 - o.y, l2 = sx * sx + sy * sy || 1, st = this.state;
    const push = (e, navR) => {
      const px = e.x - o.x, py = e.y - o.y, k = clamp01((px * sx + py * sy) / l2), qx = o.x + sx * k, qy = o.y + sy * k;
      let nx = e.x - qx, ny = e.y - qy, dd = Math.hypot(nx, ny);
      const minD = half + navR;
      if (dd >= minD) return;
      if (dd < 0.5) { const sl = Math.sqrt(l2); nx = -sy / sl; ny = sx / sl; dd = 1; } // exactly on the line: pick a side
      const q = this.nav.pushOut(qx + (nx / dd) * (minD + 1), qy + (ny / dd) * (minD + 1), navR);
      e.x = q.x; e.y = q.y; if (e._nav) e._nav = null;
    };
    st.champions.forEach((e) => { if (!e.dead) push(e, CHAMP_RADIUS); });
    st.units.forEach((e) => { if (e.alive && e.kind !== 'obj' && e.kind !== 'pet' && e.kind !== 'ward' && e.kind !== 'dummy' && !R.EPICS[e.kind]) push(e, MINION_RADIUS); });
  }

  _pinTrigger(o, opt = {}) {
    const owner = this.state.champions.get(o.owner);
    if (!owner) return;
    const sk = o.sk, r = o.r * (opt.radiusMul || 1);
    if (o.trigger === 'ally') {
      const who = opt.who ? [opt.who] : [...this.state.champions.values()].filter((a) => !a.dead && a.team === o.team && dist(a, o) <= r);
      for (const a of who) {
        if (sk.heal) a.hp = Math.min(a.maxHp, a.hp + R.scaledAmount(sk.heal, owner.level, owner.ad, owner.ap, owner.maxHp) * (opt.dmgMul || 1) * this._healMul(a));
        if (sk.buff) this._setExt(a, `pin_${o.oid}`, sk.buff, sk.duration || 1800);
        this.emit('fx', { k: 'heal', sid: owner.id, slot: o.slot, x: Math.round(a.x), y: Math.round(a.y), r: 90, color: sk.color });
      }
      return;
    }
    this.emit('fx', { k: 'circle', sid: owner.id, slot: o.slot, x: Math.round(o.x), y: Math.round(o.y), r: Math.round(r), delay: 0, color: sk.color });
    for (const e of this._foesOf(o.team, (e) => dist(e, o) <= r + this._radius(e))) this._objHit(owner, sk, e, opt.dmgMul || 1, opt.detonate || null);
  }

  _turretHeatFx(o) {
    const h = Math.max(0, Math.min(10, Math.round(o.heat / 10)));
    if (h !== o.heatTenths) { o.heatTenths = h; this.emit('fx', { k: 'objHeat', oid: o.oid, h }); }
  }
  _turretExplode(o, mul) {
    const owner = this.state.champions.get(o.owner), ex = o.ob.heat.explode;
    this.emit('fx', { k: 'circle', sid: o.owner, slot: o.slot, x: Math.round(o.x), y: Math.round(o.y), r: ex.radius, delay: 0, color: 0xff9800 });
    if (owner) {
      const dmg = R.scaledAmount(ex.dmg, owner.level, owner.ad, owner.ap, owner.maxHp) * mul;
      for (const e of this._foesOf(o.team, (e) => dist(e, o) <= ex.radius + this._radius(e))) {
        this._damage(e, dmg, owner, false, false, 'magic');
        if (ex.stun && e.champ && this._alive(e)) { const ms = R.applyHardCcDuration(e, ex.stun.ms, this.t); if (ms > 0) e.stunnedUntil = Math.max(e.stunnedUntil || 0, this.t + ms); }
      }
    }
    this._objRemove(o, true);
  }

  /** v6.1 `self{ shield?, heal?, buff?, spellShieldMs?, duration? }` on circle / zone / cone / line / arc (same path as type 'self'). */
  _applySelf(ctx, sp) {
    const { c, t, slot, amt, fx } = ctx;
    if (sp.heal) c.hp = Math.min(c.maxHp, c.hp + amt(sp.heal));
    if (sp.shield) { c.shield = Math.round(amt(sp.shield)); c._shieldUntil = t + (sp.duration || 3000); }
    if (sp.buff) this._setBuff(c, slot, sp.buff, sp.duration || 3000);
    if (sp.spellShieldMs > 0) c._spellShieldUntil = Math.max(c._spellShieldUntil || 0, t + sp.spellShieldMs);
    fx({ k: 'buff', sid: c.id, slot, color: ctx.getSk().color });
  }

  /**
   * v6.1 phase dash path: samples every PHASE_STEP_PX; a contiguous blocked run is crossed when it is <= maxWall long and the
   * landing cell is free (nearestFree within PHASE_LAND_SEARCH_PX); otherwise the dash stops at the last free point before the
   * first run that is too thick. Returns { x, y, crossed, free[] } (free = the free samples, used for hitRadius).
   */
  _phasePath(x0, y0, x1, y1, maxWall) {
    const step = CCT.PHASE_STEP_PX, r = CHAMP_RADIUS, len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(len / step)), gap = len / n;
    const free = []; let last = { x: x0, y: y0 }, run = -1, crossed = false;
    for (let i = 1; i <= n; i++) {
      const k = i / n, x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k;
      if (this.nav.isBlocked(x, y, r)) { if (run < 0) run = i; continue; }
      if (run >= 0) {
        if ((i - run) * gap > maxWall) return { x: last.x, y: last.y, crossed, free };
        crossed = true; run = -1;
      }
      free.push({ x, y }); last = { x, y };
    }
    if (run >= 0) { // the target point is inside terrain: land on the nearest free cell if close enough and the run was thin enough
      const q = this.nav.nearestFree(x1, y1, r);
      if ((n - run + 1) * gap <= maxWall && Math.hypot(q.x - x1, q.y - y1) <= CCT.PHASE_LAND_SEARCH_PX) return { x: q.x, y: q.y, crossed: true, free };
      return { x: last.x, y: last.y, crossed, free };
    }
    return { x: x1, y: y1, crossed, free };
  }

  // ── v6.1 delivery shapes (cone / line / arc): aim is locked at cast, `area` fx carries the telegraph ──
  _aimAngle(c, ctx) {
    const dx = ctx.aimX - c.x, dy = ctx.aimY - c.y;
    return Math.hypot(dx, dy) > 1 ? Math.atan2(dy, dx) : Math.atan2(c._mvy || 0, c._mvx || (c.team === 'blue' ? 1 : -1));
  }
  _areaFx(ctx, shape, a, extra) {
    const { c, slot } = ctx, sk = ctx.getSk(), m = { k: 'area', shape, sid: c.id, slot, x: Math.round(c.x), y: Math.round(c.y), a: +a.toFixed(4), len: sk.range, ...extra, delay: sk.delay || 0, color: sk.color };
    if (sk.fx) m.fx = sk.fx;
    ctx.fx(m);
  }
  /** cone { range, angle, delay }: origin = caster position at resolve, units within 50 px of it are always hit. */
  _cone(ctx) {
    const { c, t, enemies, hit } = ctx, sk = ctx.getSk(), a = this._aimAngle(c, ctx), half = (sk.angle * Math.PI) / 360;
    this._areaFx(ctx, 'cone', a, { ang: +(half * 2).toFixed(4) });
    this._timers.push([t + (sk.delay || 0), () => {
      const o = { x: c.x, y: c.y };
      for (const e of enemies((e) => { const d = dist(e, o); return d <= sk.range + this._radius(e) && (d <= 50 || Math.abs(angDiff(a, Math.atan2(e.y - o.y, e.x - o.x))) <= half); })) hit(e, 0, o);
    }]);
  }
  /** line { range, width, delay }: oriented box from the caster (origin locked at cast); not blocked by units or terrain. */
  _line(ctx) {
    const { c, t, enemies, hit } = ctx, sk = ctx.getSk(), a = this._aimAngle(c, ctx), o = { x: c.x, y: c.y }, ux = Math.cos(a), uy = Math.sin(a);
    this._areaFx(ctx, 'line', a, { w: sk.width });
    this._timers.push([t + (sk.delay || 0), () => {
      for (const e of enemies((e) => {
        const px = e.x - o.x, py = e.y - o.y, proj = px * ux + py * uy;
        return proj >= 0 && proj <= sk.range && Math.abs(-px * uy + py * ux) <= sk.width / 2 + this._radius(e);
      })) hit(e, 0, o);
    }]);
  }
  /** arc { range, inner, angle, sweepMs, delay }: annular sector, each target is hit at delay + f x sweepMs (left edge f = 0 to right edge f = 1). */
  _arc(ctx) {
    const { c, t, enemies, hit } = ctx, sk = ctx.getSk(), a = this._aimAngle(c, ctx), half = (sk.angle * Math.PI) / 360, o = { x: c.x, y: c.y };
    this._areaFx(ctx, 'arc', a, { ang: +(half * 2).toFixed(4), inner: sk.inner || 0, sweep: sk.sweepMs || 0 });
    this._timers.push([t + (sk.delay || 0), () => {
      const hits = enemies((e) => { const d = dist(e, o); return d >= (sk.inner || 0) && d <= sk.range + this._radius(e) && Math.abs(angDiff(a, Math.atan2(e.y - o.y, e.x - o.x))) <= half; });
      for (const e of hits) {
        const f = clamp01((angDiff(a, Math.atan2(e.y - o.y, e.x - o.x)) + half) / (2 * half || 1));
        this._timers.push([this.t + f * (sk.sweepMs || 0), () => hit(e, 0, o)]);
      }
    }]);
  }

  /** Stop a straight move at the edge of a barricade (dashes / knockbacks); only when starting outside it. */
  _clipObjs(x0, y0, x1, y1, r) {
    const bs = this._objs.filter((o) => o.kind === 'barricade' || o.kind === 'barrier'); // v6.1: barrier = segment version
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (!bs.length || len < 1) return { x: x1, y: y1, hit: false };
    const gap = (b, x, y) => (b.kind === 'barrier' ? distToSeg(x, y, b.x, b.y, b.x2, b.y2) - b.thick / 2 : Math.hypot(x - b.x, y - b.y) - b.r); // distance to the solid's edge
    let lx = x0, ly = y0;
    for (let s = 10; ; s += 10) {
      const k = Math.min(1, s / len), x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k;
      for (const b of bs) {
        if (gap(b, x0, y0) < r) continue; // already inside: not clipped by this one
        if (gap(b, x, y) < r) return { x: lx, y: ly, hit: true };
      }
      lx = x; ly = y;
      if (k >= 1) break;
    }
    return { x: x1, y: y1, hit: false };
  }

  /** Placed-object logic at OBJ_TICK_MS cadence. */
  _tickObjs(now) {
    if (now < this._objAt) return;
    this._objAt = now + K.OBJ_TICK_MS;
    const t = now, st = this.state;
    for (const o of [...this._objs]) {
      if (!this._objs.includes(o)) continue;
      if (t >= o.until) { this._objRemove(o, false); continue; }
      if (o.unit) { const u = st.units.get(o.oid); if (!u || !u.alive) { this._objRemove(o, false); continue; } }
      const owner = st.champions.get(o.owner);
      switch (o.kind) {
        case 'wall': {
          if (!owner) break;
          for (const e of this._foesOf(o.team, (e) => distToSeg(e.x, e.y, o.x, o.y, o.x2, o.y2) <= o.thick / 2 + this._radius(e))) {
            if ((o.hits[e.id] || 0) > t) continue;
            o.hits[e.id] = t + o.rehitMs;
            this._objHit(owner, o.sk, e, 1, null);
            if (o.slot === 'q' && owner.augments?.includes('evo_pixel_split') && this._alive(e)) { // keep evo_pixel_split working on the wall hit
              let n = 0;
              for (const foe of this._foesOf(o.team, (f) => f.champ && f.id !== e.id && dist(f, e) <= 260)) { if (n++ >= 2) break; this._damage(foe, R.scaledAmount(o.sk.dmg, owner.level, owner.ad, owner.ap, owner.maxHp) * 0.45, owner, false, false, skillDamageType(o.sk)); }
            }
          }
          break;
        }
        case 'portal': {
          if (o.isB || !o.other) break;
          const allies = owner?._stance === 'allies';
          for (const end of [o, o.other]) {
            const dest = end === o ? o.other : o;
            const mv = (e, navR) => {
              if ((e._ptLock || 0) > t || dist(e, end) > end.r + K.PORTAL_ENTER_PAD) return;
              if (allies && e.team !== o.team) return;
              const dx = e.x - end.x, dy = e.y - end.y, dd = Math.hypot(dx, dy), ux = dd > 1 ? dx / dd : 1, uy = dd > 1 ? dy / dd : 0;
              const q = this.nav.nearestFree(dest.x + ux * (dest.r + 30), dest.y + uy * (dest.r + 30), navR);
              const x0 = e.x, y0 = e.y;
              e.x = q.x; e.y = q.y; e._ptLock = t + (o.gapMs || 1500);
              if (e.champ) { e._order = null; e._nav = null; this._cancelRecall(e); this._placePet(e); }
              this.emit('fx', { k: 'tp', id: e.id, x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(e.x), y1: Math.round(e.y), via: end.oid });
            };
            st.champions.forEach((e) => { if (!e.dead) mv(e, CHAMP_RADIUS); });
            st.units.forEach((e) => { if (e.alive && (R.MINIONS[e.kind] || (e.campId && !R.EPICS[e.kind] && e.kind !== 'obj' && e.kind !== 'dummy'))) mv(e, MINION_RADIUS); });
          }
          break;
        }
        case 'barrier': this._barrierPush(o); break;
        case 'barricade': {
          const push = (e, navR) => {
            const dx = e.x - o.x, dy = e.y - o.y, dd = Math.hypot(dx, dy), minD = o.r + navR;
            if (dd >= minD) return;
            const ux = dd > 0.5 ? dx / dd : 1, uy = dd > 0.5 ? dy / dd : 0, q = this.nav.pushOut(o.x + ux * (minD + 1), o.y + uy * (minD + 1), navR);
            e.x = q.x; e.y = q.y;
          };
          st.champions.forEach((e) => { if (!e.dead) push(e, CHAMP_RADIUS); });
          st.units.forEach((e) => { if (e.alive && e.kind !== 'obj' && e.kind !== 'pet' && e.kind !== 'ward' && e.kind !== 'dummy' && !R.EPICS[e.kind]) push(e, MINION_RADIUS); });
          break;
        }
        case 'turret': {
          const oc = o.ocUntil > t;
          if (t >= o.atkAt) {
            let tgt = null, bd = o.ob.range;
            for (const e of this._foesOf(o.team, (e) => e.champ && !this._hiddenFrom(e, o.team))) { const d = dist(e, o); if (d < bd) { bd = d; tgt = e; } }
            if (!tgt) { bd = o.ob.range; for (const e of this._foesOf(o.team, (e) => !e.champ && (e.kind === 'dummy' || !this._hiddenFrom(e, o.team)))) { const d = dist(e, o); if (d < bd) { bd = d; tgt = e; } } }
            if (tgt) {
              o.atkAt = t + o.ob.atkMs * (oc ? o.atkMul : 1); o.lastShot = t;
              this.emit('fx', { k: 'shot', oid: o.oid, x: Math.round(o.x), y: Math.round(o.y), tx: Math.round(tgt.x), ty: Math.round(tgt.y), color: o.color });
              this._damage(tgt, o.dmg, owner || null, false, false, skillDamageType({ dmg: o.ob.dmg }));
              o.heat += o.ob.heat.perShot * (oc ? o.heatMul : 1);
              this._turretHeatFx(o);
              if (o.heat >= o.ob.heat.max) { this._turretExplode(o, 1); break; }
            }
          }
          if (t - o.lastShot >= o.ob.heat.coolDelayMs && o.heat > 0) { o.heat = Math.max(0, o.heat - o.ob.heat.coolPerSec * (K.OBJ_TICK_MS / 1000)); this._turretHeatFx(o); }
          break;
        }
        case 'pin': {
          if (t < o.armedAt) break;
          if (o.trigger === 'enemy') {
            if (this._foesOf(o.team, (e) => dist(e, o) <= o.r + this._radius(e) * 0.5).length) { this._pinTrigger(o); this._objRemove(o, false); }
          } else {
            const a = [...st.champions.values()].find((x) => !x.dead && x.team === o.team && dist(x, o) <= o.r);
            if (a) { this._pinTrigger(o, { who: a }); this._objRemove(o, false); }
          }
          break;
        }
        default: break;
      }
    }
  }

  // ── bots (section 6): stance preference, resource upkeep, kit-aware skill choice ──
  _botStance(c, foe) {
    const def = CHAMPIONS[c.champ], bp = def.kit?.stance?.botPref;
    if (!bp || this.t < (c._botStanceAt || 0)) return;
    const want = bp.lowHp && c.hp < c.maxHp * (bp.lowHpPct || 0.35) ? bp.lowHp : (foe && dist(c, foe) <= bp.dist ? bp.near : bp.far);
    if (want === c._stance) return;
    const sl = ['q', 'w', 'e', 'r'].find((s) => def.skills[s].type === 'stance');
    if (!sl) return;
    c._botStanceAt = this.t + 2000; // at most one toggle per 2s
    this._cast(c, { slot: sl });
  }
  /** Swipe: reload (tap only, natural completion) when empty, or when idle with a low magazine. */
  _botMaintain(c, foe) {
    const def = CHAMPIONS[c.champ], rs = def.kit?.res;
    if (!rs || rs.key !== 'ammo' || c._reload) return;
    const ammo = Math.floor(c._res.ammo ?? 0), near = foe && dist(c, foe) <= 900;
    if (ammo === 0 || (!near && ammo < 4)) { const sl = ['q', 'w', 'e', 'r'].find((s) => def.skills[s].type === 'reload'); if (sl) this._cast(c, { slot: sl, x: c.x + (c.team === 'blue' ? -100 : 100), y: c.y }); }
  }
  /** Visible enemy champions within r of p. */
  _foeChamps(c, p, r) {
    const out = [];
    this.state.champions.forEach((e) => { if (!e.dead && e.team !== c.team && this._isTargetable(e) && dist(e, p) <= r && !this._hiddenFrom(e, c.team)) out.push(e); });
    return out;
  }
  /** v6.1 bot rules (3.8): map-wide shot at a visible enemy champion within range below 55% HP, or in a 2v1 fight. true = the think tick is used. */
  _botGlobal(c) {
    const def = CHAMPIONS[c.champ], t = this.t;
    const slot = ['q', 'w', 'e', 'r'].find((s) => { const sk = resolveSkill(def, s, c._stance); return sk?.global && sk.bot !== 'skip' && (c.ranks?.[s] || 0) > 0 && c[`cd${s.toUpperCase()}`] <= t && c.mana >= sk.mana && !(s === 'r' && c.level < R.ULT_UNLOCK_LEVEL); });
    if (!slot || this._noCast(c, t) || c.stunnedUntil > t || (c.silencedUntil || 0) > t) return false;
    const sk = resolveSkill(def, slot, c._stance);
    let tgt = null;
    this.state.champions.forEach((e) => {
      if (e.dead || e.team === c.team || !this._isTargetable(e) || this._hiddenFrom(e, c.team) || dist(e, c) > sk.range || e.hp >= e.maxHp * 0.55) return;
      if (!tgt || e.hp / e.maxHp < tgt.hp / tgt.maxHp) tgt = e;
    });
    if (!tgt) { // 2v1: two enemy champions on top of this bot and no ally nearby
      const near = this._foeChamps(c, c, 700);
      let allies = 0;
      this.state.champions.forEach((a) => { if (a.id !== c.id && !a.dead && a.team === c.team && dist(a, c) <= 700) allies++; });
      if (near.length >= 2 && !allies) tgt = near.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    }
    if (!tgt) return false;
    this._cast(c, { slot, x: tgt.x, y: tgt.y, id: tgt.id });
    return true;
  }
  /** v6.1 bot gates for the new kit pieces. false = do not cast this skill now. */
  _botGate(c, sk, foe, champFoe) {
    if (sk.type === 'cone' || sk.type === 'arc' || sk.type === 'line') { // aimed at the target, so the angle is covered
      if (!champFoe) return false;
      return dist(c, champFoe) <= (sk.type === 'line' ? sk.range * 0.9 : sk.range);
    }
    if (sk.suppress) return !!champFoe && champFoe.hp < champFoe.maxHp * 0.6 && this._foeChamps(c, champFoe, 500).length <= 1;
    if (sk.taunt) {
      if (this._foeChamps(c, c, 300).length >= 2) return true;
      let low = false;
      this.state.champions.forEach((a) => { if (a.id !== c.id && !a.dead && a.team === c.team && a.hp < a.maxHp * 0.4 && dist(a, c) <= 450) low = true; });
      return low && this._foeChamps(c, c, 300).length >= 1;
    }
    if (sk.fear) { const n = this._foeChamps(c, c, 270).length; return n >= 1 && (c.hp < c.maxHp * 0.7 || n >= 2); }
    if (sk.airborne) return this._foeChamps(c, c, 350).length >= 2;
    return true;
  }
  _botCast(c, foe) {
    const def = CHAMPIONS[c.champ], t = this.t;
    const slots = ['q', 'w', 'e', 'r'].filter((s) => { const sk = resolveSkill(def, s, c._stance); return sk && sk.bot !== 'skip' && sk.type !== 'stance' && sk.type !== 'reload' && !sk.global; });
    const slot = slots[Math.floor(Math.random() * slots.length)];
    if (!slot) return;
    const sk = resolveSkill(def, slot, c._stance), champFoe = foe.champ ? foe : null;
    if (sk.reviveGuard) { // Ops R: 2+ allied champions within 800 below 60% HP and an enemy champion within 900
      let n = 0;
      this.state.champions.forEach((a) => { if (!a.dead && a.team === c.team && dist(a, c) <= 800 && a.hp < a.maxHp * 0.6) n++; });
      if (n >= 2 && this._foeChamps(c, c, 900).length) this._cast(c, { slot, x: c.x, y: c.y });
      return;
    }
    if (!this._botGate(c, sk, foe, champFoe)) return;
    if (sk.tether || sk.link) { // peel: lowest-HP ally below 60% in range
      let al = null;
      this.state.champions.forEach((a) => { if (a.id !== c.id && !a.dead && a.team === c.team && a.hp < a.maxHp * 0.6 && dist(a, c) <= sk.range && (!al || a.hp < al.hp)) al = a; });
      if (al) this._cast(c, { slot, x: al.x, y: al.y, id: al.id });
      return;
    }
    if (sk.bot === 'self') {
      let ok = !!champFoe && dist(c, champFoe) <= 700;
      if (sk.type === 'resolve') ok = !!champFoe && this._objs.filter((o) => o.owner === c.id && o.kind === 'pin').length >= 2 && this._objs.some((o) => o.owner === c.id && o.kind === 'pin' && dist(o, champFoe) <= 400);
      if (sk.type === 'rewind') { let n = 0; this.state.champions.forEach((a) => { if (!a.dead && a.team === c.team && dist(a, c) <= sk.rewind.radius && a.hp < a.maxHp * 0.55) n++; }); ok = n >= 2; }
      if (ok) this._cast(c, { slot, x: c.x, y: c.y });
      return;
    }
    if (sk.bot === 'escape') {
      if (c.hp < c.maxHp * 0.35 && c._lastHitBy && t - c._lastHitBy.t < 2500) this._cast(c, { slot, x: c.x - (foe.x - c.x), y: c.y - (foe.y - c.y) });
      return;
    }
    if (def.id === 'model' && slot === 'r' && Math.floor(c._res.orbs ?? 0) < (def.kit.res.max)) return; // Model prefers a full magazine of orbs for R
    if (def.kit?.mix) { if (slot === 'r') { if (c._mix.length < 2 || !champFoe) return; } }
    if ((sk.bot === 'opener' || sk.type === 'place') && dist(c, foe) > (sk.range || 600)) return;
    this._cast(c, { slot, x: foe.x, y: foe.y, id: foe.id }); // hold: tap = quick-cast; drag: no x2,y2
  }

  /** Generic skill engine for the skill types (mirrors the contract's fx). */
  _cast(c, m) {
    const slot = m.slot, def = CHAMPIONS[c.champ], t = this.t;
    const ph = m.ph === 'down' || m.ph === 'up' || m.ph === 'cancel' ? m.ph : '';
    if (ph === 'cancel') { this._holdEnd(c); return; } // free, exempt from every gate
    // v6: the ACTIVE spec for this slot (stance variants fully replace the base spec).
    let sk = resolveSkill(def, slot, c._stance);
    if (!sk || c.dead || c.stunnedUntil > t || c._dispUntil > t || (c.silencedUntil || 0) > t) return;
    if (this._noCast(c, t)) return; // v6.1: airborne / suppress / charm / fear / taunt, suppress channel, global windup
    if (slot === 'r' && c.level < R.ULT_UNLOCK_LEVEL) return;
    const rank = c.ranks?.[slot] || 0;
    if (rank <= 0 && !m._echo) return;
    if (c._reload?.lock && sk.type !== 'reload') return; // reloading blocks the other keys while lockCasts
    const key = `cd${slot.toUpperCase()}`;
    const isLocal = c.id === this.localId;
    // v6 state actions on a second press: Swipe reload (ignores cooldown + mana), Ops tether (free cut, no refund).
    if (sk.type === 'reload' && c._reload) { this._reloadPress(c); return; }
    if (sk.type === 'tether' && c._tether && sk.tether?.recastEnds) { this._tetherEnd(c); return; }
    // v5 recast: the second press is free (no mana / cooldown).
    c._recast = c._recast || {};
    const rc = sk.recast ? c._recast[slot] : null;
    if (rc && rc.until > t) {
      if (sk.recast.mode === 'back' && c.rootedUntil > t) return; // rooted: keep the window open
      c._recast[slot] = null;
      if (sk.recast.mode === 'back') {
        const bx = c.x, by = c.y, bp = this.nav.nearestFree(rc.x0, rc.y0, CHAMP_RADIUS);
        c.x = bp.x; c.y = bp.y; c._order = null; c._nav = null;
        this.emit('fx', { k: 'blink', sid: c.id, slot, x0: Math.round(bx), y0: Math.round(by), x1: Math.round(c.x), y1: Math.round(c.y) });
        c.action = slot; c.action_seq++;
        return;
      }
      if (sk.recast.mode === 'again') { this._cast(c, { ...m, _again: true }); return; }
      if (sk.recast.mode === 'place2') { this._portalB(c, sk, slot, rc, m); return; }
      if (sk.recast.mode === 'toObj') { this._toBeacon(c, slot, rc); return; }
    }
    // v6 hold: down = validate only (nothing spent), up = fire scaled by the charge, no ph = quick-cast.
    const hold = sk.input === 'hold' ? sk.hold : null;
    let holdF = 0;
    if (!hold && ph) return;
    if (hold && ph === 'up') {
      const h = c._hold;
      if (!h || h.slot !== slot) return;
      holdF = clamp01((t - h.t0 - hold.minMs) / Math.max(1, hold.maxMs - hold.minMs));
    } else if (hold && !ph) holdF = hold.quick ?? 0.35;
    const freeCast = !!(m._again || m._echo);
    if (!freeCast && !(this.noCd && isLocal) && c[key] > t) return;
    if (!freeCast && !(this.noMana && isLocal) && c.mana < sk.mana) return;
    if (m.id && this._hiddenFrom(this._ent(m.id), c.team)) return; // point-and-click at a hidden enemy
    if (!freeCast && this._kitDeny(c, sk, m)) return; // spend gate, no shadow / pins / turrets / package / ally ...
    if (hold && ph === 'down') { this._holdStart(c, slot, sk, m); return; }
    if (c._hold && !(hold && ph === 'up')) this._holdEnd(c); // casting anything else cancels a charge at no cost
    if (hold && ph === 'up') this._holdEnd(c);
    if (hold) sk = this._holdScale(sk, holdF);
    // v6 spend (resources): u = units consumed, effects are applied on a per-unit basis
    const spend = sk.spend;
    const spendUnits = spend && !freeCast ? Math.floor(Math.min(c._res?.[spend.res] ?? 0, spend.max)) : 0;
    if (spendUnits > 0) sk = this._spendScale(sk, spend, spendUnits);
    this._reveal(c);
    const blueCdr = (c._blueBuffUntil || 0) > t ? 0.15 : 0;
    let rankDmgMul = 1 + (rank - 1) * 0.12;
    if (m._echo) rankDmgMul *= (m.echoMul || 1);
    const castOx = c.x, castOy = c.y;
    if (!freeCast) {
      if (this.noMana && isLocal) c.mana = c.maxMana;
      else c.mana -= sk.mana;
      if (spend && spendUnits > 0) c._res[spend.res] -= spendUnits;
      if (sk.recast) c._recast[slot] = { until: t + (sk.recast.ms || 3000), x0: castOx, y0: castOy };
      const cdMs = R.skillCooldownMs(sk.cd, (c._haste || 0) + blueCdr, rank);
      c[key] = (this.noCd && isLocal) ? 0 : t + cdMs;
      // v6 timebox: remember the cooldown length this cast started (W / R excluded by the spec)
      if (c._tbox && c._tbox.until > t && sk.type !== 'timebox' && !(c._tbox.exclude || []).includes(slot)) c._tbox.spent[slot] = cdMs;
      // v6 echo: the next non-excluded cast disarms the echo and queues a free copy
      if (c._echo && c._echo.until > t && sk.type !== 'echo' && !c._echo.exclude.includes(slot)) {
        const ec = c._echo; c._echo = null;
        this._echoQueue(c, slot, m, castOx, castOy, ec);
      }
    }
    c.action = slot; c.action_seq++;
    this._cancelRecall(c);
    // v6 echo copies run no passives / augments / item procs
    const roleP = m._echo ? null : championPassive(CHAMPIONS[c.champ])?.id;
    const srcP = m._echo ? new Set() : itemPassives(c.items);
    const augs = m._echo ? [] : (c.augments || []);
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
    const healing = !!(sk.heal || sk.shield || sk.self?.heal || sk.self?.shield || sk.tether || sk.link || sk.type === 'allies'); // v6: tether / link count as healing; v6.1: so does self{}
    if (roleP === 'uptime_pulse' && healing) {
      c.cdR = Math.max(t, (c.cdR || 0) - 2000);
      c._spMsUntil = Math.max(c._spMsUntil || 0, t + 1500); c._spMsPct = Math.max(c._spMsPct || 0, 0.15);
    }
    if (healing && augs.includes('shared_resources')) {
      c.hp = Math.min(c.maxHp, c.hp + 40);
    }
    if ((sk.heal || sk.tether || sk.link || sk.type === 'allies') && augs.includes('evo_ops_field')) {
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
    if (slot === 'r' && c.champ === 'embedded' && augs.includes('evo_volt_overdrive')) c._servoOverdriveUntil = t + 4000;
    const skDmgType = skillDamageType(sk);
    const amt = (spec) => R.scaledAmount(spec, c.level, c.ad, c.ap, c.maxHp) * rankDmgMul;
    const fx = (p) => this.emit('fx', m._echo ? { ...p, echo: true } : p); // echo copies tag every fx
    let strikePhase = false; // true while a suppress strike resolves (its CC already ran at the channel start)
    const effects = (e) => {
      if (!e.champ && e.kind !== 'dummy') return;
      // v5 mark / detonate / silence (v6: the generic marks replace the per-champion specials)
      if (sk.detonate && e._marks && e._marks[sk.detonate.tag]) {
        const mk = e._marks[sk.detonate.tag]; delete e._marks[sk.detonate.tag];
        if (mk.until > t && mk.n > 0) this._damage(e, amt(sk.dmg) * (sk.detonate.pctPerStack || 0.2) * mk.n, c, false, true, 'true');
      }
      if (sk.mark && this._alive(e)) {
        e._marks = e._marks || {};
        const cur = e._marks[sk.mark.tag], n0 = cur && cur.until > t ? cur.n : 0;
        e._marks[sk.mark.tag] = { n: Math.min(sk.mark.max || 1, n0 + 1), until: t + (sk.mark.ms || 5000) };
      }
      if (sk.silence) e.silencedUntil = Math.max(e.silencedUntil || 0, t + (sk.silence.ms || 0));
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
      if (!strikePhase && this._alive(e)) this._ccApplyAll(c, sk, e); // v6.1: airborne charm fear taunt blind disarm (+ suppress without strikeAtEnd)
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
    const hit = (e, extra = 0, from = null, mul = 1, inChain = false, isReturn = false) => {
      if (!this._alive(e)) return;
      if (e.champ && (e._spellShieldUntil || 0) > this.t) {
        e._spellShieldUntil = 0;
        fx({ k: 'hit', id: e.id, color: 0xffffff });
        if (!strikePhase) this._ccApplyAll(c, sk, e, true); // v6.1: ccBlock why 'shield' for every CC of the skill
        return;
      }
      const wasChampAlive = !!e.champ && !e.dead;
      const useTrue = !!(isReturn && sk.returnTrueDmg);
      this._damage(e, (amt(sk.dmg) + extra) * mul, c, false, useTrue, useTrue ? 'true' : skillDamageType(sk));
      effects(e);
      if (sk.killReset && wasChampAlive && !this._alive(e)) {
        c[key] = 0;
        fx({ k: 'buff', sid: c.id, slot, color: 0xffd23f });
      }
      if ((e.champ || e.kind === 'dummy') && sk.healOnHit && !c.dead) c.hp = Math.min(c.maxHp, c.hp + amt(sk.healOnHit));
      if ((e.champ || e.kind === 'dummy') && sk.cdRefundOnHit) {
        const refMs = sk.cdRefundOnHit.ms || 1000;
        const sls = sk.cdRefundOnHit.slot === 'all' ? ['q', 'w', 'e', 'r'] : [sk.cdRefundOnHit.slot || slot];
        for (const sl of sls) {
          const k2 = `cd${sl.toUpperCase()}`;
          if ((c[k2] || 0) > this.t) c[k2] = Math.max(this.t, c[k2] - refMs);
        }
      }
      fx({ k: 'hit', id: e.id, color: sk.color });
      if (this._alive(e)) {
        if (sk.pull && e.team !== 'neutral' && !R.EPICS[e.kind]) {
          const pdx = c.x - e.x, pdy = c.y - e.y, pd = Math.hypot(pdx, pdy) || 1;
          const pullDist = Math.min(Math.max(0, pd - (this._radius(e) + CHAMP_RADIUS + 36)), sk.pullDist || 650);
          if (pullDist > 20) this._knock(e, c.x - pdx * 2, c.y - pdy * 2, pullDist, 0);
        } else if (sk.pullIn && from) {
          const pdx = from.x - e.x, pdy = from.y - e.y, pd = Math.hypot(pdx, pdy) || 1;
          const pullDist = Math.min(pd * 0.65, sk.pullInDist || 160);
          if (pullDist > 15) this._knock(e, e.x - pdx, e.y - pdy, pullDist, 0);
        } else if (sk.knockback && from) {
          this._knock(e, from.x, from.y, sk.knockback.dist, sk.wallStun?.ms || 0);
        }
      }
      if (sk.chain && !inChain) {
        const bounces = Math.max(1, sk.chain.bounces || 2), rng = sk.chain.range || 360, decay = sk.chain.decay || 0.85;
        const seen = new Set([e.id]);
        let prev = e, curMul = mul;
        for (let b = 0; b < bounces; b++) {
          curMul *= decay;
          const nxt = enemies((x) => !seen.has(x.id) && dist(x, prev) <= rng).sort((a, z) => (!!z.champ - !!a.champ) || dist(a, prev) - dist(z, prev))[0];
          if (!nxt) break;
          seen.add(nxt.id);
          fx({ k: 'zap', x0: Math.round(prev.x), y0: Math.round(prev.y), x1: Math.round(nxt.x), y1: Math.round(nxt.y), color: sk.color });
          hit(nxt, 0, prev, curMul, true);
          prev = nxt;
        }
      }
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
    const ctx = { c, m, slot, key, t, amt, fx, hit, enemies, towardRange, aimX, aimY, castOx, castOy, rankDmgMul, getSk: () => sk, setSk: (s) => { sk = s; } };
    const dispatch = () => { switch (sk.type) {
      case 'projectile': {
        const dx = aimX - c.x, dy = aimY - c.y, d = Math.hypot(dx, dy) || 1;
        const base0 = Math.atan2(dy / d, dx / d);
        const launch = (base) => {
        const count = Math.max(1, sk.count | 0 || 1), spread = count > 1 ? ((sk.spread || 0) * Math.PI) / 180 : 0;
        const hitSet = new Set(), from = { x: c.x, y: c.y };
        for (let i = 0; i < count; i++) {
          const an = base + (count > 1 ? (i / (count - 1) - 0.5) * spread : 0), ux = Math.cos(an), uy = Math.sin(an);
          fx({ k: 'proj', sid: c.id, slot, x: Math.round(c.x), y: Math.round(c.y), dx: ux, dy: uy, speed: sk.speed, range: sk.range, width: sk.width, color: sk.color, boomerang: !!sk.boomerang });
          const x1 = c.x + ux * sk.range, y1 = c.y + uy * sk.range;
          const hits = enemies((e) => !hitSet.has(e.id) && (!sk.champOnly || this._champTargetOk(e)) && distToSeg(e.x, e.y, c.x, c.y, x1, y1) <= sk.width / 2 + this._radius(e))
            .map((e) => ({ e, d: (e.x - c.x) * ux + (e.y - c.y) * uy })).filter((h) => h.d > 0).sort((a, b) => a.d - b.d);
          const pierceOut = !!(sk.pierce || sk.boomerang);
          for (const h of pierceOut ? hits : hits.slice(0, 1)) {
            hitSet.add(h.e.id); // one cast = one shared hit set (a fan hits each target once)
            this._timers.push([t + (h.d / sk.speed) * 1000, () => hit(h.e, 0, from)]);
          }
          if (sk.boomerang) {
            const retAt = t + (sk.range / sk.speed) * 1000;
            this._timers.push([retAt, () => {
              if (!this._alive(c)) return;
              const retHit = new Set();
              const rhits = enemies((e) => !retHit.has(e.id) && distToSeg(e.x, e.y, x1, y1, c.x, c.y) <= sk.width / 2 + this._radius(e))
                .map((e) => ({ e, d: dist(e, { x: x1, y: y1 }) })).sort((a, b) => a.d - b.d);
              for (const h of rhits) {
                retHit.add(h.e.id);
                this._timers.push([this.t + (h.d / sk.speed) * 1000, () => hit(h.e, 0, c, sk.returnMul || 1.15, false, true)]);
              }
            }]);
          }
        }
        };
        if (sk.global) { // v6.1 map-wide shot: public gping at cast, caster locked for windupMs (moveSlow 0.5), then the bolt launches
          const ox = c.x, oy = c.y, dd = Math.hypot(aimX - ox, aimY - oy) || 1;
          const end = this.world.clampToMap(ox + Math.cos(base0) * Math.min(dd, sk.range), oy + Math.sin(base0) * Math.min(dd, sk.range));
          const wu = { until: t + (sk.windupMs || 0), moveSlow: 0.5 };
          c._windup = wu; c._order = null; c._nav = null;
          this._emitRaw('fx', { k: 'gping', sid: c.id, x0: Math.round(ox), y0: Math.round(oy), x1: Math.round(end.x), y1: Math.round(end.y), ms: CCT.GLOBAL_WARN_MS }); // BOTH teams
          this._timers.push([wu.until, () => {
            if (c._windup !== wu) return; // a hard CC (or death) cancelled the shot: mana already spent
            c._windup = null;
            if (!this._alive(c) || this._hardCc(c)) return;
            launch(base0);
          }]);
          break;
        }
        launch(base0);
        break;
      }
      case 'circle': {
        const pet = sk.at === 'pet' ? this._petOf(c) : null;
        const p = pet ? { x: pet.x, y: pet.y } : sk.range ? towardRange(sk.range) : { x: c.x, y: c.y };
        if (sk.trap) {
          const tr = sk.trap, maxActive = Math.max(1, tr.maxActive || 3);
          const owned = this._traps.filter((tp) => tp.ownerId === c.id && tp.slot === slot);
          if (owned.length >= maxActive) {
            const idx = this._traps.indexOf(owned[0]);
            if (idx >= 0) {
              fx({ k: 'trapEnd', tid: owned[0].tid });
              this._traps.splice(idx, 1);
            }
          }
          const dur = Math.max(1000, tr.durationMs || 25000);
          const tid = `tr_${++this._uid}`;
          this._traps.push({
            tid, owner: c, ownerId: c.id, team: c.team, slot, x: p.x, y: p.y, r: sk.radius || 95,
            armedAt: t + Math.max(0, tr.armMs || 450), until: t + dur, color: sk.color,
            onHit: (vic) => hit(vic, 0, p),
          });
          if (c.team === 'blue') {
            fx({ k: 'zone', sid: c.id, team: c.team, slot, tid, trap: true, stealthAfterMs: 3000, x: Math.round(p.x), y: Math.round(p.y), r: sk.radius || 95, ms: dur, tickMs: 1200, color: sk.color });
          } else if (!this._hiddenFrom(c, 'blue') && this._teamSeesTrap('blue', p.x, p.y)) {
            fx({ k: 'zone', sid: c.id, team: c.team, slot, tid, trap: true, fadingStealth: true, x: Math.round(p.x), y: Math.round(p.y), r: sk.radius || 95, ms: 3000, tickMs: 1200, color: sk.color });
          }
          break;
        }
        // v6 alsoAtShadow (Zero E): a second identical area at the shadow; each target is hit at most once per cast
        const centers = [p];
        if (sk.alsoAtShadow && c._shadow && c._shadow.until > t) centers.push({ x: c._shadow.x, y: c._shadow.y });
        for (const ctr of centers) fx({ k: 'circle', sid: c.id, slot, x: Math.round(ctr.x), y: Math.round(ctr.y), r: sk.radius, delay: sk.delay || 0, color: sk.color, ...(sk.inner ? { inner: sk.inner } : {}) });
        const sk0 = sk;
        this._timers.push([t + (sk0.delay || 0), () => {
          const seen = new Set();
          for (const ctr of centers) for (const e of enemies((e) => !seen.has(e.id) && dist(e, ctr) <= sk0.radius + this._radius(e) && dist(e, ctr) >= (sk0.inner || 0))) { seen.add(e.id); hit(e, 0, ctr); }
        }]);
        break;
      }
      case 'zone': {
        const p = sk.range ? towardRange(sk.range) : { x: c.x, y: c.y };
        const tick = Math.max(100, sk.tickMs || 500), dur = Math.max(tick, sk.duration || 3000);
        fx({ k: 'zone', sid: c.id, slot, x: Math.round(p.x), y: Math.round(p.y), r: sk.radius, ms: dur, tickMs: tick, color: sk.color, ...(sk.inner ? { inner: sk.inner } : {}) });
        for (let k = 1; k * tick <= dur; k++) {
          this._timers.push([t + k * tick, () => {
            if (this.state.phase !== 'playing') return;
            for (const e of enemies((e) => dist(e, p) <= sk.radius + this._radius(e) && dist(e, p) >= (sk.inner || 0))) hit(e, 0, p);
            if (sk.heal) this.state.champions.forEach((a) => { if (!a.dead && a.team === c.team && dist(a, p) <= sk.radius) a.hp = Math.min(a.maxHp, a.hp + amt(sk.heal)); });
          }]);
        }
        break;
      }
      case 'target': {
        const e = this._ent(m.id);
        if (e && e.kind !== 'pet' && this._alive(e) && this._isTargetable(e) && e.team !== c.team && (sk.targets !== 'enemyChamp' || this._champTargetOk(e)) && dist(c, e) <= sk.range + 80) {
          fx({ k: 'tgt', sid: c.id, slot, x0: Math.round(c.x), y0: Math.round(c.y), x1: Math.round(e.x), y1: Math.round(e.y), color: sk.color });
          if (sk.shadowAt === 'origin') this._shadowSet(c, c.x, c.y, def.skills.q?.shadow?.ms || 6000); // Zero-Day leaves a shadow where you stood
          if (sk.behindTarget) {
            const x0 = c.x, y0 = c.y, d = dist(c, e) || 1, ux = (e.x - x0) / d, uy = (e.y - y0) / d;
            const b = this.world.clampToMap(e.x + ux * (this._radius(e) + CHAMP_RADIUS + 14), e.y + uy * (this._radius(e) + CHAMP_RADIUS + 14));
            const bp = this.nav.nearestFree(b.x, b.y, CHAMP_RADIUS);
            c.x = bp.x; c.y = bp.y; c._order = null; c._nav = null;
            fx({ k: 'blink', sid: c.id, x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(c.x), y1: Math.round(c.y) });
          }
          if (sk.suppress?.strikeAtEnd) { // v6.1 Zero R: the channel locks both bodies; the hit lands at the end (3.4)
            const skS = sk;
            this._suppressCast(c, e, skS, key, (ee) => {
              strikePhase = true;
              hit(ee, skS.execute ? skS.execute.missingHpPct * (ee.maxHp - ee.hp) : 0, { x: c.x, y: c.y });
              strikePhase = false;
            });
          } else hit(e, sk.execute ? sk.execute.missingHpPct * (e.maxHp - e.hp) : 0, { x: c.x, y: c.y });
        }
        break;
      }
      case 'dash': {
        const x0 = c.x, y0 = c.y, tgt = sk.toTarget ? this._ent(m.id) : null;
        const okT = !!tgt && tgt.kind !== 'pet' && this._alive(tgt) && tgt.team !== c.team && !isStruct(tgt)
          && (sk.targets !== 'enemyChamp' || this._champTargetOk(tgt)) && dist(c, tgt) <= sk.range + 100;
        let want;
        if (okT) {
          const d = dist(c, tgt) || 1;
          const reach = sk.behindTarget
            ? Math.min(sk.range + this._radius(tgt) + CHAMP_RADIUS, d + this._radius(tgt) + CHAMP_RADIUS + 12)
            : Math.max(0, Math.min(sk.range, d - (this._radius(tgt) + CHAMP_RADIUS)));
          want = this.world.clampToMap(x0 + ((tgt.x - x0) / d) * reach, y0 + ((tgt.y - y0) / d) * reach);
        } else want = towardRange(sk.range);
        let p = sk.behindTarget ? this.nav.nearestFree(want.x, want.y, CHAMP_RADIUS) : this.nav.clipMove(x0, y0, want.x, want.y, CHAMP_RADIUS);
        if (!sk.behindTarget && !sk.phase) { const co = this._clipObjs(x0, y0, p.x, p.y, CHAMP_RADIUS); if (co.hit) p = { x: co.x, y: co.y }; } // barricades / barriers stop dashes
        let phased = null;
        if (sk.phase && !sk.behindTarget) { // v6.1 phase dash: crosses thin walls, barriers and barricades; lands on a free cell
          phased = this._phasePath(x0, y0, want.x, want.y, sk.phase.maxWall);
          p = { x: phased.x, y: phased.y };
        }
        let end = p, struck = [];
        if (okT) {
          if (sk.behindTarget || dist(p, tgt) <= this._radius(tgt) + CHAMP_RADIUS + Math.max(sk.hitRadius || 0, 40)) struck = [tgt];
        } else if (sk.hitRadius) {
          struck = enemies((e) => distToSeg(e.x, e.y, x0, y0, p.x, p.y) <= sk.hitRadius + this._radius(e)
            && (!phased?.crossed || phased.free.some((s) => dist(e, s) <= sk.hitRadius + this._radius(e) + CCT.PHASE_STEP_PX / 2))) // hitRadius only counts on free samples
            .sort((a, b) => dist(a, c) - dist(b, c));
          const first = struck[0];
          if (first && sk.stopAtFirst) {
            struck = [first];
            const d = dist(c, first) || 1;
            end = this.nav.clipMove(x0, y0, first.x - ((first.x - x0) / d) * 50, first.y - ((first.y - y0) / d) * 50, CHAMP_RADIUS);
          }
        }
        c.x = end.x; c.y = end.y; c._order = null; c._nav = null;
        if (sk.invisMs > 0) c._stealthUntil = t + sk.invisMs;
        if (sk.untarget) this._untargetFor(c, sk.untarget.ms); // starts with the move; offline dashes are instant so total = ms
        fx({ k: 'dash', sid: c.id, slot, x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(c.x), y1: Math.round(c.y), color: sk.color, ...(phased?.crossed ? { phase: 1 } : {}), ...(sk.untarget ? { ghost: 1 } : {}) });
        if (sk.trail) {
          const tr = sk.trail, tp = { x: (x0 + c.x) / 2, y: (y0 + c.y) / 2 };
          const tick = Math.max(100, tr.tickMs || 500), dur = Math.max(tick, tr.duration || 3000);
          fx({ k: 'zone', sid: c.id, slot, x: Math.round(tp.x), y: Math.round(tp.y), r: tr.radius, ms: dur, tickMs: tick, color: sk.color });
          for (let k = 1; k * tick <= dur; k++) {
            this._timers.push([t + k * tick, () => {
              if (this.state.phase !== 'playing') return;
              for (const e of enemies((e) => dist(e, tp) <= tr.radius + this._radius(e))) {
                if (tr.dmg) this._damage(e, amt(tr.dmg), c, false, false, 'magic');
                if (tr.slow && e.champ) { e.slowUntil = Math.max(e.slowUntil || 0, this.t + (tr.slow.ms || 0)); e.slowPct = Math.max(e.slowPct || 0, Math.round(tr.slow.pct * 100)); }
              }
            }]);
          }
        }
        if (sk.dmg) for (const e of struck) hit(e, 0, { x: c.x, y: c.y });
        break;
      }
      case 'blink': {
        const x0 = c.x, y0 = c.y, tr0 = towardRange(sk.range), co = this._clipObjs(x0, y0, tr0.x, tr0.y, CHAMP_RADIUS); // v6.1: blinks stop at a barrier / barricade too
        const tr = co.hit ? { x: co.x, y: co.y } : tr0, p = this.nav.nearestFree(tr.x, tr.y, CHAMP_RADIUS);
        c.x = p.x; c.y = p.y; c._order = null; c._nav = null;
        if (sk.invisMs > 0) c._stealthUntil = t + sk.invisMs;
        if (sk.untarget) this._untargetFor(c, sk.untarget.ms);
        fx({ k: 'blink', sid: c.id, slot, x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(c.x), y1: Math.round(c.y), ...(sk.untarget ? { ghost: 1 } : {}) });
        break;
      }
      case 'swap': {
        const reach = (sk.range || 600) + 40;
        const okAlly = (a) => a && a !== c && !a.dead && a.team === c.team && dist(a, c) <= reach;
        let ally = m.id ? this.state.champions.get(m.id) : null; // the client-chosen ally (targets:'ally') wins
        if (!okAlly(ally)) {
          ally = null;
          let best = 220;
          this.state.champions.forEach((a) => {
            if (!okAlly(a)) return;
            const d = Math.hypot(a.x - aimX, a.y - aimY);
            if (d <= best) { best = d; ally = a; }
          });
        }
        if (!ally || c.rootedUntil > t) { c[key] = 0; c.mana = Math.min(c.maxMana, c.mana + sk.mana); break; } // no ally, or rooted
        const cx = c.x, cy = c.y, ax = ally.x, ay = ally.y;
        c.x = ax; c.y = ay; c._order = null; c._nav = null;
        ally.x = cx; ally.y = cy; ally._order = null; ally._nav = null;
        this._suppressBroken(ally, 'teleport');
        fx({ k: 'blink', sid: c.id, slot, x0: Math.round(cx), y0: Math.round(cy), x1: Math.round(ax), y1: Math.round(ay) }); // one fx links both ends
        for (const a of [c, ally]) {
          if (sk.shield) { a.shield = Math.round(amt(sk.shield)); a._shieldUntil = t + (sk.duration || 3000); }
          if (sk.buff) this._setBuff(a, slot, sk.buff, sk.duration || 3000);
        }
        fx({ k: 'buff', sid: c.id, slot, color: sk.color });
        break;
      }
      case 'self':
      case 'allies': {
        const group = sk.type === 'self' ? [c] : [...this.state.champions.values()].filter((a) => !a.dead && a.team === c.team && dist(a, c) <= sk.radius);
        for (const a of group) {
          if (sk.heal) a.hp = Math.min(a.maxHp, a.hp + amt(sk.heal));
          if (sk.shield) { a.shield = Math.round(amt(sk.shield)); a._shieldUntil = t + (sk.duration || 3000); }
          if (sk.buff) this._setBuff(a, slot, sk.buff, sk.duration || 3000);
          if (sk.spellShieldMs > 0) a._spellShieldUntil = Math.max(a._spellShieldUntil || 0, t + sk.spellShieldMs);
          if (sk.reviveGuard) { a._reviveUntil = t + sk.reviveGuard.ms; a._reviveCfg = sk.reviveGuard; } // v6.1: armed until consumed / expired (tag cc:revive)
          if (sk.invisMs > 0 && a === c) a._stealthUntil = t + sk.invisMs;
          if (sk.stasis && a === c) { a._stasisUntil = t + sk.stasis.ms; a.stunnedUntil = Math.max(a.stunnedUntil || 0, t + sk.stasis.ms); a.rootedUntil = Math.max(a.rootedUntil || 0, t + sk.stasis.ms); }
        }
        if (sk.resetOnCast) for (const sl of sk.resetOnCast) c[`cd${sl.toUpperCase()}`] = 0; // Rush R: Pick Up Order is ready again
        if (sk.tipMul) c._tipMulUntil = t + (sk.tipMul.ms || 0);
        if (sk.heal) fx({ k: 'heal', sid: c.id, slot, x: Math.round(c.x), y: Math.round(c.y), r: sk.radius || 120, color: sk.color });
        fx({ k: 'buff', sid: c.id, slot, color: sk.color });
        break;
      }
      // ── v6 kit types (rules: docs/02_CHAMPIONS_AND_SKILLS.md [v6 numbering] section 4) ──
      case 'stance': {
        c._stance = nextStance(sk, c._stance);
        c._recast = {}; // a stance switch closes every open recast window
        if (sk.shield) { c.shield = Math.round((c.shield || 0) + amt(sk.shield)); c._shieldUntil = Math.max(c._shieldUntil || 0, t + (sk.duration || 3000)); }
        if (sk.buff) this._setBuff(c, slot, sk.buff, sk.duration || 3000);
        fx({ k: 'stance', sid: c.id, name: c._stance });
        // Stack: the toggle re-filters the owner's live portals
        for (const o of this._objs) if (o.kind === 'portal' && o.owner === c.id) { o.filter = c._stance === 'allies' ? 'allies' : 'open'; fx({ k: 'objUpd', oid: o.oid, filter: o.filter }); }
        break;
      }
      case 'shadow': {
        if (sk.shadow?.mode === 'place') {
          const tr = towardRange(sk.range), p = this.nav.nearestFree(tr.x, tr.y, CHAMP_RADIUS);
          this._shadowSet(c, p.x, p.y, sk.shadow.ms || 6000);
        } else { // swap
          const sh = c._shadow, cx = c.x, cy = c.y;
          if (!sh || sh.until <= t) { c[key] = 0; c.mana = Math.min(c.maxMana, c.mana + sk.mana); break; }
          const p = this.nav.nearestFree(sh.x, sh.y, CHAMP_RADIUS);
          c.x = p.x; c.y = p.y; c._order = null; c._nav = null;
          sh.x = cx; sh.y = cy; // the shadow keeps its remaining time
          if (sk.invisMs > 0) c._stealthUntil = t + sk.invisMs;
          if (sk.buff) this._setBuff(c, slot, sk.buff, sk.duration || 1500);
          fx({ k: 'blink', sid: c.id, slot, x0: Math.round(cx), y0: Math.round(cy), x1: Math.round(c.x), y1: Math.round(c.y), shadow: true });
          fx({ k: 'shadow', sid: c.id, x: Math.round(sh.x), y: Math.round(sh.y), ms: Math.max(0, sh.until - t) });
        }
        break;
      }
      case 'tether': {
        const ally = this._allyFor(c, sk, m, false);
        if (!ally) { c[key] = 0; c.mana = Math.min(c.maxMana, c.mana + sk.mana); break; }
        if (c._tether) this._tetherEnd(c);
        const tp = sk.tether, tid = `th_${++this._uid}`;
        c._tether = { tid, to: ally.id, until: t + tp.durationMs, next: t + Math.max(K.TETHER_MIN_TICK_MS, tp.tickMs), spec: sk, amount: amt(tp.heal) };
        fx({ k: 'tether', tid, sid: c.id, to: ally.id, ms: tp.durationMs, color: sk.color });
        break;
      }
      case 'link': {
        const pr = this._linkPair(c, sk, m);
        if (!pr) { c[key] = 0; c.mana = Math.min(c.maxMana, c.mana + sk.mana); break; }
        const lp = sk.link;
        if (c._linkOwn) this._linkEnd(c._linkOwn);
        const rec = { lid: `lk_${++this._uid}`, a: pr.a.id, b: pr.b.id, owner: c.id, until: t + lp.ms, sharePct: lp.sharePct, breakRange: lp.breakRange, fxAt: 0 };
        c._linkOwn = rec;
        for (const e of [pr.a, pr.b]) { if (e._link && e._link !== rec) e._link = null; e._link = rec; }
        for (const e of [pr.a, pr.b]) e.hp = Math.min(e.maxHp, e.hp + amt(lp.heal) * this._healMul(e));
        fx({ k: 'link', lid: rec.lid, a: pr.a.id, b: pr.b.id, ms: lp.ms, color: sk.color });
        break;
      }
      case 'echo': {
        const ep = sk.echo;
        c._echo = { until: t + ep.armMs, delayMs: ep.delayMs, mulPct: ep.mulPct, exclude: ep.exclude || [] };
        fx({ k: 'echo', sid: c.id, ms: ep.armMs });
        break;
      }
      case 'timebox': {
        const tb = sk.timebox;
        c._tbox = { until: t + tb.ms, spent: {}, exclude: tb.exclude || [], refundPct: tb.refundPct };
        if (tb.buff) this._setBuff(c, slot, tb.buff, tb.ms);
        fx({ k: 'timebox', sid: c.id, ms: tb.ms });
        break;
      }
      case 'pickup': {
        c._pkg = { since: t, dist: 0, lx: c.x, ly: c.y };
        this._recalc(c, false);
        fx({ k: 'pkg', sid: c.id, on: true, tip: Math.round(this._pkgTip(c) * 100) });
        break;
      }
      default: { const h = KIT_HANDLERS[sk.type]; if (h) this[h](ctx, dispatch); break; } // v6.1: a new primitive = one KIT_HANDLERS entry + one method
    } };
    if (sk.self && SELF_TYPES.has(sk.type)) this._applySelf(ctx, sk.self); // v6.1: self{} lands at CAST START, before any delay
    if (sk.untarget && sk.type !== 'dash' && sk.type !== 'blink') this._untargetFor(c, sk.untarget.ms); // movement skills start it with the move
    dispatch();
    // v6 post-cast: Brew mix, Model/Swipe shield per spent unit
    if (sk.addMix && def.kit?.mix) {
      c._mix.push(sk.addMix);
      while (c._mix.length > def.kit.mix.max) c._mix.shift();
      c._mixAt = t;
    }
    if (spendUnits > 0 && spend.per?.shield) {
      c.shield = Math.round((c.shield || 0) + amt(scaleAmt(spend.per.shield, spendUnits)));
      c._shieldUntil = Math.max(c._shieldUntil || 0, t + (sk.duration || 3000));
    }
  }

  // ───────────────────────── v3: summoner spells (rough mirror of the server) ─────────────────────────
  /** May a `targets: 'enemyChamp'` skill hit `e`? (Story Mode 2.0 lets it hit bugs and nests.) */
  _champTargetOk(e) { return !!(e.champ || e.kind === 'dummy'); }

  /** Healing multiplier (Escalate / ignite cuts all healing). */
  _healMul(c) { return c._ignite && c._ignite.until > this.t ? 1 - (SPELLS.ignite.healCut || 0) : 1; }

  /** `spell {slot:'d'|'f', x, y, id?}` — returns true if it went off. */
  _spell(c, m) {
    const slot = m?.slot === 'f' ? 'F' : m?.slot === 'd' ? 'D' : null;
    if (!slot || this.state.phase !== 'playing') return false;
    const t = this.t, sp = SPELLS[c['spell' + slot]];
    this._tickSpellCharges(c, t);
    if (!sp || c.dead || c.stunnedUntil > t || this._noSpell(c, t) || c[`cd${slot}`] > t) return false;
    if (sp.maxCharges > 1 && (c[`charges${slot}`] || 0) <= 0) return false;
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
    const augMul = c.augments?.includes('flash_cache') ? 0.8 : 1;
    const scaledCdMs = spellCooldownMs(sp, c.level, augMul);
    if (this.noCd && c.id === this.localId) {
      c[`cd${slot}`] = 0;
      c[`charges${slot}`] = spellInitialCharges(sp.id);
      c[`_spellRech${slot}`] = 0;
      c[`_spellCastCd${slot}`] = 0;
    } else if (sp.maxCharges > 1) {
      const nextChg = Math.max(0, (c[`charges${slot}`] ?? sp.maxCharges) - 1);
      c[`charges${slot}`] = nextChg;
      if (!c[`_spellRech${slot}`]) c[`_spellRech${slot}`] = t + scaledCdMs;
      const castCdAt = t + Math.round((sp.castCd || 10) * 1000 * augMul);
      c[`_spellCastCd${slot}`] = castCdAt;
      c[`cd${slot}`] = nextChg > 0 ? castCdAt : Math.max(castCdAt, c[`_spellRech${slot}`]);
    } else {
      c[`cd${slot}`] = t + scaledCdMs;
    }
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

// TeamRoom — Team Mode "Office Siege": a server-authoritative 5v5 office MOBA.
// Contract: .claude/context/tasks/TEAM_MODE_BREAKDOWN.md §3 (frozen).
//
// 🚀 Startup (blue, bottom-left) vs 🏢 MegaCorp (red, top-right). Bots fill
// every empty slot. Phases: lobby (30–45 s, or everyone READY) → select → loading →
// playing → ended (winner shown END_LINGER_MS, then everyone is disconnected).
//
// Layout of this file:
//   lifecycle (onCreate/onAuth/onJoin/onLeave) · population + match flow
//   intents (_doOrder/_doCast/_doBuy/_doRecall — humans AND bots call these)
//   tick (champions, minions, monsters, towers, shots, fountain, waves, camps)
//   combat core (_dealDamage, CC, shields, buffs) · deaths + rewards · sync
//
// The simulation runs on plain float records (this.champs / units / structs);
// the schema objects in state are a rounded mirror written once per tick.
// Every number comes from shared/moba/*.js; server-only knobs live in
// server/game/moba/tuning.js, copy in server/game/moba/lines.js.
//
// v2 "Walls & New Hires" (TEAM_MODE_V2_BREAKDOWN.md): every walker moves
// through Mover (cached findPath routes, wall pushOut), knockbacks displace
// over KNOCKBACK_MS (+ wallStun), and champions with a `pet` get an
// untargetable, invulnerable companion unit (kind 'pet', TeamUnit.owner).
//
// v3 "Draft Day" (TEAM_MODE_V3_BREAKDOWN.md): lobby (queue) → select (room
// locked; 10 draft seats in this.slots, bots draft at random times, humans
// pick / lock / spells) → loading (LOADING_MS, frozen at the fountain) →
// playing (champion records, bot brains and pets are created from the seats)
// → ended. Summoner spells (`spell` D/F, shared/moba/spells.js) live in _doSpell.
//
// Pass 2 (PASS2_BREAKDOWN.md): player ids (join option `pid` → public id) — one live session per
// player (Presence: DUP_TAB / IN_MATCH), seats held for the WHOLE match (manual reconnection, the
// client keeps the token) with an abandon timer, ranked results at the end (Ranking), `sell`, and
// a longer quick-play queue with a ready check (`ready` / startNow).
import { Room } from '@colyseus/core';
import { StateView } from '@colyseus/schema';
import {
  TEAM_SIZE, TEAMS, TEAM_INFO, LOBBY_MS, LOBBY_JOIN_EXTEND_MS, LOBBY_MAX_MS, LOBBY_FULL_MS, END_LINGER_MS, TICK_MS,
  sellValue, ABANDON_MS, ABANDON_EMPTY_MS,
  SELECT_MS, SELECT_BOT_PICK_MS, SELECT_ALL_LOCKED_MS, LOADING_MS, PICK_RATE_MS,
  MAX_LEVEL, XP_TABLE, ULT_UNLOCK_LEVEL, levelForXp,
  START_GOLD, PASSIVE_GOLD_PER_SEC, PASSIVE_GOLD_DELAY_MS, KILL_GOLD, ASSIST_GOLD, FIRST_BLOOD_BONUS, bountyBonus,
  TOWER_GOLD_TEAM, ASSIST_WINDOW_MS, XP_SHARE_RADIUS, KILL_XP_BASE, KILL_XP_PER_VICTIM_LEVEL,
  respawnMs, RECALL_MS, FOUNTAIN_RADIUS, FOUNTAIN_HEAL_PER_SEC, FOUNTAIN_MANA_PER_SEC, FOUNTAIN_LASER_DPS,
  SHOP_ONLY_IN_FOUNTAIN, INVENTORY_SLOTS, damageAfterArmor, damageAfterResist, applyHardCcDuration, campScaleAt, OUT_OF_COMBAT_MS, HP_REGEN_PCT_PER_SEC,
  MANA_REGEN_PCT_PER_SEC, MOVE_ORDER_RATE_MS, CAST_RATE_MS,
  WAVE_FIRST_MS, WAVE_EVERY_MS, SIEGE_EVERY_N_WAVES, WAVE_COMPOSITION, MINION_GROWTH_PER_WAVE, MINIONS,
  MINION_AGGRO_RANGE, TOWER, CORE, BACKDOOR_RADIUS, BACKDOOR_DAMAGE_MUL, CRUNCH_MS, CRUNCH_STRUCT_MUL,
  CAMPS as CAMP_TYPES, CAMP_LEASH_RADIUS, EPICS, statAt, MAX_HASTE_PCT, cooldownMs, skillCooldownMs,
  KNOCKBACK_MS, PET_SPEED_MUL, PET_LEASH, PET_OWNER_HIT_MEMORY_MS, scaledAmount,
  BUSH_REVEAL_MS, AUTO_AIM_SLACK, ROOM_NAME_MAX, ROOM_MAX_HUMANS,
  ROLLBACK_FROM_MS, ROLLBACK_VOTE_MS, ROLLBACK_COOLDOWN_MS, ROLLBACK_NEED, WARD,
} from '../../shared/moba/rules.js';
import { clipMove } from '../../shared/moba/nav.js';
import {
  FOUNTAIN, STRUCTURES, STRUCTURE_RADIUS, unlockedBy, CAMPS as CAMP_SPOTS, EPIC_SPOTS,
  CHAMP_RADIUS, MINION_RADIUS, clampToMap,
} from '../../shared/moba/map.js';
import { CHAMPIONS, CHAMPION_IDS, ROLE_ORDER, ROLE_PICKS, isChampionId, autoAimsAtEnemy, autoAimReach, championPassive } from '../../shared/moba/champions.js';
import { ITEMS, isItemId, itemStats, itemPassives, ownedActiveItem, buyBlocker, recipePlan, applyBuy } from '../../shared/moba/items.js';
import { AUGMENTS, AUGMENT_LEVELS, rollAugmentChoices } from '../../shared/moba/augments.js';
import { SPELLS, DEFAULT_SPELLS, ROLE_SPELLS, isSpellId, validSpellPair } from '../../shared/moba/spells.js';
import { TeamState, TeamChamp, TeamUnit, TeamStructure, TeamScore } from '../game/moba/schema.js';
import { SkillEngine, MIN_AIM_DIST } from '../game/moba/SkillEngine.js';
import { MobaBots, BOT_SKILL, botSkillFor } from '../game/moba/MobaBots.js';
import { LANE_IDS, otherTeam, dist, minionPath, bushAtFast } from '../game/moba/geo.js';
import { Mover, freeSpot, resolveWalls, nearWall } from '../game/moba/Mover.js';
import {
  MAX_HUMANS, PATCH_MS, NAME_MAX, CHAT_MAX, CHAT_RATE_MS, CHAT_LOG_MAX, BUY_RATE_MS, RECALL_RATE_MS,
  ATK_PROJ_SPEED, MAX_ATTACK_SPEED, RANGE_SLACK, TARGET_CAST_SLACK, UNIT_REMOVE_MS, MIN_MOVE_SPEED,
  TOWER_AGGRO_MS, TOWER_AGGRO_VICTIM_PAD, TOWER_MAX_RAMP_HITS,
  MINION_RETARGET_MS, MINION_CHAMP_AGGRO_MS, MINION_CHASE_RANGE, MINION_SPACING, MINION_LANE_CAP,
  MINION_TOTAL_CAP, WAYPOINT_REACHED, MINION_CORE_STOP, DEADLINE_MINION_HP_MUL,
  CAMP_SPAWN_MS, MONSTER_SPEED, MONSTER_RETURN_SPEED, MONSTER_REACH, EPIC_LEASH_RADIUS, DEADLINE_CLEAVE_RADIUS,
  FOUNTAIN_FX_MS, COFFEE_MAX_STACK, DEBUG_GOLD_DEFAULT, DEBUG_GOLD_MAX,
  PET_RADIUS, PET_ARRIVE, PET_CHASE_LEASH,
  SIDE_RATE_MS, INTEREST_RADIUS, VISION_EVERY_TICKS, VIEW_GC_MS,
  TEAM_RECONNECT_GRACE_S, VOTE_RATE_MS, VOTE_BOT_DELAY_MS,
} from '../game/moba/tuning.js';
import {
  KILL_LINES, EXECUTE_LINES, STREAKS, SHUTDOWN_MIN_STREAK, TOWER_NAMES, CORE_NAME,
  DISCONNECT_LINE, RECONNECT_LINES, RECONNECT_TIMEOUT_LINE,
  ROLLBACK_PASS_TITLE, ROLLBACK_PASS_SUB, ROLLBACK_FAIL_LINE, ROLLBACK_START_LINE,
} from '../game/moba/lines.js';
import { BOT_NAMES } from '../data/bots.js';
import { sanitizeHat } from '../data/cosmetics.js'; // EP-06: the arena's hat allowlist (server-arena owns it)
import { publicIdOf } from '../game/identity.js';
import { Presence } from '../game/Presence.js';
import { Ranking } from '../game/Ranking.js';
import { perfScore } from '../../shared/moba/ranks.js';

// Dev-only hooks are OPT-IN (fail-closed): start the server with BUG_SMASH_DEBUG=1.
const DEBUG_HOOKS = process.env.BUG_SMASH_DEBUG === '1';
const AUTO_TARGET_RADIUS = 170;   // point-and-click fallback (nearest enemy to the aim point)
const MAX_TICK_DT = 200;          // clamp long frames (GC pauses) so nothing teleports
const IGNITE_TICK_MS = 500;       // spells.js: ignite "ticks every 500 ms"
const SMITE_STEAL_WINDOW_MS = 4000; // enemy hit the epic this recently → a smite kill is a steal (feed line)

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clampPos = (v) => Math.max(0, Math.min(65535, Math.round(v)));
/** Keep the items of `arr` passing `keep` — in place, no allocation (v4 hot-loop hygiene). */
function prune(arr, keep) {
  let w = 0;
  for (let i = 0; i < arr.length; i++) if (keep(arr[i])) arr[w++] = arr[i];
  arr.length = w;
  return arr;
}
const GRID_CELL = 400;     // v4 unit buckets (nearest-enemy / range queries)
const GRID_COLS = 16;      // ⌈6000 / 400⌉ + 1
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
const clamp16 = (v) => Math.max(0, Math.min(65535, v));
const fmtTime = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const teamLabel = (t) => `${TEAM_INFO[t].emoji} ${TEAM_INFO[t].name}`;

/** Player-supplied name → printable, ≤ NAME_MAX chars. */
function sanitizeName(raw) {
  return cleanText(raw, NAME_MAX) || `Dev${Math.floor(100 + Math.random() * 900)}`;
}

/** Printable single-line text, ≤ max chars ('' if nothing usable). */
function cleanText(raw, max) {
  const s = typeof raw === 'string' ? raw : '';
  return s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// v4 auto-aim (§3.3): skill types whose aim falls back to the nearest visible enemy.
const AUTO_AIM_SKILLS = new Set(['projectile', 'circle', 'zone', 'dash', 'target']);
const VIEW_TEAMS = ['blue', 'red'];

export class TeamRoom extends Room {
  // ───────────────────────── lifecycle ─────────────────────────
  onCreate(options) {
    // v4: `team_custom` (define option custom:true) = a named room with a 'room' phase.
    const custom = options?.custom === true;
    this.maxClients = custom ? ROOM_MAX_HUMANS : MAX_HUMANS;
    this.setState(new TeamState());
    this.patchRate = PATCH_MS;
    const st0 = this.state;
    st0.custom = custom;
    if (custom) {
      st0.phase = 'room';
      st0.roomName = cleanText(options?.roomName, ROOM_NAME_MAX) || `${sanitizeName(options?.name)}'s room`.slice(0, ROOM_NAME_MAX);
    }
    // v4 visibility (§3.2): one shared StateView per team (+ 'all' for spectators). Colyseus
    // encodes each distinct view once per patch, so the cost is per TEAM, not per client.
    // The (still empty) collections are added so every client receives the maps themselves.
    this._views = {};
    for (const k of ['blue', 'red', 'all']) {
      const v = new StateView();
      v.add(st0.champions);
      v.add(st0.units);
      this._views[k] = v;
    }
    this._vis = new WeakMap();        // schema object -> { blue, red, all } = currently in that view
    this._bushOcc = { blue: new Set(), red: new Set() }; // bush ids holding a live champion of the team (last vision pass)
    this._viewGcAt = 0;
    this._atkOut = { blue: [], red: [] };
    this._lastSideAt = new Map();
    // v4 optimisation: reusable per-tick buffers + unit buckets.
    this._champArr = []; this._unitArr = []; this._dueBuf = []; this._nearBuf = [];
    this._grid = Array.from({ length: GRID_COLS * GRID_COLS }, () => []); // cell -> alive unit records, rebuilt once per tick

    this.slots = new Map();    // v3: sid -> draft entry (lobby / select / loading) — see _newSlot
    this.champs = new Map();   // sid -> champion record (created when the match starts playing)
    this.units = new Map();    // 'u<n>' -> minion / monster record
    this.structs = new Map();  // structure id -> structure record
    this.camps = new Map();    // camp id -> { id, type, side, x, y, unitIds:Set, attackers:Map, respawnAt }
    this._nextUnitId = 1;
    this._nextBotId = 1;
    this._timers = [];         // [{ at, fn }] — tick-driven (works with a fake clock)
    this._shots = [];          // delayed ranged auto-attacks / tower shots
    this._atkBatch = [];       // `atk` entries this tick
    this._chatLog = [];
    this._lastChatAt = new Map();
    this._firstBlood = false;
    this._waveNo = 0;
    this._nextWaveAt = 0;
    this._campsAt = 0;
    this._endAt = 0;
    this._closing = false;
    this._minionCount = 0;
    this._sepList = [];
    this.mover = new Mover();     // v2: wall-aware movement (cached routes)
    this.spellStats = { casts: {}, smiteEpics: 0, smiteSteals: 0 }; // v3 (harness / logs)
    this._knocked = new Set();    // v2: entities being displaced by a knockback
    // Experience Pass 1
    this._helloed = new WeakSet(); // EP-03: Client objects already welcomed (a reconnect is a NEW Client → welcomed again)
    this._away = new Set();        // EP-03: sids inside their reconnect grace (a bot holds the seat)
    this._votes = { blue: null, red: null };   // EP-04: active rollback vote per team (see _startVote)
    this._relics = [];
    for (const s of STRUCTURES) {
      if (s.kind !== 'tower' || s.tier !== 1) continue;
      const core = STRUCTURES.find((x) => x.team === s.team && x.kind === 'core');
      const dx = core.x - s.x, dy = core.y - s.y, d = Math.hypot(dx, dy) || 1;
      this._relics.push({ id: `relic_${s.id}`, team: s.team, x: Math.round(s.x + (dx / d) * 185), y: Math.round(s.y + (dy / d) * 185), upAt: 0 });
    }
    this._relicsDirty = true;
    this._voteCd = { blue: 0, red: 0 };        // EP-04: no new vote before this (server ms) after a failed one
    this._lastVoteAt = new Map();              // EP-04: sid -> last processed `vote` (rate limit)
    // Pass 2
    this._pubs = new Map();        // sid -> public player id ('' = no id: unranked, no presence)
    this._holds = new Map();       // sid -> Colyseus reconnection deferred (seat held for the match)
    this._played = new Set();      // sids of humans connected at some point while 'playing' (ranked)
    this._rankRes = new Map();     // sid -> `rank` message payload (resent on hello after a rejoin)
    this._noHumanSince = 0;        // RP-04 abandon timer
    this._lastSellAt = new Map();  // (champion records carry lastBuyAt; sells share the buy rate)

    this._buildStructures();             // before the bots: they precompute lane towers
    this.skills = new SkillEngine(this);
    this.bots = new MobaBots(this);

    // ── Client intent → shared handlers (bots call the same _do* methods) ──
    this.onMessage('order', (client, msg) => this._doOrder(client.sessionId, msg));
    this.onMessage('cast', (client, msg) => this._doCast(client.sessionId, msg));
    this.onMessage('buy', (client, msg) => this._doBuy(client.sessionId, msg));
    this.onMessage('sell', (client, msg) => this._doSell(client.sessionId, msg)); // RP-07
    this.onMessage('ready', (client) => this._doReady(client.sessionId));           // RP-06
    this.onMessage('recall', (client) => this._doRecall(client.sessionId));
    this.onMessage('chat', (client, msg) => this._onChat(client.sessionId, msg));
    this.onMessage('startNow', (client) => this._doStartNow(client.sessionId));
    this.onMessage('side', (client, msg) => this._doSide(client, msg));
    // v3 champion select (TEAM_MODE_V3_BREAKDOWN.md §3.3)
    this.onMessage('pick', (client, msg) => this._doPick(client.sessionId, msg));
    this.onMessage('lock', (client) => this._doLock(client.sessionId));
    this.onMessage('spells', (client, msg) => this._doSpells(client.sessionId, msg));
    this.onMessage('spell', (client, msg) => this._doSpell(client.sessionId, msg));
    this.onMessage('vote', (client, msg) => this._doVote(client.sessionId, msg)); // EP-04 rollback vote
    this.onMessage('augmentPick', (client, msg) => this._doAugmentPick(client.sessionId, msg));
    this.onMessage('augmentReroll', (client) => this._doAugmentReroll(client.sessionId));
    this.onMessage('upgrade', (client, msg) => this._doUpgrade(client.sessionId, msg));
    this.onMessage('active', (client) => this._doUseActive(client.sessionId));
    this.onMessage('ward', (client, msg) => this._doWard(client.sessionId, msg));
    // Answered ONCE per Client object (each reply carries the chat history). EP-03: a reconnect
    // is a new Client (userData is copied over), so it is keyed by the object, not userData.
    this.onMessage('hello', (client) => {
      if (this._helloed.has(client)) return;
      this._helloed.add(client);
      const m = this._member(client.sessionId);
      client.send('welcome', { serverNow: Date.now(), team: m?.team || '', champ: (m?.s ? m.s.champ : m?.champ) || '', reconnectS: TEAM_RECONNECT_GRACE_S });
      if (this._chatLog.length) client.send('chatHistory', this._chatLog);
      // EP-04: rejoined mid-vote → show the open vote. `mine` (this per-client resend only) = this seat
      // already has a ballot (e.g. its bot voted while the human was away) → the client hides YES / NO.
      const v = m && this._votes[m.team];
      if (v) client.send('vote', { ...this._votePayload(v), mine: v.voters.has(client.sessionId) });
      const rr = this._rankRes.get(client.sessionId); // RP-12: rejoined after the match ended
      if (rr) client.send('rank', rr);
    });
    // Unknown message types (a newer client vs an older server, typos) are ignored —
    // Colyseus would otherwise drop the client (close 4002).
    this.onMessage('*', () => { });
    // v3: repeatable clock sync (any scene, any phase) — reply { serverNow, t } echoing the
    // client's own timestamp so it can halve the round trip. ≥ 500 ms apart per client.
    this.onMessage('time', (client, msg) => {
      client.userData = client.userData || {};
      const now = Date.now();
      if (now - (client.userData.timeAt || 0) < 500) return;
      client.userData.timeAt = now;
      const t = msg && Number.isFinite(msg.t) ? msg.t : 0;
      client.send('time', { serverNow: now, t });
    });
    if (DEBUG_HOOKS) {
      this.onMessage('debug', (client, msg) => this._onDebug(client.sessionId, msg));
      console.log('[TeamRoom] debug hooks ENABLED (BUG_SMASH_DEBUG=1)');
    } else {
      // Colyseus drops a client that sends an unregistered type — ignore `debug` quietly instead.
      this.onMessage('debug', () => { });
    }

    this.setSimulationInterval((dt) => this._tick(dt), TICK_MS);
    this._updateMetadata();
    console.log('[TeamRoom] created', this.roomId);
  }

  /**
   * Joins only while queueing (quick play: lobby · custom: room) — locked from champion select on.
   * Pass 2: one live session per player id (Presence) — 'DUP_TAB' (another tab is playing) or
   * 'IN_MATCH:<roomId>' (this player still has a seat in a running match → rejoin it instead).
   * → { pub } (client.auth) when allowed.
   */
  onAuth(_client, options) {
    const ph = this.state.phase;
    if (ph === 'room' ? this.humanCount() >= ROOM_MAX_HUMANS : ph !== 'lobby') return false;
    const pub = publicIdOf(options?.pid);
    const why = Presence.check(pub, 'team', this);
    if (why) throw new Error(why);
    return { pub };
  }

  onJoin(client, options) {
    const ph = this.state.phase;
    if (ph !== 'lobby' && ph !== 'room') throw new Error('match already started');
    const sid = client.sessionId;
    const team = this._pickTeamForHuman(ph === 'room');
    if (!team) throw new Error('room is full');
    const name = sanitizeName(options?.name);
    // Join option `champ` = initial hover (deep links / harness); `autoLock` = lock it right away.
    const autoLock = options?.autoLock === true;
    let champ = this._freeForTeam(team, options?.champ, sid) ? options.champ : '';
    if (!champ && autoLock) champ = CHAMPION_IDS.find((c) => this._freeForTeam(team, c, sid)) || '';
    const sl = this._newSlot(sid, { team, name, isBot: false, role: champ ? CHAMPIONS[champ].lane : 'mid', spells: DEFAULT_SPELLS });
    sl.s.champ = champ;
    sl.s.locked = autoLock && !!champ;
    sl.s.hat = sanitizeHat(options?.hat); // EP-06: allowlisted cosmetic ('' if unknown)
    // Pass 2: player id → presence + rank badge (RP-02 / RP-12).
    const pub = (client.auth && client.auth.pub) || '';
    this._pubs.set(sid, pub);
    sl.s.rank = pub ? Ranking.label(pub) : '';
    if (pub) Presence.register(pub, { mode: 'team', room: this, sid, client });
    this._bindClient(client, team);
    if (ph === 'room') {
      if (!this.state.hostId) this.state.hostId = sid;
    } else {
      // RP-06 queue: LOBBY_MS from the first join; a later join keeps ≥ LOBBY_JOIN_EXTEND_MS on the
      // clock (never past LOBBY_MAX_MS from the first join); a full queue starts LOBBY_FULL_MS later.
      // Never shorter than what is already shown. START NOW = ready check (_doReady).
      const now = Date.now();
      const st = this.state;
      if (!st.lobbyEndsAt) { this._firstJoinAt = now; st.lobbyEndsAt = now + LOBBY_MS; }
      else {
        const cap = (this._firstJoinAt || now) + LOBBY_MAX_MS;
        st.lobbyEndsAt = Math.max(st.lobbyEndsAt, Math.min(cap, now + LOBBY_JOIN_EXTEND_MS));
      }
      if (this.humanCount() >= MAX_HUMANS) st.lobbyEndsAt = Math.min(st.lobbyEndsAt, now + LOBBY_FULL_MS);
      this._unready(); // a new player in the queue → everyone confirms again
      // 0 means "alive" in the contract — show the expected first spawns instead.
      const t0 = st.lobbyEndsAt + SELECT_MS + LOADING_MS;
      st.epicGoldenAt = t0 + EPICS.golden.firstSpawnMs;
      st.epicDeadlineAt = t0 + EPICS.deadline.firstSpawnMs;
    }
    this._feed({ text: `☕ ${sl.name} joined ${teamLabel(team)}`, color: TEAM_INFO[team].css, a: sid });
    this._updateMetadata();
    console.log(`[TeamRoom] +join ${sid} "${sl.name}" ${team}/${champ || '-'}${sl.s.locked ? ' (locked)' : ''} (humans ${this.humanCount()})`);
  }

  /**
   * EP-03: a NON-consented drop during select / loading / playing keeps the seat for
   * TEAM_RECONNECT_GRACE_S — a bot plays it meanwhile (exactly like a permanent leave, so
   * pulling the plug gives no advantage) and hands it back on reconnect (_onReconnect).
   * Consented leaves (close 4000: LEAVE / MENU) and the lobby / room phases free the seat now.
   */
  onLeave(client, consented) {
    const sid = client.sessionId;
    this._lastChatAt.delete(sid);
    this._lastSideAt.delete(sid);
    this._lastVoteAt.delete(sid);
    this._lastSellAt.delete(sid);
    const phase = this.state.phase;
    const pub = this._pubs.get(sid) || '';
    // Pass 2 RP-04: a dropped (non-consented) human keeps the seat for the WHOLE match; a kicked
    // duplicate tab (PLAY HERE → close 4010) too, so the new tab can take the seat back.
    const hold = !consented && (phase === 'select' || phase === 'loading' || phase === 'playing');
    if (!hold) Presence.unregister(pub, this, sid);
    else Presence.setConnected(pub, this, sid, false);
    if (phase === 'lobby' || phase === 'room') {
      if (!this.slots.has(sid)) return;
      this._removeSlot(sid);
      this._pubs.delete(sid);
      if (phase === 'lobby' && this.humanCount() === 0) this.state.lobbyEndsAt = 0;
      if (phase === 'lobby') this._checkReady();
      this._handOffHost(sid);
    } else if (phase === 'select' || phase === 'loading') {
      // v3: a bot takes the seat — it keeps a locked pick, else drafts for itself shortly.
      const sl = this.slots.get(sid);
      if (!sl || sl.isBot) return;
      sl.isBot = true;
      sl.s.isBot = true;
      if (sl.s.champ && sl.s.locked) sl.role = CHAMPIONS[sl.s.champ].lane || sl.role;
      if (!sl.s.locked) {
        sl.s.champ = '';
        // Take the first role no teammate covers (bot roles + human hover/lock lanes) and its perks.
        const role = this._openRole(sl);
        if (role) {
          sl.role = role;
          const sp = ROLE_SPELLS[role] || DEFAULT_SPELLS;
          sl.s.spellD = sp[0]; sl.s.spellF = sp[1];
        }
        const now = Date.now();
        sl.botPickAt = Math.max(now, Math.min(now + 600 + Math.random() * 1200, this.state.selectEndsAt - 300));
      }
      this._feed(this._leaveFeed(sl.name, sid, hold));
      this._handOffHost(sid);
    } else if (phase === 'playing') {
      const ch = this.champs.get(sid);
      if (!ch || ch.isBot) return;
      // The match goes on 5v5: a bot takes over the laptop.
      ch.isBot = true;
      this.bots.adopt(sid, ch.role);
      this._feed(this._leaveFeed(ch.name, sid, hold));
      this._handOffHost(sid);
    } else {
      return;
    }
    if (hold) this._holdSeat(client);
    this._updateMetadata();
    console.log(`[TeamRoom] -leave ${sid}${hold ? ' (seat held for the match)' : ''} (humans ${this.humanCount()})`);
  }

  _leaveFeed(name, sid, hold) {
    return hold
      ? { text: fill(DISCONNECT_LINE, { a: name }), color: '#8890a0', a: sid }
      : { text: `🤖 ${name} disconnected — a bot took over their laptop`, color: '#8890a0', a: sid };
  }

  /**
   * EP-03 / Pass 2 RP-04: reserve the seat for a reconnect (allowReconnection must be called inside
   * onLeave). 'manual' = held until the match is over (_releaseHolds) — the client keeps the token
   * in localStorage, so a reload / closed tab / restarted browser can still come back.
   */
  _holdSeat(client) {
    const sid = client.sessionId;
    let wait = null;
    try { wait = this.allowReconnection(client, 'manual'); } catch (_) { wait = null; }
    if (!wait || typeof wait.then !== 'function') return;
    this._away.add(sid);
    this._holds.set(sid, wait);
    const guard = (fn) => { try { fn(); } catch (e) { console.warn('[TeamRoom] reconnect hook', e?.stack || e); } };
    wait.then((newClient) => guard(() => this._onReconnect(newClient, sid)), () => guard(() => this._onReconnectTimeout(sid)))
      .catch((e) => console.warn('[TeamRoom] reconnect hook', e?.stack || e));
  }

  /**
   * EP-03: the dropped human is back (same sessionId, a NEW Client; onAuth / onJoin are NOT
   * called — Colyseus resolves the reserved seat). The bot hands the laptop back: isBot false,
   * brain released, items / gold / level untouched. The client sends `hello` again → welcome.
   */
  _onReconnect(newClient, sid) {
    this._away.delete(sid);
    this._holds.delete(sid);
    const st = this.state;
    const m = this._member(sid);
    if (!m || this._closing) return;
    Presence.setConnected(this._pubs.get(sid) || '', this, sid, true, newClient);
    if (st.phase === 'playing') this._played.add(sid);
    this._bindClient(newClient, m.team);
    const sl = this.slots.get(sid);
    if (sl) { sl.isBot = false; sl.s.isBot = false; sl.botPickAt = 0; }
    const ch = this.champs.get(sid);
    if (ch) {
      ch.isBot = false;
      ch.s.isBot = false;
      this.bots.remove(sid);
      if (st.phase === 'playing') ch.order = null; // stand still — the human takes over from here
      this.bots.onHandBack(sid);
    }
    if (st.custom && !st.hostId) st.hostId = sid;
    if (st.phase !== 'ended') this._feed({ text: fill(pick(RECONNECT_LINES), { a: m.name }), color: TEAM_INFO[m.team].css, a: sid });
    this._syncScores(true);
    this._updateMetadata();
    console.log(`[TeamRoom] reconnect ${sid} "${m.name}" (${st.phase}, humans ${this.humanCount()})`);
  }

  /** EP-03: hold released (match over / room closing) — the bot keeps the seat. */
  _onReconnectTimeout(sid) {
    this._holds.delete(sid);
    Presence.unregister(this._pubs.get(sid) || '', this, sid);
    if (!this._away.delete(sid)) return;
    const ph = this.state.phase;
    if (this._closing || (ph !== 'select' && ph !== 'loading' && ph !== 'playing')) return;
    const m = this._member(sid);
    if (m) this._feed({ text: fill(RECONNECT_TIMEOUT_LINE, { a: m.name }), color: '#8890a0', a: sid });
    console.log(`[TeamRoom] reconnect grace over for ${sid} — the bot keeps the seat`);
  }

  /** RP-04: the match is over — every held seat is let go (their reconnection is rejected). */
  _releaseHolds() {
    for (const [sid, wait] of [...this._holds]) {
      this._holds.delete(sid);
      try { wait.reject?.(new Error('match over')); } catch (_) { /* settled */ }
    }
  }

  onDispose() {
    this._releaseHolds();
    Presence.unregisterRoom(this);
    this._timers.length = 0;
    this.skills.clear();
    console.log('[TeamRoom] disposed', this.roomId);
  }

  /** Safety net: Colyseus wraps every handler / tick / timer with this. */
  onUncaughtException(err, methodName) {
    console.error(`[TeamRoom] ${methodName} threw:`, err?.stack || err?.message || err);
  }

  // ───────────────────────── population ─────────────────────────
  /** Draft entries before the match plays, champion records after. */
  _members() { return this.champs.size ? this.champs.values() : this.slots.values(); }
  /** Champion record (playing/ended) or draft entry (lobby/select/loading) for a sid. */
  _member(sid) { return this.champs.get(sid) || this.slots.get(sid) || null; }

  humanCount() {
    let n = 0;
    for (const m of this._members()) if (!m.isBot) n++;
    return n;
  }

  /** custom (r2): an invited friend lands on the HOST's side while it has < TEAM_SIZE humans, else the other side. */
  _pickTeamForHuman(custom = false) {
    const humans = this._humansBySide();
    if (humans.blue >= TEAM_SIZE && humans.red >= TEAM_SIZE) return null;
    const host = custom && this.state.hostId ? this._member(this.state.hostId) : null;
    if (host && !host.isBot) return humans[host.team] < TEAM_SIZE ? host.team : otherTeam(host.team);
    if (humans.blue >= TEAM_SIZE) return 'red';
    if (humans.red >= TEAM_SIZE) return 'blue';
    return humans.red < humans.blue ? 'red' : 'blue';
  }

  _humansBySide() {
    const humans = { blue: 0, red: 0 };
    for (const m of this._members()) if (!m.isBot) humans[m.team]++;
    return humans;
  }

  // ───────────────────────── v4: custom rooms ─────────────────────────
  /** Point a client at its team's StateView (+ remember the team for team-filtered messages). */
  _bindClient(client, team) {
    client.userData = client.userData || {};
    client.userData.team = team;
    client.view = this._views[team] || this._views.all;
  }

  /** startNow — quick play: any queued human (lobby). Custom: host only, phase 'room', ≥ 1 human. */
  _doStartNow(sid) {
    const st = this.state;
    if (st.phase === 'lobby') return this._doReady(sid, true); // RP-06: START NOW = I'm ready
    if (st.phase !== 'room' || sid !== st.hostId || !this.slots.has(sid) || this.humanCount() < 1) return false;
    this._startSelect();
    return true;
  }

  /**
   * RP-06 `ready` (quick-play lobby): toggles the sender's ready flag (`force` = set it). The match
   * starts as soon as every queued human is ready — alone that is right away.
   */
  _doReady(sid, force = false) {
    if (this.state.phase !== 'lobby') return false;
    const sl = this.slots.get(sid);
    if (!sl || sl.isBot) return false;
    sl.s.ready = force ? true : !sl.s.ready;
    this._checkReady();
    return true;
  }

  /** Every queued human ready → champion select now. */
  _checkReady() {
    if (this.state.phase !== 'lobby') return;
    let humans = 0, ready = 0;
    for (const sl of this.slots.values()) { if (sl.isBot) continue; humans++; if (sl.s.ready) ready++; }
    if (humans > 0 && ready === humans) this._startSelect();
  }

  _unready() { for (const sl of this.slots.values()) if (sl.s.ready) sl.s.ready = false; }

  /** side {team} — custom room, phase 'room': move to the other side (≤ TEAM_SIZE humans per side). */
  _doSide(client, msg) {
    if (this.state.phase !== 'room' || !msg || typeof msg !== 'object') return false;
    const sid = client.sessionId;
    const sl = this.slots.get(sid);
    const team = msg.team;
    if (!sl || sl.isBot || (team !== 'blue' && team !== 'red') || team === sl.team) return false;
    const now = Date.now();
    if (now - (this._lastSideAt.get(sid) || 0) < SIDE_RATE_MS) return false;
    if (this._humansBySide()[team] >= TEAM_SIZE) return false;
    this._lastSideAt.set(sid, now);
    const used = new Set();
    for (const c of this.slots.values()) if (c.team === team) used.add(c.slot);
    let idx = 0;
    while (used.has(idx)) idx++;
    sl.team = team; sl.slot = idx;
    const s = sl.s;
    s.team = team;
    if (s.champ && !this._freeForTeam(team, s.champ, sid)) { s.champ = ''; s.locked = false; }
    const spot = this._fountainSpot(team, idx);
    s.x = Math.round(spot.x); s.y = Math.round(spot.y);
    this._bindClient(client, team); // every view holds every seat outside 'playing' → swapping views is lossless
    this._feed({ text: `🔁 ${sl.name} switched to ${teamLabel(team)}`, color: TEAM_INFO[team].css, a: sid });
    this._updateMetadata();
    return true;
  }

  /** The host left: the next human (seat order) becomes host. */
  _handOffHost(sid) {
    const st = this.state;
    if (!st.custom || st.hostId !== sid) return;
    let next = '';
    for (const m of this._members()) if (!m.isBot && m.id !== sid) { next = m.id; break; }
    st.hostId = next;
    const m = next ? this._member(next) : null;
    if (m) this._feed({ text: `👑 ${m.name} is now the room host`, color: '#ffd23f', a: next });
  }

  /** Champion `champ` is a real id and no OTHER teammate has it hovered or locked. */
  _freeForTeam(team, champ, exceptSid) {
    if (!isChampionId(champ)) return false;
    for (const sl of this.slots.values()) if (sl.team === team && sl.id !== exceptSid && sl.s.champ === champ) return false;
    return true;
  }

  _botName() {
    const used = new Set([...this._members()].map((c) => c.name));
    const free = BOT_NAMES.filter((n) => !used.has(n) && n.length <= NAME_MAX);
    return free.length ? pick(free) : `Contractor_${Math.floor(100 + Math.random() * 900)}`;
  }

  _fountainSpot(team, idx) {
    const f = FOUNTAIN[team];
    const a = (idx % TEAM_SIZE) / TEAM_SIZE * Math.PI * 2 + (team === 'blue' ? 0 : Math.PI);
    return freeSpot(f.x + Math.cos(a) * 110, f.y + Math.sin(a) * 110, CHAMP_RADIUS);
  }

  /** v3: a draft seat (lobby → select → loading). Owns the synced TeamChamp the champion record reuses later. */
  _newSlot(sid, { team, name, isBot, role, spells }) {
    const usedSlots = new Set([...this.slots.values()].filter((c) => c.team === team).map((c) => c.slot));
    let idx = 0;
    while (usedSlots.has(idx)) idx++;
    const s = new TeamChamp();
    s.team = team; s.name = name; s.isBot = !!isBot; s.champ = ''; s.locked = false;
    s.spellD = spells[0]; s.spellF = spells[1];
    const spot = this._fountainSpot(team, idx);
    s.x = Math.round(spot.x); s.y = Math.round(spot.y);
    const sl = { id: sid, team, name, isBot: !!isBot, wasHuman: !isBot, role, slot: idx, s, botPickAt: 0, lastPickAt: 0, lastSpellsAt: 0 };
    this.slots.set(sid, sl);
    this.state.champions.set(sid, s);
    this._showInAllViews(s);
    this.state.scores.set(sid, new TeamScore()); // v4 §3.2b
    this._syncScore(sid, s);
    return sl;
  }

  _removeSlot(sid) {
    this.slots.delete(sid);
    this.state.champions.delete(sid);
    this.state.scores.delete(sid);
  }

  /** Create + register a champion record from a locked draft seat (match start). */
  _addChamp(sl) {
    const { id: sid, team, s, slot: idx } = sl;
    const champ = s.champ;
    const def = CHAMPIONS[champ];
    const spot = this._fountainSpot(team, idx);
    const role = sl.isBot ? sl.role : (def.lane || sl.role);
    const ch = {
      id: sid, etype: 'champ', team, champ, def, role, name: sl.name, isBot: sl.isBot, s, slot: idx,
      x: spot.x, y: spot.y, vx: 0, vy: 0, faceX: team === 'blue' ? 1 : -1, faceY: 0, radius: CHAMP_RADIUS,
      level: 1, xp: 0, gold: 0,
      hp: 0, mana: 0, maxHp: 0, maxMana: 0, ad: 0, ap: 0, armor: 0, ms: 0, range: 0, as: 0,
      haste: 0, lifesteal: 0, dmgTakenMul: 1,
      dead: false, respawnAt: 0, kills: 0, deaths: 0, assists: 0, cs: 0, streak: 0,
      items: new Array(INVENTORY_SLOTS).fill(''), boughtAt: new Array(INVENTORY_SLOTS).fill(0),
      cd: { q: 0, w: 0, e: 0, r: 0 },
      stunnedUntil: 0, rootedUntil: 0, slowUntil: 0, slowPct: 0,
      _ccChainCount: 0, _ccChainUntil: 0, _ccImmuneUntil: 0,
      _atkCount: 0, _lastTargetId: '', _cacheStacks: 0, _swipeReady: false, _lastCombatAt: 0,
      _grievousUntil: 0, _auditUntil: 0, _tankStacks: 0, _tankUntil: 0, _lifelineCd: 0,
      augments: [], augmentOffer: null, _augNextIdx: 0, _augVer: 0,
      skillPoints: 1, ranks: { q: 0, w: 0, e: 0, r: 0 },
      _activeCd: 0, _stasisUntil: 0, _stealthUntil: 0, _wardCd: 0,
      shields: [], buffs: [], regens: [],
      recallUntil: 0, order: null, atkTarget: '', atkReadyAt: 0,
      lastDamagedAt: 0, damagers: new Map(), aggroAt: 0, aggroVictim: '',
      lastOrderAt: 0, lastCastAt: 0, lastBuyAt: 0, lastRecallAt: 0, fountainFxAt: 0,
      action: 'idle', actionSeq: 0,
      // v2
      nav: null, knock: null, petId: '', petPct: 0, lastChampHitId: '', lastChampHitAt: 0,
      // v3 summoner spells
      spells: { d: s.spellD, f: s.spellF }, spellCd: { d: 0, f: 0 }, lastSpellAt: 0, burns: [],
    };
    s.champ = champ; s.isBot = !!sl.isBot; s.locked = true;
    this.champs.set(sid, ch);
    this._resetChampForMatch(ch, Date.now());
    this._syncChamp(ch, Date.now());
    return ch;
  }

  /** v3 select start: bots fill both teams to TEAM_SIZE (roles the humans' hovers leave open), no champion yet. */
  _fillBotSlots(now) {
    const [p0, p1] = SELECT_BOT_PICK_MS;
    for (const team of TEAMS) {
      const members = [...this.slots.values()].filter((c) => c.team === team);
      const taken = new Set(members.map((c) => (c.s.champ ? CHAMPIONS[c.s.champ].lane : '')).filter(Boolean));
      const roles = ROLE_ORDER.filter((r) => !taken.has(r));
      while (members.length + roles.length < TEAM_SIZE) roles.push(ROLE_ORDER[roles.length % ROLE_ORDER.length]);
      let n = members.length;
      for (const role of roles) {
        if (n >= TEAM_SIZE) break;
        const sid = `bot_${this._nextBotId++}`;
        const sl = this._newSlot(sid, { team, name: this._botName(), isBot: true, role, spells: ROLE_SPELLS[role] || DEFAULT_SPELLS });
        sl.botPickAt = now + p0 + Math.random() * (p1 - p0);
        n++;
      }
    }
  }

  /** First ROLE_ORDER role no teammate of `sl` covers (bots: their role · humans: their hover/lock lane), else null. */
  _openRole(sl) {
    const used = new Set();
    for (const c of this.slots.values()) {
      if (c === sl || c.team !== sl.team) continue;
      if (c.isBot) used.add(c.role);
      else if (c.s.champ) used.add(CHAMPIONS[c.s.champ].lane);
    }
    return ROLE_ORDER.find((r) => !used.has(r)) || null;
  }

  /**
   * EP-19: a champion for `role` no teammate of seat `sid` has — role-balanced: first a ROLE_PICKS
   * entry whose natural lane IS that role (no 3 mids / 2 tanks: ROLE_PICKS lists e.g. Pixel for bot,
   * Brick + Model for support), then any champion of that lane, then ROLE_PICKS, then anything free.
   */
  _champForRole(team, role, sid) {
    const free = (c) => this._freeForTeam(team, c, sid);
    const rp = ROLE_PICKS[role] || [];
    let pool = rp.filter((c) => CHAMPIONS[c].lane === role && free(c));
    if (!pool.length) pool = CHAMPION_IDS.filter((c) => CHAMPIONS[c].lane === role && free(c));
    if (!pool.length) pool = rp.filter(free);
    if (!pool.length) pool = CHAMPION_IDS.filter(free);
    return pool.length ? pick(pool) : '';
  }

  /** EP-19: move a bot seat to the first role no teammate covers (humans by their champion's lane, bots by role) + its perks. */
  _rerole(sl) {
    const used = new Set();
    for (const c of this.slots.values()) {
      if (c === sl || c.team !== sl.team) continue;
      if (this._humanSeat(c)) { if (c.s.champ) used.add(CHAMPIONS[c.s.champ].lane); }
      else used.add(c.role);
    }
    if (!used.has(sl.role)) return false;
    const free = ROLE_ORDER.find((r) => !used.has(r));
    if (!free) return false;
    sl.role = free;
    const sp = ROLE_SPELLS[free] || DEFAULT_SPELLS;
    sl.s.spellD = sp[0]; sl.s.spellF = sp[1];
    return true;
  }

  /**
   * Review fix: a seat that counts as a human for drafting — a connected human, a human inside
   * the reconnect grace (bot-held, in this._away), or any seat that started human and LOCKED a pick
   * (a leaver's lock is theirs). Such seats are never re-roled / re-picked and count by their lane.
   */
  _humanSeat(c) { return !c.isBot || this._away.has(c.id) || (c.wasHuman && c.s.locked); }

  /** A bot seat hovers + locks a role-appropriate random champion no teammate has (re-roles if a human took its lane). */
  _botPick(sl) {
    this._rerole(sl);
    const champ = this._champForRole(sl.team, sl.role, sl.id);
    if (!champ) return false;
    sl.s.champ = champ;
    sl.s.locked = true;
    sl.botPickAt = 0;
    return true;
  }

  /**
   * EP-19: a human locked (or was auto-locked into) a lane a bot teammate already covers → that
   * bot swaps to the open role and, if it had locked, re-picks for it right away (bots are
   * fillers: the team keeps one champion per role whatever the humans pick, when it can).
   */
  _rebalanceBots(team) {
    for (const sl of this.slots.values()) {
      if (sl.team !== team || this._humanSeat(sl)) continue;
      if (!this._rerole(sl)) continue;
      if (sl.s.locked) { sl.s.champ = ''; sl.s.locked = false; this._botPick(sl); }
      else if (sl.s.champ && CHAMPIONS[sl.s.champ].lane !== sl.role) sl.s.champ = '';
    }
  }

  _updateMetadata() {
    let bots = 0;
    for (const m of this._members()) if (m.isBot) bots++;
    const st = this.state;
    let meta;
    if (st.custom) {
      const sides = this._humansBySide();
      const host = st.hostId ? this._member(st.hostId) : null;
      meta = { mode: 'team_custom', roomName: st.roomName, host: host ? host.name : '', humans: sides.blue + sides.red, blue: sides.blue, red: sides.red, phase: st.phase, bots };
    } else {
      meta = { mode: 'team', phase: st.phase, humans: this.humanCount(), bots };
    }
    try {
      this.setMetadata(meta)?.catch?.(() => { });
    } catch (_) { /* listing not ready (or a harness) */ }
  }

  // ───────────────────────── match flow ─────────────────────────
  _resetChampForMatch(ch, now) {
    ch.level = 3; ch.xp = XP_TABLE[2]; ch.gold = START_GOLD;
    ch.kills = 0; ch.deaths = 0; ch.assists = 0; ch.cs = 0; ch.streak = 0;
    ch.items.fill('');
    if (ch.boughtAt) ch.boughtAt.fill(0);
    ch.itemsVer = (ch.itemsVer || 0) + 1;
    ch.cd = { q: 0, w: 0, e: 0, r: 0 };
    ch.spellCd = { d: 0, f: 0 }; ch.burns = [];
    ch.dead = false; ch.respawnAt = 0;
    ch.stunnedUntil = 0; ch.rootedUntil = 0; ch.slowUntil = 0; ch.slowPct = 0;
    ch._ccChainCount = 0; ch._ccChainUntil = 0; ch._ccImmuneUntil = 0;
    ch._atkCount = 0; ch._lastTargetId = ''; ch._cacheStacks = 0; ch._swipeReady = false; ch._lastCombatAt = 0;
    ch._grievousUntil = 0; ch._auditUntil = 0; ch._tankStacks = 0; ch._tankUntil = 0; ch._lifelineCd = 0;
    ch.augments = []; ch.augmentOffer = null; ch._augNextIdx = 0; ch._augVer = (ch._augVer || 0) + 1;
    ch.skillPoints = 0; ch.ranks = { q: 1, w: 1, e: 1, r: 0 };
    ch._activeCd = 0; ch._stasisUntil = 0; ch._stealthUntil = 0; ch._wardCd = 0;
    if (ch.isBot) this._autoSpendSkills(ch);
    ch.shields.length = 0; ch.buffs.length = 0; ch.regens.length = 0;
    ch.recallUntil = 0; ch.order = null; ch.atkTarget = ''; ch.atkReadyAt = 0;
    ch.damagers.clear(); ch.lastDamagedAt = 0;
    ch.nav = null; ch.knock = null; ch.lastChampHitId = ''; ch.lastChampHitAt = 0;
    ch.maxHp = 0; ch.maxMana = 0;
    this._recalc(ch, now);
    ch.hp = ch.maxHp; ch.mana = ch.maxMana;
    const spot = this._fountainSpot(ch.team, ch.slot);
    ch.x = spot.x; ch.y = spot.y;
  }

  /** lobby → select: room locked, bots seated, SELECT_MS timer. */
  _startSelect() {
    if (this.state.phase !== 'lobby' && this.state.phase !== 'room') return;
    const now = Date.now();
    const st = this.state;
    st.phase = 'select';
    st.lobbyEndsAt = 0;
    st.selectEndsAt = now + SELECT_MS;
    this._allLocked = false;
    try { this.lock()?.catch?.(() => { }); } catch (_) { /* harness */ }
    this._fillBotSlots(now);
    this._announce({ title: '🎯 CHAMPION SELECT', sub: 'Pick your champion and two office perks (D / F)', color: '#ffd23f' });
    this._updateMetadata();
    console.log(`[TeamRoom] champion select (${this.humanCount()} humans, ${this.slots.size} seats)`);
  }

  /** Bots draft at their time; all locked → end soon; timer → auto-lock + loading. */
  _tickSelect(now) {
    const st = this.state;
    const seats = [...this.slots.values()];
    for (const sl of seats) if (sl.isBot && !sl.s.locked && sl.botPickAt && now >= sl.botPickAt) this._botPick(sl);
    if (!this._allLocked && seats.every((sl) => sl.s.locked)) {
      this._allLocked = true;
      st.selectEndsAt = Math.min(st.selectEndsAt, now + SELECT_ALL_LOCKED_MS);
    }
    if (now >= st.selectEndsAt) this._startLoading(now);
  }

  /** select → loading: everyone unlocked auto-locks (hover, else a random free champion); frozen at the fountain. */
  _startLoading(now = Date.now()) {
    const st = this.state;
    if (st.phase !== 'select') return;
    for (const sl of this.slots.values()) {
      if (sl.s.locked) continue;
      if (sl.isBot) { this._botPick(sl); continue; }
      if (!this._freeForTeam(sl.team, sl.s.champ, sl.id)) {
        const role = this._openRole(sl);
        sl.s.champ = role ? this._champForRole(sl.team, role, sl.id) : (CHAMPION_IDS.find((c) => this._freeForTeam(sl.team, c, sl.id)) || '');
        if (sl.s.champ) sl.role = CHAMPIONS[sl.s.champ].lane || sl.role;
      }
      sl.s.locked = !!sl.s.champ;
    }
    for (const team of TEAMS) this._rebalanceBots(team); // EP-19: auto-locked humans may have taken a bot's lane
    // Paranoia: a seat still without a champion (impossible with 12 champions / 5 seats) takes any.
    for (const sl of this.slots.values()) if (!isChampionId(sl.s.champ)) { sl.s.champ = CHAMPION_IDS[0]; sl.s.locked = true; }
    st.phase = 'loading';
    st.selectEndsAt = 0;
    st.loadingEndsAt = now + LOADING_MS;
    for (const sl of this.slots.values()) {
      const def = CHAMPIONS[sl.s.champ];
      const spot = this._fountainSpot(sl.team, sl.slot);
      sl.s.x = Math.round(spot.x); sl.s.y = Math.round(spot.y);
      sl.s.maxHp = clamp16(def.base.hp); sl.s.hp = sl.s.maxHp;
      sl.s.maxMana = clamp16(def.base.mana || 0); sl.s.mana = sl.s.maxMana;
      sl.s.ms = clamp16(def.base.ms); sl.s.range = clamp16(def.base.range);
    }
    this._updateMetadata();
    console.log(`[TeamRoom] loading: ${[...this.slots.values()].map((sl) => `${sl.team[0]}:${sl.s.champ}`).join(' ')}`);
  }

  /**
   * Bot skill for this match: the humans' average hidden skill rating (MMR) → easy / normal / hard
   * (MobaBots.BOT_SKILL). New players start at MMR_START → easy bots; beating bots raises MMR → sharper
   * bots. Bots-only matches: normal. `_botSkillOverride` (harness / debug) wins when set.
   */
  _botSkillLevel() {
    if (this._botSkillOverride) return this._botSkillOverride;
    let sum = 0, n = 0;
    for (const sl of this.slots.values()) {
      if (sl.isBot) continue;
      sum += Ranking.skill(this._pubs.get(sl.id) || '');
      n++;
    }
    return n ? botSkillFor(sum / n) : 'normal';
  }

  /** Back-compat name (debug / harness): from the lobby this starts champion select. */
  _startMatch() { if (this.state.phase === 'lobby' || this.state.phase === 'room') this._startSelect(); }

  /** loading → playing: champion records + bot brains + pets are created now. */
  _startPlaying() {
    if (this.state.phase !== 'loading') return;
    const now = Date.now();
    const st = this.state;
    st.phase = 'playing';
    st.startedAt = now;
    st.loadingEndsAt = 0;
    this.bots.setSkill(this._botSkillLevel());           // before the brains are added (aim / think rolls)
    for (const sl of this.slots.values()) {
      const ch = this._addChamp(sl);
      if (sl.isBot) this.bots.add(sl.id, ch.role);
    }
    for (const ch of this.champs.values()) this._spawnPet(ch);
    // Pass 2: ranked = humans connected while playing (a seat that dropped in select / loading and
    // never came back is a dodge). The room must outlive an empty client list (abandon timer).
    for (const c of this.clients) if (this.champs.has(c.sessionId)) this._played.add(c.sessionId);
    this._noHumanSince = 0;
    this.autoDispose = false;
    this._nextWaveAt = now + WAVE_FIRST_MS;
    this._waveNo = 0;
    this._campsAt = now + CAMP_SPAWN_MS;
    st.epicGoldenAt = now + EPICS.golden.firstSpawnMs;
    st.epicDeadlineAt = now + EPICS.deadline.firstSpawnMs;
    this._announce({ title: '🏁 SPRINT STARTED', sub: 'Push the bug waves · destroy the enemy Production Server', color: '#ffd23f', big: true });
    let humans = 0;
    for (const sl of this.slots.values()) if (!sl.isBot) humans++;
    if (humans && this.bots.count) this._feed({ text: `🤖 AI coworkers: ${BOT_SKILL[this.bots.skillLevel].name} (they adapt to how well you play)`, color: '#9fd0ff' });
    this._feed({ text: `⚔️ ${teamLabel('blue')} vs ${teamLabel('red')} — first bug waves ship at ${fmtTime(WAVE_FIRST_MS)}`, color: '#ffd23f' });
    this.bots.onMatchStart();
    this._updateMetadata();
    this._sync(now);
    console.log(`[TeamRoom] match started (${this.humanCount()} humans, ${this.champs.size} champions)`);
  }

  /** reason: 'core' (Production Server destroyed) | 'rollback' (EP-04 vote passed — `vote` = that vote)
   *  | 'abandon' (RP-04: no human connected for ABANDON_MS). */
  _endMatch(winner, now, reason = 'core', vote = null) {
    const st = this.state;
    if (st.phase !== 'playing') return;
    st.phase = 'ended';
    st.winner = winner;
    st.winReason = reason === 'rollback' || reason === 'abandon' ? reason : 'core';
    this._endAt = now + END_LINGER_MS;
    const loser = otherTeam(winner);
    const w = TEAM_INFO[winner];
    const took = fmtTime(now - st.startedAt);
    // EP-04: any still-open vote closes (a rollback vote that passed already sent its voteEnd).
    for (const t of TEAMS) {
      if (!this._votes[t]) continue;
      this._votes[t] = null;
      this._sendTeam(t, 'voteEnd', { passed: false });
    }
    for (const ch of this.champs.values()) { ch.order = null; ch.atkTarget = ''; ch.recallUntil = 0; ch.knock = null; ch.nav = null; }
    for (const t of this._knocked) t.knock = null;
    this._knocked.clear();
    // Pets leave with the match (no ticks run in 'ended', so remove them right away).
    for (const ch of this.champs.values()) this._removePet(ch, true);
    this.skills.clear();
    this._shots.length = 0;
    if (st.winReason === 'abandon') {
      this._announce({ title: '🏳 MATCH ABANDONED', sub: `Nobody came back to the office — ${teamLabel(winner)} takes it`, color: w.css, big: true });
    } else if (st.winReason === 'rollback') {
      this._announce({
        title: fill(ROLLBACK_PASS_TITLE, { team: teamLabel(loser), other: teamLabel(winner) }),
        sub: fill(ROLLBACK_PASS_SUB, { yes: vote ? vote.yes : ROLLBACK_NEED, need: ROLLBACK_NEED, t: took }),
        color: w.css, big: true,
      });
    } else {
      this._announce({ title: `💀 PRODUCTION IS DOWN — ${w.emoji} ${w.name} ships it!`, sub: `${teamLabel(loser)}'s ${CORE_NAME} crashed after ${took}`, color: w.css, big: true });
    }
    this._feed({ text: `🏆 ${teamLabel(winner)} wins in ${took}${st.winReason === 'rollback' ? ' (rollback)' : ''} · kills ${st.blueKills}–${st.redKills}`, color: w.css });
    this.bots.onMatchEnd(winner);
    // v4: full reveal for the end screen — every champion / unit back in every view.
    for (const c of this.champs.values()) { c.bush = ''; this._showInAllViews(c.s); }
    for (const u of this.units.values()) this._showInAllViews(u.s);
    this._sync(now);
    this._syncScores(true);
    this._applyRanked(winner);
    // The match is over: held seats are let go (their players can queue again).
    this._releaseHolds();
    this._updateMetadata();
    console.log(`[TeamRoom] match over: ${winner} wins after ${took} (${st.winReason}, kills blue ${st.blueKills} / red ${st.redKills})`);
  }

  /**
   * RP-11/12: ranked results for every human who played (connected at some point while 'playing').
   * Leavers keep their team's result; an abandon is a loss for whoever was away. Sends `rank` to
   * each connected one (kept in _rankRes for a rejoin during END_LINGER_MS).
   */
  _applyRanked(winner) {
    const players = [];
    const anonHumans = { blue: 0, red: 0 };
    const abandon = this.state.winReason === 'abandon';
    for (const sid of this._played) {
      const ch = this.champs.get(sid);
      if (!ch) continue;
      const pub = this._pubs.get(sid) || '';
      if (!pub) { anonHumans[ch.team]++; continue; }
      players.push({ pub, name: ch.name, team: ch.team, abandoned: abandon && this._away.has(sid), sid });
    }
    if (!players.length) return;
    // Performance bonus: the best performer of each team (bots included — a human has to out-play
    // them): winning team → 'mvp' (+1 ★), losing team → 'svp' (half the loss).
    const best = { blue: null, red: null };
    for (const ch of this.champs.values()) {
      const sc = perfScore(ch);
      const b = best[ch.team];
      if (!b || sc > b.sc || (sc === b.sc && ch.cs > b.ch.cs)) best[ch.team] = { sc, ch };
    }
    for (const pl of players) {
      const b = best[pl.team];
      // only for players still at their desk when it ends (a LEAVE / drop earns no bonus or protection)
      const present = this.clients.some((c) => c.sessionId === pl.sid);
      if (b && b.ch.id === pl.sid && !pl.abandoned && present) pl.perf = pl.team === winner ? 'mvp' : 'svp';
    }
    let res;
    try {
      res = Ranking.applyMatch({ players, winner, seats: { blue: TEAM_SIZE, red: TEAM_SIZE }, anonHumans });
    } catch (e) { console.warn('[TeamRoom] ranked update failed', e?.stack || e); return; }
    for (const pl of players) {
      const r = res.get(pl.pub);
      if (!r) continue;
      const ch = this.champs.get(pl.sid);
      const label = Ranking.label(pl.pub);
      if (ch) { ch.s.rank = label; const sc = this.state.scores.get(pl.sid); if (sc) sc.rank = label; }
      const msg = { ...r, custom: !!this.state.custom, place: Ranking.place(pl.pub) };
      this._rankRes.set(pl.sid, msg);
      const c = this.clients.find((cl) => cl.sessionId === pl.sid);
      if (c) { try { c.send('rank', msg); } catch (_) { /* closing */ } }
    }
    console.log(`[TeamRoom] ranked: ${players.map((p) => { const r = res.get(p.pub); return r ? `${p.name} ${r.delta >= 0 ? '+' : ''}${r.delta}${r.bonus ? ` (${r.bonus})` : ''}` : ''; }).join(', ')}`);
  }

  /** RP-04: nobody human connected → after ABANDON_MS (ABANDON_EMPTY_MS with no seat held) the match ends. */
  _tickAbandon(now) {
    if (!this._played.size) return; // bots-only matches (harness) play out
    let connected = 0;
    for (const c of this.clients) if (this.champs.has(c.sessionId)) connected++;
    if (connected > 0) { this._noHumanSince = 0; return; }
    if (!this._noHumanSince) { this._noHumanSince = now; return; }
    const wait = this._holds.size ? ABANDON_MS : ABANDON_EMPTY_MS;
    if (now - this._noHumanSince < wait) return;
    // The side ahead wins: fewer structures lost, then more kills, then blue.
    const lost = { blue: 0, red: 0 };
    for (const t of this.structs.values()) if (!t.alive) lost[t.team]++;
    const st = this.state;
    let winner = lost.blue !== lost.red ? (lost.blue < lost.red ? 'blue' : 'red')
      : (st.blueKills !== st.redKills ? (st.blueKills > st.redKills ? 'blue' : 'red') : 'blue');
    // Abandoners lose: if only one side had humans, the other side takes it.
    const sides = { blue: 0, red: 0 };
    for (const sid of this._played) { const ch = this.champs.get(sid); if (ch) sides[ch.team]++; }
    if (sides.blue && !sides.red) winner = 'red'; else if (sides.red && !sides.blue) winner = 'blue';
    this._endMatch(winner, now, 'abandon');
  }

  // ───────────────────────── intents (humans + bots) ─────────────────────────
  /** order {type:'move',x,y} | {type:'attack',id} | {type:'stop'}. Cancels recall. */
  _doOrder(sid, msg) {
    if (this.state.phase !== 'playing' || !msg || typeof msg !== 'object') return false;
    const ch = this.champs.get(sid);
    if (!ch || ch.dead) return false;
    const now = Date.now();
    if (now - ch.lastOrderAt < MOVE_ORDER_RATE_MS) return false;
    if (msg.type === 'move') {
      if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return false;
      const p = clampToMap(msg.x, msg.y);
      const f = freeSpot(p.x, p.y, ch.radius); // a click inside furniture walks to the nearest free spot
      ch.order = { type: 'move', x: f.x, y: f.y, rx: p.x, ry: p.y };
      ch.atkTarget = '';
    } else if (msg.type === 'attack') {
      const id = msg.id;
      if (typeof id !== 'string' || !id || id.length > 64 || id === sid) return false;
      const t = this._ent(id);
      if (!t || !this._isAlive(t) || !this._canAttack(ch, t) || !this.canSee(ch.team, t, now)) return false; // v4: no clicking hidden enemies
      ch.order = { type: 'attack', id };
      ch.atkTarget = id;
    } else if (msg.type === 'stop') {
      ch.order = null;
      ch.atkTarget = '';
    } else {
      return false;
    }
    ch.lastOrderAt = now;
    this._cancelRecall(ch);
    return true;
  }

  /** cast {slot, x, y, id?} — generic checks here, type-specific ones in SkillEngine. */
  _doCast(sid, msg) {
    if (this.state.phase !== 'playing' || !msg || typeof msg !== 'object') return false;
    const ch = this.champs.get(sid);
    if (!ch || ch.dead) return false;
    const slot = msg.slot;
    if (slot !== 'q' && slot !== 'w' && slot !== 'e' && slot !== 'r') return false;
    const now = Date.now();
    if (now - ch.lastCastAt < CAST_RATE_MS) return false;
    if (now < ch.stunnedUntil || ch.knock) return false; // stunned / being knocked back
    if (slot === 'r' && ch.level < ULT_UNLOCK_LEVEL) return false;
    const rank = ch.ranks?.[slot] || 0;
    if (rank <= 0) return false;
    if (now < ch.cd[slot]) return false;
    const spec = ch.def.skills[slot];
    if (!spec || !(ch.mana >= spec.mana)) return false;
    let aim = clampToMap(Number.isFinite(msg.x) ? msg.x : ch.x, Number.isFinite(msg.y) ? msg.y : ch.y, 0);
    let id = (typeof msg.id === 'string' && msg.id.length <= 64) ? msg.id : '';
    if (id && this.units.get(id)?.utype === 'pet') return false; // pets are never valid targets
    // v4 auto-aim (§3.3): aim on yourself + no id → nearest VISIBLE enemy champion within
    // range + AUTO_AIM_SLACK, else the nearest visible enemy unit, else facing (SkillEngine).
    if (!id && AUTO_AIM_SKILLS.has(spec.type) && autoAimsAtEnemy(spec) && Math.hypot(aim.x - ch.x, aim.y - ch.y) < MIN_AIM_DIST) {
      const t = this._autoAimTarget(ch, autoAimReach(spec, AUTO_AIM_SLACK) - AUTO_AIM_SLACK, !!spec.champOnly || spec.targets === 'enemyChamp', now);
      if (t) {
        aim = { x: t.x, y: t.y };
        if (spec.type === 'target' || spec.toTarget) id = t.id;
      }
    }
    const augs = ch.augments || [];
    const nextCastCount = (ch._castCount || 0) + 1;
    ch._overloadCast = augs.includes('overload') && nextCastCount % 4 === 0;
    const prevReveal = ch.revealUntil || 0;
    ch.revealUntil = now + BUSH_REVEAL_MS;
    if (!this.skills.cast(ch, slot, spec, { x: aim.x, y: aim.y, id }, now)) { ch.revealUntil = prevReveal; ch._overloadCast = false; return false; }
    ch._stealthUntil = 0;
    ch._castCount = nextCastCount;
    ch.lastCastAt = now;
    ch.mana = Math.max(0, ch.mana - spec.mana);
    ch.cd[slot] = now + skillCooldownMs(spec.cd, ch.haste + ((ch._blueBuffUntil || 0) > now ? 0.15 : 0), rank);
    ch.action = slot;
    ch.actionSeq++;
    this._cancelRecall(ch);
    if (augs.includes('evo_dev_cleave')) ch._cleaveReady = true;
    if (augs.includes('evo_sprint_surge') && (spec.type === 'dash' || spec.type === 'blink')) {
      this._addBuff(ch, 'aug_ms', { msPct: 0.25 }, now + 2000, true);
    }
    if (slot === 'r' && augs.includes('evo_stack_lock')) this._addShield(ch, 140, now + 3500);
    if (slot === 'r' && augs.includes('evo_tester_barrage')) {
      ch.cd.r = Math.max(now, now + Math.round(Math.max(0, (ch.cd.r || 0) - now) * 0.65));
    }
    if (slot === 'r' && augs.includes('evo_volt_overdrive')) ch._servoOverdriveUntil = now + 4000;
    if ((spec.heal || spec.shield || spec.type === 'allies') && augs.includes('shared_resources')) this._heal(ch, 40);
    if ((spec.heal || spec.type === 'allies') && augs.includes('evo_ops_field')) {
      for (const al of this.champs.values()) {
        if (al.team === ch.team && !al.dead && dist(al, ch) <= 450) this._heal(al, 70);
      }
    }
    const roleP = championPassive(ch.def)?.id;
    if (roleP === 'swipe_combo') ch._swipeReady = true;
    if (roleP === 'syntax_surge') this._addBuff(ch, 'passive_ms', { msPct: 0.12 }, now + 1500, true);
    if (roleP === 'caffeine_brew' && ch._castCount % 2 === 0) {
      this._heal(ch, ch.maxHp * 0.06);
      let nearAl = null, nearD = 500;
      for (const al of this.champs.values()) {
        if (al.id !== ch.id && al.team === ch.team && !al.dead) {
          const d = dist(al, ch);
          if (d < nearD) { nearD = d; nearAl = al; }
        }
      }
      if (nearAl) this._heal(nearAl, nearAl.maxHp * 0.06);
    }
    if (ch.champ === 'pixel' && slot === 'e') ch._empowerUntil = now + 3500;
    if (ch.champ === 'model' && slot === 'w') ch._overfitUntil = now + 4500;
    if (roleP === 'uptime_pulse' && (spec.heal || spec.shield || spec.type === 'allies')) {
      ch.cd.r = Math.max(now, (ch.cd.r || 0) - 2000);
      this._addBuff(ch, 'passive_ms', { msPct: 0.15 }, now + 1500, true);
    }
    return true;
  }

  /** buy {item} — own fountain or dead; gold; buyBlocker; coffee is drunk on purchase. */
  _doBuy(sid, msg) {
    if (this.state.phase !== 'playing' || !msg || typeof msg !== 'object') return false;
    const ch = this.champs.get(sid);
    if (!ch) return false;
    const now = Date.now();
    if (now - ch.lastBuyAt < BUY_RATE_MS) return false;
    const id = msg.item;
    if (!isItemId(id)) return false;
    const it = ITEMS[id];
    if (SHOP_ONLY_IN_FOUNTAIN && !ch.dead && !this.inFountain(ch)) return false;
    const plan = recipePlan(ch.items, id);
    const payCost = it.consumable ? it.cost : plan.cost;
    if (!(ch.gold >= payCost)) return false;
    if (buyBlocker(ch.items, id)) return false;
    if (it.consumable) {
      if (ch.dead || ch.regens.length >= COFFEE_MAX_STACK) return false;
      const e = it.effect || {};
      const ms = Math.max(1, e.ms || 1);
      ch.regens.push({ until: now + ms, hpPerMs: (e.heal || 0) / ms, manaPerMs: (e.mana || 0) / ms });
      ch.gold -= payCost;
    } else {
      const res = applyBuy(ch.items, ch.boughtAt, id, now);
      if (!res.ok) return false;
      ch.itemsVer = (ch.itemsVer || 0) + 1;
      ch.gold -= res.cost;
    }
    ch.lastBuyAt = now;
    this._recalc(ch, now);
    return true;
  }

  /** RP-07 sell {slot} — same place rules as buy; refund = rules.sellValue (70 %, or 100 % right after buying). */
  _doSell(sid, msg) {
    if (this.state.phase !== 'playing' || !msg || typeof msg !== 'object') return false;
    const ch = this.champs.get(sid);
    if (!ch) return false;
    const slot = msg.slot;
    if (!Number.isInteger(slot) || slot < 0 || slot >= INVENTORY_SLOTS) return false;
    const now = Date.now();
    if (now - ch.lastBuyAt < BUY_RATE_MS) return false;
    const id = ch.items[slot];
    if (!id || !isItemId(id)) return false;
    if (SHOP_ONLY_IN_FOUNTAIN && !ch.dead && !this.inFountain(ch)) return false;
    const refund = sellValue(ITEMS[id].cost, ch.boughtAt[slot], now);
    ch.items[slot] = '';
    ch.boughtAt[slot] = 0;
    ch.itemsVer = (ch.itemsVer || 0) + 1;
    ch.gold += refund;
    ch.lastBuyAt = now;
    this._recalc(ch, now);
    return true;
  }

  /** recall — RECALL_MS channel; cancelled by damage, orders, casts, stuns. */
  _doRecall(sid) {
    if (this.state.phase !== 'playing') return false;
    const ch = this.champs.get(sid);
    if (!ch || ch.dead || ch.recallUntil > 0) return false;
    const now = Date.now();
    if (now - ch.lastRecallAt < RECALL_RATE_MS || now < ch.stunnedUntil || ch.knock) return false;
    ch.lastRecallAt = now;
    ch.recallUntil = now + ((ch.augments || []).includes('recall_opt') ? 2600 : RECALL_MS);
    ch.order = null;
    ch.atkTarget = '';
    ch.action = 'recall';
    ch.actionSeq++;
    return true;
  }


  // ───────────────────────── v3: champion select intents ─────────────────────────
  /** pick {champ} — select phase, not locked, a real champion no TEAMMATE hovers/locks (enemy duplicates OK). */
  _doPick(sid, msg) {
    if (this.state.phase !== 'select' || !msg || typeof msg !== 'object') return false;
    const sl = this.slots.get(sid);
    if (!sl || sl.isBot || sl.s.locked) return false;
    const now = Date.now();
    if (now - sl.lastPickAt < PICK_RATE_MS) return false;
    if (!this._freeForTeam(sl.team, msg.champ, sid)) return false;
    sl.lastPickAt = now;
    sl.s.champ = msg.champ;
    sl.role = CHAMPIONS[msg.champ].lane || sl.role;
    return true;
  }

  /** lock — select phase, a hovered champion (still free on the team). */
  _doLock(sid) {
    if (this.state.phase !== 'select') return false;
    const sl = this.slots.get(sid);
    if (!sl || sl.isBot || sl.s.locked) return false;
    if (!this._freeForTeam(sl.team, sl.s.champ, sid)) return false;
    sl.s.locked = true;
    this._rebalanceBots(sl.team); // EP-19
    return true;
  }

  /** spells {d, f} — lobby / select (also after locking), two different known spells. */
  _doSpells(sid, msg) {
    const ph = this.state.phase;
    if ((ph !== 'lobby' && ph !== 'room' && ph !== 'select') || !msg || typeof msg !== 'object') return false;
    const sl = this.slots.get(sid);
    if (!sl || sl.isBot) return false;
    const now = Date.now();
    if (now - sl.lastSpellsAt < PICK_RATE_MS) return false;
    if (!validSpellPair(msg.d, msg.f)) return false;
    sl.lastSpellsAt = now;
    sl.s.spellD = msg.d;
    sl.s.spellF = msg.f;
    return true;
  }

  // ───────────────────────── EP-04: rollback (concede) vote ─────────────────────────
  /**
   * vote {yes:boolean} — EXPERIENCE_PASS_BREAKDOWN.md §3.3. A `yes` with no open vote on your
   * team starts one (playing, match clock ≥ ROLLBACK_FROM_MS, team not in cooldown); otherwise
   * it is your ballot in the open vote. Denials go to the sender only:
   *   voteDeny {reason:'phase'}    not playing (lobby / select / loading / ended)
   *            {reason:'early'}    before ROLLBACK_FROM_MS
   *            {reason:'cooldown'} the team's last vote failed < ROLLBACK_COOLDOWN_MS ago
   *            {reason:'active'}   you already voted in the open vote (ballots are final)
   * A `no` with no open vote is ignored. Teams vote separately (an enemy never sees / affects it).
   */
  _doVote(sid, msg) {
    if (!msg || typeof msg !== 'object' || typeof msg.yes !== 'boolean') return false;
    const now = Date.now();
    if (now - (this._lastVoteAt.get(sid) || 0) < VOTE_RATE_MS) return false;
    this._lastVoteAt.set(sid, now);
    const deny = (reason) => { this._sendTo(sid, 'voteDeny', { reason }); return false; };
    const ch = this.champs.get(sid);
    if (this.state.phase !== 'playing' || !ch) return deny('phase');
    if (ch.isBot) return false; // a bot-held seat (in reconnect grace) has no client to vote with
    const v = this._votes[ch.team];
    if (v) {
      if (v.voters.has(sid)) return deny('active');
      this._castVote(v, ch, msg.yes, now);
      return true;
    }
    if (!msg.yes) return false;
    if (this.matchMs(now) < ROLLBACK_FROM_MS) return deny('early');
    if (now < this._voteCd[ch.team]) return deny('cooldown');
    this._startVote(ch, now);
    return true;
  }

  _votePayload(v) { return { yes: v.yes, no: v.no, need: ROLLBACK_NEED, endsAt: v.endsAt, by: v.by }; }

  _startVote(ch, now) {
    const team = ch.team;
    const v = { team, by: ch.name, endsAt: now + ROLLBACK_VOTE_MS, yes: 0, no: 0, humanNo: false, voters: new Set(), botQueue: [] };
    this._votes[team] = v;
    const [d0, d1] = VOTE_BOT_DELAY_MS;
    for (const c of this.champs.values()) {
      if (c.team === team && c.isBot) v.botQueue.push({ sid: c.id, at: now + d0 + Math.random() * (d1 - d0) });
    }
    this._sendTeam(team, 'feed', { text: fill(ROLLBACK_START_LINE, { by: ch.name, yes: 1, need: ROLLBACK_NEED }), color: '#ffd23f', a: ch.id });
    console.log(`[TeamRoom] rollback vote opened by ${ch.id} (${team})`);
    this._castVote(v, ch, true, now);
  }

  /** One ballot (human or bot) → team update → maybe decided. */
  _castVote(v, ch, yes, now) {
    if (v.voters.has(ch.id) || this._votes[v.team] !== v) return;
    v.voters.add(ch.id);
    if (yes) v.yes++; else { v.no++; if (!ch.isBot) v.humanNo = true; }
    this._sendTeam(v.team, 'vote', this._votePayload(v));
    this._checkVote(v, now);
  }

  /**
   * Decide as soon as the outcome is certain: a human `no` → fail · yes ≥ NEED with every
   * connected human of the team having voted → pass · NEED out of reach → fail · timer → pass
   * iff yes ≥ NEED (and no human said no).
   */
  _checkVote(v, now) {
    if (this._votes[v.team] !== v) return;
    if (v.humanNo) { this._endVote(v, false, now); return; }
    let humansLeft = 0;
    for (const c of this.champs.values()) if (c.team === v.team && !c.isBot && !v.voters.has(c.id)) humansLeft++;
    if (v.yes >= ROLLBACK_NEED && humansLeft === 0) { this._endVote(v, true, now); return; }
    if (v.yes + humansLeft + v.botQueue.length < ROLLBACK_NEED) { this._endVote(v, false, now); return; }
    if (now >= v.endsAt) this._endVote(v, v.yes >= ROLLBACK_NEED, now);
  }

  _endVote(v, passed, now) {
    if (this._votes[v.team] !== v) return;
    this._votes[v.team] = null;
    this._sendTeam(v.team, 'voteEnd', { passed });
    console.log(`[TeamRoom] rollback vote (${v.team}) ${passed ? 'PASSED' : 'failed'} ${v.yes} yes / ${v.no} no`);
    if (passed) { this._endMatch(otherTeam(v.team), now, 'rollback', v); return; }
    this._voteCd[v.team] = now + ROLLBACK_COOLDOWN_MS;
    this._sendTeam(v.team, 'feed', { text: ROLLBACK_FAIL_LINE, color: '#8890a0' });
  }

  /** Tick (playing): bot ballots come in after a short "thinking" delay; the timer closes the vote. */
  _tickVotes(now) {
    for (let t = 0; t < TEAMS.length; t++) {
      const v = this._votes[TEAMS[t]];
      if (!v) continue;
      const q = v.botQueue;
      for (let i = 0; i < q.length; i++) {
        if (now < q[i].at) continue;
        const sid = q[i].sid;
        q.splice(i--, 1);
        const c = this.champs.get(sid);
        if (!c || !c.isBot) continue; // its human came back → they vote themselves
        const yes = this.bots.wantsRollback(v.team);
        this._castVote(v, c, yes, now);
        this.bots.onRollbackVote(sid, yes);
        if (this._votes[v.team] !== v) break;
      }
      if (this._votes[v.team] === v) this._checkVote(v, now);
    }
  }

  // ───────────────────────── v3: summoner spells ─────────────────────────
  /**
   * spell {slot:'d'|'f', x, y, id?} — playing, alive, not stunned / displaced, ready
   * (no haste), CAST_RATE_MS. Per-kind target rules (shared/moba/spells.js):
   *   blink  needs a finite aim, not rooted; lands on a free spot (crosses walls)
   *   dot    enemy CHAMPION in range (an explicit id must be one — minions / pets rejected)
   *   smite  monster or enemy minion in range (champions / pets / structures rejected)
   * fx {k:'spell', sid, spell, x0, y0, x1, y1, id} — x1,y1 = landing / target position.
   */
  _doSpell(sid, msg) {
    if (this.state.phase !== 'playing' || !msg || typeof msg !== 'object') return false;
    const ch = this.champs.get(sid);
    if (!ch || ch.dead) return false;
    const slot = msg.slot;
    if (slot !== 'd' && slot !== 'f') return false;
    const now = Date.now();
    if (now - ch.lastSpellAt < CAST_RATE_MS) return false;
    if (now < ch.stunnedUntil || ch.knock) return false;
    if (now < ch.spellCd[slot]) return false;
    const spellId = ch.spells[slot];
    if (!isSpellId(spellId)) return false;
    const sp = SPELLS[spellId];
    const hasAim = Number.isFinite(msg.x) && Number.isFinite(msg.y);
    const aim = clampToMap(hasAim ? msg.x : ch.x, hasAim ? msg.y : ch.y, 0);
    const tid = (typeof msg.id === 'string' && msg.id.length <= 64) ? msg.id : '';
    // v4 auto-aim: no aim / aim on yourself (+ no id) → nearest valid visible target to the caster.
    const selfAim = !hasAim || Math.hypot(aim.x - ch.x, aim.y - ch.y) < MIN_AIM_DIST;
    const x0 = ch.x, y0 = ch.y;
    let x1 = ch.x, y1 = ch.y, target = null;
    switch (sp.kind) {
      case 'blink': {
        if (!hasAim || now < ch.rootedUntil) return false;
        const dx = aim.x - ch.x, dy = aim.y - ch.y, d = Math.hypot(dx, dy);
        const k = d > sp.range ? sp.range / d : 1;
        const land = freeSpot(ch.x + dx * k, ch.y + dy * k, ch.radius);
        x1 = land.x; y1 = land.y;
        if (d > 1) { ch.faceX = dx / d; ch.faceY = dy / d; }
        break;
      }
      case 'heal': {
        let bestP = 1;
        for (const c of this.champs.values()) {
          if (c === ch || c.dead || c.team !== ch.team || dist(ch, c) > sp.radius + c.radius) continue;
          const p = c.hp / Math.max(1, c.maxHp);
          if (p < bestP) { bestP = p; target = c; }
        }
        if (target) { x1 = target.x; y1 = target.y; }
        break;
      }
      case 'haste': case 'shield': break;
      case 'dot': {
        const ok = (e) => !!e && e.etype === 'champ' && !e.dead && e.team !== ch.team && dist(ch, e) <= sp.range + e.radius + RANGE_SLACK
          && this.canSee(ch.team, e, now);
        target = tid ? this.champs.get(tid) || null
          : selfAim ? this._nearestOk(ch, ok, this.champs.values()) : this._nearestTo(aim, ok, this.champs.values());
        if (!ok(target)) return false;
        x1 = target.x; y1 = target.y;
        break;
      }
      case 'smite': {
        const ok = (u) => !!u && u.etype === 'unit' && u.alive && !u.resetting
          && (u.utype === 'monster' || (u.utype === 'minion' && u.team !== ch.team)) && dist(ch, u) <= sp.range + u.radius + RANGE_SLACK
          && this.canSee(ch.team, u, now);
        target = tid ? this._ent(tid)
          : selfAim ? this._nearestOk(ch, ok, this.units.values()) : this._nearestTo(aim, ok, this.units.values());
        if (!ok(target)) return false;
        x1 = target.x; y1 = target.y;
        break;
      }
      default: return false;
    }
    ch.lastSpellAt = now;
    ch.spellCd[slot] = now + sp.cd * 1000 * ((ch.augments || []).includes('flash_cache') ? 0.8 : 1);
    ch.revealUntil = now + BUSH_REVEAL_MS; // v4: casting a spell reveals you (before the fx goes out)
    this._cancelRecall(ch);
    this._fx({ k: 'spell', sid, spell: spellId, x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(x1), y1: Math.round(y1), id: target ? target.id : '' });
    this.spellStats.casts[spellId] = (this.spellStats.casts[spellId] || 0) + 1;
    const lv = ch.level;
    switch (sp.kind) {
      case 'blink':
        ch.x = x1; ch.y = y1; ch.nav = null;
        break;
      case 'heal': {
        const amt = scaledAmount(sp.heal, lv, 0, 0);
        const until = now + sp.ms;
        for (const c of target ? [ch, target] : [ch]) {
          this._heal(c, amt);
          this._addBuff(c, 'spell_heal', { msPct: sp.msPct }, until, true);
        }
        break;
      }
      case 'haste':
        this._addBuff(ch, 'ghost', { msPct: sp.msPct }, now + sp.ms);
        break;
      case 'shield':
        this._addShield(ch, scaledAmount(sp.shield, lv, 0, 0), now + sp.ms);
        break;
      case 'dot': {
        const ticks = Math.max(1, Math.round(sp.ms / IGNITE_TICK_MS));
        // One burn PER CASTER: a second Escalate from someone else stacks (own damage + credit);
        // the same caster re-igniting refreshes only their own burn.
        target.burns = target.burns.filter((b) => b.src !== ch.id);
        target.burns.push({ src: ch.id, perTick: scaledAmount(sp.dmg, lv, 0, 0) / ticks, left: ticks, nextAt: now + IGNITE_TICK_MS, until: now + sp.ms, healCut: sp.healCut || 0 });
        target.damagers.set(ch.id, now); // assist credit + kill credit if it burns them out
        break;
      }
      case 'smite': {
        const t = target;
        let contested = false;
        if (t.epic) {
          const camp = this.camps.get(t.campId);
          for (const [cid, at] of camp?.attackers || []) {
            const c = this.champs.get(cid);
            if (c && c.team !== ch.team && now - at <= SMITE_STEAL_WINDOW_MS) contested = true;
          }
        }
        this._dealDamage(ch, t, scaledAmount(sp.dmg, lv, 0, 0), { kind: 'spell', trueDmg: true });
        if (t.utype === 'monster') this._heal(ch, (sp.healSelf || 0) * ch.maxHp);
        if (t.epic && !t.alive) {
          this.spellStats.smiteEpics++;
          if (contested) {
            this.spellStats.smiteSteals++;
            const def = EPICS[t.kind];
            this._feed({ text: `💀 ${ch.name} kill -9'd ${def?.title || 'the epic'} right out from under ${teamLabel(otherTeam(ch.team))}!`, color: TEAM_INFO[ch.team].css, a: ch.id });
          }
        }
        break;
      }
      default: break;
    }
    return true;
  }

  /** Entity from `list` passing `ok` nearest to `from` (no radius cap — `ok` holds the range check). */
  _nearestOk(from, ok, list) {
    let best = null, bestD = Infinity;
    for (const e of list) {
      if (!ok(e)) continue;
      const d = Math.hypot(e.x - from.x, e.y - from.y) - (e.radius || 0);
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  /** v4 auto-aim: nearest visible enemy champion within range + AUTO_AIM_SLACK, else (unless champOnly) the nearest visible enemy unit. */
  _autoAimTarget(ch, range, champOnly, now = Date.now()) {
    const maxD = range + AUTO_AIM_SLACK;
    let best = null, bestD = Infinity;
    for (const c of this.champs.values()) {
      if (c.dead || c.team === ch.team || !this.canSee(ch.team, c, now)) continue;
      const d = Math.hypot(c.x - ch.x, c.y - ch.y) - c.radius;
      if (d <= maxD && d < bestD) { best = c; bestD = d; }
    }
    if (best || champOnly) return best;
    for (const u of this.units.values()) {
      if (!u.alive || u.team === ch.team || u.utype === 'pet' || u.resetting || !this.canSee(ch.team, u, now)) continue;
      const d = Math.hypot(u.x - ch.x, u.y - ch.y) - u.radius;
      if (d <= maxD && d < bestD) { best = u; bestD = d; }
    }
    return best;
  }

  /** Entity from `list` passing `ok` nearest the aim point (≤ AUTO_TARGET_RADIUS beyond its radius). */
  _nearestTo(aim, ok, list) {
    let best = null, bestD = AUTO_TARGET_RADIUS;
    for (const e of list) {
      if (!ok(e)) continue;
      const d = Math.hypot(e.x - aim.x, e.y - aim.y) - (e.radius || 0);
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  /** Healing received multiplier (Escalate / Strict Linter Grievous Wounds). */
  _healMul(ch, now = Date.now()) {
    let cut = (ch._grievousUntil || 0) > now ? 0.4 : 0;
    for (const b of ch.burns || []) if (now < b.until) cut = Math.max(cut, b.healCut);
    return 1 - Math.max(0, Math.min(1, cut));
  }

  /** Is any Escalate burn active on `ch`? */
  _ignited(ch, now = Date.now()) { return !!ch.burns && ch.burns.some((b) => now < b.until); }

  /** Ignite burns: each ticks its OWN caster's true damage every IGNITE_TICK_MS. Returns true if they killed. */
  _tickIgnite(ch, now) {
    if (!ch.burns.length) return false;
    for (const b of [...ch.burns]) {
      while (b.left > 0 && now >= b.nextAt && !ch.dead) {
        b.left--;
        b.nextAt += IGNITE_TICK_MS;
        this._dealDamage(this.champs.get(b.src) || null, ch, b.perTick, { kind: 'spell', trueDmg: true });
      }
      if (ch.dead) return true;
    }
    ch.burns = ch.burns.filter((b) => b.left > 0 || now < b.until);
    return false;
  }

  _onChat(sid, msg) {
    const ch = this._member(sid);
    if (!ch) return;
    let text = (typeof msg?.text === 'string') ? msg.text : '';
    text = text.replace(/[\r\n\t]+/g, ' ').trim().slice(0, CHAT_MAX);
    if (!text) return;
    const now = Date.now();
    if (now - (this._lastChatAt.get(sid) || 0) < CHAT_RATE_MS) return;
    this._lastChatAt.set(sid, now);
    this._broadcastChat({ sid, name: ch.name, text });
    this.bots.onHumanChat(sid, text);
  }

  /** Dev-only (BUG_SMASH_DEBUG=1): gold | level | win | epic (+ start | autopilot). */
  _onDebug(sid, msg) {
    if (!msg || typeof msg !== 'object') return;
    const ch = this.champs.get(sid);
    const now = Date.now();
    const n = Number.isFinite(msg.n) ? msg.n : null;
    switch (msg.cmd) {
      case 'gold':
        if (ch) ch.gold = Math.min(DEBUG_GOLD_MAX * 10, ch.gold + Math.max(0, Math.min(DEBUG_GOLD_MAX, n ?? DEBUG_GOLD_DEFAULT)));
        break;
      case 'level': {
        if (!ch) break;
        const lv = Math.max(1, Math.min(MAX_LEVEL, Math.round(n ?? ch.level + 1)));
        ch.xp = Math.max(ch.xp, XP_TABLE[lv - 1]);
        this._giveXp(ch, 0, now);
        break;
      }
      case 'win': {
        if (this.state.phase !== 'playing') break;
        if (ch && Number.isFinite(msg.kills)) ch.kills = Math.max(0, Math.min(99, msg.kills | 0)); // harness: an MVP-worthy line
        const team = (msg.team === 'blue' || msg.team === 'red') ? msg.team : (ch?.team || 'blue');
        const core = this.structs.get(`${otherTeam(team)}_core`);
        if (core && core.alive) { core.hp = 0; this._onStructDeath(core, ch || null, now); }
        break;
      }
      case 'epic': {
        if (this.state.phase !== 'playing') break;
        const id = msg.id === 'deadline' ? 'deadline' : (msg.id === 'golden' ? 'golden' : null);
        if (id && !this._epicUnit(id)) this._spawnEpic(id, now);
        break;
      }
      case 'start': // skip ahead one phase: lobby → select → loading → playing
        if (this.state.phase === 'lobby' || this.state.phase === 'room') this._startSelect();
        else if (this.state.phase === 'select') this._startLoading(now);
        else if (this.state.phase === 'loading') this._startPlaying();
        break;
      case 'tp': { // v2 nav tests: teleport yourself (lands on a free spot)
        if (!ch || ch.dead || this.state.phase !== 'playing' || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) break;
        ch.knock = null; // (the _knocked entry is dropped on the next tick)
        this._teleport(ch, msg.x, msg.y);
        ch.order = null; ch.atkTarget = ''; ch.recallUntil = 0;
        this._petToOwner(ch);
        break;
      }
      case 'cd': // reset your cooldowns (skills + summoner spells) + refill mana
        if (!ch || ch.dead) break;
        ch.cd = { q: 0, w: 0, e: 0, r: 0 };
        ch.spellCd = { d: 0, f: 0 };
        ch.mana = ch.maxMana;
        break;
      case 'clock': { // EP-04 tests: fast-forward the match clock by n ms (≤ 1 h) — e.g. past ROLLBACK_FROM_MS
        if (this.state.phase !== 'playing' || n === null) break;
        this.state.startedAt -= Math.max(0, Math.min(3600000, n));
        break;
      }
      case 'tower': { // EP-04 tests: destroy `team`'s first standing tower (outer → inner → core firewall)
        if (this.state.phase !== 'playing') break;
        const team = (msg.team === 'blue' || msg.team === 'red') ? msg.team : (ch?.team || 'blue');
        let best = null;
        for (const s of this.structs.values()) if (s.alive && s.kind === 'tower' && s.team === team && (!best || s.tier < best.tier)) best = s;
        if (best) { best.hp = 0; this._onStructDeath(best, null, now); }
        break;
      }
      case 'freeze': // pause / resume every bot brain (deterministic headless tests)
        this.bots.paused = !this.bots.paused;
        break;
      case 'autopilot': // let a bot brain drive your champion (headless playtests)
        if (!ch || this.state.phase !== 'playing') break;
        if (this.bots.isBot(sid)) this.bots.remove(sid); else this.bots.adopt(sid, ch.role, { silent: true });
        break;
      default: break;
    }
  }

  // ───────────────────────── simulation tick ─────────────────────────
  _tick(rawDt) {
    const now = Date.now();
    this._runTimers(now);
    const st = this.state;
    if (st.phase !== 'playing') this._syncScores(); // draft seats change by message (pick / side / spells)
    if (st.phase === 'lobby') {
      if (st.lobbyEndsAt && now >= st.lobbyEndsAt && this.slots.size > 0) this._startSelect();
      return;
    }
    if (st.phase === 'room') return; // v4 custom: no timer — the host starts
    if (st.phase === 'select') { this._tickSelect(now); return; }
    if (st.phase === 'loading') {
      if (now >= st.loadingEndsAt) this._startPlaying();
      return;
    }
    if (st.phase === 'ended') {
      if (this._endAt && now >= this._endAt && !this._closing) {
        this._closing = true;
        try { this.disconnect()?.catch?.(() => { }); } catch (_) { /* already disposing */ }
      }
      return;
    }
    const dt = Math.max(0, Math.min(MAX_TICK_DT, Number.isFinite(rawDt) ? rawDt : TICK_MS));

    this._tickAbandon(now);
    if (st.phase !== 'playing') return;
    this._expireTeamBuffs(now);
    if (!this._crunch && st.startedAt && now - st.startedAt >= CRUNCH_MS) {
      this._crunch = true;
      this._announce({ title: '⏰ CRUNCH TIME', sub: 'Everyone ships at 2× — structures take double damage, no backdoor guard', color: '#ff5e5e', big: true });
    }
    // Alternate processing order every tick. Blue is always inserted first
    // (bots, champions, wave minions), so a fixed order let red react to blue's
    // already-applied moves each tick — red won 24 of 38 simulated matches.
    this._tickN = (this._tickN || 0) + 1;
    const rev = (this._tickN & 1) === 1;
    this.mover.beginTick();
    this.bots.tick(now, rev);
    if (st.phase !== 'playing') return; // a bot debug path could end it
    if (this._votes.blue || this._votes.red) {
      this._tickVotes(now);
      if (st.phase !== 'playing') return; // rolled back (_endMatch already synced)
    }
    this._tickWaves(now);
    this._tickCampsAndEpics(now);

    this._tickKnocks(now);
    this._rebuildGrid();
    const champs = this._champArr;
    champs.length = 0;
    for (const ch of this.champs.values()) champs.push(ch);
    if (rev) champs.reverse();
    for (let i = 0; i < champs.length; i++) this._tickChamp(champs[i], dt, now);
    const units = this._unitArr;
    units.length = 0;
    for (const u of this.units.values()) units.push(u);
    if (rev) units.reverse();
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (st.phase !== 'playing') break; // the core can fall mid-tick
      if (!u.alive) continue;
      if (u.utype === 'minion') this._tickMinion(u, dt, now);
      else if (u.utype === 'pet') this._tickPet(u, dt, now);
      else if (u.utype === 'ward') { if (now >= u.expiresAt) { u.alive = false; u.removeAt = now + UNIT_REMOVE_MS; } }
      else this._tickMonster(u, dt, now);
    }
    // Core destroyed during this tick → stop simulating (no fx/atk after the victory banner).
    if (st.phase === 'playing') {
      this._separateUnits();
      for (const s of this.structs.values()) if (s.alive && s.kind === 'tower') this._tickTower(s, now);
      if (st.phase === 'playing') this._tickShots(now);
      if (st.phase === 'playing') this.skills.tick(dt, now);
      if (st.phase === 'playing') this._tickFountains(dt, now);
    }
    if (st.phase !== 'playing') this._atkBatch.length = 0;
    this._cleanupUnits(now);
    if (st.phase === 'playing' && this._tickN % VISION_EVERY_TICKS === 0) this._updateBushes();
    this._sync(now);
    this._syncScores();
    if (this._atkBatch.length) this._flushAtk(now);
    this._gcViews(now);
  }

  _runTimers(now) {
    if (!this._timers.length) return;
    let any = false;
    for (const t of this._timers) if (t.at <= now) { any = true; break; }
    if (!any) return;
    const due = [];
    this._timers = this._timers.filter((t) => (t.at <= now ? (due.push(t), false) : true));
    for (const t of due) {
      try { t.fn(); } catch (err) { console.error('[TeamRoom] timer threw:', err?.message || err); }
    }
  }

  /** Tick-driven timeout (survives a fake clock; cleared on dispose). */
  _later(ms, fn) { this._timers.push({ at: Date.now() + ms, fn }); }

  _expireTeamBuffs(now) {
    const st = this.state;
    if (st.buffBlue && now >= st.buffBlueUntil) { st.buffBlue = ''; st.buffBlueUntil = 0; }
    if (st.buffRed && now >= st.buffRedUntil) { st.buffRed = ''; st.buffRedUntil = 0; }
  }

  teamBuffActive(team, now = Date.now()) {
    const st = this.state;
    return team === 'blue' ? (st.buffBlue === 'deadline' && now < st.buffBlueUntil)
      : team === 'red' ? (st.buffRed === 'deadline' && now < st.buffRedUntil) : false;
  }

  matchMs(now = Date.now()) { return this.state.startedAt ? now - this.state.startedAt : 0; }

  // ───────────────────────── champions ─────────────────────────
  _tickChamp(ch, dt, now) {
    if (this.state.phase !== 'playing') return;
    // Passive gold keeps flowing while dead (it's time-based, per contract §2).
    if (ch.dead && now - this.state.startedAt >= PASSIVE_GOLD_DELAY_MS) ch.gold += PASSIVE_GOLD_PER_SEC * dt / 1000;
    if (ch.dead) {
      if (now >= ch.respawnAt) this._respawn(ch, now);
      return;
    }
    if (ch.burns.length && this._tickIgnite(ch, now)) return; // burned out
    // Timed effects
    if (ch.buffs.length) prune(ch.buffs, (b) => b.until > now);
    if (ch.shields.length) prune(ch.shields, (s) => s.until > now && s.amt > 0.5);
    if (ch.slowUntil && now >= ch.slowUntil) { ch.slowUntil = 0; ch.slowPct = 0; }
    const augs = ch.augments || [];
    if (augs.includes('efficient_farming')) {
      if (!ch._farmTickAt) ch._farmTickAt = now + 10000;
      else if (now >= ch._farmTickAt) { ch._farmTickAt = now + 10000; ch.gold += 18; }
    }
    if (ch.bush && !ch._wasInBush && augs.includes('bush_hacker')) {
      ch._augCd = ch._augCd || {};
      if ((ch._augCd.bush_hacker || 0) <= now) {
        ch._augCd.bush_hacker = now + 12000;
        for (const foe of this.champs.values()) {
          if (!foe.dead && foe.team !== ch.team && dist(foe, ch) <= 750) foe.revealUntil = Math.max(foe.revealUntil || 0, now + 2000);
        }
      }
    }
    if (!ch.bush && ch._wasInBush && augs.includes('bush_hacker') && augs.includes('ghost_protocol')) {
      ch._augCd = ch._augCd || {};
      if ((ch._augCd.shadow_ops || 0) <= now) {
        ch._augCd.shadow_ops = now + 8000;
        this._addBuff(ch, 'shadow_ops', { msPct: 0.2 }, now + 2000, true);
      }
    }
    ch._wasInBush = !!ch.bush;
    for (const rl of this._relics) {
      if (rl.upAt <= now && dist(ch, rl) <= 68 && (ch.hp < ch.maxHp - 5 || ch.mana < ch.maxMana - 5)) {
        rl.upAt = now + 60000;
        this._relicsDirty = true;
        this._heal(ch, ch.maxHp * 0.18);
        ch.mana = Math.min(ch.maxMana, ch.mana + ch.maxMana * 0.15);
        this._fx({ k: 'heal', x: Math.round(ch.x), y: Math.round(ch.y), r: 80, color: 0x39ff14 });
      }
    }
    if (this._relicsDirty) {
      this._relicsDirty = false;
      this.state.relicsJson = JSON.stringify(this._relics);
    }
    this._recalc(ch, now);

    // Regen (×4 out of combat) + coffee + passive gold
    const sec = dt / 1000;
    const ooc = now - ch.lastDamagedAt >= OUT_OF_COMBAT_MS ? 4 : 1;
    const healMul = this._healMul(ch, now); // v3: Escalate cuts regen + coffee too
    ch.hp = Math.min(ch.maxHp, ch.hp + ch.maxHp * HP_REGEN_PCT_PER_SEC * ooc * sec * healMul);
    const blueMana = (ch._blueBuffUntil || 0) > now ? ch.maxMana * 0.03 * sec : 0;
    ch.mana = Math.min(ch.maxMana, ch.mana + (ch.maxMana * MANA_REGEN_PCT_PER_SEC * ooc + (ch._manaRegen || 0)) * sec + blueMana);
    if (ch.regens.length) {
      for (const r of ch.regens) {
        const ms = Math.max(0, Math.min(dt, r.until - (now - dt)));
        ch.hp = Math.min(ch.maxHp, ch.hp + r.hpPerMs * ms * healMul);
        ch.mana = Math.min(ch.maxMana, ch.mana + r.manaPerMs * ms);
      }
      prune(ch.regens, (r) => r.until > now);
    }
    if (now - this.state.startedAt >= PASSIVE_GOLD_DELAY_MS) ch.gold += PASSIVE_GOLD_PER_SEC * sec;

    // Recall channel
    if (ch.recallUntil > 0 && now >= ch.recallUntil) {
      ch.recallUntil = 0;
      const spot = this._fountainSpot(ch.team, ch.slot);
      this._teleport(ch, spot.x, spot.y);
      ch.order = null;
      ch.atkTarget = '';
      ch.action = 'idle';
      ch.actionSeq++;
      this._petToOwner(ch);
      this.bots.onRecalled(ch);
    }

    const x0 = ch.x, y0 = ch.y;
    if (now >= ch.stunnedUntil && ch.recallUntil === 0 && !ch.knock) this._champAct(ch, dt, now);
    const k = dt > 0 ? 1000 / dt : 0;
    ch.vx = (ch.x - x0) * k;
    ch.vy = (ch.y - y0) * k;
  }

  _champAct(ch, dt, now) {
    const rooted = now < ch.rootedUntil;
    const o = ch.order;
    if (o && o.type === 'attack') {
      const t = this._ent(o.id);
      if (!t || !this._isAlive(t) || !this._canAttack(ch, t) || !this.canSee(ch.team, t, now)) { // v4: target vanished into a bush
        ch.order = null;
        ch.atkTarget = '';
      } else {
        ch.atkTarget = t.id;
        if (this._inAttackRange(ch, t)) this._tryChampAttack(ch, t, now);
        else if (!rooted) this.mover.move(ch, t.x, t.y, ch.ms, dt, now);
        return;
      }
    }
    if (o && o.type === 'move') {
      ch.atkTarget = '';
      if (!rooted && this.mover.move(ch, o.x, o.y, ch.ms, dt, now)) ch.order = null;
      return;
    }
    // Idle: keep hitting what's in range, else auto-acquire (never chases).
    let t = ch.atkTarget ? this._ent(ch.atkTarget) : null;
    if (!t || !this._isAlive(t) || !this._canAttack(ch, t) || !this._inAttackRange(ch, t) || !this.canSee(ch.team, t, now)) t = this._acquireIdle(ch, now);
    ch.atkTarget = t ? t.id : '';
    if (t) this._tryChampAttack(ch, t, now);
  }

  /** Nearest enemy minion / champion / monster-attacking-me in range; structures last. */
  _acquireIdle(ch, now = Date.now()) {
    let best = null, bestD = Infinity;
    for (const u of this.units.values()) {
      if (!u.alive || u.resetting || u.team === ch.team || u.utype === 'pet' || !this.canSee(ch.team, u, now)) continue;
      if (u.team === 'neutral' && u.target !== ch.id) continue;
      const d = dist(ch, u);
      if (d < bestD && this._inAttackRange(ch, u)) { best = u; bestD = d; }
    }
    for (const c of this.champs.values()) {
      if (c.dead || c.team === ch.team || !this.canSee(ch.team, c, now)) continue;
      const d = dist(ch, c);
      if (d < bestD && this._inAttackRange(ch, c)) { best = c; bestD = d; }
    }
    if (best) return best;
    for (const s of this.structs.values()) {
      if (!s.alive || s.invulnerable || s.team === ch.team) continue;
      if (this._inAttackRange(ch, s)) return s;
    }
    return null;
  }

  _tryChampAttack(ch, t, now) {
    if (now < ch.atkReadyAt) return;
    ch.atkReadyAt = now + 1000 / Math.max(0.1, ch.as);
    ch.revealUntil = now + BUSH_REVEAL_MS; // v4: attacking reveals you
    ch._stealthUntil = 0;
    ch.atkTarget = t.id;
    ch.action = 'attack';
    ch.actionSeq++;
    const d = dist(ch, t) || 1;
    ch.faceX = (t.x - ch.x) / d; ch.faceY = (t.y - ch.y) / d;
    const ranged = !!ch.def.ranged;
    this._atkBatch.push({ f: ch.id, t: t.id, r: ranged ? 1 : 0 });
    if (ranged) this._queueShot(ch, t, ch.ad, now, { kind: 'atk' });
    else this._dealDamage(ch, t, ch.ad, { kind: 'atk' });
  }

  _respawn(ch, now) {
    ch.dead = false;
    ch.respawnAt = 0;
    ch.hp = ch.maxHp;
    ch.mana = ch.maxMana;
    const spot = this._fountainSpot(ch.team, ch.slot);
    ch.x = spot.x; ch.y = spot.y;
    ch.order = null; ch.atkTarget = ''; ch.atkReadyAt = 0;
    ch.nav = null; ch.knock = null; ch.burns = [];
    ch.action = 'idle';
    ch.actionSeq++;
    this._recalc(ch, now);
    ch.hp = ch.maxHp;
    ch.mana = ch.maxMana;
    this._spawnPet(ch); // Servo reboots with its owner
  }

  /** stats = statAt(base, growth, level) + items + buffs (slow on top). Keeps hp % on max-HP gains. */
  _recalc(ch, now) {
    const b = ch.def.base, g = ch.def.growth || {};
    const lv = ch.level;
    // v4: item stats & passives only change on a purchase / reset (itemsVer) — cached per champion.
    if (ch._itemsVerSeen !== (ch.itemsVer || 0) || !ch._itemStats || !ch._itemPassives) {
      ch._itemStats = itemStats(ch.items);
      ch._itemPassives = itemPassives(ch.items);
      ch._itemsVerSeen = ch.itemsVer || 0;
    }
    const it = ch._itemStats;
    let asPct = it.as || 0, msPct = 0, armorAdd = 0, apPct = it.apPct || 0, adPct = 0, keep = 1, petPct = 0;
    for (const bf of ch.buffs) {
      if (bf.until <= now) continue;
      const s = bf.stats;
      asPct += s.as || 0;
      msPct += s.msPct || 0;
      armorAdd += s.armor || 0;
      apPct += s.apPct || 0;
      adPct += s.adPct || 0;
      petPct += s.petPct || 0;
      if (s.dmgReduction) keep *= 1 - Math.min(0.9, s.dmgReduction);
    }
    ch.petPct = Math.max(0, Math.min(3, petPct));
    const maxHp = statAt(b.hp, g.hp, lv) + (it.hp || 0);
    const maxMana = statAt(b.mana, g.mana, lv) + (it.mana || 0);
    if (!ch.dead && ch.maxHp > 0 && maxHp > ch.maxHp) ch.hp += maxHp - ch.maxHp;
    if (!ch.dead && ch.maxMana > 0 && maxMana > ch.maxMana) ch.mana += maxMana - ch.maxMana;
    ch.maxHp = maxHp;
    ch.maxMana = maxMana;
    ch.hp = Math.min(ch.hp, maxHp);
    ch.mana = Math.min(ch.mana, maxMana);
    ch.ad = (statAt(b.ad, g.ad, lv) + (it.ad || 0)) * (1 + adPct);
    ch.ap = (statAt(b.ap || 0, g.ap, lv) + (it.ap || 0)) * (1 + apPct);
    const roleP = championPassive(ch.def)?.id;
    const tankArmor = (roleP === 'failover' && (ch._tankUntil || 0) > now) ? (ch._tankStacks || 0) * 3 : 0;
    const furyLs = (roleP === 'hotfix_fury' && maxHp > 0 && ch.hp / maxHp < 0.5) ? 0.12 : 0;
    ch.armor = statAt(b.armor, g.armor, lv) + (it.armor || 0) + armorAdd + tankArmor;
    ch.mr = statAt(b.mr || 30, g.mr || 1.2, lv) + (it.mr || 0);
    ch._armorPen = it.armorPen || 0;
    ch._mrPen = it.mrPen || 0;
    ch._manaRegen = it.manaRegen || 0;
    const _rAugs = ch.augments || [];
    if (_rAugs.includes('ghost_protocol') && (now - (ch._lastCombatAt || 0) >= 5000)) msPct += 0.15;
    if ((ch._prefetchUntil || 0) > now) asPct += 0.2;
    const slow = now < ch.slowUntil ? ch.slowPct : 0;
    ch.ms = Math.max(MIN_MOVE_SPEED, (b.ms + (it.ms || 0)) * (1 + msPct) * (1 - slow));
    ch.as = Math.min(MAX_ATTACK_SPEED, statAt(b.as, g.as, lv) * (1 + asPct));
    ch.range = b.range;
    ch.haste = Math.min(MAX_HASTE_PCT, it.haste || 0);
    ch.lifesteal = (it.lifesteal || 0) + furyLs;
    ch.dmgTakenMul = keep;
  }

  // ───────────────────────── minions ─────────────────────────
  _tickWaves(now) {
    if (!this._nextWaveAt || now < this._nextWaveAt) return;
    this._nextWaveAt += WAVE_EVERY_MS;
    this._waveNo++;
    const siege = this._waveNo % SIEGE_EVERY_N_WAVES === 0;
    const growth = 1 + MINION_GROWTH_PER_WAVE * (this._waveNo - 1);
    const full = siege ? [...WAVE_COMPOSITION, 'siege'] : WAVE_COMPOSITION;
    const perLane = {};
    for (const u of this.units.values()) {
      if (u.alive && u.utype === 'minion') perLane[`${u.team}_${u.lane}`] = (perLane[`${u.team}_${u.lane}`] || 0) + 1;
    }
    // Entity budget: when near MINION_TOTAL_CAP every team AND lane gets the
    // same truncated wave (back ranks dropped first) — never one side only.
    const room = Math.max(0, MINION_TOTAL_CAP - this._minionCount);
    const n = Math.min(full.length, Math.floor(room / (TEAMS.length * LANE_IDS.length)));
    const kinds = full.slice(0, n);
    for (const team of TEAMS) {
      const enemy = otherTeam(team);
      const empowered = this.teamBuffActive(team, now);
      for (const lane of LANE_IDS) {
        if ((perLane[`${team}_${lane}`] || 0) >= MINION_LANE_CAP) continue;
        const superLane = !this.structs.get(`${enemy}_${lane}_2`)?.alive || !this.structs.get(`${enemy}_base_3`)?.alive;
        const laneKinds = superLane && kinds.length ? ['siege', ...kinds.slice(1)] : kinds;
        const path = minionPath(team, lane);
        const p0 = path[0], p1 = path[1];
        const d = dist(p0, p1) || 1;
        const ux = (p1.x - p0.x) / d, uy = (p1.y - p0.y) / d;
        // Lateral offsets are mirrored for red so both bases look (and play) the same.
        const flip = team === 'blue' ? 1 : -1;
        laneKinds.forEach((kind, i) => {
          const back = i * MINION_SPACING;
          const side = (i % 2 ? 1 : -1) * 14 * flip;
          this._addMinion(team, lane, kind, p0.x - ux * back - uy * side, p0.y - uy * back + ux * side, growth, empowered, superLane && i === 0);
        });
      }
    }
    if (this._waveNo === 1) this._feed({ text: '🐞 The first bug waves have shipped — last-hit them for gold!', color: '#c9a0ff' });
  }

  _addMinion(team, lane, kind, x, y, growth, empowered, isSuper = false) {
    const def = MINIONS[kind];
    const id = 'u' + (this._nextUnitId++);
    const s = new TeamUnit();
    const hpMul = growth * (empowered ? DEADLINE_MINION_HP_MUL : 1) * (isSuper ? 1.85 : 1);
    const dmgMul = growth * (empowered ? 1 + EPICS.deadline.buff.minionBuffPct : 1) * (isSuper ? 1.55 : 1);
    const p = freeSpot(x, y, Math.max(MINION_RADIUS, def.size / 2));
    const u = {
      id, etype: 'unit', utype: 'minion', team, kind, lane, s,
      x: p.x, y: p.y, radius: Math.max(MINION_RADIUS, def.size / 2),
      maxHp: Math.round(def.hp * hpMul), hp: Math.round(def.hp * hpMul), alive: true, armor: 0,
      dmg: def.dmg * dmgMul, range: def.range, atkMs: def.atkMs, speed: def.speed,
      gold: def.gold, xp: def.xp, ranged: kind !== 'melee', empowered,
      path: minionPath(team, lane), wp: 1, par: this._nextUnitId & 1, // par: v4 staggered position sync
      target: '', atkReadyAt: 0, retargetAt: 0, forcedUntil: 0,
      stunnedUntil: 0, rootedUntil: 0, slowUntil: 0, slowPct: 0, hitSeq: 0, removeAt: 0,
      nav: null, knock: null,
    };
    s.team = team; s.kind = kind; s.campId = '';
    this.units.set(id, u);
    this._minionCount++;
    this._syncUnit(u);
    this.state.units.set(id, s);
    return u;
  }

  _tickMinion(m, dt, now) {
    if (now < m.stunnedUntil || m.knock) return;
    let t = m.target ? this._ent(m.target) : null;
    if (t && (!this._isAlive(t) || !this._minionCanHit(m, t) || dist(m, t) - t.radius > MINION_CHASE_RANGE || !this.canSee(m.team, t, now))) {
      t = null; m.target = ''; m.forcedUntil = 0;
      this._resumePath(m);
    }
    if (now >= m.retargetAt && now >= m.forcedUntil) {
      m.retargetAt = now + MINION_RETARGET_MS + Math.random() * 60;
      const n = this._minionAcquire(m, now);
      if (n && (!t || PRIORITY[n.etype] > PRIORITY[t.etype])) { t = n; m.target = n.id; }
    }
    const rooted = now < m.rootedUntil;
    const speed = m.speed * (now < m.slowUntil ? 1 - m.slowPct : 1);
    if (t) {
      if (dist(m, t) <= m.range + t.radius) {
        if (now >= m.atkReadyAt) {
          m.atkReadyAt = now + m.atkMs;
          m.revealUntil = now + BUSH_REVEAL_MS;
          this._atkBatch.push({ f: m.id, t: t.id, r: m.ranged ? 1 : 0 });
          if (m.ranged) this._queueShot(m, t, m.dmg, now, { kind: 'minion' });
          else this._dealDamage(m, t, m.dmg, { kind: 'minion' });
        }
      } else if (!rooted) {
        this.mover.move(m, t.x, t.y, speed, dt, now);
      }
      return;
    }
    if (rooted) return;
    // Walk the lane, then on to the enemy core.
    const last = m.path.length - 1;
    while (m.wp < last && dist(m, m.path[m.wp]) < WAYPOINT_REACHED) m.wp++;
    const wp = m.path[m.wp];
    if (m.wp === last && dist(m, wp) <= MINION_CORE_STOP) return;
    this.mover.move(m, wp.x, wp.y, speed, dt, now);
  }

  /** After a chase, continue from the nearest lane segment (never walk backwards). */
  _resumePath(m) {
    let best = m.wp, bestD = Infinity;
    for (let i = Math.max(0, m.wp - 1); i < m.path.length - 1; i++) {
      const a = m.path[i], b = m.path[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const l2 = dx * dx + dy * dy || 1;
      const k = Math.max(0, Math.min(1, ((m.x - a.x) * dx + (m.y - a.y) * dy) / l2));
      const d = Math.hypot(m.x - (a.x + dx * k), m.y - (a.y + dy * k));
      if (d < bestD) { bestD = d; best = i + 1; }
    }
    m.wp = Math.max(m.wp, best);
  }

  _minionCanHit(m, t) {
    if (t.team === m.team || t.team === 'neutral') return false;
    if (t.etype === 'struct') return !t.invulnerable;
    return true;
  }

  /** Nearest enemy in aggro range — minion › champion › (vulnerable) structure. */
  _minionAcquire(m, now = Date.now()) {
    let best = null, bestD = MINION_AGGRO_RANGE;
    for (const u of this._unitsNear(m.x, m.y, MINION_AGGRO_RANGE + 40)) {
      if (!u.alive || u.utype !== 'minion' || u.team === m.team || !this.canSee(m.team, u, now)) continue;
      const d = dist(m, u);
      if (d <= bestD) { best = u; bestD = d; }
    }
    if (best) return best;
    for (const c of this.champs.values()) {
      if (c.dead || c.team === m.team || !this.canSee(m.team, c, now)) continue;
      const d = dist(m, c);
      if (d <= bestD) { best = c; bestD = d; }
    }
    if (best) return best;
    for (const s of this.structs.values()) {
      if (!s.alive || s.invulnerable || s.team === m.team) continue;
      const d = dist(m, s) - s.radius;
      if (d <= bestD) { best = s; bestD = d; }
    }
    return best;
  }

  /** Champion-on-champion damage: nearby minions of the victim's team turn on the attacker. */
  _callForHelp(attacker, victim, now) {
    for (const m of this._unitsNear(attacker.x, attacker.y, MINION_AGGRO_RANGE + 40)) {
      if (!m.alive || m.utype !== 'minion' || m.team !== victim.team) continue;
      if (dist(m, attacker) > MINION_AGGRO_RANGE) continue;
      if (m.target === attacker.id) { m.forcedUntil = now + MINION_CHAMP_AGGRO_MS; continue; }
      const cur = m.target ? this._ent(m.target) : null;
      if (cur && cur.etype === 'champ' && now < m.forcedUntil) continue;
      m.target = attacker.id;
      m.forcedUntil = now + MINION_CHAMP_AGGRO_MS;
    }
  }

  // ───────────────────────── jungle + epics ─────────────────────────
  _tickCampsAndEpics(now) {
    if (this._campsAt && now >= this._campsAt) {
      this._campsAt = 0;
      for (const spot of CAMP_SPOTS) this._spawnCamp(spot, now);
      this._feed({ text: '🌲 Legacy code is stirring in the jungle — camps are up', color: '#7ed957' });
    }
    for (const camp of this.camps.values()) {
      if (camp.respawnAt && now >= camp.respawnAt) {
        camp.respawnAt = 0;
        this._spawnCamp(camp, now);
      }
    }
    const st = this.state;
    if (st.epicGoldenAt > 0 && now >= st.epicGoldenAt) this._spawnEpic('golden', now);
    if (st.epicDeadlineAt > 0 && now >= st.epicDeadlineAt) this._spawnEpic('deadline', now);
  }

  _spawnCamp(spot, now) {
    const type = spot.type;
    const def = CAMP_TYPES[type];
    let camp = this.camps.get(spot.id);
    if (!camp) {
      camp = { id: spot.id, type, side: spot.side, x: spot.x, y: spot.y, unitIds: new Set(), attackers: new Map(), respawnAt: 0 };
      this.camps.set(spot.id, camp);
    }
    camp.attackers.clear();
    for (let i = 0; i < def.count; i++) {
      const a = (i / def.count) * Math.PI * 2 + 0.6;
      const r = def.count > 1 ? 42 + def.size * 0.25 : 0;
      const u = this._addMonster(type, camp.id, camp.x + Math.cos(a) * r, camp.y + Math.sin(a) * r, def, CAMP_LEASH_RADIUS, false);
      camp.unitIds.add(u.id);
    }
  }

  _addMonster(kind, campId, x, y, def, leash, epic) {
    const id = 'u' + (this._nextUnitId++);
    const s = new TeamUnit();
    const p = freeSpot(x, y, def.size / 2);
    const sc = campScaleAt(this.matchMs(), epic);
    const maxHp = Math.round(def.hp * sc.hpMul);
    const dmg = Math.round(def.dmg * sc.dmgMul);
    const gold = Math.round((def.gold || 0) * sc.rewardMul);
    const xp = Math.round((def.xp || 0) * sc.rewardMul);
    const u = {
      id, etype: 'unit', utype: 'monster', team: 'neutral', kind, campId, s, epic,
      x: p.x, y: p.y, homeX: p.x, homeY: p.y, radius: def.size / 2,
      maxHp, hp: maxHp, alive: true, armor: 0,
      dmg, atkMs: def.atkMs, range: MONSTER_REACH, speed: epic ? MONSTER_SPEED * 0.8 : MONSTER_SPEED,
      gold, xp, leash,
      target: '', atkReadyAt: 0, resetting: false, lastHitBy: '',
      stunnedUntil: 0, rootedUntil: 0, slowUntil: 0, slowPct: 0, hitSeq: 0, removeAt: 0,
      nav: null, knock: null,
    };
    s.team = 'neutral'; s.kind = kind; s.campId = campId;
    this.units.set(id, u);
    this._syncUnit(u);
    this.state.units.set(id, s);
    return u;
  }

  _spawnEpic(id, now) {
    if (this._epicUnit(id)) return;
    const def = EPICS[id];
    const spot = EPIC_SPOTS[id];
    let camp = this.camps.get(id);
    if (!camp) {
      camp = { id, type: id, side: 'river', x: spot.x, y: spot.y, unitIds: new Set(), attackers: new Map(), respawnAt: 0, epic: true };
      this.camps.set(id, camp);
    }
    camp.attackers.clear();
    camp.respawnAt = 0;
    const u = this._addMonster(id, id, spot.x, spot.y, def, EPIC_LEASH_RADIUS, true);
    camp.unitIds.add(u.id);
    if (id === 'golden') this.state.epicGoldenAt = 0; else this.state.epicDeadlineAt = 0;
    const where = id === 'golden' ? 'bot-side river' : 'top-side river';
    this._announce({ title: `${def.title} has spawned`, sub: `${where} · ${def.reward}`, color: id === 'golden' ? '#ffd700' : '#ff5252' });
    this._feed({ text: `${def.title} appeared in the ${where}`, color: id === 'golden' ? '#ffd700' : '#ff5252' });
    this.bots.onEpicSpawn(id);
  }

  _epicUnit(id) {
    const camp = this.camps.get(id);
    if (!camp) return null;
    for (const uid of camp.unitIds) {
      const u = this.units.get(uid);
      if (u && u.alive) return u;
    }
    return null;
  }

  _tickMonster(mo, dt, now) {
    if (mo.knock) return;
    if (mo.resetting) {
      if (this.mover.move(mo, mo.homeX, mo.homeY, MONSTER_RETURN_SPEED, dt, now)) {
        mo.resetting = false;
        mo.hp = mo.maxHp;
      }
      return;
    }
    if (!mo.target || now < mo.stunnedUntil) return;
    const home = { x: mo.homeX, y: mo.homeY };
    let t = this.champs.get(mo.target);
    if (!t || t.dead || dist(t, home) > mo.leash + 250) {
      t = this._campNextTarget(mo, now);
      if (!t) { this._resetCamp(mo.campId); return; }
      mo.target = t.id;
    }
    if (dist(mo, home) > mo.leash) { this._resetCamp(mo.campId); return; }
    if (dist(mo, t) <= mo.range + mo.radius + t.radius) {
      if (now >= mo.atkReadyAt) {
        mo.atkReadyAt = now + mo.atkMs;
        mo.revealUntil = now + BUSH_REVEAL_MS;
        this._atkBatch.push({ f: mo.id, t: t.id, r: 0 });
        this._dealDamage(mo, t, mo.dmg, { kind: 'monster' });
        if (mo.kind === 'deadline') {
          // THE DEADLINE slams: champions bunched up with its target get hit too.
          this._fx({ k: 'circle', id: t.id, x: Math.round(t.x), y: Math.round(t.y), r: DEADLINE_CLEAVE_RADIUS, delay: 0, color: 0xff5252 }); // id → vision-filtered
          for (const c of this.champs.values()) {
            if (c === t || c.dead || dist(c, t) > DEADLINE_CLEAVE_RADIUS + c.radius) continue;
            this._dealDamage(mo, c, mo.dmg * 0.6, { kind: 'monster' });
          }
        }
      }
    } else if (now >= mo.rootedUntil) {
      this.mover.move(mo, t.x, t.y, mo.speed * (now < mo.slowUntil ? 1 - mo.slowPct : 1), dt, now);
    }
  }

  /** Most recent attacker of the camp still inside the leash. */
  _campNextTarget(mo, now) {
    const camp = this.camps.get(mo.campId);
    if (!camp) return null;
    let best = null, bestAt = 0;
    for (const [cid, at] of camp.attackers) {
      const c = this.champs.get(cid);
      if (!c || c.dead || now - at > 8000) continue;
      if (Math.hypot(c.x - mo.homeX, c.y - mo.homeY) > mo.leash + 200) continue;
      if (at > bestAt) { best = c; bestAt = at; }
    }
    return best;
  }

  _resetCamp(campId) {
    const camp = this.camps.get(campId);
    if (!camp) return;
    camp.attackers.clear();
    for (const uid of camp.unitIds) {
      const u = this.units.get(uid);
      if (!u || !u.alive) continue;
      u.target = '';
      u.resetting = true;
      u.stunnedUntil = 0; u.rootedUntil = 0; u.slowUntil = 0; u.slowPct = 0;
    }
  }

  /** A champion hit a monster: the whole camp wakes up and goes after them. */
  _aggroCamp(mo, ch, now) {
    const camp = this.camps.get(mo.campId);
    if (!camp) return;
    camp.attackers.set(ch.id, now);
    for (const uid of camp.unitIds) {
      const u = this.units.get(uid);
      if (!u || !u.alive || u.resetting) continue;
      const cur = u.target ? this.champs.get(u.target) : null;
      if (!cur || cur.dead) u.target = ch.id;
    }
  }

  // ───────────────────────── structures ─────────────────────────
  _buildStructures() {
    for (const def of STRUCTURES) {
      const s = new TeamStructure();
      const maxHp = def.kind === 'core' ? CORE.hp : TOWER.hp[def.tier];
      const rec = {
        id: def.id, etype: 'struct', team: def.team, kind: def.kind, lane: def.lane, tier: def.tier, s,
        x: def.x, y: def.y, radius: STRUCTURE_RADIUS[def.kind] || 70,
        hp: maxHp, maxHp, alive: true, invulnerable: false,
        armor: def.kind === 'core' ? CORE.armor : TOWER.armor,
        prereq: unlockedBy(def), target: '', atkReadyAt: 0, rampId: '', ramp: 0,
        lastDamagedAt: 0, lastChampDamageAt: 0,
      };
      s.x = def.x; s.y = def.y; s.team = def.team; s.kind = def.kind; s.lane = def.lane; s.tier = def.tier;
      this.structs.set(def.id, rec);
      this.state.structures.set(def.id, s);
    }
    this._refreshInvulnerability();
    for (const rec of this.structs.values()) this._syncStruct(rec);
  }

  /** unlockedBy(): invulnerable until ANY prerequisite is destroyed. */
  _refreshInvulnerability() {
    for (const s of this.structs.values()) {
      s.invulnerable = s.alive && s.prereq.length > 0 && !s.prereq.some((id) => this.structs.get(id)?.alive === false);
    }
  }

  _tickTower(tw, now) {
    if (now < tw.atkReadyAt || now < (tw.scanAt || 0)) return;
    const t = this._towerTarget(tw, now);
    if (!t) { tw.target = ''; tw.scanAt = now + 100; return; } // v4: idle towers rescan at 10 Hz
    tw.atkReadyAt = now + TOWER.atkMs;
    tw.target = t.id;
    let dmg, opts;
    if (t.etype === 'champ') {
      if (tw.rampId === t.id) tw.ramp = Math.min(TOWER_MAX_RAMP_HITS, tw.ramp + 1);
      else { tw.rampId = t.id; tw.ramp = 0; }
      dmg = TOWER.dmgChamp * (1 + TOWER.dmgChampRampPct * tw.ramp);
      opts = { kind: 'tower' };
    } else {
      tw.rampId = ''; tw.ramp = 0;
      dmg = TOWER.dmgMinionPctMaxHp * t.maxHp;
      opts = { kind: 'tower', trueDmg: true };
    }
    this._atkBatch.push({ f: tw.id, t: t.id, r: 1 });
    this._queueShot(tw, t, dmg, now, opts);
  }

  /**
   * Tower target: enemy champion that hurt an allied champion near the tower
   * (last 2 s) › current target › nearest enemy minion › nearest enemy champion.
   */
  _towerTarget(tw, now) {
    const range = TOWER.range;
    let best = null, bestD = Infinity;
    for (const c of this.champs.values()) {
      if (c.dead || c.team === tw.team || now - c.aggroAt > TOWER_AGGRO_MS || !this.canSee(tw.team, c, now)) continue;
      const d = dist(tw, c);
      if (d > range + c.radius || d >= bestD) continue;
      const v = this.champs.get(c.aggroVictim);
      if (!v || v.team !== tw.team || dist(tw, v) > range + TOWER_AGGRO_VICTIM_PAD) continue;
      best = c; bestD = d;
    }
    if (best) return best;
    const cur = tw.target ? this._ent(tw.target) : null;
    if (cur && this._isAlive(cur) && cur.team !== tw.team && cur.team !== 'neutral' && dist(tw, cur) <= range + cur.radius && this.canSee(tw.team, cur, now)) return cur;
    for (const u of this._unitsNear(tw.x, tw.y, range + 60)) {
      if (!u.alive || u.utype !== 'minion' || u.team === tw.team || !this.canSee(tw.team, u, now)) continue;
      const d = dist(tw, u);
      if (d <= range + u.radius && d < bestD) { best = u; bestD = d; }
    }
    if (best) return best;
    for (const c of this.champs.values()) {
      if (c.dead || c.team === tw.team || !this.canSee(tw.team, c, now)) continue;
      const d = dist(tw, c);
      if (d <= range + c.radius && d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  // ───────────────────────── shots + fountain ─────────────────────────
  /** Ranged auto-attacks / tower shots land after the projectile's travel time. */
  _queueShot(src, t, dmg, now, opts) {
    this._shots.push({ src, tid: t.id, dmg, at: now + (dist(src, t) / ATK_PROJ_SPEED) * 1000, opts });
  }

  _tickShots(now) {
    if (!this._shots.length) return;
    const due = this._dueBuf;
    due.length = 0;
    const arr = this._shots;
    let w = 0;
    for (let i = 0; i < arr.length; i++) { const s = arr[i]; if (s.at <= now) due.push(s); else arr[w++] = s; }
    arr.length = w;
    for (const s of due) {
      const t = this._ent(s.tid);
      if (t && this._isAlive(t)) this._dealDamage(s.src, t, s.dmg, s.opts);
    }
  }

  _tickFountains(dt, now) {
    const sec = dt / 1000;
    for (const ch of this.champs.values()) {
      if (ch.dead) continue;
      const own = FOUNTAIN[ch.team];
      if (dist(ch, own) <= FOUNTAIN_RADIUS) {
        ch.hp = Math.min(ch.maxHp, ch.hp + ch.maxHp * FOUNTAIN_HEAL_PER_SEC * sec * this._healMul(ch, now));
        ch.mana = Math.min(ch.maxMana, ch.mana + ch.maxMana * FOUNTAIN_MANA_PER_SEC * sec);
        continue;
      }
      const enemy = otherTeam(ch.team);
      if (dist(ch, FOUNTAIN[enemy]) <= FOUNTAIN_RADIUS) {
        const src = FOUNTAIN_SRC[enemy];
        this._dealDamage(src, ch, FOUNTAIN_LASER_DPS * sec, { kind: 'fountain', trueDmg: true });
        if (now >= ch.fountainFxAt) {
          ch.fountainFxAt = now + FOUNTAIN_FX_MS;
          this._fx({ k: 'hit', id: ch.id, color: TEAM_INFO[enemy].color });
        }
      }
    }
  }

  /** Is the champion inside its own fountain (shop + heal zone)? */
  inFountain(ch) { return dist(ch, FOUNTAIN[ch.team]) <= FOUNTAIN_RADIUS; }

  // ───────────────────────── unit housekeeping ─────────────────────────
  /** Light separation so minions / monsters don't stack into one sprite. */
  _separateUnits() {
    const arr = this._sepList;
    arr.length = 0;
    for (const u of this.units.values()) if (u.alive && !u.resetting && !u.epic && !u.knock && u.utype !== 'pet') arr.push(u);
    // v4: sweep over units sorted by x + y — stop once b is further along than any overlap.
    arr.sort(byDiag);
    let maxR = 0;
    for (let i = 0; i < arr.length; i++) if (arr[i].radius > maxR) maxR = arr[i].radius;
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      const reach = ((a.radius + maxR) * 0.8 + 2) * 2; // |Δ(x+y)| ≤ |Δx| + |Δy|
      for (let j = i + 1; j < arr.length; j++) {
        const b = arr[j];
        if ((b.x + b.y) - (a.x + a.y) > reach) break;
        const min = (a.radius + b.radius) * 0.8;
        const dx = b.x - a.x;
        if (dx > min || dx < -min) continue;
        const dy = b.y - a.y;
        if (dy > min || dy < -min) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2);
        let nx, ny;
        if (d > 0.01) { nx = dx / d; ny = dy / d; } else { const ang = (i * 7 + j) % 6.28; nx = Math.cos(ang); ny = Math.sin(ang); }
        const push = (min - d) * 0.25;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
    // A crowd push must never shove anyone into furniture (O(1) skip in open floor).
    for (const u of arr) if (nearWall(u.x, u.y)) resolveWalls(u);
  }

  _cleanupUnits(now) {
    for (const u of this.units.values()) {
      if (u.alive || now < u.removeAt) continue;
      this.units.delete(u.id);
      this.state.units.delete(u.id);
    }
  }

  // ───────────────────────── combat core ─────────────────────────
  _ent(id) {
    if (typeof id !== 'string' || !id) return null;
    return this.champs.get(id) || this.units.get(id) || this.structs.get(id) || null;
  }

  _isAlive(e) { return !!e && (e.etype === 'champ' ? !e.dead : e.alive); }

  /** Champion `ch` may auto-attack `t` (enemy or neutral, not invulnerable / resetting). */
  _canAttack(ch, t) {
    if (t.team === ch.team || t.utype === 'pet') return false; // pets are untargetable
    if (t.etype === 'struct' && t.invulnerable) return false;
    if (t.etype === 'unit' && t.resetting) return false;
    return true;
  }

  _inAttackRange(a, t) { return dist(a, t) <= a.range + t.radius + RANGE_SLACK; }

  /** Instant reposition (recall, dash end, blink, debug): always lands on a free spot; drops the cached route. */
  _teleport(e, x, y) {
    const c = freeSpot(x, y, e.radius || CHAMP_RADIUS);
    e.x = c.x;
    e.y = c.y;
    e.nav = null;
  }

  // ───────────────────────── v2: knockback ─────────────────────────
  /**
   * Push `t` `distPx` along unit vector (ux, uy) over KNOCKBACK_MS. Walls stop it
   * (nav.clipMove); stopped by a WALL → stunned for stunMs after landing. Epic
   * monsters, structures and pets are immune. The map edge just clamps.
   */
  _knockback(t, ux, uy, distPx, stunMs, now) {
    if (!this._isAlive(t) || t.etype === 'struct' || t.epic || t.utype === 'pet' || t.resetting) return false;
    if (!(distPx > 0) || !Number.isFinite(ux) || !Number.isFinite(uy)) return false;
    const r = t.radius || 0;
    const want = clampToMap(t.x + ux * distPx, t.y + uy * distPx, Math.max(30, r));
    const c = clipMove(t.x, t.y, want.x, want.y, r);
    const wall = !!c.hit;
    t.knock = { x0: t.x, y0: t.y, x1: c.x, y1: c.y, at: now, until: now + KNOCKBACK_MS };
    t.nav = null;
    this._knocked.add(t);
    if (t.etype === 'champ') this._cancelRecall(t);
    if (wall && stunMs > 0) {
      const ws = t.etype === 'champ' ? applyHardCcDuration(t, stunMs, now) : stunMs;
      if (ws > 0) t.stunnedUntil = Math.max(t.stunnedUntil || 0, now + KNOCKBACK_MS + ws);
    }
    this._fx({ k: 'knock', id: t.id, x0: Math.round(t.x), y0: Math.round(t.y), x1: Math.round(c.x), y1: Math.round(c.y), ms: KNOCKBACK_MS, wall });
    return true;
  }

  /** Advance every active knockback (ease-out); displaced entities can't act meanwhile. */
  _tickKnocks(now) {
    if (!this._knocked.size) return;
    for (const t of this._knocked) {
      const k = t.knock;
      if (!k || !this._isAlive(t)) { t.knock = null; this._knocked.delete(t); continue; }
      const f = Math.max(0, Math.min(1, (now - k.at) / Math.max(1, k.until - k.at)));
      const e = 1 - (1 - f) * (1 - f);
      t.x = k.x0 + (k.x1 - k.x0) * e;
      t.y = k.y0 + (k.y1 - k.y0) * e;
      if (f >= 1) {
        t.knock = null; this._knocked.delete(t); resolveWalls(t);
        if (t.utype === 'minion') this._resumePath(t); // knocked past a waypoint → don't walk back
      }
    }
  }

  // ───────────────────────── v2: pets ─────────────────────────
  /** The champion's live pet record (or null). */
  _petOf(ch) {
    if (!ch || !ch.petId) return null;
    const p = this.units.get(ch.petId);
    return p && p.alive ? p : null;
  }

  /** Where the pet hovers: `follow` px behind its owner (free spot). */
  _petSpot(o, follow = o.def.pet?.follow || 100) {
    const fl = Math.hypot(o.faceX || 0, o.faceY || 0) || 1;
    return freeSpot(o.x - (o.faceX || 0) / fl * follow, o.y - (o.faceY || 0) / fl * follow + 1, PET_RADIUS);
  }

  _petToOwner(o) {
    const pet = this._petOf(o);
    if (!pet) return;
    const s = this._petSpot(o);
    pet.x = s.x; pet.y = s.y; pet.nav = null;
  }

  /** Create the champion's pet (match start / respawn). No-op for champions without one. */
  _spawnPet(ch) {
    const def = ch.def.pet;
    if (!def || ch.dead || this.state.phase !== 'playing') return null;
    const cur = this._petOf(ch);
    if (cur) return cur;
    const id = 'u' + (this._nextUnitId++);
    const s = new TeamUnit();
    const spot = this._petSpot(ch);
    const u = {
      id, etype: 'unit', utype: 'pet', team: ch.team, kind: 'pet', owner: ch.id, campId: '', s,
      x: spot.x, y: spot.y, radius: PET_RADIUS, faceX: ch.faceX, faceY: ch.faceY,
      maxHp: 1, hp: 1, alive: true, armor: 0,
      range: Math.max(50, def.range || 300), atkMs: Math.max(200, def.atkMs || 1000),
      target: '', atkReadyAt: 0, hitSeq: 0, removeAt: 0,
      stunnedUntil: 0, rootedUntil: 0, slowUntil: 0, slowPct: 0, nav: null, knock: null,
    };
    s.team = ch.team; s.kind = 'pet'; s.campId = ''; s.owner = ch.id;
    this.units.set(id, u);
    this._syncUnit(u);
    this.state.units.set(id, s);
    ch.petId = id;
    return u;
  }

  /** Owner died / left / match over: the pet powers down (alive=false, removed shortly after). */
  _removePet(ch, immediate = false) {
    const id = ch?.petId;
    if (!id) return;
    ch.petId = '';
    const p = this.units.get(id);
    if (!p) return;
    p.alive = false;
    p.target = '';
    p.removeAt = Date.now() + UNIT_REMOVE_MS;
    if (immediate) { this.units.delete(id); this.state.units.delete(id); }
    else this._syncUnit(p);
  }

  /** The pet's target: the owner's auto-attack target, else the last enemy champion the owner hit (≤ 3 s). */
  _petTarget(o, now) {
    const ok = (t) => t && this._isAlive(t) && t.team !== o.team && t.utype !== 'pet'
      && !(t.etype === 'struct' && t.invulnerable) && !(t.etype === 'unit' && t.resetting)
      && dist(o, t) <= PET_LEASH * PET_CHASE_LEASH && this.canSee(o.team, t, now);
    let t = o.atkTarget ? this._ent(o.atkTarget) : null;
    if (ok(t)) return t;
    if (o.lastChampHitId && now - o.lastChampHitAt <= PET_OWNER_HIT_MEMORY_MS) {
      t = this.champs.get(o.lastChampHitId);
      if (ok(t)) return t;
    }
    return null;
  }

  _tickPet(p, dt, now) {
    const o = this.champs.get(p.owner);
    if (!o || o.dead || o.petId !== p.id) { if (o && o.petId === p.id) this._removePet(o); else { p.alive = false; p.removeAt = now + UNIT_REMOVE_MS; } return; }
    if (dist(p, o) > PET_LEASH) this._petToOwner(o);
    const speed = Math.max(MIN_MOVE_SPEED, o.ms) * PET_SPEED_MUL;
    const t = this._petTarget(o, now);
    p.target = t ? t.id : '';
    if (t) {
      if (dist(p, t) <= p.range + t.radius) {
        if (now >= p.atkReadyAt) {
          const od = (o._servoOverdriveUntil || 0) > now;
          const mul = (1 + (o.petPct || 0)) * (od ? 1.45 : 1);
          p.atkReadyAt = now + p.atkMs / mul;
          p.revealUntil = now + BUSH_REVEAL_MS;
          o.revealUntil = now + BUSH_REVEAL_MS; // the pet fights for its owner → reveals the owner too (before the fx)
          const d = dist(p, t) || 1;
          p.faceX = (t.x - p.x) / d; p.faceY = (t.y - p.y) / d;
          this._fx({ k: 'petatk', id: p.id, t: t.id });
          // Pet damage is the OWNER's damage (kill credit, gold, assists, aggro) — kind 'pet'.
          const dmgMul = (1 + (o.petPct || 0)) * (od ? 1.35 : 1);
          this._dealDamage(o, t, scaledAmount(o.def.pet.dmg, o.level, o.ad, o.ap, o.maxHp) * dmgMul, { kind: 'pet', dmgType: 'magic' });
        }
        return;
      }
      this.mover.move(p, t.x, t.y, speed, dt, now);
      return;
    }
    const spot = this._petSpot(o);
    if (dist(p, spot) > PET_ARRIVE) this.mover.move(p, spot.x, spot.y, speed, dt, now);
  }

  /** Target for a point-and-click / toTarget skill: the given id, else the enemy nearest the aim point. */
  _skillTarget(ch, aim, champOnly, range) {
    const maxD = range + TARGET_CAST_SLACK;
    const now = Date.now();
    const valid = (e) => e && this._isAlive(e) && e.etype !== 'struct' && e.utype !== 'pet' && e.team !== ch.team && !e.resetting
      && (!champOnly || e.etype === 'champ') && dist(ch, e) <= maxD + e.radius && this.canSee(ch.team, e, now); // v4: hidden = untargetable
    if (aim.id) {
      const e = this._ent(aim.id);
      if (valid(e)) return e;
    }
    let best = null, bestD = AUTO_TARGET_RADIUS;
    const consider = (e) => {
      if (!valid(e)) return;
      const d = Math.hypot(e.x - aim.x, e.y - aim.y) - e.radius;
      if (d < bestD) { best = e; bestD = d; }
    };
    for (const c of this.champs.values()) consider(c);
    if (!champOnly) for (const u of this.units.values()) consider(u);
    return best;
  }

  /**
   * The single damage path. src = champion / unit / structure record or a
   * fountain pseudo-source. Applies resist, Deadline siege bonus, crit + champion/item
   * passives, amp cap, damage reduction, backdoor guard, shields, lifesteal, assists, aggro + death.
   * Returns the damage dealt.
   */
  _dealDamage(src, t, raw, { kind = 'atk', trueDmg = false, dmgType = 'physical' } = {}) {
    if (this.state.phase !== 'playing' || !this._isAlive(t) || !(raw > 0)) return 0;
    if (t.utype === 'pet') return 0; // pets are invulnerable
    if (t.etype === 'champ' && (t._stasisUntil || 0) > Date.now()) return 0;
    if (t.etype === 'struct' && t.invulnerable) return 0;
    if (t.etype === 'unit' && t.resetting) return 0;
    const now = Date.now();
    let dmg = raw;
    if (!trueDmg) {
      const isMagic = dmgType === 'magic';
      const resist = isMagic ? (t.etype === 'champ' ? (t.mr || 30) : (t.armor || 0)) : (t.armor || 0);
      const shred = (!isMagic && t.etype === 'champ' && (t._auditUntil || 0) > now) ? 0.15 : 0;
      const pen = src?.etype === 'champ' ? (isMagic ? (src._mrPen || 0) : (src._armorPen || 0)) : 0;
      dmg = damageAfterResist(dmg, resist, shred, pen);
    }
    const baseAfterResist = dmg;
    if (t.etype === 'struct') {
      if (src?.etype === 'champ' && this.teamBuffActive(src.team, now)) dmg *= 1 + (EPICS.deadline.buff?.structDmgPct || 0.2);
      if (this._crunch) dmg *= CRUNCH_STRUCT_MUL; // Crunch Time: no backdoor guard, double structure damage
      else if (!this._hasMinionNear(src?.team, t.x, t.y, BACKDOOR_RADIUS)) dmg *= BACKDOOR_DAMAGE_MUL;
    }
    if (src && src.etype === 'champ' && !trueDmg && (kind === 'atk' || kind === 'skill')) {
      const srcP = src._itemPassives || itemPassives(src.items);
      const roleP = championPassive(src.def)?.id;
      let didCrit = false;
      if (kind === 'atk') {
        src._atkCount = (src._atkCount || 0) + 1;
        didCrit = (srcP.has('crit3') && src._atkCount % 3 === 0) || (srcP.has('crit') && Math.random() < 0.2);
        if (didCrit) dmg *= 1.6;
        if (roleP === 'regression_mark') {
          if (src._lastTargetId === t.id) t._bugStacks = Math.min(4, (t._bugStacks || 0) + 1);
          else { src._lastTargetId = t.id; t._bugStacks = 1; }
          t._bugUntil = now + 5000;
          if (src._atkCount % 3 === 0) dmg *= 1.35;
        }
        if (src.champ === 'zero' && t.etype === 'champ' && (t._vulnUntil || 0) > now) {
          t._vulnUntil = 0;
          dmg *= 1.3;
          src.cd.q = Math.max(now, (src.cd.q || 0) - 1500);
        }
        if (roleP === 'zero_day' && (now - (src._lastCombatAt || 0) > 4500)) dmg *= 1.3;
        if (roleP === 'servo_emp' && src._atkCount % 4 === 0 && t.etype !== 'struct') dmg += 40;
        if (roleP === 'swipe_combo' && src._swipeReady) { src._swipeReady = false; dmg *= 1.28; }
        if (roleP === 'slipstream' && (now - (src._lastCombatAt || 0) > 3500)) {
          dmg *= 1.25;
          if (t.etype === 'champ') this._applyCC(t, { slow: { pct: 0.15, ms: 1200 } }, now);
        }
        if (roleP === 'cache_hit') {
          if (src._lastTargetId === t.id) src._cacheStacks = Math.min(4, (src._cacheStacks || 0) + 1);
          else { src._lastTargetId = t.id; src._cacheStacks = 0; }
          dmg *= 1 + src._cacheStacks * 0.06;
          if (src._cacheStacks === 4 && (src.augments || []).includes('evo_cache_prefetch')) {
            this._dealDamage(src, t, 45, { kind: 'spell', dmgType: 'magic' });
            src._prefetchUntil = now + 2500;
          }
        }
      } else if (kind === 'skill') {
        if (roleP === 'strict_audit' && t.etype === 'champ') t._auditUntil = now + 2000;
        if (srcP.has('frost') && t.etype === 'champ') this._applyCC(t, { slow: { pct: 0.25, ms: 1500 } }, now);
      }
      if (srcP.has('execute') && t.maxHp > 0 && t.hp / t.maxHp < 0.35) dmg *= 1.15;
      if (srcP.has('overclock') && t.maxHp > 0 && t.hp / t.maxHp > 0.5) dmg *= 1.12;
      if (srcP.has('burn') && t.etype !== 'struct') dmg += 25;
      if (srcP.has('grievous') && t.etype === 'champ') t._grievousUntil = now + 3000;
      if (roleP === 'hotfix_fury' && src.maxHp > 0 && src.hp / src.maxHp < 0.5) dmg *= 1.12;
      if (roleP === 'pager_alert' && t.etype === 'unit' && t.utype === 'monster') dmg *= 1.25;
      const augs = src.augments || [];
      if (augs.includes('execution_protocol') && t.maxHp > 0 && t.hp / t.maxHp < 0.25) dmg *= 1.14;
      if (augs.includes('crowd_control') && t.etype === 'champ' && ((t.stunnedUntil || 0) > now || (t.rootedUntil || 0) > now || (t.slowUntil || 0) > now)) dmg *= 1.15;
      if (augs.includes('coordinated_strike') && t._lastHitBy && t._lastHitBy.id !== src.id && t._lastHitBy.team === src.team && (now - t._lastHitBy.t < 3000)) dmg *= 1.12;
      if (kind === 'atk' && src._cleaveReady && augs.includes('evo_dev_cleave')) {
        src._cleaveReady = false;
        const cDmg = dmg * 0.4;
        for (const ch of this.champs.values()) {
          if (!ch.dead && ch.id !== t.id && ch.team !== src.team && dist(ch, t) <= 170) ch.hp = Math.max(1, ch.hp - cDmg);
        }
      }
      if (kind === 'skill' && t.etype === 'champ' && augs.includes('chain_reaction')) {
        src._augCd = src._augCd || {};
        const isOv = !!src._overloadCast;
        if ((src._augCd.chain_reaction || 0) <= now || isOv) {
          if (isOv) src._overloadCast = false;
          else src._augCd.chain_reaction = now + 6000;
          for (const foe of this.champs.values()) {
            if (!foe.dead && foe.team !== src.team && dist(foe, t) <= 140) {
              this._dealDamage(src, foe, 55, { kind: 'spell', dmgType: 'magic' });
            }
          }
        }
      }
      t._lastHitBy = { id: src.id, team: src.team, t: now };
      src._lastCombatAt = now;
      const ampCeiling = (didCrit ? baseAfterResist * 1.6 : baseAfterResist) * 2.0 + 40;
      dmg = Math.min(dmg, ampCeiling);
      if ((src._redBuffUntil || 0) > now && t.etype !== 'struct') {
        dmg += 18;
        if (t.etype === 'champ') this._applyCC(t, { slow: { pct: 0.2, ms: 1500 } }, now);
      }
    }
    if (t.etype === 'champ') {
      dmg *= t.dmgTakenMul || 1;
      const tgtP = t._itemPassives || itemPassives(t.items);
      const tgtRoleP = championPassive(t.def)?.id;
      if (tgtP.has('fortress')) dmg *= 0.9;
      if (tgtRoleP === 'brick_wall') {
        let nearAlly = false;
        for (const al of this.champs.values()) if (al.id !== t.id && al.team === t.team && !al.dead && dist(al, t) <= 450) { nearAlly = true; break; }
        if (!nearAlly) for (const st of this.structs.values()) if (st.alive && st.team === t.team && st.kind === 'tower' && dist(st, t) <= 600) { nearAlly = true; break; }
        if (nearAlly) dmg *= 0.9;
      }
      if (tgtRoleP === 'failover') {
        t._tankStacks = Math.min(5, (t._tankStacks || 0) + 1);
        t._tankUntil = now + 4000;
        this._recalc(t, now);
      }
      if (tgtP.has('thorns') && src && src.etype === 'champ' && !trueDmg && (kind === 'atk' || kind === 'skill')) {
        src.hp = Math.max(1, src.hp - dmg * 0.18);
      }
      if (tgtP.has('lifeline') && (t._lifelineCd || 0) <= now && (t.hp - dmg) / Math.max(1, t.maxHp) < 0.3) {
        t._lifelineCd = now + 45000;
        this._addShield(t, 260, now + 3000);
      }
      const tAugs = t.augments || [];
      if (tAugs.includes('last_stand')) {
        t._augCd = t._augCd || {};
        if ((t._lastStandUntil || 0) > now) dmg *= 0.85;
        else if ((t._augCd.last_stand || 0) <= now && (t.hp - dmg) / Math.max(1, t.maxHp) < 0.3) {
          t._augCd.last_stand = now + 45000;
          t._lastStandUntil = now + 3000;
          dmg *= 0.85;
        }
      }
      if (tAugs.includes('pair_shield')) {
        for (const al of this.champs.values()) {
          if (al.id !== t.id && al.team === t.team && !al.dead && dist(al, t) <= 450) { dmg *= 0.92; break; }
        }
      }
    }
    if (!(dmg > 0)) return 0;
    const dealt = dmg;

    if (t.etype === 'champ') {
      // Shields soak first (soonest-expiring first); CORS Bypass deals 1.5x to shields.
      if (t.shields.length) {
        const sMul = (src?.etype === 'champ' && (src._itemPassives || itemPassives(src.items)).has('anti_shield')) ? 1.5 : 1;
        t.shields.sort((a, b) => a.until - b.until);
        for (const sh of t.shields) {
          if (dmg <= 0) break;
          const soak = Math.min(sh.amt, dmg * sMul);
          sh.amt -= soak;
          dmg -= soak / sMul;
        }
        t.shields = t.shields.filter((sh) => sh.amt > 0.5);
      }
      t.hp -= dmg;
      t.lastDamagedAt = now;
      this._cancelRecall(t);
      if (src && src.etype === 'champ' && src.team !== t.team) {
        t.damagers.set(src.id, now);
        src.aggroAt = now;
        src.aggroVictim = t.id;
        if (kind !== 'pet') { src.lastChampHitId = t.id; src.lastChampHitAt = now; } // the pet's "last enemy champ hit" memory
        this._callForHelp(src, t, now);
      }
      t.lastHitKind = src?.etype === 'unit' ? (src.epic ? 'epic' : src.utype) : (src?.etype === 'struct' ? 'tower' : (kind === 'fountain' ? 'fountain' : src?.etype));
    } else if (t.etype === 'unit') {
      t.hp -= dmg;
      t.hitSeq = (t.hitSeq + 1) >>> 0;
      if (src && src.etype === 'champ') {
        t.lastHitBy = src.id;
        if (t.utype === 'monster') this._aggroCamp(t, src, now);
      }
    } else {
      t.hp -= dmg;
      t.lastDamagedAt = now;
      if (src && src.etype === 'champ') t.lastChampDamageAt = now;
    }

    // Lifesteal heals from attack + skill damage.
    if (src && src.etype === 'champ' && src.lifesteal > 0 && !src.dead && (kind === 'atk' || kind === 'skill')) {
      src.hp = Math.min(src.maxHp, src.hp + dealt * src.lifesteal * this._healMul(src, now));
    }
    if (t.hp <= 0) {
      t.hp = 0;
      if (t.etype === 'champ') this._onChampDeath(t, src, now);
      else if (t.etype === 'unit') this._onUnitDeath(t, src, now);
      else this._onStructDeath(t, src, now);
    }
    return dealt;
  }

  _hasMinionNear(team, x, y, r) {
    if (!team || team === 'neutral') return false;
    const r2 = r * r;
    for (const u of this._unitsNear(x, y, r + 40)) {
      if (!u.alive || u.utype !== 'minion' || u.team !== team) continue;
      const dx = u.x - x, dy = u.y - y;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  }

  _heal(ch, amount) {
    if (!ch || ch.dead || !(amount > 0)) return;
    ch.hp = Math.min(ch.maxHp, ch.hp + amount * this._healMul(ch));
  }

  _addShield(ch, amount, until) {
    if (!ch || ch.dead || !(amount > 0)) return;
    ch.shields.push({ amt: amount, until });
  }

  /** Timed stat buff (tag = skill slot / 'ghost'). Re-casting refreshes it. `hidden` = not in the synced tags. */
  _addBuff(ch, tag, stats, until, hidden = false) {
    if (!ch || ch.dead || !stats) return;
    ch.buffs = ch.buffs.filter((b) => b.tag !== tag);
    ch.buffs.push({ tag, until, stats, hidden });
    this._recalc(ch, Date.now());
  }

  /** slow / root / stun from a skill spec onto a champion or unit. */
  _applyCC(t, spec, now) {
    if (t.etype === 'struct') return;
    if (spec.slow && spec.slow.pct > 0) {
      // Stronger (or no active) slow takes over; a weaker one never extends a stronger one.
      if (!(now < t.slowUntil) || spec.slow.pct >= t.slowPct) {
        t.slowPct = Math.min(0.9, spec.slow.pct);
        t.slowUntil = Math.max(now < t.slowUntil ? t.slowUntil : 0, now + (spec.slow.ms || 0));
      }
    }
    if (spec.root) {
      const rms = t.etype === 'champ' ? applyHardCcDuration(t, spec.root.ms || 0, now) : (spec.root.ms || 0);
      if (rms > 0) t.rootedUntil = Math.max(t.rootedUntil || 0, now + rms);
    }
    if (spec.stun) {
      const sms = t.etype === 'champ' ? applyHardCcDuration(t, spec.stun.ms || 0, now) : (spec.stun.ms || 0);
      if (sms > 0) {
        t.stunnedUntil = Math.max(t.stunnedUntil || 0, now + sms);
        if (t.etype === 'champ') this._cancelRecall(t);
      }
    }
  }

  _cancelRecall(ch) {
    if (ch.recallUntil > 0) {
      ch.recallUntil = 0;
      if (ch.action === 'recall') { ch.action = 'idle'; ch.actionSeq++; }
    }
  }

  // ───────────────────────── deaths + rewards ─────────────────────────
  _giveGold(ch, n, x, y) {
    if (!ch || !(n > 0)) return;
    ch.gold += n;
    if (!ch.isBot) this._sendTo(ch.id, 'gold', { n: Math.round(n), x: Math.round(x ?? ch.x), y: Math.round(y ?? ch.y) });
  }

  _giveXp(ch, n, now) {
    if (!ch) return;
    if (n > 0) ch.xp = Math.min(XP_TABLE[MAX_LEVEL - 1], ch.xp + n);
    const lv = levelForXp(ch.xp);
    if (lv > ch.level) {
      const before = ch.level;
      ch.level = lv;
      ch.skillPoints = (ch.skillPoints || 0) + (lv - before);
      if (ch.isBot) this._autoSpendSkills(ch);
      this._recalc(ch, now);
      if (before < ULT_UNLOCK_LEVEL && lv >= ULT_UNLOCK_LEVEL && !ch.isBot) {
        this._sendTo(ch.id, 'announce', { title: '⭐ ULTIMATE UNLOCKED', sub: `${ch.def.skills.r.name} is ready (R)`, color: '#ffd23f' });
      }
      this._checkAugmentOffer(ch);
      this.bots.onLevelUp(ch, lv);
    }
  }

  _checkAugmentOffer(ch) {
    if (!ch || ch.augmentOffer) return;
    const nextLv = AUGMENT_LEVELS[ch._augNextIdx || 0];
    if (!nextLv || ch.level < nextLv) return;
    const choices = rollAugmentChoices(ch.champ, ch.augments, 3, { guaranteeEpic: nextLv === 10 });
    if (!choices.length) return;
    ch._augNextIdx = (ch._augNextIdx || 0) + 1;
    if (ch.isBot) {
      ch.augments.push(choices[0]);
      ch._augVer = (ch._augVer || 0) + 1;
      return;
    }
    ch.augmentOffer = { level: nextLv, choices, rerolls: 1 };
    this._sendTo(ch.id, 'announce', { title: `⚡ CODE AUGMENT (Lv ${nextLv})`, sub: 'Pick 1 of 3 permanent upgrades', color: '#ffd23f' });
  }

  _doAugmentPick(sid, msg) {
    if (this.state.phase !== 'playing' || !msg || typeof msg !== 'object') return false;
    const ch = this.champs.get(sid);
    const id = msg.id;
    if (!ch || !ch.augmentOffer || !AUGMENTS[id] || !ch.augmentOffer.choices.includes(id)) return false;
    ch.augments.push(id);
    ch.augmentOffer = null;
    ch._augVer = (ch._augVer || 0) + 1;
    this._recalc(ch, Date.now());
    this._checkAugmentOffer(ch);
    return true;
  }

  _doAugmentReroll(sid) {
    if (this.state.phase !== 'playing') return false;
    const ch = this.champs.get(sid);
    if (!ch || !ch.augmentOffer || !(ch.augmentOffer.rerolls > 0)) return false;
    const choices = rollAugmentChoices(ch.champ, ch.augments, 3, { guaranteeEpic: ch.augmentOffer.level === 10 });
    if (!choices.length) return false;
    ch.augmentOffer = { ...ch.augmentOffer, choices, rerolls: ch.augmentOffer.rerolls - 1 };
    return true;
  }

  _doUpgrade(sid, msg) {
    if (this.state.phase !== 'playing' || !msg || typeof msg !== 'object') return false;
    const ch = this.champs.get(sid);
    const slot = msg.slot;
    if (!ch || !['q', 'w', 'e', 'r'].includes(slot) || !(ch.skillPoints > 0)) return false;
    const maxR = slot === 'r' ? 3 : 5;
    if (slot === 'r' && ch.level < ULT_UNLOCK_LEVEL) return false;
    const cur = ch.ranks?.[slot] || 0;
    if (cur >= maxR) return false;
    ch.ranks[slot] = cur + 1;
    ch.skillPoints--;
    return true;
  }

  _doUseActive(sid) {
    if (this.state.phase !== 'playing') return false;
    const ch = this.champs.get(sid);
    if (!ch || ch.dead) return false;
    const now = Date.now();
    const it = ownedActiveItem(ch.items);
    if (!it || !it.active || (ch._activeCd || 0) > now) return false;
    const act = it.active;
    if (now < ch.stunnedUntil && !act.usableWhileStunned) return false;
    ch._activeCd = now + act.cd * 1000;
    if (act.id === 'stasis') {
      ch._stasisUntil = now + act.ms;
      ch.stunnedUntil = Math.max(ch.stunnedUntil || 0, now + act.ms);
      ch.order = null;
      this._fx({ k: 'buff', sid: ch.id, color: 0xffd23f });
    } else if (act.id === 'cleanse') {
      ch.stunnedUntil = 0; ch.rootedUntil = 0; ch.slowUntil = 0; ch.slowPct = 0;
      this._addBuff(ch, 'cleanse_ms', { msPct: 0.35 }, now + act.ms, true);
      this._fx({ k: 'buff', sid: ch.id, color: 0x39ff14 });
    } else if (act.id === 'veil') {
      this._addShield(ch, act.shield || 240, now + 3000);
      this._addBuff(ch, 'veil_ms', { msPct: 0.3 }, now + act.ms, true);
      ch._stealthUntil = now + act.ms;
      this._fx({ k: 'buff', sid: ch.id, color: 0xb084ff });
    }
    return true;
  }

  _doWard(sid, msg) {
    if (this.state.phase !== 'playing' || !msg || typeof msg !== 'object') return false;
    const ch = this.champs.get(sid);
    const now = Date.now();
    if (!ch || ch.dead || (ch._wardCd || 0) > now) return false;
    const liveWards = [];
    for (const u of this.units.values()) if (u.alive && u.utype === 'ward' && u.owner === ch.id) liveWards.push(u);
    if (liveWards.length >= WARD.maxActivePerPlayer) {
      liveWards.sort((a, b) => (a.expiresAt || 0) - (b.expiresAt || 0));
      liveWards[0].alive = false;
      liveWards[0].removeAt = now + UNIT_REMOVE_MS;
    }
    const ax = Number.isFinite(msg.x) ? msg.x : ch.x, ay = Number.isFinite(msg.y) ? msg.y : ch.y;
    const d = Math.hypot(ax - ch.x, ay - ch.y);
    const ratio = d > WARD.castRange ? WARD.castRange / d : 1;
    const pos = clampToMap(ch.x + (ax - ch.x) * ratio, ch.y + (ay - ch.y) * ratio, 16);
    ch._wardCd = now + WARD.cdMs;
    const id = 'u' + (this._nextUnitId++);
    const s = new TeamUnit();
    const rec = {
      id, etype: 'unit', utype: 'ward', team: ch.team, kind: 'ward', owner: ch.id, s,
      x: pos.x, y: pos.y, radius: 14, hp: 3, maxHp: 3, armor: 0, alive: true,
      expiresAt: now + WARD.durationMs, sightRadius: WARD.sightRadius,
      stunnedUntil: 0, rootedUntil: 0, slowUntil: 0, slowPct: 0, hitSeq: 0, removeAt: 0,
    };
    s.team = ch.team; s.kind = 'ward'; s.campId = ''; s.owner = ch.id;
    this.units.set(id, rec);
    this._syncUnit(rec);
    this.state.units.set(id, s);
    return true;
  }

  _autoSpendSkills(ch) {
    const order = ['r', 'q', 'w', 'e'];
    while ((ch.skillPoints || 0) > 0) {
      let spent = false;
      for (const sl of order) {
        if (this._doUpgrade(ch.id, { slot: sl })) { spent = true; break; }
      }
      if (!spent) break;
    }
  }

  /** Champion credited with a kill: the source if it's an enemy champion, else the last enemy champion to hit within ASSIST_WINDOW_MS. */
  _resolveKiller(victim, src, now) {
    if (src && src.etype === 'champ' && src.team !== victim.team) return src;
    let best = null, bestAt = 0;
    for (const [id, at] of victim.damagers) {
      if (now - at > ASSIST_WINDOW_MS || at <= bestAt) continue;
      const c = this.champs.get(id);
      if (c && c.team !== victim.team) { best = c; bestAt = at; }
    }
    return best;
  }

  _onChampDeath(v, src, now) {
    if (v.dead) return;
    v.dead = true;
    v.hp = 0;
    v.deaths++;
    v.respawnAt = now + respawnMs(v.level);
    v.order = null; v.atkTarget = ''; v.recallUntil = 0;
    v.buffs.length = 0; v.shields.length = 0; v.regens.length = 0;
    v.stunnedUntil = 0; v.rootedUntil = 0; v.slowUntil = 0; v.slowPct = 0;
    v.knock = null; v.nav = null; v.burns = [];
    this._removePet(v); // despawns while the owner is dead
    v.action = 'dead';
    v.actionSeq++;

    const killer = this._resolveKiller(v, src, now);
    const assisters = [];
    for (const [id, at] of v.damagers) {
      if (now - at > ASSIST_WINDOW_MS) continue;
      const c = this.champs.get(id);
      if (c && c !== killer && c.team !== v.team) assisters.push(c);
    }
    const vStreak = v.streak;
    v.streak = 0;
    v.damagers.clear();

    if (killer) {
      killer.kills++;
      killer.streak++;
      if (killer.team === 'blue') this.state.blueKills++; else this.state.redKills++;
      let gold = KILL_GOLD + bountyBonus(vStreak);
      const bounty = bountyBonus(vStreak);
      const color = TEAM_INFO[killer.team].css;
      if (!this._firstBlood) {
        this._firstBlood = true;
        gold += FIRST_BLOOD_BONUS;
        this._announce({ title: '🩸 FIRST BLOOD', sub: `${killer.name} found the first bug in ${v.name}`, color, big: true });
      }
      this._giveGold(killer, gold, v.x, v.y);
      this._feed({ text: `💻 ${fill(pick(KILL_LINES), { a: killer.name, b: v.name })}`, color, a: killer.id, b: v.id });
      const tier = STREAKS[killer.streak];
      if (tier) this._announce({ title: `${tier.icon} ${killer.name} ${tier.label}`, sub: `${killer.streak} kills without dying`, color });
      if (vStreak >= SHUTDOWN_MIN_STREAK) {
        this._announce({ title: `💥 SHUTDOWN +${bounty}g! ${killer.name} ended ${v.name}'s streak`, sub: `${vStreak}-kill streak closed as Won't Fix`, color });
      }
      if (assisters.length) {
        const each = ASSIST_GOLD / assisters.length;
        for (const a of assisters) { a.assists++; this._giveGold(a, each, v.x, v.y); }
      }
      const xp = KILL_XP_BASE + KILL_XP_PER_VICTIM_LEVEL * v.level;
      const share = [killer, ...assisters];
      for (const c of share) {
        this._giveXp(c, xp / share.length, now);
        const augs = c.augments || [];
        if (augs.includes('emergency_patch') && !c.dead) {
          const syn = augs.includes('last_stand') && c.hp / Math.max(1, c.maxHp) < 0.35;
          this._heal(c, Math.max(0, c.maxHp - c.hp) * (syn ? 0.27 : 0.18));
        }
        if (augs.includes('bug_bounty')) this._giveGold(c, c === killer ? 60 : 30, v.x, v.y);
        if (championPassive(c.def)?.id === 'velocity_rush' && !c.dead) {
          this._heal(c, 45);
          this._addBuff(c, 'velocity_ms', { msPct: 0.25 }, now + 2500, true);
        }
      }
      if ((killer.augments || []).includes('evo_zero_reset')) {
        killer.cd.q = 0; killer.cd.e = 0;
        killer.mana = Math.min(killer.maxMana, killer.mana + killer.maxMana * 0.3);
      }
    } else {
      const key = v.lastHitKind && EXECUTE_LINES[v.lastHitKind] ? v.lastHitKind : 'other';
      this._feed({ text: `☠️ ${fill(pick(EXECUTE_LINES[key]), { b: v.name })}`, color: '#8890a0', b: v.id });
    }
    this.bots.onChampDeath(v, killer);
  }

  _onUnitDeath(u, src, now) {
    if (!u.alive) return;
    u.alive = false;
    u.hp = 0;
    u.target = '';
    u.removeAt = now + UNIT_REMOVE_MS;
    if (u.utype === 'minion') {
      this._minionCount = Math.max(0, this._minionCount - 1);
      if (src && src.etype === 'champ' && src.team !== u.team) {
        this._giveGold(src, u.gold, u.x, u.y);
        src.cs++;
        if (championPassive(src.def)?.id === 'clean_sweep' && !src.dead) {
          this._heal(src, 25);
          src.mana = Math.min(src.maxMana, src.mana + 20);
        }
      }
      const near = [];
      for (const c of this.champs.values()) {
        if (!c.dead && c.team !== u.team && dist(c, u) <= XP_SHARE_RADIUS) near.push(c);
      }
      for (const c of near) this._giveXp(c, u.xp / near.length, now);
      return;
    }
    // Monster / epic
    const camp = this.camps.get(u.campId);
    if (camp) camp.unitIds.delete(u.id);
    const killer = (src && src.etype === 'champ') ? src : this.champs.get(u.lastHitBy) || null;
    if (u.epic) {
      this._onEpicKilled(u, killer, now);
      return;
    }
    if (killer) {
      const jc = (killer.augments || []).includes('jungle_contract');
      this._giveGold(killer, u.gold * (jc ? 1.25 : 1), u.x, u.y);
      if (jc && !killer.dead) this._heal(killer, killer.maxHp * 0.08);
      if (championPassive(killer.def)?.id === 'clean_sweep' && !killer.dead) {
        this._heal(killer, 25);
        killer.mana = Math.min(killer.maxMana, killer.mana + 20);
      }
      if (u.kind === 'big' && u.campId) {
        if (String(u.campId).includes('tj_') || u.y < 3000) killer._blueBuffUntil = now + 75000;
        else killer._redBuffUntil = now + 75000;
      }
      killer.cs++;
      const near = [];
      for (const c of this.champs.values()) {
        if (!c.dead && c.team === killer.team && dist(c, u) <= XP_SHARE_RADIUS) near.push(c);
      }
      if (!near.includes(killer) && !killer.dead) near.push(killer);
      for (const c of near) this._giveXp(c, u.xp / near.length, now);
    }
    if (camp && camp.unitIds.size === 0) {
      camp.respawnAt = now + CAMP_TYPES[camp.type].respawnMs;
      camp.attackers.clear();
    }
  }

  _onEpicKilled(u, killer, now) {
    const id = u.kind;
    const def = EPICS[id];
    if (id === 'golden') this.state.epicGoldenAt = now + def.respawnMs;
    else this.state.epicDeadlineAt = now + def.respawnMs;
    const camp = this.camps.get(id);
    if (camp) camp.attackers.clear();
    if (!killer) return;
    const team = killer.team;
    for (const c of this.champs.values()) {
      if (c.team !== team) continue;
      this._giveGold(c, def.teamGold, u.x, u.y);
      if (!c.dead && dist(c, u) <= XP_SHARE_RADIUS) this._giveXp(c, def.xp, now);
    }
    const t = TEAM_INFO[team];
    if (id === 'deadline') {
      const b = def.buff;
      if (team === 'blue') { this.state.buffBlue = b.id; this.state.buffBlueUntil = now + b.ms; }
      else { this.state.buffRed = b.id; this.state.buffRedUntil = now + b.ms; }
      this._announce({ title: `⏰ ${t.name} met THE DEADLINE — their bugs are empowered!`, sub: `${def.reward} · +${def.teamGold} gold each`, color: t.css, big: true });
    } else {
      this._announce({ title: `✨ ${t.name} fixed the CEO's bug (+${def.teamGold} gold each)`, sub: `${killer.name} landed the final commit`, color: '#ffd700', big: true });
    }
    this._feed({ text: `${id === 'golden' ? '✨' : '⏰'} ${killer.name} secured ${def.title} for ${teamLabel(team)}`, color: t.css, a: killer.id });
    this.bots.onEpicKilled(id, team);
  }

  _onStructDeath(s, src, now) {
    if (!s.alive) return;
    s.alive = false;
    s.hp = 0;
    s.target = '';
    const winner = otherTeam(s.team);
    if (s.kind === 'core') {
      this._refreshInvulnerability();
      this._endMatch(winner, now, 'core');
      return;
    }
    for (const c of this.champs.values()) if (c.team === winner) this._giveGold(c, TOWER_GOLD_TEAM, s.x, s.y);
    const owner = TEAM_INFO[s.team];
    const where = s.tier === 1 ? `${s.lane} Firewall` : s.tier === 2 ? `inner ${s.lane} Firewall` : TOWER_NAMES[3];
    this._announce({
      title: `🔥 ${owner.name}'s ${where} is down!`,
      sub: s.tier === 3 ? `The ${CORE_NAME} is exposed · +${TOWER_GOLD_TEAM} gold for every ${teamLabel(winner)} dev`
        : `+${TOWER_GOLD_TEAM} gold for every ${teamLabel(winner)} dev`,
      color: TEAM_INFO[winner].css,
    });
    const byChamp = src && src.etype === 'champ';
    const feed = { text: `🔥 ${teamLabel(winner)} took down ${owner.name}'s ${where}${byChamp ? ` (last hit: ${src.name})` : ''}`, color: TEAM_INFO[winner].css };
    if (byChamp) feed.a = src.id;
    this._feed(feed);
    this._refreshInvulnerability();
    this.bots.onStructureDestroyed(s);
  }

  // ───────────────────────── state sync ─────────────────────────
  _sync(now) {
    for (const ch of this.champs.values()) this._syncChamp(ch, now);
    for (const u of this.units.values()) this._syncUnit(u);
    for (const s of this.structs.values()) this._syncStruct(s);
  }

  _syncChamp(ch, now) {
    if (!Number.isFinite(ch.x) || !Number.isFinite(ch.y)) { // never let a NaN reach the wire
      const spot = this._fountainSpot(ch.team, ch.slot);
      ch.x = spot.x; ch.y = spot.y;
    }
    if (!Number.isFinite(ch.hp)) ch.hp = ch.dead ? 0 : ch.maxHp;
    if (!Number.isFinite(ch.mana)) ch.mana = 0;
    if (!Number.isFinite(ch.gold)) ch.gold = 0;
    // v4: every write is guarded (a schema setter is not free even when the value is unchanged).
    const s = ch.s;
    let v;
    v = clampPos(ch.x); if (s.x !== v) s.x = v;
    v = clampPos(ch.y); if (s.y !== v) s.y = v;
    v = !!ch.isBot; if (s.isBot !== v) s.isBot = v;
    if (s.level !== ch.level) s.level = ch.level;
    v = Math.floor(ch.xp); if (s.xp !== v) s.xp = v;
    v = Math.max(0, Math.floor(ch.gold)); if (s.gold !== v) s.gold = v;
    v = ch.dead ? 0 : clamp16(Math.ceil(ch.hp)); if (s.hp !== v) s.hp = v;
    v = clamp16(Math.round(ch.maxHp)); if (s.maxHp !== v) s.maxHp = v;
    v = clamp16(Math.floor(ch.mana)); if (s.mana !== v) s.mana = v;
    v = clamp16(Math.round(ch.maxMana)); if (s.maxMana !== v) s.maxMana = v;
    v = clamp16(Math.round(ch.ad)); if (s.ad !== v) s.ad = v;
    v = clamp16(Math.round(ch.ap)); if (s.ap !== v) s.ap = v;
    v = clamp16(Math.round(ch.armor)); if (s.armor !== v) s.armor = v;
    v = clamp16(Math.round(ch.ms)); if (s.ms !== v) s.ms = v;
    v = clamp16(Math.round(ch.range)); if (s.range !== v) s.range = v;
    v = Math.round(ch.as * 1000) / 1000; if (s.as !== v) s.as = v;
    if (s.dead !== ch.dead) s.dead = ch.dead;
    v = ch.dead ? ch.respawnAt : 0; if (s.respawnAt !== v) s.respawnAt = v;
    if (s.kills !== ch.kills) s.kills = ch.kills;
    if (s.deaths !== ch.deaths) s.deaths = ch.deaths;
    if (s.assists !== ch.assists) s.assists = ch.assists;
    if (s.cs !== ch.cs) s.cs = ch.cs;
    if (s._itemsVer !== (ch.itemsVer || 0)) {
      s._itemsVer = ch.itemsVer || 0;
      for (let i = 0; i < INVENTORY_SLOTS; i++) if (s.items[i] !== ch.items[i]) s.items[i] = ch.items[i];
    }
    const cd = ch.cd;
    v = cd.q > now ? cd.q : 0; if (s.cdQ !== v) s.cdQ = v;
    v = cd.w > now ? cd.w : 0; if (s.cdW !== v) s.cdW = v;
    v = cd.e > now ? cd.e : 0; if (s.cdE !== v) s.cdE = v;
    v = cd.r > now ? cd.r : 0; if (s.cdR !== v) s.cdR = v;
    v = ch.stunnedUntil > now ? ch.stunnedUntil : 0; if (s.stunnedUntil !== v) s.stunnedUntil = v;
    v = ch.rootedUntil > now ? ch.rootedUntil : 0; if (s.rootedUntil !== v) s.rootedUntil = v;
    v = ch.slowUntil > now ? ch.slowUntil : 0; if (s.slowUntil !== v) s.slowUntil = v;
    v = ch.slowUntil > now ? Math.max(0, Math.min(100, Math.round(ch.slowPct * 100))) : 0; if (s.slowPct !== v) s.slowPct = v;
    let sh = 0;
    for (let i = 0; i < ch.shields.length; i++) sh += ch.shields[i].amt;
    v = clamp16(Math.round(sh)); if (s.shield !== v) s.shield = v;
    v = this._buffTags(ch, now); if (s.buffs !== v) s.buffs = v;
    if (s.recallUntil !== ch.recallUntil) s.recallUntil = ch.recallUntil;
    if (s.action !== ch.action) s.action = ch.action;
    v = ch.actionSeq >>> 0; if (s.action_seq !== v) s.action_seq = v;
    v = ch.atkTarget || ''; if (s.targetId !== v) s.targetId = v;
    if (s.spellD !== ch.spells.d) s.spellD = ch.spells.d;
    if (s.spellF !== ch.spells.f) s.spellF = ch.spells.f;
    v = ch.spellCd.d > now ? ch.spellCd.d : 0; if (s.cdD !== v) s.cdD = v;
    v = ch.spellCd.f > now ? ch.spellCd.f : 0; if (s.cdF !== v) s.cdF = v;
    v = ch.bush || ''; if (s.inBush !== v) s.inBush = v;
    if (s._augVer !== (ch._augVer || 0)) {
      s._augVer = ch._augVer || 0;
      const csv = (ch.augments || []).join(',');
      if (s.augmentsCsv !== csv) s.augmentsCsv = csv;
    }
    v = ch.augmentOffer ? JSON.stringify(ch.augmentOffer) : '';
    if (s.augmentOfferJson !== v) s.augmentOfferJson = v;
    v = ch.skillPoints || 0; if (s.skillPoints !== v) s.skillPoints = v;
    v = ch.ranks?.q || 0; if (s.rankQ !== v) s.rankQ = v;
    v = ch.ranks?.w || 0; if (s.rankW !== v) s.rankW = v;
    v = ch.ranks?.e || 0; if (s.rankE !== v) s.rankE = v;
    v = ch.ranks?.r || 0; if (s.rankR !== v) s.rankR = v;
  }

  /** v4 §3.2b: mirror every seat's / champion's scoreboard fields into state.scores. */
  _syncScores(force = false) {
    if (this.champs.size) {
      // playing / ended: straight from the champion records, 4 Hz is plenty for a scoreboard.
      if (!force && ((this._tickN || 0) & 3) !== 0) return;
      for (const ch of this.champs.values()) this._syncScoreRec(ch);
      return;
    }
    for (const m of this._members()) this._syncScore(m.id, m.s);
  }

  _syncScoreRec(ch) {
    const sc = this.state.scores.get(ch.id);
    if (!sc) return;
    let v;
    if (sc.team !== ch.team) sc.team = ch.team;
    if (sc.champ !== ch.champ) sc.champ = ch.champ;
    if (sc.name !== ch.name) sc.name = ch.name;
    v = !!ch.isBot; if (sc.isBot !== v) sc.isBot = v;
    if (sc.level !== ch.level) sc.level = ch.level;
    if (sc.kills !== ch.kills) sc.kills = ch.kills;
    if (sc.deaths !== ch.deaths) sc.deaths = ch.deaths;
    if (sc.assists !== ch.assists) sc.assists = ch.assists;
    if (sc.cs !== ch.cs) sc.cs = ch.cs;
    if (sc._itemsVer !== (ch.itemsVer || 0)) {
      sc._itemsVer = ch.itemsVer || 0;
      for (let i = 0; i < INVENTORY_SLOTS; i++) if (sc.items[i] !== ch.items[i]) sc.items[i] = ch.items[i];
    }
    if (sc.dead !== ch.dead) sc.dead = ch.dead;
    v = ch.dead ? ch.respawnAt : 0; if (sc.respawnAt !== v) sc.respawnAt = v;
    if (sc.spellD !== ch.spells.d) sc.spellD = ch.spells.d;
    if (sc.spellF !== ch.spells.f) sc.spellF = ch.spells.f;
    if (sc.rank !== (ch.s.rank || '')) sc.rank = ch.s.rank || '';
    if (sc._augVer !== (ch._augVer || 0)) {
      sc._augVer = ch._augVer || 0;
      const csv = (ch.augments || []).join(',');
      if (sc.augmentsCsv !== csv) sc.augmentsCsv = csv;
    }
  }

  _syncScore(sid, s) {
    const sc = this.state.scores.get(sid);
    if (!sc || !s) return;
    if (sc.team !== s.team) sc.team = s.team;
    if (sc.champ !== s.champ) sc.champ = s.champ;
    if (sc.name !== s.name) sc.name = s.name;
    if (sc.isBot !== s.isBot) sc.isBot = s.isBot;
    if (sc.level !== s.level) sc.level = s.level;
    if (sc.kills !== s.kills) sc.kills = s.kills;
    if (sc.deaths !== s.deaths) sc.deaths = s.deaths;
    if (sc.assists !== s.assists) sc.assists = s.assists;
    if (sc.cs !== s.cs) sc.cs = s.cs;
    for (let i = 0; i < INVENTORY_SLOTS; i++) if (sc.items[i] !== s.items[i]) sc.items[i] = s.items[i];
    if (sc.dead !== s.dead) sc.dead = s.dead;
    if (sc.respawnAt !== s.respawnAt) sc.respawnAt = s.respawnAt;
    if (sc.spellD !== s.spellD) sc.spellD = s.spellD;
    if (sc.spellF !== s.spellF) sc.spellF = s.spellF;
    if (sc.rank !== (s.rank || '')) sc.rank = s.rank || '';
  }

  _buffTags(ch, now) {
    // v4: built as a string (no per-tick arrays). Same tags + order as before.
    let out = '';
    const add = (t) => { out = out ? `${out},${t}` : t; };
    for (let i = 0; i < ch.buffs.length; i++) {
      const b = ch.buffs[i];
      if (b.until <= now || b.hidden) continue;
      let dup = false;
      for (let j = 0; j < i; j++) { const o = ch.buffs[j]; if (o.tag === b.tag && o.until > now && !o.hidden) { dup = true; break; } }
      if (!dup) add(b.tag);
    }
    if (ch.burns.length && this._ignited(ch, now)) add('ignited');
    if (this.teamBuffActive(ch.team, now)) add('deadline');
    if (ch.recallUntil > 0) add('recall');
    if (ch.regens.length) add('coffee');
    if ((ch._blueBuffUntil || 0) > now) add('blueBuff');
    if ((ch._redBuffUntil || 0) > now) add('redBuff');
    return out;
  }

  // ───────────────────────── v4: unit buckets ─────────────────────────
  /** Bucket every alive unit by GRID_CELL (once per tick; ≤ 1 tick stale → queries pad their radius). */
  _rebuildGrid() {
    const g = this._grid;
    for (let i = 0; i < g.length; i++) if (g[i].length) g[i].length = 0;
    for (const u of this.units.values()) {
      if (!u.alive) continue;
      const cy = Math.min(GRID_COLS - 1, Math.max(0, Math.floor(u.y / GRID_CELL)));
      const cx = Math.min(GRID_COLS - 1, Math.max(0, Math.floor(u.x / GRID_CELL)));
      g[cy * GRID_COLS + cx].push(u);
    }
  }

  /** Alive units in the cells overlapping the circle (x, y, r) — a reused array (iterate it right away). */
  _unitsNear(x, y, r) {
    const out = this._nearBuf;
    out.length = 0;
    const g = this._grid;
    const c0 = Math.max(0, Math.floor((x - r) / GRID_CELL)), c1 = Math.floor((x + r) / GRID_CELL);
    const r0 = Math.max(0, Math.floor((y - r) / GRID_CELL)), r1 = Math.floor((y + r) / GRID_CELL);
    for (let ry = r0; ry <= r1 && ry < GRID_COLS; ry++) {
      for (let cx = c0; cx <= c1 && cx < GRID_COLS; cx++) {
        const arr = g[ry * GRID_COLS + cx];
        for (let i = 0; i < arr.length; i++) out.push(arr[i]);
      }
    }
    return out;
  }

  _syncUnit(u) {
    const s = u.s;
    let v;
    if (!Number.isFinite(u.x) || !Number.isFinite(u.y)) return; // never let a NaN reach the wire
    // v4 bandwidth: lane minions (≈ 85 % of all position writes) sync their position at 10 Hz,
    // half of them on even ticks, half on odd ones — clients already ease toward the latest
    // position. Knockbacks, big jumps (> 40 px) and deaths still go out on the very next patch.
    const x = clampPos(u.x), y = clampPos(u.y);
    if (u.utype !== 'minion' || !u.alive || u.knock || ((this._tickN || 0) + u.par) % 2 === 0
      || Math.abs(x - s.x) > 40 || Math.abs(y - s.y) > 40) {
      if (s.x !== x) s.x = x;
      if (s.y !== y) s.y = y;
    }
    v = u.alive ? clamp16(Math.ceil(u.hp)) : 0; if (s.hp !== v) s.hp = v;
    v = clamp16(Math.round(u.maxHp)); if (s.maxHp !== v) s.maxHp = v;
    if (s.alive !== u.alive) s.alive = u.alive;
    v = u.hitSeq >>> 0; if (s.hit_seq !== v) s.hit_seq = v;
  }

  _syncStruct(r) {
    const s = r.s;
    s.hp = r.alive ? clamp16(Math.ceil(r.hp)) : 0;
    s.maxHp = clamp16(Math.round(r.maxHp));
    s.alive = r.alive;
    s.invulnerable = r.invulnerable;
  }

  // ───────────────────────── messaging ─────────────────────────
  _sendTo(sid, type, payload) {
    const c = this.clients.find((cl) => cl.sessionId === sid);
    if (c) c.send(type, payload);
  }
  /** Kill-feed line for everyone: { text, color, a?, b? }. */
  _feed(entry) { this.broadcast('feed', entry); }
  /** Big banner for everyone: { title, sub?, color?, big? }. */
  _announce(entry) { this.broadcast('announce', entry); }
  /**
   * Skill / hit visuals (not synced state). v4: per team — never sent to a team that can't
   * see an entity it names (sid / id / t), and only to teams with a champion within
   * INTEREST_RADIUS of where it happens (or whose own entity is involved). Spectators get all.
   */
  _fx(entry) {
    if (this.state.phase !== 'playing') { this.broadcast('fx', entry); return; }
    const now = Date.now();
    const a = entry.sid ? this._ent(entry.sid) : null;
    const b = entry.id ? this._ent(entry.id) : null;
    const c = entry.t ? this._ent(entry.t) : null;
    const anchor = a || b || c;
    const x = Number.isFinite(entry.x) ? entry.x : Number.isFinite(entry.x0) ? entry.x0 : anchor ? anchor.x : NaN;
    const y = Number.isFinite(entry.y) ? entry.y : Number.isFinite(entry.y0) ? entry.y0 : anchor ? anchor.y : NaN;
    // A second point the effect reaches (projectile end, dash / blink / knock landing).
    let x2 = NaN, y2 = NaN;
    if (entry.k === 'proj') { x2 = entry.x + entry.dx * entry.range; y2 = entry.y + entry.dy * entry.range; }
    else if (Number.isFinite(entry.x1)) { x2 = entry.x1; y2 = entry.y1; }
    for (const team of VIEW_TEAMS) {
      if (!this.canSee(team, a, now) || !this.canSee(team, b, now) || !this.canSee(team, c, now)) continue;
      const own = (a && a.team === team) || (b && b.team === team) || (c && c.team === team);
      if (!own && Number.isFinite(x) && !this._nearTeam(team, x, y) && !(Number.isFinite(x2) && this._nearTeam(team, x2, y2))) continue;
      this._sendTeam(team, 'fx', entry);
    }
    this._sendTeam('all', 'fx', entry);
  }

  /** v4: per-team `atk` batches (same visibility + interest rules as fx). */
  _flushAtk(now) {
    const out = this._atkOut;
    out.blue.length = 0; out.red.length = 0;
    for (const e of this._atkBatch) {
      const f = this._ent(e.f), t = this._ent(e.t);
      for (const team of VIEW_TEAMS) {
        if (!this.canSee(team, f, now) || !this.canSee(team, t, now)) continue;
        const own = (f && f.team === team) || (t && t.team === team);
        if (!own && f && !this._nearTeam(team, f.x, f.y)) continue;
        out[team].push(e);
      }
    }
    for (const team of VIEW_TEAMS) if (out[team].length) this._sendTeam(team, 'atk', out[team]);
    this._sendTeam('all', 'atk', this._atkBatch);
    this._atkBatch.length = 0;
  }

  /** Is any champion of `team` (alive or dead — the camera stays) within INTEREST_RADIUS of (x, y)? */
  _nearTeam(team, x, y) {
    const r2 = INTEREST_RADIUS * INTEREST_RADIUS;
    for (const c of this.champs.values()) {
      if (c.team !== team) continue;
      const dx = c.x - x, dy = c.y - y;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  }

  /** Send to every client of `team` ('all' = spectators / clients without a team). */
  _sendTeam(team, type, payload) {
    for (const cl of this.clients) {
      if ((cl.userData?.team || 'all') === team) cl.send(type, payload);
    }
  }

  // ───────────────────────── v4: bush vision (StateView) ─────────────────────────
  /**
   * Can `team` see entity `e`? Own team / structures / dead: always. Otherwise hidden when
   * standing in a bush that no live `team` champion shares, unless it attacked / cast within
   * BUSH_REVEAL_MS. A pet is hidden whenever its owner is. Bush ids come from the last vision
   * pass (≤ 1 tick old); reveals are live.
   */
  canSee(team, e, now = Date.now()) {
    if (!e || e.team === team || e.etype === 'struct' || team === 'all') return true;
    if (e.etype === 'champ' ? e.dead : !e.alive) return true;
    if (now < (e.revealUntil || 0)) return true;
    if (e.etype === 'champ' && (e._stealthUntil || 0) > now) {
      for (const c of this.champs.values()) {
        if (c.team === team && !c.dead && dist(c, e) <= 280) return true;
      }
      return false;
    }
    if (e.utype === 'pet') {
      const o = this.champs.get(e.owner);
      if (o && !this.canSee(team, o, now)) return false;
    }
    const b = e.bush;
    if (!b || now < (e.revealUntil || 0)) return true;
    const occ = this._bushOcc[team];
    if (!occ || occ.has(b)) return true;
    // Wards reveal enemies inside the same bush within WARD.sightRadius (750 px).
    for (const u of this.units.values()) {
      if (u.alive && u.utype === 'ward' && u.team === team && u.bush === b && dist(u, e) <= WARD.sightRadius) return true;
    }
    // Towers see into bushes within their range (no waiting under a tower in a bush — playtest v4).
    for (const s of this.structs.values()) {
      if (s.alive && s.team === team && s.kind === 'tower' && Math.hypot(s.x - e.x, s.y - e.y) <= TOWER.range + (e.radius || 0)) return true;
    }
    return false;
  }

  /** Recompute bush ids + per-team bush occupancy (every tick — targeting / bots use them). */
  _updateBushes() {
    const occ = this._bushOcc;
    occ.blue.clear(); occ.red.clear();
    for (const ch of this.champs.values()) {
      ch.bush = ch.dead ? '' : bushAtFast(ch.x, ch.y);
      if (ch.bush) occ[ch.team]?.add(ch.bush);
    }
    for (const u of this.units.values()) u.bush = u.alive ? bushAtFast(u.x, u.y) : '';
  }

  /**
   * Colyseus hook, right before each state patch: apply visibility to the team views HERE
   * (not per tick) so an entity changes view membership at most once per patch window.
   * Upstream (@colyseus/schema 3.0.76) bug worked around: StateView add() → remove() of a
   * not-yet-sent champion inside ONE patch window leaves its child (`items` ArraySchema)
   * changes queued in view.changes after remove() drops the parent's entry, so the client
   * receives changes for a refId it never got → colyseus.js "refId not found" + skipped
   * structures. Two ticks per patch happen whenever the 50 ms timers drift.
   */
  onBeforePatch() {
    if (this.state.phase === 'playing') this._applyViews(Date.now());
  }

  /** Add / remove every champion + unit per team view (see onBeforePatch). */
  _applyViews(now) {
    for (const ch of this.champs.values()) this._applyVis(ch.s, ch, now);
    for (const u of this.units.values()) this._applyVis(u.s, u, now);
  }

  /** Back-compat (harness / tests): bushes + views in one go. */
  _updateVision(now = Date.now()) {
    this._updateBushes();
    this._applyViews(now);
  }

  _applyVis(s, e, now) {
    let v = this._vis.get(s);
    if (!v) { v = { blue: false, red: false, all: false }; this._vis.set(s, v); }
    const views = this._views;
    if (!v.all) { views.all.add(s); v.all = true; }
    for (let i = 0; i < VIEW_TEAMS.length; i++) {
      const team = VIEW_TEAMS[i];
      const want = this.canSee(team, e, now);
      if (want === v[team]) continue;
      if (want) views[team].add(s); else views[team].remove(s);
      v[team] = want;
    }
  }

  /** Make a (state-attached) schema object visible in every view (seats, end of match). */
  _showInAllViews(s) {
    let v = this._vis.get(s);
    if (!v) { v = { blue: false, red: false, all: false }; this._vis.set(s, v); }
    for (const k of ['blue', 'red', 'all']) {
      if (v[k]) continue;
      this._views[k].add(s);
      v[k] = true;
    }
  }

  /** A view nobody uses never gets encoded → drop its pending changes now and then (memory). */
  _gcViews(now) {
    if (now < this._viewGcAt) return;
    this._viewGcAt = now + VIEW_GC_MS;
    const used = new Set();
    for (const cl of this.clients) if (cl.view) used.add(cl.view);
    for (const k of ['blue', 'red', 'all']) if (!used.has(this._views[k])) this._views[k].changes.clear();
  }
  _broadcastChat(m) {
    this.broadcast('chat', m);
    this._chatLog.push(m);
    if (this._chatLog.length > CHAT_LOG_MAX) this._chatLog.shift();
  }
}

// Separation sweep order: x + y is invariant under the blue↔red map mirror (x ↔ y), so both
// teams' crowds are processed in mirrored order (sorting by x alone was team-asymmetric).
const byDiag = (a, b) => (a.x + a.y) - (b.x + b.y);

// Minion target priority classes (higher wins).
const PRIORITY = { unit: 3, champ: 2, struct: 1 };

// Fountain pseudo damage sources (kill credit falls back to recent champion damage).
const FOUNTAIN_SRC = {
  blue: { id: 'blue_fountain', etype: 'fountain', team: 'blue', x: FOUNTAIN.blue.x, y: FOUNTAIN.blue.y },
  red: { id: 'red_fountain', etype: 'fountain', team: 'red', x: FOUNTAIN.red.x, y: FOUNTAIN.red.y },
};

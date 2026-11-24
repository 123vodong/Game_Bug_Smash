// TeamSelectScene — Team Mode v3 "Draft Day": champion select + loading screen.
// Contract: .claude/context/tasks/TEAM_MODE_V3_BREAKDOWN.md §3.1 / §3.3 / §3.5 / §4.3 U2
//
//   started with { room, name?, champ?, clockOffset? }   (TeamLobbyScene, room already joined)
//             or { offline: true, name?, champ? }         (practice: local draft vs bots)
//
// Online flow: polls room.state every frame (phase, selectEndsAt, loadingEndsAt, the 10
// TeamChamp entries: champ / locked / spellD / spellF) and sends
//   pick {champ} · lock · spells {d, f}         (throttled to PICK_RATE_MS)
// phase 'select'  → draft UI   ·  'loading' → loading screen (10 cards)
// phase 'playing' (or later) → scene.start('TeamModeScene', { room, … })  — SAME room, no re-join.
// Every room listener is registered with its unsubscribe function and removed on
// shutdown; room.leave() only when the player leaves back to the lobby.
// We never send 'hello' (the server answers it once; TeamModeScene needs that welcome).
// Server clock: contract §3.6 'time' message (uiKit startClockSync), seeded with the
// lobby's best sample; handed to TeamModeScene as clockOffset. announce/feed/chat that
// arrive once the phase is 'loading' are queued and handed over as data.pending.
//
// Keys: ← → ↑ ↓ browse (= hover) · ENTER lock in · D / F spell picker (1–6 choose, ESC close)
//       mouse / touch: click a card = hover, LOCK IN button, click a spell slot.
import { CHAMPIONS, CHAMPION_IDS, ROLE_ORDER, ROLE_PICKS, isChampionId } from '../../shared/moba/champions.js';
import { SPELLS, SPELL_IDS, DEFAULT_SPELLS, ROLE_SPELLS, isSpellId, validSpellPair } from '../../shared/moba/spells.js';
import {
  TEAM_INFO, TEAM_SIZE, SELECT_MS, SELECT_BOT_PICK_MS, SELECT_ALL_LOCKED_MS, LOADING_MS, PICK_RATE_MS,
} from '../../shared/moba/rules.js';
import { ensureMobaLooks, drawChampionPortrait } from '../entities/moba/looks.js';
import { hatEmoji } from '../entities/moba/mobaGfx.js';
import { SaveManager } from '../core/SaveManager.js';
import { saveMatch, clearMatch, CLOSE_TAKEN_OVER, DUP_TAB_TEXT } from '../core/Identity.js';
import { AudioManager } from '../core/AudioManager.js';
import {
  FONT_TITLE, FONT_MONO, NEON, hex, glow, drawPanel, makePill, makeButton, clipName,
  fillRR, strokeRR, fillCircleLP, strokeCircleLP, loadSpellPrefs, saveSpellPrefs, startClockSync,
  LANE_LABEL, SKILL_TYPE_LABEL, mechanicHints, reconnectLoop, TEAM_RECONNECT_GRACE_S,
} from '../ui/moba/uiKit.js';

const STICK_POSES = [['stick-idle', 'idle.svg']];
const ORDER = [...CHAMPION_IDS].sort((a, b) => {
  const la = ROLE_ORDER.indexOf(CHAMPIONS[a].lane), lb = ROLE_ORDER.indexOf(CHAMPIONS[b].lane);
  return (la - lb) || (CHAMPION_IDS.indexOf(a) - CHAMPION_IDS.indexOf(b));
});
const FILTERS = ['all', ...ROLE_ORDER];
const COLS = 9;   // 2026-11-25: 18 champions = 2 rows of 9
const SEND_GAP_MS = PICK_RATE_MS + 30;     // stay above the server's rate limit
const OPTIMISTIC_MS = 900;                 // show our own hover before the server echoes it

// ── Layout (1280×720) ──
const SLOT = { w: 244, h: 88, step: 95, y: 84, lx: 14, rx: 1280 - 14 - 244 };
const GRID = { x: 272, y: 106, w: 76, h: 106, gap: 6 };   // 9 × 76 + 8 × 6 = 732 (DET is 736 wide)
const CHIPS = { x: 272, y: 88 };
const DET = { x: 272, y: 340, w: 736, h: 262 };
const SPELLBAR = { x: 272, y: 612, w: 488, h: 96 };
const LOCKBTN = { x: 888, y: 660, w: 236, h: 84 };
const PICKER = { x: 272, y: 446, w: 488, h: 158 };
const BOT_NAMES = ['Intern Ivy', 'QA Quinn', 'Sr. Sam', 'PM Pat', 'DevOps Dee', 'Scrum Sid', 'CTO Cleo', 'Temp Tom', 'Archie Tect'];
const TIPS = [
  'Alt+Tab (Flash) crosses walls — save it to escape a gank.',
  'Junglers: take kill -9 (Smite) to secure the Golden Bug and THE DEADLINE.',
  'Coffee Break heals you AND the most-injured ally nearby.',
  'Escalate (Ignite) cuts enemy healing by 50% — great against supports.',
  'Knock enemies into office walls to stun them.',
  'Press C in the match to see every number of your champion.',
];

const rand = (a, b) => a + Math.random() * (b - a);
const OFFLINE_SELECT_MS = Math.min(SELECT_MS, 20000);  // EP-21: offline pick timer (you vs bots — no need for 30 s)
const OFFLINE_BOT_PICK_MAX_MS = 3000;                   // EP-21: offline bots lock within 3 s
const fmtSec = (ms) => `0:${String(Math.max(0, Math.floor(ms / 1000))).padStart(2, '0')}`;

// ═════════════════════════ offline draft (practice) ═════════════════════════
/** Same shape as the server state the scene reads: phase, selectEndsAt, loadingEndsAt, champs[]. */
class LocalDraft {
  constructor({ name, champ, spells, hat = '' }) {
    const now = Date.now();
    this.phase = 'select';
    this.selectEndsAt = now + OFFLINE_SELECT_MS;
    this.loadingEndsAt = 0;
    this._allLocked = false;
    const myRole = CHAMPIONS[champ]?.lane || 'mid';
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    this.champs = [];
    this.me = {
      id: 'me', team: 'blue', champ: isChampionId(champ) ? champ : '', locked: false,
      spellD: spells[0], spellF: spells[1], name, isBot: false, role: myRole, hat,
    };
    this.champs.push(this.me);
    // Ally roles are decided when each bot picks (from YOUR current pick), see _assignRole.
    for (let i = 0; i < TEAM_SIZE - 1; i++) this._addBot(`b${i}`, 'blue', null, names.pop(), now);
    ROLE_ORDER.forEach((role, i) => this._addBot(`r${i}`, 'red', role, names.pop(), now));
  }

  _addBot(id, team, role, name, now) {
    // EP-21: offline practice drafts fast — bots lock within OFFLINE_BOT_PICK_MAX_MS.
    const lo = Math.min(SELECT_BOT_PICK_MS[0], OFFLINE_BOT_PICK_MAX_MS - 500), hi = Math.min(SELECT_BOT_PICK_MS[1], OFFLINE_BOT_PICK_MAX_MS);
    const lockAt = now + rand(lo, hi);
    const [d, f] = ROLE_SPELLS[role] || DEFAULT_SPELLS;   // ally bots: reset in _assignRole
    this.champs.push({
      id, team, role, name: name || 'Bot', isBot: true, champ: '', locked: false, spellD: d, spellF: f,
      hoverAt: Math.max(now + 400, lockAt - rand(500, 1500)), lockAt,
    });
  }

  /** Champion hovered/locked by a teammate of `who` (enemy duplicates are allowed). */
  takenByTeammate(who, champ) {
    return this.champs.some((c) => c !== who && c.team === who.team && c.champ === champ);
  }

  /** Ally bot role = a lane not used by your CURRENT pick nor by allies that already chose. */
  _assignRole(b) {
    if (b.role) return;
    const used = new Set(this.champs.filter((c) => c !== b && c.team === b.team && c.role && (c.isBot ? c.champ : true))
      .map((c) => (c === this.me ? (CHAMPIONS[c.champ]?.lane || c.role) : c.role)));
    const free = ROLE_ORDER.filter((r) => !used.has(r));
    b.role = free[Math.floor(Math.random() * free.length)] || ROLE_ORDER[Math.floor(Math.random() * ROLE_ORDER.length)];
    const [d, f] = ROLE_SPELLS[b.role] || DEFAULT_SPELLS;
    b.spellD = d; b.spellF = f;
  }

  /** Final roles for the handoff: your champion's lane + one distinct lane per ally. */
  finalRoles() {
    const myLane = CHAMPIONS[this.me.champ]?.lane || this.me.role;
    const used = new Set([myLane]);
    const out = new Map();
    const allies = this.champs.filter((c) => c.team === 'blue' && c !== this.me);
    for (const c of allies) {           // keep a bot's own lane when still free
      const lane = CHAMPIONS[c.champ]?.lane;
      const want = !used.has(c.role) ? c.role : (lane && !used.has(lane) ? lane : null);
      if (want) { out.set(c.id, want); used.add(want); }
    }
    for (const c of allies) {
      if (out.has(c.id)) continue;
      const r = ROLE_ORDER.find((x) => !used.has(x)) || c.role || 'mid';
      out.set(c.id, r); used.add(r);
    }
    return out;
  }

  _botChoice(b) {
    this._assignRole(b);
    const free = (id) => !this.takenByTeammate(b, id);
    const pool = (ROLE_PICKS[b.role] || []).filter(free);
    if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    const any = CHAMPION_IDS.filter(free);
    return any[Math.floor(Math.random() * any.length)] || CHAMPION_IDS[0];
  }

  tick(now) {
    if (this.phase === 'select') {
      for (const b of this.champs) {
        if (!b.isBot || b.locked) continue;
        if (!b.champ && now >= b.hoverAt) b.champ = this._botChoice(b);
        if (now >= b.lockAt) {
          if (!b.champ || this.takenByTeammate(b, b.champ)) b.champ = this._botChoice(b);
          b.locked = true;
        }
      }
      if (!this._allLocked && this.champs.every((c) => c.locked)) {
        this._allLocked = true;
        this.selectEndsAt = Math.min(this.selectEndsAt, now + SELECT_ALL_LOCKED_MS);
      }
      if (now >= this.selectEndsAt) {
        for (const c of this.champs) {
          if (c.locked) continue;
          if (!c.champ || this.takenByTeammate(c, c.champ)) c.champ = this._botChoice(c);
          c.locked = true;
        }
        this.phase = 'loading';
        this.loadingEndsAt = now + LOADING_MS;
      }
    } else if (this.phase === 'loading' && now >= this.loadingEndsAt) {
      this.phase = 'playing';
    }
  }

  pick(champ) {
    const me = this.me;
    if (this.phase !== 'select' || me.locked || !isChampionId(champ) || this.takenByTeammate(me, champ)) return;
    me.champ = champ;
  }

  lock() { if (this.phase === 'select' && this.me.champ && !this.me.locked) this.me.locked = true; }

  spells(d, f) { if (validSpellPair(d, f)) { this.me.spellD = d; this.me.spellF = f; } }
}

// ═════════════════════════ scene ═════════════════════════
export default class TeamSelectScene extends Phaser.Scene {
  constructor() { super('TeamSelectScene'); }

  init(data) { this._data = data || {}; }

  preload() {
    for (const [key, file] of STICK_POSES) {
      if (!this.textures.exists(key)) this.load.svg(key, `assets/characters/stickman/${file}`, { width: 144, height: 144 });
    }
  }

  create() {
    const d = this._data || {};
    const { width: W, height: H } = this.scale;
    this.W = W; this.H = H;
    this._shuttingDown = false;
    this._handedOff = false;
    this._unsub = [];
    this._room = d.room || null;
    this._offline = !this._room;
    this._name = String(d.name || SaveManager.getPlayerName?.() || 'Player').slice(0, 16);
    this._fav = isChampionId(d.champ) ? d.champ : (isChampionId(SaveManager.getTeamChamp()) ? SaveManager.getTeamChamp() : '');
    this._spells = loadSpellPrefs(validSpellPair, DEFAULT_SPELLS);
    this._clockOffset = Number.isFinite(d.clockOffset) ? d.clockOffset : 0;
    this._clock = null;
    this._pending = [];              // announce / feed / chat once 'loading' → TeamModeScene
    this._autoHovered = false;
    this._lockSentAt = 0;
    this._filter = 'all';
    this._cursor = Math.max(0, ORDER.indexOf(this._fav));
    this._inspect = null;            // champion under the pointer
    this._detailFor = null;
    this._localHover = null;         // { champ, at } optimistic hover
    this._pendingPick = null; this._lastPickAt = 0;
    this._pendingSpells = null; this._lastSpellsAt = 0;
    this._lockSent = false;
    this._sig = '';
    this._seenLocked = new Map();
    this._order = [];                // first-seen order of champion keys
    this._slotObjs = [];
    this._slotTweens = [];
    this._cards = [];
    this._picker = null;
    this._phaseShown = null;
    this._lastTickSec = -1;
    this._leaveArmedUntil = 0;
    this._loadRoot = null;
    this._modal = null;
    this._reconn = null; this._veil = null;

    AudioManager.setMuted(SaveManager.isMuted());
    ensureMobaLooks(this);
    this._drawBackground();

    if (this._offline) {
      this._sim = new LocalDraft({ name: this._name, champ: this._fav, spells: this._spells, hat: SaveManager.getHat?.() || '' });
      this._myId = 'me';
    } else {
      this._sim = null;
      this._myId = this._room.sessionId;
      this._listen();
      this._queueSpells();                     // send our remembered pair
    }

    this._selRoot = this.add.container(0, 0).setDepth(10);
    this._buildHeader();
    this._buildChips();
    this._buildGrid();
    this._buildDetail();
    this._buildSpellBar();
    this._buildLockButton();
    this._buildFooter();
    this._bindKeys();
    this.events.once('shutdown', () => this._cleanup());
    this.cameras.main.fadeIn(220, 0, 0, 0);
  }

  // ───────────────────────── room plumbing ─────────────────────────
  _listen() {
    const room = this._room;
    const off = (fn) => { if (typeof fn === 'function') this._unsub.push(fn); };
    // Draft-time feed/chat is not shown here; from 'loading' on, announce/feed/chat are queued
    // for TeamModeScene (the SPRINT STARTED announce lands before the phase='playing' patch).
    // The handler outlives the handoff for a few seconds (same pending array, passed by
    // reference) so nothing is lost before TeamModeScene registers its own handlers.
    const pending = this._pending, ms = { handoffAt: 0, dead: false };
    this._msgState = ms;
    this._offMsg = room.onMessage('*', (type, msg) => {
      if (ms.dead || (ms.handoffAt && Date.now() - ms.handoffAt > 5000)) return;
      if (type !== 'announce' && type !== 'feed' && type !== 'chat') return;
      const ph = room.state?.phase;
      if ((ph === 'loading' || ph === 'playing' || ms.handoffAt) && pending.length < 40) pending.push({ type, msg });
    });
    if (typeof this._data?.dropMsg === 'function') { try { this._data.dropMsg(); } catch (_) { /* ignore */ } }
    const seed = Number.isFinite(this._data?.clockOffset) && Number.isFinite(this._data?.clockRtt)
      ? { offset: this._data.clockOffset, rtt: this._data.clockRtt } : null;
    this._clock = startClockSync(room, { everyMs: 3000, seed });
    off(() => { this._clock?.stop(); });
    // Pass 2 RP-05: remember the match so a reload / closed tab can REJOIN it (new token after every reconnect).
    if (room.roomId && room.reconnectionToken) saveMatch({ roomId: room.roomId, token: room.reconnectionToken, champ: this._fav || '', custom: !!this._data?.custom });
    const onLeave = (code) => {
      if (this._shuttingDown || this._handedOff || this._room !== room) return;
      const token = room.reconnectionToken || '';
      this._room = null;
      if (code === CLOSE_TAKEN_OVER) { this._showModal(DUP_TAB_TEXT.title, DUP_TAB_TEXT.kicked); return; } // Pass 2: PLAY HERE elsewhere
      // EP-07 review fix: the server holds the seat (TEAM_RECONNECT_GRACE_S) in select / loading too.
      if (code !== 1000 && code !== 4000 && token) { this._startReconnect(token); return; }
      this._showModal('Disconnected', `The connection to the draft was lost (code ${code}).`);
    };
    room.onLeave(onLeave);
    off(() => room.onLeave.remove?.(onLeave));
    const onErr = (code, msg) => { if (!this._shuttingDown) console.warn('[TeamSelect] room error', code, msg); };
    room.onError(onErr);
    off(() => room.onError.remove?.(onErr));
  }

  /** §3.3 reconnect loop: veil with a countdown, adopt the new room, re-register our listeners. */
  _startReconnect(token) {
    if (this._reconn || this._shuttingDown) return;
    this._unlisten(false);
    this._closePicker?.();
    const r = { left: TEAM_RECONNECT_GRACE_S, attempts: 0, loop: null };
    this._reconn = r;
    this._showVeil();
    const alive = () => !this._shuttingDown && !this._handedOff && this._reconn === r;
    r.loop = reconnectLoop({
      token,
      onTick: (left, attempts) => {
        if (!alive()) return;
        r.left = left; r.attempts = attempts;
        this._veilBody?.setText(`Mạng lag quá, đợi xíu… ${left}s\nYour seat and pick are held${attempts ? ` · attempt ${attempts}` : ''}`);
      },
      onSuccess: (room) => {
        if (!alive()) { try { room.leave(); } catch (_) { /* ignore */ } return; }
        this._reconn = null;
        this._hideVeil();
        this._room = room;
        this._myId = room.sessionId;
        if (this._data) { this._data.dropMsg = null; this._data.clockOffset = this._clockOffsetNow(); this._data.clockRtt = 9999; }
        this._listen();
        this._queueSpells();
        this._flashPhase?.('🔌 Back online — your pick is safe');
        AudioManager.reward?.();
      },
      onFail: (why) => {
        if (!alive()) return;
        this._reconn = null;
        this._hideVeil();
        this._showModal(why === 'gone' ? 'The room closed' : '📶 Could not reconnect',
          why === 'gone' ? 'The match ended or the room was closed while you were offline.'
            : 'Connection lost. A bot drafts and plays for you now.');
      },
    });
  }

  _showVeil() {
    this._hideVeil();
    const { W, H } = this;
    const c = this.add.container(0, 0).setDepth(110);
    const dim = this.add.rectangle(0, 0, W, H, 0x02040a, 0.8).setOrigin(0).setInteractive();
    const g = this.add.graphics();
    drawPanel(g, W / 2 - 280, H / 2 - 110, 560, 220, { color: NEON.yellow, radius: 16 });
    this._veilBody = this.add.text(W / 2, H / 2 - 14, '', {
      fontFamily: FONT_MONO, fontSize: 14, color: '#cfe3f5', align: 'center', wordWrap: { width: 500 },
    }).setOrigin(0.5);
    c.add([dim, g,
      this.add.text(W / 2, H / 2 - 66, '📶 Wi-Fi went to lunch — reconnecting…', { fontFamily: FONT_TITLE, fontSize: 22, color: '#ffd23f' }).setOrigin(0.5),
      this._veilBody]);
    const b = makeButton(this, {
      x: W / 2, y: H / 2 + 60, w: 260, h: 50, label: '◀ BACK TO LOBBY', color: NEON.blue, fontSize: 15,
      onClick: () => this._goLobby(),
    });
    c.add(b.root);
    this._veil = c;
  }

  _hideVeil() { if (this._veil) { this._veil.destroy(); this._veil = null; this._veilBody = null; } }

  _unlisten(keepCatchAll = false) {
    if (!keepCatchAll && this._offMsg) { try { this._offMsg(); } catch (_) { /* ignore */ } }
    this._offMsg = null;
    for (const fn of this._unsub) { try { fn(); } catch (_) { /* ignore */ } }
    this._unsub.length = 0;
  }

  _send(type, msg) {
    if (this._shuttingDown) return;
    if (this._sim) {
      if (type === 'pick') this._sim.pick(msg.champ);
      else if (type === 'lock') this._sim.lock();
      else if (type === 'spells') this._sim.spells(msg.d, msg.f);
      return;
    }
    if (!this._room) return;
    try { this._room.send(type, msg); } catch (e) { console.warn('[TeamSelect] send failed', type, e?.message); }
  }

  /** Normalized view of the draft (server state or the local draft). */
  _readState() {
    if (this._sim) {
      const s = this._sim;
      return { phase: s.phase, selectEndsAt: s.selectEndsAt, loadingEndsAt: s.loadingEndsAt, champs: s.champs };
    }
    const st = this._room?.state;
    if (!st) return null;
    const champs = [];
    st.champions?.forEach?.((ch, key) => {
      champs.push({
        id: key, team: ch.team, champ: ch.champ || '', locked: !!ch.locked, name: ch.name || '',
        isBot: !!ch.isBot, spellD: ch.spellD || '', spellF: ch.spellF || '', hat: ch.hat || '', rank: ch.rank || '',
      });
    });
    return {
      phase: st.phase, selectEndsAt: Number(st.selectEndsAt) || 0, loadingEndsAt: Number(st.loadingEndsAt) || 0, champs,
    };
  }

  _srvNow() { return Date.now() + (this._sim ? 0 : this._clockOffsetNow()); }

  _clockOffsetNow() {
    if (this._clock) return this._clock.offset();
    return Number.isFinite(this._data?.clockOffset) ? this._data.clockOffset : 0;
  }

  // ───────────────────────── background + header ─────────────────────────
  _drawBackground() {
    const { W, H } = this;
    if (this.textures.exists('team-lobby-bg')) {
      this.add.image(0, 0, 'team-lobby-bg').setOrigin(0).setDepth(-10);
    } else {
      const g = this.add.graphics().setDepth(-10);
      g.fillStyle(0x060a12, 1); g.fillRect(0, 0, W, H);
      g.lineStyle(1, 0x22344f, 0.26);
      for (let x = 0; x <= W; x += 40) g.lineBetween(x, 0, x, H);
      for (let y = 0; y <= H; y += 40) g.lineBetween(0, y, W, y);
    }
    this.add.rectangle(0, 0, W, H, 0x000000, 0.25).setOrigin(0).setDepth(-9);
  }

  _buildHeader() {
    const root = this._selRoot, cx = this.W / 2;
    const title = this.add.text(cx, 22, 'CHAMPION SELECT', {
      fontFamily: FONT_TITLE, fontSize: 26, color: '#ffffff', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5);
    glow(title, '#ffd23f', 12);
    this._phaseTxt = this.add.text(cx, 48, '', {
      fontFamily: FONT_MONO, fontSize: 13, color: '#cfe3f5', padding: { y: 2 },
    }).setOrigin(0.5);
    this._timerBg = this.add.rectangle(cx, 66, 440, 6, 0x1a2233, 1);
    this._timerFill = this.add.rectangle(cx - 220, 66, 440, 6, NEON.yellow, 1).setOrigin(0, 0.5);
    this._timerTxt = this.add.text(cx + 232, 66, '', {
      fontFamily: FONT_TITLE, fontSize: 14, color: '#ffd23f', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0, 0.5);
    root.add([title, this._phaseTxt, this._timerBg, this._timerFill, this._timerTxt]);
    // team headers
    const blue = TEAM_INFO.blue, red = TEAM_INFO.red;
    this._leftHdr = this.add.text(SLOT.lx + 4, 62, '', {
      fontFamily: FONT_TITLE, fontSize: 14, color: blue.css, stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0, 0.5);
    this._rightHdr = this.add.text(SLOT.rx + SLOT.w - 4, 62, '', {
      fontFamily: FONT_TITLE, fontSize: 14, color: red.css, stroke: '#000000', strokeThickness: 4,
    }).setOrigin(1, 0.5);
    root.add([this._leftHdr, this._rightHdr]);
    if (this._offline) {
      root.add(makePill(this, 14, 22, '🤖 OFFLINE PRACTICE', { color: NEON.orange, fontSize: 10 }));
    }
    else if (this._data?.custom) {
      root.add(makePill(this, 14, 22, `🏠 ${clipName(this._data.roomName || 'CUSTOM ROOM', 24)}`, { color: NEON.cyan, fontSize: 10 }));
    }
  }

  // ───────────────────────── lane chips + champion grid ─────────────────────────
  _buildChips() {
    let x = CHIPS.x;
    this._chips = [];
    for (const f of FILTERS) {
      const label = f === 'all' ? 'ALL' : (LANE_LABEL[f] || f.toUpperCase()).replace(' LANE', '');
      const t = this.add.text(0, 0, label, { fontFamily: FONT_TITLE, fontSize: 10, color: '#cfe3f5' }).setOrigin(0.5);
      const w = Math.ceil(t.width + 18), h = 20;
      const c = this.add.container(x + w / 2, CHIPS.y);
      const g = this.add.graphics();
      const hit = this.add.rectangle(0, 0, w, h + 10, 0xffffff, 0).setInteractive({ useHandCursor: true });
      c.add([g, t, hit]);
      hit.on('pointerup', () => this._setFilter(f));
      this._chips.push({ f, g, t, w, h });
      this._selRoot.add(c);
      x += w + 6;
    }
    this._paintChips();
  }

  _paintChips() {
    for (const ch of this._chips) {
      const on = ch.f === this._filter;
      ch.g.clear();
      ch.g.fillStyle(on ? 0x39c2ff : 0x111a2b, on ? 0.9 : 1);
      fillRR(ch.g, -ch.w / 2, -ch.h / 2, ch.w, ch.h, 8);
      ch.g.lineStyle(1.5, 0x39c2ff, on ? 1 : 0.45);
      strokeRR(ch.g, -ch.w / 2, -ch.h / 2, ch.w, ch.h, 8);
      ch.t.setColor(on ? '#06101c' : '#cfe3f5');
    }
  }

  _setFilter(f) {
    if (this._filter === f) return;
    this._filter = f;
    AudioManager.uiClick();
    this._paintChips();
    this._layoutGrid(true);
  }

  _visibleOrder() { return ORDER.filter((id) => this._filter === 'all' || CHAMPIONS[id].lane === this._filter); }

  _buildGrid() {
    const { w, h } = GRID;
    ORDER.forEach((id) => {
      const champ = CHAMPIONS[id];
      const c = this.add.container(0, 0);
      const g = this.add.graphics();
      const portrait = drawChampionPortrait(this, id, 0, -14, 58);
      const name = this.add.text(0, 30, champ.name, {
        fontFamily: FONT_TITLE, fontSize: 13, color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5);
      const lane = this.add.text(0, 45, (LANE_LABEL[champ.lane] || champ.lane).replace(' LANE', ''), {
        fontFamily: FONT_MONO, fontSize: 10, color: hex(champ.color),
      }).setOrigin(0.5);
      const shade = this.add.rectangle(0, 0, w, h, 0x05070c, 0.72).setVisible(false);
      const taken = this.add.text(0, -10, '', {
        fontFamily: FONT_TITLE, fontSize: 11, color: '#ff8a8a', stroke: '#000000', strokeThickness: 3, align: 'center',
      }).setOrigin(0.5).setVisible(false);
      const badge = this.add.text(w / 2 - 6, -h / 2 + 6, '', {
        fontFamily: FONT_TITLE, fontSize: 9, color: '#06101c', backgroundColor: '#ffd23f', padding: { x: 4, y: 1 },
      }).setOrigin(1, 0).setVisible(false);
      const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0).setInteractive({ useHandCursor: true });
      c.add([g, portrait, name, lane, shade, taken, badge, hit]);
      const card = { id, champ, c, g, portrait, shade, taken, badge, hover: false, state: '' };
      hit.on('pointerover', () => {
        card.hover = true; this._inspect = id; this._paintCard(card); AudioManager.uiHover();
      });
      hit.on('pointerout', () => {
        card.hover = false; if (this._inspect === id) this._inspect = null; this._paintCard(card);
      });
      hit.on('pointerup', () => this._clickCard(card));
      this._cards.push(card);
      this._selRoot.add(c);
    });
    this._layoutGrid(false);
  }

  _layoutGrid(animate) {
    const vis = this._visibleOrder();
    const { w, h, gap } = GRID;
    for (const card of this._cards) {
      const i = vis.indexOf(card.id);
      if (i < 0) { card.c.setVisible(false); continue; }
      const x = GRID.x + (i % COLS) * (w + gap) + w / 2;
      const y = GRID.y + Math.floor(i / COLS) * (h + gap) + h / 2;
      card.c.setVisible(true);
      if (animate) {
        card.c.setAlpha(0); card.c.setPosition(x, y + 10);
        this.tweens.add({ targets: card.c, alpha: 1, y, duration: 160, delay: i * 18 });
      } else card.c.setPosition(x, y);
    }
  }

  /** card.state: '' free · 'mine' my hover · 'locked' my lock · 'taken' teammate · 'off' (I'm locked). */
  _paintCard(card) {
    const { g, champ } = card;
    const { w, h } = GRID;
    const col = champ.color;
    const st = card.state;
    const lit = st === 'mine' || st === 'locked';
    g.clear();
    g.fillStyle(0x000000, 0.45); fillRR(g, -w / 2 + 3, -h / 2 + 5, w, h, 12);
    g.fillStyle(lit ? 0x13203a : (card.hover && st === '' ? 0x0f1726 : 0x0a0e18), 0.96);
    fillRR(g, -w / 2, -h / 2, w, h, 12);
    if (lit) { g.fillStyle(col, 0.18); fillRR(g, -w / 2, -h / 2, w, h, 12); }
    g.fillStyle(col, lit ? 0.32 : 0.12); fillCircleLP(g, 0, -14, 33);
    const bc = st === 'locked' ? NEON.green : (st === 'mine' ? NEON.yellow : col);
    g.lineStyle(lit ? 3 : 1.5, bc, lit ? 1 : (card.hover && st === '' ? 0.9 : 0.38));
    strokeRR(g, -w / 2, -h / 2, w, h, 12);
    card.shade.setVisible(st === 'taken' || st === 'off');
    card.shade.setFillStyle(0x05070c, st === 'off' ? 0.55 : 0.74);
    card.taken.setVisible(st === 'taken');
    card.badge.setVisible(lit);
    card.badge.setText(st === 'locked' ? 'LOCKED' : 'YOU');
    card.badge.setBackgroundColor(st === 'locked' ? '#39ff14' : '#ffd23f');
    card.c.setScale(card.hover && (st === '' || st === 'mine') ? 1.04 : 1);
  }

  _clickCard(card) {
    if (this._phaseShown !== 'select' || !this._selRoot) return;
    if (card.state === 'taken') { AudioManager.uiClick(); this._flashPhase('A teammate already has that champion'); return; }
    if (card.state === 'off' || card.state === 'locked') return;
    this._cursor = ORDER.indexOf(card.id);
    this._hover(card.id);
  }

  _hover(champ) {
    const me = this._meRow();
    if (!me || me.locked || this._lockSent || !isChampionId(champ)) return;
    if (this._takenByTeammate(champ)) return;
    this._localHover = { champ, at: Date.now() };
    this._pendingPick = champ;
    this._flushSends();
    AudioManager.uiClick();
    this._refresh(true);
  }

  _lockIn() {
    if (this._phaseShown !== 'select') return;
    const me = this._meRow();
    if (!me || me.locked || this._lockSent) return;
    const champ = this._myChamp();
    if (!isChampionId(champ)) { this._lockBtn.shake(); this._flashPhase('Pick a champion first'); return; }
    // The pending pick must be ACCEPTED before the lock: never bypass the rate window —
    // wait out the rest of it, then send pick + lock back-to-back (same socket = in order).
    const doLock = () => {
      if (this._shuttingDown || this._phaseShown !== 'select') return;
      if (this._pendingPick) {
        this._send('pick', { champ: this._pendingPick });
        this._pendingPick = null;
        this._lastPickAt = Date.now();
      }
      this._send('lock');
      this._lockSentAt = Date.now();
    };
    const wait = this._sim || !this._pendingPick ? 0 : Math.max(0, SEND_GAP_MS - (Date.now() - this._lastPickAt));
    this._lockSent = true;
    this._lockSentAt = Date.now() + wait;
    if (wait > 0) this.time.delayedCall(wait, doLock); else doLock();
    AudioManager.reward?.();
    this.cameras.main.flash(120, 255, 210, 63);
  }

  // ───────────────────────── detail (hovered champion) ─────────────────────────
  _buildDetail() {
    this._detailG = this.add.graphics();
    this._selRoot.add(this._detailG);
    this._dyn = null;
  }

  _renderDetail(id) {
    if (this._detailFor === id) return;
    this._detailFor = id;
    if (this._dyn) { this.tweens.killTweensOf(this._dyn); this._dyn.destroy(); this._dyn = null; }
    const D = DET;
    const g = this._detailG;
    g.clear();
    const c = CHAMPIONS[id];
    const col = c ? c.color : 0x39c2ff;
    drawPanel(g, D.x, D.y, D.w, D.h, { color: col, radius: 14, halo: 0.08 });
    const dyn = this.add.container(0, 0);
    this._dyn = dyn;
    this._selRoot.addAt(dyn, this._selRoot.getIndex(this._detailG) + 1);
    if (!c) {
      dyn.add(this.add.text(D.x + D.w / 2, D.y + D.h / 2, 'Hover a champion to see its skills', {
        fontFamily: FONT_MONO, fontSize: 14, color: '#6f86a6',
      }).setOrigin(0.5));
      return;
    }
    const add = (o) => { dyn.add(o); return o; };
    // left column: portrait, name, tags, blurb
    const px = D.x + 58, py = D.y + 58;
    const ring = add(this.add.graphics());
    ring.fillStyle(col, 0.14); fillCircleLP(ring, px, py, 46);
    ring.lineStyle(3, col, 1); strokeCircleLP(ring, px, py, 40);
    add(drawChampionPortrait(this, id, px, py, 78));
    const name = add(this.add.text(D.x + 112, D.y + 30, c.name.toUpperCase(), {
      fontFamily: FONT_TITLE, fontSize: 22, color: '#ffffff', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0, 0.5));
    name.x -= glow(name, hex(col), 10);
    add(this.add.text(D.x + 113, D.y + 54, c.title || '', {
      fontFamily: FONT_MONO, fontSize: 11, color: '#b7c7da', wordWrap: { width: 130, useAdvancedWrap: true },
    }).setOrigin(0, 0.5));
    let tx = D.x + 16;
    const tag = (text, color) => { const p = add(makePill(this, tx, D.y + 116, text, { color, fontSize: 8, padX: 5 })); tx += p.pillW + 5; };
    const dif = Math.max(1, Math.min(3, c.difficulty | 0));
    tag(c.role.toUpperCase(), col);
    tag((LANE_LABEL[c.lane] || c.lane).replace(' LANE', ''), 0x9fb3c8);
    tag(c.ranged ? 'RANGED' : 'MELEE', 0xcfe3f5);
    add(this.add.text(tx + 2, D.y + 116, '★'.repeat(dif) + '☆'.repeat(3 - dif), {
      fontFamily: 'Arial, sans-serif', fontSize: 11, color: '#ffd23f',
    }).setOrigin(0, 0.5));
    const b = c.base || {};
    add(this.add.text(D.x + 16, D.y + 136,
      `❤ ${b.hp}  ⚔ ${b.ad}  🛡 ${b.armor}  🎯 ${b.range}  👟 ${b.ms}`, {
        fontFamily: FONT_MONO, fontSize: 11, color: '#cfe3f5', padding: { y: 2 },
      }));
    const hints = mechanicHints(c);
    add(this.add.text(D.x + 16, D.y + 160, [c.blurb, ...hints.slice(0, 1)].filter(Boolean).join('\n'), {
      fontFamily: FONT_MONO, fontSize: 11, color: '#9fb3c8', lineSpacing: 2,
      wordWrap: { width: 236, useAdvancedWrap: true }, fixedHeight: 96,
    }));
    // right column: Q W E R
    const sx = D.x + 266, sw = D.w - 266 - 12;
    g.lineStyle(1, 0xffffff, 0.08); g.lineBetween(sx - 8, D.y + 14, sx - 8, D.y + D.h - 14);
    ['q', 'w', 'e', 'r'].forEach((slot, k) => {
      const s = c.skills?.[slot];
      if (!s) return;
      const y = D.y + 10 + k * 62;
      const sc = s.color ?? 0x7ec8ff;
      const rg = add(this.add.graphics());
      rg.fillStyle(0x0b1322, 0.94); fillRR(rg, sx, y, sw, 56, 9);
      rg.lineStyle(1.2, slot === 'r' ? NEON.yellow : sc, slot === 'r' ? 0.6 : 0.35); strokeRR(rg, sx, y, sw, 56, 9);
      rg.fillStyle(sc, 0.24); fillRR(rg, sx + 8, y + 8, 26, 26, 6);
      rg.lineStyle(2, sc, 1); strokeRR(rg, sx + 8, y + 8, 26, 26, 6);
      add(this.add.text(sx + 21, y + 21, slot.toUpperCase(), {
        fontFamily: FONT_TITLE, fontSize: 13, color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5));
      add(this.add.text(sx + 21, y + 45, `${s.cd}s`, { fontFamily: FONT_MONO, fontSize: 9, color: '#c3cfe0' }).setOrigin(0.5));
      add(this.add.text(sx + 44, y + 13, `${s.icon || '✨'} ${s.name}`, {
        fontFamily: FONT_TITLE, fontSize: 12, color: '#ffffff', padding: { y: 2 },
      }).setOrigin(0, 0.5));
      const meta = `${SKILL_TYPE_LABEL[s.type] || String(s.type || '').toUpperCase()} · 💧${s.mana}${slot === 'r' ? ' · ULT' : ''}`;
      add(this.add.text(sx + sw - 8, y + 13, meta, {
        fontFamily: FONT_MONO, fontSize: 9, color: hex(sc), padding: { y: 2 },
      }).setOrigin(1, 0.5));
      add(this.add.text(sx + 44, y + 24, s.desc || '', {
        fontFamily: FONT_MONO, fontSize: 11, color: '#cfe3f5', lineSpacing: 0,
        wordWrap: { width: sw - 54, useAdvancedWrap: true }, fixedHeight: 30,
      }));
    });
    dyn.setAlpha(0);
    this.tweens.add({ targets: dyn, alpha: 1, duration: 140 });
  }

  // ───────────────────────── summoner spells ─────────────────────────
  _buildSpellBar() {
    const B = SPELLBAR;
    const g = this.add.graphics();
    drawPanel(g, B.x, B.y, B.w, B.h, { color: 0x7ec8ff, radius: 14, halo: 0.06 });
    const lab = this.add.text(B.x + 14, B.y + 14, 'SUMMONER SPELLS', { fontFamily: FONT_TITLE, fontSize: 10, color: '#7ec8ff' }).setOrigin(0, 0.5);
    this._selRoot.add([g, lab]);
    this._spellTiles = ['d', 'f'].map((slot, i) => {
      const x = B.x + 44 + i * 74, y = B.y + 56;
      const c = this.add.container(x, y);
      const tg = this.add.graphics();
      const icon = this.add.text(0, -2, '', { fontSize: 28, padding: { y: 4 } }).setOrigin(0.5);
      const key = this.add.text(-27, -27, slot.toUpperCase(), {
        fontFamily: FONT_TITLE, fontSize: 10, color: '#06101c', backgroundColor: '#e8f4ff', padding: { x: 4, y: 1 },
      }).setOrigin(0, 0);
      const hit = this.add.rectangle(0, 0, 62, 62, 0xffffff, 0).setInteractive({ useHandCursor: true });
      c.add([tg, icon, key, hit]);
      const tile = { slot, c, g: tg, icon, hover: false };
      hit.on('pointerover', () => { tile.hover = true; this._spellHint = this._spells[i]; this._paintSpellTiles(); AudioManager.uiHover(); });
      hit.on('pointerout', () => { tile.hover = false; this._spellHint = null; this._paintSpellTiles(); });
      hit.on('pointerup', () => this._togglePicker(slot));
      this._selRoot.add(c);
      return tile;
    });
    this._spellInfo = this.add.text(B.x + 200, B.y + 30, '', {
      fontFamily: FONT_MONO, fontSize: 11, color: '#cfe3f5', lineSpacing: 2,
      wordWrap: { width: B.w - 214, useAdvancedWrap: true }, padding: { y: 2 },
    });
    this._spellName = this.add.text(B.x + 200, B.y + 16, '', {
      fontFamily: FONT_TITLE, fontSize: 12, color: '#ffd23f', padding: { y: 2 },
    }).setOrigin(0, 0.5);
    this._selRoot.add([this._spellInfo, this._spellName]);
    this._paintSpellTiles();
  }

  _paintSpellTiles() {
    if (!this._selRoot || !this._spellTiles) return;
    this._spellTiles.forEach((t, i) => {
      const sp = SPELLS[this._spells[i]];
      const open = this._picker && this._picker.slot === t.slot;
      t.g.clear();
      t.g.fillStyle(0x0d1524, 1); fillRR(t.g, -31, -31, 62, 62, 10);
      t.g.fillStyle(sp?.color ?? 0x888888, 0.22); fillRR(t.g, -31, -31, 62, 62, 10);
      t.g.lineStyle(open ? 3 : 2, open ? NEON.yellow : (sp?.color ?? 0x888888), open || t.hover ? 1 : 0.7);
      strokeRR(t.g, -31, -31, 62, 62, 10);
      t.icon.setText(sp?.icon || '❔');
      t.c.setScale(t.hover ? 1.05 : 1);
    });
    const id = this._spellHint || this._spells[0];
    const sp = SPELLS[id];
    if (sp) {
      this._spellName.setText(`${sp.icon} ${sp.name}  ·  ${sp.cd}s`);
      this._spellInfo.setText(`${sp.desc}\nclick a slot (or D / F) to change`);
    }
  }

  _togglePicker(slot) {
    if (this._phaseShown !== 'select' || !this._selRoot || this._shuttingDown) return;
    if (this._picker && this._picker.slot === slot) { this._closePicker(); return; }
    this._closePicker();
    AudioManager.uiClick();
    const P = PICKER;
    const c = this.add.container(0, 0).setDepth(60);
    const g = this.add.graphics();
    drawPanel(g, P.x, P.y, P.w, P.h, { color: NEON.yellow, radius: 14, halo: 0.12 });
    c.add(g);
    c.add(this.add.text(P.x + 14, P.y + 16, `CHOOSE YOUR ${slot.toUpperCase()} SPELL  ·  1–6 · ESC closes`, {
      fontFamily: FONT_TITLE, fontSize: 10, color: '#ffd23f',
    }).setOrigin(0, 0.5));
    const other = this._spells[slot === 'd' ? 1 : 0];
    const cur = this._spells[slot === 'd' ? 0 : 1];
    const tw = 74, gap = (P.w - 24 - tw * 6) / 5;
    SPELL_IDS.forEach((id, i) => {
      const sp = SPELLS[id];
      const x = P.x + 12 + i * (tw + gap) + tw / 2, y = P.y + 70;
      const tc = this.add.container(x, y);
      const tg = this.add.graphics();
      const paint = (hov) => {
        tg.clear();
        tg.fillStyle(0x0d1524, 1); fillRR(tg, -tw / 2, -34, tw, 68, 10);
        tg.fillStyle(sp.color, id === cur ? 0.35 : 0.16); fillRR(tg, -tw / 2, -34, tw, 68, 10);
        tg.lineStyle(id === cur ? 3 : 1.5, id === cur ? NEON.yellow : sp.color, hov || id === cur ? 1 : 0.55);
        strokeRR(tg, -tw / 2, -34, tw, 68, 10);
      };
      paint(false);
      const icon = this.add.text(0, -8, sp.icon, { fontSize: 26, padding: { y: 4 } }).setOrigin(0.5);
      const nm = this.add.text(0, 22, sp.name, {
        fontFamily: FONT_TITLE, fontSize: 9, color: '#ffffff', stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5);
      const num = this.add.text(-tw / 2 + 5, -31, String(i + 1), { fontFamily: FONT_TITLE, fontSize: 9, color: '#8fa3bf' });
      tc.add([tg, icon, nm, num]);
      if (id === other) {
        tc.add(this.add.text(tw / 2 - 4, -31, slot === 'd' ? 'F' : 'D', {
          fontFamily: FONT_TITLE, fontSize: 9, color: '#06101c', backgroundColor: '#7ec8ff', padding: { x: 3, y: 0 },
        }).setOrigin(1, 0));
      }
      const hit = this.add.rectangle(0, 0, tw, 68, 0xffffff, 0).setInteractive({ useHandCursor: true });
      tc.add(hit);
      hit.on('pointerover', () => { paint(true); this._spellHint = id; this._paintSpellTiles(); AudioManager.uiHover(); });
      hit.on('pointerout', () => { paint(false); this._spellHint = null; this._paintSpellTiles(); });
      hit.on('pointerup', () => this._chooseSpell(slot, id));
      c.add(tc);
    });
    c.add(this.add.text(P.x + 14, P.y + P.h - 20, 'Picking the spell in the other slot swaps them.', {
      fontFamily: FONT_MONO, fontSize: 10, color: '#8fa3bf',
    }).setOrigin(0, 0.5));
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 120 });
    this._picker = { slot, c };
    this._paintSpellTiles();
  }

  _closePicker() {
    if (!this._picker) return;
    this._picker.c.destroy();
    this._picker = null;
    this._spellHint = null;
    if (this._spellTiles) this._paintSpellTiles();
  }

  _chooseSpell(slot, id) {
    if (this._phaseShown !== 'select' || !this._selRoot || this._shuttingDown) return;
    if (!isSpellId(id)) return;
    let [d, f] = this._spells;
    if (slot === 'd') { if (id === f) f = d; d = id; } else { if (id === d) d = f; f = id; }
    if (!validSpellPair(d, f)) return;
    this._spells = [d, f];
    saveSpellPrefs(d, f);
    this._queueSpells();
    AudioManager.uiClick();
    this._closePicker();
    this._refresh(true);
  }

  _queueSpells() { this._pendingSpells = [...this._spells]; this._flushSends(); }

  _flushSends() {
    const now = Date.now();
    if (this._pendingPick && !this._lockSent && now - this._lastPickAt >= SEND_GAP_MS) {
      this._send('pick', { champ: this._pendingPick });
      this._pendingPick = null;
      this._lastPickAt = now;
    }
    // pick + spells share one server rate limiter? (unknown) → keep them apart too.
    if (this._pendingSpells && now - this._lastSpellsAt >= SEND_GAP_MS && now - this._lastPickAt >= 40) {
      const [d, f] = this._pendingSpells;
      this._send('spells', { d, f });
      this._pendingSpells = null;
      this._lastSpellsAt = now;
    }
  }

  // ───────────────────────── lock button + footer ─────────────────────────
  _buildLockButton() {
    this._lockBtn = makeButton(this, {
      x: LOCKBTN.x, y: LOCKBTN.y, w: LOCKBTN.w, h: LOCKBTN.h, label: 'LOCK IN',
      sub: 'ENTER ⏎', color: NEON.green, fontSize: 26, primary: true,
      onClick: () => this._lockIn(),
    });
    this._selRoot.add(this._lockBtn.root);
  }

  _buildFooter() {
    const y0 = SLOT.y + SLOT.step * 5 + 8;
    this._leaveBtn = makeButton(this, {
      x: SLOT.lx + 70, y: 676, w: 136, h: 44, label: '✕ LEAVE', color: NEON.red, fontSize: 14,
      onClick: () => this._leave(),
    });
    this._selRoot.add(this._leaveBtn.root);
    const hint = this.add.text(SLOT.lx + 4, y0 + 6,
      '← → ↑ ↓  browse\nENTER  lock in\nD / F  summoner spells', {
        fontFamily: FONT_MONO, fontSize: 11, color: '#6f86a6', lineSpacing: 4,
      });
    const tip = this.add.text(SLOT.rx + SLOT.w, y0 + 6, `💡 ${TIPS[Math.floor(Math.random() * TIPS.length)]}`, {
      fontFamily: FONT_MONO, fontSize: 11, color: '#9fb3c8', align: 'right',
      wordWrap: { width: SLOT.w, useAdvancedWrap: true }, padding: { y: 2 },
    }).setOrigin(1, 0);
    this._selRoot.add([hint, tip]);
    this._lockCount = this.add.text(SLOT.rx + SLOT.w, 676, '', {
      fontFamily: FONT_TITLE, fontSize: 12, color: '#cfe3f5',
    }).setOrigin(1, 0.5);
    this._selRoot.add(this._lockCount);
  }

  _leave() {
    if (this._shuttingDown) return;
    const now = Date.now();
    if (!this._offline && now > this._leaveArmedUntil) {
      this._leaveArmedUntil = now + 2500;
      this._leaveBtn.setLabel('SURE? CLICK');
      this.time.delayedCall(2500, () => { if (this._leaveBtn?.root?.scene) this._leaveBtn.setLabel('✕ LEAVE'); });
      return;
    }
    this._goLobby();
  }

  _goLobby() {
    if (this._shuttingDown) return;
    if (this._room?.roomId) clearMatch(this._room.roomId); // left on purpose → no REJOIN offer
    this._cleanup();            // leaves the room (not handed off)
    // v4: a custom-room draft goes back to the rooms list.
    this.scene.start(this._data?.custom ? 'TeamCustomScene' : 'TeamLobbyScene', this._data?.custom ? { name: this._name, champ: this._fav } : undefined);
  }

  _flashPhase(msg) {
    this._phaseFlash = { msg, until: Date.now() + 1600 };
  }

  // ───────────────────────── keyboard ─────────────────────────
  _bindKeys() {
    const kb = this.input.keyboard;
    if (!kb) return;
    this._onKey = (ev) => {
      if (this._shuttingDown || this._modal) return;
      const k = ev.key;
      if (this._phaseShown !== 'select') return;
      if (this._picker) {
        if (k === 'Escape') this._closePicker();
        else if (/^[1-6]$/.test(k)) this._chooseSpell(this._picker.slot, SPELL_IDS[Number(k) - 1]);
        else if (k === 'd' || k === 'D') this._togglePicker('d');
        else if (k === 'f' || k === 'F') this._togglePicker('f');
        return;
      }
      if (k === 'd' || k === 'D') { this._togglePicker('d'); return; }
      if (k === 'f' || k === 'F') { this._togglePicker('f'); return; }
      if (k === 'Enter') { this._lockIn(); return; }
      const vis = this._visibleOrder();
      const dir = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLS, ArrowDown: COLS }[k];
      if (dir && vis.length) {
        const me = this._meRow();
        if (me?.locked) return;
        let i = vis.indexOf(ORDER[this._cursor]);
        if (i < 0) i = 0;
        // step over champions a teammate has taken
        for (let n = 0; n < vis.length; n++) {
          i = (((i + dir) % vis.length) + vis.length) % vis.length;
          if (!this._takenByTeammate(vis[i])) break;
        }
        this._cursor = ORDER.indexOf(vis[i]);
        this._hover(vis[i]);
      }
    };
    kb.on('keydown', this._onKey);
  }

  // ───────────────────────── state → view ─────────────────────────
  _meRow() {
    const s = this._state;
    return s ? s.champs.find((c) => c.id === this._myId) || null : null;
  }

  _myTeam() { return this._meRow()?.team || 'blue'; }

  _myChamp() {
    const me = this._meRow();
    if (!me) return '';
    const lh = this._localHover;
    if (!me.locked && lh && Date.now() - lh.at < OPTIMISTIC_MS && me.champ !== lh.champ) return lh.champ;
    return me.champ;
  }

  _takenByTeammate(champ) {
    const s = this._state;
    if (!s) return false;
    const team = this._myTeam();
    return s.champs.some((c) => c.id !== this._myId && c.team === team && c.champ === champ);
  }

  update() {
    if (this._shuttingDown) return;
    const now = Date.now();
    if (this._sim) this._sim.tick(now);
    this._flushSends();
    const s = this._readState();
    this._state = s;
    if (!s) return;
    const phase = s.phase;
    if (phase === 'playing' || phase === 'ended') { this._handoff(); return; }
    if (phase === 'loading') {
      if (this._phaseShown !== 'loading') this._showLoading();
      this._updateLoading(s);
      return;
    }
    if (phase === 'select') {
      this._checkLockRejected(now);
      if (this._phaseShown !== 'select') { this._phaseShown = 'select'; this._refresh(true); }
    } else {
      this._phaseShown = phase || 'lobby';          // 'lobby' (late transition) → waiting
    }
    this._refresh(false);
    this._updateTimer(s);
  }

  /** A lock that the server did not apply within ~1 s was rejected → LOCK IN works again. */
  _checkLockRejected(now) {
    if (!this._lockSent || this._sim) return;
    const me = this._meRow();
    if (!me || me.locked || now - this._lockSentAt < 1000) return;
    this._lockSent = false;
    this._localHover = null;
    const champ = me.champ;
    const taken = champ && this._takenByTeammate(champ);
    this._flashPhase(taken ? `${CHAMPIONS[champ]?.name || 'That champion'} was taken by a teammate — pick again`
      : (champ ? 'Lock-in was rejected — try again' : 'Pick a champion, then LOCK IN'));
    AudioManager.uiClick();
    this._refresh(true);
  }

  _updateTimer(s) {
    const me = this._meRow();
    let total = 0, locked = 0;
    for (const c of s.champs) { total++; if (c.locked) locked++; }
    if (s.phase !== 'select') {
      this._phaseTxt.setText('Waiting for the draft to start…');
      this._timerFill.scaleX = 1;
      this._timerTxt.setText('');
      return;
    }
    const selMs = this._sim ? OFFLINE_SELECT_MS : SELECT_MS;
    const left = s.selectEndsAt ? Math.max(0, Math.min(selMs, s.selectEndsAt - this._srvNow())) : selMs;
    this._timerFill.scaleX = Math.max(0.001, left / selMs);
    this._timerFill.setFillStyle(left < 8000 ? NEON.red : NEON.yellow, 1);
    this._timerTxt.setText(fmtSec(left)).setColor(left < 8000 ? '#ff5e5e' : '#ffd23f');
    const sec = Math.ceil(left / 1000);
    if (sec !== this._lastTickSec) {
      if (sec <= 5 && sec > 0 && this._lastTickSec !== -1) AudioManager.timerTick?.();
      this._lastTickSec = sec;
    }
    let msg;
    if (this._phaseFlash && Date.now() < this._phaseFlash.until) msg = `⚠ ${this._phaseFlash.msg}`;
    else if (total && locked >= total) msg = 'ALL LOCKED IN — get ready!';
    else if (me?.locked) msg = `Locked in · waiting for the others  (${locked}/${total || TEAM_SIZE * 2})`;
    else if (this._lockSent) msg = 'Locking in…';
    else msg = 'Pick your champion · hover, then LOCK IN';
    this._phaseTxt.setText(msg);
    this._lockCount.setText(`🔒 ${locked}/${total || TEAM_SIZE * 2} locked`);
  }

  /** Re-render slots / cards when the draft changed (cheap signature check). */
  _refresh(force) {
    const s = this._state;
    if (!s || !this._selRoot || this._phaseShown !== 'select') return;
    const myChamp = this._myChamp();
    const me = this._meRow();
    const sig = s.champs.map((c) => `${c.id}|${c.team}|${c.champ}|${c.locked ? 1 : 0}|${c.spellD}|${c.spellF}|${c.name}|${c.isBot ? 1 : 0}|${c.hat || ''}`).join(';')
      + `#${myChamp}#${this._spells.join(',')}#${this._lockSent ? 1 : 0}`;
    if (!force && sig === this._sig) {
      this._renderDetail(this._inspect || myChamp || this._fav || null);
      return;
    }
    this._sig = sig;
    for (const c of s.champs) if (!this._order.includes(c.id)) this._order.push(c.id);
    if (me && me.locked) { this._lockSent = true; this._localHover = null; }
    // Server spells (authoritative once present) — adopt only if we have nothing pending.
    if (me && !this._sim && !this._pendingSpells && validSpellPair(me.spellD, me.spellF)
        && Date.now() - this._lastSpellsAt > 1500 && (me.spellD !== this._spells[0] || me.spellF !== this._spells[1])) {
      this._spells = [me.spellD, me.spellF];
      this._paintSpellTiles();
    }
    if (!this._sim && me && me.champ === '' && !this._localHover && !this._autoHovered) {
      // Favourite first; if a teammate already has it, hover the first free champion
      // (playtest v3: you could sit in select with nothing hovered).
      const pick = isChampionId(this._fav) && !this._takenByTeammate(this._fav) ? this._fav
        : Object.keys(CHAMPIONS).find((id) => !this._takenByTeammate(id));
      if (pick) { this._autoHovered = true; this._hover(pick); }
    }
    this._renderSlots(s);
    // cards
    for (const card of this._cards) {
      let st = '';
      const takenBy = s.champs.find((c) => c.id !== this._myId && c.team === this._myTeam() && c.champ === card.id);
      if (card.id === myChamp) st = me?.locked ? 'locked' : 'mine';
      else if (takenBy) st = 'taken';
      else if (me?.locked) st = 'off';
      if (st === 'taken') card.taken.setText(`TAKEN\n${clipName(takenBy.name || 'teammate', 12)}${takenBy.locked ? ' 🔒' : ''}`);
      card.state = st;
      this._paintCard(card);
    }
    this._lockBtn.setDimmed(!!(me?.locked || this._lockSent) || !isChampionId(myChamp));
    this._lockBtn.setLabel(me?.locked ? 'LOCKED ✓' : 'LOCK IN');
    this._lockBtn.setSub(me?.locked ? 'spells can still change' : (isChampionId(myChamp) ? `ENTER ⏎ · ${CHAMPIONS[myChamp].name}` : 'pick a champion'));
    this._paintSpellTiles();
    this._renderDetail(this._inspect || myChamp || this._fav || null);
  }

  _teamRows(s) {
    const myTeam = this._myTeam();
    const idx = (c) => this._order.indexOf(c.id);
    const mine = s.champs.filter((c) => c.team === myTeam).sort((a, b) => idx(a) - idx(b));
    const theirs = s.champs.filter((c) => c.team !== myTeam).sort((a, b) => idx(a) - idx(b));
    return { myTeam, mine, theirs, enemyTeam: myTeam === 'blue' ? 'red' : 'blue' };
  }

  _renderSlots(s) {
    for (const t of this._slotTweens) t.remove();
    this._slotTweens.length = 0;
    for (const o of this._slotObjs) o.destroy();
    this._slotObjs.length = 0;
    const { myTeam, mine, theirs, enemyTeam } = this._teamRows(s);
    const ti = TEAM_INFO[myTeam], te = TEAM_INFO[enemyTeam];
    this._leftHdr.setText(`${ti.emoji} ${ti.name.toUpperCase()} · YOUR TEAM`).setColor(ti.css);
    this._rightHdr.setText(`${te.name.toUpperCase()} ${te.emoji}`).setColor(te.css);
    for (let i = 0; i < TEAM_SIZE; i++) {
      this._slot(mine[i], 'left', i, ti.color, true);
      this._slot(theirs[i], 'right', i, te.color, false);
    }
  }

  _slot(row, side, i, teamCol, ally) {
    const x = side === 'left' ? SLOT.lx : SLOT.rx;
    const y = SLOT.y + i * SLOT.step;
    const { w, h } = SLOT;
    const c = this.add.container(x, y);
    this._selRoot.add(c);
    this._slotObjs.push(c);
    const isMe = row && row.id === this._myId;
    const champId = row ? (isMe ? this._myChamp() : row.champ) : '';
    const visible = row && isChampionId(champId) && (ally || row.locked);
    const locked = !!row?.locked;
    const def = visible ? CHAMPIONS[champId] : null;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.45); fillRR(g, 3, 5, w, h, 12);
    g.fillStyle(0x0a0f1a, 0.95); fillRR(g, 0, 0, w, h, 12);
    if (def && locked) { g.fillStyle(def.color, 0.14); fillRR(g, 0, 0, w, h, 12); }
    g.fillStyle(teamCol, locked ? 0.9 : 0.4);
    if (side === 'left') fillRR(g, 0, 0, 6, h, 3); else fillRR(g, w - 6, 0, 6, h, 3);
    g.lineStyle(isMe ? 3 : 1.5, isMe ? NEON.yellow : teamCol, isMe ? 1 : (locked ? 0.8 : 0.35));
    strokeRR(g, 0, 0, w, h, 12);
    c.add(g);
    const px = side === 'left' ? 50 : w - 50, py = h / 2;
    const tx = side === 'left' ? 94 : w - 94, ox = side === 'left' ? 0 : 1;
    if (!row) {
      c.add(this.add.text(w / 2, h / 2, 'empty seat', { fontFamily: FONT_MONO, fontSize: 12, color: '#4f6380' }).setOrigin(0.5));
      return;
    }
    if (def) {
      const p = drawChampionPortrait(this, champId, px, py, 64);
      if (!locked) {
        p.setAlpha(0.55);
        this._slotTweens.push(this.tweens.add({ targets: p, alpha: { from: 0.4, to: 0.8 }, duration: 700, yoyo: true, repeat: -1 }));
      }
      c.add(p);
    } else {
      const sil = this.add.graphics();
      sil.fillStyle(0x1a2233, 1); fillCircleLP(sil, px, py, 32);
      sil.lineStyle(2, teamCol, 0.45); strokeCircleLP(sil, px, py, 32);
      c.add(sil);
      c.add(this.add.text(px, py, row.champ && !ally ? '…' : '?', {
        fontFamily: FONT_TITLE, fontSize: 26, color: '#4f6380',
      }).setOrigin(0.5));
    }
    const hat = hatEmoji(row.hat);
    const nm = `${row.isBot ? '🤖 ' : ''}${hat ? `${hat} ` : ''}${clipName(row.name || (row.isBot ? 'Bot' : 'Player'), 14)}${isMe ? '  (you)' : ''}`;
    c.add(this.add.text(tx, 18, nm, {
      fontFamily: FONT_MONO, fontSize: 12, color: isMe ? '#ffd23f' : '#b7c7da', padding: { y: 2 },
    }).setOrigin(ox, 0.5));
    const cname = def ? def.name : (locked ? 'Locked' : 'Picking…');
    c.add(this.add.text(tx, 40, cname, {
      fontFamily: FONT_TITLE, fontSize: 17, color: def ? '#ffffff' : '#6f86a6', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(ox, 0.5));
    const status = locked ? '✓ LOCKED' : (def ? 'HOVERING' : 'PICKING');
    const sp = makePill(this, 0, 66, status, {
      color: locked ? NEON.green : 0x8fa3bf, fontSize: 8, padX: 5,
    });
    sp.x = side === 'left' ? tx : tx - sp.pillW;
    c.add(sp);
    // Pass 2 RP-13: rank badge next to the status pill (humans only).
    if (row.rank && !row.isBot) {
      const rk = this.add.text(side === 'left' ? tx + sp.pillW + 6 : tx - sp.pillW - 6, 66, row.rank, {
        fontFamily: FONT_MONO, fontSize: 10, color: '#ffd23f', padding: { y: 2 },
      }).setOrigin(side === 'left' ? 0 : 1, 0.5);
      c.add(rk);
    }
    // spells (allies: always · enemies: only once locked)
    if (ally || locked) {
      const sids = isMe ? this._spells : [row.spellD, row.spellF];
      sids.forEach((sid, k) => {
        const s = SPELLS[sid];
        if (!s) return;
        const sx = side === 'left' ? w - 44 + k * 22 : 22 + k * 22, sy = 66;
        const sg = this.add.graphics();
        sg.fillStyle(s.color, 0.25); fillRR(sg, sx - 10, sy - 10, 20, 20, 5);
        sg.lineStyle(1.2, s.color, 0.9); strokeRR(sg, sx - 10, sy - 10, 20, 20, 5);
        c.add(sg);
        c.add(this.add.text(sx, sy, s.icon, { fontSize: 12, padding: { y: 2 } }).setOrigin(0.5));
      });
    }
    // lock-in pop (bots animate in too)
    const was = this._seenLocked.get(row.id);
    this._seenLocked.set(row.id, locked);
    if (locked && was === false) {
      const fl = this.add.graphics();
      fl.fillStyle(0xffffff, 0.55); fillRR(fl, 0, 0, w, h, 12);
      c.add(fl);
      this.tweens.add({ targets: fl, alpha: 0, duration: 420, onComplete: () => fl.destroy() });
      c.setScale(1.06);
      c.x -= side === 'left' ? 0 : w * 0.06;
      this.tweens.add({ targets: c, scale: 1, x, duration: 260, ease: 'Back.easeOut' });
      if (isMe) AudioManager.reward?.(); else AudioManager.combo?.(1);
    }
  }

  // ───────────────────────── loading screen ─────────────────────────
  _showLoading() {
    this._phaseShown = 'loading';
    this._closePicker();
    if (this._selRoot) {
      const r = this._selRoot;
      this._selRoot = null;
      const off = (o) => { if (o.input) o.disableInteractive(); if (Array.isArray(o.list)) o.list.forEach(off); };
      off(r);
      for (const t of this._slotTweens) t.remove();
      this._slotTweens.length = 0;
      this.tweens.add({ targets: r, alpha: 0, duration: 220, onComplete: () => r.destroy() });
    }
    const s = this._state;
    const { myTeam, mine, theirs, enemyTeam } = this._teamRows(s);
    const root = this.add.container(0, 0).setDepth(20);
    this._loadRoot = root;
    const cx = this.W / 2;
    const title = this.add.text(cx, 34, 'OFFICE SIEGE · LOADING', {
      fontFamily: FONT_TITLE, fontSize: 28, color: '#ffffff', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5);
    glow(title, '#00d9ff', 12);
    root.add(title);
    const vs = this.add.text(cx, 362, 'VS', {
      fontFamily: FONT_TITLE, fontSize: 30, color: '#ffd23f', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5);
    glow(vs, '#ffd23f', 12);
    root.add(vs);
    const cw = 226, ch = 270, gap = 12, x0 = cx - (cw * 5 + gap * 4) / 2;
    const row = (list, team, y, delay0) => {
      const info = TEAM_INFO[team];
      root.add(this.add.text(x0, y - 16, `${info.emoji} ${info.name.toUpperCase()}${team === myTeam ? ' · YOUR TEAM' : ''}`, {
        fontFamily: FONT_TITLE, fontSize: 12, color: info.css, stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0, 0.5));
      for (let i = 0; i < TEAM_SIZE; i++) {
        const r = list[i];
        const x = x0 + i * (cw + gap);
        const card = this._loadCard(r, x, y, cw, ch, info.color);
        root.add(card);
        card.setAlpha(0); card.y = y + 24;
        this.tweens.add({ targets: card, alpha: 1, y, duration: 300, delay: delay0 + i * 70, ease: 'Back.easeOut' });
      }
    };
    // compact: two rows of half-height cards
    row(mine, myTeam, 76, 0);
    row(theirs, enemyTeam, 400, 200);
    this._loadBar = this.add.rectangle(cx - 300, 700, 600, 6, NEON.cyan, 1).setOrigin(0, 0.5);
    root.add(this.add.rectangle(cx, 700, 600, 6, 0x1a2233, 1));
    root.add(this._loadBar);
    this._loadTip = this.add.text(cx, 683, `💡 ${TIPS[Math.floor(Math.random() * TIPS.length)]}`, {
      fontFamily: FONT_MONO, fontSize: 12, color: '#9fb3c8', padding: { y: 2 },
    }).setOrigin(0.5);
    root.add(this._loadTip);
    AudioManager.paChime?.();
  }

  _loadCard(r, x, y, w, h0, teamCol) {
    const h = 256;
    void h0;
    const c = this.add.container(x, y);
    const isMe = r && r.id === this._myId;
    const def = r && isChampionId(r.champ) ? CHAMPIONS[r.champ] : null;
    const g = this.add.graphics();
    drawPanel(g, 0, 0, w, h, { color: isMe ? NEON.yellow : teamCol, radius: 14, halo: isMe ? 0.18 : 0.06 });
    if (def) { g.fillStyle(def.color, 0.12); fillRR(g, 2, 2, w - 4, h - 4, 12); }
    c.add(g);
    if (!r) return c;
    if (def) c.add(drawChampionPortrait(this, r.champ, w / 2, 82, 128));
    c.add(this.add.text(w / 2, 166, def ? def.name.toUpperCase() : '???', {
      fontFamily: FONT_TITLE, fontSize: 18, color: '#ffffff', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5));
    c.add(this.add.text(w / 2, 188, def ? `${def.role} · ${(LANE_LABEL[def.lane] || def.lane).toLowerCase()}` : '', {
      fontFamily: FONT_MONO, fontSize: 11, color: def ? hex(def.color) : '#8fa3bf',
    }).setOrigin(0.5));
    const hat = hatEmoji(r.hat);
    c.add(this.add.text(w / 2, 210, `${r.isBot ? '🤖 ' : ''}${hat ? `${hat} ` : ''}${clipName(r.name || 'Player', 16)}`, {
      fontFamily: FONT_MONO, fontSize: 13, color: isMe ? '#ffd23f' : '#cfe3f5', padding: { y: 2 },
    }).setOrigin(0.5));
    const sids = isMe ? this._spells : [r.spellD, r.spellF];
    sids.forEach((sid, k) => {
      const s = SPELLS[sid];
      if (!s) return;
      const sx = w / 2 - 15 + k * 30, sy = 236;
      const sg = this.add.graphics();
      sg.fillStyle(s.color, 0.25); fillRR(sg, sx - 12, sy - 12, 24, 24, 6);
      sg.lineStyle(1.5, s.color, 0.95); strokeRR(sg, sx - 12, sy - 12, 24, 24, 6);
      c.add(sg);
      c.add(this.add.text(sx, sy, s.icon, { fontSize: 14, padding: { y: 2 } }).setOrigin(0.5));
    });
    return c;
  }

  _updateLoading(s) {
    if (!this._loadBar) return;
    const left = s.loadingEndsAt ? Math.max(0, Math.min(LOADING_MS, s.loadingEndsAt - this._srvNow())) : LOADING_MS;
    this._loadBar.scaleX = Math.max(0.001, 1 - left / LOADING_MS);
  }

  // ───────────────────────── handoff / leave ─────────────────────────
  _handoff() {
    if (this._handedOff || this._shuttingDown) return;
    const me = this._meRow();
    const champ = (me && isChampionId(me.champ)) ? me.champ : (this._fav || 'pixel');
    const spells = [...this._spells];
    if (this._sim) {
      const roles = this._sim.finalRoles();
      const allies = this._sim.champs.filter((c) => c.team === 'blue' && c.id !== 'me')
        .map((c) => ({ champ: c.champ, name: c.name, spells: [c.spellD, c.spellF], role: roles.get(c.id) || c.role }));
      const enemies = this._sim.champs.filter((c) => c.team === 'red')
        .map((c) => ({ champ: c.champ, name: c.name, spells: [c.spellD, c.spellF], role: c.role }));
      this._handedOff = true;
      this.scene.start('TeamModeScene', { offline: true, champ, spells, name: this._name, allies, enemies });
      return;
    }
    const room = this._room;
    const clockOffset = this._clockOffsetNow();
    const pending = this._pending;               // same array: late messages still land in it
    if (this._msgState) this._msgState.handoffAt = Date.now();
    this._unlisten(true);
    this._handedOff = true;
    this.scene.start('TeamModeScene', { room, champ, spells, name: this._name, clockOffset, pending });
  }

  _showModal(title, body) {
    if (this._modal) return;
    const { W, H } = this;
    const c = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(0, 0, W, H, 0x02040a, 0.8).setOrigin(0).setInteractive();
    const g = this.add.graphics();
    drawPanel(g, W / 2 - 280, H / 2 - 110, 560, 220, { color: NEON.red, radius: 16 });
    c.add([dim, g,
      this.add.text(W / 2, H / 2 - 66, title, { fontFamily: FONT_TITLE, fontSize: 24, color: '#ff8a8a' }).setOrigin(0.5),
      this.add.text(W / 2, H / 2 - 18, body, {
        fontFamily: FONT_MONO, fontSize: 13, color: '#cfe3f5', align: 'center', wordWrap: { width: 500 },
      }).setOrigin(0.5)]);
    const b = makeButton(this, {
      x: W / 2, y: H / 2 + 56, w: 260, h: 54, label: '◀ BACK TO LOBBY', color: NEON.blue, fontSize: 16,
      onClick: () => this._goLobby(),
    });
    c.add(b.root);
    this._modal = c;
  }

  _cleanup() {
    if (this._shuttingDown) return;
    this._shuttingDown = true;
    try { this._reconn?.loop?.cancel(); } catch (_) { /* ignore */ }
    this._reconn = null;
    if (this._msgState && !this._handedOff) this._msgState.dead = true;
    this._unlisten(true);   // keep the catch-all (no-op once dead) until the socket closes / after handoff
    if (this._room && !this._handedOff) { const r = this._room; this._room = null; try { r.leave(); } catch (_) { /* ignore */ } }
    this._room = null;
    this._sim = null;
    if (this._onKey && this.input?.keyboard) this.input.keyboard.off('keydown', this._onKey);
    this._onKey = null;
    this._picker = null;
    for (const t of this._slotTweens) t.remove();
    this._slotTweens.length = 0;
    this._slotObjs.length = 0;
    this._cards.length = 0;
  }
}

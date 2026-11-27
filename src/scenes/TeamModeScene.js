// TeamModeScene — Team Mode ("Office Siege"), the 5v5 office MOBA battlefield.
// Contract: .claude/context/tasks/TEAM_MODE_BREAKDOWN.md §3 (state fields + messages).
//
// Started with data = { champ, name, offline? }. Joins the Colyseus room 'team'
// (or runs OfflineSim with `offline`), renders the shared map / structures /
// units / champions, sends orders + casts, predicts the local champion, plays
// fx/atk VFX, and drives the HUD + the UI agent's ShopPanel / Scoreboard /
// EndScreen (loaded defensively — built-in fallbacks keep the match playable).
//
// Two cameras: the main camera (zoomed, follows you) draws the world; a second
// unzoomed camera draws everything screen-pinned (scrollFactor 0). New objects are
// assigned to the right camera automatically before each render (_classifyCams).
//
// v2 (TEAM_MODE_V2_BREAKDOWN.md): walls (MobaMap), local prediction + move-click
// path preview via shared/moba/nav.js findPath, aim previews for zone / fan /
// dash-clipped-by-walls / blink-at-nearestFree / knockback arrows / at:'pet',
// fx zone · knock · petatk, pets (units with kind 'pet') are never picked.
//
// v3 (TEAM_MODE_V3_BREAKDOWN.md): started with { room } by TeamSelectScene (takes over
// the SAME room — no re-join; every listener is registered with its unsubscribe and
// removed on shutdown), or { champ, name } (deep link → joins with autoLock and shows a
// waiting overlay through lobby / select / loading — the world camera is hidden until
// `playing`), or { offline, champ, spells, allies? }. Summoner spells on D / F
// (`spell {slot, x, y, id?}`, fx spell, aim previews), InfoPanel on C / the HUD ℹ button.
//
// v4 (TEAM_MODE_V4_BREAKDOWN.md): bushes (MobaMap canopies; the server REMOVES hidden
// enemies from our state → their views fade out, and every reference to the id — hover,
// queued order / cast — is dropped; re-added ones fade in). Own-team champions in a bush
// and not revealed render translucent (ChampionView.setHidden), with a "🌿 hidden" HUD hint
// for yourself. Auto-aim (§3.3): cursor on yourself (≤ 60 px), outside the canvas, touch or
// HUD-button casts → nearest visible enemy champion within range + AUTO_AIM_SLACK, else the
// nearest enemy unit, else facing. Perf (§3.4): views far off-camera are hidden and not
// updated, auto quality (FPS < 45 for 3 s → low effects; HUD ✨ toggle, remembered).
//
// Experience Pass 1 (EXPERIENCE_PASS_BREAKDOWN.md §3.3): EP-07 reconnect — a non-consented drop
// (code ∉ {1000, 4000}, not ended, server announced `welcome.reconnectS`) shows "📶 reconnecting…
// Ns" and calls client.reconnect(token) every 2 s; on success every view is cleared and the NEW
// room is adopted (hello again). EP-08 🏳 rollback vote (button from 12:00, `/rollback` in chat,
// Y / N, panel; hidden offline). EP-10 first-siege coaching tips (flag `tipsSiege`, ≤ 1 per 20 s).
// EP-11 join option `hat`. EP-21 first-buy nudge, AudioManager team hooks, short offline timers.
import { CHAMPIONS, isChampionId, autoAimsAtEnemy, autoAimReach, resolveSkill, parseKitTags, parseCcTags, CC_TYPES } from '../../shared/moba/champions.js';
import * as R from '../../shared/moba/rules.js';
import { CHAMP_RADIUS, MINION_RADIUS, distToSeg } from '../../shared/moba/map.js';
import { SPELLS, DEFAULT_SPELLS, validSpellPair } from '../../shared/moba/spells.js';
import { WORLD_5V5 } from '../entities/moba/world.js';
import { AudioManager } from '../core/AudioManager.js';
import { SaveManager } from '../core/SaveManager.js';
import { t, getLang, toggleLang, onLangChange } from '../core/I18n.js';
import { getPid, takeover, joinError, saveMatch, clearMatch, CLOSE_TAKEN_OVER, DUP_TAB_TEXT } from '../core/Identity.js';
import { ITEMS, buyBlocker, recipePlan } from '../../shared/moba/items.js';
import { ensureMobaTextures, D, teamColor, toArr, approach, setLooks, projectileTex, fmtTime, shakeCam } from '../entities/moba/mobaGfx.js';
import { MobaMap } from '../entities/moba/MobaMap.js';
import { ChampionView } from '../entities/moba/ChampionView.js';
import { UnitView } from '../entities/moba/UnitView.js';
import { StructureView } from '../entities/moba/StructureView.js';
import { MobaFx } from '../entities/moba/MobaFx.js';
import { castFx, styleFor, VFX_NAMES, loadFb, loadIcons } from '../entities/moba/SkillFx.js';
import { MobaHud } from '../entities/moba/MobaHud.js';
import { OfflineSim } from '../entities/moba/OfflineSim.js';
import { FallbackShopPanel, FallbackScoreboard, FallbackEndScreen } from '../entities/moba/Fallbacks.js';
import { InfoPanel } from '../ui/moba/InfoPanel.js';
import { AugmentPanel } from '../ui/moba/AugmentPanel.js';
import { reconnectLoop, TEAM_RECONNECT_GRACE_S } from '../ui/moba/uiKit.js';

// looks.js (client-art, contract v2 §3.3) is a hard dependency — ChampionView,
// UnitView, the lobby and the UI import it statically too — so a plain import.
import * as LOOKS from '../entities/moba/looks.js';
setLooks(LOOKS);

const STICK_POSES = [
  ['stick-idle', 'idle.svg'], ['stick-run', 'run.svg'], ['stick-run2', 'run2.svg'], ['stick-smash', 'smash.svg'],
  ['stick-kick', 'kick.svg'], ['stick-punch', 'punch.svg'], ['stick-parry', 'parry.svg'], ['stick-jump', 'jump.svg'],
];
const BUG_SPRITES = ['bug-ladybug', 'bug-null', 'bug-robot', 'bug-beetle'];
const MSG_TYPES = ['welcome', 'time', 'atk', 'fx', 'feed', 'announce', 'gold', 'chat', 'chatHistory', 'vote', 'voteEnd', 'voteDeny', 'rank'];
const TIME_SYNC_MS = 10000;        // contract §3.6: `time` samples (smallest RTT wins)
const KEY_CAPTURES = 'TAB,SPACE,UP,DOWN,LEFT,RIGHT';
const WORLD_PHASES = new Set(['playing', 'ended']); // the match world is only shown in these
const PRED_SNAP_PX = 120;          // reconcile: snap the predicted position when this far off
const STICK_ORDER_MS = 110;        // joystick / arrow-key move order cadence
const AUTO_AIM_SELF_PX = 60;       // v4 §3.3: cursor this close to your champion → auto-aim
const NO_AIM_TYPES = new Set(['stance', 'echo', 'timebox', 'pickup', 'objcmd', 'resolve', 'rewind']); // v6: cast at self, no aim needed
const FORCED_CC = new Set(['suppress', 'airborne', 'charm', 'fear', 'taunt']); // v6.1: no casts, no orders, no local walking
const MOUSE_IDLE_MS = 1000;       // mouse not moved for this long → auto-aim (player request 2026-11-08)
const CULL_PAD = 260;              // views farther than this outside the camera are hidden + not updated
const FX_PREF_KEY = 'bugsmash.team.fx'; // 'auto' | 'high' | 'low' (localStorage)
const CAM_LOCK_KEY = 'bugsmash.team.camLock'; // Pass 2 RP-08: '1' locked (default) | '0' free
const EDGE_PAN_PX = 20;            // free camera: the mouse this close to a screen edge pans …
const EDGE_PAN_SPEED = 1500;       // … at this many screen px / s
const LOW_FPS = 45, LOW_FPS_MS = 3000, FPS_WARMUP_MS = 4000;
const RECONNECT_EVERY_MS = 2000;   // §3.3: client.reconnect(token) cadence while in grace
const STALL_MS = 8000;             // EP-07 watchdog: no patch / message this long while playing = suspect
const STALL_GRACE_MS = 4000;       // … plus one extra window (ping sent) before it counts as dropped
// (a dead Wi-Fi leaves the socket CLOSING for minutes without onLeave)
const COACH_GAP_MS = 20000;        // EP-10: at most one coaching tip per 20 s
const COACH_MATCHES = 2;           // tips stop (flag tipsSiege) after this many finished matches
const SHOP_ASSIST_GAMES = 3;       // EP-21: the first 3 games open the shop at 0:00
const VOTE_DENY = {
  early: '🏳 Rollback opens at 12:00 — keep shipping', cooldown: '🏳 Rollback on cooldown — the last one was rejected',
  active: '🏳 You already voted', phase: '🏳 Not now — the match is not running',
};

const makeCursorSvg = (stroke) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>`
    + `<circle cx='14' cy='14' r='9' fill='none' stroke='#000' stroke-width='3.5'/>`
    + `<circle cx='14' cy='14' r='9' fill='none' stroke='${stroke}' stroke-width='2'/>`
    + `<path d='M14 2v5M14 21v5M2 14h5M21 14h5' stroke='#000' stroke-width='3.5' stroke-linecap='round'/>`
    + `<path d='M14 2v5M14 21v5M2 14h5M21 14h5' stroke='${stroke}' stroke-width='2' stroke-linecap='round'/>`
    + `<circle cx='14' cy='14' r='2' fill='${stroke}'/>`
    + `</svg>`
  )}") 14 14, crosshair`;

const HOVER_CURSORS = {
  enemy: makeCursorSvg('#ff4a4a'),
  neutral: makeCursorSvg('#ffd23f'),
  ally: makeCursorSvg('#39c2ff'),
};
const HOVER_COLOR = { enemy: 0xff4a4a, neutral: 0xffd23f, ally: 0x39c2ff };

/** ws URL: same host:port as the page, except the :8000 python dev server → :2567; `?server=` overrides. */
function serverUrl() {
  const loc = window.location;
  const o = new URLSearchParams(loc.search).get('server');
  if (o && /^wss?:\/\//.test(o)) return o;
  if (loc.port === '8000') return `ws://${loc.hostname || 'localhost'}:2567`;
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host || 'localhost:2567'}`;
}

export default class TeamModeScene extends Phaser.Scene {
  constructor(key = 'TeamModeScene') { super(key); }   // Story Mode 2.0 subclasses pass their own key

  init(data) { this._data = data || {}; }

  preload() {
    for (const [key, file] of STICK_POSES) {
      if (!this.textures.exists(key)) this.load.svg(key, `assets/characters/stickman/${file}`, { width: 144, height: 144 });
    }
    for (const id of BUG_SPRITES) if (!this.textures.exists(id)) this.load.image(id, `assets/bugs/${id}.png`);
    if (!this.textures.exists('boss-deadline')) this.load.image('boss-deadline', 'assets/boss/deadline.png');
    const MOBA_ASSETS = [
      ['moba-tower-blue-art', 'tower-blue.png'], ['moba-tower-red-art', 'tower-red.png'],
      ['moba-core-blue-art', 'core-blue.png'], ['moba-core-red-art', 'core-red.png'],
      ['moba-vfx-magic', 'vfx-magic.png'], ['moba-vfx-slash', 'vfx-slash.png'],
      ['moba-vfx-spark', 'vfx-spark.png'], ['moba-vfx-flare', 'vfx-flare.png'],
      ['moba-prop-plant', 'plant.png'], ['moba-prop-barricade', 'barricade.png'],
      ['moba-prop-crystal', 'crystal.png'], ['moba-prop-beacon', 'beacon.png'],
    ];
    for (const [k, f] of MOBA_ASSETS) if (!this.textures.exists(k)) this.load.image(k, `assets/moba/${f}`);
    // v5 skill VFX sprites (Kenney Particle Pack, CC0) — see SkillFx.js
    for (const n of VFX_NAMES) if (!this.textures.exists(`vfx-${n}`)) this.load.image(`vfx-${n}`, `assets/moba/vfx/${n}.png`);
    // animated flipbooks (RPG VFX Pack, ~8 MB): skipped when the player chose Low effects (?fx=low or the saved pref);
    // fb() already returns null for a missing sheet, so switching to High later just plays without the flipbook layers.
    let lowPref = false;
    try { lowPref = (new URLSearchParams(window.location.search).get('fx') || window.localStorage?.getItem(FX_PREF_KEY)) === 'low'; } catch (_) { /* storage blocked */ }
    if (!lowPref) loadFb(this);
    loadIcons(this); // Kenney game icons used as glyph art by SkillFx (replaces emoji)
    MobaMap.preload(this); // [env]
    LOOKS.loadChampUiAssets(this); // [champ-ui] champion sprite atlas + HUD UI atlas/font
  }

  /** The skill spec a cast `fx` message belongs to (needs sid + slot), or null. */
  _skillOf(m) {
    const c = m && m.sid && m.slot ? this._state()?.champions?.get?.(m.sid) : null;
    return c ? this._specFor(c, m.slot) : null;
  }

  /** v6: the ACTIVE spec of a champion's slot (stance variants replace the base spec). */
  _specFor(c, slot) {
    return c ? resolveSkill(CHAMPIONS[c.champ], slot, parseKitTags(c.buffs).stance) : null;
  }

  create() {
    // Phaser reuses this instance across visits — reset every per-visit field.
    const d = this._data || {};
    const params = new URLSearchParams(window.location.search);
    // 2026-11-25 (Story Mode 2.0): the floor this scene plays on (size, fountains, bushes, nav).
    this.world = this._makeWorld(d) || WORLD_5V5;
    this._visit = (this._visit || 0) + 1;
    this._shuttingDown = false;
    this.room = null; this.client = null; this._sim = null;
    this.localId = null; this.myTeam = null;
    this.myChamp = isChampionId(d.champ) ? d.champ : 'pixel';
    this.playerName = String(d.name || SaveManager.getPlayerName?.() || 'Player').slice(0, 16);
    this._clockOffset = Number.isFinite(d.clockOffset) ? d.clockOffset : 0; // handed over by TeamSelectScene
    this._clockSet = Number.isFinite(d.clockOffset);
    this._bestRtt = Infinity;   // a fresh `time` sample always replaces the handed-over offset
    this._spellPrefs = !(Array.isArray(d.spells) && validSpellPair(d.spells[0], d.spells[1])) && !validSpellPair(...(params.get('spells') || '').split(','));
    this.views = { champs: new Map(), units: new Map(), structs: new Map() };
    this._liveCamps = new Set();
    this._frame = 0;
    this._phase = null; this._ended = false; this._endPending = null;
    this._pred = null; this._moveDest = null; this._dashUntil = 0;
    this._lastOrderAt = 0; this._pendingOrder = null; this._lastCastAt = 0; this._pendingCast = null; this._castQueue = [];
    this._mine = new Map(); this._myCastAt = -1e9; this._minePrunedAt = 0;
    this._stickDir = null; this._stickSentAt = 0; this._sticking = false;
    this._held = null; this._recastUntil = {};
    this._hoverSlot = null; this._aimFlash = null; this._mouseWorld = null; this._mouseHeld = false; this._dragAt = 0;
    this._hoverPickAt = 0; this._hoverEnemy = null; this._hoverEntity = null; this._selectedId = null; this._cursorKind = '';
    this._hoverGlow = null; this._hoverEntity = null; this._hoverCursor = '';
    this._hoverGlow = null;
    this._lastOfferJson = ''; this._cachedOffer = null;
    this._lastAugCsv = ''; this._cachedAugs = [];
    this._lastRelicsJson = ''; this._cachedRelics = null;
    this._fogWatchers = [];
    this._sbOpen = false; this._chatActive = false; this._lastChatAt = 0;
    this._camInit = false; this._grayFx = null; this._meDead = false; this._hudChamp = null; this._lastPnow = 0;
    // Pass 2 RP-08 camera: locked (follow) or free; a minimap drag "peeks" while locked.
    let lockPref = '1';
    try { lockPref = window.localStorage.getItem(CAM_LOCK_KEY) || '1'; } catch (_) { /* default */ }
    this._camLocked = lockPref !== '0'; this._camPeek = false; this._camFreeX = 0; this._camFreeY = 0;
    this._centerHeld = false; this._midDrag = null;
    this._camQ = [];
    this._msgStats = {};
    this._movePath = null; this._pathPrev = null; this._myPetId = null;
    this.shop = null; this.scoreboard = null; this.endScreen = null; this.info = null;
    this._unsubs = []; this._trailAt = new Map(); this._lastMoveDir = null; this._infoAt = 0;
    const qs = (params.get('spells') || '').split(',');
    this.mySpells = Array.isArray(d.spells) && validSpellPair(d.spells[0], d.spells[1]) ? d.spells.slice(0, 2)
      : (validSpellPair(qs[0], qs[1]) ? qs.slice(0, 2) : DEFAULT_SPELLS.slice());
    // Touch layout only for coarse primary pointers (phones/tablets) — Windows touch
    // laptops used with a mouse keep cursor aiming. `?touch=1` forces it.
    this._isTouch = params.get('touch') === '1'
      || (window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : navigator.maxTouchPoints > 0);
    this._meInfo = { x: 0, y: 0, team: null, dead: true };
    this._pointerOut = false; this._worldReady = false; this._meHidden = null; this._playingAt = 0;
    this._cull = { x0: 0, y0: 0, x1: 0, y1: 0 };
    // Experience Pass 1
    this._reconn = null; this._wantHistory = true; this._stallAt = 0; this._lastRxAt = Date.now();
    this._reconnectS = TEAM_RECONNECT_GRACE_S; // review fix 2: an early drop (before `welcome`) still retries
    this._vote = null; this._voteMine = null; this._voteReqAt = 0; this._voteKey = 0;
    this._rankRes = null; // Pass 2 RP-13
    this._firstBlood = null; this._firstBloodDone = false; this._lastCastSfx = 0; this._slowTickAt = 0; this._shopAssistAt = 0;
    const career = SaveManager.getCareer?.() || {};
    this._gamesPlayed = (career.teamGames | 0) + (career.teamPractice | 0);
    const tipsDone = SaveManager.getFlag ? !!SaveManager.getFlag('tipsSiege') : this._gamesPlayed >= COACH_MATCHES;
    this._coach = tipsDone ? null : { seen: new Set(), lastAt: -1e9, nextAt: 0 };
    this._shopAssist = this._gamesPlayed < SHOP_ASSIST_GAMES;
    this._wasCustom = false; this._noEnemyAt = -1e9; this._leftBaseAt = 0;

    this._setupCameras();
    ensureMobaTextures(this);
    try { LOOKS?.ensureMobaLooks?.(this); } catch (e) { console.warn('[TeamMode] ensureMobaLooks failed:', e?.message || e); }
    this.map = this._makeMap(d);
    this.fx = new MobaFx(this, (id) => this._aimOf(id));
    this._aimG = this.add.graphics().setDepth(D.ground + 0.8);
    this._targetMark = this.add.ellipse(0, 0, 96, 34).setStrokeStyle(3, 0xff4a4a, 0.95).setDepth(D.ground + 0.9).setVisible(false);
    this._hoverMark = this.add.ellipse(0, 0, 88, 30).setStrokeStyle(2, 0xff8a8a, 0.85).setDepth(D.ground + 0.9).setVisible(false);
    // 4 shared silhouette outline sprites (zero postFX/FBOs, impossible to leak on old targets)
    this._hoverOutlines = [[-3.5, 0], [3.5, 0], [0, -3.5], [0, 3.5]].map(([dx, dy]) => {
      const im = this.add.image(0, 0, 'moba-ring').setVisible(false);
      im._odx = dx; im._ody = dy;
      return im;
    });
    this._aimTxt = this.add.text(0, 0, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 15, color: '#ffd23f', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5, 1).setDepth(D.numbers).setVisible(false);
    this.hud = new MobaHud(this, {
      touch: this._isTouch, map: this.map, world: this.world,
      onSkill: (slot, viaButton) => this._tryCast(slot, viaButton),
      onSkillUp: (slot) => this._releaseCast(slot), // HUD button pointer up = key up (hold / drag skills, mouse + touch)
      onUpgrade: (slot) => this._upgradeSkill(slot),
      onSpell: (slot, viaButton) => this._trySpell(slot, viaButton),
      onInfo: () => this._toggleInfo(),
      onSkillHover: (slot) => { this._hoverSlot = slot; },
      onRecall: () => this._recall(),
      onShop: () => this._toggleShop(),
      onStartNow: () => this._send('startNow'),
      onMinimap: (x, y) => this._minimapTap(x, y), // v6.1: also aims an armed global skill
      onMinimapView: (x, y, phase) => this._minimapView(x, y, phase), // Pass 2 RP-08
      onCamToggle: () => this._toggleCamLock(),
      onScoreboard: () => this._setScoreboard(!this._sbOpen),
      onChat: () => this._openChat(),
      onAttack: () => this._attackNearest(),
      onStick: (dir) => { this._stickDir = dir; },
      onLeave: () => this._goMenu(),
      onFx: () => this._cycleFxPref(),
      onRollback: () => this._rollback(),
      onVote: (yes) => this._castVote(yes),
    });
    this._initQuality();
    this.hud.setCamLocked?.(this._camLocked);
    try { this.info = new InfoPanel(this, { onClose: () => { } }); } catch (e) { console.warn('[TeamMode] InfoPanel failed:', e?.message); this.info = null; }
    try {
      this.augmentPanel = new AugmentPanel(this, {
        onPick: (id) => { this._send('augmentPick', { id }); AudioManager.reward?.(); },
        onReroll: (slot) => { this._send('augmentReroll', Number.isInteger(slot) ? { slot } : {}); AudioManager.uiClick?.(); },
      });
    } catch (e) { console.warn('[TeamMode] AugmentPanel failed:', e?.message); this.augmentPanel = null; }
    this._setupInput();
    this._buildChatInput();
    this._loadUiModules();
    this.events.once('shutdown', () => this._cleanup());
    // Review fix 3: a phone resuming from sleep must not look like a dead link to the watchdog.
    this._onVis = () => { if (document.visibilityState === 'visible') { this._lastRxAt = Date.now(); this._stallAt = 0; } };
    document.addEventListener('visibilitychange', this._onVis);
    this._onBeforeUnload = (e) => {
      if (this._phase === 'playing' && !this._ended && !this._shuttingDown) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', this._onBeforeUnload);
    this.cameras.main.centerOn(this.world.fountain.blue.x, this.world.fountain.blue.y);

    // Only data decides (main.js reads the deep link once) — a later PLAY AGAIN in
    // the same page must not stay offline. { room } = handed over by TeamSelectScene.
    this.cameras.main.setVisible(false); // no world until the phase is 'playing'
    if (this._startWorld(d)) { /* a subclass (Story Mode) runs its own world */ }
    else if (d.room) this._adoptRoom(d.room, this._visit, { pending: d.pending });
    else if (d.offline) this._startOffline(d);
    else this._connect();
  }

  // ───────────────────────── cameras ─────────────────────────
  _setupCameras() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.world.w, this.world.h);
    this._zoom = this._isTouch ? 0.72 : 0.8;
    cam.setZoom(this._zoom);
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this._onAdded = (go) => { this._camQ.push(go); };
    this.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, this._onAdded);
    this.events.on(Phaser.Scenes.Events.PRE_RENDER, this._classifyCams, this);
  }

  /** World objects → main camera only; screen-pinned (scrollFactor 0) → HUD camera only. */
  _classifyCams() {
    const q = this._camQ;
    if (!q.length) return;
    const main = this.cameras.main, ui = this.uiCam;
    if (main && ui) {
      for (let i = 0; i < q.length; i++) {
        const go = q[i];
        if (!go || !go.scene) continue;
        if (go.parentContainer) { go.cameraFilter = 0; continue; }
        go.cameraFilter = go.scrollFactorX === 0 ? main.id : ui.id;
      }
    }
    q.length = 0;
  }

  _setGray(on) {
    const cam = this.cameras.main;
    if (on && this._lowFx) return; // low effects: skip the full-screen post pass
    if (on && !this._grayFx && cam?.postFX) {
      try { this._grayFx = cam.postFX.addColorMatrix(); this._grayFx.grayscale(0.9); } catch (_) { this._grayFx = null; }
    } else if (!on && this._grayFx) {
      try { cam.postFX.remove(this._grayFx); } catch (_) { /* camera gone */ }
      this._grayFx = null;
    }
  }

  // ───────────────────────── connection ─────────────────────────
  async _connect() {
    if (typeof Colyseus === 'undefined') { this._connFail('the Colyseus client did not load'); return; }
    const url = serverUrl(), visit = this._visit;
    this.hud.setStatus(`connecting to ${url} …`);
    try {
      this.client = new Colyseus.Client(url);
      // Deep link: lock the champion immediately; the server runs select + loading.
      // No ?spells= / data.spells → the player's saved picks (uiKit, owned by the UI agent; optional).
      if (this._spellPrefs) {
        try {
          const kit = await import('../ui/moba/uiKit.js');
          const sp = kit.loadSpellPrefs?.(validSpellPair, this.mySpells);
          if (Array.isArray(sp) && validSpellPair(sp[0], sp[1])) this.mySpells = sp.slice(0, 2);
        } catch (_) { /* keep defaults */ }
      }
      const room = await this.client.joinOrCreate('team', { name: this.playerName, champ: this.myChamp, autoLock: true, hat: SaveManager.getHat?.() || '', pid: getPid() });
      if (this._shuttingDown || visit !== this._visit) { try { room.leave(); } catch (_) { /* ignore */ } return; }
      this._adoptRoom(room, visit, { fresh: true });
      // Pass 2 RP-06: the queue now waits 30 s for others — a deep link is "ready" at once
      // (alone it starts right away; with others it starts when they are ready too).
      try { room.send('startNow'); } catch (_) { /* closed */ }
      // Lobby / select only (the server ignores it later): our D / F picks.
      try { room.send('spells', { d: this.mySpells[0], f: this.mySpells[1] }); } catch (_) { /* closed */ }
    } catch (e) {
      if (this._shuttingDown || visit !== this._visit) return;
      console.warn('[TeamMode] join failed:', e?.message || e);
      const je = joinError(e);
      if (je.code === 'DUP_TAB') { this._dupTabModal(); return; }
      if (je.code === 'IN_MATCH') { this._goLobbyRejoin(); return; }
      this._connFail(e?.message || String(e));
    }
  }

  /** Pass 2 RP-03: this player is already playing in another tab. */
  _dupTabModal() {
    this.hud.setStatus('');
    this.hud.modal({
      title: DUP_TAB_TEXT.title, body: DUP_TAB_TEXT.body,
      buttons: [
        { label: '▶ PLAY HERE', color: 0x7ed957, fn: async () => { this.hud.closeModal(); this.hud.setStatus('closing the other tab…'); await takeover(); setTimeout(() => { if (!this._shuttingDown) this._connect(); }, 400); } },
        { label: '☰ MENU', color: 0x8a94a8, fn: () => this._goMenu() },
      ],
    });
  }

  /** Pass 2 RP-05: still seated in a running match → the Team hub offers REJOIN. */
  _goLobbyRejoin() { this._cleanup(); this.scene.start('TeamLobbyScene', { rejoin: true }); }

  /** Take over a joined room (deep link join, or handed over by TeamSelectScene — no re-join). */
  _adoptRoom(room, visit, { fresh = false, pending = null, rejoin = false } = {}) {
    this.room = room;
    // Pass 2 RP-05: remember the match for REJOIN (the token changes after every reconnect).
    if (room.roomId && room.reconnectionToken && room.state?.phase !== 'ended') saveMatch({ roomId: room.roomId, token: room.reconnectionToken, champ: this.myChamp, custom: !!room.state?.custom });
    this._wantHistory = fresh && !rejoin; // a rejoin keeps the chat already on screen
    this.localId = room.sessionId;
    const add = (u) => { if (typeof u === 'function') this._unsubs.push(u); };
    this._lastRxAt = Date.now();
    for (const type of MSG_TYPES) {
      add(room.onMessage(type, (m) => { if (!this._shuttingDown && visit === this._visit) { this._lastRxAt = Date.now(); this._onMsg(type, m ?? {}); } }));
    }
    const onPatch = () => { this._lastRxAt = Date.now(); };
    try { room.onStateChange(onPatch); this._unsubs.push(() => room.onStateChange?.remove?.(onPatch)); } catch (_) { /* older client */ }
    add(room.onMessage('*', () => { /* unknown message types: ignore quietly */ }));
    const onLeave = (code) => {
      if (this._shuttingDown || visit !== this._visit || this.room !== room) return; // an old visit's / old room closing late
      const token = room.reconnectionToken || '';
      this.room = null;
      if (this._phase !== 'ended') this._connLost(code, token);
    };
    const onError = (code, msg) => { if (!this._shuttingDown && visit === this._visit) console.warn('[TeamMode] room error', code, msg); };
    room.onLeave(onLeave);
    room.onError(onError);
    this._unsubs.push(() => room.onLeave?.remove?.(onLeave), () => room.onError?.remove?.(onError));
    // hello/welcome is once per client and no earlier scene sends it, so ask on every adopt: the
    // welcome carries `reconnectS` (EP-07). A reconnect is a NEW server Client → it answers again.
    try { room.send('hello'); } catch (_) { /* closed — onLeave reports it */ }
    // Clock: `time` samples (§3.6) — 3 quick ones, then every TIME_SYNC_MS; smallest RTT wins.
    const ping = () => { if (!this._shuttingDown && visit === this._visit && this.room === room) { try { room.send('time', { t: Date.now() }); } catch (_) { /* closed */ } } };
    ping();
    this.time.delayedCall(700, ping);
    this.time.delayedCall(1500, ping);
    const pingEvt = this.time.addEvent({ delay: TIME_SYNC_MS, loop: true, callback: ping });
    this._unsubs.push(() => pingEvt.remove(false));
    // Messages TeamSelectScene received between the phase patch and the handoff.
    if (Array.isArray(pending)) {
      for (const p of pending) if (p && MSG_TYPES.includes(p.type)) { try { this._onMsg(p.type, p.msg ?? {}); } catch (e) { console.warn('[TeamMode] pending replay failed', p.type, e?.message); } }
    }
    this.hud.setStatus('');
    if (room.connection && room.connection.isOpen === false) { this.room = null; this._connLost('closed', room.reconnectionToken || ''); }
  }

  _connFail(why) {
    this.hud.setStatus('');
    this.hud.modal({
      title: "Can't reach the Team Mode server",
      body: `${String(why).slice(0, 120)}\nPractice offline against bots instead?`,
      buttons: [
        { label: '🤖 PRACTICE OFFLINE', color: 0x7ed957, fn: () => this._startOffline() },
        { label: '☰ MENU', color: 0x8a94a8, fn: () => this._goMenu() },
      ],
    });
  }

  /** §3.3: a non-consented drop while the server keeps our seat (welcome.reconnectS) → reconnect. */
  _connLost(code, token = '') {
    if (this._shuttingDown || this._sim || this._reconn) return;
    if (code === CLOSE_TAKEN_OVER) { // Pass 2: PLAY HERE in another tab took this seat
      this._setScoreboard(false); this.shop?.close?.(); this.info?.close?.();
      this.hud.modal({ title: DUP_TAB_TEXT.title, body: DUP_TAB_TEXT.kicked, buttons: [{ label: '☰ MENU', color: 0x39c2ff, fn: () => this._goMenu() }] });
      return;
    }
    const graceS = Number(this._reconnectS) || 0;
    const consented = code === 1000 || code === 4000;
    if (!consented && token && graceS > 0 && this._phase !== 'ended') { this._startReconnect(token, graceS); return; }
    this._lostModal(`The connection to the match was lost (code ${code}).`);
  }

  _lostModal(body, title = 'Disconnected') {
    this._setScoreboard(false); this.shop?.close?.(); this.info?.close?.();
    this.hud.modal({
      title, body: `${body}\nPractice offline against bots instead?`,
      buttons: [
        { label: '🤖 PRACTICE', color: 0x7ed957, fn: () => this._restartOffline() },
        { label: '☰ MENU', color: 0x39c2ff, fn: () => this._goMenu() },
      ],
    });
  }

  /** The online match is gone — start a fresh offline practice with the same champion. */
  _restartOffline() {
    const data = { offline: true, champ: this.myChamp, name: this.playerName, spells: this.mySpells };
    this._cleanup();
    this.scene.start('TeamModeScene', data);
  }

  _startReconnect(token, graceS) {
    const visit = this._visit;
    const r = { left: graceS, attempts: 0, loop: null };
    this._reconn = r;
    for (const u of this._unsubs) { try { u(); } catch (_) { /* old room listeners */ } }
    this._unsubs = [];
    this._dropInputs();
    this._setScoreboard(false); this.shop?.close?.(); this.info?.close?.();
    this.hud.modal({
      title: '📶 Wi-Fi went to lunch — reconnecting…', body: this._reconnBody(),
      buttons: [{ label: '☰ MENU', color: 0x8a94a8, fn: () => this._goMenu() }],
    });
    const alive = () => !this._shuttingDown && visit === this._visit && this._reconn === r;
    r.loop = reconnectLoop({
      token, graceS, url: serverUrl(),
      onTick: (left, attempts) => { if (alive()) { r.left = left; r.attempts = attempts; } },
      onSuccess: (room, client) => {
        if (!alive()) { try { room.leave(); } catch (_) { /* ignore */ } return; }
        this._reconn = null;
        this.client = client;
        this._resetWorld();
        this.hud.closeModal();
        this._adoptRoom(room, this._visit, { fresh: true, rejoin: true });
        this.hud.toast('🔌 Back online — the bot handed your laptop back', '#7ed957', 2600);
        AudioManager.reward?.();
      },
      onFail: (why) => {
        if (!alive()) return;
        this._reconn = null;
        if (why === 'gone') this._matchOverModal();
        else this._lostModal('Connection lost. Your laptop now belongs to a bot.', '📶 Could not reconnect');
      },
    });
  }

  /** Review fix 5: the room is gone (match ended / disposed while we were away). */
  _matchOverModal() {
    this._setScoreboard(false); this.shop?.close?.(); this.info?.close?.();
    this.hud.modal({
      title: '🏁 The match is over',
      body: 'It ended while you were offline — the bot finished your shift.\nQueue up again?',
      buttons: [
        { label: '▶ PLAY AGAIN', color: 0x7ed957, fn: () => this._playAgain() },
        { label: '☰ MENU', color: 0x39c2ff, fn: () => this._goMenu() },
      ],
    });
  }

  _reconnBody() {
    const r = this._reconn;
    return `Mạng lag quá, đợi xíu… ${r ? r.left : 0}s\nA bot is holding your seat${r?.attempts ? ` · attempt ${r.attempts}` : ''}`;
  }

  /** Per frame: reconnect countdown, or the stalled-link watchdog. */
  _tickReconnect() {
    const r = this._reconn;
    if (r) { if (this.hud.modalOpen) this.hud.modalSet({ body: this._reconnBody() }); return; }
    // Watchdog: the server patches ≥ 10 Hz while playing — silence means the link is dead (a dead
    // Wi-Fi leaves the socket CLOSING without onLeave). Two stages: STALL_MS of silence → ping +
    // one extra STALL_GRACE_MS window (a phone resuming from sleep catches up), then drop.
    const room = this.room;
    if (!room || this._sim || this._phase !== 'playing' || this._ended) { this._stallAt = 0; return; }
    const quiet = Date.now() - (this._lastRxAt || Date.now());
    if (quiet <= STALL_MS) { this._stallAt = 0; return; }
    if (!this._stallAt) { this._stallAt = Date.now(); try { room.send('time', { t: Date.now() }); } catch (_) { /* closing */ } return; }
    if (Date.now() - this._stallAt < STALL_GRACE_MS) return;
    this._stallAt = 0;
    const token = room.reconnectionToken || '';
    this.room = null; // its late onLeave is ignored (this.room !== room)
    try { room.connection?.close?.(); } catch (_) { /* already closing */ }
    console.warn('[TeamMode] no server traffic — treating as a drop');
    this._connLost(4001, token);
  }

  /** Forget queued input that names the old room's state. */
  _dropInputs() {
    this._moveDest = null; this._movePath = null; this._pendingOrder = null; this._pendingCast = null;
    this._castQueue = []; this._hoverEnemy = null; this._stickDir = null; this._mouseHeld = false; this._replan = false;
  }

  /** Reconnected: the new room replays the full state — drop every view so nothing is duplicated. */
  _resetWorld() {
    this._setHoverOutline?.(null, '');
    this._setHoverCursor?.('');
    if (this._relicViews) { for (const rv of this._relicViews.values()) { try { rv.c.destroy(); } catch (_) { } } this._relicViews.clear(); }
    this._lastOfferJson = ''; this._cachedOffer = null;
    this._lastAugCsv = ''; this._cachedAugs = [];
    this._lastRelicsJson = ''; this._cachedRelics = null;
    for (const v of this.views.champs.values()) { try { v.destroy(); } catch (_) { /* gone */ } }
    for (const v of this.views.units.values()) { try { v.destroy(); } catch (_) { /* gone */ } }
    for (const v of this.views.structs.values()) { try { v.destroy(); } catch (_) { /* gone */ } }
    this.views.champs.clear(); this.views.units.clear(); this.views.structs.clear();
    this._liveCamps.clear(); this._mine.clear(); this._trailAt.clear();
    this._dropInputs();
    this._worldReady = false; this._pred = null; this._myPetId = null; this._meHidden = null;
    this._bestRtt = Infinity; // fresh clock samples from the new connection
    this._vote = null; this._voteMine = null;
    this.hud.showVote(null);
    this._setGray(false); this._meDead = false;
  }

  // ── Story Mode 2.0 hooks (2026-11-25): 5v5 defaults; StoryWorldScene overrides them ──
  /** The floor: size, fountains, bushes, nav (src/entities/moba/world.js). */
  _makeWorld(d) { return WORLD_5V5; }
  /** The static map renderer (MobaMap API: update, rustle, setBushFocus, setQuality, drawMinimap). */
  _makeMap(d) { return new MobaMap(this); }
  /** Start a custom world instead of online / offline 5v5 → true when handled. */
  _startWorld(d) { return false; }

  _startOffline(d = {}) {
    this.hud.closeModal();
    const lq = new URLSearchParams(window.location.search).get('lobby');
    const lobbyMs = lq != null && Number.isFinite(Number(lq)) ? Number(lq) : 0; // v3: straight to playing
    this._sim = new OfflineSim({
      champ: this.myChamp, name: this.playerName, lobbyMs, spells: this.mySpells, hat: SaveManager.getHat?.() || '',
      allies: Array.isArray(d.allies) ? d.allies : null, enemies: Array.isArray(d.enemies) ? d.enemies : null,
      sandbox: !!d.sandbox,
      emit: (type, m) => { if (!this._shuttingDown) this._onMsg(type, m ?? {}); },
    });
    this.localId = this._sim.localId;
    this._sim.receive('hello');
    if (d.sandbox) {
      this.hud.setStatus(t('prac.status'), '#ffb347');
      this._buildPracticeBar();
    }
  }

  _buildPracticeBar() {
    if (!this._sim || this._pracBar) return;
    const right = (this.scale?.width || 1280) - 10, gap = 6;
    const mkRow = (y, specs) => {
      let rx = right;
      return specs.map(([key, w, label, color, fn]) => {
        const cx = rx - w / 2;
        rx -= w + gap;
        return [key, this.hud._button(cx, y, w, 24, label, color, fn, 52, 10)];
      });
    };
    const row1 = mkRow(22, [
      ['hp', 94, '', 0x7ed957, () => { this._sim.receive('setGodMode', { enabled: !this._sim.godMode }); this._syncPracticeBar(); AudioManager.uiClick?.(); }],
      ['mp', 118, '', 0x39c2ff, () => { this._sim.receive('setNoMana', { enabled: !this._sim.noMana }); this._syncPracticeBar(); AudioManager.uiClick?.(); }],
      ['cd', 118, '', 0x39ff14, () => { this._sim.receive('setNoCd', { enabled: !this._sim.noCd }); this._syncPracticeBar(); AudioManager.uiClick?.(); }],
      ['swap', 104, t('prac.swap'), 0xffb347, () => { AudioManager.uiClick?.(); this._openChampSwapModal(); }],
    ]);
    const row2 = mkRow(50, [
      ['clearDummy', 78, t('prac.clearDummy'), 0xff5e5e, () => { this._sim.receive('clearDummies'); AudioManager.uiClick?.(); }],
      ['dummy', 88, t('prac.dummy'), 0x39ff14, () => { this._sim.receive('spawnDummy'); AudioManager.uiClick?.(); }],
      ['wave', 54, '+30s', 0xb084ff, () => { for (let i = 0; i < 300; i++) this._sim.update(100); AudioManager.uiClick?.(); }],
      ['gold', 70, t('prac.gold'), 0xffd23f, () => { this._sim.debug('gold', 5000); AudioManager.uiClick?.(); }],
      ['lv', 58, t('prac.lvUp'), 0xffd23f, () => {
        const me = this._me(); if (me) this._sim.debug('level', Math.min(R.MAX_LEVEL, (me.level || 1) + 1));
        AudioManager.uiClick?.();
      }],
    ]);
    const map = Object.fromEntries([...row1, ...row2]);
    this._pracBar = { ...map, all: Object.values(map) };
    this._pracLangUnsub = onLangChange(() => this._syncPracticeBar());
    this._syncPracticeBar();
  }

  _syncPracticeBar() {
    const p = this._pracBar;
    if (!p || !this._sim) return;
    p.swap?._label?.setText(t('prac.swap'));
    p.lv?._label?.setText(t('prac.lvUp'));
    p.gold?._label?.setText(t('prac.gold'));
    p.dummy?._label?.setText(t('prac.dummy'));
    p.clearDummy?._label?.setText(t('prac.clearDummy'));
    const syncToggle = (btn, label, on, onColor, onCss) => {
      if (!btn) return;
      btn._label?.setText(`${label}:${on ? 'ON' : 'OFF'}`).setColor(on ? onCss : '#8a98b0');
      btn._bg?.setStrokeStyle(1.8, on ? onColor : 0x4b5a73, on ? 0.95 : 0.7);
    };
    syncToggle(p.cd, t('prac.noCd'), this._sim.noCd, 0x39ff14, '#39ff14');
    syncToggle(p.mp, t('prac.noMana'), this._sim.noMana, 0x39c2ff, '#39c2ff');
    syncToggle(p.hp, t('prac.noDmg'), this._sim.godMode, 0x7ed957, '#7ed957');
    this.hud?.setStatus(t('prac.status'), '#ffb347');
  }

  _state() { return this._sim ? (this._sim.clientState || this._sim.state) : this.room?.state; }
  _me() { const st = this._state(); return st?.champions?.get?.(this.localId) || null; }
  _srvNow() { return Date.now() + (this._clockOffset || 0); }

  _send(type, msg) {
    if (this._shuttingDown) return;
    if (this._sim) { this._sim.receive(type, msg); return; }
    if (!this.room) return;
    try { this.room.send(type, msg); } catch (e) { console.warn('[TeamMode] send failed', type, e?.message); }
  }

  // ───────────────────────── UI modules (UI agent) ─────────────────────────
  async _loadUiModules() {
    const visit = this._visit;
    const load = async (path, name) => {
      try {
        const mod = await import(path);
        return mod[name] || mod.default || null;
      } catch (e) {
        console.warn(`[TeamMode] ${path} unavailable — using a fallback`);
        return null;
      }
    };
    const [Shop, Score, End] = await Promise.all([
      load('../ui/moba/ShopPanel.js', 'ShopPanel'),
      load('../ui/moba/Scoreboard.js', 'Scoreboard'),
      load('../ui/moba/EndScreen.js', 'EndScreen'),
    ]);
    if (this._shuttingDown || visit !== this._visit) return;
    const make = (Cls, Fallback, ...args) => {
      if (Cls) {
        try { return new Cls(this, ...args); } catch (e) { console.warn('[TeamMode] UI module failed, using fallback:', e?.message); }
      }
      return new Fallback(this, ...args);
    };
    this.shop = make(Shop, FallbackShopPanel, { onBuy: (id) => this._buy(id), onSell: (slot) => this._sell(slot) });
    this.scoreboard = make(Score, FallbackScoreboard);
    this.endScreen = make(End, FallbackEndScreen, { onPlayAgain: () => this._playAgain(), onMenu: () => this._goMenu() });
    if (this._rankRes) { try { this.endScreen.setRank?.(this._rankRes); } catch (_) { /* fallback */ } }
    if (this._hudChamp) { try { this.shop.setChampion?.(this._hudChamp); } catch (_) { /* optional extra */ } }
    if (this._endPending) { const p = this._endPending; this._endPending = null; this._showEndScreen(p); }
  }

  // ───────────────────────── server messages ─────────────────────────
  _onMsg(type, m) {
    this._msgStats[type] = (this._msgStats[type] || 0) + 1; // harness / debugging aid
    switch (type) {
      case 'welcome':
        // Rough first guess only; `time` samples (RTT-corrected) take over.
        if (Number.isFinite(m.serverNow) && !this._clockSet && this._bestRtt === Infinity) {
          this._clockOffset = m.serverNow - Date.now(); this._clockSet = true;
        }
        if (m.team === 'blue' || m.team === 'red') this.myTeam = this.myTeam || m.team;
        if (isChampionId(m.champ)) this.myChamp = m.champ;
        if (Number.isFinite(m.reconnectS)) this._reconnectS = m.reconnectS; // EP-07: the server holds our seat this long
        break;
      case 'time': {
        const now = Date.now(), rtt = now - m.t;
        if (!Number.isFinite(m.serverNow) || !Number.isFinite(m.t) || rtt < 0 || rtt > 30000) break;
        if (rtt < this._bestRtt) { this._bestRtt = rtt; this._clockOffset = m.serverNow + rtt / 2 - now; this._clockSet = true; }
        break;
      }
      case 'atk': this._onAtk(m); break;
      case 'fx': this._onFx(m); break;
      case 'feed': this._onFeed(m); break;
      case 'announce':
        if (!m.title) return;
        this.hud.banner({ title: String(m.title), sub: m.sub, color: m.color, big: !!m.big });
        if (m.big) AudioManager.reward?.(); else AudioManager.combo?.(2);
        break;
      case 'vote': this._onVote(m); break;
      case 'rank': // Pass 2 RP-13: ranked result (sent at the end of the match)
        this._rankRes = m;
        try { this.endScreen?.setRank?.(m); } catch (_) { /* fallback end screen */ }
        break;
      case 'voteEnd': {
        const was = this._vote;
        this._vote = null; this._voteMine = null;
        this.hud.showVote(null);
        if (m.passed) this.hud.toast("🔙 Rollback approved — shipping last Friday's build", '#ffb347', 2400);
        else if (was) this.hud.toast('Rollback rejected. The sprint continues 😩', '#ffd23f', 2400);
        break;
      }
      case 'voteDeny':
        this.hud.toast(VOTE_DENY[m.reason] || '🏳 Rollback not possible right now', '#ffb347', 2200);
        if (!this._vote) this._voteMine = null;
        break;
      case 'gold':
        if (Number.isFinite(m.n) && Number.isFinite(m.x) && Number.isFinite(m.y)) this.fx.gold(m.x, m.y, Math.round(m.n));
        break;
      case 'dummyDps':
        this.hud.setStatus(`DUMMY · Hit: ${m.dmg} · 3s: ${m.total} · DPS: ${m.dps}`, '#7ed957');
        break;
      case 'chat':
        this.hud.chat({ name: m.name, text: m.text, kind: m.kind, mine: !!this.localId && m.sid === this.localId });
        break;
      case 'chatHistory':
        if (!this._wantHistory) break; // handed-over / rejoined rooms already show their chat
        if (Array.isArray(m)) for (const c of m.slice(-5)) this.hud.chat({ name: c?.name, text: c?.text, kind: c?.kind });
        break;
      default: break;
    }
  }

  _onAtk(arr) {
    if (!Array.isArray(arr)) return;
    for (const a of arr) {
      if (!a) continue;
      const fv = this._viewOf(a.f), tv = this._viewOf(a.t);
      if (!fv || !tv) continue;
      if (a.f === this.localId) { this._markMine(a.t); AudioManager.teamAttack?.(!!a.r); }
      const tp = tv.aimPoint();
      if (fv instanceof ChampionView) fv.faceTo = tp.x;
      if (!this.fx.onScreen(fv.x, fv.y, 400) && !this.fx.onScreen(tp.x, tp.y, 400)) continue;
      if (a.r) {
        let from, color, size, speed;
        if (fv instanceof StructureView) { from = fv.muzzle(); color = 0xff8a3c; size = 20; speed = R.ATK_PROJ_SPEED; }
        else if (fv instanceof ChampionView) {
          const p = fv.aimPoint(); from = { x: p.x + fv.facing * 20, y: p.y - 8 };
          color = fv.def.color; size = 15; speed = R.ATK_PROJ_SPEED;
        } else { from = fv.aimPoint(); color = teamColor(fv.team); size = fv.kind === 'siege' ? 15 : 10; speed = R.ATK_PROJ_SPEED; }
        this.fx.basic(from.x, from.y, a.t, color, size, speed);
      } else {
        const fp = fv.aimPoint();
        this.fx.slash(fp.x, fp.y, tp.x, tp.y, fv instanceof ChampionView ? fv.def.color : 0xffffff);
        this.fx.burstTex?.(tp.x, tp.y, 'moba-vfx-spark', 52, fv instanceof ChampionView ? fv.def.color : teamColor(fv.team), 200, 40);
        if (fv instanceof UnitView) fv.lunge(tp.x, tp.y);
      }
    }
  }

  _onFx(m) {
    if (m.sid && m.sid === this.localId && m.k !== 'spell' && m.k !== 'hit' && m.k !== 'knock' && m.k !== 'cc' && m.k !== 'suppress' && m.k !== 'gping') this._castSfx(m.slot);
    // v6.1: the local champion's CC timer rings (HUD status row); every v6.1 kind then reaches fx.handle through the default branch
    if ((m.k === 'cc' || m.k === 'ccBreak') && m.id && m.id === this.localId) this.hud.onCcFx?.(m);
    else if (m.k === 'revive' && m.id === this.localId) this.hud.onCcFx?.({ k: 'ccBreak', id: m.id, type: 'revive' });
    switch (m.k) {
      case 'proj': {
        if (![m.x, m.y, m.dx, m.dy].every(Number.isFinite)) return;
        const c = this._state()?.champions?.get?.(m.sid);
        const sk = c ? this._specFor(c, m.slot) : null;
        const pst = styleFor(sk, 'proj');
        this.fx.skillshot(m, !!sk?.pierce, c ? projectileTex(this, c.champ, m.slot) : null, pst);
        if (!pst) this.fx.burstTex?.(m.x, m.y, 'moba-vfx-slash', 88, Number.isFinite(m.color) ? m.color : 0x39c2ff, 260, 100);
        else castFx(this.fx, 'proj', pst, { x: m.x, y: m.y, dx: m.dx, dy: m.dy, color: m.color });
        if (m.sid === this.localId) this._myCastAt = this.time.now;
        break;
      }
      case 'circle':
        if (Number.isFinite(m.x) && Number.isFinite(m.y)) {
          const cst = styleFor(this._skillOf(m), 'circle');
          if (cst && castFx(this.fx, 'circle', cst, { x: m.x, y: m.y, r: m.r, inner: m.inner, delay: m.delay || 0, color: m.color })) {
            this.fx.telegraph(m, true); // thin warning ring only; the style draws the windup + impact
            break;
          }
          this.fx.telegraph(m);
          this.fx.burstTex?.(m.x, m.y, 'moba-vfx-magic', Math.max(104, (m.r || 80) * 2), Number.isFinite(m.color) ? m.color : 0xffd23f, 460, 90);
        }
        break;
      case 'tgt': {
        const tst = styleFor(this._skillOf(m), 'tgt');
        if (tst) castFx(this.fx, 'tgt', tst, m);
        break;
      }
      case 'dash': {
        const dst = styleFor(this._skillOf(m), 'dash');
        if (!(dst && castFx(this.fx, 'dash', dst, m))) {
          this.fx.dash(m);
          if (Number.isFinite(m.x0) && Number.isFinite(m.y0)) this.fx.burstTex?.(m.x0, m.y0, 'moba-vfx-flare', 100, 0x39ff14, 300, 45);
        }
        if (m.sid === this.localId) { this._moveDest = null; this._dashUntil = this.time.now + 450; }
        break;
      }
      case 'blink':
        const kst = styleFor(this._skillOf(m), 'blink');
        if (!(kst && castFx(this.fx, 'blink', kst, m))) {
          this.fx.blink(m);
          if (Number.isFinite(m.x1) && Number.isFinite(m.y1)) this.fx.burstTex?.(m.x1, m.y1, 'moba-vfx-flare', 110, 0x39ff14, 320, 60);
        }
        if (m.sid === this.localId && this._pred && Number.isFinite(m.x1) && Number.isFinite(m.y1)) {
          this._moveDest = null; this._pred.x = m.x1; this._pred.y = m.y1;
        }
        break;
      case 'buff': {
        const v = this.views.champs.get(m.sid);
        if (!v || v.dead) break;
        const bst = styleFor(this._skillOf(m), 'buff');
        if (!(bst && castFx(this.fx, 'buff', bst, { x: v.x, y: v.y, color: m.color }))) this.fx.buff(v.x, v.y, Number.isFinite(m.color) ? m.color : 0xffffff);
        break;
      }
      case 'heal':
        // A styled buff (Ops W, Hira W, Brew W ...) already draws its own heal visuals.
        if (Number.isFinite(m.x) && Number.isFinite(m.y) && !styleFor(this._skillOf(m), 'buff')) this.fx.heal(m);
        break;
      case 'zap': if ([m.x0, m.y0, m.x1, m.y1].every(Number.isFinite)) this.fx.zap(m.x0, m.y0 - 40, m.x1, m.y1 - 40, m.color); break;
      case 'zone': {
        if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) return;
        const c = this._state()?.champions?.get?.(m.sid);
        const zsk = c ? this._specFor(c, m.slot) : null;
        this.fx.zone(m, zsk ? (styleFor(zsk, 'zone') ? null : zsk.icon) : null);
        const zst = !m.trap && styleFor(zsk, 'zone');
        if (zst && castFx(this.fx, 'zone', zst, { x: m.x, y: m.y, r: m.r, ms: m.ms, color: m.color })) break;
        this.fx.burstTex?.(m.x, m.y, 'moba-vfx-magic', Math.max(110, (m.r || 80) * 2.1), Number.isFinite(m.color) ? m.color : 0x39c2ff, 500, 90);
        break;
      }
      case 'trapEnd': this.fx.endZoneByTid?.(m.tid); break;
      case 'knock': {
        const mine = !!this.localId && m.id === this.localId;
        this.fx.knock(m, mine);
        if (Number.isFinite(m.x1) && Number.isFinite(m.y1)) this.fx.burstTex?.(m.x1, m.y1, 'moba-vfx-spark', 92, 0xffd23f, 260, 60);
        if (mine) {
          // The server keeps the move order through a knockback: keep the destination
          // and re-plan from wherever we land once the displacement is over.
          this._movePath = null; this._replan = !!this._moveDest;
          this._dashUntil = this.time.now + Math.min(1500, Number.isFinite(m.ms) ? m.ms : 200) + 250;
          if (m.wall) AudioManager.hit?.();
        }
        break;
      }
      case 'petatk': {
        const pv = this.views.units.get(m.id), tv = this._viewOf(m.t);
        if (!pv || !tv || pv.removed) return;
        const st = this._state(), pu = st?.units?.get?.(m.id);
        const owner = pu?.owner ? st.champions?.get?.(pu.owner) : null;
        const a = pv.aimPoint(), b = tv.aimPoint();
        this.fx.zap(a.x, a.y, b.x, b.y, (owner && CHAMPIONS[owner.champ]?.color) || 0x00e5ff);
        if (pu?.owner && pu.owner === this.localId) this._markMine(m.t);
        break;
      }
      case 'spell': {
        if (!Number.isFinite(m.x0) || !Number.isFinite(m.y0)) return;
        const sp = SPELLS[m.spell];
        this.fx.spell(m, sp?.color ?? 0xffffff);
        const mine = !!this.localId && m.sid === this.localId;
        if (m.spell === 'flash') {
          if (mine && this._pred && Number.isFinite(m.x1) && Number.isFinite(m.y1)) {
            this._moveDest = null; this._movePath = null; this._pred.x = m.x1; this._pred.y = m.y1;
          }
          const v = this.views.champs.get(m.sid);
          if (v && !mine && Number.isFinite(m.x1)) v.setDisplayPos?.(m.x1, m.y1); // snap, don't slide through the wall
          if (mine || this.fx.onScreen(m.x1, m.y1, 200)) AudioManager.uiClick?.();
        } else if (m.spell === 'smite' && mine) AudioManager.hit?.();
        break;
      }
      case 'hit': {
        const v = this._viewOf(m.id);
        if (!v) return;
        const p = v.aimPoint();
        this.fx.hit(p.x, p.y, Number.isFinite(m.color) ? m.color : 0xffffff);
        this.fx.endShotNear(p.x, p.y, m.color);
        v.flash?.();
        if (this.time.now - this._myCastAt < 1600) this._markMine(m.id);
        break;
      }
      // v6: teleports of the local champion must also move the prediction (portal exit, rewind); the visuals stay in fx.handle
      case 'tp':
        if (m.id === this.localId) this._snapPred(m.x1, m.y1);
        this.fx.handle?.(m); break;
      case 'rewind': {
        const mine = Array.isArray(m.list) ? m.list.find((e) => e && e.id === this.localId) : null;
        if (mine) this._snapPred(mine.x1, mine.y1);
        this.fx.handle?.(m); break;
      }
      default: this.fx.handle?.(m); break; // v6 kit fx kinds (charge, obj, tp, rewind ...): VFX developer owns handle()
    }
  }

  _snapPred(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this._moveDest = null; this._movePath = null;
    if (this._pred) { this._pred.x = x; this._pred.y = y; }
  }

  _isChampSid(id) { const st = this._state(); return !!(st?.scores?.get?.(id) || st?.champions?.get?.(id)); }

  _onFeed(m) {
    if (!m.text) return;
    const me = this.localId;
    this.hud.feed({ text: String(m.text), color: m.color, mine: !!me && (m.a === me || m.b === me) });
    // EP-09 highlight: the first champion death of the match (a = killer champion, b = victim).
    if (!this._firstBloodDone && m.b && this._isChampSid(m.b)) {
      this._firstBloodDone = true;
      this._firstBlood = m.a && this._isChampSid(m.a) ? m.a : '';
    }
    if (me && m.b === me) { this.hud.setDeathTitle(`💀 ${m.text}`); if (!AudioManager.teamDeath) AudioManager.failure?.(); }
    else if (me && m.a === me) AudioManager.reward?.();
  }

  // ───────────────────────── input ─────────────────────────
  _setupInput() {
    this.input.mouse?.disableContextMenu();
    if (this._isTouch) this.input.addPointer(2);
    this.input.on('pointerdown', this._onPointerDown, this);
    this.input.on('pointermove', this._onPointerMove, this);
    this.input.on('pointerup', this._onPointerUp, this);
    this.input.on('pointerupoutside', this._onPointerUp, this);
    this.input.on('gameout', () => { this._pointerOut = true; });
    this.input.on('gameover', () => { this._pointerOut = false; });
    this.input.on('wheel', (p, over, dx, dy) => {
      if (this._isTouch || this.shop?.isOpen || this._sbOpen) return;
      this._zoom = Math.max(0.6, Math.min(1.1, this._zoom - dy * 0.0008));
      this.cameras.main.setZoom(this._zoom);
    });
    const kb = this.input.keyboard;
    kb.on('keydown', this._onKeyDown, this);
    kb.on('keyup', this._onKeyUp, this);
    kb.addCapture(KEY_CAPTURES);
    this._cursors = kb.createCursorKeys();
    this.input.once('pointerdown', () => AudioManager.prime?.());
    kb.once('keydown', () => AudioManager.prime?.());
  }

  _blocked() { return this._shuttingDown || this._chatActive || this.hud.modalOpen || this._phase !== 'playing' || this._ended; }
  _canAct() { const me = this._me(); return !!me && !me.dead && !this._blocked(); }

  _onPointerDown(p, over) {
    if (this._shuttingDown || (over && over.length)) return;
    // Pass 2 RP-08: middle-button drag pans the camera (and frees it).
    if (p.middleButtonDown?.() && !this._isTouch && WORLD_PHASES.has(this._phase)) {
      if (this._camLocked) this._setCamLock(false, true);
      this._midDrag = { x: p.x, y: p.y, cx: this._camFreeX, cy: this._camFreeY };
      return;
    }
    if (this._isTouch && p !== this.input.mousePointer && this.hud.stickDown(p)) { this._moveDest = null; return; }
    if (!this._canAct()) return;
    const right = p.rightButtonDown?.();
    if (this.shop?.isOpen && !right) return; // left-clicks belong to the open shop
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    this._mouseWorld = { x: wp.x, y: wp.y };
    if (!this._isTouch && !right) {
      // Desktop left-click: inspect any visible entity (ally, enemy, neutral) or clear target info on empty ground.
      const picked = this._pickEntityAt(wp.x, wp.y);
      this._selectedId = picked ? picked.id : null;
      this._updateTargetPanel(this._state());
      this._mouseHeld = false;
      return;
    }
    const target = this._pickEnemyAt(wp.x, wp.y);
    if (target) { this._attackOrder(target); this._mouseHeld = false; }
    else { this._moveOrder(wp.x, wp.y, true); this._mouseHeld = !this._isTouch || p === this.input.mousePointer; }
  }

  _onPointerMove(p) {
    if (this._midDrag) {
      if (!p.middleButtonDown?.()) this._midDrag = null;
      else {
        const z = this.cameras.main.zoom || 1;
        this._camFreeX = Math.max(0, Math.min(this.world.w, this._midDrag.cx - (p.x - this._midDrag.x) / z));
        this._camFreeY = Math.max(0, Math.min(this.world.h, this._midDrag.cy - (p.y - this._midDrag.y) / z));
        return;
      }
    }
    // Real cursor motion (not the world point shifting under a following camera) → aim follows the mouse.
    const lx = this._lastPtrX, ly = this._lastPtrY;
    if (lx === undefined || Math.abs(p.x - lx) + Math.abs(p.y - ly) > 3) { this._mouseMovedAt = this.time.now; this._lastPtrX = p.x; this._lastPtrY = p.y; }
    if (this.hud.stickMove(p)) return;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    this._mouseWorld = { x: wp.x, y: wp.y };
    if (this._mouseHeld && p.isDown && this._canAct()) {
      const now = this.time.now;
      if (now - this._dragAt > 100) { this._dragAt = now; this._moveOrder(wp.x, wp.y, false, true); }
    }
  }

  _onPointerUp(p) {
    this._midDrag = null;
    if (this.hud.stickUp(p)) return;
    this._mouseHeld = false;
  }

  _onKeyDown(ev) {
    if (this._shuttingDown || this._chatActive) return;
    const code = ev.code;
    if (code === 'Escape') { if (this._held) { this._cancelHeld(); return; } this._onEscape(); return; }
    if (this.hud.modalOpen) return;
    if (code === 'Tab') { ev.preventDefault?.(); this._setScoreboard(true); return; }
    if (code === 'Enter') { this._openChat(); return; }
    if (ev.repeat) return;
    switch (code) {
      case 'KeyQ': case 'KeyW': case 'KeyE': case 'KeyR': {
        const sl = code[3].toLowerCase();
        if (ev.shiftKey || ev.ctrlKey) {
          ev.preventDefault?.();
          ev.stopPropagation?.();
          this._upgradeSkill(sl);
        } else this._tryCast(sl, false);
        break;
      }
      case 'KeyD': case 'KeyF': this._trySpell(code[3].toLowerCase(), false); break;
      case 'KeyC': this._toggleInfo(); break;
      case 'KeyB': this._recall(); break;
      case 'KeyP': this._toggleShop(); break;
      case 'Space': this._attackNearest(); break;
      case 'KeyS': if (this._held) this._cancelHeld(); if (this._canAct()) { this._order({ type: 'stop' }); this._moveDest = null; } break;
      case 'Digit1': if (this._canAct()) this._send('active', {}); break; // Active item (Stasis / Cleanse / Veil)
      case 'Digit4': if (this._canAct()) {
        const p = this.input.activePointer;
        const wp = this.cameras.main.getWorldPoint(p.x, p.y);
        this._send('ward', { x: wp.x, y: wp.y });
      } break;
      case 'KeyG': this._sendPing(); break; // Tactical ping at cursor
      case 'KeyY': if (this._vote) this._castVote(true); else this._toggleCamLock(); break; // Pass 2: Y = camera lock (LoL)
      case 'KeyZ': this._centerHeld = true; break;                                          // Pass 2: hold Z = look at you
      case 'KeyN': if (this._vote) this._castVote(false); break;
      default: break;
    }
  }

  _onKeyUp(ev) {
    if (ev.code === 'Tab') this._setScoreboard(false); // key events only come from real keyboards
    if (this._held && (ev.code === 'KeyQ' || ev.code === 'KeyW' || ev.code === 'KeyE' || ev.code === 'KeyR')) this._releaseCast(ev.code[3].toLowerCase());
    if (ev.code === 'KeyZ' && this._centerHeld) { // released: a free camera stays on your champion
      this._centerHeld = false;
      this._camFreeX = this._camX; this._camFreeY = this._camY;
    }
  }

  // ───────────────────────── Pass 2 RP-08: camera ─────────────────────────
  _toggleCamLock() { this._setCamLock(!this._camLocked); }

  _setCamLock(locked, quiet = false) {
    this._camLocked = !!locked;
    this._camPeek = false;
    if (!locked) { this._camFreeX = this._camX || this._camFreeX; this._camFreeY = this._camY || this._camFreeY; }
    try { window.localStorage.setItem(CAM_LOCK_KEY, locked ? '1' : '0'); } catch (_) { /* session only */ }
    this.hud.setCamLocked?.(this._camLocked);
    if (!quiet) {
      this.hud.toast(locked ? '🔒 Camera locked on you (Y)'
        : (this._isTouch ? '🔓 Camera free — drag the minimap' : '🔓 Camera free — push the mouse to a screen edge · drag the minimap · hold Z = you'),
        '#ffd23f', 2600);
    }
    AudioManager.uiClick?.();
  }

  /** Minimap drag (HUD): 'down' / 'move' = look at (x, y); 'up' = a locked camera snaps back. */
  _minimapView(x, y, phase) {
    if (!WORLD_PHASES.has(this._phase)) return;
    if (phase === 'up') { this._camPeek = false; return; }
    if (this._camLocked) this._camPeek = true;
    this._camFreeX = x; this._camFreeY = y;
    if (phase === 'down') { this._camX = x; this._camY = y; } // jump there (LoL), then follow the drag
  }

  /** Single source of truth for any blocking overlay (prevents world hover/edge-pan/click bleed). */
  _hasBlockingOverlay() {
    return !!(this.hud.modalOpen || this.shop?.isOpen || this.info?.isOpen || this._sbOpen || this.augmentPanel?.isOpen || this._chatActive);
  }

  /** Free camera: the mouse at a screen edge pans (desktop only, never over the HUD's modal / shop). */
  _edgePan(dt) {
    if (this._isTouch || this._pointerOut || this._midDrag || this._hasBlockingOverlay()) return;
    if (this._camPeek) return;
    const p = this.input.activePointer;
    if (!p || (p.x === 0 && p.y === 0)) return;
    const W = this.scale.width, H = this.scale.height;
    const vx = p.x < EDGE_PAN_PX ? -1 : (p.x > W - EDGE_PAN_PX ? 1 : 0);
    const vy = p.y < EDGE_PAN_PX ? -1 : (p.y > H - EDGE_PAN_PX ? 1 : 0);
    if (!vx && !vy) return;
    const z = this.cameras.main.zoom || 1, step = (EDGE_PAN_SPEED / z) * dt; // dt in seconds (like approach())
    this._camFreeX = Math.max(0, Math.min(this.world.w, this._camFreeX + vx * step));
    this._camFreeY = Math.max(0, Math.min(this.world.h, this._camFreeY + vy * step));
  }

  _onEscape() {
    if (this._chatActive || this.augmentPanel?.isOpen) return;
    if (this.hud.modalOpen) { this.hud.closeModal(); return; }
    if (this.info?.isOpen) { this.info.close(); return; }
    if (this.shop?.isOpen) { this.shop.close(); return; }
    if (this._sbOpen) { this._setScoreboard(false); return; }
    if (this._phase === 'ended' || !WORLD_PHASES.has(this._phase)) { this._goMenu(); return; } // lobby / select / loading
    const fxLbl = () => `${t('menu.fx')}: ${String(this._fxPref || 'auto').toUpperCase()}${this._fxPref === 'auto' && this._lowFx ? ' (LOW)' : ''}`;
    const camLbl = () => (this._camLocked ? t('menu.cam.locked') : t('menu.cam.free'));
    const langLbl = () => `${t('menu.lang')}: ${getLang().toUpperCase()}`;
    const btns = [
      { label: fxLbl(), color: 0x9fdcff, fn: (btn) => { this._cycleFxPref(); btn?._label?.setText(fxLbl()); } },
    ];
    if (!this._isTouch) {
      btns.push({ label: camLbl(), color: 0xffd23f, fn: (btn) => { this._toggleCamLock(); btn?._label?.setText(camLbl()); } });
    }
    if (this._sim?.sandbox) {
      const cdLbl = () => `${t('prac.noCd')}: ${this._sim?.noCd ? 'ON' : 'OFF'}`;
      const mpLbl = () => `${t('prac.noMana')}: ${this._sim?.noMana ? 'ON' : 'OFF'}`;
      const hpLbl = () => `${t('prac.noDmg')}: ${this._sim?.godMode ? 'ON' : 'OFF'}`;
      btns.push(
        { label: cdLbl(), color: 0x39c2ff, fn: (btn) => { this._sim.receive('setNoCd', { enabled: !this._sim.noCd }); btn?._label?.setText(cdLbl()); this._syncPracticeBar(); AudioManager.uiClick?.(); } },
        { label: mpLbl(), color: 0x7ec8ff, fn: (btn) => { this._sim.receive('setNoMana', { enabled: !this._sim.noMana }); btn?._label?.setText(mpLbl()); this._syncPracticeBar(); AudioManager.uiClick?.(); } },
        { label: hpLbl(), color: 0x7ed957, fn: (btn) => { this._sim.receive('setGodMode', { enabled: !this._sim.godMode }); btn?._label?.setText(hpLbl()); this._syncPracticeBar(); AudioManager.uiClick?.(); } },
        { label: t('prac.swap'), color: 0xffb347, fn: () => this._openChampSwapModal() },
      );
    }
    btns.push(
      {
        label: langLbl(), color: 0xb084ff,
        fn: (btn) => {
          toggleLang();
          btn?._label?.setText(langLbl());
          this.hud.modalSet({ title: t('menu.title'), body: t('menu.body') });
          const mb = this.hud._modal?.btns || [];
          if (mb[0]) mb[0]._label?.setText(fxLbl());
          if (!this._isTouch && mb[1]) mb[1]._label?.setText(camLbl());
          if (mb[mb.length - 2]) mb[mb.length - 2]._label?.setText(t('menu.resume'));
          if (mb[mb.length - 1]) mb[mb.length - 1]._label?.setText(t('menu.leave'));
          AudioManager.uiClick?.();
        },
      },
      { label: t('menu.resume'), color: 0x7ed957, fn: () => this.hud.closeModal() },
      { label: t('menu.leave'), color: 0xff5e5e, fn: () => this._goMenu() },
    );
    this.hud.modal({
      title: t('menu.title'),
      body: t('menu.body'),
      buttons: btns,
    });
  }

  /** Offline practice only: open an in-match champion picker to swap champions live. */
  _openChampSwapModal() {
    if (!this._sim) return;
    const ids = Object.keys(CHAMPIONS);
    const btns = ids.map((id) => {
      const def = CHAMPIONS[id];
      const active = id === this.myChamp;
      return {
        label: active ? `[${def.name}]` : def.name,
        color: active ? 0x7ed957 : 0x39c2ff,
        fn: () => {
          this._sim.receive('switchChamp', { champ: id });
          this.hud.closeModal();
          AudioManager.uiClick?.();
        },
      };
    });
    btns.push({ label: t('menu.resume'), color: 0xff5e5e, fn: () => this.hud.closeModal() });
    this.hud.modal({
      title: t('prac.swapTitle'),
      body: t('prac.swapBody'),
      buttons: btns,
      cols: 4,
    });
  }

  _upgradeSkill(slot) {
    if (!this._canAct() || !['q', 'w', 'e', 'r'].includes(slot)) return;
    const me = this._me();
    if (!me || !(me.skillPoints > 0)) return;
    this._send('upgrade', { slot });
    AudioManager.uiClick?.();
  }

  _setScoreboard(show) {
    if (!this.scoreboard || this._ended) return;
    this._sbOpen = !!show;
    if (show) { this.scoreboard.show(); this.scoreboard.update(this._state(), this.localId); }
    else this.scoreboard.hide();
  }

  _toggleShop() {
    if (!this.shop || this._ended || this._phase !== 'playing') return;
    this.shop.toggle();
    AudioManager.uiClick?.();
  }

  _buy(id) {
    const me = this._me();
    if (!me) return;
    if (!this._canShop(me)) { this.hud.toast('🛒 Shop only in your break room (or while dead)', '#ff8a8a'); return; }
    this._send('buy', { item: id });
    AudioManager.uiClick?.();
  }

  /** Pass 2 RP-07: sell the item in inventory slot `slot` (same place rules as buying). */
  _sell(slot) {
    const me = this._me();
    if (!me || !Number.isInteger(slot)) return;
    if (!this._canShop(me)) { this.hud.toast('🛒 Sell in your break room (or while dead)', '#ff8a8a'); return; }
    this._send('sell', { slot });
    AudioManager.uiClick?.();
  }

  _canShop(me) {
    if (!me || !this.myTeam) return false;
    if (me.dead) return true;
    const p = this._pred || me, f = this.world.fountain[this.myTeam];
    return Math.hypot(p.x - f.x, p.y - f.y) <= R.FOUNTAIN_RADIUS;
  }

  // ───────────────────────── EP-21: first-buy nudge · EP-10: coaching ─────────────────────────
  /** Next affordable-in-principle item of the champion's ⭐ recommended build (not owned, not blocked). */
  _nextBuy(me) {
    const build = CHAMPIONS[me.champ]?.build || [];
    const inv = toArr(me.items);
    for (const id of build) {
      if (!ITEMS[id] || inv.includes(id)) continue;
      if (buyBlocker(inv, id)) continue;
      return ITEMS[id];
    }
    return null;
  }

  /** EP-21: first games — open the shop at 0:00 (waits for the async ShopPanel; gives up after 8 s). */
  _tickShopAssist(me, now) {
    if (now - this._shopAssistAt > 8000 || this._phase !== 'playing' || this._ended) { this._shopAssistAt = 0; return; }
    if (!this.shop || !me || this.hud.modalOpen || this._chatActive) return;
    this._shopAssistAt = 0;
    if (me.dead || !this._canShop(me) || this.shop.isOpen) return;
    this.shop.open?.();
    this.hud.toast('🛒 Starting gold! Grab the ⭐ recommended item, then walk out (P closes)', '#ffe680', 3600);
  }

  _tickBuyNudge(me, canShop) {
    let str = null;
    if (me && canShop && this._phase === 'playing' && !this._ended && !this.shop?.isOpen && !this.hud.modalOpen && !this._reconn) {
      const it = this._nextBuy(me);
      const cost = it ? (it.consumable ? it.cost : recipePlan(toArr(me.items), it.id).cost) : 0;
      if (it && (me.gold | 0) >= cost) str = `🛒 Buy ${it.emoji} ${it.name} ${this._isTouch ? '(tap)' : '(P)'}`;
    }
    this.hud.setBuyNudge(str);
  }

  /** First-siege coaching: contextual tips while !flags.tipsSiege — each once per match, ≥ 20 s apart. */
  _tickCoach(st, me, srvNow, now, canShop) {
    const c = this._coach;
    if (!c || this._phase !== 'playing' || this._ended || this._reconn) return;
    { // time out of base (tracked every tick, not just when a tip is due)
      const f = this.world.fountain[this.myTeam], p = this._pred || me;
      const atBase = !!f && Math.hypot(p.x - f.x, p.y - f.y) <= R.FOUNTAIN_RADIUS;
      if (atBase || me.dead) this._leftBaseAt = 0; else if (!this._leftBaseAt) this._leftBaseAt = Date.now();
    }
    if (now - this._playingAt < 4500 || now - c.lastAt < COACH_GAP_MS) return;
    if (this.hud.modalOpen || this.shop?.isOpen || this._vote || this._sbOpen) return;
    const t = st.startedAt ? srvNow - st.startedAt : 0;
    const tip = this._coachPick(me, this._pred || me, t, canShop, st, srvNow);
    if (!tip) return;
    if (tip[0] === 'gold') c.goldAt = Date.now(); else c.seen.add(tip[0]); // the gold nudge repeats
    c.lastAt = now;
    this.hud.tip(tip[1], 8000);
  }

  _coachPick(me, p, t, canShop, st = null, srvNow = 0) {
    const seen = this._coach.seen, T = this._isTouch;
    const want = (id, cond, text) => (!seen.has(id) && cond ? [id, text] : null);
    const hpPct = me.maxHp ? me.hp / me.maxHp : 1;
    const f = this.world.fountain[this.myTeam];
    const atBase = !!f && Math.hypot(p.x - f.x, p.y - f.y) <= R.FOUNTAIN_RADIUS;
    const alive = !me.dead;
    // Round 2: gold piling up far from the shop (> 90 s out of base) → recall nudge, every ~2 min.
    const wall = Date.now();
    const next = this._nextBuy(me);
    const goldTip = alive && !atBase && next && (me.gold | 0) >= next.cost && this._leftBaseAt && wall - this._leftBaseAt > 90000
      && wall - (this._coach.goldAt || 0) > 120000 && hpPct > 0.3
      ? ['gold', `💰 ${me.gold | 0}g burning a hole — ${T ? 'tap 🏠' : 'press B'} to recall and shop (${next.emoji} ${next.name})`] : null;
    const epicSoon = !!st && [st.epicGoldenAt, st.epicDeadlineAt].some((at) => at > srvNow && at - srvNow < 30000);
    return want('lowhp', alive && hpPct < 0.3 && !atBase, `🏃 Low HP? ${T ? 'Tap 🏠' : 'Press B'} to recall. Heroics at 5 HP go in the post-mortem.`)
      || want('lv6', alive && (me.level | 0) >= R.ULT_UNLOCK_LEVEL, `⭐ Lv${R.ULT_UNLOCK_LEVEL}: R unlocked — your reply-all.`)
      || want('dead', !alive, '💀 Dead? The shop works while you wait — spend that gold.')
      || want('shop', alive && canShop && t > 60000 && (me.gold | 0) >= 300, `🛒 ${me.gold | 0}g at the fountain — ${T ? 'tap 🛒' : 'P'} to shop. Treat yourself.`)
      || want('tower', alive && this._towerAlone(p), '🗼 Towers hate you personally. Let the minions take the meeting first.')
      || want('lasthit', alive && t > 20000 && this._enemyMinionNear(p, 750), "🎯 Last hit pays. Everyone else just 'contributed'.")
      || want('bush', alive && this._meHidden === 'hidden', "🌿 In a bush enemies can't see you — until you attack.")
      || goldTip
      || want('epic', alive && epicSoon, "✨ An epic monster spawns in under 30 s — group up, it pays the whole team.")
      || want('attack', alive && t > 75000, T ? '⚔ The big ⚔ button hits the nearest enemy — no aiming needed.' : '⚔ SPACE hits the nearest enemy — no aiming needed.')
      || want('scores', t > 150000, T ? '📊 Tap 📊 for the scoreboard — see who is carrying.' : '📊 Hold TAB for the scoreboard — see who is carrying.')
      || want('minimap', t > 210000, T ? '🗺 Tap the minimap to walk there — jungle camps are free gold between waves.' : '🗺 Right-click the minimap to walk there · drag it to look around (Y frees the camera)');
  }

  /** Inside an enemy tower's reach with no allied minion tanking it. */
  _towerAlone(p) {
    const reach = (R.TOWER?.range ?? 600) + 120;
    for (const s of this.views.structs.values()) {
      if (s.team === this.myTeam || !s.alive || s.kind !== 'tower') continue;
      if (Math.abs(s.x - p.x) > reach || Math.abs(s.y - p.y) > reach || Math.hypot(s.x - p.x, s.y - p.y) > reach) continue;
      const r = R.TOWER?.range ?? 600;
      for (const u of this.views.units.values()) {
        if (u.team === this.myTeam && u.alive && u.kind !== 'pet' && Math.hypot(u.x - s.x, u.y - s.y) <= r) return false;
      }
      return true;
    }
    return false;
  }

  _enemyMinionNear(p, r) {
    for (const u of this.views.units.values()) {
      if (!u.alive || u.kind === 'pet' || u.team === this.myTeam || (u.team !== 'blue' && u.team !== 'red')) continue;
      if (Math.hypot(u.x - p.x, u.y - p.y) <= r) return true;
    }
    return false;
  }

  _castSfx(slot) {
    const now = this.time.now;
    if (now - this._lastCastSfx < 150) return;
    this._lastCastSfx = now;
    AudioManager.teamCast?.(slot);
  }

  _recall() {
    if (!this._canAct()) return;
    const me = this._me();
    if ((me.recallUntil || 0) > this._srvNow()) return;
    this._send('recall');
    this._moveDest = null;
  }

  // ───────────────────────── EP-08: rollback (concede) vote ─────────────────────────
  _rollbackOpen(st, srvNow) {
    return !this._sim && !!this.room && this._phase === 'playing' && !this._ended && !!st?.startedAt
      && srvNow - st.startedAt >= (R.ROLLBACK_FROM_MS ?? 720000);
  }

  /** 🏳 button / `/rollback`: start a vote (yes), or vote yes on the running one. */
  _rollback() {
    if (this._sim) { this.hud.toast('🏳 No rollbacks in practice — the bots never give up', '#ffb347'); return; }
    if (!this.room || this._phase !== 'playing' || this._ended) return;
    if (this._vote) {
      if (this._voteMine == null) this._castVote(true);
      else this.hud.toast('🏳 You already voted', '#ffb347');
      return;
    }
    this._voteReqAt = Date.now();
    this._voteMine = true; // a started vote counts the starter's yes
    this._send('vote', { yes: true });
    AudioManager.uiClick?.();
  }

  _castVote(yes) {
    if (!this._vote || this._voteMine != null || this._sim) return;
    this._voteMine = !!yes;
    this._send('vote', { yes: !!yes });
    AudioManager.uiClick?.();
    this.hud.showVote({ ...this._vote, mine: this._voteMine }, this._srvNow(), R.ROLLBACK_VOTE_MS);
  }

  /** s→team `vote { yes, no, need, endsAt, by }` — a new vote (endsAt changed) resets our ballot. */
  _onVote(m) {
    if (!Number.isFinite(m.endsAt)) return;
    // Re-sent payload after a (re)join: `mine` = this seat already voted (direction unknown).
    if (m.mine === true) this._voteMine = typeof this._voteMine === 'boolean' ? this._voteMine : 'voted';
    else if (m.mine === false) this._voteMine = null;
    else if (!this._vote || this._vote.endsAt !== m.endsAt) {
      const iStarted = Date.now() - this._voteReqAt < 4000;
      this._voteMine = iStarted ? true : null;
    }
    if (!this._vote || this._vote.endsAt !== m.endsAt) {
      const iStarted = Date.now() - this._voteReqAt < 4000 || m.mine === true;
      if (!iStarted) {
        this.hud.banner({ title: '🏳 ROLLBACK THE RELEASE?', sub: `${String(m.by || 'A teammate').slice(0, 18)} wants last Friday's build back (${m.yes | 0}/${m.need | 0})`, color: '#ffb347' });
        AudioManager.paChime?.();
      }
    }
    this._vote = { yes: m.yes | 0, no: m.no | 0, need: m.need | 0 || (R.ROLLBACK_NEED ?? 4), endsAt: m.endsAt, by: m.by };
    this.hud.showVote({ ...this._vote, mine: this._voteMine }, this._srvNow(), R.ROLLBACK_VOTE_MS);
  }

  _tickVote(st, srvNow) {
    this.hud.setRollbackVisible(this._rollbackOpen(st, srvNow) && !this._vote && !this._reconn);
    if (!this._vote) return;
    if (srvNow > this._vote.endsAt + 2500 || this._phase !== 'playing') { // voteEnd lost → close quietly
      this._vote = null; this._voteMine = null; this.hud.showVote(null); return;
    }
    if (++this._voteKey % 6 === 0) this.hud.showVote({ ...this._vote, mine: this._voteMine }, srvNow, R.ROLLBACK_VOTE_MS);
  }

  // ───────────────────────── v6.1 CC input rules ─────────────────────────
  /** CC tags of the local champion (parseCcTags on the synced buffs, memoized per string). */
  _ccList(me) {
    const b = me?.buffs || '';
    if (b !== this._ccKey) { this._ccKey = b; this._ccVal = parseCcTags(b); }
    return this._ccVal || [];
  }
  /** First forced CC (suppress / airborne / charm / fear / taunt) or ''. */
  _ccForced(me) { return this._ccList(me).find((k) => FORCED_CC.has(k)) || ''; }
  /** Localized label of a CC type (`cc.<type>` key, CC_TYPES label as the English default). */
  _ccLabel(k) { return this._kt(`cc.${k}`, CC_TYPES[k]?.label || k); }
  /** Throttled toast for an ignored input while crowd controlled. */
  _ccToast(k) {
    const now = this.time.now;
    if (now - (this._ccToastAt || -1e9) < 700) return;
    this._ccToastAt = now;
    this.hud.toast(`${CC_TYPES[k]?.icon || ''} ${this._ccLabel(k)}`.trim(), '#ff8a8a');
  }

  // ───────────────────────── orders + casts ─────────────────────────
  _order(msg) {
    if (msg?.type !== 'stop' && this._ccForced(this._me())) return; // the server drives a charmed / feared / taunted / suppressed / airborne champion
    const now = performance.now();
    if (now - this._lastOrderAt < R.MOVE_ORDER_RATE_MS + 10) { this._pendingOrder = msg; return; }
    this._lastOrderAt = now; this._pendingOrder = null;
    this._send('order', msg);
  }

  /** Move order + local path (nav.findPath, same as the server) for prediction and the path preview. */
  _moveOrder(x, y, mark, preview = mark) {
    const fc = this._ccForced(this._me());
    if (fc) { this._moveDest = null; this._movePath = null; this._ccToast(fc); return; }
    const c = this.world.clampToMap(x, y);
    this._order({ type: 'move', x: Math.round(c.x), y: Math.round(c.y) });
    const from = this._pred || this._me();
    if (from) { const dx = c.x - from.x, dy = c.y - from.y, l = Math.hypot(dx, dy); if (l > 20) this._lastMoveDir = { x: dx / l, y: dy / l }; }
    let path = null;
    if (from) { try { path = this.world.nav.findPath(from.x, from.y, c.x, c.y, CHAMP_RADIUS); } catch (_) { path = null; } }
    if (!path || !path.length) path = [{ x: c.x, y: c.y }];
    this._movePath = path.map((q) => ({ x: q.x, y: q.y }));
    const end = this._movePath[this._movePath.length - 1];
    this._moveDest = { x: end.x, y: end.y };
    if (preview && from) this._pathPrev = { x0: from.x, y0: from.y, pts: this._movePath.slice(), t0: this.time.now };
    if (mark) this.fx.clickMark(end.x, end.y, false);
  }

  _attackOrder(view) {
    const me = this._me(), fc = this._ccForced(me) || (this._ccList(me).includes('disarm') ? 'disarm' : '');
    if (fc) { this._ccToast(fc); return; } // no basic attacks while disarmed; forced states choose their own target
    this._order({ type: 'attack', id: view.id });
    this._moveDest = null;
    this.fx.clickMark(view.x, view.y, true);
    this._markMine(view.id);
    if (view instanceof StructureView && view.invulnerable) this.hud.toast('🛡️ That Firewall is still protected', '#9fdcff');
  }

  _attackNearest() {
    if (!this._canAct()) return;
    const me = this._me(), p = this._pred || me;
    const reach = (me.range || 300) + 160;
    const t = this._nearestEnemyTo(p.x, p.y, reach, true) || this._nearestEnemyTo(p.x, p.y, reach, false, true);
    if (!t) { // round 2: SPACE spam → one toast per ~3 s
      const now = this.time.now;
      if (now - (this._noEnemyAt || -1e9) > 3000) { this._noEnemyAt = now; this.hud.toast('No enemy in range', '#ff8a8a'); }
      return;
    }
    this._attackOrder(t);
  }

  /** cast / spell sends share one CAST_RATE_MS limiter + short FIFO (fast Q→D→W combos). */
  _castSend(msg, type = 'cast') {
    const now = performance.now();
    const item = { type, msg };
    if (now - this._lastCastAt < R.CAST_RATE_MS + 10) {
      this._castQueue = this._castQueue || [];
      if (this._castQueue.length < 3) this._castQueue.push(item);
      this._pendingCast = this._castQueue[0];
      return;
    }
    this._lastCastAt = now; this._pendingCast = null;
    this._send(type, msg);
  }

  _deny(slot, text) {
    this.hud.flashSlot(slot, true);
    this.hud.toast(text, '#ff8a8a');
  }

  /** Q/W/E/R. Desktop aims at the cursor; touch / HUD clicks auto-aim. */
  _tryCast(slot, viaButton) {
    const me = this._me();
    if (!me || this._blocked()) return;
    const sk = this._specFor(me, slot); // v6: stance-resolved spec
    if (!sk) return;
    const srvNow = this._srvNow();
    if (me.dead) return this._deny(slot, '💀 You are respawning');
    if (slot === 'r' && (me.level || 1) < R.ULT_UNLOCK_LEVEL) return this._deny(slot, `🔒 ${sk.name} unlocks at level ${R.ULT_UNLOCK_LEVEL}`);
    if (me.ranks && !(me.ranks[slot] > 0)) return this._deny(slot, t('skill.unlearned'));
    const kit = parseKitTags(me.buffs);
    // v5 recast: a live recast window makes the second press free (server enforces the real window).
    // v6: a second press that is a state action (reload press, tether cut) is free too.
    const rcLive = (!!sk.recast && ((this._recastUntil && this._recastUntil[slot]) || 0) > this.time.now)
      || (sk.type === 'reload' && !!kit.reload) || (sk.type === 'tether' && !!kit.tether && !!sk.tether?.recastEnds);
    const left = (me[`cd${slot.toUpperCase()}`] || 0) - srvNow;
    if (!rcLive && left > 0) return this._deny(slot, `${sk.icon} ${sk.name} ready in ${(left / 1000).toFixed(1)}s`);
    if (!rcLive && (me.mana || 0) < sk.mana) return this._deny(slot, '💧 Not enough mana');
    if ((me.stunnedUntil || 0) > srvNow) return this._deny(slot, '💫 Stunned!');
    const fc = this._ccForced(me); // v6.1: suppress / airborne / charm / fear / taunt: toast `cc.<type>`, nothing is sent
    if (fc) return this._deny(slot, `${CC_TYPES[fc]?.icon || ''} ${this._ccLabel(fc)}`.trim());
    const kd = rcLive ? '' : this._kitDenyLocal(me, sk, kit);
    if (kd) return this._deny(slot, kd);
    const pos = this._pred || me;
    // v6.1 global skills: a pointer on the minimap aims them (cast flag mm:1); touch: first tap arms, tap the minimap to fire or tap again to auto-aim
    let mmAim = null;
    if (sk.global) {
      const fa = this._forcedAim; this._forcedAim = null;
      const mp = fa || this._mmPoint();
      if (mp) mmAim = { x: mp.x, y: mp.y, id: null };
      else if (this._isTouch && viaButton && !this._globalArmed(slot)) return;
    }
    const auto = !mmAim && (viaButton || this._autoAimWanted(pos));
    let aim = mmAim || (auto ? this._autoAim(sk, pos) : { x: this._mouseWorld.x, y: this._mouseWorld.y, id: null });
    if (!aim) return this._deny(slot, sk.targets === 'ally' ? this._kt('kit.noAlly', 'No ally in range') : '🎯 No target in range');
    // v6 ally targeting: the hovered / nearest ally champion id (link / tether / deliver)
    if (sk.targets === 'ally' && !aim.id) { const al = this._allyNear(aim.x, aim.y, sk.range, pos); if (al) aim = { x: al.x, y: al.y, id: al.id }; }
    // v6 input modes are data-driven off the resolved spec: hold = down now / up on release, drag = A now / B on release
    const mode = sk.input || 'tap';
    if (mode === 'hold' || mode === 'drag') {
      this._held = { slot, mode, viaButton: !!viaButton, auto, since: this.time.now, ax: aim.x, ay: aim.y, spec: sk };
      if (mode === 'hold') this._castSend({ slot, x: Math.round(aim.x), y: Math.round(aim.y), ph: 'down' });
      this._aimFlash = { slot, until: this.time.now + 260, x: aim.x, y: aim.y, id: null, auto };
      this.hud.flashSlot(slot, false);
      return;
    }
    if (sk.type === 'stance') this._recastUntil = {}; // a stance switch closes every recast window
    let id = aim.id || null;
    const wantsTarget = sk.type === 'target' || (sk.type === 'dash' && sk.toTarget);
    if (wantsTarget && !id) {
      // Hovered enemy first (never a pet / structure), then the nearest champion, then a unit.
      const t = this._targetNear(aim.x, aim.y, this._champOnly(sk));
      if (t) { id = t.id; aim = { x: t.x, y: t.y }; }
    }
    if (sk.type === 'target') {
      if (!id) return this._deny(slot, '🎯 Point at an enemy');
      const tv = this._viewOf(id);
      if (tv && Math.hypot(tv.x - pos.x, tv.y - pos.y) > sk.range + 90) return this._deny(slot, '📏 Out of range');
    }
    const msg = { slot, x: Math.round(aim.x), y: Math.round(aim.y) };
    if (id) msg.id = id;
    if (mmAim) msg.mm = 1; // aim came from a minimap click: the server skips its on-screen sanity check
    this._globalArm = null;
    this._castSend(msg);
    if (sk.recast) { this._recastUntil = this._recastUntil || {}; this._recastUntil[slot] = rcLive ? 0 : this.time.now + sk.recast.ms; }
    this._myCastAt = this.time.now;
    if (id) this._markMine(id);
    if (sk.type === 'dash' || sk.type === 'blink') this._moveDest = null;
    this._aimFlash = { slot, until: this.time.now + 260, x: aim.x, y: aim.y, id: auto ? id : null, auto };
    this.hud.flashSlot(slot, false);
  }

  /** Text through t() with an English default (new kit strings are localized later). */
  _kt(key, def) { const s = t(key); return s === key ? def : s; }

  /** World point under a pointer that is on the minimap (mouse cursor, or any finger that is down on touch), else null. */
  _mmPoint() {
    const mgr = this.input?.manager;
    const list = this._isTouch ? (mgr?.pointers || []).filter((p) => p.isDown) : [this.input?.mousePointer];
    for (const p of list) { const w = p && this.hud.minimapWorld?.(p.x, p.y); if (w) return w; }
    return null;
  }
  /** Touch: first tap on a global skill arms it (toast), a second tap within 4 s fires with auto-aim. Returns true when it may fire now. */
  _globalArmed(slot) {
    const now = this.time.now, g = this._globalArm;
    if (g && g.slot === slot && now < g.until) { this._globalArm = null; return true; }
    this._globalArm = { slot, until: now + 4000 };
    this.hud.toast(this._kt('ui.mm.aim', 'Tap the minimap to aim, or tap the skill again for auto-aim'), '#9fdcff');
    this.hud.flashSlot(slot, false);
    return false;
  }
  /** A minimap tap while a global skill is armed fires it there (mm:1); otherwise it is a move order. */
  _minimapTap(x, y) {
    const g = this._globalArm;
    if (g && this.time.now < g.until) { this._globalArm = null; this._forcedAim = { x, y }; this._tryCast(g.slot, true); this._forcedAim = null; return; }
    if (this._canAct()) this._moveOrder(x, y, true);
  }

  /** v6 local denial toasts (nothing is sent): resource, shadow, package, pins, turrets, reloading. '' = ok. */
  _kitDenyLocal(me, sk, kit) {
    const sp = sk.spend;
    if (sp && Number(kit[sp.res] || 0) < sp.min) return this._kt('kit.needRes', 'Not enough resource');
    if (sk.type === 'shadow' && sk.shadow?.mode === 'swap' && !kit.shadow) return this._kt('kit.noShadow', 'No shadow to swap with');
    if (sk.type === 'deliver' && !kit.pkg) return this._kt('kit.noPackage', 'You are not carrying a package');
    if (sk.type === 'resolve' && !(Number(kit.pins) > 0)) return this._kt('kit.noPins', 'No pins placed');
    if (sk.type === 'objcmd' && !(Number(kit.turrets) > 0)) return this._kt('kit.noTurrets', 'No turrets deployed');
    if (kit.reload && sk.type !== 'reload' && Object.values(CHAMPIONS[me.champ]?.skills || {}).some((s) => s.reload?.lockCasts)) return this._kt('kit.reloading', 'Reloading');
    return '';
  }

  /** Hovered ally champion first, else the nearest living ally (never self) within range of the caster. */
  _allyNear(x, y, range, pos) {
    let best = null, bd = Infinity;
    for (const v of this.views.champs.values()) {
      if (v.dead || v.team !== this.myTeam || v.id === this.localId) continue;
      if (Math.hypot(v.x - pos.x, v.y - pos.y) > (range || 600) + 40) continue;
      const d = v.hitTest?.(x, y) ? 0 : Math.hypot(v.x - x, v.y - y);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  /** Key / button up: fire a held skill at the release aim, or send a drag's second point. */
  _releaseCast(slot) {
    const h = this._held;
    if (!h || h.slot !== slot) return;
    this._held = null;
    const me = this._me();
    if (!me || this._blocked()) return;
    const pos = this._pred || me;
    const mw = this._mouseWorld;
    let aim = h.auto || !mw ? this._autoAim(h.spec, pos) : { x: mw.x, y: mw.y, id: null };
    if (!aim) aim = { x: h.ax, y: h.ay, id: null };
    if (h.mode === 'hold') {
      this._send('cast', { slot, x: Math.round(aim.x), y: Math.round(aim.y), ph: 'up' }); // up / cancel are exempt from the cast rate limit
    } else {
      const msg = { slot, x: Math.round(h.ax), y: Math.round(h.ay) };
      if (!h.auto && mw) { msg.x2 = Math.round(mw.x); msg.y2 = Math.round(mw.y); } // auto / touch tap: no B = server default wall
      this._castSend(msg);
    }
    this._myCastAt = this.time.now;
    this._aimFlash = { slot, until: this.time.now + 260, x: aim.x, y: aim.y, id: null, auto: h.auto };
  }

  /** Esc / S / stun / death: cancel a held charge (free) or drop a drag in progress. */
  _cancelHeld(send = true) {
    const h = this._held;
    if (!h) return;
    this._held = null;
    if (h.mode === 'hold' && send) this._send('cast', { slot: h.slot, x: Math.round(h.ax), y: Math.round(h.ay), ph: 'cancel' });
  }

  /** v4 §3.3: no usable mouse direction → auto-aim (touch, no cursor yet, cursor outside the
   *  canvas, or the cursor on your own champion — feet or body, within AUTO_AIM_SELF_PX). */
  _autoAimWanted(pos) {
    const m = this._mouseWorld;
    if (this._isTouch || !m || this._pointerOut || !pos) return true;
    // Mouse not moving → abilities target the nearest enemy champion (movement abilities: direction of travel).
    if (this.time.now - (this._mouseMovedAt || 0) > MOUSE_IDLE_MS) return true;
    const dx = m.x - pos.x;
    return Math.hypot(dx, m.y - pos.y) <= AUTO_AIM_SELF_PX || Math.hypot(dx, m.y - (pos.y - 46)) <= AUTO_AIM_SELF_PX;
  }

  /** Auto-aim: nearest visible enemy champion within range + AUTO_AIM_SLACK, else the nearest
   *  visible enemy unit (never a pet), else straight ahead (stick / last move / facing). */
  _autoAim(sk, pos) {
    if (sk.type === 'self' || sk.type === 'allies') return { x: pos.x, y: pos.y, id: null };
    if (NO_AIM_TYPES.has(sk.type)) return { x: pos.x, y: pos.y, id: null };
    if (sk.targets === 'ally') { // v6: nearest living allied champion in range (never self); link falls back to self, others fail
      const al = this._allyNear(pos.x, pos.y, sk.range, pos);
      if (al) return { x: al.x, y: al.y, id: al.id };
      return sk.type === 'link' ? { x: pos.x, y: pos.y, id: null } : null;
    }
    if (sk.type === 'swap') { // v5: nearest allied champion in range
      let best = null, bd = (sk.range || 600) + 40;
      for (const v of this.views.champs.values()) {
        if (v.dead || v.team !== this.myTeam || v.id === this.localId) continue;
        const d = Math.hypot(v.x - pos.x, v.y - pos.y);
        if (d < bd) { bd = d; best = v; }
      }
      return best ? { x: best.x, y: best.y, id: null } : null;
    }
    if ((sk.type === 'circle' || sk.type === 'zone' || sk.type === 'place') && !sk.range) return { x: pos.x, y: pos.y, id: null };
    if (sk.global) { // v6.1 map-wide shot: nearest Spotted enemy champion, else the lowest-HP% visible enemy champion in range, else facing
      const st = this._state();
      let spot = null, sd = Infinity, low = null, lp = Infinity;
      for (const v of this.views.champs.values()) {
        if (v.dead || v.team === this.myTeam) continue;
        const d = Math.hypot(v.x - pos.x, v.y - pos.y);
        if (d > autoAimReach(sk)) continue;
        const c = st?.champions?.get?.(v.id);
        if (String(c?.buffs || '').split(',').includes('spotted') && d < sd) { sd = d; spot = v; }
        const f = (c?.hp ?? v.hp) / Math.max(1, c?.maxHp ?? v.maxHp ?? 1);
        if (f < lp) { lp = f; low = v; }
      }
      const gt = spot || low;
      if (gt) return { x: gt.x, y: gt.y, id: gt.id };
    } else
    // Escape moves (blinks, pure dashes) never auto-aim at an enemy — shared policy with the server.
    if (autoAimsAtEnemy(sk)) {
      const reach = autoAimReach(sk, R.AUTO_AIM_SLACK ?? 150);
      const champOnly = this._champOnly(sk);
      const t = this._nearestEnemyTo(pos.x, pos.y, reach, true) || (champOnly ? null : this._nearestEnemyTo(pos.x, pos.y, reach, false));
      if (t) return { x: t.x, y: t.y, id: t.id };
    }
    if (sk.type === 'target') return null;
    const v = this.views.champs.get(this.localId);
    const dir = this._stickDir || this._lastMoveDir || { x: v?.facing || 1, y: 0 };
    const r = sk.type === 'place' ? Math.min(sk.range || 350, 350) : Math.min(sk.range || 400, 450); // place: min(range, 350) ahead
    return { x: pos.x + dir.x * r, y: pos.y + dir.y * r, id: null };
  }

  // ───────────────────────── picking ─────────────────────────
  _viewOf(id) {
    if (!id) return null;
    return this.views.champs.get(id) || this.views.units.get(id) || this.views.structs.get(id) || null;
  }
  _aimOf(id) {
    const v = this._viewOf(id);
    if (!v || v.dead || v.removed) return null;
    return v.aimPoint();
  }

  _pickEnemyAt(x, y) {
    let best = null, bd = Infinity;
    const consider = (v) => { const p = v.aimPoint(), d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = v; } };
    for (const v of this.views.champs.values()) if (!v.dead && v.team !== this.myTeam && v.hitTest(x, y)) consider(v);
    if (best) return best;
    for (const v of this.views.units.values()) if (v.alive && v.kind !== 'pet' && v.team !== this.myTeam && v.hitTest(x, y)) consider(v);
    if (best) return best;
    for (const v of this.views.structs.values()) if (v.alive && v.team !== this.myTeam && v.hitTest(x, y)) return v;
    return null;
  }

  /** Pick ANY visible entity at (x, y) — enemy, neutral, or ally (for hover & left-click inspect). */
  _pickEntityAt(x, y) {
    const enemy = this._pickEnemyAt(x, y);
    if (enemy) return enemy;
    let best = null, bd = Infinity;
    const consider = (v) => { const p = v.aimPoint(), d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = v; } };
    for (const v of this.views.champs.values()) if (!v.dead && v.team === this.myTeam && v.hitTest(x, y)) consider(v);
    if (best) return best;
    for (const v of this.views.units.values()) if (v.alive && v.kind !== 'pet' && v.team === this.myTeam && v.hitTest(x, y)) consider(v);
    if (best) return best;
    for (const v of this.views.structs.values()) if (v.alive && v.team === this.myTeam && v.hitTest(x, y)) return v;
    return null;
  }

  _entityRel(v) {
    if (!v) return '';
    if (v.team === this.myTeam) return 'ally';
    return v.team === 'blue' || v.team === 'red' ? 'enemy' : 'neutral';
  }

  _setHoverCursor(kind) {
    if (this._cursorKind === kind) return;
    this._cursorKind = kind;
    const canvas = this.game?.canvas;
    if (!canvas) return;
    if (!kind) { canvas.style.cursor = ''; return; }
    const col = kind === 'enemy' ? '%23ff4a4a' : (kind === 'neutral' ? '%23ffd23f' : '%2339c2ff');
    const svg = kind === 'ally'
      ? `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 26 26'><circle cx='13' cy='13' r='8' fill='none' stroke='${col}' stroke-width='2.2'/><circle cx='13' cy='13' r='2.5' fill='${col}'/></svg>`
      : `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><circle cx='14' cy='14' r='9' fill='none' stroke='${col}' stroke-width='2.2'/><path d='M14 2v6M14 20v6M2 14h6M20 14h6' stroke='${col}' stroke-width='2.2' stroke-linecap='round'/><circle cx='14' cy='14' r='2' fill='${col}'/></svg>`;
    canvas.style.cursor = `url("${svg}") 14 14, crosshair`;
  }

  /** Render a pixel-hugging silhouette outline around ANY hovered entity using 4 shared sprites (zero postFX, zero leaks). */
  _setHoverOutline(hv, rel) {
    const prev = this._hoverGlow;
    if (prev && prev.v !== hv && prev.v instanceof ChampionView && prev.v.outlines) {
      try {
        for (const o of prev.v.outlines) if (o?.scene) o.setTintFill(prev.v.outlineColor);
      } catch (_) { /* destroyed */ }
    }
    const imgs = this._hoverOutlines;
    if (!hv || !rel || hv.dead || hv.alive === false || hv.removed || hv._culled || hv.destroyed) {
      if (imgs) for (let i = 0; i < imgs.length; i++) if (imgs[i].visible) imgs[i].setVisible(false);
      this._hoverGlow = null;
      return;
    }
    const col = rel === 'enemy' ? 0xff4a4a : (rel === 'neutral' ? 0xffd23f : 0x39c2ff);
    const obj = hv instanceof ChampionView ? hv.sprite : hv.body;
    if (hv instanceof ChampionView && hv.outlines && (!prev || prev.v !== hv || prev.rel !== rel)) {
      try {
        for (const o of hv.outlines) if (o?.scene) o.setTintFill(col);
      } catch (_) { /* destroyed */ }
    }
    if (imgs && obj && obj.texture && obj.type === 'Image' && hv.c) {
      const key = obj.texture.key, frame = obj.frame?.name;
      const wx = hv.c.x + obj.x, wy = hv.c.y + obj.y;
      const depth = hv.c.depth - 0.02;
      for (let i = 0; i < imgs.length; i++) {
        const im = imgs[i];
        if (im.texture.key !== key || im.frame?.name !== frame) im.setTexture(key, frame);
        im.setOrigin(obj.originX, obj.originY)
          .setScale(obj.scaleX, obj.scaleY)
          .setFlipX(!!obj.flipX)
          .setAngle(obj.angle || 0)
          .setPosition(wx + im._odx, wy + im._ody)
          .setDepth(depth)
          .setTintFill(col)
          .setAlpha(0.92)
          .setVisible(true);
      }
    } else if (imgs) {
      for (let i = 0; i < imgs.length; i++) if (imgs[i].visible) imgs[i].setVisible(false);
    }
    this._hoverGlow = { v: hv, rel };
  }

  /** Tactical Ping (G key) at cursor position — expanding neon ring + alert toast. */
  _sendPing() {
    if (this._phase !== 'playing' || !this._mouseWorld) return;
    const now = this.time.now;
    if (now - (this._lastPingAt || 0) < 900) return;
    this._lastPingAt = now;
    const { x, y } = this._mouseWorld;
    const enemy = this._pickEnemyAt(x, y);
    const col = enemy ? 0xff4a4a : 0x39c2ff;
    const label = enemy ? '⚔ ATTACK!' : '📍 ON MY WAY';
    for (let i = 0; i < 2; i++) {
      const ring = this.add.image(x, y, 'moba-ring').setTint(col).setDisplaySize(24, 24).setDepth(D.fxTop).setAlpha(0.95);
      this.tweens.add({ targets: ring, displayWidth: 180, displayHeight: 180, alpha: 0, delay: i * 160, duration: 680, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    }
    const txt = this.add.text(x, y - 34, label, { fontFamily: 'Arial Black, sans-serif', fontSize: 13, color: enemy ? '#ff8a8a' : '#7ec8ff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(D.numbers);
    this.tweens.add({ targets: txt, y: y - 62, alpha: 0, duration: 1100, ease: 'Quad.easeOut', onComplete: () => txt.destroy() });
    AudioManager.uiClick?.();
  }

  _updateTargetPanel(st) {
    if (!this._selectedId || !st) { this.hud.setTarget(null); return; }
    const id = this._selectedId;
    const c = st.champions?.get?.(id);
    if (c) {
      if (c.dead) { this._selectedId = null; this.hud.setTarget(null); return; }
      const def = CHAMPIONS[c.champ];
      const rel = c.team === this.myTeam ? 'ally' : 'enemy';
      this.hud.setTarget({
        name: `${c.name || def?.name || 'Champion'}`,
        sub: `Lv.${c.level || 1} · ${def?.role || ''}`,
        rel,
        hp: c.hp, maxHp: c.maxHp, mana: c.mana, maxMana: c.maxMana,
        stats: `AD ${Math.round(c.ad || 0)} · AP ${Math.round(c.ap || 0)} · ARM ${Math.round(c.armor || 0)} · MS ${Math.round(c.ms || 0)}`,
      });
      return;
    }
    const u = st.units?.get?.(id);
    if (u) {
      if (!u.alive) { this._selectedId = null; this.hud.setTarget(null); return; }
      const uv = this.views.units.get(id);
      const rel = u.team === this.myTeam ? 'ally' : (u.team === 'blue' || u.team === 'red' ? 'enemy' : 'neutral');
      this.hud.setTarget({
        name: uv?.name || u.kind || 'Unit',
        sub: rel.toUpperCase(),
        rel,
        hp: u.hp, maxHp: u.maxHp, mana: 0, maxMana: 0,
        stats: `ATK ${Math.round(u.ad || 0)} · ARM ${Math.round(u.armor || 0)} · MS ${Math.round(u.ms || 0)}`,
      });
      return;
    }
    const s = st.structures?.get?.(id);
    if (s) {
      if (!s.alive) { this._selectedId = null; this.hud.setTarget(null); return; }
      const rel = s.team === this.myTeam ? 'ally' : 'enemy';
      this.hud.setTarget({
        name: s.kind === 'core' ? 'Production Server' : 'Firewall Tower',
        sub: s.invulnerable ? 'INVULNERABLE' : rel.toUpperCase(),
        rel,
        hp: s.hp, maxHp: s.maxHp, mana: 0, maxMana: 0,
        stats: s.kind === 'core' ? 'Core Objective · Destroy to win' : `ATK ${R.TOWER?.ad || 120} · RNG ${R.TOWER?.range || 460}`,
      });
      return;
    }
    // Target disappeared (left sight or removed) → clear panel!
    this._selectedId = null;
    this.hud.setTarget(null);
  }

  /** Pick any hoverable entity (enemies first, then allies) for cursor + border highlight. */
  _pickEntityAt(x, y) {
    const enemy = this._pickEnemyAt(x, y);
    if (enemy) return enemy;
    let best = null, bd = Infinity;
    const consider = (v) => { const p = v.aimPoint(), d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = v; } };
    for (const v of this.views.champs.values()) if (!v.dead && v.team === this.myTeam && v.hitTest(x, y)) consider(v);
    if (best) return best;
    for (const v of this.views.units.values()) if (v.alive && v.kind !== 'pet' && v.team === this.myTeam && v.hitTest(x, y)) consider(v);
    if (best) return best;
    for (const v of this.views.structs.values()) if (v.alive && v.team === this.myTeam && v.hitTest(x, y)) return v;
    return null;
  }

  _hoverRelation(v) {
    if (!v) return '';
    if (v.team === this.myTeam) return 'ally';
    if (v.team === 'blue' || v.team === 'red') return 'enemy';
    return 'neutral';
  }

  _applyHoverCursor(rel) {
    if (this._hoverCursor === rel) return;
    this._hoverCursor = rel;
    const canvas = this.game?.canvas;
    if (canvas) canvas.style.cursor = HOVER_CURSORS[rel] || '';
  }

  _drawHoverOutline(v, rel, now) {
    const g = this._hoverBox;
    if (!g) return;
    g.clear();
    if (!v || !rel) return;
    const col = HOVER_COLOR[rel] ?? 0xffffff;
    const pulse = 0.78 + 0.22 * Math.sin(now / 130);

    // Determine visual bounding box around the hovered entity
    let w = 84, h = 104, cx = v.x, cy = v.y - 46;
    if (v instanceof StructureView) {
      const isCore = v.kind === 'core';
      w = isCore ? 188 : 124;
      h = isCore ? 192 : 128;
      cy = v.y - (isCore ? 86 : 54);
    } else if (v instanceof UnitView) {
      const sz = v.size || 48;
      w = Math.max(54, sz * 1.45);
      h = Math.max(54, sz * 1.45);
      cy = v.y - sz * 0.22;
    } else if (v instanceof ChampionView) {
      w = 88;
      h = 112;
      cy = v.y - 48;
    }

    const x0 = cx - w * 0.5, y0 = cy - h * 0.5;
    const rad = 10;
    const brk = Math.min(20, w * 0.24, h * 0.24);

    // Soft outer glow + crisp border
    g.lineStyle(6, col, 0.22 * pulse);
    g.strokeRoundedRect(x0 - 2, y0 - 2, w + 4, h + 4, rad + 2);
    g.lineStyle(2, col, 0.85 * pulse);
    g.strokeRoundedRect(x0, y0, w, h, rad);

    // Bright tactical corner brackets
    g.lineStyle(3.5, 0xffffff, 0.9 * pulse);
    const x1 = x0 + w, y1 = y0 + h;
    g.beginPath();
    // top-left
    g.moveTo(x0, y0 + brk); g.lineTo(x0, y0); g.lineTo(x0 + brk, y0);
    // top-right
    g.moveTo(x1 - brk, y0); g.lineTo(x1, y0); g.lineTo(x1, y0 + brk);
    // bottom-left
    g.moveTo(x0, y1 - brk); g.lineTo(x0, y1); g.lineTo(x0 + brk, y1);
    // bottom-right
    g.moveTo(x1 - brk, y1); g.lineTo(x1, y1); g.lineTo(x1, y1 - brk);
    g.strokePath();
  }

  /** Nearest enemy to a point within `radius`: champions only, or units (+ structures). */
  _nearestEnemyTo(x, y, radius, champsOnly, withStructures = false) {
    let best = null, bd = radius;
    const consider = (v) => { const d = Math.hypot(v.x - x, v.y - y); if (d < bd) { bd = d; best = v; } };
    if (champsOnly) {
      for (const v of this.views.champs.values()) if (!v.dead && v.team !== this.myTeam) consider(v);
      return best;
    }
    for (const v of this.views.units.values()) if (v.alive && v.kind !== 'pet' && v.team !== this.myTeam) consider(v);
    if (!best && withStructures) {
      for (const v of this.views.structs.values()) {
        if (!v.alive || v.team === this.myTeam || v.invulnerable) continue;
        const d = Math.hypot(v.x - x, v.y - y) - v.hitRadius;
        if (d < bd) { bd = d; best = v; }
      }
    }
    return best;
  }

  /** `targets: 'enemyChamp'` skills only aim at champions (Story Mode 2.0 overrides: bugs count too). */
  _champOnly(sk) { return sk.targets === 'enemyChamp'; }

  /** Point-and-click skill target near a world point: picked enemy › nearest champion › nearest unit. */
  _targetNear(x, y, champOnly) {
    let t = this._pickEnemyAt(x, y);
    if (t && (t instanceof StructureView || (champOnly && !(t instanceof ChampionView)))) t = null;
    return t || this._nearestEnemyTo(x, y, 160, true) || (champOnly ? null : this._nearestEnemyTo(x, y, 160, false));
  }

  _markMine(id) { if (id) this._mine.set(id, this.time.now); }
  _isMine(id) { const t = this._mine.get(id); return t != null && this.time.now - t < 1600; }

  // ───────────────────────── per frame ─────────────────────────
  update(time, delta) {
    if (this._shuttingDown) return;
    // World motion runs on REAL elapsed time: Phaser clamps `delta` to 16.7 ms
    // while the window is unfocused, which would slow prediction vs the server.
    const pnow = performance.now();
    if (this._lastPnow && pnow - this._lastPnow > STALL_MS) { this._lastRxAt = Date.now(); this._stallAt = 0; } // frozen tab resumed
    const dt = Math.min(0.1, Math.max(0, (pnow - (this._lastPnow || pnow)) / 1000));
    this._lastPnow = pnow;
    const now = this.time.now;
    if (this._sim) this._sim.update(delta);
    if (this._pendingOrder && pnow - this._lastOrderAt >= R.MOVE_ORDER_RATE_MS + 10) {
      const m = this._pendingOrder; this._pendingOrder = null; this._lastOrderAt = pnow; this._send('order', m);
    }
    if (this._pendingCast && pnow - this._lastCastAt >= R.CAST_RATE_MS + 10) {
      const q = this._castQueue || [];
      const it = q.length ? q.shift() : this._pendingCast;
      this._pendingCast = q.length ? q[0] : null; this._lastCastAt = pnow; this._send(it.type, it.msg);
    }
    const st = this._state();
    const srvNow = this._srvNow();
    if (st && st.champions) {
      const me0 = st.champions.get?.(this.localId);
      if (!this.myTeam && me0) this.myTeam = me0.team;
      if (me0 && this._hudChamp !== me0.champ && CHAMPIONS[me0.champ]) {
        this._hudChamp = me0.champ;
        this.myChamp = me0.champ;
        this.hud.setChampion(me0.champ, me0.team);
        try { this.shop?.setChampion?.(me0.champ); } catch (_) { /* optional extra */ }
      }
      if (st.custom) this._wasCustom = true; // remembered for PLAY AGAIN after the room is gone
      this._syncPhase(st);
      if (this.myTeam && WORLD_PHASES.has(this._phase)) this._syncWorld(st, dt, now, srvNow);
    }
    const me = this._me();
    if (!this._isTouch && this._mouseWorld && this.input.mousePointer) {
      // The camera follows us under a resting cursor: refresh the cursor's world point.
      const mp = this.input.mousePointer, wp = this.cameras.main.getWorldPoint(mp.x, mp.y);
      this._mouseWorld.x = wp.x; this._mouseWorld.y = wp.y;
    }
    this._updateLocal(me, dt, now, srvNow);
    // v6: a held charge / drag in progress ends on stun, death or when the match stops accepting input
    if (this._held && (!me || me.dead || (me.stunnedUntil || 0) > srvNow || this._ccForced(me) || this._blocked())) this._cancelHeld(!(me?.dead || (me?.stunnedUntil || 0) > srvNow));
    this._tickQuality(now);
    const view = this.cameras.main.worldView;
    this.map.update(dt, view, {
      liveCamps: this._liveCamps, srvNow, playing: this._phase === 'playing',
      epicAt: { golden: st?.epicGoldenAt || 0, deadline: st?.epicDeadlineAt || 0 },
    });
    this.fx.update(dt);
    const canShop = this._canShop(me);
    // Throttle HUD refresh to 20 Hz (matches server 50ms tick rate; cuts 60-FPS HUD polling overhead 3x)
    if (now >= (this._hudAt || 0)) {
      this._hudAt = now + 50;
      this.hud.update({ st, me, myId: this.localId, srvNow, now, mePos: this._pred, view, canShop, phase: this._phase, hidden: this._meHidden, held: this._held });
    }
    if (me && this.shop) this.shop.update({ gold: me.gold | 0, items: toArr(me.items), canShop });
    if (this.augmentPanel) {
      let offer = me?.augmentOffer || null;
      if (!offer) {
        const rawOffer = me?.augmentOfferJson || '';
        if (rawOffer !== this._lastOfferJson) {
          this._lastOfferJson = rawOffer;
          this._cachedOffer = null;
          if (rawOffer) { try { this._cachedOffer = JSON.parse(rawOffer); } catch {} }
        }
        offer = this._cachedOffer;
      }
      let ownedAugs = me?.augments;
      if (!Array.isArray(ownedAugs)) {
        const csv = me?.augmentsCsv || '';
        if (csv !== this._lastAugCsv) {
          this._lastAugCsv = csv;
          this._cachedAugs = csv ? csv.split(',') : [];
        }
        ownedAugs = this._cachedAugs;
      }
      if (!offer || !Array.isArray(offer.choices) || !offer.choices.length) {
        this._augCanShow = false;
        this._augShownLv = 0;
        this._augNotifiedLv = 0;
        if (this.augmentPanel.isOpen) this.augmentPanel.hide();
      } else {
        if (this._augShownLv && this._augShownLv !== offer.level && !me?.dead) {
          this._augCanShow = false;
          this._augShownLv = 0;
        }
        if (me?.dead) {
          this._augCanShow = true;
          this._augShownLv = offer.level;
        }
        if (this._augCanShow) {
          this.augmentPanel.update(offer, ownedAugs);
        } else if (this.augmentPanel.isOpen) {
          this.augmentPanel.hide();
        }
      }
    }
      this._tickReconnect();
      if (st) this._tickVote(st, srvNow);
      if (now >= (this._slowTickAt || 0)) {
        this._slowTickAt = now + 250;
        if (this._shopAssistAt && now >= this._shopAssistAt) this._tickShopAssist(me, now);
        this._tickBuyNudge(me, canShop);
        if (st && me) this._tickCoach(st, me, srvNow, now, canShop);
      }
      if (this._sbOpen && this.scoreboard && now >= (this._sbAt || 0)) { this._sbAt = now + 250; this.scoreboard.update(st, this.localId); }
      this._updateInfo(false);
      if (now - this._minePrunedAt > 5000) {
        this._minePrunedAt = now;
        for (const [id, t] of this._mine) if (now - t > 4000) this._mine.delete(id);
      }
    }

    _syncPhase(st) {
      const ph = st.phase;
      if (ph === this._phase) return;
      const prev = this._phase;
      this._phase = ph;
      const world = WORLD_PHASES.has(ph);
      // lobby / select / loading: waiting overlay, and the world is never rendered.
      this.hud.showLobby(!world && !!ph);
      this.cameras.main.setVisible(world);
      if (!world) { this.shop?.close?.(); this.info?.close?.(); }
      if (ph === 'playing' && prev !== 'playing') {
        this._playingAt = this.time.now;
        this.hud.toast(this._isTouch ? 'Joystick to move · ⚔ attack · skills + D/F auto-aim · ℹ info' : 'Right-click: move / attack · Q W E R: skills · D F: spells · C: info · B: recall · P: shop', '#7ec8ff', 4200);
        // EP-21: the first games open the shop at 0:00 (starting gold is meant to be spent).
        if (this._shopAssist) this._shopAssistAt = this.time.now + 900; // fired from update once the shop module is loaded
      }
      if (ph === 'ended') this._onEnded(st);
    }

    _syncWorld(st, dt, now, srvNow) {
      const f = ++this._frame;
      const me = st.champions.get?.(this.localId);
      const myAd = me?.ad || 0;
      const mi = this._meInfo;
      mi.team = this.myTeam; mi.dead = !me || !!me.dead;
      if (this._pred) { mi.x = this._pred.x; mi.y = this._pred.y; } else if (me) { mi.x = me.x; mi.y = me.y; }
      // Cull rect: views outside it are hidden and skip their per-frame update (§3.4).
      const wv = this.cameras.main.worldView, cr = this._cull;
      cr.x0 = wv.x - CULL_PAD; cr.y0 = wv.y - CULL_PAD - 120; cr.x1 = wv.right + CULL_PAD; cr.y1 = wv.bottom + CULL_PAD;
      const low = this._lowFx;

      st.structures?.forEach((s, id) => {
        let v = this.views.structs.get(id);
        if (!v) { v = new StructureView(this, id, s, this.myTeam); this.views.structs.set(id, v); }
        else {
          if (s.hp < v.hp && v.alive && this._isMine(id)) this._dmgNumber(v, v.hp - s.hp);
          const was = v.alive;
          v.sync(s);
          if (was && !v.alive) {
            this.fx.explosion(v.x, v.y - v.height * 0.4, v.kind === 'core');
            if (this.fx.onScreen(v.x, v.y, 200)) shakeCam(this, 280, 0.005);
            AudioManager.towerDown?.(v.team === this.myTeam);
          }
        }
        v._seen = f;
        if (s.kind === 'tower' || s.kind === 'core') {
          const tv = s.targetId ? this._viewOf(s.targetId) : null;
          v.targetPos = tv && (tv.alive !== false) && !tv.dead ? tv.aimPoint() : null;
          v.targetIsMe = !!s.targetId && s.targetId === this.localId;
        }
        if (this._inCull(v.x, v.y)) v.update(now, mi);
        else v.laserG?.clear();
      });
      for (const [id, v] of this.views.structs) if (v._seen !== f) { v.destroy(); this.views.structs.delete(id); }

      // AoV Tower Heal Relics (behind Tier-1 towers)
      let relics = Array.isArray(st.relics) ? st.relics : null;
      if (!relics) {
        const rawRelics = st.relicsJson || '';
        if (rawRelics !== this._lastRelicsJson) {
          this._lastRelicsJson = rawRelics;
          this._cachedRelics = null;
          if (rawRelics) { try { this._cachedRelics = JSON.parse(rawRelics); } catch { } }
        }
        relics = this._cachedRelics;
      }
      if (Array.isArray(relics)) {
        if (!this._relicViews) this._relicViews = new Map();
        const simNow = this._sim ? this._sim.t : srvNow;
        for (const rl of relics) {
          let rv = this._relicViews.get(rl.id);
          if (!rv) {
            const c = this.add.container(rl.x, rl.y).setDepth(D.ground + 0.5);
            const glow = this.add.image(0, 0, 'moba-glow').setTint(0x39ff14).setDisplaySize(64, 64).setAlpha(0.45).setBlendMode(1);
            const disc = this.add.circle(0, 0, 18, 0x0b2916, 0.9).setStrokeStyle(2.5, 0x39ff14, 0.95);
            const plus = this.add.image(0, 0, 'moba-plus').setTint(0x7ed957).setDisplaySize(20, 20);
            c.add([glow, disc, plus]);
            rv = { c, glow };
            this._relicViews.set(rl.id, rv);
          }
          const ready = rl.upAt <= simNow && this._inCull(rl.x, rl.y);
          rv.c.setVisible(ready);
          if (ready) rv.glow.setAlpha(0.32 + 0.18 * Math.sin(now / 240));
        }
      }

      // Update throttled Fog of War layer only on due frames (zero per-frame allocations)
      if (this.map?.shouldUpdateFog?.(now)) {
        const watchers = this._fogWatchers;
        watchers.length = 0;
        st.champions?.forEach((c) => { if (c.team === this.myTeam && !c.dead) watchers.push({ x: c.x, y: c.y, r: 1100 }); });
        st.structures?.forEach((s) => { if (s.team === this.myTeam && s.alive) watchers.push({ x: s.x, y: s.y, r: 1050 }); });
        st.units?.forEach((u) => { if (u.team === this.myTeam && u.alive && u.kind !== 'pet') watchers.push({ x: u.x, y: u.y, r: u.kind === 'ward' ? 750 : 680 }); });
        this.map.updateFog(watchers, now);
      }

        const camps = this._liveCamps;
        camps.clear();
        let myPet = null;
        const bushTick = f % 3 === 0;
        st.units?.forEach((u, id) => {
          if (u.kind === 'pet' && u.alive !== false && u.owner && u.owner === this.localId) myPet = id;
          let v = this.views.units.get(id);
          if (!v) {
            v = new UnitView(this, id, u, this.myTeam); this.views.units.set(id, v);
            if (low) v.glow?.setVisible(false);
            if (this._worldReady && v.alive && v.team !== this.myTeam) { if (v.fadeIn) v.fadeIn(); else this._fadeIn([v.c]); } // came (back) into vision
          } else {
            if (u.hp < v.hp && v.alive && this._isMine(id)) this._dmgNumber(v, v.hp - u.hp);
            const was = v.alive;
            v.sync(u, myAd);
            if (was && !v.alive && !v._culled) { const p = v.aimPoint(); this.fx.unitDeath(p.x, p.y, v.size, teamColor(v.team)); }
          }
          if (u.alive && u.campId) camps.add(u.campId);
          v._seen = f;
          if (this._inCull(u.x, u.y)) {
            if (v._culled) { v._culled = false; v.x = v.tx; v.y = v.ty; if (!v.dying) v.c.setVisible(true); }
            v.update(dt, now);
            // Own-team units inside a bush: translucent ("hidden" look).
            if (bushTick && v.team === this.myTeam && !v.dying) {
              const inB = !!this.world.bushAt(v.x, v.y);
              if (inB !== !!v._inBush) { v._inBush = inB; if (v.setHidden) v.setHidden(inB); else v.c.setAlpha(inB ? 0.55 : 1); }
            }
          } else {
            if (!v._culled) { v._culled = true; v.c.setVisible(false); }
            v.x = v.tx; v.y = v.ty; // keep picking / aim points honest without any render work
          }
        });
        for (const [id, v] of this.views.units) {
          if (v._seen === f) continue;
          this.views.units.delete(id);
          // Removed while alive = hidden by the server (bush / out of vision) → fade, no death puff.
          if (v.alive && !v.dying && !v.removed && !v._culled) this._fadeOutUnit(v);
          else v.remove();
          this._onVanish(id);
        }
        this._myPetId = myPet;

        st.champions.forEach((c, id) => {
          let v = this.views.champs.get(id);
          const isMe = id === this.localId;
          if (v && v.champ !== c.champ && CHAMPIONS[c.champ]) {
            v.destroy();
            this.views.champs.delete(id);
            v = null;
            if (isMe) this.myChamp = c.champ;
          }
          if (!v) {
            v = new ChampionView(this, id, c, { isMe, myTeam: this.myTeam });
            this.views.champs.set(id, v);
            v.sync(c, srvNow, now);
            if (low) v.light?.setVisible(false);
            if (this._worldReady && !isMe && v.team !== this.myTeam && !v.dead) { if (v.fadeIn) v.fadeIn(); else this._fadeIn([v.c, v.ov]); }
          } else this._champEvents(v, c, isMe, srvNow, now);
          v._seen = f;
          // Reveal tracking (attacks / casts bump action_seq) for the own-team "hidden" look.
          const seq = c.action_seq || 0;
          if (v._v4seq !== seq) { if (v._v4seq != null) v._actAt = now; v._v4seq = seq; }
          if (isMe) this._predict(c, v, dt, srvNow);
          if (isMe || this._inCull(v.x, v.y) || this._inCull(v.tx, v.ty)) {
            if (v._culled) { v._culled = false; v.x = v.tx; v.y = v.ty; v.c.setVisible(!v.dead); v.ov.setVisible(!v.dead); }
            v.update(dt, now, srvNow, isMe);
            this._spellTrails(id, v, c, now);
            if (bushTick && !v.dead) {
              const b = this.world.bushAt(v.x, v.y);
              if (b !== (v._bushNow || '')) { v._bushNow = b; if (b) this.map.rustle(b); }
            }
          } else {
            v._culled = true;
            if (v.c.visible) { v.c.setVisible(false); v.ov.setVisible(false); } // sync() re-shows on respawn
            v.x = v.tx; v.y = v.ty;
          }
          if (v.team === this.myTeam) this._applyHidden(v, c, isMe, now);
        });
        for (const [id, v] of this.views.champs) {
          if (v._seen === f) continue;
          this.views.champs.delete(id); this._trailAt.delete(id);
          if (!v.dead && !v._culled) this._fadeOutChamp(v); else v.destroy();
          this._onVanish(id);
        }
        if (f % 4 === 0) this._layoutPlates();
        // The bush you stand in thins out so you can see yourself.
        this.map.setBushFocus(this._pred && me && !me.dead ? this.world.bushAt(this._pred.x, this._pred.y) : '');
        this._worldReady = true;
      }

      /** Round 2: nameplates of champions standing close together stack upward instead of
       *  overlapping (you keep yours in place); in a > 4-champion crowd the others shrink a bit. */
      _layoutPlates() {
        const list = this._plateList || (this._plateList = []);
        list.length = 0;
        for (const v of this.views.champs.values()) if (!v.dead && !v._culled && !v._gone) list.push(v);
        list.sort((a, b) => (b.isMe - a.isMe) || (b.y - a.y));
        const placed = this._platePlaced || (this._platePlaced = []);
        placed.length = 0;
        for (const v of list) {
          let dy = 0;
          for (let k = 0; k < 4; k++) {
            const py = v.y + dy;
            let hit = false;
            for (let i = 0; i < placed.length; i += 2) if (Math.abs(placed[i] - v.x) < 120 && Math.abs(placed[i + 1] - py) < 34) { hit = true; break; }
            if (!hit) break;
            dy -= 34;
          }
          v.plateDy = dy;
          placed.push(v.x, v.y + dy);
          let near = 0;
          for (const o of list) if (o !== v && Math.abs(o.x - v.x) < 200 && Math.abs(o.y - v.y) < 200) near++;
          v.setPlateScale?.(near >= 4 && !v.isMe ? 0.82 : 1);
        }
      }

      _inCull(x, y) { const c = this._cull; return x > c.x0 && x < c.x1 && y > c.y0 && y < c.y1; }

      /** Fade objects in from 0 (an enemy (re-)entering our vision). */
      _fadeIn(objs) {
        for (const o of objs) o.setAlpha(0);
        this.tweens.add({ targets: objs, alpha: 1, duration: 220, ease: 'Quad.easeOut' });
      }
      _fadeOutChamp(v) {
        v._gone = true;
        if (v.fadeOut) { v.fadeOut(240); return; }
        this.tweens.killTweensOf([v.c, v.ov]);
        this.tweens.add({ targets: [v.c, v.ov], alpha: 0, duration: 240, ease: 'Quad.easeIn', onComplete: () => v.destroy() });
      }
      _fadeOutUnit(v) {
        if (v.vanish) { v.vanish(); return; }
        v.removed = true;
        this.tweens.killTweensOf(v.c);
        this.tweens.add({ targets: v.c, alpha: 0, duration: 240, ease: 'Quad.easeIn', onComplete: () => v.c.destroy() });
      }

      /** An entity left our state (died + removed, or hidden by the server): forget every reference. */
      _onVanish(id) {
        if (this._hoverEnemy?.id === id) this._hoverEnemy = null;
        if (this._hoverEntity?.id === id) this._hoverEntity = null;
        if (this._hoverGlow?.v?.id === id) this._setHoverOutline(null, '');
        if (this._selectedId === id) { this._selectedId = null; this.hud.setTarget(null); }
        if (this._pendingOrder?.id === id) this._pendingOrder = null;
        const q = this._castQueue;
        if (q && q.length) {
          for (let i = q.length - 1; i >= 0; i--) if (q[i].msg?.id === id) q.splice(i, 1);
          if (this._pendingCast) this._pendingCast = q[0] || null;
        } else if (this._pendingCast?.msg?.id === id) this._pendingCast = null;
        this._mine.delete(id);
        if (this.info?.isOpen && this.info.sid === id) this.info.close();
      }

      /** Own-team champion in a bush and not revealed → translucent; you also get the HUD hint.
       *  Revealed (client approximation of the server rule): attacked / cast within BUSH_REVEAL_MS,
       *  or a visible enemy champion stands in the same bush. */
      _applyHidden(v, c, isMe, now) {
        const bush = v.dead ? '' : (typeof c.inBush === 'string' ? c.inBush : (isMe && this._pred ? this.world.bushAt(this._pred.x, this._pred.y) : ''));
        let hidden = false, why = '';
        if (bush) {
          const act = Math.max(v._actAt || -1e9, isMe ? this._myCastAt : -1e9);
          hidden = now - act >= (R.BUSH_REVEAL_MS ?? 1500);
          if (!hidden) why = 'attacked';
          else {
            for (const e of this.views.champs.values()) {
              if (e.team === this.myTeam || e.dead || e._gone) continue;
              if (Math.abs(e.x - v.x) < 500 && Math.abs(e.y - v.y) < 500 && this.world.bushAt(e.x, e.y) === bush) { hidden = false; why = 'enemy'; break; }
            }
          }
        }
        if (hidden !== !!v._hidden) {
          v._hidden = hidden;
          if (typeof v.setHidden === 'function') { try { v.setHidden(hidden); } catch (_) { /* UI agent API */ } }
          else v.c.setAlpha(hidden ? 0.5 : 1);
        }
        if (isMe) this._meHidden = bush ? (hidden ? 'hidden' : why || 'revealed') : null;
      }

      _dmgNumber(v, d) {
        if (d < 1) return;
        const p = v.aimPoint();
        this.fx.number(p.x, p.y - 24, `-${Math.round(d)}`, d >= 150 ? 'big' : 'dealt');
      }

      _champEvents(v, c, isMe, srvNow, now) {
        const wasDead = v.dead, oldHp = v.hp, oldMax = v.maxHp, oldLv = v.level;
        v.sync(c, srvNow, now);
        if (!wasDead && v.dead) {
          this.fx.champDeath(v.x, v.y, teamColor(v.team));
          if (isMe || this.fx.onScreen(v.x, v.y, 100)) AudioManager.teamDeath?.(isMe);
          return;
        }
        if (wasDead && !v.dead) { this.fx.respawn(c.x, c.y, teamColor(v.team)); return; }
        if (v.dead || oldHp < 0) return;
        const d = oldHp - c.hp;
        const p = v.aimPoint();
        // Your own numbers pop out to the side of your body (alternating), never on
        // your nameplate / HP bar (playtest v2: they covered your own HP in fights).
        let nx = p.x, ny = p.y - 34;
        if (isMe) { this._numSide = -(this._numSide || 1); nx = p.x + this._numSide * (52 + Math.random() * 18); ny = p.y + 6; }
        if (d >= 1) {
          v.flash();
          const kind = isMe ? 'self' : (v.team === this.myTeam ? null : (d >= 150 ? 'big' : 'dealt'));
          if (kind) this.fx.number(nx, ny, `-${Math.round(d)}`, kind);
        } else if (-d >= 40 && c.maxHp === oldMax && (isMe || v.team === this.myTeam)) {
          this.fx.number(nx, ny, `+${Math.round(-d)}`, 'heal');
        }
        if (oldLv > 0 && v.level > oldLv) {
          this.fx.levelUp(v.x, v.y, isMe);
          if (isMe) AudioManager.combo?.(3);
        }
      }

      /** Local prediction: walk toward the order destination at `ms`, reconcile with the server. */
      _predict(c, v, dt, srvNow) {
        if (c.dead) { this._pred = { x: c.x, y: c.y }; this._moveDest = null; v.setDisplayPos(c.x, c.y); return; }
        if (!this._pred) this._pred = { x: c.x, y: c.y };
        const p = this._pred, now = this.time.now;
        const err = Math.hypot(c.x - p.x, c.y - p.y);
        if (now < this._dashUntil) {
          const k = approach(dt, 18); p.x += (c.x - p.x) * k; p.y += (c.y - p.y) * k;
        } else if (err > PRED_SNAP_PX) {
          p.x = c.x; p.y = c.y;
          if (err > 400) this._moveDest = null;
        } else {
          const canMove = !((c.stunnedUntil || 0) > srvNow) && !((c.rootedUntil || 0) > srvNow) && !((c.recallUntil || 0) > srvNow) && !this._ccForced(c); // v6.1: forced states follow the server
          if (this._moveDest && canMove && this._replan) {
            this._replan = false;
            const path = this.world.nav.findPath(p.x, p.y, this._moveDest.x, this._moveDest.y, CHAMP_RADIUS);
            this._movePath = path.length ? path : null;
          }
          if (this._moveDest && canMove) {
            const slow = (c.slowUntil || 0) > srvNow ? 1 - Math.min(90, c.slowPct || 0) / 100 : 1;
            let step = Math.max(0, (c.ms || 330) * slow) * dt;
            // Walk the nav path (waypoints around walls), carrying leftover step to the next waypoint.
            for (let guard = 0; guard < 4 && this._moveDest && step > 0; guard++) {
              const path = this._movePath;
              const wp = path && path.length ? path[0] : this._moveDest;
              const dx = wp.x - p.x, dy = wp.y - p.y, d = Math.hypot(dx, dy);
              if (d <= step) {
                p.x = wp.x; p.y = wp.y; step -= d;
                if (path && path.length) path.shift();
                if (!path || !path.length) { this._moveDest = null; this._movePath = null; }
              } else { p.x += (dx / d) * step; p.y += (dy / d) * step; step = 0; }
            }
            if (err > 60) { const k = approach(dt, 2); p.x += (c.x - p.x) * k; p.y += (c.y - p.y) * k; }
          } else {
            const k = approach(dt, 9); p.x += (c.x - p.x) * k; p.y += (c.y - p.y) * k;
          }
          // Never show yourself inside furniture (reconcile blending can cut a corner).
          if (this.world.nav.isBlocked(p.x, p.y, CHAMP_RADIUS - 4)) { const q = this.world.nav.pushOut(p.x, p.y, CHAMP_RADIUS); p.x = q.x; p.y = q.y; }
        }
        v.setDisplayPos(p.x, p.y);
      }

      _updateLocal(me, dt, now, srvNow) {
        // Death → desaturate the world camera (HUD stays in color).
        const dead = !!me?.dead && this._phase === 'playing';
        if (dead !== this._meDead) {
          this._meDead = dead;
          this._setGray(dead);
          if (dead) { this.shop?.close?.(); this._moveDest = null; }
          else this.hud.setDeathTitle(null);
        }
        // Camera follows the predicted position (slightly below center: the HUD covers the bottom).
        const tgt = this._pred || me;
        if (tgt) {
          if (!this._camInit) { this._camInit = true; this._camX = tgt.x; this._camY = tgt.y + 40; this._camFreeX = this._camX; this._camFreeY = this._camY; }
          // Pass 2 RP-08: follow when locked (and not peeking via the minimap) or while Z is held.
          const follow = this._centerHeld || (this._camLocked && !this._camPeek);
          if (follow) {
            const k = approach(dt, this._centerHeld ? 14 : 7);
            this._camX += (tgt.x - this._camX) * k; this._camY += (tgt.y + 40 - this._camY) * k;
            this._camFreeX = this._camX; this._camFreeY = this._camY;
          } else {
            this._edgePan(dt);
            const k = approach(dt, 16);
            this._camX += (this._camFreeX - this._camX) * k; this._camY += (this._camFreeY - this._camY) * k;
          }
          this.cameras.main.centerOn(this._camX, this._camY);
        }
        // Joystick / arrow keys → move orders toward a point ahead.
        let dir = this._stickDir;
        if (!dir && this._cursors && !this._chatActive) {
          const c = this._cursors;
          const x = (c.right.isDown ? 1 : 0) - (c.left.isDown ? 1 : 0), y = (c.down.isDown ? 1 : 0) - (c.up.isDown ? 1 : 0);
          if (x || y) { const l = Math.hypot(x, y); dir = { x: x / l, y: y / l }; }
        }
        if (dir && me && this._canAct()) {
          this._sticking = true;
          if (now - this._stickSentAt > STICK_ORDER_MS) {
            this._stickSentAt = now;
            const p = this._pred || me;
            this._moveOrder(p.x + dir.x * 260, p.y + dir.y * 260, false);
          }
        } else if (this._sticking) {
          this._sticking = false;
          if (this._canAct()) this._order({ type: 'stop' });
          this._moveDest = null;
        }
        // Attack target + hover marks.
        const tv = me && !me.dead ? this._viewOf(me.targetId) : null;
        if (tv && (tv.alive !== false) && !tv.dead) this._targetMark.setVisible(true).setPosition(tv.x, tv.y + 2);
        else if (this._targetMark.visible) this._targetMark.setVisible(false);
        if (!this._isTouch && this._mouseWorld && now >= this._hoverPickAt) {
          this._hoverPickAt = now + 50;
          const canPick = this._phase === 'playing' && !this._pointerOut && !this._hasBlockingOverlay();
          this._hoverEntity = canPick ? this._pickEntityAt(this._mouseWorld.x, this._mouseWorld.y) : null;
          this._hoverEnemy = this._hoverEntity && this._hoverEntity.team !== this.myTeam ? this._hoverEntity : null;
        }
        const hv = this._hoverEntity;
        const hvAlive = !!(hv && (hv.alive !== false) && !hv.dead && !hv.removed);
        if (hvAlive) {
          const rel = this._entityRel(hv);
          const col = rel === 'enemy' ? 0xff4a4a : (rel === 'neutral' ? 0xffd23f : 0x39c2ff);
          const rw = hv instanceof StructureView ? (hv.kind === 'core' ? 196 : 128) : (hv instanceof UnitView ? Math.max(60, (hv.size || 44) * 1.5) : 90);
          const showMark = hv !== tv;
          if (this._hoverMark.visible !== showMark) this._hoverMark.setVisible(showMark);
          this._hoverMark.setPosition(hv.x, hv.y + 4);
          if (this._hoverMarkRw !== rw) { this._hoverMarkRw = rw; this._hoverMark.setSize(rw, Math.round(rw * 0.36)); }
          if (this._hoverMarkCol !== col) { this._hoverMarkCol = col; this._hoverMark.setStrokeStyle(2.5, col, 0.9); }
          this._setHoverOutline(hv, rel);
          this._setHoverCursor(rel);
        } else {
          if (this._hoverMark.visible) this._hoverMark.setVisible(false);
          this._setHoverOutline(null, '');
          this._setHoverCursor('');
        }
        if (this._selectedId && now >= (this._targetPanelAt || 0)) {
          this._targetPanelAt = now + 100;
          this._updateTargetPanel(this._state());
        }
        this._drawAim(me, now);
        this.hud.setMmAim?.(this._mmAimWanted); // global skill preview: a dot on the minimap (null clears it)
      }

      // ───────────────────────── aim previews ─────────────────────────
      /** My pet's displayed position (null if I have none / it's down). */
      _petPos() {
        const v = this._myPetId ? this.views.units.get(this._myPetId) : null;
        return v && v.alive && !v.removed ? { x: v.x, y: v.y } : null;
      }

      /** Enemy champions + displaceable enemy units (no pets / epics / structures), for knockback previews. */
      _knockables(fn) {
        for (const v of this.views.champs.values()) if (!v.dead && v.team !== this.myTeam) fn(v, CHAMP_RADIUS);
        for (const v of this.views.units.values()) {
          if (!v.alive || v.kind === 'pet' || v.team === this.myTeam || R.EPICS[v.kind]) continue;
          fn(v, MINION_RADIUS);
        }
      }

      /** First enemy (champion or unit, never a pet) whose center is within r of the segment, by distance from (x0,y0). */
      _firstEnemyOnSeg(x0, y0, x1, y1, r) {
        let best = null, bt = Infinity;
        const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L;
        this._knockables((v, vr) => {
          if (distToSeg(v.x, v.y, x0, y0, x1, y1) > r + vr) return;
          const t = (v.x - x0) * ux + (v.y - y0) * uy;
          if (t > 0 && t < bt) { bt = t; best = v; }
        });
        return best;
      }

      /** Knockback arrow from (x,y) along (ux,uy) for `dist`, clipped by walls like the server (nav.clipMove). */
      _knockArrow(g, x, y, ux, uy, dist, r, wallStun, col, a) {
        const tx = x + ux * dist, ty = y + uy * dist;
        const end = this.world.nav.clipMove(x, y, tx, ty, r);
        const len = Math.hypot(end.x - x, end.y - y);
        g.lineStyle(5, col, 0.85 * a); g.lineBetween(x, y, end.x, end.y);
        const nx = -uy, ny = ux, L = Math.min(24, len * 0.6 + 8);
        const hx = end.x - ux * L, hy = end.y - uy * L;
        g.fillStyle(col, 0.95 * a); g.fillTriangle(end.x + ux * 4, end.y + uy * 4, hx + nx * 13, hy + ny * 13, hx - nx * 13, hy - ny * 13);
        if (end.hit) {
          g.lineStyle(2, col, 0.25 * a); g.lineBetween(end.x, end.y, tx, ty);
          if (wallStun) {
            g.lineStyle(5, 0xffd23f, a);
            for (let i = 0; i < 4; i++) {
              const an = (i / 4) * Math.PI + 0.4;
              g.lineBetween(end.x - Math.cos(an) * 20, end.y - Math.sin(an) * 20, end.x + Math.cos(an) * 20, end.y + Math.sin(an) * 20);
            }
            if (!this._aimTxt.visible) this._aimTxt.setText(`💫 WALL STUN ${(wallStun / 1000).toFixed(1)}s`).setPosition(end.x, end.y - 26).setVisible(true);
          }
        }
        return end;
      }

      /** Arrows for every knockable enemy inside a circle (pushed away from its center). */
      _knockArrowsInCircle(g, cx, cy, radius, sk, col, a) {
        let n = 0;
        this._knockables((v, vr) => {
          if (n >= 8) return;
          const dx = v.x - cx, dy = v.y - cy, d = Math.hypot(dx, dy);
          if (d > radius + vr) return;
          n++;
          const ux = d > 1 ? dx / d : 1, uy = d > 1 ? dy / d : 0;
          this._knockArrow(g, v.x, v.y, ux, uy, sk.knockback.dist, vr, sk.wallStun?.ms || 0, col, a);
        });
      }

      /** Faint dotted path from the last move click (fades after ~0.6 s). */
      _drawPathPreview(g, now) {
        const pp = this._pathPrev;
        if (!pp) return;
        const k = (now - pp.t0) / 600;
        if (k >= 1) { this._pathPrev = null; return; }
        const a = 0.5 * (1 - k * k);
        g.fillStyle(0x7ed957, a);
        let ax = pp.x0, ay = pp.y0, dots = 0;
        for (const q of pp.pts) {
          const len = Math.hypot(q.x - ax, q.y - ay), n = Math.floor(len / 26);
          for (let i = 1; i <= n && dots < 160; i++, dots++) {
            const t = i / (n + 1);
            g.fillRect(ax + (q.x - ax) * t - 3, ay + (q.y - ay) * t - 3, 6, 6);
          }
          ax = q.x; ay = q.y;
        }
        if (pp.pts.length > 1) { // waypoint corners
          g.fillStyle(0xb6ff8a, a);
          for (let i = 0; i < pp.pts.length - 1; i++) g.fillRect(pp.pts[i].x - 5, pp.pts[i].y - 5, 10, 10);
        }
      }

      /** Skill range / shape preview: while hovering a HUD skill, and briefly after a cast. */
      /** Annular sector (r0 = 0: a wedge) filled alpha 0.18, outlined 0.6, in the spec colour (v6.1 cone / arc previews). */
      _drawSector(g, x, y, r0, r1, a0, a1, col, a) {
        g.beginPath();
        if (r0 > 0) { g.arc(x, y, r1, a0, a1, false); g.arc(x, y, r0, a1, a0, true); }
        else { g.moveTo(x, y); g.arc(x, y, r1, a0, a1, false); }
        g.closePath();
        g.fillStyle(col, 0.18 * a); g.fillPath();
        g.lineStyle(2, col, 0.6 * a); g.strokePath();
      }

      /** Dashed straight line (barrier / phase previews). */
      _dashedLine(g, x0, y0, x1, y1, col, a, dash = 16, gap = 10) {
        const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L;
        g.lineStyle(3, col, 0.85 * a);
        for (let s = 0; s < L; s += dash + gap) { const e = Math.min(L, s + dash); g.lineBetween(x0 + ux * s, y0 + uy * s, x0 + ux * e, y0 + uy * e); }
      }

      /** Dashed circle outline (the safe inner edge of a donut). */
      _dashedCircle(g, x, y, r, col, a) {
        g.lineStyle(2, col, 0.7 * a);
        const n = 28;
        for (let i = 0; i < n; i += 2) { g.beginPath(); g.arc(x, y, r, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2, false); g.strokePath(); }
      }

      /** Knockback arrows for the knockable enemies inside a wedge (pushed away from its origin). */
      _knockArrowsInSector(g, p, base, half, sk, col, a) {
        let n = 0;
        this._knockables((v, vr) => {
          const dx = v.x - p.x, dy = v.y - p.y, d = Math.hypot(dx, dy);
          if (n >= 8 || d > sk.range + vr) return;
          if (d > 50 && Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - base), Math.cos(Math.atan2(dy, dx) - base))) > half) return;
          n++;
          this._knockArrow(g, v.x, v.y, d > 1 ? dx / d : 1, d > 1 ? dy / d : 0, sk.knockback.dist, vr, sk.wallStun?.ms || 0, col, a);
        });
      }

      /** Phase dash lane: free stretches solid, wall stretches the dash can cross dashed, stops at a wall that is too thick. Returns the landing point. */
      _drawPhaseLane(g, p, ux, uy, len, maxWall, col, a) {
        const step = 20, n = Math.max(1, Math.ceil(len / step)), gap = len / n, nav = this.world.nav;
        let lx = p.x, ly = p.y, run = -1, end = null;
        const seg = (x0, y0, x1, y1, dashed) => { if (dashed) this._dashedLine(g, x0, y0, x1, y1, col, a, 8, 7); else { g.lineStyle(6, col, 0.6 * a); g.lineBetween(x0, y0, x1, y1); } };
        for (let i = 1; i <= n; i++) {
          const x = p.x + ux * gap * i, y = p.y + uy * gap * i, blocked = nav.isBlocked(x, y, CHAMP_RADIUS);
          if (blocked) { if (run < 0) run = i; continue; }
          if (run >= 0) {
            if ((i - run) * gap > maxWall) { end = { x: lx, y: ly, stop: true }; break; }
            const sx = p.x + ux * gap * (run - 1), sy = p.y + uy * gap * (run - 1); seg(sx, sy, x, y, true); run = -1;
          } else seg(lx, ly, x, y, false);
          lx = x; ly = y;
        }
        if (!end) end = run >= 0 ? { x: lx, y: ly, stop: true } : { x: lx, y: ly, stop: false };
        g.lineStyle(3, col, 0.8 * a); g.strokeCircle(end.x, end.y, 28);
        if (end.stop) { g.lineStyle(6, 0xff8a3c, 0.95 * a); g.lineBetween(end.x + ux * 32 - uy * 24, end.y + uy * 32 + ux * 24, end.x + ux * 32 + uy * 24, end.y + uy * 32 - ux * 24); }
        return end;
      }

      /** Drag-cast preview (Pixel Q, Model E ...): the start point A is fixed, the line follows the pointer up to `obj.len`. */
      _drawDragPreview(g, now) {
        const h = this._held, sk = h.spec, p = this._pred, col = sk.color ?? 0x39c2ff;
        const A = { x: h.ax, y: h.ay }, m = this._mouseWorld || A;
        const maxLen = (sk.obj && sk.obj.len) || 400, th = (sk.obj && sk.obj.thick) || 36;
        const dx = m.x - A.x, dy = m.y - A.y, d = Math.hypot(dx, dy);
        const ux = d > 8 ? dx / d : 1, uy = d > 8 ? dy / d : 0, reach = Math.min(d, maxLen);
        const B = { x: A.x + ux * reach, y: A.y + uy * reach }, F = { x: A.x + ux * maxLen, y: A.y + uy * maxLen };
        const pulse = 0.65 + 0.35 * Math.sin(now / 90), nx = -uy, ny = ux, hw = th / 2;
        if (sk.range) { g.lineStyle(3, col, 0.4); g.strokeCircle(p.x, p.y, sk.range); }
        // faint full-length ghost so the maximum reach is obvious
        g.lineStyle(2, col, 0.3);
        for (let s = 0; s < maxLen; s += 28) g.lineBetween(A.x + ux * s, A.y + uy * s, A.x + ux * Math.min(s + 14, maxLen), A.y + uy * Math.min(s + 14, maxLen));
        g.strokeCircle(F.x, F.y, hw * 0.5);
        // the band that will be placed
        g.fillStyle(col, 0.16 + 0.12 * pulse);
        g.beginPath(); g.moveTo(A.x + nx * hw, A.y + ny * hw); g.lineTo(B.x + nx * hw, B.y + ny * hw); g.lineTo(B.x - nx * hw, B.y - ny * hw); g.lineTo(A.x - nx * hw, A.y - ny * hw); g.closePath(); g.fillPath();
        g.lineStyle(3, col, 0.95);
        g.lineBetween(A.x + nx * hw, A.y + ny * hw, B.x + nx * hw, B.y + ny * hw); g.lineBetween(A.x - nx * hw, A.y - ny * hw, B.x - nx * hw, B.y - ny * hw);
        g.lineStyle(5, 0xffffff, 0.9 * pulse); g.lineBetween(A.x, A.y, B.x, B.y);
        g.fillStyle(col, 0.95); g.fillCircle(A.x, A.y, hw * 0.55); g.fillCircle(B.x, B.y, hw * 0.55);
        g.lineStyle(3, 0xffffff, 0.9); g.strokeCircle(A.x, A.y, hw * 0.55 + 6); g.strokeCircle(B.x, B.y, hw * 0.55 + 6);
        this._aimTxt.setText(`${this._kt('kit.dragRelease', 'Release to place')}  ${Math.round(reach)}/${maxLen}`).setPosition(B.x, B.y - 60).setVisible(true);
      }

      _drawAim(me, now) {
        const g = this._aimG;
        g.clear();
        this._mmAimWanted = null;
        if (this._aimTxt.visible) this._aimTxt.setVisible(false);
        if (!me || me.dead || !this._pred) return;
        this._drawPathPreview(g, now);
        if (this._held && this._held.mode === 'drag') { this._drawDragPreview(g, now); return; }
        const flash = this._aimFlash && now < this._aimFlash.until ? this._aimFlash : null;
        const slot = this._hoverSlot || flash?.slot;
        if (slot === 'd' || slot === 'f') {
          const sp = this._spellOf(me, slot);
          if (!sp) return;
          const fl = flash && flash.slot === slot && !this._hoverSlot ? flash : null;
          this._drawSpellAim(g, me, sp, this._pred, fl, fl ? Math.max(0, (fl.until - now) / 260) : 1);
          return;
        }
        const sk = slot && this._specFor(me, slot);
        if (!sk) return;
        const p = this._pred, col = sk.color ?? 0xffffff;
        const a = flash && !this._hoverSlot ? Math.max(0, (flash.until - now) / 260) : 1;
        const kb = sk.knockback && sk.knockback.dist > 0;
        if (sk.at === 'pet') {
          // Centered on the pet (`range` ignored).
          const pet = this._petPos(), c = pet || p, pa = pet ? a : a * 0.35;
          g.fillStyle(col, 0.12 * pa); g.fillCircle(c.x, c.y, sk.radius || 300);
          g.lineStyle(3, col, 0.85 * pa); g.strokeCircle(c.x, c.y, sk.radius || 300);
          g.lineStyle(2, col, 0.4 * pa); g.strokeCircle(c.x, c.y, (sk.radius || 300) * 0.55);
          if (pet) { g.lineStyle(2, col, 0.5 * a); g.lineBetween(p.x, p.y - 30, pet.x, pet.y - 20); }
          else if (!this._aimTxt.visible) this._aimTxt.setText(`🤖 ${CHAMPIONS[me.champ]?.pet?.name || 'pet'} is offline`).setPosition(p.x, p.y - 140).setVisible(true);
          if (kb) this._knockArrowsInCircle(g, c.x, c.y, sk.radius, sk, col, pa);
          return;
        }
        if (sk.input === 'drag' && !this._aimTxt.visible && !this._isTouch) { // Viktor-style two-step aim: tell the player how it works
          this._aimTxt.setText(this._kt('kit.dragHint', 'Press Q at the start point, drag, release to place')).setPosition(p.x, p.y - 150).setVisible(true);
        }
        if (sk.range && !sk.global) { g.lineStyle(3, col, 0.55 * a); g.strokeCircle(p.x, p.y, sk.range); } // a map-wide range ring would fill the screen
        const selfArea = sk.type === 'self' || sk.type === 'allies' || ((sk.type === 'circle' || sk.type === 'zone') && !sk.range);
        if (selfArea && sk.radius) {
          g.fillStyle(col, 0.1 * a); g.fillCircle(p.x, p.y, sk.radius);
          g.lineStyle(3, col, 0.75 * a); g.strokeCircle(p.x, p.y, sk.radius);
          if (sk.inner) this._dashedCircle(g, p.x, p.y, sk.inner, col, a);
          if (sk.type === 'zone') { g.lineStyle(2, 0xffffff, 0.35 * a); g.strokeCircle(p.x, p.y, sk.radius * 0.7); }
          if (kb) this._knockArrowsInCircle(g, p.x, p.y, sk.radius, sk, col, a);
          return;
        }
        let aim = flash || this._mouseWorld;
        let autoT = null;
        if (!flash && (this._hoverSlot || this._autoAimWanted(p))) {
          // A HUD-slot click / cursor-on-yourself cast auto-aims: preview exactly that.
          const aa = this._autoAim(sk, p);
          if (!aa) { if (!this._aimTxt.visible) this._aimTxt.setText('🎯 no target in range').setPosition(p.x, p.y - 140).setVisible(true); return; }
          aim = aa; autoT = aa.id ? this._viewOf(aa.id) : null;
        } else if (flash?.id) autoT = this._viewOf(flash.id);
        if (!aim || (this._isTouch && !flash)) return;
        if (autoT && !autoT.dead && autoT.alive !== false) {
          g.lineStyle(3, 0xffd23f, 0.9 * a); g.strokeCircle(autoT.x, autoT.y, 46);
          g.lineStyle(2, 0xffd23f, 0.5 * a); g.strokeCircle(autoT.x, autoT.y, 56);
          if (!this._aimTxt.visible && sk.type !== 'target') this._aimTxt.setText('🎯 AUTO').setPosition(autoT.x + 70, autoT.y - 40).setVisible(true);
        }
        if (sk.global && !flash) { const mp = this._mmPoint(); if (mp) aim = mp; } // a pointer on the minimap aims a global skill
        const dx = aim.x - p.x, dy = aim.y - p.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
        if (sk.global) {
          // v6.1 map-wide shot: a thin line from the caster along the aim for the full range, plus a dot on the minimap
          const mp2 = this.world.clampToMap(p.x + ux * sk.range, p.y + uy * sk.range);
          g.lineStyle(2, col, 0.7 * a); g.lineBetween(p.x, p.y, mp2.x, mp2.y);
          g.lineStyle(2, col, 0.35 * a); g.strokeCircle(aim.x, aim.y, 40);
          this._mmAimWanted = { x: aim.x, y: aim.y };
        } else if (sk.type === 'cone' || sk.type === 'arc') {
          // v6.1 wedge (cone) / crescent (arc: inner..range, with a looping sweep line): drawn exactly from the spec
          const base = Math.atan2(uy, ux), half = ((sk.angle || 90) * Math.PI) / 360, r0 = sk.type === 'arc' ? sk.inner || 0 : 0;
          this._drawSector(g, p.x, p.y, r0, sk.range, base - half, base + half, col, a);
          if (sk.type === 'arc') {
            const sweep = Math.max(200, sk.sweepMs || 260) + 500, an = base - half + ((now % sweep) / sweep) * half * 2;
            g.lineStyle(3, 0xffffff, 0.8 * a); g.lineBetween(p.x + Math.cos(an) * r0, p.y + Math.sin(an) * r0, p.x + Math.cos(an) * sk.range, p.y + Math.sin(an) * sk.range);
          }
          if (kb && sk.type === 'cone') this._knockArrowsInSector(g, p, base, half, sk, col, a);
        } else if (sk.type === 'line') {
          const L = sk.range, hw = (sk.width || 100) / 2, nx = -uy * hw, ny = ux * hw;
          const pts = [{ x: p.x + nx, y: p.y + ny }, { x: p.x + ux * L + nx, y: p.y + uy * L + ny }, { x: p.x + ux * L - nx, y: p.y + uy * L - ny }, { x: p.x - nx, y: p.y - ny }];
          g.fillStyle(col, 0.18 * a); g.fillPoints(pts, true);
          g.lineStyle(2, col, 0.6 * a); g.strokePoints(pts, true);
        } else if (sk.type === 'place' && sk.obj?.kind === 'barrier') {
          // v6.1 barrier: a segment centred on the aim (clamped to range), perpendicular to the cast direction, length obj.len (+ spent orbs)
          const sp = sk.spend, kit = parseKitTags(me.buffs), u = sp ? Math.min(Number(kit[sp.res] || 0), sp.max) : 0;
          const len = sk.obj.len * (1 + ((sp?.per?.radius) || 0) * u), r = Math.min(d, sk.range), cx = p.x + ux * r, cy = p.y + uy * r, hl = len / 2;
          const x0 = cx - uy * hl, y0 = cy + ux * hl, x1 = cx + uy * hl, y1 = cy - ux * hl;
          g.lineStyle(sk.obj.thick || 40, col, 0.2 * a); g.lineBetween(x0, y0, x1, y1);
          this._dashedLine(g, x0, y0, x1, y1, col, a);
        } else if (sk.type === 'projectile') {
          const L = sk.range, hw = (sk.width || 70) / 2;
          const count = Math.max(1, Math.min(12, sk.count | 0 || 1));
          const spread = count > 1 ? ((sk.spread || 0) * Math.PI) / 180 : 0;
          const base = Math.atan2(uy, ux);
          const fa = count > 1 ? 0.08 : 0.16;
          for (let i = 0; i < count; i++) {
            const an = base + (count > 1 ? (i / (count - 1) - 0.5) * spread : 0);
            const vx = Math.cos(an), vy = Math.sin(an), nx = -vy * hw, ny = vx * hw;
            const pts = [
              { x: p.x + nx, y: p.y + ny }, { x: p.x + vx * L + nx, y: p.y + vy * L + ny },
              { x: p.x + vx * L - nx, y: p.y + vy * L - ny }, { x: p.x - nx, y: p.y - ny },
            ];
            g.fillStyle(col, fa * a); g.fillPoints(pts, true);
            g.lineStyle(2, col, (count > 1 ? 0.5 : 0.75) * a); g.strokePoints(pts, true);
          }
          if (count > 1) { // fan outline: edges + arc at max range
            g.lineStyle(3, col, 0.8 * a);
            g.beginPath(); g.arc(p.x, p.y, L, base - spread / 2, base + spread / 2); g.strokePath();
          }
          if (kb) {
            if (sk.pierce) {
              let n = 0;
              this._knockables((v, vr) => {
                if (n >= 8 || distToSeg(v.x, v.y, p.x, p.y, p.x + ux * L, p.y + uy * L) > hw + vr) return;
                const ex = v.x - p.x, ey = v.y - p.y, ed = Math.hypot(ex, ey) || 1;
                if (ex * ux + ey * uy <= 0) return;
                n++;
                this._knockArrow(g, v.x, v.y, ex / ed, ey / ed, sk.knockback.dist, vr, sk.wallStun?.ms || 0, col, a);
              });
            } else {
              const v = this._firstEnemyOnSeg(p.x, p.y, p.x + ux * L, p.y + uy * L, hw);
              if (v) { const ex = v.x - p.x, ey = v.y - p.y, ed = Math.hypot(ex, ey) || 1; this._knockArrow(g, v.x, v.y, ex / ed, ey / ed, sk.knockback.dist, CHAMP_RADIUS, sk.wallStun?.ms || 0, col, a); }
            }
          }
        } else if (sk.type === 'circle' || sk.type === 'zone') {
          const r = Math.min(d, sk.range), cx = p.x + ux * r, cy = p.y + uy * r;
          g.fillStyle(col, (sk.type === 'zone' ? 0.2 : 0.16) * a); g.fillCircle(cx, cy, sk.radius);
          g.lineStyle(3, col, 0.85 * a); g.strokeCircle(cx, cy, sk.radius);
          if (sk.inner) { // donut: the centre is safe (inner edge dashed)
            g.fillStyle(0x000000, 0.1 * a); g.fillCircle(cx, cy, sk.inner);
            this._dashedCircle(g, cx, cy, sk.inner, col, a);
          }
          if (sk.type === 'zone') { // persistent: concentric "puddle" rings
            g.lineStyle(2, 0xffffff, 0.35 * a); g.strokeCircle(cx, cy, sk.radius * 0.7);
            g.lineStyle(2, 0xffffff, 0.2 * a); g.strokeCircle(cx, cy, sk.radius * 0.4);
          }
          if (kb) this._knockArrowsInCircle(g, cx, cy, sk.radius, sk, col, a);
        } else if (sk.type === 'dash') {
          const r = Math.min(d, sk.range), tx = p.x + ux * r, ty = p.y + uy * r;
          const end = sk.phase ? this._drawPhaseLane(g, p, ux, uy, r, sk.phase.maxWall, col, a) : this.world.nav.clipMove(p.x, p.y, tx, ty, CHAMP_RADIUS);
          if (!sk.phase) { g.lineStyle(6, col, 0.6 * a); g.lineBetween(p.x, p.y, end.x, end.y); g.strokeCircle(end.x, end.y, 28); } // v6.1 phase: the lane draws itself (dashed wall stretches)
          if (end.hit && !sk.phase) { // stopped by furniture
            g.lineStyle(2, col, 0.25 * a); g.lineBetween(end.x, end.y, tx, ty);
            g.lineStyle(6, 0xff8a3c, 0.95 * a);
            g.lineBetween(end.x + ux * 32 - uy * 24, end.y + uy * 32 + ux * 24, end.x + ux * 32 + uy * 24, end.y + uy * 32 - ux * 24);
          }
          if (kb) {
            const v = this._firstEnemyOnSeg(p.x, p.y, end.x, end.y, sk.hitRadius || 60);
            if (v) { const ex = v.x - p.x, ey = v.y - p.y, ed = Math.hypot(ex, ey) || 1; this._knockArrow(g, v.x, v.y, ex / ed, ey / ed, sk.knockback.dist, CHAMP_RADIUS, sk.wallStun?.ms || 0, col, a); }
          }
        } else if (sk.type === 'blink') {
          const r = Math.min(d, sk.range), tx = p.x + ux * r, ty = p.y + uy * r;
          const land = this.world.nav.nearestFree(tx, ty, CHAMP_RADIUS);
          g.lineStyle(6, col, 0.6 * a); g.lineBetween(p.x, p.y, land.x, land.y);
          g.strokeCircle(land.x, land.y, 28);
          if (Math.hypot(land.x - tx, land.y - ty) > 6) { // aimed into a wall → lands on the nearest free spot
            g.lineStyle(2, col, 0.35 * a); g.strokeCircle(tx, ty, 20); g.lineBetween(tx, ty, land.x, land.y);
          }
        } else if (sk.type === 'target') {
          const tv = autoT || this._targetNear(aim.x, aim.y, this._champOnly(sk));
          if (tv) {
            const inRange = Math.hypot(tv.x - p.x, tv.y - p.y) <= sk.range + 90;
            const tc = inRange ? col : 0xff4a4a;
            g.lineStyle(3, tc, 0.6 * a); g.lineBetween(p.x, p.y, tv.x, tv.y); g.strokeCircle(tv.x, tv.y, 44);
            if (kb && inRange && !R.EPICS[tv.kind]) {
              const ex = tv.x - p.x, ey = tv.y - p.y, ed = Math.hypot(ex, ey) || 1;
              this._knockArrow(g, tv.x, tv.y, ex / ed, ey / ed, sk.knockback.dist, tv.def ? CHAMP_RADIUS : MINION_RADIUS, sk.wallStun?.ms || 0, col, a);
            }
          }
        }
      }

      // ───────────────────────── end of match ─────────────────────────
      _onEnded(st) {
        if (this._ended) return;
        this._ended = true;
        if (this.room?.roomId) clearMatch(this.room.roomId); // Pass 2: nothing left to REJOIN
        this.shop?.close?.(); this.scoreboard?.hide?.(); this._sbOpen = false; this.info?.close?.();
        this.hud.closeModal();
        this._setGray(false);
        const rows = [];
        // v4 §3.2b: `scores` is never view-filtered (hidden enemies are absent from `champions`);
        // offline / older servers fall back to the champions map. Gold isn't in TeamScore.
        const src = st.scores && st.scores.size > 0 ? st.scores : st.champions;
        src.forEach((c, id) => rows.push({
          sid: id, team: c.team, name: c.name, champ: c.champ, level: c.level | 0, kills: c.kills | 0, deaths: c.deaths | 0,
          assists: c.assists | 0, cs: c.cs | 0, gold: (c.gold ?? st.champions.get?.(id)?.gold) | 0, items: toArr(c.items),
          isBot: !!c.isBot, isMe: id === this.localId,
        }));
        rows.sort((a, b) => (a.team === b.team ? b.kills - a.kills || a.deaths - b.deaths : (a.team === this.myTeam ? -1 : 1)));
        // state + localSid let EndScreen fill any player missing from rows from state.scores (v4 §3.5).
        // EP-09: practice never touches the W/L record; winReason → rollback subtitle; first blood +
        // duration feed the "YOUR SHIFT" highlights and the copied result.
        const durationMs = st.startedAt ? Math.max(0, this._srvNow() - st.startedAt) : 0;
        const payload = {
          winner: st.winner, myTeam: this.myTeam, rows, state: st, localSid: this.localId,
          practice: !!this._sim, winReason: String(st.winReason || ''), firstBlood: this._firstBlood || '', durationMs,
        };
        try { this._reconn?.loop?.cancel(); } catch (_) { /* ignore */ }
        this._reconn = null;
        this._vote = null; this.hud.showVote(null); this.hud.setRollbackVisible(false); this.hud.setBuyNudge(null);
        // EP-10: coaching retires after COACH_MATCHES finished matches.
        if (this._coach && this._gamesPlayed + 1 >= COACH_MATCHES) { try { SaveManager.setFlag?.('tipsSiege', true); } catch (_) { /* old save */ } }
        if (st.winner && st.winner === this.myTeam) AudioManager.victory?.(); else AudioManager.failure?.();
        // Let the victory banner + core explosion play before the end screen covers them.
        this.time.delayedCall(2200, () => {
          if (this._shuttingDown) return;
          if (this.endScreen) this._showEndScreen(payload); else this._endPending = payload;
        });
      }

      _showEndScreen(payload) {
        try { this.hud.clearTransient(); this.fx.clearNumbers(); } catch (_) { /* cosmetic */ }
        try { this.endScreen.show(payload); } catch (e) {
          console.warn('[TeamMode] EndScreen.show failed, using fallback:', e?.message);
          new FallbackEndScreen(this, { onPlayAgain: () => this._playAgain(), onMenu: () => this._goMenu() }).show(payload);
        }
      }

      // ───────────────────────── chat (DOM input for IME + mobile keyboards) ─────────────────────────
      _buildChatInput() {
        const el = document.createElement('input');
        el.type = 'text'; el.maxLength = 140; el.autocomplete = 'off';
        el.placeholder = 'say something… (Enter to send, Esc to cancel)';
        Object.assign(el.style, {
          position: 'fixed', left: '50%', bottom: '32%', transform: 'translateX(-50%)', width: 'min(70vw, 440px)',
          padding: '8px 10px', font: '14px Consolas, monospace', color: '#fff', background: 'rgba(5,8,15,0.96)',
          border: '2px solid #39c2ff', borderRadius: '6px', zIndex: '9999', display: 'none', outline: 'none',
        });
        el.addEventListener('keydown', (ev) => {
          ev.stopPropagation();
          if (ev.isComposing) return;
          if (ev.key === 'Enter') { ev.preventDefault(); this._closeChat(true); }
          else if (ev.key === 'Escape') { ev.preventDefault(); this._closeChat(false); }
        });
        el.addEventListener('blur', () => { if (this._chatActive) this._closeChat(false); });
        document.body.appendChild(el);
        this._chatEl = el;
      }

      _openChat() {
        if (this._chatActive || !this._chatEl || this.hud.modalOpen || this._shuttingDown) return;
        this._chatActive = true;
        this.input.keyboard.resetKeys?.(); // don't leave a held arrow stuck down
        this.input.keyboard.enabled = false;
        this.input.keyboard.clearCaptures();
        this._chatEl.value = '';
        this._chatEl.style.display = 'block';
        setTimeout(() => this._chatEl?.focus(), 0);
      }

      _closeChat(send) {
        if (!this._chatActive) return;
        const text = (this._chatEl?.value || '').trim();
        const now = Date.now();
        if (send && /^\/(rollback|ff|surrender)$/i.test(text)) this._rollback(); // EP-08 chat shortcut
        else if (send && /^\/(yes|no)$/i.test(text)) this._castVote(/yes/i.test(text));
        else if (send && text && now - this._lastChatAt >= 600) { this._lastChatAt = now; this._send('chat', { text: text.slice(0, 140) }); }
        this._chatActive = false;
        if (this._chatEl) { this._chatEl.value = ''; this._chatEl.style.display = 'none'; this._chatEl.blur(); }
        if (this.input?.keyboard) {
          this.input.keyboard.enabled = true;
          this.input.keyboard.addCapture(KEY_CAPTURES);
        }
      }

      // ───────────────────────── leaving ─────────────────────────
      _goMenu() {
        // Pass 2: leaving on purpose frees the seat for good (the bot keeps it) → no REJOIN offer.
        if (this.room?.roomId) clearMatch(this.room.roomId);
        this._cleanup(); this.scene.start('MenuScene');
      }
      // Custom-room players go back to the rooms screen (keep the group together); quick play → lobby.
      // Round 2: an online quick match re-queues straight away (TeamLobbyScene { autoQueue }).
      _playAgain() {
        const custom = !!(this._state()?.custom || this._wasCustom);
        const online = !this._sim;
        this._cleanup();
        if (custom) this.scene.start('TeamCustomScene', { name: this.playerName });
        else this.scene.start('TeamLobbyScene', online ? { autoQueue: true } : undefined);
      }

      _cleanup() {
        if (this._cleanedVisit === this._visit) return;
        this._cleanedVisit = this._visit;
        if (this._pracLangUnsub) { this._pracLangUnsub(); this._pracLangUnsub = null; }
        if (this._pracBar) { for (const b of this._pracBar.all) b.destroy(); this._pracBar = null; }
        this._setHoverOutline?.(null, '');
        this._setHoverCursor?.('');
        if (this._relicViews) { for (const rv of this._relicViews.values()) rv.c.destroy(); this._relicViews.clear(); }
        // Flag first so Colyseus callbacks firing during room.leave() become no-ops.
        this._shuttingDown = true;
        this._applyHoverCursor('');
        try { this._reconn?.loop?.cancel(); } catch (_) { /* ignore */ }
        this._reconn = null; this._vote = null;
        if (this._onBeforeUnload) { window.removeEventListener('beforeunload', this._onBeforeUnload); this._onBeforeUnload = null; }
        document.removeEventListener('visibilitychange', this._onVis);
        this.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, this._onAdded);
        this.events.off(Phaser.Scenes.Events.PRE_RENDER, this._classifyCams, this);
        this._camQ.length = 0;
        for (const u of this._unsubs || []) { try { u(); } catch (_) { /* ignore */ } }
        this._unsubs = [];
        try { this.room?.leave(); } catch (_) { /* ignore */ }
        this.room = null;
        this._sim = null;
        if (this._chatEl) { this._chatEl.remove(); this._chatEl = null; }
        this._chatActive = false;
        if (this.input?.keyboard) {
          this.input.keyboard.enabled = true;
          this.input.keyboard.removeCapture?.(KEY_CAPTURES); // don't swallow TAB/SPACE/arrows in other scenes
        }
        this._grayFx = null;
        this.views.champs.clear(); this.views.units.clear(); this.views.structs.clear();
        this.shop = this.scoreboard = this.endScreen = null;
        this.info = null; this._trailAt?.clear();
      }

      // ───────────────────────── v3: summoner spells (D / F) ─────────────────────────
      _spellOf(me, slot) { return me ? SPELLS[me['spell' + slot.toUpperCase()]] || null : null; }

      /** D / F. Desktop aims at the cursor; touch / HUD clicks auto-aim (Flash: stick / facing direction). */
      _trySpell(slot, viaButton) {
        const me = this._me();
        if (!me || this._blocked()) return;
        const K = slot.toUpperCase(), sp = this._spellOf(me, slot);
        if (!sp) return this._deny(slot, '❔ No summoner spell in that slot');
        const srvNow = this._srvNow();
        if (me.dead) return this._deny(slot, '💀 You are respawning');
        const left = (me['cd' + K] || 0) - srvNow;
        if (left > 0) return this._deny(slot, `${sp.icon} ${sp.name} ready in ${left >= 10000 ? fmtTime(left) : `${(left / 1000).toFixed(1)}s`}`);
        if ((me.stunnedUntil || 0) > srvNow) return this._deny(slot, '💫 Stunned!');
        const hc = this._ccList(me).find((k) => k === 'suppress' || k === 'airborne'); // summoner spells stay usable under charm / fear / taunt / silence / disarm / blind
        if (hc) return this._deny(slot, `${CC_TYPES[hc]?.icon || ''} ${this._ccLabel(hc)}`.trim());
        if (sp.kind === 'blink' && (me.rootedUntil || 0) > srvNow) return this._deny(slot, `🌿 Rooted — can't ${sp.name}`);
        if (sp.kind === 'blink' && this.time.now < this._dashUntil) return this._deny(slot, `💨 Can't ${sp.name} while displaced`);
        const pos = this._pred || me;
        const auto = viaButton || this._autoAimWanted(pos);
        const aim = this._spellAim(sp, pos, auto);
        if (aim.err) return this._deny(slot, aim.err);
        const msg = { slot, x: Math.round(aim.x), y: Math.round(aim.y) };
        if (aim.id) msg.id = aim.id;
        this._castSend(msg, 'spell');
        if (aim.id) this._markMine(aim.id);
        if (sp.kind === 'blink') this._moveDest = null;
        this._aimFlash = { slot, until: this.time.now + 260, x: aim.x, y: aim.y };
        this.hud.flashSlot(slot, false);
      }

      /** Aim for a summoner spell → { x, y, id?, target?, err? } (also used by the preview). */
      _spellAim(sp, pos, auto) {
        const mouse = this._mouseWorld;
        switch (sp.kind) {
          case 'blink': {
            let tx, ty;
            if (auto || !mouse) {
              const v = this.views.champs.get(this.localId);
              const dir = this._stickDir || this._lastMoveDir || { x: v?.facing || 1, y: 0 };
              tx = pos.x + dir.x * sp.range; ty = pos.y + dir.y * sp.range;
            } else { tx = mouse.x; ty = mouse.y; }
            const dx = tx - pos.x, dy = ty - pos.y, d = Math.hypot(dx, dy) || 1, r = Math.min(d, sp.range);
            const c = this.world.clampToMap(pos.x + (dx / d) * r, pos.y + (dy / d) * r);
            return { x: c.x, y: c.y };
          }
          case 'dot': {
            const t = this._spellTarget(sp, pos, auto);
            if (!t) return { x: pos.x, y: pos.y, err: '🎯 No enemy champion in range' };
            if (Math.hypot(t.x - pos.x, t.y - pos.y) > sp.range + CHAMP_RADIUS + 20) return { x: t.x, y: t.y, target: t, err: '📏 Out of range' };
            return { x: t.x, y: t.y, id: t.id, target: t };
          }
          case 'smite': {
            const t = this._spellTarget(sp, pos, auto);
            if (!t) return { x: pos.x, y: pos.y, err: '🎯 No monster / enemy minion in range' };
            if (Math.hypot(t.x - pos.x, t.y - pos.y) > sp.range + (t.size || 44) * 0.5 + 20) return { x: t.x, y: t.y, target: t, err: '📏 Out of range' };
            return { x: t.x, y: t.y, id: t.id, target: t };
          }
          default: return { x: pos.x, y: pos.y };
        }
      }

      /** Smite: monster (camp / epic) or enemy minion — never a pet / champion. Ignite: enemy champion. */
      _smiteable(v) {
        if (!v || !v.alive || v.removed || v.isPet || v.kind === 'pet') return false;
        if (v.team === this.myTeam) return false;
        return !!v.campId || !!R.EPICS[v.kind] || !!R.MINIONS[v.kind];
      }

      _spellTarget(sp, pos, auto) {
        const mouse = this._mouseWorld;
        if (sp.kind === 'dot') {
          if (!auto && mouse) {
            const h = this._pickEnemyAt(mouse.x, mouse.y);
            if (h instanceof ChampionView) return h;
            const n = this._nearestEnemyTo(mouse.x, mouse.y, 200, true);
            if (n) return n;
          }
          return this._nearestEnemyTo(pos.x, pos.y, sp.range + 150, true);
        }
        // smite
        if (!auto && mouse) {
          let best = null, bd = 200;
          for (const v of this.views.units.values()) {
            if (!this._smiteable(v)) continue;
            if (v.hitTest(mouse.x, mouse.y)) return v;
            const d = Math.hypot(v.x - mouse.x, v.y - mouse.y);
            if (d < bd) { bd = d; best = v; }
          }
          if (best) return best;
        }
        // Auto: epic › camp monster (biggest) › enemy minion, nearest within reach.
        let best = null, bScore = -Infinity;
        for (const v of this.views.units.values()) {
          if (!this._smiteable(v)) continue;
          const d = Math.hypot(v.x - pos.x, v.y - pos.y);
          if (d > sp.range + 120) continue;
          const cls = R.EPICS[v.kind] ? 3 : v.campId ? 2 : 1;
          const score = cls * 10000 + (v.campId || R.EPICS[v.kind] ? v.maxHp : 0) - d;
          if (score > bScore) { bScore = score; best = v; }
        }
        return best;
      }

      /** Spell aim preview (hovering a D / F slot, and briefly after the cast). */
      _drawSpellAim(g, me, sp, p, flash, a) {
        const col = sp.color ?? 0xffffff;
        const auto = !!this._hoverSlot || this._autoAimWanted(p); // a HUD-slot click auto-aims too
        const aim = flash ? { x: flash.x, y: flash.y } : this._spellAim(sp, p, auto);
        if (sp.kind === 'blink') {
          g.lineStyle(3, col, 0.5 * a); g.strokeCircle(p.x, p.y, sp.range);
          const land = this.world.nav.nearestFree(aim.x, aim.y, CHAMP_RADIUS);
          const over = !this.world.nav.segmentClear(p.x, p.y, land.x, land.y, 4);
          g.lineStyle(4, col, (over ? 0.35 : 0.6) * a); g.lineBetween(p.x, p.y, land.x, land.y);
          g.fillStyle(col, 0.18 * a); g.fillCircle(land.x, land.y, CHAMP_RADIUS + 4);
          g.lineStyle(3, col, 0.95 * a); g.strokeCircle(land.x, land.y, CHAMP_RADIUS + 4);
          if (Math.hypot(land.x - aim.x, land.y - aim.y) > 6) { // aimed into a wall → nearest free spot
            g.lineStyle(2, col, 0.4 * a); g.strokeCircle(aim.x, aim.y, 18); g.lineBetween(aim.x, aim.y, land.x, land.y);
          }
          if (over && !this._aimTxt.visible) this._aimTxt.setText('⚡ over the wall').setPosition(land.x, land.y - 40).setVisible(true);
          return;
        }
        if (sp.kind === 'dot' || sp.kind === 'smite') {
          g.lineStyle(3, col, 0.5 * a); g.strokeCircle(p.x, p.y, sp.range);
          const r = flash ? null : aim;
          const t = r?.target || null;
          if (t) {
            const tc = r.err ? 0xff4a4a : col;
            g.lineStyle(3, tc, 0.65 * a); g.lineBetween(p.x, p.y - 30, t.x, t.y - 30);
            g.lineStyle(4, tc, 0.95 * a); g.strokeCircle(t.x, t.y, Math.max(40, (t.size || 60) * 0.7));
            g.lineStyle(2, 0xffffff, 0.5 * a); g.strokeCircle(t.x, t.y, Math.max(48, (t.size || 60) * 0.7) + 8);
            if (sp.kind === 'smite' && !r.err && !this._aimTxt.visible) {
              const dmg = Math.round(R.scaledAmount(sp.dmg, me.level || 1, 0, 0));
              const v = this._viewOf(t.id), kill = v && v.hp <= dmg;
              this._aimTxt.setText(kill ? `💀 ${dmg} — KILL` : `💀 ${dmg}`).setPosition(t.x, t.y - (t.size || 60) - 30).setVisible(true);
            }
          } else if (flash) {
            g.lineStyle(4, col, 0.9 * a); g.strokeCircle(flash.x, flash.y, 46);
          }
          return;
        }
        if (sp.kind === 'heal') {
          g.fillStyle(col, 0.05 * a); g.fillCircle(p.x, p.y, sp.radius);
          g.lineStyle(2, col, 0.5 * a); g.strokeCircle(p.x, p.y, sp.radius);
          let best = null, worst = 1;
          for (const v of this.views.champs.values()) {
            if (v.dead || v.team !== this.myTeam || v.id === this.localId) continue;
            if (Math.hypot(v.x - p.x, v.y - p.y) > sp.radius) continue;
            const f = v.hp / Math.max(1, v.maxHp);
            if (f < worst) { worst = f; best = v; }
          }
          if (best) { g.lineStyle(3, col, 0.85 * a); g.strokeCircle(best.x, best.y, 44); g.lineBetween(p.x, p.y - 30, best.x, best.y - 30); }
        }
        g.lineStyle(4, col, 0.85 * a); g.strokeEllipse(p.x, p.y, 110, 40);
      }

      /** Ongoing spell visuals from buff tags: Overtime trail (ghost) + Escalate flames (ignited). */
      _spellTrails(id, v, c, now) {
        const b = c.buffs;
        if (!b || v.dead) return;
        const ghost = b.includes('ghost'), ign = b.includes('ignited');
        if (!ghost && !ign) return;
        let t = this._trailAt.get(id);
        if (!t) { t = { g: 0, i: 0 }; this._trailAt.set(id, t); }
        if (ghost && now >= t.g && (b === 'ghost' || /(^|,)ghost(,|$)/.test(b))) { t.g = now + 70; this.fx.ghostTrail(v.x, v.y, SPELLS.ghost.color); }
        if (ign && now >= t.i && /(^|,)ignited(,|$)/.test(b)) { t.i = now + 110; this.fx.flames(v.x + (Math.random() - 0.5) * 40, v.y - 20 - Math.random() * 60, SPELLS.ignite.color); }
      }

      _toggleInfo() {
        if (!this.info || this._ended) return;
        if (!this.info.isOpen && !CHAMPIONS[this._me()?.champ]) return;
        this.info.toggle(this.localId);
        if (this.info.isOpen) this._updateInfo(true);
        AudioManager.uiClick?.();
      }

      _updateInfo(force) {
        if (!this.info?.isOpen) return;
        const now = this.time.now;
        if (!force && now < (this._infoAt || 0)) return;
        this._infoAt = now + 250;
        const st = this._state(), c = st?.champions?.get?.(this.info.sid || this.localId);
        if (!c) { this.info.close(); return; }
        const srvNow = this._srvNow(), tm = c.team === 'blue' ? 'Blue' : 'Red';
        const buffPct = st[`buff${tm}`] === 'deadline' && (st[`buff${tm}Until`] || 0) > srvNow ? (R.EPICS.deadline.buff?.dmgPct || 0) : 0;
        try { this.info.update({ c, srvNow, buffPct }); } catch (e) { console.warn('[TeamMode] InfoPanel update failed:', e?.message); this.info.close(); }
      }

      // ───────────────────────── v4: effects quality (auto / high / low) ─────────────────────────
      _initQuality() {
        let pref = 'auto';
        try { pref = window.localStorage?.getItem(FX_PREF_KEY) || 'auto'; } catch (_) { /* storage blocked */ }
        const q = new URLSearchParams(window.location.search).get('fx');
        if (q === 'auto' || q === 'high' || q === 'low') pref = q;
        if (pref !== 'high' && pref !== 'low') pref = 'auto';
        this._fxPref = pref; this._lowFx = false; this._fpsBadSince = 0; this._fpsCheckAt = 0;
        this._applyQuality(pref === 'low', true);
      }

      /** Auto: FPS < LOW_FPS for LOW_FPS_MS while playing → low effects (one-way for this match). */
      _tickQuality(now) {
        if (now < this._fpsCheckAt) return;
        this._fpsCheckAt = now + 500;
        if (this._fxPref !== 'auto' || this._lowFx || this._phase !== 'playing' || document.hidden
          || now - this._playingAt < FPS_WARMUP_MS) { this._fpsBadSince = 0; return; }
        const fps = this.game.loop.actualFps;
        if (fps >= LOW_FPS) { this._fpsBadSince = 0; return; }
        if (!this._fpsBadSince) { this._fpsBadSince = now; return; }
        if (now - this._fpsBadSince >= LOW_FPS_MS) {
          this._applyQuality(true);
          this.hud.toast(`⚙ Low effects on (${Math.round(fps)} FPS) — ✨ under the minimap to change`, '#9fdcff');
        }
      }

      _cycleFxPref() {
        const next = { auto: 'high', high: 'low', low: 'auto' }[this._fxPref] || 'auto';
        this._fxPref = next;
        try { window.localStorage?.setItem(FX_PREF_KEY, next); } catch (_) { /* storage blocked */ }
        this._fpsBadSince = 0;
        this._applyQuality(next === 'low');
        this.hud.toast(`✨ Effects: ${next.toUpperCase()}${next === 'auto' ? ' (drops to low below 45 FPS)' : ''}`, '#9fdcff');
        AudioManager.uiClick?.();
      }

      _applyQuality(low, init = false) {
        low = !!low;
        const changed = low !== this._lowFx;
        this._lowFx = low;
        this.fx.setQuality?.(low);
        this.map.setQuality?.(low);
        this.hud.setFxMode?.(this._fxPref, low);
        if (!changed && !init) return;
        for (const v of this.views.champs.values()) v.light?.setVisible(!low);
        for (const v of this.views.units.values()) v.glow?.setVisible(!low);
        if (low && this._grayFx) {
          try { this.cameras.main.postFX.remove(this._grayFx); } catch (_) { /* camera gone */ }
          this._grayFx = null;
        } else if (!low && this._meDead && !this._grayFx) this._setGray(true);
      }
    }

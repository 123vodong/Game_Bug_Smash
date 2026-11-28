// TeamLobbyScene — Team Mode ("Office Siege", 5v5 office MOBA) queue screen.
// Browse the 18 champions (grouped by lane, filter chips, costume portraits from
// looks.js) — the highlighted card is your FAVOURITE (= first hover in champ select),
// set a display name, then QUICK MATCH → joins the Colyseus room 'team' and shows the
// queue overlay ("Searching… humans n · starts in Xs", START NOW, CANCEL), or
// CUSTOM ROOMS → TeamCustomScene (v4: named rooms, pick a side, host starts).
//   keys: ← → ↑ ↓ / 1–9 browse · ENTER quick match (queue: start now) · C custom rooms
//         O practice offline
//         ESC back (queue: cancel) · click the name to edit
//   joined room, phase 'select' (or later) → scene.start('TeamSelectScene', { room, clockOffset, clockRtt })
// Server clock: contract §3.6 'time' message (startClockSync in uiKit), sampled while queued.
//   PRACTICE OFFLINE → scene.start('TeamSelectScene', { offline: true, name })
// All champion numbers come from shared/moba/*.js (read-only) — nothing mirrored here.
// NOTE: we never send 'hello' here — the server answers it only ONCE per client and
// TeamModeScene needs that 'welcome' after the handoff.
// Ranked profile, one-tab takeover, and rejoin are part of the current Team Mode flow.
// the queue waits ~30 s with a READY check, DUP_TAB → PLAY HERE, IN_MATCH / a saved match → REJOIN.
import { CHAMPIONS, CHAMPION_IDS, ROLE_ORDER, isChampionId } from '../../shared/moba/champions.js';
import { ensureMobaLooks, drawChampionPortrait } from '../entities/moba/looks.js';
import { TEAM_INFO, ULT_UNLOCK_LEVEL, LOBBY_MAX_MS, TEAM_SIZE } from '../../shared/moba/rules.js';
import { SaveManager } from '../core/SaveManager.js';
import { getPid, takeover, joinError, fetchMe, loadMatch, clearMatch, DUP_TAB_TEXT } from '../core/Identity.js';
import { LeaderboardPanel } from '../ui/LeaderboardPanel.js';
import { TIERS } from '../../shared/moba/ranks.js';
import { AudioManager } from '../core/AudioManager.js';
import { tText, t } from '../core/I18n.js';
import {
  FONT_TITLE, FONT_MONO, NEON, hex, glow, drawPanel, makePill, makeButton, clipName,
  fillRR, strokeRR, fillCircleLP, strokeCircleLP, fadeToScene, teamServerUrl, startClockSync,
  LANE_LABEL, SKILL_TYPE_LABEL as TYPE_LABEL, skillTags, skillFacts, mechanicHints,
} from '../ui/moba/uiKit.js';

// HTTP stats API next to the game server: same origin as the page (the Node server
// serves both), except the :8000 python dev server → :2567 (matches teamServerUrl()).
const STATS_URL = (() => {
  const loc = window.location;
  if (loc.port === '8000') return `http://${loc.hostname || 'localhost'}:2567/api/stats`;
  return `${loc.origin}/api/stats`;
})();

const NAME_MAX = 16;
const COLS = 6;   // 18 champions → 6 × 3
// Cards grouped by lane (top → jungle → mid → bot → support), then roster order.
const ORDER = [...CHAMPION_IDS].sort((a, b) => {
  const la = ROLE_ORDER.indexOf(CHAMPIONS[a].lane), lb = ROLE_ORDER.indexOf(CHAMPIONS[b].lane);
  return (la - lb) || (CHAMPION_IDS.indexOf(a) - CHAMPION_IDS.indexOf(b));
});
const FILTERS = ['all', ...ROLE_ORDER];
const STICK_POSES = [['stick-idle', 'idle.svg']];   // portraits only need the idle pose

// ── Layout (1280×720 canvas) ──
const CHIPS = { x: 24, y: 130, h: 22 };
const CARD = { x: 24, y: 150, w: 74, h: 112, gap: 5.2 };
const DETAIL = { x: 510, y: 116, w: 746, h: 476 };
const NAMEBOX = { x: 24, y: 514, w: 470, h: 78 };
const HOWTO = { x: 24, y: 606, w: 668, h: 98 };
// v4: three buttons right of HOW TO PLAY (x 704 … 1256).
const PRACTICE = { x: 775, y: 655, w: 142, h: 92 };
const CUSTOM = { x: 951, y: 655, w: 186, h: 92 };
const PLAY = { x: 1156, y: 655, w: 200, h: 92 };
const LEFT_COL = { x: DETAIL.x + 20, w: 256 };          // blurb + stat bars
const SKILLS = { x: DETAIL.x + 300, w: 426, y: DETAIL.y + 130, rowH: 82, step: 84 };

const DIFF_LABEL = ['', 'EASY', 'MEDIUM', 'HARD'];
const ROLE_TIPS = {
  Mage: 'Poke with skillshots from range, then finish them with your R.',
  Tank: 'Soak tower shots, start the fights, protect your carries.',
  Support: 'Stick with your bot laner — heals and speed win fights.',
  Marksman: 'Last-hit bugs, buy attack gear, melt towers late game.',
  Assassin: 'Farm the jungle camps, then dive enemies who are low.',
  Controller: 'Slow and root them first, then drop the big one.',
  Jungler: 'Clear camps between the lanes, then gank a lane that is pushed.',
  Fighter: 'Trade hits in lane, then dive into the backline in fights.',
};

// Stat bars (normalized across the roster so the differences read at a glance).
const STATS = [
  { label: 'HEALTH', color: 0x7ed957, val: (c) => c.base.hp, txt: (c) => `${c.base.hp}  (+${c.growth.hp}/lv)` },
  { label: 'ATTACK', color: 0xff9f43, val: (c) => c.base.ad * c.base.as, txt: (c) => `${c.base.ad} dmg · ${c.base.as.toFixed(2)} hits/s` },
  { label: 'DEFENSE', color: 0x39c2ff, val: (c) => c.base.armor, txt: (c) => `${c.base.armor} armor  (+${c.growth.armor}/lv)` },
  { label: 'RANGE', color: 0xc44dff, val: (c) => c.base.range, txt: (c) => `${c.base.range} · ${c.ranged ? 'ranged' : 'melee'}` },
  { label: 'SPEED', color: 0xffd23f, val: (c) => c.base.ms, txt: (c) => `${c.base.ms} move speed` },
];


export default class TeamLobbyScene extends Phaser.Scene {
  constructor() { super('TeamLobbyScene'); }

  preload() {
    for (const [key, file] of STICK_POSES) {
      if (!this.textures.exists(key)) this.load.svg(key, `assets/characters/stickman/${file}`, { width: 144, height: 144 });
    }
  }

  init(data) {
    this._autoQueue = !!data?.autoQueue; // round 2: PLAY AGAIN after a quick match queues right away
    this._rejoinAsk = !!data?.rejoin;    // Pass 2: came here to REJOIN a running match
    this._prompt = null;
    this._panel = null;
    this._leaving = false;
    this._editing = false;
    this._ignoreKeysUntil = 0;
    this._cards = [];
    this._statBars = [];
    this._dyn = null;
    this._filter = 'all';
    this._chips = [];
    this._quoteEvt = null;
    this._nameEl = null;
    this._queue = null;
    this._handedOff = false;
    this._shuttingDown = false;
    this._guestName = null;
  }

  create() {
    const { width: W, height: H } = this.scale;
    this.W = W; this.H = H;
    AudioManager.setMuted(SaveManager.isMuted());

    ensureMobaLooks(this);
    const saved = SaveManager.getTeamChamp();
    this._idx = Math.max(0, ORDER.indexOf(saved));
    this._name = SaveManager.getPlayerName() || '';
    // Bar scale per stat: lo = 80% of the roster minimum, hi = roster maximum, so
    // the bars show real differences without turning a 2% gap into a 90% one.
    this._ranges = STATS.map((st) => {
      const vals = CHAMPION_IDS.map((id) => st.val(CHAMPIONS[id]));
      return { min: Math.min(...vals) * 0.8, max: Math.max(...vals) };
    });

    this._drawBackground();
    this._drawHeader();
    this._drawChips();
    this._drawCards();
    this._drawDetailFrame();
    this._drawNameBox();
    this._drawHowTo();
    this._drawPlayButton();
    this._refreshServerStatus();

    this._select(this._idx, { silent: true, instant: true, force: true });
    this._bindKeys();
    this.events.once('shutdown', () => this._cleanup());
    this.cameras.main.fadeIn(280, 0, 0, 0);
    this._refreshRank();
    if (this._rejoinAsk || loadMatch()) {
      this._rejoinAsk = false;
      this.time.delayedCall(250, () => { if (!this._shuttingDown && !this._leaving) this._checkRejoin(); });
    } else if (this._autoQueue) {
      this._autoQueue = false;
      this.time.delayedCall(350, () => { if (!this._shuttingDown && !this._leaving && !this._queue) this._findMatch(); });
    }
  }

  // ───────────────────────── Pass 2: rank + rejoin ─────────────────────────
  /** Your Team Mode rank under the server status (falls back to the local W/L line offline). */
  async _refreshRank() {
    const me = await fetchMe();
    if (this._shuttingDown || !this._careerText?.scene) return;
    const r = me?.rank;
    if (!r) return;
    const t = TIERS.find((x) => x.id === r.tier) || TIERS[0];
    const txt = `${t.emoji} ${r.label} ${r.starText || ''} · ${r.wins}W ${r.losses}L`
      + (r.placementLeft > 0 ? ` · placement ${r.games}/${r.games + r.placementLeft}` : '');
    this._careerText.setText(txt).setColor(t.css);
  }

  /** A saved / server-known running match → REJOIN prompt (also after an IN_MATCH join error). */
  async _checkRejoin(fromError = false) {
    const saved = loadMatch();
    const me = await fetchMe();
    if (this._shuttingDown || this._leaving) return;
    const m = me?.match;
    if (!m) {
      if (saved) clearMatch();
      if (fromError) this._openPrompt({ title: '🏁 That match is over', body: 'Your last match already ended. Queue up again!', primary: { label: '▶ QUICK MATCH', fn: () => { this._closePrompt(); this._findMatch(); } } });
      return;
    }
    const canRejoin = !!saved && saved.roomId === m.roomId;
    if (m.connected) {
      this._openPrompt({
        title: DUP_TAB_TEXT.title, body: 'You are in a running match in another tab.\nPlay it here instead? The other tab will be closed.',
        primary: canRejoin ? { label: '▶ PLAY HERE', sub: 'ENTER', fn: async () => { this._promptBusy('closing the other tab…'); await takeover(); setTimeout(() => this._rejoin(loadMatch() || saved), 500); } } : null,
        secondary: { label: '◀ BACK', sub: 'ESC', fn: () => this._closePrompt() },
      });
      return;
    }
    if (!canRejoin) {
      this._openPrompt({ title: '⚔️ You still have a seat in a match', body: 'It was started from another browser — a bot plays it until it ends.\nYou can queue again once it is over.', secondary: { label: 'OK', sub: 'ESC', fn: () => this._closePrompt() } });
      return;
    }
    const ph = { select: 'champion select', loading: 'loading', playing: 'in progress' }[m.phase] || m.phase;
    const champ = CHAMPIONS[saved.champ];
    this._openPrompt({
      title: '⚔️ YOUR MATCH IS STILL RUNNING',
      body: `${champ ? `${champ.emoji} ${champ.name} · ` : ''}${ph} — a bot is holding your laptop.\nJump back in?`,
      primary: { label: '⟳ REJOIN', sub: 'ENTER', fn: () => this._rejoin(saved) },
      secondary: { label: '✕ LEAVE IT', sub: 'counts as a loss', fn: () => this._abandonSaved(saved) },
    });
  }

  /** Reconnect with the saved token and hand the room to the right scene. */
  async _rejoin(saved) {
    if (!saved || typeof Colyseus === 'undefined') { this._closePrompt(); return; }
    this._promptBusy('reconnecting…');
    try {
      const client = new Colyseus.Client(teamServerUrl());
      const room = await client.reconnect(saved.token);
      if (this._shuttingDown) { try { room.leave(); } catch (_) { /* ignore */ } return; }
      if (!room.state?.phase) {
        await new Promise((res) => {
          const t = setTimeout(res, 3000);
          const once = () => { clearTimeout(t); res(); };
          try { (room.onStateChange.once || room.onStateChange).call(room.onStateChange, once); } catch (_) { res(); }
        });
      }
      const ph = room.state?.phase;
      this._closePrompt();
      this._handedOff = true;
      this._leaving = true;
      AudioManager.reward?.();
      const champ = isChampionId(saved.champ) ? saved.champ : ORDER[this._idx];
      if (ph === 'select') this.scene.start('TeamSelectScene', { room, name: this._playerName(), champ, custom: !!saved.custom });
      else this.scene.start('TeamModeScene', { room, champ, name: this._playerName() });
    } catch (e) {
      console.warn('[TeamLobby] rejoin failed:', e?.message || e);
      clearMatch();
      if (this._shuttingDown) return;
      this._openPrompt({ title: '🏁 That match is over', body: 'It ended while you were away — the bot finished your shift.', primary: { label: '▶ QUICK MATCH', sub: 'ENTER', fn: () => { this._closePrompt(); this._findMatch(); } }, secondary: { label: 'OK', sub: 'ESC', fn: () => this._closePrompt() } });
    }
  }

  /** LEAVE IT: reconnect, then leave on purpose — the bot keeps the seat (the result still counts). */
  async _abandonSaved(saved) {
    this._promptBusy('leaving the match…');
    try {
      const room = await new Colyseus.Client(teamServerUrl()).reconnect(saved.token);
      await room.leave(true);
    } catch (_) { /* already over */ }
    clearMatch();
    this._closePrompt();
  }

  /** Small modal (title, body, ≤ 2 buttons). ENTER = primary, ESC = secondary (or close). */
  _openPrompt({ title, body, primary = null, secondary = null }) {
    this._closePrompt();
    const { W, H } = this;
    const c = this.add.container(0, 0).setDepth(120);
    const dim = this.add.rectangle(0, 0, W, H, 0x02040a, 0.8).setOrigin(0).setInteractive();
    dim.on('pointerup', (p, lx, ly, ev) => ev?.stopPropagation?.());
    const pw = Math.min(640, W - 32), ph = 260, px = (W - pw) / 2, py = (H - ph) / 2;
    const g = this.add.graphics();
    drawPanel(g, px, py, pw, ph, { color: NEON.yellow, radius: 18, halo: 0.14 });
    const t = this.add.text(W / 2, py + 40, title, { fontFamily: FONT_TITLE, fontSize: 22, color: '#ffffff', stroke: '#000000', strokeThickness: 5 }).setOrigin(0.5);
    const b = this.add.text(W / 2, py + 76, body, {
      fontFamily: FONT_MONO, fontSize: 14, color: '#cfe3f5', align: 'center', lineSpacing: 4,
      wordWrap: { width: pw - 48, useAdvancedWrap: true }, padding: { y: 2 },
    }).setOrigin(0.5, 0);
    c.add([dim, g, t, b]);
    const btns = [primary, secondary].filter(Boolean);
    btns.forEach((d, i) => {
      const x = btns.length === 1 ? W / 2 : W / 2 + (i === 0 ? -138 : 138);
      const btn = makeButton(this, { x, y: py + ph - 46, w: 236, h: 56, label: d.label, sub: d.sub || '', color: i === 0 && primary ? NEON.green : NEON.red, fontSize: 17, onClick: () => d.fn?.() });
      c.add(btn.root);
    });
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 160 });
    this._prompt = { c, body: b, primary, secondary, busy: false };
  }

  _promptBusy(text) {
    const p = this._prompt;
    if (!p) return;
    p.busy = true;
    p.body.setText(text).setColor('#7ec8ff');
  }

  _closePrompt() {
    const p = this._prompt;
    if (!p) return;
    this._prompt = null;
    this._ignoreKeysUntil = this.time.now + 150;
    p.c.destroy();
  }

  // ───────────────────────── background + header ─────────────────────────
  _drawBackground() {
    const { W, H } = this;
    // Static backdrop is drawn ONCE into a canvas texture (one quad per frame
    // instead of re-tessellating 24 huge glow circles + the grid every frame).
    const KEY = 'team-lobby-bg';
    if (this.textures.exists(KEY)) {
      this.add.image(0, 0, KEY).setOrigin(0).setDepth(-10);
    } else {
      const g = this.add.graphics();
      this._paintBackdrop(g, W, H);
      g.generateTexture(KEY, W, H);
      g.destroy();
      this.add.image(0, 0, KEY).setOrigin(0).setDepth(-10);
    }
    // Faint team watermarks.
    this.add.text(150, H - 150, TEAM_INFO.blue.emoji, { fontSize: 180, padding: { y: 20 } })
      .setOrigin(0.5).setAlpha(0.06).setAngle(-12).setDepth(-9);
    this.add.text(W - 150, 150, TEAM_INFO.red.emoji, { fontSize: 180, padding: { y: 20 } })
      .setOrigin(0.5).setAlpha(0.06).setAngle(10).setDepth(-9);
    // Drifting team-colored sparks (each destroys itself → bounded count).
    this.time.addEvent({ delay: 240, loop: true, callback: () => this._spark() });
  }

  _paintBackdrop(g, W, H) {
    g.fillStyle(0x060a12, 1);
    g.fillRect(0, 0, W, H);
    // Team glows: 🚀 Startup bottom-left (blue), 🏢 MegaCorp top-right (red).
    const glow = (x, y, r, col) => {
      for (let i = 12; i >= 1; i--) { g.fillStyle(col, 0.018); g.fillCircle(x, y, (r * i) / 12); }
    };
    glow(60, H + 60, 780, TEAM_INFO.blue.color);
    glow(W - 60, -60, 780, TEAM_INFO.red.color);
    // Blueprint grid + the "front line" diagonal.
    g.lineStyle(1, 0x22344f, 0.26);
    for (let x = 0; x <= W; x += 40) g.lineBetween(x, 0, x, H);
    for (let y = 0; y <= H; y += 40) g.lineBetween(0, y, W, y);
    g.lineStyle(2, 0xffffff, 0.035);
    g.lineBetween(0, H, W, 0);
  }

  _spark() {
    const blue = Math.random() < 0.5;
    const col = blue ? TEAM_INFO.blue.color : TEAM_INFO.red.color;
    const x = blue ? Math.random() * this.W * 0.55 : this.W * 0.45 + Math.random() * this.W * 0.55;
    const y = blue ? this.H + 6 : -6;
    const p = this.add.circle(x, y, 1.4 + Math.random() * 2, col, 0.85).setDepth(-5);
    const dist = 160 + Math.random() * 260;
    this.tweens.add({
      targets: p, y: blue ? y - dist : y + dist, x: x + (Math.random() - 0.5) * 60, alpha: 0,
      duration: 2600 + Math.random() * 1600, ease: 'Sine.easeOut', onComplete: () => p.destroy(),
    });
  }

  _drawHeader() {
    const cx = this.W / 2;
    // Title: OFFICE SIEGE — 5v5
    const t1 = this.add.text(0, 40, 'OFFICE SIEGE', {
      fontFamily: FONT_TITLE, fontSize: 40, color: '#ffffff', stroke: '#000000', strokeThickness: 7,
    }).setOrigin(0, 0.5).setDepth(5);
    const p1 = glow(t1, '#00d9ff', 14);
    const t2 = this.add.text(0, 40, ' — 5v5', {
      fontFamily: FONT_TITLE, fontSize: 40, color: '#ffd23f', stroke: '#000000', strokeThickness: 7,
    }).setOrigin(0, 0.5).setDepth(5);
    const p2 = glow(t2, '#ffd23f', 12);
    const w1 = t1.width - 2 * p1, w2 = t2.width - 2 * p2;   // glyph widths (minus glow padding)
    t1.x = Math.round(cx - (w1 + w2) / 2 - p1);
    t2.x = t1.x + p1 + w1 - p2;

    // 🚀 STARTUP  (VS)  MEGACORP 🏢
    const blue = TEAM_INFO.blue, red = TEAM_INFO.red;
    const teamStyle = (css) => ({
      fontFamily: FONT_TITLE, fontSize: 17, color: css, stroke: '#000000', strokeThickness: 4,
    });
    const l = this.add.text(cx - 28, 79, `${blue.emoji} ${blue.name.toUpperCase()}`, teamStyle(blue.css))
      .setOrigin(1, 0.5).setDepth(5);
    l.x += glow(l, blue.css, 9);
    const r = this.add.text(cx + 28, 79, `${red.name.toUpperCase()} ${red.emoji}`, teamStyle(red.css))
      .setOrigin(0, 0.5).setDepth(5);
    r.x -= glow(r, red.css, 9);
    this.add.circle(cx, 79, 16, 0x0a0a14, 1).setStrokeStyle(2, 0xffffff, 0.7).setDepth(5);
    this.add.text(cx, 79, 'VS', {
      fontFamily: FONT_TITLE, fontSize: 12, color: '#ffffff',
    }).setOrigin(0.5).setDepth(6);

    this.add.text(cx, 103,
      'QUICK MATCH or a CUSTOM ROOM → draft your champion with your team → fight.  ·  Browse the roster: the highlighted card is your favourite', {
        fontFamily: FONT_MONO, fontSize: 12, color: '#8fa3bf', padding: { y: 2 },
      }).setOrigin(0.5).setDepth(5);

    // BACK (top-left) + ESC hint
    makeButton(this, {
      x: 84, y: 38, w: 124, h: 40, label: t('ui.back'), color: NEON.teal, fontSize: 14,
      onClick: () => this._back(),
    }).root.setDepth(10);
    this.add.text(84, 68, 'ESC', { fontFamily: FONT_MONO, fontSize: 10, color: '#4f6380' })
      .setOrigin(0.5).setDepth(10);

    // Server status (top-right)
    this._statusText = this.add.text(this.W - 24, 30, '● checking server…', {
      fontFamily: FONT_MONO, fontSize: 12, color: '#7ec8ff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(1, 0.5).setDepth(10);
    this._careerText = this.add.text(this.W - 24, 50, this._careerLine(), {
      fontFamily: FONT_MONO, fontSize: 11, color: '#ffd23f', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(1, 0.5).setDepth(10).setAlpha(0.85);
    // Pass 2 RP-13: leaderboard
    makeButton(this, {
      x: this.W - 84, y: 84, w: 120, h: 32, label: t('lobby.ranks'), color: NEON.yellow, fontSize: 13,
      onClick: () => {
        if (this._queue || this._prompt || this._leaving || (this._panel && !this._panel.closed)) return;
        AudioManager.uiClick();
        this._panel = LeaderboardPanel.open(this, { onClose: () => { this._ignoreKeysUntil = this.time.now + 150; } });
      },
    }).root.setDepth(10);
  }

  _careerLine() {
    const c = SaveManager.getCareer();
    const games = c.teamGames | 0, wins = c.teamWins | 0;
    return games > 0 ? `siege record · ${wins}W ${games - wins}L` : 'first siege? pick an EASY ★ champion';
  }

  async _refreshServerStatus() {
    const t = this._statusText;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(STATS_URL, { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (t.scene) t.setText('● server online').setColor('#7ed957');
    } catch (_) {
      if (t.scene) t.setText('● server offline (start: node server/index.js)').setColor('#ff8a8a');
    }
  }

  // ───────────────────────── lane filter chips ─────────────────────────
  _drawChips() {
    let x = CHIPS.x;
    this.add.text(x, CHIPS.y, 'LANE', { fontFamily: FONT_TITLE, fontSize: 10, color: '#4f6380' })
      .setOrigin(0, 0.5).setDepth(5);
    x += 40;
    for (const f of FILTERS) {
      const label = f === 'all' ? `ALL ${ORDER.length}` : (LANE_LABEL[f] || f.toUpperCase()).replace(' LANE', '');
      const t = this.add.text(0, 0, label, { fontFamily: FONT_TITLE, fontSize: 10, color: '#cfe3f5' }).setOrigin(0.5);
      const w = Math.ceil(t.width + 16), h = CHIPS.h;
      const c = this.add.container(x + w / 2, CHIPS.y).setDepth(5);
      const g = this.add.graphics();
      const hit = this.add.rectangle(0, 0, w, h + 8, 0xffffff, 0).setInteractive({ useHandCursor: true });
      c.add([g, t, hit]);
      const chip = { f, g, t, w, h };
      hit.on('pointerup', () => { if (!this._leaving) this._setFilter(f); });
      this._chips.push(chip);
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
    this._filter = f;
    AudioManager.uiClick();
    this._paintChips();
    this._cards.forEach((card) => {
      const on = f === 'all' || card.champ.lane === f;
      this.tweens.add({ targets: card.outer, alpha: on ? 1 : 0.28, duration: 160 });
    });
    const cur = CHAMPIONS[ORDER[this._idx]];
    if (f !== 'all' && cur.lane !== f) {
      const i = ORDER.findIndex((id) => CHAMPIONS[id].lane === f);
      if (i >= 0) this._select(i);
    }
  }

  // ───────────────────────── champion cards ─────────────────────────
  _drawCards() {
    const { w, h } = CARD;
    ORDER.forEach((id, i) => {
      const champ = CHAMPIONS[id];
      const col = i % COLS, row = Math.floor(i / COLS);
      const cx = CARD.x + col * (w + CARD.gap) + w / 2;
      const cy = CARD.y + row * (h + CARD.gap) + h / 2;
      const outer = this.add.container(cx, cy).setDepth(5);
      const inner = this.add.container(0, 0);       // lift / hover scale (outer = intro)
      outer.add(inner);
      const ox = -w / 2, oy = -h / 2;

      const halo = this.add.graphics();
      halo.fillStyle(champ.color, 1);
      fillRR(halo, ox - 6, oy - 6, w + 12, h + 12, 14);
      halo.setAlpha(0.25).setVisible(false);
      const g = this.add.graphics();
      const digit = this.add.text(ox + 15, oy + 14, i < 9 ? String(i + 1) : '', {
        fontFamily: FONT_TITLE, fontSize: 10, color: '#ffffff',
      }).setOrigin(0.5);
      const d = Math.max(1, Math.min(3, champ.difficulty | 0));
      const stars = this.add.text(ox + w - 8, oy + 14, '★'.repeat(d) + '☆'.repeat(3 - d), {
        fontFamily: 'Arial, sans-serif', fontSize: 10, color: '#ffd23f',
      }).setOrigin(1, 0.5);
      const emoji = drawChampionPortrait(this, id, 0, oy + 42, 58);
      const name = this.add.text(0, oy + 82, champ.name, {
        fontFamily: FONT_TITLE, fontSize: 15, color: '#ffffff', stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5);
      const role = makePill(this, 0, oy + 100, champ.role.toUpperCase(), { color: champ.color, fontSize: 8, padX: 6 });
      role.x = -role.pillW / 2;
      const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0).setInteractive({ useHandCursor: true });
      inner.add([halo, g, digit, stars, emoji, name, role, hit]);

      const card = { id, champ, outer, inner, g, halo, emoji, hover: false, digit: i < 9 };
      hit.on('pointerover', () => {
        card.hover = true;
        this._paintCard(card, i === this._idx);
        AudioManager.uiHover();
      });
      hit.on('pointerout', () => { card.hover = false; this._paintCard(card, i === this._idx); });
      hit.on('pointerup', () => { if (!this._leaving) this._select(i); });
      this._cards.push(card);

      // Intro: stagger in
      outer.setAlpha(0);
      outer.y = cy + 22;
      this.tweens.add({
        targets: outer, alpha: 1, y: cy, duration: 320, delay: 60 + i * 35, ease: 'Back.easeOut',
      });
    });
    // One shared pulse for the selected card's halo.
    this.tweens.add({
      targets: this._cards.map((c) => c.halo), alpha: { from: 0.14, to: 0.4 },
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  _paintCard(card, selected) {
    const { g, champ, inner, halo } = card;
    const { w, h } = CARD;
    const ox = -w / 2, oy = -h / 2;
    const col = champ.color;
    g.clear();
    g.fillStyle(0x000000, 0.5);
    fillRR(g, ox + 3, oy + 6, w, h, 12);
    g.fillStyle(selected ? 0x0f1a2c : (card.hover ? 0x0d1422 : 0x0a0e18), 0.96);
    fillRR(g, ox, oy, w, h, 12);
    if (selected) { g.fillStyle(col, 0.13); fillRR(g, ox, oy, w, h, 12); }
    g.lineStyle(selected ? 3 : 1.5, col, selected ? 1 : (card.hover ? 0.85 : 0.38));
    strokeRR(g, ox, oy, w, h, 12);
    // number badge
    if (card.digit) {
      g.fillStyle(selected ? col : 0x1a2233, selected ? 0.9 : 1);
      fillRR(g, ox + 6, oy + 6, 18, 16, 5);
    }
    // portrait glow
    g.fillStyle(col, selected ? 0.3 : 0.12);
    fillCircleLP(g, 0, oy + 42, 33);
    halo.setVisible(selected);

    this.tweens.killTweensOf(inner);
    this.tweens.add({
      targets: inner, y: selected ? -6 : 0, scale: card.hover && !selected ? 1.035 : 1,
      duration: 150, ease: 'Cubic.easeOut',
    });
  }

  _select(i, { silent = false, instant = false, force = false } = {}) {
    const n = ORDER.length;
    i = ((i % n) + n) % n;
    const changed = force || i !== this._idx;
    this._idx = i;
    this._cards.forEach((card, k) => this._paintCard(card, k === i));
    if (!changed) return;
    const id = ORDER[i];
    SaveManager.setTeamChamp(id);
    this._renderDetail(CHAMPIONS[id], instant);
    if (!silent) {
      AudioManager.uiClick();
      const card = this._cards[i];
      this.tweens.add({ targets: card.emoji, scale: { from: 1.35, to: 1 }, duration: 260, ease: 'Back.easeOut' });
    }
  }

  // ───────────────────────── detail panel ─────────────────────────
  _drawDetailFrame() {
    this._detailG = this.add.graphics().setDepth(4);
    // Persistent stat bars (tween between champions).
    const x = LEFT_COL.x, w = LEFT_COL.w;
    this._statsLabel = this.add.text(x, DETAIL.y + 192, 'BASE STATS · LV 1', {
      fontFamily: FONT_TITLE, fontSize: 11, color: '#7ec8ff',
    }).setOrigin(0, 0.5).setDepth(6);
    STATS.forEach((st, k) => {
      const y = DETAIL.y + 212 + k * 46;
      const label = this.add.text(x, y, st.label, {
        fontFamily: FONT_TITLE, fontSize: 11, color: hex(st.color),
      }).setOrigin(0, 0.5).setDepth(6);
      const value = this.add.text(x + w, y, '', {
        fontFamily: FONT_MONO, fontSize: 11, color: '#cfe3f5',
      }).setOrigin(1, 0.5).setDepth(6);
      const bg = this.add.rectangle(x, y + 17, w, 9, 0x1a2233, 1).setOrigin(0, 0.5).setDepth(6);
      const fill = this.add.rectangle(x, y + 17, w, 9, st.color, 1).setOrigin(0, 0.5).setDepth(6);
      fill.scaleX = 0.001;
      const ticks = this.add.graphics().setDepth(7);
      ticks.lineStyle(1, 0x060a12, 0.9);
      for (let t = 1; t < 10; t++) ticks.lineBetween(x + (w * t) / 10, y + 13, x + (w * t) / 10, y + 21);
      this._statBars.push({ label, value, bg, fill });
    });
  }

  _paintDetailFrame(col) {
    const g = this._detailG;
    const D = DETAIL;
    g.clear();
    drawPanel(g, D.x, D.y, D.w, D.h, { color: col, radius: 16, halo: 0.12 });
    g.lineStyle(1, col, 0.35);
    g.lineBetween(D.x + 18, D.y + 118, D.x + D.w - 18, D.y + 118);
    g.lineStyle(1, 0xffffff, 0.08);
    g.lineBetween(D.x + 288, D.y + 128, D.x + 288, D.y + D.h - 14);
  }

  _renderDetail(c, instant) {
    const D = DETAIL;
    const col = c.color;
    // Drop the previous champion's layer (+ its tweens / typewriter).
    if (this._dyn) {
      this.tweens.killTweensOf([this._dyn, ...this._dyn.list]);
      this._dyn.destroy();
    }
    if (this._quoteEvt) { this._quoteEvt.remove(false); this._quoteEvt = null; }
    this._paintDetailFrame(col);

    const dyn = this.add.container(0, 0).setDepth(6);
    this._dyn = dyn;
    const add = (o) => { dyn.add(o); return o; };

    // ── header: portrait, name, title, tags ──
    const px = D.x + 70, py = D.y + 62;
    const ring = add(this.add.graphics());
    ring.fillStyle(col, 0.12); fillCircleLP(ring, px, py, 56);
    ring.fillStyle(0x0a0e18, 1); fillCircleLP(ring, px, py, 46);
    ring.fillStyle(col, 0.22); fillCircleLP(ring, px, py, 46);
    ring.lineStyle(3, col, 1); strokeCircleLP(ring, px, py, 46);
    const portrait = add(drawChampionPortrait(this, c.id, px, py + 2, 90));
    this.tweens.add({ targets: portrait, y: py - 2, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const nx = D.x + 136;
    const name = add(this.add.text(nx, D.y + 36, c.name.toUpperCase(), {
      fontFamily: FONT_TITLE, fontSize: 30, color: '#ffffff', stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0, 0.5));
    name.x -= glow(name, col, 12);
    add(this.add.text(nx + 2, D.y + 68, c.title, {
      fontFamily: FONT_MONO, fontSize: 14, color: '#b7c7da',
    }).setOrigin(0, 0.5));
    let tx = nx;
    const tag = (text, color, opts = {}) => {
      const p = add(makePill(this, tx, D.y + 97, text, { color, fontSize: 9, ...opts }));
      tx += p.pillW + 7;
    };
    const d = Math.max(1, Math.min(3, c.difficulty | 0));
    tag(c.role.toUpperCase(), col);
    tag(LANE_LABEL[c.lane] || c.lane.toUpperCase(), 0x9fb3c8);
    tag(c.ranged ? 'RANGED' : 'MELEE', 0xcfe3f5);
    tag(`${'★'.repeat(d)}${'☆'.repeat(3 - d)} ${DIFF_LABEL[d]}`, NEON.yellow, { font: 'Arial Black, Arial, sans-serif' });

    // ── pick-line speech bubble (top-right) ──
    const bx = D.x + 470, by = D.y + 16, bw = 258, bh = 84;
    const bub = add(this.add.graphics());
    bub.fillStyle(0x0d1524, 1);
    fillRR(bub, bx, by, bw, bh, 12);
    bub.fillTriangle(bx + 2, by + bh - 34, bx - 16, by + bh - 12, bx + 2, by + bh - 18);
    bub.lineStyle(2, col, 0.9);
    strokeRR(bub, bx, by, bw, bh, 12);
    bub.lineBetween(bx, by + bh - 34, bx - 16, by + bh - 12);
    bub.lineBetween(bx - 16, by + bh - 12, bx, by + bh - 18);
    add(this.add.text(bx + 12, by + 13, '💬 ON PICK', {
      fontFamily: FONT_TITLE, fontSize: 9, color: hex(col), padding: { y: 2 },
    }).setOrigin(0, 0.5));
    const quote = add(this.add.text(bx + 14, by + 28, '', {
      fontFamily: FONT_MONO, fontSize: 15, fontStyle: 'italic', color: '#ffd23f',
      wordWrap: { width: bw - 28, useAdvancedWrap: true },
    }));
    const full = `“${(c.lines && c.lines.pick) || '...'}”`;
    if (instant) {
      quote.setText(full);
    } else {
      let n = 0;
      this._quoteEvt = this.time.addEvent({
        delay: 24, repeat: full.length - 1,
        callback: () => { n++; if (quote.scene) quote.setText(full.slice(0, n)); },
      });
    }

    // ── left column: blurb + role tip (stat bars are persistent) ──
    add(this.add.text(LEFT_COL.x, D.y + 132, c.blurb, {
      fontFamily: FONT_MONO, fontSize: 12, color: '#cfe3f5', lineSpacing: 2,
      wordWrap: { width: LEFT_COL.w, useAdvancedWrap: true },
    }));
    const hints = mechanicHints(c);   // v2 mechanics explained first; else the role tip
    const tips = hints.length ? hints.slice(0, 2) : [`💡 ${ROLE_TIPS[c.role] || 'Stick with your team and push.'}`];
    add(this.add.text(LEFT_COL.x, D.y + 424, tips.join('\n'), {
      fontFamily: FONT_MONO, fontSize: 11, color: '#9fb3c8', lineSpacing: 3,
      wordWrap: { width: LEFT_COL.w, useAdvancedWrap: true }, padding: { y: 2 },
    }));

    // ── right column: the 4 skills ──
    const lab = add(this.add.text(SKILLS.x + 4, D.y + 118, ' ABILITIES · aimed at your cursor ', {
      fontFamily: FONT_TITLE, fontSize: 10, color: hex(col), backgroundColor: '#070c18',
    }).setOrigin(0, 0.5));
    lab.setPadding(4, 2, 4, 2);
    ['q', 'w', 'e', 'r'].forEach((slot, k) => {
      const s = c.skills && c.skills[slot];
      if (s) this._skillRow(dyn, c.id, slot, s, SKILLS.x, SKILLS.y + k * SKILLS.step, SKILLS.w, SKILLS.rowH);
    });

    // ── stat bars ──
    STATS.forEach((st, k) => {
      const bar = this._statBars[k];
      const r = this._ranges[k];
      const v = st.val(c);
      const frac = Phaser.Math.Clamp(0.25 + 0.75 * ((v - r.min) / Math.max(1e-6, r.max - r.min)), 0.05, 1);
      bar.value.setText(st.txt(c));
      this.tweens.killTweensOf(bar.fill);
      if (instant) bar.fill.scaleX = frac;
      else this.tweens.add({ targets: bar.fill, scaleX: frac, duration: 320, ease: 'Cubic.easeOut' });
    });

    if (!instant) {
      dyn.setAlpha(0);
      dyn.x = 14;
      this.tweens.add({ targets: dyn, alpha: 1, x: 0, duration: 200, ease: 'Cubic.easeOut' });
    }
  }

  _skillRow(dyn, champId, slot, s, x, y, w, h) {
    const col = s.color ?? 0x7ec8ff;
    const isUlt = slot === 'r';
    const g = this.add.graphics();
    g.fillStyle(0x0b1322, 0.94);
    fillRR(g, x, y, w, h, 10);
    g.lineStyle(1.5, isUlt ? NEON.yellow : col, isUlt ? 0.6 : 0.35);
    strokeRR(g, x, y, w, h, 10);
    // key badge
    g.fillStyle(col, 0.24);
    fillRR(g, x + 10, y + 8, 30, 30, 7);
    g.lineStyle(2, col, 1);
    strokeRR(g, x + 10, y + 8, 30, 30, 7);
    const key = this.add.text(x + 25, y + 23, slot.toUpperCase(), {
      fontFamily: FONT_TITLE, fontSize: 16, color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    // mana + cooldown under the badge
    const mana = this.add.text(x + 25, y + 52, `💧${s.mana}`, {
      fontFamily: FONT_MONO, fontSize: 10, color: '#7ec8ff', padding: { y: 1 },
    }).setOrigin(0.5);
    const cd = this.add.text(x + 25, y + 68, `⏱${s.cd}s`, {
      fontFamily: FONT_MONO, fontSize: 10, color: '#c3cfe0', padding: { y: 1 },
    }).setOrigin(0.5);
    // icon + name (+ ult lock)
    const icon = this.add.text(x + 63, y + 22, s.icon || '✨', { fontSize: 19, padding: { y: 3 } }).setOrigin(0.5);
    const name = this.add.text(x + 80, y + 22, s.name, {
      fontFamily: FONT_TITLE, fontSize: 14, color: '#ffffff', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0, 0.5);
    dyn.add([g, key, mana, cd, icon, name]);
    if (isUlt) {
      dyn.add(makePill(this, name.x + name.width + 10, y + 22, `🔒 UNLOCKS AT LV ${ULT_UNLOCK_LEVEL}`, {
        color: NEON.yellow, fontSize: 8, fill: 0x2a2208, fillAlpha: 0.95, font: 'Arial Black, Arial, sans-serif',
      }));
    }
    // description + facts line
    dyn.add(this.add.text(x + 52, y + 33, tText(`skill.${champId}.${slot}`, s.desc || ''), {
      fontFamily: FONT_MONO, fontSize: 12, color: '#cfe3f5',
      wordWrap: { width: w - 62, useAdvancedWrap: true },
    }));
    const typeP = makePill(this, x + 52, y + h - 11, TYPE_LABEL[s.type] || String(s.type || '').toUpperCase(), {
      color: col, fontSize: 8,
    });
    dyn.add(typeP);
    let fx = x + 52 + typeP.pillW + 6;
    // v2 mechanic badges (fan / zone / knockback / wall-stun / pet) next to the type.
    for (const tg of skillTags(s)) {
      const p = makePill(this, fx, y + h - 11, tg.t, { color: tg.c, fontSize: 8, padX: 5 });
      dyn.add(p);
      fx += p.pillW + 5;
    }
    // Numbers in the remaining width: shrink, then drop trailing facts if still too long.
    const avail = x + w - 10 - (fx + 2);
    let parts = skillFacts(s).split(' · ').filter(Boolean);
    const facts = this.add.text(fx + 2, y + h - 11, parts.join(' · '), {
      fontFamily: FONT_MONO, fontSize: 11, color: hex(col),
    }).setOrigin(0, 0.5);
    if (facts.width > avail) facts.setFontSize(10);
    while (facts.width > avail && parts.length > 1) { parts = parts.slice(0, -1); facts.setText(parts.join(' · ')); }
    if (facts.width > avail) facts.setText('');
    dyn.add(facts);
  }

  // ───────────────────────── name field ─────────────────────────
  _drawNameBox() {
    const B = NAMEBOX;
    const g = this.add.graphics().setDepth(3);
    drawPanel(g, B.x, B.y, B.w, B.h, { color: 0x7ec8ff, radius: 14, halo: 0.08 });
    this.add.text(B.x + 16, B.y + 15, 'YOUR NAME', {
      fontFamily: FONT_TITLE, fontSize: 11, color: '#7ec8ff',
    }).setOrigin(0, 0.5).setDepth(5);
    this.add.text(B.x + B.w - 16, B.y + 15, 'click to edit · ENTER to save', {
      fontFamily: FONT_MONO, fontSize: 10, color: '#4f6380',
    }).setOrigin(1, 0.5).setDepth(5);

    const f = { x: B.x + 16, y: B.y + 28, w: B.w - 32, h: 38 };
    this._fieldRect = f;
    const field = this.add.graphics().setDepth(4);
    const paintField = (hover) => {
      field.clear();
      field.fillStyle(hover ? 0x111a2b : 0x0d1320, 1);
      fillRR(field, f.x, f.y, f.w, f.h, 7);
      field.lineStyle(2, 0x39c2ff, hover ? 1 : 0.6);
      strokeRR(field, f.x, f.y, f.w, f.h, 7);
    };
    paintField(false);
    this._nameValue = this.add.text(f.x + 14, f.y + f.h / 2, '', {
      fontFamily: FONT_MONO, fontSize: 18, color: '#ffffff', padding: { y: 2 },
    }).setOrigin(0, 0.5).setDepth(5);
    this._namePencil = this.add.text(f.x + f.w - 12, f.y + f.h / 2, '✎', {
      fontFamily: 'Arial, sans-serif', fontSize: 18, color: '#39c2ff',
    }).setOrigin(1, 0.5).setDepth(5);
    const hit = this.add.rectangle(f.x, f.y, f.w, f.h, 0xffffff, 0).setOrigin(0).setDepth(6)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => paintField(true));
    hit.on('pointerout', () => paintField(false));
    // pointerup (not down): focusing on mousedown would be undone by the
    // browser's default mousedown focus handling on the canvas.
    hit.on('pointerup', () => this._beginNameEdit());
    this._renderName();
  }

  _renderName() {
    if (!this._nameValue || !this._nameValue.scene) return;
    const has = !!this._name;
    this._nameValue.setText(has ? clipName(this._name, NAME_MAX) : 'click to set your name')
      .setColor(has ? '#ffffff' : '#6f86a6').setVisible(true);
    this._namePencil.setVisible(true);
  }

  /** Native <input> overlay: IME composition (Vietnamese Telex/VNI), mobile soft keyboard. */
  _createNameInput() {
    const el = document.createElement('input');
    el.type = 'text';
    el.maxLength = NAME_MAX;
    el.autocomplete = 'off';
    el.spellcheck = false;
    el.lang = 'vi';
    el.setAttribute('aria-label', 'Display name');
    el.placeholder = 'your name';
    Object.assign(el.style, {
      position: 'fixed', display: 'none', zIndex: '9999', boxSizing: 'border-box', margin: '0',
      padding: '0 12px', color: '#ffffff', background: '#0d1320', border: '2px solid #39c2ff',
      borderRadius: '7px', outline: 'none', fontFamily: 'Consolas, monospace',
      boxShadow: '0 0 14px rgba(57,194,255,0.55)', userSelect: 'text', webkitUserSelect: 'text',
    });
    // Keys typed here must never reach Phaser's window listener (no champion
    // switching / FIND MATCH while typing, and Phaser's key captures can't eat
    // SPACE or the arrows).
    el.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.isComposing || ev.keyCode === 229) return; // IME mid-composition
      if (ev.key === 'Enter') { ev.preventDefault(); this._endNameEdit(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); this._endNameEdit(false); }
    });
    el.addEventListener('keyup', (ev) => ev.stopPropagation());
    el.addEventListener('blur', () => this._endNameEdit(true));
    document.body.appendChild(el);
    this._nameEl = el;
    this._onWinResize = () => this._positionNameInput();
    window.addEventListener('resize', this._onWinResize);
    this.scale.on('resize', this._onWinResize);
    return el;
  }

  _positionNameInput() {
    const el = this._nameEl;
    const canvas = this.game && this.game.canvas;
    if (!el || !canvas || !this._fieldRect) return;
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / this.scale.width;
    const sy = rect.height / this.scale.height;
    const f = this._fieldRect;
    el.style.left = `${Math.round(rect.left + f.x * sx)}px`;
    el.style.top = `${Math.round(rect.top + f.y * sy)}px`;
    el.style.width = `${Math.round(f.w * sx)}px`;
    el.style.height = `${Math.round(f.h * sy)}px`;
    el.style.fontSize = `${Math.max(12, Math.round(18 * sy))}px`;
  }

  _beginNameEdit() {
    if (this._editing || this._leaving) return;
    const el = this._nameEl || this._createNameInput();
    this._editing = true;
    el.value = this._name || '';
    this._positionNameInput();
    el.style.display = 'block';
    this._nameValue.setVisible(false);
    this._namePencil.setVisible(false);
    AudioManager.uiClick();
    try { el.focus({ preventScroll: true }); el.select(); } catch (_) { /* ignore */ }
    // Some mobile browsers only raise the keyboard on a later tick.
    setTimeout(() => {
      if (this._editing && this._nameEl && document.activeElement !== this._nameEl) {
        try { this._nameEl.focus(); } catch (_) { /* ignore */ }
      }
    }, 0);
  }

  _endNameEdit(commit) {
    if (!this._editing) return;
    this._editing = false;
    const el = this._nameEl;
    if (commit && el) {
      const v = String(el.value || '').trim().slice(0, NAME_MAX);
      if (v) this._name = SaveManager.setPlayerName(v); // empty → keep the old name
    }
    if (el) {
      el.style.display = 'none';
      if (document.activeElement === el) el.blur();
    }
    // Swallow the ENTER that just confirmed the name (Phaser may still see it).
    this._ignoreKeysUntil = this.time.now + 200;
    this._renderName();
  }

  // ───────────────────────── how to play + FIND MATCH ─────────────────────────
  _drawHowTo() {
    const P = HOWTO;
    const g = this.add.graphics().setDepth(3);
    drawPanel(g, P.x, P.y, P.w, P.h, { color: NEON.yellow, radius: 14, halo: 0.07 });
    this.add.text(P.x + 16, P.y + 17, 'HOW TO PLAY', {
      fontFamily: FONT_TITLE, fontSize: 11, color: '#ffd23f',
    }).setOrigin(0, 0.5).setDepth(5);
    this.add.text(P.x + P.w - 16, P.y + 17, 'queue → champion draft → loading → match', {
      fontFamily: FONT_MONO, fontSize: 10, color: '#8fa3bf',
    }).setOrigin(1, 0.5).setDepth(5);
    const DOT = { sep: true };
    this._keyLine(P.x + 16, P.y + 46, [
      { key: 'RIGHT-CLICK' }, 'move / attack', DOT,
      { key: 'Q' }, { key: 'W' }, { key: 'E' }, { key: 'R' }, 'skills', DOT,
      { key: 'D' }, { key: 'F' }, 'summoner spells',
    ]);
    this._keyLine(P.x + 16, P.y + 74, [
      { key: 'B' }, 'recall', DOT, { key: 'P' }, 'shop', DOT, { key: 'TAB' }, 'scoreboard', DOT,
      { key: 'C' }, 'champion info', DOT, { key: 'Y' }, 'free camera (edge / minimap)',
    ]);
  }

  /** A row of keycaps + captions, laid out left → right. */
  _keyLine(x, y, parts) {
    let cx = x;
    for (const p of parts) {
      if (p && p.sep) {
        const t = this.add.text(cx + 4, y, '·', { fontFamily: FONT_MONO, fontSize: 14, color: '#4f6380' })
          .setOrigin(0, 0.5).setDepth(5);
        cx += t.width + 12;
      } else if (p && p.key) {
        const c = this.add.container(cx, y).setDepth(5);
        const t = this.add.text(0, 0, p.key, {
          fontFamily: FONT_TITLE, fontSize: 10, color: '#0a0e18',
        }).setOrigin(0, 0.5);
        const w = Math.ceil(t.width + 12), h = 20;
        const g = this.add.graphics();
        g.fillStyle(0x7f8ea3, 1); fillRR(g, 0, -h / 2 + 2, w, h, 5);
        g.fillStyle(0xe8f4ff, 1); fillRR(g, 0, -h / 2, w, h - 2, 5);
        t.x = 6; t.y = -1;
        c.add([g, t]);
        cx += w + 4;
      } else {
        const t = this.add.text(cx + 2, y, String(p), {
          fontFamily: FONT_MONO, fontSize: 12, color: '#cfe3f5', padding: { y: 2 },
        }).setOrigin(0, 0.5).setDepth(5);
        cx += t.width + 8;
      }
    }
  }

  _drawPlayButton() {
    this._practiceBtn = makeButton(this, {
      x: PRACTICE.x, y: PRACTICE.y, w: PRACTICE.w, h: PRACTICE.h, label: t('lobby.practice'),
      sub: 'O · offline', color: NEON.orange, fontSize: 16,
      onClick: () => this._practice(),
    });
    this._practiceBtn.root.setDepth(10);
    this._customBtn = makeButton(this, {
      x: CUSTOM.x, y: CUSTOM.y, w: CUSTOM.w, h: CUSTOM.h, label: t('lobby.custom'),
      sub: 'C · pick your side', color: NEON.cyan, fontSize: 15,
      onClick: () => this._customRooms(),
    });
    this._customBtn.root.setDepth(10);
    this._playBtn = makeButton(this, {
      x: PLAY.x, y: PLAY.y, w: PLAY.w, h: PLAY.h, label: t('lobby.quickMatch'),
      sub: 'ENTER ⏎ · auto queue', color: NEON.green, fontSize: 21, primary: true,
      onClick: () => this._findMatch(),
    });
    this._playBtn.root.setDepth(10);
  }

  // ───────────────────────── input + flow ─────────────────────────
  _bindKeys() {
    const kb = this.input.keyboard;
    if (!kb) return;
    this._onKey = (ev) => {
      if (this._editing || this._leaving) return;
      if (this.time.now < this._ignoreKeysUntil) return;
      const k = ev.key;
      if (this._prompt) {          // Pass 2 rejoin / duplicate-tab prompt is modal
        const p = this._prompt;
        if (p.busy) return;
        if (k === 'Enter' && p.primary) p.primary.fn();
        else if (k === 'Escape') (p.secondary ? p.secondary.fn() : this._closePrompt());
        return;
      }
      if (this._panel && !this._panel.closed) return; // 🏆 RANKS is open (it handles ESC itself)
      if (this._queue) {           // the queue overlay is modal
        if (k === 'Escape') this._cancelQueue();
        else if (k === 'Enter') this._startNow();
        return;
      }
      if (k === 'ArrowLeft') this._select(this._idx - 1);
      else if (k === 'ArrowRight') this._select(this._idx + 1);
      else if (k === 'ArrowUp') this._select(this._idx - COLS);
      else if (k === 'ArrowDown') this._select(this._idx + COLS);
      else if (k === 'Enter') this._findMatch();
      else if (k === 'Escape') this._back();
      else if (k === 'o' || k === 'O') this._practice();
      else if (k === 'c' || k === 'C') this._customRooms();
      else if (/^[1-9]$/.test(k) && Number(k) <= ORDER.length) this._select(Number(k) - 1);
    };
    kb.on('keydown', this._onKey);
    kb.once('keydown', () => AudioManager.prime?.());
  }

  _playerName() {
    if (!this._guestName) this._guestName = `Guest-${Math.floor(Math.random() * 9000) + 1000}`;
    return (String(this._name || '').trim().slice(0, NAME_MAX)) || this._guestName;
  }

  _practice() {
    if (this._leaving || this._queue) return;
    if (this._editing) this._endNameEdit(true);
    this._leaving = true;
    SaveManager.setTeamChamp(ORDER[this._idx]);
    AudioManager.uiClick();
    fadeToScene(this, 'TeamSelectScene', { offline: true, name: this._playerName(), champ: ORDER[this._idx] }, 300, 700);
  }

  /** v4: custom rooms browser (TeamCustomScene owns the room from create/join on). */
  _customRooms() {
    if (this._leaving || this._queue) return;
    if (this._editing) this._endNameEdit(true);
    this._leaving = true;
    SaveManager.setTeamChamp(ORDER[this._idx]);
    AudioManager.uiClick();
    fadeToScene(this, 'TeamCustomScene', { name: this._playerName(), champ: ORDER[this._idx] }, 220, 600);
  }

  // ───────────────────────── queue (online) ─────────────────────────
  async _findMatch() {
    if (this._leaving || this._queue) return;
    if (this._editing) this._endNameEdit(true);
    const champ = ORDER[this._idx];
    SaveManager.setTeamChamp(champ);
    AudioManager.reward?.();
    const card = this._cards[this._idx];
    if (card) this.tweens.add({ targets: card.inner, scale: 1.08, duration: 160, yoyo: true });
    this._openQueue();
    const q = this._queue;
    if (typeof Colyseus === 'undefined') { this._queueFail('the Colyseus client did not load'); return; }
    const url = teamServerUrl();
    q.status = `connecting to ${url} …`;
    try {
      const client = new Colyseus.Client(url);
      const room = await client.joinOrCreate('team', { name: this._playerName(), champ, hat: SaveManager.getHat?.() || '', pid: getPid() }); // EP-11 · Pass 2 pid
      if (this._queue !== q || this._shuttingDown) { try { room.leave(); } catch (_) { /* ignore */ } return; }
      q.room = room;
      q.joinedAt = Date.now();
      q.status = '';
      if (q.wantStart) this._startNow();
      // Every listener is removed on handoff / shutdown (the room survives into TeamSelectScene).
      q.offMsg = room.onMessage('*', () => { /* feed / chat during the queue: ignored here */ });
      const onLeave = (code) => {
        if (this._shuttingDown || this._queue !== q) return;
        q.room = null;
        this._queueFail(`the server closed the queue (code ${code})`);
      };
      room.onLeave(onLeave);
      // Exact moment the phase left 'lobby' (patch arrival, not our next frame) → clock estimate in select.
      q.clock = startClockSync(room, { everyMs: 3000 });
      q.unsub.push(() => q.clock?.stop());
      q.unsub.push(() => room.onLeave.remove?.(onLeave));
      const onErr = (code, msg) => { if (!this._shuttingDown) console.warn('[TeamLobby] room error', code, msg); };
      room.onError(onErr);
      q.unsub.push(() => room.onError.remove?.(onErr));
    } catch (e) {
      if (this._queue !== q || this._shuttingDown) return;
      console.warn('[TeamLobby] join failed:', e?.message || e);
      const je = joinError(e);
      if (je.code === 'DUP_TAB') { this._queueProblem('dup'); return; }
      if (je.code === 'IN_MATCH') { this._closeQueue(); this._checkRejoin(true); return; }
      this._queueFail(e?.message || String(e));
    }
  }

  /** Pass 2 RP-03: another tab of this player is playing → PLAY HERE / BACK. */
  _queueProblem(mode) {
    const q = this._queue;
    if (!q) return;
    q.failed = true;
    q.mode = mode;
    q.title.setText(DUP_TAB_TEXT.title).setColor('#ffd23f');
    q.status = DUP_TAB_TEXT.body;
    q.startBtn.setLabel('▶ PLAY HERE').setSub('ENTER · closes the other tab').setDimmed(false);
    q.cancelBtn.setLabel('◀ BACK').setSub('ESC');
    this._releaseRoom(true);
  }

  async _playHere() {
    const q = this._queue;
    if (q) q.startBtn.setSub('closing the other tab…').setDimmed(true);
    await takeover();
    if (this._shuttingDown) return;
    this._closeQueue();
    const me = await fetchMe();
    if (this._shuttingDown) return;
    if (me?.match) { this._checkRejoin(); return; } // the other tab was in a match → take that seat
    this.time.delayedCall(300, () => { if (!this._shuttingDown && !this._leaving) this._findMatch(); });
  }

  _openQueue() {
    const { W, H } = this;
    const c = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(0, 0, W, H, 0x02040a, 0.8).setOrigin(0).setInteractive();
    dim.on('pointerup', (p, lx, ly, ev) => ev?.stopPropagation?.());
    const pw = Math.min(620, W - 32), ph = 340, px = (W - pw) / 2, py = (H - ph) / 2 - 10;
    const g = this.add.graphics();
    drawPanel(g, px, py, pw, ph, { color: NEON.cyan, radius: 18, halo: 0.14 });
    const title = this.add.text(W / 2, py + 40, 'SEARCHING FOR A MATCH', {
      fontFamily: FONT_TITLE, fontSize: 26, color: '#ffffff', stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5);
    const tp = glow(title, '#00d9ff', 12);
    void tp;
    const radar = this.add.graphics();
    const rx = W / 2, ry = py + 114;
    const portrait = drawChampionPortrait(this, ORDER[this._idx], rx, ry + 2, 62);
    const line = this.add.text(W / 2, py + 184, '', {
      fontFamily: FONT_MONO, fontSize: 18, color: '#ffffff', align: 'center', padding: { y: 2 },
    }).setOrigin(0.5);
    const sub = this.add.text(W / 2, py + 206, '', {
      fontFamily: FONT_MONO, fontSize: 12, color: '#7ec8ff', align: 'center', lineSpacing: 3, padding: { y: 2 },
      wordWrap: { width: pw - 40, useAdvancedWrap: true },
    }).setOrigin(0.5, 0);
    c.add([dim, g, radar, title, portrait, line, sub]);
    const startBtn = makeButton(this, {
      x: W / 2 - 138, y: py + ph - 46, w: 236, h: 56, label: t('ui.startNow'), sub: 'ENTER · bots fill seats',
      color: NEON.green, fontSize: 18, onClick: () => this._startNow(),
    });
    const cancelBtn = makeButton(this, {
      x: W / 2 + 138, y: py + ph - 46, w: 236, h: 56, label: t('ui.cancel'), sub: 'ESC',
      color: NEON.red, fontSize: 18, onClick: () => this._cancelQueue(),
    });
    c.add([startBtn.root, cancelBtn.root]);
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 180 });
    this._queue = {
      c, radar, rx, ry, line, sub, title, startBtn, cancelBtn, room: null, unsub: [],
      status: '', failed: false, joinedAt: 0, clock: null, startSent: false,
    };
  }

  _queueFail(why) {
    const q = this._queue;
    if (!q) return;
    q.failed = true;
    q.title.setText("CAN'T REACH THE SERVER").setColor('#ff8a8a');
    q.status = `${String(why).slice(0, 110)}\nPractice offline against bots instead?`;
    q.startBtn.setLabel('🤖 PRACTICE').setSub('ENTER · offline vs bots').setDimmed(false);
    q.cancelBtn.setLabel('◀ BACK').setSub('ESC');
    this._releaseRoom(true);
  }

  /** START NOW / READY (Pass 2 RP-06): alone = start now; with others = toggle ready (starts when all are). */
  _startNow() {
    const q = this._queue;
    if (!q) return;
    if (q.mode === 'dup') { this._playHere(); return; }
    if (q.failed) { this._closeQueue(); this._practice(); return; }
    if (!q.room) { q.wantStart = true; q.startBtn.setSub('ready once connected…').setDimmed(true); return; }
    try { q.room.send('ready'); } catch (e) { console.warn('[TeamLobby] ready failed', e?.message); }
    AudioManager.uiClick();
  }

  _cancelQueue() {
    if (!this._queue) return;
    AudioManager.uiClick();
    this._closeQueue();
  }

  _closeQueue() {
    const q = this._queue;
    if (!q) return;
    this._releaseRoom(true);
    this._queue = null;
    this._ignoreKeysUntil = this.time.now + 150;
    this.tweens.add({ targets: q.c, alpha: 0, duration: 140, onComplete: () => q.c.destroy() });
  }

  /** Drop our room listeners; `leave` = also leave the room (cancel / failure / back to menu). */
  _releaseRoom(leave) {
    const q = this._queue;
    if (!q) return;
    for (const off of q.unsub) { try { off?.(); } catch (_) { /* ignore */ } }
    q.unsub.length = 0;
    // Leaving: keep the catch-all message handler (late 'feed' etc. until the socket closes).
    if (!leave && q.offMsg) { try { q.offMsg(); } catch (_) { /* ignore */ } }
    q.offMsg = null;
    if (leave && q.room) { const r = q.room; q.room = null; try { r.leave(); } catch (_) { /* ignore */ } }
  }

  update() {
    const q = this._queue;
    if (!q) return;
    const now = Date.now();
    // radar sweep around the favourite's portrait
    const a = (now / 600) % (Math.PI * 2);
    q.radar.clear();
    q.radar.lineStyle(2, q.failed ? NEON.red : NEON.cyan, 0.55); strokeCircleLP(q.radar, q.rx, q.ry, 46);
    if (!q.failed) {
      q.radar.fillStyle(NEON.cyan, 0.24);
      q.radar.slice(q.rx, q.ry, 46, a - 0.8, a, false); q.radar.fillPath();
    }
    const dots = '.'.repeat(1 + Math.floor(now / 400) % 3);
    if (q.failed || !q.room) {
      q.line.setText(q.failed ? '' : `Connecting${dots}`);
      q.sub.setText(q.status || '');
      return;
    }
    const st = q.room.state;
    const phase = st?.phase;
    if (phase && phase !== 'lobby') { this._handoff(); return; }
    let humans = 0, ready = 0, meReady = false;
    st?.champions?.forEach?.((ch, id) => {
      if (ch.isBot) return;
      humans++;
      if (ch.ready) ready++;
      if (id === q.room.sessionId) meReady = !!ch.ready;
    });
    const endsAt = Number(st?.lobbyEndsAt) || 0;
    const left = endsAt ? Math.max(0, Math.min(LOBBY_MAX_MS, endsAt - (now + (q.clock ? q.clock.offset() : 0)))) : null;
    q.line.setText(`Waiting for players${dots}   ${Math.max(1, humans)}/${TEAM_SIZE * 2} humans`
      + (left != null ? `   ·   starts in ${Math.ceil(left / 1000)}s` : ''));
    const waited = Math.floor((now - (q.joinedAt || now)) / 1000);
    q.sub.setText(`🤖 bots fill every empty seat  ·  ${waited}s in queue\n`
      + (humans > 1 ? `✔ ${ready}/${humans} ready — the draft starts as soon as everyone is ready` : 'invite a coworker now · or START NOW to play with bots'));
    // RP-06 button: alone → START NOW, with others → READY toggle
    const key = humans > 1 ? (meReady ? 'r1' : 'r0') : 's';
    if (q.btnKey !== key) {
      q.btnKey = key;
      if (key === 's') q.startBtn.setLabel('▶ START NOW').setSub('ENTER · bots fill seats').setDimmed(false);
      else if (key === 'r0') q.startBtn.setLabel('✔ READY').setSub('ENTER · start sooner').setDimmed(false);
      else q.startBtn.setLabel('✔ READY!').setSub('ENTER · not ready').setDimmed(false);
    }
  }

  _handoff() {
    const q = this._queue;
    if (!q || !q.room || this._leaving) return;
    const room = q.room;
    const clk = q.clock?.sample() || null;      // read before _releaseRoom stops the sync
    // Keep our catch-all until TeamSelectScene has registered its own (scene.start is
    // deferred to the next step → no 'onMessage() not registered' gap); it calls dropMsg.
    const dropMsg = q.offMsg; q.offMsg = null;
    this._releaseRoom(false);
    q.room = null;
    this._handedOff = true;
    this._leaving = true;
    this._queue = null;
    AudioManager.reward?.();
    this.scene.start('TeamSelectScene', {
      room, name: this._playerName(), champ: ORDER[this._idx], clockOffset: clk ? clk.offset : undefined, clockRtt: clk ? clk.rtt : undefined, dropMsg,
    });
  }

  _back() {
    if (this._leaving) return;
    if (this._editing) this._endNameEdit(false);
    this._leaving = true;
    AudioManager.uiClick();
    fadeToScene(this, 'MenuScene', undefined, 220, 600);
  }

  _cleanup() {
    this._shuttingDown = true;
    this._editing = false;       // first: removing a focused input may fire blur
    if (this._queue) { this._releaseRoom(!this._handedOff); this._queue = null; }
    if (this._quoteEvt) { this._quoteEvt.remove(false); this._quoteEvt = null; }
    if (this._nameEl) { const el = this._nameEl; this._nameEl = null; el.remove(); }
    if (this._onWinResize) {
      window.removeEventListener('resize', this._onWinResize);
      this.scale.off('resize', this._onWinResize);
      this._onWinResize = null;
    }
    if (this._onKey && this.input.keyboard) this.input.keyboard.off('keydown', this._onKey);
  }
}

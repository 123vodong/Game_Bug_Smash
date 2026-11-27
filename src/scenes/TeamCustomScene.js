// TeamCustomScene — Team Mode v4 CUSTOM ROOMS (contract: .claude/context/tasks/TEAM_MODE_V4_BREAKDOWN.md §3.1).
// Started from TeamLobbyScene with { name, champ } (champ = favourite → first hover in the draft).
//
// LIST mode: GET /api/team/rooms every ~3 s → rows (room name, host, players, sides, status, JOIN);
//   CREATE ROOM (room-name input ≤ ROOM_NAME_MAX) → client.create('team_custom', { name, roomName, champ });
//   JOIN BY CODE (= roomId) / JOIN → client.joinById(roomId, { name, champ }).
//   keys: ↑ ↓ select · ENTER join · N create · J join by code · R refresh · ESC back to the lobby
// ROOM mode (phase 'room', no timer): two columns × 5 seats (humans by name, 👑 host, "(you)";
//   empty = "🤖 bot will fill"), JOIN BLUE / JOIN RED → 'side' {team}, host-only START → 'startNow',
//   LEAVE, room name + code with COPY.
//   keys: ← / 1 blue · → / 2 red · ENTER start (host) · C copy code · I copy invite link · ESC leave
// Phase 'select' (or later) → scene.start('TeamSelectScene', { room, name, champ, clockOffset, clockRtt,
//   dropMsg, custom: true, roomName }) — same handoff conventions as TeamLobbyScene (catch-all
//   message handler kept until TeamSelectScene registers its own; clock sample handed over).
// room.leave() only on LEAVE / back / scene shutdown without handoff.
// EP-11 (Experience Pass 1): join option `hat`; started with { joinCode } (invite deep link
// `?room=<roomId>`, main.js) → joins that room right away; 🔗 INVITE copies `<origin>/?room=<id>`.
// NOTE: we never send 'hello' here (answered once per client; TeamModeScene needs that 'welcome').
import { TEAM_INFO, TEAM_SIZE, ROOM_NAME_MAX, ROOM_MAX_HUMANS } from '../../shared/moba/rules.js';
import { SaveManager } from '../core/SaveManager.js';
import { getPid, takeover, joinError, CLOSE_TAKEN_OVER, DUP_TAB_TEXT } from '../core/Identity.js';
import { AudioManager } from '../core/AudioManager.js';
import { t } from '../core/I18n.js';
import {
  FONT_TITLE, FONT_MONO, NEON, glow, drawPanel, makeButton, clipName, fillRR, strokeRR,
  fadeToScene, teamServerUrl, startClockSync,
} from '../ui/moba/uiKit.js';

const ROOM_TYPE = 'team_custom';
const REFRESH_MS = 3000;
const SIDE_GAP_MS = 400;           // client-side throttle for 'side' (server rate-limits too)
const PER_SIDE = Math.min(TEAM_SIZE, Math.floor(ROOM_MAX_HUMANS / 2));

// HTTP API next to the game server (same host as the ws URL, incl. the :8000 → :2567 dev rule and ?server=).
const ROOMS_URL = () => `${teamServerUrl().replace(/^ws/, 'http').replace(/\/+$/, '')}/api/team/rooms`;

const PHASE_LABEL = {
  room: { t: '🟢 open', c: '#7ed957' }, lobby: { t: '🟢 open', c: '#7ed957' },
  select: { t: '🎯 drafting', c: '#ffd23f' }, loading: { t: '⏳ loading', c: '#ffd23f' },
  playing: { t: '⚔ in game', c: '#ff9f43' }, ended: { t: '🏁 ended', c: '#8fa3bf' },
};

// ── Layout (1280×720) ──
const LIST = { x: 24, y: 96, w: 1232, h: 500 };
const ROW = { y0: 150, h: 54, gap: 4, visible: 7 };
const COLX = { name: 52, host: 470, players: 680, sides: 800, status: 950, join: 1170 };
const SEAT = { y0: 176, h: 60, gap: 8 };
const COL = { blue: { x: 40, w: 560 }, red: { x: 680, w: 560 } };

/** Enable / disable input on every interactive object below `obj` (hidden views must not eat clicks). */
function setTreeInput(obj, on) {
  if (!obj) return;
  if (obj.input) obj.input.enabled = !!on;
  if (obj.list) for (const ch of obj.list) setTreeInput(ch, on);
}

export default class TeamCustomScene extends Phaser.Scene {
  constructor() { super('TeamCustomScene'); }

  init(data) {
    this._data = data || {};
    this._shuttingDown = false;
    this._leaving = false;
    this._handedOff = false;
    this._mode = 'list';
    this._rooms = [];
    this._listErr = '';
    this._fetching = false;
    this._fetchedAt = 0;
    this._sel = 0;
    this._scroll = 0;
    this._listSig = '';
    this._modal = null;
    this._busy = null;
    this._room = null;
    this._unsub = [];
    this._offMsg = null;
    this._clock = null;
    this._roomSig = '';
    this._sideAt = 0;
    this._sidePending = null;
    this._startSentAt = 0;
    this._inputEl = null;
    this._onWinResize = null;
    this._onKey = null;
    this._ignoreKeysUntil = 0;
    this._guestName = null;
    this._naming = false;
  }

  create() {
    const { width: W, height: H } = this.scale;
    this.W = W; this.H = H;
    AudioManager.setMuted(SaveManager.isMuted());
    this._name = this._playerName();
    this._drawBackground();
    this._drawHeader();
    this._buildList();
    this._bindKeys();
    this._fetchRooms();
    // EP-11 invite link: join the room straight away (once — the URL param is dropped so a reload
    // or a later visit to this screen doesn't re-join a stale room).
    const code = String(this._data.joinCode || '');
    if (/^[A-Za-z0-9_-]{3,40}$/.test(code)) {
      this._data.joinCode = '';
      this._invited = code;
      try {
        const u = new URL(window.location.href);
        if (u.searchParams.has('room')) { u.searchParams.delete('room'); window.history.replaceState(null, '', u.toString()); }
      } catch (_) { /* no history API */ }
      // Round 2: a friend without a saved name picks one first (else they'd land as Guest-xxxx).
      this.time.delayedCall(200, () => { if (!this._shuttingDown) this._joinInvite(code); });
    }
    this._refreshEvt = this.time.addEvent({
      delay: REFRESH_MS, loop: true,
      callback: () => { if (this._mode === 'list' && !this._busy && !this._modal) this._fetchRooms(); },
    });
    this.events.once('shutdown', () => this._cleanup());
    this.cameras.main.fadeIn(220, 0, 0, 0);
  }

  /** Invite join: ask for a name first when none is saved (WelcomePanel 'rename' card; CANCEL = guest). */
  async _joinInvite(code) {
    if (SaveManager.getPlayerName?.()) { this._connect('join', code); return; }
    let Panel = null;
    try { Panel = (await import('../ui/WelcomePanel.js')).WelcomePanel || null; } catch (_) { Panel = null; }
    if (this._shuttingDown) return;
    if (!Panel?.open) { this._connect('join', code); return; }
    this._naming = true;
    const go = (name) => {
      if (this._shuttingDown || !this._naming) return;
      this._naming = false;
      this._ignoreKeysUntil = this.time.now + 200;
      if (name) { this._data.name = name; this._name = this._playerName(); this._whoT?.setText(`👤 ${clipName(this._name, 16)}`); }
      this._connect('join', code);
    };
    try {
      Panel.open(this, { mode: 'rename', onDone: (name) => go(name), onClose: () => go('') });
      this._toast('👋 You were invited! Pick a name, then you join the room', '#7ed957', 3200);
    } catch (e) {
      console.warn('[TeamCustom] name prompt failed:', e?.message);
      go('');
    }
  }

  _playerName() {
    const n = String(this._data.name || SaveManager.getPlayerName?.() || '').trim().slice(0, 16);
    if (n) return n;
    if (!this._guestName) this._guestName = `Guest-${Math.floor(Math.random() * 9000) + 1000}`;
    return this._guestName;
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
    this.add.rectangle(0, 0, W, H, 0x000000, 0.2).setOrigin(0).setDepth(-9);
  }

  _drawHeader() {
    const cx = this.W / 2;
    this._title = this.add.text(cx, 36, t('custom.title'), {
      fontFamily: FONT_TITLE, fontSize: 34, color: '#ffffff', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(5);
    glow(this._title, '#00d9ff', 12);
    this._subtitle = this.add.text(cx, 72, 'create a room, invite friends with a 🔗 link or the code, pick a side — the host starts any time', {
      fontFamily: FONT_MONO, fontSize: 12, color: '#8fa3bf', padding: { y: 2 },
    }).setOrigin(0.5).setDepth(5);
    this._backBtn = makeButton(this, {
      x: 84, y: 38, w: 124, h: 40, label: t('ui.back'), color: NEON.teal, fontSize: 14,
      onClick: () => this._onBack(),
    });
    this._backBtn.root.setDepth(10);
    this.add.text(84, 68, 'ESC', { fontFamily: FONT_MONO, fontSize: 10, color: '#4f6380' }).setOrigin(0.5).setDepth(10);
    this._whoT = this.add.text(this.W - 24, 30, `👤 ${clipName(this._name, 16)}`, {
      fontFamily: FONT_MONO, fontSize: 12, color: '#ffd23f', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(1, 0.5).setDepth(10);
    this._toastT = this.add.text(cx, 612, '', {
      fontFamily: FONT_TITLE, fontSize: 14, color: '#ffffff', stroke: '#000000', strokeThickness: 4,
      backgroundColor: '#0a0e18', padding: { x: 14, y: 7 }, align: 'center',
    }).setOrigin(0.5).setDepth(110).setAlpha(0);
  }

  _toast(msg, color = '#ffffff', ms = 2600) {
    const t = this._toastT;
    if (!t || !t.scene) return;
    this.tweens.killTweensOf(t);
    t.setY(this._mode === 'room' ? 104 : 612);
    t.setText(String(msg).slice(0, 140)).setColor(color).setAlpha(1);
    this.tweens.add({ targets: t, alpha: 0, delay: ms, duration: 400 });
  }

  // ───────────────────────── LIST mode ─────────────────────────
  _buildList() {
    const L = LIST;
    const root = this.add.container(0, 0).setDepth(5);
    this._listRoot = root;
    const g = this.add.graphics();
    drawPanel(g, L.x, L.y, L.w, L.h, { color: NEON.cyan, radius: 16, halo: 0.08 });
    root.add(g);
    const hdr = (x, s, o = 0) => this.add.text(x, 124, s, { fontFamily: FONT_TITLE, fontSize: 11, color: '#7ec8ff' }).setOrigin(o, 0.5);
    root.add([hdr(COLX.name, 'ROOM'), hdr(COLX.host, 'HOST'), hdr(COLX.players, 'PLAYERS'),
      hdr(COLX.sides, 'SIDES'), hdr(COLX.status, 'STATUS'), hdr(COLX.join, '', 0.5)]);
    const line = this.add.graphics();
    line.lineStyle(1, 0x39c2ff, 0.3); line.lineBetween(L.x + 16, 138, L.x + L.w - 16, 138);
    root.add(line);

    this._rows = [];
    for (let i = 0; i < ROW.visible; i++) this._rows.push(this._makeRow(i));
    this._emptyT = this.add.text(this.W / 2, 330, '', {
      fontFamily: FONT_MONO, fontSize: 16, color: '#8fa3bf', align: 'center', lineSpacing: 6,
    }).setOrigin(0.5);
    this._updatedT = this.add.text(L.x + L.w - 20, L.y + L.h - 18, '', {
      fontFamily: FONT_MONO, fontSize: 10, color: '#4f6380',
    }).setOrigin(1, 0.5);
    this._pageT = this.add.text(L.x + 20, L.y + L.h - 18, '', {
      fontFamily: FONT_MONO, fontSize: 10, color: '#4f6380',
    }).setOrigin(0, 0.5);
    root.add([this._emptyT, this._updatedT, this._pageT]);
    // scroll arrows (touch / mouse; wheel + ↑↓ also work)
    this._upBtn = makeButton(this, { x: L.x + L.w - 70, y: L.y + L.h - 18, w: 40, h: 26, label: '▲', color: NEON.blue, fontSize: 12, onClick: () => this._scrollBy(-1) });
    this._dnBtn = makeButton(this, { x: L.x + L.w - 24 - 0, y: L.y + L.h - 18, w: 40, h: 26, label: '▼', color: NEON.blue, fontSize: 12, onClick: () => this._scrollBy(1) });
    this._upBtn.root.x = L.x + L.w - 420; this._dnBtn.root.x = L.x + L.w - 374;
    root.add([this._upBtn.root, this._dnBtn.root]);

    // footer
    this._keysT = this.add.text(24, 668, '↑ ↓ select · ENTER join · N new room · J join by code · R refresh · ESC back', {
      fontFamily: FONT_MONO, fontSize: 11, color: '#6f86a6', wordWrap: { width: 380, useAdvancedWrap: true },
    }).setOrigin(0, 0.5);
    this._refreshBtn = makeButton(this, {
      x: 530, y: 662, w: 160, h: 64, label: t('custom.refresh'), sub: 'R', color: NEON.blue, fontSize: 15,
      onClick: () => this._fetchRooms(true),
    });
    this._codeBtn = makeButton(this, {
      x: 776, y: 662, w: 300, h: 64, label: t('custom.code'), sub: 'J · paste a room code', color: NEON.purple, fontSize: 17,
      onClick: () => this._askCode(),
    });
    this._createBtn = makeButton(this, {
      x: 1096, y: 662, w: 320, h: 72, label: t('custom.create'), sub: 'N · you become the host 👑', color: NEON.green, fontSize: 21, primary: true,
      onClick: () => this._askCreate(),
    });
    root.add([this._keysT, this._refreshBtn.root, this._codeBtn.root, this._createBtn.root]);

    this.input.on('wheel', (p, objs, dx, dy) => {
      if (this._shuttingDown || this._mode !== 'list' || this._modal || this._busy) return;
      this._scrollBy(dy > 0 ? 1 : -1);
    });
    this._renderList(true);
  }

  _makeRow(i) {
    const y = ROW.y0 + i * (ROW.h + ROW.gap);
    const c = this.add.container(0, y);
    const bg = this.add.graphics();
    const txt = (x, size, color, font = FONT_MONO) => this.add.text(x, ROW.h / 2, '', {
      fontFamily: font, fontSize: size, color, padding: { y: 2 },
    }).setOrigin(0, 0.5);
    const name = txt(COLX.name, 17, '#ffffff', FONT_TITLE);
    const code = this.add.text(COLX.name, ROW.h / 2 + 15, '', { fontFamily: FONT_MONO, fontSize: 10, color: '#4f6380' }).setOrigin(0, 0.5);
    name.y -= 7;
    const host = txt(COLX.host, 14, '#ffd23f');
    const players = txt(COLX.players, 15, '#ffffff');
    const sides = txt(COLX.sides, 14, '#cfe3f5');
    const status = txt(COLX.status, 14, '#7ed957');
    const hit = this.add.rectangle(LIST.x + 12, 0, COLX.join - 90 - LIST.x - 12, ROW.h, 0xffffff, 0).setOrigin(0)
      .setInteractive({ useHandCursor: true });
    const row = { c, bg, name, code, host, players, sides, status, hit, idx: -1, hover: false };
    const btn = makeButton(this, {
      x: COLX.join, y: ROW.h / 2, w: 140, h: 40, label: t('ui.join'), color: NEON.green, fontSize: 15,
      onClick: () => { if (row.idx >= 0) this._joinIdx(row.idx); },
    });
    row.btn = btn;
    hit.on('pointerover', () => { row.hover = true; this._paintRow(row); });
    hit.on('pointerout', () => { row.hover = false; this._paintRow(row); });
    hit.on('pointerup', () => {
      if (row.idx < 0 || this._modal || this._busy) return;
      if (this._sel === row.idx && this._lastRowTap && Date.now() - this._lastRowTap < 400) { this._joinIdx(row.idx); return; }
      this._lastRowTap = Date.now();
      this._sel = row.idx; AudioManager.uiHover(); this._renderList(true);
    });
    c.add([bg, name, code, host, players, sides, status, hit, btn.root]);
    this._listRoot.add(c);
    return row;
  }

  _paintRow(row) {
    const g = row.bg, x = LIST.x + 12, w = LIST.w - 24;
    g.clear();
    if (row.idx < 0) return;
    const sel = row.idx === this._sel;
    g.fillStyle(sel ? 0x13223a : (row.hover ? 0x101a2c : 0x0b111d), 0.95);
    fillRR(g, x, 0, w, ROW.h, 10);
    g.lineStyle(sel ? 2 : 1, sel ? NEON.cyan : 0x22344f, sel ? 1 : 0.8);
    strokeRR(g, x, 0, w, ROW.h, 10);
  }

  _canJoin(r) {
    if (!r) return false;
    return !r.locked && (r.phase === 'room' || !r.phase) && (r.humans | 0) < ROOM_MAX_HUMANS;
  }

  _renderList(force) {
    const rooms = this._rooms, n = rooms.length;
    this._sel = Math.max(0, Math.min(this._sel, n - 1));
    if (this._sel < this._scroll) this._scroll = this._sel;
    if (this._sel >= this._scroll + ROW.visible) this._scroll = this._sel - ROW.visible + 1;
    this._scroll = Math.max(0, Math.min(this._scroll, Math.max(0, n - ROW.visible)));
    const sig = `${this._sel}|${this._scroll}|${this._listErr}|${this._mode}|${!!this._fetchedAt}|` + rooms.map((r) =>
      `${r.roomId}:${r.roomName}:${r.host}:${r.humans}:${r.blue}:${r.red}:${r.phase}:${r.locked}`).join(',');
    if (!force && sig === this._listSig) return;
    this._listSig = sig;
    const active = this._mode === 'list' && !this._modal && !this._busy;
    for (let i = 0; i < this._rows.length; i++) {
      const row = this._rows[i], idx = this._scroll + i, r = rooms[idx];
      row.idx = r ? idx : -1;
      row.c.setVisible(!!r);
      setTreeInput(row.c, !!r && active);
      if (!r) continue;
      row.name.setText(clipName(r.roomName || 'Untitled room', ROOM_NAME_MAX));
      row.code.setText(`code ${r.roomId}`);
      row.host.setText(`👑 ${clipName(r.host || '?', 16)}`);
      row.players.setText(`👤 ${r.humans | 0}/${ROOM_MAX_HUMANS}`);
      row.sides.setText(`${TEAM_INFO.blue.emoji} ${r.blue | 0}  ·  ${TEAM_INFO.red.emoji} ${r.red | 0}`);
      const ph = PHASE_LABEL[r.phase] || { t: r.phase || '?', c: '#8fa3bf' };
      row.status.setText(r.locked && r.phase === 'room' ? '🔒 locked' : ph.t).setColor(ph.c);
      const ok = this._canJoin(r);
      const full = (r.humans | 0) >= ROOM_MAX_HUMANS;
      row.btn.setLabel(ok ? 'JOIN' : (full ? 'FULL' : '🔒 LOCKED')).setDimmed(!ok);
      this._paintRow(row);
    }
    let empty = '';
    if (this._listErr && !n) empty = `Can't load the rooms list.\n${this._listErr}\n\nYou can still CREATE a room or JOIN BY CODE.`;
    else if (!n) empty = this._fetchedAt ? 'No custom rooms yet.\nCREATE ROOM and share the code with your friends!' : 'Loading rooms…';
    this._emptyT.setText(empty);
    this._pageT.setText(n > ROW.visible ? `${this._scroll + 1}–${Math.min(n, this._scroll + ROW.visible)} of ${n} rooms` : (n ? `${n} room${n === 1 ? '' : 's'}` : ''));
    const scrollable = n > ROW.visible;
    this._upBtn.root.setVisible(scrollable); this._dnBtn.root.setVisible(scrollable);
    setTreeInput(this._upBtn.root, scrollable && active); setTreeInput(this._dnBtn.root, scrollable && active);
  }

  _scrollBy(d) {
    if (!this._rooms.length) return;
    this._sel = Math.max(0, Math.min(this._rooms.length - 1, this._sel + d));
    this._renderList(true);
  }

  async _fetchRooms(manual = false) {
    if (this._fetching || this._shuttingDown) return;
    this._fetching = true;
    if (manual) this._refreshBtn.setSub('loading…');
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(ROOMS_URL(), { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.json();
      if (this._shuttingDown) return;
      const selId = this._rooms[this._sel]?.roomId;
      this._rooms = (Array.isArray(arr) ? arr : []).filter((r) => r && typeof r.roomId === 'string').slice(0, 50).map((r) => ({
        roomId: r.roomId, roomName: String(r.roomName || '').slice(0, ROOM_NAME_MAX), host: String(r.host || ''),
        humans: r.humans | 0, blue: r.blue | 0, red: r.red | 0, phase: String(r.phase || ''), locked: !!r.locked,
      }));
      const keep = this._rooms.findIndex((r) => r.roomId === selId);
      if (keep >= 0) this._sel = keep;
      this._listErr = '';
      this._fetchedAt = Date.now();
    } catch (e) {
      if (this._shuttingDown) return;
      this._listErr = e?.name === 'AbortError' ? 'the server did not answer' : String(e?.message || e).slice(0, 90);
      this._fetchedAt = this._fetchedAt || Date.now();
    } finally {
      this._fetching = false;
      if (!this._shuttingDown) {
        if (manual) this._refreshBtn.setSub('R');
        if (this._mode === 'list') this._renderList(false);
      }
    }
  }

  _joinIdx(idx) {
    const r = this._rooms[idx];
    if (!r || this._modal || this._busy || this._mode !== 'list') return;
    if (!this._canJoin(r)) {
      this._toast(r.locked || r.phase !== 'room' ? '🔒 That match already started' : 'That room is full (10 humans)', '#ff8a8a');
      return;
    }
    this._connect('join', r.roomId);
  }

  // ───────────────────────── modal (text input) ─────────────────────────
  _askCreate() {
    if (this._mode !== 'list' || this._modal || this._busy || this._leaving) return;
    this._openModal({
      title: 'CREATE ROOM', color: NEON.green, label: `ROOM NAME (max ${ROOM_NAME_MAX})`,
      value: `${this._name}'s room`.slice(0, ROOM_NAME_MAX), maxLength: ROOM_NAME_MAX, placeholder: 'room name',
      hint: 'everyone sees this name in the rooms list', okLabel: '＋ CREATE',
      onOk: (v) => {
        const nm = v.trim().slice(0, ROOM_NAME_MAX) || `${this._name}'s room`.slice(0, ROOM_NAME_MAX);
        this._closeModal();
        this._connect('create', nm);
      },
    });
  }

  _askCode() {
    if (this._mode !== 'list' || this._modal || this._busy || this._leaving) return;
    this._openModal({
      title: 'JOIN BY CODE', color: NEON.purple, label: 'ROOM CODE', value: '', maxLength: 40, placeholder: 'e.g. aB3xY_9kQ',
      hint: 'ask the host for the code shown in their room (case-sensitive)', okLabel: '▶ JOIN',
      onOk: (v) => {
        const code = String(v || '').replace(/[#\s]/g, '');
        if (!/^[A-Za-z0-9_-]{3,40}$/.test(code)) { this._modal?.err.setText('That does not look like a room code.'); this._modal?.okBtn.shake(); return; }
        this._closeModal();
        this._connect('join', code);
      },
    });
  }

  _openModal(o) {
    const { W, H } = this;
    const c = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(0, 0, W, H, 0x02040a, 0.78).setOrigin(0).setInteractive();
    dim.on('pointerup', (p, lx, ly, ev) => ev?.stopPropagation?.());
    const pw = Math.min(600, W - 32), ph = 280, px = (W - pw) / 2, py = (H - ph) / 2 - 40;
    const g = this.add.graphics();
    drawPanel(g, px, py, pw, ph, { color: o.color, radius: 18, halo: 0.14 });
    const title = this.add.text(W / 2, py + 34, o.title, {
      fontFamily: FONT_TITLE, fontSize: 24, color: '#ffffff', stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5);
    const lab = this.add.text(px + 30, py + 72, o.label, { fontFamily: FONT_TITLE, fontSize: 11, color: '#7ec8ff' }).setOrigin(0, 0.5);
    const f = { x: px + 30, y: py + 86, w: pw - 60, h: 46 };
    const field = this.add.graphics();
    field.fillStyle(0x0d1320, 1); fillRR(field, f.x, f.y, f.w, f.h, 8);
    field.lineStyle(2, 0x39c2ff, 0.7); strokeRR(field, f.x, f.y, f.w, f.h, 8);
    const fieldHit = this.add.rectangle(f.x, f.y, f.w, f.h, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
    fieldHit.on('pointerup', () => this._focusInput());
    const hint = this.add.text(px + 30, py + 146, o.hint || '', { fontFamily: FONT_MONO, fontSize: 11, color: '#8fa3bf' }).setOrigin(0, 0.5);
    const err = this.add.text(px + 30, py + 166, '', { fontFamily: FONT_MONO, fontSize: 12, color: '#ff8a8a' }).setOrigin(0, 0.5);
    const okBtn = makeButton(this, {
      x: W / 2 + 120, y: py + ph - 48, w: 210, h: 56, label: o.okLabel, sub: 'ENTER', color: o.color, fontSize: 18, primary: true,
      onClick: () => this._modalOk(),
    });
    const noBtn = makeButton(this, {
      x: W / 2 - 120, y: py + ph - 48, w: 210, h: 56, label: '✕ CANCEL', sub: 'ESC', color: NEON.red, fontSize: 18,
      onClick: () => this._closeModal(),
    });
    c.add([dim, g, title, lab, field, fieldHit, hint, err, okBtn.root, noBtn.root]);
    this._modal = { c, f, err, okBtn, onOk: o.onOk };
    setTreeInput(this._listRoot, false);
    const el = this._inputEl || this._createInput();
    el.maxLength = o.maxLength || 40;
    el.placeholder = o.placeholder || '';
    el.value = o.value || '';
    this._positionInput();
    el.style.display = 'block';
    this._focusInput(true);
    AudioManager.uiClick();
  }

  _modalOk() {
    const m = this._modal;
    if (!m) return;
    m.onOk(String(this._inputEl?.value || ''));
  }

  _closeModal() {
    const m = this._modal;
    if (!m) return;
    this._modal = null;
    if (this._inputEl) { this._inputEl.style.display = 'none'; if (document.activeElement === this._inputEl) this._inputEl.blur(); }
    m.c.destroy();
    this._ignoreKeysUntil = this.time.now + 150;
    if (this._mode === 'list') { setTreeInput(this._listRoot, true); this._renderList(true); }
  }

  /** Native <input> overlay: IME composition (Vietnamese Telex/VNI), mobile soft keyboard, paste. */
  _createInput() {
    const el = document.createElement('input');
    el.type = 'text';
    el.autocomplete = 'off';
    el.spellcheck = false;
    el.lang = 'vi';
    el.setAttribute('aria-label', 'Room');
    Object.assign(el.style, {
      position: 'fixed', display: 'none', zIndex: '9999', boxSizing: 'border-box', margin: '0',
      padding: '0 12px', color: '#ffffff', background: '#0d1320', border: '2px solid #39c2ff',
      borderRadius: '8px', outline: 'none', fontFamily: 'Consolas, monospace',
      boxShadow: '0 0 14px rgba(57,194,255,0.55)', userSelect: 'text', webkitUserSelect: 'text',
    });
    // Typed keys never reach Phaser's window listener.
    el.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.isComposing || ev.keyCode === 229) return;
      if (ev.key === 'Enter') { ev.preventDefault(); this._modalOk(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); this._closeModal(); }
    });
    el.addEventListener('keyup', (ev) => ev.stopPropagation());
    document.body.appendChild(el);
    this._inputEl = el;
    this._onWinResize = () => this._positionInput();
    window.addEventListener('resize', this._onWinResize);
    this.scale.on('resize', this._onWinResize);
    return el;
  }

  _positionInput() {
    const el = this._inputEl, canvas = this.game?.canvas, m = this._modal;
    if (!el || !canvas || !m) return;
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / this.scale.width, sy = rect.height / this.scale.height, f = m.f;
    el.style.left = `${Math.round(rect.left + f.x * sx)}px`;
    el.style.top = `${Math.round(rect.top + f.y * sy)}px`;
    el.style.width = `${Math.round(f.w * sx)}px`;
    el.style.height = `${Math.round(f.h * sy)}px`;
    el.style.fontSize = `${Math.max(14, Math.round(20 * sy))}px`;
  }

  _focusInput(selectAll = false) {
    const el = this._inputEl;
    if (!el || !this._modal) return;
    try { el.focus({ preventScroll: true }); if (selectAll) el.select(); } catch (_) { /* ignore */ }
    setTimeout(() => {   // some mobile browsers raise the keyboard only on a later tick
      if (this._modal && this._inputEl && document.activeElement !== this._inputEl) { try { this._inputEl.focus(); } catch (_) { /* ignore */ } }
    }, 0);
  }

  // ───────────────────────── connecting ─────────────────────────
  _openBusy(text) {
    const { W, H } = this;
    const c = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(0, 0, W, H, 0x02040a, 0.78).setOrigin(0).setInteractive();
    dim.on('pointerup', (p, lx, ly, ev) => ev?.stopPropagation?.());
    const pw = 460, ph = 190, px = (W - pw) / 2, py = (H - ph) / 2 - 20;
    const g = this.add.graphics();
    drawPanel(g, px, py, pw, ph, { color: NEON.cyan, radius: 18, halo: 0.14 });
    const t = this.add.text(W / 2, py + 52, text, {
      fontFamily: FONT_TITLE, fontSize: 20, color: '#ffffff', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);
    const sub = this.add.text(W / 2, py + 88, '', { fontFamily: FONT_MONO, fontSize: 12, color: '#7ec8ff' }).setOrigin(0.5);
    const cancel = makeButton(this, {
      x: W / 2, y: py + ph - 42, w: 200, h: 50, label: '✕ CANCEL', sub: 'ESC', color: NEON.red, fontSize: 16,
      onClick: () => this._cancelBusy(),
    });
    c.add([dim, g, t, sub, cancel.root]);
    setTreeInput(this._listRoot, false);
    this._busy = { c, sub, token: {} };
    return this._busy;
  }

  _closeBusy() {
    const b = this._busy;
    if (!b) return;
    this._busy = null;
    b.c.destroy();
    this._ignoreKeysUntil = this.time.now + 150;
    if (this._mode === 'list') { setTreeInput(this._listRoot, true); this._renderList(true); }
  }

  _cancelBusy() { if (this._busy) { this._busy.cancelled = true; this._closeBusy(); } }

  async _connect(kind, arg) {
    if (this._busy || this._room || this._leaving) return;
    if (typeof Colyseus === 'undefined') { this._toast('The Colyseus client did not load — check your connection', '#ff8a8a'); return; }
    const b = this._openBusy(kind === 'create' ? 'CREATING ROOM…' : 'JOINING ROOM…');
    b.sub.setText(kind === 'create' ? `"${arg}"` : `code ${arg}`);
    const opts = { name: this._name, hat: SaveManager.getHat?.() || '', pid: getPid() }; // EP-11 cosmetic hat · Pass 2 player id
    if (this._data.champ) opts.champ = this._data.champ;
    try {
      const client = new Colyseus.Client(teamServerUrl());
      const room = kind === 'create'
        ? await client.create(ROOM_TYPE, { ...opts, roomName: arg })
        : await client.joinById(arg, opts);
      if (this._shuttingDown || b.cancelled || this._busy !== b) { try { room.leave(); } catch (_) { /* ignore */ } return; }
      this._closeBusy();
      this._enterRoom(room);
    } catch (e) {
      if (this._shuttingDown || b.cancelled) return;
      this._closeBusy();
      const msg = String(e?.message || e || 'unknown error');
      console.warn('[TeamCustom] connect failed:', msg);
      // Pass 2: one tab per player / still seated in a running match
      const je = joinError(e);
      if (je.code === 'DUP_TAB') {
        // 1st time: explain · again within 8 s: PLAY HERE (close the other tab, then retry)
        if (Date.now() < (this._dupArmedUntil || 0)) {
          this._dupArmedUntil = 0;
          this._toast('🗂️ Closing your other tab…', '#ffd23f', 2400);
          takeover().then(() => { if (!this._shuttingDown) setTimeout(() => this._connect(kind, arg), 500); });
        } else {
          this._dupArmedUntil = Date.now() + 8000;
          this._toast('🗂️ You are playing in another tab (one tab per player). Try again to play HERE instead.', '#ffd23f', 4200);
        }
        return;
      }
      if (je.code === 'IN_MATCH') { this._leaving = true; this._cleanup?.(); this.scene.start('TeamLobbyScene', { rejoin: true }); return; }
      let nice = msg;
      if (kind === 'join' && arg === this._invited) nice = 'That invite expired — the room is gone or the match already started';
      else if (/not found|invalid|no rooms/i.test(msg)) nice = kind === 'join' ? `No open room with code "${arg}"` : msg;
      else if (/locked|full/i.test(msg)) nice = 'That room is full or the match already started';
      else if (/fetch|network|ECONN|offline|failed/i.test(msg)) nice = "Can't reach the server";
      this._toast(`⚠ ${nice}`, '#ff8a8a', 3400);
      this._fetchRooms();
    }
  }

  // ───────────────────────── ROOM mode ─────────────────────────
  _enterRoom(room) {
    this._room = room;
    this._mode = 'room';
    this._roomSig = '';
    this._sidePending = null;
    this._startSentAt = 0;
    setTreeInput(this._listRoot, false);
    this._listRoot.setVisible(false);
    // Catch-all: feed / chat / announce in the room phase are ignored here (kept until handoff).
    this._offMsg = room.onMessage('*', () => { /* ignored before the draft */ });
    const onLeave = (code) => {
      if (this._shuttingDown || this._handedOff || this._room !== room) return;
      this._dropRoom(false);
      this._toListMode();
      this._toast(code === CLOSE_TAKEN_OVER ? '🗂️ You opened Bug Smash in another tab — left this room' : `The room was closed (code ${code})`, '#ff8a8a', 3400);
    };
    room.onLeave(onLeave);
    this._unsub.push(() => room.onLeave.remove?.(onLeave));
    const onErr = (code, msg) => { if (!this._shuttingDown) console.warn('[TeamCustom] room error', code, msg); };
    room.onError(onErr);
    this._unsub.push(() => room.onError.remove?.(onErr));
    this._clock = startClockSync(room, { everyMs: 3000 });
    this._unsub.push(() => this._clock?.stop());
    this._buildRoomView();
    AudioManager.reward?.();
  }

  _buildRoomView() {
    if (this._roomRoot) this._roomRoot.destroy();
    const root = this.add.container(0, 0).setDepth(5);
    this._roomRoot = root;
    this._title.setText('');
    this._subtitle.setText('');
    const cx = this.W / 2;
    this._rmName = this.add.text(cx, 32, '', {
      fontFamily: FONT_TITLE, fontSize: 30, color: '#ffffff', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5);
    glow(this._rmName, '#00d9ff', 12);
    this._rmCode = this.add.text(cx - 90, 74, '', {
      fontFamily: FONT_MONO, fontSize: 15, color: '#cfe3f5', backgroundColor: '#0d1320', padding: { x: 10, y: 5 },
    }).setOrigin(0.5);
    this._copyBtn = makeButton(this, {
      x: 0, y: 74, w: 96, h: 32, label: '📋 COPY', color: NEON.purple, fontSize: 12, onClick: () => this._copyCode(),
    });
    this._inviteBtn = makeButton(this, {
      x: 0, y: 74, w: 132, h: 32, label: '🔗 COPY INVITE', color: NEON.green, fontSize: 12, onClick: () => this._copyInvite(),
    });
    root.add([this._rmName, this._rmCode, this._copyBtn.root, this._inviteBtn.root]);

    this._cols = {};
    for (const team of ['blue', 'red']) {
      const L = COL[team], info = TEAM_INFO[team];
      const g = this.add.graphics();
      drawPanel(g, L.x, 110, L.w, 444, { color: info.color, radius: 16, halo: 0.1 });
      const hdr = this.add.text(L.x + 22, 140, `${info.emoji} ${info.name.toUpperCase()}`, {
        fontFamily: FONT_TITLE, fontSize: 20, color: info.css, stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0, 0.5);
      const count = this.add.text(L.x + L.w - 22, 140, '', {
        fontFamily: FONT_TITLE, fontSize: 15, color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(1, 0.5);
      root.add([g, hdr, count]);
      const seats = [];
      for (let i = 0; i < PER_SIDE; i++) {
        const y = SEAT.y0 + i * (SEAT.h + SEAT.gap);
        const sg = this.add.graphics();
        const icon = this.add.text(L.x + 44, y + SEAT.h / 2, '', { fontSize: 24, padding: { y: 4 } }).setOrigin(0.5);
        const nm = this.add.text(L.x + 74, y + SEAT.h / 2, '', {
          fontFamily: FONT_TITLE, fontSize: 18, color: '#ffffff', stroke: '#000000', strokeThickness: 3, padding: { y: 2 },
        }).setOrigin(0, 0.5);
        const tag = this.add.text(L.x + L.w - 34, y + SEAT.h / 2, '', {
          fontFamily: FONT_TITLE, fontSize: 13, color: '#ffd23f', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(1, 0.5);
        root.add([sg, icon, nm, tag]);
        seats.push({ g: sg, icon, nm, tag, y });
      }
      const btn = makeButton(this, {
        x: L.x + L.w / 2, y: 590, w: 300, h: 56, label: `JOIN ${team.toUpperCase()}`, sub: team === 'blue' ? '← · 1' : '→ · 2',
        color: info.color, fontSize: 18, onClick: () => this._side(team),
      });
      root.add(btn.root);
      this._cols[team] = { seats, count, btn, L, info };
    }
    const vs = this.add.circle(cx, 330, 24, 0x0a0a14, 1).setStrokeStyle(2, 0xffffff, 0.7);
    const vsT = this.add.text(cx, 330, 'VS', { fontFamily: FONT_TITLE, fontSize: 15, color: '#ffffff' }).setOrigin(0.5);
    root.add([vs, vsT]);

    this._leaveBtn = makeButton(this, {
      x: 150, y: 668, w: 220, h: 56, label: t('ui.leave'), sub: 'ESC', color: NEON.red, fontSize: 18,
      onClick: () => this._leaveRoom(),
    });
    this._botBtn = makeButton(this, {
      x: 416, y: 668, w: 244, h: 56, label: '🤖 BOT: EASY', sub: 'host · B', color: NEON.green, fontSize: 16,
      onClick: () => this._cycleBotLevel(),
    });
    this._infoT = this.add.text(740, 668, '', {
      fontFamily: FONT_MONO, fontSize: 13, color: '#cfe3f5', align: 'center', lineSpacing: 4,
    }).setOrigin(0.5);
    this._startBtn = makeButton(this, {
      x: 1096, y: 664, w: 320, h: 72, label: t('ui.start'), sub: ' ', color: NEON.green, fontSize: 24, primary: true,
      onClick: () => this._startNow(),
    });
    this._waitT = this.add.text(1096, 664, '', {
      fontFamily: FONT_TITLE, fontSize: 16, color: '#8fa3bf', stroke: '#000000', strokeThickness: 3, align: 'center',
    }).setOrigin(0.5);
    root.add([this._leaveBtn.root, this._botBtn.root, this._infoT, this._startBtn.root, this._waitT]);
    root.setAlpha(0);
    this.tweens.add({ targets: root, alpha: 1, duration: 200 });
    this._renderRoom(true);
  }

  _toListMode() {
    this._mode = 'list';
    if (this._roomRoot) { this._roomRoot.destroy(); this._roomRoot = null; }
    this._title.setText('CUSTOM ROOMS');
    this._subtitle.setText('create a room, invite friends with a 🔗 link or the code, pick a side — the host starts any time');
    this._listRoot.setVisible(true);
    setTreeInput(this._listRoot, true);
    this._ignoreKeysUntil = this.time.now + 150;
    this._renderList(true);
    this._fetchRooms();
  }

  /** Remove our listeners; `leave` = also leave the room (keeps the catch-all until the socket closes). */
  _dropRoom(leave) {
    for (const fn of this._unsub) { try { fn(); } catch (_) { /* ignore */ } }
    this._unsub.length = 0;
    this._clock = null;
    if (!leave && this._offMsg) { try { this._offMsg(); } catch (_) { /* ignore */ } }
    this._offMsg = null;
    const r = this._room;
    this._room = null;
    if (leave && r) { try { r.leave(); } catch (_) { /* ignore */ } }
  }

  _leaveRoom() {
    if (!this._room || this._leaving) return;
    AudioManager.uiClick();
    this._dropRoom(true);
    this._toListMode();
  }

  _roomRead() {
    const room = this._room, st = room?.state;
    if (!st) return null;
    const me = room.sessionId, hostId = st.hostId || '';
    const sides = { blue: [], red: [] };
    let myTeam = '', hostName = '';
    st.champions?.forEach?.((ch, key) => {
      if (!ch || ch.isBot) return;
      const team = ch.team === 'red' ? 'red' : 'blue';
      const e = { id: key, name: String(ch.name || 'Player'), host: key === hostId, me: key === me, rank: String(ch.rank || '') }; // Pass 2: rank badge
      sides[team].push(e);
      if (e.me) myTeam = team;
      if (e.host) hostName = e.name;
    });
    for (const t of ['blue', 'red']) sides[t].sort((a, b) => (b.host - a.host));
    const botLevel = (st.botLevel === 'easy' || st.botLevel === 'normal' || st.botLevel === 'hard') ? st.botLevel : 'easy';
    return {
      phase: st.phase || '', roomName: String(st.roomName || ''), hostId, isHost: !!hostId && hostId === me,
      hostName, sides, myTeam, humans: sides.blue.length + sides.red.length, botLevel,
    };
  }

  _renderRoom(force) {
    const s = this._roomRead();
    if (!s || !this._roomRoot) return;
    const now = Date.now();
    if (this._sidePending && (s.myTeam === this._sidePending.team || now - this._sidePending.at > 1500)) {
      if (s.myTeam !== this._sidePending.team) this._toast("Couldn't switch sides (that side may be full)", '#ff8a8a');
      this._sidePending = null; force = true;
    }
    const startPending = this._startSentAt && now - this._startSentAt < 2500;
    const sig = JSON.stringify([s.roomName, s.hostId, s.isHost, s.myTeam, s.sides, s.botLevel, !!this._sidePending, !!startPending, this._room?.roomId]);
    if (!force && sig === this._roomSig) return;
    this._roomSig = sig;
    this._rmName.setText(`🏠 ${clipName(s.roomName || 'Custom room', ROOM_NAME_MAX)}`);
    this._rmCode.setText(`code  ${this._room.roomId}`);
    this._copyBtn.root.x = this._rmCode.x + this._rmCode.width / 2 + 62;
    this._inviteBtn.root.x = this._copyBtn.root.x + 48 + 12 + 66;
    for (const team of ['blue', 'red']) {
      const col = this._cols[team], list = s.sides[team], L = col.L;
      col.count.setText(`${list.length}/${PER_SIDE}`);
      col.seats.forEach((seat, i) => {
        const e = list[i];
        const g = seat.g;
        g.clear();
        g.fillStyle(e ? (e.me ? 0x1c2a14 : 0x111a2b) : 0x0a0e18, e ? 0.95 : 0.7);
        fillRR(g, L.x + 16, seat.y, L.w - 32, SEAT.h, 10);
        g.lineStyle(e?.me ? 2 : 1, e?.me ? 0xffd23f : col.info.color, e ? 0.9 : 0.25);
        strokeRR(g, L.x + 16, seat.y, L.w - 32, SEAT.h, 10);
        if (e) {
          seat.icon.setText(e.host ? '👑' : '👤').setAlpha(1);
          seat.nm.setText(clipName(e.name, 16)).setColor(e.me ? '#ffd23f' : '#ffffff').setAlpha(1);
          seat.tag.setText([e.rank, e.host ? 'HOST' : '', e.me ? '(you)' : ''].filter(Boolean).join(' · '));
        } else {
          seat.icon.setText('🤖').setAlpha(0.5);
          seat.nm.setText('bot will fill').setColor('#6f86a6').setAlpha(0.8);
          seat.tag.setText('');
        }
      });
      const mine = s.myTeam === team, full = list.length >= PER_SIDE;
      const pend = this._sidePending?.team === team;
      col.btn.setLabel(mine ? '✓ YOUR SIDE' : (full ? 'SIDE FULL' : `JOIN ${team.toUpperCase()}`))
        .setSub(pend ? 'switching…' : (team === 'blue' ? '← · 1' : '→ · 2'))
        .setDimmed(mine || full || pend);
    }
    const bots = Math.max(0, PER_SIDE * 2 - s.humans);
    const botMeta = s.botLevel === 'hard'
      ? { label: '🤖 BOT: HARD', color: NEON.red }
      : s.botLevel === 'normal'
        ? { label: '🤖 BOT: NORMAL', color: NEON.cyan }
        : { label: '🤖 BOT: EASY', color: NEON.green };
    this._botBtn.setLabel(botMeta.label)
      .setSub(s.isHost ? 'click to change · B' : 'host sets bot level')
      .setDimmed(!s.isHost);
    this._infoT.setText(`👤 ${s.humans}/${ROOM_MAX_HUMANS} humans · 🤖 ${bots} bot${bots === 1 ? '' : 's'}\nnext: champion draft → loading → match`);
    this._startBtn.root.setVisible(s.isHost);
    setTreeInput(this._startBtn.root, s.isHost);
    this._startBtn.setSub(startPending ? 'starting…' : `Start · bots fill ${bots} seat${bots === 1 ? '' : 's'} · ENTER`).setDimmed(!!startPending);
    this._waitT.setVisible(!s.isHost);
    this._waitT.setText(s.hostName ? `⏳ waiting for host…\n👑 ${clipName(s.hostName, 16)} starts the match` : '⏳ waiting for host…');
  }

  _side(team) {
    const s = this._roomRead();
    if (!s || s.phase !== 'room') return;
    const col = this._cols?.[team];
    if (s.myTeam === team || (s.sides[team].length >= PER_SIDE)) { col?.btn.shake(); return; }
    const now = Date.now();
    if (now - this._sideAt < SIDE_GAP_MS || this._sidePending) { col?.btn.shake(); return; }
    this._sideAt = now;
    try { this._room.send('side', { team }); } catch (e) { console.warn('[TeamCustom] side failed', e?.message); return; }
    this._sidePending = { team, at: now };
    AudioManager.uiClick();
    this._renderRoom(true);
  }

  _cycleBotLevel() {
    const s = this._roomRead();
    if (!s || s.phase !== 'room') return;
    if (!s.isHost) { this._botBtn?.shake(); this._toast('Only the host 👑 can change bot level', '#ffd23f'); return; }
    const order = ['easy', 'normal', 'hard'];
    const next = order[(order.indexOf(s.botLevel) + 1) % order.length];
    try { this._room.send('botLevel', { level: next }); } catch (e) { console.warn('[TeamCustom] botLevel failed', e?.message); return; }
    AudioManager.uiClick();
  }

  _startNow() {
    const s = this._roomRead();
    if (!s || s.phase !== 'room') return;
    if (!s.isHost) { this._toast('Only the host 👑 can start the match', '#ffd23f'); return; }
    if (this._startSentAt && Date.now() - this._startSentAt < 2500) { this._startBtn.shake(); return; }
    try { this._room.send('startNow'); } catch (e) { console.warn('[TeamCustom] startNow failed', e?.message); return; }
    this._startSentAt = Date.now();
    AudioManager.reward?.();
    this._renderRoom(true);
  }

  async _clip(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch (_) { return false; }
    }
  }

  async _copyCode() {
    const code = this._room?.roomId;
    if (!code) return;
    const ok = await this._clip(code);
    if (this._shuttingDown) return;
    this._toast(ok ? `📋 Code ${code} copied — send it to your friends` : `Code: ${code} (copy it by hand)`, ok ? '#7ed957' : '#ffd23f');
  }

  /** EP-11: a link that drops a friend straight into this room (main.js handles ?room=). */
  inviteUrl() {
    const code = this._room?.roomId;
    if (!code) return '';
    const loc = window.location;
    const keep = new URLSearchParams(loc.search).get('server'); // custom server stays in the link
    return `${loc.origin}${loc.pathname}?room=${encodeURIComponent(code)}${keep ? `&server=${encodeURIComponent(keep)}` : ''}`;
  }

  async _copyInvite() {
    const url = this.inviteUrl();
    if (!url) return;
    const ok = await this._clip(url);
    if (this._shuttingDown) return;
    this._lastInvite = url;
    this._toast(ok ? '🔗 Invite link copied — paste it in Zalo / Messenger' : `Invite: ${url}`, ok ? '#7ed957' : '#ffd23f', ok ? 2600 : 6000);
    AudioManager.uiClick();
  }

  _handoff() {
    const room = this._room;
    if (!room || this._leaving || this._handedOff) return;
    const s = this._roomRead();
    const clk = this._clock?.sample() || null;       // read before the sync is stopped
    // Keep the catch-all until TeamSelectScene has registered its own handlers (it calls dropMsg).
    const dropMsg = this._offMsg; this._offMsg = null;
    this._dropRoom(false);
    this._handedOff = true;
    this._leaving = true;
    AudioManager.reward?.();
    this.scene.start('TeamSelectScene', {
      room, name: this._name, champ: this._data.champ, clockOffset: clk ? clk.offset : undefined,
      clockRtt: clk ? clk.rtt : undefined, dropMsg, custom: true, roomName: s?.roomName || '',
    });
  }

  // ───────────────────────── input + loop ─────────────────────────
  _bindKeys() {
    const kb = this.input.keyboard;
    if (!kb) return;
    this._onKey = (ev) => {
      if (this._shuttingDown || this._leaving || this._naming) return;
      if (this.time.now < this._ignoreKeysUntil) return;
      const k = ev.key;
      if (this._modal) {
        if (k === 'Enter') this._modalOk();
        else if (k === 'Escape') this._closeModal();
        return;
      }
      if (this._busy) { if (k === 'Escape') this._cancelBusy(); return; }
      if (this._mode === 'room') {
        if (k === 'ArrowLeft' || k === '1') this._side('blue');
        else if (k === 'ArrowRight' || k === '2') this._side('red');
        else if (k === 'Enter') this._startNow();
        else if (k === 'c' || k === 'C') this._copyCode();
        else if (k === 'i' || k === 'I') this._copyInvite();
        else if (k === 'b' || k === 'B') this._cycleBotLevel();
        else if (k === 'Escape') this._leaveRoom();
        return;
      }
      if (k === 'ArrowUp') this._scrollBy(-1);
      else if (k === 'ArrowDown') this._scrollBy(1);
      else if (k === 'Enter') { ev.preventDefault?.(); if (this._rooms.length) this._joinIdx(this._sel); else this._askCreate(); }
      // preventDefault: the modal focuses its <input> synchronously — the shortcut char must not land in it.
      else if (k === 'n' || k === 'N') { ev.preventDefault?.(); this._askCreate(); }
      else if (k === 'j' || k === 'J') { ev.preventDefault?.(); this._askCode(); }
      else if (k === 'r' || k === 'R') this._fetchRooms(true);
      else if (k === 'Escape') this._onBack();
    };
    kb.on('keydown', this._onKey);
    kb.once('keydown', () => AudioManager.prime?.());
  }

  _onBack() {
    if (this._leaving) return;
    if (this._modal) { this._closeModal(); return; }
    if (this._busy) { this._cancelBusy(); return; }
    if (this._mode === 'room') { this._leaveRoom(); return; }
    this._leaving = true;
    AudioManager.uiClick();
    fadeToScene(this, 'TeamLobbyScene', undefined, 220, 600);
  }

  update() {
    if (this._shuttingDown) return;
    if (this._mode === 'list') {
      if (this._fetchedAt) {
        const ago = Math.floor((Date.now() - this._fetchedAt) / 1000);
        const txt = this._listErr ? `⚠ ${this._listErr}` : `updated ${ago}s ago · auto refresh`;
        if (txt !== this._updatedT.text) this._updatedT.setText(txt);
      }
      return;
    }
    if (this._mode === 'room' && this._room) {
      const ph = this._room.state?.phase;
      if (ph === 'select' || ph === 'loading' || ph === 'playing' || ph === 'ended') { this._handoff(); return; }
      this._renderRoom(false);
    }
  }

  _cleanup() {
    this._shuttingDown = true;
    if (this._room) this._dropRoom(!this._handedOff);
    if (this._refreshEvt) { this._refreshEvt.remove(false); this._refreshEvt = null; }
    if (this._inputEl) { const el = this._inputEl; this._inputEl = null; el.remove(); }
    if (this._onWinResize) {
      window.removeEventListener('resize', this._onWinResize);
      this.scale.off('resize', this._onWinResize);
      this._onWinResize = null;
    }
    if (this._onKey && this.input.keyboard) this.input.keyboard.off('keydown', this._onKey);
    this.input.off('wheel');
    this._modal = null; this._busy = null;
  }
}

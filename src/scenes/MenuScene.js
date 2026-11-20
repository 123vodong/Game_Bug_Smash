// MenuScene — title screen for BUG SMASH: Save the Deadline.
// The background already contains the title, stickman, bugs and code editor.
// This scene adds the buttons (PLAY · Personal / Team · SETTINGS / CAREER / LEVELS),
// the daily-missions + DEV TIP cards, and the first-run welcome card.
import { SaveManager } from '../core/SaveManager.js';
import { Progress } from '../core/Progress.js';
import { TOTAL_LEVELS } from '../data/levels.js';
import { AudioManager } from '../core/AudioManager.js';
import { TIPS_DEFAULT, TIPS_REAL } from '../data/tips.js';
import { MISSION_MODES, dayKey } from '../data/missions.js';
import { HATS, isHatUnlocked } from '../data/cosmetics.js';
import { SettingsPanel } from '../ui/SettingsPanel.js';
import { ProfilePanel } from '../ui/ProfilePanel.js';
import { LevelSelectPanel } from '../ui/LevelSelectPanel.js';
import { WelcomePanel } from '../ui/WelcomePanel.js';

// Stats API on the game server — same host rules as MultiPlayScene's SERVER_URL /
// Team Mode's teamServerUrl(): `?server=ws(s)://…` override, the :8000 python static
// server → :2567, otherwise the page's own host + port (the server serves the static files).
const STATS_URL = (() => {
  const loc = window.location;
  const o = new URLSearchParams(loc.search).get('server');
  if (o && /^wss?:\/\//.test(o)) return o.replace(/^ws/, 'http').replace(/\/+$/, '') + '/api/stats';
  if (loc.port === '8000') return `http://${loc.hostname || 'localhost'}:2567/api/stats`;
  if (loc.protocol === 'http:' || loc.protocol === 'https:') return `${loc.origin}/api/stats`;
  return 'http://localhost:2567/api/stats';
})();

const NEON_GREEN  = 0x39ff14;
const NEON_TEAL   = 0x00d9c2;
const NEON_CYAN   = 0x00d9ff;
const NEON_PURPLE = 0xc44dff;
const NEON_PINK   = 0xff3ef2;
const NEON_YELLOW = 0xffd23f;

export default class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  preload() {
    this.load.image('menu-bg', 'assets/menu_scene/background.png');
  }

  create() {
    const { width: W, height: H } = this.scale;

    // Background (do not modify)
    this.add.image(W / 2, H / 2, 'menu-bg').setDisplaySize(W, H).setDepth(-10);

    AudioManager.applySaved();   // mute + volume from the save
    this._modal = null;          // open panel (menu keys are ignored while one is up)
    this._starting = false;

    // Subtle ambient particles drifting up
    this._spawnNeonParticles();

    // Floating right-side panels
    this._drawDailyMission(W, H);
    this._drawDevTip(W, H);

    // Buttons — center stacked
    this._drawButtons(W, H);

    // Tiny corner hint (bottom-left)
    this._drawCornerInfo(W, H);

    // Keyboard (ignored while a panel is open)
    this.input.keyboard.on('keydown-ENTER', () => { if (!this._modalOpen()) this._startGame(); });
    this.input.keyboard.on('keydown-M', () => { if (!this._modalOpen()) this._toggleMute(); });
    this.input.keyboard.on('keydown-L', () => { if (!this._modalOpen()) this._openLevels(); });

    this.cameras.main.fadeIn(300, 0, 0, 0);

    // First run: welcome card with the name field (EP-13). Existing players skip it.
    if (!SaveManager.getFlag('welcomeSeen')) {
      const c = SaveManager.getCareer();
      const veteran = SaveManager.getPlayerName() || c.sessions > 0 || c.teamGames > 0 || c.teamPractice > 0
        || SaveManager.getUnlockedIndex() > 0;
      if (veteran) SaveManager.setFlag('welcomeSeen', true);
      else this.time.delayedCall(350, () => { if (!this._starting) this._openWelcome(); });
    }
  }

  // ============================================================ PANELS
  _modalOpen() { return !!(this._modal && !this._modal.closed); }

  _openPanel(make) {
    if (this._modalOpen() || this._starting) return null;
    this._modal = make(() => { this._modal = null; this._refreshAfterPanel(); });
    return this._modal;
  }

  _openWelcome() {
    this._openPanel(() => WelcomePanel.open(this, {
      mode: 'welcome',
      onChoice: (choice, name) => {
        this._modal = null;
        this._nameDisplay?.setText(this._nameLabelText(name));
        if (choice === 'campaign') this._startLevel(0);
        else if (choice === 'online') this.scene.start('MultiPlayScene');
      },
    }));
  }

  _openSettings(tab = 'settings') { this._openPanel((onClose) => SettingsPanel.open(this, { tab, onClose })); }
  _openCareer() { this._openPanel((onClose) => ProfilePanel.open(this, { onClose })); }
  _openLevels() {
    this._openPanel((onClose) => LevelSelectPanel.open(this, {
      onClose, onPlay: (i) => { this._modal = null; this._startLevel(i); },
    }));
  }

  /** A panel may have changed the hat / name → redraw the small bits. */
  _refreshAfterPanel() {
    if (!this.sys.isActive()) return;
    this._nameDisplay?.setText(this._nameLabelText(SaveManager.getPlayerName()));
    this._careerText?.setText(this._careerLine());
  }

  // ============================================================ BUTTONS
  _drawButtons(W, H) {
    // PLAY — large, rounded, neon green border, dark interior, white play icon
    const playY = H * 0.62;
    const play = this._roundedNeonButton({
      x: W / 2, y: playY, w: 320, h: 86, radius: 18,
      label: 'PLAY', fontSize: 32,
      color: NEON_GREEN, iconKind: 'play', primary: true,
    });
    play.on('pointerup', () => this._startGame());

    // ── Multiplayer panel: "MULTIPLAYER" frame containing 2 mode buttons ──
    const mpY = H * 0.76;
    const mpFrameW = 430;
    const mpFrameH = 78;

    // Frame background
    const mpFrame = this.add.graphics().setDepth(9);
    mpFrame.fillStyle(0x0a0a14, 0.6);
    mpFrame.fillRoundedRect(W / 2 - mpFrameW / 2, mpY - mpFrameH / 2,
                             mpFrameW, mpFrameH, 14);
    mpFrame.lineStyle(2, NEON_CYAN, 0.6);
    mpFrame.strokeRoundedRect(W / 2 - mpFrameW / 2, mpY - mpFrameH / 2,
                               mpFrameW, mpFrameH, 14);

    // "MULTIPLAYER" header label — sits on top edge of the frame
    const mpLabelBg = this.add.rectangle(W / 2, mpY - mpFrameH / 2, 130, 16, 0x0a0a14, 1)
      .setStrokeStyle(2, NEON_CYAN, 0.7)
      .setDepth(9);
    const mpLabel = this.add.text(W / 2, mpY - mpFrameH / 2, 'MULTIPLAYER', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 11, color: '#00d9ff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);

    // PERSONAL MODE — active, green neon, with infinity icon (endless mode)
    const personal = this._roundedNeonButton({
      x: W / 2 - 100, y: mpY + 4, w: 190, h: 46, radius: 12,
      label: 'PERSONAL', fontSize: 14,
      color: NEON_GREEN, iconKind: 'infinity',
    });
    personal.on('pointerup', () => this.scene.start('MultiPlayScene'));

    // Live "who's online" badge — social proof that the arena is alive.
    this._onlineText = this.add.text(W / 2, mpY + mpFrameH / 2 + 14, '● checking who\'s online…', {
      fontFamily: 'Consolas, monospace', fontSize: 12, color: '#7ec8ff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(11);
    this._refreshOnline();
    this.time.addEvent({ delay: 10000, loop: true, callback: () => this._refreshOnline() });

    // TEAM MODE — "Office Siege" 5v5 MOBA (champion select → match; bots fill seats)
    const team = this._roundedNeonButton({
      x: W / 2 + 100, y: mpY + 4, w: 190, h: 46, radius: 12,
      label: 'TEAM 5v5', fontSize: 14,
      color: NEON_PURPLE, iconKind: 'swords',
    });
    team.on('pointerup', () => this.scene.start('TeamLobbyScene'));
    // Small "NEW" sticker on the button's top-right corner.
    const newTag = this.add.container(W / 2 + 100 + 82, mpY + 4 - 22).setDepth(12).setAngle(8);
    const newBg = this.add.graphics();
    newBg.fillStyle(NEON_PINK, 1);
    newBg.fillRoundedRect(-19, -8, 38, 16, 8);
    newTag.add([newBg, this.add.text(0, 0, 'NEW', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 10, color: '#ffffff',
    }).setOrigin(0.5)]);
    this.tweens.add({
      targets: newTag, scale: { from: 1, to: 1.12 },
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Bottom row: SETTINGS · CAREER · LEVELS (narrow enough to leave the bottom-left text clear).
    const subY = H * 0.90;
    const settings = this._roundedNeonButton({
      x: W / 2 - 172, y: subY, w: 160, h: 50, radius: 14,
      label: 'SETTINGS', fontSize: 15,
      color: NEON_TEAL, iconKind: 'gear',
    });
    settings.on('pointerup', () => this._openSettings());

    const career = this._roundedNeonButton({
      x: W / 2, y: subY, w: 160, h: 50, radius: 14,
      label: 'CAREER', fontSize: 15,
      color: NEON_YELLOW, iconKind: 'user',
    });
    career.on('pointerup', () => this._openCareer());

    const levels = this._roundedNeonButton({
      x: W / 2 + 172, y: subY, w: 160, h: 50, radius: 14,
      label: 'LEVELS', fontSize: 15,
      color: NEON_TEAL, iconKind: 'grid',
    });
    levels.on('pointerup', () => this._openLevels());

    // About / credits link (bottom-left). The platformer prototype is no longer linked here
    // (reachable by URL only — coordinator wires ?scene=platformer in main.js).
    const about = this.add.text(16, H - 10, 'ⓘ about · credits', {
      fontFamily: 'Consolas, monospace', fontSize: 12, color: '#7ec8ff',
    }).setOrigin(0, 0.5).setDepth(11).setInteractive({ useHandCursor: true });
    about.on('pointerover', () => about.setColor('#ffffff'));
    about.on('pointerout',  () => about.setColor('#7ec8ff'));
    about.on('pointerup',   () => this._openSettings('about'));

    // ---------- Multiplayer entry cluster (bottom-right) ----------
    // Display-name line ("name: <click to edit>") sits above the green link.
    const savedName = SaveManager.getPlayerName() || '';
    this._nameDisplay = this.add.text(W - 16, H - 30, this._nameLabelText(savedName), {
      fontFamily: 'Consolas, monospace', fontSize: 11, color: '#aab0c0',
    }).setOrigin(1, 0.5).setDepth(11).setInteractive({ useHandCursor: true });
    this._nameDisplay.on('pointerover', () => this._nameDisplay.setColor('#ffffff'));
    this._nameDisplay.on('pointerout',  () => this._nameDisplay.setColor('#aab0c0'));
    this._nameDisplay.on('pointerup',   () => this._promptForName());
    this._nameDisplay.setPadding(10, 8, 0, 8); // bigger tap target on phones

  }

  async _refreshOnline() {
    const t = this._onlineText;
    if (!t) return;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(STATS_URL, { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(timer);
      const s = await res.json();
      if (!t.scene) return;
      const n = s.online | 0;
      if (n > 0) {
        const devs = n === 1 ? '1 dev' : `${n} devs`;
        t.setText(`● ${devs} online now · AI coworkers on duty`).setColor('#7ed957');
      } else {
        t.setText('● arena is open · AI coworkers waiting for you').setColor('#7ec8ff');
      }
    } catch (_) {
      if (t.scene) t.setText('● multiplayer server offline (start: node server/index.js)').setColor('#ff8a8a');
    }
  }

  _nameLabelText(name) {
    return name ? `name: ${name} (edit)` : 'name: (click to set)';
  }

  _promptForName() {
    // DOM name card (IME-safe, works with phone keyboards) — replaces window.prompt.
    this._openPanel((onClose) => WelcomePanel.open(this, {
      mode: 'rename', onClose,
      onDone: (clean) => { this._modal = null; this._nameDisplay.setText(this._nameLabelText(clean)); },
    }));
  }

  /**
   * Rounded-rectangle neon button.
   * Returns the interactive hit target.
   */
  _roundedNeonButton(opts) {
    const { x, y, w, h, radius, label, fontSize, color, iconKind, primary } = opts;
    const container = this.add.container(x, y).setDepth(10);

    // Soft shadow (Graphics doesn't support shadow blur, so draw a darker
    // rounded rect slightly offset)
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.55);
    shadow.fillRoundedRect(-w / 2 + 2, -h / 2 + 6, w, h, radius);
    container.add(shadow);

    // Outer glow halo — bigger, semi-transparent
    const glow = this.add.graphics();
    glow.fillStyle(color, 0.22);
    glow.fillRoundedRect(-w / 2 - 10, -h / 2 - 10, w + 20, h + 20, radius + 6);
    container.add(glow);

    // Panel (dark fill + neon border)
    const panel = this.add.graphics();
    panel.fillStyle(0x0a0a14, 0.95);
    panel.fillRoundedRect(-w / 2, -h / 2, w, h, radius);
    panel.lineStyle(3, color, 1);
    panel.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
    container.add(panel);

    // Top gloss
    const gloss = this.add.graphics();
    gloss.fillStyle(0xffffff, 0.06);
    gloss.fillRoundedRect(-w / 2 + 6, -h / 2 + 4, w - 12, h * 0.35, radius - 6);
    container.add(gloss);

    // Label first so we can measure its width
    const txt = this.add.text(0, 0, label, {
      fontFamily: 'Arial Black, Impact, sans-serif',
      fontSize, color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0, 0.5);
    txt.setShadow(0, 0, this._hex(color), primary ? 12 : 7, true, true);

    if (iconKind) {
      // Center the (icon + gap + text) cluster horizontally inside the button.
      const iconW = primary ? 44 : 22;
      const gap   = primary ? 14 : 10;
      const total = iconW + gap + txt.width;
      const iconX = -total / 2 + iconW / 2;
      const textX = iconX + iconW / 2 + gap;
      const iconC = this._drawIcon(iconKind, color, primary);
      iconC.x = iconX;
      iconC.y = 0;
      txt.x = textX;
      container.add(iconC);
      container.add(txt);
    } else {
      // No icon — just center the text
      txt.setOrigin(0.5, 0.5);
      container.add(txt);
    }

    // Interactive hit area
    const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    container.add(hit);

    hit.on('pointerover', () => {
      container.setScale(1.05);
      glow.setAlpha(0.55);
      AudioManager.uiHover();
    });
    hit.on('pointerout',  () => {
      container.setScale(1);
      glow.setAlpha(0.22);
    });
    hit.on('pointerdown', () => { container.setScale(0.96); AudioManager.uiClick(); });
    hit.on('pointerup',   () => container.setScale(1.05));

    // Pulse glow halo
    this.tweens.add({
      targets: glow,
      alpha: { from: primary ? 0.22 : 0.18, to: primary ? 0.50 : 0.36 },
      duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    // Primary button breathes
    if (primary) {
      this.tweens.add({
        targets: container, scale: { from: 1, to: 1.03 },
        duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }

    return hit;
  }

  // ============================================================ ICONS
  _drawIcon(kind, color, primary = false) {
    const c = this.add.container(0, 0);

    if (kind === 'play') {
      // Rounded square frame with play triangle inside (like a video player icon)
      const sz = primary ? 44 : 26;
      const frame = this.add.graphics();
      frame.fillStyle(0x0a1a0e, 1);
      frame.fillRoundedRect(-sz / 2, -sz / 2, sz, sz, 8);
      frame.lineStyle(2, color, 1);
      frame.strokeRoundedRect(-sz / 2, -sz / 2, sz, sz, 8);
      c.add(frame);
      // Triangle
      const tri = this.add.graphics();
      tri.fillStyle(0xffffff, 1);
      tri.beginPath();
      const t = sz * 0.28;
      tri.moveTo(-t * 0.6, -t);
      tri.lineTo(t, 0);
      tri.lineTo(-t * 0.6, t);
      tri.closePath();
      tri.fillPath();
      c.add(tri);
    } else if (kind === 'gear') {
      const g = this.add.graphics();
      g.lineStyle(2.5, 0xffffff, 1);
      g.strokeCircle(0, 0, 8);
      g.fillStyle(0xffffff, 1);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = Math.cos(a) * 11 - 1.6;
        const y = Math.sin(a) * 11 - 1.6;
        g.fillRect(x, y, 3.2, 3.2);
      }
      g.fillStyle(0x0a0a14, 1);
      g.fillCircle(0, 0, 3);
      c.add(g);
    } else if (kind === 'user') {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillCircle(0, -5, 5);
      // Shoulders / body
      g.fillRoundedRect(-8, 1, 16, 9, 5);
      c.add(g);
    } else if (kind === 'infinity') {
      // Two overlapping circles drawn as a stroked figure-8 = ∞
      const g = this.add.graphics();
      g.lineStyle(3, 0xffffff, 1);
      g.strokeCircle(-6, 0, 5.5);
      g.strokeCircle( 6, 0, 5.5);
      c.add(g);
    } else if (kind === 'grid') {
      // 3×2 level tiles
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      for (let r = 0; r < 2; r++) for (let q = 0; q < 3; q++) g.fillRoundedRect(-11 + q * 8, -7 + r * 8, 6, 6, 1.5);
      c.add(g);
    } else if (kind === 'swords') {
      // Two crossed sword silhouettes (simple X with hilts)
      const g = this.add.graphics();
      g.lineStyle(3, 0xffffff, 1);
      // Blade 1: top-left → bottom-right
      g.lineBetween(-9, -9,  9,  9);
      // Blade 2: top-right → bottom-left
      g.lineBetween( 9, -9, -9,  9);
      // Hilts as small bars near the top of each blade
      g.lineStyle(3, 0xffffff, 1);
      g.lineBetween(-12, -6, -6, -12);
      g.lineBetween( 12, -6,  6, -12);
      c.add(g);
    }

    return c;
  }

  // ============================================================ HOLOGRAM PANELS
  /** Floating DAILY MISSION hologram card (right side, mid). */
  _drawDailyMission(W, H) {
    // Real daily missions (same 3 for everyone today: 2 Personal + 1 Team-or-Campaign).
    const day = dayKey();
    const missions = Progress.today();

    const panelW = 240, panelH = 172;  // left edge stays clear of the title art
    const x = W - panelW / 2 - 14;
    const y = H * 0.42;
    const c = this.add.container(x, y).setDepth(8);

    c.add(this.add.rectangle(4, 6, panelW, panelH, 0x000000, 0.55));
    const halo = this.add.rectangle(0, 0, panelW + 16, panelH + 16, NEON_CYAN, 0.20);
    c.add(halo);
    c.add(this.add.rectangle(0, 0, panelW, panelH, 0x05101e, 0.92).setStrokeStyle(2, NEON_CYAN));
    c.add(this.add.rectangle(0, 0, panelW - 8, panelH - 8, 0, 0).setStrokeStyle(1, NEON_CYAN, 0.4));
    c.add(this.add.rectangle(0, -panelH / 2 + 14, panelW - 16, 18, NEON_CYAN, 0.18));

    const title = this.add.text(0, -panelH / 2 + 14, 'DAILY MISSIONS', {
      fontFamily: 'Arial Black, Impact, sans-serif', fontSize: 13, color: '#ffd23f',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    title.setShadow(0, 0, '#ffd23f', 6, true, true);
    c.add(title);

    let doneCount = 0;
    const startY = -panelH / 2 + 44;
    missions.forEach((m, i) => {
      const yy = startY + i * 30;
      const done = m.done;
      if (done) doneCount++;
      const prog = m.progress;
      const check = this.add.text(-panelW / 2 + 10, yy, done ? '✓' : '○', {
        fontFamily: 'Arial Black, sans-serif', fontSize: done ? 16 : 13,
        color: done ? '#7ed957' : '#5a7a90', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0, 0.5);
      if (done) check.setShadow(0, 0, '#39ff14', 6, true, true);
      // Mode icon: 🌐 Personal · ⚔️ Team 5v5 · 🎯 Campaign
      const icon = this.add.text(-panelW / 2 + 36, yy, (MISSION_MODES[m.mode] || MISSION_MODES.arena).icon, {
        fontSize: 12,
      }).setOrigin(0.5).setAlpha(done ? 0.6 : 1);
      const pr = this.add.text(panelW / 2 - 10, yy, done ? 'done' : `${prog}/${m.goal}`, {
        fontFamily: 'Consolas, monospace', fontSize: 11, color: done ? '#7ed957' : '#00cfff',
      }).setOrigin(1, 0.5);
      const text = this.add.text(-panelW / 2 + 48, yy, m.text, {
        fontFamily: 'Consolas, monospace', fontSize: 11, color: done ? '#8fa8b8' : '#ffffff',
      }).setOrigin(0, 0.5);
      const room = panelW - 48 - 16 - pr.width;   // squeeze long mission names instead of overlapping
      if (text.width > room) text.setScale(room / text.width, 1);
      c.add([check, icon, text, pr]);
    });

    // Progress bar = missions completed today; streak = consecutive full days.
    const barW = panelW - 30;
    const frac = missions.length ? doneCount / missions.length : 0;
    c.add(this.add.rectangle(0, panelH / 2 - 26, barW, 4, 0x002535, 1));
    if (frac > 0) {
      c.add(this.add.rectangle(-barW / 2, panelH / 2 - 26, barW * frac, 4, NEON_CYAN, 1).setOrigin(0, 0.5));
    }
    const streak = SaveManager.getLiveStreak(day);
    const live = streak > 0;
    c.add(this.add.text(-panelW / 2 + 14, panelH / 2 - 13, live ? `🔥 ${streak}-day streak` : 'finish all 3 to start a streak', {
      fontFamily: 'Consolas, monospace', fontSize: 10, color: live ? '#ffb347' : '#5a7a90',
    }).setOrigin(0, 0.5));
    c.add(this.add.text(panelW / 2 - 14, panelH / 2 - 13, `${doneCount}/${missions.length}`, {
      fontFamily: 'Consolas, monospace', fontSize: 10, color: '#00cfff',
    }).setOrigin(1, 0.5));

    this.tweens.add({
      targets: halo, alpha: { from: 0.20, to: 0.42 },
      duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    // Tap the card → CAREER · TODAY (details + streak hats).
    const hit = this.add.rectangle(0, 0, panelW, panelH, 0xffffff, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this._openPanel((onClose) => ProfilePanel.open(this, { tab: 'today', onClose })));
    c.add(hit);
  }

  /** Small DEV TIP holographic card (bottom-right). */
  _drawDevTip(W, H) {
    const panelW = 230, panelH = 88;
    const x = W - panelW / 2 - 28;
    const y = H - panelH / 2 - 130;   // lifted higher
    const c = this.add.container(x, y).setDepth(8);

    c.add(this.add.rectangle(4, 5, panelW, panelH, 0x000000, 0.55));
    const halo = this.add.rectangle(0, 0, panelW + 14, panelH + 14, NEON_CYAN, 0.18);
    c.add(halo);
    c.add(this.add.rectangle(0, 0, panelW, panelH, 0x05101e, 0.92).setStrokeStyle(2, NEON_CYAN));
    c.add(this.add.rectangle(0, 0, panelW - 8, panelH - 8, 0, 0).setStrokeStyle(1, NEON_CYAN, 0.4));

    const codeIcon = this.add.text(-panelW / 2 + 10, -panelH / 2 + 8, '</>', {
      fontFamily: 'Consolas, monospace', fontSize: 14, color: '#00cfff',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0, 0);
    codeIcon.setShadow(0, 0, '#00cfff', 5, true, true);
    c.add(codeIcon);

    const title = this.add.text(0, -panelH / 2 + 14, 'DEV TIP', {
      fontFamily: 'Arial Black, Impact, sans-serif', fontSize: 13, color: '#ffd23f',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);
    title.setShadow(0, 0, '#ffd23f', 5, true, true);
    c.add(title);

    // Tip text — pulled from TIPS_DEFAULT, rotates every 5 seconds with a fade
    const tipText = this.add.text(0, 14, '', {
      fontFamily: 'Consolas, monospace', fontSize: 12, color: '#aff0ff',
      align: 'center', wordWrap: { width: panelW - 24, useAdvancedWrap: true },
    }).setOrigin(0.5);
    c.add(tipText);

    // Real tips and jokes alternate 1:1 (EP-13); each pool is shuffled so nothing repeats soon.
    const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
    const pools = { real: shuffle(TIPS_REAL), joke: shuffle(TIPS_DEFAULT) };
    const idx = { real: 0, joke: 0 };
    let useReal = true;   // first card is a real tip
    const nextTip = () => {
      const k = useReal ? 'real' : 'joke';
      useReal = !useReal;
      const pool = pools[k];
      const t = pool[idx[k] % pool.length];
      idx[k]++;
      return k === 'real' ? `💡 ${t}` : `"${t}"`;
    };
    tipText.setText(nextTip());

    this._tipRotateEvt = this.time.addEvent({
      delay: 6000, loop: true,
      callback: () => {
        this.tweens.add({
          targets: tipText, alpha: 0, duration: 300,
          onComplete: () => {
            tipText.setText(nextTip());
            this.tweens.add({ targets: tipText, alpha: 1, duration: 400 });
          },
        });
      },
    });

    this.tweens.add({
      targets: halo, alpha: { from: 0.18, to: 0.38 },
      duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  // ============================================================ AMBIENT
  _spawnNeonParticles() {
    const { width: W, height: H } = this.scale;
    const colors = [NEON_GREEN, NEON_CYAN, NEON_PURPLE, NEON_YELLOW, NEON_PINK];
    this.time.addEvent({
      delay: 300, loop: true,
      callback: () => {
        const x = Math.random() * W;
        const y = H + 8;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const p = this.add.circle(x, y, 1.6 + Math.random() * 2, color, 0.85).setDepth(0);
        this.tweens.add({
          targets: p,
          y: y - 120 - Math.random() * 240,
          x: x + (Math.random() - 0.5) * 50,
          alpha: 0,
          duration: 2400 + Math.random() * 1400,
          ease: 'Sine.easeOut',
          onComplete: () => p.destroy(),
        });
      },
    });
  }

  _drawCornerInfo(W, H) {
    const c = SaveManager.getCareer();
    const stars = c.campaignStars;
    const txt = this.add.text(28, H - 24,
      `levels ${Math.min(c.campaignLevels, TOTAL_LEVELS)}/${TOTAL_LEVELS} ★${stars}   [L] levels  [M] mute  [ENTER] play`, {
      fontFamily: 'Consolas, monospace', fontSize: 11, color: '#ffffff',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0, 0.5).setDepth(46);
    txt.setAlpha(0.7);

    // Career across modes + hat collection (cosmetics only). Opens the CAREER panel.
    this._careerText = this.add.text(28, H - 42, this._careerLine(), {
      fontFamily: 'Consolas, monospace', fontSize: 11, color: '#ffd23f',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0, 0.5).setDepth(46).setAlpha(0.85).setInteractive({ useHandCursor: true });
    this._careerText.on('pointerup', () => this._openCareer());
  }

  /** One short line — it shares the bottom-left with the SETTINGS button's glow (x ≥ 390). */
  _careerLine() {
    const c = SaveManager.getCareer();
    const hats = HATS.filter((h) => h.unlock && isHatUnlocked(h, c)).length;
    const total = HATS.length - 1;
    const played = c.bugs > 0 || c.sessions > 0 || c.teamGames > 0 || c.teamPractice > 0 || c.campaignLevels > 0;
    if (!played) return `career: ${total} hats to unlock across every mode 🎩`;
    const parts = [];
    if (c.bugs || c.sessions) parts.push(`${c.bugs} bugs`);
    if (c.teamGames) parts.push(`siege ${c.teamWins}W/${c.teamGames}`);
    parts.push(`hats ${hats}/${total}`);
    return `career · ${parts.join(' · ')}`;
  }

  // ============================================================ ACTIONS
  _toast(msg) {
    const { width: W, height: H } = this.scale;
    const t = this.add.text(W / 2, H * 0.50, msg, {
      fontFamily: 'Consolas, monospace', fontSize: 14, color: '#ffffff',
      backgroundColor: '#05101e', padding: { x: 16, y: 10 },
    }).setOrigin(0.5).setDepth(60);
    t.setShadow(0, 0, '#00d9ff', 10, true, true);
    this.tweens.add({
      targets: t, alpha: 0,
      duration: 1800, hold: 1200, ease: 'Cubic.easeIn',
      onComplete: () => t.destroy(),
    });
  }

  _toggleMute() {
    const m = AudioManager.toggleMute();
    SaveManager.setMuted(m);
    this._toast(m ? '🔇 muted' : '🔊 sound on');
  }

  _startGame() {
    // PLAY = next unplayed level (or 1-1 once the campaign is done). LEVELS picks any open level.
    let idx = SaveManager.getUnlockedIndex();
    if (idx >= TOTAL_LEVELS) idx = 0;
    this._startLevel(idx);
  }

  _startLevel(idx) {
    if (this._starting) return;
    this._starting = true;
    AudioManager.uiClick();
    const i = Math.max(0, Math.min(TOTAL_LEVELS - 1, idx | 0));
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('HuntScene', { levelIndex: i });
    });
  }

  _hex(intColor) {
    return '#' + intColor.toString(16).padStart(6, '0');
  }
}

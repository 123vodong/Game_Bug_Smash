// MenuScene — title screen for BUG SMASH: Save the Deadline.
// The background already contains the title, stickman, bugs, code editor,
// DEADLINE sticky, DAILY MISSION panel and DEV TIP card.
// This scene ONLY adds the interactive PLAY / SETTINGS / CREDITS buttons.
import { SaveManager } from '../core/SaveManager.js';
import { TOTAL_LEVELS } from '../data/levels.js';
import { AudioManager } from '../core/AudioManager.js';
import { TIPS_DEFAULT } from '../data/tips.js';

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

    AudioManager.setMuted(SaveManager.isMuted());

    // Subtle ambient particles drifting up
    this._spawnNeonParticles();

    // Floating right-side panels
    this._drawDailyMission(W, H);
    this._drawDevTip(W, H);

    // Buttons — center stacked
    this._drawButtons(W, H);

    // Tiny corner hint (bottom-left)
    this._drawCornerInfo(W, H);

    // Keyboard
    this.input.keyboard.on('keydown-ENTER', () => this._startGame());
    this.input.keyboard.on('keydown-M', () => this._toggleMute());

    this.cameras.main.fadeIn(300, 0, 0, 0);
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

    // TEAM MODE — upcoming, dim purple, with crossed-swords icon
    const team = this._roundedNeonButton({
      x: W / 2 + 100, y: mpY + 4, w: 190, h: 46, radius: 12,
      label: 'TEAM · SOON', fontSize: 13,
      color: NEON_PURPLE, iconKind: 'swords',
    });
    team.alpha = 0.55;
    team.on('pointerup', () => {
      this.tweens.add({ targets: team, x: '+=5', duration: 50, yoyo: true, repeat: 2 });
      this._toast('Team Mode is coming soon');
    });

    // SETTINGS — smaller, neon teal (moved lower to make room for MP row)
    const subY = H * 0.90;
    const settings = this._roundedNeonButton({
      x: W / 2 - 100, y: subY, w: 180, h: 50, radius: 14,
      label: 'SETTINGS', fontSize: 16,
      color: NEON_TEAL, iconKind: 'gear',
    });
    settings.on('pointerup', () => this._toast('Settings panel coming soon'));

    // CREDITS — smaller, neon teal (matches SETTINGS in target)
    const credits = this._roundedNeonButton({
      x: W / 2 + 100, y: subY, w: 180, h: 50, radius: 14,
      label: 'CREDITS', fontSize: 16,
      color: NEON_TEAL, iconKind: 'user',
    });
    credits.on('pointerup', () => this._toast('Built with Phaser 3 + WebAudio · 2026'));

    // Small unobtrusive "prototype" link in the bottom-left corner.
    const proto = this.add.text(16, H - 10, '▶ try platformer prototype', {
      fontFamily: 'Consolas, monospace', fontSize: 12, color: '#7ec8ff',
    }).setOrigin(0, 0.5).setDepth(11).setInteractive({ useHandCursor: true });
    proto.on('pointerover', () => proto.setColor('#ffffff'));
    proto.on('pointerout',  () => proto.setColor('#7ec8ff'));
    proto.on('pointerup',   () => this.scene.start('PlatformerScene'));

    // ---------- Multiplayer entry cluster (bottom-right) ----------
    // Display-name line ("name: <click to edit>") sits above the green link.
    const savedName = SaveManager.getPlayerName() || '';
    this._nameDisplay = this.add.text(W - 16, H - 30, this._nameLabelText(savedName), {
      fontFamily: 'Consolas, monospace', fontSize: 11, color: '#aab0c0',
    }).setOrigin(1, 0.5).setDepth(11).setInteractive({ useHandCursor: true });
    this._nameDisplay.on('pointerover', () => this._nameDisplay.setColor('#ffffff'));
    this._nameDisplay.on('pointerout',  () => this._nameDisplay.setColor('#aab0c0'));
    this._nameDisplay.on('pointerup',   () => this._promptForName());

  }

  _nameLabelText(name) {
    return name ? `name: ${name} (edit)` : 'name: (click to set)';
  }

  _promptForName() {
    // Simple prompt — Phaser doesn't have built-in text input; using window.prompt
    // is the lowest-effort cross-platform solution and good enough for v0.
    const current = SaveManager.getPlayerName() || '';
    const next = window.prompt('Enter your display name (max 16 chars):', current);
    if (next == null) return; // user cancelled
    const clean = SaveManager.setPlayerName(next);
    this._nameDisplay.setText(this._nameLabelText(clean));
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
    const panelW = 230, panelH = 165;
    const x = W - panelW / 2 - 28;
    const y = H * 0.42;
    const c = this.add.container(x, y).setDepth(8);

    // Shadow
    c.add(this.add.rectangle(4, 6, panelW, panelH, 0x000000, 0.55));
    // Outer cyan glow halo
    const halo = this.add.rectangle(0, 0, panelW + 16, panelH + 16, NEON_CYAN, 0.20);
    c.add(halo);
    // Dark navy panel
    c.add(this.add.rectangle(0, 0, panelW, panelH, 0x05101e, 0.92).setStrokeStyle(2, NEON_CYAN));
    // Inner faint border
    c.add(this.add.rectangle(0, 0, panelW - 8, panelH - 8, 0, 0).setStrokeStyle(1, NEON_CYAN, 0.4));
    // Top hologram bar
    c.add(this.add.rectangle(0, -panelH / 2 + 14, panelW - 16, 18, NEON_CYAN, 0.18));

    // Title
    const title = this.add.text(0, -panelH / 2 + 14, 'DAILY MISSION', {
      fontFamily: 'Arial Black, Impact, sans-serif', fontSize: 14, color: '#ffd23f',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    title.setShadow(0, 0, '#ffd23f', 6, true, true);
    c.add(title);

    // Checklist
    const items = [
      'Smash 100 bugs',
      'No bug escapes',
      'Commit & Push the fix',
    ];
    const startY = -panelH / 2 + 44;
    items.forEach((it, i) => {
      const yy = startY + i * 28;
      const bullet = this.add.text(-panelW / 2 + 12, yy, '> ', {
        fontFamily: 'Consolas, monospace', fontSize: 12, color: '#00cfff',
      }).setOrigin(0, 0.5);
      const check = this.add.text(-panelW / 2 + 26, yy, '✓', {
        fontFamily: 'Arial Black, sans-serif', fontSize: 16, color: '#7ed957',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0, 0.5);
      check.setShadow(0, 0, '#39ff14', 6, true, true);
      const text = this.add.text(-panelW / 2 + 46, yy, it, {
        fontFamily: 'Consolas, monospace', fontSize: 12, color: '#ffffff',
      }).setOrigin(0, 0.5);
      c.add([bullet, check, text]);
    });

    // Mini progress bar
    const barW = panelW - 30;
    c.add(this.add.rectangle(0, panelH / 2 - 14, barW, 4, 0x002535, 1));
    c.add(this.add.rectangle(-barW / 2, panelH / 2 - 14, barW * 0.65, 4, NEON_CYAN, 1).setOrigin(0, 0.5));
    c.add(this.add.text(panelW / 2 - 14, panelH / 2 - 16, '65%', {
      fontFamily: 'Consolas, monospace', fontSize: 10, color: '#00cfff',
    }).setOrigin(1, 1));

    this.tweens.add({
      targets: halo, alpha: { from: 0.20, to: 0.42 },
      duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
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

    this._currentTipIdx = Math.floor(Math.random() * TIPS_DEFAULT.length);
    const setTip = (i) => tipText.setText(`"${TIPS_DEFAULT[i]}"`);
    setTip(this._currentTipIdx);

    this._tipRotateEvt = this.time.addEvent({
      delay: 5000, loop: true,
      callback: () => {
        // Fade out → swap → fade in (skip ahead avoiding repeats)
        this.tweens.add({
          targets: tipText, alpha: 0, duration: 300,
          onComplete: () => {
            let next;
            do { next = Math.floor(Math.random() * TIPS_DEFAULT.length); }
            while (next === this._currentTipIdx && TIPS_DEFAULT.length > 1);
            this._currentTipIdx = next;
            setTip(next);
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
    const unlocked = SaveManager.getUnlockedIndex();
    const cleared  = Math.min(unlocked, TOTAL_LEVELS);
    const best     = SaveManager.getHighScore();
    const txt = this.add.text(28, H - 24,
      `levels ${cleared}/${TOTAL_LEVELS}   best ${best}   [M] mute  [ENTER] play`, {
      fontFamily: 'Consolas, monospace', fontSize: 11, color: '#ffffff',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0, 0.5).setDepth(46);
    txt.setAlpha(0.7);
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
    AudioManager.uiClick();
    let idx = SaveManager.getUnlockedIndex();
    if (idx >= TOTAL_LEVELS) idx = 0;
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('HuntScene', { levelIndex: idx });
    });
  }

  _hex(intColor) {
    return '#' + intColor.toString(16).padStart(6, '0');
  }
}

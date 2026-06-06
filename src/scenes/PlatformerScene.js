// PlatformerScene — vertical-slice prototype for the platformer direction
// described in .claude/context/plan/LEVEL_01_CODE_RUNNER.md.
//
// Day 1 scope: player movement (left/right + jump), gravity, camera follow on X,
// and Stable Code platforms forming Sections 1–2 of Level 01.
// Bug Consumer mechanic + energy bar land on Day 2.
//
// This scene is intentionally isolated — the existing HuntScene is untouched.

const LEVEL_WIDTH  = 3200;   // total horizontal scroll length for the prototype
const LEVEL_HEIGHT = 720;
const GROUND_Y     = 640;    // baseline floor y
const PLAYER_SPEED = 240;    // px/s lateral
const JUMP_VEL     = -560;   // initial upward velocity on jump
const COYOTE_MS    = 100;    // grace window for jumping after leaving a platform
const JUMP_BUF_MS  = 120;    // input buffer for early jump presses

// Section 1 (Clean Code, x 0–1100) + Section 2 (Bug Consumer Zone, x 1100–2400)
// + a short Section 2 outro (x 2400–3000) that ends in a wall.
// Each platform: { x, y, w, h, type }
const PLATFORMS = [
  // ---------- Section 1: Clean Code (spawn + intro) ----------
  { x: 0,    y: GROUND_Y, w: 480, h: 40, type: 'stable' },   // spawn ground
  { x: 540,  y: 560,      w: 160, h: 24, type: 'stable' },   // small step up
  { x: 760,  y: 500,      w: 180, h: 24, type: 'stable' },   // higher
  { x: 1000, y: 560,      w: 180, h: 24, type: 'stable' },   // step down
  { x: 1240, y: GROUND_Y, w: 320, h: 40, type: 'stable' },   // landing strip

  // ---------- Section 2: Bug Consumer Zone (will have consumer bugs Day 2) ----------
  { x: 1620, y: 600,      w: 160, h: 22, type: 'eatable' },  // first eaten platform
  { x: 1840, y: 540,      w: 160, h: 22, type: 'eatable' },
  { x: 2060, y: 480,      w: 160, h: 22, type: 'eatable' },
  { x: 2280, y: 540,      w: 160, h: 22, type: 'eatable' },
  { x: 2500, y: GROUND_Y, w: 360, h: 40, type: 'stable' },   // safe landing

  // ---------- End wall / prototype goal marker ----------
  { x: 2920, y: GROUND_Y, w: 280, h: 40, type: 'stable' },
];

export default class PlatformerScene extends Phaser.Scene {
  constructor() { super('PlatformerScene'); }

  preload() {
    this.load.svg('stick-idle', 'assets/characters/stickman/idle.svg', { width: 96, height: 96 });
    this.load.svg('stick-run',  'assets/characters/stickman/run.svg',  { width: 96, height: 96 });
  }

  create() {
    // Camera + world bounds
    this.physics.world.setBounds(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);
    this.cameras.main.setBounds(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);
    this.cameras.main.setBackgroundColor('#10141c');

    this._drawBackdrop();

    // ----- Platforms (static physics group) -----
    this.platforms = this.physics.add.staticGroup();
    this._platformGfx = this.add.graphics().setDepth(2);
    for (const def of PLATFORMS) {
      // Origin top-left for layout simplicity, then convert to Arcade body (center-based)
      const cx = def.x + def.w / 2;
      const cy = def.y + def.h / 2;
      const color = def.type === 'eatable' ? 0xb84a4a : 0x4a8af0;
      const stroke = def.type === 'eatable' ? 0xff7a7a : 0x9bd1ff;

      // Draw platform face + top syntax-highlight strip
      this._platformGfx.fillStyle(0x0d1320, 1).fillRect(def.x, def.y, def.w, def.h);
      this._platformGfx.fillStyle(color, 1).fillRect(def.x, def.y, def.w, 3);
      this._platformGfx.lineStyle(2, stroke, 0.85).strokeRect(def.x, def.y, def.w, def.h);
      // Pseudo code lines on platform face
      this._platformGfx.fillStyle(stroke, 0.35);
      const lineCount = Math.max(1, Math.floor(def.h / 10) - 1);
      for (let i = 0; i < lineCount; i++) {
        const ly = def.y + 8 + i * 10;
        const lw = 18 + Math.floor(Math.random() * (def.w - 40));
        this._platformGfx.fillRect(def.x + 6, ly, lw, 2);
      }

      const body = this.add.zone(cx, cy, def.w, def.h);
      this.physics.add.existing(body, true);
      this.platforms.add(body);
      body.platformType = def.type;
    }

    // ----- Player -----
    this.player = this.physics.add.sprite(120, GROUND_Y - 60, 'stick-idle')
      .setDisplaySize(64, 80)
      .setOrigin(0.5, 0.5)
      .setDepth(5);
    this.player.body.setSize(36, 70, true);
    this.player.body.setMaxVelocity(PLAYER_SPEED, 1600);
    this.player.body.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.platforms);

    // ----- Camera follow -----
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(160, 200);

    // ----- Input -----
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE,ESC');
    this.input.keyboard.on('keydown-ESC', () => this.scene.start('MenuScene'));

    this._lastGroundedAt = 0;
    this._jumpBufferAt = 0;
    this._facing = 1;

    // HUD: prototype label + section markers + exit hint
    this._buildHUD();
  }

  update(_, dtMs) {
    if (!this.player) return;
    const body = this.player.body;
    const now = this.time.now;
    const onGround = body.blocked.down || body.touching.down;
    if (onGround) this._lastGroundedAt = now;

    // ----- Horizontal input -----
    const left  = this.cursors.left.isDown  || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;
    if (left && !right) {
      body.setVelocityX(-PLAYER_SPEED);
      this._facing = -1;
    } else if (right && !left) {
      body.setVelocityX(PLAYER_SPEED);
      this._facing = 1;
    } else {
      // Snap to stop (arcade arena feel — no slide)
      body.setVelocityX(0);
    }
    this.player.setFlipX(this._facing < 0);

    // ----- Jump (with coyote + buffer) -----
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.cursors.up)
      || Phaser.Input.Keyboard.JustDown(this.keys.W)
      || Phaser.Input.Keyboard.JustDown(this.keys.SPACE);
    if (jumpPressed) this._jumpBufferAt = now;

    const canCoyoteJump = (now - this._lastGroundedAt) <= COYOTE_MS;
    const wantsJump = (now - this._jumpBufferAt) <= JUMP_BUF_MS;
    if (wantsJump && canCoyoteJump) {
      body.setVelocityY(JUMP_VEL);
      this._jumpBufferAt = 0;
      this._lastGroundedAt = 0;
    }

    // Variable jump height: cut velocity if jump released early
    const jumpHeld = this.cursors.up.isDown || this.keys.W.isDown || this.keys.SPACE.isDown;
    if (!jumpHeld && body.velocity.y < -200) {
      body.setVelocityY(body.velocity.y * 0.5);
    }

    // Animate (texture swap)
    if (!onGround) {
      this.player.setTexture('stick-run');
    } else if (Math.abs(body.velocity.x) > 1) {
      this.player.setTexture('stick-run');
    } else {
      this.player.setTexture('stick-idle');
    }

    // ----- Goal: reached the end -----
    if (!this._completed && this.player.x > LEVEL_WIDTH - 200) {
      this._completed = true;
      this._showPrototypeEnd();
    }

    // ----- Fall off the world -----
    if (this.player.y > LEVEL_HEIGHT + 80) {
      this.player.setPosition(120, GROUND_Y - 80);
      body.setVelocity(0, 0);
    }
  }

  // ---------------------------------------------------------- visuals
  _drawBackdrop() {
    // Parallax: a dim full-width "code editor" gradient and a few faint code lines.
    const bg = this.add.graphics().setDepth(-10).setScrollFactor(0);
    bg.fillStyle(0x0a0e16, 1).fillRect(0, 0, this.scale.width, this.scale.height);
    // Far layer — barely moving code lines
    const far = this.add.graphics().setDepth(-8).setScrollFactor(0.25);
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * LEVEL_WIDTH;
      const y = Math.random() * (LEVEL_HEIGHT - 200);
      const w = 30 + Math.random() * 120;
      far.fillStyle(0x1e2a3a, 0.45).fillRect(x, y, w, 2);
    }
    // Near layer — slightly brighter code blocks
    const near = this.add.graphics().setDepth(-6).setScrollFactor(0.55);
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * LEVEL_WIDTH;
      const y = 120 + Math.random() * 360;
      const w = 60 + Math.random() * 180;
      near.fillStyle(0x2a3a55, 0.35).fillRect(x, y, w, 2);
    }
  }

  _buildHUD() {
    const padX = 18, padY = 18;
    const tag = this.add.text(padX, padY, 'PROTOTYPE · Level 01 · Sections 1–2', {
      fontFamily: 'Consolas, monospace', fontSize: 14, color: '#7ec8ff',
    }).setScrollFactor(0).setDepth(50);
    this.add.text(padX, padY + 22, 'A/D or ←/→ to move · W / SPACE / ↑ to jump · ESC to menu', {
      fontFamily: 'Consolas, monospace', fontSize: 11, color: '#9aa3b2',
    }).setScrollFactor(0).setDepth(50);
    this._goalHint = this.add.text(this.scale.width - padX, padY, 'goal → run right', {
      fontFamily: 'Consolas, monospace', fontSize: 13, color: '#7ed957',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(50);
  }

  _showPrototypeEnd() {
    const { width: W, height: H } = this.scale;
    const c = this.add.container(W / 2, H / 2).setScrollFactor(0).setDepth(80);
    c.add(this.add.rectangle(0, 0, W, H, 0x000000, 0.72));
    c.add(this.add.text(0, -40, 'PROTOTYPE END', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 48, color: '#7ed957',
      stroke: '#000', strokeThickness: 7,
    }).setOrigin(0.5));
    c.add(this.add.text(0, 16, 'feel test complete · ESC for menu', {
      fontFamily: 'Consolas, monospace', fontSize: 14, color: '#ccffcc',
    }).setOrigin(0.5));
  }
}

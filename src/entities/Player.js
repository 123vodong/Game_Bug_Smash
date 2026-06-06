// Player entity: movement, dash with i-frames, stamina, smash cone.

const SPEED = 220;
const DASH_SPEED = 560;
const DASH_MS = 180;
const DASH_COOLDOWN_MS = 2000;
const SMASH_COOLDOWN_MS = 220;
const SMASH_RANGE = 90;
const SMASH_CONE_DEG = 120;
const STAMINA_MAX = 100;
const STAMINA_REGEN = 30;    // per second
const SMASH_COST = 5;
const DASH_COST = 25;

export class Player {
  constructor(scene, x, y) {
    this.scene = scene;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.facing = { x: 1, y: 0 };
    this.stamina = STAMINA_MAX;
    this.dashUntil = 0;
    this.dashReadyAt = 0;
    this.smashReadyAt = 0;
    this.iframeUntil = 0;
    this.speedMultiplier = 1;

    // Visuals — DEV character sprite (replaces previous primitive container).
    this.sprite = scene.add.sprite(x, y, 'char-dev')
      .setDisplaySize(110, 160)
      .setDepth(10);

    this.smashFx = scene.add.graphics().setDepth(11);

    this.keys = scene.input.keyboard.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,SPACE,SHIFT');
    scene.input.on('pointerdown', () => this._wantSmash = true);
  }

  isDashing(now) { return now < this.dashUntil; }
  isInvincible(now) { return now < this.iframeUntil; }

  update(dtMs, now) {
    const k = this.keys;
    let ix = (k.A.isDown || k.LEFT.isDown ? -1 : 0) + (k.D.isDown || k.RIGHT.isDown ? 1 : 0);
    let iy = (k.W.isDown || k.UP.isDown   ? -1 : 0) + (k.S.isDown || k.DOWN.isDown  ? 1 : 0);
    if (ix || iy) {
      const len = Math.hypot(ix, iy);
      ix /= len; iy /= len;
      this.facing.x = ix; this.facing.y = iy;
    }

    // Dash
    if (Phaser.Input.Keyboard.JustDown(k.SHIFT) && now >= this.dashReadyAt && this.stamina >= DASH_COST && (ix || iy)) {
      this.dashUntil = now + DASH_MS;
      this.dashReadyAt = now + DASH_COOLDOWN_MS;
      this.iframeUntil = now + DASH_MS + 80;
      this.stamina -= DASH_COST;
    }

    const speed = (this.isDashing(now) ? DASH_SPEED : SPEED) * this.speedMultiplier;
    this.vx = ix * speed; this.vy = iy * speed;
    const dx = this.vx * dtMs / 1000;
    const dy = this.vy * dtMs / 1000;

    if (this.scene.maze) {
      const resolved = this.scene.maze.moveWithCollision(this.x, this.y, dx, dy, 18);
      this.x = resolved.x; this.y = resolved.y;
    } else {
      this.x += dx; this.y += dy;
      const { width: W, height: H } = this.scene.scale;
      this.x = Phaser.Math.Clamp(this.x, 24, W - 24);
      this.y = Phaser.Math.Clamp(this.y, 24, H - 24);
    }

    this.sprite.setPosition(this.x, this.y);
    // Flip the sprite horizontally to follow movement direction.
    if (this.facing.x < -0.1) this.sprite.setFlipX(true);
    else if (this.facing.x > 0.1) this.sprite.setFlipX(false);

    // Smash
    const wantSmashKey = Phaser.Input.Keyboard.JustDown(k.SPACE);
    if ((wantSmashKey || this._wantSmash) && now >= this.smashReadyAt && this.stamina >= SMASH_COST) {
      this.smash(now);
    }
    this._wantSmash = false;

    // Stamina regen
    this.stamina = Math.min(STAMINA_MAX, this.stamina + STAMINA_REGEN * dtMs / 1000);
  }

  smash(now) {
    this.smashReadyAt = now + SMASH_COOLDOWN_MS;
    this.stamina -= SMASH_COST;
    this._drawSmashFx();
    this.scene.events.emit('player:smash', {
      x: this.x, y: this.y,
      dirX: this.facing.x, dirY: this.facing.y,
      range: SMASH_RANGE, coneDeg: SMASH_CONE_DEG,
    });
  }

  _drawSmashFx() {
    const g = this.smashFx;
    g.clear();
    const ang = Math.atan2(this.facing.y, this.facing.x);
    const half = Phaser.Math.DegToRad(SMASH_CONE_DEG / 2);
    g.fillStyle(0xffffff, 0.35);
    g.beginPath();
    g.moveTo(this.x, this.y);
    g.arc(this.x, this.y, SMASH_RANGE, ang - half, ang + half, false);
    g.closePath();
    g.fillPath();
    this.scene.tweens.add({
      targets: g, alpha: 0, duration: 160,
      onComplete: () => { g.clear(); g.setAlpha(1); },
    });
  }
}

Player.SMASH_RANGE = SMASH_RANGE;
Player.SMASH_CONE_DEG = SMASH_CONE_DEG;
Player.STAMINA_MAX = STAMINA_MAX;

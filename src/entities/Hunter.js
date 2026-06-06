// Hunter — the dev stickman player for BUG SMASH: Deadline Hunter.
// Auto-moves toward the pointer (mouse on desktop, touch on mobile) and ships with
// baked-in juice: pose swap, foot dust, run bob, squash/stretch, speed lines,
// afterimage trail (used by skills like Cursor teleport).

const MAX_SPEED      = 380;   // px/s
const ACCEL          = 1800;  // px/s^2
const STOP_RADIUS    = 8;     // px — stop accelerating within this distance of pointer
const MOVE_THRESHOLD = 30;    // velocity magnitude that counts as "running"

const POSE_KEYS = ['stick-idle', 'stick-run', 'stick-smash', 'stick-dead'];

export class Hunter {
  constructor(scene, x, y) {
    this.scene = scene;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.target = { x, y };
    this.poseKey = 'stick-idle';
    this.facingLeft = false;
    this.alive = true;
    this.speedMultiplier = 1;

    this.sprite = scene.add.sprite(x, y, this.poseKey)
      .setDisplaySize(72, 80)
      .setDepth(10);

    // Lock in the baseline scale so squash/stretch tweens always return to a
    // known good value. Without this, overlapping tweens read mid-tween scale
    // as their "to" and the sprite drifts smaller/wider over time.
    this.baseScaleX = this.sprite.scaleX;
    this.baseScaleY = this.sprite.scaleY;
    this._activeScaleTween = null;

    // Effect timers
    this.lastDustAt = 0;
    this.lastSpeedLineAt = 0;
    this.lastAfterimageAt = 0;
    this._afterimagesUntil = 0;     // afterimage burst is finite (e.g. on teleport)
    this.bobPhase = 0;

    // Squash/stretch on direction change
    this._lastDirX = 0;
    this._smashUntil = 0;
  }

  _squashStretch(sxMul, syMul, durationMs) {
    if (this._activeScaleTween) this._activeScaleTween.stop();
    // Reset to baseline before starting a new tween — kills any drift.
    this.sprite.setScale(this.baseScaleX, this.baseScaleY);
    this._activeScaleTween = this.scene.tweens.add({
      targets: this.sprite,
      scaleX: { from: this.baseScaleX * sxMul, to: this.baseScaleX },
      scaleY: { from: this.baseScaleY * syMul, to: this.baseScaleY },
      duration: durationMs,
      ease: 'Sine.easeOut',
      onComplete: () => {
        // Final safety: snap back to base in case the tween rounded off.
        this.sprite.setScale(this.baseScaleX, this.baseScaleY);
        this._activeScaleTween = null;
      },
    });
  }

  setTarget(x, y) {
    this.target.x = x;
    this.target.y = y;
  }

  /** Force-set position (used by Cursor teleport skill). */
  teleportTo(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this._afterimagesUntil = this.scene.time.now + 300;
    this._spawnAfterimage(true);
  }

  /** Trigger smash pose for ~150ms then revert to run/idle. */
  triggerSmash() {
    if (!this.alive) return;
    this._smashUntil = this.scene.time.now + 150;
    this._setPose('stick-smash');
    this._squashStretch(1.15, 0.85, 150);
  }

  die() {
    this.alive = false;
    this._setPose('stick-dead');
  }

  update(dtMs, now) {
    if (!this.alive) return;
    const dt = dtMs / 1000;

    // ---- Acceleration toward target ----
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > STOP_RADIUS) {
      const ux = dx / dist, uy = dy / dist;
      this.vx += ux * ACCEL * dt;
      this.vy += uy * ACCEL * dt;
    } else {
      this.vx *= 0.82;
      this.vy *= 0.82;
    }

    // Cap speed
    const speed = Math.hypot(this.vx, this.vy);
    const maxV = MAX_SPEED * this.speedMultiplier;
    if (speed > maxV) {
      const k = maxV / speed;
      this.vx *= k; this.vy *= k;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Bound to scene
    const { width: W, height: H } = this.scene.scale;
    if (this.x < 30) { this.x = 30; this.vx = 0; }
    if (this.x > W - 30) { this.x = W - 30; this.vx = 0; }
    if (this.y < 40) { this.y = 40; this.vy = 0; }
    if (this.y > H - 40) { this.y = H - 40; this.vy = 0; }

    // ---- Facing (with squash on direction flip) ----
    const dirX = Math.sign(this.vx);
    if (dirX !== 0 && dirX !== this._lastDirX) {
      this._lastDirX = dirX;
      this.facingLeft = (dirX < 0);
      this.sprite.setFlipX(this.facingLeft);
      this._squashStretch(0.85, 1.1, 120);
    }

    // ---- Pose state ----
    if (now > this._smashUntil) {
      const targetPose = speed > MOVE_THRESHOLD ? 'stick-run' : 'stick-idle';
      if (this.poseKey !== targetPose) this._setPose(targetPose);
    }

    // ---- Run bob ----
    let bob = 0;
    if (speed > MOVE_THRESHOLD) {
      this.bobPhase += dt * 14;
      bob = Math.sin(this.bobPhase) * 2;
    } else {
      this.bobPhase = 0;
    }
    this.sprite.setPosition(this.x, this.y + bob);

    // ---- Foot dust puffs ----
    if (speed > MOVE_THRESHOLD && now - this.lastDustAt > 120) {
      this.lastDustAt = now;
      this._spawnDust();
    }

    // ---- Speed lines (high speed only) ----
    if (speed > MAX_SPEED * 0.6 && now - this.lastSpeedLineAt > 90) {
      this.lastSpeedLineAt = now;
      this._spawnSpeedLine();
    }

    // ---- Afterimage trail (skill-triggered) ----
    if (now < this._afterimagesUntil && now - this.lastAfterimageAt > 50) {
      this.lastAfterimageAt = now;
      this._spawnAfterimage(false);
    }
  }

  // ---- Effect emitters ----
  _setPose(key) {
    if (!POSE_KEYS.includes(key)) return;
    this.poseKey = key;
    this.sprite.setTexture(key);
  }

  _spawnDust() {
    const xJitter = (Math.random() - 0.5) * 18;
    const d = this.scene.add.circle(this.x + xJitter, this.y + 32, 4, 0x999999, 0.55).setDepth(9);
    this.scene.tweens.add({
      targets: d,
      y: d.y - 10,
      alpha: 0,
      scale: 1.6,
      duration: 380,
      ease: 'Sine.easeOut',
      onComplete: () => d.destroy(),
    });
  }

  _spawnSpeedLine() {
    const speed = Math.hypot(this.vx, this.vy) || 1;
    const dirX = -this.vx / speed;
    const dirY = -this.vy / speed;
    const offX = (Math.random() - 0.5) * 36;
    const offY = (Math.random() - 0.5) * 30;
    const sX = this.x + dirX * 30 + offX;
    const sY = this.y + dirY * 30 + offY;
    const eX = sX + dirX * 18;
    const eY = sY + dirY * 18;
    const line = this.scene.add.line(0, 0, sX, sY, eX, eY, 0xcccccc, 0.55).setOrigin(0).setLineWidth(2).setDepth(8);
    this.scene.tweens.add({
      targets: line,
      alpha: 0,
      duration: 260,
      onComplete: () => line.destroy(),
    });
  }

  _spawnAfterimage(strong = false) {
    const ghost = this.scene.add.sprite(this.x, this.y, this.poseKey)
      .setDisplaySize(this.sprite.displayWidth, this.sprite.displayHeight)
      .setFlipX(this.facingLeft)
      .setAlpha(strong ? 0.6 : 0.35)
      .setTint(0x8aa9ff)
      .setDepth(9);
    this.scene.tweens.add({
      targets: ghost,
      alpha: 0,
      duration: strong ? 350 : 220,
      onComplete: () => ghost.destroy(),
    });
  }
}

Hunter.MAX_SPEED = MAX_SPEED;

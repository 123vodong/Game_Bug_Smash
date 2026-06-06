// Hyper-casual Bug entity: flees the player, panics when close, dies after enough smashes.
// When its on-screen lifetime expires, the bug *hides* (instead of being lost forever)
// and respawns after a delay that SHRINKS as the deadline approaches. So bugs cycle:
//   visible -> (lifetime expires) -> hidden -> (respawn timer) -> visible again
// until the player actually kills it (HP=0).
//
// The scene exposes `scene.deadlineProgress` in [0, 1] so each bug's hidden duration
// can lerp from BASE_HIDDEN_MS (calm) down to MIN_HIDDEN_MS (frantic).
import { BUGS } from '../data/bugs.js';

const FLEE_RADIUS       = 260;
const PANIC_RADIUS      = 110;
const WANDER_MS         = 1500;
const SMASH_COOLDOWN_MS = 200;
const BASE_HIDDEN_MS    = 3500;   // hidden time when deadlineProgress = 0
const MIN_HIDDEN_MS     = 1100;   // hidden time when deadlineProgress = 1
const RESPAWN_FADE_MS   = 220;

const SPRITE_DISPLAY = 48;        // px on screen

export class Bug {
  constructor(scene, id, x, y) {
    const def = BUGS[id];
    if (!def) throw new Error('Unknown bug id: ' + id);
    this.scene = scene;
    this.id = id;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.baseSpeed = def.speed;
    this.lifetimeMs = def.lifetimeMs;
    this.score = def.score;
    this.radius = def.radius;
    this.panicFactor = def.panic;

    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.alive = true;       // false only after actual smash-kill (HP reaches 0)
    this.visible = true;     // false while hiding between cycles
    this.spawnedAt = scene.time.now;
    this.diesAt = this.spawnedAt + this.lifetimeMs;
    this.nextWanderAt = this.spawnedAt + 600;
    this.burstUntil = 0;
    this.lastSmashAt = 0;
    this._respawnTimer = null;

    this.sprite = scene.add.sprite(x, y, id)
      .setDisplaySize(SPRITE_DISPLAY, SPRITE_DISPLAY)
      .setDepth(5);
    this._baseScaleX = this.sprite.scaleX;
    this._baseScaleY = this.sprite.scaleY;
  }

  update(dtMs, now, playerPos) {
    if (!this.alive || !this.visible) return;
    const dt = dtMs / 1000;

    // Lifetime check — bug hides (and will respawn later)
    if (now > this.diesAt) {
      this.hide();
      return;
    }

    const dx = this.x - playerPos.x;
    const dy = this.y - playerPos.y;
    const distToPlayer = Math.hypot(dx, dy);

    let speed = this.baseSpeed;
    if (now < this.burstUntil) speed *= 1.6;

    if (distToPlayer < FLEE_RADIUS) {
      const fleeStrength = 1 - (distToPlayer / FLEE_RADIUS);
      const speedMul = 1 + fleeStrength * 0.6;
      const len = Math.max(distToPlayer, 1);
      const ux = dx / len, uy = dy / len;
      this.vx = this.vx * 0.78 + ux * speed * speedMul * 0.22;
      this.vy = this.vy * 0.78 + uy * speed * speedMul * 0.22;

      if (distToPlayer < PANIC_RADIUS) {
        const panicChance = this.panicFactor * dt;
        if (Math.random() < panicChance) {
          const a = Math.random() * Math.PI * 2;
          this.vx = Math.cos(a) * speed * 1.5;
          this.vy = Math.sin(a) * speed * 1.5;
        }
        if (now > this.burstUntil && Math.random() < panicChance * 0.6) {
          this.burstUntil = now + 400;
        }
      }
    } else {
      if (now > this.nextWanderAt) {
        const a = Math.random() * Math.PI * 2;
        this.vx = Math.cos(a) * speed * 0.55;
        this.vy = Math.sin(a) * speed * 0.55;
        this.nextWanderAt = now + WANDER_MS;
      }
    }

    const vmag = Math.hypot(this.vx, this.vy);
    const vmax = speed * 1.9;
    if (vmag > vmax) {
      const k = vmax / vmag;
      this.vx *= k; this.vy *= k;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const { width: W, height: H } = this.scene.scale;
    if (this.x < 22) { this.x = 22; this.vx = Math.abs(this.vx); }
    if (this.x > W - 22) { this.x = W - 22; this.vx = -Math.abs(this.vx); }
    if (this.y < 70) { this.y = 70; this.vy = Math.abs(this.vy); }
    if (this.y > H - 30) { this.y = H - 30; this.vy = -Math.abs(this.vy); }

    this.sprite.setPosition(this.x, this.y);

    // Pulse + fade when about to hide
    const remainPct = (this.diesAt - now) / this.lifetimeMs;
    if (remainPct < 0.3) {
      this.sprite.setAlpha(0.55 + Math.sin(now / 90) * 0.35);
    } else {
      this.sprite.setAlpha(1);
    }

    if (vmag > 30) {
      this.sprite.setRotation(Math.atan2(this.vy, this.vx) * 0.1);
    }
  }

  trySmash(now, damage = 1) {
    if (!this.alive || !this.visible) return { hit: false, killed: false };
    if (now - this.lastSmashAt < SMASH_COOLDOWN_MS) return { hit: false, killed: false };
    this.lastSmashAt = now;
    this.hp -= damage;

    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(60, () => {
      if (this.sprite && this.sprite.scene) this.sprite.clearTint();
    });

    if (this.hp <= 0) {
      this.die();
      return { hit: true, killed: true };
    }
    return { hit: true, killed: false };
  }

  /** Actual smash-kill — bug is permanently removed. */
  die() {
    if (!this.alive) return;
    this.alive = false;
    this.visible = false;
    if (this._respawnTimer) { this._respawnTimer.remove(); this._respawnTimer = null; }
    this.sprite.setTexture('bug-dead');
    this.sprite.clearTint();
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: { from: this._baseScaleX * 1.4, to: 0 },
      scaleY: { from: this._baseScaleY * 1.4, to: 0 },
      angle: 270,
      duration: 320,
      ease: 'Back.easeIn',
      onComplete: () => this.sprite && this.sprite.destroy(),
    });
  }

  /** Bug ducks out of sight; will re-enter after a delay tied to deadline progress. */
  hide() {
    if (!this.alive || !this.visible) return;
    this.visible = false;

    // Visual: shrink + fade out (don't destroy the sprite)
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      scaleX: this._baseScaleX * 0.4,
      scaleY: this._baseScaleY * 0.4,
      duration: 200,
      onComplete: () => this.sprite && this.sprite.setVisible(false),
    });

    // Compute hidden duration from current deadline pressure.
    // As deadlineProgress goes 0 → 1, hidden time goes BASE_HIDDEN_MS → MIN_HIDDEN_MS.
    const dl = Math.max(0, Math.min(1, this.scene.deadlineProgress ?? 0));
    const hiddenMs = BASE_HIDDEN_MS - (BASE_HIDDEN_MS - MIN_HIDDEN_MS) * dl;

    this._respawnTimer = this.scene.time.delayedCall(hiddenMs, () => this._respawn());
  }

  _respawn() {
    if (!this.alive) return;
    const { width: W, height: H } = this.scene.scale;
    // Pick a fresh edge position
    const edge = Math.floor(Math.random() * 4);
    if (edge === 0)      { this.x = Math.random() * (W - 100) + 50; this.y = 70; }
    else if (edge === 1) { this.x = W - 30; this.y = Math.random() * (H - 110) + 80; }
    else if (edge === 2) { this.x = Math.random() * (W - 100) + 50; this.y = H - 40; }
    else                 { this.x = 30;     this.y = Math.random() * (H - 110) + 80; }

    this.vx = 0; this.vy = 0;
    this.diesAt = this.scene.time.now + this.lifetimeMs;
    this.nextWanderAt = this.scene.time.now + 600;
    this.lastSmashAt = 0;

    this.sprite.setPosition(this.x, this.y);
    this.sprite.setVisible(true);
    this.sprite.setAlpha(0);
    this.sprite.setScale(0);
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 1,
      scaleX: this._baseScaleX,
      scaleY: this._baseScaleY,
      duration: RESPAWN_FADE_MS,
      ease: 'Back.easeOut',
    });

    this.visible = true;
  }

  distanceTo(x, y) {
    return Math.hypot(this.x - x, this.y - y);
  }
}

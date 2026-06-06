// Generic data-driven Bug entity. Behavior dispatched from BUGS catalog.
import { BUGS } from '../data/bugs.js';

const SMASH_DAMAGE = 30;       // hp cost per smash hit (base)
const SPEED_PX_PER_FACTOR = 90; // multiplier from JSON speed (0.4..2.0) -> px/s
const DISPLAY_SIZE = 56;

export class Bug {
  constructor(scene, id, x, y) {
    const def = BUGS[id];
    if (!def) throw new Error(`Unknown bug id: ${id}`);
    this.scene = scene;
    this.id = id;
    this.def = def;
    this.x = x; this.y = y;
    this.hp = def.stats.hp;
    this.maxHp = def.stats.hp;
    this.speed = def.stats.speed * SPEED_PX_PER_FACTOR;
    this.radius = 22;                            // gameplay hit radius
    this.score = Math.max(10, Math.round(def.stats.hp * 0.5)); // 15..125
    this.alive = true;
    this.vx = 0; this.vy = 0;
    this.dirChangeAt = 0;
    this.nextSpawnAt = 0;
    this.nextBurstAt = 0;
    this.burstUntil = 0;
    this.hpGrowthAt = 0;
    this.firstHitConsumed = false;
    this.observed = false;
    this.areaCenter = { x, y };
    this.areaAngle = Math.random() * Math.PI * 2;

    this.sprite = scene.add.sprite(x, y, def.sprite)
      .setDisplaySize(DISPLAY_SIZE, DISPLAY_SIZE)
      .setDepth(5);
    if (def.tint) this.sprite.setTint(def.tint);

    // Idle wiggle so bugs feel alive
    this.wiggleTween = scene.tweens.add({
      targets: this.sprite,
      angle: { from: -6, to: 6 },
      duration: 500 + Math.random() * 300,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Dead bug starts visually "fixed" (faded, no wiggle)
    if (def.behavior.movement === 'idle') {
      this.sprite.setAlpha(0.6);
      this.wiggleTween.remove(); this.wiggleTween = null;
      this._scheduleRevive();
    }

    this.highlight = null;
  }

  setHighlighted(on) {
    if (on && !this.highlight) {
      this.highlight = this.scene.add.circle(this.x, this.y, this.radius + 6, 0x4ac1a2, 0)
        .setStrokeStyle(2, 0x4ac1a2).setDepth(4);
    } else if (!on && this.highlight) {
      this.highlight.destroy(); this.highlight = null;
    }
  }

  /** Update positions/sprites. */
  applyVel(dtMs) {
    const dt = dtMs / 1000;
    const dx = this.vx * dt, dy = this.vy * dt;
    if (this.scene.maze) {
      const before = { x: this.x, y: this.y };
      const resolved = this.scene.maze.moveWithCollision(this.x, this.y, dx, dy, 14);
      // If a wall stopped us on an axis, flip that velocity component to bounce.
      if (Math.abs(resolved.x - before.x - dx) > 0.01) this.vx *= -1;
      if (Math.abs(resolved.y - before.y - dy) > 0.01) this.vy *= -1;
      this.x = resolved.x; this.y = resolved.y;
    } else {
      this.x += dx; this.y += dy;
      const { width: W, height: H } = this.scene.scale;
      if (this.x < 20 || this.x > W - 20) this.vx *= -1;
      if (this.y < 20 || this.y > H - 20) this.vy *= -1;
      this.x = Phaser.Math.Clamp(this.x, 20, W - 20);
      this.y = Phaser.Math.Clamp(this.y, 20, H - 20);
    }
    this.sprite.setPosition(this.x, this.y);
    if (this.highlight) this.highlight.setPosition(this.x, this.y);
  }

  /**
   * Smash damage. `mult` from combo/skills.
   * `oneShot` overrides hp entirely. Returns true if killed.
   */
  hit(mult = 1, oneShot = false) {
    // oneShot (Haiku finisher, Opus auto-smash) bypasses immunity.
    if (oneShot) { this._die(); return true; }
    if (this.def.behavior.first_hit_immunity && !this.firstHitConsumed) {
      this.firstHitConsumed = true;
      this._flashImmune();
      return false;
    }
    const dmg = SMASH_DAMAGE * mult;
    this.hp -= dmg;
    this._flashHit();
    if (this.hp <= 0) { this._die(); return true; }
    return false;
  }

  _flashHit() {
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(60, () => {
      if (!this.sprite || !this.sprite.scene) return;
      this.def.tint ? this.sprite.setTint(this.def.tint) : this.sprite.clearTint();
    });
  }

  _flashImmune() {
    // Brief golden flash to telegraph "first hit free"
    this.sprite.setTintFill(0xffd700);
    this.scene.time.delayedCall(120, () => {
      if (!this.sprite || !this.sprite.scene) return;
      this.def.tint ? this.sprite.setTint(this.def.tint) : this.sprite.clearTint();
    });
    const bubble = this.scene.add.text(this.x, this.y - 30, 'NO REFACTOR!', {
      fontFamily: 'Arial Black', fontSize: 12, color: '#ffd700',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(20);
    this.scene.tweens.add({
      targets: bubble, y: this.y - 60, alpha: 0, duration: 700,
      onComplete: () => bubble.destroy(),
    });
  }

  _die() {
    this.alive = false;
    // Death burst
    const burst = this.scene.add.circle(this.x, this.y, this.radius, 0xffffff, 0.6);
    this.scene.tweens.add({
      targets: burst, scale: 2.5, alpha: 0, duration: 240,
      onComplete: () => burst.destroy(),
    });
    // Dialog bubble (random line)
    this._sayDialog();
    // AoE on death (critical_bug)
    if (this.def.behavior.aoe_on_death) this._aoeBlast();
    this.destroy();
  }

  _sayDialog() {
    const lines = this.def.dialog;
    if (!lines || !lines.length) return;
    const text = Phaser.Utils.Array.GetRandom(lines);
    const t = this.scene.add.text(this.x, this.y - 24, text, {
      fontFamily: 'Comic Sans MS, sans-serif', fontSize: 13, color: '#fff',
      stroke: '#000', strokeThickness: 3,
      backgroundColor: 'rgba(0,0,0,0.55)', padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(20);
    this.scene.tweens.add({
      targets: t, y: this.y - 70, alpha: 0, duration: 1200,
      onComplete: () => t.destroy(),
    });
  }

  _aoeBlast() {
    const ring = this.scene.add.circle(this.x, this.y, 12, 0x00ff77, 0.3).setDepth(7);
    this.scene.tweens.add({
      targets: ring, radius: 120, scale: 12, alpha: 0, duration: 500,
      onComplete: () => ring.destroy(),
    });
    // Signal the scene; LevelScene/BossScene can check player distance
    this.scene.events.emit('bug:aoe', { x: this.x, y: this.y, radius: 120 });
  }

  destroy() {
    if (this.wiggleTween) { this.wiggleTween.remove(); this.wiggleTween = null; }
    this.sprite && this.sprite.destroy();
    if (this.highlight) this.highlight.destroy();
  }

  // -------- Behavior dispatch --------
  update(dtMs, now, ctx) {
    const mv = this.def.behavior.movement;
    switch (mv) {
      case 'slow_wander':       this._mvWander(dtMs, now, 1000, 1500); break;
      case 'direction_switch':  this._mvWander(dtMs, now, 400, 800); break;
      case 'group_swarm':       this._mvSwarm(dtMs, now, ctx); break;
      case 'slow_push':         this._mvChase(dtMs, now, ctx, 0.7); break;
      case 'burst_speed':       this._mvBurst(dtMs, now, ctx); break;
      case 'teleport_on_observe': this._mvHeisen(dtMs, now, ctx); break;
      case 'area_control':      this._mvArea(dtMs, now); break;
      case 'idle':              /* static */ break;
      default:                  this._mvWander(dtMs, now, 1000, 1500);
    }
    // Specials
    if (this.def.behavior.special === 'hp_increase_over_time') {
      if (!this.hpGrowthAt) this.hpGrowthAt = now + 5000;
      if (now > this.hpGrowthAt) {
        this.hp = Math.min(this.maxHp * 2, this.hp + 8);
        this.hpGrowthAt = now + 5000;
      }
    }
    if (this.def.behavior.spawn_extra) {
      if (!this.nextSpawnAt) this.nextSpawnAt = now + 6000;
      if (now > this.nextSpawnAt && ctx && ctx.bugCount() < ctx.bugCap) {
        ctx.spawnBug(this.id, this.x + Phaser.Math.Between(-30, 30), this.y + Phaser.Math.Between(-30, 30));
        this.nextSpawnAt = now + 6000;
      }
    }
    this.applyVel(dtMs);
  }

  _mvWander(dtMs, now, minMs, maxMs) {
    if (now > this.dirChangeAt) {
      const a = Math.random() * Math.PI * 2;
      this.vx = Math.cos(a) * this.speed;
      this.vy = Math.sin(a) * this.speed;
      this.dirChangeAt = now + Phaser.Math.Between(minMs, maxMs);
    }
  }

  _mvChase(_dtMs, _now, ctx, scale = 1) {
    if (!ctx?.player) return;
    const dx = ctx.player.x - this.x, dy = ctx.player.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    this.vx = dx / d * this.speed * scale;
    this.vy = dy / d * this.speed * scale;
  }

  _mvSwarm(dtMs, now, ctx) {
    // Move toward player with mild noise; nudge toward nearby same-type bugs (cohesion).
    if (!ctx?.player) return;
    let dx = ctx.player.x - this.x, dy = ctx.player.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    // Cohesion
    let cx = 0, cy = 0, n = 0;
    for (const b of (ctx.getBugs?.() ?? [])) {
      if (b === this || !b.alive || b.id !== this.id) continue;
      const ddx = b.x - this.x, ddy = b.y - this.y;
      const dd = Math.hypot(ddx, ddy);
      if (dd > 0 && dd < 120) { cx += ddx / dd; cy += ddy / dd; n++; }
    }
    if (n) { cx /= n; cy /= n; dx = dx * 0.7 + cx * 0.3; dy = dy * 0.7 + cy * 0.3; }
    // Random jitter
    const jx = Math.cos(now / 200 + this.x) * 0.15;
    const jy = Math.sin(now / 200 + this.y) * 0.15;
    this.vx = (dx + jx) * this.speed;
    this.vy = (dy + jy) * this.speed;
  }

  _mvBurst(dtMs, now, ctx) {
    if (!this.nextBurstAt) this.nextBurstAt = now + Phaser.Math.Between(1500, 2500);
    if (now > this.nextBurstAt && now > this.burstUntil) {
      this.burstUntil = now + 350;
      this.nextBurstAt = now + Phaser.Math.Between(2000, 3500);
      // Aim at player on burst start
      if (ctx?.player) {
        const dx = ctx.player.x - this.x, dy = ctx.player.y - this.y;
        const d = Math.hypot(dx, dy) || 1;
        this.vx = dx / d * this.speed * 3;
        this.vy = dy / d * this.speed * 3;
      }
      // Trail flash
      const flash = this.scene.add.circle(this.x, this.y, 18, 0xff5252, 0.4).setDepth(4);
      this.scene.tweens.add({ targets: flash, alpha: 0, scale: 2, duration: 300, onComplete: () => flash.destroy() });
    }
    if (now > this.burstUntil) {
      // Idle wander between bursts
      this._mvWander(dtMs, now, 600, 1000);
    }
  }

  _mvHeisen(dtMs, now, ctx) {
    if (!ctx?.player) return;
    // "Observed" = player is facing roughly toward this bug. Teleport away.
    const dx = this.x - ctx.player.x, dy = this.y - ctx.player.y;
    const distSq = dx * dx + dy * dy;
    const dot = (dx * ctx.player.facing.x + dy * ctx.player.facing.y) / (Math.sqrt(distSq) || 1);
    const looking = dot > 0.6 && distSq < 240 * 240;
    if (looking && !this.observed) {
      this.observed = true;
      // Fade out, teleport, fade back
      this.scene.tweens.add({
        targets: this.sprite, alpha: 0, duration: 120,
        onComplete: () => {
          const { width: W, height: H } = this.scene.scale;
          this.x = Phaser.Math.Between(60, W - 60);
          this.y = Phaser.Math.Between(60, H - 60);
          this.sprite.setPosition(this.x, this.y);
          this.scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 200, onComplete: () => { this.observed = false; } });
        },
      });
    }
    // Between teleports, wander
    this._mvWander(dtMs, now, 500, 900);
  }

  _mvArea(dtMs, now) {
    // Orbit around an anchor point that drifts slowly.
    const dt = dtMs / 1000;
    this.areaAngle += dt * 1.2;
    const r = 80;
    const tx = this.areaCenter.x + Math.cos(this.areaAngle) * r;
    const ty = this.areaCenter.y + Math.sin(this.areaAngle) * r;
    this.vx = (tx - this.x) * 3;
    this.vy = (ty - this.y) * 3;
    // Slowly drift the anchor toward center
    const { width: W, height: H } = this.scene.scale;
    this.areaCenter.x += ((W / 2 - this.areaCenter.x) * 0.0005);
    this.areaCenter.y += ((H / 2 - this.areaCenter.y) * 0.0005);
  }

  _scheduleRevive() {
    const { revive_chance, revive_delay, revives_as } = this.def.behavior;
    if (!revive_chance) return;
    this.scene.time.delayedCall(revive_delay ?? 5000, () => {
      if (!this.alive) return; // already smashed
      if (Math.random() > revive_chance) return;
      // Transform into the revived type
      const newId = revives_as || 'classic_bug';
      this.scene.events.emit('bug:revive', { x: this.x, y: this.y, id: newId, replace: this });
    });
  }
}

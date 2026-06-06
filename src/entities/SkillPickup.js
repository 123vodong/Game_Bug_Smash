// SkillPickup — a floating collectible skill icon. On overlap with the player,
// the SkillManager applies the skill's effect and the pickup is consumed.
import { SKILLS } from '../data/skills.js';

const DEFAULT_LIFETIME_MS = 12000;
const DISPLAY_SIZE = 38;

export class SkillPickup {
  constructor(scene, id, x, y) {
    const def = SKILLS[id];
    if (!def) throw new Error('Unknown skill id: ' + id);
    this.scene = scene;
    this.id = id;
    this.def = def;
    this.x = x; this.y = y;
    this.radius = 20;
    this.alive = true;
    this.spawnedAt = scene.time.now;
    this.diesAt = this.spawnedAt + DEFAULT_LIFETIME_MS;

    // Pulsing glow ring (color matches the skill category)
    this.glow = scene.add.circle(x, y, 26, def.color, 0.25).setDepth(6);
    this.scene.tweens.add({
      targets: this.glow,
      scale: { from: 0.9, to: 1.25 },
      alpha: { from: 0.45, to: 0.15 },
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this.sprite = scene.add.sprite(x, y, `skill-${id}`)
      .setDisplaySize(DISPLAY_SIZE, DISPLAY_SIZE)
      .setDepth(7);
    // Tiny bob
    this.scene.tweens.add({
      targets: this.sprite,
      y: y - 6,
      duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  update(now) {
    if (!this.alive) return;
    // Despawn if not picked up
    if (now > this.diesAt) {
      this.destroy(true);
    }
    // Last second: blink to telegraph imminent despawn
    const remain = this.diesAt - now;
    if (remain < 1500) {
      this.sprite.setAlpha(0.4 + Math.sin(now / 90) * 0.4);
    }
  }

  distanceTo(x, y) {
    return Math.hypot(this.x - x, this.y - y);
  }

  destroy(fadeOut = false) {
    if (!this.alive) return;
    this.alive = false;
    if (fadeOut) {
      this.scene.tweens.add({
        targets: [this.sprite, this.glow],
        alpha: 0, scale: 0.6, duration: 200,
        onComplete: () => { this.sprite?.destroy(); this.glow?.destroy(); },
      });
    } else {
      this.sprite?.destroy(); this.glow?.destroy();
    }
  }
}

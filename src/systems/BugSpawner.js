// BugSpawner — manages active bugs for the hunter scene.
// Bugs are persistent; they cycle visible/hidden until smash-killed.
import { Bug } from '../entities/Bug.js';

export class BugSpawner {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} mods  optional { bugHpMul, bugSpeedMul } — applied at spawn time
   */
  constructor(scene, mods = {}) {
    this.scene = scene;
    this.bugs = [];
    this.totalSpawned = 0;
    this.totalKilled = 0;
    this.mods = {
      bugHpMul:    mods.bugHpMul    ?? 1,
      bugSpeedMul: mods.bugSpeedMul ?? 1,
    };
  }

  spawn(id, x, y) {
    const bug = new Bug(this.scene, id, x, y);
    // Apply level difficulty modifiers
    if (this.mods.bugHpMul !== 1) {
      bug.maxHp = Math.max(1, Math.ceil(bug.maxHp * this.mods.bugHpMul));
      bug.hp = bug.maxHp;
    }
    if (this.mods.bugSpeedMul !== 1) {
      bug.baseSpeed *= this.mods.bugSpeedMul;
    }
    this.bugs.push(bug);
    this.totalSpawned += 1;
    return bug;
  }

  /** Spawn a mixed wave at random screen-edge positions. */
  spawnWave(config) {
    const { width: W, height: H } = this.scene.scale;
    for (const [id, count] of Object.entries(config)) {
      for (let i = 0; i < count; i++) {
        const edge = Math.floor(Math.random() * 4);
        let x, y;
        if (edge === 0)      { x = Math.random() * (W - 100) + 50; y = 70; }
        else if (edge === 1) { x = W - 30; y = Math.random() * (H - 110) + 80; }
        else if (edge === 2) { x = Math.random() * (W - 100) + 50; y = H - 40; }
        else                 { x = 30;     y = Math.random() * (H - 110) + 80; }
        this.spawn(id, x, y);
      }
    }
  }

  update(dtMs, now, playerPos) {
    for (const b of this.bugs) if (b.alive && b.visible) b.update(dtMs, now, playerPos);
    // Tally kills that happened this frame
    for (const b of this.bugs) {
      if (!b.alive && !b._counted) {
        b._counted = true;
        this.totalKilled += 1;
      }
    }
  }

  cleanup() {
    this.bugs = this.bugs.filter(b => b.alive || (b.sprite && b.sprite.scene));
  }

  count() {
    let aliveOnScreen = 0;
    let aliveHidden = 0;
    for (const b of this.bugs) {
      if (!b.alive) continue;
      if (b.visible) aliveOnScreen++; else aliveHidden++;
    }
    return {
      visible:  aliveOnScreen,
      hidden:   aliveHidden,
      alive:    aliveOnScreen + aliveHidden,
      killed:   this.totalKilled,
      spawned:  this.totalSpawned,
    };
  }
}

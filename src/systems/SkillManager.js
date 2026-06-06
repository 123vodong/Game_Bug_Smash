// SkillManager — central system for skill pickups + active effects + HUD chip.
// Skills trigger on pickup; some are instant, some have a duration.
import { SKILLS, rollSkill } from '../data/skills.js';
import { SkillPickup } from '../entities/SkillPickup.js';
import { fullScreenFlash, hitNumbers } from '../effects/Effects.js';
import { AudioManager } from '../core/AudioManager.js';

const PICKUP_RADIUS = 36;

export class SkillManager {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} ctx  - { player, spawner, getEnemies, scoreRef }
   */
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx;
    this.pickups = [];

    // Active timed effects
    this.activeEffects = {};        // id -> { def, endsAt, modifiers }
    this._extraBugOnHit = 0;        // count of extra bugs to spawn per smash

    // HUD chip container for currently-active skill
    this._buildHUD();
  }

  // ---------------------------------------------------------- spawning
  spawnRandomAt(x, y) { return this.spawnAt(rollSkill(), x, y); }

  spawnAt(skillId, x, y) {
    const p = new SkillPickup(this.scene, skillId, x, y);
    this.pickups.push(p);
    return p;
  }

  spawnAtRandomLocation() {
    const { width: W, height: H } = this.scene.scale;
    const margin = 80;
    const x = margin + Math.random() * (W - margin * 2);
    const y = margin + 60 + Math.random() * (H - margin * 2 - 60);
    return this.spawnRandomAt(x, y);
  }

  // ---------------------------------------------------------- per-frame
  update(now) {
    // Pickup lifetime + collection
    const p = this.ctx.player;
    for (const pu of this.pickups) {
      if (!pu.alive) continue;
      pu.update(now);
      if (pu.alive && pu.distanceTo(p.x, p.y) < (pu.radius + (this.ctx.playerRadius || 24))) {
        this._collect(pu);
      }
    }
    this.pickups = this.pickups.filter(pu => pu.alive || (pu.sprite && pu.sprite.scene));

    // Expire active effects
    for (const id of Object.keys(this.activeEffects)) {
      if (now > this.activeEffects[id].endsAt) {
        this._deactivate(id);
      }
    }
    this._refreshHUD(now);
  }

  // ---------------------------------------------------------- activation
  _collect(pu) {
    pu.destroy(false);
    AudioManager.skillPickup(pu.def.category);
    this._applySkill(pu.def);
    hitNumbers(this.scene, pu.x, pu.y - 24, pu.def.name.toUpperCase(),
      this._cssColor(pu.def.color), 16);
  }

  _applySkill(def) {
    const e = def.effect;

    // ---- Instant effects ----
    if (e.teleportToBug) {
      const tgt = this._nearestBug();
      if (tgt) {
        // Teleport player to just-near the bug (a hair off so they actually overlap on next frame)
        this.ctx.player.teleportTo(tgt.x, tgt.y);
      }
    }
    if (e.respawnAllBugs) {
      // Pull every hidden bug back onto the screen now
      for (const bug of this.ctx.spawner.bugs) {
        if (bug.alive && !bug.visible) bug._respawn();
      }
      fullScreenFlash(this.scene, def.color, 0.25, 200);
    }

    // ---- Timed effects ----
    if (e.speedBoost) {
      this._activate(def, { speedBoost: e.speedBoost });
      this.ctx.player.speedMultiplier *= e.speedBoost;
    }
    if (e.oneShotSmash) {
      this._activate(def, { oneShotSmash: true });
    }
    if (e.random) {
      // Haiku: pick one of the random effects
      const pick = e.random[Math.floor(Math.random() * e.random.length)];
      const [kind, valueStr] = pick.split(':');
      const value = parseFloat(valueStr);
      if (kind === 'slowPlayer') {
        this._activate(def, { slowPlayer: value, _label: 'SLOWED' });
        this.ctx.player.speedMultiplier *= value;
      } else if (kind === 'extraBugOnHit') {
        this._activate(def, { extraBugOnHit: value, _label: 'BUGS PER HIT' });
        this._extraBugOnHit += value;
      }
    }
  }

  _activate(def, modifiers) {
    const id = def.id;
    // If already active, refresh duration but stack carefully
    if (this.activeEffects[id]) this._deactivate(id);
    this.activeEffects[id] = {
      def,
      modifiers,
      endsAt: this.scene.time.now + def.durationMs,
      startedAt: this.scene.time.now,
    };
  }

  _deactivate(id) {
    const a = this.activeEffects[id];
    if (!a) return;
    const m = a.modifiers;
    if (m.speedBoost) this.ctx.player.speedMultiplier /= m.speedBoost;
    if (m.slowPlayer) this.ctx.player.speedMultiplier /= m.slowPlayer;
    if (m.extraBugOnHit) this._extraBugOnHit -= m.extraBugOnHit;
    // oneShotSmash and similar flags are read on-demand via isActive()
    delete this.activeEffects[id];
    AudioManager.skillExpire();
  }

  // ---------------------------------------------------------- queries
  isActive(id) { return !!this.activeEffects[id]; }
  oneShotActive() { return this.isActive('opus'); }
  extraBugsPerHit() { return this._extraBugOnHit; }

  _nearestBug() {
    let best = null, bestD = Infinity;
    for (const b of this.ctx.spawner.bugs) {
      if (!b.alive || !b.visible) continue;
      const d = b.distanceTo(this.ctx.player.x, this.ctx.player.y);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  // ---------------------------------------------------------- HUD chip
  _buildHUD() {
    const { width: W } = this.scene.scale;
    this._hudContainer = this.scene.add.container(W / 2, 110).setDepth(45);
  }

  _refreshHUD(now) {
    this._hudContainer.removeAll(true);
    const entries = Object.values(this.activeEffects);
    if (entries.length === 0) return;
    // Stack chips horizontally
    const chipW = 130, chipH = 30, gap = 8;
    const totalW = entries.length * chipW + (entries.length - 1) * gap;
    let x = -totalW / 2 + chipW / 2;
    for (const a of entries) {
      const remain = Math.max(0, a.endsAt - now);
      const ratio = a.def.durationMs > 0 ? remain / a.def.durationMs : 0;
      const label = a.modifiers._label || a.def.name.toUpperCase();
      const chip = this.scene.add.container(x, 0);
      const bg = this.scene.add.rectangle(0, 0, chipW, chipH, a.def.color, 0.25)
        .setStrokeStyle(2, a.def.color);
      const fg = this.scene.add.rectangle(-chipW / 2 + 2, 0, (chipW - 4) * ratio, chipH - 4, a.def.color, 0.55)
        .setOrigin(0, 0.5);
      const icon = this.scene.add.image(-chipW / 2 + 18, 0, `skill-${a.def.id}`)
        .setDisplaySize(22, 22);
      const txt = this.scene.add.text(8, 0, `${label}  ${(remain / 1000).toFixed(1)}s`, {
        fontFamily: 'Consolas, monospace', fontSize: 11, color: '#ffffff',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0, 0.5);
      chip.add([bg, fg, icon, txt]);
      this._hudContainer.add(chip);
      x += chipW + gap;
    }
  }

  _cssColor(hex) {
    return '#' + hex.toString(16).padStart(6, '0');
  }
}

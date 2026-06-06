// Manages skill slots, activation, cooldowns, and effect application.
import { SKILLS } from '../data/skills.js';
import { AudioManager } from '../core/AudioManager.js';

const MAX_SLOTS = 3;

export class AISkillManager {
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx;                 // { player, getBugs, getChasers, score, combo }
    this.slots = [null, null, null]; // each: { id, def, readyAt, activeUntil, charges? }
    this.active = null;             // currently active slot index
    this.events = new Phaser.Events.EventEmitter();
    this._opusTimer = null;
    this._magnetTween = null;
  }

  /** Try to add a skill orb to first empty slot. */
  pickup(skillId) {
    const def = SKILLS[skillId]; if (!def) return false;
    const idx = this.slots.findIndex(s => !s);
    if (idx < 0) return false;
    this.slots[idx] = { id: skillId, def, readyAt: 0, activeUntil: 0, charges: 0 };
    this.events.emit('slot:update', idx, this.slots[idx]);
    return true;
  }

  activate(slotIdx) {
    const now = this.scene.time.now;
    const slot = this.slots[slotIdx];
    if (!slot) return;
    if (now < slot.readyAt) return;
    if (this.active !== null) this._deactivate(this.active);

    slot.activeUntil = now + slot.def.duration;
    slot.readyAt = now + slot.def.duration + slot.def.cooldown;
    this.active = slotIdx;
    AudioManager.skillStart(slot.id);
    this._applyEffect(slot);
    this.events.emit('skill:start', slot);

    this.scene.time.delayedCall(slot.def.duration, () => {
      if (this.active === slotIdx) this._deactivate(slotIdx);
    });
  }

  _deactivate(slotIdx) {
    const slot = this.slots[slotIdx];
    if (!slot) return;
    this._clearEffect(slot);
    this.active = null;
    this.events.emit('skill:end', slot);
  }

  _applyEffect(slot) {
    const e = slot.def.effect;
    const p = this.ctx.player;
    if (e.speedBoost) p.speedMultiplier = e.speedBoost;
    if (e.charges) slot.charges = e.charges;
    if (e.oneShotCharges) slot.charges = e.oneShotCharges;
    if (e.autoChain) slot.charges = e.autoChain;
    if (e.highlightBugs) this.ctx.getBugs().forEach(b => b.setHighlighted(true));
    if (e.freezeChasers) this.ctx.getChasers().forEach(c => c.setFrozen(true));
    if (e.timeScale) {
      // Approximate slow-mo: scale bug/chaser update via flag; UI tint.
      this.ctx.timeScale = e.timeScale;
      this._opusVignette = this.scene.add.rectangle(
        this.scene.scale.width / 2, this.scene.scale.height / 2,
        this.scene.scale.width, this.scene.scale.height,
        0xffd23f, 0.18
      ).setDepth(50).setBlendMode(Phaser.BlendModes.ADD);
    }
    if (e.autoSmashRadius) {
      slot._autoSmashTimer = this.scene.time.addEvent({
        delay: e.autoSmashIntervalMs ?? 1000,
        loop: true,
        callback: () => this.ctx.opusAutoSmash(e.autoSmashRadius),
      });
    }
    if (e.bugMagnet) {
      slot._magnetTimer = this.scene.time.addEvent({
        delay: 60, loop: true,
        callback: () => this.ctx.applyBugMagnet(e.bugMagnet),
      });
    }
  }

  _clearEffect(slot) {
    const e = slot.def.effect;
    const p = this.ctx.player;
    if (e.speedBoost) p.speedMultiplier = 1;
    if (e.highlightBugs) this.ctx.getBugs().forEach(b => b.setHighlighted(false));
    if (e.freezeChasers) this.ctx.getChasers().forEach(c => c.setFrozen(false));
    if (e.timeScale) {
      this.ctx.timeScale = 1;
      if (this._opusVignette) { this._opusVignette.destroy(); this._opusVignette = null; }
    }
    if (slot._autoSmashTimer) { slot._autoSmashTimer.remove(); slot._autoSmashTimer = null; }
    if (slot._magnetTimer)    { slot._magnetTimer.remove();    slot._magnetTimer = null; }
    slot.charges = 0;
  }

  /** Called by LevelScene when a smash hits a bug — gives charge-based skills a hook. */
  onSmashHit() {
    if (this.active === null) return null;
    const slot = this.slots[this.active];
    if (!slot) return null;
    const e = slot.def.effect;
    let mult = 1, oneShot = false;
    if (e.scoreMult) mult *= e.scoreMult;
    if (e.oneShotCharges && slot.charges > 0) { oneShot = true; slot.charges -= 1; }
    if (e.autoChain && slot.charges > 0)      { mult *= 2; slot.charges -= 1; }
    if (slot.charges === 0 && (e.charges || e.oneShotCharges || e.autoChain)) {
      // Charges exhausted — end early.
      this.scene.time.delayedCall(50, () => { if (this.active !== null) this._deactivate(this.active); });
    }
    return { mult, oneShot };
  }

  activeSkillId() {
    if (this.active === null) return null;
    return this.slots[this.active]?.id ?? null;
  }
}

AISkillManager.MAX_SLOTS = MAX_SLOTS;

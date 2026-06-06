// State-aware tip rotation. Used by MenuScene (panel) and LevelScene (ticker).
import { TIPS_DEFAULT, TIPS_OPUS_UNLOCKED, TIPS_ACTIVE_SKILL } from '../data/tips.js';
import { SaveManager } from '../core/SaveManager.js';

export class TipManager {
  constructor() { this.lastTip = null; }

  pickMenuTip() {
    const pool = SaveManager.isOpusUnlocked()
      ? [...TIPS_DEFAULT, ...TIPS_OPUS_UNLOCKED]
      : TIPS_DEFAULT;
    let tip;
    do { tip = Phaser.Utils.Array.GetRandom(pool); }
    while (tip === this.lastTip && pool.length > 1);
    this.lastTip = tip;
    return tip;
  }

  pickActiveSkillTip(skillId) {
    return TIPS_ACTIVE_SKILL[skillId] ?? null;
  }
}

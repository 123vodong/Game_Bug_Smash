// Tracks consecutive smashes within a window; produces a multiplier.

const WINDOW_MS = 1500;
const TIERS = [1, 3, 5, 10, 20];        // combo count thresholds
const MULTS = [1, 1.5, 2, 3, 5];        // matching multipliers

export class ComboSystem {
  constructor() { this.count = 0; this.lastHitAt = 0; this._lastTier = 0; }

  hit(nowMs) {
    if (nowMs - this.lastHitAt > WINDOW_MS) this.count = 0;
    this.count += 1;
    this.lastHitAt = nowMs;
    return this.multiplier();
  }

  update(nowMs) {
    if (this.count > 0 && nowMs - this.lastHitAt > WINDOW_MS) {
      this.count = 0; this._lastTier = 0;
    }
  }

  multiplier() {
    let m = 1;
    for (let i = 0; i < TIERS.length; i++) if (this.count >= TIERS[i]) m = MULTS[i];
    return m;
  }

  /** Returns the tier index if it just increased, else -1. */
  pollTierUp() {
    let tier = 0;
    for (let i = 0; i < TIERS.length; i++) if (this.count >= TIERS[i]) tier = i;
    if (tier > this._lastTier) { this._lastTier = tier; return tier; }
    return -1;
  }
}

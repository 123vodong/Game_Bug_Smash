export class ScoreSystem {
  constructor() { this.score = 0; this.bugsKilled = 0; this.maxCombo = 0; }
  add(base, multiplier = 1) { this.score += Math.round(base * multiplier); }
  countKill() { this.bugsKilled += 1; }
  noteCombo(count) { if (count > this.maxCombo) this.maxCombo = count; }
  grade() {
    if (this.score >= 4000) return 'S';
    if (this.score >= 2500) return 'A';
    if (this.score >= 1200) return 'B';
    return 'C';
  }
}

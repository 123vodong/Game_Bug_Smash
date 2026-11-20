// WebAudio synth-based SFX for BUG SMASH: Deadline Hunter.
// All sounds are generated procedurally — no external audio assets required.
// AudioContext is created lazily and resumed on first user gesture
// (browsers suspend it until then).
//
// Volume + mute come from the save (settings.volume, `muted`) at load, so every scene
// starts with the player's choice; SettingsPanel / the M key update them live.
import { SaveManager } from './SaveManager.js';

let ctx = null;
let masterGain = null;
let muted = false;
let volume = 0.8;   // master gain 0..1 (settings.volume)
try { muted = SaveManager.isMuted(); volume = SaveManager.getSettings().volume; } catch {}

function applyGain() {
  if (masterGain) masterGain.gain.value = muted ? 0 : volume;
}
// Per-sound cooldowns so a 10-champion team fight doesn't turn into white noise.
const lastAt = Object.create(null);
function throttled(key, ms) {
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if (now - (lastAt[key] || -1e9) < ms) return true;
  lastAt[key] = now;
  return false;
}

function getCtx() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : volume;
      masterGain.connect(ctx.destination);
    } catch { return null; }
  }
  if (ctx.state === 'suspended') {
    try { ctx.resume(); } catch {}
  }
  return ctx;
}

// ----------------------------------------------------------------- primitives
function tone(freq, durMs, type = 'sine', gain = 0.06, attackMs = 4) {
  const c = getCtx(); if (!c || muted || volume <= 0) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(g); g.connect(masterGain);
  const att = attackMs / 1000;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + att);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
  osc.start(t0);
  osc.stop(t0 + durMs / 1000 + 0.02);
}

function sweep(fStart, fEnd, durMs, type = 'square', gain = 0.06) {
  const c = getCtx(); if (!c || muted || volume <= 0) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(fStart, t0);
  osc.frequency.exponentialRampToValueAtTime(fEnd, t0 + durMs / 1000);
  osc.connect(g); g.connect(masterGain);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
  osc.start(t0);
  osc.stop(t0 + durMs / 1000 + 0.02);
}

function noise(durMs, gain = 0.04, filterFreq = 1200) {
  const c = getCtx(); if (!c || muted || volume <= 0) return;
  const bufSize = Math.max(1, Math.floor(c.sampleRate * (durMs / 1000)));
  const buf = c.createBuffer(1, bufSize, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = filterFreq;
  const g = c.createGain(); g.gain.value = gain;
  src.connect(filter); filter.connect(g); g.connect(masterGain);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + durMs / 1000);
  src.start(); src.stop(c.currentTime + durMs / 1000);
}

function later(ms, fn) { setTimeout(fn, ms); }

// ----------------------------------------------------------------- public API
export const AudioManager = {
  // ----- volume / mute -----
  // (These don't write the save — callers persist: SaveManager.setMuted / setSettings.)
  isMuted() { return muted; },
  setMuted(m) {
    muted = !!m;
    applyGain();
  },
  toggleMute() { this.setMuted(!muted); return muted; },
  getVolume() { return volume; },
  /** Master volume 0..1 (settings.volume). Independent of mute. */
  setVolume(v) {
    const n = Number(v);
    volume = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : volume;
    applyGain();
  },
  /** Re-read mute + volume from the save (e.g. after another tab/scene changed them). */
  applySaved() {
    try { muted = SaveManager.isMuted(); volume = SaveManager.getSettings().volume; } catch {}
    applyGain();
  },

  // Call from a click/keydown handler once to wake up the AudioContext.
  prime() { getCtx(); },

  // ----- gameplay SFX -----
  smashHit() {
    // Thwack: muffled noise burst + low square plosive
    noise(70, 0.05, 900);
    tone(190, 50, 'square', 0.035);
  },
  bugKill() {
    // Downward pitch sweep + bright fizz
    sweep(820, 200, 170, 'square', 0.06);
    noise(50, 0.025, 2000);
  },
  combo(tier) {
    // Bright chime; pitch shifts up with combo escalation
    const base = 523 * Math.pow(1.18, Math.max(0, tier));
    tone(base, 110, 'sine', 0.07);
    later(50, () => tone(base * 1.5, 130, 'sine', 0.055));
  },

  // ----- skill SFX (one per category) -----
  skillPickup(category) {
    const seqs = {
      buff:    [523, 659, 784],
      utility: [659, 880, 1175],
      debuff:  [440, 415, 392, 370],
      chaos:   [523, 698, 880, 1047, 1318],
    };
    const seq = seqs[category] ?? seqs.buff;
    seq.forEach((f, i) => later(i * 50, () => tone(f, 95, 'sine', 0.06)));
  },
  skillExpire() {
    sweep(440, 220, 200, 'sine', 0.04);
  },

  // ----- pickup-flavored chord for big events -----
  victory() {
    [523, 659, 784, 1047].forEach((f, i) =>
      later(i * 90, () => tone(f, 200, 'sine', 0.075)));
    later(480, () => tone(1568, 280, 'sine', 0.08));
  },
  failure() {
    // Slack/phone-style two-tone ding then descending fizz
    tone(831, 180, 'sine', 0.06);
    later(200, () => tone(622, 180, 'sine', 0.06));
    later(440, () => sweep(440, 110, 400, 'sawtooth', 0.05));
  },

  // ----- time pressure -----
  timerTick() {
    // Quiet click — used in the last seconds
    noise(18, 0.025, 4500);
  },
  timerWarning() {
    // Heavier alarm beep at thresholds (e.g. 15s, 10s, 5s)
    tone(880, 60, 'square', 0.05);
  },

  // ----- Office Chaos (MP world events + boss) -----
  paChime() {
    // Office PA "ding-dong" before the PM speaks
    tone(784, 260, 'sine', 0.07, 6);
    later(240, () => tone(622, 420, 'sine', 0.065, 6));
  },
  alarm() {
    // Prod-down siren: two rising/falling sweeps
    sweep(520, 980, 260, 'square', 0.035);
    later(270, () => sweep(980, 520, 260, 'square', 0.035));
    later(560, () => sweep(520, 980, 260, 'square', 0.035));
  },
  bossRoar() {
    // Low growl + rumble
    sweep(180, 60, 700, 'sawtooth', 0.06);
    noise(500, 0.05, 400);
  },
  slamImpact() {
    noise(160, 0.07, 700);
    tone(70, 220, 'square', 0.05);
  },
  reward() {
    // Bright fanfare for bounties / golden bug / boss MVP
    [659, 784, 988, 1319].forEach((f, i) => later(i * 70, () => tone(f, 160, 'triangle', 0.07)));
  },

  // ----- UI / system -----
  pause() {
    tone(440, 80, 'sine', 0.045);
    later(60, () => tone(330, 80, 'sine', 0.04));
  },
  resume() {
    tone(330, 80, 'sine', 0.04);
    later(60, () => tone(440, 80, 'sine', 0.045));
  },
  uiClick() { tone(880, 28, 'square', 0.03); },
  uiHover() { tone(1100, 18, 'sine', 0.018); },
  /** Settings slider preview — a short chime at the new volume. */
  volumePreview() { if (!throttled('volprev', 120)) tone(660, 90, 'sine', 0.06); },

  // ----- generic impact (wall stun, smite, anything that "connects") -----
  hit() {
    if (throttled('hit', 45)) return;
    noise(60, 0.05, 1100);
    tone(150, 70, 'square', 0.035);
  },

  // ----- Team Mode (Office Siege) hooks -----
  /** Your champion's basic attack lands/fires. ranged = projectile "pew", melee = thud. */
  teamAttack(ranged = false) {
    if (throttled('tatk', 90)) return;
    if (ranged) sweep(1300, 700, 70, 'triangle', 0.028);
    else { noise(45, 0.035, 800); tone(170, 45, 'square', 0.022); }
  },
  /** Skill cast: slot 'q'|'w'|'e'|'r' (or 0..3). R gets a bigger "reply-all" whoosh. */
  teamCast(slot) {
    const k = typeof slot === 'number' ? 'qwer'[slot] || 'q' : String(slot || 'q').toLowerCase();
    if (throttled('tcast' + k, 120)) return;
    if (k === 'r') {
      sweep(220, 880, 260, 'sawtooth', 0.04);
      later(120, () => tone(1175, 200, 'triangle', 0.05));
      noise(220, 0.03, 2400);
      return;
    }
    const base = { q: 660, w: 523, e: 784 }[k] || 660;
    sweep(base * 0.7, base * 1.35, 110, 'triangle', 0.045);
    later(40, () => noise(50, 0.02, 3000));
  },
  /** A champion died. mine = YOUR champion (sad trombone); else a small "kill" sting. */
  teamDeath(mine = false) {
    if (mine) {
      if (throttled('tdeathme', 600)) return;
      [392, 370, 349].forEach((f, i) => later(i * 170, () => tone(f, 190, 'sawtooth', 0.045)));
      later(520, () => sweep(330, 110, 520, 'sawtooth', 0.05));
    } else {
      if (throttled('tdeath', 150)) return;
      sweep(700, 260, 160, 'square', 0.04);
      later(90, () => tone(988, 120, 'sine', 0.045));
    }
  },
  /** A tower fell. ours = we LOST one (low rumble); else we took one (fanfare + crunch). */
  towerDown(ours = false) {
    if (throttled('tower', 400)) return;
    noise(380, 0.07, 500);
    if (ours) {
      tone(98, 420, 'square', 0.05);
      later(220, () => tone(82, 520, 'square', 0.045));
    } else {
      [523, 659, 784].forEach((f, i) => later(120 + i * 80, () => tone(f, 170, 'triangle', 0.06)));
    }
  },
};

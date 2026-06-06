// WebAudio synth-based SFX for BUG SMASH: Deadline Hunter.
// All sounds are generated procedurally — no external audio assets required.
// AudioContext is created lazily and resumed on first user gesture
// (browsers suspend it until then).

let ctx = null;
let masterGain = null;
let muted = false;

function getCtx() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 0.8;
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
  const c = getCtx(); if (!c || muted) return;
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
  const c = getCtx(); if (!c || muted) return;
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
  const c = getCtx(); if (!c || muted) return;
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
  isMuted() { return muted; },
  setMuted(m) {
    muted = !!m;
    if (masterGain) masterGain.gain.value = muted ? 0 : 0.8;
  },
  toggleMute() { this.setMuted(!muted); return muted; },

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
};

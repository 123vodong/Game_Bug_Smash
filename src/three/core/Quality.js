// Quality presets + auto-reduce, ported from three/main.js (autoReduce, quality block).
// Pure state machine: the Renderer applies `settings` to the WebGLRenderer / lights.
export const PRESETS = {
  // lite: cheap shaders/materials (no normal maps, no point lights, anisotropy 1). particles/flips/teles: pool caps.
  low: { shadow: 'off', bloom: false, pr: 0.6, lite: true, particles: 600, flips: 18, teles: 10 },
  med: { shadow: 'low', bloom: false, pr: 1, lite: false, particles: 1500, flips: 50, teles: 20 },
  high: { shadow: 'medium', bloom: true, pr: 1.5, lite: false, particles: 2500, flips: 70, teles: 28 },
};
/** Default quality is ALWAYS low (phones!). ?q=med|high raises it. */
export function qualityFromUrl() {
  try { const q = new URLSearchParams(location.search).get('q'); if (q && PRESETS[q]) return q; } catch (_) { /* ignore */ }
  return 'low';
}
export const IS_MOBILE = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
export const SHADOW_SIZE = { off: 0, low: 1024, medium: 2048, high: 4096 };
export class Quality {
  // opts: {level:'low'|'med'|'high', auto:boolean, onChange(settings, note)}
  constructor({ level = 'low', auto = true, onChange = null, limitMs = 28 } = {}) {
    this.limitMs = limitMs;
    this.level = PRESETS[level] ? level : 'low';
    this.settings = { ...PRESETS[this.level] };
    this.auto = auto; this.onChange = onChange;
    this.warm = 0; this.autoStep = 0; this.avgMs = 16; this.note = '';
  }
  set(level) {
    if (!PRESETS[level]) return;
    this.level = level; this.settings = { ...PRESETS[level] }; this.warm = 0; this.autoStep = 0; this._emit('manual');
  }
  patch(p) { Object.assign(this.settings, p); this.auto = false; this._emit('manual'); }
  _emit(note) { this.note = note; if (this.onChange) this.onChange(this.settings, note); }
  // update(dtSec, frameMs): call each frame. Avg > limitMs for 1 s (after 1.5 s warm-up) steps down once. Never raises.
  update(dtSec, frameMs) {
    this.avgMs = this.avgMs * 0.9 + frameMs * 0.1;
    this.warm += dtSec; if (!this.auto || this.warm < 1.5) return false;
    if (this.avgMs > this.limitMs) this.autoStep += dtSec; else this.autoStep = Math.max(0, this.autoStep - dtSec);
    if (this.autoStep < 1) return false;
    this.autoStep = 0;
    const s = this.settings;
    if (s.shadow === 'high') s.shadow = 'medium'; else if (s.shadow === 'medium') s.shadow = 'low';
    else if (s.pr > 0.75) s.pr = Math.max(0.6, s.pr - 0.25);
    else if (s.pr > 0.45) s.pr = Math.max(0.45, s.pr - 0.1);
    else if (s.bloom) s.bloom = false;
    else if (s.shadow !== 'off') s.shadow = 'off';
    else return false;
    this._emit('auto-reduced'); return true;
  }
}

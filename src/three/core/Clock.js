// Frame clock + server-time sync (breakdown 3.1). Pure, no DOM/three.
// FrameClock: dt in ms, clamped so a background tab or slow software renderer cannot explode the sim.
export class FrameClock {
  constructor({ maxDtMs = 50, fixedDtMs = 0 } = {}) { this.maxDtMs = maxDtMs; this.fixedDtMs = fixedDtMs; this.last = 0; this.t = 0; this.frames = 0; }
  // tick(nowMs) -> dtMs (first call returns 0). fixedDtMs>0 (screenshot harness) forces a virtual step.
  tick(nowMs) {
    const raw = this.last ? nowMs - this.last : 0; this.last = nowMs;
    const dt = this.fixedDtMs > 0 ? this.fixedDtMs : Math.min(this.maxDtMs, Math.max(0, raw));
    this.t += dt; this.frames++; return dt;
  }
}
// ServerClock: smallest-RTT offset, same algorithm as the TeamModeScene 'time' handler.
export class ServerClock {
  constructor() { this.offset = 0; this.bestRtt = Infinity; this.lastRtt = null; this.set = false; }
  // sample(msg{t,serverNow}) with msg.t = our Date.now() at send time
  sample(m, now = Date.now()) {
    if (!m || !Number.isFinite(m.serverNow) || !Number.isFinite(m.t)) return false;
    const rtt = now - m.t; if (rtt < 0 || rtt > 30000) return false;
    this.lastRtt = rtt;
    if (typeof window !== 'undefined' && window.__bsPerf) window.__bsPerf.setPing(rtt);
    if (rtt < this.bestRtt) { this.bestRtt = rtt; this.offset = m.serverNow + rtt / 2 - now; this.set = true; return true; }
    return false;
  }
  now() { return Date.now() + this.offset; }
}

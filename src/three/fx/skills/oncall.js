// Pager (On-call): radar pings (concentric rings) in alert red/amber.
const C = 0xff5252;
export default {
  q: { cast(k, m) { if (Number.isFinite(m.x1)) { k.pings(m.x1, m.y1, 90, C, 3); k.chev(m.x0, m.y0, Math.atan2(m.y1 - m.y0, m.x1 - m.x0), C, 3, 90, 55); } } }, // Ping
  w: { cast(k, m) { const p = k.me(m); k.pings(p.x, p.y, 80, 0xffb347, 3); }, land(k, m, x, y) { k.pings(x, y, 90, 0xffb347, 3); } }, // Page Everyone
  e: { land(k, m, x, y) { const R = m.r || 270; k.pings(x, y, R, 0xffffff, 3, 0.14); k.ring(x, y, R, C, 0.6); } }, // Postmortem
  r: { cast(k, m) { const p = k.me(m), R = m.r || 900; k.pings(p.x, p.y, R, 0xff1744, 3, 0.2); k.spiral(p.x, p.y, 200, 0xff1744, 14, true); } }, // Rollback
};

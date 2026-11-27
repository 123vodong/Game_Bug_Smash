// Courier (Rush): speed chevrons, parcel boxes (hex) and delivery stamps, orange/white.
const C = 0xff7a1a;
const trail = (k, m, col) => { if (Number.isFinite(m.x1)) k.chev(m.x0, m.y0, Math.atan2(m.y1 - m.y0, m.x1 - m.x0), col, 4, Math.hypot(m.x1 - m.x0, m.y1 - m.y0) / 4 || 60, 55, 0.45); };
export default {
  q: { cast(k, m) { trail(k, m, C); } }, // Express Delivery
  w: { cast(k, m) { const p = k.me(m); k.hex(p.x, p.y, 70, C, 0.6); k.shape(4, p.x, p.y, 50, 0xffffff, { dur: 0.6, z: 0.3 }); } }, // Pick Up Order
  e: { land(k, m, x, y) { k.hex(x, y, 100, C, 0.7); k.sparks(x, y, 0xffffff, 8); k.ring(x, y, 100, 0xffffff, 0.5); }, cast(k, m) { const p = k.at(m); k.hex(p.x, p.y, 60, C, 0.4); } }, // Deliver
  r: { cast(k, m) { const p = k.me(m); for (let i = 0; i < 6; i++) { const a = i * 1.047; k.chev(p.x + Math.cos(a) * 60, p.y + Math.sin(a) * 60, a, i & 1 ? C : 0xffffff, 2, 80, 50, 0.5); } k.ring(p.x, p.y, 160, C, 0.6); } }, // Peak Hours
};

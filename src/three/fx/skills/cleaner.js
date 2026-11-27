// Cleaner (Mop): soap bubbles and water sweeps, green/white.
const C = 0x2ecc71, W = 0xffffff;
export default {
  q: { land(k, m, x, y) { k.bubbles(x, y, 110, W, 8); } }, // Sweep (cone telegraph stays generic)
  w: { cast(k, m) { const p = k.me(m); k.ring(p.x, p.y, 100, C, 0.5); k.bubbles(p.x, p.y, 70, W, 8); } }, // Switch Gear
  e: { cast(k, m) { if (Number.isFinite(m.x1)) { k.line(m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0, Math.hypot(m.x1 - m.x0, m.y1 - m.y0) || 1, 90, C, 0.5, 0.35); k.bubbles(m.x1, m.y1, 90, W, 8); } else { const p = k.at(m); k.bubbles(p.x, p.y, m.r || 150, W, 10); } } }, // Mop Slide / puddle
  r: { cast(k, m) { const p = k.at(m), R = m.r || 380; k.spiral(p.x, p.y, R, W, 20, false, 0.9); k.ring(p.x, p.y, R, C, 0.7); k.bubbles(p.x, p.y, R * 0.8, W, 12); } }, // Mop Up
};

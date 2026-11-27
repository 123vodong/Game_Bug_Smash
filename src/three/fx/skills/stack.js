// Stack: stacked block towers (green HEX layers rising with delay).
const C = 0x7ed957;
export default {
  q: { land(k, m, x, y) { k.tower(x, y, C, 3, 60); } }, // SQL Hook
  w: { cast(k, m) { const p = k.me(m); k.tower(p.x, p.y, C, 3, 70); k.hex(p.x, p.y, 110, 0xb7ff9a, 0.8); } }, // Access Control
  e: { cast(k, m) { const p = k.at(m); k.tower(p.x, p.y, 0x39c2ff, 2, 55); k.spiral(p.x, p.y, 90, C, 10, true); } }, // Portal Pair
  r: { land(k, m, x, y) { const R = m.r || 350; for (let i = 0; i < 4; i++) { const a = i * 1.571 + 0.785; k.tower(x + Math.cos(a) * R * 0.6, y + Math.sin(a) * R * 0.6, C, 3, 70, i * 0.06); } k.ring(x, y, R, C, 0.6); } }, // Database Lock
};

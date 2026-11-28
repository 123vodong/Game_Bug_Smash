// Model: scatter-plot dots joined by neural lines, teal/green.
const C = 0x00d4aa, C2 = 0x6cffd6;
export default {
  q: { land(k, m, x, y) { k.scatter(x, y, m.r || 200, C, C2, 9); k.ring(x, y, m.r || 200, C, 0.5); } }, // Gradient Descent
  w: { cast(k, m) { const p = k.me(m); k.hex(p.x, p.y, 90, C2, 0.6); k.scatter(p.x, p.y, 85, C, C2, 5); } }, // Overfit
  e: { cast(k, m) { const p = k.at(m); k.scatter(p.x, p.y, 160, C, C2, 8); for (let i = -1; i <= 1; i++) k.shape(3, p.x + i * 70, p.y, 40, C2, { rot: 1.5708, sz: 10, dur: 0.8, z: 0.3 }); } }, // Random Forest
  r: { land(k, m, x, y) { const R = m.r || 340; k.spiral(x, y, R, C2, 18, true, 0.8); k.scatter(x, y, R, C, C2, 10); k.ring(x, y, R, C, 0.6); } }, // Big Data singularity
};

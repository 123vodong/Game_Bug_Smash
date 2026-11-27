// Dev (Patch): git diff colours (green +, red -), branching forks, merge chevrons converging.
const G = 0x39ff9a, R = 0xff5252, V = 0x8e44ad;
export default {
  q: { land(k, m, x, y) { k.shape(4, x - 40, y, 40, G, { dur: 0.5, z: 0.3 }); k.ring(x + 40, y, 30, R, 0.5); } }, // Refactor arc
  w: { cast(k, m) { const p = k.me(m); k.ring(p.x, p.y, 110, V, 0.5); k.ring(p.x, p.y, 70, G, 0.5, 0.1); } }, // git checkout
  e: { cast(k, m) { if (!Number.isFinite(m.x1)) return; const a = Math.atan2(m.y1 - m.y0, m.x1 - m.x0); k.chev(m.x0, m.y0, a + 0.35, G, 3, 90, 50); k.chev(m.x0, m.y0, a - 0.35, V, 3, 90, 50); } }, // git checkout -b
  r: { cast(k, m) { if (!Number.isFinite(m.x1)) return; const a = Math.atan2(m.y1 - m.y0, m.x1 - m.x0); k.chev(m.x1 - Math.cos(a) * 140, m.y1 - Math.sin(a) * 140, a, G, 2, 60, 55); k.chev(m.x1 + Math.cos(a) * 140, m.y1 + Math.sin(a) * 140, a + 3.1416, R, 2, 60, 55); k.rays(m.x1, m.y1, 90, V); } }, // Merge Conflict
};

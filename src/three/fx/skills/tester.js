// Tester: red bug-circle crosshairs. The generic projectile/area telegraphs keep the true width/range; crosshairs mark the landing.
const RED = 0xff3b3b;
export default {
  q: { land(k, m, x, y) { k.cross(x, y, 70, RED); } }, // Unit Test
  w: { cast(k, m) { const p = k.at(m); k.cross(p.x, p.y, 60, 0xffd23f, 0.8); } }, // Scout Drone
  e: { cast(k, m) { if (Number.isFinite(m.x1)) { k.cross(m.x1, m.y1, 85, RED); k.chev(m.x0, m.y0, Math.atan2(m.y1 - m.y0, m.x1 - m.x0), 0xff9800, 3, 90, 55); } } }, // Edge Case
  r: { land(k, m, x, y) { k.cross(x, y, 120, RED, 0.7); k.rays(x, y, 140, RED); } }, // Regression Barrage
};

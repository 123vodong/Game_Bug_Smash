// Hira (HR): clipboard plus signs, friendly hex policy zones, peach/pink.
const C = 0xf7a072, P = 0xff8fb1;
export default {
  q: { land(k, m, x, y) { k.shape(4, x, y, 60, P, { dur: 0.6, z: 0.3 }); k.ring(x, y, 60, C, 0.5); } }, // Feedback Hook
  w: { cast(k, m) { const p = k.me(m), t = k.at(m); k.shape(4, p.x, p.y, 45, P, { dur: 0.8, z: 0.3 }); if (Math.hypot(t.x - p.x, t.y - p.y) > 4) k.shape(4, t.x, t.y, 45, P, { dur: 0.8, z: 0.3 }); } }, // Buddy System
  e: { cast(k, m) { const p = k.at(m), R = m.r || 225; k.hex(p.x, p.y, R, C, 1.0); k.ring(p.x, p.y, R, P, 0.6); } }, // Policy Update
  r: { land(k, m, x, y) { const R = m.r || 360; k.hex(x, y, R, C, 0.8); k.hex(x, y, R * 0.6, P, 0.8, 0.12); k.shape(4, x, y, 90, 0xffffff, { dur: 0.8, z: 0.3 }); } }, // Mandatory Meeting
};

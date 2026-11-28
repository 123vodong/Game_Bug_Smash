// Guard (Brick): badge hex shields and gold lock rings.
const C = 0x4a7bd0, G = 0xffd23f;
export default {
  q: { cast(k, m) { if (Number.isFinite(m.x1) && Number.isFinite(m.x0)) { const dx = m.x1 - m.x0, dy = m.y1 - m.y0, d = Math.hypot(dx, dy); k.chev(m.x0, m.y0, Math.atan2(dy, dx), C, 3, Math.min(90, d / 3 || 30), 60); k.hex(m.x1, m.y1, 90, G, 0.5); } } }, // Shoulder Bash
  w: { cast(k, m) { const p = k.me(m), R = m.r || 300; k.hex(p.x, p.y, R, G, 0.7); k.ring(p.x, p.y, R, C, 0.6); k.shape(4, p.x, p.y, 60, G, { dur: 0.7, z: 0.3 }); } }, // Clipboard of Rules
  e: { cast(k, m) { const p = k.at(m); k.hex(p.x, p.y, 80, C, 0.9); k.hex(p.x, p.y, 55, G, 0.9, 0.08); k.sparks(p.x, p.y, G, 6); } }, // Barricade
  r: { land(k, m, x, y) { const R = m.r || 390; k.hex(x, y, R, G, 0.8); k.hex(x, y, R * 0.66, C, 0.8, 0.1); k.ring(x, y, R, G, 0.6); k.shape(4, x, y, 90, G, { dur: 0.9, z: 0.3 }); } }, // Building Lockdown
};

// Guard (Brick): badge hex shields and gold lock rings.
const C = 0x4a7bd0, G = 0xffd23f;
export default {
  q: { cast(k, m) { if (Number.isFinite(m.x1)) { k.chev(m.x0, m.y0, Math.atan2(m.y1 - m.y0, m.x1 - m.x0), C, 3, 90, 60); k.hex(m.x1, m.y1, 90, G, 0.5); } } }, // Shoulder Bash
  w: { cast(k, m) { const p = k.me(m), R = m.r || 300; k.hex(p.x, p.y, R, G, 0.7); k.ring(p.x, p.y, R, C, 0.6); k.shape(4, p.x, p.y, 60, G, { dur: 0.7, z: 0.3 }); } }, // Clipboard of Rules
  e: { cast(k, m) { const p = k.at(m); k.hex(p.x, p.y, 80, C, 0.9); k.hex(p.x, p.y, 55, G, 0.9, 0.08); k.sparks(p.x, p.y, G, 6); } }, // Barricade
  r: { cast(k, m) { const p = k.me(m), R = m.r || 390; k.hex(p.x, p.y, R, G, 0.8); k.hex(p.x, p.y, R * 0.66, C, 0.8, 0.1); k.ring(p.x, p.y, R, G, 0.6); k.shape(4, p.x, p.y, 90, G, { dur: 0.9, z: 0.3 }); } }, // Building Lockdown
};

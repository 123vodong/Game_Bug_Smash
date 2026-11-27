// Embedded (Volt): solder sparks, circuit hex footprints, steam vents, cyan/yellow.
const C = 0x00bcd4, Y = 0xfff35c;
export default {
  q: { cast(k, m) { const p = k.at(m); k.hex(p.x, p.y, 70, C, 0.9); k.sparks(p.x, p.y, Y, 10); } }, // Deploy Turret
  w: { cast(k, m) { const p = k.me(m); k.ring(p.x, p.y, 150, Y, 0.6); k.rays(p.x, p.y, 120, Y); k.sparks(p.x, p.y, Y, 10); } }, // Overclock
  e: { cast(k, m) { const p = k.me(m); k.ring(p.x, p.y, m.r || 200, C, 0.6); k.steam(p.x, p.y, (m.r || 200) * 0.8, 0xc5f6ff, 12); } }, // Coolant Vent
  r: { cast(k, m) { const p = k.me(m); k.rays(p.x, p.y, 220, Y, 0.5); k.shards(p.x, p.y, C, 8, 110); k.sparks(p.x, p.y, Y, 14, 4); } }, // Controlled Burst
};

// Embedded (Volt): solder sparks, circuit hex footprints, steam vents, cyan/yellow.
const C = 0x00bcd4, Y = 0xfff35c, F = 0xff7b29, ICE = 0xc5f6ff;
export default {
  q: {
    cast(k, m) {
      if (m.k === 'circle' && m.r >= 140) return; // turret detonation handled in land()
      const p = k.at(m);
      k.hex(p.x, p.y, 70, C, 0.9);
      k.sparks(p.x, p.y, Y, 10);
    },
    land(k, m, x, y) {
      if (m.k !== 'circle' || !(m.r >= 140)) return;
      const R = m.r;
      k.flash(x, y, R * 0.75, F, 0.35);
      k.ring(x, y, R, F, 0.55);
      k.shards(x, y, Y, 8, R * 0.55, 0.4);
      k.sparks(x, y, F, 12, 4);
    },
  }, // Deploy Turret / Turret Detonation
  w: { cast(k, m) { const p = k.at(m); k.ring(p.x, p.y, m.r || 150, Y, 0.6); k.rays(p.x, p.y, 120, Y); k.sparks(p.x, p.y, Y, 10); } }, // Overclock
  e: {
    cast(k, m) {
      const p = k.at(m), R = m.r || 260, inner = Math.min(110, R * 0.45);
      k.ring(p.x, p.y, R, C, 0.65);
      k.ring(p.x, p.y, inner, ICE, 0.65, 0, 0.85);
      if (!(m.delay > 0)) { k.steam(p.x, p.y, R * 0.8, ICE, 12); k.sparks(p.x, p.y, ICE, 8, 3); }
    },
    land(k, m, x, y) {
      if (!(m.delay > 0)) return;
      const R = m.r || 260, inner = Math.min(110, R * 0.45);
      k.ring(x, y, R, C, 0.5);
      k.ring(x, y, inner, ICE, 0.5, 0, 0.85);
      k.steam(x, y, R * 0.8, ICE, 12);
      k.sparks(x, y, ICE, 8, 3);
    },
  }, // Coolant Vent (donut ring: 260px outer + 110px inner safe-zone)
  r: { cast(k, m) { const p = k.at(m); k.rays(p.x, p.y, 180, Y, 0.45); k.shards(p.x, p.y, C, 6, 95, 0.35); k.sparks(p.x, p.y, Y, 12, 4); } }, // Controlled Burst
};

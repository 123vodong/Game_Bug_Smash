// Brew (Barista): coffee drops, milk/steam wisps, syrup blots.
const C = 0xc8864a;
export default {
  q: { land(k, m, x, y) { k.drops(x, y, 60, C, 6); k.steam(x, y, 50, 0xf5e6d3, 4); } }, // Espresso Shot
  w: { cast(k, m) { const p = k.me(m), R = m.r || 450; k.ring(p.x, p.y, R, 0xf5e6d3, 0.7); k.steam(p.x, p.y, R * 0.7, 0xf5e6d3, 12); } }, // Steamed Milk
  e: { land(k, m, x, y) { k.blot(x, y, (m.r || 190) * 0.9, 0xffb347, 1.0); k.drops(x, y, m.r || 190, 0xffb347, 8); } }, // Syrup Spill
  r: { cast(k, m) { const p = k.at(m), R = m.r || 300, col = Number.isFinite(m.color) ? m.color : 0x7ed957; k.ring(p.x, p.y, R, col, 0.8); k.steam(p.x, p.y, R * 0.7, col, 12, 1.8); k.drops(p.x, p.y, R * 0.6, C, 6); } }, // Serve
};

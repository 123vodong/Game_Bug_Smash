// Cache: memory-block lattices and scan rows, periwinkle.
const C = 0x5c7cfa, L = 0xc5d0ff;
export default {
  q: { land(k, m, x, y) { k.lattice(x, y, 90, C, L, 0.6); } }, // Batch Job
  w: { cast(k, m) { const p = k.me(m); k.ring(p.x, p.y, 90, C, 0.6); k.ring(p.x, p.y, 60, L, 0.6, 0.12); } }, // Cache Line
  e: { cast(k, m) { if (Number.isFinite(m.x0)) k.lattice(m.x0, m.y0, 80, C, L, 0.5); if (Number.isFinite(m.x1)) k.lattice(m.x1, m.y1, 80, L, C, 0.7); } }, // Failover
  r: { land(k, m, x, y) { k.lattice(x, y, 130, 0xd64545, 0xffa8a8, 0.9); k.ring(x, y, 130, 0xd64545, 0.6); } }, // Full Table Scan
};

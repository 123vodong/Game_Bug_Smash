// Pixel: pixel-grid lattices + magenta paint splashes. cast(k,m) at message time (decor, generic still runs); land(k,m,x,y) at impact.
const C = 0x39c2ff, P = 0xff5fa3;
export default {
  q: { cast(k, m) { const p = k.at(m), r = m.r || 110; k.lattice(p.x, p.y, r, C, P); k.hex(p.x, p.y, r, C, 0.7); } }, // Laser Fence
  w: { land(k, m, x, y) { k.lattice(x, y, 80, P, C, 0.6); k.blot(x, y, 70, P, 0.6); } }, // Flexbox Orbs
  e: { cast(k, m) { const p = k.me(m); k.spiral(p.x, p.y, 170, C, 16, true); k.ring(p.x, p.y, 170, P, 0.6); } }, // Ctrl+Z
  r: {
    cast(k, m) {
      if (Number.isFinite(m.x1) && Number.isFinite(m.y1)) k.lattice(m.x1, m.y1, 120, P, C);
      else if (Number.isFinite(m.len) && Number.isFinite(m.dx)) { const p = k.me(m); k.lattice(p.x + m.dx * m.len, p.y + (m.dy || 0) * m.len, 120, P, C); }
    },
    land(k, m, x, y) { k.blot(x, y, 100, P, 0.9); k.lattice(x, y, 140, C, P, 0.9); },
  }, // Framework Rewrite
};

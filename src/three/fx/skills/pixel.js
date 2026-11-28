import { SH } from '../shapes.js';

// Pixel: CSS-grid motifs, pixel squares, and a cyan/magenta rewrite palette.
const C = 0x39c2ff, P = 0xff4fa3;
const square = (k, x, y, size, color, dur = 0.55, delay = 0) => k.shape(SH.STREAK, x, y, size, color, { sz: size, dur, delay, z: 0.28 });
export default {
  q: {
    cast(k, m) {
      const p = k.at(m), r = m.r || 110;
      k.lattice(p.x, p.y, r, C, P); k.hex(p.x, p.y, r, C, 0.7);
      square(k, p.x - r * 0.6, p.y, 18, P); square(k, p.x + r * 0.6, p.y, 18, P);
    },
  }, // Laser Fence
  w: {
    land(k, m, x, y) {
      k.lattice(x, y, 80, P, C, 0.6); k.blot(x, y, 70, P, 0.6);
      for (let i = 0; i < k.n(3); i++) square(k, x + (i - 1) * 24, y - 10 + (i % 2) * 20, 12, i % 2 ? C : P, 0.42, i * 0.07);
    },
  }, // Flexbox Orbs
  e: {
    cast(k, m) {
      const p = k.me(m);
      k.ring(p.x, p.y, 170, C, 0.7); k.hex(p.x, p.y, 115, P, 0.55);
      k.ticks(p.x, p.y, 150, C, 8, 0.65);
      for (let i = 0; i < k.n(4); i++) square(k, p.x + (i - 1.5) * 34, p.y + 52, 13, i % 2 ? P : C, 0.5, i * 0.05);
    },
  }, // Ctrl+Z
  r: {
    cast(k, m) {
      if (Number.isFinite(m.x1) && Number.isFinite(m.y1)) {
        k.lattice(m.x1, m.y1, 120, P, C);
        square(k, m.x1, m.y1, 32, P, 0.42);
      } else if (Number.isFinite(m.len) && Number.isFinite(m.dx)) {
        const p = k.me(m), x = p.x + m.dx * m.len, y = p.y + (m.dy || 0) * m.len;
        k.lattice(x, y, 120, P, C); square(k, x, y, 32, P, 0.42);
      }
    },
    land(k, m, x, y) {
      k.blot(x, y, 100, P, 0.9); k.lattice(x, y, 140, C, P, 0.9);
      for (let i = 0; i < k.n(4); i++) square(k, x + (i - 1.5) * 25, y, 14, i % 2 ? P : C, 0.5, i * 0.04);
    },
  }, // Framework Rewrite
};

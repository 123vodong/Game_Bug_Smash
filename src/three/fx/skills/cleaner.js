// Cleaner (Mop): soap bubbles and water sweeps (Mop stance) vs splashes and flood puddles (Bucket stance).
const C = 0x2ecc71, B = 0x39c2ff, W = 0xffffff;
export default {
  q: {
    land(k, m, x, y) {
      if (m.k === 'circle') {
        const R = m.r || 170;
        k.blot(x, y, R * 0.75, B, 0.7);
        k.drops(x, y, R, B, 8);
        k.bubbles(x, y, R * 0.8, W, 8);
      } else {
        k.bubbles(x, y, 110, W, 8);
      }
    },
  }, // Mop Sweep (cone) / Bucket Splash (circle)
  w: { cast(k, m) { const p = k.me(m), col = Number.isFinite(m.color) ? m.color : C; k.ring(p.x, p.y, 100, col, 0.5); k.bubbles(p.x, p.y, 70, W, 8); } }, // Switch Gear
  e: {
    cast(k, m) {
      if (m.k !== 'circle' && Number.isFinite(m.x1) && Number.isFinite(m.y1) && Number.isFinite(m.x0) && Number.isFinite(m.y0)) {
        const dx = m.x1 - m.x0, dy = m.y1 - m.y0, d = Math.hypot(dx, dy);
        if (d > 1) k.line(m.x0, m.y0, dx / d, dy / d, d, 90, C, 0.5, 0.35);
        k.bubbles(m.x1, m.y1, 90, W, 8);
      } else {
        const p = k.at(m), R = m.r || 150;
        k.blot(p.x, p.y, R * 0.85, B, 0.8);
        k.ring(p.x, p.y, R, B, 0.6);
        k.bubbles(p.x, p.y, R * 0.85, W, 10);
      }
    },
  }, // Mop Slide (dash) / Bucket Puddle (circle)
  r: {
    cast(k, m) {
      const p = k.at(m), R = m.r || 380, col = Number.isFinite(m.color) ? m.color : C;
      if (m.k === 'zone') {
        k.blot(p.x, p.y, R * 0.85, col, 0.9);
        k.ring(p.x, p.y, R, col, 0.75);
        k.drops(p.x, p.y, R * 0.8, col, 10);
        k.bubbles(p.x, p.y, R * 0.85, W, 14);
      } else {
        k.spiral(p.x, p.y, R, W, 20, false, 0.9);
        k.ring(p.x, p.y, R, col, 0.7);
        k.bubbles(p.x, p.y, R * 0.8, W, 12);
      }
    },
  }, // Mop Up (whirlwind) / Bucket Flood (zone)
};

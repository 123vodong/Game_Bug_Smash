// Dev (Patch): git diff colours (green +, red -), branching forks, merge chevrons; branch-aware (Main / Hotfix / Feature).
const G = 0x39ff9a, R = 0xff5252, V = 0x8e44ad, B = 0x39c2ff;
export default {
  q: {
    cast(k, m) {
      if (m.k === 'dash' && Number.isFinite(m.x1) && Number.isFinite(m.x0)) {
        const dx = m.x1 - m.x0, dy = m.y1 - m.y0, d = Math.hypot(dx, dy);
        k.chev(m.x0, m.y0, Math.atan2(dy, dx), R, 3, Math.min(80, d / 3 || 50), 50);
      } else if (m.k === 'zone') {
        const p = k.at(m), rad = m.r || 180;
        k.hex(p.x, p.y, rad, V, 0.8);
        k.ring(p.x, p.y, rad, B, 0.6);
      }
    },
    land(k, m, x, y) {
      if (m.k === 'dash') { k.shards(x, y, R, 6, 70, 0.4); k.sparks(x, y, R, 8); }
      else if (m.k === 'zone') { k.lattice(x, y, m.r || 180, V, B, 0.7); }
      else { k.shape(4, x - 40, y, 40, G, { dur: 0.5, z: 0.3 }); k.ring(x + 40, y, 30, R, 0.5); }
    },
  }, // Refactor (arc) / Hotfix Lunge (dash) / Feature Zone (zone)
  w: { cast(k, m) { const p = k.me(m), col = Number.isFinite(m.color) ? m.color : V; k.ring(p.x, p.y, 110, col, 0.5); k.ring(p.x, p.y, 70, G, 0.5, 0.1); } }, // git checkout
  e: {
    cast(k, m) {
      if (m.k === 'circle') {
        const p = k.at(m), rad = m.r || 200;
        k.ring(p.x, p.y, rad, V, 0.6);
        k.hex(p.x, p.y, rad * 0.7, B, 0.6, 0.08);
      } else if (m.k === 'blink') {
        if (Number.isFinite(m.x0) && Number.isFinite(m.y0)) k.ring(m.x0, m.y0, 70, R, 0.45);
        if (Number.isFinite(m.x1) && Number.isFinite(m.y1)) { k.flash(m.x1, m.y1, 90, R, 0.35); k.shards(m.x1, m.y1, R, 6, 65, 0.35); }
      } else if (Number.isFinite(m.x1) && Number.isFinite(m.x0)) {
        const dx = m.x1 - m.x0, dy = m.y1 - m.y0, a = Math.atan2(dy, dx), g = Math.min(90, Math.hypot(dx, dy) / 3 || 60);
        k.chev(m.x0, m.y0, a + 0.35, G, 3, g, 50);
        k.chev(m.x0, m.y0, a - 0.35, V, 3, g, 50);
      }
    },
  }, // git checkout -b (dash) / Hotfix Blink (blink) / Feature Pulse (circle)
  r: {
    cast(k, m) {
      if (m.k === 'allies' || m.k === 'buff') {
        const p = k.me(m), rad = m.r || 420, col = m.k === 'buff' ? G : V;
        k.ring(p.x, p.y, rad, col, 0.75);
        k.hex(p.x, p.y, rad * 0.65, B, 0.75, 0.1);
        k.rays(p.x, p.y, 130, col, 0.5);
      } else if (Number.isFinite(m.x1) && Number.isFinite(m.x0)) {
        const a = Math.atan2(m.y1 - m.y0, m.x1 - m.x0);
        k.chev(m.x1 - Math.cos(a) * 140, m.y1 - Math.sin(a) * 140, a, G, 2, 60, 55);
        k.chev(m.x1 + Math.cos(a) * 140, m.y1 + Math.sin(a) * 140, a + 3.1416, R, 2, 60, 55);
        k.rays(m.x1, m.y1, 90, V);
      }
    },
  }, // Merge Conflict (tgt) / Release (allies/buff)
};

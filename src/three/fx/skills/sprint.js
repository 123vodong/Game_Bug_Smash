// Sprint: stopwatch dials (ring + clock ticks at the true radius), amber.
const C = 0xffb300;
export default {
  q: { cast(k, m) { const p = k.me(m), R = m.r || 260; k.ring(p.x, p.y, R, C, 0.7); k.ticks(p.x, p.y, R * 0.92, 0xfff2a8, 12); } }, // Daily Stand-up
  w: { cast(k, m) { const p = k.me(m); k.ring(p.x, p.y, 120, C, 0.8); k.ticks(p.x, p.y, 110, 0xfff2a8, 8, 0.8); } }, // Sprint Planning
  e: { cast(k, m) { if (Number.isFinite(m.x1) && Number.isFinite(m.x0)) { const dx = m.x1 - m.x0, dy = m.y1 - m.y0, d = Math.hypot(dx, dy); k.chev(m.x0, m.y0, Math.atan2(dy, dx), C, 3, Math.min(90, d / 3 || 60), 55); k.ring(m.x1, m.y1, 100, 0xfff2a8, 0.5); } } }, // Story Points leap
  r: { cast(k, m) { const p = k.me(m), R = m.r || 750; k.ring(p.x, p.y, R, C, 0.8); k.ring(p.x, p.y, R * 0.7, 0xfff2a8, 0.8, 0.15); k.ticks(p.x, p.y, R * 0.95, C, 16, 0.8); } }, // All Hands Sprint
};

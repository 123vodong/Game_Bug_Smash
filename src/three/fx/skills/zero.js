// Zero: binary 0/1 shards (small rings and bars) in violet.
const C = 0xb084ff;
export default {
  q: { cast(k, m) { const p = k.at(m); k.bits(p.x, p.y, 110, C, 6); } }, // Fork Process
  w: { cast(k, m) { if (Number.isFinite(m.x0)) k.bits(m.x0, m.y0, 90, C, 6); if (Number.isFinite(m.x1)) k.bits(m.x1, m.y1, 90, 0xffffff, 6); } }, // Context Switch
  e: { cast(k, m) { const p = k.me(m), R = m.r || 240; k.ring(p.x, p.y, R, C, 0.6); k.bits(p.x, p.y, R, C, 10, 0.8); k.shards(p.x, p.y, 0xffffff, 6, R * 0.5); } }, // Brute Force
  r: { cast(k, m) { const x = Number.isFinite(m.x1) ? m.x1 : k.me(m).x, y = Number.isFinite(m.y1) ? m.y1 : k.me(m).y; k.bits(x, y, 120, C, 8, 0.9); k.shards(x, y, 0xffffff, 8, 90, 0.5); } }, // Zero-Day
};

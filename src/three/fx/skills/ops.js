// Ops: terminal prompt cursors ('>_') and blue/green deploy rings.
const C = 0xffd23f;
export default {
  q: { land(k, m, x, y) { k.pings(x, y, m.r || 200, C, 2); k.cursor(x, y, C, 70); } }, // Health Check
  w: { cast(k, m) { const p = k.me(m); k.cursor(p.x, p.y, C, 50); if (Number.isFinite(m.x1)) k.cursor(m.x1, m.y1, 0x39ff9a, 50); } }, // Hotfix Tether
  e: { cast(k, m) { if (Number.isFinite(m.x0) && Number.isFinite(m.y0)) k.cursor(m.x0, m.y0, C, 50); if (Number.isFinite(m.x1) && Number.isFinite(m.y1)) { k.cursor(m.x1, m.y1, 0x39ff9a, 50); if (Number.isFinite(m.x0) && Number.isFinite(m.y0)) { const dx = m.x1 - m.x0, dy = m.y1 - m.y0, d = Math.hypot(dx, dy); k.chev(m.x0, m.y0, Math.atan2(dy, dx), C, 3, d / 3 || 60, 50); } } } }, // Hot Swap
  r: { cast(k, m) { if (m.k === 'buff') return; const p = k.me(m), R = m.r || 800; k.ring(p.x, p.y, R, 0x39c2ff, 0.7); k.ring(p.x, p.y, R * 0.88, 0x39ff9a, 0.7, 0.18); k.cursor(p.x, p.y, C, 90, 1.0); } }, // Blue-Green Deploy
};

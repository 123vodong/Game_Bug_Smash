// Lint: review pins (rotated plus + ring at the true radius), red-pen strokes. Colour follows the pin severity (msg colour).
const C = 0xe17055;
export default {
  q: {
    cast(k, m) {
      const p = k.at(m), col = Number.isFinite(m.color) ? m.color : 0xffd23f;
      if (m.k === 'circle' || m.k === 'heal') { k.ring(p.x, p.y, m.r || 120, col, 0.45); k.sparks(p.x, p.y, col, 6); return; }
      k.pin(p.x, p.y, col, m.r || 70);
    },
  }, // Nit Pin
  w: {
    cast(k, m) {
      const p = k.at(m), col = Number.isFinite(m.color) ? m.color : 0xff3b3b;
      if (m.k === 'circle' || m.k === 'heal') { k.ring(p.x, p.y, m.r || 130, col, 0.45); k.shards(p.x, p.y, col, 6, 70, 0.35); return; }
      k.pin(p.x, p.y, col, m.r || 70);
      k.shards(p.x, p.y, 0xff3b3b, 4, 50);
    },
  }, // Blocker Pin
  e: {
    cast(k, m) {
      const p = k.at(m), col = Number.isFinite(m.color) ? m.color : 0x7ed957;
      if (m.k === 'circle' || m.k === 'heal') { k.ring(p.x, p.y, m.r || 130, col, 0.5); k.sparks(p.x, p.y, 0x7ed957, 6); return; }
      k.pin(p.x, p.y, col, m.r || 70);
    },
  }, // Suggestion Pin
  r: {
    cast(k, m) {
      const p = k.at(m), R = m.r || 180;
      k.rays(p.x, p.y, R, 0x7ed957, 0.55);
      k.ring(p.x, p.y, R, C, 0.7);
      k.shards(p.x, p.y, 0xffffff, 8, R * 0.6, 0.45);
      k.sparks(p.x, p.y, 0x7ed957, 10, 3.5);
    },
  }, // Merge When Resolved (chain-resolve starburst)
};

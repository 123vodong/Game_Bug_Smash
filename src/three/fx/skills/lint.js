// Lint: review pins (rotated plus + ring at the true radius), red-pen strokes. Colour follows the pin severity (msg colour).
const C = 0xe17055;
export default {
  q: { cast(k, m) { const p = k.at(m); k.pin(p.x, p.y, Number.isFinite(m.color) ? m.color : 0xffd23f, m.r || 70); } }, // Nit Pin
  w: { cast(k, m) { const p = k.at(m); k.pin(p.x, p.y, Number.isFinite(m.color) ? m.color : 0xff3b3b, m.r || 70); k.shards(p.x, p.y, 0xff3b3b, 4, 50); } }, // Blocker Pin
  e: { cast(k, m) { const p = k.at(m); k.pin(p.x, p.y, Number.isFinite(m.color) ? m.color : 0x7ed957, m.r || 70); } }, // Suggestion Pin
  r: { cast(k, m) { const p = k.me(m); k.shape(4, p.x, p.y, 130, 0x7ed957, { dur: 0.8, z: 0.3 }); k.ring(p.x, p.y, 170, C, 0.7); k.shards(p.x, p.y, 0xffffff, 8, 100); } }, // Merge When Resolved
};

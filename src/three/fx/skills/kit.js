// Themed-VFX kit for per-skill styles. Everything is built from the shared primitives (1 instanced shape draw + 1 Points draw):
// no textures, no new draw calls, no per-frame allocation (scratch vectors, pooled shapes/particles, counts scaled down on 'lite').
// All coordinates/sizes in sim px; kit converts to scene units (S = 0.01).
export function createKit(b) {
  const { sh, parts, SH, S, rnd, mix, lite } = b;
  const n = (v) => Math.max(1, Math.round(v * (lite ? 0.55 : 1)));
  const A = { x: 0, y: 0 }, M = { x: 0, y: 0 };
  const fin = Number.isFinite;
  const k = { ...b, n };
  /** caster position (scratch object, consume immediately) */
  k.me = (m, o = M) => { const p = b.pos(m.sid); if (p) { o.x = p.x; o.y = p.y; } else if (fin(m.x0) && fin(m.y0)) { o.x = m.x0; o.y = m.y0; } else { o.x = fin(m.x) ? m.x : 0; o.y = fin(m.y) ? m.y : 0; } return o; };
  /** best target point of a message (m.x/y, else m.x1/y1, else caster) */
  k.at = (m) => { if (fin(m.x) && fin(m.y)) { A.x = m.x; A.y = m.y; } else if (fin(m.x1) && fin(m.y1)) { A.x = m.x1; A.y = m.y1; } else k.me(m, A); return A; };
  const shape = (type, x, y, size, color, o = {}) => sh.add({ type, x: x * S, y: y * S, z: o.z === undefined ? 0.09 : o.z, rot: o.rot || 0, sx: size * S, sz: (o.sz === undefined ? size : o.sz) * S, dur: o.dur || 0.5, delay: o.delay || 0, color, alpha: o.alpha === undefined ? 1 : o.alpha, prio: o.prio === undefined ? 0 : o.prio });
  k.shape = shape;
  /** ring / hex at the TRUE radius (telegraph-grade, prio 1) */
  k.ring = (x, y, r, color, dur = 0.5, delay = 0, alpha = 1) => shape(SH.RING, x, y, r, color, { dur, delay, alpha, prio: 1 });
  k.hex = (x, y, r, color, dur = 0.6, delay = 0, alpha = 1) => shape(SH.HEX, x, y, r, color, { dur, delay, alpha, prio: 1 });
  k.dot = (x, y, z, color, size, life, vx = 0, vy = 0, vz = 0, g = 0) => parts.puff(x * S, z, y * S, vx, vy, vz, life, size, color, 1, g, 0.6);
  /** pixel grid of dots inside radius r (Pixel / Cache) */
  k.lattice = (x, y, r, color, c2, life = 0.7) => {
    const st = Math.max(r / 3, 28), m = Math.floor(r / st);
    for (let i = -m; i <= m; i++) for (let j = -m; j <= m; j++) { if (i * i + j * j > m * m + 1 || (lite && (i + j) & 1)) continue; k.dot(x + i * st, y + j * st, 0.12, (i + j) & 1 ? color : c2, 0.2, life * rnd(0.7, 1), 0, rnd(0.1, 0.5), 0, 0); }
  };
  /** binary glyphs: 0 = small ring, 1 = thin vertical bar (Zero) */
  k.bits = (x, y, r, color, count = 6, dur = 0.7) => {
    for (let i = 0, c = n(count); i < c; i++) {
      const a = rnd(6.283), d = Math.sqrt(Math.random()) * r, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d, dl = rnd(0.25);
      if (i & 1) shape(SH.RING, px, py, 16, color, { dur, delay: dl, z: 0.3 }); else shape(SH.STREAK, px, py, 18, color, { dur, delay: dl, sz: 4, rot: 1.5708, z: 0.3 });
    }
    for (let i = 0, c = n(8); i < c; i++) { const a = rnd(6.283), d = Math.sqrt(Math.random()) * r; k.dot(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.2, mix(color, 0xffffff), 0.16, dur, 0, rnd(0.5, 1.5), 0, 0); }
  };
  /** red bug crosshair (Tester): ring + plus + diagonal tick */
  k.cross = (x, y, r, color = 0xff3b3b, dur = 0.55) => { k.ring(x, y, r, color, dur); shape(SH.PLUS, x, y, r * 1.1, color, { dur, alpha: 0.9 }); shape(SH.PLUS, x, y, r * 0.55, 0xffffff, { dur: dur * 0.8, rot: 0.785, alpha: 0.8 }); };
  k.pings = (x, y, r, color, count = 3, gap = 0.12) => { for (let i = 0, c = n(count); i < c; i++) k.ring(x, y, r * (1 - i * 0.18), color, 0.55, i * gap, 1 - i * 0.2); };
  k.steam = (x, y, r, color, count = 10, rise = 1.4) => { for (let i = 0, c = n(count); i < c; i++) { const a = rnd(6.283), d = Math.sqrt(Math.random()) * r; k.dot(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.1, color, rnd(0.2, 0.34), rnd(0.8, 1.3), rnd(-0.1, 0.1), rise * rnd(0.6, 1.2), 0, 0.6); } };
  k.drops = (x, y, r, color, count = 8) => { for (let i = 0, c = n(count); i < c; i++) { const a = rnd(6.283), d = Math.sqrt(Math.random()) * r; k.dot(x + Math.cos(a) * d, y + Math.sin(a) * d, rnd(0.9, 1.8), color, rnd(0.12, 0.2), rnd(0.5, 0.8), 0, 0, 0, -9); } };
  /** stacked block tower (Stack) */
  k.tower = (x, y, color, count = 3, size = 60, delay = 0) => { for (let i = 0; i < count; i++) shape(SH.HEX, x, y, size * (1 - i * 0.1), i & 1 ? 0xb7ff9a : color, { dur: 0.7, delay: delay + i * 0.07, z: 0.1 + i * 0.22 }); };
  /** scatter-plot dots joined by thin lines (Model) */
  k.scatter = (x, y, r, color, c2, count = 8) => {
    let px = 0, py = 0;
    for (let i = 0, c = n(count); i < c; i++) {
      const a = rnd(6.283), d = Math.sqrt(Math.random()) * r, qx = x + Math.cos(a) * d, qy = y + Math.sin(a) * d; k.dot(qx, qy, 0.25, i & 1 ? color : c2, 0.2, 0.8, 0, rnd(0.2, 0.8), 0, 0);
      if (i > 0 && i < 4) shape(SH.STREAK, (px + qx) / 2, (py + qy) / 2, Math.hypot(qx - px, qy - py) / 2, c2, { rot: Math.atan2(qy - py, qx - px), sz: 4, dur: 0.6, alpha: 0.7, z: 0.25 });
      px = qx; py = qy;
    }
  };
  /** terminal prompt '>_' (Ops) */
  k.cursor = (x, y, color, size = 60, dur = 0.8) => { shape(SH.CHEVRON, x - size * 0.5, y, size * 0.6, color, { dur, sz: size * 0.5, z: 0.3 }); shape(SH.STREAK, x + size * 0.3, y + size * 0.3, size * 0.4, 0xffffff, { dur, sz: size * 0.1, z: 0.3 }); shape(SH.STREAK, x + size * 0.3, y + size * 0.3, size * 0.4, color, { dur: dur * 0.5, delay: dur * 0.5, sz: size * 0.1, z: 0.3 }); };
  k.shards = (x, y, color, count = 6, len = 70, dur = 0.4) => { for (let i = 0, c = n(count); i < c; i++) { const a = (i / c) * 6.283 + rnd(0.3); shape(SH.STREAK, x + Math.cos(a) * len * 0.8, y + Math.sin(a) * len * 0.8, len, color, { rot: a, sz: 8, dur, z: 0.4 }); } };
  k.chev = (x, y, ang, color, count = 3, gap = 70, size = 60, dur = 0.4) => { for (let i = 0; i < count; i++) shape(SH.CHEVRON, x + Math.cos(ang) * gap * i, y + Math.sin(ang) * gap * i, size, color, { rot: ang, dur, delay: i * 0.05, z: 0.35 }); };
  k.spiral = (x, y, r, color, count = 14, inward = true, dur = 0.7) => {
    const s = inward ? -1 : 1;
    for (let i = 0, c = n(count); i < c; i++) { const a = (i / c) * 12.5, d = r * (i / c); k.dot(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.15, color, 0.18, dur, -Math.sin(a) * 1.5 + s * Math.cos(a), 0.2, Math.cos(a) * 1.5 + s * Math.sin(a), 0); }
  };
  /** range/width telegraph flash from (x,y) along unit dir (true length / full width) */
  k.line = (x, y, dx, dy, len, w, color, dur = 0.28, alpha = 0.22) => { const a = Math.atan2(dy, dx); shape(SH.STREAK, x + dx * len * 0.5, y + dy * len * 0.5, len / 2, color, { rot: a, sz: Math.max(14, w / 2), dur, alpha, z: 0.06 }); };
  k.pin = (x, y, color, r = 60) => { shape(SH.PLUS, x, y, r * 0.5, color, { rot: 0.785, dur: 1.0, z: 0.4 }); k.ring(x, y, r, color, 0.6); };
  k.rays = (x, y, r, color, dur = 0.4) => shape(SH.RAYS, x, y, r, color, { dur, z: 0.5, rot: rnd(3) });
  k.flash = (x, y, r, color, dur = 0.35) => shape(SH.FLASH, x, y, r, color, { dur, z: 0.5 });
  k.blot = (x, y, r, color, dur = 0.8) => shape(SH.BLOT, x, y, r, color, { dur });
  k.ticks = (x, y, r, color, count = 8, dur = 0.6) => { for (let i = 0, c = n(count); i < c; i++) { const a = (i / c) * 6.283; shape(SH.STREAK, x + Math.cos(a) * r, y + Math.sin(a) * r, 14, color, { rot: a, sz: 4, dur, z: 0.2 }); } };
  k.bubbles = (x, y, r, color, count = 8) => { for (let i = 0, c = n(count); i < c; i++) { const a = rnd(6.283), d = Math.sqrt(Math.random()) * r; k.dot(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.1, color, rnd(0.16, 0.3), rnd(0.7, 1.2), 0, rnd(0.5, 1.2), 0, 0.5); } };
  k.sparks = (x, y, color, count = 8, spd = 3) => { for (let i = 0, c = n(count); i < c; i++) { const a = rnd(6.283), s = rnd(0.4, 1) * spd; k.dot(x, y, 0.5, mix(color, 0xffffff), 0.1, rnd(0.3, 0.5), Math.cos(a) * s, rnd(0.5, 2), Math.sin(a) * s, -6); } };
  return k;
}

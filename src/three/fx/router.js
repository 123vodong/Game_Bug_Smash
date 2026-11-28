// FX router (breakdown 3.2 / C4): maps sim 'fx' / 'atk' / 'gold' messages to cheap Three.js effects.
// createFx({THREE,scene,source,camera,mode,quality}) -> {update(dtSec), shakeAmt, setViewport(hPx,fov), stats(), dispose()}
// Scale: sim px * 0.01, sim y -> scene z. Telegraph radii are the true sim radii (m.r, m.len, m.w).
// Draw cost: shapes.js = 1 instanced draw for every ring/flash/streak/hex, particles.js = 1 Points draw, telegraphs = pooled quads.
// Per-skill identity = skill colour + shape by skill type + per-champion FLAIR (secondary colour / particle physics) + projectile head style.
import { createParticles } from './particles.js';
import { createShapes, SH } from './shapes.js';
import { createTelegraphs } from './telegraph.js';
import { createObjects } from './objects.js'; // persistent kit objects + signature cast impact
import { createSprites } from './sprites.js'; // per-skill 2D-parity flipbook sprites (primary skill visual)
import { createKit, resolveSkill, resolveSpell } from './skills/index.js'; // per-skill themed VFX (consulted before the generic kind mapping)
import { CHAMPIONS, parseKitTags } from '../../../shared/moba/champions.js'; // read-only: skill.pierce / champ colour / stance tags

const S = 0.01; // mirrors world scale used by Renderer.js
const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const fin = (...v) => v.every(Number.isFinite);
const SH_BITS = SH.BITS !== undefined ? SH.BITS : SH.PLUS;
const SH_SHARD = SH.SHARD !== undefined ? SH.SHARD : SH.STREAK;
// champion -> secondary colour + particle physics {c2, g: gravity, v: speed mul, up: lift mul, sz: size mul, head: projectile head shape}
const FLAIR = {
  pixel: { c2: 0xff5fa3, g: -2, v: 1, up: 1, sz: 1, head: SH.BLOT }, stack: { c2: 0xb7ff9a, g: -9, v: 0.8, up: 0.6, sz: 1.6, head: SH.BLOT }, ops: { c2: 0xffd23f, g: -3, v: 1.1, up: 1, sz: 1, head: SH.RAYS },
  tester: { c2: 0xfff1b0, g: 0, v: 1.6, up: 0.3, sz: 0.7, head: SH.STREAK }, zero: { c2: 0x2b1a4a, g: 1.5, v: 0.6, up: 1.4, sz: 1.8, head: SH.STREAK }, model: { c2: 0x6cffd6, g: 3, v: 0.8, up: 1.8, sz: 1, head: SH.PLUS },
  guard: { c2: 0xffd23f, g: -4, v: 1, up: 0.8, sz: 1.1, head: SH.HEX }, cleaner: { c2: 0xffffff, g: 1.5, v: 0.6, up: 1.2, sz: 1.9, head: SH.FLASH }, courier: { c2: 0xffffff, g: 0, v: 1.7, up: 0.3, sz: 0.8, head: SH.CHEVRON },
  embedded: { c2: 0xfff35c, g: 0, v: 1.8, up: 1, sz: 0.6, head: SH.RAYS }, dev: { c2: 0x39ff9a, g: 2.5, v: 0.9, up: 1.6, sz: 0.8, head: SH.CHEVRON }, appdev: { c2: 0xffffff, g: 0, v: 1.2, up: 0.6, sz: 1.2, head: SH.RING },
  sprint: { c2: 0xfff2a8, g: -1, v: 1.2, up: 1, sz: 1, head: SH.RAYS }, cache: { c2: 0xc5d0ff, g: 0, v: 1.3, up: 0.4, sz: 0.7, head: SH.CHEVRON }, hr: { c2: 0xfff0e0, g: -2, v: 0.9, up: 1, sz: 1.1, head: SH.PLUS },
  lint: { c2: 0xffe0e0, g: -2, v: 1, up: 1, sz: 0.9, head: SH.PLUS }, barista: { c2: 0x5a3418, g: -9, v: 0.9, up: 0.9, sz: 1.3, head: SH.BLOT }, oncall: { c2: 0xffffff, g: 0, v: 1.4, up: 0.7, sz: 1, head: SH.RING },
};
const FL0 = { c2: 0xffffff, g: -3, v: 1, up: 1, sz: 1, head: SH.STREAK };
// Distinct programmer-themed auto-attack styles for all 18 champions (ranged bolts + melee swings + impact flipbooks)
const ATK_STYLE = {
  // Ranged champions
  pixel:    { head: SH_BITS,    speed: 1650, size: 0.24, tLen: 2.4, tW: 0.75, spin: 5,  mz: SH_BITS,    hitFb: 'vfPixelFire', hitCol: 0xff5fa3, hitSh: SH_BITS,    hitSz: 1.15 },
  ops:      { head: SH.RAYS,    speed: 1600, size: 0.25, tLen: 2.6, tW: 0.85, spin: 6,  mz: SH.RAYS,    hitFb: 'impactGold',  hitCol: 0xffd23f, hitSh: SH.RAYS,    hitSz: 1.15 },
  tester:   { head: SH.STREAK,  speed: 2150, size: 0.20, tLen: 3.8, tW: 0.55, spin: 0,  mz: SH.RING,    hitFb: 'crosshair',   hitCol: 0xff9800, hitSh: SH.PLUS,    hitSz: 1.2  },
  model:    { head: SH.HEX,     speed: 1450, size: 0.26, tLen: 2.2, tW: 0.85, spin: 4,  mz: SH.HEX,     hitFb: 'ringPurple',  hitCol: 0xb084ff, hitSh: SH.HEX,     hitSz: 1.2  },
  embedded: { head: SH.RAYS,    speed: 1900, size: 0.23, tLen: 2.9, tW: 0.65, spin: 10, mz: SH.RAYS,    hitFb: 'vfCharged',   hitCol: 0x00e5ff, hitSh: SH.RAYS,    hitSz: 1.15 },
  appdev:   { head: SH.RING,    speed: 1700, size: 0.24, tLen: 2.3, tW: 0.8,  spin: 4,  mz: SH.RING,    hitFb: 'vfSmallHit',  hitCol: 0xff4fa3, hitSh: SH.RING,    hitSz: 1.1  },
  cache:    { head: SH.CHEVRON, speed: 1950, size: 0.22, tLen: 3.1, tW: 0.65, spin: 0,  mz: SH.CHEVRON, hitFb: 'ringBlue',    hitCol: 0x74c0fc, hitSh: SH.CHEVRON, hitSz: 1.15 },
  hr:       { head: SH.PLUS,    speed: 1500, size: 0.25, tLen: 2.2, tW: 0.85, spin: 5,  mz: SH.PLUS,    hitFb: 'impactGold',  hitCol: 0xffd27a, hitSh: SH.PLUS,    hitSz: 1.1  },
  lint:     { head: SH_SHARD,   speed: 1750, size: 0.23, tLen: 2.9, tW: 0.65, spin: 0,  mz: SH.PLUS,    hitFb: 'ringOrange',  hitCol: 0xff7675, hitSh: SH_SHARD,   hitSz: 1.15 },
  barista:  { head: SH.BLOT,    speed: 1400, size: 0.27, tLen: 2.0, tW: 1.0,  spin: 3,  mz: SH.BLOT,    hitFb: 'impactWater', hitCol: 0xc8864a, hitSh: SH.BLOT,    hitSz: 1.15 },
  // Hybrid stance (Mop: ranged water-wave OR melee cyan sweep)
  cleaner:  { head: SH.BLOT,    speed: 1550, size: 0.25, tLen: 2.3, tW: 0.9,  spin: 3,  mz: SH.RING,    swing: 'sweep',   hitFb: 'impactWater', hitCol: 0x39c2ff, hitSh: SH.CHEVRON, hitSz: 1.2 },
  // Melee champions
  zero:     { swing: 'xcut',    hitFb: 'bloodSlash',  hitCol: 0xb084ff, hitSh: SH.STREAK,  hitSz: 1.25 },
  stack:    { swing: 'cleave',  hitFb: 'impactLeaf',  hitCol: 0x7ed957, hitSh: SH.CHEVRON, hitSz: 1.25 },
  guard:    { swing: 'slam',    hitFb: 'impactGold',  hitCol: 0xffd23f, hitSh: SH.HEX,     hitSz: 1.2  },
  courier:  { swing: 'chevron', hitFb: 'burstOrange', hitCol: 0xff7a1a, hitSh: SH.CHEVRON, hitSz: 1.2  },
  dev:      { swing: 'laptop',  hitFb: 'vfSmallHit',  hitCol: null,     hitSh: SH_BITS,    hitSz: 1.2  },
  sprint:   { swing: 'jab',     hitFb: 'sparkGold',   hitCol: 0xffd23f, hitSh: SH.RAYS,    hitSz: 1.2  },
  oncall:   { swing: 'sonar',   hitFb: 'burstBlood',  hitCol: 0xff5252, hitSh: SH.RING,    hitSz: 1.25 },
};
const QUIET = new Set(['chargeEnd', 'shadowEnd', 'objHeat', 'linkShare', 'ccBlock', 'ccBreak', 'pkg', 'tetherEnd', 'linkEnd', 'objEnd', 'pinBoom']);
const STANCE_COL = { main: 0x5c7cfa, hotfix: 0xff4f8b, feature: 0x39ff9a, mop: 0x39c2ff, bucket: 0xffd23f };
const CC_COL = { charm: 0xff6ec7, fear: 0x9b59b6, taunt: 0xff3b3b, blind: 0x22283a, disarm: 0xff8c42, stun: 0xffe14a, root: 0xffe14a, airborne: 0xffe14a };
const STYLE_PASSTHROUGH = new Set(['obj', 'tether', 'link', 'shadow', 'echo', 'timebox', 'pkg', 'stance', 'reload', 'deliver']);

export function createFx({ THREE, scene, source, camera, mode, quality }) {
  const lite = !(quality && quality.lite === false), Q = quality || {};
  const root = new THREE.Group(); root.name = 'fx'; scene.add(root);
  const parts = createParticles(THREE, scene, Math.min(Q.particles || 600, mode === 'story' ? 1500 : 2500));
  const sh = createShapes(THREE, scene, { cap: Math.max(72, (Q.flips || 18) * 4) + 90 });
  const tg = createTelegraphs(THREE, scene, { cap: Q.teles || 10, S });
  const bolts = [], objs = [], nums = [], numFree = [], numTex = new Map(), ccs = [], zones = [];
  const MAX_BOLTS = lite ? 24 : 60, MAX_NUMS = lite ? 10 : 24;
  let shake = 0, disposed = false;

  const lights = []; for (let i = 0; i < (lite ? 0 : 3); i++) { const l = new THREE.PointLight(0xffffff, 0, 6, 1.6); l.userData = { t: 0, dur: 1, peak: 0 }; root.add(l); lights.push(l); }
  function light(x, y, z, color, peak, dur) {
    if (!lights.length) return;
    let l = lights[0]; for (const k of lights) if (k.intensity < l.intensity) l = k;
    l.position.set(x, y, z); l.color.set(color); l.userData = { t: 0, dur, peak }; l.intensity = peak;
  }
  const addShake = (a) => { shake = Math.min(0.35, shake + a); };

  function ent(id) {
    const st = source.state(); if (!st || id == null) return null;
    return (st.champions && st.champions.get(id)) || (st.units && st.units.get(id)) || (st.structures && st.structures.get(id)) || null;
  }
  const pos = (id) => { const e = ent(id); return e && fin(e.x, e.y) ? { x: e.x, y: e.y } : null; };
  const flairOf = (sid) => { const c = ent(sid); return (c && c.champ && FLAIR[c.champ]) || FL0; };
  const mix = (a, b) => (rnd() < 0.5 ? a : b);
  const kit = createKit({ sh, parts, SH, S, rnd, mix, lite, pos });
  const spr = createSprites({ THREE, scene, S, lite, ent, pos, source });
  const objects = createObjects({ THREE, scene, source, sh, SH, tg, S, ent, CHAMPIONS, addShake, flair: (sid) => flairOf(sid).c2 });
  const styleOf = (m) => { if (!m || !m.sid || !m.slot) return null; const c = ent(m.sid); return (c && c.champ && resolveSkill(c.champ, m.slot)) || null; };
  const castStyle = (st, m) => { if (!st || !st.cast) return false; try { return st.cast(kit, m) === true; } catch (_) { return false; } };
  const landStyle = (st, m, x, y) => { if (st && st.land) { try { st.land(kit, m, x, y); } catch (_) { /* style bug must never break fx */ } } };

  // champion-flavoured particle burst (physics + secondary colour from FLAIR)
  function pburst(wx, wy, wz, color, fl, n, speed, size, life) {
    for (let i = 0; i < n; i++) { const a = rnd(6.283), s = rnd(0.3, 1) * speed * fl.v; parts.puff(wx, wy, wz, Math.cos(a) * s, (rnd(0.2, 1) * 1.6 * fl.up + 0.4), Math.sin(a) * s, rnd(0.6, 1) * life, rnd(0.6, 1.2) * size * fl.sz, mix(color, fl.c2), 1, fl.g, 1.2); }
  }

  // bolts: persistent shape (streak + champion head shape) + particle glow head + trail. No draw calls of their own.
  function bolt({ x, y, dx, dy, speed, range, color, size = 0.3, z = 0.75, tx, onEnd, pierce = false, sid = '', fl = FL0, small = false, sprM = null, headType = null, headCol = null, headSz = 1.2, tailLen = null, tailW = 0.8, spin = 6, trail = null }) {
    if (bolts.length >= MAX_BOLTS) { onEnd && onEnd(x + dx * range, y + dy * range); return; }
    const rot = Math.atan2(dy, dx), tMul = tailLen || (small ? 2.2 : 3.4);
    const tail = sh.add({ type: SH.STREAK, x: x * S, y: y * S, z: 0.5, rot, sx: size * tMul, sz: size * tailW, color, alpha: 0.95, dur: 0, prio: 0 });
    const hType = headType !== null ? headType : (small ? null : fl.head);
    const head = hType === null ? null : sh.add({ type: hType, x: x * S, y: y * S, z: 0.55, rot, sx: size * headSz, sz: size * headSz, color: headCol !== null ? headCol : fl.c2, alpha: 0.88, dur: 0, prio: 0 });
    const ob = { t: 0, x, y, dx, dy, speed, T: range / speed, color, size, z, tx, onEnd, pierce, sid, tail, head, fl, small, spr: null, tMul, spin, trail: trail !== null ? trail : !small };
    if (sprM) ob.spr = spr.head(sprM, color, sprM.width, () => ob);
    bolts.push(ob);
  }
  function stepBolts(dt) {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const o = bolts[i]; o.t += dt; let alive = true;
      if (o.tx !== undefined) {
        const e = pos(o.tx), px = e ? e.x : o.x, py = e ? e.y : o.y, vx = px - o.x, vy = py - o.y, d = Math.hypot(vx, vy) || 1, st = o.speed * dt;
        if (d <= st + 20 || o.t > 3) { o.onEnd && o.onEnd(px, py); alive = false; } else { o.dx = vx / d; o.dy = vy / d; o.x += o.dx * st; o.y += o.dy * st; }
      } else { o.x += o.dx * o.speed * dt; o.y += o.dy * o.speed * dt; if (o.t >= o.T) { o.onEnd && o.onEnd(o.x, o.y); alive = false; } }
      if (alive) {
        const wx = o.x * S, wz = o.y * S, rot = Math.atan2(o.dy, o.dx), back = o.size * (o.tMul * 0.72);
        sh.set(o.tail, wx - o.dx * back, wz - o.dy * back, 0.5, rot);
        if (o.head) sh.set(o.head, wx, wz, 0.55, rot + o.t * o.spin);
        parts.puff(wx, o.z, wz, 0, 0, 0, 0.07, o.size * (o.small ? 2.2 : 3.2), o.color, 1, 0, 0); // glow head (billboard point)
        if (!o.small) parts.puff(wx, o.z, wz, 0, 0, 0, 0.07, o.size * 1.1, 0xffffff, 1, 0, 0); // hot core
        if (o.trail && (!lite || !o.small)) parts.puff(wx - o.dx * 0.12 + rnd(-0.06, 0.06), o.z + rnd(-0.06, 0.1), wz - o.dy * 0.12 + rnd(-0.06, 0.06), rnd(-0.2, 0.2), o.fl.g * -0.05, rnd(-0.2, 0.2), rnd(0.24, 0.44), o.size * rnd(0.85, 1.4) * o.fl.sz, mix(o.color, o.fl.c2), 0.9, o.fl.g * 0.4, 1.5);
      } else { if (o.spr) o.spr.kill = true; sh.kill(o.tail); sh.kill(o.head); bolts[i] = bolts[bolts.length - 1]; bolts.pop(); }
    }
  }

  // floating numbers & world labels (sprite pool, cached text textures)
  function numberTex(txt, color) {
    const key = txt + color; let t = numTex.get(key);
    if (!t) {
      const wide = txt.length > 5;
      const w = wide ? 256 : 128, h = 64;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
      g.font = (wide ? 'bold 30px ' : 'bold 44px ') + '"Segoe UI", Arial, "Segoe UI Emoji"';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = wide ? 6 : 7; g.strokeStyle = '#000';
      g.strokeText(txt, w / 2, 34); g.fillStyle = color; g.fillText(txt, w / 2, 34);
      t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      if (numTex.size > 120) { for (const o of numTex.values()) o.dispose(); numTex.clear(); for (const n of nums) n.sp.material.map = null; }
      numTex.set(key, t);
    }
    return t;
  }
  function floatNumber(x, y, z, txt, color) {
    if (nums.length >= MAX_NUMS) return;
    const sp = numFree.pop() || (() => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, toneMapped: false })); s.renderOrder = 60; return s; })();
    const bw = txt.length > 5 ? 1.85 : 0.9;
    sp.material.map = numberTex(txt, color); sp.material.needsUpdate = true; sp.material.opacity = 1; sp.scale.set(bw, 0.45, 1); sp.position.set(x, z, y); root.add(sp);
    nums.push({ sp, t: 0, vx: rnd(-0.3, 0.3), bw });
  }
  function stepNums(dt) {
    for (let i = nums.length - 1; i >= 0; i--) {
      const n = nums[i]; n.t += dt;
      if (n.t >= 1) { root.remove(n.sp); numFree.push(n.sp); nums[i] = nums[nums.length - 1]; nums.pop(); continue; }
      n.sp.position.y += dt * 1.1 * (1 - n.t); n.sp.position.x += n.vx * dt; n.sp.material.opacity = 1 - Math.max(0, (n.t - 0.55) / 0.45);
      const s = 1 + Math.max(0, 0.35 - n.t) * 2; n.sp.scale.set((n.bw || 0.9) * s, 0.45 * s, 1);
    }
  }

  // shared effects (all sizes in scene units)
  function impact(x, y, color, size = 1, big = false, fl = FL0) {
    const wx = x * S, wz = y * S, r = size * (big ? 1.5 : 0.9);
    sh.add({ type: SH.FLASH, x: wx, y: wz, z: 0.6, sx: r, dur: big ? 0.35 : 0.24, color: 0xffffff, alpha: 0.9, prio: big ? 1 : 0 });
    sh.add({ type: SH.RAYS, x: wx, y: wz, z: 0.62, sx: r * 1.3, rot: rnd(3), dur: big ? 0.4 : 0.28, color, prio: big ? 1 : 0 });
    if (big) sh.add({ type: SH.RING, x: wx, y: wz, sx: r * 1.5, dur: 0.4, color });
    pburst(wx, 0.6, wz, color, fl, big ? 18 : 8, big ? 3.4 : 2.2, 0.11, 0.5);
    light(wx, 1.0, wz, color, big ? 14 : 6, 0.25);
  }
  // basic-attack / minion / structure hits: one muted coloured flash, no sparks, no light
  function quietHit(x, y, color, size = 0.5) { sh.add({ type: SH.FLASH, x: x * S, y: y * S, z: 0.6, sx: size, dur: 0.16, color, alpha: 0.6, prio: 0 }); }
  function beam(x0, y0, x1, y1, color, h = 0.9, n = 20, jitter = 0.06) {
    const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0) * S;
    sh.add({ type: SH.STREAK, x: ((x0 + x1) / 2) * S, y: ((y0 + y1) / 2) * S, z: h, rot: a, sx: L / 2, sz: 0.16, dur: 0.3, color, prio: 1 });
    for (let i = 0; i <= n; i++) { const t = i / n; parts.puff((x0 + (x1 - x0) * t) * S + rnd(-jitter, jitter), h + Math.sin(t * 3.14) * 0.2, (y0 + (y1 - y0) * t) * S + rnd(-jitter, jitter), 0, rnd(-0.1, 0.4), 0, 0.28 + t * 0.2, 0.16, color, 1, 0, 3); }
  }
  function ringAt(x, y, color, size = 1.6, dur = 0.45, alpha = 1, follow = null, type = SH.RING) { sh.add({ type, x: x * S, y: y * S, sx: size, dur, color, alpha, follow }); }
  function teleport(x, y, color) {
    sh.add({ type: SH.FLASH, x: x * S, y: y * S, z: 0.6, sx: 1.1, dur: 0.35, color: 0xffffff }); sh.add({ type: SH.RING, x: x * S, y: y * S, sx: 1.2, dur: 0.4, color }); sh.add({ type: SH.RAYS, x: x * S, y: y * S, z: 0.6, sx: 1.2, dur: 0.4, color });
    parts.burst(x * S, 0.3, y * S, color, 14, 2.4, 0.12, 0.5);
  }
  function dashTrail(x0, y0, x1, y1, color, fl = FL0) {
    const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0) * S, mx = ((x0 + x1) / 2) * S, my = ((y0 + y1) / 2) * S;
    sh.add({ type: SH.STREAK, x: mx, y: my, z: 0.5, rot: a, sx: L / 2 + 0.2, sz: 0.55, dur: 0.38, color });
    sh.add({ type: SH.STREAK, x: mx, y: my, z: 0.52, rot: a, sx: L / 2, sz: 0.25, dur: 0.3, color: 0xffffff, alpha: 0.8 });
    const n = 16; for (let i = 0; i <= n; i++) { const t = i / n; parts.puff((x0 + (x1 - x0) * t) * S, 0.4 + rnd(0.5), (y0 + (y1 - y0) * t) * S, rnd(-0.3, 0.3), rnd(0, 0.5), rnd(-0.3, 0.3), 0.25 + 0.4 * t, 0.2 * fl.sz, mix(color, fl.c2), 0.9, fl.g * 0.3, 3); }
  }
  function circleBurst(x, y, R, col, fl) {
    const wx = x * S, wz = y * S;
    sh.add({ type: SH.RING, x: wx, y: wz, sx: R * 1.05, dur: 0.5, color: col });
    sh.add({ type: SH.RING, x: wx, y: wz, sx: R * 0.7, dur: 0.4, delay: 0.06, color: fl.c2, alpha: 0.8 });
    sh.add({ type: SH.FLASH, x: wx, y: wz, z: 0.5, sx: Math.max(0.8, R * 0.9), dur: 0.4, color: col });
    sh.add({ type: SH.RAYS, x: wx, y: wz, z: 0.55, sx: Math.max(0.9, R), rot: rnd(3), dur: 0.5, color: fl.c2 });
    pburst(wx, 0.3, wz, col, fl, Math.min(30, 12 + Math.round(R * 12)), R * 3, 0.12, 0.7);
    light(wx, 1.2, wz, col, 12, 0.3); addShake(R > 1.4 ? 0.12 : 0.05);
  }

  // 'fx' kinds
  function onFx(m) {
    if (disposed || !m || typeof m !== 'object') return;
    const col = Number.isFinite(m.color) ? m.color : 0x39c2ff, fl = flairOf(m.sid), st = m.k === 'spell' ? null : styleOf(m);
    try { spr.cast(m, col); } catch (_) { /* sprite bug must never break fx */ }
    try { objects.cast(m, col); } catch (_) { /* cast impact must never break fx */ }
    const objHandled = objects.onFx(m); // persistent kit objects (wall/portal/pin/shadow/tether/link/...) are owned by objects.js
    if (m.k === 'spell') { const ss = resolveSpell(m.spell); if (ss && fin(m.x0, m.y0) && castStyle(ss, m)) return; }
    else if (st && m.k !== 'cc') {
      if (objHandled) { if (STYLE_PASSTHROUGH.has(m.k)) castStyle(st, m); return; }
      if (castStyle(st, m)) return;
    }
    if (objHandled) return;
    switch (m.k) {
      case 'proj': {
        if (!fin(m.x, m.y, m.dx, m.dy)) return;
        const c = ent(m.sid), sk = c && CHAMPIONS[c.champ] && CHAMPIONS[c.champ].skills && CHAMPIONS[c.champ].skills[m.slot];
        bolt({ x: m.x, y: m.y, dx: m.dx, dy: m.dy, speed: m.speed || 1200, range: m.range || 800, color: col, size: Math.max(0.28, Math.min(0.6, (m.width || 60) * S * 0.55)), pierce: !!(sk && sk.pierce), sid: m.sid, fl, sprM: m.slot ? m : null, onEnd: (x, y) => { impact(x, y, col, 0.9, false, fl); if (m.slot) spr.hit(x, y, col, false); landStyle(st, m, x, y); } });
        if (m.slot && m.range) kit.line(m.x, m.y, m.dx, m.dy, m.range, m.width || 60, col); // true range/width flash
        ringAt(m.x, m.y, col, 0.7, 0.25); light(m.x * S, 1, m.y * S, col, 5, 0.2); break;
      }
      case 'circle': {
        if (!fin(m.x, m.y)) return; const R = (m.r || 100) * S, delay = (m.delay || 0) / 1000;
        if (delay > 0.04) tg.tele({ x: m.x, y: m.y, mode: 0, a: R, ext: R * 1.1, color: col, delay, onEnd: () => { circleBurst(m.x, m.y, R, col, fl); landStyle(st, m, m.x, m.y); } }); else { circleBurst(m.x, m.y, R, col, fl); landStyle(st, m, m.x, m.y); } break;
      }
      case 'zone': {
        if (!fin(m.x, m.y)) return; const R = (m.r || 100) * S, life = (m.ms || 3000) / 1000;
        const t = tg.tele({ x: m.x, y: m.y, mode: 1, a: R, ext: R * 1.1, color: col, life, tid: m.tid }); if (!t) return;
        zones.push({ x: m.x, y: m.y, R, col, fl, tick: (m.tickMs || 800) / 1000, acc: 0, left: life, tid: m.tid }); break;
      }
      case 'trapEnd': tg.end(m.tid); for (let i = zones.length - 1; i >= 0; i--) if (zones[i].tid === m.tid) { zones[i] = zones[zones.length - 1]; zones.pop(); } break;
      case 'area': {
        const len = (m.len || 600) * S, ang = Number.isFinite(m.a) ? m.a : 0, wd = ((m.w || m.width || m.thick || 140) * S) / 2, half = Math.min(Math.PI, Number.isFinite(m.ang) ? m.ang * 0.5 : (m.half ?? m.arc ?? 0.55));
        const cone = m.shape === 'cone' || m.shape === 'arc';
        tg.tele({ x: m.x, y: m.y, mode: cone ? 3 : 2, a: len, b: cone ? half : wd, ext: len * 1.05, rot: -ang, color: col, delay: Math.max(0.15, (m.delay || 0) / 1000), onEnd: () => {
          const ox = m.x * S, oz = m.y * S, cx = Math.cos(ang), cz = Math.sin(ang);
          if (cone) { for (let k = 1; k <= 3; k++) sh.add({ type: SH.CHEVRON, x: ox + cx * len * k * 0.3, y: oz + cz * len * k * 0.3, z: 0.5, rot: ang, sx: len * 0.22 * (0.6 + k * 0.25), sz: len * 0.22 * k * 0.6, dur: 0.35, delay: k * 0.04, color: k % 2 ? col : fl.c2 }); }
          else { sh.add({ type: SH.STREAK, x: ox + cx * len * 0.5, y: oz + cz * len * 0.5, z: 0.5, rot: ang, sx: len * 0.5, sz: Math.max(0.3, wd), dur: 0.35, color: col }); sh.add({ type: SH.STREAK, x: ox + cx * len * 0.5, y: oz + cz * len * 0.5, z: 0.52, rot: ang, sx: len * 0.5, sz: Math.max(0.15, wd * 0.4), dur: 0.28, color: 0xffffff, alpha: 0.8 }); }
          sh.add({ type: SH.RAYS, x: ox + cx * len * 0.85, y: oz + cz * len * 0.85, z: 0.5, sx: Math.max(0.8, wd * 1.2), dur: 0.35, color: fl.c2 });
          for (let i = 0; i < 20; i++) { const t = Math.random(); parts.puff(ox + cx * len * t + rnd(-wd, wd) * 0.6, 0.4, oz + cz * len * t + rnd(-wd, wd) * 0.6, cx * 3, rnd(0.3, 1.5), cz * 3, 0.5, 0.16 * fl.sz, mix(col, fl.c2), 1, fl.g, 1); }
          light(ox + cx * len * 0.5, 1, oz + cz * len * 0.5, col, 10, 0.25); addShake(0.08); landStyle(st, m, m.x + Math.cos(ang) * len / S * 0.5, m.y + Math.sin(ang) * len / S * 0.5);
        } }); break;
      }
      case 'dash': if (fin(m.x0, m.y0, m.x1, m.y1)) { dashTrail(m.x0, m.y0, m.x1, m.y1, col, fl); ringAt(m.x1, m.y1, col, 1.4, 0.4); sh.add({ type: SH.RAYS, x: m.x1 * S, y: m.y1 * S, z: 0.5, sx: 1.1, dur: 0.3, color: fl.c2 }); addShake(0.03); } break;
      case 'blink': case 'tp': {
        if (fin(m.x0, m.y0)) teleport(m.x0, m.y0, col); if (fin(m.x1, m.y1)) teleport(m.x1, m.y1, col); break;
      }
      case 'rewind': {
        const rc = Number.isFinite(m.color) ? m.color : 0xb084ff, list = Array.isArray(m.list) ? m.list : [];
        for (const e of list.slice(0, 8)) { if (!e) continue; if (fin(e.x0, e.y0)) teleport(e.x0, e.y0, rc); if (fin(e.x1, e.y1)) { teleport(e.x1, e.y1, rc); ringAt(e.x1, e.y1, rc, 2.0, 0.6); } if (fin(e.x0, e.y0, e.x1, e.y1) && Math.hypot(e.x1 - e.x0, e.y1 - e.y0) > 20) dashTrail(e.x0, e.y0, e.x1, e.y1, rc, fl); }
        if (!list.length && fin(m.x, m.y)) ringAt(m.x, m.y, rc, 2.4, 0.6); break;
      }
      case 'spell': {
        if (!fin(m.x0, m.y0)) return;
        const c = Number.isFinite(m.color) ? m.color : 0xffffff;
        if (m.spell === 'flash' || fin(m.x1, m.y1)) { teleport(m.x0, m.y0, c); if (fin(m.x1, m.y1)) teleport(m.x1, m.y1, c); }
        else { ringAt(m.x0, m.y0, c, 1.8, 0.5); sh.add({ type: SH.HEX, x: m.x0 * S, y: m.y0 * S, sx: 1.3, dur: 0.6, color: c }); parts.burst(m.x0 * S, 0.3, m.y0 * S, c, 14, 2, 0.1, 0.5); } break;
      }
      case 'hit': {
        const p = pos(m.id); if (!p) return; if (m.id && ent(m.id) && ent(m.id).champ) { impact(p.x, p.y, col, 0.8, false, fl); spr.hit(p.x, p.y, col, false); } else quietHit(p.x, p.y, col, 0.6);
        for (let i = 0; i < bolts.length; i++) { const o = bolts[i]; if (!o.pierce && o.sid && o.tx === undefined && Math.hypot(o.x - p.x, o.y - p.y) < 90 && o.color === col) { o.onEnd = null; o.T = 0; break; } } break;
      }
      case 'tgt': if (fin(m.x0, m.y0, m.x1, m.y1)) { beam(m.x0, m.y0, m.x1, m.y1, col); impact(m.x1, m.y1, col, 1.1, true, fl); landStyle(st, m, m.x1, m.y1); } break;
      case 'zap': if (fin(m.x0, m.y0, m.x1, m.y1)) { beam(m.x0, m.y0, m.x1, m.y1, col, 1.0, 16, 0.12); impact(m.x1, m.y1, col, 0.6, false, fl); } break;
      case 'buff': case 'heal': {
        const id = m.sid || m.id, p = pos(id) || (fin(m.x, m.y) ? { x: m.x, y: m.y } : null); if (!p) return;
        const heal = m.k === 'heal', c = heal ? 0x7ed957 : col, fo = id ? () => pos(id) : null;
        sh.add({ type: heal ? SH.PLUS : SH.HEX, x: p.x * S, y: p.y * S, z: 0.1, sx: heal ? 1.0 : 1.2, dur: 0.7, color: c, follow: fo });
        sh.add({ type: SH.RING, x: p.x * S, y: p.y * S, sx: 1.3, dur: 0.55, color: c, follow: fo });
        for (let i = 0; i < 12; i++) { const a = rnd(6.283), r = rnd(0.2, 0.55); parts.puff(p.x * S + Math.cos(a) * r, 0.1, p.y * S + Math.sin(a) * r, 0, rnd(0.8, 1.8), 0, rnd(0.6, 1), 0.12, c, 1, 0, 0.3); } break;
      }
      case 'cc': {
        const ms = Math.min(1.8, (m.ms || 800) / 1000), ty = m.type || 'stun', ccCol = CC_COL[ty] ?? 0xffe14a; let o = null; for (const k of ccs) if (k.id === m.id) { o = k; break; }
        if (o) { o.left = Math.max(o.left, ms); o.col = ccCol; o.type = ty; } else if (ccs.length < 12) ccs.push({ id: m.id, left: ms, ph: rnd(6), col: ccCol, type: ty });
        const vp = pos(m.id);
        if (vp) {
          if (ty === 'charm' || ty === 'taunt') { ringAt(vp.x, vp.y, ccCol, 1.5, 0.5); const sp = m.sid ? pos(m.sid) : null; if (sp) beam(vp.x, vp.y, sp.x, sp.y, ccCol, 0.9, 12, 0.05); }
          else if (ty === 'fear') { ringAt(vp.x, vp.y, ccCol, 1.6, 0.55); sh.add({ type: SH.BLOT, x: vp.x * S, y: vp.y * S, z: 0.12, sx: 1.3, dur: 0.55, color: 0x2b1a4a, alpha: 0.8 }); }
          else if (ty === 'blind') { ringAt(vp.x, vp.y, ccCol, 1.4, 0.5, 0.9); parts.burst(vp.x * S, 1.1, vp.y * S, ccCol, 10, 1.4, 0.16, 0.55); }
          else if (ty === 'disarm') ringAt(vp.x, vp.y, ccCol, 1.4, 0.45);
          else ringAt(vp.x, vp.y, ccCol, 1.3, 0.4, 0.8);
        }
        break;
      }
      case 'knock': if (fin(m.x0, m.y0)) { impact(m.x0, m.y0, 0xffffff, 0.8); if (fin(m.x1, m.y1)) dashTrail(m.x0, m.y0, m.x1, m.y1, 0xffffff); } break;
      case 'revive': case 'untarget': if (fin(m.x, m.y)) { sh.add({ type: SH.FLASH, x: m.x * S, y: m.y * S, z: 0.8, sx: 1.6, dur: 0.8, color: col }); ringAt(m.x, m.y, col, 1.8, 0.7); sh.add({ type: SH.PLUS, x: m.x * S, y: m.y * S, sx: 1.0, dur: 0.8, color: 0xffffff }); } break;
      case 'shot': case 'petatk': {
        const a = m.k === 'shot' ? { x: m.x, y: m.y } : pos(m.id), b = m.k === 'shot' ? { x: m.tx, y: m.ty } : pos(m.t); if (!a || !b || !fin(a.x, a.y, b.x, b.y)) return;
        const owner = m.k === 'petatk' ? ent((ent(m.id) || {}).owner) : null, c = Number.isFinite(m.color) ? m.color : (owner && CHAMPIONS[owner.champ] && CHAMPIONS[owner.champ].color) || 0x00e5ff;
        const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        bolt({ x: a.x, y: a.y, dx: (b.x - a.x) / d, dy: (b.y - a.y) / d, speed: 1800, range: d, color: c, size: 0.2, small: true, onEnd: (x, y) => quietHit(x, y, c, 0.5) }); break;
      }
      case 'obj': if (fin(m.x, m.y)) { // placed object (turret, pin, ward, portal, wall...): deploy flash + footprint that lasts the object's life
        const R = Math.max(0.8, (m.r || 70) * S), life = Math.min(8, Math.max(0.9, (m.ms || 0) / 1000 || 0.9)); sh.add({ type: SH.FLASH, x: m.x * S, y: m.y * S, z: 0.5, sx: 1.1, dur: 0.4, color: 0xffffff }); parts.burst(m.x * S, 0.3, m.y * S, col, 12, 2, 0.12, 0.5);
        if (fin(m.x2, m.y2)) { // wall / fence between two points: glowing beam + end posts
          const a = Math.atan2(m.y2 - m.y, m.x2 - m.x), L = Math.hypot(m.x2 - m.x, m.y2 - m.y) * S, mx = ((m.x + m.x2) / 2) * S, my = ((m.y + m.y2) / 2) * S, w = Math.max(0.16, (m.thick || 46) * S * 0.6);
          const h1 = sh.add({ type: SH.STREAK, x: mx, y: my, z: 0.45, rot: a, sx: L / 2, sz: w, color: col, alpha: 0.9, dur: 0, prio: 1 }), h2 = sh.add({ type: SH.STREAK, x: mx, y: my, z: 0.46, rot: a + Math.PI, sx: L / 2, sz: w, color: col, alpha: 0.9, dur: 0, prio: 1 });
          const h3 = sh.add({ type: SH.HEX, x: m.x * S, y: m.y * S, z: 0.47, sx: 0.5, dur: 0, color: 0xffffff, prio: 1 }), h4 = sh.add({ type: SH.HEX, x: m.x2 * S, y: m.y2 * S, z: 0.47, sx: 0.5, dur: 0, color: 0xffffff, prio: 1 });
          objs.push({ hs: [h1, h2, h3, h4], left: life, x: m.x, y: m.y, x2: m.x2, y2: m.y2, col, acc: 0 });
        } else { const h = sh.add({ type: SH.HEX, x: m.x * S, y: m.y * S, z: 0.1, sx: Math.min(2.2, R), dur: 0, color: col, alpha: 0.8, prio: 1 }); if (h) objs.push({ hs: [h], left: Math.min(life, 5), x: m.x, y: m.y, col, acc: 0 }); }
      } break;
      case 'gping': if (fin(m.x0, m.y0, m.x1, m.y1)) {
        const a = Math.atan2(m.y1 - m.y0, m.x1 - m.x0), L = Math.hypot(m.x1 - m.x0, m.y1 - m.y0) * S, dur = Math.max(0.45, (m.ms || 800) / 1000);
        const mx = ((m.x0 + m.x1) / 2) * S, mz = ((m.y0 + m.y1) / 2) * S;
        sh.add({ type: SH.STREAK, x: mx, y: mz, z: 0.12, rot: a, sx: L / 2, sz: 0.45, dur, color: 0xff3b3b, alpha: 0.78 });
        sh.add({ type: SH.STREAK, x: mx, y: mz, z: 0.13, rot: a + Math.PI, sx: L / 2, sz: 0.45, dur, color: 0xff3b3b, alpha: 0.78 });
        ringAt(m.x0, m.y0, 0xff3b3b, 1.8, dur, 0.85); ringAt(m.x1, m.y1, 0xff3b3b, 2.2, dur, 0.9);
      } break;
      case 'deliver': {
        const a = fin(m.x0, m.y0) ? { x: m.x0, y: m.y0 } : pos(m.sid);
        const b = fin(m.x1, m.y1) ? { x: m.x1, y: m.y1 } : (pos(m.tid || m.to) || (fin(m.x, m.y) ? { x: m.x, y: m.y } : a));
        if (a && b) {
          if (Math.hypot(b.x - a.x, b.y - a.y) > 20) dashTrail(a.x, a.y, b.x, b.y, 0xffd23f, fl);
          ringAt(b.x, b.y, 0xffd23f, 2.0, 0.55);
          sh.add({ type: SH.FLASH, x: b.x * S, y: b.y * S, z: 0.8, sx: 1.3, dur: 0.3, color: 0xfff3a8 });
          parts.burst(b.x * S, 0.6, b.y * S, 0xffd23f, 16, 2.8, 0.13, 0.55);
          addShake(0.05);
        }
        break;
      }
      case 'serve': {
        const p = fin(m.x, m.y) ? { x: m.x, y: m.y } : pos(m.sid); if (!p) return;
        const sc = Number.isFinite(m.color) ? m.color : 0xffd27a;
        ringAt(p.x, p.y, sc, 2.2, 0.6);
        sh.add({ type: SH.RING, x: p.x * S, y: p.y * S, z: 0.25, sx: 1.4, dur: 0.5, color: 0xfff2cc, alpha: 0.8 });
        for (let i = 0; i < 14; i++) { const a = rnd(6.283), r = rnd(0.2, 0.8); parts.puff(p.x * S + Math.cos(a) * r, 0.2, p.y * S + Math.sin(a) * r, 0, rnd(1.0, 2.2), 0, rnd(0.5, 0.9), 0.15, mix(sc, 0xfff2cc), 0.9, 0, 0.4); }
        break;
      }
      case 'stance': {
        const p = pos(m.sid) || (fin(m.x, m.y) ? { x: m.x, y: m.y } : null); if (!p) return;
        const sc = (m.stance && STANCE_COL[m.stance]) || (Number.isFinite(m.color) ? m.color : col);
        ringAt(p.x, p.y, sc, 1.9, 0.48);
        sh.add({ type: SH.HEX, x: p.x * S, y: p.y * S, z: 0.1, sx: 1.25, dur: 0.5, color: sc });
        parts.burst(p.x * S, 0.5, p.y * S, sc, 12, 2.2, 0.12, 0.45);
        break;
      }
      case 'suppress': {
        const p = pos(m.tid) || (fin(m.x, m.y) ? { x: m.x, y: m.y } : null);
        if (p) { ringAt(p.x, p.y, 0xd63031, 1.7, 0.45); sh.add({ type: SH.FLASH, x: p.x * S, y: p.y * S, z: 0.8, sx: 1.1, dur: 0.2, color: 0xff4f5f }); }
        break;
      }
      case 'suppressEnd': {
        const p = pos(m.tid) || pos(m.sid) || (fin(m.x, m.y) ? { x: m.x, y: m.y } : null); if (!p) return;
        if (m.why === 'done') {
          impact(p.x, p.y, 0xd63031, 1.2, true, fl);
          sh.add({ type: SH.STREAK, x: p.x * S, y: p.y * S, z: 0.75, rot: 0.78, sx: 1.3, sz: 0.25, dur: 0.3, color: 0xff2e4c });
          sh.add({ type: SH.STREAK, x: p.x * S, y: p.y * S, z: 0.76, rot: -0.78, sx: 1.3, sz: 0.25, dur: 0.3, color: 0xff2e4c });
          addShake(0.1);
        } else {
          ringAt(p.x, p.y, 0xff4f5f, 1.5, 0.35);
          sh.add({ type: SH.RAYS, x: p.x * S, y: p.y * S, z: 0.7, sx: 1.2, dur: 0.3, color: 0xff6b6b });
          parts.burst(p.x * S, 0.7, p.y * S, 0xff4f5f, 12, 2.6, 0.12, 0.45);
        }
        break;
      }
      case 'timeboxEnd': {
        const p = pos(m.sid) || (fin(m.x, m.y) ? { x: m.x, y: m.y } : null); if (!p) return;
        ringAt(p.x, p.y, 0xffd23f, 2.2, 0.55);
        sh.add({ type: SH.FLASH, x: p.x * S, y: p.y * S, z: 0.7, sx: 1.4, dur: 0.3, color: 0xffe066 });
        parts.burst(p.x * S, 0.5, p.y * S, 0xffd23f, 14, 2.6, 0.12, 0.5);
        break;
      }
      case 'echoFire': {
        const p = pos(m.sid) || (fin(m.x, m.y) ? { x: m.x, y: m.y } : null); if (!p) return;
        ringAt(p.x, p.y, 0x74c0fc, 2.0, 0.45);
        sh.add({ type: SH.RAYS, x: p.x * S, y: p.y * S, z: 0.8, sx: 1.5, dur: 0.35, color: 0x91a7ff });
        parts.burst(p.x * S, 0.6, p.y * S, 0x91a7ff, 12, 2.4, 0.11, 0.45);
        break;
      }
      case 'reloadEnd': {
        const p = pos(m.sid) || (fin(m.x, m.y) ? { x: m.x, y: m.y } : null); if (!p) return;
        if (m.perfect || m.ok) {
          sh.add({ type: SH.FLASH, x: p.x * S, y: p.y * S, z: 0.9, sx: 1.5, dur: 0.25, color: 0xfff3a8 });
          ringAt(p.x, p.y, 0xffd23f, 2.0, 0.5);
          parts.burst(p.x * S, 0.7, p.y * S, 0xffd23f, 14, 2.6, 0.11, 0.45);
        } else {
          ringAt(p.x, p.y, 0xff8c42, 1.3, 0.35, 0.8);
          parts.burst(p.x * S, 0.7, p.y * S, 0xff8c42, 8, 2.0, 0.1, 0.35);
        }
        break;
      }
      case 'miss': {
        const p = pos(m.id || m.tid) || (fin(m.x, m.y) ? { x: m.x, y: m.y } : null); if (!p) return;
        sh.add({ type: SH.RING, x: p.x * S, y: p.y * S, z: 1.1, sx: 0.75, dur: 0.28, color: 0xadb5bd, alpha: 0.7 });
        floatNumber(p.x * S, p.y * S, 1.85, 'MISS', '#ced4da');
        break;
      }
      default:
        if (QUIET.has(m.k)) return;
        if (fin(m.x, m.y)) ringAt(m.x, m.y, col, 1.3, 0.45, 0.8);
        else if (fin(m.x1, m.y1)) ringAt(m.x1, m.y1, col, 1.3, 0.45, 0.8);
        else if (m.sid) { const p = pos(m.sid); if (p) ringAt(p.x, p.y, col, 1.2, 0.45, 0.8); }
    }
  }
  function stepZones(dt) {
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i]; z.left -= dt; if (z.left <= 0) { zones[i] = zones[zones.length - 1]; zones.pop(); continue; }
      z.acc += dt; if (z.acc >= z.tick) { z.acc = 0; ringAt(z.x, z.y, z.col, z.R * 1.1, 0.5, 0.6); }
      if (Math.random() < dt * 14) { const a = rnd(6.283), r = Math.sqrt(Math.random()) * z.R * 0.9; parts.puff(z.x * S + Math.cos(a) * r, 0.05, z.y * S + Math.sin(a) * r, 0, rnd(0.5, 1.2) * z.fl.up, 0, rnd(0.6, 1.1), 0.12 * z.fl.sz, mix(z.col, z.fl.c2), 0.9, 0, 0); }
    }
  }
  function stepObjs(dt) {
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i]; o.left -= dt; if (o.left <= 0) { for (const h of o.hs) sh.kill(h); objs[i] = objs[objs.length - 1]; objs.pop(); continue; }
      o.acc += dt; if (o.acc > 0.12 && o.x2 !== undefined) { o.acc = 0; const t = Math.random(); parts.puff((o.x + (o.x2 - o.x) * t) * S, 0.3 + rnd(0.6), (o.y + (o.y2 - o.y) * t) * S, 0, rnd(0.3, 1), 0, 0.5, 0.14, o.col, 1, 0, 0.5); }
      const k = o.left < 0.4 ? o.left / 0.4 : 1; for (const h of o.hs) if (h) h.a = 0.9 * k; // fade the last 0.4 s
    }
  }
  // damage / heal numbers + level-up / respawn VFX derived from state transitions: polled at 10 Hz over champions + units
  const hpSeen = new Map(), lvSeen = new Map(), deadSeen = new Map(); let hpAcc = 0;
  function pollHp(dt) {
    hpAcc += dt; if (hpAcc < 0.1) return; hpAcc = 0;
    const st = source.state(); if (!st) return;
    const each = (m, fn) => { if (m && m.forEach) m.forEach(fn); };
    const seen = (e, key) => {
      if (!e || !fin(e.x, e.y, e.hp)) return;
      const id = e.id || key;
      const prev = hpSeen.get(id); hpSeen.set(id, e.hp);
      if (prev !== undefined) {
        const d = prev - e.hp;
        if (d >= 1 && d < 5000) floatNumber(e.x * S, e.y * S, id === source.localId ? 1.9 : 1.7, String(Math.round(d)), id === source.localId ? '#ff5a5a' : (d > 150 ? '#ffb347' : '#ffffff'));
        else if (d <= -20 && e.champ) floatNumber(e.x * S, e.y * S, 1.9, '+' + Math.round(-d), '#7ed957');
      }
      if (e.champ) {
        const curLv = e.level || 1, prevLv = lvSeen.get(id);
        lvSeen.set(id, curLv);
        if (prevLv !== undefined && curLv > prevLv) {
          ringAt(e.x, e.y, 0xffd23f, 2.4, 0.7, 1);
          sh.add({ type: SH.RING, x: e.x * S, y: e.y * S, z: 0.14, sx: 1.6, dur: 0.55, delay: 0.08, color: 0xfff3a8, alpha: 0.9, prio: 1 });
          sh.add({ type: SH.RAYS, x: e.x * S, y: e.y * S, z: 0.85, sx: 1.9, dur: 0.65, color: 0xffd23f, prio: 1 });
          for (let i = 0; i < 16; i++) {
            const a = rnd(6.283), r = rnd(0.15, 0.65);
            parts.puff(e.x * S + Math.cos(a) * r, 0.15, e.y * S + Math.sin(a) * r, 0, rnd(1.5, 3.0), 0, rnd(0.55, 0.95), 0.14, mix(0xffd23f, 0xffffff), 1, 0, 0.3);
          }
          floatNumber(e.x * S, e.y * S, 2.25, 'LEVEL UP!', '#ffd23f');
        }
        const curDead = !!e.dead, prevDead = deadSeen.get(id);
        deadSeen.set(id, curDead);
        if (prevDead === true && !curDead) {
          ringAt(e.x, e.y, 0x39e8ff, 2.4, 0.75, 1);
          sh.add({ type: SH.RING, x: e.x * S, y: e.y * S, z: 0.14, sx: 1.6, dur: 0.6, delay: 0.1, color: 0xffd23f, alpha: 0.9, prio: 1 });
          sh.add({ type: SH.RAYS, x: e.x * S, y: e.y * S, z: 1.0, sx: 2.1, dur: 0.7, color: 0x39e8ff, prio: 1 });
          for (let i = 0; i < 16; i++) {
            const a = rnd(6.283), r = rnd(0.15, 0.6);
            parts.puff(e.x * S + Math.cos(a) * r, 0.2, e.y * S + Math.sin(a) * r, Math.cos(a) * 0.6, rnd(1.4, 2.8), Math.sin(a) * 0.6, rnd(0.55, 0.9), 0.14, mix(0x39e8ff, 0xffd23f), 1, 0, 0.4);
          }
        }
      }
    };
    each(st.champions, seen); each(st.units, seen);
    if (hpSeen.size > 400) hpSeen.clear();
  }
  function stepCC(dt) { // CC stars orbit the head: 3 particles per frame, no pooled objects
    for (let i = ccs.length - 1; i >= 0; i--) {
      const o = ccs[i]; o.left -= dt; const p = o.left > 0 ? pos(o.id) : null; if (!p) { ccs[i] = ccs[ccs.length - 1]; ccs.pop(); continue; }
      o.ph += dt * 7; for (let k = 0; k < 3; k++) { const a = o.ph + k * 2.094; parts.puff(p.x * S + Math.cos(a) * 0.42, 2.0 + Math.sin(a * 2) * 0.05, p.y * S + Math.sin(a) * 0.42, 0, 0, 0, 0.09, 0.3, o.col, 1, 0, 0); }
    }
  }

  // 'atk' array: {f,t,r?} basic attacks — distinct programmer-themed VFX per champion (all 18) & every non-champion unit type
  function champMeleeSwing(swing, fx, fz, tx, tz, ang, col, c2, st) {
    const mx = (fx + tx) * 0.5, mz = (fz + tz) * 0.5, tx0 = tx - Math.cos(ang) * 0.18, tz0 = tz - Math.sin(ang) * 0.18;
    switch (swing) {
      case 'xcut': // Zero: violet X-cut twin daggers + bloodSlash
        sh.add({ type: SH.STREAK, x: tx, y: tz, z: 0.72, rot: ang + 0.68, sx: 0.72, sz: 0.18, dur: 0.2, color: col, prio: 0 });
        sh.add({ type: SH.STREAK, x: tx, y: tz, z: 0.74, rot: ang - 0.68, sx: 0.72, sz: 0.18, dur: 0.2, color: 0xff5fa3, prio: 0 });
        break;
      case 'cleave': // Stack: wide emerald arc cleave + impactLeaf
        sh.add({ type: SH.CHEVRON, x: mx, y: mz, z: 0.65, rot: ang, sx: 0.78, sz: 0.95, dur: 0.22, color: col, prio: 0 });
        sh.add({ type: SH.STREAK, x: tx0, y: tz0, z: 0.68, rot: ang + 1.15, sx: 0.65, sz: 0.24, dur: 0.18, color: c2, alpha: 0.85, prio: 0 });
        break;
      case 'slam': // Brick: heavy firewall hex shield slam + impactGold
        sh.add({ type: SH.HEX, x: tx, y: tz, z: 0.14, rot: ang, sx: 0.85, dur: 0.26, color: c2, prio: 0 });
        sh.add({ type: SH.RING, x: tx, y: tz, z: 0.1, sx: 0.95, dur: 0.24, color: col, alpha: 0.8, prio: 0 });
        break;
      case 'sweep': // Mop: wide cyan water sweep + impactWater
        sh.add({ type: SH.CHEVRON, x: mx, y: mz, z: 0.55, rot: ang, sx: 0.72, sz: 0.9, dur: 0.22, color: 0x39c2ff, prio: 0 });
        sh.add({ type: SH.STREAK, x: tx0, y: tz0, z: 0.6, rot: ang + 1.0, sx: 0.62, sz: 0.22, dur: 0.18, color: 0xffffff, alpha: 0.8, prio: 0 });
        break;
      case 'chevron': // Rush: orange express chevron swipe + burstOrange
        sh.add({ type: SH.CHEVRON, x: mx, y: mz, z: 0.68, rot: ang, sx: 0.68, sz: 0.68, dur: 0.18, color: col, prio: 0 });
        sh.add({ type: SH.STREAK, x: tx0, y: tz0, z: 0.7, rot: ang, sx: 0.7, sz: 0.16, dur: 0.16, color: 0xffffff, alpha: 0.85, prio: 0 });
        break;
      case 'laptop': // Patch: stance-colored code-bits + laptop/code-axe smash
        sh.add({ type: SH_BITS, x: tx, y: tz, z: 0.72, rot: ang, sx: 0.78, sz: 0.78, dur: 0.24, color: col, prio: 0 });
        sh.add({ type: SH.STREAK, x: mx, y: mz, z: 0.68, rot: ang + 0.35, sx: 0.72, sz: 0.22, dur: 0.18, color: 0xffffff, alpha: 0.85, prio: 0 });
        break;
      case 'jab': // Sprint: golden starburst jab + sparkGold
        sh.add({ type: SH.RAYS, x: tx, y: tz, z: 0.72, rot: ang, sx: 0.78, dur: 0.22, color: 0xffd23f, prio: 0 });
        sh.add({ type: SH.STREAK, x: mx, y: mz, z: 0.7, rot: ang, sx: 0.76, sz: 0.15, dur: 0.16, color: c2, prio: 0 });
        break;
      case 'sonar': // Pager: crimson alert sonar ring whack + burstBlood
        sh.add({ type: SH.RING, x: tx, y: tz, z: 0.14, sx: 0.95, dur: 0.26, color: col, prio: 0 });
        sh.add({ type: SH.FLASH, x: tx, y: tz, z: 0.72, sx: 0.62, dur: 0.18, color: 0xffffff, alpha: 0.85, prio: 0 });
        break;
      default:
        sh.add({ type: SH.STREAK, x: tx0, y: tz0, z: 0.7, rot: ang + rnd(-0.4, 0.4), sx: 0.6, sz: 0.2, dur: 0.18, color: col, prio: 0 });
    }
    if (st.hitFb) spr.play(st.hitFb, tx, tz, { size: st.hitSz || 1.2, dur: 0.26, color: st.hitCol !== null && st.hitCol !== undefined ? st.hitCol : col, z: 0.72, rot: ang });
    if (!lite) pburst(tx, 0.65, tz, col, { c2, g: -2, v: 0.8, up: 0.8, sz: 0.75 }, 3, 1.8, 0.09, 0.28);
  }

  function onAtk(arr) {
    if (disposed || !Array.isArray(arr)) return;
    for (const a of arr) {
      if (!a) continue; const f = ent(a.f), t = ent(a.t); if (!f || !t || !fin(f.x, f.y, t.x, t.y)) continue;
      const fx = f.x * S, fz = f.y * S, tx = t.x * S, tz = t.y * S;
      const dx0 = t.x - f.x, dy0 = t.y - f.y, dist = Math.hypot(dx0, dy0) || 1, dx = dx0 / dist, dy = dy0 / dist, ang = Math.atan2(dy0, dx0);
      const def = f.champ ? CHAMPIONS[f.champ] : null, st = f.champ ? ATK_STYLE[f.champ] : null;
      // ── 1. All 18 Champions ──
      if (st) {
        const fl = FLAIR[f.champ] || FL0;
        const stance = (f.champ === 'dev' || f.champ === 'cleaner') && f.buffs ? (parseKitTags(f.buffs).stance || '') : '';
        const col = (stance && STANCE_COL[stance]) || (def && Number.isFinite(def.color) ? def.color : 0x39c2ff);
        const c2 = f.champ === 'dev' && stance ? 0xffffff : fl.c2;
        if (a.r) {
          const hitCol = st.hitCol !== null && st.hitCol !== undefined ? st.hitCol : col;
          sh.add({ type: st.mz || SH.FLASH, x: fx + dx * 0.28, y: fz + dy * 0.28, z: 0.78, rot: ang, sx: 0.42, sz: 0.42, dur: 0.16, color: c2, alpha: 0.88, prio: 0 });
          bolt({
            x: f.x, y: f.y, dx, dy, speed: st.speed || 1600, range: dist, tx: a.t, color: col,
            size: st.size || 0.23, z: 0.82, small: true, fl,
            headType: st.head !== undefined ? st.head : fl.head, headCol: c2, headSz: 1.35,
            tailLen: st.tLen || 2.5, tailW: st.tW || 0.75, spin: st.spin !== undefined ? st.spin : 5, trail: !lite,
            onEnd: (x, y) => {
              const wx = x * S, wz = y * S;
              sh.add({ type: st.hitSh || SH.FLASH, x: wx, y: wz, z: 0.65, rot: ang, sx: 0.58, dur: 0.18, color: hitCol, alpha: 0.8, prio: 0 });
              if (st.hitFb) spr.play(st.hitFb, wx, wz, { size: st.hitSz || 1.15, dur: 0.26, color: hitCol, z: 0.72, rot: ang });
              if (!lite) pburst(wx, 0.65, wz, col, fl, 3, 1.6, 0.08, 0.25);
            },
          });
        } else {
          champMeleeSwing(st.swing, fx, fz, tx, tz, ang, col, c2, st);
        }
        continue;
      }
      // ── 2. Non-champion units & structures ──
      const kind = f.kind || '', isBlue = f.team === 'blue';
      if (kind === 'tower' || kind === 'core') {
        const isCore = kind === 'core', col = isBlue ? 0x39c2ff : 0xff6b35, z0 = isCore ? 3.4 : 3.0;
        sh.add({ type: SH.FLASH, x: fx, y: fz, z: z0, sx: isCore ? 0.9 : 0.75, dur: 0.2, color: 0xffffff, alpha: 0.9, prio: 0 });
        sh.add({ type: SH.RING, x: fx, y: fz, z: z0, sx: isCore ? 1.1 : 0.9, dur: 0.24, color: col, alpha: 0.85, prio: 0 });
        bolt({
          x: f.x, y: f.y, dx, dy, speed: 1450, range: dist, tx: a.t, color: col,
          size: isCore ? 0.5 : 0.44, z: z0, small: false, fl: { c2: 0xffffff, g: -1, v: 1, up: 0.8, sz: 1.1, head: SH.FLASH },
          headType: SH.FLASH, headCol: 0xffffff, headSz: 1.35, tailLen: 3.6, tailW: 1.0, trail: true,
          onEnd: (x, y) => {
            const wx = x * S, wz = y * S;
            sh.add({ type: SH.RING, x: wx, y: wz, z: 0.12, sx: isCore ? 1.45 : 1.2, dur: 0.3, color: col, prio: 0 });
            sh.add({ type: SH.FLASH, x: wx, y: wz, z: 0.7, sx: 0.95, dur: 0.2, color: 0xffffff, alpha: 0.85, prio: 0 });
            spr.play(isBlue ? 'vfCharged' : 'fireball', wx, wz, { size: isCore ? 1.55 : 1.35, dur: 0.3, color: col, z: 0.8 });
            spr.play(isBlue ? 'burstBlue' : 'burstFire', wx, wz, { size: isCore ? 1.7 : 1.45, dur: 0.32, color: col, ground: 1 });
            if (!lite) light(wx, 1.0, wz, col, 7, 0.22);
          },
        });
      } else if (kind === 'siege') {
        const col = isBlue ? 0x5cc8ff : 0xff7043;
        sh.add({ type: SH.FLASH, x: fx + dx * 0.32, y: fz + dy * 0.32, z: 0.65, sx: 0.45, dur: 0.16, color: 0xffd23f, alpha: 0.85, prio: 0 });
        bolt({
          x: f.x, y: f.y, dx, dy, speed: 1250, range: dist, tx: a.t, color: col,
          size: 0.33, z: 0.7, small: true, headType: SH.FLASH, headCol: 0xffd23f, headSz: 1.2, tailLen: 2.5, tailW: 1.0, trail: !lite,
          onEnd: (x, y) => {
            const wx = x * S, wz = y * S;
            sh.add({ type: SH.RING, x: wx, y: wz, z: 0.1, sx: 0.95, dur: 0.24, color: 0xff9800, prio: 0 });
            spr.play('burstOrange', wx, wz, { size: 1.15, dur: 0.28, color: 0xffb347, z: 0.65, minor: true });
          },
        });
      } else if (kind === 'obj') { // Volt turret: fast cyan-amber laser bolt + turret muzzle SH.RAYS + vfCharged mini-zap
        sh.add({ type: SH.RAYS, x: fx + dx * 0.25, y: fz + dy * 0.25, z: 0.85, rot: ang, sx: 0.48, dur: 0.16, color: 0xffd23f, alpha: 0.9, prio: 0 });
        bolt({
          x: f.x, y: f.y, dx, dy, speed: 2050, range: dist, tx: a.t, color: 0x00e5ff,
          size: 0.21, z: 0.85, small: true, headType: SH.RAYS, headCol: 0xffd23f, headSz: 1.25, tailLen: 3.4, tailW: 0.58, spin: 12,
          onEnd: (x, y) => {
            const wx = x * S, wz = y * S;
            sh.add({ type: SH.RAYS, x: wx, y: wz, z: 0.7, sx: 0.52, dur: 0.16, color: 0x00e5ff, prio: 0 });
            spr.play('vfCharged', wx, wz, { size: 0.95, dur: 0.24, color: 0x00e5ff, z: 0.7, minor: true });
          },
        });
      } else if (kind === 'ranged') { // Ranged bug minion: plasma spit glob + waterDots micro-pop
        const col = isBlue ? 0x39c2ff : 0xff5a6e;
        bolt({
          x: f.x, y: f.y, dx, dy, speed: 1380, range: dist, tx: a.t, color: col,
          size: 0.18, z: 0.65, small: true, headType: SH.BLOT, headCol: col, headSz: 1.25, tailLen: 1.7, tailW: 0.9, spin: 3,
          onEnd: (x, y) => {
            const wx = x * S, wz = y * S;
            quietHit(x, y, col, 0.45);
            spr.play('waterDots', wx, wz, { size: 0.78, dur: 0.22, color: col, z: 0.6, minor: true });
          },
        });
      } else if (kind === 'melee') { // Melee bug minion: dual tiny pincer fang streaks
        const col = isBlue ? 0x39c2ff : 0xff5a6e, px = tx - dx * 0.16, pz = tz - dy * 0.16;
        sh.add({ type: SH_SHARD, x: px, y: pz, z: 0.55, rot: ang + 0.42, sx: 0.42, sz: 0.14, dur: 0.15, color: col, alpha: 0.85, prio: 0 });
        sh.add({ type: SH_SHARD, x: px, y: pz, z: 0.56, rot: ang - 0.42, sx: 0.42, sz: 0.14, dur: 0.15, color: 0xffffff, alpha: 0.75, prio: 0 });
      } else if (kind === 'small') { // Coffee Drone camp: cyan laser zap
        if (a.r) {
          bolt({ x: f.x, y: f.y, dx, dy, speed: 1950, range: dist, tx: a.t, color: 0x00e5ff, size: 0.18, z: 0.75, small: true, headType: SH.RAYS, headCol: 0x9be7ff, headSz: 1.1, tailLen: 3.0, tailW: 0.55, onEnd: (x, y) => sh.add({ type: SH.RAYS, x: x * S, y: y * S, z: 0.68, sx: 0.45, dur: 0.16, color: 0x00e5ff, prio: 0 }) });
        } else {
          sh.add({ type: SH.STREAK, x: (fx + tx) * 0.5, y: (fz + tz) * 0.5, z: 0.72, rot: ang, sx: Math.max(0.45, dist * S * 0.5), sz: 0.12, dur: 0.16, color: 0x00e5ff, prio: 0 });
          sh.add({ type: SH.RAYS, x: tx, y: tz, z: 0.7, sx: 0.48, dur: 0.16, color: 0x9be7ff, prio: 0 });
        }
      } else if (kind === 'medium') { // Shredder Bot camp: metallic saw SH.RAYS
        sh.add({ type: SH.RAYS, x: tx - dx * 0.15, y: tz - dy * 0.15, z: 0.66, rot: rnd(3), sx: 0.74, dur: 0.22, color: 0xd8e2ec, prio: 0 });
        sh.add({ type: SH.STREAK, x: tx, y: tz, z: 0.68, rot: ang + 0.5, sx: 0.58, sz: 0.16, dur: 0.18, color: 0xffb347, alpha: 0.85, prio: 0 });
      } else if (kind === 'big') { // Legacy Mainframe camp: purple SH.HEX data-slam
        sh.add({ type: SH.HEX, x: tx, y: tz, z: 0.14, rot: ang, sx: 0.95, dur: 0.28, color: 0xb084ff, prio: 0 });
        sh.add({ type: SH.RING, x: tx, y: tz, z: 0.1, sx: 1.05, dur: 0.26, color: 0x7c4dff, alpha: 0.8, prio: 0 });
        spr.play('ringPurple', tx, tz, { size: 1.25, dur: 0.28, color: 0xb084ff, ground: 1, minor: true });
      } else if (kind === 'golden') { // CEO's Golden Bug: gold sparkGold glint
        sh.add({ type: SH.RAYS, x: tx, y: tz, z: 0.72, rot: rnd(3), sx: 0.82, dur: 0.24, color: 0xffd23f, prio: 0 });
        spr.play('sparkGold', tx, tz, { size: 1.2, dur: 0.28, color: 0xffd23f, z: 0.72 });
      } else if (kind === 'deadline') { // THE DEADLINE boss: crimson burstBlood + ringOrange clock slam
        sh.add({ type: SH.RING, x: tx, y: tz, z: 0.14, sx: 1.45, dur: 0.34, color: 0xff2e4c, prio: 0 });
        sh.add({ type: SH.RAYS, x: tx, y: tz, z: 0.75, rot: ang, sx: 1.2, dur: 0.28, color: 0xff8c42, prio: 0 });
        spr.play('burstBlood', tx, tz, { size: 1.55, dur: 0.32, color: 0xff2e4c, z: 0.8 });
        spr.play('ringOrange', tx, tz, { size: 1.75, dur: 0.34, color: 0xff7a1a, ground: 1 });
        addShake(0.03);
      } else {
        const col = isBlue ? 0x39c2ff : 0xff4d5e;
        if (a.r) bolt({ x: f.x, y: f.y, dx, dy, speed: 1500, range: dist, tx: a.t, color: col, size: 0.2, z: 0.8, small: true, onEnd: (x, y) => quietHit(x, y, col, 0.5) });
        else sh.add({ type: SH.STREAK, x: tx - dx * 0.2, y: tz - dy * 0.2, z: 0.7, rot: ang + rnd(-0.4, 0.4), sx: 0.55, sz: 0.2, dur: 0.18, color: col, prio: 0 });
      }
    }
  }
  function onGold(m) {
    if (disposed || !m || !fin(m.n, m.x, m.y)) return;
    floatNumber(m.x * S, m.y * S, 1.4, '+' + Math.round(m.n), '#ffd23f'); 
  }

  function clickMark(x, y, attack) {
    if (disposed || !fin(x, y)) return;
    const col = attack ? 0xff4a4a : 0x7ed957, wx = x * S, wz = y * S;
    sh.add({ type: SH.RING, x: wx, y: wz, z: 0.08, sx: attack ? 0.95 : 0.78, dur: 0.38, color: col, alpha: 0.95, prio: 1 });
    sh.add({ type: SH.FLASH, x: wx, y: wz, z: 0.12, sx: 0.38, dur: 0.18, color: col, alpha: 0.75, prio: 1 });
    parts.burst(wx, 0.16, wz, col, attack ? 7 : 5, 1.4, 0.09, 0.28);
  }
  function pingWorld(x, y, enemy) {
    if (disposed || !fin(x, y)) return;
    const col = enemy ? 0xff5e5e : 0x39c2ff, wx = x * S, wz = y * S;
    sh.add({ type: SH.RING, x: wx, y: wz, z: 0.1, sx: 2.2, dur: 0.75, color: col, alpha: 0.95, prio: 1 });
    sh.add({ type: SH.RING, x: wx, y: wz, z: 0.11, sx: 3.1, dur: 0.9, delay: 0.18, color: col, alpha: 0.85, prio: 1 });
    sh.add({ type: SH.RAYS, x: wx, y: wz, z: 0.2, sx: 1.2, dur: 0.5, color: col, alpha: 0.85, prio: 1 });
    floatNumber(wx, wz, 1.75, enemy ? '⚔ ATTACK!' : '📍 ON MY WAY', enemy ? '#ff5e5e' : '#39c2ff');
  }

  const offs = [source.on('fx', onFx), source.on('atk', onAtk), source.on('gold', onGold)].filter((o) => typeof o === 'function');

  return {
    update(dtSec) {
      if (disposed) return; dtSec = Math.min(0.1, dtSec || 0);
      tg.update(dtSec); stepBolts(dtSec); stepZones(dtSec); stepCC(dtSec); stepNums(dtSec); stepObjs(dtSec); objects.update(dtSec); pollHp(dtSec); spr.update(dtSec); parts.step(dtSec); sh.update(dtSec);
      for (const l of lights) { const u = l.userData; if (u.t < u.dur) { u.t += dtSec; l.intensity = u.peak * Math.max(0, 1 - u.t / u.dur) ** 2; } else l.intensity = 0; }
      shake *= Math.max(0, 1 - dtSec * 9);
    },
    clickMark,
    pingWorld,
    get shakeAmt() { return shake; },
    setViewport(hPx, fov) { parts.setViewport(hPx, fov || (camera && camera.fov) || 40); },
    stats() { return { particles: parts.count, flips: sh.count + spr.count, teles: tg.count, bolts: bolts.length }; },
    dispose() {
      disposed = true; for (const o of offs) { try { o(); } catch (_) { /* ignore */ } }
      bolts.length = 0; objs.length = 0; hpSeen.clear(); lvSeen.clear(); deadSeen.clear(); zones.length = 0; ccs.length = 0;
      for (const n of nums) root.remove(n.sp); for (const s of [...nums.map((n) => n.sp), ...numFree]) s.material.dispose(); nums.length = 0; numFree.length = 0;
      for (const t of numTex.values()) t.dispose(); numTex.clear();
      objects.dispose(); spr.dispose(); parts.dispose(); sh.dispose(); tg.dispose(); scene.remove(root);
    },
  };
}
export default createFx;

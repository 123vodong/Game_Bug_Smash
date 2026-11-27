// FX router (breakdown 3.2 / C4): maps sim 'fx' / 'atk' / 'gold' messages to cheap Three.js effects.
// createFx({THREE,scene,source,camera,mode,quality}) -> {update(dtSec), shakeAmt, setViewport(hPx,fov), stats(), dispose()}
// Scale: sim px * 0.01, sim y -> scene z. Telegraph radii are the true sim radii (m.r, m.len, m.w).
// Draw cost: shapes.js = 1 instanced draw for every ring/flash/streak/hex, particles.js = 1 Points draw, telegraphs = pooled quads.
// Per-skill identity = skill colour + shape by skill type + per-champion FLAIR (secondary colour / particle physics) + projectile head style.
import { createParticles } from './particles.js';
import { createShapes, SH } from './shapes.js';
import { createTelegraphs } from './telegraph.js';
import { createSprites } from './sprites.js'; // per-skill 2D-parity flipbook sprites (primary skill visual)
import { createKit, resolveSkill, resolveSpell } from './skills/index.js'; // per-skill themed VFX (consulted before the generic kind mapping)
import { CHAMPIONS } from '../../../shared/moba/champions.js'; // read-only: skill.pierce / champ colour

const S = 0.01; // mirrors world scale used by Renderer.js
const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const fin = (...v) => v.every(Number.isFinite);
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
const QUIET = new Set(['chargeEnd', 'suppressEnd', 'reloadEnd', 'timeboxEnd', 'shadowEnd', 'objHeat', 'linkShare', 'miss', 'ccBlock', 'ccBreak', 'pkg', 'tetherEnd', 'linkEnd', 'objEnd', 'echoFire', 'pinBoom']);

export function createFx({ THREE, scene, source, camera, mode, quality }) {
  const lite = !(quality && quality.lite === false), Q = quality || {};
  const root = new THREE.Group(); root.name = 'fx'; scene.add(root);
  const parts = createParticles(THREE, scene, Math.min(Q.particles || 600, mode === 'story' ? 1500 : 2500));
  const sh = createShapes(THREE, scene, { cap: Math.max(72, (Q.flips || 18) * 4) });
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
  const spr = createSprites({ THREE, scene, S, lite, ent, pos });
  const styleOf = (m) => { if (!m || !m.sid || !m.slot) return null; const c = ent(m.sid); return (c && c.champ && resolveSkill(c.champ, m.slot)) || null; };
  const castStyle = (st, m) => { if (!st || !st.cast) return false; try { return st.cast(kit, m) === true; } catch (_) { return false; } };
  const landStyle = (st, m, x, y) => { if (st && st.land) { try { st.land(kit, m, x, y); } catch (_) { /* style bug must never break fx */ } } };

  // champion-flavoured particle burst (physics + secondary colour from FLAIR)
  function pburst(wx, wy, wz, color, fl, n, speed, size, life) {
    for (let i = 0; i < n; i++) { const a = rnd(6.283), s = rnd(0.3, 1) * speed * fl.v; parts.puff(wx, wy, wz, Math.cos(a) * s, (rnd(0.2, 1) * 1.6 * fl.up + 0.4), Math.sin(a) * s, rnd(0.6, 1) * life, rnd(0.6, 1.2) * size * fl.sz, mix(color, fl.c2), 1, fl.g, 1.2); }
  }

  // bolts: persistent shape (streak + champion head shape) + particle glow head + trail. No draw calls of their own.
  function bolt({ x, y, dx, dy, speed, range, color, size = 0.3, z = 0.75, tx, onEnd, pierce = false, sid = '', fl = FL0, small = false, sprM = null }) {
    if (bolts.length >= MAX_BOLTS) { onEnd && onEnd(x + dx * range, y + dy * range); return; }
    const rot = Math.atan2(dy, dx);
    const tail = sh.add({ type: SH.STREAK, x: x * S, y: y * S, z: 0.5, rot, sx: size * (small ? 2.2 : 3.4), sz: size * 0.8, color, alpha: 0.95, dur: 0, prio: 0 });
    const head = small ? null : sh.add({ type: fl.head, x: x * S, y: y * S, z: 0.55, rot, sx: size * 1.2, sz: size * 1.2, color: fl.c2, alpha: 0.8, dur: 0, prio: 0 });
    const ob = { t: 0, x, y, dx, dy, speed, T: range / speed, color, size, z, tx, onEnd, pierce, sid, tail, head, fl, small, spr: null };
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
        const wx = o.x * S, wz = o.y * S, rot = Math.atan2(o.dy, o.dx), back = o.size * (o.small ? 1.6 : 2.4);
        sh.set(o.tail, wx - o.dx * back, wz - o.dy * back, 0.5, rot);
        if (o.head) sh.set(o.head, wx, wz, 0.55, rot + o.t * 6);
        parts.puff(wx, o.z, wz, 0, 0, 0, 0.07, o.size * (o.small ? 2.2 : 3.2), o.color, 1, 0, 0); // glow head (billboard point)
        if (!o.small) parts.puff(wx, o.z, wz, 0, 0, 0, 0.07, o.size * 1.1, 0xffffff, 1, 0, 0); // hot core
        if (!o.small) parts.puff(wx - o.dx * 0.12 + rnd(-0.06, 0.06), o.z + rnd(-0.06, 0.1), wz - o.dy * 0.12 + rnd(-0.06, 0.06), rnd(-0.2, 0.2), o.fl.g * -0.05, rnd(-0.2, 0.2), rnd(0.3, 0.5), o.size * rnd(0.9, 1.5) * o.fl.sz, mix(o.color, o.fl.c2), 0.9, o.fl.g * 0.4, 1.5);
      } else { if (o.spr) o.spr.kill = true; sh.kill(o.tail); sh.kill(o.head); bolts[i] = bolts[bolts.length - 1]; bolts.pop(); }
    }
  }

  // floating numbers (sprite pool, cached text textures)
  function numberTex(txt, color) {
    const key = txt + color; let t = numTex.get(key);
    if (!t) {
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const g = cv.getContext('2d');
      g.font = 'bold 44px "Segoe UI", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 7; g.strokeStyle = '#000'; g.strokeText(txt, 64, 34); g.fillStyle = color; g.fillText(txt, 64, 34);
      t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      if (numTex.size > 120) { for (const o of numTex.values()) o.dispose(); numTex.clear(); for (const n of nums) n.sp.material.map = null; }
      numTex.set(key, t);
    }
    return t;
  }
  function floatNumber(x, y, z, txt, color) {
    if (nums.length >= MAX_NUMS) return;
    const sp = numFree.pop() || (() => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, toneMapped: false })); s.renderOrder = 60; return s; })();
    sp.material.map = numberTex(txt, color); sp.material.needsUpdate = true; sp.material.opacity = 1; sp.scale.set(0.9, 0.45, 1); sp.position.set(x, z, y); root.add(sp);
    nums.push({ sp, t: 0, vx: rnd(-0.3, 0.3) });
  }
  function stepNums(dt) {
    for (let i = nums.length - 1; i >= 0; i--) {
      const n = nums[i]; n.t += dt;
      if (n.t >= 1) { root.remove(n.sp); numFree.push(n.sp); nums[i] = nums[nums.length - 1]; nums.pop(); continue; }
      n.sp.position.y += dt * 1.1 * (1 - n.t); n.sp.position.x += n.vx * dt; n.sp.material.opacity = 1 - Math.max(0, (n.t - 0.55) / 0.45);
      const s = 1 + Math.max(0, 0.35 - n.t) * 2; n.sp.scale.set(0.9 * s, 0.45 * s, 1);
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
    if (m.k === 'spell') { const ss = resolveSpell(m.spell); if (ss && fin(m.x0, m.y0) && castStyle(ss, m)) return; } else if (st && m.k !== 'cc' && castStyle(st, m)) return;
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
        const len = (m.len || 600) * S, ang = Number.isFinite(m.a) ? m.a : 0, wd = ((m.w || m.width || m.thick || 140) * S) / 2, half = Math.min(1.4, m.half ?? m.arc ?? 0.55);
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
        const list = Array.isArray(m.list) ? m.list : [];
        for (const e of list.slice(0, 8)) { if (!e) continue; if (fin(e.x0, e.y0)) teleport(e.x0, e.y0, 0xb084ff); if (fin(e.x1, e.y1)) { teleport(e.x1, e.y1, 0xb084ff); ringAt(e.x1, e.y1, 0xb084ff, 2.0, 0.6); } }
        if (!list.length && fin(m.x, m.y)) ringAt(m.x, m.y, 0xb084ff, 2.4, 0.6); break;
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
      case 'tgt': if (fin(m.x0, m.y0, m.x1, m.y1)) { beam(m.x0, m.y0, m.x1, m.y1, col); impact(m.x1, m.y1, col, 1.1, true, fl); } break;
      case 'zap': if (fin(m.x0, m.y0, m.x1, m.y1)) { beam(m.x0, m.y0, m.x1, m.y1, col, 1.0, 16, 0.12); impact(m.x1, m.y1, col, 0.6, false, fl); } break;
      case 'buff': case 'heal': {
        const id = m.sid || m.id, p = pos(id) || (fin(m.x, m.y) ? { x: m.x, y: m.y } : null); if (!p) return;
        const heal = m.k === 'heal', c = heal ? 0x7ed957 : col, fo = id ? () => pos(id) : null;
        sh.add({ type: heal ? SH.PLUS : SH.HEX, x: p.x * S, y: p.y * S, z: 0.1, sx: heal ? 1.0 : 1.2, dur: 0.7, color: c, follow: fo });
        sh.add({ type: SH.RING, x: p.x * S, y: p.y * S, sx: 1.3, dur: 0.55, color: c, follow: fo });
        for (let i = 0; i < 12; i++) { const a = rnd(6.283), r = rnd(0.2, 0.55); parts.puff(p.x * S + Math.cos(a) * r, 0.1, p.y * S + Math.sin(a) * r, 0, rnd(0.8, 1.8), 0, rnd(0.6, 1), 0.12, c, 1, 0, 0.3); } break;
      }
      case 'cc': {
        const ms = Math.min(1.6, (m.ms || 800) / 1000); let o = null; for (const k of ccs) if (k.id === m.id) { o = k; break; }
        if (o) o.left = Math.max(o.left, ms); else if (ccs.length < 12) ccs.push({ id: m.id, left: ms, ph: rnd(6), col: 0xffe14a }); break;
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
      case 'gping': if (fin(m.x0, m.y0, m.x1, m.y1)) { const a = Math.atan2(m.y1 - m.y0, m.x1 - m.x0), L = Math.hypot(m.x1 - m.x0, m.y1 - m.y0) * S; sh.add({ type: SH.STREAK, x: ((m.x0 + m.x1) / 2) * S, y: ((m.y0 + m.y1) / 2) * S, rot: a, sx: L / 2, sz: 0.12, dur: Math.max(0.3, (m.ms || 800) / 1000), color: 0xff3b3b, alpha: 0.7 }); } break;
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
  // damage / heal numbers derived from hp deltas (the sim sends no damage events): polled at 10 Hz over champions + units
  const hpSeen = new Map(); let hpAcc = 0;
  function pollHp(dt) {
    hpAcc += dt; if (hpAcc < 0.1) return; hpAcc = 0;
    const st = source.state(); if (!st) return;
    const each = (m, fn) => { if (m && m.forEach) m.forEach(fn); };
    const seen = (e) => {
      if (!e || !fin(e.x, e.y, e.hp)) return; const prev = hpSeen.get(e.id); hpSeen.set(e.id, e.hp);
      if (prev === undefined) return; const d = prev - e.hp;
      if (d >= 1 && d < 5000) floatNumber(e.x * S, e.y * S, e.id === source.localId ? 1.9 : 1.7, String(Math.round(d)), e.id === source.localId ? '#ff5a5a' : (d > 150 ? '#ffb347' : '#ffffff'));
      else if (d <= -20 && e.champ) floatNumber(e.x * S, e.y * S, 1.9, '+' + Math.round(-d), '#7ed957');
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

  // 'atk' array: {f,t,r?} basic attacks
  function onAtk(arr) {
    if (disposed || !Array.isArray(arr)) return;
    for (const a of arr) {
      if (!a) continue; const f = ent(a.f), t = ent(a.t); if (!f || !t || !fin(f.x, f.y, t.x, t.y)) continue;
      const isStruct = f.kind === 'tower' || f.kind === 'core', def = CHAMPIONS[f.champ], fl = (f.champ && FLAIR[f.champ]) || FL0;
      const col = def && Number.isFinite(def.color) ? def.color : isStruct ? 0xff9a4a : f.team === 'blue' ? 0x39c2ff : 0xff4d5e;
      if (a.r) {
        const d = Math.hypot(t.x - f.x, t.y - f.y) || 1;
        bolt({ x: f.x, y: f.y, dx: (t.x - f.x) / d, dy: (t.y - f.y) / d, speed: 1500, range: d, tx: a.t, color: col, size: isStruct ? 0.45 : 0.2, z: isStruct ? 3.0 : 0.8, small: !isStruct, fl, onEnd: (x, y) => quietHit(x, y, col, isStruct ? 1.0 : 0.5) });
      } else {
        const ang = Math.atan2(t.y - f.y, t.x - f.x);
        sh.add({ type: SH.STREAK, x: t.x * S - Math.cos(ang) * 0.2, y: t.y * S - Math.sin(ang) * 0.2, z: 0.7, rot: ang + rnd(-0.5, 0.5), sx: 0.55, sz: 0.2, dur: 0.18, color: col, prio: 0 });
        
      }
    }
  }
  function onGold(m) {
    if (disposed || !m || !fin(m.n, m.x, m.y)) return;
    floatNumber(m.x * S, m.y * S, 1.4, '+' + Math.round(m.n), '#ffd23f'); 
  }

  const offs = [source.on('fx', onFx), source.on('atk', onAtk), source.on('gold', onGold)].filter((o) => typeof o === 'function');

  return {
    update(dtSec) {
      if (disposed) return; dtSec = Math.min(0.1, dtSec || 0);
      tg.update(dtSec); stepBolts(dtSec); stepZones(dtSec); stepCC(dtSec); stepNums(dtSec); stepObjs(dtSec); pollHp(dtSec); spr.update(dtSec); parts.step(dtSec); sh.update(dtSec);
      for (const l of lights) { const u = l.userData; if (u.t < u.dur) { u.t += dtSec; l.intensity = u.peak * Math.max(0, 1 - u.t / u.dur) ** 2; } else l.intensity = 0; }
      shake *= Math.max(0, 1 - dtSec * 9);
    },
    get shakeAmt() { return shake; },
    setViewport(hPx, fov) { parts.setViewport(hPx, fov || (camera && camera.fov) || 40); },
    stats() { return { particles: parts.count, flips: sh.count + spr.count, teles: tg.count, bolts: bolts.length }; },
    dispose() {
      disposed = true; for (const o of offs) { try { o(); } catch (_) { /* ignore */ } }
      bolts.length = 0; objs.length = 0; hpSeen.clear(); zones.length = 0; ccs.length = 0;
      for (const n of nums) root.remove(n.sp); for (const s of [...nums.map((n) => n.sp), ...numFree]) s.material.dispose(); nums.length = 0; numFree.length = 0;
      for (const t of numTex.values()) t.dispose(); numTex.clear();
      spr.dispose(); parts.dispose(); sh.dispose(); tg.dispose(); scene.remove(root);
    },
  };
}
export default createFx;

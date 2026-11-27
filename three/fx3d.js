// fx3d.js - maps OfflineSim 'fx' / 'atk' messages to Three.js effects:
//   particles (one Points draw call), flipbook sprites/decals (assets/moba/fb/*.webp), shader telegraphs
//   (circle / zone / line / cone), glow projectiles, pooled flash lights, damage-number sprites.
import * as THREE from 'three';
import { S } from './world3d.js';
import { CHAMPIONS } from '../shared/moba/champions.js';

const FB = '../assets/moba/fb/';
const RING_BY_HUE = [['Blue', 0x39c2ff], ['Gold', 0xffd23f], ['Green', 0x7ed957], ['Orange', 0xff9800], ['Purple', 0xb084ff], ['White', 0xffffff]];
function nearestKey(prefix, color) {
  const c = new THREE.Color(color ?? 0xffffff); let best = 'White', bd = 9;
  for (const [n, h] of RING_BY_HUE) { const o = new THREE.Color(h), d = Math.hypot(c.r - o.r, c.g - o.g, c.b - o.b); if (d < bd) { bd = d; best = n; } }
  return prefix + best;
}
const BURST_HAS = new Set(['Blood', 'Blue', 'Fire', 'Green', 'Orange', 'White']);
const burstKey = (color) => { const k = nearestKey('', color); return 'burst' + (BURST_HAS.has(k) ? k : (k === 'Gold' ? 'Orange' : k === 'Purple' ? 'Blue' : 'White')); };
const ringKey = (color) => nearestKey('ring', color);
const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));

const TELE_VERT = `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const TELE_FRAG = `
varying vec2 vP; uniform vec3 uColor; uniform float uProg, uAlpha, uTime, uMode, uExt, uA, uB;
float band(float d, float c, float w){ return 1.0 - smoothstep(w * 0.5, w, abs(d - c)); }
void main(){
  vec2 p = vP * uExt; float fill = 0.0, ring = 0.0;
  if (uMode < 1.5) {
    float d = length(p) / uA;
    if (d > 1.04) discard;
    ring = band(d, 0.985, 0.06);
    if (uMode < 0.5) { fill = (d < uProg ? 0.20 : 0.07) * (1.0 - d * 0.4); ring += band(d, uProg, 0.04) * 0.8; }
    else {
      float ang = atan(p.y, p.x); float dash = step(0.5, fract(ang * 3.0 / 3.14159 + uTime * 0.12));
      fill = 0.10 + 0.05 * sin(uTime * 3.0 - d * 6.0); ring += band(d, 0.62, 0.035) * dash * 0.8;
      ring *= mix(0.55, 1.0, dash);
    }
  } else if (uMode < 2.5) {
    if (p.x < -0.05 || p.x > uA + 0.05 || abs(p.y) > uB + 0.05) discard;
    float e = min(min(p.x + 0.05, uA + 0.05 - p.x), uB + 0.05 - abs(p.y));
    ring = 1.0 - smoothstep(0.0, 0.07, e);
    fill = (p.x / uA < uProg ? 0.22 : 0.07); ring += band(p.x / uA, uProg, 0.03) * 0.7 * step(abs(p.y), uB);
  } else {
    float d = length(p) / uA; float ang = abs(atan(p.y, p.x));
    if (d > 1.02 || ang > uB + 0.03) discard;
    float ea = (uB - ang) * d * uA;
    ring = max(band(d, 0.99, 0.05), 1.0 - smoothstep(0.0, 0.07, ea));
    fill = (d < uProg ? 0.22 : 0.07);
  }
  float a = clamp(fill + ring, 0.0, 1.0) * uAlpha;
  gl_FragColor = vec4(uColor * (fill * 2.0 + ring * 2.2), a);
}`;

function glowTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.75)'); gr.addColorStop(0.6, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

export class Fx {
  constructor(scene, camera, units, renderer) {
    this.scene = scene; this.camera = camera; this.units = units; this.renderer = renderer;
    this.items = []; this.shakeAmt = 0; this.sheets = new Map(); this.free = new Map(); this.numTex = new Map();
    this.loader = new THREE.TextureLoader(); this.lastHp = new Map(); this.sim = null; this.myId = 'me'; this.count = { flip: 0, tele: 0, proj: 0 };
    this.glow = glowTexture();
    this.root = new THREE.Group(); scene.add(this.root);
    // particles
    const N = 3500; this.N = N; this.pn = 0;
    this.P = { pos: new Float32Array(N * 3), col: new Float32Array(N * 4), size: new Float32Array(N), vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N), grav: new Float32Array(N), drag: new Float32Array(N), s0: new Float32Array(N) };
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.P.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.P.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.P.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('color', this.aCol); g.setAttribute('size', this.aSize);
    this.pmat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute vec4 color; attribute float size; varying vec4 vC; uniform float uScale;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vC; void main(){ vec2 q = gl_PointCoord - 0.5; float r = length(q) * 2.0; if (r > 1.0) discard; float a = pow(1.0 - r, 1.6); gl_FragColor = vec4(vC.rgb * a * vC.a, a * vC.a); }`,
    });
    this.points = new THREE.Points(g, this.pmat); this.points.frustumCulled = false; this.points.renderOrder = 10; scene.add(this.points);
    // pooled lights (fixed count: never triggers shader recompiles)
    this.lights = []; for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffffff, 0, 6, 1.6); l.userData = { t: 0, dur: 1, peak: 0 }; scene.add(l); this.lights.push(l); }
    this.teleGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    this.spriteGeo = null;
  }
  setViewport(h, fov) { this.pmat.uniforms.uScale.value = (h * 0.5) / Math.tan(THREE.MathUtils.degToRad(fov) / 2); }
  shake(a) { this.shakeAmt = Math.min(0.35, this.shakeAmt + a); }
  light(x, y, z, color, peak, dur) {
    let l = this.lights[0]; for (const k of this.lights) if (k.userData.t >= k.userData.dur || k.intensity < l.intensity) { l = k; if (k.intensity < 0.01) break; }
    l.position.set(x, y, z); l.color.set(color); l.userData = { t: 0, dur, peak }; l.intensity = peak;
  }
  // ---------- particles ----------
  puff(x, y, z, vx, vy, vz, life, size, color, alpha = 1, grav = 0, drag = 0.5) {
    const P = this.P; let i = this.pn; if (i >= this.N) return; this.pn++;
    P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z; P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
    P.life[i] = P.max[i] = life; P.size[i] = P.s0[i] = size; P.grav[i] = grav; P.drag[i] = drag;
    const c = tmpC.set(color); P.col[i * 4] = c.r * 1.6; P.col[i * 4 + 1] = c.g * 1.6; P.col[i * 4 + 2] = c.b * 1.6; P.col[i * 4 + 3] = alpha;
  }
  burstParticles(x, y, z, color, n = 24, speed = 3, size = 0.12, life = 0.6, up = 1.5) {
    for (let i = 0; i < n; i++) { const a = rnd(6.283), s = rnd(0.3, 1) * speed; this.puff(x, y, z, Math.cos(a) * s, rnd(0.2, 1) * up + 0.5, Math.sin(a) * s, rnd(0.6, 1) * life, rnd(0.6, 1.2) * size, color, 1, -4, 1.2); }
  }
  stepParticles(dt) {
    const P = this.P;
    for (let i = 0; i < this.pn;) {
      P.life[i] -= dt;
      if (P.life[i] <= 0) { // swap-remove
        const j = --this.pn; if (i !== j) {
          P.pos.copyWithin(i * 3, j * 3, j * 3 + 3); P.vel.copyWithin(i * 3, j * 3, j * 3 + 3); P.col.copyWithin(i * 4, j * 4, j * 4 + 4);
          P.life[i] = P.life[j]; P.max[i] = P.max[j]; P.size[i] = P.size[j]; P.s0[i] = P.s0[j]; P.grav[i] = P.grav[j]; P.drag[i] = P.drag[j];
        }
        continue;
      }
      const k = Math.max(0, 1 - P.drag[i] * dt); P.vel[i * 3] *= k; P.vel[i * 3 + 2] *= k; P.vel[i * 3 + 1] = P.vel[i * 3 + 1] * k + P.grav[i] * dt;
      P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] = Math.max(0.02, P.pos[i * 3 + 1] + P.vel[i * 3 + 1] * dt); P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
      const f = P.life[i] / P.max[i]; P.size[i] = P.s0[i] * (0.4 + 0.6 * f); P.col[i * 4 + 3] = Math.min(1, f * 1.6);
      i++;
    }
    this.points.geometry.setDrawRange(0, this.pn);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
  }
  // ---------- flipbooks ----------
  sheet(key) {
    let s = this.sheets.get(key);
    if (!s) {
      s = { tex: null, rows: 4, frames: 32, ready: false };
      s.tex = this.loader.load(`${FB}${key}.webp`, (t) => { s.rows = Math.max(1, Math.round(t.image.height / 128)); s.frames = s.rows * 8; s.ready = true; });
      s.tex.colorSpace = THREE.SRGBColorSpace; this.sheets.set(key, s);
    }
    return s;
  }
  /** flat: ground decal; else camera-facing sprite. */
  flip(key, { x, y, z = 0.05, size = 1, color = 0xffffff, dur = 0.6, flat = false, loops = 1, alpha = 1, follow = null, delay = 0, rot = 0 }) {
    if (this.count.flip > 90) return null;
    const sh = this.sheet(key); this.count.flip++;
    const tex = sh.tex.clone(); tex.needsUpdate = true; tex.matrixAutoUpdate = true;
    let obj;
    if (flat) {
      const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color, opacity: alpha, toneMapped: false });
      obj = new THREE.Mesh(this.teleGeo, m); obj.scale.setScalar(size / 2); obj.rotation.y = rot; obj.renderOrder = 3;
    } else {
      obj = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color, opacity: alpha, toneMapped: false })); obj.scale.setScalar(size); obj.renderOrder = 11;
    }
    obj.position.set(x, z, y); obj.visible = false; this.root.add(obj);
    const it = { t: -delay, dur, tex, sh, obj, follow, loops, kind: 'flip', z };
    it.update = (dt) => {
      it.t += dt; if (it.t < 0) return true;
      if (!sh.ready) return true;
      obj.visible = true;
      const k = it.t / dur * loops; if (it.t >= dur * loops) return false;
      const f = Math.min(sh.frames - 1, Math.floor((k % 1) * sh.frames));
      tex.repeat.set(1 / 8, 1 / sh.rows); tex.offset.set((f % 8) / 8, 1 - (Math.floor(f / 8) + 1) / sh.rows);
      if (follow) { const p = follow(); if (p) obj.position.set(p.x * S, it.z, p.y * S); }
      return true;
    };
    it.dispose = () => { this.root.remove(obj); obj.material.dispose(); tex.dispose(); this.count.flip--; };
    this.items.push(it); return it;
  }
  // ---------- telegraphs ----------
  tele({ x, y, mode = 0, a = 1, b = 0.3, rot = 0, color = 0xffffff, delay = 0.5, life = 0, ext, onEnd, follow = null }) {
    this.count.tele++;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, vertexShader: TELE_VERT, fragmentShader: TELE_FRAG,
      uniforms: { uColor: { value: new THREE.Color(color) }, uProg: { value: 0 }, uAlpha: { value: 1 }, uTime: { value: 0 }, uMode: { value: mode }, uExt: { value: ext }, uA: { value: a }, uB: { value: b } },
    });
    const m = new THREE.Mesh(this.teleGeo, mat); m.scale.setScalar(1); m.position.set(x * S, 0.04, y * S); m.rotation.y = rot; m.renderOrder = 2; this.root.add(m);
    const it = { t: 0, kind: 'tele' };
    it.update = (dt) => {
      it.t += dt; const u = mat.uniforms; u.uTime.value += dt;
      if (follow) { const p = follow(); if (p) m.position.set(p.x * S, 0.04, p.y * S); }
      if (mode === 1) { const f = life > 0 ? it.t / life : 0; u.uAlpha.value = Math.min(1, it.t * 5) * (1 - Math.max(0, (f - 0.85) / 0.15)); return life <= 0 || it.t < life; }
      u.uProg.value = Math.min(1, it.t / Math.max(0.01, delay));
      if (it.t >= delay) { const f = (it.t - delay) / 0.25; u.uAlpha.value = Math.max(0, 1 - f); if (!it.fired) { it.fired = true; onEnd?.(); } return f < 1; }
      return true;
    };
    it.dispose = () => { this.root.remove(m); mat.dispose(); this.count.tele--; };
    this.items.push(it); return it;
  }
  pos(id) { const e = this.units.entity(this.sim, id); return e ? { x: e.x, y: e.y } : null; }
  // ---------- projectiles ----------
  bolt({ x, y, dx, dy, speed, range, color, size = 0.22, z = 0.75, life, tx, ty, onEnd, pierce = false, sid = '' }) {
    this.count.proj++;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    sp.scale.setScalar(size * 3.2); sp.renderOrder = 12; this.root.add(sp);
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    core.scale.setScalar(size * 1.4); core.renderOrder = 13; this.root.add(core);
    const it = { t: 0, x, y, dx, dy, kind: 'proj', pierce, sid, color }; const T = life ?? range / speed;
    it.update = (dt) => {
      it.t += dt;
      if (tx !== undefined) { // homing basic-attack bolt
        const ex = this.units.entity(this.sim, tx), px = ex ? ex.x : it.x, py = ex ? ex.y : it.y, vx = px - it.x, vy = py - it.y, d = Math.hypot(vx, vy) || 1, st = speed * dt;
        if (d <= st + 20) { onEnd?.(px, py); return false; } it.x += (vx / d) * st; it.y += (vy / d) * st;
      } else { it.x += dx * speed * dt; it.y += dy * speed * dt; if (it.t >= T) { onEnd?.(it.x, it.y); return false; } }
      const wx = it.x * S, wz = it.y * S; sp.position.set(wx, z, wz); core.position.set(wx, z, wz);
      for (let i = 0; i < 2; i++) this.puff(wx + rnd(-0.05, 0.05), z + rnd(-0.05, 0.05), wz + rnd(-0.05, 0.05), rnd(-0.2, 0.2), rnd(-0.1, 0.3), rnd(-0.2, 0.2), rnd(0.25, 0.45), size * rnd(0.6, 1.1), color, 0.8, 0, 2);
      return true;
    };
    it.dispose = () => { this.root.remove(sp, core); sp.material.dispose(); core.material.dispose(); this.count.proj--; };
    this.items.push(it); return it;
  }
  impact(x, y, color, size = 1, big = false) {
    const wx = x * S, wz = y * S;
    this.flip(big ? burstKey(color) : 'impactGold', { x: wx, y: wz, z: 0.7, size: size * (big ? 1.8 : 1.1), color: big ? 0xffffff : color, dur: big ? 0.55 : 0.32 });
    this.burstParticles(wx, 0.6, wz, color, big ? 22 : 9, big ? 3.5 : 2.2, 0.1, 0.5);
    this.light(wx, 1.0, wz, color, big ? 14 : 6, 0.25);
  }
  // ---------- messages ----------
  fx(m, sim) {
    this.sim = sim; const col = Number.isFinite(m.color) ? m.color : 0x39c2ff;
    switch (m.k) {
      case 'proj': {
        if (![m.x, m.y, m.dx, m.dy].every(Number.isFinite)) return;
        const c = sim.state.champions.get(m.sid); const sk = c && CHAMPIONS[c.champ]?.skills?.[m.slot];
        const w = Math.max(0.16, Math.min(0.5, (m.width || 60) * S * 0.35));
        this.bolt({ x: m.x, y: m.y, dx: m.dx, dy: m.dy, speed: m.speed || 1200, range: m.range || 800, color: col, size: w, pierce: !!sk?.pierce, sid: m.sid, onEnd: (x, y) => this.impact(x, y, col, 0.7) });
        this.light(m.x * S, 1, m.y * S, col, 5, 0.2); break;
      }
      case 'circle': {
        if (!Number.isFinite(m.x)) return; const R = (m.r || 100) * S, delay = (m.delay || 0) / 1000;
        const done = () => {
          const wx = m.x * S, wz = m.y * S;
          this.flip(ringKey(col), { x: wx, y: wz, size: R * 2.7, flat: true, color: col, dur: 0.55 });
          this.flip(burstKey(col), { x: wx, y: wz, z: R * 0.5, size: Math.max(1.4, R * 2.2), color: 0xffffff, dur: 0.55 });
          this.burstParticles(wx, 0.3, wz, col, Math.min(40, 12 + Math.round(R * 14)), R * 3, 0.1, 0.7, 2.5);
          this.light(wx, 1.2, wz, col, 12, 0.3); this.shake(R > 1.4 ? 0.12 : 0.05);
        };
        if (delay > 0.04) this.tele({ x: m.x, y: m.y, mode: 0, a: R, ext: R * 1.1, color: col, delay, onEnd: done }); else done(); break;
      }
      case 'zone': {
        if (!Number.isFinite(m.x)) return; const R = (m.r || 100) * S, life = (m.ms || 3000) / 1000;
        const t = this.tele({ x: m.x, y: m.y, mode: 1, a: R, ext: R * 1.1, color: col, life });
        t.tid = m.tid;
        const tick = (m.tickMs || 800) / 1000; let acc = 0, el = 0; const base = t.update;
        t.update = (dt) => { acc += dt; el += dt; if (acc >= tick) { acc = 0; this.flip(ringKey(col), { x: m.x * S, y: m.y * S, size: R * 2.2, flat: true, color: col, dur: 0.5, alpha: 0.6 }); }
          if (Math.random() < dt * 14) { const a = rnd(6.283), r = Math.sqrt(Math.random()) * R * 0.9; this.puff(m.x * S + Math.cos(a) * r, 0.05, m.y * S + Math.sin(a) * r, 0, rnd(0.5, 1.2), 0, rnd(0.6, 1.1), 0.1, col, 0.9, 0, 0); }
          return base(dt); };
        break;
      }
      case 'trapEnd': for (const it of this.items) if (it.tid === m.tid) it.update = () => false; break;
      case 'area': {
        const delay = (m.delay || 0) / 1000, len = (m.len || 600) * S, shape = m.shape;
        const ang = Number.isFinite(m.a) ? m.a : 0; const wd = ((m.w || m.width || m.thick || 140) * S) / 2, half = Math.min(1.4, m.half ?? m.arc ?? 0.55);
        const mode = shape === 'cone' || shape === 'arc' ? 3 : 2;
        this.tele({ x: m.x, y: m.y, mode, a: len, b: mode === 2 ? wd : half, ext: len * 1.05, rot: -ang, color: col, delay: Math.max(0.15, delay), onEnd: () => {
          const ex = m.x * S + Math.cos(ang) * len * 0.5, ez = m.y * S + Math.sin(ang) * len * 0.5;
          for (let i = 0; i < 28; i++) { const t = Math.random(); this.puff(m.x * S + Math.cos(ang) * len * t + rnd(-wd, wd) * 0.6, 0.4, m.y * S + Math.sin(ang) * len * t + rnd(-wd, wd) * 0.6, Math.cos(ang) * 3, rnd(0.3, 1.5), Math.sin(ang) * 3, 0.5, 0.14, col, 1, -2, 1); }
          this.light(ex, 1, ez, col, 10, 0.25); this.shake(0.08);
        } }); break;
      }
      case 'dash': {
        const x0 = m.x0 * S, z0 = m.y0 * S, x1 = m.x1 * S, z1 = m.y1 * S, v = this.units.champs.get(m.sid);
        if (v) v.slideTo(m.x0, m.y0, m.x1, m.y1, 190);
        const n = 26; for (let i = 0; i <= n; i++) { const t = i / n; this.puff(x0 + (x1 - x0) * t, 0.5 + rnd(0.5), z0 + (z1 - z0) * t, rnd(-0.3, 0.3), rnd(0, 0.5), rnd(-0.3, 0.3), 0.25 + 0.4 * t, 0.2, col, 0.9, 0, 3); }
        this.flip('vfHyperspeed', { x: (x0 + x1) / 2, y: (z0 + z1) / 2, z: 0.8, size: Math.hypot(x1 - x0, z1 - z0) * 0.7 + 1, color: col, dur: 0.32, alpha: 0.7 });
        this.flip(ringKey(col), { x: x1, y: z1, size: 1.6, flat: true, color: col, dur: 0.4 }); this.shake(0.03); break;
      }
      case 'blink': case 'tp': {
        for (const [px, py] of [[m.x0, m.y0], [m.x1, m.y1]]) { this.flip(burstKey(col), { x: px * S, y: py * S, z: 0.6, size: 1.7, color: 0xffffff, dur: 0.4 }); this.burstParticles(px * S, 0.3, py * S, col === 0x39c2ff && m.color === undefined ? 0xb084ff : col, 16, 2.4, 0.12, 0.5); }
        const v = this.units.champs.get(m.sid || m.id); if (v) v.slide = null; break;
      }
      case 'hit': { this.units.flash(m.id); const p = this.pos(m.id); if (p) { this.impact(p.x, p.y, col, 0.9);
        for (const it of this.items) if (it.kind === 'proj' && !it.pierce && it.sid && Math.hypot(it.x - p.x, it.y - p.y) < 90 && it.color === col) { it.update = () => false; break; } } break; }
      case 'tgt': {
        const x0 = m.x0 * S, z0 = m.y0 * S, x1 = m.x1 * S, z1 = m.y1 * S, n = 20;
        for (let i = 0; i <= n; i++) { const t = i / n; this.puff(x0 + (x1 - x0) * t + rnd(-0.06, 0.06), 0.9 + Math.sin(t * 3.14) * 0.25, z0 + (z1 - z0) * t + rnd(-0.06, 0.06), 0, rnd(-0.1, 0.4), 0, 0.28 + t * 0.2, 0.18, col, 1, 0, 3); }
        this.impact(m.x1, m.y1, col, 1.1, true); break;
      }
      case 'buff': case 'heal': {
        const p = this.pos(m.sid || m.id) || (Number.isFinite(m.x) ? { x: m.x, y: m.y } : null); if (!p) return; const c = m.k === 'heal' ? 0x7ed957 : col;
        this.flip('ringWhite', { x: p.x * S, y: p.y * S, size: 1.9, flat: true, color: c, dur: 0.55, follow: () => this.pos(m.sid || m.id) });
        for (let i = 0; i < 14; i++) { const a = rnd(6.283), r = rnd(0.2, 0.55); this.puff(p.x * S + Math.cos(a) * r, 0.1, p.y * S + Math.sin(a) * r, 0, rnd(0.8, 1.8), 0, rnd(0.6, 1), 0.1, c, 1, 0, 0.3); } break;
      }
      case 'cc': {
        const key = 'vfPuffStars', ms = (m.ms || 800) / 1000;
        this.flip(key, { x: 0, y: 0, z: 1.75, size: 1.1, color: col, dur: Math.min(ms, 1.2), loops: Math.max(1, Math.round(ms / 0.6)), follow: () => this.pos(m.id) }); break;
      }
      case 'knock': { const v = this.units.champs.get(m.id); if (v) v.slideTo(m.x0, m.y0, m.x1, m.y1, m.ms || 200); this.impact(m.x0, m.y0, 0xffffff, 0.8); break; }
      case 'revive': case 'untarget': { if (Number.isFinite(m.x)) this.flip('divineCloud', { x: m.x * S, y: m.y * S, z: 0.9, size: 2.4, color: col, dur: 0.9 }); break; }
      case 'shot': case 'petatk': {
        const a = m.k === 'shot' ? { x: m.x, y: m.y } : this.pos(m.id), b = m.k === 'shot' ? { x: m.tx, y: m.ty } : this.pos(m.t); if (!a || !b) return;
        const d = Math.hypot(b.x - a.x, b.y - a.y) || 1; this.bolt({ x: a.x, y: a.y, dx: (b.x - a.x) / d, dy: (b.y - a.y) / d, speed: 1800, range: d, color: col, size: 0.14, onEnd: (x, y) => this.impact(x, y, col, 0.6) }); break;
      }
      default: if (Number.isFinite(m.x) && Number.isFinite(m.y) && m.k !== 'obj' && m.k !== 'objHeat') this.flip('ringDots', { x: m.x * S, y: m.y * S, size: 1.4, flat: true, color: col, dur: 0.45, alpha: 0.7 });
    }
  }
  atk(arr, sim) {
    this.sim = sim;
    for (const a of arr) {
      const f = this.units.entity(sim, a.f), t = this.units.entity(sim, a.t); if (!f || !t) continue;
      const isStruct = f.kind === 'tower' || f.kind === 'core', ch = this.units.champs.get(a.f);
      if (ch) { ch.attack(); ch.faceYaw = Math.atan2(t.x - f.x, t.y - f.y); }
      const col = ch ? ch.def.color : isStruct ? 0xff9a4a : f.team === 'blue' ? 0x39c2ff : 0xff4d5e;
      if (a.r) {
        const d = Math.hypot(t.x - f.x, t.y - f.y) || 1;
        this.bolt({ x: f.x, y: f.y, dx: (t.x - f.x) / d, dy: (t.y - f.y) / d, speed: 1500, range: d, tx: a.t, color: col, size: isStruct ? 0.34 : 0.15, z: isStruct ? 3.0 : 0.8, onEnd: (x, y) => { this.impact(x, y, col, isStruct ? 1.2 : 0.6); this.units.flash(a.t); } });
      } else {
        this.units.lungeUnit(a.f); this.units.flash(a.t);
        this.flip('bloodSlash', { x: t.x * S, y: t.y * S, z: 0.7, size: 1.0, color: col, dur: 0.22, alpha: 0.9 });
        this.burstParticles(t.x * S, 0.6, t.y * S, 0xffffff, 5, 1.6, 0.07, 0.3);
      }
    }
  }
  // ---------- damage numbers ----------
  numberTex(txt, color) {
    const key = txt + color; let t = this.numTex.get(key);
    if (!t) {
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const g = cv.getContext('2d');
      g.font = 'bold 44px "Segoe UI", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 7; g.strokeStyle = '#000'; g.strokeText(txt, 64, 34); g.fillStyle = color; g.fillText(txt, 64, 34);
      t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; this.numTex.set(key, t); if (this.numTex.size > 300) this.numTex.clear();
    }
    return t;
  }
  floatNumber(x, y, z, txt, color) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.numberTex(txt, color), transparent: true, depthTest: false, toneMapped: false })); sp.scale.set(0.9, 0.45, 1); sp.renderOrder = 60;
    sp.position.set(x, z, y); this.root.add(sp); const it = { t: 0, kind: 'num' }; const vx = rnd(-0.3, 0.3);
    it.update = (dt) => { it.t += dt; sp.position.y += dt * 1.1 * (1 - it.t); sp.position.x += vx * dt; sp.material.opacity = 1 - Math.max(0, (it.t - 0.55) / 0.45); const s = 1 + Math.max(0, 0.35 - it.t) * 2; sp.scale.set(0.9 * s, 0.45 * s, 1); return it.t < 1; };
    it.dispose = () => { this.root.remove(sp); sp.material.dispose(); }; this.items.push(it);
  }
  damageNumbers(sim, camTarget) {
    const st = sim.clientState; let n = 0;
    const one = (e, z, big) => {
      const prev = this.lastHp.get(e.id); this.lastHp.set(e.id, e.hp);
      if (prev === undefined || e.hp === prev || n > 8) return; const d = Math.round(prev - e.hp);
      if (Math.abs(d) < 1 || (!big && d < 12)) return;
      if (Math.hypot(e.x * S - camTarget.x, e.y * S - camTarget.z) > 15) return; n++;
      if (d > 0) this.floatNumber(e.x * S, e.y * S, z, String(d), e.team === sim.state.champions.get('me').team ? '#ff8a8a' : big ? '#ffe066' : '#ffffff');
      else if (-d >= 4 && big) this.floatNumber(e.x * S, e.y * S, z, '+' + (-d), '#7ed957');
    };
    st.champions.forEach((c) => one(c, 1.9, true)); st.units.forEach((u) => { if (u.alive !== false) one(u, 1.0, false); });
    st.structures.forEach((s) => one(s, 3.4, true));
  }
  update(dt) {
    this.count.flip = 0; this.count.tele = 0; this.count.proj = 0;
    for (const it of this.items) { if (it.kind === 'flip') this.count.flip++; else if (it.kind === 'tele') this.count.tele++; else if (it.kind === 'proj') this.count.proj++; }
    for (let i = this.items.length - 1; i >= 0; i--) {
      let alive = true; try { alive = this.items[i].update(dt); } catch (e) { console.warn('fx error', e); alive = false; }
      if (!alive) { this.items[i].dispose?.call(this.items[i]); this.items.splice(i, 1); }
    }
    this.count.flip = 0; this.count.tele = 0; this.count.proj = 0;
    for (const it of this.items) { if (it.kind === 'flip') this.count.flip++; else if (it.kind === 'tele') this.count.tele++; else if (it.kind === 'proj') this.count.proj++; }
    this.stepParticles(dt);
    for (const l of this.lights) { const u = l.userData; if (u.t < u.dur) { u.t += dt; l.intensity = u.peak * Math.max(0, 1 - u.t / u.dur) ** 2; } else l.intensity = 0; }
    this.shakeAmt *= Math.max(0, 1 - dt * 9);
  }
}
const tmpC = new THREE.Color();

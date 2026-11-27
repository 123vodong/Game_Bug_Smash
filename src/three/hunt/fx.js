// Hunt FX: pooled particles (one Points), shockwave rings, DOM hit numbers / code-glyph fragments, flash, shake.
// All pools are fixed-size: nothing grows. Sim px (1280x720) <-> world units: x*0.01, z*0.01 (centred).
import * as THREE from 'three';

export const SC = 0.01;
export const wx = (x) => (x - 640) * SC;
export const wz = (y) => (y - 360) * SC;
const GLYPHS = ['{', '}', ';', '/*', '*/', '0', '1', 'NULL', 'ERR', '0xFF', '++', '<>'];

export function createFx({ scene, camera, layer, maxParticles = 300, project }) {
  // ---- particles (single Points, ring-buffer) ----
  const N = maxParticles;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N), maxLife = new Float32Array(N);
  for (let i = 0; i < N; i++) pos[i * 3 + 1] = -100;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, sizeAttenuation: true }));
  pts.frustumCulled = false; scene.add(pts);
  let head = 0;
  const tmpC = new THREE.Color();
  function burst(x, y, color, n = 10, speed = 3, up = 2.5) {
    tmpC.set(color);
    for (let k = 0; k < n; k++) {
      const i = head; head = (head + 1) % N;
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
      pos[i * 3] = wx(x); pos[i * 3 + 1] = 0.25; pos[i * 3 + 2] = wz(y);
      vel[i * 3] = Math.cos(a) * s; vel[i * 3 + 1] = up * (0.5 + Math.random()); vel[i * 3 + 2] = Math.sin(a) * s;
      col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b;
      life[i] = maxLife[i] = 0.35 + Math.random() * 0.35;
    }
  }

  // ---- shockwave rings (pool of 6) ----
  const rings = [];
  const ringGeo = new THREE.RingGeometry(0.85, 1, 40); ringGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false; m.position.y = 0.03; scene.add(m); rings.push({ m, t: 0, dur: 0.45, max: 1 });
  }
  let ringHead = 0;
  function shockwave(x, y, color = 0xffd23f, maxR = 1.4, dur = 0.45) {
    const r = rings[ringHead]; ringHead = (ringHead + 1) % rings.length;
    r.m.material.color.set(color); r.m.position.x = wx(x); r.m.position.z = wz(y); r.m.visible = true; r.t = 0; r.dur = dur; r.max = maxR;
  }

  // ---- DOM floaters (hit numbers + glyph fragments), pool of 28 ----
  const fl = [];
  for (let i = 0; i < 28; i++) {
    const d = document.createElement('div'); d.className = 'hx-fl'; d.style.display = 'none'; layer.appendChild(d);
    fl.push({ d, on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, life: 0, max: 1, rot: 0, vr: 0 });
  }
  let flHead = 0;
  function floater(x, y, text, color, size = 18, o = {}) {
    const f = fl[flHead]; flHead = (flHead + 1) % fl.length;
    f.on = true; f.x = wx(x); f.y = 0.5; f.z = wz(y); f.vx = o.vx || 0; f.vy = o.vy ?? 55; f.life = f.max = o.life || 0.8; f.ox = 0; f.oy = 0; f.rot = 0; f.vr = o.vr || 0; f.g = o.gravity || 0;
    const s = f.d.style; s.display = 'block'; s.color = color; s.fontSize = size + 'px'; s.fontFamily = o.mono ? 'Consolas,monospace' : "'Arial Black',sans-serif"; f.d.textContent = text;
  }
  const number = (x, y, text, color, size) => floater(x, y, text, color, size);
  function glyphs(x, y, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, sp = 60 + Math.random() * 160;
      floater(x, y, GLYPHS[Math.floor(Math.random() * GLYPHS.length)], Math.random() < 0.5 ? '#7ed957' : '#7ec8ff', 14 + Math.floor(Math.random() * 10),
        { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * -0.6 + 40, life: 0.7, mono: true, vr: (Math.random() - 0.5) * 360, gravity: 160 });
    }
  }

  // ---- flash + shake ----
  const flashEl = document.createElement('div'); flashEl.className = 'hx-flash'; layer.appendChild(flashEl);
  let flashT = 0, flashDur = 1, flashA = 0;
  function flash(color = '#fff', a = 0.5, ms = 160) { flashEl.style.background = color; flashA = a; flashDur = ms / 1000; flashT = flashDur; }
  let shakeT = 0, shakeDur = 1, shakeAmp = 0;
  function shake(ms = 120, amp = 0.05) { if (amp * (ms / 1000) >= shakeAmp * shakeT * 0.9) { shakeT = shakeDur = ms / 1000; shakeAmp = amp; } }
  const shakeOff = new THREE.Vector3();

  function update(dtMs) {
    const dt = Math.min(dtMs, 100) / 1000;
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { pos[i * 3 + 1] = -100; continue; }
      vel[i * 3 + 1] -= 9 * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] = Math.max(0.02, pos[i * 3 + 1] + vel[i * 3 + 1] * dt); pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    for (const r of rings) {
      if (!r.m.visible) continue;
      r.t += dt; const k = r.t / r.dur;
      if (k >= 1) { r.m.visible = false; continue; }
      const s = 0.1 + (r.max - 0.1) * (1 - Math.pow(1 - k, 3)); r.m.scale.set(s, 1, s); r.m.material.opacity = 0.9 * (1 - k);
    }
    for (const f of fl) {
      if (!f.on) continue;
      f.life -= dt;
      if (f.life <= 0) { f.on = false; f.d.style.display = 'none'; continue; }
      f.vy -= f.g * dt; f.rot += f.vr * dt;
      f.ox += f.vx * dt; f.oy += f.vy * dt;
      const p = project(f.x, f.y, f.z);
      f.d.style.transform = `translate(${p.x + f.ox}px,${p.y - f.oy}px) translate(-50%,-50%) rotate(${f.rot}deg) scale(${0.8 + 0.4 * (f.life / f.max)})`;
      f.d.style.opacity = Math.min(1, f.life / f.max * 1.6);
    }
    if (flashT > 0) { flashT -= dt; flashEl.style.opacity = Math.max(0, flashA * (flashT / flashDur)); } else flashEl.style.opacity = 0;
    if (shakeT > 0) { shakeT -= dt; const k = Math.max(0, shakeT / shakeDur) * shakeAmp; shakeOff.set((Math.random() - 0.5) * 2 * k, (Math.random() - 0.5) * 2 * k, 0); } else shakeOff.set(0, 0, 0);
  }
  function dispose() {
    scene.remove(pts); geo.dispose(); pts.material.dispose();
    for (const r of rings) { scene.remove(r.m); r.m.material.dispose(); } ringGeo.dispose();
    for (const f of fl) f.d.remove(); flashEl.remove();
  }
  return { burst, shockwave, number, floater, glyphs, flash, shake, update, dispose, shakeOff };
}

// world/bushes.js - swaying instanced break-room plants from world.bushes (seg capsules + circles). Ported from three/world3d.js.
import * as THREE from 'three';
import { S } from './ground.js';

export function makeBushes(world, lite = false) {
  const pts = [];
  const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  for (const b of (world && world.bushes) || []) {
    if (b.kind === 'circle') {
      const n = Math.round((b.r * b.r) / 1500) + 4;
      for (let i = 0; i < n; i++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * b.r * 0.8; pts.push([b.x + Math.cos(a) * d, b.y + Math.sin(a) * d]); }
    } else {
      const dx = b.x2 - b.x1, dy = b.y2 - b.y1, L = Math.hypot(dx, dy) || 1, n = Math.max(2, Math.round(L / 36));
      for (let i = 0; i <= n; i++) {
        for (let j = 0; j < 2; j++) {
          const t = i / n, off = (rnd() - 0.5) * b.w * 0.7;
          pts.push([b.x1 + dx * t + (-dy / L) * off, b.y1 + dy * t + (dx / L) * off]);
        }
      }
    }
  }
  if (lite) { const k = pts.filter((_, i) => i % 2 === 0); pts.length = 0; pts.push(...k); } // lite: half the clumps, 20-tri blobs
  if (!pts.length) return null;
  const geo = new THREE.IcosahedronGeometry(1, lite ? 0 : 1);
  const mat = lite ? new THREE.MeshLambertMaterial({ flatShading: true, transparent: true }) : new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true, transparent: true });
  const NR = 8, uR = Array.from({ length: NR }, () => new THREE.Vector4(0, 0, 0, 0)); // active rustle points: x, z (scene), strength, local-focus (0..1)
  const uni = { uTime: { value: 0 }, uR: { value: uR } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uni.uTime; sh.uniforms.uR = uni.uR;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec4 uR[8]; varying float vOcc; varying float vLocal;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float sway = sin(uTime * 1.6 + instanceMatrix[3].x * 2.7 + instanceMatrix[3].z * 1.9) * 0.07 * max(position.y, 0.0);
        transformed.x += sway; transformed.z += sway * 0.6;
        float occ = 0.0; float loc = 0.0;
        for (int i = 0; i < 8; i++) {
          vec4 r = uR[i];
          vec2 away = instanceMatrix[3].xz - r.xy;
          float d = length(away);
          float w = r.z * (1.0 - smoothstep(0.25, 0.9, d));
          occ = max(occ, w);
          transformed.x += sin(uTime * 22.0 + float(i) + instanceMatrix[3].z * 5.0) * 0.07 * w * max(position.y, 0.0);
          if (r.w > 0.01) {
            float part = r.w * (1.0 - smoothstep(0.2, 1.45, d));
            loc = max(loc, part);
            if (d > 0.001) {
              vec2 dir = away / d;
              transformed.xz += dir * part * 0.28 * max(position.y + 0.35, 0.0);
            }
            transformed.y *= (1.0 - part * 0.25);
          }
        }
        vOcc = occ; vLocal = loc;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vOcc; varying float vLocal;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.10, 0.55, 0.65), min(vOcc, 1.0) * 0.45);\ndiffuseColor.a *= (1.0 - min(vLocal, 1.0) * 0.58);'); // stealth hint + part/fade around local champion
  };
  const im = new THREE.InstancedMesh(geo, mat, pts.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
  pts.forEach(([x, y], i) => {
    const r = 0.21 + rnd() * 0.13;
    m.compose(p.set(x * S, r * 0.45, y * S), q.setFromAxisAngle(up, rnd() * 6), s.set(r, r * 0.85, r));
    im.setMatrixAt(i, m);
    im.setColorAt(i, c.setHSL(0.27 + rnd() * 0.06, 0.52, 0.16 + rnd() * 0.09));
  });
  im.castShadow = true; im.receiveShadow = true; im.userData.uni = uni;
  // bush fx: per champion track inBush; a burst (kick) on enter/leave decays over ~0.6s, occupied bushes keep a soft tint+wobble,
  // and the local champion smoothly parts/fades the bush around themselves.
  const track = new Map(); // id -> { b, k, lw, x, z }; created once per champion
  im.userData.fx = {
    update(ctx, dt) {
      const st = ctx.state; if (!st || !st.champions || !st.champions.forEach) return;
      const myId = ctx.localId || (typeof window !== 'undefined' && window.__three && window.__three.source && window.__three.source.localId) || null;
      let n = 0; const dec = Math.min(1, dt * 1.7), lrate = Math.min(1, dt * 6);
      st.champions.forEach((c, id) => {
        const cid = c.id || id;
        let r = track.get(cid); if (!r) { r = { b: false, k: 0, lw: 0, x: 0, z: 0 }; track.set(cid, r); }
        const b = !!c.inBush && !c.dead;
        if (b !== r.b) { r.b = b; r.k = 1; } else r.k = Math.max(0, r.k - dec);
        const wantLocal = (myId && cid === myId && b) ? 1 : 0;
        r.lw += (wantLocal - r.lw) * lrate;
        if (r.lw < 0.005) r.lw = 0;
        r.x = c.x * S; r.z = c.y * S;
        const w = Math.max(r.k, b ? 0.35 : 0);
        if ((w > 0.01 || r.lw > 0.01) && n < NR) { uR[n].set(r.x, r.z, w, r.lw); n++; }
      });
      for (; n < NR; n++) if (uR[n].z !== 0 || uR[n].w !== 0) uR[n].set(0, 0, 0, 0);
    },
  };
  return im;
}

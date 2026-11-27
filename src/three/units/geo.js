// units/geo.js - shared procedural-geometry helpers + the tiny "unit fx" shader patch (no textures, all vertex colours).
// Per-vertex attribute aFx = (sway, glow, hand, phase):
//   sway  : leg scuttle (+-1 alternates legs), animated in the vertex shader (no CPU cost)
//   glow  : >0 steady emissive (x diffuse = team tinted), <0 blinking LED (|glow| amplitude, `phase` desyncs the LEDs)
//   hand  : clock-hand ticking speed (rad/s) around the clock face pivot (0, CLOCK_Y) in model space
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const FX = { uT: { value: 0 } }; // sim time, set once per sync()
export const CLOCK_Y = 0.62;

export function paint(g, hex, sway = 0, glow = 0, hand = 0, phase = 0) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3), f = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; f[i * 4] = sway; f[i * 4 + 1] = glow; f[i * 4 + 2] = hand; f[i * 4 + 3] = phase; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.setAttribute('aFx', new THREE.BufferAttribute(f, 4));
  return g;
}
export function merge(list) { return mergeGeometries(list.map((g) => { const x = g.index ? g.toNonIndexed() : g; x.deleteAttribute('uv'); return x; })); }
export const bx = (w, h, d, x, y, z, c, ...fx) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c, ...fx);
export const sp = (r, x, y, z, c, ...fx) => paint(new THREE.SphereGeometry(r, 8, 6).translate(x, y, z), c, ...fx);
export const ell = (r, sx, sy, sz, x, y, z, c, ...fx) => paint(new THREE.SphereGeometry(r, 10, 7).scale(sx, sy, sz).translate(x, y, z), c, ...fx);
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
/** thin 4-sided tube from (x0,y0,z0) to (x1,y1,z1): legs, antennae, arms */
export function limb(x0, y0, z0, x1, y1, z1, r, c, ...fx) {
  _d.set(x1 - x0, y1 - y0, z1 - z0); const L = _d.length(); _d.normalize();
  const g = new THREE.CylinderGeometry(r * 0.7, r, L, 4, 1, true);
  g.applyQuaternion(_q.setFromUnitVectors(_up, _d)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return paint(g, c, ...fx);
}
/** six scuttling legs (3 per side), alternate sway so they read as walking */
export function legs6(y, spanZ, reach, c, r = 0.016) {
  const out = [];
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
    const z = (1 - i) * spanZ, sw = ((i + (s > 0 ? 1 : 0)) % 2 ? 1 : -1);
    out.push(limb(s * reach * 0.35, y, z, s * reach, 0.015, z + (i - 1) * -0.06 * 1.5, r, c, sw));
  }
  return out;
}

/** Patch a MeshStandardMaterial with the scuttle / glow / blink / clock-hand shader bits. */
export function patchFx(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = FX.uT;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFx; uniform float uT; varying float vGl;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ip = instanceMatrix[3].x * 2.3 + instanceMatrix[3].z * 1.7;
        transformed.z += aFx.x * sin(uT * 16.0 + ip) * 0.05;
        transformed.y += abs(aFx.x) * max(0.0, sin(uT * 16.0 + ip + 1.57)) * 0.015;
        if (aFx.z != 0.0) {
          float ang = aFx.z * floor(uT * 2.0) * 0.5; float cs = cos(ang), sn = sin(ang); float py = transformed.y - ${CLOCK_Y.toFixed(3)};
          transformed.y = ${CLOCK_Y.toFixed(3)} + py * cs - transformed.x * sn; transformed.x = py * sn + transformed.x * cs;
        }
        vGl = aFx.y;
        if (aFx.y < 0.0) vGl = -aFx.y * (0.2 + 0.8 * step(0.0, sin(uT * (2.0 + aFx.w * 0.37) + aFx.w * 6.28 + ip)));`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGl;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * vGl;');
  };
  mat.customProgramCacheKey = () => 'unitfx1';
  return mat;
}

// story/pickups.js - floor pickups as little dev props: coffee mug, gold coin stack, blue keycard, sticky note.
// createPickups({scene, source}) -> { update(tSec, dtSec), dispose() }   reads source.sim.story.pickups (offline StorySim only).
// A pickup floats + spins over a pulsing glow disc; when taken it rises, shrinks and is removed (no per-frame allocation).
import * as THREE from 'three';
import { paint, merge, bx } from '../units/geo.js';
import { S } from '../world/ground.js';

const GLOW = { coffee: 0xc8864a, gold: 0xffd23f, keycard: 0x39c2ff, note: 0xfff27a };

function kindGeos() {
  const cyl = (rt, rb, h, x, y, z, c, g = 0) => paint(new THREE.CylinderGeometry(rt, rb, h, 10).translate(x, y, z), c, 0, g);
  return {
    coffee: merge([cyl(0.2, 0.16, 0.34, 0, 0.17, 0, 0xf4f4f0), cyl(0.17, 0.17, 0.03, 0, 0.34, 0, 0x6b4a2b), paint(new THREE.TorusGeometry(0.09, 0.025, 6, 10).translate(0.24, 0.18, 0), 0xf4f4f0),
      bx(0.05, 0.14, 0.02, -0.05, 0.46, 0, 0xffffff, 0, 0.5), bx(0.05, 0.14, 0.02, 0.06, 0.5, 0, 0xffffff, 0, 0.5)]), // steam
    gold: merge([cyl(0.2, 0.2, 0.06, 0, 0.03, 0, 0xffd23f, 0.4), cyl(0.2, 0.2, 0.06, 0.02, 0.09, 0.01, 0xffc21a, 0.4), cyl(0.2, 0.2, 0.06, -0.01, 0.15, -0.01, 0xffd23f, 0.4), bx(0.12, 0.02, 0.02, 0, 0.19, 0, 0xb8860b)]),
    keycard: merge([bx(0.62, 0.04, 0.4, 0, 0.1, 0, 0x2a7fd8, 0.5), bx(0.14, 0.045, 0.1, -0.18, 0.11, -0.08, 0xffd23f, 0.8), bx(0.5, 0.045, 0.04, 0, 0.11, 0.12, 0x0b1e3a), bx(0.5, 0.045, 0.02, 0, 0.11, 0.17, 0xffffff, 0.4), bx(0.12, 0.05, 0.06, 0.2, 0.11, -0.1, 0x39c2ff, 1.5)]),
    note: merge([bx(0.42, 0.03, 0.42, 0, 0.05, 0, 0xfff27a, 0.35), bx(0.3, 0.032, 0.02, 0, 0.055, -0.08, 0x8a7a1a), bx(0.26, 0.032, 0.02, 0, 0.055, -0.02, 0x8a7a1a), bx(0.2, 0.032, 0.02, 0, 0.055, 0.04, 0x8a7a1a)]),
  };
}

export function createPickups({ scene, source } = {}) {
  const root = new THREE.Group(); root.name = 'story-pickups'; scene.add(root);
  const geos = kindGeos(), mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2, emissive: 0x111111 });
  patchGlow(mat);
  const disc = new THREE.CircleGeometry(0.55, 24).rotateX(-Math.PI / 2);
  const discMats = {}; for (const k in GLOW) discMats[k] = new THREE.MeshBasicMaterial({ color: GLOW[k], transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false });
  const views = new Map(); // id -> { g, mesh, glow, k, taken, t }
  const dead = [];

  function make(p) {
    const g = new THREE.Group(); g.position.set(p.x * S, 0, p.y * S);
    const mesh = new THREE.Mesh(geos[p.kind] || geos.note, mat); mesh.scale.setScalar(p.kind === 'keycard' ? 1.6 : 1.3); mesh.castShadow = false; g.add(mesh);
    const glow = new THREE.Mesh(disc, discMats[p.kind] || discMats.note); glow.position.y = 0.04; g.add(glow);
    root.add(g); const v = { g, mesh, glow, k: p.kind, taken: false, t: 0, ph: Math.random() * 6 }; views.set(p.id, v); return v;
  }

  function update(t, dt) {
    const s = source.sim && source.sim.story; if (!s) return;
    const arr = s.pickups;
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i]; let v = views.get(p.id);
      if (!p.taken && !v) v = make(p);
      else if (p.taken && v && !v.taken) v.taken = true;
    }
    for (const [id, v] of views) {
      if (v.taken) {
        v.t += dt; const k = Math.min(1, v.t / 0.38);
        v.mesh.position.y = 0.5 + k * 1.4; v.mesh.scale.setScalar(Math.max(0.01, (v.k === 'keycard' ? 1.6 : 1.3) * (1 + k * 0.5)) * (1 - k)); v.glow.scale.setScalar(1 + k * 1.2);
        if (k >= 1) dead.push(id);
      } else {
        v.mesh.position.y = 0.35 + 0.12 * Math.sin(t * 2.4 + v.ph); v.mesh.rotation.y = t * 1.6 + v.ph;
        v.glow.scale.setScalar(0.9 + 0.15 * Math.sin(t * 3 + v.ph));
      }
    }
    while (dead.length) { const id = dead.pop(), v = views.get(id); if (v) { root.remove(v.g); views.delete(id); } }
  }
  return { update, count: () => views.size, dispose() { scene.remove(root); for (const k in geos) geos[k].dispose(); mat.dispose(); disc.dispose(); for (const k in discMats) discMats[k].dispose(); views.clear(); } };
}

/** geo.js attributes carry aFx(glow) for the unit shader; here a plain emissive lift keeps pickups bright on Low. */
function patchGlow(mat) { mat.emissive.setHex(0x333333); mat.emissiveIntensity = 1; }
export default createPickups;

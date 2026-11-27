// world/relics.js - tower heal relics (state.relics = [{id,x,y,team,upAt}] or state.relicsJson): a floating green "+" code-chip
// with an additive glow ring when ready (upAt <= srvNow); while cooling down a ring on the pad grows with progress.
// 2 InstancedMesh draw calls, no per-frame allocation (relicsJson is parsed only when it changes).
import * as THREE from 'three';
import { S } from './ground.js';

const CAP = 16, COOL = 60000; // COOL mirrors OfflineSim's 60s relic respawn; only used for the cosmetic progress ring
export function makeRelics() {
  const chip = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.11, 0).scale(1, 1.3, 0.55), new THREE.MeshBasicMaterial({ color: 0x6dff8a, toneMapped: false }), CAP);
  const disc = new THREE.InstancedMesh(new THREE.RingGeometry(0.2, 1, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }), CAP);
  chip.frustumCulled = disc.frustumCulled = false; chip.count = disc.count = 0; chip.name = 'relic-chip'; disc.name = 'relic-glow';
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  let rawKey = null, cache = null;
  const group = new THREE.Group(); group.add(disc, chip);
  return {
    group,
    update(ctx) {
      const st = ctx.state; if (!st) return;
      let list = Array.isArray(st.relics) ? st.relics : null;
      if (!list) { const raw = st.relicsJson || ''; if (raw !== rawKey) { rawKey = raw; cache = null; if (raw) { try { cache = JSON.parse(raw); } catch (e) { cache = null; } } } list = cache; }
      const n = Array.isArray(list) ? Math.min(CAP, list.length) : 0, t = ctx.t || 0, now = ctx.srvNow || 0;
      chip.count = disc.count = n;
      for (let i = 0; i < n; i++) {
        const rl = list[i], x = rl.x * S, z = rl.y * S;
        if ((rl.upAt || 0) <= now) {
          const k = 0.45, r = 0.32;
          chip.setMatrixAt(i, m.compose(p.set(x, 0.3, z), qy.setFromAxisAngle(up, i), s.set(1, 1, 1)));
          disc.setMatrixAt(i, m.compose(p.set(x, 0.04, z), q, s.set(r, 1, r)));
          disc.setColorAt(i, c.setRGB(0.2 * k, k, 0.25 * k));
        } else {
          const pr = Math.max(0, Math.min(1, 1 - ((rl.upAt - now) / COOL))), r = 0.06 + 0.26 * pr;
          chip.setMatrixAt(i, zero);
          disc.setMatrixAt(i, m.compose(p.set(x, 0.04, z), q, s.set(r, 1, r)));
          disc.setColorAt(i, c.setRGB(0.12, 0.3, 0.14));
        }
      }
      chip.instanceMatrix.needsUpdate = disc.instanceMatrix.needsUpdate = true; if (disc.instanceColor) disc.instanceColor.needsUpdate = true;
    },
  };
}

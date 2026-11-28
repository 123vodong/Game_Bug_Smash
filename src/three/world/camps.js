// world/camps.js - jungle camp pits (5v5 only): themed dev-junk decor (small = old PC pile, medium = server pit, big = rack
// cluster with a red alarm) baked into ONE merged mesh, plus ONE instanced respawn-glow ring that pulses amber while a camp is
// down. Down state comes from state.units (alive && campId) and is only trusted while one of my teammates is within sight
// range (units are fog-filtered, an unseen camp must not look dead). 2 draw calls total.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAMPS } from '../../../shared/moba/map.js'; // 5v5 only
import { S } from './ground.js';
import { box, ball, cyl, mergeParts } from './util.js';

const RAD = { big: 130, medium: 105, small: 85 };
const SIGHT = 1100; // sim px; mirrors the fog radius used by the 2D scene

const place = (parts, x, z, ry) => { for (const g of parts) { g.rotateY(ry); g.translate(x, 0.002, z); } return parts; };
const pcPile = (x, z, ry) => place([ // old beige tower PCs stacked crooked + a dead CRT
  box(0.2, 0.3, 0.3, 0, 0.15, 0, 0xcfc6a8), box(0.2, 0.3, 0.3, 0.05, 0.45, 0.02, 0xbfb694, 0.3), box(0.17, 0.02, 0.01, 0.02, 0.2, 0.152, 0x2a2f3c),
  box(0.28, 0.22, 0.26, 0.3, 0.11, 0.08, 0xa9a28a, -0.4), box(0.2, 0.15, 0.01, 0.3, 0.12, 0.215, 0x1b2a33, -0.4), box(0.03, 0.03, 0.03, 0.02, 0.62, 0, 0xff5e5e)], x, z, ry);
const serverPit = (x, z, ry) => place([ // tipped server rack with leaking cables
  box(0.22, 0.5, 0.2, 0, 0.2, 0, 0x2b303d, 0, 0.28), box(0.16, 0.02, 0.01, 0.02, 0.28, 0.101, 0x7ed957, 0, 0.28), box(0.16, 0.02, 0.01, 0, 0.18, 0.101, 0xff5e5e, 0, 0.28),
  box(0.02, 0.02, 0.4, 0.2, 0.01, 0.2, 0x39c2ff), box(0.02, 0.02, 0.3, -0.18, 0.01, 0.25, 0xffd23f), ball(0.06, 0.3, 0.05, -0.05, 0x3a3f4e, 1, 0.5, 1)], x, z, ry);
const rackCluster = (x, z, ry) => place([ // two standing racks + alarm lamp
  box(0.22, 0.6, 0.2, -0.14, 0.3, 0, 0x2b303d), box(0.22, 0.6, 0.2, 0.14, 0.3, 0, 0x343a4a),
  box(0.18, 0.025, 0.01, -0.14, 0.2, 0.101, 0x7ed957), box(0.18, 0.025, 0.01, -0.14, 0.4, 0.101, 0x39c2ff), box(0.18, 0.025, 0.01, 0.14, 0.3, 0.101, 0xff5e5e),
  cyl(0.035, 0.05, 0, 0.66, 0, 0xff3b3b)], x, z, ry);

export function makeCamps(world) {
  if (world && world.id && world.id !== '5v5') return null;
  const parts = [], n = CAMPS.length;
  CAMPS.forEach((c, i) => {
    const r = (RAD[c.type] || 90) * S * 1.35, a = (c.side === 'red' ? Math.PI : 0) + i * 1.3, f = c.type === 'small' ? pcPile : c.type === 'medium' ? serverPit : rackCluster;
    for (const k of c.type === 'big' ? [0, 2.6] : [0]) parts.push(...f(c.x * S + Math.cos(a + k) * r, c.y * S + Math.sin(a + k) * r, a + k + 1.2));
  });
  const decor = mergeParts(parts, mergeGeometries); decor.name = 'camp-decor'; decor.frustumCulled = false;
  const ring = new THREE.InstancedMesh(new THREE.RingGeometry(0.78, 1, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }), n);
  ring.name = 'camp-respawn'; ring.frustumCulled = false;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  const hide = new THREE.Matrix4().makeScale(0, 0, 0), down = new Uint8Array(n), shown = new Uint8Array(n).fill(2), live = new Set();
  for (let i = 0; i < n; i++) { ring.setMatrixAt(i, hide); ring.setColorAt(i, c.set(0)); }
  const group = new THREE.Group(); group.add(decor, ring);
  return {
    group,
    update(ctx, localId) {
      const st = ctx.state; if (!st || !st.units) return;
      live.clear(); st.units.forEach((u) => { if (u.campId && u.alive !== false) live.add(u.campId); });
      const me = st.champions && st.champions.get && st.champions.get(localId), team = me ? me.team : '', t = ctx.t || 0;
      for (let i = 0; i < n; i++) {
        const cp = CAMPS[i];
        if (live.has(cp.id)) down[i] = 0;
        else if (!down[i] && team) {
          let seen = false; st.champions.forEach((ch) => { if (!seen && ch.team === team && !ch.dead && Math.hypot(ch.x - cp.x, ch.y - cp.y) < SIGHT) seen = true; });
          if (seen) down[i] = 1;
        }
        if (shown[i] !== 1) { const r = (RAD[cp.type] || 90) * S * 1.2; ring.setMatrixAt(i, m.compose(p.set(cp.x * S, 0.04, cp.y * S), q, s.set(r, 1, r))); ring.instanceMatrix.needsUpdate = true; shown[i] = 1; }
        if (down[i]) {
          const k = 0.36 + 0.16 * Math.sin(t * 2.8 + i * 1.3);
          ring.setColorAt(i, c.setRGB(k, 0.46 * k, 0.08 * k));
        } else {
          const k = 0.28 + 0.14 * Math.sin(t * 2.1 + i * 1.1);
          ring.setColorAt(i, c.setRGB(0.32 * k, 0.85 * k, 0.52 * k));
        }
        ring.instanceColor.needsUpdate = true;
      }
    },
  };
}

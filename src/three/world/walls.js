// world/walls.js - merged office walls (seg / rect / circle from world.walls), outer border, and animated doors.
// Ported from three/world3d.js. Doors: if world.doors = [{id,kind,x1,y1,x2,y2,key?}] exists (Story floors) each gets a
// slab driven by setDoor(id,'open'|'closed'|'locked'); the 5v5 world has none.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { S, tex } from './ground.js';

const WALL_STYLE = {
  partition: { h: 1.25, col: 0x9aa4c4, trim: 0x39c2ff },
  cubicles: { h: 0.95, col: 0x7d8fb8, trim: 0x7ed957 },
  glass: { h: 1.05, col: 0xaee8ff, trim: 0x39e0ff },
  shelf: { h: 0.8, col: 0x8a6446, trim: 0xffb347 },
  plant: { h: 0.7, col: 0x3c8f43 }, cooler: { h: 0.9, col: 0x7ec8ff }, pillar: { h: 1.6, col: 0xb8bdd0 },
};
const DOOR_COL = { lockin: 0xff5e5e, keycard: 0x39c2ff, boss: 0xffd23f, auto: 0x9fdcff };

function colorize(geo, hex) {
  const c = new THREE.Color(hex).multiplyScalar(1.25), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
function segBox(w, len, h, y0) {
  const g = new THREE.BoxGeometry(len, h, w);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len * 0.45, uv.getY(i) * h * 0.45);
  g.translate(0, y0 + h / 2, 0);
  return g;
}
const flat = (g) => (g.index ? g.toNonIndexed() : g);

export function makeWalls(world, aniso = 8, lite = false) {
  const group = new THREE.Group();
  const solid = [], glass = [], trim = [];
  for (const w of (world && world.walls) || []) {
    const st = WALL_STYLE[w.look] || WALL_STYLE.partition;
    if (w.kind === 'seg') {
      const dx = (w.x2 - w.x1) * S, dz = (w.y2 - w.y1) * S, len = Math.hypot(dx, dz) + w.w * S * 0.5, th = w.w * S * 0.5;
      const place = (g) => { g.rotateY(-Math.atan2(dz, dx)); g.translate((w.x1 + w.x2) / 2 * S, 0, (w.y1 + w.y2) / 2 * S); return g; };
      if (w.look === 'glass') {
        glass.push(place(colorize(segBox(th * 0.45, len, st.h - 0.3, 0.3), st.col)));
        solid.push(place(colorize(segBox(th, len, 0.3, 0), 0x5a6585)));
      } else solid.push(place(colorize(segBox(th, len, st.h, 0), st.col)));
      trim.push(place(colorize(new THREE.BoxGeometry(len - 0.02, 0.03, th * 0.3).translate(0, st.h + 0.015, 0), new THREE.Color(st.trim).multiplyScalar(0.18).getHex())));
    } else if (w.kind === 'rect') {
      solid.push(colorize(new THREE.BoxGeometry(w.w * S, st.h, w.h * S).translate((w.x + w.w / 2) * S, st.h / 2, (w.y + w.h / 2) * S), st.col));
    } else if (w.kind === 'circle') {
      const r = w.r * S;
      if (w.look === 'plant') {
        solid.push(colorize(new THREE.CylinderGeometry(r * 0.7, r * 0.55, 0.32, 10).translate(w.x * S, 0.16, w.y * S), 0x8a5a3c));
        solid.push(colorize(new THREE.IcosahedronGeometry(r * 1.15, 1).translate(w.x * S, 0.62, w.y * S), 0x3c9a46));
      } else solid.push(colorize(new THREE.CylinderGeometry(r, r, st.h, 14).translate(w.x * S, st.h / 2, w.y * S), st.col));
    }
  }
  const mk = (list, mat, shadow) => {
    if (!list.length) return;
    const m = new THREE.Mesh(mergeGeometries(list.map(flat)), mat);
    m.castShadow = shadow; m.receiveShadow = true; group.add(m);
    for (const g of list) g.dispose();
  };
  mk(solid, lite
    ? new THREE.MeshLambertMaterial({ map: tex('tex/plastered_wall_03_diff.jpg', true, 1), color: 0xcfd6e6, vertexColors: true }) // cheap: no normal map, no PBR
    : new THREE.MeshStandardMaterial({
      map: tex('tex/plastered_wall_03_diff.jpg', true, aniso), normalMap: tex('tex/plastered_wall_03_nor_gl.jpg', false, aniso),
      vertexColors: true, roughness: 0.82, metalness: 0.05,
    }), true);
  mk(glass, new (lite ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial)({ vertexColors: true, transparent: true, opacity: 0.38, emissive: 0x10343f, depthWrite: false }), false);
  mk(trim, new THREE.MeshBasicMaterial({ vertexColors: true }), false);

  // (no outer border wall: the 2D map has none; the ground quad just darkens outside the map)

  // doors: ONE InstancedMesh slab (slides into its start post: scale along length) + ONE InstancedMesh keycard lamp (glowing, pulses
  // while locked). Per-door state is a tiny record; matrices are rewritten only while a door is moving or a lamp pulses.
  const dl = (world && world.doors) || [];
  const KEY_COL = { blue: 0x39c2ff, red: 0xff5e5e, gold: 0xffd23f };
  const recs = new Map(), list = [];
  let slabs = null, lamps = null;
  if (dl.length) {
    const slabGeo = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0);
    slabs = new THREE.InstancedMesh(slabGeo, lite ? new THREE.MeshLambertMaterial({ color: 0xffffff }) : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.3 }), dl.length);
    lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.12, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), dl.length);
    slabs.castShadow = true; slabs.frustumCulled = lamps.frustumCulled = false; group.add(slabs, lamps);
    dl.forEach((d, i) => {
      const dx = (d.x2 - d.x1) * S, dz = (d.y2 - d.y1) * S, len = Math.hypot(dx, dz) + 0.1;
      const c = new THREE.Color(d.kind === 'keycard' ? (KEY_COL[d.key] ?? DOOR_COL.keycard) : (DOOR_COL[d.kind] || DOOR_COL.auto));
      const r = { i, d, len, yaw: -Math.atan2(dz, dx), x: d.x1 * S - (dx / (len - 0.1)) * 0.05, z: d.y1 * S - (dz / (len - 0.1)) * 0.05, ux: dx / (len - 0.1), uz: dz / (len - 0.1), col: c, k: 1, want: 1, pulse: d.kind === 'keycard' || d.kind === 'boss', dirty: true };
      const open = !(d.kind === 'keycard' || d.kind === 'boss');
      r.k = r.want = open ? 0.06 : 1;
      slabs.setColorAt(i, new THREE.Color(c).multiplyScalar(0.55)); lamps.setColorAt(i, c);
      recs.set(d.id, r); list.push(r);
    });
  }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), V = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), C = new THREE.Color();
  const writeDoor = (r) => {
    Q.setFromAxisAngle(UP, r.yaw);
    slabs.setMatrixAt(r.i, M.compose(P.set(r.x, 0, r.z), Q, V.set(r.len * r.k, 1.25, 0.14)));
    const lk = r.k > 0.5 ? 1 : 0; // lamp rides the door centre; vanishes once the door has slid open
    lamps.setMatrixAt(r.i, M.compose(P.set(r.x + r.ux * r.len * 0.5, 1.34, r.z + r.uz * r.len * 0.5), Q, V.set(lk, lk, lk)));
  };
  list.forEach(writeDoor);
  return {
    group,
    setDoor(id, state) { const r = recs.get(id); if (r) { r.want = state === 'open' ? 0.06 : 1; r.pulse = state === 'locked' || (state !== 'open' && (r.d.kind === 'keycard' || r.d.kind === 'boss')); } },
    update(dt, t = 0) {
      if (!list.length) return;
      let colorDirty = false, matDirty = false;
      for (const r of list) {
        if (r.k !== r.want) {
          r.k += (r.want - r.k) * Math.min(1, dt * 7); if (Math.abs(r.want - r.k) < 0.004) r.k = r.want;
          writeDoor(r); matDirty = true;
        }
        const glow = r.k > 0.5 ? (r.pulse ? 0.8 + 0.2 * Math.sin(t * 2 + r.i) : 0.9) : 0; // keycard-style glowing lock
        if (glow !== r.glow) { lamps.setColorAt(r.i, C.copy(r.col).multiplyScalar(glow * 1.6)); r.glow = glow; colorDirty = true; }
      }
      if (matDirty) { slabs.instanceMatrix.needsUpdate = lamps.instanceMatrix.needsUpdate = true; }
      if (colorDirty) lamps.instanceColor.needsUpdate = true;
    },
  };
}

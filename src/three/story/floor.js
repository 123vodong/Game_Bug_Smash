// story/floor.js - Story floor dressing from the FloorMap data (story2/floors/*.js): room floor tints (one draw call),
// dev-style room signs, doors (lock-in laser / keycard door with a glowing keypad / auto glass), the stairs up and the
// break-room heal ring. createFloor({scene, floor}) -> { update(tSec, dtSec), setDoor(id,state), dispose() }
// Walls, bushes and the ground texture come from world/* (source.world); this only adds what the story floor needs.
import * as THREE from 'three';
import { S } from '../world/ground.js';
import { FOUNTAIN_RADIUS } from '../../../shared/moba/rules.js'; // read-only shared rule (heal + shop zone, sim px)

const TINT = { nest: 0xb04bff, infested: 0xff6a3a, keycard: 0x39c2ff, break: 0x7ed957 }; // calm rooms stay untinted
const SIGN = {
  server: ['/dev/server_room', '[ NEST DETECTED ]', '#d9a8ff'], office: ['open_office.exe', '(infested)', '#ffb08a'],
  records: ['records_archive/', 'needs: blue keycard', '#8fd8ff'], hall: ['hallway', '--no-bugs-allowed', '#9fb4d8'],
  lobby: ['lobby/', '$ git init', '#9fb4d8'], break: ['break_room', 'heal + shop (P)', '#a8f08a'], manager: ['manager_office', '(meeting in progress)', '#9fb4d8'],
};

function textTex(l1, l2, color, w = 512, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(8,12,20,0.55)'; x.fillRect(0, 0, w, h); x.strokeStyle = color; x.lineWidth = 4; x.strokeRect(2, 2, w - 4, h - 4);
  x.fillStyle = color; x.font = 'bold 44px Consolas, "Courier New", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(l1, w / 2, l2 ? h * 0.36 : h / 2);
  if (l2) { x.font = '30px Consolas, "Courier New", monospace'; x.globalAlpha = 0.85; x.fillText(l2, w / 2, h * 0.74); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 1; return t;
}

export function createFloor({ scene, floor } = {}) {
  const root = new THREE.Group(); root.name = 'story-floor'; scene.add(root);
  const disposables = [];
  const keep = (o) => { disposables.push(o); return o; };

  // ---- room tints: all rooms in one vertex-coloured mesh ----
  const pos = [], col = [], c = new THREE.Color();
  for (const r of floor.rooms) {
    const t = TINT[r.kind]; if (!t) continue;
    const [x, y, w, h] = r.rect, x0 = x * S, z0 = y * S, x1 = (x + w) * S, z1 = (y + h) * S;
    pos.push(x0, 0.02, z0, x0, 0.02, z1, x1, 0.02, z0, x1, 0.02, z0, x0, 0.02, z1, x1, 0.02, z1);
    c.set(t); for (let i = 0; i < 6; i++) col.push(c.r, c.g, c.b);
  }
  if (pos.length) {
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = keep(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 1; mesh.frustumCulled = false; root.add(mesh);
  }
  // ---- room signs (flat on the floor, readable from the camera side) ----
  const signGeo = keep(new THREE.PlaneGeometry(4.8, 1.2).rotateX(-Math.PI / 2));
  for (const r of floor.rooms) {
    const s = SIGN[r.id]; if (!s) continue;
    const tex = keep(textTex(s[0], s[1], s[2]));
    const m = keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    const mesh = new THREE.Mesh(signGeo, m);
    mesh.position.set((r.rect[0] + r.rect[2] / 2) * S, 0.03, (r.rect[1] + 330) * S); mesh.renderOrder = 2; root.add(mesh);
  }

  // ---- doors ----
  const doors = new Map(), post = keep(new THREE.BoxGeometry(0.34, 1.9, 0.46)), pad = keep(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2));
  const postMat = keep(new THREE.MeshStandardMaterial({ color: 0x4a5266, roughness: 0.6, metalness: 0.4 }));
  for (const d of floor.doors) {
    const dx = (d.x2 - d.x1) * S, dz = (d.y2 - d.y1) * S, len = Math.hypot(dx, dz), ang = Math.atan2(dz, dx);
    const g = new THREE.Group(); g.position.set(((d.x1 + d.x2) / 2) * S, 0, ((d.y1 + d.y2) / 2) * S); g.rotation.y = -ang; root.add(g);
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(post, postMat); p.position.set(sx * (len / 2 + 0.05), 0.95, 0); p.castShadow = true; g.add(p); }
    const e = { id: d.id, kind: d.kind, g, open: d.kind === 'lockin' || d.kind === 'auto' ? 1 : 0, want: d.kind === 'lockin' || d.kind === 'auto' ? 1 : 0, slab: null, glow: null, keypad: null, padMesh: null, len };
    if (d.kind === 'auto') { // glass slider: looks only, never blocks
      const gm = keep(new THREE.MeshStandardMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0.2, roughness: 0.1, depthWrite: false }));
      const panel = new THREE.Mesh(keep(new THREE.BoxGeometry(len * 0.32, 1.5, 0.06)), gm); panel.position.set(-len * 0.34, 0.8, 0); g.add(panel);
    } else {
      const lock = d.kind === 'lockin';
      const sm = keep(lock
        ? new THREE.MeshStandardMaterial({ color: 0x701818, emissive: 0xff2a2a, emissiveIntensity: 0.9, transparent: true, opacity: 0.8, roughness: 0.4 })
        : new THREE.MeshStandardMaterial({ color: 0x39435a, emissive: 0x0a1c3a, roughness: 0.45, metalness: 0.5 }));
      e.slab = new THREE.Mesh(keep(new THREE.BoxGeometry(len, 1.6, lock ? 0.16 : 0.34)), sm); e.slab.position.set(0, 0.8, 0); e.slab.castShadow = !lock; g.add(e.slab);
      if (!lock) { // blue keycard reader on the left post, pulses while locked, turns green once open
        e.keypad = new THREE.Mesh(keep(new THREE.BoxGeometry(0.2, 0.3, 0.12)), keep(new THREE.MeshBasicMaterial({ color: 0x39c2ff, toneMapped: false })));
        e.keypad.position.set(-(len / 2 + 0.05), 1.35, 0.26); g.add(e.keypad);
        e.glow = keep(new THREE.MeshBasicMaterial({ color: 0x39c2ff, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false }));
        e.padMesh = new THREE.Mesh(pad, e.glow); e.padMesh.scale.set(1.3, 1, 1.3); e.padMesh.position.set(0, 0.04, 1.4); g.add(e.padMesh);
      }
    }
    doors.set(d.id, e);
    // initial pose
    if (e.slab) e.slab.position.y = e.open ? -0.9 : 0.8;
  }

  // ---- stairs up ----
  const ex = floor.exit, stairs = new THREE.Group(); stairs.position.set(ex.x * S, 0, ex.y * S); root.add(stairs);
  const stepM = keep(new THREE.MeshStandardMaterial({ color: 0x8d95a6, roughness: 0.8 })), stripeM = keep(new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  for (let i = 0; i < 6; i++) {
    const h = 0.14 * (i + 1);
    const s = new THREE.Mesh(keep(new THREE.BoxGeometry(2.6, h, 0.42)), stepM); s.position.set(0, h / 2, 0.9 - i * 0.42); s.castShadow = true; s.receiveShadow = true; stairs.add(s);
    const st = new THREE.Mesh(keep(new THREE.BoxGeometry(2.6, 0.012, 0.06)), stripeM); st.position.set(0, h + 0.006, 0.9 - i * 0.42 + 0.18); stairs.add(st);
  }
  const ringM = keep(new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }));
  const ring = new THREE.Mesh(keep(new THREE.RingGeometry(ex.r * S - 0.07, ex.r * S, 40).rotateX(-Math.PI / 2)), ringM); ring.position.y = 0.05; stairs.add(ring);
  const beamM = keep(new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const beam = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.1, 1.3, 4.5, 16, 1, true)), beamM); beam.position.y = 2.25; stairs.add(beam);
  const sign = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(textTex(ex.label || 'STAIRS UP', 'exit(0);', '#ffd23f', 512, 128)), transparent: true, toneMapped: false })));
  sign.scale.set(3.4, 0.85, 1); sign.position.y = 3.6; stairs.add(sign);

  // ---- break room heal ring ----
  const br = floor.breakRoom, heal = new THREE.Group(); heal.position.set(br.x * S, 0, br.y * S); root.add(heal);
  const healM = keep(new THREE.MeshBasicMaterial({ color: 0x7ed957, transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false }));
  const hr = new THREE.Mesh(keep(new THREE.RingGeometry(FOUNTAIN_RADIUS * S - 0.06, FOUNTAIN_RADIUS * S, 56).rotateX(-Math.PI / 2)), healM); hr.position.y = 0.045; heal.add(hr);
  const plus = new THREE.Group(); heal.add(plus);
  for (const [w, d] of [[0.9, 0.3], [0.3, 0.9]]) { const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, 0.08, d)), keep(new THREE.MeshBasicMaterial({ color: 0x7ed957, toneMapped: false }))); plus.add(m); }

  function setDoor(id, state) {
    const e = doors.get(id); if (!e) return;
    e.want = state === 'open' ? 1 : 0;
    if (e.keypad) e.keypad.material.color.set(state === 'open' ? 0x7ed957 : 0x39c2ff);
  }
  function update(t, dt) {
    for (const e of doors.values()) {
      if (e.slab) {
        e.open += (e.want - e.open) * Math.min(1, dt * 7);
        e.slab.position.y = 0.8 - e.open * 1.7; e.slab.visible = e.open < 0.97;
        if (e.kind === 'lockin') e.slab.material.emissiveIntensity = 0.6 + 0.4 * Math.sin(t * 8);
      }
      if (e.glow) { e.glow.opacity = e.want ? 0.1 : 0.22 + 0.16 * Math.sin(t * 3.5); e.glow.color.set(e.want ? 0x7ed957 : 0x39c2ff); }
    }
    ringM.opacity = 0.55 + 0.35 * Math.sin(t * 3); beamM.opacity = 0.12 + 0.07 * Math.sin(t * 2.2); beam.rotation.y = t * 0.5;
    healM.opacity = 0.35 + 0.2 * Math.sin(t * 2.4); plus.position.y = 0.25 + 0.06 * Math.sin(t * 2.4); plus.rotation.y = t * 0.8;
  }
  return {
    update, setDoor,
    dispose() { scene.remove(root); for (const o of disposables) { try { o.dispose(); } catch (_) { /* ignore */ } } },
  };
}
export default createFloor;

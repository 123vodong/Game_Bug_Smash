// units/proc.js - procedural low-poly characters (no rig, no GLB): robot / round / tall / block. Each limb is ONE merged
// vertex-coloured geometry (geometry cached per champion, shared by every view); animation = transform swings on 6 pivots.
// Same body scale as KayKit Rig_Medium (feet y=0, head top ~2.0, +Z = front) so gear.js hats/props/outfits fit the
// 'head' / 'chest' / 'handslot.r' nodes this rig exposes under the same names.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
function part(list, geo, color, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.deleteAttribute('uv');
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)); g.applyMatrix4(_m);
  _c.set(color); const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); list.push(g);
}
const done = (l) => { const g = mergeGeometries(l, false); for (const x of l) x.dispose(); return g; };
const SPH = new THREE.SphereGeometry(1, 10, 8), BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(1, 1, 1, 10), CONE = new THREE.ConeGeometry(1, 1, 8);
const DARK = 0x2a2d36, EYE = 0xfdfdfd, PUPIL = 0x15161c;
const SKINS = [0xf1c9a5, 0xd9a273, 0xb87a4b, 0xf7dcc3, 0x8d5a3a];
const shade = (c, k) => _c.set(c).multiplyScalar(k).getHex();

// archetype -> {hipY (pivot height of legs), shY (shoulder y), shX (shoulder x), neckY (head pivot), headY (head centre above neck), headR}
const KINDS = {
  robot: { hipY: 0.72, shY: 1.62, shX: 0.7, neckY: 1.8, headY: 0.3 },
  round: { hipY: 0.5, shY: 1.3, shX: 0.78, neckY: 1.55, headY: 0.28 },
  tall: { hipY: 1.02, shY: 1.9, shX: 0.42, neckY: 2.08, headY: 0.3 },
  block: { hipY: 0.5, shY: 1.22, shX: 0.5, neckY: 1.4, headY: 0.42 },
};
const cache = new Map();

function buildGeos(champId, kind, pal, variant) {
  const key = champId + ':' + kind; if (cache.has(key)) return cache.get(key);
  const A = pal[0], B = pal[1], skin = SKINS[(champId.length * 7 + champId.charCodeAt(0)) % SKINS.length], K = KINDS[kind];
  const torso = [], head = [], armL = [], armR = [], legL = [], legR = [];
  if (kind === 'robot') {
    const dome = variant === 'dome';
    part(torso, BOX, A, 0, 1.2, 0, 1.0, 0.95, 0.68); part(torso, BOX, B, 0, 1.2, 0.35, 0.5, 0.4, 0.04); part(torso, SPH, 0x39e8ff, 0, 1.22, 0.38, 0.12, 0.12, 0.05);
    part(torso, BOX, DARK, 0, 0.78, 0, 0.7, 0.18, 0.5); part(torso, BOX, B, 0, 1.72, -0.3, 0.5, 0.3, 0.14); // backpack/vent
    if (dome) part(head, SPH, A, 0, K.headY, 0, 0.5, 0.42, 0.5); else part(head, BOX, A, 0, K.headY, 0, 0.7, 0.55, 0.6);
    part(head, BOX, 0x0d1a22, 0, K.headY + 0.02, 0.28, 0.56, 0.22, 0.1); part(head, BOX, 0x39e8ff, 0, K.headY + 0.02, 0.34, 0.44, 0.07, 0.04);
    part(head, CYL, DARK, 0.22, K.headY + 0.46, 0, 0.03, 0.34, 0.03); part(head, SPH, 0xff4f5f, 0.22, K.headY + 0.66, 0, 0.08);
    for (const [g, sx] of [[armL, 1], [armR, -1]]) { part(g, SPH, B, 0, 0, 0, 0.26); part(g, CYL, A, 0, -0.34, 0, 0.12, 0.6, 0.12); part(g, BOX, DARK, 0, -0.72, 0, 0.26, 0.26, 0.3); }
    for (const g of [legL, legR]) { part(g, CYL, DARK, 0, -0.32, 0, 0.12, 0.6, 0.12); part(g, BOX, A, 0, -0.62, 0.08, 0.36, 0.16, 0.5); }
  } else if (kind === 'round') {
    part(torso, SPH, A, 0, 0.98, 0, 0.82, 0.74, 0.7); part(torso, SPH, B, 0, 0.94, 0.3, 0.6, 0.5, 0.42); part(torso, BOX, B, 0, 1.38, 0.05, 0.96, 0.1, 0.5);
    part(head, SPH, skin, 0, K.headY, 0, 0.4, 0.38, 0.38); part(head, SPH, EYE, -0.14, K.headY + 0.04, 0.34, 0.08, 0.1, 0.05); part(head, SPH, EYE, 0.14, K.headY + 0.04, 0.34, 0.08, 0.1, 0.05);
    part(head, SPH, PUPIL, -0.14, K.headY + 0.03, 0.38, 0.04); part(head, SPH, PUPIL, 0.14, K.headY + 0.03, 0.38, 0.04); part(head, SPH, shade(skin, 0.7), 0, K.headY - 0.1, 0.38, 0.07, 0.04, 0.04);
    for (const g of [armL, armR]) { part(g, SPH, skin, 0, -0.5, 0, 0.17); part(g, CYL, A, 0, -0.22, 0, 0.14, 0.45, 0.14); }
    for (const g of [legL, legR]) { part(g, CYL, B, 0, -0.18, 0, 0.17, 0.36, 0.17); part(g, SPH, DARK, 0, -0.44, 0.08, 0.24, 0.12, 0.32); }
  } else if (kind === 'tall') {
    part(torso, BOX, A, 0, 1.55, 0, 0.62, 0.95, 0.38); part(torso, BOX, B, 0, 1.55, 0.2, 0.12, 0.95, 0.03); part(torso, BOX, shade(A, 0.8), 0, 1.15, 0, 0.66, 0.2, 0.4);
    part(head, SPH, skin, 0, K.headY, 0, 0.3, 0.38, 0.32); part(head, SPH, EYE, -0.1, K.headY + 0.04, 0.27, 0.06, 0.08, 0.04); part(head, SPH, EYE, 0.1, K.headY + 0.04, 0.27, 0.06, 0.08, 0.04);
    part(head, SPH, PUPIL, -0.1, K.headY + 0.03, 0.3, 0.03); part(head, SPH, PUPIL, 0.1, K.headY + 0.03, 0.3, 0.03);
    part(head, BOX, B, 0, K.headY + 0.34, 0, 0.34, 0.06, 0.34); // hair/collar tuft
    if (variant === 'hood') { part(head, SPH, A, 0, K.headY + 0.04, -0.12, 0.4, 0.44, 0.34); part(torso, SPH, A, 0, 1.95, -0.14, 0.38, 0.2, 0.3); }
    for (const g of [armL, armR]) { part(g, CYL, B, 0, -0.38, 0, 0.09, 0.78, 0.09); part(g, SPH, skin, 0, -0.84, 0, 0.12); }
    for (const g of [legL, legR]) { part(g, CYL, DARK, 0, -0.5, 0, 0.12, 1.0, 0.12); part(g, BOX, shade(B, 0.6), 0, -1.0, 0.08, 0.2, 0.1, 0.34); }
  } else { // block: huge cube head, tiny body
    part(torso, BOX, A, 0, 0.98, 0, 0.74, 0.6, 0.5); part(torso, BOX, B, 0, 0.84, 0.26, 0.5, 0.2, 0.04);
    part(head, BOX, skin, 0, K.headY, 0, 0.86, 0.8, 0.8); part(head, BOX, 0x1d1f27, -0.2, K.headY + 0.06, 0.41, 0.16, 0.2, 0.03); part(head, BOX, 0x1d1f27, 0.2, K.headY + 0.06, 0.41, 0.16, 0.2, 0.03);
    part(head, BOX, EYE, -0.2, K.headY + 0.1, 0.43, 0.06, 0.07, 0.02); part(head, BOX, EYE, 0.2, K.headY + 0.1, 0.43, 0.06, 0.07, 0.02); part(head, BOX, shade(skin, 0.65), 0, K.headY - 0.2, 0.41, 0.26, 0.05, 0.02);
    for (const g of [armL, armR]) { part(g, BOX, A, 0, -0.26, 0, 0.2, 0.5, 0.2); part(g, BOX, skin, 0, -0.58, 0, 0.18, 0.16, 0.18); }
    for (const g of [legL, legR]) { part(g, BOX, DARK, 0, -0.22, 0, 0.24, 0.44, 0.26); part(g, BOX, B, 0, -0.46, 0.06, 0.28, 0.1, 0.38); }
  }
  const out = { K, torso: done(torso), head: done(head), armL: done(armL), armR: done(armR), legL: done(legL), legR: done(legR) };
  cache.set(key, out); return out;
}
export function disposeProc() { for (const o of cache.values()) for (const k of ['torso', 'head', 'armL', 'armR', 'legL', 'legR']) o[k].dispose(); cache.clear(); }

const TMP_E = new THREE.Euler();
/** Rig with the same surface ChampView needs: .model (Group), .bones {head, chest, 'handslot.r'}, .mats, set(mode), once(kind,dur), update(dt,speed). */
export class ProcRig {
  constructor(champId, kind, pal, variant) {
    const G = buildGeos(champId, kind, pal, variant), K = G.K;
    this.model = new THREE.Group(); this.hips = new THREE.Group(); this.model.add(this.hips);
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05, envMapIntensity: 0.45, emissive: new THREE.Color(0) });
    const mk = (geo, parent, x, y, z) => { const o = new THREE.Group(); o.position.set(x, y, z); const m = new THREE.Mesh(geo, this.mat); m.castShadow = true; m.frustumCulled = false; o.add(m); parent.add(o); return o; };
    this.torso = mk(G.torso, this.hips, 0, 0, 0);
    this.headG = mk(G.head, this.torso, 0, K.neckY, 0);
    this.armL = mk(G.armL, this.torso, K.shX, K.shY, 0); this.armR = mk(G.armR, this.torso, -K.shX, K.shY, 0);
    this.legL = mk(G.legL, this.hips, 0.22, K.hipY, 0); this.legR = mk(G.legR, this.hips, -0.22, K.hipY, 0);
    const node = (name, parent, x, y, z) => { const n = new THREE.Object3D(); n.name = name; n.position.set(x, y, z); parent.add(n); return n; };
    this.bones = { head: node('head', this.headG, 0, K.headY, 0), chest: node('chest', this.torso, 0, K.shY - 0.2, 0), 'handslot.r': node('handslot.r', this.armR, 0, -0.55, 0.05) };
    this.bones['handslot.r'].rotation.x = Math.PI / 2; // KayKit hand slots point the item forward from the fist
    this.mode = 'Idle'; this.ph = 0; this.t = 0; this.kind = ''; this.kt = 0; this.kd = 0; this.dead = 0; this.lean = 0;
  }
  once(kind, dur) { this.kind = kind; this.kd = dur; this.kt = 0; }
  update(dt, speed, dead) {
    this.t += dt; const run = this.mode === 'Running_A' && !dead;
    this.ph += dt * (run ? 7 + Math.min(speed, 450) * 0.012 : 0);
    const sw = run ? Math.sin(this.ph) : 0, idle = Math.sin(this.t * 2.2);
    let ax = run ? -sw * 0.9 : idle * 0.04, bx = run ? sw * 0.9 : -idle * 0.04, lx = -sw * 0.85, rx = sw * 0.85, lean = run ? 0.16 : 0, tw = 0, up = 0;
    this.hips.position.y = (run ? Math.abs(Math.cos(this.ph)) * 0.09 : idle * 0.018);
    if (this.kd > 0) {
      this.kt += dt; const p = Math.min(1, this.kt / this.kd), s = Math.sin(p * Math.PI);
      if (this.kind === 'cast') { ax = bx = -2.5 * s; lean = -0.1 * s; up = 0.06 * s; } else if (this.kind === 'dash') { lean = 0.5 * s; ax = bx = 0.9 * s; } else { bx = -2.4 * s + 0.4 * p; ax = 0.8 * s; tw = 0.5 * s - 0.2 * p; lean = 0.18 * s; }
      if (p >= 1) this.kd = 0;
    }
    this.armL.rotation.x = ax; this.armR.rotation.x = bx; this.legL.rotation.x = lx; this.legR.rotation.x = rx;
    this.torso.rotation.set(lean, tw, 0); this.headG.rotation.x = -lean * 0.5; this.torso.position.y = up;
    const dk = dead ? 1 : 0; this.dead += (dk - this.dead) * Math.min(1, dt * 8);
    this.hips.rotation.x = -this.dead * 1.45; this.hips.position.y += this.dead * 0.25;
  }
  dispose() { this.mat.dispose(); }
}

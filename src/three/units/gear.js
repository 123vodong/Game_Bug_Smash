// units/gear.js - cheap procedural champion identity on top of the 4 GLB bodies. Everything is derived from
// shared/moba/champions.js `look` (outfit / hat / prop / vehicle / palette) and merged into ONE vertex-coloured geometry per
// (champion, slot) that is cached and shared by every view, so a champion costs 3 draw calls (hat, prop, outfit) at most.
// Bone-local frames (KayKit Rig_Medium, unscaled): +Y up the bone, +Z = front of the body.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const cache = new Map();
let MAT = null;
export const gearMaterial = () => MAT || (MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05, envMapIntensity: 0.5 }));

// ---- tiny geometry builder: part() bakes a primitive (position/rotation/scale/colour) into a list; build() merges to one BufferGeometry ----
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
function part(list, geo, color, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.deleteAttribute('uv');
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)); g.applyMatrix4(_m);
  _c.set(color); const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); list.push(g);
}
const build = (list) => { const g = mergeGeometries(list, false); for (const l of list) l.dispose(); return g; };
const SPH = new THREE.SphereGeometry(1, 10, 7), BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(1, 1, 1, 10), CONE = new THREE.ConeGeometry(1, 1, 8), TOR = new THREE.TorusGeometry(1, 0.22, 5, 12);
const HALF = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); // dome
const DARK = 0x2a2a35, WHITE = 0xf2f2f2, STEEL = 0xb8c2cc, SCREEN = 0x7dffb0;

// ---- hats: head-bone local (head centre ~ origin, top of skull ~ y 0.38) ----
const HATS = {
  beret: (l, p) => { part(l, SPH, p[1], 0.06, 0.36, 0, 0.36, 0.1, 0.36); part(l, CYL, p[1], 0.06, 0.46, 0, 0.04, 0.06, 0.04); },
  hardhat: (l) => { part(l, HALF, 0xffd23f, 0, 0.3, 0, 0.4, 0.34, 0.4); part(l, CYL, 0xffd23f, 0, 0.3, 0.05, 0.46, 0.04, 0.46); part(l, BOX, 0xffd23f, 0, 0.5, 0, 0.06, 0.05, 0.4); },
  headlamp: (l) => { part(l, TOR, 0x555a66, 0, 0.2, 0, 0.36, 0.36, 0.5, Math.PI / 2); part(l, CYL, 0xfff3a0, 0, 0.26, 0.38, 0.1, 0.09, 0.1, Math.PI / 2); },
  visor: (l, p) => { part(l, TOR, p[1], 0, 0.2, 0, 0.37, 0.37, 0.5, Math.PI / 2); part(l, BOX, 0x66ccff, 0, 0.18, 0.38, 0.5, 0.04, 0.32); },
  mask: (l) => { part(l, BOX, DARK, 0, -0.05, 0.3, 0.55, 0.2, 0.12); part(l, TOR, DARK, 0, 0.22, 0, 0.37, 0.37, 0.5, Math.PI / 2); part(l, BOX, 0xd6a0ff, 0.22, 0.2, 0.2, 0.2, 0.05, 0.04, 0, 0, 0.3); },
  glasses: (l) => { part(l, TOR, 0x222222, -0.14, 0.08, 0.36, 0.12, 0.12, 0.12); part(l, TOR, 0x222222, 0.14, 0.08, 0.36, 0.12, 0.12, 0.12); part(l, BOX, 0x222222, 0, 0.08, 0.36, 0.08, 0.02, 0.02); },
  cap: (l, p) => { part(l, HALF, p[1], 0, 0.28, 0, 0.4, 0.3, 0.4); part(l, BOX, p[1], 0, 0.3, 0.42, 0.5, 0.04, 0.3); part(l, BOX, 0xffd23f, 0, 0.38, 0.34, 0.12, 0.06, 0.02); },
  bandana: (l, p) => { part(l, TOR, p[1], 0, 0.22, 0, 0.4, 0.4, 0.5, Math.PI / 2); part(l, BOX, p[1], -0.4, 0.2, -0.08, 0.22, 0.2, 0.04, 0, 0, 0.5); part(l, BOX, p[1], 0, 0.36, 0, 0.36, 0.1, 0.36); },
  helmet: (l, p) => { part(l, HALF, p[0], 0, 0.15, 0, 0.44, 0.42, 0.44); part(l, BOX, 0x222a33, 0, 0.12, 0.38, 0.6, 0.18, 0.1); part(l, BOX, WHITE, 0, 0.42, 0, 0.06, 0.04, 0.46); },
  goggles: (l, p) => { part(l, TOR, 0x333b44, 0, 0.2, 0, 0.38, 0.38, 0.5, Math.PI / 2); part(l, SPH, p[1], -0.14, 0.3, 0.34, 0.14, 0.14, 0.08); part(l, SPH, p[1], 0.14, 0.3, 0.34, 0.14, 0.14, 0.08); },
  headset: (l) => { part(l, TOR, 0x303842, 0, 0.12, 0, 0.42, 0.42, 0.42, 0, Math.PI / 2); part(l, SPH, 0x303842, -0.4, 0.0, 0, 0.12, 0.16, 0.16); part(l, SPH, 0x303842, 0.4, 0.0, 0, 0.12, 0.16, 0.16); part(l, CYL, 0x303842, 0.34, -0.12, 0.26, 0.025, 0.28, 0.025, 1.0); part(l, SPH, 0xff3b8a, 0.24, -0.2, 0.4, 0.04); },
  beanie: (l, p) => { part(l, HALF, p[0], 0, 0.22, 0, 0.4, 0.36, 0.4); part(l, TOR, p[1], 0, 0.26, 0, 0.4, 0.4, 0.3, Math.PI / 2); part(l, SPH, p[1], 0, 0.6, 0, 0.1); },
  headband: (l, p) => { part(l, TOR, p[0], 0, 0.22, 0, 0.4, 0.4, 0.4, Math.PI / 2); part(l, BOX, WHITE, 0, 0.22, 0.4, 0.12, 0.08, 0.02); },
  snapback: (l, p) => { part(l, HALF, p[0], 0, 0.28, 0, 0.4, 0.28, 0.4); part(l, BOX, p[1], 0, 0.3, 0.46, 0.46, 0.035, 0.28); part(l, BOX, p[1], 0, 0.42, 0, 0.5, 0.035, 0.5); },
  bun: (l, p) => { part(l, SPH, p[0], 0, 0.5, -0.12, 0.2); part(l, TOR, p[1], 0, 0.45, -0.12, 0.2, 0.2, 0.2, Math.PI / 2); part(l, TOR, 0x222222, 0.2, 0.1, 0.34, 0.1, 0.1, 0.1); },
  monocle: (l) => { part(l, TOR, 0xffd23f, 0.15, 0.08, 0.38, 0.14, 0.14, 0.14); part(l, CYL, 0xffd23f, 0.3, -0.2, 0.38, 0.01, 0.4, 0.01); part(l, HALF, 0x3a3a46, 0, 0.3, 0, 0.3, 0.12, 0.3); },
  flatcap: (l, p) => { part(l, CYL, p[0], 0.04, 0.34, 0, 0.42, 0.06, 0.42); part(l, BOX, p[0], 0.04, 0.32, 0.38, 0.4, 0.03, 0.22); },
  sleepmask: (l, p) => { part(l, BOX, 0x39406b, 0, 0.3, 0.2, 0.5, 0.2, 0.3, -0.5); part(l, SPH, p[1], 0.12, 0.34, 0.34, 0.05); part(l, SPH, p[1], -0.12, 0.34, 0.34, 0.05); part(l, TOR, 0x39406b, 0, 0.2, 0, 0.37, 0.37, 0.4, Math.PI / 2); },
};

// ---- held props: handslot.r local, built along +Y from the grip ----
const PROPS = {
  stylus: (l, p) => { part(l, CYL, p[1], 0, 0.35, 0, 0.04, 0.4, 0.04); part(l, CONE, 0xffffff, 0, 0.82, 0, 0.05, 0.14, 0.05); part(l, SPH, p[0], 0, -0.02, 0, 0.07); },
  database: (l, p) => { for (let i = 0; i < 3; i++) { part(l, CYL, i % 2 ? 0x9ab0bd : STEEL, 0, 0.2 + i * 0.2, 0, 0.26, 0.09, 0.26); part(l, TOR, p[1], 0, 0.27 + i * 0.2, 0, 0.26, 0.26, 0.2, Math.PI / 2); } },
  wrench: (l) => { part(l, CYL, STEEL, 0, 0.35, 0, 0.06, 0.4, 0.06); part(l, TOR, STEEL, 0, 0.8, 0, 0.14, 0.14, 0.14); part(l, BOX, 0xd13b2f, 0, 0.0, 0, 0.1, 0.12, 0.1); },
  magnifier: (l) => { part(l, CYL, 0x6b4a2b, 0, 0.2, 0, 0.04, 0.22, 0.04); part(l, TOR, 0xffd23f, 0, 0.62, 0, 0.26, 0.26, 0.26); part(l, CYL, 0x9be4ff, 0, 0.62, 0, 0.24, 0.015, 0.24, Math.PI / 2); },
  dagger: (l) => { part(l, BOX, 0xd8e0ea, 0, 0.5, 0, 0.07, 0.55, 0.02); part(l, BOX, 0x8a2be2, 0, 0.15, 0, 0.22, 0.05, 0.06); part(l, CYL, DARK, 0, 0.03, 0, 0.04, 0.14, 0.04); },
  chart: (l, p) => { part(l, BOX, WHITE, 0, 0.45, 0, 0.5, 0.5, 0.03); part(l, BOX, p[0], -0.14, 0.34, 0.03, 0.1, 0.18, 0.03); part(l, BOX, p[1], 0, 0.4, 0.03, 0.1, 0.3, 0.03); part(l, BOX, 0x2ecc71, 0.14, 0.45, 0.03, 0.1, 0.42, 0.03); },
  flashlight: (l) => { part(l, CYL, 0x232a35, 0, 0.25, 0, 0.07, 0.3, 0.07); part(l, CYL, 0x232a35, 0, 0.62, 0, 0.13, 0.1, 0.13); part(l, CYL, 0xfff3a0, 0, 0.68, 0, 0.11, 0.02, 0.11); },
  broom: (l, p) => { part(l, CYL, 0x8b6a3e, 0, 0.5, 0, 0.035, 0.7, 0.035); part(l, BOX, 0xe0c27a, 0, 1.25, 0, 0.26, 0.28, 0.12); part(l, BOX, p[1], 0, 1.1, 0, 0.28, 0.05, 0.14); },
  box: (l) => { part(l, BOX, 0xc89b5e, 0, 0.3, 0, 0.5, 0.4, 0.4); part(l, BOX, 0xe8d3a5, 0, 0.3, 0, 0.52, 0.06, 0.42); part(l, BOX, 0xe74c3c, 0, 0.52, 0, 0.14, 0.04, 0.1); },
  solder: (l) => { part(l, CYL, 0x232a35, 0, 0.2, 0, 0.06, 0.25, 0.06); part(l, CYL, STEEL, 0, 0.55, 0, 0.025, 0.2, 0.025); part(l, SPH, 0xff6a00, 0, 0.77, 0, 0.05); },
  laptop: (l, p) => { part(l, BOX, 0x39424e, 0, 0.1, 0.18, 0.55, 0.04, 0.4); part(l, BOX, 0x39424e, 0, 0.3, 0.0, 0.55, 0.4, 0.04, -0.15); part(l, BOX, SCREEN, 0, 0.3, 0.025, 0.46, 0.32, 0.01, -0.15); part(l, SPH, p[1], 0, 0.3, -0.03, 0.06, 0.06, 0.02); },
  phone: (l, p) => { part(l, BOX, 0x20242b, 0, 0.3, 0, 0.26, 0.5, 0.04); part(l, BOX, p[0], 0, 0.3, 0.025, 0.22, 0.42, 0.01); },
  stopwatch: (l) => { part(l, CYL, STEEL, 0, 0.3, 0, 0.26, 0.05, 0.26, Math.PI / 2); part(l, CYL, WHITE, 0, 0.3, 0.035, 0.22, 0.02, 0.22, Math.PI / 2); part(l, CYL, 0xff3b3b, 0, 0.58, 0, 0.04, 0.06, 0.04); part(l, BOX, 0x222222, 0.04, 0.34, 0.05, 0.03, 0.09, 0.01); },
  usb: (l, p) => { part(l, BOX, p[0], 0, 0.22, 0, 0.18, 0.34, 0.07); part(l, BOX, STEEL, 0, 0.5, 0, 0.12, 0.2, 0.04); },
  clipboard: (l) => { part(l, BOX, 0x8b6a3e, 0, 0.4, 0, 0.42, 0.55, 0.03); part(l, BOX, WHITE, 0, 0.38, 0.025, 0.34, 0.44, 0.01); part(l, BOX, STEEL, 0, 0.7, 0.035, 0.14, 0.05, 0.02); },
  redpen: (l) => { part(l, CYL, 0xe74c3c, 0, 0.3, 0, 0.04, 0.35, 0.04); part(l, CONE, 0x222222, 0, 0.7, 0, 0.04, 0.1, 0.04); part(l, BOX, WHITE, 0.04, 0.5, 0, 0.01, 0.12, 0.02); },
  mug: (l, p) => { part(l, CYL, WHITE, 0, 0.28, 0, 0.2, 0.26, 0.2); part(l, CYL, 0x5a3418, 0, 0.53, 0, 0.17, 0.01, 0.17); part(l, TOR, WHITE, 0.2, 0.28, 0, 0.1, 0.1, 0.1); part(l, SPH, 0xffffff, 0.02, 0.72, 0, 0.05); part(l, SPH, 0xffffff, -0.04, 0.84, 0.02, 0.04); },
  pager: (l) => { part(l, BOX, 0x20242b, 0, 0.3, 0, 0.3, 0.2, 0.08); part(l, BOX, SCREEN, 0, 0.32, 0.045, 0.22, 0.09, 0.01); part(l, BOX, 0xff1744, 0.1, 0.19, 0.045, 0.05, 0.03, 0.01); },
};

// ---- outfit accessories: chest-bone local, +Z front ----
const OUTFIT = {
  hoodie: (l, p) => { part(l, HALF, p[0], 0, 0.28, -0.18, 0.28, 0.2, 0.2, -0.9); part(l, BOX, p[1], 0, 0.0, 0.25, 0.08, 0.3, 0.03); },
  armor: (l, p) => { part(l, SPH, p[0], -0.4, 0.22, 0, 0.2, 0.14, 0.2); part(l, SPH, p[0], 0.4, 0.22, 0, 0.2, 0.14, 0.2); part(l, BOX, p[1], 0, 0.02, 0.26, 0.3, 0.3, 0.04); },
  vest: (l, p) => { part(l, BOX, p[0], 0, 0.0, 0.25, 0.5, 0.5, 0.05); part(l, BOX, 0xe8e8e8, 0, 0.0, 0.28, 0.5, 0.06, 0.02); part(l, BOX, 0xe8e8e8, 0, -0.12, 0.28, 0.5, 0.06, 0.02); },
  shirt: (l, p) => { part(l, BOX, p[1], 0, 0.1, 0.26, 0.08, 0.34, 0.03); part(l, BOX, p[1], 0, -0.1, 0.27, 0.15, 0.1, 0.03); },
  labcoat: (l) => { part(l, BOX, WHITE, 0, -0.2, 0.24, 0.62, 0.8, 0.05); part(l, BOX, WHITE, 0, -0.3, -0.22, 0.62, 0.9, 0.05); part(l, BOX, 0x39c2ff, 0.18, -0.1, 0.28, 0.12, 0.12, 0.02); },
  sweater: (l, p) => { part(l, TOR, p[0], 0, 0.3, 0, 0.3, 0.3, 0.3, Math.PI / 2); part(l, BOX, p[1], 0, 0.0, 0.26, 0.5, 0.08, 0.03); },
  uniform: (l, p) => { part(l, BOX, p[1], 0, 0.05, 0.25, 0.1, 0.34, 0.03); part(l, SPH, 0xffd23f, 0.2, 0.12, 0.28, 0.07, 0.07, 0.03); part(l, BOX, 0x222222, 0, -0.12, 0.26, 0.5, 0.07, 0.03); },
  apron: (l, p) => { part(l, BOX, p[1], 0, -0.1, 0.26, 0.46, 0.7, 0.04); part(l, BOX, p[0], 0, 0.0, 0.29, 0.28, 0.2, 0.02); },
  jacket: (l, p) => { part(l, BOX, p[1], 0, 0.0, 0.26, 0.5, 0.06, 0.03); part(l, BOX, p[1], 0, -0.2, 0.26, 0.5, 0.06, 0.03); part(l, BOX, 0x222222, 0, 0.02, -0.26, 0.5, 0.5, 0.2); },
  barista: (l, p) => { part(l, BOX, 0x4a3320, 0, -0.1, 0.26, 0.46, 0.7, 0.04); part(l, BOX, p[1], 0, 0.1, 0.29, 0.3, 0.12, 0.02); part(l, BOX, 0xc0392b, 0, 0.3, 0.2, 0.2, 0.06, 0.04); },
  tshirt: (l, p) => { part(l, BOX, p[1], 0, 0.04, 0.26, 0.3, 0.26, 0.03); },
  polo: (l, p) => { part(l, BOX, WHITE, -0.1, 0.27, 0.22, 0.12, 0.1, 0.03, 0, 0, 0.5); part(l, BOX, WHITE, 0.1, 0.27, 0.22, 0.12, 0.1, 0.03, 0, 0, -0.5); part(l, BOX, p[1], 0, -0.02, 0.26, 0.5, 0.06, 0.03); },
  flannel: (l, p) => { for (let i = -1; i <= 1; i++) part(l, BOX, p[1], i * 0.16, 0.0, 0.26, 0.05, 0.55, 0.03); part(l, BOX, p[1], 0, 0.0, 0.26, 0.5, 0.05, 0.03); },
  blazer: (l, p) => { part(l, BOX, p[1], -0.14, 0.12, 0.26, 0.1, 0.36, 0.03, 0, 0, 0.3); part(l, BOX, p[1], 0.14, 0.12, 0.26, 0.1, 0.36, 0.03, 0, 0, -0.3); part(l, BOX, 0xc0392b, 0, 0.1, 0.29, 0.06, 0.28, 0.02); },
  cardigan: (l, p) => { part(l, BOX, p[1], -0.2, 0.0, 0.26, 0.1, 0.55, 0.03); part(l, BOX, p[1], 0.2, 0.0, 0.26, 0.1, 0.55, 0.03); part(l, SPH, 0xffe0e0, 0, 0.0, 0.27, 0.04); },
  turtleneck: (l, p) => { part(l, TOR, p[0], 0, 0.3, 0, 0.3, 0.3, 0.3, Math.PI / 2); part(l, BOX, p[1], 0, 0.0, 0.26, 0.2, 0.2, 0.03); },
};
const PIXEL_FALLBACK = (l, p) => part(l, OCT(), p[1], 0, 0.04, 0.26, 1, 1, 0.5);
function OCT() { return OCT.g || (OCT.g = new THREE.OctahedronGeometry(0.09)); }

/** cached merged geometry for (champion, slot); slot in 'hat' | 'prop' | 'outfit' | 'vehicle'. null when nothing to draw. */
export function gearGeometry(champId, look, slot) {
  const key = champId + ':' + slot; if (cache.has(key)) return cache.get(key);
  const pal = (look && look.palette) || [0xffffff, 0x888888], l = [];
  const fn = slot === 'hat' ? HATS[look.hat] : slot === 'prop' ? PROPS[look.prop] : slot === 'outfit' ? (OUTFIT[look.outfit] || PIXEL_FALLBACK) : null;
  if (slot === 'vehicle') { // courier scooter: deck + 2 wheels + steering column + bars
    part(l, BOX, pal[0], 0, 0.0, 0, 0.3, 0.06, 0.9); part(l, CYL, DARK, 0, 0.0, 0.5, 0.14, 0.06, 0.14, 0, 0, Math.PI / 2); part(l, CYL, DARK, 0, 0.0, -0.5, 0.14, 0.06, 0.14, 0, 0, Math.PI / 2);
    part(l, CYL, STEEL, 0, 0.35, 0.48, 0.025, 0.4, 0.025, -0.2); part(l, BOX, DARK, 0, 0.68, 0.45, 0.5, 0.04, 0.04);
  } else if (fn) fn(l, pal);
  const g = l.length ? build(l) : null;
  // the GLB rigs are ~2.2 units tall (head bone origin = neck base, head centre ~y 0.57, radius ~0.55): fit the 0.4-radius authoring frame
  if (g && slot === 'hat') { g.scale(1.2, 1.2, 1.2); g.translate(0, 0.55, -0.05); } else if (g && slot === 'outfit') g.scale(1.6, 1.6, 1.6); else if (g && slot === 'prop') g.scale(1.4, 1.4, 1.4);
  cache.set(key, g); return g;
}
export function disposeGear() { for (const g of cache.values()) g && g.dispose(); cache.clear(); if (MAT) { MAT.dispose(); MAT = null; } }

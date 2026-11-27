// units/bugs.js - BUG SMASH themed procedural geometry (keep-bug-theme rule): lane-minion bugs, pets/wards/dummies, server-rack towers,
// production-server core, rubble + smoke. Vertex coloured (white = team tint), merged, instanced by instanced.js.
import * as THREE from 'three';
import { paint, merge, bx, sp, ell, limb, legs6 } from './geo.js';

const DARK = 0x2a2a30;

export function minionGeos() {
  // melee: crawling cockroach / beetle. forward = +z. Shell is mid-grey so the white team stripes pop (instance tint = team colour).
  const melee = merge([
    ell(0.2, 1, 0.62, 1.5, 0, 0.2, 0, 0xb4b4b4), bx(0.012, 0.01, 0.5, 0, 0.335, -0.02, 0x303038),
    bx(0.3, 0.012, 0.06, 0, 0.318, 0.06, 0xffffff), bx(0.3, 0.012, 0.06, 0, 0.30, -0.1, 0xffffff), // team stripes
    ell(0.1, 1, 0.8, 0.9, 0, 0.17, 0.34, 0x3a3328), sp(0.03, 0.06, 0.2, 0.41, 0xff4040, 0, 1.0), sp(0.03, -0.06, 0.2, 0.41, 0xff4040, 0, 1.0),
    limb(0.05, 0.1, 0.4, 0.07, 0.1, 0.5, 0.025, 0xd8d0c0), limb(-0.05, 0.1, 0.4, -0.07, 0.1, 0.5, 0.025, 0xd8d0c0), // mandibles
    limb(0.04, 0.24, 0.4, 0.16, 0.5, 0.6, 0.01, DARK, 0.6), limb(-0.04, 0.24, 0.4, -0.16, 0.5, 0.6, 0.01, DARK, -0.6), // antennae
    ...legs6(0.16, 0.14, 0.34, DARK),
  ]);
  // ranged: ladybug spitter with a glowing sting on its rear
  const ranged = merge([
    ell(0.19, 1, 0.78, 1.15, 0, 0.2, -0.02, 0xffffff), bx(0.012, 0.012, 0.42, 0, 0.35, -0.02, 0x15151a),
    sp(0.045, 0.09, 0.33, 0.06, 0x15151a), sp(0.045, -0.09, 0.33, -0.08, 0x15151a), sp(0.04, 0.12, 0.25, -0.12, 0x15151a), sp(0.04, -0.12, 0.27, 0.1, 0x15151a),
    ell(0.09, 1, 0.8, 0.9, 0, 0.17, 0.27, 0x15151a), sp(0.025, 0.05, 0.2, 0.33, 0xffffff), sp(0.025, -0.05, 0.2, 0.33, 0xffffff),
    limb(0, 0.28, -0.2, 0, 0.5, -0.4, 0.035, 0x59607a), sp(0.055, 0, 0.53, -0.42, 0xffffff, 0, 1.7), // glowing sting
    limb(0.03, 0.22, 0.32, 0.12, 0.44, 0.46, 0.008, DARK, 0.6), limb(-0.03, 0.22, 0.32, -0.12, 0.44, 0.46, 0.008, DARK, -0.6),
    ...legs6(0.14, 0.12, 0.28, 0x15151a, 0.013),
  ]);
  // siege: the big armored "Legacy Bug" tank - plated shell, rhino horn cannon, COBOL plaque, heavy legs
  const siege = merge([
    ell(0.26, 1, 0.55, 1.55, 0, 0.27, 0, 0x9aa0a8),
    bx(0.5, 0.05, 0.28, 0, 0.42, 0.18, 0xffffff), bx(0.46, 0.05, 0.26, 0, 0.44, -0.12, 0xdfe3ea), bx(0.38, 0.05, 0.22, 0, 0.45, -0.34, 0xb8bec8), // armour plates
    bx(0.3, 0.025, 0.1, 0, 0.5, 0.2, 0xd8cfb8), // legacy plaque
    ell(0.13, 1, 0.8, 0.9, 0, 0.24, 0.46, 0x3a3328), sp(0.035, 0.07, 0.29, 0.56, 0xff4040, 0, 1.0), sp(0.035, -0.07, 0.29, 0.56, 0xff4040, 0, 1.0),
    paint(new THREE.CylinderGeometry(0.05, 0.1, 0.5, 8).rotateX(Math.PI / 2 - 0.5).translate(0, 0.5, 0.48), 0x59607a), // horn cannon
    sp(0.05, 0, 0.64, 0.7, 0xffffff, 0, 0.9),
    ...legs6(0.22, 0.2, 0.44, DARK, 0.032),
  ]);
  const monster = merge([
    ell(0.3, 1, 0.8, 1, 0, 0.3, 0, 0xffffff), sp(0.06, 0.12, 0.44, 0.3, 0xfff27a), sp(0.06, -0.12, 0.44, 0.3, 0xfff27a), ...legs6(0.2, 0.12, 0.34, DARK),
  ]);
  // placed objects (kind 'obj'): a mug of coffee
  const misc = merge([paint(new THREE.CylinderGeometry(0.2, 0.17, 0.3, 10).translate(0, 0.15, 0), 0xffffff), paint(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 10).translate(0, 0.3, 0), 0x6b4a2b), paint(new THREE.TorusGeometry(0.1, 0.03, 6, 10).translate(0.24, 0.16, 0), 0xffffff)]);
  // pet: rubber duck
  const duck = merge([
    ell(0.17, 1, 0.8, 1.2, 0, 0.17, 0, 0xffd21f), ell(0.1, 1, 1, 1, 0, 0.4, 0.1, 0xffd21f), // body + head
    bx(0.14, 0.03, 0.1, 0, 0.38, 0.22, 0xff8a1f), sp(0.018, 0.05, 0.44, 0.17, 0x111111), sp(0.018, -0.05, 0.44, 0.17, 0x111111), // beak + eyes
    ell(0.07, 1, 0.5, 1.4, 0.15, 0.2, -0.02, 0xf0b800), ell(0.07, 1, 0.5, 1.4, -0.15, 0.2, -0.02, 0xf0b800), // wings
    ell(0.06, 0.8, 0.8, 1.2, 0, 0.26, -0.2, 0xffd21f),
  ]);
  // ward: tiny CCTV eye (team tinted body, glowing lens)
  const ward = merge([
    paint(new THREE.CylinderGeometry(0.02, 0.025, 0.5, 5).translate(0, 0.25, 0), 0x3a3f4f), paint(new THREE.CylinderGeometry(0.09, 0.11, 0.03, 8).translate(0, 0.015, 0), 0x3a3f4f),
    bx(0.14, 0.12, 0.26, 0, 0.56, 0.04, 0xffffff), paint(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 8).rotateX(Math.PI / 2).translate(0, 0.56, 0.2), 0x15151a),
    sp(0.04, 0, 0.56, 0.23, 0xffffff, 0, -1.8, 2.4), bx(0.03, 0.03, 0.03, 0.05, 0.63, -0.06, 0x7a1f1f), // lens + REC led
  ]);
  // training dummy with a bug sticker
  const dummy = merge([
    paint(new THREE.CylinderGeometry(0.28, 0.32, 0.08, 10).translate(0, 0.04, 0), 0x5a5243), bx(0.07, 0.4, 0.07, 0, 0.28, 0, 0x8a6a40),
    paint(new THREE.CylinderGeometry(0.2, 0.22, 0.46, 10).translate(0, 0.62, 0), 0xd2b07a), bx(0.62, 0.08, 0.08, 0, 0.74, 0, 0x8a6a40),
    sp(0.14, 0, 0.98, 0, 0xd2b07a), bx(0.2, 0.05, 0.02, 0, 0.98, 0.13, 0x8a6a40),
    ell(0.07, 1, 0.8, 1.3, 0, 0.62, 0.2, 0x7ed957), sp(0.035, 0, 0.62, 0.28, 0x2b6b2b), // bug sticker
    ...[-1, 1].flatMap((s) => [-0.05, 0, 0.05].map((z) => limb(s * 0.05, 0.62 + z, 0.21, s * 0.13, 0.62 + z * 1.6, 0.21, 0.006, 0x2b6b2b))),
  ]);
  return { melee, ranged, siege, monster, misc, duck, ward, dummy };
}

/** one face (+z) of a server rack: drive-bay panels + blinking LEDs; copied round the 4 sides */
function rackFace(w, y0, slots, slotH, seedBase) {
  const out = [], z = w / 2 + 0.005;
  for (let i = 0; i < slots; i++) {
    const y = y0 + (i + 0.5) * slotH;
    out.push(bx(w * 0.86, slotH * 0.78, 0.03, 0, y, z, i % 2 ? 0x2d3140 : 0x3a3f52));
    if (false) out.push(bx(w * 0.34, slotH * 0.3, 0.03, -w * 0.2, y + slotH * 0.1, z + 0.02, 0xffffff, 0, -0.9, seedBase + i * 1.7)); // one larger blinking panel (no tiny LEDs)
    out.push(bx(w * 0.3, 0.02, 0.02, w * 0.14, y - slotH * 0.15, z + 0.02, 0x15151a)); // vent slit
  }
  return out;
}
const rotY = (list, a) => list.map((g) => g.clone().rotateY(a));

export function towerGeos() {
  const W = 1.0, face = rackFace(W, 0.28, 8, 0.28, 0);
  const body = merge([
    bx(1.24, 0.2, 1.24, 0, 0.1, 0, 0x565d7a), bx(W, 2.5, W, 0, 1.45, 0, 0x6c7391), // plinth + cabinet
    bx(1.06, 0.14, 1.06, 0, 2.72, 0, 0xffffff), bx(1.06, 0.1, 1.06, 0, 0.3, 0, 0xffffff), // team bands (tinted)
    ...face, ...rotY(rackFace(W, 0.28, 8, 0.28, 3.3), Math.PI / 2), ...rotY(rackFace(W, 0.28, 8, 0.28, 6.1), Math.PI), ...rotY(rackFace(W, 0.28, 8, 0.28, 8.7), -Math.PI / 2),
    limb(0.3, 2.8, 0.3, 0.44, 3.1, 0.5, 0.012, 0x15151a), limb(-0.3, 2.8, -0.3, -0.44, 3.1, -0.5, 0.012, 0x15151a), // cables / antennas
    paint(new THREE.CylinderGeometry(0.14, 0.2, 0.2, 8).translate(0, 2.9, 0), 0x2b2f3d), // beacon socket
  ]);
  const crystal = merge([paint(new THREE.OctahedronGeometry(0.28).scale(0.8, 1.25, 0.8).translate(0, 3.15, 0), 0xffffff)]); // team beacon
  const ring = merge([bx(1.0, 0.03, 0.08, 0, 3.15, 0, 0xffffff), bx(0.08, 0.03, 1.0, 0, 3.15, 0, 0xffffff)]); // spinning beacon blades
  // Production Server core: stacked cabinets with a glowing screen + blinking LED rows
  const screen = [bx(1.3, 0.62, 0.03, 0, 1.38, 0.83, 0x0c1018), bx(1.2, 0.52, 0.03, 0, 1.38, 0.85, 0xffffff, 0, 0.8), ...[0, 1, 2, 3, 4].map((i) => bx(0.2 + ((i * 37) % 7) * 0.12, 0.04, 0.03, -0.45 + ((i * 37) % 7) * 0.06, 1.55 - i * 0.1, 0.87, 0x0c1018))];
  const cbody = merge([
    bx(2.1, 0.12, 1.7, 0, 0.06, 0, 0x565d7a), bx(2.0, 0.95, 1.6, 0, 0.6, 0, 0x6c7391), bx(1.6, 0.9, 1.3, 0, 1.55, -0.05, 0x8890ad),
    bx(2.04, 0.1, 1.64, 0, 1.12, 0, 0xffffff), bx(1.64, 0.1, 1.34, 0, 2.05, -0.05, 0xffffff), // team bands
    ...screen,
    bx(1.6, 0.1, 0.03, 0, 0.82, 0.82, 0xffffff, 0, 0.5), bx(1.6, 0.1, 0.03, 0, 0.5, 0.82, 0x3a3f52), // solid team stripe (no LED dots)
    paint(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 10).rotateZ(Math.PI / 2).translate(1.02, 0.6, 0), 0x2b2f3d), paint(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 10).rotateZ(Math.PI / 2).translate(-1.02, 0.6, 0), 0x2b2f3d), // fans
    limb(0.6, 2.0, -0.2, 0.75, 2.5, -0.2, 0.015, 0x15151a), limb(-0.6, 2.0, -0.2, -0.75, 2.5, -0.2, 0.015, 0x15151a),
  ]);
  const ccrystal = merge([paint(new THREE.IcosahedronGeometry(0.4, 0).scale(0.85, 1.3, 0.85).translate(0, 2.55, -0.05), 0xffffff)]);
  // destroyed: smoking rubble (scattered slabs + glowing embers)
  const rubble = merge([
    bx(1.2, 0.14, 1.1, 0, 0.07, 0, 0x2b2d37), bx(0.5, 0.25, 0.4, 0.3, 0.2, 0.1, 0x3a3d4a), bx(0.4, 0.3, 0.5, -0.3, 0.2, -0.15, 0x4a4e5e),
    paint(new THREE.BoxGeometry(0.6, 0.08, 0.35).rotateZ(0.5).rotateY(0.6).translate(0.1, 0.34, -0.3), 0x2b2d37), paint(new THREE.BoxGeometry(0.4, 0.06, 0.3).rotateZ(-0.6).rotateY(-0.4).translate(-0.35, 0.36, 0.3), 0x3a3d4a),
  ]);
  const smoke = merge([paint(new THREE.IcosahedronGeometry(0.22, 0), 0x55575f)]);
  return { body, crystal, ring, cbody, ccrystal, rubble, smoke };
}

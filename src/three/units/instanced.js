// units/instanced.js - InstancedMesh batch + jungle-camp geometry + the batch set (minion/tower geometry lives in bugs.js).
// (the "instancing off" comparison path of the spike is dropped; everything is instanced).
import * as THREE from 'three';
import { paint, merge, bx, sp, limb, FX, patchFx } from './geo.js';
import { minionGeos, towerGeos } from './bugs.js';

const WHITE = new THREE.Color(1, 1, 1);

export class Batch {
  constructor(scene, geometry, material, max, { shadow = true } = {}) {
    this.max = max; this.n = 0;
    this.inst = new THREE.InstancedMesh(geometry, material, max);
    this.inst.count = 0; this.inst.frustumCulled = false; this.inst.castShadow = shadow; this.inst.receiveShadow = true;
    this.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.inst.setColorAt(0, WHITE);
    this.inst.instanceColor.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.inst);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
    this._up = new THREE.Vector3(0, 1, 0);
  }
  begin() { this.n = 0; }
  /** color: hex number or THREE.Color; flash 0..1 lerps toward white */
  add(x, y, z, yaw, sx, sy, sz, color, flash = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this._m.compose(this._p.set(x, y, z), this._q.setFromAxisAngle(this._up, yaw), this._s.set(sx, sy, sz));
    this.inst.setMatrixAt(i, this._m);
    this._c.set(color); if (flash > 0) this._c.lerp(WHITE, flash);
    this.inst.setColorAt(i, this._c);
  }
  end() { this.inst.count = this.n; this.inst.instanceMatrix.needsUpdate = true; this.inst.instanceColor.needsUpdate = true; }
  dispose() { this.inst.parent && this.inst.parent.remove(this.inst); this.inst.geometry.dispose(); this.inst.material.dispose(); this.inst.dispose(); }
}

export function campGeos() {
  const drone = merge([
    paint(new THREE.CylinderGeometry(0.2, 0.15, 0.34, 10).translate(0, 0.2, 0), 0xf4f4f0), // coffee mug body
    paint(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 10).translate(0, 0.36, 0), 0x6b4a2b), // coffee
    paint(new THREE.TorusGeometry(0.09, 0.025, 6, 10).translate(0.24, 0.2, 0), 0xf4f4f0), // handle
    bx(0.7, 0.025, 0.05, 0, 0.5, 0, 0x2b2f3d), bx(0.05, 0.025, 0.7, 0, 0.5, 0, 0x2b2f3d), // rotor cross
    paint(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 5).translate(0, 0.43, 0), 0x2b2f3d),
    sp(0.035, 0.07, 0.24, 0.17, 0x5ff3ff, 0, 1.2), sp(0.035, -0.07, 0.24, 0.17, 0x5ff3ff, 0, 1.2), // cyan eyes
  ]);
  const shredder = merge([
    bx(0.62, 0.42, 0.42, 0, 0.3, 0, 0x4a5568), bx(0.5, 0.05, 0.1, 0, 0.5, 0.12, 0x0b0b0b), // body + paper slot
    ...[-0.2, -0.1, 0, 0.1, 0.2].map((x) => paint(new THREE.ConeGeometry(0.035, 0.08, 4).rotateX(Math.PI).translate(x, 0.43, 0.2), 0xffffff)), // teeth
    bx(0.22, 0.3, 0.02, 0, 0.7, 0, 0xffffff), // shredded paper
    sp(0.05, 0.18, 0.34, 0.22, 0xff3b3b, 0, 1.3), sp(0.05, -0.18, 0.34, 0.22, 0xff3b3b, 0, 1.3), // angry red eyes
    paint(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 8).rotateZ(Math.PI / 2).translate(0.28, 0.08, 0.1), 0x1c1f2a), paint(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 8).rotateZ(Math.PI / 2).translate(-0.28, 0.08, 0.1), 0x1c1f2a),
  ]);
  const mainframe = merge([
    bx(0.62, 0.95, 0.4, 0, 0.5, 0, 0xd8cfb8), bx(0.62, 0.12, 0.4, 0, 1.0, 0, 0xb8ad92), bx(0.7, 0.06, 0.48, 0, 0.03, 0, 0x5a5243), // beige cabinet
    paint(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 12).rotateX(Math.PI / 2).translate(-0.15, 0.78, 0.22), 0x2b2b2b), paint(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 12).rotateX(Math.PI / 2).translate(0.15, 0.78, 0.22), 0x2b2b2b), // tape reels
    sp(0.03, -0.15, 0.78, 0.25, 0xff3b3b), sp(0.03, 0.15, 0.78, 0.25, 0xff3b3b),
    bx(0.44, 0.16, 0.02, 0, 0.5, 0.21, 0x2b2b2b),
    ...[0, 1, 2, 3, 4, 5].map((i) => sp(0.022, -0.17 + i * 0.068, 0.53 - (i % 2) * 0.07, 0.23, [0xff5e5e, 0x7ed957, 0xffd23f][i % 3], 0, -2.0, i * 1.9)), // blinkenlights
    bx(0.22, 0.05, 0.02, 0, 1.0, 0.21, 0x4a4232), // COBOL plate
  ]);
  // golden bug epic: shiny golden scarab beetle, glowing shell, scuttling legs
  const scarab = merge([
    paint(new THREE.SphereGeometry(0.3, 10, 8).scale(1, 0.55, 1.25).translate(0, 0.25, 0), 0xffd700, 0, 0.35),
    sp(0.14, 0, 0.27, 0.38, 0xffe066, 0, 0.5), bx(0.02, 0.02, 0.55, 0, 0.45, -0.02, 0xb8860b),
    ...[-1, 1].flatMap((sx) => [0.12, 0, -0.12].map((z, i) => limb(sx * 0.2, 0.2, z, sx * 0.42, 0.02, z + (i - 1) * -0.08, 0.016, 0x8a6a00, (i + (sx > 0 ? 1 : 0)) % 2 ? 1 : -1))),
    limb(0.06, 0.34, 0.45, 0.16, 0.6, 0.62, 0.01, 0x8a6a00, 0.6), limb(-0.06, 0.34, 0.45, -0.16, 0.6, 0.62, 0.01, 0x8a6a00, -0.6), // antennae
    sp(0.04, 0.09, 0.32, 0.5, 0x111111), sp(0.04, -0.09, 0.32, 0.5, 0x111111),
    sp(0.05, 0, 0.5, 0, 0xfff2a0, 0, 1.6), // gleam on the shell
  ]);
  // THE DEADLINE: bomb-with-timer clock. Hands tick by sim time (shader, pivot CLOCK_Y), digital countdown flashes, fuse sparks.
  const tick = (i) => { const a = (i / 12) * Math.PI * 2; return paint(new THREE.BoxGeometry(0.03, i % 3 ? 0.05 : 0.09, 0.03).translate(0, 0.38 - (i % 3 ? 0 : 0.02), 0).rotateZ(-a).translate(0, 0.62, 0.1), 0x222222); };
  const clock = merge([
    paint(new THREE.CylinderGeometry(0.5, 0.5, 0.18, 20).rotateX(Math.PI / 2).translate(0, 0.62, 0), 0xe8e8f0),
    paint(new THREE.TorusGeometry(0.5, 0.07, 8, 20).translate(0, 0.62, 0.0), 0xcc1f1f),
    ...Array.from({ length: 12 }, (_, i) => tick(i)),
    bx(0.04, 0.34, 0.04, 0, 0.62 + 0.17, 0.12, 0x111111, 0, 0, 1.2), bx(0.04, 0.24, 0.04, 0, 0.62 + 0.12, 0.14, 0xff2222, 0, 0, 0.1), // minute + hour hands (tick)
    sp(0.05, 0, 0.62, 0.15, 0xcc1f1f),
    paint(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8).rotateX(Math.PI / 2).translate(-0.34, 1.12, 0), 0xcc1f1f), paint(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8).rotateX(Math.PI / 2).translate(0.34, 1.12, 0), 0xcc1f1f), // alarm bells
    bx(0.12, 0.3, 0.12, -0.25, 0.12, 0, 0x555566), bx(0.12, 0.3, 0.12, 0.25, 0.12, 0, 0x555566), // legs
    bx(0.34, 0.12, 0.04, 0, 0.25, 0.1, 0xff2222, 0, -1.5, 3.3), // 00:00 countdown (flashes)
    limb(0, 1.14, 0, 0.1, 1.32, 0, 0.012, 0x3a2a1a), limb(0.1, 1.32, 0, 0.05, 1.42, 0, 0.012, 0x3a2a1a), sp(0.045, 0.05, 1.45, 0, 0xffd23f, 0, -2.2, 1.7), // fuse + spark
  ]);
  return { drone, shredder, mainframe, scarab, clock };
}

/** The batches used by minions/monsters and structures. */
export function makeBatches(scene) {
  const mg = minionGeos(), tg = towerGeos(), cg = campGeos();
  const std = (extra = {}) => patchFx(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1, ...extra }));
  const basic = () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const rack = { roughness: 0.55, metalness: 0.25 };
  // empty batches (count 0) are not drawn, so rarely-used kinds (pets, wards, dummies, rubble, smoke) cost nothing until they appear
  return {
    melee: new Batch(scene, mg.melee, std(), 160), ranged: new Batch(scene, mg.ranged, std(), 160), siege: new Batch(scene, mg.siege, std(), 40),
    monster: new Batch(scene, mg.monster, std(), 120), misc: new Batch(scene, mg.misc, std(), 160),
    duck: new Batch(scene, mg.duck, std(), 40), ward: new Batch(scene, mg.ward, std(), 40), dummy: new Batch(scene, mg.dummy, std(), 8),
    drone: new Batch(scene, cg.drone, std(), 60), shredder: new Batch(scene, cg.shredder, std(), 40), mainframe: new Batch(scene, cg.mainframe, std(), 20),
    scarab: new Batch(scene, cg.scarab, std({ emissive: 0x332200, metalness: 0.65, roughness: 0.3 }), 4), clock: new Batch(scene, cg.clock, std({ emissive: 0x220000 }), 4),
    tBody: new Batch(scene, tg.body, std(rack), 24), tCrystal: new Batch(scene, tg.crystal, basic(), 24, { shadow: false }),
    tRing: new Batch(scene, tg.ring, basic(), 24, { shadow: false }),
    cBody: new Batch(scene, tg.cbody, std(rack), 4), cCrystal: new Batch(scene, tg.ccrystal, basic(), 4, { shadow: false }),
    rubble: new Batch(scene, tg.rubble, std(), 28), smoke: new Batch(scene, tg.smoke, basic(), 96, { shadow: false }),
  };
}
export { FX };

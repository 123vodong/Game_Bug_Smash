// units3d.js - champions (rigged GLB + AnimationMixer), instanced minions / monsters / structures, instanced HP bars.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHAMPIONS } from '../shared/moba/champions.js';
import { S, TEAM_COL } from './world3d.js';

const CHAMP_SCALE = 0.72;

// champion id -> [base model, right-hand item, left-hand item]
const LOOK = {
  stack: ['Knight', '1H_Sword', 'Rectangle_Shield'], guard: ['Knight', '1H_Sword', 'Spike_Shield'], ops: ['Knight', '1H_Sword', 'Badge_Shield'],
  dev: ['Barbarian', '2H_Axe', null], barista: ['Barbarian', 'Mug', 'Barbarian_Round_Shield'],
  pixel: ['Mage', '1H_Wand', 'Spellbook'], cleaner: ['Mage', '2H_Staff', null], model: ['Mage', '2H_Staff', null], lint: ['Mage', '1H_Wand', 'Spellbook_open'],
  embedded: ['Mage', '1H_Wand', 'Spellbook'], hr: ['Mage', '2H_Staff', null],
  zero: ['Rogue', 'Knife', 'Knife_Offhand'], courier: ['Rogue', 'Knife', null], sprint: ['Rogue', 'Knife', 'Knife_Offhand'], oncall: ['Barbarian', '1H_Axe', '1H_Axe_Offhand'],
  tester: ['Rogue', '1H_Crossbow', null], appdev: ['Rogue', '2H_Crossbow', null], cache: ['Rogue', '1H_Crossbow', null],
};
const ITEM_NAMES = new Set(['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield', '1H_Sword', '2H_Sword', 'Spellbook', 'Spellbook_open', '1H_Wand', '2H_Staff',
  'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable', '1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', '2H_Axe', 'Mug']);
const SLOT_ANIM = { melee: { q: '2H_Melee_Attack_Slice', w: 'Block_Attack', e: 'Dodge_Forward', r: '2H_Melee_Attack_Spin' }, ranged: { q: 'Spellcast_Shoot', w: 'Spellcast_Raise', e: 'Dodge_Forward', r: 'Spellcast_Long' } };

// ---------- generic batch: instanced when possible, plain meshes for the "instancing off" comparison ----------
export class Batch {
  constructor(scene, geometry, material, max, { shadow = true } = {}) {
    this.scene = scene; this.geo = geometry; this.mat = material; this.max = max; this.shadow = shadow;
    this.inst = new THREE.InstancedMesh(geometry, material, max);
    this.inst.count = 0; this.inst.frustumCulled = false; this.inst.castShadow = shadow; this.inst.receiveShadow = true;
    this.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.inst.setColorAt(0, new THREE.Color(1, 1, 1));
    this.inst.instanceColor.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.inst);
    this.pool = []; this.group = new THREE.Group(); scene.add(this.group); this.group.visible = false;
    this.matCache = new Map(); this.instanced = true; this.n = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
    this._up = new THREE.Vector3(0, 1, 0);
  }
  setInstanced(on) { this.instanced = on; this.inst.visible = on; this.group.visible = !on; }
  begin() { this.n = 0; }
  add(x, y, z, yaw, sx, sy, sz, color, flash = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this._p.set(x, y, z); this._q.setFromAxisAngle(this._up, yaw); this._s.set(sx, sy, sz);
    if (this.instanced) {
      this._m.compose(this._p, this._q, this._s);
      this.inst.setMatrixAt(i, this._m);
      this._c.set(color); if (flash > 0) this._c.lerp(WHITE, flash);
      this.inst.setColorAt(i, this._c);
    } else {
      let m = this.pool[i];
      if (!m) { m = new THREE.Mesh(this.geo, this.mat); m.castShadow = this.shadow; m.receiveShadow = true; this.pool[i] = m; this.group.add(m); }
      const key = color && color.isColor ? color.getHex() : color;
      let mm = this.matCache.get(key);
      if (!mm) { mm = this.mat.clone(); mm.color.set(color); this.matCache.set(key, mm); }
      m.material = mm; m.position.copy(this._p); m.quaternion.copy(this._q); m.scale.copy(this._s); m.visible = true;
    }
  }
  end() {
    if (this.instanced) {
      this.inst.count = this.n;
      this.inst.instanceMatrix.needsUpdate = true; if (this.inst.instanceColor) this.inst.instanceColor.needsUpdate = true;
    } else for (let i = this.n; i < this.pool.length; i++) this.pool[i].visible = false;
  }
}
const WHITE = new THREE.Color(1, 1, 1);

// ---------- procedural geometry ----------
function paint(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function merge(list) { return mergeGeometries(list.map((g) => { const x = g.index ? g.toNonIndexed() : g; x.deleteAttribute('uv'); return x; })); }
const cap = (r, h) => new THREE.CapsuleGeometry(r, h, 4, 8);

function minionGeos() {
  const melee = merge([
    paint(cap(0.15, 0.26).translate(0, 0.30, 0), 0xffffff), paint(new THREE.SphereGeometry(0.13, 10, 8).translate(0, 0.66, 0), 0xe8e0d0),
    paint(new THREE.BoxGeometry(0.06, 0.34, 0.28).translate(0.17, 0.36, 0.05), 0x8a93aa), paint(new THREE.BoxGeometry(0.05, 0.05, 0.34).translate(-0.13, 0.40, 0.12), 0xc8c8d8),
  ]);
  const ranged = merge([
    paint(cap(0.12, 0.28).translate(0, 0.30, 0), 0xffffff), paint(new THREE.SphereGeometry(0.12, 10, 8).translate(0, 0.66, 0), 0xe8e0d0),
    paint(new THREE.CylinderGeometry(0.015, 0.015, 0.8, 5).translate(-0.17, 0.42, 0.1), 0x6b5236), paint(new THREE.OctahedronGeometry(0.06).translate(-0.17, 0.85, 0.1), 0xfff2a0),
  ]);
  const siege = merge([
    paint(new THREE.BoxGeometry(0.46, 0.20, 0.66).translate(0, 0.28, 0), 0xffffff), paint(new THREE.CylinderGeometry(0.12, 0.16, 0.55, 10).rotateX(Math.PI / 2.6).translate(0, 0.52, 0.22), 0x59607a),
    paint(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 10).rotateZ(Math.PI / 2).translate(0.26, 0.17, 0.2), 0x2b2f3d), paint(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 10).rotateZ(Math.PI / 2).translate(-0.26, 0.17, 0.2), 0x2b2f3d),
    paint(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 10).rotateZ(Math.PI / 2).translate(0.26, 0.17, -0.2), 0x2b2f3d), paint(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 10).rotateZ(Math.PI / 2).translate(-0.26, 0.17, -0.2), 0x2b2f3d),
  ]);
  const monster = merge([
    paint(new THREE.IcosahedronGeometry(0.34, 1).scale(1, 0.85, 1).translate(0, 0.34, 0), 0xffffff),
    paint(new THREE.ConeGeometry(0.07, 0.25, 6).rotateZ(0.5).translate(0.2, 0.74, 0.0), 0xf3e6c4), paint(new THREE.ConeGeometry(0.07, 0.25, 6).rotateZ(-0.5).translate(-0.2, 0.74, 0.0), 0xf3e6c4),
    paint(new THREE.SphereGeometry(0.06, 6, 6).translate(0.12, 0.44, 0.3), 0xfff27a), paint(new THREE.SphereGeometry(0.06, 6, 6).translate(-0.12, 0.44, 0.3), 0xfff27a),
  ]);
  const misc = merge([paint(new THREE.CylinderGeometry(0.2, 0.26, 0.18, 10).translate(0, 0.09, 0), 0x6a7290), paint(new THREE.SphereGeometry(0.2, 10, 8).translate(0, 0.42, 0), 0xffffff), paint(new THREE.BoxGeometry(0.34, 0.06, 0.06).translate(0, 0.42, 0.18), 0xff5e5e)]);
  return { melee, ranged, siege, monster, misc };
}
function towerGeos() {
  const body = merge([
    paint(new THREE.CylinderGeometry(0.78, 0.9, 0.35, 8).translate(0, 0.17, 0), 0x6c7391),
    paint(new THREE.CylinderGeometry(0.34, 0.5, 2.0, 8).translate(0, 1.35, 0), 0x8890ad),
    paint(new THREE.CylinderGeometry(0.52, 0.34, 0.3, 8).translate(0, 2.5, 0), 0x6c7391),
    paint(new THREE.BoxGeometry(0.16, 1.5, 0.16).translate(0.42, 1.0, 0), 0x565d7a), paint(new THREE.BoxGeometry(0.16, 1.5, 0.16).translate(-0.42, 1.0, 0), 0x565d7a),
    paint(new THREE.BoxGeometry(0.16, 1.5, 0.16).translate(0, 1.0, 0.42), 0x565d7a), paint(new THREE.BoxGeometry(0.16, 1.5, 0.16).translate(0, 1.0, -0.42), 0x565d7a),
  ]);
  const crystal = merge([paint(new THREE.OctahedronGeometry(0.34).scale(0.8, 1.35, 0.8).translate(0, 3.05, 0), 0xffffff)]);
  const ring = merge([paint(new THREE.TorusGeometry(0.46, 0.05, 6, 20).rotateX(Math.PI / 2).translate(0, 1.85, 0), 0xffffff), paint(new THREE.TorusGeometry(0.4, 0.04, 6, 20).rotateX(Math.PI / 2).translate(0, 1.2, 0), 0xffffff)]);
  const cbody = merge([
    paint(new THREE.CylinderGeometry(1.0, 1.25, 0.5, 6).translate(0, 0.25, 0), 0x6c7391), paint(new THREE.CylinderGeometry(0.7, 0.95, 0.5, 6).translate(0, 0.72, 0), 0x8890ad),
    paint(new THREE.CylinderGeometry(0.16, 0.16, 1.1, 6).translate(0.75, 1.2, 0), 0x565d7a), paint(new THREE.CylinderGeometry(0.16, 0.16, 1.1, 6).translate(-0.75, 1.2, 0), 0x565d7a),
  ]);
  const ccrystal = merge([paint(new THREE.IcosahedronGeometry(0.62, 0).scale(0.85, 1.35, 0.85).translate(0, 1.85, 0), 0xffffff)]);
  return { body, crystal, ring, cbody, ccrystal };
}

// ---------- billboard HP bars: one instanced draw call ----------
export class HpBars {
  constructor(scene, camera, max = 400) {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aHp = new THREE.InstancedBufferAttribute(new Float32Array(max), 1); this.aHp.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aHp', this.aHp);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
      uniforms: { uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) } },
      vertexShader: `
        attribute float aHp; varying float vHp; varying vec2 vUv; varying vec3 vCol;
        uniform vec3 uRight, uUp;
        void main(){
          vHp = aHp; vUv = uv + vec2(0.0); vCol = instanceColor;
          vec3 c = instanceMatrix[3].xyz; vec2 sc = vec2(instanceMatrix[0][0], instanceMatrix[1][1]);
          vec3 p = c + uRight * position.x * sc.x + uUp * position.y * sc.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        varying float vHp; varying vec2 vUv; varying vec3 vCol;
        void main(){
          float edge = step(vUv.x, 0.02) + step(0.98, vUv.x) + step(vUv.y, 0.12) + step(0.88, vUv.y);
          vec3 col = vUv.x <= vHp ? vCol : vec3(0.07, 0.08, 0.12);
          if (edge > 0.0) col = vec3(0.02, 0.03, 0.05);
          gl_FragColor = vec4(col, 0.95);
        }`,
    });
    this.inst = new THREE.InstancedMesh(geo, this.mat, max);
    this.inst.frustumCulled = false; this.inst.renderOrder = 50; this.inst.count = 0;
    this.inst.setColorAt(0, new THREE.Color());
    scene.add(this.inst); this.max = max; this.n = 0; this.camera = camera;
    this._m = new THREE.Matrix4(); this._c = new THREE.Color(); this._r = new THREE.Vector3(); this._u = new THREE.Vector3();
  }
  begin() {
    this.camera.updateMatrixWorld();
    this._r.setFromMatrixColumn(this.camera.matrixWorld, 0); this._u.setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.mat.uniforms.uRight.value.copy(this._r); this.mat.uniforms.uUp.value.copy(this._u); this.n = 0;
  }
  add(x, y, z, w, h, frac, color) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this._m.makeScale(w, h, 1); this._m.setPosition(x, y, z);
    this.inst.setMatrixAt(i, this._m); this.inst.setColorAt(i, this._c.set(color)); this.aHp.array[i] = Math.max(0, Math.min(1, frac));
  }
  end() { this.inst.count = this.n; this.inst.instanceMatrix.needsUpdate = true; this.inst.instanceColor.needsUpdate = true; this.aHp.needsUpdate = true; }
}

// ---------- champion view ----------
class ChampView {
  constructor(parent, c, base, clips) {
    const def = CHAMPIONS[c.champ];
    this.id = c.id; this.def = def; this.ranged = !!def.ranged;
    this.root = new THREE.Group(); parent.add(this.root);
    const [model, right, left] = LOOK[c.champ] || ['Knight', '1H_Sword', null];
    this.model = SkeletonUtils.clone(base[model].scene);
    this.model.scale.setScalar(CHAMP_SCALE);
    this.root.add(this.model);
    const tint = new THREE.Color(1, 1, 1).lerp(new THREE.Color(def.look.palette[0]), 0.5), accent = new THREE.Color(def.look.palette[1]);
    this.mats = [];
    this.model.traverse((o) => {
      if (ITEM_NAMES.has(o.name)) o.visible = o.name === right || o.name === left;
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
        o.material = new THREE.MeshStandardMaterial({ map: o.material.map, color: tint, roughness: 0.72, metalness: 0.0, envMapIntensity: 0.45, emissive: new THREE.Color(0) }); this.mats.push(o.material);
      }
      if (o.name === 'chest') {
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }));
        gem.position.set(0, 0.04, 0.2); o.add(gem);
      }
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: TEAM_COL[c.team], transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
    this.ring.position.y = 0.03; this.root.add(this.ring);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = clips; this.act = {}; this.cur = null; this.busy = 0; this.dead = false; this.flashT = 0;
    this.px = c.x; this.py = c.y; this.yaw = c.team === 'blue' ? -0.7 : 2.4; this.speed = 0; this.moving = false; this.seq = c.action_seq || 0;
    this.play('Idle', 0);
  }
  action(name) {
    let a = this.act[name];
    if (!a) { const clip = this.clips.find((k) => k.name === name); if (!clip) return null; a = this.act[name] = this.mixer.clipAction(clip); }
    return a;
  }
  play(name, fade = 0.15, { once = false, ts = 1 } = {}) {
    const a = this.action(name); if (!a) return;
    if (this.cur === a && !once) { a.timeScale = ts; return; }
    a.reset(); a.timeScale = ts; a.enabled = true;
    if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } else a.setLoop(THREE.LoopRepeat, Infinity);
    if (this.cur && this.cur !== a) a.crossFadeFrom(this.cur, fade, false);
    a.play(); this.cur = a;
  }
  oneShot(name, ts = 1.4) {
    const a = this.action(name); if (!a || this.dead) return;
    this.play(name, 0.06, { once: true, ts });
    this.busy = Math.min(a.getClip().duration / ts, 0.9);
  }
  flash() { this.flashT = 0.14; }
  slideTo(x0, y0, x1, y1, ms = 200) { this.slide = { t: 0, dur: ms / 1000, x0, y0, x1, y1 }; this.faceYaw = Math.atan2(x1 - x0, y1 - y0); }
  update(c, dt, sim) {
    // movement speed from sim position deltas
    const dx = c.x - this.px, dy = c.y - this.py, d = Math.hypot(dx, dy);
    const v = dt > 0 ? d / dt : 0;
    this.speed += (v - this.speed) * Math.min(1, dt * 12);
    this.px = c.x; this.py = c.y;
    if (d > 1.5) this.faceYaw = Math.atan2(dx, dy);
    if (this.faceYaw !== undefined) { let df = this.faceYaw - this.yaw; df = Math.atan2(Math.sin(df), Math.cos(df)); this.yaw += df * Math.min(1, dt * 14); }
    let ox = c.x, oy = c.y;
    if (this.slide) {
      const sl = this.slide; sl.t += dt; const k = Math.min(1, sl.t / sl.dur), e = 1 - (1 - k) * (1 - k);
      ox = sl.x0 + (sl.x1 - sl.x0) * e; oy = sl.y0 + (sl.y1 - sl.y0) * e;
      if (k >= 1) this.slide = null;
    }
    this.root.position.set(ox * S, 0, oy * S); this.model.rotation.y = this.yaw; this.ring.rotation.y = 0;
    if (c.dead && !this.dead) { this.dead = true; this.play('Death_A', 0.1, { once: true }); }
    else if (!c.dead && this.dead) { this.dead = false; this.cur = null; this.busy = 0; this.play('Idle', 0.2); }
    this.root.visible = true; this.ring.visible = !c.dead;
    if (!this.dead) {
      if (c.action_seq !== this.seq) {
        this.seq = c.action_seq; const slot = c.action;
        if ('qwer'.includes(slot) && slot.length === 1) this.oneShot(SLOT_ANIM[this.ranged ? 'ranged' : 'melee'][slot], 1.5);
      }
      if (this.busy > 0) this.busy -= dt;
      else {
        const moving = this.moving ? this.speed > 25 : this.speed > 70; this.moving = moving;
        if (moving) this.play('Running_A', 0.12, { ts: THREE.MathUtils.clamp(this.speed / 300, 0.7, 1.7) }); else this.play('Idle', 0.2);
      }
    }
    this.mixer.update(dt);
    if (this.flashT > 0) { this.flashT -= dt; const k = Math.max(0, this.flashT / 0.14) * 0.9; for (const m of this.mats) m.emissive.setRGB(k, k * 0.8, k * 0.7); }
  }
  head() { return new THREE.Vector3(this.root.position.x, 1.55, this.root.position.z); }
  attack() { this.oneShot(this.ranged ? (this.def.role === 'Marksman' ? '1H_Ranged_Shoot' : 'Spellcast_Shoot') : '1H_Melee_Attack_Slice_Horizontal', 2.0); }
  dispose() { this.root.parent?.remove(this.root); }
}

export class Units {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera; this.champs = new Map(); this.minionState = new Map(); this.flashes = new Map();
    this.root = new THREE.Group(); scene.add(this.root);
    this.hp = new HpBars(scene, camera); this.onGone = null;
    this.lunge = new Map();
  }
  async load() {
    const gl = new GLTFLoader();
    const names = ['Knight', 'Barbarian', 'Mage', 'Rogue'];
    const res = await Promise.all(names.map((n) => gl.loadAsync(`./assets/models/${n}.glb`)));
    this.base = {}; names.forEach((n, i) => { this.base[n] = res[i]; });
    this.clips = res[0].animations;
    const mg = minionGeos(), tg = towerGeos();
    const std = (extra = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1, ...extra });
    const basic = () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const s = this.scene;
    this.b = {
      melee: new Batch(s, mg.melee, std(), 160), ranged: new Batch(s, mg.ranged, std(), 160), siege: new Batch(s, mg.siege, std(), 40),
      monster: new Batch(s, mg.monster, std(), 60), misc: new Batch(s, mg.misc, std(), 60),
      tBody: new Batch(s, tg.body, std({ roughness: 0.55, metalness: 0.25 }), 24), tCrystal: new Batch(s, tg.crystal, basic(), 24, { shadow: false }), tRing: new Batch(s, tg.ring, basic(), 24, { shadow: false }),
      cBody: new Batch(s, tg.cbody, std({ roughness: 0.55, metalness: 0.25 }), 4), cCrystal: new Batch(s, tg.ccrystal, basic(), 4, { shadow: false }),
    };
  }
  setInstanced(on) { for (const b of Object.values(this.b)) b.setInstanced(on); }
  champView(c) {
    let v = this.champs.get(c.id);
    if (!v) { v = new ChampView(this.root, c, this.base, this.clips); this.champs.set(c.id, v); }
    return v;
  }
  flash(id) { const v = this.champs.get(id); if (v) v.flash(); else this.flashes.set(id, 0.14); }
  lungeUnit(id) { this.lunge.set(id, 0.18); }
  /** Per-frame: sync every visible entity from the sim state. */
  sync(sim, dt, t, myId) {
    const st = sim.clientState, me = st.champions.get(myId);
    for (const b of Object.values(this.b)) b.begin();
    this.hp.begin();
    const allyCol = 0x5fe36a, foeCol = 0xff4f5f, meCol = 0x39e8ff;
    // champions
    const seenC = new Set();
    st.champions.forEach((c) => {
      seenC.add(c.id); const v = this.champView(c); v.update(c, dt, sim);
      if (!c.dead) this.hp.add(c.x * S, 1.75, c.y * S, 0.95, 0.11, c.hp / c.maxHp, c.id === myId ? meCol : c.team === me.team ? allyCol : foeCol);
      v.root.visible = !(c.stealthed);
    });
    for (const [id, v] of this.champs) if (!seenC.has(id)) v.root.visible = false;
    // units
    const seenU = new Set();
    const heights = { melee: 0.95, ranged: 0.95, siege: 0.75 };
    st.units.forEach((u) => {
      if (u.alive === false) return;
      seenU.add(u.id);
      let ms = this.minionState.get(u.id);
      if (!ms) { ms = { x: u.x, y: u.y, yaw: u.team === 'blue' ? 2.4 : -0.7, ph: Math.random() * 6, team: u.team, kind: u.kind, camp: u.campId }; this.minionState.set(u.id, ms); }
      const dx = u.x - ms.x, dy = u.y - ms.y, d = Math.hypot(dx, dy);
      ms.x += dx * Math.min(1, dt * 18); ms.y += dy * Math.min(1, dt * 18);
      if (d > 0.6) { const want = Math.atan2(dx, dy); let df = want - ms.yaw; df = Math.atan2(Math.sin(df), Math.cos(df)); ms.yaw += df * Math.min(1, dt * 10); }
      const moving = d / Math.max(dt, 1e-3) > 30; ms.ph += dt * (moving ? 12 : 2);
      let lg = this.lunge.get(u.id) || 0; if (lg > 0) { lg -= dt; this.lunge.set(u.id, lg); }
      const bob = moving ? Math.abs(Math.sin(ms.ph)) * 0.06 : Math.sin(ms.ph) * 0.01;
      const f = Math.max(0, (this.flashes.get(u.id) || 0)); if (f > 0) this.flashes.set(u.id, f - dt);
      const fl = Math.max(0, f / 0.14), lungeD = lg > 0 ? Math.sin((lg / 0.18) * Math.PI) * 0.2 : 0;
      const px = ms.x * S + Math.sin(ms.yaw) * lungeD, pz = ms.y * S + Math.cos(ms.yaw) * lungeD;
      const col = u.team === 'blue' ? TEAM_COL.blue : u.team === 'red' ? TEAM_COL.red : 0xb18cff;
      let top = 1.2, w = 0.55;
      if (u.kind === 'melee' || u.kind === 'ranged') this.b[u.kind].add(px, bob, pz, ms.yaw, 1.25, 1.25, 1.25, col, fl);
      else if (u.kind === 'siege') { this.b.siege.add(px, bob * 0.3, pz, ms.yaw, 1.2, 1.2, 1.2, col, fl); top = 0.9; w = 0.7; }
      else if (u.team === 'neutral' || u.kind === 'small' || u.kind === 'medium' || u.kind === 'big') {
        const k = { small: 0.8, medium: 1.1, big: 1.5 }[u.kind] || (u.maxHp > 3000 ? 2.4 : 1.7);
        const hue = { small: 0x7ed957, medium: 0xb18cff, big: 0xff9a4a }[u.kind] || 0xff5ad8;
        this.b.monster.add(px, bob * 0.6, pz, ms.yaw, k, k, k, hue, fl); top = 0.95 * k + 0.1; w = 0.5 * k + 0.2;
      } else { this.b.misc.add(px, bob * 0.3, pz, ms.yaw, 1, 1, 1, col, fl); top = 0.75; w = 0.4; }
      if (u.hp < u.maxHp || u.team === 'neutral') this.hp.add(px, top, pz, w, 0.07, u.hp / u.maxHp, u.team === me.team ? allyCol : u.team === 'neutral' ? 0xffd23f : foeCol);
    });
    for (const [id, ms] of this.minionState) if (!seenU.has(id)) { this.minionState.delete(id); this.onGone?.(ms); }
    // structures
    st.structures.forEach((s) => {
      const col = TEAM_COL[s.team], dead = s.alive === false || s.hp <= 0;
      const isCore = s.kind === 'core', x = s.x * S, z = s.y * S;
      const pulse = 0.75 + 0.25 * Math.sin(t * 2.2 + s.x);
      const f = Math.max(0, this.flashes.get(s.id) || 0); if (f > 0) this.flashes.set(s.id, f - dt);
      const bodyCol = dead ? 0x2a2d3a : s.team === 'blue' ? 0xa8c4ff : 0xffb4bc;
      if (isCore) {
        this.b.cBody.add(x, 0, z, 0, 0.85, dead ? 0.2 : 0.85, 0.85, bodyCol, f / 0.14);
        if (!dead) this.b.cCrystal.add(x, 0.15 * Math.sin(t * 1.5), z, t * 0.8, 0.85, 0.85, 0.85, new THREE.Color(col).multiplyScalar(s.invulnerable ? 0.35 : 1.2 * pulse));
      } else {
        this.b.tBody.add(x, 0, z, 0, 0.75, dead ? 0.15 : 0.75, 0.75, bodyCol, f / 0.14);
        if (!dead) {
          const k = s.invulnerable ? 0.3 : 1.25 * pulse, cc = new THREE.Color(col).multiplyScalar(k);
          this.b.tCrystal.add(x, 0.06 * Math.sin(t * 2 + s.x), z, t * 1.2, 0.75, 0.75, 0.75, cc);
          this.b.tRing.add(x, 0, z, t * 0.4, 0.75, 0.75, 0.75, cc.clone().multiplyScalar(0.8));
        }
      }
      if (!dead && s.hp < s.maxHp) this.hp.add(x, isCore ? 2.7 : 2.9, z, isCore ? 1.6 : 1.1, 0.13, s.hp / s.maxHp, s.team === me.team ? allyCol : foeCol);
    });
    for (const b of Object.values(this.b)) b.end();
    this.hp.end();
  }
  /** nearest enemy entity (champion / unit / structure) around a world point. */
  pick(sim, myTeam, x, y) {
    const st = sim.clientState; let best = null, bd = 1e9;
    const test = (e, r, kindOk) => { if (!kindOk) return; const d = Math.hypot(e.x - x, e.y - y); if (d < r && d < bd) { bd = d; best = e.id; } };
    st.champions.forEach((c) => test(c, 90, c.team !== myTeam && !c.dead));
    st.units.forEach((u) => test(u, 70, u.team !== myTeam && u.alive !== false && u.kind !== 'pet' && u.kind !== 'obj'));
    st.structures.forEach((s) => test(s, s.kind === 'core' ? 150 : 110, s.team !== myTeam && s.alive !== false));
    return best;
  }
  entity(sim, id) { const st = sim.clientState; return st.champions.get(id) || st.units.get(id) || st.structures.get(id); }
}

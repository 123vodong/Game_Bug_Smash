// story/bugs.js - the Story BESTIARY as cheap instanced meshes (keep-bug-theme): Null Bug, Ladybug, Legacy Beetle,
// Race Condition (flicker + twin), Memory Leak (swells), Heisenbug (phases in/out), Legacy (armoured), and the BUG NEST mound.
// createBugs({THREE,scene,source}) -> { sync(st, dtSec, tSec), pick(x,y)->id|null, dispose() }
// Story units (u._story) are drawn ONLY here; launch.js hides them from units/index.js so no mug placeholders appear.
// Zero per-frame allocation: batches + HP bars are reused; per-bug state lives in a Map keyed by unit id (created on spawn).
import * as THREE from 'three';
import { Batch } from '../units/instanced.js';
import { paint, merge, bx, sp, ell, limb, legs6, patchFx, FX } from '../units/geo.js';
import { HpBars } from '../units/hpbars.js';
import { S } from '../world/ground.js';

const INK = 0x15151a;
const rotY = (g, a) => g.rotateY(a);

function geos() {
  // Null Bug: void-black blob with a glitch-magenta "null" slashed circle on its back and ' ' eyes
  const nul = merge([
    ell(0.22, 1, 0.72, 1.3, 0, 0.2, 0, 0x23202e), ell(0.1, 1, 0.8, 0.9, 0, 0.18, 0.3, 0x2f2a3d),
    sp(0.05, 0.07, 0.25, 0.34, 0xffffff, 0, 1.0), sp(0.05, -0.07, 0.25, 0.34, 0xffffff, 0, 1.0),
    paint(new THREE.TorusGeometry(0.1, 0.02, 6, 12).rotateX(Math.PI / 2).translate(0, 0.36, -0.04), 0xff2bd6, 0, 1.3),
    paint(new THREE.BoxGeometry(0.26, 0.015, 0.03).rotateY(0.7).translate(0, 0.37, -0.04), 0xff2bd6, 0, 1.3),
    bx(0.1, 0.07, 0.1, 0.14, 0.34, 0.12, 0x7a3bff, 0, -1.6, 1.0), bx(0.07, 0.06, 0.07, -0.15, 0.3, 0.2, 0xff2bd6, 0, -1.6, 3.0), // glitch cubes
    limb(0.03, 0.26, 0.4, 0.13, 0.5, 0.55, 0.01, INK, 0.6), limb(-0.03, 0.26, 0.4, -0.13, 0.5, 0.55, 0.01, INK, -0.6),
    ...legs6(0.14, 0.13, 0.32, INK),
  ]);
  // Ladybug: red shell, black dots, white eyes
  const lady = merge([
    ell(0.2, 1, 0.78, 1.2, 0, 0.2, -0.02, 0xe0282e), bx(0.012, 0.012, 0.44, 0, 0.35, -0.02, INK),
    sp(0.045, 0.09, 0.33, 0.06, INK), sp(0.045, -0.09, 0.33, -0.08, INK), sp(0.04, 0.12, 0.25, -0.12, INK), sp(0.04, -0.12, 0.27, 0.1, INK),
    ell(0.09, 1, 0.8, 0.9, 0, 0.17, 0.27, INK), sp(0.025, 0.05, 0.2, 0.33, 0xffffff, 0, 0.8), sp(0.025, -0.05, 0.2, 0.33, 0xffffff, 0, 0.8),
    limb(0.03, 0.22, 0.32, 0.12, 0.44, 0.46, 0.008, INK, 0.6), limb(-0.03, 0.22, 0.32, -0.12, 0.44, 0.46, 0.008, INK, -0.6),
    ...legs6(0.14, 0.12, 0.28, INK, 0.013),
  ]);
  // Legacy Beetle / Legacy: armour plates, COBOL plaque with green terminal text, horn pincers
  const mkBeetle = (shell, plate1, plate2) => merge([
    ell(0.26, 1, 0.6, 1.5, 0, 0.27, 0, shell),
    bx(0.46, 0.05, 0.26, 0, 0.43, 0.15, plate1), bx(0.42, 0.05, 0.24, 0, 0.45, -0.15, plate2), bx(0.36, 0.05, 0.2, 0, 0.44, -0.36, plate1),
    bx(0.3, 0.03, 0.1, 0, 0.5, 0.0, 0x1b1b1b), bx(0.24, 0.012, 0.012, 0, 0.52, 0.02, 0x39ff6a, 0, -1.1, 0.5), bx(0.16, 0.012, 0.012, -0.04, 0.52, -0.02, 0x39ff6a, 0, -1.1, 2.0),
    ell(0.13, 1, 0.8, 0.9, 0, 0.24, 0.46, 0x3a3328), sp(0.035, 0.07, 0.29, 0.56, 0xff4040, 0, 1.0), sp(0.035, -0.07, 0.29, 0.56, 0xff4040, 0, 1.0),
    limb(0.08, 0.2, 0.55, 0.16, 0.28, 0.78, 0.03, 0xd8cfb8), limb(-0.08, 0.2, 0.55, -0.16, 0.28, 0.78, 0.03, 0xd8cfb8), // pincers
    ...legs6(0.22, 0.2, 0.44, INK, 0.03),
  ]);
  const beetle = mkBeetle(0x7a6a4f, 0xcbbf9c, 0xb2a67f), legacy = mkBeetle(0x4a4f5c, 0x9aa0a8, 0x7c828c);
  // Race Condition: twin-thread teal bug with two arrow tails. A second (ghost) copy is drawn offset + translucent.
  const race = merge([
    ell(0.19, 1, 0.7, 1.35, 0, 0.2, 0, 0x32d6c2), bx(0.05, 0.012, 0.4, 0.06, 0.33, 0, 0xff4fd8, 0, 1.0), bx(0.05, 0.012, 0.4, -0.06, 0.33, 0, 0x3a6bff, 0, 1.0), // two racing threads
    ell(0.09, 1, 0.8, 0.9, 0, 0.18, 0.3, 0x1d8f82), sp(0.03, 0.05, 0.23, 0.37, 0xffffff, 0, 1.0), sp(0.03, -0.05, 0.23, 0.37, 0xffffff, 0, 1.0),
    limb(0, 0.26, -0.22, 0.1, 0.4, -0.5, 0.02, 0xff4fd8, 0, 1.0), limb(0, 0.26, -0.22, -0.1, 0.4, -0.5, 0.02, 0x3a6bff, 0, 1.0),
    ...legs6(0.14, 0.12, 0.28, INK, 0.013),
  ]);
  // Memory Leak: green slime that swells, dripping, with a RAM stick stuck in its back
  const leak = merge([
    ell(0.24, 1, 0.8, 1.1, 0, 0.2, 0, 0x6bd24a), ell(0.14, 1, 0.8, 0.9, 0.1, 0.18, 0.2, 0x8be866), sp(0.05, -0.12, 0.34, 0.1, 0xb4ff8a),
    sp(0.04, 0.07, 0.24, 0.3, 0xffffff, 0, 0.8), sp(0.04, -0.07, 0.24, 0.3, 0xffffff, 0, 0.8), sp(0.018, 0.07, 0.24, 0.33, INK), sp(0.018, -0.07, 0.24, 0.33, INK),
    bx(0.34, 0.07, 0.03, 0, 0.5, -0.05, 0x1f7a2e), bx(0.05, 0.05, 0.035, -0.1, 0.5, -0.05, INK), bx(0.05, 0.05, 0.035, 0.0, 0.5, -0.05, INK), bx(0.05, 0.05, 0.035, 0.1, 0.5, -0.05, INK), bx(0.32, 0.012, 0.035, 0, 0.465, -0.05, 0xffd23f), // DDR stick + gold pins
    sp(0.035, 0.18, 0.06, 0.1, 0x6bd24a), sp(0.03, -0.2, 0.05, -0.12, 0x6bd24a), // drips
  ]);
  // Heisenbug: violet bug with a floating "?" (rendered phasing in/out by sync)
  const heis = merge([
    ell(0.2, 1, 0.75, 1.25, 0, 0.22, 0, 0xa07bff), ell(0.09, 1, 0.8, 0.9, 0, 0.2, 0.3, 0x7a55e0), sp(0.04, 0.06, 0.27, 0.37, 0xffffff, 0, 1.2), sp(0.04, -0.06, 0.27, 0.37, 0xffffff, 0, 1.2),
    paint(new THREE.TorusGeometry(0.06, 0.018, 6, 10, Math.PI * 1.5).translate(0, 0.62, 0), 0xffe9ff, 0, 1.4), sp(0.02, 0, 0.5, 0, 0xffe9ff, 0, 1.4), // ?
    ...legs6(0.14, 0.12, 0.28, 0x2a1d5a, 0.013),
  ]);
  // BUG NEST: tangled-cable mound, glowing eyes in the holes, egg sacs, BSOD monitor, warning sign
  const cab = [0xff5e5e, 0x39c2ff, 0xffd23f, 0x7ed957, 0xb084ff];
  const cables = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, b = a + 1.9, r0 = 0.46, h = 0.4 + (i % 3) * 0.12;
    cables.push(limb(Math.cos(a) * r0, 0.04, Math.sin(a) * r0, Math.cos(a) * 0.25, h, Math.sin(a) * 0.25, 0.028, cab[i % 5]));
    cables.push(limb(Math.cos(a) * 0.25, h, Math.sin(a) * 0.25, Math.cos(b) * r0, 0.04, Math.sin(b) * r0, 0.028, cab[(i + 2) % 5]));
  }
  const nest = merge([
    ell(0.52, 1, 0.8, 1, 0, 0.02, 0, 0x4a2260), ell(0.34, 1, 0.8, 1, 0, 0.22, 0, 0x5b2a6e), ...cables,
    ...[[0.2, 0.3, 0.38], [-0.24, 0.36, 0.3], [0.02, 0.2, -0.42], [0.38, 0.2, -0.18]].map(([x, y, z], i) => merge([ell(0.07, 1, 0.8, 1, x, y, z, 0x000000), sp(0.026, x - 0.025, y + 0.01, z + 0.05, 0xff5e5e, 0, i % 2 ? 1.6 : -1.6, i * 1.7), sp(0.026, x + 0.03, y + 0.01, z + 0.05, 0xff5e5e, 0, i % 2 ? 1.6 : -1.6, i * 1.7)])),
    ell(0.1, 1, 1.2, 1, -0.38, 0.12, 0.3, 0xb4ff8a, 0, 0.6), ell(0.08, 1, 1.2, 1, 0.34, 0.1, -0.28, 0xb4ff8a, 0, 0.6), // egg sacs
    bx(0.3, 0.22, 0.03, -0.12, 0.62, 0.05, 0x1d5fd6, 0, 0.9), bx(0.34, 0.26, 0.02, -0.12, 0.62, 0.03, 0x20242e), bx(0.1, 0.03, 0.01, -0.12, 0.64, 0.08, 0xffffff, 0, 1.0), // BSOD
    bx(0.025, 0.55, 0.025, 0.3, 0.6, 0.1, 0x8a8a8a), paint(new THREE.ConeGeometry(0.15, 0.2, 3).translate(0.3, 0.98, 0.1), 0xffd23f, 0, 0.5), bx(0.025, 0.07, 0.02, 0.3, 0.96, 0.2, INK), // warning sign
  ]);
  // squash splat left behind: flat green goo + black X (cleaned up after ~1.4 s)
  const splat = merge([
    ell(0.3, 1, 0.1, 1, 0, 0.02, 0, 0x3b8f2b), ell(0.14, 1, 0.1, 1, 0.26, 0.02, 0.1, 0x3b8f2b), ell(0.1, 1, 0.1, 1, -0.24, 0.02, -0.14, 0x3b8f2b),
    paint(new THREE.BoxGeometry(0.34, 0.03, 0.05).rotateY(0.78).translate(0, 0.06, 0), INK), paint(new THREE.BoxGeometry(0.34, 0.03, 0.05).rotateY(-0.78).translate(0, 0.06, 0), INK),
  ]);
  return { nul, lady, beetle, legacy, race, leak, heis, nest, splat };
}

/** kind string -> look. Unknown story kinds read as Null Bugs. */
function lookOf(kind) {
  const k = String(kind || '');
  if (k === 'nest') return 'nest';
  if (/lady/.test(k)) return 'lady';
  if (/legacy/.test(k)) return 'legacy';
  if (/beetle/.test(k)) return 'beetle';
  if (/race/.test(k)) return 'race';
  if (/leak/.test(k)) return 'leak';
  if (/heis/.test(k)) return 'heis';
  return 'nul';
}
const SCALE = { nul: 1.25, lady: 1.2, beetle: 1.55, legacy: 1.8, race: 1.3, leak: 1.25, heis: 1.3, nest: 1.25 };
const TINT = 0xdddddd;

export function createBugs({ scene, source } = {}) {
  const g = geos();
  const std = (o = {}) => patchFx(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1, ...o }));
  const ghostMat = patchFx(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, transparent: true, opacity: 0.42, depthWrite: false, emissive: 0x113344 }));
  const B = {
    nul: new Batch(scene, g.nul, std(), 60), lady: new Batch(scene, g.lady, std(), 60), beetle: new Batch(scene, g.beetle, std(), 40), legacy: new Batch(scene, g.legacy, std(), 20),
    race: new Batch(scene, g.race, std(), 40), leak: new Batch(scene, g.leak, std(), 40), heis: new Batch(scene, g.heis, std(), 20),
    nest: new Batch(scene, g.nest, std({ roughness: 0.8 }), 8), splat: new Batch(scene, g.splat, std(), 32, { shadow: false }),
    ghost: new Batch(scene, g.race, ghostMat, 80, { shadow: false }), ghostH: new Batch(scene, g.heis, ghostMat, 40, { shadow: false }),
  };
  const list = Object.values(B), hp = new HpBars(scene, 160);
  const bugs = new Map(), seen = new Set(), splats = []; // splats: {x,z,age,sc} pool, reused slots
  for (let i = 0; i < 24; i++) splats.push({ x: 0, z: 0, age: 9, sc: 1 });
  let disposed = false, splatNext = 0;

  function addSplat(x, z, sc) { const s = splats[splatNext]; splatNext = (splatNext + 1) % splats.length; s.x = x; s.z = z; s.age = 0; s.sc = sc; }
  function realUnit(id) { const s = source.sim && source.sim.state; return s && s.units ? s.units.get(id) : null; }

  function sync(st, dt = 0.016, t = 0) {
    if (disposed || !st || !st.units) return;
    dt = Math.min(Math.max(dt, 0), 0.1);
    FX.uT.value = t;
    for (let i = 0; i < list.length; i++) list[i].begin();
    hp.begin(); seen.clear();
    st.units.forEach((u, key) => {
      if (!u._story || u.alive === false) return;
      const id = u.id || key; seen.add(id);
      let e = bugs.get(id);
      if (!e) { e = { x: u.x, y: u.y, yaw: -0.7, ph: Math.random() * 6.28, hp: u.hp, fl: 0, look: lookOf(u.kind), age: 0 }; bugs.set(id, e); }
      const dx = u.x - e.x, dy = u.y - e.y, d = Math.hypot(dx, dy);
      e.x += dx * Math.min(1, dt * 18); e.y += dy * Math.min(1, dt * 18); e.age += dt;
      if (d > 0.6) { const want = Math.atan2(dx, dy); let df = want - e.yaw; df = Math.atan2(Math.sin(df), Math.cos(df)); e.yaw += df * Math.min(1, dt * 10); }
      const moving = d / Math.max(dt, 1e-3) > 30; e.ph += dt * (moving ? 12 : 2);
      if (u.hp < e.hp - 0.5) e.fl = 0.14; e.hp = u.hp; if (e.fl > 0) e.fl -= dt;
      const fl = Math.max(0, e.fl) / 0.14, look = e.look;
      let sc = SCALE[look], px = e.x * S, pz = e.y * S, py = moving ? Math.abs(Math.sin(e.ph)) * 0.05 : Math.sin(e.ph) * 0.008, top = 0.45 * sc + 0.25, w = 0.5 * sc;
      if (look === 'nest') {
        sc *= 1 + 0.045 * Math.sin(t * 3.2 + e.ph); py = 0; top = 1.35; w = 1.1;
        if (u.hp < u.maxHp * 0.5) px += Math.sin(t * 40) * 0.012; // it is hurting
        B.nest.add(px, py, pz, 0.3, sc, sc, sc, TINT, fl);
        hp.add(px, top, pz, w, 0.1, u.maxHp > 0 ? u.hp / u.maxHp : 0, 0xb084ff);
        return;
      }
      if (look === 'leak') sc *= (1 + Math.min(0.5, e.age * 0.03)) * (1 + 0.08 * Math.sin(e.ph * 0.7)); // swells over time
      if (look === 'race') { // flickers out for a blink and leaves a twin: "who got there first?"
        const f = (t * 2.7 + e.ph) % 1;
        if (f < 0.93) B.race.add(px, py, pz, e.yaw, sc, sc, sc, TINT, fl);
        const o = 0.22 + 0.12 * Math.sin(t * 9 + e.ph);
        B.ghost.add(px + Math.cos(e.yaw) * o, py, pz - Math.sin(e.yaw) * o, e.yaw, sc, sc, sc, 0x9ffcf0, 0);
      } else if (look === 'heis') { // phases in and out; solid half the time, ghost the other half
        if (Math.sin(t * 1.8 + e.ph) > -0.2) B.heis.add(px, py + 0.04, pz, e.yaw, sc, sc, sc, TINT, fl);
        else B.ghostH.add(px, py + 0.04, pz, e.yaw, sc, sc, sc, 0xd8c8ff, 0);
      } else B[look].add(px, py, pz, e.yaw, sc, sc, sc, TINT, fl);
      if (u.hp < u.maxHp) hp.add(px, top, pz, w, 0.07, u.maxHp > 0 ? u.hp / u.maxHp : 0, 0xff4f5f);
    });
    // squashed: a unit that is gone and flagged dead in the real state leaves a splat (fog-hidden ones just vanish)
    for (const [id, e] of bugs) {
      if (seen.has(id)) continue;
      const r = realUnit(id);
      if (!r || r.alive === false) addSplat(e.x * S, e.y * S, e.look === 'nest' ? 2.4 : SCALE[e.look] * 0.9);
      bugs.delete(id);
    }
    for (let i = 0; i < splats.length; i++) {
      const s = splats[i]; if (s.age > 1.4) continue;
      s.age += dt; const k = s.age < 1 ? 1 : Math.max(0, 1 - (s.age - 1) / 0.4), pop = s.age < 0.12 ? 0.6 + s.age * 3.3 : 1;
      B.splat.add(s.x, 0, s.z, 0.4 * i, s.sc * pop * k, s.sc * pop * k, s.sc * pop * k, 0xdddddd, 0);
    }
    for (let i = 0; i < list.length; i++) list[i].end();
    hp.end();
  }

  /** nearest alive story bug / nest around a sim-space point -> unit id | null */
  function pick(x, y) {
    const st = source.state(); if (!st || !st.units) return null;
    let best = null, bd = 1e9;
    st.units.forEach((u, key) => {
      if (!u._story || u.alive === false) return;
      const r = u.kind === 'nest' ? 110 : 75, d = Math.hypot(u.x - x, u.y - y);
      if (d < r && d < bd) { bd = d; best = u.id || key; }
    });
    return best;
  }

  return {
    sync, pick, count: () => bugs.size,
    dispose() { disposed = true; for (const b of list) b.dispose(); hp.dispose(); bugs.clear(); },
  };
}
export default createBugs;

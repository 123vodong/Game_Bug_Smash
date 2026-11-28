// Decorative terrain beyond the playable rectangle.
// Everything is merged into two static meshes (terrain silhouettes + emissive accents),
// so the expanded horizon does not turn into hundreds of draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { S, terrainHeight } from './ground.js';

const PALETTE = {
  trunk: 0x172019,
  bark: 0x263126,
  leaf0: 0x183126,
  leaf1: 0x244735,
  leaf2: 0x315743,
  rock0: 0x27302e,
  rock1: 0x39423d,
  gold: 0x8d7135,
  blue: 0x174d65,
  red: 0x6b2830,
};

const colorize = (geo, hex) => {
  const c = new THREE.Color(hex), n = geo.attributes.position.count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    data[i * 3] = c.r;
    data[i * 3 + 1] = c.g;
    data[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return geo;
};

const nonIndexed = (geo) => {
  if (!geo.index) return geo;
  const out = geo.toNonIndexed();
  geo.dispose();
  return out;
};

const box = (w, h, d, x, y, z, hex) =>
  colorize(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
const cone = (r, h, x, y, z, hex, sides = 7) =>
  colorize(new THREE.ConeGeometry(r, h, sides).translate(x, y, z), hex);
const stone = (r, x, y, z, hex, sx = 1, sy = 1, sz = 1) =>
  colorize(new THREE.IcosahedronGeometry(r, 0).scale(sx, sy, sz).translate(x, y, z), hex);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashId(id) {
  let h = 2166136261;
  for (const c of String(id || '5v5')) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function transform(geo, x, y, z, scale, yaw) {
  const g = nonIndexed(geo);
  g.scale(scale, scale, scale);
  g.rotateY(yaw);
  g.translate(x, y, z);
  return g;
}

function treeParts(variant, teamTint) {
  const leaf = variant === 0 ? PALETTE.leaf0 : variant === 1 ? PALETTE.leaf1 : PALETTE.leaf2;
  const tint = teamTint === 'blue' ? 0x235367 : teamTint === 'red' ? 0x583238 : leaf;
  return [
    box(0.22, 1.1, 0.22, 0, 0.55, 0, variant === 2 ? PALETTE.bark : PALETTE.trunk),
    cone(0.78, 1.45, 0, 1.15, 0, tint, variant === 2 ? 6 : 8),
    cone(0.58, 1.1, 0.08, 1.78, -0.04, leaf, 7),
  ];
}

function ruinParts(teamTint) {
  const accent = teamTint === 'blue' ? PALETTE.blue : teamTint === 'red' ? PALETTE.red : PALETTE.gold;
  return [
    box(0.5, 1.45, 0.52, -0.46, 0.72, 0, PALETTE.rock0),
    box(0.5, 1.05, 0.52, 0.46, 0.52, 0, PALETTE.rock1),
    box(1.4, 0.22, 0.46, 0, 1.35, 0, PALETTE.rock0),
    box(0.08, 0.9, 0.55, -0.46, 0.75, 0.29, accent),
    box(0.08, 0.65, 0.55, 0.46, 0.55, 0.29, accent),
  ];
}

function rockParts(variant) {
  return [
    stone(0.58, 0, 0.42, 0, variant ? PALETTE.rock1 : PALETTE.rock0, 1.2, 0.75, 0.95),
    stone(0.32, 0.52, 0.22, 0.12, PALETTE.rock1, 0.9, 0.7, 1.1),
  ];
}

function serverMonolithParts(teamTint) {
  const led = teamTint === 'blue' ? 0x1b6d8c : teamTint === 'red' ? 0x8f2d38 : 0x3b7a52;
  return [
    box(0.74, 1.85, 0.58, 0, 0.92, 0, PALETTE.rock0),
    box(0.8, 0.12, 0.64, 0, 1.88, 0, PALETTE.rock1),
    box(0.56, 0.08, 0.04, 0, 1.48, 0.3, led),
    box(0.56, 0.08, 0.04, 0, 1.18, 0.3, PALETTE.gold),
    box(0.56, 0.08, 0.04, 0, 0.88, 0.3, led),
  ];
}

function merge(parts, material) {
  if (!parts.length) return null;
  const geo = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  return mesh;
}

export function makeOutskirts(world, lite = false) {
  const W = ((world && world.w) || 6000) * S;
  const H = ((world && world.h) || 6000) * S;
  const random = rng(hashId(world && world.id));
  const solid = [], glow = [];
  const placed = [];
  const margin0 = 4.5, margin1 = 39;
  const count = lite ? 88 : 168;

  const sidePoint = () => {
    const side = (random() * 4) | 0;
    const depth = margin0 + Math.pow(random(), 0.72) * (margin1 - margin0);
    if (side === 0) return [-depth, random() * H, side];
    if (side === 1) return [W + depth, random() * H, side];
    if (side === 2) return [random() * W, -depth, side];
    return [random() * W, H + depth, side];
  };

  for (let i = 0; i < count * 4 && placed.length < count; i++) {
    const [x, z] = sidePoint();
    const minGap = lite ? 2.7 : 2.05;
    if (placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < minGap)) continue;
    placed.push([x, z]);
    const y = terrainHeight(x, z, world);
    const yaw = random() * Math.PI * 2;
    const scale = 0.72 + random() * 0.95;
    const cornerBias = Math.abs(x - W * 0.5) + Math.abs(z - H * 0.5);
    const teamTint = x + z < (W + H) * 0.5 ? 'blue' : 'red';
    const roll = random();
    let src;
    if (roll < 0.6) src = treeParts((random() * 3) | 0, random() < 0.18 ? teamTint : '');
    else if (roll < 0.85) src = rockParts((random() * 2) | 0);
    else if (roll < 0.93) src = ruinParts(teamTint);
    else src = serverMonolithParts(teamTint);
    for (const part of src) solid.push(transform(part, x, y, z, scale, yaw));

    if (!lite && roll >= 0.85 && (roll >= 0.93 || cornerBias > (W + H) * 0.28)) {
      const accent = teamTint === 'blue' ? 0x39a8ff : 0xff4d5e;
      if (roll >= 0.93) {
        glow.push(transform(box(0.46, 0.05, 0.03, 0, 1.48, 0.32, accent), x, y, z, scale, yaw));
        glow.push(transform(box(0.46, 0.05, 0.03, 0, 0.88, 0.32, 0x7ed957), x, y, z, scale, yaw));
      } else {
        glow.push(transform(box(0.12, 0.06, 1.05, 0, 0.08, 0, accent), x, y, z, scale, yaw));
      }
    }
  }

  // Low, broken silhouettes behind the first prop row hide the horizon without
  // enclosing the arena in a visible rectangular wall.
  const ridgeCount = lite ? 32 : 56;
  for (let i = 0; i < ridgeCount; i++) {
    const [x, z] = sidePoint();
    const y = terrainHeight(x, z, world);
    const scale = 1.5 + random() * 2.8;
    solid.push(transform(
      stone(0.75, 0, 0.45, 0, random() < 0.5 ? PALETTE.rock0 : PALETTE.rock1, 1.8, 0.8, 1),
      x, y, z, scale, random() * Math.PI * 2
    ));
  }

  const root = new THREE.Group();
  root.name = 'outskirts';
  const solidMesh = merge(solid, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const glowMesh = merge(glow, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.58, depthWrite: false, toneMapped: false,
  }));
  if (solidMesh) { solidMesh.name = 'outskirts-solid'; root.add(solidMesh); }
  if (glowMesh) { glowMesh.name = 'outskirts-glow'; root.add(glowMesh); }
  root.userData.setLite = (isLite) => { if (glowMesh) glowMesh.visible = !isLite; };
  root.userData.setLite(lite);
  return root;
}

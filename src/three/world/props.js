// world/props.js - tiny dev-desk props (monitor, mug, server rack, keyboard, rubber duck, bug) scattered deterministically beside
// walls and bushes, never on lanes / river / camps / pits / structures / bases, never inside walls. ALL props are baked into ONE
// merged vertex-coloured mesh (1 draw call, no per-frame work). Low quality shows the first ~45% via geometry.drawRange.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { S } from './ground.js';
import { LANES, LANE_WIDTH, RIVER, CAMPS, EPIC_SPOTS, STRUCTURES, FOUNTAIN, BASE_RADIUS, distToSeg } from '../../../shared/moba/map.js'; // 5v5 only
import { wallDist as navWallDist } from '../../../shared/moba/nav.js';

const col = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
const box = (w, h, d, x, y, z, hex) => col(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
const ball = (r, x, y, z, hex, sx = 1, sy = 1, sz = 1) => col(new THREE.IcosahedronGeometry(r, 0).scale(sx, sy, sz).translate(x, y, z), hex);
const cyl = (r, h, x, y, z, hex) => col(new THREE.CylinderGeometry(r, r, h, 8).translate(x, y, z), hex);

// each builder returns geometries in local space (y up, ~0.1-0.5 units tall; a champion is ~0.6 tall)
const BUILD = {
  monitor: () => [box(0.3, 0.2, 0.03, 0, 0.22, 0, 0x20242e), box(0.26, 0.16, 0.012, 0, 0.22, 0.02, 0x39c2ff), box(0.04, 0.12, 0.04, 0, 0.06, 0, 0x2a2f3c), box(0.16, 0.015, 0.1, 0, 0.008, 0, 0x2a2f3c)],
  mug: () => [cyl(0.05, 0.1, 0, 0.05, 0, 0xf2f2f2), cyl(0.042, 0.01, 0, 0.098, 0, 0x6b3b1e), box(0.03, 0.05, 0.015, 0.065, 0.05, 0, 0xf2f2f2), box(0.04, 0.03, 0.01, 0, 0.05, 0.05, 0xff5e5e)],
  rack: () => [box(0.22, 0.46, 0.2, 0, 0.23, 0, 0x2b303d), box(0.18, 0.025, 0.01, 0, 0.12, 0.101, 0x7ed957), box(0.18, 0.025, 0.01, 0, 0.2, 0.101, 0x39c2ff), box(0.18, 0.025, 0.01, 0, 0.28, 0.101, 0x7ed957), box(0.18, 0.025, 0.01, 0, 0.36, 0.101, 0xff5e5e)],
  keyboard: () => [box(0.3, 0.02, 0.1, 0, 0.01, 0, 0x3a3f4e), box(0.26, 0.008, 0.07, 0, 0.024, 0, 0xc9cfe0)],
  duck: () => [ball(0.07, 0, 0.07, 0, 0xffd23f, 1.1, 0.9, 1), ball(0.045, 0.05, 0.15, 0, 0xffd23f), box(0.04, 0.02, 0.03, 0.095, 0.14, 0, 0xff8a2a), box(0.012, 0.012, 0.012, 0.085, 0.17, 0.03, 0x111111)],
  bug: () => { // insect-shaped blob: body, head, eyes, 6 legs, red "error" mark
    const p = [ball(0.07, 0, 0.05, 0, 0xe0453a, 1.2, 0.7, 1), ball(0.045, 0.1, 0.05, 0, 0x2a2f3c), box(0.012, 0.012, 0.012, 0.135, 0.07, 0.025, 0xffffff), box(0.012, 0.012, 0.012, 0.135, 0.07, -0.025, 0xffffff), box(0.01, 0.005, 0.1, 0, 0.1, 0, 0x2a2f3c)];
    for (const x of [-0.04, 0.02, 0.07]) for (const s of [1, -1]) p.push(box(0.012, 0.012, 0.09, x, 0.02, s * 0.09, 0x2a2f3c).rotateY(0));
    return p;
  },
};
const TYPES = ['monitor', 'mug', 'rack', 'keyboard', 'duck', 'bug', 'bug', 'mug', 'monitor', 'duck'];

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function seedOf(id) { let h = 2166136261; for (const ch of String(id || 'w')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }

export function makeProps(world, lite = false) {
  const walls = (world && world.walls) || [], bushes = (world && world.bushes) || [], doors = (world && world.doors) || [];
  const is5v5 = !world || world.id === '5v5';
  const rnd = mulberry(seedOf(world && world.id));
  const wallDist = (x, y) => { // distance from edge of any wall (negative = inside)
    let best = 1e9;
    for (const w of walls) best = Math.min(best, navWallDist(x, y, w));
    return best;
  };
  const inBush = (x, y, pad) => bushes.some((b) => b.kind === 'circle' ? Math.hypot(x - b.x, y - b.y) < b.r + pad : distToSeg(x, y, b.x1, b.y1, b.x2, b.y2) < b.w / 2 + pad);
  const ok = (x, y) => {
    if (x < 120 || y < 120 || x > (world.w || 6000) - 120 || y > (world.h || 6000) - 120) return false;
    if (wallDist(x, y) < 50 || inBush(x, y, 40)) return false;
    for (const d of doors) if (distToSeg(x, y, d.x1, d.y1, d.x2, d.y2) < 200) return false;
    if (!is5v5) return true;
    for (const pts of Object.values(LANES)) for (let i = 0; i < pts.length - 1; i++) if (distToSeg(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) < LANE_WIDTH / 2 + 80) return false;
    if (distToSeg(x, y, RIVER.from.x, RIVER.from.y, RIVER.to.x, RIVER.to.y) < RIVER.width / 2 + 60) return false;
    for (const c of CAMPS) if (Math.hypot(x - c.x, y - c.y) < 260) return false;
    for (const e of Object.values(EPIC_SPOTS)) if (Math.hypot(x - e.x, y - e.y) < 380) return false;
    for (const s of STRUCTURES) if (Math.hypot(x - s.x, y - s.y) < 220) return false;
    for (const f of [FOUNTAIN.blue, FOUNTAIN.red]) if (Math.hypot(x - f.x, y - f.y) < BASE_RADIUS * 0.45) return false;
    return true;
  };
  // candidates: beside wall faces (including organic poly edges) and along the edge of bushes
  const cand = [];
  for (const w of walls) {
    if (w.kind === 'poly' && w.pts && w.pts.length >= 3) {
      for (let i = 0; i < w.pts.length; i += 2) {
        const a = w.pts[i], b = w.pts[(i + 1) % w.pts.length];
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
        const o = 75 + rnd() * 45;
        cand.push([(a[0] + b[0]) * 0.5 + (dy / L) * o, (a[1] + b[1]) * 0.5 - (dx / L) * o, false]);
        cand.push([(a[0] + b[0]) * 0.5 - (dy / L) * o, (a[1] + b[1]) * 0.5 + (dx / L) * o, false]);
      }
    } else if (w.kind === 'seg') {
      const dx = w.x2 - w.x1, dy = w.y2 - w.y1, L = Math.hypot(dx, dy) || 1, n = Math.max(1, Math.round(L / 260));
      for (let i = 0; i < n; i++) { const t = (i + 0.2 + rnd() * 0.6) / n, s = rnd() < 0.5 ? 1 : -1, o = w.w / 2 + 70 + rnd() * 40; cand.push([w.x1 + dx * t - dy / L * o * s, w.y1 + dy * t + dx / L * o * s, false]); }
    } else if (w.kind === 'rect') {
      const per = 2 * (w.w + w.h), n = Math.max(1, Math.round(per / 500));
      for (let i = 0; i < n; i++) { const a = rnd() * 6.283; cand.push([w.x + w.w / 2 + Math.cos(a) * (w.w / 2 + 80), w.y + w.h / 2 + Math.sin(a) * (w.h / 2 + 80), false]); }
    }
  }
  for (const b of bushes) {
    if (b.kind === 'circle') { for (let i = 0; i < 2; i++) { const a = rnd() * 6.283; cand.push([b.x + Math.cos(a) * (b.r + 70), b.y + Math.sin(a) * (b.r + 70), true]); } }
    else { const dx = b.x2 - b.x1, dy = b.y2 - b.y1, L = Math.hypot(dx, dy) || 1, n = Math.max(1, Math.round(L / 500)); for (let i = 0; i < n; i++) { const t = (i + rnd()) / n, s = rnd() < 0.5 ? 1 : -1, o = b.w / 2 + 70; cand.push([b.x1 + dx * t - dy / L * o * s, b.y1 + dy * t + dx / L * o * s, true]); } }
  }
  for (let i = cand.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [cand[i], cand[j]] = [cand[j], cand[i]]; } // shuffle -> drawRange subset stays spread out
  const placed = [], MAX = 64, parts = [], counts = [];
  for (const [x, y, nearBush] of cand) {
    if (placed.length >= MAX) break;
    if (!ok(x, y) || placed.some((p) => Math.hypot(p[0] - x, p[1] - y) < 260)) continue;
    placed.push([x, y]);
    const type = nearBush && rnd() < 0.6 ? 'bug' : TYPES[(rnd() * TYPES.length) | 0];
    const yaw = rnd() * 6.283, sc = 0.9 + rnd() * 0.5;
    let n = 0;
    for (const g0 of BUILD[type]()) {
      const g = g0.index ? g0.toNonIndexed() : g0; if (g !== g0) g0.dispose();
      g.scale(sc, sc, sc); g.rotateY(yaw); g.translate(x * S, 0.002, y * S);
      parts.push(g); n += g.attributes.position.count;
    }
    counts.push(n);
  }
  if (!parts.length) return null;
  const geo = mergeGeometries(parts); for (const g of parts) g.dispose();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = 'props'; mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false;
  const total = geo.attributes.position.count;
  const cum = []; { let s = 0; for (const c of counts) { s += c; cum.push(s); } }
  mesh.userData.setLite = (lt) => { const k = lt ? Math.max(1, Math.ceil(counts.length * 0.45)) : counts.length; geo.setDrawRange(0, k >= counts.length ? total : cum[k - 1]); };
  mesh.userData.setLite(lite);
  mesh.userData.count = counts.length;
  return mesh;
}

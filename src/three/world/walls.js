// world/walls.js - sculpted crevice-carved 3D rock cliffs (`kind:'poly'`), carved 3-gate base ramparts,
// boulders, multi-tier pine clusters, warm jungle braziers, epic pit horseshoes, and perimeter cliffs;
// keeps classic office partitions & animated doors for non-5v5 Story floors.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EPIC_SPOTS, FOUNTAIN, MAP_W, MAP_H } from '../../../shared/moba/map.js';
import { pointInPoly, wallDist } from '../../../shared/moba/nav.js';
import { S, TEAM_COL, tex } from './ground.js';

const WALL_STYLE = {
  partition: { h: 0.62, col: 0x45585c, trim: 0x9b7b3d },
  cubicles: { h: 0.54, col: 0x3f5650, trim: 0x527e62 },
  glass: { h: 0.58, col: 0x3b585f, trim: 0x2d8f91 },
  shelf: { h: 0.50, col: 0x524c41, trim: 0xb88b43 },
  plant: { h: 0.45, col: 0x315f3b }, cooler: { h: 0.55, col: 0x517b80 }, pillar: { h: 0.85, col: 0x69716b },
};
const DOOR_COL = { lockin: 0xff5e5e, keycard: 0x39c2ff, boss: 0xffd23f, auto: 0x9fdcff };

function colorize(geo, hex, mul = 1.0) {
  const c = new THREE.Color(hex).multiplyScalar(mul);
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
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
const flat = (g) => {
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  return out;
};
const smoothstep = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSculptedPolyCliff(w, st, lite) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of w.pts) {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
  }
  const pad = w.baseWall ? 0.16 : 0.24;
  const x0 = minX * S - pad, x1 = maxX * S + pad;
  const z0 = minY * S - pad, z1 = maxY * S + pad;
  const spanX = Math.max(0.4, x1 - x0), spanZ = Math.max(0.4, z1 - z0);
  const targetStep = w.baseWall ? (lite ? 0.26 : 0.18) : (lite ? 0.34 : 0.23);
  const nx = Math.max(5, Math.min(lite ? 28 : 48, Math.ceil(spanX / targetStep)));
  const nz = Math.max(5, Math.min(lite ? 28 : 48, Math.ceil(spanZ / targetStep)));

  const cols = nx + 1, rows = nz + 1;
  const gx = new Float32Array(cols * rows);
  const gy = new Float32Array(cols * rows);
  const gz = new Float32Array(cols * rows);
  const gsd = new Float32Array(cols * rows);
  const gr1 = new Float32Array(cols * rows);
  const gr2 = new Float32Array(cols * rows);

  for (let iz = 0; iz <= nz; iz++) {
    const wz = z0 + (spanZ * iz) / nz;
    for (let ix = 0; ix <= nx; ix++) {
      const wx = x0 + (spanX * ix) / nx;
      const idx = iz * cols + ix;
      const sd = -wallDist(wx / S, wz / S, w) * S;
      const r1 = 1.0 - Math.abs(Math.sin(wx * 1.65 + wz * 1.15) * Math.cos(wx * 0.85 - wz * 1.85));
      const r2 = 0.5 + 0.5 * Math.sin(wx * 3.1 - wz * 2.4);
      let h = -0.10;
      if (sd >= -pad) {
        if (w.baseWall) {
          const wallStep = smoothstep(-0.16, 0.14, sd);
          const crenel = 0.64 + 0.12 * smoothstep(0.15, 0.65, Math.sin((wx + wz) * 4.2));
          h = -0.06 + wallStep * crenel;
        } else {
          const slope = smoothstep(-0.22, 0.52, sd);
          const spine = (st.h * 0.80) + 0.32 * Math.min(1.0, Math.max(0.0, sd) / 1.3);
          const fissure = Math.max(0.0, 0.58 - r1) * 0.52;
          h = -0.06 + slope * spine * (0.72 + 0.28 * r1) - fissure * slope * 0.42;
        }
      }
      gx[idx] = wx; gy[idx] = h; gz[idx] = wz; gsd[idx] = sd; gr1[idx] = r1; gr2[idx] = r2;
    }
  }

  const pos = [], uvs = [], idxOut = [];
  const vMap = new Int32Array(cols * rows).fill(-1);
  const emitVert = (i) => {
    if (vMap[i] >= 0) return vMap[i];
    const id = pos.length / 3;
    vMap[i] = id;
    pos.push(gx[i], gy[i], gz[i]);
    uvs.push(gx[i] * 0.45, gz[i] * 0.45);
    return id;
  };

  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const a = iz * cols + ix;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      if (gsd[a] < -0.20 && gsd[b] < -0.20 && gsd[c] < -0.20 && gsd[d] < -0.20) continue;
      const ia = emitVert(a), ib = emitVert(b), ic = emitVert(c), id = emitVert(d);
      // Alternating diagonal split produces crisp organic rock facets without grid banding
      if ((ix + iz) & 1) {
        idxOut.push(ia, ic, id, ia, id, ib);
      } else {
        idxOut.push(ia, ic, ib, ib, ic, id);
      }
    }
  }
  if (!idxOut.length) return null;

  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  indexed.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  indexed.setIndex(idxOut);
  const geo = indexed.toNonIndexed();
  indexed.dispose();
  geo.computeVertexNormals();

  // Slope + crevice + biome vertex coloring (Riot SRU style)
  const gPos = geo.attributes.position;
  const gNorm = geo.attributes.normal;
  const colors = new Float32Array(gPos.count * 3);
  const cCrevice = new THREE.Color(0x28353a);
  const cRockDark = new THREE.Color(0x3f4e52);
  const cRockLit = new THREE.Color(0x78857b);
  const cMossDark = new THREE.Color(0x416337);
  const cMossLit = new THREE.Color(0x638849);
  const cBaseLow = new THREE.Color(0x394b54);
  const cBaseTop = new THREE.Color(0x6d8490);
  const tmp = new THREE.Color();

  for (let i = 0; i < gPos.count; i++) {
    const vx = gPos.getX(i), vy = gPos.getY(i), vz = gPos.getZ(i);
    const nxx = gNorm.getX(i), nyy = gNorm.getY(i), nzz = gNorm.getZ(i);
    const r1 = 1.0 - Math.abs(Math.sin(vx * 1.65 + vz * 1.15) * Math.cos(vx * 0.85 - vz * 1.85));
    const r2 = 0.5 + 0.5 * Math.sin(vx * 3.1 - vz * 2.4);
    const sunDot = Math.max(0, Math.min(1, nxx * -0.45 + nyy * 0.80 + nzz * 0.35));

    if (w.baseWall) {
      tmp.copy(cBaseLow).lerp(cBaseTop, smoothstep(0.10, 0.72, vy));
      tmp.multiplyScalar(0.78 + sunDot * 0.36);
    } else if (nyy >= 0.78 && vy > 0.26 && r1 > 0.44) {
      // Top ledges: patchy forest moss blended with exposed rock patches (never solid flat green)
      const rockMix = r2 < 0.34 ? (0.34 - r2) * 1.8 : 0.0;
      tmp.copy(cMossDark).lerp(cMossLit, Math.min(1, r2 * 0.8 + sunDot * 0.35));
      if (rockMix > 0) tmp.lerp(cRockLit, Math.min(0.85, rockMix));
    } else {
      // Sloped cliff faces & carved fissures: stone strata + deep crevice shadow
      const crevShade = smoothstep(0.32, 0.68, r1) * smoothstep(0.0, 0.35, vy);
      tmp.copy(cCrevice).lerp(cRockDark, crevShade);
      tmp.lerp(cRockLit, sunDot * 0.65 * crevShade);
      if (w.look === 'glass' && vy > 0.18 && nyy < 0.72) tmp.lerp(new THREE.Color(0x3a6f75), 0.22);
      if (w.look === 'shelf' && nyy < 0.75) tmp.lerp(new THREE.Color(0x635847), 0.25);
    }
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function make5v5Cliffs(world, aniso, lite) {
  const group = new THREE.Group();
  const W = ((world && world.w) || MAP_W) * S;
  const H = ((world && world.h) || MAP_H) * S;
  const random = mulberry(0x52494654);

  const rock = [];
  const moss = [];
  const accent = [];
  const ROCK_PAL = [0x45565a, 0x516265, 0x3d4d52, 0x5b6b69];
  const MOSS_PAL = [0x3d6335, 0x4b743c, 0x35582e, 0x588044];
  const pick = (arr) => arr[(random() * arr.length) | 0];

  const prepColor = (geo, baseHex, topHex, keepUv) => {
    const g = flat(geo);
    if (!keepUv && g.attributes.uv) g.deleteAttribute('uv');
    const pos = g.attributes.position;
    const a = new Float32Array(pos.count * 3);
    const cLow = new THREE.Color(baseHex);
    const cHigh = topHex != null ? new THREE.Color(topHex) : cLow;
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = topHex != null ? Math.max(0, Math.min(1, (y - 0.10) / 0.65)) : 0;
      tmp.copy(cLow).lerp(cHigh, t);
      a[i * 3] = tmp.r; a[i * 3 + 1] = tmp.g; a[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };

  const addBox = (list, w, h, d, x, y, z, yaw, hex, keepUv = true, topHex = null) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (keepUv && g.attributes.uv) {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(w, d) * 0.45, uv.getY(i) * h * 0.45);
    }
    g.rotateY(yaw);
    g.translate(x, y, z);
    list.push(prepColor(g, hex, topHex, keepUv));
  };

  const addBoulder = (list, r, x, y, z, yaw, hex) => {
    const g = new THREE.DodecahedronGeometry(r, 0);
    g.scale(1.2, 0.72 + random() * 0.35, 0.9 + random() * 0.3);
    g.rotateY(yaw);
    g.rotateX((random() - 0.5) * 0.4);
    g.translate(x, y, z);
    list.push(prepColor(g, hex, 0x7a887d, true));
  };

  const addCone = (list, r, h, sides, x, y, z, yaw, hex, keepUv = false) => {
    const g = new THREE.ConeGeometry(r, h, sides);
    g.rotateY(yaw);
    g.translate(x, y, z);
    list.push(prepColor(g, hex, null, keepUv));
  };

  const addCyl = (list, rt, rb, h, sides, x, y, z, yaw, hex, keepUv = true, topHex = null) => {
    const g = new THREE.CylinderGeometry(rt, rb, h, sides);
    g.rotateY(yaw);
    g.translate(x, y, z);
    list.push(prepColor(g, hex, topHex, keepUv));
  };

  // 1. Sculpted crevice-carved 3D rock cliffs & curved 3-gate base rampart walls
  for (const w of (world && world.walls) || []) {
    const st = WALL_STYLE[w.look] || WALL_STYLE.partition;
    if (w.kind === 'poly' && w.pts && w.pts.length >= 3) {
      const cliffGeo = buildSculptedPolyCliff(w, st, lite);
      if (cliffGeo) rock.push(cliffGeo);

      if (w.baseWall) {
        // Determine team trim color from corner proximity (Blue = bottom-left, Red = top-right)
        const p0 = w.pts[0];
        const isBlue = (p0[1] - p0[0]) > 0;
        const tc = isBlue ? TEAM_COL.blue : TEAM_COL.red;
        const midIdx = Math.floor(w.pts.length * 0.25);
        for (const endIdx of [0, midIdx]) {
          const ep = w.pts[endIdx];
          const px = ep[0] * S, pz = ep[1] * S;
          addCyl(rock, 0.22, 0.28, 0.84, 8, px, 0.42, pz, 0, 0x4c5d66, true, 0x7f939c);
          addCyl(accent, 0.16, 0.16, 0.07, 8, px, 0.87, pz, 0, tc, false);
        }
        continue;
      }

      // Scatter boulders, multi-tier pine clusters, warm amber jungle braziers, glass conduits & server blades
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of w.pts) {
        if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
      }
      const attempts = lite ? 3 : 8;
      let placedAccent = false;
      for (let a = 0; a < attempts; a++) {
        const px = minX + random() * (maxX - minX);
        const py = minY + random() * (maxY - minY);
        if (!pointInPoly(px, py, w.pts)) continue;
        const wx = px * S, wz = py * S;
        const sd = -wallDist(px, py, w) * S;
        const r1 = 1.0 - Math.abs(Math.sin(wx * 1.65 + wz * 1.15) * Math.cos(wx * 0.85 - wz * 1.85));
        const slope = smoothstep(-0.22, 0.52, sd);
        const spine = (st.h * 0.80) + 0.32 * Math.min(1.0, Math.max(0.0, sd) / 1.3);
        const topY = -0.06 + slope * spine * (0.72 + 0.28 * r1);

        if (!lite && random() < 0.45) {
          addBoulder(rock, 0.16 + random() * 0.12, wx, topY - 0.02, wz, random() * 6.28, pick(ROCK_PAL));
        }
        if (random() < (lite ? 0.35 : 0.65)) {
          const ph = 0.20 + random() * 0.14;
          const pr = 0.13 + random() * 0.06;
          addCone(moss, pr, ph, 6, wx, topY + ph * 0.42, wz, random() * 6.28, pick(MOSS_PAL), false);
          if (!lite) {
            addCone(moss, pr * 0.72, ph * 0.85, 6, wx, topY + ph * 0.88, wz, random() * 6.28, MOSS_PAL[3], false);
          }
        }
        if (!placedAccent && w.look === 'glass') {
          placedAccent = true;
          addBox(rock, 0.38, 0.08, 0.14, wx, topY + 0.02, wz, random() * 3.14, 0x26323a, true);
          addBox(accent, 0.32, 0.04, 0.09, wx, topY + 0.06, wz, random() * 3.14, 0x36e0d8, false);
        } else if (!placedAccent && !lite && random() < 0.45) {
          placedAccent = true;
          // Warm amber jungle brazier lantern or Bug Smash server blade on rock spur
          if (random() < 0.55) {
            addCyl(rock, 0.07, 0.10, 0.22, 6, wx, topY + 0.10, wz, 0, 0x2b3238, true);
            addCyl(accent, 0.08, 0.05, 0.08, 6, wx, topY + 0.24, wz, 0, 0xffb347, false);
          } else {
            addBox(rock, 0.16, 0.20, 0.14, wx, topY + 0.10, wz, random() * 3.14, 0x242b33, true);
            addBox(accent, 0.12, 0.04, 0.16, wx, topY + 0.16, wz, random() * 3.14, random() < 0.5 ? 0x7ed957 : 0x39c2ff, false);
          }
        }
      }
    } else if (w.kind === 'seg') {
      const x1 = w.x1 * S, z1 = w.y1 * S, x2 = w.x2 * S, z2 = w.y2 * S;
      const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz) || 0.1;
      const yaw = -Math.atan2(dz, dx), baseTh = Math.max(0.32, w.w * S * 0.65);
      addBox(rock, len, st.h, baseTh, (x1 + x2) * 0.5, st.h * 0.5, (z1 + z2) * 0.5, yaw, st.col, true, 0x6f8078);
    } else if (w.kind === 'circle') {
      const r = w.r * S, cx = w.x * S, cz = w.y * S;
      addCyl(rock, r * 0.85, r * 1.15, st.h, 8, cx, st.h * 0.5, cz, random() * 3, 0x45565a, true, 0x6f8078);
      addCone(moss, r * 1.1, 0.34, 7, cx, st.h + 0.12, cz, random() * 3, MOSS_PAL[1], false);
    }
  }

  // 2. Pit cove markers are already framed by the sculpted w12/w30 cliff horseshoes;
  // add subtle non-blocking rim beacon crystals behind each epic cove.
  for (const [key, ep] of Object.entries(EPIC_SPOTS)) {
    const cx = ep.x * S, cz = ep.y * S;
    const isDead = key === 'deadline';
    const backX = cx + (isDead ? 0.95 : -0.95), backZ = cz + (isDead ? -0.95 : 0.95);
    addCyl(rock, 0.14, 0.18, 0.42, 6, backX, 0.21, backZ, 0, 0x3b4952, true, 0x677880);
    addBox(accent, 0.16, 0.14, 0.16, backX, 0.48, backZ, 0.78, isDead ? 0xff5a7a : 0xf2cd5c, false);
  }

  // 3. Stepped Fountain Amphitheaters behind both spawns
  const buildFountainRim = (team) => {
    const tc = TEAM_COL[team];
    const f = FOUNTAIN[team];
    const fx = f.x * S, fz = f.y * S;
    const baseAngle = team === 'blue' ? (3 * Math.PI) / 4 : -Math.PI / 4;
    for (let i = -3; i <= 3; i++) {
      const a = baseAngle + i * 0.24;
      const rx = fx + Math.cos(a) * 3.15, rz = fz + Math.sin(a) * 3.15;
      addBox(rock, 0.88, 0.24, 0.52, rx, 0.12, rz, -a + Math.PI / 2, 0x44565c, true);
      addBox(rock, 0.78, 0.42, 0.36, rx + Math.cos(a) * 0.26, 0.32, rz + Math.sin(a) * 0.26, -a + Math.PI / 2, 0x5c7075, true);
      if (i % 2 === 0) addBox(accent, 0.38, 0.05, 0.12, rx + Math.cos(a) * 0.26, 0.55, rz + Math.sin(a) * 0.26, -a + Math.PI / 2, tc, false);
    }
  };
  buildFountainRim('blue');
  buildFountainRim('red');

  // 4. Outer Perimeter Plateau Retaining Cliff & Arched Parapets (with NW & SE corner alcoves)
  const segLen = lite ? 4.4 : 2.6;
  const addEdge = (x0, z0, x1, z1) => {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), n = Math.max(2, Math.round(L / segLen));
    const yaw = -Math.atan2(dz, dx), nx = -dz / L, nz = dx / L;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, cx = x0 + dx * t, cz = z0 + dz * t, sl = L / n;
      addBox(rock, sl + 0.15, 2.75, 1.35, cx + nx * 0.55, -1.35, cz + nz * 0.55, yaw, 0x2c383a, true, 0x465658);
      addBox(rock, sl + 0.08, 0.28, 0.44, cx, 0.14, cz, yaw, 0x55645e, true);
      if (i % 2 === 0) {
        addBox(rock, 0.56, 0.42, 0.58, cx, 0.21, cz, yaw, 0x67756f, true);
        addBox(accent, 0.36, 0.04, 0.14, cx, 0.44, cz, yaw, 0xb89648, false);
      }
    }
  };
  addEdge(3.8, -0.55, W + 0.55, -0.55);
  addEdge(-0.55, 3.8, -0.55, H + 0.55);
  addEdge(-0.55, H + 0.55, W - 3.8, H + 0.55);
  addEdge(W + 0.55, -0.55, W + 0.55, H - 3.8);

  for (const [ax, az, a0, a1] of [[2.6, 2.6, Math.PI, Math.PI * 1.5], [W - 2.6, H - 2.6, 0, Math.PI * 0.5]]) {
    for (let i = 0; i < 6; i++) {
      const a = a0 + (a1 - a0) * ((i + 0.5) / 6);
      const px = ax + Math.cos(a) * 3.35, pz = az + Math.sin(a) * 3.35;
      addBox(rock, 1.1, 2.7, 1.1, px, -1.32, pz, -a + Math.PI / 2, 0x2c383a, true, 0x465658);
      addBox(rock, 0.95, 0.48, 0.46, px, 0.24, pz, -a + Math.PI / 2, 0x5a6862, true);
      if (i % 2 === 0) addBox(accent, 0.4, 0.05, 0.16, px, 0.51, pz, -a + Math.PI / 2, 0xb89648, false);
    }
  }

  const bake = (list, mat, shadow, name) => {
    if (!list.length) return;
    const m = new THREE.Mesh(mergeGeometries(list, false), mat);
    m.name = name;
    m.castShadow = shadow;
    m.receiveShadow = true;
    group.add(m);
    for (const g of list) g.dispose();
  };

  bake(rock, lite
    ? new THREE.MeshLambertMaterial({ map: tex('tex/plastered_wall_03_diff.jpg', true, 1), color: 0xd4ded6, vertexColors: true, flatShading: true })
    : new THREE.MeshStandardMaterial({
      map: tex('tex/plastered_wall_03_diff.jpg', true, aniso),
      normalMap: tex('tex/plastered_wall_03_nor_gl.jpg', false, aniso),
      normalScale: new THREE.Vector2(0.45, 0.45),
      color: 0xd4ded6,
      vertexColors: true, roughness: 0.86, metalness: 0.04, flatShading: true,
    }), true, 'cliff-rock');
  bake(moss, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), true, 'cliff-moss');
  bake(accent, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), false, 'cliff-accent');

  return { group, setDoor() {}, update() {} };
}

export function makeWalls(world, aniso = 8, lite = false) {
  if (!world || world.id === '5v5') return make5v5Cliffs(world, aniso, lite);

  const group = new THREE.Group();
  const solid = [], glass = [], trim = [];
  for (const w of (world && world.walls) || []) {
    const st = WALL_STYLE[w.look] || WALL_STYLE.partition;
    if (w.kind === 'seg') {
      const dx = (w.x2 - w.x1) * S, dz = (w.y2 - w.y1) * S, len = Math.hypot(dx, dz) + w.w * S * 0.5, th = w.w * S * 0.5;
      const place = (g) => { g.rotateY(-Math.atan2(dz, dx)); g.translate((w.x1 + w.x2) / 2 * S, 0, (w.y1 + w.y2) / 2 * S); return g; };
      if (w.look === 'glass') {
        glass.push(place(colorize(segBox(th * 0.45, len, st.h - 0.3, 0.3), st.col, 1.08)));
        solid.push(place(colorize(segBox(th, len, 0.3, 0), 0x3f5655, 1.08)));
      } else solid.push(place(colorize(segBox(th, len, st.h, 0), st.col, 1.08)));
      trim.push(place(colorize(new THREE.BoxGeometry(len - 0.02, 0.03, th * 0.3).translate(0, st.h + 0.015, 0), new THREE.Color(st.trim).multiplyScalar(0.18).getHex())));
    } else if (w.kind === 'rect') {
      solid.push(colorize(new THREE.BoxGeometry(w.w * S, st.h, w.h * S).translate((w.x + w.w / 2) * S, st.h / 2, (w.y + w.h / 2) * S), st.col, 1.08));
    } else if (w.kind === 'circle') {
      const r = w.r * S;
      if (w.look === 'plant') {
        solid.push(colorize(new THREE.CylinderGeometry(r * 0.7, r * 0.55, 0.32, 10).translate(w.x * S, 0.16, w.y * S), 0x665039, 1.08));
        solid.push(colorize(new THREE.IcosahedronGeometry(r * 1.15, 1).translate(w.x * S, 0.62, w.y * S), 0x315f3b, 1.08));
      } else solid.push(colorize(new THREE.CylinderGeometry(r, r, st.h, 14).translate(w.x * S, st.h / 2, w.y * S), st.col, 1.08));
    }
  }
  const mk = (list, mat, shadow) => {
    if (!list.length) return;
    const m = new THREE.Mesh(mergeGeometries(list.map(flat)), mat);
    m.castShadow = shadow; m.receiveShadow = true; group.add(m);
    for (const g of list) g.dispose();
  };
  mk(solid, lite
    ? new THREE.MeshLambertMaterial({ map: tex('tex/plastered_wall_03_diff.jpg', true, 1), color: 0xaab7aa, vertexColors: true })
    : new THREE.MeshStandardMaterial({
      map: tex('tex/plastered_wall_03_diff.jpg', true, aniso), normalMap: tex('tex/plastered_wall_03_nor_gl.jpg', false, aniso),
      vertexColors: true, roughness: 0.82, metalness: 0.05,
    }), true);
  mk(glass, new (lite ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial)({ vertexColors: true, transparent: true, opacity: 0.32, emissive: 0x0a2c2d, depthWrite: false }), false);
  mk(trim, new THREE.MeshBasicMaterial({ vertexColors: true }), false);

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
    const lk = r.k > 0.5 ? 1 : 0;
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
        const glow = r.k > 0.5 ? (r.pulse ? 0.8 + 0.2 * Math.sin(t * 2 + r.i) : 0.9) : 0;
        if (glow !== r.glow) { lamps.setColorAt(r.i, C.copy(r.col).multiplyScalar(glow * 1.6)); r.glow = glow; colorDirty = true; }
      }
      if (matDirty) { slabs.instanceMatrix.needsUpdate = lamps.instanceMatrix.needsUpdate = true; }
      if (colorDirty) lamps.instanceColor.needsUpdate = true;
    },
  };
}

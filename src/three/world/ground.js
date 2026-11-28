// world/ground.js - sculpted terrain: splat-blended PBR textures, sunken river basin,
// plateau cliff drop-off + corner alcoves, translucent flowing data-stream river, and floor pads.
import * as THREE from 'three';
import { MAP_W, LANES, LANE_WIDTH, BASE_RADIUS, CAMPS, EPIC_SPOTS, RIVER, RIVER_PATH, FOUNTAIN, distToSeg } from '../../../shared/moba/map.js';

export const S = 0.01; // mirrors Renderer.js scale
export const TEAM_COL = { blue: 0x39a8ff, red: 0xff4d5e, neutral: 0xffd23f };
export const asset = (rel) => new URL('../../../three/assets/' + rel, import.meta.url).href;

export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      for (const k of Object.keys(m)) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
      if (m.userData && m.userData.uniforms) for (const u of Object.values(m.userData.uniforms)) if (u.value && u.value.isTexture) u.value.dispose();
      m.dispose();
    }
  });
  if (obj.parent) obj.parent.remove(obj);
}

const loader = new THREE.TextureLoader();
let _dummy = null;
function dummyTex() { return _dummy || (_dummy = (() => { const t = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1); t.needsUpdate = true; return t; })()); }
export function tex(rel, srgb, aniso) {
  const t = loader.load(asset(rel));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const is5v5 = (world) => !world || world.id === '5v5';
const smoothstep = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function distToRiver(px, pz) {
  const pts = RIVER_PATH && RIVER_PATH.length >= 2 ? RIVER_PATH : [RIVER.from, RIVER.to];
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    best = Math.min(best, distToSeg(px, pz, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y));
  }
  return best;
}

/**
 * Deterministic terrain elevation at scene coordinates (wx, wz).
 * Walkable lanes/bases/jungle stay at y = 0 so raycasting and unit physics stay exact;
 * continuous curved river basin depresses to -0.32 (except Mid bridge) and outer abyss drops to -2.75.
 */
export function terrainHeight(wx, wz, world) {
  const W = ((world && world.w) || MAP_W) * S;
  const H = ((world && world.h) || MAP_W) * S;
  const outsideRect = Math.max(0, -wx, wx - W, -wz, wz - H);
  let outside = outsideRect;
  if (is5v5(world)) {
    const nwDist = Math.hypot(wx - 2.6, wz - 2.6);
    const seDist = Math.hypot(wx - (W - 2.6), wz - (H - 2.6));
    const alcoveOutside = Math.min(Math.max(0, nwDist - 3.3), Math.max(0, seDist - 3.3));
    outside = Math.min(outsideRect, alcoveOutside);
  }
  if (outside > 0.35) {
    return -smoothstep(0.35, 6.4, outside) * 2.75;
  }
  if (!is5v5(world)) return 0;

  const px = wx / S, pz = wz / S;
  const dRiver = distToRiver(px, pz) * S;
  const dDead = Math.hypot(wx - EPIC_SPOTS.deadline.x * S, wz - EPIC_SPOTS.deadline.y * S);
  const dGold = Math.hypot(wx - EPIC_SPOTS.golden.x * S, wz - EPIC_SPOTS.golden.y * S);
  const pitBoost = Math.max(Math.exp(-(dDead * dDead) / 14), Math.exp(-(dGold * dGold) / 14)) * 1.05;
  const riverR = RIVER.width * S * 0.58 + pitBoost;
  const inRiver = 1 - smoothstep(riverR - 0.95, riverR + 0.45, dRiver);
  const distMid = Math.abs(wx + wz - (W + H) * 0.5) * 0.7071;
  const midBridge = smoothstep(1.3, 2.85, distMid);
  const uDiag = (px + pz) * 0.5;
  const endFade = smoothstep(820, 1450, uDiag) * (1 - smoothstep(4550, 5180, uDiag));
  return -0.32 * inRiver * midBridge * endFade;
}

/** Region masks: R = lane carpet, G = base pad, B = river. */
function makeSplat(world, W, H) {
  const N = 1024, kx = N / W, ky = N / H, k = Math.sqrt(kx * ky);
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.filter = 'blur(4px)';
  if (is5v5(world)) {
    const rPts = RIVER_PATH && RIVER_PATH.length >= 2 ? RIVER_PATH : [RIVER.from, RIVER.to];
    const grad = g.createLinearGradient(rPts[0].x * kx, rPts[0].y * ky, rPts[rPts.length - 1].x * kx, rPts[rPts.length - 1].y * ky);
    grad.addColorStop(0.0, 'rgba(0,0,255,0)');
    grad.addColorStop(0.14, 'rgba(0,0,255,1)');
    grad.addColorStop(0.45, 'rgba(0,0,255,0.92)');
    grad.addColorStop(0.50, 'rgba(0,0,255,0.22)');
    grad.addColorStop(0.55, 'rgba(0,0,255,0.92)');
    grad.addColorStop(0.86, 'rgba(0,0,255,1)');
    grad.addColorStop(1.0, 'rgba(0,0,255,0)');
    g.strokeStyle = grad; g.lineWidth = RIVER.width * k * 1.24;
    g.beginPath();
    rPts.forEach((p, i) => (i ? g.lineTo(p.x * kx, p.y * ky) : g.moveTo(p.x * kx, p.y * ky)));
    g.stroke();
    for (const ep of Object.values(EPIC_SPOTS)) {
      g.fillStyle = 'rgba(0,0,255,0.85)';
      g.beginPath(); g.arc(ep.x * kx, ep.y * ky, 275 * k, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = '#ff0000'; g.lineWidth = LANE_WIDTH * k * 1.25;
    for (const pts of Object.values(LANES)) {
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x * kx, p.y * ky) : g.moveTo(p.x * kx, p.y * ky))); g.stroke();
    }
    g.filter = 'blur(6px)';
    for (const f of [FOUNTAIN.blue, FOUNTAIN.red]) {
      g.fillStyle = '#00ff00'; g.beginPath(); g.arc(f.x * kx, f.y * ky, BASE_RADIUS * k * 0.92, 0, Math.PI * 2); g.fill();
    }
  } else {
    g.fillStyle = '#ff0000'; g.fillRect(0, 0, N, N);
    g.filter = 'blur(6px)';
    const f = world.fountain && world.fountain.blue;
    if (f && f.x >= 0 && f.y >= 0) { g.fillStyle = '#00ff00'; g.beginPath(); g.arc(f.x * kx, f.y * ky, 260 * k, 0, Math.PI * 2); g.fill(); }
  }
  const t = new THREE.CanvasTexture(cv);
  t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  return t;
}

const GROUND_FRAG_HEAD = `
varying vec3 vWPos;
uniform sampler2D tSplat, tCarpet, tMud, tMetal, nCarpet, nMud, nMetal;
uniform float uTime, uTeamSplit, uLow;
uniform vec2 uWorld;
vec3 gW; float gLane, gJ, gBase, gRiver;
`;

function makeRiverWater(world, uniforms) {
  const W = ((world && world.w) || MAP_W) * S;
  const H = ((world && world.h) || MAP_W) * S;
  const pts = (RIVER_PATH && RIVER_PATH.length >= 2 ? RIVER_PATH : [RIVER.from, RIVER.to]).map((p) => [p.x * S, p.y * S]);
  const SEGS = 56;
  const wid = RIVER.width * S * 1.54;
  // Resample smooth polyline & compute cumulative arc lengths for continuous curved river ribbon
  const sampleAt = (u) => {
    const f = Math.max(0, Math.min(1, u)) * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(f));
    const t = f - i;
    const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t;
    const z = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
    const tx = pts[i + 1][0] - pts[i][0], tz = pts[i + 1][1] - pts[i][1];
    const tl = Math.hypot(tx, tz) || 1;
    // Widen subtly into the Baron/Dragon epic coves
    const dDead = Math.hypot(x - EPIC_SPOTS.deadline.x * S, z - EPIC_SPOTS.deadline.y * S);
    const dGold = Math.hypot(x - EPIC_SPOTS.golden.x * S, z - EPIC_SPOTS.golden.y * S);
    const hw = wid * 0.5 + Math.max(Math.exp(-(dDead * dDead) / 14), Math.exp(-(dGold * dGold) / 14)) * 0.95;
    return { x, z, nx: -tz / tl, nz: tx / tl, hw };
  };
  const pos = [], uvs = [], idx = [];
  const COLS = 6;
  for (let i = 0; i <= SEGS; i++) {
    const u = i / SEGS;
    const s = sampleAt(u);
    for (let j = 0; j <= COLS; j++) {
      const v = j / COLS;
      const off = (v - 0.5) * 2 * s.hw;
      pos.push(s.x + s.nx * off, -0.025, s.z + s.nz * off);
      uvs.push(u, v);
    }
  }
  for (let i = 0; i < SEGS; i++) {
    for (let j = 0; j < COLS; j++) {
      const a = i * (COLS + 1) + j, b = a + 1, c = a + COLS + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uTime: uniforms.uTime,
      uCenter: { value: new THREE.Vector2(W * 0.5, H * 0.5) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vWPos;
      uniform float uTime;
      uniform vec2 uCenter;
      void main() {
        float bank = smoothstep(0.0, 0.24, vUv.y) * (1.0 - smoothstep(0.76, 1.0, vUv.y));
        float ends = smoothstep(0.0, 0.14, vUv.x) * (1.0 - smoothstep(0.86, 1.0, vUv.x));
        float distMid = abs((vWPos.x - uCenter.x) + (vWPos.z - uCenter.y)) * 0.7071;
        float bridgeMask = smoothstep(1.0, 2.55, distMid);
        float across = abs(vUv.y - 0.5) * 2.0;
        float flow = fract(vUv.x * 18.0 - uTime * 0.55 + across * 0.45 + sin(vUv.y * 8.0 + uTime) * 0.08);
        float chev = smoothstep(0.0, 0.08, flow) * (1.0 - smoothstep(0.12, 0.3, flow));
        float shimmer = 0.5 + 0.5 * sin(vUv.x * 32.0 + uTime * 1.4 + vUv.y * 9.0);
        vec3 deep = vec3(0.06, 0.38, 0.52);
        vec3 stream = vec3(0.22, 0.80, 0.96);
        vec3 col = mix(deep, stream, chev * 0.65 + shimmer * 0.16);
        float alpha = bank * ends * (0.18 + 0.82 * bridgeMask) * (0.58 + chev * 0.24);
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  const water = new THREE.Mesh(geo, mat);
  water.name = 'river-water';
  water.renderOrder = 2;
  return water;
}

/** -> Mesh; mesh.userData.uniforms.uTime is advanced by the caller. */
export function makeGround(world, aniso = 8, lite = false) {
  const W = (world && world.w) || MAP_W, H = (world && world.h) || MAP_W;
  const apron = is5v5(world) ? 48 : 24;
  const uniforms = {
    tSplat: { value: makeSplat(world, W, H) },
    tCarpet: { value: tex('tex/dirty_carpet_diff.jpg', true, aniso) },
    tMud: { value: tex('tex/mud_forest_diff.jpg', true, aniso) },
    tMetal: { value: tex('tex/metal_plate_diff.jpg', true, aniso) },
    nCarpet: { value: lite ? dummyTex() : tex('tex/dirty_carpet_nor_gl.jpg', false, aniso) },
    nMud: { value: lite ? dummyTex() : tex('tex/mud_forest_nor_gl.jpg', false, aniso) },
    nMetal: { value: lite ? dummyTex() : tex('tex/metal_plate_nor_gl.jpg', false, aniso) },
    uLow: { value: lite ? 1 : 0 }, uTime: { value: 0 }, uWorld: { value: new THREE.Vector2(W * S, H * S) }, uTeamSplit: { value: is5v5(world) ? 1 : 0 },
  };
  const mat = lite ? new THREE.MeshLambertMaterial({ color: 0xffffff }) : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.02 });
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GROUND_FRAG_HEAD)
      .replace('#include <map_fragment>', `
        vec2 suv = clamp(vWPos.xz / uWorld, vec2(0.0), vec2(1.0));
        vec4 sp = texture2D(tSplat, suv);
        vec2 edgeDelta = max(max(-vWPos.xz, vWPos.xz - uWorld), vec2(0.0));
        float outside = max(edgeDelta.x, edgeDelta.y);
        float edgeBlend = smoothstep(0.0, 4.5, outside);
        gBase = sp.g;
        gLane = sp.r * (1.0 - gBase);
        gRiver = sp.b * (1.0 - gBase) * (1.0 - gLane);
        gJ = clamp(1.0 - gBase - gLane - gRiver, 0.0, 1.0);
        vec2 uv = vec2(vWPos.x, -vWPos.z);
        vec3 cC, cM, cB;
        if (uLow > 0.5) {
          cC = texture2D(tCarpet, uv * 0.30).rgb * vec3(1.12, 1.14, 0.94) * 1.65 + vec3(0.14, 0.15, 0.10);
          cM = texture2D(tMud, uv * 0.24).rgb * vec3(0.86, 1.08, 0.72) * 1.58 + vec3(0.08, 0.12, 0.05);
          cB = texture2D(tMetal, uv * 0.35).rgb * vec3(0.95, 1.02, 1.04) * 1.55 + vec3(0.08, 0.10, 0.11);
        } else {
          cC = mix(texture2D(tCarpet, uv * 0.30).rgb, texture2D(tCarpet, uv * 0.071 + 0.31).rgb, 0.45) * vec3(1.12, 1.14, 0.94) * 1.65 + vec3(0.14, 0.15, 0.10);
          cM = mix(texture2D(tMud, uv * 0.24).rgb, texture2D(tMud, uv * 0.057 + 0.17).rgb, 0.5) * vec3(0.86, 1.08, 0.72) * 1.58 + vec3(0.08, 0.12, 0.05);
          cB = mix(texture2D(tMetal, uv * 0.35).rgb, texture2D(tMetal, uv * 0.09).rgb, 0.4) * vec3(0.95, 1.02, 1.04) * 1.55 + vec3(0.08, 0.10, 0.11);
        }
        float redSide = step(vWPos.z, vWPos.x) * uTeamSplit;
        cB *= mix(vec3(0.76, 1.04, 1.32), vec3(1.32, 0.84, 0.80), redSide);
        vec3 riverBed = cM * vec3(0.24, 0.42, 0.50) + vec3(0.04, 0.14, 0.20);
        vec3 albedo = cC * gLane + cM * gJ + cB * gBase + riverBed * gRiver;
        float laneEdge = smoothstep(0.08, 0.32, gLane) * (1.0 - smoothstep(0.52, 0.82, gLane));
        float weave = (smoothstep(0.43, 0.5, abs(fract(uv.x * 0.42) - 0.5))
          + smoothstep(0.43, 0.5, abs(fract(uv.y * 0.42) - 0.5))) * 0.5;
        albedo += vec3(0.32, 0.24, 0.10) * laneEdge * (0.34 + weave * 0.16);
        float jungleMottle = sin(uv.x * 0.37) * sin(uv.y * 0.29) * 0.5 + 0.5;
        albedo *= 1.0 - gJ * jungleMottle * 0.055;
        float noiseFade = 0.92 + 0.08 * sin(vWPos.x * 0.57 + sin(vWPos.z * 0.31));
        vec3 outskirts = cM * vec3(0.42, 0.48, 0.44) * noiseFade;
        outskirts *= 1.0 - smoothstep(8.0, 44.0, outside) * 0.46;
        albedo = mix(albedo, outskirts, edgeBlend);
        gLane *= 1.0 - edgeBlend; gBase *= 1.0 - edgeBlend; gRiver *= 1.0 - edgeBlend;
        gJ = mix(gJ, 1.0, edgeBlend);
        diffuseColor.rgb = albedo;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.28, gRiver); roughnessFactor = mix(roughnessFactor, 0.55, gBase);`)
      .replace('#include <normal_fragment_maps>', `
        if (uLow < 0.5) {
        vec3 nC = texture2D(nCarpet, uv * 0.30).xyz * 2.0 - 1.0;
        vec3 nM = texture2D(nMud, uv * 0.24).xyz * 2.0 - 1.0;
        vec3 nB = texture2D(nMetal, uv * 0.35).xyz * 2.0 - 1.0;
        vec3 nm = normalize(nC * gLane + nM * gJ + nB * gBase + vec3(0.0, 0.0, 1.0) * gRiver);
        nm.xy *= 0.85; nm = normalize(nm);
        vec3 nWorld = vec3(nm.x, nm.z, -nm.y);
        normal = normalize((viewMatrix * vec4(nWorld, 0.0)).xyz);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float along = (vWPos.x + vWPos.z) * 0.7071, across = (vWPos.z - vWPos.x) * 0.7071;
          float f = fract(along * 0.55 - uTime * 0.55 + sin(across * 3.1 + uTime) * 0.12 + abs(across) * 0.35);
          float stripe = smoothstep(0.0, 0.07, f) * (1.0 - smoothstep(0.10, 0.28, f));
          float edge = smoothstep(0.55, 1.0, sp.b);
          vec3 wcol = vec3(0.08, 0.42, 0.75) * (0.08 + stripe * 0.85);
          totalEmissiveRadiance += wcol * gRiver * mix(0.35, 0.85, edge);
          vec2 gp = abs(fract(uv * 0.5) - 0.5);
          float line = 1.0 - smoothstep(0.0, 0.02, min(gp.x, gp.y));
          totalEmissiveRadiance += mix(vec3(0.1, 0.45, 1.0), vec3(1.0, 0.2, 0.25), redSide) * line * gBase * 0.06;
        }`);
  };
  const segs = is5v5(world) ? (lite ? 64 : 112) : 24;
  const geo = new THREE.PlaneGeometry(W * S + apron * 2, H * S + apron * 2, segs, segs);
  geo.rotateX(-Math.PI / 2);
  geo.translate(W * S / 2, 0, H * S / 2);
  const posAttr = geo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const wx = posAttr.getX(i), wz = posAttr.getZ(i);
    posAttr.setY(i, terrainHeight(wx, wz, world));
  }
  geo.computeVertexNormals();

  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  m.userData.uniforms = uniforms;
  if (is5v5(world)) {
    const water = makeRiverWater(world, uniforms);
    m.add(water);
    m.userData.water = water;
  }
  return m;
}

/** Floor rings: camp pads, epic pits, fountains. */
export function makePads(world) {
  const g = new THREE.Group();
  const ringGeo = new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2);
  const mk = (x, y, r, col, op, h = 0.02) => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, toneMapped: false }));
    m.position.set(x * S, h, y * S); m.scale.setScalar(r * S); g.add(m);
  };
  if (is5v5(world)) {
    for (const c of CAMPS) mk(c.x, c.y, c.type === 'big' ? 130 : c.type === 'medium' ? 105 : 85, 0xc9a24a, 0.35);
    for (const e of Object.values(EPIC_SPOTS)) {
      mk(e.x, e.y, 210, 0xff5ad8, 0.45, -0.01);
      mk(e.x, e.y, 145, 0xd8a84a, 0.3, -0.01);
    }
    for (const [team, f] of [['blue', FOUNTAIN.blue], ['red', FOUNTAIN.red]]) {
      mk(f.x, f.y, BASE_RADIUS * 0.82, TEAM_COL[team], 0.16); mk(f.x, f.y, 300, TEAM_COL[team], 0.55); mk(f.x, f.y, 190, 0xc89b3c, 0.28);
    }
  } else {
    const f = world.fountain && world.fountain.blue;
    if (f && f.x >= 0 && f.y >= 0) mk(f.x, f.y, 260, TEAM_COL.blue, 0.55);
  }
  return g;
}

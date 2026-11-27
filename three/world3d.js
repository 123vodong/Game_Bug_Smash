// world3d.js - static arena: lit ground (splat-blended PBR textures + animated data-stream river),
// merged walls, instanced bushes, base pads, camp pads. World px -> three units: x*S, y*S (y becomes Z).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP_W, MAP_H, LANES, LANE_WIDTH, FOUNTAIN, BASE_RADIUS, WALLS, BUSHES, CAMPS, EPIC_SPOTS, RIVER } from '../shared/moba/map.js';

export const S = 0.01;
export const TEAM_COL = { blue: 0x39a8ff, red: 0xff4d5e, neutral: 0xffd23f };
const WORLD = MAP_W * S;

const loader = new THREE.TextureLoader();
function tex(url, srgb, aniso) {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Paint the region masks: R = lane carpet, G = base pad, B = river. */
function makeSplat() {
  const N = 1024, k = N / MAP_W;
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.filter = 'blur(3px)';
  // river
  g.strokeStyle = '#0000ff'; g.lineWidth = RIVER.width * k * 1.1;
  g.beginPath(); g.moveTo(RIVER.from.x * k, RIVER.from.y * k); g.lineTo(RIVER.to.x * k, RIVER.to.y * k); g.stroke();
  // lanes
  g.strokeStyle = '#ff0000'; g.lineWidth = LANE_WIDTH * k * 1.25;
  for (const pts of Object.values(LANES)) {
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x * k, p.y * k) : g.moveTo(p.x * k, p.y * k))); g.stroke();
  }
  // bases (soft edge)
  g.filter = 'blur(6px)';
  for (const f of [FOUNTAIN.blue, FOUNTAIN.red]) {
    g.fillStyle = '#00ff00'; g.beginPath(); g.arc(f.x * k, f.y * k, BASE_RADIUS * k * 0.82, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  return t;
}

const GROUND_FRAG_HEAD = `
varying vec3 vWPos;
uniform sampler2D tSplat, tCarpet, tMud, tMetal, nCarpet, nMud, nMetal;
uniform float uTime, uWorld;
vec3 gW; float gLane, gJ, gBase, gRiver;
`;

function makeGround(aniso) {
  const uniforms = {
    tSplat: { value: makeSplat() },
    tCarpet: { value: tex('./assets/tex/dirty_carpet_diff.jpg', true, aniso) },
    tMud: { value: tex('./assets/tex/mud_forest_diff.jpg', true, aniso) },
    tMetal: { value: tex('./assets/tex/metal_plate_diff.jpg', true, aniso) },
    nCarpet: { value: tex('./assets/tex/dirty_carpet_nor_gl.jpg', false, aniso) },
    nMud: { value: tex('./assets/tex/mud_forest_nor_gl.jpg', false, aniso) },
    nMetal: { value: tex('./assets/tex/metal_plate_nor_gl.jpg', false, aniso) },
    uTime: { value: 0 }, uWorld: { value: WORLD },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.02 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GROUND_FRAG_HEAD)
      .replace('#include <map_fragment>', `
        vec2 suv = vWPos.xz / uWorld;
        vec4 sp = texture2D(tSplat, suv);
        gBase = sp.g;
        gLane = sp.r * (1.0 - gBase);
        gRiver = sp.b * (1.0 - gBase) * (1.0 - gLane);
        gJ = clamp(1.0 - gBase - gLane - gRiver, 0.0, 1.0);
        vec2 uv = vec2(vWPos.x, -vWPos.z);
        // two scales per layer break up visible tiling
        vec3 cC = mix(texture2D(tCarpet, uv * 0.30).rgb, texture2D(tCarpet, uv * 0.071 + 0.31).rgb, 0.45) * vec3(0.60, 0.70, 1.0) * 1.7;
        vec3 cM = mix(texture2D(tMud, uv * 0.24).rgb, texture2D(tMud, uv * 0.057 + 0.17).rgb, 0.5) * vec3(0.62, 0.78, 0.55) * 1.7;
        vec3 cB = mix(texture2D(tMetal, uv * 0.35).rgb, texture2D(tMetal, uv * 0.09).rgb, 0.4) * 1.5;
        float redSide = step(vWPos.z, vWPos.x);
        cB *= mix(vec3(0.62, 0.85, 1.25), vec3(1.3, 0.72, 0.74), redSide);
        vec3 albedo = cC * gLane + cM * gJ + cB * gBase + vec3(0.02, 0.05, 0.12) * gRiver;
        float inMap = step(0.0, vWPos.x) * step(vWPos.x, uWorld) * step(0.0, vWPos.z) * step(vWPos.z, uWorld);
        albedo *= mix(0.12, 1.0, inMap);
        diffuseColor.rgb = albedo;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.25, gRiver); roughnessFactor = mix(roughnessFactor, 0.55, gBase);`)
      .replace('#include <normal_fragment_maps>', `
        vec3 nC = texture2D(nCarpet, uv * 0.30).xyz * 2.0 - 1.0;
        vec3 nM = texture2D(nMud, uv * 0.24).xyz * 2.0 - 1.0;
        vec3 nB = texture2D(nMetal, uv * 0.35).xyz * 2.0 - 1.0;
        vec3 nm = normalize(nC * gLane + nM * gJ + nB * gBase + vec3(0.0, 0.0, 1.0) * gRiver);
        nm.xy *= 0.85; nm = normalize(nm);
        vec3 nWorld = vec3(nm.x, nm.z, -nm.y);
        normal = normalize((viewMatrix * vec4(nWorld, 0.0)).xyz);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // data-stream river: chevron stripes scrolling along the diagonal
          float along = (vWPos.x + vWPos.z) * 0.7071, across = (vWPos.z - vWPos.x) * 0.7071;
          float f = fract(along * 0.55 - uTime * 0.55 + sin(across * 3.1 + uTime) * 0.12 + abs(across) * 0.35);
          float stripe = smoothstep(0.0, 0.07, f) * (1.0 - smoothstep(0.10, 0.28, f));
          float grid = (1.0 - smoothstep(0.0, 0.05, abs(fract(across * 1.6) - 0.5) * 2.0 - 0.9)) * 0.0;
          float edge = smoothstep(0.55, 1.0, sp.b);
          vec3 wcol = vec3(0.10, 0.55, 1.0) * (0.10 + stripe * 1.4) + vec3(0.0, 0.25, 0.4) * (0.2 + 0.2 * sin(uTime * 0.8 + along));
          totalEmissiveRadiance += wcol * gRiver * mix(0.45, 1.0, edge);
          // base pads: faint glowing grid in team colour
          vec2 gp = abs(fract(uv * 0.5) - 0.5);
          float line = 1.0 - smoothstep(0.0, 0.02, min(gp.x, gp.y));
          totalEmissiveRadiance += mix(vec3(0.1, 0.45, 1.0), vec3(1.0, 0.2, 0.25), redSide) * line * gBase * 0.22;
        }`);
    mat.userData.shader = sh;
  };
  const geo = new THREE.PlaneGeometry(WORLD + 6, WORLD + 6);
  geo.rotateX(-Math.PI / 2);
  geo.translate(WORLD / 2, 0, WORLD / 2);
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  m.userData.uniforms = uniforms;
  return m;
}

const WALL_STYLE = {
  partition: { h: 1.25, col: 0x9aa4c4, trim: 0x39c2ff },
  cubicles: { h: 0.95, col: 0x7d8fb8, trim: 0x7ed957 },
  glass: { h: 1.05, col: 0xaee8ff, trim: 0x39e0ff },
  shelf: { h: 0.8, col: 0x8a6446, trim: 0xffb347 },
  plant: { h: 0.7, col: 0x3c8f43 }, cooler: { h: 0.9, col: 0x7ec8ff }, pillar: { h: 1.6, col: 0xb8bdd0 },
};

function colorize(geo, hex) {
  const c = new THREE.Color(hex).multiplyScalar(1.7), n = geo.attributes.position.count, a = new Float32Array(n * 3);
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

function buildWalls(scene, aniso) {
  const solid = [], glass = [], trim = [];
  for (const w of WALLS) {
    const st = WALL_STYLE[w.look] || WALL_STYLE.partition;
    if (w.kind === 'seg') {
      const dx = (w.x2 - w.x1) * S, dz = (w.y2 - w.y1) * S, len = Math.hypot(dx, dz) + w.w * S * 0.5, th = w.w * S * 0.5;
      const place = (g) => { g.rotateY(-Math.atan2(dz, dx)); g.translate((w.x1 + w.x2) / 2 * S, 0, (w.y1 + w.y2) / 2 * S); return g; };
      if (w.look === 'glass') {
        // glass panel: thin pane on a low solid skirt
        glass.push(place(colorize(segBox(th * 0.45, len, st.h - 0.3, 0.3), st.col)));
        solid.push(place(colorize(segBox(th, len, 0.3, 0), 0x5a6585)));
      } else solid.push(place(colorize(segBox(th, len, st.h, 0), st.col)));
      trim.push(place(colorize(new THREE.BoxGeometry(len - 0.02, 0.03, th * 0.3).translate(0, st.h + 0.015, 0), new THREE.Color(st.trim).multiplyScalar(0.8).getHex())));
    } else if (w.kind === 'rect') {
      const g = new THREE.BoxGeometry(w.w * S, st.h, w.h * S).translate((w.x + w.w / 2) * S, st.h / 2, (w.y + w.h / 2) * S);
      solid.push(colorize(g, st.col));
    } else if (w.kind === 'circle') {
      const r = w.r * S;
      if (w.look === 'plant') {
        solid.push(colorize(new THREE.CylinderGeometry(r * 0.7, r * 0.55, 0.32, 10).translate(w.x * S, 0.16, w.y * S), 0x8a5a3c));
        solid.push(colorize(new THREE.IcosahedronGeometry(r * 1.15, 1).translate(w.x * S, 0.62, w.y * S), 0x3c9a46));
      } else solid.push(colorize(new THREE.CylinderGeometry(r, r, st.h, 14).translate(w.x * S, st.h / 2, w.y * S), st.col));
    }
  }
  const wallMat = new THREE.MeshStandardMaterial({
    map: tex('./assets/tex/plastered_wall_03_diff.jpg', true, aniso), normalMap: tex('./assets/tex/plastered_wall_03_nor_gl.jpg', false, aniso),
    vertexColors: true, roughness: 0.82, metalness: 0.05,
  });
  const meshes = [];
  const mk = (list, mat, shadow) => {
    if (!list.length) return;
    const m = new THREE.Mesh(mergeGeometries(list.map((g) => g.toNonIndexed ? (g.index ? g.toNonIndexed() : g) : g)), mat);
    m.castShadow = shadow; m.receiveShadow = true; scene.add(m); meshes.push(m);
  };
  mk(solid, wallMat, true);
  mk(glass, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.38, roughness: 0.1, metalness: 0.2, emissive: 0x10343f, depthWrite: false }), false);
  mk(trim, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), false);
  return meshes;
}

function buildBushes(scene) {
  const pts = [];
  const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  for (const b of BUSHES) {
    if (b.kind === 'circle') {
      const n = Math.round((b.r * b.r) / 1500) + 4;
      for (let i = 0; i < n; i++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * b.r * 0.8; pts.push([b.x + Math.cos(a) * d, b.y + Math.sin(a) * d]); }
    } else {
      const dx = b.x2 - b.x1, dy = b.y2 - b.y1, L = Math.hypot(dx, dy) || 1, n = Math.max(2, Math.round(L / 36));
      for (let i = 0; i <= n; i++) {
        for (let j = 0; j < 2; j++) {
          const t = i / n, off = (rnd() - 0.5) * b.w * 0.7;
          pts.push([b.x1 + dx * t + (-dy / L) * off, b.y1 + dy * t + (dx / L) * off]);
        }
      }
    }
  }
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true });
  const uni = { uTime: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uni.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float sway = sin(uTime * 1.6 + instanceMatrix[3].x * 2.7 + instanceMatrix[3].z * 1.9) * 0.07 * max(position.y, 0.0);
        transformed.x += sway; transformed.z += sway * 0.6;`);
  };
  const im = new THREE.InstancedMesh(geo, mat, pts.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  pts.forEach(([x, y], i) => {
    const r = 0.30 + rnd() * 0.22;
    m.compose(new THREE.Vector3(x * S, r * 0.55, y * S), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6), new THREE.Vector3(r, r * 0.8, r));
    im.setMatrixAt(i, m);
    im.setColorAt(i, c.setHSL(0.28 + rnd() * 0.07, 0.50, 0.11 + rnd() * 0.10));
  });
  im.castShadow = true; im.receiveShadow = true; im.userData.uni = uni;
  scene.add(im);
  return im;
}

function buildPads(scene) {
  const g = new THREE.Group();
  const ringGeo = new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2);
  const mk = (x, y, r, col, op) => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, toneMapped: false }));
    m.position.set(x * S, 0.02, y * S); m.scale.setScalar(r * S); g.add(m);
  };
  for (const c of CAMPS) mk(c.x, c.y, c.type === 'big' ? 130 : c.type === 'medium' ? 105 : 85, 0xc9a24a, 0.35);
  for (const e of Object.values(EPIC_SPOTS)) mk(e.x, e.y, 210, 0xff5ad8, 0.5);
  for (const f of [FOUNTAIN.blue, FOUNTAIN.red]) {
    const col = f === FOUNTAIN.blue ? TEAM_COL.blue : TEAM_COL.red;
    mk(f.x, f.y, BASE_RADIUS * 0.82, col, 0.16); mk(f.x, f.y, 300, col, 0.55);
  }
  scene.add(g);
  return g;
}

function buildBorder(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x141b33, roughness: 0.9 });
  const trim = new THREE.MeshBasicMaterial({ color: 0x39c2ff, toneMapped: false });
  const T = 0.5, H = 1.8, geos = [], tg = [];
  const box = (x, z, w, d) => { geos.push(new THREE.BoxGeometry(w, H, d).translate(x, H / 2, z)); tg.push(new THREE.BoxGeometry(w + 0.02, 0.05, d + 0.02).translate(x, H + 0.02, z)); };
  box(WORLD / 2, -T / 2, WORLD + 2 * T, T); box(WORLD / 2, WORLD + T / 2, WORLD + 2 * T, T);
  box(-T / 2, WORLD / 2, T, WORLD); box(WORLD + T / 2, WORLD / 2, T, WORLD);
  const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = m.receiveShadow = true;
  const t = new THREE.Mesh(mergeGeometries(tg), trim);
  scene.add(m, t);
}

export function buildWorld(scene, aniso = 8) {
  const ground = makeGround(aniso);
  scene.add(ground);
  const walls = buildWalls(scene, aniso);
  const bushes = buildBushes(scene);
  const pads = buildPads(scene);
  buildBorder(scene);
  return {
    ground, walls, bushes, pads,
    update(t) { ground.userData.uniforms.uTime.value = t; bushes.userData.uni.uTime.value = t; },
    setShadows(on) { ground.receiveShadow = on; },
  };
}

export function buildLights(scene) {
  scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x3a3358, 1.5));
  scene.add(new THREE.AmbientLight(0x505a80, 0.5));
  const sun = new THREE.DirectionalLight(0xfff0dd, 3.2);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  const R = 17;
  Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 60 });
  sun.shadow.mapSize.set(2048, 2048);
  sun.userData.offset = new THREE.Vector3(-9, 17, 6);
  scene.add(sun, sun.target);
  return sun;
}

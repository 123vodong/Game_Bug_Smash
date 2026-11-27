// world/ground.js - lit ground: splat-blended PBR textures (lane carpet / jungle mud / base metal) + animated
// data-stream river, plus the glowing floor pads (camps, epic pits, fountains). Ported from three/world3d.js.
// Sim px -> scene units: x*S, y*S (sim y becomes scene Z). Works for any source.world {id,w,h,fountain}:
// the '5v5' world gets lanes/river/camps/epics; other worlds (Story floors) get carpet everywhere + a base pad.
import * as THREE from 'three';
import { MAP_W, LANES, LANE_WIDTH, BASE_RADIUS, CAMPS, EPIC_SPOTS, RIVER, FOUNTAIN } from '../../../shared/moba/map.js';

export const S = 0.01; // mirrors Renderer.js scale
export const TEAM_COL = { blue: 0x39a8ff, red: 0xff4d5e, neutral: 0xffd23f };
export const asset = (rel) => new URL('../../../three/assets/' + rel, import.meta.url).href; // spike assets live in /three/assets

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

/** Region masks: R = lane carpet, G = base pad, B = river. */
function makeSplat(world, W, H) {
  const N = 1024, kx = N / W, ky = N / H, k = Math.sqrt(kx * ky);
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.filter = 'blur(3px)';
  if (is5v5(world)) {
    g.strokeStyle = '#0000ff'; g.lineWidth = RIVER.width * k * 1.1;
    g.beginPath(); g.moveTo(RIVER.from.x * kx, RIVER.from.y * ky); g.lineTo(RIVER.to.x * kx, RIVER.to.y * ky); g.stroke();
    g.strokeStyle = '#ff0000'; g.lineWidth = LANE_WIDTH * k * 1.25;
    for (const pts of Object.values(LANES)) {
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x * kx, p.y * ky) : g.moveTo(p.x * kx, p.y * ky))); g.stroke();
    }
    g.filter = 'blur(6px)';
    for (const f of [FOUNTAIN.blue, FOUNTAIN.red]) {
      g.fillStyle = '#00ff00'; g.beginPath(); g.arc(f.x * kx, f.y * ky, BASE_RADIUS * k * 0.82, 0, Math.PI * 2); g.fill();
    }
  } else {
    g.fillStyle = '#ff0000'; g.fillRect(0, 0, N, N); // whole floor = carpet
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

/** -> Mesh; mesh.userData.uniforms.uTime is advanced by the caller. */
export function makeGround(world, aniso = 8, lite = false) {
  const W = (world && world.w) || MAP_W, H = (world && world.h) || MAP_W;
  const uniforms = {
    tSplat: { value: makeSplat(world, W, H) },
    tCarpet: { value: tex('tex/dirty_carpet_diff.jpg', true, aniso) },
    tMud: { value: tex('tex/mud_forest_diff.jpg', true, aniso) },
    tMetal: { value: tex('tex/metal_plate_diff.jpg', true, aniso) },
    nCarpet: { value: lite ? dummyTex() : tex('tex/dirty_carpet_nor_gl.jpg', false, aniso) }, // lite: normal maps are never fetched
    nMud: { value: lite ? dummyTex() : tex('tex/mud_forest_nor_gl.jpg', false, aniso) }, // lite: normal maps are never fetched
    nMetal: { value: lite ? dummyTex() : tex('tex/metal_plate_nor_gl.jpg', false, aniso) }, // lite: normal maps are never fetched
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
        vec2 suv = vWPos.xz / uWorld;
        vec4 sp = texture2D(tSplat, suv);
        gBase = sp.g;
        gLane = sp.r * (1.0 - gBase);
        gRiver = sp.b * (1.0 - gBase) * (1.0 - gLane);
        gJ = clamp(1.0 - gBase - gLane - gRiver, 0.0, 1.0);
        vec2 uv = vec2(vWPos.x, -vWPos.z);
        vec3 cC, cM, cB;
        if (uLow > 0.5) { // lite: one fetch per layer (3 instead of 6)
          cC = texture2D(tCarpet, uv * 0.30).rgb * vec3(0.60, 0.70, 1.0) * 1.7;
          cM = texture2D(tMud, uv * 0.24).rgb * vec3(0.62, 0.78, 0.55) * 1.7;
          cB = texture2D(tMetal, uv * 0.35).rgb * 1.5;
        } else {
          cC = mix(texture2D(tCarpet, uv * 0.30).rgb, texture2D(tCarpet, uv * 0.071 + 0.31).rgb, 0.45) * vec3(0.60, 0.70, 1.0) * 1.7;
          cM = mix(texture2D(tMud, uv * 0.24).rgb, texture2D(tMud, uv * 0.057 + 0.17).rgb, 0.5) * vec3(0.62, 0.78, 0.55) * 1.7;
          cB = mix(texture2D(tMetal, uv * 0.35).rgb, texture2D(tMetal, uv * 0.09).rgb, 0.4) * 1.5;
        }
        float redSide = step(vWPos.z, vWPos.x) * uTeamSplit;
        cB *= mix(vec3(0.62, 0.85, 1.25), vec3(1.3, 0.72, 0.74), redSide);
        vec3 albedo = cC * gLane + cM * gJ + cB * gBase + vec3(0.02, 0.05, 0.12) * gRiver;
        float inMap = step(0.0, vWPos.x) * step(vWPos.x, uWorld.x) * step(0.0, vWPos.z) * step(vWPos.z, uWorld.y);
        albedo *= mix(0.12, 1.0, inMap);
        diffuseColor.rgb = albedo;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.25, gRiver); roughnessFactor = mix(roughnessFactor, 0.55, gBase);`)
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
          // data-stream river: chevron stripes scrolling along the diagonal
          float along = (vWPos.x + vWPos.z) * 0.7071, across = (vWPos.z - vWPos.x) * 0.7071;
          float f = fract(along * 0.55 - uTime * 0.55 + sin(across * 3.1 + uTime) * 0.12 + abs(across) * 0.35);
          float stripe = smoothstep(0.0, 0.07, f) * (1.0 - smoothstep(0.10, 0.28, f));
          float edge = smoothstep(0.55, 1.0, sp.b);
          vec3 wcol = vec3(0.10, 0.55, 1.0) * (0.10 + stripe * 1.4) + vec3(0.0, 0.25, 0.4) * (0.2 + 0.2 * sin(uTime * 0.8 + along));
          totalEmissiveRadiance += wcol * gRiver * mix(0.45, 1.0, edge);
          // base pads: faint glowing grid in team colour
          vec2 gp = abs(fract(uv * 0.5) - 0.5);
          float line = 1.0 - smoothstep(0.0, 0.02, min(gp.x, gp.y));
          totalEmissiveRadiance += mix(vec3(0.1, 0.45, 1.0), vec3(1.0, 0.2, 0.25), redSide) * line * gBase * 0.06;
        }`);
  };
  const geo = new THREE.PlaneGeometry(W * S + 6, H * S + 6);
  geo.rotateX(-Math.PI / 2);
  geo.translate(W * S / 2, 0, H * S / 2);
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  m.userData.uniforms = uniforms;
  return m;
}

/** Floor rings: camp pads, epic pits, fountains. */
export function makePads(world) {
  const g = new THREE.Group();
  const ringGeo = new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2);
  const mk = (x, y, r, col, op) => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, toneMapped: false }));
    m.position.set(x * S, 0.02, y * S); m.scale.setScalar(r * S); g.add(m);
  };
  if (is5v5(world)) {
    for (const c of CAMPS) mk(c.x, c.y, c.type === 'big' ? 130 : c.type === 'medium' ? 105 : 85, 0xc9a24a, 0.35);
    for (const e of Object.values(EPIC_SPOTS)) mk(e.x, e.y, 210, 0xff5ad8, 0.5);
    for (const [team, f] of [['blue', FOUNTAIN.blue], ['red', FOUNTAIN.red]]) {
      mk(f.x, f.y, BASE_RADIUS * 0.82, TEAM_COL[team], 0.16); mk(f.x, f.y, 300, TEAM_COL[team], 0.55);
    }
  } else {
    const f = world.fountain && world.fountain.blue;
    if (f && f.x >= 0 && f.y >= 0) mk(f.x, f.y, 260, TEAM_COL.blue, 0.55);
  }
  return g;
}

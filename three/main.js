// main.js - Three.js renderer spike for Bug Smash Team Mode. Runs the real OfflineSim.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OfflineSim } from '../src/entities/moba/OfflineSim.js';
import { CHAMPIONS } from '../shared/moba/champions.js';
import { buildWorld, buildLights, S } from './world3d.js';
import { Units } from './units3d.js';
import { Fx } from './fx3d.js';
import { Hud } from './hud.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const champ = CHAMPIONS[Q.get('champ')] ? Q.get('champ') : 'pixel';
const hud = new Hud();
// ?shot=1 (screenshot harness): virtual 10 fps clock so a slow software renderer still plays the sim in "real" time.
const SHOT = !!Q.get('shot'); let fakeNow = Date.now();
if (SHOT) Date.now = () => fakeNow;

// ---------- renderer / post ----------
const canvas = $('gl');
// Low by default: no MSAA on the canvas, 0.75 pixel ratio, no shadows, no bloom (raise them in the Quality panel or with ?shadow=medium&bloom=1&pr=1.5)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: new URLSearchParams(location.search).get('aa') === '1', powerPreference: 'high-performance' });
renderer.setPixelRatio(0.75);
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = false; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070a16);
scene.fog = new THREE.Fog(0x0b1024, 26, 60);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const FOV = 32, PITCH = THREE.MathUtils.degToRad(55);
const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 1, 120);
let dist = Number(Q.get('dist')) || 19;

const GRADE = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.55 }, uSat: { value: 1.12 }, uCon: { value: 1.06 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig, uSat, uCon; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat); c.rgb = (c.rgb - 0.18) * uCon + 0.18;
      vec2 q = vUv - 0.5; float v = smoothstep(0.85, 0.2, length(q * vec2(1.0, 0.9)) * 1.25); c.rgb *= mix(1.0 - uVig, 1.0, v);
      gl_FragColor = c; }`,
};
let composer, bloomPass;
function buildComposer() {
  const pr = renderer.getPixelRatio(), w = innerWidth, h = innerHeight;
  const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 0 });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pr); composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.38, 0.55, 0.88);
  composer.addPass(bloomPass); composer.addPass(new ShaderPass(GRADE)); composer.addPass(new OutputPass());
}
buildComposer();

// ---------- world ----------
const world = buildWorld(scene, Math.min(8, renderer.capabilities.getMaxAnisotropy()));
const sun = buildLights(scene);
const units = new Units(scene, camera);
await units.load();
scene.traverse((o) => { if (o.material && o.material.isMeshStandardMaterial) o.material.envMapIntensity = 0.35; });
for (const g of Object.values(units.base)) g.scene.traverse((o) => { if (o.material) o.material.envMapIntensity = 0.45; });
for (const b of Object.values(units.b)) if (b.mat.isMeshStandardMaterial) b.mat.envMapIntensity = 0.35;
const fx = new Fx(scene, camera, units, renderer);

// ---------- sim ----------
const sim = new OfflineSim({
  champ, name: 'Duke', sandbox: true,
  emit: (type, m) => {
    try {
      if (type === 'fx') fx.fx(m, sim);
      else if (type === 'atk') fx.atk(m, sim);
      else if (type === 'announce' && m.title) hud.toast(`${m.title} ${m.sub || ''}`);
    } catch (e) { console.warn('emit error', type, e); }
  },
});
sim.receive('hello');
sim.update(16);
const me = () => sim.state.champions.get('me');
{ // practice room: mid-game kit; sandbox keeps 0s cooldowns, no mana cost and invincibility ON (toggle them in the Practice panel)
  sim.debug('level', 11); const c = me(); c.ranks = { q: 3, w: 3, e: 3, r: 1 };
  const f = sim.world.fountain.blue; sim.debug('tp', f.x + 700, f.y - 700);
}
units.onGone = (ms) => { fx.burstParticles(ms.x * S, 0.4, ms.y * S, ms.team === 'blue' ? 0x39a8ff : ms.team === 'red' ? 0xff4d5e : 0xb18cff, ms.kind === 'big' ? 18 : 7, 1.8, 0.1, 0.5); };

// ---------- camera ----------
const target = new THREE.Vector3(), pan = new THREE.Vector3(); let panning = false;
const keys = new Set();
function placeCamera(dt) {
  const c = me(); const want = new THREE.Vector3(c.x * S, 0, c.y * S).add(pan);
  target.lerp(want, 1 - Math.exp(-dt * 8));
  const sh = fx.shakeAmt;
  camera.position.set(target.x + (Math.random() - 0.5) * sh, target.y + Math.sin(PITCH) * dist + (Math.random() - 0.5) * sh, target.z + Math.cos(PITCH) * dist);
  camera.lookAt(target.x, target.y, target.z);
  camera.updateMatrixWorld();
  sun.position.copy(target).add(sun.userData.offset); sun.target.position.copy(target);
  // snap the shadow frustum to texels to avoid shimmering
  const ts = (sun.shadow.camera.right * 2) / sun.shadow.mapSize.x; sun.position.x = Math.round(sun.position.x / ts) * ts; sun.position.z = Math.round(sun.position.z / ts) * ts;
  sun.target.position.x = sun.position.x - sun.userData.offset.x; sun.target.position.z = sun.position.z - sun.userData.offset.z;
}
{ const c = me(); target.set(c.x * S, 0, c.y * S); }

// ---------- input ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
let mouse = { x: innerWidth / 2, y: innerHeight / 2 }, ground = { x: 0, y: 0 }, rightHeld = false, lastOrder = 0;
function groundAt(mx, my) {
  ndc.set((mx / innerWidth) * 2 - 1, -(my / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  if (ray.ray.intersectPlane(plane, hit)) return { x: hit.x / S, y: hit.z / S };
  return null;
}
function order(g, force) {
  const now = performance.now(); if (!force && now - lastOrder < 100) return; lastOrder = now;
  const id = units.pick(sim, 'blue', g.x, g.y);
  if (id) sim.receive('order', { type: 'attack', id }); else sim.receive('order', { type: 'move', x: Math.round(g.x), y: Math.round(g.y) });
}
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  const g = groundAt(e.clientX, e.clientY); if (!g) return;
  if (e.button === 2) { rightHeld = true; order(g, true); fx.flip('ringWhite', { x: g.x * S, y: g.y * S, size: 1.1, flat: true, color: 0x7ed957, dur: 0.35 }); }
  else if (e.button === 0) { const id = units.pick(sim, 'blue', g.x, g.y); if (id) sim.receive('order', { type: 'attack', id }); else { sim.receive('order', { type: 'move', x: Math.round(g.x), y: Math.round(g.y) }); } }
});
addEventListener('mouseup', (e) => { if (e.button === 2) rightHeld = false; });
addEventListener('mousemove', (e) => { mouse = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('wheel', (e) => { dist = THREE.MathUtils.clamp(dist + Math.sign(e.deltaY) * 1.5, 9, 30); e.preventDefault(); }, { passive: false });
function cast(slot) {
  const g = groundAt(mouse.x, mouse.y) || ground; const id = units.pick(sim, 'blue', g.x, g.y);
  if (slot === 'd' || slot === 'f') sim.receive('spell', { slot, x: Math.round(g.x), y: Math.round(g.y), id });
  else sim.receive('cast', { slot, x: Math.round(g.x), y: Math.round(g.y), id });
}
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if ('qwerdf'.includes(k) && k.length === 1 && !e.repeat) cast(k);
  else if (k === ' ') { pan.set(0, 0, 0); e.preventDefault(); } else keys.add(e.key);
});
addEventListener('keyup', (e) => keys.delete(e.key));
$('mm').addEventListener('contextmenu', (e) => { e.preventDefault(); const r = $('mm').getBoundingClientRect(); sim.receive('order', { type: 'move', x: ((e.clientX - r.left) / r.width) * 6000, y: ((e.clientY - r.top) / r.height) * 6000 }); });

// ---------- quality controls ----------
const quality = { shadow: Q.get('shadow') || 'off', bloom: Q.get('bloom') === '1', pr: Number(Q.get('pr')) || 0.75, inst: Q.get('inst') !== '0', auto: Q.get('auto') !== '0' && !Q.get('shot') };
let note = 'manual';
function applyShadow() {
  const size = { low: 1024, medium: 2048, high: 4096 }[quality.shadow];
  renderer.shadowMap.enabled = !!size; sun.castShadow = !!size;
  if (size && sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  $('qShadow').value = quality.shadow;
}
function applyPR() { renderer.setPixelRatio(quality.pr); resize(); $('qScale').value = quality.pr; }
function resize() {
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
  fx.setViewport(innerHeight * renderer.getPixelRatio(), FOV);
}
addEventListener('resize', resize);
$('qShadow').onchange = (e) => { quality.shadow = e.target.value; note = 'manual'; applyShadow(); };
$('qBloom').onchange = (e) => { quality.bloom = e.target.checked; note = 'manual'; };
$('qScale').oninput = (e) => { quality.pr = Number(e.target.value); note = 'manual'; applyPR(); };
$('qInst').onchange = (e) => { quality.inst = e.target.checked; units.setInstanced(quality.inst); };
$('qAuto').onchange = (e) => { quality.auto = e.target.checked; };
$('qAuto').checked = quality.auto; $('qBloom').checked = quality.bloom; $('qInst').checked = quality.inst;
for (const [id, d] of Object.entries(CHAMPIONS)) { const o = document.createElement('option'); o.value = id; o.textContent = `${d.name} (${d.role})`; if (id === champ) o.selected = true; $('qChamp').appendChild(o); }
$('qChamp').onchange = (e) => { Q.set('champ', e.target.value); location.search = Q.toString(); };
// practice room controls (same sim switches as the Phaser practice bar)
$('pCd').onchange = (e) => sim.receive('setNoCd', { enabled: e.target.checked });
$('pMana').onchange = (e) => sim.receive('setNoMana', { enabled: e.target.checked });
$('pGod').onchange = (e) => sim.receive('setGodMode', { enabled: e.target.checked });
$('pLvl').onclick = () => { const c = me(); sim.debug('level', Math.min(18, (c.level || 1) + 1)); c.ranks = { q: 5, w: 5, e: 5, r: c.level >= 6 ? 3 : 0 }; $('pLvl').blur(); };
$('pDummy').onclick = () => { sim.receive('spawnDummy'); $('pDummy').blur(); };
$('pClear').onclick = () => { sim.receive('clearDummies'); $('pClear').blur(); };
units.setInstanced(quality.inst); applyShadow(); applyPR();

let autoStep = 0, warm = 0;
function autoReduce(dt, frameMs) {
  warm += dt; if (!quality.auto || warm < 4) return;
  if (hud.avgMs > 28) autoStep += dt; else autoStep = Math.max(0, autoStep - dt);
  if (autoStep < 2.5) return; autoStep = 0;
  if (quality.shadow === 'high') quality.shadow = 'medium'; else if (quality.shadow === 'medium') quality.shadow = 'low';
  else if (quality.pr > 0.75) quality.pr = Math.max(0.6, quality.pr - 0.25);
  else if (quality.bloom) quality.bloom = false;
  else if (quality.shadow !== 'off') quality.shadow = 'off';
  else return;
  note = 'auto-reduced'; applyShadow(); applyPR(); $('qBloom').checked = quality.bloom; hud.toast(`Low FPS: quality reduced (shadow ${quality.shadow}, pixel ratio ${quality.pr}, bloom ${quality.bloom ? 'on' : 'off'})`);
}

// ---------- bench: dense mid fight ----------
let autocast = false, castAt = 0;
function bench(opts = {}) {
  sim.debug('tp', 3000, 3000); for (let i = 0; i < 3; i++) sim._spawnWave();
  let bi = 0, ri = 0;
  sim.state.champions.forEach((c) => {
    if (c.id === 'me') return; const blue = c.team === 'blue', i = blue ? bi++ : ri++;
    const a = (i - 2) * 0.5; c.dead = false; c.hp = c.maxHp; c.x = 3000 + (blue ? -330 : 330) + Math.sin(a) * 120; c.y = 3000 + (blue ? 330 : -330) + Math.cos(a) * 160 * (i % 2 ? 1 : -1); c._order = null;
  });
  let k = 0; sim.state.units.forEach((u) => { if (u.team === 'neutral') return; const blue = u.team === 'blue'; const j = k++; u.x = 3000 + (blue ? -200 : 200) + ((j * 37) % 7 - 3) * 70 + (blue ? -1 : 1) * (j % 5) * 25; u.y = 3000 + (blue ? 200 : -200) + ((j * 53) % 7 - 3) * 70 + (blue ? 1 : -1) * (j % 5) * 25; });
  autocast = opts.autocast !== false; castAt = 0;
  return { champions: sim.state.champions.size, units: sim.state.units.size };
}
$('qBench').onclick = () => { const r = bench(); hud.toast(`Bench: ${r.champions} champions, ${r.units} units, auto-casting`); };
window.__t3 = { sim, scene, camera, renderer, fx, units, quality, bench, hud, cast, setPan: (x, y) => pan.set(x, 0, y), get info() { return renderer.info; }, setDist: (d) => { dist = d; }, applyShadow, applyPR };

// ---------- loop ----------
let last = performance.now(), frameMs = 16, tAcc = 0, errCount = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (SHOT) fakeNow += 100;
  const raw = SHOT ? 100 : now - last; last = now; frameMs = raw; window.__t3.frames = (window.__t3.frames || 0) + 1; const dt = Math.min(SHOT ? 0.1 : 0.05, raw / 1000); tAcc += dt;
  try {
    sim.update(dt * 1000);
    if (autocast && me() && now > castAt) {
      castAt = now + 650; const c = me(); let best = null, bd = 1e9;
      sim.state.champions.forEach((e) => { if (e.team !== c.team && !e.dead) { const d = Math.hypot(e.x - c.x, e.y - c.y); if (d < bd) { bd = d; best = e; } } });
      if (best) { const sl = 'qwer'[Math.floor(Math.random() * 4)]; sim.receive('cast', { slot: sl, x: Math.round(best.x), y: Math.round(best.y), id: best.id }); }
      c.hp = c.maxHp; c.mana = c.maxMana;
    }
    if (rightHeld) { const g = groundAt(mouse.x, mouse.y); if (g) order(g, false); }
    const sp = 14 * dt * (dist / 17);
    if (keys.has('ArrowLeft')) pan.x -= sp; if (keys.has('ArrowRight')) pan.x += sp; if (keys.has('ArrowUp')) pan.z -= sp; if (keys.has('ArrowDown')) pan.z += sp;
    placeCamera(dt);
    world.update(tAcc);
    units.sync(sim, dt, tAcc, 'me');
    fx.damageNumbers(sim, target);
    fx.update(dt);
    renderer.info.reset();
    if (quality.bloom) composer.render(); else renderer.render(scene, camera);
    const halfH = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * dist / Math.sin(PITCH) / S, halfW = halfH * camera.aspect * Math.sin(PITCH);
    hud.bars(sim); hud.minimap(sim, target, halfW, halfH * 0.8, tAcc);
    const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
    hud.stats(renderer.info, { frameMs, w: sz.x, h: sz.y, pr: renderer.getPixelRatio(), shadow: quality.shadow, bloom: quality.bloom, inst: quality.inst, units: sim.clientState.units.size + sim.clientState.champions.size, fx: fx.items.length, particles: fx.pn, note }, tAcc);
    autoReduce(dt, frameMs);
  } catch (e) { if (errCount++ < 5) console.error('frame error', e); }
}
window.__t3.ready = true;
requestAnimationFrame(frame);

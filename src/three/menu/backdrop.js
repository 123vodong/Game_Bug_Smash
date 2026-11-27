// Menu backdrop: a very cheap Three scene. A dev-office desk: a big IDE "monitor" with scrolling code
// (one repeating texture, offset animated = free), a keyboard, coffee mug, rubber duck, floating code glyphs,
// bug billboards scuttling over the desk, and the stickman idling. ~25 draw calls, no shadows, no post.
// createBackdrop(host, {quality}) -> { stop(), setQuality(q) }.  quality: 'low' (default) | 'med'.
// Pauses itself while the tab is hidden; low = 30 fps cap and 0.7x pixel ratio.
import * as THREE from 'three';

const PRESET = {
  low: { pr: 0.7, fps: 30, glyphs: 14, bugs: 5, aa: false },
  med: { pr: 1.25, fps: 60, glyphs: 26, bugs: 9, aa: true },
};
const GLYPHS = ['{ }', '</>', 'NULL', '0xDEAD', '// TODO', 'git blame', '404', 'undefined', 'NaN', '==', 'try{}', '#FIXME', 'rm -rf', 'sudo', ';', '[]'];
const GCOL = ['#39ff14', '#00d9ff', '#ffd23f', '#ff3ef2', '#c44dff', '#ff8a5c'];
const CODE = [
  ['// TODO: fix before Friday', 'c'], ['function smashBug(bug) {', 'k'], ['  if (bug === null) return NULL_POINTER;', 'k'],
  ['  while (deadline.isNear()) {', 'k'], ['    bug.hp -= laptop.damage;', 'n'], ['    coffee.refill(); // again', 'c'],
  ['  }', 'k'], ['  return "works on my machine";', 's'], ['}', 'k'], ['', 'n'],
  ['const bugs = backlog.filter(b => !b.feature);', 'n'], ['git commit -m "fix stuff" // 47th', 'c'],
  ['catch (e) { /* ignore */ }', 'k'], ['setTimeout(fixLater, Infinity);', 's'], ['// HACK: do not touch', 'c'],
  ['if (rubberDuck.agrees()) ship();', 'n'], ['let heisenbug = observe(heisenbug); // gone', 's'], ['import { panic } from "deadline";', 'k'],
];
const COL = { k: '#ff7ac6', n: '#cfe9ff', s: '#ffd866', c: '#6a8a7a' };

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 1; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
  if (repeat) t.wrapT = THREE.RepeatWrapping;
  return t;
}

function ideTexture() {
  const W = 1024, H = 1024, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#0d1117'; g.fillRect(0, 0, W, H);
  g.font = '28px Consolas, monospace'; g.textBaseline = 'middle';
  const lines = 24, lh = H / lines;
  for (let i = 0; i < lines; i++) {
    const [txt, k] = CODE[i % CODE.length], y = i * lh + lh / 2;
    if (i % 7 === 3) { g.fillStyle = 'rgba(255,60,80,.18)'; g.fillRect(70, y - lh / 2, W, lh); }   // the buggy line
    g.fillStyle = '#4a5a6a'; g.fillText(String(i + 1).padStart(2, ' '), 18, y);
    g.fillStyle = COL[k]; g.fillText(txt, 84, y);
    if (i % 7 === 3) { g.strokeStyle = '#ff4466'; g.lineWidth = 3; g.beginPath(); const x0 = 84, x1 = 84 + Math.min(700, txt.length * 16);
      for (let x = x0; x < x1; x += 8) g.lineTo(x, y + 14 + ((x / 8) % 2 ? 4 : 0)); g.stroke(); }
  }
  return tex(c, true);
}

function bugTexture(kind) {
  const c = canvas(128, 128), g = c.getContext('2d');
  g.translate(64, 70); g.lineCap = 'round';
  const body = { lady: '#e8222e', null: '#39c24a', race: '#b84dff', leak: '#ffb020', legacy: '#8a7a5a' }[kind];
  g.strokeStyle = '#111'; g.lineWidth = 5;
  for (const s of [-1, 1]) for (const y of [-26, -4, 18]) { g.beginPath(); g.moveTo(s * 20, y); g.lineTo(s * 46, y - 12 + (y > 0 ? 24 : 0)); g.stroke(); }
  g.beginPath(); g.moveTo(-8, -42); g.lineTo(-22, -60); g.moveTo(8, -42); g.lineTo(22, -60); g.stroke();   // antennae
  g.fillStyle = '#111'; g.beginPath(); g.ellipse(0, -36, 17, 14, 0, 0, 7); g.fill();                       // head
  g.fillStyle = body; g.beginPath(); g.ellipse(0, 4, 34, 46, 0, 0, 7); g.fill();
  g.lineWidth = 3; g.stroke();
  g.fillStyle = '#111';
  if (kind === 'lady') { g.beginPath(); g.moveTo(0, -40); g.lineTo(0, 50); g.stroke(); for (const [x, y] of [[-16, -10], [16, -14], [-18, 20], [17, 18]]) { g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); } }
  else { g.font = '900 20px Consolas'; g.textAlign = 'center'; g.fillStyle = '#05100a'; g.fillText(kind === 'null' ? 'null' : kind === 'race' ? 'a||b' : kind === 'leak' ? 'MEM' : 'v1.0', 0, 10); }
  g.fillStyle = '#fff'; for (const x of [-7, 7]) { g.beginPath(); g.arc(x, -38, 4, 0, 7); g.fill(); g.fillStyle = '#c00'; g.beginPath(); g.arc(x, -38, 1.8, 0, 7); g.fill(); g.fillStyle = '#fff'; }
  return tex(c);
}

function glyphTexture(txt, col) {
  const c = canvas(192, 64), g = c.getContext('2d');
  g.font = '900 34px Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = col; g.shadowBlur = 14; g.fillStyle = col; g.fillText(txt, 96, 34);
  return tex(c);
}

function keyboardTexture() {
  const c = canvas(512, 160), g = c.getContext('2d');
  g.fillStyle = '#1a1f2b'; g.fillRect(0, 0, 512, 160);
  for (let r = 0; r < 5; r++) for (let k = 0; k < 14; k++) {
    const hot = (r * 14 + k) % 11 === 4;
    g.fillStyle = hot ? '#39ff14' : '#2d3548'; g.fillRect(10 + k * 35.5, 12 + r * 28, 31, 24);
  }
  return tex(c);
}

function stickTexture(done) {
  const c = canvas(128, 160), g = c.getContext('2d');
  const t = tex(c);
  const draw = () => { // fallback stickman
    g.clearRect(0, 0, 128, 160); g.strokeStyle = '#fff'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.arc(64, 34, 18, 0, 7); g.moveTo(64, 52); g.lineTo(64, 106); g.moveTo(64, 70); g.lineTo(34, 92); g.moveTo(64, 70); g.lineTo(94, 92);
    g.moveTo(64, 106); g.lineTo(40, 148); g.moveTo(64, 106); g.lineTo(88, 148); g.stroke(); t.needsUpdate = true;
  };
  const img = new Image();
  img.onload = () => { g.clearRect(0, 0, 128, 160); const s = Math.min(128 / img.width, 160 / img.height); g.drawImage(img, (128 - img.width * s) / 2, (160 - img.height * s) / 2, img.width * s, img.height * s); t.needsUpdate = true; done?.(); };
  img.onerror = draw;
  draw();
  img.src = new URL('../../../assets/characters/stickman/idle.svg', import.meta.url).href;
  return t;
}

const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);

export function createBackdrop(host, { quality = 'low' } = {}) {
  let q = PRESET[quality] ? quality : 'low';
  const P = () => PRESET[q];
  const canvasEl = document.createElement('canvas');
  canvasEl.className = 'bsm-canvas';
  host.prepend(canvasEl);
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: P().aa, alpha: false, powerPreference: 'low-power' });
  renderer.setClearColor(0x070b14, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x070b14, 11, 26);
  const cam = new THREE.PerspectiveCamera(48, 1, 0.1, 60);
  const disposables = [];
  const own = (o) => { disposables.push(o); return o; };

  scene.add(new THREE.AmbientLight(0x8899bb, 1.1));
  const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(-3, 6, 6); scene.add(dl);
  const glow = new THREE.PointLight(0x2bd9ff, 12, 14); glow.position.set(0, 3, 0); scene.add(glow);

  // desk
  const desk = new THREE.Mesh(own(new THREE.PlaneGeometry(40, 22)), own(new THREE.MeshLambertMaterial({ color: 0x2a1d17 })));
  desk.rotation.x = -Math.PI / 2; scene.add(desk);
  // monitor: bezel + screen with scrolling code
  const bezel = new THREE.Mesh(own(new THREE.BoxGeometry(12.6, 7.3, 0.4)), own(new THREE.MeshLambertMaterial({ color: 0x12151d })));
  bezel.position.set(0, 3.9, -3.2); scene.add(bezel);
  const stand = new THREE.Mesh(own(new THREE.BoxGeometry(1.2, 1.2, 0.5)), bezel.material); stand.position.set(0, 0.6, -3.3); scene.add(stand);
  const ide = ideTexture(); ide.repeat.set(1, 0.5); own(ide);
  const screen = new THREE.Mesh(own(new THREE.PlaneGeometry(12, 6.75)), own(new THREE.MeshBasicMaterial({ map: ide, color: 0xbbbbbb, fog: false })));
  screen.position.set(0, 3.9, -2.98); scene.add(screen);
  // keyboard
  const kbT = own(keyboardTexture());
  const kb = new THREE.Mesh(own(new THREE.BoxGeometry(6.4, 0.18, 2)), [0, 1, 2, 3, 4, 5].map((i) => own(new THREE.MeshLambertMaterial(i === 2 ? { map: kbT } : { color: 0x1a1f2b }))));
  kb.position.set(0, 0.1, 0.6); kb.rotation.x = 0.05; scene.add(kb);
  // mug + duck
  const mug = new THREE.Mesh(own(new THREE.CylinderGeometry(0.42, 0.36, 0.7, 14)), own(new THREE.MeshLambertMaterial({ color: 0xf2f2f2 })));
  mug.position.set(4.6, 0.35, 0.2); scene.add(mug);
  const handle = new THREE.Mesh(own(new THREE.TorusGeometry(0.2, 0.06, 6, 10)), mug.material); handle.position.set(5.05, 0.38, 0.2); scene.add(handle);
  const coffee = new THREE.Mesh(own(new THREE.CircleGeometry(0.36, 14)), own(new THREE.MeshBasicMaterial({ color: 0x4a2a14 })));
  coffee.rotation.x = -Math.PI / 2; coffee.position.set(4.6, 0.69, 0.2); scene.add(coffee);
  const duck = new THREE.Group();
  const yel = own(new THREE.MeshLambertMaterial({ color: 0xffd23f }));
  const dB = new THREE.Mesh(own(new THREE.SphereGeometry(0.5, 12, 10)), yel); dB.scale.set(1.2, 0.9, 1);
  const dH = new THREE.Mesh(own(new THREE.SphereGeometry(0.3, 10, 8)), yel); dH.position.set(0.45, 0.5, 0);
  const dK = new THREE.Mesh(own(new THREE.ConeGeometry(0.12, 0.3, 6)), own(new THREE.MeshLambertMaterial({ color: 0xff8a1f }))); dK.rotation.z = -Math.PI / 2; dK.position.set(0.82, 0.48, 0);
  duck.add(dB, dH, dK); duck.position.set(-4.8, 0.5, 0.5); duck.rotation.y = -0.5; scene.add(duck);

  // stickman idle (billboard)
  const stickMat = own(new THREE.SpriteMaterial({ map: own(stickTexture()), fog: false }));
  const stick = new THREE.Sprite(stickMat); stick.scale.set(1.7, 2.1, 1); stick.position.set(-3.2, 1.2, 1.6); scene.add(stick);

  // bugs
  const bugTex = ['lady', 'null', 'race', 'leak', 'legacy'].map((k) => own(bugTexture(k)));
  const bugs = [];
  const gl = []; // glyph sprites
  const glyphMats = GLYPHS.map((t, i) => own(new THREE.SpriteMaterial({ map: own(glyphTexture(t, GCOL[i % GCOL.length])), transparent: true, depthWrite: false, fog: false })));

  function build() {
    for (const b of bugs) { scene.remove(b.s); } bugs.length = 0;
    for (const s of gl) scene.remove(s); gl.length = 0;
    for (let i = 0; i < P().bugs; i++) {
      const m = own(new THREE.SpriteMaterial({ map: bugTex[i % bugTex.length], transparent: true, depthWrite: false }));
      const s = new THREE.Sprite(m); const sz = rnd(0.7, 1.2); s.scale.set(sz, sz, 1);
      s.position.set(rnd(-8, 8), 0.4, rnd(-1.5, 3.6)); scene.add(s);
      bugs.push({ s, sz, vx: (Math.random() < 0.5 ? -1 : 1) * rnd(0.5, 1.4), ph: Math.random() * 6, pause: 0 });
    }
    for (let i = 0; i < P().glyphs; i++) {
      const s = new THREE.Sprite(glyphMats[i % glyphMats.length]);
      s.userData = { vy: rnd(0.25, 0.7), sw: rnd(0.3, 1), ph: Math.random() * 6, x: rnd(-9, 9), z: rnd(-2.5, 3), sz: rnd(0.9, 1.7) };
      s.position.set(s.userData.x, rnd(0.5, 7), s.userData.z); scene.add(s); gl.push(s);
    }
  }
  build();

  function resize() {
    const w = Math.max(2, host.clientWidth), h = Math.max(2, host.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * (q === 'low' ? P().pr : 1) * (q === 'low' ? 1 : P().pr / 1.25));
    renderer.setSize(w, h, false);
    cam.aspect = w / h; cam.updateProjectionMatrix();
    baseZ = 8.2 * Math.max(1, 1.7 / cam.aspect);
  }
  let baseZ = 8.2;
  resize();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(host);

  let raf = 0, last = performance.now(), t = 0, dead = false;
  function frame(now) {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    const gap = 1000 / P().fps;
    if (now - last < gap - 2) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt;
    // slow camera drift
    cam.position.set(Math.sin(t * 0.17) * 1.4, 2.6 + Math.sin(t * 0.23) * 0.25, baseZ + Math.sin(t * 0.11) * 0.5);
    cam.lookAt(Math.sin(t * 0.13) * 0.5, 2.7, 0);
    ide.offset.y = (ide.offset.y + dt * 0.012) % 1;
    glow.intensity = 11 + Math.sin(t * 2.1) * 1.5;
    stick.position.y = 1.2 + Math.sin(t * 2.4) * 0.04; stick.scale.set(1.7, 2.1 + Math.sin(t * 2.4) * 0.05, 1);
    duck.rotation.z = Math.sin(t * 1.3) * 0.05;
    for (const b of bugs) {
      if (b.pause > 0) { b.pause -= dt; b.s.material.rotation = Math.sin(t * 20 + b.ph) * 0.08; continue; }
      b.s.position.x += b.vx * dt;
      b.s.material.rotation = Math.sin(t * 11 + b.ph) * 0.16;          // wobbling scuttle
      b.s.scale.set(b.sz * (b.vx < 0 ? -1 : 1), b.sz * (1 + Math.sin(t * 22 + b.ph) * 0.05), 1);
      if (Math.abs(b.s.position.x) > 9.5) { b.vx = -Math.sign(b.s.position.x) * rnd(0.5, 1.4); b.s.position.z = rnd(-1.5, 3.6); }
      else if (Math.random() < dt * 0.15) { b.pause = rnd(0.4, 1.2); if (Math.random() < 0.5) b.vx = -b.vx; }
    }
    for (const s of gl) {
      const u = s.userData; s.position.y += u.vy * dt;
      s.position.x = u.x + Math.sin(t * u.sw + u.ph) * 0.4;
      if (s.position.y > 8) { s.position.y = 0.3; u.x = rnd(-9, 9); u.z = rnd(-2.5, 3); }
      s.position.z = u.z;
      const k = Math.min(1, s.position.y / 1.2, (8 - s.position.y) / 1.6); s.scale.set(u.sz * 1.5 * k, u.sz * 0.5 * k, 1);
    }
    renderer.render(scene, cam);
  }
  const onVis = () => {
    cancelAnimationFrame(raf);
    if (!document.hidden && !dead) { last = performance.now(); raf = requestAnimationFrame(frame); }
  };
  document.addEventListener('visibilitychange', onVis);
  if (!document.hidden) raf = requestAnimationFrame(frame);

  return {
    canvas: canvasEl,
    setQuality(next) { if (PRESET[next] && next !== q) { q = next; build(); resize(); } },
    stop() {
      if (dead) return; dead = true; cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis); ro?.disconnect();
      for (const d of disposables) { try { d.dispose(); } catch (_) { /* ignore */ } }
      renderer.dispose(); renderer.forceContextLoss?.(); canvasEl.remove();
    },
  };
}
void lerp;

// HuntView: Three.js 2.5D renderer + input for HuntSim. Tilted camera over the IDE plane; bugs / hunter / pickups are
// billboard sprites (assets/bugs/*.png, assets/characters/stickman/*.svg, assets/skill_icons/*.svg).
// createHuntView({canvas, sim, hooks:{onWin(result)->info, onLose(result), retry(), next(), again(), menu()}, quality}) -> {start(), stop(), togglePause()}
import * as THREE from 'three';
import { Quality, qualityFromUrl, IS_MOBILE } from '../core/Quality.js';
import { createBackdrop } from './backdrop.js';
import { createFx, wx, wz } from './fx.js';
import { createHuntHud } from './hud.js';
import { SKILL_IDS } from '../../data/skills.js';
import { BUGS } from '../../data/bugs.js';
import { AudioManager } from '../../core/AudioManager.js';
import { SaveManager } from '../../core/SaveManager.js';

const BUG_PX = 0.72, HUNTER_W = 0.95, HUNTER_H = 1.05;
const CURSOR = `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><circle cx='14' cy='14' r='9' fill='none' stroke='%23ff4a4a' stroke-width='2.2'/><path d='M14 2v6M14 20v6M2 14h6M20 14h6' stroke='%23ff4a4a' stroke-width='2.2' stroke-linecap='round'/><circle cx='14' cy='14' r='2' fill='%23ff4a4a'/></svg>") 14 14, crosshair`;
const POSES = ['idle', 'run', 'smash', 'dead', 'pm'];
const tryA = (fn) => { try { fn(); } catch (_) { /* audio is optional */ } };

function loadImg(src) {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}
function canvasTex(img, size, fallback) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  if (img) g.drawImage(img, 0, 0, size, size); else fallback(g, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData = { aspect: 1 }; return t;
}
// Placeholder that still reads as the bug / dev thing if an asset is missing (keep-bug-theme rule).
const bugFallback = (g, s) => { g.fillStyle = '#7ed957'; g.beginPath(); g.ellipse(s / 2, s / 2, s * 0.3, s * 0.38, 0, 0, 7); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 4; g.stroke(); g.fillStyle = '#111'; g.fillRect(s * 0.38, s * 0.3, 8, 8); g.fillRect(s * 0.56, s * 0.3, 8, 8); };
const devFallback = (g, s) => { g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.arc(s / 2, s * 0.25, s * 0.12, 0, 7); g.moveTo(s / 2, s * 0.37); g.lineTo(s / 2, s * 0.7); g.moveTo(s * 0.3, s * 0.5); g.lineTo(s * 0.7, s * 0.5); g.moveTo(s / 2, s * 0.7); g.lineTo(s * 0.35, s * 0.95); g.moveTo(s / 2, s * 0.7); g.lineTo(s * 0.65, s * 0.95); g.stroke(); g.fillStyle = '#39c2ff'; g.fillRect(s * 0.55, s * 0.42, s * 0.3, s * 0.2); };

export async function createHuntView({ canvas, sim, hooks = {}, quality }) {
  // ---------- assets ----------
  const bugIds = [...Object.keys(BUGS), 'bug-dead'];
  const [bugImgs, poseImgs, skillImgs] = await Promise.all([
    Promise.all(bugIds.map((id) => loadImg(`assets/bugs/${id}.png`))),
    Promise.all(POSES.map((p) => loadImg(`assets/characters/stickman/${p}.svg`))),
    Promise.all(SKILL_IDS.map((id) => loadImg(`assets/skill_icons/skill-${id}.svg`))),
  ]);
  const bugTex = {}, poseTex = {}, skillTex = {};
  bugIds.forEach((id, i) => {
    const im = bugImgs[i];
    const t = canvasTex(im, 128, bugFallback); // normalises any aspect to a square (bug art is ~square)
    bugTex[id] = t;
  });
  POSES.forEach((p, i) => { poseTex[p] = canvasTex(poseImgs[i], 192, devFallback); });
  SKILL_IDS.forEach((id, i) => { skillTex[id] = canvasTex(skillImgs[i], 96, (g, s) => { g.fillStyle = '#ffd23f'; g.fillRect(s * 0.2, s * 0.2, s * 0.6, s * 0.6); }); });

  // ---------- renderer / scene / camera ----------
  const gl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b0c0f);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 80);
  const q = new Quality({ level: quality || qualityFromUrl(), auto: true, limitMs: IS_MOBILE ? 42 : 28, onChange: (s) => { gl.setPixelRatio(Math.min(s.pr, devicePixelRatio || 1) || 1); resize(); } });
  const camTarget = new THREE.Vector3(0, 0, 0.35), camBase = new THREE.Vector3();
  function resize() {
    const w = Math.max(1, canvas.clientWidth || innerWidth), h = Math.max(1, canvas.clientHeight || innerHeight);
    gl.setSize(w, h, false); camera.aspect = w / h;
    // Fit the 12.8 x 7.2 playfield: pull back for narrow/portrait aspect ratios.
    const k = Math.max(1, 1.78 / camera.aspect);
    camBase.set(0, 9.4 * k, 6.3 * k); camera.position.copy(camBase); camera.lookAt(camTarget); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  }
  resize();
  const onResize = () => resize(); addEventListener('resize', onResize);

  const hud = createHuntHud({ level: sim.level, onPause: () => togglePause(), onMute: null });
  const v3 = new THREE.Vector3();
  const project = (x, y, z) => { v3.set(x, y, z).project(camera); return { x: (v3.x * 0.5 + 0.5) * (canvas.clientWidth || innerWidth), y: (-v3.y * 0.5 + 0.5) * (canvas.clientHeight || innerHeight) }; };
  const fx = createFx({ scene, camera, layer: hud.layer, maxParticles: q.settings.particles ? Math.min(q.settings.particles, 400) : 300, project });
  const backdrop = createBackdrop({ scene });

  // ---------- shared meshes ----------
  const shGeo = new THREE.CircleGeometry(0.28, 16); shGeo.rotateX(-Math.PI / 2);
  const shMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false });
  const mkShadow = (r = 1) => { const m = new THREE.Mesh(shGeo, shMat); m.scale.set(r, 1, r); m.position.y = 0.02; scene.add(m); return m; };
  const hunterMat = new THREE.SpriteMaterial({ map: poseTex.idle, transparent: true, depthWrite: false });
  const hunter = new THREE.Sprite(hunterMat); hunter.scale.set(HUNTER_W, HUNTER_H, 1); scene.add(hunter);
  const hShadow = mkShadow(1.5);
  const xhGeo = new THREE.RingGeometry(0.34, 0.4, 28); xhGeo.rotateX(-Math.PI / 2);
  const xh = new THREE.Mesh(xhGeo, new THREE.MeshBasicMaterial({ color: 0xff4a4a, transparent: true, opacity: 0.9, depthWrite: false })); xh.position.y = 0.05; xh.visible = false; scene.add(xh);

  const bugViews = new Map(); // uid -> {s, sh, deadAt}
  function bugView(b) {
    let v = bugViews.get(b.uid);
    if (!v) {
      const m = new THREE.SpriteMaterial({ map: bugTex[b.id], transparent: true, depthWrite: false });
      const s = new THREE.Sprite(m); s.scale.set(BUG_PX, BUG_PX, 1); scene.add(s);
      v = { s, sh: mkShadow(1), deadAt: 0, k: 1, a: 1 }; bugViews.set(b.uid, v);
    }
    return v;
  }
  const pickViews = new Map();
  function pickView(p) {
    let v = pickViews.get(p.uid);
    if (!v) {
      const glow = new THREE.Mesh(shGeo, new THREE.MeshBasicMaterial({ color: p.def.color, transparent: true, opacity: 0.35, depthWrite: false })); glow.scale.set(2.2, 1, 2.2); glow.position.y = 0.03; scene.add(glow);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: skillTex[p.id], transparent: true, depthWrite: false })); s.scale.set(0.6, 0.6, 1); scene.add(s);
      v = { s, glow }; pickViews.set(p.uid, v);
    }
    return v;
  }
  function dropPick(uid) { const v = pickViews.get(uid); if (!v) return; scene.remove(v.s, v.glow); v.s.material.dispose(); v.glow.material.dispose(); pickViews.delete(uid); }

  // ---------- state ----------
  let raf = 0, last = 0, tMs = 0, paused = false, ended = false, stopped = false, hover = null, endTimer = 0, hoverOn = false, sq = 0;
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(), ndc = new THREE.Vector2();
  const toSim = (e) => {
    const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); if (!ray.ray.intersectPlane(plane, hit)) return null;
    return { x: hit.x / 0.01 + 640, y: hit.z / 0.01 + 360 };
  };
  const mouse = { x: -999, y: -999 };

  // ---------- input ----------
  const down = (e) => { if (paused || ended) return; try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } tryA(() => AudioManager.prime()); const p = toSim(e); if (p) { sim.setTarget(p.x, p.y); mouse.x = p.x; mouse.y = p.y; } sim.setHold(true); e.preventDefault(); };
  const move = (e) => { const p = toSim(e); if (!p) return; mouse.x = p.x; mouse.y = p.y; if (!paused) sim.setTarget(p.x, p.y); };
  const up = () => sim.setHold(false);
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up);
  const key = (e) => {
    const k = e.key.toLowerCase();
    if (k === 'p') togglePause();
    else if (k === 'escape') { if (ended) { if (sim.state === 'lost' || infoReady) hooks.menu && hooks.menu(); } else togglePause(true); }
    else if (k === 'm') { const m = AudioManager.toggleMute(); tryA(() => SaveManager.setMuted(m)); hud.showToast(m ? 'MUTED' : 'SOUND ON'); }
    else if (k === 'r' && ended && (sim.state === 'lost' || infoReady)) hooks.retry && hooks.retry();
  };
  addEventListener('keydown', key);
  let infoReady = false;

  function togglePause(quitAsk = false) {
    if (ended || stopped) return;
    if (!paused) { paused = true; sim.setHold(false); tryA(() => AudioManager.pause()); hud.showPause(quitAsk, { resume: () => togglePause(), menu: () => hooks.menu && hooks.menu() }); }
    else { paused = false; hud.clearModal(); tryA(() => AudioManager.resume()); }
  }

  // ---------- sim events -> fx/audio ----------
  const off = [];
  const on = (n, f) => off.push(sim.on(n, f));
  on('smash', ({ bug, killed }) => {
    sq = 0.2;
    fx.burst(bug.x, bug.y, killed ? 0xffd23f : 0xffffff, killed ? 16 : 6, killed ? 3.4 : 2);
    fx.shake(killed ? 180 : 80, killed ? 0.07 : 0.025);
    if (killed) { fx.shockwave(bug.x, bug.y, 0xffd23f, 1.1); fx.number(bug.x, bug.y - 10, `+${bug.score}`, '#ffd23f', 20); fx.glyphs(bug.x, bug.y, 6); tryA(() => AudioManager.bugKill()); }
    else { fx.number(bug.x, bug.y - 10, `${bug.hp}/${bug.maxHp}`, '#ffffff', 13); tryA(() => AudioManager.smashHit()); }
  });
  on('kill', (k) => { if (k.tierUp) tryA(() => AudioManager.combo(k.tier)); });
  on('combo', (c) => fx.number(c.x, c.y - 34, `COMBO x${c.combo}!`, comboCss(c.combo), 16));
  on('pickup', ({ pickup: p, def }) => { fx.number(p.x, p.y - 24, def.name.toUpperCase(), '#' + def.color.toString(16).padStart(6, '0'), 16); fx.shockwave(p.x, p.y, def.color, 1); fx.burst(p.x, p.y, def.color, 14); tryA(() => AudioManager.skillPickup(def.category)); if (def.effect.respawnAllBugs) fx.flash('#' + def.color.toString(16).padStart(6, '0'), 0.25, 200); dropPick(p.uid); });
  on('pickupExpire', ({ pickup: p }) => dropPick(p.uid));
  on('teleport', ({ x, y }) => { fx.burst(x, y, 0x8aa9ff, 14); fx.shockwave(x, y, 0x7ec8ff, 1); });
  on('skillEnd', () => tryA(() => AudioManager.skillExpire()));
  on('glitch', ({ from, to }) => { fx.shockwave(from.x, from.y, 0xff66aa, 0.7, 0.25); fx.shockwave(to.x, to.y, 0x66aaff, 0.9, 0.3); fx.glyphs(to.x, to.y, 4); });
  on('bugRespawn', ({ bug }) => fx.burst(bug.x, bug.y, 0x7ec8ff, 5, 1.5));
  on('warn', () => tryA(() => AudioManager.timerWarning())); on('tick', () => tryA(() => AudioManager.timerTick()));
  on('coach', () => tryA(() => AudioManager.uiClick()));
  on('win', (r) => {
    ended = true; sim.setHold(false); const k = sim.lastKill || { x: 640, y: 360 };
    // Minimal finale (cinematic is a later task): flash + shockwave + code fragments, then the overlay.
    fx.flash('#ffffc8', 0.8, 220); fx.shake(420, 0.14); fx.shockwave(k.x, k.y, 0x39c2ff, 2.6, 0.6); fx.glyphs(k.x, k.y, 24); fx.burst(k.x, k.y, 0x7ed957, 40, 4);
    tryA(() => AudioManager.victory());
    endTimer = setTimeout(() => { if (stopped) return; const info = hooks.onWin ? hooks.onWin(r) : null; infoReady = true; hud.showWin(r, info, { next: hooks.next, again: hooks.again, menu: hooks.menu }); }, 900);
  });
  on('lose', (r) => {
    ended = true; sim.setHold(false); fx.flash('#ff0000', 0.4, 220); fx.shake(400, 0.12); tryA(() => AudioManager.failure());
    if (hooks.onLose) hooks.onLose(r);
    endTimer = setTimeout(() => { if (stopped) return; infoReady = true; hud.showLose(r, { retry: hooks.retry, menu: hooks.menu }); }, 700);
  });
  function comboCss(c) { return c >= 10 ? '#ff5252' : c >= 5 ? '#ff9800' : '#ffd23f'; }

  // ---------- per-frame sync ----------
  function sync(dtMs) {
    const h = sim.hunter, now = sim.now;
    // hunter
    const pose = sim.state === 'lost' ? 'dead' : h.pose;
    if (hunterMat.map !== poseTex[pose]) hunterMat.map = poseTex[pose];
    sq = Math.max(0, sq - dtMs / 1000);
    const bob = h.speed > 30 ? Math.sin(tMs / 70) * 0.04 : 0, sk = 1 + sq * 0.9;
    hunter.scale.set((h.facingLeft ? -1 : 1) * HUNTER_W * (2 - sk), HUNTER_H * sk, 1);
    hunter.position.set(wx(h.x), HUNTER_H / 2 - 0.05 + bob, wz(h.y)); hShadow.position.set(wx(h.x), 0.02, wz(h.y));
    // bugs
    hover = null; let bd = 46;
    for (const b of sim.bugs) {
      const v = bugView(b);
      if (!b.alive) {
        if (!v.deadAt) { v.deadAt = tMs; v.s.material.map = bugTex['bug-dead']; v.s.material.color.set(0xffffff); }
        const k = Math.max(0, 1 - (tMs - v.deadAt) / 320);
        v.s.scale.set(BUG_PX * 1.4 * k, BUG_PX * 1.4 * k, 1); v.s.material.rotation = (1 - k) * 4.7; v.sh.visible = k > 0; v.s.visible = k > 0;
        v.s.position.set(wx(b.x), 0.3, wz(b.y)); continue;
      }
      const target = b.visible ? 1 : 0, spd = b.visible ? 14 : 8;
      v.k += (target - v.k) * Math.min(1, spd * dtMs / 1000);
      let a = v.k; if (b.visible && b.blink) a *= 0.55 + Math.sin(now / 90) * 0.35;
      v.s.material.opacity = a; v.s.visible = v.k > 0.02; v.sh.visible = v.s.visible;
      const sc = BUG_PX * (0.4 + 0.6 * v.k) * (b.id === 'bug-scarab' || b.id === 'bug-robot' ? 1.1 : 1);
      v.s.scale.set(sc, sc, 1); v.sh.scale.set(sc / 0.72 * (b.radius / 22), 1, sc / 0.72 * (b.radius / 22));
      v.s.position.set(wx(b.x), 0.3 + 0.025 * Math.sin(tMs / 120 + b.uid), wz(b.y)); v.sh.position.set(wx(b.x), 0.02, wz(b.y));
      if (Math.hypot(b.vx, b.vy) > 30) v.s.material.rotation = Math.atan2(b.vy, b.vx) * 0.1;
      // tint by state: wounded = redder; recent hit = white flash
      const dmg = 1 - b.hp / b.maxHp;
      if (now < b.flashUntil) v.s.material.color.setRGB(2.6, 2.6, 2.6); else v.s.material.color.setRGB(1, 1 - dmg * 0.55, 1 - dmg * 0.55);
      if (b.visible) { const d = Math.hypot(b.x - mouse.x, b.y - mouse.y); if (d < bd) { bd = d; hover = b; } }
    }
    // pickups
    for (const p of sim.pickups) {
      if (!p.alive) continue; const v = pickView(p), remain = p.diesAt - now;
      v.s.position.set(wx(p.x), 0.45 + Math.sin(tMs / 190) * 0.07, wz(p.y)); v.glow.position.x = wx(p.x); v.glow.position.z = wz(p.y);
      v.glow.scale.setScalar(2 + Math.sin(tMs / 220) * 0.35); v.glow.scale.y = 1;
      v.s.material.opacity = remain < 1500 ? 0.4 + Math.sin(now / 90) * 0.4 : 1;
    }
    if (bugViews.size > 64) for (const [uid, v] of bugViews) if (v.deadAt && tMs - v.deadAt > 400) { scene.remove(v.s, v.sh); v.s.material.dispose(); bugViews.delete(uid); }
    // hover crosshair
    xh.visible = !!hover && !paused && !ended;
    if (hover) { xh.position.set(wx(hover.x), 0.05, wz(hover.y)); xh.scale.setScalar(1 + Math.sin(tMs / 110) * 0.08); }
    if (!!hover !== hoverOn) { hoverOn = !!hover; canvas.style.cursor = hoverOn ? CURSOR : ''; }
  }

  function frame(now) {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const dt = Math.min(100, now - last); if (IS_MOBILE && dt < 30) return; last = now; tMs += dt;
    if (!paused) sim.update(dt);
    sync(paused ? 0 : dt);
    backdrop.update(dt); if (!paused) fx.update(dt);
    hud.update(sim, tMs);
    camera.position.copy(camBase).add(fx.shakeOff); camera.lookAt(camTarget);
    gl.render(scene, camera);
    q.update(dt / 1000, dt);
    window.__hunt = { fps: 1000 / Math.max(1, dt), calls: gl.info.render.calls };
  }
  function start() { last = performance.now(); raf = requestAnimationFrame(frame); tryA(() => { AudioManager.setMuted(SaveManager.isMuted()); }); return api; }
  function stop() {
    if (stopped) return; stopped = true; cancelAnimationFrame(raf); clearTimeout(endTimer); off.forEach((f) => f());
    removeEventListener('keydown', key); removeEventListener('resize', onResize);
    canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('lostpointercapture', up);
    canvas.style.cursor = '';
    for (const v of bugViews.values()) v.s.material.dispose(); for (const v of pickViews.values()) { v.s.material.dispose(); v.glow.material.dispose(); }
    for (const t of [...Object.values(bugTex), ...Object.values(poseTex), ...Object.values(skillTex)]) t.dispose();
    fx.dispose(); backdrop.dispose(); hud.dispose(); gl.dispose();
  }
  const api = { start, stop, togglePause, sim, hud, renderer: gl, camera };
  return api;
}

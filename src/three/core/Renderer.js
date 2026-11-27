// Renderer seam (breakdown 3.5). Owns WebGLRenderer + Scene + render loop pieces; delegates to
// optional sibling modules, loaded lazily with stubs so this file works before they exist.
//
// createRenderer({canvas, source, mode, opts}) -> Renderer (synchronous; module loading is async:
// await r.ready before relying on world/units. frame() is safe to call earlier, it just draws the scene.)
//   Renderer { ready:Promise, frame(dtMs), pick(sx,sy)->{ground:{x,y}|null, unitId|null}, project(wx,wy)->{x,y,visible},
//              setQuality('low'|'med'|'high'), setDoor(id,state), dispose(), info (gl info), scene, camera, modules }
// opts: {quality:'low'|'med'|'high', autoQuality:boolean, fixedDt:boolean, onToast(msg), hud:boolean}
//
// Sibling module contracts (each default-exported factory OR named export, all optional):
//   ../world/index.js  createWorld({THREE,scene,source,renderer,quality,mode}) -> {update(ctx), setDoor(id,s), setQuality(settings), sun?, dispose()}
//   ../units/index.js  createUnits({THREE,scene,source,mode}) -> {sync(state,dtSec,tSec), pick(wx,wy)->id|null, dispose()}
//   ../fx/router.js    createFx({THREE,scene,source,camera,mode}) -> {update(dtSec), shakeAmt?, setViewport?(hPx,fov), dispose()}
//   ../hud/hud.js      createHud({source,project,mode,opts}) -> {update(ctx), dispose()}   (20 Hz, called by Renderer)
//   ./Input.js         createInput({canvas,source,pick,project,camera,mode}) -> {update(dtSec), dispose()}
//   ./Camera.js        createCamera({THREE,canvas,source,mode}) -> {camera, update(dtSec,shake), resize(w,h), dispose()}
import * as THREE from 'three';
import { Quality, SHADOW_SIZE, qualityFromUrl, IS_MOBILE } from './Quality.js';
import { FrameClock } from './Clock.js';
import { FOUNTAIN_RADIUS as FOUNTAIN_R } from '../../../shared/moba/rules.js'; // read-only shared rule

const S = 0.01; // sim px -> world units (same scale as the spike: world y maps to scene z)
const noop = () => {};

async function opt(path, names) {
  try {
    const m = await import(/* @vite-ignore */ path);
    for (const n of names) if (typeof m[n] === 'function') return m[n];
    if (typeof m.default === 'function') return m.default;
  } catch (e) {
    if (!/Failed to fetch|Cannot find|Failed to load|not found|404|error resolving/i.test(String(e && e.message))) console.warn('[Renderer] optional module failed', path, e);
  }
  return null;
}

function stubCamera({ canvas, source }) {
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 1, 120), target = new THREE.Vector3(30, 0, 30), want = new THREE.Vector3();
  const PITCH = 1.0, DIST = 17;
  return {
    camera,
    update(dt) {
      const st = source.state(), me = st && st.champions && st.champions.get && st.champions.get(source.localId);
      if (me) want.set(me.x * S, 0, me.y * S); else want.copy(target);
      target.lerp(want, 1 - Math.exp(-dt * 8));
      camera.position.set(target.x, target.y + Math.sin(PITCH) * DIST, target.z + Math.cos(PITCH) * DIST);
      camera.lookAt(target); camera.updateMatrixWorld();
    },
    resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); },
    dispose: noop,
  };
}

export function createRenderer({ canvas, source, mode = 'team', opts = {} }) {
  const gl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, depth: true, precision: IS_MOBILE ? 'mediump' : 'highp', powerPreference: 'high-performance' });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14161c);
  const mods = { world: null, units: null, fx: null, hud: null, input: null, cam: null };
  let disposed = false, hudAcc = 0, camBox = null, quality = null;
  const ndc = new THREE.Vector2(), ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(), v3 = new THREE.Vector3();
  const clock = new FrameClock({ fixedDtMs: opts.fixedDt ? 100 : 0 });
  const toast = (m) => { try { opts.onToast && opts.onToast(m); } catch (_) { /* ignore */ } };

  const sz = { w: 1, h: 1 }; // cached CSS size (updated in resize only: getBoundingClientRect forces layout)
  const size = () => sz;
  const measure = () => { const r = canvas.getBoundingClientRect(); sz.w = Math.max(1, Math.round(r.width || canvas.clientWidth || innerWidth)); sz.h = Math.max(1, Math.round(r.height || canvas.clientHeight || innerHeight)); };
  const resize = () => {
    measure(); const { w, h } = sz; gl.setSize(w, h, false);
    if (camBox) camBox.resize(w, h);
    if (mods.fx && mods.fx.setViewport) mods.fx.setViewport(h * gl.getPixelRatio(), camBox && camBox.camera.fov);
  };
  const applyQuality = (s, note) => {
    gl.setPixelRatio(s.pr);
    gl.shadowMap.enabled = SHADOW_SIZE[s.shadow] > 0;
    if (mods.world && mods.world.setQuality) mods.world.setQuality(s);
    resize();
    if (note === 'auto-reduced') toast(`Low FPS: quality reduced (shadow ${s.shadow}, pixel ratio ${s.pr})`);
  };
  quality = new Quality({ level: opts.quality || qualityFromUrl(), auto: opts.autoQuality !== false && !/[?&]autoq=0/.test(location.search), limitMs: IS_MOBILE ? 42 : 28, onChange: applyQuality });
  camBox = stubCamera({ canvas, source });
  applyQuality(quality.settings, 'init');
  const onResize = () => resize();
  addEventListener('resize', onResize);

  const project = (wx, wy) => {
    if (!camBox) return { x: 0, y: 0, visible: false };
    v3.set(wx * S, 0, wy * S).project(camBox.camera);
    const { w, h } = size();
    return { x: (v3.x * 0.5 + 0.5) * w, y: (-v3.y * 0.5 + 0.5) * h, visible: v3.z > -1 && v3.z < 1 && Math.abs(v3.x) <= 1.05 && Math.abs(v3.y) <= 1.05 };
  };
  const pick = (sx, sy) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((sx - r.left) / (r.width || 1)) * 2 - 1, -((sy - r.top) / (r.height || 1)) * 2 + 1);
    ray.setFromCamera(ndc, camBox.camera);
    if (!ray.ray.intersectPlane(plane, hit)) return { ground: null, unitId: null };
    const ground = { x: hit.x / S, y: hit.z / S };
    let unitId = null;
    try { unitId = (mods.units && mods.units.pick && mods.units.pick(ground.x, ground.y)) || null; } catch (_) { /* ignore */ }
    return { ground, unitId };
  };

  const ready = (async () => {
    const [cW, cU, cF, cH, cI, cC] = await Promise.all([
      opt('../world/index.js', ['createWorld']), opt('../units/index.js', ['createUnits']), opt('../fx/router.js', ['createFx']),
      opt('../hud/hud.js', ['createHud']), opt('./Input.js', ['createInput']), opt('./Camera.js', ['createCamera']),
    ]);
    if (disposed) return;
    const base = { THREE, scene, source, mode, quality: quality.settings };
    if (cC) { try { const c = cC({ ...base, canvas }); if (c && c.camera) { camBox.dispose(); camBox = c; } } catch (e) { console.warn('[Renderer] Camera', e); } }
    if (cW) mods.world = guard(() => cW({ ...base, renderer: gl }));
    if (cU) mods.units = guard(() => cU(base));
    if (cF) mods.fx = guard(() => cF({ ...base, camera: camBox.camera }));
    if (mods.fx && mods.fx.setViewport) mods.fx.setViewport(sz.h * gl.getPixelRatio(), camBox.camera.fov);
    // Input before HUD: the HUD buttons / minimap call into it.
    if (cI) mods.input = guard(() => cI({ canvas, source, pick, project, camera: camBox.camera, mode }));
    if (cH && opts.hud !== false) mods.hud = guard(() => cH({ source, project, mode, opts: { ...opts, input: mods.input, camera: camBox } }));
    mods.cam = camBox;
    wire();
    applyQuality(quality.settings, 'modules');
  })();
  // Glue between modules (kept here so the modules stay independent of each other).
  const offs = [];
  function wire() {
    const { input, hud, units } = mods;
    if (input && hud) {
      input.isBlocked = () => { const a = document.activeElement; return !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) || !!(hud.scoreboardOpen && hud.scoreboardOpen()); }; // shop/info panels do not block hotkeys (P / C / Esc must be able to close them)
      input.hooks.toast = (m) => hud.toast && hud.toast(m);
      input.hooks.scoreboard = (on) => hud.setScoreboard && hud.setScoreboard(on);
      input.hooks.escape = () => { if (hud.setScoreboard) hud.setScoreboard(false); if (hud.closePanels) hud.closePanels(); };
      input.hooks.shop = () => hud.toggleShop && hud.toggleShop();
      input.hooks.info = () => hud.toggleInfo && hud.toggleInfo();
      input.hooks.ping = (p) => hud.toast && hud.toast(p.enemy ? 'Danger here! (bug spotted)' : 'Ping: look at this commit', p.enemy ? '#ff8a8a' : '#9fdcff', 900);
      // chat: Enter is handled by hud/feed.js itself (window keydown), so no hooks.chat here.
    } else if (input) input.hooks.toast = (m) => toast(m);
    if (units && source.on) {
      const sub = (t, fn) => { const o = source.on(t, (m) => { if (!disposed) { try { fn(m); } catch (e) { console.error('[Renderer] glue', t, e); } } }); if (typeof o === 'function') offs.push(o); };
      sub('atk', (arr) => { if (!Array.isArray(arr)) return; for (const a of arr) { if (!a) continue; if (!a.r) units.lunge(a.f); units.flash(a.t); } });
      sub('fx', (m) => {
        if (!m) return;
        if ((m.k === 'hit' || m.k === 'knock') && m.id != null) units.flash(m.id);
        else if (m.k === 'dash' && m.sid != null) units.lunge(m.sid);
      });
    }
  }
  /** Camera footprint on the ground in sim px (bbox of the 4 screen corners), for the minimap view rect. */
  const view = { x: 0, y: 0, width: 0, height: 0 };
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
  function cameraView() {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let ci = 0; ci < 4; ci++) {
      const u = corners[ci][0], v = corners[ci][1];
      ndc.set(u * 2 - 1, 1 - v * 2); ray.setFromCamera(ndc, camBox.camera);
      if (!ray.ray.intersectPlane(plane, hit)) hit.copy(ray.ray.direction).setY(0).normalize().multiplyScalar(60).add(ray.ray.origin);
      x0 = Math.min(x0, hit.x); x1 = Math.max(x1, hit.x); y0 = Math.min(y0, hit.z); y1 = Math.max(y1, hit.z);
    }
    view.x = x0 / S; view.y = y0 / S; view.width = (x1 - x0) / S; view.height = (y1 - y0) / S; return view;
  }
  function canShop(me) {
    if (!me) return false; if (me.dead) return true;
    const f = source.world && source.world.fountain && source.world.fountain[me.team]; const p = (mods.input && mods.input.pred) || me;
    return !!f && Math.hypot(p.x - f.x, p.y - f.y) <= FOUNTAIN_R;
  }
  function guard(fn) { try { return fn(); } catch (e) { console.warn('[Renderer] module init failed', e); return null; } }

  const call = (m, fn, a, b, c, d) => { if (m && typeof m[fn] === 'function') { try { m[fn](a, b, c, d); } catch (e) { console.error('[Renderer]', fn, e); } } };
  const ctx = { state: null, srvNow: 0, dtSec: 0, t: 0, camera: null }; // reused every frame (no per-frame allocation)
  const HUD_MS = 100; // HUD DOM updates at <= 10 Hz

  return {
    ready, scene, modules: mods,
    get camera() { return camBox.camera; },
    get info() { return gl.info; },
    get gl() { return gl; },
    get quality() { return quality; },
    frame(dtMs) {
      if (disposed) return;
      const t0 = performance.now();
      const dt = Math.min(opts.fixedDt ? 100 : 50, Math.max(0, dtMs || 0)), dtS = dt / 1000;
      clock.t += dt;
      const state = source.state();
      call(mods.input, 'update', dtS);
      camBox.update(dtS, (mods.fx && mods.fx.shakeAmt) || 0);
      ctx.state = state; ctx.srvNow = source.srvNow(); ctx.dtSec = dtS; ctx.t = clock.t / 1000; ctx.camera = camBox.camera;
      call(mods.world, 'update', ctx);
      const pred = source.kind === 'online' && mods.input ? mods.input.pred : null; // local champion drawn at the predicted position online
      call(mods.units, 'sync', state, dtS, ctx.t, pred);
      call(mods.fx, 'update', dtS);
      hudAcc += dt;
      if (hudAcc >= HUD_MS && mods.hud) {
        hudAcc = 0;
        const me = (state && state.champions && state.champions.get && state.champions.get(source.localId)) || null;
        call(mods.hud, 'update', { st: state, me, mePos: (mods.input && mods.input.pred) || null, view: cameraView(), selectedId: mods.input ? mods.input.selectedId : null,
          canShop: canShop(me), phase: state && state.phase, hidden: null, held: null, srvNow: ctx.srvNow, now: Date.now(), myId: source.localId, mode });
      }
      gl.render(scene, camBox.camera);
      quality.update(dtS, Math.max(dtMs || 0, performance.now() - t0)); // raw frame interval, like the spike's avgMs
    },
    pick, project,
    setQuality(level) { quality.set(level); },
    setDoor(id, state) { call(mods.world, 'setDoor', id, state); },
    dispose() {
      if (disposed) return; disposed = true;
      removeEventListener('resize', onResize);
      offs.forEach((o) => { try { o(); } catch (_) { /* ignore */ } });
      for (const k of ['input', 'hud', 'fx', 'units', 'world']) call(mods[k], 'dispose');
      if (camBox) camBox.dispose();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose()); });
      gl.dispose();
    },
  };
}

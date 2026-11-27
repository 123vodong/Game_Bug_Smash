// Camera (breakdown 3.3, task C5): perspective FOV 32, pitch 55 deg, follow + Y-lock, hold Space/Z = look at you,
// screen-edge pan (free camera, mouse only), wheel zoom 9..30, shake. Ported from TeamModeScene _updateLocal/_edgePan.
//
// createCamera({THREE, canvas, source, mode}) -> { camera, update(dtSec, shake), resize(w,h), dispose,
//                                                   locked, setLock(b), toggleLock(), panTo(x,y), endPeek(), zoom }
// Scene units: sim px * 0.01, sim y -> scene z (same as Renderer). The follow target comes from camera.userData.pred
// (set by Input.js each frame, sim px: the predicted own position) and falls back to the server position of
// source.localId. The api is also reachable as camera.userData.cam (Input.js uses it for Y / minimap peek).
// `shake`: amplitude in scene units (0 = none); a few hundredths..0.5 is sensible (clamped to 0.8).
const S = 0.01;
const WORLD_MAX = 60;           // 6000 sim px * S. MIRRORS server WORLD_W/H.
const FOV = 32, PITCH = 55 * Math.PI / 180;
const ZOOM_MIN = 9, ZOOM_MAX = 30, ZOOM_DEFAULT = 18; // camera distance to the look-at point, scene units
const EDGE_PX = 20, EDGE_SPEED = 1500; // mirrors TeamModeScene EDGE_PAN_PX / EDGE_PAN_SPEED (screen px/s)
const FOLLOW_Y_PX = 40;         // Phaser follows slightly below the champion (HUD covers the bottom)
const LOCK_KEY = 'bs.3d.camLock';
const approach = (dt, k) => 1 - Math.exp(-dt * k);

export function createCamera({ THREE, canvas, source, mode = 'team' }) {
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 220);
  camera.userData = camera.userData || {};
  const target = new THREE.Vector3(30, 0, 30);    // current smoothed look-at (ground)
  const free = new THREE.Vector3(30, 0, 30);      // free-camera desired look-at
  let locked = true, peek = false, centerHeld = false, zoom = ZOOM_DEFAULT, zoomGoal = ZOOM_DEFAULT, inited = false;
  let w = 1280, h = 720, px = -1, py = -1, pin = false, ptype = 'mouse', midDrag = null, disposed = false, shakeT = 0;
  try { locked = window.localStorage.getItem(LOCK_KEY) !== '0'; } catch (_) { /* session only */ }

  const clampW = (v) => Math.max(0, Math.min(WORLD_MAX, v));
  const followPoint = (out) => {
    const p = camera.userData.pred;
    let x, y;
    if (p) { x = p.x; y = p.y; } else {
      const st = source.state(), me = st && st.champions && st.champions.get && st.champions.get(source.localId);
      if (!me) return false; x = me.x; y = me.y;
    }
    out.set(x * S, 0, (y + FOLLOW_Y_PX) * S); return true;
  };
  const unitsPerPx = () => (2 * zoom * Math.tan(FOV * Math.PI / 360)) / Math.max(1, h); // ground units per screen px (horizontal)

  const api = {
    get locked() { return locked; },
    get zoom() { return zoomGoal; },
    setLock(b) {
      locked = !!b; peek = false;
      if (!locked) free.copy(target);
      try { window.localStorage.setItem(LOCK_KEY, locked ? '1' : '0'); } catch (_) { /* session only */ }
    },
    toggleLock() { api.setLock(!locked); },
    /** minimap drag: look at sim point (x,y) without changing the lock preference */
    panTo(x, y) { peek = true; free.set(clampW(x * S), 0, clampW(y * S)); },
    endPeek() { peek = false; if (!locked) free.copy(target); },
  };
  camera.userData.cam = api;

  const rel = (ev) => { const r = canvas.getBoundingClientRect(); px = ev.clientX - r.left; py = ev.clientY - r.top; pin = px >= 0 && py >= 0 && px <= r.width && py <= r.height; ptype = ev.pointerType || 'mouse'; };
  const onMove = (ev) => {
    rel(ev);
    if (midDrag) {
      if (!(ev.buttons & 4)) { midDrag = null; return; }
      const u = unitsPerPx();
      free.x = clampW(midDrag.fx - (px - midDrag.px) * u);
      free.z = clampW(midDrag.fz - (py - midDrag.py) * u / Math.sin(PITCH));
      peek = true;
    }
  };
  const onDown = (ev) => {
    rel(ev);
    if (ev.button === 1 && ptype === 'mouse') { // middle-drag pans (and frees) the camera
      ev.preventDefault();
      if (locked) api.setLock(false);
      midDrag = { px, py, fx: target.x, fz: target.z }; free.copy(target);
    }
  };
  const onUp = (ev) => { if (ev.button === 1) midDrag = null; };
  const onLeave = () => { pin = false; };
  const onWheel = (ev) => {
    ev.preventDefault();
    zoomGoal = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomGoal * Math.exp(ev.deltaY * 0.0012)));
  };
  const typing = (ev) => { const t = ev.target; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
  const onKeyDown = (ev) => { if (!typing(ev) && (ev.code === 'Space' || ev.code === 'KeyZ')) centerHeld = true; };
  const onKeyUp = (ev) => {
    if ((ev.code === 'Space' || ev.code === 'KeyZ') && centerHeld) { centerHeld = false; free.copy(target); } // a free camera stays on your champion
  };
  const onBlur = () => { centerHeld = false; midDrag = null; };

  canvas.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', onBlur);

  const want = new THREE.Vector3();
  function update(dt, shake = 0) {
    if (disposed) return;
    dt = Math.min(0.1, Math.max(0, dt || 0));
    zoom += (zoomGoal - zoom) * approach(dt, 12);
    const have = followPoint(want);
    if (have) {
      if (!inited) { inited = true; target.copy(want); free.copy(want); }
      const follow = centerHeld || (locked && !peek);
      if (follow) {
        target.lerp(want, approach(dt, centerHeld ? 14 : 7)); free.copy(target);
      } else {
        // edge pan: free camera, mouse only, not while peeking via the minimap
        if (!peek && !midDrag && pin && ptype === 'mouse' && !(px === 0 && py === 0)) {
          const vx = px < EDGE_PX ? -1 : (px > w - EDGE_PX ? 1 : 0), vy = py < EDGE_PX ? -1 : (py > h - EDGE_PX ? 1 : 0);
          if (vx || vy) {
            const step = EDGE_SPEED * dt * unitsPerPx();
            free.x = clampW(free.x + vx * step); free.z = clampW(free.z + vy * step / Math.sin(PITCH));
          }
        }
        target.lerp(free, approach(dt, 16));
      }
    }
    const d = zoom;
    let ox = 0, oy = 0, oz = 0;
    if (shake > 0.0005) {
      shakeT += dt * 60; const a = Math.min(0.8, shake);
      ox = (Math.sin(shakeT * 2.3) + (Math.random() - 0.5)) * a * 0.5;
      oy = (Math.cos(shakeT * 3.1) + (Math.random() - 0.5)) * a * 0.5;
      oz = (Math.sin(shakeT * 1.7) + (Math.random() - 0.5)) * a * 0.3;
    }
    camera.position.set(target.x + ox, target.y + Math.sin(PITCH) * d + oy, target.z + Math.cos(PITCH) * d + oz);
    camera.lookAt(target.x + ox, target.y, target.z + oz);
    camera.updateMatrixWorld();
  }
  function resize(nw, nh) {
    w = Math.max(1, nw); h = Math.max(1, nh);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function dispose() {
    if (disposed) return; disposed = true;
    canvas.removeEventListener('pointerdown', onDown);
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('wheel', onWheel);
    removeEventListener('keydown', onKeyDown);
    removeEventListener('keyup', onKeyUp);
    removeEventListener('blur', onBlur);
  }

  resize(w, h);
  update(0, 0);
  return { camera, update, resize, dispose, get locked() { return locked; }, setLock: api.setLock, toggleLock: api.toggleLock, panTo: api.panTo, endPeek: api.endPeek, get zoom() { return zoomGoal; } };
}

export default createCamera;

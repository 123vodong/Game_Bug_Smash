// Flipbook pool: 8-column sprite sheets from assets/moba/fb/*.webp (rows = height/128, frames = rows*8).
// Ground decals (flat) or camera-facing sprites. Objects are pooled per sheet key; hard cap on live flips.
const BASE = new URL('../../../assets/moba/fb/', import.meta.url).href;
const RING_BY_HUE = [['Blue', 0x39c2ff], ['Gold', 0xffd23f], ['Green', 0x7ed957], ['Orange', 0xff9800], ['Purple', 0xb084ff], ['White', 0xffffff]];
const BURST_HAS = new Set(['Blood', 'Blue', 'Fire', 'Green', 'Orange', 'White']);

export function createFlipbooks(THREE, scene, { cap = 70, S = 0.01 } = {}) {
  const root = new THREE.Group(); root.name = 'fx-flipbooks'; scene.add(root);
  const loader = new THREE.TextureLoader();
  const sheets = new Map(), free = new Map(), live = [];
  const planeGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const tc = new THREE.Color();

  function nearest(color) {
    tc.set(color ?? 0xffffff); let best = 'White', bd = 9;
    for (const [n, h] of RING_BY_HUE) { const o = new THREE.Color(h), d = Math.hypot(tc.r - o.r, tc.g - o.g, tc.b - o.b); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  const ringKey = (c) => 'ring' + nearest(c);
  const burstKey = (c) => { const k = nearest(c); return 'burst' + (BURST_HAS.has(k) ? k : k === 'Gold' ? 'Orange' : k === 'Purple' ? 'Blue' : 'White'); };

  function sheet(key) {
    let s = sheets.get(key);
    if (!s) {
      s = { key, tex: null, rows: 4, frames: 32, ready: false };
      s.tex = loader.load(BASE + key + '.webp', (t) => { s.rows = Math.max(1, Math.round(t.image.height / 128)); s.frames = s.rows * 8; s.ready = true; });
      s.tex.colorSpace = THREE.SRGBColorSpace; sheets.set(key, s);
    }
    return s;
  }
  function acquire(sh, flat, add) {
    const k = sh.key + (flat ? ':f' : ':s') + (add ? 'a' : 'n'); const fl = free.get(k);
    if (fl && fl.length) return fl.pop();
    const tex = sh.tex.clone(); tex.needsUpdate = true;
    const opt = { map: tex, transparent: true, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, toneMapped: false };
    let obj;
    if (flat) { obj = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial(opt)); obj.renderOrder = 3; }
    else { obj = new THREE.Sprite(new THREE.SpriteMaterial(opt)); obj.renderOrder = 11; }
    return { k, tex, obj, mat: obj.material };
  }
  function release(it) {
    root.remove(it.h.obj); let fl = free.get(it.h.k); if (!fl) free.set(it.h.k, fl = []);
    if (fl.length < 6) fl.push(it.h); else { it.h.mat.dispose(); it.h.tex.dispose(); }
  }

  /** opts: x,y (scene units: x, z), z height, size, color, dur, flat, loops, alpha, follow()->{x,y} sim px, delay, rot. Returns false if capped. */
  function flip(key, { x, y, z = 0.05, size = 1, color = 0xffffff, dur = 0.6, flat = false, loops = 1, alpha = 1, follow = null, delay = 0, rot = 0, add = true }) {
    if (live.length >= cap) return null;
    const sh = sheet(key), h = acquire(sh, flat, add), obj = h.obj;
    h.mat.color.set(color); h.mat.opacity = alpha;
    if (flat) { obj.scale.setScalar(size / 2); obj.rotation.y = rot; } else obj.scale.setScalar(size);
    obj.position.set(x, z, y); obj.visible = false; root.add(obj);
    const it = { t: -delay, dur, sh, h, loops, follow, z, kill: false, a: alpha, fade: dur * loops > 1.2 }; live.push(it);
    return it;
  }
  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const it = live[i]; it.t += dt; let dead = false;
      if (it.t >= 0 && it.sh.ready) {
        if (it.kill || it.t >= it.dur * it.loops) dead = true;
        else {
          const sh = it.sh, k = (it.t / it.dur) % 1, f = Math.min(sh.frames - 1, Math.floor(k * sh.frames));
          it.h.obj.visible = true; if (it.fade) it.h.mat.opacity = it.a * Math.min(1, (it.dur * it.loops - it.t) / 0.25, it.t / 0.15 + 0.2); it.h.tex.repeat.set(1 / 8, 1 / sh.rows); it.h.tex.offset.set((f % 8) / 8, 1 - (Math.floor(f / 8) + 1) / sh.rows);
          if (it.follow) { const p = it.follow(); if (p) it.h.obj.position.set(p.x * S, it.z, p.y * S); }
        }
      } else if (it.t >= 0 && !it.kill) { it.w = (it.w || 0) + dt; it.t -= dt; if (it.w > 2.5) dead = true; } // sheet still loading: hold the animation so the first cast shows when it arrives
      else if (it.kill || it.t > 8 + it.dur) dead = true;
      if (dead) { release(it); live[i] = live[live.length - 1]; live.pop(); }
    }
  }
  return {
    flip, update, preload: (keys) => keys.forEach(sheet), isReady: (k) => !!(sheets.get(k) && sheets.get(k).ready), ringKey, burstKey, get count() { return live.length; },
    dispose() { for (const it of live) release(it); live.length = 0; for (const l of free.values()) for (const h of l) { h.mat.dispose(); h.tex.dispose(); } free.clear(); for (const s of sheets.values()) s.tex.dispose(); sheets.clear(); planeGeo.dispose(); scene.remove(root); },
  };
}

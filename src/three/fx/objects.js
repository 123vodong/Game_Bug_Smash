// Kit objects + signature cast impact (3D parity with the 2D MobaFx LIVE objects / V6 fx).
// Renders every persistent kit object with a real 3D presence at the TRUE sim size/position:
//   laser wall / barrier (vertical curtain + posts + ground beam), portal pair, beacon, pins (cone + true-radius border),
//   turret (themed mesh + barrel aims at 'shot' + heat tint + range pulse), barricade, ward/CCTV ring+LED, pet ring,
//   Zero shadow clone (dark silhouette + violet edge glow, tether to owner, flashes when owner acts), tether/link beams,
//   timebox/echo/charge/package rings, stance aura (rotating hex + name glyph), marks (floating stack glyph), shield bubble.
// Plus `cast()`: signature impact for every skill (feet ring + 1-frame flash + icon glyph + shake scaled to power, ult = big + screen edge flash).
// Pools only: shapes.js handles (1 instanced draw), small pooled meshes, pooled sprites. No per-frame allocation except Map lookups.
// Scale: sim px * 0.01, sim y -> scene z.
import { resolveSkill, parseKitTags } from '../../../shared/moba/champions.js';

const fin = Number.isFinite;
const WALL_H = 1.0;
const STANCE_COLORS = {
  'dev.main': 0x5c7cfa, 'dev.hotfix': 0xff4f8b, 'dev.feature': 0x39ff9a,
  'cleaner.mop': 0x39c2ff, 'cleaner.bucket': 0xffd23f,
};
const MIX_COLORS = { S: 0x8d5524, M: 0xf5e6d3, G: 0xffb347 };
const hasBuff = (buffs, tok) => {
  if (!buffs) return false;
  const s = String(buffs);
  return s === tok || s.startsWith(tok + ',') || s.endsWith(',' + tok) || s.includes(',' + tok + ',');
};

export function createObjects({ THREE, scene, source, sh, SH, tg, S, ent, CHAMPIONS, addShake, flair }) {
  const root = new THREE.Group(); root.name = 'fx-objects'; scene.add(root);
  const tc = new THREE.Color();
  let disposed = false, time = 0, gen = 0;

  // ---------- shared geometry / textures ----------
  const planeUp = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const postGeo = new THREE.CylinderGeometry(0.06, 0.1, 1, 6).translate(0, 0.5, 0);
  const coneGeo = new THREE.ConeGeometry(0.17, 0.55, 6).rotateX(Math.PI).translate(0, 0.28, 0);
  const capGeo = new THREE.CapsuleGeometry(0.26, 0.55, 3, 8), headGeo = new THREE.SphereGeometry(0.22, 10, 8), bubbleGeo = new THREE.SphereGeometry(0.85, 14, 10);
  const baseGeo = new THREE.CylinderGeometry(0.32, 0.4, 0.14, 8), bodyGeo = new THREE.CylinderGeometry(0.2, 0.27, 0.34, 8), barrelGeo = new THREE.BoxGeometry(0.5, 0.1, 0.1).translate(0.25, 0, 0);
  const crateGeo = new THREE.CylinderGeometry(0.54, 0.62, 0.64, 8), cubeGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3), orbGeo = new THREE.SphereGeometry(0.11, 8, 6);
  const geos = [planeUp, postGeo, coneGeo, capGeo, headGeo, bubbleGeo, baseGeo, bodyGeo, barrelGeo, crateGeo, cubeGeo, orbGeo];
  const texs = [];
  const mkTex = (w, h, draw) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; texs.push(t); return t; };
  const curtainTex = mkTex(8, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.07, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.12, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0.12)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const pillarTex = mkTex(8, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.85)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const hazardTex = mkTex(64, 32, (g, w, h) => { g.fillStyle = '#f2c230'; g.fillRect(0, 0, w, h); g.fillStyle = '#20232b'; for (let x = -h; x < w + h; x += 16) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 8, h); g.lineTo(x + 8 + h, 0); g.lineTo(x + h, 0); g.fill(); } });

  const addMat = (color, opacity, map) => new THREE.MeshBasicMaterial({ color, map: map || null, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const pool = (make) => { const free = []; return { get: () => free.pop() || make(), put: (o) => { o.visible = false; free.push(o); }, free }; };
  const curtains = pool(() => { const m = new THREE.Mesh(planeUp, addMat(0xffffff, 0.8, curtainTex)); m.renderOrder = 6; m.frustumCulled = false; root.add(m); return m; });
  const pillars = pool(() => { const m = new THREE.Mesh(planeUp, addMat(0xffffff, 0.8, pillarTex)); m.renderOrder = 6; m.frustumCulled = false; root.add(m); return m; });
  const posts = pool(() => { const m = new THREE.Mesh(postGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); m.renderOrder = 7; root.add(m); return m; });
  const cones = pool(() => { const m = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); m.renderOrder = 7; root.add(m); return m; });
  const cubes = pool(() => { const m = new THREE.Mesh(cubeGeo, new THREE.MeshBasicMaterial({ color: 0xc8a165, toneMapped: false })); m.renderOrder = 8; root.add(m); return m; });
  const orbs = pool(() => { const m = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: 0x6cffd6, toneMapped: false })); m.renderOrder = 9; root.add(m); return m; });
  const bubbles = pool(() => { const m = new THREE.Mesh(bubbleGeo, addMat(0x6cffd6, 0.22)); m.renderOrder = 8; m.frustumCulled = false; root.add(m); return m; });
  const turretPool = pool(() => {
    const g = new THREE.Group(), base = new THREE.Mesh(baseGeo, new THREE.MeshBasicMaterial({ color: 0x2b3140, toneMapped: false })), body = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    const barrel = new THREE.Group(), bm = new THREE.Mesh(barrelGeo, new THREE.MeshBasicMaterial({ color: 0xdfe6ee, toneMapped: false })); barrel.add(bm);
    base.position.y = 0.07; body.position.y = 0.31; barrel.position.y = 0.42; g.add(base, body, barrel); g.userData = { body, barrel }; root.add(g); return g;
  });
  const crates = pool(() => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(crateGeo, new THREE.MeshBasicMaterial({ map: hazardTex, toneMapped: false })); m.position.y = 0.32;
    const cap = new THREE.Mesh(baseGeo, new THREE.MeshBasicMaterial({ color: 0x2b3140, toneMapped: false })); cap.position.y = 0.66; cap.scale.set(1.3, 0.5, 1.3);
    g.add(m, cap); root.add(g); return g;
  });
  const shadows = pool(() => {
    const g = new THREE.Group(), dark = new THREE.MeshBasicMaterial({ color: 0x120a22, transparent: true, opacity: 0.62, depthWrite: false, toneMapped: false }), glow = addMat(0xb084ff, 0.55); glow.side = THREE.BackSide;
    for (const [geo, y, s] of [[capGeo, 0.55, 1], [headGeo, 1.2, 1]]) { const a = new THREE.Mesh(geo, dark), b = new THREE.Mesh(geo, glow); a.position.y = b.position.y = y; b.scale.setScalar(1.22 * s); a.renderOrder = 7; b.renderOrder = 8; g.add(a, b); }
    g.userData = { glow }; root.add(g); return g;
  });
  const sprites = pool(() => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, toneMapped: false })); s.renderOrder = 61; root.add(s); return s; });
  const glyphTex = new Map();
  function glyph(text, color, w = 192, h = 64, font = 'bold 40px "Segoe UI", Arial') {
    const k = text + '|' + color; let t = glyphTex.get(k);
    if (!t) {
      if (glyphTex.size > 90) { for (const o of glyphTex.values()) o.dispose(); glyphTex.clear(); }
      t = mkTex(w, h, (g) => { g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(text, w / 2, h / 2 + 2); g.fillStyle = '#' + tc.set(color).getHexString(); g.fillText(text, w / 2, h / 2 + 2); });
      texs.pop(); glyphTex.set(k, t); // owned by glyphTex (disposed there)
    }
    return t;
  }
  function sprite(text, color, sw, sh2, w, h, font) { const s = sprites.get(); s.material.map = glyph(text, color, w, h, font); s.material.opacity = 1; s.material.needsUpdate = true; s.scale.set(sw, sh2, 1); s.visible = true; return s; }

  // ---------- helpers ----------
  const myTeam = () => { const me = ent(source.localId); return me ? me.team : 'blue'; };
  const colOf = (id, team, fallback) => { const o = id != null ? ent(id) : null; const d = o && o.champ && CHAMPIONS[o.champ]; return d && fin(d.color) ? d.color : fallback !== undefined ? fallback : team === myTeam() ? 0x5fe36a : 0xff4f5f; };
  const tint = (mesh, color) => mesh.material.color.set(color);
  const shapeP = (type, x, y, sx, color, o = {}) => sh.add({ type, x: x * S, y: y * S, z: o.z === undefined ? 0.08 : o.z, rot: o.rot || 0, sx, sz: o.sz, color, alpha: o.alpha === undefined ? 1 : o.alpha, dur: o.dur === undefined ? 0 : o.dur, prio: 1 });
  const kill = (h) => { if (h) sh.kill(h); };

  // ---------- fx-message objects (wall / barrier / portal / beacon / pin / zone glyph) ----------
  const objs = new Map(); // oid -> rec
  const MAX_OBJ = 14;
  function curtainFor(rec, A, B, h, thick, color, op) {
    const dx = B.x - A.x, dz = B.y - A.y, L = Math.hypot(dx, dz) * S;
    const c = curtains.get(); c.visible = true; c.position.set(((A.x + B.x) / 2) * S, 0, ((A.y + B.y) / 2) * S); c.rotation.y = -Math.atan2(dz, dx); c.scale.set(L, h, 1); c.material.color.set(color); c.material.opacity = op; rec.meshes.push(c); rec.pools.push(curtains); return c;
  }
  function linkPortalPair(rec) {
    if (rec.kind !== 'portal') return;
    let mate = null;
    for (const o of objs.values()) {
      if (o.oid === rec.oid || o.kind !== 'portal') continue;
      if ((rec.pair && o.pair === rec.pair) || (!rec.pair && rec.sid && o.sid === rec.sid)) { mate = o; break; }
    }
    if (!mate) return;
    if (mate.pairHs) { for (const h of mate.pairHs) kill(h); mate.pairHs = null; }
    const dx = (mate.x - rec.x) * S, dz = (mate.y - rec.y) * S, L = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
    if (L < 0.2) return;
    const mx = (rec.x + mate.x) * 0.5, my = (rec.y + mate.y) * 0.5;
    const h1 = shapeP(SH.STREAK, mx, my, L / 2, rec.col, { rot: a, sz: 0.12, z: 0.14, alpha: 0.34 });
    const h2 = shapeP(SH.STREAK, mx, my, L / 2, rec.col, { rot: a + Math.PI, sz: 0.12, z: 0.14, alpha: 0.34 });
    rec.pairHs = [h1, h2];
    rec.mateOid = mate.oid; mate.mateOid = rec.oid;
  }
  function addObj(m) {
    if (!fin(m.x, m.y) || !m.oid) return false;
    const old = objs.get(m.oid); if (old) { old.left = Math.max(old.left, (m.ms || 3000) / 1000); return true; }
    if (objs.size >= MAX_OBJ) return false;
    const owner = m.sid ? ent(m.sid) : null;
    const team = m.team || (owner && owner.team) || 'blue';
    const col = fin(m.color) ? m.color : colOf(m.sid, team), life = Math.max(1, (m.ms || 6000) / 1000), kind = m.kind || 'pin';
    const rec = { oid: m.oid, kind, x: m.x, y: m.y, x2: m.x2, y2: m.y2, r: m.r || 70, thick: m.thick || 46, left: life, life, col, hs: [], meshes: [], pools: [], tid: null, curtain: null, pair: m.pair, sid: m.sid, team, slot: m.slot || '', hiddenAfterMs: m.hiddenAfterMs || 0, hid: false, born: time, pairHs: null, mateOid: null };
    const wx = m.x * S, wz = m.y * S;
    sh.add({ type: SH.FLASH, x: wx, y: wz, z: 0.5, sx: 1.6, dur: 0.14, color: 0xffffff, prio: 1 }); sh.add({ type: SH.RING, x: wx, y: wz, sx: Math.max(1.8, rec.r * S * 2), dur: 0.5, color: col, prio: 1 });
    addShake(0.04);
    if (kind === 'wall' || kind === 'barrier') {
      if (!fin(m.x2, m.y2)) return false;
      const a = Math.atan2(m.y2 - m.y, m.x2 - m.x), L = Math.hypot(m.x2 - m.x, m.y2 - m.y) * S, mx = ((m.x + m.x2) / 2) * S, mz = ((m.y + m.y2) / 2) * S, w = Math.max(0.2, rec.thick * S * 0.5);
      const barrier = kind === 'barrier';
      rec.curtain = curtainFor(rec, { x: m.x, y: m.y }, { x: m.x2, y: m.y2 }, barrier ? 1.25 : WALL_H, rec.thick, col, barrier ? 0.9 : 0.75);
      rec.hs.push(shapeP(SH.STREAK, mx / S, mz / S, L / 2, col, { rot: a, sz: w, z: 0.1 }), shapeP(SH.STREAK, mx / S, mz / S, L / 2, 0xffffff, { rot: a + Math.PI, sz: w * 0.35, z: 0.11, alpha: 0.9 }));
      for (const [px, py] of [[m.x, m.y], [m.x2, m.y2]]) {
        const p = posts.get(); p.visible = true; p.position.set(px * S, 0, py * S); p.scale.set(1, barrier ? 1.4 : 1.2, 1); p.material.color.set(col); rec.meshes.push(p); rec.pools.push(posts);
        rec.hs.push(shapeP(SH.HEX, px, py, 0.45, 0xffffff, { z: 0.12 }));
      }
    } else if (kind === 'portal') {
      const pCol = m.access === 'open' ? 0x55efc4 : m.access === 'allies' ? 0x39c2ff : col;
      rec.col = pCol;
      const R = Math.max(0.9, rec.r * S * 1.25);
      rec.hs.push(shapeP(SH.RING, m.x, m.y, R, pCol), shapeP(SH.HEX, m.x, m.y, R * 0.7, 0xffffff, { alpha: 0.7 }));
      const p = pillars.get(); p.visible = true; p.position.set(wx, 0, wz); p.scale.set(R * 1.3, 1.7, 1); p.material.color.set(pCol); rec.meshes.push(p); rec.pools.push(pillars); rec.pillar = p;
      const p2 = pillars.get(); p2.visible = true; p2.position.set(wx, 0, wz); p2.rotation.y = Math.PI / 2; p2.scale.set(R * 1.3, 1.7, 1); p2.material.color.set(pCol); rec.meshes.push(p2); rec.pools.push(pillars); rec.pillar2 = p2;
    } else if (kind === 'beacon') {
      const R = Math.max(1.0, rec.r * S);
      rec.hs.push(shapeP(SH.RING, m.x, m.y, R, col, { alpha: 0.8 }), shapeP(SH.HEX, m.x, m.y, 0.8, 0xffffff, { alpha: 0.8 }));
      const p = pillars.get(); p.visible = true; p.position.set(wx, 0, wz); p.rotation.y = 0.7; p.scale.set(1.0, 2.2, 1); p.material.color.set(col); rec.meshes.push(p); rec.pools.push(pillars);
    } else { // pin (Lint Q/W/E) and anything else: distinct shape + color + stealth support
      const pinCol = rec.slot === 'q' ? 0xff7675 : rec.slot === 'w' ? 0xd63031 : rec.slot === 'e' ? 0x55efc4 : col;
      rec.col = pinCol;
      rec.tid = 'o:' + m.oid; tg.tele({ x: m.x, y: m.y, mode: 1, a: rec.r * S, ext: rec.r * S * 1.1, color: pinCol, life, tid: rec.tid });
      const c = cones.get(); c.visible = true; c.position.set(wx, 0.5, wz); c.material.color.set(pinCol);
      if (rec.slot === 'w') { c.scale.set(1.25, 0.9, 1.25); c.rotation.z = 0; }
      else if (rec.slot === 'e') { c.scale.set(1.05, 1.1, 1.05); c.rotation.z = Math.PI; }
      else { c.scale.set(1, 1, 1); c.rotation.z = 0; }
      rec.meshes.push(c); rec.pools.push(cones); rec.cone = c;
      rec.hs.push(shapeP(rec.slot === 'e' ? SH.PLUS : rec.slot === 'w' ? SH.RING : SH.HEX, m.x, m.y, rec.slot === 'w' ? 0.8 : 0.6, pinCol, { alpha: 0.7 }));
    }
    objs.set(m.oid, rec);
    if (kind === 'portal') linkPortalPair(rec);
    return true;
  }
  function updObj(m) {
    const rec = m && m.oid ? objs.get(m.oid) : null;
    if (!rec) return false;
    const pCol = m.access === 'open' ? 0x55efc4 : m.access === 'allies' ? 0x39c2ff : (fin(m.color) ? m.color : rec.col);
    rec.col = pCol;
    if (rec.pillar) rec.pillar.material.color.set(pCol);
    if (rec.pillar2) rec.pillar2.material.color.set(pCol);
    tc.set(pCol);
    if (rec.hs[0]) { rec.hs[0].r = tc.r; rec.hs[0].g = tc.g; rec.hs[0].b = tc.b; }
    if (rec.pairHs) for (const h of rec.pairHs) if (h) { h.r = tc.r; h.g = tc.g; h.b = tc.b; }
    sh.add({ type: SH.RING, x: rec.x * S, y: rec.y * S, sx: Math.max(1.2, rec.r * S * 1.4), dur: 0.35, color: pCol, prio: 1 });
    return true;
  }
  function dropObj(rec, boom) {
    if (boom) { sh.add({ type: SH.FLASH, x: rec.x * S, y: rec.y * S, z: 0.6, sx: 1.8, dur: 0.3, color: 0xffffff, prio: 1 }); sh.add({ type: SH.RING, x: rec.x * S, y: rec.y * S, sx: Math.max(1.8, rec.r * S * 1.6), dur: 0.4, color: rec.col, prio: 1 }); addShake(0.08); }
    for (const h of rec.hs) kill(h);
    if (rec.pairHs) { for (const h of rec.pairHs) kill(h); rec.pairHs = null; }
    if (rec.mateOid) { const mate = objs.get(rec.mateOid); if (mate && mate.pairHs) { for (const h of mate.pairHs) kill(h); mate.pairHs = null; } }
    for (let i = 0; i < rec.meshes.length; i++) rec.pools[i].put(rec.meshes[i]);
    if (rec.tid) tg.end(rec.tid); objs.delete(rec.oid);
  }
  function stepObjs(dt) {
    const mine = myTeam();
    for (const rec of objs.values()) {
      rec.left -= dt; if (rec.left <= 0) { dropObj(rec, false); continue; }
      const ageMs = (time - rec.born) * 1000;
      const enemyStealthed = rec.hiddenAfterMs > 0 && ageMs >= rec.hiddenAfterMs && rec.team !== mine;
      if (enemyStealthed) {
        if (!rec.hid) {
          rec.hid = true;
          if (rec.tid) { tg.end(rec.tid); rec.tid = null; }
          if (rec.cone) rec.cone.visible = false;
          for (const h of rec.hs) if (h) h.a = 0;
        }
        continue;
      }
      const allyStealthed = rec.hiddenAfterMs > 0 && ageMs >= rec.hiddenAfterMs && rec.team === mine;
      const k = (rec.left < 0.5 ? rec.left / 0.5 : 1) * (allyStealthed ? 0.55 : 1), pulse = 0.75 + 0.25 * Math.sin(time * 9 + rec.born * 3);
      if (rec.curtain) rec.curtain.material.opacity = (rec.kind === 'barrier' ? 0.9 : 0.75) * pulse * k;
      for (const h of rec.hs) if (h) h.a = k;
      if (rec.pillar) rec.pillar.material.opacity = 0.8 * pulse * k;
      if (rec.pillar2) rec.pillar2.material.opacity = 0.8 * pulse * k;
      if (rec.pairHs) for (const h of rec.pairHs) if (h) h.a = 0.28 * pulse * k;
      if (rec.cone) { rec.cone.position.y = 0.5 + Math.sin(time * 3 + rec.born) * 0.06; rec.cone.rotation.y = time * 1.5; }
      for (let i = 0; i < rec.hs.length; i++) { const h = rec.hs[i]; if (h && h.type === SH.HEX && rec.kind !== 'wall') h.rot = time * (i ? -0.8 : 0.8); }
    }
  }

  // ---------- timed live records (tether / link / timebox / echo / charge / suppress / reload / zone glyph) ----------
  const live = new Map(); // key -> rec
  function addLive(key, kind, m, color) {
    const old = live.get(key); if (old) dropLive(old); if (live.size >= 24) return;
    const dur = Math.max(0.3, (m.ms || 3000) / 1000);
    const rec = { key, kind, a: (kind === 'suppress' ? m.tid : null) || m.sid || m.a || null, b: m.to || m.b || null, left: dur, dur, col: color, h1: null, h2: null, h3: null, mesh: null, ph: Math.random() * 6, x: m.x, y: m.y };
    if (kind === 'tether' || kind === 'link') {
      rec.h1 = shapeP(SH.STREAK, 0, 0, 1, color, { sz: 0.16, z: 0.9, alpha: 0.9 });
      rec.h2 = shapeP(SH.STREAK, 0, 0, 1, color, { sz: 0.16, z: 0.91, alpha: 0.9 });
    } else if (kind === 'suppress') {
      rec.h1 = shapeP(SH.RING, 0, 0, 1.15, color, { z: 0.14, alpha: 0.95 });
      rec.h2 = shapeP(SH.STREAK, 0, 0, 0.95, color, { rot: 0.785, sz: 0.14, z: 0.95, alpha: 0.9 });
      rec.h3 = shapeP(SH.STREAK, 0, 0, 0.95, color, { rot: -0.785, sz: 0.14, z: 0.96, alpha: 0.9 });
    } else if (kind === 'reload') {
      rec.h1 = shapeP(SH.RING, 0, 0, 1.35, 0x74c0fc, { z: 0.12, alpha: 0.85 });
      rec.h2 = shapeP(SH.HEX, 0, 0, 0.85, 0xffd23f, { z: 0.13, alpha: 0.65 });
    } else if (kind === 'zone') {
      rec.h1 = shapeP(SH.HEX, m.x, m.y, 0.55, color, { alpha: 0.7 });
    } else if (kind === 'charge') {
      rec.h1 = shapeP(SH.RING, 0, 0, 0.6, color, { z: 0.12, alpha: 0.9 });
      rec.h2 = shapeP(SH.STREAK, 0, 0, 1.2, color, { sz: 0.12, z: 0.65, alpha: 0.8 });
    } else {
      rec.h1 = shapeP(kind === 'echo' ? SH.PLUS : SH.RING, 0, 0, 1.35, color, { alpha: 0.9 });
      rec.h2 = shapeP(SH.HEX, 0, 0, 1.0, color, { alpha: 0.55 });
    }
    live.set(key, rec);
  }
  function dropLive(rec) { kill(rec.h1); kill(rec.h2); kill(rec.h3); if (rec.mesh) cubes.put(rec.mesh); live.delete(rec.key); }
  const endLive = (key) => { const r = live.get(key); if (r) dropLive(r); };
  function stepLive(dt) {
    for (const rec of live.values()) {
      rec.left -= dt; if (rec.left <= 0 && rec.kind !== 'charge') { dropLive(rec); continue; }
      const A = rec.a ? ent(rec.a) : null;
      if (rec.kind === 'tether' || rec.kind === 'link') {
        const B = rec.b ? ent(rec.b) : null; if (!A || !B) { rec.h1 && (rec.h1.a = 0); rec.h2 && (rec.h2.a = 0); continue; }
        const dx = (B.x - A.x) * S, dz = (B.y - A.y) * S, L = Math.hypot(dx, dz), a = Math.atan2(dz, dx), mx = (A.x + B.x) * 0.5 * S, mz = (A.y + B.y) * 0.5 * S, p = 0.75 + 0.25 * Math.sin(time * 10 + rec.ph);
        sh.set(rec.h1, mx, mz, 0.9, a); rec.h1.sx = L / 2; rec.h1.a = 0.9 * p;
        sh.set(rec.h2, mx, mz, 0.91, a + Math.PI); rec.h2.sx = L / 2; rec.h2.a = 0.9 * p;
      } else if (rec.kind === 'zone') {
        if (rec.h1) rec.h1.rot = time * 0.7;
      } else if (rec.kind === 'suppress') {
        if (!A) continue;
        const wx = A.x * S, wz = A.y * S, p = 0.75 + 0.25 * Math.sin(time * 14);
        sh.set(rec.h1, wx, wz, 0.14, time * 1.4); rec.h1.a = p;
        sh.set(rec.h2, wx, wz, 0.95, 0.785 + Math.sin(time * 8) * 0.08); rec.h2.a = p;
        sh.set(rec.h3, wx, wz, 0.96, -0.785 - Math.sin(time * 8) * 0.08); rec.h3.a = p;
      } else if (rec.kind === 'reload') {
        if (!A) continue;
        const wx = A.x * S, wz = A.y * S, prog = Math.min(1, Math.max(0, 1 - rec.left / Math.max(0.05, rec.dur)));
        const inWin = prog >= 0.4 && prog <= 0.6;
        sh.set(rec.h1, wx, wz, 0.12, time * 2.5); rec.h1.sx = 1.45 - prog * 0.75; rec.h1.a = 0.9;
        tc.set(inWin ? 0xffd23f : 0x74c0fc); rec.h1.r = tc.r; rec.h1.g = tc.g; rec.h1.b = tc.b;
        sh.set(rec.h2, wx, wz, 0.13, -time * 2.0); rec.h2.sx = inWin ? 1.15 : 0.75; rec.h2.a = inWin ? 1.0 : 0.35;
      } else if (rec.kind === 'timebox') {
        if (!A) continue;
        const wx = A.x * S, wz = A.y * S, frac = Math.max(0.15, rec.left / Math.max(0.1, rec.dur));
        sh.set(rec.h1, wx, wz, 0.11, time * 1.5); rec.h1.sx = 0.65 + frac * 0.85; rec.h1.a = 0.9;
        sh.set(rec.h2, wx, wz, 0.12, -time * 2.2); rec.h2.sx = 1.05; rec.h2.a = 0.65;
      } else if (rec.kind === 'charge') {
        if (!A) continue;
        const wx = A.x * S, wz = A.y * S, elapsed = Math.min(1.5, rec.dur - rec.left), frac = Math.min(1, elapsed / 1.2);
        sh.set(rec.h1, wx, wz, 0.12, time * 3.0); rec.h1.sx = 0.6 + frac * 0.9; rec.h1.a = 0.65 + 0.35 * Math.sin(time * 16);
        const ang = fin(A.facing) ? A.facing : 0, len = 1.2 + frac * 2.6;
        sh.set(rec.h2, wx + Math.cos(ang) * len * 0.5, wz + Math.sin(ang) * len * 0.5, 0.65, ang); rec.h2.sx = len * 0.5; rec.h2.a = 0.5 + frac * 0.45;
      } else if (A) {
        sh.set(rec.h1, A.x * S, A.y * S, rec.kind === 'echo' ? 1.9 : 0.1, time * 0.5); rec.h1.a = 0.9;
        sh.set(rec.h2, A.x * S, A.y * S, 0.11, -time * 1.2); rec.h2.sx = 1.1 + 0.1 * Math.sin(time * 5);
      }
    }
  }

  // ---------- Zero shadow clone ----------
  const shadowsLive = new Map(); // sid -> {g, left, h, hl, flash}
  function addShadow(m) {
    if (!m.sid || !fin(m.x, m.y)) return;
    let s = shadowsLive.get(m.sid); if (s) endShadow(m.sid, true);
    if (shadowsLive.size >= 6) return;
    const g = shadows.get(); g.visible = true; g.position.set(m.x * S, 0, m.y * S); g.scale.setScalar(1);
    const col = fin(m.color) ? m.color : 0xb084ff; g.userData.glow.color.set(0xb084ff);
    s = { g, left: Math.max(1, (m.ms || 6000) / 1000), x: m.x, y: m.y, ring: shapeP(SH.RING, m.x, m.y, 1.0, 0xb084ff, { alpha: 0.9 }), hex: shapeP(SH.HEX, m.x, m.y, 0.7, 0x2b1a4a, { alpha: 0.9 }), tether: shapeP(SH.STREAK, 0, 0, 0.5, 0xb084ff, { sz: 0.07, z: 0.7, alpha: 0.6 }), flash: 0, col };
    shadowsLive.set(m.sid, s);
    sh.add({ type: SH.FLASH, x: m.x * S, y: m.y * S, z: 0.9, sx: 2.2, dur: 0.16, color: 0xffffff, prio: 1 }); sh.add({ type: SH.RING, x: m.x * S, y: m.y * S, sx: 2.2, dur: 0.5, color: 0xb084ff, prio: 1 });
  }
  function endShadow(sid, quiet) {
    const s = shadowsLive.get(sid); if (!s) return; shadowsLive.delete(sid);
    if (!quiet) sh.add({ type: SH.RING, x: s.x * S, y: s.y * S, sx: 1.8, dur: 0.45, color: 0xb084ff, prio: 1 });
    shadows.put(s.g); kill(s.ring); kill(s.hex); kill(s.tether);
  }
  function stepShadows(dt) {
    for (const [sid, s] of shadowsLive) {
      s.left -= dt; if (s.left <= 0) { endShadow(sid, false); continue; }
      const o = ent(sid); s.flash = Math.max(0, s.flash - dt * 4);
      const bob = Math.sin(time * 3 + s.x) * 0.04, k = s.left < 0.6 ? s.left / 0.6 : 1, sc = 1 + s.flash * 0.35;
      s.g.position.y = 0.05 + bob; s.g.scale.setScalar(sc); s.g.userData.glow.opacity = (0.45 + s.flash * 0.5 + 0.1 * Math.sin(time * 6)) * k; s.g.children[0].material.opacity = 0.62 * k;
      if (o && fin(o.x, o.y)) s.g.rotation.y = -Math.atan2(o.y - s.y, o.x - s.x) + 1.5708;
      s.hex.rot = time * 0.9; s.ring.a = k; s.hex.a = 0.8 * k;
      if (o && fin(o.x, o.y)) { const dx = (o.x - s.x) * S, dz = (o.y - s.y) * S, L = Math.hypot(dx, dz); sh.set(s.tether, (o.x + s.x) * 0.5 * S, (o.y + s.y) * 0.5 * S, 0.7, Math.atan2(dz, dx)); s.tether.sx = L / 2; s.tether.a = 0.35 * k; }
    }
  }
  const shadowFlash = (sid) => { const s = shadowsLive.get(sid); if (s) { s.flash = 1; sh.add({ type: SH.FLASH, x: s.x * S, y: s.y * S, z: 0.9, sx: 1.8, dur: 0.14, color: 0xffffff, prio: 1 }); } };

  // ---------- unit-backed objects: turret / barricade / ward / pet (from state.units) ----------
  const urec = new Map(); // unit id -> rec
  const heatOf = new Map(); // oid -> heat 0..10
  if (typeof window !== 'undefined') window.__threeObjHeat = heatOf;
  const angOf = new Map(); // oid -> aim angle
  const kickOf = new Map();
  function unitPass(st) {
    if (!st.units) return;
    st.units.forEach((u, key) => {
      if (u.alive === false || !fin(u.x, u.y)) return; const k = u.kind;
      if (k !== 'obj' && k !== 'pet' && k !== 'ward') return;
      const id = u.id || key; let r = urec.get(id);
      const owner = u.owner != null ? ent(u.owner) : null;
      const col = colOf(u.owner, u.team);
      if (!r) {
        if (urec.size >= 40) return;
        r = { id, kind: k === 'obj' ? (u.campId === 'turret' ? 'turret' : 'barricade') : k, g: null, h: null, h2: null, led: null, visionH: null, gen: 0, col };
        if (r.kind === 'turret') { r.g = turretPool.get(); r.g.visible = true; r.g.userData.body.material.color.set(col); r.h = shapeP(SH.HEX, u.x, u.y, 0.7, col, { alpha: 0.9 }); sh.add({ type: SH.FLASH, x: u.x * S, y: u.y * S, z: 0.5, sx: 1.4, dur: 0.16, color: 0xffffff, prio: 1 }); sh.add({ type: SH.RING, x: u.x * S, y: u.y * S, sx: 1.8, dur: 0.5, color: col, prio: 1 }); }
        else if (r.kind === 'barricade') { r.g = crates.get(); r.g.visible = true; r.h = shapeP(SH.RING, u.x, u.y, 0.66, col, { alpha: 0.55 }); sh.add({ type: SH.FLASH, x: u.x * S, y: u.y * S, z: 0.5, sx: 1.4, dur: 0.16, color: 0xffffff, prio: 1 }); }
        else if (r.kind === 'ward') { r.h = shapeP(SH.RING, u.x, u.y, 7.5, col, { z: 0.06, alpha: 0.35 }); r.led = shapeP(SH.FLASH, u.x, u.y, 0.35, 0xff3b3b, { z: 1.05 }); }
        else {
          r.h = shapeP(SH.RING, u.x, u.y, 0.8, col, { alpha: 0.8 }); r.h2 = shapeP(SH.HEX, u.x, u.y, 0.5, col, { alpha: 0.5 });
          if (owner && owner.champ === 'tester') r.visionH = shapeP(SH.RING, u.x, u.y, 6.5, 0xff9800, { z: 0.06, alpha: 0.28 });
        }
        urec.set(id, r);
      }
      r.gen = gen; const wx = u.x * S, wz = u.y * S;
      if (r.h) sh.set(r.h, wx, wz); if (r.h2) sh.set(r.h2, wx, wz); if (r.visionH) sh.set(r.visionH, wx, wz);
      if (r.g) { r.g.position.set(wx, 0, wz); }
      if (r.kind === 'turret') {
        const ang = angOf.get(id), heat = heatOf.get(id) || 0, ud = r.g.userData, kick = kickOf.get(id) || 0;
        if (ang !== undefined) ud.barrel.rotation.y = -ang; ud.barrel.position.x = -kick * 0.08;
        if (kick > 0) kickOf.set(id, Math.max(0, kick - 0.05));
        ud.body.material.color.setRGB(1, 1 - heat * 0.07, 1 - heat * 0.09).multiply(tc.set(r.col)).lerp(tc.set(0xff3b1a), heat * 0.06);
        r.h.a = 0.7 + 0.3 * Math.sin(time * (3 + heat)); r.h.rot = time * 0.6;
      } else if (r.kind === 'ward') { r.led.a = Math.sin(time * 5) > 0.55 ? 1 : 0.1; r.h.rot = 0; }
      else if (r.kind === 'barricade') { r.g.rotation.y = 0; }
      else if (r.h2) { r.h2.rot = time * 1.3; }
    });
    for (const [id, r] of urec) {
      if (r.gen === gen) continue;
      if (r.kind === 'turret') { turretPool.put(r.g); sh.add({ type: SH.RING, x: r.h.x, y: r.h.y, sx: 1.4, dur: 0.35, color: r.col, prio: 1 }); } else if (r.g) crates.put(r.g);
      kill(r.h); kill(r.h2); kill(r.led); kill(r.visionH); urec.delete(id); heatOf.delete(id); angOf.delete(id); kickOf.delete(id);
    }
  }

  // ---------- champion-attached: shield bubble, stance aura, marks, orbs, mix, spotted, status ----------
  const crec = new Map(); // champion id -> rec
  const stanceColor = {};
  function stanceCol(champ, nm) {
    const key = champ + '.' + (nm || '');
    if (STANCE_COLORS[key] !== undefined) return STANCE_COLORS[key];
    if (stanceColor[champ] !== undefined) return stanceColor[champ];
    const d = CHAMPIONS[champ]; let c = d && fin(d.color) ? d.color : 0xffffff;
    if (d) for (const k in d.skills) if (d.skills[k].type === 'stance') { c = d.skills[k].color; break; }
    return (stanceColor[champ] = c);
  }
  const markSpecs = [];
  for (const [champ, d] of Object.entries(CHAMPIONS)) for (const sl of 'qwer') { const sk = d.skills && d.skills[sl]; if (sk && sk.mark) markSpecs.push({ champ, slot: sl, color: sk.color, tag: sk.mark.tag, max: sk.mark.max || 1, ms: (sk.mark.ms || 5000) / 1000, type: sk.type }); }
  const marks = new Map(); // victim id -> {n, left, color, spr, key, lastAdd}
  function clearMark(victim, tag) {
    const m = marks.get(victim);
    if (m && (!tag || m.tag === tag)) { if (m.spr) { sprites.put(m.spr); m.spr = null; } marks.delete(victim); }
  }
  function clearMarksByTag(tag, enemyOfTeam) {
    for (const [id, m] of [...marks]) {
      if (m.tag !== tag) continue;
      if (enemyOfTeam) { const e = ent(id); if (e && e.team === enemyOfTeam) continue; }
      clearMark(id, tag);
    }
  }
  function addMark(victim, spec, color) {
    const v = ent(victim); if (!v || !(v.champ || v.kind === 'dummy')) return;
    let m = marks.get(victim); const keyNow = time;
    if (m && keyNow - m.lastAdd < 0.12) return;
    if (!m) { if (marks.size >= 14) return; m = { n: 0, left: 0, color, spr: null, key: '', lastAdd: -9, tag: spec.tag }; marks.set(victim, m); }
    m.n = Math.min(spec.max, (m.left > 0 ? m.n : 0) + 1); m.left = spec.ms; m.color = color; m.lastAdd = keyNow; m.tag = spec.tag;
    if (m.spr) m.key = ''; const p = v; sh.add({ type: SH.FLASH, x: p.x * S, y: p.y * S, z: 1.6, sx: 0.9, dur: 0.18, color, prio: 1 });
  }
  const MARK_GLYPH = { glitch: '❖', vuln: '☠', stale: '⌛', nit: '⚑', paged: '☎' };
  function stepMarks(dt) {
    for (const [id, m] of marks) {
      m.left -= dt; const e = ent(id);
      if (m.left <= 0 || !e || e.dead || e.alive === false) { if (m.spr) { sprites.put(m.spr); m.spr = null; } marks.delete(id); continue; }
      const key = m.tag + m.n; if (!m.spr) { m.spr = sprites.get(); m.spr.visible = true; m.spr.renderOrder = 61; m.key = ''; }
      if (m.key !== key) { m.key = key; m.spr.material.map = glyph((MARK_GLYPH[m.tag] || '◆') + (m.n > 1 ? ' x' + m.n : ''), m.color, 160, 64); m.spr.material.needsUpdate = true; m.spr.scale.set(0.9 + (m.n > 1 ? 0.3 : 0), 0.36, 1); }
      m.spr.position.set(e.x * S, 2.05 + Math.sin(time * 4 + id.length) * 0.05, e.y * S); m.spr.material.opacity = m.left < 0.6 ? m.left / 0.6 : 1;
    }
  }
  function dropChampRec(r) {
    if (r.bub) bubbles.put(r.bub);
    if (r.ssBub) bubbles.put(r.ssBub);
    if (r.stS) sprites.put(r.stS);
    if (r.silS) sprites.put(r.silS);
    if (r.pkgMesh) cubes.put(r.pkgMesh);
    for (const o of r.orbs) orbs.put(o);
    for (const o of r.mixOrbs) orbs.put(o);
    kill(r.sh); kill(r.stH); kill(r.spRing); kill(r.spCross); kill(r.haloH); kill(r.recRing); kill(r.recHex);
  }
  function champPass(st) {
    if (!st.champions) return;
    const mine = myTeam(), srvNow = (source.srvNow && source.srvNow()) || Date.now();
    st.champions.forEach((c, key) => {
      if (!fin(c.x, c.y)) return; const id = c.id || key; let r = crec.get(id);
      const hid = c.dead || (c.stealthed && c.team !== mine);
      if (!r) { if (!c.champ) return; r = { id, bub: null, sh: null, ssBub: null, st: '', stH: null, stS: null, silS: null, spRing: null, spCross: null, haloH: null, recRing: null, recHex: null, pkgMesh: null, orbs: [], mixOrbs: [], mixStr: '', orbN: 0, hasPkg: false, silenced: false, spellshield: false, spotted: false, revive: false, buffs: null, gen: 0 }; crec.set(id, r); }
      r.gen = gen; const wx = c.x * S, wz = c.y * S;
      // shield bubble
      const sv = !hid && c.shield > 0;
      if (sv && !r.bub) { r.bub = bubbles.get(); r.bub.visible = true; r.bub.material.color.set(colOf(id, c.team, 0x6cffd6)); r.sh = shapeP(SH.HEX, c.x, c.y, 1.0, 0xffffff, { alpha: 0.6 }); }
      else if (!sv && r.bub) { bubbles.put(r.bub); r.bub = null; kill(r.sh); r.sh = null; }
      if (r.bub) { r.bub.position.set(wx, 0.7, wz); const k = 1 + 0.03 * Math.sin(time * 8); r.bub.scale.set(k, k * 1.05, k); r.bub.material.opacity = 0.2 + 0.08 * Math.sin(time * 6); sh.set(r.sh, wx, wz); r.sh.rot = time * 0.5; }
      // parse buffs only when changed
      if (c.buffs !== r.buffs) {
        r.buffs = c.buffs;
        const tags = parseKitTags(c.buffs);
        // stance aura
        const nm = tags.stance || '';
        if (nm !== r.st) {
          r.st = nm; if (r.stS) { sprites.put(r.stS); r.stS = null; } kill(r.stH); r.stH = null;
          if (nm) {
            const col = stanceCol(c.champ, nm);
            r.stS = sprite(nm.toUpperCase().replace(/_/g, ' '), col, 1.5, 0.42, 192, 64, 'bold 34px "Segoe UI", Arial');
            r.stH = shapeP(SH.HEX, c.x, c.y, 1.0, col, { alpha: 0.55, z: 0.07 }); r.stCol = col;
            sh.add({ type: SH.RING, x: wx, y: wz, sx: 1.9, dur: 0.45, color: col, prio: 1 });
            sh.add({ type: SH.FLASH, x: wx, y: wz, z: 1.4, sx: 1.2, dur: 0.14, color: 0xffffff, prio: 1 });
          }
        }
        // Model kit:orbs:N
        r.orbN = Math.max(0, Math.min(3, parseInt(tags.orbs || '0', 10) || 0));
        while (r.orbs.length < r.orbN) { const o = orbs.get(); o.material.color.set(0x6cffd6); o.scale.setScalar(1.0); o.visible = true; r.orbs.push(o); }
        while (r.orbs.length > r.orbN) orbs.put(r.orbs.pop());
        // Brew kit:mix:...
        const ms = (tags.mix || '').slice(0, 3);
        if (ms !== r.mixStr) {
          r.mixStr = ms;
          while (r.mixOrbs.length < ms.length) { const o = orbs.get(); o.scale.setScalar(0.9); o.visible = true; r.mixOrbs.push(o); }
          while (r.mixOrbs.length > ms.length) orbs.put(r.mixOrbs.pop());
          for (let i = 0; i < ms.length; i++) r.mixOrbs[i].material.color.set(MIX_COLORS[ms[i]] ?? 0xffd27a);
        }
        // Rush kit:pkg
        r.hasPkg = !!(tags.pkg && tags.pkg !== '0' && tags.pkg !== 'false');
        // Status flags
        r.silenced = hasBuff(c.buffs, 'silenced');
        r.spellshield = hasBuff(c.buffs, 'spellshield');
        r.spotted = hasBuff(c.buffs, 'spotted');
        r.revive = hasBuff(c.buffs, 'cc:revive');
      }
      if (r.stH) { sh.set(r.stH, wx, wz); r.stH.rot = time * 0.8; r.stH.a = hid ? 0 : 0.5; r.stS.position.set(wx, 2.3, wz); r.stS.visible = !hid; }
      // Model orbiting orbs
      for (let i = 0; i < r.orbs.length; i++) {
        const o = r.orbs[i], a = time * 2.6 + (i * Math.PI * 2) / Math.max(1, r.orbs.length);
        o.visible = !hid;
        if (!hid) o.position.set(wx + Math.cos(a) * 0.68, 1.05 + Math.sin(time * 4 + i) * 0.1, wz + Math.sin(a) * 0.68);
      }
      // Brew floating mix dots
      for (let i = 0; i < r.mixOrbs.length; i++) {
        const o = r.mixOrbs[i], off = (i - (r.mixOrbs.length - 1) * 0.5) * 0.3;
        o.visible = !hid;
        if (!hid) o.position.set(wx + off, 2.02 + Math.sin(time * 4.5 + i * 1.2) * 0.05, wz);
      }
      // Rush carried package cube (synced from kit:pkg, hidden when dead/stealthed)
      const showPkg = !hid && r.hasPkg;
      if (showPkg && !r.pkgMesh) { r.pkgMesh = cubes.get(); r.pkgMesh.visible = true; }
      else if (!showPkg && r.pkgMesh) { cubes.put(r.pkgMesh); r.pkgMesh = null; }
      if (r.pkgMesh) { r.pkgMesh.position.set(wx, 1.95 + Math.sin(time * 4) * 0.05, wz); r.pkgMesh.rotation.y = time * 2; }
      // Silenced overhead sprite
      const showSil = !hid && r.silenced;
      if (showSil && !r.silS) { r.silS = sprite('🔇', 0xff6b6b, 0.72, 0.72, 96, 96, '58px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'); }
      else if (!showSil && r.silS) { sprites.put(r.silS); r.silS = null; }
      if (r.silS) { r.silS.position.set(wx, 2.48 + Math.sin(time * 6) * 0.04, wz); r.silS.visible = true; }
      // Spellshield glowing sphere
      const showSS = !hid && r.spellshield;
      if (showSS && !r.ssBub) { r.ssBub = bubbles.get(); r.ssBub.visible = true; r.ssBub.material.color.set(0x48dbfb); }
      else if (!showSS && r.ssBub) { bubbles.put(r.ssBub); r.ssBub = null; }
      if (r.ssBub) { r.ssBub.position.set(wx, 0.75, wz); const k = 1.12 + 0.04 * Math.sin(time * 9); r.ssBub.scale.set(k, k, k); r.ssBub.material.opacity = 0.24 + 0.08 * Math.sin(time * 7); }
      // Tester spotted targeting reticle
      const showSp = !hid && r.spotted;
      if (showSp && !r.spRing) {
        r.spRing = shapeP(SH.RING, c.x, c.y, 1.05, 0xff3b3b, { z: 0.14, alpha: 0.9 });
        r.spCross = shapeP(SH.PLUS, c.x, c.y, 0.85, 0xff3b3b, { z: 0.15, alpha: 0.8 });
      } else if (!showSp && r.spRing) { kill(r.spRing); kill(r.spCross); r.spRing = null; r.spCross = null; }
      if (r.spRing) { sh.set(r.spRing, wx, wz); r.spRing.rot = time * 1.4; sh.set(r.spCross, wx, wz); r.spCross.rot = -time * 1.4; }
      // cc:revive golden halo above champion
      const showHalo = !hid && r.revive;
      if (showHalo && !r.haloH) { r.haloH = shapeP(SH.RING, c.x, c.y, 0.55, 0xffd23f, { z: 2.15, alpha: 0.95 }); }
      else if (!showHalo && r.haloH) { kill(r.haloH); r.haloH = null; }
      if (r.haloH) { sh.set(r.haloH, wx, wz, 2.15 + Math.sin(time * 5) * 0.04, time * 1.6); }
      // Recall ground channel ring (rotating cyan + gold hex)
      const recalling = !hid && !c.dead && (c.recallUntil || 0) > srvNow;
      if (recalling && !r.recRing) {
        r.recRing = shapeP(SH.RING, c.x, c.y, 1.35, 0x39e8ff, { z: 0.1, alpha: 0.9 });
        r.recHex = shapeP(SH.HEX, c.x, c.y, 0.95, 0xffd23f, { z: 0.11, alpha: 0.78 });
      } else if (!recalling && r.recRing) {
        kill(r.recRing); kill(r.recHex); r.recRing = null; r.recHex = null;
      }
      if (r.recRing) {
        const prog = Math.max(0, Math.min(1, 1 - (c.recallUntil - srvNow) / 4000));
        sh.set(r.recRing, wx, wz, 0.1, time * 2.4);
        r.recRing.sx = 1.15 + 0.18 * Math.sin(time * 8);
        r.recRing.a = 0.75 + 0.25 * Math.sin(time * 10);
        sh.set(r.recHex, wx, wz, 0.11, -time * 3.0);
        r.recHex.sx = 0.72 + prog * 0.48;
        r.recHex.a = 0.7 + 0.25 * Math.sin(time * 12);
      }
    });
    for (const [id, r] of crec) if (r.gen !== gen) { dropChampRec(r); crec.delete(id); }
  }

  // ---------- signature cast impact ----------
  const lastCast = new Map(); let edge = null, edgeT = 0;
  const icons = []; // {s, t}
  const ICON_MAX = 6;
  function edgeFlash(color) {
    try {
      if (!edge) {
        edge = document.createElement('div'); edge.style.cssText = 'position:fixed;pointer-events:none;z-index:40;opacity:0;transition:opacity .12s ease-out;';
        document.body.appendChild(edge);
      }
      const cv = document.querySelector('canvas'), r = cv ? cv.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
      edge.style.left = r.left + 'px'; edge.style.top = r.top + 'px'; edge.style.width = r.width + 'px'; edge.style.height = r.height + 'px';
      const hex = '#' + tc.set(color).getHexString(); edge.style.background = `radial-gradient(ellipse at center, transparent 52%, ${hex}66 82%, ${hex}cc 100%)`;
      edge.style.transition = 'none'; edge.style.opacity = '0.9'; void edge.offsetWidth; edge.style.transition = 'opacity .5s ease-out'; edge.style.opacity = '0'; edgeT = 1;
    } catch (_) { /* no DOM */ }
  }
  const NO_CAST = new Set(['hit', 'shot', 'petatk', 'obj', 'objEnd', 'objHeat', 'objUpd', 'pinBoom', 'trapEnd', 'shadow', 'shadowEnd', 'tether', 'tetherEnd', 'link', 'linkEnd', 'linkShare', 'timebox', 'timeboxEnd', 'echo', 'echoFire', 'charge', 'chargeEnd', 'pkg', 'reload', 'reloadEnd', 'cc', 'ccBlock', 'ccBreak', 'miss', 'suppress', 'suppressEnd', 'gping', 'stance', 'spell']);
  /** every skill cast: unmistakable moment (feet ring in champion colour + 1-frame flash + icon glyph + shake by power; ult = big + edge flash). */
  function cast(m, col) {
    if (!m || !m.sid || !m.slot || NO_CAST.has(m.k)) return;
    const posKey = m.k === 'circle' && fin(m.x, m.y) ? ':' + Math.round(m.x / 80) + ',' + Math.round(m.y / 80) : '';
    const key = m.sid + m.slot + posKey, now = time, last = lastCast.get(key);
    if (last !== undefined && now - last < 0.15) return; lastCast.set(key, now); if (lastCast.size > 80) lastCast.clear();
    const c = ent(m.sid); if (!c || !fin(c.x, c.y)) return;
    const def = CHAMPIONS[c.champ], stance = c.buffs ? parseKitTags(c.buffs).stance || '' : '';
    const sk = def ? resolveSkill(def, m.slot, stance) : null;
    const ult = m.slot === 'r', color = fin(col) ? col : (sk && fin(sk.color) ? sk.color : 0xffffff);
    const size = ult ? 3.6 : 2.0, wx = c.x * S, wz = c.y * S, local = m.sid === source.localId;
    sh.add({ type: SH.FLASH, x: wx, y: wz, z: 0.9, sx: size * 0.7, dur: 0.1, color: 0xffffff, alpha: 1, prio: 1 });
    sh.add({ type: SH.RING, x: wx, y: wz, sx: size, dur: ult ? 0.8 : 0.45, color, prio: 1 });
    if (ult) { sh.add({ type: SH.RAYS, x: wx, y: wz, z: 0.6, sx: size * 0.9, dur: 0.6, color, prio: 1 }); sh.add({ type: SH.RING, x: wx, y: wz, sx: size * 1.5, dur: 1.0, delay: 0.1, color: flair ? flair(m.sid) : 0xffffff, alpha: 0.7, prio: 1 }); }
    // windup marker at the TRUE radius for instant circles (delayed ones already get the router's own windup telegraph)
    if (m.k === 'circle' && fin(m.x, m.y) && !(m.delay > 40)) tg.tele({ x: m.x, y: m.y, mode: 0, a: Math.max(0.8, (m.r || 100) * S), ext: Math.max(0.8, (m.r || 100) * S) * 1.1, color, delay: ult ? 0.3 : 0.2 });
    if (sk && sk.icon && icons.length < ICON_MAX && (local || ult || size)) { const s = sprite(sk.icon, color, ult ? 1.5 : 1.0, ult ? 1.5 : 1.0, 96, 96, '64px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'); s.position.set(wx, 2.4, wz); icons.push({ s, t: 0, dur: ult ? 1.0 : 0.7, base: ult ? 1.5 : 1.0 }); }
    addShake(ult ? (local ? 0.24 : 0.14) : (local ? 0.07 : 0.03));
    if (ult && local) edgeFlash(color);
    if (sk && sk.mark && m.k === 'circle' && fin(m.x, m.y)) { const st = source.state(); if (st && st.champions) st.champions.forEach((e, k) => { if (e.team !== c.team && !e.dead && Math.hypot(e.x - m.x, e.y - m.y) <= (m.r || 100) + 40) addMark(e.id || k, { tag: sk.mark.tag, max: sk.mark.max || 1, ms: (sk.mark.ms || 5000) / 1000 }, color); }); }
    // clear detonated marks (cache.r -> stale, oncall.q -> paged, lint.r -> nit)
    const detTag = (sk && sk.detonate && sk.detonate.tag) || (sk && sk.resolve && sk.resolve.detonate && sk.resolve.detonate.tag);
    if (detTag) {
      if (sk.resolve) clearMarksByTag(detTag, c.team);
      else if (m.tid || m.to) clearMark(m.tid || m.to, detTag);
      else if (m.k === 'circle' && fin(m.x, m.y)) { const st = source.state(); if (st && st.champions) st.champions.forEach((e, k) => { if (e.team !== c.team && Math.hypot(e.x - m.x, e.y - m.y) <= (m.r || 160) + 50) clearMark(e.id || k, detTag); }); }
      else if (m.k === 'dash' && fin(m.x1, m.y1)) { const st = source.state(); if (st && st.champions) st.champions.forEach((e, k) => { if (e.team !== c.team && Math.hypot(e.x - m.x1, e.y - m.y1) <= 130) clearMark(e.id || k, detTag); }); }
    }
    shadowFlash(m.sid);
  }
  function stepIcons(dt) {
    for (let i = icons.length - 1; i >= 0; i--) {
      const o = icons[i]; o.t += dt; const k = o.t / o.dur;
      if (k >= 1) { sprites.put(o.s); icons[i] = icons[icons.length - 1]; icons.pop(); continue; }
      o.s.position.y += dt * 0.8; o.s.material.opacity = k < 0.7 ? 1 : (1 - k) / 0.3; const sc = o.base * (1 + Math.max(0, 0.25 - o.t) * 3); o.s.scale.set(sc, sc, 1);
    }
  }

  // ---------- router hooks ----------
  /** returns true when the message was fully handled here (the router skips its own handling). */
  function onFx(m) {
    if (disposed || !m) return false;
    try {
      switch (m.k) {
        case 'obj': return addObj(m);
        case 'objUpd': return updObj(m);
        case 'objEnd': { const r = objs.get(m.oid); if (r) { dropObj(r, !!m.boom); return true; } if (m.boom) { const u = ent(m.oid); if (u) { sh.add({ type: SH.FLASH, x: u.x * S, y: u.y * S, z: 0.6, sx: 2.0, dur: 0.3, color: 0xffb347, prio: 1 }); sh.add({ type: SH.RING, x: u.x * S, y: u.y * S, sx: 2.6, dur: 0.4, color: 0xff9800, prio: 1 }); addShake(0.1); } } return true; }
        case 'objHeat': heatOf.set(m.oid, m.h || 0); return true;
        case 'shot': if (m.oid) { if (fin(m.x, m.y, m.tx, m.ty)) angOf.set(m.oid, Math.atan2(m.ty - m.y, m.tx - m.x)); kickOf.set(m.oid, 1); if (fin(m.x, m.y)) sh.add({ type: SH.RING, x: m.x * S, y: m.y * S, sx: 1.1, dur: 0.25, color: fin(m.color) ? m.color : 0xff9800, alpha: 0.8, prio: 0 }); } return false;
        case 'shadow': addShadow(m); return true;
        case 'shadowEnd': endShadow(m.sid, false); return true;
        case 'tether': if (m.tid) addLive('t:' + m.tid, 'tether', m, fin(m.color) ? m.color : 0x7ed957); return true;
        case 'tetherEnd': endLive('t:' + m.tid); return true;
        case 'link': if (m.lid) addLive('l:' + m.lid, 'link', m, fin(m.color) ? m.color : 0x7ed957); return true;
        case 'linkEnd': endLive('l:' + m.lid); return true;
        case 'linkShare': { const a = ent(m.a), b = ent(m.b); if (a && b) sh.add({ type: SH.FLASH, x: b.x * S, y: b.y * S, z: 1.0, sx: 0.9, dur: 0.2, color: 0xffb088, prio: 1 }); return true; }
        case 'timebox': if (m.sid) addLive('tb:' + m.sid, 'timebox', m, fin(m.color) ? m.color : 0xffe066); return false;
        case 'timeboxEnd': endLive('tb:' + m.sid); return false;
        case 'echo': if (m.sid) addLive('e:' + m.sid, 'echo', m, 0x91a7ff); return true;
        case 'echoFire': endLive('e:' + m.sid); return false;
        case 'charge': if (m.sid) { m.ms = 6000; addLive('c:' + m.sid, 'charge', m, fin(m.color) ? m.color : 0xffffff); } return false;
        case 'chargeEnd': endLive('c:' + m.sid); return true;
        case 'suppress': if (m.tid || m.sid) addLive('sup:' + (m.tid || m.sid), 'suppress', m, 0xd63031); return false;
        case 'suppressEnd': endLive('sup:' + (m.tid || m.sid)); return false;
        case 'reload': if (m.sid) addLive('rl:' + m.sid, 'reload', m, 0xffd23f); return false;
        case 'reloadEnd': endLive('rl:' + m.sid); return false;
        case 'pkg': return true; // carried package cube is synced directly from kit:pkg in champPass (fog/death/stealth safe)
        case 'zone': if (fin(m.x, m.y) && m.tid) addLive('z:' + m.tid, 'zone', { x: m.x, y: m.y, ms: m.ms || 3000 }, fin(m.color) ? m.color : 0xffffff); return false; // router still draws the true-radius zone
        case 'trapEnd': endLive('z:' + m.tid); return false;
        case 'pinBoom': {
          const r = objs.get(m.oid);
          if (r) {
            sh.add({ type: SH.RING, x: r.x * S, y: r.y * S, sx: Math.max(1.6, r.r * S * 1.4), dur: 0.4, color: r.col, prio: 1 });
            clearMarksByTag('nit', r.team);
          }
          return true;
        }
        case 'petatk': { const p = ent(m.id); if (p) sh.add({ type: SH.FLASH, x: p.x * S, y: p.y * S, z: 0.6, sx: 0.8, dur: 0.14, color: 0xffffff, prio: 0 }); return false; }
        case 'hit': {
          if (m.id && m.sid && m.slot) {
            const c = ent(m.sid), def = c && CHAMPIONS[c.champ], stance = c && c.buffs ? parseKitTags(c.buffs).stance || '' : '';
            const sk = def ? resolveSkill(def, m.slot, stance) : null;
            if (sk && sk.detonate && sk.detonate.tag) clearMark(m.id, sk.detonate.tag);
          }
          if (marks.size < 14 && fin(m.color)) { const v = ent(m.id); if (v) for (const sp of markSpecs) { if (sp.color !== m.color || sp.type === 'circle') continue; let own = false; const st = source.state(); if (st && st.champions) st.champions.forEach((c) => { if (c.champ === sp.champ && c.team !== v.team) own = true; }); if (own) { addMark(m.id, sp, m.color); break; } } }
          return false;
        }
        default: return false;
      }
    } catch (e) { console.warn('[fx] objects', e); return false; }
  }

  function update(dt) {
    if (disposed) return; time += dt; gen++;
    const st = source.state();
    if (st) { unitPass(st); champPass(st); }
    stepObjs(dt); stepLive(dt); stepShadows(dt); stepMarks(dt); stepIcons(dt);
  }
  return {
    onFx, cast, update,
    getHeat: (oid) => heatOf.get(oid) || 0,
    get count() { return objs.size + live.size + shadowsLive.size + urec.size + marks.size; },
    dispose() {
      disposed = true; for (const r of [...objs.values()]) dropObj(r, false); for (const r of [...live.values()]) dropLive(r);
      for (const k of [...shadowsLive.keys()]) endShadow(k, true);
      for (const r of urec.values()) { kill(r.h); kill(r.h2); kill(r.led); kill(r.visionH); } urec.clear();
      for (const r of crec.values()) dropChampRec(r); crec.clear();
      for (const o of glyphTex.values()) o.dispose(); glyphTex.clear(); for (const t of texs) t.dispose(); for (const g of geos) g.dispose();
      root.traverse((o) => { if (o.material) o.material.dispose(); }); scene.remove(root); if (edge && edge.parentNode) edge.parentNode.removeChild(edge);
      if (typeof window !== 'undefined' && window.__threeObjHeat === heatOf) delete window.__threeObjHeat;
    },
  };
}
export default createObjects;

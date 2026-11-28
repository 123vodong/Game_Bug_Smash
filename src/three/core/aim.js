// Aim previews for the 3D renderer (port of TeamModeScene._drawAim / _drawDragPreview).
// Everything is drawn flat on the ground at TRUE sim size: scene x = sim x * 0.01, scene z = sim y * 0.01.
// createAim({THREE, scene}) -> aim
//   aim.begin()                         start a frame (all pooled meshes are released)
//   aim.drawSkill(sk, pos, target, o)   preview of skill spec `sk` cast from pos {x,y} toward target {x,y}
//                                       o: {alpha, nav, kit, targetPos}
//   aim.drawDrag(sk, pos, A, m, alpha)  two-point preview (Pixel Q): A fixed, B follows the cursor up to obj.len
//   aim.drawSelf(pos, r, color, alpha)  self ring
//   aim.end()                           hide what this frame did not use
//   aim.dispose()
// Pools are fixed (no per-frame allocation): 6 rings, 4 discs, 14 rects (+outline), 2 sectors.
import { CHAMP_RADIUS } from '../../../shared/moba/map.js';

const S = 0.01;          // sim px -> world units (mirrors Renderer.js S)
const Y = 0.07;          // just above the floor
const SEG = 40;          // sector arc segments

export function createAim({ THREE, scene }) {
  const root = new THREE.Group(); root.name = 'aimPreview'; root.renderOrder = 40; scene.add(root);
  const mat = (line) => {
    const p = { transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide };
    return line ? new THREE.LineBasicMaterial(p) : new THREE.MeshBasicMaterial(p);
  };
  const ringGeo = new THREE.RingGeometry(0.955, 1, 64).rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2);
  const rectGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
  const outGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -0.5), new THREE.Vector3(1, 0, -0.5), new THREE.Vector3(1, 0, 0.5), new THREE.Vector3(0, 0, 0.5)]);
  const mk = (geo, n, line) => { const a = []; for (let i = 0; i < n; i++) { const m = new (line ? THREE.LineLoop : THREE.Mesh)(geo, mat(line)); m.visible = false; m.renderOrder = 40; root.add(m); a.push(m); } return a; };
  const rings = mk(ringGeo, 6), discs = mk(discGeo, 4);
  const rects = [];
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group(); g.visible = false;
    const f = new THREE.Mesh(rectGeo, mat(false)); f.renderOrder = 40;
    const o = new THREE.LineLoop(outGeo, mat(true)); o.renderOrder = 41;
    g.add(f, o); g.userData = { f, o }; root.add(g); rects.push(g);
  }
  const sectors = [];
  for (let i = 0; i < 2; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 2 * 3), 3));
    const idx = [];
    for (let k = 0; k < SEG; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, mat(false)); m.visible = false; m.frustumCulled = false; m.renderOrder = 40; root.add(m); sectors.push(m);
  }
  const used = { ring: 0, disc: 0, rect: 0, sec: 0 }, prev = { ring: 0, disc: 0, rect: 0, sec: 0 };

  function style(m, col, a, fill) { m.material.color.setHex(col); m.material.opacity = Math.max(0, Math.min(1, a)); if (fill !== undefined) m.visible = true; }
  function ring(x, y, r, col, a) {
    if (used.ring >= rings.length || !(r > 0)) return; const m = rings[used.ring++];
    m.position.set(x * S, Y, y * S); m.scale.set(r * S, 1, r * S); style(m, col, a, 1);
  }
  function disc(x, y, r, col, a) {
    if (used.disc >= discs.length || !(r > 0)) return; const m = discs[used.disc++];
    m.position.set(x * S, Y - 0.01, y * S); m.scale.set(r * S, 1, r * S); style(m, col, a, 1);
  }
  /** band from A to B with the given width (sim px) */
  function rect(ax, ay, bx, by, w, col, fa, la) {
    if (used.rect >= rects.length) return; const g = rects[used.rect++];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-3;
    g.position.set(ax * S, Y - 0.005, ay * S); g.rotation.y = -Math.atan2(dy, dx); g.scale.set(len * S, 1, w * S);
    style(g.userData.f, col, fa); style(g.userData.o, col, la); g.visible = true;
  }
  function sector(x, y, r0, r1, a0, a1, col, a) {
    if (used.sec >= sectors.length) return; const m = sectors[used.sec++];
    const p = m.geometry.attributes.position.array;
    for (let k = 0; k <= SEG; k++) {
      const an = a0 + (a1 - a0) * (k / SEG), c = Math.cos(an), s = Math.sin(an), o = k * 6;
      p[o] = c * r0 * S; p[o + 1] = 0; p[o + 2] = s * r0 * S; p[o + 3] = c * r1 * S; p[o + 4] = 0; p[o + 5] = s * r1 * S;
    }
    m.geometry.attributes.position.needsUpdate = true;
    m.position.set(x * S, Y - 0.005, y * S); style(m, col, a, 1);
  }

  const aim = {
    begin() { used.ring = used.disc = used.rect = used.sec = 0; },
    end() {
      for (let i = used.ring; i < prev.ring; i++) rings[i].visible = false;
      for (let i = used.disc; i < prev.disc; i++) discs[i].visible = false;
      for (let i = used.rect; i < prev.rect; i++) rects[i].visible = false;
      for (let i = used.sec; i < prev.sec; i++) sectors[i].visible = false;
      prev.ring = used.ring; prev.disc = used.disc; prev.rect = used.rect; prev.sec = used.sec;
    },
    drawSelf(pos, r, col, a) { disc(pos.x, pos.y, r, col, 0.12 * a); ring(pos.x, pos.y, r, col, 0.8 * a); },
    /** Pixel-Q style: A fixed, B follows the cursor up to obj.len (2D _drawDragPreview). */
    drawDrag(sk, pos, A, m, a = 1) {
      const col = sk.color ?? 0x39c2ff, maxLen = (sk.obj && sk.obj.len) || 400, th = (sk.obj && sk.obj.thick) || 36;
      const dx = m.x - A.x, dy = m.y - A.y, d = Math.hypot(dx, dy), ux = d > 8 ? dx / d : 1, uy = d > 8 ? dy / d : 0, reach = Math.min(d, maxLen);
      if (sk.range && pos) ring(pos.x, pos.y, sk.range, col, 0.4 * a);
      rect(A.x, A.y, A.x + ux * maxLen, A.y + uy * maxLen, Math.max(6, th * 0.15), col, 0.1 * a, 0.35 * a); // ghost: full reach
      rect(A.x, A.y, A.x + ux * reach, A.y + uy * reach, th, col, 0.3 * a, 0.95 * a);                      // the band that will be placed
      disc(A.x, A.y, th * 0.55, col, 0.9 * a); ring(A.x, A.y, th * 0.55 + 6, 0xffffff, 0.9 * a);
      disc(A.x + ux * reach, A.y + uy * reach, th * 0.55, col, 0.9 * a); ring(A.x + ux * reach, A.y + uy * reach, th * 0.55 + 6, 0xffffff, 0.9 * a);
      return reach;
    },
    /** Spec-driven preview (2D _drawAim branches). target = aim point (sim px). */
    drawSkill(sk, pos, target, o = {}) {
      const a = o.alpha == null ? 1 : o.alpha, col = sk.color ?? 0xffffff, nav = o.nav;
      const sc = (base, key) => {
        if (base == null || typeof o.charge !== 'number' || !sk.hold || !sk.hold.scale) return base;
        const p = sk.hold.scale[key];
        return p ? base * (p[0] + (p[1] - p[0]) * Math.max(0, Math.min(1, o.charge))) : base;
      };
      const range = sc(sk.range, 'range'), width = sc(sk.width, 'width'), radius = sc(sk.radius, 'radius');
      if (sk.type === 'rewind' && sk.rewind && sk.rewind.radius) { aim.drawSelf(pos, sk.rewind.radius, col, a); return; }
      if (range && !sk.global) ring(pos.x, pos.y, range, col, 0.55 * a);
      const selfArea = sk.type === 'self' || sk.type === 'allies' || ((sk.type === 'circle' || sk.type === 'zone') && !range);
      if (selfArea && radius) { aim.drawSelf(pos, radius, col, a); if (sk.inner) ring(pos.x, pos.y, sk.inner, col, 0.6 * a); return; }
      if (!target) return;
      const dx = target.x - pos.x, dy = target.y - pos.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      if (o.targetPos) { ring(o.targetPos.x, o.targetPos.y, 46, 0xffd23f, 0.9 * a); }
      if (sk.global) {
        rect(pos.x, pos.y, pos.x + ux * range, pos.y + uy * range, width || 120, col, 0.12 * a, 0.7 * a); ring(target.x, target.y, 40, col, 0.35 * a);
      } else if (sk.type === 'cone' || sk.type === 'arc') {
        const base = Math.atan2(uy, ux), half = ((sk.angle || 90) * Math.PI) / 360;
        sector(pos.x, pos.y, sk.type === 'arc' ? sk.inner || 0 : 0, range, base - half, base + half, col, 0.2 * a);
      } else if (sk.type === 'line') {
        rect(pos.x, pos.y, pos.x + ux * range, pos.y + uy * range, width || 100, col, 0.2 * a, 0.65 * a);
      } else if (sk.type === 'place' && sk.obj && sk.obj.kind === 'barrier') {
        const sp = sk.spend, kit = o.kit || {}, u = sp ? Math.min(Number(kit[sp.res] || 0), sp.max) : 0;
        const len = sk.obj.len * (1 + ((sp && sp.per && sp.per.radius) || 0) * u), r = Math.min(d, range), cx = pos.x + ux * r, cy = pos.y + uy * r, hl = len / 2;
        rect(cx - uy * hl, cy + ux * hl, cx + uy * hl, cy - ux * hl, sk.obj.thick || 40, col, 0.22 * a, 0.7 * a);
      } else if (sk.type === 'place' && sk.obj) {
        const r = range ? Math.min(d, range) : 0, cx = range ? pos.x + ux * r : pos.x, cy = range ? pos.y + uy * r : pos.y;
        const fp = sk.obj.r || 40;
        disc(cx, cy, fp, col, 0.22 * a); ring(cx, cy, fp, col, 0.9 * a);
        if (sk.obj.kind === 'turret') ring(cx, cy, sk.obj.range || 520, col, 0.32 * a);
      } else if (sk.type === 'shadow') {
        if (!sk.shadow || sk.shadow.mode !== 'swap') {
          const r = range ? Math.min(d, range) : d, cx = pos.x + ux * r, cy = pos.y + uy * r;
          disc(cx, cy, 30, col, 0.35 * a); ring(cx, cy, 34, col, 0.95 * a);
        }
      } else if (sk.type === 'projectile') {
        const L = range, w = width || 70, count = Math.max(1, Math.min(12, sk.count | 0 || 1));
        const spread = count > 1 ? ((sk.spread || 0) * Math.PI) / 180 : 0, base = Math.atan2(uy, ux);
        for (let i = 0; i < count; i++) {
          const an = base + (count > 1 ? (i / (count - 1) - 0.5) * spread : 0);
          rect(pos.x, pos.y, pos.x + Math.cos(an) * L, pos.y + Math.sin(an) * L, w, col, (count > 1 ? 0.1 : 0.2) * a, (count > 1 ? 0.5 : 0.75) * a);
        }
      } else if (sk.type === 'circle' || sk.type === 'zone') {
        const r = Math.min(d, range), cx = pos.x + ux * r, cy = pos.y + uy * r;
        disc(cx, cy, radius, col, (sk.type === 'zone' ? 0.22 : 0.17) * a); ring(cx, cy, radius, col, 0.85 * a);
        if (sk.inner) ring(cx, cy, sk.inner, col, 0.6 * a);
        if (sk.type === 'zone') ring(cx, cy, radius * 0.7, 0xffffff, 0.35 * a);
      } else if (sk.type === 'dash') {
        const r = Math.min(d, range), tx = pos.x + ux * r, ty = pos.y + uy * r;
        let end = { x: tx, y: ty, hit: false };
        if (nav && nav.clipMove && !sk.phase) { try { end = nav.clipMove(pos.x, pos.y, tx, ty, CHAMP_RADIUS) || end; } catch (_) { /* keep */ } }
        rect(pos.x, pos.y, end.x, end.y, 40, col, 0.2 * a, 0.7 * a); ring(end.x, end.y, 28, col, 0.9 * a); disc(end.x, end.y, 28, col, 0.25 * a);
        if (end.hit && !sk.phase) rect(end.x, end.y, tx, ty, 10, 0xff8a3c, 0.2 * a, 0.5 * a);
      } else if (sk.type === 'blink') {
        const r = Math.min(d, range), tx = pos.x + ux * r, ty = pos.y + uy * r;
        let land = { x: tx, y: ty };
        if (nav && nav.nearestFree) { try { land = nav.nearestFree(tx, ty, CHAMP_RADIUS) || land; } catch (_) { /* keep */ } }
        rect(pos.x, pos.y, land.x, land.y, 24, col, 0.15 * a, 0.6 * a); ring(land.x, land.y, 28, col, 0.9 * a); disc(land.x, land.y, 28, col, 0.25 * a);
      } else if (sk.type === 'target') {
        const tp = o.targetPos;
        if (tp) { const inR = Math.hypot(tp.x - pos.x, tp.y - pos.y) <= range + 90, tc = inR ? col : 0xff4a4a; rect(pos.x, pos.y, tp.x, tp.y, 14, tc, 0.12 * a, 0.6 * a); ring(tp.x, tp.y, 44, tc, 0.85 * a); }
      } else if (radius && range) {
        disc(target.x, target.y, radius, col, 0.15 * a); ring(target.x, target.y, radius, col, 0.8 * a);
      }
    },
    dispose() { scene.remove(root); root.traverse((n) => { if (n.material) n.material.dispose(); }); for (const g of [ringGeo, discGeo, rectGeo, outGeo]) g.dispose(); for (const s of sectors) s.geometry.dispose(); },
  };
  return aim;
}

export default createAim;

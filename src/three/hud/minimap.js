// Minimap (C6): static layer (walls, bushes, fountains) baked once per world, dynamic dots redrawn ~8 Hz.
// Click / drag = move order via source.send('order', {type:'move', x, y}) (throttled).
import { TEAM_INFO } from '../../../shared/moba/rules.js';
import { LANES, LANE_WIDTH, RIVER, RIVER_PATH, CAMPS, EPIC_SPOTS, BASE_RADIUS } from '../../../shared/moba/map.js';

const hex = (n) => '#' + ((n >>> 0) & 0xffffff).toString(16).padStart(6, '0');
const teamCol = (t) => (TEAM_INFO[t] ? hex(TEAM_INFO[t].color) : '#e0b84a');
const MOVE_MIN_MS = 120; // client-side throttle (R.MOVE_ORDER_RATE_MS is not mirrored on purpose)

export function createMinimap({ source, project, parent, hooks = null }) {
  const root = document.createElement('div'); root.className = 'bsh-mm bsh-pop';
  const bg = document.createElement('canvas'), dyn = document.createElement('canvas');
  root.append(bg, dyn); parent.appendChild(root);
  const world = source.world || {};
  const WW = world.w || 6000, WH = world.h || 6000; // fallback mirrors shared/moba/map.js MAP_W/H
  let size = 0, k = 1, aim = null, lastSend = 0, drag = false;
  const gpings = [];
  function addGping(m) {
    if (!m || ![m.x0, m.y0, m.x1, m.y1].every(Number.isFinite)) return;
    while (gpings.length >= 4) gpings.shift();
    const now = performance.now(), ms = Math.max(600, Number.isFinite(m.ms) ? Math.min(2000, m.ms) : 600);
    gpings.push({ x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1, born: now, until: now + ms });
  }
  const offFx = source && source.on ? source.on('fx', (m) => { if (m && m.k === 'gping') addGping(m); }) : null;

  function layout() {
    const s = Math.round(root.clientWidth) || 200;
    if (s === size) return;
    size = s; k = size / Math.max(WW, WH);
    bg.width = dyn.width = size; bg.height = dyn.height = size;
    bake();
  }
  function bake() {
    const g = bg.getContext('2d'); g.clearRect(0, 0, size, size);
    const is5v5 = !world.id || world.id === '5v5';
    g.fillStyle = is5v5 ? '#6d7a55' : '#0c1716'; g.fillRect(0, 0, WW * k, WH * k);
    const shape = (o, w, strokeCol = null) => {
      if (o.kind === 'poly') {
        if (!o.pts || o.pts.length < 3) return;
        g.beginPath();
        o.pts.forEach((p, i) => (i ? g.lineTo(p[0] * k, p[1] * k) : g.moveTo(p[0] * k, p[1] * k)));
        g.closePath();
        g.fill();
        if (strokeCol) { g.strokeStyle = strokeCol; g.lineWidth = 1.2; g.stroke(); }
        return;
      }
      if (o.kind === 'circle') { g.beginPath(); g.arc(o.x * k, o.y * k, Math.max(1, o.r * k), 0, 6.3); g.fill(); return; }
      if (o.kind === 'rect') { g.fillRect(o.x * k, o.y * k, Math.max(1, o.w * k), Math.max(1, o.h * k)); return; }
      g.lineWidth = Math.max(1, (o.w || w) * k); g.lineCap = 'round';
      g.beginPath(); g.moveTo(o.x1 * k, o.y1 * k); g.lineTo(o.x2 * k, o.y2 * k); g.stroke();
    };
    if (is5v5) {
      g.lineCap = 'round'; g.lineJoin = 'round';
      // Team base courtyards in muted Summoner's Rift slate/terracotta (centered toward corner gates)
      const f = world.fountain || {};
      for (const [t, ox, oy] of [['blue', 570, 5430], ['red', 5430, 570]]) {
        g.fillStyle = t === 'blue' ? '#6e94a2' : '#85747c';
        g.beginPath(); g.arc(ox * k, oy * k, BASE_RADIUS * k * 1.15, 0, 6.3); g.fill();
        g.strokeStyle = t === 'blue' ? 'rgba(92, 180, 224, 0.55)' : 'rgba(224, 108, 108, 0.55)';
        g.lineWidth = 1.4; g.stroke();
      }
      // Three lanes in warm sunlit sage-olive
      for (const pts of Object.values(LANES)) {
        g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x * k, p.y * k) : g.moveTo(p.x * k, p.y * k)));
        g.strokeStyle = '#929b70';
        g.lineWidth = Math.max(4, LANE_WIDTH * k * 1.15);
        g.stroke();
      }
      // Continuous curved river with smooth gradient feathering into NW/SE lane corners & Mid ford
      const rPts = RIVER_PATH && RIVER_PATH.length >= 2 ? RIVER_PATH : [RIVER.from, RIVER.to];
      const rGrad = g.createLinearGradient(rPts[0].x * k, rPts[0].y * k, rPts[rPts.length - 1].x * k, rPts[rPts.length - 1].y * k);
      rGrad.addColorStop(0.0, 'rgba(22, 125, 168, 0)');
      rGrad.addColorStop(0.14, 'rgba(22, 125, 168, 0.96)');
      rGrad.addColorStop(0.45, 'rgba(22, 125, 168, 0.92)');
      rGrad.addColorStop(0.50, 'rgba(22, 125, 168, 0.25)');
      rGrad.addColorStop(0.55, 'rgba(22, 125, 168, 0.92)');
      rGrad.addColorStop(0.86, 'rgba(22, 125, 168, 0.96)');
      rGrad.addColorStop(1.0, 'rgba(22, 125, 168, 0)');
      g.strokeStyle = rGrad;
      g.lineWidth = Math.max(5, RIVER.width * k * 1.12);
      g.beginPath();
      rPts.forEach((p, i) => (i ? g.lineTo(p.x * k, p.y * k) : g.moveTo(p.x * k, p.y * k)));
      g.stroke();
      for (const e of Object.values(EPIC_SPOTS)) {
        g.fillStyle = 'rgba(22, 134, 180, 0.9)';
        g.beginPath(); g.arc(e.x * k, e.y * k, 250 * k, 0, 6.3); g.fill();
      }
      // Soft feathered Mid ford crossing
      const mGrad = g.createLinearGradient(2550 * k, 3450 * k, 3450 * k, 2550 * k);
      mGrad.addColorStop(0.0, 'rgba(146, 155, 112, 0.0)');
      mGrad.addColorStop(0.25, 'rgba(146, 155, 112, 0.85)');
      mGrad.addColorStop(0.75, 'rgba(146, 155, 112, 0.85)');
      mGrad.addColorStop(1.0, 'rgba(146, 155, 112, 0.0)');
      g.strokeStyle = mGrad;
      g.lineWidth = Math.max(4, LANE_WIDTH * k * 1.05);
      g.beginPath(); g.moveTo(2550 * k, 3450 * k); g.lineTo(3450 * k, 2550 * k); g.stroke();
      // Jungle camp markers and epic pit rings
      g.fillStyle = 'rgba(232, 188, 84, 0.72)';
      for (const c of CAMPS) {
        g.beginPath(); g.arc(c.x * k, c.y * k, c.type === 'big' ? 3.2 : 2.1, 0, 6.3); g.fill();
      }
      for (const e of Object.values(EPIC_SPOTS)) {
        g.strokeStyle = 'rgba(242, 118, 198, 0.78)';
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(e.x * k, e.y * k, Math.max(4, 155 * k), 0, 6.3); g.stroke();
      }
    }
    g.fillStyle = g.strokeStyle = 'rgba(42, 128, 64, 0.78)';
    for (const b of world.bushes || []) shape(b, 140);
    // Solid cliff islands in deep ink-navy + curved base ramparts in stone slate
    for (const w of world.walls || []) {
      const bw = !!w.baseWall;
      g.fillStyle = is5v5 ? (bw ? '#2c3e48' : '#0a141b') : '#596660';
      g.strokeStyle = g.fillStyle;
      shape(w, 60, is5v5 ? (bw ? '#6898b0' : '#283e46') : null);
    }
    const f = world.fountain || {};
    for (const t of ['blue', 'red']) {
      const p = f[t]; if (!p || p.x < 0) continue;
      g.fillStyle = teamCol(t); g.globalAlpha = 0.45; g.beginPath(); g.arc(p.x * k, p.y * k, 12, 0, 6.3); g.fill(); g.globalAlpha = 1;
    }
  }

  const toWorld = (e) => {
    const r = dyn.getBoundingClientRect();
    return { x: Math.max(0, Math.min(WW, ((e.clientX - r.left) / r.width) * WW)), y: Math.max(0, Math.min(WH, ((e.clientY - r.top) / r.height) * WH)) };
  };
  const send = (e, force) => {
    const now = performance.now(); if (!force && now - lastSend < MOVE_MIN_MS) return;
    lastSend = now; const w = toWorld(e);
    try { source.send('order', { type: 'move', x: w.x, y: w.y }); } catch (_) { /* source closed */ }
  };
  // With hooks (Input.js): right-click = move order, left-drag = camera peek, touch quick tap = move (as MobaHud).
  let pd = null;
  const down = (e) => {
    e.preventDefault(); e.stopPropagation(); try { dyn.setPointerCapture(e.pointerId); } catch (_) { /* ok */ }
    if (!hooks) { drag = true; send(e, true); return; }
    if (e.button === 2) { const w = toWorld(e); hooks.onTap(w.x, w.y); return; }
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    pd = { x: e.clientX, y: e.clientY, at: performance.now(), moved: false, touch };
    if (!touch) { const w = toWorld(e); hooks.onView(w.x, w.y, 'down'); }
  };
  const move = (e) => {
    if (!hooks) { if (drag) send(e, false); return; }
    if (!pd) return;
    if (Math.abs(e.clientX - pd.x) + Math.abs(e.clientY - pd.y) > 8) pd.moved = true;
    if (pd.touch && !pd.moved) return;
    const w = toWorld(e); hooks.onView(w.x, w.y, 'move');
  };
  const up = () => {
    drag = false; if (!hooks || !pd) return;
    const d = pd; pd = null;
    if (d.touch && !d.moved && performance.now() - d.at < 350) { const w = toWorld({ clientX: d.x, clientY: d.y }); hooks.onTap(w.x, w.y); return; }
    hooks.onView(0, 0, 'up');
  };
  const noCtx = (e) => e.preventDefault();
  dyn.addEventListener('pointerdown', down); dyn.addEventListener('pointermove', move);
  dyn.addEventListener('pointerup', up); dyn.addEventListener('pointercancel', up); dyn.addEventListener('contextmenu', noCtx);

  /** Camera footprint in world px: ctx.view {x,y,width,height} if given, else estimated from project() scale around `me`. */
  function viewBox(view, me) {
    if (view && Number.isFinite(view.width)) return view;
    if (!me || !project) return null;
    const a = project(me.x, me.y), bx = project(me.x + 200, me.y), by = project(me.x, me.y + 200);
    const sx = (bx.x - a.x) / 200, sy = (by.y - a.y) / 200;
    if (!(Math.abs(sx) > 1e-4) || !(Math.abs(sy) > 1e-4)) return null;
    const vw = innerWidth, vh = innerHeight;
    return { x: me.x - a.x / sx, y: me.y - a.y / sy, width: vw / sx, height: vh / Math.abs(sy) * Math.sign(sy) };
  }

  /** st = state, myId, mePos = predicted {x,y}|null, view = optional camera rect */
  function draw(st, myId, mePos, view) {
    layout();
    const g = dyn.getContext('2d'); g.clearRect(0, 0, size, size);
    if (!st) return;
    st.structures && st.structures.forEach((t) => {
      const r = t.kind === 'core' ? 6 : 4;
      g.fillStyle = t.alive ? teamCol(t.team) : '#4a4f58'; g.fillRect(t.x * k - r, t.y * k - r, r * 2, r * 2);
      g.strokeStyle = '#000'; g.lineWidth = 1; g.strokeRect(t.x * k - r, t.y * k - r, r * 2, r * 2);
    });
    st.units && st.units.forEach((u) => {
      if (!u.alive || u.kind === 'pet') return;
      const epic = u.kind === 'golden' || u.kind === 'deadline';
      g.fillStyle = u.team === 'blue' || u.team === 'red' ? teamCol(u.team) : (epic ? (u.kind === 'golden' ? '#ffd700' : '#ff3b3b') : '#d8b65a');
      const r = epic ? 4.5 : (u.campId ? 2 : 1.6);
      g.fillRect(u.x * k - r, u.y * k - r, r * 2, r * 2);
    });
    let me = mePos || null;
    st.champions && st.champions.forEach((c, id) => {
      if (c.dead) return;
      const mine = id === myId; if (mine && !me) me = c;
      const x = (mine && mePos ? mePos.x : c.x) * k, y = (mine && mePos ? mePos.y : c.y) * k, r = mine ? 5.5 : 4.5;
      g.fillStyle = mine ? '#ffffff' : '#000'; g.fillRect(x - r - 1.5, y - r - 1.5, r * 2 + 3, r * 2 + 3);
      g.fillStyle = teamCol(c.team); g.fillRect(x - r, y - r, r * 2, r * 2);
    });
    const v = viewBox(view, me);
    if (v) { g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1; g.strokeRect(v.x * k, v.y * k, v.width * k, v.height * k); }
    if (gpings.length) {
      const now = performance.now();
      for (let i = gpings.length - 1; i >= 0; i--) {
        const gp = gpings[i];
        if (now >= gp.until) { gpings.splice(i, 1); continue; }
        const f = Math.max(0, Math.min(1, (gp.until - now) / (gp.until - gp.born)));
        g.save();
        g.globalAlpha = 0.35 + 0.65 * f;
        g.strokeStyle = '#ff3b1f'; g.lineWidth = 3.5;
        g.beginPath(); g.moveTo(gp.x0 * k, gp.y0 * k); g.lineTo(gp.x1 * k, gp.y1 * k); g.stroke();
        g.strokeStyle = '#ffb347'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(gp.x0 * k, gp.y0 * k); g.lineTo(gp.x1 * k, gp.y1 * k); g.stroke();
        g.restore();
      }
    }
    if (aim) { g.strokeStyle = g.fillStyle = '#ff5e5e'; g.lineWidth = 2; g.beginPath(); g.arc(aim.x * k, aim.y * k, 6, 0, 6.3); g.stroke(); g.fillRect(aim.x * k - 1.5, aim.y * k - 1.5, 3, 3); }
  }

  return {
    el: root, draw, addGping, setAim(p) { aim = p ? { x: p.x, y: p.y } : null; },
    dispose() {
      if (typeof offFx === 'function') offFx();
      gpings.length = 0;
      dyn.removeEventListener('pointerdown', down); dyn.removeEventListener('pointermove', move);
      dyn.removeEventListener('pointerup', up); dyn.removeEventListener('pointercancel', up); dyn.removeEventListener('contextmenu', noCtx);
      root.remove();
    },
  };
}

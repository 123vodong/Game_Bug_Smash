// envFloor — bakes the textured ground of "The Open Office" into ONE canvas texture ('moba-floor').
// Everything here is drawn once with canvas 2D (pattern fills of CC0 Poly Haven textures, soft
// shadows via shadowBlur, radial light pools); per frame the GPU just shows one quad.
//   layers: office tile floor, legacy-code jungle (moss + server plates), recessed data-stream
//   river (bed + banks + glow), team base platforms, lit carpet lanes with curbs, camp pads,
//   epic pits, break-room fountains, baked wall / prop shadows, bush soil, light pools, vignette.
import {
  MAP_W, MAP_H, LANES, LANE_WIDTH, RIVER, FOUNTAIN, BASE_RADIUS, STRUCTURES, CAMPS, EPIC_SPOTS, WALLS, BUSHES,
} from '../../../shared/moba/map.js';
import { FOUNTAIN_RADIUS } from '../../../shared/moba/rules.js';
import { teamColor } from './mobaGfx.js';
import { texPattern } from './envAssets.js';

const JUNGLES = [
  [[650, 650], [3000, 3000], [650, 5350]], [[650, 5350], [3000, 3000], [5350, 5350]],
  [[650, 650], [5350, 650], [3000, 3000]], [[5350, 650], [5350, 5350], [3000, 3000]],
];
const WALL_H = { partition: 58, cubicles: 50, glass: 62, shelf: 72, cubicle: 46, desk: 26, rack: 74, copier: 40, plant: 26, cooler: 30, sofa: 30 };
const rgb = (c, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

export function bakeFloor(scene, { size, low, props = [] }) {
  const key = 'moba-floor';
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, size, size);
  const ctx = tex.getContext();
  const k = size / MAP_W;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const R = RIVER, rdx = R.to.x - R.from.x, rdy = R.to.y - R.from.y, rlen = Math.hypot(rdx, rdy);
  const lanes = Object.values(LANES);
  const cores = STRUCTURES.filter((s) => s.kind === 'core');

  const pat = (name, tint, scale, mix) => texPattern(ctx, name, tint, scale, mix);
  const line = (a, b, w, style) => { ctx.strokeStyle = style; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
  const poly = (pts, w, style, ox = 0, oy = 0) => {
    ctx.strokeStyle = style; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0].x + ox, pts[0].y + oy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + ox, pts[i].y + oy);
    ctx.stroke();
  };
  const tri = (t) => { ctx.beginPath(); ctx.moveTo(t[0][0], t[0][1]); ctx.lineTo(t[1][0], t[1][1]); ctx.lineTo(t[2][0], t[2][1]); ctx.closePath(); };
  /** Soft drop shadow of whatever `draw` paints (the shape itself lands off-canvas, only its shadow is visible). */
  const OFF = 20000;
  const soft = (draw, blur, alpha, dx = 0, dy = 0) => {
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${alpha})`; ctx.shadowBlur = blur * k;
    ctx.shadowOffsetX = (OFF + dx) * k; ctx.shadowOffsetY = dy * k;
    ctx.translate(-OFF, 0); draw(); ctx.restore();
  };
  const disc = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };
  const glowAt = (x, y, r, color, a, op = 'lighter') => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgb(color, a)); g.addColorStop(1, rgb(color, 0));
    ctx.save(); ctx.globalCompositeOperation = op; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
  };

  // 1 ── office floor: big grey slabs, graded to the dark navy palette.
  ctx.fillStyle = pat('floor', 0x7684a8, 0.9) || '#141924'; ctx.fillRect(0, 0, MAP_W, MAP_H);
  ctx.fillStyle = 'rgba(8,12,30,0.42)'; ctx.fillRect(0, 0, MAP_W, MAP_H);

  // 2 ── jungle quadrants: damp moss + leaf litter, darker toward the edges, legacy server plates at the camps.
  for (const t of JUNGLES) {
    ctx.fillStyle = pat('moss', 0x86aa8e, 1.15) || '#15221b'; tri(t); ctx.fill();
    ctx.save(); tri(t); ctx.clip();
    ctx.globalAlpha = 0.3; ctx.fillStyle = pat('leaves', 0x6f8a6a, 1.7) || '#000'; ctx.fillRect(0, 0, MAP_W, MAP_H); ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(4,10,16,0.16)'; ctx.fill();
    ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 90 * k; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 60; tri(t); ctx.stroke();
    ctx.restore();
  }

  // 3 ── bases: raised team platform on brushed concrete + server plate, team-lit.
  for (const c of cores) {
    const col = teamColor(c.team);
    soft(() => { ctx.fillStyle = '#000'; disc(c.x + 14, c.y + 20, BASE_RADIUS); ctx.fill(); }, 70, 0.7, 20, 26);
    ctx.fillStyle = pat('base', 0x7f88a2, 1.0) || '#162033'; disc(c.x, c.y, BASE_RADIUS); ctx.fill();
    ctx.save(); disc(c.x, c.y, BASE_RADIUS); ctx.clip();
    ctx.globalAlpha = 0.5; ctx.fillStyle = pat('plate', 0x74809c, 0.7) || '#000'; disc(c.x, c.y, BASE_RADIUS * 0.62); ctx.fill(); ctx.globalAlpha = 1;
    glowAt(c.x, c.y, BASE_RADIUS, col, 0.32, 'source-over');
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 50 * k; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 40; disc(c.x, c.y, BASE_RADIUS); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = rgb(col, 0.8); ctx.lineWidth = 12; disc(c.x, c.y, BASE_RADIUS - 8); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 4; disc(c.x, c.y, BASE_RADIUS - 24); ctx.stroke();
    // inner raised tier
    soft(() => { ctx.fillStyle = '#000'; disc(c.x, c.y, BASE_RADIUS * 0.5); ctx.fill(); }, 40, 0.6, 10, 16);
    ctx.fillStyle = pat('plate', 0x8995b4, 0.6) || '#1e2b42'; disc(c.x, c.y, BASE_RADIUS * 0.5); ctx.fill();
    glowAt(c.x, c.y, BASE_RADIUS * 0.5, col, 0.35, 'source-over');
    ctx.strokeStyle = rgb(col, 0.9); ctx.lineWidth = 7; disc(c.x, c.y, BASE_RADIUS * 0.5); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 3; disc(c.x, c.y, BASE_RADIUS * 0.5 - 12); ctx.stroke();
  }

  // 4 ── river: raised banks, deep recessed bed, glowing channel.
  const A = R.from, B = R.to, W = R.width;
  soft(() => line(A, B, W + 70, '#000'), 60, 0.8, 0, 0);
  line(A, B, W + 64, pat('base', 0x7a86a4, 0.9) || '#192b44');         // concrete banks
  line(A, B, W + 40, 'rgba(0,0,0,0.35)');
  line(A, B, W + 26, pat('base', 0x9aa6c4, 0.9) || '#192b44');          // coping stone
  line(A, B, W + 6, 'rgba(0,0,0,0.5)');
  line(A, B, W, pat('riverbed', 0x78a8d8, 0.8) || '#06233a');           // blue metal bed
  line(A, B, W, 'rgba(2,14,32,0.5)');
  line(A, B, W * 0.78, 'rgba(10,70,120,0.4)');
  line(A, B, W * 0.5, 'rgba(30,140,210,0.28)');
  line(A, B, W * 0.16, 'rgba(120,225,255,0.4)');
  const nx = -rdy / rlen, ny = rdx / rlen, hw = W / 2;
  for (const sg of [-1, 1]) {                                           // neon shoreline
    line({ x: A.x + nx * hw * sg, y: A.y + ny * hw * sg }, { x: B.x + nx * hw * sg, y: B.y + ny * hw * sg }, 5, 'rgba(90,210,255,0.85)');
    line({ x: A.x + nx * (hw - 18) * sg, y: A.y + ny * (hw - 18) * sg }, { x: B.x + nx * (hw - 18) * sg, y: B.y + ny * (hw - 18) * sg }, 26, 'rgba(0,10,25,0.38)');
  }
  line(A, B, W + 260, 'rgba(57,194,255,0.045)');

  // 5 ── lanes: soft shadow, stone curb, plush carpet, inlaid light strip.
  for (const pts of lanes) soft(() => poly(pts, LANE_WIDTH + 36, '#000'), 40, 0.7, 6, 12);
  for (const pts of lanes) poly(pts, LANE_WIDTH + 28, pat('base', 0x8a96b6, 0.8) || '#4a5a80', -2, -3);
  for (const pts of lanes) poly(pts, LANE_WIDTH + 16, 'rgba(0,0,0,0.45)');
  for (const pts of lanes) poly(pts, LANE_WIDTH, pat('carpet', 0xd0daff, 0.9, 1) || '#2c3650');
  for (const pts of lanes) { poly(pts, LANE_WIDTH, 'rgba(60,90,170,0.2)'); }
  // carpet edge darkening (inner shadow) = dark wide stroke with the carpet clipped back on top is costly; fake with 2 inset strokes
  for (const pts of lanes) { poly(pts, LANE_WIDTH - 8, 'rgba(255,255,255,0.05)'); poly(pts, LANE_WIDTH - 60, 'rgba(70,100,190,0.12)'); }
  ctx.setLineDash([46, 40]);
  for (const pts of lanes) poly(pts, 5, 'rgba(150,200,255,0.5)');
  ctx.setLineDash([]);

  // 5b ── structure plinths: bolted steel plates with a team-lit rim (tier 3 / core get extra rings).
  for (const st of STRUCTURES) {
    const col = teamColor(st.team), core = st.kind === 'core', r = core ? 150 : 82, tier = core ? 4 : st.tier;
    soft(() => { ctx.fillStyle = '#000'; disc(st.x, st.y + 4, r); ctx.fill(); }, 20, 0.7, 4, 8);
    ctx.fillStyle = pat('plate', 0x808aa6, 0.5) || '#222'; disc(st.x, st.y, r); ctx.fill();
    glowAt(st.x, st.y, r, col, 0.4, 'source-over');
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 8; disc(st.x, st.y, r); ctx.stroke();
    ctx.strokeStyle = rgb(col, 0.95); ctx.lineWidth = 5; disc(st.x, st.y, r - 6); ctx.stroke();
    for (let i = 1; i < tier; i++) { ctx.strokeStyle = rgb(col, 0.45); ctx.lineWidth = 2.5; disc(st.x, st.y, r - 6 - i * (r * 0.16)); ctx.stroke(); }
  }

  // 6 ── camp pads (server plate discs) + epic pits (sunk dark pools with a coloured rim).
  for (const c of CAMPS) {
    soft(() => { ctx.fillStyle = '#000'; disc(c.x, c.y, 118); ctx.fill(); }, 24, 0.6, 3, 5);
    ctx.fillStyle = pat('plate', 0x6a7488, 0.55) || '#222'; disc(c.x, c.y, 112); ctx.fill();
    ctx.strokeStyle = 'rgba(224,184,74,0.6)'; ctx.lineWidth = 5; ctx.setLineDash([26, 18]); disc(c.x, c.y, 100); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 8; disc(c.x, c.y, 116); ctx.stroke();
  }
  for (const [kind, p] of Object.entries(EPIC_SPOTS)) {
    const col = kind === 'golden' ? 0xffd700 : 0xff4a4a;
    soft(() => { ctx.fillStyle = '#000'; disc(p.x, p.y, 250); ctx.fill(); }, 40, 0.7, 6, 10);
    ctx.fillStyle = pat('plate', 0x586078, 0.7) || '#111'; disc(p.x, p.y, 246); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; disc(p.x, p.y, 220); ctx.fill();
    glowAt(p.x, p.y, 240, col, 0.38, 'lighter');
    ctx.strokeStyle = rgb(col, 0.85); ctx.lineWidth = 8; disc(p.x, p.y, 240); ctx.stroke();
    ctx.strokeStyle = rgb(col, 0.4); ctx.lineWidth = 3; disc(p.x, p.y, 200); ctx.stroke();
  }

  // 7 ── break-room fountains: round pool in a stone rim.
  for (const team of ['blue', 'red']) {
    const f = FOUNTAIN[team], col = teamColor(team), r = FOUNTAIN_RADIUS;
    glowAt(f.x, f.y, r * 1.1, col, 0.2, 'lighter');
    ctx.strokeStyle = rgb(col, 0.7); ctx.lineWidth = 8; disc(f.x, f.y, r); ctx.stroke();
    ctx.setLineDash([30, 22]); ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 3; disc(f.x, f.y, r - 24); ctx.stroke(); ctx.setLineDash([]);
    soft(() => { ctx.fillStyle = '#000'; disc(f.x, f.y, 142); ctx.fill(); }, 24, 0.6, 4, 8);
    ctx.fillStyle = pat('base', 0xb8c4e0, 0.6) || '#999'; disc(f.x, f.y, 140); ctx.fill();
    ctx.fillStyle = pat('riverbed', 0x80b8e8, 0.5) || '#06233a'; disc(f.x, f.y, 112); ctx.fill();
    glowAt(f.x, f.y, 112, 0x66d8ff, 0.55, 'lighter');
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 6; disc(f.x, f.y, 112); ctx.stroke();
    ctx.strokeStyle = rgb(col, 0.9); ctx.lineWidth = 4; disc(f.x, f.y, 138); ctx.stroke();
  }

  // 8 ── bush soil, wall + prop contact shadows (light from the top-left).
  for (const b of BUSHES) {
    if (b.kind === 'circle') { ctx.fillStyle = 'rgba(30,70,40,0.5)'; disc(b.x, b.y, b.r + 14); ctx.fill(); ctx.fillStyle = 'rgba(12,28,18,0.9)'; disc(b.x, b.y, b.r); ctx.fill(); continue; }
    line({ x: b.x1, y: b.y1 }, { x: b.x2, y: b.y2 }, b.w + 24, 'rgba(30,70,40,0.5)');
    line({ x: b.x1, y: b.y1 }, { x: b.x2, y: b.y2 }, b.w, 'rgba(12,28,18,0.9)');
  }
  for (const w of WALLS) {
    const H = WALL_H[w.look] ?? 30, glass = w.look === 'glass';
    if (w.kind === 'circle') {
      soft(() => { ctx.fillStyle = '#000'; disc(w.x, w.y, w.r + 4); ctx.fill(); }, 22, 0.6, H * 0.4, 8);
    } else if (w.kind === 'seg') {
      soft(() => line({ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }, w.w + 6, '#000'), 26, glass ? 0.25 : 0.62, H * 0.45, 10);
    } else {
      soft(() => { ctx.fillStyle = '#000'; ctx.fillRect(w.x, w.y, w.w, w.h); }, 24, 0.6, H * 0.4, 8);
    }
  }
  for (const p of props) {
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.beginPath(); ctx.ellipse(p.x + p.w * 0.06, p.y + 2, p.w * 0.44, p.w * 0.15, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  // 9 ── lighting: warm overhead pools along the lanes, team glow at structures, vignette on the edges.
  if (!low) {
    for (const pts of lanes) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.round(L / 520));
        for (let j = 0; j < n; j++) { const t = (j + 0.5) / n; glowAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 230, 0xfff0c8, 0.085); }
      }
    }
    for (const s of STRUCTURES) glowAt(s.x, s.y, s.kind === 'core' ? 340 : 190, teamColor(s.team), s.kind === 'core' ? 0.22 : 0.16);
  }
  const vg = (x0, y0, x1, y1, rx, ry, rw, rh) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(2,5,12,0.62)'); g.addColorStop(1, 'rgba(2,5,12,0)');
    ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
  };
  vg(0, 0, 340, 0, 0, 0, 340, MAP_H); vg(MAP_W, 0, MAP_W - 340, 0, MAP_W - 340, 0, 340, MAP_H);
  vg(0, 0, 0, 340, 0, 0, MAP_W, 340); vg(0, MAP_H, 0, MAP_H - 340, 0, MAP_H - 340, MAP_W, 340);
  ctx.strokeStyle = 'rgba(57,194,255,0.55)'; ctx.lineWidth = 14; ctx.strokeRect(0, 0, MAP_W, MAP_H);
  tex.refresh();
  return { key, k };
}

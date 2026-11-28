// tools/playtest/nav_check.mjs — validate Team Mode walls (shared/moba/map.js WALLS)
// against lanes, river, structures, camps, epics and fountains; check that
// everything important is reachable; time the pathfinder; print an ASCII map.
//   node tools/playtest/nav_check.mjs [--map]
import {
  WALLS, BUSHES, LANES, STRUCTURES, CAMPS, EPIC_SPOTS, FOUNTAIN, RIVER, MAP_W, MAP_H,
  STRUCTURE_RADIUS, distToSeg, CHAMP_RADIUS,
} from '../../shared/moba/map.js';
import { wallDist, findPath, pathLength, isBlocked, nearestFree, segmentClear, clipMove, pushOut, moveSlide, pointInPoly } from '../../shared/moba/nav.js';
import { Mover } from '../../server/game/moba/Mover.js';

const problems = [];
// Clearances tuned for organic cliffs + curved Baron/Dragon pit horseshoes + 3-gate base ramparts.
const CLEAR = { lane: 175, river: 135, struct: 185, camp: 125, epic: 110, fountain: 880, gap: 105 };

// Distance from a wall's surface to a point / polyline.
const wPoint = (w, p) => wallDist(p.x, p.y, w);
function wPolyline(w, pts) {
  // sample the polyline densely (walls are small vs lanes)
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 10);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      best = Math.min(best, wallDist(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, w));
    }
  }
  return best;
}

for (const w of WALLS) {
  const tag = w.kind === 'poly' ? `${w.id}(${w.look} poly ${w.pts.length}v)` : w.kind === 'seg' ? `${w.id}(${w.look} seg ${Math.round(w.x1)},${Math.round(w.y1)}→${Math.round(w.x2)},${Math.round(w.y2)})` : `${w.id}(${w.look} ${w.kind} @${Math.round(w.x)},${Math.round(w.y)})`;
  for (const [lane, pts] of Object.entries(LANES)) {
    const d = wPolyline(w, pts);
    if (d < CLEAR.lane) problems.push(`${tag} too close to ${lane} lane: ${d.toFixed(0)} < ${CLEAR.lane}`);
  }
  const dr = wPolyline(w, [RIVER.from, RIVER.to]);
  if (dr < CLEAR.river) problems.push(`${tag} too close to river axis: ${dr.toFixed(0)} < ${CLEAR.river}`);
  for (const s of STRUCTURES) {
    const d = wPoint(w, s) - STRUCTURE_RADIUS[s.kind];
    if (d < CLEAR.struct - 70) problems.push(`${tag} too close to ${s.id}: ${d.toFixed(0)}`);
  }
  for (const c of CAMPS) {
    const d = wPoint(w, c);
    if (d < CLEAR.camp) problems.push(`${tag} too close to camp ${c.id}: ${d.toFixed(0)} < ${CLEAR.camp}`);
  }
  for (const [k, e] of Object.entries(EPIC_SPOTS)) {
    const d = wPoint(w, e);
    if (d < CLEAR.epic) problems.push(`${tag} too close to epic ${k}: ${d.toFixed(0)} < ${CLEAR.epic}`);
  }
  for (const [t, f] of Object.entries(FOUNTAIN)) {
    const d = wPoint(w, f);
    if (d < CLEAR.fountain) problems.push(`${tag} too close to ${t} fountain: ${d.toFixed(0)}`);
  }
  const pts = w.kind === 'poly' ? w.pts.map(([x, y]) => ({ x, y })) : w.kind === 'seg' ? [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }] : [{ x: w.x, y: w.y }];
  if (pts.some((q) => q.x < 0 || q.y < 0 || q.x > MAP_W || q.y > MAP_H)) problems.push(`${tag} outside the map`);
}
// Narrow gaps between walls (units would snag): gaps must be 0 (touching) or ≥ CLEAR.gap.
for (let i = 0; i < WALLS.length; i++) {
  for (let j = i + 1; j < WALLS.length; j++) {
    const a = WALLS[i], b = WALLS[j];
    // approximate surface gap by sampling b's boundary
    let gap = Infinity;
    const samples = b.kind === 'poly'
      ? (() => { const s2 = []; for (let k = 0; k < b.pts.length; k++) { const p = b.pts[k], q = b.pts[(k + 1) % b.pts.length]; for (let u = 0; u < 6; u++) { const t = u / 6; s2.push({ x: p[0] + (q[0] - p[0]) * t, y: p[1] + (q[1] - p[1]) * t }); } } return s2; })()
      : b.kind === 'seg'
      ? (() => { const s2 = []; const L = Math.hypot(b.x2 - b.x1, b.y2 - b.y1) || 1, nx = -(b.y2 - b.y1) / L, ny = (b.x2 - b.x1) / L; for (let k = 0; k <= 40; k++) { const t = k / 40, cx = b.x1 + (b.x2 - b.x1) * t, cy = b.y1 + (b.y2 - b.y1) * t; s2.push({ x: cx + nx * b.w / 2, y: cy + ny * b.w / 2 }, { x: cx - nx * b.w / 2, y: cy - ny * b.w / 2 }); } return s2; })()
      : b.kind === 'circle'
      ? Array.from({ length: 32 }, (_, k) => ({ x: b.x + Math.cos(k / 32 * 6.283) * b.r, y: b.y + Math.sin(k / 32 * 6.283) * b.r }))
      : (() => { const s = []; for (let k = 0; k <= 20; k++) { const t = k / 20; s.push({ x: b.x + b.w * t, y: b.y }, { x: b.x + b.w * t, y: b.y + b.h }, { x: b.x, y: b.y + b.h * t }, { x: b.x + b.w, y: b.y + b.h * t }); } return s; })();
    for (const p of samples) gap = Math.min(gap, wallDist(p.x, p.y, a));
    if (gap > 1 && gap < CLEAR.gap) problems.push(`gap ${a.id}↔${b.id} = ${gap.toFixed(0)} (< ${CLEAR.gap}, units would snag)`);
  }
}

// Symmetry fairness: every wall has either a diagonal mirror twin (y,x) OR a 180-deg rotational twin (W-x, H-y).
const key = (w) => w.kind === 'poly' ? `p:${w.pts.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).sort().join(';')}` : w.kind === 'seg' ? `s${[Math.round(w.x1), Math.round(w.y1), Math.round(w.x2), Math.round(w.y2)].join(',')},${w.w}` : w.kind === 'circle' ? `c${Math.round(w.x)},${Math.round(w.y)},${w.r}` : `r${Math.round(w.x)},${Math.round(w.y)},${w.w},${w.h}`;
const mkey = (w) => w.kind === 'poly' ? `p:${w.pts.map(([x, y]) => `${Math.round(y)},${Math.round(x)}`).sort().join(';')}` : w.kind === 'seg' ? `s${[Math.round(w.y1), Math.round(w.x1), Math.round(w.y2), Math.round(w.x2)].join(',')},${w.w}` : w.kind === 'circle' ? `c${Math.round(w.y)},${Math.round(w.x)},${w.r}` : `r${Math.round(w.y)},${Math.round(w.x)},${w.h},${w.w}`;
const rkey = (w) => w.kind === 'poly' ? `p:${w.pts.map(([x, y]) => `${Math.round(MAP_W - x)},${Math.round(MAP_H - y)}`).sort().join(';')}` : w.kind === 'seg' ? `s${[Math.round(MAP_W - w.x1), Math.round(MAP_H - w.y1), Math.round(MAP_W - w.x2), Math.round(MAP_H - w.y2)].join(',')},${w.w}` : w.kind === 'circle' ? `c${Math.round(MAP_W - w.x)},${Math.round(MAP_H - w.y)},${w.r}` : `r${Math.round(MAP_W - (w.x + w.w))},${Math.round(MAP_H - (w.y + w.h))},${w.w},${w.h}`;
const keys = new Set(WALLS.map(key));
for (const w of WALLS) if (!keys.has(mkey(w)) && !keys.has(rkey(w))) problems.push(`${w.id} has no symmetric twin`);

// Reachability from each fountain (grid path ends where asked, within a radius).
const r = CHAMP_RADIUS;
const targets = [
  ...STRUCTURES.map((s) => ({ name: s.id, x: s.x + (s.team === 'blue' ? 140 : -140), y: s.y })),
  ...CAMPS.map((c) => ({ name: c.id, x: c.x, y: c.y })),
  ...Object.entries(EPIC_SPOTS).map(([k, e]) => ({ name: k, x: e.x, y: e.y })),
  ...Object.entries(FOUNTAIN).map(([k, f]) => ({ name: `${k}_fountain`, x: f.x, y: f.y })),
];
let slow = 0, total = 0, n = 0;
for (const [team, f] of Object.entries(FOUNTAIN)) {
  for (const t of targets) {
    const goal = nearestFree(t.x, t.y, r);
    const t0 = performance.now();
    const path = findPath(f.x, f.y, t.x, t.y, r);
    const ms = performance.now() - t0;
    total += ms; n++; slow = Math.max(slow, ms);
    const end = path[path.length - 1];
    if (Math.hypot(end.x - goal.x, end.y - goal.y) > 2) problems.push(`${team} fountain → ${t.name}: path ends off-goal`);
    // every leg must be clear (smoothing correctness)
    let ax = f.x, ay = f.y, bad = 0;
    for (const p of path) { if (!segmentClear(ax, ay, p.x, p.y, r - 3)) bad++; ax = p.x; ay = p.y; }
    if (bad) problems.push(`${team} fountain → ${t.name}: ${bad} leg(s) clip a wall`);
    const straight = Math.hypot(t.x - f.x, t.y - f.y);
    if (pathLength(f.x, f.y, path) > straight * 1.6 + 400) problems.push(`${team} → ${t.name}: big detour (${pathLength(f.x, f.y, path).toFixed(0)} vs ${straight.toFixed(0)})`);
  }
}

// Random stress: 2000 random queries, all must produce clear legs.
let rnd = 12345;
const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
let rTotal = 0, rMax = 0, rBad = 0;
for (let i = 0; i < 2000; i++) {
  const a = nearestFree(rand() * MAP_W, rand() * MAP_H, r), b = { x: rand() * MAP_W, y: rand() * MAP_H };
  const t0 = performance.now();
  const path = findPath(a.x, a.y, b.x, b.y, r);
  const ms = performance.now() - t0;
  rTotal += ms; rMax = Math.max(rMax, ms);
  let ax = a.x, ay = a.y;
  for (const p of path) { if (!segmentClear(ax, ay, p.x, p.y, r - 3)) { rBad++; break; } ax = p.x; ay = p.y; }
}
if (rBad) problems.push(`${rBad}/2000 random paths have a leg clipping a wall`);

// Sanity of the other helpers.
const w0 = WALLS[0];
const inside = (() => {
  if (w0.kind === 'poly') {
    const [x0, y0, x1, y1] = [
      Math.min(...w0.pts.map((p) => p[0])), Math.min(...w0.pts.map((p) => p[1])),
      Math.max(...w0.pts.map((p) => p[0])), Math.max(...w0.pts.map((p) => p[1])),
    ];
    let best = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, d: 1e9 };
    for (let gy = y0; gy <= y1; gy += 25) {
      for (let gx = x0; gx <= x1; gx += 25) {
        const d = wallDist(gx, gy, w0);
        if (d < best.d) best = { x: gx, y: gy, d };
      }
    }
    return { x: best.x, y: best.y };
  }
  return w0.kind === 'seg' ? { x: (w0.x1 + w0.x2) / 2, y: (w0.y1 + w0.y2) / 2 } : w0.kind === 'circle' ? { x: w0.x, y: w0.y } : { x: w0.x + w0.w / 2, y: w0.y + w0.h / 2 };
})();
const po = pushOut(inside.x, inside.y, r);
if (isBlocked(po.x, po.y, r - 0.01)) problems.push('pushOut left a circle inside a wall');
const cm = clipMove(inside.x - 600, inside.y, inside.x, inside.y, r);
if (!cm.hit || isBlocked(cm.x, cm.y, r - 0.01)) problems.push('clipMove did not stop before a wall');

// Sanity of BUSHES: no bush center may sit inside any wall.
for (const b of BUSHES) {
  const bx = b.kind === 'circle' ? b.x : (b.x1 + b.x2) * 0.5;
  const by = b.kind === 'circle' ? b.y : (b.y1 + b.y2) * 0.5;
  for (const w of WALLS) {
    const d = wallDist(bx, by, w);
    if (d < 10) problems.push(`bush ${b.id} clips wall ${w.id} (dist=${d.toFixed(1)})`);
  }
}

// Regression: moveSlide, findPath across walls, and Mover clicking inside walls never cross walls or jitter endlessly.
{
  const segInt = (ax, ay, bx, by, cx, cy, dx, dy) => {
    const cr = (x1, y1, x2, y2) => x1 * y2 - y1 * x2;
    const d1 = cr(bx - ax, by - ay, cx - ax, cy - ay), d2 = cr(bx - ax, by - ay, dx - ax, dy - ay);
    const d3 = cr(dx - cx, dy - cy, ax - cx, ay - cy), d4 = cr(dx - cx, dy - cy, bx - cx, by - cy);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  };
  const segHitsAnyWall = (x0, y0, x1, y1) => {
    for (const w of WALLS) {
      if (w.kind !== 'poly') continue;
      const pts = w.pts;
      if (pointInPoly((x0 + x1) * 0.5, (y0 + y1) * 0.5, pts)) return w.id;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        if (segInt(x0, y0, x1, y1, pts[j][0], pts[j][1], pts[i][0], pts[i][1])) return w.id;
      }
    }
    return null;
  };

  let slideCross = 0, crossPathBad = 0, moverCross = 0, moverJitterFail = 0;
  const mover = new Mover();
  for (const w of WALLS) {
    if (w.kind !== 'poly') continue;
    const pts = w.pts;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const mx = (a[0] + b[0]) * 0.5, my = (a[1] + b[1]) * 0.5;
      const vx = b[0] - a[0], vy = b[1] - a[1], l = Math.hypot(vx, vy) || 1;
      let nx = -vy / l, ny = vx / l;
      if (pointInPoly(mx + nx * 2, my + ny * 2, pts)) { nx = -nx; ny = -ny; }
      const sx = mx + nx * (r + 1), sy = my + ny * (r + 1);
      if (isBlocked(sx, sy, r)) continue;

      for (const st of [15, 30, 50, 80]) {
        const m = moveSlide(sx, sy, sx - nx * st, sy - ny * st, r);
        if (segHitsAnyWall(sx, sy, m.x, m.y)) { slideCross++; break; }
      }

      const gx = mx - nx * 250, gy = my - ny * 250;
      const path = findPath(sx, sy, gx, gy, r);
      let px = sx, py = sy;
      for (const wp of path) {
        if (!segmentClear(px, py, wp.x, wp.y, r - 2)) { crossPathBad++; break; }
        px = wp.x; py = wp.y;
      }

      if (i % 3 === 0) {
        const ix = mx - nx * 25, iy = my - ny * 25;
        const e = { x: sx, y: sy, radius: r, etype: 'champ', nav: null, navPathAt: 0 };
        let now = 1000, ox = sx, oy = sy, activeTicks = 0, done = false;
        for (let tick = 0; tick < 80; tick++) {
          now += 50;
          mover.beginTick();
          done = mover.move(e, ix, iy, 360, 50, now);
          if (segHitsAnyWall(ox, oy, e.x, e.y)) { moverCross++; break; }
          if (Math.hypot(e.x - ox, e.y - oy) > 0.1) activeTicks++;
          ox = e.x; oy = e.y;
          if (done) break;
        }
        if (!done && activeTicks > 60) moverJitterFail++;
      }
    }
  }
  if (slideCross) problems.push(`moveSlide crossed wall ${slideCross} time(s)`);
  if (crossPathBad) problems.push(`findPath across walls had ${crossPathBad} clipping leg(s)`);
  if (moverCross) problems.push(`Mover.move clicking inside wall crossed ${moverCross} time(s)`);
  if (moverJitterFail) problems.push(`Mover.move clicking inside wall jittered endlessly on ${moverJitterFail} edge(s)`);
}

console.log(`walls: ${WALLS.length} · fountain paths: ${n} avg ${(total / n).toFixed(2)} ms max ${slow.toFixed(2)} ms · random: avg ${(rTotal / 2000).toFixed(3)} ms max ${rMax.toFixed(2)} ms`);

if (process.argv.includes('--map')) {
  const S = 100; // px per char
  const lines = [];
  for (let y = 0; y < MAP_H; y += S) {
    let row = '';
    for (let x = 0; x < MAP_W; x += S) {
      const cx = x + S / 2, cy = y + S / 2;
      let ch = ' ';
      if (Math.abs(cx - cy) / Math.SQRT2 < RIVER.width / 2) ch = '~';
      for (const pts of Object.values(LANES)) for (let i = 0; i < pts.length - 1; i++) if (distToSeg(cx, cy, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) < 80) ch = '.';
      if (isBlocked(cx, cy, 0) || isBlocked(cx, cy, 35)) ch = '#';
      for (const c of CAMPS) if (Math.hypot(c.x - cx, c.y - cy) < 70) ch = c.type[0];
      for (const s of STRUCTURES) if (Math.hypot(s.x - cx, s.y - cy) < 70) ch = s.kind === 'core' ? 'C' : 'T';
      for (const [k, e] of Object.entries(EPIC_SPOTS)) if (Math.hypot(e.x - cx, e.y - cy) < 90) ch = k === 'golden' ? 'G' : 'D';
      for (const f of Object.values(FOUNTAIN)) if (Math.hypot(f.x - cx, f.y - cy) < 90) ch = 'F';
      row += ch;
    }
    lines.push(row);
  }
  console.log(lines.join('\n'));
}

if (problems.length) {
  console.log(`\n❌ ${problems.length} problem(s):\n - ` + problems.join('\n - '));
  process.exit(1);
}
console.log('✅ walls + nav OK');

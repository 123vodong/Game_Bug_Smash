// shared/moba/nav.js — wall collision + pathfinding for Team Mode.
// Pure functions over map.js WALLS; imported by the server (authoritative
// movement, bots, dashes) and the client (OfflineSim, aim previews).
//
//   isBlocked(x, y, r)              circle of radius r overlaps a wall?
//   pushOut(x, y, r)                → {x, y} nearest position not overlapping any wall (slide/resolve)
//   segmentClear(x0, y0, x1, y1, r) a circle of radius r can travel the straight segment?
//   clipMove(x0, y0, x1, y1, r)     → {x, y, hit} farthest free point along the segment (dash/knockback)
//   nearestFree(x, y, r)            → {x, y} closest free spot (blink landing, clicks inside walls)
//   findPath(x0, y0, x1, y1, r)     → [{x, y}, …] waypoints AFTER the start, ending at the goal
//                                     (or at nearestFree(goal)). Straight line when clear (no A*).
//
// Grid A* (CELL px, 8-neighbour, no corner cutting) + line-of-sight smoothing.
// The grid is built once per radius on first use (~10k cells).
import { MAP_W, MAP_H, WALLS, distToSeg } from './map.js';

export const NAV_CELL = 60;
const GW = Math.ceil(MAP_W / NAV_CELL);
const GH = Math.ceil(MAP_H / NAV_CELL);
const N = GW * GH;
const EPS = 0.5;
const GRID_MARGIN = 6;            // px of extra clearance baked into the A* grid

// ── primitive distances ──
function rectDist(px, py, w) {
  const dx = Math.max(w.x - px, 0, px - (w.x + w.w));
  const dy = Math.max(w.y - py, 0, py - (w.y + w.h));
  return Math.hypot(dx, dy);
}
/** Distance from a point to a wall's surface (≤ 0 inside a circle / seg; 0 inside a rect). */
export function wallDist(px, py, w) {
  if (w.kind === 'circle') return Math.hypot(px - w.x, py - w.y) - w.r;
  if (w.kind === 'seg') return distToSeg(px, py, w.x1, w.y1, w.x2, w.y2) - w.w / 2;
  return rectDist(px, py, w);
}
/** Axis-aligned bounds of a wall: [x0, y0, x1, y1]. */
export function wallBounds(w) {
  if (w.kind === 'circle') return [w.x - w.r, w.y - w.r, w.x + w.r, w.y + w.r];
  if (w.kind === 'seg') {
    const h = w.w / 2;
    return [Math.min(w.x1, w.x2) - h, Math.min(w.y1, w.y2) - h, Math.max(w.x1, w.x2) + h, Math.max(w.y1, w.y2) + h];
  }
  return [w.x, w.y, w.x + w.w, w.y + w.h];
}
const cross = (ax, ay, bx, by) => ax * by - ay * bx;
/** Do segments AB and CD intersect? */
function segsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = cross(bx - ax, by - ay, cx - ax, cy - ay), d2 = cross(bx - ax, by - ay, dx - ax, dy - ay);
  const d3 = cross(dx - cx, dy - cy, ax - cx, ay - cy), d4 = cross(dx - cx, dy - cy, bx - cx, by - cy);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
function segSegDist(ax, ay, bx, by, cx, cy, dx, dy) {
  if (segsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(distToSeg(ax, ay, cx, cy, dx, dy), distToSeg(bx, by, cx, cy, dx, dy),
    distToSeg(cx, cy, ax, ay, bx, by), distToSeg(dx, dy, ax, ay, bx, by));
}

/** Liang–Barsky: does segment (x0,y0)→(x1,y1) touch the rect? */
function segHitsRect(x0, y0, x1, y1, w) {
  const dx = x1 - x0, dy = y1 - y0;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - w.x, w.x + w.w - x0, y0 - w.y, w.y + w.h - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}
/** Exact distance between a segment and a wall (0 if they touch/overlap; < 0 never for rects). */
function segWallDist(x0, y0, x1, y1, w) {
  if (w.kind === 'circle') return distToSeg(w.x, w.y, x0, y0, x1, y1) - w.r;
  if (w.kind === 'seg') return segSegDist(x0, y0, x1, y1, w.x1, w.y1, w.x2, w.y2) - w.w / 2;
  if (segHitsRect(x0, y0, x1, y1, w)) return 0;
  // Disjoint convex shapes: the minimum is at a segment endpoint or a rect corner.
  let d = Math.min(rectDist(x0, y0, w), rectDist(x1, y1, w));
  const xs = [w.x, w.x + w.w], ys = [w.y, w.y + w.h];
  for (const cx of xs) for (const cy of ys) d = Math.min(d, distToSeg(cx, cy, x0, y0, x1, y1));
  return d;
}

// ── public queries ──
const fin = (...v) => v.every(Number.isFinite);

export function isBlocked(x, y, r = 0) {
  if (!fin(x, y)) return false;
  for (let i = 0; i < WALLS.length; i++) if (wallDist(x, y, WALLS[i]) < r) return true;
  return false;
}

/** Resolve overlap: push the circle out of every wall it overlaps (a few passes for corners). */
export function pushOut(x, y, r = 0) {
  if (!fin(x, y)) return { x, y };
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let i = 0; i < WALLS.length; i++) {
      const w = WALLS[i];
      if (w.kind === 'circle') {
        const dx = x - w.x, dy = y - w.y;
        const d = Math.hypot(dx, dy);
        const need = w.r + r;
        if (d >= need) continue;
        if (d < 0.01) { x = w.x + need + EPS; }
        else { x = w.x + (dx / d) * (need + EPS); y = w.y + (dy / d) * (need + EPS); }
        moved = true;
      } else if (w.kind === 'seg') {
        // Closest point on the wall's center line; push out to half-thickness + r.
        const vx = w.x2 - w.x1, vy = w.y2 - w.y1, l2 = vx * vx + vy * vy || 1;
        const t = Math.max(0, Math.min(1, ((x - w.x1) * vx + (y - w.y1) * vy) / l2));
        const cx = w.x1 + vx * t, cy = w.y1 + vy * t;
        const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
        const need = w.w / 2 + r;
        if (d >= need) continue;
        if (d > 0.01) { x = cx + (dx / d) * (need + EPS); y = cy + (dy / d) * (need + EPS); }
        else { const l = Math.sqrt(l2); x = cx - (vy / l) * (need + EPS); y = cy + (vx / l) * (need + EPS); }
        moved = true;
      } else {
        const cx = Math.max(w.x, Math.min(x, w.x + w.w));
        const cy = Math.max(w.y, Math.min(y, w.y + w.h));
        const dx = x - cx, dy = y - cy;
        const d = Math.hypot(dx, dy);
        if (d >= r) continue;
        if (d > 0.01) {
          x = cx + (dx / d) * (r + EPS); y = cy + (dy / d) * (r + EPS);
        } else {
          // Center inside the rect: exit through the nearest side.
          const opts = [
            [x - w.x, w.x - r - EPS, y], [w.x + w.w - x, w.x + w.w + r + EPS, y],
            [y - w.y, x, w.y - r - EPS], [w.y + w.h - y, x, w.y + w.h + r + EPS],
          ];
          let best = opts[0];
          for (const o of opts) if (o[0] < best[0]) best = o;
          if (best === opts[0] || best === opts[1]) x = best[1]; else y = best[2];
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { x, y };
}

export function segmentClear(x0, y0, x1, y1, r = 0) {
  if (!fin(x0, y0, x1, y1)) return false;
  const minX = Math.min(x0, x1) - r, maxX = Math.max(x0, x1) + r;
  const minY = Math.min(y0, y1) - r, maxY = Math.max(y0, y1) + r;
  for (let i = 0; i < WALLS.length; i++) {
    const w = WALLS[i];
    const [wx0, wy0, wx1, wy1] = wallBounds(w);
    if (wx1 < minX || wx0 > maxX || wy1 < minY || wy0 > maxY) continue;
    if (segWallDist(x0, y0, x1, y1, w) < r) return false;
  }
  return true;
}

/** Farthest point from (x0,y0) toward (x1,y1) a circle of radius r reaches before a wall. */
export function clipMove(x0, y0, x1, y1, r = 0) {
  if (!fin(x0, y0)) return { x: x0, y: y0, hit: false };
  if (!fin(x1, y1)) return { x: x0, y: y0, hit: false };
  if (isBlocked(x0, y0, r)) { const p = pushOut(x0, y0, r); x0 = p.x; y0 = p.y; }
  if (segmentClear(x0, y0, x1, y1, r)) return { x: x1, y: y1, hit: false };
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(len / 8));
  let lx = x0, ly = y0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
    if (isBlocked(px, py, r)) return { x: lx, y: ly, hit: true };
    lx = px; ly = py;
  }
  return { x: x1, y: y1, hit: false };
}

/** Closest free position to (x, y) for a circle of radius r. */
export function nearestFree(x, y, r = 0) {
  if (!fin(x, y)) return { x, y };
  if (!isBlocked(x, y, r)) return { x, y };
  const p = pushOut(x, y, r);
  if (!isBlocked(p.x, p.y, r)) return p;
  // Pushed into another wall (tight corner): ring search.
  for (let rad = 20; rad <= 900; rad += 20) {
    let best = null, bestD = Infinity;
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const px = x + Math.cos(ang) * rad, py = y + Math.sin(ang) * rad;
      if (!isBlocked(px, py, r)) { const d = Math.hypot(px - x, py - y); if (d < bestD) { bestD = d; best = { x: px, y: py }; } }
    }
    if (best) return best;
  }
  return { x, y };
}

// ── grid ──
const grids = new Map(); // radius → Uint8Array (1 = blocked)
function gridFor(r) {
  const key = Math.round(r);
  let g = grids.get(key);
  if (g) return g;
  g = new Uint8Array(N);
  for (let cy = 0; cy < GH; cy++) {
    for (let cx = 0; cx < GW; cx++) {
      const x = (cx + 0.5) * NAV_CELL, y = (cy + 0.5) * NAV_CELL;
      if (isBlocked(x, y, key + GRID_MARGIN)) g[cy * GW + cx] = 1; // margin: legs between cell centers never graze a wall end
    }
  }
  grids.set(key, g);
  return g;
}
const cellOf = (x, y) => {
  const cx = Math.max(0, Math.min(GW - 1, Math.floor(x / NAV_CELL)));
  const cy = Math.max(0, Math.min(GH - 1, Math.floor(y / NAV_CELL)));
  return cy * GW + cx;
};
const cellX = (i) => ((i % GW) + 0.5) * NAV_CELL;
const cellY = (i) => (Math.floor(i / GW) + 0.5) * NAV_CELL;

/** Nearest open cell to cell i (BFS, bounded). */
function openCellNear(g, i) {
  if (!g[i]) return i;
  const seen = new Set([i]);
  let frontier = [i];
  for (let depth = 0; depth < 20 && frontier.length; depth++) {
    const next = [];
    for (const c of frontier) {
      const cx = c % GW, cy = (c - cx) / GW;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const n = ny * GW + nx;
        if (seen.has(n)) continue;
        if (!g[n]) return n;
        seen.add(n); next.push(n);
      }
    }
    frontier = next;
  }
  return -1;
}

/** Open cell near (x, y) whose center is reachable in a straight line (falls back to BFS). */
function visibleOpenCell(g, x, y, r) {
  const c0 = cellOf(x, y);
  const cx0 = c0 % GW, cy0 = (c0 - cx0) / GW;
  let best = -1, bestD = Infinity;
  for (let oy = -2; oy <= 2; oy++) {
    for (let ox = -2; ox <= 2; ox++) {
      const nx = cx0 + ox, ny = cy0 + oy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const n = ny * GW + nx;
      if (g[n]) continue;
      const d = Math.hypot(cellX(n) - x, cellY(n) - y);
      if (d < bestD && segmentClear(x, y, cellX(n), cellY(n), r)) { bestD = d; best = n; }
    }
  }
  return best >= 0 ? best : openCellNear(g, c0);
}

// A* scratch buffers (reused; JS is single-threaded).
const gScore = new Float32Array(N);
const came = new Int32Array(N);
const stamp = new Uint32Array(N);
const closed = new Uint32Array(N);
let gen = 0;
const heap = [];        // binary min-heap of [f, cell]
function hpush(f, c) {
  heap.push([f, c]);
  let i = heap.length - 1;
  while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
}
function hpop() {
  const top = heap[0], last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
      if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
      if (m === i) break;
      [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
    }
  }
  return top;
}
const SQ2 = Math.SQRT2;
const NEI = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

/**
 * Waypoints from (x0,y0) to (x1,y1) for a circle of radius r, excluding the
 * start. Goal inside a wall → goes to nearestFree(goal). Never returns [] for
 * a distinct goal (falls back to a straight line if the grid has no route).
 */
export function findPath(x0, y0, x1, y1, r = 30) {
  if (!fin(x0, y0, x1, y1)) return [];
  const goal = nearestFree(x1, y1, r);
  if (segmentClear(x0, y0, goal.x, goal.y, r)) return [goal];
  const g = gridFor(r);
  const s = visibleOpenCell(g, x0, y0, r);
  const t = visibleOpenCell(g, goal.x, goal.y, r);
  if (s < 0 || t < 0) return [goal];
  gen++;
  heap.length = 0;
  const tx = t % GW, ty = (t - tx) / GW;
  const h = (c) => {
    const dx = Math.abs((c % GW) - tx), dy = Math.abs(Math.floor(c / GW) - ty);
    return (dx + dy) + (SQ2 - 2) * Math.min(dx, dy);
  };
  stamp[s] = gen; gScore[s] = 0; came[s] = -1;
  hpush(h(s), s);
  let found = false, iter = 0;
  while (heap.length && iter++ < N) {
    const [, c] = hpop();
    if (closed[c] === gen) continue;
    closed[c] = gen;
    if (c === t) { found = true; break; }
    const cx = c % GW, cy = (c - cx) / GW;
    for (const [ox, oy, cost] of NEI) {
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const n = ny * GW + nx;
      if (g[n] || closed[n] === gen) continue;
      if (ox && oy && (g[cy * GW + nx] || g[ny * GW + cx])) continue; // no corner cutting
      const ng = gScore[c] + cost;
      if (stamp[n] === gen && ng >= gScore[n]) continue;
      stamp[n] = gen; gScore[n] = ng; came[n] = c;
      hpush(ng + h(n), n);
    }
  }
  if (!found) return [goal];
  const cells = [];
  for (let c = t; c !== -1; c = came[c]) cells.push(c);
  cells.reverse();
  // Points: cell centers (the start cell is visible from the start) then the
  // exact goal (visible from the goal cell); smooth by line of sight.
  const pts = cells.map((c) => ({ x: cellX(c), y: cellY(c) }));
  pts.push(goal);
  const out = [];
  let ax = x0, ay = y0;
  for (let k = 0; k < pts.length; k++) {
    if (k > 0 && !segmentClear(ax, ay, pts[k].x, pts[k].y, r)) {
      const p = pts[k - 1];
      out.push(p); ax = p.x; ay = p.y;
    }
  }
  out.push(goal);
  return out;
}

/** Total length of a path from (x0,y0) through the waypoints. */
export function pathLength(x0, y0, pts) {
  let len = 0, ax = x0, ay = y0;
  for (const p of pts) { len += Math.hypot(p.x - ax, p.y - ay); ax = p.x; ay = p.y; }
  return len;
}

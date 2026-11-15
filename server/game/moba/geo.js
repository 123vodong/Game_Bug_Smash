// server/game/moba/geo.js — small geometry helpers for Team Mode (lane paths,
// distances). Pure functions over shared/moba/map.js data.
import { laneFor, distToSeg, STRUCTURES, BUSHES, MAP_W, MAP_H } from '../../../shared/moba/map.js';

export const LANE_IDS = ['top', 'mid', 'bot'];

// v4: bush lookup through a coarse grid — same answer as shared bushAt() (same shapes, same
// first-match order), but ~97 % of the map is open floor and costs one array read.
const BUSH_CELL = 200;
const BUSH_COLS = Math.ceil(MAP_W / BUSH_CELL) + 1, BUSH_ROWS = Math.ceil(MAP_H / BUSH_CELL) + 1;
const BUSH_GRID = new Array(BUSH_COLS * BUSH_ROWS).fill(null);
for (const b of BUSHES) {
  const h = b.kind === 'circle' ? b.r : b.w / 2;
  const x0 = b.kind === 'circle' ? b.x - h : Math.min(b.x1, b.x2) - h, x1 = b.kind === 'circle' ? b.x + h : Math.max(b.x1, b.x2) + h;
  const y0 = b.kind === 'circle' ? b.y - h : Math.min(b.y1, b.y2) - h, y1 = b.kind === 'circle' ? b.y + h : Math.max(b.y1, b.y2) + h;
  for (let cx = Math.max(0, Math.floor(x0 / BUSH_CELL)); cx <= Math.min(BUSH_COLS - 1, Math.floor(x1 / BUSH_CELL)); cx++) {
    for (let cy = Math.max(0, Math.floor(y0 / BUSH_CELL)); cy <= Math.min(BUSH_ROWS - 1, Math.floor(y1 / BUSH_CELL)); cy++) {
      const k = cy * BUSH_COLS + cx;
      (BUSH_GRID[k] || (BUSH_GRID[k] = [])).push(b);
    }
  }
}
/** Bush id at (x, y) ('' if none) — grid-accelerated shared/moba/map.js bushAt(). */
export function bushAtFast(x, y) {
  if (!(x >= 0 && y >= 0)) return '';
  const cx = Math.floor(x / BUSH_CELL), cy = Math.floor(y / BUSH_CELL);
  if (cx >= BUSH_COLS || cy >= BUSH_ROWS) return '';
  const list = BUSH_GRID[cy * BUSH_COLS + cx];
  if (!list) return '';
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (b.kind === 'circle') { const dx = x - b.x, dy = y - b.y; if (dx * dx + dy * dy <= b.r * b.r) return b.id; continue; }
    if (distToSeg(x, y, b.x1, b.y1, b.x2, b.y2) <= b.w / 2) return b.id;
  }
  return '';
}
export const otherTeam = (t) => (t === 'blue' ? 'red' : 'blue');
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const dist2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };

/** A polyline with arc-length helpers (lane progress for minions + bots). */
export class LanePath {
  constructor(pts) {
    this.pts = pts.map((p) => ({ x: p.x, y: p.y }));
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      this.cum.push(this.cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    this.length = this.cum[this.cum.length - 1];
  }

  /** Distance along the path of the point on it nearest to (x, y). */
  progressOf(x, y) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < this.pts.length - 1; i++) {
      const a = this.pts[i], b = this.pts[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((x - a.x) * dx + (y - a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + dx * t, py = a.y + dy * t;
      const d = Math.hypot(x - px, y - py);
      if (d < bestD) { bestD = d; best = this.cum[i] + t * Math.sqrt(len2); }
    }
    return best;
  }

  /** Distance from (x, y) to the path. */
  distTo(x, y) {
    let bestD = Infinity;
    for (let i = 0; i < this.pts.length - 1; i++) {
      const a = this.pts[i], b = this.pts[i + 1];
      bestD = Math.min(bestD, distToSeg(x, y, a.x, a.y, b.x, b.y));
    }
    return bestD;
  }

  /** Point at arc length p (clamped to the path). */
  pointAt(p) {
    const q = Math.max(0, Math.min(this.length, p));
    for (let i = 0; i < this.pts.length - 1; i++) {
      if (q <= this.cum[i + 1] || i === this.pts.length - 2) {
        const a = this.pts[i], b = this.pts[i + 1];
        const seg = (this.cum[i + 1] - this.cum[i]) || 1;
        const t = Math.max(0, Math.min(1, (q - this.cum[i]) / seg));
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
    }
    return { ...this.pts[this.pts.length - 1] };
  }

  /** Index of the segment nearest to (x, y) (0 … n-2). */
  nearestSegment(x, y) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < this.pts.length - 1; i++) {
      const a = this.pts[i], b = this.pts[i + 1];
      const d = distToSeg(x, y, a.x, a.y, b.x, b.y);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
}

const CORES = Object.fromEntries(STRUCTURES.filter((s) => s.kind === 'core').map((s) => [s.team, { x: s.x, y: s.y }]));
export const corePos = (team) => CORES[team];

// Lane paths per team, walking toward the enemy base. Minions append the enemy core.
const LANE_PATHS = {};
const MINION_PATHS = {};
for (const team of ['blue', 'red']) {
  LANE_PATHS[team] = {};
  MINION_PATHS[team] = {};
  for (const lane of LANE_IDS) {
    const pts = laneFor(team, lane);
    LANE_PATHS[team][lane] = new LanePath(pts);
    MINION_PATHS[team][lane] = [...pts.map((p) => ({ x: p.x, y: p.y })), { ...corePos(otherTeam(team)) }];
  }
}
/** Lane polyline for `team` (own base → enemy base). */
export const lanePath = (team, lane) => LANE_PATHS[team]?.[lane] || null;
/** Minion waypoints for `team` in `lane`: the lane, then the enemy core. */
export const minionPath = (team, lane) => MINION_PATHS[team][lane];

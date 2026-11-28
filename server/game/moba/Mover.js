// server/game/moba/Mover.js — wall-aware movement for Team Mode (v2 "Walls").
//
// Everything that walks (champions, minions, monsters, pets) moves through
// Mover.move(): a straight line when it is clear, else a CACHED findPath()
// route (shared/moba/nav.js) that is only rebuilt when
//   · the goal moved more than REPATH_DIST from the goal the route was made for,
//   · progress stalled (sliding against a corner, pushed by separation …),
//   · the entity was teleported / displaced (callers set e.nav = null).
// Every step is resolved against the walls (pushOut), so even a stale route or
// a crowd push can never leave a unit inside furniture.
//
// Cost: no A* per entity per tick. A* runs only when the straight line is
// blocked; units (not champions) share a per-tick path budget and a per-unit
// cooldown, falling back to step + pushOut (slide) meanwhile.
import { isBlocked, pushOut, segmentClear, moveSlide, findPath, nearestFree, wallDist, NAV_CELL } from '../../../shared/moba/nav.js';
import { MAP_W, MAP_H, WALLS, CHAMP_RADIUS, clampToMap } from '../../../shared/moba/map.js';

export const REPATH_DIST = 150;   // goal moved this far → new route
const STALL_MS = 600;             // no STALL_PX progress for this long → re-route
const STALL_PX = 10;
const LOOKAHEAD = 140;            // short clear-ahead probe while walking straight near walls
const UNIT_REPATH_MS = 400;       // per-unit A* cooldown (champions are exempt)
const UNIT_PATHS_PER_TICK = 6;
const CHAMP_REPATH_MS = 100;      // per-champion A* cooldown (order spam can't force A* every tick)    // shared A* budget for minions / monsters / pets

// ── "near a wall?" grid: lets every hot path skip wall math in open floor ──
const GW = Math.ceil(MAP_W / NAV_CELL);
const GH = Math.ceil(MAP_H / NAV_CELL);
const NEAR_MARGIN = LOOKAHEAD + 80 + NAV_CELL * 0.75; // probe + biggest radius + half cell diagonal
const NEAR = new Uint8Array(GW * GH);
for (let cy = 0; cy < GH; cy++) {
  for (let cx = 0; cx < GW; cx++) {
    const x = (cx + 0.5) * NAV_CELL, y = (cy + 0.5) * NAV_CELL;
    for (const w of WALLS) if (wallDist(x, y, w) < NEAR_MARGIN) { NEAR[cy * GW + cx] = 1; break; }
  }
}
/** Is (x, y) within ~260 px of any wall? (O(1) lookup) */
export function nearWall(x, y) {
  const cx = Math.max(0, Math.min(GW - 1, Math.floor(x / NAV_CELL)));
  const cy = Math.max(0, Math.min(GH - 1, Math.floor(y / NAV_CELL)));
  return NEAR[cy * GW + cx] === 1;
}

/** Grid radius used for A*: small units path with the champion grid (safe + fewer grids). */
const pathRadius = (r) => (r <= CHAMP_RADIUS ? CHAMP_RADIUS : Math.ceil(r));

/** A free spot for a circle of radius r at/near (x, y), inside the map. */
export function freeSpot(x, y, r) {
  let p = clampToMap(x, y, Math.max(30, r));
  if (nearWall(p.x, p.y) && isBlocked(p.x, p.y, r)) p = nearestFree(p.x, p.y, r);
  return clampToMap(p.x, p.y, Math.max(30, r));
}

/** Push `e` out of any wall it overlaps (after a step / crowd push). */
export function resolveWalls(e) {
  if (!nearWall(e.x, e.y)) return false;
  const r = e.radius || 0;
  if (!isBlocked(e.x, e.y, r)) return false;
  let p = pushOut(e.x, e.y, r);
  if (isBlocked(p.x, p.y, r)) p = nearestFree(e.x, e.y, r);
  e.x = p.x; e.y = p.y;
  return true;
}

export class Mover {
  constructor() {
    this.budget = UNIT_PATHS_PER_TICK;
    this.stats = { paths: 0, unitPaths: 0, deferred: 0, unstick: 0 };
  }

  beginTick() { this.budget = UNIT_PATHS_PER_TICK; }

  /** (Re)build e.nav for goal (gx, gy). force = skip the straight-line shortcut. */
  _plan(e, gx, gy, now, force, stalls = 0) {
    const r = e.radius || 0;
    let pts = null;
    if (force || !segmentClear(e.x, e.y, gx, gy, r)) {
      const champ = e.etype === 'champ';
      if (champ ? now >= (e.navPathAt || 0) : (this.budget > 0 && now >= (e.navPathAt || 0))) {
        if (!champ) { this.budget--; e.navPathAt = now + UNIT_REPATH_MS; this.stats.unitPaths++; }
        else e.navPathAt = now + CHAMP_REPATH_MS;
        this.stats.paths++;
        pts = findPath(e.x, e.y, gx, gy, pathRadius(r));
      } else {
        this.stats.deferred++;
      }
    }
    e.nav = { gx, gy, pts, i: 0, px: e.x, py: e.y, pAt: now, planAt: now, stalls, retry: !pts && e.etype === 'champ' && !segmentClear(e.x, e.y, gx, gy, r) };
    return e.nav;
  }

  /**
   * Move `e` toward (gx, gy) at `speed` px/s for `dt` ms around walls.
   * Returns true once it stands on the goal. Sets e.faceX/faceY.
   */
  move(e, gx, gy, speed, dt, now) {
    let nav = e.nav;
    if (!nav || Math.hypot(nav.gx - gx, nav.gy - gy) > REPATH_DIST
      || (nav.retry && now >= (e.navPathAt || 0))) nav = this._plan(e, gx, gy, now, false);

    // Stall detection: no progress for a while → force a fresh grid route;
    // repeated stalls → hop to the nearest free spot (last resort). Time spent
    // NOT moving (attacking, stunned, …) doesn't count as a stall.
    if (now - (nav.movedAt || now) > 200) { nav.px = e.x; nav.py = e.y; nav.pAt = now; }
    nav.movedAt = now;
    if (Math.hypot(e.x - nav.px, e.y - nav.py) > STALL_PX) { nav.px = e.x; nav.py = e.y; nav.pAt = now; }
    else if (now - nav.pAt > STALL_MS && !nearWall(e.x, e.y)) {
      nav.pAt = now; // crowded in open floor (separation) — walls aren't the problem
    } else if (now - nav.pAt > STALL_MS) {
      const stalls = nav.stalls + 1;
      if (stalls >= 3) {
        const p = nearestFree(e.x, e.y, (e.radius || 0) + 6);
        e.x = p.x; e.y = p.y;
        this.stats.unstick++;
      }
      nav = this._plan(e, gx, gy, now, true, stalls >= 3 ? 0 : stalls);
    }

    let step = speed * dt / 1000;
    if (!(step > 0)) return false;
    const r = e.radius || 0;
    for (let guard = 0; guard < 8 && step > 0; guard++) {
      const pts = nav.pts;
      const last = !pts || nav.i >= pts.length - 1;
      const goalFree = last && isBlocked(gx, gy, r)
        ? (pts && pts.length ? pts[pts.length - 1] : nearestFree(gx, gy, r))
        : { x: gx, y: gy };
      // Intermediate waypoints are clear by construction; the last leg heads for
      // the CURRENT goal (or nearestFree/path end if the clicked point sits inside a wall).
      const tx = last ? goalFree.x : pts[nav.i].x;
      const ty = last ? goalFree.y : pts[nav.i].y;
      const dx = tx - e.x, dy = ty - e.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.5) {
        if (last) {
          if (!isBlocked(tx, ty, r)) { e.x = tx; e.y = ty; }
          return true;
        }
        nav.i++;
        continue;
      }
      const ux = dx / d, uy = dy / d;
      e.faceX = ux; e.faceY = uy;
      // Straight-line legs near furniture: probe a short way ahead; blocked → route.
      if (last && now - nav.planAt > 150 && nearWall(e.x, e.y)) {
        const probe = Math.min(d, LOOKAHEAD);
        if (!segmentClear(e.x, e.y, e.x + ux * probe, e.y + uy * probe, r)) {
          nav = this._plan(e, gx, gy, now, true, nav.stalls);
          if (nav.pts) continue;
        }
      }
      if (step >= d) {
        const m = r > 0 ? moveSlide(e.x, e.y, tx, ty, r) : { x: tx, y: ty, hit: false };
        e.x = m.x; e.y = m.y;
        step -= d;
        if (last) {
          resolveWalls(e);
          if (m.hit && isBlocked(gx, gy, r) && Math.hypot(e.x - tx, e.y - ty) < 4) return true;
          return Math.hypot(e.x - tx, e.y - ty) < 1;
        }
        nav.i++;
        // Shortcut: the goal is in plain sight now → drop the rest of the route.
        if (nav.i < pts.length - 1 && segmentClear(e.x, e.y, goalFree.x, goalFree.y, r)) { nav.pts = null; nav.i = 0; }
        continue;
      }
      const nx = e.x + ux * step, ny = e.y + uy * step;
      const m = r > 0 ? moveSlide(e.x, e.y, nx, ny, r) : { x: nx, y: ny, hit: false };
      e.x = m.x; e.y = m.y;
      step = 0;
      if (m.hit && last && isBlocked(gx, gy, r) && Math.hypot(e.x - tx, e.y - ty) < 4) {
        resolveWalls(e);
        return true;
      }
    }
    resolveWalls(e);
    return false;
  }
}

// Maze: tile grid with wall collision, tunnel wraparound, and BFS pathing.
import { MAZES, MAZE_COLS, MAZE_ROWS, MAZE_TILE } from '../data/mazes.js';

export class Maze {
  constructor(scene, mazeIndex) {
    this.scene = scene;
    this.grid = MAZES[Math.min(mazeIndex, MAZES.length - 1)];
    // Offset to center the maze in the canvas
    this.offsetX = Math.floor((scene.scale.width  - MAZE_COLS * MAZE_TILE) / 2);
    this.offsetY = Math.floor((scene.scale.height - MAZE_ROWS * MAZE_TILE) / 2);
  }

  draw() {
    // Solid Pac-Man-style walls — light gray cubicle partition color with dark trim.
    // (We tried tiling cubicle PNGs but each one is a hollow cubicle interior, not a
    // wall segment, so they don't connect cleanly.)
    for (let r = 0; r < MAZE_ROWS; r++) {
      for (let c = 0; c < MAZE_COLS; c++) {
        const ch = this.grid[r][c];
        const x = this.offsetX + c * MAZE_TILE + MAZE_TILE / 2;
        const y = this.offsetY + r * MAZE_TILE + MAZE_TILE / 2;
        if (ch === '#') {
          this.scene.add.rectangle(x, y, MAZE_TILE, MAZE_TILE, 0xc8c8d0).setDepth(1);
          this.scene.add.rectangle(x, y, MAZE_TILE - 4, MAZE_TILE - 4, 0xe6e6ec).setDepth(1.5);
        } else if (ch === 'T') {
          this.scene.add.rectangle(x, y, MAZE_TILE - 4, MAZE_TILE - 4, 0x222244, 0.4).setDepth(0);
        }
      }
    }
  }

  // World <-> Tile
  worldToTile(x, y) {
    return {
      c: Math.floor((x - this.offsetX) / MAZE_TILE),
      r: Math.floor((y - this.offsetY) / MAZE_TILE),
    };
  }
  tileToWorld(c, r) {
    return {
      x: this.offsetX + c * MAZE_TILE + MAZE_TILE / 2,
      y: this.offsetY + r * MAZE_TILE + MAZE_TILE / 2,
    };
  }

  isWall(c, r) {
    if (c < 0 || c >= MAZE_COLS || r < 0 || r >= MAZE_ROWS) return true;
    return this.grid[r][c] === '#';
  }
  isTunnel(c, r) {
    if (c < 0 || c >= MAZE_COLS || r < 0 || r >= MAZE_ROWS) return false;
    return this.grid[r][c] === 'T';
  }
  isFloor(c, r) {
    if (c < 0 || c >= MAZE_COLS || r < 0 || r >= MAZE_ROWS) return false;
    const ch = this.grid[r][c];
    return ch !== '#';
  }

  /**
   * Move a point (x, y) by (dx, dy) while respecting wall collision and tunnel wraparound.
   * Returns the resolved position.
   */
  moveWithCollision(x, y, dx, dy, radius = 14) {
    // Try X first, then Y, with sliding behavior.
    let nx = x + dx;
    let ny = y;
    if (this._collides(nx, ny, radius)) { nx = x; }
    ny = y + dy;
    if (this._collides(nx, ny, radius)) { ny = y; }

    // Tunnel wraparound
    const tile = this.worldToTile(nx, ny);
    if (this.isTunnel(tile.c, tile.r)) {
      // Find opposite tunnel on the same row
      const row = this.grid[tile.r];
      const tunnelCols = [];
      for (let c = 0; c < MAZE_COLS; c++) if (row[c] === 'T') tunnelCols.push(c);
      if (tunnelCols.length === 2 && tile.c === tunnelCols[0]) {
        const w = this.tileToWorld(tunnelCols[1], tile.r);
        nx = w.x; ny = w.y;
      } else if (tunnelCols.length === 2 && tile.c === tunnelCols[1]) {
        const w = this.tileToWorld(tunnelCols[0], tile.r);
        nx = w.x; ny = w.y;
      }
    }

    // Also wrap if pushed off-screen horizontally (failsafe)
    if (nx < 0) nx += this.scene.scale.width;
    if (nx > this.scene.scale.width) nx -= this.scene.scale.width;

    return { x: nx, y: ny };
  }

  /** Check if the entity's bbox (corner samples) overlaps any wall. */
  _collides(x, y, radius) {
    const samples = [
      { sx: x - radius, sy: y - radius },
      { sx: x + radius, sy: y - radius },
      { sx: x - radius, sy: y + radius },
      { sx: x + radius, sy: y + radius },
    ];
    for (const s of samples) {
      const t = this.worldToTile(s.sx, s.sy);
      if (this.isWall(t.c, t.r)) return true;
    }
    return false;
  }

  /** Pick a random floor tile (no walls, no tunnels). Used for spawning bugs/pickups. */
  randomFloorTile() {
    let tries = 100;
    while (tries-- > 0) {
      const c = Math.floor(Math.random() * MAZE_COLS);
      const r = Math.floor(Math.random() * MAZE_ROWS);
      if (this.grid[r][c] === '.') return this.tileToWorld(c, r);
    }
    // Fallback: scan
    for (let r = 0; r < MAZE_ROWS; r++) {
      for (let c = 0; c < MAZE_COLS; c++) {
        if (this.grid[r][c] === '.') return this.tileToWorld(c, r);
      }
    }
    return { x: this.scene.scale.width / 2, y: this.scene.scale.height / 2 };
  }

  /**
   * BFS shortest path. Returns the next tile {c, r} from `from` toward `to`, or null if none.
   * Treats walls as impassable; tunnels and floors as passable.
   */
  bfsNextTile(from, to) {
    if (from.c === to.c && from.r === to.r) return null;
    const visited = new Uint8Array(MAZE_COLS * MAZE_ROWS);
    const prev = new Int32Array(MAZE_COLS * MAZE_ROWS).fill(-1);
    const idx = (c, r) => r * MAZE_COLS + c;
    const queue = [idx(from.c, from.r)];
    visited[queue[0]] = 1;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let found = false;

    while (queue.length) {
      const cur = queue.shift();
      const cc = cur % MAZE_COLS;
      const cr = Math.floor(cur / MAZE_COLS);
      if (cc === to.c && cr === to.r) { found = true; break; }
      for (const [dc, dr] of dirs) {
        const nc = cc + dc, nr = cr + dr;
        if (nc < 0 || nc >= MAZE_COLS || nr < 0 || nr >= MAZE_ROWS) continue;
        const ni = idx(nc, nr);
        if (visited[ni]) continue;
        if (this.isWall(nc, nr)) continue;
        visited[ni] = 1;
        prev[ni] = cur;
        queue.push(ni);
      }
    }
    if (!found) return null;
    // Walk back from `to` to find the first step from `from`.
    let cur = idx(to.c, to.r);
    while (prev[cur] !== -1 && prev[cur] !== idx(from.c, from.r)) cur = prev[cur];
    return { c: cur % MAZE_COLS, r: Math.floor(cur / MAZE_COLS) };
  }
}

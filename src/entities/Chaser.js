// Chaser: indestructible pursuer (Boss/PM/TechLead). Pac-Man inspired AIs.
//   boss      -> Blinky (direct pursuit, BFS to player tile)
//   pm        -> Pinky  (ambush, BFS to tile 4 ahead of player's facing)
//   techlead  -> Inky   (flank, BFS to vector(boss -> player)*2 reflected through player)
import { CHASER_DEFS } from '../data/levels.js';

const SPRITE_KEY = {
  boss:     'char-deadline',
  pm:       'char-pm',
  techlead: 'char-techlead',
};

const REPLAN_MS = 250;    // recompute target tile this often
const TILE_REACH = 16;    // px tolerance to consider a tile reached

export class Chaser {
  constructor(scene, kind, x, y) {
    this.scene = scene;
    this.kind = kind;
    const def = CHASER_DEFS[kind];
    this.def = def;
    this.x = x; this.y = y;
    this.frozen = false;
    this.stunUntil = 0;
    this.lastPlanAt = 0;
    this.nextStepWorld = { x, y };

    this.sprite = scene.add.sprite(x, y, SPRITE_KEY[kind] ?? 'char-pm')
      .setDisplaySize(110, 160)
      .setDepth(8);

    this.label = scene.add.text(x, y + 85, def.name, {
      fontFamily: 'Arial Black, sans-serif', fontSize: 12, color: '#fff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(8);
  }

  setFrozen(on) {
    this.frozen = on;
    this.sprite.setAlpha(on ? 0.5 : 1);
    if (on) this.sprite.setTint(0x6688ff); else this.sprite.clearTint();
  }

  isStunned(now) { return now < this.stunUntil; }
  stun(ms) { this.stunUntil = this.scene.time.now + ms; }

  update(dtMs, now, ctx) {
    if (this.frozen || this.isStunned(now)) { this._refreshVisuals(); return; }
    const maze = this.scene.maze;
    const target = ctx?.player;
    if (!target) return;

    // Without a maze, fall back to direct seek (no walls).
    if (!maze) {
      const dx = target.x - this.x, dy = target.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = this.def.speed * (this.kind === 'pm' ? (1 + Math.sin(now / 300) * 0.2) : 1);
      this.x += dx / d * sp * dtMs / 1000;
      this.y += dy / d * sp * dtMs / 1000;
      if (dx < -2) this.sprite.setFlipX(true); else if (dx > 2) this.sprite.setFlipX(false);
      this._refreshVisuals();
      return;
    }

    // Replan target tile periodically
    if (now - this.lastPlanAt > REPLAN_MS) {
      this.lastPlanAt = now;
      const targetTile = this._computeTargetTile(target, ctx);
      const myTile = maze.worldToTile(this.x, this.y);
      const next = maze.bfsNextTile(myTile, targetTile);
      if (next) this.nextStepWorld = maze.tileToWorld(next.c, next.r);
    }

    // Move toward the next step in world space, allowing wall collision/wrap.
    const dx = this.nextStepWorld.x - this.x;
    const dy = this.nextStepWorld.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < TILE_REACH) {
      // Reached planned tile — force a replan next frame
      this.lastPlanAt = 0;
    } else {
      const sp = this.def.speed;
      const mx = (dx / d) * sp * dtMs / 1000;
      const my = (dy / d) * sp * dtMs / 1000;
      const resolved = maze.moveWithCollision(this.x, this.y, mx, my, 16);
      this.x = resolved.x; this.y = resolved.y;
      if (dx < -2) this.sprite.setFlipX(true); else if (dx > 2) this.sprite.setFlipX(false);
    }
    this._refreshVisuals();
  }

  _computeTargetTile(player, ctx) {
    const maze = this.scene.maze;
    const playerTile = maze.worldToTile(player.x, player.y);
    if (this.kind === 'boss') {
      // Blinky: direct chase
      return playerTile;
    }
    if (this.kind === 'pm') {
      // Pinky: 4 tiles ahead of player's facing
      const ahead = {
        c: playerTile.c + Math.round(player.facing.x * 4),
        r: playerTile.r + Math.round(player.facing.y * 4),
      };
      return this._clampTile(ahead);
    }
    if (this.kind === 'techlead') {
      // Inky: flank — vector from boss through player, extended
      const boss = (ctx?.chasers ?? []).find(c => c.kind === 'boss');
      if (!boss) return playerTile;
      const bossTile = maze.worldToTile(boss.x, boss.y);
      const flank = {
        c: 2 * playerTile.c - bossTile.c,
        r: 2 * playerTile.r - bossTile.r,
      };
      return this._clampTile(flank);
    }
    return playerTile;
  }

  _clampTile(t) {
    const maze = this.scene.maze;
    const { MAZE_COLS, MAZE_ROWS } = { MAZE_COLS: maze.grid[0].length, MAZE_ROWS: maze.grid.length };
    return {
      c: Math.max(0, Math.min(MAZE_COLS - 1, t.c)),
      r: Math.max(0, Math.min(MAZE_ROWS - 1, t.r)),
    };
  }

  _refreshVisuals() {
    this.sprite.setPosition(this.x, this.y);
    this.label.setPosition(this.x, this.y + 85);
  }

  distTo(x, y) { return Math.hypot(this.x - x, this.y - y); }

  destroy() {
    this.sprite.destroy();
    this.label.destroy();
  }
}

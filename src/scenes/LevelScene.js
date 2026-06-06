// LevelScene — core gameplay loop. Movement, bugs, chasers, AI skills, HUD.
import { LEVELS, CHASER_DEFS } from '../data/levels.js';
import { SKILLS } from '../data/skills.js';
import { isWeakTo, aiInteractionMult } from '../data/bugs.js';
import { Player } from '../entities/Player.js';
import { Chaser } from '../entities/Chaser.js';
import { BugSpawner } from '../systems/BugSpawner.js';
import { Maze } from '../systems/Maze.js';
import { AISkillManager } from '../systems/AISkillManager.js';
import { ComboSystem } from '../systems/ComboSystem.js';
import { ScoreSystem } from '../systems/ScoreSystem.js';
import { TipManager } from '../systems/TipManager.js';
import { HUD } from '../ui/HUD.js';
import { SaveManager } from '../core/SaveManager.js';
import { AudioManager } from '../core/AudioManager.js';

export default class LevelScene extends Phaser.Scene {
  constructor() { super('LevelScene'); }

  init(data) { this.levelNum = data?.level ?? 1; }

  preload() {
    // Optimistically load this level's backdrop if declared.
    const lvl = LEVELS[this.levelNum - 1];
    if (lvl?.backdrop) {
      this.load.image(`bg-L${lvl.num}`, lvl.backdrop);
      // Silently swallow load errors so missing backdrops fall through to procedural rendering.
      this.load.on(`loaderror`, () => {});
    }
  }

  create() {
    const level = LEVELS[this.levelNum - 1];
    this.level = level;

    if (level.boss) { this.scene.start('BossScene', { level: this.levelNum }); return; }

    this._drawFloor();

    // Maze (Pac-Man style) — collidable walls + tunnel wraparound
    this.maze = new Maze(this, this.levelNum - 1);

    // If a designer-composed backdrop exists, draw it; otherwise use procedural walls/props.
    const bgKey = `bg-L${this.levelNum}`;
    if (level.backdrop && this.textures.exists(bgKey)) {
      this._drawBackdrop(bgKey);
    } else {
      this.maze.draw();
      this._scatterOfficeProps();
    }

    this._showLevelBanner();

    // Player spawns on a floor tile near center
    const pSpawn = this.maze.randomFloorTile();
    this.player = new Player(this, pSpawn.x, pSpawn.y);
    this.bugs = [];

    // Chasers spawn on floor tiles, ideally far from player
    this.chasers = (level.chasers || []).map(kind => {
      const spawn = this.maze.randomFloorTile();
      return new Chaser(this, kind, spawn.x, spawn.y);
    });

    this.spawner = new BugSpawner(this);
    // Override BugSpawner positions to use floor tiles
    this.bugs = [];
    for (const [id, count] of Object.entries(level.bugCounts || {})) {
      for (let i = 0; i < count; i++) {
        const s = this.maze.randomFloorTile();
        const b = this.spawner.spawnOne(id, s.x, s.y);
        if (b) this.bugs.push(b);
      }
    }
    this.bugsTotal = this.bugs.length;

    // Bug-emitted events
    this.events.on('bug:aoe', (e) => {
      if (Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) < e.radius && !this.player.isInvincible(this.time.now)) {
        this._gameOver();
      }
    });
    this.events.on('bug:revive', (e) => {
      // Remove the dead source bug, spawn a fresh one in its place
      e.replace.alive = false;
      e.replace.destroy();
      const fresh = this.spawner.spawnOne(e.id, e.x, e.y);
      if (fresh) {
        this.bugs.push(fresh);
        // Quick "respawn" puff
        const puff = this.add.circle(e.x, e.y, 8, 0xffffff, 0.6);
        this.tweens.add({ targets: puff, scale: 3, alpha: 0, duration: 350, onComplete: () => puff.destroy() });
      }
    });

    this.combo = new ComboSystem();
    this.score = new ScoreSystem();
    this.tipMgr = new TipManager();
    this.timeScale = 1;
    this.timeLeftMs = level.timeLimit || 0;

    // AI skill manager + ctx
    this.skills = new AISkillManager(this, {
      player: this.player,
      getBugs: () => this.bugs,
      getChasers: () => this.chasers,
      score: this.score,
      combo: this.combo,
      opusAutoSmash: (r) => this._opusAutoSmash(r),
      applyBugMagnet: (r) => this._applyMagnet(r),
      get timeScale() { return this.parent?.timeScale ?? 1; },
      set timeScale(v) { this.parent.timeScale = v; },
    });
    // patch reference so getter/setter has access
    this.skills.ctx.parent = this;

    // Skill drops
    this.pickups = [];
    this._scatterSkillDrops(level.skillDrops || []);

    // HUD
    this.hud = new HUD(this, this._hudCtx());

    // Tip ticker timer
    this.tipTickerTimer = this.time.addEvent({ delay: 1500, loop: true, callback: () => this._refreshTipTicker() });

    // Listen for smashes
    this.events.on('player:smash', (e) => this._resolveSmash(e));

    // Slot activation keys
    this.input.keyboard.on('keydown-Q', () => this.skills.activate(0));
    this.input.keyboard.on('keydown-E', () => this.skills.activate(1));
    this.input.keyboard.on('keydown-R', () => this.skills.activate(2));
    this.input.keyboard.on('keydown-ESC', () => this.scene.start('MenuScene'));

    this.lastUpdate = 0;
  }

  _ctx() {
    return {
      player: this.player,
      bugCount: () => this.bugs.length,
      bugCap: 40,
      getBugs: () => this.bugs,
      spawnBug: (id, x, y) => { const b = this.spawner.spawnOne(id, x, y); if (b) this.bugs.push(b); },
    };
  }

  _hudCtx() {
    return {
      levelNum: this.levelNum,
      levelName: this.level.name,
      bugsTotal: this.bugsTotal,
      bugsRemaining: () => this.bugs.length,
      score: this.score,
      combo: this.combo,
      skills: this.skills,
      player: this.player,
      getChasers: () => this.chasers,
      get timeLeftMs() { return this._scene.timeLeftMs; },
      _scene: this,
    };
  }

  update(_, dtMsRaw) {
    if (!this.player) return;
    const dt = dtMsRaw * this.timeScale;
    const now = this.time.now;

    this.player.update(dtMsRaw, now);            // player always full speed
    for (const b of this.bugs) if (b.alive) b.update(dt, now, this._ctx());
    for (const c of this.chasers) c.update(dt, now, { player: this.player, chasers: this.chasers });

    // Cleanup dead bugs
    this.bugs = this.bugs.filter(b => b.alive);

    // Caught check
    if (!this._dead) {
      for (const c of this.chasers) {
        if (!c.frozen && !c.isStunned(now) && !this.player.isInvincible(now)) {
          if (Phaser.Math.Distance.Between(c.x, c.y, this.player.x, this.player.y) < 34) {
            this._gameOver(); break;
          }
        }
      }
    }

    // Pickups
    this.pickups = this.pickups.filter(p => {
      if (!p.gfx) return false;
      if (Phaser.Math.Distance.Between(p.x, p.y, this.player.x, this.player.y) < 28) {
        if (this.skills.pickup(p.skillId)) {
          if (p.skillId === 'opus') SaveManager.unlockOpus();
          p.gfx.destroy(); p.label.destroy();
          return false;
        }
      }
      return true;
    });

    this.combo.update(now);

    // Timer
    if (this.timeLeftMs > 0) {
      this.timeLeftMs -= dtMsRaw;
      if (this.timeLeftMs <= 0) { this.timeLeftMs = 0; this._gameOver(); }
    }

    this.hud.update();

    // Win check
    if (this.bugs.length === 0 && !this._won) this._levelClear();
  }

  _resolveSmash(e) {
    const now = this.time.now;
    const ang0 = Math.atan2(e.dirY, e.dirX);
    const half = Phaser.Math.DegToRad(e.coneDeg / 2);

    let killedAny = false;
    for (const b of this.bugs) {
      if (!b.alive) continue;
      const dx = b.x - e.x, dy = b.y - e.y;
      const dist = Math.hypot(dx, dy);
      if (dist > e.range + b.radius) continue;
      const ang = Math.atan2(dy, dx);
      if (Math.abs(Phaser.Math.Angle.Wrap(ang - ang0)) > half) continue;
      this._hitBug(b, now);
      killedAny = killedAny || !b.alive;
    }
    AudioManager.smash();
    if (killedAny) {
      const tier = this.combo.pollTierUp();
      if (tier > 0) AudioManager.comboTier();
      this.score.noteCombo(this.combo.count);
    }
  }

  _hitBug(b, now) {
    const skillHit = this.skills.onSmashHit() ?? { mult: 1, oneShot: false };
    const activeSkill = this.skills.activeSkillId();
    let dmgMult = skillHit.mult;
    if (activeSkill) {
      if (isWeakTo(b.id, activeSkill)) dmgMult *= 3;     // weakness: triple damage
      dmgMult *= aiInteractionMult(b.id, activeSkill);   // tiered effectiveness
    }
    const killed = b.hit(dmgMult, skillHit.oneShot);
    if (killed) {
      AudioManager.bugDeath();
      const m = this.combo.hit(now) * skillHit.mult;
      this.score.add(b.score, m);
      this.score.countKill();
    }
  }

  _opusAutoSmash(radius) {
    const now = this.time.now;
    const ring = this.add.circle(this.player.x, this.player.y, radius, 0xffd23f, 0.18).setDepth(7);
    this.tweens.add({ targets: ring, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
    for (const b of this.bugs) {
      if (!b.alive) continue;
      if (Phaser.Math.Distance.Between(b.x, b.y, this.player.x, this.player.y) <= radius) {
        if (b.hit(99, true)) {   // one-shot
          const m = this.combo.hit(now);
          this.score.add(b.score, m);
          this.score.countKill();
        }
      }
    }
    AudioManager.bugDeath();
  }

  _applyMagnet(radius) {
    for (const b of this.bugs) {
      if (!b.alive) continue;
      const dx = this.player.x - b.x, dy = this.player.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d < radius && d > 1) {
        const pull = 120;
        b.x += dx / d * pull * 0.016;
        b.y += dy / d * pull * 0.016;
      }
    }
  }

  /**
   * Draw a hand-composed backdrop image and a subtle gray overlay where collision
   * walls live (so the player can read the maze even if the backdrop drifts).
   */
  _drawBackdrop(bgKey) {
    const { width: W, height: H } = this.scale;
    const bg = this.add.image(W / 2, H / 2, bgKey).setDepth(0);
    // Fit horizontally — Blender script renders at 1248x720 to match maze inner area.
    bg.setDisplaySize(W, H);
    // Faint dark tint over wall tiles so collision boundaries are visible at a glance.
    for (let r = 0; r < this.maze.grid.length; r++) {
      for (let c = 0; c < this.maze.grid[r].length; c++) {
        if (this.maze.grid[r][c] !== '#') continue;
        const { x, y } = this.maze.tileToWorld(c, r);
        this.add.rectangle(x, y, 48, 48, 0x000000, 0.18).setDepth(0.5);
      }
    }
  }

  _scatterOfficeProps() {
    if (!this.maze) return;
    const propKeys = ['office-table', 'office-table-coffee', 'office-trashcan', 'office-chair',
                      'office-clock', 'office-coffee', 'office-cubicle-1', 'office-cubicle-2'];
    const tiles = [];
    // Pick ~10 random floor tiles, avoid duplicates
    for (let i = 0; i < 30 && tiles.length < 10; i++) {
      const t = this.maze.randomFloorTile();
      if (tiles.some(p => Math.hypot(p.x - t.x, p.y - t.y) < 80)) continue;
      tiles.push(t);
    }
    tiles.forEach(t => {
      const key = Phaser.Utils.Array.GetRandom(propKeys);
      if (!this.textures.exists(key)) return;
      this.add.image(t.x, t.y, key)
        .setDisplaySize(38, 38)
        .setDepth(2)            // below entities (depth 5+) but above floor (depth 0)
        .setAlpha(0.85);
    });
  }

  _scatterSkillDrops(ids) {
    ids.forEach(id => {
      const def = SKILLS[id]; if (!def) return;
      const spawn = this.maze ? this.maze.randomFloorTile()
        : { x: Phaser.Math.Between(120, this.scale.width - 120), y: Phaser.Math.Between(120, this.scale.height - 120) };
      const { x, y } = spawn;
      const gfx = this.add.circle(x, y, 16, def.color).setStrokeStyle(3, 0xffffff).setDepth(6);
      const label = this.add.text(x, y - 30, def.tier, {
        fontFamily: 'Arial Black', fontSize: 14, color: '#fff', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(6);
      this.tweens.add({ targets: gfx, scale: 1.2, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.pickups.push({ x, y, skillId: id, gfx, label });
    });
  }

  _refreshTipTicker() {
    const sk = this.skills.activeSkillId();
    this.hud.setTip(sk ? this.tipMgr.pickActiveSkillTip(sk) : '');
  }

  _drawFloor() {
    const { width: W, height: H } = this.scale;
    this.add.rectangle(0, 0, W, H, 0x2b2b3d).setOrigin(0);
    for (let y = 0; y < H; y += 64) {
      for (let x = 0; x < W; x += 64) {
        const shade = ((x / 64 + y / 64) % 2 === 0) ? 0x383850 : 0x2f2f44;
        this.add.rectangle(x, y, 62, 62, shade).setOrigin(0).setDepth(0);
      }
    }
    // Maze walls are drawn by Maze.draw(); no more random decorative bars.
  }

  _showLevelBanner() {
    const { width: W, height: H } = this.scale;
    const t = this.add.text(W / 2, H / 2, `LEVEL ${this.levelNum}\n${this.level.name}`, {
      fontFamily: 'Arial Black', fontSize: 48, color: '#7ed957',
      align: 'center', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(60);
    this.tweens.add({ targets: t, alpha: 0, duration: 700, delay: 900, onComplete: () => t.destroy() });
  }

  _gameOver() {
    if (this._dead) return;
    this._dead = true;
    AudioManager.caught();
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameOverScene', {
        level: this.levelNum, score: this.score.score, bugsKilled: this.score.bugsKilled,
      });
    });
  }

  _levelClear() {
    this._won = true;
    SaveManager.setHighScore(this.score.score);
    SaveManager.setLastLevel(this.levelNum + 1);
    AudioManager.victory();
    const next = this.levelNum + 1;
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      if (next > LEVELS.length) {
        this.scene.start('VictoryScene', { score: this.score.score, grade: this.score.grade() });
      } else {
        this.scene.start('LevelScene', { level: next });
      }
    });
  }
}

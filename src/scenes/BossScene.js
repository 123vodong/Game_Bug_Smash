// BossScene v2 — 3-boss encounter: PM (support) + Tech Lead (controller) + Deadline (environment).
// Player wins by smashing PM and Tech Lead before Deadline hits 0.
// See src/data/bosses.js for the source-of-truth design.

import { BOSSES } from '../data/bosses.js';
import { Player } from '../entities/Player.js';
import { ComboSystem } from '../systems/ComboSystem.js';
import { ScoreSystem } from '../systems/ScoreSystem.js';
import { BugSpawner } from '../systems/BugSpawner.js';
import { AISkillManager } from '../systems/AISkillManager.js';
import { TipManager } from '../systems/TipManager.js';
import { HUD } from '../ui/HUD.js';
import { AudioManager } from '../core/AudioManager.js';
import { SaveManager } from '../core/SaveManager.js';
import { isWeakTo } from '../data/bugs.js';

// Design tunables
const SPAM_WINDOW_MS = 600;
const SPAM_THRESHOLD = 3;       // 3 smashes that miss in the window
const REFLECT_IFRAME_PENALTY_MS = 250;
const REFACTOR_DISABLE_MS = 6000;
const DEADLINE_DELAY_PER_BUG_MS = 500;
const DEADLINE_DELAY_PER_SKILL_MS = 3000;
const STRESS_STAMINA_DRAIN = 30;
const SCREEN_TINT_MS = 600;

// Boss tuning
const PM = BOSSES.boss_pm;
const TL = BOSSES.boss_tech_lead;
const DL = BOSSES.boss_deadline;
const SMASH_DMG = 30;           // boss damage per smash (before skill mult)

export default class BossScene extends Phaser.Scene {
  constructor() { super('BossScene'); }
  init(data) { this.levelNum = data?.level ?? 6; }

  create() {
    const { width: W, height: H } = this.scale;
    this._drawArena();
    this._showBanner('SHIPPING DEADLINE');

    this.player = new Player(this, W / 2, H - 140);
    this.bugs = [];
    this.spawner = new BugSpawner(this);
    this.combo = new ComboSystem();
    this.score = new ScoreSystem();
    this.tipMgr = new TipManager();
    this.timeScale = 1;

    // -------- Bosses --------
    this.pm = this._createBoss('boss_pm', W / 2 - 220, 200, PM.stats.hp, 'char-pm');
    this.tl = this._createBoss('boss_tech_lead', W / 2 + 220, 200, TL.stats.hp, 'char-techlead');

    // Deadline boss = environmental countdown timer
    this.deadlineMsLeft = DL.stats.timer * 1000;
    this.deadlineSprite = this.add.sprite(W - 150, 130, 'char-deadline')
      .setDisplaySize(200, 270)
      .setDepth(40)
      .setScrollFactor(0);
    this.deadlineLabel = this.add.text(W - 150, 275, 'DEADLINE', {
      fontFamily: 'Arial Black', fontSize: 18, color: '#ff5252',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(40);
    this.deadlineTimerText = this.add.text(W - 150, 305, '', {
      fontFamily: 'Arial Black', fontSize: 34, color: '#ffd23f',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(40);

    // Boss HP bars
    this.pmHpBg = this.add.rectangle(W / 2 - 220, 280, 300, 18, 0x000, 0.7).setStrokeStyle(2, 0x6f4caf).setDepth(40);
    this.pmHpFg = this.add.rectangle(W / 2 - 220 - 149, 280, 298, 14, 0x9b6dd6).setOrigin(0, 0.5).setDepth(41);
    this.tlHpBg = this.add.rectangle(W / 2 + 220, 280, 300, 18, 0x000, 0.7).setStrokeStyle(2, 0x2d6cdf).setDepth(40);
    this.tlHpFg = this.add.rectangle(W / 2 + 220 - 149, 280, 298, 14, 0x4a8af0).setOrigin(0, 0.5).setDepth(41);

    // -------- Skill manager --------
    this.skills = new AISkillManager(this, {
      player: this.player,
      getBugs: () => this.bugs,
      getChasers: () => [],
      score: this.score,
      combo: this.combo,
      opusAutoSmash: (r) => this._opusAutoSmash(r),
      applyBugMagnet: (r) => this._applyMagnet(r),
      get timeScale() { return this.parent?.timeScale ?? 1; },
      set timeScale(v) { this.parent.timeScale = v; },
    });
    this.skills.ctx.parent = this;

    // -------- HUD --------
    this.hud = new HUD(this, {
      levelNum: this.levelNum,
      levelName: 'SHIPPING DEADLINE',
      bugsTotal: 999,
      bugsRemaining: () => this.bugs.length,
      score: this.score,
      combo: this.combo,
      skills: this.skills,
      player: this.player,
      getChasers: () => [],
      get timeLeftMs() { return this._scene.deadlineMsLeft; },
      _scene: this,
    });

    // Tip ticker
    this.time.addEvent({ delay: 1500, loop: true, callback: () => {
      const sk = this.skills.activeSkillId();
      this.hud.setTip(sk ? this.tipMgr.pickActiveSkillTip(sk) : '');
    }});

    // Events
    this.events.on('player:smash', (e) => this._resolveSmash(e));
    this.events.on('bug:aoe', (e) => {
      if (Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) < e.radius && !this.player.isInvincible(this.time.now)) {
        this._lose('aoe');
      }
    });

    // Track active-skill activations for deadline delay & track smash spam
    this.skills.events?.on?.('skill:start', () => {
      this.deadlineMsLeft = Math.min(this.deadlineMsLeft + DEADLINE_DELAY_PER_SKILL_MS, DL.stats.timer * 1000);
      this._flashDeadlineDelay('+3s');
    });
    this.recentSmashes = [];  // timestamps of smashes that hit nothing

    // Input
    this.input.keyboard.on('keydown-Q', () => this._tryActivate(0));
    this.input.keyboard.on('keydown-E', () => this._tryActivate(1));
    this.input.keyboard.on('keydown-R', () => this._tryActivate(2));
    this.input.keyboard.on('keydown-ESC', () => this.scene.start('MenuScene'));

    // Ability timers (PM scope_change, PM urgent_ping, TL refactor_request)
    this._pmScopeAt = this.time.now + 5000;
    this._pmPingAt = this.time.now + 8000;
    this._tlRefactorAt = this.time.now + 10000;
    this._skillDisabledUntil = 0;

    this._ended = false;
  }

  _createBoss(id, x, y, hp, spriteKey) {
    const sprite = this.add.sprite(x, y, spriteKey).setDisplaySize(160, 230).setDepth(8);
    return {
      id, x, y, hp, maxHp: hp,
      sprite,
      anchorX: x, anchorY: y,
      alive: true,
      spam: false,
      hitFlashUntil: 0,
    };
  }

  // ---------- Update ----------
  update(_, dtMsRaw) {
    if (!this.player || this._ended) return;
    const dtMs = dtMsRaw * this.timeScale;
    const now = this.time.now;

    this.player.update(dtMsRaw, now);

    // Bugs (any spawned by PM)
    const ctx = {
      player: this.player,
      bugCount: () => this.bugs.length,
      bugCap: 25,
      getBugs: () => this.bugs,
      spawnBug: (id, x, y) => { const b = this.spawner.spawnOne(id, x, y); if (b) this.bugs.push(b); },
    };
    for (const b of this.bugs) if (b.alive) b.update(dtMs, now, ctx);
    this.bugs = this.bugs.filter(b => b.alive);

    // Bosses
    this._updatePM(dtMs, now);
    this._updateTL(dtMs, now);

    // Deadline countdown
    this.deadlineMsLeft -= dtMsRaw;
    if (this.deadlineMsLeft <= 0) { this.deadlineMsLeft = 0; this._lose('deadline'); return; }
    this._updateDeadlineUI(now);

    // Phase effects (triggered once each)
    this._updateDeadlinePhases(now);

    // Synergy: PM alive + deadline below 60 → extra bug spawn
    if (this.pm.alive && this.deadlineMsLeft < 60000 && now > (this._synergySpawnAt ?? 0)) {
      this._synergySpawnAt = now + 5000;
      this._spawnBugsAroundPM(2, 'logic_bug');
    }

    // Cleanup expired smash records
    this.recentSmashes = this.recentSmashes.filter(t => now - t < SPAM_WINDOW_MS);

    this.combo.update(now);
    this._updateHpBars();
    this.hud.update();

    // Win check
    if (!this.pm.alive && !this.tl.alive) { this._win(); }
  }

  // ---------- PM ----------
  _updatePM(dtMs, now) {
    if (!this.pm.alive) return;
    // Patrol: drift in a slow horizontal sine + light vertical bob
    const t = now / 1000;
    this.pm.x = this.pm.anchorX + Math.sin(t * 0.6) * 80;
    this.pm.y = this.pm.anchorY + Math.cos(t * 0.4) * 16;
    this.pm.sprite.setPosition(this.pm.x, this.pm.y);
    if (this.player.x < this.pm.x - 8) this.pm.sprite.setFlipX(true);
    else if (this.player.x > this.pm.x + 8) this.pm.sprite.setFlipX(false);

    // scope_change — spawn random bugs
    if (now > this._pmScopeAt) {
      this._pmScopeAt = now + PM.behavior.abilities[0].cooldown * 1000;
      this._sayBossDialog(this.pm.sprite, PM.dialog);
      this._spawnBugsAroundPM(3);
    }

    // urgent_ping — player stress (stamina drain + screen tint)
    if (now > this._pmPingAt) {
      this._pmPingAt = now + PM.behavior.abilities[1].cooldown * 1000;
      this.player.stamina = Math.max(0, this.player.stamina - STRESS_STAMINA_DRAIN);
      this._screenTint(0xff8800, 0.18);
    }
  }

  _spawnBugsAroundPM(n, forceId = null) {
    const ids = ['classic_bug', 'logic_bug', 'memory_leaker'];
    for (let i = 0; i < n; i++) {
      const id = forceId ?? Phaser.Utils.Array.GetRandom(ids);
      const x = this.pm.x + Phaser.Math.Between(-80, 80);
      const y = this.pm.y + Phaser.Math.Between(40, 100);
      const b = this.spawner.spawnOne(id, x, y);
      if (b) this.bugs.push(b);
    }
  }

  // ---------- Tech Lead ----------
  _updateTL(dtMs, now) {
    if (!this.tl.alive) return;
    // adaptive_chase: drift toward player slowly, but stay in the upper arena
    const dt = dtMs / 1000;
    const dx = this.player.x - this.tl.x;
    const dy = (this.player.y - 120) - this.tl.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = TL.stats.speed * 90;
    this.tl.x += dx / d * speed * dt;
    this.tl.y += dy / d * speed * dt;
    // Clamp to upper half
    this.tl.y = Phaser.Math.Clamp(this.tl.y, 120, this.scale.height * 0.55);
    this.tl.sprite.setPosition(this.tl.x, this.tl.y);
    if (this.player.x < this.tl.x - 8) this.tl.sprite.setFlipX(true);
    else if (this.player.x > this.tl.x + 8) this.tl.sprite.setFlipX(false);

    // refactor_request — disable active skill + cancel current
    if (now > this._tlRefactorAt) {
      this._tlRefactorAt = now + TL.behavior.abilities[1].cooldown * 1000;
      this._refactorRequest(now);
    }
  }

  _refactorRequest(now) {
    this._sayBossDialog(this.tl.sprite, TL.dialog);
    this._skillDisabledUntil = now + REFACTOR_DISABLE_MS;
    // Cancel active skill if any
    if (this.skills.active !== null) {
      const idx = this.skills.active;
      this.skills.active = null;
      const slot = this.skills.slots[idx];
      if (slot) {
        // force-end via deactivate by calling private cleanup
        slot.def && this.skills._clearEffect && this.skills._clearEffect(slot);
      }
    }
    this._screenTint(0x4a8af0, 0.22);
    const banner = this.add.text(this.tl.x, this.tl.y - 80, 'REFACTOR REQUEST', {
      fontFamily: 'Arial Black', fontSize: 16, color: '#fff', stroke: '#000', strokeThickness: 3,
      backgroundColor: '#2d6cdf', padding: { x: 6, y: 4 },
    }).setOrigin(0.5).setDepth(45);
    this.tweens.add({ targets: banner, y: banner.y - 30, alpha: 0, duration: 1200,
      onComplete: () => banner.destroy() });
  }

  _tryActivate(slotIdx) {
    const now = this.time.now;
    if (now < this._skillDisabledUntil) {
      this._flashSkillDisabled();
      return;
    }
    this.skills.activate(slotIdx);
  }

  _flashSkillDisabled() {
    const t = this.add.text(this.scale.width / 2, this.scale.height - 100, 'SKILLS DISABLED', {
      fontFamily: 'Arial Black', fontSize: 22, color: '#ff5252', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(46);
    this.tweens.add({ targets: t, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  // ---------- Smash resolution ----------
  _resolveSmash(e) {
    const now = this.time.now;
    const ang0 = Math.atan2(e.dirY, e.dirX);
    const half = Phaser.Math.DegToRad(e.coneDeg / 2);
    let killedAny = false;
    let hitAnything = false;

    // Hit sub-bugs
    for (const b of this.bugs) {
      if (!b.alive) continue;
      const dx = b.x - e.x, dy = b.y - e.y;
      const dist = Math.hypot(dx, dy);
      if (dist > e.range + b.radius) continue;
      const ang = Math.atan2(dy, dx);
      if (Math.abs(Phaser.Math.Angle.Wrap(ang - ang0)) > half) continue;
      this._hitBug(b, now);
      hitAnything = true;
      killedAny = killedAny || !b.alive;
    }

    // Hit PM boss
    if (this._smashHitsBoss(this.pm, e, ang0, half)) {
      this._damageBoss(this.pm, 'boss_pm', now);
      hitAnything = true;
    }
    // Hit TL boss — but TL's code_review reflects if player has been spamming
    if (this._smashHitsBoss(this.tl, e, ang0, half)) {
      if (this._isPlayerSpamming(now)) {
        this._codeReviewReflect(now);
      } else {
        this._damageBoss(this.tl, 'boss_tech_lead', now);
      }
      hitAnything = true;
    }

    if (!hitAnything) this.recentSmashes.push(now);

    AudioManager.smash();
    if (killedAny) {
      const tier = this.combo.pollTierUp();
      if (tier > 0) AudioManager.comboTier();
      this.score.noteCombo(this.combo.count);
    }
  }

  _isPlayerSpamming(now) {
    this.recentSmashes = this.recentSmashes.filter(t => now - t < SPAM_WINDOW_MS);
    return this.recentSmashes.length >= SPAM_THRESHOLD - 1;
  }

  _codeReviewReflect(now) {
    // Player takes a hit (reduce i-frames), screen flashes blue
    this.player.iframeUntil = Math.max(0, this.player.iframeUntil - REFLECT_IFRAME_PENALTY_MS);
    this._screenTint(0x4a8af0, 0.35);
    const t = this.add.text(this.tl.x, this.tl.y - 60, 'CODE REVIEW REJECTED', {
      fontFamily: 'Arial Black', fontSize: 14, color: '#fff',
      stroke: '#000', strokeThickness: 3, backgroundColor: '#2d6cdf', padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(45);
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 30, duration: 900,
      onComplete: () => t.destroy() });
    // Recent smashes clear so player gets a fresh window
    this.recentSmashes = [];
  }

  _smashHitsBoss(boss, e, ang0, half) {
    if (!boss.alive) return false;
    const dx = boss.x - e.x, dy = boss.y - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist > e.range + 60) return false;
    const ang = Math.atan2(dy, dx);
    return Math.abs(Phaser.Math.Angle.Wrap(ang - ang0)) <= half;
  }

  _damageBoss(boss, bossId, now) {
    const skillHit = this.skills.onSmashHit() ?? { mult: 1, oneShot: false };
    const activeSkill = this.skills.activeSkillId();
    let mult = skillHit.mult;
    if (activeSkill && isWeakTo(bossId, activeSkill)) mult *= 3;
    const dmg = skillHit.oneShot ? boss.hp : SMASH_DMG * mult;
    boss.hp -= dmg;
    this._flashBoss(boss);
    this.score.add(15, this.combo.hit(now) * mult);

    // Bug-kill delay also applies to bug deaths during boss fight
    if (boss.hp <= 0) this._defeatBoss(boss, bossId);
  }

  _flashBoss(boss) {
    boss.sprite.setTintFill(0xffffff);
    this.time.delayedCall(80, () => boss.sprite && boss.sprite.clearTint());
  }

  _defeatBoss(boss, bossId) {
    boss.alive = false;
    boss.sprite.setAlpha(0.3);
    const def = BOSSES[bossId];
    // Final dialog
    const line = Phaser.Utils.Array.GetRandom(def.dialog ?? ['…']);
    const t = this.add.text(boss.x, boss.y - 90, `"${line}"`, {
      fontFamily: 'Comic Sans MS, sans-serif', fontSize: 16, color: '#fff',
      stroke: '#000', strokeThickness: 3,
      backgroundColor: 'rgba(0,0,0,0.65)', padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setDepth(45);
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 40, duration: 2200,
      onComplete: () => t.destroy() });
    // Defeat puff
    const burst = this.add.circle(boss.x, boss.y, 30, 0xffffff, 0.6).setDepth(45);
    this.tweens.add({ targets: burst, scale: 4, alpha: 0, duration: 500,
      onComplete: () => burst.destroy() });
    AudioManager.bugDeath();
    // Buy back deadline time
    this.deadlineMsLeft = Math.min(this.deadlineMsLeft + 20000, DL.stats.timer * 1000);
    this._flashDeadlineDelay('+20s');
  }

  _hitBug(b, now) {
    const skillHit = this.skills.onSmashHit() ?? { mult: 1, oneShot: false };
    const killed = b.hit(skillHit.mult, skillHit.oneShot);
    if (killed) {
      AudioManager.bugDeath();
      const m = this.combo.hit(now) * skillHit.mult;
      this.score.add(b.score, m);
      this.score.countKill();
      // Bug kill → push deadline back slightly
      this.deadlineMsLeft = Math.min(this.deadlineMsLeft + DEADLINE_DELAY_PER_BUG_MS, DL.stats.timer * 1000);
    }
  }

  _opusAutoSmash(radius) {
    const now = this.time.now;
    const ring = this.add.circle(this.player.x, this.player.y, radius, 0xffd23f, 0.18).setDepth(7);
    this.tweens.add({ targets: ring, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
    for (const b of this.bugs) {
      if (!b.alive) continue;
      if (Phaser.Math.Distance.Between(b.x, b.y, this.player.x, this.player.y) <= radius) {
        if (b.hit(99, true)) {
          const m = this.combo.hit(now);
          this.score.add(b.score, m);
          this.score.countKill();
        }
      }
    }
    // Opus also damages bosses in range
    for (const boss of [this.pm, this.tl]) {
      if (!boss.alive) continue;
      const d = Phaser.Math.Distance.Between(boss.x, boss.y, this.player.x, this.player.y);
      if (d <= radius + 40) {
        boss.hp -= 25;
        this._flashBoss(boss);
        if (boss.hp <= 0) this._defeatBoss(boss, boss.id);
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
        b.x += dx / d * 120 * 0.016;
        b.y += dy / d * 120 * 0.016;
      }
    }
  }

  // ---------- Deadline UI/phases ----------
  _updateDeadlineUI(now) {
    const s = Math.ceil(this.deadlineMsLeft / 1000);
    const mm = String(Math.floor(s / 60)).padStart(1, '0');
    const ss = String(s % 60).padStart(2, '0');
    this.deadlineTimerText.setText(`${mm}:${ss}`);
    // Color: red below 60, amber below 120, gold above
    const color = s <= 30 ? '#ff0033' : s <= 60 ? '#ff5252' : s <= 120 ? '#ff9800' : '#ffd23f';
    this.deadlineTimerText.setColor(color);
    // Subtle pulse on deadline sprite
    const pulse = 1 + Math.sin(now / 250) * 0.04;
    this.deadlineSprite.setScale(pulse * 1);
  }

  _updateDeadlinePhases(now) {
    const sLeft = this.deadlineMsLeft / 1000;
    if (sLeft <= 120 && !this._phase120) { this._phase120 = true; this._showBanner('SCOPE EXPANDING'); }
    if (sLeft <= 60  && !this._phase60)  { this._phase60  = true; this._showBanner('PANIC MODE'); this._screenTint(0xff5252, 0.18); }
    if (sLeft <= 30  && !this._phase30)  { this._phase30  = true; this._showBanner('SHIPPING IN 30!'); this.cameras.main.shake(400, 0.005); }
  }

  _flashDeadlineDelay(label) {
    const t = this.add.text(this.deadlineSprite.x, this.deadlineSprite.y + 70, label, {
      fontFamily: 'Arial Black', fontSize: 22, color: '#7ed957',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(45);
    this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, duration: 900,
      onComplete: () => t.destroy() });
  }

  _updateHpBars() {
    const pmPct = Math.max(0, this.pm.hp / this.pm.maxHp);
    const tlPct = Math.max(0, this.tl.hp / this.tl.maxHp);
    this.pmHpFg.width = 298 * pmPct;
    this.tlHpFg.width = 298 * tlPct;
  }

  // ---------- Helpers ----------
  _sayBossDialog(sprite, lines) {
    if (!lines?.length) return;
    const line = Phaser.Utils.Array.GetRandom(lines);
    const t = this.add.text(sprite.x, sprite.y - 90, line, {
      fontFamily: 'Comic Sans MS, sans-serif', fontSize: 14, color: '#fff',
      stroke: '#000', strokeThickness: 3,
      backgroundColor: 'rgba(0,0,0,0.65)', padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setDepth(45);
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 30, duration: 1800,
      onComplete: () => t.destroy() });
  }

  _screenTint(color, alpha) {
    const { width: W, height: H } = this.scale;
    const r = this.add.rectangle(W / 2, H / 2, W, H, color, alpha).setDepth(48).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: r, alpha: 0, duration: SCREEN_TINT_MS, onComplete: () => r.destroy() });
  }

  _showBanner(text) {
    const { width: W, height: H } = this.scale;
    const t = this.add.text(W / 2, H / 2 - 40, text, {
      fontFamily: 'Arial Black', fontSize: 48, color: '#ffd23f',
      stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(60);
    this.tweens.add({ targets: t, alpha: 0, duration: 800, delay: 900, onComplete: () => t.destroy() });
  }

  _drawArena() {
    const { width: W, height: H } = this.scale;
    this.add.rectangle(0, 0, W, H, 0x101018).setOrigin(0);
    // checker floor
    for (let y = 0; y < H; y += 64) {
      for (let x = 0; x < W; x += 64) {
        const shade = ((x / 64 + y / 64) % 2 === 0) ? 0x1a1a26 : 0x141420;
        this.add.rectangle(x, y, 62, 62, shade).setOrigin(0).setDepth(0);
      }
    }
    // Server racks back wall
    for (let i = 0; i < 6; i++) {
      const x = 80 + i * 200;
      this.add.rectangle(x, 60, 130, 100, 0x223).setStrokeStyle(2, 0x55a).setDepth(1);
      this.add.rectangle(x, 60, 100, 60, 0x4aa3ff).setAlpha(0.5).setDepth(1);
    }
  }

  _lose(reason) {
    if (this._ended) return; this._ended = true;
    AudioManager.caught();
    // Bad ending dialog
    const { width: W, height: H } = this.scale;
    const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setDepth(70);
    const title = this.add.text(W / 2, H / 2 - 60, "WHY WASN'T THIS TESTED?", {
      fontFamily: 'Arial Black', fontSize: 38, color: '#ff5252',
      stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(71);
    void overlay; void title;
    this.cameras.main.fadeOut(900, 30, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameOverScene', {
        level: this.levelNum, score: this.score.score, bugsKilled: this.score.bugsKilled,
        message: reason === 'deadline' ? 'DEADLINE HIT 0. CLIENT FURIOUS.' : 'CRITICAL FAILURE. INCIDENT CREATED.',
      });
    });
  }

  _win() {
    if (this._ended) return; this._ended = true;
    AudioManager.victory();
    SaveManager.setHighScore(this.score.score);
    const { width: W, height: H } = this.scale;
    const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setDepth(70);
    const title = this.add.text(W / 2, H / 2 - 40, "GOOD JOB. LET'S SHIP.", {
      fontFamily: 'Arial Black', fontSize: 44, color: '#7ed957',
      stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(71);
    void overlay; void title;
    this.cameras.main.fadeOut(900, 0, 30, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('VictoryScene', { score: this.score.score, grade: this.score.grade() });
    });
  }
}

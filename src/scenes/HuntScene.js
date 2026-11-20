// HuntScene — main gameplay for BUG SMASH: Deadline Hunter.
// Milestones complete:
//   M1 Pointer-follow movement + stickman pose swap + movement effects
//   M2 Bug spawner, flee AI, panic, lifetime, auto-smash on overlap + smash effects
//   M3 Deadline timer + win / lose state + retry / menu overlays
import { Hunter } from '../entities/Hunter.js';
import { BugSpawner } from '../systems/BugSpawner.js';
import { SkillManager } from '../systems/SkillManager.js';
import { SKILL_IDS } from '../data/skills.js';
import { LEVELS, TOTAL_LEVELS, starsFor } from '../data/levels.js';
import { SaveManager } from '../core/SaveManager.js';
import { Progress } from '../core/Progress.js';
import { AudioManager } from '../core/AudioManager.js';
import { TALK, pickWinCategory, pickLoseCategory, pickExchanges } from '../data/talk.js';
import {
  screenShake, impactBurst, shockwaveRing, hitNumbers,
  confettiBurst, fullScreenFlash,
} from '../effects/Effects.js';

const FAIL_MESSAGES = [
  'CUSTOMER IS ANGRY',
  'WHY IS THIS NOT FIXED?',
  '8PM EMERGENCY MEETING',
  'BUG STILL OPEN',
  'PRODUCTION IS DOWN',
  'ROLLBACK INITIATED',
];

const PLAYER_RADIUS = 24;
// Modal overlays (pause / win / lose) sit above every gameplay layer, incl. the
// finale cinematic actors (73–79); help + mute flash go above them.
const OVERLAY_DEPTH = 200;

export default class HuntScene extends Phaser.Scene {
  constructor() { super('HuntScene'); }

  init(data) {
    // Clamp incoming level index against the catalog
    let idx = data?.levelIndex ?? SaveManager.getUnlockedIndex();
    if (idx < 0) idx = 0;
    if (idx >= TOTAL_LEVELS) idx = TOTAL_LEVELS - 1;
    this.levelIndex = idx;
    this.level = LEVELS[idx];
  }

  preload() {
    this.load.svg('stick-idle',  'assets/characters/stickman/idle.svg',  { width: 144, height: 144 });
    this.load.svg('stick-run',   'assets/characters/stickman/run.svg',   { width: 144, height: 144 });
    this.load.svg('stick-smash', 'assets/characters/stickman/smash.svg', { width: 144, height: 144 });
    this.load.svg('stick-dead',  'assets/characters/stickman/dead.svg',  { width: 144, height: 144 });
    this.load.svg('stick-pm',    'assets/characters/stickman/pm.svg',    { width: 144, height: 144 });
    // Skill icons (5) — hand-drawn SVGs
    for (const id of SKILL_IDS) {
      this.load.svg(`skill-${id}`, `assets/skill_icons/skill-${id}.svg`, { width: 128, height: 128 });
    }
    // Full guide image (used as in-game help overlay)
    this.load.image('skills-guide', 'assets/ai_skills_icons/image.png');
    // VS Code workspace background
    this.load.image('bg-vscode', 'assets/background/image.png');
    // Bug sprites (8 PNGs used by Bug entity / BugSpawner)
    const BUG_SPRITES = [
      'bug-null', 'bug-ladybug', 'bug-beetle', 'bug-scarab',
      'bug-race', 'bug-robot', 'bug-toxic', 'bug-dead',
    ];
    for (const id of BUG_SPRITES) {
      this.load.image(id, `assets/bugs/${id}.png`);
    }
  }

  create() {
    // scene.restart() reuses this instance: reset every per-run field (review EP-1 — a stale
    // _winInfo let ESC skip the next clear, and the finale's 0.25 timeScale survived restarts).
    this._winInfo = null; this._heldMs = 0; this._lastPx = this._lastPy = null;
    this._helpContainer = null; this._pauseOverlay = null;
    this.time.timeScale = 1;
    const { width: W, height: H } = this.scale;
    this._drawCodeBackdrop(W, H);

    // ----- Player -----
    this.player = new Hunter(this, W / 2, H / 2);

    // ----- Bugs -----
    this.spawner = new BugSpawner(this, {
      bugHpMul:    this.level.bugHpMul,
      bugSpeedMul: this.level.bugSpeedMul,
    });
    this.totalBugs = Object.values(this.level.wave).reduce((s, n) => s + n, 0);
    this.spawner.spawnWave(this.level.wave);
    // 1-1 teaches "one click is a code review, not a fix" — make it true: the
    // first few bugs take 2 hits, so a quick tap visibly doesn't finish them.
    const tut = this.level.tutorialBugs;
    if (tut && tut.count > 0) {
      for (const b of this.spawner.bugs.slice(0, tut.count)) {
        if (b.maxHp < tut.hp) { b.maxHp = tut.hp; b.hp = tut.hp; }
      }
    }

    // ----- Skills -----
    this.skills = new SkillManager(this, {
      player: this.player,
      spawner: this.spawner,
      playerRadius: PLAYER_RADIUS,
    });
    // Skill cadence comes from the level config.
    this._skillTimer = this.time.addEvent({
      delay: this.level.skillSpawnEveryMs ?? 8000,
      startAt: 5000, loop: true,
      callback: () => { if (this.state === 'playing') this.skills.spawnAtRandomLocation(); },
    });

    // ----- Game state -----
    this.state = 'playing';                // 'playing' | 'won' | 'lost'
    this.score = 0;
    this.timeLeftMs = this.level.timeLimitMs;
    // 0..1, used by bugs to shrink hidden-respawn time as deadline approaches.
    this.deadlineProgress = 0;

    // ----- Input -----
    this.input.on('pointermove', (p) => this._onPointerMove(p));
    this.input.on('pointerdown', (p) => { this._pressAt = this.time.now; this._onPointerMove(p); });
    this.input.on('pointerup', () => this._onPointerUp());
    // ESC asks first (EP-14) — a stray key no longer throws the run away.
    this.input.keyboard.on('keydown-ESC', () => this._onEsc());
    this.input.keyboard.on('keydown-R', () => {
      // Not during the win finale before the clear is committed (same guard as ESC).
      if (this.state === 'lost' || (this.state === 'won' && this._winInfo)) this.scene.restart({ levelIndex: this.levelIndex });
    });
    this.input.keyboard.on('keydown-H', () => this._toggleHelp());
    this.input.keyboard.on('keydown-P', () => this._togglePause());
    this.input.keyboard.on('keydown-M', () => this._toggleMute());

    // Restore saved mute + volume (§3.4) & prime AudioContext on first interaction
    AudioManager.setMuted(SaveManager.isMuted());
    const vol = SaveManager.getSettings?.()?.volume;
    if (Number.isFinite(vol)) AudioManager.setVolume?.(vol);
    this.input.once('pointerdown', () => AudioManager.prime());

    // ----- HUD -----
    this._buildHUD(W, H);

    this._cleanupTimer = this.time.addEvent({
      delay: 1500, loop: true, callback: () => this.spawner.cleanup(),
    });

    // ----- World gimmick -----
    if (this.level.gimmick === 'glitchRelocate') {
      this._gimmickTimer = this.time.addEvent({
        delay: 12000, startAt: 6000, loop: true,
        callback: () => { if (this.state === 'playing') this._glitchRelocateOne(); },
      });
    }

    // ----- Combo tracking -----
    this.combo = 0;
    this.comboTimeoutMs = 0;

    // ----- Timer audio cues -----
    this._lastSecond = Math.ceil(this.timeLeftMs / 1000);
    this._warnedAt = new Set();

    // ----- 1-1 coach (EP-14): teaches move → HOLD to smash → AI tools -----
    // While it runs, the deadline waits for the first kill (or 6 s of play).
    this._coach = null;
    this._clockHeld = false;
    if (this.levelIndex === 0 && !SaveManager.getFlag?.('coachCampaign')) this._startCoach();
  }

  // ============================================================ COACH (1-1)
  _startCoach() {
    const { width: W, height: H } = this.scale;
    const touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const pill = this.add.text(W / 2, H - 120, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 20, color: '#ffffff',
      stroke: '#000', strokeThickness: 5, align: 'center',
      backgroundColor: 'rgba(5,12,24,0.78)', padding: { x: 16, y: 10 },
      wordWrap: { width: W - 120 },
    }).setOrigin(0.5).setDepth(45).setAlpha(0);
    const stepNo = this.add.text(W / 2, H - 162, '', {
      fontFamily: 'Consolas, monospace', fontSize: 12, color: '#7ec8ff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(45);
    this._coach = {
      step: 0, t: 0, moved: 0, pill, stepNo, touch,
      lines: [
        touch ? '👆 Drag your finger — you follow it like a PM follows deadlines.'
              : '🖱 Move the mouse — you follow it like a PM follows deadlines.',
        touch ? '✊ HOLD your finger on a bug to smash it.\nOne tap is a code review, not a fix.'
              : '✊ HOLD the click on a bug to smash it.\nOne click is a code review, not a fix.',
        '✨ Glowing things are AI tools. Results may vary.',
      ],
    };
    this._clockHeld = true;
    this.timerLabel?.setText('DEADLINE · starts at your first fix');
    this._coachStep(0);
  }

  _coachStep(i) {
    const co = this._coach;
    if (!co) return;
    co.step = i; co.t = 0;
    if (i >= co.lines.length) { this._endCoach(); return; }
    co.pill.setText(co.lines[i]).setScale(0.85).setAlpha(0);
    co.stepNo.setText(`TRAINING ${i + 1}/${co.lines.length}`);
    this.tweens.add({ targets: co.pill, alpha: 1, scale: 1, duration: 240, ease: 'Back.easeOut' });
    AudioManager.uiClick?.();
  }

  _endCoach() {
    const co = this._coach;
    if (!co) return;
    this._coach = null;
    SaveManager.setFlag?.('coachCampaign', true);
    this.tweens.add({
      targets: [co.pill, co.stepNo], alpha: 0, duration: 400,
      onComplete: () => { co.pill.destroy(); co.stepNo.destroy(); },
    });
  }

  _releaseClock() {
    if (!this._clockHeld) return;
    this._clockHeld = false;
    this.timerLabel?.setText('DEADLINE');
  }

  _updateCoach(dtMs) {
    const co = this._coach;
    if (!co) return;
    co.t += dtMs;
    if (co.step === 0) {
      if (co.moved > 160 || co.t > 4000) this._coachStep(1);
    } else if (co.step === 1) {
      // Gentle pulse so the HOLD line can't be missed
      co.pill.setScale(1 + 0.03 * Math.sin(this.time.now / 140));
    } else if (co.step === 2 && co.t > 5000) {
      this._coachStep(3);
    }
  }

  /** A quick tap during the HOLD step → nudge. */
  _onPointerUp() {
    const co = this._coach;
    if (!co || co.step !== 1 || this.state !== 'playing') return;
    if (this.time.now - (this._pressAt || 0) < 220) {
      co.pill.setText(co.touch ? '✊ Keep your finger DOWN — hold it on the bug!' : '✊ Keep the button DOWN — hold it on the bug!');
      this.tweens.add({ targets: co.pill, scale: 1.12, duration: 90, yoyo: true });
      this.time.delayedCall(1600, () => { if (this._coach === co && co.step === 1) co.pill.setText(co.lines[1]); });
    }
  }

  /** "glitchRelocate" gimmick: every 12 s pick one alive, visible bug and
   *  teleport it to a new random spot. Departure + arrival flashes so the
   *  player can see what moved. */
  _glitchRelocateOne() {
    if (!this.spawner || !this.spawner.bugs) return;
    const alive = this.spawner.bugs.filter(b => b.alive && b.visible);
    if (alive.length === 0) return;
    const b = alive[Math.floor(Math.random() * alive.length)];
    const margin = 60;
    const nx = margin + Math.random() * (this.scale.width  - margin * 2);
    const ny = margin + Math.random() * (this.scale.height - margin * 2);
    if (!b.sprite) return;
    // Departure flash
    const ghost = this.add.circle(b.x, b.y, 14, 0xff66aa, 0.6).setDepth(15);
    this.tweens.add({
      targets: ghost, scale: 2, alpha: 0,
      duration: 240, ease: 'Cubic.easeOut',
      onComplete: () => ghost.destroy(),
    });
    // Move
    b.x = nx; b.y = ny;
    b.sprite.setPosition(nx, ny);
    // Arrival flash
    const arrive = this.add.circle(nx, ny, 8, 0x66aaff, 0.85).setDepth(15);
    this.tweens.add({
      targets: arrive, scale: 3, alpha: 0,
      duration: 280, ease: 'Cubic.easeOut',
      onComplete: () => arrive.destroy(),
    });
  }

  update(_, dtMs) {
    // Scroll the background regardless of state (keeps the scene alive when paused)
    this._scrollCodeBackdrop(dtMs);

    if (this.state !== 'playing' || !this.player) return;
    const now = this.time.now;

    // Coach (1-1): track movement for step 1; the deadline waits up to 6 s
    if (this._coach) {
      const px = this.player.x, py = this.player.y;
      if (this._lastPx != null) this._coach.moved += Math.hypot(px - this._lastPx, py - this._lastPy);
      this._lastPx = px; this._lastPy = py;
      this._updateCoach(dtMs);
    }
    if (this._clockHeld) {
      this._heldMs = (this._heldMs || 0) + dtMs;
      if (this._heldMs >= 6000) this._releaseClock();
    }

    // Player
    this.player.update(dtMs, now);
    // Bugs
    this.spawner.update(dtMs, now, { x: this.player.x, y: this.player.y });
    // Skill pickups + timed effects
    this.skills.update(now);

    // Combo timeout
    if (this.combo > 0) {
      this.comboTimeoutMs -= dtMs;
      if (this.comboTimeoutMs <= 0) this.combo = 0;
    }

    // Smash only fires while the pointer is held down (click-to-smash).
    // Movement still follows the pointer continuously; the timer + state checks
    // below the loop must keep running, so we only gate the smash loop itself.
    const smashActive = this.input.activePointer.isDown;
    const oneShot = this.skills.oneShotActive();
    for (const bug of (smashActive ? this.spawner.bugs : [])) {
      if (!bug.alive || !bug.visible) continue;
      const d = bug.distanceTo(this.player.x, this.player.y);
      if (d < PLAYER_RADIUS + bug.radius) {
        // Opus = instant kill: deal enough damage to bring HP to 0 in one go
        const dmg = oneShot ? 999 : 1;
        const res = bug.trySmash(now, dmg);
        if (res.hit) {
          this._onSmashHit(bug, res.killed);
          if (res.killed) {
            // First kill starts the deadline (coach) and moves the coach on
            this._releaseClock();
            if (this._coach && this._coach.step === 1) this._coachStep(2);
            // Remember where the last kill happened — used to center the finale cinematic
            this._lastKillPos = {
              x: bug.x, y: bug.y,
              tex: bug.sprite?.texture?.key || 'bug-toxic',
            };
            // Combo: bump counter and add multiplier bonus to the kill score
            const prevTier = this._comboTier();
            this.combo += 1;
            this.comboTimeoutMs = 1500;
            const mult = this._comboMult();
            this.score += Math.round(bug.score * mult);
            const newTier = this._comboTier();
            if (this.combo >= 3) {
              hitNumbers(this, bug.x, bug.y - 32,
                `COMBO x${this.combo}!`, this._comboColor(), 16);
            }
            // Audio
            AudioManager.bugKill();
            if (newTier > prevTier) AudioManager.combo(newTier);
          } else {
            AudioManager.smashHit();
          }
          // Haiku debuff: smash spawns extra bugs
          const extra = this.skills.extraBugsPerHit();
          if (extra > 0 && res.hit) {
            for (let i = 0; i < extra; i++) {
              const types = ['bug-null', 'bug-ladybug', 'bug-beetle', 'bug-race'];
              const tid = types[Math.floor(Math.random() * types.length)];
              this.spawner.spawn(tid,
                bug.x + (Math.random() - 0.5) * 60,
                bug.y + (Math.random() - 0.5) * 60);
              this.totalBugs += 1;
            }
          }
        }
      }
    }

    // Tick deadline + update progress factor for bug respawn timing
    if (!this._clockHeld) this.timeLeftMs -= dtMs;
    this.deadlineProgress = 1 - Math.max(0, this.timeLeftMs / this.level.timeLimitMs);

    // Audio: warning beeps at thresholds + tick in last 10 seconds
    const currentSec = Math.ceil(this.timeLeftMs / 1000);
    if (currentSec !== this._lastSecond) {
      if ([15, 10, 5].includes(currentSec) && !this._warnedAt.has(currentSec)) {
        this._warnedAt.add(currentSec);
        AudioManager.timerWarning();
      } else if (currentSec > 0 && currentSec <= 10) {
        AudioManager.timerTick();
      }
      this._lastSecond = currentSec;
    }

    if (this.timeLeftMs <= 0) {
      this.timeLeftMs = 0;
      this._resolveEndOfTime();
    }

    // Win check (instant)
    const c = this.spawner.count();
    if (c.killed >= this.totalBugs) {
      // Show "BUGS 0/N" + the final score before the finale freezes the HUD
      this._updateHUD(c);
      this._win();
      return;
    }

    this._updateHUD(c);
  }

  // ============================================================ STATE
  _resolveEndOfTime() {
    const c = this.spawner.count();
    if (c.killed >= this.totalBugs) this._win();
    else this._lose();
  }

  _win() {
    if (this.state !== 'playing') return;
    this.state = 'won';
    if (this._coach) this._endCoach();
    this._pauseBtn?.setVisible(false);
    // Play the slow-motion finale, then run the actual win flow.
    this._playFinaleCinematic(() => this._commitWin());
  }

  _commitWin() {
    const timeBonus = Math.round(this.timeLeftMs / 100);
    this.score += timeBonus;

    // Stars + dailies + hats (EP-14 / §3.4) — one call, no separate campaignLevels add.
    // Must run BEFORE setLevelBest: SaveManager counts a level with a best score
    // as 1★ (old-save migration), which would make a first clear look like a replay.
    const prevBestScore = SaveManager.getLevelBest(this.level.id);
    const stars = starsFor(this.timeLeftMs, this.level.timeLimitMs);
    let res = { prev: 0, best: stars, improved: false, missions: [], hats: [] };
    try { res = Progress.campaignClear(this.level.id, stars) || res; } catch (e) { console.warn('[Hunt] campaignClear failed', e); }
    // Persist progress
    const beatScore = SaveManager.setLevelBest(this.level.id, this.score);
    SaveManager.setHighScore(this.score);
    const nextIndex = this.levelIndex + 1;
    SaveManager.setUnlockedIndex(nextIndex);
    if (nextIndex >= TOTAL_LEVELS) SaveManager.setCampaignCleared();
    this._winInfo = {
      stars, prevStars: res.prev | 0,
      firstClear: !(res.prev > 0) && !(prevBestScore > 0),
      newBest: !!res.improved && res.prev > 0 || (beatScore && prevBestScore > 0),
      missions: res.missions || [], hats: res.hats || [],
    };

    AudioManager.victory();
    confettiBurst(this, this.scale.width / 2, this.scale.height / 2, 48);
    confettiBurst(this, this.scale.width * 0.3, this.scale.height * 0.4, 24);
    confettiBurst(this, this.scale.width * 0.7, this.scale.height * 0.4, 24);
    this.cameras.main.flash(180, 255, 255, 200);

    // Pick win dialog category + exchanges
    const cat = pickWinCategory(this.timeLeftMs, this.level.timeLimitMs);
    const exchanges = TALK.win[cat] || [];
    this._showWinOverlay(timeBonus, nextIndex < TOTAL_LEVELS, exchanges);
  }

  // ============================================================ FINAL-BUG CINEMATIC
  /**
   * Slow-mo "anime impact" finale — multi-phase smash with oversized characters.
   * All real-time durations below; the scene clock runs at 0.25× during the
   * cinematic, so internal delayedCall values are real_ms * 0.25.
   *
   *   PHASE                          real-time    detail
   *   ─────────────────────────────────────────────────────────────────────
   *   ZOOM IN  (slow time, pan)      0 → 450      cam + actor reveal
   *   ANTICIPATION (player squash)   450 → 1200   tense build, charge glow
   *   WINDUP (laptop raised high)    1200 → 1800  arms-up pose, hold a beat
   *   SLAM (laptop crashes down)     1800 → 2050  streak + drop
   *   IMPACT (flash + freeze frame)  2050 → 2550  flash, shake, fragments
   *   AFTERMATH (bug crumbles)       2550 → 3300  shrink, stamp, particles
   *   RESTORE                        3300 → 3700  camera back, hand off
   */
  _playFinaleCinematic(onComplete) {
    const { width: W, height: H } = this.scale;
    const focus = this._lastKillPos || { x: W / 2, y: H / 2, tex: 'bug-toxic' };

    this.time.timeScale = 0.25;
    this.tweens.timeScale = 0.25;

    const cam = this.cameras.main;
    cam.pan(focus.x, focus.y - 30, 450, 'Sine.easeOut', true);
    cam.zoomTo(1.9, 450, 'Sine.easeOut', true);

    // ---------- OVERSIZED ACTORS ----------
    // Hide the live player sprite during cinematic; replace with a giant cinematic copy
    if (this.player?.sprite) this.player.sprite.setVisible(false);
    const heroX = focus.x - 140;
    const heroY = focus.y - 10;
    const hero = this.add.image(heroX, heroY, 'stick-idle')
      .setOrigin(0.5, 1).setDepth(76).setDisplaySize(260, 320);

    // Giant doomed bug at the focus point — preserve aspect ratio so the sprite
    // doesn't get squeezed into a square. Target ~180px on the longest side.
    const victim = this.add.image(focus.x + 60, focus.y, focus.tex)
      .setOrigin(0.5, 0.5).setDepth(75);
    {
      const src = this.textures.get(focus.tex).getSourceImage();
      const max = Math.max(src.width || 1, src.height || 1);
      const k = 180 / max;
      victim.setScale(k);
    }
    // Remember aspect-correct base scale so the impact squash multiplies from it.
    victim._baseScaleX = victim.scaleX;
    victim._baseScaleY = victim.scaleY;
    // Terrified shiver
    this.tweens.add({
      targets: victim, x: victim.x + 4, duration: 60,
      yoyo: true, repeat: 8, ease: 'Sine.easeInOut',
    });

    // Soft charge glow under the hero
    const glow = this.add.ellipse(heroX, heroY + 6, 200, 30, 0x39c2ff, 0.0).setDepth(74);
    this.tweens.add({ targets: glow, fillAlpha: 0.6, scaleX: 1.4, duration: 320, yoyo: true, repeat: 2 });

    // Speed-lines stream in early and again at impact
    let streaks = this._spawnSpeedLines();

    // ---------- t=450 ANTICIPATION (player squashes down, charges) ----------
    this.time.delayedCall(112, () => {
      hero.setTexture('stick-idle');
      // Squash low + lean back
      this.tweens.add({
        targets: hero, scaleX: hero.scaleX * 1.15, scaleY: hero.scaleY * 0.78,
        x: heroX - 18, angle: -6, duration: 180, ease: 'Sine.easeInOut',
      });
      // Tiny dust puff at feet
      for (let i = 0; i < 6; i++) {
        const p = this.add.circle(heroX + (Math.random() - 0.5) * 60, heroY,
          4 + Math.random() * 4, 0x9aa3b2, 0.7).setDepth(73);
        this.tweens.add({
          targets: p, y: p.y - 30 - Math.random() * 30, alpha: 0,
          duration: 360, ease: 'Cubic.easeOut', onComplete: () => p.destroy(),
        });
      }
    });

    // ---------- t=1200 WINDUP (laptop overhead) ----------
    this.time.delayedCall(300, () => {
      hero.setTexture('stick-smash');
      // Stretch tall, lean slightly back as if raising laptop overhead
      this.tweens.add({
        targets: hero, scaleX: 260 / 320 * 1.05, scaleY: 320 / 320 * 1.18,
        x: heroX - 6, angle: -10, duration: 220, ease: 'Back.easeOut',
      });
      // Hover laptop glint above head
      const glint = this.add.text(heroX + 10, heroY - 320, '✦', {
        fontFamily: 'Arial Black, sans-serif', fontSize: 36, color: '#ffffff',
      }).setOrigin(0.5).setDepth(78).setAlpha(0);
      this.tweens.add({ targets: glint, alpha: 1, scale: 1.6, duration: 160, yoyo: true,
        onComplete: () => glint.destroy() });
      // Concentric ring "charge"
      const ring = this.add.circle(heroX, heroY - 160, 30, 0xffffff, 0)
        .setStrokeStyle(3, 0x7ec8ff, 0.9).setDepth(77);
      this.tweens.add({ targets: ring, radius: 90, scale: 2.4, alpha: 0,
        duration: 280, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
      AudioManager.timerWarning?.();
    });

    // ---------- t=1800 SLAM (downward arc) ----------
    this.time.delayedCall(450, () => {
      // Big arc forward + down toward the bug
      this.tweens.add({
        targets: hero,
        x: focus.x - 20, y: focus.y + 20, angle: 18,
        scaleX: 260 / 320 * 1.25, scaleY: 320 / 320 * 0.9,
        duration: 220, ease: 'Cubic.easeIn',
      });
      // Vertical motion-blur slash trail
      const trail = this.add.rectangle(heroX + 60, focus.y - 80, 14, 220, 0xffffff, 0.85)
        .setDepth(77).setAngle(8);
      this.tweens.add({ targets: trail, alpha: 0, scaleX: 2.4, duration: 220,
        onComplete: () => trail.destroy() });
    });

    // ---------- t=2050 IMPACT (flash + freeze + fragments) ----------
    this.time.delayedCall(513, () => {
      fullScreenFlash(this, 0xffffff, 0.92, 110);
      cam.shake(520, 0.024);
      this._spawnChromaGhosts(focus.x, focus.y);
      this._spawnCodeFragments(focus.x, focus.y, 28);
      // Extra speed-lines spike
      streaks.push(...this._spawnSpeedLines());
      // Shockwave ring at impact point
      const sw = this.add.circle(focus.x, focus.y, 12, 0xffffff, 0)
        .setStrokeStyle(5, 0x39c2ff, 1).setDepth(77);
      this.tweens.add({ targets: sw, radius: 220, scale: 4, alpha: 0,
        duration: 480, ease: 'Cubic.easeOut', onComplete: () => sw.destroy() });
      // Bug squashes flat then crumbles in the next phase (multiply the
      // ASPECT-CORRECT base scale, not the live one, so the proportions stay)
      this.tweens.add({
        targets: victim,
        scaleX: victim._baseScaleX * 1.6,
        scaleY: victim._baseScaleY * 0.25,
        angle: 12, duration: 120, ease: 'Cubic.easeOut',
      });
      AudioManager.bugKill();
      AudioManager.victory();
    });

    // ---------- t=2550 AFTERMATH (bug crumbles + stamp) ----------
    this.time.delayedCall(638, () => {
      // Bug shatters into greasy green particles, then fades
      for (let i = 0; i < 14; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 80 + Math.random() * 100;
        const p = this.add.circle(focus.x, focus.y, 5 + Math.random() * 5, 0x7ed957, 0.85)
          .setDepth(76);
        this.tweens.add({
          targets: p,
          x: focus.x + Math.cos(angle) * dist,
          y: focus.y + Math.sin(angle) * dist + 40,
          alpha: 0, scale: 0.4,
          duration: 600, ease: 'Cubic.easeOut',
          onComplete: () => p.destroy(),
        });
      }
      this.tweens.add({
        targets: victim, alpha: 0,
        scaleX: victim._baseScaleX * 0.3, scaleY: victim._baseScaleY * 0.05,
        duration: 280, ease: 'Cubic.easeIn',
      });
      // Hero recovery pose
      this.tweens.add({
        targets: hero, angle: 0, y: heroY,
        duration: 220, ease: 'Back.easeOut',
      });
      // Comic stamp
      this._spawnFinishStamp(focus.x, focus.y - 80);
    });

    // ---------- t=3300 RESTORE ----------
    this.time.delayedCall(825, () => {
      this.time.timeScale = 1;
      this.tweens.timeScale = 1;
      cam.pan(W / 2, H / 2, 380, 'Sine.easeInOut', true);
      cam.zoomTo(1, 380, 'Sine.easeInOut', true);
      // Cleanup cinematic actors
      this.tweens.add({
        targets: [hero, glow], alpha: 0, duration: 320,
        onComplete: () => { hero.destroy(); glow.destroy(); },
      });
      streaks.forEach(s => s?.destroy());

      // ---------- t=3700 HAND OFF ----------
      this.time.delayedCall(380, () => onComplete?.());
    });
  }

  _spawnSpeedLines() {
    const { width: W, height: H } = this.scale;
    const created = [];
    for (let i = 0; i < 14; i++) {
      const fromLeft = Math.random() < 0.5;
      const y = 40 + Math.random() * (H - 80);
      const len = 120 + Math.random() * 180;
      const x = fromLeft ? -len / 2 : W + len / 2;
      const r = this.add.rectangle(x, y, len, 3, 0xffffff, 0.85)
        .setDepth(78).setScrollFactor(0);
      this.tweens.add({
        targets: r,
        x: fromLeft ? W + len : -len,
        alpha: 0,
        duration: 380, ease: 'Cubic.easeOut',
        onComplete: () => r.destroy(),
      });
      created.push(r);
    }
    return created;
  }

  _spawnChromaGhosts(x, y) {
    const make = (color, dx) => {
      const g = this.add.image(x + dx, y, 'stick-smash')
        .setTint(color).setAlpha(0.6).setDepth(77)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDisplaySize(180, 200);
      this.tweens.add({
        targets: g, alpha: 0, x: x + dx * 3,
        duration: 320, ease: 'Cubic.easeOut',
        onComplete: () => g.destroy(),
      });
    };
    make(0xff3344, -10);
    make(0x33ddff, 10);
  }

  _spawnCodeFragments(x, y, n) {
    const glyphs = ['{', '}', ';', '/*', '*/', '0', '1', 'NULL', 'ERR', '0xFF', '++', '<>'];
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const speed = 220 + Math.random() * 280;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const g = glyphs[Math.floor(Math.random() * glyphs.length)];
      const color = Math.random() < 0.5 ? '#7ed957' : '#7ec8ff';
      const t = this.add.text(x, y, g, {
        fontFamily: 'Consolas, monospace', fontSize: 16 + Math.floor(Math.random() * 10),
        color, stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(76);
      this.tweens.add({
        targets: t,
        x: x + vx * 0.5,
        y: y + vy * 0.5 + 80,
        alpha: 0,
        angle: (Math.random() - 0.5) * 360,
        duration: 700, ease: 'Cubic.easeOut',
        onComplete: () => t.destroy(),
      });
    }
  }

  _spawnFinishStamp(x, y) {
    const stamp = this.add.text(x, y - 60, 'FINISHED!', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 56, color: '#ffffff',
      stroke: '#000', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(79).setAngle(-12).setScale(0);
    this.tweens.add({
      targets: stamp, scaleX: 1.1, scaleY: 1.1, duration: 180, ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: stamp, alpha: 0, scaleX: 1.4, scaleY: 1.4,
          duration: 360, delay: 180, ease: 'Cubic.easeIn',
          onComplete: () => stamp.destroy(),
        });
      },
    });
  }

  _lose() {
    if (this.state !== 'playing') return;
    this.state = 'lost';
    AudioManager.failure();
    this.cameras.main.shake(400, 0.012);
    fullScreenFlash(this, 0xff0000, 0.4, 220);
    // Bug swarm: ghost bugs fly across the screen
    for (let i = 0; i < 18; i++) {
      const type = ['bug-null', 'bug-ladybug', 'bug-beetle', 'bug-toxic'][i % 4];
      const startY = Math.random() * this.scale.height;
      const g = this.add.image(-30, startY, type)
        .setDisplaySize(36, 36).setAlpha(0.55).setDepth(45);
      this.tweens.add({
        targets: g,
        x: this.scale.width + 30,
        y: startY + (Math.random() - 0.5) * 200,
        angle: 360,
        duration: 1400 + Math.random() * 800,
        ease: 'Sine.easeInOut',
        delay: i * 35,
        onComplete: () => g.destroy(),
      });
    }

    // Pick lose dialog category + exchanges
    const counts = this.spawner.count();
    const cat = pickLoseCategory(counts.killed, this.totalBugs);
    const exchanges = TALK.lose[cat] || [];
    this._showLoseOverlay(exchanges);
  }

  // ============================================================ HUD
  _buildHUD(W, H) {
    // -------- Deadline cluster: label + time number + thin slider (compact) --------
    const BAR_W = 280;
    const BAR_H = 5;
    const barX = W / 2;
    const labelY = 12;
    const timeY  = 28;
    const barY   = 58;

    // "DEADLINE" label on top
    this.timerLabel = this.add.text(barX, labelY, 'DEADLINE', {
      fontFamily: 'Consolas, monospace', fontSize: 12, color: '#9aa3b2',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 0).setDepth(40);

    // Countdown number — modest size
    this.timerText = this.add.text(barX, timeY, '01:00', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 22, color: '#ffd23f',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5, 0).setDepth(42);

    // Thin slider below the number
    this.timerBg = this.add.rectangle(barX, barY, BAR_W, BAR_H, 0x000000, 0.7)
      .setStrokeStyle(1, 0x555a6a).setDepth(40);
    this._barLeftX = barX - BAR_W / 2 + 1;
    this._barWidthMax = BAR_W - 2;
    this.timerFg = this.add.rectangle(this._barLeftX, barY, this._barWidthMax, BAR_H - 2, 0x7ed957)
      .setOrigin(0, 0.5).setDepth(41);

    // -------- Top-left: bug counter --------
    this.bugsText = this.add.text(20, 30, `BUGS ${this.totalBugs}/${this.totalBugs}`, {
      fontFamily: 'Arial Black, sans-serif', fontSize: 20, color: '#ffffff',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0, 0).setDepth(40);
    this.hiddenText = this.add.text(20, 58, '', {
      fontFamily: 'Consolas, monospace', fontSize: 11, color: '#9aa3b2',
    }).setOrigin(0, 0).setDepth(40);

    // -------- Top-right: score + level name --------
    this.scoreText = this.add.text(W - 20, 30, 'SCORE 0', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 20, color: '#ffd23f',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(1, 0).setDepth(40);
    this.levelText = this.add.text(W - 20, 58, this.level.name, {
      fontFamily: 'Consolas, monospace', fontSize: 11, color: '#9aa3b2',
    }).setOrigin(1, 0).setDepth(40);

    // Combo badge (top center, below deadline cluster — visible only when combo > 0)
    this.comboText = this.add.text(W / 2, 76, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 22, color: '#ffd23f',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5, 0).setDepth(40).setVisible(false);

    // Subtle hint
    this.add.text(W - 20, H - 30, '[hold] smash  [P] pause  [H] guide  [M] mute  [ESC] menu', {
      fontFamily: 'Consolas, monospace', fontSize: 11, color: '#6a7088',
    }).setOrigin(1, 0).setDepth(40);

    // On-screen ⏸ (touch has no P / ESC) — right of the deadline bar
    const pb = this.add.container(W / 2 + 196, 34).setDepth(44);
    const pbRing = this.add.circle(0, 0, 20, 0x05080f, 0.75).setStrokeStyle(2, 0x9aa3b2, 0.9)
      .setInteractive({ useHandCursor: true });
    const pbIcon = this.add.text(0, 0, '⏸', { fontFamily: 'Arial Black, sans-serif', fontSize: 18, color: '#e8f4ff' }).setOrigin(0.5);
    pb.add([pbRing, pbIcon]);
    pbRing.on('pointerup', () => { if (this.state === 'playing') this._togglePause(); });
    this._pauseBtn = pb;
    this._pauseBtnR = 30;
  }

  _updateHUD(c) {
    const pct = Math.max(0, this.timeLeftMs / this.level.timeLimitMs);
    // Bar width shrinks
    this.timerFg.width = this._barWidthMax * pct;
    // Bar color shifts as it depletes
    let color;
    if (pct > 0.5) color = 0x7ed957;       // green
    else if (pct > 0.25) color = 0xffd23f; // gold
    else if (pct > 0.1) color = 0xff9800;  // orange
    else color = 0xff5252;                  // red
    this.timerFg.setFillStyle(color);

    // Countdown text
    const secs = Math.max(0, Math.ceil(this.timeLeftMs / 1000));
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    this.timerText.setText(`${mm}:${ss}`);

    // Pulse only the big time number when critical
    if (secs <= 10) {
      const s = 1 + Math.sin(this.time.now / 110) * 0.08;
      this.timerText.setScale(s);
    } else {
      this.timerText.setScale(1);
    }
    // Bar color is enough urgency cue; the number color follows the bar.
    if (secs <= 5) this.timerText.setColor('#ff5252');
    else if (secs <= 15) this.timerText.setColor('#ff9800');
    else this.timerText.setColor('#ffd23f');

    // Bug counter — "bugs remaining" = bugs that haven't been killed yet
    // (includes ones currently hidden, since they'll come back)
    const remaining = this.totalBugs - c.killed;
    this.bugsText.setText(`BUGS ${remaining}/${this.totalBugs}`);
    this.hiddenText.setText(c.hidden > 0 ? `${c.hidden} hiding` : '');
    this.scoreText.setText(`SCORE ${this.score}`);

    // Combo badge
    if (this.combo >= 2) {
      const mult = this._comboMult();
      this.comboText.setVisible(true);
      this.comboText.setText(`COMBO x${this.combo}  ·  ${mult.toFixed(1)}× SCORE`);
      this.comboText.setColor(this._comboColor());
      // Subtle pulse
      const s = 1 + Math.sin(this.time.now / 90) * 0.05;
      this.comboText.setScale(s);
    } else {
      this.comboText.setVisible(false);
      this.comboText.setScale(1);
    }
  }

  // ============================================================ INPUT
  _onPointerMove(p) {
    if (this.state !== 'playing') return;
    // Don't walk toward the ⏸ button when it's tapped
    const b = this._pauseBtn;
    if (b && p.isDown && Math.hypot(p.x - b.x, p.y - b.y) < this._pauseBtnR) return;
    this.player.setTarget(p.x, p.y);
  }

  _onEsc() {
    if (this._helpContainer) { this._toggleHelp(); return; }
    if (this.state === 'playing') this._togglePause(true);
    else if (this.state === 'paused') this._togglePause();
    else if (this.state === 'lost' || (this.state === 'won' && this._winInfo)) this.scene.start('MenuScene');
  }

  // ============================================================ HIT VFX
  _onSmashHit(bug, killed) {
    this.player.triggerSmash();
    screenShake(this, killed ? 180 : 80, killed ? 0.008 : 0.003);
    impactBurst(this, bug.x, bug.y, killed ? 0xffd23f : 0xffffff, killed ? 14 : 6);
    if (killed) {
      shockwaveRing(this, bug.x, bug.y, 0xffd23f, 6);
      hitNumbers(this, bug.x, bug.y - 10, `+${bug.score}`, '#ffd23f', 20);
    } else {
      hitNumbers(this, bug.x, bug.y - 10, `${bug.hp}/${bug.maxHp}`, '#ffffff', 12);
    }
  }

  // ============================================================ OVERLAYS
  /** End of level: hide live HUD bits + pickups so nothing pokes through the overlay. */
  _clearPlayfieldForOverlay() {
    for (const o of [this.timerLabel, this.timerText, this.timerBg, this.timerFg, this.comboText, this._pauseBtn]) o?.setVisible(false);
    this.skills?._hudContainer?.setVisible(false);
    for (const p of this.skills?.pickups || []) { try { p.destroy(true); } catch (_) { /* gone */ } }
    if (this.skills?.pickups) this.skills.pickups.length = 0;
    this._skillTimer?.remove(false);
  }

  _showWinOverlay(timeBonus, hasNext, exchanges = []) {
    const { width: W, height: H } = this.scale;
    this._clearPlayfieldForOverlay();
    // Depth 200: above the player (10), pickups (6–7) and the finale actors (73–79)
    const c = this.add.container(0, 0).setDepth(OVERLAY_DEPTH);
    c.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.78));

    const title = hasNext ? 'BUGS FIXED!' : 'ALL DEADLINES MET!';
    const subtitle = hasNext
      ? 'DEPLOY SUCCESSFUL. NEXT TICKET READY.'
      : 'YOU CONQUERED THE BACKLOG.';

    c.add(this.add.text(W / 2, 96, 'YOU WIN', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 64, color: '#7ed957',
      stroke: '#000', strokeThickness: 9,
    }).setOrigin(0.5));
    c.add(this.add.text(W / 2, 142, title, {
      fontFamily: 'Arial Black, sans-serif', fontSize: 18, color: '#ccffcc',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));
    c.add(this.add.text(W / 2, 168, subtitle, {
      fontFamily: 'Consolas, monospace', fontSize: 13, color: '#9be59b',
    }).setOrigin(0.5));
    c.add(this.add.text(W / 2, 200,
      `SCORE  ${this.score - timeBonus}    TIME BONUS  +${timeBonus}    TOTAL  ${this.score}`, {
      fontFamily: 'Consolas, monospace', fontSize: 14, color: '#ffd23f',
    }).setOrigin(0.5));

    // ── Stars + NEW BEST (EP-14) ──
    const info = this._winInfo || { stars: 1, missions: [], hats: [] };
    const starRow = this.add.container(W / 2, 34);
    for (let i = 0; i < 3; i++) {
      const on = i < info.stars;
      const st = this.add.text((i - 1) * 46, 0, '★', {
        fontFamily: 'Arial Black, sans-serif', fontSize: 40, color: on ? '#ffd23f' : '#3a4050',
        stroke: '#000', strokeThickness: 5,
      }).setOrigin(0.5).setScale(on ? 0.2 : 1);
      starRow.add(st);
      if (on) {
        this.tweens.add({ targets: st, scale: 1, duration: 260, delay: 250 + i * 220, ease: 'Back.easeOut',
          onStart: () => AudioManager.combo?.(Math.min(3, i + 1)) });
      }
    }
    c.add(starRow);
    const tag = info.newBest ? 'NEW BEST!' : (info.firstClear ? 'FIRST CLEAR!' : '');
    if (tag) {
      const nb = this.add.text(W / 2 + 96, 34, tag, {
        fontFamily: 'Arial Black, sans-serif', fontSize: 16, color: '#7ed957', stroke: '#000', strokeThickness: 4,
      }).setOrigin(0, 0.5).setAngle(-6);
      this.tweens.add({ targets: nb, scale: { from: 1, to: 1.12 }, duration: 420, yoyo: true, repeat: -1 });
      c.add(nb);
    }
    if (info.stars < 3) {
      c.add(this.add.text(W / 2 - 96, 34, info.stars < 2 ? '2★ = 25% time left' : '3★ = 45% time left', {
        fontFamily: 'Consolas, monospace', fontSize: 11, color: '#9aa3b2',
      }).setOrigin(1, 0.5));
    }
    // Missions / hats earned by this clear
    const rewards = [
      ...info.missions.map((m) => `✅ Daily mission complete: ${m.text}`),
      ...info.hats.map((h) => `🎉 New hat unlocked: ${h.emoji} ${h.name}`),
    ];
    if (rewards.length) {
      AudioManager.reward?.();
      c.add(this.add.text(W / 2, H - 150, rewards.join('\n'), {
        fontFamily: 'Arial Black, sans-serif', fontSize: 14, color: '#7ed957',
        stroke: '#000', strokeThickness: 4, align: 'center',
      }).setOrigin(0.5, 1).setDepth(63));
    }

    const buttons = hasNext
      ? [
          { label: 'NEXT LEVEL',  color: 0x7ed957, action: () => this.scene.restart({ levelIndex: this.levelIndex + 1 }) },
          { label: 'MENU',        color: 0x2d6cdf, action: () => this.scene.start('MenuScene') },
        ]
      : [
          { label: 'PLAY AGAIN',  color: 0x7ed957, action: () => this.scene.restart({ levelIndex: 0 }) },
          { label: 'MENU',        color: 0x2d6cdf, action: () => this.scene.start('MenuScene') },
        ];
    // World 1 done → point them at the online arena (EP-14)
    if (this.levelIndex === 2) {
      buttons.splice(1, 0, { label: 'PLAY ONLINE ▶', color: 0x39a0d0, action: () => this.scene.start('MultiPlayScene') });
    }
    this._playEndDialog(c, exchanges, buttons);
  }

  _showLoseOverlay(exchanges = []) {
    const { width: W, height: H } = this.scale;
    const msg = FAIL_MESSAGES[Math.floor(Math.random() * FAIL_MESSAGES.length)];
    const c = this.spawner.count();
    this._clearPlayfieldForOverlay();
    const container = this.add.container(0, 0).setDepth(OVERLAY_DEPTH);
    container.add(this.add.rectangle(W / 2, H / 2, W, H, 0x300000, 0.82));
    container.add(this.add.text(W / 2, 96, 'YOU LOSE', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 64, color: '#ff8a3d',
      stroke: '#000', strokeThickness: 9,
    }).setOrigin(0.5));
    container.add(this.add.text(W / 2, 142, 'Better luck next time!', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 18, color: '#ffd6b8',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));
    container.add(this.add.text(W / 2, 168, msg, {
      fontFamily: 'Consolas, monospace', fontSize: 13, color: '#ffaaaa',
    }).setOrigin(0.5));
    container.add(this.add.text(W / 2, 200,
      `bugs unfixed ${c.alive}     bugs hiding ${c.hidden}     score ${this.score}`, {
      fontFamily: 'Consolas, monospace', fontSize: 14, color: '#ffd6d6',
    }).setOrigin(0.5));

    const buttons = [
      { label: 'RETRY (R)',  color: 0xf5a623, action: () => this.scene.restart({ levelIndex: this.levelIndex }) },
      { label: 'MENU (ESC)', color: 0x2d6cdf, action: () => this.scene.start('MenuScene') },
    ];
    this._playEndDialog(container, exchanges, buttons);
  }

  // ============================================================ END-OF-GAME DIALOG
  /**
   * Layout DEV ↔ PM characters + speech bubble at the bottom of the overlay,
   * cycle through `exchanges` (each = { pm, dev }) with auto-advance.
   * After the last line, reveal the action buttons.
   */
  _playEndDialog(container, exchanges, buttons) {
    const { width: W, height: H } = this.scale;
    const charY = H * 0.62;

    // Characters — PM left, DEV right, both at full color all the time
    const pm  = this.add.sprite(W * 0.26, charY, 'stick-pm')
      .setDisplaySize(200, 240).setDepth(61).setFlipX(false);
    const dev = this.add.sprite(W * 0.74, charY, 'stick-idle')
      .setDisplaySize(200, 240).setDepth(61).setFlipX(true);
    container.add([pm, dev]);

    // Both bubbles always visible
    const bubbleW = W * 0.30, bubbleH = 110;
    const pmBubbleX  = W * 0.26 + 80;
    const devBubbleX = W * 0.74 - 80;
    const bubbleY    = charY - 160;

    const pmBubble  = this._makeComicBubble(pmBubbleX,  bubbleY, bubbleW, bubbleH, 'PM',  0xff5252, 'left');
    const devBubble = this._makeComicBubble(devBubbleX, bubbleY, bubbleW, bubbleH, 'DEV', 0x39c2ff, 'right');
    container.add([pmBubble.container, devBubble.container]);

    // Action buttons appear immediately too
    this._revealEndButtons(container, buttons);

    if (!exchanges || exchanges.length === 0) return;

    // Show the first exchange immediately
    // Start at a different line per level so back-to-back wins don't repeat the joke
    let idx = (this.levelIndex * 3 + Math.floor(Math.random() * exchanges.length)) % exchanges.length;
    const renderExchange = (i) => {
      const ex = exchanges[i % exchanges.length];
      pmBubble.text.setText(ex.pm || '');
      devBubble.text.setText(ex.dev || '');
      // Pop both bubbles
      [pmBubble.container, devBubble.container].forEach(c => {
        c.setScale(0.92);
        this.tweens.add({
          targets: c, scaleX: 1, scaleY: 1, duration: 180, ease: 'Back.easeOut',
        });
      });
      // Subtle character pop in sequence (PM first, DEV a beat later)
      this.tweens.add({
        targets: pm,
        scaleX: pm.scaleX * 1.05, scaleY: pm.scaleY * 1.05,
        duration: 120, yoyo: true, ease: 'Sine.easeOut',
      });
      this.time.delayedCall(700, () => {
        this.tweens.add({
          targets: dev,
          scaleX: dev.scaleX * 1.05, scaleY: dev.scaleY * 1.05,
          duration: 120, yoyo: true, ease: 'Sine.easeOut',
        });
      });
      AudioManager.uiClick();
    };

    renderExchange(idx);

    // Auto-rotate every 5s
    this.time.addEvent({
      delay: 5000,
      loop: true,
      callback: () => {
        idx = (idx + 1) % exchanges.length;
        renderExchange(idx);
      },
    });
  }

  /**
   * Comic-style speech bubble: white rounded rect with black border,
   * a colored tag badge ("PM"/"DEV") sitting on the top-left/right corner,
   * and a tail pointing toward the speaker below.
   * @param {string} tailSide 'left' = bubble belongs to right-side character (tail points down-right)
   */
  _makeComicBubble(x, y, w, h, label, tagColor, tailSide) {
    const c = this.add.container(x, y).setDepth(62);

    // Tail (drawn first so border overlaps cleanly)
    const tail = this.add.graphics();
    tail.fillStyle(0xffffff, 1).lineStyle(3, 0x000000, 1);
    const tx = (tailSide === 'left') ? -w / 2 + 30 : w / 2 - 30;
    const tipX = (tailSide === 'left') ? -w / 2 + 60 : w / 2 - 60;
    tail.beginPath();
    tail.moveTo(tx - 10, h / 2 - 2);
    tail.lineTo(tx + 10, h / 2 - 2);
    tail.lineTo(tipX, h / 2 + 30);
    tail.closePath();
    tail.fillPath();
    tail.strokePath();

    // Bubble body — white rounded rect with black border
    const body = this.add.graphics();
    body.fillStyle(0xffffff, 1).lineStyle(3, 0x000000, 1);
    body.fillRoundedRect(-w / 2, -h / 2, w, h, 18);
    body.strokeRoundedRect(-w / 2, -h / 2, w, h, 18);

    // Cover the seam between tail-base and bubble bottom with white
    const seam = this.add.rectangle(tx, h / 2 - 1, 18, 4, 0xffffff).setOrigin(0.5, 1);

    // Tag badge in top corner — same side as the tail
    const tagX = (tailSide === 'left') ? -w / 2 + 36 : w / 2 - 36;
    const tagY = -h / 2 - 4;
    const tagBg = this.add.graphics();
    tagBg.fillStyle(tagColor, 1).lineStyle(3, 0x000000, 1);
    tagBg.fillRoundedRect(tagX - 28, tagY - 14, 56, 28, 6);
    tagBg.strokeRoundedRect(tagX - 28, tagY - 14, 56, 28, 6);
    const tagText = this.add.text(tagX, tagY, label, {
      fontFamily: 'Arial Black, sans-serif', fontSize: 16, color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    // Bubble text (dark on white)
    const text = this.add.text(0, 0, '', {
      fontFamily: 'Comic Sans MS, Arial Black, sans-serif', fontSize: 22, color: '#101018',
      fontStyle: 'bold',
      align: 'center', wordWrap: { width: w - 32, useAdvancedWrap: true },
    }).setOrigin(0.5);

    c.add([tail, body, seam, tagBg, tagText, text]);
    return { container: c, text };
  }

  _revealEndButtons(container, buttons) {
    const { width: W, height: H } = this.scale;
    const y = H - 90;
    const spread = 220;
    const startX = W / 2 - (buttons.length - 1) * spread / 2;
    buttons.forEach((b, i) => {
      const btn = this._makeButton(startX + i * spread, y, b.label, b.color, b.action);
      btn.setAlpha(0);
      container.add(btn);
      this.tweens.add({ targets: btn, alpha: 1, duration: 240, delay: i * 80 });
    });
  }

  _addOverlayButtons(container, cx, y) {
    container.add(this._makeButton(cx - 100, y, 'RETRY (R)',  0xf5a623,
      () => this.scene.restart({ levelIndex: this.levelIndex })));
    container.add(this._makeButton(cx + 100, y, 'MENU (ESC)', 0x2d6cdf,
      () => this.scene.start('MenuScene')));
  }

  _makeButton(x, y, label, color, onClick) {
    const c = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, 180, 48, color)
      .setStrokeStyle(3, 0x000000)
      .setInteractive({ useHandCursor: true });
    const txt = this.add.text(0, 0, label, {
      fontFamily: 'Arial Black, sans-serif', fontSize: 18, color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    c.add([bg, txt]);
    bg.on('pointerover', () => c.setScale(1.06));
    bg.on('pointerout',  () => c.setScale(1));
    bg.on('pointerdown', () => c.setScale(0.95));
    bg.on('pointerup',   () => { c.setScale(1.06); onClick(); });
    return c;
  }

  // ============================================================ COMBO
  _comboMult() {
    if (this.combo >= 10) return 3;
    if (this.combo >= 5)  return 2;
    if (this.combo >= 3)  return 1.5;
    return 1;
  }
  _comboColor() {
    if (this.combo >= 10) return '#ff5252';
    if (this.combo >= 5)  return '#ff9800';
    if (this.combo >= 3)  return '#ffd23f';
    return '#ffffff';
  }
  _comboTier() {
    if (this.combo >= 10) return 3;
    if (this.combo >= 5)  return 2;
    if (this.combo >= 3)  return 1;
    return 0;
  }

  // ============================================================ AUDIO
  _toggleMute() {
    const m = AudioManager.toggleMute();
    SaveManager.setMuted(m);
    // Quick flash so user sees feedback even if muted
    const { width: W } = this.scale;
    const t = this.add.text(W / 2, 100, m ? '🔇 MUTED' : '🔊 SOUND ON', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 18, color: '#ffd23f',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(OVERLAY_DEPTH + 20);
    this.tweens.add({ targets: t, alpha: 0, y: 70, duration: 900,
      onComplete: () => t.destroy() });
  }

  // ============================================================ PAUSE
  /** P / ⏸ toggles; ESC opens the same card phrased as "leave?" (quitAsk). */
  _togglePause(quitAsk = false) {
    if (this.state === 'playing') {
      this.state = 'paused';
      AudioManager.pause();
      const { width: W, height: H } = this.scale;
      const c = this.add.container(0, 0).setDepth(OVERLAY_DEPTH);
      // Interactive backdrop swallows taps so they don't steer the hunter
      c.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.65).setInteractive());
      c.add(this.add.text(W / 2, H / 2 - 80, quitAsk ? 'LEAVE THE LEVEL?' : 'PAUSED', {
        fontFamily: 'Arial Black, sans-serif', fontSize: 48, color: '#ffd23f',
        stroke: '#000', strokeThickness: 6,
      }).setOrigin(0.5));
      c.add(this.add.text(W / 2, H / 2 - 30, quitAsk
        ? "This attempt won't be saved. ESC again = keep smashing."
        : 'press P to resume', {
        fontFamily: 'Consolas, monospace', fontSize: 14, color: '#9aa3b2',
      }).setOrigin(0.5));
      c.add(this._makeButton(W / 2 - 110, H / 2 + 40, quitAsk ? 'KEEP SMASHING' : 'RESUME', 0x7ed957,
        () => this._togglePause()));
      c.add(this._makeButton(W / 2 + 110, H / 2 + 40, quitAsk ? 'QUIT TO MENU' : 'MENU', 0x2d6cdf,
        () => this.scene.start('MenuScene')));
      this._pauseOverlay = c;
    } else if (this.state === 'paused') {
      if (this._pauseOverlay) { this._pauseOverlay.destroy(); this._pauseOverlay = null; }
      this.state = 'playing';
      AudioManager.resume();
    }
  }


  // ============================================================ HELP OVERLAY
  _toggleHelp() {
    if (this._helpContainer) {
      this._helpContainer.destroy();
      this._helpContainer = null;
      return;
    }
    const { width: W, height: H } = this.scale;
    const c = this.add.container(0, 0).setDepth(OVERLAY_DEPTH + 10);
    c.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.85));
    // Scale the 1536x1024 guide image to fit
    const img = this.add.image(W / 2, H / 2 - 20, 'skills-guide');
    const scale = Math.min((W - 80) / img.width, (H - 140) / img.height);
    img.setScale(scale);
    c.add(img);
    c.add(this.add.text(W / 2, H - 30, 'press H or click anywhere to close', {
      fontFamily: 'Consolas, monospace', fontSize: 14, color: '#cccccc',
    }).setOrigin(0.5));
    // Click to dismiss
    const dismisser = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this._toggleHelp());
    c.add(dismisser);
    this._helpContainer = c;
  }

  // ============================================================ BACKDROP
  _drawCodeBackdrop(W, H) {
    // NEW: VS Code workspace background image, scaled to cover, darkened so gameplay reads on top.
    // Old procedural scrolling code backdrop is kept below (commented out) in case we want to roll back.
    const bg = this.add.image(W / 2, H / 2, 'bg-vscode').setDepth(-10);
    const tex = this.textures.get('bg-vscode').getSourceImage();
    if (tex && tex.width) {
      const scale = Math.max(W / tex.width, H / tex.height);
      bg.setScale(scale);
    }
    this.add.rectangle(0, 0, W, H, 0x000000, 0.42).setOrigin(0).setDepth(-9);
    this._codeBgLines = null; // disables _scrollCodeBackdrop

    /* --- OLD procedural backdrop (kept for rollback) ---
    // Static layers
    this.add.rectangle(0, 0, W, H, 0x1e1e2e).setOrigin(0).setDepth(-10);
    this.add.rectangle(0, 0, 32, H, 0x252535).setOrigin(0).setDepth(-9);
    this.add.rectangle(32, 0, W - 32, 22, 0x2a2a3a).setOrigin(0).setDepth(-9);
    this.add.text(40, 5, 'main.c   bug.c   smash.c', {
      fontFamily: 'Consolas, monospace', fontSize: 11, color: '#9aa3b2',
    }).setDepth(-8);

    // Scrolling code lines — each is a container we shift upward each frame
    this._codeBgPalette = [0x569cd6, 0xdcdcaa, 0xd4d4d4, 0xce9178, 0x6a9955, 0xd4d4d4, 0x569cd6, 0xd4d4d4];
    this._codeBgStartY = 32;
    this._codeBgEndY = H - 22;
    this._codeBgLineH = 16;
    this._codeBgLines = [];
    this._codeBgLineCounter = 1;
    const totalLines = Math.ceil((this._codeBgEndY - this._codeBgStartY) / this._codeBgLineH) + 2;
    for (let i = 0; i < totalLines; i++) {
      const y = this._codeBgStartY + i * this._codeBgLineH;
      this._codeBgLines.push(this._makeCodeLine(y, W));
    }

    // Status bar
    this.add.rectangle(0, H - 18, W, 18, 0x007acc).setOrigin(0).setDepth(-8);
    this.add.text(36, H - 16, 'main', {
      fontFamily: 'Consolas, monospace', fontSize: 10, color: '#ffffff',
    }).setDepth(-7);
    this.add.text(W - 100, H - 16, 'C  |  UTF-8  |  Ln 1', {
      fontFamily: 'Consolas, monospace', fontSize: 10, color: '#ffffff',
    }).setDepth(-7);
    --- end old backdrop --- */
  }

  _makeCodeLine(y, W) {
    const palette = this._codeBgPalette;
    const container = this.add.container(0, y).setDepth(-8);
    const lineNum = this.add.text(36, 0, String(this._codeBgLineCounter++).padStart(3, ' '), {
      fontFamily: 'Consolas, monospace', fontSize: 10, color: '#555a6a',
    }).setOrigin(0, 0);
    container.add(lineNum);

    const indent = 70 + (Math.random() < 0.3 ? 30 : 0) + (Math.random() < 0.2 ? 30 : 0);
    const tokens = 1 + Math.floor(Math.random() * 3);
    let x = indent;
    for (let t = 0; t < tokens; t++) {
      const color = palette[Math.floor(Math.random() * palette.length)];
      const len = 30 + Math.random() * 120;
      const r = this.add.rectangle(x, 8, len, 3, color, 0.5).setOrigin(0, 0.5);
      container.add(r);
      x += len + 8;
      if (x > W - 50) break;
    }
    return container;
  }

  _scrollCodeBackdrop(dtMs) {
    if (!this._codeBgLines) return;
    const speed = 10; // px/sec scroll up
    const dy = -speed * dtMs / 1000;
    const wrapTop = this._codeBgStartY - this._codeBgLineH;
    const lastY = this._codeBgEndY;
    const lineH = this._codeBgLineH;
    for (const line of this._codeBgLines) {
      line.y += dy;
      if (line.y < wrapTop) {
        // Recycle this line to the bottom with fresh content
        const maxY = Math.max(...this._codeBgLines.map(l => l.y));
        line.y = maxY + lineH;
        // Regenerate text + tokens
        line.removeAll(true);
        const lineNum = this.add.text(36, 0, String(this._codeBgLineCounter++).padStart(3, ' '), {
          fontFamily: 'Consolas, monospace', fontSize: 10, color: '#555a6a',
        }).setOrigin(0, 0);
        line.add(lineNum);
        const palette = this._codeBgPalette;
        const indent = 70 + (Math.random() < 0.3 ? 30 : 0) + (Math.random() < 0.2 ? 30 : 0);
        const tokens = 1 + Math.floor(Math.random() * 3);
        let x = indent;
        for (let t = 0; t < tokens; t++) {
          const color = palette[Math.floor(Math.random() * palette.length)];
          const len = 30 + Math.random() * 120;
          const r = this.add.rectangle(x, 8, len, 3, color, 0.5).setOrigin(0, 0.5);
          line.add(r);
          x += len + 8;
          if (x > this.scale.width - 50) break;
        }
      }
    }
  }
}

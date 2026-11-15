// MPBossView — client rendering for THE DEADLINE world boss:
// world sprite + name, a big screen-top HP bar, slam telegraphs (red circles
// that fill up before landing) and the impact / death effects.
// Server owns all logic (server/game/EventDirector.js → BossFight).
import { AudioManager } from '../core/AudioManager.js';

const BAR_W = 440;
const SPRITE_W = 150;
const SPRITE_H = 183; // matches assets/boss/deadline.png aspect (246×300)

export class MPBossView {
  constructor(scene) {
    this.scene = scene;
    this.rec = null;        // { id, c, sprite, glow, target, hp, maxHp, phase, alive }
    this.tele = [];         // pending slam telegraphs
    this._dmgAcc = 0;       // batched boss damage (one number per ~300 ms)
    this._dmgFlushAt = 0;
    const W = scene.scale.width;
    this.bar = scene.add.container(W / 2, 132).setScrollFactor(0).setDepth(56).setVisible(false);
    const bg = scene.add.rectangle(0, 0, BAR_W + 4, 16, 0x000000, 0.75).setStrokeStyle(2, 0xff3b3b, 0.9);
    this._barFill = scene.add.rectangle(-BAR_W / 2, 0, BAR_W, 12, 0xff3b3b, 1).setOrigin(0, 0.5);
    this._barTrail = scene.add.rectangle(-BAR_W / 2, 0, BAR_W, 12, 0xffffff, 0.55).setOrigin(0, 0.5);
    this._barText = scene.add.text(0, 0, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 11, color: '#ffffff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    this._barLabel = scene.add.text(-BAR_W / 2, -17, '⏰ THE DEADLINE', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 12, color: '#ff8a8a', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0, 0.5);
    this.bar.add([bg, this._barTrail, this._barFill, this._barText, this._barLabel]);
    this._trailW = BAR_W;
  }

  get alive() { return !!(this.rec && this.rec.alive); }
  get id() { return this.rec?.id ?? null; }
  /** Live world position (lerped), or null. */
  pos() { return this.alive ? { x: this.rec.c.x, y: this.rec.c.y } : null; }

  add(id, b) {
    const s = this.scene;
    this.remove(true);
    const c = s.add.container(b.x, b.y).setDepth(9);
    const shadow = s.add.ellipse(0, 62, 160, 36, 0x000000, 0.45);
    const glow = s.add.circle(0, -10, 100, 0xff2020, 0.16);
    const sprite = s.textures.exists('boss-deadline')
      ? s.add.image(0, -24, 'boss-deadline').setDisplaySize(SPRITE_W, SPRITE_H)
      : s.add.circle(0, -10, 70, 0xff3b3b, 1).setStrokeStyle(4, 0x000000);
    const name = s.add.text(0, -24 - SPRITE_H / 2 - 14, 'THE DEADLINE', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 16, color: '#ff5252', stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5);
    c.add([shadow, glow, sprite, name]);
    this.rec = {
      id, c, sprite, glow, name, shadow,
      target: { x: b.x, y: b.y }, hp: b.hp, maxHp: Math.max(1, b.maxHp), phase: b.phase, alive: true,
      entering: true, // update() leaves sprite.y alone until the entrance lands
    };
    this._dmgAcc = 0;
    this._dmgFlushAt = 0;
    // Entrance: slam down from the sky
    sprite.y = -420; sprite.setAlpha(0);
    const rec = this.rec;
    s.tweens.add({
      targets: sprite, y: -24, alpha: 1, duration: 520, ease: 'Bounce.easeOut',
      onComplete: () => {
        rec.entering = false;
        if (rec.c.scene) this._impactFx(rec.c.x, rec.c.y + 40, 140, true);
      },
    });
    s.tweens.add({ targets: glow, alpha: { from: 0.10, to: 0.28 }, scale: { from: 0.95, to: 1.08 },
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.bar.setVisible(true).setAlpha(0);
    s.tweens.add({ targets: this.bar, alpha: 1, duration: 300 });
    this._trailW = BAR_W;
    this._redrawBar();
    AudioManager.bossRoar?.();
  }

  sync(b) {
    if (!this.rec) return;
    this.rec.target.x = b.x;
    this.rec.target.y = b.y;
    this.rec.maxHp = Math.max(1, b.maxHp);
  }

  onHp(newHp, oldHp) {
    const r = this.rec;
    if (!r) return;
    const prev = (oldHp == null) ? r.hp : oldHp;
    r.hp = newHp;
    this._redrawBar();
    const dmg = prev - newHp;
    if (dmg > 0) {
      // 8+ raiders hitting at once made an unreadable pile of numbers —
      // batch them into one number every ~300 ms (flushed in update()).
      this._dmgAcc += dmg;
      if (r.sprite.setTint) {
        r.sprite.setTint(0xff9a9a);
        this.scene.time.delayedCall(70, () => { if (r.sprite.scene && r.alive) this._applyPhaseTint(); });
      }
    }
  }

  _flushDamage(now) {
    const r = this.rec;
    if (!r || this._dmgAcc <= 0 || now - this._dmgFlushAt < 300) return;
    this._dmgFlushAt = now;
    this.scene._spawnDamageNumber?.(r.c.x + (Math.random() - 0.5) * 70, r.c.y - 130, this._dmgAcc, { kind: 'bug' });
    this._dmgAcc = 0;
  }

  onPhase(phase) {
    const r = this.rec;
    if (!r) return;
    r.phase = phase;
    if (phase >= 2) {
      this._applyPhaseTint();
      this.scene.tweens.add({ targets: r.sprite, scaleX: r.sprite.scaleX * 1.12, scaleY: r.sprite.scaleY * 1.12, duration: 260, ease: 'Back.easeOut' });
      r.glow.setFillStyle(0xff0000, 0.3);
      this.scene.cameras.main.shake(380, 0.012);
      AudioManager.bossRoar?.();
    }
  }

  _applyPhaseTint() {
    const r = this.rec;
    if (!r || !r.sprite.setTint) return;
    if (r.phase >= 2) r.sprite.setTint(0xffb0b0); else r.sprite.clearTint();
  }

  /** Server says the boss is done (alive → false): defeated (hp 0) or the
   *  deadline was missed (hp > 0 — it gloats and walks off instead). */
  onDeath() {
    const r = this.rec;
    if (!r || !r.alive) return;
    r.alive = false;
    const s = this.scene;
    const x = r.c.x, y = r.c.y;
    this._clearTelegraphs();
    if (r.hp > 0) {
      const laugh = s.add.text(x, y - 150, 'HA HA HA!', {
        fontFamily: 'Arial Black, sans-serif', fontSize: 26, color: '#ff5252', stroke: '#000', strokeThickness: 6,
      }).setOrigin(0.5).setDepth(22);
      s.tweens.add({ targets: laugh, y: y - 200, alpha: 0, duration: 1400, ease: 'Cubic.easeOut', onComplete: () => laugh.destroy() });
      s.tweens.add({ targets: r.c, scale: 1.25, alpha: 0, duration: 1200, ease: 'Cubic.easeIn' });
      s.tweens.add({ targets: this.bar, alpha: 0, duration: 600 });
      AudioManager.bossRoar?.();
      return;
    }
    this._impactFx(x, y, 220, false);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 220;
      const colors = [0xffd23f, 0x7ed957, 0x39c2ff, 0xff5e94, 0xffffff];
      const p = s.add.rectangle(x, y - 30, 8, 5, colors[i % colors.length], 1).setDepth(21).setAngle(Math.random() * 360);
      s.tweens.add({
        targets: p, x: x + Math.cos(a) * d, y: y - 30 + Math.sin(a) * d + 60, angle: p.angle + 360,
        alpha: 0, duration: 900 + Math.random() * 500, ease: 'Cubic.easeOut', onComplete: () => p.destroy(),
      });
    }
    s.tweens.add({ targets: r.sprite, scaleY: 0.05, scaleX: r.sprite.scaleX * 1.5, alpha: 0, duration: 520, ease: 'Cubic.easeIn' });
    s.tweens.add({ targets: [r.glow, r.name, r.shadow], alpha: 0, duration: 520 });
    s.tweens.add({ targets: this.bar, alpha: 0, duration: 600, delay: 400 });
    this._clearTelegraphs();
  }

  /** Remove the view (boss left state). `instant` skips the fade. */
  remove(instant = false) {
    const r = this.rec;
    if (!r) return;
    this.rec = null;
    this._clearTelegraphs();
    if (instant) { r.c.destroy(); this.bar.setVisible(false); return; }
    this.scene.tweens.add({ targets: r.c, alpha: 0, duration: 300, onComplete: () => r.c.destroy() });
    this.scene.tweens.add({ targets: this.bar, alpha: 0, duration: 300, onComplete: () => this.bar.setVisible(false) });
  }

  // ───────── slam telegraphs ─────────
  slam({ x, y, r, ms }) {
    const s = this.scene;
    const g = s.add.graphics().setDepth(4);
    this.tele.push({ g, x, y, r, t0: s.time.now, ms: Math.max(200, ms) });
    // Warn the local player if they're standing in it
    const me = s.localPos;
    if (me && Math.hypot(me.x - x, me.y - y) < r + 10) AudioManager.timerWarning?.();
  }

  slamHit({ x, y, r }) {
    let best = -1, bestD = Infinity;
    this.tele.forEach((t, i) => {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best >= 0 && bestD < 40) { this.tele[best].g.destroy(); this.tele.splice(best, 1); }
    this._impactFx(x, y, r, true);
  }

  _clearTelegraphs() {
    for (const t of this.tele) t.g.destroy();
    this.tele.length = 0;
  }

  _impactFx(x, y, r, shake) {
    const s = this.scene;
    const ring = s.add.circle(x, y, r * 0.3, 0xffffff, 0.0).setStrokeStyle(6, 0xff5252, 0.95).setDepth(20);
    s.tweens.add({ targets: ring, radius: r * 1.15, alpha: 0, duration: 380, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    const flash = s.add.circle(x, y, r, 0xffffff, 0.35).setDepth(5);
    s.tweens.add({ targets: flash, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.3;
      const d = s.add.circle(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, 6, 0xc8b6a0, 0.7).setDepth(6);
      s.tweens.add({ targets: d, x: x + Math.cos(a) * r * 1.1, y: y + Math.sin(a) * r * 1.1, alpha: 0, scale: 2,
        duration: 420, ease: 'Cubic.easeOut', onComplete: () => d.destroy() });
    }
    const me = s.localPos;
    if (shake && me) {
      const dist = Math.hypot(me.x - x, me.y - y);
      if (dist < r + 420) s.cameras.main.shake(220, dist < r ? 0.016 : 0.007);
    }
    AudioManager.slamImpact?.();
  }

  _redrawBar() {
    const r = this.rec;
    if (!r) return;
    const ratio = Math.max(0, Math.min(1, r.hp / r.maxHp));
    this._barFill.width = BAR_W * ratio;
    this._barText.setText(`${Math.max(0, r.hp | 0)} / ${r.maxHp | 0}${r.phase >= 2 ? '   ·   ENRAGED' : ''}`);
  }

  update(dtMs) {
    const s = this.scene;
    const now = s.time.now;
    const r = this.rec;
    if (r && r.alive) {
      const k = Math.min(1, 6 * dtMs / 1000);
      r.c.x += (r.target.x - r.c.x) * k;
      r.c.y += (r.target.y - r.c.y) * k;
      // Stomp-walk bob (not during the entrance drop — its tween owns sprite.y)
      if (!r.entering) {
        r.sprite.y = -24 + Math.sin(now / (r.phase >= 2 ? 110 : 170)) * 3;
        r.sprite.angle = Math.sin(now / 300) * (r.phase >= 2 ? 4 : 2);
      }
      this._flushDamage(now);
    }
    // HP trail (white bar that catches up to the red one — reads damage chunks)
    const fillW = this._barFill.width;
    if (this._trailW > fillW) this._trailW = Math.max(fillW, this._trailW - BAR_W * 0.6 * dtMs / 1000);
    else this._trailW = fillW;
    this._barTrail.width = this._trailW;
    // Telegraph circles fill up toward impact
    for (const t of this.tele) {
      const p = Math.min(1, (now - t.t0) / t.ms);
      const g = t.g;
      g.clear();
      g.fillStyle(0xff2020, 0.10 + 0.16 * p);
      g.fillCircle(t.x, t.y, t.r);
      g.fillStyle(0xff2020, 0.28);
      g.fillCircle(t.x, t.y, t.r * p);
      g.lineStyle(3, 0xff3b3b, 0.6 + 0.4 * Math.abs(Math.sin(now / 70)));
      g.strokeCircle(t.x, t.y, t.r);
    }
    // Safety: drop stale telegraphs if the hit message was missed
    for (let i = this.tele.length - 1; i >= 0; i--) {
      if (now - this.tele[i].t0 > this.tele[i].ms + 900) { this.tele[i].g.destroy(); this.tele.splice(i, 1); }
    }
  }
}

// StructureView — a tower ("Firewall": brick pillar + 🔥) or a core ("Production
// Server": big rack with blinking LEDs). Shows an HP bar, a shield bubble while
// `invulnerable`, the tower's attack range when an enemy champion (you) is close,
// and a destroy animation when `alive` flips false.
import { TOWER, CORE, TEAM_INFO } from '../../../shared/moba/rules.js';
import {
  D, FONT, BAR, depthAt, teamColor, teamCss, relation, calmPrefs,
  CORE_TEX_W, CORE_TEX_H, CORE_BAYS, CORE_BAY_Y0, CORE_BAY_STEP,
} from './mobaGfx.js';

const LED_COLORS = [0x7ed957, 0x7ed957, 0x39c2ff, 0xffb347];

export class StructureView {
  constructor(scene, id, s, myTeam) {
    this.scene = scene;
    this.id = id;
    this.kind = s.kind === 'core' ? 'core' : 'tower';
    this.team = s.team;
    this.x = s.x; this.y = s.y;
    this.hp = s.hp; this.maxHp = Math.max(1, s.maxHp || 1);
    this.alive = s.alive !== false;
    this.invulnerable = !!s.invulnerable;
    this.rel = relation(s.team, myTeam);
    this._phase = Math.random() * 1000;
    const isCore = this.kind === 'core';
    const col = teamColor(s.team);
    this.height = isCore ? 190 : 140;
    this.hitRadius = isCore ? 125 : 78;

    const c = scene.add.container(s.x, s.y).setDepth(depthAt(s.y));
    this.c = c;
    const shadow = scene.add.ellipse(0, 6, isCore ? 210 : 116, isCore ? 56 : 36, 0x000000, 0.45);
    const pad = scene.add.ellipse(0, 4, isCore ? 236 : 128, isCore ? 74 : 44, col, 0.22).setStrokeStyle(3, col, 0.7);
    c.add([shadow, pad]);
    this._baseTint = null;
    if (isCore) {
      this.body = scene.add.image(0, 16, `moba-core-${s.team}`).setOrigin(0.5, 1);
      this.crystalGlow = scene.add.image(0, -170, 'moba-glow').setTint(col).setDisplaySize(130, 130).setAlpha(0.42).setBlendMode(1);
      c.add([this.crystalGlow, this.body]);
      this.leds = [];
      this.label = scene.add.text(0, -CORE_TEX_H + 8, `${TEAM_INFO[s.team]?.emoji || ''} PRODUCTION SERVER`, {
        fontFamily: FONT, fontSize: 14, color: teamCss(s.team), stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5);
      c.add(this.label);
    } else {
      this.body = scene.add.image(0, 14, `moba-tower-${s.team}`).setOrigin(0.5, 1);
      this.crystalGlow = scene.add.image(0, -148, 'moba-glow').setTint(col).setDisplaySize(78, 78).setAlpha(0.45).setBlendMode(1);
      c.add([this.crystalGlow, this.body]);
    }
    this._origScaleY = this.body.scaleY || 1;
    this.laserG = scene.add.graphics().setDepth(D.fx);
    this.targetPos = null;
    this.targetIsMe = false;
    // Invulnerability bubble.
    const bubbleY = isCore ? -90 : -62, bubbleR = isCore ? 135 : 86;
    this.bubble = scene.add.image(0, bubbleY, 'moba-ring').setDisplaySize(bubbleR * 2, bubbleR * 2)
      .setTint(0xa8e2ff).setAlpha(0.6);
    this.bubbleFill = scene.add.image(0, bubbleY, 'moba-disc').setDisplaySize(bubbleR * 2, bubbleR * 2)
      .setTint(0x7ec8ff).setAlpha(0.1);
    this.lock = scene.add.text(bubbleR * 0.62, bubbleY - bubbleR * 0.62, '🛡️', { fontSize: 18 }).setOrigin(0.5);
    c.add([this.bubbleFill, this.bubble, this.lock]);
    // HP bar.
    const bw = isCore ? 160 : 100, bh = isCore ? 12 : 9;
    const by = isCore ? -CORE_TEX_H - 40 : -172;
    this.barW = bw;
    this.hpBg = scene.add.rectangle(0, by, bw + 4, bh + 4, 0x000000, 0.8).setStrokeStyle(1, 0xffffff, 0.25);
    this.hpFill = scene.add.rectangle(-bw / 2, by, bw, bh, BAR[this.rel] || BAR.neutral, 1).setOrigin(0, 0.5);
    this.hpText = isCore ? scene.add.text(0, by, '', {
      fontFamily: FONT, fontSize: 10, color: '#ffffff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5) : null;
    c.add([this.hpBg, this.hpFill]);
    if (this.hpText) c.add(this.hpText);
    this.rangeRing = null;
    this._applyInvuln();
    this._applyHp();
    if (!this.alive) this._setRubble(false);
  }

  /** World point projectiles / sparks should aim at. */
  aimPoint() { return { x: this.x, y: this.y - this.height * 0.45 }; }
  /** Muzzle for tower shots. */
  muzzle() { return { x: this.x, y: this.y - (this.kind === 'core' ? 150 : 130) }; }

  hitTest(wx, wy) {
    const p = this.aimPoint();
    return Math.hypot(wx - p.x, wy - p.y) <= this.hitRadius;
  }

  sync(s) {
    if (s.hp !== this.hp || s.maxHp !== this.maxHp) {
      this.hp = s.hp; this.maxHp = Math.max(1, s.maxHp || 1);
      this._applyHp();
    }
    const inv = !!s.invulnerable;
    if (inv !== this.invulnerable) { this.invulnerable = inv; this._applyInvuln(); }
    const alive = s.alive !== false;
    if (alive !== this.alive) {
      this.alive = alive;
      if (!alive) this._setRubble(true);
      else this._setRebuilt();
    }
  }

  flash() {
    if (!this.alive || !this.body?.scene || !calmPrefs().flashes) return; // EP-10: settings.flashes
    this.body.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => {
      if (!this.body?.scene) return;
      if (this._baseTint != null) this.body.setTint(this._baseTint);
      else this.body.clearTint();
    });
  }

  /** me: { x, y, team, dead } of the local champion (or null). */
  update(now, me) {
    if (!this.alive) return;
    if (this.invulnerable) {
      const a = 0.45 + 0.2 * Math.sin((now + this._phase) / 320);
      this.bubble.setAlpha(a);
    }
    if (this.fire) {
      const s = 1 + 0.09 * Math.sin((now + this._phase) / 85) + 0.05 * Math.sin((now + this._phase) / 37);
      this.fire.setScale(s, 2 - s);
    }
    if (this.leds) {
      const t = now / 1000;
      for (const led of this.leds) {
        const on = ((t * led._rate + led._phase) % 1) < led._duty;
        if (led._on !== on) { led._on = on; led.setAlpha(on ? 1 : 0.18); }
      }
    }
    if (this.crystalGlow) {
      const g = 0.34 + 0.16 * Math.sin((now + this._phase) / 260);
      this.crystalGlow.setAlpha(g);
    }
    if (this.laserG) {
      if (this.targetPos && this.alive) {
        this.laserG.clear();
        const m = this.muzzle();
        const col = this.targetIsMe ? 0xff2a2a : teamColor(this.team);
        const w = this.targetIsMe ? 4.5 : 2.2;
        const a = this.targetIsMe ? (0.72 + 0.25 * Math.sin(now / 70)) : 0.45;
        this.laserG.lineStyle(w + 4, col, a * 0.25);
        this.laserG.lineBetween(m.x, m.y, this.targetPos.x, this.targetPos.y);
        this.laserG.lineStyle(w, col, a);
        this.laserG.lineBetween(m.x, m.y, this.targetPos.x, this.targetPos.y);
        this._hadLaser = true;
      } else if (this._hadLaser) {
        this.laserG.clear();
        this._hadLaser = false;
      }
    }
    // Structure range ring: only for enemy towers / core when you're close.
    const atkRange = this.kind === 'core' ? (CORE.range || 640) : TOWER.range;
    const near = me && !me.dead && me.team !== this.team
      && Math.hypot(me.x - this.x, me.y - this.y) < atkRange + 320;
    if (near) {
      if (!this.rangeRing) {
        this.rangeRing = this.scene.add.circle(this.x, this.y, atkRange)
          .setStrokeStyle(4, 0xff4a4a, 0.55).setFillStyle(0xff2020, 0.05).setDepth(D.ground);
      }
      const d = Math.hypot(me.x - this.x, me.y - this.y);
      this.rangeRing.setVisible(true).setAlpha(d < atkRange ? 1 : 0.6);
    } else if (this.rangeRing?.visible) this.rangeRing.setVisible(false);
  }

  destroy() {
    this.rangeRing?.destroy();
    this.laserG?.destroy();
    this.c.destroy();
  }

  // ───────────────────────── internals ─────────────────────────
  _applyHp() {
    const p = Math.max(0, Math.min(1, this.hp / this.maxHp));
    this.hpFill.width = this.barW * p;
    if (this.hpText) this.hpText.setText(`${Math.max(0, Math.round(this.hp))} / ${Math.round(this.maxHp)}`);
  }

  _applyInvuln() {
    const on = this.invulnerable && this.alive;
    this.bubble.setVisible(on); this.bubbleFill.setVisible(on); this.lock.setVisible(on);
  }

  /** Crumble into rubble (animated when the player sees it happen). */
  _setRubble(animate) {
    this.invulnerable = false;
    this._applyInvuln();
    this.hpBg.setVisible(false); this.hpFill.setVisible(false); this.hpText?.setVisible(false);
    this.rangeRing?.setVisible(false);
    if (this.fire) this.fire.setVisible(false);
    if (this.leds) for (const led of this.leds) { led.setFillStyle(0xff3b3b, 1); led.setAlpha(0.35); }
    const s = this.scene;
    if (this.label) this.label.setText('💀 PRODUCTION IS DOWN').setColor('#ff8a8a');
    const baseSy = this.body.scaleY || 1;
    const end = this.kind === 'core'
      ? { scaleY: baseSy * 0.55, angle: -12 }
      : { scaleY: baseSy * 0.32 };
    if (animate) {
      this.body.setTintFill(0xffffff);
      s.time.delayedCall(90, () => { if (this.body?.scene) this.body.setTint(0x4a4a52); });
      s.tweens.add({ targets: this.body, ...end, duration: 650, ease: 'Bounce.easeOut' });
    } else {
      this.body.setTint(0x4a4a52);
      this.body.setScale(this.body.scaleX, end.scaleY);
      if (end.angle) this.body.setAngle(end.angle);
    }
  }

  /** Restore a respawned Tier-3 Core Firewall from rubble back to full operational state. */
  _setRebuilt() {
    this.scene.tweens.killTweensOf(this.body);
    this.body.clearTint();
    this.body.setAngle(0);
    this.body.setScale(this.body.scaleX, this._origScaleY || 1);
    this.hpBg.setVisible(true); this.hpFill.setVisible(true); this.hpText?.setVisible(true);
    if (this.fire) this.fire.setVisible(true);
    this._applyHp();
    this._applyInvuln();
    this.flash();
  }
}

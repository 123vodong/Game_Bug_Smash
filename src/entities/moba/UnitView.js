// UnitView — a minion (team bug squad), jungle monster (neutral) or river epic
// (the CEO's golden bug / THE DEADLINE). Bug sprite + team ring + HP bar,
// interpolated between server patches, hit flash on `hit_seq`, death puff on
// `alive=false` (the server deletes the unit ~600 ms later).
// v2: office-robot textures from looks.js (unitTextureKey: robot minions, camp
// variants — top jungle robots / bot jungle bugs — and pets) with the old bug PNGs
// as fallback. Pets (kind 'pet', `owner` = champion key): small, owner's team ring,
// no HP bar, hover bob, never targetable (hitTest → false, `targetable` = false).
import { MINIONS, CAMPS, EPICS } from '../../../shared/moba/rules.js';
import { FONT, BAR, depthAt, teamColor, relation, approach, calmPrefs } from './mobaGfx.js';
import { ensureMobaLooks, unitTextureKey, unitName, lookMeta } from './looks.js';

// Bug PNGs are colorful → light tint; robot textures are neutral grays → stronger tint.
const TEAM_TINT = { blue: 0xc4e0ff, red: 0xffc6c6, neutral: 0xd9e4b4 };
const ROBOT_TINT = { blue: 0x9fd2ff, red: 0xffa8a8, neutral: 0xffffff };
const PET_SIZE = 40;
// v4 bushes: own-team units in a bush → translucent + leaf tint (hidden enemies are not sent).
const HIDDEN_ALPHA = 0.5, LEAF_TINT = 0xa6f0a0, FADE_MS = 200;

export function unitKindInfo(kind, campId = '') {
  const sprite = unitTextureKey(kind, campId), name = unitName(kind, campId);
  if (MINIONS[kind]) return { cls: 'minion', sprite, name, size: MINIONS[kind].size, ranged: MINIONS[kind].range > 200 };
  if (CAMPS[kind]) return { cls: 'monster', sprite, name, size: CAMPS[kind].size };
  if (kind === 'pet') return { cls: 'pet', sprite, name, size: PET_SIZE };
  if (EPICS[kind]) {
    const e = EPICS[kind];
    return { cls: 'epic', sprite, name, size: e.size, tint: e.tint, title: e.title };
  }
  return { cls: 'minion', sprite: 'bug-ladybug', name, size: 44 };
}

export class UnitView {
  constructor(scene, id, u, myTeam) {
    this.scene = scene;
    this.id = id;
    this.kind = u.kind;
    this.team = u.team;
    this.campId = u.campId || '';
    this.owner = u.owner || '';
    ensureMobaLooks(scene);
    const info = unitKindInfo(u.kind, this.campId);
    this.cls = info.cls;
    this.name = info.name;
    this.isPet = info.cls === 'pet';
    this.targetable = !this.isPet;
    this.ranged = !!info.ranged;
    this.size = info.size;
    this.x = u.x; this.y = u.y; this.tx = u.x; this.ty = u.y;
    this.hp = u.hp; this.maxHp = Math.max(1, u.maxHp || 1);
    this.alive = u.alive !== false;
    this.hitSeq = u.hit_seq || 0;
    this.rel = relation(u.team, myTeam);
    this.dying = false;
    this.removed = false;
    this.hidden = false;
    this.destroyed = false;
    this._phase = Math.random() * 5000;
    this._flashUntil = 0; this._punchUntil = 0; this._lunge = null;
    this._myAd = 0;

    const size = info.size, col = teamColor(u.team), isBoss = u.kind === 'deadline';
    const c = scene.add.container(u.x, u.y).setDepth(depthAt(u.y));
    this.c = c;
    this.ring = this.isPet
      ? scene.add.ellipse(0, 2, size * 1.2, size * 0.42, col, 0.22).setStrokeStyle(2, col, 0.9)
      : scene.add.ellipse(0, size * 0.42, size * 1.25, size * 0.5, col, this.rel === 'neutral' ? 0.16 : 0.36)
        .setStrokeStyle(2, col, 0.95);
    c.add(this.ring);
    if (info.cls === 'epic') {
      this.glow = scene.add.image(0, -size * 0.1, 'moba-glow').setTint(isBoss ? 0xff2a2a : 0xffd700)
        .setDisplaySize(size * 2.6, size * 2.6).setAlpha(0.5);
      c.add(this.glow);
    }
    const key = isBoss ? 'boss-deadline' : info.sprite;
    let dh, visTop;
    const look = lookMeta(key);
    if (scene.textures.exists(key)) {
      let dw, oy;
      if (isBoss) { dw = size; dh = size * 300 / 246; oy = 0.6; visTop = -dh * 0.58; }
      else if (look) {
        // looks.js robot: ground line at `oy`, visible top at `top` (fractions of h).
        dw = size * (this.isPet ? 1.25 : 1.4) * (look.scale || 1); dh = dw * look.h / look.w; oy = look.oy;
        visTop = -dh * (oy - (look.top ?? 0.1));
      } else { dw = size * 1.3; dh = dw * 4 / 3; oy = 0.56; visTop = -dh * 0.31; }
      this.body = scene.add.image(0, 0, key).setDisplaySize(dw, dh).setOrigin(0.5, oy);
      const tints = look ? ROBOT_TINT : TEAM_TINT;
      this.baseTint = isBoss ? null : (info.tint || tints[u.team] || tints.neutral);
      if (this.baseTint === 0xffffff) this.baseTint = null;
      if (this.baseTint) this.body.setTint(this.baseTint);
    } else {
      this.body = scene.add.circle(0, 0, size * 0.45, col, 1).setStrokeStyle(2, 0x000000);
      dh = size; visTop = -size * 0.45; this.baseTint = null;
    }
    this.visTop = visTop;
    this.bsx = this.body.scaleX; this.bsy = this.body.scaleY;
    c.add(this.body);

    this._hover = this.isPet ? 7 : (key === 'bot-drone' ? 4 : 0);   // flying units float
    const epic = info.cls === 'epic';
    const bw = epic ? 140 : Math.max(36, Math.round(size * 0.92)), bh = epic ? 10 : 5;
    const by = Math.round(visTop) - (epic ? 14 : 8);
    this.barW = bw;
    this.hpBg = scene.add.rectangle(0, by, bw + 2, bh + 2, 0x000000, 0.78);
    this.hpFill = scene.add.rectangle(-bw / 2, by, bw, bh, BAR[this.rel] || BAR.neutral, 1).setOrigin(0, 0.5);
    c.add([this.hpBg, this.hpFill]);
    if (this.isPet) { this.hpBg.setVisible(false); this.hpFill.setVisible(false); }
    if (epic) {
      this.title = scene.add.text(0, by - 16, info.title || u.kind, {
        fontFamily: FONT, fontSize: 15, color: isBoss ? '#ff6b6b' : '#ffd700', stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5);
      this.hpText = scene.add.text(0, by, '', {
        fontFamily: FONT, fontSize: 9, color: '#ffffff', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5);
      c.add([this.title, this.hpText]);
    }
    this._applyHp();
    if (!this.alive) { this.dying = true; c.setVisible(false); }
  }

  /** World point projectiles / sparks aim at (body center). */
  aimPoint() { return { x: this.x, y: this.y + this.visTop * 0.45 }; }
  hitTest(wx, wy) {
    if (!this.targetable) return false;          // pets are never valid targets
    const p = this.aimPoint();
    return Math.hypot(wx - p.x, wy - p.y) <= Math.max(30, this.size * 0.62);
  }

  /** Apply the latest synced state (called every frame; cheap when nothing changed). */
  sync(u, myAd) {
    this.tx = u.x; this.ty = u.y;
    if (u.hp !== this.hp || u.maxHp !== this.maxHp || myAd !== this._myAd) {
      this.hp = u.hp; this.maxHp = Math.max(1, u.maxHp || 1); this._myAd = myAd;
      this._applyHp();
    }
    const hs = u.hit_seq || 0;
    if (hs !== this.hitSeq) { this.hitSeq = hs; this.flash(); }
    if (u.alive === false && this.alive) { this.alive = false; this.die(); }
  }

  update(dt, now) {
    if (this.removed) return;
    if (!this.dying) {
      const dx = this.tx - this.x, dy = this.ty - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 300) { this.x = this.tx; this.y = this.ty; } else {
        const k = approach(dt, 12);
        this.x += dx * k; this.y += dy * k;
      }
      if (Math.abs(dx) > 1.5 && this.body.setFlipX) this.body.setFlipX(dx < 0);
      const moving = d > 3;
      this.body.rotation = moving ? Math.sin((now + this._phase) / 75) * 0.09 : this.body.rotation * 0.85;
      let ox = 0, oy = moving ? 0 : Math.sin((now + this._phase) / 420) * 1.6;
      if (this._hover) oy = -this._hover + Math.sin((now + this._phase) / 260) * 2.4;
      if (this._lunge) {
        const t = (now - this._lunge.t0) / 170;
        if (t >= 1) this._lunge = null;
        else { const k = Math.sin(t * Math.PI) * 9; ox += this._lunge.ux * k; oy += this._lunge.uy * k; }
      }
      this.body.x = ox; this.body.y = oy;
      if (this._flashUntil && now >= this._flashUntil) {
        this._flashUntil = 0;
        this._restTint();
      }
      const p = this._punchUntil > now ? (this._punchUntil - now) / 110 : 0;
      this.body.setScale(this.bsx * (1 + 0.12 * p), this.bsy * (1 + 0.12 * p));
      if (this.glow) this.glow.setAlpha(0.38 + 0.16 * Math.sin((now + this._phase) / 300));
    }
    this.c.setPosition(this.x, this.y);
    const dep = depthAt(this.y);
    if (Math.abs(dep - this.c.depth) > 0.01) this.c.setDepth(dep);
  }

  flash() {
    if (this.dying) return;
    const now = this.scene.time.now;
    this._punchUntil = now + 110;
    if (!calmPrefs().flashes) return; // EP-10: settings.flashes off → punch only, no white flash
    if (this.body.setTintFill) this.body.setTintFill(0xffffff);
    this._flashUntil = now + 70;
  }

  /** Small step toward a melee target. */
  lunge(tx, ty) {
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy) || 1;
    this._lunge = { t0: this.scene.time.now, ux: dx / d, uy: dy / d };
    if (Math.abs(dx) > 2 && this.body.setFlipX) this.body.setFlipX(dx < 0);
  }

  die() {
    if (this.dying) return;
    this.dying = true;
    this.hpBg.setVisible(false); this.hpFill.setVisible(false);
    this.title?.setVisible(false); this.hpText?.setVisible(false);
    if (this.body.setTint) this.body.setTint(0x777777);
    this.scene.tweens.add({
      targets: this.body, alpha: 0, scaleX: this.bsx * 0.5, scaleY: this.bsy * 0.5,
      angle: (Math.random() < 0.5 ? -1 : 1) * 50, duration: 340, ease: 'Cubic.easeIn',
    });
    this.scene.tweens.add({ targets: [this.ring, this.glow].filter(Boolean), alpha: 0, duration: 300 });
  }

  /** Called once the server removed the unit. Lets the death animation finish. */
  remove() {
    if (this.removed) return;
    this.removed = true;
    if (!this.dying) this.die();
    this.scene.time.delayedCall(380, () => this.destroy());
  }

  /** v4: translucent + leaf tint while an own-team unit is in a bush. Cheap when unchanged. */
  setHidden(on) {
    on = !!on;
    if (on === this.hidden || this.destroyed || this.dying) return this;
    this.hidden = on;
    if (!this._flashUntil) this._restTint();
    this.scene.tweens.killTweensOf(this.c);
    this.scene.tweens.add({ targets: this.c, alpha: on ? HIDDEN_ALPHA : 1, duration: 160 });
    return this;
  }

  /** Fade in (re-added by the server after leaving a bush). */
  fadeIn(ms = FADE_MS) {
    if (this.destroyed) return this;
    this.scene.tweens.killTweensOf(this.c);
    this.c.setAlpha(0);
    this.scene.tweens.add({ targets: this.c, alpha: this.hidden ? HIDDEN_ALPHA : 1, duration: ms });
    return this;
  }

  /** Removed while ALIVE (went out of vision): fade out + destroy, no death puff. */
  vanish(ms = FADE_MS) {
    if (this.removed) return;
    this.removed = true;
    if (this.dying || this.destroyed) { this.scene.time.delayedCall(380, () => this.destroy()); return; }
    this.scene.tweens.killTweensOf(this.c);
    this.scene.tweens.add({ targets: this.c, alpha: 0, duration: ms, onComplete: () => this.destroy() });
  }

  /** Idempotent destroy; kills tweens on the container and its children. */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.removed = true;
    const tw = this.scene?.tweens;
    if (tw) { tw.killTweensOf(this.c); tw.killTweensOf([this.body, this.ring, this.glow].filter(Boolean)); }
    this.c.destroy();
  }

  _restTint() {
    if (!this.body.clearTint) return;
    this.body.clearTint();
    const t = this.hidden ? LEAF_TINT : this.baseTint;
    if (t) this.body.setTint(t);
  }

  _applyHp() {
    if (this.isPet) return;
    const p = Math.max(0, Math.min(1, this.hp / this.maxHp));
    this.hpFill.width = this.barW * p;
    // Last-hit helper: an enemy minion your next auto-attack kills glows white.
    const lastHit = this.rel === 'enemy' && this.cls === 'minion' && this._myAd > 0 && this.hp > 0 && this.hp <= this._myAd;
    this.hpFill.setFillStyle(lastHit ? 0xffffff : (BAR[this.rel] || BAR.neutral), 1);
    if (this.hpText) this.hpText.setText(`${Math.max(0, Math.round(this.hp))} / ${Math.round(this.maxHp)}`);
  }
}

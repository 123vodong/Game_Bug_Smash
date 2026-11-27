// UnitView — a minion (team bug squad), jungle monster (neutral) or river epic
// (the CEO's golden bug / THE DEADLINE). Bug sprite + team ring + HP bar,
// interpolated between server patches, hit flash on `hit_seq`, death puff on
// `alive=false` (the server deletes the unit ~600 ms later).
// v2: office-robot textures from looks.js (unitTextureKey: robot minions, camp
// variants — top jungle robots / bot jungle bugs — and pets) with the old bug PNGs
// as fallback. Pets (kind 'pet', `owner` = champion key): small, owner's team ring,
// no HP bar, hover bob, never targetable (hitTest → false, `targetable` = false).
import { MINIONS, CAMPS, EPICS } from '../../../shared/moba/rules.js';
import { CHAMPIONS } from '../../../shared/moba/champions.js';
import { FONT, BAR, depthAt, teamColor, relation, approach, calmPrefs } from './mobaGfx.js';
import { ensureMobaLooks, unitTextureKey, unitName, lookMeta, extraUnit } from './looks.js';

// Bug PNGs are colorful → light tint; robot textures are neutral grays → stronger tint.
const TEAM_TINT = { blue: 0xc4e0ff, red: 0xffc6c6, neutral: 0xd9e4b4 };
const ROBOT_TINT = { blue: 0x9fd2ff, red: 0xffa8a8, neutral: 0xffffff };
const PET_SIZE = 40;
// v6 placed objects (kind 'obj', campId 'barricade' | 'turret') and the Scout drone (summon-only pet).
const MAX_OBJ_VIEWS_PER_TEAM = 14; // V4: past this, extra object views are drawn "lite" (no dust, no heat bar)
const objViews = {};
const lerpColor = (a, b, k) => {
  const r = Math.round(((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k), g = Math.round(((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k), bl = Math.round((a & 255) * (1 - k) + (b & 255) * k);
  return (r << 16) | (g << 8) | bl;
};
function droneDef(scene, u) {
  if (u.kind !== 'pet') return null;
  const own = u.owner || '';
  const d = CHAMPIONS[own] || CHAMPIONS[scene._state?.()?.champions?.get?.(own)?.champ];
  return d?.pet?.summonOnly ? d : null;
}
// v4 bushes: own-team units in a bush → translucent + leaf tint (hidden enemies are not sent).
const HIDDEN_ALPHA = 0.5, LEAF_TINT = 0xa6f0a0, FADE_MS = 200;

export function unitKindInfo(kind, campId = '') {
  const sprite = unitTextureKey(kind, campId), name = unitName(kind, campId);
  const ex = extraUnit(kind);   // Story Mode bugs / nests (looks.registerUnitKinds)
  if (ex) return { cls: 'monster', sprite, name, size: ex.size || 44, ranged: (ex.range || 0) > 200 };
  if (MINIONS[kind]) return { cls: 'minion', sprite, name, size: MINIONS[kind].size, ranged: MINIONS[kind].range > 200 };
  if (CAMPS[kind]) return { cls: 'monster', sprite, name, size: CAMPS[kind].size };
  if (kind === 'pet') return { cls: 'pet', sprite, name, size: PET_SIZE };
  if (kind === 'obj') return campId === 'turret' ? { cls: 'obj', sprite: '', name: 'Turret', size: 64 } : { cls: 'obj', sprite: 'moba-prop-barricade', name: 'Barricade', size: 112 };
  if (kind === 'dummy') return { cls: 'dummy', sprite: 'bot-drone', name: 'Practice Dummy', size: 62, tint: 0xffd23f };
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
    this.isObj = info.cls === 'obj';
    this.isTurret = this.isObj && this.campId === 'turret';
    this.drone = droneDef(scene, u);
    this.targetable = !this.isPet;
    this.lite = false; this._dropAt = scene.time.now; this._landed = false; this._shakeUntil = 0; this._heatShown = -1;
    if (this.isObj) { objViews[u.team] = (objViews[u.team] || 0) + 1; this._objTeam = u.team; this.lite = objViews[u.team] > MAX_OBJ_VIEWS_PER_TEAM; }
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
    if (info.cls === 'minion' || info.cls === 'monster') { // soft contact shadow under the body
      this.shadow = scene.add.ellipse(0, size * 0.44, size * 0.95, size * 0.3, 0x000000, 0.4);
      c.add(this.shadow); c.sendToBack(this.shadow);
    }
    if (info.cls === 'epic') {
      this.glow = scene.add.image(0, -size * 0.1, 'moba-glow').setTint(isBoss ? 0xff2a2a : 0xffd700)
        .setDisplaySize(size * 2.6, size * 2.6).setAlpha(0.5);
      c.add(this.glow);
    }
    const key = isBoss ? 'boss-deadline' : info.sprite;
    let dh, visTop;
    const look = lookMeta(key);
    const special = this._specialBody(scene, info, col);
    const art = !special && !isBoss ? this._envArt(scene, info, u) : null;
    if (special) {
      this.body = special.body; dh = special.dh; visTop = special.visTop; this.baseTint = special.tint || null;
    } else if (art) {
      this.body = art.body; dh = art.dh; visTop = art.visTop; this.baseTint = art.tint;
      if (this.baseTint) this.body.setTint(this.baseTint);
    } else if (scene.textures.exists(key)) {
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
    if (this.isObj) this._hover = 0;
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
    if (this.isTurret && !this.lite) {
      const hy = by + 9;
      this._heatBg = scene.add.rectangle(0, hy, bw + 2, 5, 0x000000, 0.78);
      this._heatFill = scene.add.rectangle(-bw / 2, hy, 0, 3, 0xffd23f, 1).setOrigin(0, 0.5);
      c.add([this._heatBg, this._heatFill]);
    }
    if (!this.alive) { this.dying = true; c.setVisible(false); }
  }

  /** CC0 Kenney sci-fi RTS sprite (env-units atlas) for minions + jungle monsters, or null (looks.js robot is used). */
  _envArt(scene, info, u) {
    if (!scene.textures.exists('env-units')) return null;
    let frame = null, tint = null;
    if (MINIONS[u.kind] && (u.team === 'blue' || u.team === 'red')) frame = `m_${u.kind}_${u.team}`;
    else if (CAMPS[u.kind]) {
      const h = [...String(this.campId || u.id || '')].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 2;
      frame = { small: ['n_e', 'n_f'], medium: ['n_g', 'n_d'], big: ['n_i', 'n_h'] }[u.kind]?.[h] || null;
      tint = u.kind === 'big' ? 0xffe9a8 : null;
    }
    const tx = scene.textures.get('env-units');
    if (!frame || !tx.has(frame)) return null;
    const f = tx.get(frame), size = info.size, wide = f.width > 60;
    const dh = wide ? size * 1.7 * f.height / f.width : size * 1.55;
    const dw = dh * f.width / f.height;
    const body = scene.add.image(0, 0, 'env-units', frame).setDisplaySize(dw, dh).setOrigin(0.5, 0.9);
    return { body, dh, visTop: -dh * 0.9, tint };
  }

  /** v6 bodies: barricade sprite, procedural turret, Scout drone. Returns null for every other unit. */
  _specialBody(scene, info, col) {
    if (this.isTurret) {
      const body = scene.add.container(0, 0);
      const base = scene.add.ellipse(0, 2, 56, 20, 0x1c222c, 1).setStrokeStyle(2, col, 0.9);
      const post = scene.add.rectangle(0, -12, 14, 26, 0x2c3440, 1).setStrokeStyle(2, 0x0e1117, 1);
      this._tHead = scene.add.circle(0, -32, 17, 0x4a5568, 1).setStrokeStyle(3, col, 1);
      this._tBarrel = scene.add.container(0, -32);
      this._tBarrel.add([scene.add.rectangle(10, 0, 32, 9, 0x2a303b, 1).setOrigin(0, 0.5).setStrokeStyle(2, 0x0e1117, 1), scene.add.circle(41, 0, 4, 0xffd23f, 1)]);
      const eye = scene.add.circle(0, -34, 5, 0xffffff, 0.9);
      body.add([base, post, this._tHead, this._tBarrel, eye]);
      return { body, dh: 64, visTop: -58 };
    }
    if (this.isObj) {
      const k = 'moba-prop-barricade';
      if (scene.textures.exists(k)) {
        const sz = info.size, body = scene.add.image(0, 0, k).setDisplaySize(sz, sz).setOrigin(0.5, 0.72);
        const tint = lerpColor(0xffffff, col, 0.25);
        body.setTint(tint);
        return { body, dh: sz, visTop: -sz * 0.7, tint };
      }
      return { body: scene.add.rectangle(0, -20, info.size, 40, col, 1).setStrokeStyle(3, 0x000000), dh: 50, visTop: -40 };
    }
    if (this.drone) {
      const body = scene.add.text(0, 0, this.drone.pet?.emoji || '🛸', { fontSize: '34px', padding: { y: 4 } }).setOrigin(0.5);
      const vis = this.drone.skills?.w?.summon?.vision || 0, cc = this.drone.color || col;
      if (vis > 0 && this.rel !== 'enemy') { this._ring2 = scene.add.graphics(); this._ring2.lineStyle(2, cc, 0.18); this._ring2.strokeCircle(0, 0, vis); this.c.add(this._ring2); }
      this.cone = scene.add.graphics();
      this.cone.fillStyle(cc, 0.2); this.cone.slice(0, 0, 150, -0.32, 0.32, false); this.cone.fillPath();
      this.c.add(this.cone);
      return { body, dh: 40, visTop: -46 };
    }
    return null;
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
      if (this.isObj) {
        const dk = Math.min(1, (now - this._dropAt) / 380);
        if (dk < 1) oy -= 240 * (1 - dk) * (1 - dk);
        else if (!this._landed) this._land();
        if (this._shakeUntil > now) ox += Math.sin(now / 16) * 4 * ((this._shakeUntil - now) / 160);
        if (this.isTurret) this._turretTick(dt);
      }
      if (this.cone) this.cone.rotation += dt * 1.6;
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

  /** Barricade / turret finished dropping in: dust puffs (skipped for lite views). */
  _land() {
    this._landed = true;
    if (this.lite || !this.scene.fx?.part) return;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.scene.fx.part(this.x + Math.cos(a) * 20, this.y + 8, { tex: 'vfx-dirt_01', tint: 0xb5a58a, vx: Math.cos(a) * 80, vy: Math.sin(a) * 30 - 10, drag: 3, s0: 30, s1: 90, a0: 0.55, life: 0.55 });
    }
  }

  /** Turret: aim the barrel at the last shot, recoil on a shot, head and heat bar turn yellow -> red with heat. */
  _turretTick(dt) {
    const st = this.scene.fx?.objState?.get(this.id);
    if (!st) return;
    if (this._tBarrel) { this._tBarrel.rotation = st.ang; this._tBarrel.setScale(1 - 0.18 * st.kick, 1); }
    st.kick = Math.max(0, st.kick - dt * 8);
    if (st.h === this._heatShown) return;
    this._heatShown = st.h;
    const k = st.h / 10;
    this._tHead?.setFillStyle(lerpColor(0x4a5568, 0xff3b30, k), 1);
    if (this._heatFill) { this._heatFill.setFillStyle(lerpColor(0xffd23f, 0xff2a2a, k), 1); this._heatFill.width = this.barW * k; }
  }

  flash() {
    if (this.dying) return;
    const now = this.scene.time.now;
    this._punchUntil = now + 110;
    if (this.isObj) this._shakeUntil = now + 160;
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
    this.scene.tweens.add({ targets: [this.ring, this.glow, this.shadow].filter(Boolean), alpha: 0, duration: 300 });
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
    if (this._objTeam) { objViews[this._objTeam] = Math.max(0, (objViews[this._objTeam] || 1) - 1); this._objTeam = null; }
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

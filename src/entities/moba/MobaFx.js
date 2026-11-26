// MobaFx — transient Team Mode visuals: skillshots, homing auto-attack shots,
// melee swings, ground telegraphs that fill over `delay` then burst, dash / blink
// trails, buff + heal bursts, hit sparks, death puffs, explosions, floating
// damage numbers and "+N gold" popups.
// v2: persistent zones (`fx zone`, pulse each tick), knockback dust trails +
// wall "BONK" impacts (`fx knock`), pet zap beams (`fx petatk`), textured
// skillshots (looks.js projectileKey -> phones / brooms / boxes, rotated to travel).
// v4: setQuality(low) — lower particle / number caps and half the sparks; an auto-attack
// shot whose target vanished (hidden in a bush / removed) fizzles instead of landing.
//
// Everything high-frequency (particles, numbers, projectile parts) comes from
// fixed-size pools — nothing grows without bound. Rare effects (telegraphs,
// skull popups) are created and destroyed.
import { D, FONT, clamp, LOOKS, shakeCam, calmPrefs } from './mobaGfx.js';

const MAX_PARTS = 260, MAX_PARTS_LOW = 110;
const MAX_NUMS = 44, MAX_NUMS_LOW = 22;
const MAX_ZONES = 14;
const ADD = 1; // Phaser.BlendModes.ADD
const NORMAL = 0;

const NUM_STYLE = {
  dealt: { color: '#ffffff', size: 20, stroke: '#000000', rise: 46, life: 0.85 },
  big:   { color: '#ffe08a', size: 25, stroke: '#3a2400', rise: 52, life: 0.95 },
  self:  { color: '#ff4d4d', size: 24, stroke: '#2a0000', rise: 50, life: 0.95 },
  ally:  { color: '#c3d2e8', size: 15, stroke: '#000000', rise: 36, life: 0.7 },
  heal:  { color: '#7ed957', size: 20, stroke: '#002a00', rise: 44, life: 0.95 },
  gold:  { color: '#ffd23f', size: 20, stroke: '#2a1c00', rise: 62, life: 1.2 },
  info:  { color: '#ffd23f', size: 22, stroke: '#000000', rise: 70, life: 1.5 },
};

export class MobaFx {
  /** posOf(id) → {x, y} aim point of a live entity, or null. */
  constructor(scene, posOf) {
    this.scene = scene;
    this.posOf = posOf;
    this.parts = []; this.pool = [];
    this.nums = []; this.numPool = [];
    this.shots = [];
    this.zones = [];
    this.low = false; this._maxParts = MAX_PARTS; this._maxNums = MAX_NUMS; this._skip = 0;
  }

  /** v4 quality: low effects → smaller caps, every other spark / dust particle dropped. */
  setQuality(low) {
    this.low = !!low;
    this._maxParts = low ? MAX_PARTS_LOW : MAX_PARTS;
    this._maxNums = low ? MAX_NUMS_LOW : MAX_NUMS;
  }

  onScreen(x, y, m = 140) {
    const v = this.scene.cameras.main.worldView;
    return x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m;
  }

  // ───────────────────────── pooled images ─────────────────────────
  _img(tex, tint, blend, depth) {
    let img = this.pool.pop();
    if (!img) img = this.scene.add.image(0, 0, tex);
    else if (img.texture.key !== tex) img.setTexture(tex);
    img.setVisible(true).setTint(tint ?? 0xffffff).setBlendMode(blend || NORMAL).setDepth(depth ?? D.fx)
      .setOrigin(0.5).setRotation(0).setAlpha(1).setScale(1);
    return img;
  }
  _release(img) {
    if (!img || !img.scene) return;
    img.setVisible(false);
    this.pool.push(img);
  }

  /** One particle. Sizes in px (s0 → s1), alpha a0 → a1 over `life` seconds. */
  part(x, y, o) {
    if (this.parts.length >= this._maxParts) return null;
    if (this.low && o.tex === 'moba-spark' && (this._skip ^= 1)) return null;
    const img = this._img(o.tex || 'moba-glow', o.tint, o.add ? ADD : NORMAL, o.depth);
    if (o.rot) img.setRotation(o.rot);
    if (o.ox != null) img.setOrigin(o.ox, 0.5);
    const p = {
      img, x, y, vx: o.vx || 0, vy: o.vy || 0, g: o.g || 0, drag: o.drag || 0, t: -(o.delay || 0),
      life: o.life || 0.5, s0: o.s0 ?? 32, s1: o.s1 ?? 0, a0: o.a0 ?? 1, a1: o.a1 ?? 0,
      w: o.w || 1, h: o.h || 1, vr: o.vr || 0,
    };
    img.setPosition(x, y);
    this._applyPart(p, 0);
    if (p.t < 0) img.setVisible(false);
    this.parts.push(p);
    return p;
  }
  _applyPart(p, k) {
    const s = (p.s0 + (p.s1 - p.s0) * k) / (p.img.width || 64);
    p.img.setScale(s * p.w, s * p.h);
    p.img.setAlpha(Math.max(0, p.a0 + (p.a1 - p.a0) * k));
  }

  // ───────────────────────── numbers ─────────────────────────
  /** Floating text (damage, heal, gold). Culled when off-screen. */
  number(x, y, str, kind = 'dealt') {
    if (this.quiet || !this.onScreen(x, y, 40)) return;
    const st = NUM_STYLE[kind] || NUM_STYLE.dealt;
    if (this.nums.length >= this._maxNums) {
      const old = this.nums.shift();
      old.txt.setVisible(false); this.numPool.push(old.txt);
    }
    let txt = this.numPool.pop();
    if (!txt) {
      txt = this.scene.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: 20, color: '#ffffff', stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5);
    }
    if (txt._kind !== kind) {
      txt._kind = kind;
      txt.setStyle({ fontFamily: FONT, fontSize: `${st.size}px`, color: st.color, stroke: st.stroke, strokeThickness: 4 });
    }
    txt.setText(str);
    const jx = (Math.random() - 0.5) * 28;
    txt.setVisible(true).setDepth(D.numbers).setPosition(x + jx, y).setAlpha(1).setScale(0.5);
    this.nums.push({ txt, x: x + jx, y, t: 0, life: st.life, rise: st.rise });
  }

  /** Round 2: the end screen is up — drop floating numbers and stop new ones. */
  clearNumbers() {
    this.quiet = true;
    for (const n of this.nums) { n.txt.setVisible(false); this.numPool.push(n.txt); }
    this.nums.length = 0;
  }

  // ───────────────────────── projectiles ─────────────────────────
  /** Skillshot from `fx {k:'proj'}`. */
  skillshot(m, pierce = false, tex = null) {
    const len = Math.hypot(m.dx, m.dy) || 1;
    const ux = m.dx / len, uy = m.dy / len;
    const speed = Number.isFinite(m.speed) && m.speed > 0 ? m.speed : 1500;
    const range = clamp(Number.isFinite(m.range) ? m.range : 900, 50, 3000);
    // Cull shots whose whole flight is off-screen (bot fans across the map), cap the rest.
    const mid = range / 2;
    if (!this.onScreen(m.x, m.y, 300) && !this.onScreen(m.x + ux * range, m.y + uy * range, 300)
      && !this.onScreen(m.x + ux * mid, m.y + uy * mid, 300 + mid)) return;
    if (this._skillShots() >= 60) return;
    const width = clamp(Number.isFinite(m.width) ? m.width : 70, 20, 220);
    const color = Number.isFinite(m.color) ? m.color : 0x39c2ff;
    const ang = Math.atan2(uy, ux);
    let head, core, spin = 0;
    if (tex) {
      // Thrown object (phone, broom, parcel...) rotated to its travel direction over a soft colored glow.
      head = this._img('moba-glow', color, ADD, D.fxTop);
      head.setDisplaySize(width * 1.5, width * 1.5).setAlpha(0.8);
      const ps = LOOKS.mod?.PROJ_STYLE?.[tex];
      spin = Number.isFinite(ps?.spin) ? ps.spin : 0;
      core = this._img(tex, 0xffffff, NORMAL, D.fxTop + 0.1).setRotation(ps?.upright ? 0 : ang);
      const fw = core.frame?.width || 64, fh = core.frame?.height || 64;
      core.setScale(clamp(width * 1.05, 40, 96) / Math.max(1, fw, fh));
    } else {
      head = this._img('moba-glow', color, ADD, D.fxTop);
      head.setDisplaySize(width * 1.9, width * 1.9);
      core = this._img('moba-glow', 0xffffff, ADD, D.fxTop);
      core.setDisplaySize(width * 0.75, width * 0.75);
    }
    const trail = this._img('moba-glow', color, ADD, D.fx).setOrigin(0.92, 0.5).setRotation(ang);
    this.shots.push({
      kind: 'skill', head, core, trail, x0: m.x, y0: m.y, x: m.x, y: m.y, ux, uy, speed, range, dist: 0,
      width, color, pierce, t: 0, spin,
    });
  }

  /** Homing auto-attack shot toward entity `targetId`. */
  _skillShots() { let n = 0; for (const s of this.shots) if (s.kind === 'skill') n++; return n; }

  basic(x, y, targetId, color, size = 14, speed = 1250) {
    if (this.shots.length - this._skillShots() > 90) return;
    const head = this._img('moba-glow', color, ADD, D.fxTop);
    head.setDisplaySize(size * 2.4, size * 2.4);
    const core = this._img('moba-glow', 0xffffff, ADD, D.fxTop);
    core.setDisplaySize(size, size);
    this.shots.push({ kind: 'basic', head, core, x, y, target: targetId, tx: x, ty: y, speed, color, size, t: 0 });
  }

  /** A `hit` arrived near an in-flight skillshot of the same color → end it there. */
  endShotNear(x, y, color) {
    let best = null, bd = 190;
    for (const s of this.shots) {
      if (s.kind !== 'skill' || s.pierce || s.done) continue;
      if (Number.isFinite(color) && s.color !== color) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) { best.done = true; this._endShot(best, x, y); }
  }

  _endShot(s, x, y) {
    this._release(s.head); this._release(s.core); this._release(s.trail);
    s.head = s.core = s.trail = null;
    if (this.onScreen(x, y)) {
      this.part(x, y, { tint: s.color, add: true, s0: (s.width || s.size * 2) * 1.4, s1: (s.width || s.size * 2) * 2.2, a0: 0.9, life: 0.18 });
      this.sparks(x, y, s.color, s.kind === 'skill' ? 6 : 3, s.kind === 'skill' ? 160 : 90);
    }
  }

  // ───────────────────────── one-shot effects ─────────────────────────
  sparks(x, y, color, n = 6, speed = 140) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.5 + Math.random() * 0.7);
      this.part(x, y, {
        tex: 'moba-spark', tint: color, add: true, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 4,
        s0: 16 + Math.random() * 6, s1: 3, life: 0.28 + Math.random() * 0.15, vr: (Math.random() - 0.5) * 12,
      });
    }
  }

  hit(x, y, color) {
    if (!this.onScreen(x, y)) return;
    this.part(x, y, { tint: color ?? 0xffffff, add: true, s0: 46, s1: 70, a0: 0.85, life: 0.16 });
    this.sparks(x, y, color ?? 0xffffff, 6, 150);
  }

  slash(fx, fy, tx, ty, color) {
    if (!this.onScreen(tx, ty)) return;
    const ang = Math.atan2(ty - fy, tx - fx);
    this.part(tx - Math.cos(ang) * 10, ty - Math.sin(ang) * 10, {
      tex: 'moba-slash', tint: color ?? 0xffffff, add: true, rot: ang, s0: 64, s1: 92, a0: 1, life: 0.17,
    });
    this.sparks(tx, ty, color ?? 0xffffff, 3, 110);
  }

  /** Ground telegraph that fills over `delay` ms, then bursts. */
  telegraph(m) {
    const r = clamp(Number.isFinite(m.r) ? m.r : 200, 20, 1000);
    const delay = clamp(Number.isFinite(m.delay) ? m.delay : 0, 0, 5000);
    const color = Number.isFinite(m.color) ? m.color : 0xff5e5e;
    if (!this.onScreen(m.x, m.y, r + 200)) return;
    if (delay <= 30) { this.burst(m.x, m.y, r, color); return; }
    const s = this.scene;
    const g = s.add.graphics().setDepth(D.ground + 0.3);
    g.fillStyle(color, 0.1); g.fillCircle(m.x, m.y, r);
    g.lineStyle(4, color, 0.95); g.strokeCircle(m.x, m.y, r);
    const fill = s.add.image(m.x, m.y, 'moba-disc').setTint(color).setDepth(D.ground + 0.4).setAlpha(0.3).setScale(0.01);
    s.tweens.add({
      targets: fill, scale: (2 * r) / 128, duration: delay, ease: 'Linear',
      onComplete: () => { fill.destroy(); g.destroy(); this.burst(m.x, m.y, r, color); },
    });
  }

  burst(x, y, r, color) {
    if (!this.onScreen(x, y, r + 100)) return;
    this.part(x, y, { tex: 'moba-disc', tint: color, s0: r * 2, s1: r * 2.06, a0: 0.5, a1: 0, life: 0.32, depth: D.ground + 0.5 });
    this.part(x, y, { tex: 'moba-ring', tint: color, add: true, s0: r * 1.8, s1: r * 2.35, a0: 1, life: 0.38 });
    this.part(x, y, { tint: 0xffffff, add: true, s0: r * 0.5, s1: r * 1.2, a0: 0.6, life: 0.2 });
    const n = Math.min(16, 6 + Math.round(r / 40));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3, v = r * (1.6 + Math.random());
      this.part(x, y, {
        tex: 'moba-spark', tint: color, add: true, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 3,
        s0: 22, s1: 4, life: 0.42,
      });
    }
  }

  dash(m) {
    const { x0, y0, x1, y1 } = m;
    if (![x0, y0, x1, y1].every(Number.isFinite)) return;
    if (!this.onScreen(x0, y0, 400) && !this.onScreen(x1, y1, 400)) return;
    const color = Number.isFinite(m.color) ? m.color : 0xffffff;
    const len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
    this.part((x0 + x1) / 2, (y0 + y1) / 2 - 40, {
      tint: color, add: true, rot: ang, s0: 46, s1: 30, w: Math.max(1, len / 46), a0: 0.75, life: 0.32,
    });
    for (let i = 0; i <= 5; i++) {
      const k = i / 5;
      this.part(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k - 44, {
        tint: color, add: true, s0: 64, s1: 20, a0: 0.55, life: 0.22 + k * 0.2,
      });
    }
    this.part(x0, y0, { tex: 'moba-ring', tint: color, add: true, s0: 40, s1: 110, a0: 0.9, life: 0.3 });
  }

  blink(m) {
    const { x0, y0, x1, y1 } = m;
    if (![x0, y0, x1, y1].every(Number.isFinite)) return;
    for (const [x, y, big] of [[x0, y0, false], [x1, y1, true]]) {
      if (!this.onScreen(x, y)) continue;
      this.part(x, y - 44, { tint: 0xd8f0ff, add: true, s0: big ? 70 : 110, s1: big ? 150 : 20, a0: 0.9, life: 0.3 });
      this.part(x, y - 44, { tex: 'moba-ring', tint: 0x9fdcff, add: true, s0: 30, s1: 140, a0: 1, life: 0.32 });
      this.sparks(x, y - 44, 0xbfe6ff, 8, 220);
    }
  }

  buff(x, y, color) {
    if (!this.onScreen(x, y)) return;
    this.part(x, y, { tex: 'moba-ring', tint: color, add: true, s0: 40, s1: 170, h: 0.4, a0: 1, life: 0.42, depth: D.ground + 0.6 });
    for (let i = 0; i < 8; i++) {
      this.part(x + (Math.random() - 0.5) * 70, y - Math.random() * 60, {
        tex: 'moba-spark', tint: color, add: true, vy: -90 - Math.random() * 80, s0: 16, s1: 4,
        life: 0.6 + Math.random() * 0.3, delay: Math.random() * 0.15,
      });
    }
  }

  heal(m) {
    const r = clamp(Number.isFinite(m.r) ? m.r : 200, 30, 1200);
    if (!this.onScreen(m.x, m.y, r)) return;
    const color = Number.isFinite(m.color) ? m.color : 0x7ed957;
    this.part(m.x, m.y, { tex: 'moba-ring', tint: color, add: true, s0: r * 0.4, s1: r * 2, h: 0.45, a0: 0.9, life: 0.5, depth: D.ground + 0.6 });
    this.part(m.x, m.y, { tex: 'moba-disc', tint: color, s0: r * 2, s1: r * 2, h: 0.45, a0: 0.18, life: 0.45, depth: D.ground + 0.5 });
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * r * 0.8;
      this.part(m.x + Math.cos(a) * d, m.y + Math.sin(a) * d * 0.5 - 30, {
        tex: 'moba-plus', tint: color, vy: -70 - Math.random() * 50, s0: 20, s1: 8, life: 0.7, delay: Math.random() * 0.2,
      });
    }
  }

  /** Small "your order" marker on the floor. */
  clickMark(x, y, attack) {
    const c = attack ? 0xff4a4a : 0x7ed957;
    this.part(x, y, { tex: 'moba-ring', tint: c, s0: 54, s1: 14, h: 0.45, a0: 1, life: 0.32, depth: D.ground + 0.7 });
  }

  unitDeath(x, y, size = 44, color = 0xcfd6e0) {
    if (!this.onScreen(x, y)) return;
    const n = size > 100 ? 14 : 7;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 60;
      this.part(x, y, {
        tint: 0x9aa4b4, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 20, s0: size * 0.5, s1: size * 1.1,
        a0: 0.55, life: 0.45 + Math.random() * 0.2,
      });
    }
    this.sparks(x, y, color, size > 100 ? 14 : 5, 160 + size);
  }

  champDeath(x, y, color) {
    if (!this.onScreen(x, y)) return;
    this.unitDeath(x, y - 40, 70, color);
    const s = this.scene;
    const t = s.add.text(x, y - 60, '💀', { fontSize: 38 }).setOrigin(0.5).setDepth(D.numbers);
    s.tweens.add({ targets: t, y: y - 150, alpha: 0, duration: 1300, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  explosion(x, y, big) {
    if (!this.onScreen(x, y, 300)) return;
    const R = big ? 240 : 150;
    const calm = !calmPrefs().flashes; // EP-10: settings.flashes off → no white-out burst
    this.part(x, y, { tint: 0xffe2a0, add: true, s0: R, s1: R * 2.4, a0: calm ? 0.3 : 1, life: 0.35 });
    for (let i = 0; i < 3; i++) {
      this.part(x, y, { tex: 'moba-ring', tint: i || calm ? 0xff9a3c : 0xffffff, add: true, s0: 40, s1: R * (2 + i * 0.6), a0: 1, life: 0.45 + i * 0.12, delay: i * 0.06 });
    }
    for (let i = 0; i < (big ? 30 : 20); i++) {
      const a = Math.random() * Math.PI * 2, v = 200 + Math.random() * 380;
      this.part(x, y, {
        tex: 'moba-spark', tint: Math.random() < 0.5 ? 0xffb347 : 0xffe08a, add: true,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, g: 520, s0: 26, s1: 6, life: 0.7 + Math.random() * 0.4,
      });
    }
    for (let i = 0; i < (big ? 14 : 8); i++) {
      this.part(x + (Math.random() - 0.5) * R * 0.6, y - Math.random() * 40, {
        tint: 0x55595f, vy: -40 - Math.random() * 50, vx: (Math.random() - 0.5) * 40, s0: 60, s1: 150,
        a0: 0.5, life: 1.4 + Math.random() * 0.6, delay: 0.1 + Math.random() * 0.3,
      });
    }
  }

  levelUp(x, y, mine) {
    if (!this.onScreen(x, y)) return;
    this.part(x, y, { tex: 'moba-ring', tint: 0xffd23f, add: true, s0: 40, s1: 190, h: 0.42, a0: 1, life: 0.55, depth: D.ground + 0.6 });
    for (let i = 0; i < 10; i++) {
      this.part(x + (Math.random() - 0.5) * 80, y - Math.random() * 90, {
        tex: 'moba-spark', tint: 0xffd23f, add: true, vy: -120 - Math.random() * 60, s0: 18, s1: 4,
        life: 0.7, delay: Math.random() * 0.2,
      });
    }
    if (mine) this.number(x, y - 150, 'LEVEL UP!', 'info');
  }

  gold(x, y, n) {
    this.number(x, y - 60, `+${n} 🪙`, 'gold');
    if (this.onScreen(x, y)) this.sparks(x, y - 50, 0xffd23f, 4, 90);
  }

  // ───────────────────────── v2: zones, knockbacks, pet zaps ─────────────────────────
  /** Persistent area `fx {k:'zone', x, y, r, ms, tickMs, color}` — puddle + pulse each tick. */
  zone(m, icon) {
    const r = clamp(Number.isFinite(m.r) ? m.r : 200, 20, 1000);
    const ms = clamp(Number.isFinite(m.ms) ? m.ms : 3000, 100, 20000);
    const tick = clamp(Number.isFinite(m.tickMs) && m.tickMs > 0 ? m.tickMs : 500, 100, 5000);
    const color = Number.isFinite(m.color) ? m.color : 0x7ec8ff;
    while (this.zones.length >= MAX_ZONES) this._endZone(this.zones.shift(), true);
    const s = this.scene, dep = D.ground + 0.2;
    const disc = s.add.image(m.x, m.y, 'moba-disc').setTint(color).setDepth(dep).setAlpha(0).setDisplaySize(r * 2, r * 2);
    const ring = s.add.image(m.x, m.y, 'moba-ring').setTint(color).setDepth(dep + 0.05).setAlpha(0).setDisplaySize(r * 2.02, r * 2.02);
    const inner = s.add.image(m.x, m.y, 'moba-ring').setTint(0xffffff).setDepth(dep + 0.05).setAlpha(0).setDisplaySize(r * 1.4, r * 1.4);
    const sign = icon ? s.add.text(m.x, m.y, icon, { fontSize: Math.round(clamp(r * 0.28, 24, 64)) }).setOrigin(0.5).setDepth(dep + 0.1).setAlpha(0) : null;
    this.zones.push({ disc, ring, inner, sign, x: m.x, y: m.y, r, ms, tick, color, t: 0, nextTick: 0 });
  }
  _endZone(z, now) {
    if (!z || z.done) return;
    z.done = true;
    const objs = [z.disc, z.ring, z.inner, z.sign].filter(Boolean);
    if (now) { for (const o of objs) o.destroy(); return; }
    this.scene.tweens.add({ targets: objs, alpha: 0, duration: 260, onComplete: () => objs.forEach((o) => o.destroy()) });
  }
  _zoneTick(z) {
    if (!this.onScreen(z.x, z.y, z.r + 100)) return;
    this.part(z.x, z.y, { tex: 'moba-ring', tint: z.color, add: true, s0: z.r * 0.5, s1: z.r * 2, a0: 0.7, life: 0.45, depth: D.ground + 0.35 });
    const n = Math.min(8, 3 + Math.round(z.r / 80));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * z.r * 0.9;
      this.part(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, {
        tint: i % 2 ? 0xffffff : z.color, add: true, vy: -30 - Math.random() * 40, s0: 14 + Math.random() * 10, s1: 4,
        a0: 0.8, life: 0.5 + Math.random() * 0.3, depth: D.fx,
      });
    }
  }

  /** Displacement `fx {k:'knock', x0,y0,x1,y1, ms, wall}`: dust trail; wall → impact burst + BONK. */
  knock(m, mine) {
    const { x0, y0, x1, y1 } = m;
    if (![x0, y0, x1, y1].every(Number.isFinite)) return;
    const ms = clamp(Number.isFinite(m.ms) ? m.ms : 200, 50, 1500) / 1000;
    const vis = this.onScreen(x0, y0, 300) || this.onScreen(x1, y1, 300);
    if (vis) {
      const len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
      if (len > 8) {
        this.part((x0 + x1) / 2, (y0 + y1) / 2 - 30, {
          tint: 0xd9cdb0, add: true, rot: ang, s0: 34, s1: 20, w: Math.max(1, len / 34), a0: 0.45, life: ms + 0.15,
        });
      }
      const n = Math.max(3, Math.min(9, Math.round(len / 45)));
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        this.part(x0 + (x1 - x0) * k + (Math.random() - 0.5) * 18, y0 + (y1 - y0) * k + 4, {
          tint: 0xb9ab8c, vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 30, drag: 2,
          s0: 22 + Math.random() * 14, s1: 60 + Math.random() * 20, a0: 0.5, life: 0.5, delay: k * ms,
        });
      }
    }
    if (!m.wall) return;
    if (vis) {
      const ix = x1, iy = y1 - 40;
      if (calmPrefs().flashes) this.part(ix, iy, { tint: 0xffffff, add: true, s0: 50, s1: 150, a0: 0.95, life: 0.22, delay: ms });
      this.part(ix, iy, { tex: 'moba-ring', tint: 0xffd23f, add: true, s0: 30, s1: 170, a0: 1, life: 0.35, delay: ms });
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2, v = 160 + Math.random() * 200;
        this.part(ix, iy, {
          tex: 'moba-spark', tint: i % 2 ? 0xffd23f : 0xffffff, add: true, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 3,
          s0: 20, s1: 4, life: 0.4, delay: ms, vr: (Math.random() - 0.5) * 14,
        });
      }
    }
    const s = this.scene;
    s.time.delayedCall(ms * 1000, () => {
      if (!s.sys?.isActive?.() || s._shuttingDown || !this.onScreen(x1, y1, 200)) return;
      const t = s.add.text(x1, y1 - 120, 'BONK!', {
        fontFamily: FONT, fontSize: mine ? 34 : 26, color: '#ffd23f', stroke: '#3a2400', strokeThickness: 7,
      }).setOrigin(0.5).setDepth(D.numbers).setScale(0.4).setAngle((Math.random() - 0.5) * 24);
      s.tweens.add({ targets: t, scale: 1, duration: 140, ease: 'Back.easeOut' });
      s.tweens.add({ targets: t, y: t.y - 50, alpha: 0, delay: 520, duration: 420, onComplete: () => t.destroy() });
      if (mine) shakeCam(s, 180, 0.007);
    });
  }

  /** Pet attack `fx {k:'petatk'}`: jagged zap beam from the pet to its target. */
  zap(x0, y0, x1, y1, color = 0x00e5ff) {
    if (!this.onScreen(x0, y0, 200) && !this.onScreen(x1, y1, 200)) return;
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 4) return;
    const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    const pts = [[x0, y0]];
    const segs = Math.max(2, Math.min(5, Math.round(len / 70)));
    for (let i = 1; i < segs; i++) {
      const k = i / segs, j = (Math.random() - 0.5) * Math.min(40, len * 0.25);
      pts.push([x0 + (x1 - x0) * k + nx * j, y0 + (y1 - y0) * k + ny * j]);
    }
    pts.push([x1, y1]);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const l = Math.hypot(bx - ax, by - ay), a = Math.atan2(by - ay, bx - ax);
      this.part((ax + bx) / 2, (ay + by) / 2, { tint: color, add: true, rot: a, s0: 16, s1: 10, w: Math.max(1, l / 16), a0: 0.9, life: 0.16, depth: D.fxTop });
      this.part((ax + bx) / 2, (ay + by) / 2, { tint: 0xffffff, add: true, rot: a, s0: 6, s1: 4, w: Math.max(1, l / 6), a0: 1, life: 0.12, depth: D.fxTop });
    }
    this.part(x0, y0, { tint: color, add: true, s0: 30, s1: 10, a0: 0.9, life: 0.18 });
    this.part(x1, y1, { tint: color, add: true, s0: 36, s1: 60, a0: 0.8, life: 0.16 });
    this.sparks(x1, y1, color, 3, 120);
  }

  // ───────────────────────── v3: summoner spells (`fx {k:'spell', spell, x0,y0,x1,y1}`) ─────────────────────────
  /** Per-spell effect. color = SPELLS[spell].color. */
  spell(m, color) {
    const { x0, y0 } = m;
    const x1 = Number.isFinite(m.x1) ? m.x1 : x0, y1 = Number.isFinite(m.y1) ? m.y1 : y0;
    if (![x0, y0].every(Number.isFinite)) return;
    switch (m.spell) {
      case 'flash': { // "Alt+Tab": window-switch burst at both ends + a faint streak
        for (const [x, y, end] of [[x0, y0, false], [x1, y1, true]]) {
          if (!this.onScreen(x, y)) continue;
          this.part(x, y - 44, { tint: 0xffffff, add: true, s0: end ? 60 : 120, s1: end ? 160 : 16, a0: 1, life: 0.28 });
          this.part(x, y - 44, { tint: color, add: true, s0: end ? 40 : 90, s1: end ? 190 : 30, a0: 0.9, life: 0.36 });
          this.part(x, y - 44, { tex: 'moba-ring', tint: color, add: true, s0: 30, s1: 170, a0: 1, life: 0.34 });
          this.part(x, y, { tex: 'moba-ring', tint: color, add: true, s0: 140, s1: 30, h: 0.42, a0: 0.9, life: 0.3, depth: D.ground + 0.6 });
          this.sparks(x, y - 44, color, 10, 260);
        }
        const len = Math.hypot(x1 - x0, y1 - y0);
        if (len > 10 && (this.onScreen(x0, y0, 300) || this.onScreen(x1, y1, 300))) {
          this.part((x0 + x1) / 2, (y0 + y1) / 2 - 44, {
            tint: color, add: true, rot: Math.atan2(y1 - y0, x1 - x0), s0: 22, s1: 6, w: Math.max(1, len / 22), a0: 0.55, life: 0.22,
          });
        }
        break;
      }
      case 'heal': { // "Coffee Break": on the caster and the healed ally (x1,y1)
        this.heal({ x: x0, y: y0, r: 130, color });
        if (Math.hypot(x1 - x0, y1 - y0) > 20) {
          this.heal({ x: x1, y: y1, r: 110, color });
          if (this.onScreen(x0, y0, 400) || this.onScreen(x1, y1, 400)) this.zap(x0, y0 - 46, x1, y1 - 46, color);
        }
        if (this.onScreen(x0, y0)) this.number(x0, y0 - 130, '☕', 'heal');
        break;
      }
      case 'barrier': { // "Ctrl+Z": a bubble that snaps around the caster
        if (!this.onScreen(x0, y0)) return;
        this.part(x0, y0 - 46, { tex: 'moba-ring', tint: color, add: true, s0: 200, s1: 110, a0: 0.2, a1: 1, life: 0.22 });
        this.part(x0, y0 - 46, { tex: 'moba-ring', tint: 0xffffff, add: true, s0: 110, s1: 120, a0: 1, life: 0.5, delay: 0.2 });
        this.part(x0, y0 - 46, { tex: 'moba-disc', tint: color, s0: 110, s1: 116, a0: 0.28, life: 0.6, delay: 0.2 });
        this.number(x0, y0 - 140, 'Ctrl+Z', 'ally');
        break;
      }
      case 'ghost': { // "Overtime": speed burst; the trail continues while the buff lasts (ghostTrail)
        if (!this.onScreen(x0, y0)) return;
        this.part(x0, y0, { tex: 'moba-ring', tint: color, add: true, s0: 40, s1: 200, h: 0.42, a0: 1, life: 0.4, depth: D.ground + 0.6 });
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          this.part(x0 + Math.cos(a) * 30, y0 - 40 + Math.sin(a) * 20, {
            tint: color, add: true, rot: a, vx: Math.cos(a) * 260, vy: Math.sin(a) * 160, drag: 3, s0: 26, s1: 8, w: 2.4, a0: 0.8, life: 0.35,
          });
        }
        break;
      }
      case 'ignite': { // "Escalate": a fireball from the caster, flames burst on the target (x1, y1)
        if (this.onScreen(x0, y0, 400) || this.onScreen(x1, y1, 400)) this.zap(x0, y0 - 50, x1, y1 - 50, color);
        if (!this.onScreen(x1, y1)) return;
        this.part(x1, y1 - 46, { tint: 0xffd23f, add: true, s0: 60, s1: 140, a0: 0.9, life: 0.25 });
        for (let i = 0; i < 10; i++) this.flames(x1 + (Math.random() - 0.5) * 50, y1 - Math.random() * 60, color);
        this.number(x1, y1 - 140, '🔥 ESCALATED', 'big');
        break;
      }
      case 'smite': { // "kill -9": lightning strike from the sky onto the target (x1, y1)
        if (!this.onScreen(x1, y1, 300)) return;
        this.zap(x1 + (Math.random() - 0.5) * 60, y1 - 520, x1, y1 - 30, color);
        this.zap(x1 + (Math.random() - 0.5) * 80, y1 - 480, x1, y1 - 30, 0xffffff);
        this.part(x1, y1 - 30, { tint: 0xffffff, add: true, s0: 80, s1: 220, a0: 1, life: 0.22 });
        this.part(x1, y1, { tex: 'moba-ring', tint: color, add: true, s0: 40, s1: 260, h: 0.45, a0: 1, life: 0.45, depth: D.ground + 0.6 });
        this.sparks(x1, y1 - 30, color, 12, 300);
        this.number(x1, y1 - 120, 'kill -9', 'big');
        break;
      }
      default:
        this.burst(x0, y0, 80, color ?? 0xffffff);
    }
  }

  /** Overtime (ghost) afterimage puff — called by the scene while a champion has the `ghost` buff. */
  ghostTrail(x, y, color = 0x39c2ff) {
    if (!this.onScreen(x, y)) return;
    this.part(x, y - 46, { tint: color, add: true, s0: 70, s1: 40, w: 0.55, h: 1.3, a0: 0.35, life: 0.35 });
    this.part(x + (Math.random() - 0.5) * 30, y - 10, { tex: 'moba-spark', tint: color, add: true, vy: -30, s0: 12, s1: 3, a0: 0.8, life: 0.3 });
  }

  /** One rising flame lick — Escalate (ignite) ticks while the target has the `ignited` buff. */
  flames(x, y, color = 0xff7a1a) {
    if (!this.onScreen(x, y)) return;
    this.part(x, y, {
      tint: Math.random() < 0.5 ? color : 0xffd23f, add: true, vx: (Math.random() - 0.5) * 30, vy: -90 - Math.random() * 60,
      s0: 26 + Math.random() * 12, s1: 4, a0: 0.9, life: 0.45 + Math.random() * 0.2, depth: D.fxTop,
    });
  }

  respawn(x, y, color) {
    if (!this.onScreen(x, y)) return;
    this.part(x, y, { tex: 'moba-ring', tint: color, add: true, s0: 180, s1: 30, h: 0.42, a0: 0.2, a1: 1, life: 0.4, depth: D.ground + 0.6 });
    this.part(x, y - 50, { tint: color, add: true, s0: 40, s1: 160, w: 0.45, h: 1.4, a0: 0.9, life: 0.5 });
  }

  // ───────────────────────── per frame ─────────────────────────
  update(dt) {
    const zones = this.zones;
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      z.t += dt * 1000;
      if (z.t >= z.ms) { this._endZone(z, false); zones.splice(i, 1); continue; }
      const fadeIn = Math.min(1, z.t / 180);
      const k = (z.t % z.tick) / z.tick;
      z.disc.setAlpha(0.2 * fadeIn + 0.06 * (1 - k));
      z.ring.setAlpha(0.85 * fadeIn);
      z.inner.setAlpha(0.35 * fadeIn * (1 - k)).setDisplaySize(z.r * (1.1 + 0.8 * k), z.r * (1.1 + 0.8 * k));
      if (z.sign) z.sign.setAlpha(0.75 * fadeIn);
      if (z.t >= z.nextTick) { z.nextTick += z.tick; this._zoneTick(z); }
    }
    const parts = this.parts;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      const wasWaiting = p.t < 0;
      p.t += dt;
      if (p.t < 0) continue;
      if (wasWaiting) p.img.setVisible(true);
      const k = p.t / p.life;
      if (k >= 1) {
        this._release(p.img);
        parts[i] = parts[parts.length - 1]; parts.pop();
        continue;
      }
      if (p.drag) { const f = Math.max(0, 1 - p.drag * dt); p.vx *= f; p.vy *= f; }
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.img.setPosition(p.x, p.y);
      if (p.vr) p.img.rotation += p.vr * dt;
      this._applyPart(p, k);
    }

    const nums = this.nums;
    for (let i = nums.length - 1; i >= 0; i--) {
      const n = nums[i];
      n.t += dt;
      const k = n.t / n.life;
      if (k >= 1) {
        n.txt.setVisible(false); this.numPool.push(n.txt);
        nums.splice(i, 1);
        continue;
      }
      const pop = n.t < 0.1 ? 0.5 + (n.t / 0.1) * 0.75 : Math.max(1, 1.25 - (n.t - 0.1) * 2.5);
      n.txt.setScale(pop);
      n.txt.setPosition(n.x, n.y - n.rise * (1 - (1 - k) * (1 - k)));
      n.txt.setAlpha(k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
    }

    const shots = this.shots;
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      if (s.done) { shots.splice(i, 1); continue; }
      s.t += dt;
      if (s.kind === 'skill') {
        s.dist += s.speed * dt;
        if (s.dist >= s.range) {
          s.done = true;
          const ex = s.x0 + s.ux * s.range, ey = s.y0 + s.uy * s.range;
          this._release(s.head); this._release(s.core); this._release(s.trail);
          if (this.onScreen(ex, ey)) this.part(ex, ey, { tint: s.color, add: true, s0: s.width * 1.6, s1: s.width * 0.4, a0: 0.8, life: 0.2 });
          shots.splice(i, 1);
          continue;
        }
        s.x = s.x0 + s.ux * s.dist; s.y = s.y0 + s.uy * s.dist;
        s.head.setPosition(s.x, s.y); s.core.setPosition(s.x, s.y);
        if (s.spin) s.core.rotation += s.spin * dt;
        const tl = Math.min(s.dist, 150 + s.width * 1.5);
        s.trail.setPosition(s.x, s.y).setDisplaySize(Math.max(8, tl), s.width * 0.85).setAlpha(0.75);
      } else {
        const p = this.posOf(s.target);
        if (p) { s.tx = p.x; s.ty = p.y; s.seen = true; }
        else if (s.seen) { // target vanished mid-flight (bush / removed): fizzle, no impact
          s.done = true;
          this._release(s.head); this._release(s.core);
          if (this.onScreen(s.x, s.y)) this.part(s.x, s.y, { tint: s.color, add: true, s0: s.size * 1.6, s1: 2, a0: 0.5, life: 0.16 });
          shots.splice(i, 1);
          continue;
        }
        const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy), step = s.speed * dt;
        if (d <= step + 6 || s.t > 1.6) {
          s.done = true;
          this._endShot(s, s.tx, s.ty);
          shots.splice(i, 1);
          continue;
        }
        s.x += (dx / d) * step; s.y += (dy / d) * step;
        s.head.setPosition(s.x, s.y); s.core.setPosition(s.x, s.y);
      }
    }
  }

  /** Textured skill/combat burst from assets/moba/vfx-*.png (CC0 Kenney particle pack). */
  burstTex(x, y, key, size = 96, tint = 0x39c2ff, duration = 360, spin = 60) {
    if (this.low || !this.scene?.textures?.exists(key) || !this.onScreen(x, y, size)) return;
    const im = this.scene.add.image(x, y, key)
      .setDisplaySize(size * 0.4, size * 0.4)
      .setTint(tint)
      .setBlendMode(ADD)
      .setDepth(D.fx)
      .setAlpha(0.9);
    this.scene.tweens.add({
      targets: im,
      displayWidth: size,
      displayHeight: size,
      angle: spin,
      alpha: 0,
      duration,
      ease: 'Cubic.easeOut',
      onComplete: () => im.destroy(),
    });
  }
}

// SkillFx — one-of-a-kind skill visuals for Team Mode (skill diversity rework, 2026-11-27).
//
// Every skill in shared/moba/champions.js carries an `fx` style key (see SKILL_FX there). The scene
// resolves the style from the cast message (sid + slot) and calls castFx(); a skill WITHOUT a style
// falls back to MobaFx's generic ring + burst. Built from the Kenney Particle Pack sprites
// (assets/moba/vfx, CC0) plus a few emoji glyphs — no explosion disc is reused between styles.
//
// Kinds: circle (ground area, windup = c.delay), zone (persistent, c.ms), dash / blink (x0,y0 → x1,y1),
//        buff (on the caster), tgt (point-and-click, x0,y0 → x1,y1). Projectiles use PROJ (a head look
//        + per-frame decoration handled by MobaFx.skillshot / update).
import { D } from './mobaGfx.js';

const TAU = Math.PI * 2;
const K = (n) => `vfx-${n}`;
const rnd = (a, b) => a + Math.random() * (b - a);
const N = (f, n) => (f.low ? Math.max(2, n >> 1) : n);
const ang = (x0, y0, x1, y1) => Math.atan2(y1 - y0, x1 - x0);

/** Sprites loaded by TeamModeScene.preload (only the ones the styles below use). */
export const VFX_NAMES = [
  'circle_01', 'circle_02', 'circle_03', 'circle_05', 'dirt_01', 'dirt_02', 'dirt_03', 'fire_01', 'flame_05',
  'flare_01', 'light_01', 'light_02', 'light_03', 'magic_01', 'magic_02', 'magic_03', 'magic_05', 'muzzle_01',
  'muzzle_02', 'muzzle_04', 'scorch_01', 'scorch_03', 'scratch_01', 'slash_01', 'slash_02', 'slash_03', 'slash_04',
  'smoke_03', 'smoke_04', 'smoke_07', 'smoke_09', 'smoke_10', 'spark_01', 'spark_02', 'spark_05', 'spark_06',
  'spark_07', 'star_04', 'star_06', 'star_08', 'star_09', 'symbol_01', 'trace_03', 'trace_04', 'trace_06',
  'trace_07', 'twirl_01', 'twirl_02', 'twirl_03', 'window_01', 'window_03', 'window_04',
];

// ───────────────────────── primitives ─────────────────────────
/** A tweened one-shot sprite. size/size1 in px, spin in radians over the life, sx/sy stretch. */
function sp(f, name, x, y, o = {}) {
  const s = f.scene, key = K(name);
  if (!s.textures.exists(key)) return null;
  const img = s.add.image(x, y, key).setDepth(o.depth ?? D.fx).setBlendMode(o.add === false ? 0 : 1)
    .setTint(o.tint ?? 0xffffff).setRotation(o.rot || 0).setAlpha(0);
  const sx = o.sx ?? 1, sy = o.sy ?? 1, a = (o.size ?? 64) / 256, b = (o.size1 ?? o.size ?? 64) / 256;
  img.setScale(a * sx, a * sy);
  s.tweens.add({
    targets: img, delay: o.delay || 0, duration: o.life || 400, ease: o.ease || 'Sine.easeOut',
    scaleX: b * sx, scaleY: b * sy, x: x + (o.dx || 0), y: y + (o.dy || 0), rotation: (o.rot || 0) + (o.spin || 0),
    alpha: { from: o.a0 ?? 1, to: o.a1 ?? 0 }, onStart: () => img.setAlpha(o.a0 ?? 1), onComplete: () => img.destroy(),
  });
  return img;
}
/** A tweened emoji / text glyph. */
function gl(f, str, x, y, o = {}) {
  const s = f.scene;
  const t = s.add.text(x, y, str, {
    fontFamily: 'Arial, sans-serif', fontSize: `${o.size || 26}px`, color: o.color || '#ffffff',
    stroke: o.stroke || '#000000', strokeThickness: o.thick ?? 3, fontStyle: o.bold ? 'bold' : 'normal',
  }).setOrigin(0.5).setDepth(o.depth ?? D.fxTop).setAlpha(0).setRotation(o.rot || 0).setScale(o.s0 ?? 1);
  s.tweens.add({
    targets: t, delay: o.delay || 0, duration: o.life || 700, ease: o.ease || 'Sine.easeOut',
    x: x + (o.dx || 0), y: y + (o.dy || 0), scale: o.s1 ?? 1, rotation: (o.rot || 0) + (o.spin || 0),
    alpha: { from: o.a0 ?? 1, to: o.a1 ?? 0 }, onStart: () => t.setAlpha(o.a0 ?? 1), onComplete: () => t.destroy(),
  });
  return t;
}
/** Run `fn(i)` every `every` ms for `ms` ms (stops with the scene). */
function loop(f, ms, every, fn) {
  const n = Math.max(1, Math.floor(ms / every));
  f.scene.time.addEvent({ delay: every, repeat: n - 1, callback: () => { if (f.scene.sys.isActive()) fn(); } });
}
const inDisc = (x, y, r) => { const a = rnd(0, TAU), d = Math.sqrt(Math.random()) * r; return [x + Math.cos(a) * d, y + Math.sin(a) * d]; };
const GROUND = D.ground + 0.4;

// ───────────────────────── flipbooks (RPG VFX Pack, CC0 — assets/moba/fb/*.webp, 8 cols × 128 px) ─────────────────────────
/** key → frame count */
export const FB = {
  ringGreen: 32, ringWhite: 32, ringGold: 32, ringOrange: 32, ringBlue: 32, ringDots: 16, pentagram: 32,
  burstWhite: 32, burstGreen: 32, burstOrange: 32, burstBlue: 32, burstFire: 32, burstBlood: 32, ringPurple: 32,
  chaosSpike: 16, chaosCloud: 64, blackHole: 64, iceBolt: 32, tornado: 64, flameA: 64, flameB: 64, fireCloud: 64,
  fireball: 64, smoke: 64, airCloud: 64, divineCloud: 64, impactAir: 16, impactGold: 16, sparkGold: 16,
  impactLeaf: 16, impactWater: 16, crosshair: 16, bloodSlash: 16, splatter: 16, waterDots: 64,
};
export function loadFb(scene) {
  for (const k of Object.keys(FB)) if (!scene.textures.exists(`fb-${k}`)) scene.load.spritesheet(`fb-${k}`, `assets/moba/fb/${k}.webp`, { frameWidth: 128, frameHeight: 128 });
}
/** A one-shot animated flipbook sprite playing over `life` ms (default 0.04 s per frame). */
function fb(f, key, x, y, o = {}) {
  const s = f.scene, tex = `fb-${key}`;
  if (!FB[key] || !s.textures.exists(tex)) return null;
  const n = FB[key];
  if (!s.anims.exists(tex)) s.anims.create({ key: tex, frames: s.anims.generateFrameNumbers(tex, { start: 0, end: n - 1 }), frameRate: 24, repeat: 0 });
  const img = s.add.sprite(x, y, tex, 0).setDepth(o.depth ?? D.fx).setBlendMode(o.add === false ? 0 : 1)
    .setTint(o.tint ?? 0xffffff).setRotation(o.rot || 0).setAlpha(0).setScale((o.size ?? 128) / 128);
  const life = o.life || n * 40;
  const start = () => {
    if (!img.scene) return;
    img.setAlpha(o.a0 ?? 1).anims.play({ key: tex, frameRate: (n / life) * 1000 });
    if (o.size1) s.tweens.add({ targets: img, scale: o.size1 / 128, duration: life, ease: 'Sine.easeOut' });
  };
  img.once('animationcomplete', () => img.destroy());
  if (o.delay) s.time.delayedCall(o.delay, start); else start();
  return img;
}

// ───────────────────────── circle: ground areas (windup = c.delay) ─────────────────────────
const CIRCLE = {
  // Ops Q: a radar sweep that pings blips.
  scan(f, { x, y, r, delay, color }) {
    sp(f, 'light_03', x, y, { size: r * 2, a0: 0.5, life: delay + 380, tint: color, depth: GROUND });
    sp(f, 'twirl_01', x, y, { size: r * 2.1, spin: TAU, life: delay + 450, tint: 0xbfffd0, delay: delay * 0.4, a0: 0.9 });
    for (let i = 0; i < N(f, 6); i++) { const [bx, by] = inDisc(x, y, r * 0.85); sp(f, 'circle_05', bx, by, { size: 10, size1: 26, life: 380, delay: delay + 80 * i, tint: 0x7dff9a }); }
  },
  // Pixel R: a spinning sigil charges, then lines of code rain down.
  rune(f, { x, y, r, delay, color }) {
    sp(f, 'magic_02', x, y, { size: r * 2.1, spin: Math.PI, life: delay + 300, tint: color, a0: 0.9, depth: GROUND });
    sp(f, 'magic_01', x, y, { size: r * 1.3, spin: -Math.PI * 1.4, life: delay + 300, tint: 0xffffff, a0: 0.8, depth: GROUND });
    for (let i = 0; i < N(f, 7); i++) {
      const [bx, by] = inDisc(x, y, r * 0.9);
      sp(f, 'spark_06', bx, by - 120, { size: 260, sy: 1, life: 260, delay: delay + 40 * i, tint: i % 2 ? 0xb084ff : 0x7ee0ff, a0: 1 });
      sp(f, 'star_09', bx, by, { size: 30, size1: 110, life: 300, delay: delay + 40 * i, tint: 0xffffff });
    }
    sp(f, 'magic_03', x, y, { size: r * 0.8, size1: r * 2, spin: 1.2, life: 420, delay, tint: color });
  },
  // Stack R: a vortex of spiral arms collapsing inward.
  vortex(f, { x, y, r, delay, color }) {
    for (let i = 0; i < 3; i++) sp(f, ['twirl_01', 'twirl_02', 'twirl_03'][i], x, y, { size: r * 2.3, size1: r * 0.5, spin: -TAU * (1 + i * 0.3), life: delay + 520, delay: i * 60, tint: i ? 0xffffff : color, a0: 0.9, depth: GROUND });
    for (let i = 0; i < N(f, 8); i++) { const a = (i / 8) * TAU; sp(f, 'dirt_01', x + Math.cos(a) * r, y + Math.sin(a) * r, { size: 60, size1: 14, dx: -Math.cos(a) * r, dy: -Math.sin(a) * r, life: delay + 480, tint: color, ease: 'Quad.easeIn' }); }
    sp(f, 'circle_03', x, y, { size: r * 2.4, size1: r * 0.4, life: delay + 480, tint: color, ease: 'Quad.easeIn' });
  },
  // Model R: a black hole with a bright accretion ring.
  singularity(f, { x, y, r, delay }) {
    sp(f, 'circle_05', x, y, { size: r * 0.3, size1: r * 1.3, life: delay + 300, tint: 0x000000, add: false, a0: 0.9, a1: 0.75, depth: GROUND });
    sp(f, 'smoke_10', x, y, { size: r * 2.2, size1: r * 0.7, spin: -TAU, life: delay + 400, tint: 0x6a3fff, a0: 0.8 });
    sp(f, 'twirl_02', x, y, { size: r * 2.4, size1: r * 0.6, spin: -TAU * 1.5, life: delay + 400, tint: 0x00ffcc, a0: 0.95 });
    sp(f, 'light_03', x, y, { size: r * 2.4, size1: r * 0.5, life: delay + 400, tint: 0xffffff, ease: 'Quad.easeIn', a0: 0.9 });
    sp(f, 'star_09', x, y, { size: r * 0.4, size1: r * 1.4, life: 360, delay: delay + 380, tint: 0xffffff });
  },
  // Model Q: a wireframe data sphere collapses into cubes.
  dataSphere(f, { x, y, r, delay, color }) {
    sp(f, 'magic_01', x, y, { size: r * 2, spin: Math.PI, life: delay + 250, tint: color, depth: GROUND });
    sp(f, 'window_04', x, y, { size: r * 1.9, size1: r * 0.3, spin: -Math.PI, life: delay + 330, tint: color, a0: 0.8 });
    for (let i = 0; i < N(f, 8); i++) { const a = (i / 8) * TAU; sp(f, 'window_01', x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9, { size: 26, size1: 8, dx: -Math.cos(a) * r * 0.9, dy: -Math.sin(a) * r * 0.9, spin: 3, life: delay + 300, tint: 0xb6fff0, ease: 'Quad.easeIn' }); }
    sp(f, 'star_06', x, y, { size: 40, size1: r * 1.4, life: 300, delay: delay + 300, tint: 0xffffff });
  },
  // Model E: roots burst out of the floor and snare.
  roots(f, { x, y, r, delay, color }) {
    sp(f, 'circle_01', x, y, { size: r * 2, a0: 0.4, life: delay + 700, tint: 0x2ecc71, depth: GROUND });
    for (let i = 0; i < N(f, 9); i++) {
      const [bx, by] = inDisc(x, y, r * 0.85), h = rnd(90, 160);
      sp(f, i % 2 ? 'trace_03' : 'trace_04', bx, by - h * 0.5, { size: h, sx: 0.5, sy: 1, size1: h * 1.3, life: 520, delay: delay + 30 * i, tint: i % 3 ? 0x6cff7a : color, rot: rnd(-0.4, 0.4), ease: 'Back.easeOut' });
      sp(f, 'dirt_02', bx, by, { size: 40, size1: 80, life: 380, delay: delay + 30 * i, tint: 0x6b4a2a, add: false, a0: 0.8 });
    }
  },
  // Brick R: hazard bars slam shut around you, then the floor locks down.
  lockdown(f, { x, y, r, delay }) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4, ex = Math.cos(a) * r, ey = Math.sin(a) * r;
      sp(f, 'window_03', x + ex * 1.5, y + ey * 1.5, { size: r * 0.9, size1: r * 0.7, rot: a + Math.PI / 2, dx: -ex * 0.5, dy: -ey * 0.5, life: Math.max(180, delay + 160), tint: 0xffd23f, a0: 0.9, ease: 'Back.easeOut' });
    }
    sp(f, 'circle_03', x, y, { size: r * 1.3, size1: r * 2.2, life: 420, delay: delay + 120, tint: 0xffd23f });
    sp(f, 'dirt_03', x, y, { size: r * 1.2, size1: r * 2.1, life: 460, delay: delay + 120, tint: 0x8a8f99, add: false, a0: 0.7 });
    sp(f, 'scratch_01', x, y, { size: r * 1.6, life: 300, delay: delay + 100, tint: 0xffffff });
  },
  // Rush E: a parcel falls from the sky and thuds.
  parcelDrop(f, { x, y, r, delay }) {
    sp(f, 'circle_05', x, y, { size: r * 0.4, size1: r * 1.5, life: delay + 60, tint: 0x000000, add: false, a0: 0.15, a1: 0.5, depth: GROUND });
    gl(f, '📦', x, y - 420, { size: 54, dy: 420, life: Math.max(160, delay), ease: 'Quad.easeIn', a0: 1, a1: 1, s0: 1.3, s1: 1 });
    sp(f, 'dirt_02', x, y, { size: r * 0.6, size1: r * 2, life: 420, delay: delay + 20, tint: 0xc8a165, add: false, a0: 0.85 });
    sp(f, 'smoke_04', x, y, { size: r * 0.5, size1: r * 1.7, life: 520, delay: delay + 20, tint: 0xffffff, add: false, a0: 0.5 });
    sp(f, 'scorch_03', x, y, { size: r * 1.3, life: 900, delay: delay + 20, tint: 0x3a2a1a, add: false, a0: 0.6, depth: GROUND });
  },
  // Rush R: a rain of dollar signs prices the whole area.
  priceTag(f, { x, y, r, delay }) {
    for (let i = 0; i < N(f, 14); i++) {
      const [bx, by] = inDisc(x, y, r * 0.9), d = (delay * i) / 14;
      gl(f, '$', bx, by - 300, { size: rnd(26, 40), color: '#ffe36a', dy: 300, life: 240, delay: d, ease: 'Quad.easeIn', a1: 1, spin: rnd(-1, 1) });
      sp(f, 'star_06', bx, by, { size: 20, size1: 90, life: 280, delay: d + 240, tint: 0xffd23f });
    }
    sp(f, 'circle_03', x, y, { size: r * 0.5, size1: r * 2.1, life: 420, delay: delay + 200, tint: 0xff3b3b });
  },
  // Zero E: three blades whirl around you.
  bladeSpin(f, { x, y, r }) {
    for (let i = 0; i < 3; i++) sp(f, 'slash_01', x, y, { size: r * 2.3, rot: (i / 3) * TAU, spin: TAU * 0.9, life: 300, tint: i ? 0xd0a0ff : 0xffffff, a0: 1, ease: 'Cubic.easeOut' });
    sp(f, 'twirl_01', x, y, { size: r * 2.2, spin: TAU, life: 300, tint: 0x8a6cff, a0: 0.7 });
    sp(f, 'smoke_07', x, y, { size: r * 0.8, size1: r * 2, life: 420, tint: 0x1a1a2e, add: false, a0: 0.5 });
  },
  // Patch Q: a keyboard swing sends keycaps flying.
  keyboardSpin(f, { x, y, r, color }) {
    sp(f, 'twirl_01', x, y, { size: r * 2.2, spin: TAU, life: 300, tint: color });
    sp(f, 'slash_02', x, y, { size: r * 2.2, rot: 0, spin: TAU, life: 300, tint: 0xffffff });
    const keys = ['Q', 'W', 'E', 'R', '⌘', '⏎', 'git', 'fix'];
    for (let i = 0; i < N(f, 8); i++) {
      const a = (i / 8) * TAU, d = r * 1.05;
      sp(f, 'window_01', x, y, { size: 30, size1: 22, dx: Math.cos(a) * d, dy: Math.sin(a) * d, spin: rnd(-4, 4), life: 480, tint: 0xc9d6ff, a0: 0.95 });
      gl(f, keys[i], x, y, { size: 15, color: '#1a1030', thick: 0, dx: Math.cos(a) * d, dy: Math.sin(a) * d, life: 480 });
    }
  },
  // Sprint Q: sticky notes pop up around the stand-up.
  standup(f, { x, y, r }) {
    sp(f, 'circle_02', x, y, { size: r * 0.8, size1: r * 2.1, life: 380, tint: 0xffc94d });
    for (let i = 0; i < N(f, 7); i++) {
      const a = (i / 7) * TAU, d = r * 0.85;
      sp(f, 'window_01', x, y, { size: 12, size1: 38, dx: Math.cos(a) * d, dy: Math.sin(a) * d, rot: rnd(-0.6, 0.6), life: 400, tint: i % 2 ? 0xffe066 : 0xff9cc8, ease: 'Back.easeOut', a0: 1, a1: 0.2 });
    }
    gl(f, '📌', x, y - 20, { size: 34, dy: -50, life: 600, s0: 0.5, s1: 1.3 });
  },
  // Mop W: a giant soap bubble wobbles, then pops into droplets.
  bubble(f, { x, y, r, delay }) {
    const b = sp(f, 'circle_01', x, y, { size: r * 0.5, size1: r * 2, life: delay, tint: 0xbfe9ff, add: false, a0: 0.55, a1: 0.7, ease: 'Sine.easeInOut', depth: GROUND + 0.2 });
    const g = sp(f, 'star_04', x - r * 0.35, y - r * 0.35, { size: 20, size1: 60, life: delay, tint: 0xffffff });
    if (b && g) f.scene.tweens.add({ targets: b, scaleY: b.scaleY * 0.92, yoyo: true, repeat: 3, duration: Math.max(60, delay / 8) });
    sp(f, 'circle_02', x, y, { size: r * 2, size1: r * 2.5, life: 320, delay, tint: 0xffffff });
    for (let i = 0; i < N(f, 9); i++) { const a = rnd(0, TAU); sp(f, 'circle_01', x, y, { size: 24, size1: 30, dx: Math.cos(a) * r * rnd(0.6, 1.1), dy: Math.sin(a) * r * rnd(0.6, 1.1) - 20, life: 500, delay, tint: 0xbfe9ff, add: false, a0: 0.7 }); }
  },
  // Volt Q: lightning stabs down around Servo.
  tesla(f, { x, y, r, delay }) {
    sp(f, 'light_01', x, y, { size: r * 1.2, size1: r * 2.2, life: delay + 200, tint: 0x00e5ff, a0: 0.5, depth: GROUND });
    for (let i = 0; i < N(f, 4); i++) {
      const [bx, by] = inDisc(x, y, r * 0.8);
      sp(f, i % 2 ? 'spark_05' : 'spark_06', bx, by - 110, { size: 240, life: 220, delay: delay + 60 * i, tint: i % 2 ? 0x7ffcff : 0xffffff });
      sp(f, 'spark_01', bx, by, { size: 50, size1: 120, life: 260, delay: delay + 60 * i, tint: 0x00e5ff });
    }
    sp(f, 'spark_07', x, y, { size: r * 2.2, life: 260, delay, tint: 0x7ffcff, sy: 1.4 });
  },
  // Volt R: concentric square EMP pulses roll out from Servo.
  emp(f, { x, y, r, delay }) {
    for (let i = 0; i < 3; i++) sp(f, 'window_04', x, y, { size: r * 0.3, size1: r * 2.3, spin: 0.8, life: 420, delay: delay + i * 110, tint: i % 2 ? 0xffffff : 0x00ffff, a0: 0.95 });
    for (let i = 0; i < N(f, 5); i++) { const [bx, by] = inDisc(x, y, r * 0.9); sp(f, 'spark_02', bx, by, { size: 90, life: 300, delay: delay + 40 * i, tint: 0x7ffcff }); }
    sp(f, 'light_02', x, y, { size: r * 0.4, size1: r * 2.4, life: 480, delay, tint: 0x00ffff });
  },
  // Hira R: the all-hands shout rolls out in sound-wave arcs and silences.
  allHands(f, { x, y, r, delay }) {
    sp(f, 'magic_01', x, y, { size: r * 2, spin: 0.7, life: delay + 200, tint: 0xff6b6b, a0: 0.8, depth: GROUND });
    gl(f, '📣', x, y - 30, { size: 46, life: delay + 400, s0: 0.6, s1: 1.4, dy: -30 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      sp(f, 'slash_04', x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3, { size: r * 0.6, size1: r * 1.1, rot: a + Math.PI / 2, dx: Math.cos(a) * r * 0.7, dy: Math.sin(a) * r * 0.7, life: 480, delay: delay + 40, tint: i % 2 ? 0xff6b6b : 0xffd8a8 });
    }
    gl(f, '🔇', x, y, { size: 40, life: 900, delay: delay + 120, dy: -70, s0: 0.6, s1: 1.3 });
  },
  // Lint W: a STOP stamp slams onto the area.
  stopSign(f, { x, y, r, delay }) {
    sp(f, 'circle_01', x, y, { size: r * 2, a0: 0.45, life: delay + 200, tint: 0xd63031, depth: GROUND });
    gl(f, '🛑', x, y - 40, { size: 40, life: Math.max(160, delay), s0: 3.2, s1: 2.1, ease: 'Back.easeIn', a0: 0.4, a1: 1 });
    sp(f, 'circle_03', x, y, { size: r * 1.2, size1: r * 2.1, life: 380, delay, tint: 0xd63031 });
    sp(f, 'dirt_02', x, y, { size: r * 0.8, size1: r * 1.9, life: 420, delay, tint: 0xb5b5b5, add: false, a0: 0.7 });
    sp(f, 'scratch_01', x, y, { size: r * 1.4, life: 260, delay, tint: 0xff6b6b });
  },
  // Lint R: a terminal flashes, then a hard reset wipes the area.
  hardReset(f, { x, y, r, delay }) {
    sp(f, 'window_03', x, y, { size: r * 1.6, a0: 0.45, life: delay + 120, tint: 0x55ff7a, depth: GROUND });
    gl(f, '> git reset --hard', x, y - r * 0.5, { size: 17, color: '#7dff9a', life: delay + 220, dy: -10, a0: 0.9, a1: 0.9 });
    sp(f, 'star_09', x, y, { size: r * 0.6, size1: r * 2.4, life: 380, delay, tint: 0xffffff });
    for (let i = 0; i < N(f, 6); i++) { const [bx, by] = inDisc(x, y, r * 0.8); sp(f, 'spark_01', bx, by, { size: 80, life: 280, delay: delay + 30 * i, tint: 0xe17055 }); }
    sp(f, 'scorch_01', x, y, { size: r * 1.4, life: 1100, delay, tint: 0x241c18, add: false, a0: 0.55, depth: GROUND });
    gl(f, 'HEAD is now at 0000000', x, y + r * 0.45, { size: 15, color: '#ffffff', life: 700, delay: delay + 100, dy: -20 });
  },
  // Brew E: decaf puts everyone to sleep.
  sleepZ(f, { x, y, r, delay }) {
    sp(f, 'circle_01', x, y, { size: r * 2, a0: 0.4, life: delay + 400, tint: 0x9b7bd4, depth: GROUND });
    for (let i = 0; i < N(f, 6); i++) {
      const [bx, by] = inDisc(x, y, r * 0.7);
      gl(f, i % 2 ? 'z' : 'Z', bx, by, { size: 20 + (i % 3) * 10, color: '#e3d4ff', dy: -80, dx: 20, life: 800, delay: delay + 90 * i, spin: 0.4, s0: 0.5 });
      sp(f, 'smoke_07', bx, by, { size: 30, size1: 90, life: 600, delay: delay + 90 * i, tint: 0x9b7bd4, a0: 0.45 });
    }
    gl(f, '😴', x, y - 20, { size: 38, life: 800, delay, dy: -50, s0: 0.5, s1: 1.2 });
  },
  // Pager E: a postmortem clock rewinds around you.
  postmortem(f, { x, y, r }) {
    sp(f, 'circle_03', x, y, { size: r * 0.5, size1: r * 2.1, life: 420, tint: 0xffffff });
    sp(f, 'light_01', x, y, { size: r * 1.8, spin: -TAU * 1.5, life: 560, tint: 0x9fc4ff, a0: 0.9 });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; sp(f, 'trace_06', x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85, { size: 36, rot: a, life: 520, tint: 0xffffff, a0: 0.9, sx: 0.5 }); }
    gl(f, '⏪', x, y - 12, { size: 40, life: 650, s0: 0.6, s1: 1.4 });
  },
};

// ───────────────────────── zone: persistent areas (c.ms, tickMs) ─────────────────────────
const ZONE = {
  // Stack E: speed-limit rings grind around you.
  throttle(f, { x, y, r, ms }) {
    sp(f, 'magic_02', x, y, { size: r * 2.1, spin: TAU * (ms / 2500), life: ms, a0: 0.55, a1: 0.2, tint: 0x9cff6a, ease: 'Linear', depth: GROUND });
    sp(f, 'magic_01', x, y, { size: r * 1.4, spin: -TAU * (ms / 3200), life: ms, a0: 0.5, a1: 0.2, tint: 0xffffff, ease: 'Linear', depth: GROUND });
    gl(f, '50', x, y, { size: 30, bold: true, color: '#ffffff', stroke: '#d63031', thick: 6, life: ms, dy: 0, a0: 0.8, a1: 0.2, ease: 'Linear' });
    loop(f, ms, 500, () => { const a = rnd(0, TAU); sp(f, 'trace_07', x + Math.cos(a) * r, y + Math.sin(a) * r, { size: 70, rot: a, dx: -Math.cos(a) * r * 0.9, dy: -Math.sin(a) * r * 0.9, life: 480, tint: 0x9cff6a, ease: 'Quad.easeIn', sx: 0.5 }); });
  },
  // Mop R: a flood, with waves rolling across the water.
  flood(f, { x, y, r, ms }) {
    const w = sp(f, 'circle_05', x, y, { size: r * 2, a0: 0.28, a1: 0.0, life: ms, tint: 0x2aa8ff, add: false, depth: GROUND - 0.1, ease: 'Linear' });
    loop(f, ms, 420, () => {
      sp(f, 'circle_03', x, y, { size: r * 0.6, size1: r * 2.05, life: 900, tint: 0x7fe3ff, a0: 0.8 });
      const [bx, by] = inDisc(x, y, r * 0.85);
      sp(f, 'circle_01', bx, by, { size: 20, size1: 34, dy: -28, life: 700, tint: 0xd8f6ff, add: false, a0: 0.7 });
      sp(f, 'smoke_09', bx, by, { size: 40, size1: 130, life: 800, tint: 0x9fe8ff, a0: 0.35 });
    });
    return w;
  },
  // Hira E: policy documents flutter down.
  policy(f, { x, y, r, ms }) {
    sp(f, 'window_01', x, y, { size: r * 1.7, a0: 0.22, a1: 0.05, life: ms, tint: 0xffd8a8, ease: 'Linear', depth: GROUND });
    loop(f, ms, 260, () => { const [bx, by] = inDisc(x, y, r * 0.85); gl(f, '📄', bx, by - 90, { size: 26, dy: 90, life: 800, spin: rnd(-2, 2), a0: 0.95, ease: 'Sine.easeInOut' }); });
  },
  // Lint E: an icy code freeze with growing crystals.
  freeze(f, { x, y, r, ms }) {
    sp(f, 'light_02', x, y, { size: r * 2.1, a0: 0.6, a1: 0.25, life: ms, tint: 0xbff4ff, ease: 'Linear', depth: GROUND });
    for (let i = 0; i < N(f, 9); i++) {
      const [bx, by] = inDisc(x, y, r * 0.9), h = rnd(70, 140);
      sp(f, 'star_08', bx, by - h * 0.4, { size: h * 0.7, size1: h, rot: rnd(-0.4, 0.4), sx: 0.6, life: ms, a0: 0.9, a1: 0.5, tint: 0xcff8ff, delay: i * 40, ease: 'Back.easeOut' });
    }
    loop(f, ms, 400, () => { const [bx, by] = inDisc(x, y, r * 0.9); sp(f, 'star_06', bx, by - 30, { size: 20, size1: 60, life: 380, tint: 0xffffff }); gl(f, '❄', bx, by, { size: 20, dy: -30, life: 600, a0: 0.8 }); });
  },
  // Brew R: the break room steams and heals.
  breakRoom(f, { x, y, r, ms }) {
    sp(f, 'circle_01', x, y, { size: r * 2, a0: 0.35, a1: 0.12, life: ms, tint: 0xc8864a, depth: GROUND, ease: 'Linear' });
    gl(f, '☕', x, y, { size: 44, life: ms, a0: 0.9, a1: 0.4, ease: 'Linear' });
    loop(f, ms, 220, () => {
      const [bx, by] = inDisc(x, y, r * 0.85);
      sp(f, 'smoke_07', bx, by, { size: 30, size1: 90, dy: -70, life: 900, tint: 0xffffff, add: false, a0: 0.45 });
      if (Math.random() < 0.5) sp(f, 'symbol_01', bx, by, { size: 26, dy: -60, life: 800, tint: 0x7ed957, a0: 0.9 });
    });
  },
  // Mop E trail: a wet floor with slippery foam.
  puddle(f, { x, y, r, ms }) {
    sp(f, 'smoke_09', x, y, { size: r * 2, a0: 0.4, a1: 0.05, life: ms, tint: 0x9fe8ff, ease: 'Linear', depth: GROUND });
    loop(f, ms, 400, () => { const [bx, by] = inDisc(x, y, r * 0.8); sp(f, 'circle_01', bx, by, { size: 16, size1: 36, life: 700, tint: 0xd8f6ff, add: false, a0: 0.7 }); });
    gl(f, '⚠️', x, y, { size: 30, life: ms, a0: 0.8, a1: 0.2, ease: 'Linear' });
  },
};

// ───────────────────────── dash ─────────────────────────
const lineSteps = (x0, y0, x1, y1, n, cb) => { for (let i = 0; i <= n; i++) cb(x0 + (x1 - x0) * (i / n), y0 + (y1 - y0) * (i / n), i / n); };
const DASH = {
  // Mop E: water skid with bubbles.
  skid(f, { x0, y0, x1, y1 }) {
    const a = ang(x0, y0, x1, y1), len = Math.hypot(x1 - x0, y1 - y0);
    sp(f, 'smoke_09', (x0 + x1) / 2, (y0 + y1) / 2, { size: len * 1.1, sy: 0.5, rot: a, life: 600, tint: 0x9fe8ff, a0: 0.6 });
    lineSteps(x0, y0, x1, y1, N(f, 6), (x, y, k) => sp(f, 'circle_01', x + rnd(-14, 14), y + rnd(-14, 14) - 20, { size: 18, size1: 36, dy: -30, life: 600, delay: k * 120, tint: 0xd8f6ff, add: false, a0: 0.7 }));
  },
  // Rush Q: twin tire streaks, exhaust flame and smoke.
  tire(f, { x0, y0, x1, y1 }) {
    const a = ang(x0, y0, x1, y1), len = Math.hypot(x1 - x0, y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2, nx = -Math.sin(a) * 10, ny = Math.cos(a) * 10;
    for (const s of [-1, 1]) sp(f, 'trace_07', mx + nx * s, my + ny * s, { size: len, sx: 0.1, sy: 1, rot: a + Math.PI / 2, life: 700, tint: 0x222222, add: false, a0: 0.7 });
    sp(f, 'muzzle_02', x0, y0 - 20, { size: 90, size1: 40, rot: a + Math.PI / 2, life: 300, tint: 0xff9a3a });
    lineSteps(x0, y0, x1, y1, N(f, 5), (x, y, k) => sp(f, 'smoke_04', x, y - 14, { size: 30, size1: 90, life: 520, delay: k * 90, tint: 0xffffff, add: false, a0: 0.45 }));
  },
  // Zero Q: shadow afterimages and a stab.
  shadowStep(f, { x0, y0, x1, y1 }) {
    const a = ang(x0, y0, x1, y1);
    lineSteps(x0, y0, x1, y1, 3, (x, y, k) => sp(f, 'smoke_07', x, y - 40, { size: 90, size1: 40, life: 420, delay: k * 50, tint: 0x14142a, add: false, a0: 0.8 }));
    sp(f, 'smoke_04', x0, y0 - 40, { size: 60, size1: 160, life: 500, tint: 0x14142a, add: false, a0: 0.7 });
    sp(f, 'slash_02', x1, y1 - 40, { size: 120, rot: a + 0.5, life: 240, tint: 0xd0a0ff });
    sp(f, 'slash_02', x1, y1 - 40, { size: 120, rot: a - 0.6, life: 240, delay: 60, tint: 0xffffff });
    sp(f, 'scratch_01', x1, y1 - 40, { size: 130, rot: a, life: 280, delay: 40, tint: 0xff3b8a });
  },
  // Patch E: a git branch forks off the path.
  branch(f, { x0, y0, x1, y1 }) {
    const a = ang(x0, y0, x1, y1), len = Math.hypot(x1 - x0, y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    for (const o of [-0.22, 0.22]) sp(f, 'trace_06', mx, my, { size: len * 1.05, sx: 0.12, sy: 1, rot: a + Math.PI / 2 + o, life: 520, tint: o > 0 ? 0x39c2ff : 0xff3b8a, a0: 0.95 });
    for (const [x, y, c] of [[x0, y0, 0xffffff], [x1, y1, 0x39c2ff]]) sp(f, 'circle_02', x, y - 20, { size: 20, size1: 90, life: 380, tint: c });
    gl(f, '⎇', mx, my - 36, { size: 32, life: 600, dy: -20, color: '#c9e6ff' });
  },
  // Tester E: a vault with a net.
  vault(f, { x0, y0, x1, y1 }) {
    lineSteps(x0, y0, x1, y1, N(f, 6), (x, y, k) => sp(f, 'circle_05', x, y - 20 - Math.sin(k * Math.PI) * 70, { size: 22, size1: 8, life: 420, delay: k * 140, tint: 0xffb347, a0: 0.8 }));
    sp(f, 'dirt_01', x0, y0, { size: 40, size1: 110, life: 420, tint: 0xc8a165, add: false, a0: 0.8 });
    gl(f, '🕸', x1, y1 - 20, { size: 44, life: 700, s0: 0.4, s1: 1.5, a1: 0.2 });
  },
  // Swipe E: a thumb swipe streak.
  swipeLeft(f, { x0, y0, x1, y1 }) {
    const a = ang(x0, y0, x1, y1), len = Math.hypot(x1 - x0, y1 - y0);
    sp(f, 'slash_04', (x0 + x1) / 2, (y0 + y1) / 2 - 30, { size: len * 1.1, rot: a, life: 360, tint: 0xff4fa3, sy: 0.8 });
    sp(f, 'trace_07', (x0 + x1) / 2, (y0 + y1) / 2 - 30, { size: len, sx: 0.12, rot: a + Math.PI / 2, life: 360, tint: 0xffffff });
    gl(f, '👈', x0, y0 - 50, { size: 34, life: 400, dx: x1 - x0, dy: y1 - y0, a1: 0 });
  },
  // Sprint E: a leap that lands with a stun shockwave.
  leap(f, { x0, y0, x1, y1 }) {
    lineSteps(x0, y0, x1, y1, N(f, 6), (x, y, k) => sp(f, 'star_06', x, y - 30 - Math.sin(k * Math.PI) * 90, { size: 36, size1: 10, life: 380, delay: k * 110, tint: 0xffd23f }));
    sp(f, 'dirt_01', x1, y1, { size: 50, size1: 150, life: 480, delay: 330, tint: 0xc8a165, add: false, a0: 0.8 });
    sp(f, 'circle_03', x1, y1, { size: 40, size1: 190, life: 420, delay: 330, tint: 0xffc94d });
    gl(f, '⭐', x1, y1 - 50, { size: 26, life: 700, delay: 360, dy: -26, spin: 2 });
  },
  // Pager Q: ping rings along the path.
  ping(f, { x0, y0, x1, y1 }) {
    lineSteps(x0, y0, x1, y1, N(f, 5), (x, y, k) => sp(f, 'circle_03', x, y - 10, { size: 20, size1: 110, life: 480, delay: k * 110, tint: 0xff5252 }));
    gl(f, '📶', x0, y0 - 50, { size: 30, life: 500, dy: -20 });
  },
  // Pager R: a lightning rush.
  onMyWay(f, { x0, y0, x1, y1 }) {
    const a = ang(x0, y0, x1, y1), len = Math.hypot(x1 - x0, y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    sp(f, 'spark_07', mx, my - 30, { size: len, rot: a, life: 380, tint: 0xff1744, sy: 1.6 });
    sp(f, 'spark_07', mx, my - 30, { size: len, rot: a, life: 300, tint: 0xffffff, sy: 0.8 });
    sp(f, 'spark_05', x1, y1 - 60, { size: 240, life: 300, tint: 0xffffff });
    sp(f, 'star_09', x1, y1 - 30, { size: 40, size1: 180, life: 340, tint: 0xff1744 });
    sp(f, 'muzzle_04', x0, y0 - 20, { size: 110, rot: a + Math.PI / 2, life: 300, tint: 0xff5252 });
  },
  // Brick E: shoulder-charge with dust and a bump.
  charge(f, { x0, y0, x1, y1 }) {
    const a = ang(x0, y0, x1, y1);
    lineSteps(x0, y0, x1, y1, N(f, 5), (x, y, k) => sp(f, 'dirt_03', x, y, { size: 40, size1: 110, life: 460, delay: k * 70, tint: 0xb5a58a, add: false, a0: 0.7 }));
    sp(f, 'star_08', x1, y1 - 30, { size: 40, size1: 170, life: 300, delay: 120, tint: 0xffffff });
    sp(f, 'slash_03', x1, y1 - 30, { size: 140, rot: a + Math.PI, life: 280, delay: 100, tint: 0x4a7bd0 });
  },
};

// ───────────────────────── blink ─────────────────────────
const BLINK = {
  // Pixel E: pixels dissolve here and reassemble there.
  glitch(f, { x0, y0, x1, y1 }) {
    for (let i = 0; i < N(f, 8); i++) {
      const a = (i / 8) * TAU;
      sp(f, 'window_01', x0, y0 - 40, { size: 26, size1: 8, dx: Math.cos(a) * 70, dy: Math.sin(a) * 70, spin: rnd(-3, 3), life: 380, tint: i % 2 ? 0x39c2ff : 0xff4fa3 });
      sp(f, 'window_01', x1 + Math.cos(a) * 80, y1 - 40 + Math.sin(a) * 80, { size: 8, size1: 28, dx: -Math.cos(a) * 80, dy: -Math.sin(a) * 80, life: 340, delay: 120, tint: i % 2 ? 0x39c2ff : 0xff4fa3, ease: 'Quad.easeIn' });
    }
    sp(f, 'window_03', x1, y1 - 40, { size: 90, life: 260, delay: 220, tint: 0xffffff });
  },
  // Cache E: two data blocks trade places.
  failover(f, { x0, y0, x1, y1 }) {
    for (const [x, y, c] of [[x0, y0, 0x5c7cfa], [x1, y1, 0x91a7ff]]) sp(f, 'window_04', x, y - 40, { size: 40, size1: 120, spin: 1.2, life: 400, tint: c });
    gl(f, '🔀', x1, y1 - 60, { size: 34, life: 600, dy: -20 });
  },
  // Ops E: the swap links both allies with a curved beam.
  swap(f, { x0, y0, x1, y1 }) {
    const a = ang(x0, y0, x1, y1), mx = (x0 + x1) / 2, my = (y0 + y1) / 2, len = Math.hypot(x1 - x0, y1 - y0);
    sp(f, 'twirl_03', mx, my - 40, { size: len, rot: a, life: 460, tint: 0x7ec8ff, sy: 0.7 });
    sp(f, 'twirl_03', mx, my - 40, { size: len, rot: a + Math.PI, life: 460, tint: 0xffffff, sy: 0.7 });
    for (const [x, y] of [[x0, y0], [x1, y1]]) { sp(f, 'star_09', x, y - 40, { size: 40, size1: 150, life: 340, tint: 0x7ec8ff }); sp(f, 'circle_03', x, y - 10, { size: 30, size1: 130, life: 380, tint: 0xffffff }); }
    gl(f, '🔁', mx, my - 70, { size: 34, life: 600, dy: -20 });
  },
};

// ───────────────────────── buff (on the caster) ─────────────────────────
const BUFF = {
  // Stack W: armour plates snap into a hex shield.
  hexDome(f, { x, y }) {
    sp(f, 'light_02', x, y - 40, { size: 40, size1: 190, life: 520, tint: 0xb6ff8a, a0: 0.9 });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; sp(f, 'window_01', x + Math.cos(a) * 120, y - 40 + Math.sin(a) * 120, { size: 30, size1: 22, dx: -Math.cos(a) * 62, dy: -Math.sin(a) * 62, rot: a, life: 400, tint: 0x7ed957, ease: 'Back.easeOut', a1: 0.4 }); }
  },
  // Brick W: a clipboard-shield rises.
  shieldPlate(f, { x, y }) {
    sp(f, 'window_01', x, y - 40, { size: 40, size1: 110, life: 700, tint: 0x9ec5ff, a0: 0.85, dy: -10, ease: 'Back.easeOut' });
    gl(f, '📋', x, y - 40, { size: 42, life: 800, s0: 0.5, s1: 1.2, dy: -16 });
    sp(f, 'circle_03', x, y, { size: 40, size1: 150, life: 420, tint: 0x9ec5ff });
  },
  // Ops W / Hira W-style heal: green crosses float up.
  plusRain(f, { x, y, color }) {
    for (let i = 0; i < N(f, 9); i++) gl(f, '+', x + rnd(-60, 60), y - 10, { size: rnd(22, 36), color: '#8dff7a', dy: -rnd(70, 130), life: 800, delay: i * 55, bold: true });
    sp(f, 'circle_03', x, y, { size: 40, size1: 260, life: 560, tint: color ?? 0x7ed957 });
  },
  // Ops R: a deploy progress bar sweeps the team.
  deploy(f, { x, y }) {
    sp(f, 'circle_03', x, y, { size: 60, size1: 700, life: 700, tint: 0x39c2ff });
    sp(f, 'window_03', x, y - 30, { size: 160, life: 600, tint: 0x7ed957, a0: 0.9, dy: -20 });
    gl(f, '🔄', x, y - 60, { size: 46, life: 900, s0: 0.5, s1: 1.4, spin: TAU });
    for (let i = 0; i < N(f, 6); i++) gl(f, '+', x + rnd(-120, 120), y, { size: 30, color: '#8dff7a', dy: -110, life: 800, delay: i * 70, bold: true });
  },
  // Model W: an hourglass freezes time.
  hourglass(f, { x, y }) {
    sp(f, 'light_01', x, y - 40, { size: 180, spin: -TAU * 0.7, life: 1400, tint: 0x6cffd6, a0: 0.8, ease: 'Linear' });
    sp(f, 'circle_02', x, y - 40, { size: 60, size1: 190, life: 600, tint: 0xffffff });
    gl(f, '⏳', x, y - 120, { size: 48, life: 1500, a0: 1, a1: 0.7, s0: 0.5, s1: 1.2, ease: 'Linear' });
    for (let i = 0; i < N(f, 6); i++) sp(f, 'star_06', x + rnd(-60, 60), y - rnd(0, 90), { size: 12, size1: 40, life: 700, delay: i * 120, tint: 0xb6fff0 });
  },
  // Zero W: dissolve into black smoke.
  smoke(f, { x, y }) {
    for (let i = 0; i < N(f, 7); i++) sp(f, 'smoke_04', x + rnd(-30, 30), y - rnd(10, 70), { size: 50, size1: 150, life: 700, delay: i * 40, tint: 0x14142a, add: false, a0: 0.8, dy: -20 });
    sp(f, 'smoke_10', x, y - 30, { size: 60, size1: 220, life: 700, tint: 0x6a4fd0, a0: 0.5 });
  },
  // Swipe W: the screen goes dark.
  darkMode(f, { x, y }) {
    sp(f, 'circle_05', x, y - 30, { size: 80, size1: 320, life: 800, tint: 0x000000, add: false, a0: 0.65, a1: 0 });
    gl(f, '🌙', x, y - 100, { size: 44, life: 900, s0: 0.5, s1: 1.2, dy: -20 });
    sp(f, 'star_04', x + 24, y - 100, { size: 20, size1: 70, life: 700, tint: 0xb6a8ff });
  },
  // Volt W: sparks orbit as the pet overclocks.
  overclock(f, { x, y }) {
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; sp(f, 'spark_02', x + Math.cos(a) * 60, y - 40 + Math.sin(a) * 60, { size: 80, life: 420, delay: i * 70, tint: 0xff9800, spin: 1 }); }
    sp(f, 'twirl_01', x, y - 40, { size: 150, spin: TAU * 2, life: 700, tint: 0xff9800 });
    gl(f, '🔥', x, y - 100, { size: 38, life: 700, s0: 0.5, s1: 1.3, dy: -20 });
  },
  // Patch W: a pair-programming partner appears beside you.
  pair(f, { x, y }) {
    for (const s of [-1, 1]) { sp(f, 'light_02', x + s * 54, y - 40, { size: 40, size1: 120, life: 600, tint: 0x39c2ff, a0: 0.8 }); gl(f, '💻', x + s * 54, y - 80, { size: 30, life: 700, dy: -14 }); }
    sp(f, 'circle_03', x, y, { size: 40, size1: 170, life: 420, tint: 0x39c2ff });
  },
  // Sprint W: a burndown chart slides down.
  burndown(f, { x, y }) {
    gl(f, '📉', x, y - 110, { size: 46, life: 900, s0: 0.5, s1: 1.2, dy: 14 });
    for (let i = 0; i < 4; i++) sp(f, 'window_03', x, y - 90 + i * 16, { size: 80 - i * 14, life: 600, delay: i * 90, tint: 0xffe066, a0: 0.8 });
    sp(f, 'circle_03', x, y, { size: 40, size1: 160, life: 420, tint: 0xffe066 });
  },
  // Sprint R: a rally flag and speed lines.
  rally(f, { x, y }) {
    gl(f, '🚩', x, y - 120, { size: 52, life: 1100, s0: 0.4, s1: 1.4, dy: -18 });
    for (let i = 0; i < N(f, 8); i++) sp(f, 'trace_07', x - 140 + rnd(-20, 20), y - 70 + i * 16, { size: 120, sx: 0.12, rot: Math.PI / 2, dx: 280, life: 520, delay: i * 40, tint: 0xffb300 });
    sp(f, 'circle_03', x, y, { size: 60, size1: 720, life: 800, tint: 0xff9800 });
  },
  // Hira W: team building confetti.
  cheer(f, { x, y }) {
    for (let i = 0; i < N(f, 10); i++) gl(f, ['🎉', '🎈', '✨', '🤝'][i % 4], x + rnd(-70, 70), y - 20, { size: rnd(20, 30), dy: -rnd(80, 150), dx: rnd(-30, 30), life: 900, delay: i * 50, spin: rnd(-1, 1) });
    sp(f, 'circle_03', x, y, { size: 40, size1: 280, life: 560, tint: 0x7ed957 });
    sp(f, 'symbol_01', x, y - 60, { size: 30, size1: 70, dy: -50, life: 800, tint: 0xf7a072 });
  },
  // Brew W: a double espresso with steam.
  espresso(f, { x, y }) {
    gl(f, '☕', x, y - 100, { size: 44, life: 900, s0: 0.5, s1: 1.3, dy: -16 });
    for (let i = 0; i < N(f, 5); i++) sp(f, 'smoke_07', x + rnd(-40, 40), y - 20, { size: 30, size1: 90, dy: -90, life: 800, delay: i * 80, tint: 0xffffff, add: false, a0: 0.5 });
    sp(f, 'muzzle_02', x, y - 20, { size: 120, life: 400, tint: 0xffb347 });
    sp(f, 'circle_03', x, y, { size: 40, size1: 240, life: 500, tint: 0xffb347 });
  },
  // Rush W: hot noodles steam and speed twirls.
  noodles(f, { x, y }) {
    gl(f, '🍜', x, y - 100, { size: 42, life: 900, s0: 0.5, s1: 1.3, dy: -14 });
    for (let i = 0; i < N(f, 4); i++) sp(f, 'smoke_07', x + rnd(-24, 24), y - 40, { size: 24, size1: 80, dy: -80, life: 800, delay: i * 90, tint: 0xffffff, add: false, a0: 0.5 });
    sp(f, 'twirl_02', x, y - 30, { size: 160, spin: TAU * 1.5, life: 600, tint: 0xff9a3a });
  },
};

// ───────────────────────── tgt: point-and-click casts (x0,y0 caster → x1,y1 target) ─────────────────────────
const TGT = {
  // Pixel W: pixel orbs fly to the target.
  pixelOrb(f, { x0, y0, x1, y1 }) {
    for (let i = 0; i < 3; i++) sp(f, 'star_08', x0, y0 - 40, { size: 44, size1: 30, dx: x1 - x0, dy: y1 - y0, life: 260, delay: i * 70, tint: i % 2 ? 0x7ec8ff : 0xff4fa3, ease: 'Quad.easeIn' });
    sp(f, 'window_01', x1, y1 - 40, { size: 14, size1: 70, spin: 1.5, life: 320, delay: 260, tint: 0x7ec8ff });
  },
  // Lint Q: a red pen strikes the target.
  nitpick(f, { x1, y1 }) {
    sp(f, 'scratch_01', x1, y1 - 40, { size: 130, rot: 0.6, life: 380, tint: 0xff4d4d });
    sp(f, 'trace_06', x1, y1 - 10, { size: 110, sx: 0.2, rot: Math.PI / 2, life: 520, delay: 80, tint: 0xff7675 });
    gl(f, '✏️', x1 + 30, y1 - 70, { size: 34, life: 600, dx: -50, dy: 24, spin: -0.6 });
    gl(f, '?!', x1, y1 - 100, { size: 24, color: '#ff7675', life: 700, dy: -24, bold: true });
  },
  // Zero R: a crosshair locks on, then an X slash.
  execute(f, { x1, y1 }) {
    sp(f, 'magic_03', x1, y1 - 40, { size: 260, size1: 80, spin: 1, life: 320, tint: 0xff3b8a, ease: 'Quad.easeIn' });
    sp(f, 'slash_02', x1, y1 - 40, { size: 150, rot: 0.8, life: 260, delay: 300, tint: 0xffffff });
    sp(f, 'slash_02', x1, y1 - 40, { size: 150, rot: -0.8, life: 260, delay: 340, tint: 0xff3b8a });
    sp(f, 'star_09', x1, y1 - 40, { size: 30, size1: 190, life: 320, delay: 320, tint: 0xff3b8a });
  },
  // Patch R: two conflicting changes slam together.
  mergeLock(f, { x1, y1 }) {
    for (const s of [-1, 1]) sp(f, 'spark_05', x1 + s * 130, y1 - 50, { size: 200, dx: -s * 130, life: 260, tint: s > 0 ? 0x39c2ff : 0xff3b8a, rot: s * 0.3, ease: 'Quad.easeIn' });
    sp(f, 'window_04', x1, y1 - 40, { size: 30, size1: 190, spin: 1.2, life: 420, delay: 240, tint: 0xffffff });
    gl(f, '<<<<<<< HEAD', x1, y1 - 110, { size: 15, color: '#ff7675', life: 800, delay: 200, dy: -16 });
    gl(f, '>>>>>>> fix', x1, y1 - 90, { size: 15, color: '#7ec8ff', life: 800, delay: 240, dy: -16 });
    gl(f, '⚔️', x1, y1 - 50, { size: 44, life: 800, delay: 240, s0: 0.5, s1: 1.4 });
  },
};

// ───────────────────────── projectiles ─────────────────────────
// head: sprite; w/h: display size in multiples of the skill width; spin: rad/s; orient: rotate to travel;
// deco(f, s, dt): per-frame decoration (s = shot: x,y,ux,uy,color,width,sid).
const puff = (f, s, tex, tint, o = {}) => f.part(s.x + rnd(-8, 8), s.y + rnd(-8, 8), { tex: K(tex), tint, add: o.add ?? true, s0: o.s0 ?? 26, s1: o.s1 ?? 70, a0: o.a0 ?? 0.6, life: o.life ?? 0.4, vy: o.vy ?? 0, vx: o.vx ?? 0, vr: o.vr ?? 0 });
const every = (s, key, dt, gap) => { s[key] = (s[key] || 0) + dt; if (s[key] < gap) return false; s[key] = 0; return true; };
export const PROJ = {
  // Pixel Q: a spinning prism shedding colour.
  prism: { head: 'star_08', core: 'magic_05', w: 2, h: 2, spin: 9, deco: (f, s, dt) => { if (every(s, '_d', dt, 0.03)) puff(f, s, 'star_04', [0x39c2ff, 0xff4fa3, 0xffd23f, 0xb084ff][Math.floor(Math.random() * 4)], { s0: 30, s1: 6, life: 0.35 }); } },
  // Brick Q: a broad crescent shockwave.
  crescent: { head: 'slash_03', core: 'slash_03', w: 2.2, h: 2.6, orient: true, deco: (f, s, dt) => { if (every(s, '_d', dt, 0.04)) puff(f, s, 'dirt_01', 0xffffff, { add: false, s0: 30, s1: 80, a0: 0.4, life: 0.4 }); } },
  // Tester Q: a thin sniper tracer.
  sniper: { head: 'trace_07', core: 'flare_01', w: 0.35, h: 3.2, orient: true, trailTex: 'trace_07' },
  // Tester R / Cache R: a rail beam.
  rail: { head: 'spark_07', core: 'star_09', w: 3, h: 1.5, orient: true, deco: (f, s, dt) => { if (every(s, '_d', dt, 0.02)) puff(f, s, 'star_06', 0xffffff, { s0: 40, s1: 6, life: 0.3 }); } },
  // Cache Q: stacked data blocks.
  batch: { head: 'window_01', core: 'window_04', w: 0.9, h: 0.9, spin: 6, deco: (f, s, dt) => { if (every(s, '_d', dt, 0.05)) puff(f, s, 'window_01', s.color, { s0: 24, s1: 6, life: 0.3, vr: 4 }); } },
  // Cache W: dripping stale data.
  stale: { head: 'smoke_03', core: 'circle_05', w: 1.4, h: 1.4, spin: 2, deco: (f, s, dt) => { if (every(s, '_d', dt, 0.05)) puff(f, s, 'circle_05', 0x6a7a55, { add: false, s0: 18, s1: 6, a0: 0.8, life: 0.5, vy: 70 }); } },
  // Brew Q: scalding coffee with steam.
  coffee: { head: 'circle_05', core: 'smoke_07', w: 1.1, h: 1.1, deco: (f, s, dt) => { if (every(s, '_d', dt, 0.04)) puff(f, s, 'smoke_07', 0xffffff, { add: false, s0: 20, s1: 60, a0: 0.45, life: 0.5, vy: -30 }); } },
  // Pager W: radio waves.
  pageWave: { head: 'slash_04', core: 'circle_03', w: 2.4, h: 2.4, orient: true, deco: (f, s, dt) => { if (every(s, '_d', dt, 0.07)) f.part(s.x - s.ux * 30, s.y - s.uy * 30, { tex: K('slash_03'), tint: 0xffb347, add: true, rot: Math.atan2(s.uy, s.ux), s0: s.width * 1.8, s1: s.width * 2.6, a0: 0.7, life: 0.35 }); } },
  // Mop Q: brooms kick up dust and a crescent.
  broomSweep: { keepTex: true, deco: (f, s, dt) => { if (every(s, '_d', dt, 0.05)) { puff(f, s, 'dirt_01', 0xc8a165, { add: false, s0: 24, s1: 70, a0: 0.5, life: 0.4 }); puff(f, s, 'slash_01', 0xffffff, { s0: 50, s1: 30, a0: 0.5, life: 0.2 }); } } },
  // Stack Q / Hira Q: a hook trailing a chain (drawn back to the caster).
  hook: { head: 'star_06', core: 'star_09', w: 1.4, h: 1.4, spin: 5, deco: (f, s) => chain(f, s, 0xcfd8dc) },
  // Cache R: a table scan sweeps rows of data.
  tableScan: { head: 'window_03', core: 'star_09', w: 2.2, h: 1.6, orient: true, deco: (f, s, dt) => { if (every(s, '_d', dt, 0.03)) puff(f, s, 'window_01', s.color, { s0: 30, s1: 8, life: 0.3, vr: 3 }); } },
  invite: { head: 'window_01', core: 'star_09', w: 1.1, h: 1.1, spin: 3, deco: (f, s) => chain(f, s, 0xffd8a8) },
};
function chain(f, s, color) {
  if (!s.gfx) s.gfx = f.scene.add.graphics().setDepth(D.fx - 0.1);
  const o = f.posOf(s.sid), g = s.gfx;
  g.clear();
  if (!o) return;
  const x0 = o.x, y0 = o.y - 36, dx = s.x - x0, dy = s.y - y0, len = Math.hypot(dx, dy), n = Math.max(2, Math.floor(len / 22));
  g.lineStyle(3, color, 0.9);
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(s.x, s.y); g.strokePath();
  g.fillStyle(0xffffff, 0.9);
  for (let i = 1; i < n; i++) g.fillCircle(x0 + (dx * i) / n, y0 + (dy * i) / n, 4);
}

// ───────────────────────── flipbook layers (animated element art drawn on top of the sprite effects above) ─────────────────────────
const G = D.ground + 0.5;
const FBX = {
  circle: {
    scan:    (f, { x, y, r, delay }) => { fb(f, 'ringGreen', x, y, { size: r * 2.3, life: delay + 700, depth: G }); fb(f, 'ringDots', x, y, { size: r * 2, life: delay + 500, tint: 0x7dff9a, delay: delay * 0.3 }); },
    rune:    (f, { x, y, r, delay }) => { fb(f, 'pentagram', x, y, { size: r * 2.4, life: delay + 600, add: false, depth: G }); fb(f, 'chaosSpike', x, y, { size: r * 1.8, life: 600, delay }); },
    vortex:  (f, { x, y, r, delay }) => { fb(f, 'blackHole', x, y, { size: r * 2.5, life: delay + 800, tint: 0xb6ff8a, depth: G }); fb(f, 'burstGreen', x, y, { size: r * 2, life: 700, delay }); },
    singularity: (f, { x, y, r, delay }) => { fb(f, 'blackHole', x, y, { size: r * 2.8, life: delay + 1000, depth: G }); fb(f, 'chaosCloud', x, y, { size: r * 2.2, life: 900, delay }); },
    dataSphere: (f, { x, y, r, delay }) => { fb(f, 'ringBlue', x, y, { size: r * 2.3, life: delay + 500, depth: G }); fb(f, 'waterDots', x, y, { size: r * 2, life: 700, delay, tint: 0x6cffd6 }); },
    roots:   (f, { x, y, r, delay }) => { fb(f, 'impactLeaf', x, y, { size: r * 2.3, life: 800, delay }); fb(f, 'burstGreen', x, y, { size: r * 1.7, life: 700, delay }); },
    lockdown: (f, { x, y, r, delay }) => { fb(f, 'ringGold', x, y, { size: r * 2.4, life: 800, delay, depth: G }); fb(f, 'impactAir', x, y, { size: r * 2.2, life: 600, delay }); },
    parcelDrop: (f, { x, y, r, delay }) => { fb(f, 'smoke', x, y, { size: r * 2.2, life: 900, delay, tint: 0xd8c09a, add: false, a0: 0.8 }); fb(f, 'impactAir', x, y, { size: r * 2, life: 500, delay }); },
    priceTag: (f, { x, y, r, delay }) => { fb(f, 'sparkGold', x, y, { size: r * 2.3, life: 700, delay: delay + 100 }); fb(f, 'ringGold', x, y, { size: r * 2, life: 800, delay: delay + 100, depth: G }); },
    bladeSpin: (f, { x, y, r }) => { fb(f, 'bloodSlash', x, y, { size: r * 2.4, life: 500, tint: 0xb084ff }); fb(f, 'impactAir', x, y, { size: r * 2.2, life: 450, tint: 0x8a6cff }); },
    keyboardSpin: (f, { x, y, r, color }) => { fb(f, 'impactAir', x, y, { size: r * 2.4, life: 450, tint: color }); },
    standup: (f, { x, y, r }) => { fb(f, 'ringGold', x, y, { size: r * 2.3, life: 600, depth: G }); },
    bubble:  (f, { x, y, r, delay }) => { fb(f, 'impactWater', x, y, { size: r * 2.4, life: 700, delay }); },
    tesla:   (f, { x, y, r, delay }) => { fb(f, 'burstBlue', x, y, { size: r * 2.4, life: 700, delay }); },
    emp:     (f, { x, y, r, delay }) => { fb(f, 'ringBlue', x, y, { size: r * 2.5, life: 800, delay, depth: G }); fb(f, 'burstBlue', x, y, { size: r * 1.9, life: 700, delay: delay + 100 }); },
    allHands: (f, { x, y, r, delay }) => { fb(f, 'ringWhite', x, y, { size: r * 2.5, life: 900, delay, depth: G }); fb(f, 'impactAir', x, y, { size: r * 2.1, life: 600, delay }); },
    stopSign: (f, { x, y, r, delay }) => { fb(f, 'splatter', x, y, { size: r * 2.1, life: 700, delay, tint: 0xff5050 }); fb(f, 'ringOrange', x, y, { size: r * 2.2, life: 700, delay, tint: 0xff4040, depth: G }); },
    hardReset: (f, { x, y, r, delay }) => { fb(f, 'burstFire', x, y, { size: r * 2.7, life: 900, delay }); fb(f, 'smoke', x, y, { size: r * 2.2, life: 1000, delay: delay + 150, tint: 0x555555, add: false, a0: 0.7 }); },
    sleepZ:  (f, { x, y, r, delay }) => { fb(f, 'smoke', x, y, { size: r * 2.1, life: 1000, delay, tint: 0x9b7bd4, a0: 0.7 }); fb(f, 'ringPurple', x, y, { size: r * 2.2, life: 800, delay, depth: G }); },
    postmortem: (f, { x, y, r }) => { fb(f, 'ringDots', x, y, { size: r * 2.3, life: 650, depth: G }); fb(f, 'ringWhite', x, y, { size: r * 2.1, life: 800, tint: 0x9fc4ff, depth: G }); },
  },
  zone: {
    throttle: (f, { x, y, r, ms }) => { fb(f, 'ringGreen', x, y, { size: r * 2.3, life: ms, a0: 0.55, depth: G }); },
    flood:   (f, { x, y, r, ms }) => { fb(f, 'ringBlue', x, y, { size: r * 2.3, life: ms, a0: 0.7, depth: G }); fb(f, 'waterDots', x, y, { size: r * 2.1, life: ms, a0: 0.7 }); },
    policy:  (f, { x, y, r, ms }) => { fb(f, 'airCloud', x, y, { size: r * 2.1, life: ms, a0: 0.4, tint: 0xffd8a8 }); },
    freeze:  (f, { x, y, r, ms }) => { fb(f, 'ringWhite', x, y, { size: r * 2.3, life: ms, a0: 0.7, tint: 0x8fe4ff, depth: G }); loop(f, ms, 450, () => { const [bx, by] = inDisc(x, y, r * 0.85); fb(f, 'iceBolt', bx, by - 50, { size: 190, life: 700, tint: 0xbff4ff }); }); },
    breakRoom: (f, { x, y, r, ms }) => { fb(f, 'smoke', x, y, { size: r * 2.1, life: ms, a0: 0.45, tint: 0xffffff }); fb(f, 'ringOrange', x, y, { size: r * 2.2, life: ms, a0: 0.5, depth: G }); },
    puddle:  (f, { x, y, r, ms }) => { fb(f, 'waterDots', x, y, { size: r * 2.1, life: ms, a0: 0.6 }); },
  },
  dash: {
    skid:    (f, { x1, y1 }) => { fb(f, 'impactWater', x1, y1, { size: 170, life: 600 }); },
    tire:    (f, { x0, y0 }) => { fb(f, 'smoke', x0, y0, { size: 170, life: 800, add: false, a0: 0.6 }); },
    shadowStep: (f, { x0, y0, x1, y1 }) => { fb(f, 'smoke', x0, y0 - 30, { size: 180, life: 800, tint: 0x14142a, add: false, a0: 0.85 }); fb(f, 'bloodSlash', x1, y1 - 40, { size: 170, life: 450, tint: 0xb084ff }); },
    branch:  (f, { x1, y1 }) => { fb(f, 'sparkGold', x1, y1 - 20, { size: 170, life: 500, tint: 0x6fc8ff }); },
    vault:   (f, { x0, y0 }) => { fb(f, 'smoke', x0, y0, { size: 150, life: 700, add: false, a0: 0.6, tint: 0xd8c09a }); },
    swipeLeft: (f, { x1, y1 }) => { fb(f, 'impactAir', x1, y1 - 20, { size: 150, life: 500, tint: 0xff7fc0 }); },
    leap:    (f, { x1, y1 }) => { fb(f, 'burstOrange', x1, y1, { size: 230, life: 650, delay: 300 }); fb(f, 'impactLeaf', x1, y1, { size: 180, life: 600, delay: 300, tint: 0xffe08a }); },
    ping:    (f, { x1, y1 }) => { fb(f, 'ringWhite', x1, y1, { size: 190, life: 700, tint: 0xff7a7a }); },
    onMyWay: (f, { x1, y1 }) => { fb(f, 'burstFire', x1, y1 - 20, { size: 250, life: 700, tint: 0xff5577 }); },
    charge:  (f, { x1, y1 }) => { fb(f, 'impactAir', x1, y1 - 20, { size: 190, life: 500, tint: 0x9ec5ff }); fb(f, 'smoke', x1, y1, { size: 160, life: 700, add: false, a0: 0.55 }); },
  },
  blink: {
    glitch:  (f, { x0, y0, x1, y1 }) => { fb(f, 'burstBlue', x0, y0 - 30, { size: 150, life: 500, tint: 0xff7fd0 }); fb(f, 'burstBlue', x1, y1 - 30, { size: 180, life: 550, delay: 120 }); },
    failover: (f, { x0, y0, x1, y1 }) => { fb(f, 'ringBlue', x0, y0 - 30, { size: 170, life: 600 }); fb(f, 'ringBlue', x1, y1 - 30, { size: 190, life: 600, delay: 100 }); },
    swap:    (f, { x0, y0, x1, y1 }) => { fb(f, 'ringWhite', x0, y0 - 30, { size: 200, life: 700, tint: 0x7ec8ff }); fb(f, 'ringWhite', x1, y1 - 30, { size: 200, life: 700, tint: 0x7ec8ff }); fb(f, 'sparkGold', x1, y1 - 30, { size: 170, life: 500 }); },
  },
  buff: {
    hexDome:  (f, { x, y }) => { fb(f, 'ringGreen', x, y - 40, { size: 270, life: 800 }); },
    shieldPlate: (f, { x, y }) => { fb(f, 'ringBlue', x, y - 40, { size: 250, life: 800 }); },
    plusRain: (f, { x, y }) => { fb(f, 'ringGreen', x, y - 20, { size: 360, life: 900 }); fb(f, 'impactLeaf', x, y - 40, { size: 220, life: 800, tint: 0xbaffb0 }); },
    deploy:   (f, { x, y }) => { fb(f, 'ringBlue', x, y - 20, { size: 720, life: 1000 }); fb(f, 'burstWhite', x, y - 40, { size: 380, life: 800 }); },
    hourglass: (f, { x, y }) => { fb(f, 'ringWhite', x, y - 40, { size: 270, life: 1500, tint: 0x9affea }); fb(f, 'divineCloud', x, y - 40, { size: 310, life: 1500, a0: 0.6 }); },
    smoke:    (f, { x, y }) => { fb(f, 'smoke', x, y - 40, { size: 240, life: 900, tint: 0x14142a, add: false, a0: 0.9 }); },
    darkMode: (f, { x, y }) => { fb(f, 'blackHole', x, y - 40, { size: 320, life: 1000, a0: 0.7 }); },
    overclock: (f, { x, y }) => { fb(f, 'burstOrange', x, y - 40, { size: 250, life: 700 }); },
    pair:     (f, { x, y }) => { fb(f, 'ringBlue', x, y - 40, { size: 260, life: 800 }); },
    burndown: (f, { x, y }) => { fb(f, 'ringOrange', x, y - 40, { size: 270, life: 800, tint: 0xffe066 }); },
    rally:    (f, { x, y }) => { fb(f, 'ringGold', x, y - 20, { size: 740, life: 1000 }); fb(f, 'burstOrange', x, y - 40, { size: 320, life: 800 }); },
    cheer:    (f, { x, y }) => { fb(f, 'sparkGold', x, y - 40, { size: 320, life: 800 }); fb(f, 'ringGreen', x, y - 20, { size: 300, life: 800 }); },
    espresso: (f, { x, y }) => { fb(f, 'burstOrange', x, y - 40, { size: 210, life: 700 }); fb(f, 'ringOrange', x, y - 20, { size: 270, life: 800 }); },
    noodles:  (f, { x, y }) => { fb(f, 'smoke', x, y - 40, { size: 170, life: 900, add: false, a0: 0.55 }); fb(f, 'ringOrange', x, y - 20, { size: 250, life: 700 }); },
  },
  tgt: {
    pixelOrb: (f, { x1, y1 }) => { fb(f, 'burstBlue', x1, y1 - 40, { size: 180, life: 550, delay: 250 }); },
    nitpick:  (f, { x1, y1 }) => { fb(f, 'burstBlood', x1, y1 - 40, { size: 170, life: 600, tint: 0xff6060 }); },
    execute:  (f, { x1, y1 }) => { fb(f, 'crosshair', x1, y1 - 40, { size: 250, life: 750 }); fb(f, 'bloodSlash', x1, y1 - 40, { size: 210, life: 500, delay: 320 }); },
    mergeLock: (f, { x1, y1 }) => { fb(f, 'burstWhite', x1, y1 - 40, { size: 210, life: 600, delay: 240 }); },
  },
};

// ───────────────────────── proj: the cast flash at the muzzle (x,y = origin, dx,dy = direction) ─────────────────────────
const MUZZLE = {
  prism:     (f, { x, y, color }) => { fb(f, 'sparkGold', x, y - 40, { size: 150, life: 450, tint: color }); },
  crescent:  (f, { x, y, dx, dy }) => { fb(f, 'impactAir', x + dx * 40, y + dy * 40 - 30, { size: 170, life: 450, tint: 0x9ec5ff }); },
  sniper:    (f, { x, y, dx, dy }) => { sp(f, 'muzzle_01', x + dx * 30, y + dy * 30 - 40, { size: 110, rot: Math.atan2(dy, dx) + Math.PI / 2, life: 200, tint: 0xffb347 }); },
  rail:      (f, { x, y, dx, dy, color }) => { fb(f, 'burstWhite', x + dx * 30, y + dy * 30 - 40, { size: 190, life: 500, tint: color }); },
  batch:     (f, { x, y }) => { fb(f, 'ringBlue', x, y - 40, { size: 160, life: 450 }); },
  stale:     (f, { x, y }) => { fb(f, 'smoke', x, y - 40, { size: 150, life: 600, tint: 0x8a9a6a, add: false, a0: 0.6 }); },
  coffee:    (f, { x, y }) => { fb(f, 'smoke', x, y - 40, { size: 150, life: 600, add: false, a0: 0.5, tint: 0xc8864a }); },
  pageWave:  (f, { x, y }) => { fb(f, 'ringOrange', x, y - 40, { size: 180, life: 500 }); },
  broomSweep: (f, { x, y, dx, dy }) => { fb(f, 'impactAir', x + dx * 50, y + dy * 50 - 20, { size: 190, life: 450, tint: 0xe3c88e }); },
  hook:      (f, { x, y, dx, dy }) => { fb(f, 'impactAir', x + dx * 30, y + dy * 30 - 40, { size: 150, life: 400, tint: 0xcfd8dc }); },
  invite:    (f, { x, y }) => { fb(f, 'sparkGold', x, y - 40, { size: 150, life: 450, tint: 0xffb088 }); },
  tableScan: (f, { x, y }) => { fb(f, 'ringBlue', x, y - 40, { size: 190, life: 550 }); },
};

// ───────────────────────── dispatch ─────────────────────────
const TABLES = { circle: CIRCLE, zone: ZONE, dash: DASH, blink: BLINK, buff: BUFF, tgt: TGT, proj: MUZZLE };
/** Play the styled effect; false when this style has none for `kind` (caller draws the generic one). */
export function castFx(f, kind, style, c) {
  const fn = TABLES[kind]?.[style];
  if (!fn) return false;
  const px = c.x ?? c.x1 ?? c.x0, py = c.y ?? c.y1 ?? c.y0;
  if (!f.onScreen(px, py, (c.r || 200) + 260) && !(c.x0 != null && f.onScreen(c.x0, c.y0, 300))) return true;
  const cc = { delay: 0, r: 120, ms: 1000, color: 0xffffff, ...c };
  fn(f, cc);
  if (!f.low) FBX[kind]?.[style]?.(f, cc); // flipbook layers are the heavy part: skipped on Low effects
  return true;
}
export const hasStyle = (kind, style) => !!TABLES[kind]?.[style];
/** Style key of a skill spec for one kind (`fx` is a string, or { dash, zone, ... } for multi-part skills). */
export const styleFor = (sk, kind) => (!sk || !sk.fx ? null : typeof sk.fx === 'string' ? sk.fx : sk.fx[kind] || null);

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
import { D, clamp, shakeCam } from './mobaGfx.js';

const TAU = Math.PI * 2;
const ECHO = { on: false }; // set by castFx while an `echo:true` fx plays
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

/** Kenney Game Icons (CC0, white, tintable) used as glyph art: assets/moba/ico/<name>.png → texture `ico-<name>`. */
export const ICON_NAMES = ['stop', 'audioOff', 'warning', 'star', 'right', 'rewind', 'locked', 'unlocked', 'export', 'menuList', 'return',
  'share2', 'multiplayer', 'leaderboardsSimple', 'contrast', 'fastForward', 'wrench', 'tablet', 'target', 'left', 'signal3', 'siganl1', 'plus'];
export function loadIcons(scene) {
  for (const n of ICON_NAMES) if (!scene.textures.exists(`ico-${n}`)) scene.load.image(`ico-${n}`, `assets/moba/ico/${n}.png`);
}
/** Emoji used by gl() → sprite art (ico = game icon, vfx = Kenney particle sprite); `tint` colours it, `k` scales it. */
const GLYPH_ART = {
  '📶': { ico: 'signal3', tint: 0xff7a7a }, '🛑': { ico: 'stop', tint: 0xd63031, k: 1.6 }, '🔇': { ico: 'audioOff', tint: 0xffe0e0 },
  '⚠️': { ico: 'warning', tint: 0xffd23f }, '⭐': { ico: 'star', tint: 0xffd23f }, '⏪': { ico: 'rewind', tint: 0xcfe3ff },
  '🔒': { ico: 'locked', tint: 0xcfe3ff }, '🔓': { ico: 'unlocked', tint: 0xcfe3ff }, '📤': { ico: 'export', tint: 0xcfe3ff },
  '📋': { ico: 'menuList', tint: 0xcfe3ff }, '📄': { ico: 'menuList', tint: 0xffffff }, '🔁': { ico: 'return', tint: 0x7ec8ff },
  '🔄': { ico: 'return', tint: 0x7ed957 }, '🔀': { ico: 'share2', tint: 0x91a7ff }, '🤝': { ico: 'multiplayer', tint: 0xf7a072 },
  '📉': { ico: 'leaderboardsSimple', tint: 0xff9d4d }, '🌙': { ico: 'contrast', tint: 0xb6a8ff }, '🚀': { ico: 'fastForward', tint: 0xff9a3a },
  '🔨': { ico: 'wrench', tint: 0xcfd8dc }, '💻': { ico: 'tablet', tint: 0x7ec8ff }, '📌': { ico: 'target', tint: 0xffc94d },
  '👈': { ico: 'left', tint: 0xff7fc0 }, '📣': { ico: 'siganl1', tint: 0xff6b6b }, '🩹': { ico: 'plus', tint: 0xff9db0 },
  '📦': { vfx: 'window_01', tint: 0xc8a165 }, '☕': { vfx: 'smoke_07', tint: 0xc8864a }, '🪣': { vfx: 'circle_01', tint: 0x7ec8ff },
  '🧹': { vfx: 'slash_01', tint: 0xe3c88e }, '😴': { vfx: 'smoke_07', tint: 0x9b7bd4 }, '❄': { vfx: 'star_08', tint: 0xbff4ff },
  '🕸': { vfx: 'scratch_01', tint: 0xffffff }, '⏳': { vfx: 'twirl_01', tint: 0x6cffd6 }, '🔥': { vfx: 'flame_05', tint: 0xff9800 },
  '🚩': { vfx: 'trace_03', tint: 0xffb300 }, '🎉': { vfx: 'star_06', tint: 0xffd23f }, '🎈': { vfx: 'circle_01', tint: 0xff7fc0 },
  '✨': { vfx: 'star_04', tint: 0xffffff }, '🍜': { vfx: 'smoke_04', tint: 0xffc04d }, '✏️': { vfx: 'scratch_01', tint: 0xff7675 },
  '⚔️': { vfx: 'slash_02', tint: 0xffffff }, '💧': { vfx: 'circle_05', tint: 0x7ec8ff }, '🍒': { vfx: 'circle_05', tint: 0xd64545 },
};

// ───────────────────────── primitives ─────────────────────────
/** A tweened one-shot sprite. size/size1 in px, spin in radians over the life, sx/sy stretch. */
// V5: one-shot sprites / flipbooks are capped (f._live), so a team fight cannot grow the display list without bound.
const CAP = (f) => (f.low ? 110 : 240);
function sp(f, name, x, y, o = {}) {
  const s = f.scene, key = K(name);
  if (!s.textures.exists(key) || (f._live | 0) >= CAP(f)) return null;
  if (ECHO.on) o = { ...o, tint: 0x7ee8ff, a0: (o.a0 ?? 1) * 0.6, a1: (o.a1 ?? 0) * 0.6 }; // v6: echoed casts render cyan at 0.6
  const img = s.add.image(x, y, key).setDepth(o.depth ?? D.fx).setBlendMode(o.add === false ? 0 : 1)
    .setTint(o.tint ?? 0xffffff).setRotation(o.rot || 0).setAlpha(0);
  const sx = o.sx ?? 1, sy = o.sy ?? 1, a = (o.size ?? 64) / 256, b = (o.size1 ?? o.size ?? 64) / 256;
  img.setScale(a * sx, a * sy);
  s.tweens.add({
    targets: img, delay: o.delay || 0, duration: o.life || 400, ease: o.ease || 'Sine.easeOut',
    scaleX: b * sx, scaleY: b * sy, x: x + (o.dx || 0), y: y + (o.dy || 0), rotation: (o.rot || 0) + (o.spin || 0),
    alpha: { from: o.a0 ?? 1, to: o.a1 ?? 0 }, onStart: () => img.setAlpha(o.a0 ?? 1), onComplete: () => { f._live--; img.destroy(); },
  });
  f._live = (f._live | 0) + 1;
  return img;
}
/** A tweened emoji / text glyph. */
function gl(f, str, x, y, o = {}) {
  const s = f.scene;
  const art = GLYPH_ART[str];
  if (art) { // emoji are drawn as sprites (same look on every OS, no emoji fonts): Kenney icon or particle sprite
    const key = art.ico ? `ico-${art.ico}` : K(art.vfx);
    if (s.textures.exists(key)) {
      const img = s.add.image(x, y, key).setDepth(o.depth ?? D.fxTop).setAlpha(0).setRotation(o.rot || 0)
        .setTint(art.tint ?? 0xffffff).setBlendMode(art.ico ? 0 : 1);
      const base = ((o.size || 26) * (art.k || 1.5)) / img.width;
      img.setScale(base * (o.s0 ?? 1));
      s.tweens.add({
        targets: img, delay: o.delay || 0, duration: o.life || 700, ease: o.ease || 'Sine.easeOut',
        x: x + (o.dx || 0), y: y + (o.dy || 0), scale: base * (o.s1 ?? 1), rotation: (o.rot || 0) + (o.spin || 0),
        alpha: { from: o.a0 ?? 1, to: o.a1 ?? 0 }, onStart: () => img.setAlpha(o.a0 ?? 1), onComplete: () => img.destroy(),
      });
      return img;
    }
  }
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
  const ev = f.scene.time.addEvent({ delay: every, repeat: n - 1, callback: () => { if (f.scene.sys.isActive()) fn(); } });
  f._loops = (f._loops || []).filter((e) => !e.hasDispatched); // tracked so MobaFx.destroyAll can cancel what is still running
  f._loops.push(ev);
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
  // v6 pack (CC0, 30 frames unless noted)
  vfCharged: 40, vfPuffStars: 40, vfAnima: 30, vfElectricShield: 30, vfEldenRing: 30, vfPowerChords: 30, vfVortex: 30, vfWheel: 30, vfConstellation: 30, vfImpact: 30, vfSmallHit: 30, vfBigHit: 30, vfExplosion: 30, vfExplosion2: 30, vfPixelFire: 30, vfMagma: 30, vfDitheredFire: 30, vfHyperspeed: 30, vfTentacles: 30, vfWorm: 30, vfBlood: 30, vfKabooms: 30,
};
export function loadFb(scene) {
  for (const k of Object.keys(FB)) if (!scene.textures.exists(`fb-${k}`)) scene.load.spritesheet(`fb-${k}`, `assets/moba/fb/${k}.webp`, { frameWidth: 128, frameHeight: 128 });
}
/** A one-shot animated flipbook sprite playing over `life` ms (default 0.04 s per frame). */
function fb(f, key, x, y, o = {}) {
  const s = f.scene, tex = `fb-${key}`;
  if (!FB[key] || !s.textures.exists(tex) || (f._live | 0) >= CAP(f)) return null;
  const n = FB[key];
  if (!s.anims.exists(tex)) s.anims.create({ key: tex, frames: s.anims.generateFrameNumbers(tex, { start: 0, end: n - 1 }), frameRate: 24, repeat: 0 });
  const img = s.add.sprite(x, y, tex, 0).setDepth(o.depth ?? D.fx).setBlendMode(o.add === false ? 0 : 1)
    .setTint(o.tint ?? 0xffffff).setRotation(o.rot || 0).setAlpha(0).setScale((o.size ?? 128) / 128);
  f._live = (f._live | 0) + 1;
  const life = o.life || n * 40;
  const start = () => {
    if (!img.scene) return;
    img.setAlpha(o.a0 ?? 1).anims.play({ key: tex, frameRate: (n / life) * 1000 });
    if (o.size1) s.tweens.add({ targets: img, scale: o.size1 / 128, duration: life, ease: 'Sine.easeOut' });
  };
  img.once('animationcomplete', () => { f._live--; img.destroy(); });
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
    const cubes = clamp(Math.round(r / 28), 6, 16); // v6: radius (and so the cube count) grows with the orbs spent
    for (let i = 0; i < N(f, cubes); i++) { const a = (i / N(f, cubes)) * TAU; sp(f, 'window_01', x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9, { size: 26, size1: 8, dx: -Math.cos(a) * r * 0.9, dy: -Math.sin(a) * r * 0.9, spin: 3, life: delay + 300, tint: 0xb6fff0, ease: 'Quad.easeIn' }); }
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

// ═════════════════════════ v6 kit redesign: new one-shot styles ═════════════════════════
const colOf = (c, d) => (Number.isFinite(c) ? c : d);
/** Outcome style announced by the last `serve` fx, trusted for 600 ms (inner fx may arrive before or after it). */
const serveNow = (f) => (f.scene.time.now - (f.serveAt || -1e9) < 600 ? f.serveStyle : '');
const champOf = (f, sid) => f.scene._state?.()?.champions?.get?.(sid)?.champ || '';

Object.assign(CIRCLE, {
  // Patch E (feature): square frames and spikes close in, then a hammer lands.
  scopeCreep(f, { x, y, r, delay }) {
    for (let i = 0; i < 3; i++) sp(f, 'window_04', x, y, { size: r * (2.4 - i * 0.2), size1: r * 0.5, spin: -1.1 - i * 0.4, life: delay + 420, delay: i * 70, tint: i ? 0xffffff : 0x7ed957, a0: 0.85, ease: 'Quad.easeIn', depth: GROUND });
    for (let i = 0; i < N(f, 10); i++) { const a = (i / 10) * TAU; sp(f, 'trace_06', x + Math.cos(a) * r, y + Math.sin(a) * r, { size: r * 0.5, sx: 0.12, rot: a - Math.PI / 2, dx: -Math.cos(a) * r * 0.85, dy: -Math.sin(a) * r * 0.85, life: delay + 380, tint: 0x9dff7a, ease: 'Quad.easeIn' }); }
    gl(f, '🔨', x, y - 160, { size: 46, dy: 130, life: Math.max(200, delay + 300), ease: 'Quad.easeIn', a0: 1, a1: 1, s0: 1.4, s1: 1 });
    sp(f, 'star_08', x, y, { size: 40, size1: r * 1.2, life: 320, delay: delay + 300, tint: 0xb6ff8a });
  },
  // Mop Q (bucket stance): a bucket arcs in and douses the spot.
  bucketToss(f, { x, y, r, delay }) {
    gl(f, '🪣', x - 150, y - 360, { size: 50, dx: 150, dy: 360, life: Math.max(220, delay), ease: 'Quad.easeIn', a0: 1, a1: 1, spin: 5, s0: 1.2, s1: 0.9 });
    sp(f, 'circle_05', x, y, { size: r * 0.3, size1: r * 1.7, a0: 0.2, a1: 0.5, life: delay + 40, tint: 0x2aa8ff, add: false, depth: GROUND });
    sp(f, 'smoke_09', x, y, { size: r * 0.6, size1: r * 2.2, life: 600, delay, tint: 0x9fe8ff, a0: 0.55 });
    for (let i = 0; i < N(f, 10); i++) { const a = rnd(0, TAU), d = rnd(0.5, 1) * r; sp(f, 'circle_01', x, y, { size: 22, size1: 12, dx: Math.cos(a) * d, dy: Math.sin(a) * d - 50, life: 520, delay, tint: 0xbfe9ff, add: false, a0: 0.8 }); }
  },
  // Brew R (shot outcome): a dark espresso blast with radial shock fins.
  serveShot(f, { x, y, r, delay }) {
    sp(f, 'smoke_10', x, y, { size: r * 0.4, size1: r * 2, life: delay + 420, tint: 0x3a2214, add: false, a0: 0.8, depth: GROUND });
    sp(f, 'star_09', x, y, { size: r * 0.4, size1: r * 2.2, life: 300, delay, tint: 0xffe2b0 });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; sp(f, 'slash_04', x + Math.cos(a) * r * 0.2, y + Math.sin(a) * r * 0.2, { size: r * 0.7, rot: a + Math.PI / 2, dx: Math.cos(a) * r * 0.75, dy: Math.sin(a) * r * 0.75, life: 380, delay, tint: i % 2 ? 0xc8864a : 0x6b3a1c }); }
    for (let i = 0; i < N(f, 8); i++) { const [bx, by] = inDisc(x, y, r * 0.8); sp(f, 'dirt_03', bx, by, { size: 26, size1: 50, dy: -60, life: 520, delay: delay + i * 20, tint: 0x4a2c18, add: false, a0: 0.8 }); }
  },
  // Brew E: a sticky amber splash that stays on the floor.
  syrup(f, { x, y, r, delay }) {
    sp(f, 'circle_01', x, y, { size: r * 0.4, size1: r * 2, life: delay + 260, tint: 0xffb347, a0: 0.8, depth: GROUND });
    sp(f, 'smoke_07', x, y, { size: r * 1.6, a0: 0.35, a1: 0.05, life: 1400, delay, tint: 0xd98a1c, add: false, depth: GROUND });
    for (let i = 0; i < N(f, 8); i++) { const a = (i / 8) * TAU; sp(f, 'circle_05', x, y, { size: 26, size1: 14, dx: Math.cos(a) * r * 0.9, dy: Math.sin(a) * r * 0.9 - 40, life: 520, delay, tint: 0xffd27a, ease: 'Quad.easeOut' }); }
    sp(f, 'star_06', x, y, { size: 30, size1: r * 1.1, life: 300, delay, tint: 0xfff0c0 });
  },
  // Brew R (plain outcome): one sad drip.
  servePlain(f, { x, y, r, delay }) {
    gl(f, '💧', x, y - 90, { size: 30, dy: 90, life: Math.max(160, delay), ease: 'Quad.easeIn', a0: 1, a1: 1 });
    sp(f, 'circle_01', x, y, { size: r * 0.2, size1: r * 0.9, life: delay + 320, tint: 0xdcc8a0, a0: 0.6, depth: GROUND });
    sp(f, 'smoke_09', x, y, { size: r * 0.3, size1: r, life: 500, delay, tint: 0xffffff, a0: 0.3 });
  },
  // Brew R ("serve" is the slot style; the outcome style was announced by the `serve` fx).
  serve(f, c) { (CIRCLE[serveNow(f)] || (c.r > 200 ? CIRCLE.serveShot : CIRCLE.servePlain))(f, c); },
});

Object.assign(ZONE, {
  // Mop R (mop stance): a wet ring spins and flings droplets tangentially.
  mopSpin(f, { x, y, r, ms }) {
    sp(f, 'twirl_01', x, y, { size: r * 2.1, spin: TAU * (ms / 1100), life: ms, a0: 0.7, a1: 0.25, tint: 0x7ec8ff, ease: 'Linear', depth: GROUND });
    sp(f, 'smoke_09', x, y, { size: r * 2, a0: 0.3, a1: 0.05, life: ms, tint: 0x9fe8ff, ease: 'Linear', depth: GROUND });
    let a = 0;
    loop(f, ms, 140, () => { a += 0.9; sp(f, 'circle_01', x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9, { size: 18, size1: 10, dx: -Math.sin(a) * 70, dy: Math.cos(a) * 70 - 20, life: 520, tint: 0xd8f6ff, add: false, a0: 0.8 }); });
  },
  // Patch Q (feature): green rings spread out over and over.
  featureAura(f, { x, y, r, ms }) {
    sp(f, 'light_02', x, y, { size: r * 2.1, a0: 0.4, a1: 0.15, life: ms, tint: 0x7ed957, ease: 'Linear', depth: GROUND });
    loop(f, ms, 600, () => { sp(f, 'circle_03', x, y, { size: r * 0.3, size1: r * 2.05, life: 900, tint: 0x9dff7a, a0: 0.85 }); const [bx, by] = inDisc(x, y, r * 0.8); sp(f, 'symbol_01', bx, by, { size: 22, dy: -60, life: 800, tint: 0x7ed957, a0: 0.9 }); });
  },
  // Brew R (mocha outcome): a brown pool with steam and hearts.
  serveMocha(f, { x, y, r, ms }) {
    sp(f, 'circle_01', x, y, { size: r * 2, a0: 0.4, a1: 0.12, life: ms, tint: 0x7b4a2a, add: false, ease: 'Linear', depth: GROUND });
    sp(f, 'smoke_09', x, y, { size: r * 1.8, a0: 0.3, a1: 0.05, life: ms, tint: 0xc8864a, ease: 'Linear', depth: GROUND });
    loop(f, ms, 260, () => {
      const [bx, by] = inDisc(x, y, r * 0.8);
      sp(f, 'smoke_07', bx, by, { size: 26, size1: 80, dy: -70, life: 800, tint: 0xffffff, add: false, a0: 0.4 });
      if (Math.random() < 0.6) gl(f, '♥', bx, by, { size: 22, color: '#ff8fb3', dy: -70, life: 800, thick: 2 });
    });
  },
  serve(f, c) { (ZONE[serveNow(f)] || ZONE.serveMocha)(f, c); },
});

Object.assign(DASH, {
  // Brick Q impact: ground cracks and a star burst (the charge phase is drawn by LIVE.charge).
  bashCharge(f, { x0, y0, x1, y1 }) {
    const a = ang(x0, y0, x1, y1);
    lineSteps(x0, y0, x1, y1, N(f, 6), (x, y, k) => sp(f, 'dirt_02', x, y, { size: 40, size1: 100, life: 460, delay: k * 80, tint: 0xb5a58a, add: false, a0: 0.7 }));
    sp(f, 'scratch_01', x1, y1, { size: 190, rot: a, life: 900, tint: 0x2a2a30, add: false, a0: 0.8, depth: GROUND });
    sp(f, 'scratch_01', x1, y1, { size: 150, rot: a + 1, life: 260, delay: 60, tint: 0xffffff });
    sp(f, 'star_08', x1, y1 - 30, { size: 50, size1: 230, life: 320, delay: 80, tint: 0xffd23f });
    sp(f, 'slash_03', x1, y1 - 30, { size: 150, rot: a + Math.PI, life: 260, delay: 80, tint: 0x4a7bd0 });
  },
  // Patch Q (hotfix): three pink slashes and a band-aid streak.
  hotfixSlash(f, { x0, y0, x1, y1 }) {
    const a = ang(x0, y0, x1, y1), len = Math.hypot(x1 - x0, y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    sp(f, 'trace_06', mx, my - 30, { size: len * 1.05, sx: 0.14, rot: a - Math.PI / 2, life: 360, tint: 0xff3b8a });
    for (let i = 0; i < 3; i++) sp(f, 'slash_02', x0 + (x1 - x0) * (0.25 + i * 0.3), y0 + (y1 - y0) * (0.25 + i * 0.3) - 30, { size: 120, rot: a + (i - 1) * 0.5, life: 260, delay: i * 70, tint: i % 2 ? 0xffffff : 0xff7fb0 });
    gl(f, '🩹', x1, y1 - 70, { size: 32, life: 600, dy: -20, spin: 0.5 });
    sp(f, 'spark_05', x1, y1 - 40, { size: 200, life: 240, tint: 0xff3b8a });
  },
});

Object.assign(BLINK, {
  // Patch E (hotfix): a cherry hops from one end to the other on pink arcs.
  cherryPick(f, { x0, y0, x1, y1 }) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, a = ang(x0, y0, x1, y1), len = Math.hypot(x1 - x0, y1 - y0);
    for (const o of [-1, 1]) sp(f, 'twirl_03', mx, my - 40, { size: len, rot: a + (o > 0 ? 0 : Math.PI), life: 460, tint: o > 0 ? 0xff3b8a : 0xffffff, sy: 0.6 });
    gl(f, '🍒', x0, y0 - 60, { size: 40, dx: x1 - x0, dy: y1 - y0, life: 320, a1: 1, ease: 'Cubic.easeInOut' });
    for (const [x, y] of [[x0, y0], [x1, y1]]) sp(f, 'star_06', x, y - 40, { size: 30, size1: 130, life: 380, tint: 0xff7fb0 });
  },
  // Zero W: two smoke puffs joined by a purple streak.
  shadowSwap(f, { x0, y0, x1, y1 }) {
    const a = ang(x0, y0, x1, y1), len = Math.hypot(x1 - x0, y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    for (const [x, y] of [[x0, y0], [x1, y1]]) { sp(f, 'smoke_07', x, y - 40, { size: 60, size1: 200, life: 600, tint: 0x14142a, add: false, a0: 0.8 }); sp(f, 'smoke_04', x, y - 40, { size: 40, size1: 150, life: 500, tint: 0x6a4fd0, a0: 0.6 }); }
    sp(f, 'trace_07', mx, my - 40, { size: len, sx: 0.22, rot: a - Math.PI / 2, life: 420, tint: 0xb084ff });
    sp(f, 'trace_07', mx, my - 40, { size: len, sx: 0.08, rot: a - Math.PI / 2, life: 300, tint: 0xffffff });
    for (const [x, y] of [[x0, y0], [x1, y1]]) sp(f, 'star_09', x, y - 40, { size: 30, size1: 130, life: 320, tint: 0xb084ff });
  },
});

// Stance / mode flips: `name` is the new stance (undefined when drawn from a plain `buff` fx).
const STANCE_FX = {
  // Stack W: hex lock ring flips from green (open) to amber (allies only).
  accessToggle(f, { x, y, name }) {
    const open = name !== 'allies', c0 = open ? 0xffb347 : 0x59e08a, c1 = open ? 0x59e08a : 0xffb347;
    sp(f, 'circle_03', x, y - 40, { size: 170, a0: 0.9, life: 260, tint: c0, rot: 0 });
    sp(f, 'circle_03', x, y - 40, { size: 170, size1: 210, spin: Math.PI, a0: 0.9, life: 520, delay: 200, tint: c1 });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; sp(f, 'window_01', x + Math.cos(a) * 85, y - 40 + Math.sin(a) * 85, { size: 18, size1: 10, rot: a, spin: 1.5, life: 520, delay: 200, tint: c1 }); }
    gl(f, open ? '🔓' : '🔒', x, y - 120, { size: 34, life: 800, dy: -20, s0: 0.6, s1: 1.2 });
  },
  // Mop W: mop and bucket icons swap places in a spinning ring above the head.
  gearSwitch(f, { x, y, name }) {
    const toBucket = name === 'bucket';
    sp(f, 'twirl_02', x, y - 120, { size: 120, spin: TAU * 1.2, life: 700, tint: 0x7ec8ff, a0: 0.9 });
    gl(f, toBucket ? '🧹' : '🪣', x, y - 120, { size: 34, life: 380, dx: -34, a1: 0, s1: 0.6 });
    gl(f, toBucket ? '🪣' : '🧹', x, y - 120, { size: 40, life: 760, delay: 200, dy: -18, a0: 0.2, a1: 0.9, s0: 0.5, s1: 1.25 });
    sp(f, 'circle_03', x, y, { size: 40, size1: 170, life: 420, tint: 0x7ec8ff });
  },
  // Patch W: three branch nodes (main blue, hotfix pink, feature green), the active one lit.
  checkout(f, { x, y, name }) {
    const nodes = [['main', 0x39a0ff, -48], ['hotfix', 0xff3b8a, 0], ['feature', 0x7ed957, 48]];
    for (const [n, c, dx] of nodes) {
      const on = n === (name || 'main');
      sp(f, 'circle_05', x + dx, y - 130 + Math.abs(dx) * 0.35, { size: on ? 34 : 20, size1: on ? 44 : 18, life: 900, tint: c, a0: on ? 1 : 0.4, a1: on ? 0.8 : 0 });
      if (on) { sp(f, 'star_06', x + dx, y - 130 + Math.abs(dx) * 0.35, { size: 30, size1: 90, life: 500, tint: c }); sp(f, 'circle_03', x, y, { size: 40, size1: 170, life: 420, tint: c }); }
    }
    sp(f, 'trace_06', x, y - 118, { size: 100, sx: 0.06, rot: Math.PI / 2, life: 900, tint: 0xffffff, a0: 0.5 });
    gl(f, '⎇', x, y - 160, { size: 22, color: '#c9e6ff', life: 900, dy: -10 });
  },
};

Object.assign(BUFF, {
  accessToggle: (f, c) => STANCE_FX.accessToggle(f, c),
  gearSwitch: (f, c) => STANCE_FX.gearSwitch(f, c),
  checkout: (f, c) => STANCE_FX.checkout(f, c),
  // Model W: three data orbs spiral in, snap into a shield ring.
  orbShield(f, { x, y, color }) {
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; sp(f, 'magic_01', x + Math.cos(a) * 110, y - 46 + Math.sin(a) * 40, { size: 40, size1: 26, dx: -Math.cos(a) * 80, dy: -Math.sin(a) * 28, spin: TAU, life: 520, tint: colOf(color, 0x6cffd6), ease: 'Back.easeOut', a1: 0.5 }); }
    sp(f, 'circle_03', x, y - 46, { size: 60, size1: 150, life: 420, delay: 300, tint: 0xffffff });
    sp(f, 'circle_05', x, y - 46, { size: 110, a0: 0.35, a1: 0, life: 900, delay: 300, tint: colOf(color, 0x6cffd6) });
  },
  // Rush R: speed lines and an orange aura.
  rushHour(f, { x, y }) {
    sp(f, 'light_03', x, y - 40, { size: 60, size1: 240, life: 600, tint: 0xff9a3a, a0: 0.8 });
    for (let i = 0; i < N(f, 9); i++) sp(f, 'trace_07', x - 150, y - 80 + i * 14, { size: 160, sx: 0.1, rot: Math.PI / 2, dx: 300, life: 460, delay: i * 35, tint: i % 2 ? 0xffd23f : 0xff7a1a });
    sp(f, 'twirl_02', x, y - 40, { size: 180, spin: TAU * 2.5, life: 700, tint: 0xff7a1a, a0: 0.8 });
    sp(f, 'flare_01', x, y - 40, { size: 120, size1: 40, life: 400, tint: 0xffe2a0 });
  },
  // Brew W: a billowing steam cloud.
  milkSteam(f, { x, y }) {
    for (let i = 0; i < N(f, 8); i++) sp(f, i % 2 ? 'smoke_04' : 'smoke_07', x + rnd(-50, 50), y - rnd(0, 60), { size: 50, size1: 170, dy: -70, dx: rnd(-30, 30), life: 900, delay: i * 50, tint: 0xfff4e6, add: false, a0: 0.55 });
    sp(f, 'circle_01', x, y, { size: 40, size1: 220, life: 520, tint: 0xf5e6d3, a0: 0.6, depth: GROUND });
  },
  // Brew R (milk outcome): a white wave rolls out and a shield ring settles.
  serveMilk(f, { x, y }) {
    sp(f, 'circle_03', x, y, { size: 60, size1: 460, life: 700, tint: 0xffffff, a0: 0.9, depth: GROUND });
    sp(f, 'circle_03', x, y, { size: 40, size1: 300, life: 600, delay: 120, tint: 0xf5e6d3 });
    sp(f, 'circle_05', x, y - 46, { size: 120, a0: 0.4, a1: 0.05, life: 1100, delay: 200, tint: 0xffffff });
    for (let i = 0; i < N(f, 6); i++) gl(f, '+', x + rnd(-50, 50), y - 10, { size: 26, color: '#ffffff', dy: -90, life: 800, delay: i * 60, bold: true });
  },
  // Brew R (syrup outcome): pink sparkles rise around the body.
  serveSugar(f, { x, y }) {
    sp(f, 'light_02', x, y - 40, { size: 40, size1: 220, life: 700, tint: 0xff9ad0, a0: 0.8 });
    sp(f, 'magic_05', x, y - 40, { size: 150, spin: TAU, life: 700, tint: 0xffd0ec, a0: 0.8 });
    for (let i = 0; i < N(f, 10); i++) sp(f, 'star_04', x + rnd(-45, 45), y - rnd(0, 30), { size: 14, size1: 36, dy: -rnd(70, 130), life: 800, delay: i * 50, tint: i % 2 ? 0xff9ad0 : 0xffe8f4 });
  },
  // Brew R ("serve" slot style): dispatch to the announced outcome.
  serve(f, c) { (BUFF[serveNow(f)] || BUFF.serveMilk)(f, c); },
  // Patch R (feature): a green burst fires upward, rocket on top.
  release(f, { x, y }) {
    for (let i = 0; i < N(f, 8); i++) sp(f, 'trace_07', x + (i - 3.5) * 22, y - 20, { size: 220, sx: 0.12, rot: 0, dy: -190, life: 600, delay: i * 30, tint: i % 2 ? 0x9dff7a : 0xffffff });
    sp(f, 'star_09', x, y - 40, { size: 40, size1: 240, life: 420, tint: 0x7ed957 });
    sp(f, 'circle_03', x, y, { size: 60, size1: 600, life: 700, tint: 0x7ed957 });
    gl(f, '🚀', x, y - 60, { size: 48, dy: -260, life: 1000, s0: 0.6, s1: 1.3, ease: 'Cubic.easeIn' });
  },
  // Rush W: the box pops over the head with sparkles.
  pickup(f, { x, y }) {
    gl(f, '📦', x, y - 100, { size: 44, life: 800, s0: 0.2, s1: 1.2, dy: -16, ease: 'Back.easeOut', a1: 0.9 });
    for (let i = 0; i < N(f, 6); i++) sp(f, 'star_06', x + rnd(-36, 36), y - 100 + rnd(-20, 20), { size: 10, size1: 34, life: 520, delay: i * 40, tint: 0xffe08a });
    sp(f, 'circle_03', x, y, { size: 30, size1: 130, life: 380, tint: 0xc8a165 });
  },
});

Object.assign(TGT, {
  // Patch R (hotfix): one long, hard beam straight through the target.
  forcePush(f, { x0, y0, x1, y1 }) {
    const a = ang(x0, y0, x1, y1), len = Math.hypot(x1 - x0, y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - 40;
    sp(f, 'trace_07', mx, my, { size: len, sx: 0.5, rot: a - Math.PI / 2, life: 300, tint: 0xff1744, a0: 0.8 });
    sp(f, 'trace_07', mx, my, { size: len, sx: 0.16, rot: a - Math.PI / 2, life: 240, tint: 0xffffff });
    sp(f, 'spark_07', mx, my, { size: len, rot: a, life: 260, tint: 0xff5577, sy: 1.2 });
    sp(f, 'muzzle_04', x0, y0 - 40, { size: 130, rot: a + Math.PI / 2, life: 260, tint: 0xff5577 });
    sp(f, 'star_08', x1, y1 - 40, { size: 40, size1: 220, life: 340, delay: 100, tint: 0xff1744 });
    gl(f, '📤', x1, y1 - 100, { size: 34, life: 700, dy: -20, delay: 100 });
  },
});

// Projectile heads / decorations.
const sparkTrail = (tint) => (f, s, dt) => { if (every(s, '_d', dt, 0.05)) puff(f, s, 'star_04', tint, { s0: 20, s1: 4, life: 0.3 }); };
Object.assign(PROJ, {
  sniperCharge: { head: 'trace_07', core: 'flare_01', w: 0.5, h: 4.2, orient: true, deco: (f, s, dt) => { if (every(s, '_d', dt, 0.025)) puff(f, s, 'spark_05', 0xff6a5a, { s0: 40, s1: 4, life: 0.22 }); } },
  notif: { keepTex: true, deco: sparkTrail(0xff9ad0) },
  burstUpdate: { keepTex: true, deco: sparkTrail(0x9ad0ff) },
  storeLaunch: { keepTex: true, deco: (f, s, dt) => { if (every(s, '_d', dt, 0.04)) { puff(f, s, 'star_06', 0xffd23f, { s0: 26, s1: 4, life: 0.3 }); puff(f, s, 'smoke_04', 0xffffff, { add: false, s0: 18, s1: 50, a0: 0.3, life: 0.4 }); } } },
});
Object.assign(MUZZLE, {
  sniperCharge: (f, { x, y, dx, dy }) => { sp(f, 'muzzle_01', x + dx * 30, y + dy * 30 - 40, { size: 140, rot: Math.atan2(dy, dx) + Math.PI / 2, life: 220, tint: 0xff6a5a }); sp(f, 'flare_01', x + dx * 30, y + dy * 30 - 40, { size: 120, size1: 20, life: 200, tint: 0xffffff }); },
  notif: (f, { x, y }) => { sp(f, 'circle_03', x, y - 40, { size: 30, size1: 110, life: 300, tint: 0xff9ad0 }); },
  burstUpdate: (f, { x, y }) => { sp(f, 'circle_03', x, y - 40, { size: 30, size1: 150, life: 340, tint: 0x9ad0ff }); },
  storeLaunch: (f, { x, y }) => { fb(f, 'burstOrange', x, y - 40, { size: 190, life: 500 }); sp(f, 'star_09', x, y - 40, { size: 30, size1: 150, life: 320, tint: 0xffd23f }); },
});

// Flipbook layers for the new styles (skipped on Low effects by castFx).
Object.assign(FBX.circle, {
  bucketToss: (f, { x, y, r, delay }) => { fb(f, 'impactWater', x, y, { size: r * 2.4, life: 700, delay }); },
  serveShot: (f, { x, y, r, delay }) => { fb(f, 'burstOrange', x, y, { size: r * 2.4, life: 700, delay }); },
  syrup: (f, { x, y, r, delay }) => { fb(f, 'impactGold', x, y, { size: r * 2.3, life: 600, delay }); },
  scopeCreep: (f, { x, y, r, delay }) => { fb(f, 'ringGreen', x, y, { size: r * 2.4, life: delay + 500, depth: G }); },
});
Object.assign(FBX.zone, {
  mopSpin: (f, { x, y, r, ms }) => { fb(f, 'ringBlue', x, y, { size: r * 2.3, life: ms, a0: 0.7, depth: G }); fb(f, 'waterDots', x, y, { size: r * 2.1, life: ms, a0: 0.6 }); },
  featureAura: (f, { x, y, r, ms }) => { fb(f, 'ringGreen', x, y, { size: r * 2.3, life: ms, a0: 0.6, depth: G }); },
  serveMocha: (f, { x, y, r, ms }) => { fb(f, 'smoke', x, y, { size: r * 2.1, life: ms, a0: 0.4, tint: 0xc8864a, add: false }); },
});
Object.assign(FBX.dash, { bashCharge: (f, { x1, y1 }) => { fb(f, 'impactAir', x1, y1 - 20, { size: 220, life: 500, tint: 0xffd23f }); fb(f, 'smoke', x1, y1, { size: 170, life: 700, add: false, a0: 0.55 }); } });
Object.assign(FBX.blink, { shadowSwap: (f, { x0, y0, x1, y1 }) => { fb(f, 'smoke', x0, y0 - 30, { size: 190, life: 800, tint: 0x14142a, add: false, a0: 0.85 }); fb(f, 'smoke', x1, y1 - 30, { size: 190, life: 800, tint: 0x14142a, add: false, a0: 0.85 }); } });
Object.assign(FBX.buff, {
  serveMilk: (f, { x, y }) => { fb(f, 'ringWhite', x, y - 20, { size: 330, life: 800 }); },
  release: (f, { x, y }) => { fb(f, 'burstGreen', x, y - 40, { size: 340, life: 800 }); },
  rushHour: (f, { x, y }) => { fb(f, 'burstOrange', x, y - 40, { size: 240, life: 650 }); },
});
Object.assign(FBX.tgt, { forcePush: (f, { x1, y1 }) => { fb(f, 'burstFire', x1, y1 - 40, { size: 240, life: 650, delay: 100, tint: 0xff5577 }); } });

// ── shared shape helpers (v6.1 extension point): a new skill style is mostly a registry entry calling these ──
// All honour f.low (halved counts via N) and only create tweened one-shots (no persistent objects).
export const SHAPES = {
  ring: (f, x, y, r, o = {}) => sp(f, o.tex || 'circle_03', x, y, { size: r * 0.3, size1: r * 2, life: 420, tint: 0xffffff, ...o }),
  burst: (f, x, y, r, o = {}) => sp(f, o.tex || 'star_09', x, y, { size: r * 0.2, size1: r * 1.6, life: 320, tint: 0xffffff, ...o }),
  /** a stretched sprite from (x0,y0) to (x1,y1) (trace sprites are vertical-long) */
  line: (f, x0, y0, x1, y1, o = {}) => sp(f, o.tex || 'trace_07', (x0 + x1) / 2, (y0 + y1) / 2, { size: Math.hypot(x1 - x0, y1 - y0), sx: o.w ?? 0.14, rot: ang(x0, y0, x1, y1) - Math.PI / 2, life: 300, tint: 0xffffff, ...o }),
  beam: (f, x0, y0, x1, y1, o = {}) => { SHAPES.line(f, x0, y0, x1, y1, { w: 0.5, a0: 0.8, ...o }); SHAPES.line(f, x0, y0, x1, y1, { w: 0.16, tint: 0xffffff, ...o, tex: o.tex }); },
  /** n slashes fanned over `spread` rad around direction a */
  cone: (f, x, y, a, len, o = {}) => { const n = N(f, o.n || 5); for (let i = 0; i < n; i++) { const k = n > 1 ? i / (n - 1) - 0.5 : 0; sp(f, o.tex || 'slash_04', x + Math.cos(a) * len * 0.4, y + Math.sin(a) * len * 0.4, { size: len * 0.8, rot: a + k * (o.spread || 1), life: 320, delay: i * 25, tint: 0xffffff, ...o }); } },
  arc: (f, x, y, r, a, o = {}) => sp(f, o.tex || 'slash_03', x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, { size: r * 1.4, rot: a, spin: o.sweep || 1.2, life: 280, tint: 0xffffff, ...o }),
  vortex: (f, x, y, r, o = {}) => { for (let i = 0; i < (o.n || 2); i++) sp(f, ['twirl_01', 'twirl_02', 'twirl_03'][i % 3], x, y, { size: r * 2.2, size1: r * 0.5, spin: -TAU * (1 + i * 0.3), life: 520, delay: i * 60, tint: 0xffffff, ...o }); },
  /** n bodies spiralling outward/inward around a point */
  orbit: (f, x, y, r, o = {}) => { const n = N(f, o.n || 6); for (let i = 0; i < n; i++) { const a = (i / n) * TAU; sp(f, o.tex || 'circle_05', x + Math.cos(a) * r, y + Math.sin(a) * r, { size: 20, size1: 8, dx: -Math.sin(a) * r * 0.5, dy: Math.cos(a) * r * 0.5, life: 520, tint: 0xffffff, ...o }); } },
  wall: (f, x0, y0, x1, y1, o = {}) => { SHAPES.line(f, x0, y0, x1, y1, { tex: 'trace_03', w: 0.3, life: 500, ...o }); for (const [x, y] of [[x0, y0], [x1, y1]]) sp(f, 'flare_01', x, y, { size: 70, life: 500, tint: o.tint ?? 0xffffff }); },
  /** lightning chain through a list of {x,y} points */
  chain: (f, pts, color = 0x7ffcff) => { for (let i = 1; i < pts.length; i++) f.zap(pts[i - 1].x, pts[i - 1].y - 36, pts[i].x, pts[i].y - 36, color); },
};

// ── Volt: turret skills (objcmd / place). The scene resolves these through whichever fx kind the engine emits
// (buff on the caster, circle at the aim, zone), so each style is registered for all three. ──
const myTurrets = (f, x, y) => {
  const us = f.scene.views?.units;
  if (!us) return [];
  let team = null, bd = 1e9;
  for (const v of us.values()) if (v.isTurret && !v.dying) { const d = Math.hypot(v.x - x, v.y - y); if (d < bd) { bd = d; team = v.team; } }
  const out = [];
  if (team) for (const v of us.values()) if (v.isTurret && !v.dying && v.team === team && out.length < 6) out.push(v);
  return out;
};
const TURRET_FX = {
  // Q: the turret drops from above with smoke and a spark ring.
  turretDeploy(f, { x, y }) {
    sp(f, 'circle_05', x, y, { size: 30, size1: 110, a0: 0.15, a1: 0.5, life: 260, tint: 0x000000, add: false, depth: GROUND });
    sp(f, 'smoke_04', x, y, { size: 40, size1: 190, life: 600, delay: 240, tint: 0xffffff, add: false, a0: 0.5 });
    sp(f, 'circle_03', x, y, { size: 30, size1: 190, life: 420, delay: 240, tint: 0x00e5ff });
    for (let i = 0; i < N(f, 8); i++) sp(f, 'spark_02', x, y - 10, { size: 50, rot: (i / 8) * TAU, life: 300, delay: 240, tint: i % 2 ? 0xffd23f : 0xffffff });
    if (!f.low) { fb(f, 'vfSmallHit', x, y - 20, { size: 200, life: 500, delay: 240 }); fb(f, 'vfPuffStars', x, y - 10, { size: 170, life: 700, delay: 260 }); }
  },
  // W: red glow and sparks on every turret.
  overclockTurrets(f, { x, y }) {
    for (const v of myTurrets(f, x, y)) {
      sp(f, 'light_02', v.x, v.y - 30, { size: 40, size1: 190, life: 700, tint: 0xff3b30, a0: 0.8 });
      for (let i = 0; i < N(f, 4); i++) sp(f, 'spark_02', v.x + rnd(-24, 24), v.y - rnd(10, 60), { size: 56, life: 360, delay: i * 70, tint: 0xff9800, rot: rnd(0, TAU) });
      if (!f.low) fb(f, 'vfAnima', v.x, v.y - 30, { size: 170, life: 800, tint: 0xff6a4a });
    }
  },
  // E: white steam ring and a frost tint around every turret.
  vent(f, { x, y }) {
    const ts = myTurrets(f, x, y);
    for (const v of (ts.length ? ts : [{ x, y }])) {
      sp(f, 'smoke_03', v.x, v.y - 20, { size: 50, size1: 280, life: 800, tint: 0xffffff, add: false, a0: 0.6 });
      sp(f, 'circle_03', v.x, v.y, { size: 40, size1: 250, life: 600, tint: 0xbff4ff });
      sp(f, 'light_02', v.x, v.y - 20, { size: 160, a0: 0.5, a1: 0, life: 900, tint: 0x8fe4ff });
      if (!f.low) fb(f, 'vfWheel', v.x, v.y, { size: 240, life: 700, tint: 0xbff4ff, depth: G });
    }
  },
  // R: lightning arcs between the turrets, a blast at each sized by its heat.
  chainBlast(f, { x, y }) {
    const ts = myTurrets(f, x, y);
    for (let i = 0; i < ts.length; i++) {
      const v = ts[i], h = (f.objState.get(v.id)?.h || 0) / 10, R = 140 + 160 * h;
      if (i) f.zap(ts[i - 1].x, ts[i - 1].y - 36, v.x, v.y - 36, 0x7ffcff);
      sp(f, 'star_09', v.x, v.y - 30, { size: 40, size1: R * 1.6, life: 340, delay: i * 70, tint: h > 0.5 ? 0xff7a3a : 0xffe08a });
      sp(f, 'circle_03', v.x, v.y, { size: 40, size1: R * 2, life: 460, delay: i * 70, tint: 0xff9800 });
      if (!f.low) fb(f, h > 0.5 ? 'vfExplosion' : 'burstFire', v.x, v.y - 30, { size: R * 2.2, life: 650, delay: i * 70 });
    }
  },
};
for (const n of Object.keys(TURRET_FX)) { BUFF[n] = TURRET_FX[n]; CIRCLE[n] = TURRET_FX[n]; ZONE[n] = (f, c) => TURRET_FX[n](f, { x: c.x, y: c.y }); }

// ── new flipbook layers (vf* pack) for the v6 styles ──
Object.assign(FBX.circle, {
  scopeCreep: (f, { x, y, r, delay }) => { fb(f, 'ringGreen', x, y, { size: r * 2.4, life: delay + 500, depth: G }); fb(f, 'vfVortex', x, y, { size: r * 2.3, life: delay + 600, tint: 0x9dff7a, depth: G }); },
  serveShot: (f, { x, y, r, delay }) => { fb(f, 'burstOrange', x, y, { size: r * 2.4, life: 700, delay }); fb(f, 'vfExplosion2', x, y - 10, { size: r * 2.2, life: 800, delay }); },
  syrup: (f, { x, y, r, delay }) => { fb(f, 'impactGold', x, y, { size: r * 2.3, life: 600, delay }); fb(f, 'vfPuffStars', x, y, { size: r * 2.1, life: 800, delay, tint: 0xffd27a }); },
  bucketToss: (f, { x, y, r, delay }) => { fb(f, 'impactWater', x, y, { size: r * 2.4, life: 700, delay }); fb(f, 'vfSmallHit', x, y, { size: r * 1.6, life: 500, delay, tint: 0x9fe8ff }); },
  roots: (f, { x, y, r, delay }) => { fb(f, 'impactLeaf', x, y, { size: r * 2.3, life: 800, delay }); fb(f, 'burstGreen', x, y, { size: r * 1.7, life: 700, delay }); fb(f, 'vfTentacles', x, y - 20, { size: r * 2.2, life: 900, delay, tint: 0x6cff7a }); },
  lockdown: (f, { x, y, r, delay }) => { fb(f, 'ringGold', x, y, { size: r * 2.4, life: 800, delay, depth: G }); fb(f, 'impactAir', x, y, { size: r * 2.2, life: 600, delay }); fb(f, 'vfWheel', x, y, { size: r * 2.5, life: 700, delay, tint: 0xffd23f, depth: G }); },
});
Object.assign(FBX.zone, {
  mopSpin: (f, { x, y, r, ms }) => { fb(f, 'ringBlue', x, y, { size: r * 2.3, life: ms, a0: 0.7, depth: G }); fb(f, 'vfWheel', x, y, { size: r * 2.4, life: ms, a0: 0.5, tint: 0x7ec8ff, depth: G }); },
  featureAura: (f, { x, y, r, ms }) => { fb(f, 'ringGreen', x, y, { size: r * 2.3, life: ms, a0: 0.6, depth: G }); fb(f, 'vfAnima', x, y - 20, { size: r * 1.5, life: ms, a0: 0.5, tint: 0x9dff7a }); },
  serveMocha: (f, { x, y, r, ms }) => { fb(f, 'smoke', x, y, { size: r * 2.1, life: ms, a0: 0.4, tint: 0xc8864a, add: false }); fb(f, 'vfMagma', x, y, { size: r * 1.9, life: ms, a0: 0.45, tint: 0xc8864a, depth: G }); },
});
Object.assign(FBX.dash, {
  bashCharge: (f, { x1, y1 }) => { fb(f, 'impactAir', x1, y1 - 20, { size: 220, life: 500, tint: 0xffd23f }); fb(f, 'vfBigHit', x1, y1 - 30, { size: 230, life: 600, delay: 80 }); fb(f, 'smoke', x1, y1, { size: 170, life: 700, add: false, a0: 0.55 }); },
  hotfixSlash: (f, { x1, y1 }) => { fb(f, 'vfImpact', x1, y1 - 40, { size: 200, life: 500, tint: 0xff3b8a }); },
});
Object.assign(FBX.blink, {
  cherryPick: (f, { x1, y1 }) => { fb(f, 'vfSmallHit', x1, y1 - 40, { size: 190, life: 500, tint: 0xff7fb0 }); },
  shadowSwap: (f, { x0, y0, x1, y1 }) => { for (const [x, y] of [[x0, y0], [x1, y1]]) { fb(f, 'smoke', x, y - 30, { size: 190, life: 800, tint: 0x14142a, add: false, a0: 0.85 }); fb(f, 'vfPuffStars', x, y - 30, { size: 170, life: 800, tint: 0xb084ff }); } },
});
Object.assign(FBX.buff, {
  serveMilk: (f, { x, y }) => { fb(f, 'ringWhite', x, y - 20, { size: 330, life: 800 }); fb(f, 'vfWheel', x, y, { size: 380, life: 800, depth: G }); },
  release: (f, { x, y }) => { fb(f, 'burstGreen', x, y - 40, { size: 340, life: 800 }); fb(f, 'vfEldenRing', x, y - 10, { size: 420, life: 900, tint: 0x9dff7a }); },
  rushHour: (f, { x, y }) => { fb(f, 'burstOrange', x, y - 40, { size: 240, life: 650 }); fb(f, 'vfHyperspeed', x, y - 40, { size: 420, life: 700, tint: 0xffd23f }); },
  orbShield: (f, { x, y }) => { fb(f, 'vfElectricShield', x, y - 46, { size: 210, life: 900, tint: 0x6cffd6 }); },
  serveSugar: (f, { x, y }) => { fb(f, 'vfConstellation', x, y - 40, { size: 260, life: 900, tint: 0xff9ad0 }); },
  accessToggle: (f, { x, y }) => { fb(f, 'vfWheel', x, y, { size: 260, life: 700, tint: 0x59e08a, depth: G }); },
  checkout: (f, { x, y }) => { fb(f, 'vfConstellation', x, y - 120, { size: 200, life: 900, tint: 0xc9e6ff }); },
});
Object.assign(FBX.tgt, { forcePush: (f, { x0, y0, x1, y1 }) => { fb(f, 'burstFire', x1, y1 - 40, { size: 240, life: 650, delay: 100, tint: 0xff5577 }); fb(f, 'vfPowerChords', x0, y0 - 40, { size: 280, life: 500, rot: ang(x0, y0, x1, y1) }); } });
Object.assign(MUZZLE, {
  sniperCharge: (f, { x, y, dx, dy }) => { sp(f, 'muzzle_01', x + dx * 30, y + dy * 30 - 40, { size: 140, rot: Math.atan2(dy, dx) + Math.PI / 2, life: 220, tint: 0xff6a5a }); fb(f, 'vfCharged', x + dx * 40, y + dy * 40 - 40, { size: 200, life: 500, tint: 0xff6a5a }); },
  storeLaunch: (f, { x, y, dx, dy }) => { fb(f, 'burstOrange', x, y - 40, { size: 190, life: 500 }); fb(f, 'vfPowerChords', x + dx * 40, y + dy * 40 - 40, { size: 260, life: 500, rot: Math.atan2(dy, dx) }); },
});

// ═════════════════════════ v6: persistent fx (LIVE) and one-shot kit fx (V6) ═════════════════════════
// MobaFx.handle() owns the registry (keyed by oid / tid / lid / sid), the per-frame update, the fade and the
// cleanup. A LIVE builder gets (f, m, e) and sets e.upd(dt) / e.end(boom) / e.rel(); e supplies pooled images
// (e.img), an additive Graphics (e.gfx), owned objects (e.add) and the fade factor e.vis (0..1).
const PIN_LOOK = { nit: { c: 0xff9f43, g: '!' }, block: { c: 0xff4757, g: '■' }, suggest: { c: 0x59e08a, g: '✓' } };
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
};
export { segDist };
function aimAng(f, sid) {
  const s = f.scene, p = f.posOf(sid);
  if (p && sid === s.localId && s.input?.activePointer) {
    const w = s.cameras.main.getWorldPoint(s.input.activePointer.x, s.input.activePointer.y);
    return Math.atan2(w.y - p.y, w.x - p.x);
  }
  const v = s.views?.champs?.get(sid);
  return v && v.facing < 0 ? Math.PI : 0;
}
/** A looping flipbook sprite (persistent; the caller owns / destroys it). Null when the sheet is missing. */
export function loopFb(f, key, x, y, o = {}) {
  const s = f.scene, tex = `fb-${key}`;
  if (!FB[key] || !s.textures.exists(tex)) return null;
  const n = FB[key];
  if (!s.anims.exists(tex)) s.anims.create({ key: tex, frames: s.anims.generateFrameNumbers(tex, { start: 0, end: n - 1 }), frameRate: 24, repeat: 0 });
  const img = s.add.sprite(x, y, tex, 0).setDepth(o.depth ?? D.fx).setBlendMode(o.add === false ? 0 : 1)
    .setTint(o.tint ?? 0xffffff).setAlpha(o.a ?? 1).setScale((o.size ?? 128) / 128);
  img.anims.play({ key: tex, frameRate: o.rate ?? 20, repeat: -1 });
  return img;
}
function ghost(f, x, y, tint, a, flip = false, depth = D.fx) {
  const s = f.scene;
  if (!s.textures.exists('stick-idle')) return null;
  return s.add.image(x, y, 'stick-idle').setOrigin(0.5, 0.85).setDisplaySize(78, 100).setTint(tint).setAlpha(a).setDepth(depth).setFlipX(flip);
}
const zig = (g, ax, ay, bx, by, n, amp, t) => {
  const len = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / len, ny = (bx - ax) / len;
  g.beginPath(); g.moveTo(ax, ay);
  for (let i = 1; i < n; i++) { const k = i / n, w = Math.sin(i * 1.7 + t) * amp; g.lineTo(ax + (bx - ax) * k + nx * w, ay + (by - ay) * k + ny * w); }
  g.lineTo(bx, by); g.strokePath();
};

export const LIVE = {
  // Pixel Q: two glowing posts joined by a flickering line; brightens on every hit, fades over the last 400 ms.
  wall(f, m, e) {
    e.kind = 'wall'; e.fade = 400;
    const A = { x: m.x, y: m.y }, B = { x: Number.isFinite(m.x2) ? m.x2 : m.x + 200, y: Number.isFinite(m.y2) ? m.y2 : m.y };
    const col = colOf(m.color, 0x39c2ff), th = clamp(m.thick || 36, 12, 90);
    e.A = A; e.B = B; e.flash = 0;
    const a = ang(A.x, A.y, B.x, B.y), len = Math.hypot(B.x - A.x, B.y - A.y);
    const line = e.img('trace_03', col, true, D.ground + 0.6), post1 = e.img('flare_01', col, true, D.ground + 0.7), post2 = e.img('flare_01', col, true, D.ground + 0.7);
    line.setPosition((A.x + B.x) / 2, (A.y + B.y) / 2).setRotation(a - Math.PI / 2);
    post1.setPosition(A.x, A.y); post2.setPosition(B.x, B.y);
    const fires = f.low ? [] : [A, B].map((P) => loopFb(f, 'vfPixelFire', P.x, P.y - 10, { size: th * 3, depth: D.ground + 0.75, tint: col })).filter(Boolean);
    for (const fr of fires) e.add(fr);
    let sparkAcc = 0;
    const band = e.gfx(D.ground + 0.55, true), nx = -Math.sin(a), ny = Math.cos(a), hw = th * 0.85; // readable laser: a lit lane with bright edges and core
    e.upd = (dt) => {
      e.flash = Math.max(0, e.flash - dt * 3);
      const hot = e.flash > 0.25 ? 0xff4fa3 : col; // pink flash on every hit
      line.setTint(hot); post1.setTint(hot); post2.setTint(hot);
      const bk = e.vis * (0.75 + 0.25 * Math.sin(e.t / 70));
      band.clear();
      band.fillStyle(hot, Math.min(0.5, 0.22 * bk + e.flash * 0.25));
      band.beginPath(); band.moveTo(A.x + nx * hw, A.y + ny * hw); band.lineTo(B.x + nx * hw, B.y + ny * hw); band.lineTo(B.x - nx * hw, B.y - ny * hw); band.lineTo(A.x - nx * hw, A.y - ny * hw); band.closePath(); band.fillPath();
      band.lineStyle(3, hot, Math.min(1, 0.9 * bk));
      band.lineBetween(A.x + nx * hw, A.y + ny * hw, B.x + nx * hw, B.y + ny * hw); band.lineBetween(A.x - nx * hw, A.y - ny * hw, B.x - nx * hw, B.y - ny * hw);
      band.lineStyle(6, 0xffffff, Math.min(1, 0.9 * bk)); band.lineBetween(A.x, A.y, B.x, B.y);
      band.lineStyle(3, hot, Math.min(1, bk)); band.strokeCircle(A.x, A.y, hw * 0.9); band.strokeCircle(B.x, B.y, hw * 0.9);
      for (const fr of fires) fr.setAlpha(0.8 * e.vis);
      const fl = 0.7 + 0.3 * Math.sin(e.t / 38) * Math.cos(e.t / 91), k = e.vis * (fl + e.flash * 0.6);
      line.setDisplaySize(th * (1.2 + e.flash), len).setAlpha(Math.min(1, 0.75 * k));
      const ps = th * (2.6 + e.flash * 1.4) * (1 + 0.1 * Math.sin(e.t / 120));
      post1.setDisplaySize(ps, ps).setAlpha(Math.min(1, k)); post2.setDisplaySize(ps, ps).setAlpha(Math.min(1, k));
      sparkAcc += dt;
      if (sparkAcc > (f.low ? 0.3 : 0.14) && f.onScreen(A.x, A.y, len)) {
        sparkAcc = 0;
        const t = Math.random();
        f.part(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t, { tex: K('spark_05'), tint: 0xffffff, add: true, rot: rnd(0, TAU), s0: 46, s1: 6, a0: 0.9, life: 0.2, depth: D.ground + 0.8 });
      }
    };
    e.end = (boom) => { if (boom) { sp(f, 'star_08', A.x, A.y, { size: 30, size1: 120, life: 300, tint: col }); sp(f, 'star_08', B.x, B.y, { size: 30, size1: 120, life: 300, tint: col }); } };
  },

  // Stack E: two pulsing twirl rings (+ ringBlue flipbook), a dotted line between them, cyan when allies-only.
  portal(f, m, e) {
    e.kind = 'portal'; e.filter = m.filter || 'open';
    const base = colOf(m.color, 0x5cc8ff), r = clamp(m.r || 70, 30, 160), ends = [];
    const g = e.gfx(D.ground + 0.4, true);
    const addEnd = (x, y) => {
      const ring = e.img('twirl_02', base, true, D.ground + 0.5), core = e.img('circle_05', 0xffffff, true, D.ground + 0.45);
      const fbs = f.low ? null : loopFb(f, 'vfVortex', x, y, { size: r * 2.6, depth: D.ground + 0.55, a: 0.8, tint: base });
      if (fbs) e.add(fbs);
      ring.setPosition(x, y); core.setPosition(x, y);
      ends.push({ x, y, ring, core, fbs });
    };
    e.firstOid = m.oid;
    // B arrives as its own obj (oid = B, pair = A) and A is re-emitted (same oid, pair = B): only B adds an end.
    e.setB = (mm) => {
      if (ends.length < 2) {
        if (Number.isFinite(mm.x2) && Number.isFinite(mm.y2)) addEnd(mm.x2, mm.y2);
        else if (mm.oid !== e.firstOid && Number.isFinite(mm.x) && Number.isFinite(mm.y)) addEnd(mm.x, mm.y);
      }
      if (Number.isFinite(mm.ms) && mm.ms > 0) { e.ms = mm.ms; e.t = 0; }
      if (mm.filter) e.filter = mm.filter;
    };
    addEnd(m.x, m.y);
    if (Number.isFinite(m.x2) && Number.isFinite(m.y2)) addEnd(m.x2, m.y2);
    e.upd = () => {
      const tint = e.filter === 'allies' ? 0x7ee8ff : base, pulse = 1 + 0.08 * Math.sin(e.t / 160);
      ends.forEach((n, i) => {
        n.ring.setTint(tint).setDisplaySize(r * 2.2 * pulse, r * 2.2 * pulse).setRotation((i ? -1 : 1) * e.t / 420).setAlpha(0.9 * e.vis);
        n.core.setDisplaySize(r * 1.1 * pulse, r * 1.1 * pulse).setAlpha(0.35 * e.vis).setTint(tint);
        n.fbs?.setTint(tint).setAlpha(0.8 * e.vis);
      });
      g.clear();
      if (ends.length === 2 && f.onScreen(ends[0].x, ends[0].y, 1500)) {
        const [a, b] = ends, len = Math.hypot(b.x - a.x, b.y - a.y), n = Math.min(40, Math.floor(len / 30));
        g.fillStyle(tint, 0.38 * e.vis);
        for (let i = 1; i < n; i++) g.fillCircle(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n, 3);
      }
    };
    e.end = () => { for (const n of ends) sp(f, 'circle_03', n.x, n.y, { size: r, size1: r * 2.4, life: 360, tint: base }); };
  },

  // Ops E: a tall light pillar and expanding gold rings.
  beacon(f, m, e) {
    e.kind = 'beacon';
    const x = m.x, y = m.y, r = clamp(m.r || 90, 40, 200), col = 0xffd23f;
    const pillar = e.img('light_01', col, true, D.fx), glow = e.img('light_02', col, true, D.ground + 0.5), ring = e.img('circle_03', col, true, D.ground + 0.6);
    pillar.setOrigin(0.5, 1).setPosition(x, y);
    glow.setPosition(x, y);
    const fbs = f.low ? null : loopFb(f, 'vfEldenRing', x, y, { size: r * 2.6, depth: D.ground + 0.55, a: 0.8, tint: 0xffd23f });
    if (fbs) e.add(fbs);
    const base = f.low ? null : loopFb(f, 'divineCloud', x, y, { size: r * 2, depth: D.ground + 0.52, a: 0.45, tint: 0xbfe0ff, rate: 12 });
    if (base) e.add(base);
    e.upd = () => {
      base?.setAlpha(0.45 * e.vis);
      const p = 0.5 + 0.5 * Math.sin(e.t / 260);
      pillar.setDisplaySize(70 + 14 * p, 380).setAlpha((0.45 + 0.2 * p) * e.vis);
      glow.setDisplaySize(r * 2.2, r * 2.2).setAlpha(0.35 * e.vis);
      const k = (e.t % 1100) / 1100;
      ring.setDisplaySize(r * (0.6 + 1.6 * k), r * (0.6 + 1.6 * k)).setAlpha((1 - k) * 0.85 * e.vis);
      fbs?.setAlpha(0.8 * e.vis);
    };
    // consumed early (teleport / recall arrival) = gold burst; plain expiry = quiet fade
    e.end = () => {
      if (e.t < e.ms - 400) { sp(f, 'star_09', x, y - 20, { size: 40, size1: 300, life: 400, tint: col }); sp(f, 'circle_03', x, y, { size: 40, size1: r * 3, life: 520, tint: col }); fb(f, 'impactGold', x, y - 20, { size: 220, life: 600 }); }
    };
  },

  // Lint: a map comment bubble (orange !, red stop, green check); enemies stop seeing it after hideAfterMs.
  pin(f, m, e) {
    e.kind = 'pin'; e.fade = 300;
    const look = PIN_LOOK[m.pin] || PIN_LOOK.nit, x = m.x, y = m.y, r = clamp(m.r || 90, 30, 200);
    const kindN = PIN_LOOK[m.pin] ? m.pin : 'nit';
    // nit: orange comment bubble (window_04) + "!" and a flickering arming ring; block: red octagon (circle_05 + star_04) that drops with a shake;
    // suggest: green check bubble (window_01) with a sparkGold glint, bobbing gently.
    const bubTex = kindN === 'nit' ? 'window_04' : kindN === 'block' ? 'circle_05' : 'window_01';
    if (kindN === 'block') { e.dropT = 0; }
    if (kindN === 'suggest' && !f.low) { const gl2 = loopFb(f, 'sparkGold', x, y - 52, { size: 90, depth: D.fxTop - 2, tint: look.c, a: 0.6 }); if (gl2) e.add(gl2); }
    const hideMs = Number(m.hidden) > 1 ? Number(m.hidden) : (m.hiddenAfterMs > 0 ? m.hiddenAfterMs : (m.hideAfterMs > 0 ? m.hideAfterMs : 0));
    const enemy = !!m.team && m.team !== f.scene.myTeam;
    const ground = e.img('circle_03', look.c, true, D.ground + 0.5), bub = e.img(bubTex, look.c, true, D.fxTop - 1);
    const star = kindN === 'block' ? e.img('star_04', 0xffffff, true, D.fxTop - 0.9) : null;
    ground.setPosition(x, y);
    const txt = e.add(f.scene.add.text(x, y - 52, look.g, { fontFamily: 'Arial, sans-serif', fontSize: '24px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5).setDepth(D.fxTop));
    e.upd = () => {
      let vis = e.vis;
      if (enemy && hideMs > 0 && e.t > hideMs) vis *= Math.max(0, 1 - (e.t - hideMs) / 400);
      const armed = e.t > 400, bob = kindN === 'block' ? 0 : Math.sin(e.t / 300) * (kindN === 'suggest' ? 4 : 2);
      const drop = kindN === 'block' ? Math.max(0, 1 - e.t / 220) * 160 : 0, shk = kindN === 'block' && e.t > 220 && e.t < 380 ? rnd(-3, 3) : 0;
      const flick = kindN === 'nit' && !armed ? (Math.sin(e.t / 40) > 0 ? 0.35 : 0.05) : (armed ? 0.3 + 0.12 * Math.sin(e.t / 240) : 0.12);
      ground.setDisplaySize(r * 2, r * 2).setAlpha(flick * vis);
      bub.setPosition(x + shk, y - 52 + bob - drop).setDisplaySize(48, 48).setAlpha(0.95 * vis);
      star?.setPosition(x + shk, y - 52 - drop).setDisplaySize(34, 34).setRotation(Math.PI / 8).setAlpha(0.8 * vis);
      txt.setPosition(x + shk, y - 52 + bob - drop).setAlpha(vis).setVisible(vis > 0.02);
    };
  },

  // Tester Q / Brick Q: sniper laser sight + converging ring, or dust + shoulder glow, while the key is held.
  charge(f, m, e) {
    const sk = f.scene._skillOf?.(m), st = typeof sk?.fx === 'string' ? sk.fx : '';
    const col = colOf(m.color, colOf(sk?.color, 0xff5e5e));
    const minMs = m.minMs > 0 ? m.minMs : 200, maxMs = Math.max(minMs + 1, m.maxMs || 1400);
    e.ms = maxMs + 1500; e.fade = 200; e.frac = 0; e.aim = 0;
    const g = e.gfx(D.fx, true), ring = e.img('circle_05', col, true, D.fxTop), glow = e.img('light_02', col, true, D.fx);
    let acc = 0;
    e.upd = (dt) => {
      const p = f.posOf(m.sid);
      ring.setVisible(!!p); glow.setVisible(!!p); g.clear();
      if (!p) return;
      const fr = clamp((e.t - minMs) / (maxMs - minMs), 0, 1), a = aimAng(f, m.sid), dx = Math.cos(a), dy = Math.sin(a);
      e.frac = fr; e.aim = a; e.px = p.x; e.py = p.y;
      if (st === 'sniperCharge') {
        const len = 500 + 1000 * fr; // ponytail: mirrors hold.scale.range roughly (600..1500); purely cosmetic
        g.lineStyle(1 + 4 * fr, 0xff2a2a, (0.12 + 0.2 * fr) * e.vis);
        g.beginPath(); g.moveTo(p.x + dx * 30, p.y + dy * 30); g.lineTo(p.x + dx * len, p.y + dy * len); g.strokePath();
        g.lineStyle(1 + 1.5 * fr, 0xff6a5a, (0.3 + 0.55 * fr) * e.vis);
        g.beginPath(); g.moveTo(p.x + dx * 30, p.y + dy * 30); g.lineTo(p.x + dx * len, p.y + dy * len); g.strokePath();
        const s = 170 - 125 * fr;
        ring.setPosition(p.x + dx * 46, p.y + dy * 46).setDisplaySize(s, s).setRotation(e.t / 260).setAlpha((0.4 + 0.6 * fr) * e.vis).setTint(0xff3b30);
        glow.setPosition(p.x + dx * 46, p.y + dy * 46).setDisplaySize(30 + 70 * fr, 30 + 70 * fr).setAlpha(0.4 * fr * e.vis).setTint(0xff6a5a);
      } else if (st === 'bashCharge') {
        glow.setPosition(p.x + dx * 26, p.y - 34).setDisplaySize(36 + 90 * fr, 36 + 90 * fr).setAlpha((0.35 + 0.5 * fr) * e.vis).setTint(0xffd23f);
        ring.setPosition(p.x, p.y + 44).setDisplaySize(150 - 70 * fr, 150 - 70 * fr).setAlpha((0.3 + 0.5 * fr) * e.vis).setTint(0xb5a58a);
        acc += dt;
        if (acc > (f.low ? 0.3 : 0.12) && f.onScreen(p.x, p.y, 100)) {
          acc = 0;
          f.part(p.x - dx * 20 + rnd(-14, 14), p.y + 40, { tex: K('dirt_02'), tint: 0xb5a58a, vx: -dx * 40 + rnd(-30, 30), vy: -20 - rnd(0, 20), s0: 24, s1: 70, a0: 0.55, life: 0.5 });
        }
      } else {
        const s = 150 - 100 * fr;
        ring.setPosition(p.x, p.y - 40).setDisplaySize(s, s).setRotation(e.t / 300).setAlpha((0.4 + 0.5 * fr) * e.vis).setTint(col);
        glow.setPosition(p.x, p.y - 40).setDisplaySize(40 + 60 * fr, 40 + 60 * fr).setAlpha(0.35 * fr * e.vis).setTint(col);
      }
    };
    // release (chargeEnd): the bolt's thickness and brightness scale with the charge fraction
    e.rel = () => {
      if (st !== 'sniperCharge' || e.px == null) return;
      const fr = e.frac, len = 600 + 900 * fr, a = e.aim, x0 = e.px + Math.cos(a) * 30, y0 = e.py + Math.sin(a) * 30;
      const g2 = f.scene.add.graphics().setDepth(D.fxTop).setBlendMode(1);
      g2.lineStyle(6 + 20 * fr, 0xff3b30, 0.55 + 0.3 * fr); g2.beginPath(); g2.moveTo(x0, y0); g2.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len); g2.strokePath();
      g2.lineStyle(2 + 8 * fr, 0xffffff, 0.8 + 0.2 * fr); g2.beginPath(); g2.moveTo(x0, y0); g2.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len); g2.strokePath();
      f.scene.tweens.add({ targets: g2, alpha: 0, duration: 240 + 160 * fr, onComplete: () => g2.destroy() });
      sp(f, 'flare_01', x0, y0, { size: 60 + 120 * fr, size1: 20, life: 240, tint: 0xffffff });
    };
  },

  // Ops W: an animated beam between the bodies, + particles flow toward the ally, thicker on every heal tick.
  tether(f, m, e) {
    const col = colOf(m.color, 0x7ed957), g = e.gfx(D.fxTop - 0.5, true);
    e.ms = m.ms > 0 ? m.ms : 6000;
    let acc = 0;
    e.upd = (dt) => {
      g.clear();
      const a = f.posOf(m.sid), b = f.posOf(m.to);
      if (!a || !b || (!f.onScreen(a.x, a.y, 900) && !f.onScreen(b.x, b.y, 900))) return;
      const k = (e.t % 500) / 500, th = 3 + 5 * (1 - k); // 500 ms = Ops W tickMs (thickens each heal tick)
      g.lineStyle(th * 2.6, col, 0.16 * e.vis); zig(g, a.x, a.y, b.x, b.y, 10, 4, e.t / 130);
      g.lineStyle(th, col, 0.7 * e.vis); zig(g, a.x, a.y, b.x, b.y, 10, 5, e.t / 110);
      g.lineStyle(1.5, 0xffffff, 0.9 * e.vis); zig(g, a.x, a.y, b.x, b.y, 10, 5, e.t / 110);
      acc += dt;
      if (acc > (f.low ? 0.32 : 0.16)) {
        acc = 0;
        f.part(a.x, a.y, { tex: K('symbol_01'), tint: col, vx: (b.x - a.x) * 2, vy: (b.y - a.y) * 2, s0: 22, s1: 10, a0: 0.9, life: 0.5, depth: D.fxTop });
      }
      const tk = Math.floor(e.t / 500);
      if (tk !== e.lastTick) { e.lastTick = tk; if (!f.low) fb(f, 'vfAnima', b.x, b.y - 30, { size: 150, life: 500, tint: col }); } // pulse on the ally every heal tick
    };
  },

  // Hira W: a lanyard rope between two allies with a knot that pulses on `linkShare`.
  link(f, m, e) {
    const col = colOf(m.color, 0xffb088), g = e.gfx(D.fxTop - 0.6, false), knot = e.img('window_01', 0xffffff, true, D.fxTop);
    e.ms = m.ms > 0 ? m.ms : 6000; e.pulse = 0;
    e.upd = (dt) => {
      g.clear(); e.pulse = Math.max(0, e.pulse - dt * 2.5);
      const a = f.posOf(m.a), b = f.posOf(m.b);
      knot.setVisible(!!(a && b));
      if (!a || !b || (!f.onScreen(a.x, a.y, 1000) && !f.onScreen(b.x, b.y, 1000))) { knot.setVisible(false); return; }
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + 26 + Math.hypot(b.x - a.x, b.y - a.y) * 0.05;
      g.lineStyle(4 + 4 * e.pulse, col, (0.85 + 0.15 * e.pulse) * e.vis);
      g.beginPath(); g.moveTo(a.x, a.y);
      for (let i = 1; i <= 14; i++) { const t = i / 14, u = 1 - t; g.lineTo(u * u * a.x + 2 * u * t * mx + t * t * b.x, u * u * a.y + 2 * u * t * my + t * t * b.y); }
      g.strokePath();
      const kx = 0.25 * a.x + 0.5 * mx + 0.25 * b.x, ky = 0.25 * a.y + 0.5 * my + 0.25 * b.y, ks = 26 + 22 * e.pulse;
      knot.setPosition(kx, ky).setDisplaySize(ks, ks).setTint(col).setAlpha(e.vis);
    };
  },

  // Zero Q: a dark silhouette is thrown to the spot and lands as a translucent purple clone (smoke outline).
  shadow(f, m, e) {
    const x = m.x, y = m.y, p0 = f.posOf(m.sid);
    const v = f.scene.views?.champs?.get(m.sid), flip = !!(v && v.facing < 0);
    e.ms = m.ms > 0 ? m.ms : 6000; e.fade = 400;
    const smoke = e.img('smoke_07', 0x3a2a6a, true, D.entity + 4);
    smoke.setPosition(x, y - 40).setDisplaySize(130, 150).setAlpha(0);
    const clone = ghost(f, x, y, 0xa77bff, 0, flip, D.entity + 4.1);
    if (clone) e.add(clone);
    const thrown = ghost(f, p0 ? p0.x : x, p0 ? p0.y + 46 : y, 0x1a1030, 0.85, flip, D.fxTop);
    if (thrown) e.add(thrown);
    let landed = !thrown || !p0 || Math.hypot(p0.x - x, p0.y + 46 - y) < 60;
    const sx = p0 ? p0.x : x, sy = p0 ? p0.y + 46 : y;
    e.upd = () => {
      if (!landed) {
        const k = clamp(e.t / 260, 0, 1);
        thrown.setPosition(sx + (x - sx) * k, sy + (y - sy) * k - Math.sin(k * Math.PI) * 90).setRotation(k * 5);
        if (k >= 1) { landed = true; thrown.destroy(); sp(f, 'smoke_04', x, y - 30, { size: 50, size1: 160, life: 500, tint: 0x14142a, add: false, a0: 0.7 }); sp(f, 'star_09', x, y - 40, { size: 30, size1: 120, life: 280, tint: 0xb084ff }); fbx(f, 'vfPuffStars', x, y - 30, { size: 170, life: 700, tint: 0xb084ff }); }
        return;
      }
      const bob = Math.sin(e.t / 380) * 2;
      clone?.setPosition(x, y + bob).setAlpha((0.4 + 0.08 * Math.sin(e.t / 200)) * e.vis);
      smoke.setAlpha(0.32 * e.vis).setRotation(e.t / 1800);
    };
    e.end = () => { sp(f, 'smoke_07', x, y - 40, { size: 70, size1: 190, life: 520, tint: 0x14142a, add: false, a0: 0.7 }); };
  },

  // Sprint W: a clock ring around the caster draining over `ms` (timeboxEnd flies the refunded slots to the HUD).
  timebox(f, m, e) {
    e.ms = m.ms > 0 ? m.ms : 4000;
    const g = e.gfx(D.fxTop - 0.5, false);
    e.upd = () => {
      g.clear();
      const p = f.posOf(m.sid);
      if (!p || !f.onScreen(p.x, p.y, 200)) return;
      const left = clamp(1 - e.t / e.ms, 0, 1), r = 66, a0 = -Math.PI / 2;
      g.lineStyle(5, 0x000000, 0.25 * e.vis); g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.strokePath();
      g.lineStyle(5, 0xffd23f, 0.95 * e.vis); g.beginPath(); g.arc(p.x, p.y, r, a0, a0 + TAU * left); g.strokePath();
      g.lineStyle(3, 0xffffff, 0.9 * e.vis); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + Math.cos(a0 + TAU * left) * (r - 6), p.y + Math.sin(a0 + TAU * left) * (r - 6)); g.strokePath();
      g.fillStyle(0xffd23f, 0.9 * e.vis); g.fillCircle(p.x, p.y, 4);
    };
  },

  // Cache W: a ghost duplicate outline behind the caster with drifting data bits.
  echo(f, m, e) {
    e.ms = m.ms > 0 ? m.ms : 5000;
    const gh = ghost(f, 0, 0, 0x7ee8ff, 0.3, false, D.entity + 0.5);
    if (gh) e.add(gh);
    const bit = e.img('window_01', 0x7ee8ff, true, D.fxTop);
    let acc = 0;
    e.upd = (dt) => {
      const p = f.posOf(m.sid);
      gh?.setVisible(!!p); bit.setVisible(!!p);
      if (!p) return;
      const v = f.scene.views?.champs?.get(m.sid);
      gh?.setPosition(p.x - 26, p.y + 42).setFlipX(!!(v && v.facing < 0)).setAlpha((0.22 + 0.1 * Math.sin(e.t / 150)) * e.vis);
      bit.setPosition(p.x - 26, p.y - 50 - ((e.t / 6) % 40)).setDisplaySize(14, 14).setAlpha(0.8 * e.vis);
      acc += dt;
      if (acc > (f.low ? 0.4 : 0.2) && f.onScreen(p.x, p.y, 100)) { acc = 0; f.part(p.x - 26 + rnd(-20, 20), p.y - rnd(0, 60), { tex: K('spark_07'), tint: 0x7ee8ff, add: true, vy: -40, vr: 3, s0: 12, s1: 4, a0: 0.8, life: 0.5 }); }
    };
  },

  // Swipe E: a ring that fills over `ms`, a gold arc at the perfect window [from, to]; reloadEnd flashes the result.
  reload(f, m, e) {
    e.ms = m.ms > 0 ? m.ms : 1700; e.fade = 120;
    const g = e.gfx(D.fxTop - 0.5, false), from = clamp((m.from || 0) / e.ms, 0, 1), to = clamp((m.to || 0) / e.ms, 0, 1);
    e.endMsg = (mm) => {
      const p = e.lastP;
      if (!p) return;
      if (mm.perfect) { sp(f, 'star_06', p.x, p.y, { size: 40, size1: 190, life: 340, tint: 0xffffff }); sp(f, 'circle_03', p.x, p.y, { size: 70, size1: 190, life: 420, tint: 0xffd23f }); }
      else if (mm.jam) { for (let i = 0; i < N(f, 6); i++) sp(f, 'spark_01', p.x + rnd(-24, 24), p.y + rnd(-20, 20), { size: 50, size1: 16, rot: rnd(0, TAU), life: 340, delay: i * 30, tint: 0xff3b3b }); }
      else sp(f, 'circle_03', p.x, p.y, { size: 60, size1: 140, life: 320, tint: 0xbfe0ff });
    };
    e.upd = () => {
      g.clear();
      const p = f.posOf(m.sid);
      if (!p) return;
      e.lastP = { x: p.x, y: p.y };
      if (!f.onScreen(p.x, p.y, 200)) return;
      const r = 58, a0 = -Math.PI / 2, prog = clamp(e.t / e.ms, 0, 1);
      g.lineStyle(7, 0x000000, 0.3 * e.vis); g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.strokePath();
      g.lineStyle(5, 0xbfe0ff, 0.9 * e.vis); g.beginPath(); g.arc(p.x, p.y, r, a0, a0 + TAU * prog); g.strokePath();
      if (to > from) { g.lineStyle(9, 0xffd23f, e.vis); g.beginPath(); g.arc(p.x, p.y, r, a0 + TAU * from, a0 + TAU * to); g.strokePath(); }
    };
  },
};

// Model E (v6.1 `obj kind:'barrier'`): a row of tentacles grows outward from the centre of the segment in 350 ms over a dirt base.
LIVE.barrier = function barrier(f, m, e) {
  e.kind = 'barrier'; e.fade = 400;
  const A = { x: m.x, y: m.y }, B = { x: Number.isFinite(m.x2) ? m.x2 : m.x + 200, y: Number.isFinite(m.y2) ? m.y2 : m.y };
  const len = Math.hypot(B.x - A.x, B.y - A.y) || 1, a = ang(A.x, A.y, B.x, B.y), th = clamp(m.thick || 40, 16, 90), mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  const n = clamp(Math.round(len / 90), 2, f.low ? 4 : 8), col = colOf(m.color, 0x6cff7a);
  const base = e.img('dirt_01', 0x6b4a2a, false, D.ground + 0.5);
  base.setPosition(mx, my).setRotation(a);
  const node = [];
  for (let i = 0; i < n; i++) {
    const d = ((i + 0.5) / n - 0.5) * len, px = mx + Math.cos(a) * d, py = my + Math.sin(a) * d;
    const s = f.low ? e.img('trace_04', col, true, D.fx) : loopFb(f, 'vfTentacles', px, py - 30, { size: th * 3, depth: D.fx, tint: col, a: 0 });
    if (!s) continue;
    if (!f.low) e.add(s); else s.setPosition(px, py - th * 0.5);
    node.push({ s, k: Math.abs(d) / (len / 2) });
  }
  const lane = e.gfx(D.ground + 0.52, true), nx = -Math.sin(a), ny = Math.cos(a), hw = th * 0.9; // a lit green lane so the solid wall reads at a glance
  e.upd = () => {
    base.setDisplaySize(len + 40, th * 1.6).setAlpha(0.8 * e.vis);
    lane.clear();
    const lk = e.vis * (0.7 + 0.3 * Math.sin(e.t / 140));
    lane.fillStyle(col, 0.2 * lk);
    lane.beginPath(); lane.moveTo(A.x + nx * hw, A.y + ny * hw); lane.lineTo(B.x + nx * hw, B.y + ny * hw); lane.lineTo(B.x - nx * hw, B.y - ny * hw); lane.lineTo(A.x - nx * hw, A.y - ny * hw); lane.closePath(); lane.fillPath();
    lane.lineStyle(4, col, 0.95 * lk); lane.lineBetween(A.x + nx * hw, A.y + ny * hw, B.x + nx * hw, B.y + ny * hw); lane.lineBetween(A.x - nx * hw, A.y - ny * hw, B.x - nx * hw, B.y - ny * hw);
    lane.lineStyle(3, 0xffffff, 0.6 * lk); lane.lineBetween(A.x, A.y, B.x, B.y);
    for (const o of node) {
      const g = clamp((e.t - o.k * 250) / 100, 0, 1), sz = th * 3 * g;
      if (f.low) o.s.setDisplaySize(th * 0.5, th * 2.4 * g).setAlpha(0.8 * e.vis); else o.s.setDisplaySize(sz, sz).setAlpha(0.9 * g * e.vis);
    }
  };
  fbx(f, 'impactLeaf', mx, my - 20, { size: len, life: 700, tint: col }); // planting burst
  e.end = (boom) => { if (boom) sp(f, 'star_08', mx, my, { size: len * 0.3, size1: len * 0.9, life: 320, tint: col }); };
};

// ── one-shot kit fx (called by MobaFx.handle) ──
export const V6 = {
  shot(f, m) { // Volt turret hitscan
    if (![m.x, m.y, m.tx, m.ty].every(Number.isFinite) || (!f.onScreen(m.x, m.y, 300) && !f.onScreen(m.tx, m.ty, 300))) return;
    const col = colOf(m.color, 0x00e5ff), a = ang(m.x, m.y, m.tx, m.ty), len = Math.hypot(m.tx - m.x, m.ty - m.y);
    sp(f, 'trace_07', (m.x + m.tx) / 2, (m.y + m.ty) / 2 - 30, { size: len, sx: 0.12, rot: a - Math.PI / 2, life: 150, tint: col, a0: 0.9 });
    sp(f, 'muzzle_01', m.x + Math.cos(a) * 24, m.y - 30 + Math.sin(a) * 24, { size: 70, rot: a + Math.PI / 2, life: 120, tint: 0xffe2a0 });
    sp(f, 'spark_02', m.tx, m.ty - 30, { size: 60, life: 160, tint: col });
  },
  tp(f, m) { // portal use: streak + pop at the exit
    if (![m.x0, m.y0, m.x1, m.y1].every(Number.isFinite)) return;
    const a = ang(m.x0, m.y0, m.x1, m.y1), len = Math.hypot(m.x1 - m.x0, m.y1 - m.y0);
    if (f.onScreen(m.x0, m.y0, 300)) sp(f, 'circle_03', m.x0, m.y0, { size: 140, size1: 20, life: 260, tint: 0x5cc8ff });
    if (len < 1800) sp(f, 'trace_07', (m.x0 + m.x1) / 2, (m.y0 + m.y1) / 2 - 40, { size: len, sx: 0.1, rot: a - Math.PI / 2, life: 260, tint: 0x9fe4ff });
    if (f.onScreen(m.x1, m.y1, 300)) {
      sp(f, 'twirl_02', m.x1, m.y1 - 20, { size: 40, size1: 200, spin: TAU, life: 420, tint: 0x5cc8ff });
      sp(f, 'star_09', m.x1, m.y1 - 40, { size: 30, size1: 150, life: 320, tint: 0xffffff });
    }
  },
  rewind(f, m) { // Pixel E / Pager R: ghosts slide along the trails, reverse spiral at the end point
    const roll = champOf(f, m.sid) === 'oncall', col = colOf(m.color, roll ? 0x39c2ff : 0xb084ff);
    const list = Array.isArray(m.list) ? m.list.slice(0, 6) : [], p = f.posOf(m.sid);
    if (p && m.r > 0 && f.onScreen(p.x, p.y, m.r + 200)) sp(f, 'circle_03', p.x, p.y + 46, { size: m.r * 2, size1: m.r * 0.3, life: 600, tint: col, ease: 'Quad.easeIn', depth: GROUND });
    for (const it of list) {
      if (!it || ![it.x0, it.y0, it.x1, it.y1].every(Number.isFinite)) continue;
      if (!f.onScreen(it.x0, it.y0, 500) && !f.onScreen(it.x1, it.y1, 500)) continue;
      const a = ang(it.x0, it.y0, it.x1, it.y1), len = Math.hypot(it.x1 - it.x0, it.y1 - it.y0);
      const gh = ghost(f, it.x0, it.y0, col, 0.45);
      if (gh) f.scene.tweens.add({ targets: gh, x: it.x1, y: it.y1, alpha: 0.05, duration: 520, ease: 'Cubic.easeInOut', onComplete: () => gh.destroy() });
      if (len > 20) sp(f, 'trace_03', (it.x0 + it.x1) / 2, (it.y0 + it.y1) / 2 - 30, { size: len, sx: 0.2, rot: a - Math.PI / 2, life: 700, tint: col, a0: 0.5 });
      lineSteps(it.x0, it.y0, it.x1, it.y1, N(f, 4), (x, y, k) => sp(f, 'smoke_07', x, y - 40, { size: 50, size1: 20, life: 380, delay: k * 420, tint: col, a0: 0.5 }));
      sp(f, 'twirl_01', it.x1, it.y1 - 30, { size: 190, size1: 20, spin: -TAU, life: 420, delay: 480, tint: col, a0: 0.9 });
      sp(f, 'circle_03', it.x1, it.y1, { size: 30, size1: roll ? 220 : 160, life: 380, delay: 760, tint: roll ? 0x39c2ff : 0xffffff });
      sp(f, 'star_09', it.x1, it.y1 - 40, { size: 30, size1: 130, life: 280, delay: 780, tint: 0xffffff });
      if (!roll) { // Pixel E: spark streaks run back along the trail, a wheel spins at the landing spot, white flash
        if (len > 20) sp(f, 'spark_06', (it.x0 + it.x1) / 2, (it.y0 + it.y1) / 2 - 30, { size: len, sx: 0.5, rot: a, life: 520, tint: 0xffffff, a0: 0.7 });
        fbx(f, 'vfWheel', it.x1, it.y1, { size: 200, life: 700, delay: 560, tint: col, depth: G });
      }
    }
    if (roll && p && f.onScreen(p.x, p.y, 300)) { // Pager: a clock ring whose hands spin backwards
      sp(f, 'circle_03', p.x, p.y, { size: 150, a0: 0.9, life: 700, tint: 0xffffff });
      sp(f, 'trace_03', p.x, p.y, { size: 80, sx: 0.07, rot: 0, spin: -TAU * 2, life: 700, tint: 0x9fc4ff });
      sp(f, 'trace_03', p.x, p.y, { size: 56, sx: 0.07, rot: 1, spin: -TAU * 0.4, life: 700, tint: 0xffffff });
    }
  },
  timeboxEnd(f, m) { // refunded slot icons fly back to the HUD (approximate bottom-centre slot row)
    const p = f.posOf(m.sid), s = f.scene, cam = s.cameras.main;
    const slots = Array.isArray(m.refund) ? m.refund.slice(0, 4) : [];
    if (p && f.onScreen(p.x, p.y, 200)) sp(f, 'circle_03', p.x, p.y, { size: 70, size1: 170, life: 400, tint: 0xffd23f });
    if (!p || !slots.length) return;
    const sx = (p.x - cam.worldView.x) * cam.zoom, sy = (p.y - cam.worldView.y) * cam.zoom;
    slots.forEach((sl, i) => {
      const t = s.add.text(sx, sy, String(sl).toUpperCase(), { fontFamily: 'Arial, sans-serif', fontSize: '22px', fontStyle: 'bold', color: '#ffd23f', stroke: '#000000', strokeThickness: 4 })
        .setOrigin(0.5).setScrollFactor(0).setDepth(56);
      s.tweens.add({ targets: t, x: 540 + i * 66, y: 660, scale: 0.8, alpha: 0.2, duration: 650, delay: i * 80, ease: 'Cubic.easeIn', onComplete: () => t.destroy() });
    });
  },
  echoFire(f, m) {
    const p = f.posOf(m.sid);
    if (!p || !f.onScreen(p.x, p.y, 200)) return;
    sp(f, 'circle_03', p.x, p.y, { size: 40, size1: 190, life: 400, tint: 0x7ee8ff });
    sp(f, 'star_09', p.x, p.y - 20, { size: 30, size1: 140, life: 300, tint: 0xffffff });
    for (let i = 0; i < N(f, 6); i++) sp(f, 'window_01', p.x, p.y - 20, { size: 16, size1: 6, dx: rnd(-90, 90), dy: rnd(-90, 30), spin: 3, life: 480, tint: 0x7ee8ff });
  },
  pkg(f, m) {
    const p = f.posOf(m.sid);
    if (!p || !f.onScreen(p.x, p.y, 200)) return;
    if (m.on) BUFF.pickup(f, { x: p.x, y: p.y + 46 });
    else { gl(f, '📦', p.x, p.y - 80, { size: 34, life: 600, dy: 30, a1: 0, s1: 0.6 }); sp(f, 'smoke_04', p.x, p.y - 20, { size: 30, size1: 90, life: 420, tint: 0xffffff, add: false, a0: 0.4 }); }
  },
  deliver(f, m) { // dash trail with a box, coin burst on arrival, tip text
    if (![m.x0, m.y0, m.x1, m.y1].every(Number.isFinite)) return;
    const tip = clamp(Number(m.tip) || 0, 0, 100);
    lineSteps(m.x0, m.y0, m.x1, m.y1, N(f, 6), (x, y, k) => sp(f, 'trace_07', x, y - 20, { size: 70, sx: 0.12, rot: ang(m.x0, m.y0, m.x1, m.y1) - Math.PI / 2, life: 380, delay: k * 120, tint: 0xffb347 }));
    gl(f, '📦', m.x0, m.y0 - 60, { size: 36, dx: m.x1 - m.x0, dy: m.y1 - m.y0, life: 280, a1: 1, ease: 'Quad.easeIn' });
    for (let i = 0; i < N(f, 8); i++) sp(f, 'star_06', m.x1, m.y1 - 40, { size: 18, size1: 40, dx: rnd(-80, 80), dy: rnd(-110, -20), spin: rnd(-3, 3), life: 600, delay: 260 + i * 25, tint: 0xffd23f });
    sp(f, 'circle_03', m.x1, m.y1, { size: 40, size1: 160, life: 420, delay: 260, tint: 0xffd23f });
    gl(f, `${m.struct ? 'Repair ' : 'Tip '}${Math.round(tip)}%`, m.x1, m.y1 - 100, { size: 20, bold: true, color: '#ffe36a', dy: -40, life: 1000, delay: 280 });
  },
  serve(f, m) { // remember the outcome style so the inner circle / zone / buff fx (slot style 'serve') pick it up
    f.serveStyle = typeof m.fx === 'string' ? m.fx : 'servePlain'; f.serveAt = f.scene.time.now;
    const x = Number.isFinite(m.x) ? m.x : null, p = f.posOf(m.sid);
    if (p && f.onScreen(p.x, p.y, 200)) { sp(f, 'smoke_07', p.x, p.y - 40, { size: 30, size1: 120, dy: -50, life: 600, tint: 0xffffff, add: false, a0: 0.45 }); gl(f, '☕', p.x, p.y - 110, { size: 40, life: 800, s0: 0.5, s1: 1.3, dy: -16 }); }
    return x;
  },
  stance(f, m) {
    const p = f.posOf(m.sid);
    if (!p || !f.onScreen(p.x, p.y, 200)) return;
    const ch = champOf(f, m.sid), fn = { cleaner: 'gearSwitch', dev: 'checkout', stack: 'accessToggle' }[ch];
    const c = { x: p.x, y: p.y + 46, name: m.name };
    if (fn) STANCE_FX[fn](f, c); else sp(f, 'circle_03', c.x, c.y, { size: 40, size1: 170, life: 420, tint: 0xffffff });
  },
  pinBoom(f, m, p, n, prev) { // chain pop: a ring + check burst, connected to the previous pin by a line
    if (!p) return;
    const r = clamp(Number(m.r) || 100, 40, 400), d = n * 90;
    sp(f, 'circle_03', p.x, p.y, { size: r * 0.4, size1: r * 2, life: 420, delay: d, tint: 0xffe08a });
    sp(f, 'star_08', p.x, p.y - 30, { size: 30, size1: r * 1.2, life: 360, delay: d, tint: 0xffffff });
    gl(f, '✓', p.x, p.y - 50, { size: 34, bold: true, color: '#7dff9a', dy: -50, life: 800, delay: d });
    if (prev) {
      const g = f.scene.add.graphics().setDepth(D.fxTop).setBlendMode(1).setAlpha(0);
      g.lineStyle(3, 0xffe08a, 0.9); g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(p.x, p.y); g.strokePath();
      f.scene.tweens.add({ targets: g, alpha: { from: 1, to: 0 }, delay: d, duration: 420, onComplete: () => g.destroy() });
    }
  },
};

// ═════════════════════════ v6.1 visual recipes (docs/02_CHAMPIONS_AND_SKILLS.md [v6.1 numbering] section 7) ═════════════════════════
// Every style below is registered by name through rec(); a recipe = SHAPES helper + primary flipbook/sprite + motion.
// `area` = the v6.1 cone / line / arc messages; flipbooks go through fbx() (skipped on Low effects), counts through N().
const AREA = {};
const TABLES = { circle: CIRCLE, zone: ZONE, dash: DASH, blink: BLINK, buff: BUFF, tgt: TGT, proj: MUZZLE, area: AREA };
const fbx = (f, key, x, y, o) => (f.low ? null : fb(f, key, x, y, o));
/** Register a one-shot style; `layer` replaces the old flipbook layer of that name (none when omitted). */
const rec = (kind, name, fn, layer) => { TABLES[kind][name] = fn; if (FBX[kind]) { if (layer) FBX[kind][name] = layer; else delete FBX[kind][name]; } };
/** A skill whose engine kind is not certain (place / objcmd / allies): same look for circle, zone and buff. */
const recAll = (name, fn, layer) => { rec('circle', name, fn, layer); rec('zone', name, (f, c) => fn(f, { ...c, delay: 0 }), layer && ((f, c) => layer(f, { ...c, delay: 0 }))); rec('buff', name, fn, layer); };
/** Spec angles arrive in degrees (cone/arc `angle`) or radians. */
const toRad = (v, d) => (Number.isFinite(v) ? (v > 6.4 ? (v * Math.PI) / 180 : v) : d);
const alliesNear = (f, x, y, R) => {
  const cs = f.scene.views?.champs;
  if (!cs) return [];
  let team = null, bd = 1e9;
  for (const v of cs.values()) { const d = Math.hypot(v.x - x, v.y - y); if (d < bd) { bd = d; team = v.team; } }
  const out = [];
  if (team != null) for (const v of cs.values()) if (!v.dead && v.team === team && Math.hypot(v.x - x, v.y - y) <= R && out.length < 5) out.push(v);
  return out;
};
const polyG = (g, pts) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fillPath(); g.strokePath(); };
/** Ground telegraph for an area shape: fades in over `delay`, one Graphics, destroyed on completion. */
function teleG(f, delay, color, pts) {
  if (!(delay > 40) || !pts.length) return;
  const g = f.scene.add.graphics().setDepth(GROUND + 0.1).setAlpha(0.1);
  g.fillStyle(color, 0.18); g.lineStyle(2, color, 0.6); polyG(g, pts);
  f.scene.tweens.add({ targets: g, alpha: 1, duration: delay, ease: 'Linear', onComplete: () => g.destroy() });
}
const sector = (x, y, a, r, inner, w, n = 14) => { const pts = []; for (let i = 0; i <= n; i++) { const t = a - w / 2 + (w * i) / n; pts.push([x + Math.cos(t) * r, y + Math.sin(t) * r]); } for (let i = n; i >= 0; i--) { const t = a - w / 2 + (w * i) / n; pts.push([x + Math.cos(t) * inner, y + Math.sin(t) * inner]); } return pts; };
/** `n` evenly spaced points on an arc from a0 to a1; fn(px, py, angle, delayMs, i). */
function arcSteps(f, x, y, rad, a0, a1, n, ms, delay, fn) { for (let i = 0; i < n; i++) { const k = n > 1 ? i / (n - 1) : 0, a = a0 + (a1 - a0) * k; fn(x + Math.cos(a) * rad, y + Math.sin(a) * rad, a, delay + ms * k, i); } }
const alongAt = (x, y, a, d) => [x + Math.cos(a) * d, y + Math.sin(a) * d];

// ── area shapes (cone / line / arc) ──
// Pixel R: a dithered fire strip; a scanline wipes outward over 300 ms after the rectangle fills with scanlines.
rec('area', 'pixelWipe', (f, { x, y, a, len, w, delay }) => {
  const [ex, ey] = alongAt(x, y, a, len), ww = w || 170;
  teleG(f, delay, 0xb084ff, [[x - Math.sin(a) * ww / 2, y + Math.cos(a) * ww / 2], [ex - Math.sin(a) * ww / 2, ey + Math.cos(a) * ww / 2], [ex + Math.sin(a) * ww / 2, ey - Math.cos(a) * ww / 2], [x + Math.sin(a) * ww / 2, y - Math.cos(a) * ww / 2]]);
  for (let i = 1; i <= N(f, 8); i++) { const [px, py] = alongAt(x, y, a, (len * i) / (N(f, 8) + 1)); sp(f, 'trace_06', px, py, { size: ww, sx: 0.05, rot: a, life: 140, delay: (delay * i) / 9, tint: 0xb084ff, a0: 0.7 }); }
  const [bx, by] = alongAt(x, y, a, 20);
  sp(f, 'trace_06', bx, by, { size: ww, sx: 0.09, rot: a, dx: Math.cos(a) * len, dy: Math.sin(a) * len, life: 300, delay, tint: 0xffffff, ease: 'Linear' });
  SHAPES.line(f, x, y, ex, ey, { tex: 'trace_06', w: ww / len, tint: 0xb084ff, a0: 0.6, life: 380, delay });
  sp(f, 'symbol_01', ex, ey, { size: ww * 0.5, size1: ww * 1.3, life: 380, delay: delay + 280, tint: 0xffffff });
  const n = Math.min(N(f, 8), Math.ceil(len / 150));
  for (let i = 0; i < n; i++) { const [px, py] = alongAt(x, y, a, ((i + 0.5) * len) / n); fbx(f, 'vfDitheredFire', px, py - 10, { size: ww * 1.15, life: 600, delay: delay + (300 * i) / n, tint: i % 2 ? 0xffffff : 0xb084ff }); }
});
// Mop Q: five bristle strokes stagger 70 ms across the wedge, dust and star puffs.
rec('area', 'broomCone', (f, { x, y, a, len, ang: wd, delay }) => {
  const w = toRad(wd, Math.PI / 2), n = N(f, 5);
  teleG(f, delay, 0xe3c88e, [[x, y], ...Array.from({ length: 10 }, (_, i) => { const t = a - w / 2 + (w * i) / 9; return [x + Math.cos(t) * len, y + Math.sin(t) * len]; })]);
  for (let i = 0; i < n; i++) {
    const t = a + (n > 1 ? i / (n - 1) - 0.5 : 0) * w, [px, py] = alongAt(x, y, t, len * 0.45);
    sp(f, 'slash_04', px, py, { size: len * 0.8, rot: t, life: 260, delay: delay + i * 70, tint: i % 2 ? 0xe3c88e : 0xffffff, a0: 0.95 });
    sp(f, 'dirt_03', ...alongAt(x, y, t, len * 0.8), { size: 50, size1: 120, life: 480, delay: delay + i * 70, tint: 0xc8a165, add: false, a0: 0.6 });
  }
  fbx(f, 'vfPuffStars', ...alongAt(x, y, a, len * 0.7), { size: len * 0.8, life: 700, delay: delay + 160, tint: 0xe3c88e });
});
// Patch Q: three crescents sweep 200 degrees left to right (real timing = sweepMs), keycaps fly, impact at the end.
rec('area', 'arcSwing', (f, { x, y, a, len, inner, ang: wd, sweep, delay }) => {
  const w = toRad(wd, Math.PI * 1.1), ms = sweep > 0 ? sweep : 260, i0 = inner > 0 ? inner : len * 0.3;
  teleG(f, delay, 0xb084ff, sector(x, y, a, len, i0, w));
  for (let k = 0; k < 3; k++) arcSteps(f, x, y, len * (0.55 + k * 0.12), a - w / 2, a + w / 2, N(f, 6), ms, delay + k * 25, (px, py, t, d) => sp(f, 'slash_03', px, py, { size: len * 0.6, rot: t + Math.PI / 2, life: 220, delay: d, tint: k % 2 ? 0xff7fd0 : 0xb084ff, a0: 0.9 }));
  for (let i = 0; i < N(f, 5); i++) { const t = a + (i / 4 - 0.5) * w; sp(f, 'star_04', ...alongAt(x, y, t, len * 0.5), { size: 26, size1: 14, dx: Math.cos(t) * len * 0.5, dy: Math.sin(t) * len * 0.5 - 30, spin: rnd(-4, 4), life: 480, delay: delay + (ms * i) / 4, tint: 0xd7c6ff });
  }
  fbx(f, 'vfImpact', ...alongAt(x, y, a + w / 2, len * 0.8), { size: len * 0.7, life: 500, delay: delay + ms, tint: 0xb084ff });
});

// ── circle / zone / buff ──
// Ops Q: a bright wedge sweeps 360 degrees over the delay inside a gold radar ring.
rec('circle', 'scan', (f, { x, y, r, delay }) => {
  const d = Math.max(delay, 320);
  sp(f, 'light_02', x, y, { size: r * 2.1, a0: 0.45, life: d + 300, tint: 0xffe066, depth: GROUND });
  arcSteps(f, x, y, r * 0.55, -Math.PI / 2, -Math.PI / 2 + TAU * 0.89, N(f, 9), d, 0, (px, py, t, dl) => sp(f, 'slash_03', px, py, { size: r * 0.8, rot: t + Math.PI / 2, life: 240, delay: dl, tint: 0xfff1a8, a0: 0.9 }));
  SHAPES.ring(f, x, y, r * 1.05, { life: 420, delay: d, tint: 0xffd23f });
}, (f, { x, y, r, delay }) => fb(f, 'ringGold', x, y, { size: r * 2.3, life: Math.max(delay, 320) + 500, depth: G }));
// Stack R: a lime ring contracts (pull-in), then panes of rows rise and debris falls.
rec('circle', 'rowLift', (f, { x, y, r, delay }) => {
  const d = Math.max(delay, 300);
  sp(f, 'circle_03', x, y, { size: r * 2.4, size1: r * 0.8, life: d, tint: 0x9dff7a, a0: 0.7, ease: 'Quad.easeIn', depth: GROUND });
  for (let i = 0; i < N(f, 8); i++) { const [bx, by] = inDisc(x, y, r * 0.55); sp(f, 'window_01', bx, by, { size: 30, size1: 46, dy: -rnd(90, 160), life: 520, delay: d + i * 35, tint: 0xb6ff8a, a0: 0.95, ease: 'Cubic.easeOut' }); sp(f, 'dirt_03', bx, by - 120, { size: 36, size1: 24, dy: 120, life: 420, delay: d + 250 + i * 30, tint: 0x8a7a5a, add: false, a0: 0.8, ease: 'Quad.easeIn' }); }
}, (f, { x, y, r, delay }) => fb(f, 'vfEldenRing', x, y, { size: r * 2.6, size1: r * 0.5, life: Math.max(delay, 300) + 100, tint: 0x9dff7a, depth: G }));
// Guard W: a gold ring goes out in 250 ms, clipboard panes fan, a red bubble marks the taunted, a shield plate turns.
rec('circle', 'badgeCheck', (f, { x, y, r, delay }) => {
  SHAPES.ring(f, x, y, r, { tex: 'circle_03', life: 250, tint: 0xffd23f, depth: GROUND });
  for (let i = 0; i < N(f, 5); i++) { const t = (i / 5) * TAU; sp(f, 'window_03', x, y, { size: r * 0.5, rot: t, dx: Math.cos(t) * r * 0.55, dy: Math.sin(t) * r * 0.55, spin: 0.5, life: 600, delay: 100 + i * 30, tint: 0xfff0b0, a0: 0.9, ease: 'Back.easeOut' }); }
  sp(f, 'circle_02', x, y - 20, { size: r * 0.4, size1: r * 0.8, spin: Math.PI, life: 700, delay: 250, tint: 0x4a7bd0, a0: 0.9 });
  sp(f, 'symbol_01', x, y - 90, { size: 40, size1: 70, dy: -30, life: 700, delay: 200, tint: 0xff4040 });
}, (f, { x, y, r }) => fb(f, 'ringGold', x, y, { size: r * 2.3, life: 250, depth: G }));
// Ops R: a blue ring, 200 ms later a green one replaces it; every ally gets an electric dome and a revive halo.
recAll('blueGreen', (f, { x, y, r }) => {
  const R = r > 200 ? r : 800;
  sp(f, 'circle_03', x, y, { size: R * 0.1, size1: R * 2, life: 500, tint: 0x39a0ff, a0: 0.5, depth: GROUND });
  sp(f, 'circle_03', x, y, { size: R * 0.1, size1: R * 2, life: 500, delay: 200, tint: 0x59e08a, a0: 0.55, depth: GROUND });
  for (const v of alliesNear(f, x, y, R)) {
    sp(f, 'circle_03', v.x, v.y - 90, { size: 40, size1: 90, life: 900, delay: 250, tint: 0xfff3a0, a0: 0.9, a1: 0.4 });
    fbx(f, 'vfElectricShield', v.x, v.y - 46, { size: 200, life: 900, delay: 200, tint: 0x59e08a });
  }
}, (f, { x, y, r }) => { const R = r > 200 ? r : 800; fb(f, 'ringBlue', x, y, { size: R * 2, life: 600, depth: G }); fb(f, 'ringGreen', x, y, { size: R * 2, life: 600, delay: 200, depth: G }); });
// Zero E: three blades (slash_01/02/03) spin 360 degrees in 300 ms around the body, scratch marks on both bodies.
rec('circle', 'bladeSpin', (f, { x, y, r }) => {
  ['slash_01', 'slash_02', 'slash_03'].forEach((t, i) => sp(f, t, x, y, { size: r * 2.2, rot: (i / 3) * TAU, spin: TAU, life: 300, tint: i ? 0xd0a0ff : 0xffffff, ease: 'Cubic.easeOut' }));
  sp(f, 'scratch_01', x, y, { size: r * 0.9, rot: 0.5, life: 340, tint: 0xe0c8ff });
  sp(f, 'scratch_01', x, y, { size: r * 1.2, rot: -0.7, life: 360, delay: 60, tint: 0xb084ff });
  SHAPES.ring(f, x, y, r, { life: 420, tint: 0xb084ff, depth: GROUND });
}, (f, { x, y, r }) => fb(f, 'bloodSlash', x, y, { size: r * 2.4, life: 500, tint: 0xb084ff }));
// Model Q: a teal chaos cloud collapses, sparks orbit as the spent orbs, then pops.
rec('circle', 'dataSphere', (f, { x, y, r, delay }) => {
  const d = Math.max(delay, 300);
  sp(f, 'circle_03', x, y, { size: r * 0.5, size1: r * 2, life: d, tint: 0x6cffd6, a0: 0.6, depth: GROUND });
  SHAPES.orbit(f, x, y, r * 0.9, { n: clamp(Math.round(r / 30), 5, 12), tex: 'magic_02', size: 30, size1: 12, dx: 0, dy: 0, spin: TAU, life: d, tint: 0x6cffd6, ease: 'Quad.easeIn' });
  SHAPES.burst(f, x, y, r, { life: 320, delay: d, tint: 0xffffff });
}, (f, { x, y, r, delay }) => { const d = Math.max(delay, 300); fb(f, 'chaosCloud', x, y, { size: r * 2.2, size1: r * 0.8, life: d, tint: 0x6cffd6 }); fb(f, 'vfSmallHit', x, y, { size: r * 1.4, life: 450, delay: d }); });
// Model R: a vortex of twirls drags inward around a black hole with a bright core.
rec('circle', 'singularity', (f, { x, y, r, delay }) => {
  const d = Math.max(delay, 300);
  sp(f, 'twirl_03', x, y, { size: r * 2.4, size1: r * 0.6, spin: -TAU * 1.5, life: d + 300, tint: 0x6cffd6, a0: 0.95, depth: GROUND });
  sp(f, 'light_03', x, y, { size: r * 0.8, size1: r * 0.3, life: d + 300, tint: 0xffffff, a0: 0.9 });
  SHAPES.vortex(f, x, y, r, { n: 2, life: d + 300, tint: 0x5a3aff, a0: 0.7 });
}, (f, { x, y, r, delay }) => { const d = Math.max(delay, 300); fb(f, 'vfVortex', x, y, { size: r * 2.6, life: d + 500, tint: 0x6cffd6, depth: G }); fb(f, 'blackHole', x, y, { size: r * 2.2, life: d + 700 }); });
// Cleaner Q (bucket) E: a soap bubble inflates with a wobble over the delay, then pops.
rec('circle', 'bubble', (f, { x, y, r, delay }) => {
  const d = Math.max(delay, 500);
  const b = sp(f, 'circle_01', x, y, { size: r * 0.4, size1: r * 2, life: d, tint: 0xbfe9ff, add: false, a0: 0.5, a1: 0.7, ease: 'Sine.easeInOut', depth: GROUND + 0.2 });
  if (b) f.scene.tweens.add({ targets: b, angle: { from: -4, to: 4 }, yoyo: true, repeat: 3, duration: d / 8 });
  sp(f, 'star_04', x - r * 0.35, y - r * 0.35, { size: 20, size1: 60, life: d, tint: 0xffffff });
}, (f, { x, y, r, delay }) => fb(f, 'airCloud', x, y, { size: r * 2.5, life: 600, delay: Math.max(delay, 500), tint: 0xbfe9ff }));
// Brick R: gold shockwave, a red/blue siren spinning above, dust.
rec('circle', 'lockdown', (f, { x, y, r, delay }) => {
  SHAPES.ring(f, x, y, r, { life: 480, delay, tint: 0xffd23f });
  sp(f, 'light_02', x, y - 60, { size: 120, spin: TAU * 2, life: 800, delay, tint: 0xff3b3b, a0: 0.9 });
  sp(f, 'light_02', x, y - 60, { size: 120, spin: -TAU * 2, life: 800, delay, tint: 0x3b6bff, a0: 0.9 });
  sp(f, 'dirt_03', x, y, { size: r * 1.2, size1: r * 2.1, life: 460, delay, tint: 0x8a8f99, add: false, a0: 0.6 });
}, (f, { x, y, r, delay }) => { fb(f, 'ringGold', x, y, { size: r * 2.4, life: 800, delay, depth: G }); fb(f, 'impactAir', x, y, { size: r * 2.2, life: 600, delay }); fb(f, 'vfWheel', x, y, { size: r * 2.5, life: 700, delay, tint: 0xffd23f, depth: G }); });
// Sprint Q: an orange shockwave with dirt and a star on impact.
rec('circle', 'standup', (f, { x, y, r }) => {
  SHAPES.ring(f, x, y, r, { life: 220, tint: 0xff9a3a });
  sp(f, 'dirt_03', x, y, { size: r * 0.8, size1: r * 2, life: 420, tint: 0xc8a165, add: false, a0: 0.6 });
  SHAPES.burst(f, x, y, r, { tex: 'star_09', life: 280, tint: 0xffc94d });
}, (f, { x, y, r }) => fb(f, 'ringOrange', x, y, { size: r * 2.3, life: 280, depth: G }));
// Hira R: three purple pulses 200 ms apart (a clock wedge fills the radius), mute marks.
rec('circle', 'allHands', (f, { x, y, r, delay }) => {
  for (let i = 0; i < 3; i++) SHAPES.ring(f, x, y, r, { life: 420, delay: delay + i * 200, tint: 0xff6b6b, a0: 0.8 });
  for (let i = 0; i < N(f, 6); i++) { const [bx, by] = inDisc(x, y, r * 0.8); sp(f, 'symbol_01', bx, by, { size: 28, size1: 46, dy: -40, life: 700, delay: delay + 100 + i * 60, tint: 0xff4040 }); }
}, (f, { x, y, r, delay }) => { for (let i = 0; i < 3; i++) fb(f, 'ringPurple', x, y, { size: r * 2.3, life: 600, delay: delay + i * 200, depth: G }); fb(f, 'vfWheel', x, y, { size: r * 2.2, life: 900, delay, tint: 0xff6b6b, depth: G }); });
// Pager E: a spiky burst (chaosSpike) flings spikes out in 250 ms, white ring.
rec('circle', 'postmortem', (f, { x, y, r, delay }) => {
  SHAPES.burst(f, x, y, r, { tex: 'star_09', life: 250, delay, tint: 0xffffff });
  for (let i = 0; i < N(f, 10); i++) { const t = (i / 10) * TAU; sp(f, 'trace_07', ...alongAt(x, y, t, r * 0.3), { size: r * 0.6, sx: 0.1, rot: t - Math.PI / 2, dx: Math.cos(t) * r * 0.55, dy: Math.sin(t) * r * 0.55, life: 250, delay, tint: i % 2 ? 0xffffff : 0x6a3aa8 }); }
}, (f, { x, y, r, delay }) => { fb(f, 'chaosSpike', x, y, { size: r * 2.1, life: 450, delay, tint: 0x9a6aff }); fb(f, 'ringWhite', x, y, { size: r * 2.1, life: 500, delay, depth: G }); });
// Brew E (syrup): impact, puff of stars and sticky strings stretching from the splat.
CIRCLE.syrup = ((old) => (f, c) => { old(f, c); for (let i = 0; i < N(f, 5); i++) { const t = rnd(0, TAU); SHAPES.line(f, c.x, c.y, c.x + Math.cos(t) * c.r * 0.8, c.y + Math.sin(t) * c.r * 0.8, { tex: 'trace_04', w: 0.05, life: 700, delay: c.delay + 100, tint: 0xd98a1c, a0: 0.8 }); } })(CIRCLE.syrup);
// Embedded E: a steam + ice-shard ring expands to the outer radius, the centre stays clear.
recAll('ventRing', (f, c) => {
  const ts = myTurrets(f, c.x, c.y), R = c.r > 130 ? c.r : 260, inner = c.inner > 0 ? c.inner : R * 0.45;
  for (const v of (ts.length ? ts : [{ x: c.x, y: c.y }])) {
    sp(f, 'circle_03', v.x, v.y, { size: inner * 2, a0: 0.4, a1: 0.1, life: 700, tint: 0xbff4ff, depth: GROUND });
    for (let i = 0; i < N(f, 14); i++) { const t = (i / 14) * TAU; sp(f, 'smoke_03', v.x + Math.cos(t) * inner, v.y + Math.sin(t) * inner, { size: 40, size1: 110, dx: Math.cos(t) * (R - inner), dy: Math.sin(t) * (R - inner), life: 650, tint: 0xeaffff, add: false, a0: 0.55 }); }
    SHAPES.ring(f, v.x, v.y, R, { life: 600, tint: 0xbff4ff });
    for (let i = 0; i < 6; i++) { const t = (i / 6) * TAU + 0.3; fbx(f, 'iceBolt', v.x + Math.cos(t) * R * 0.75, v.y + Math.sin(t) * R * 0.75 - 30, { size: 150, life: 600, delay: 150, tint: 0xdffbff }); }
  }
});
// Barista W: milk steam rises as air + divine clouds.
FBX.buff.milkSteam = (f, { x, y }) => { fb(f, 'airCloud', x, y - 30, { size: 300, life: 1000, a0: 0.6, tint: 0xfff4e6 }); fb(f, 'divineCloud', x, y - 40, { size: 260, life: 1100, a0: 0.5, tint: 0xfff4e6 }); };
// Sprint R: light rays rise, two orange pulses, confetti stars.
rec('buff', 'rally', (f, { x, y }) => {
  for (let i = 0; i < N(f, 7); i++) sp(f, 'light_02', x + (i - 3) * 40, y - 20, { size: 70, sy: 2.4, dy: -150, life: 700, delay: i * 40, tint: 0xffb347, a0: 0.8 });
  SHAPES.ring(f, x, y, 360, { life: 700, tint: 0xff9a3a });
  SHAPES.ring(f, x, y, 360, { life: 700, delay: 220, tint: 0xffd23f });
  for (let i = 0; i < N(f, 10); i++) sp(f, 'star_06', x + rnd(-80, 80), y - 40, { size: 16, size1: 34, dx: rnd(-90, 90), dy: -rnd(80, 190), spin: rnd(-5, 5), life: 900, delay: 100 + i * 40, tint: [0xff7a1a, 0xffd23f, 0xfff0c0][i % 3] });
}, (f, { x, y }) => { fb(f, 'ringOrange', x, y - 20, { size: 740, life: 800, depth: G }); fb(f, 'ringOrange', x, y - 20, { size: 740, life: 800, delay: 220, depth: G }); });
// Guard E: the barricade drops from above, dust and a ring mark the footprint, the screen shakes on landing.
recAll('barricade', (f, { x, y }) => {
  if (f.scene.textures.exists('moba-prop-barricade')) {
    const im = f.scene.add.image(x, y - 320, 'moba-prop-barricade').setDisplaySize(112, 112).setDepth(D.fx).setAlpha(0.85);
    f.scene.tweens.add({ targets: im, y, duration: 260, ease: 'Quad.easeIn', onComplete: () => im.destroy() });
  }
  SHAPES.ring(f, x, y, 90, { life: 380, delay: 260, tint: 0x4a7bd0, depth: GROUND });
  sp(f, 'dirt_01', x, y, { size: 60, size1: 170, life: 520, delay: 260, tint: 0xc8d4e8, add: false, a0: 0.7 });
  f.scene.time.delayedCall(260, () => { if (f.onScreen(x, y, 200)) shakeCam(f.scene, 120, 0.004); });
});
// Tester W: the drone launches; a dotted vision ring and a crosshair mark its scan.
recAll('drone', (f, { x, y }) => {
  sp(f, 'circle_05', x, y - 40, { size: 20, size1: 60, life: 400, tint: 0xffffff });
  fbx(f, 'ringDots', x, y, { size: 420, life: 900, tint: 0x7ee8ff, depth: G });
  sp(f, 'slash_04', x, y - 40, { size: 160, spin: TAU, life: 700, tint: 0x7ee8ff, a0: 0.6 });
  fbx(f, 'crosshair', x, y - 40, { size: 120, life: 500, delay: 200 });
});

// ── targeted ──
// Pixel W: three pale orbs hop to the target 80 ms apart, a small hit pop per hop.
rec('tgt', 'pixelOrb', (f, { x0, y0, x1, y1 }) => {
  SHAPES.line(f, x0, y0 - 40, x1, y1 - 40, { tex: 'trace_04', w: 0.04, life: 300, tint: 0xbfe4ff, a0: 0.5 });
  for (let i = 0; i < 3; i++) { sp(f, 'magic_03', x0, y0 - 40, { size: 54, size1: 34, dx: x1 - x0, dy: y1 - y0, spin: 2, life: 220, delay: i * 80, tint: 0xbfe4ff, ease: 'Quad.easeIn' }); fbx(f, 'vfSmallHit', x1, y1 - 40, { size: 130 + i * 20, life: 350, delay: 220 + i * 80, tint: i === 2 ? 0xffffff : 0xbfe4ff }); }
});
// Zero R: a crosshair locks on (the chains and the strike are persistent, see MobaFx suppress / suppressEnd).
rec('tgt', 'suppressStrike', (f, { x1, y1 }) => {
  sp(f, 'magic_03', x1, y1 - 40, { size: 240, size1: 80, spin: 1, life: 320, tint: 0xff3b8a, ease: 'Quad.easeIn' });
}, (f, { x1, y1 }) => fb(f, 'crosshair', x1, y1 - 40, { size: 230, life: 700 }));
rec('blink', 'suppressStrike', (f, { x0, y0, x1, y1 }) => {
  SHAPES.beam(f, x0, y0 - 40, x1, y1 - 40, { tex: 'trace_07', tint: 0xff3b8a, life: 260 });
  sp(f, 'smoke_07', x0, y0 - 40, { size: 60, size1: 190, life: 500, tint: 0x14142a, add: false, a0: 0.8 });
});
// Dev R: two lines converge into an X over the target, a pentagram locks, stun stars circle.
rec('tgt', 'mergeLock', (f, { x1, y1 }) => {
  for (const s of [-1, 1]) SHAPES.line(f, x1 - s * 150, y1 - 190, x1 + s * 0, y1 - 40, { tex: 'trace_06', w: 0.07, life: 360, tint: 0xff4040, a0: 0.9 });
  for (const s of [-1, 1]) SHAPES.line(f, x1 + s * 150, y1 - 190, x1, y1 - 40, { tex: 'trace_06', w: 0.07, life: 360, tint: 0xff7a7a, a0: 0.9 });
  sp(f, 'window_04', x1, y1 - 40, { size: 30, size1: 180, spin: 1.2, life: 420, delay: 300, tint: 0xff4040 });
  for (let i = 0; i < 4; i++) sp(f, 'star_06', x1, y1 - 100, { size: 24, size1: 16, dx: Math.cos((i / 4) * TAU) * 40, dy: Math.sin((i / 4) * TAU) * 14, life: 700, delay: 360 + i * 40, tint: 0xffd23f });
}, (f, { x1, y1 }) => fb(f, 'pentagram', x1, y1, { size: 230, life: 700, delay: 300, tint: 0xff4040, add: false, depth: G }));

// ── dash / blink ──
// Courier Q: twin scorch tracks, burnout smoke, speed lines; while phasing a 35% ghost slides through and window flashes mark entry and exit.
rec('dash', 'tirePhase', (f, { x0, y0, x1, y1, phase }) => {
  const a = ang(x0, y0, x1, y1), len = Math.hypot(x1 - x0, y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2, nx = -Math.sin(a) * 12, ny = Math.cos(a) * 12;
  for (const s of [-1, 1]) sp(f, 'scorch_03', mx + nx * s, my + ny * s, { size: len, sx: 0.1, rot: a + Math.PI / 2, life: 900, tint: 0x2a1a10, add: false, a0: 0.7, depth: GROUND });
  lineSteps(x0, y0, x1, y1, N(f, 5), (x, y, k) => sp(f, 'smoke_04', x, y - 10, { size: 30, size1: 90, life: 520, delay: k * 90, tint: 0xffffff, add: false, a0: 0.45 }));
  for (let i = 0; i < N(f, 5); i++) SHAPES.line(f, x0 + rnd(-20, 20), y0 + rnd(-30, 10), x0 + Math.cos(a) * len * 0.8 + rnd(-20, 20), y0 + Math.sin(a) * len * 0.8 + rnd(-30, 10), { tex: 'trace_04', w: 0.03, life: 260, delay: i * 30, tint: 0xff9a3a });
  if (phase) {
    for (const k of [0.3, 0.7]) sp(f, 'window_04', x0 + (x1 - x0) * k, y0 + (y1 - y0) * k - 20, { size: 30, size1: 120, spin: 1, life: 320, delay: k * 300, tint: 0xffd0a0 });
    const gh = ghost(f, x0, y0, 0xff9a3a, 0.35);
    if (gh) f.scene.tweens.add({ targets: gh, x: x1, y: y1, duration: 320, ease: 'Linear', onComplete: () => gh.destroy() });
  }
}, (f, { x0, y0 }) => fb(f, 'smoke', x0, y0, { size: 170, life: 800, add: false, a0: 0.6 }));
// Sprint E: smoke puffs trace the leap arc (the caster itself turns 35% alpha), a shadow grows at the landing, crater on impact.
rec('dash', 'leapGhost', (f, { x0, y0, x1, y1 }) => {
  lineSteps(x0, y0, x1, y1, N(f, 6), (x, y, k) => sp(f, 'smoke_07', x, y - 30 - Math.sin(k * Math.PI) * 100, { size: 50, size1: 20, life: 380, delay: k * 300, tint: 0xffffff, a0: 0.35 }));
  sp(f, 'smoke_10', x1, y1, { size: 30, size1: 150, life: 340, a0: 0.5, tint: 0x000000, add: false, depth: GROUND });
  sp(f, 'scorch_01', x1, y1, { size: 150, life: 1000, delay: 320, tint: 0x241c18, add: false, a0: 0.6, depth: GROUND });
  SHAPES.ring(f, x1, y1, 160, { tex: 'circle_03', life: 380, delay: 320, tint: 0xffffff });
}, (f, { x1, y1 }) => { fb(f, 'impactAir', x1, y1, { size: 230, life: 550, delay: 320 }); fb(f, 'vfImpact', x1, y1 - 20, { size: 200, life: 550, delay: 330 }); });
// Oncall Q: three sonar rings expand from the landing point, signal bars rise, a crosshair flashes.
rec('dash', 'pingHop', (f, { x0, y0, x1, y1 }) => {
  SHAPES.line(f, x0, y0 - 20, x1, y1 - 20, { tex: 'trace_07', w: 0.03, life: 260, tint: 0xff5252, a0: 0.6 });
  for (let i = 0; i < 3; i++) SHAPES.ring(f, x1, y1, 150 + i * 30, { tex: 'circle_03', life: 520, delay: 120 + i * 140, tint: 0xff5252 });
  for (let i = 0; i < 4; i++) sp(f, 'trace_07', x1 - 30 + i * 20, y1 - 20, { size: 30 + i * 14, sx: 0.4, dy: -50, life: 520, delay: 160 + i * 60, tint: 0xff7a7a });
}, (f, { x1, y1 }) => fb(f, 'crosshair', x1, y1 - 30, { size: 140, life: 400, delay: 120 }));
// Cache E: the origin dissolves into binary-looking bits, the destination reassembles from collapsing scanlines with rebooting bars.
rec('blink', 'failoverBlink', (f, { x0, y0, x1, y1 }) => {
  for (let i = 0; i < N(f, 12); i++) sp(f, 'spark_07', x0 + rnd(-24, 24), y0 - rnd(10, 80), { size: 24, size1: 8, dx: rnd(-70, 70), dy: -rnd(20, 90), rot: rnd(0, TAU), life: 420, delay: i * 18, tint: 0xbfd4ff });
  for (let i = 0; i < N(f, 5); i++) SHAPES.line(f, x1 - 70, y1 - 100 + i * 28 - 30, x1 + 70, y1 - 100 + i * 28 - 30, { tex: 'trace_03', w: 0.08, life: 360, delay: 160 + i * 20, tint: 0xffffff, a0: 0.9, dy: (2 - i) * 24 });
  sp(f, 'window_04', x1, y1 - 50, { size: 120, size1: 60, life: 480, delay: 220, tint: 0x91a7ff });
  const gh = ghost(f, x0, y0, 0xbfd4ff, 0.5);
  if (gh) f.scene.tweens.add({ targets: gh, alpha: 0, duration: 600, onComplete: () => gh.destroy() });
}, (f, { x1, y1 }) => fb(f, 'ringBlue', x1, y1 - 30, { size: 190, life: 600, delay: 150 }));
// Patch E (hotfix): two red dots pop at each end of the cherry-pick.
rec('blink', 'cherryPick', (f, { x0, y0, x1, y1 }) => {
  for (const [x, y] of [[x0, y0], [x1, y1]]) { sp(f, 'star_06', x, y - 40, { size: 24, size1: 110, life: 360, tint: 0xff3b5c }); sp(f, 'circle_05', x, y - 40, { size: 20, size1: 10, life: 700, tint: 0xff3b5c, a0: 0.9 }); }
}, (f, { x1, y1 }) => fb(f, 'vfSmallHit', x1, y1 - 40, { size: 190, life: 500, tint: 0xff7fb0 }));

// ── zones ──
// Mop R (bucket): three trace_06 waves roll in across the water.
rec('zone', 'flood', (f, { x, y, r, ms }) => {
  sp(f, 'circle_05', x, y, { size: r * 2, a0: 0.28, a1: 0, life: ms, tint: 0x20c5b5, add: false, depth: GROUND - 0.1, ease: 'Linear' });
  loop(f, ms, 520, () => { for (let i = 0; i < 3; i++) { const a = rnd(0, TAU), [bx, by] = alongAt(x, y, a, r * 0.9); sp(f, 'trace_06', bx, by, { size: r * 0.9, sx: 0.08, rot: a, dx: -Math.cos(a) * r * 1.6, dy: -Math.sin(a) * r * 1.6, life: 900, delay: i * 120, tint: 0x6cf0e0, a0: 0.8, ease: 'Sine.easeInOut' }); } });
}, (f, { x, y, r, ms }) => { fb(f, 'waterDots', x, y, { size: r * 2.1, life: ms, a0: 0.7, tint: 0x6cf0e0 }); fb(f, 'impactWater', x, y, { size: r * 2.2, life: 700 }); });
// Hira E: pages fall and flip, a cream pool spreads under them.
rec('zone', 'policy', (f, { x, y, r, ms }) => {
  sp(f, 'circle_01', x, y, { size: r * 1.8, a0: 0.3, a1: 0.08, life: ms, tint: 0xfff0d0, ease: 'Linear', depth: GROUND });
  loop(f, ms, 300, () => { const [bx, by] = inDisc(x, y, r * 0.85); sp(f, 'window_03', bx, by - 100, { size: 34, sy: 1, dy: 100, spin: rnd(-3, 3), life: 900, tint: 0xfff0d0, a0: 0.9, ease: 'Sine.easeInOut' }); });
}, (f, { x, y, r, ms }) => fb(f, 'airCloud', x, y, { size: r * 2.1, life: ms, a0: 0.3, tint: 0xfff0d0 }));

// ── projectiles ──
Object.assign(PROJ, {
  // Tester R: a long thin red bolt.
  snipeGlobal: { head: 'trace_07', core: 'muzzle_04', w: 0.6, h: 6, orient: true, deco: (f, s, dt) => { if (every(s, '_d', dt, 0.03)) puff(f, s, 'spark_07', 0xff4040, { s0: 50, s1: 6, life: 0.25 }); } },
  // Hira Q: a heart plane on a sine path, pink hearts rising behind it.
  charmInvite: { head: 'magic_03', core: 'star_06', w: 1.3, h: 1.3, spin: 2, deco: (f, s, dt) => { const o = Math.sin(s.t * 13) * 20; s.head.setPosition(s.x - s.uy * o, s.y + s.ux * o); s.core.setPosition(s.x - s.uy * o, s.y + s.ux * o); if (every(s, '_d', dt, 0.07)) puff(f, s, 'star_06', 0xff8fb3, { s0: 22, s1: 8, life: 0.6, vy: -50 }); } },
  // Brew Q: one of three hoses, steam plus droplets.
  espressoSpray: { head: 'smoke_03', core: 'spark_02', w: 1.7, h: 1.7, spin: 3, deco: (f, s, dt) => { if (every(s, '_d', dt, 0.045)) { puff(f, s, 'smoke_03', 0xf5e6d3, { add: false, s0: 24, s1: 70, a0: 0.4, life: 0.45, vy: -20 }); puff(f, s, 'spark_02', 0x8a5a2a, { s0: 18, s1: 4, life: 0.3 }); } } },
});
PROJ.batch.deco = (f, s, dt) => { if (every(s, '_d', dt, 0.05)) { puff(f, s, 'window_01', s.color, { s0: 24, s1: 6, life: 0.3, vr: 4 }); puff(f, s, 'trace_06', 0xbfd4ff, { s0: 30, s1: 6, life: 0.25 }); if (Math.random() < 0.3) puff(f, s, 'symbol_01', 0xff7a7a, { s0: 18, s1: 10, life: 0.5, vy: -30 }); } };
PROJ.notif.deco = (f, s, dt) => { if (every(s, '_d', dt, 0.04)) puff(f, s, 'spark_06', 0xff9ad0, { s0: 36, s1: 6, life: 0.25 }); };
PROJ.storeLaunch.end = (f, s, x, y) => { if (!f.low) fb(f, 'vfKabooms', x, y - 20, { size: 190, life: 600 }); sp(f, 'circle_03', x, y, { size: 30, size1: 150, life: 340, tint: 0xff9a3a }); };
PROJ.tableScan.end = (f, s, x, y) => { fbx(f, 'vfExplosion', x, y - 20, { size: 170, life: 600, tint: 0xff5050 }); };
PROJ.snipeGlobal.end = (f, s, x, y) => { fbx(f, 'vfExplosion2', x, y - 20, { size: 280, life: 800, tint: 0xff4040 }); fbx(f, 'crosshair', x, y - 20, { size: 240, life: 600 }); sp(f, 'star_09', x, y - 20, { size: 40, size1: 200, life: 320, tint: 0xff4040 }); };
PROJ.charmInvite.end = (f, s, x, y) => { fbx(f, 'vfPuffStars', x, y - 40, { size: 180, life: 700, tint: 0xff8fb3 }); };
PROJ.espressoSpray.end = (f, s, x, y) => { sp(f, 'smoke_10', x, y - 50, { size: 40, size1: 110, life: 600, tint: 0x3a2214, a0: 0.5, add: false }); };
Object.assign(MUZZLE, {
  snipeGlobal: (f, { x, y, dx, dy }) => { const a = Math.atan2(dy, dx); SHAPES.line(f, x, y - 30, x + dx * 1800, y + dy * 1800 - 30, { tex: 'trace_07', w: 0.015, life: 450, tint: 0xff3030, a0: 0.5, delay: 0 }); sp(f, 'muzzle_04', x + dx * 30, y + dy * 30 - 40, { size: 150, rot: a + Math.PI / 2, life: 260, tint: 0xff4040 }); fbx(f, 'vfHyperspeed', x + dx * 200, y + dy * 200 - 40, { size: 420, life: 600, rot: a, tint: 0xff6a6a }); },
  charmInvite: (f, { x, y }) => { fbx(f, 'vfPuffStars', x, y - 40, { size: 150, life: 500, tint: 0xff8fb3 }); },
  espressoSpray: (f, { x, y, dx, dy }) => { sp(f, 'smoke_03', x + dx * 30, y + dy * 30 - 40, { size: 40, size1: 100, life: 400, tint: 0xf5e6d3, add: false, a0: 0.5 }); },
  notif: (f, { x, y, dx, dy }) => { sp(f, 'muzzle_02', x + dx * 24, y + dy * 24 - 40, { size: 90, rot: Math.atan2(dy, dx) + Math.PI / 2, life: 240, tint: 0xff9ad0 }); },
  pageWave: (f, { x, y }) => { fbx(f, 'ringDots', x, y - 40, { size: 190, life: 500, tint: 0xffa040 }); },
  hook: (f, { x, y, dx, dy }) => { fbx(f, 'vfWorm', x + dx * 50, y + dy * 50 - 40, { size: 170, life: 700, rot: Math.atan2(dy, dx), tint: 0x9dff7a }); },
});

// ── Pixel E / Pager R extras, Brew R bell ──
V6.serve = ((old) => (f, m) => {
  const p = f.posOf(m.sid);
  if (p && f.onScreen(p.x, p.y, 200)) { SHAPES.ring(f, p.x, p.y, 110, { life: 420, tint: 0xffe08a }); sp(f, 'star_08', p.x, p.y - 100, { size: 24, size1: 70, spin: 2, life: 600, tint: 0xffffff }); }
  return old(f, m);
})(V6.serve);

// Generic looks for an `area` message whose skill has no named style (cone / line / arc).
rec('area', '_cone', (f, { x, y, a, len, ang: wd, delay, color }) => { const w = toRad(wd, Math.PI / 2); teleG(f, delay, color, [[x, y], ...Array.from({ length: 10 }, (_, i) => { const t = a - w / 2 + (w * i) / 9; return [x + Math.cos(t) * len, y + Math.sin(t) * len]; })]); SHAPES.cone(f, x, y, a, len, { spread: w, tint: color, delay }); });
rec('area', '_line', (f, { x, y, a, len, w, delay, color }) => { const [ex, ey] = alongAt(x, y, a, len), ww = w || 120; teleG(f, delay, color, [[x - Math.sin(a) * ww / 2, y + Math.cos(a) * ww / 2], [ex - Math.sin(a) * ww / 2, ey + Math.cos(a) * ww / 2], [ex + Math.sin(a) * ww / 2, ey - Math.cos(a) * ww / 2], [x + Math.sin(a) * ww / 2, y - Math.cos(a) * ww / 2]]); SHAPES.beam(f, x, y, ex, ey, { tint: color, delay, w: ww / len * 0.5 }); });
rec('area', '_arc', (f, { x, y, a, len, inner, ang: wd, sweep, delay, color }) => { const w = toRad(wd, Math.PI), ms = sweep > 0 ? sweep : 260; teleG(f, delay, color, sector(x, y, a, len, inner > 0 ? inner : len * 0.3, w)); arcSteps(f, x, y, len * 0.7, a - w / 2, a + w / 2, N(f, 6), ms, delay, (px, py, t, d) => SHAPES.arc(f, px, py, len * 0.4, t, { delay: d, tint: color, life: 220 })); });

// ── refinements of v6 styles to the section 7 table ──
// Mop E: a wet skid, waterDots and smoke_03 trail, skid marks lingering on the floor.
rec('dash', 'skid', (f, { x0, y0, x1, y1 }) => {
  const a = ang(x0, y0, x1, y1), len = Math.hypot(x1 - x0, y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2, nx = -Math.sin(a) * 9, ny = Math.cos(a) * 9;
  for (const s of [-1, 1]) sp(f, 'trace_03', mx + nx * s, my + ny * s, { size: len, sx: 0.06, rot: a - Math.PI / 2, life: 1200, tint: 0x9fe8ff, a0: 0.45, depth: GROUND });
  lineSteps(x0, y0, x1, y1, N(f, 6), (x, y, k) => sp(f, 'smoke_03', x + rnd(-10, 10), y - 16, { size: 30, size1: 90, dy: -20, life: 600, delay: k * 120, tint: 0xd8f6ff, add: false, a0: 0.5 }));
}, (f, { x0, y0, x1, y1 }) => fb(f, 'waterDots', (x0 + x1) / 2, (y0 + y1) / 2, { size: Math.hypot(x1 - x0, y1 - y0) * 0.9 + 120, life: 900, tint: 0x9fe8ff }));
// Tester E: smoke_09 puffs, an arc hop, and a trace_06 X net unfolding at the landing.
rec('dash', 'vault', (f, { x0, y0, x1, y1 }) => {
  lineSteps(x0, y0, x1, y1, N(f, 6), (x, y, k) => sp(f, 'smoke_09', x, y - 20 - Math.sin(k * Math.PI) * 70, { size: 28, size1: 60, life: 420, delay: k * 140, tint: 0xffffff, a0: 0.5 }));
  for (const s of [-1, 1]) SHAPES.line(f, x1 - s * 80, y1 - 80, x1 + s * 80, y1 + 20, { tex: 'trace_06', w: 0.05, life: 700, delay: 280, tint: 0xffa040, a0: 0.9 });
  sp(f, 'spark_07', x1, y1 - 20, { size: 150, life: 300, delay: 280, tint: 0xffffff });
}, (f, { x0, y0 }) => fb(f, 'smoke', x0, y0, { size: 150, life: 700, add: false, a0: 0.6, tint: 0xd8c09a }));
// Patch Q (hotfix): three quick slash_01 cuts along the dash.
DASH.hotfixSlash = (f, { x0, y0, x1, y1 }) => {
  const a = ang(x0, y0, x1, y1);
  for (let i = 0; i < 3; i++) sp(f, 'slash_01', x0 + (x1 - x0) * (0.25 + i * 0.3), y0 + (y1 - y0) * (0.25 + i * 0.3) - 30, { size: 130, rot: a + (i - 1) * 0.55, life: 240, delay: i * 70, tint: i % 2 ? 0xffffff : 0xff7fb0 });
  sp(f, 'scratch_01', x1, y1 - 30, { size: 150, rot: a, life: 300, delay: 120, tint: 0xff3b8a });
};
STANCE_FX.gearSwitch = ((old) => (f, c) => { old(f, c); sp(f, 'magic_05', c.x, c.y - 120, { size: 100, spin: -TAU, life: 600, tint: 0x7ec8ff, a0: 0.8 }); })(STANCE_FX.gearSwitch);
BUFF.gearSwitch = (f, c) => STANCE_FX.gearSwitch(f, c);
const wrap = (tbl, name, extra) => { const old = tbl[name]; tbl[name] = (f, c) => { old(f, c); extra(f, c); }; };
wrap(BUFF, 'overclockTurrets', (f, { x, y }) => { if (!f.low) for (const v of myTurrets(f, x, y)) fb(f, 'flameB', v.x, v.y - 30, { size: 120, life: 900, tint: 0xff6a3a }); });
wrap(CIRCLE, 'overclockTurrets', (f, { x, y }) => { if (!f.low) for (const v of myTurrets(f, x, y)) fb(f, 'flameB', v.x, v.y - 30, { size: 120, life: 900, tint: 0xff6a3a }); });
wrap(BUFF, 'pickup', (f, { x, y }) => { fbx(f, 'sparkGold', x, y - 100, { size: 150, life: 500, tint: 0xc8a165 }); });
wrap(CIRCLE, 'turretDeploy', (f, { x, y }) => { sp(f, 'circle_02', x, y, { size: 30, size1: 140, life: 380, delay: 240, tint: 0x00e5ff }); });
wrap(CIRCLE, 'servePlain', (f, { x, y, r, delay }) => { fbx(f, 'impactWater', x, y, { size: r * 1.2, life: 450, delay }); });

// ── Zero R persistent suppress look (called by MobaFx suppress / suppressEnd) ──
export const SUPPRESS = {
  /** chains slam in around the victim, a padlock pulses; returns nothing (e supplies pooled images) */
  live(f, m, e) {
    const col = 0xff3b8a;
    const lock = e.img('window_04', col, true, D.fxTop), ring = e.img('circle_03', col, true, D.fx);
    const xs = [e.img('trace_06', 0xffffff, true, D.fxTop - 0.1), e.img('trace_06', col, true, D.fxTop - 0.1)];
    e.upd = () => {
      const p = f.posOf(m.tid);
      for (const i of [lock, ring, ...xs]) i.setVisible(!!p);
      if (!p) return;
      const k = clamp(e.t / 180, 0, 1), tight = 1 - clamp(e.t / Math.max(1, e.ms), 0, 1) * 0.35, pulse = 1 + 0.12 * Math.sin(e.t / 90);
      xs[0].setPosition(p.x, p.y - 46).setDisplaySize(26, 150 * tight * (2 - k)).setRotation(0.8).setAlpha(0.9 * e.vis);
      xs[1].setPosition(p.x, p.y - 46).setDisplaySize(26, 150 * tight * (2 - k)).setRotation(-0.8).setAlpha(0.9 * e.vis);
      lock.setPosition(p.x, p.y - 112).setDisplaySize(44 * pulse, 44 * pulse).setAlpha(e.vis);
      ring.setPosition(p.x, p.y + 40).setDisplaySize(120 * tight, 120 * tight).setAlpha(0.6 * e.vis);
    };
  },
  /** done = the strike (blood slash, burst, flipbooks); cancel = red shatter */
  end(f, m, p, done) {
    if (!p) return;
    const c = done ? 0xff3b8a : 0xff4040;
    sp(f, 'star_08', p.x, p.y - 46, { size: 40, size1: 190, life: 360, tint: c });
    for (let i = 0; i < N(f, 6); i++) { const t = (i / 6) * TAU; sp(f, 'trace_06', p.x, p.y - 46, { size: 60, sx: 0.12, rot: t, dx: Math.cos(t) * 80, dy: Math.sin(t) * 80, life: 360, tint: c }); }
    if (done) { fbx(f, 'vfBlood', p.x, p.y - 46, { size: 230, life: 700 }); fbx(f, 'bloodSlash', p.x, p.y - 46, { size: 230, life: 450 }); fbx(f, 'burstBlood', p.x, p.y - 46, { size: 200, life: 600, delay: 100 }); }
  },
};

// ── v6.1 generic CC impact visuals (section 7.1); MobaFx throttles to one apply VFX per target per 300 ms ──
export const CCFX = {
  apply(f, m, p, src) {
    if (!p || !f.onScreen(p.x, p.y, 250)) return;
    const x = p.x, y = p.y;
    switch (m.type) {
      case 'airborne': sp(f, 'dirt_01', x, y, { size: 60, size1: 170, life: 480, tint: 0xc8a165, add: false, a0: 0.7 }); fbx(f, 'impactAir', x, y - 20, { size: 200, life: 500, tint: 0xffe066 }); break;
      case 'charm':
        if (src) SHAPES.line(f, src.x, src.y - 40, x, y - 40, { tex: 'trace_04', w: 0.06, life: 320, tint: 0xff7eb6, a0: 0.8 });
        fbx(f, 'vfPuffStars', x, y - 60, { size: 170, life: 700, tint: 0xff7eb6 }); sp(f, 'star_06', x, y - 80, { size: 20, size1: 90, life: 380, tint: 0xff7eb6 }); break;
      case 'fear': fbx(f, 'chaosSpike', x, y - 50, { size: 180, life: 450, tint: 0x6a3aa8 }); sp(f, 'star_09', x, y - 50, { size: 30, size1: 130, life: 280, tint: 0x9b6bff }); break;
      case 'taunt': sp(f, 'flare_01', x, y - 60, { size: 30, size1: 150, life: 340, tint: 0xff4040 }); sp(f, 'circle_03', x, y, { size: 40, size1: 120, life: 360, tint: 0xff5252 }); break;
      case 'blind': sp(f, 'smoke_10', x, y - 62, { size: 30, size1: 100, life: 520, tint: 0x222233, add: false, a0: 0.8 }); break;
      case 'disarm': sp(f, 'scratch_01', x, y - 40, { size: 110, rot: 0.8, life: 340, tint: 0xffa94d }); sp(f, 'scratch_01', x, y - 40, { size: 110, rot: -0.8, life: 340, delay: 50, tint: 0xffffff }); break;
      case 'suppress': for (const s of [-1, 1]) sp(f, 'trace_06', x, y - 46, { size: 170, sx: 0.1, rot: s * 0.8, life: 360, tint: 0xff3b8a, ease: 'Back.easeOut' }); sp(f, 'window_04', x, y - 112, { size: 70, size1: 44, life: 420, tint: 0xffffff }); break;
      case 'untarget': CCFX.untarget(f, m, p); break;
      case 'revive': CCFX.revive(f, m, p); break;
      default: sp(f, 'circle_03', x, y, { size: 40, size1: 120, life: 340, tint: 0xffffff });
    }
  },
  /** ended early or expired: hearts pop, line snaps, thud puff, shatter; cancel / src_dead are tinted red */
  end(f, m, p) {
    if (!p || !f.onScreen(p.x, p.y, 250)) return;
    const x = p.x, y = p.y, red = m.why === 'cancel' || m.why === 'src_dead';
    switch (m.type) {
      case 'charm': for (let i = 0; i < N(f, 6); i++) gl(f, '♥', x + rnd(-20, 20), y - 90, { size: 20, color: '#ff8fb3', dx: rnd(-50, 50), dy: -rnd(30, 70), life: 520, thick: 2 }); break;
      case 'airborne': sp(f, 'smoke_04', x, y, { size: 40, size1: 150, life: 420, tint: 0xffffff, add: false, a0: 0.5 }); sp(f, 'dirt_01', x, y, { size: 50, size1: 130, life: 380, tint: 0xc8a165, add: false, a0: 0.6 }); break;
      case 'taunt': case 'fear': sp(f, 'star_09', x, y - 60, { size: 30, size1: 100, life: 260, tint: red ? 0xff4040 : 0xffffff }); break;
      case 'suppress': SUPPRESS.end(f, m, p, false); break;
      default: sp(f, 'star_08', x, y - 50, { size: 30, size1: 120, life: 300, tint: m.why === 'cleanse' ? 0xffffff : (red ? 0xff4040 : 0xbfd4ff) });
    }
  },
  block(f, m) {
    if (!Number.isFinite(m.x) || !f.onScreen(m.x, m.y, 200)) return;
    const shield = m.why === 'shield';
    f.number(m.x, m.y - 70, shield ? 'BLOCKED' : 'TENACITY', 'info');
    sp(f, 'circle_03', m.x, m.y - 40, { size: 40, size1: 140, life: 340, tint: shield ? 0x7ee8ff : 0xffd23f });
  },
  miss(f, m) { if (Number.isFinite(m.x) && f.onScreen(m.x, m.y, 100)) f.number(m.x, m.y - 60, 'MISS', 'ally'); },
  untarget(f, m, p) { if (p && f.onScreen(p.x, p.y, 200)) fbx(f, 'ringDots', p.x, p.y - 30, { size: 170, life: 450, tint: 0xbfd4ff }); if (p) sp(f, 'circle_03', p.x, p.y, { size: 30, size1: 120, life: 320, tint: 0xbfd4ff }); },
  revive(f, m, p) {
    if (!p || !f.onScreen(p.x, p.y, 250)) return;
    fbx(f, 'vfAnima', p.x, p.y - 60, { size: 280, life: 800, tint: Number.isFinite(m.color) ? m.color : 0xfff3a0 });
    sp(f, 'circle_03', p.x, p.y - 90, { size: 40, size1: 200, life: 500, tint: 0xfff3a0 }); sp(f, 'star_09', p.x, p.y - 60, { size: 30, size1: 160, life: 320, tint: 0xffffff });
  },
  /** Tester R warning: a pulsing red lane in the world (the minimap line is drawn by the HUD from fx.gpings). Returns the Graphics. */
  gping(f, m) {
    const g = f.scene.add.graphics().setDepth(D.ground + 0.9).setBlendMode(1);
    g.lineStyle(14, 0xff2a2a, 0.22); g.beginPath(); g.moveTo(m.x0, m.y0); g.lineTo(m.x1, m.y1); g.strokePath();
    g.lineStyle(3, 0xff6a6a, 0.9); g.beginPath(); g.moveTo(m.x0, m.y0); g.lineTo(m.x1, m.y1); g.strokePath();
    g._tw = f.scene.tweens.add({ targets: g, alpha: { from: 1, to: 0.25 }, yoyo: true, repeat: -1, duration: 160 }); // removed by MobaFx with the Graphics
    return g;
  },
};

// ───────────────────────── dispatch ─────────────────────────
/** Play the styled effect; false when this style has none for `kind` (caller draws the generic one). */
export function castFx(f, kind, style, c) {
  const fn = TABLES[kind]?.[style];
  if (!fn) return false;
  if (c.ghost && f.markGhost && (kind === 'dash' || kind === 'blink')) f.markGhost(c);
  const px = c.x ?? c.x1 ?? c.x0, py = c.y ?? c.y1 ?? c.y0;
  if (!f.onScreen(px, py, (c.r || 200) + 260) && !(c.x0 != null && f.onScreen(c.x0, c.y0, 300))) return true;
  const cc = { delay: 0, r: 120, ms: 1000, color: 0xffffff, ...c };
  ECHO.on = !!c.echo;
  try {
    fn(f, cc);
    if (!f.low) FBX[kind]?.[style]?.(f, cc); // flipbook layers are the heavy part: skipped on Low effects
  } finally { ECHO.on = false; }
  return true;
}
export const hasStyle = (kind, style) => !!TABLES[kind]?.[style];
/** Style key of a skill spec for one kind (`fx` is a string, or { dash, zone, ... } for multi-part skills). */
export const styleFor = (sk, kind) => (!sk || !sk.fx ? null : typeof sk.fx === 'string' ? sk.fx : sk.fx[kind] || null);

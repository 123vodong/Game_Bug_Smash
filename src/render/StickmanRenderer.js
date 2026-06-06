// Procedural stickman renderer — draws Stickyman fresh every frame from a
// pose (joint positions + laptop state). Replaces the static-SVG-per-action
// approach with smooth 60 fps interpolated animation.
//
// API:
//   const r = new StickmanRenderer(scene, playerColor);
//   scene.add.existing(r.container);            // or add to a parent container
//   r.update(action, elapsedMs, facing, opts);  // call every frame
//   r.destroy();                                // cleanup
//
// Coord system (stickman-local):
//   - origin (0,0) = feet midpoint on the ground
//   - +Y goes UP (matches Phaser display convention: container.y is feet)
//   - actual draw uses negative Y for limbs/head because Phaser screen +Y = down
//
// Author note: poses are authored in *display* coords (so 0=feet, NEGATIVE Y
// for limbs/head) to match what you'd draw on a canvas. This is the inverse of
// the SVG file convention (where +Y is down). Easier to author / debug visually.

// ── Default pose: leggy stick figure matching the reference art style.
// Proportions: head ~14%, torso ~32%, legs ~54% of total height.
// Total figure ~110 units tall. Laptop one-handed on the right side.
const DEFAULT_POSE = () => ({
  // Spine — long legs, mid torso, head on top
  hipY:     -50,     // hip pivot (legs = 50 long)
  neckY:    -84,     // base of neck (torso = 34 long)
  headY:    -98,     // head center (head r=14, head top at -112)
  headR:    14,
  bodyTilt: 0,
  bodyScaleY: 1,

  // Shoulders at upper torso
  shoulderL: { x: -5, y: -78 },
  shoulderR: { x:  5, y: -78 },

  // LEFT arm hangs straight down at side (free, slightly forward)
  elbowL:    { x: -7,  y: -62 },
  handL:     { x: -9,  y: -46 },
  // RIGHT arm bent forward, holding laptop on right side at hip-to-chest level
  elbowR:    { x:  12, y: -68 },
  handR:     { x:  20, y: -58 },

  // Long legs from hip (-50) to feet (0)
  hipL:      { x: -4, y: -50 },
  kneeL:     { x: -6, y: -26 },
  footL:     { x: -10, y: 0 },
  hipR:      { x:  4, y: -50 },
  kneeR:     { x:  6, y: -26 },
  footR:     { x:  10, y: 0 },

  // Laptop on the right side, tilted slightly to read in 3/4
  laptop: { visible: true, x: 16, y: -56, w: 32, h: 18, tilt: 10, broken: false },

  yOffset: 0,
  rotation: 0,
});


// ── Keyframe data: each action is a list of {t: 0..1, pose: partial} ───────
// Keyframes use partial poses — anything unspecified is inherited from
// DEFAULT_POSE. The interpolator lerps numerically between adjacent keyframes.

const POSES = {
  // ── IDLE ── breathing loop, 2 s. Laptop in right hand, left arm at side.
  idle: {
    durationMs: 2000,
    loop: true,
    keys: [
      { t: 0.0, pose: {} },
      { t: 0.5, pose: {
          neckY: -83, headY: -97, bodyScaleY: 0.98,
          handL: { x: -9, y: -45 },
          handR: { x: 20, y: -57 },
          laptop: { visible: true, x: 16, y: -55, w: 32, h: 18, tilt: 12, broken: false },
      } },
      { t: 1.0, pose: {} },
    ],
  },

  // ── RUN ── leg cycle with left-arm swing. Right arm + laptop steady.
  run: {
    durationMs: 500,
    loop: true,
    keys: [
      // Frame 0: L leg forward up, R leg back; L arm swung BACK
      { t: 0.0, pose: {
          yOffset: -5,
          hipL: { x: -4, y: -50 }, kneeL: { x: 0, y: -36 }, footL: { x: 6, y: -14 },
          hipR: { x:  4, y: -50 }, kneeR: { x: 8, y: -22 }, footR: { x: 12, y:   0 },
          shoulderL: { x: -5, y: -78 }, elbowL: { x: -14, y: -70 }, handL: { x: -14, y: -84 },
          shoulderR: { x:  5, y: -78 }, elbowR: { x:  12, y: -68 }, handR: { x:  20, y: -58 },
          bodyTilt: -3,
          laptop: { visible: true, x: 16, y: -56, w: 32, h: 18, tilt: 10, broken: false },
      } },
      // Frame 1: passing pose, arms mid-swing
      { t: 0.25, pose: {
          yOffset: -1,
          hipL: { x: -4, y: -50 }, kneeL: { x: -6, y: -26 }, footL: { x: -8, y: 0 },
          hipR: { x:  4, y: -50 }, kneeR: { x:  6, y: -26 }, footR: { x:  10, y: 0 },
          shoulderL: { x: -5, y: -78 }, elbowL: { x: -10, y: -62 }, handL: { x: -10, y: -46 },
          shoulderR: { x:  5, y: -78 }, elbowR: { x:  12, y: -68 }, handR: { x:  20, y: -58 },
          bodyTilt: 0,
          laptop: { visible: true, x: 16, y: -56, w: 32, h: 18, tilt: 10, broken: false },
      } },
      // Frame 2: R leg forward up, L leg back; L arm swung FORWARD
      { t: 0.5, pose: {
          yOffset: -5,
          hipL: { x: -4, y: -50 }, kneeL: { x: -8, y: -22 }, footL: { x: -12, y: 0 },
          hipR: { x:  4, y: -50 }, kneeR: { x:  0, y: -36 }, footR: { x:   6, y: -14 },
          shoulderL: { x: -5, y: -78 }, elbowL: { x: -4, y: -62 }, handL: { x: 0, y: -48 },
          shoulderR: { x:  5, y: -78 }, elbowR: { x:  12, y: -68 }, handR: { x:  20, y: -58 },
          bodyTilt: 3,
          laptop: { visible: true, x: 16, y: -56, w: 32, h: 18, tilt: 10, broken: false },
      } },
      // Frame 3: passing pose
      { t: 0.75, pose: {
          yOffset: -1,
          hipL: { x: -4, y: -50 }, kneeL: { x: -6, y: -26 }, footL: { x: -8, y: 0 },
          hipR: { x:  4, y: -50 }, kneeR: { x:  6, y: -26 }, footR: { x:  10, y: 0 },
          shoulderL: { x: -5, y: -78 }, elbowL: { x: -10, y: -62 }, handL: { x: -10, y: -46 },
          shoulderR: { x:  5, y: -78 }, elbowR: { x:  12, y: -68 }, handR: { x:  20, y: -58 },
          bodyTilt: 0,
          laptop: { visible: true, x: 16, y: -56, w: 32, h: 18, tilt: 10, broken: false },
      } },
      { t: 1.0, pose: {
          yOffset: -5,
          hipL: { x: -4, y: -50 }, kneeL: { x: 0, y: -36 }, footL: { x: 6, y: -14 },
          hipR: { x:  4, y: -50 }, kneeR: { x: 8, y: -22 }, footR: { x: 12, y:   0 },
          shoulderL: { x: -5, y: -78 }, elbowL: { x: -14, y: -70 }, handL: { x: -14, y: -84 },
          shoulderR: { x:  5, y: -78 }, elbowR: { x:  12, y: -68 }, handR: { x:  20, y: -58 },
          bodyTilt: -3,
          laptop: { visible: true, x: 16, y: -56, w: 32, h: 18, tilt: 10, broken: false },
      } },
    ],
  },

  // ── SMASH ── overhead laptop slam, 320 ms (both hands on the laptop)
  smash: {
    durationMs: 320,
    loop: false,
    keys: [
      // 0.0 wind-up: laptop raised overhead
      { t: 0.00, pose: {
          shoulderL: { x: -5, y: -78 }, elbowL: { x: -8, y: -96 }, handL: { x: -8, y: -114 },
          shoulderR: { x:  5, y: -78 }, elbowR: { x:  8, y: -96 }, handR: { x:  8, y: -114 },
          laptop: { visible: true, x: 0, y: -116, w: 44, h: 16, tilt: -8, broken: false },
          bodyTilt: -8, bodyScaleY: 1.05,
      } },
      // 0.40 impact: laptop driven down
      { t: 0.40, pose: {
          shoulderL: { x: -5, y: -74 }, elbowL: { x: -2, y: -58 }, handL: { x: 0, y: -40 },
          shoulderR: { x:  5, y: -74 }, elbowR: { x:  2, y: -58 }, handR: { x: 0, y: -40 },
          laptop: { visible: true, x: 0, y: -36, w: 44, h: 14, tilt: 18, broken: false },
          bodyTilt: 8, bodyScaleY: 0.85,
      } },
      // 0.65 recoil
      { t: 0.65, pose: {
          shoulderL: { x: -5, y: -78 }, elbowL: { x: -10, y: -68 }, handL: { x: -14, y: -60 },
          shoulderR: { x:  5, y: -78 }, elbowR: { x:  10, y: -68 }, handR: { x:  14, y: -60 },
          laptop: { visible: true, x: 0, y: -56, w: 42, h: 16, tilt: 5, broken: false },
          bodyTilt: 2, bodyScaleY: 0.96,
      } },
      { t: 1.00, pose: {} },
    ],
  },

  // ── PUNCH (Q Dash) ── forward jab with LEFT arm. Right hand keeps laptop.
  punch: {
    durationMs: 320,
    loop: false,
    keys: [
      // chamber: left fist drawn back
      { t: 0.00, pose: {
          shoulderL: { x: -5, y: -78 }, elbowL: { x: -10, y: -66 }, handL: { x: -8, y: -52 },
          shoulderR: { x:  5, y: -78 }, elbowR: { x:  12, y: -68 }, handR: { x:  20, y: -58 },
          bodyTilt: 3,
          laptop: { visible: true, x: 16, y: -56, w: 32, h: 18, tilt: 10, broken: false },
      } },
      // jab: left arm extends forward
      { t: 0.40, pose: {
          shoulderL: { x: -5, y: -76 }, elbowL: { x: -2, y: -70 }, handL: { x: 14, y: -68 },
          shoulderR: { x:  5, y: -78 }, elbowR: { x:  12, y: -68 }, handR: { x:  20, y: -58 },
          bodyTilt: -6, bodyScaleY: 1.04,
          laptop: { visible: true, x: 16, y: -56, w: 32, h: 18, tilt: 10, broken: false },
      } },
      // retract
      { t: 0.70, pose: {
          shoulderL: { x: -5, y: -78 }, elbowL: { x: -8, y: -66 }, handL: { x: -6, y: -54 },
          bodyTilt: 0,
          laptop: { visible: true, x: 16, y: -56, w: 32, h: 18, tilt: 10, broken: false },
      } },
      { t: 1.00, pose: {} },
    ],
  },

  // ── PARRY (W Shield) ── laptop held wide as a shield (two hands briefly)
  parry: {
    durationMs: 620,
    loop: false,
    keys: [
      { t: 0.00, pose: {} },
      { t: 0.25, pose: {
          shoulderL: { x: -5, y: -78 }, elbowL: { x: -14, y: -74 }, handL: { x: -22, y: -68 },
          shoulderR: { x:  5, y: -78 }, elbowR: { x:  14, y: -74 }, handR: { x:  22, y: -68 },
          laptop: { visible: true, x: 0, y: -68, w: 52, h: 26, tilt: 0, broken: false },
          bodyTilt: 0, bodyScaleY: 0.98,
      } },
      { t: 0.85, pose: {
          shoulderL: { x: -5, y: -78 }, elbowL: { x: -14, y: -74 }, handL: { x: -22, y: -68 },
          shoulderR: { x:  5, y: -78 }, elbowR: { x:  14, y: -74 }, handR: { x:  22, y: -68 },
          laptop: { visible: true, x: 0, y: -68, w: 52, h: 26, tilt: 0, broken: false },
      } },
      { t: 1.00, pose: {} },
    ],
  },

  // ── JUMP (E) ── pure vertical hop, no rotation. Right hand keeps laptop;
  // left arm swings overhead for momentum.
  jump: {
    durationMs: 420,
    loop: false,
    keys: [
      // 0.0 crouch
      { t: 0.00, pose: {
          hipY: -38, neckY: -72, headY: -86,
          kneeL: { x: -10, y: -18 }, footL: { x: -10, y: 0 },
          kneeR: { x:  10, y: -18 }, footR: { x:  10, y: 0 },
          shoulderL: { x: -5, y: -68 }, elbowL: { x: -10, y: -54 }, handL: { x: -8, y: -40 },
          shoulderR: { x:  5, y: -68 }, elbowR: { x:  12, y: -60 }, handR: { x:  20, y: -50 },
          bodyTilt: -3, bodyScaleY: 0.85,
          laptop: { visible: true, x: 16, y: -50, w: 32, h: 18, tilt: 10, broken: false },
      } },
      // 0.30 peak: body up, legs straight down, left arm up
      { t: 0.30, pose: {
          yOffset: -28,
          hipY: -50, neckY: -86, headY: -100,
          kneeL: { x: -6, y: -26 }, footL: { x: -8, y: 0 },
          kneeR: { x:  6, y: -26 }, footR: { x:  8, y: 0 },
          shoulderL: { x: -5, y: -82 }, elbowL: { x: -12, y: -94 }, handL: { x: -10, y: -106 },
          shoulderR: { x:  5, y: -82 }, elbowR: { x:  12, y: -72 }, handR: { x:  20, y: -62 },
          bodyScaleY: 1.05,
          laptop: { visible: true, x: 16, y: -62, w: 32, h: 18, tilt: 10, broken: false },
      } },
      // 0.60 hang
      { t: 0.60, pose: {
          yOffset: -18,
          hipY: -48, neckY: -82, headY: -96,
          kneeL: { x: -7, y: -28 }, footL: { x: -8, y: -8 },
          kneeR: { x:  7, y: -28 }, footR: { x:  8, y: -8 },
          shoulderL: { x: -5, y: -78 }, elbowL: { x: -10, y: -86 }, handL: { x: -8, y: -96 },
          shoulderR: { x:  5, y: -78 }, elbowR: { x:  12, y: -68 }, handR: { x:  20, y: -58 },
          laptop: { visible: true, x: 16, y: -58, w: 32, h: 18, tilt: 10, broken: false },
      } },
      // 0.85 landing — knees bend
      { t: 0.85, pose: {
          yOffset: -2,
          hipY: -38, neckY: -72, headY: -86,
          kneeL: { x: -10, y: -18 }, footL: { x: -10, y: 0 },
          kneeR: { x:  10, y: -18 }, footR: { x:  10, y: 0 },
          shoulderL: { x: -5, y: -70 }, elbowL: { x: -10, y: -56 }, handL: { x: -10, y: -44 },
          bodyScaleY: 0.9,
          laptop: { visible: true, x: 16, y: -54, w: 32, h: 18, tilt: 10, broken: false },
      } },
      { t: 1.00, pose: {} },
    ],
  },

  // ── KICK (R Ult) ── spinning roundhouse with full body rotation
  kick: {
    durationMs: 500,
    loop: false,
    keys: [
      // 0.0 wind-up: weight on L leg, R leg cocked back
      { t: 0.00, pose: {
          bodyTilt: -12,
          kneeR: { x: 2, y: -38 }, footR: { x: -6, y: -28 },
          laptop: { visible: true, x: 16, y: -58, w: 32, h: 18, tilt: 10, broken: false },
      } },
      // 0.25 leg whipping out, body rotating
      { t: 0.25, pose: {
          rotation: 90, bodyTilt: 0,
          kneeR: { x: 14, y: -38 }, footR: { x: 26, y: -36 },
          shoulderL: { x: -5, y: -78 }, elbowL: { x: -16, y: -74 }, handL: { x: -22, y: -66 },
          laptop: { visible: false, x: 0, y: 0, w: 0, h: 0, tilt: 0, broken: false },
      } },
      // 0.45 mid-spin: leg fully extended
      { t: 0.45, pose: {
          rotation: 180,
          kneeR: { x: 16, y: -42 }, footR: { x: 30, y: -44 },
          shoulderL: { x: -5, y: -78 }, elbowL: { x: -16, y: -74 }, handL: { x: -24, y: -70 },
          bodyScaleY: 1.05,
          laptop: { visible: false, x: 0, y: 0, w: 0, h: 0, tilt: 0, broken: false },
      } },
      // 0.70 finishing rotation
      { t: 0.70, pose: {
          rotation: 300,
          kneeR: { x: 8, y: -32 }, footR: { x: 12, y: -10 },
          laptop: { visible: false, x: 0, y: 0, w: 0, h: 0, tilt: 0, broken: false },
      } },
      // 0.90 landed
      { t: 0.90, pose: {
          rotation: 360,
          bodyTilt: 4,
          laptop: { visible: true, x: 14, y: -56, w: 32, h: 18, tilt: 10, broken: false },
      } },
      { t: 1.00, pose: { rotation: 360 } },
    ],
  },

  // ── BROKEN ── kneeling, looking at cracked laptop on lap.
  broken: {
    durationMs: 1600,
    loop: true,
    keys: [
      { t: 0.00, pose: {
          hipY: -22, neckY: -58, headY: -72, headR: 14,
          shoulderL: { x: -5, y: -52 }, elbowL: { x: -10, y: -40 }, handL: { x: -10, y: -28 },
          shoulderR: { x:  5, y: -52 }, elbowR: { x:  10, y: -40 }, handR: { x:  10, y: -28 },
          // L leg kneeling forward, R leg tucked
          hipL: { x: -4, y: -22 }, kneeL: { x: -8, y: -6 }, footL: { x: -14, y: 0 },
          hipR: { x:  4, y: -22 }, kneeR: { x:  6, y: -14 }, footR: { x: 12, y: -2 },
          bodyTilt: 14,
          laptop: { visible: true, x: 2, y: -34, w: 34, h: 16, tilt: 18, broken: true },
      } },
      { t: 0.5, pose: {
          hipY: -22, neckY: -56, headY: -70,
          shoulderL: { x: -5, y: -52 }, elbowL: { x: -12, y: -40 }, handL: { x: -8, y: -26 },
          shoulderR: { x:  5, y: -52 }, elbowR: { x:  12, y: -40 }, handR: { x:  12, y: -26 },
          hipL: { x: -4, y: -22 }, kneeL: { x: -8, y: -6 }, footL: { x: -14, y: 0 },
          hipR: { x:  4, y: -22 }, kneeR: { x:  6, y: -14 }, footR: { x: 12, y: -2 },
          bodyTilt: 14,
          laptop: { visible: true, x: 2, y: -34, w: 34, h: 16, tilt: 20, broken: true },
      } },
      { t: 1.00, pose: {
          hipY: -22, neckY: -58, headY: -72,
          shoulderL: { x: -5, y: -52 }, elbowL: { x: -10, y: -40 }, handL: { x: -10, y: -28 },
          shoulderR: { x:  5, y: -52 }, elbowR: { x:  10, y: -40 }, handR: { x:  10, y: -28 },
          hipL: { x: -4, y: -22 }, kneeL: { x: -8, y: -6 }, footL: { x: -14, y: 0 },
          hipR: { x:  4, y: -22 }, kneeR: { x:  6, y: -14 }, footR: { x: 12, y: -2 },
          bodyTilt: 14,
          laptop: { visible: true, x: 2, y: -34, w: 34, h: 16, tilt: 18, broken: true },
      } },
    ],
  },
};


// ── Pose interpolation ─────────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }

function lerpPoint(a, b, t) {
  if (!a) return b;
  if (!b) return a;
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function lerpLaptop(a, b, t) {
  if (!a) return b;
  if (!b) return a;
  return {
    visible: t < 0.5 ? a.visible : b.visible,
    x:       lerp(a.x, b.x, t),
    y:       lerp(a.y, b.y, t),
    w:       lerp(a.w, b.w, t),
    h:       lerp(a.h, b.h, t),
    tilt:    lerp(a.tilt, b.tilt, t),
    broken:  t < 0.5 ? a.broken : b.broken,
  };
}

/** Resolve partial keyframe pose against the default pose. */
function resolvePose(partial) {
  const base = DEFAULT_POSE();
  Object.keys(partial).forEach((k) => {
    base[k] = partial[k];
  });
  return base;
}

function interpolatePose(animSpec, elapsedMs) {
  let t = elapsedMs / animSpec.durationMs;
  if (animSpec.loop) {
    t = t - Math.floor(t);
  } else {
    t = Math.max(0, Math.min(1, t));
  }

  const keys = animSpec.keys;
  let k0 = keys[0], k1 = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (t >= keys[i].t && t <= keys[i + 1].t) {
      k0 = keys[i];
      k1 = keys[i + 1];
      break;
    }
  }
  const span = Math.max(1e-6, k1.t - k0.t);
  const local = (t - k0.t) / span;

  const a = resolvePose(k0.pose);
  const b = resolvePose(k1.pose);

  return {
    hipY:       lerp(a.hipY, b.hipY, local),
    neckY:      lerp(a.neckY, b.neckY, local),
    headY:      lerp(a.headY, b.headY, local),
    headR:      lerp(a.headR, b.headR, local),
    bodyTilt:   lerp(a.bodyTilt, b.bodyTilt, local),
    bodyScaleY: lerp(a.bodyScaleY, b.bodyScaleY, local),
    shoulderL:  lerpPoint(a.shoulderL, b.shoulderL, local),
    shoulderR:  lerpPoint(a.shoulderR, b.shoulderR, local),
    elbowL:     lerpPoint(a.elbowL, b.elbowL, local),
    elbowR:     lerpPoint(a.elbowR, b.elbowR, local),
    handL:      lerpPoint(a.handL, b.handL, local),
    handR:      lerpPoint(a.handR, b.handR, local),
    hipL:       lerpPoint(a.hipL, b.hipL, local),
    hipR:       lerpPoint(a.hipR, b.hipR, local),
    kneeL:      lerpPoint(a.kneeL, b.kneeL, local),
    kneeR:      lerpPoint(a.kneeR, b.kneeR, local),
    footL:      lerpPoint(a.footL, b.footL, local),
    footR:      lerpPoint(a.footR, b.footR, local),
    laptop:     lerpLaptop(a.laptop, b.laptop, local),
    yOffset:    lerp(a.yOffset, b.yOffset, local),
    rotation:   lerp(a.rotation, b.rotation, local),
  };
}


// ── Renderer class ─────────────────────────────────────────────────────────
export class StickmanRenderer {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} accentColor - player color (0xRRGGBB), used as a small accent
   */
  constructor(scene, accentColor = 0x4aa3ff) {
    this.scene = scene;
    this.accentColor = accentColor;
    this.container = scene.add.container(0, 0);
    this.gfx = scene.add.graphics();
    this.container.add(this.gfx);

    this._currentAction = 'idle';
    this._actionStartAt = 0;
    this._lastDrawAt = -1;
    this._cachedPose = null;
  }

  /** Set the displayed pose. Call every frame.
   *  @param {string} action - 'idle' | 'run' | 'smash' | 'punch' | 'parry' | 'jump' | 'kick' | 'broken'
   *  @param {number} elapsedMs - ms since this action started
   *  @param {number} facing - 1 (right) or -1 (left)
   *  @param {object} opts - { broken?: boolean, scale?: number }
   */
  update(action, elapsedMs, facing, opts = {}) {
    // Broken state overrides every other action
    const effectiveAction = opts.broken ? 'broken' : (POSES[action] ? action : 'idle');
    const animSpec = POSES[effectiveAction];

    const pose = interpolatePose(animSpec, elapsedMs);
    this._cachedPose = pose;

    // Apply container-level transforms
    this.container.scaleX = (facing < 0 ? -1 : 1) * (opts.scale || 1);
    this.container.scaleY = (opts.scale || 1);
    this.gfx.x = 0;
    this.gfx.y = pose.yOffset;
    this.gfx.rotation = (pose.rotation || 0) * Math.PI / 180;

    this._draw(pose);
  }

  /** Draw the stickman: thin single-line limbs, leggy proportions. */
  _draw(pose) {
    const g = this.gfx;
    g.clear();

    const STROKE = 0x1a1a1a;
    const LINE_W = 2.4;          // thin line width
    const SCREEN_BG = 0x101820;
    const SCREEN_FG = 0x4adafc;
    const BROKEN_RED = 0xe24a4a;

    // Whole-body tilt
    const tiltRad = (pose.bodyTilt || 0) * Math.PI / 180;
    const cos = Math.cos(tiltRad);
    const sin = Math.sin(tiltRad);
    const sY = pose.bodyScaleY || 1;
    const tx = (p) => p ? { x: p.x * cos - (p.y * sY) * sin, y: p.x * sin + (p.y * sY) * cos } : p;

    const shoulderL = tx(pose.shoulderL);
    const shoulderR = tx(pose.shoulderR);
    const elbowL = tx(pose.elbowL);
    const elbowR = tx(pose.elbowR);
    const handL = tx(pose.handL);
    const handR = tx(pose.handR);
    const hipL = tx(pose.hipL);
    const hipR = tx(pose.hipR);
    const kneeL = tx(pose.kneeL);
    const kneeR = tx(pose.kneeR);
    const footL = tx(pose.footL);
    const footR = tx(pose.footR);
    const neck = tx({ x: 0, y: pose.neckY });
    const hip  = tx({ x: 0, y: pose.hipY });
    const headC = tx({ x: 0, y: pose.headY });

    g.lineStyle(LINE_W, STROKE, 1);

    // Legs (single thin lines, knee + foot)
    g.lineBetween(hipL.x, hipL.y, kneeL.x, kneeL.y);
    g.lineBetween(kneeL.x, kneeL.y, footL.x, footL.y);
    g.lineBetween(hipR.x, hipR.y, kneeR.x, kneeR.y);
    g.lineBetween(kneeR.x, kneeR.y, footR.x, footR.y);
    // Small foot caps
    g.lineBetween(footL.x - 4, footL.y, footL.x + 4, footL.y);
    g.lineBetween(footR.x - 4, footR.y, footR.x + 4, footR.y);

    // Spine (single line from hip to neck)
    g.lineBetween(hip.x, hip.y, neck.x, neck.y);

    // Arms
    g.lineBetween(shoulderL.x, shoulderL.y, elbowL.x, elbowL.y);
    g.lineBetween(elbowL.x, elbowL.y, handL.x, handL.y);
    g.lineBetween(shoulderR.x, shoulderR.y, elbowR.x, elbowR.y);
    g.lineBetween(elbowR.x, elbowR.y, handR.x, handR.y);

    // Laptop
    if (pose.laptop && pose.laptop.visible) {
      this._drawLaptop(g, pose.laptop, STROKE, SCREEN_BG, SCREEN_FG, BROKEN_RED);
    }

    // Head — white fill so the spine doesn't show through, thin outline
    g.fillStyle(0xffffff, 1);
    g.fillCircle(headC.x, headC.y, pose.headR);
    g.lineStyle(LINE_W, STROKE, 1);
    g.strokeCircle(headC.x, headC.y, pose.headR);

    // Glasses — proportional, with bridge + pupil dots
    const glR  = pose.headR * 0.42;
    const glOff = pose.headR * 0.40;
    const glY  = headC.y + pose.headR * 0.05;
    g.strokeCircle(headC.x - glOff, glY, glR);
    g.strokeCircle(headC.x + glOff, glY, glR);
    g.lineBetween(headC.x - glOff + glR * 0.7, glY, headC.x + glOff - glR * 0.7, glY);
    g.fillStyle(STROKE, 1);
    g.fillCircle(headC.x - glOff, glY, 1.1);
    g.fillCircle(headC.x + glOff, glY, 1.1);

    // Mouth
    g.lineStyle(LINE_W * 0.8, STROKE, 1);
    const mouthY = headC.y + pose.headR * 0.55;
    if (pose.laptop && pose.laptop.broken) {
      g.lineBetween(headC.x - 3, mouthY, headC.x + 3, mouthY);
    } else {
      g.beginPath();
      g.moveTo(headC.x - 4, mouthY - 0.5);
      g.lineTo(headC.x,     mouthY + 1.5);
      g.lineTo(headC.x + 4, mouthY - 0.5);
      g.strokePath();
    }
  }

  _drawLaptop(g, laptop, stroke, bg, fg, brokenRed) {
    // Open laptop in 3/4 perspective, matching the SVG idle.svg style:
    // - Screen panel = trapezoid wider at top (closer to camera)
    // - Keyboard base = trapezoid wider at bottom (also closer to camera)
    // - They share a hinge line in the middle
    const cx = laptop.x;
    const cy = laptop.y;
    const w = Math.max(0, laptop.w);
    const h = Math.max(0, laptop.h);
    if (w < 1 || h < 1) return;

    const tilt = laptop.tilt * Math.PI / 180;
    const co = Math.cos(tilt), si = Math.sin(tilt);
    const project = (p) => ({ x: cx + p.x * co - p.y * si, y: cy + p.x * si + p.y * co });

    // Vertical split: 60% screen above, 40% keyboard below
    const screenH = h * 0.55;
    const kbdH    = h * 0.45;
    const yTop    = -h / 2;
    const yHinge  = yTop + screenH;
    const yBot    = h / 2;
    // Width tapering
    const wWide   = w;          // outer edge (closer to viewer)
    const wNarrow = w * 0.84;   // hinge edge (further)

    // ---- Screen panel (trapezoid) ----
    const screenPoly = [
      { x: -wWide / 2,   y: yTop },
      { x:  wWide / 2,   y: yTop },
      { x:  wNarrow / 2, y: yHinge },
      { x: -wNarrow / 2, y: yHinge },
    ].map(project);

    g.fillStyle(bg, 1);
    g.beginPath();
    g.moveTo(screenPoly[0].x, screenPoly[0].y);
    g.lineTo(screenPoly[1].x, screenPoly[1].y);
    g.lineTo(screenPoly[2].x, screenPoly[2].y);
    g.lineTo(screenPoly[3].x, screenPoly[3].y);
    g.closePath();
    g.fillPath();

    // Screen display inset (slightly smaller trapezoid, blue/red)
    const insetTopW    = wWide   * 0.88;
    const insetHinge   = wNarrow * 0.88;
    const insetTopY    = yTop    + screenH * 0.12;
    const insetBotY    = yHinge  - screenH * 0.08;
    const displayPoly = [
      { x: -insetTopW / 2,  y: insetTopY },
      { x:  insetTopW / 2,  y: insetTopY },
      { x:  insetHinge / 2, y: insetBotY },
      { x: -insetHinge / 2, y: insetBotY },
    ].map(project);

    g.fillStyle(laptop.broken ? brokenRed : fg, 1);
    g.beginPath();
    g.moveTo(displayPoly[0].x, displayPoly[0].y);
    g.lineTo(displayPoly[1].x, displayPoly[1].y);
    g.lineTo(displayPoly[2].x, displayPoly[2].y);
    g.lineTo(displayPoly[3].x, displayPoly[3].y);
    g.closePath();
    g.fillPath();

    // </> code symbol drawn on the screen — only when not broken + big enough
    if (!laptop.broken && w > 18) {
      g.lineStyle(1.5, 0xffffff, 0.95);
      const symH = (insetBotY - insetTopY) * 0.55;
      const symCy = (insetTopY + insetBotY) / 2;
      const halfH = symH / 2;
      const symW = symH * 1.6; // total width of the </> group
      // Anchor points (local pre-project)
      const leftX  = -symW / 2;
      const rightX =  symW / 2;
      const midX   = 0;
      // "<": top-right → middle-left → bottom-right
      const lt = project({ x: leftX + symW * 0.18, y: symCy - halfH });
      const lm = project({ x: leftX,                y: symCy });
      const lb = project({ x: leftX + symW * 0.18, y: symCy + halfH });
      g.beginPath();
      g.moveTo(lt.x, lt.y);
      g.lineTo(lm.x, lm.y);
      g.lineTo(lb.x, lb.y);
      g.strokePath();
      // "/" diagonal slash
      const sla = project({ x: midX + symW * 0.06, y: symCy + halfH });
      const slb = project({ x: midX - symW * 0.06, y: symCy - halfH });
      g.lineBetween(sla.x, sla.y, slb.x, slb.y);
      // ">": top-left → middle-right → bottom-left
      const rt = project({ x: rightX - symW * 0.18, y: symCy - halfH });
      const rm = project({ x: rightX,                y: symCy });
      const rb = project({ x: rightX - symW * 0.18, y: symCy + halfH });
      g.beginPath();
      g.moveTo(rt.x, rt.y);
      g.lineTo(rm.x, rm.y);
      g.lineTo(rb.x, rb.y);
      g.strokePath();
    }

    // ---- Keyboard base (trapezoid wider at bottom) ----
    const kbdPoly = [
      { x: -wNarrow / 2, y: yHinge },
      { x:  wNarrow / 2, y: yHinge },
      { x:  wWide / 2,   y: yBot },
      { x: -wWide / 2,   y: yBot },
    ].map(project);

    g.fillStyle(0x3a3a3a, 1);
    g.beginPath();
    g.moveTo(kbdPoly[0].x, kbdPoly[0].y);
    g.lineTo(kbdPoly[1].x, kbdPoly[1].y);
    g.lineTo(kbdPoly[2].x, kbdPoly[2].y);
    g.lineTo(kbdPoly[3].x, kbdPoly[3].y);
    g.closePath();
    g.fillPath();

    // Keyboard keys (small dot grid, only if laptop is big enough to read)
    if (w > 24 && kbdH > 4) {
      g.fillStyle(0x1a1a1a, 0.55);
      const rows = 2;
      const cols = 7;
      const keyW = (wNarrow * 0.78) / cols;
      const keySpacing = wNarrow * 0.85 / cols;
      const rowStartY = yHinge + kbdH * 0.25;
      const rowEndY   = yBot   - kbdH * 0.25;
      for (let r = 0; r < rows; r++) {
        const rowT = rows === 1 ? 0 : r / (rows - 1);
        const ky = rowStartY + (rowEndY - rowStartY) * rowT;
        // Tapered key row width (matches the trapezoid)
        const rowFactor = wNarrow + (wWide - wNarrow) * rowT;
        const rowKeySpacing = (rowFactor * 0.85) / cols;
        for (let cc = 0; cc < cols; cc++) {
          const kx = -rowFactor * 0.425 + cc * rowKeySpacing + rowKeySpacing * 0.5;
          // Small rotated dot
          const k = project({ x: kx, y: ky });
          g.fillRect(k.x - 1.2, k.y - 0.6, 2.4, 1.2);
        }
      }
    }

    // ---- Hinge line ----
    g.lineStyle(1.2, stroke, 1);
    const hingeA = project({ x: -wNarrow / 2, y: yHinge });
    const hingeB = project({ x:  wNarrow / 2, y: yHinge });
    g.lineBetween(hingeA.x, hingeA.y, hingeB.x, hingeB.y);

    // ---- Outlines on both panels ----
    g.lineStyle(1.5, stroke, 1);
    g.beginPath();
    g.moveTo(screenPoly[0].x, screenPoly[0].y);
    for (let i = 1; i < screenPoly.length; i++) g.lineTo(screenPoly[i].x, screenPoly[i].y);
    g.closePath();
    g.strokePath();
    g.beginPath();
    g.moveTo(kbdPoly[0].x, kbdPoly[0].y);
    for (let i = 1; i < kbdPoly.length; i++) g.lineTo(kbdPoly[i].x, kbdPoly[i].y);
    g.closePath();
    g.strokePath();

    // ---- BROKEN: cracks across the red display ----
    if (laptop.broken) {
      g.lineStyle(1.4, 0x000000, 0.9);
      const crack = [
        { x: -insetTopW * 0.42, y: insetTopY + (insetBotY - insetTopY) * 0.3 },
        { x: -insetTopW * 0.10, y: insetTopY + (insetBotY - insetTopY) * 0.7 },
        { x:  insetTopW * 0.18, y: insetTopY + (insetBotY - insetTopY) * 0.25 },
        { x:  insetTopW * 0.42, y: insetTopY + (insetBotY - insetTopY) * 0.65 },
      ].map(project);
      g.beginPath();
      g.moveTo(crack[0].x, crack[0].y);
      for (let i = 1; i < crack.length; i++) g.lineTo(crack[i].x, crack[i].y);
      g.strokePath();
      // Branches
      g.lineBetween(crack[1].x, crack[1].y, crack[1].x + 4, crack[1].y - 4);
      g.lineBetween(crack[2].x, crack[2].y, crack[2].x - 4, crack[2].y + 5);
    }
  }

  /** Set tint (red flash on hit, gray when stunned, etc). Pass null to clear. */
  setTint(color) {
    // Phaser Graphics doesn't support tint directly; emulate via alpha-blended overlay
    // For simplicity: use container.alpha as a stand-in. Tint mostly used for brief
    // flashes — caller can also just rely on red-spark particles.
    if (color === null || color === undefined) {
      this.container.alpha = 1;
    } else {
      // Subtle: drop alpha so darker hits are still readable
      this.container.alpha = 1;
    }
  }

  destroy() {
    this.container.destroy();
  }
}

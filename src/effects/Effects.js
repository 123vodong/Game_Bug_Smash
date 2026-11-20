// Effects — shared visual juice for the hunter scene.
// All functions take a Phaser scene and produce ephemeral self-destructing tweens.
// Screen shake goes through camera.shake (gated globally by core/FxPrefs.js); the
// full-screen flash below checks the "Flashes" setting itself.
import { fxAllowed } from '../core/FxPrefs.js';

/** Tiny screen shake. magnitude in px, duration in ms. */
export function screenShake(scene, durationMs = 150, magnitude = 0.005) {
  scene.cameras.main.shake(durationMs, magnitude);
}

/**
 * Impact burst — N small circles radiating outward from (x, y).
 * Use after a smash hit. `color` is hex int (e.g. 0xffd23f).
 */
export function impactBurst(scene, x, y, color = 0xffffff, count = 10) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 22 + Math.random() * 18;
    const dx = Math.cos(a) * dist;
    const dy = Math.sin(a) * dist;
    const r = 2 + Math.random() * 3;
    const p = scene.add.circle(x, y, r, color, 0.95).setDepth(15);
    scene.tweens.add({
      targets: p,
      x: x + dx,
      y: y + dy,
      alpha: 0,
      scale: 0.4,
      duration: 320 + Math.random() * 120,
      ease: 'Cubic.easeOut',
      onComplete: () => p.destroy(),
    });
  }
}

/**
 * Expanding ring outline — the "shockwave" of a hit.
 */
export function shockwaveRing(scene, x, y, color = 0xffffff, maxScale = 8) {
  const ring = scene.add.circle(x, y, 8, 0x000000, 0).setStrokeStyle(3, color, 0.9).setDepth(14);
  scene.tweens.add({
    targets: ring,
    scaleX: maxScale,
    scaleY: maxScale,
    alpha: 0,
    duration: 380,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });
}

/**
 * Floating "+N" / "SMASH!" text that drifts up and fades.
 */
export function hitNumbers(scene, x, y, text, color = '#ffd23f', size = 18) {
  const t = scene.add.text(x, y, text, {
    fontFamily: 'Arial Black, sans-serif',
    fontSize: size,
    color,
    stroke: '#000000',
    strokeThickness: 3,
  }).setOrigin(0.5).setDepth(16);
  scene.tweens.add({
    targets: t,
    y: y - 36,
    alpha: 0,
    duration: 720,
    ease: 'Cubic.easeOut',
    onComplete: () => t.destroy(),
  });
}

/** Brief white flash overlaid on the scene (for big events). */
export function fullScreenFlash(scene, color = 0xffffff, alpha = 0.3, durationMs = 120) {
  if (!fxAllowed('flashes')) return;
  const { width: W, height: H } = scene.scale;
  const f = scene.add.rectangle(W / 2, H / 2, W, H, color, alpha).setDepth(50);
  scene.tweens.add({
    targets: f,
    alpha: 0,
    duration: durationMs,
    onComplete: () => f.destroy(),
  });
}

/**
 * Confetti burst — colored squares fly outward and tumble down.
 * Use for big wins / combos.
 */
export function confettiBurst(scene, x, y, count = 24) {
  const colors = [0xff5252, 0xffd23f, 0x7ed957, 0x4aa3ff, 0xc084d6, 0xff8a33];
  for (let i = 0; i < count; i++) {
    const c = scene.add.rectangle(x, y, 6, 4, colors[Math.floor(Math.random() * colors.length)]).setDepth(15);
    const a = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 120;
    scene.tweens.add({
      targets: c,
      x: x + Math.cos(a) * dist,
      y: y + Math.sin(a) * dist + 120,
      angle: Math.random() * 720,
      alpha: 0,
      duration: 900 + Math.random() * 400,
      ease: 'Cubic.easeIn',
      onComplete: () => c.destroy(),
    });
  }
}

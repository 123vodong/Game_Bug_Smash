// champUiFx - screen-level polish for Team Mode (cheap, optional):
//   * a soft vignette via ONE Phaser postFX on the main camera (skipped in Low effects / Canvas renderer)
//   * a red edge pulse on the HUD layer when the local champion takes damage (respects the "flashes" preference)
// The camera shake hook already exists as shakeCam() in mobaGfx.js; call it for big hits.
import { calmPrefs } from './mobaGfx.js';

export function installScreenFx(scene) {
  const W = scene.scale.width, H = scene.scale.height;
  const st = { vig: null, low: !!scene._lowFx };
  // Hit pulse: two thin red bands + two side bands would need 4 objects; one stroked full-screen rectangle is enough.
  const pulse = scene.add.rectangle(W / 2, H / 2, W - 6, H - 6, 0xff2a2a, 0).setStrokeStyle(10, 0xff2a2a, 1).setScrollFactor(0).setDepth(44).setAlpha(0);
  const apply = () => {
    const cam = scene.cameras?.main;
    const on = !st.low && scene.game?.renderer?.type === 2 /* Phaser.WEBGL */ && !!cam?.postFX;
    if (on && !st.vig) { try { st.vig = cam.postFX.addVignette(0.5, 0.5, 0.92, 0.32); } catch (_) { st.vig = null; } }
    else if (!on && st.vig) { try { cam.postFX.remove(st.vig); } catch (_) { /* camera gone */ } st.vig = null; }
  };
  apply();
  scene.events.once('shutdown', () => { st.low = true; apply(); pulse.destroy(); });
  return {
    /** Call when the effects mode changes (low = currently low effects). */
    setLow(low) { low = !!low; if (low !== st.low) { st.low = low; apply(); } },
    /** Red edge pulse; frac = fraction of max HP just lost (0..1). */
    hit(frac) {
      if (!calmPrefs().flashes || !pulse.scene) return;
      const a = Math.max(0.18, Math.min(0.6, frac * 3));
      scene.tweens.killTweensOf(pulse);
      pulse.setAlpha(a);
      scene.tweens.add({ targets: pulse, alpha: 0, duration: 380, ease: 'Sine.easeOut' });
    },
  };
}

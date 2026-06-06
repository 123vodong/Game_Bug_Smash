// BUG SMASH: Deadline Hunter — entry point.
// Scenes from the old Pac-Man build are kept on disk but UNREGISTERED here.
// Active flow: MenuScene -> HuntScene.
import MenuScene from './scenes/MenuScene.js';
import HuntScene from './scenes/HuntScene.js';
import PlatformerScene from './scenes/PlatformerScene.js';
import MultiPlayScene from './scenes/MultiPlayScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#1e1e2e',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 1400 }, debug: false },
  },
  scene: [MenuScene, HuntScene, PlatformerScene, MultiPlayScene],
};

new Phaser.Game(config);

// Global safety net: when a tab returns from background, Phaser can briefly
// hit null texture frames mid-frame and throw "Cannot read properties of null
// (reading 'cut')". That's a transient state — the very next render frame is
// fine. Swallow these specific errors so they don't lock the game.
window.addEventListener('error', (e) => {
  const msg = e?.error?.message || e?.message || '';
  if (msg.includes("'cut'") || msg.includes('reading \'cut\'')) {
    console.warn('[render] suppressed transient texture error after tab focus');
    e.preventDefault();
    return false;
  }
});

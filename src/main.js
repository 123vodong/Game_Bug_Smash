// BUG SMASH: Deadline Hunter — entry point.
// Scenes from the old Pac-Man build are kept on disk but UNREGISTERED here.
// Active flow: MenuScene -> HuntScene.
import MenuScene from './scenes/MenuScene.js';
import HuntScene from './scenes/HuntScene.js';
import MultiPlayScene from './scenes/MultiPlayScene.js';
import TeamLobbyScene from './scenes/TeamLobbyScene.js';
import TeamModeScene from './scenes/TeamModeScene.js';
import TeamSelectScene from './scenes/TeamSelectScene.js';
import TeamCustomScene from './scenes/TeamCustomScene.js';

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
  scene: [MenuScene, HuntScene, MultiPlayScene, TeamLobbyScene, TeamCustomScene, TeamSelectScene, TeamModeScene],
};

const game = new Phaser.Game(config);
// Exposed for the playtest harness (tools/playtest) and console debugging.
window.__game = game;

// Deep links (shareable + used by the harness):
//   ?scene=lobby                         → Team Mode champion select
//   ?scene=team[&champ=pixel][&name=X][&offline=1] → straight into a Team Mode match
const params = new URLSearchParams(window.location.search);
const deepScene = params.get('scene');
// Custom-room invite link: ?room=<roomId> → straight to the rooms screen, joining that code (EP-11).
const inviteRoom = params.get('room');
if (inviteRoom && /^[A-Za-z0-9_-]{1,32}$/.test(inviteRoom) && !deepScene) {
  game.events.once('ready', () => {
    game.scene.stop('MenuScene');
    let name = '';
    try { name = window.localStorage && JSON.parse(localStorage.getItem('bugSmashHunter.save.v1') || '{}').playerName || ''; } catch (_) { /* no save */ }
    game.scene.start('TeamCustomScene', { joinCode: inviteRoom, name });
  });
}
// Story Mode 2.0 (lazy-loaded): ?scene=story → the champion pick (the menu's STORY card does the same);
// ?scene=story&champ=dev[&name=X][&floor=f1] → straight onto the floor (shareable, used by the harness).
if (deepScene === 'story') {
  game.events.once('ready', async () => {
    game.scene.stop('MenuScene');
    try {
      const { launchStory, openStoryPick } = await import('./story2/launch.js');
      if (params.get('champ')) launchStory(game, { champ: params.get('champ'), name: params.get('name') || 'Intern', floor: params.get('floor') || 'f1' });
      else openStoryPick(game);
    } catch (e) {
      console.error('[story] could not start Story Mode 2.0', e);
      game.scene.start('MenuScene');
    }
  });
}
if (deepScene === 'lobby' || deepScene === 'team' || deepScene === 'select') {
  game.events.once('ready', () => {
    game.scene.stop('MenuScene');
    if (deepScene === 'lobby') {
      game.scene.start('TeamLobbyScene');
    } else if (deepScene === 'select') {
      game.scene.start('TeamSelectScene', {
        offline: params.get('offline') !== '0',
        champ: params.get('champ') || undefined,
        name: params.get('name') || 'Tester',
      });
    } else {
      game.scene.start('TeamModeScene', {
        champ: params.get('champ') || 'pixel',
        name: params.get('name') || 'Tester',
        offline: params.get('offline') === '1',
        sandbox: params.get('offline') === '1' && params.get('sandbox') !== '0',
      });
    }
  });
}

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

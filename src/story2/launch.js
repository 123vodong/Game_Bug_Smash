// src/story2/launch.js — starts Story Mode 2.0. Lazy: the menu / deep link imports this file only
// when Story Mode starts, so the 5v5 code path never downloads src/story2/*.
//   import('./story2/launch.js').then((m) => m.launchStory(game, { champ, name, floor }))
import StoryWorldScene from './StoryWorldScene.js';

/** Register the scene once per page, then start it (from any scene or right after boot). */
export function launchStory(game, { champ = 'dev', name = 'Intern', floor = 'f1', spells = null } = {}) {
  if (!game.scene.getScene('StoryWorldScene')) game.scene.add('StoryWorldScene', StoryWorldScene, false);
  game.scene.start('StoryWorldScene', { champ, name, floor, spells, story: true });
}

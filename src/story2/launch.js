// src/story2/launch.js — starts Story Mode 2.0. Lazy: the menu / deep link imports this file only
// when Story Mode starts, so the 5v5 code path never downloads src/story2/*.
//   import('./story2/launch.js').then((m) => m.openStoryPick(game))            STORY card → champion pick
//   import('./story2/launch.js').then((m) => m.launchStory(game, { champ }))    straight onto a floor
import StoryWorldScene from './StoryWorldScene.js';
import StoryPickScene from './StoryPickScene.js';

/** Register the story scenes once per page (idempotent). They start each other by key. */
export function ensureStoryScenes(game) {
  if (!game.scene.getScene('StoryWorldScene')) game.scene.add('StoryWorldScene', StoryWorldScene, false);
  if (!game.scene.getScene('StoryPickScene')) game.scene.add('StoryPickScene', StoryPickScene, false);
}

/** Start `key`, replacing `from` (a running scene) when given; from boot, just start it. */
function startFrom(game, from, key, data) {
  if (from?.scene?.start) from.scene.start(key, data); else game.scene.start(key, data);
}

/** The champion pick (free pick of every champion), then the floor. `from` = the scene to replace. */
export function openStoryPick(game, data = {}, from = null) {
  ensureStoryScenes(game);
  startFrom(game, from, 'StoryPickScene', data);
}

/** Straight onto a floor (the deep link with &champ=). */
export function launchStory(game, { champ = 'dev', name = 'Intern', floor = 'f1', spells = null } = {}, from = null) {
  ensureStoryScenes(game);
  startFrom(game, from, 'StoryWorldScene', { champ, name, floor, spells, story: true });
}

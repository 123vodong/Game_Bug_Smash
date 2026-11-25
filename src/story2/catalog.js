// src/story2/catalog.js — the Story Mode 2.0 floor list. Tiny and import-free on purpose: the main
// menu's STORY card reads it without loading the story engine (src/story2/launch.js stays lazy).
// The full floor data lives in floors/<id>.js; `ready` floors have one.
export const STORY_FLOORS = [
  { id: 'f1', n: 1, name: 'Basement', sub: 'Legacy Server Room', clock: '8:00 PM', ready: true,
    pitch: 'Smash the bug nest, find the blue keycard, take the stairs up. Someone is still at work down here.' },
  { id: 'f2', n: 2, name: '1F', sub: 'Open Office', clock: '9:00 PM', ready: false },
  { id: 'f3', n: 3, name: '2F', sub: 'Meeting Room Maze', clock: '10:00 PM', ready: false },
  { id: 'f4', n: 4, name: '3F', sub: 'QA Lab', clock: '11:00 PM', ready: false },
  { id: 'f5', n: 5, name: 'Rooftop', sub: 'Data Center', clock: '11:59 PM', ready: false },
];

export const STORY_DEFAULT_CHAMP = 'dev';
/** Summoner spells that do something on a story floor (no enemy champions or jungle camps yet). */
export const STORY_SPELLS = ['flash', 'heal', 'ghost', 'barrier'];

/** The floor to play next: the first ready floor not cleared yet, else the last ready one. */
export function nextStoryFloor(floors = {}) {
  const ready = STORY_FLOORS.filter((f) => f.ready);
  return ready.find((f) => !(floors[f.id]?.clears > 0)) || ready[ready.length - 1];
}

/** 4:05 from milliseconds. */
export function fmtRunTime(ms) {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

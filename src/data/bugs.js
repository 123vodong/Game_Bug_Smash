// Bug catalog for BUG SMASH: Deadline Hunter.
// Each entry tunes a bug's stats; visual sprite key matches the id.
//
// Fields:
//   hp         - smashes to kill
//   speed      - base px/s flee speed
//   lifetimeMs - escape after this duration if not killed (counts as unfixed)
//   panic      - panic-behavior multiplier (random direction changes / speed bursts)
//   score      - points granted on kill
//   radius     - collision/visual radius (px)

export const BUGS = {
  'bug-null':    { hp: 1, speed: 80,  lifetimeMs: 10000, panic: 1.0, score: 10, radius: 22 },
  'bug-ladybug': { hp: 1, speed: 70,  lifetimeMs: 10000, panic: 0.8, score: 10, radius: 22 },
  'bug-beetle':  { hp: 2, speed: 90,  lifetimeMs: 12000, panic: 1.0, score: 20, radius: 24 },
  'bug-scarab':  { hp: 3, speed: 60,  lifetimeMs: 14000, panic: 0.6, score: 30, radius: 26 },
  'bug-race':    { hp: 1, speed: 140, lifetimeMs: 8000,  panic: 1.5, score: 25, radius: 20 },
  'bug-robot':   { hp: 4, speed: 80,  lifetimeMs: 15000, panic: 0.5, score: 40, radius: 24 },
  'bug-toxic':   { hp: 2, speed: 110, lifetimeMs: 10000, panic: 1.2, score: 25, radius: 22 },
};

export const BUG_IDS = Object.keys(BUGS);

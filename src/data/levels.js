// Level catalog for BUG SMASH: Deadline Hunter.
// Each entry tunes one playable round. Fields:
//   id              - short id (e.g. '1-1')
//   world           - 1..4 grouping
//   name            - display name shown in HUD + overlays
//   timeLimitMs     - deadline duration
//   wave            - { bugId: count } initial wave composition
//   skillSpawnEveryMs - cadence for skill pickup drops
//   bugHpMul        - multiplier on each bug's HP (defaults 1)
//   bugSpeedMul     - multiplier on each bug's speed (defaults 1)
//
// Progression intent (per the design plan):
//   World 1 Junior Dev Hell    - few slow bugs, long deadlines, gentle ramp
//   World 2 Feature Creep      - more bugs, shorter deadlines, debuffs in play
//   World 3 Legacy Codebase    - tanky bugs (HP mul up), tougher to clear
//   World 4 AI-Assisted Chaos  - frequent skills, faster bugs, high pressure
//
// Balancing pass (Milestone 8): rough math = ~2.0s per base bug to kill including
// travel. HP mul scales kill time linearly. Deadlines tuned so the median player
// has ~10% slack at base; experts get 30%+ for time bonus.

export const LEVELS = [
  // ---- World 1: Junior Dev Hell (tutorial pacing) ----
  { id: '1-1', world: 1, name: 'World 1-1 · Onboarding',
    timeLimitMs: 60000,
    wave: { 'bug-null': 4, 'bug-ladybug': 4 },
    // The coach says "one click is a code review, not a fix" — the first 4
    // bugs take 2 hits so that's actually true (HuntScene applies this).
    tutorialBugs: { count: 4, hp: 2 },
    skillSpawnEveryMs: 9000 },

  { id: '1-2', world: 1, name: 'World 1-2 · Standup Crunch',
    timeLimitMs: 55000,
    wave: { 'bug-null': 4, 'bug-ladybug': 3, 'bug-beetle': 2 },
    skillSpawnEveryMs: 8500 },

  { id: '1-3', world: 1, name: 'World 1-3 · Friday Deploy',
    timeLimitMs: 55000,
    wave: { 'bug-null': 4, 'bug-ladybug': 3, 'bug-beetle': 2, 'bug-race': 2 },
    skillSpawnEveryMs: 7500 },

  // ---- World 2: Feature Creep (more bug variety, tighter deadlines) ----
  { id: '2-1', world: 2, name: 'World 2-1 · Feature Creep',
    timeLimitMs: 52000,
    wave: { 'bug-null': 3, 'bug-ladybug': 3, 'bug-beetle': 3, 'bug-race': 2, 'bug-toxic': 1 },
    skillSpawnEveryMs: 7000,
    gimmick: 'glitchRelocate' },

  { id: '2-2', world: 2, name: 'World 2-2 · Scope Change',
    timeLimitMs: 52000,
    wave: { 'bug-null': 3, 'bug-ladybug': 3, 'bug-beetle': 3, 'bug-race': 3, 'bug-toxic': 2 },
    skillSpawnEveryMs: 6500,
    gimmick: 'glitchRelocate' },

  { id: '2-3', world: 2, name: 'World 2-3 · Sprint Review',
    timeLimitMs: 50000,
    wave: { 'bug-null': 3, 'bug-ladybug': 3, 'bug-beetle': 3, 'bug-race': 3, 'bug-toxic': 2, 'bug-scarab': 1 },
    skillSpawnEveryMs: 6000,
    gimmick: 'glitchRelocate' },

  // ---- World 3: Legacy Codebase (tankier bugs, slightly longer windows) ----
  { id: '3-1', world: 3, name: 'World 3-1 · Legacy Codebase',
    timeLimitMs: 62000,
    wave: { 'bug-beetle': 4, 'bug-scarab': 3, 'bug-robot': 2 },
    bugHpMul: 1.25,
    skillSpawnEveryMs: 6500 },

  { id: '3-2', world: 3, name: 'World 3-2 · Tech Debt Audit',
    timeLimitMs: 64000,
    wave: { 'bug-beetle': 4, 'bug-scarab': 4, 'bug-robot': 3, 'bug-toxic': 2 },
    bugHpMul: 1.4,
    skillSpawnEveryMs: 6000 },

  { id: '3-3', world: 3, name: 'World 3-3 · CTO Code Review',
    timeLimitMs: 60000,
    wave: { 'bug-beetle': 4, 'bug-scarab': 4, 'bug-robot': 4, 'bug-toxic': 3 },
    bugHpMul: 1.3, bugSpeedMul: 1.1,   // EP-14: eased from 1.45 (playtest wall)
    skillSpawnEveryMs: 5500 },

  // ---- World 4: AI-Assisted Chaos (peak pressure, frequent skills to compensate) ----
  { id: '4-1', world: 4, name: 'World 4-1 · AI-Assisted Chaos',
    timeLimitMs: 62000,
    wave: { 'bug-null': 4, 'bug-ladybug': 4, 'bug-beetle': 3, 'bug-race': 3, 'bug-toxic': 3, 'bug-scarab': 2, 'bug-robot': 1 },
    bugSpeedMul: 1.1,
    skillSpawnEveryMs: 4000 },

  { id: '4-2', world: 4, name: 'World 4-2 · Vibe Coding',
    timeLimitMs: 65000,
    wave: { 'bug-null': 4, 'bug-ladybug': 4, 'bug-beetle': 4, 'bug-race': 4, 'bug-toxic': 3, 'bug-scarab': 2, 'bug-robot': 2 },
    bugHpMul: 1.05, bugSpeedMul: 1.1,
    skillSpawnEveryMs: 3800 },

  { id: '4-3', world: 4, name: 'World 4-3 · Production Hotfix',
    timeLimitMs: 60000,
    wave: { 'bug-null': 4, 'bug-ladybug': 4, 'bug-beetle': 4, 'bug-race': 4, 'bug-toxic': 4, 'bug-scarab': 3, 'bug-robot': 2 },
    bugHpMul: 1.1, bugSpeedMul: 1.15,
    skillSpawnEveryMs: 3500 },
];

export const TOTAL_LEVELS = LEVELS.length;

// Stars per clear (EP-14): 1★ = cleared · 2★ = ≥ 25 % of the deadline left ·
// 3★ = ≥ 45 % left. Saved via Progress.campaignClear(levelId, stars).
export const STAR_TIME_FRAC = { two: 0.25, three: 0.45 };

/** Stars for a clear with `timeLeftMs` of `timeLimitMs` remaining (1..3). */
export function starsFor(timeLeftMs, timeLimitMs) {
  const frac = Math.max(0, timeLeftMs) / Math.max(1, timeLimitMs);
  if (frac >= STAR_TIME_FRAC.three) return 3;
  if (frac >= STAR_TIME_FRAC.two) return 2;
  return 1;
}

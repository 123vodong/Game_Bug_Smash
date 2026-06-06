# Levels — 12 rounds across 4 worlds

Each level has: time limit, bug wave, skill drop cadence, optional HP/speed multipliers. Source: [levels.js](../../src/data/levels.js).

## World 1 · Junior Dev Hell — tutorial pacing
| ID | Name | Time | Wave (count) | Skill every | Mods |
|---|---|---|---|---|---|
| 1-1 | Onboarding | 60s | null×4, ladybug×4 (8) | 9s | — |
| 1-2 | Standup Crunch | 55s | null×4, ladybug×3, beetle×2 (9) | 8.5s | — |
| 1-3 | Friday Deploy | 55s | null×4, ladybug×3, beetle×2, race×2 (11) | 7.5s | — |

## World 2 · Feature Creep — variety + tighter windows
| ID | Name | Time | Wave (count) | Skill every | Mods |
|---|---|---|---|---|---|
| 2-1 | Feature Creep | 52s | + toxic introduced (12) | 7s | — |
| 2-2 | Scope Change | 52s | + more race/toxic (14) | 6.5s | — |
| 2-3 | Sprint Review | 50s | + scarab introduced (15) | 6s | — |

## World 3 · Legacy Codebase — tanky bugs
| ID | Name | Time | Wave (count) | Skill every | Mods |
|---|---|---|---|---|---|
| 3-1 | Legacy Codebase | 62s | beetle×4, scarab×3, robot×2 (9) | 6.5s | HP ×1.25 |
| 3-2 | Tech Debt Audit | 64s | + toxic (13) | 6s | HP ×1.4 |
| 3-3 | CTO Code Review | 60s | + heavier mix (15) | 5.5s | HP ×1.45, spd ×1.1 |

## World 4 · AI-Assisted Chaos — peak pressure, generous skills
| ID | Name | Time | Wave (count) | Skill every | Mods |
|---|---|---|---|---|---|
| 4-1 | AI-Assisted Chaos | 62s | all 7 types (20) | 4s | spd ×1.1 |
| 4-2 | Vibe Coding | 65s | denser mix (23) | 3.8s | HP ×1.05, spd ×1.1 |
| 4-3 | Production Hotfix | 60s | all 7 types max (25) | 3.5s | HP ×1.1, spd ×1.15 |

## Difficulty curve at a glance
- **Bug count** climbs 8 → 25 across 12 levels.
- **Time limit** intentionally non-monotonic — World 3 *adds* time to offset tank HP; World 4-3 holds 60s despite peak chaos because skill drops are nearly constant.
- **HP multiplier** only kicks in from 3-1 onward (the "legacy" gimmick).
- **Speed multiplier** appears in 3-3 and dominates all of World 4.
- **Skill cadence** tightens steeply in World 4 (3.5s) so the player has tools to cope.

## Per-level shared mechanics
- **Win** = clear all bugs before deadline. **Lose** = deadline hits 0 with bugs alive.
- **Hide/respawn**: dead-feigning bugs reappear faster as deadline progress climbs (3.5s → 1.1s).
- **Combo bonus** scales score: ×1.5 (3 hits) → ×2 (5) → ×3 (10).
- **Time bonus** on win: `timeLeftMs / 100` added to score.
- **Lose dialog branches** on kill ratio: <30% → badEnding, ≥70% → epic, else short. **Win dialog** uses `epic` if you finished with >50% time left.

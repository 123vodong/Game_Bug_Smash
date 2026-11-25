# 08 · Content

What's in the game today, what's near-term planned, what's parked.

---

## Single-player campaign

12 levels, 4 worlds. Win = clear all bugs before timer. See full table in [../overview_levels.md](../overview_levels.md).

### Worlds

| World | Theme | Levels | Difficulty curve |
|---|---|---|---|
| 1 — Junior Dev Hell | Tutorial pacing | 1-1 to 1-3 | Easy: HP-1 bugs, generous time |
| 2 — Feature Creep | Variety + tighter windows | 2-1 to 2-3 | Medium: HP-2 bugs introduced |
| 3 — Legacy Codebase | Tanky bugs (HP multiplier) | 3-1 to 3-3 | Tough: HP-multiplier slow grind |
| 4 — AI-Assisted Chaos | Peak pressure, frequent skills | 4-1 to 4-3 | Hard: all bug types, max density |

### Level structure

Each level defines:
- `timeLimitMs` — deadline duration
- `wave: { bugId: count }` — initial spawn
- `skillSpawnEveryMs` — pickup cadence
- `bugHpMul` — HP multiplier (World 3)
- `bugSpeedMul` — speed multiplier (Worlds 3-4)
- 🔵 `gimmick` field — currently has `'glitchRelocate'` on World 2 levels (one bug warps to a new spot every 12 s)

### Status: ✅ Shippable

The 12-level campaign is feature-complete and tuned. Ships as a 7.32 MB `BugSmashHunter.zip`. See [../../../README.txt](../../../README.txt) for the recipient's instructions.

---

## AI Skill pickups (SP only)

Auto-applied on player overlap. 5 kinds in [src/data/skills.js](../../../src/data/skills.js):

| Skill | Category | Effect |
|---|---|---|
| Claude Sonnet | Buff | Player speed × 1.5 for 5 s |
| Claude Opus | Buff (rare) | One-shot smash for 3 s |
| Claude Haiku | Debuff (chaos) | Random: slow player OR spawn extra bug per smash |
| Cursor | Utility | Teleport to nearest bug |
| GitHub Copilot | Chaos | All remaining bugs respawn |

🔵 **Design intent (MP):** port the skill pickup system into the MP arena. Server-spawned every ~6 s at random world coords; players collect on overlap. Big variety boost; medium cost (~1 session).

---

## Multiplayer arena modes

### Personal Mode — ✅ live

- **Persistent online world** — one global `arena` room, no round timer, no results screen
- Up to 32 players
- Single permanent map (the 6000×3375 arena)
- Bugs spawn continuously; **5 health pickups** always alive on the map
- Defeated players **drop bugs** (1–4 per defeat, scaled by their level when they fell)
- Score persists for the entire session; leaderboard updates live
- Players join + leave at any time
- 🔵 Global leaderboard backend → Phase E

### Team Mode — 🔵 planned (Phase C+D)

- **Room-based** with 6-char codes for create/join
- **Lobby** for team selection (up to 5 teams, host can split as needed)
- Friendly-fire OFF (teammates can't damage each other)
- **Recovery zones** (2 fixed corner safe-zones, neutral, regen +25/sec)
- **Multi-stage** match (5 stages, escalating bug variety + count)
- **Progressive respawn**: stage 1 = 3 s, stage 5 = 15 s
- No bug drop on defeat (Personal-only mechanic)
- **MVP screen** at match end (winner by score, ties → eliminations)

### v2 — Boss Arena (🔵)

- After a normal round, a **Mega Deadline Bug** appears for the final 30 s
- Multi-phase boss with telegraphed attacks
- All living players must coordinate
- Defeating the boss = special "deployed!" reward animation + cosmetic unlock

---

## Audio content

- Synth-generated SFX (no audio files shipped) — see [06_WORLD_AND_AESTHETIC.md § Audio](./06_WORLD_AND_AESTHETIC.md#audio-direction)
- No music in v0
- 🔵 Procedural background bassline for MP rounds (planned)

---

## Visual content (planned)

### Cosmetics 🔵

| Slot | Variants planned |
|---|---|
| Laptop skin | Default, cracked, neon, holographic, rusted |
| Hair | Default, afro, mohawk, balding, bun, anime spike |
| Accessory | Coffee mug, energy drink, mechanical keyboard, headset |
| Aura color | Default (player palette color), gold (Lv6 milestone), rainbow (special unlock) |

Unlocked via total smashes / rounds played / wins. **Never paid.**

### Title flavor 🔵

Above Lv6 = "Super Senior" baseline. Earned variants (cosmetic only):
- Tech Lead
- Architect
- Principal
- Distinguished
- Staff
- VP of Engineering

---

## Parked / cut content

| Item | Source | Why parked |
|---|---|---|
| Platformer Level 01 (Code Runner) | [../plan/LEVEL_01_CODE_RUNNER.md](../plan/LEVEL_01_CODE_RUNNER.md) | Dropped: the prototype (`PlatformerScene.js`) was removed on 2026-11-25 |
| Platformer Level 02 (Vertical Scroll) | [../plan/LEVEL_02_VERTICAL_SCROLL.md](../plan/LEVEL_02_VERTICAL_SCROLL.md) | Same — depends on Level 01 |
| Platformer Level 03 (Mixed Scroll) | [../plan/LEVEL_03_MIXED_SCROLL.md](../plan/LEVEL_03_MIXED_SCROLL.md) | Same — depends on engine layer |
| Full 3D Babylon rewrite | [../ideas/MULTIPLAYER_3D_PROPOSAL.md](../ideas/MULTIPLAYER_3D_PROPOSAL.md) | Pivoted to 2D MP after seeing TankGank achieve "looks 3D" with sprites |
| Bug release on death | Proposal §5 | SP-only mechanic; MP arena doesn't have a use yet |
| Safe-zone faster recovery from broken | Proposal §3 | Needs map geometry that doesn't exist |

Babylon scaffold preserved at [../recycle_bin/bug_smash_3d_babylon_scaffold/](../recycle_bin/bug_smash_3d_babylon_scaffold/) in case the 3D direction returns.

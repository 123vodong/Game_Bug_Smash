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
- Defeated players **drop bugs** (count scales with the score when they fell; see `server/game/rules.js`)
- Score persists for the entire session; leaderboard updates live
- Players join + leave at any time
- 🔵 Global leaderboard backend → Phase E

### Team Mode — ✅ live 5v5 MOBA

- **Live:** 5v5 office MOBA with team lobby/custom rooms, champion select, lanes, towers, jungle camps, epic objectives, items, augments, bots, ranked/rating, reconnect, and match results. This is not the old multi-stage FFA plan.
- See [docs/01_GAME_RULES_AND_MECHANICS.md](../../../docs/01_GAME_RULES_AND_MECHANICS.md) and [docs/05_MAP_VISION_SPELLS_AND_NETWORK.md](../../../docs/05_MAP_VISION_SPELLS_AND_NETWORK.md) for implemented rules and current verification limits.

### Story Mode 2.0 — in progress

- Top-down single-player adventure built on the 5v5 engine; the first floor has a prototype and free champion pick.
- The remaining floors and full campaign are design work, not a completed feature. See [11_STORY_MODE_2.md](./11_STORY_MODE_2.md).

---

## Audio content

- Synth-generated SFX (no audio files shipped) — see [06_WORLD_AND_AESTHETIC.md § Audio](./06_WORLD_AND_AESTHETIC.md#audio-direction)
- No music in v0
- 🔵 Procedural background bassline for MP rounds (planned)

---

## Visual content

### Cosmetics — implemented and planned

Twelve career-unlocked hats are implemented. The following additional slots remain ideas, not shipped features:

| Slot | State / variants |
|---|---|
| Hat | 12 career-unlocked variants implemented |
| Laptop skin | Planned: default, cracked, neon, holographic, rusted |
| Hair | Planned: default, afro, mohawk, balding, bun, anime spike |
| Accessory | Planned: coffee mug, energy drink, mechanical keyboard, headset |
| Aura color | Planned: default player color, gold (Lv6), rainbow |

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
| Side-view platformer | Removed prototype; no longer in scope | Story Mode 2.0 is top-down |
| Full 3D engine rewrite | Not in scope | Three.js is an opt-in renderer for the existing game, not a gameplay rewrite |
| Bug release on defeat | Implemented | Personal Mode drops bugs; it is not a future proposal |
| Safe-zone faster recovery from broken | Not planned for Personal Mode | Team Mode uses its separate fountain and recall mechanics |

# Design Documents

This folder describes **what the game is** and **why**. Runtime behavior is defined by source code; implementation tracking and verification state live in [../tasks/TASK_STATUS.md](../tasks/TASK_STATUS.md).

---

## Index

| Doc | Scope |
|---|---|
| [01_VISION.md](./01_VISION.md) | Pillars, fantasy, target audience, tone |
| [02_CORE_MECHANICS.md](./02_CORE_MECHANICS.md) | Movement, combat verbs, energy, state machine |
| [03_PROGRESSION.md](./03_PROGRESSION.md) | Stickyman growth, levels, XP, broken/reset |
| [04_MULTIPLAYER.md](./04_MULTIPLAYER.md) | Personal FFA arena, Team Mode, networking invariants |
| [05_CHARACTERS.md](./05_CHARACTERS.md) | Player stickman, bug bestiary, PM NPC |
| [06_WORLD_AND_AESTHETIC.md](./06_WORLD_AND_AESTHETIC.md) | Map, art direction, audio direction |
| [07_UX_AND_CONTROLS.md](./07_UX_AND_CONTROLS.md) | Input schemes, HUD, mobile considerations |
| [08_CONTENT.md](./08_CONTENT.md) | SP campaign levels, MP modes, future content |
| [09_BALANCE.md](./09_BALANCE.md) | Balance reference; verify and defer to code for runtime values |
| [10_ROADMAP.md](./10_ROADMAP.md) | Phased plan from current state to public launch |

---

## How to use this

1. **Pitching the game** → start at [01_VISION.md](./01_VISION.md).
2. **Tuning numbers** → verify the source in code first; use [09_BALANCE.md](./09_BALANCE.md) as a maintained reference, not as the runtime authority.
3. **Designing a new feature** → reference the relevant current doc when writing a proposal. Once implemented, update the design doc and [TASK_STATUS.md](../tasks/TASK_STATUS.md); don't preserve completed implementation breakdowns as active plans.
4. **Onboarding** → read 01 → 02 → 03 → 04 in that order. The rest is reference.

---

## Conventions

- **Imperative voice** ("the player smashes...") for current behavior.
- **Conditional voice** ("the player should...") for desired but unimplemented behavior — flagged with `🔵 design intent`.
- Concrete numbers in **bold**. If a number is in code AND in a doc, the code wins. Always check.
- When a section conflicts with an implementation, verify the code first, then fix the doc.

## Status legend used throughout

| Symbol | Meaning |
|---|---|
| ✅ | Implemented + verified |
| 🟡 | Implemented, needs playtest |
| 🔵 | Designed, not coded |
| ⚠️ | Known broken / regression risk |
| 🚫 | Cut from scope |

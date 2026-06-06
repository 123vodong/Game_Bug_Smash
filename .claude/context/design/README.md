# Design Documents

This folder describes **what the game is** and **why** — design intent, not implementation. For implementation tracking + status, see [../develop_notes/](../develop_notes/).

---

## Index

| Doc | Scope |
|---|---|
| [01_VISION.md](./01_VISION.md) | Pillars, fantasy, target audience, tone |
| [02_CORE_MECHANICS.md](./02_CORE_MECHANICS.md) | Movement, combat verbs, energy, state machine |
| [03_PROGRESSION.md](./03_PROGRESSION.md) | Stickyman growth, levels, XP, broken/reset |
| [04_MULTIPLAYER.md](./04_MULTIPLAYER.md) | Arena loop, rounds, server-authoritative model |
| [05_CHARACTERS.md](./05_CHARACTERS.md) | Player stickman, bug bestiary, PM NPC |
| [06_WORLD_AND_AESTHETIC.md](./06_WORLD_AND_AESTHETIC.md) | Map, art direction, audio direction |
| [07_UX_AND_CONTROLS.md](./07_UX_AND_CONTROLS.md) | Input schemes, HUD, mobile considerations |
| [08_CONTENT.md](./08_CONTENT.md) | SP campaign levels, MP modes, future content |
| [09_BALANCE.md](./09_BALANCE.md) | Single-source-of-truth for tunable numbers |
| [10_ROADMAP.md](./10_ROADMAP.md) | Phased plan from current state to public launch |

---

## How to use this

1. **Pitching the game** → start at [01_VISION.md](./01_VISION.md).
2. **Tuning numbers** → [09_BALANCE.md](./09_BALANCE.md) lists every dial. Change here first, then in code.
3. **Designing a new feature** → reference the relevant doc as you write a proposal (`ideas/`). Land the feature, then update the design doc.
4. **Onboarding** → read 01 → 02 → 03 → 04 in that order. The rest is reference.

---

## Conventions

- **Imperative voice** ("the player smashes...") for current behavior.
- **Conditional voice** ("the player should...") for desired but unimplemented behavior — flagged with `🔵 design intent`.
- Concrete numbers in **bold**. If a number is in code AND in a doc, the code wins. Always check.
- When a section conflicts with an implementation, fix the doc, not the player's experience.

## Status legend used throughout

| Symbol | Meaning |
|---|---|
| ✅ | Implemented + verified |
| 🟡 | Implemented, needs playtest |
| 🔵 | Designed, not coded |
| ⚠️ | Known broken / regression risk |
| 🚫 | Cut from scope |

---
name: bug-smasher-dev
description: Game dev helper for "Bug Smash Office: Deadline Panic" — a Phaser.js arcade game where an office worker smashes software bugs while being chased by Boss/PM/Tech Lead. Use when scaffolding scenes (Menu/Level/Smash/Boss), implementing movement & maze, adding bug enemies (Null/Memory Leak/Race Condition/Legacy/Deadline), chasers, AI skill power-ups (Claude Opus/Sonnet/Haiku, ChatGPT, Copilot, Cursor), combo/score systems, the Mega Deadline Bug boss fight, or polishing UI/audio. Trigger on requests touching gameplay, scenes/, systems/, or assets/ in this repo.
---

# Bug Smash Office: Deadline Panic — Dev Helper

Arcade chase-and-smash game (Pac-Man + Fruit Ninja + Whack-a-mole) for office/IT humor. Full design lives in [.claude/context/overview_game.md](.claude/context/overview_game.md) — read it before non-trivial work.

## Stack & layout

- **Engine:** Phaser.js (scenes, physics, input, audio built-in). Do not swap engines.
- **Structure:**
  ```
  /assets/{sprites,sounds}
  /src
    main.js
    scenes/   MenuScene.js LevelScene.js SmashScene.js BossScene.js
    systems/  AIManager.js BugSpawner.js PowerUpSystem.js
  index.html
  ```
- **Platform:** Web, desktop-first, mobile-friendly. Controls: WASD/arrows + mouse click/swipe; optional touch.

## Core entities

- **Player** — office worker, weapon = laptop (or giant mouse icon in Smash mode).
- **Bugs** (destroyable): Null (slow/random), Memory Leak (multiplies), Race Condition (teleports), Legacy (tanky), Deadline (chases player).
- **Chasers** (NOT destroyable, only avoid/stun): Boss (slow), PM (medium/unpredictable), Tech Lead (fast/aggressive).
- **Power-ups** — AI skill icons, temporary, stack-limited. Tier reflects perceived strength: Opus=S, Sonnet=A, ChatGPT=A, Haiku=B, Copilot=B, Cursor=C. See overview §7 for effects.

## Game loop

Spawn into maze → bugs roam/multiply → chasers pursue → player moves, smashes, grabs power-ups → clear bugs → next level. Caught = bad ending. Final level = Mega Deadline Bug (multi-phase, forces Chase↔Smash mode switches).

## Level progression

Open Office (tutorial) → Meeting Room Maze → Open Space Nightmare → Overtime Mode → Mixed Mode → Boss.

## When invoked

1. **Read the relevant scene/system file first** — don't guess Phaser API usage from memory.
2. **Follow the task breakdown** (overview §16) for ordering: base project → movement/maze → bugs → chasers → power-ups → smash scene → score/combo → boss → polish. Each step is independent and testable.
3. **Tune via data, not code.** Bug speed, spawn rates, power-up durations belong in config/level data.
4. **Keep visuals simple** — 2D flat/cartoon, bright readable colors. Placeholder sprites are fine; don't block on art.
5. **Verify in-browser** for gameplay-affecting changes (use the `run` skill or open index.html).

## What not to do

- Don't introduce Three.js, React, or a heavy build pipeline — Phaser + plain JS is the choice.
- Don't make chasers killable or bugs unkillable — that inverts the design.
- Don't hard-code level content into scene files; keep levels data-driven for expansion (overview §17).
- Don't write design docs or roadmaps — the overview already exists.

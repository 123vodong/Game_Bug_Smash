---
name: bug-smasher-dev
description: Game dev helper for "Bug Smash Office: Deadline Panic" — a Phaser.js arcade game where an office worker smashes software bugs while being chased by Boss/PM/Tech Lead. Use when scaffolding scenes (Menu/Level/Smash/Boss), implementing movement & maze, adding bug enemies (Null/Memory Leak/Race Condition/Legacy/Deadline), chasers, AI skill power-ups (Claude Opus/Sonnet/Haiku, ChatGPT, Copilot, Cursor), combo/score systems, the Mega Deadline Bug boss fight, or polishing UI/audio. Trigger on requests touching gameplay, scenes/, systems/, or assets/ in this repo.
---

# Bug Smash Office: Deadline Panic — Dev Helper

Arcade bug-smashing game for office/IT humor: a 12-level single-player campaign plus a
Colyseus multiplayer arena (Personal Mode) with AI coworkers, PM world events and the
Deadline boss. Current design lives in [.claude/context/design/README.md](../../context/design/README.md)
(start there); live status in [tasks/TASK_STATUS.md](../../context/tasks/TASK_STATUS.md).
For multi-step features, follow the agent-team pipeline in
[develop_notes/AGENT_TEAM.md](../../context/develop_notes/AGENT_TEAM.md) (roles in `.claude/agents/`).

## Stack & layout

- **Engine:** Phaser 3 via CDN, plain ES modules, no build step. Do not swap engines.
- **Structure (active):**
  ```
  index.html · src/main.js
  src/scenes/   MenuScene.js HuntScene.js (SP campaign) MultiPlayScene.js (MP arena)
  src/ui/       HUD.js MPOverlay.js          src/entities/  Hunter.js Bug(s).js SkillPickup.js MPBossView.js
  src/core/     AudioManager.js SaveManager.js   src/data/  levels bugs skills tips talk cosmetics missions
  server/       index.js · rooms/ArenaRoom.js · game/{rules,schema,BotDirector,EventDirector}.js · data/*.js
  tools/playtest/  sim.mjs (headless MP client) · shot.mjs (browser screenshots)
  ```
  Older Pac-Man-era files (LevelScene, BossScene, Maze, Chaser…) are on disk but unregistered.
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
5. **Verify in-browser** for gameplay-affecting changes: start `server/index.js` (serves the
   client too, http://localhost:2567), then use `tools/playtest/` — `sim.mjs` for server
   behavior (can force world events on a dev server), `shot.mjs` for screenshots + console errors.

## What not to do

- Don't introduce Three.js, React, or a heavy build pipeline — Phaser + plain JS is the choice.
- Don't make chasers killable or bugs unkillable — that inverts the design.
- Don't hard-code level content into scene files; keep levels data-driven for expansion (overview §17).
- Don't start new top-level design docs — extend `design/*.md`; feature breakdowns go in `tasks/`.

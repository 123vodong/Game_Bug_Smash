# Bug Smash Office: Deadline Panic — Task Tracker

## Tech Stack — CURRENT (2D, reverted)
- **Phaser 3** via CDN, vanilla JS ES modules, **no build step**.
- Reverted from Three.js 3D because portability was painful (npm install needed on every machine).

## Running it
Open the project folder in VS Code and use the **Live Server** extension on `index.html`. Or from a terminal:
```
npx serve .
```
Then open the printed URL (usually http://localhost:3000). ES modules require http://, not file://.

## Sharing with others
Just zip the folder. Recipient opens `index.html` via any static server (Live Server, `npx serve`, `python -m http.server`). No npm, no Node required.

## Project tree
Pure 2D Phaser. No build config, no `node_modules`. Just HTML, CSS, JS, served statically.

## Bug catalog (data-driven)
Bugs are defined in [src/data/bugs.js](src/data/bugs.js) — single source of truth for stats, behaviors, weaknesses, AI-skill effectiveness, and dialog. The generic [Bug entity](src/entities/Bugs.js) dispatches behavior by `id`. To add a new bug: add an entry to `BUGS`, drop a PNG in `assets/bugs/`, add the sprite key to `BUG_SPRITE_FILES` in [MenuScene](src/scenes/MenuScene.js).

Currently 8 bugs: `classic_bug`, `logic_bug`, `legacy_bug`, `memory_leaker`, `heisenbug`, `race_condition`, `critical_bug`, `dead_bug`.

Implemented behaviors: slow_wander, direction_switch, group_swarm (cohesion), slow_push (chase), burst_speed, teleport_on_observe, area_control (orbit), idle (+ revive).
Implemented specials: hp_increase_over_time, spawn_extra, first_hit_immunity (with telegraph), aoe_on_death, revive_chance.
Implemented combat: per-skill `weakness` triple-damage, `ai_interaction` low/medium/high multipliers, dialog bubble on death.

## Status Legend
- [x] done
- [~] partial / stubbed
- [ ] not started

---

## Done (3D pass)

### Build / Infra
- [x] Vite + TypeScript + Three.js scaffold (`package.json`, `tsconfig.json`, `vite.config.ts`)
- [x] DOM overlay layout (`index.html`) for menu, HUD, lose/win screens

### Core
- [x] `Game` engine (render loop, scene swap, camera follow, resize)
- [x] `Input` (keyboard + mouse abstraction with justPressed)
- [x] `SaveManager` (LocalStorage: high score, Opus unlock)
- [x] `AudioManager` (WebAudio beeps for smash/bugDeath/combo/skill/caught/victory)

### Data
- [x] `skills.ts` — all 6 AI skills (Haiku/Sonnet/Opus/ChatGPT/Copilot/Cursor) typed
- [x] `tips.ts` — three pools (default, opus-unlocked, active-skill)
- [x] `levels.ts` — Levels 1–6 (boss flag for L6), chaser & bug defs

### Systems
- [x] `TipManager` (state-aware: switches pool when Opus is unlocked)
- [x] `ComboSystem` (1.5 s window, 5 tiers, multipliers up to x5)
- [x] `ScoreSystem` (score, kills, max combo, S/A/B/C grading)
- [x] `AISkillManager` (3 slots, cooldowns, all 6 skill effects including Opus slowmo + auto-smash + chaser freeze)

### Entities (low-poly 3D)
- [x] `Player` — toon-shaded box body, ico head, glasses, laptop; movement, dash with i-frames, stamina, smash cone
- [x] `Bug` — five types: null/memory/race/legacy/deadline with per-type AI (wander, multiply, teleport, tanky, chase)
- [x] `Chaser` — Boss/PM/TechLead with canvas-texture nameplate sprite; freeze + stun support

### Scenes
- [x] `MenuScene` — 3D animated office: orbit camera, low-poly desks/monitors, scuttling bugs, dev + boss running circles
- [x] `LevelScene` — full gameplay loop (movement, bugs, chasers, smash, skills, pickups, combo, score, win/lose)

### UI
- [x] DOM main menu (title, 4 buttons, hover/scale feedback)
- [x] Tips panel with fade rotation every 5 s (state-aware via TipManager)
- [x] In-game HUD (bugs, level, score, combo, 3 skill slots with cooldown rings, stamina bar, proximity warning, active-skill ticker)
- [x] Game Over overlay (retry / menu)
- [x] Victory overlay (final score, grade, high score)

---

## Deferred (next passes)

### Polish
- [x] Pause menu (Esc toggles; resume + quit-to-menu)
- [x] Opus full-screen gold vignette + "FOCUS MODE" banner
- [ ] Settings panel (audio sliders, key rebinding)
- [ ] Achievements UI
- [ ] Real glTF character/bug/office models (currently primitives)
- [ ] Toon outline post-processing pass
- [x] Music tracks (synthesized chiptune: menu / level / boss; M to mute)
- [ ] Particle VFX for smash impacts (currently just a scaling burst)

### Gameplay
- [x] **Pac-Man maze system** ([Maze.js](src/systems/Maze.js), [mazes.js](src/data/mazes.js))
  - 26×15 tile grid (48px tiles) with hand-authored layouts for L1–L5
  - Collidable walls for player, chasers, and bugs (bugs bounce)
  - Edge tunnel wraparound (`T` cells in maze data)
  - BFS pathing for chasers
  - Bugs and skill pickups spawn on floor tiles only
## ⏸️ Paused (2026-05-24): procedural office layout generator

Project pivoted to a hyper-casual bug-smash variant. All Pac-Man-style office-layout tooling has been moved into [tools/_paused_office_layout/](tools/_paused_office_layout/) and quarantined from the active game. See that folder's `README.md` for resume instructions.

**Active vs paused, at a glance:**

| Carried forward (active) | Quarantined (paused) |
|---|---|
| Phaser 2D engine, Live Server-runnable | `tools/_paused_office_layout/render-level.py` (procedural generator + validator) |
| Bug catalog (8 types) + per-type behaviors | `tools/_paused_office_layout/render-level-1.py` (older draft) |
| Player + Chaser + Bug entities | `tools/_paused_office_layout/blender-office-setup.py` |
| AI Skill system (6 skills) | `assets/level_bg/L1.png` (last partial render) |
| Combo / Score / HUD / Music systems | `assets/level_bg/layout_report.json` (last validation report) |
| Menu / Game-over / Victory scenes | Backdrop loading in [LevelScene](src/scenes/LevelScene.js) (still wired but `backdrop:` fields in [levels.js](src/data/levels.js) are commented out) |
| Bug sprites (`assets/bugs/`), Character sprites (`assets/characters/`), 119 office prop PNGs (`assets/office/`) | — |
| Per-prop renderer (`tools/render-obj-to-png.py`), splitters (`split-bugs.ps1`, `split-characters.ps1`) | — |

**Effect on the playable game**: it still runs (Live Server / `npx serve .` on `index.html`) and behaves as the Pac-Man-style bug-smasher. Levels now use the procedural Maze (gray walls + scattered props) since the partial L1 backdrop is no longer loaded.

- [x] **Hand-designed level backdrops** (optional per level)
  - [tools/blender-office-setup.py](tools/blender-office-setup.py) sets up Blender (top-down ortho camera, lights, 26×15 grid overlay at 1248×720)
  - Designer composes the office layout in Blender, renders to PNG, drops in [assets/level_bg/](assets/level_bg/) as `L<N>.png`
  - Game auto-loads if present; falls back to procedural Pac-Man walls if missing
  - See [assets/level_bg/README.md](assets/level_bg/README.md) for full workflow
- [x] **3D-rendered office props** ([assets/office/](assets/office/))
  - 119 PNG sprites batch-rendered from Voxel Office Pack via [tools/render-obj-to-png.py](tools/render-obj-to-png.py) (Blender)
  - Maze walls use the cubicle sprite (`office-wall`) instead of plain rectangles
  - 10 decorative props (tables, chairs, trashcans, clocks, coffee tables) scattered on floor tiles each level for office atmosphere
  - Many more props available (16 chairs, 20 cubicles, 64 misc, 19 tables) — pick keys from `assets/office/`
- [x] **Distinct chaser AIs** ([Chaser.js](src/entities/Chaser.js))
  - Boss = Blinky (direct pursuit, BFS to player tile)
  - PM = Pinky (ambush, BFS to tile 4 ahead of player's facing)
  - Tech Lead = Inky (flank, BFS to vector boss→player extended through player)
  - Replan every 250ms; chases naturally route around walls
- [x] Boss scene v2 — 3-boss redesign per [src/data/bosses.js](src/data/bosses.js):
  - PM (support, patrols + scope_change spawns + urgent_ping stamina drain, weakness: chatgpt)
  - Tech Lead (adaptive_chase + code_review reflect on spam + refactor_request disables skills for 6s, weakness: claude_opus)
  - Deadline (environment, 180s countdown with phase banners at 120/60/30, cannot be killed)
  - Synergies wired: `pm_alive && deadline<60` → bonus logic_bug spawns every 5s; `tl_alive && spam` → damage reflect via i-frame penalty
  - Endings: bad ("Why wasn't this tested?" → GameOver), good ("Good job. Let's ship." → Victory)
  - Bug kills push deadline +0.5s, skill activations push it +3s, boss defeats grant +20s
- [ ] Procedural cubicle maze layouts (current arena is flat with a few dividers)
- [ ] Throwable stapler stun

### Multiplayer / Social
- [ ] Local 2-player (second input set, shared screen)
- [ ] Online leaderboard (Supabase or similar)
- [ ] Daily challenge (seeded RNG)
- [ ] Replay capture / GIF export

### Expansion
- [ ] Programming-language themed bug skins
- [ ] Company-themed level packs
- [ ] Mod / level editor
- [ ] Mobile touch controls

---

## Files Map (3D)

```
package.json, tsconfig.json, vite.config.ts, index.html
src/
  main.ts                         entry — wires Menu ↔ Level transitions
  core/
    Game.ts                       render loop, scene manager, camera follow
    Input.ts                      keyboard + mouse
    SaveManager.ts                LocalStorage
    AudioManager.ts               WebAudio beeps
  data/
    skills.ts                     6 AI skills + types
    tips.ts                       3 tip pools
    levels.ts                     LEVELS, BUG_DEFS, CHASER_DEFS
  systems/
    TipManager.ts                 state-aware tip selection
    ComboSystem.ts                combo timer + multiplier
    ScoreSystem.ts                score + grade
    AISkillManager.ts             slot/cooldown/effect dispatch
  entities/
    Player.ts                     mesh + movement/dash/smash
    Bug.ts                        5 bug behaviors
    Chaser.ts                     3 chasers with seek AI
  scenes/
    MenuScene.ts                  3D animated office menu
    LevelScene.ts                 core gameplay
    BossScene.ts                  Mega Deadline Bug — 3 phases, slams, sub-bugs
  ui/
    HUD.ts                        DOM HUD binding
    Menu.ts                       DOM menu + overlay binding
```

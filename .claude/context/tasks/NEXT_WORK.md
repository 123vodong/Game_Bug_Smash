# Next work (handoff between sessions)

**Written:** 2026-11-24, late evening. **Updated:** 2026-11-25, after the user answered the Story Mode questions (free pick, one map per floor, a new STORY card).
**Mandate:** the user said "Free to decide by yourself", asked for a 4 AM continuation, and set these directions:
1. **Story Mode:** stop following the Forgotten Warrior side-view model. Rebuild it on the 5v5 game: a map like the 5v5 one but more spacious, with more doors. Smash bugs, adventure, explore, and put the 5v5 champions into the story.
2. **Drop the donation button.**
3. **5v5:** more items and more champions. Check whether the bots are weak, and fix them.

## Rules for any session working from this file

- **Commits:** one concise line, **no Co-Authored-By trailer**. Scheduled runs commit locally at each milestone (the user allowed that for those runs); in a live session, commit only when the user asks.
- **No push, merge or PR.** Pushing was refused by the permission check on 2026-11-24, so the user does it.
- **Never** set `BUG_SMASH_DEBUG` on port 2567. The local server on :2567 serves the working tree of whichever branch is checked out. Debug servers go on :2650.
- **Gates** (run from `tools/playtest`):

  | Gate | Command | Pass |
  |---|---|---|
  | 5v5 server | `node team_ff.mjs 10 45 --quiet` | 0 exceptions, 0 stuck, 0 inside a wall |
  | 5v5 exploits | `SERVER=ws://localhost:2650 node team_sim.mjs --exploits` | all PASS (118) |
  | 5v5 online UI | `GAME_URL=http://localhost:2650/ node pass2_ui.mjs <outDir>` | 16/16 |
  | 5v5 offline | `GAME_URL=http://localhost:2650/ node offline_check.mjs <outDir>` | 6/6 |
  | Story Mode 2.0 | `GAME_URL=http://localhost:2650/ node story2_check.mjs <outDir>` | 18/18 |
  | Story menu + pick | `GAME_URL=http://localhost:2650/ node story2_pick_check.mjs <outDir>` | 29/29 (about 2.5 min: every champion plays the floor) |

  The debug server: `BUG_SMASH_DEBUG=1 BUG_SMASH_RANKS=memory PORT=2650 node server/index.js`. Restart it after server code changes.
- **Syntax check:** `node --check` does NOT catch syntax errors in these ES module files (a broken file passes). Parse with `vm.SourceTextModule` instead (`node --experimental-vm-modules`), or load the page and watch for page errors.
- Local `main` is stale (it stops at PR #2). **Always branch from `origin/main`** (after `git fetch origin`), then run `git branch --unset-upstream`.

## Branches (none pushed)

| Branch | Tip | Based on | What is in it |
|---|---|---|---|
| `chore/drop-donation` | `003318c` | origin/main | Donation button, `DonatePanel.js` and `assets/donate/` removed. |
| `feat/5v5-more` | `450824e` | origin/main | Adaptive bots; 6 items + 5-column shop; 2 champions (Brew, Pager); balance notes. |
| `feat/story-2` | latest | **feat/5v5-more** (stacked) | Story Mode 2.0: design doc, engine "worlds", playable floor 1 prototype, STORY card + free pick. |
| `feat/story-mode` | `4136a43` | older main | The superseded side-view Story Mode. Parts bin only. |

**Push order for the user:** `chore/drop-donation` (independent), then `feat/5v5-more`, then `feat/story-2` (its PR shows the 5v5 commits until `feat/5v5-more` is merged).

## Done on 2026-11-24: the bots

Adaptive Easy / Normal / Hard bots, picked at match start from the humans' average hidden MMR (< 1050 Easy = the old bots, 1050–1199 Normal, ≥ 1200 Hard; bots-only = Normal). Measured kills per match: 17.8 / 23.9 / 43.2. Details: `09_BALANCE.md` → "5v5 more".

## Done on 2026-11-25

### 1. Six new items (`feat/5v5-more`, `9ece915`)

| Item | Cost | Stats |
|---|---|---|
| Caffeine Pills 💊 (basic) | 350 | +12% AS |
| Red Pen 🖊️ (basic) | 450 | +6 AD, 6% lifesteal |
| Kanban Board 🗂️ | 1800 | +30 AD, +250 HP, 10% CDR |
| Team Lunch 🍱 | 1500 | +200 HP, +200 mana, 15% CDR |
| Firewall Appliance 🧱 | 2000 | +65 AP, +40 armor |
| Midnight Oil 🕯️ | 2200 | +80 AP, 12% lifesteal (skills too) |

- Changed from the plan:
  - "Overclocked CPU" (AP + attack speed) became Midnight Oil, because basic attacks don't scale with AP.
  - Kanban uses 🗂️, because 📋 is Brick's W icon.
- The shop is now 5 columns × 7 rows (1174 × 612). The fallback shop is 8 × 4.
- 12 champion builds use the new items.
- `team_ff` now prints the items held at the end of each match.
- `pass2_ui` reads shop positions from the panel and checks that all 31 tiles fit.

### 2. Two new champions (`feat/5v5-more`, `e87c7df` + `450824e`)

The planned themes collided: Sprint is already "the Scrum Master" and Zero is "the Security Ninja", with Pen Test and Zero-Day. New themes:
- **Brew, the Office Barista** (support):
  - Q Hot Pour: piercing slow shot.
  - W Espresso Shot: team +25% AS, +15% MS.
  - E Decaf: delayed 1 s stun circle.
  - R Break Room: a 4 s zone that heals allies and slows enemies (the first healing zone in the game).
- **Pager, the On-Call SRE** (jungler):
  - Q Ping: piercing slow, the main damage skill.
  - W Incident Mode: shield, damage reduction, MS, AS.
  - E Revert: a 400 blink.
  - R On My Way: a 950-range, champion-only dash with a 1.2 s stun.
- New costume parts in `looks.js`:
  - outfits: barista apron, on-call hoodie;
  - hats: flat cap, sleep mask;
  - props: mug, pager;
  - projectiles: coffee, ping.
- The select screen has 9 columns; the hub's 6 × 3 grid fits 18.
- Fixes:
  - a `toTarget` dash with `targets: 'enemyChamp'` now locks onto champions only (server);
  - the offline sim's targeted dash matched the server too loosely; it now stops at contact and hits only the target;
  - zone heals show "per tick" in the skill tooltip.
- **Balance tool:** `team_ff --feature=id` puts that champion on exactly one team, blue in even matches and red in odd ones.

| Champion | Win rate |
|---|---|
| Brew | 47% featured (30 matches); 53–55% as a natural pick |
| Pager | 40%, then 37% after a first buff, then **57%** (40 matches) once Ping became its main damage skill |

### 3. Story Mode 2.0 (`feat/story-2`)

- **Design:** [`.claude/context/design/11_STORY_MODE_2.md`](../design/11_STORY_MODE_2.md) covers the pitch, floors 1–5, systems, architecture, the floor file format, milestones and open questions.
- **Engine worlds** (`ebbe6cf`, no 5v5 behavior change):
  - `shared/moba/nav.js` exposes `createNav({ walls, w, h })` with `setDynamic(id, wall | null)` for doors (patches only the cached A* cells around the door). The old exports are the 5v5 instance: 0 differences over 16,000 random queries.
  - `src/entities/moba/world.js`: `WORLD_5V5` and `makeWorld(floor)`.
  - TeamModeScene, OfflineSim and the MobaHud minimap read size, fountains, bushes and nav from `this.world`.
  - TeamModeScene hooks: `_makeWorld`, `_makeMap`, `_startWorld`; the constructor takes a key.
  - MobaMap exports its wall and plant art; `wallLayout(k, walls)`.
  - Unit-kind registry in `looks.js` (`registerUnitKinds`).
- **Prototype M1** (`a5dbd4f`), **play it at `?scene=story&champ=dev`** (any champion id):
  - `src/story2/`: StoryWorldScene, StorySim, FloorMap, `bugs.js`, `floors/f1.js`, `launch.js`. Lazy-loaded through a dynamic import in `main.js`.
  - Floor 1, "Basement · Legacy Server Room", 7200 × 4800: 7 rooms around a hallway.
  - Gameplay:
    - bug packs (Null, Ladybug, Beetle, Race Condition) with aggro, pack wake-up, leash and bush stealth;
    - a bug nest in a **lock-in** room that drops the **blue keycard**, which opens the Records door;
    - **Ops** in the Manager's Office talks, then **joins as an ally** with its full kit;
    - the break room heals, sells items and is where you respawn;
    - the stairs up clear the floor and show the FLOOR CLEARED panel.
  - UI:
    - dialogue box (Rubber Duck and champion portraits; a conversation you start cuts in);
    - objective tracker in the HUD top bar;
    - pickups (coffee, gold, keycard, note);
    - TALK prompt (T or click).
- **Tests:** `story2_check` 18/18, `offline_check` 6/6, `pass2_ui` 16/16, `team_ff` 0 exceptions / stuck / in-wall, `team_sim --exploits` 118/118.

### 4. The user's Story Mode decisions, applied (`feat/story-2`)

The user answered: **free pick, one map per floor, add a new story card.**
- **Menu:** a STORY MODE card on the left of the main menu, mirroring DAILY MISSIONS. It shows:
  - your story champion's portrait;
  - the next floor (name, clock, room);
  - 5 floor pips and your best time;
  - a PLAY STORY strip.
  - Tap it or press **S**. `src/story2` is still downloaded only at that moment.
- **Free pick:** `src/story2/StoryPickScene.js`.
  - All 18 champions in a 9 × 2 grid, no locks; the skill detail of the hovered / picked champion.
  - Tonight's floor with the 5-floor ladder.
  - Summoner spells (Alt+Tab, Coffee Break, Overtime, Ctrl+Z; click or D / F).
  - START, and MENU / ESC back.
  - The pick is saved in `SaveManager.story2` (`getStory2`, `setStory2Pick`, `recordStory2Clear`).
- **One map per floor:** already how floor 1 works; recorded in the design doc. `src/story2/catalog.js` lists the 5 floors (only floor 1 is ready).
- **FLOOR CLEARED:** records the clear and the best time; buttons PLAY AGAIN · CHAMPION (back to the pick) · MENU.
- **Deep links:** `?scene=story` opens the pick; `?scene=story&champ=<id>` goes straight onto the floor.
- **Free-pick fixes:**
  - Four ultimates only hit champions in 5v5: Zero-Day (Zero), Merge Conflict (Patch), On My Way (Pager) and Regression Barrage (Tester). Floor 1 has no enemy champions, so they did nothing there. In Story Mode they now hit bugs and nests. Hooks with the old behavior as the default: `OfflineSim._champTargetOk` and `TeamModeScene._champOnly`; the story classes override them.
  - If you play Ops, floor 1's Ops NPC becomes Brew (`alt` in the floor file, else another champion of the same lane). The NPC lines are spoken by the stand-in.
- **A regression the gates caught and fixed:** the menu first loaded the stickman image under the shared `stick-idle` key. A direct link (`?scene=team&offline=1`) then loaded it twice, and Phaser logged "Texture key already in use". The menu now loads its own copy (`menu-stick`), and `drawChampionPortrait` takes the key as an optional last argument.
- **Merge:** a dry-run merge with `chore/drop-donation` (which also edits MenuScene) is clean.
- **Tests:**

  | Check | Result |
  |---|---|
  | `story2_pick_check` (new) | 29/29: every champion starts the floor and casts Q W E R; the four champion-only ults hit bugs |
  | `story2_check` | 18/18 |
  | `offline_check` | 6/6, three runs |
  | `pass2_ui` | 16/16 |
  | `team_ff` (10 matches) | 0 exceptions, 0 stuck, 0 inside a wall |
  | `team_sim --exploits` | 118/118 |

## Next steps, in order

1. **Story M2: floor 1 complete** (`feat/story-2`):
   - the Zero lieutenant arena: an enemy champion on the bot brain with an HP multiplier and adds, who joins after the fight. If the player picked Zero, a stand-in takes the part (same `alt` rule as the NPCs);
   - save and load mid-floor (`SaveManager.story2` already holds the pick and the clears; add the checkpoint = break room);
   - switching champion at a break room (design §3); today you switch between runs (CHAMPION on FLOOR CLEARED);
   - `story2_floor_check.mjs`: rooms reachable with the right keys, doors not overlapping walls;
   - a touch pass (TALK button on phones);
   - floor music.
2. **Story M3–M5:** floors 2–5 per the design doc (chasers, secret doors, the PM's door shuffles, the THE DEADLINE boss, the ending).
3. **Housekeeping:**
   - `feat/story-mode`'s `ShopCloset` lays items out in rows of 5 from `SHOP_ORDER`. If that branch is ever merged after `feat/5v5-more`, it needs the 7-row layout. Better: delete the branch once M2 lands.
   - Possible 5v5 follow-ups: last-hit prediction for the bots; a bot-level choice for custom-room hosts.

## Decisions for the user

1. Push and merge the three branches in the order above.
2. Still open (design doc §6): delete the side-view Story Mode on `feat/story-mode`, or keep it as a bonus "Retro" mode?

Answered on 2026-11-25: free champion pick · one map per floor · a new STORY card.

## How to report back

Update this file at the end of each session (Done / Next) and give the user a short summary: what changed, test numbers, branches and commits, and anything that needs their decision.

# Next work (handoff for the scheduled 4 AM run and later sessions)

**Written:** 2026-11-24, late evening.
**Mandate:** the user said "Free to decide by yourself", asked for a 4 AM continuation, and set these directions:
1. **Story Mode:** stop following the Forgotten Warrior side-view model. Rebuild it on the 5v5 game: a map like the 5v5 one but more spacious, with more doors. Smash bugs, adventure, explore, and put the 5v5 champions into the story.
2. **Drop the donation button.**
3. **5v5:** more items and more champions. Check whether the bots are weak, and fix them.

## Rules for any session working from this file

- **Commits:** commit locally at each milestone, one concise line, **no Co-Authored-By trailer**.
- **No push, merge or PR.** Pushing was refused by the permission check on 2026-11-24, so the user does it.
- **Never** set `BUG_SMASH_DEBUG` on port 2567. The local server on :2567 serves the working tree of whichever branch is checked out.
- **Gates:**
  - 5v5: `cd tools/playtest && node team_ff.mjs 10 45 --quiet` must report 0 exceptions, 0 stuck, 0 inside a wall.
  - Story: `node tools/playtest/story_rooms_check.mjs` and `GAME_URL=http://localhost:2567/ node tools/playtest/story_check.mjs <outDir>` on a Story branch.
- Local `main` is stale (it stops at PR #2). **Always branch from `origin/main`** (after `git fetch origin`), then run `git branch --unset-upstream`.

## Branches

| Branch | State | What is in it |
|---|---|---|
| `chore/drop-donation` | committed `003318c`, **not pushed** | Donation button, `DonatePanel.js` and `assets/donate/` removed. Menu checked in the browser: renders, no errors. |
| `feat/5v5-more` | committed `35434f6`, not pushed | Adaptive bots (below). **Continue the 5v5 work here.** |
| `feat/story-mode` | committed `4136a43`, not pushed | Side-view Story Mode (Milestones A/B and the 1-1 rebuild). Superseded by the new direction; keep it for reuse (StoryDialog, script, save keys, art). |

## Done on 2026-11-24: the bots

**Diagnosis** (`team_ff`, 10–30 bots-only matches):
- **Passive:** about 8 kills by 9:00 (both teams); laners at about 1.8 K / 1.5 D per match.
- **Poor farming:** about 2.5–4 CS per minute.
- **Gold piles up:** 1,000–2,000 unspent gold at the end, because bots only buy the next item in build order.
- **Spare humans on purpose:** no fights for 5:00, no ganks for 5:00, mercy after 2 deaths in 3:00. A seat driven by the same brain but flagged human died 1.8 times a match, against 2.8 for the enemy bot.

**Fix** (`server/game/moba/MobaBots.js` `BOT_SKILL`; `TeamRoom._botSkillLevel()`; `Ranking.skill()`):
- **Levels:** Easy, Normal and Hard, picked at match start from the humans' **average hidden MMR**.
  - Under 1050 → Easy, which is the old behaviour, so every new player starts here.
  - 1050 to under 1200 → Normal. 1200 and up → Hard.
  - Bots-only matches play Normal.
- **What a level sets:** grace, gank grace and mercy; retreat and fight HP thresholds; danger ratio; think speed; aim and aggression rolls; a "step into range when a minion is nearly dead" multiplier; and `shopAny` (Normal and Hard buy the first affordable build item).
- **Feed line at match start:** "🤖 AI coworkers: Normal (they adapt to how well you play)".
- **Harness:** `team_ff.mjs --botskill=easy|normal|hard`.

**Measured** (10 matches per level, seed 7):

| Level | Kills per match | Items per bot |
|---|---|---|
| Easy | 17.8 | 3.7 |
| Normal | 23.9 | 4.2 |
| Hard | 43.2 | 4.8 |

A passive newcomer (`--human=lane`) dies 0 times by 5:00 on Easy, and 1–3 times on Normal or Hard.

Possible follow-ups:
- **Last-hit prediction** (CS barely moved): count allied minions attacking the target and their hit timing.
- **Difficulty choice:** let the host of a custom room pick the bot level.

## Next steps, in order

### 1. 5v5: six new items (branch `feat/5v5-more`)

Use only the existing stats (`ad ap hp mana armor ms as haste lifesteal apPct`), so the server, the Story gear adapter and the bots need no new mechanics:

| id | name | tier | cost | stats | fills the gap |
|---|---|---|---|---|---|
| `caffeine` | Caffeine Pills 💊 | basic | 350 | as 0.15 | no basic attack-speed item |
| `red_pen` | Red Pen 🖊️ | basic | 450 | ad 6, lifesteal 0.06 | no basic sustain |
| `kanban` | Kanban Board 📋 | core | 1800 | ad 30, hp 250, haste 0.1 | fighters (AD + HP) |
| `team_lunch` | Team Lunch 🍱 | core | 1600 | hp 200, mana 200, haste 0.15 | supports |
| `firewall` | Firewall Appliance 🧱 | core | 2000 | ap 65, armor 40 | battle mages |
| `overclock` | Overclocked CPU 🔥 | core | 2600 | ap 80, as 0.3 | on-hit mages, late game |

- **Shop screens:** `SHOP_ORDER` grows to 31 items. Both shops are fixed 5×5 grids and need a new layout:
  - `src/ui/moba/ShopPanel.js` (5v5);
  - `src/story/ShopCloset.js` on `feat/story-mode` only.
  - Check every tile still fits at 1280×720 and on phones.
- **Builds:** put the new items into a few `build` lists in `shared/moba/champions.js` (e.g. `kanban` for fighters, `team_lunch` for supports).
- **Gates:** run `team_ff` (no exceptions; champion win rates still roughly 35–65% over 20+ matches). On a debug server on :2650 (never :2567), run `team_sim --exploits` and `pass2_ui`.

### 2. 5v5: two new champions (same branch)

Data-driven (`shared/moba/champions.js`). Reuse existing skill types and existing look parts from `src/entities/moba/looks.js` (outfit, hat, prop, palette). Check that ids and names are unique (`sprint` is already taken). Proposals:

**`scrum`: "Standup, the Scrum Master"** (support, ranged ~525). Look: shirt, clipboard prop if there is one, palette yellow/teal.
- **Q** Daily Stand-up: `circle`, radius 220, 400 ms telegraph, small damage, stun 0.8 s.
- **W** Velocity: `allies` buff, msPct + as.
- **E** Timebox: `zone`, 2.5 s, slows and ticks damage.
- **R** Retrospective: `allies` heal plus shield.

**`sec`: "Pentest, the Security Engineer"** (jungle assassin, melee). Look: dark hoodie, headset, palette black/green.
- **Q** Port Scan: `projectile` with slow.
- **W** Firewall: `self` shield plus dmgReduction.
- **E** Zero-Day: `dash` toTarget.
- **R** Exploit: `target` enemyChamp with `execute { missingHpPct }`.

Also:
- **Picks:** add them to `ROLE_PICKS` / `ROLE_ORDER` so bots draft them.
- **Select screen:** check `TeamSelectScene` fits 18 champions.
- **Balance:** win rates of the new two in `team_ff` (30+ matches) should land at 40–60%. Tune base, growth and damage if not.

### 3. Story Mode 2.0: built on the 5v5 game

First write `.claude/context/design/STORY_MODE_2.md`, then build a prototype.

**What to reuse:**
- `TeamModeScene` rendering: `MobaMap`, `ChampionView`, `UnitView`, `StructureView`, `MobaHud`, `MobaFx`.
- `src/entities/moba/OfflineSim.js`: an in-browser 5v5 simulation with movement, casts, walls, bushes, pets and spells; already runs `?scene=team&offline=1`.
- `shared/moba/*`: champions and kits, items, nav, map format.
- From `feat/story-mode`: `StoryDialog` (cinematic dialogue), the script beats, the `SaveManager` story key.

**Pitch:**
- Top-down offline adventure on office floors built like the 5v5 map but larger: rooms and corridors joined by **doors** (keycards, lock-ins until a bug nest is cleared), bushes and side rooms to explore.
- You play a 5v5 champion with its Q/W/E/R kit and 5v5 controls (click to move, keys or touch buttons).
- Bugs are the PvE enemies (minion and camp types, bug nests, bosses).
- 5v5 champions appear as story characters: mentors, allies who join your party, and rivals. 0xDEAD's Null Crew can be champions too.
- Keep the AURORA-heist plot and the Rubber Duck guide, one office floor per world. Loot and the 5v5 item shop carry over.

**Milestone 1 (the prototype):**
1. A `StoryWorldScene` (or a `story` mode of `TeamModeScene`) loads one story floor: a map definition with rooms, doors and spawns, bigger than the 5v5 map.
2. The player's champion with full controls.
3. Roaming bug packs and one bug nest that locks a room until cleared.
4. A keycard door.
5. One NPC champion with a dialogue (reuse StoryDialog), then joins as a bot ally (OfflineSim bot brain).
6. An exit to the next floor.
7. Lazy-loaded like the current Story Mode, so no impact on 5v5.

**Milestone 1 gates:** a headless check like `story_check.mjs` (loads, moves, opens a door, clears the nest, talks to the NPC, 0 page errors) plus the 5v5 gates.

## How to report back

Update this file at the end of each session (Done / Next) and give the user a short summary: what changed, test numbers, branches and commits, and anything that needs their decision.

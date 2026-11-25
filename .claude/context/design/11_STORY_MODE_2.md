# 11 · Story Mode 2.0: "Night Shift" on the 5v5 engine

**Status:** design, 2026-11-25; M1 prototype built, menu entry and free pick built (2026-11-25). Replaces the side-view Story Mode, which was deleted on 2026-11-25 at the user's request (branch `feat/story-mode`, last commit `4136a43`).
**Decided by the user (2026-11-25):** free pick of all 18 champions · one 10–15 minute map per floor · a new STORY card on the main menu (the single-player PLAY button stays). See §6.
**Request (2026-11-24):** stop following the side-view platformer model. Build Story Mode on the 5v5 game: a map like the 5v5 map but more spacious, with more doors. Smash bugs, adventure, explore, and put the 5v5 champions into the story.

## 1. The pitch

A top-down action adventure, offline and single player, played with the 5v5 controls and champion kits.
- You pick a 5v5 champion and climb the office tower floor by floor, from 8 PM to midnight, to get **AURORA v1.0** back from the hacker **0xDEAD** and his **Null Crew**.
- Each floor is one large office map: rooms and corridors joined by **doors**, with partitions, glass, shelves and break-room plants (bushes) exactly like the 5v5 map.
- You explore, smash bug packs and bug nests, find keycards and loot, meet 5v5 champions (some join you), avoid the unkillable chasers and beat a Null Crew lieutenant to reach the stairwell.

**Why it fits:**
- Nothing new to learn for 5v5 players: same camera, right-click move, Q/W/E/R, D/F, shop, items.
- The 18 champions become the cast.
- The adventure layer (doors, keys, nests, dialogue, allies) is mostly data on top of the existing engine.

**Kept from the old Story Mode:**
- The plot beats: the forgotten intern, the theft at 8 PM, the Rubber Duck guide, lookouts on every floor, the midnight deadline.
- The promotion ladder: Intern → CTO, the same titles as the 5v5 ranks.
- The rule that **bugs are smashable and chasers never are**.

## 2. One floor, as the player sees it (10–15 minutes)

1. **Stairwell arrival.** A short dialogue with the Rubber Duck, then the floor's objective appears in the tracker (for example "Find the server-room keycard").
2. **Explore.** Rooms come in a few kinds:
   - **calm** rooms hold loot and secrets;
   - **infested** rooms have roaming bug packs;
   - **nest** rooms lock their doors when you enter and open them again when every nest is destroyed;
   - **keycard** rooms have a colored door.
3. **Break rooms are checkpoints.** The fountain heals, the shop works (P) and the game saves. B (recall) returns you to the last break room you visited.
4. **People.** Two or three 5v5 champions wait in side rooms. Talking (right-click them) starts a dialogue. They either:
   - join your party, up to 2 allies, driven by the bot brain;
   - give a keycard, an item or a side task;
   - challenge you to a short duel and join if you win.
5. **Chasers** (Boss, PM, Tech Lead) patrol fixed routes:
   - they cannot be killed;
   - getting caught means a knockback, a stun and lost time;
   - bushes hide you from them (the 5v5 bush visibility already does this);
   - a stun skill makes them freeze briefly.
6. **Lieutenant arena.** A lock-in fight against a Null Crew member: an enemy champion with a 5v5 kit, played by the bot brain, with extra HP and adds. Winning opens the stairwell, grants the promotion and saves.

**Floors (worlds):**

| # | Floor | Clock | Bugs | Chaser | Lieutenant (Null Crew) | Promotion perk |
|---|---|---|---|---|---|---|
| 1 | Basement: Legacy Server Room | 8 PM | Null, Ladybug | none (tutorial) | **Zero** (rogue security ninja, joins after the fight) | Junior: 2nd ally slot |
| 2 | 1F Open Office | 9 PM | Beetle, Race | Boss | **Rush** with a scooter gang | Mid-level: summoner spell F |
| 3 | 2F Meeting Room Maze | 10 PM | Toxic (splits), Scarab | Tech Lead | **Lint** ("changes requested" walls) | Senior: +1 item slot carried between floors |
| 4 | 3F QA Lab | 11 PM | Robot | PM ("scope change" moves doors) | **Tester** + regression turrets | Staff: R unlocks at level 3 |
| 5 | Rooftop Data Center | 11:59 PM | all | all three | **0xDEAD** (THE DEADLINE boss, 3 phases) | Principal → CTO ending |

## 3. Systems

**Champion and progression:**
- Pick any of the 18 champions on a new save. You can switch at a break room. *(Built: the STORY card opens a free pick of all 18 with summoner spells; CHAMPION on the FLOOR CLEARED panel switches between runs. Switching at a break room mid-floor is not built yet.)*
- **Story rule:** skills that only hit champions in 5v5 (Zero-Day, Merge Conflict, On My Way, Regression Barrage) also hit bugs and nests, so every kit works on every floor. If you play a champion the floor casts as an NPC, a stand-in (the floor's `alt`, else another champion of that lane) takes the part.
- Summoner spells in the pick: Alt+Tab, Coffee Break, Overtime, Ctrl+Z (Escalate and kill -9 have no targets on a story floor yet).
- Levels run 1 to 18, from XP for smashing bugs (floor 1 reaches about level 6). Items are bought with bug gold, and gold, items and level carry between floors.
- A **promotion** perk per floor (table above).
- A collection log tracks bugs smashed, secrets found and champions met.

**Allies:**
- Champions you recruit follow you and fight with their full kits. They use the existing bot classifier and cast rules, with follow-the-leader movement instead of lanes.
- A downed ally stays down until the next break room (no respawn timer in Story Mode).
- You respawn at the last break room, losing 10% gold.

**Doors** (new entity kind; a closed door is a wall in the nav grid):

| Kind | Opens when | Look |
|---|---|---|
| doorway | always open | gap in a partition |
| auto | a champion is within 160 px (visual only, never blocks) | glass slider |
| keycard | the party holds the colored card (blue / red / gold) | colored frame + card icon |
| lock-in | the room's nests and pack are cleared (closes when you enter) | red light while locked |
| boss | the floor objective is done | big double door |
| secret | hit by a knockback or dash skill (reuses `wallStun` contact) | cracked partition |

**Bug nests:**
- A destroyable structure (HP, armor) that spawns its bug kind every few seconds while a champion is within 900 px, up to a cap.
- Destroying it pays gold and XP and counts toward the room's lock-in.

**Pickups:**
- Keycards, gold piles, coffee (heal), AI power-ups (temporary buffs, reusing the Personal Mode tiers), lore notes (Rubber Duck lines).

**Dialogue:**
- Built into StoryWorldScene: a typewriter dialogue box with the Rubber Duck and champion portraits (`drawChampionPortrait`); a conversation you start cuts in.
- Floor scripts are data, as beats: `{ who, line, act? }`, with acts `join`, `give`, `duel`, `open`.

## 4. Architecture: reuse first, 5v5 untouched

| Piece | Plan | 5v5 impact |
|---|---|---|
| Scene | `StoryWorldScene extends TeamModeScene`, registered at runtime (`scene.add`) the first time Story Mode starts. TeamModeScene gets two small hooks: `_makeMap()` and `_startWorld(d)`. | hooks only, same behavior |
| Simulation | `StorySim extends OfflineSim`. It replaces `_start` (floor spawns instead of waves, towers and camps) and `update` (doors, nests, triggers, pickups), and adds an ally brain and a pack AI (aggro radius, leash home). Skills, damage, knockback, zones, pets and bushes are inherited unchanged. | OfflineSim calls nav through `this.nav` |
| Nav | `shared/moba/nav.js` gains `createNav({ walls, w, h })` with dynamic walls (`setDynamic(id, wall \| null)` clears the A* grid cache). The existing exports stay bound to the 5v5 map. | none (same exports) |
| Map render | `MobaMap(scene, layout?)`: an optional layout `{ w, h, walls, bushes, floor theme }`, defaulting to the 5v5 constants. Doors are drawn by a small `DoorView` layer. | default path identical |
| HUD | MobaHud keeps skills, items, HP, gold and chat. In story mode the top bar shows the **objective tracker** and the minimap draws the floor layout and fog (rooms reveal on entry). | an option flag |
| Data | `src/story2/floors/*.js`, one file per floor, lazy-loaded. | none |
| Save | `SaveManager` key `story2`: `{ floor, checkpoint, champ, level, xp, gold, items, allies, keycards, doors, flags, cleared, log }` | none |

**Floor file format:**

```js
export default {
  id: 'f1', name: 'Basement · Legacy Server Room', clock: '8 PM', w: 8400, h: 6000, theme: 'basement',
  spawn: { x, y },                                   // stairwell
  rooms: [{ id, name, rect: [x, y, w, h], kind: 'calm' | 'infested' | 'nest' | 'break' | 'arena' }],
  walls: [ /* same shapes as map.js WALLS: seg / rect / circle + look */ ],
  doors: [{ id, x1, y1, x2, y2, kind: 'doorway' | 'auto' | 'keycard' | 'lockin' | 'boss' | 'secret', key?: 'blue', room? }],
  bushes: [ /* same as map.js BUSHES */ ],
  packs: [{ room, kind: 'small' | 'medium' | 'big', at: { x, y }, n }],   // reuses CAMPS monster stats
  nests: [{ id, room, at: { x, y }, spawns: 'null', hp, everyMs, cap }],
  npcs: [{ champ, at: { x, y }, script: 'f1_zero', joins: true }],
  pickups: [{ kind: 'keycard' | 'gold' | 'coffee' | 'powerup' | 'note', at, key?, amount?, note? }],
  chasers: [{ kind: 'boss' | 'pm' | 'techlead', route: [{ x, y }, …] }],
  arena: { room, lieutenant: 'zero', hpMul: 2.5, adds: [...] },
  exit: { x, y },                                     // opens after the arena
  script: { intro: [...beats], rooms: { roomId: [...beats on first entry] } },
};
```

**Checks for floor data** (`tools/playtest/story2_floor_check.mjs`, like `nav_check --map`):
- every room is reachable from the spawn with the right keys;
- no door overlaps a wall;
- every keycard is reachable before its door;
- nests and NPCs sit on free ground.

## 5. Milestones

1. **M1 prototype** (one floor slice, deep link `?scene=story`):
   - the engine hooks (nav factory, map layout, scene hooks);
   - StorySim with a party of 1 + 1 ally;
   - a floor with 6–8 rooms, one nest lock-in room, one keycard door, one NPC who talks and joins, one exit;
   - objective tracker;
   - headless check: loads, moves, opens the keycard door, clears the nest, talks, gets the ally, exits, 0 page errors.
   - 5v5 gates stay green.
2. **M2 floor 1 complete:**
   - Zero's arena;
   - break room with shop and save;
   - menu entry: **a new STORY card** on the main menu (decided 2026-11-25; built);
   - floor-data checker;
   - mobile pass (touch "TALK / OPEN" context button).
3. **M3 floors 2–3:** chasers and the secret doors.
4. **M4 floors 4–5:** PM door shuffles, THE DEADLINE boss, the ending.
5. **M5 polish:** music per floor, juice, balance, collection log.

## 6. Questions for the user

Answered on 2026-11-25:
- **Champion choice:** free pick from all 18. No unlocks.
- **Floor length:** one 10–15 minute map per floor, with break-room checkpoints.
- **Menu:** a new STORY card. The single-player PLAY button keeps the campaign.
- **The side-view Story Mode:** deleted, no "Retro" mode. The `feat/story-mode` branch is gone.

Nothing is open.

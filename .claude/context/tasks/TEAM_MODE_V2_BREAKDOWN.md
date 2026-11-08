# Team Mode v2 — "Walls & New Hires" · breakdown + frozen contract

Status: ✅ built · reviewed · playtested · integrated (2026-11-07).

**Results:** team_ff 20 matches — 0 exceptions / 0 stuck / 0 in-wall, sides 10–10, avg 18.1 min, tick avg 0.38 ms;
`team_sim --exploits` 28/28, `exploits.mjs` 9/9, `nav_check` ✅. **Review fixes (coordinator):** fan phones stop on any body
(no pass-through), minions re-sync lane after knockback, champion A* cooldown 100 ms, nav.js NaN guards, client keeps the
move order through a knockback, no knock arrow on epics, offline pet parity, skillshot cull/cap, own damage numbers offset
sideways. **Balance:** ROLE_PICKS top=[stack,guard,dev] jungle=[zero,courier,dev]; Servo 20 dmg / 900 ms, Volt R cd 70;
Swipe AD 60, Q cd 6; Mop W tick 12, R slow 0.25; Brick E knockback 380→320 (stayed on screen).
**Open:** Wet Floor reads as rings (wants a puddle + ⚠️ sign); bots rarely aim knockbacks into walls (~4 wall-stuns/match);
Rush's scooter small at game zoom; early game still slowish (first tower ≈7:40, ≈5 kills by 9:00); Pixel 33 % (small sample). Pipeline: [AGENT_TEAM.md](../develop_notes/AGENT_TEAM.md). Builds on
[TEAM_MODE_BREAKDOWN.md](TEAM_MODE_BREAKDOWN.md) (v1 contract still applies unless changed here).
Coordinator owns this file + `shared/moba/*`. **Contract = frozen** — need a change? report it, don't improvise.

## 1. Goal (player feedback)
1. **Terrain** — impassable office furniture (cubicle walls, desks, server racks, copiers, plants,
   water coolers) in the jungles, like MOBA jungle walls. Units path around them; skillshots fly over.
   Dashes stop at walls; **knockbacks into a wall stun** (new outplay mechanic).
2. **6 new champions** with distinct looks + mechanics (12 total):
   👮 Brick (Security Guard, tank — knockback, wall-stun) · 🧹 Mop (Night Cleaner, mage — persistent
   zones) · 🛵 Rush (Delivery Rider on a scooter, jungler — pass-through dash, package stun) ·
   🔌 Volt (Embedded Engineer, support — **robot pet Servo** that fights + an EMP ult centered on it) ·
   💻 Patch (Software Engineer, fighter — force-push knockback, merge-conflict stun) ·
   📱 Swipe (App Developer, marksman — throws **fans of smartphones**).
3. **Unique looks for all 12** — procedural costumes (hat/outfit/prop/vehicle) over the stickman poses.
4. **Varied minions + jungle** — minion waves are office robots (Robo-Vacuum melee, Project Bot ranged,
   Printer Tank siege); top-jungle camps are robots (Coffee Drones / Shredder Bots / Legacy Mainframe),
   bot-jungle camps stay bugs (Loose Bugs / Legacy Beetles / Legacy Mainframe).

## 2. Shared data (DONE by coordinator — read-only for dev agents)
- `shared/moba/map.js` → `WALLS` (28; `{id, kind:'rect'|'circle', x, y, w, h | r, look}`), mirror-fair.
- `shared/moba/nav.js` → `isBlocked`, `pushOut`, `segmentClear`, `clipMove`, `nearestFree`, `findPath`,
  `pathLength`, `wallDist`, `NAV_CELL`. Pure; avg `findPath` ≈ 0.26 ms (straight line when clear — no A*).
  Validator: `node tools/playtest/nav_check.mjs [--map]` (must stay ✅).
- `shared/moba/champions.js` → 6 new champions; spec extensions documented at the top of the file:
  `type:'zone'`, projectile `count`+`spread` (shared hit set per cast), `knockback{dist}`, `wallStun{ms}`,
  `at:'pet'`, buff `petPct`, champion `pet{…}`, champion `look{outfit,hat,prop,vehicle?,palette}`.
  `ROLE_PICKS` now lists several champions per role — **bots pick a RANDOM available one**.
- `shared/moba/rules.js` → `MINIONS[k].sprite/fallback/name` (robot textures), `CAMPS[k].variants` +
  `campVariant(campId, type)`, `KNOCKBACK_MS`, `PET_SPEED_MUL`, `PET_LEASH`, `PET_OWNER_HIT_MEMORY_MS`.

## 3. Contract changes (frozen)

### 3.1 Schema (append only — new fields at the END of the class)
```
TeamUnit  + owner string   ('' = none; pets: the owner's champion key)
          kind gains 'pet'  (team = owner's team; hp/maxHp = 1 — pets are invulnerable)
```
Pets live in `state.units` like other units (id `u<n>`), `alive=false` + removal when the owner dies,
re-created when the owner respawns. Pets are **never valid targets** (orders, skills, minions, towers).

### 3.2 Server → client `fx` additions
| k | payload | notes |
|---|---|---|
| `zone` | `{k:'zone', sid, slot, x, y, r, ms, tickMs, color}` | persistent area; client draws it for `ms` |
| `knock` | `{k:'knock', id, x0, y0, x1, y1, ms, wall}` | id = displaced champ/unit; `wall` = true → stopped by a wall (client: impact burst "BONK"); a wallStun follows via normal stun fields |
| `proj` | unchanged — a fan sends one `proj` per projectile | |
| `circle` | unchanged (`at:'pet'` just means x,y = the pet's position) | |
| `petatk` | `{k:'petatk', id, t}` | pet `id` zapped target `t` (client: small zap beam). Pets are NOT in the `atk` batch. |

No new client → server messages. `order {type:'attack', id}` / `cast {id}` with a pet id → rejected.
Move orders into a wall → server walks to `nearestFree`.

### 3.3 Client module API — `src/entities/moba/looks.js` (owned by client-art)
```js
export function ensureMobaLooks(scene)               // idempotent; generates every procedural texture
export function unitTextureKey(kind, campId = '')     // minion / camp variant / pet / epic → texture key (existing or fallback)
export function projectileKey(champId, slot)          // e.g. appdev → 'proj-phone', cleaner q → 'proj-broom'; null = default orb
export function drawChampionPortrait(scene, champId, x, y, size) // → Phaser Container (lobby cards, HUD, scoreboard)
export const WALL_STYLE                               // { [look]: { fill, top, stroke, label } } colors for furniture (world agent draws)
```
TeamModeScene.create() **and** TeamLobbyScene.create() call `ensureMobaLooks(this)` before building views.
ChampionView (art) puts the costume on itself; nothing else needs to know about costumes.

## 4. Tasks (one writer per file)

| Owner | Files | Done when |
|---|---|---|
| **server-dev** | `server/rooms/TeamRoom.js`, `server/game/moba/*`, `tools/playtest/team_sim.mjs`, `team_ff.mjs`, `exploits` checks | see §4.1 |
| **client-world** | `src/scenes/TeamModeScene.js`, `src/entities/moba/{MobaMap,MobaFx,MobaHud,OfflineSim,mobaGfx,StructureView,Fallbacks}.js` | see §4.2 |
| **client-art** | `src/entities/moba/looks.js` (new), `ChampionView.js`, `UnitView.js`, `src/scenes/TeamLobbyScene.js`, `src/ui/moba/*` | see §4.3 |
| **coordinator** | this file, `shared/moba/*`, `src/main.js`, docs, integration, `tools/playtest/nav_check.mjs` | — |

### 4.1 server-dev
- **S1 Nav.** All movement collides with walls: champion move/chase orders follow `findPath` (store the path,
  re-path when the goal moves > ~150 px or progress stalls); minions/monsters/pets step then `pushOut`
  (monsters may path when leashing home); unit separation never leaves anyone inside a wall; spawns/teleports/
  respawn/recall land on `nearestFree`. Cache paths — no A* per entity per tick.
- **S2 Displacement.** Dashes `clipMove` (stop at walls). Blink → `nearestFree(aim-clamped point)`.
  `knockback` + `wallStun` per champions.js (over `KNOCKBACK_MS`, displaced = can't act; epics/structures
  immune; `fx knock`).
- **S3 Skills.** `zone` type (ticks, slow re-applied, `fx zone`), projectile fans (`count`/`spread`, shared hit
  set), `at:'pet'`, buff `petPct`. `classifySkill` covers the new fields (bots).
- **S4 Pets.** Per §3.1 + champions.js spec; owner swap to bot keeps the pet; ended phase cleans up.
- **S5 Bots.** Navigate with paths (cached); random `ROLE_PICKS`; sensible use of zone / fan / knockback (bonus:
  aim knockbacks so the target lands in a wall) / `at:'pet'` R (cast when ≥1 enemy champ near the pet).
- **S6 Verify.** `team_ff` 20+ matches: zero exceptions, no champion stuck > 3 s with an order (report a stuck
  count), match length + side balance + per-champion win rate & K/D for all 12, tick time (avg/max ms) vs v1;
  `team_sim --exploits` + `exploits.mjs` pass (add: order into a wall, blink into a wall, dash through a wall,
  attack/cast on a pet id, knockback out of the map); `nav_check` ✅.

### 4.2 client-world
- **C1 Walls.** Draw every `WALLS` entry as readable top-down office furniture (`WALL_STYLE` colors from looks.js,
  per `look`), with a drop shadow / visible "height" so they read as solid; correct depth vs champions (y-sort);
  on the minimap too. Don't tank FPS (static → bake into a RenderTexture or few Graphics).
- **C2 Aim previews.** zone (circle at cursor, clamped to range), fan (cone of `count` lines across `spread`),
  dash end clipped by `clipMove`, blink landing at `nearestFree`, knockback arrow on target skills, `at:'pet'`
  circle around your pet. Own-champion move: faint path preview via `findPath` (fades after ~0.6 s).
- **C3 FX.** `zone` (persistent puddle/area for `ms`, pulse each tick), `knock` (dust trail; `wall` → impact burst,
  screen-shake if it's you, "BONK" text), `petatk` zap beam, fan projectiles use `projectileKey()` textures (rotate
  to travel direction). Clicks on pets never target them (picking skips kind 'pet').
- **C4 OfflineSim.** Walls (pushOut + findPath for orders), pets follow their owner, new skill types at least
  roughly (zone/fan/knockback) so `?offline=1` works with all 12 champions.
- **C5 HUD.** Skill tooltips show the new fields (zone duration, knockback, wall-stun, fan count, pet); HUD portrait
  via `drawChampionPortrait` if cheap.
- Done when: online + offline match with each new champion shows walls, previews, FX; zero `[PAGEERROR]`;
  FPS not worse than v1 in a 10-champion fight (measure).

### 4.3 client-art
- **A1 `looks.js`** per §3.3: procedural textures (Phaser Graphics → `generateTexture`) for robot minions
  (`bot-vacuum`, `bot-project`, `bot-printer`), camps (`bot-drone`, `bot-shredder`, `bot-mainframe`), pet
  (`bot-servo`), projectiles (`proj-phone`, `proj-broom`, `proj-box`, …), and anything the costumes need.
  Team identity comes from rings/tints applied by the views, so textures can be neutral.
- **A2 ChampionView** — every champion gets a **distinct silhouette** from `def.look`: hat, outfit tint/overlay,
  held prop, and `vehicle:'scooter'` for Rush (rides it; wheels/bob instead of running). Works with all poses,
  facing flip, outline, death, recall. Must stay cheap (≤ ~6 extra objects per champion).
- **A3 UnitView** — `unitTextureKey()` (robot minions, camp variants via `campVariant`, pets); pets: small, owner's
  team ring, no HP bar, idle hover bob; camp/minion `name` available for hover/tooltip.
- **A4 TeamLobbyScene** — champion select for **12** champions that fits 1280×720 (and phones), costume
  portraits, role filter or grouping, skill list showing the new mechanics; bot random picks don't affect it.
- **A5 ui/moba** — Scoreboard/EndScreen show portraits (or emoji) for all 12; fix the open bug: long shop item
  titles wrap into the price line (ShopPanel).
- Done when: lobby screenshot shows 12 distinct champions; in-match screenshot shows distinct costumes, robot
  minions, both camp families, Servo following Volt; zero `[PAGEERROR]`.

## 5. Ports / test environment
- `:2567` = coordinator's normal server — **don't kill it.** Server-dev uses `PORT=2600 BUG_SMASH_DEBUG=1`.
  Client agents: offline mode first (`?scene=team&offline=1&champ=X`, `?scene=lobby`); for online checks start
  your own server with `PORT=2610` (world) / `PORT=2620` (art) from `server/` and `GAME_URL=http://localhost:26x0/`
  for `tools/playtest/shot.mjs`. Server code may be mid-change — if your own server fails to boot, use offline.
- Never set `BUG_SMASH_DEBUG` on :2567. Don't commit.

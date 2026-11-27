# THREEJS_MIGRATION_BREAKDOWN - whole-game render migration Phaser -> Three.js

Owner decision: the "no Three.js" rule is overridden. Gameplay rules, `OfflineSim`, `StorySim`, `server/`, `shared/moba/` are NOT touched. Only the rendering/input/UI layer is replaced. Pillars still hold: one-thumb input, cheap to run (Low preset mandatory), office humor survives the new look.

## 1. Goal
Ship one Three.js renderer for every mode (Menu, SP campaign, Personal arena, Team Mode offline + online, Story F1) behind a thin `Renderer` seam, so the Phaser scenes can be deleted at the end. Fun delivered: real shadows/lighting/camera, same skills, same feel. Why now: the spike (`three/README.md`) proved cost is fine (about 300 draw calls mid-fight); parity art/VFX is the real cost, so we migrate in phases where Phaser stays the fallback (`?renderer=2d`) until each phase's acceptance passes.

## 2. Strategy and honesty
- Phaser stays the DEFAULT until P2 passes; `?renderer=3d` opts in (P1), becomes default for Team Mode after P2, whole game after P3. A `localStorage` key `bs.renderer` remembers it.
- Do NOT port `TeamModeScene.js` (3000+ lines of input + prediction + HUD glue). Extract the logic that is renderer-free into `src/three/core/` by COPY-then-diff first, delete Phaser copy only in P3. Two copies for a while is the accepted cost.
- Realistic in one pass (one agent wave, about 1 week): P1, most of P2. Needs art or multi-week: per-skill VFX (about 100 styles), real 3D minions/towers/pets/hats, mobile touch QA, SP campaign/Personal arena (large scenes, unread yet: see P3 caveat).

## 3. Frozen interface: renderer <-> sim (derived from code, do not rename)
The sim is the only source of truth. The renderer is a pure consumer; it never mutates `state`.

### 3.1 Sim handle (same shape offline and online)
Core wraps either source into `SimSource` (`src/three/core/SimSource.js`):
```
SimSource { localId, world, state()  /* ->clientState|state|room.state */, send(type,msg),
            on(type,fn)  /* msg types below */, update(dtMs) /* offline only */, srvNow(), dispose() }
```
- Offline: `new OfflineSim({champ,name,emit,lobbyMs,spells,allies,enemies,hat,world,sandbox})` (`OfflineSim.js:65`); `localId='me'` (`:66`); `emit(type,m)` is the callback (`:72`); read `sim.clientState` (fog-filtered Proxy, `:99`), NEVER `sim.state`, except when `phase==='ended'`; drive with `sim.update(delta)` each frame (`TeamModeScene.js:2018`); `sim.receive('hello')` first (`:608`).
- Online: `room.state` (`TeamModeScene.js:667`), `room.send(type,msg)` (`:675`), `room.onMessage(type,fn)` for MSG_TYPES (`:75`, subscription pattern `:410-415`), `room.onStateChange`, `room.onLeave/onError` (`:423`), `room.send('hello')` then `time` pings `{t}` every 10 s, smallest-RTT clock offset (`:428-434`, `:723-727`), reconnect via `saveMatch`/`_connLost` (`:405`, `:441`). `srvNow = Date.now()+clockOffset` (`:669`). Online is NOT optional in P1.

### 3.2 Messages sim -> renderer (`on(type, m)`)
`welcome{serverNow,team,champ,reconnectS}`, `time`, `atk[{f,t,...}]` (array), `fx{k,...}` (kinds in `TeamModeScene.js:804-925`: proj circle tgt dash blink buff heal zap zone trapEnd knock petatk spell hit tp rewind), `feed`, `announce{title,sub,color,big}` (`:732`), `gold{n,x,y}` (`:754`), `chat`, `chatHistory`, `vote`, `voteEnd{passed}`, `voteDeny{reason}`, `rank`, `dummyDps{dmg,total,dps}`, Story-only `story{k}` with k in say|door{id,state}|join|pickup{kind}|objective{text,optional}|cleared (`StoryWorldScene.js:69-88`). Unknown types: ignore.

### 3.3 Messages renderer -> sim (`send(type,msg)`)
`order{type:'move',x,y | 'attack',id | 'stop'}` (`OfflineSim.js:137`; throttle `R.MOVE_ORDER_RATE_MS`), `cast{slot:q|w|e|r,x,y,id}` and `spell{slot:d|f,x,y,id}` (`:143,:149`; throttle `R.CAST_RATE_MS`, queue as `TeamModeScene.js:2019-2026`), `upgrade{slot}`, `active`, `ward{x,y}`, `augmentPick{id}`, `augmentReroll{slot}`, `buy{item}`, `sell{slot}`, `recall`, `chat{text}`, `startNow`, `spells{d,f}`, `time{t}`, `hello`; vote reply and ping (`_castVote`, `_sendPing` `:1397`, `:1830`: copy payloads from there). Sandbox-only: `switchChamp{champ}`, `setNoCd|setNoMana|setGodMode{enabled}`, `spawnDummy`, `clearDummies` (`:153-158`).

### 3.4 State shape the renderer reads (`server/game/moba/schema.js`)
- `champions` Map: x,y (world 0..6000), team, champ, name, hat, level, hp/maxHp, mana/maxMana, dead, respawnAt, cdQ/W/E/R/D/F (server ms ready), stunnedUntil, rootedUntil, slowUntil/slowPct, shield, buffs (csv), recallUntil, action + action_seq (animation trigger), targetId, inBush, items[6], rankQ/W/E/R, skillPoints, augmentsCsv, augmentOfferJson, chargesD/F, spellD/F, kills/deaths/assists/cs, gold (`schema.js:12-79`).
- `units` Map (`TeamUnit`, `:144`): x,y,team(blue|red|neutral),kind(melee|ranged|siege|small|medium|big|golden|deadline|pet|obj...),hp. `structures` Map (id,x,y,team,kind core|tower,tier,hp,maxHp,alive,invulnerable,targetId; OfflineSim `:110`), `relics[]` (`:117`), top-level phase/winner/blueKills/redKills/buff*/epic*At (`:92`).
- `world` (`OfflineSim.js:69`): `world.fountain`, bushes, walls, `nav`, `clampToMap`. Story passes its own via `makeWorld` (`StoryWorldScene.js:36`).
- Map hook the renderer must expose: `setDoor(id,'open'|'closed')` (`:74`); map update ctx `{liveCamps, srvNow, playing, epicAt}` (`TeamModeScene.js:2053`).
- HUD ctx (`:2062`): `{st, me, myId, srvNow, now, mePos(predicted), view, canShop, phase, hidden, held}` at 20 Hz.

### 3.5 Renderer API (new, frozen; every phase implements it)
```
// src/three/core/Renderer.js
createRenderer({canvas, source:SimSource, mode:'team'|'story'|'hunt'|'arena', opts}) ->
  { frame(dtMs), pick(screenX,screenY)->{ground:{x,y}, unitId|null}, project(wx,wy)->{x,y,visible},
    setQuality('low'|'med'|'high'), setDoor(id,state), dispose() }
```
Inputs go DOM -> `core/Input.js` -> `source.send`. HUD is DOM (`src/three/hud/`), reads `source.state()` at 20 Hz.

## 4. Phases

### P1 Foundation (one pass, about 5 days wall-clock, 5 parallel agents)
Goal: `?scene=team&offline=1&renderer=3d` and online match play end to end, minus shop/pets/hats.

| Task | New files (exclusive) | Acceptance |
| :-- | :-- | :-- |
| C1 Loader + boot | `src/three/boot.js`, `src/three/index.html`-free: dynamic `import()` hook added in `src/main.js` (C1 is the only task editing main.js: `?renderer=3d` branch near `:33-83`), `src/three/loading.js` (progress bar, office-humor tips), `src/three/vendor/importmap.js` (vendor three r160 locally, drop CDN: `three/` copy under `src/three/vendor/`) | Loads with no internet; progress reaches 100%; 2D path unchanged when flag absent |
| C2 Core seam | `src/three/core/SimSource.js`, `src/three/core/Renderer.js`, `src/three/core/Quality.js`, `src/three/core/Clock.js` | Same renderer code runs against OfflineSim and a Colyseus room (3.1); `Quality` ports spike auto-reduce |
| C3 World + units (port spike) | `src/three/world/ground.js`, `walls.js`, `bushes.js`, `lights.js`, `src/three/units/champions.js`, `instanced.js`, `hpbars.js`, `structures.js` (moved/split from `three/world3d.js`, `three/units3d.js`) | 18 champions render with team ring, hp bar, dead state; fog-hidden enemies absent; spike behaviours preserved |
| C4 FX (port spike) | `src/three/fx/particles.js`, `flipbook.js`, `telegraph.js`, `router.js` (maps 3.2 `fx`/`atk`/`gold` kinds, generic only) | Every fx kind in 3.2 produces something visible, no console errors during `brawl` |
| C5 Input | `src/three/core/Input.js`, `src/three/core/Camera.js` (follow, lock Y, Z-center, edge pan, shake) | Right-click move, QWERDF cast at cursor, left-click attack, minimap click, S/B/Space/G/Y keys match `TeamModeScene.js:1046-1070`; throttles per 3.3; local prediction not required in offline, REQUIRED online (copy `_pred` logic `:191,:937`) |
| C6 HUD | `src/three/hud/hud.css`, `hud.js` (hp/mana/cd/level/gold/items/status row/death timer), `minimap.js`, `feed.js` (feed, chat, banner, toast, vote), `target.js` | Every field in MobaHud's `update(ctx)` (`MobaHud.js:1272`) has a DOM equivalent; `announce` banners and vote prompt show |
| C7 Select + online glue | `src/three/screens/select.js` (18-champion grid + spells + name), `src/three/net/room.js` (join, hello, time sync, reconnect/rejoin, onLeave modal) | Online 5v5 vs bots completes a match in 3d; unplugging network shows rejoin modal; offline sandbox works |

Parallel: C2 first (half day, defines the seam). Then C3, C4, C5, C6, C7 at once (they only share 3.5). C1 anytime. C3 and C4 must not both touch `main.js` spike code: spike stays untouched in `three/` until P2 end (delete then).

Acceptance via tools/playtest (new script `tools/playtest/three_check.mjs`, owner C2, modelled on `offline_check.mjs`; SwiftShader args already used there): 1) `?scene=team&champ=oncall&offline=1&renderer=3d` reaches `phase==='playing'`; 2) move order changes `me.x/y`, never inside a wall; 3) Q/W/E/R put `cdQ..cdR` on cooldown; 4) `debug('brawl')` 6 s, 0 `pageerror`, `renderer.info.render.calls` < 600; 5) screenshot via `shot.mjs`. Online: `tools/playtest/team_sim.mjs` extended with a `RENDERER=3d` env for 1 real client.

### P2 Team Mode parity + Story F1 (about 2 weeks; 6 parallel agents; art-lite)
| Task | New files | Acceptance |
| :-- | :-- | :-- |
| C8 Shop/augments/scoreboard/end | `src/three/hud/shop.js`, `augments.js`, `scoreboard.js`, `endscreen.js` (uses `items.js`, `augments.js` from shared/moba, `buy/sell/augmentPick/augmentReroll`) | Buy and sell work, augment offer at the right levels, TAB scoreboard, end screen with rank and PLAY AGAIN |
| C9 Units extras | `src/three/units/pets.js`, `hats.js`, `stances.js`, `status.js` (CC icons, stealth fade, shields, recall ring, name plates), `props.js` (data from `looks.js`) | A pet follows owner; hats from `server/data/cosmetics.js` show; stun/root/slow icons match `cc*Until` fields |
| C10 Map extras | `src/three/world/camps.js`, `relics.js`, `doors.js`, `epics.js` (golden/deadline), `bushfx.js` (rustle, stealth tint from `inBush`) | `setDoor` animates; relic respawn visible; epic timers use `epicGoldenAt/epicDeadlineAt` |
| C11 Story F1 | `src/three/story/floor.js` (from `FloorMap.js` + `story2/catalog.js` data), `story/pickups.js`, `story/bugs.js` (bugs/nests as instanced units), `story/ui.js` (dialog/typewriter, objective tracker, cleared panel; copy from `StoryWorldScene.js:101-264`), `story/launch.js` (replaces `story2/launch.js` under flag) | `?scene=story&champ=dev&renderer=3d` clears F1 with `tools/playtest/story2_check.mjs` assertions; doors open on keycard |
| C12 Tactical + QoL | `src/three/hud/pings.js`, `coach.js`, `practice.js` (sandbox bar), `settings.js` (quality, camera) | G ping visible to team; practice toggles work |
| C13 FX hardening | `src/three/fx/pool.js`, `budget.js` (cap particles, 100-bug story cap per pillar), `lod.js` | Mid fight stays under spike numbers (<= 520 calls) on Low preset |

Parallel: all six independent (each owns its folder). Gate: flip default to 3d for Team Mode after `three_check.mjs`, `offline_check.mjs`, `story2_check.mjs`, `team_sim.mjs` all PASS in 3d.

### P3 Menu + SP campaign + Personal arena (3 to 5 weeks; I have NOT read HuntScene or MultiPlayScene internals, task 0 is discovery)
- C14 Discovery (do first, 1 day): `.claude/context/tasks/THREEJS_P3_SCENES.md` listing every input, entity, and sim hook in `HuntScene.js`, `LevelScene.js`, `BossScene.js`, `MultiPlayScene.js` (Phaser arcade physics gravity 1400 per `main.js:22`: the SP/Personal modes are NOT on the Moba sim, so they have no shared renderer-free sim; the interface in 3.x does not apply). Output decides: either port scenes to a 2.5D Three view with the Phaser logic kept running headless, or rewrite state into a sim.
- C15 Menu: `src/three/screens/menu.js` + `menu.css` (cards for Team, Story, Personal, Hunt, invite deep link `main.js:36-47`, rooms/TeamCustom/TeamLobby ports as `screens/lobby.js`, `screens/custom.js`).
- C16 HuntScene port (`src/three/hunt/*`), C17 MultiPlayScene/Personal arena (`src/three/arena/*`), C18 Boss/Level/Victory/GameOver screens (`src/three/screens/`).
- Parallel: C14 then C15, C16, C17, C18 together. Realistic: menu in 1 week; SP and Personal each 1 to 2 weeks after discovery. Final step: remove Phaser (`main.js`, `src/scenes/`, `src/entities/moba/*View*`), remove `?renderer=2d`.

### P4 Per-skill VFX + art (multi-week, needs art; cannot be done in one pass)
- C19 Skill VFX registry `src/three/fx/skills/<champ>.js` (one file per champion = no collisions; 18 files, key by `fx.k` plus skill id from `SkillFx.js`). Parallel by champion, 3 champions per agent, 6 agents. Acceptance: `tools/playtest/skill_fx_shots.mjs` 3d variant, screenshots reviewed by designer per skill.
- C20 Models: replace procedural minions/monsters/towers/cores (`src/three/units/models/`), pets and hats (needs CC0 sets or commissioned art; owner decision). Style guide first: low-poly + toon outline, one shared palette so the office humor reads (monitors, mugs, rubber ducks).
- C21 Audio hookup, mobile touch (`src/three/core/Touch.js` mirrors `MobaHud._buildTouch` `:1188`), KTX2/meshopt compression, real-device perf QA.

## 5. Humor pass (loading + empty states; keep short)
- Loading tips: "Compiling shaders... and excuses." / "Reticulating splines. Also your standup." / "Loading 4.5 MB of models, 0 MB of work-life balance." / "Dang chay build, doi chut nhe." / "Dang tai... uong ly cafe di."
- Renderer toggle: "3D (beta): now your bugs cast shadows." / "2D classic: bugs without depth, like your estimates."
- Low preset: "Potato mode: shadows fired for budget reasons."
- Context lost: "The GPU went on leave. Reloading..." (see risk 4).

## 6. Risks
1. Parity illusion: handcrafted costumes and about 100 skill VFX are the expensive part (P4). Mitigation: generic VFX remain readable first; never ship a skill with no telegraph (fairness: Interns must read danger).
2. Two code paths for months. Mitigation: freeze 2D features once P2 starts; only bugfixes.
3. Perf: shadows + bloom + MSAA fill rate on low GPUs/phones; "cheap to run" pillar needs the Low preset default on mobile UA and a hard cap of 100 bugs/100 units drawn (instanced). Spike numbers were software-rendered; real GPU QA is required before default flip.
4. WebGL context loss and tab-background: handle `webglcontextlost`, keep `_lastPnow`/stall logic (`TeamModeScene.js:2014`) from the Phaser scene; the old Phaser 'cut' error handler (`main.js:89`) goes away with Phaser.
5. Online fairness: prediction and fog must match Phaser exactly; renderer must only show `clientState` entities (offline) / StateView (online). A 3D camera tilt changes perceived range: aim indicators must draw true ground circles at sim radii.
6. Pick accuracy: raycast to ground plane `y=0` for orders, to unit capsules for targets; mismatch ruins one-thumb feel. Check with a playtest click-grid.
7. CDN dependency: vendor three locally (C1) or the game breaks offline.
8. Bundle/load: 11 MB of assets; stream by phase (loading screen C1, lazy-load Story assets).
9. Unknown scope for P3 (Hunt/Personal not yet read): estimate is provisional until C14.

## 7. Parallelisation summary
- Wave A: C2 (seam). Wave B: C1, C3, C4, C5, C6, C7. Gate: `three_check.mjs` PASS.
- Wave C: C8 to C13 together. Gate: default flip for Team Mode.
- Wave D: C14 then C15 to C18. Wave E: C19 x6, C20, C21 (art-gated).
- File-ownership rule: each task writes only its own listed files; `src/main.js` is touched by C1 (flag) and C16/C17/C18 only at P3 end by one merge owner. Cross-task needs go through 3.5 or a new line in section 3 (designer approves).

# Map Geometry, Navigation, Vision, Spells, Network & Playtest Balance

**Author:** Duke Nguyen (`duc.nguyen@onethesis.com`)
**Sources:** `shared/moba/map.js`, `shared/moba/nav.js`, `shared/moba/spells.js`, `server/game/moba/tuning.js`, `server/rooms/TeamRoom.js`, `src/entities/moba/MobaMap.js`

---

## 1. Open Office Map Geometry & Symmetry (`shared/moba/map.js`)

### 1.1. Coordinate System & Mirror Symmetry
- **Dimensions:** `6000 x 6000 px` (`MAP_W = 6000`, `MAP_H = 6000`).
- **Team Orientation:** Startup (`blue`) spawns at bottom-left fountain `(380, 5620)`; MegaCorp (`red`) spawns at top-right fountain `mirror(380, 5620) = (5620, 380)`.
- **Fairness by Construction:** Every red-side coordinate is `mirror(p) = { x: p.y, y: p.x }` across the top-left-to-bottom-right river diagonal (`x = y`).
- **River-Parallel `(s, m)` Basis:** Authoring helpers use `s = y - x` (signed distance from river axis) and `m = x + y` (mid lane axis `m = 6000`), with `sm(s, m) = { x: (m - s) / 2, y: (m + s) / 2 }` and `reflectMid(p) = { x: 6000 - p.y, y: 6000 - p.x }` mirroring blue's top jungle into blue's bot jungle.

### 1.2. Lanes, River & Bases
| Region | Geometry / Waypoints | Width / Radius | Tactical Purpose |
| :--- | :--- | :---: | :--- |
| **Top Lane** | `(850,4650) -> (650,4000) -> (650,1000) -> (1000,650) -> (4000,650) -> (4650,850)` | `320 px` | Long solo lane; open river corner above `y = 1620` |
| **Mid Lane** | `(1200,4800) -> (3000,3000) -> (4800,1200)` | `320 px` | Shortest lane; fastest roam access to both river objectives |
| **Bot Lane** | `(1350,5150) -> (2000,5350) -> (5000,5350) -> (5350,5000) -> (5350,2000) -> (5150,1350)` | `320 px` | Carry + Support duo lane; Dragon/Golden Bug contest |
| **River ("Data Stream")** | `(700,700) -> (5300,5300)` | `420 px` | Central neutral corridor housing both Epic Pits |
| **Bases / Fountains** | Blue `(380,5620)` / Red `(5620,380)` | `BASE_RADIUS = 1150 px`, `FOUNTAIN_RADIUS = 520 px` | Heal/Shop safe zone + `600 DPS` enemy fountain laser |

### 1.3. Structures (`16` Total = `8` per Team)
- **Breakdown per Team:** `3` Tier-1 Towers + `3` Tier-2 Towers + `1` Tier-3 Core Firewall (`7` Towers total per team) + `1` Production Server Core = **`8` Structures per team** (`14` Towers + `2` Cores = `16` total).
- **Collision Radii:** `STRUCTURE_RADIUS.tower = 70 px`, `STRUCTURE_RADIUS.core = 115 px`.
- **Invulnerability Chain (`unlockedBy`):**
  1. `tier 1` (`top_1`, `mid_1`, `bot_1`) -> vulnerable from `0:00`.
  2. `tier 2` (`top_2`, `mid_2`, `bot_2`) -> unlocked when same-lane `tier 1` falls.
  3. `tier 3` (`base_3` Core Firewall) -> unlocked when **any** lane `tier 2` falls.
  4. `core` (`core`) -> unlocked when `base_3` Core Firewall falls.

| Blue Structure ID | Kind | Lane | Tier | Coordinates `(x, y)` | Red Mirror `(x, y)` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `blue_top_1` | Tower | `top` | 1 | `(650, 2000)` | `(2000, 650)` |
| `blue_top_2` | Tower | `top` | 2 | `(650, 3500)` | `(3500, 650)` |
| `blue_mid_1` | Tower | `mid` | 1 | `(2250, 3750)` | `(3750, 2250)` |
| `blue_mid_2` | Tower | `mid` | 2 | `(1650, 4350)` | `(4350, 1650)` |
| `blue_bot_1` | Tower | `bot` | 1 | `(4000, 5350)` | `(5350, 4000)` |
| `blue_bot_2` | Tower | `bot` | 2 | `(2500, 5350)` | `(5350, 2500)` |
| `blue_base_3` | Tower (Firewall) | `base` | 3 | `(1200, 4800)` | `(4800, 1200)` |
| `blue_core` | Core | `base` | 4 | `(850, 5150)` | `(5150, 850)` |

### 1.4. Jungle Camps (`12`), Epic Pits (`2`), Walls (`44`) & Bushes (`24`)
- **Blue Top-Jungle Camps:** `blue_tj_small` `(1350, 2500)`, `blue_tj_medium` `(1500, 3450)`, `blue_tj_big` `(2150, 3000)` -> reflected across mid (`reflectMid`) to `blue_bj_*`, then mirrored to Red (`red_tj_*`, `red_bj_*`).
- **Epic Pits:** `deadline` at `(2050, 2050)` (top-side river), `golden` at `(3950, 3950)` (bot-side river).
- **Walls (`44` total, `W_EDGE = 60 px`):** `11` walls per quadrant (`3` top-lane cubicles with entrances at `y = 2300–2600`, `3300–3600`, and open river corner `< 1620`; `3` glass river-bank walls with open corners and pit entrances; `2` mid-lane partitions; `2` interior camp dividers; `1` circular pillar `r = 70` at `(1250, 4000)`).
- **Bushes (`24` total, `6` per quadrant):** Top-lane gank entrance `(800, 2650–2950)`, Deadline-pit entrance `sm(650, 3950–4250)`, Mid-side jungle entrance `sm(1500–1800, 5400)`, Mid-lane ambush `sm(2200–2500, 5480)`, River control `sm(200, 4700–5000)`, and interior camp circle `(1250, 3350, r = 110)`.

---

## 2. Navigation & Wall Collision Engine (`shared/moba/nav.js`)
- **Grid Resolution:** `NAV_CELL = 60 px` (`100 x 100 = 10,000` cells across `6000 x 6000`), baked lazily per entity radius (`CHAMP_RADIUS = 30`, `MINION_RADIUS = 22`, `PET_RADIUS = 16`) with `GRID_MARGIN = 6 px` extra wall clearance.
- **Pathfinding (`findPath`):**
  1. Fast-path: if `segmentClear(x0, y0, x1, y1, r)` is true, returns `[goal]` directly without A*.
  2. Otherwise runs 8-neighbor A* (`SQ2` diagonal cost, **no corner cutting** across blocked cardinal neighbors) followed by line-of-sight string-pulling smoothing.
  3. Goal inside a wall snaps to `nearestFree(goal, r)`.
- **Collision & Movement Primitives:**
  - `isBlocked(x, y, r)`: Checks exact distance (`wallDist`) against `circle`, `seg` (capsule), and `rect` walls.
  - `pushOut(x, y, r)`: Runs up to `4` resolution passes to push overlapping walkers cleanly out of wall corners.
  - `clipMove(x0, y0, x1, y1, r)`: Computes farthest free point `{ x, y, hit }` along a dash or knockback segment; returns `hit = true` when stopped by a wall (triggering `wallStun` on knockbacks).
  - `nearestFree(x, y, r)`: Used by `blink` skills and `Alt+Tab` Flash so blinks cross walls cleanly when targeting beyond wall thickness.
  - `setDynamic(id, wall | null)`: Runtime wall mutation updating only affected local grid cells.

---

## 3. Summoner Spells (D / F — `shared/moba/spells.js`)
- **Selection Rules:** Every champion brings **2 distinct spells** (`validSpellPair(d, f)` forbids duplicates). Role defaults assign `['flash', 'smite']` to Junglers (`ROLE_SPELLS`), though human players may swap freely. Cooldowns are **not** reduced by item haste. `Flash Cache` augment grants `+25% MS` for `2s` on any D/F cast.

| ID | Name | Kind | Cooldown | Range / Radius | Exact Parameters & Edge Rules |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `flash` | **Alt+Tab** (⚡) | `blink` | 150s | 420 px | Instant teleport via `nearestFree` (crosses walls). Blocked while stunned, rooted, or displaced. |
| `heal` | **Coffee Break** (☕) | `heal` | 120s | 750 px | Heals self + most-injured nearby ally for `80 + 18/lv`; grants `+30% MS` for `1.0s`. Cut by `-50%` under `Ignite` / `Grievous`. |
| `ghost` | **Overtime** (🏃) | `haste` | 120s | Self | `+35%` move speed for `6.0s`; ignores unit collision (still affected normally by enemy slows). |
| `barrier` | **Ctrl+Z** (🛡️) | `shield` | 120s | Self | Self-shield of `100 + 22/lv` for `2.5s` (scales with champion level). |
| `ignite` | **Escalate** (🔥) | `dot` | 150s | 600 px | Deals `60 + 20/lv` True Damage over `5.0s` (ticks every `500 ms`) and cuts healing received by `50%`. |
| `smite` | **kill -9** (💀) | `smite` | 60s | 500 px | Targets neutral monster/epic or enemy minion: deals `450 + 35/lv` True Damage and heals self `8% max HP` on monsters. |

---

## 4. Vision, Fog of War & Ward Trinket
- **Sight Radii:** Friendly Champions `1100 px`, Friendly Structures `1050 px`, Ward Trinkets `750 px`, Friendly Minions `680 px`.
- **Ward Trinket (Key `[4]`):** Places a `3 HP` stealth ward within `550 px` (`750 px` sight, `45s` duration, `90s` CD, max `2` active wards per player). Wards inside a bush share that bush (`sameBush = true`) and reveal enemies inside to the entire team.
- **Shadow Proxy Stealth:** Veil active grants `1.8s` stealth, invisible beyond `280 px` and broken immediately on basic attack or skill cast.
- **Bush Mechanics:** Standing in any of the `24` bushes hides the unit from opponents unless: (a) an opposing champion or ward occupies the same bush, (b) the unit attacks or casts (`BUSH_REVEAL_MS = 1500 ms`), or (c) `Bush Hacker` reveals within `750 px` (`2s`). Own-team units in bushes render at `HIDDEN_ALPHA = 0.5` with `LEAF_TINT`.
- **Authoritative Visibility vs. Client Fog Separation:**
  - **Server `StateView` (`TeamRoom.js`) & `OfflineSim._hiddenFrom`:** Authoritative source of truth evaluated at `20 Hz` (`VISION_EVERY_TICKS = 1`). Hidden enemies are removed from per-team `StateView`, `atk` / `fx` events beyond `INTEREST_RADIUS = 1600 px` or from hidden sources are filtered, and target orders/spells on hidden IDs are rejected.
  - **Client Fog Canvas (`MobaMap.js`):** Purely visual `150 x 150` offscreen texture (`40 px/cell`), updated at `10 Hz` (`5 Hz` in `lowFx`) and GPU-interpolated across `6000 x 6000`. Never consulted for gameplay truth.

---

## 5. Network, Client Prediction & Performance Architecture

### 5.1. Simulation Tick & Message Rate Limits (`rules.js`, `tuning.js`)
- **Authoritative Tick:** `50 ms` (`TICK_MS = 50`, `20 Hz` simulation and `PATCH_MS = 50` delta patches).
- **Ingress Rate Limits (per client):**
  - `order` (move/attack/stop): `50 ms` (`MOVE_ORDER_RATE_MS`)
  - `cast` (Q/W/E/R): `120 ms` (`CAST_RATE_MS`)
  - `buy` / `sell`: `100 ms` (`BUY_RATE_MS`)
  - `pick` / `spells`: `150 ms` (`PICK_RATE_MS`)
  - `recall`: `300 ms` (`RECALL_RATE_MS`)
  - `vote`: `300 ms` (`VOTE_RATE_MS`)
  - `side` (custom room swap): `400 ms` (`SIDE_RATE_MS`)
  - `chat`: `600 ms` (`CHAT_RATE_MS`, `CHAT_MAX = 140` chars, `CHAT_LOG_MAX = 30`)

### 5.2. Client Prediction & Server Reconciliation
- **Prediction:** On local right-click/stick move orders, `TeamModeScene` immediately advances local `_pred` position along `nav.findPath` for zero-latency responsiveness while awaiting the next `50 ms` server snapshot.
- **Reconciliation:** Incoming authoritative snapshots compare server `(x, y)` against `_pred`: minor drift is smoothly blended (`approach`), while large desyncs (`> PRED_SNAP_PX` or after server blink/knockback/stasis) snap cleanly to the authoritative state.
- **Clock Synchronization:** Client samples server `time` (`3` rapid samples at join, then periodically) selecting the lowest-RTT offset for cooldown bars, buff timers, and recall progress.

### 5.3. 100-CCU & Mobile Optimizations
- **Server CPU/Bandwidth:**
  - Hot visibility, tower aggro, and backdoor loops use squared distances (`dx*dx + dy*dy`) instead of `Math.hypot`.
  - `_syncChamp` guards every schema setter (avoiding dirty-flag overhead on unchanged fields).
  - Units split across two staggered patch halves when near cap; `VIEW_GC_MS = 1000` cleans unused `StateView` entries.
  - `@colyseus/schema 3.0.76` add->remove workaround preserves `items` ArraySchema integrity within single-patch windows.
- **Mobile / Touch (`lowFx`):**
  - Disables `postFX.addGlow` on touch devices.
  - Bakes static 2.5D terrain, elevation, shadows, walls, and bushes once into a single `RenderTexture`.
  - Clamps static culling at `10 Hz` and caps Fog of War redraws at `10 Hz` (`5 Hz` in `lowFx`).
- **100-CCU Verification Matrix (Target Benchmark Plan — Pending Load Test):**
  1. `100` concurrent clients across `10` active `5v5` rooms: verify mean server tick `< 25 ms` (within `50 ms` budget) and zero tick overruns.
  2. `5v5` teamfight bursts with multi-projectile fans + persistent zones: verify `StateView` patch size and GC pause `< 10 ms`.
  3. High-latency (`200 ms` RTT, `3%` packet loss) client prediction & reconnect recovery within `TEAM_RECONNECT_GRACE_S = 300s`.
  4. Low-end mobile WebGL frame-time stability (`>= 30 FPS`, `P10 >= 24 FPS`).

---

## 6. Playtest Telemetry KPIs & Balance Targets

### 6.1. Match Pacing & Target Ranges
| Metric | Target Range | Purpose |
| :--- | :---: | :--- |
| **Average Match Duration** | `14 – 22 min` | Ensure Lv 15 Augment milestone is reached in standard games |
| **Level 5 / 6 / 10 / 15 Timings** | `2:45` / `4:00` / `8:30` / `14:00` | Track per-role XP parity (Top, Jg, Mid, Bot, Support) & `%` reaching Lv 15 (`>= 70%`) |
| **First Tower / Golden Bug / Deadline** | `6:30–9:00` / `3:00` / `6:00` | Separate early dragon (`3:00`) from mid-game Deadline (`6:00`) before `10:00` group push |
| **Comeback Rate** | `20% – 35%` | `%` of matches won by a team trailing by **`>= 1500g` or `>= 2` towers at `10:00`** |

### 6.2. Extended Telemetry Schema (Aggregates + Event Logs)
| Category | Tracked Fields |
| :--- | :--- |
| **Match & Economy** | `matchId`, `version`, `teamComps`, `goldPerMin`, `xpPerMin`, `goldBySource` (`cs`/`kill`/`assist`/`objective`/`passive`), `csAt10m`, `itemBuyTimestamps` |
| **Combat & Event Log** | Timestamped damage/kill/objective events, `damageDealtByType` (`physical`/`magic`/`true`), `damageTaken`, `healingDone`, `shieldingDone`, `skillHitRate` |
| **CC & Survival** | `meanCcPerDeath`, **`medianCcDurationMs`**, **`p95CcDurationMs`**, **`maxContinuousCcMs`**, `zeroActionDeaths` |
| **Jungle, Vision & Movement** | `firstClearTime`, `goldenBugRate`, `deadlineRate`, `towersDestroyed`, `wardUptimePct`, `bushAmbushKills`, `pathFailures`, `wallStunCount` |
| **Network & Mobile Perf** | `rttMs` (mean/P95), `packetLossPct`, `tickComputeMs`, `tickOverruns`, `fpsP10`, `frameTimeMs`, `reconnectSuccessRate` |
| **Augments** | `augmentPickRate`, **`augmentWinRateByChamp`** (per-champion normalized), `synergyTriggerCount`, `rerollUsage` |

### 6.3. Balance Guardrails & Alert Thresholds
- **Champion Win Rate Window:** Healthy `48.0% – 52.0%`; flag `< 46.0%` or `> 54.0%`, or Pick Rate `> 35%` *(no Ban phase yet)*.
- **CC Lockout:** Monitor `P95` and `maxContinuousCcMs`; verify 3-stage DR (`1.0x -> 0.50x -> 0.25x` in `4s`) + `2.0s` Chain Immunity prevents `> 2.0s` unavoidable lockouts.
- **Modifier & Crit Separation:** Verify `2.0x` post-resist amplification cap holds separately from single `1.6x` Crit strikes and `+40` flat bonuses.
- **Augment Rarity Parity:** Compare `augmentWinRateByChamp` across Common (`60%`), Rare (`30%`), and Epic (`10%`) within each champion rather than raw tier averages.


---

## 7. Complete Quadrant Coordinate Reference (`shared/moba/map.js`)

All coordinates below are authored for **Blue Top-Jungle** (`tj_*`). Reflections across mid (`reflectMid(p) = (6000 - p.y, 6000 - p.x)`) generate **Blue Bot-Jungle** (`bj_*`), and diagonal mirroring (`mirror(p) = (p.y, p.x)`) generates **Red** equivalents.

### 7.1. Jungle Camps & Heal Relics (Exact Coordinates)
| Entity ID | Side / Quadrant | Type / Tier | Coordinates `(x, y)` | Red Mirror `(x, y)` |
| :--- | :---: | :---: | :---: | :---: |
| `blue_tj_small` | Blue Top Jg | `small` (3 Coffee Drones) | `(1350, 2500)` | `(2500, 1350)` |
| `blue_tj_medium` | Blue Top Jg | `medium` (2 Shredder Bots) | `(1500, 3450)` | `(3450, 1500)` |
| `blue_tj_big` | Blue Top Jg | `big` (Blue Buff Mainframe) | `(2150, 3000)` | `(3000, 2150)` |
| `blue_bj_small` | Blue Bot Jg | `small` (3 Loose Bugs) | `(3500, 4650)` | `(4650, 3500)` |
| `blue_bj_medium` | Blue Bot Jg | `medium` (2 Legacy Beetles) | `(2550, 4500)` | `(4500, 2550)` |
| `blue_bj_big` | Blue Bot Jg | `big` (Red Buff Mainframe) | `(3000, 3850)` | `(3850, 3000)` |
| `deadline` | Top River Pit | Epic Boss (`THE DEADLINE`) | `(2050, 2050)` | Shared Neutral |
| `golden` | Bot River Pit | Epic Boss (`GOLDEN BUG`) | `(3950, 3950)` | Shared Neutral |
| Heal Relics (`6` total) | Behind Tier-1s | `18% HP + 15% Mana` (`60s`) | Top `(650, 2240)` · Mid `(2070, 3930)` · Bot `(3760, 5350)` | Mirrored per lane |

### 7.2. Quadrant Wall & Bush Layout (`11` Walls + `6` Bushes per Quadrant)
- **Walls (`TOP_JUNGLE_WALLS`, `W_EDGE = 60 px`):**
  - Top-lane edge (`x = 920`): `y: 1620–2300`, `2600–3300`, `3600–3950` (leaving open river corner `< 1620` and two `300 px` jungle entrances).
  - River bank (`s = y - x = 400`): `m: 2560–3000`, `3300–3900`, `4300–5250` (open top/bot river corner `< 2560`, `300 px` mid-river entrance, and `400 px` epic-pit mouth).
  - Mid-lane edge (`m = x + y = 5618`): `s: 750–1500` and `1800–2800` (open river corner `< 750` and `300 px` mid-jungle gaps).
  - Interior camp pockets: horizontal shelf `(1150, 3000) -> (1600, 3000)`, big-camp partition `(1850, 2560) -> (1850, 2950)`, and circular plant pillar `(1250, 4000, r = 70)`.
- **Bushes (`TOP_JUNGLE_BUSHES`, `w = 130–150 px`):**
  - Top-lane entrance `(800, 2650–2950)`, Deadline-pit entrance `sm(650, 3950–4250)`, Mid-jungle entrance `sm(1500–1800, 5400)`, Mid-lane ambush `sm(2200–2500, 5480)`, River control `sm(200, 4700–5000)`, and interior camp circle `(1250, 3350, r = 110)`.

---

## 8. Client-Server Wire Protocol & Message Contracts

### 8.1. Client -> Server Messages (`TeamRoom.js` / `OfflineSim.js`)
| Message | Payload | Rate Limit | Validation & Authoritative Action |
| :--- | :--- | :---: | :--- |
| `hello` / `ready` / `startNow` | `{}` | - | Handshake (`welcome` reply) or queue ready check |
| `pick` / `lock` / `spells` | `{ champ }` / `{ d, f }` | `150 ms` | Champion select (`SELECT_MS = 30s`); `validSpellPair(d, f)` |
| `side` | `{ team }` | `400 ms` | Custom room team swap (`ROOM_MAX_HUMANS = 10`) |
| `order` | `{ type: 'move'\|'attack'\|'stop', x?, y?, id? }` | `50 ms` | Rejects hidden IDs (`!canSee`), pets, and dead actors; cancels Recall |
| `cast` | `{ slot: 'q'\|'w'\|'e'\|'r', x, y, id? }` | `120 ms` | Checks rank `> 0`, Lv `>= 6` for R, mana, CD, stun, and target visibility |
| `upgrade` | `{ slot: 'q'\|'w'\|'e'\|'r' }` | - | Consumes `skillPoints`; enforces `max 5` (Q/W/E) and `max 3` (R, Lv 6+) |
| `active` | `{}` | - | Triggers equipped `group: 'active'` item (`[1]`): Stasis / Cleanse / Veil |
| `ward` | `{ x, y }` | - | Places `45s` stealth ward within `550 px` (`90s` CD, max `2` live/player) |
| `augmentPick` / `augmentReroll` | `{ id }` / `{}` | - | Picks 1 of 3 offered Augments or consumes the single shared milestone reroll (Lv 5/10/15) |
| `buy` / `sell` | `{ item }` / `{ slot }` | `100 ms` | Requires fountain (`<= 520 px`) or dead; applies `recipePlan` & `sellValue` |
| `recall` | `{}` | `300 ms` | Starts `4.0s` channel (`2.6s` with `Recall Optimization`) |
| `vote` | `{ yes: boolean }` | `300 ms` | Casts `ROLLBACK` surrender ballot (`>= 12:00`, `4/5` needed, human veto) |
| `chat` | `{ text }` | `600 ms` | Broadcasts sanitized `<= 140` char message (`CHAT_LOG_MAX = 30`) |

### 8.2. Server -> Client Events
- **`welcome`:** `{ serverNow, team, champ, reconnectS: 300 }`
- **`atk`:** Batched auto-attack / tower shot origins & targets (`{ f, t, r }`), filtered by `INTEREST_RADIUS = 1600 px` and visibility.
- **`fx`:** Skill telegraphs (`proj`, `circle`, `zone`, `dash`, `blink`, `buff`, `heal`, `hit`, `knock`, `petatk`, `spell`), filtered so hidden bush casts never leak.
- **`announce` / `gold`:** Match milestones (First Blood, Tower Down, Epic Spawn/Kill, Augment Unlock, Ward Placed, Gold popups).

---

## 9. 2.5D Rendering, HUD Scaling & Low-FX Pipeline

- **Static Terrain Bake (`MobaMap.js`):** On scene creation, floor tiles, lane decals, river water gradient, 2.5D wall extrusions, drop shadows, and bush foliage are baked once into a single GPU `RenderTexture` to eliminate per-frame static draw calls on mobile and desktop.
- **Depth Sorting & Culling (`mobaGfx.js`, `TeamModeScene.js`):** Dynamic entities (`ChampionView`, `UnitView`, `StructureView`) sort by `depthAt(y)`. Static structure/camp visibility culling runs at `10 Hz` on touch/low-FX devices.
- **Scalable Bottom HUD (`MobaHud.js`):**
  - Default scale is `0.65` (persisted via `localStorage['bugsmash.hud.scale']`, adjustable `0.65`–`1.15` via `-` / `+` buttons).
  - `_syncScaledHud()` dynamically repositions `buyNudge`, `recallBox`, `hideBox`, toasts, and hover tooltips against `_panelTop()` and `_hudScale` so no widget floats detached at any scale.
- **Shop Tile Layout (`ShopPanel.js`, `uiKit.js`):** `41` items render across 9 rows (`1` consumable + `2` basic + `6` core) inside `1174 x 682` panel bounds, showing recipe discounts (`⚒️` green badge), `Builds from:` component checklists, and compact stat tags (`MR`, `Pen`, `MPen`, `MP/s`).


---

## 10. Complete Wall & Bush Geometry Catalog (`shared/moba/map.js`)

The `44` map walls and `24` bushes are generated symmetrically from `11` walls and `6` bushes authored in `TOP_JUNGLE_WALLS` and `TOP_JUNGLE_BUSHES`:
1. `reflectWall(w)` reflects each Blue Top-Jungle obstacle across the mid lane (`x + y = 6000`) to form Blue Bot-Jungle (`22` Blue walls, `12` Blue bushes).
2. `mirrorWall(w)` swaps `(x, y)` across the river axis (`x = y`) to form Red Top-Jungle and Red Bot-Jungle (`44` walls `w0..w43`, `24` bushes `b0..b23`).

### 10.1. Blue Top-Jungle Base Obstacles (`W_EDGE = 60 px`)
| ID Group | Look / Shape | Coordinates (`x1,y1 -> x2,y2` or `x,y,r`) | Thickness / Radius | Gameplay Function |
| :--- | :---: | :--- | :---: | :--- |
| Top Edge #1 | `cubicles` (`seg`) | `(920, 1620) -> (920, 2300)` | `60 px` | Separates Top Lane from Blue Top Jungle; open above `y = 1620` |
| Top Edge #2 | `cubicles` (`seg`) | `(920, 2600) -> (920, 3300)` | `60 px` | Leaves `300 px` gank entrance at `y = 2300–2600` |
| Top Edge #3 | `cubicles` (`seg`) | `(920, 3600) -> (920, 3950)` | `60 px` | Leaves `300 px` base-side entrance at `y = 3300–3600` |
| River Bank #1 | `glass` (`seg`) | `sm(400, 2560) -> sm(400, 3000)` | `60 px` | Open top river corner (`m < 2560`) for seamless lane-to-river rotate |
| River Bank #2 | `glass` (`seg`) | `sm(400, 3300) -> sm(400, 3900)` | `60 px` | Leaves `300 px` river entrance at `m = 3000–3300` |
| River Bank #3 | `glass` (`seg`) | `sm(400, 4300) -> sm(400, 5250)` | `60 px` | Leaves `400 px` Deadline Pit mouth at `m = 3900–4300` |
| Mid Edge #1 | `partition` (`seg`) | `sm(750, 5618) -> sm(1500, 5618)` | `60 px` | Open river corner (`s < 750`) along Mid Lane |
| Mid Edge #2 | `partition` (`seg`) | `sm(1800, 5618) -> sm(2800, 5618)` | `60 px` | Leaves `300 px` Mid-Jungle flank at `s = 1500–1800` |
| Camp Divider #1 | `shelf` (`seg`) | `(1150, 3000) -> (1600, 3000)` | `60 px` | Separates `tj_small` and `tj_medium` camps |
| Camp Divider #2 | `partition` (`seg`) | `(1850, 2560) -> (1850, 2950)` | `60 px` | Shields `tj_big` Blue Buff pit (wall-pin target for `Brick` / `Patch`) |
| Corner Pillar | `plant` (`circle`) | `(1250, 4000)` | `r = 70 px` | Base-entrance kite pillar |

### 10.2. Blue Top-Jungle Base Bushes (`TOP_JUNGLE_BUSHES`)
| Bush Role | Shape | Coordinates | Width / Radius | Tactical Use |
| :--- | :---: | :--- | :---: | :--- |
| Top Lane Ambush | `seg` | `(800, 2650) -> (800, 2950)` | `140 px` | Top laner brush control & jungler lane-gank staging |
| Deadline Pit Guard | `seg` | `sm(650, 3950) -> sm(650, 4250)` | `150 px` | Jungle-side ambush outside `The Deadline` pit |
| Mid Jungle Flank | `seg` | `sm(1500, 5400) -> sm(1800, 5400)` | `150 px` | Conceals jungler gank approach to Mid Lane |
| Mid Lane Side Bush | `seg` | `sm(2200, 5480) -> sm(2500, 5480)` | `130 px` | Classic mid-lane side brush |
| River Control Bush | `seg` | `sm(200, 4700) -> sm(200, 5000)` | `140 px` | Neutral river pixel bush (mirrored pair across river) |
| Deep Jungle Bush | `circle` | `(1250, 3350)` | `r = 110 px` | Conceals camp invades between `tj_small` and `tj_medium` |

---

## 11. Client Scene Lifecycle, Camera & Input Bindings (`TeamModeScene.js`, `MobaHud.js`)

### 11.1. Desktop & Touch Controls
| Input | Action | Notes / Rate Rules |
| :--- | :--- | :--- |
| **Right-Click / Left-Click** | Move / Attack Target | Right-click moves or targets enemy under cursor; `MOVE_ORDER_RATE_MS = 50 ms` |
| **`Q` / `W` / `E` / `R`** | Cast Skill at Cursor | Auto-aims via `autoAimsAtEnemy` / `autoAimReach` if cursor is on self (`< 24 px`) |
| **`Ctrl + Q/W/E/R`** | Upgrade Skill Rank | Also clickable via gold `+` badge above each HUD skill slot |
| **`D` / `F`** | Cast Summoner Spell | Casts selected office perk toward cursor / target |
| **`1`** | Trigger Active Item | Activates `Debugger Breakpoint`, `Git Revert Charm`, or `Shadow Proxy` |
| **`4`** | Place Ward Trinket | Places `45s` stealth ward toward cursor within `550 px` (`90s` CD) |
| **`B` / `P` / `C`** | Recall / Shop / Info | `P` toggles `ShopPanel`; `C` toggles champion stat & skill breakdown |
| **`S` / `Space`** | Stop / Attack Nearest | `S` halts movement; `Space` targets nearest visible enemy in range |
| **`G`** | Tactical Ping | Broadcasts world ping at cursor coordinates |
| **`Y` / `Z`** | Camera Lock / Center | `Y` toggles Camera Lock (`bugsmash.team.camLock`); hold `Z` to center on champion |
| **`Tab` / `Enter` / `Esc`** | Scoreboard / Chat / Menu | `Esc` closes Shop/Info first, then opens Pause/Settings menu |
| **`-` / `+` (HUD Top-Right)** | Scale Bottom HUD | Adjusts HUD scale (`0.65`–`1.15`, default `0.65`, saved in `localStorage`) |

### 11.2. Camera, Reconnect & Offline Fallback
- **Locked vs. Free Camera:** Defaults to locked (`CAM_LOCK_KEY = '1'`). In free-camera mode (`Y`), moving the cursor to screen edges pans the world camera (suspended while Shop, Scoreboard, Chat, or Modals are open).
- **Watchdog & Reconnect:** Handles browser tab sleep gracefully (`STALL_GRACE_MS = 4000`) before triggering reconnect; preserves match token for `300s` (`TEAM_RECONNECT_GRACE_S`) and offers instant fallback to `OfflineSim` if the online room closes.
- **Audio & Feedback:** Distinct SFX hooks for skill casts, hit flashes, ward placement, augment unlocks, first blood, tower destruction, and `ShopPanel` buy/sell/upgrade confirmations.


---

## 12. 100-CCU Load Test & QA Verification Checklist

All items below define the staged verification suite required before declaring online capacity `100 CCU`-ready:

1. **Syntax & Shared-Module Integrity:**
   - `node --check` passes across `shared/moba/*.js`, `server/rooms/TeamRoom.js`, `server/game/moba/*.js`, `src/entities/moba/*.js`, `src/scenes/TeamModeScene.js`, and `src/ui/moba/*.js`.
   - Navmesh validation (`nav_check.mjs`) confirms `0` blocked lane waypoints, `0` trapped jungle camp spawns, and valid `nearestFree` exits across all `44` walls.
2. **Server Authoritative Load Benchmark (`10 x 5v5` Rooms = `100 CCU`):**
   - Spawn `10` concurrent `TeamRoom` instances with active `MobaBots` and full wave/camp/epic simulation.
   - Measure mean tick duration (target `< 25 ms`), `P99` tick duration (target `< 45 ms` within `50 ms` tick budget), heap RSS stability over `20` minutes, and `StateView` delta patch bandwidth per client (`< 15 KB/s` average).
3. **Visibility & Anti-Map-Hack Verification:**
   - Assert hidden enemy champions inside unwarded bushes (`_hiddenFrom === true`) are omitted from `StateView` patches, `atk` broadcasts, and `fx` telegraphs.
   - Assert placing a Ward Trinket (`[4]`) inside an occupied bush immediately reveals hidden enemies within `750 px` to the entire allied team.
4. **Latency, Packet Loss & Reconnect Recovery:**
   - Simulate `200 ms` RTT + `3%` packet loss: verify `_pred` reconciliation remains smooth without erratic snapping outside `PRED_SNAP_PX`.
   - Simulate mid-match disconnect and rejoin within `TEAM_RECONNECT_GRACE_S = 300s`: verify full inventory, skill ranks, augments, cooldowns, and `StateView` restore cleanly.
5. **Mobile WebGL Performance Verification:**
   - Verify touch devices activate `lowFx` (`postFX.addGlow` disabled, `10 Hz` culling, `5 Hz` Fog Canvas redraw, single `RenderTexture` terrain bake) and hold `>= 30 FPS` (`P10 >= 24 FPS`) during 5v5 teamfights.

---

## 13. Mobile Touch HUD, Virtual Joystick & Aim Preview Mechanics

- **Touch Detection (`TeamModeScene.js`):** Activates touch layout strictly on coarse primary pointers (`pointer: coarse`), keeping Windows/desktop touchscreens on standard mouse+keyboard HUD.
- **Touch Controls (`MobaHud.js`):**
  - Left-side virtual joystick emits `onStick(dir | null)` move orders at `STICK_ORDER_MS = 110 ms` cadence.
  - Right-side ergonomic attack button (`⚔`) + skill arc (`Q/W/E/R`) + Summoner Spells (`D/F`) use `autoAimsAtEnemy` and `autoAimReach` for tap-to-cast targeting.
  - Dedicated touch buttons (`🏠` Recall, `🛒` Shop, `ℹ` Info) replace desktop keyboard shortcuts (`B`, `P`, `C`).
- **Aim Previews:** Desktop cursor hover and skill-key hold draw range circles, projectile line indicators, fan cones (`count`/`spread`), and `circle` landing telegraphs using the exact `SkillEngine` ranges from `shared/moba/champions.js`.
- **Minimap & Pings:** Clicking or tapping the bottom-left minimap issues move orders or camera jumps (`onMinimap(wx, wy)`); `G` broadcasts tactical pings visible on both the world canvas and minimap.


---

## 14. Visibility Resolution & Map Symmetry Verification

### 14.1. Authoritative `_hiddenFrom(e, team)` / `canSee` Logic
```text
function isHiddenFrom(entity e, team):
  1. if e.team === team OR isStructure(e) -> return false (always visible)
  2. if e._revealUntil > now -> return false (recently attacked/cast or Bush Hacker revealed)
  3. if e.champ && e._stealthUntil > now (Shadow Proxy Veil):
       if any living enemy champion within 280 px -> return false
       return true (stealthed)
  4. sameBush = !e._bush
  5. for each living ally champion on `team`:
       if e._bush && ally._bush === e._bush -> sameBush = true
       if dist2(ally, e) <= 1100^2 && sameBush -> return false
  6. for each living Ward (`kind === 'ward'`) on `team`:
       if e._bush && ward._bush === e._bush -> sameBush = true
       if dist2(ward, e) <= 750^2 && sameBush -> return false
  7. if !sameBush -> return true (hidden in unwarded/unoccupied bush)
  8. for each living ally structure on `team`:
       if dist2(struct, e) <= 1050^2 -> return false
  9. for each living ally minion (`kind !== 'pet' && kind !== 'ward'`) on `team`:
       if dist2(minion, e) <= 680^2 -> return false
 10. return true (in Fog of War)
```

### 14.2. Symmetry Proof (`mirror` & `reflectMid`)
- Every structure, camp, wall, bush, and heal relic on **Blue** (`s > 0`, where `s = y - x`) maps via `mirror(p) = (p.y, p.x)` to **Red** (`s < 0`) at identical Euclidean distances from fountain `(380, 5620)` / `(5620, 380)` and from mid-river center `(3000, 3000)`.
- `deadline` `(2050, 2050)` and `golden` `(3950, 3950)` lie strictly on `x = y` (`s = 0`), guaranteeing equidistant travel from both teams' Mid lanes (`3000, 3000`), Top/Bot lanes, and fountains.
- Both `TOP_JUNGLE_WALLS` and `TOP_JUNGLE_BUSHES` are reflected across `x + y = 6000` (`reflectMid`) before mirroring across `x = y` (`mirror`), ensuring symmetric gank paths, flash-able wall thicknesses (`60 px`), and camp pocket angles in all four quadrants.

### 14.3. Complete Match End-to-End Scene Flow (`TeamModeScene.js`)
1. **Boot & Asset Load:** Loads procedural textures (`looks.js`), stickman poses (`144x144` SVG), baked terrain (`MobaMap`), and UI panels (`ShopPanel`, `AugmentPanel`, `InfoPanel`, `MobaHud`).
2. **Lobby / Select / Loading:** Submits champion `pick`, `lock`, and `spells` (`D`/`F`); falls back to `OfflineSim` if player chooses offline practice or server room is unreachable.
3. **Live Match Loop (`update`):**
   - Samples server `time` offset, updates `_pred` local movement, renders `ChampionView` / `UnitView` / `StructureView` interpolations, refreshes `10 Hz` Fog Canvas with active wards (`750 px`), and drives `_tickBuyNudge` + `_tickShopAssist`.
4. **Match End (`phase === 'ended'`):** Clears transient banners/toasts/vote UI (`clearTransient()`), displays `EndScreen` with K/D/A, gold, rank LP/star delta, and Rematch / Menu navigation.


---

## 15. 4-Stage Playtest & Live-Telemetry Validation Protocol

To move cleanly from design/architecture specifications to **proven gameplay fun, balance, and 100-CCU stability**, every release candidate executes the 4-stage playtest validation protocol below.

### 15.1. Stage 1 — Core Combat "Feel Check" (Zero Augments, Limited Gear)
- **Scope:** Select `4–6` representative champions across core roles (`Stack` Tank, `Zero` Assassin, `Pixel` Mage, `Tester` Marksman, `Ops` Support, `Patch` Fighter). Disable Code Augments (`AUGMENT_LEVELS = []` in test harness) and cap builds at `2` Core items.
- **Format:** Structured `1v1` lane duels, `2v2` bot skirmishes, and controlled `5v5` river teamfights across `Lv 3 / 6 / 10 / 15` (before & after Crit core items, on squishy vs high-armor targets, focusing first on `Rush`, `Pager`, `Hira`, `Stack`, `Lint`, `Tester`, `Swipe`, and `Cache`).
- **Required Measurements & Pass Criteria:**
  1. **Time-to-Kill (TTK):** Burst assassins (`Zero`, `Pixel`) should require a complete combo rotation (`>= 1.8s–3.0s`) rather than instant sub-`1.0s` deletions; Tank vs Carry duels should last `>= 6s`; ADC sustained DPS overtakes burst mages once protected in extended `5v5` fights.
  2. **CC Counterplay & Zero-Action Ceiling:** Verify `maxContinuousCcMs` stays `< 2.0s` (`1.36s` cap on 3-hit chain + `2.0s` Chain Immunity via `applyHardCcDuration`), measure `wallStun` + knockback lockdown windows separately, and verify `zeroActionDeaths` (`%` deaths with zero player input window).
  3. **Input & Hit Feedback:** Confirm `MOVE_ORDER_RATE_MS = 50 ms`, projectile `ATK_PROJ_SPEED = 1500 px/s`, `circle` telegraph readability (`delay = 400–1200 ms`), and wall-slide smoothness (`nav.pushOut`).

### 15.2. Stage 2 — Progression, Item Choice & Augment Agency Check
- **Scope:** Enable full `41`-item shop (with Basic -> Core recipes) and `26`-augment system (with Lv 10 guaranteed Epic + `1` shared reroll per milestone).
- **Required Measurements & Pass Criteria:**
  1. **Gold-to-Item Pacing:** Record exact timestamps for Boots upgrade (`~3:00–4:30`), 1st Core (`~4:30–6:00`), 2nd Core (`~8:00–10:00`), and full build (`15:00+`).
  2. **Item Build & Active Diversity:** Track `itemPickRate` and `itemWinRateDelta` by role and matchup (including `[1]` Active trade-off distribution across `Git Revert Charm`, `Debugger Breakpoint`, and `Shadow Proxy`); flag any Core item `> 70%` pick rate across unrelated roles.
  3. **Augment Agency & Win-Rate Delta:** Track `augmentPickRate`, `reroll` usage (`1`/milestone), `synergyTriggerCount`, and `augmentWinRateDelta` by champion/milestone/role; flag high pick rate combined with large positive win-rate delta rather than pick rate alone.

### 15.3. Stage 3 — 30-Match Smoke Test & Full-Loop Telemetry Study
- **Important Caveat:** `30` matches across `18` champions (`30 * 10 / 18 ≈ 16.7` appearances/champion if uniform) functions strictly as a **Smoke Test** to catch broken outliers, **not** statistical balance sign-off. Even `150` matches (`≈ 83` appearances/champion) carries `±11%` 95% CI and `200` appearances/champ carries `±7%` CI; confirming a tight `48%–52%` band requires **`>= 1,000` appearances/champion (`±3%` CI)** stratified by role, comp, and patch.
- **Tracked Telemetry Metrics & Verification Gates:**
  - `champId` win rate (`48%–52%` target; immediate outlier investigation `< 44%` or `> 56%`) and pick rate *(ban rate deferred until draft ban phase is implemented)*.
  - `averageMatchDuration` (`14–22 min` hypothesis), `firstBloodAt`, `firstTowerAt`, `goldenBugAt` (`3:00`), `deadlineAt` (`6:00`), plus **Post-Ace 30s/60s Gold & Tower Delta** (`<= 1` uncontested objective/tier swing on pre-`12:00` ace).
  - **Tower Dive & Shutdown Gates:** Track dive survival rate, trade ratio (`kills / towerDmgTaken`), `shutdownGoldCollected`, and post-shutdown objective/match conversion.
  - **Objective Equity Gate:** Compare team win rate and comeback rate after `Golden Bug` (`+200g` Economy) vs `The Deadline` (`90s` `+40%` wave / `+20%` struct Siege) vs team gold deficit at capture time.
  - `levelTimingByRole` (`Lv 5 / 6 / 10 / 15` split across Top / Jungle / Mid / Bot / Support), `deathsPerMatch`, `zeroActionDeaths`, and `repeatPlayRate`.

### 15.4. Stage 4 — 5-Step Interactive Onboarding, Clarity & Mobile Touch Audit
- **5-Step Hands-On Tutorial Targets:** (1) Move + auto-attack + Bush Fog stealth, (2) Single combo rotation + telegraph dodge, (3) Summoner Spell (`D`/`F`) + `[4]` Ward placement, (4) Shop Basic -> Core combine + `[1]` Active trigger, (5) `Golden Bug` / `The Deadline` river contest prompt.
- **Clarity, Mobile & Accessibility Checks:** Verify clear on-screen callouts for `circle` telegraphs, Hard CC Immunity shields, `Ignite` / `Strict Linter` anti-heal debuffs, and Fog of War targeting blocks; test small-screen touch play at `0.65` HUD scale, screen flash/motion comfort, and `<= 2` recall shop mastery.

### 15.5. Release & Engineering Verification Matrix
| Gate | Metric / Proof Required | Status / Owner Target |
| :--- | :--- | :--- |
| **G1: Offline = Online Parity** | `OfflineSim` & `TeamRoom` share wave `30s`, ramp `6` hits, backdoor `0.40x`, `30:00` Crunch, `applyHardCcDuration`, and basic-attack Crit/Passives | Verified in code |
| **G2: Combat & Snowball Smoke** | TTK/CC at Lv 3/6/10/15, `zeroActionDeaths`, Tower Dive & Shutdown ratios, `Deadline` Siege vs `Golden` Economy delta | `30`-match Smoke Test (Pending) |
| **G3: Network Jitter & 100 CCU** | Simulate `50 / 100 / 150 / 200 ms` latency + packet loss + reconnect (`rejectedCmdRate`, `posErrorPx`, `skillCastLatencyMs`); `10` rooms `< 25 ms` mean tick (`P99 < 45 ms`) | Network & Load Test (Pending) |
| **G4: Mobile & Onboarding Pass** | `>= 30 FPS` (`P10 >= 24 FPS`) touch play at `0.65` HUD scale; 5-step interactive tutorial & status readability | Device & Blind UX Test (Pending) |


---

## 16. Client UI Layers, Rendering Depth Hierarchy & Navigation API

### 16.1. UI & World Depth Stratification (`TeamModeScene`, `MobaHud`, `ShopPanel`, `AugmentPanel`)
Strict Phaser depth ordering prevents clicks or visual overlays from bleeding across layers:

| Layer / Component | Depth | Coordinate Space | Interaction & Lifecycle Notes |
| :--- | :---: | :--- | :--- |
| **Baked 2.5D Terrain (`MobaMap`)** | `0–5` | World (`6000x6000`) | Static floor, lanes, river, shadows baked into single `RenderTexture` |
| **Units / Champs / Structures** | `depthAt(y)` | World (`y`-sorted) | `ChampionView`, `UnitView`, `StructureView`; smooth 2.5D occlusion |
| **Skill Telegraphs & Projectiles (`MobaFx`)** | `y`-sorted + `10–25` | World | Circles, cones, dash trails, Tower Warning Laser |
| **Fog of War Canvas (`MobaMap`)** | `40` | World (`150x150` upscaled) | Redrawn at `10 Hz` (`5 Hz` in `lowFx`); GPU bilinear smoothing |
| **Bottom Scaled HUD (`MobaHud.panelRoot`)** | `46` | Screen (`scrollFactor 0`) | Centered at `(px, H)`, scaled `0.65–1.15` (`bugsmash.hud.scale`) |
| **Minimap (`MobaHud.mm`)** | `46–48` | Screen (Bottom-Left) | Interactive click-to-move / jump camera (`onMinimap`) |
| **Top Score & Epic Timers (`MobaHud`)** | `48–49` | Screen (Top-Center) | Kill scores, match clock, Golden Bug / Deadline timers & active buffs |
| **Floating Context Widgets (`buyNudge`, `recallBox`, `hideBox`)** | `52` | Screen (Anchored) | Synced dynamically via `_syncScaledHud()` to `_panelTop()` |
| **Target Info / Death / Vote / Tip / Hover Tooltip** | `51–60` | Screen (`scrollFactor 0`) | Hover tooltips anchored cleanly to `px + localX * sc` & `_panelTop() - 8` |
| **`ShopPanel` (Office Supply Store)** | `86` | Screen (`1174 x 682`) | Consumes clicks while open; ESC closes cleanly (`P` toggle) |
| **`AugmentPanel` (3-Card Picker)** | `92` | Screen (Centered overlay) | Dark dim (`0.72` alpha); 3-card click + single `REROLL (1 FREE)` button |

### 16.2. Complete `shared/moba/nav.js` Public API Reference
Every module in `server/` and `src/` shares the identical obstacle and pathing math:

| Function | Signature | Algorithm & Complexity Behavior |
| :--- | :--- | :--- |
| **`createNav`** | `({ walls, w, h })` | Instantiates isolated nav solver supporting runtime `setDynamic` walls |
| **`isBlocked`** | `(x, y, r = 0)` | Returns `true` if circle `(x, y, r)` overlaps any wall via `wallDist < r` |
| **`pushOut`** | `(x, y, r = 0)` | Runs up to `4` iterative minimum-penetration pushes to resolve corner overlap |
| **`segmentClear`** | `(x0, y0, x1, y1, r = 0)` | Exact segment-to-wall distance (`segWallDist`); bypasses A* when straight line is clear |
| **`clipMove`** | `(x0, y0, x1, y1, r = 0)` | Binary/stepped segment clip returning `{ x, y, hit }`; used by dashes & knockbacks |
| **`nearestFree`** | `(x, y, r = 0)` | Expanding ring/grid search returning nearest valid walkable coordinate; used by blinks |
| **`findPath`** | `(x0, y0, x1, y1, r = 0)` | Lazy `60 px` cell A* (`GRID_MARGIN = 6`, no corner cutting) + string-pull smoothing |
| **`pathLength`** | `(x0, y0, pts)` | Computes total polyline distance from `(x0, y0)` through returned waypoints |

### 16.3. HUD Responsive Anchoring Invariant (`MobaHud.js`)
- Because `panelRoot` scales upward from bottom-center `(this.px, this.H)` (`y` origin at screen bottom), screen height of the bottom bar is always `PANEL_H * this._hudScale`.
- Screen coordinates of any child control at `(localX, localY)` inside `panelRoot` are strictly:
  - `screenX = this.px + localX * this._hudScale`
  - `screenY = this.H + localY * this._hudScale`
- `_syncScaledHud()` enforces this invariant automatically on startup and inside every `adjustHudScale(delta)` call for `buyNudge`, `recallBox`, `hideBox`, `_layoutToasts`, and hover tooltips.

### 16.4. Cross-Document Architecture Map
- **[01_GAME_RULES_AND_MECHANICS.md](./01_GAME_RULES_AND_MECHANICS.md):** Combat math, XP/respawn, economy, waves/camps/epics, Bot AI, Ranked/MMR, and Offline/Online parity.
- **[02_CHAMPIONS_AND_SKILLS.md](./02_CHAMPIONS_AND_SKILLS.md):** 18 Champions, skills, unique passives, balance matrix, Lv 1–18 progressions, and kit power-budget counterplay audit.
- **[03_ITEMS_AND_PASSIVES.md](./03_ITEMS_AND_PASSIVES.md):** 41 items, Basic -> Core combine recipes, stat valuation, active trade-offs, and 18-champion recommended builds.
- **[04_CODE_AUGMENTS.md](./04_CODE_AUGMENTS.md):** 26 Augments (100% Epic coverage), Lv 10 Epic pity, 1 shared milestone reroll, 3 synergies, and champion build lists.
- **[05_MAP_VISION_SPELLS_AND_NETWORK.md](./05_MAP_VISION_SPELLS_AND_NETWORK.md):** Open Office geometry, `nav.js`, Summoner Spells, Wards/Fog/Visibility, Client-Server protocol, 100-CCU & 4-Stage Playtest Plan.


---

## 17. Developer Console Helpers & Navigation Check CLI

### 17.1. Offline Practice Harness (`OfflineSim.debug(cmd, a, b)`)
For rapid combat, UI, and regression testing without spinning up a full multiplayer match:

| Command | Arguments | Effect in `OfflineSim` |
| :--- | :--- | :--- |
| **`level`** | `(lv)` | Clamps champion level `1..18`, sets `xp = XP_TABLE[lv - 1]`, triggers `_recalc(me, true)` |
| **`gold`** | `(amount)` | Adds exact `amount` gold to local player for instant build / combine testing |
| **`tp`** | `(x, y)` | Teleports local player immediately to map coordinate `(x, y)` and clears `_order` |
| **`kill`** | `()` | Inflicts lethal debug death on local player to inspect death overlay & respawn timer |
| **`end`** | `(winnerTeam)` | Transitions match immediately to `'ended'` phase for `EndScreen` & ranking checks |
| **`fight`** | `()` | Pulls nearby red champions into combat proximity to test teamfight FPS, CC DR, and VFX |

### 17.2. Automated Geometry & Balance Sanity Commands
- **Map Navmesh Verification:** Run after any modification to `WALLS`, `LANES`, or `CAMPS` in `shared/moba/map.js`:
  ```bash
  node tools/playtest/nav_check.mjs --map
  ```
- **Syntax & Schema Integrity Check:** Run after edits across `shared/moba/`, `server/`, or `src/`:
  ```bash
  node --check shared/moba/rules.js shared/moba/champions.js shared/moba/items.js shared/moba/augments.js server/rooms/TeamRoom.js server/game/moba/MobaBots.js src/entities/moba/OfflineSim.js src/scenes/TeamModeScene.js src/ui/moba/ShopPanel.js src/ui/moba/AugmentPanel.js src/entities/moba/MobaHud.js
  ```

### 17.3. Complete Telemetry Event-Log JSON Schema (Stage 3 Playtest Capture)
To diagnose *why* a champion, item, or objective overperforms—rather than relying only on end-of-match totals—every Stage 3 playtest logs structured events:

```json
{
  "tMs": 182450,
  "matchId": "room_abc123",
  "event": "kill | objective | tower | augment | item_buy | cc_chain | rollback",
  "actorId": "me",
  "champId": "zero",
  "targetId": "bot_3",
  "pos": { "x": 3950, "y": 3950 },
  "meta": {
    "dmgByType": { "physical": 840, "magic": 55, "true": 210 },
    "ccDurationMs": 1650,
    "goldDelta": 345,
    "augmentId": "evo_zero_reset",
    "itemCostPaid": 450
  }
}
```

- **Why Event Logs Matter:** Separating `physical`, `magic`, and `true` damage breakdown per kill exposes whether a carry died to base kit burst (`Zero Q+E`), uncountered magic AoE (`Pixel R`), item procs (`Crit Surge`), or prolonged CC chains (`> 2.0s` `ccDurationMs`), giving actionable data before making numerical tuning passes.
- **Role-Specific Objective KPIs:** Compare `tMs` distribution of first `Golden Bug` (`180s` spawn, pure `+200g` Economy) vs. first `The Deadline` (`360s` spawn, `90s` pure Siege) and `firstTowerAt` to confirm neither epic forces premature abandonment of Tier-1 laning.
- **Core Design Review Benchmarks (Playtest Evaluation Questions):**
  1. How much gold, XP, and structure advantage does a winning team capture within `30s` and `60s` after winning a `5v5` fight?
  2. Do losing-lane players still retain meaningful tactical options (split-pushing, picking shutdown bounties, contesting Economy vs. Siege epics)?
  3. Under `50 / 100 / 150 / 200 ms` simulated latency + packet loss, do input acceptance (`_doOrder`, `_doCast`), skillshot hit registration, and reconnect synchronization feel crisp without rubberbanding?

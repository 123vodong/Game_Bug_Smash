# Team Mode v4 — "Custom Rooms, Bushes & Smooth Play" · breakdown + frozen contract

Status: ✅ built · reviewed · playtested · integrated (2026-11-08).

**Results:** `team_sim --exploits` 85/85 · `exploits.mjs` 9/9 · `team_sim --soak` 0 decode errors · team_ff: 0 exceptions /
stuck / in-wall, vision audits 0 leaks / 0 missing, tick p99 ≈ 1.7 ms, **4.56 KB/s per client (−40 %)**, peak ≈ 9–10 KB/s.
Real two-browser custom rooms verified. **Integration fixes:** StateView add/remove deferred to onBeforePatch (upstream
schema 3.0.76 bug → "refId not found"), separation sort x+y (side bias), pet attacks reveal the owner, DEADLINE cleave fx
vision-filtered, towers see into bushes within range, escape dashes/blinks never auto-aim at enemies + target skills
search castable range only (shared `autoAimsAtEnemy` / `autoAimReach` in champions.js), bot skillshot line ignores
hidden units, decor culling respects hidden texts, empty rooms list rendered, PLAY AGAIN from a custom match → rooms screen.
**Open:** low ✨ quality does not lower render resolution (no FPS gain on software renderers); bots don't use bushes to
ambush/escape; crowded-fight nameplate overlap; offline epic timers show UP at 0:00; room name hard-cut at 24 chars;
early-match toasts overlap. Builds on v1–v3 (TEAM_MODE_BREAKDOWN.md, _V2_, _V3_) — all still apply unless changed.
Coordinator owns this file + `shared/moba/*` + `src/main.js`. **Contract = frozen** — report needed changes.

## 1. Goal (player feedback)
1. **Room mode (custom games)** — create or join a named room, see the rooms list, **choose your side**, the host
   **starts any time**; empty slots are filled by bots. Then the usual draft → loading → match.
2. **Auto-aim** — casting a skill / spell with no usable mouse direction (cursor on yourself, touch quick-tap, keyboard
   quick-cast) aims at the nearest sensible enemy, MOBA-style.
3. **Bushes** — hiding spots like MOBA brush: inside a bush you're invisible to enemies unless one of them is in the same
   bush, or you attacked/cast in the last 1.5 s. **Enforced by the server** (hidden enemies are not even sent).
4. **Optimise** — no lag: lower bandwidth, cheaper server ticks, smoother client frames on weak devices.

## 2. Shared data (DONE — read-only for dev agents)
- `map.js` → `BUSHES` (24; `{id, kind:'seg'|'circle', x1,y1,x2,y2,w | x,y,r}`), `bushAt(x, y)` → bush id or ''.
- `rules.js` → `BUSH_REVEAL_MS` (1500), `AUTO_AIM_SLACK` (150), `ROOM_NAME_MAX` (24), `ROOM_MAX_HUMANS` (10).

## 3. Contract changes (frozen)

### 3.1 Custom rooms
- New room name **`team_custom`** (same TeamRoom class, option-driven) registered in `server/index.js`; quick play stays
  `team` (matchmaking never mixes them). Create: `client.create('team_custom', { name, roomName })`; join:
  `client.joinById(roomId, { name })`. Room metadata (`setMetadata`): `{ roomName, host, humans, blue, red, phase }`.
- **HTTP** `GET /api/team/rooms` → `[{ roomId, roomName, host, humans, blue, red, phase, locked }]` (custom rooms only,
  newest first, ≤ 50). Cheap (matchMaker.query), no auth.
- New first phase for custom rooms: **`room`** (no timer). Humans sit on a side; message `side {team:'blue'|'red'}`
  (≤ 5 humans per side; rate limited). Host = first human (`hostId`), passes to the next human if the host leaves.
  `startNow` from the host (any time, ≥ 1 human) → `select` (bots fill the empty seats) → `loading` → `playing`.
  A custom room is `locked` from `select`. Quick-play rooms keep the v3 `lobby` queue phase.
- Schema (append at END): `TeamState + custom boolean · roomName string · hostId string`.

### 3.2 Bushes / visibility (server-enforced)
- Per-client **StateView** (@colyseus/schema 3 `view()` / `client.view`): an enemy champion / minion / monster / pet that
  is **hidden** from the client's team is NOT in that client's view (removed while hidden, re-added when visible).
  Allies and the client's own entities are always visible. Structures always visible. (Spectators: everything.)
- Hidden = in a bush AND no champion of the viewer's team in the same bush AND not revealed (attacked / cast / took
  damage? → NO, damage does not reveal) within BUSH_REVEAL_MS.
- Hidden enemies can't be targeted by point-and-click (orders, `target` skills, ignite/smite, auto-target), but skillshots
  and AoE still hit them. Bots obey the same visibility (no wallhack bots).
- `atk` / `fx` messages involving a hidden entity are **not sent to that enemy team** (else they leak position).
- TeamChamp gains (END) `inBush string` (bush id; own team uses it to render the "you are hidden" tint).

### 3.3 Auto-aim
- Client: if the aim point is within ~60 px of your champion (cursor on yourself), on touch quick-tap, or when the skill
  key is pressed while the cursor is outside the window → aim at the nearest **visible enemy champion** within
  `range + AUTO_AIM_SLACK`, else the nearest visible enemy unit, else facing. Show this auto-target in the aim preview.
- Server: `cast`/`spell` with an aim within MIN_AIM_DIST of the caster and no `id` → same fallback (visible enemies only).

### 3.4 Optimisation (measured before/after)
- Server: per-tick allocations (no new arrays/objects in hot loops), spatial grid / buckets for nearest-enemy and range
  queries, bots think at 5–10 Hz staggered (not every tick), sync only changed fields (round positions to integers —
  already), fx/atk interest management (only to clients whose camera could see it: within ~1600 px of any of that
  team's champions, or the event's own team).
- Client: skip updating/rendering views far off-camera (setVisible false + no tween work), cap particles/numbers/text
  objects, avoid per-frame Text.setText when unchanged, throttle minimap redraw (≤ 10 Hz), auto quality (if FPS < 45 for
  3 s → lower effects / disable glow / reduce resolution scale; HUD toggle), pause offscreen animations, pool everything.
- Report: bytes/s per client (avg, peak fight), server tick avg/p99, client FPS in a 10-champion fight (headless before/
  after, same script).

## 4. Tasks (one writer per file)
| Owner | Files |
|---|---|
| **server-dev** | `server/index.js`, `server/rooms/TeamRoom.js`, `server/game/moba/*`, `tools/playtest/{team_sim,team_ff,exploits}.mjs` |
| **client-world** | `TeamModeScene.js`, `src/entities/moba/{MobaMap,MobaFx,MobaHud,OfflineSim,mobaGfx,StructureView,Fallbacks}.js`, `src/ui/moba/InfoPanel.js` |
| **client-ui** | `TeamLobbyScene.js`, `TeamSelectScene.js`, **new** `src/scenes/TeamCustomScene.js` (rooms list + room screen), `src/ui/moba/{ShopPanel,Scoreboard,EndScreen,uiKit}.js`, `src/entities/moba/{looks,ChampionView,UnitView}.js` |
| **coordinator** | this file, `shared/moba/*`, `src/main.js` (registers TeamCustomScene), docs |

- **server-dev:** §3.1 custom rooms + `/api/team/rooms`; §3.2 StateView visibility + bush rules + fx/atk filtering + target
  validation + bots respecting vision (and using bushes to ambush/escape if cheap); §3.3 server auto-aim; §3.4 server
  optimisation with before/after numbers (team_ff tick avg/p99 + bytes per client from the encoder per view).
  Verify: team_ff 20 (0 exceptions/stuck), team_sim --exploits (+ new: hidden enemy targeted by order/target skill/ignite →
  rejected; hidden enemy absent from an enemy client's state; side switch rules; non-host startNow rejected; 6th human
  on a side rejected), exploits.mjs 9/9. Debug server **:2650** only.
- **client-world:** bushes on the map (leafy office plants, semi-transparent canopy; own/ally units inside drawn
  translucent + "🌿 hidden" hint on yourself; enemies vanish/appear cleanly when the server removes/re-adds them — no
  ghost views, fade in/out), minimap bushes; §3.3 client auto-aim + preview; §3.4 client optimisation (measure FPS
  before/after; auto-quality); OfflineSim: bushes + visibility for bots roughly. Own server **:2660** for online tests.
- **client-ui:** TeamLobbyScene gets **QUICK MATCH** (v3 flow) + **CUSTOM ROOMS** → `TeamCustomScene`: rooms list
  (refresh, join, join by code = roomId), CREATE ROOM (room name), room screen in phase `room`: two columns of 5 seats
  (humans by name, empty = "🤖 bot"), "Join Blue / Join Red" buttons, host badge, host-only **START** ("bots fill N empty
  seats"), LEAVE; on phase `select` → `TeamSelectScene({ room, ... })` (existing flow). ChampionView: render the
  `inBush` tint for own team (translucent) — the world agent sets the flag via the view API you expose (`setHidden(bool)`).
  Own server **:2670**.

## 5. Ports
`:2567` coordinator's normal server — don't kill/restart. Agents: 2650 / 2660 / 2670. Never BUG_SMASH_DEBUG on :2567.
Ignore the stale :2600. Don't commit.

### 3.5 Contract additions (coordinator, after the server build)
- **§3.2b** `TeamState.scores` (END): MapSchema<TeamScore> keyed like `champions`, NEVER view-filtered —
  `team, champ, name, isBot, level, kills, deaths, assists, cs, items[6], dead, respawnAt, spellD, spellF` (4 Hz while
  playing). Scoreboard / end screen read it (hidden enemies are absent from `champions`). At `ended` every entity is
  re-added to every view.
- Accepted: `TeamChamp.x/y` + `TeamUnit.x/y` are `uint16` (map is 6000 px; same names/order); lane-minion positions sync
  at 10 Hz (knocks/deaths/jumps > 40 px immediate). Clients must ignore `fx`/`atk` naming an id they don't have yet.

### 3.6 Auto-aim adjustment (player request, 2026-11-08)
- **Mouse not moving** (no real cursor motion > 3 px for `MOUSE_IDLE_MS` = 1000 ms) also triggers auto-aim — in addition to
  cursor-on-yourself / outside the canvas / touch. Abilities then target the nearest enemy champion (else unit, else direction).
- **Abilities that move the caster along a direction** — blinks (incl. Flash) and every dash that isn't `toTarget` — never
  auto-aim at an enemy: they go in the **direction of travel** (stick / last move / facing). Shared policy:
  `autoAimsAtEnemy(spec)` in champions.js (server + client).

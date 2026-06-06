# Multiplayer Modes — Personal + Team — Task Breakdown

Source proposal: [../ideas/MULTIPLAYER_MODE.md](../ideas/MULTIPLAYER_MODE.md)

**Status (2026-05-30):** Phase A + B landed. **Personal Mode round structure removed** — now a persistent infinite world per the proposal (no 90s timer, no results screen, no auto-reset). Team Mode phases (C, D) queued and will use a separate room class with real rounds + stages.

This doc is temporary — once both modes ship, fold the surviving content into [`TASK_STATUS.md`](./TASK_STATUS.md) and the relevant `../design/` docs (rules → `02_CORE_MECHANICS`, mode flow → `04_MULTIPLAYER`, content → `08_CONTENT`, numbers → `09_BALANCE`), then delete this file.

---

## Decisions resolved

Confirmed answers to the 7 ambiguities raised in the feasibility review:

| # | Question | Decision |
|---|---|---|
| 1 | "Health" vs "Energy" naming? | **C — keep `energy` in code**, just add pickup/zone recovery sources. No two-bar split. |
| 2 | How many bugs drop when a player is defeated (Personal Mode)? | **2–3, scaled by attacker's level** (a Super Senior drop is messier than an Intern drop). |
| 3 | Recovery zones — where + how many? | **Team Mode only.** Fixed positions in corners. Small zones (~80 px radius) so they're contestable. **Not present in Personal Mode** (would encourage camping in chaotic FFA). |
| 4 | Team count? | **Flexible up to 5 teams.** Default 2 in the lobby; the host can split into 3/4/5. |
| 5 | Stage difficulty curve? | **Harder per stage.** Not all bug kinds in stage 1 — variety + tougher kinds unlock as stages progress. Personal Mode = 1 infinite stage with all bug kinds. |
| 6 | MVP weighting? | **Score is primary**, ties broken by **eliminations**. |
| 7 | Personal-mode bug spawning when bug-drop is active? | **Lower passive spawn rate** so the arena doesn't overcrowd. |

---

## Phase A — Personal Mode polish (1 session)

Convert the current FFA arena into the proposal's "Personal Mode" with minimal new infrastructure.

### Server ([server/rooms/ArenaRoom.js](../../../server/rooms/ArenaRoom.js))

- [x] On `_enterBroken`, spawn **N bugs at the broken player's position** via `_spawnBugAt`
  - N = `1 + floor(wasLevel / 2)` → Lv1 drops 1 bug, Lv6 drops 4
  - Bugs spawn in a small ring around the defeated player (28–68 px radius)
  - Clamped to arena bounds so corner deaths don't spawn outside the map
  - Only fires when `friendlyFire === true` (Personal Mode); Team Mode disables it automatically
- [x] **Adaptive passive spawn cadence**: `450 ms` default, `650 ms` when `players.size > 4` so drops + passive spawns don't overcrowd
- [x] **`friendlyFire` flag** on `ArenaState`, default `true` for Personal Mode. Team Mode (future) sets to `false`.
- [ ] PvP smash handler: reject if `targetSid` is on the same team (deferred to Phase C when team field lands)

### Client ([src/scenes/MultiPlayScene.js](../../../src/scenes/MultiPlayScene.js))

- [x] **Display-name input on the menu** — click "name: …" line below the multiplayer link
- [x] Save chosen name to `localStorage` via `SaveManager.setPlayerName(name)`
- [x] On scene init: prefer explicit `data.name`, fall back to saved, fall back to auto-generated `Guest-####` (persisted on first generation so it survives reloads)
- [x] On `joinOrCreate('arena', { name })`, pass the resolved name
- [ ] Visual: green particle burst on broken (telegraphing the bug drop) — deferred, the existing yellow spark burst is sufficient for v0

### SaveManager ([src/core/SaveManager.js](../../../src/core/SaveManager.js))

- [x] `getPlayerName()` / `setPlayerName(name)` (trim + max 16 chars)

### Test pass

1. Solo session — set name "TestDev" via menu → reload page → confirm "name: TestDev" still shown ⏳ pending
2. Open MP without setting a name → confirm "Guest-####" displayed → reload → confirm same Guest-#### sticks ⏳ pending
3. Two tabs — smash one until broken → confirm 1+ bugs spawn at their position ⏳ pending
4. Reach Lv5–6 then break → confirm 3–4 bugs drop (vs 1 from Lv1 break) ⏳ pending
5. Confirm passive spawn rate visibly drops when player count > 4 (need 5+ tabs to test) ⏳ pending
6. Friendly-fire flag visible in `state.friendlyFire`, default `true` for Personal Mode ✅ implemented

### Exit criteria

A returning player keeps their name. Defeats in Personal Mode visibly seed new bugs. The arena feels denser around recent broken events than around quiet zones.

---

## Phase B — Personal Mode health pickups (half session) ✅ LANDED 2026-05-30

The only Personal-Mode recovery source. Adds a positive map objective (grab the plus) without inviting camping.

### Server ([server/rooms/ArenaRoom.js](../../../server/rooms/ArenaRoom.js))

- [x] `HealthPickup { x, y, alive }` schema + `pickups: MapSchema` on `ArenaState`
- [x] Constants: `PICKUP_TARGET_COUNT=5`, `PICKUP_RESPAWN_MS=5000`, `PICKUP_ENERGY_GAIN=40`, `PICKUP_RADIUS=26`, `PLAYER_PICKUP_RADIUS=28`
- [x] Maintain pool of 5 alive — spawn one every 5 s when below target
- [x] Per-tick player loop calls `_tryCollectPickups(p)`; broken players skip
- [x] On overlap (combined radius 54 px): `+40 energy`, mark `alive = false`, schedule schema removal 300 ms later
- [x] `_enterPlaying` round reset clears all pickups + resets spawn timer

### Client ([src/scenes/MultiPlayScene.js](../../../src/scenes/MultiPlayScene.js))

- [x] Preload `assets/icons/health_pickup.svg` as `health-pickup` texture
- [x] `remotePickups` Map + `onAdd` / `onRemove` schema subscriptions
- [x] Render pickup: 40×40 sprite at depth 7 with **bob** (±6 px, 700 ms) and **scale pulse** (1.08×, 500 ms)
- [x] On `alive = false`: green expanding ring (50 px / 320 ms), sprite lifts and fades, `AudioManager.skillPickup('buff')` plays
- [x] Minimap: green dots at slightly larger radius (2.2 px) than bug dots so they stand out

### New assets

- [x] `assets/icons/health_pickup.svg` — green plus on white circle with cyan accent ring + outer glow

### Test pass

1. Walk through a green plus → energy bar jumps by 40 (capped at max) ⏳ pending
2. Get broken → walk through pickup → confirm no effect during broken state ⏳ pending
3. Confirm at least 4 pickups always alive on the map (one respawns ~5s after collection) ⏳ pending
4. Round end → confirm all pickups cleared and pool re-fills in new round ⏳ pending
5. Check minimap green dots match pickup positions in world ⏳ pending

### Why no recovery zones here

Personal Mode is chaotic FFA on an infinite single stage. Fixed safe-zones would invite camping — players would park inside and farm passing bugs at low risk. Pickups force mobility (you have to walk *to* the recovery). Recovery zones live in Team Mode where they become a contested team objective.

---

## Phase C — Team Mode foundation (2 sessions)

The bigger lift. Room codes, team selection, friendly-fire OFF, single-stage v0 (multi-stage comes in Phase D).

### Server (new file: `server/rooms/TeamRoom.js`)

- [ ] Separate room class `TeamRoom` registered alongside `ArenaRoom`
- [ ] **Room code** generation: 6-char alphanumeric (Colyseus' default room ID works, but we expose a short code in state)
- [ ] **Lobby phase** before match starts (no bugs spawn, players can select team)
- [ ] **Team selection**: schema `TeamState { name, color, score, memberSids: ArraySchema<string> }`; up to **5 teams** per room
- [ ] **Host role**: first player to join is the `hostSid`; only host can call `setTeam(sid, teamIdx)` for others and `startMatch`
- [ ] **Friendly-fire**: set `friendlyFire = false` for TeamRoom; smash handler rejects same-team targets
- [ ] **Recovery zones** (Team Mode exclusive): 2 fixed zones in opposite corners of the map, radius ~80 px each, exposed in schema as `RecoveryZone { x, y, radius }`
  - Every tick: if a non-broken player overlaps a zone, regen `+25 energy/sec` (on top of passive 12/sec)
  - Zones are **neutral** (any team can use any zone) → encourages contested positioning rather than safe bases
  - Broken players get no zone benefit (same rule as pickups)
- [ ] **Match state machine**: `lobby → playing → results` (Phase D will split playing into stages)
- [ ] At match end: compute MVP — **highest score, ties → eliminations**

### Client (`src/scenes/TeamLobbyScene.js` + extensions to MultiPlayScene)

- [ ] New scene: **lobby UI**
  - "Create Room" / "Join Room" buttons
  - On Create: server returns 6-char code, displayed prominently
  - On Join: input field for code
- [ ] Team list (1–5 teams), each with member chips
- [ ] Host has +/- buttons to add/remove teams
- [ ] All players can click a team to join it
- [ ] Host has a big **Start Match** button (disabled if any team is empty)
- [ ] On match start, transition to MultiPlayScene (or a TeamPlayScene variant) with team-aware coloring
- [ ] Render **recovery zones**: faint pulsing **cyan disc** on the floor (`Graphics` ring + fill), visible on minimap as cyan circles

### Test pass

1. Two tabs — first creates room, sees code; second joins via code
2. Both can select teams; host can split into 3-team or 4-team
3. Friendly-fire test: teammates smash each other → no damage applied
4. Host clicks Start → both transition to gameplay
5. Stand inside a corner recovery zone → confirm energy regen at +25/sec
6. Match ends → MVP screen shows winner

---

## Phase D — Team Mode polish (1–2 sessions)

Multi-stage match + progressive respawn + end-of-match awards.

### Server

- [ ] **Stage state machine** inside `playing` phase: `stage1 → stage2 → … → stage5 → results`
- [ ] Per-stage bug pool defined in a server constant:
  ```
  STAGE_BUGS = [
    { count: 12, kinds: ['bug-null', 'bug-ladybug'] },
    { count: 16, kinds: ['bug-null', 'bug-ladybug', 'bug-beetle'] },
    { count: 20, kinds: ['bug-null', 'bug-ladybug', 'bug-beetle', 'bug-race'] },
    { count: 24, kinds: ['bug-beetle', 'bug-race', 'bug-toxic', 'bug-scarab'] },
    { count: 30, kinds: ['bug-beetle', 'bug-race', 'bug-toxic', 'bug-scarab', 'bug-robot'] },
  ]
  ```
- [ ] When all bugs in current stage are dead → advance to next stage (server bumps `state.stage`)
- [ ] After stage 5 cleared → enter `results` phase
- [ ] **Progressive respawn timer per stage**: `[3000, 5000, 8000, 12000, 15000]` ms (override default `BROKEN_DURATION_MS` for TeamRoom)
- [ ] **No bug-drop on defeat** in Team Mode (the Personal-mode mechanic is bypassed when `friendlyFire === false`)
- [ ] Track per-player stats over the match: bugs smashed, players eliminated, damage dealt; expose in `results` phase

### Client

- [ ] HUD shows current stage `Stage 3 / 5` next to round timer
- [ ] Bug counter per team per stage: `Team Blue: 14 / 16`
- [ ] End-of-match screen: winning team banner + MVP avatar + individual awards (Most Bugs, Most Eliminations, Most Damage, Best Defender, Bug Hunter)
- [ ] Broken countdown badge already supports per-instance duration — confirm it reads from server's `brokenUntil` correctly when duration varies

### Test pass

1. 4-player match (2v2) — stage 1 clears, stage 2 starts automatically with more bug kinds
2. Defeat in stage 4 → respawn takes 12 s (vs 3 s in stage 1)
3. Match end after stage 5 → MVP screen with awards
4. Confirm friendly-fire still off; PvP only damages enemy team members

---

## Phase E — Persistent backend (deferred until soft launch)

Skipped intentionally for v0–v2 builds. Reasons:
- No real users → no real leaderboard to populate
- Infrastructure cost (server-side DB) without gameplay return
- Localhost-only deployments don't benefit

Revisit when:
- We deploy MP server to Render/Fly
- We have ≥5 active testers
- Personal Mode is feature-complete

Backend stack candidate: **Supabase free tier** (Postgres + simple REST API) or **SQLite** embedded in Node server.

Endpoints (when ready):
- `POST /api/score` — submit personal session stats
- `GET /api/leaderboard?period=daily|weekly|all` — top N players
- `GET /api/profile/:id` — total smashes, eliminations, peak combo, longest survival

---

## Open questions still to resolve

| # | Question | When to decide |
|---|---|---|
| 1 | Should Personal Mode and Team Mode share the **same world arena** or have distinct maps? | Phase C start |
| 2 | Should the host be able to **kick a player** from the room? | Phase C start |
| 3 | What happens when the **host disconnects** mid-match? Promote next player? End match? | Phase C |
| 4 | Should **bug-drop** also apply when a player leaves the room mid-life? | Phase A end |
| 5 | Can a host **change settings mid-lobby** (team count, friendly-fire override)? | Phase C |
| 6 | Should **stage 1 of Team Mode** have a brief practice countdown so teams can position before bugs spawn? | Phase D |
| 7 | Should **MVP screen** show all players' stats (transparency) or just winner highlights? | Phase D |

---

## Rollback notes per phase

| Phase | If it hurts gameplay | Rollback action |
|---|---|---|
| A — Bug drop | Arena too crowded | Lower `1 + floor(level/2)` to a flat `1 bug per defeat` or disable entirely (`droppedBugs = 0`) |
| A — Name persistence | localStorage cluttered | No rollback needed — just stop calling `getPlayerName()` |
| B — Health pickups | Too easy to recover | Reduce `+40` per pickup to `+20`, or lower spawn cap to 2 |
| C — Recovery zones (Team Mode) | Teams camp inside | Lower regen from `+25/sec` to `+15/sec`, or add a per-zone duration cap, or make zones decay temporarily after long occupation |
| C — Friendly fire OFF | Boring in 5v5 | Allow host toggle in lobby |
| C — Up to 5 teams | Confusing on minimap | Cap at 4 teams, use distinct shapes per team on minimap |
| D — Progressive respawn | Late-game feels unrecoverable | Cap at `min(stage × 2 + 1, 10)` seconds |
| D — Stage difficulty | Stage 5 is impossible | Lower bug counts proportionally, or extend stage timer |

---

## Implementation order recommendation

```
Phase A  ──▶  Phase B  ──▶  [PLAYTEST: 2-3 humans for 30 min]  ──▶  Decide
                                                                      │
                                            ┌─────────────────────────┴─────────────┐
                                            ▼                                       ▼
                                  feels good → Phase C → D            feels weak → cut to Phase E only,
                                                                      iterate on A+B instead
```

We don't commit to Team Mode (C+D) until Personal Mode (A+B) passes a real multi-human playtest. If A+B feels great, the appetite for C+D is obvious. If it feels weak, Team Mode won't fix the underlying issue.

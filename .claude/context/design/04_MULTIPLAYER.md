# 04 · Multiplayer

How the arena works as a shared world.

---

## Architecture

```
       Client (Phaser 3)                             Server (Node.js + Colyseus)
       ─────────────────                             ──────────────────────────
   ┌─────────────────────┐                          ┌─────────────────────────┐
   │  MultiPlayScene     │  ◄── 20 Hz state ─────   │  ArenaRoom              │
   │  · render world     │      (schema diffs)      │  · simulation tick 20Hz │
   │  · interpolate bugs │                          │  · canonical bug AI     │
   │  · interpolate peers│  ─── input msgs ────►    │  · canonical scores     │
   │  · send move @20Hz  │      move/action/smash   │  · authoritative damage │
   │  · send action      │                          │  · round phase machine  │
   │  · send smash       │                          │                         │
   └─────────────────────┘                          └─────────────────────────┘
```

- **Server is the single source of truth.** Clients send intent, server validates + applies, broadcasts via schema diffs.
- **No client prediction for combat** (latency tolerance via range buffer instead; see §Latency).
- **Local-player movement IS predicted** — sprite moves immediately, server position lags ~50 ms.

## Room lifecycle

### Personal Mode (`ArenaRoom`) — current

```
┌──────────────────────────────────────────────────┐
│                                                  │
│              PERSISTENT WORLD (∞)                │
│                                                  │
│   ┌──────────────────────────────────────┐       │
│   │  bugs spawn + flee continuously      │       │
│   │  pickups maintained at pool of 5     │       │
│   │  players join, smash, level up,      │       │
│   │  break, drop bugs, rejoin the loop   │       │
│   └──────────────────────────────────────┘       │
│                                                  │
│   No round timer. No results screen. No reset.   │
│   `state.phase` stays at 'playing' forever.      │
│   `state.timeLeftMs` is the sentinel `-1`.       │
└──────────────────────────────────────────────────┘
```

- **Single shared room** named `arena` for all players (no room codes yet).
- Up to **32 players** per room.
- World runs forever — players come and go, scores accumulate per session.

### Team Mode (`TeamRoom`, future) — Phase C+D

Will use a separate room class with: lobby → playing (5 stages) → results loop. See [../tasks/MP_MODES_BREAKDOWN.md](../tasks/MP_MODES_BREAKDOWN.md).

## Player join / leave

- **Join** anytime — server spawns the player at the world center (±80 px jitter) at Lv1 with full energy.
- **Leave** anytime — server removes from state, client cleans up sprite. Score is lost (no persistence in v0; Phase E adds global leaderboard).
- **Display name** is persisted in localStorage (`SaveManager.getPlayerName`) — auto-generated `Guest-####` for first-time visitors, edited via the menu prompt.
- 🔵 **No reconnection grace.** A disconnect = lose progress immediately. (Could be improved later.)

## Bug pool

- **Server-authoritative**: only the server spawns + moves bugs.
- Up to **160 alive** at once; spawn cadence **450 ms** when ≤4 players in room, **650 ms** when >4 players (drops on defeat already populate the field).
- Each bug has a server-side AI bookkeeping object (`vx`, `vy`, `heading`, `spawnedAt`) plus the synced schema fields (`x`, `y`, `kind`, `hp`, `alive`, `hidden`).
- Bugs **age out** at 26 s if not killed.
- **Bug drop on defeat** (Personal Mode only): a broken player releases `1 + floor(level / 2)` extra bugs in a ring around their position. Lv1 drops 1; Lv6 drops 4. Disabled when `friendlyFire === false` (i.e. Team Mode).

## Health pickups

- **Server-authoritative**: pool of **5 alive** maintained continuously; one new pickup spawns every 5 s when below target.
- Schema: `pickups: MapSchema<HealthPickup { x, y, alive }>`.
- On non-broken player overlap (combined radius 54 px): grants `+40 energy` (capped at `maxEnergy`), pickup is consumed.
- Broken players **cannot collect** (proposal §Recovery Restrictions).
- Personal Mode only — Team Mode replaces them with recovery zones.

## Latency model

- **Round-trip ~100 ms** on LAN; will be 50–250 ms when deployed.
- **Smash range buffer**: server reach is 96 px (vs visual hit zone of ~56). This means a fast-fleeing bug that's "just at the edge" client-side will still register server-side even after the bug's moved ~30 px during the network round-trip.
- **Position throttle**: client sends `move` every 50 ms (20 Hz). Server uses the most recent position for smash validation.

## State channels

| Channel | Frequency | Direction | Purpose |
|---|---|---|---|
| `move` | 20 Hz | C→S | Player position |
| `action` | event | C→S | Animation broadcast (smash/punch/kick/parry/jump) |
| `smash` | event | C→S | Damage intent with target `id` (bug), `targetSid` (player) or `boss` |
| `castSkill` | event | C→S | `{ slot: q/w/e/r, dirX, dirY }` |
| `setName` / `setHat` | rare | C→S | Display name / cosmetic hat id (server allowlist) |
| `hello` | once | C→S | Ready for messages → server replies `welcome` + `chatHistory` |
| `chat` | event | both | `{ sid, name, text, kind? }` — kind `pm` (the PM), `bot` (AI coworker) |
| `welcome` | once | S→C | `{ serverNow, events }` — clock offset + event titles/colors |
| `feed` | event | S→C | Kill-feed line `{ text, color, a?, b? }` (a/b = involved sids) |
| `announce` | event | S→C | Banner `{ kind: event/eventEnd/banner, title, sub, color, big, id, pm }` |
| `kill` / `ko` / `pickup` | event | S→C (you) | Your bug kill `{ gain, kind, combo }` / your PvP KO / your pickup |
| `reward` | event | S→C (you) | `{ kind: boss/golden/bounty, xp, share? }` |
| `brokenBy` / `crowned` | event | S→C (you) | Who broke your laptop / you became Tech Lead `{ bounty }` |
| `bossSlam` / `bossSlamHit` | event | S→C | Slam telegraph `{ x, y, r, ms }` / impact `{ x, y, r }` |
| `debug` | dev only | C→S | `{ cmd: 'event', id }` / `{ cmd: 'endEvent' }` — handler only registered when the server runs with `BUG_SMASH_DEBUG=1` |

**Server-side input validation (2026-11-07):** `move` steps are capped at 384 px/s + 60 px slack and ignored for 200–300 ms after a server teleport (dash / roll / knockback); `smash` ≥ 140 ms apart with a whitelisted `kind`; `castSkill` ≥ 250 ms apart per slot; aim vectors must be finite; `hello` / `getChatHistory` answered once per client; `onUncaughtException` keeps one bad message from taking the room down. Regression test: `tools/playtest/exploits.mjs`.
| schema diff | 12.5 Hz | S→C | All canonical state via Colyseus (incl. `event`, `eventLeftMs`, `crownSid`, `bounty`, `bosses`) |

## AI coworkers + world events (2026-11-06)

- **Bots** are Player entries with `isBot = true`, driven by [BotDirector](../../../server/game/BotDirector.js) through the same `_do*` handlers as humans — no rule bypass. They fill the room to ~9 total and leave as humans arrive. They don't count as Colyseus clients, so an all-bot room still auto-disposes when the last human leaves.
- **World events** run from [EventDirector](../../../server/game/EventDirector.js); the room and bots read the active modifiers via `events.mod(key, default)`. Numbers: [09_BALANCE § Office Chaos](./09_BALANCE.md#office-chaos-2026-11-06--bots-events-boss-drama).
- **`GET /api/stats`** → `{ online, bots, rooms }` for the menu's live badge (CORS-open).

## Player count & scaling

| Players | Status | What changes |
|---|---|---|
| **1–8** | ✅ Stable | Sparse arena, easy progression |
| **8–16** | ✅ Stable | Sweet spot — visible competition, room to maneuver |
| **16–32** | 🟡 Untested | World big enough; client perf untested |
| **32+** | 🚫 Capped | Would need spatial culling (area-of-interest) |

🔵 **Design intent:** rooms cluster around 8–12 average players for the right density. If empty rooms are common, add AI bots (see [10_ROADMAP.md](./10_ROADMAP.md)).

## Modes (current vs planned)

| Mode | Status | Description |
|---|---|---|
| **Personal Mode** (FFA) | ✅ | Persistent infinite world. Single map. Bug drop on defeat. Health pickups. Score persists per-session. |
| Team Mode (room-based) | 🔵 | Room codes, team selection (up to 5 teams), friendly-fire OFF, recovery zones, multi-stage match, progressive respawn, MVP screen |
| Boss Arena | 🔵 | Multi-phase boss bug at the end of a Team Mode match |

## Cheat resistance (v0 baseline)

- Server validates **range** on every smash → can't smash from across map
- Server validates **energy** → can't spam attacks without paying cost
- Server gates **broken state** → can't move/attack while broken
- 🚫 No anti-bot protection
- 🚫 No name spoofing protection (anyone can claim any name; collisions allowed)
- 🔵 Add lightweight rate limiting on `smash` (max 8/sec) if exploits surface

## Hosting (current → future)

| Phase | Where | Reach | Cost |
|---|---|---|---|
| **Now** | Local PC (`node index.js`) | LAN / ngrok | $0 |
| Phase 4 | Render free tier | Anywhere | $0 |
| Phase 4+ | Render Starter ($7/mo) | No sleep | $7/mo |
| Scale | Fly.io / dedicated VPS | Multi-region | $20–50/mo |

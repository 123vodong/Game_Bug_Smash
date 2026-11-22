# Pass 2 — Ranked, fair play, rejoin, shop & camera (2026-11-21)

Branch `feat/ranked-pass` (from main @ c1b7e1e). Player requests (verbatim intent):

1. One machine must not play from 2 tabs (cheating).
2. MOBA-style ranking — quick play AND custom rooms.
3. Sell items in the shop.
4. Move the camera with the minimap / mouse (LoL style).
5. Quick play should wait longer for other players.
6. More champions and items.
7. Come back to a match after a disconnect, even a while later.

## Status board

| ID | Task | Area | Status |
|----|------|------|--------|
| RP-01 | Player identity: secret `pid` in localStorage (client) → public id = sha256 (server) | shared/client/server | ✅ |
| RP-02 | Presence registry: one live session per player id (arena + team), "play here" takeover | server | ✅ |
| RP-03 | Duplicate-tab UI: "already playing in another tab" + PLAY HERE (Personal + Team) | client | ✅ |
| RP-04 | Team rejoin: seat held for the whole match (manual reconnection), abandon after 5 min with no human | server | ✅ |
| RP-05 | Rejoin UI: saved reconnection token, REJOIN banner on the menu / Team hub, IN_MATCH join error → rejoin | client | ✅ |
| RP-06 | Quick-play queue: 30 s wait, +join extension (max 45 s), START NOW = all humans ready | shared/server/client | ✅ |
| RP-07 | Sell items: `sell {slot}` 70 % refund (100 % undo within 10 s), shop SELL button + right-click | shared/server/client | ✅ |
| RP-08 | LoL camera: Y lock/unlock, edge pan, minimap drag view, right-click minimap = move, Z hold = center, middle-drag | client | ✅ |
| RP-09 | +8 items (2 boots, 5 core, 1 basic) + shop grid fits 25 items | shared/client | ✅ |
| RP-10 | +4 champions (jungle, bot, support, mid) — data, bots, art (hat/outfit/prop), select + lobby grids fit 16 | shared/server/client | ✅ |
| RP-11 | Ranking server: store (JSON file, `BUG_SMASH_DATA_DIR`), Elo with bots at 1000, results at match end, leavers count | server | ✅ |
| RP-12 | Ranking API: `/api/rank/top`, `POST /api/rank/me`, `rank` message at match end, seat `rank` label in schema | server | ✅ |
| RP-13 | Ranking UI: rank badge in lobby/select/scoreboard/end screen, LP delta + promotion, LEADERBOARD panel, Career panel | client | ✅ |
| RP-14 | Harness: exploits for sell / dup-tab / rejoin / rank; team_ff with the new champions | tools | ✅ |
| RP-15 | Docs: design note + balance table, TASK_STATUS | docs | ✅ |

## Verification (2026-11-21)

| Check | Result |
|---|---|
| `tools/playtest/pass2_check.mjs` (live debug server) — tabs, takeover, IN_MATCH, rejoin after drop, sell, queue, ready, ranked win, abandon loss, HTTP validation | 36/36 (incl. Intern IV start, floor, stars, MVP / SVP bonus) |
| `tools/playtest/pass2_ui.mjs` (headless browser) — hub, RANKS, select grid, shop SELL/UNDO, camera Y / edge / minimap / re-lock, 2nd tab card, REJOIN banner → prompt → same match, rank on the end screen | 15/15, 0 page errors |
| `team_sim.mjs --exploits` (updated: READY check, seat held past 60 s + late rejoin) | 118/118 |
| `exploits.mjs` (Personal Mode) | 25/25 |
| `team_ff.mjs 12` — 16 champions, queue self-test | 0 exceptions · 0 stuck · 0 in walls |
| `custom_rooms.mjs` — rank badges in the room + scoreboard | ✅ |
| `nav_check.mjs` | ✅ |

Open / notes: ranks live in `server/.data/ranks.json` — on Render (no persistent disk) they reset on each deploy;
another browser / private window counts as another player (no accounts); new-champion balance is a 12-match
read (small sample) — watch live win rates; matchmaking does not use rank yet (few players online).

## Decisions

- **Identity.** No accounts. The browser keeps a random secret `pid` (32 hex) in
  localStorage; the server only ever stores / shows `sha256(pid)[0..16]`. Same browser
  profile = same player (tabs share it). Another browser or a private window is another
  player — that limit is accepted (blocking by IP would block whole offices behind one NAT).
- **Two tabs.** Server-authoritative: a second live session for the same player id is
  refused (`DUP_TAB`). The new tab can press PLAY HERE → `POST /api/session/takeover` closes
  the old one (close code 4010, its tab shows "opened in another tab") and joins / rejoins.
  Team Mode: a player who still owns a seat in a running match can't queue for another one
  (`IN_MATCH`) — they get REJOIN instead.
- **Rejoin.** The seat is held for the rest of the match (Colyseus manual reconnection) while
  a bot plays it. The reconnection token is saved in localStorage, so a reload / closed tab /
  restarted browser can come back (menu banner). No human connected for 5 min → the match is
  abandoned (ends; the side ahead wins; abandoners lose).
- **Ranking.** (Revised after review: "start from Intern even in the first 5 matches".) Two numbers:
  a hidden MMR (starts 1000, Elo on team averages, bots 1000, K 48 for 5 placement games then 24) and
  the VISIBLE rank points (start at Intern IV 0 LP = 700, never lower). Each match moves the visible
  rank by the MMR change × a catch-up factor (below your MMR wins count up to 3×, losses down to ¼×), so
  everyone has a rank from match 1 and reaches their real level in ~15 matches. Shown as STARS
  (Wild Rift / Arena of Valor style): 5 ★ per division (1 ★ = 20 LP), fill the 5th ★ = promotion.
  Performance bonus: team MVP on a win +1 ★, best on a losing team loses half (visible rank only,
  players still connected at the end, capped 2 divisions above MMR). 7 tiers: Intern,
  Junior, Mid-level, Senior, Staff, Principal (IV–I, 50 points per division = 100 LP) and CTO. Every human who
  played (was connected at some point while `playing`) gets the team result, leavers included.
  Leaving in champion select and never coming back = no result (dodge). Practice = unranked.
- **Storage.** `server/data/ranks.json` by default, `BUG_SMASH_DATA_DIR` to move it. Render's
  free disk is wiped on every deploy / restart → ranks reset there unless a persistent disk
  (or DB) is attached.

## Contract (client ↔ server)

Join options (arena `joinOrCreate`, team `joinOrCreate` / `create` / `joinById`): `+ pid` (32 hex).
Join errors (thrown in onAuth, message prefix): `DUP_TAB`, `IN_MATCH:<roomId>`.
Close code 4010 = "taken over by another tab" (no reconnect).

Team messages:
- `sell {slot}` → server refunds `sellValue(item, boughtAt)`; same place rules as `buy`.
- `ready` (lobby) → toggles the sender's ready flag; START NOW when everyone is ready (solo = now).
- server → client `rank {before, after, delta, games, placed, promoted, demoted}` at match end (each human seat).

Schema (appended): `TeamChamp.rank` (label, e.g. "Senior II"), `TeamChamp.ready` (lobby),
`TeamScore.rank`.

HTTP: `GET /api/rank/top` → `[{name, rating, tier, div, lp, wins, losses}]` (≤ 50);
`POST /api/rank/me {pid}` → profile + `place`; `POST /api/session/takeover {pid}`;
`GET /api/team/match/:roomId` → `{live, phase}`.

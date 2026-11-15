# Run & Deploy

Quick commands to start the game locally and to ship it.

---

## Local development

```powershell
# One terminal is enough — the server also serves the client
cd server
node index.js
# → game:    http://localhost:2567
# → ws:      ws://localhost:2567   (monitor at http://localhost:2567/colyseus)
# → stats:   http://localhost:2567/api/stats
```

Open http://localhost:2567 — main menu → **PLAY** (SP campaign), **MULTIPLAYER · PERSONAL**
(arena with AI coworkers, world events, the Deadline boss) or **TEAM 5v5** ("Office Siege" MOBA).

Deep links: `?scene=lobby` (Team Mode champion select) · `?scene=team&champ=tester` (straight into a
match; champs: pixel, stack, ops, tester, zero, model) · add `&offline=1` for the no-server mock.
Team Mode playtests: `node tools/playtest/team_sim.mjs` (headless human) ·
`node tools/playtest/team_sim.mjs --exploits` (18 checks) · in-process fast-forward:
`node tools/playtest/team_ff.mjs 10 45 --seed=1 --quiet` (whole bots-only matches in seconds — use it
to check balance/match length after any rules.js change; ≥ 20 matches before trusting a side split). The old two-terminal flow
(`python -m http.server 8000` + the server) still works for LAN testing on phones.

### Playtest harness

```powershell
cd server; $env:BUG_SMASH_DEBUG=1; node index.js   # dev server WITH the opt-in debug hooks
cd tools/playtest; npm install                     # once
node sim.mjs 60                                    # headless player: bots, events, feed log
node sim.mjs 90 golden_bug@5 deadline_boss@30      # force world events (needs BUG_SMASH_DEBUG=1)
node exploits.mjs                                  # malicious-message regression test (9 checks)
node shot.mjs out/arena 6000 "play:15000" "shot:b" # real browser screenshots + console errors
```
Never set `BUG_SMASH_DEBUG` on a public or LAN-shared server — it lets any client force events.
See [AGENT_TEAM.md](./AGENT_TEAM.md) for how the agent team uses it.

### Stopping background processes

If the server / client were started in the background via PowerShell:

```powershell
Stop-Process -Id <PID>
```

---

## Single-player zip distribution

Builds a ~7.3 MB zip with `index.html` + `README.txt` + `src/` + `assets/`. Recipient instructions are inside [../../../README.txt](../../../README.txt).

```powershell
Compress-Archive -Path index.html, README.txt, src, assets -DestinationPath BugSmashHunter.zip -Force
```

---

## Multiplayer hosting (planned)

Currently runs only on the developer's PC. Phase 4 of the roadmap (see [../design/10_ROADMAP.md](../design/10_ROADMAP.md) + [../plan/3D_MP_PHASES.md](../plan/3D_MP_PHASES.md)) deploys the Colyseus server to **Render free tier** (`https://*.onrender.com`), then the client's `SERVER_URL` constant in [src/scenes/MultiPlayScene.js](../../../src/scenes/MultiPlayScene.js) flips from `ws://localhost:2567` to the deployed `wss://…`.

---

## Useful URLs while developing

| URL | Purpose |
|---|---|
| http://localhost:8000 | Game (client) |
| http://localhost:8000/?multiplayer | (planned) deep-link straight into MP scene |
| http://localhost:2567 | MP server landing page |
| http://localhost:2567/colyseus | Colyseus monitor — active rooms + clients |

# Run & Deploy

Quick commands to start the game locally and to ship it.

---

## Local development

```powershell
# Terminal 1: MP server (Colyseus)
cd server
node index.js
# → ws://localhost:2567   (monitor at http://localhost:2567/colyseus)

# Terminal 2: static client server (anywhere with python)
python -m http.server 8000
```

Open http://localhost:8000 — main menu → either play SP, or click the green **"multiplayer (alpha) ▶"** link at the bottom-right.

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

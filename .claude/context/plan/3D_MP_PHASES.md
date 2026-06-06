# BUG SMASH — Multiplayer Pivot (TankGank Approach)

**Decision date**: 2026-05-26
**Approach**: top-down 2D with **pre-rendered 3D sprites** + online multiplayer
**Engine**: Phaser 3 (keep current 2D engine)
**Multiplayer**: Colyseus (Node.js authoritative server)
**Targets**: Web (primary) → Capacitor mobile → Electron desktop
**Estimated total**: ~6-8 weeks single engineer to public MP demo

## Why this approach

TankGank, generals.io, agar.io and most successful `.io` games use this exact recipe:
- Top-down 2D canvas — no 3D math, no physics engine
- Sprites rendered once in 3D software, then drawn as flat PNGs
- Server authoritative + client prediction for ~20-50 player rooms
- 2 MB total payload, loads in 2 seconds, runs on cheap phones

The visual ceiling is high (see TankGank) and the engineering cost is **1/5 of full 3D**. The existing 2D Phaser codebase carries forward almost entirely.

## What gets reused from the current 2D game

- ✅ Phaser engine, scene system, asset pipeline
- ✅ Bug entity behaviors (flee, hide, respawn)
- ✅ Smash mechanic, combo system, score
- ✅ Audio (WebAudio synth) — stays exactly as-is
- ✅ Menu scene, end-game dialog system, slow-mo finale
- ✅ Most existing PNG bug sprites (already look semi-3D rendered)
- ✅ Skill system + AI pickups

## What's new

- Multiplayer netcode (Colyseus client + server)
- Player nameplates + remote-player rendering
- Lobby UI (room create / join / room code)
- New pre-rendered stickman sprite sheets (32-direction rotations)
- New tile-based map system (currently we use empty playfield)
- Server-authoritative bug spawning + smash events
- Leaderboards backend

---

## Phase 0 — Decisions + multiplayer hello world (Week 1)

Goal: two browsers see each other moving in real time.

- [ ] Lock backend hosting (Render / Fly.io / Railway — recommend Render free tier)
- [ ] Lock art pipeline (Mixamo render-to-spritesheet vs custom illustrator)
- [ ] Create `server/` folder with Colyseus + Express bootstrap
- [ ] Define `ArenaRoom` with player join/leave + position sync (30 Hz)
- [ ] Add client-side networking module that connects + reconciles
- [ ] New scene `MultiPlayScene.js` (lives alongside current `HuntScene`)
- [ ] Test: two browser tabs → see each other's stickman move around

**Exit criteria**: real-time multiplayer movement working locally.

---

## Phase 1 — Pre-rendered sprite pipeline (Week 2)

Goal: replace the flat SVG stickman with 32-direction pre-rendered sprite sheet.

- [ ] Pipeline: Mixamo character → Blender → render 32 angles → export sprite atlas
- [ ] One walk cycle (24 frames × 32 directions ≈ 768 frames, or 8 dirs × 24 = 192 to start)
- [ ] One smash animation (12 frames × 8 dirs)
- [ ] Replace `Hunter.js` to use directional sprite sheet
- [ ] Bug PNGs: keep current art OR re-render with shadows + lighting matching stickman
- [ ] Drop shadow under each entity (the "fake 3D depth" trick)

**Exit criteria**: stickman runs in 8+ visible directions, looks consistently lit, has ground shadow.

---

## Phase 2 — Arena map + shared world (Weeks 3-4)

Goal: a real game world that all players share.

- [ ] Tile-based map (e.g. 60×40 tiles) — VS Code "office floor" themed
- [ ] Server holds canonical bug state + map data
- [ ] All players see the same bugs in the same places
- [ ] Smash events are validated server-side
- [ ] Server tick = 20 Hz, client renders interpolated state
- [ ] Camera follows local player (scrolls within map bounds)
- [ ] Minimap (optional, polish)

**Exit criteria**: 4 players in same room smashing same bugs.

---

## Phase 3 — Multiplayer modes (Weeks 5-6)

Goal: the proposal's Mode A + Mode B both work.

- [ ] **Mode A (Solo Infinite Loop)**: single-player but score syncs to global leaderboard
- [ ] **Mode B (Team Battle)**: 2v2 race to clear bugs across 3 maps
- [ ] PvP knockback attacks (proposal §6, optional per mode)
- [ ] Energy bar + laptop-break recovery (proposal §4)
- [ ] End-of-match results screen + MVP

**Exit criteria**: 4 players play complete Team Battle match end-to-end.

---

## Phase 4 — Persistence + boss + polish (Weeks 7-8)

Goal: launchable demo.

- [ ] Lightweight auth (anonymous → optional Google sign-in)
- [ ] Daily/weekly leaderboards backed by SQLite or Supabase
- [ ] Cosmetics (laptop skins, character tints)
- [ ] One boss bug ("Production Incident") at end of Mode B
- [ ] Visual polish: particle effects, screen shake on smash, slow-mo finale ported from 2D version
- [ ] Capacitor mobile wrap (Android first)
- [ ] Soft launch on itch.io

**Exit criteria**: public demo with leaderboards and a boss fight.

---

## Hosting + cost (same as full 3D plan)

- **Colyseus server**: Render free tier or Fly.io free tier; $7/mo Starter when ready
- **Static client hosting**: itch.io (free) or Cloudflare Pages (free)
- **Database**: Supabase or Render Postgres free tier
- **Mixamo + Kenney assets**: $0
- **Total cost during dev**: ~$0/month
- **Cost at ~100 daily players**: ~$10-20/month

---

## What was discarded

- Full 3D Babylon path (Phase 0 scaffold preserved in `.claude/context/recycle_bin/`)
- Unity / Three.js / Godot — all evaluated and dropped in favor of staying in Phaser
- Native 3D character physics + PvP knockback — replaced with 2D knockback impulses
- True nav-mesh AI — replaced with simpler 2D pathfinding (which the current bugs already use)

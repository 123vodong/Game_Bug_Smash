# Stickyman Growth System — Temp Breakdown

Source proposal: [ideas/STICKYMAN_GROWTH_SYSTEM.md](../ideas/STICKYMAN_GROWTH_SYSTEM.md)

**Status (2026-05-29):** v0 implemented end-to-end and live on the local server. Player-test in progress.

This doc is **temporary** — meant to track the implementation while we test the idea. Once the system ships or is cut, fold the surviving parts into [`TASK_STATUS.md`](./TASK_STATUS.md) and the relevant `../design/` docs (numbers → `09_BALANCE.md`, mechanics → `03_PROGRESSION.md`), then delete this file.

---

## Decisions made for v0

### Level tiers (1–6, server-authoritative)

| Lv | Title | XP needed (cumulative) | Sprite scale | Max energy | Bug damage |
|---|---|---|---|---|---|
| 1 | Intern | 0 | 0.85 | 60 | 1 |
| 2 | Fresher | 8 | 0.95 | 80 | 1 |
| 3 | Junior | 22 | 1.10 | 100 | 2 |
| 4 | Middle | 45 | 1.25 | 120 | 2 |
| 5 | Senior | 80 | 1.40 | 150 | 3 |
| 6 | Super Senior | 140 | 1.55 | 200 | 4 |

- **XP** = sum of `base × comboMult` per kill (matches the existing score formula, so XP grows the same way score does).
- **Damage** is what the smash/punch/kick deals to bugs (PvE). Lv6 smash one-shots a HP-3 scarab.
- **Aura ring** under the stickman appears at Lv5 and Lv6 — same colored ring we already render but pulsing + outer glow.

### Energy

- Max per level (above). Regenerates **12/sec** while not attacking; **0** while broken.
- Costs:
  - Smash 8
  - Punch 6
  - Kick 18
  - Parry 12
  - Jump 0 (always free)
- If energy hits 0 → **laptop broken**.

### Broken state

- Triggered by energy → 0 OR PvP damage that brings energy to 0.
- Duration **8 s** (bumped from 5 s after first playtest — felt too short to give the dramatic "career setback" beat).
- During broken: can move + jump, **cannot smash/punch/kick/parry**.
- On entry: **level resets to 1**, energy is set to 0 (fills back to Lv1 max over the 5 s).
- On exit: fully refilled to Lv1 max energy, alive and ready.
- Sprite: re-uses the **parry pose** + adds a "FIXING…" label and a sparking-mug-style yellow ring.

### PvP damage

- Click another player → set them as attack target (yellow ring).
- Auto-smash when in range deals **15 × attacker level damage to target energy** per swing (so Lv1 deals 15, Lv6 deals 90 — Lv6 can KO an Intern in one swing).
- Costs the attacker the normal smash energy (8).
- No "knockback" yet — we'll add it only if PvP feels too static.

### Reset rules

- Broken = level resets to **1** and XP resets to **0**. Energy refills slowly.
- Round end = score, XP, level, energy all reset (already covered by the existing `_enterPlaying` reset).
- Death (broken) does **not** kick you out — you stay in the world, just can't fight for 5 s.

### Out-of-scope for v0

- **Bug release on death** (proposal §5 — SP only). Our MP scene doesn't have a SP path that uses this.
- **Safe-zone faster recovery** (proposal §3). Adds map geometry we haven't designed.
- **PvP knockback impulse**. Add later if needed.
- **Anti-snowball balancing** (proposal §6 Team). One global FFA arena for now; no teams.

---

## Implementation checklist

### Server ([server/rooms/ArenaRoom.js](../../../server/rooms/ArenaRoom.js))

- [x] Decide thresholds + scale + damage tables (above)
- [x] Player schema: added `level`, `xp`, `energy`, `maxEnergy`, `broken`, `broken_seq`
- [x] Helpers: `levelFromXP(xp)`, `maxEnergyForLevel(lv)`, `bugDamageForLevel(lv)`
- [x] On kill: XP increments by `base × comboMult`, level recomputed, max energy bumped (with partial refill)
- [x] Smash handler:
  - [x] reject if broken or not enough energy
  - [x] drain energy from attacker
  - [x] apply damage `bugDamageForLevel(p.level)` to bug
  - [x] if target is a PLAYER (`msg.targetSid`): deal `level × 15` to victim energy via `_applyPvpHit`
- [x] Kick handler: energy cost + scaled damage + AOE includes PvP nick on every player in 88px
- [x] Tick:
  - [x] regen `+12/sec` for non-broken players
  - [x] energy → 0 triggers `_enterBroken` (level reset, sprite forced to `parry`, 5s timer)
  - [x] on timer fire: `_exitBroken` (full energy refill at Lv1 max, idle pose)
- [x] Round reset: zeros xp, level, combo, sets `energy = maxEnergyForLevel(1)`, `broken = false`

### Client ([src/scenes/MultiPlayScene.js](../../../src/scenes/MultiPlayScene.js))

- [x] Title line under each name in the player's color
- [x] Sprite `displaySize = 78×100 × scaleByLevel(level)` updated every frame
- [x] Local energy HUD — fat 280×16 bar centered above action buttons, color green > yellow > red
- [x] Local level badge above the bar (`Lv1 · Intern`); turns red and shows `FIXING LAPTOP` while broken
- [x] Per-player slim energy bar above the head
- [x] Broken visual: gray tint, alpha pulse, parry pose, yellow spark burst on entry
- [x] Floating "🔧 FIXING" banner above the head with a live countdown (8.0s → 0.0s) — visible on every broken stickman (yours and others')
- [x] Aura: pulsing colored ring under Lv5+ players, scales with sprite
- [x] Leaderboard rows include `Lv{n} {Title}`
- [x] Local level-up: combo-tier chime + 1.2× scale-pop tween
- [x] PvP auto-attack: chasing a clicked player triggers smash with `targetSid` when in range
- [x] **HUD elements scale with sprite** — shadow/ring/aura anchored to feet at `32 × scale`, nameplate / title / energy bar anchored to head at `-85 × scale` (added after first playtest noted floating text didn't follow the bigger sprite)

### Audio

- [x] Level-up chime via `AudioManager.combo(3)`
- [x] Broken state burst via `AudioManager.failure`
- [x] Recovery cue via `AudioManager.skillPickup('buff')`

---

## Test pass

When the implementation lands:

1. Solo session, smash null/ladybug bugs → watch XP fill, level pop, sprite scale up, title change — **verified**
2. Spam smash until energy bottoms → confirm broken state, can still move, can't attack, FIXING label appears — **pending player test**
3. Wait 5 s → confirm recovery to Lv1 with full energy — **pending player test**
4. Two browser tabs, click each other → confirm PvP damage shows in remote energy bar — **pending player test**
5. Lv6 player smashes a Lv1 player → confirm 1-shot KO (Lv1 has 60 max energy; 6 × 15 = 90 dmg) — **pending player test**
6. Round end → confirm everything resets cleanly — **pending player test**

### Issues found mid-test

- **Floating HUD didn't follow sprite scale.** First playtest showed name/title/energy bar staying at fixed offsets while the sprite grew taller — head poked above the nameplate. **Fixed** by anchoring the HUD elements to `HEAD_TOP = -85 × scale` and ground props to `FEET_Y = 32 × scale`.

---

## Rollback notes

If any of this hurts the core feel:

- **Energy too punishing**: bump regen to 20/sec, max energy +50%
- **PvP too oppressive**: cut damage from `level × 15` to `level × 8`, or limit PvP to Lv3+
- **Growth not visible**: bump scale curve more steeply
- **Whole system feels bolted-on**: remove the energy + broken + PvP code paths (schema fields can stay, just stop reading them) and we're back to v0 progression as a cosmetic-only system

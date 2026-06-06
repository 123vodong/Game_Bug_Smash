# 09 · Balance — Single Source of Truth

Every tunable number, in one place. Change here first, propagate to code second. When a number in code differs from this doc, **trust the code** — and fix this doc.

Sources of truth in code:
- Server: [server/rooms/ArenaRoom.js](../../../server/rooms/ArenaRoom.js)
- Client: [src/scenes/MultiPlayScene.js](../../../src/scenes/MultiPlayScene.js)
- SP levels: [src/data/levels.js](../../../src/data/levels.js)
- SP bugs: [src/data/bugs.js](../../../src/data/bugs.js)

---

## World

| Constant | Value | Where |
|---|---|---|
| `ARENA_W` | 6000 | server |
| `ARENA_H` | 3375 | server |
| `WORLD_W` | 6000 | client (must match server) |
| `WORLD_H` | 3375 | client (must match server) |
| Canvas viewport | 1280 × 720 | static Phaser scale |
| Tile size | 80 × 80 px | client floor |
| Minimap | 200 × ~113 px | client |
| Move speed | 240 px/s | client |

---

## Room flow

### Personal Mode (current)

| Constant | Value | Note |
|---|---|---|
| Round timer | **none** | `state.timeLeftMs = -1` sentinel; world is persistent |
| Results phase | **none** | `state.phase` stays `'playing'` forever |
| `TICK_MS` | 50 (20 Hz AI simulation) | bug AI + energy regen run at this rate |
| `setPatchRate` | 80 ms (12.5 Hz state broadcast) | decoupled from sim; client lerps between snapshots |
| Max clients per room | 32 | |
| Score persistence | per-session | resets only on disconnect |

### Team Mode (future, in dead `_enterResults` / `_enterPlaying` reference code)

| Constant | Value | Note |
|---|---|---|
| `PHASE_PLAYING_MS` | 90 000 (90 s) | per round / per stage |
| `PHASE_RESULTS_MS` | 8 000 (8 s) | between rounds |
| Stage respawn timers | 3 / 5 / 8 / 12 / 15 s | progressive per stage |

---

## Bugs

### Bug kinds (re-tuned 2026-05-31 late session)

| Kind | HP | Speed | Weight | Score | Trait |
|---|---|---|---|---|---|
| `bug-ladybug` | 1 | 35 | **7 (~39%)** | 5 | **Swarm-eater**: most common; eats obstacles 2× rate; tutorial fodder |
| `bug-null` | 2 | 45 | 4 (~22%) | 8 | Common, slightly tougher |
| `bug-race` | 2 | 130 | 2 (~11%) | 15 | Sprints constantly — even faster |
| `bug-beetle` | 3 | 55 | 2 (~11%) | 20 | **Aggressive**: 320 px aggro · **6 HP nip / 0.9 s** · 1.25× chase |
| `bug-toxic` | 4 | 60 | 1 (~6%) | 25 | Tanky; **spawns 70 px green poison cloud (6 HP / 600 ms, 1.8 s lifetime) on death** (softened 2026-06-02 — was 10 HP / 450 ms) |
| `bug-scarab` | 5 | 35 | 1 (~6%) | 30 | Armored tank; slow but unyielding |
| `bug-robot` | **6** | 75 | 1 (~6%) | 50 | **Boss-tier**: 420 px aggro · straight-line charge (no turn-lerp) · 1.4× chase · **12 HP slam / 1.8 s** (HP nudged 7→6 for intern accessibility 2026-06-02) |

Total weight = 18. Ladybugs dominate; harder kinds got tougher HP/dmg.

`BUG_KIND_SCORE` × `comboMult` is the score formula. Combo ×3 on a robot = 150 XP. With the new XP curve `[0,150,600,1800,4500,10000]`, ~200 robot kills = Lv 6.

Defensive rules unchanged: **Shield** absorbs one bug/cloud hit (then breaks); **Roll/Jump invuln** dodges all damage during the 600 ms window.

### Obstacles — destructible code-snippet bug nests (2026-05-31)

| Constant | Value |
|---|---|
| Visual | Real syntax-highlighted code text (no panel background) |
| Snippet pool | **57 hand-written gags** in JS, Python, C, Rust, Go, SQL, Bash, CSS, Regex, PHP, YAML |
| Snippet pick | Deterministic from world position — same obstacle = same code |
| HP | 4 |
| Player smash damage | 1 per hit, within 110 px reach |
| Bug-eat tick interval | 1500 ms |
| Bug-eat radius | 80 px |
| Per-bug eat damage | 1 (ladybug = **2**) |
| Damage cap per tick | 4 |
| Bugs spawned on break | 2–4 random kinds, ring radius 24–60 px |
| Initial layout | 22 hand-placed positions |
| Dynamic respawn target | **26** (every 3500 ms, refills if below; 12 placement attempts, 30 px padding from other obstacles, 220 px min from any player) |
| Spawn variants | 8 pre-set (w, h, kind) combos |
| Q/E pass-through window | 350 ms after cast (player ignores obstacle clamping) |

Tactical layer: ladybug swarms near an obstacle can crack it open in 1–2 ticks, spawning more bugs → runaway swarm risk. Players must either smash the obstacle themselves (to control timing) or clear nearby bugs first.

### Bug death effects (client-side, on `alive → false`)

| Kind | Effect |
|---|---|
| ladybug | 4 white dust dots fanning out |
| null | Gray smoke puff |
| race | 6 electric-blue speed lines |
| beetle | Brown shockwave ring + 3 chip fragments |
| toxic | (no extra — green poison cloud is the effect) |
| scarab | 14 tumbling brown fragments |
| robot | White flash + yellow electric ring + 8 lightning arcs + 180 ms / 0.012 camera shake |

### Spawn + lifetime

| Constant | Value |
|---|---|
| `MAX_BUGS` | 100 (tuned down from 160 — schema sync was the dominant client-side cost) |
| `SPAWN_EVERY_MS` | 600 (≤4 players) / 850 (>4 players, slowed because drops populate) |
| `BUG_LIFETIME_MS` | 30 000 (bugs age out at 30 s if not killed) |
| Bug drop on defeat | `1 + floor(level / 2)` bugs (Lv1=1, Lv6=4); ring radius 28–68 px; Personal Mode only |

### AI

| Constant | Value |
|---|---|
| `FLEE_RADIUS_PX` | 220 |
| `WANDER_SPEED` | 35 px/s (base × 0.6 effectively) |
| `FLEE_SPEED_MUL` | 2.2 |
| `TURN_LERP` | 6 |

---

## Health pickups (Personal Mode only)

| Constant | Value |
|---|---|
| `PICKUP_TARGET_COUNT` | 5 |
| `PICKUP_RESPAWN_MS` | 5 000 (one spawn every 5 s when below target) |
| `PICKUP_ENERGY_GAIN` | 40 |
| `PICKUP_RADIUS` (server) | 26 px |
| `PLAYER_PICKUP_RADIUS` | 28 px (combined trigger ≈ 54 px) |
| Broken players can collect | **no** |

---

## Combat

### Range (server-authoritative; includes latency buffer)

| Verb | Server reach | Client cone | Cooldown |
|---|---|---|---|
| Smash | 96 px (`SMASH_RADIUS`) | 96 px (matches server) | 220 ms |
| Punch | 112 px | 112 px | 220 ms |
| Kick (AOE) | 88 px | 88 px | 360 ms |
| Parry | n/a | n/a | 380 ms |
| Jump | n/a | n/a | 220 ms |

### Animation duration (client visual)

| Verb | Pose duration |
|---|---|
| Smash | 130 ms |
| Punch | 130 ms |
| Kick | 260 ms |
| Parry | 620 ms |
| Jump | 420 ms (with arc tween) |

Kept shorter than cooldown so sprites read distinct hits.

### Score / combo

| Constant | Value |
|---|---|
| Base score per kill | 10 |
| Combo timeout | 1500 ms |
| Combo tier 1 (3 kills) | × 1.5 |
| Combo tier 2 (5 kills) | × 2 |
| Combo tier 3 (10 kills) | × 3 |
| XP per kill | same as score (base × combo mult) |

---

## Growth system — Stickyman tiers (re-tuned 2026-06-02 balance pass)

| Lv | Title | XP needed | Sprite scale | Max health | Max energy | Bug damage |
|---|---|---|---|---|---|---|
| 1 | Intern | 0 | **0.70** | **50** | **50** | 1 |
| 2 | Junior | **150** | 0.88 | 90 | **90** | 1 |
| 3 | Middle | **600** | 1.05 | 130 | **120** | 2 |
| 4 | Senior | **1800** | 1.22 | 180 | **150** | 2 |
| 5 | Lead | **4500** | 1.40 | 230 | **180** | 3 |
| 6 | Super Senior | **10000** | 1.58 | 290 | **220** | 4 |

XP deltas: 150 / 450 / 1200 / 2700 / 5500 — ~3× per tier. Reaching Super Senior takes ~200 robot kills or 2000 ladybug kills (no combo) — endgame-scale commitment.

**Intern fragility**: 50 HP, 50 energy, scale 0.70. Survives 3-4 robot slams (12 ea) or 4 toxic-cloud ticks (6 ea). Energy is enough for 2× R ult (25) or 5× E jump (8) before needing a pickup.

**Smooth scaling**: `smoothScale(level, xp)` interpolates between `LEVEL_SCALES[level-1]` and `LEVEL_SCALES[level]` per XP point, so the character grows continuously between level-ups.

### Energy

| Constant | Value |
|---|---|
| Smash cost | 0 (free — primary attack) |
| Q Dash cost | 10 |
| W Shield cost | 15 |
| E Jump cost | 8 |
| R Ult cost | 25 |
| Energy regen | **0** (no passive regen — pickups only restore) |

Pickup restores **+40 HP and +25 energy**. Energy bumped +10–20 across all tiers on 2026-06-02 so intern can comfortably fit 2 ults or 1 ult + 1 small skill.

### PvP (2026-06-02 balance pass)

| Constant | Value |
|---|---|
| `PVP_DAMAGE_PER_LEVEL` | **12** (was 15) — Lv 6 vs Junior now 72 dmg → survives w/ 18 HP; no more insta-KO above intern |
| Kick AOE PvP nick | same — `level × 12` to every player in 88 px |
| **Broken duration** | **20 000 ms** (was 8 000) — defeat is a real strategic event |
| Bug drop on defeat | `min(10, 2 + floor(score / 50))` bugs (Personal Mode only; cap lowered from 16) |
| Score reset on defeat | **YES, Personal Mode only** — all points wiped along with level/XP |

### Ult (R) — re-balanced 2026-06-02

| Constant | Value |
|---|---|
| Energy cost | 25 |
| Radius | **160 px** (was 200) |
| Bug damage multiplier | **× 3** (was × 4) |
| Player damage per attacker level | **12** (was 20) |
| Player damage cap | **70** (was 100) |
| Knockback | 120 px |
| Stun on hit | **1000 ms** (was 1500) |

Lv 6 ult kills: Intern (50 HP, 70 dmg → 1-shot); Junior (90 → 20 HP); Middle (130 → 60 HP); Senior+ survive with > 100 HP. Strong opener/finisher but no longer a guaranteed delete button above Intern.

### Broken on/off

| Trigger | Behavior |
|---|---|
| `energy === 0` | enter broken (level → 1, xp → 0, lockout 8 s) |
| 8 s timer | exit broken (energy refills to Lv1 max = 60) |

---

## HUD / UX

| Constant | Value |
|---|---|
| Selection ring radius (base) | 30 px |
| Click target tolerance | 44 px |
| Move-target throttle | 33 ms (~30 Hz drag) |
| Chase "hug" distance | 28 px |
| Player position send rate | 50 ms (20 Hz) |
| Camera deadzone | 100 × 100 px |
| Joystick base radius | 56 px |
| Joystick knob radius | 26 px |
| Joystick dead zone | 20% of base |
| Action button radius | 32 px |
| Action button gap | 10 px |

---

## Single-player levels (reference)

Detailed table in [../overview_levels.md](../overview_levels.md). Summary:

- **12 levels** across 4 worlds
- Time limits: 50–65 s
- Bug counts: 8–25 per wave
- HP multipliers: 1.0× (W1-2), 1.25–1.45× (W3), 1.05–1.1× (W4)
- Speed multipliers: 1.0× (W1-2), 1.1× (W3-3, W4)
- Skill spawn cadence: 9.5 s → 3.5 s as worlds progress

---

## Tuning levers — quick reference

| Symptom | Knob to turn |
|---|---|
| Players never break | Smash cost up, regen down |
| Players always broken | Regen up, Lv1 max energy up |
| PvP one-shots | Cap PvP damage at `min(level × 15, 80)` |
| Lv6 too rare | Lower XP thresholds |
| Lv6 too common | Raise XP thresholds, steepen curve |
| Bugs feel sluggish | Bump base speeds + flee mul |
| Bugs feel hyper | Drop flee mul to 1.8× |
| Smashes get rejected | Bump server reach (currently 96) |
| Round feels short (Team Mode) | Bump `PHASE_PLAYING_MS` from 90 s to 120 s (Personal Mode has no round) |
| Personal Mode session length | Player-controlled (leave whenever); not server-tunable |
| Pickups too easy | Drop `PICKUP_ENERGY_GAIN` 40→25, or raise `PICKUP_RESPAWN_MS` 5 s → 8 s |
| Bug drops overwhelming | Drop formula to flat `1 bug per defeat`, or disable entirely |
| Arena feels crowded | Bump `ARENA_W/H` proportionally |
| Arena feels empty | Add AI bots (planned) |

Always change the **server** constant first, then mirror to the client. Never edit one without the other.

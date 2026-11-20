# 09 · Balance — Single Source of Truth

Every tunable number, in one place. Change here first, propagate to code second. When a number in code differs from this doc, **trust the code** — and fix this doc.

Sources of truth in code:
- Server rules (every MP number): [server/game/rules.js](../../../server/game/rules.js)
- Server content: [server/data/events.js](../../../server/data/events.js) (world events, golden bug, boss) · [server/data/bots.js](../../../server/data/bots.js) (bot population + personalities)
- Server logic: [server/rooms/ArenaRoom.js](../../../server/rooms/ArenaRoom.js) · [server/game/](../../../server/game/)
- Client: [src/scenes/MultiPlayScene.js](../../../src/scenes/MultiPlayScene.js)
- SP levels: [src/data/levels.js](../../../src/data/levels.js)
- SP bugs: [src/data/bugs.js](../../../src/data/bugs.js)

---

## Office Chaos (2026-11-06) — bots, events, boss, drama

### Bug spawning (replaces the fixed 600/850 ms cadence)
| Constant | Value |
|---|---|
| `spawnIntervalFor(players)` | `clamp(1000 / (1.2 + 0.3 × players), 200, 650)` ms → 650 ms solo · 256 ms with 9 · 200 ms cap |
| `SPAWN_NEAR_HUMAN_CHANCE` | 0.45 — share of spawns placed 500–1100 px from a random human |
| `HARD_MAX_BUGS` | 150 — ceiling across every spawn path (nests, drops, minions, surges); golden bug exempt |
| `EAT_PAUSE_ABOVE_BUGS` | 110 — bugs stop eating obstacles while the field is this crowded |
| `WELCOME_BUGS` | 5 ladybug/null bugs 180–460 px around a joining human (no empty first seconds) |
| `SPAWN_PROTECT_MS` | 3000 — invulnerable after joining and after the laptop is repaired |

### AI coworkers (`server/data/bots.js`)
| Constant | Value |
|---|---|
| `BOT_FILL_TARGET` / `BOT_MAX` | humans + bots ≈ 9, at most 8 bots; 0 bots at 9+ humans |
| Seed | first human finds 4 "warm" bots (start XP 0 – ~450, mostly low) |
| Join/leave cadence | 0.5–0.9 s while under half full, else 1.8–4.2 s; churn: one bot heads home every 2.5–5 min and is replaced |
| Bot speed / swing | 200–234 px/s (humans 240) · swing every 285–430 ms (humans 220) |
| PvP start roll | `aggression-score × 0.07` per think (~3/s), targets ≤ 400 px, own HP ≥ 60% |
| Fairness | never start fights with human Lv1, or humans > 1 level below (unless crowned) · ≤ 2 bots per human · forgive a Lv≤2 human's first 2 hits in 6 s · no R ult or Q dash that would clip a bystander human |

### Experience Pass 1 (2026-11-18) — reconnect, broken time, Rollback vote
| Lever | Value | Where |
|---|---|---|
| Arena reconnect grace | 20 s | `server/game/rules.js` RECONNECT_GRACE_S |
| Broken (defeat) time by growth level | 8 / 10 / 12 / 15 / 18 / 20 s (Intern → Super Senior), level at the moment you fall | `server/game/rules.js` BROKEN_MS_BY_LEVEL |
| Away (in grace) | frozen; bots, bugs, clouds, boss ignore them; **humans can still hit them** | `ArenaRoom.onLeave` |
| XP curve (EP-20) | Lv2 at **60** XP (was 150) · 600 · 1800 · 4500 · 10000 | `server/game/rules.js` LEVEL_XP_THRESHOLDS |
| New-session boost (EP-20) | ×2 bug-kill XP for a human's first 3 min (reconnect keeps the start time; bots never) | `server/game/rules.js` NEW_SESSION_XP_MUL / _MS |
| Warm bot start XP (EP-20) | 0–240, squared-random (was 0–450) | `server/game/rules.js` BOT_WARM_XP_MAX |
| Boss KO during truce (EP-20) | broken as usual, but no level/XP/score reset and no bug spew | `ArenaRoom._enterBroken` |
| Team reconnect grace | 60 s (a bot holds the seat meanwhile) | `server/game/moba/tuning.js` TEAM_RECONNECT_GRACE_S |
| Rollback (concede) vote | from 12:00 · open 20 s · 3 min cooldown · 4 of 5 yes and no human "no" | `shared/moba/rules.js` ROLLBACK_* |

## World events (`server/data/events.js`)
| Event | Duration | Modifiers |
|---|---|---|
| 🚨 Prod Down | 24 s | spawn every 150 ms, max 130 bugs, ×1.5 XP, +16 bugs around humans |
| ☕ Coffee Break | 18 s | bugs ×0.6 speed, pickup pool 14 (refill 0.9 s near humans), +10 pickups |
| 🧊 Code Freeze | 14 s | bugs ×0 speed, no bites, no obstacle eating |
| 🚀 Friday Deploy | 24 s | ×2 XP, bugs ×1.35 speed |
| 🍕 Hackathon | 15 s | skill cost ×0 |
| ✨ Golden bug | ≤ 45 s | 240 HP, 175 px/s, flees within 300 px (zig-zag); spawns 700–1300 px from a human and ≥ 700 px from everyone else; bots ignore it for the first 10 s; **+400 XP to whoever dealt the most damage** (not the last hit) |
| ⏰ The Deadline | ≤ 80 s | every 3rd event; truce (no PvP, +4 s after); spawn every 800 ms, max 80 |

Cadence: first event 25 s after the room opens, then a 38–55 s gap; PM nags every 30–55 s between events.

### The Deadline boss
| Constant | Value |
|---|---|
| HP | `min(30000, 1200 + 950 × players)` → 9750 with 9 players (measured 27–36 s with a full raid; was ~20 s at 520/player) |
| Hit radius | 70 px added to every attack's reach |
| Speed | 72 → 105 px/s in phase 2 (≤ 50% HP) |
| Slam | first after 4.2 s, then every 4.2 s → 3.0 s; 1.1 s telegraph; 150 px; **16% of the victim's max HP** (min 8) so every level needs ~6 slams; 150 px knockback; phase-2 double slam with ≥ 3 players near |
| Minions | 2 per 8 s (ladybug/null) → 3 per 6 s (+beetle) |
| Pizza | 2 heal pickups 260–460 px from the boss every 9 s |
| Rewards | 1500 XP split by damage share + 100 participation (≥ 1% share) + 300 to the last hitter (always); MVP banner |
| Fail (timeout) | 1.6 s stun on everyone + 14 bugs |

### Drama
| Constant | Value |
|---|---|
| Streak tiers | 3 ON FIRE · 5 10x ENGINEER · 8 DEPLOYING TO PROD · 12 PRINCIPAL ENGINEER · every 4 after |
| Shutdown | ending a ≥ 3 streak pays 40 XP × streak |
| Crown | top scorer with ≥ 200 score; a challenger must lead the holder by `max(25, 10%)` to take it; bounty `round((100 + 0.25 × score) / 10) × 10` paid to whoever breaks them; personal "you're Tech Lead" banner ≤ 1 per 30 s |
| Combo feed | ×15 / ×25 / ×40 |
| Ult vs defenses | Shield or roll i-frames block the **whole** ult — damage, 120 px knockback and 1 s stun (before 2026-11 they blocked only the damage) |

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

| Lv | Title | XP needed | Sprite scale | Max health | Max energy | Smash damage |
|---|---|---|---|---|---|---|
| 1 | Intern | 0 | **0.70** | **50** | **50** | 12 |
| 2 | Junior | **150** | 0.88 | 90 | **90** | 20 |
| 3 | Middle | **600** | 1.05 | 130 | **120** | 28 |
| 4 | Senior | **1800** | 1.22 | 180 | **150** | 38 |
| 5 | Lead | **4500** | 1.40 | 230 | **180** | 48 |
| 6 | Super Senior | **10000** | 1.58 | 290 | **220** | 60 |

(Smash damage = `PVP_BASE_BY_LEVEL` — the unified base, dealt to bugs and players alike; Q Dash ×1.5, R Ult ×2.0. See "Unified damage model".)

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

### Unified damage model (2026-06-06)

One model drives **every** attack — against bugs *and* players. This replaced two separate, mismatched systems (old PvP: flat `attackerLevel × 12`; old PvE: `bugDamageForLevel` 1–4 with its own dash ×2 / ult ×3 multipliers).

**Why.** The old PvP model had two flaws: (1) smash (free), Q Dash and R Ult all did the **same** damage to players — no reason to spend energy; (2) HP (50→290) and damage both scaled ~6×, so cross-level TTK swung ~36× — a **Lv6 one-shot a Lv1**, a **Lv1 needed ~25 hits** on a Lv6. Bugs and players also used totally different damage scales, so unifying lets a single floating damage number read the same everywhere.

**Formula** (`attackBase()` / `bugDamage()` / `pvpDamage()` in [ArenaRoom.js](../../../server/rooms/ArenaRoom.js)):

```
base          = PVP_BASE_BY_LEVEL[attackerLv] × PVP_SKILL_MUL[source]
damage to bug = round(base)                       // no level gap — bugs have no level
damage to PvP = round(base × matchupMul)          // matchup applies to players only
```

| Constant | Value |
|---|---|
| `PVP_BASE_BY_LEVEL` | `[12, 20, 28, 38, 48, 60]` — ≈ player maxHP / 4.8 per tier → **same-level PvP TTK ~5 smashes** |
| `PVP_SKILL_MUL` | `{ smash: 1.0, dash: 1.5, ult: 2.0 }` — energy buys real burst (bugs use this too) |
| `PVP_MATCHUP_PER_LEVEL` | `0.20` — ± per level of `(defenderLv − attackerLv)`; **players only** |
| `PVP_MATCHUP_MIN / MAX` | `0.35 / 1.80` — clamps; hitting **down** is weak (no stomping), **up** is buffed (underdog can fight) |
| Bug HP (`BUG_KINDS`) | `×12` vs old: ladybug 12 · null/race 24 · beetle 36 · toxic 48 · scarab 60 · robot 72 (uint8; clamped at 0 on hit) |
| **Broken duration** | **20 000 ms** — defeat is a real strategic event |
| Bug drop on defeat | `min(10, 2 + floor(score / 50))` bugs (Personal Mode only) |
| Score reset on defeat | **YES, Personal Mode only** — all points wiped along with level/XP |

**Per-level attack damage** (identical vs bug or player base; player adds matchup on top):

| Source | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 | Lv6 |
|---|---|---|---|---|---|---|
| Smash (×1.0) | 12 | 20 | 28 | 38 | 48 | 60 |
| Q Dash (×1.5) | 18 | 30 | 42 | 57 | 72 | 90 |
| R Ult (×2.0) | 24 | 40 | 56 | 76 | 96 | 120 |

**Bug TTK** (smash hits to kill — unchanged by the ×12 rescale): ladybug 1 · null/race 2→1 · beetle 3→1 · toxic 4→1 · scarab 5→1 · **robot 6→2** (Lv1→Lv6).

**PvP TTK** (HP = `[50,90,130,180,230,290]`):

| Matchup | Smash | Q Dash | R Ult |
|---|---|---|---|
| Same level (any) | **5** | ~3 | ~3 |
| Lv6 → Lv1 (was 1-shot) | 3 | 2 | 2 |
| Lv1 → Lv6 (was ~25 hits) | 14 | 10 | **7** |

Progression still matters (a higher level wins the even fight and survives longer), but you can no longer one-shot a fresh player, and an underdog with skills has a real path to a kill.

### Ult (R) — non-damage tuning (2026-06-02)

| Constant | Value |
|---|---|
| Energy cost | 25 |
| Radius | **160 px** (was 200) |
| Damage (bugs + players) | via unified model, source `'ult'` (×2.0) — see table above (the old separate `× 3` bug multiplier was removed) |
| Knockback | 120 px |
| Stun on hit | **1000 ms** (was 1500) |

The ult's value vs players is now its AOE + 120 px knockback + 1 s stun on top of the ×2.0 burst — a strong opener/finisher, not a guaranteed delete button.

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
| Arena feels empty | Raise `BOT_FILL_TARGET` / `SPAWN_NEAR_HUMAN_CHANCE` |
| Bots too aggressive | Lower `aggression` per archetype or the `× 0.07` PvP roll in `BotDirector._findPvpTarget` |
| Boss too slow / fast | `DEADLINE_BOSS.hpBase` / `hpPerPlayer` |
| Events too frequent | `EVENT_GAP_MS` |

Always change the **server** constant first, then mirror to the client. Never edit one without the other.

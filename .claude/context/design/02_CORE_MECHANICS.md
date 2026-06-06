# 02 · Core Mechanics

The gameplay verbs and how they fit together. This doc is engine-agnostic — for the actual numbers, see [09_BALANCE.md](./09_BALANCE.md).

---

## Player state machine

```
              ┌──────────┐
   Q/W/E/R    │          │   energy>0
   ┌────────► │  ATTACK  ├─────────────┐
   │          │          │             │
   │          └────┬─────┘             │
   │               │ action expires    │
   │               ▼                   │
   │          ┌──────────┐             │
   │ SPACE    │          │   energy=0  │
   │  ┌─────► │   JUMP   │             │
   │  │       │          │             │
   │  │       └────┬─────┘             ▼
   │  │            │      ┌─────────────────┐
   ┌──┴─────────┐  │      │                 │
   │            ◄──┘      │ BROKEN (locked) │
   │   IDLE /   │         │                 │
   │   RUN      │ ◄───────┤  countdown 8s   │
   │            │ timer 0 │ level reset → 1 │
   └─────▲──────┘         └─────────────────┘
         │
         │ move input (keyboard / click / joystick)
```

States:
- ✅ **IDLE** — sprite is breathing-bob, energy regenerates
- ✅ **RUN** — moving via input, 2-frame run cycle
- ✅ **ATTACK** — smash / punch / kick / parry pose for the action's duration
- ✅ **JUMP** — sprite arcs up + drops (no attack, free of cost)
- ✅ **BROKEN** — locked out from attacks for 8 s, sprite gray + faded, "FIXING" banner overhead

---

## Combat verbs

| Verb | Key | Type | Visual | Damage | Cost | Cooldown |
|---|---|---|---|---|---|---|
| **Smash** | Q / left-click bug | Single target | Overhead slam | scales w/ level | 8 energy | 220 ms |
| **Punch** | W | Single target | Sideways laptop swing | scales w/ level | 6 energy | 220 ms |
| **Kick** | E | **AOE** (88 px) | Spin kick, yellow ring | scales w/ level | 18 energy | 360 ms |
| **Parry** | R | Defensive | Laptop-shield stance | none | 12 energy | 380 ms |
| **Jump** | SPACE | Mobility | Sprite arc up | none | 0 | 220 ms |

- Smash + punch differ in **range only** (smash 96 px, punch 112 px) — the visual variety exists for *feel*, not strategy.
- Kick is the **wave-clear** tool; punch + smash are the **single-target** tool. Parry has no mechanical effect in v0 (placeholder for future block/counter).
- All damage is integer (1, 2, 3, or 4 depending on level). Bugs have HP 1–3 by kind.

## PvE (vs bugs)

✅ Click a bug → lock target → walk to range → auto-smash on cooldown.
✅ Server validates each smash; rejects out-of-range silently.
✅ Bugs flee from any player within their **flee radius** (220 px) at 2.2× base speed.
✅ Combo ladder: 1× → 1.5× (3 kills) → 2× (5 kills) → 3× (10 kills). Decays 1.5 s after the last kill.

## PvP (vs players)

🟡 Click another player → lock target → walk to range → auto-smash on cooldown.
🟡 Smash damage = `attacker.level × 15` against the target's energy bar.
🟡 Kick is AOE — nicks every player AND every bug in its 88 px radius.
🔵 **Knockback** on hit: push target ~80 px away from attacker. Not yet implemented; add only if PvP feels too static.

## Health vs Energy (split design)

The player carries **two resources** with separate roles:

| Resource | Role | Max per Lv 1→6 | Recovers via |
|---|---|---|---|
| **Health** (red bar) | Damage receiver / defeat trigger | 80 → 280 | Health pickups only (no passive regen) |
| **Energy** (green bar) | Cast cost for attacks + skills | 60 → 200 | Passive regen +12/sec when not casting |

- **Attacks cost energy.** Smash 8, punch 6, kick 18. Dash 20, Shield 25, Roll 15, Ult 40.
- **PvP hits drain health.** Smash from attacker at Lv N deals `N × 15` health damage. Lv 6 vs Lv 1 = 90 dmg on an 80-HP victim = **1-shot KO**.
- **Health depletion → BROKEN**. Energy depletion just means you can't cast for a few seconds while regen kicks in (no defeat).
- **Health pickups** (green plus) restore +40 health, ignored by broken players. Energy has no pickups — passive regen is sufficient.
- On level up, max health + max energy both increase; current values get topped up by the increment (not a full heal).

## Broken (laptop break)

- Triggered when **health** hits 0 (from PvP damage, bug contact damage, or toxic cloud).
- Lasts **20 s** (server-authoritative timer, mirrored on client for the countdown HUD). Bumped from 8s — defeat is now a real strategic event.
- During broken:
  - Cannot smash / cast any skill
  - **Can** move (escape is possible but you're defenseless)
- On entry:
  - Level resets to **1**, XP resets to **0**
  - **Score resets to 0** (Personal Mode only — Team Mode preserves score across deaths)
  - Energy + health locked at 0
  - Sprite swaps to a kneeling **broken pose** with **cracked red-screen laptop** + worried face + sweat drop (uses `idle-broken.svg` / `run-broken.svg` / `run2-broken.svg`)
  - 🔧 **FIXING LAPTOP** banner with live countdown appears above head
  - **Bug drop** in Personal Mode: spawns `min(10, 2 + floor(score / 50))` bugs in a ring around the broken player — high-score players splash bigger swarms when they fall (cap softened 16→10 on 2026-06-02)
- On exit (20 s elapsed):
  - Health + energy refill to Lv 1 max (50 HP / 50 energy)
  - Sprite returns to idle/run with normal laptop
  - Banner clears

This is the **only** punishment in the game. There's no "death and respawn elsewhere", no kicking to lobby — you stay in the world, just temporarily declawed. The penalty is meaningful: lost score, lost level, 20 s of helplessness, and you've added bugs to the map for someone else (or yourself) to clean up.

## Map obstacles — destructible code-snippet bug nests

Added 2026-05-31. Each obstacle is **floating real code text** (no panel, no border) showing one of 57 hand-written satirical snippets in JS, Python, C, Rust, Go, SQL, Bash, CSS, Regex, etc.

- **HP**: 4 per obstacle. Visible crack overlay accumulates as HP drops.
- **Player smash**: 1 HP damage within 110 px. Per-hit feedback: tokens flash red, scale punch, paper-scrap particles.
- **Bug eats**: every 1500 ms server scans; bug within 80 px of obstacle deals 1 HP/tick (ladybug = 2 HP/tick). Cap 4/tick. Per-tick feedback: red flash + crack overlay + **`◣ ◢` chomp marks above the bug + `+1` floater + colored code crumbs sucked from obstacle into the bug**.
- **On destruction**: pop burst (white ring + 10 code-scrap rectangles + dust puff) and **2–4 fresh bugs emerge** from the rubble.
- **Collision**: players + bugs slide along obstacle edges.
- **Q dash + E jump** ignore collision via a **350 ms pass-through window** after skill cast. Big dust puff at midpoint when the leap crosses an obstacle.
- **Dynamic respawn**: server maintains `OBSTACLE_TARGET = 26`. Every 3500 ms, if count is below target, spawns a new one at a safe position (12 attempts, 30 px padding, 220 px min from any player). New obstacle gets a different snippet (deterministic from its new position).

Tactical layer: a ladybug swarm near an obstacle creates a chain reaction — eats the code → spawns more bugs from the wreckage → those bugs eat the next obstacle → swarm explodes. Players must clear the bugs OR break the obstacle themselves to control timing.

## Combo

- Resets each time the player ENTERS a new round
- Decays 1.5 s after the last kill
- Tiers grant audio chime on cross-up
- Carries through level changes (so a Senior dropping to broken still has their combo when they re-engage… provided the 1.5 s window hasn't expired)

🔵 **Design intent:** combos should feel like rhythm. Kicking 4 bugs at once with `E` should pop a `COMBO ×4` instantly and award the corresponding multiplier on each kill.

## Hidden bugs (currently disabled in MP)

- ✅ Single-player: bugs that survive a hit have 60% chance to **dive** (teleport far away, vanish for ~2 s).
- 🚫 Multiplayer: dive is disabled — kept making lock-on chase feel broken.
- 🔵 May return in MP as a **scarab-only** trait, so most bugs stay reliable and only the toughest target is squirmy.

## Score

- Base 10 per kill, multiplied by current combo.
- **Score and XP increase together** by the same amount.
- Score **resets to 0 on defeat** in Personal Mode (along with level/XP) — drives the bug-drop count on the way down. Team Mode (future) preserves score per round.
- XP persists until **broken** (level reset). Round end doesn't apply in Personal Mode.
- 🔵 **Time bonus** (SP only currently): `timeLeftMs / 100` added on win.

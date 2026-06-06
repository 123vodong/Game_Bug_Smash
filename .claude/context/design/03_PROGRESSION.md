# 03 · Progression — Stickyman Growth System

The visible career arc. Source proposal: [../ideas/STICKYMAN_GROWTH_SYSTEM.md](../ideas/STICKYMAN_GROWTH_SYSTEM.md). Implementation tracker: [../tasks/STICKYMAN_GROWTH_BREAKDOWN.md](../tasks/STICKYMAN_GROWTH_BREAKDOWN.md).

---

## Tiers (re-tuned 2026-06-02 balance pass)

| Lv | Title | XP needed (cum.) | Sprite scale | Max HP | Max energy | Bug damage | Aura |
|---|---|---|---|---|---|---|---|
| 1 | Intern | 0 | **0.70** | **50** | **50** | 1 | — |
| 2 | Junior | **150** | 0.88 | 90 | **90** | 1 | — |
| 3 | Middle | **600** | 1.05 | 130 | **120** | 2 | — |
| 4 | Senior | **1800** | 1.22 | 180 | **150** | 2 | — |
| 5 | Lead | **4500** | 1.40 | 230 | **180** | 3 | ✅ pulsing colored ring |
| 6 | Super Senior | **10000** | 1.58 | 290 | **220** | 4 | ✅ brighter aura, biggest sprite |

- **Sprite scale** uses `smoothScale(level, xp)` — interpolates between adjacent levels' scales per XP point, so character grows continuously, not just at level-up.
- **Intern is intentionally fragile**: 50 HP means a single robot slam (12) + a beetle nip (6) leaves you at 32 HP; 5 robot hits = broken. Toxic cloud (6 HP/600 ms) kills intern in ~5 s of contact. Forces defensive early game.
- **PvP damage** = `attackerLevel × 15`. A Lv6 vs Lv1 = 90 damage on a 50-HP victim = **1-shot KO**.

## XP curve

```
Lv1 ── 150 ── Lv2 ── 450 ── Lv3 ── 1200 ── Lv4 ── 2700 ── Lv5 ── 5500 ── Lv6
            ★            ★             ★            ★             ★
```

- **Exponential** — each tier costs roughly 2.5–3× the previous.
- Pure HP-1 spree at 5 XP / kill (no combo): **~2000 kills to Lv 6**. With a sustained ×3 combo: **~670 kills**. With robot kills (50 XP each, ×3 combo = 150): **~67 robots**.
- Most casual sessions cap at Lv 2–3. Lv 4 means an hour+ of focused play. Lv 6 is "I lived without dying badly for two hours."
- Re-tuned progressively across 2026-05-31 from the original `[0,12,40,100,230,500]` (which made Lv 6 reachable in ~14 kills). Now Super Senior is a serious commitment.

🔵 **Design intent:** Lv 6 should be **rare** — a "badge of honor" tier. Roughly 5% of long sessions should hit Lv 5+ at peak. If everyone is Super Senior all the time, raise thresholds. If nobody ever caps, lower them.

## Level-up event

- **Visible immediately** — sprite scale-pops 1.2× briefly on the local player's level-up.
- **Combo chime** (`AudioManager.combo(3)`) plays.
- **Max energy bumps** to the new level's cap, and the player gets a partial refill equal to the increment (not a full heal — keeps tension).
- 🔵 Title flash overhead ("FRESHER!"), maybe color particles? Defer.

## Broken / reset

The core risk-reward: every level you climb is one you can lose.

- **Health** → 0 (from PvP, bug contact, toxic cloud) triggers **BROKEN** state.
- Level resets to **Intern**, XP resets to **0**.
- **Score resets to 0** (Personal Mode only — drives the bug-drop count on the way down).
- **20-second lockout**: can move, can't attack/cast.
- **Bug drop** (Personal Mode): spawns `min(10, 2 + floor(score / 50))` bugs around the broken player. High-score players become walking bug nests when they fall. (Cap softened 16→10 on 2026-06-02 balance pass.)
- See [02_CORE_MECHANICS.md § Broken](./02_CORE_MECHANICS.md#broken-laptop-break) for full state details.

### Why reset all the way to 1 and not -1?

Considered: "lose one level on break". Rejected because:
- Mathematically, a Senior who breaks → Middle → breaks → Junior → breaks dies slowly. Boring.
- Dramatic full-reset creates the *emotional* setback that drives the loop.
- Climbing back from Intern is achievable — but now (post-2026-05-31 curve) takes real time, making "don't die" a meaningful skill.

## Session reset

In **Personal Mode** there are no rounds — your level, XP, and score persist for as long as you stay connected without dying. The reset on **broken** wipes level + XP + score AND splashes bugs onto the map. Death is the only progression-reset event.

In **Team Mode** (future): all players reset to Lv1 / 0 XP / full energy / score 0 on round flip. Each round is a fresh climb from Intern. Death within a round does NOT reset score (team-based scoring needs continuity across deaths).

🔵 **Design intent (post-v0):** persistent meta-progression across rounds. Cosmetic unlocks (laptop skins, character tints, title flavor) earned by total smashes. Not stat boosts.

## Visible identity

A player's tier shows up in **five places** simultaneously:

1. **Sprite size** — bigger every level
2. **Title text** under the name in their player color
3. **Aura ring** at Lv5+ (pulsing under feet)
4. **Energy bar capacity** — visibly wider max at higher levels
5. **Leaderboard row** — `Lv4 Middle` tag next to score

This **redundancy is intentional**. Players can tell at a glance who the Super Seniors are without reading any text.

## Out of scope for v0

| Idea | Status | Notes |
|---|---|---|
| Bug release on death (SP) | 🚫 | Proposal §5 — not in MP path |
| Safe-zone faster recovery | 🚫 | Needs map geometry we haven't designed |
| Knockback impulse on PvP hit | 🔵 | Add only if PvP feels too static |
| Team-based scoring + anti-snowball | 🔵 | One global FFA arena for now |
| Persistent leaderboard | 🔵 | Phase 4 (hosting + DB) |

## Tuning levers if it feels off

| Symptom | Dial |
|---|---|
| Players never break | Bump attack energy costs, drop regen below 12/s |
| Players always broken | Raise regen to 18/s, bump Lv1 max from 60 → 80 |
| Snowballs unkillable | Cap PvP damage at `min(level × 15, 80)` so Lv6 can't 1-shot Lv1 |
| Growth invisible | Steepen scale curve to 0.8 → 1.7 |
| Lv6 too rare | Drop thresholds (e.g. `[0, 6, 18, 35, 60, 100]`) |
| Lv6 too common | Raise thresholds (e.g. `[0, 10, 30, 60, 110, 200]`) |

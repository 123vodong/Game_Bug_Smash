# 01 · Vision

## Elevator pitch

**Bug Smash** is a hyper-casual, top-down arena game where a stickman developer smashes software bugs with a laptop. It ships as a single-player campaign and as a free-for-all multiplayer arena where developers compete to clear bugs, grow through career titles (Intern → Super Senior), and PvP each other for dominance — until somebody burns out, the laptop breaks, and they reset back to Intern.

## Design pillars

1. **One-thumb satisfying.** Every action — move, smash, kick — must feel good on the first tap. Hyper-casual loop = pick up, smash, glance, smash, satisfying death effects.
2. **Career as power fantasy.** Visible growth (size, title, aura) is the central reward. Players don't see XP bars and stat sheets — they see themselves get *bigger*.
3. **Burnout is a real risk.** No infinite power spirals. Every level gained can be lost when the laptop breaks. Snowballs collapse; reversals feel earned.
4. **Office humor is the soul.** PM yelling lines, bug names like `null` and `race`, smash animations slamming a laptop — the comedy carries the loop when the gameplay is thin.
5. **Cheap to run.** Browser-first. No native engine, no large downloads. Servers measured in cents, not dollars.

## Target audience

- **Primary:** developers + dev-adjacent friends (15–35) who recognize the office-humor aesthetic and play casual mobile/web games during breaks.
- **Secondary:** general hyper-casual / .io-game audience that doesn't get the in-jokes but enjoys top-down arena action.
- **Session length:** 90-second round at minimum, 5-minute "one more round" loops at maximum. Not a 30-hour RPG.

## Emotional arc per session

| Phase | Emotion | What's happening |
|---|---|---|
| **Join** | Anticipation | Stickman drops in at Intern, world is full of bugs and other devs |
| **Early ramp** | Power | First kills, first level-up — visible growth |
| **Peak** | Dominance | Senior / Super Senior, big sprite, glowing aura, smashing through HP-3 scarabs |
| **Burnout** | Panic | Energy bar redlining, laptop broken — "FIXING…" countdown ticking |
| **Reset** | Humility | Back to Intern. Sprite tiny. Level gone. Score keeps climbing though — burns hurt your *strength*, not your *standings*. |
| **Climb again** | Determination | Re-engage the loop with fresh adrenaline |

The loop encourages burnout cycles. In **Personal Mode** (infinite world) the session length is *your choice* — leave whenever the dopamine fades. In **Team Mode** (planned), each match is bounded by stages, so the arc compresses into ~10 min of escalating respawn pain.

Players who play perfectly rarely burn out and feel like gods. Players who play recklessly burn out 5 times in a row and feel the comedy of dev life.

## What we are NOT

- ❌ A 3D shooter — explicitly pivoted away (see [../plan/3D_MP_PHASES.md](../plan/3D_MP_PHASES.md))
- ❌ A platformer — the platformer prototype was removed (2026-11-25)
- ❌ A deep RPG — no skill trees, no item drops, no inventory
- ❌ A simulator — bugs aren't actual code, PMs aren't actual managers; everything is heightened cartoon
- ❌ Pay-to-win — cosmetics only, never stat boosts

## Three-line tagline

> Smash bugs. Climb the org chart. Burn out before the deadline.
> A hyper-casual love letter to software dev life.
> 90-second rounds. Up to 32 players. Browser-native. Free.

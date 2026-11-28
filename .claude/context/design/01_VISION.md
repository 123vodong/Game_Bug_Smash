# 01 · Vision

## Elevator pitch

**Bug Smash** is a browser-first game about software developers battling bugs. It includes a single-player campaign, a persistent free-for-all Personal Mode, a playable 5v5 office MOBA (Team Mode), and an in-progress top-down Story Mode. Phaser 2D is the default renderer; Three.js is an opt-in visual path, not a separate gameplay mode.

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

The loop encourages burnout cycles in **Personal Mode** (infinite world), where session length is the player's choice. **Team Mode** is a separate 5v5 MOBA match with lanes, champions, items, objectives, and a match end; it does not use Personal Mode's burnout/reset rules.

Players who play perfectly rarely burn out and feel like gods. Players who play recklessly burn out 5 times in a row and feel the comedy of dev life.

## What we are NOT

- ❌ A first- or third-person shooter — an optional Three.js renderer exists, but gameplay remains top-down and the 2D renderer remains the default
- ❌ A platformer — the platformer prototype was removed (2026-11-25)
- ❌ A deep RPG — no skill trees, no item drops, no inventory
- ❌ A simulator — bugs aren't actual code, PMs aren't actual managers; everything is heightened cartoon
- ❌ Pay-to-win — cosmetics only, never stat boosts

## Three-line tagline

> Smash bugs. Defend the build. Beat the deadline.
> An office-comedy game with a persistent arena and a 5v5 MOBA.
> Browser-first. Phaser 2D by default. Free to play.

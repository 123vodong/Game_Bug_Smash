# Game Design Proposal: Preventing Player Boredom Through Gameplay Evolution

## 1. Problem Statement

During early playtesting, the game becomes boring after a short period of time.
The root cause is **not** a lack of content, levels, or enemies, but a lack of **gameplay evolution**.

Currently:
- The core loop remains mostly unchanged across levels.
- Difficulty increases numerically, not mechanically.
- Player actions do not fundamentally change over time.
- Winning or losing does not meaningfully affect how the next level is played.

This document proposes a **layered gameplay evolution system**, where:
- The way the player plays changes over time
- Each set of levels introduces a new core mechanic
- The game feels fresh without requiring massive new assets

---

## 2. Design Goals

1. Prevent boredom by **changing how the game is played**, not just scaling difficulty
2. Introduce **strong player agency** (choices, trade-offs)
3. Keep scope realistic for Phaser.js
4. Allow modular implementation (mechanics can be added gradually)
5. Make the game feel like a parody of real software development

---

## 3. High-Level Gameplay Evolution Plan

The game is divided into **Gameplay Modes**, unlocked progressively.

| Stage | Gameplay Style | Key Change |
|------|----------------|-----------|
| Early Game | Vertical Code Smash | Jump between code lines |
| Mid Game | Horizontal Platformer | Mario-like side scrolling |
| Late Game | Combat + Energy System | Bugs fight back |
| Boss Levels | Objective-Based | Reach destination + defeat boss bug |

Each stage **reuses the same theme (code, bugs, IDE)** but changes player interaction.

---

## 4. Gameplay Mode 1: Vertical Code Line Combat

### Description
The game screen represents a vertical code editor.
Each horizontal lane is a **line of code**.

The player (Developer):
- Moves up/down between lines using jump or arrow keys
- Smashes bugs occupying specific lines
- Must react quickly as bugs move, hide, or multiply

### Core Mechanics
- Vertical movement between lines
- Limited horizontal movement
- Combo system based on consecutive line kills

### Purpose
- Easy to learn
- Immediately communicates the “coding” metaphor
- Ideal for early levels

---

## 5. Gameplay Mode 2: Horizontal Platformer (Mario-like)

### Description
The game expands into a **side-scrolling code workspace**.

The developer:
- Runs left to right across a wide map
- Jumps over syntax errors, broken builds, blockers
- Bugs move toward code blocks and attempt to “consume” them

### Key Mechanics
- Platforming (jump, fall, momentum)
- Bugs destroy code if not stopped in time
- Some bugs flee instead of attack

### Fail Conditions
- Too much code is consumed
- Developer falls into fatal errors
- Energy bar reaches zero (introduced later)

### Purpose
- Major shift in gameplay feel
- Introduces exploration and timing
- Breaks repetition of arena-style combat

---

## 6. Gameplay Mode 3: Developer Energy & Bug Attacks

### Description
Bugs are no longer passive targets.
They can now **attack the developer directly**.

The developer has an **Energy Bar**:
- Represents stamina, focus, or burnout
- Reduced when hit by bugs
- Restored via AI skills, breaks, or checkpoints

### Bug Behaviors
- Melee bugs (direct contact damage)
- Ranged bugs (throw errors, warnings)
- Tank bugs (slow, high damage)

### Fail State
- Energy reaches zero
- Developer becomes exhausted
- Level fails with savage dialogue

### Purpose
- Adds tension
- Forces player to dodge, not just attack
- Introduces risk management

---

## 7. Boss Levels: Destination-Based Victory

### Description
Boss levels are not about clearing all bugs.

Objective:
- Reach the end of the level
- Defeat a **giant boss bug** representing:
  - Legacy System
  - Production Incident
  - Deadline Monster

### Boss Mechanics
- Multi-phase fight
- Changes rules mid-fight
- Forces use of learned mechanics

### Victory Condition
- Boss bug defeated
- Codebase stabilized

---

## 8. AI Skills as Strategic Choices (Not Auto Pickups)

AI skills are presented as **choices**, not random bonuses.

Example:
- Player must choose 1 out of 2–3 AI skills
- Each skill has a benefit and a downside

| AI Skill | Benefit | Trade-off |
|--------|---------|-----------|
| Claude Opus | Auto smash nearby bugs | PM speed increases |
| Sonnet | Movement speed boost | Bugs gain more HP |
| Haiku | One-hit kill chance | Extra bugs spawn |

This creates:
- Player responsibility
- Replayability
- Emergent difficulty

---

## 9. Dialogue as Gameplay Modifier

PM and Developer dialogue is no longer cosmetic.

Dialogue can:
- Trigger temporary buffs/debuffs
- Change bug behavior
- Alter level pacing

Example:
- PM: “Why is this taking so long?”
  - All bugs move faster for 5 seconds
- Dev: “Works on my machine.”
  - PM freezes briefly

Dialogue becomes a **mechanical system**, not just flavor text.

---

## 10. World Gimmicks (Rule-Breaking Levels)

Each world introduces **one rule that breaks expectations**.

Examples:
- Bugs fake their death
- First hit does no damage
- AI skills sometimes backfire
- UI elements lie to the player

This forces players to **relearn the game**, preventing mastery fatigue.

---

## 11. Meta Progression

Between runs, players unlock:
- New AI biases
- Developer personalities
- Dialogue packs
- Difficulty modifiers

Failure still feels meaningful.

---

## 12. Implementation Notes (Phaser.js Friendly)

- Each gameplay mode is a modular state
- Shared assets across modes
- Minimal new art required
- Core systems reusable (movement, collision, AI)

---

## 13. Conclusion

To prevent boredom, the game must:
- Change how players interact, not just what they fight
- Force meaningful decisions
- Surprise the player with rule changes
- Turn jokes and dialogue into mechanics

This proposal focuses on **maximum freshness with controlled scope**.

---

## 14. Next Steps

Possible follow-ups:
- One fully designed level blueprint
- State machine for gameplay modes
- Sample boss fight breakdown
- Phaser.js implementation outline
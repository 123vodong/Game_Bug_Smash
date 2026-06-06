# BUG SMASH: Deadline Hunter

## Project Overview
**BUG SMASH: Deadline Hunter** is a hyper-casual action game built with **Phaser.js**, targeting both **PC (mouse)** and **mobile (touch)** platforms. The player controls a sticky cartoon human who uses a laptop as a weapon to chase and smash bugs before a strict deadline expires.

The game focuses on fast-paced gameplay, humorous developer satire, simple controls, and progressively increasing difficulty.

---

## Target Platforms
- **Web (HTML5)**
  - Desktop: Mouse / Pointer input
  - Mobile: Touch input
- Responsive canvas scaling

---

## Technology Stack
- **Game Engine:** Phaser.js (v3)
- **Language:** JavaScript (ES6)
- **Rendering:** Canvas / WebGL (via Phaser)
- **Assets:** PNG sprites, simple frame-based animations
- **Audio:** Web Audio API (via Phaser)

---

## Core Gameplay

### Player Control
- Player automatically moves toward the pointer (mouse or touch position)
- No manual attack button
- When the player overlaps with a bug, a smash action is triggered automatically

### Smash Logic
- Each smash reduces bug HP by 1
- When HP reaches 0:
  - Bug sprite changes to `bug-dead`
  - Bug is removed after a short delay

### Win / Lose Conditions
- **Win:** All bugs are smashed before the timer reaches zero
- **Lose:** Time runs out while at least one bug is still alive or has escaped

---

## Bug System

### Bug Types
- bug-beetle
- bug-race
- bug-robot
- bug-scarab
- bug-toxic
- bug-hadybug
- bug-null
- bug-dead (visual state only)

### Bug Properties
- HP (increases with difficulty)
- Movement speed
- Evasion behavior (zigzag, panic boost)
- Lifetime (disappears if not smashed in time)

### Bug Behavior
- Bugs always move away from the player
- When the player gets close, bugs may:
  - Accelerate briefly
  - Change direction randomly
- If a bug disappears without being killed, it still counts as an unfixed bug

---

## Skill (Power-up & Debuff) System

Skills spawn randomly during gameplay as collectible icons.

### Available Skills

#### Claude Sonnet (Buff)
- Effect: Increase player movement speed (+50%)
- Duration: 5 seconds

#### Claude Opus (Strong Buff)
- Effect: All smashes become one-hit kills
- Duration: 3 seconds
- Rare spawn

#### Claude Haiku (Chaos / Debuff)
- Randomly applies one effect:
  - Reduce player speed
  - Each smash spawns an additional bug

#### Cursor (Utility)
- Effect: Instantly teleport player to the nearest bug

#### GitHub Copilot (Chaos)
- Effect: All remaining bugs spawn immediately
- High risk, high reward

### Skill Rules
- Skills are triggered on pickup
- Skills do not stack unless explicitly designed
- Visual indicators show active effects

---

## Level Design & Difficulty Progression

### General Rules
- Level duration varies depending on difficulty
- Higher levels introduce:
  - More bugs
  - Higher bug HP
  - Faster bug movement
  - More frequent negative skills

### Example Difficulty Curve

#### World 1 – Junior Dev Hell
- Few slow bugs
- Long deadlines
- Mostly positive skills

#### World 2 – Feature Creep
- More bugs per wave
- Introduction of Claude Haiku
- Shorter deadlines

#### World 3 – Legacy Codebase
- High-HP bugs
- Complex movement patterns
- Visually noisy background

#### World 4 – AI-Assisted Chaos
- Frequent skill spawns
- Buffs and debuffs mixed
- High-pressure gameplay

### Endless Mode (Optional)
- Infinite bug waves
- Deadline gradually shortens
- Score-based leaderboard

---

## Background & Visual Style

### Background
- Styled like Visual Studio Code
- Animated scrolling C source code
- Theme changes slightly with difficulty

### Visual Effects
- Screen shake on smash
- Glow effects for buffs
- Red flash and glitch effects on failure

---

## UI / HUD
- Countdown timer (Deadline)
- Remaining bug counter
- Active skill icons with timers
- Pause and restart controls

---

## Audio Design
- Smash sound effects
- UI feedback sounds
- Failure sounds:
  - Slack notifications
  - Phone ringing
  - Angry boss voice lines (optional)

---

## Failure (Bad Ending)

### Trigger
- Deadline reaches zero while bugs remain

### Presentation
- Screen turns red
- Bugs swarm the screen
- Error messages overlay the background

### Random Failure Messages
- "CUSTOMER IS ANGRY"
- "WHY IS THIS NOT FIXED?"
- "8PM EMERGENCY MEETING"
- "BUG STILL OPEN"

---

## Development Milestones

1. Core movement and collision system
2. Bug AI and lifecycle
3. Timer and win/lose logic
4. Skill system implementation
5. Level configuration system (JSON-driven)
6. UI and visual polish
7. Audio integration
8. Balancing and difficulty tuning

---

## Design Goals
- Extremely simple controls
- Fast restart loop
- High readability on both PC and mobile
- Humor that resonates with developers
- Data-driven design for easy iteration

---

## Out of Scope (Initial Version)
- Multiplayer
- Account system
- Cloud save
- Monetization

---

## Notes
This document is intended to be used as a **single source of truth** for AI-assisted development (e.g. Claude) and human iteration.


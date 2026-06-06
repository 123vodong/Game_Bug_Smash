
# Stickyman Growth & Regression System Proposal

## Overview

This document proposes a **Stickyman Progression System** that applies to the multiplayer 3D version of *Hate the World*.  
The system adds **risk–reward tension**, player hierarchy, and emotional swings by allowing characters to **grow stronger by smashing bugs**, but also **lose all progress when defeated**.

The feature behaves **differently in Single Player and Team Player modes**.

---

## 1. Stickyman Level Tiers

Stickyman grows in **size, power, and presence** based on the number of bugs smashed.

| Level | Title | Visual Size | Damage | Energy |
|------|------|------------|--------|--------|
| Lv1 | Intern | Small | Low | Low |
| Lv2 | Fresher | Slightly bigger | Low+ | Medium |
| Lv3 | Junior | Medium | Medium | Medium+ |
| Lv4 | Middle | Large | High | High |
| Lv5 | Senior | Bigger | Very High | Very High |
| Lv6 | Super Senior | Giant | Extreme | Max |

### Visual Changes
- Body size increases
- Laptop becomes more complex / worn
- Aura or debug glow at high levels

---

## 2. Growth Mechanics

- Stickyman gains experience by:
  - Smashing bugs
  - Combo kills
  - Defeating other stickymen (PvP)

- Level-up is **instant and visible**
- Growth encourages aggressive play and risk-taking

---

## 3. Energy & Laptop Breakdown

- Each stickyman has an **Energy Bar**
- Attacks, smashing, and skills consume energy

### Laptop Broken State
Triggered when:
- Energy reaches zero
- Sustains heavy PvP damage

**Effects**
- Laptop is broken
- Stickyman enters *Fixing Laptop* state
- Cannot:
  - Smash bugs
  - Attack players
  - Use skills

**Can**
- Move
- Jump
- Dodge

**Recovery**
- Laptop auto-fixes after a cooldown
- Optional faster recovery via safe zones

---

## 4. Level Reset on Defeat

When a stickyman is defeated:
- Stickyman **resets to Intern level**
- All growth benefits are lost
- This applies to **both Single and Team modes**

---

## 5. Bug Release on Defeat (Single Player Only)

### Single Player Mode
- When a stickyman is defeated:
  - A number of bugs are **released from the character**
  - Bugs scatter into the map
  - Bugs immediately become active enemies

This mechanic **does NOT apply to Team Player mode**.

---

## 6. Mode-Specific Rules

### Single Player Mode
- Growth enabled
- Bug release enabled
- Infinite loop gameplay
- No level structure changes

### Team Player Mode
- Growth enabled
- No bug release
- Team-based scoring
- Anti-snowball balancing

---

## 7. Gameplay Impact

- Encourages risk-taking
- Creates dramatic reversals
- Prevents permanent dominance
- Makes PvP meaningful

---

## 8. Visual Metaphors

| Mechanic | Metaphor |
|--------|----------|
| Growth | Ego & responsibility |
| Laptop break | Burnout |
| Reset | Career setback |
| Bug release | Technical debt |

---

## 9. Balancing Notes

- Growth curve should be exponential
- Super Senior is powerful but fragile
- Cooldown tuning is critical

---

## 10. Implementation Notes (for Claude)

- Server-authoritative player stats
- Sync growth state across clients
- Mode-conditional bug spawning

---

*Designed to integrate with the Multiplayer 3D Proposal.*

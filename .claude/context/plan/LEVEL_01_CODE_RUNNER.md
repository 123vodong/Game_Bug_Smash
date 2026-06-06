# Level 01 – “Works on My Machine”

**Gameplay Mode:** Horizontal Platformer (Code Runner Mode)  
**Theme:** Developer trapped inside a collapsing codebase  
**Difficulty:** Easy → Medium  
**Estimated Playtime:** 3–5 minutes  
**Target Platforms:** PC + Mobile (touch buttons mapped to movement / jump / attack)

---

## 1. Narrative Context

**PM:** “It’s just a small change.”  
**Dev:** “Sure. Let me run it.”

The developer is pulled into a giant code editor workspace where bugs begin consuming the code itself.

---

## 2. Level Design Goals

- Teach horizontal platformer controls
- Introduce code-as-platform metaphor
- Introduce bug behaviors (non-combat first)
- Introduce Energy (Burnout) system
- Keep early gameplay forgiving but engaging

---

## 3. Macro Level Layout

```
[Spawn] -> [Intro Platforms] -> [Bug Consumer Zone] -> [Legacy Vertical Section]
-> [Hunter Bug Encounter] -> [Checkpoint Commit] -> [Async Moving Platforms]
-> [Mini Boss Arena] -> [Exit Gate]
```

Camera scrolls **left → right only**.

---

## 4. Section-by-Section Breakdown

### Section 1: Spawn – “Clean Code”
Safe flat Stable Code platforms, no enemies.

### Section 2: Bug Consumer Zone
Consumer bug eats platform unless destroyed.

### Section 3: Legacy Vertical Section
Crumbling platforms forcing vertical movement.

### Section 4: Hunter Bug Encounter
Chasing enemy introduces combat pressure.

### Section 5: Checkpoint – “git commit”
Saves progress and restores energy.

### Section 6: Async Moving Platforms
Timing-based moving platforms.

### Section 7: Mini Boss – “The Warning Bug”
Large bug with projectiles, 3-hit defeat.

### Section 8: Exit – “Build Success”
End gate shaped like Run button.

---

## 5. Platform Types & Visual Metaphors

- **Stable Code:** Clean, blue/green syntax, never collapses  
- **Legacy Code:** Yellow, deprecated, collapses after delay  
- **Bug-Eaten Code:** Red corruption, shrinks over time  
- **Moving Code:** Sliding async logic

---

## 6. Implementation Notes

Designed for Phaser.js using physics groups, state machines, and camera bounds.

---

**End of Level 01 Design**

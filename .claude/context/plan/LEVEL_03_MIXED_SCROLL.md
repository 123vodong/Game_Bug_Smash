# Level 03 – “Merge Conflict”

**Gameplay Mode:** Mixed Horizontal + Vertical Platformer  
**Scroll Direction:** Horizontal → Vertical → Horizontal  
**Theme:** Navigating a broken merge where code paths conflict  
**Difficulty:** Medium → Hard  
**Estimated Playtime:** 5–7 minutes  
**Target Platforms:** PC + Mobile

---

## 1. Narrative Context

**PM:** “Why does this only break after merging?”  
**Dev:** “Because both branches were wrong.”

The developer enters a codebase split into conflicting paths that require constant adaptation.

---

## 2. Level Design Goals

- Combine horizontal and vertical gameplay
- Force player adaptability
- Introduce scroll-rule switching
- Prevent muscle-memory dominance
- Escalate challenge without stat inflation

---

## 3. Core Mechanic: Scroll Mode Switching

The level dynamically switches scrolling behavior.

| Mode | Description |
|----|----|
| Horizontal | Camera follows X-axis |
| Vertical | Camera follows Y-axis |
| Locked | Arena-style camera |

Transitions are visually signaled and eased.

---

## 4. Macro Level Layout

```
[Spawn – Horizontal]
 → [Consumer Bug Run]
 → [Vertical Shaft]
 ↑ [Legacy Climb]
 → [Checkpoint]
 → [Horizontal Chase]
 → [Mixed Hazard Zone]
 ↑ [Boss Arena]
 → [Exit]
```

---

## 5. Section Breakdown

### Section 1: Spawn – Branch A
Clean horizontal platforms, no enemies.

### Section 2: Consumer Bug Run
Platforms decay behind the player.

### Section 3: Vertical Shaft
Upward climb with shrinking platforms.

### Section 4: Legacy Platform Climb
Tight vertical precision section.

### Section 5: Checkpoint – git merge
Save + energy restore.

### Section 6: Horizontal Chase
High-speed run with Hunter Bugs.

### Section 7: Mixed Hazard Zone
Horizontal travel with vertical detours.

### Section 8: Boss – The Merge Bug
Two-phase boss: horizontal then vertical.

### Section 9: Exit – Resolved
Unified clean code visuals.

---

## 6. Platform Types Used

- Stable Code
- Legacy Code
- Bug-Eaten Code
- Moving Code
- Hybrid Platforms

---

## 7. Implementation Notes (Phaser.js)

- Camera state machine
- Smooth camera interpolation
- Shared hazard systems
- Boss-driven camera locks

---

**End of Level 03 Design**

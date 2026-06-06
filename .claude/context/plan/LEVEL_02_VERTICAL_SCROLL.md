# Level 02 – “Climbing the Stack Trace”

**Gameplay Mode:** Vertical Platformer (Code Tower Mode)  
**Scroll Direction:** Bottom → Top  
**Theme:** Escaping a deep call stack before everything crashes  
**Difficulty:** Medium  
**Estimated Playtime:** 4–6 minutes  
**Target Platforms:** PC + Mobile

---

## 1. Narrative Context

**PM:** “Why is the stack trace so long?”  
**Dev:** “Because the bug is… deep.”

The developer falls into the bottom of a massive call stack and must climb upward before the system crashes.

---

## 2. Level Design Goals

- Introduce vertical auto-scrolling gameplay
- Force constant upward movement
- Add environmental pressure (rising failure)
- Expand bug and platform interactions
- Increase tension without stat inflation

---

## 3. Core Mechanic: Rising Failure Pressure

A rising danger zone moves upward from the bottom of the screen.

Metaphors:
- Stack overflow flood
- Red error fog
- Log spam tsunami

**Rule:**  
Touching the zone drains Energy rapidly.

---

## 4. Macro Level Layout

```
[Bottom Spawn]
 → [Warm-Up Platforms]
 → [Consumer Bug Layer]
 → [Legacy Shaft]
 → [Hunter Bug Crossfire]
 → [Checkpoint Commit]
 → [Vertical Moving Platforms]
 → [Collapse Section]
 → [Boss Arena]
 → [Exit]
```

Camera scrolls upward with limited downward movement.

---

## 5. Section Breakdown

### Section 1: Entry Point
Safe platforms, slow rising danger.

### Section 2: Warm-Up Platforms
Alternating left/right jumps.

### Section 3: Consumer Bug Layer
Bugs eat platforms over time.

### Section 4: Legacy Shaft
Narrow vertical shaft with collapsing platforms.

### Section 5: Hunter Bug Crossfire
Bugs jump horizontally across screen.

### Section 6: Checkpoint – git stash
Save + energy restore.

### Section 7: Vertical Moving Platforms
Elevator-like async platforms.

### Section 8: Collapse Section
Platforms collapse instantly after landing.

### Section 9: Boss – Stack Guardian
Wall-mounted bug, vertical attacks, 3-hit defeat.

### Section 10: Exit – return SUCCESS
Clean code, calm visuals.

---

## 6. Platform Types (Vertical Emphasis)

- **Stable Code:** Safe, blue/green
- **Legacy Code:** Yellow, collapses quickly
- **Bug-Eaten Code:** Shrinks over time
- **Moving Code:** Vertical elevators
- **Emergency Platforms:** Temporary, flickering

---

## 7. Difficulty Scaling

- Faster rising danger
- Narrower gaps
- Combined bug behaviors

---

## 8. Implementation Notes (Phaser.js)

- Camera follow on Y-axis
- Rising hazard as physics zone
- Platform pooling for performance
- Boss arena locks camera bounds

---

**End of Level 02 Design**

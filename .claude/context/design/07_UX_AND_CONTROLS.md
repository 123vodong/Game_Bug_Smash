# 07 · UX & Controls

How players touch the game — both the *design intent* (why we picked these schemes, what tradeoffs we accept) and the *canonical key bindings* (which key does what in each scene).

---

## Control philosophy

> **The player should never have to think about how to do something — only what to do.**

- Keyboard for desktop, touch for mobile, click for either. All three should feel native to their device, not the same scheme awkwardly mapped.
- **No more than 6 active inputs at once.** Anything beyond that = put it in a menu, not a hotkey.
- **Movement is always available.** Even during attacks, even during broken state.

---

## Multiplayer arena — control matrix

**MOBA-style binding** (2026-05-31): SMASH on SPACE, skills on Q/W/E/R. Mobile uses a **fan layout** (SMASH in the corner, 4 skills on a 90° arc above-left).

| Input | Desktop | Mobile |
|---|---|---|
| Move | Arrow keys / WASD, or left-click target | Virtual joystick (left half) |
| Smash (basic, free) | SPACE, or click bug | Big yellow **SMASH** button in bottom-right corner |
| Q Dash | Q | DASH button (left of SMASH) |
| W Shield | W | SHIELD button (upper-left of SMASH) |
| E Jump | E | JUMP button (above-left of SMASH) |
| R Ult | R | ULT button (directly above SMASH) |
| Cancel pursuit | Any arrow key | Touch joystick |
| Chat (Personal Mode) | ENTER to open/send, ESC to cancel | 💬 button (right edge, mid-height) |
| Quit | ESC | (planned: back button) |

### Input priority order in update loop

1. **Arrow keys** — always wins. Pressing an arrow cancels any click target or joystick.
2. **Joystick** (touch only) — when actively pushed (not just touched), overrides clicks.
3. **Click target** (chase + auto-attack a bug or follow a player).
4. **Click ground** (walk-to-point).

This hierarchy avoids the "I'm pressing arrow and nothing happens" failure mode that killed earlier iterations.

---

## Click resolution

Left-click on the play field branches by **what's under the cursor**:

```
                 ┌────── click within 44 px of bug ─────► CHASE + auto-smash bug
                 │
left-click ──────┼────── click within 44 px of player ──► CHASE + auto-smash player (PvP)
                 │
                 └────── empty ground ─────────────────► walk-to-point
```

- **Tolerance 44 px** so the player doesn't need pixel-perfect aim
- Drag (LMB held) updates the ground walk-to-point at 30 Hz, **but** is ignored while chasing a target (no accidental cancel)
- 🔵 Holding right-click for an instant "move there" override (LoL convention) — not implemented; revisit if requested

### Selection ring

- Pooled colored circle that follows the targeted entity
- **Red** for bug, **Yellow** for player
- Pulses (scale + alpha) for "live lock-on" feel
- Auto-hides when target dies, hides, leaves, or the player overrides with arrow/joystick/ground-click

---

## HUD layout

```
┌─────────────────────────────────────────────────────────────────┐
│ [MINIMAP]                  [ROUND TIMER]            [LEADERBOARD]│
│                            Round 3 · 87s                         │
│  status: connected         smash bugs                            │
│                                                                  │
│                                                                  │
│                                                                  │
│  COMBO ×4                                       -12  ╲  (dmg num) │
│   ×1.5                                          ULT(R)  SMASH     │
│                                              SHIELD(W) ╱  (fan)   │
│                                               JUMP(E) DASH(Q)     │
│        Lv4 · Middle                                              │
│  ████████████████░░░░  (health + energy bars)                    │
│  move = arrows / click | SPACE smash · Q dash · W shield · E roll · R ult │
└─────────────────────────────────────────────────────────────────┘
```

Pinned regions (`scrollFactor 0`):
- **Top-left** — Minimap (always), then connection status under it
- **Top-center** — Mode indicator. Personal Mode shows `∞` + `PERSONAL MODE · N online`. Team Mode (future) will show a round/stage countdown.
- **Top-right** — Leaderboard, sorted by score, showing Lv + title
- **Mid-left** — Combo HUD (only visible when combo > 0)
- **Bottom-left** — Control hint
- **Bottom-center** — Local energy bar (fat, 280 px) + Lv+Title badge above it
- **Bottom-right** — Action buttons in MOBA **fan** layout: big yellow SMASH (40 px radius) in the corner; 4 skill buttons (28 px) on a 90° arc, 130 px arc distance, at angles 180°/210°/240°/270° → DASH (Q), SHIELD (W), JUMP (E), ULT (R)

### Office Chaos additions (2026-11-06) — [MPOverlay.js](../../../src/ui/MPOverlay.js), [MPBossView.js](../../../src/entities/MPBossView.js)

- **Kill feed** — left, under the minimap status line: 6 lines, 9 s each; lines involving you get a gold highlight.
- **Center banners** — streaks, shutdowns, bounties, event starts, boss results; queued one at a time (max 3 waiting).
- **Event HUD** — top-center under the mode text: event title + countdown bar; the screen edges tint in the event's color.
- **Boss bar** — 440 px HP bar under the event HUD while THE DEADLINE is out ("ENRAGED" in phase 2); red slam circles fill up on the ground before they land.
- **Objective arrow** — screen-edge arrow + distance to the off-screen boss or golden bug.
- **Toasts** — bottom-center, above the bars: promotions, daily mission done, hat unlocked, who broke your laptop.
- **Tips** — first two sessions only: six onboarding hints, one every 9 s.
- **Leaderboard** — top 8 + your rank, 👑 crown + bounty, 🤖 bot tag, 💻✖ while broken. Mode text: "N online · M AI coworkers".
- **Above heads** — hat emoji sits on the head (label stack shifts up), 👑 floats over the Tech Lead, spawn protection blinks.
- **Join box** — name + hat picker (◀ ▶ / arrow keys; locked hats show their unlock goal).

### Above each character (in world space, scales with sprite)

```
                  🔧 FIXING        (only when broken)
                    8.0s
                  ─────────         (energy bar)
                  Lv4 · Middle      (title in player color)
                  Dev-1928          (player name)
                  
                  ╱──────╲
                  │ HEAD │
                  ╲──────╱
                     │
                  (sprite scale based on level)
                     │
                  ╱─────╲
                  │ FEET │           (colored ring + shadow)
                  ╲─────╱
                  (aura at Lv5+)
```

All elements anchor to **head** or **feet** with scaled offsets so they stay positioned correctly as the sprite grows.

### Floating damage numbers (MOBA-style)

Every hit spawns a rising, fading damage number at the victim's position (`_spawnDamageNumber` in [MultiPlayScene.js](../../../src/scenes/MultiPlayScene.js)). The amount is derived client-side from the synced HP/health delta, so it always matches what the server actually applied — no extra network field.

| Source | Color | Size | Notes |
|---|---|---|---|
| Damage to a **bug** | white | 20–26 px (bigger ≥ 30 dmg) | the core attack feedback |
| Damage to an **enemy player** | gold | 24 px | PvP hits |
| Damage **you take** | red | 30 px | most prominent — your survival cue |

- Pops in (`Back.easeOut` scale), drifts up ~48 px and fades over ~0.7 s, with small horizontal jitter so stacked hits don't perfectly overlap.
- **Culled when off-screen** (80 px margin around the camera view) so a crowded arena never spawns hundreds of invisible text objects.
- Depth 40 — above sprites, below the pinned HUD.

### Chat (Personal Mode, MOBA-style)

Server broadcasts each message to the whole room (`onMessage('chat')` in [ArenaRoom.js](../../../server/rooms/ArenaRoom.js)), sanitized (newlines stripped, ≤ 140 chars) and rate-limited (~1.6 msg/s). The server also keeps a **30-message buffer**; a freshly-joined client sends `getChatHistory` once its handlers are wired and receives the recent conversation (`chatHistory`) — so **late joiners see the chat so far**. (Buffer is in-memory per room, not schema/DB — it survives joins but not a server restart.) Client UI in `_buildChat` / `_openChat` / `_closeChat`.

- **Input:** a native DOM `<input>` on **all** platforms (so IME / Unikey-VietKey Telex-VNI and Vietnamese diacritics work, and the phone soft keyboard appears). **ENTER** opens it (or tap the 💬 button), **ENTER** sends, **ESC**/blur cancels. While open, Phaser's keyboard is disabled **and its key captures cleared** — otherwise it `preventDefault`s SPACE/arrows so they never reach the input.
- **Right-side column** (clear of the bottom-left mobile joystick), top → bottom: **log** (stacks upward) · **input** (just above the button) · **💬 button** (~62% height). The input is mapped through the canvas rect so it lines up under scaling/letterboxing.
- **Log:** right-aligned, **no box** — just translucent text (~0.55 alpha) over the game, **persistent** (no auto-fade). Keeps a **60-message history buffer** but shows a **6-line window**; scroll up to read older messages via **mouse wheel** (over the log region) or **drag** (touch). `▲ older` / `newer ▼` hints show when there's more out of view; a new message keeps your scroll position if you're reading history. **Your** lines are gold, **others'** are cyan.
- **Game keeps running while typing** — only the keyboard is captured; mouse movement and auto-attacks continue (LoL convention). Skills (SPACE/Q/W/E/R) and arrow movement are suppressed until the input closes.

---

## Mobile considerations

### Virtual joystick (left half)

- **Floating** — appears wherever you first touch on the left half of the screen
- **Knob radius 26 px**, base radius 56 px
- **Dead zone**: 20% of base radius (tiny touches don't drift movement)
- Releases set `_stickDir = null`; doesn't override clicks while at zero
- Only built on actual touch devices (detected via `pointerType === 'touch'` on first event)

### Action button fan (bottom-right corner)

- **SMASH** (basic free attack) — 40 px radius, anchored at corner. Yellow stroke. Biggest button = most-used action.
- **4 skill buttons** (28 px radius) on a 90° arc above-left of SMASH:
  - DASH (Q · 10 energy) at 180° — directly left
  - SHIELD (W · 15) at 210° — lower-left of arc
  - JUMP (E · 8) at 240° — upper-left of arc
  - ULT (R · 25) at 270° — directly above
- Arc distance 130 px from SMASH center → ~67 px chord between adjacent skill buttons, ~11 px gap each
- Color-coded per action (yellow / cyan / purple / green / pink)
- Key hint label below each (`SPC`, `Q · 10`, etc.)
- Skill buttons dim when player can't afford the energy cost
- Touch + click both work; press tween (0.9 scale × 80ms yoyo) on tap

### Mobile fullscreen + landscape lock

Touch devices show a **"▶ TAP TO PLAY"** splash on first load. Tap → enters fullscreen + attempts `screen.orientation.lock('landscape')`. Android Chrome/Firefox honor the lock; iOS Safari refuses silently but the **portrait-detection overlay** ("📱 Rotate your phone") still appears whenever orientation flips back to portrait.

### Things to watch on mobile

- **Joystick anchor drift** — if the player drags their thumb off the joystick area, knob can lag the touch. Acceptable for now.
- **Action buttons too small** on phones with narrow screens. May need responsive sizing.
- **Camera zoom** — at 1280×720 viewport on a 5-inch phone, characters feel small. Consider mobile-only camera zoom-in (e.g. 1.4×).

---

## Single-player controls

Different scheme — uses pointer-follow, not click-to-move:

| Input | Action |
|---|---|
| Pointer (mouse / touch) | Continuously move toward cursor |
| Click + hold | Smash bugs you overlap |
| H | Help / skills guide |
| P | Pause |
| M | Mute |
| R | Restart current level |
| ESC | Back to menu |

🔵 **Design intent:** consider unifying SP and MP to the same scheme once MP is stable. The split exists because SP shipped first; not a permanent design choice.

---

## Edge cases handled

- **Rapid clicking** — move-target marker is **pooled** (one shared graphics object), so clicking 100×/sec doesn't allocate
- **Pointer drift while attacking** — chase ignores `pointermove` while a target is locked
- **Stuck in chase boundary** — chase "hugs" at 28 px instead of stopping at 56, so fleeing bugs stay inside the cone
- **Dead/hidden target** — `_resolveAttackTargetPos` clears the target automatically; ring hides
- **Touch laptop with mouse** — joystick filters on `pointerType === 'touch'` so mouse clicks pass through

---

## Things to watch in playtest

- Joystick still feels alright on a 6.7" phone — confirm
- Action button layout — should jump/kick be left-thumb or right-thumb? Currently right.
- Q/W/E/R vs J/K/L muscle memory — we settled on LoL-style. Some MOBA-style is desired; consider configurable.
- Click-to-move drag — does the drag cancel feel intuitive when you want to micro-adjust? Tune throttle (currently 30 Hz).

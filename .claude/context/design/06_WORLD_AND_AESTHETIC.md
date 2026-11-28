# 06 · World & Aesthetic

Current character, icon, and VFX quality is not production-approved. The Pixel SVG pilot was
rejected; choose an artist/specialist service and approve a visual target before expanding assets.
See [ART_QUALITY_PASS.md](../tasks/ART_QUALITY_PASS.md).

The look, sound, and feel of the play space.

---

## World layout — multiplayer arena

### Dimensions

- **6000 × 3375 px** (16:9). 2.25× the screen area you see at any moment.
- The HTML canvas is **1280 × 720** — a viewport into the larger world.
- Camera follows the local player with a 100 px deadzone (smooth, not jittery).

### Floor (2026-05-31 redesign)

- **Dark navy base** (`#0a0e16`) covers the full 6000 × 3375 world
- **Gutter bars** — narrow dark strips (`#0e1420`, 56 px wide) along the left + right world edges, with tiny tick marks every 18 px (line-number gutters from a code editor)
- **Real code text floor** — Phaser Text objects tiled in 720 × 760 chunks across the world, rendering a hand-written fake JavaScript source file in **monospace `Consolas`** at 14 px, soft blue-gray `#5d7090`, **18% alpha**. Recognizable patterns (`import { Room } from 'colyseus'`, `_applyHit(sessionId, p, bugId, bug)`, etc.) — looks like an open IDE
- **Cyan arena border** (4 px stroke)

Result: the world feels like you're playing on top of someone's editor, with code visible underfoot but faint enough that bugs/players/skill VFX always dominate.

### Map obstacles — destructible code-snippet bug nests

Added 2026-05-31. ~22 initial, dynamic respawn maintains ~26 at all times.

- Each obstacle is **floating real code text** (NO panel, no border) — picked deterministically from a 57-snippet pool of hand-written satirical JS/Python/C/Rust/Go/SQL/Bash/CSS jokes
- Tokens individually colored using VS Code dark-theme syntax palette (keyword blue `#569cd6`, function yellow `#dcdcaa`, type teal `#4ec9b0`, string orange `#ce9178`, comment green `#6a9955`, etc.)
- See [02_CORE_MECHANICS § Map obstacles](./02_CORE_MECHANICS.md#map-obstacles--destructible-code-snippet-bug-nests) for collision rules + destruction logic
- See [09_BALANCE § Obstacles](./09_BALANCE.md#obstacles--destructible-code-snippet-bug-nests-2026-05-31) for HP/eat-rate constants

### Minimap

- Top-left corner, 200 × ~113 px (16:9 of world)
- Pink dots = bugs (faded if hidden)
- Colored dots = players (yours larger, white-ringed)
- White rectangle outline = your camera viewport
- Always visible; HUD-pinned (`scrollFactor 0`)

---

## World layout — single-player

- Fixed `1280 × 720` canvas, no scrolling camera
- Background = full VS Code workspace render (`assets/background/image.png`), darkened 42% so bugs read on top
- 12 hand-tuned levels via [src/data/levels.js](../../../src/data/levels.js)

---

## Art direction

### Style label
**"Office Doodle"** — flat-colored line-art stickmen + slightly-shaded cartoon bugs over moody dark-grid backgrounds. Like a developer's notebook scribbles brought to life.

### Color palette

| Role | Hex | Where |
|---|---|---|
| Background dark | `#0a0e16` | World floor base |
| Background tile alt | `#121826` | Checker square |
| Grid lines | `#1f2a3d` | World grid |
| Arena border | `#39c2ff` | World edge stroke |
| Stickman fill | `#fcd9b6` (skin), `#2c1810` (hair) | Head + body |
| Stickman outline | `#1a1a1a` | All body lines |
| Smash accent | `#ffd23f` | Smash text, level badge |
| Combo tier red | `#ff5252` | ×3 combo |
| Combo tier orange | `#ff9800` | ×2 combo |
| Combo tier yellow | `#ffd23f` | ×1.5 combo |
| Energy green | `#7ed957` | Energy bar high |
| Energy yellow | `#ffd23f` | Energy bar mid |
| Energy red | `#ff5252` | Energy bar low |
| Selection bug | `#ff6b6b` | Red lock-on ring |
| Selection player | `#ffd23f` | Yellow lock-on ring |
| Move ping | `#7ec8ff` | Cyan click marker |

### Visual hierarchy

The reader's eye should land in this order on any frame:
1. **Your stickman** (center of camera + breathing bob + drop shadow)
2. **Bugs near you** (saturated colors, ground shadows)
3. **HUD** (top center timer, top-left minimap, bottom-right action buttons)
4. **Other stickmen** (colored ground rings + nameplate)
5. **Background grid** (intentionally muted)

### Animation principles

- **Squash + stretch** on smash hits (1.18× scale flash, 90 ms yoyo)
- **2-frame run cycle** alternating every 160 ms (not 30-frame skeletal — keep it cartoony)
- **Idle bob** ±1.6 px on a 480 ms sine — gives static stickmen life
- **Spark/burst effects** on level-up, smash kill, laptop break, kick AOE
- **Camera shake** on big events (slow-mo finale in SP)

---

## Audio direction

All audio is **synth-generated at runtime** via WebAudio in [src/core/AudioManager.js](../../../src/core/AudioManager.js) — zero `.mp3`/`.wav` shipped.

### Available SFX

| Function | Used for |
|---|---|
| `smashHit()` | Connecting smash on bug or player |
| `bugKill()` | Bug death confirmation |
| `combo(tier)` | Tier-up chime (3 / 5 / 10 kills) |
| `skillPickup(category)` | Recovery, level-up, skill grab |
| `skillExpire()` | Buff fades, glitch effect |
| `uiClick()` | Whiffed swing, button press |
| `timerTick()` | Last-10s deadline tick (SP) |
| `timerWarning()` | Time threshold (SP) |
| `failure()` | Lose state, laptop break |
| `victory()` | Win state, fanfare |
| `pause()` / `resume()` | Pause toggle |

### Volume / mix

- **Master gain** controlled by AudioManager, persisted via SaveManager (mute survives reloads)
- Tier chimes are pitched higher per tier (×1.5, ×2, ×3) to feel like an ascending scale
- 🔵 **Spatial audio**: bug kills from across the world should be quieter than nearby ones. Not implemented; needs distance-based gain.

### Music

🚫 **No music in v0.** The chip-tune synth budget went to SFX. Could add a low-key looping bassline for MP rounds (procedural via WebAudio) if the silence feels off.

---

## End-game cinematic (SP only)

When the **last bug** in a single-player level dies, a **3.7-second slow-motion finale** plays:

- Time scale drops to 0.25× across 7 phases (zoom → anticipation → windup → slam → impact → aftermath → restore)
- Camera pans + zooms 1.9× on the kill spot
- Giant hero + giant doomed bug spawn briefly (aspect-preserving scale)
- White flash, chromatic-aberration ghosts, 28 code-fragment particles, cyan shockwave
- `FINISHED!` comic stamp pops in, tilted -12°
- Time + camera return to normal, normal win flow continues (confetti, dialog, etc.)

🔵 **Design intent (MP):** a stripped-down version of this could fire when a Super Senior gets broken — a brief "OH" zoom + crash sound. Cheap drama for the moment.

---

## Future ambient ideas (🔵)

- **PA announcement system** — PM voice barks random nags during MP rounds
- **Day/night cycle** — world floor tint shifts every round (morning standup, lunch crash, late-night crunch)
- **Floating debug text** — ghostly `// TODO`, `FIXME`, `0xDEADBEEF` scrolling slowly through the background
- **Bug spawn portals** — a tiny "cracked code" effect at each spawn location before the bug appears

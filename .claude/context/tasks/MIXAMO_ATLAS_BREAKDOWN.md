# Mixamo → Blender → Sprite Atlas — Task Breakdown

**Status (2026-05-31):** Phase C2 in progress — Y Bot character + all 7 animation FBX files downloaded to `assets/mixamo/`. Awaiting Blender render + atlas pack.

Goal: replace the hand-drawn SVG stickman with a rigged 3D character rendered top-down into an 8-direction sprite atlas. Same engine, same MP architecture — just much higher-fidelity character art.

Inspired by the **TankGank** approach: pre-render 3D in Blender, ship 2D sprites at runtime. Mobile-friendly, scales to many players, looks polished.

---

## Why this approach

| Approach | Cost | Visual ceiling | Mobile perf |
|---|---|---|---|
| Stay with SVG poses | low | low | great |
| Hand-drawn multi-frame SVGs | medium | medium | great |
| **Mixamo→Blender→atlas** | medium | **high** | great |
| Real 3D engine (Babylon) | very high | highest | risky |

Pre-rendered atlas gets us 90% of the 3D look at 30% of the engineering cost. The art happens once, ahead of time. Runtime is still just `sprite.setFrame()`.

---

## Phase C1 — scaffolding (this session) ✅

What landed:

- [x] **Atlas-aware player render** in [src/scenes/MultiPlayScene.js](../../../src/scenes/MultiPlayScene.js)
  - If `assets/characters/atlas/devstick.json` + PNG exist → use atlas frames
  - Else → fall back to existing SVG textures (current behavior preserved)
- [x] **Animation key convention** documented (see below)
- [x] **Direction selection** — facing angle → one of 8 cardinal slots (N/NE/E/SE/S/SW/W/NW)
- [x] **Frame index by action+state** — uniform structure so the source doesn't matter
- [x] **Blender render script** at [tools/blender_atlas_render.py](../../../tools/blender_atlas_render.py)
- [x] **This breakdown** + Mixamo step-by-step

What you'll do (Phase C2):

- [ ] Pick a free Mixamo character + 8 animations
- [ ] Run the Blender script to render 8 directions × frames-per-anim
- [ ] Pack the PNGs into a Phaser-compatible atlas with **Free Texture Packer** (free GUI tool)
- [ ] Drop atlas files into `assets/characters/atlas/`
- [ ] Reload the game — character upgrade is live

---

## Asset naming convention

Each rendered frame is named:

```
{action}_{dir}_{frame}.png
```

- `action`: `idle | run | smash | punch | kick | jump | parry | hit`
- `dir`: `n | ne | e | se | s | sw | w | nw` (8 cardinal directions, 45° apart)
- `frame`: 4-digit zero-padded index, e.g. `0001`

Example: `run_e_0007.png` = 7th frame of run-east cycle.

Frame counts per action (recommended):

| Action | Frames | Looping? | Notes |
|---|---|---|---|
| idle | 12 | yes | gentle breathing loop |
| run | 16 | yes | full run cycle |
| smash | 10 | no | anticipation→impact→recovery |
| punch | 8 | no | wind-up→strike→recovery |
| kick | 14 | no | spin kick (rotates so all 8 dirs look similar) |
| jump | 12 | no | takeoff→peak→land |
| parry | 8 | no, then loops | shield pose then static hold |
| hit | 6 | no | knockback react |

Total frames: 12+16+10+8+14+12+8+6 = **86 frames** × 8 directions = **688 PNGs**, packed into a single atlas (~2-4 MB depending on resolution).

Recommended render resolution: **128 × 192 px** per frame (tall portrait, ~1.5× aspect). Atlas final size: ~2048 × 2048.

---

## Mixamo + Blender workflow (Phase C2)

### A. Get the character + animations from Mixamo (15 min)

1. Go to https://www.mixamo.com (Adobe ID required — free signup).
2. Browse the **Characters** library. Recommended: pick a clean-silhouette character that reads well at 128 px (avoid heavy ornaments). `Y Bot` is the classic blocky white robot — good for testing. Anything stylized works.
3. Add to scene → **Download** as **FBX for Unity (.fbx)** → 30 fps → with skin. Save as `devstick.fbx`.
4. Now browse **Animations**. For each animation in the table above:
   - Search by name (e.g. "idle", "running", "punching", "jumping")
   - Select an animation that loops/plays well
   - Confirm "In Place" is checked (no root motion — we don't want the character drifting)
   - Download as **FBX for Unity (.fbx)** → 30 fps → "Without Skin" (we only need the animation curves)
5. Save into `assets/mixamo/`:
   - `idle.fbx` (search **Standing Texting** — laptop pose)
   - `run.fbx` (search **Running**)
   - `smash.fbx` (search **Great Sword Slash** / **Downward Swing**)
   - `punch.fbx` (search **Punching** — maps to Q Dash)
   - `parry.fbx` (search **Block** / **Shield Block** — W Shield + recovery pose)
   - `jump.fbx` (search **Diving Roll** / **Roll Forward** — maps to E Roll, NOT vertical jump)
   - `kick.fbx` (search **Spin Kick** / **Roundhouse Kick** — maps to R Ult AOE)
   - ~~`hit.fbx`~~ — **dropped from list**, no `hit` action in current code (broken state reuses parry pose)

If you only want to test the pipeline first, **just download idle.fbx + run.fbx + smash.fbx** — the script renders whatever you have.

### B. Install Blender (one time, 5 min)

- Download from https://www.blender.org/download/ (any 3.x or 4.x version works)
- Default install settings are fine

### C. Run the render script (15-30 min depending on hardware)

1. Open Blender
2. **File → New → General**
3. Delete the default cube, camera, light (`A` to select all, `X` to delete)
4. **Scripting tab** (top)
5. Open [tools/blender_atlas_render.py](../../../tools/blender_atlas_render.py)
6. At the top of the script, set the paths:
   ```python
   CHAR_FBX = r'C:\path\to\devstick.fbx'
   ANIM_DIR = r'C:\path\to\mixamo_anims'
   OUT_DIR  = r'C:\path\to\Game_Bug_Smasher\tools\atlas_raw'
   ```
7. Click **Run Script**
8. Blender will render every (action × direction × frame) combo to PNGs. Console shows progress.

Render time estimate: **~15 min on a modern PC**, longer on integrated graphics.

### D. Pack the PNGs into an atlas (5 min)

1. Download **Free Texture Packer** from http://free-tex-packer.com (free, runs on Windows/Mac/Linux)
2. Drag the `atlas_raw/` folder into the app
3. Set **Output format**: `Phaser (JSONHash)` — Phaser's preferred format
4. Set **Padding**: 2 px (avoids bleed)
5. Set **Trim mode**: trim transparent pixels
6. Click **Export**
7. You get two files:
   - `devstick.png` (the atlas image)
   - `devstick.json` (frame coordinates)
8. Save both to `assets/characters/atlas/`

### E. Reload the game

That's it. The client auto-detects the atlas on next load.

---

## Free alternative (skip Blender entirely)

If you don't want to do the Mixamo + Blender steps, use a pre-rendered CC0 pack:

- **Kenney's Toon Characters 1** — https://kenney.nl/assets (free, well-made)
- **Quaternius Ultimate RPG Pack** — https://quaternius.com (CC0)
- **itch.io topdown character packs** — many free options

These are pre-baked PNG sprites — just need atlas-packing (skip steps A-C above, jump to D).

---

## Phase C2 hand-off — what I need from you

When you've completed steps A-D above, give me these two files:

- `assets/characters/atlas/devstick.png`
- `assets/characters/atlas/devstick.json`

I'll:
1. Verify the frame names match the convention
2. Tune the directional facing logic if needed
3. Add any missing animation states with fallbacks
4. Wire kick rotation logic so AOE kick looks coherent in all 8 directions
5. Add motion-blur / particle polish on top of the new animations
6. Update screenshots in TASK_STATUS

Estimated wire-in time: **~1 hour** once the atlas exists.

---

## Rollback

If the atlas-based render feels worse than SVGs in any way:
- Delete (or rename) `assets/characters/atlas/devstick.json`
- The client falls back to SVG textures automatically
- No code changes needed

The fallback is built into the runtime — both paths stay supported.

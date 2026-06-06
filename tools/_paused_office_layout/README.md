# ⏸️ Paused: Procedural Office Layout Generator

This folder contains paused work on a Blender-based procedural office-layout generator
that was being built to produce Pac-Man-style maze backdrops for the original arcade game concept.

**Status as of 2026-05-24**: paused mid-iteration with 4 known overlap violations in the
latest grid (K-cubicle walls overflowing into adjacent reception/coffee cells).
Drafted fixes were not re-run because the project pivoted to a hyper-casual variant.

## Files

| File | Purpose |
|---|---|
| `render-level.py` | Latest procedural layout generator + validator. ASCII grid → Blender scene → PNG + maze-collision JSON. |
| `render-level-1.py` | Earlier non-procedural draft for L1 specifically. Superseded by `render-level.py`. |
| `blender-office-setup.py` | Empty-scene helper for manual composition in Blender. |

## To resume (only on explicit request)

1. Move these files back to `tools/` (the parent folder).
2. Apply drafted fixes from the prior conversation: `coffee_table` y_offset → -0.15, reception `chair_dy` → ±0.25.
3. Run `blender --background --python tools/render-level.py`.
4. Read `assets/level_bg/layout_report.json` → if `violations: []`, the maze is ready.
5. Wire the JSON's `maze` field into `src/data/mazes.js` for collision.

## NOT in this folder (still active in the project)

- `tools/render-obj-to-png.py` — per-prop renderer (general utility, produced the 119 PNGs in `assets/office/`)
- `tools/split-bugs.ps1`, `tools/split-characters.ps1` — spritesheet splitters (one-shot, output preserved)

These tools are general-purpose and not tied to the paused work.

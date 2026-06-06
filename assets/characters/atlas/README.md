# Character sprite atlas

Drop two files here once you've run the Mixamo + Blender pipeline:

- `devstick.png` — the packed atlas image
- `devstick.json` — Phaser JSONHash frame coordinates

The client auto-detects these on load. If absent, it falls back to the
hand-drawn SVG poses in `../stickman/`.

See `.claude/context/tasks/MIXAMO_ATLAS_BREAKDOWN.md` for the full pipeline.

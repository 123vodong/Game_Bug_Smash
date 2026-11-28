# 10 · Roadmap

Updated: 2026-11-28. This is a priority list, not a promise of dates. For implementation status, see [TASK_STATUS.md](../tasks/TASK_STATUS.md); source code remains authoritative for runtime behavior.

## Current baseline

- Personal Mode and the single-player campaign are implemented.
- Team Mode is a playable 5v5 MOBA with custom rooms, ranked/rating, champions, items, augments, bots, and match results.
- Story Mode 2.0 is a top-down prototype; only the first-floor slice is represented as built.
- Phaser 2D remains the default renderer. Three.js is an opt-in path and is not yet at 2D parity or approved as the replacement.
- Current character art, icons, and many skill effects are not production-approved. The Pixel SVG pilot was rejected; do not extend it into an art-production pipeline.

## Priorities

1. **Agree on an art-production path.** Start with a human-approved representative champion/VFX target, then use an artist or a visual-generation/editing service with a documented source, license, manifest, and in-game acceptance check. See [ART_QUALITY_PASS.md](../tasks/ART_QUALITY_PASS.md).
2. **Keep the renderers honest.** For Three.js, address missing input/mechanic parity and distinguishable per-skill effects, then run browser and real-device checks. Do not make it the default or remove Phaser without user approval and completed acceptance checks. See [THREEJS_MIGRATION_BREAKDOWN.md](../tasks/THREEJS_MIGRATION_BREAKDOWN.md).
3. **Verify performance targets.** The 100-CCU and real-phone performance checks remain pending; do not describe them as passed.
4. **Continue Story Mode only as a separate content task.** The top-down direction is current; the remaining floors and complete story are not implemented.

## Explicitly not committed

- No full engine rewrite and no removal of the Phaser renderer.
- No Mixamo/Blender atlas workflow; no Blender MCP is part of the selected asset pipeline.
- No service account, paid generation run, or asset upload without an explicit decision.
- No public server deployment or 100-CCU capacity claim before verification.

## Acceptance gates

- Visual assets: approved at native gameplay size, source/license recorded, and checked in-game.
- Three.js default change: mechanics, controls, HUD, online play, mobile behavior, and visual quality reviewed against the 2D path.
- Capacity claim: run the documented load matrix and record measured results.

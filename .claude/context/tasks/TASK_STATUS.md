# Current Project Status

Updated: 2026-11-28. This is the short handoff for current work; implementation details and live behavior must be checked against source code.

## Implemented modes

- **Single-player campaign:** 12 levels across four worlds.
- **Personal Mode:** persistent online FFA arena with AI coworkers, world events, boss encounter, growth, and session score.
- **Team Mode:** playable 5v5 office MOBA. Shared content currently includes 18 champions, 41 items, 26 augments, 12 jungle camps, 20 structures, 50 polygon walls, and 34 bushes.
- **Story Mode 2.0:** top-down direction is current. The first-floor slice and free champion pick exist; the full multi-floor campaign is not complete.

## Renderer and art status

- Phaser 2D remains the default.
- Three.js is an opt-in renderer. Parts of Team, Story, Hunt, menu, and arena paths exist, but browser, online, and device verification is incomplete. Do not remove Phaser or make Three.js the default without explicit approval.
- User review (2026-11-27): Three.js visuals are still worse than 2D; skill effects look too similar, and some champion mechanics/objects are missing from the 3D presentation. Known example: Pixel's hold/drag cast and aim preview do not match the 2D behavior; Zero's shadow object lacks visible function.
- Character, icon, and VFX quality remains an open production-art problem in both renderers. The Pixel SVG pilot was rejected; its assets are not approved production art. Do not continue treating hand-authored SVG tweaks as the solution. See [ART_QUALITY_PASS.md](./ART_QUALITY_PASS.md).
- Source inventory (2026-11-28): 18 champions / 72 QWER slots; 68 skill icons are emoji and Pixel's 4 SVG prototypes are rejected. All slots have 2D style keys and 3D handlers, but that code coverage is not art approval. A Mop portrait/icon pilot brief exists; no provider is selected and no assets are commissioned.

## Verification state

- Previously recorded headless checks: Team offline renderer check `6/6`, Story first-floor check, and Hunt simulation check passed in their respective runs. These are historical results, not a fresh run in this documentation update.
- The optional Three.js browser/online/mobile paths still need visual and gameplay review.
- The 100-CCU load test and real-phone performance check are pending; no capacity claim is established.
- For current renderer-specific gaps and acceptance gates, see [THREEJS_MIGRATION_BREAKDOWN.md](./THREEJS_MIGRATION_BREAKDOWN.md).

## Current priorities

1. Review the Mop portrait/icon pilot brief, then choose an artist/service and approve cost and rights before commissioning; require source/license records and native-scale in-game review rather than more generic SVG construction.
2. Keep the 2D renderer as the reference/default while improving Three.js input/mechanic parity and per-skill visual identity.
3. Complete browser and real-device checks before making renderer or performance claims.
4. Treat the full Story Mode campaign as separate future content, not a completed feature.

## Documentation sources

- [Main documentation index](../../../docs/README.md)
- [Design roadmap](../design/10_ROADMAP.md)
- [Art quality decision and service research](./ART_QUALITY_PASS.md)
- [Optional Three.js parity backlog](./THREEJS_MIGRATION_BREAKDOWN.md)

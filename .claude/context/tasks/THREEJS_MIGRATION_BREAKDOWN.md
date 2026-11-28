# Optional Three.js Renderer — Parity and Review Backlog

Updated: 2026-11-28.

## Scope and decision

Three.js is an optional renderer for existing gameplay, not a plan to replace Phaser. Keep `?renderer=3d` opt-in and Phaser 2D as the default. Do not remove 2D scenes, switch the default, or rewrite simulation/server rules as part of renderer work.

The implementation exists across `src/three/`, but its presence is not proof of quality or full parity. The user review on 2026-11-27 found the 3D presentation clearly worse than 2D and rejected the current similarity between skill effects.

## Known gaps

- **Cast input parity:** hold/drag/release, charged casts, and aim previews must behave like the 2D path. A held key must not collapse into a tap.
- **Champion mechanics:** implement visible gameplay objects and consequences, not just cast flashes. Examples include Zero's shadow and other champion-created zones, turrets, or objects.
- **Per-skill identity:** each champion skill needs a distinct, readable silhouette, palette, timing, and telegraph. Generic particles or a recolored shared effect are not acceptance.
- **World/HUD parity:** verify camps, wards, pets, structures, status effects, shop, augments, scoreboard, results, and mobile layouts against 2D.
- **Mode parity:** online Team Mode, Story, Hunt, Personal arena, and menu routes require browser verification; headless simulation checks do not verify rendered gameplay.
- **Performance:** measure on a real phone and low-end hardware before making FPS claims.

## Work order

1. Compare one representative champion and its skills side by side in 2D and 3D at native game scale; use the 2D behavior as the mechanics reference.
2. Port input phases and aim/charge feedback without changing shared gameplay values.
3. Implement missing champion-specific objects and effects using approved visual assets or a deliberate, documented fallback.
4. Validate every skill cast, state change, target, telegraph, and cleanup in browser captures; test online visibility and touch controls.
5. Get user approval of the visual target before expanding a style across the roster.

## Acceptance gate

The opt-in renderer is ready for broader review only when gameplay behavior matches the 2D path, every skill is distinguishable and readable, mode-specific HUD/world objects are present, no console errors or persistent effects remain, and browser/mobile checks are recorded. Passing headless tests alone is insufficient.

## Related references

- [Current project status](./TASK_STATUS.md)
- [Art quality decision and service research](./ART_QUALITY_PASS.md)
- [Main champion and skill reference](../../../docs/02_CHAMPIONS_AND_SKILLS.md)
- [Main map/network reference](../../../docs/05_MAP_VISION_SPELLS_AND_NETWORK.md)

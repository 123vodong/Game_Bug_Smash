# 04 · Multiplayer

Bug Smash currently has two distinct multiplayer modes. They share the browser client and server stack, but do not share gameplay rules or progression.

## Personal Mode — persistent FFA arena

- One persistent `ArenaRoom`; players join and leave freely.
- Server-authoritative bugs, player combat, world events, AI coworkers, and the Deadline boss.
- Personal progression and score are session-scoped; defeat resets the player's level/XP/score and causes the configured bug drop.
- This mode uses the single-player growth system in `server/game/rules.js`; it does not use Team Mode's champion/items/lanes rules.

## Team Mode — 5v5 office MOBA

- `TeamRoom` manages lobby/queue, champion select, match, reconnect, and results.
- Two teams compete across three lanes with champions, skills, summoner spells, items, augments, minions, towers, jungle camps, wards, and epic objectives.
- Shared gameplay rules live in `shared/moba/`; the server validates player intent and owns authoritative state. `OfflineSim` supports offline practice using the same shared rules.
- Team Mode is implemented, not a future multi-stage FFA plan. Current counts and mechanics are summarized in the [main rules and map references](../../../docs/README.md).

## Networking invariants

- The server owns gameplay state and validates movement, targeting, visibility, casts, shopping, and match actions.
- Clients render filtered state and send intent; hidden enemies and their events must not leak to the opposing team.
- Reconnect preserves a Team Mode seat for the configured grace period; Personal Mode has separate room behavior.
- Keep server and offline simulation behavior aligned when changing shared rules.

## Rendering status

- Phaser 2D is the default renderer.
- Three.js is an opt-in rendering path over existing gameplay; it does not change networking or rules.
- Three.js browser, online, and mobile parity is incomplete. Do not treat the renderer as production-ready or change the default without visual and gameplay acceptance.

## Validation status

- Existing headless tests cover portions of Team Mode and offline simulation.
- The 100-CCU load benchmark, real-phone performance check, and full browser verification of the optional Three.js path remain pending.
- Record new measured results in [TASK_STATUS.md](../tasks/TASK_STATUS.md) and update the main docs; do not turn targets into passed results.

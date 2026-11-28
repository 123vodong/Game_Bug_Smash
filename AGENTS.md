# Repository guide

## Project

Bug Smash is a browser game using Phaser 3.70, plain JavaScript ES modules, and Colyseus for online play. There is no client build step. `index.html` loads `src/main.js`; the Phaser 2D game is the default, and the Three.js renderer is opt-in with `?renderer=3d` or `bs.renderer=3d`.

## Where to make changes

- `src/scenes/`, `src/entities/`, `src/systems/`, `src/ui/`, `src/core/`, and `src/data/`: Phaser client.
- `src/three/`: opt-in Three.js renderer and its HUD, world, units, and effects.
- `server/`: Colyseus server, room logic, authoritative rules, and server tests.
- `shared/moba/`: game data and rules shared by client and server.
- `assets/`: game art and audio; `docs/`: design and gameplay documentation.
- `.claude/agents/`: existing role-specific agent guides. Read the relevant guide when working in that role.

Some repository planning documents describe earlier versions of the game. When documentation conflicts with the running entry point or current code, verify behavior in code and update directly related documentation when making a change.

## Development and verification

- Keep the client compatible with static hosting: use existing browser APIs and project dependencies; don't add a build system or dependency without a clear need.
- Preserve the game’s bug-smashing and programmer-office theme.
- For JavaScript changes, run `node --check` on every modified `.js` file.
- For server or multiplayer changes, run the relevant smoke tests in `server/tests/` and use `tools/playtest/` when the change affects gameplay or networking.
- For gameplay or rendering changes, verify the affected flow in a browser or with the existing playtest tools when available; report anything that could not be verified.
- Do not commit, push, or create/merge a pull request unless the user explicitly requests it.

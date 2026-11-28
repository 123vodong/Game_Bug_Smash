# Champion art and VFX pilot

**Status:** Inventory verified; one-champion asset brief drafted. No artist/service selected, no assets commissioned, and no production art approved.
**Scope:** Team Mode in Phaser 2D and the opt-in Three.js renderer.

## Non-negotiable constraints

- Do not create production icons or signature VFX by hand-writing SVG, emoji, or decorative code particles. Coding work is asset loading, renderer integration, technical normalization, fallback/error handling, and QA.
- Use no emoji/text glyph as the final champion, skill, status, or item icon. Keep the existing glyphs only as temporary fallbacks until approved files replace them.
- Preserve authoritative hitboxes, timing, and readable gameplay telegraphs; decorative art must not change them or obscure them.
- Do not upload project files, add credentials, spend credits, or start a paid service without the user's approval. Human review and in-game acceptance are mandatory.
- The rejected Pixel SVGs are not a style reference or approved output. Do not extend that pilot.

## Verified implementation inventory

Generated from the current champion data and renderer registries on 2026-11-28. Re-run
`node tools/audit_art_inventory.mjs` to refresh the QWER table.

- **2D character look:** the roster shares stickman pose SVGs; `looks.js` builds per-champion costume parts and circular portraits as canvas textures. Portrait rendering can temporarily fall back to a champion emoji before the stickman textures load.
- **3D character look:** shared KayKit GLB rigs are used for Stack, Dev, Pixel, Courier, Hira; shared KayKit skeleton GLBs for Brick, Model, Zero, Sprint; procedural rigs for Ops, Volt, Brew, Mop, Lint, Pager, Tester, Swipe, Cache. Per-champion palette, size, gear, and props add variation; these are not 18 bespoke animated models.
- **Skill icons:** 72 QWER slots total. Pixel has four SVG files selected through `iconKey`; the user rejected those prototypes. The other 68 slots use emoji glyphs in both HUDs.
- **VFX code coverage:** all 72 slots have a 2D style key and a 3D per-skill handler. These are code-routed looks built from shared primitives, sprites, and flipbooks—not 72 commissioned art assets or proof that effects look sufficiently distinct. Generic gameplay telegraphs remain the fairness baseline.

| Champion | Q/W/E/R icons | 2D style keys (Q/W/E/R) | 3D code handlers |
|---|---|---|---|
| Pixel | SVG* (q, 📏) / SVG* (w, ⚡) / SVG* (e, ⏪) / SVG* (r, 🌀) | laserFence / pixelOrb / rewind / pixelWipe | 4/4 |
| Stack | 🪝 / 🔐 / 🌀 / 🔒 | hook / accessToggle / portal / rowLift | 4/4 |
| Ops | 🚇 / 🔗 / 🔁 / 🔄 | scan / tether / swap / blueGreen | 4/4 |
| Tester | 🧪 / 🛸 / ↗️ / 🎯 | sniperCharge / drone / vault / snipeGlobal | 4/4 |
| Zero | 👤 / 🔀 / 💥 / ☠️ | shadowCast / shadowSwap / bladeSpin / suppressStrike | 4/4 |
| Model | 📉 / 🛡️ / 🌲 / 🌌 | dataSphere / orbShield / forestWall / singularity | 4/4 |
| Brick | 🚨 / 📋 / 🚧 / 🔔 | bashCharge / badgeCheck / barricade / lockdown | 4/4 |
| Mop | 🧹 / 🔄 / 🌊 / 🌀 | broomCone / gearSwitch / dash:skid, zone:puddle / mopSpin | 4/4 |
| Rush | 🏍️ / 📦 / 🏁 / 💸 | tirePhase / pickup / deliver / rushHour | 4/4 |
| Volt | 🗼 / 🔥 / 🧊 / 🌩️ | turretDeploy / overclockTurrets / ventRing / chainBlast | 4/4 |
| Patch | ♻️ / 🌳 / 🌿 / ⚔️ | arcSwing / checkout / branch / mergeLock | 4/4 |
| Swipe | 🔔 / 📲 / 👈 / 🚀 | notif / burstUpdate / swipeReload / storeLaunch | 4/4 |
| Sprint | 🧍 / ⏱️ / 🃏 / 📣 | standup / timebox / leapGhost / rally | 4/4 |
| Cache | 🗃️ / 🪞 / 🔀 / 🧮 | batch / echoArm / failoverBlink / tableScan | 4/4 |
| Hira | 💬 / 🪢 / 📜 / 📅 | charmInvite / buddyLink / policy / allHands | 4/4 |
| Lint | ✏️ / 🛑 / 💡 / 🧨 | pinNit / pinBlock / pinSuggest / resolveBurst | 4/4 |
| Brew | ☕ / 🥛 / 🍯 / 🛎️ | espressoSpray / milkSteam / syrup / serve | 4/4 |
| Pager | 📶 / 📟 / 📋 / ⏮️ | pingHop / pageWave / postmortem / rollback | 4/4 |

Icon and style columns are ordered Q/W/E/R. `SVG*` marks the rejected Pixel prototype; its emoji glyph is only a fallback. A 3D handler is code coverage, not an art-quality pass.

## Pilot deliverable: Mop (`cleaner`)

Mop is the representative test because Q is a cone/AoE, E is a dash, and R is a persistent zone. This first pilot tests portrait/icon production and integration only; it does **not** solve body animation or signature VFX.

| File | Runtime contract |
|---|---|
| `assets/moba/champions/cleaner/portrait.png` | 512×512 RGBA PNG; square source with a circle-safe bust composition and transparent outside background |
| `assets/moba/champions/cleaner/icons/q.png` | 128×128 RGBA PNG; transparent background; readable at 32×32 |
| `assets/moba/champions/cleaner/icons/w.png` | Same icon contract |
| `assets/moba/champions/cleaner/icons/e.png` | Same icon contract |
| `assets/moba/champions/cleaner/icons/r.png` | Same icon contract |

Use the repository's root `assets/` path, not a new `public/` tree. No asset manifest currently exists; create `assets/moba/champions/cleaner/manifest.json` with creator/source, license, dimensions, technical-check status, and approval for each file. Keep editable source files beside the exports. Icons must communicate the ability without letters, emoji, or a colored square alone.

For this pilot, both renderers keep their existing Mop body and effects; no sprite sheet, GLB, billboard, or shader is requested. Reuse the same portrait and icons in both HUDs, mask the portrait to the existing circular frame, and verify icons at actual HUD size. Define a separate VFX/3D-model contract only after an artist or service can supply and review those deliverables.

## Production and acceptance gate

Scenario is only a candidate for an artist-directed trial, not a selected provider. Verify current pricing, commercial rights, and data handling before use; do not assume free credits grant shipping rights. Begin with this five-file Mop batch only after the user approves the provider/cost or supplies an artist's files.

Accept the pilot only when a human art reviewer and the user approve the source, the five files pass dimension/alpha/license checks, and the portrait/icons read correctly in both Phaser and Three.js at normal gameplay size. Missing or failed files must be reported during integration; the emoji fallback is temporary, not acceptance.

## Code references

- Data and 2D style keys: `shared/moba/champions.js`, `src/entities/moba/SkillFx.js`, `src/entities/moba/MobaFx.js`
- 2D body and portrait: `src/entities/moba/looks.js`
- 3D VFX handlers: `src/three/fx/skills/`
- 3D body rigs and appearance mapping: `src/three/units/champions.js`
- Reproducible inventory: `tools/audit_art_inventory.mjs`
- Asset pipeline and provenance: `.claude/skills/create-game-assets/SKILL.md`

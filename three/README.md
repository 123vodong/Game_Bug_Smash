# Bug Smash Team Mode - Three.js renderer spike

A throwaway prototype that answers one question: does a real 3D renderer (fixed 3/4 camera, real lighting,
animated 3D models, post effects) look clearly better than the Phaser 2D renderer while still running
smoothly in a browser? It renders the **same simulation** as the Phaser scene: `src/entities/moba/OfflineSim.js`
(sandbox mode). No game logic was rewritten and nothing outside `three/` was touched.

Author: Duke Nguyen

## Open it

The game is served statically, so no build step:

    http://localhost:2600/three/index.html

Needs internet (three.js r160 is loaded from jsDelivr through an importmap). Useful URL parameters:

| Parameter | Meaning |
| :--- | :--- |
| `champ=<id>` | Local champion (any of the 18 ids in `shared/moba/champions.js`), default `pixel` |
| `dist=<n>` | Camera distance, default 19 (wheel zooms 9 to 30) |
| `shadow=off\|low\|medium\|high` | Shadow map 0 / 1024 / 2048 / 4096 |
| `bloom=0`, `inst=0`, `pr=<0.5..2>`, `auto=0` | Start with bloom off / instancing off / pixel ratio / auto-reduce off |
| `shot=1` | Screenshot harness: virtual 10 fps clock (patches `Date.now`), auto-reduce off |

## Controls

| Input | Action |
| :--- | :--- |
| Right-click (hold to keep moving) | Move order; right-click on an enemy = attack order |
| Left-click on an enemy | Basic attack order (left-click on ground = move) |
| Q W E R | Cast toward the cursor (`sim.receive('cast', {slot, x, y, id})`) |
| D F | Summoner spells |
| Arrow keys, Space, mouse wheel | Pan camera, recenter, zoom |
| Minimap right-click | Move order |
| "Mid fight" button | Teleports the local champion mid, spawns 3 waves, pulls every champion and minion into one brawl, auto-casts (the stress scene) |

The right-hand Quality panel has shadow quality, bloom + colour grade, pixel ratio (0.5 to 2), instanced
units on/off, auto-reduce, champion picker. "Auto-reduce" steps down (shadow size, pixel ratio, bloom,
shadows off) when the average frame time stays above 28 ms for 2.5 s. The left panel shows FPS, frame ms,
draw calls, triangles, geometries, textures, programs, JS heap, canvas size, entity and fx counts.

## What is implemented

| Area | Status |
| :--- | :--- |
| Sim reuse | Done. `OfflineSim` runs unchanged; `emit('fx'/'atk')` feeds the effects, `clientState` (fog of war, bush hiding) feeds the units |
| Camera | Done. Perspective FOV 32, pitch 55 degrees, smooth follow, shake, pan, zoom |
| Ground | Done. One plane, splat-mask shader blending carpet (lanes) / mud (jungle) / metal (bases) PBR textures with normal maps, two-scale anti-tiling, team-tinted base grid |
| River | Done. Same shader: animated scrolling chevron "data stream" emissive, lanes bridge over it |
| Walls | Done. All 44 wall segments / pillars / plants merged into 3 draw calls (solid textured, glass, emissive trim) |
| Bushes | Done. Instanced foliage clumps with wind sway in the vertex shader (visual only, the sim still owns hiding) |
| Lighting | Done. Hemisphere + ambient + room environment map + one directional sun with a camera-following, texel-snapped shadow map; fog; pooled point lights for spell flashes |
| Champions | Done for all 18: 4 rigged KayKit bodies (Knight, Barbarian, Mage, Rogue) re-targeted to one shared animation set (idle, run, attack, 4 cast animations, hit flash, death), per-champion tint from `look.palette`, accent chest gem, weapon / offhand loadout per champion, team ring, slide for dash / knockback |
| Minions, monsters, pets, wards, dummies | Done as procedural instanced meshes with team colour, bob, lunge, hit flash, death burst |
| Towers, cores | Done as procedural instanced meshes with emissive crystal + rings (dim while invulnerable, pulsing when vulnerable), rubble when destroyed |
| HP bars | Done. All bars in one instanced draw call |
| Effects | Projectile (glow head + particle trail), circle telegraph then burst + ring decal + light flash + shake, zone (rotating ring + ticks + particles), cone / line area telegraphs, dash streak + sliding champion, blink flash, hit flash + sparks, target beam, buff / heal rings, CC stars, knockback, basic-attack bolts and slashes, tower bolts, damage numbers |
| Post | Done. MSAA half-float target, UnrealBloom, vignette + saturation / contrast grade, ACES tone mapping. No SSAO / outline (not cheap enough to justify in a spike) |
| HUD | Done. HP / mana, QWER + DF cooldown slots, minimap (walls, lanes, units, camera box), stats panel, quality panel |
| Not done | Per-skill VFX styles (the Phaser version has ~100 handcrafted ones, here only generic mapping by fx kind), pets with their own models, hats / props / vehicles from `looks.js`, stances, shop / augment / vote UI, audio, tower targeting lines, relics, doors, camp props, Story Mode worlds, mobile input |

## Fx message mapping

| Sim message | Three.js effect |
| :--- | :--- |
| `fx proj` | Glow sprite head + 2 trail particles per frame, flies `range/speed`, ends with an impact burst; removed early by a matching `hit` unless the skill pierces |
| `fx circle` | Shader ground ring that fills during `delay`, then `ring*` flat flipbook + `burst*` sprite flipbook + particles + pooled point light + camera shake |
| `fx zone` / `trapEnd` | Rotating-dash ground ring for `ms`, pulse ring flipbook on every `tickMs`, rising particles |
| `fx area` (cone / line / arc) | Same shader in cone or box mode, fires particles along the shape when it resolves |
| `fx dash` | Champion slides start to end (190 ms), particle streak, `vfHyperspeed` flipbook, landing ring |
| `fx blink` / `tp` | Burst flipbook + particles at both ends |
| `fx hit` | Instanced-unit or emissive champion flash, `impactGold` flipbook, sparks, light |
| `fx tgt` | Particle beam source to target + big impact |
| `fx buff` / `heal` | Ground ring that follows the unit + rising particles |
| `fx cc` | `vfPuffStars` flipbook looping over the head for the CC duration |
| `fx knock` | Champion slide + impact |
| `atk` | Champion plays attack animation and faces target; ranged = homing bolt (tower bolts bigger and higher), melee = `bloodSlash` flipbook + minion lunge |
| HP deltas | Floating damage / heal numbers (champions and structures always, minions only for 12+ damage, max 8 per frame) |
| anything else with x, y | Small `ringDots` ring |

Flipbook sheets are read straight from `assets/moba/fb/*.webp` (8 columns, 128 px frames, frame count derived from the image height).

## Measured numbers

Measured with headless Chrome on a **software** renderer (SwiftShader), 1280x720, pixel ratio 1, shadows
medium, bloom on, from `renderer.info` (summed over every pass in a frame, shadow pass and bloom included).
FPS from software rendering is meaningless and is not reported. Draw calls, triangles and object counts are
renderer-independent and are the cost metric to use.

| Scene | Draw calls | Triangles | Geometries | Textures |
| :--- | :--- | :--- | :--- | :--- |
| Idle at the base (5 champions, 25 minions, no fx) | 147 | 145k | 73 to 83 | 58 |
| Mid fight (10 champions, about 100 minions / monsters, auto-cast, 28 to 100 active fx, 100 to 2400 particles), instanced | 267 to 317 (peak 517 during a spell storm) | 220k to 280k | 85 to 97 | 125 to 139 (about 70 of them are cached damage-number textures) |
| Same mid fight, "Instanced units" off | 421 | 218k | 95 | 139 |
| Same mid fight, bloom off + shadows off | 150 | 135k | 99 | 119 |
| JS heap | 28 to 38 MB | | | |

Reading the numbers: roughly half of the draw calls are the shadow pass and the 9 bloom mip passes, the
champions cost about 7 skinned meshes each (2x with shadows), everything else (map, 100 minions, 18
structures, all HP bars, all particles) is under 60 calls. A mid-range integrated GPU should hold 60 fps at
these counts at 1080p; a 4K display or pixel ratio 2 is where fill rate (bloom, MSAA, shadows) will bite, which is
what the pixel-ratio slider and auto-reduce are for. This was NOT verified on real GPU hardware, the owner has to
judge that with the stats panel.

Payload: about 11.3 MB under `three/` (4.5 MB models, 6.8 MB textures). The Three.js library itself (about 1.3 MB
for core plus addons) comes from the CDN. The flipbooks are reused from the game, not copied.

## Honest comparison with the Phaser version

Look. The 3D version wins on lighting and depth: real shadows from walls, towers and champions, normal-mapped
floor, a water shader that reads as a flowing data stream, bloom on skill effects, animated skinned champions
that turn, run, attack and cast, and a camera that can be pitched, zoomed and shaken. It does NOT win on
character identity: the Phaser version has 18 hand-built costumes (outfit, hat, prop, vehicle) while this spike
has 4 generic KayKit bodies with a tint and a gem, so champions are less distinguishable than today. Minions
and monsters are primitive. Skill VFX are generic (one effect per fx kind), well below the handcrafted
per-skill styles of the Phaser version, which still look better per skill. Fixing that needs real art, not
code: either a larger CC0 model set (Quaternius, KayKit Skeletons / Dungeon) plus per-champion accessories,
or commissioned models.

Smoothness. Draw-call and triangle counts are small by modern standards, and everything dynamic is instanced
or pooled, so CPU cost should be comparable to Phaser (the sim dominates). GPU cost is the difference:
Phaser draws cheap 2D quads, Three.js with shadows + bloom + MSAA costs real fill rate. Expect it to be fine on
any discrete or recent integrated GPU and to need the Low preset (no shadows, no bloom, pixel ratio 0.75) on
old laptops, Chromebooks and phones. Phaser has no such floor. Texture and model load adds about 11 MB and
a CDN dependency before first frame (a few seconds), where Phaser loads sprite sheets.

Risks. (1) Mobile / low-end GPU performance is unproven. (2) Art consistency: mixing a 3D low-poly look with the
existing UI and icons needs a style decision. (3) Fog-of-war and bush hiding are sim-side and work as is, but
soft "reveal" visuals (rustling bushes, stealth fade) must be rebuilt. (4) Two renderers to maintain if the
Phaser one stays. (5) Sim runs on the main thread in both; nothing changes there.

## Effort to port the rest (one developer, 3D art not included)

| Piece | Estimate |
| :--- | :--- |
| Map polish: camp props, relics, doors / dynamic walls, Story Mode floors, bush rustle + focus | 4 to 6 days |
| Units: pets, vehicles, hats / props from `looks.js`, stances, death / respawn, stealth, status icons, name plates | 8 to 12 days |
| Structures: real tower / core / inhibitor models, destruction FX | 3 to 5 days |
| SkillFx: ~100 per-skill styles on top of the current generic mapping (the bulk of the work) | 15 to 25 days |
| Input and picking: drag / hold / charge casts, target indicators, hover outline, mobile touch | 5 to 8 days |
| HUD: reuse the existing MobaHud with a 3D-to-screen projection layer (shop, augments, votes, scoreboard, minimap pings) | 6 to 10 days |
| Perf, quality presets, loading screen, asset compression (meshopt / KTX2), QA on real devices | 6 to 10 days |
| Total | about 7 to 11 weeks to reach parity, 2 to 3 weeks for a believable "3D mode" demo with generic effects |

## Recommendation

Hybrid / conditional go, not a full go. The 3D look is a clear step up in atmosphere and the cost numbers are
healthy, but parity with the current handcrafted champions and skill VFX is the expensive part and depends on
art that does not exist yet. Cheapest honest path: keep Phaser as the default renderer, keep this spike as an
opt-in "3D (beta)" view fed by the same sim, and decide on a full port only after (a) the owner confirms
smoothness on target GPUs with the stats panel and (b) there is budget for a proper 3D champion set. A full
rewrite now is a no-go.

## Files

| File | Role |
| :--- | :--- |
| `index.html` | Page, importmap, HUD / quality DOM |
| `main.js` | Renderer + composer, sim wiring, camera, input, quality + auto-reduce, bench scene, loop |
| `world3d.js` | Ground shader, walls, bushes, pads, border, lights |
| `units3d.js` | Champion views (GLB + AnimationMixer), instanced batches, HP bars, picking |
| `fx3d.js` | Particles, flipbooks, telegraph shader, projectiles, damage numbers, `fx` / `atk` mapping |
| `hud.js` | Bars, cooldown slots, minimap, stats panel |
| `assets/` | Models, textures, `LICENSE.txt` (all CC0) |

## Assets and licenses

All third-party assets are CC0. Details in `assets/LICENSE.txt`.

| Asset | Source | License |
| :--- | :--- | :--- |
| `assets/models/Knight.glb`, `Mage.glb`, `Rogue.glb`, `Barbarian.glb` | KayKit Adventurers Character Pack 1.0 by Kay Lousberg, https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 (animations stripped from three of the four) | CC0 (credit to Kay Lousberg, www.kaylousberg.com, is optional) |
| `assets/tex/dirty_carpet_*`, `mud_forest_*`, `metal_plate_*`, `plastered_wall_03_*` | Poly Haven, 1k jpg | CC0 |
| three.js r160 + addons (CDN) | https://github.com/mrdoob/three.js | MIT |
| `assets/moba/fb/*.webp` (referenced, not copied) | existing game assets | see `assets/moba/LICENSE.txt` |

Everything else is procedural.

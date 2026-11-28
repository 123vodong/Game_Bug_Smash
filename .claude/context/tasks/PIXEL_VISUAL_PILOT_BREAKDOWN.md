# Pixel Visual-Quality Pilot — frozen implementation brief

**Scope:** Pixel only; Phaser 2D Team Mode + opt-in Three.js Team renderer. **Visual-only:** no mechanics, timings, hitboxes, inputs, stats, balance, or server changes.

**Status:** The 2026-11-28 implementation spike is **not accepted**. The user judged the hand-authored SVGs poor and the VFX changes insufficiently different. Keep this brief as the visual target, but treat the current assets/effects as an unapproved technical prototype; do not expand them to other champions or report the pilot as complete.

**Production route:** final icons and VFX must be authored by a human artist or an approved specialist art/VFX service. Coding agents handle code integration, asset pipelines, runtime validation, and provenance—not final visual design. The production asset format is not frozen; select it with the artist/service.

## 1. Goal
Make Pixel read instantly as Bug Smash’s frontend wizard—not a generic Mage wearing a beret—and make Laser Fence, Flexbox Orbs, Ctrl+Z, and Framework Rewrite unmistakable at play scale. Pixel is the smallest useful pilot: one coherent character identity, four custom icons, and four distinct skill signatures exercised through both existing render paths before any roster-wide art work.

## 2. Rules
- Identity: **“CSS Grid Atelier”**—cyan `#39c2ff` and hot pink `#ff4fa3`, dark ink outlines, crisp square/pixel motifs, restrained white highlights. Keep the artist beret, turtleneck, and stylus; sharpen them with a readable square swatch on the beret, a compact 2×2 pixel-grid chest mark, and a square-tip stylus. No text/logos or borrowed character designs.
- Match the same recognizable motifs across renderers: hand-drawn, outlined costume pieces in Phaser; simple low-poly, palette-matched geometry in Three. Preserve current base model, stickman silhouette, team ring, and team tint.
- Icon brief for the artist/service: four original, transparent skill icons (128×128 source each; readable when displayed at 24×24 and 32×32):
  - **Q Laser Fence:** two square posts joined by a cyan beam.
  - **W Flexbox Orbs:** three connected pink/cyan square nodes.
  - **E Ctrl+Z:** a square cursor/arrow turning back along a dotted trail.
  - **R Framework Rewrite:** a cyan/pink scanline crossing a framed code-grid (no letters).
- Keep gameplay-readable effects distinctive, not merely recolored:
  - **Q:** endpoint posts + a crisp continuous fence. Preserve the authoritative segment, thickness and lifetime; decorative pixels stay on/inside that segment.
  - **W:** discrete chained square-node/orb launches and target pops; decorate only existing cast/impact positions, never invent a chain target or imply a hit where none occurred.
  - **E:** reverse-moving square afterimages from the existing rewind trail, with a clear departure/arrival stamp. Do not imply HP restoration.
  - **R:** a scanline/rewrite sweep across the existing lane, then a compact pixel-grid impact. Keep the current lane telegraph visible and unobscured until it resolves.
- Decorative additions must sit beneath/around—not replace, expand, delay, or obscure—the authoritative telegraph. Reuse existing event coordinates, object dimensions and lifetimes. New presentation tuning belongs in client visual data, not gameplay logic.
- Existing gameplay values remain authoritative and unchanged: Q segment max length **520 px**, thickness **46 px**, lifetime **4 s**; R width **170 px**, windup **700 ms**. Do not change cast input or Three.js drag-cast behavior in this pilot.

## 3. Contract (frozen)
- **Wire/schema:** none. No `server/game/schema.js` changes, messages, payload changes, server events, or event/kind IDs. Existing `sid`, `slot: q|w|e|r`, `kind`, coordinates, and cast/impact/object lifecycle messages remain the sole FX inputs.
- **Local visual data:** `iconKey` values on Pixel Q/W/E/R remain `pixel-q`, `pixel-w`, `pixel-e`, `pixel-r`, retaining existing `icon` strings as fallback. The current spike maps those keys to `assets/moba/champions/pixel/{q,w,e,r}.svg`, but those SVGs are rejected placeholders; replace the format/path mapping when approved artist/service deliverables are selected. No gameplay data changes.
- Phaser loads the four files as `skill-pixel-q`, `skill-pixel-w`, `skill-pixel-e`, `skill-pixel-r`; Three HUD uses the same asset URLs. Missing texture falls back to existing `icon` text. FX continue to resolve by existing `champ='pixel'` + slot and existing `SKILL_FX`; no new network coupling.

## 4. Tasks (parallel ownership)
- **D1 — art/data:** obtain human-/service-authored Q/W/E/R icon deliverables and record provenance, license, dimensions, and approval in `assets/moba/champions/pixel/ART.md`; retain only the four `iconKey`s in champion data. Current SVG files are not approved. **Accept:** artist/user-approved icons are legible at 24 px and the game still has text fallback.
- **C1 — Phaser identity + HUD:** `src/entities/moba/looks.js`, `src/entities/moba/MobaHud.js`, `src/ui/moba/InfoPanel.js`, `src/scenes/TeamModeScene.js`. Refine Pixel procedural hat/outfit/prop, load icons, render them in skill slots and Pixel skill info; retain names, key labels, tooltips, touch controls and fallback. **Accept:** in 2D match and champion info, Pixel is distinguishable at normal zoom; all four icons show on desktop/touch and no layout/input regression.
- **C2 — Phaser VFX:** integrate artist-/service-authored Pixel cast/live/impact assets through `src/entities/moba/SkillFx.js` and `src/entities/moba/MobaFx.js` (only if needed); do not substitute code-drawn accents for the art. Keep existing true telegraphs and object geometry intact. **Accept:** each skill has its approved silhouette, visible on low-effects mode, without changing collision/targeting or hiding Q/R boundaries.
- **C3 — Three identity + HUD:** `src/three/units/gear.js`, `src/three/units/champions.js` only if required, `src/three/hud/hud.js`, `src/three/hud/hud.css`, `src/three/hud/tooltip.js`, `src/three/hud/extras.js`. Build matching beret/chest/stylus geometry and consume the same icon keys as image assets (emoji fallback only if an asset fails). **Accept:** clear match to 2D identity; four custom icons appear in the skill bar, info and tooltips at desktop and compact/touch sizes; no input changes.
- **C4 — Three VFX:** integrate the approved assets through `src/three/fx/skills/pixel.js`, `src/three/fx/identity.js`, and `src/three/fx/sprites.js` only as needed. Preserve generic authoritative telegraphs, object extents, and FX caps. **Accept:** each approved effect is distinguishable at default camera zoom and lite quality; no FX allocations outside existing caps.
- **D2 — review/QA:** capture the same Pixel scenarios in Phaser and Three and record asset provenance + results in the pilot breakdown. Test Q/W/E/R plus low-quality and compact HUD. **Accept:** zero console/page errors; visuals render with or without optional FX; all gameplay values above match before/after.

## 5. Humor pass
- Pick: “The cascade is intentional.”
- Q: “CSS says stay in your lane.”
- W: “Three breakpoints. Zero QA.”
- E: “Undoing the meeting that could’ve been an email.”
- R: “Refactoring production at 4:59.”
- Vietnamese optional: “CSS chạy máy em mà.” / “Undo cái deadline được không?”

## 6. Risks
- **Fairness:** pixel dressing can camouflage Q’s crossing line or R’s lane. Keep contrast against map/team colors; true gameplay outlines take priority over glow and particles. Verify telegraphs remain visible during dense fights and color-vision settings.
- **Intern/new-player fairness:** none expected; effects/icons provide no range, damage, cooldown, or targeting advantage. Never alter hitboxes, durations, input, or item/passive behavior.
- **Performance:** four small icons are negligible; bound FX through current Phaser live caps and Three pools/lite path. No per-frame geometry creation, new lights, or unbounded particles; keep the arena’s ≤100 synced bug budget untouched.
- **Scope/known issue:** current Three.js Pixel Q drag-cast parity is tracked separately in `TASK_STATUS.md`. Do not “fix” or conceal it as part of this visual pass; validate FX from existing cast events/offline test tooling and report the input limitation separately.
- **Measurable visual gate:** five playtesters at normal gameplay scale, without skill names, identify all four Pixel effects correctly in both renderers (≥4/5 testers per renderer); all four icons correctly matched to Q/W/E/R by ≥4/5; Q/R boundaries remain readable in every captured cast.

## 7. Implementation / verification log
- A technical spike added four hand-authored SVG files, icon-key integration, costume accents, and small VFX changes using existing events. The user rejected the SVG quality and found the VFX insufficiently different; these are **not approved art** and do not satisfy the visual goal.
- Existing code integration may be retained or revised after artist-approved deliverables are provided. No gameplay stats, cooldowns, range, hitbox, input, server data, or message contracts were changed.
- **Verified:** `node --check` passed for every modified JavaScript file; `git diff --check` passed; all four SVGs parse with the shared 128×128 viewBox; a baseline comparison confirms champion gameplay data is unchanged apart from the four `iconKey` fields. No server was left running.
- **Pending production work:** select/approve the artist or service and provide the final assets/source files. Then integrate and test in both renderers at normal/compact HUD sizes and low FX quality; verify Q/R boundary readability and input behavior. No visual acceptance result is claimed.

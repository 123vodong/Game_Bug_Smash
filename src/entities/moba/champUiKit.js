// champUiKit - asset loader + tiny helpers for the champion sprites and the HUD skin.
//   loadChampUiAssets(scene)  call once from preload(): champion atlas, Kenney UI atlas, UI font.
//   champFrame(scene, idx, row, col)  lazily registered 32x32 frame of the champion atlas.
//   uiPanel / uiBar helpers build nine-slice panels from the packed Kenney UI atlas (CC0).
// Licenses: assets/moba/champs/LICENSE.txt, assets/ui/LICENSE.txt.
import { CHAMPIONS } from '../../../shared/moba/champions.js';

export const CHAMP_ATLAS = 'champ-atlas';
export const UI_ATLAS = 'ui-atlas';
// Atlas order (assets/moba/champs/champs.json): 2 sheets per row, each sheet 24 x 8 frames of 32 px.
const ORDER = ['pixel', 'stack', 'ops', 'tester', 'zero', 'model', 'guard', 'cleaner', 'courier', 'embedded', 'dev', 'appdev', 'sprint', 'cache', 'hr', 'lint', 'barista', 'oncall'];
export const CELL = 32;
// Per champion display scale (tanks bigger, assassins smaller).
const SCALE = { stack: 1.14, guard: 1.12, oncall: 1.06, zero: 0.95, cleaner: 0.96 };
export const champScale = (id) => SCALE[id] || 1;
export const champIndex = (id) => Math.max(0, ORDER.indexOf(id));
// Animation frames (columns of a sheet): walk cycle, melee, bow, staff cast, white hit silhouette, death.
export const ANIM = { walk: [0, 1, 2, 3], melee: [4, 5, 5], bow: [8, 9, 10, 11], cast: [12, 13, 14], flash: 19, dead: [22, 23] };
export const FEET = 0.75; // feet line inside a frame (standing frames: feet at row 24 of 32)

let fontStarted = false;
/** Queue the champion atlas + UI atlas and register the HUD font. Safe to call twice. */
export function loadChampUiAssets(scene) {
  if (!scene.textures.exists(CHAMP_ATLAS)) scene.load.image(CHAMP_ATLAS, 'assets/moba/champs/champs.png');
  if (!scene.textures.exists(UI_ATLAS)) scene.load.atlas(UI_ATLAS, 'assets/ui/ui-atlas.png', 'assets/ui/ui-atlas.json');
  if (!fontStarted && typeof FontFace !== 'undefined' && typeof document !== 'undefined') {
    fontStarted = true;
    try {
      const f = new FontFace('Kenney Future Narrow', 'url(assets/ui/KenneyFutureNarrow.ttf)');
      f.load().then((ff) => document.fonts.add(ff)).catch(() => {});
    } catch (_) { /* font optional */ }
  }
}

export const champAtlasReady = (scene) => scene.textures.exists(CHAMP_ATLAS);
export const uiAtlasReady = (scene) => scene.textures.exists(UI_ATLAS);

/** Frame name for (champion index, direction row 0..7, column 0..23); registers it on first use. */
export function champFrame(scene, idx, row, col) {
  const tex = scene.textures.get(CHAMP_ATLAS);
  const name = `${idx}_${row}_${col}`;
  if (!tex.has(name)) {
    if (!tex._nearestSet) { tex.setFilter(Phaser.Textures.FilterMode.NEAREST); tex._nearestSet = true; } // pixel art: set once, whichever champion registers first
    tex.add(name, 0, (idx % 2) * 768 + col * CELL, Math.floor(idx / 2) * 256 + row * CELL, CELL, CELL);
  }
  return name;
}

/** Direction row of the sheet for a screen-space vector (0 S, 1 SW, 2 W, 3 NW, 4 N, 5 NE, 6 E, 7 SE). */
export function dirRow(dx, dy) {
  const deg = Math.atan2(dy, dx) * 180 / Math.PI;
  return ((Math.round((deg - 90) / 45) % 8) + 8) % 8;
}

/** Nine-slice panel from the UI atlas (falls back to a plain rectangle). Returns a GameObject without scroll factor changes. */
export function uiPanel(scene, x, y, w, h, { frame = 'panel_glass', tint = 0x0b1220, alpha = 0.92, edge = 14 } = {}) {
  if (!uiAtlasReady(scene)) { const r = scene.add.rectangle(x, y, w, h, tint, alpha).setStrokeStyle(2, 0x2c3a55, 1); r.setTint = () => r; return r; }
  const p = scene.add.nineslice(x, y, UI_ATLAS, frame, w, h, edge, edge, edge, edge);
  return p.setTint(tint).setAlpha(alpha);
}

/** Soft rounded gloss strip laid over a bar (static decoration; width/height in px). */
export function uiGloss(scene, x, y, w, h, alpha = 0.22) {
  if (!uiAtlasReady(scene)) return scene.add.rectangle(x, y, w, Math.max(1, h / 2), 0xffffff, alpha * 0.5);
  const p = scene.add.nineslice(x, y, UI_ATLAS, 'gloss_s', w, h, 6, 6, 0, 0);
  return p.setTint(0xffffff).setAlpha(alpha);
}

export const champIds = () => ORDER.filter((id) => CHAMPIONS[id]);

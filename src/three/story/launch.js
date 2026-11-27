// story/launch.js - Story Mode floor 1 in 3D (replaces story2/launch.js under ?renderer=3d).
//   launchStory({champ,name,floor,spells}, {Renderer}, onStop?, ctl?) -> { renderer, source, canvas, stop() }
// Builds a StorySim (renderer-free, extends OfflineSim) on the floor's makeWorld() world, wraps it in the OfflineSource seam,
// runs the same frame loop as select.js launchOffline and adds the story layer: floor dressing, bug bestiary, pickups, UI.
// Hooks into the Renderer only through its documented module objects (renderer.modules.units / .hud):
//   - units.sync is wrapped so story bugs/nests are NOT drawn by units/index.js (it would draw them as mugs); story/bugs.js draws them.
//   - units.pick is wrapped so right-click on a bug/nest still resolves to its id (attack order).
import { IS_MOBILE } from '../core/Quality.js';
import { OfflineSource } from '../core/SimSource.js';
import { StorySim } from '../../story2/StorySim.js';
import { makeWorld } from '../../entities/moba/world.js';
import { SaveManager } from '../../core/SaveManager.js';
import F1 from '../../story2/floors/f1.js';
import { createFloor } from './floor.js';
import { createBugs } from './bugs.js';
import { createPickups } from './pickups.js';
import { createStoryUi } from './ui.js';

export const FLOORS = { f1: F1 }; // mirrors StoryWorldScene.FLOORS
const getHat = () => { try { return SaveManager.getHat?.() || ''; } catch (_) { return ''; } };

function makeCanvas() {
  const c = document.createElement('canvas'); c.id = 'bs3d-canvas';
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;background:#14161c;touch-action:none;outline:none';
  c.tabIndex = 0; c.oncontextmenu = (e) => e.preventDefault();
  document.body.appendChild(c); return c;
}

/** StorySim on a floor, offline. Same world construction as StoryWorldScene._makeWorld. */
export function createStorySource({ floor = 'f1', champ = 'dev', name = 'Intern', spells = null } = {}) {
  const f = FLOORS[floor] || F1;
  const world = makeWorld({ id: f.id, w: f.w, h: f.h, bushes: f.bushes, fountain: { blue: f.breakRoom }, walls: f.walls.map((w, i) => ({ ...w, id: w.id || `${f.id}_w${i}` })) });
  let src = null;
  const sim = new StorySim({ floor: f, world, champ, name, spells, hat: getHat(), emit: (type, m) => { if (src) src._dispatch(type, m ?? {}); } });
  src = new OfflineSource(sim);
  sim.receive('hello');
  return { source: src, floorDef: f };
}

export async function launchStory(opts = {}, deps = {}, onStop = null, ctl = {}) {
  const { Renderer } = deps;
  const { source, floorDef } = createStorySource(opts);
  const canvas = makeCanvas();
  const qs = new URLSearchParams(location.search);
  const renderer = Renderer.createRenderer({ canvas, source, mode: 'story', opts: { quality: qs.get('q') || 'low' } });
  let handle = null;
  const stopTo = (fn) => () => { const h = handle; if (h) h.stop(); fn && fn(); };

  const floorV = createFloor({ scene: renderer.scene, floor: floorDef });
  const bugs = createBugs({ scene: renderer.scene, source });
  const pickups = createPickups({ scene: renderer.scene, source });
  const ui = createStoryUi({
    source, floor: floorDef, project: (x, y) => renderer.project(x, y),
    onAgain: stopTo(() => launchStory(opts, deps, onStop, ctl)),
    onChampion: stopTo(() => { if (ctl.onChampion) ctl.onChampion(); else if (onStop) onStop(); }),
    onMenu: () => { try { location.href = location.pathname + '?renderer=2d'; } catch (_) { /* ignore */ } },
  });
  const offDoor = source.on('story', (m) => { if (m && m.k === 'door') { floorV.setDoor(m.id, m.state); } });

  await renderer.ready; // modules exist from here: hide story units from units/index.js, take over picking
  const units = renderer.modules.units, hud = renderer.modules.hud;
  if (units && units.sync) {
    const origSync = units.sync, origPick = units.pick, fm = new Map(); // fm: reused filtered units map (pets only)
    let cur = null;
    const view = new Proxy({}, { get: (_, k) => (k === 'units' ? fm : cur && cur[k]) });
    units.sync = function (st, dt, t, pred) {
      if (!st) return origSync.call(units, st, dt, t, pred);
      cur = st; fm.clear();
      if (st.units && st.units.forEach) st.units.forEach((u, k) => { if (!u._story) fm.set(k, u); });
      bugs.sync(st, dt, t);
      return origSync.call(units, view, dt, t, pred);
    };
    units.pick = function (x, y) { return bugs.pick(x, y) || (origPick ? origPick.call(units, x, y) : null); };
  }
  try { hud && hud.setStatus && hud.setStatus(`📖 STORY MODE · ${floorDef.clock} · ${floorDef.name}`, '#ffd23f'); } catch (_) { /* optional */ }

  let raf = 0, last = performance.now(), dead = false, tAcc = 0;
  const minGap = IS_MOBILE ? 30 : 0;
  const loop = (now) => {
    if (dead) return;
    raf = requestAnimationFrame(loop);
    if (document.hidden) { last = now; return; }
    const dt = now - last;
    if (dt < minGap) return;
    last = now; tAcc += dt;
    try {
      source.update(dt); renderer.frame(dt);
      floorV.update(tAcc / 1000, dt / 1000); pickups.update(tAcc / 1000, dt / 1000); ui.update(now);
    } catch (e) { console.error('[three/story] frame', e); }
  };
  raf = requestAnimationFrame(loop);
  handle = {
    renderer, source, canvas, ui, bugs, pickups, floor: floorV,
    stop() {
      if (dead) return; dead = true; cancelAnimationFrame(raf);
      try { offDoor(); ui.dispose(); bugs.dispose(); pickups.dispose(); floorV.dispose(); } catch (_) { /* ignore */ }
      try { renderer.dispose(); } catch (_) { /* ignore */ }
      try { source.dispose(); } catch (_) { /* ignore */ }
      canvas.remove(); if (window.__three && window.__three.source === source) window.__three = null;
    },
  };
  window.__three = { renderer, source, story: handle };
  return handle;
}
export default launchStory;

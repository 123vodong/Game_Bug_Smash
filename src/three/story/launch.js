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
import { CHAMPIONS, CHAMPION_IDS } from '../../../shared/moba/champions.js';
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
  const world = makeWorld({ id: f.id, w: f.w, h: f.h, bushes: f.bushes, doors: f.doors || [], fountain: { blue: f.breakRoom }, walls: f.walls.map((w, i) => ({ ...w, id: w.id || `${f.id}_w${i}` })) });
  let src = null;
  const sim = new StorySim({ floor: f, world, champ, name, spells, hat: getHat(), emit: (type, m) => { if (src) src._dispatch(type, m ?? {}); } });
  src = new OfflineSource(sim);
  sim.receive('hello');
  return { source: src, floorDef: f };
}

function openStoryChampPicker(currentChamp, onPick) {
  const prev = document.getElementById('bs3d-story-pick');
  if (prev) prev.remove();
  const wrap = document.createElement('div');
  wrap.id = 'bs3d-story-pick';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(4,7,14,.84);padding:16px;font:14px Consolas,"Courier New",monospace;color:#eef3ff';
  const box = document.createElement('div');
  box.style.cssText = 'width:min(760px,96vw);max-height:90vh;overflow:auto;background:#090f1d;border:3px solid #ffd23f;border-radius:10px;padding:18px 16px;text-align:center;box-sizing:border-box';
  const h = document.createElement('h2');
  h.textContent = '📖 CHOOSE STORY CHAMPION';
  h.style.cssText = 'margin:0 0 4px;font:900 22px Arial,sans-serif;color:#ffd23f';
  const sub = document.createElement('div');
  sub.textContent = 'Pick any of the 18 office heroes to run Floor 1 in 3D';
  sub.style.cssText = 'font-size:12px;color:#9fb0d0;margin-bottom:14px';
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(136px,1fr));gap:8px;margin-bottom:14px';
  const close = () => { window.removeEventListener('keydown', onEsc); wrap.remove(); };
  const onEsc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  window.addEventListener('keydown', onEsc);
  for (const id of CHAMPION_IDS) {
    const c = CHAMPIONS[id];
    const col = c.color ? '#' + Number(c.color).toString(16).padStart(6, '0') : '#39c2ff';
    const cur = id === currentChamp;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 6px;border-radius:8px;cursor:pointer;background:${cur ? '#192a48' : '#0f172b'};border:2px solid ${cur ? '#ffd23f' : col};color:#eef3ff;font:inherit`;
    const em = document.createElement('span');
    em.textContent = c.emoji || '🐞';
    em.style.fontSize = '26px';
    const nm = document.createElement('span');
    nm.textContent = c.name || id;
    nm.style.cssText = 'font:700 13px Arial,sans-serif;color:#fff';
    const rl = document.createElement('span');
    rl.textContent = c.role || '';
    rl.style.cssText = 'font-size:11px;color:#9fb0d0';
    btn.append(em, nm, rl);
    btn.onclick = () => { close(); onPick(id); };
    grid.appendChild(btn);
  }
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'CANCEL (ESC)';
  cancel.style.cssText = 'padding:9px 20px;border-radius:6px;border:2px solid #556280;background:#121b30;color:#cfd8f0;font:700 13px Arial,sans-serif;cursor:pointer';
  cancel.onclick = close;
  box.append(h, sub, grid, cancel);
  wrap.appendChild(box);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  document.body.appendChild(wrap);
  return close;
}

export async function launchStory(opts = {}, deps = {}, onStop = null, ctl = {}) {
  const { Renderer } = deps;
  const { source, floorDef } = createStorySource(opts);
  const canvas = makeCanvas();
  const qs = new URLSearchParams(location.search);
  const quality = qs.get('q') || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'low' : 'med');
  const renderer = Renderer.createRenderer({ canvas, source, mode: 'story', opts: { quality } });
  let handle = null, closePicker = null;
  const stopTo = (fn) => () => { const h = handle; if (h) h.stop(); fn && fn(); };

  const floorV = createFloor({ scene: renderer.scene, floor: floorDef });
  const bugs = createBugs({ scene: renderer.scene, source });
  const pickups = createPickups({ scene: renderer.scene, source });
  const ui = createStoryUi({
    source, floor: floorDef, project: (x, y) => renderer.project(x, y),
    onAgain: stopTo(() => launchStory(opts, deps, onStop, ctl)),
    onChampion: () => {
      closePicker = openStoryChampPicker(opts.champ || 'dev', (id) => {
        closePicker = null;
        try { SaveManager.setStory2Pick?.(id, opts.spells || null); } catch (_) { /* ignore */ }
        stopTo(() => launchStory({ ...opts, champ: id }, deps, onStop, ctl))();
      });
    },
    onMenu: () => { try { location.href = location.pathname + '?scene=menu&renderer=3d'; } catch (_) { /* ignore */ } },
  });
  const offDoor = source.on('story', (m) => { if (m && m.k === 'door') { floorV.setDoor(m.id, m.state); } });

  await renderer.ready; // modules exist from here: hide story units from units/index.js, take over picking
  const units = renderer.modules.units, hud = renderer.modules.hud;
  if (units && units.sync) {
    const origSync = units.sync, origPick = units.pick, origPickAny = units.pickAny, fm = new Map(); // fm: reused filtered units map (pets only)
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
    units.pickAny = function (x, y) {
      const bid = bugs.pick(x, y);
      if (bid) {
        const st = source.state();
        const u = st && st.units && st.units.get ? st.units.get(bid) : null;
        if (u && u.alive !== false) {
          return { id: bid, rel: 'enemy', kind: u.kind === 'nest' ? 'tower' : 'unit', x: u.x, y: u.y, r: u.kind === 'nest' ? 110 : 75 };
        }
      }
      return origPickAny ? origPickAny.call(units, x, y) : null;
    };
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
      if (closePicker) { try { closePicker(); } catch (_) { /* ignore */ } closePicker = null; }
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

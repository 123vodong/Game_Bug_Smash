// Entry for the 3D SP campaign. launchHunt({levelIndex, canvas?, onExit}) -> Promise<{stop(), view, sim}>.
// Persistence mirrors HuntScene._commitWin (stars + dailies + hats, level best, high score, unlock next).
// Hook (coordinator adds to main.js / select.js, NOT here):
//   const { launchHunt } = await import('./three/hunt/launch.js'); launchHunt({ levelIndex, onExit: () => /* back to menu */ });
import { ensureImportMap } from '../vendor/importmap.js';
import { LEVELS, TOTAL_LEVELS } from '../../data/levels.js';
import { SaveManager } from '../../core/SaveManager.js';
import { Progress } from '../../core/Progress.js';

function makeCanvas() {
  const c = document.createElement('canvas'); c.id = 'bs3d-hunt';
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;background:#0b0c0f;touch-action:none;outline:none';
  c.oncontextmenu = (e) => e.preventDefault(); document.body.appendChild(c); return c;
}

export async function launchHunt({ levelIndex, canvas, onExit } = {}) {
  ensureImportMap();
  const [{ HuntSim }, { createHuntView }] = await Promise.all([import('./sim.js'), import('./view.js')]);
  const own = !canvas; canvas = canvas || makeCanvas();
  let idx = levelIndex ?? SaveManager.getUnlockedIndex?.() ?? 0, view = null, dead = false;
  const flags = { get: (k) => SaveManager.getFlag?.(k), set: (k, v) => SaveManager.setFlag?.(k, v) };
  const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

  function commitWin(sim, r) {
    const lvl = sim.level, prevBest = SaveManager.getLevelBest(lvl.id);
    let res = { prev: 0, best: r.stars, improved: false, missions: [], hats: [] };
    try { res = Progress.campaignClear(lvl.id, r.stars) || res; } catch (e) { console.warn('[Hunt3D] campaignClear failed', e); }
    const beat = SaveManager.setLevelBest(lvl.id, r.score);
    SaveManager.setHighScore(r.score);
    const next = sim.levelIndex + 1;
    SaveManager.setUnlockedIndex(next);
    if (next >= TOTAL_LEVELS) SaveManager.setCampaignCleared();
    return { stars: r.stars, firstClear: !(res.prev > 0) && !(prevBest > 0), newBest: (!!res.improved && res.prev > 0) || (beat && prevBest > 0), missions: res.missions || [], hats: res.hats || [] };
  }
  function boot(i) {
    return (async () => {
      if (view) view.stop();
      idx = Math.max(0, Math.min(TOTAL_LEVELS - 1, i | 0));
      const sim = new HuntSim({ levelIndex: idx, flags, touch });
      view = await createHuntView({
        canvas, sim,
        hooks: {
          onWin: (r) => commitWin(sim, r),
          retry: () => boot(idx), next: () => boot(idx + 1), again: () => boot(0),
          menu: () => { stop(); if (onExit) onExit(); },
        },
      });
      if (dead) { view.stop(); return; }
      view.start(); window.__huntView = view;
    })();
  }
  function stop() { if (dead) return; dead = true; if (view) view.stop(); if (own) canvas.remove(); window.__huntView = null; }
  await boot(idx);
  return { stop, get view() { return view; }, get sim() { return view && view.sim; }, levels: LEVELS.length };
}

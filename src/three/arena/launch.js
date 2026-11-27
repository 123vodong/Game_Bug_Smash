// launchArena({canvas?, onExit, params}) -> { source, view, input, hud, dispose() }
// Entry for the 3D Personal arena. Hook (to be added by the router owner, e.g. in screens/select.js or main.js):
//   const { launchArena } = await import('./arena/launch.js');  await launchArena({ onExit: () => location.reload(), params });
// params: { name, hat, server (ws url override), q ('low'|'med'|'high') }. Needs window.Colyseus (index.html loads it).
import { ensureImportMap } from '../vendor/importmap.js';
import { SaveManager } from '../../core/SaveManager.js';
import { hatById, isHatUnlocked } from '../../data/cosmetics.js';
import { joinError } from '../../core/Identity.js';

export async function launchArena({ canvas = null, onExit = null, params = {} } = {}) {
  ensureImportMap();
  const [{ createArenaSource }, { createArenaView }, { createArenaInput }, { createArenaHud }] = await Promise.all([
    import('./source.js'), import('./view.js'), import('./input.js'), import('./hud.js'),
  ]);
  const own = !canvas;
  if (own) {
    canvas = document.createElement('canvas'); canvas.id = 'arena3d';
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;z-index:1;background:#0a0e16;touch-action:none';
    document.body.appendChild(canvas);
  }
  const name = (params.name || SaveManager.getPlayerName?.() || `Guest-${1000 + Math.floor(Math.random() * 9000)}`).slice(0, 16);
  let hat = params.hat != null ? params.hat : (SaveManager.getHat?.() || '');
  if (hat && !isHatUnlocked(hatById(hat), SaveManager.getCareer?.() || {})) hat = '';
  const source = createArenaSource({ name, hat, url: params.server || '' });
  const view = createArenaView({ canvas, source, quality: params.q });
  let hud = null, raf = 0, disposed = false, lastT = performance.now();
  const input = createArenaInput({ canvas, source, view, hudRoot: document.body, onMenu: () => hud && hud.showModal('Break room', 'Clock out and leave the arena?', [{ label: 'KEEP SMASHING', fn: () => hud.closeModal() }, { label: 'CLOCK OUT', fn: () => { hud.closeModal(); exit(); } }]), onChatFocus: () => hud && hud.openChat() });
  hud = createArenaHud({ source, view, input, root: document.body, onExit: () => exit() });

  function exit() { dispose(); if (onExit) onExit(); }
  const onResize = () => view.resize();
  window.addEventListener('resize', onResize);
  function loop(t) {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
    try { input.update(dt); view.update(dt, t); hud.update(dt, t); } catch (e) { console.error('[arena] frame', e); }
  }
  raf = requestAnimationFrame(loop);

  const api = { source, view, input, hud, dispose, canvas };
  window.__arena = api;

  async function join() {
    try { await source.connect(); } catch (e) {
      if (disposed) return;
      console.warn('[arena] join failed:', e && e.message || e);
      if (joinError(e).code === 'DUP_TAB') {
        hud.showModal('Already playing in another tab', 'This player is already in the arena in another tab or window.', [
          { label: 'PLAY HERE', fn: async () => { const { takeover } = await import('../../core/Identity.js'); await takeover(); setTimeout(() => { hud.closeModal(); join(); }, 400); } },
          { label: 'MENU', fn: () => { hud.closeModal(); exit(); } }]);
      } else {
        hud.showModal('Could not join the arena', String(e && e.message || e), [{ label: 'RETRY', fn: () => { hud.closeModal(); join(); } }, { label: 'MENU', fn: () => { hud.closeModal(); exit(); } }]);
      }
    }
  }
  function dispose() {
    if (disposed) return; disposed = true; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize);
    try { input.dispose(); hud.dispose(); source.dispose(); view.dispose(); } catch (e) { console.error(e); }
    if (own) canvas.remove();
    if (window.__arena === api) window.__arena = null;
  }
  join();
  return api;
}

// launchArena({canvas?, onExit, params}) -> { source, view, input, hud, dispose() }
// Entry for the 3D Personal arena. Hook (to be added by the router owner, e.g. in screens/select.js or main.js):
//   const { launchArena } = await import('./arena/launch.js');  await launchArena({ onExit: () => location.reload(), params });
// params: { name, hat, server (ws url override), q ('low'|'med'|'high') }. Needs window.Colyseus (index.html loads it).
import { ensureImportMap } from '../vendor/importmap.js';
import { SaveManager } from '../../core/SaveManager.js';
import { AudioManager } from '../../core/AudioManager.js';
import { Progress } from '../../core/Progress.js';
import { hatById, isHatUnlocked } from '../../data/cosmetics.js';
import { joinError } from '../../core/Identity.js';

export async function launchArena({ canvas = null, onExit = null, params = {} } = {}) {
  ensureImportMap();
  try { AudioManager.applySaved?.(); } catch (_) { /* audio optional */ }
  const [{ createArenaSource }, { createArenaView }, { createArenaInput }, { createArenaHud }] = await Promise.all([
    import('./source.js'), import('./view.js'), import('./input.js'), import('./hud.js'),
  ]);
  const own = !canvas;
  if (own) {
    canvas = document.createElement('canvas'); canvas.id = 'arena3d';
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;z-index:1;background:#0a0e16;touch-action:none';
    document.body.appendChild(canvas);
  }
  const pGet = (k) => (params && typeof params.get === 'function' ? params.get(k) : params?.[k]);
  const pName = pGet('name'), pHat = pGet('hat'), pServer = pGet('server'), pQ = pGet('q');
  const name = (pName || SaveManager.getPlayerName?.() || `Guest-${1000 + Math.floor(Math.random() * 9000)}`).slice(0, 16);
  let hat = pHat != null ? pHat : (SaveManager.getHat?.() || '');
  if (hat && !isHatUnlocked(hatById(hat), SaveManager.getCareer?.() || {})) hat = '';
  const source = createArenaSource({ name, hat, url: pServer || '' });
  const view = createArenaView({ canvas, source, quality: pQ || undefined });
  let hud = null, raf = 0, disposed = false, lastT = performance.now(), joined = false, recorded = false;
  const offs = [
    source.on('welcome', () => { joined = true; }),
    source.on('kill', () => { try { Progress.add('bugsSmashed', 1, { daily: 'bugsSmashed' }); } catch (_) { /* ignore */ } }),
  ];
  function recordSession() {
    if (recorded || !joined) return;
    recorded = true;
    try { Progress.add('mpGames', 1, { daily: 'mpGames' }); } catch (_) { /* ignore */ }
  }
  const input = createArenaInput({ canvas, source, view, hudRoot: document.body, onMenu: () => hud && hud.showModal('Break room', 'Clock out and leave the arena?', [{ label: 'KEEP SMASHING', fn: () => hud.closeModal() }, { label: 'CLOCK OUT', fn: () => { hud.closeModal(); exit(); } }]), onChatFocus: () => hud && hud.openChat() });
  hud = createArenaHud({ source, view, input, root: document.body, onExit: () => exit() });

  function exit() {
    recordSession();
    dispose();
    if (onExit) onExit();
    else location.href = location.pathname + '?scene=menu&renderer=3d';
  }
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
    if (disposed) return; disposed = true; recordSession(); cancelAnimationFrame(raf); window.removeEventListener('resize', onResize);
    offs.forEach((f) => { try { f(); } catch (_) { /* ignore */ } });
    try { input.dispose(); hud.dispose(); source.dispose(); view.dispose(); } catch (e) { console.error(e); }
    if (own) canvas.remove();
    if (window.__arena === api) window.__arena = null;
  }
  join();
  return api;
}

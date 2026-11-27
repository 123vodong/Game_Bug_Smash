// Entry for the Three.js renderer (opt-in via ?renderer=3d or localStorage bs.renderer='3d').
// Importmap strategy: ensureImportMap() injects <script type="importmap"> mapping 'three' and 'three/addons/'
// to src/three/vendor/ BEFORE any lazy import below (all three-using modules are only loaded after it).
import { ensureImportMap } from './vendor/importmap.js';
import { showLoading, setProgress, showMessage, hideLoading } from './loading.js';

async function tryImport(path) {
  try { return await import(path); } catch (e) {
    // Missing module (not built yet) vs. a real error inside it: only swallow the former.
    const msg = String(e && e.message || e);
    if (/Failed to fetch|Failed to load|404|error loading dynamically|Cannot find|Importing a module script failed/i.test(msg)) return null;
    throw e;
  }
}

export async function bootThree({ scene, params } = {}) {
  showLoading('Loading 3D');
  const game = document.getElementById('game');
  if (game) game.style.display = 'none';
  try {
    ensureImportMap();
    setProgress(0.1, 'Loading 3D');
    const Renderer = await tryImport('./core/Renderer.js'); setProgress(0.4, 'Loading 3D');
    const Select = await tryImport('./screens/select.js'); setProgress(0.7, 'Loading 3D');
    const Room = await tryImport('./net/room.js'); setProgress(1, 'Loading 3D');
    const missing = [['core/Renderer.js', Renderer], ['screens/select.js', Select], ['net/room.js', Room]].filter(m => !m[1]).map(m => m[0]);
    if (missing.length) {
      showMessage('3D renderer not ready yet (missing: ' + missing.join(', ') + '). Remove ?renderer=3d for the 2D classic.');
      return { ready: false, missing };
    }
    const entry = Select.start || Select.default;
    if (typeof entry !== 'function') { showMessage('3D renderer not ready: screens/select.js has no start()'); return { ready: false, missing: ['select.start'] }; }
    hideLoading();
    await entry({ scene, params, Renderer, Room });
    return { ready: true };
  } catch (e) {
    console.error('[three] boot failed', e);
    showMessage('3D boot failed: ' + (e && e.message || e));
    return { ready: false, error: e };
  }
}

// Champion select + match launcher for the 3D renderer (breakdown C7). DOM only.
//   start({scene, params, Renderer, Room})   <- called by boot.js (Renderer/Room are the module namespaces)
//   launchOffline(opts, deps) / launchOnline(opts, deps) -> { renderer, source, stop() }
// Deep links: ?scene=team&champ=<id>&offline=1[&name=X][&spells=flash,heal][&sandbox=1][&lobby=ms]
//             ?scene=team&champ=<id> (online, autoLock), ?scene=story&champ=<id> -> Story floor 1 (story/launch.js).
//             anything else (scene=lobby, none) -> the select grid.
import { IS_MOBILE } from '../core/Quality.js';
import { CHAMPIONS, CHAMPION_IDS, isChampionId } from '../../../shared/moba/champions.js';
import { SPELLS, SPELL_IDS, DEFAULT_SPELLS, validSpellPair } from '../../../shared/moba/spells.js';
import { SaveManager } from '../../core/SaveManager.js';

const SPELL_KEY = 'bugsmash.team.spells';
let root = null, running = null;
const getName = () => { try { return SaveManager.getPlayerName?.() || ''; } catch (_) { return ''; } };
const getHat = () => { try { return SaveManager.getHat?.() || ''; } catch (_) { return ''; } };
function loadSpells() {
  try { const v = JSON.parse(localStorage.getItem(SPELL_KEY) || 'null'); if (Array.isArray(v) && validSpellPair(v[0], v[1])) return v; } catch (_) { /* default */ }
  return DEFAULT_SPELLS.slice();
}
function saveSpells(s) { try { localStorage.setItem(SPELL_KEY, JSON.stringify(s)); } catch (_) { /* ignore */ } }
function parseSpells(params) {
  const q = (params.get('spells') || '').split(',');
  return validSpellPair(q[0], q[1]) ? q.slice(0, 2) : loadSpells();
}

function makeCanvas() {
  const c = document.createElement('canvas'); c.id = 'bs3d-canvas';
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;background:#14161c;touch-action:none;outline:none';
  c.tabIndex = 0; c.oncontextmenu = (e) => e.preventDefault();
  document.body.appendChild(c); return c;
}

async function runMatch(source, { Renderer, mode = 'team' }, onStop) {
  closeRoot();
  const canvas = makeCanvas();
  const renderer = Renderer.createRenderer({ canvas, source, mode, opts: {} });
  window.__three = { renderer, source };
  let raf = 0, last = performance.now(), dead = false;
  const minGap = IS_MOBILE ? 30 : 0; // mobile UA: cap at ~30 fps
  const loop = (now) => {
    if (dead) return;
    raf = requestAnimationFrame(loop);
    if (document.hidden) { last = now; return; } // tab hidden: do not simulate or render
    const dt = now - last;
    if (dt < minGap) return;
    last = now;
    try { source.update(dt); renderer.frame(dt); } catch (e) { console.error('[three] frame', e); }
  };
  raf = requestAnimationFrame(loop);
  const handle = {
    renderer, source, canvas,
    stop() {
      if (dead) return; dead = true; cancelAnimationFrame(raf);
      try { renderer.dispose(); } catch (_) { /* ignore */ }
      try { source.dispose(); } catch (_) { /* ignore */ }
      canvas.remove(); if (window.__three && window.__three.source === source) window.__three = null;
      running = null; if (onStop) onStop();
    },
  };
  running = handle; return handle;
}

export async function launchOffline({ champ, name, spells, sandbox = false, lobbyMs = 0 } = {}, deps, onStop) {
  const { createSimSource } = await import('../core/SimSource.js');
  const source = await createSimSource({ offline: { champ, name: name || 'Intern', spells, hat: getHat(), sandbox, lobbyMs } });
  return runMatch(source, deps, onStop);
}

export async function launchOnline({ champ, name, spells }, deps, onStop, fallback) {
  const Room = deps.Room;
  const room = await Room.joinTeam({ champ, name: name || 'Intern', hat: getHat(), spells });
  const source = Room.createNetSource(room, {
    champ, onMenu: () => { if (running) running.stop(); },
    onPracticeOffline: () => { if (running) running.stop(); (fallback || (() => launchOffline({ champ, name, spells }, deps, onStop)))(); },
  });
  return runMatch(source, deps, onStop);
}

function closeRoot() { if (root) { root.remove(); root = null; } }
function message(text) {
  closeRoot();
  root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:#0b0f1e;color:#e8eefc;font:18px "Segoe UI",system-ui,sans-serif;text-align:center;padding:16px';
  root.textContent = text; document.body.appendChild(root);
}

function showSelect(deps, preset = {}) {
  closeRoot();
  let champ = isChampionId(preset.champ) ? preset.champ : (CHAMPION_IDS.includes('oncall') ? 'oncall' : CHAMPION_IDS[0]);
  let spells = preset.spells || loadSpells();
  root = document.createElement('div');
  root.id = 'bs3d-select';
  root.style.cssText = 'position:fixed;inset:0;z-index:9000;overflow:auto;background:#0b0f1e;color:#e8eefc;font:14px "Segoe UI",system-ui,sans-serif;padding:16px;box-sizing:border-box';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const opt = (id, sel) => `<option value="${id}"${id === sel ? ' selected' : ''}>${esc(SPELLS[id].icon)} ${esc(SPELLS[id].name)}</option>`;
  root.innerHTML = `
    <div style="max-width:1100px;margin:0 auto">
      <h1 style="margin:0 0 4px;font-size:26px">Pick your dev <small style="color:#8fa0c4;font-size:13px">3D beta</small></h1>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:10px 0">
        <input id="n" maxlength="14" placeholder="Name" style="padding:8px;border-radius:6px;border:1px solid #39c2ff;background:#141b36;color:#fff;width:150px">
        <label>D <select id="sd" style="padding:6px;background:#141b36;color:#fff;border-radius:6px">${SPELL_IDS.map((i) => opt(i, spells[0])).join('')}</select></label>
        <label>F <select id="sf" style="padding:6px;background:#141b36;color:#fff;border-radius:6px">${SPELL_IDS.map((i) => opt(i, spells[1])).join('')}</select></label>
        <span id="err" style="color:#ff7b7b"></span>
      </div>
      <div id="grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px"></div>
      <div id="info" style="margin:12px 0;min-height:2.6em;color:#b8c4e4"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button id="off" class="b">PRACTICE OFFLINE (bots)</button>
        <button id="sbx" class="b" style="background:#ffb347">SANDBOX</button>
        <button id="on" class="b" style="background:#39c2ff">PLAY ONLINE</button>
      </div>
    </div>
    <style>#bs3d-select .b{padding:12px 18px;border:0;border-radius:8px;background:#7ed957;color:#10230a;font-weight:700;font-size:15px;cursor:pointer}
    #bs3d-select .c{padding:10px;border-radius:8px;background:#141b36;border:2px solid #232c52;cursor:pointer;text-align:left;color:#e8eefc}
    #bs3d-select .c.sel{border-color:#7ed957;background:#1c2a3a}</style>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const nameEl = $('#n'); nameEl.value = preset.name || getName();
  const grid = $('#grid'), info = $('#info');
  const paintInfo = () => { const d = CHAMPIONS[champ]; info.textContent = `${d.name} ${d.title || ''} - ${d.role || ''}${d.lane ? ' (' + d.lane + ')' : ''}`; };
  for (const id of CHAMPION_IDS) {
    const d = CHAMPIONS[id], b = document.createElement('button');
    b.className = 'c' + (id === champ ? ' sel' : ''); b.dataset.id = id;
    b.innerHTML = `<b>${esc(d.name)}</b><br><span style="color:#8fa0c4;font-size:12px">${esc(d.role || '')}</span>`;
    b.onclick = () => { champ = id; grid.querySelectorAll('.c').forEach((x) => x.classList.toggle('sel', x.dataset.id === id)); paintInfo(); };
    grid.appendChild(b);
  }
  paintInfo();
  const readSpells = () => {
    const d = $('#sd').value, f = $('#sf').value;
    if (!validSpellPair(d, f)) { $('#err').textContent = 'Pick two different summoner spells'; return null; }
    $('#err').textContent = ''; spells = [d, f]; saveSpells(spells); return spells;
  };
  const go = async (kind) => {
    const sp = readSpells(); if (!sp) return;
    const name = nameEl.value.trim() || 'Intern';
    try { SaveManager.setPlayerName?.(name); } catch (_) { /* ignore */ }
    const back = () => showSelect(deps, { champ, name, spells: sp });
    try {
      if (kind === 'online') await launchOnline({ champ, name, spells: sp }, deps, back, () => launchOffline({ champ, name, spells: sp }, deps, back));
      else await launchOffline({ champ, name, spells: sp, sandbox: kind === 'sandbox' }, deps, back);
    } catch (e) {
      console.warn('[three] launch failed', e);
      if (kind === 'online') { $('#err').textContent = "Can't reach the server: " + String(e && e.message || e).slice(0, 80); }
      else { $('#err').textContent = 'Launch failed: ' + String(e && e.message || e).slice(0, 80); }
    }
  };
  $('#off').onclick = () => go('offline'); $('#sbx').onclick = () => go('sandbox'); $('#on').onclick = () => go('online');
}

export async function start({ scene, params, Renderer, Room } = {}) {
  const p = params || new URLSearchParams(location.search);
  const deps = { Renderer, Room };
  const champ = p.get('champ');
  const name = p.get('name') || getName() || 'Intern';
  const toMenu = () => start({ scene: 'menu', params: p, Renderer, Room });
  if (scene === 'hunt') { // SP campaign in 3D (src/three/hunt/launch.js)
    try {
      const { launchHunt } = await import('../hunt/launch.js');
      return await launchHunt({ levelIndex: Number(p.get('level')) || 0, onExit: toMenu });
    } catch (e) { console.error('[three] hunt launch failed', e); message('Campaign in 3D failed: ' + String(e && e.message || e).slice(0, 120)); return null; }
  }
  if (scene === 'arena') { // Personal arena in 3D (src/three/arena/launch.js); online path is unverified
    try {
      const { launchArena } = await import('../arena/launch.js');
      return await launchArena({ onExit: toMenu, params: p });
    } catch (e) { console.error('[three] arena launch failed', e); message('Arena in 3D failed: ' + String(e && e.message || e).slice(0, 120)); return null; }
  }
  if (!scene || scene === 'menu') { // 3D main menu (src/three/menu/menu.js)
    const classic = () => { location.href = location.pathname + '?renderer=2d'; };
    const navigate = async (target, o = {}) => {
      if (target === 'campaign') return start({ scene: 'hunt', params: new URLSearchParams({ level: String(o.levelIndex || 0) }), Renderer, Room });
      if (target === 'practice') return launchOffline({ champ: isChampionId(o.champ) ? o.champ : 'pixel', name: o.name || name, sandbox: true }, deps, toMenu);
      if (target === 'team') return showSelect(deps, { champ, name });
      if (target === 'story') return start({ scene: 'story', params: p, Renderer, Room });
      if (target === 'personal') return start({ scene: 'arena', params: p, Renderer, Room });
      return classic(); // personal / lobby / custom rooms are still the 2D renderer
    };
    try {
      const { startMenu } = await import('../menu/menu.js');
      return await startMenu({ params: p, navigate });
    } catch (e) { console.error('[three] menu failed, using select screen', e); showSelect(deps, { champ, name }); return null; }
  }
  if (scene === 'story') { // C11: Story floor 1 in 3D (src/three/story/launch.js)
    let saved = ''; try { saved = SaveManager.getStory2?.().champ || ''; } catch (_) { /* ignore */ }
    const sc = isChampionId(champ) ? champ : (isChampionId(saved) ? saved : 'dev');
    const back = () => showSelect(deps, { champ: sc, name });
    try {
      const { launchStory } = await import('../story/launch.js');
      return await launchStory({ champ: sc, name, floor: p.get('floor') || 'f1', spells: parseSpells(p) }, deps, back, { onChampion: back });
    } catch (e) { console.error('[three] story launch failed', e); message('Story in 3D failed: ' + String(e && e.message || e).slice(0, 120)); return null; }
  }
  if (scene === 'team' && isChampionId(champ)) {
    const spells = parseSpells(p);
    const back = () => showSelect(deps, { champ, name, spells });
    const lq = p.get('lobby');
    if (p.get('offline') === '1') {
      return launchOffline({ champ, name, spells, sandbox: p.get('sandbox') === '1', lobbyMs: lq != null && Number.isFinite(Number(lq)) ? Number(lq) : 0 }, deps, back);
    }
    try { return await launchOnline({ champ, name, spells }, deps, back); } catch (e) {
      console.warn('[three] online join failed, offline fallback', e);
      return launchOffline({ champ, name, spells }, deps, back);
    }
  }
  showSelect(deps, { champ, name });
  return null;
}
export default start;

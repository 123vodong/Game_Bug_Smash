// Champion select, custom rooms + match launcher for the 3D renderer (breakdown C7). DOM only.
//   start({scene, params, Renderer, Room})   <- called by boot.js (Renderer/Room are the module namespaces)
//   launchOffline(opts, deps) / launchOnline(opts, deps) -> { renderer, source, stop() }
// Deep links: ?scene=team&champ=<id>&offline=1[&name=X][&spells=flash,heal][&sandbox=1][&lobby=ms]
//             ?scene=team&champ=<id> (online, autoLock), ?scene=story&champ=<id> -> Story floor 1 (story/launch.js).
//             ?scene=custom[&room=<id>] or ?room=<id> -> 3D Custom Rooms screen.
//             anything else (scene=lobby, scene=select) -> the select grid.
import { IS_MOBILE } from '../core/Quality.js';
import { CHAMPIONS, CHAMPION_IDS, isChampionId } from '../../../shared/moba/champions.js';
import { SPELLS, SPELL_IDS, DEFAULT_SPELLS, validSpellPair } from '../../../shared/moba/spells.js';
import { SaveManager } from '../../core/SaveManager.js';
import { HATS, isHatUnlocked } from '../../data/cosmetics.js';
import { getPid } from '../../core/Identity.js';

const SPELL_KEY = 'bugsmash.team.spells';
const ROLES = ['ALL', 'Tank', 'Fighter', 'Mage', 'Marksman', 'Assassin', 'Jungler', 'Support'];
const ROOM_TYPE = 'team_custom';
const ROOM_MAX_HUMANS = 10;
const PER_SIDE = 5;

let root = null, running = null, rootCleanup = null;

const getName = () => { try { return SaveManager.getPlayerName?.() || ''; } catch (_) { return ''; } };
const getHat = () => { try { return SaveManager.getHat?.() || ''; } catch (_) { return ''; } };
const getCareer = () => { try { return SaveManager.getCareer?.() || {}; } catch (_) { return {}; } };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function loadSpells() {
  try { const v = JSON.parse(localStorage.getItem(SPELL_KEY) || 'null'); if (Array.isArray(v) && validSpellPair(v[0], v[1])) return v; } catch (_) { /* default */ }
  return DEFAULT_SPELLS.slice();
}
function saveSpells(s) { try { localStorage.setItem(SPELL_KEY, JSON.stringify(s)); } catch (_) { /* ignore */ } }
function parseSpells(params) {
  const q = (params.get('spells') || '').split(',');
  return validSpellPair(q[0], q[1]) ? q.slice(0, 2) : loadSpells();
}

function showToast(msg) {
  const el = document.createElement('div');
  el.textContent = String(msg);
  el.style.cssText = 'position:fixed;left:50%;top:22px;transform:translateX(-50%);z-index:11000;background:#0a1628;color:#fff;border:1px solid #39c2ff;padding:10px 18px;border-radius:8px;font:600 14px "Segoe UI",system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,217,255,.35);pointer-events:none;max-width:90vw;text-align:center';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function makeCanvas() {
  const c = document.createElement('canvas'); c.id = 'bs3d-canvas';
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;background:#14161c;touch-action:none;outline:none';
  c.tabIndex = 0; c.oncontextmenu = (e) => e.preventDefault();
  document.body.appendChild(c); return c;
}

function closeRoot() {
  if (rootCleanup) { try { rootCleanup(); } catch (_) { /* ignore */ } rootCleanup = null; }
  if (root) { root.remove(); root = null; }
}

function message(text) {
  closeRoot();
  root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:#0b0f1e;color:#e8eefc;font:18px "Segoe UI",system-ui,sans-serif;text-align:center;padding:16px';
  root.textContent = text; document.body.appendChild(root);
}

async function runMatch(source, { Renderer, mode = 'team' }, onStop, matchOpts = {}) {
  closeRoot();
  const canvas = makeCanvas();
  let handle = null;
  const renderer = Renderer.createRenderer({
    canvas,
    source,
    mode,
    opts: {
      onPlayAgain: () => {
        if (handle) handle.stop(true);
        if (matchOpts.onPlayAgain) matchOpts.onPlayAgain();
        else if (onStop) onStop();
      },
      onExit: () => {
        if (handle) handle.stop(true);
        if (matchOpts.onExit) matchOpts.onExit();
        else location.href = location.pathname + '?scene=menu&renderer=3d';
      },
    },
  });
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
  handle = {
    renderer, source, canvas,
    stop(silent = false) {
      if (dead) return; dead = true; cancelAnimationFrame(raf);
      try { renderer.dispose(); } catch (_) { /* ignore */ }
      try { source.dispose(); } catch (_) { /* ignore */ }
      canvas.remove(); if (window.__three && window.__three.source === source) window.__three = null;
      running = null; if (!silent && onStop) onStop();
    },
  };
  running = handle; return handle;
}

export async function launchOffline({ champ, name, spells, hat, sandbox = false, lobbyMs = 0 } = {}, deps, onStop, matchOpts = {}) {
  const { createSimSource } = await import('../core/SimSource.js');
  const useHat = hat !== undefined ? hat : getHat();
  const source = await createSimSource({ offline: { champ, name: name || 'Intern', spells, hat: useHat, sandbox, lobbyMs } });
  return runMatch(source, deps, onStop, matchOpts);
}

export async function launchOnline({ champ, name, spells, hat }, deps, onStop, fallback, matchOpts = {}) {
  const Room = deps.Room;
  const useHat = hat !== undefined ? hat : getHat();
  const room = await Room.joinTeam({ champ, name: name || 'Intern', hat: useHat, spells });
  const source = Room.createNetSource(room, {
    champ, onMenu: () => { if (running) running.stop(); },
    onPracticeOffline: () => { if (running) running.stop(); (fallback || (() => launchOffline({ champ, name, spells, hat: useHat }, deps, onStop, matchOpts)))(); },
  });
  return runMatch(source, deps, onStop, matchOpts);
}

async function rejoinMatch(deps, { champ, name } = {}) {
  const back = () => showSelect(deps, { champ, name });
  try {
    const room = await deps.Room.rejoinSaved();
    if (!room) {
      showToast('Match already ended');
      showSelect(deps, { champ, name });
      return null;
    }
    const source = deps.Room.createNetSource(room, {
      champ: champ || '',
      onMenu: () => { if (running) running.stop(); },
      onPracticeOffline: () => { if (running) running.stop(); launchOffline({ champ: isChampionId(champ) ? champ : 'pixel', name: name || 'Intern' }, deps, back, { onPlayAgain: back }); },
    });
    return runMatch(source, deps, back, { onPlayAgain: back });
  } catch (e) {
    console.warn('[three] rejoin failed', e);
    showToast('Match already ended');
    showSelect(deps, { champ, name });
    return null;
  }
}

function goMenu(deps) {
  if (deps?.toMenu) { closeRoot(); deps.toMenu(); }
  else location.href = location.pathname + '?scene=menu&renderer=3d';
}

function showSelect(deps, preset = {}) {
  closeRoot();
  let savedChamp = '';
  try { savedChamp = SaveManager.getTeamChamp?.() || ''; } catch (_) { /* ignore */ }
  let champ = isChampionId(preset.champ) ? preset.champ
    : (isChampionId(savedChamp) ? savedChamp : (CHAMPION_IDS.includes('oncall') ? 'oncall' : CHAMPION_IDS[0]));
  let spells = preset.spells || loadSpells();
  let roleFilter = 'ALL';
  const career = getCareer();
  const unlockedHats = HATS.filter((x) => isHatUnlocked(x, career));
  let hat = preset.hat !== undefined ? preset.hat : getHat();
  if (!unlockedHats.some((x) => x.id === hat)) hat = '';

  root = document.createElement('div');
  root.id = 'bs3d-select';
  root.style.cssText = 'position:fixed;inset:0;z-index:9000;overflow:auto;background:#0b0f1e;color:#e8eefc;font:14px "Segoe UI",system-ui,sans-serif;padding:16px;box-sizing:border-box';
  const opt = (id, sel) => `<option value="${id}"${id === sel ? ' selected' : ''}>${esc(SPELLS[id].icon)} ${esc(SPELLS[id].name)}</option>`;
  const hatOpt = (x) => `<option value="${esc(x.id)}"${x.id === hat ? ' selected' : ''}>${esc(x.emoji ? x.emoji + ' ' : '')}${esc(x.name)}</option>`;

  root.innerHTML = `
    <div style="max-width:1120px;margin:0 auto">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px">
        <button id="back-menu" class="b-ghost">← MENU</button>
        <h1 style="margin:0;font-size:26px">Pick your dev <small style="color:#8fa0c4;font-size:13px">3D beta</small></h1>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:10px 0">
        <input id="n" maxlength="14" placeholder="Name" style="padding:8px;border-radius:6px;border:1px solid #39c2ff;background:#141b36;color:#fff;width:150px">
        <label>D <select id="sd" class="selbox">${SPELL_IDS.map((i) => opt(i, spells[0])).join('')}</select></label>
        <label>F <select id="sf" class="selbox">${SPELL_IDS.map((i) => opt(i, spells[1])).join('')}</select></label>
        <label>🎩 <select id="hat" class="selbox" title="Career hat (cosmetic)">${unlockedHats.map(hatOpt).join('')}</select></label>
        <span id="err" style="color:#ff7b7b"></span>
      </div>
      <div id="roles" style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0">
        ${ROLES.map((r) => `<button class="chip${r === 'ALL' ? ' on' : ''}" data-role="${esc(r)}">${esc(r)}</button>`).join('')}
      </div>
      <div id="grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px"></div>
      <div id="preview" class="preview"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
        <button id="off" class="b">PRACTICE OFFLINE (bots)</button>
        <button id="sbx" class="b" style="background:#ffb347">SANDBOX</button>
        <button id="on" class="b" style="background:#39c2ff">PLAY ONLINE</button>
        <button id="cust" class="b" style="background:#c44dff;color:#fff">CUSTOM ROOMS</button>
      </div>
    </div>
    <style>
      #bs3d-select .b{padding:12px 18px;border:0;border-radius:8px;background:#7ed957;color:#10230a;font-weight:700;font-size:15px;cursor:pointer}
      #bs3d-select .b:hover{filter:brightness(1.08)}
      #bs3d-select .b-ghost{padding:8px 14px;border:1px solid #39c2ff88;border-radius:8px;background:#141b36;color:#7ec8ff;font-weight:700;font-size:13px;cursor:pointer}
      #bs3d-select .b-ghost:hover{border-color:#39c2ff;color:#fff}
      #bs3d-select .selbox{padding:6px 8px;background:#141b36;color:#fff;border:1px solid #2b3868;border-radius:6px}
      #bs3d-select .chip{padding:6px 12px;border-radius:16px;border:1px solid #2b3868;background:#141b36;color:#9fb3d6;font-size:12px;font-weight:700;cursor:pointer}
      #bs3d-select .chip.on{border-color:#39c2ff;background:#1d3354;color:#fff}
      #bs3d-select .c{padding:10px;border-radius:8px;background:#141b36;border:2px solid #232c52;cursor:pointer;text-align:left;color:#e8eefc}
      #bs3d-select .c.sel{border-color:#7ed957;background:#1c2a3a}
      #bs3d-select .preview{margin:14px 0 6px;padding:12px 14px;border-radius:10px;background:#121933;border:1px solid #293866}
      #bs3d-select .skills{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
      #bs3d-select .sk{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:6px;background:#1a2446;border:1px solid #2d3e72;font-size:12px;color:#dce6ff}
      #bs3d-select .sk b{color:#7ed957}
    </style>`;
  document.body.appendChild(root);

  const $ = (s) => root.querySelector(s);
  const nameEl = $('#n'); nameEl.value = preset.name || getName();
  const hatEl = $('#hat');
  hatEl.onchange = () => {
    hat = hatEl.value;
    try { SaveManager.setHat?.(hat); } catch (_) { /* ignore */ }
  };

  const grid = $('#grid'), preview = $('#preview');
  const paintPreview = () => {
    const d = CHAMPIONS[champ];
    if (!d) { preview.innerHTML = ''; return; }
    const sk = d.skills || {};
    const keys = [['Q', sk.q], ['W', sk.w], ['E', sk.e], ['R', sk.r]];
    preview.innerHTML = `
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
        <span style="font-size:20px">${esc(d.emoji || '🧑‍💻')}</span>
        <b style="font-size:17px;color:#fff">${esc(d.name)}</b>
        <span style="color:#ffd23f;font-size:13px">${esc(d.title || '')}</span>
        <span style="color:#7ec8ff;font-size:12px;margin-left:auto">${esc(d.role || '')}${d.lane ? ' · ' + esc(d.lane) : ''}</span>
      </div>
      <div class="skills">
        ${keys.map(([k, s]) => s ? `<span class="sk" title="${esc(s.desc || '')}"><b>${k}</b> ${esc(s.icon || '')} ${esc(s.name || '')}</span>` : '').join('')}
      </div>`;
  };

  const renderGrid = () => {
    grid.innerHTML = '';
    for (const id of CHAMPION_IDS) {
      const d = CHAMPIONS[id];
      if (roleFilter !== 'ALL' && !String(d.role || '').toLowerCase().includes(roleFilter.toLowerCase())) continue;
      const b = document.createElement('button');
      b.className = 'c' + (id === champ ? ' sel' : ''); b.dataset.id = id;
      b.innerHTML = `<b>${esc(d.emoji || '')} ${esc(d.name)}</b><br><span style="color:#8fa0c4;font-size:12px">${esc(d.role || '')}</span>`;
      b.onclick = () => {
        champ = id;
        try { SaveManager.setTeamChamp?.(id); } catch (_) { /* ignore */ }
        grid.querySelectorAll('.c').forEach((x) => x.classList.toggle('sel', x.dataset.id === id));
        paintPreview();
      };
      grid.appendChild(b);
    }
  };

  root.querySelectorAll('#roles .chip').forEach((btn) => {
    btn.onclick = () => {
      roleFilter = btn.dataset.role || 'ALL';
      root.querySelectorAll('#roles .chip').forEach((x) => x.classList.toggle('on', x === btn));
      renderGrid();
    };
  });

  renderGrid();
  paintPreview();

  const readSpells = () => {
    const d = $('#sd').value, f = $('#sf').value;
    if (!validSpellPair(d, f)) { $('#err').textContent = 'Pick two different summoner spells'; return null; }
    $('#err').textContent = ''; spells = [d, f]; saveSpells(spells); return spells;
  };
  const go = async (kind) => {
    const sp = readSpells(); if (!sp) return;
    const name = nameEl.value.trim() || 'Intern';
    try { SaveManager.setPlayerName?.(name); SaveManager.setHat?.(hat); SaveManager.setTeamChamp?.(champ); } catch (_) { /* ignore */ }
    const back = () => showSelect(deps, { champ, name, spells: sp, hat });
    const matchOpts = { onPlayAgain: back };
    try {
      if (kind === 'online') await launchOnline({ champ, name, spells: sp, hat }, deps, back, () => launchOffline({ champ, name, spells: sp, hat }, deps, back, matchOpts), matchOpts);
      else await launchOffline({ champ, name, spells: sp, hat, sandbox: kind === 'sandbox' }, deps, back, matchOpts);
    } catch (e) {
      console.warn('[three] launch failed', e);
      if (kind === 'online') { $('#err').textContent = "Can't reach the server: " + String(e && e.message || e).slice(0, 80); }
      else { $('#err').textContent = 'Launch failed: ' + String(e && e.message || e).slice(0, 80); }
    }
  };
  $('#back-menu').onclick = () => goMenu(deps);
  $('#off').onclick = () => go('offline');
  $('#sbx').onclick = () => go('sandbox');
  $('#on').onclick = () => go('online');
  $('#cust').onclick = () => showCustom(deps, { champ, name: nameEl.value.trim() || getName() || 'Intern', hat });
}

function showCustom(deps, preset = {}) {
  closeRoot();
  const Room = deps.Room;
  let savedChamp = '';
  try { savedChamp = SaveManager.getTeamChamp?.() || ''; } catch (_) { /* ignore */ }
  let champ = isChampionId(preset.champ) ? preset.champ
    : (isChampionId(savedChamp) ? savedChamp : (CHAMPION_IDS.includes('oncall') ? 'oncall' : CHAMPION_IDS[0]));
  let hat = preset.hat !== undefined ? preset.hat : getHat();
  let activeRoom = null;
  let handedOff = false;
  let refreshTimer = 0;

  const httpBase = () => Room.teamServerUrl().replace(/^ws/, 'http').replace(/\/+$/, '');
  const cleanRoom = (leave = true) => {
    if (activeRoom && leave && !handedOff) { try { activeRoom.leave(); } catch (_) { /* ignore */ } }
    activeRoom = null;
  };
  rootCleanup = () => {
    clearInterval(refreshTimer);
    cleanRoom(true);
  };

  root = document.createElement('div');
  root.id = 'bs3d-custom';
  root.style.cssText = 'position:fixed;inset:0;z-index:9000;overflow:auto;background:#0b0f1e;color:#e8eefc;font:14px "Segoe UI",system-ui,sans-serif;padding:16px;box-sizing:border-box';
  const champOpt = (id) => `<option value="${esc(id)}"${id === champ ? ' selected' : ''}>${esc(CHAMPIONS[id].emoji || '')} ${esc(CHAMPIONS[id].name)}</option>`;

  root.innerHTML = `
    <div style="max-width:1000px;margin:0 auto">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px">
        <button id="back-menu" class="b-ghost">← MENU</button>
        <h1 style="margin:0;font-size:24px">🏠 Custom Rooms <small style="color:#8fa0c4;font-size:13px">3D beta</small></h1>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input id="cname" maxlength="16" placeholder="Your name" class="inp" style="width:140px">
          <select id="cchamp" class="inp" title="Preferred champion">${CHAMPION_IDS.map(champOpt).join('')}</select>
        </div>
      </div>
      <div id="cerr" style="color:#ff7b7b;min-height:1.3em;margin-bottom:8px"></div>
      <div id="list-view">
        <div class="bar-box">
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <input id="rname" maxlength="28" placeholder="Room name (e.g. Friday Deploy)" class="inp" style="flex:1;min-width:180px">
            <button id="create-btn" class="b">＋ CREATE ROOM</button>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px">
            <input id="rcode" maxlength="32" placeholder="Paste room code..." class="inp" style="flex:1;min-width:180px">
            <button id="join-code-btn" class="b" style="background:#39c2ff">JOIN BY CODE</button>
            <button id="refresh-btn" class="b-ghost">⟳ REFRESH</button>
          </div>
        </div>
        <div id="rooms-list" class="panel" style="margin-top:12px">Loading open rooms…</div>
      </div>
      <div id="room-view" style="display:none"></div>
    </div>
    <style>
      #bs3d-custom .b{padding:10px 16px;border:0;border-radius:8px;background:#7ed957;color:#10230a;font-weight:700;font-size:14px;cursor:pointer}
      #bs3d-custom .b:hover{filter:brightness(1.08)}
      #bs3d-custom .b-ghost{padding:8px 14px;border:1px solid #39c2ff88;border-radius:8px;background:#141b36;color:#7ec8ff;font-weight:700;font-size:13px;cursor:pointer}
      #bs3d-custom .b-ghost:hover{border-color:#39c2ff;color:#fff}
      #bs3d-custom .inp{padding:8px 10px;border-radius:6px;border:1px solid #2b3868;background:#141b36;color:#fff;font-size:14px}
      #bs3d-custom .bar-box,#bs3d-custom .panel{background:#121933;border:1px solid #293866;border-radius:10px;padding:12px}
      #bs3d-custom .rrow{display:grid;grid-template-columns:1.6fr 1fr .7fr .8fr .8fr auto;gap:8px;align-items:center;padding:10px;border-bottom:1px solid #1e2a50}
      #bs3d-custom .rrow:last-child{border-bottom:0}
      #bs3d-custom .cols{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
      @media(max-width:680px){#bs3d-custom .cols{grid-template-columns:1fr}#bs3d-custom .rrow{grid-template-columns:1fr auto}}
      #bs3d-custom .seat{padding:8px 10px;border-radius:6px;background:#0d1428;border:1px solid #22305c;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center}
      #bs3d-custom .seat.me{border-color:#ffd23f;color:#ffd23f}
    </style>`;
  document.body.appendChild(root);

  const $ = (s) => root.querySelector(s);
  const nameEl = $('#cname');
  nameEl.value = preset.name || getName() || '';
  const champEl = $('#cchamp');
  champEl.onchange = () => {
    champ = champEl.value;
    try { SaveManager.setTeamChamp?.(champ); } catch (_) { /* ignore */ }
  };
  const codeEl = $('#rcode');
  if (preset.joinCode) codeEl.value = String(preset.joinCode).trim();
  const rnameEl = $('#rname');
  const errEl = $('#cerr');
  const listView = $('#list-view');
  const roomView = $('#room-view');
  const roomsList = $('#rooms-list');

  const curName = () => {
    const n = nameEl.value.trim() || 'Intern';
    try { SaveManager.setPlayerName?.(n); } catch (_) { /* ignore */ }
    return n;
  };

  async function fetchRooms() {
    if (activeRoom || !root) return;
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${httpBase()}/api/team/rooms`, { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(tm);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rooms = Array.isArray(data) ? data : (Array.isArray(data?.rooms) ? data.rooms : []);
      renderRooms(rooms);
    } catch (e) {
      roomsList.innerHTML = `<div style="color:#8fa0c4;padding:12px;text-align:center">Could not load rooms (${esc(e?.message || e)}). You can still Create or Join by Code.</div>`;
    }
  }

  function renderRooms(rooms) {
    if (!rooms.length) {
      roomsList.innerHTML = '<div style="color:#8fa0c4;padding:16px;text-align:center">No open custom rooms yet. Create one and share the code or invite link!</div>';
      return;
    }
    roomsList.innerHTML = '';
    for (const r of rooms) {
      const open = !r.locked && (r.phase === 'room' || !r.phase) && (r.humans | 0) < ROOM_MAX_HUMANS;
      const row = document.createElement('div');
      row.className = 'rrow';
      row.innerHTML = `
        <div><b>${esc(r.roomName || 'Untitled room')}</b><div style="font-size:11px;color:#7c90b8">code ${esc(r.roomId)}</div></div>
        <div style="color:#ffd23f">👑 ${esc(r.host || '?')}</div>
        <div>👤 ${r.humans | 0}/${ROOM_MAX_HUMANS}</div>
        <div style="color:#9fc5e8">🔵 ${r.blue | 0} · 🔴 ${r.red | 0}</div>
        <div style="color:${open ? '#7ed957' : '#ffb347'}">${open ? '🟢 open' : esc(r.phase || 'locked')}</div>
        <div><button class="b" style="padding:6px 12px;font-size:13px" ${open ? '' : 'disabled'}>${open ? 'JOIN' : 'LOCKED'}</button></div>`;
      const btn = row.querySelector('button');
      if (open) btn.onclick = () => connectCustom('join', r.roomId);
      else btn.style.opacity = '0.45';
      roomsList.appendChild(row);
    }
  }

  async function connectCustom(kind, arg) {
    if (activeRoom) return;
    if (!window.Colyseus) { errEl.textContent = 'Colyseus client script not loaded.'; return; }
    errEl.textContent = '';
    const name = curName();
    const opts = { name, champ, hat, pid: getPid() };
    try {
      const cli = new window.Colyseus.Client(Room.teamServerUrl());
      const room = kind === 'create'
        ? await cli.create(ROOM_TYPE, { ...opts, roomName: arg || `${name}'s Room` })
        : await cli.joinById(arg, opts);
      enterCustomRoom(room, name);
    } catch (e) {
      console.warn('[three:custom] connect failed', e);
      errEl.textContent = `Could not ${kind === 'create' ? 'create' : 'join'} room: ${String(e?.message || e).slice(0, 90)}`;
    }
  }

  function enterCustomRoom(room, playerName) {
    activeRoom = room;
    handedOff = false;
    clearInterval(refreshTimer);
    listView.style.display = 'none';
    roomView.style.display = 'block';

    const handoffToMatch = () => {
      if (handedOff) return;
      handedOff = true;
      activeRoom = null;
      const st = room.state;
      if (st && st.phase === 'select') {
        try { room.send('pick', { champ }); room.send('lock'); } catch (_) { /* ignore */ }
      }
      const back = () => showCustom(deps, { champ, name: playerName, hat });
      const source = Room.createNetSource(room, {
        champ,
        onMenu: () => { if (running) running.stop(); },
        onPracticeOffline: () => { if (running) running.stop(); launchOffline({ champ, name: playerName, hat }, deps, back, { onPlayAgain: back }); },
      });
      runMatch(source, deps, back, { onPlayAgain: back });
    };

    const renderRoomState = () => {
      if (handedOff || activeRoom !== room) return;
      const st = room.state;
      if (!st) return;
      if (st.phase && st.phase !== 'room') { handoffToMatch(); return; }
      const me = room.sessionId;
      const hostId = st.hostId || '';
      const isHost = !!hostId && hostId === me;
      const sides = { blue: [], red: [] };
      let myTeam = '';
      st.champions?.forEach?.((ch, key) => {
        if (!ch || ch.isBot) return;
        const team = ch.team === 'red' ? 'red' : 'blue';
        sides[team].push({ id: key, name: String(ch.name || 'Player'), host: key === hostId, me: key === me });
        if (key === me) myTeam = team;
      });
      const botLevel = (st.botLevel === 'normal' || st.botLevel === 'hard') ? st.botLevel : 'easy';
      const inviteUrl = `${location.origin}${location.pathname}?room=${encodeURIComponent(room.roomId)}&renderer=3d`;

      const renderSeats = (list) => {
        let html = '';
        for (let i = 0; i < PER_SIDE; i++) {
          const e = list[i];
          if (e) html += `<div class="seat${e.me ? ' me' : ''}"><span>${e.host ? '👑 ' : '👤 '}${esc(e.name)}</span><small>${e.host ? 'HOST ' : ''}${e.me ? '(you)' : ''}</small></div>`;
          else html += '<div class="seat" style="opacity:.55"><span>🤖 bot will fill</span></div>';
        }
        return html;
      };

      roomView.innerHTML = `
        <div class="panel">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <div>
              <b style="font-size:19px">🏠 ${esc(st.roomName || 'Custom Room')}</b>
              <span style="margin-left:10px;color:#7ec8ff;font-family:monospace">code: ${esc(room.roomId)}</span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button id="copy-code" class="b-ghost">📋 COPY CODE</button>
              <button id="copy-link" class="b-ghost">🔗 INVITE LINK</button>
              <button id="leave-room" class="b-ghost" style="border-color:#ff7b7b;color:#ff9b9b">LEAVE ROOM</button>
            </div>
          </div>
          <div class="cols">
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <b style="color:#39c2ff">🔵 BLUE TEAM (${sides.blue.length}/${PER_SIDE})</b>
                <button id="join-blue" class="b-ghost" ${myTeam === 'blue' || sides.blue.length >= PER_SIDE ? 'disabled' : ''}>${myTeam === 'blue' ? '✓ YOUR SIDE' : 'JOIN BLUE'}</button>
              </div>
              ${renderSeats(sides.blue)}
            </div>
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <b style="color:#ff6b6b">🔴 RED TEAM (${sides.red.length}/${PER_SIDE})</b>
                <button id="join-red" class="b-ghost" ${myTeam === 'red' || sides.red.length >= PER_SIDE ? 'disabled' : ''}>${myTeam === 'red' ? '✓ YOUR SIDE' : 'JOIN RED'}</button>
              </div>
              ${renderSeats(sides.red)}
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-top:12px">
            <div style="color:#8fa0c4">Bots fill empty seats · Bot level: <b style="color:#ffd23f">${esc(botLevel.toUpperCase())}</b></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${isHost ? `<button id="bot-lvl" class="b-ghost">🤖 BOT: ${esc(botLevel.toUpperCase())}</button><button id="start-now" class="b">▶ START MATCH</button>` : '<span style="color:#ffd23f">⏳ Waiting for host to start…</span>'}
            </div>
          </div>
        </div>`;

      roomView.querySelector('#copy-code').onclick = () => { navigator.clipboard?.writeText(room.roomId).catch(() => {}); showToast(`Code ${room.roomId} copied`); };
      roomView.querySelector('#copy-link').onclick = () => { navigator.clipboard?.writeText(inviteUrl).catch(() => {}); showToast('Invite link copied!'); };
      roomView.querySelector('#leave-room').onclick = () => {
        cleanRoom(true);
        roomView.style.display = 'none';
        listView.style.display = 'block';
        fetchRooms();
        refreshTimer = setInterval(fetchRooms, 5000);
      };
      const jb = roomView.querySelector('#join-blue');
      if (jb && !jb.disabled) jb.onclick = () => { try { room.send('side', { team: 'blue' }); } catch (_) { /* ignore */ } };
      const jr = roomView.querySelector('#join-red');
      if (jr && !jr.disabled) jr.onclick = () => { try { room.send('side', { team: 'red' }); } catch (_) { /* ignore */ } };
      const bl = roomView.querySelector('#bot-lvl');
      if (bl) bl.onclick = () => {
        const order = ['easy', 'normal', 'hard'];
        const next = order[(order.indexOf(botLevel) + 1) % order.length];
        try { room.send('botLevel', { level: next }); } catch (_) { /* ignore */ }
      };
      const sn = roomView.querySelector('#start-now');
      if (sn) sn.onclick = () => { try { room.send('startNow'); } catch (_) { /* ignore */ } };
    };

    room.onStateChange(renderRoomState);
    room.onLeave(() => {
      if (handedOff || activeRoom !== room) return;
      activeRoom = null;
      roomView.style.display = 'none';
      listView.style.display = 'block';
      showToast('Left custom room');
      fetchRooms();
      refreshTimer = setInterval(fetchRooms, 5000);
    });
    renderRoomState();
  }

  $('#back-menu').onclick = () => goMenu(deps);
  $('#refresh-btn').onclick = () => fetchRooms();
  $('#create-btn').onclick = () => connectCustom('create', rnameEl.value.trim());
  $('#join-code-btn').onclick = () => {
    const c = codeEl.value.trim();
    if (!c) { errEl.textContent = 'Enter a room code first.'; return; }
    connectCustom('join', c);
  };

  fetchRooms();
  refreshTimer = setInterval(fetchRooms, 5000);
}

export async function start({ scene, params, Renderer, Room } = {}) {
  const p = params || new URLSearchParams(location.search);
  const champ = p.get('champ');
  const name = p.get('name') || getName() || 'Intern';
  const toMenu = () => start({ scene: 'menu', params: new URLSearchParams({ renderer: '3d' }), Renderer, Room });
  const deps = { Renderer, Room, toMenu };

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
  if (scene === 'custom') {
    showCustom(deps, { joinCode: p.get('room') || '', name, champ });
    return null;
  }
  if (scene === 'lobby' || scene === 'select') {
    showSelect(deps, { champ, name });
    return null;
  }
  if (!scene || scene === 'menu') { // 3D main menu (src/three/menu/menu.js)
    const navigate = async (target, o = {}) => {
      if (target === 'campaign') return start({ scene: 'hunt', params: new URLSearchParams({ level: String(o.levelIndex || 0) }), Renderer, Room });
      if (target === 'practice') {
        const back = () => showSelect(deps, { champ: isChampionId(o.champ) ? o.champ : 'pixel', name: o.name || name });
        return launchOffline({ champ: isChampionId(o.champ) ? o.champ : 'pixel', name: o.name || name, sandbox: true }, deps, toMenu, { onPlayAgain: back });
      }
      if (target === 'team') {
        if (o.rejoin) return rejoinMatch(deps, { champ, name });
        return showSelect(deps, { champ, name });
      }
      if (target === 'custom') return showCustom(deps, { joinCode: o.joinCode || p.get('room') || '', name: o.name || name, champ });
      if (target === 'lobby') return showSelect(deps, { champ, name });
      if (target === 'story') return start({ scene: 'story', params: p, Renderer, Room });
      if (target === 'personal') return start({ scene: 'arena', params: p, Renderer, Room });
      return showSelect(deps, { champ, name });
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
    const matchOpts = { onPlayAgain: back };
    const lq = p.get('lobby');
    if (p.get('offline') === '1') {
      return launchOffline({ champ, name, spells, sandbox: p.get('sandbox') === '1', lobbyMs: lq != null && Number.isFinite(Number(lq)) ? Number(lq) : 0 }, deps, back, matchOpts);
    }
    try { return await launchOnline({ champ, name, spells }, deps, back, null, matchOpts); } catch (e) {
      console.warn('[three] online join failed, offline fallback', e);
      return launchOffline({ champ, name, spells }, deps, back, matchOpts);
    }
  }
  showSelect(deps, { champ, name });
  return null;
}
export default start;

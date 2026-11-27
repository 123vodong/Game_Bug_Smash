// Online glue for the 3D renderer (breakdown C7). No Phaser, no three imports.
//   teamServerUrl()                          ws url (same rules as src/ui/moba/uiKit.js teamServerUrl)
//   joinTeam({champ,name,hat,spells,autoLock}) -> Colyseus Room (joinOrCreate 'team')
//   rejoinSaved() -> Room | null             client.reconnect(saved token) (REJOIN after refresh)
//   createNetSource(room, {onModal,...})     -> stable SimSource facade (survives reconnects) with
//        .onConnection(fn({state:'ok'|'lost'|'back'|'dead', left, code})), .room, .dispose()
//        Handles: hello + time sync (inside RoomSource), saveMatch, reconnect every 2 s within
//        welcome.reconnectS, onLeave modal (reconnecting countdown, then Practice offline / Reload).
//   showModal({title, body, buttons:[{label,fn}]}) / closeModal()
import { createRoomSource } from '../core/SimSource.js';
import { getPid, saveMatch, loadMatch, clearMatch, joinError, CLOSE_TAKEN_OVER, DUP_TAB_TEXT } from '../../core/Identity.js';

const RECONNECT_EVERY_MS = 2000, ATTEMPT_MS = 5000, DEFAULT_GRACE_S = 30;
// Same list as TeamModeScene MSG_TYPES / RoomSource (SimSource.js); keep in sync.
const TYPES = ['welcome', 'time', 'atk', 'fx', 'feed', 'announce', 'gold', 'chat', 'chatHistory', 'vote', 'voteEnd', 'voteDeny', 'rank', 'dummyDps', 'story'];

export function teamServerUrl() {
  const loc = window.location;
  const o = new URLSearchParams(loc.search).get('server');
  if (o && /^wss?:\/\//.test(o)) return o;
  if (loc.port === '8000') return `ws://${loc.hostname || 'localhost'}:2567`;
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host || 'localhost:2567'}`;
}

function client() {
  if (!window.Colyseus) throw new Error('Colyseus client script not loaded');
  return new window.Colyseus.Client(teamServerUrl());
}

export async function joinTeam({ champ, name, hat = '', spells = null, autoLock = true } = {}) {
  const room = await client().joinOrCreate('team', { name, champ, autoLock, hat, pid: getPid() });
  if (Array.isArray(spells) && spells.length === 2) { try { room.send('spells', { d: spells[0], f: spells[1] }); } catch (_) { /* closed */ } }
  return room;
}

export async function rejoinSaved() {
  const saved = loadMatch(); if (!saved) return null;
  try { return await client().reconnect(saved.token); } catch (_) { clearMatch(saved.roomId); return null; }
}

export { joinError, DUP_TAB_TEXT };

// ---- DOM modal ----
let modalEl = null;
export function closeModal() { if (modalEl) { modalEl.remove(); modalEl = null; } }
export function showModal({ title = '', body = '', buttons = [] } = {}) {
  let first = false;
  if (!modalEl) {
    first = true;
    modalEl = document.createElement('div'); modalEl.id = 'bs3d-modal';
    modalEl.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(5,8,18,.78);padding:16px';
    document.body.appendChild(modalEl);
  }
  modalEl.innerHTML = '';
  const box = document.createElement('div');
  box.style.cssText = 'max-width:440px;width:100%;background:#141b36;border:2px solid #39c2ff;border-radius:12px;padding:20px;color:#e8eefc;font:15px "Segoe UI",system-ui,sans-serif;text-align:center';
  const h = document.createElement('div'); h.style.cssText = 'font-size:20px;font-weight:700;margin-bottom:10px'; h.textContent = title;
  const p = document.createElement('div'); p.style.cssText = 'white-space:pre-line;color:#b8c4e4;margin-bottom:14px'; p.textContent = body;
  box.append(h, p);
  const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap';
  for (const b of buttons) {
    const el = document.createElement('button'); el.textContent = b.label;
    el.style.cssText = 'padding:10px 16px;border-radius:8px;border:0;background:#7ed957;color:#10230a;font-weight:700;cursor:pointer;font-size:14px';
    el.onclick = () => { try { b.fn && b.fn(); } catch (e) { console.error(e); } };
    row.appendChild(el);
  }
  box.appendChild(row); modalEl.appendChild(box);
  return first;
}

// ---- reconnecting facade ----
export function createNetSource(room0, { world = null, onPracticeOffline = null, onMenu = null, champ = '' } = {}) {
  let inner = null, room = null, disposed = false, graceS = DEFAULT_GRACE_S, loopTimer = 0, ticker = 0, ended = false;
  const handlers = new Map(), conn = new Set();
  const emit = (type, m) => { const s = handlers.get(type); if (s) for (const fn of [...s]) { try { fn(m); } catch (e) { console.error('[net]', type, e); } } };
  const status = (o) => { for (const fn of [...conn]) { try { fn(o); } catch (e) { console.error(e); } } };

  const facade = {
    kind: 'online', world, get room() { return room; },
    get localId() { return inner ? inner.localId : ''; },
    state() { return inner.state(); },
    send(type, msg) { if (inner && !loopTimer) inner.send(type, msg); },
    on(type, fn) {
      let s = handlers.get(type); if (!s) handlers.set(type, s = new Set()); s.add(fn);
      if (type === 'welcome' && inner && inner.welcome) { const w = inner.welcome; queueMicrotask(() => { if (s.has(fn)) fn(w); }); }
      return () => s.delete(fn);
    },
    update() {},
    srvNow() { return inner.srvNow(); },
    onConnection(fn) { conn.add(fn); return () => conn.delete(fn); },
    dispose() { disposed = true; clearTimeout(loopTimer); clearInterval(ticker); loopTimer = 0; closeModal(); if (inner) inner.dispose(); try { room && room.leave && room.leave(); } catch (_) { /* ignore */ } },
  };

  function adopt(r) {
    if (inner) inner.dispose();
    room = r;
    inner = createRoomSource(r, { world });
    for (const t of TYPES) {
      inner.on(t, (m) => {
        if (disposed) return;
        if (t === 'welcome' && Number.isFinite(m?.reconnectS)) graceS = m.reconnectS;
        emit(t, m);
      });
    }
    inner.on('leave', ({ code }) => { if (!disposed && room === r) onLeave(code, r); });
    inner.on('error', ({ code, message }) => { if (!disposed) console.warn('[net] room error', code, message); });
    const keep = () => {
      if (disposed) return;
      if (r.roomId && r.reconnectionToken && r.state && r.state.phase !== 'ended') saveMatch({ roomId: r.roomId, token: r.reconnectionToken, champ, custom: !!(r.state && r.state.custom) });
      if (r.state && r.state.phase === 'ended') { ended = true; clearMatch(r.roomId); }
    };
    keep();
    try { r.onStateChange(keep); } catch (_) { /* older client */ }
  }

  function onLeave(code, r) {
    const token = r.reconnectionToken || '';
    ended = ended || (r.state && r.state.phase === 'ended');
    if (ended) return;
    if (code === CLOSE_TAKEN_OVER) {
      clearMatch(r.roomId);
      status({ state: 'dead', code });
      showModal({ title: DUP_TAB_TEXT.title, body: DUP_TAB_TEXT.kicked, buttons: [{ label: 'RELOAD', fn: () => location.reload() }] });
      return;
    }
    if (!token) return fail(code);
    const until = Date.now() + graceS * 1000;
    const left = () => Math.max(0, Math.ceil((until - Date.now()) / 1000));
    const paint = () => showModal({ title: 'Connection lost', body: `Reconnecting... ${left()}s\n(the server keeps your seat)`, buttons: [{ label: 'GIVE UP', fn: () => { stop(); fail(code); } }] });
    const stop = () => { clearTimeout(loopTimer); clearInterval(ticker); loopTimer = 0; ticker = 0; };
    status({ state: 'lost', left: left(), code }); paint();
    ticker = setInterval(() => { if (disposed) return stop(); status({ state: 'lost', left: left(), code }); paint(); }, 1000);
    const attempt = async () => {
      if (disposed) return stop();
      if (Date.now() >= until) { stop(); return fail(code); }
      try {
        const nr = await Promise.race([client().reconnect(token), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ATTEMPT_MS))]);
        if (disposed) { try { nr.leave(); } catch (_) { /* ignore */ } return; }
        stop(); closeModal(); adopt(nr); status({ state: 'back' });
      } catch (e) {
        if (disposed) return;
        if (joinError(e).code || /not found|expired|invalid|disposed/i.test(String(e && e.message))) { stop(); return fail(code); }
        loopTimer = setTimeout(attempt, RECONNECT_EVERY_MS);
      }
    };
    loopTimer = setTimeout(attempt, RECONNECT_EVERY_MS);
  }

  function fail(code) {
    clearMatch(room && room.roomId);
    status({ state: 'dead', code });
    const buttons = [];
    if (onPracticeOffline) buttons.push({ label: 'PRACTICE OFFLINE', fn: () => { closeModal(); onPracticeOffline(); } });
    buttons.push({ label: onMenu ? 'BACK' : 'RELOAD', fn: () => { closeModal(); if (onMenu) onMenu(); else location.reload(); } });
    showModal({ title: 'Disconnected', body: `Lost the Team Mode server (code ${code}).\nPractice offline against bots instead?`, buttons });
  }

  adopt(room0);
  return facade;
}

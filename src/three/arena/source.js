// Arena (Personal Mode) network source for the 3D renderer. No three imports, no Phaser.
//   const src = createArenaSource({ name, hat })      // not connected yet
//   await src.connect()                                // joinOrCreate('arena'); throws {code:'DUP_TAB'} on a 2nd tab
//   src.state() -> adapter { players, bugs, pickups, clouds, obstacles, bosses (live MapSchema, .get/.forEach/.size),
//                            event, eventLeftMs, eventTotalMs, crownSid, bounty, me (local Player|null) }
//   src.send(type,msg)  src.on(type,fn)->off  src.srvNow()  src.onConnection(fn({state,left,code}))  src.dispose()
// Message types forwarded to on(): welcome chat chatHistory feed announce kill ko reward brokenBy crowned pickup bossSlam bossSlamHit.
// Connection states: 'connecting' 'ok' 'stalled' 'lost'(reconnecting, left=s) 'back' 'dead'(code; 4010 = replaced by another tab).
import { teamServerUrl } from '../net/room.js';
import { getPid, joinError, CLOSE_TAKEN_OVER } from '../../core/Identity.js';

export const WORLD_W = 6000, WORLD_H = 3375; // mirrors server/game/rules.js ARENA_W/H
const TYPES = ['welcome', 'chat', 'chatHistory', 'feed', 'announce', 'kill', 'ko', 'reward', 'brokenBy', 'crowned', 'pickup', 'bossSlam', 'bossSlamHit'];
const NO_RECONNECT = new Set([1000, 4000, CLOSE_TAKEN_OVER]);
const STALL_MS = 4000, FORCE_RECONNECT_MS = 7500, ATTEMPT_MS = 5000, RETRY_MS = 2000, DEFAULT_GRACE_S = 30;

export function createArenaSource({ name = 'Guest', hat = '', url = '' } = {}) {
  let room = null, disposed = false, graceS = DEFAULT_GRACE_S, clockOffset = 0, lastRx = Date.now(), loopTimer = 0, tickTimer = 0, stalled = false, reconnecting = false;
  const handlers = new Map(), conn = new Set();
  const adapter = {
    players: null, bugs: null, pickups: null, clouds: null, obstacles: null, bosses: null,
    event: '', eventLeftMs: 0, eventTotalMs: 0, crownSid: '', bounty: 0, me: null,
  };
  const emit = (type, m) => { const s = handlers.get(type); if (s) for (const fn of [...s]) { try { fn(m); } catch (e) { console.error('[arena]', type, e); } } };
  const status = (o) => { for (const fn of [...conn]) { try { fn(o); } catch (e) { console.error(e); } } };
  const empty = new Map();

  const src = {
    kind: 'arena', world: { w: WORLD_W, h: WORLD_H }, events: {}, welcome: null,
    get room() { return room; },
    get localId() { return room ? room.sessionId : ''; },
    get open() { return !!(room && room.connection && room.connection.isOpen); },
    state() {
      const st = room && room.state;
      if (!st) { adapter.players = adapter.bugs = adapter.pickups = adapter.clouds = adapter.obstacles = adapter.bosses = empty; adapter.me = null; return adapter; }
      adapter.players = st.players || empty; adapter.bugs = st.bugs || empty; adapter.pickups = st.pickups || empty;
      adapter.clouds = st.clouds || empty; adapter.obstacles = st.obstacles || empty; adapter.bosses = st.bosses || empty;
      adapter.event = st.event || ''; adapter.eventLeftMs = st.eventLeftMs | 0; adapter.eventTotalMs = st.eventTotalMs | 0;
      adapter.crownSid = st.crownSid || ''; adapter.bounty = st.bounty | 0;
      adapter.me = adapter.players.get ? (adapter.players.get(room.sessionId) || null) : null;
      return adapter;
    },
    send(type, msg) { if (disposed || !room) return; try { room.send(type, msg); } catch (_) { /* closed: onLeave reports it */ } },
    on(type, fn) {
      let s = handlers.get(type); if (!s) handlers.set(type, s = new Set()); s.add(fn);
      if (type === 'welcome' && src.welcome) { const w = src.welcome; queueMicrotask(() => { if (s.has(fn)) fn(w); }); }
      return () => s.delete(fn);
    },
    srvNow() { return Date.now() + clockOffset; },
    onConnection(fn) { conn.add(fn); return () => conn.delete(fn); },
    async connect() {
      if (!window.Colyseus) throw new Error('Colyseus client script not loaded');
      status({ state: 'connecting' });
      const client = new window.Colyseus.Client(url || teamServerUrl());
      const r = await client.joinOrCreate('arena', { name, hat, pid: getPid() });
      if (disposed) { try { r.leave(); } catch (_) { /* ignore */ } return null; }
      adopt(r); status({ state: 'ok' }); return r;
    },
    /** Dev/test helper: server debug hooks (only honoured when the server runs BUG_SMASH_DEBUG=1). */
    debug(cmd, extra) { src.send('debug', { cmd, ...extra }); },
    dispose() {
      disposed = true; clearTimeout(loopTimer); clearInterval(tickTimer); handlers.clear(); conn.clear();
      try { room && room.leave && room.leave(); } catch (_) { /* ignore */ }
    },
  };

  function adopt(r) {
    room = r; lastRx = Date.now(); stalled = false; reconnecting = false;
    const live = () => !disposed && room === r;
    r.onStateChange(() => { if (room === r) lastRx = Date.now(); });
    for (const t of TYPES) {
      r.onMessage(t, (m) => {
        if (!live()) return;
        lastRx = Date.now();
        if (t === 'welcome' && m) {
          if (Number.isFinite(m.serverNow)) clockOffset = m.serverNow - Date.now();
          if (Number.isFinite(m.reconnectS)) graceS = Math.max(0, m.reconnectS);
          if (m.events) src.events = m.events;
          src.welcome = m;
        }
        emit(t, m || {});
      });
    }
    r.onLeave((code) => { if (live()) onLeave(code, r); });
    r.onError((code, msg) => { if (live()) console.warn('[arena] room error', code, msg); });
    r.send('hello'); // -> welcome (clock + event table) + chatHistory
    clearInterval(tickTimer);
    tickTimer = setInterval(watchdog, 1000);
  }

  // Dead-link watchdog: no patch/message for STALL_MS -> 'stalled'; for FORCE_RECONNECT_MS -> drop the socket and reconnect.
  function watchdog() {
    if (disposed || !room || reconnecting) return;
    const idle = Date.now() - lastRx;
    if (idle > STALL_MS && !stalled) { stalled = true; status({ state: 'stalled' }); }
    else if (idle <= STALL_MS && stalled) { stalled = false; status({ state: 'ok' }); }
    if (idle > FORCE_RECONNECT_MS) { const r = room; try { r.connection && r.connection.close(); } catch (_) { /* ignore */ } onLeave(1006, r); }
  }

  function onLeave(code, r) {
    if (reconnecting) return;
    clearInterval(tickTimer);
    if (code === CLOSE_TAKEN_OVER) { status({ state: 'dead', code }); return; }
    const token = r.reconnectionToken || '';
    if (NO_RECONNECT.has(code) || !token) { status({ state: 'dead', code }); return; }
    reconnecting = true;
    const until = Date.now() + graceS * 1000;
    const left = () => Math.max(0, Math.ceil((until - Date.now()) / 1000));
    const paint = setInterval(() => { if (disposed) return clearInterval(paint); status({ state: 'lost', left: left(), code }); }, 1000);
    status({ state: 'lost', left: left(), code });
    const attempt = async () => {
      if (disposed) return clearInterval(paint);
      if (Date.now() >= until) { clearInterval(paint); reconnecting = false; return status({ state: 'dead', code }); }
      try {
        const client = new window.Colyseus.Client(url || teamServerUrl());
        const nr = await Promise.race([client.reconnect(token), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ATTEMPT_MS))]);
        if (disposed) { try { nr.leave(); } catch (_) { /* ignore */ } return clearInterval(paint); }
        clearInterval(paint); adopt(nr); status({ state: 'back' });
      } catch (e) {
        if (disposed) return;
        if (/not found|expired|invalid|disposed/i.test(String(e && e.message))) { clearInterval(paint); reconnecting = false; return status({ state: 'dead', code }); }
        loopTimer = setTimeout(attempt, RETRY_MS);
      }
    };
    loopTimer = setTimeout(attempt, RETRY_MS);
  }

  return src;
}

export { joinError };

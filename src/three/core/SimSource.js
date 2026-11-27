// SimSource (breakdown 3.1): one handle over OfflineSim or a Colyseus room.
//   { kind, localId, world, state(), send(type,msg), on(type,fn)->off, update(dtMs), srvNow(), dispose() }
// Offline reads sim.clientState (fog-filtered), except sim.state when phase==='ended'.
// Extra synthetic message types on online sources: 'leave' {code}, 'error' {code,message}.
import { ServerClock } from './Clock.js';

const TIME_SYNC_MS = 10000;
class Base {
  constructor() { this._h = new Map(); this._disposed = false; this.world = null; this.localId = ''; }
  on(type, fn) {
    let s = this._h.get(type); if (!s) this._h.set(type, s = new Set()); s.add(fn);
    // late subscribers still get the one-shot welcome (offline emits it during creation)
    if (type === 'welcome' && this.welcome) { const w = this.welcome; queueMicrotask(() => { if (s.has(fn)) { try { fn(w); } catch (e) { console.error(e); } } }); }
    return () => s.delete(fn);
  }
  _dispatch(type, m) {
    if (this._disposed) return;
    if (type === 'welcome') this.welcome = m;
    const s = this._h.get(type); if (!s) return;
    for (const fn of [...s]) { try { fn(m); } catch (e) { console.error('[SimSource] handler', type, e); } }
  }
}

export class OfflineSource extends Base {
  constructor(sim) {
    super(); this.kind = 'offline'; this.sim = sim; this.localId = sim.localId || 'me'; this.world = sim.world;
  }
  state() { const s = this.sim; return s.state.phase === 'ended' ? s.state : s.clientState; }
  send(type, msg = {}) { if (!this._disposed) this.sim.receive(type, msg); }
  update(dtMs) { if (!this._disposed) this.sim.update(dtMs); }
  srvNow() { return Date.now(); }
  debug(cmd, a, b) { return this.sim.debug?.(cmd, a, b); }
  dispose() { this._disposed = true; this._h.clear(); }
}

export class RoomSource extends Base {
  // room: Colyseus Room (already joined). opts: {world, localId (default room.sessionId)}
  constructor(room, { world = null, localId = '' } = {}) {
    super(); this.kind = 'online'; this.room = room; this.world = world; this.localId = localId || room.sessionId;
    this.clock = new ServerClock(); this._unsubs = []; this._timers = [];
    const types = ['welcome', 'time', 'atk', 'fx', 'feed', 'announce', 'gold', 'chat', 'chatHistory', 'vote', 'voteEnd', 'voteDeny', 'rank', 'dummyDps', 'story'];
    for (const t of types) {
      const off = room.onMessage(t, (m) => {
        if (this._disposed) return;
        if (t === 'time') this.clock.sample(m);
        this._dispatch(t, m);
      });
      if (typeof off === 'function') this._unsubs.push(off);
    }
    const onLeave = (code) => { if (!this._disposed) this._dispatch('leave', { code }); };
    const onError = (code, message) => { if (!this._disposed) this._dispatch('error', { code, message }); };
    room.onLeave?.(onLeave); room.onError?.(onError);
    this._unsubs.push(() => room.onLeave?.remove?.(onLeave), () => room.onError?.remove?.(onError));
    this._safeSend('hello');
    const ping = () => this._safeSend('time', { t: Date.now() });
    ping();
    this._timers.push(setTimeout(ping, 700), setTimeout(ping, 1500), setInterval(ping, TIME_SYNC_MS));
  }
  _safeSend(type, msg) { if (this._disposed) return; try { this.room.send(type, msg); } catch (_) { /* closed: onLeave reports it */ } }
  state() { return this.room.state; }
  send(type, msg) { this._safeSend(type, msg); }
  update() { /* the server drives state */ }
  srvNow() { return this.clock.now(); }
  dispose() {
    this._disposed = true;
    for (const t of this._timers) { clearTimeout(t); clearInterval(t); }
    for (const u of this._unsubs) { try { u(); } catch (_) { /* ignore */ } }
    this._h.clear();
  }
}

// opts: {champ,name,lobbyMs,spells,allies,enemies,hat,world,sandbox}. Dynamic import keeps this file loadable anywhere.
export async function createOfflineSource(opts = {}) {
  const { OfflineSim } = await import('../../entities/moba/OfflineSim.js');
  let src = null;
  const sim = new OfflineSim({ ...opts, emit: (type, m) => { if (src) src._dispatch(type, m); } });
  src = new OfflineSource(sim);
  sim.receive('hello');  return src;
}
export function createRoomSource(room, opts) { return new RoomSource(room, opts); }
// createSimSource({offline:{...}}) | createSimSource({room, world})
export async function createSimSource(cfg = {}) {
  return cfg.room ? createRoomSource(cfg.room, cfg) : createOfflineSource(cfg.offline || cfg);
}

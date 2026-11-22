// server/game/Presence.js — Pass 2 RP-02: one live session per player (public id) across
// every room of this process (Personal arena + Team Mode).
//
// Entry: { pub, mode: 'arena' | 'team', room, roomId, sid, client, connected }
//   connected = the socket is open; false while a reconnect grace holds the seat.
// Rules (enforced by the rooms' onAuth via check()):
//   • a CONNECTED session elsewhere → 'DUP_TAB' — except a team lobby / custom room / ended
//     match, where the old tab is simply closed (close 4010) and the new one goes ahead
//     (no advantage there, and it avoids a false alarm on fast LEAVE → re-queue);
//   • team joins only: a held seat in a running match → 'IN_MATCH:<roomId>' (rejoin instead).
// takeover(pub) closes every connected session with 4010 ("opened in another tab").

export const CLOSE_TAKEN_OVER = 4010;
const LIVE_PHASES = new Set(['select', 'loading', 'playing']);

const byPub = new Map(); // pub -> Set<entry>

function phaseOf(e) { return e.mode === 'team' ? String(e.room?.state?.phase || '') : 'arena'; }
/** A team seat that is still in play (select / loading / playing). */
function liveTeamSeat(e) { return e.mode === 'team' && LIVE_PHASES.has(phaseOf(e)); }

function kick(e) {
  try { e.client.userData = e.client.userData || {}; e.client.userData.takenOver = true; } catch (_) { /* gone */ }
  try { e.client.leave(CLOSE_TAKEN_OVER); } catch (_) { /* already closing */ }
  e.connected = false;
}

export const Presence = {
  register(pub, { mode, room, sid, client }) {
    if (!pub) return null;
    const e = { pub, mode, room, roomId: room?.roomId || '', sid, client, connected: true };
    let set = byPub.get(pub);
    if (!set) { set = new Set(); byPub.set(pub, set); }
    set.add(e);
    return e;
  },

  /** Remove the entry of (room, sid). */
  unregister(pub, room, sid) {
    const set = pub && byPub.get(pub);
    if (!set) return;
    for (const e of set) if (e.room === room && e.sid === sid) set.delete(e);
    if (!set.size) byPub.delete(pub);
  },

  /** Drop every entry of a room (dispose / match over). */
  unregisterRoom(room) {
    for (const [pub, set] of byPub) {
      for (const e of set) if (e.room === room) set.delete(e);
      if (!set.size) byPub.delete(pub);
    }
  },

  setConnected(pub, room, sid, connected, client = null) {
    const set = pub && byPub.get(pub);
    if (!set) return;
    for (const e of set) {
      if (e.room !== room || e.sid !== sid) continue;
      e.connected = !!connected;
      if (client) e.client = client;
    }
  },

  /**
   * May `pub` join `room` (mode 'arena' | 'team')? Returns '' (yes) or an error code.
   * Side effects: closes harmless duplicates (team lobby / room / ended) and lets the arena
   * drop its own away (held) stickman of this player (`room.dropHeld?.(sid)`).
   */
  check(pub, mode, room) {
    const set = pub && byPub.get(pub);
    if (!set || !set.size) return '';
    for (const e of [...set]) {
      const ph = phaseOf(e);
      if (e.connected) {
        if (e.mode === 'team' && !LIVE_PHASES.has(ph)) { kick(e); continue; }
        return 'DUP_TAB';
      }
      if (mode === 'team' && liveTeamSeat(e) && e.room !== room) return `IN_MATCH:${e.roomId}`;
      if (e.mode === 'arena' && mode === 'arena') { try { e.room?.dropHeld?.(e.sid); } catch (_) { /* gone */ } }
    }
    return '';
  },

  /** Close every connected session of `pub` (PLAY HERE). → number closed. */
  takeover(pub) {
    const set = pub && byPub.get(pub);
    if (!set) return 0;
    let n = 0;
    for (const e of set) if (e.connected) { kick(e); n++; }
    return n;
  },

  /** The running team match `pub` still owns a seat in (connected or held) → { roomId, connected } | null. */
  teamSeat(pub) {
    const set = pub && byPub.get(pub);
    if (!set) return null;
    for (const e of set) if (liveTeamSeat(e)) return { roomId: e.roomId, connected: e.connected, phase: phaseOf(e) };
    return null;
  },

  /** Harness / tests. */
  _reset() { byPub.clear(); },
  get size() { return byPub.size; },
};

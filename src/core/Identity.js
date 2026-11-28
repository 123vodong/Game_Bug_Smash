// src/core/Identity.js — persistent player identity for ranking and reconnect.
//
// • getPid()          this browser's secret player id (32 hex, localStorage). Sent as the `pid`
//                     join option and in POST bodies only — the server shows a hashed public id.
// • apiUrl(path)      HTTP API next to the game server (same rules as the ws URL: the :8000 python
//                     dev server → :2567, `?server=` overrides).
// • fetchMe()         POST /api/me → { id, rank, match } (null when offline).
// • takeover()        POST /api/session/takeover — "PLAY HERE": closes this player's other tab.
// • saveMatch / loadMatch / clearMatch — the running Team Mode match's reconnection token, so a
//                     reload / closed tab / restarted browser can REJOIN it.
// • joinError(e)      → { code: 'DUP_TAB' | 'IN_MATCH' | '', roomId } from a Colyseus join error.
// • CLOSE_TAKEN_OVER  close code of a tab replaced by PLAY HERE (never auto-reconnect it).

const PID_KEY = 'bugSmash.pid.v1';
const MATCH_KEY = 'bugSmash.teamMatch.v1';
const MATCH_MAX_AGE_MS = 60 * 60000;  // a saved match older than this is ignored (matches end by 30 min + crunch)
export const CLOSE_TAKEN_OVER = 4010;

let memPid = '';
let memMatch = null;

function store() { try { return window.localStorage; } catch (_) { return null; } }

function randomHex32() {
  const a = new Uint8Array(16);
  try { crypto.getRandomValues(a); } catch (_) { for (let i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256); }
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getPid() {
  const ls = store();
  let v = '';
  try { v = ls?.getItem(PID_KEY) || ''; } catch (_) { v = ''; }
  if (/^[0-9a-f]{32}$/.test(v)) return v;
  if (memPid) return memPid;
  v = randomHex32();
  memPid = v;
  try { ls?.setItem(PID_KEY, v); } catch (_) { /* private mode: this tab only */ }
  return v;
}

export function apiUrl(path) {
  const loc = window.location;
  const o = new URLSearchParams(loc.search).get('server');
  if (o && /^wss?:\/\//.test(o)) return o.replace(/^ws/, 'http').replace(/\/+$/, '') + path;
  if (loc.port === '8000') return `http://${loc.hostname || 'localhost'}:2567${path}`;
  if (loc.protocol === 'http:' || loc.protocol === 'https:') return `${loc.origin}${path}`;
  return `http://localhost:2567${path}`;
}

async function postJson(path, body, ms = 4000) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
  try {
    const res = await fetch(apiUrl(path), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: ctrl?.signal, cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  } finally { if (t) clearTimeout(t); }
}

/** → { id, rank: { label, tierName, div, lp, wins, losses, games, placed, placementLeft, place, … }, match } | null */
export function fetchMe() { return postJson('/api/me', { pid: getPid() }); }

/** PLAY HERE: close this player's other live tab(s). → number closed (0 when offline). */
export async function takeover() {
  const r = await postJson('/api/session/takeover', { pid: getPid() });
  return Number(r?.closed) || 0;
}

/** → [{ id, name, rating, tierName, div, lp, label, wins, losses, … }] (≤ 50) | null */
export async function fetchLeaderboard(ms = 4000) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
  try {
    const res = await fetch(apiUrl('/api/rank/top'), { signal: ctrl?.signal, cache: 'no-store' });
    if (!res.ok) return null;
    const j = await res.json();
    return Array.isArray(j) ? j : null;
  } catch (_) {
    return null;
  } finally { if (t) clearTimeout(t); }
}

// ── running match (REJOIN) ──
/** Remember the running match: { roomId, token, champ?, custom? }. Call again after every reconnect (new token). */
export function saveMatch(m) {
  if (!m || !m.roomId || !m.token) return;
  const v = { roomId: String(m.roomId), token: String(m.token), champ: m.champ || '', custom: !!m.custom, at: Date.now() };
  memMatch = v;
  try { store()?.setItem(MATCH_KEY, JSON.stringify(v)); } catch (_) { /* memory only */ }
}

/** The saved running match (null if none / too old). */
export function loadMatch() {
  let v = null;
  try { v = JSON.parse(store()?.getItem(MATCH_KEY) || 'null'); } catch (_) { v = null; }
  if (!v) v = memMatch;
  if (!v || !v.roomId || !v.token || !(Date.now() - (v.at || 0) < MATCH_MAX_AGE_MS)) return null;
  return v;
}

/** Forget the running match (it ended, or we left on purpose). `roomId` = only if it is that one. */
export function clearMatch(roomId = '') {
  const cur = loadMatch();
  if (roomId && cur && cur.roomId !== roomId) return;
  memMatch = null;
  try { store()?.removeItem(MATCH_KEY); } catch (_) { /* ignore */ }
}

/** Colyseus join error → { code, roomId }. */
export function joinError(e) {
  const msg = String(e?.message || e || '');
  if (msg.includes('DUP_TAB')) return { code: 'DUP_TAB', roomId: '' };
  const m = msg.match(/IN_MATCH:([A-Za-z0-9_-]+)/);
  if (m) return { code: 'IN_MATCH', roomId: m[1] };
  return { code: '', roomId: '' };
}

/** Player-facing copy for the duplicate-tab case. */
export const DUP_TAB_TEXT = {
  title: '🗂️ Already open in another tab',
  body: 'Bug Smash is running in another tab or window on this browser.\nOne player = one tab (no double-dipping 😉).\nPlay here instead? The other tab will be closed.',
  kicked: "You opened Bug Smash in another tab — this one was closed.\nOne player = one tab.",
};

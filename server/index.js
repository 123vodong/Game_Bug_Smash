// BUG SMASH multiplayer server — Colyseus + static client (single process).
//
// Local dev (current LAN flow stays unchanged):
//   - `npm start` from server/ → listens on :2567
//   - Python `http.server 8000` still serves the client from the project root
//     so you can keep using http://localhost:8000 / http://<lan-ip>:8000.
//
// Production (Render/Fly): same process serves both static files AND the
// Colyseus WebSocket on the single PORT assigned by the host. Client auto-
// detects `wss://<same-host>/` on production, `ws://localhost:2567` locally.
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { monitor } from '@colyseus/monitor';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { ArenaRoom } from './rooms/ArenaRoom.js';
import { TeamRoom } from './rooms/TeamRoom.js';
import { publicIdOf } from './game/identity.js';
import { Presence } from './game/Presence.js';
import { Ranking } from './game/Ranking.js';

const PORT = process.env.PORT || 2567;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Project root is one level up from server/
const PROJECT_ROOT = path.resolve(__dirname, '..');

const app = express();
app.use(express.json());

// Static client (additive: doesn't affect the Python LAN server flow).
// Lets http://<host>:<PORT>/ load index.html on production hosts like Render.
app.use(express.static(PROJECT_ROOT, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// Live player count for the main menu ("● 3 devs online"). CORS-open because
// in local dev the client is served from :8000 and the API from :2567.
app.get('/api/stats', async (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');
  try {
    const rooms = await matchMaker.query({ name: 'arena' });
    const online = rooms.reduce((s, r) => s + (r.clients || 0), 0);
    const bots = rooms.reduce((s, r) => s + (r.metadata?.bots || 0), 0);
    // Team Mode (additive fields — `online` stays the arena count).
    // v4: custom rooms (team_custom) count as Team Mode too.
    const teamRooms = [...await matchMaker.query({ name: 'team' }), ...await matchMaker.query({ name: 'team_custom' })];
    const teamOnline = teamRooms.reduce((s, r) => s + (r.clients || 0), 0);
    res.json({ online, bots, rooms: rooms.length, teamOnline, teamRooms: teamRooms.length });
  } catch (err) {
    res.json({ online: 0, bots: 0, rooms: 0, teamOnline: 0, teamRooms: 0 });
  }
});

// Team Mode v4 custom rooms list (TEAM_MODE_V4_BREAKDOWN.md §3.1): newest first, ≤ 50.
// [{ roomId, roomName, host, humans, blue, red, phase, locked }] — cheap (matchMaker.query), no auth.
app.get('/api/team/rooms', async (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');
  try {
    const rooms = await matchMaker.query({ name: 'team_custom' });
    const ts = (r) => { const t = new Date(r.createdAt || 0).getTime(); return Number.isFinite(t) ? t : 0; };
    const list = rooms
      .filter((r) => !r.private)
      .sort((a, b) => ts(b) - ts(a))
      .slice(0, 50)
      .map((r) => {
        const m = r.metadata || {};
        return {
          roomId: r.roomId,
          roomName: typeof m.roomName === 'string' ? m.roomName : '',
          host: typeof m.host === 'string' ? m.host : '',
          humans: Number(m.humans) || 0,
          blue: Number(m.blue) || 0,
          red: Number(m.red) || 0,
          phase: typeof m.phase === 'string' ? m.phase : '',
          locked: !!r.locked,
        };
      });
    res.json(list);
  } catch (err) {
    res.json([]);
  }
});

// ── Pass 2: player status, ranking, one-tab takeover (PASS2_BREAKDOWN.md) ──
// The secret `pid` only travels in POST bodies (never in a URL / log); responses carry the
// public id. CORS-open like /api/stats (the :8000 dev client calls :2567).
const cors = (res) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Cache-Control', 'no-cache'); };
app.options(['/api/me', '/api/session/takeover'], (_req, res) => { cors(res); res.setHeader('Access-Control-Allow-Methods', 'POST'); res.sendStatus(204); });

// POST /api/me {pid} → { id, rank (profile + place), match: { roomId, phase, connected } | null }
app.post('/api/me', (req, res) => {
  cors(res);
  const pub = publicIdOf(req.body?.pid);
  if (!pub) { res.status(400).json({ error: 'bad pid' }); return; }
  const rank = Ranking.profile(pub);
  res.json({ id: pub, rank: { ...rank, place: Ranking.place(pub) }, match: Presence.teamSeat(pub) });
});

// POST /api/session/takeover {pid} → closes this player's other live tab(s) (close 4010).
app.post('/api/session/takeover', (req, res) => {
  cors(res);
  const pub = publicIdOf(req.body?.pid);
  if (!pub) { res.status(400).json({ error: 'bad pid' }); return; }
  res.json({ closed: Presence.takeover(pub) });
});

// GET /api/rank/top → leaderboard (placed players, ≤ 50).
app.get('/api/rank/top', (_req, res) => {
  cors(res);
  try { res.json(Ranking.top(50)); } catch (_) { res.json([]); }
});

// Dev-only Colyseus monitor (lists active rooms + clients and can DISPOSE them),
// so it is OPT-IN: BUG_SMASH_MONITOR=1. Without it /colyseus is a plain 404.
const MONITOR = process.env.BUG_SMASH_MONITOR === '1';
if (MONITOR) app.use('/colyseus', monitor());

const httpServer = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Personal Mode = singleton: ONE shared arena room everyone joins, until full.
// `.filterBy([])` makes matchmaking ignore client-passed options when picking
// an existing room, so all players land in the same instance regardless of
// what name/options they sent. Falls through to a 2nd room only when the first
// hits maxClients (32, set inside ArenaRoom.onCreate).
gameServer.define('arena', ArenaRoom).filterBy([]);

// Team Mode ("Office Siege", 5v5 MOBA): rooms fill up to 10 humans during the
// 30–45 s lobby (or everyone READY), then lock; bots take every empty slot. joinOrCreate options:
// { champ, name, hat, pid } (Pass 2: pid = the browser player id → one tab per player + ranking).
// The define options win over client options, so a quick-play client can't turn itself custom.
gameServer.define('team', TeamRoom, { custom: false });

// v4 custom rooms ("Room mode"): client.create('team_custom', { name, roomName }) /
// client.joinById(roomId, { name }). Phase 'room' (pick a side, host starts) → select → …
gameServer.define('team_custom', TeamRoom, { custom: true });

gameServer.listen(PORT).then(() => {
  console.log(`[bug-smash-server] listening on ws://localhost:${PORT}`);
  if (MONITOR) console.log(`[bug-smash-server] monitor at http://localhost:${PORT}/colyseus`);
});

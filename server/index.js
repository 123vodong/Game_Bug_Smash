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
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { monitor } from '@colyseus/monitor';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { ArenaRoom } from './rooms/ArenaRoom.js';

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

// Dev-only Colyseus monitor (lists active rooms + clients).
app.use('/colyseus', monitor());

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

gameServer.listen(PORT).then(() => {
  console.log(`[bug-smash-server] listening on ws://localhost:${PORT}`);
  console.log(`[bug-smash-server] monitor at http://localhost:${PORT}/colyseus`);
});

// Headless Team Mode client ("Office Siege" 5v5): joins `team` as a human and
// watches (or autopilots) a match, logging state + server messages.
//
// Usage:  node team_sim.mjs [seconds=120] [--start] [--auto] [--every=10] [--until-end] [--champ=pixel] [--name=Watcher]
//          [--movement]  verify an authoritative human move order changes the synced champion position
//         node team_sim.mjs --exploits           # malicious-message regression for order/cast/buy/recall/chat
//                                                 # + v2 walls/pets/knockback checks (need BUG_SMASH_DEBUG=1)
//                                                 # + v3 champion select (pick/lock/spells) + summoner spell checks
//                                                 # + v4 bushes (StateView vision, hidden targeting, reveal, auto-aim)
//                                                 #   + custom rooms (team_custom, side, host, startNow, /api/team/rooms)
//   --soak[=S]   v4: StateView decode soak (needs BUG_SMASH_DEBUG=1): custom room, host blue + guest red,
//                both autopiloted + teleporting in / out of bushes for S seconds (default 180); every
//                colyseus.js decode error ("refId" not found …) fails it, and each client's decoded
//                champions must match what the server lets that team see (no ghosts).
//   --start      send `startNow` right after joining (skip the 12 s lobby)
//   --autolock   v3: join with {autoLock:true} (default: hover via `champ`, then `pick` + `lock` in select)
//   --spells=D,F v3: summoner spells sent in the lobby (e.g. ghost,ignite)
//   --auto       dev servers only: `debug {cmd:'autopilot'}` → a bot brain drives your champion (a real 5v5)
//   --until-end  keep running past <seconds> until the match ends and the server disconnects us
//   --debug=gold,level,epic:golden,epic:deadline,win   fire dev commands once the match is playing
// Env: SERVER=ws://localhost:2600 (default). Debug commands need the server started with BUG_SMASH_DEBUG=1.
import { Client } from 'colyseus.js';
import http from 'node:http';
import { isBlocked, nearestFree, segmentClear } from '../../shared/moba/nav.js';
import { CHAMP_RADIUS, MAP_W, MAP_H, bushAt } from '../../shared/moba/map.js';

/** GET → parsed JSON (or null). */
const httpJson = (url) => new Promise((res) => {
  const req = http.get(url, { agent: false }, (r) => { let b = ''; r.on('data', (d) => { b += d; }); r.on('end', () => { try { res(JSON.parse(b)); } catch (_) { res(null); } }); });
  req.on('error', () => res(null));
  req.setTimeout(3000, () => { req.destroy(); res(null); });
});

/** GET → true on HTTP 200 (node:http, no keep-alive: fetch + process.exit trips a libuv assert on Windows). */
const httpOk = (url) => new Promise((res) => {
  const req = http.get(url, { agent: false }, (r) => { r.resume(); res(r.statusCode === 200); });
  req.on('error', () => res(false));
  req.setTimeout(3000, () => { req.destroy(); res(false); });
});

const args = process.argv.slice(2);
const flag = (name, def) => { const a = args.find((x) => x === `--${name}` || x.startsWith(`--${name}=`)); if (!a) return def; const v = a.split('=')[1]; return v === undefined ? true : v; };
const positional = args.filter((a) => !a.startsWith('--'));
const SECS = Number(positional[0] || 120);
const SERVER = process.env.SERVER || 'ws://localhost:2600';
const EVERY = Number(flag('every', 10));
const CHAMP = flag('champ', 'pixel');
const NAME = flag('name', 'Watcher');
const DEBUG_CMDS = String(flag('debug', '') || '').split(',').filter(Boolean);
const EXPLOITS = !!flag('exploits', false);
const MOVEMENT_TEST = !!flag('movement', false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const client = new Client(SERVER);
if (flag('soak', false)) process.exit(await runSoak(Number(flag('soak', 180)) || 180));
const AUTOLOCK = !!flag('autolock', false) && !flag('exploits', false);
const room = await client.joinOrCreate('team', { champ: CHAMP, name: NAME, ...(AUTOLOCK ? { autoLock: true } : {}), ...(EXPLOITS ? { hat: 'duck' } : {}) });
const t0 = Date.now();
let skew = 0;
const ts = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6);
const counts = {};
const bump = (k, n = 1) => { counts[k] = (counts[k] || 0) + n; };
const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
let welcome = null;
let left = false;
room.onLeave((code) => { left = true; console.log(`${ts()} LEFT room (code ${code})`); });

room.onMessage('welcome', (m) => { bump('welcome'); welcome = m; skew = m.serverNow - Date.now(); console.log(`${ts()} welcome team=${m.team} champ=${m.champ} skew=${skew}ms`); });
const feedLog = []; // EP-03 checks look for the disconnect / reconnect lines
room.onMessage('feed', (m) => { bump('feed'); feedLog.push(m.text); if (feedLog.length > 300) feedLog.shift(); if (!EXPLOITS) console.log(`${ts()} feed     ${m.text}`); });
room.onMessage('announce', (m) => { bump('announce'); if (!EXPLOITS) console.log(`${ts()} ANNOUNCE ${m.title}${m.sub ? ' — ' + m.sub : ''}${m.big ? ' [big]' : ''}`); });
room.onMessage('chat', (m) => { bump('chat'); if (!EXPLOITS) console.log(`${ts()} chat     ${m.kind || 'human'} ${m.name}: ${m.text}`); });
room.onMessage('chatHistory', (m) => bump('chatHistory'));
room.onMessage('gold', (m) => { bump('gold'); bump('goldSum', m.n); });
room.onMessage('atk', (m) => { bump('atk'); bump('atkEntries', m.length); });
const fxLog = []; // v2 exploit checks read knock / blink / dash payloads
room.onMessage('fx', (m) => { bump('fx'); bump(`fx_${m.k}`); if (m.k === 'knock' || m.k === 'blink' || m.k === 'dash' || m.k === 'petatk' || m.k === 'zone' || m.k === 'spell' || m.k === 'proj') { fxLog.push({ ...m, at: Date.now() }); if (fxLog.length > 400) fxLog.shift(); } });
room.send('hello');

// ── Contract spot-check (field presence) on the first full state ──
const FIELDS = {
  champion: ['x', 'y', 'team', 'champ', 'name', 'isBot', 'level', 'xp', 'gold', 'hp', 'maxHp', 'mana', 'maxMana', 'ad', 'ap', 'armor', 'ms', 'range', 'as',
    'dead', 'respawnAt', 'kills', 'deaths', 'assists', 'cs', 'items', 'cdQ', 'cdW', 'cdE', 'cdR', 'stunnedUntil', 'rootedUntil', 'slowUntil', 'slowPct',
    'shield', 'buffs', 'recallUntil', 'action', 'action_seq', 'targetId', 'locked', 'spellD', 'spellF', 'cdD', 'cdF', 'inBush', 'hat'],
  unit: ['x', 'y', 'team', 'kind', 'hp', 'maxHp', 'alive', 'hit_seq', 'campId', 'owner'],
  structure: ['x', 'y', 'team', 'kind', 'lane', 'tier', 'hp', 'maxHp', 'alive', 'invulnerable'],
  state: ['phase', 'lobbyEndsAt', 'startedAt', 'winner', 'blueKills', 'redKills', 'buffBlue', 'buffBlueUntil', 'buffRed', 'buffRedUntil', 'epicGoldenAt', 'epicDeadlineAt', 'selectEndsAt', 'loadingEndsAt',
    'custom', 'roomName', 'hostId', 'scores', 'winReason'],
  score: ['team', 'champ', 'name', 'isBot', 'level', 'kills', 'deaths', 'assists', 'cs', 'items', 'dead', 'respawnAt', 'spellD', 'spellF'],
};
function contractCheck() {
  const st = room.state;
  const miss = [];
  for (const f of FIELDS.state) if (st[f] === undefined) miss.push(`state.${f}`);
  st.champions.forEach((c, sid) => { for (const f of FIELDS.champion) if (c[f] === undefined) miss.push(`champions[${sid}].${f}`); if (c.items && c.items.length !== 6) miss.push(`champions[${sid}].items.length=${c.items.length}`); });
  st.structures.forEach((s, id) => { for (const f of FIELDS.structure) if (s[f] === undefined) miss.push(`structures[${id}].${f}`); });
  st.units.forEach((u, id) => { for (const f of FIELDS.unit) if (u[f] === undefined) miss.push(`units[${id}].${f}`); });
  st.scores?.forEach((s, id) => { for (const f of FIELDS.score) if (s[f] === undefined) miss.push(`scores[${id}].${f}`); });
  return [...new Set(miss.map((m) => m.replace(/\[[^\]]+\]/, '[*]')))];
}

function summary() {
  const st = room.state;
  const me = st.champions.get(room.sessionId);
  const teams = { blue: [], red: [] };
  st.champions.forEach((c) => teams[c.team]?.push(c));
  const down = { blue: 0, red: 0 };
  st.structures.forEach((s) => { if (!s.alive) down[s.team]++; });
  let minions = 0, monsters = 0;
  st.units.forEach((u) => { if (!u.alive) return; if (u.team === 'neutral') monsters++; else minions++; });
  const lv = (t) => teams[t].length ? (teams[t].reduce((s, c) => s + c.level, 0) / teams[t].length).toFixed(1) : '-';
  const gold = (t) => teams[t].reduce((s, c) => s + c.gold, 0);
  const now = Date.now() + skew;
  const clock = st.startedAt ? fmt(now - st.startedAt) : `lobby ${st.lobbyEndsAt ? Math.max(0, Math.ceil((st.lobbyEndsAt - now) / 1000)) + 's' : '-'}`;
  const mine = me ? ` | me ${me.champ} L${me.level} ${me.hp}/${me.maxHp}hp ${me.gold}g ${me.kills}/${me.deaths}/${me.assists} cs${me.cs}${me.dead ? ' DEAD' : ''}${me.recallUntil ? ' recall' : ''} [${[...me.items].filter(Boolean).join(',')}]` : '';
  console.log(`${ts()} STATE ${st.phase} ${clock} kills B${st.blueKills}/R${st.redKills} structsLost B${down.blue}/R${down.red} lvl B${lv('blue')}/R${lv('red')} gold B${gold('blue')}/R${gold('red')} units ${minions}m/${monsters}n synced=${st.champions.size + st.units.size + st.structures.size}${mine}`);
}

await sleep(800);
const missing = contractCheck();
console.log(`${ts()} contract: champions=${room.state.champions.size} structures=${room.state.structures.size} units=${room.state.units.size} phase=${room.state.phase} ${missing.length ? 'MISSING ' + missing.join(' ') : 'all §3.1 fields present'}`);

if (EXPLOITS) {
  process.exit(await runExploits());
}

if (flag('spells', '')) { const [d, f] = String(flag('spells', '')).split(','); room.send('spells', { d, f }); console.log(`${ts()} >>> spells ${d}/${f}`); }
if (flag('start', false)) { room.send('startNow'); console.log(`${ts()} >>> startNow`); }
let pickSent = false;
let autoSent = false, debugSent = false, lastPhase = '';
let lastSummary = 0;
let movementStartedAt = 0, movementStart = null, movementResult = null;
const deadline = t0 + SECS * 1000;
const untilEnd = !!flag('until-end', false);
while (!left && (Date.now() < deadline || (untilEnd && room.state.phase !== 'ended') || (MOVEMENT_TEST && movementStartedAt && movementResult === null))) {
  const st = room.state;
  if (st.phase !== lastPhase) {
    lastPhase = st.phase;
    console.log(`${ts()} PHASE → ${st.phase}${st.winner ? ' winner=' + st.winner : ''}`);
    if (st.phase === 'playing') console.log(`${ts()} contract (playing): ${contractCheck().join(' ') || 'all §3.1 fields present'}`);
    if (st.phase === 'loading') {
      const rows = [];
      st.champions.forEach((c) => rows.push(`${c.team[0]}:${c.champ}${c.isBot ? '' : '*'}(${c.spellD}/${c.spellF})`));
      console.log(`${ts()} draft: ${rows.join(' ')}`);
    }
  }
  // v3: drive champion select — pick + lock (or autoLock at join).
  if (st.phase === 'select' && !pickSent) {
    pickSent = true;
    const me = st.champions.get(room.sessionId);
    if (me && !me.locked) {
      room.send('pick', { champ: CHAMP });
      await sleep(250);
      room.send('lock');
      await sleep(250);
      console.log(`${ts()} >>> pick ${CHAMP} + lock → champ=${me.champ} locked=${me.locked}`);
    }
  }
  if (st.phase === 'playing') {
    if (MOVEMENT_TEST && !movementStartedAt) {
      const me = st.champions.get(room.sessionId);
      if (me) {
        movementStart = { x: me.x, y: me.y };
        const x = Math.max(100, Math.min(MAP_W - 100, me.x + (me.team === 'blue' ? 400 : -400)));
        room.send('order', { type: 'move', x, y: me.y });
        movementStartedAt = Date.now();
        console.log(`${ts()} >>> movement check ${Math.round(me.x)},${Math.round(me.y)} → ${Math.round(x)},${Math.round(me.y)}`);
      }
    } else if (MOVEMENT_TEST && movementStartedAt && movementResult === null && Date.now() - movementStartedAt >= 2000) {
      const me = st.champions.get(room.sessionId);
      const moved = me && movementStart ? Math.hypot(me.x - movementStart.x, me.y - movementStart.y) : 0;
      movementResult = moved > 80;
      console.log(`${movementResult ? 'PASS' : 'FAIL'}  online move order changes synced position (${Math.round(moved)} px)`);
    }
    if (flag('auto', false) && !autoSent) { autoSent = true; room.send('debug', { cmd: 'autopilot' }); console.log(`${ts()} >>> debug autopilot`); }
    if (DEBUG_CMDS.length && !debugSent) {
      debugSent = true;
      for (const c of DEBUG_CMDS) {
        const [cmd, id] = c.split(':');
        room.send('debug', { cmd, id, team: id });
        console.log(`${ts()} >>> debug ${cmd}${id ? ' ' + id : ''}`);
        await sleep(300);
      }
    }
  }
  if (Date.now() - lastSummary >= EVERY * 1000) { lastSummary = Date.now(); summary(); }
  await sleep(250);
}
if (MOVEMENT_TEST && movementResult === null) {
  movementResult = false;
  console.log('FAIL  online movement test did not reach a playing champion');
}
summary();
if (room.state.phase === 'ended' && !left) {
  console.log(`${ts()} match ended (winner ${room.state.winner}); waiting for the server to close the room…`);
  for (let i = 0; i < 100 && !left; i++) await sleep(250);
}
// Final scoreboard
const rows = [];
room.state.champions.forEach((c, sid) => rows.push(`  ${c.team.padEnd(4)} ${c.champ.padEnd(6)} ${c.name.padEnd(16)} ${c.isBot ? 'bot  ' : 'HUMAN'} L${String(c.level).padStart(2)} ${c.kills}/${c.deaths}/${c.assists} cs ${c.cs} gold ${c.gold} [${[...c.items].filter(Boolean).join(',')}]${sid === room.sessionId ? '  ← me' : ''}`));
console.log(rows.sort().join('\n'));
console.log('--- message counts:', JSON.stringify(counts));
if (!left) await room.leave();
process.exit(MOVEMENT_TEST && !movementResult ? 1 : 0);

// ───────────────────────── exploit regression ─────────────────────────
async function runExploits() {
  const results = [];
  const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
  check('EP-03 / Pass 2: welcome carries reconnectS (client auto-retry = 300 s; the seat is held for the match)', welcome?.reconnectS === 300, `welcome=${JSON.stringify(welcome)}`);
  // v2: three more humans so the wall / pet / knockback checks have casters + victims.
  //   main = pixel (blue, blink) · B = guard (red, knockback E) · C = embedded (blue, pet) · D = appdev (red, dash E)
  const extra = {};
  // EP-06 hats: B a bogus id, C 'badge' (new EP-06 id — expected per the server allowlist), D a non-string.
  const HAT_OPT = { B: 'crown<script>', C: 'badge', D: { toString: 'duck' } };
  for (const [k, champ] of [['B', 'guard'], ['C', 'embedded'], ['D', 'appdev']]) {
    try {
      const r = await new Client(SERVER).joinOrCreate('team', { champ, name: `Exploit${k}`, autoLock: true, hat: HAT_OPT[k] });
      r.onMessage('*', () => {});
      extra[k] = r;
    } catch (err) { console.log(`      (could not join extra client ${k}: ${err.message})`); }
  }
  await sleep(400);
  const me = () => room.state.champions.get(room.sessionId);
  {
    const { sanitizeHat } = await import('../../server/data/cosmetics.js');
    const hatOf = (r) => room.state.champions.get(r.sessionId)?.hat;
    check("EP-06: join option hat:'duck' → TeamChamp.hat synced", me()?.hat === 'duck', `hat='${me()?.hat}'`);
    check("EP-06: bogus / non-string hat → ''", (!extra.B || hatOf(extra.B) === '') && (!extra.D || hatOf(extra.D) === ''), `B='${extra.B && hatOf(extra.B)}' D='${extra.D && hatOf(extra.D)}'`);
    if (extra.C) check(`EP-06: hat:'badge' → '${sanitizeHat('badge')}' (server allowlist${sanitizeHat('badge') ? '' : ' has no badge yet'})`, hatOf(extra.C) === sanitizeHat('badge'), `C='${hatOf(extra.C)}'`);
    let botHats = 0;
    room.state.champions.forEach((c) => { if (c.isBot && c.hat) botHats++; });
    check('EP-06: bots wear no hat', botHats === 0, `botHats=${botHats}`);
  }
  await v3SelectChecks(check, me, extra);
  check('match reaches playing (select → loading → playing)', room.state.phase === 'playing', `phase=${room.state.phase}`);
  await sleep(600);
  const finite = () => Number.isFinite(me().x) && Number.isFinite(me().y);

  room.send('order', { type: 'move', x: Infinity, y: 100 });
  room.send('order', { type: 'move', x: 'NaN', y: NaN });
  room.send('order', { type: 'move', x: '1e309', y: -Infinity });
  await sleep(400);
  check('order move with Infinity/NaN/strings keeps a finite position', finite(), `x=${me().x} y=${me().y}`);

  for (const id of ['__proto__', 'constructor', 'toString', room.sessionId, '', 12345, null]) room.send('order', { type: 'attack', id });
  await sleep(400);
  check('order attack with prototype keys / self / junk sets no target', !['__proto__', 'constructor', 'toString', room.sessionId].includes(me().targetId), `targetId='${me().targetId}'`);
  let ally = '';
  room.state.champions.forEach((c, sid) => { if (!ally && sid !== room.sessionId && c.team === me().team) ally = sid; });
  room.send('order', { type: 'attack', id: ally });
  await sleep(300);
  check('order attack on an ally is rejected', me().targetId !== ally, `targetId='${me().targetId}'`);
  room.send('order', { type: 'constructor' });
  room.send('order', 'move');
  room.send('order', null);

  const m0 = me().mana;
  for (const slot of ['constructor', '__proto__', 'x', 5, null]) room.send('cast', { slot, x: 100, y: 100 });
  room.send('cast', { slot: 'q', x: Infinity, y: NaN });
  await sleep(400);
  check('cast with junk slots / non-finite aim keeps state finite', finite() && Number.isFinite(me().mana), `x=${me().x} mana=${me().mana}`);
  await sleep(6000); // q cooldown from the non-finite cast (it falls back to aiming at yourself)
  const m1 = me().mana;
  for (let i = 0; i < 40; i++) room.send('cast', { slot: 'q', x: me().x + 300, y: me().y - 300 });
  await sleep(500);
  const spent = m1 - me().mana;
  check('40× cast Q in one burst costs at most one cast', spent <= 50, `mana ${m1} → ${me().mana} (Q costs 45; start ${m0})`);
  room.send('cast', { slot: 'r', x: 0, y: 0 });
  await sleep(300);
  check('R is locked below level 6', me().cdR === 0, `cdR=${me().cdR}`);

  const g0 = me().gold;
  for (const item of ['__proto__', 'constructor', 'toString', 'nope', 42, null]) room.send('buy', { item });
  await sleep(300);
  check('buy with prototype keys / unknown ids does nothing', me().gold === g0, `gold ${g0} → ${me().gold}`);
  const g1 = me().gold;
  for (let i = 0; i < 20; i++) room.send('buy', { item: 'coffee' });
  await sleep(400);
  check('20× buy coffee in one burst buys at most one', g1 - me().gold <= 50, `gold ${g1} → ${me().gold}`);
  await sleep(200);
  room.send('buy', { item: 'ultrawide' });
  await sleep(300);
  check('cannot buy an item you cannot afford', ![...me().items].includes('ultrawide'), `items=${[...me().items]}`);
  room.send('debug', { cmd: 'gold', n: 1e12 });
  await sleep(300);
  check('debug gold is clamped (or disabled)', me().gold <= 2_000_000, `gold=${me().gold}`);
  // Walk out of the fountain, then try to shop.
  const team = me().team;
  room.send('order', { type: 'move', x: team === 'blue' ? 1600 : 4400, y: team === 'blue' ? 4400 : 1600 });
  await sleep(4500);
  const g2 = me().gold, items2 = [...me().items].join(',');
  room.send('buy', { item: 'mouse' });
  await sleep(300);
  check('buy outside the fountain is rejected', me().gold === g2 && [...me().items].join(',') === items2, `gold ${g2} → ${me().gold}`);

  for (let i = 0; i < 10; i++) room.send('recall');
  await sleep(200);
  check('recall starts a channel (spam-safe)', me().recallUntil > 0, `recallUntil=${me().recallUntil}`);
  room.send('order', { type: 'stop' });
  await sleep(200);
  check('an order cancels the recall', me().recallUntil === 0, `recallUntil=${me().recallUntil}`);

  let chats = 0;
  const off = room.onMessage('chat', (m) => { if (m.sid === room.sessionId) chats++; });
  for (let i = 0; i < 15; i++) room.send('chat', { text: `spam ${i}` });
  room.send('chat', { text: { toString: 1 } });
  await sleep(700);
  check('chat flood is rate-limited', chats <= 2, `echoed ${chats}`);
  off?.();

  await v2Checks(check, me, extra);
  await v3SpellChecks(check, me, extra);
  await v4BushChecks(check, me, extra);
  await ep3ReconnectChecks(check, me, extra); // EP-03 (+ runs the EP-04 / EP-06 checks during the 60 s grace wait)

  let welcomes = 0;
  room.onMessage('welcome', () => welcomes++);
  for (let i = 0; i < 20; i++) room.send('hello');
  room.send('startNow');
  room.send('debug', { cmd: '__proto__' });
  room.send('debug', { cmd: 'epic', id: 'constructor' });
  room.send('debug', { cmd: 'level', n: 'Infinity' });
  await sleep(600);
  check('hello answered once per client', welcomes === 0, `extra welcomes=${welcomes}`);
  check('crafted debug/startNow did not end the match', room.state.phase === 'playing', `phase=${room.state.phase}`);
  await v4RoomChecks(check);
  // Oversized payload: the transport closes THIS socket (ws close 1009); the server must survive.
  room.send('chat', { text: 'x'.repeat(20000) });
  for (let i = 0; i < 20 && !left; i++) await sleep(100);
  console.log(`      (oversized chat → our socket ${left ? 'was closed by the server' : 'stayed open'})`);
  const alive = await httpOk(SERVER.replace('ws', 'http') + '/api/stats');
  check('server still alive after crafted messages', alive);
  if (!left) await room.leave();
  for (const r of Object.values(extra)) { try { await r.leave(); } catch (_) { /* already gone */ } }
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  return failed ? 1 : 0;
}

// ───────────────────────── v2: walls, pets, knockback ─────────────────────────
// Needs BUG_SMASH_DEBUG=1 (`tp`, `cd`, `freeze` debug commands) — skipped otherwise.
async function v2Checks(check, me, extra) {
  const { B, C, D } = extra;
  if (!B || !C || !D) { console.log('SKIP  v2 checks (extra clients missing)'); return; }
  const st = () => room.state;
  const champ = (r) => st().champions.get(r.sessionId);
  const tp = (r, x, y) => r.send('debug', { cmd: 'tp', x, y });
  const cd = (r) => r.send('debug', { cmd: 'cd' });
  const free = (c, pad = 2) => !isBlocked(c.x, c.y, CHAMP_RADIUS - pad);
  // Is debug on? A tp must move us.
  for (let i = 0; i < 120 && me()?.dead; i++) await sleep(250); // (aggressive bots: respawn before probing debug hooks)
  tp(room, 1450, 3150);
  await sleep(500);
  if (Math.hypot(me().x - 1450, me().y - 3150) > 5) { console.log(`SKIP  v2 checks (debug hooks off? tp landed at ${me().x},${me().y})`); return; }
  room.send('debug', { cmd: 'freeze' }); // bots stop thinking: deterministic checks
  const blue = me().team;
  console.log(`      v2 checks: main=${me().champ}/${blue} B=${champ(B)?.champ}/${champ(B)?.team} C=${champ(C)?.champ}/${champ(C)?.team} D=${champ(D)?.champ}/${champ(D)?.team}`);
  // v3 map: the vertical partition x = 1850, y 2560–2950 (w 60) shielding blue's big camp.
  const WX = 1850, WY = 2750, WR = 30;

  // 1) Move order into a wall → walks to nearestFree(click), never inside.
  room.send('order', { type: 'stop' });
  await sleep(120);
  room.send('order', { type: 'move', x: WX, y: WY });
  const goal = nearestFree(WX, WY, CHAMP_RADIUS);
  let inside = 0;
  for (let i = 0; i < 18; i++) { await sleep(150); if (!free(me())) inside++; }
  check('v2: move order into a wall ends on the nearest free spot (never inside)', inside === 0 && Math.hypot(me().x - goal.x, me().y - goal.y) < 40,
    `at ${me().x},${me().y} goal ${Math.round(goal.x)},${Math.round(goal.y)} insideSamples=${inside}`);

  // 2) Blink into a wall (Pixel E, range 420) → lands on a free spot.
  tp(room, WX - 270, WY); cd(room);
  await sleep(400);
  const nBlink = fxLog.length;
  room.send('cast', { slot: 'e', x: WX, y: WY });
  await sleep(400);
  const bl = fxLog.slice(nBlink).find((f) => f.k === 'blink' && f.sid === room.sessionId);
  check('v2: blink aimed into a wall lands outside it', !!bl && !isBlocked(bl.x1, bl.y1, CHAMP_RADIUS - 2) && free(me()),
    bl ? `blink ${bl.x0},${bl.y0} → ${bl.x1},${bl.y1}; now ${me().x},${me().y}` : 'no blink fx');

  // 3) Dash through a wall (Swipe E, range 380) → stops in front of it.
  tp(D, WX - 200, WY); cd(D);
  await sleep(400);
  const d0 = { x: champ(D).x, y: champ(D).y };
  D.send('cast', { slot: 'e', x: WX + 180, y: WY });
  await sleep(400);
  const d1 = champ(D);
  check('v2: dash across a wall stops at the wall (no tunnelling)', d1.x < WX - WR - CHAMP_RADIUS + 3 && segmentClear(d0.x, d0.y, d1.x, d1.y, CHAMP_RADIUS - 3) && free(d1),
    `${d0.x},${d0.y} → ${d1.x},${d1.y}`);

  // 4) Pets are never valid targets (order attack / cast with a pet id).
  // Move Volt (and so Servo) out of the blue fountain first — otherwise red B gets
  // lasered by the fountain while standing next to the pet and is dead for check 5.
  tp(C, 2000, 3500);
  await sleep(1200);
  let petId = '', pet = null;
  st().units.forEach((u, id) => { if (u.kind === 'pet' && u.owner === C.sessionId && u.alive) { petId = id; pet = u; } });
  check('v2: Volt has a pet (kind pet, owner = Volt, team = owner team)', !!pet && pet.team === champ(C).team, pet ? `${petId} @${pet.x},${pet.y}` : 'none');
  if (pet) {
    tp(B, pet.x + 80, pet.y); cd(B);
    await sleep(400);
    B.send('order', { type: 'attack', id: petId });
    await sleep(300);
    check('v2: order attack on an enemy pet is rejected', champ(B).targetId !== petId, `targetId='${champ(B).targetId}'`);
    B.send('cast', { slot: 'e', x: pet.x, y: pet.y, id: petId });
    await sleep(300);
    check('v2: cast with a pet id is rejected (no cooldown spent)', champ(B).cdE === 0, `cdE=${champ(B).cdE}`);
    const p2 = st().units.get(petId);
    check('v2: the pet is untouched (alive, hp 1)', !!p2 && p2.alive && p2.hp === 1, p2 ? `alive=${p2.alive} hp=${p2.hp}` : 'gone');
  }

  // 5) Knockback toward the map edge stays inside the map.
  // B may have died to the blue fountain laser during the pet checks — wait for the respawn.
  for (let i = 0; i < 60 && champ(B)?.dead; i++) await sleep(250);
  tp(room, 45, 2700); tp(B, 200, 2700); cd(B);
  await sleep(400);
  const nK = fxLog.length;
  B.send('cast', { slot: 'e', x: me().x, y: me().y, id: room.sessionId });
  await sleep(450);
  const k1 = fxLog.slice(nK).find((f) => f.k === 'knock' && f.id === room.sessionId);
  const m1 = me();
  check('v2: knockback toward the map edge stays in the map', !!k1 && Number.isFinite(m1.x) && m1.x >= 0 && m1.x <= MAP_W && m1.y >= 0 && m1.y <= MAP_H && k1.x1 >= 0,
    k1 ? `knock ${k1.x0},${k1.y0} → ${k1.x1},${k1.y1} wall=${k1.wall}; now ${m1.x},${m1.y}` : 'no knock fx');
  check('v2: fx knock payload {k,id,x0,y0,x1,y1,ms,wall}', !!k1 && ['id', 'x0', 'y0', 'x1', 'y1', 'ms', 'wall'].every((f) => k1[f] !== undefined), k1 ? JSON.stringify(k1) : '');

  // 6) Knockback into a wall → wall=true + stun (Escort Out wallStun 1400 ms).
  tp(room, WX - WR - 70, WY); tp(B, WX - WR - 190, WY); cd(B);
  await sleep(400);
  const nW = fxLog.length;
  B.send('cast', { slot: 'e', x: me().x, y: me().y, id: room.sessionId });
  await sleep(300);
  const k2 = fxLog.slice(nW).find((f) => f.k === 'knock' && f.id === room.sessionId);
  check('v2: knockback into a wall → wall=true + stun, victim not inside the wall', !!k2 && k2.wall === true && me().stunnedUntil > 0 && free(me()),
    k2 ? `knock → ${k2.x1},${k2.y1} wall=${k2.wall} stunnedUntil=${me().stunnedUntil}` : `no knock fx (me dead=${me().dead} hp=${me().hp} @${me().x},${me().y} · B dead=${champ(B).dead} @${champ(B).x},${champ(B).y} cdE=${champ(B).cdE})`);
  room.send('debug', { cmd: 'freeze' }); // bots resume
  tp(room, me().team === 'blue' ? 500 : 5500, me().team === 'blue' ? 5500 : 500);
  await sleep(300);
}

// ───────────────────────── v3: champion select ─────────────────────────
// Runs from the lobby: pick/lock/spells validation, room lock, then drives the
// match to `playing` (debug `start` skips ahead when hooks are on, else the timers).
async function v3SelectChecks(check, me, extra) {
  const st = () => room.state;
  const champ = (r) => st().champions.get(r.sessionId);
  const { validSpellPair } = await import('../../shared/moba/spells.js');
  check('v3: lobby — joined with the hover champion, not locked, default spells flash/heal',
    me().champ === CHAMP && !me().locked && me().spellD === 'flash' && me().spellF === 'heal',
    `champ=${me().champ} locked=${me().locked} spells=${me().spellD}/${me().spellF}`);
  room.send('pick', { champ: 'model' });
  room.send('lock');
  await sleep(300);
  check('v3: pick / lock outside select (lobby) are rejected', me().champ === CHAMP && !me().locked, `champ=${me().champ} locked=${me().locked}`);
  for (const m of [{ d: 'flash', f: 'flash' }, { d: '__proto__', f: 'heal' }, { d: 'toString', f: 'constructor' }, { d: 5, f: null }, { d: 'smite' }, null, 'flash']) {
    room.send('spells', m);
    await sleep(170);
  }
  check('v3: invalid / duplicate / prototype-key spell pairs are rejected', me().spellD === 'flash' && me().spellF === 'heal', `spells=${me().spellD}/${me().spellF}`);
  await sleep(200);
  room.send('spells', { d: 'ghost', f: 'ignite' });
  room.send('spells', { d: 'barrier', f: 'heal' });
  await sleep(300);
  check('v3: spells {d,f} accepted in the lobby; a 2nd pair within PICK_RATE_MS is dropped', me().spellD === 'ghost' && me().spellF === 'ignite', `spells=${me().spellD}/${me().spellF}`);
  await sleep(200);
  room.send('spells', { d: 'flash', f: 'smite' });
  extra.B?.send('spells', { d: 'ignite', f: 'heal' });
  extra.D?.send('spells', { d: 'smite', f: 'ghost' });
  await sleep(300);
  if (extra.C) check('v3: join option autoLock locks the requested champion', champ(extra.C)?.locked === true && champ(extra.C)?.champ === 'embedded', `C=${champ(extra.C)?.champ} locked=${champ(extra.C)?.locked}`);

  // Pass 2 RP-06: START NOW = ready — the draft starts once EVERY queued human is ready.
  room.send('startNow');
  await sleep(200);
  check('Pass 2: one of 4 humans ready → still in the lobby (ready check)', st().phase === 'lobby', `phase=${st().phase}`);
  for (const r of Object.values(extra)) r?.send('ready');
  for (let i = 0; i < 30 && st().phase === 'lobby'; i++) await sleep(100);
  const now = () => Date.now() + skew;
  let seats = 0, badSpells = 0;
  st().champions.forEach((c) => { seats++; if (!validSpellPair(c.spellD, c.spellF)) badSpells++; });
  check('v3: startNow → select: 10 seats (bots seated), timer running, valid spell pairs', st().phase === 'select' && seats === 10 && st().selectEndsAt > now() && badSpells === 0,
    `phase=${st().phase} seats=${seats} selectEndsAt-now=${st().selectEndsAt - now()} badSpells=${badSpells}`);
  let joined = false;
  try { const late = await new Client(SERVER).joinById(room.roomId, { name: 'LateJoiner' }); joined = true; await late.leave(); } catch (_) { joined = false; }
  check('v3: joining after champion select started is rejected (room locked)', !joined);

  room.send('pick', { champ: 'embedded' }); // C = blue teammate, locked
  await sleep(250);
  check("v3: pick a teammate's champion is rejected", me().champ === CHAMP, `champ=${me().champ}`);
  for (const c of ['__proto__', 'constructor', 'toString', 42, null, '']) { room.send('pick', { champ: c }); await sleep(160); }
  room.send('pick', 'pixel');
  await sleep(200);
  check('v3: pick with junk / prototype keys is rejected', me().champ === CHAMP, `champ=${me().champ}`);
  // EP-19: bots lock within 1.5–6 s (role-balanced) — every champion below is chosen among the ones no
  // TEAMMATE holds right now, and each step polls the state (message / patch jitter on a busy machine).
  const waitFor = async (cond, ms = 1500) => { for (let t = 0; t < ms && !cond(); t += 50) await sleep(50); return cond(); };
  const heldByMates = () => { const h = new Set(); st().champions.forEach((c, sid) => { if (sid !== room.sessionId && c.team === me().team && c.champ) h.add(c.champ); }); return h; };
  await sleep(300);
  const enemyPick = [];
  st().champions.forEach((c) => { if (c.team !== me().team && c.champ && c.locked) enemyPick.push(c.champ); });
  // Stay in our own lane (mid) while hovering: a hover in another lane makes a bot re-role into ours and
  // take CHAMP (r2: bots lock in 1–3 s). Prefer an enemy-locked mid champion.
  const { CHAMPIONS: CH } = await import('../../shared/moba/champions.js');
  const myLane = CH[CHAMP]?.lane;
  const dupOk = (c) => !heldByMates().has(c) && c !== CHAMP;
  const dup = enemyPick.find((c) => dupOk(c) && CH[c]?.lane === myLane) || enemyPick.find(dupOk);
  room.send('pick', { champ: dup }); // an ENEMY's locked champion (B = guard when free for us)
  await waitFor(() => me().champ === dup);
  check("v3: pick an enemy's champion is allowed (enemy duplicates OK)", !!dup && me().champ === dup, `champ=${me().champ} (enemy ${dup})`);
  await sleep(350);
  const [pa, pb] = ['model', 'cleaner', 'pixel', 'zero', 'courier', 'tester', 'appdev', 'ops', 'stack', 'dev']
    .filter((c) => !heldByMates().has(c) && c !== me().champ && c !== CHAMP)
    .sort((x, y) => (CH[y]?.lane === myLane) - (CH[x]?.lane === myLane));
  room.send('pick', { champ: pa });
  room.send('pick', { champ: pb });
  await waitFor(() => me().champ !== dup, 1000);
  await sleep(250);
  check('v3: pick is rate-limited (2nd pick within PICK_RATE_MS dropped)', me().champ === pa, `champ=${me().champ} (sent ${pa} then ${pb})`);
  await sleep(350);
  room.send('pick', { champ: CHAMP });
  await waitFor(() => me().champ === CHAMP);
  await sleep(200);
  room.send('lock');
  await waitFor(() => me().locked === true);
  check('v3: lock locks the hovered champion', me().locked === true && me().champ === CHAMP, `champ=${me().champ} locked=${me().locked}`);
  await sleep(250);
  room.send('pick', { champ: pa });
  await sleep(400);
  check('v3: pick after lock is rejected', me().champ === CHAMP, `champ=${me().champ}`);
  const x0 = me().x, y0 = me().y, nFx = fxLog.length;
  room.send('order', { type: 'move', x: 3000, y: 3000 });
  room.send('spell', { slot: 'd', x: 3000, y: 3000 });
  room.send('cast', { slot: 'q', x: 3000, y: 3000 });
  room.send('buy', { item: 'coffee' });
  await sleep(400);
  check('v3: order / cast / spell / buy during select do nothing', me().x === x0 && me().y === y0 && !fxLog.slice(nFx).some((f) => f.k === 'spell'), `pos ${me().x},${me().y}`);

  // Advance: debug `start` skips select → loading (hooks on); otherwise wait for the timers.
  room.send('debug', { cmd: 'start' });
  let sawLoading = false, loadingOk = false, detail = '';
  for (let i = 0; i < 500 && st().phase !== 'playing'; i++) {
    if (st().phase === 'loading' && !sawLoading) {
      sawLoading = true;
      const by = { blue: [], red: [] };
      let unlocked = 0;
      st().champions.forEach((c) => { by[c.team]?.push(c.champ); if (!c.locked || !c.champ) unlocked++; });
      const distinct = ['blue', 'red'].every((t) => by[t].length === 5 && new Set(by[t]).size === 5);
      loadingOk = st().loadingEndsAt > 0 && unlocked === 0 && distinct;
      detail = `blue ${by.blue.join(',')} · red ${by.red.join(',')} · unlocked ${unlocked} · loadingEndsAt-now ${st().loadingEndsAt - now()}`;
    }
    await sleep(100);
  }
  check('v3: loading — every seat locked, picks distinct per team, timer set', sawLoading && loadingOk, detail);
  check('v3: picks + spells carried into the match', st().phase === 'playing' && me().champ === CHAMP && me().spellD === 'flash' && me().spellF === 'smite'
    && (!extra.B || champ(extra.B).champ === 'guard') && (!extra.C || champ(extra.C).champ === 'embedded'),
    `me=${me().champ} ${me().spellD}/${me().spellF} B=${extra.B && champ(extra.B).champ} C=${extra.C && champ(extra.C).champ}`);
}

// ───────────────────────── v3: summoner spells ─────────────────────────
// Needs BUG_SMASH_DEBUG=1 (`tp`, `cd`, `freeze`, `epic`). Spells: main flash/smite,
// B (red guard) ignite/heal, D (red appdev) smite/ghost.
async function v3SpellChecks(check, me, extra) {
  const { B, C, D } = extra;
  if (!B || !C || !D) { console.log('SKIP  v3 spell checks (extra clients missing)'); return; }
  const st = () => room.state;
  const champ = (r) => st().champions.get(r.sessionId);
  const tp = (r, x, y) => r.send('debug', { cmd: 'tp', x, y });
  const cd = (r) => r.send('debug', { cmd: 'cd' });
  const free = (c, pad = 2) => !isBlocked(c.x, c.y, CHAMP_RADIUS - pad);
  const spellFx = (sid, from) => fxLog.slice(from).filter((f) => f.k === 'spell' && f.sid === sid);
  const waitAlive = async (r) => { for (let i = 0; i < 80 && champ(r)?.dead; i++) await sleep(250); };
  for (let i = 0; i < 120 && me()?.dead; i++) await sleep(250); // (aggressive bots: respawn before probing debug hooks)
  tp(room, 1450, 3150);
  await sleep(500);
  if (Math.hypot(me().x - 1450, me().y - 3150) > 5) { console.log('SKIP  v3 spell checks (debug hooks off?)'); return; }
  room.send('debug', { cmd: 'freeze' });
  const WX = 1850, WY = 2750, WR = 30; // vertical partition (see v2Checks)
  // Park the red testers far away (idle champions auto-attack whatever is in range).
  const park = (r, i) => tp(r, 4300 + i * 200, 1500);
  park(B, 0); park(D, 1);
  for (const r of [room, B, D]) await waitAlive(r);
  for (let i = 0; i < 40 && me().stunnedUntil > 0; i++) await sleep(100); // v2 wall-stun wears off
  tp(room, me().team === 'blue' ? 500 : 5500, me().team === 'blue' ? 5500 : 500); // top up in the fountain (v2 checks hurt)
  await sleep(3000);

  // 1) Flash into a wall → free spot · fx payload · cooldown.
  tp(room, WX - 270, WY); cd(room);
  await sleep(400);
  let n = fxLog.length;
  room.send('spell', { slot: 'd', x: WX, y: WY });
  await sleep(350);
  const f1 = spellFx(room.sessionId, n)[0];
  check('v3: Flash aimed into a wall lands on a free spot', !!f1 && f1.spell === 'flash' && !isBlocked(f1.x1, f1.y1, CHAMP_RADIUS - 2) && free(me()),
    f1 ? `flash ${f1.x0},${f1.y0} → ${f1.x1},${f1.y1}; now ${me().x},${me().y}` : 'no fx spell');
  check('v3: fx spell payload {k,sid,spell,x0,y0,x1,y1}', !!f1 && ['sid', 'spell', 'x0', 'y0', 'x1', 'y1'].every((k) => f1[k] !== undefined), f1 ? JSON.stringify(f1) : '');
  check('v3: cdD = server ms when ready (150 s, no haste)', me().cdD > 0 && Math.abs(me().cdD - (Date.now() + skew) - 150000) < 3000, `cdD-now=${me().cdD - (Date.now() + skew)}`);
  n = fxLog.length;
  const cd0 = me().cdD;
  room.send('spell', { slot: 'd', x: me().x + 200, y: me().y });
  await sleep(350);
  check('v3: spell on cooldown is rejected', spellFx(room.sessionId, n).length === 0 && me().cdD === cd0, `cdD ${cd0} → ${me().cdD}`);

  // 2) Flash across a thin wall.
  tp(room, WX - 270, WY); cd(room);
  await sleep(400);
  n = fxLog.length;
  room.send('spell', { slot: 'd', x: WX + 150, y: WY });
  await sleep(350);
  const f2 = spellFx(room.sessionId, n)[0];
  check('v3: Flash crosses a wall (lands on the far side, free)', !!f2 && f2.x1 > WX + WR && free(me()), f2 ? `→ ${f2.x1},${f2.y1}; now ${me().x},${me().y}` : 'no fx spell');
  for (const bad of [{ slot: 'x' }, { slot: '__proto__', x: 1, y: 1 }, { slot: 'd', x: Infinity, y: NaN }, null, 'd']) room.send('spell', bad);
  await sleep(300);
  check('v3: spell with junk slot / non-finite aim keeps state finite', Number.isFinite(me().x) && Number.isFinite(me().y), `x=${me().x}`);

  // 2b) Spell while stunned (knocked into a wall → wall-stun) → rejected.
  await waitAlive(B);
  tp(room, WX - WR - 70, WY); tp(B, WX - WR - 190, WY); cd(B); cd(room);
  await sleep(450);
  B.send('cast', { slot: 'e', x: me().x, y: me().y, id: room.sessionId });
  await sleep(350);
  const stunned = me().stunnedUntil > Date.now() + skew;
  n = fxLog.length;
  room.send('spell', { slot: 'd', x: me().x - 300, y: me().y });
  await sleep(250);
  park(B, 0);
  check('v3: spell while stunned is rejected', stunned && spellFx(room.sessionId, n).length === 0 && me().cdD === 0, `stunned=${stunned} cdD=${me().cdD}`);

  // 3) Smite a champion (with id, and aimed without id) → rejected.
  await waitAlive(B);
  tp(room, 1500, 3300); tp(B, 1800, 3300); cd(room); cd(B);
  await sleep(400);
  n = fxLog.length;
  room.send('spell', { slot: 'f', x: champ(B).x, y: champ(B).y, id: B.sessionId });
  await sleep(250);
  room.send('spell', { slot: 'f', x: champ(B).x, y: champ(B).y });
  await sleep(300);
  park(B, 0);
  check('v3: smite on an enemy champion is rejected', spellFx(room.sessionId, n).length === 0 && me().cdF === 0, `cdF=${me().cdF}`);

  // 4) Smite / ignite a pet → rejected.
  let petId = '', pet = null;
  st().units.forEach((u, id) => { if (u.kind === 'pet' && u.owner === C.sessionId && u.alive) { petId = id; pet = u; } });
  if (pet) {
    await waitAlive(D);
    tp(D, pet.x + 100, pet.y); tp(B, pet.x - 100, pet.y); cd(D); cd(B);
    await sleep(400);
    D.send('spell', { slot: 'd', x: pet.x, y: pet.y, id: petId });
    B.send('spell', { slot: 'd', x: pet.x, y: pet.y, id: petId });
    await sleep(350);
    park(B, 0); park(D, 1);
    check('v3: smite on an enemy pet is rejected', champ(D).cdD === 0, `D cdD=${champ(D).cdD}`);
    check('v3: ignite on an enemy pet is rejected', champ(B).cdD === 0, `B cdD=${champ(B).cdD}`);
  } else {
    check('v3: Volt pet present for the pet spell checks', false, 'no pet');
  }

  // 5) Ignite a minion / monster → rejected (champions only).
  let unit = null;
  st().units.forEach((u, id) => { if (!unit && u.alive && u.kind !== 'pet' && u.team !== champ(B).team) unit = { id, u }; });
  if (unit) {
    tp(B, unit.u.x + 150, unit.u.y); cd(B);
    await sleep(400);
    B.send('spell', { slot: 'd', x: unit.u.x, y: unit.u.y, id: unit.id });
    await sleep(350);
    park(B, 0);
    check(`v3: ignite on a ${unit.u.kind} (not a champion) is rejected`, champ(B).cdD === 0, `B cdD=${champ(B).cdD}`);
  } else {
    console.log('SKIP  v3 ignite-a-minion (no minion / monster alive yet)');
  }

  // 6) Ignite an enemy champion → 'ignited' tag + true damage over time.
  await waitAlive(B);
  await waitAlive(room);
  tp(room, 1500, 3300); tp(B, 1800, 3300); cd(B);
  await sleep(500);
  n = fxLog.length;
  const hp0 = me().hp;
  B.send('spell', { slot: 'd', x: me().x, y: me().y, id: room.sessionId });
  await sleep(1300);
  park(B, 0);
  const fi = spellFx(B.sessionId, n)[0];
  check("v3: ignite on an enemy champion → buffs has 'ignited', HP ticks down", !!fi && fi.spell === 'ignite' && me().buffs.split(',').includes('ignited') && me().hp < hp0,
    `buffs='${me().buffs}' hp ${hp0} → ${me().hp} fx=${fi ? JSON.stringify(fi) : 'none'}`);

  // 7) Smite a monster (river epic) → big true damage.
  room.send('debug', { cmd: 'epic', id: 'golden' });
  await sleep(500);
  let gold = null;
  st().units.forEach((u, id) => { if (u.kind === 'golden' && u.alive) gold = { id, u }; });
  if (gold) {
    tp(room, gold.u.x - 320, gold.u.y); cd(room);
    await sleep(400);
    const g0 = gold.u.hp;
    n = fxLog.length;
    room.send('spell', { slot: 'f', x: gold.u.x, y: gold.u.y, id: gold.id });
    await sleep(350);
    const fs = spellFx(room.sessionId, n)[0];
    tp(room, 1500, 3300); // out of the epic's reach
    check('v3: smite on a monster deals big true damage', !!fs && fs.spell === 'smite' && g0 - gold.u.hp >= 400, `golden hp ${g0} → ${gold.u.hp}`);
  } else {
    check('v3: golden epic spawned for the smite check', false, 'no golden');
  }

  room.send('debug', { cmd: 'freeze' }); // bots resume
  tp(room, me().team === 'blue' ? 500 : 5500, me().team === 'blue' ? 5500 : 500);
  await sleep(300);
}

// ───────────────────────── v4: bushes / vision / auto-aim ─────────────────────────
// Needs BUG_SMASH_DEBUG=1. main = pixel (blue) hides in bush b5 (circle 1250,3350 r110) while
// RECALLING (a recalling champion never auto-attacks → it stays hidden); B = guard (red, ignite,
// E = point-and-click 'target' skill) checks from outside.
async function v4BushChecks(check, me, extra) {
  const { B, C, D } = extra;
  if (!B || !C || !D) { console.log('SKIP  v4 bush checks (extra clients missing)'); return; }
  const tp = (r, x, y) => r.send('debug', { cmd: 'tp', x, y });
  const cd = (r) => r.send('debug', { cmd: 'cd' });
  const own = (r) => r.state.champions.get(r.sessionId);      // a client's view of itself
  const sees = (r, sid) => r.state.champions.has(sid);         // is sid in r's (filtered) state?
  const waitAlive = async (r) => { for (let i = 0; i < 80 && own(r)?.dead; i++) await sleep(250); };
  const bFx = [];
  B.onMessage('fx', (m) => bFx.push(m));
  B.onMessage('atk', (m) => { for (const e of m) bFx.push({ k: 'atk', ...e }); });
  for (let i = 0; i < 120 && me()?.dead; i++) await sleep(250); // (aggressive bots: respawn before probing debug hooks)
  tp(room, 1450, 3150);
  await sleep(500);
  if (Math.hypot(me().x - 1450, me().y - 3150) > 5) { console.log('SKIP  v4 bush checks (debug hooks off?)'); return; }
  room.send('debug', { cmd: 'freeze' });
  for (const r of [room, B, C, D]) await waitAlive(r);
  tp(D, 4500, 1500); // parked far away
  tp(B, 4300, 1500);
  // Heal up in the fountain first (earlier checks left burns / low HP — damage would cancel the recall).
  tp(room, me().team === 'blue' ? 500 : 5500, me().team === 'blue' ? 5500 : 500);
  await sleep(4000);
  const sid = room.sessionId;
  const BX = 1250, BY = 3350, OUT = { x: 1450, y: 3350 };
  check('v4: bush b5 is where the test expects it', bushAt(BX, BY) === 'b5' && !bushAt(OUT.x, OUT.y), `bushAt=${bushAt(BX, BY)}`);

  // 1) Hide main in the bush (recalling), B outside within E / ignite range.
  room.send('order', { type: 'stop' });
  // B arrives only once main is recalling (an idle champion would auto-attack B → revealed).
  tp(room, BX, BY); cd(B); cd(room);
  await sleep(350);
  for (let i = 0; i < 6 && !(me().recallUntil > 0); i++) { room.send('recall'); await sleep(350); }
  tp(B, OUT.x, OUT.y);
  await sleep(350);
  check('v4: own champion in a bush → inBush = bush id (own client)', own(room)?.inBush === 'b5', `inBush='${own(room)?.inBush}' recall=${me().recallUntil > 0}`);
  check('v4: hidden enemy is ABSENT from the enemy client state', !sees(B, sid), `B sees main=${sees(B, sid)}`);
  check('v4: hidden champion still visible to its ally (C)', sees(C, sid), `C sees main=${sees(C, sid)}`);
  check('v4: state.scores keeps the hidden enemy row (always visible)', !!B.state.scores?.get(sid) && B.state.scores.get(sid).champ === me().champ, `score=${JSON.stringify(B.state.scores?.get(sid)?.toJSON?.() || null)}`);
  B.send('order', { type: 'attack', id: sid });
  await sleep(300);
  check('v4: order attack on a hidden enemy is rejected', own(B).targetId !== sid, `B targetId='${own(B).targetId}'`);
  tp(C, 5500, 5500); // park the visible ally C out of ignite range so the quick-cast below can only find the hidden enemy
  await sleep(300);
  B.send('spell', { slot: 'd', x: BX, y: BY, id: sid });
  await sleep(250);
  B.send('spell', { slot: 'd', x: own(B).x, y: own(B).y }); // quick-cast (auto-aim) must not find the hidden enemy either
  await sleep(250);
  check('v4: ignite on a hidden enemy (by id + auto-aim) is rejected', own(B).cdD === 0, `B cdD=${own(B).cdD}`);
  B.send('cast', { slot: 'e', x: BX, y: BY, id: sid });
  await sleep(300);
  check("v4: 'target' skill on a hidden enemy (by id) is rejected", own(B).cdE === 0, `B cdE=${own(B).cdE}`);
  const nK = fxLog.length;
  B.send('cast', { slot: 'e', x: own(B).x, y: own(B).y }); // auto-aim may pick a visible monster — never the hidden champion
  await sleep(300);
  check("v4: 'target' skill auto-aim never picks the hidden enemy", !fxLog.slice(nK).some((f) => f.k === 'knock' && f.id === sid), `B cdE=${own(B).cdE}`);
  check('v4: still hidden after the attempts (main never revealed)', !sees(B, sid) && me().recallUntil > 0, `B sees=${sees(B, sid)} recall=${me().recallUntil}`);

  // 2) Same bush → visible.
  tp(B, BX, BY - 60);
  await sleep(350);
  check('v4: an enemy standing in the SAME bush sees the hider', sees(B, sid), `B sees=${sees(B, sid)} B inBush='${own(B)?.inBush}'`);
  // (B auto-attacked main in there → main's recall broke and it hit back → revealed; walk B out of everyone's range)
  tp(B, 1950, 3350);
  tp(room, BX, BY); // (the 4 s recall may have finished meanwhile — back into the bush, idle, nobody in range)
  await sleep(2000);
  check('v4: hidden again once the enemy leaves the bush (+ reveal expired)', !sees(B, sid), `B sees=${sees(B, sid)}`);
  const nFx = bFx.length;

  // 3) Skillshots still hit a hidden target; the hit fx is NOT sent to the team that can't see it.
  // Skillshot from 570 px north (outside main's 460 auto-attack range); main is still hidden when it lands.
  await waitAlive(B);
  tp(B, BX, BY - 570); cd(B);
  await sleep(300);
  const hp0 = me().hp, hidBefore = !sees(B, sid);
  B.send('cast', { slot: 'q', x: BX, y: BY });
  await sleep(800); // ~570 px of projectile travel
  const hpHit = me().hp;
  const leaked = bFx.slice(nFx).filter((f) => f.sid === sid || f.id === sid || f.t === sid || f.f === sid);
  check('v4: a skillshot still hits a hidden enemy', hidBefore && hpHit < hp0, `hidden=${hidBefore} hp ${hp0} → ${hpHit} · B @${own(B).x},${own(B).y} cdQ=${own(B).cdQ} dead=${own(B).dead} hp=${own(B).hp} main @${me().x},${me().y}`);
  check('v4: no fx / atk naming the hidden enemy reached the enemy team (incl. the hit fx)', leaked.length === 0, leaked.length ? JSON.stringify(leaked.slice(0, 3)) : `(${bFx.length - nFx} fx/atk to B in the hidden window)`);
  tp(B, 1950, 3350);
  await sleep(1800); // main hit back once B was in range → let that reveal expire

  // 4) Casting reveals for BUSH_REVEAL_MS (1.5 s), then hidden again.
  tp(B, 1950, 3350); cd(room);
  await sleep(400);
  room.send('cast', { slot: 'q', x: BX, y: BY - 600 }); // shoot north, away from everyone
  await sleep(300);
  const revealed = sees(B, sid);
  await sleep(2300);
  check('v4: casting from a bush reveals you, then you vanish again after BUSH_REVEAL_MS', revealed && !sees(B, sid), `revealed=${revealed} after2.6s sees=${sees(B, sid)}`);

  // 5) Server auto-aim: Q aimed on yourself → toward the nearest visible enemy champion.
  tp(room, 1500, 3300); tp(D, 1800, 3300); cd(room);
  await sleep(450);
  const nP = fxLog.length;
  room.send('cast', { slot: 'q', x: me().x, y: me().y });
  await sleep(300);
  const pr = fxLog.slice(nP).find((f) => f.k === 'proj' && f.sid === sid);
  // (fxLog only stores some kinds — read the raw proj via a direct listener below if needed)
  check('v4: auto-aim — Q cast on yourself flies at the nearest visible enemy champion', !!pr && pr.dx > 0.9, pr ? `dx=${pr.dx} dy=${pr.dy}` : 'no proj fx');

  room.send('debug', { cmd: 'freeze' }); // bots resume
  tp(room, me().team === 'blue' ? 500 : 5500, me().team === 'blue' ? 5500 : 500);
  tp(B, 4300, 1500); tp(D, 4500, 1500);
  await sleep(300);
}

// ───────────────────────── v4: StateView decode soak ─────────────────────────
async function runSoak(secs) {
  const { BUSHES } = await import('../../shared/moba/map.js');
  let decodeErrors = 0;
  const errLog = [];
  const origErr = console.error, origWarn = console.warn;
  console.error = (...a) => { const s = a.map((x) => (typeof x === 'string' ? x : '')).join(' '); if (/refId|decode|not found/i.test(s)) { decodeErrors++; if (errLog.length < 5) errLog.push(s.slice(0, 160)); } else origErr(...a); };
  console.warn = (...a) => { if (/report this issue/i.test(String(a[0]))) return; origWarn(...a); };
  const host = await new Client(SERVER).create('team_custom', { name: 'SoakHost', roomName: 'soak', champ: 'pixel' });
  const guest = await new Client(SERVER).joinById(host.roomId, { name: 'SoakGuest', champ: 'guard' });
  for (const r of [host, guest]) r.onMessage('*', () => {});
  await sleep(500);
  const team = (r) => r.state.champions.get(r.sessionId)?.team;
  if (team(guest) === team(host)) guest.send('side', { team: team(host) === 'blue' ? 'red' : 'blue' });
  await sleep(600);
  console.log(`soak: room ${host.roomId} host=${team(host)} guest=${team(guest)}`);
  host.send('startNow');
  await sleep(400);
  for (let i = 0; i < 3; i++) { host.send('debug', { cmd: 'start' }); await sleep(400); }
  for (let i = 0; i < 100 && host.state.phase !== 'playing'; i++) await sleep(100);
  if (host.state.phase !== 'playing') { console.log(`FAIL  soak: never reached playing (${host.state.phase}) — BUG_SMASH_DEBUG=1?`); return 1; }
  for (const r of [host, guest]) r.send('debug', { cmd: 'autopilot' });
  const t0 = Date.now();
  let tps = 0, ghostChecks = 0, ghosts = 0, lastLog = 0;
  const ghostLog = [];
  const spots = BUSHES.map((b) => (b.kind === 'circle' ? { x: b.x, y: b.y } : { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 }));
  while (Date.now() - t0 < secs * 1000 && host.state.phase === 'playing') {
    // Churn: jump into a random bush, next to it, or (sometimes) next to the other tester's bush.
    for (const r of [host, guest]) {
      if (Math.random() < 0.5) continue;
      const s = spots[Math.floor(Math.random() * spots.length)];
      const off = Math.random() < 0.5 ? 0 : 160;
      r.send('debug', { cmd: 'tp', x: s.x + off, y: s.y + (Math.random() - 0.5) * 120 });
      tps++;
    }
    await sleep(250 + Math.random() * 250);
    // No ghosts: every champion a client has decoded must have a scoreboard row; own team always present.
    for (const r of [host, guest]) {
      const me = team(r);
      ghostChecks++;
      let allies = 0;
      r.state.scores?.forEach((sc) => { if (sc.team === me) allies++; });
      let alliesSeen = 0;
      r.state.champions.forEach((c) => { if (c.team === me) alliesSeen++; });
      if (alliesSeen !== allies) { ghosts++; if (ghostLog.length < 5) ghostLog.push(`${me}: allies ${alliesSeen}/${allies}`); }
    }
    if (Date.now() - lastLog > 30000) { lastLog = Date.now(); console.log(`  ${Math.round((Date.now() - t0) / 1000)} s · tps ${tps} · decode errors ${decodeErrors} · host sees ${host.state.champions.size} champs/${host.state.units.size} units · guest sees ${guest.state.champions.size}/${guest.state.units.size}`); }
  }
  for (const r of [host, guest]) { try { await r.leave(); } catch (_) { /* gone */ } }
  console.error = origErr; console.warn = origWarn;
  const ok = decodeErrors === 0 && ghosts === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  soak ${secs} s: decode errors ${decodeErrors} · ally-presence mismatches ${ghosts}/${ghostChecks} · teleports ${tps}${errLog.length ? '\n  ' + errLog.join('\n  ') : ''}${ghostLog.length ? '\n  ' + ghostLog.join('\n  ') : ''}`);
  return ok ? 0 : 1;
}

// ───────────────────────── v4: custom rooms ─────────────────────────
async function v4RoomChecks(check) {
  const api = SERVER.replace('ws', 'http') + '/api/team/rooms';
  const mk = () => new Client(SERVER);
  const quiet = (r) => { r.onMessage('*', () => {}); return r; };
  const st = (r) => r.state;
  const seat = (r) => r.state.champions.get(r.sessionId);
  let host;
  try { host = quiet(await mk().create('team_custom', { name: 'HostDev', roomName: '  Bug\nBash   Night  ' + 'x'.repeat(40) })); }
  catch (err) { check('v4: create a custom room (team_custom)', false, err.message); return; }
  await sleep(500);
  check('v4: custom room created — phase room, custom=true, sanitized roomName (≤ 24), host = creator',
    st(host).phase === 'room' && st(host).custom === true && st(host).roomName.length <= 24 && !/\n/.test(st(host).roomName) && st(host).hostId === host.sessionId,
    `phase=${st(host).phase} custom=${st(host).custom} roomName='${st(host).roomName}' hostId=${st(host).hostId === host.sessionId}`);
  let list = await httpJson(api);
  let row = Array.isArray(list) ? list.find((x) => x.roomId === host.roomId) : null;
  check('v4: GET /api/team/rooms lists it {roomId,roomName,host,humans,blue,red,phase,locked}',
    !!row && row.roomName === st(host).roomName && row.host === 'HostDev' && row.humans === 1 && row.phase === 'room' && row.locked === false && ['blue', 'red'].every((k) => typeof row[k] === 'number'),
    JSON.stringify(row));
  // Fill: 5 more humans, then everyone on blue → the 6th blue is rejected.
  const others = [];
  for (let i = 0; i < 5; i++) {
    try { others.push(quiet(await mk().joinById(host.roomId, { name: `Guest${i}` }))); } catch (err) { console.log(`      (guest ${i} join failed: ${err.message})`); }
  }
  await sleep(500);
  check('v4: guests join by roomId (host unchanged)', others.length === 5 && st(host).hostId === host.sessionId, `guests=${others.length}`);
  { // r2: an invited friend lands on the HOST's side while it has < 5 humans, else the other side
    const ht = seat(host)?.team;
    const sides = others.map((r) => seat(r)?.team);
    check("r2: invite joins land on the host's side until it has 5 humans, then the other side", sides.slice(0, 4).every((t) => t === ht) && sides[4] && sides[4] !== ht, `host ${ht} · guests ${sides.join(',')}`);
  }
  const all = [host, ...others];
  for (const r of all) { if (seat(r)?.team !== 'blue') r.send('side', { team: 'blue' }); }
  await sleep(500);
  const blues = () => { let n = 0; st(host).champions.forEach((c) => { if (!c.isBot && c.team === 'blue') n++; }); return n; };
  check('v4: side switch works · a 6th human on a side is rejected (≤ 5 per side)', blues() === 5, `blue humans=${blues()}`);
  const mover = all.find((r) => seat(r)?.team === 'red');
  if (mover) {
    mover.send('side', { team: 'blue' }); // full
    for (const junk of [{ team: '__proto__' }, { team: 'neutral' }, null, 'blue']) mover.send('side', junk);
    await sleep(300);
    check('v4: side to a full side / junk side is rejected', seat(mover)?.team === 'red', `team=${seat(mover)?.team}`);
  }
  const blueOne = all.find((r) => r !== host && seat(r)?.team === 'blue');
  if (blueOne) {
    blueOne.send('side', { team: 'red' });
    blueOne.send('side', { team: 'blue' }); // within SIDE_RATE_MS → dropped
    await sleep(400);
    check('v4: side is rate-limited (2nd switch within 400 ms dropped)', seat(blueOne)?.team === 'red', `team=${seat(blueOne)?.team}`);
  }
  const guest = others[0];
  guest.send('startNow');
  await sleep(400);
  check('v4: non-host startNow is rejected', st(host).phase === 'room', `phase=${st(host).phase}`);
  // Host leaves → next human becomes host.
  const oldHost = host.sessionId;
  await host.leave();
  await sleep(500);
  const newHostId = st(guest).hostId;
  check('v4: host leaves → host passes to the next human', !!newHostId && newHostId !== oldHost && others.some((r) => r.sessionId === newHostId), `hostId=${newHostId}`);
  const newHost = others.find((r) => r.sessionId === newHostId) || guest;
  newHost.send('startNow');
  for (let i = 0; i < 30 && st(newHost).phase === 'room'; i++) await sleep(100);
  let seats = 0, bots = 0;
  st(newHost).champions.forEach((c) => { seats++; if (c.isBot) bots++; });
  check('v4: host startNow → select, bots fill the empty seats (10 seats)', st(newHost).phase === 'select' && seats === 10 && bots === 10 - others.length, `phase=${st(newHost).phase} seats=${seats} bots=${bots}`);
  let joined = false;
  try { const late = await mk().joinById(newHost.roomId, { name: 'Late' }); joined = true; await late.leave(); } catch (_) { joined = false; }
  check('v4: custom room is locked from select (late join rejected)', !joined);
  await sleep(300);
  list = await httpJson(api);
  row = Array.isArray(list) ? list.find((x) => x.roomId === newHost.roomId) : null;
  check('v4: rooms list shows it locked / select', !!row && row.locked === true && row.phase === 'select', JSON.stringify(row));
  const before = seat(newHost)?.team;
  newHost.send('side', { team: before === 'blue' ? 'red' : 'blue' });
  await sleep(300);
  check('v4: side during select is rejected', seat(newHost)?.team === before, `team=${seat(newHost)?.team}`);
  for (const r of others) { try { await r.leave(); } catch (_) { /* gone */ } }
}

// ───────────────────────── EP-03: team reconnect grace ─────────────────────────
// Needs BUG_SMASH_DEBUG=1 (`tp`, `level`, `gold`, `freeze`). C (blue, = main's team) drops its socket
// (non-consented) and reconnects within the grace; D (red) drops and never comes back. The
// EP-04 vote checks run in their own rooms while D's 60 s grace runs out.
async function ep3ReconnectChecks(check, me, extra) {
  const { C, D } = extra;
  if (!C || !D) { console.log('SKIP  EP-03 checks (extra clients missing)'); return; }
  const st = () => room.state;
  const champ = (sid) => st().champions.get(sid);
  const score = (sid) => st().scores?.get(sid);
  const tp = (r, x, y) => r.send('debug', { cmd: 'tp', x, y });
  for (let i = 0; i < 120 && me()?.dead; i++) await sleep(250); // (aggressive bots: respawn before probing debug hooks)
  tp(room, 1450, 3150);
  await sleep(500);
  if (Math.hypot(me().x - 1450, me().y - 3150) > 5) { console.log('SKIP  EP-03 checks (debug hooks off?)'); await ep4VoteChecks(check); return; }
  const { ITEMS } = await import('../../shared/moba/items.js');
  const worth = (c) => (c ? c.gold + [...c.items].reduce((a, id) => a + (id ? ITEMS[id]?.cost || 0 : 0), 0) : 0);

  // D (red) drops for good — checked after the grace (≈ 61 s; the vote checks run meanwhile).
  const dSid = D.sessionId, dToken = D.reconnectionToken;
  const dropAt = Date.now();
  D.connection.close(); // raw socket close (not room.leave()) → non-consented → seat held
  await sleep(700);
  check("EP-03: a dropped human's seat is taken by a bot at once (isBot true + feed line)", score(dSid)?.isBot === true && feedLog.some((t) => t.includes('lost Wi-Fi')),
    `isBot=${score(dSid)?.isBot} feed=${feedLog.filter((t) => t.includes('Wi-Fi')).slice(-1)[0] || 'none'}`);

  // C (blue): drop + reconnect inside the grace with gold / items / level intact and the brain released.
  const cSid = C.sessionId;
  room.send('debug', { cmd: 'freeze' }); // bots stop → C's stats can't change while the brain holds it
  for (let i = 0; i < 120 && champ(cSid)?.dead; i++) await sleep(250); // tp / buy are ignored while dead
  const home = champ(cSid)?.team === 'blue' ? { x: 520, y: 5480 } : { x: 5480, y: 520 };
  tp(C, home.x, home.y);
  C.send('debug', { cmd: 'level', n: 5 });
  C.send('debug', { cmd: 'gold', n: 1500 });
  await sleep(500);
  C.send('buy', { item: 'mouse' });
  await sleep(400);
  const before = { level: champ(cSid).level, worth: worth(champ(cSid)), items: [...champ(cSid).items].join(',') };
  const token = C.reconnectionToken;
  C.connection.close();
  await sleep(700);
  check('EP-03: during the grace the seat is bot-held (isBot true for the team)', champ(cSid)?.isBot === true || score(cSid)?.isBot === true, `isBot=${champ(cSid)?.isBot} score.isBot=${score(cSid)?.isBot}`);
  let C2 = null, wel = null;
  try { C2 = await new Client(SERVER).reconnect(token); } catch (err) { check('EP-03: reconnect(token) inside the grace succeeds', false, err.message); }
  if (C2) {
    C2.onMessage('*', () => {});
    C2.onMessage('welcome', (m) => { wel = m; });
    C2.send('hello');
    await sleep(800);
    const c = champ(cSid);
    check('EP-03: reconnect inside the grace → same sessionId, isBot false (laptop handed back)', C2.sessionId === cSid && c?.isBot === false && score(cSid)?.isBot === false,
      `sid same=${C2.sessionId === cSid} isBot=${c?.isBot} score.isBot=${score(cSid)?.isBot}`);
    check('EP-03: level / items / gold kept', !!c && c.level >= before.level && worth(c) >= before.worth - 1 && [...c.items].join(',') === before.items,
      `level ${before.level}→${c?.level} worth ${before.worth}→${worth(c)} items ${before.items}→${c && [...c.items].join(',')}`);
    check('EP-03: the reconnected client is welcomed again (new Client) with reconnectS + its team', wel?.reconnectS === 300 && wel?.team === c?.team,
      `welcome=${JSON.stringify(wel)}`);
    check('EP-03: reconnected client gets its full team view (own champion + structures)', !!C2.state.champions?.get(cSid) && C2.state.structures?.size > 0,
      `own=${!!C2.state.champions?.get(cSid)} structures=${C2.state.structures?.size}`);
    check('EP-03: feed line on return', feedLog.some((t) => t.includes('is back') || t.includes('returned')), feedLog.slice(-3).join(' | '));
    room.send('debug', { cmd: 'freeze' }); // bots resume — C's brain must be gone: it stays idle in the fountain
    const p0 = { x: c.x, y: c.y };
    await sleep(4000);
    const c1 = champ(cSid);
    check('EP-03: bot brain released (the champion idles in the fountain, no orders of its own)', !!c1 && Math.hypot(c1.x - p0.x, c1.y - p0.y) < 25 && !c1.isBot,
      `moved ${c1 ? Math.round(Math.hypot(c1.x - p0.x, c1.y - p0.y)) : '?'} px isBot=${c1?.isBot}`);
    const p1 = { x: c1.x, y: c1.y }; // (c1 is the live schema object — copy the coordinates)
    C2.send('order', { type: 'move', x: p1.x + 150, y: p1.y - 150 });
    await sleep(900);
    check('EP-03: the reconnected client controls its champion again', Math.hypot(champ(cSid).x - p1.x, champ(cSid).y - p1.y) > 60, `${p1.x},${p1.y} → ${champ(cSid).x},${champ(cSid).y}`);
    extra.C = C2;
  } else {
    room.send('debug', { cmd: 'freeze' });
  }

  await ep4VoteChecks(check);
  await ep19HeldSeatCheck(check);

  // Pass 2 RP-04: D's seat is held for the WHOLE match — past the old 60 s grace the bot still
  // plays it and D's saved token still brings D back (REJOIN from the menu).
  const left = 61500 - (Date.now() - dropAt);
  if (left > 0) { console.log(`      (waiting ${Math.ceil(left / 1000)} s — past the old 60 s grace…)`); await sleep(left); }
  check('Pass 2: after 60 s the bot still holds the seat (isBot true, no "did not come back" line)', score(dSid)?.isBot === true && !feedLog.some((t) => t.includes('did not come back')),
    `isBot=${score(dSid)?.isBot}`);
  let late = null;
  try { late = await new Client(SERVER).reconnect(dToken); } catch (_) { late = null; }
  check('Pass 2: rejoining with the saved token after 60 s works (same seat)', !!late && late.sessionId === dSid, late ? late.sessionId : 'rejected');
  if (late) { try { await late.leave(); } catch (_) { /* gone */ } }
  delete extra.D;
}

// ───────────────────────── EP-04: rollback (concede) vote ─────────────────────────
// Own custom rooms (needs BUG_SMASH_DEBUG=1: start, clock, tower).
async function ep4VoteChecks(check) {
  const { ROLLBACK_FROM_MS, ROLLBACK_NEED } = await import('../../shared/moba/rules.js');
  const mk = async (fn) => { const r = await fn(new Client(SERVER)); r.inbox = []; r.onMessage('*', (type, m) => r.inbox.push({ type, m, at: Date.now() })); return r; };
  const got = (r, type, since = 0) => r.inbox.filter((x) => x.type === type && x.at >= since).map((x) => x.m);
  const last = (r, type, since = 0) => got(r, type, since).slice(-1)[0];
  const seat = (r) => r.state.champions.get(r.sessionId);
  const toPlaying = async (host) => {
    host.send('startNow');
    await sleep(500);
    for (let i = 0; i < 3 && host.state.phase !== 'playing'; i++) { host.send('debug', { cmd: 'start' }); await sleep(500); }
    for (let i = 0; i < 40 && host.state.phase !== 'playing'; i++) await sleep(100);
    return host.state.phase === 'playing';
  };
  let H1, H2, H3;
  try {
    H1 = await mk((c) => c.create('team_custom', { name: 'VoteHost', roomName: 'vote test', champ: 'pixel' }));
    H2 = await mk((c) => c.joinById(H1.roomId, { name: 'VoteNo', champ: 'ops' }));
    H3 = await mk((c) => c.joinById(H1.roomId, { name: 'VoteRed', champ: 'guard' }));
  } catch (err) { check('EP-04: vote test rooms', false, err.message); return; }
  await sleep(500);
  for (const [r, t] of [[H1, 'blue'], [H2, 'blue'], [H3, 'red']]) if (seat(r)?.team !== t) { r.send('side', { team: t }); await sleep(450); }
  await sleep(400);
  let t0 = Date.now();
  H1.send('vote', { yes: true });
  for (let i = 0; i < 15 && !got(H1, 'voteDeny', t0).length; i++) await sleep(100);
  check("EP-04: vote outside 'playing' (custom room phase) → voteDeny {reason:'phase'}", last(H1, 'voteDeny', t0)?.reason === 'phase', JSON.stringify(got(H1, 'voteDeny', t0)));
  if (!(await toPlaying(H1))) { check('EP-04: vote room reaches playing (debug start)', false, `phase=${H1.state.phase}`); return; }
  await sleep(400);
  t0 = Date.now();
  H1.send('vote', { yes: true });
  await sleep(400);
  check("EP-04: vote before 12:00 → voteDeny {reason:'early'}", last(H1, 'voteDeny', t0)?.reason === 'early' && !got(H1, 'vote', t0).length, JSON.stringify(got(H1, 'voteDeny', t0)));
  for (const junk of [null, 'yes', { yes: 'true' }, { yes: 1 }, { no: true }]) { H1.send('vote', junk); await sleep(80); }
  await sleep(400);
  H1.send('debug', { cmd: 'clock', n: ROLLBACK_FROM_MS + 2000 });
  H1.send('debug', { cmd: 'tower', team: 'blue' });
  await sleep(150);
  H1.send('debug', { cmd: 'tower', team: 'blue' }); // blue lost 2 structures, red 0 → blue bots will vote yes
  await sleep(500);
  // An ENEMY (red) vote: its own team's vote — blue sees nothing of it.
  t0 = Date.now();
  H3.send('vote', { yes: true });
  await sleep(4000); // red bots vote (no: red is ahead) → red's vote fails
  const rv = got(H3, 'vote', t0)[0];
  check("EP-04: vote payload {yes,no,need,endsAt,by} to the voter's team", !!rv && rv.yes === 1 && rv.no === 0 && rv.need === ROLLBACK_NEED && rv.endsAt > Date.now() - 10000 && rv.by === 'VoteRed', JSON.stringify(rv));
  check("EP-04: an enemy's vote never reaches the other team", !got(H1, 'vote', t0).length && !got(H2, 'vote', t0).length && !got(H1, 'voteEnd', t0).length, `blue saw ${got(H1, 'vote', t0).length} vote / ${got(H1, 'voteEnd', t0).length} voteEnd`);
  check('EP-04: bots of the leading team vote no → that vote fails (voteEnd {passed:false})', last(H3, 'voteEnd', t0)?.passed === false && H1.state.phase === 'playing',
    `red voteEnd=${JSON.stringify(got(H3, 'voteEnd', t0))} last vote=${JSON.stringify(last(H3, 'vote', t0))}`);
  // Blue (losing): H1 opens, spams, bots say yes, H2 says no → blocked.
  t0 = Date.now();
  H1.send('vote', { yes: true });
  await sleep(450);
  const bv = last(H2, 'vote', t0);
  check('EP-04: a yes at ≥ 12:00 opens a vote — every teammate gets {yes:1,no:0,need,by}', !!bv && bv.yes === 1 && bv.need === ROLLBACK_NEED && bv.by === 'VoteHost', JSON.stringify(bv));
  for (let i = 0; i < 8; i++) { H1.send('vote', { yes: true }); await sleep(120); }
  await sleep(300);
  const denies = got(H1, 'voteDeny', t0);
  const maxYes = Math.max(0, ...got(H1, 'vote', t0).map((v) => v.yes));
  check("EP-04: voting twice / spam → voteDeny {reason:'active'} (rate-limited), the ballot counts once",
    denies.length >= 1 && denies.length <= 4 && denies.every((d) => d.reason === 'active') && maxYes <= 4,
    `denies=${denies.length} (${[...new Set(denies.map((d) => d.reason))]}) maxYes=${maxYes}`);
  await sleep(3200); // 3 blue bots vote yes → 4 yes, but H2 (human) has not voted → still open
  const mid = last(H1, 'vote', t0);
  check('EP-04: 4 yes but a human still to vote → the vote stays open', !!mid && mid.yes >= ROLLBACK_NEED && !got(H1, 'voteEnd', t0).length && H1.state.phase === 'playing', JSON.stringify(mid));
  H2.send('vote', { yes: false });
  await sleep(500);
  check('EP-04: one human NO blocks the rollback (voteEnd {passed:false}, match goes on)', last(H1, 'voteEnd', t0)?.passed === false && last(H2, 'voteEnd', t0)?.passed === false && H1.state.phase === 'playing',
    `voteEnd=${JSON.stringify(got(H1, 'voteEnd', t0))} phase=${H1.state.phase}`);
  t0 = Date.now();
  H1.send('vote', { yes: true });
  await sleep(400);
  check("EP-04: a new vote right after a failed one → voteDeny {reason:'cooldown'}", last(H1, 'voteDeny', t0)?.reason === 'cooldown', JSON.stringify(got(H1, 'voteDeny', t0)));
  for (const r of [H1, H2, H3]) { try { await r.leave(); } catch (_) { /* gone */ } }

  // Solo human + 4 bots, losing → passes: the other team wins by 'rollback'.
  let S;
  try { S = await mk((c) => c.create('team_custom', { name: 'SoloQuit', roomName: 'rollback', champ: 'tester' })); } catch (err) { check('EP-04: solo vote room', false, err.message); return; }
  await sleep(400);
  if (!(await toPlaying(S))) { check('EP-04: solo room reaches playing', false, `phase=${S.state.phase}`); return; }
  const myTeam = seat(S)?.team;
  S.send('debug', { cmd: 'clock', n: ROLLBACK_FROM_MS + 1000 });
  S.send('debug', { cmd: 'tower' }); await sleep(150); S.send('debug', { cmd: 'tower' });
  await sleep(400);
  t0 = Date.now();
  S.send('vote', { yes: true });
  for (let i = 0; i < 50 && S.state.phase === 'playing'; i++) await sleep(100);
  await sleep(300);
  const ann = got(S, 'announce', t0).find((a) => /rolled back/.test(a.title));
  check('EP-04: a losing solo human + 4 bots → the vote passes (voteEnd {passed:true})', last(S, 'voteEnd', t0)?.passed === true, JSON.stringify(got(S, 'vote', t0).slice(-1)));
  check("EP-04: pass → phase ended, winner = the other team, winReason 'rollback', banner", S.state.phase === 'ended' && !!S.state.winner && S.state.winner !== myTeam && S.state.winReason === 'rollback' && !!ann,
    `phase=${S.state.phase} winner=${S.state.winner} (me ${myTeam}) winReason=${S.state.winReason} announce=${ann?.title}`);
  t0 = Date.now();
  S.send('vote', { yes: true });
  await sleep(400);
  check("EP-04: vote after 'ended' → voteDeny {reason:'phase'}", last(S, 'voteDeny', t0)?.reason === 'phase', JSON.stringify(got(S, 'voteDeny', t0)));
  console.log('INFO  EP-04: offline practice — n/a on the server (OfflineSim has no vote; the client hides the button)');
  try { await S.leave(); } catch (_) { /* gone */ }
}

// ───────────────────────── review fix: a dropped human keeps a LOCKED pick during select ─────────────────────────
// A locks pixel (mid) → A's socket drops (seat held, bot-held) → teammate B locks another mid champion
// (triggers the bot re-balance) → A's seat must keep pixel, and still have it after reconnecting.
async function ep19HeldSeatCheck(check) {
  let A, B;
  const quiet = (r) => { r.onMessage('*', () => {}); return r; };
  try {
    A = quiet(await new Client(SERVER).create('team_custom', { name: 'HeldA', roomName: 'held seat', champ: 'pixel' }));
    B = quiet(await new Client(SERVER).joinById(A.roomId, { name: 'HeldB', champ: 'stack' }));
  } catch (err) { check('review: held-seat room', false, err.message); return; }
  await sleep(500);
  const seat = (r, sid) => r.state.champions.get(sid);
  if (seat(B, B.sessionId)?.team !== seat(A, A.sessionId)?.team) { B.send('side', { team: seat(A, A.sessionId).team }); await sleep(500); }
  A.send('startNow');
  for (let i = 0; i < 30 && A.state.phase !== 'select'; i++) await sleep(100);
  A.send('pick', { champ: 'pixel' }); await sleep(250); A.send('lock'); await sleep(300);
  const aSid = A.sessionId, token = A.reconnectionToken;
  const lockedOk = seat(B, aSid)?.champ === 'pixel' && seat(B, aSid)?.locked;
  A.connection.close();
  await sleep(500);
  const mid = ['cleaner', 'model'].find((c) => { let held = false; B.state.champions.forEach((x) => { if (x.team === seat(B, B.sessionId).team && x.champ === c) held = true; }); return !held; });
  B.send('pick', { champ: mid }); await sleep(250); B.send('lock'); await sleep(400);
  const during = seat(B, aSid);
  check('review: a human who drops in select after locking keeps the pick while bot-held (B locked the same lane)',
    lockedOk && during?.isBot === true && during?.champ === 'pixel' && during?.locked === true && seat(B, B.sessionId)?.champ === mid,
    `locked=${lockedOk} A seat ${during?.champ} isBot=${during?.isBot} · B ${seat(B, B.sessionId)?.champ}`);
  let A2 = null;
  try { A2 = quiet(await new Client(SERVER).reconnect(token)); } catch (err) { check('review: held-seat reconnect', false, err.message); }
  if (A2) {
    await sleep(500);
    const back = seat(B, aSid);
    check('review: … and still has it after reconnecting (isBot false)', back?.champ === 'pixel' && back?.locked === true && back?.isBot === false, `A seat ${back?.champ} locked=${back?.locked} isBot=${back?.isBot}`);
  }
  for (const r of [A2, B]) { try { await r?.leave(); } catch (_) { /* gone */ } }
}

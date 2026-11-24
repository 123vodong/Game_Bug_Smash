// In-process fast-forward harness for TeamRoom — whole bots-only matches in seconds.
// Real room + bots, stubbed Colyseus I/O, fake clock → a whole match in seconds.
//
// Usage:  node team_ff.mjs [matches=1] [maxMinutes=45] [--seed=N] [--human=afk|auto] [--quiet] [--feed]
//   --human=afk   one human joins blue and idles in the fountain (4v5 + AFK)
//   --human=auto  one human joins and a bot brain drives it (autopilot)
//   --human=lane  EP-05 newcomer check: one PASSIVE human stands in front of its mid outer tower (idle →
//                 only auto-attacks what walks into range, never chases) — deaths in the first 5:00 reported
//   --feed        print every feed/announce line
//   --botskill=L  force the bot skill level: easy | normal | hard (default: the room's pick — normal
//                 for bots-only, the humans' average MMR otherwise; the harness human is new → easy)
//   --champ=ID    champion for the harness human (with --human)
//   --spells=D,F  summoner spells for the harness human (with --human), e.g. ghost,ignite
//   --jitter=P    v4: skip the state patch after a tick with probability P (two ticks per patch window,
//                 like a real setInterval clock) — exercises StateView add/remove churn within one patch
//
// v2 report (always): exceptions (tick throws, caught + counted), "stuck" = a
// champion that wants to move (move order, or attack order out of range; not
// stunned/rooted/knocked/recalling) but hasn't moved > 20 px in 3 s, entities
// found inside a wall, avg/max tick ms, side balance, match length,
// per-champion games / win rate / K/D/A, knockbacks + wall-stuns, pet damage,
// nav stats (A* calls).
// v3 report: champion select is driven for real (bots draft at random times, the
// harness human joins with autoLock) — draft problems (unlocked seats, duplicate
// picks on a team, invalid spell pairs, select/loading length), summoner spell
// casts per kind, smite-secured / smite-stolen epics.
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const args = process.argv.slice(2);
const flag = (name, def) => { const a = args.find((x) => x.startsWith(`--${name}`)); if (!a) return def; const v = a.split('=')[1]; return v === undefined ? true : v; };
const positional = args.filter((a) => !a.startsWith('--'));
const MATCHES = Number(positional[0] || 1);
const MAX_MIN = Number(positional[1] || 45);
const QUIET = !!flag('quiet', false);
const FEED = !!flag('feed', false);
const HUMAN = flag('human', '');
const BOTSKILL = flag('botskill', '');   // easy | normal | hard (default: the room's own pick)
const JITTER = Number(flag('jitter', 0)) || 0;
let seed = Number(flag('seed', Date.now() % 100000));

// Seeded PRNG so a run can be reproduced.
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

let fake = 1_750_000_000_000;
Date.now = () => fake;
const { TeamRoom } = await import(pathToFileURL(path.join(ROOT, 'server/rooms/TeamRoom.js')).href);
const { isBlocked } = await import(pathToFileURL(path.join(ROOT, 'shared/moba/nav.js')).href);
const { CHAMPIONS } = await import(pathToFileURL(path.join(ROOT, 'shared/moba/champions.js')).href);
const STUCK_MS = 3000, STUCK_PX = 20;
const champAgg = {};   // champ id -> { games, wins, k, d, a, cs, picks:{role:n} }
const draftAgg = { problems: 0, log: [], selectMs: [], loadingMs: [] };
const spellAgg = { casts: {}, smiteEpics: 0, smiteSteals: 0 };
const totals = { exceptions: 0, stuck: 0, inWall: 0, knocks: 0, wallStuns: 0, petDmg: 0, petAtk: 0, zones: 0, ticks: 0, tickMs: 0, maxTick: 0, paths: 0, unitPaths: 0, deferred: 0, unstick: 0 };
const stuckLog = [], inWallLog = [], excLog = [];
const castAgg = {};    // champ id -> { q, w, e, r } successful casts (all matches)
const origErr = console.error;
console.error = (...a) => { totals.exceptions++; if (excLog.length < 5) excLog.push(a.map(String).join(' ').slice(0, 400)); origErr(...a); };
const { TEAM_INFO } = await import(pathToFileURL(path.join(ROOT, 'shared/moba/rules.js')).href);
const { SPELL_IDS, validSpellPair } = await import(pathToFileURL(path.join(ROOT, 'shared/moba/spells.js')).href);

const NL = String.fromCharCode(10);
const fmt = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function makeRoom() {
  const room = new TeamRoom();
  const counts = {};
  const lines = [];
  const sent = [];
  // fx are counted where they are produced (v4: _fx sends per team, not via broadcast).
  const countFx = (msg) => {
    counts.fx = (counts.fx || 0) + 1;
    if (msg.k === 'knock') { totals.knocks++; if (msg.wall) totals.wallStuns++; }
    if (msg.k === 'petatk') totals.petAtk++;
    if (msg.k === 'zone') totals.zones++;
    counts[`fx_${msg.k}`] = (counts[`fx_${msg.k}`] || 0) + 1;
  };
  room.broadcast = (type, msg) => {
    if (type !== 'fx') counts[type] = (counts[type] || 0) + 1;
    // v4: a broadcast reaches every client (both team observers).
    if (BW.on) { const n = msgSize(type, msg); BW.msg.blue += n; BW.msg.red += n; }
    if (type === 'fx' && !room._views) countFx(msg); // pre-v4 rooms broadcast fx
    if (type === 'atk') counts.atkEntries = (counts.atkEntries || 0) + msg.length;
    if (type === 'feed' || type === 'announce' || type === 'chat') lines.push({ t: fake, type, msg });
  };
  room.setSimulationInterval = () => {};
  room.lock = async () => {};
  room.unlock = async () => {};
  room.disconnect = async () => { room._disconnected = true; };
  room.setMetadata = async () => {};
  const handlers = {};
  room.onMessage = (type, cb) => { handlers[type] = cb; return () => {}; };
  room.onCreate({});
  if (BOTSKILL) room._botSkillOverride = BOTSKILL;
  // v4: one observer client per team — counts the bytes of every team-filtered message (atk / fx).
  for (const team of ['blue', 'red']) {
    room.clients.push({
      sessionId: `obs_${team}`, userData: { team, observer: true }, view: room._views ? room._views[team] : undefined,
      send: (type, msg) => {
        if (BW.on) BW.msg[team] += msgSize(type, msg);
        if (type === 'fx' || type === 'atk') BW.teamMsgs[team]++;
        if (type === 'atk') counts[`atkEntries_${team}`] = (counts[`atkEntries_${team}`] || 0) + msg.length;
      },
    });
  }
  if (room._views) { const orig = room._fx.bind(room); room._fx = (msg) => { countFx(msg); orig(msg); }; }
  // A fake client list so _sendTo works for the harness human.
  const fakeClient = { sessionId: 'human1', userData: {}, send: (type, msg) => sent.push({ t: fake, type, msg }) };
  return { room, counts, lines, handlers, fakeClient, sent };
}

function snapshot(room, t0) {
  const st = room.state;
  const by = { blue: [], red: [] };
  for (const ch of room.champs.values()) by[ch.team].push(ch);
  const towersDown = { blue: 0, red: 0 };
  for (const s of room.structs.values()) if (!s.alive) towersDown[s.team]++;
  let minions = 0, monsters = 0;
  for (const u of room.units.values()) if (u.alive) { if (u.utype === 'minion') minions++; else monsters++; }
  const synced = st.champions.size + st.units.size + st.structures.size;
  const lv = (team) => (by[team].reduce((s, c) => s + c.level, 0) / by[team].length).toFixed(1);
  const gold = (team) => Math.round(by[team].reduce((s, c) => s + c.gold + c.items.reduce((a, id) => a + (id ? ITEM_COST[id] : 0), 0), 0) / by[team].length);
  return `${fmt(Date.now() - t0)} kills B${st.blueKills}/R${st.redKills} lostStructs B${towersDown.blue}/R${towersDown.red} lvl B${lv('blue')}/R${lv('red')} worth B${gold('blue')}/R${gold('red')} minions=${minions} monsters=${monsters} synced=${synced} epics g=${st.epicGoldenAt ? 'next' : 'UP'} d=${st.epicDeadlineAt ? 'next' : 'UP'} buff B'${st.buffBlue}' R'${st.buffRed}'`;
}

const { ITEMS } = await import(pathToFileURL(path.join(ROOT, 'shared/moba/items.js')).href);
// The real schema encoder (as Colyseus' SchemaSerializer uses it) — catches type/range/NaN problems the sim alone can't.
const { Encoder, Reflection } = await import(pathToFileURL(path.join(ROOT, 'server/node_modules/@colyseus/schema/build/esm/index.mjs')).href);
// v4 vision audit: a real client decoder per team view; every 20 ticks its champion/unit keys must
// equal exactly what room.canSee(team) allows (hidden enemies absent, nothing visible missing).
const visAgg = { checks: 0, leaks: 0, missing: 0, hiddenChampTicks: 0, hiddenUnitTicks: 0, log: [] };
let encodeBytes = 0, encodePatches = 0, encodeWarn = 0;
const origLog = console.log;
console.log = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('trying to encode')) { encodeWarn++; if (encodeWarn <= 3) origLog('ENCODE WARNING:', ...a); return; } origLog(...a); };
const ITEM_COST = Object.fromEntries(Object.entries(ITEMS).map(([k, v]) => [k, v.cost]));

const results = [];
// v4 bandwidth accounting (per team observer): state bytes = shared patch + that team's StateView
// patch (or the shared patch when the room has no views), msg bytes = msgpack size of every message.
const { pack } = await import(pathToFileURL(path.join(ROOT, 'server/node_modules/@colyseus/msgpackr/index.js')).href).catch(() => import('@colyseus/msgpackr'));
const msgSize = (type, msg) => { try { return pack([type, msg]).length + 2; } catch (_) { return 0; } };
const BW = { on: false, msg: { blue: 0, red: 0 }, state: { blue: 0, red: 0 }, teamMsgs: { blue: 0, red: 0 } };
const bwAgg = { sec: 0, sum: 0, peak: 0, stateSum: 0, msgSum: 0 };
const tickSamples = [];

// v3 draft self-test (review round 1): an UNLOCKED leaver's bot takes the open role (+ its perks),
// and a hoverless human is auto-locked from ROLE_PICKS of an open role. Deterministic, no matches.
{
  const { ROLE_PICKS } = await import(pathToFileURL(path.join(ROOT, 'shared/moba/champions.js')).href);
  const { ROLE_SPELLS } = await import(pathToFileURL(path.join(ROOT, 'shared/moba/spells.js')).href);
  for (let trial = 0; trial < 20; trial++) {
    Math.random = mulberry32(seed * 7 + trial);
    const { room } = makeRoom();
    const cl = (id) => ({ sessionId: id, userData: {}, send: () => {} });
    const A = cl('hA'), B = cl('hB'), C = cl('hC');
    room.onJoin(A, { champ: 'pixel', name: 'A', autoLock: true });  // blue, mid (locked)
    room.onJoin(B, { name: 'B' });                                   // red, no hover — never picks
    room.onJoin(C, { name: 'C' });                                   // blue, no hover — leaves unlocked
    room._startSelect();
    room.onLeave(C, true);
    const sc = room.slots.get('hC');
    const blueRoles = [...room.slots.values()].filter((x) => x.team === 'blue' && x !== sc).map((x) => (x.isBot ? x.role : CHAMPIONS[x.s.champ]?.lane));
    const sp = ROLE_SPELLS[sc.role] || [];
    const okLeave = sc.isBot && !blueRoles.includes(sc.role) && sc.s.spellD === sp[0] && sc.s.spellF === sp[1];
    const sbOpen = room._openRole(room.slots.get('hB'));
    for (let i = 0; i < 2000 && room.state.phase === 'select'; i++) { fake += 50; room._tick(50); }
    const okLeavePick = (ROLE_PICKS[sc.role] || []).includes(sc.s.champ);
    const sb = room.slots.get('hB');
    const redOther = [sbOpen];
    const okHoverless = sb.s.locked && (ROLE_PICKS[sbOpen] || []).includes(sb.s.champ);
    if (!okLeave || !okLeavePick || !okHoverless) {
      draftAgg.problems++;
      if (draftAgg.log.length < 8) draftAgg.log.push(`self-test ${trial}: leaver role=${sc.role} spells=${sc.s.spellD}/${sc.s.spellF} champ=${sc.s.champ} (blue roles ${blueRoles.join(',')}) · hoverless B=${sb.s.champ} (red roles ${redOther.join(',')})`);
    }
  }
  console.log(`v3 draft self-test (20 trials): ${draftAgg.problems ? 'FAIL' : 'ok'}`);
}
// EP-19 draft self-test: bots draft ONE champion per role per team (by the champion's natural lane),
// lock inside SELECT_BOT_PICK_MS, and loading starts ≤ SELECT_ALL_LOCKED_MS after the last lock. A human
// who locks a lane a bot already locked keeps the pick — that bot re-roles + re-picks.
{
  const { SELECT_BOT_PICK_MS, SELECT_ALL_LOCKED_MS } = await import(pathToFileURL(path.join(ROOT, 'shared/moba/rules.js')).href);
  const { ROLE_ORDER } = await import(pathToFileURL(path.join(ROOT, 'shared/moba/champions.js')).href);
  let fails = 0;
  const log = [];
  const lanesOk = (room, team) => { const l = [...room.slots.values()].filter((x) => x.team === team).map((x) => CHAMPIONS[x.s.champ]?.lane); return ROLE_ORDER.every((r) => l.filter((y) => y === r).length === 1); };
  for (let trial = 0; trial < 40; trial++) {
    Math.random = mulberry32(seed * 11 + trial);
    const { room } = makeRoom();
    const H = { sessionId: 'hX', userData: {}, send: () => {} };
    const withHuman = trial % 2 === 0;
    if (withHuman) room.onJoin(H, { name: 'X' }); // no hover: picks late, into a lane a bot already locked
    const t0 = Date.now();
    room._startSelect();
    let lastLockAt = 0, loadAt = 0, humanPick = '';
    for (let i = 0; i < 1000 && room.state.phase === 'select'; i++) {
      fake += 50; room._tick(50);
      const seats = [...room.slots.values()];
      if (!lastLockAt && seats.filter((x) => x.isBot).every((x) => x.s.locked)) lastLockAt = Date.now();
      if (withHuman && lastLockAt && !humanPick) {
        const team = room.slots.get('hX').team;
        const taken = seats.find((x) => x.team === team && x.isBot && CHAMPIONS[x.s.champ]?.lane === 'mid');
        humanPick = ['cleaner', 'model', 'pixel'].find((c) => room._freeForTeam(team, c, 'hX')) || '';
        room.slots.get('hX').lastPickAt = 0;
        room._doPick('hX', { champ: humanPick }); room._doLock('hX');
        if (!taken) log.push(`trial ${trial}: (no mid bot to collide with)`);
      }
    }
    if (room.state.phase === 'loading') loadAt = Date.now();
    const problems = [];
    for (const team of ['blue', 'red']) if (!lanesOk(room, team)) problems.push(`${team} lanes ${[...room.slots.values()].filter((x) => x.team === team).map((x) => `${x.s.champ}(${CHAMPIONS[x.s.champ]?.lane})`).join(',')}`);
    if (!lastLockAt || lastLockAt - t0 > SELECT_BOT_PICK_MS[1] + 100) problems.push(`bots locked after ${lastLockAt - t0} ms`);
    const humanLockAt = lastLockAt; // the harness human locks on the same tick as the last bot
    if (!loadAt || loadAt - Math.max(lastLockAt, humanLockAt) > SELECT_ALL_LOCKED_MS + 100) problems.push(`loading ${loadAt - lastLockAt} ms after the last lock`);
    if (withHuman && room.slots.get('hX').s.champ !== humanPick) problems.push(`human pick ${humanPick} → ${room.slots.get('hX').s.champ}`);
    if (problems.length) { fails++; if (log.length < 6) log.push(`trial ${trial}: ${problems.join(' · ')}`); }
  }
  draftAgg.problems += fails;
  console.log(`EP-19 draft self-test (40 trials, one champion per role per team · bots lock ≤ ${SELECT_BOT_PICK_MS[1] / 1000}s · loading ≤ ${SELECT_ALL_LOCKED_MS / 1000}s after): ${fails ? 'FAIL' : 'ok'}${log.length ? `${NL}  ` + log.join(`${NL}  `) : ''}`);
}
// Pass 2 RP-06 queue self-test (quick play): a lone human waits LOBBY_MS (30 s) — READY starts the
// draft at once (click → playing ≤ 10 s); a later join keeps ≥ LOBBY_JOIN_EXTEND_MS on the clock, never past
// LOBBY_MAX_MS from the first join, never shorter than shown; with 2 humans the draft starts only when BOTH are ready.
{
  const { LOBBY_MS, LOBBY_JOIN_EXTEND_MS, LOBBY_MAX_MS } = await import(pathToFileURL(path.join(ROOT, 'shared/moba/rules.js')).href);
  const probs = [];
  const clickToPlay = [];
  const cl = (id) => ({ sessionId: id, userData: {}, send: () => {} });
  for (let trial = 0; trial < 10; trial++) {
    Math.random = mulberry32(seed * 17 + trial);
    const { room } = makeRoom();
    const t0 = Date.now();
    room.onJoin(cl('q1'), { name: 'Q1', champ: 'tester', autoLock: true });
    if (room.state.lobbyEndsAt !== t0 + LOBBY_MS) probs.push(`solo lobbyEndsAt ${room.state.lobbyEndsAt - t0}`);
    fake += 500; room._tick(50);
    room._doReady('q1');
    if (room.state.phase !== 'select') probs.push(`solo READY → ${room.state.phase}`);
    for (let i = 0; i < 1000 && room.state.phase !== 'playing'; i++) { fake += 50; room._tick(50); }
    clickToPlay.push(Date.now() - t0);
    if (Date.now() - t0 > 10000) probs.push(`solo click→playing ${Date.now() - t0} ms`);
    // two humans: extension, cap, ready check
    const { room: r2 } = makeRoom();
    const u0 = Date.now();
    r2.onJoin(cl('a'), { name: 'A' });
    fake += 25000; r2._tick(50);
    r2.onJoin(cl('b'), { name: 'B' });
    if (r2.state.lobbyEndsAt !== u0 + 25000 + LOBBY_JOIN_EXTEND_MS) probs.push(`late join → ends ${r2.state.lobbyEndsAt - u0} (want ${25000 + LOBBY_JOIN_EXTEND_MS})`);
    fake += 9000; r2._tick(50);
    r2.onJoin(cl('c'), { name: 'C' });           // +34 s → +44 s
    if (r2.state.lobbyEndsAt !== u0 + 34000 + LOBBY_JOIN_EXTEND_MS) probs.push(`2nd late join → ends ${r2.state.lobbyEndsAt - u0}`);
    fake += 9000; r2._tick(50);
    r2.onJoin(cl('d'), { name: 'D' });           // +43 s → capped at LOBBY_MAX_MS
    if (r2.state.lobbyEndsAt !== u0 + LOBBY_MAX_MS) probs.push(`cap → ends ${r2.state.lobbyEndsAt - u0} (want ${LOBBY_MAX_MS})`);
    r2._doReady('a'); r2._doReady('b'); r2._doReady('c');
    if (r2.state.phase !== 'lobby') probs.push('3 of 4 ready already started');
    r2._doReady('d');
    if (r2.state.phase !== 'select') probs.push(`all ready → ${r2.state.phase}`);
  }
  if (probs.length) totals.exceptions++;
  console.log(`Pass 2 queue self-test (10 trials): ${probs.length ? 'FAIL ' + probs.slice(0, 4).join(' · ') : 'ok'} · solo READY click→playing avg ${(clickToPlay.reduce((a, b) => a + b, 0) / clickToPlay.length / 1000).toFixed(1)} s (max ${(Math.max(...clickToPlay) / 1000).toFixed(1)})`);
}
// v4 view-churn self-test (decode-error regression): an enemy champion flickers visible → hidden
// across TWO ticks inside ONE patch window (+ an item change). Pre-fix this made the decoder see a
// refId it never got ("refId" not found …). Decoders below are the same Reflection path the client uses.
{
  const { bushAt } = await import(pathToFileURL(path.join(ROOT, 'shared/moba/map.js')).href);
  let churnErrs = 0;
  const prevErr = console.error;
  console.error = (...a) => { if (/refId/.test(String(a[0]))) churnErrs++; else prevErr(...a); };
  Math.random = mulberry32(seed * 13);
  const { room } = makeRoom();
  room._startSelect();
  for (let i = 0; i < 2000 && room.state.phase !== 'playing'; i++) { fake += 50; room._tick(50); }
  room.bots.paused = true;
  const enc = new Encoder(room.state);
  const dec = {};
  { const it = { offset: 0 }; enc.encodeAll(it); for (const t of ['blue', 'red']) { dec[t] = Reflection.decode(Reflection.encode(enc)); dec[t].decode(enc.encodeAllView(room._views[t], it.offset, { offset: it.offset })); } enc.discardChanges(); }
  const patch = () => { room.onBeforePatch?.(room.state); const it = { offset: 0 }; enc.encode(it); const so = it.offset; for (const t of ['blue', 'red']) dec[t].decode(enc.encodeView(room._views[t], so, it)); enc.discardChanges(); };
  const tick = () => { fake += 50; room._tick(50); };
  const red = [...room.champs.values()].find((c) => c.team === 'red');
  const spot = { x: 1250, y: 3350 }; // bush b5 (circle r110)
  let ok = bushAt(spot.x, spot.y) === 'b5';
  for (let round = 0; round < 30 && ok; round++) {
    for (const c of room.champs.values()) if (c.team === 'blue') { c.x = 500; c.y = 5500; c.order = null; } // nobody near
    red.x = spot.x; red.y = spot.y; red.order = null; red.revealUntil = 0; red.recallUntil = 0; red.atkReadyAt = Infinity;
    tick(); patch();                                   // hidden from blue
    red.revealUntil = Date.now() + 60;                 // visible for the next tick only …
    red.items[0] = round % 2 ? 'mouse' : ''; red.itemsVer = (red.itemsVer || 0) + 1;
    tick();
    tick();                                            // … hidden again — no patch in between
    patch(); tick(); patch();
    if (dec.blue.state.champions.has(red.id) !== room.canSee('blue', red)) ok = false;
  }
  console.error = prevErr;
  room.bots.paused = false;
  console.log(`v4 view-churn self-test (30 flickers inside one patch window): ${ok && !churnErrs ? 'ok' : `FAIL (decode errors ${churnErrs}, consistent=${ok})`}`);
  if (!ok || churnErrs) totals.exceptions++;
}
for (let m = 0; m < MATCHES; m++) {
  Math.random = mulberry32(seed + m);
  fake = 1_750_000_000_000 + m * 10_000_000;
  const { room, counts, lines, handlers, fakeClient, sent } = makeRoom();
  if (HUMAN) {
    room.clients.push(fakeClient);
    room.onJoin(fakeClient, { champ: flag('champ', 'pixel'), name: 'HarnessHuman', autoLock: true });
    if (flag('spells', '')) { const [d, f] = String(flag('spells', '')).split(','); console.log(`  human spells ${d}/${f}: ${room._doSpells('human1', { d, f }) ? 'ok' : 'REJECTED'}`); }
    handlers.hello(fakeClient);
  }
  // v3: lobby → champion select → loading → playing, on the fake clock.
  room._startSelect();
  const selAt = Date.now();
  let loadAt = 0;
  for (let i = 0; i < 2000 && room.state.phase !== 'playing'; i++) {
    fake += 50;
    try { room._tick(50); } catch (err) { totals.exceptions++; if (excLog.length < 5) excLog.push(err?.stack || String(err)); }
    if (!loadAt && room.state.phase === 'loading') {
      loadAt = Date.now();
      const draftProblem = (msg) => { draftAgg.problems++; if (draftAgg.log.length < 8) draftAgg.log.push(`match ${m + 1}: ${msg}`); };
      for (const team of ['blue', 'red']) {
        const seats = [...room.slots.values()].filter((sl) => sl.team === team);
        if (seats.length !== 5) draftProblem(`${team} has ${seats.length} seats`);
        const picks = seats.map((sl) => sl.s.champ);
        if (new Set(picks).size !== picks.length) draftProblem(`${team} duplicate picks ${picks.join(',')}`);
        const lanes = new Set(picks.map((c) => CHAMPIONS[c]?.lane)); // EP-19: one champion per role
        if (lanes.size !== 5) draftProblem(`${team} not role-balanced: ${picks.map((c) => `${c}(${CHAMPIONS[c]?.lane})`).join(',')}`);
        for (const sl of seats) {
          if (!sl.s.locked || !CHAMPIONS[sl.s.champ]) draftProblem(`${sl.id} not locked (${sl.s.champ})`);
          if (!validSpellPair(sl.s.spellD, sl.s.spellF)) draftProblem(`${sl.id} invalid spells ${sl.s.spellD}/${sl.s.spellF}`);
        }
      }
    }
  }
  draftAgg.selectMs.push((loadAt || Date.now()) - selAt);
  draftAgg.loadingMs.push(loadAt ? Date.now() - loadAt : 0);
  if (room.state.phase !== 'playing') { draftAgg.problems++; draftAgg.log.push(`match ${m + 1}: never reached playing (phase ${room.state.phase})`); }
  if (HUMAN === 'auto') room.bots.adopt('human1', room.champs.get('human1').role, { silent: true });
  if (flag('redfirst', false)) { // ordering experiment: iterate red before blue everywhere
    const reorder = (map) => { const e = [...map.entries()]; map.clear(); for (const [k, v] of [...e.filter(([, v]) => v.team === 'red'), ...e.filter(([, v]) => v.team !== 'red')]) map.set(k, v); };
    reorder(room.champs);
    const be = [...room.bots.brains.entries()]; room.bots.brains.clear();
    for (const [k, v] of [...be.filter(([k]) => room.champs.get(k).team === 'red'), ...be.filter(([k]) => room.champs.get(k).team !== 'red')]) room.bots.brains.set(k, v);
  }
  // Death forensics: who died where, outnumbered?, under whose tower?
  const deaths = [];
  const origDeath = room._onChampDeath.bind(room);
  room._onChampDeath = (v, src, now) => {
    const near = (team, r) => [...room.champs.values()].filter((c) => c !== v && !c.dead && c.team === team && Math.hypot(c.x - v.x, c.y - v.y) < r);
    const enemies = near(v.team === 'blue' ? 'red' : 'blue', 1000), allies = near(v.team, 1000);
    let ownTower = Infinity, enemyTower = Infinity;
    for (const s of room.structs.values()) {
      if (!s.alive || s.kind !== 'tower') continue;
      const d = Math.hypot(s.x - v.x, s.y - v.y);
      if (s.team === v.team) ownTower = Math.min(ownTower, d); else enemyTower = Math.min(enemyTower, d);
    }
    const lvE = enemies.length ? enemies.reduce((s, c) => s + c.level, 0) / enemies.length : 0;
    deaths.push({ t: now - t0, team: v.team, role: v.role, lv: v.level, lvE, nE: enemies.length, nA: allies.length,
      underOwn: ownTower < 480, underEnemy: enemyTower < 480, src: src?.etype === 'champ' ? `champ:${src.role}` : (src?.utype || src?.etype || '?'),
      mode: room.bots.brains.get(v.id)?.lastMode || '' });
    return origDeath(v, src, now);
  };
  // Pet damage dealt (pet hits are owner damage with kind 'pet').
  const origDeal = room._dealDamage.bind(room);
  room._dealDamage = (src, t, raw, opts) => { const d = origDeal(src, t, raw, opts); if (opts && opts.kind === 'pet') totals.petDmg += d; return d; };
  // Successful casts per champion + slot (do bots use the new skills?).
  const origCast = room._doCast.bind(room);
  room._doCast = (sid, msg) => { const ok = origCast(sid, msg); if (ok) { const c = room.champs.get(sid); const k = `${c.champ}`; const ca = castAgg[k] || (castAgg[k] = { q: 0, w: 0, e: 0, r: 0 }); ca[msg.slot]++; } return ok; };
  const stuckAnchor = new Map();
  const enc = new Encoder(room.state);
  const decoders = {};
  const views = room._views || null; // v4: per-team StateViews (absent before v4)
  {
    const it = { offset: 0 };
    const full = enc.encodeAll(it);
    encodeBytes += full.length;
    if (views) for (const t of ['blue', 'red']) { const buf = enc.encodeAllView(views[t], it.offset, { offset: it.offset }); decoders[t] = Reflection.decode(Reflection.encode(enc)); decoders[t].decode(buf); }
  }
  BW.on = true;
  let bwSecBytes = { blue: 0, red: 0 };
  const t0 = Date.now();
  let ticks = 0, tickMs = 0, maxTick = 0, maxSynced = 0, lastLog = 0, feedIdx = 0;
  // EP-05 pacing: first champion kill, first structure, kills by 5:00 / 9:00.
  const pace = { firstKill: 0, firstTower: 0, k5: -1, k9: -1 };
  const maxMs = MAX_MIN * 60000;
  while (room.state.phase === 'playing' && Date.now() - t0 < maxMs) {
    fake += 50;
    const a = performance.now();
    try { room._tick(50); } catch (err) { totals.exceptions++; if (excLog.length < 5) excLog.push(err?.stack || String(err)); }
    const d = performance.now() - a;
    const patched = !(JITTER > 0 && Math.random() < JITTER) || room.state.phase !== 'playing';
    if (patched) {
      room.onBeforePatch?.(room.state); // Colyseus calls this right before every patch
      const it = { offset: 0 };
      const shared = enc.encode(it);
      const so = it.offset, sharedLen = shared.length;
      encodeBytes += sharedLen; encodePatches++;
      for (const t of ['blue', 'red']) {
        let n = sharedLen;
        if (views) { const buf = enc.encodeView(views[t], so, it); n = buf.length; decoders[t].decode(buf); }
        BW.state[t] += n; bwSecBytes[t] += n;
      }
      enc.discardChanges();
    }
    tickSamples.push(d);
    if (views && room.state.phase === 'playing') {
      for (const c of room.champs.values()) if (!room.canSee(c.team === 'blue' ? 'red' : 'blue', c)) visAgg.hiddenChampTicks++;
      for (const u of room.units.values()) if (u.team !== 'neutral' && !room.canSee(u.team === 'blue' ? 'red' : 'blue', u)) visAgg.hiddenUnitTicks++;
      if (patched && ticks % 20 === 0) {
        for (const t of ['blue', 'red']) {
          const ds = decoders[t].state;
          visAgg.checks++;
          for (const [map, recs] of [[ds.champions, room.champs], [ds.units, room.units]]) {
            for (const [id, e] of recs) {
              const want = room.canSee(t, e), has = !!map?.has(id);
              if (want === has) continue;
              if (has) visAgg.leaks++; else visAgg.missing++;
              if (visAgg.log.length < 6) visAgg.log.push(`${fmt(Date.now() - t0)} view ${t}: ${id} (${e.team} ${e.etype}/${e.utype || e.champ}) want=${want} has=${has} bush=${e.bush}`);
            }
          }
        }
      }
    }
    ticks++; tickMs += d; maxTick = Math.max(maxTick, d);
    if (ticks % 20 === 0) { // one simulated second: bytes per client (state + messages)
      for (const t of ['blue', 'red']) {
        const sec = bwSecBytes[t] + BW.msg[t];
        bwAgg.sec++; bwAgg.sum += sec; bwAgg.peak = Math.max(bwAgg.peak, sec);
        bwAgg.stateSum += bwSecBytes[t]; bwAgg.msgSum += BW.msg[t];
        bwSecBytes[t] = 0; BW.msg[t] = 0;
      }
    }
    totals.ticks++; totals.tickMs += d; totals.maxTick = Math.max(totals.maxTick, d);
    if (HUMAN === 'lane' && ticks % 20 === 0) { // passive newcomer: walk back to the lane spot (never attacks on purpose)
      const h = room.champs.get('human1');
      if (h && !h.dead) {
        const tw = room.structs.get(`${h.team}_mid_1`), core = room.structs.get(`${h.team === 'blue' ? 'red' : 'blue'}_core`);
        const dx = core.x - tw.x, dy = core.y - tw.y, dl = Math.hypot(dx, dy) || 1;
        const x = tw.x + dx / dl * 250, y = tw.y + dy / dl * 250;
        if (Math.hypot(h.x - x, h.y - y) > 60) room._doOrder('human1', { type: 'move', x, y });
      }
      if (pace.h5 === undefined && Date.now() - t0 >= 5 * 60000) pace.h5 = h ? h.deaths : 0;
    }
    {
      const el = Date.now() - t0, k = room.state.blueKills + room.state.redKills;
      if (!pace.firstKill && k > 0) pace.firstKill = el;
      if (!pace.firstTower) for (const s of room.structs.values()) if (!s.alive) { pace.firstTower = el; break; }
      if (pace.k5 < 0 && el >= 5 * 60000) pace.k5 = k;
      if (pace.k9 < 0 && el >= 9 * 60000) pace.k9 = k;
    }
    // Stuck detector (champions that want to move but don't).
    const now = Date.now();
    for (const c of room.champs.values()) {
      const o = c.order;
      let wants = !c.dead && o && now >= c.stunnedUntil && now >= c.rootedUntil && !c.knock && c.recallUntil === 0;
      if (wants && o.type === 'attack') { const t = room._ent(o.id); wants = !!t && room._isAlive(t) && !room._inAttackRange(c, t); }
      if (!wants) { stuckAnchor.delete(c.id); continue; }
      const an = stuckAnchor.get(c.id);
      if (!an || Math.hypot(c.x - an.x, c.y - an.y) > STUCK_PX) { stuckAnchor.set(c.id, { x: c.x, y: c.y, at: now }); continue; }
      if (now - an.at >= STUCK_MS) {
        totals.stuck++;
        if (stuckLog.length < 12) stuckLog.push(`${fmt(now - t0)} ${c.team}/${c.champ} @${Math.round(c.x)},${Math.round(c.y)} order=${JSON.stringify(o)} nav=${c.nav ? (c.nav.pts ? c.nav.pts.length + 'pts i' + c.nav.i : 'direct') : '-'}`);
        stuckAnchor.set(c.id, { x: c.x, y: c.y, at: now });
      }
    }
    // Nobody inside furniture (sampled every 10 ticks).
    if (ticks % 10 === 0) {
      const chk = (e, what) => {
        if (e.knock) return;
        if (isBlocked(e.x, e.y, Math.max(0, (e.radius || 0) - 3))) { totals.inWall++; if (inWallLog.length < 8) inWallLog.push(`${fmt(now - t0)} ${what} @${Math.round(e.x)},${Math.round(e.y)} r${e.radius}`); }
      };
      for (const c of room.champs.values()) if (!c.dead) chk(c, `champ ${c.team}/${c.champ}`);
      for (const u of room.units.values()) if (u.alive) chk(u, `${u.utype} ${u.kind}`);
    }
    const st = room.state;
    maxSynced = Math.max(maxSynced, st.champions.size + st.units.size + st.structures.size);
    if (FEED) for (; feedIdx < lines.length; feedIdx++) {
      const l = lines[feedIdx];
      const txt = l.type === 'feed' ? l.msg.text : l.type === 'announce' ? `[${l.msg.title}] ${l.msg.sub || ''}` : `${l.msg.name}: ${l.msg.text}`;
      console.log(`  ${fmt(l.t - t0)} ${l.type.padEnd(8)} ${txt}`);
    }
    if (!QUIET && Date.now() - lastLog >= 60000) { lastLog = Date.now(); console.log(snapshot(room, t0)); }
    const LEAVE = Number(flag('leave', 0));
    if (HUMAN && LEAVE && !room._harnessLeft && Date.now() - t0 >= LEAVE * 1000) {
      room._harnessLeft = true;
      room.clients.splice(room.clients.indexOf(fakeClient), 1);
      room.onLeave(fakeClient, true);
      const c = room.champs.get('human1');
      console.log(`  ${fmt(Date.now() - t0)} human left → isBot=${c?.isBot} brain=${room.bots.isBot('human1')}`);
    }
  }
  // v4: phase 'ended' = full reveal — every champion back in both team views (+ scores rows).
  if (views && room.state.phase === 'ended') {
    const it = { offset: 0 }; enc.encode(it); const so = it.offset;
    for (const t of ['blue', 'red']) decoders[t].decode(enc.encodeView(views[t], so, it));
    enc.discardChanges();
    for (const t of ['blue', 'red']) {
      const ds = decoders[t].state;
      const ok = ds.champions.size === room.champs.size && ds.scores?.size === room.champs.size;
      visAgg.endChecks = (visAgg.endChecks || 0) + 1;
      if (!ok) { visAgg.endFails = (visAgg.endFails || 0) + 1; visAgg.log.push(`end reveal ${t}: champions ${ds.champions.size}/${room.champs.size} scores ${ds.scores?.size}`); }
    }
  }
  // Let the end linger elapse to exercise the disconnect path.
  for (let i = 0; i < 20000 / 50 + 5 && room.state.phase === 'ended'; i++) { fake += 50; room._tick(50); if (room._disconnected) break; }
  const st = room.state;
  const dur = Date.now() - t0;
  const champs = [...room.champs.values()];
  const row = (c) => `${c.team.padEnd(4)} ${c.champ.padEnd(6)} ${c.role.padEnd(7)} L${String(c.level).padStart(2)} ${String(c.kills).padStart(2)}/${String(c.deaths).padStart(2)}/${String(c.assists).padStart(2)} cs ${String(c.cs).padStart(3)} gold ${String(Math.floor(c.gold)).padStart(5)} items ${c.items.filter(Boolean).join(',')}`;
  const structsDown = [...room.structs.values()].filter((s) => !s.alive).map((s) => s.id);
  console.log(`\n=== match ${m + 1} (seed ${seed + m}) — winner ${st.winner || 'NONE'} after ${fmt(dur)} · kills B${st.blueKills}/R${st.redKills} · disconnected=${!!room._disconnected}`);
  console.log(`structures destroyed (${structsDown.length}): ${structsDown.join(' ')}`);
  for (const c of champs.sort((a, b) => a.team.localeCompare(b.team))) console.log('  ' + row(c));
  console.log(`ticks ${ticks} avg ${(tickMs / Math.max(1, ticks)).toFixed(3)} ms max ${maxTick.toFixed(1)} ms · max synced entities ${maxSynced} · heap ${(process.memoryUsage().heapUsed / 1048576).toFixed(1)} MB${globalThis.gc ? (globalThis.gc(), ` (after gc ${(process.memoryUsage().heapUsed / 1048576).toFixed(1)} MB)`) : ""}`);
  console.log('messages:', JSON.stringify(counts));
  console.log(`schema encode: ${encodePatches} patches, avg ${(encodeBytes / Math.max(1, encodePatches)).toFixed(0)} B/patch (${(encodeBytes / Math.max(1, encodePatches) * 20 / 1024).toFixed(1)} KB/s at 20 Hz), NaN warnings ${encodeWarn}`);
  if (HUMAN) console.log('to human:', JSON.stringify(sent.reduce((o, s) => ((o[s.type] = (o[s.type] || 0) + 1), o), {})));
  const ann = lines.filter((l) => l.type === 'announce').map((l) => `${fmt(l.t - t0)} ${l.msg.title}`);
  console.log('announcements:\n  ' + ann.join('\n  '));
  if (flag('deaths', false)) {
    const tally = (key) => deaths.reduce((o, d) => ((o[key(d)] = (o[key(d)] || 0) + 1), o), {});
    console.log('deaths by victim:', JSON.stringify(tally((d) => `${d.team}_${d.role}`)));
    console.log('deaths by src:', JSON.stringify(tally((d) => d.src)));
    console.log('deaths by odds (enemies v allies near):', JSON.stringify(tally((d) => `${d.nE}v${d.nA + 1}`)));
    console.log('deaths by place:', JSON.stringify(tally((d) => d.underOwn ? 'underOwnTower' : d.underEnemy ? 'underEnemyTower' : 'open')));
    console.log('deaths by victim mode:', JSON.stringify(tally((d) => d.mode || '?')));
    console.log('deaths by level gap (enemy avg − victim):', JSON.stringify(tally((d) => d.nE ? String(Math.round(d.lvE - d.lv)) : 'n/a')));
  }
  {
    const k = st.blueKills + st.redKills;
    if (pace.k5 < 0) pace.k5 = k;
    if (pace.k9 < 0) pace.k9 = k;
  }
  if (HUMAN === 'lane' && pace.h5 === undefined) pace.h5 = room.champs.get('human1')?.deaths ?? 0;
  if (HUMAN === 'lane') console.log(`passive human: deaths by 5:00 ${pace.h5} · total ${room.champs.get('human1')?.deaths} (${room.champs.get('human1')?.kills}/${room.champs.get('human1')?.deaths}/${room.champs.get('human1')?.assists})`);
  console.log(`pacing: first kill ${pace.firstKill ? fmt(pace.firstKill) : '-'} · first structure ${pace.firstTower ? fmt(pace.firstTower) : '-'} · kills by 5:00 ${pace.k5} · by 9:00 ${pace.k9}`);
  results.push({ winner: st.winner, dur, kills: st.blueKills + st.redKills, structs: structsDown.length, tickAvg: tickMs / Math.max(1, ticks), maxTick, pace });
  for (const c of champs) {
    const a = champAgg[c.champ] || (champAgg[c.champ] = { games: 0, wins: 0, k: 0, d: 0, a: 0, cs: 0, roles: {} });
    a.games++; if (st.winner && c.team === st.winner) a.wins++;
    a.k += c.kills; a.d += c.deaths; a.a += c.assists; a.cs += c.cs;
    a.roles[c.role] = (a.roles[c.role] || 0) + 1;
  }
  for (const [k, n] of Object.entries(room.spellStats.casts)) spellAgg.casts[k] = (spellAgg.casts[k] || 0) + n;
  spellAgg.smiteEpics += room.spellStats.smiteEpics; spellAgg.smiteSteals += room.spellStats.smiteSteals;
  const ms = room.mover.stats;
  totals.paths += ms.paths; totals.unitPaths += ms.unitPaths; totals.deferred += ms.deferred; totals.unstick += ms.unstick;
}
{
  const blue = results.filter((r) => r.winner === 'blue').length, red = results.filter((r) => r.winner === 'red').length;
  console.log(`\n### v2 report (${MATCHES} match${MATCHES > 1 ? 'es' : ''})`);
  console.log(`exceptions ${totals.exceptions}${excLog.length ? '\n  ' + excLog.join('\n  ') : ''}`);
  console.log(`stuck (>${STUCK_MS / 1000}s wanting to move, <${STUCK_PX}px) ${totals.stuck}${stuckLog.length ? '\n  ' + stuckLog.join('\n  ') : ''}`);
  console.log(`inside a wall (sampled) ${totals.inWall}${inWallLog.length ? '\n  ' + inWallLog.join('\n  ') : ''}`);
  { const srt = [...tickSamples].sort((a, b) => a - b); const q = (p) => srt[Math.min(srt.length - 1, Math.floor(srt.length * p))] || 0;
    console.log(`tick p50 ${q(0.5).toFixed(3)} ms · p99 ${q(0.99).toFixed(3)} ms · p99.9 ${q(0.999).toFixed(2)} ms`);
    console.log(`bytes/s per client (state + msgs): avg ${(bwAgg.sum / Math.max(1, bwAgg.sec) / 1024).toFixed(2)} KB/s (state ${(bwAgg.stateSum / Math.max(1, bwAgg.sec) / 1024).toFixed(2)} · msgs ${(bwAgg.msgSum / Math.max(1, bwAgg.sec) / 1024).toFixed(2)}) · peak 1 s ${(bwAgg.peak / 1024).toFixed(2)} KB/s · team-filtered atk/fx msgs blue ${BW.teamMsgs.blue} red ${BW.teamMsgs.red}`); }
  console.log(`tick avg ${(totals.tickMs / Math.max(1, totals.ticks)).toFixed(3)} ms · max ${totals.maxTick.toFixed(1)} ms · per-match avg ${results.map((r) => r.tickAvg.toFixed(2)).join(' ')}`);
  console.log(`sides: blue ${blue} · red ${red} · none ${results.length - blue - red}`);
  console.log(`v4 vision: hidden enemy champion-ticks ${visAgg.hiddenChampTicks} · hidden minion/pet-ticks ${visAgg.hiddenUnitTicks} · decoded-view audits ${visAgg.checks} · leaks ${visAgg.leaks} · missing ${visAgg.missing} · end full-reveal ${(visAgg.endChecks || 0) - (visAgg.endFails || 0)}/${visAgg.endChecks || 0}${visAgg.log.length ? '\n  ' + visAgg.log.join('\n  ') : ''}`);
  console.log(`knockbacks ${totals.knocks} · wall-stuns ${totals.wallStuns} · zones ${totals.zones} · pet attacks ${totals.petAtk} · pet damage ${Math.round(totals.petDmg)}`);
  console.log(`nav: A* ${totals.paths} (units ${totals.unitPaths}, deferred ${totals.deferred}) · unstick hops ${totals.unstick}`);
  const avg = (a) => (a.reduce((x, y) => x + y, 0) / Math.max(1, a.length) / 1000).toFixed(1);
  console.log(`v3 draft: problems ${draftAgg.problems}${draftAgg.log.length ? '\n  ' + draftAgg.log.join('\n  ') : ''} · select avg ${avg(draftAgg.selectMs)} s (max ${(Math.max(...draftAgg.selectMs) / 1000).toFixed(1)}) · loading avg ${avg(draftAgg.loadingMs)} s`);
  console.log(`v3 spells cast (total · per match): ${SPELL_IDS.map((k) => `${k} ${spellAgg.casts[k] || 0} (${((spellAgg.casts[k] || 0) / MATCHES).toFixed(1)})`).join(' · ')}`);
  console.log(`v3 smite: epics secured with smite ${spellAgg.smiteEpics} · steals (enemy was on it) ${spellAgg.smiteSteals}`);
  console.log('champion  role(s)                  games  win%   K/D/A per game     K/D   cs   casts/game Q/W/E/R');
  const ids = Object.keys(CHAMPIONS).sort((x, y) => (champAgg[y]?.games || 0) - (champAgg[x]?.games || 0));
  for (const id of ids) {
    const a = champAgg[id];
    if (!a) { console.log(`${id.padEnd(9)} (never picked)`); continue; }
    const roles = Object.entries(a.roles).map(([r, n]) => `${r}${n}`).join(',');
    const g = a.games;
    console.log(`${id.padEnd(9)} ${roles.padEnd(24)} ${String(g).padStart(5)} ${String(Math.round(a.wins / g * 100)).padStart(4)}%   ${(a.k / g).toFixed(1).padStart(4)}/${(a.d / g).toFixed(1).padStart(4)}/${(a.a / g).toFixed(1).padStart(4)}   ${(a.k / Math.max(1, a.d)).toFixed(2).padStart(5)} ${String(Math.round(a.cs / g)).padStart(4)}   ${['q', 'w', 'e', 'r'].map((sl) => ((castAgg[id]?.[sl] || 0) / g).toFixed(0)).join('/')}`);
  }
}
if (MATCHES > 1) {
  const durs = results.map((r) => r.dur / 60000);
  console.log(`\n### ${MATCHES} matches: winners ${results.map((r) => r.winner || '-').join(' ')}`);
  const med = (a) => { const v = [...a].sort((x, y) => x - y); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : 0; };
  const P = results.map((r) => r.pace);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  console.log(`### pacing: first kill median ${fmt(med(P.map((p) => p.firstKill || Infinity)))} (avg ${fmt(mean(P.map((p) => p.firstKill)))}) · first structure median ${fmt(med(P.map((p) => p.firstTower || Infinity)))} · kills by 5:00 avg ${mean(P.map((p) => p.k5)).toFixed(1)} · by 9:00 avg ${mean(P.map((p) => p.k9)).toFixed(1)} (min ${Math.min(...P.map((p) => p.k9))}) · length median ${med(durs).toFixed(1)} min · in 10–14 min ${durs.filter((d) => d >= 10 && d <= 14).length}/${durs.length}`);
  if (HUMAN === 'lane') { const h5 = P.map((p) => p.h5 || 0); console.log(`### passive human deaths by 5:00: ${h5.join(' ')} · max ${Math.max(...h5)} · avg ${mean(h5).toFixed(1)}`); }
  console.log(`### length min/avg/max ${Math.min(...durs).toFixed(1)}/${(durs.reduce((a, b) => a + b, 0) / durs.length).toFixed(1)}/${Math.max(...durs).toFixed(1)} min · kills avg ${(results.reduce((a, r) => a + r.kills, 0) / results.length).toFixed(1)} · structures avg ${(results.reduce((a, r) => a + r.structs, 0) / results.length).toFixed(1)}`);
}

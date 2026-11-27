// Pass 2 regression check (PASS2_BREAKDOWN.md RP-14) — run against a DEBUG dev server:
//   BUG_SMASH_DEBUG=1 BUG_SMASH_RANKS=memory PORT=2650 node server/index.js
//   SERVER=ws://localhost:2650 node tools/playtest/pass2_check.mjs
// Checks: one live session per player id (arena + team: DUP_TAB, PLAY HERE takeover, IN_MATCH),
// a seat held for the whole match + rejoin with the saved token, sell (undo refund + 70 %),
// the quick-play queue (30 s, ready check), ranked results at the end, the HTTP API.
// Exit code 0 = all checks passed. Takes ~40 s.
import { Client } from 'colyseus.js';
import crypto from 'crypto';

const SERVER = process.env.SERVER || 'ws://localhost:2650';
const HTTP = SERVER.replace(/^ws/, 'http');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const pid = () => crypto.randomBytes(16).toString('hex');
const post = async (path, body) => (await fetch(HTTP + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
const quiet = (room) => { room.onMessage('*', () => {}); return room; };
const errOf = async (p) => { try { const r = await p; try { await r.leave(); } catch (_) { /* */ } return ''; } catch (e) { return String(e?.message || e); } };
const until = async (fn, ms = 15000, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(step); } return false; };

// ── 1. Personal Mode: one tab per player ──
{
  const P = pid();
  const a = quiet(await new Client(SERVER).joinOrCreate('arena', { name: 'TabA', pid: P }));
  await sleep(300);
  const e = await errOf(new Client(SERVER).joinOrCreate('arena', { name: 'TabB', pid: P }));
  check('arena: a 2nd tab of the same player is refused (DUP_TAB)', e.includes('DUP_TAB'), e || 'joined');
  let closed = 0;
  a.onLeave((code) => { closed = code; });
  const t = await post('/api/session/takeover', { pid: P });
  await until(() => closed, 3000);
  check('arena: PLAY HERE closes the old tab with 4010', t.closed === 1 && closed === 4010, `closed=${t.closed} code=${closed}`);
  await sleep(300);
  const b = quiet(await new Client(SERVER).joinOrCreate('arena', { name: 'TabB', pid: P }));
  await sleep(500);
  let twins = 0;
  b.state.players.forEach((p) => { if (p.name === 'TabA') twins++; });
  check('arena: …then the new tab joins and the old stickman is gone (no twin)', twins === 0, `TabA left behind: ${twins}`);
  const other = quiet(await new Client(SERVER).joinOrCreate('arena', { name: 'Other', pid: pid() }));
  check('arena: a different player id is unaffected', !!other.sessionId);
  const anon = quiet(await new Client(SERVER).joinOrCreate('arena', { name: 'Anon' }));
  check('arena: no pid (old client / harness) still joins', !!anon.sessionId);
  await b.leave(); await other.leave(); await anon.leave();
}

// ── 2. Team quick play: queue, ready, presence, rejoin, sell, ranked ──
const Q = pid();
const c1 = new Client(SERVER);
let A = quiet(await c1.joinOrCreate('team', { name: 'Ranker', pid: Q, champ: 'cache', autoLock: true }));
await until(() => A.state?.lobbyEndsAt > 0, 3000);
const left = A.state.lobbyEndsAt - Date.now();
check('queue: a lone player waits ~30 s for others (not 3 s)', left > 25000 && left <= 30500, `${Math.round(left / 1000)} s`);
// a 2nd queue tab of the same player: the old lobby tab is closed instead (harmless) → the new one joins
let aClosed = 0;
A.onLeave((code) => { aClosed = code; });
let e2 = '';
try { A = quiet(await new Client(SERVER).joinOrCreate('team', { name: 'Ranker', pid: Q, champ: 'cache', autoLock: true })); } catch (e) { e2 = String(e?.message || e); }
check('queue: a 2nd tab in the lobby replaces the first one (no error)', !e2, e2);
await until(() => aClosed, 3000);
check('queue: …the replaced lobby tab is closed with 4010', aClosed === 4010, `code=${aClosed}`);
await until(() => A.state.champions?.get?.(A.sessionId), 3000);
const rank0 = A.state.champions.get(A.sessionId)?.rank || '';
check('rank: a new player starts at Intern IV, 0 of 5 stars (seat badge)', rank0.includes('Intern IV') && rank0.includes('★0/5'), rank0);
A.send('ready');
const sel = await until(() => A.state.phase === 'select', 3000);
check('queue: alone + READY starts champion select right away', sel, A.state.phase);
await until(() => A.state.phase === 'playing', 20000, 200);
check('the match reaches playing', A.state.phase === 'playing', A.state.phase);
const roomId = A.roomId, sid = A.sessionId;

// presence while playing
const e3 = await errOf(new Client(SERVER).joinOrCreate('team', { name: 'Dup', pid: Q }));
check('in a match: another tab is refused (DUP_TAB)', e3.includes('DUP_TAB'), e3);
const e3b = await errOf(new Client(SERVER).joinOrCreate('arena', { name: 'Dup', pid: Q }));
check('in a match: Personal Mode in another tab is refused too (DUP_TAB)', e3b.includes('DUP_TAB'), e3b);
const me1 = await post('/api/me', { pid: Q });
check('/api/me shows the running match (connected)', me1?.match?.roomId === roomId && me1.match.connected === true, JSON.stringify(me1?.match));

// sell: undo refund + 70 %
const champ = () => A.state.champions.get(sid);
for (let i = 0; i < 40 && champ()?.dead; i++) await sleep(250);
const home = champ().team === 'blue' ? { x: 520, y: 5480 } : { x: 5480, y: 520 };
A.send('debug', { cmd: 'tp', ...home });
A.send('debug', { cmd: 'gold', n: 3000 });
await sleep(400);
const g0 = champ().gold;
A.send('buy', { item: 'mouse' });
await sleep(300);
const slot = [...champ().items].indexOf('mouse');
A.send('sell', { slot });
await sleep(300);
check('sell: right after buying = full refund (undo)', champ().gold === g0 && [...champ().items].every((x) => x !== 'mouse'), `gold ${g0} → ${champ().gold}`);
A.send('sell', { slot: 99 }); A.send('sell', { slot: -1 }); A.send('sell', { slot: 'x' }); A.send('sell', {});
await sleep(300);
check('sell: junk slots are ignored', champ().gold === g0, `gold=${champ().gold}`);
const { sellValue, SELL_UNDO_MS } = await import('../../shared/moba/rules.js');
check('sell: always 75 % (25 % loss, no undo)', sellValue(1000, 1, 2 + SELL_UNDO_MS) === 750 && sellValue(1000, 1, 100) === 750);
A.send('buy', { item: 'chair' });           // bought at home …
await sleep(250);
A.send('debug', { cmd: 'tp', x: champ().team === 'blue' ? 1500 : 4500, y: champ().team === 'blue' ? 4500 : 1500 });
await sleep(400);                              // … then walked out (alive)
const gOut = champ().gold;
const itOut = [...champ().items].join(',');
A.send('sell', { slot: 0 });
await sleep(300);
check('sell: outside the fountain (alive) is refused', champ().gold === gOut && [...champ().items].join(',') === itOut, `gold ${gOut} → ${champ().gold}`);

// drop → seat held for the match → IN_MATCH → rejoin with the token
const token = A.reconnectionToken;
A.connection.close();
await sleep(800);
const me2 = await post('/api/me', { pid: Q });
check('dropped: /api/me still lists the match (held, not connected)', me2?.match?.roomId === roomId && me2.match.connected === false, JSON.stringify(me2?.match));
const e4 = await errOf(new Client(SERVER).joinOrCreate('team', { name: 'Requeue', pid: Q }));
check('dropped: queueing again → IN_MATCH:<roomId> (rejoin instead)', e4.includes(`IN_MATCH:${roomId}`), e4);
await sleep(1500); // well past nothing special — the hold has no timer
let A2 = null;
try { A2 = quiet(await new Client(SERVER).reconnect(token)); } catch (e) { check('rejoin with the saved token works', false, e.message); }
if (A2) {
  check('rejoin with the saved token works (same seat)', A2.sessionId === sid && A2.roomId === roomId, `${A2.sessionId} vs ${sid}`);
  await until(() => A2.state.champions?.get?.(sid), 3000);
  check('rejoin: the seat is human again', A2.state.champions.get(sid)?.isBot === false);
  // takeover while playing: the new tab gets the seat back via the token
  let closed2 = 0; A2.onLeave((c) => { closed2 = c; });
  const tk = await post('/api/session/takeover', { pid: Q });
  await until(() => closed2, 3000);
  check('PLAY HERE in a match closes the old tab (4010) and keeps the seat held', tk.closed === 1 && closed2 === 4010, `code=${closed2}`);
  await sleep(400);
  let A3 = null;
  try { A3 = quiet(await new Client(SERVER).reconnect(A2.reconnectionToken)); } catch (e) { check('…the new tab reconnects into the seat', false, e.message); }
  if (A3) {
    check('…the new tab reconnects into the seat', A3.sessionId === sid);
    let rank = null;
    A3.onMessage('rank', (m) => { rank = m; });
    A3.send('debug', { cmd: 'win', kills: 12 }); // 12 kills → surely the winning team's MVP
    await until(() => rank, 5000);
    check('ranked: a win sends `rank` with a positive delta (placement: K 48)', rank && rank.won === true && rank.delta > 0 && rank.games === 1 && rank.placementLeft === 4, JSON.stringify(rank));
    check('stars: the win reports stars gained = 10-point steps crossed', rank && rank.starDelta === Math.floor((rank.after - 700) / 10) && /★/.test(rank.starText), `+${rank?.starDelta} ★ → ${rank?.labelAfter} ${rank?.starText}`);
    check('MVP: the winning team MVP gets +1 bonus ★ (72 + 10 rank points)', rank && rank.bonus === 'mvp' && rank.delta === 82, `bonus=${rank?.bonus} delta=${rank?.delta}`);
    const R = await import('../../shared/moba/ranks.js');
    const svp = R.applyPerfBonus(-24, 'svp', false, 1000, 1000), capped = R.applyPerfBonus(12, 'mvp', true, 1200, 1000), lossMvp = R.applyPerfBonus(-12, 'mvp', false, 900, 1000);
    check('SVP: the losing team\'s best loses half; no bonus 2 divisions above MMR; MVP needs a win',
      svp.delta === -12 && svp.bonus === 'svp' && capped.delta === 12 && !capped.bonus && lossMvp.delta === -12, JSON.stringify({ svp, capped, lossMvp }));
    const me3 = await post('/api/me', { pid: Q });
    check('ranked: /api/me shows 1 win, no running match', me3?.rank?.wins === 1 && me3.rank.games === 1 && !me3.match, JSON.stringify(me3?.rank));
    check('ranked: the seat label updates after the match', (A3.state.scores.get(sid)?.rank || '').length > 0, A3.state.scores.get(sid)?.rank);
    const top = await (await fetch(`${HTTP}/api/rank/top`)).json();
    check('/api/rank/top lists a player after one ranked match', Array.isArray(top) && top.some((p) => p.id === me3?.id && p.label.startsWith('Intern')), `n=${top.length}`);
    await A3.leave();
  }
}

// ── 2b. abandon: everyone presses LEAVE → the match ends ~10 s later, a loss for the leaver ──
{
  const L = pid();
  const B = quiet(await new Client(SERVER).joinOrCreate('team', { name: 'Leaver', pid: L, champ: 'hr', autoLock: true }));
  await until(() => B.state?.phase === 'lobby', 3000);
  B.send('ready');
  await until(() => B.state.phase === 'playing', 20000, 200);
  await sleep(500);
  await B.leave(); // consented
  const me0 = await post('/api/me', { pid: L });
  check('LEAVE (consented) frees the player at once (can queue again)', !me0.match, JSON.stringify(me0.match));
  await sleep(12500);
  const me1 = await post('/api/me', { pid: L });
  check('abandon: an empty match ends ~10 s later and the leaver gets a loss', me1?.rank?.losses === 1 && me1.rank.games === 1, JSON.stringify(me1?.rank));
  check('floor: a loss at Intern IV 0 LP stays at Intern IV 0 LP (☆☆☆☆☆)', me1?.rank?.label === 'Intern IV' && me1.rank.lp === 0 && me1.rank.rating === 700 && me1.rank.starText === '☆☆☆☆☆', `${me1?.rank?.label} ${me1?.rank?.starText}`);
}

// ── 3. HTTP input validation ──
{
  const r = await fetch(`${HTTP}/api/me`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pid: '../../etc' }) });
  check('/api/me rejects a malformed pid (400)', r.status === 400);
  const r2 = await fetch(`${HTTP}/api/session/takeover`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  check('/api/session/takeover rejects a missing pid (400)', r2.status === 400);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

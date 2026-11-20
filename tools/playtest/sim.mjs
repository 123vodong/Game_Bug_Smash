// Headless MP test client: joins the arena as a "human", logs server traffic
// (feed / announce / chat / rewards) and samples world state every 5 s.
//
// Usage:  node sim.mjs <seconds> [event@sec | end@sec ...]
//   node sim.mjs 60                                  # observe bots + natural events
//   node sim.mjs 90 golden_bug@5 deadline_boss@30    # force events (dev server only)
//   node sim.mjs 40 deadline_boss@8 end@14           # force the boss to time out (fail path)
// Env:  SERVER=ws://localhost:2567   PLAY=0 (stand still instead of auto-hunting)
//       PLAY=lazy (half-speed walk, swings every 600 ms — an idle-ish new hire; EP-20 catch-up)
// Also logs: own promotions (t → Lv), broken time (synced brokenUntil vs observed), bot lineup at join.
// Event ids: prod_down coffee_break code_freeze friday_deploy hackathon golden_bug deadline_boss
// Forcing events needs the server's opt-in debug hooks:  BUG_SMASH_DEBUG=1 node index.js
// (PowerShell: $env:BUG_SMASH_DEBUG=1; node index.js). Without it, event@sec is ignored.
// Also here: exploits.mjs — regression test for rejected malicious messages.
import { Client } from 'colyseus.js';

const secs = Number(process.argv[2] || 30);
const schedule = process.argv.slice(3).map((s) => { const [id, at] = s.split('@'); return { id, at: Number(at) }; });
const client = new Client(process.env.SERVER || 'ws://localhost:2567');
const room = await client.joinOrCreate('arena', { name: 'Tester', hat: 'duck' });
const t0 = Date.now();
const ts = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5);
const counts = {};
const bump = (k) => { counts[k] = (counts[k] || 0) + 1; };

for (const type of ['feed', 'announce', 'chat', 'kill', 'ko', 'reward', 'brokenBy', 'crowned', 'pickup', 'chatHistory']) {
  room.onMessage(type, (m) => {
    bump(type);
    if (type === 'kill' || type === 'pickup') return; // too chatty to print
    const txt = type === 'chat' ? `${m.kind || 'human'} ${m.name}: ${m.text}`
      : type === 'feed' ? m.text
      : type === 'announce' ? `[${m.kind}] ${m.title || m.id || ''} ${m.sub || ''} ${m.pm ? '| PM: ' + m.pm : ''}`
      : JSON.stringify(m).slice(0, 160);
    console.log(`${ts()} ${type.padEnd(8)} ${txt}`);
  });
}
room.onMessage('welcome', (m) => { bump('welcome'); console.log(`${ts()} welcome skew=${m.serverNow - Date.now()}ms events=${Object.keys(m.events).length}`); });
room.onMessage('bossSlam', () => bump('bossSlam'));
room.onMessage('bossSlamHit', () => bump('bossSlamHit'));
room.send('hello');

// Auto-play like a human: boss > golden bug > nearest bug. Same messages the browser sends.
// Predicts its own position like the real client (state only patches at 12.5 Hz —
// stepping from the synced position would crawl at ~150 px/s instead of 240).
const PLAY = process.env.PLAY !== '0';
const LAZY = process.env.PLAY === 'lazy';
let lastLv = 1, brokenAt = 0, lineupDone = false;
let ang = 0, lastSmash = 0, pos = null;
const mover = setInterval(() => {
  const st = room.state;
  const me = st.players.get(room.sessionId);
  if (!me) return;
  if (!pos || Math.hypot(me.x - pos.x, me.y - pos.y) > 90) pos = { x: me.x, y: me.y }; // adopt server corrections
  if (me.level > lastLv) console.log(`${ts()} PROMO    L${lastLv} → L${me.level} (xp ${me.xp})`);
  lastLv = me.level;
  if (me.broken && !brokenAt) { brokenAt = Date.now(); console.log(`${ts()} BROKEN   brokenUntil in ${Math.round(me.brokenUntil - Date.now())} ms`); }
  if (!me.broken && brokenAt) { console.log(`${ts()} REPAIRED after ${Date.now() - brokenAt} ms`); brokenAt = 0; }
  if (!PLAY || me.broken) {
    ang += 0.05;
    pos.x += Math.cos(ang) * 6; pos.y += Math.sin(ang) * 6;
    room.send('move', { x: pos.x, y: pos.y });
    return;
  }
  let tx = null, ty = null, msg = null, reach = 88;
  st.bosses.forEach((b, id) => { if (b.alive) { tx = b.x; ty = b.y; msg = { boss: id }; reach = 150; } });
  if (msg == null) {
    let bestD = Infinity;
    st.bugs.forEach((b, id) => {
      if (!b.alive) return;
      const d = Math.hypot(b.x - pos.x, b.y - pos.y) - (b.kind === 'bug-golden' ? 5000 : 0);
      if (d < bestD) { bestD = d; tx = b.x; ty = b.y; msg = { id }; }
    });
  }
  if (tx == null) return;
  const dx = tx - pos.x, dy = ty - pos.y, d = Math.hypot(dx, dy) || 1;
  const step = (LAZY ? 120 : 240) * 0.05;
  if (d > 30) {
    pos.x += (dx / d) * step; pos.y += (dy / d) * step;
    room.send('move', { x: pos.x, y: pos.y });
  }
  if (d < reach && Date.now() - lastSmash > (LAZY ? 600 : 230)) {
    lastSmash = Date.now();
    room.send('action', { kind: 'smash' });
    room.send('smash', { ...msg, kind: 'smash' });
  }
}, 50);

const sampler = setInterval(() => {
  const st = room.state;
  const sec = Math.floor((Date.now() - t0) / 1000);
  for (const s of schedule) {
    if (s.done || sec < s.at) continue;
    s.done = true;
    if (s.id === 'end') { room.send('debug', { cmd: 'endEvent' }); console.log(`${ts()} >>> debug endEvent`); }
    else { room.send('debug', { cmd: 'event', id: s.id }); console.log(`${ts()} >>> debug start ${s.id}`); }
  }
  if (!lineupDone && st.players.size > 1) {
    lineupDone = true;
    const l = []; st.players.forEach((p) => { if (p.isBot) l.push(`${p.name.slice(0, 12)}:L${p.level}/${p.score}`); });
    console.log(`${ts()} LINEUP   bots ${l.join('  ')}`);
  }
  if (sec % 5 !== 0) return;
  let humans = 0, bots = 0, broken = 0; const lv = [];
  st.players.forEach((p) => { p.isBot ? bots++ : humans++; if (p.broken) broken++; lv.push(`${p.name.slice(0, 10)}:L${p.level}/${p.score}${p.broken ? 'X' : ''}`); });
  let bugs = 0; st.bugs.forEach((b) => { if (b.alive) bugs++; });
  let boss = ''; st.bosses.forEach((b) => { boss = ` boss=${b.hp}/${b.maxHp} ph${b.phase} alive=${b.alive}`; });
  console.log(`${ts()} STATE humans=${humans} bots=${bots} broken=${broken} bugs=${bugs} pickups=${st.pickups.size} obst=${st.obstacles.size} event=${st.event || '-'}(${st.eventLeftMs}) crown=${st.crownSid ? st.players.get(st.crownSid)?.name : '-'}/${st.bounty}${boss}`);
  if (sec % 15 === 0) console.log(`        ${lv.join('  ')}`);
}, 1000);

setTimeout(async () => {
  clearInterval(mover); clearInterval(sampler);
  console.log('--- message counts:', JSON.stringify(counts));
  await room.leave();
  process.exit(0);
}, secs * 1000);

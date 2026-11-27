// Headless check for src/three/hunt/sim.js (no browser). Run: node tools/playtest/hunt_sim_check.mjs
import { HuntSim, comboMult, W, H } from '../../src/three/hunt/sim.js';
import { LEVELS, starsFor } from '../../src/data/levels.js';

let fails = 0;
const ok = (name, c, d = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${name}${d ? '  - ' + d : ''}`); };
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const flags = () => { const m = {}; return { get: (k) => m[k], set: (k, v) => { m[k] = v; } }; };

// Bot: chase nearest visible bug, hold smash. Returns the sim after it ends or maxMs.
function play(levelIndex, seed, { bot = true, maxMs = 120000, fl = flags() } = {}) {
  const sim = new HuntSim({ levelIndex, rng: mulberry(seed), flags: fl });
  const ev = { smash: 0, kill: 0, combo: 0, pickup: 0, hide: 0, respawn: 0, glitch: 0, coach: 0 };
  for (const k of Object.keys(ev)) sim.on(k === 'hide' ? 'bugHide' : k === 'respawn' ? 'bugRespawn' : k, () => ev[k]++);
  sim.setHold(bot);
  let t = 0;
  while (sim.state === 'playing' && t < maxMs) {
    if (bot) {
      let best = null, bd = 1e9;
      for (const b of sim.bugs) if (b.alive && b.visible) { const d = Math.hypot(b.x - sim.hunter.x, b.y - sim.hunter.y); if (d < bd) { bd = d; best = b; } }
      if (best) sim.setTarget(best.x, best.y);
    } else sim.setTarget(W / 2, H / 2);
    sim.update(16); t += 16;
  }
  return { sim, ev, t };
}

// 1. Level 0 with the bot (clock held by coach until 1st kill)
let wins = 0, best = null;
for (let s = 1; s <= 6; s++) { const r = play(0, s); if (r.sim.state === 'won') { wins++; best = best || r; } }
ok('level 0 bot wins most seeds', wins >= 4, `${wins}/6`);
if (best) {
  const r = best.sim.result;
  ok('win result has stars 1..3 + time bonus', r.stars >= 1 && r.stars <= 3 && r.timeBonus === Math.round(r.timeLeftMs / 100), `stars=${r.stars} bonus=${r.timeBonus} score=${r.score}`);
  ok('stars match starsFor', r.stars === starsFor(r.timeLeftMs, LEVELS[0].timeLimitMs));
  ok('kills == total bugs', best.sim.totalKilled === best.sim.totalBugs, `${best.sim.totalKilled}/${best.sim.totalBugs}`);
  ok('events fired (smash/kill/pickupSpawn path)', best.ev.smash > 8 && best.ev.kill === 8, JSON.stringify(best.ev));
  ok('talk lines present', r.talk.length > 0 && r.title === 'BUGS FIXED!');
}

// 2. Idle player loses at the deadline (and the coach holds the clock until 6 s)
const idle = play(0, 3, { bot: false });
ok('idle player loses', idle.sim.state === 'lost' && idle.sim.timeLeftMs === 0);
const lim = LEVELS[0].timeLimitMs;
ok('coach held the clock up to 6 s', idle.t >= lim + 5500 && idle.t <= lim + 6500, `ran ${idle.t} ms for a ${lim} ms deadline`);
ok('lose result has FAIL message', !!idle.sim.result.failMessage && idle.sim.result.unfixed === idle.sim.totalBugs - idle.sim.totalKilled);

// 3. Combo math + coach flag persisted
ok('combo mult tiers', comboMult(2) === 1 && comboMult(3) === 1.5 && comboMult(5) === 2 && comboMult(10) === 3);
const fl = flags(); play(0, 1, { fl });
ok('coach sets coachCampaign flag', fl.get('coachCampaign') === true);
const nc = new HuntSim({ levelIndex: 0, flags: fl });
ok('coach skipped once flag set', nc.coach === null && !nc.clockHeld);

// 4. Hold gating: no smash without hold; cooldown 200 ms on a 2-hp bug
{
  const s = new HuntSim({ levelIndex: 1, rng: mulberry(9), flags: fl });
  const b = s.bugs.find((x) => x.maxHp >= 2);
  b.x = s.hunter.x + 10; b.y = s.hunter.y; b.baseSpeed = 0;
  let hits = 0; s.on('smash', () => hits++);
  for (let i = 0; i < 20; i++) { b.x = s.hunter.x + 10; b.y = s.hunter.y; s.update(16); }
  ok('no smash while not holding', hits === 0);
  s.setHold(true);
  for (let i = 0; i < 40; i++) { if (b.alive) { b.x = s.hunter.x + 10; b.y = s.hunter.y; b.vx = b.vy = 0; } s.update(16); }
  ok('2hp bug dies after 2 hits >=200 ms apart', !b.alive && hits === 2, `hits=${hits}`);
}

// 5. Pickups: spawn cadence + opus one-shot + speed boost restore
{
  const s = new HuntSim({ levelIndex: 1, rng: mulberry(5), flags: fl });
  for (let i = 0; i < 400; i++) s.update(16);
  ok('skill pickups spawn on cadence', s.pickups.length >= 1, `n=${s.pickups.length} @${Math.round(s.now)}ms`);
  s.spawnPickup('sonnet', s.hunter.x, s.hunter.y); s.update(16);
  ok('sonnet speed boost applied', Math.abs(s.hunter.speedMul - 1.5) < 1e-9);
  for (let i = 0; i < 400; i++) s.update(16);
  ok('sonnet boost expires', Math.abs(s.hunter.speedMul - 1) < 1e-9);
  s.spawnPickup('opus', s.hunter.x, s.hunter.y); s.update(16);
  ok('opus active -> one-shot', s.isActive('opus'));
  const t = s.bugs.find((x) => x.alive && x.maxHp > 1); t.x = s.hunter.x; t.y = s.hunter.y; t.visible = true; t.diesAt = s.now + 1e5; t.lastSmashAt = 0; s.setHold(true); s.update(16);
  ok('opus kills multi-hp bug in 1 hit', !t.alive);
  const before = s.bugs.filter((b) => b.alive && !b.visible).length; // all-hands brings hiders back
  s.spawnPickup('copilot', s.hunter.x, s.hunter.y); s.update(16);
  ok('all-hands shows every hiding bug', s.bugs.filter((b) => b.alive && !b.visible).length === 0, `hidden before=${before}`);
  s.spawnPickup('cursor', s.hunter.x, s.hunter.y); s.update(16);
}

// 6. Hide/respawn + deadline-progress shrink + glitch gimmick (level 3 = 2-1)
{
  const s = new HuntSim({ levelIndex: 3, rng: mulberry(11), flags: fl });
  let glitch = 0, hid = 0, resp = 0; s.on('glitch', () => glitch++); s.on('bugHide', () => hid++); s.on('bugRespawn', () => resp++);
  s.setTarget(40, 60);
  for (let i = 0; i < 2000 && s.state === 'playing'; i++) s.update(16);
  ok('glitchRelocate fires (6 s, then every 12 s)', glitch >= 2, `glitch=${glitch}`);
  ok('bugs hide and respawn without dying', hid > 0 && resp > 0 && s.totalKilled === 0, `hide=${hid} respawn=${resp}`);
  const a = new HuntSim({ levelIndex: 1, rng: mulberry(1), flags: fl }), b2 = new HuntSim({ levelIndex: 1, rng: mulberry(1), flags: fl });
  a.deadlineProgress = 0; b2.deadlineProgress = 1; a._hide(a.bugs[0]); b2._hide(b2.bugs[0]);
  ok('hidden time shrinks 3500 -> 1100 with deadline', a.bugs[0].respawnAt === 3500 && b2.bugs[0].respawnAt === 1100);
}

// 7. All 12 levels construct and tick without throwing
for (let i = 0; i < LEVELS.length; i++) { const s = new HuntSim({ levelIndex: i, rng: mulberry(i + 1), flags: fl }); s.setHold(true); for (let k = 0; k < 600; k++) s.update(16); }
ok('all levels simulate', true);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

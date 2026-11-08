// missions.js — daily missions shown on the main menu and tracked in MP.
// Three per day, picked deterministically from the date so everyone gets the
// same set (good for "did you get today's boss mission?" chatter).
//
// metric: what SaveManager.trackDaily() feeds —
//   counters (sum over the day): bugs, kos, pickups, bosses, goldens, events
//   maxima   (best in one life): combo, level, score   (mark with max: true)

export const MISSION_POOL = [
  { id: 'bugs60',    metric: 'bugs',    goal: 60,  text: 'Smash 60 bugs online' },
  { id: 'bugs200',   metric: 'bugs',    goal: 200, text: 'Smash 200 bugs online' },
  { id: 'combo10',   metric: 'combo',   goal: 10,  text: 'Hit a ×10 combo', max: true },
  { id: 'kos3',      metric: 'kos',     goal: 3,   text: 'Break 3 laptops in PvP' },
  { id: 'boss1',     metric: 'bosses',  goal: 1,   text: 'Help defeat THE DEADLINE' },
  { id: 'golden1',   metric: 'goldens', goal: 1,   text: "Fix the CEO's golden bug" },
  { id: 'level3',    metric: 'level',   goal: 3,   text: 'Reach Lv3 in one life', max: true },
  { id: 'pickups10', metric: 'pickups', goal: 10,  text: 'Grab 10 health pickups' },
  { id: 'score600',  metric: 'score',   goal: 600, text: 'Score 600 in one life', max: true },
  { id: 'events3',   metric: 'events',  goal: 3,   text: 'Survive 3 PM world events' },
];

/** Local-date key, e.g. "2026-11-06". */
export function dayKey(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Small deterministic PRNG (mulberry32) seeded from the date string.
function seeded(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Today's three missions — distinct metrics so they don't overlap. */
export function missionsForDay(key = dayKey()) {
  const rnd = seeded(key);
  const pool = [...MISSION_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out = [];
  const metrics = new Set();
  for (const m of pool) {
    if (metrics.has(m.metric)) continue;
    out.push(m); metrics.add(m.metric);
    if (out.length === 3) break;
  }
  return out;
}

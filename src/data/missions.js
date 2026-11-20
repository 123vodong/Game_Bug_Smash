// missions.js — daily missions shown on the main menu and tracked in every mode.
// Three per day, picked deterministically from the date so everyone gets the
// same set (good for "did you get today's boss mission?" chatter):
//   2 × arena (Personal, distinct metrics) + 1 × team-or-campaign.
// Mission ids never change (saved progress is keyed by id).
//
// metric: what SaveManager.trackDaily() / Progress.add|max({ daily }) feeds —
//   arena    counters: bugs, kos, pickups, bosses, goldens, events
//            maxima (best in one life, max: true): combo, level, score
//   team     counters: teamGames, teamWins, teamTakedowns   (offline practice counts too)
//   campaign counters: campaignLevels (clears, replays count), campaignStars3 (3★ clears)

export const MISSION_POOL = [
  { id: 'bugs60',    mode: 'arena', metric: 'bugs',    goal: 60,  text: 'Smash 60 bugs online' },
  { id: 'bugs200',   mode: 'arena', metric: 'bugs',    goal: 200, text: 'Smash 200 bugs online' },
  { id: 'combo10',   mode: 'arena', metric: 'combo',   goal: 10,  text: 'Hit a ×10 combo', max: true },
  { id: 'kos3',      mode: 'arena', metric: 'kos',     goal: 3,   text: 'Break 3 laptops in PvP' },
  { id: 'boss1',     mode: 'arena', metric: 'bosses',  goal: 1,   text: 'Help defeat THE DEADLINE' },
  { id: 'golden1',   mode: 'arena', metric: 'goldens', goal: 1,   text: "Fix the CEO's golden bug" },
  { id: 'level3',    mode: 'arena', metric: 'level',   goal: 3,   text: 'Reach Lv3 in one life', max: true },
  { id: 'pickups10', mode: 'arena', metric: 'pickups', goal: 10,  text: 'Grab 10 health pickups' },
  { id: 'score600',  mode: 'arena', metric: 'score',   goal: 600, text: 'Score 600 in one life', max: true },
  { id: 'events3',   mode: 'arena', metric: 'events',  goal: 3,   text: 'Survive 3 PM world events' },
  // Experience Pass 1: one slot per day from Team Mode or the campaign.
  { id: 'siege1',    mode: 'team',     metric: 'teamGames',      goal: 1, text: 'Play an Office Siege match' },
  { id: 'siegewin1', mode: 'team',     metric: 'teamWins',       goal: 1, text: 'Win an Office Siege match' },
  { id: 'takedown8', mode: 'team',     metric: 'teamTakedowns',  goal: 8, text: 'Get 8 takedowns in Office Siege' },
  { id: 'camp2',     mode: 'campaign', metric: 'campaignLevels', goal: 2, text: 'Clear 2 campaign levels' },
  { id: 'stars3',    mode: 'campaign', metric: 'campaignStars3', goal: 1, text: 'Get 3★ on a campaign level' },
];

/** Icon + short label per mode (menu panel, profile, trackers). */
export const MISSION_MODES = {
  arena:    { icon: '🌐', label: 'Personal' },
  team:     { icon: '⚔️', label: 'Team 5v5' },
  campaign: { icon: '🎯', label: 'Campaign' },
};

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

function shuffled(list, rnd) {
  const pool = [...list];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

const cache = new Map();

/** Today's three missions: 2 arena (distinct metrics) + 1 team-or-campaign. */
export function missionsForDay(key = dayKey()) {
  if (cache.has(key)) return cache.get(key);
  const rnd = seeded(key);
  const out = [];
  const metrics = new Set();
  for (const m of shuffled(MISSION_POOL.filter((x) => x.mode === 'arena'), rnd)) {
    if (metrics.has(m.metric)) continue;
    out.push(m); metrics.add(m.metric);
    if (out.length === 2) break;
  }
  const other = shuffled(MISSION_POOL.filter((x) => x.mode !== 'arena'), rnd);
  if (other.length) out.push(other[0]);
  if (cache.size > 8) cache.clear();
  cache.set(key, out);
  return out;
}

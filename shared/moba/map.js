// shared/moba/map.js — "The Open Office", the Team Mode battlefield.
// Shared by server (simulation) and client (rendering + minimap).
//
// Square 6000×6000 floor. 🚀 Startup (blue) owns the bottom-left corner,
// 🏢 MegaCorp (red) the top-right. Three corridors ("lanes") connect them:
//   top — up the left wall, then along the top wall
//   mid — the diagonal
//   bot — along the bottom wall, then up the right wall
// A "data stream" river runs top-left → bottom-right, crossing mid at the
// center. Between lanes and river: four "legacy code" jungle quadrants.
//
// Fairness by construction: red's half is blue's mirrored across the
// top-left/bottom-right diagonal — every red point is mirror(blue point).

export const MAP_W = 6000;
export const MAP_H = 6000;
export const mirror = (p) => ({ x: p.y, y: p.x });
export const rot180 = (p) => ({ x: MAP_W - p.x, y: MAP_H - p.y });

// ── Bases ──
export const FOUNTAIN = { blue: { x: 380, y: 5620 }, red: mirror({ x: 380, y: 5620 }) };
export const BASE_RADIUS = 1150; // visual base area around the core

// ── Lanes: waypoints in BLUE → RED order. Red minions walk them reversed. ──
export const LANES = {
  top: [{ x: 850, y: 4650 }, { x: 650, y: 4000 }, { x: 650, y: 1000 }, { x: 1000, y: 650 }, { x: 4000, y: 650 }, { x: 4650, y: 850 }],
  mid: [{ x: 1200, y: 4800 }, { x: 3000, y: 3000 }, { x: 4800, y: 1200 }],
  bot: [{ x: 1350, y: 5150 }, { x: 2000, y: 5350 }, { x: 5000, y: 5350 }, { x: 5350, y: 5000 }, { x: 5350, y: 2000 }, { x: 5150, y: 1350 }],
};
export const LANE_WIDTH = 320; // visual corridor width
/** Waypoints for a team walking its lane toward the enemy base. */
export function laneFor(team, lane) {
  const pts = LANES[lane];
  return team === 'blue' ? pts : [...pts].reverse();
}

// ── Structures (blue side; red = mirrored). tier 1 outer, 2 inner, 3 high-ground core firewall ──
const BLUE_STRUCTURES = [
  { id: 'top_1', kind: 'tower', lane: 'top',  tier: 1, x: 650,  y: 2000 },
  { id: 'top_2', kind: 'tower', lane: 'top',  tier: 2, x: 650,  y: 3500 },
  { id: 'top_3', kind: 'tower', lane: 'top',  tier: 3, x: 850,  y: 4650 },
  { id: 'mid_1', kind: 'tower', lane: 'mid',  tier: 1, x: 2250, y: 3750 },
  { id: 'mid_2', kind: 'tower', lane: 'mid',  tier: 2, x: 1650, y: 4350 },
  { id: 'mid_3', kind: 'tower', lane: 'mid',  tier: 3, x: 1200, y: 4800 },
  { id: 'bot_1', kind: 'tower', lane: 'bot',  tier: 1, x: 4000, y: 5350 },
  { id: 'bot_2', kind: 'tower', lane: 'bot',  tier: 2, x: 2500, y: 5350 },
  { id: 'bot_3', kind: 'tower', lane: 'bot',  tier: 3, x: 1350, y: 5150 },
  { id: 'core',  kind: 'core',  lane: 'base', tier: 4, x: 850,  y: 5150 },
];
/** All structures with team + globally unique id (e.g. 'blue_top_1', 'red_core'). */
export const STRUCTURES = [
  ...BLUE_STRUCTURES.map((s) => ({ ...s, team: 'blue', id: `blue_${s.id}` })),
  ...BLUE_STRUCTURES.map((s) => ({ ...s, ...mirror(s), team: 'red', id: `red_${s.id}` })),
];
export const STRUCTURE_RADIUS = { tower: 70, core: 115 };
/**
 * Invulnerability chain: a structure can only be damaged once its
 * prerequisite is destroyed. Returns the prerequisite id(s) — ANY one of them
 * destroyed unlocks it — or [] if it's open from the start.
 *   lane tier 2 ← same-lane tier 1 · lane tier 3 ← same-lane tier 2 · core ← any tier 3
 */
export function unlockedBy(struct) {
  const t = struct.team;
  if (struct.kind === 'core') return [`${t}_top_3`, `${t}_mid_3`, `${t}_bot_3`];
  if (struct.tier === 3) return [`${t}_${struct.lane}_2`];
  if (struct.tier === 2) return [`${t}_${struct.lane}_1`];
  return [];
}

// ── Shared geometry helpers for authoring (blue side) ──
// (s, m) coordinates: s = y − x (signed distance from the river axis × √2, > 0 on
// blue's side), m = x + y (the mid lane is m = 6000). Lines of constant s run
// parallel to the river, lines of constant m parallel to the mid lane.
const sm = (s, m) => ({ x: (m - s) / 2, y: (m + s) / 2 });
const reflectMid = (p) => ({ x: MAP_W - p.y, y: MAP_H - p.x }); // across the mid lane (x + y = 6000)

// ── Jungle camps (nested inside LoL C-shaped alcoves; Red rotated 180 deg) ──
const BLUE_CAMPS = [
  { id: 'tj_small',  type: 'small',  x: 1280, y: 2060 },
  { id: 'tj_medium', type: 'medium', x: 1500, y: 3410 },
  { id: 'tj_big',    type: 'big',    x: 1475, y: 2775 },
  { id: 'bj_small',  type: 'small',  x: 3430, y: 5075 },
  { id: 'bj_medium', type: 'medium', x: 2880, y: 3930 },
  { id: 'bj_big',    type: 'big',    x: 3165, y: 4465 },
];
export const CAMPS = [
  ...BLUE_CAMPS.map((c) => ({ ...c, side: 'blue', id: `blue_${c.id}` })),
  ...BLUE_CAMPS.map((c) => ({ ...c, ...rot180(c), side: 'red', id: `red_${c.id}` })),
];
export const EPIC_SPOTS = {
  deadline: { x: 1925, y: 1730 }, // Baron pit cove (inside upper C-alcove)
  golden:   { x: 4075, y: 4270 }, // Dragon pit cove (inside lower C-alcove)
};

// ── Walls (v7: high-fidelity LoL Summoner's Rift rock landmasses + 3-gate curved base ramparts) ──
const smoothPoly = (pts, passes = 1) => {
  let out = pts.map(([x, y]) => [x, y]);
  for (let p = 0; p < passes; p++) {
    const next = [];
    for (let i = 0; i < out.length; i++) {
      const [ax, ay] = out[i];
      const [bx, by] = out[(i + 1) % out.length];
      next.push([Math.round(ax * 0.75 + bx * 0.25), Math.round(ay * 0.75 + by * 0.25)]);
      next.push([Math.round(ax * 0.25 + bx * 0.75), Math.round(ay * 0.25 + by * 0.75)]);
    }
    out = next;
  }
  return out;
};
const poly = (look, pts, passes = 1, extra = {}) => ({ look, kind: 'poly', pts: smoothPoly(pts, passes), ...extra });

const BLUE_JUNGLE_POLYS = [
  poly('glass',     [[837, 1402], [1113, 1587], [1298, 1921], [1229, 1910], [1113, 1725], [929, 1725], [837, 1829]]),
  poly('cubicles',  [[1021, 1956], [1113, 2071], [1183, 2383], [1321, 2544], [1217, 2613], [1090, 2625], [975, 2533]]),
  poly('glass',     [[1413, 2117], [1621, 2290], [1921, 2440], [1875, 2475], [1667, 2463], [1483, 2371], [1379, 2221]]),
  poly('shelf',     [[1494, 2567], [1737, 2625], [1794, 2925], [1552, 3029], [1229, 2983], [1333, 2867], [1460, 2937], [1552, 2925], [1621, 2867], [1633, 2729], [1494, 2625]]),
  poly('glass',     [[2152, 2625], [2521, 2913], [2521, 3144], [2440, 3213], [2429, 3248], [2475, 3260], [2452, 3271], [2383, 3271], [2175, 3040]]),
  poly('cubicles',  [[929, 2729], [1021, 2740], [1056, 2810], [1067, 2890], [998, 2960], [837, 2833], [837, 2740]]),
  poly('partition', [[1979, 3017], [2048, 3075], [2129, 3260], [2117, 3513], [2060, 3594], [1979, 3560], [2025, 3329]]),
  poly('cubicles',  [[837, 3052], [917, 3121], [894, 3444], [1010, 3675], [929, 3767], [837, 3767], [871, 3502], [837, 3398]]),
  poly('shelf',     [[1529, 3121], [1690, 3144], [1806, 3271], [1806, 3433], [1679, 3571], [1587, 3571], [1679, 3421], [1644, 3306], [1529, 3225], [1379, 3260]]),
  poly('shelf',     [[1113, 3167], [1148, 3167], [1217, 3433], [1367, 3606], [1552, 3698], [1840, 3675], [1898, 3721], [1887, 3779], [1621, 4033], [1494, 3940], [1183, 3813], [1206, 3663], [1079, 3444]]),
  poly('glass',     [[3029, 3329], [3225, 3548], [3467, 3698], [3248, 3640], [3110, 3548], [2971, 3398]]),
  poly('glass',     [[2833, 3525], [3179, 3790], [3179, 3917], [3075, 3917], [2971, 3744], [2844, 3721], [2694, 3825], [2683, 3987], [2763, 4090], [2683, 4090], [2637, 3998], [2463, 3871]]),
  poly('glass',     [[3652, 3871], [3917, 4125], [3860, 4206], [3860, 4356], [3940, 4460], [4021, 4506], [4137, 4506], [4229, 4437], [4367, 4575], [4240, 4748], [3987, 4679], [3825, 4540], [3687, 4090], [3571, 3963]]),
  poly('partition', [[2394, 4067], [2463, 4125], [2337, 4275], [2267, 4517], [2152, 4587], [1979, 4321], [2094, 4287], [2094, 4194], [2175, 4137], [2337, 4113]]),
  poly('shelf',     [[3213, 4137], [3513, 4171], [3513, 4471], [3306, 4656], [3271, 4656], [3340, 4587], [3363, 4460], [3260, 4321], [3075, 4321], [2994, 4402], [2971, 4494], [2913, 4390], [2913, 4263], [2948, 4229]]),
  poly('shelf',     [[2660, 4229], [2694, 4483], [2890, 4713], [2890, 4783], [2810, 4829], [2660, 4783], [2544, 4633], [2544, 4390]]),
  poly('cubicles',  [[2383, 4679], [2475, 4863], [2579, 4956], [2417, 5152], [2302, 5163], [2279, 4898], [2221, 4760]]),
  poly('cubicles',  [[3698, 4725], [3906, 4863], [4206, 4944], [4206, 5002], [4033, 4944], [3837, 4944], [3594, 5025], [3525, 4921], [3410, 4898], [3283, 4979], [3260, 5106], [3121, 5037], [3098, 4910], [3144, 4806], [3479, 4817]]),
  poly('glass',     [[4506, 4748], [4817, 5025], [4771, 5163], [4587, 5163], [4390, 4887], [4379, 4852]]),
  poly('cubicles',  [[2787, 5037], [2890, 5071], [2994, 5163], [2625, 5163]]),
  // Curved 3-gate base rampart arcs along the Blue base perimeter
  poly('partition', [[177, 4144], [224, 4130], [272, 4118], [320, 4108], [369, 4100], [418, 4094], [432, 4223], [388, 4229], [344, 4236], [301, 4245], [258, 4256], [215, 4268]], 0, { baseWall: true }),
  poly('partition', [[997, 4155], [1059, 4177], [1119, 4202], [1179, 4231], [1236, 4262], [1293, 4296], [1223, 4405], [1172, 4375], [1120, 4346], [1066, 4321], [1011, 4298], [956, 4278]], 0, { baseWall: true }),
  poly('partition', [[1704, 4707], [1738, 4764], [1769, 4821], [1798, 4881], [1823, 4941], [1845, 5003], [1722, 5044], [1702, 4989], [1679, 4934], [1654, 4880], [1625, 4828], [1595, 4777]], 0, { baseWall: true }),
  poly('partition', [[1906, 5582], [1900, 5631], [1892, 5680], [1882, 5728], [1870, 5776], [1856, 5823], [1732, 5785], [1744, 5742], [1755, 5699], [1764, 5656], [1771, 5612], [1777, 5568]], 0, { baseWall: true }),
  // NW Top-lane Alcove stone ruin pillar (rot180 produces symmetric SE alcove pillar)
  poly('partition', [[250, 260], [340, 220], [415, 290], [385, 385], [295, 410], [230, 340]], 1),
];
function reflectWall(w) {
  if (w.kind === 'poly') return { ...w, pts: w.pts.map(([x, y]) => [MAP_W - y, MAP_H - x]) };
  if (w.kind === 'circle') return { ...w, ...reflectMid(w) };
  if (w.kind === 'seg') {
    const a = reflectMid({ x: w.x1, y: w.y1 }), b = reflectMid({ x: w.x2, y: w.y2 });
    return { ...w, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }
  return { ...w, x: MAP_W - (w.y + w.h), y: MAP_H - (w.x + w.w), w: w.h, h: w.w };
}
function mirrorWall(w) {
  if (w.kind === 'poly') return { ...w, pts: w.pts.map(([x, y]) => [y, x]) };
  if (w.kind === 'circle') return { ...w, ...mirror(w) };
  if (w.kind === 'seg') return { ...w, x1: w.y1, y1: w.x1, x2: w.y2, y2: w.x2 };
  return { ...w, x: w.y, y: w.x, w: w.h, h: w.w };
}
function rot180Wall(w) {
  if (w.kind === 'poly') return { ...w, pts: w.pts.map(([x, y]) => [MAP_W - x, MAP_H - y]) };
  if (w.kind === 'circle') return { ...w, ...rot180(w) };
  if (w.kind === 'seg') {
    const a = rot180({ x: w.x1, y: w.y1 }), b = rot180({ x: w.x2, y: w.y2 });
    return { ...w, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }
  return { ...w, x: MAP_W - (w.x + w.w), y: MAP_H - (w.y + w.h) };
}
const BLUE_WALLS = BLUE_JUNGLE_POLYS;
/** All walls, each with a unique id ('w0'…). */
export const WALLS = [...BLUE_WALLS, ...BLUE_WALLS.map(rot180Wall)].map((w, i) => ({ ...w, id: `w${i}` }));

// ── Bushes ("break-room plants") — v6 wall-hugging LoL bushes + river tufts (rot180 symmetric) ──
const BLUE_BUSHES = [
  { kind: 'seg', x1: 683, y1: 316, x2: 683, y2: 506, w: 74 },
  { kind: 'seg', x1: 379, y1: 710, x2: 514, y2: 576, w: 74 },
  { kind: 'seg', x1: 254, y1: 822, x2: 254, y2: 1012, w: 74 },
  { kind: 'seg', x1: 939, y1: 2330, x2: 953, y2: 2154, w: 76 },
  { kind: 'seg', x1: 1930, y1: 2530, x2: 1754, y2: 2520, w: 76 },
  { kind: 'circle', x: 2524, y: 2620, r: 66 },
  { kind: 'seg', x1: 1171, y1: 2970, x2: 1288, y2: 2839, w: 76 },
  { kind: 'seg', x1: 1753, y1: 3136, x2: 1872, y2: 3266, w: 76 },
  { kind: 'circle', x: 3577, y: 3517, r: 66 },
  { kind: 'seg', x1: 2706, y1: 4177, x2: 2729, y2: 4352, w: 76 },
  { kind: 'seg', x1: 3565, y1: 4229, x2: 3565, y2: 4405, w: 76 },
  { kind: 'seg', x1: 3334, y1: 4760, x2: 3509, y2: 4766, w: 76 },
  { kind: 'seg', x1: 2252, y1: 4967, x2: 2183, y2: 4805, w: 76 },
  { kind: 'seg', x1: 2686, y1: 5050, x2: 2825, y2: 4942, w: 76 },
  { kind: 'seg', x1: 4457, y1: 5070, x2: 4355, y2: 4927, w: 76 },
  { kind: 'seg', x1: 3797, y1: 5495, x2: 3987, y2: 5495, w: 74 },
  { kind: 'seg', x1: 5614, y1: 5808, x2: 5485, y2: 5688, w: 76 },
];
/** All bushes, each with a unique id ('b0'…). */
export const BUSHES = [...BLUE_BUSHES, ...BLUE_BUSHES.map(rot180Wall)].map((b, i) => ({ ...b, id: `b${i}` }));
/** Id of the bush containing (x, y) ('' if none). Pure + cheap (bounding-box pre-check). */
export function bushAt(x, y) {
  for (const b of BUSHES) {
    if (b.kind === 'circle') { if (Math.hypot(x - b.x, y - b.y) <= b.r) return b.id; continue; }
    const h = b.w / 2;
    if (x < Math.min(b.x1, b.x2) - h || x > Math.max(b.x1, b.x2) + h || y < Math.min(b.y1, b.y2) - h || y > Math.max(b.y1, b.y2) + h) continue;
    if (distToSeg(x, y, b.x1, b.y1, b.x2, b.y2) <= h) return b.id;
  }
  return '';
}

// ── River ("data stream") — continuous S-curved basin along NW -> SE diagonal ──
export const RIVER = { from: { x: 700, y: 700 }, to: { x: 5300, y: 5300 }, width: 420 };
export const RIVER_PATH = [
  { x: 960, y: 980 },
  { x: 1320, y: 1220 },
  { x: 1700, y: 1560 },
  { x: 2050, y: 1940 },
  { x: 2520, y: 2460 },
  { x: 3000, y: 3000 },
  { x: 3480, y: 3540 },
  { x: 3950, y: 4060 },
  { x: 4300, y: 4440 },
  { x: 4680, y: 4780 },
  { x: 5040, y: 5020 },
];

// ── Unit sizes (collision / hit radius) ──
export const CHAMP_RADIUS = 30;
export const MINION_RADIUS = 22;

// ── Helpers ──
export function inMap(x, y) { return x >= 0 && y >= 0 && x <= MAP_W && y <= MAP_H; }
export function clampToMap(x, y, pad = 30) {
  return { x: Math.max(pad, Math.min(MAP_W - pad, x)), y: Math.max(pad, Math.min(MAP_H - pad, y)) };
}
/** Which lane is a point nearest to? (used by bots + minimap labels) */
export function nearestLane(x, y) {
  let best = 'mid', bestD = Infinity;
  for (const [lane, pts] of Object.entries(LANES)) {
    for (let i = 0; i < pts.length - 1; i++) {
      const d = distToSeg(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      if (d < bestD) { bestD = d; best = lane; }
    }
  }
  return best;
}
export function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

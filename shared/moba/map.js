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

// ── Jungle camps (blue top jungle authored; bot jungle = reflection across mid; red = mirror) ──
const TOP_CAMPS = [
  { id: 'tj_small',  type: 'small',  x: 1350, y: 2500 },
  { id: 'tj_medium', type: 'medium', x: 1500, y: 3450 },
  { id: 'tj_big',    type: 'big',    x: 2150, y: 3000 },
];
const BLUE_CAMPS = [
  ...TOP_CAMPS,
  ...TOP_CAMPS.map((c) => ({ ...c, ...reflectMid(c), id: c.id.replace('tj_', 'bj_') })),
];
export const CAMPS = [
  ...BLUE_CAMPS.map((c) => ({ ...c, side: 'blue', id: `blue_${c.id}` })),
  ...BLUE_CAMPS.map((c) => ({ ...c, ...mirror(c), side: 'red', id: `red_${c.id}` })),
];
export const EPIC_SPOTS = {
  deadline: { x: 2050, y: 2050 }, // top-side river
  golden:   { x: 3950, y: 3950 }, // bot-side river
};

// ── Walls (v3: office partitions that BORDER the walkable areas) ──
// Long thin walls line the jungle side of every lane, both river banks and the
// mid lane, with gaps = jungle entrances; a few interior walls make camp pockets.
// Champions, minions and monsters can't walk through them (shared/moba/nav.js:
// collision + pathfinding); skillshots and auto-attacks fly OVER them. Dashes and
// knockbacks stop at a wall (knocked INTO a wall = `wallStun`); blinks / Flash
// land on the nearest free spot — so Flash crosses a wall.
//   seg    { kind:'seg', x1, y1, x2, y2, w }   thick line (capsule), w = thickness
//   rect   { kind:'rect', x, y, w, h }         axis-aligned box (x,y = top-left)
//   circle { kind:'circle', x, y, r }          pillar / plant
//   look   partition | cubicles | glass | shelf (seg) · plant | cooler | pillar (circle)  — render only
// Authored for blue's top jungle; reflected across the mid lane for blue's bot
// jungle, then mirrored for red — fair by construction. Verify with
// `node tools/playtest/nav_check.mjs --map` after editing.
const W_EDGE = 60;                     // partition thickness
const seg = (look, p1, p2, w = W_EDGE) => ({ look, kind: 'seg', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, w });
const RIVER_S = 400;                   // river-bank walls (s = y − x)
const MID_M = 5618;                    // mid-lane jungle-side wall (≈270 px from the lane center)
const TOP_X = 920;                     // top-lane jungle-side wall (≈270 px from the lane center)
const TOP_JUNGLE_WALLS = [
  // top-lane edge (x = 920) — open river corner above y=1620 + entrances at y 2300–2600 and 3300–3600
  seg('cubicles',  { x: TOP_X, y: 1620 }, { x: TOP_X, y: 2300 }),
  seg('cubicles',  { x: TOP_X, y: 2600 }, { x: TOP_X, y: 3300 }),
  seg('cubicles',  { x: TOP_X, y: 3600 }, { x: TOP_X, y: 3950 }),
  // river bank (s = 400) — open top/bot river corner (m < 2560) + entrances at m 3000–3300 and epic pit 3900–4300
  seg('glass',     sm(RIVER_S, 2560), sm(RIVER_S, 3000)),
  seg('glass',     sm(RIVER_S, 3300), sm(RIVER_S, 3900)),
  seg('glass',     sm(RIVER_S, 4300), sm(RIVER_S, 5250)),
  // mid-lane edge (m = 5618) — entrances at s 1500–1800 and 2800–3100; open at the river corner
  seg('partition', sm(750, MID_M), sm(1500, MID_M)),
  seg('partition', sm(1800, MID_M), sm(2800, MID_M)),
  // interior: a shelf between the small and medium camps, a partition shielding the big camp
  seg('shelf',     { x: 1150, y: 3000 }, { x: 1600, y: 3000 }),
  seg('partition', { x: 1850, y: 2560 }, { x: 1850, y: 2950 }),
  { look: 'plant',  kind: 'circle', x: 1250, y: 4000, r: 70 },
];
function reflectWall(w) {
  if (w.kind === 'circle') return { ...w, ...reflectMid(w) };
  if (w.kind === 'seg') {
    const a = reflectMid({ x: w.x1, y: w.y1 }), b = reflectMid({ x: w.x2, y: w.y2 });
    return { ...w, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }
  // rect [x, x+w] × [y, y+h] → [W−(y+h), W−y] × [H−(x+w), H−x]
  return { ...w, x: MAP_W - (w.y + w.h), y: MAP_H - (w.x + w.w), w: w.h, h: w.w };
}
function mirrorWall(w) {
  if (w.kind === 'circle') return { ...w, ...mirror(w) };
  if (w.kind === 'seg') return { ...w, x1: w.y1, y1: w.x1, x2: w.y2, y2: w.x2 };
  return { ...w, x: w.y, y: w.x, w: w.h, h: w.w };
}
const BLUE_WALLS = [...TOP_JUNGLE_WALLS, ...TOP_JUNGLE_WALLS.map(reflectWall)];
/** All walls, each with a unique id ('w0'…). */
export const WALLS = [...BLUE_WALLS, ...BLUE_WALLS.map(mirrorWall)].map((w, i) => ({ ...w, id: `w${i}` }));

// ── Bushes ("break-room plants") — v4 hiding spots ──
// A unit standing in a bush is HIDDEN from the enemy team unless an enemy champion
// stands in the SAME bush, or the unit attacked / cast within rules.BUSH_REVEAL_MS.
// Bushes never block movement or projectiles. Shape: thick line (capsule) like a seg
// wall { x1, y1, x2, y2, w } or a circle { x, y, r }. Authored for blue's top jungle,
// reflected across mid, then mirrored for red (same as WALLS) — ids 'b0'….
const bseg = (p1, p2, w = 150) => ({ kind: 'seg', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, w });
const TOP_JUNGLE_BUSHES = [
  bseg({ x: 800, y: 2650 }, { x: 800, y: 2950 }, 140),   // top lane, by the jungle entrance
  bseg(sm(650, 3950), sm(650, 4250)),                    // deadline-pit entrance (jungle side)
  bseg(sm(1500, 5400), sm(1800, 5400)),                  // mid-side jungle entrance
  bseg(sm(2200, 5480), sm(2500, 5480), 130),             // along the mid lane
  bseg(sm(200, 4700), sm(200, 5000), 140),               // river (blue half; its mirror makes a pair)
  { kind: 'circle', x: 1250, y: 3350, r: 110 },          // between the small + medium camps
];
const BLUE_BUSHES = [...TOP_JUNGLE_BUSHES, ...TOP_JUNGLE_BUSHES.map(reflectWall)];
/** All bushes, each with a unique id ('b0'…). */
export const BUSHES = [...BLUE_BUSHES, ...BLUE_BUSHES.map(mirrorWall)].map((b, i) => ({ ...b, id: `b${i}` }));
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

// ── River ("data stream") — a band along the top-left → bottom-right diagonal ──
export const RIVER = { from: { x: 700, y: 700 }, to: { x: 5300, y: 5300 }, width: 420 };

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

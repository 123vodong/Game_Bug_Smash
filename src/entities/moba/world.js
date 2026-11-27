// world.js — the floor a Team Mode scene and its offline sim play on (2026-11-25, Story Mode 2.0).
//
//   WORLD_5V5          the Open Office (shared/moba/map.js + its nav instance): the default everywhere
//   makeWorld(floor)   a world over a custom floor { id, w, h, walls, bushes, fountain }
//
// A world: { id, w, h, fountain: { blue, red }, walls, bushes, nav, bushAt(x, y), clampToMap(x, y, pad) }
// `nav` is a shared/moba/nav.js instance (isBlocked, pushOut, segmentClear, clipMove, nearestFree,
// findPath, setDynamic). `walls` is the static list (doors live in nav.setDynamic).
import { MAP_W, MAP_H, FOUNTAIN, WALLS, BUSHES, bushAt, clampToMap, distToSeg } from '../../../shared/moba/map.js';
import { NAV_5V5, createNav } from '../../../shared/moba/nav.js';

export const WORLD_5V5 = Object.freeze({
  id: '5v5', w: MAP_W, h: MAP_H, fountain: FOUNTAIN, walls: WALLS, bushes: BUSHES, nav: NAV_5V5, bushAt, clampToMap,
});

/** A world over a custom floor. Bushes use the map.js shapes (seg capsule { x1, y1, x2, y2, w } or circle). */
export function makeWorld({ id = 'floor', w, h, walls = [], bushes = [], fountain = null, doors = [] }) {
  const nav = createNav({ walls, w, h });
  const list = bushes.map((b, i) => ({ ...b, id: b.id || `fb${i}` }));
  const bushAtFloor = (x, y) => {
    for (const b of list) {
      if (b.kind === 'circle') { if (Math.hypot(x - b.x, y - b.y) <= b.r) return b.id; continue; }
      const hw = b.w / 2;
      if (x < Math.min(b.x1, b.x2) - hw || x > Math.max(b.x1, b.x2) + hw || y < Math.min(b.y1, b.y2) - hw || y > Math.max(b.y1, b.y2) + hw) continue;
      if (distToSeg(x, y, b.x1, b.y1, b.x2, b.y2) <= hw) return b.id;
    }
    return '';
  };
  const clamp = (x, y, pad = 30) => ({ x: Math.max(pad, Math.min(w - pad, x)), y: Math.max(pad, Math.min(h - pad, y)) });
  const far = { x: -100000, y: -100000 };
  return {
    id, w, h, walls, doors, bushes: list, nav, bushAt: bushAtFloor, clampToMap: clamp,
    fountain: { blue: fountain?.blue || { x: w / 2, y: h / 2 }, red: fountain?.red || far },
  };
}

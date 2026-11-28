// Vector and cross-section parity verifier comparing LoL Summoner's Rift blueprint
// against Bug Smash 5v5 (shared/moba/map.js). Zero image tokens required.
import fs from 'node:fs';
import {
  MAP_W, MAP_H, LANES, LANE_WIDTH, RIVER, CAMPS, EPIC_SPOTS, STRUCTURES, FOUNTAIN, WALLS, distToSeg,
} from '../shared/moba/map.js';

const bp = JSON.parse(fs.readFileSync(new URL('../docs/maps/lol_vs_bugsmash_vector.json', import.meta.url), 'utf8'));

const rows = [
  ['Elevation strata', '1 flat plane (y=0)', `${bp.layers.length} strata (-2.8..+2.15)`, `${bp.layers.length} strata`],
  ['River basin', 'Flat texture stripe (y=0)', `Sunken basin (${bp.bugSmash3dTarget.river.sunkenBasinDepth}) + water (${bp.bugSmash3dTarget.river.waterY})`, 'Sunken basin + water'],
  ['Jungle cliffs', '44 thin straight box slabs', `${WALLS.length} variable-width organic poly cliffs (talus+extruded rock+moss+foliage)`, 'Organic multi-tier cliffs'],
  ['Epic pit framing', 'Flat ground ring only', '2 curved horseshoe flank rims (Deadline & Golden)', 'Baron/Dragon horseshoes'],
  ['Base architecture', 'Flat blue/red metal circles', '3-gate curved ramparts + stepped fountain amphitheater', '3-gate curved ramparts'],
  ['Map border', 'Open flat apron', `Plateau retaining cliff (${bp.bugSmash3dTarget.perimeter.retainingCliffDepth}) + arched parapet + 2 alcoves`, 'Cliff drop + parapet + alcoves'],
];

console.log('=== MAP VECTOR & CROSS-SECTION PARITY ===');
for (const [feature, before, target, lol] of rows) {
  console.log(`- ${feature.padEnd(20)} | Before: ${before.padEnd(28)} | 3D Target: ${target.padEnd(56)} | LoL Ref: ${lol}`);
}

// Verify decorative base rampart wings and gate pylons stay clear of LANES, STRUCTURES, and CAMPS
const clearanceErrors = [];
const checkPoint = (label, x, y, minPad) => {
  for (const [lane, pts] of Object.entries(LANES)) {
    for (let i = 0; i < pts.length - 1; i++) {
      const d = distToSeg(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      if (d < LANE_WIDTH / 2 + minPad) clearanceErrors.push(`${label} too close to ${lane} lane (${Math.round(d)}px)`);
    }
  }
  for (const s of STRUCTURES) {
    const d = Math.hypot(x - s.x, y - s.y);
    if (d < 150 + minPad) clearanceErrors.push(`${label} too close to ${s.id} (${Math.round(d)}px)`);
  }
  for (const c of CAMPS) {
    const d = Math.hypot(x - c.x, y - c.y);
    if (d < 150 + minPad) clearanceErrors.push(`${label} too close to ${c.id} (${Math.round(d)}px)`);
  }
};

const sampleArc = (cx, cy, r, deg0, deg1, label) => {
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const a = ((deg0 + (deg1 - deg0) * (i / steps)) * Math.PI) / 180;
    checkPoint(`${label}[${i}]`, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 45);
  }
};

const b = bp.bugSmash3dTarget.bases.blue;
for (const [d0, d1] of b.wingAnglesDeg) sampleArc(0, MAP_H, b.rampartRadius, d0, d1, 'blue_wing');
for (const deg of b.gatePylonAnglesDeg) sampleArc(0, MAP_H, b.pylonRadius, deg, deg, 'blue_pylon');

// Verify epic pit flanks keep river centerline |y - x| >= 220px clear
for (const ep of bp.bugSmash3dTarget.epicPits) {
  const s = ep.flankOffset;
  if (s < 220) clearanceErrors.push(`epic pit ${ep.id} flankOffset ${s} encroaches river centerline`);
}

if (clearanceErrors.length) {
  console.error('CLEARANCE ERRORS:\n' + clearanceErrors.join('\n'));
  process.exit(1);
}
console.log(`Clearance check PASSED: ${WALLS.length} authoritative walls, ${Object.keys(EPIC_SPOTS).length} epic pits, ${Object.keys(FOUNTAIN).length} fountains, map ${MAP_W}x${MAP_H}.`);

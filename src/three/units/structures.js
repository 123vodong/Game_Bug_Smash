// units/structures.js - towers = blinking server racks + team beacon; cores = Production Server cabinet with a glowing screen;
// destroyed = smoking rubble. Drawn through instanced batches (geometry in bugs.js, LED blink/glow in geo.js patchFx).
import * as THREE from 'three';
import { S, TEAM_COL } from '../world/ground.js';

const _c = new THREE.Color();

function smoke(b, x, z, t, k, seed) {
  for (let i = 0; i < 3; i++) {
    const ph = (t * 0.35 + i / 3 + seed * 0.013) % 1, sc = (0.35 + ph * 0.9) * (1 - ph * 0.55) * k;
    _c.setRGB(0.33, 0.34, 0.38).multiplyScalar(1 - ph * 0.45);
    b.smoke.add(x + ph * 0.3 * k + Math.sin(t + i) * 0.05, (0.35 + ph * 1.7) * k, z + Math.cos(t * 0.7 + i) * 0.05, ph * 3, sc, sc, sc, _c);
  }
}

/** st: state with .structures; b: batches from makeBatches; hp: HpBars; flashes: Map id->secs left; myTeam: for bar colour */
export function syncStructures(st, b, hp, flashes, dt, t, myTeam, cols) {
  if (!st.structures || !st.structures.forEach) return;
  st.structures.forEach((s, key) => {
    const id = s.id || key;
    const col = TEAM_COL[s.team] || TEAM_COL.neutral, dead = s.alive === false || s.hp <= 0;
    const isCore = s.kind === 'core', x = s.x * S, z = s.y * S;
    const pulse = 0.75 + 0.25 * Math.sin(t * 2.2 + s.x);
    const f = Math.max(0, flashes.get(id) || 0); if (f > 0) flashes.set(id, f - dt);
    const fl = f / 0.14;
    const bodyCol = s.team === 'blue' ? 0xa8c4ff : 0xffb4bc;
    if (dead) { const k = isCore ? 2.4 : 1.45; b.rubble.add(x, 0, z, s.x * 0.37, k, k, k, 0xbfc3d0, fl);  }
    else if (isCore) {
      b.cBody.add(x, 0, z, 0, 1.1, 1.1, 1.1, bodyCol, fl);
      b.cCrystal.add(x, 0.1 * Math.sin(t * 1.5), z, t * 0.8, 1.1, 1.1, 1.1, _c.set(col).multiplyScalar(s.invulnerable ? 0.35 : 1.2 * pulse));
    } else {
      b.tBody.add(x, 0, z, 0, 1.0, 1.0, 1.0, bodyCol, fl);
      _c.set(col).multiplyScalar(s.invulnerable ? 0.3 : 1.25 * pulse);
      b.tCrystal.add(x, 0.05 * Math.sin(t * 2 + s.x), z, t * 1.2, 1.0, 1.0, 1.0, _c);
      _c.multiplyScalar(0.8);
      b.tRing.add(x, 0, z, t * 2.4, 1.0, 1.0, 1.0, _c);
    }
    if (!dead && s.hp < s.maxHp) hp.add(x, isCore ? 4.3 : 5.3, z, isCore ? 2.4 : 1.8, 0.13, s.hp / s.maxHp, s.team === myTeam ? cols.ally : cols.foe);
  });
}

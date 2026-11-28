// units/structures.js - towers = blinking server racks + team beacon; cores = Production Server cabinet with a glowing screen;
// destroyed = smoking rubble. Drawn through instanced batches (geometry in bugs.js, LED blink/glow in geo.js patchFx).
// Also draws pooled overlays per scene: enemy attack-range rings, live tower targeting laser beams, and invulnerable shield domes.
import * as THREE from 'three';
import { TOWER, CORE } from '../../../shared/moba/rules.js';
import { S, TEAM_COL } from '../world/ground.js';

const _c = new THREE.Color();
const _vA = new THREE.Vector3(), _vB = new THREE.Vector3(), _vDir = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const RANGE_WARN_PAD = 320;
const scenePools = new WeakMap();

function getOverlayPool(scene) {
  if (!scene) return null;
  let p = scenePools.get(scene);
  if (!p) {
    const group = new THREE.Group();
    group.name = 'structure-overlays';
    scene.add(group);
    p = {
      group,
      ringGeo: new THREE.RingGeometry(0.955, 1.0, 56).rotateX(-Math.PI / 2),
      beamGeo: new THREE.CylinderGeometry(0.036, 0.036, 1, 6),
      domeGeo: new THREE.SphereGeometry(1, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
      rings: [], beams: [], domes: [],
      ri: 0, bi: 0, di: 0,
    };
    scenePools.set(scene, p);
  }
  p.ri = p.bi = p.di = 0;
  return p;
}

function nextRing(p) {
  let m = p.rings[p.ri++];
  if (!m) {
    m = new THREE.Mesh(p.ringGeo, new THREE.MeshBasicMaterial({
      color: 0xff4a4a, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
    }));
    m.renderOrder = 10; m.frustumCulled = false;
    p.group.add(m); p.rings.push(m);
  }
  m.visible = true;
  return m;
}

function nextBeam(p) {
  let m = p.beams[p.bi++];
  if (!m) {
    m = new THREE.Mesh(p.beamGeo, new THREE.MeshBasicMaterial({
      color: 0xff3b3b, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    m.renderOrder = 14; m.frustumCulled = false;
    p.group.add(m); p.beams.push(m);
  }
  m.visible = true;
  return m;
}

function nextDome(p) {
  let m = p.domes[p.di++];
  if (!m) {
    m = new THREE.Mesh(p.domeGeo, new THREE.MeshBasicMaterial({
      color: 0x39e8ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    m.renderOrder = 11; m.frustumCulled = false;
    p.group.add(m); p.domes.push(m);
  }
  m.visible = true;
  return m;
}

function findTarget(st, tid) {
  if (!tid || !st) return null;
  return (st.champions && st.champions.get && st.champions.get(tid))
    || (st.units && st.units.get && st.units.get(tid))
    || null;
}

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
  const scene = b && b.tBody && b.tBody.inst && b.tBody.inst.parent;
  const pool = getOverlayPool(scene);
  const myId = (typeof window !== 'undefined' && window.__three && window.__three.source && window.__three.source.localId) || null;
  const me = myId && st.champions && st.champions.get ? st.champions.get(myId) : null;

  st.structures.forEach((s, key) => {
    const id = s.id || key;
    const col = TEAM_COL[s.team] || TEAM_COL.neutral, dead = s.alive === false || s.hp <= 0;
    const isCore = s.kind === 'core', x = s.x * S, z = s.y * S;
    const pulse = 0.75 + 0.25 * Math.sin(t * 2.2 + s.x);
    const f = Math.max(0, flashes.get(id) || 0); if (f > 0) flashes.set(id, f - dt);
    const fl = f / 0.14;
    const bodyCol = s.team === 'blue' ? 0xa8c4ff : 0xffb4bc;
    if (dead) {
      const k = isCore ? 2.4 : 1.45;
      b.rubble.add(x, 0, z, s.x * 0.37, k, k, k, 0xbfc3d0, fl);
      smoke(b, x, z, t, isCore ? 1.45 : 0.95, s.x * 0.1 + s.y * 0.1);
    } else if (isCore) {
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

    if (!dead && pool) {
      const atkRange = isCore ? (CORE.range || 650) : (TOWER.range || 600);
      // 1. Enemy Tower/Core attack range ring when local champion approaches within atkRange + 320
      if (me && !me.dead && s.team && s.team !== myTeam) {
        const d = Math.hypot(me.x - s.x, me.y - s.y);
        if (d <= atkRange + RANGE_WARN_PAD) {
          const ring = nextRing(pool);
          const targetingMe = !!(myId && s.targetId === myId);
          const inside = d <= atkRange;
          const baseR = atkRange * S;
          ring.position.set(x, 0.045, z);
          if (targetingMe) {
            const p = 0.5 + 0.5 * Math.sin(t * 14);
            ring.scale.setScalar(baseR * (1 + 0.015 * p));
            ring.material.color.setHex(0xff2438);
            ring.material.opacity = 0.58 + 0.34 * p;
          } else if (inside) {
            const p = 0.5 + 0.5 * Math.sin(t * 7.5);
            ring.scale.setScalar(baseR * (1 + 0.008 * p));
            ring.material.color.setHex(0xff4a4a);
            ring.material.opacity = 0.36 + 0.22 * p;
          } else {
            const prox = Math.max(0, Math.min(1, 1 - (d - atkRange) / RANGE_WARN_PAD));
            ring.scale.setScalar(baseR);
            ring.material.color.setHex(0xff4a4a);
            ring.material.opacity = 0.06 + 0.24 * prox;
          }
        }
      }
      // 2. Live tower/core targeting laser line (s.targetId)
      if (s.targetId) {
        const tgt = findTarget(st, s.targetId);
        if (tgt && Number.isFinite(tgt.x) && Number.isFinite(tgt.y) && !tgt.dead && tgt.alive !== false) {
          const beam = nextBeam(pool);
          const topY = isCore ? 3.1 : 2.6;
          _vA.set(x, topY, z);
          _vB.set(tgt.x * S, 0.9, tgt.y * S);
          _vDir.subVectors(_vB, _vA);
          const len = _vDir.length();
          if (len > 0.05) {
            beam.position.addVectors(_vA, _vB).multiplyScalar(0.5);
            beam.quaternion.setFromUnitVectors(_up, _vDir.normalize());
            const targetingMe = !!(myId && s.targetId === myId);
            if (targetingMe) {
              const p = 0.5 + 0.5 * Math.sin(t * 16);
              const th = 1.35 + 0.45 * p;
              beam.scale.set(th, len, th);
              beam.material.color.setHex(0xff2233);
              beam.material.opacity = 0.72 + 0.28 * p;
            } else {
              const p = 0.5 + 0.5 * Math.sin(t * 8);
              beam.scale.set(0.85, len, 0.85);
              beam.material.color.setHex(s.team === 'blue' ? 0x39c2ff : 0xffaa33);
              beam.material.opacity = 0.46 + 0.2 * p;
            }
          } else {
            beam.visible = false;
          }
        }
      }
      // 3. Invulnerable shield dome
      if (s.invulnerable) {
        const dome = nextDome(pool);
        const rad = (isCore ? 2.15 : 1.45) * (1 + 0.025 * Math.sin(t * 3.4 + s.x));
        dome.position.set(x, 0.02, z);
        dome.scale.set(rad, rad * 1.15, rad);
        dome.material.opacity = 0.16 + 0.08 * (0.5 + 0.5 * Math.sin(t * 4.2 + s.x));
      }
    }
  });

  if (pool) {
    for (let i = pool.ri; i < pool.rings.length; i++) pool.rings[i].visible = false;
    for (let i = pool.bi; i < pool.beams.length; i++) pool.beams[i].visible = false;
    for (let i = pool.di; i < pool.domes.length; i++) pool.domes[i].visible = false;
  }
}

// world/epics.js - epic pits (5v5): golden bug pad and THE DEADLINE pad. Static decor (golden beetle statue, red calendar/clock
// block) merged in 1 mesh; the glowing pad is 1 shader mesh (2 quads): alive = bright pulsing ring, respawning = dim ring whose
// arc fills over the last 30s before state.epicGoldenAt / epicDeadlineAt (server ms vs srvNow), pulsing faster near the end.
// Uniform-only updates, no allocation. 2 draw calls total.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EPIC_SPOTS } from '../../../shared/moba/map.js'; // 5v5 only
import { S } from './ground.js';
import { box, ball, cyl, mergeParts } from './util.js';

const WARN = 30000; // ms of countdown shown as the arc (mirrors the HUD's 30s "epic soon" window)
export function makeEpics(world) {
  if (world && world.id && world.id !== '5v5') return null;
  const g = EPIC_SPOTS.golden, d = EPIC_SPOTS.deadline, R = 2.1, gx = g.x * S, gz = g.y * S, dx = d.x * S, dz = d.y * S;
  const parts = [ball(0.2, gx, 0.34, gz, 0xffc933, 1.3, 0.8, 1), ball(0.12, gx + 0.26, 0.34, gz, 0xe6a800), box(0.03, 0.03, 0.03, gx + 0.36, 0.4, gz + 0.05, 0x111111), box(0.03, 0.03, 0.03, gx + 0.36, 0.4, gz - 0.05, 0x111111)];
  for (const s of [-1, 1]) for (const x of [-0.12, 0, 0.12]) parts.push(box(0.025, 0.025, 0.24, gx + x, 0.14, gz + s * 0.22, 0xb8860b, s * 0.4));
  parts.push(cyl(0.3, 0.06, gx, 0.03, gz, 0x6b5415, 14));
  // THE DEADLINE: calendar block with a red header and a clock face
  parts.push(cyl(0.34, 0.08, dx, 0.04, dz, 0x2b1520, 16), box(0.5, 0.42, 0.1, dx, 0.3, dz, 0xf2f2f2), box(0.5, 0.1, 0.11, dx, 0.5, dz, 0xe0453a),
    box(0.03, 0.14, 0.02, dx, 0.3, dz + 0.06, 0x111111), box(0.1, 0.03, 0.02, dx + 0.04, 0.3, dz + 0.06, 0x111111), box(0.04, 0.04, 0.04, dx, 0.6, dz, 0xff5e5e));
  const decor = mergeParts(parts, mergeGeometries); decor.name = 'epic-decor'; decor.frustumCulled = false;
  const uni = { uTime: { value: 0 }, uA: { value: new THREE.Vector4(1, 1, 3, 0) }, uB: { value: new THREE.Vector4(1, 1, 3, 0) } }; // alive, progress, pulse speed
  const pos = [], uvs = [], id = [];
  [[gx, gz, 0], [dx, dz, 1]].forEach(([x, z, k]) => { for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) { pos.push(x + a * R, 0.036, z + b * R); uvs.push(a, b); id.push(k); } });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setAttribute('aId', new THREE.Float32BufferAttribute(id, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'attribute float aId; varying vec2 vUv; varying float vId; void main(){ vUv = uv; vId = aId; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; uniform vec4 uA, uB; varying vec2 vUv; varying float vId;
      void main(){
        vec4 s = vId < 0.5 ? uA : uB; float r = length(vUv); if (r > 1.0) discard;
        vec3 base = vId < 0.5 ? vec3(1.0, 0.78, 0.15) : vec3(1.0, 0.2, 0.28);
        float ring = smoothstep(0.80, 0.86, r) * (1.0 - smoothstep(0.93, 1.0, r));
        float ang = atan(vUv.y, vUv.x) / 6.2831853 + 0.5;
        float pulse = 0.8 + 0.2 * sin(uTime * s.z * 0.4);
        float warnPulse = 0.5 + 0.5 * sin(uTime * s.z * 0.75);
        vec3 col = mix(base, vec3(1.0, 0.95, 0.7), (1.0 - s.x) * s.y * 0.38 * warnPulse);
        float a;
        if (s.x > 0.5) a = ring * (0.7 + 0.5 * pulse) + (1.0 - smoothstep(0.0, 0.8, r)) * 0.18 * pulse;
        else a = ring * (0.22 + 0.08 * warnPulse + 0.78 * step(ang, s.y) * pulse) + (1.0 - smoothstep(0.0, 0.8, r)) * 0.08 * s.y * warnPulse;
        gl_FragColor = vec4(col * a, a);
      }`,
  });
  const pad = new THREE.Mesh(geo, mat); pad.name = 'epic-pad'; pad.frustumCulled = false;
  const group = new THREE.Group(); group.add(decor, pad);
  const set = (v, at, now) => { if (at > now) { const rem = at - now, pr = Math.max(0, Math.min(1, 1 - rem / WARN)); v.set(0, pr, rem < WARN ? 5 + 9 * pr : 2.5, 0); } else v.set(1, 1, 3, 0); };
  return {
    group,
    update(ctx) {
      const st = ctx.state; if (!st) return;
      uni.uTime.value = ctx.t || 0; const now = ctx.srvNow || 0;
      set(uni.uA.value, st.epicGoldenAt || 0, now); set(uni.uB.value, st.epicDeadlineAt || 0, now);
    },
  };
}

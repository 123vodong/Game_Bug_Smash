// world/index.js - static arena for any source.world (5v5 Open Office or a Story floor). Contract (Renderer.js):
//   createWorld({THREE,scene,source,renderer,quality,mode}) -> {update(ctx{state,srvNow,dtSec,t,camera}), setDoor(id,s), setQuality(settings), sun, dispose()}
// Reads only source.world (static) and, for sun-follow, the local champion from ctx.state.
import * as THREE from 'three';
import { makeGround, makePads, disposeTree, S } from './ground.js';
import { makeWalls } from './walls.js';
import { makeBushes } from './bushes.js';
import { makeCodeWalls } from './codewalls.js';
import { makeProps } from './props.js';
import { makeLights } from './lights.js';
import { makeCamps } from './camps.js';
import { makeRelics } from './relics.js';
import { makeEpics } from './epics.js';

export function createWorld({ scene, source, renderer, quality, mode } = {}) {
  const world = source.world || { id: '5v5', w: 6000, h: 6000, walls: [], bushes: [], fountain: {} };
  const W = (world.w || 6000) * S, H = (world.h || 6000) * S;
  const lite = !!(quality && quality.lite);
  const aniso = lite ? 1 : Math.min(8, (renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy()) || 1);
  const root = new THREE.Group(); root.name = 'world'; scene.add(root);
  const ground = makeGround(world, aniso, lite);
  const pads = makePads(world);
  const walls = makeWalls(world, aniso, lite);
  const bushes = makeBushes(world, lite);
  root.add(ground, pads, walls.group); if (bushes) root.add(bushes);
  const codeWalls = makeCodeWalls(world); if (codeWalls) root.add(codeWalls); // theme: code-snippet panels on walls (1 draw call)
  const props = makeProps(world, lite); if (props) root.add(props);          // theme: monitors/mugs/racks/ducks/bugs (1 draw call)
  const camps = makeCamps(world), epics = makeEpics(world), relics = source.world && source.world.id === '5v5' || !source.world ? makeRelics() : null; // C10: 5v5 map extras
  for (const x of [camps, epics, relics]) if (x) root.add(x.group);
  const lights = makeLights(scene);
  lights.follow(W / 2, H / 2);
  const setQuality = (s) => { lights.setQuality(s); if (props) props.userData.setLite(!!s.lite); if (ground.userData.uniforms.uLow) ground.userData.uniforms.uLow.value = s.lite ? 1 : 0; ground.receiveShadow = s.shadow !== 'off'; };
  if (quality) setQuality(quality);
  let lastT = 0;
  return {
    sun: lights.sun, root,
    update(ctx = {}) {
      const t = ctx.t || 0, dt = ctx.dtSec != null ? ctx.dtSec : Math.max(0, t - lastT); lastT = t;
      ground.userData.uniforms.uTime.value = t;
      if (bushes) bushes.userData.uni.uTime.value = t;
      walls.update(dt, t);
      if (bushes) bushes.userData.fx.update(ctx, dt);
      if (camps) camps.update(ctx, source.localId);
      if (epics) epics.update(ctx);
      if (relics) relics.update(ctx);
      const me = ctx.state && ctx.state.champions && ctx.state.champions.get && ctx.state.champions.get(source.localId);
      if (me) lights.follow(me.x * S, me.y * S);
    },
    setDoor(id, state) { walls.setDoor(id, state); },
    setQuality,
    dispose() { lights.dispose(); disposeTree(root); },
  };
}
export default createWorld;

// world/lights.js - hemisphere + ambient + shadow-casting sun that follows a focus point. Ported from three/world3d.js.
import * as THREE from 'three';
import { SHADOW_SIZE } from '../core/Quality.js';

export function makeLights(scene) {
  // Summoner's Rift–inspired visual hierarchy: crisp moonlit key light, readable terrain values, subtle atmospheric depth.
  const hemi = new THREE.HemisphereLight(0xc2e2dc, 0x2b3d34, 1.48);
  const amb = new THREE.AmbientLight(0x4b6862, 0.52);
  const sun = new THREE.DirectionalLight(0xfff0d2, 3.15);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  const R = 17;
  Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 60 });
  sun.shadow.mapSize.set(1024, 1024);
  const offset = new THREE.Vector3(-9, 17, 6);
  scene.add(hemi, amb, sun, sun.target);
  scene.fog = new THREE.FogExp2(0x101e24, 0.0026);
  return {
    sun,
    /** move the sun (and its shadow frustum) so it covers scene point (x, z) */
    follow(x, z) {
      sun.target.position.set(x, 0, z);
      sun.position.set(x + offset.x, offset.y, z + offset.z);
      sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
    },
    setQuality(settings) {
      const size = SHADOW_SIZE[settings.shadow] || 0;
      sun.castShadow = size > 0;
      if (size > 0 && sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    },
    dispose() { scene.remove(hemi, amb, sun, sun.target); scene.fog = null; sun.shadow.dispose(); },
  };
}

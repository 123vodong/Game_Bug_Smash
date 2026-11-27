// world/util.js - tiny vertex-colour geometry helpers shared by the C10 map-extras modules (build-time only).
import * as THREE from 'three';
export const col = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
export const box = (w, h, d, x, y, z, hex, ry = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry); return col(g.translate(x, y, z), hex); };
export const ball = (r, x, y, z, hex, sx = 1, sy = 1, sz = 1) => col(new THREE.IcosahedronGeometry(r, 0).scale(sx, sy, sz).translate(x, y, z), hex);
export const cyl = (r, h, x, y, z, hex, seg = 8) => col(new THREE.CylinderGeometry(r, r, h, seg).translate(x, y, z), hex);
/** merge vertex-coloured parts into one Lambert mesh (1 draw call). */
export function mergeParts(parts, mergeGeometries) {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  for (const p of parts) p.dispose();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

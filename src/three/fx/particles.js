// Particle pool: one Points draw call, fixed-size typed arrays (cap N), swap-remove, additive glow dots.
// Ported from three/fx3d.js. Scene units: sim px * 0.01, sim y -> scene z.
export function createParticles(THREE, scene, N = 2500) {
  const P = { pos: new Float32Array(N * 3), col: new Float32Array(N * 4), size: new Float32Array(N), vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N), grav: new Float32Array(N), drag: new Float32Array(N), s0: new Float32Array(N) };
  let pn = 0;
  const g = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(P.pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.BufferAttribute(P.col, 4).setUsage(THREE.DynamicDrawUsage);
  const aSize = new THREE.BufferAttribute(P.size, 1).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', aPos); g.setAttribute('color', aCol); g.setAttribute('size', aSize);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { uScale: { value: 600 } },
    vertexShader: `attribute vec4 color; attribute float size; varying vec4 vC; uniform float uScale;
      void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); float ps = size * uScale / -mv.z; gl_PointSize = ps < 2.5 ? 0.0 : ps; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec4 vC; void main(){ vec2 q = gl_PointCoord - 0.5; float r = length(q) * 2.0; if (r > 1.0) discard; float a = pow(1.0 - r, 1.0); gl_FragColor = vec4(vC.rgb * a * vC.a, a * vC.a); }`,
  });
  const points = new THREE.Points(g, mat); points.frustumCulled = false; points.renderOrder = 10; scene.add(points);
  const tmpC = new THREE.Color();
  const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));

  function puff(x, y, z, vx, vy, vz, life, size, color, alpha = 1, grav = 0, drag = 0.5) {
    if (pn >= N) return; const i = pn++;
    P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z; P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
    P.life[i] = P.max[i] = life; P.size[i] = P.s0[i] = size; P.grav[i] = grav; P.drag[i] = drag;
    const c = tmpC.set(color); P.col[i * 4] = c.r * 1.6; P.col[i * 4 + 1] = c.g * 1.6; P.col[i * 4 + 2] = c.b * 1.6; P.col[i * 4 + 3] = alpha;
  }
  function burst(x, y, z, color, n = 24, speed = 3, size = 0.12, life = 0.6, up = 1.5) {
    for (let i = 0; i < n; i++) { const a = rnd(6.283), s = rnd(0.3, 1) * speed; puff(x, y, z, Math.cos(a) * s, rnd(0.2, 1) * up + 0.5, Math.sin(a) * s, rnd(0.6, 1) * life, rnd(0.6, 1.2) * size, color, 1, -4, 1.2); }
  }
  function step(dt) {
    for (let i = 0; i < pn;) {
      P.life[i] -= dt;
      if (P.life[i] <= 0) {
        const j = --pn;
        if (i !== j) {
          P.pos.copyWithin(i * 3, j * 3, j * 3 + 3); P.vel.copyWithin(i * 3, j * 3, j * 3 + 3); P.col.copyWithin(i * 4, j * 4, j * 4 + 4);
          P.life[i] = P.life[j]; P.max[i] = P.max[j]; P.size[i] = P.size[j]; P.s0[i] = P.s0[j]; P.grav[i] = P.grav[j]; P.drag[i] = P.drag[j];
        }
        continue;
      }
      const k = Math.max(0, 1 - P.drag[i] * dt);
      P.vel[i * 3] *= k; P.vel[i * 3 + 2] *= k; P.vel[i * 3 + 1] = P.vel[i * 3 + 1] * k + P.grav[i] * dt;
      P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] = Math.max(0.02, P.pos[i * 3 + 1] + P.vel[i * 3 + 1] * dt); P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
      const f = P.life[i] / P.max[i]; P.size[i] = P.s0[i] * (0.4 + 0.6 * f); P.col[i * 4 + 3] = Math.min(1, f * 1.6);
      i++;
    }
    g.setDrawRange(0, pn);
    aPos.needsUpdate = aCol.needsUpdate = aSize.needsUpdate = true;
  }
  return {
    puff, burst, step, rnd,
    get count() { return pn; },
    setViewport(hPx, fovDeg) { mat.uniforms.uScale.value = (hPx * 0.5) / Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2); },
    dispose() { scene.remove(points); g.dispose(); mat.dispose(); pn = 0; },
  };
}

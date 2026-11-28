// Ground telegraphs drawn at TRUE sim radii (sim px * 0.01, sim y -> scene z). Shader modes:
// 0 circle windup (fill sweeps outward) | 1 zone (dashed, lives `life`) | 2 line/rect (a=len, b=half width) | 3 cone (a=len, b=half angle rad).
// Meshes+materials are pooled; hard cap on live telegraphs.
const VERT = `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `
varying vec2 vP; uniform vec3 uColor; uniform float uProg, uAlpha, uTime, uMode, uExt, uA, uB;
float band(float d, float c, float w){ return 1.0 - smoothstep(w * 0.5, w, abs(d - c)); }
void main(){
  vec2 p = vP * uExt; float fill = 0.0, ring = 0.0;
  if (uMode < 1.5) {
    float d = length(p) / uA;
    if (d > 1.04) discard;
    ring = band(d, 0.985, 0.06);
    if (uMode < 0.5) { fill = (d < uProg ? 0.20 : 0.07) * (1.0 - d * 0.4); ring += band(d, uProg, 0.04) * 0.8; }
    else {
      float ang = atan(p.y, p.x); float dash = step(0.5, fract(ang * 3.0 / 3.14159 + uTime * 0.12));
      fill = 0.10 + 0.05 * sin(uTime * 3.0 - d * 6.0); ring += band(d, 0.62, 0.035) * dash * 0.8;
      ring *= mix(0.55, 1.0, dash);
    }
  } else if (uMode < 2.5) {
    if (p.x < -0.05 || p.x > uA + 0.05 || abs(p.y) > uB + 0.05) discard;
    float e = min(min(p.x + 0.05, uA + 0.05 - p.x), uB + 0.05 - abs(p.y));
    ring = 1.0 - smoothstep(0.0, 0.07, e);
    fill = (p.x / uA < uProg ? 0.22 : 0.07); ring += band(p.x / uA, uProg, 0.03) * 0.7 * step(abs(p.y), uB);
  } else {
    float d = length(p) / uA; float ang = abs(atan(p.y, p.x));
    if (d > 1.02 || ang > uB + 0.03) discard;
    float ea = (uB - ang) * d * uA;
    ring = max(band(d, 0.99, 0.05), 1.0 - smoothstep(0.0, 0.07, ea));
    fill = (d < uProg ? 0.22 : 0.07);
  }
  float a = clamp(fill + ring, 0.0, 1.0) * uAlpha;
  gl_FragColor = vec4(uColor * (fill * 2.0 + ring * 2.2), a);
}`;

export function createTelegraphs(THREE, scene, { cap = 28, S = 0.01 } = {}) {
  const root = new THREE.Group(); root.name = 'fx-telegraphs'; scene.add(root);
  const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const free = [], live = [], byTid = new Map();

  function acquire() {
    const m = free.pop(); if (m) return m;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uColor: { value: new THREE.Color() }, uProg: { value: 0 }, uAlpha: { value: 1 }, uTime: { value: 0 }, uMode: { value: 0 }, uExt: { value: 1 }, uA: { value: 1 }, uB: { value: 0.3 } },
    });
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 2; mesh.frustumCulled = false; return mesh;
  }
  function kill(i) {
    const it = live[i]; root.remove(it.mesh); free.push(it.mesh); if (it.tid !== undefined && byTid.get(it.tid) === it) byTid.delete(it.tid);
    live[i] = live[live.length - 1]; live.pop();
  }
  /** x,y in SIM px. a/b/ext in scene units (a = radius or length; ext = quad half extent, >= a). delay/life in seconds. */
  function tele({ x, y, mode = 0, a = 1, b = 0.3, rot = 0, color = 0xffffff, delay = 0.5, life = 0, ext, onEnd = null, follow = null, tid }) {
    if (live.length >= cap) { onEnd && onEnd(); return null; }
    const mesh = acquire(), u = mesh.material.uniforms;
    const extVal = ext ?? Math.max(a, b) * 1.1;
    u.uColor.value.set(color); u.uProg.value = 0; u.uAlpha.value = 1; u.uTime.value = 0; u.uMode.value = mode; u.uExt.value = extVal; u.uA.value = a; u.uB.value = b;
    mesh.scale.setScalar(extVal); mesh.position.set(x * S, 0.04, y * S); mesh.rotation.y = rot; root.add(mesh);
    const it = { mesh, t: 0, mode, delay, life, onEnd, follow, fired: false, tid }; live.push(it);
    if (tid !== undefined) byTid.set(tid, it);
    return it;
  }
  function end(tid) { const it = byTid.get(tid); if (it) { it.life = 0.0001; it.t = Math.max(it.t, 0.0001); it.ending = true; } }
  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const it = live[i], u = it.mesh.material.uniforms; it.t += dt; u.uTime.value += dt;
      if (it.follow) { const p = it.follow(); if (p) it.mesh.position.set(p.x * S, 0.04, p.y * S); }
      let alive = true;
      if (it.mode === 1) {
        const f = it.life > 0 ? it.t / it.life : 0; u.uAlpha.value = Math.min(1, it.t * 5) * (1 - Math.max(0, (f - 0.85) / 0.15));
        alive = it.life <= 0 || it.t < it.life; if (it.ending) alive = false;
      } else {
        u.uProg.value = Math.min(1, it.t / Math.max(0.01, it.delay));
        if (it.t >= it.delay) { const f = (it.t - it.delay) / 0.25; u.uAlpha.value = Math.max(0, 1 - f); if (!it.fired) { it.fired = true; try { it.onEnd && it.onEnd(); } catch (e) { console.warn('[fx] telegraph onEnd', e); } } alive = f < 1; }
      }
      if (!alive) kill(i);
    }
  }
  return {
    tele, end, update, get count() { return live.length; },
    dispose() { while (live.length) kill(live.length - 1); for (const m of free) m.material.dispose(); free.length = 0; geo.dispose(); scene.remove(root); },
  };
}

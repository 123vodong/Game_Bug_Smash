// Shape decals: ONE InstancedMesh (1 draw call) draws every ring / flash / star burst / streak / plus / hex shield / chevron / ink blot
// on the ground. Procedural fragment shader (no texture loads, no flipbook dependency), additive, depthWrite off.
// Fixed pool (cap), swap-remove, no per-frame allocation. Scene units: sim px * 0.01, sim y -> scene z.
// add({type,x,y,z,rot,sx,sz,color,alpha,dur,delay,prio,follow}) -> handle | null. type: SH.*.  dur<=0 => persistent (caller set()/kill()).
export const SH = { RING: 0, FLASH: 1, RAYS: 2, STREAK: 3, PLUS: 4, HEX: 5, CHEVRON: 6, BLOT: 7 };
const VERT = `attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; varying vec2 vU; varying vec4 vB; varying vec4 vC;
void main(){ vU = position.xz; vB = iB; vC = iC; float c = cos(iA.w), s = sin(iA.w);
  vec2 p = vec2(position.x * iB.x, position.z * iB.y); p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  gl_Position = projectionMatrix * viewMatrix * vec4(iA.x + p.x, iA.y, iA.z + p.y, 1.0); }`;
// iB = (sx, sz, age01 (-1 = persistent), type); iC = (rgb, alpha)
const FRAG = `varying vec2 vU; varying vec4 vB; varying vec4 vC;
float band(float d, float c, float w){ return 1.0 - smoothstep(w * 0.5, w, abs(d - c)); }
void main(){
  float t = vB.z, ty = vB.w, d = length(vU); if (d > 1.0 && ty != 3.0) discard;
  float f = t < 0.0 ? 0.0 : t, inv = 1.0 - f, a = 0.0, core = 0.0; float ang = atan(vU.y, vU.x);
  if (ty < 0.5) { float R = t < 0.0 ? 0.9 : mix(0.3, 1.0, 1.0 - inv * inv); a = band(d, R, 0.16 * inv + 0.05) * (t < 0.0 ? 1.0 : inv) + band(d, R * 0.82, 0.05) * 0.45 * inv; }
  else if (ty < 1.5) { a = pow(1.0 - d, 1.4) * (t < 0.0 ? 1.0 : inv * inv); core = pow(1.0 - d, 4.0); }
  else if (ty < 2.5) { float R = mix(0.35, 1.0, 1.0 - inv * inv); float sp = pow(abs(cos(ang * 4.0)), 10.0) * smoothstep(R, R * 0.2, d); a = (sp * 1.4 + pow(1.0 - d, 3.0) * 0.6) * inv; core = sp; }
  else if (ty < 3.5) { float u = vU.x * 0.5 + 0.5; if (u < 0.0 || u > 1.0) discard; float w = 1.0 - abs(vU.y); a = pow(u, 1.6) * w * w * (t < 0.0 ? 1.0 : inv); core = pow(u, 6.0) * w * w * w; }
  else if (ty < 4.5) { float arm = max(1.0 - smoothstep(0.12, 0.24, abs(vU.x)) * step(abs(vU.y), 1.0), 0.0) * (1.0 - smoothstep(0.5, 1.0, abs(vU.y)));
    float arm2 = (1.0 - smoothstep(0.12, 0.24, abs(vU.y))) * (1.0 - smoothstep(0.5, 1.0, abs(vU.x))); a = max(arm, arm2) * (t < 0.0 ? 1.0 : inv); core = a * a; }
  else if (ty < 5.5) { float hx = max(abs(vU.x) * 0.866 + abs(vU.y) * 0.5, abs(vU.y)); float R = t < 0.0 ? 0.9 : mix(0.6, 1.0, 1.0 - inv * inv); a = (band(hx, R, 0.12) + 0.18 * step(hx, R)) * (t < 0.0 ? 1.0 : inv); }
  else if (ty < 6.5) { float y = abs(vU.y) * 0.9; float v = max(abs(vU.x * 0.8 + 0.2 - y * 0.9), 0.0); float chev = 1.0 - smoothstep(0.08, 0.22, abs(abs(vU.y) * 0.8 - (vU.x * 0.5 + 0.3))); a = chev * smoothstep(-1.0, 0.3, vU.x) * (t < 0.0 ? 1.0 : inv); core = a * a; }
  else { float n = 0.75 + 0.25 * sin(ang * 5.0 + 2.0) * sin(ang * 3.0); a = smoothstep(n, n * 0.3, d) * (t < 0.0 ? 1.0 : inv); core = a * a * 0.5; }
  vec3 col = vC.rgb * (a * 1.6) + vec3(core) * 0.7; gl_FragColor = vec4(col * vC.a, clamp(a, 0.0, 1.0) * vC.a);
}`;

export function createShapes(THREE, scene, { cap = 72 } = {}) {
  const geo = new THREE.InstancedBufferGeometry(); geo.copy(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2));
  const A = new Float32Array(cap * 4), B = new Float32Array(cap * 4), C = new Float32Array(cap * 4);
  const aA = new THREE.InstancedBufferAttribute(A, 4).setUsage(THREE.DynamicDrawUsage), aB = new THREE.InstancedBufferAttribute(B, 4).setUsage(THREE.DynamicDrawUsage), aC = new THREE.InstancedBufferAttribute(C, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iA', aA); geo.setAttribute('iB', aB); geo.setAttribute('iC', aC); geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, vertexShader: VERT, fragmentShader: FRAG });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 4; scene.add(mesh);
  const items = [], pool = []; for (let i = 0; i < cap; i++) pool.push({ type: 0, x: 0, y: 0, z: 0, rot: 0, sx: 1, sz: 1, r: 1, g: 1, b: 1, a: 1, t: 0, dur: 1, delay: 0, follow: null, live: false });
  const tc = new THREE.Color();

  function add({ type = 0, x, y, z = 0.07, rot = 0, sx = 1, sz, color = 0xffffff, alpha = 1, dur = 0.5, delay = 0, prio = 1, follow = null }) {
    if (items.length >= (prio > 0 ? cap : Math.floor(cap * 0.6))) return null;
    const o = pool.pop(); if (!o) return null;
    tc.set(color); o.type = type; o.x = x; o.y = y; o.z = z; o.rot = rot; o.sx = sx; o.sz = sz === undefined ? sx : sz; o.r = tc.r; o.g = tc.g; o.b = tc.b; o.a = alpha;
    o.t = -delay; o.dur = dur; o.follow = follow; o.live = true; items.push(o); return o;
  }
  /** move a persistent handle (dur<=0) */
  function set(o, x, y, z, rot) { if (!o || !o.live) return; o.x = x; o.y = y; if (z !== undefined) o.z = z; if (rot !== undefined) o.rot = rot; }
  function kill(o) { if (!o || !o.live) return; o.live = false; const i = items.indexOf(o); if (i >= 0) { items[i] = items[items.length - 1]; items.pop(); } pool.push(o); }
  function update(dt) {
    let n = 0;
    for (let i = items.length - 1; i >= 0; i--) { const o = items[i]; if (o.dur > 0) { o.t += dt; if (o.t >= o.dur) { o.live = false; items[i] = items[items.length - 1]; items.pop(); pool.push(o); } } }
    for (let i = 0; i < items.length; i++) {
      const o = items[i]; if (o.t < 0) continue; if (o.follow) { const p = o.follow(); if (p) { o.x = p.x * 0.01; o.y = p.y * 0.01; } }
      const k = n * 4; A[k] = o.x; A[k + 1] = o.z; A[k + 2] = o.y; A[k + 3] = o.rot; B[k] = o.sx; B[k + 1] = o.sz; B[k + 2] = o.dur > 0 ? Math.min(1, o.t / o.dur) : -1; B[k + 3] = o.type;
      C[k] = o.r; C[k + 1] = o.g; C[k + 2] = o.b; C[k + 3] = o.a; n++;
    }
    geo.instanceCount = n; mesh.visible = n > 0; if (n) { aA.needsUpdate = aB.needsUpdate = aC.needsUpdate = true; }
  }
  return { add, set, kill, update, get count() { return items.length; }, dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); items.length = 0; } };
}

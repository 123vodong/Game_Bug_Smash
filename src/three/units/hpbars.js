// units/hpbars.js - billboard HP bars, one instanced draw call. Billboarding uses the view matrix in the shader,
// so no camera reference is needed. Ported from three/units3d.js.
import * as THREE from 'three';

export class HpBars {
  constructor(scene, max = 400) {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aHp = new THREE.InstancedBufferAttribute(new Float32Array(max), 1); this.aHp.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aHp', this.aHp);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
      vertexShader: `
        attribute float aHp; varying float vHp; varying vec2 vUv; varying vec3 vCol;
        void main(){
          vHp = aHp; vUv = uv; vCol = instanceColor;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 c = instanceMatrix[3].xyz; vec2 sc = vec2(instanceMatrix[0][0], instanceMatrix[1][1]);
          vec3 p = c + right * position.x * sc.x + up * position.y * sc.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        varying float vHp; varying vec2 vUv; varying vec3 vCol;
        void main(){
          float edge = step(vUv.x, 0.02) + step(0.98, vUv.x) + step(vUv.y, 0.12) + step(0.88, vUv.y);
          vec3 col = vUv.x <= vHp ? vCol : vec3(0.07, 0.08, 0.12);
          if (edge > 0.0) col = vec3(0.02, 0.03, 0.05);
          gl_FragColor = vec4(col, 0.95);
        }`,
    });
    this.inst = new THREE.InstancedMesh(geo, this.mat, max);
    this.inst.frustumCulled = false; this.inst.renderOrder = 50; this.inst.count = 0;
    this.inst.setColorAt(0, new THREE.Color());
    this.inst.instanceColor.setUsage(THREE.DynamicDrawUsage); this.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.inst); this.max = max; this.n = 0;
    this._m = new THREE.Matrix4(); this._c = new THREE.Color();
  }
  begin() { this.n = 0; }
  /** (x,y,z) scene units (bar centre), w/h size, frac 0..1, color hex */
  add(x, y, z, w, h, frac, color) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this._m.makeScale(w, h, 1); this._m.setPosition(x, y, z);
    this.inst.setMatrixAt(i, this._m); this.inst.setColorAt(i, this._c.set(color)); this.aHp.array[i] = Math.max(0, Math.min(1, frac));
  }
  end() { this.inst.count = this.n; this.inst.instanceMatrix.needsUpdate = true; this.inst.instanceColor.needsUpdate = true; this.aHp.needsUpdate = true; }
  dispose() { this.inst.parent && this.inst.parent.remove(this.inst); this.inst.geometry.dispose(); this.mat.dispose(); this.inst.dispose(); }
}

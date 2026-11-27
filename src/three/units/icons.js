// units/icons.js - floating champion role icon (emoji from champion data) above the HP bar. ONE instanced billboard draw call,
// one shared emoji atlas canvas (built once), fixed instance buffers: no per-frame allocation. Same billboard maths as hpbars.js.
import * as THREE from 'three';
import { CHAMPIONS } from '../../../shared/moba/champions.js';

const COLS = 6, CELL = 64;
export class ChampIcons {
  constructor(scene, max = 24) {
    this.ids = Object.keys(CHAMPIONS); this.max = max; this.n = 0;
    const rows = Math.ceil(this.ids.length / COLS), cv = document.createElement('canvas'); cv.width = COLS * CELL; cv.height = rows * CELL;
    const g = cv.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle';
    this.ids.forEach((id, i) => {
      const c = CHAMPIONS[id], x = (i % COLS) * CELL + CELL / 2, y = Math.floor(i / COLS) * CELL + CELL / 2;
      g.fillStyle = 'rgba(12,16,28,0.88)'; g.beginPath(); g.arc(x, y, 29, 0, 6.283); g.fill();
      g.lineWidth = 4; g.strokeStyle = '#' + (c.color >>> 0).toString(16).padStart(6, '0'); g.stroke();
      g.font = '32px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.fillStyle = '#fff'; g.fillText(c.emoji || '?', x, y + 2);
    });
    this.tex = new THREE.CanvasTexture(cv); this.tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aCell = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aCell', this.aCell);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, toneMapped: false, uniforms: { uTex: { value: this.tex }, uRows: { value: rows } },
      vertexShader: `attribute float aCell; varying vec2 vUv; uniform float uRows;
        void main(){ float cx = mod(aCell, ${COLS}.0), cy = floor(aCell / ${COLS}.0); vUv = vec2((cx + uv.x) / ${COLS}.0, 1.0 - (cy + 1.0 - uv.y) / uRows);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 c = instanceMatrix[3].xyz; float s = instanceMatrix[0][0];
          gl_Position = projectionMatrix * viewMatrix * vec4(c + right * position.x * s + up * position.y * s, 1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform sampler2D uTex; void main(){ vec4 t = texture2D(uTex, vUv); if (t.a < 0.05) discard; gl_FragColor = t; }`,
    });
    this.inst = new THREE.InstancedMesh(geo, this.mat, max); this.inst.frustumCulled = false; this.inst.renderOrder = 51; this.inst.count = 0; this.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.inst); this._m = new THREE.Matrix4(); this.idx = new Map(this.ids.map((id, i) => [id, i]));
  }
  begin() { this.n = 0; }
  add(champId, x, y, z, size = 0.42) {
    if (this.n >= this.max) return; const i = this.n++;
    this._m.makeScale(size, size, 1); this._m.setPosition(x, y, z); this.inst.setMatrixAt(i, this._m); this.aCell.array[i] = this.idx.get(champId) || 0;
  }
  end() { this.inst.count = this.n; this.inst.instanceMatrix.needsUpdate = true; this.aCell.needsUpdate = true; }
  dispose() { this.inst.parent && this.inst.parent.remove(this.inst); this.inst.geometry.dispose(); this.mat.dispose(); this.tex.dispose(); this.inst.dispose(); }
}

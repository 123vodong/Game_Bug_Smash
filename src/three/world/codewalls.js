// world/codewalls.js - satirical "code editor" panels on wall faces. ONE shared canvas atlas (8 snippets, VS Code dark+ token
// colours) + ONE merged quad mesh (1 draw call). The atlas cell is tiled per quad in the fragment shader via an aCell attribute,
// so long walls repeat the snippet without stretching. Mirrors the 2D CODE_SNIPPETS flavour (MultiPlayScene.js).
import * as THREE from 'three';
import { S } from './ground.js';

const KW = '#569cd6', FN = '#dcdcaa', ST = '#ce9178', NU = '#b5cea8', CM = '#6a9955', TY = '#4ec9b0', CT = '#c586c0', DF = '#d4d4d4';
const SNIPS = [
  [[['// what could go wrong?', CM]], [['deploy', FN], ['(', DF], ["'friday'", ST], [');', DF]], [['  return ', KW], ['panic();', FN]]],
  [[['while ', CT], ['(bugs > ', DF], ['0', NU], [') {', DF]], [['  fix(); cry();', FN]], [['} ', DF], ['// never ends', CM]]],
  [[['import ', CT], ['Claude ', TY], ['from', CT], [" 'ai'", ST]], [['// works on my machine', CM]], [['await ', KW], ['Claude.debug()', DF]]],
  [[['if ', CT], ['(Date.now() > ', DF], ['2**31', NU], [')', DF]], [['  throw ', KW], ["Error('Y2K38')", ST]], [['// 2038-01-19', CM]]],
  [[['const ', KW], ['ANSWER = ', DF], ['42', NU], [';', DF]], [['return ', KW], ['ANSWER;', DF]], [['// ¯\_(ツ)_/¯', CM]]],
  [[['git ', FN], ['push --force', DF]], [['// TODO: fix later', CM]], [['// (2019)', CM]]],
  [[['catch ', CT], ['(e) {', DF]], [['  /* ignore */', CM]], [['}  ', DF], ['// sure', CM]]],
  null, // 0/1 glyph drift, drawn procedurally
];
const CW = 512, CH = 128, COLS = 2, ROWS = 4;

let _atlas = null;
function atlas() {
  if (_atlas) return _atlas;
  const cv = document.createElement('canvas'); cv.width = CW * COLS; cv.height = CH * ROWS;
  const g = cv.getContext('2d');
  g.textBaseline = 'top';
  SNIPS.forEach((lines, i) => {
    const x0 = (i % COLS) * CW, y0 = Math.floor(i / COLS) * CH;
    g.fillStyle = '#1b1e28'; g.fillRect(x0, y0, CW, CH);
    g.fillStyle = '#2d3350'; g.fillRect(x0, y0, CW, 10); g.fillStyle = '#ff5e5e'; g.fillRect(x0 + 6, y0 + 2, 6, 6); g.fillStyle = '#ffd23f'; g.fillRect(x0 + 16, y0 + 2, 6, 6); g.fillStyle = '#7ed957'; g.fillRect(x0 + 26, y0 + 2, 6, 6);
    g.font = 'bold 30px monospace';
    if (lines) {
      lines.forEach((ln, r) => { let x = x0 + 12; for (const [t, c] of ln) { g.fillStyle = c; g.fillText(t, x, y0 + 20 + r * 34); x += g.measureText(t).width; } });
    } else {
      let s = 5; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      g.font = 'bold 30px monospace';
      for (let r = 0; r < 2; r++) { let line = ''; for (let k = 0; k < 12; k++) line += rnd() < 0.5 ? '0' : '1'; g.fillStyle = '#2a6a45'; g.fillText(line, x0 + 12, y0 + 20 + r * 34); }
    }
    g.strokeStyle = '#2d3350'; g.lineWidth = 3; g.strokeRect(x0 + 1.5, y0 + 1.5, CW - 3, CH - 3);
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4; // mipmaps: minified text no longer shimmers like sparkles
  return (_atlas = t);
}

const hash = (a, b) => { let h = (Math.imul((a * 73856093) | 0, 1) ^ Math.imul((b * 19349663) | 0, 1)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0; return h ^ (h >>> 15); };

/** Face quads along wall faces. Returns a Mesh (1 draw call) or null. */
export function makeCodeWalls(world) {
  const pos = [], uv = [], cell = [];
  const quad = (cx, cz, dx, dz, nx, nz, len, off, y0, qh, id) => {
    const n = Math.max(1, Math.round(len / (qh * (CW / CH))));
    const hl = len / 2 - 0.06, k = hash(Math.round(cx * 100) + id, Math.round(cz * 100));
    const ci = k % SNIPS.length, cu0 = (ci % COLS) / COLS, cv0 = 1 - (Math.floor(ci / COLS) + 1) / ROWS;
    for (const side of [1, -1]) {
      const ox = cx + nx * off * side, oz = cz + nz * off * side;
      const ax = ox - dx * hl, az = oz - dz * hl, bx = ox + dx * hl, bz = oz + dz * hl;
      const u0 = side > 0 ? 0 : n, u1 = side > 0 ? n : 0; // reverse u on the back face so text is not mirrored
      const p = [[ax, y0, az, u0, 0], [bx, y0, bz, u1, 0], [bx, y0 + qh, bz, u1, 1], [ax, y0 + qh, az, u0, 1]];
      const o = side > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]; // face outward
      for (const i of o) { pos.push(p[i][0], p[i][1], p[i][2]); uv.push(p[i][3], p[i][4]); cell.push(cu0, cv0, 1 / COLS, 1 / ROWS); }
    }
  };
  // top-face panel (the angled camera mostly sees wall tops): hw = half width, text runs along the wall
  // Orientation: camera looks north (-z) from +z, so screen-right = +x. Text runs along u (flipped so u.x >= 0), text-up v = (dz,-dx)
  // (screen-up = -z for horizontal walls). u x v = +y, so the quad faces up and is never mirrored.
  const top = (cx, cz, dx, dz, len, hw, y, id) => {
    if (dx < -1e-6 || (Math.abs(dx) <= 1e-6 && dz < 0)) { dx = -dx; dz = -dz; }
    const tw = hw * 2 * (CW / CH), n = Math.max(1, Math.round(len / tw)), hl = len / 2 - 0.04, nx = dz, nz = -dx;
    const ci = hash(Math.round(cx * 100) + id + 7, Math.round(cz * 100)) % SNIPS.length, cu0 = (ci % COLS) / COLS, cv0 = 1 - (Math.floor(ci / COLS) + 1) / ROWS;
    const P = (s, t, u, v) => [cx + dx * hl * s + nx * hw * t, y, cz + dz * hl * s + nz * hw * t, u, v];
    const p = [P(-1, -1, 0, 0), P(1, -1, n, 0), P(1, 1, n, 1), P(-1, 1, 0, 1)];
    for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(p[i][0], p[i][1], p[i][2]); uv.push(p[i][3], p[i][4]); cell.push(cu0, cv0, 1 / COLS, 1 / ROWS); }
  };
  const is5v5 = !world || world.id === '5v5';
  const HT = { partition: 1.25, cubicles: 0.95, shelf: 0.8 };
  let id = 0;
  for (const w of (world && world.walls) || []) {
    const h = HT[w.look] || (w.look === 'glass' ? 0 : 0);
    if (!h || w.look === 'shelf') continue;
    if (w.kind === 'poly') {
      if (w.baseWall) continue;
      const pts = w.pts;
      if (!pts || pts.length < 3) continue;
      let area = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        area += a[0] * b[1] - b[0] * a[1];
      }
      const ccw = area >= 0 ? 1 : -1;
      for (let i = 0; i < pts.length; i++) {
        if (i % 3 !== 1) continue; // crisp embedded dev plaques spaced along curved cliff flanks
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const dx = (b[0] - a[0]) * S, dz = (b[1] - a[1]) * S;
        const L = Math.hypot(dx, dz);
        if (L < 0.75) continue;
        const ux = dx / L, uz = dz / L;
        // screen-space outward edge normal depending on winding
        const nx = (uz * ccw), nz = (-ux * ccw);
        const mx = (a[0] + b[0]) * 0.5 * S, mz = (a[1] + b[1]) * 0.5 * S;
        const len = Math.min(2.2, Math.max(0.95, L * 0.92));
        const off = 0.20;
        const k = hash(Math.round(mx * 100) + id, Math.round(mz * 100));
        const ci = k % SNIPS.length, cu0 = (ci % COLS) / COLS, cv0 = 1 - (Math.floor(ci / COLS) + 1) / ROWS;
        const qh = 0.28, y0 = 0.14;
        const n = Math.max(1, Math.round(len / (qh * (CW / CH))));
        const hl = len * 0.5 - 0.04;
        const ox = mx + nx * off, oz = mz + nz * off;
        const ax = ox - ux * hl, az = oz - uz * hl, bx = ox + ux * hl, bz = oz + uz * hl;
        const p = [[ax, y0, az, 0, 0], [bx, y0, bz, n, 0], [bx, y0 + qh, bz, n, 1], [ax, y0 + qh, az, 0, 1]];
        for (const idx of [0, 1, 2, 0, 2, 3]) {
          pos.push(p[idx][0], p[idx][1], p[idx][2]); uv.push(p[idx][3], p[idx][4]); cell.push(cu0, cv0, 1 / COLS, 1 / ROWS);
        }
        id++;
      }
      continue;
    }
    if (w.kind === 'seg') {
      const dx = (w.x2 - w.x1) * S, dz = (w.y2 - w.y1) * S, L = Math.hypot(dx, dz), len = L + w.w * S * 0.5, th = w.w * S * 0.5;
      if (len < 0.9 || L < 1e-4) continue;
      const qh = is5v5 ? Math.min(0.54, h * 0.46) : Math.min(0.5, h * 0.42);
      const cliffHalf = Math.max(0.32, w.w * S * 0.65) * 0.68 + 0.1;
      const off = is5v5 ? cliffHalf : th / 2 + 0.008;
      const topY = is5v5 ? h + 0.62 : h + 0.034;
      const sideY = is5v5 ? h * 0.48 : h * 0.4;
      if (th > 0.12) top((w.x1 + w.x2) / 2 * S, (w.y1 + w.y2) / 2 * S, dx / L, dz / L, len, Math.min(th * 0.42, 0.2), topY, id);
      // dir (cos,-sin of rotateY(-atan2)) maps to the plain (dx,dz)/L direction; normal is its perpendicular
      quad((w.x1 + w.x2) / 2 * S, (w.y1 + w.y2) / 2 * S, dx / L, dz / L, -dz / L, dx / L, len, off, sideY, qh, id++);
    } else if (w.kind === 'rect') {
      const cx = (w.x + w.w / 2) * S, cz = (w.y + w.h / 2) * S, ww = w.w * S, hh = w.h * S;
      const qh = Math.min(0.5, h * 0.42);
      if (ww >= hh && ww > 0.9) quad(cx, cz, 1, 0, 0, 1, ww, hh / 2 + 0.008, h * 0.4, qh, id++);
      else if (hh > 0.9) quad(cx, cz, 0, -1, 1, 0, hh, ww / 2 + 0.008, h * 0.4, qh, id++);
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aCell', new THREE.Float32BufferAttribute(cell, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: atlas() } },
    vertexShader: 'attribute vec4 aCell; varying vec2 vUv; varying vec4 vCell; void main(){ vUv = uv; vCell = aCell; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform sampler2D map; varying vec2 vUv; varying vec4 vCell; void main(){ vec2 f = fract(vUv) * 0.96 + 0.02; gl_FragColor = vec4(texture2D(map, vCell.xy + f * vCell.zw).rgb * 0.95, 1.0);\n#include <colorspace_fragment>\n}',
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const m = new THREE.Mesh(geo, mat); m.name = 'codewalls'; m.frustumCulled = false;
  return m;
}

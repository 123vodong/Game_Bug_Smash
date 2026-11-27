// VS Code "desk/IDE" plane for the Hunt view: static IDE chrome, a scrolling code layer, drifting code glyph fragments.
// Plane is 14.4 x 8.1 world units (16:9) centred on the 12.8 x 7.2 playfield. Canvas textures only (no assets).
import * as THREE from 'three';

const PW = 14.4, PH = 8.1, CW = 1536, CH = 864, S = PW / CW;
const GLYPHS = ['{', '}', ';', '/*', '*/', 'NULL', 'ERR', '0xFF', '0', '1', '++', '<>'];
const SNIPPETS = [
  '#include <stdio.h>', 'int main(void) {', '  Bug *b = find_bug(ticket);', '  if (b == NULL) return -1; // TODO: fix', '  while (deadline > 0) {',
  '    smash(b, 1);', '    deadline--;', '  }', '/* FIXME: works on my machine */', 'void *leak = malloc(4096); // never freed',
  'static const char *ERR = "NULL pointer";', 'if (race_condition) { sleep(rand()); }', 'return 0xFF; // ship it', 'git commit -m "final_final_v2"',
  'try { deploy(friday); } catch (e) { panic(); }', 'for (int i = 0; i < bugs; i++) { fix(i); }', '#define DEADLINE 0', 'struct Ticket { int id; bool open; };',
  '  // legacy code, do not touch', 'assert(prod != down);', 'bool heisenbug = !observed;', 'free(b); b = NULL;', 'printf("BUG %d squashed\\n", n);',
  'int race = thread_a + thread_b; // ???', '} // end of sprint', 'extern void pm_changes_requirements(void);', 'rollback(--version);',
];
const KW = /\b(int|void|if|while|for|return|static|const|struct|bool|try|catch|extern|define|include|char)\b/g;

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function ideTexture() {
  const c = cv(CW, CH), g = c.getContext('2d');
  g.fillStyle = '#16161a'; g.fillRect(0, 0, CW, CH);
  g.fillStyle = '#202023'; g.fillRect(0, 0, 54, CH);            // activity bar
  g.fillStyle = '#1b1b1f'; g.fillRect(54, 0, 206, CH);          // explorer
  g.fillStyle = '#26262b'; g.fillRect(260, 0, CW - 260, 36);    // tabs
  g.fillStyle = '#17171b'; g.fillRect(260, 0, 170, 36);
  g.fillStyle = '#0a6aa8'; g.fillRect(0, CH - 24, CW, 24);      // status bar
  g.fillStyle = '#1a1a1e'; g.fillRect(CW - 90, 36, 90, CH - 60); // minimap
  g.font = '12px Consolas, monospace'; g.textBaseline = 'middle';
  g.fillStyle = '#c8c8c8'; g.fillText('bug.c', 290, 18); g.fillStyle = '#7a7a82'; g.fillText('smash.c   deadline.h', 450, 18);
  g.fillStyle = '#8a8a92'; g.fillText('EXPLORER', 70, 20);
  const files = ['v bug-smash', '   main.c', '   bug.c', '   smash.c', '   deadline.h', '   TODO.md', '   .gitignore'];
  files.forEach((f, i) => { g.fillStyle = i === 2 ? '#e6e6e6' : '#9a9aa2'; g.fillText(f, 66, 52 + i * 20); });
  g.fillStyle = '#ffffff'; g.fillText('main*   0 errors   99+ warnings (bugs)      Ln 42, Col 7   UTF-8   C', 14, CH - 12);
  for (let i = 0; i < 5; i++) { g.fillStyle = i === 0 ? '#bdbdc5' : '#55555c'; g.fillRect(16, 24 + i * 52, 22, 22); }
  // line-number gutter
  g.fillStyle = '#16161a'; g.fillRect(260, 36, 56, CH - 60);
  return c;
}

function codeTexture(w, h) {
  const c = cv(w, h), g = c.getContext('2d'), LH = 22, n = Math.floor(h / LH);
  g.font = '15px Consolas, monospace'; g.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const y = i * LH + LH / 2, line = SNIPPETS[(i * 7 + (i >> 2)) % SNIPPETS.length];
    g.fillStyle = '#4a4a52'; g.fillText(String(i + 1).padStart(3, ' '), 6, y);
    let x = 66 + ((i % 5 === 3) ? 28 : 0);
    // cheap tokenizing: comments green, strings orange, keywords blue, rest grey
    const com = line.indexOf('//') >= 0 ? line.indexOf('//') : (line.startsWith('/*') ? 0 : -1);
    const head = com >= 0 ? line.slice(0, com) : line, tail = com >= 0 ? line.slice(com) : '';
    const parts = head.split(/("[^"]*")/);
    for (const p of parts) {
      if (!p) continue;
      if (p[0] === '"') { g.fillStyle = '#ce9178'; g.fillText(p, x, y); x += g.measureText(p).width; continue; }
      let last = 0, m; KW.lastIndex = 0;
      while ((m = KW.exec(p))) {
        const pre = p.slice(last, m.index); g.fillStyle = '#c8c8c8'; g.fillText(pre, x, y); x += g.measureText(pre).width;
        g.fillStyle = '#569cd6'; g.fillText(m[0], x, y); x += g.measureText(m[0]).width; last = m.index + m[0].length;
      }
      const rest = p.slice(last); g.fillStyle = /\d/.test(rest) ? '#b5cea8' : '#d4d4d4'; g.fillText(rest, x, y); x += g.measureText(rest).width;
    }
    if (tail) { g.fillStyle = '#6a9955'; g.fillText(tail, x, y); }
  }
  return c;
}

function glyphTexture(txt) {
  const c = cv(128, 64), g = c.getContext('2d');
  g.font = 'bold 44px Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#000'; g.shadowBlur = 6; g.fillStyle = Math.random() < 0.5 ? '#7ed957' : '#7ec8ff'; g.fillText(txt, 64, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createBackdrop({ scene, glyphCount = 16 }) {
  const disposables = [], group = new THREE.Group(); scene.add(group);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.7, 0.2, PH + 0.7), new THREE.MeshBasicMaterial({ color: 0x0b0c0f }));
  bezel.position.y = -0.11; group.add(bezel);

  const tex = new THREE.CanvasTexture(ideTexture()); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2; group.add(ground);

  const x0 = 316, x1 = CW - 90, y0 = 36, y1 = CH - 24, cw = x1 - x0, ch = y1 - y0, TH = 1024;
  const ctex = new THREE.CanvasTexture(codeTexture(cw, TH)); ctex.colorSpace = THREE.SRGBColorSpace;
  ctex.wrapT = THREE.RepeatWrapping; ctex.repeat.set(1, ch / TH);
  const code = new THREE.Mesh(new THREE.PlaneGeometry(cw * S, ch * S), new THREE.MeshBasicMaterial({ map: ctex, transparent: true, opacity: 0.85, depthWrite: false }));
  code.rotation.x = -Math.PI / 2; code.position.set(((x0 + x1) / 2) * S - PW / 2, 0.004, ((y0 + y1) / 2) * S - PH / 2); group.add(code);
  disposables.push(tex, ctex);

  // darken so gameplay reads on top (original used a 42% black veil)
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  veil.rotation.x = -Math.PI / 2; veil.position.y = 0.008; group.add(veil);

  const gtex = GLYPHS.map(glyphTexture); disposables.push(...gtex);
  const gl = [];
  for (let i = 0; i < glyphCount; i++) {
    const m = new THREE.SpriteMaterial({ map: gtex[i % gtex.length], transparent: true, opacity: 0.22, depthWrite: false });
    const s = new THREE.Sprite(m); s.scale.set(0.9, 0.45, 1);
    s.userData = { x: (Math.random() - 0.5) * 12, z: (Math.random() - 0.5) * 6.4, sp: 0.15 + Math.random() * 0.3, ph: Math.random() * 6.28 };
    s.position.set(s.userData.x, 0.12, s.userData.z); group.add(s); gl.push(s);
  }
  let t = 0;
  function update(dtMs) {
    const dt = Math.min(dtMs, 100) / 1000; t += dt;
    ctex.offset.y -= (14 * dt) / TH; // ~14 px/s upward scroll
    for (const s of gl) {
      const d = s.userData; d.z -= d.sp * dt; if (d.z < -3.5) { d.z = 3.5; d.x = (Math.random() - 0.5) * 12; }
      s.position.set(d.x + Math.sin(t * 0.6 + d.ph) * 0.25, 0.12, d.z);
    }
  }
  function dispose() {
    scene.remove(group);
    group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    for (const d of disposables) d.dispose();
  }
  return { update, dispose };
}

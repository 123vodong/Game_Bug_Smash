// Arena 3D view: VS Code code-file ground, level-scaled stickman devs, bug sprites, code-block obstacles, THE DEADLINE.
// Reads the adapter from arena/source.js each frame (diffing maps; no per-frame allocation in the hot path).
// World px -> scene units: x*S, y*S (ground is the XZ plane, world y maps to scene z), S = 0.01.
import * as THREE from 'three';
import { CODE_SNIPPETS, SYNTAX_HEX } from './snippets.js';
import { hatById } from '../../data/cosmetics.js';
import { qualityFromUrl, IS_MOBILE } from '../core/Quality.js';
import { AudioManager } from '../../core/AudioManager.js';

const sfx = (fn, ...a) => { try { AudioManager[fn] && AudioManager[fn](...a); } catch (_) { /* audio optional */ } };

export const S = 0.01;
const WORLD_W = 6000, WORLD_H = 3375;
const LEVEL_SCALES = [0.70, 0.88, 1.05, 1.22, 1.40, 1.58];       // mirrors MultiPlayScene
const LEVEL_XP = [0, 60, 600, 1800, 4500, 10000];                  // mirrors server XP curve
export const LEVEL_TITLES = ['Intern', 'Fresher', 'Junior', 'Middle', 'Senior', 'Super Senior'];
const BUG_SIZE = { 'bug-ladybug': 0.55, 'bug-null': 0.6, 'bug-race': 0.55, 'bug-beetle': 0.7, 'bug-toxic': 0.75, 'bug-scarab': 0.75, 'bug-robot': 0.9, 'bug-golden': 0.9, 'bug-dead': 0.6 };
const BUG_TEX = ['bug-beetle', 'bug-dead', 'bug-ladybug', 'bug-null', 'bug-race', 'bug-robot', 'bug-scarab', 'bug-toxic'];
const EVENT_TINT = { prod_down: 0xff6a6a, hackathon: 0xff7bff, deadline_boss: 0xff5a4a, friday_deploy: 0xffc060 };
const PRESET = { low: { pr: 0.85, ground: 1024 }, med: { pr: 1, ground: 1024 }, high: { pr: 1.5, ground: 2048 } };

export function levelScale(lv, xp) {
  const i = Math.max(0, Math.min(5, (lv | 0) - 1));
  if (i === 5) return LEVEL_SCALES[5];
  const t = Math.max(0, Math.min(1, ((xp | 0) - LEVEL_XP[i]) / Math.max(1, LEVEL_XP[i + 1] - LEVEL_XP[i])));
  return LEVEL_SCALES[i] + (LEVEL_SCALES[i + 1] - LEVEL_SCALES[i]) * t;
}
export const levelTitle = (lv) => LEVEL_TITLES[Math.max(0, Math.min(5, (lv | 0) - 1))];

const emojiCache = new Map();
function emojiTex(ch) {
  let t = emojiCache.get(ch); if (t) return t;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.font = '48px "Segoe UI Emoji","Apple Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 32, 36);
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; emojiCache.set(ch, t); return t;
}
function mkSprite(tex, size, cx = 0.5, cy = 0.5) {
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(m); s.scale.set(size, size, 1); s.center.set(cx, cy); return s;
}

export function createArenaView({ canvas, source, quality = qualityFromUrl() }) {
  const P = PRESET[quality] || PRESET.low;
  const gl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance', precision: IS_MOBILE ? 'mediump' : 'highp' });
  gl.setClearColor(0x0a0e16, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 120);
  const camT = new THREE.Vector3(30, 0, 17), camWant = new THREE.Vector3();
  const PITCH = 1.0;
  let camDist = 12, shake = 0, vw = 1, vh = 1, tNow = 0, frame = 0;
  const localPos = { x: WORLD_W / 2, y: WORLD_H / 2, has: false };

  // ---------- textures ----------
  const loader = new THREE.TextureLoader();
  const bugTex = {};
  for (const k of BUG_TEX) { const t = loader.load(new URL(`../../../assets/bugs/${k}.png`, import.meta.url).href); t.colorSpace = THREE.SRGBColorSpace; bugTex[k] = t; }
  const bossTex = loader.load(new URL('../../../assets/boss/deadline.png', import.meta.url).href); bossTex.colorSpace = THREE.SRGBColorSpace;

  // ---------- ground: dim code file tile + line-number gutter ----------
  const tileCv = document.createElement('canvas'); tileCv.width = P.ground; tileCv.height = P.ground >> 1;
  {
    const g = tileCv.getContext('2d'), W = tileCv.width, H = tileCv.height, k = W / 1024;
    g.fillStyle = '#12161f'; g.fillRect(0, 0, W, H);
    g.font = `${Math.round(11 * k)}px Consolas,"Courier New",monospace`; g.textBaseline = 'top';
    const pools = CODE_SNIPPETS['code-block'].concat(CODE_SNIPPETS.desk, CODE_SNIPPETS.whiteboard);
    let y = 2 * k, pi = 3;
    while (y < H) {
      const sn = pools[pi++ % pools.length];
      for (const line of sn) { let x = 14 * k; for (const tok of line) { g.fillStyle = tok.c; g.globalAlpha = 0.20; g.fillText(tok.t, x, y); x += g.measureText(tok.t).width; } y += 16 * k; if (y > H) break; }
      y += 16 * k;
    }
    g.globalAlpha = 1;
  }
  const tileTex = new THREE.CanvasTexture(tileCv); tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping; tileTex.colorSpace = THREE.SRGBColorSpace;
  tileTex.repeat.set(WORLD_W / 1500, WORLD_H / 750);
  const groundMat = new THREE.MeshBasicMaterial({ map: tileTex });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W * S, WORLD_H * S), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.set(WORLD_W * S / 2, 0, WORLD_H * S / 2); scene.add(ground);
  {
    const gc = document.createElement('canvas'); gc.width = 96; gc.height = 512;
    const g = gc.getContext('2d'); g.fillStyle = '#0c1018'; g.fillRect(0, 0, 96, 512); g.fillStyle = '#2b3347'; g.fillRect(93, 0, 3, 512);
    g.font = '13px Consolas,monospace'; g.fillStyle = '#58637d'; g.textAlign = 'right';
    for (let i = 0; i < 16; i++) g.fillText(String(i + 1), 78, 6 + i * 32 + 12);
    const gt = new THREE.CanvasTexture(gc); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(1, WORLD_H / 512);
    const gut = new THREE.Mesh(new THREE.PlaneGeometry(96 * S * 1.5, WORLD_H * S), new THREE.MeshBasicMaterial({ map: gt }));
    gut.rotation.x = -Math.PI / 2; gut.position.set(96 * S * 0.75, 0.01, WORLD_H * S / 2); scene.add(gut);
    // world border (red like a failing lint rule)
    const b = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(WORLD_W * S, WORLD_H * S)), new THREE.LineBasicMaterial({ color: 0xff5252 }));
    b.rotation.x = -Math.PI / 2; b.position.set(WORLD_W * S / 2, 0.02, WORLD_H * S / 2); scene.add(b);
  }

  // ---------- shared geometry / materials ----------
  const blobGeo = new THREE.CircleGeometry(0.28, 14); blobGeo.rotateX(-Math.PI / 2);
  const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
  const limbGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6); limbGeo.translate(0, -0.15, 0);
  const torsoGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.36, 6);
  const headGeo = new THREE.SphereGeometry(0.13, 12, 10);
  const lapGeo = new THREE.BoxGeometry(0.3, 0.2, 0.025); lapGeo.translate(0, 0.1, 0);
  const lapBase = new THREE.BoxGeometry(0.3, 0.02, 0.2);
  const shieldGeo = new THREE.SphereGeometry(0.62, 12, 8);
  const shieldMat = new THREE.MeshBasicMaterial({ color: 0x39c2ff, transparent: true, opacity: 0.28, depthWrite: false });
  const ringGeo = new THREE.RingGeometry(0.9, 1, 40); ringGeo.rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(1, 40); discGeo.rotateX(-Math.PI / 2);
  const slabGeo = new THREE.BoxGeometry(1, 1, 1); slabGeo.translate(0, 0.5, 0);
  const planeGeo = new THREE.PlaneGeometry(1, 1); planeGeo.rotateX(-Math.PI / 2);
  const hpBackMat = new THREE.SpriteMaterial({ color: 0x151a26, transparent: true, depthTest: false });
  const hpFillMat = new THREE.SpriteMaterial({ color: 0x59e08a, transparent: true, depthTest: false });
  const lapScreenOk = new THREE.MeshBasicMaterial({ color: 0x39c2ff }), lapScreenDead = new THREE.MeshBasicMaterial({ color: 0xff4040 }), lapGray = new THREE.MeshBasicMaterial({ color: 0x9aa3b8 });
  const headMat = new THREE.MeshBasicMaterial({ color: 0xf2e2cf });

  // ---------- players ----------
  const players = new Map();
  const hex = (n) => (n >>> 0) & 0xffffff;
  function makePlayer(sid, p) {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const mat = new THREE.MeshBasicMaterial({ color: hex(p.color) });
    const torso = new THREE.Mesh(torsoGeo, mat); torso.position.y = 0.55; body.add(torso);
    const head = new THREE.Mesh(headGeo, headMat); head.position.y = 0.86; body.add(head);
    const mk = (x, y) => { const g = new THREE.Group(); g.position.set(x, y, 0); const m = new THREE.Mesh(limbGeo, mat); g.add(m); body.add(g); return g; };
    const armL = mk(-0.1, 0.72), armR = mk(0.1, 0.72), legL = mk(-0.06, 0.37), legR = mk(0.06, 0.37);
    const lap = new THREE.Group(); lap.position.set(0, -0.28, 0.0); lap.rotation.x = -0.4; armR.add(lap);
    const lapScreen = new THREE.Mesh(lapGeo, lapScreenOk); lapScreen.position.set(0, 0.0, 0); lapScreen.rotation.x = -0.3; lap.add(lapScreen);
    lap.add(new THREE.Mesh(lapBase, lapGray));
    const blob = new THREE.Mesh(blobGeo, blobMat); blob.position.y = 0.012; root.add(blob);
    const shield = new THREE.Mesh(shieldGeo, shieldMat); shield.position.y = 0.55; shield.visible = false; root.add(shield);
    const label = mkSprite(null, 1, 0.5, 0); label.material.map = null; label.visible = true;
    const lcv = document.createElement('canvas'); lcv.width = 320; lcv.height = 80;
    const ltex = new THREE.CanvasTexture(lcv); ltex.colorSpace = THREE.SRGBColorSpace; label.material.map = ltex; label.material.needsUpdate = true; label.material.depthTest = false;
    label.scale.set(1.6, 0.4, 1); label.renderOrder = 10; root.add(label);
    const hat = mkSprite(null, 0.34, 0.5, 0); hat.visible = false; root.add(hat);
    const crown = mkSprite(emojiTex('👑'), 0.4, 0.5, 0); crown.visible = false; root.add(crown);
    const status = mkSprite(emojiTex('💫'), 0.34, 0.5, 0); status.visible = false; root.add(status);
    const hpB = new THREE.Sprite(hpBackMat), hpF = new THREE.Sprite(hpFillMat.clone()); hpB.center.set(0.5, 0.5); hpF.center.set(0, 0.5);
    hpB.renderOrder = 11; hpF.renderOrder = 12; root.add(hpB, hpF);
    const r = { sid, root, body, mat, torso, head, armL, armR, legL, legR, lap, lapScreen, shield, label, lcv, ltex, hat, hatId: '', crown, status, hpB, hpF, labelKey: '', seen: 0,
      x: p.x, y: p.y, lx: p.x, ly: p.y, face: 0, actSeq: p.action_seq | 0, actT: -9, actKind: '', brokenSeq: p.broken_seq | 0, scale: 1, hit: 0, ringT: -9 };
    scene.add(root); return r;
  }
  function paintLabel(r, p, isMe, bounty, away) {
    const g = r.lcv.getContext('2d'); g.clearRect(0, 0, 320, 80);
    const nm = (p.isBot ? '' : '') + (p.name || '?');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 28px "Segoe UI",system-ui,sans-serif';
    let w = g.measureText(nm).width; const tag = p.isBot ? 'BOT' : '';
    const tw = tag ? 56 : 0, total = w + tw, x0 = 160 - total / 2;
    g.fillStyle = 'rgba(8,12,22,0.72)'; g.beginPath(); g.roundRect(x0 - 10, 8, total + 20, 40, 10); g.fill();
    if (tag) { g.fillStyle = '#39c2ff'; g.beginPath(); g.roundRect(x0, 14, 48, 28, 6); g.fill(); g.fillStyle = '#06121f'; g.font = 'bold 20px monospace'; g.fillText(tag, x0 + 24, 29); }
    g.font = 'bold 28px "Segoe UI",system-ui,sans-serif'; g.fillStyle = isMe ? '#ffd23f' : p.broken ? '#ff8a8a' : '#ffffff'; g.fillText(nm, x0 + tw + w / 2, 29);
    g.font = '18px monospace'; g.fillStyle = away ? '#ff9800' : bounty ? '#ffd700' : '#9fb0d0';
    g.fillText(away ? '📶 lagging…' : bounty ? `TECH LEAD  +${bounty} XP bounty` : `Lv${p.level | 0} ${levelTitle(p.level)}`, 160, 64);
    r.ltex.needsUpdate = true;
  }
  const stN = { now: 0 };
  function updatePlayer(r, p, dt, isMe, st) {
    // position: local = predicted, remote = smoothed toward server
    let tx = p.x, ty = p.y;
    if (isMe && localPos.has) { tx = localPos.x; ty = localPos.y; r.x = tx; r.y = ty; }
    else { const k = Math.min(1, 8 * dt); r.x += (tx - r.x) * k; r.y += (ty - r.y) * k; }
    const mvx = r.x - r.lx, mvy = r.y - r.ly; r.lx = r.x; r.ly = r.y;
    const speed = Math.hypot(mvx, mvy) / Math.max(dt, 1e-3);
    const moving = speed > 30;
    if (moving) { const want = Math.atan2(mvx, mvy); let d = want - r.face; d = Math.atan2(Math.sin(d), Math.cos(d)); r.face += d * Math.min(1, 14 * dt); }
    const sc = levelScale(p.level, p.xp); r.scale += (sc - r.scale) * Math.min(1, 6 * dt);
    const s = r.scale; r.root.scale.setScalar(s); r.root.position.set(r.x * S, 0, r.y * S);
    r.body.rotation.y = r.face;
    // action triggers (server action_seq; local swings are triggered by input via view.localAct)
    if ((p.action_seq | 0) !== r.actSeq) { r.actSeq = p.action_seq | 0; if (!isMe) { r.actKind = p.action || 'smash'; r.actT = tNow; } }
    const broken = !!p.broken;
    const at = tNow - r.actT, acting = at >= 0 && at < 0.4;
    const swing = Math.sin(tNow * 13) * 0.9;
    r.armL.rotation.x = moving ? -swing : 0; r.legL.rotation.x = moving ? swing : 0; r.legR.rotation.x = moving ? -swing : 0;
    r.armR.rotation.x = moving ? swing * 0.6 - 0.3 : -0.4;
    let hop = 0;
    if (acting) {
      const u = at / 0.4, k = Math.sin(u * Math.PI);
      if (r.actKind === 'kick') { r.body.rotation.y += u * Math.PI * 4; r.legR.rotation.x = -1.5 * k; }
      else if (r.actKind === 'jump') { hop = 0.5 * k; }
      else if (r.actKind === 'parry') { r.armR.rotation.x = -1.4; r.armL.rotation.x = -1.4; }
      else { r.armR.rotation.x = -2.6 * k; }
    }
    if (broken) { r.body.rotation.z = 1.45; r.body.position.y = 0.12; r.armR.rotation.x = 0.2; r.legL.rotation.x = r.legR.rotation.x = 0; r.lapScreen.material = lapScreenDead; }
    else { r.body.rotation.z = 0; r.body.position.y = hop; r.lapScreen.material = lapScreenOk; }
    r.shield.visible = !!p.shielded && !broken;
    // overlays above the head
    const top = 1.02 * s;
    r.label.position.y = top + 0.34; r.label.scale.set(1.6, 0.4, 1);
    const hatId = p.hat || '';
    if (hatId !== r.hatId) { r.hatId = hatId; const em = hatId ? hatById(hatId).emoji : ''; if (em) { r.hat.material.map = emojiTex(em); r.hat.material.needsUpdate = true; r.hat.visible = true; } else r.hat.visible = false; }
    r.hat.position.y = top - 0.04;
    const crowned = st.crownSid === r.sid && !!r.sid;
    r.crown.visible = crowned; r.crown.position.y = top + (r.hat.visible ? 0.3 : 0.05); r.crown.scale.set(0.5, 0.5, 1);
    const stunned = (p.stunnedUntil || 0) > source.srvNow();
    r.status.visible = stunned || broken; if (r.status.visible) { r.status.material.map = emojiTex(broken ? '💥' : '💫'); r.status.position.y = top + 0.02; r.status.material.rotation = broken ? 0 : tNow * 3; }
    const bounty = crowned ? st.bounty : 0;
    const away = !isMe && !!p.away;
    const key = `${p.name}|${p.isBot ? 1 : 0}|${p.level}|${isMe ? 1 : 0}|${broken ? 1 : 0}|${bounty}|${away ? 1 : 0}`;
    if (key !== r.labelKey) { r.labelKey = key; paintLabel(r, p, isMe, bounty, away); }
    const hp = p.maxHealth ? p.health / p.maxHealth : 1, showHp = isMe || hp < 0.999;
    r.hpB.visible = r.hpF.visible = showHp && !broken;
    if (showHp) { r.hpB.position.set(0, top + 0.12, 0); r.hpB.scale.set(0.74, 0.1, 1); r.hpF.position.set(-0.35, top + 0.12, 0); r.hpF.scale.set(0.7 * Math.max(0.001, hp), 0.07, 1); r.hpF.material.color.setHex(hp > 0.5 ? 0x59e08a : hp > 0.25 ? 0xffd23f : 0xff5252); }
    r.blobS = s; r.blobWas = 0;
  }

  // ---------- bugs ----------
  const bugs = new Map();
  function makeBug(id, b) {
    const key = b.kind === 'bug-golden' ? 'bug-ladybug' : (bugTex[b.kind] ? b.kind : 'bug-null');
    const m = new THREE.SpriteMaterial({ map: bugTex[key], transparent: true, depthWrite: false });
    if (b.kind === 'bug-golden') m.color.setHex(0xffd700);
    const spr = new THREE.Sprite(m); spr.center.set(0.5, 0.12); scene.add(spr);
    return { id, spr, m, x: b.x, y: b.y, size: BUG_SIZE[b.kind] || 0.6, hitSeq: b.hit_seq | 0, flash: 0, flip: 1, seen: 0, golden: b.kind === 'bug-golden', ph: (id.length * 7.3) % 6 };
  }
  // ---------- pickups / clouds ----------
  const pickups = new Map(), clouds = new Map();
  const pickTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = 'rgba(89,224,138,0.28)'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill(); g.fillStyle = '#59e08a'; g.fillRect(25, 11, 14, 42); g.fillRect(11, 25, 42, 14); g.strokeStyle = '#eafff1'; g.lineWidth = 3; g.strokeRect(25, 11, 14, 42); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0x6bd45a, transparent: true, opacity: 0.32, depthWrite: false });

  // ---------- obstacles (floating syntax-coloured code on a dark slab) ----------
  const obstacles = new Map();
  const slabMat = new THREE.MeshBasicMaterial({ color: 0x1b2030 });
  function drawObstacle(o, ob, hitFlash) {
    const w = Math.max(32, ob.w | 0), h = Math.max(24, ob.h | 0), k = 1.4;
    const cv = o.cv; cv.width = Math.min(512, Math.round(w * k)); cv.height = Math.min(512, Math.round(h * k));
    const g = cv.getContext('2d'), sx = cv.width / w, fs = (h <= 90 ? 10 : 11) * sx, lh = fs + 3 * sx;
    g.fillStyle = hitFlash ? '#4a3a2a' : '#1e2230'; g.fillRect(0, 0, cv.width, cv.height);
    g.strokeStyle = '#3a4560'; g.lineWidth = 2; g.strokeRect(1, 1, cv.width - 2, cv.height - 2);
    g.font = `${fs}px Consolas,"Courier New",monospace`; g.textBaseline = 'top';
    let y = 4 * sx; for (const line of o.snippet) { let x = 5 * sx; for (const tok of line) { if (!tok.t) continue; g.fillStyle = tok.c || SYNTAX_HEX.default; g.fillText(tok.t, x, y); x += g.measureText(tok.t).width; } y += lh; }
    const dmg = ob.maxHp ? 1 - ob.hp / ob.maxHp : 0;
    if (dmg > 0.01) { g.strokeStyle = 'rgba(255,90,70,0.85)'; g.lineWidth = 1.5 * sx; const n = Math.ceil(dmg * 6); let sd = (o.seed | 0) || 7; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < n; i++) { g.beginPath(); let x = rnd() * cv.width, yy = rnd() * cv.height; g.moveTo(x, yy); for (let j = 0; j < 4; j++) { x += (rnd() - 0.5) * 40 * sx; yy += (rnd() - 0.2) * 30 * sx; g.lineTo(x, yy); } g.stroke(); } }
    o.tex.needsUpdate = true;
  }
  function makeObstacle(id, ob) {
    const pool = CODE_SNIPPETS[ob.kind] || CODE_SNIPPETS['code-block'];
    const snippet = pool[(Math.abs(ob.x * 31 + ob.y * 17) | 0) % pool.length];
    const cv = document.createElement('canvas'), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2;
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const top = new THREE.Mesh(planeGeo, mat), slab = new THREE.Mesh(slabGeo, slabMat);
    const w = ob.w * S, h = ob.h * S;
    slab.scale.set(w, 0.16, h); slab.position.set((ob.x + ob.w / 2) * S, 0, (ob.y + ob.h / 2) * S);
    top.scale.set(w, 1, h); top.position.set((ob.x + ob.w / 2) * S, 0.165, (ob.y + ob.h / 2) * S);
    scene.add(slab, top);
    const o = { id, slab, top, cv, tex, mat, snippet, seed: (Math.abs(ob.x * 13 + ob.y * 7) | 0) + 1, hp: ob.hp | 0, hitSeq: ob.hit_seq | 0, flashT: 0, seen: 0 };
    drawObstacle(o, ob, false); return o;
  }

  // ---------- boss ----------
  let boss = null;
  const bossSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: bossTex, transparent: true, depthWrite: false })); bossSpr.center.set(0.5, 0.04); bossSpr.scale.set(2.5, 3.05, 1); bossSpr.visible = false; scene.add(bossSpr);
  const bossAura = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.18, depthWrite: false })); bossAura.scale.setScalar(1.7); bossAura.visible = false; scene.add(bossAura);

  // ---------- pooled effects: rings (telegraph/shockwave), pops (text), splats ----------
  const rings = [];
  for (let i = 0; i < 14; i++) {
    const fill = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0, depthWrite: false }));
    const edge = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0, depthWrite: false }));
    fill.position.y = edge.position.y = 0.05; fill.visible = edge.visible = false; scene.add(fill, edge);
    rings.push({ fill, edge, t0: 0, ms: 0, r: 0, mode: 0, x: 0, z: 0, busy: false });
  }
  function ring(xpx, ypx, rpx, ms, mode, color) { // mode 0 = telegraph (fill grows), 1 = expanding wave, 2 = hit flash
    let q = null; for (const c of rings) if (!c.busy) { q = c; break; } if (!q) q = rings[0];
    q.busy = true; q.t0 = tNow; q.ms = ms / 1000; q.r = rpx * S; q.mode = mode; q.fill.position.x = q.edge.position.x = xpx * S; q.fill.position.z = q.edge.position.z = ypx * S;
    q.fill.material.color.setHex(color); q.edge.material.color.setHex(color); q.fill.visible = mode === 0; q.edge.visible = true; return q;
  }
  const POPS = 20, pops = [];
  for (let i = 0; i < POPS; i++) { const cv = document.createElement('canvas'); cv.width = 192; cv.height = 64; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })); sp.scale.set(1.5, 0.5, 1); sp.visible = false; sp.renderOrder = 20; scene.add(sp); pops.push({ sp, cv, tex, t0: 0, life: 0, x: 0, y: 0, busy: false }); }
  let popI = 0;
  function pop(text, color, xpx, ypx, big) {
    const q = pops[popI++ % POPS], g = q.cv.getContext('2d'); g.clearRect(0, 0, 192, 64); g.font = `bold ${big ? 40 : 32}px "Segoe UI",system-ui,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = '#0a0e16'; g.strokeText(text, 96, 32); g.fillStyle = color; g.fillText(text, 96, 32); q.tex.needsUpdate = true;
    q.t0 = tNow; q.life = 1.1; q.x = xpx; q.y = ypx; q.sp.visible = true; q.busy = true;
  }
  // splat when a bug dies (pooled ring reuse)
  function splat(xpx, ypx, golden) { ring(xpx, ypx, 46, 380, 1, golden ? 0xffd700 : 0x9be15d); }

  // lock-on ring
  const lockRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthWrite: false })); lockRing.visible = false; lockRing.position.y = 0.06; scene.add(lockRing);
  const lock = { kind: '', id: '' };
  // click/move marker
  const marker = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x39c2ff, transparent: true, opacity: 0.8, depthWrite: false })); marker.visible = false; marker.position.y = 0.05; marker.scale.setScalar(0.25); scene.add(marker);
  const markerState = { t0: -9 };

  // ---------- sync (diff maps each frame) ----------
  let evTint = 0xffffff; const tintCol = new THREE.Color(0xffffff), tintWant = new THREE.Color(0xffffff);
  const seenMark = (map, id, make, extra) => { let r = map.get(id); if (!r) { r = make(); map.set(id, r); } r.seen = frame; return r; };
  let st = null, dtS = 0.016, meId = '';
  const fP = (p, sid) => { let r = players.get(sid); if (!r) { r = makePlayer(sid, p); players.set(sid, r); r.x = r.lx = p.x; r.y = r.ly = p.y; } r.seen = frame; updatePlayer(r, p, dtS, sid === meId, st); };
  const fB = (b, id) => {
    let r = bugs.get(id); if (!r) { r = makeBug(id, b); bugs.set(id, r); } r.seen = frame;
    r.lastX = b.x; r.lastY = b.y;
    const vis = b.alive && !b.hidden; r.spr.visible = vis; if (!vis) return;
    const k = Math.min(1, 10 * dtS); const dx = b.x - r.x; r.x += dx * k; r.y += (b.y - r.y) * k;
    if (Math.abs(dx) > 0.4) r.flip = dx > 0 ? 1 : -1;
    const wob = 1 + Math.sin(tNow * 9 + r.ph) * 0.06; const sz = r.size;
    if ((b.hit_seq | 0) !== r.hitSeq) { r.hitSeq = b.hit_seq | 0; r.flash = 0.18; }
    r.flash = Math.max(0, r.flash - dtS);
    if (r.flash > 0) r.m.color.setHex(0xff6a6a); else r.m.color.setHex(r.golden ? 0xffd700 : 0xffffff);
    r.spr.scale.set(sz * wob * r.flip * (r.flash > 0 ? 1.15 : 1), sz * (2 - wob), 1);
    r.spr.position.set(r.x * S, 0.02 + Math.abs(Math.sin(tNow * 7 + r.ph)) * 0.03, r.y * S);
  };
  const fPick = (p, id) => {
    let r = pickups.get(id); if (!r) { const s = mkSprite(pickTex, 0.55, 0.5, 0.2); scene.add(s); r = { s, seen: 0 }; pickups.set(id, r); } r.seen = frame;
    r.s.visible = !!p.alive; r.s.position.set(p.x * S, 0.12 + Math.sin(tNow * 3 + p.x) * 0.06, p.y * S);
  };
  const fCloud = (c, id) => {
    let r = clouds.get(id); if (!r) { const m = new THREE.Mesh(discGeo, cloudMat), sk = mkSprite(emojiTex('☠️'), 0.5, 0.5, 0.1); scene.add(m, sk); r = { m, sk, seen: 0 }; clouds.set(id, r); } r.seen = frame;
    const left = (c.expiresAt - source.srvNow()) / 1800, sc = 0.7 * (0.9 + 0.1 * Math.sin(tNow * 8)) * Math.min(1, Math.max(0.2, left + 0.4));
    r.m.scale.setScalar(sc); r.m.position.set(c.x * S, 0.04, c.y * S); r.sk.position.set(c.x * S, 0.15, c.y * S);
  };
  const fObs = (ob, id) => {
    let r = obstacles.get(id); if (!r) { r = makeObstacle(id, ob); obstacles.set(id, r); } r.seen = frame;
    if ((ob.hit_seq | 0) !== r.hitSeq || (ob.hp | 0) !== r.hp) { r.hitSeq = ob.hit_seq | 0; r.hp = ob.hp | 0; r.flashT = 0.15; drawObstacle(r, ob, true); }
    else if (r.flashT > 0) { r.flashT -= dtS; if (r.flashT <= 0) drawObstacle(r, ob, false); }
  };
  const fBoss = (b, id) => { boss = boss || {}; boss.id = id; boss.x = b.x; boss.y = b.y; boss.hp = b.hp; boss.maxHp = b.maxHp; boss.phase = b.phase; boss.alive = b.alive; boss.hitSeq = b.hit_seq | 0; };
  const sweep = (map, dispose) => { for (const [id, r] of map) if (r.seen !== frame) { dispose(r, id); map.delete(id); } };
  const disposeObj = (o) => { scene.remove(o); };

  function sync(dt) {
    dtS = dt; st = source.state(); meId = source.localId;
    frame++;
    st.players.forEach(fP); st.bugs.forEach(fB); st.pickups.forEach(fPick); st.clouds.forEach(fCloud); st.obstacles.forEach(fObs);
    boss = null; st.bosses.forEach(fBoss);
    sweep(players, (r) => { scene.remove(r.root); r.mat.dispose(); r.ltex.dispose(); r.label.material.dispose(); r.hat.material.dispose(); r.crown.material.dispose(); r.status.material.dispose(); r.hpF.material.dispose(); });
    sweep(bugs, (r) => { scene.remove(r.spr); r.m.dispose(); splat(r.lastX, r.lastY, r.golden); });
    sweep(pickups, (r) => { scene.remove(r.s); r.s.material.dispose(); });
    sweep(clouds, (r) => { scene.remove(r.m); scene.remove(r.sk); r.sk.material.dispose(); });
    sweep(obstacles, (r) => { scene.remove(r.slab); scene.remove(r.top); r.tex.dispose(); r.mat.dispose(); ring((r.slab.position.x) / S, (r.slab.position.z) / S, 60, 400, 1, 0x569cd6); });
    // boss
    if (boss && boss.alive) {
      bossSpr.visible = bossAura.visible = true;
      const bx = boss.x * S, bz = boss.y * S, enr = boss.phase >= 2;
      bossSpr.position.set(bx, 0.02 + Math.sin(tNow * (enr ? 6 : 3.5)) * 0.06, bz); bossAura.position.set(bx, 0.03, bz);
      bossSpr.material.color.setHex(enr ? 0xffb0b0 : 0xffffff); bossAura.material.opacity = 0.14 + 0.08 * Math.sin(tNow * (enr ? 8 : 4));
      if (boss.hitSeq !== (bossSpr.userData.hs | 0)) { bossSpr.userData.hs = boss.hitSeq; bossSpr.userData.flash = 0.12; }
      if (bossSpr.userData.flash > 0) { bossSpr.userData.flash -= dt; bossSpr.material.color.setHex(0xffffff); bossSpr.scale.set(2.65, 3.2, 1); } else bossSpr.scale.set(2.5, 3.05, 1);
    } else { bossSpr.visible = bossAura.visible = false; }
    // event tint on the ground (multiply)
    tintWant.setHex(EVENT_TINT[st.event] || 0xffffff); if (st.event && !EVENT_TINT[st.event]) tintWant.setHex(0xd8d0ff);
    tintCol.lerp(tintWant, Math.min(1, dt * 2)); groundMat.color.copy(tintCol);
  }

  function entityPos(kind, id, out) {
    if (kind === 'bug') { const b = st.bugs.get(id); if (!b || !b.alive || b.hidden) return null; out.x = b.x; out.y = b.y; return out; }
    if (kind === 'player') { const p = st.players.get(id); if (!p) return null; out.x = p.x; out.y = p.y; return out; }
    if (kind === 'boss') { if (!boss || boss.id !== id) return null; out.x = boss.x; out.y = boss.y; return out; }
    return null;
  }

  // ---------- picking ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), gplane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitV = new THREE.Vector3(), v3 = new THREE.Vector3();
  function pickGround(sx, sy, out) {
    ndc.set((sx / vw) * 2 - 1, -(sy / vh) * 2 + 1); ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(gplane, hitV)) return null;
    out.x = Math.max(0, Math.min(WORLD_W, hitV.x / S)); out.y = Math.max(0, Math.min(WORLD_H, hitV.z / S)); return out;
  }
  const pickOut = { kind: '', id: '', x: 0, y: 0, ok: false }, gTmp = { x: 0, y: 0 };
  /** Nearest targetable thing under a screen point: bug (55px) / other player (70px) / boss (150px). */
  function pickTarget(sx, sy, truce) {
    const g = pickGround(sx, sy, gTmp); if (!g) return null;
    let best = Infinity; pickOut.ok = false;
    st.bugs.forEach((b, id) => { if (!b.alive || b.hidden) return; const d = Math.hypot(b.x - g.x, b.y - g.y - 10) - 55; if (d < 0 && d < best) { best = d; pickOut.kind = 'bug'; pickOut.id = id; pickOut.x = b.x; pickOut.y = b.y; pickOut.ok = true; } });
    if (!truce) st.players.forEach((p, id) => { if (id === meId) return; const d = Math.hypot(p.x - g.x, p.y - g.y - 30) - 70; if (d < 0 && d < best) { best = d; pickOut.kind = 'player'; pickOut.id = id; pickOut.x = p.x; pickOut.y = p.y; pickOut.ok = true; } });
    if (boss && boss.alive) { const d = Math.hypot(boss.x - g.x, boss.y - g.y - 60) - 150; if (d < 0 && d < best) { best = d; pickOut.kind = 'boss'; pickOut.id = boss.id; pickOut.x = boss.x; pickOut.y = boss.y; pickOut.ok = true; } }
    pickOut.gx = g.x; pickOut.gy = g.y; return pickOut.ok ? pickOut : null;
  }
  const projOut = { x: 0, y: 0, visible: false };
  function project(wx, wy, out = projOut) {
    v3.set(wx * S, 0, wy * S).project(camera); out.x = (v3.x * 0.5 + 0.5) * vw; out.y = (-v3.y * 0.5 + 0.5) * vh; out.visible = v3.z < 1; return out;
  }

  // ---------- frame ----------
  function resize() {
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    vw = w; vh = h; gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * P.pr); gl.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    camDist = Math.max(11, Math.min(30, 13 / (0.728 * (w / h))));
  }
  function update(dt, nowMs) {
    tNow = nowMs / 1000; dt = Math.min(dt, 0.1);
    sync(dt);
    // camera follows local player, clamped to the world
    const wx = Math.max(6, Math.min(WORLD_W * S - 6, (localPos.has ? localPos.x : WORLD_W / 2) * S));
    const wz = Math.max(3, Math.min(WORLD_H * S - 3, (localPos.has ? localPos.y : WORLD_H / 2) * S));
    camWant.set(wx, 0, wz); camT.lerp(camWant, 1 - Math.exp(-dt * 9));
    shake = Math.max(0, shake - dt * 1.6);
    const sh = shake * shake * 0.5;
    camera.position.set(camT.x + (Math.random() - 0.5) * sh, Math.sin(PITCH) * camDist, camT.z + Math.cos(PITCH) * camDist + (Math.random() - 0.5) * sh);
    camera.lookAt(camT.x, 0, camT.z);
    // effects
    for (const q of rings) if (q.busy) {
      const u = (tNow - q.t0) / q.ms;
      if (u >= 1.0 && !(q.mode === 0 && u < 1.25)) { q.busy = false; q.fill.visible = q.edge.visible = false; continue; }
      if (q.mode === 0) { q.edge.scale.setScalar(q.r); q.fill.scale.setScalar(q.r * Math.min(1, u)); q.fill.material.opacity = 0.3; q.edge.material.opacity = 0.9; }
      else if (q.mode === 1) { q.edge.scale.setScalar(q.r * (0.3 + u)); q.edge.material.opacity = 0.8 * (1 - u); }
      else { q.edge.scale.setScalar(q.r); q.fill.visible = true; q.fill.scale.setScalar(q.r); q.fill.material.opacity = 0.5 * (1 - u); q.edge.material.opacity = 1 - u; }
    }
    for (const q of pops) if (q.busy) { const u = (tNow - q.t0) / q.life; if (u >= 1) { q.busy = false; q.sp.visible = false; continue; } q.sp.position.set(q.x * S, 0.9 + u * 0.9, q.y * S); q.sp.material.opacity = u < 0.7 ? 1 : (1 - u) / 0.3; }
    // lock ring
    const lp = lock.kind ? entityPos(lock.kind, lock.id, gTmp) : null;
    if (lp) { lockRing.visible = true; lockRing.position.set(lp.x * S, 0.06, lp.y * S); lockRing.scale.setScalar((lock.kind === 'boss' ? 1.6 : 0.55) * (1 + Math.sin(tNow * 8) * 0.06)); } else lockRing.visible = false;
    const mu = (tNow - markerState.t0) / 0.5; if (mu < 1) { marker.visible = true; marker.scale.setScalar(0.15 + mu * 0.35); marker.material.opacity = 0.8 * (1 - mu); } else marker.visible = false;
    gl.render(scene, camera);
  }

  // ---------- audio hooks ----------
  const sfxOffs = [
    source.on('kill', (m) => {
      sfx('bugKill');
      const c = m && (m.combo | 0);
      if (c === 3 || c === 5 || c === 10) sfx('combo', c >= 10 ? 3 : c >= 5 ? 2 : 1);
    }),
    source.on('pickup', () => sfx('skillPickup', 'buff')),
    source.on('reward', () => sfx('reward')),
    source.on('bossSlam', () => sfx('bossRoar')),
    source.on('bossSlamHit', () => sfx('slamImpact')),
    source.on('ko', () => sfx('failure')),
    source.on('brokenBy', () => sfx('failure')),
    source.on('announce', (m) => {
      if (!m || m.kind !== 'event') return;
      if (m.id === 'deadline_boss') sfx('bossRoar');
      else if (m.id === 'prod_down') sfx('alarm');
      else sfx('paChime');
    }),
  ];

  const api = {
    scene, camera, renderer: gl, localPos, lock, update, resize, pickGround, pickTarget, project, entityPos,
    get boss() { return boss; },
    get info() { return gl.info; },
    shake(a) { shake = Math.min(1.2, Math.max(shake, a)); },
    pop, ring,
    telegraph(m) { ring(m.x, m.y, m.r, m.ms || 900, 0, 0xff3030); },
    slamHit(m) { ring(m.x, m.y, m.r, 450, 2, 0xffffff); shake = Math.max(shake, 0.8); },
    shockwave(xpx, ypx, rpx, color = 0xffd23f) { ring(xpx, ypx, rpx, 450, 1, color); },
    moveMarker(x, y) { marker.position.x = x * S; marker.position.z = y * S; markerState.t0 = tNow; },
    /** local swing/skill pose for the local player (server echo only drives REMOTE players). */
    localAct(kind) { const r = players.get(meId); if (r) { r.actKind = kind; r.actT = tNow; } sfx(kind === 'smash' ? 'smashHit' : 'hit'); },
    dispose() {
      sfxOffs.forEach((f) => { try { f(); } catch (_) { /* ignore */ } });
      for (const r of players.values()) { try { r.hpF.material.dispose(); } catch (_) { /* ignore */ } }
      for (const t of Object.values(bugTex)) t.dispose();
      bossTex.dispose(); tileTex.dispose(); gl.dispose(); emojiCache.forEach((t) => t.dispose()); emojiCache.clear();
    },
  };
  resize();
  return api;
}

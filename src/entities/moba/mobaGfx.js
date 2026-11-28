// mobaGfx — shared look for the Team Mode ("Office Siege") battlefield views:
// fonts, colors, depths and the procedurally generated textures (no image files —
// everything here is drawn once into canvas textures and reused by every view).
import { TEAM_INFO } from '../../../shared/moba/rules.js';
import { fxAllowed } from '../../core/FxPrefs.js';
import { hatById } from '../../data/cosmetics.js';

export const FONT = 'Arial Black, sans-serif';
export const MONO = 'Consolas, monospace';

export const NEUTRAL = 0xe0b84a;          // jungle monsters / epics
export const ME_COLOR = 0xffd23f;         // gold — "this is you"
export const BAR = { me: 0x7ed957, ally: 0x39c2ff, enemy: 0xff5e5e, neutral: 0xffb74a };

// World depths. Floor layers sit at 0–2.5; world objects 3–41 (project rule);
// HUD 45–60 is screen-pinned and drawn by the HUD camera.
export const D = {
  floor: 0, grid: 0.3, jungle: 0.6, river: 1, glyphs: 1.3, base: 1.6, lanes: 1.8, pads: 2.2, decor: 2.5,
  ground: 3,          // indicators painted on the floor (range rings, telegraphs, target marks)
  entity: 10,         // + y/300 → 10..30 (y-sorted units, champions, structures)
  fx: 33, fxTop: 38, numbers: 40,
};
export const depthAt = (y) => D.entity + Math.max(0, Math.min(6000, y)) / 300;

export const teamColor = (team) => (TEAM_INFO[team] ? TEAM_INFO[team].color : NEUTRAL);
export const teamCss = (team) => (TEAM_INFO[team] ? TEAM_INFO[team].css : '#e0b84a');
/** 'ally' | 'enemy' | 'neutral' relative to the local player's team. */
export function relation(team, myTeam) {
  if (!TEAM_INFO[team]) return 'neutral';
  return team === myTeam ? 'ally' : 'enemy';
}
export const css = (n) => '#' + ((n >>> 0) & 0xffffff).toString(16).padStart(6, '0');
/** Lighten (amt > 0) or darken (amt < 0) a 0xRRGGBB color. */
export function shade(color, amt) {
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return (f((color >> 16) & 255) << 16) | (f((color >> 8) & 255) << 8) | f(color & 255);
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** Frame-rate independent exponential approach factor. */
export const approach = (dt, k) => 1 - Math.exp(-dt * k);
export const fmtTime = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const toArr = (a) => (!a ? [] : Array.isArray(a) ? a : Array.from(a));
/** 0xRRGGBB number or CSS string → CSS string (for canvas 2D). */
export const toCss = (c, dflt = '#888888') => (typeof c === 'number' && Number.isFinite(c) ? css(c) : (typeof c === 'string' && c ? c : dflt));

// ─────────────────────────── EP-10: calm settings + EP-11: hats ───────────────────────────
// settings { shake, flashes } via core/FxPrefs (cached reads;
// it also gates every Camera.shake / Camera.flash globally). Views ask before their own flashes.
const _calm = { shake: true, flashes: true };
export function calmPrefs() {
  _calm.shake = fxAllowed('shake'); _calm.flashes = fxAllowed('flashes');
  return _calm;
}
/** Camera shake that honours settings.shake. */
export function shakeCam(scene, ms, amt) {
  if (!calmPrefs().shake) return;
  try { scene?.cameras?.main?.shake(ms, amt); } catch (_) { /* camera gone */ }
}
/** Hat id (join option `hat` → TeamChamp.hat) → emoji ('' = none / unknown id). */
export function hatEmoji(id) {
  if (!id || typeof id !== 'string') return '';
  try { const h = hatById(id); return h && h.id === id ? h.emoji || '' : ''; } catch (_) { return ''; }
}

// ─────────────────────────── looks.js bridge ───────────────────────────
// src/entities/moba/looks.js (client-art, contract v2 §3.3) is loaded by
// TeamModeScene with a guarded dynamic import and handed over here, so the
// world views work (with built-in defaults) even if that module is missing.
export const LOOKS = { mod: null };
export function setLooks(mod) { LOOKS.mod = mod || null; }
/** looks.projectileKey(champId, slot) → an existing texture key, or null. */
export function projectileTex(scene, champId, slot) {
  try {
    const k = LOOKS.mod?.projectileKey?.(champId, slot);
    return k && scene.textures.exists(k) ? k : null;
  } catch (_) { return null; }
}

/** Furniture colors per wall `look` — merged under looks.js WALL_STYLE (art agent wins). */
export const DEFAULT_WALL_STYLE = {
  cubicle: { fill: 0x3b475f, top: 0x66779a, stroke: 0x0c1019 },
  desk:    { fill: 0x5b3c24, top: 0x9c6b42, stroke: 0x170d05 },
  rack:    { fill: 0x161b28, top: 0x2f3749, stroke: 0x04060a },
  copier:  { fill: 0x878e9b, top: 0xd3d8df, stroke: 0x262a31 },
  plant:   { fill: 0xa65530, top: 0x3fa34d, stroke: 0x14200d },
  cooler:  { fill: 0xd7dee7, top: 0x5fb8ff, stroke: 0x232c38 },
  sofa:    { fill: 0x6f2a35, top: 0xab4656, stroke: 0x240a10 },
  // v3 thin partitions (map.js WALLS kind 'seg'); looks.js WALL_STYLE may override.
  partition: { fill: 0xb9b2a4, top: 0x6c7280, stroke: 0x23262d, accent: 0xe6dfcf },
  cubicles:  { fill: 0x4f6488, top: 0xaab4c4, stroke: 0x141b28, accent: 0x7f95c4 },
  glass:     { fill: 0x7fd6ff, top: 0x9aa6b8, stroke: 0x1d2a3a, accent: 0xe8f8ff },
  shelf:     { fill: 0x7a4e2c, top: 0xa8743f, stroke: 0x24140a, accent: 0xffd23f },
};
/** Minimap / fallback color of a wall look (light, reads on the dark jungle). */
export function wallMapColor(look) {
  const st = wallStyle(look);
  return typeof st.top === 'number' ? st.top : 0x8a94a8;
}
export function wallStyle(look) {
  const base = DEFAULT_WALL_STYLE[look] || DEFAULT_WALL_STYLE.partition;
  let ext = null;
  try { ext = LOOKS.mod?.WALL_STYLE?.[look] || null; } catch (_) { ext = null; }
  return ext ? { ...base, ...ext } : base;
}

// ─────────────────────────── textures ───────────────────────────

function canvasTex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  draw(ctx, w, h, tex);
  tex.refresh();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 2.5D Oblique Cyber-Obelisk Tower (128×196), lit top-left → bottom-right. */
function drawTower(ctx, w, h, color) {
  const cx = w / 2;
  const col = css(color);
  const light = css(shade(color, 0.45));
  const mid = css(shade(color, -0.25));
  const dark = css(shade(color, -0.58));

  // 1. Directional cast shadow (top-left light → bottom-right shadow)
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.beginPath();
  ctx.ellipse(cx + 22, h - 18, 44, 18, 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. 2.5D Beveled Hexagonal Plinth Base
  const by = h - 22;
  ctx.fillStyle = '#151c29';
  ctx.beginPath();
  ctx.moveTo(cx - 42, by); ctx.lineTo(cx - 26, by + 16); ctx.lineTo(cx + 26, by + 16);
  ctx.lineTo(cx + 42, by); ctx.lineTo(cx + 30, by - 14); ctx.lineTo(cx - 30, by - 14);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#070a10'; ctx.lineWidth = 2.5; ctx.stroke();

  // Plinth top face (lifted by 12px for 2.5D depth)
  ctx.fillStyle = '#2a374f';
  ctx.beginPath();
  ctx.moveTo(cx - 38, by - 12); ctx.lineTo(cx - 22, by + 2); ctx.lineTo(cx + 22, by + 2);
  ctx.lineTo(cx + 38, by - 12); ctx.lineTo(cx + 26, by - 24); ctx.lineTo(cx - 26, by - 24);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();

  // 3. Tapered 3D Armored Obelisk Shaft (left lit face + right shaded face)
  const topY = 58, botY = by - 8;
  // Left lit face
  const gL = ctx.createLinearGradient(cx - 24, topY, cx, botY);
  gL.addColorStop(0, '#465878'); gL.addColorStop(1, '#263248');
  ctx.fillStyle = gL;
  ctx.beginPath();
  ctx.moveTo(cx - 16, topY); ctx.lineTo(cx, topY + 6); ctx.lineTo(cx, botY + 4); ctx.lineTo(cx - 24, botY - 4);
  ctx.closePath(); ctx.fill();
  // Right shaded face
  const gR = ctx.createLinearGradient(cx, topY, cx + 24, botY);
  gR.addColorStop(0, '#232e42'); gR.addColorStop(1, '#121824');
  ctx.fillStyle = gR;
  ctx.beginPath();
  ctx.moveTo(cx, topY + 6); ctx.lineTo(cx + 16, topY); ctx.lineTo(cx + 24, botY - 4); ctx.lineTo(cx, botY + 4);
  ctx.closePath(); ctx.fill();
  // Outer silhouette stroke
  ctx.strokeStyle = '#070a10'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx - 16, topY); ctx.lineTo(cx - 24, botY - 4); ctx.lineTo(cx, botY + 4);
  ctx.lineTo(cx + 24, botY - 4); ctx.lineTo(cx + 16, topY);
  ctx.stroke();

  // Horizontal armor collar rings
  for (const ry of [topY + 22, topY + 56, topY + 86]) {
    const rw = 16 + ((ry - topY) / (botY - topY)) * 8;
    ctx.strokeStyle = '#0d1320'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx - rw, ry); ctx.lineTo(cx, ry + 5); ctx.lineTo(cx + rw, ry); ctx.stroke();
    ctx.strokeStyle = mid; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - rw + 2, ry - 1); ctx.lineTo(cx, ry + 4); ctx.lineTo(cx + rw - 2, ry - 1); ctx.stroke();
  }

  // Glowing vertical energy conduit along front spine
  ctx.save();
  ctx.shadowColor = col; ctx.shadowBlur = 10;
  ctx.strokeStyle = light; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(cx, topY + 12); ctx.lineTo(cx, botY - 8); ctx.stroke();
  ctx.restore();

  // 4. Twin Armored Crown Fins cradling the Floating Energy Crystal
  ctx.fillStyle = '#384866'; ctx.strokeStyle = '#070a10'; ctx.lineWidth = 2;
  // Left fin
  ctx.beginPath(); ctx.moveTo(cx - 16, topY + 6); ctx.lineTo(cx - 28, topY - 20); ctx.lineTo(cx - 14, topY - 34); ctx.lineTo(cx - 10, topY - 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  // Right fin (darker)
  ctx.fillStyle = '#1e2738';
  ctx.beginPath(); ctx.moveTo(cx + 16, topY + 6); ctx.lineTo(cx + 28, topY - 20); ctx.lineTo(cx + 14, topY - 34); ctx.lineTo(cx + 10, topY - 6); ctx.closePath(); ctx.fill(); ctx.stroke();

  // 5. Floating Glowing Crystal Core (AoV turret energy core)
  const cy = topY - 24;
  ctx.save();
  ctx.shadowColor = col; ctx.shadowBlur = 16;
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 20); ctx.lineTo(cx + 12, cy); ctx.lineTo(cx, cy + 16); ctx.lineTo(cx - 12, cy);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 20); ctx.lineTo(cx + 12, cy); ctx.lineTo(cx, cy + 16); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(cx - 2, cy - 12); ctx.lineTo(cx - 7, cy - 1); ctx.lineTo(cx - 1, cy + 4); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** 2.5D Oblique Nexus Production Server Citadel (220×248). */
function drawCore(ctx, w, h, color) {
  const cx = w / 2, by = h - 28;
  const col = css(color);
  const light = css(shade(color, 0.48));
  const dark = css(shade(color, -0.55));

  // 1. Directional cast shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.46)';
  ctx.beginPath();
  ctx.ellipse(cx + 30, by + 6, 86, 30, 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Stepped 2.5D Hexagonal Citadel Dais
  const hex = (y, rx, ry, fill, stroke, lw = 2.5) => {
    ctx.beginPath();
    ctx.moveTo(cx - rx, y); ctx.lineTo(cx - rx * 0.55, y + ry); ctx.lineTo(cx + rx * 0.55, y + ry);
    ctx.lineTo(cx + rx, y); ctx.lineTo(cx + rx * 0.55, y - ry); ctx.lineTo(cx - rx * 0.55, y - ry);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  };
  hex(by, 84, 30, '#121824', '#06080d', 3);
  hex(by - 14, 78, 26, '#26334a', col, 2.5);
  hex(by - 26, 62, 20, '#334361', '#0b0f18', 2);

  // 3. Three-Faceted 3D Server Citadel Body (left lit, center front, right dark)
  const topY = 92, botY = by - 22;
  // Left wing
  ctx.fillStyle = '#3a4b6b';
  ctx.beginPath(); ctx.moveTo(cx - 52, botY); ctx.lineTo(cx - 42, topY + 12); ctx.lineTo(cx - 18, topY + 22); ctx.lineTo(cx - 22, botY + 12); ctx.closePath(); ctx.fill();
  // Front core rack face
  const gF = ctx.createLinearGradient(cx, topY, cx, botY);
  gF.addColorStop(0, '#2a3752'); gF.addColorStop(1, '#141c2b');
  ctx.fillStyle = gF;
  ctx.beginPath(); ctx.moveTo(cx - 22, botY + 12); ctx.lineTo(cx - 18, topY + 22); ctx.lineTo(cx + 18, topY + 22); ctx.lineTo(cx + 22, botY + 12); ctx.closePath(); ctx.fill();
  // Right shaded wing
  ctx.fillStyle = '#182030';
  ctx.beginPath(); ctx.moveTo(cx + 22, botY + 12); ctx.lineTo(cx + 18, topY + 22); ctx.lineTo(cx + 42, topY + 12); ctx.lineTo(cx + 52, botY); ctx.closePath(); ctx.fill();
  // Crisp structural outline
  ctx.strokeStyle = '#070a10'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(cx - 52, botY); ctx.lineTo(cx - 42, topY + 12); ctx.lineTo(cx, topY + 2); ctx.lineTo(cx + 42, topY + 12); ctx.lineTo(cx + 52, botY); ctx.stroke();

  // Server rack vents + glowing data strips on front face
  for (let i = 0; i < 5; i++) {
    const ry = topY + 34 + i * 16;
    ctx.fillStyle = '#0b101a'; ctx.fillRect(cx - 15, ry, 30, 8);
    ctx.fillStyle = i % 2 === 0 ? col : light; ctx.fillRect(cx - 12, ry + 2.5, 24, 3);
  }

  // 4. Orbital Energy Rings + Suspended Nexus Crystal
  const cy = 62;
  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.globalAlpha = 0.7;
  ctx.beginPath(); ctx.ellipse(cx, cy + 4, 46, 15, -0.18, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = light; ctx.lineWidth = 2; ctx.globalAlpha = 0.55;
  ctx.beginPath(); ctx.ellipse(cx, cy + 4, 46, 15, 0.22, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.shadowColor = col; ctx.shadowBlur = 22;
  ctx.fillStyle = light;
  ctx.beginPath(); ctx.moveTo(cx, cy - 38); ctx.lineTo(cx + 22, cy); ctx.lineTo(cx, cy + 28); ctx.lineTo(cx - 22, cy); ctx.closePath(); ctx.fill();
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(cx, cy - 38); ctx.lineTo(cx + 22, cy); ctx.lineTo(cx, cy + 28); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(cx - 3, cy - 24); ctx.lineTo(cx - 13, cy - 2); ctx.lineTo(cx - 2, cy + 10); ctx.closePath(); ctx.fill();
  ctx.restore();
}
export const CORE_TEX_W = 220, CORE_TEX_H = 248;
export const CORE_BAYS = 6, CORE_BAY_Y0 = 120, CORE_BAY_STEP = 16;

/** Generates every texture the Team Mode views use (idempotent). */
export function ensureMobaTextures(scene) {
  // Soft round glow — projectiles, auras, light, particles.
  canvasTex(scene, 'moba-glow', 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  });
  // Solid disc with a soft rim — telegraph fills, flashes.
  canvasTex(scene, 'moba-disc', 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.86, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  });
  // Ring — shockwaves, shields.
  canvasTex(scene, 'moba-ring', 128, 128, (ctx) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.arc(64, 64, 57, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(64, 64, 57, 0, Math.PI * 2); ctx.stroke();
  });
  // Melee swing crescent (faces +x; origin ≈ (0.3, 0.5)).
  canvasTex(scene, 'moba-slash', 96, 96, (ctx) => {
    ctx.lineCap = 'round';
    for (const [lw, a] of [[12, 0.3], [6, 0.75], [2.5, 1]]) {
      ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(28, 48, 40, -1.05, 1.05); ctx.stroke();
    }
  });
  // 4-point spark.
  canvasTex(scene, 'moba-spark', 24, 24, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(12, 0); ctx.lineTo(14.5, 9.5); ctx.lineTo(24, 12); ctx.lineTo(14.5, 14.5);
    ctx.lineTo(12, 24); ctx.lineTo(9.5, 14.5); ctx.lineTo(0, 12); ctx.lineTo(9.5, 9.5);
    ctx.closePath(); ctx.fill();
  });
  // Heal plus.
  canvasTex(scene, 'moba-plus', 24, 24, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(9, 2, 6, 20); ctx.fillRect(2, 9, 20, 6);
  });
  // River "data stream" glyphs: frames '0' and '1' on one texture (batches as one draw).
  canvasTex(scene, 'moba-bits', 48, 30, (ctx, w, h, tex) => {
    ctx.font = 'bold 24px Consolas, monospace';
    ctx.fillStyle = '#bff0ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('0', 12, 15); ctx.fillText('1', 36, 15);
    tex.add('0', 0, 0, 0, 24, 30);
    tex.add('1', 0, 24, 0, 24, 30);
  });
  for (const team of ['blue', 'red']) {
    const col = TEAM_INFO[team].color;
    canvasTex(scene, `moba-tower-${team}`, 128, 196, (ctx, w, h) => drawTower(ctx, w, h, col));
    canvasTex(scene, `moba-core-${team}`, CORE_TEX_W, CORE_TEX_H, (ctx, w, h) => drawCore(ctx, w, h, col));
  }
}

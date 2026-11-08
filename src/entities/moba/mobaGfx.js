// mobaGfx — shared look for the Team Mode ("Office Siege") battlefield views:
// fonts, colors, depths and the procedurally generated textures (no image files —
// everything here is drawn once into canvas textures and reused by every view).
import { TEAM_INFO } from '../../../shared/moba/rules.js';

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

/** Brick "Firewall" pillar, 76×140, drawn in the team's color. */
function drawTower(ctx, w, h, color) {
  const dark = css(shade(color, -0.62)), mid = css(shade(color, -0.35)), brick = css(shade(color, -0.48));
  const light = css(shade(color, 0.35));
  // plinth
  ctx.fillStyle = '#1b2029'; roundRect(ctx, 3, h - 22, w - 6, 19, 5); ctx.fill();
  ctx.strokeStyle = '#07090d'; ctx.lineWidth = 2; ctx.stroke();
  const px = 12, pw = w - 24, top = 24, bottom = h - 20;
  ctx.fillStyle = dark; ctx.fillRect(px, top, pw, bottom - top);
  // bricks (staggered rows)
  const bh = 11, bw = 18;
  for (let row = 0, y = top; y < bottom; row++, y += bh) {
    const off = row % 2 ? 0 : -bw / 2;
    for (let x = px + off, i = 0; x < px + pw; x += bw, i++) {
      const bx = Math.max(px, x), bx2 = Math.min(px + pw, x + bw - 1);
      if (bx2 - bx <= 2) continue;
      ctx.fillStyle = (row + i) % 3 === 0 ? mid : brick;
      ctx.fillRect(bx + 1, y + 1, bx2 - bx - 1, Math.min(bh - 2, bottom - y - 2));
    }
  }
  // battlements
  ctx.fillStyle = mid;
  ctx.fillRect(px - 5, top - 4, pw + 10, 7);
  for (let i = 0; i < 3; i++) ctx.fillRect(px - 5 + i * ((pw + 10 - 12) / 2), top - 15, 12, 12);
  // glowing core slit
  const g = ctx.createLinearGradient(0, top + 26, 0, top + 62);
  g.addColorStop(0, light); g.addColorStop(1, css(color));
  ctx.fillStyle = g; ctx.fillRect(w / 2 - 4, top + 26, 8, 36);
  ctx.strokeStyle = '#07090d'; ctx.lineWidth = 2; ctx.strokeRect(px, top - 4, pw, bottom - top + 4);
}

/** "Production Server" rack, 140×190 (LEDs are separate blinking objects). */
function drawCore(ctx, w, h, color) {
  ctx.fillStyle = '#121722'; roundRect(ctx, 6, 8, w - 12, h - 14, 10); ctx.fill();
  ctx.strokeStyle = css(color); ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = css(shade(color, -0.5));
  ctx.fillRect(13, 18, 8, h - 34); ctx.fillRect(w - 21, 18, 8, h - 34);
  for (let i = 0; i < CORE_BAYS; i++) {
    const y = CORE_BAY_Y0 + i * CORE_BAY_STEP;
    ctx.fillStyle = '#232b3a'; ctx.fillRect(24, y, w - 48, 14);
    ctx.fillStyle = '#0b0f16'; ctx.fillRect(30, y + 5, w - 84, 4);
    ctx.fillStyle = '#38445a'; ctx.fillRect(24, y, w - 48, 2);
  }
  ctx.fillStyle = css(color); ctx.fillRect(18, 9, w - 36, 6);
  ctx.fillStyle = '#07090d'; ctx.fillRect(12, h - 9, w - 24, 5);
}
export const CORE_TEX_W = 140, CORE_TEX_H = 190;
export const CORE_BAYS = 8, CORE_BAY_Y0 = 24, CORE_BAY_STEP = 19;

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
    canvasTex(scene, `moba-tower-${team}`, 76, 140, (ctx, w, h) => drawTower(ctx, w, h, col));
    canvasTex(scene, `moba-core-${team}`, CORE_TEX_W, CORE_TEX_H, (ctx, w, h) => drawCore(ctx, w, h, col));
  }
}

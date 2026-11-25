// src/story2/bugs.js — Story Mode 2.0 enemies (team 'red' units of StorySim) and their art hooks.
//
// Stats are per unit, scaled against a level 3–6 champion (5v5 small camp ≈ 320 HP / 16 dmg):
//   hp · dmg · atkMs · range (> 200 = ranged) · speed · aggro (px: notices a champion) ·
//   leash (px from home: gives up + walks back healing) · gold · xp · size (render px)
// Nests never move or attack: they spawn `spawns` kinds every `everyMs` while a champion is within
// `aggro`, up to `cap` alive at once (StorySim._nestTick).
import { registerUnitKinds } from '../entities/moba/looks.js';

export const STORY_BUGS = {
  bug_null:    { sprite: 'bug-null',    name: 'Null Bug',       hp: 260,  dmg: 12, atkMs: 1300, range: 90,  speed: 220, aggro: 430, leash: 950,  gold: 12,  xp: 38,  size: 42 },
  bug_ladybug: { sprite: 'bug-ladybug', name: 'Ladybug',        hp: 200,  dmg: 10, atkMs: 1100, range: 80,  speed: 270, aggro: 470, leash: 950,  gold: 10,  xp: 32,  size: 40 },
  bug_beetle:  { sprite: 'bug-beetle',  name: 'Legacy Beetle',  hp: 620,  dmg: 22, atkMs: 1500, range: 95,  speed: 185, aggro: 400, leash: 900,  gold: 30,  xp: 75,  size: 54 },
  bug_race:    { sprite: 'bug-race',    name: 'Race Condition', hp: 380,  dmg: 24, atkMs: 1250, range: 330, speed: 240, aggro: 520, leash: 1000, gold: 26,  xp: 62,  size: 46 },
  nest:        { sprite: 'story-nest',  name: 'Bug Nest',       hp: 2400, dmg: 0,  atkMs: 1e9,  range: 0,   speed: 0,   aggro: 1100, leash: 0,   gold: 120, xp: 260, size: 92, external: true },
};

registerUnitKinds(STORY_BUGS);

/** Draws the procedural textures Story Mode units use (idempotent, once per page). */
export function ensureStoryTextures(scene) {
  if (scene.textures.exists('story-nest')) return;
  // 3:4 like the bug PNGs (UnitView sizes unregistered-meta sprites as w × 4/3 w).
  const W = 96, H = 128, tex = scene.textures.createCanvas('story-nest', W, H);
  if (!tex) return;
  const ctx = tex.getContext();
  const cx = W / 2, base = H - 18;
  // tangled cable mound
  const grd = ctx.createRadialGradient(cx, base - 30, 6, cx, base - 20, 52);
  grd.addColorStop(0, '#5b2a6e'); grd.addColorStop(1, '#22102b');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.ellipse(cx, base - 22, 44, 34, 0, Math.PI, 0); ctx.lineTo(cx + 44, base); ctx.lineTo(cx - 44, base); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#120818'; ctx.lineWidth = 3; ctx.stroke();
  const cables = ['#ff5e5e', '#39c2ff', '#ffd23f', '#7ed957', '#b084ff'];
  for (let i = 0; i < 9; i++) {
    ctx.strokeStyle = cables[i % cables.length]; ctx.lineWidth = 2.4; ctx.globalAlpha = 0.85;
    ctx.beginPath();
    const a = -Math.PI + (i / 8) * Math.PI;
    ctx.moveTo(cx + Math.cos(a) * 40, base - 6);
    ctx.bezierCurveTo(cx + Math.cos(a) * 10, base - 70 + i * 3, cx - Math.cos(a) * 26, base - 40, cx - Math.cos(a) * 36, base - 4);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // glowing eyes in the holes
  for (const [x, y] of [[cx - 16, base - 30], [cx + 12, base - 36], [cx - 2, base - 16], [cx + 24, base - 14]]) {
    ctx.fillStyle = '#000000'; ctx.beginPath(); ctx.ellipse(x, y, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = '#ff3b3b'; ctx.shadowBlur = 8; ctx.fillStyle = '#ff5e5e';
    ctx.beginPath(); ctx.arc(x - 2, y, 1.8, 0, Math.PI * 2); ctx.arc(x + 2.5, y, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
  // a warning sign stuck in the top
  ctx.fillStyle = '#8a8a8a'; ctx.fillRect(cx + 22, base - 86, 3, 40);
  ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(cx + 23.5, base - 100); ctx.lineTo(cx + 38, base - 76); ctx.lineTo(cx + 9, base - 76); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#000'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.fillText('!', cx + 23.5, base - 79);
  tex.refresh();
}

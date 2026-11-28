// Generates an interactive side-by-side LoL vs Bug Smash 5v5 map comparison report (docs/maps/map_preview.html)
// with real pixel-level IoU/Dice comparison and visual diff heatmap via tools/extract_lol_contours.py --score.
// Author: Duke Nguyen <duc.nguyen@onethesis.com>
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  MAP_W, MAP_H, LANES, LANE_WIDTH, RIVER, RIVER_PATH, CAMPS, EPIC_SPOTS, STRUCTURES, BASE_RADIUS, WALLS, BUSHES, distToSeg,
} from '../shared/moba/map.js';
import { wallDist } from '../shared/moba/nav.js';

const SAMPLES = 120;
let wallHits = 0;
let riverHits = 0;
let laneHits = 0;

for (let gy = 0; gy < SAMPLES; gy++) {
  const y = ((gy + 0.5) / SAMPLES) * MAP_H;
  for (let gx = 0; gx < SAMPLES; gx++) {
    const x = ((gx + 0.5) / SAMPLES) * MAP_W;
    let blocked = false;
    for (const w of WALLS) {
      if (wallDist(x, y, w) <= 0) { blocked = true; break; }
    }
    if (blocked) wallHits++;
    for (let i = 0; i < RIVER_PATH.length - 1; i++) {
      if (distToSeg(x, y, RIVER_PATH[i].x, RIVER_PATH[i].y, RIVER_PATH[i + 1].x, RIVER_PATH[i + 1].y) <= RIVER.width * 0.5) {
        riverHits++; break;
      }
    }
    for (const pts of Object.values(LANES)) {
      let onLane = false;
      for (let i = 0; i < pts.length - 1; i++) {
        if (distToSeg(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= LANE_WIDTH * 0.5) { onLane = true; break; }
      }
      if (onLane) { laneHits++; break; }
    }
  }
}

const totalSamples = SAMPLES * SAMPLES;
const wallPct = ((wallHits / totalSamples) * 100).toFixed(1);
const walkablePct = (100 - parseFloat(wallPct)).toFixed(1);
const riverPct = ((riverHits / totalSamples) * 100).toFixed(1);
const lanePct = ((laneHits / totalSamples) * 100).toFixed(1);
const polyCount = WALLS.filter((w) => w.kind === 'poly').length;
const totalVerts = WALLS.reduce((acc, w) => acc + (w.kind === 'poly' ? w.pts.length : 2), 0);

// Score directly against docs/maps/ref_lol_minimap.jpg and write docs/maps/compare_side_by_side.png
const scorePayload = JSON.stringify({
  walls: WALLS,
  lanes: Object.values(LANES),
  riverPath: RIVER_PATH,
  camps: CAMPS.map((c) => [c.x, c.y]),
  structures: STRUCTURES,
  epics: Object.values(EPIC_SPOTS).map((e) => [e.x, e.y]),
  bushes: BUSHES,
});
const scoreRaw = execFileSync('python', ['tools/extract_lol_contours.py', '--score'], { input: scorePayload, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const score = JSON.parse(scoreRaw);

const scale = 600 / MAP_W;
const P = (x, y) => `${(x * scale).toFixed(1)},${(y * scale).toFixed(1)}`;
const rPts = RIVER_PATH && RIVER_PATH.length >= 2 ? RIVER_PATH : [RIVER.from, RIVER.to];

const laneSvg = Object.values(LANES).map((pts) =>
  `<polyline points="${pts.map((p) => P(p.x, p.y)).join(' ')}" fill="none" stroke="#929b70" stroke-width="${(LANE_WIDTH * scale * 1.15).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`
).join('\n');

const bushSvg = BUSHES.map((b) => {
  if (b.kind === 'circle') return `<circle cx="${(b.x * scale).toFixed(1)}" cy="${(b.y * scale).toFixed(1)}" r="${(b.r * scale).toFixed(1)}" fill="#2ea846" fill-opacity="0.88" stroke="#8cf09a" stroke-width="1"/>`;
  return `<line x1="${(b.x1 * scale).toFixed(1)}" y1="${(b.y1 * scale).toFixed(1)}" x2="${(b.x2 * scale).toFixed(1)}" y2="${(b.y2 * scale).toFixed(1)}" stroke="#2ea846" stroke-opacity="0.88" stroke-width="${(b.w * scale).toFixed(1)}" stroke-linecap="round"/>`;
}).join('\n');

const wallSvg = WALLS.map((w) => {
  if (w.kind === 'poly') {
    const fill = w.baseWall ? '#2c3e48' : '#0a141b';
    const stroke = w.baseWall ? '#6898b0' : '#2e4a52';
    return `<polygon points="${w.pts.map(([x, y]) => P(x, y)).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/>`;
  }
  return '';
}).join('\n');

const structSvg = STRUCTURES.map((s) => {
  const fill = s.team === 'blue' ? '#39a8ff' : '#ff4d5e';
  const r = s.kind === 'core' ? 10 : 6;
  return `<circle cx="${(s.x * scale).toFixed(1)}" cy="${(s.y * scale).toFixed(1)}" r="${r}" fill="${fill}" stroke="#070d12" stroke-width="2"/>`;
}).join('\n');

const campSvg = CAMPS.map((c) => {
  const r = c.type === 'big' ? 5.2 : 3.4;
  return `<circle cx="${(c.x * scale).toFixed(1)}" cy="${(c.y * scale).toFixed(1)}" r="${r}" fill="#e8bc54" stroke="#18221c" stroke-width="1"/>`;
}).join('\n');

const epicSvg = Object.entries(EPIC_SPOTS).map(([k, e]) =>
  `<circle cx="${(e.x * scale).toFixed(1)}" cy="${(e.y * scale).toFixed(1)}" r="${(255 * scale).toFixed(1)}" fill="url(#riverCoveGrad)" stroke="${k === 'deadline' ? '#ff5a7a' : '#f2cd5c'}" stroke-width="1.8"/>`
).join('\n');

const mapSvgInner = `
  <defs>
    <linearGradient id="riverFadeGrad" x1="${(rPts[0].x * scale).toFixed(1)}" y1="${(rPts[0].y * scale).toFixed(1)}" x2="${(rPts[rPts.length - 1].x * scale).toFixed(1)}" y2="${(rPts[rPts.length - 1].y * scale).toFixed(1)}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#167da8" stop-opacity="0"/>
      <stop offset="14%" stop-color="#167da8" stop-opacity="0.96"/>
      <stop offset="44%" stop-color="#167da8" stop-opacity="0.92"/>
      <stop offset="50%" stop-color="#167da8" stop-opacity="0.22"/>
      <stop offset="56%" stop-color="#167da8" stop-opacity="0.92"/>
      <stop offset="86%" stop-color="#167da8" stop-opacity="0.96"/>
      <stop offset="100%" stop-color="#167da8" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="midFordGrad" x1="255" y1="345" x2="345" y2="255" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#929b70" stop-opacity="0"/>
      <stop offset="28%" stop-color="#929b70" stop-opacity="0.88"/>
      <stop offset="72%" stop-color="#929b70" stop-opacity="0.88"/>
      <stop offset="100%" stop-color="#929b70" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="riverCoveGrad">
      <stop offset="0%" stop-color="#228db8" stop-opacity="0.92"/>
      <stop offset="75%" stop-color="#167da8" stop-opacity="0.72"/>
      <stop offset="100%" stop-color="#167da8" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="600" height="600" fill="#6d7a55"/>
  <circle cx="57" cy="543" r="${(BASE_RADIUS * scale * 1.15).toFixed(1)}" fill="#6e94a2" stroke="#48a8df" stroke-width="2"/>
  <circle cx="543" cy="57" r="${(BASE_RADIUS * scale * 1.15).toFixed(1)}" fill="#85747c" stroke="#df5a68" stroke-width="2"/>
  ${laneSvg}
  <polyline points="${rPts.map((p) => P(p.x, p.y)).join(' ')}" fill="none" stroke="url(#riverFadeGrad)" stroke-width="${(RIVER.width * scale * 1.12).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>
  ${epicSvg}
  <line x1="255" y1="345" x2="345" y2="255" stroke="url(#midFordGrad)" stroke-width="${(LANE_WIDTH * scale * 1.05).toFixed(1)}" stroke-linecap="round"/>
  ${bushSvg}
  ${wallSvg}
  ${campSvg}
  ${structSvg}
`;

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Bug Smash 5v5 vs LoL Summoner's Rift — Pixel-IoU &amp; Visual Comparison</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; background: #0c1419; color: #e2edf2; font-family: system-ui, -apple-system, Segoe UI, sans-serif; }
    h1 { margin: 0 0 6px; font-size: 22px; color: #f0d788; }
    .sub { color: #95adb8; margin-bottom: 18px; font-size: 13px; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 18px; }
    .kpi { background: #132028; border: 1px solid #2b4452; border-radius: 8px; padding: 12px; }
    .kpi .val { font-size: 22px; font-weight: 700; color: #7ed957; }
    .kpi .lbl { font-size: 12px; color: #95adb8; margin-top: 2px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; margin-bottom: 20px; }
    .card { background: #132028; border: 1px solid #263c48; border-radius: 10px; padding: 14px; }
    .card h2 { margin: 0 0 10px; font-size: 15px; color: #9fd8eb; }
    .frame { position: relative; width: 100%; max-width: 440px; aspect-ratio: 1 / 1; margin: 0 auto; border: 2px solid #35505e; border-radius: 6px; overflow: hidden; background: #0a141b; }
    .frame img, .frame svg { display: block; width: 100%; height: 100%; object-fit: cover; }
    .overlay-wrap { position: relative; width: 100%; max-width: 480px; aspect-ratio: 1 / 1; margin: 0 auto; border: 2px solid #c89b3c; border-radius: 6px; overflow: hidden; }
    .overlay-wrap img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .overlay-top { position: absolute; inset: 0; overflow: hidden; }
    .overlay-top svg { width: 100%; height: 100%; }
    .controls { display: flex; gap: 16px; align-items: center; justify-content: center; margin-top: 10px; font-size: 13px; color: #c9dce4; flex-wrap: wrap; }
    input[type="range"] { width: 160px; accent-color: #3fbbe0; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid #243944; padding: 8px 10px; text-align: left; }
    th { color: #f0d788; font-weight: 600; background: #101b22; }
    .tag-ok { color: #7ed957; font-weight: 600; }
    .tag-diff { color: #ffd23f; font-weight: 600; }
    .ref3d { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: center; }
    .ref3d img { width: 100%; border-radius: 6px; border: 1px solid #2b4450; }
    @media (max-width: 900px) { .ref3d { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <h1>Bug Smash 5v5 vs Summoner's Rift — Pixel-IoU &amp; Visual Comparison</h1>
  <div class="sub">Generated live from <code>shared/moba/map.js</code> (${polyCount} rot180 organic cliff landmasses, ${totalVerts} vertices) &amp; <code>shared/moba/nav.js</code> — Author: Duke Nguyen</div>

  <div class="kpis">
    <div class="kpi"><div class="val">${score.blueHalfDice}%</div><div class="lbl">Blue-Half Wall Dice Match (IoU ${score.blueHalfIoU}%)</div></div>
    <div class="kpi"><div class="val">${score.fullDice}%</div><div class="lbl">Full Interior Wall Dice (IoU ${score.fullIoU}%)</div></div>
    <div class="kpi"><div class="val">${score.bsDensity}% vs ${score.lolDensity}%</div><div class="lbl">Playable Interior Wall Density (BS vs LoL)</div></div>
    <div class="kpi"><div class="val">0.60u &lt; 1.25u &lt; 2.8u</div><div class="lbl">3D Scale: Cliff &lt; Champion &lt; Tower</div></div>
  </div>

  <div class="grid">
    <div class="card">
      <h2>1. LoL Summoner's Rift Minimap (Reference)</h2>
      <div class="frame"><img src="./ref_lol_minimap.jpg" alt="LoL Summoner's Rift Minimap"/></div>
    </div>
    <div class="card">
      <h2>2. Bug Smash 5v5 — Curved River &amp; LoL Cliffs</h2>
      <div class="frame"><svg viewBox="0 0 600 600">${mapSvgInner}</svg></div>
    </div>
    <div class="card">
      <h2>3. Pixel Diff Heatmap (Green=Match, Red=Missing, Blue=Extra)</h2>
      <div class="frame"><img src="data:image/png;base64,${score.heatmapB64}" alt="Pixel Diff Heatmap"/></div>
    </div>
  </div>

  <div class="card" style="margin-bottom: 20px;">
    <h2>4. Interactive Wipe &amp; Opacity Overlay (1:1 Alignment Check)</h2>
    <div class="overlay-wrap">
      <img src="./ref_lol_minimap.jpg" alt="LoL Base"/>
      <div class="overlay-top" id="wipeLayer"><svg viewBox="0 0 600 600" id="bsOverlay">${mapSvgInner}</svg></div>
    </div>
    <div class="controls">
      <label>Horizontal Wipe: <input id="wipe" type="range" min="0" max="100" value="50"/> <span id="wipeVal">50%</span></label>
      <label>Bug Smash Opacity: <input id="op" type="range" min="15" max="100" value="85"/> <span id="opVal">85%</span></label>
    </div>
  </div>

  <div class="card" style="margin-bottom: 20px;">
    <h2>4b. Bush Positions &amp; Baron/Dragon Pit Comparison (Wall-Hugging Bushes + Alcoves)</h2>
    <div class="grid">
      <div class="card" style="padding:10px;">
        <h2 style="font-size:13px;">LoL Reference Bush Positions</h2>
        <div class="frame"><img src="./ref_lol_bushes.jpg" alt="LoL Bush Reference Map"/></div>
      </div>
      <div class="card" style="padding:10px;">
        <h2 style="font-size:13px;">Bug Smash Live Bushes, Alcove Pillars &amp; Pit Horseshoes</h2>
        <div class="frame"><svg viewBox="0 0 600 600">${mapSvgInner}</svg></div>
      </div>
      <div class="card" style="padding:10px;">
        <h2 style="font-size:13px;">LoL Baron Pit C-Cliff &amp; Bank Grass Reference</h2>
        <div class="frame"><img src="./ref_lol_baron_pit.jpg" alt="LoL Baron Pit Reference"/></div>
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom: 20px;">
    <h2>5. 3D Jungle Cliffs, Camp Alcoves &amp; Surface Relief Comparison</h2>
    <div class="ref3d">
      <div>
        <div style="font-size:12px;color:#9fd8eb;margin-bottom:6px;font-weight:600;">LoL Reference (Sloped Rock Facets, Crevices, Pine Clusters, Lanterns &amp; Camps #1-#5)</div>
        <img src="./ref_lol_jungle_3d.jpg" alt="LoL 3D Jungle Cliffs Reference"/>
      </div>
      <div>
        <div style="font-size:12px;color:#9fd8eb;margin-bottom:6px;font-weight:600;">Bug Smash 3D Sculpted Surface (Multi-octave Rock Crevices, Base Rampart &amp; Camp Pockets #2-#5)</div>
        <img src="./preview_3d_surface.png" alt="Bug Smash 3D Sculpted Surface Preview"/>
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom: 20px;">
    <h2>6. 3D Elevation Overview &amp; 5-Stratum Cross-Section</h2>
    <div class="ref3d">
      <img src="./ref_lol_3d.jpg" alt="LoL 3D Rift Overview"/>
      <svg viewBox="0 0 560 280" style="width:100%;background:#0e181e;border-radius:6px;border:1px solid #2b4450;">
        <text x="16" y="24" fill="#f0d788" font-size="13" font-weight="bold">Scale &amp; Strata: Cliffs (0.58–0.78u) &lt; Champions (~1.25u) &lt; Core (2.1u) &lt; Towers (2.8u)</text>
        <rect x="20" y="210" width="520" height="44" fill="#18272e" rx="4"/>
        <text x="30" y="236" fill="#89a4b0" font-size="11">L0_abyss (y = -2.75 .. -0.35): Outer retaining cliff &amp; misty border drop</text>
        <rect x="210" y="162" width="140" height="44" fill="#167da8" rx="4"/>
        <text x="220" y="188" fill="#e6f7ff" font-size="11">L1_river_basin (-0.32)</text>
        <rect x="20" y="116" width="520" height="40" fill="#6d7a55" rx="4"/>
        <text x="30" y="140" fill="#101a12" font-size="11" font-weight="bold">L2_walkable_plateau (y = 0.0): Sunlit lanes (#929b70), jungle corridors, Mid ford</text>
        <rect x="40" y="72" width="480" height="38" fill="#3d4d52" rx="4"/>
        <text x="50" y="95" fill="#d9ebef" font-size="11">L3_cliffs_and_ramparts (y = -0.06 .. 0.72): Sloped faceted rock + 3-gate base ramparts</text>
        <rect x="65" y="34" width="430" height="32" fill="#4c743e" rx="4"/>
        <text x="75" y="54" fill="#eefbe6" font-size="11">L4_moss_and_crags (y = 0.45 .. 1.05): Crevice-carved moss patches, boulders, pines, braziers</text>
      </svg>
    </div>
  </div>

  <div class="card">
    <h2>7. Parity &amp; Remaining Constraints</h2>
    <table>
      <thead>
        <tr><th>Dimension</th><th>Bug Smash Current</th><th>LoL Reference</th><th>Status / Note</th></tr>
      </thead>
      <tbody>
        <tr><td>Symmetry Model</td><td>180-deg rotational symmetry (full Blue half extracted &amp; rotated)</td><td>180-deg rotational symmetry (71.1% self-Dice)</td><td class="tag-ok">Aligned</td></tr>
        <tr><td>Playable Wall Silhouette</td><td>${polyCount} organic landmasses, Blue-Half Dice ${score.blueHalfDice}% / Full Dice ${score.fullDice}% (${score.bsDensity}% area)</td><td>26.6% playable interior wall density</td><td class="tag-ok">Aligned (constrained only by nav_check min gap 150px)</td></tr>
        <tr><td>River Geometry</td><td>Continuous curved S-path (RIVER_PATH) fading smoothly at NW/SE corners &amp; Mid ford + epic coves</td><td>Continuous curved river with corner blends &amp; soft mid ford</td><td class="tag-ok">Aligned</td></tr>
        <tr><td>3D Wall vs Unit Scale</td><td>Cliffs 0.58–0.74u, compact pines &lt;= 1.05u, Champion ~1.25u, Core 2.1u, Tower 2.8u</td><td>Cliffs lower than champions &amp; turrets</td><td class="tag-ok">Fixed</td></tr>
        <tr><td>Camp &amp; Pit Constraints</td><td>6 natural LoL camp pockets; 2 symmetric epic spots on river diagonal (Deadline &amp; Golden)</td><td>Baron/Dragon off-river enclosed pits</td><td class="tag-diff">Kept symmetric epic spots &amp; Bug Smash props/codewalls for fairness and theme</td></tr>
      </tbody>
    </table>
  </div>

  <script>
    const wipe = document.getElementById('wipe');
    const op = document.getElementById('op');
    const wipeLayer = document.getElementById('wipeLayer');
    const bsOverlay = document.getElementById('bsOverlay');
    const wipeVal = document.getElementById('wipeVal');
    const opVal = document.getElementById('opVal');
    const sync = () => {
      const w = Number(wipe.value);
      const o = Number(op.value) / 100;
      wipeVal.textContent = w + '%';
      opVal.textContent = Math.round(o * 100) + '%';
      wipeLayer.style.clipPath = \`inset(0 \${100 - w}% 0 0)\`;
      bsOverlay.style.opacity = String(o);
    };
    wipe.addEventListener('input', sync);
    op.addEventListener('input', sync);
    sync();
  </script>
</body>
</html>`;

fs.writeFileSync(new URL('../docs/maps/map_preview.html', import.meta.url), html, 'utf8');

console.log('=== BUG SMASH 5v5 vs LOL SUMMONER\'S RIFT DIFF ===');
console.log(`Polygons: ${polyCount} (${totalVerts} vertices) · Playable Wall Density: BS ${score.bsDensity}% vs LoL ${score.lolDensity}%`);
console.log(`Pixel Match: Blue-Half Dice=${score.blueHalfDice}% (IoU ${score.blueHalfIoU}%) | Full Dice=${score.fullDice}% (IoU ${score.fullIoU}%)`);
console.log(`Area split (overall 6000x6000): Walls ${wallPct}% | Walkable ${walkablePct}% | River ${riverPct}% | Lanes ${lanePct}%`);
console.log('Saved interactive report: docs/maps/map_preview.html & docs/maps/compare_side_by_side.png');

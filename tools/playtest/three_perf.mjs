// Perf probe for the Three.js renderer: draw calls / triangles / CPU ms per renderer.frame() during a brawl.
//   GAME_URL=http://localhost:2567/ node three_perf.mjs <outDir> [extraQuery e.g. "&q=high"]
import { chromium } from 'file:///C:/Users/ADLV/AppData/Local/ms-playwright-go/1.57.0/package/index.mjs';
import fs from 'fs';
import path from 'path';
const outDir = process.argv[2] || 'out/perf'; const extra = process.argv[3] || '';
fs.mkdirSync(outDir, { recursive: true });
const URL = (process.env.GAME_URL || 'http://localhost:2567/').replace(/\/?$/, '/');
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: process.env.TOUCH === '1', isMobile: process.env.TOUCH === '1' });
const page = await ctx.newPage(); const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|404/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
await page.goto(`${URL}?scene=team&champ=pixel&offline=1&sandbox=1&renderer=3d${extra}`, { waitUntil: 'load' });
const t0 = Date.now(); while (Date.now() - t0 < 45000) { if (await page.evaluate(() => !!(window.__three && window.__three.source.state().phase === 'playing')).catch(() => false)) break; await page.waitForTimeout(200); }
await page.waitForTimeout(1500);
await page.evaluate(() => { const r = window.__three.renderer, f = r.frame; window.__perf = { n: 0, ms: 0, max: 0, calls: 0, tris: 0 }; r.frame = (d) => { const a = performance.now(); f(d); const e = performance.now() - a; const p = window.__perf; p.n++; p.ms += e; p.max = Math.max(p.max, e); p.calls = Math.max(p.calls, r.info.render.calls); p.tris = Math.max(p.tris, r.info.render.triangles); }; window.__three.source.sim.debug('brawl', 2100, 2500); });
await page.waitForTimeout(8000);
const res = await page.evaluate(() => { const p = window.__perf, r = window.__three.renderer; return { frames: p.n, avgMs: +(p.ms / Math.max(1, p.n)).toFixed(2), maxMs: +p.max.toFixed(1), calls: p.calls, tris: p.tris, quality: r.quality.level, pr: r.quality.settings.pr, canvas: [r.gl.domElement.width, r.gl.domElement.height] }; });
console.log(JSON.stringify(res));
await page.screenshot({ path: path.join(outDir, 'perf.png') });
console.log(errors.length ? errors.map((e) => '[PAGEERROR] ' + e).join('\n') : 'no page errors');
await browser.close();

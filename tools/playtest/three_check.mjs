// Three.js renderer smoke check (P1 gate, breakdown section 4). Real client in headless Chrome/Edge, no server match.
//   GAME_URL=http://localhost:2650/ node tools/playtest/three_check.mjs <outDir>
// Expects the boot (C1/C7) to expose  window.__three = { renderer, source }  where renderer is the
// createRenderer() result and source the SimSource (offline kind, source.sim = OfflineSim).
// Checks: reaches 'playing'; move order walks the champion (never inside a wall); Q/W/E/R go on cooldown;
// 6 s brawl with 0 page errors and renderer.info.render.calls < 600; screenshots.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const outDir = process.argv[2] || 'out/three';
fs.mkdirSync(outDir, { recursive: true });
const URL = (process.env.GAME_URL || 'http://localhost:2650/').replace(/\/?$/, '/');
const CHAMP = process.env.CHAMP || 'oncall';
const executablePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
].filter(Boolean).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath, args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => {
  try {
    const k = 'bugSmashHunter.save.v1';
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.playerName) { s.playerName = 'Three Tester'; s.career = { ...(s.career || {}), teamGames: 5, teamWins: 2 }; s.flags = { ...(s.flags || {}), tipsSiege: true }; localStorage.setItem(k, JSON.stringify(s)); }
  } catch (_) { /* fresh */ }
});
const errors = [], results = [];
const T0 = Date.now();
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}  [${Math.round((Date.now() - T0) / 1000)}s]`); };
const ev = (page, js, ms = 5000) => Promise.race([
  page.evaluate(`(() => { try { const v = (${js}); return (v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype) ? true : v; } catch (e) { return 'ERR ' + e.message; } })()`),
  new Promise((res) => setTimeout(() => res('TIMEOUT'), ms)),
]);
const until = async (page, js, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await ev(page, `!!(${js})`)) === true) return true; await page.waitForTimeout(150); } return false; };
const json = async (page, js) => { const v = await ev(page, `JSON.stringify(${js})`); try { return JSON.parse(v); } catch (_) { return { err: v }; } };

const A = await ctx.newPage();
A.on('pageerror', (e) => errors.push(e.message));
A.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|404/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
await A.goto(`${URL}?scene=team&offline=1&renderer=3d&champ=${CHAMP}&name=ThreeTester`, { waitUntil: 'load' });
const SRC = 'window.__three.source', SIM = `${SRC}.sim`, ME = `${SRC}.state().champions.get(${SRC}.localId)`;
const playing = await until(A, `window.__three && ${SRC}.state().phase === 'playing'`, 45000);
check('3d: reaches playing', playing);
await A.waitForTimeout(800);

const p0 = await json(A, `(() => { const m = ${ME}; return { x: m.x, y: m.y }; })()`);
await ev(A, `${SRC}.send('order', { type: 'move', x: 2400, y: 3600 })`);
await A.waitForTimeout(4000);
const p1 = await json(A, `(() => { const m = ${ME}; return { x: m.x, y: m.y, blocked: ${SRC}.world.nav.isBlocked(m.x, m.y, 24) }; })()`);
const moved = Math.hypot((p1.x || 0) - (p0.x || 0), (p1.y || 0) - (p0.y || 0));
check('3d: move order walks the champion', moved > 300 && p1.blocked === false, `moved ${Math.round(moved)} px, inside a wall ${p1.blocked}`);

await ev(A, `${SIM}.debug('level', 11)`);
await ev(A, `${SRC}.send('upgrade', { slot: 'r' })`); // ult must be learned (rank R) before it can be cast
await A.waitForTimeout(300);
const cds = [];
for (const slot of ['q', 'w', 'e', 'r']) {
  await ev(A, `(() => { const m = ${ME}; ${SIM}.debug('cast', { slot: '${slot}', x: m.x + 260, y: m.y - 260 }); })()`);
  await A.waitForTimeout(250);
  cds.push(await ev(A, `${ME}['cd${slot.toUpperCase()}'] > Date.now()`));
}
check('3d: Q W E R casts go on cooldown', cds.every((v) => v === true), JSON.stringify(cds));
await A.screenshot({ path: path.join(outDir, 'three_cast.png') });

await ev(A, `${SIM}.debug('brawl', 2100, 2500)`);
let maxCalls = 0;
for (let i = 0; i < 12; i++) { await A.waitForTimeout(500); const c = await ev(A, 'window.__three.renderer.info.render.calls'); if (typeof c === 'number') maxCalls = Math.max(maxCalls, c); }
const brawl = await json(A, `(() => { const st = ${SIM}.state; let hurt = 0, dead = 0; st.champions.forEach((c) => { if (c.dead) dead++; else if (c.hp < c.maxHp) hurt++; }); return { hurt, dead, phase: st.phase }; })()`);
check('3d: brawl deals damage', (brawl.hurt || 0) + (brawl.dead || 0) >= 2, JSON.stringify(brawl));
check('3d: draw calls < 600', maxCalls > 0 && maxCalls < 600, `max ${maxCalls}`);
await A.screenshot({ path: path.join(outDir, 'three_brawl.png') });

check('3d: 0 page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);

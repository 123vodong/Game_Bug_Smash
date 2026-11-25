// Offline 5v5 practice smoke check (2026-11-25): the real client in headless Chrome/Edge, no server
// match — TeamModeScene + OfflineSim on the Open Office.
//   GAME_URL=http://localhost:2650/ node tools/playtest/offline_check.mjs <outDir>
// Checks: reaches 'playing' on the 5v5 world, a move order walks the champion (A* around walls, never
// inside one), Q / W / E / R casts go on cooldown, a 10-champion brawl runs 6 s, 0 page errors.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const outDir = process.argv[2] || 'out/offline';
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
    if (!s.playerName) { s.playerName = 'Offline Tester'; s.career = { ...(s.career || {}), teamGames: 5, teamWins: 2 }; s.flags = { ...(s.flags || {}), tipsSiege: true }; localStorage.setItem(k, JSON.stringify(s)); }
  } catch (_) { /* fresh */ }
});
const errors = [], results = [];
const T0 = Date.now();
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}  [${Math.round((Date.now() - T0) / 1000)}s]`); };
const ev = (page, js, ms = 5000) => Promise.race([
  page.evaluate(`(() => { try { const v = (${js}); return (v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype) ? true : v; } catch (e) { return 'ERR ' + e.message; } })()`),
  new Promise((res) => setTimeout(() => res('TIMEOUT'), ms)),
]);
const until = async (page, js, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await ev(page, `!!(${js})`)) === true) return true; await page.waitForTimeout(150); } return false; };
const json = async (page, js) => { const v = await ev(page, `JSON.stringify(${js})`); try { return JSON.parse(v); } catch (_) { return { err: v }; } };

const A = await ctx.newPage();
A.on('pageerror', (e) => errors.push(e.message));
A.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|404/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
await A.goto(`${URL}?scene=team&offline=1&champ=${CHAMP}&name=OfflineTester`, { waitUntil: 'load' });
const S = "window.__game.scene.getScene('TeamModeScene')";
const playing = await until(A, `${S}?._sim?.state?.phase === 'playing'`, 30000);
check('offline: reaches playing', playing);
check('offline: plays on the 5v5 world', (await ev(A, `${S}.world.id`)) === '5v5' && (await ev(A, `${S}.world.w`)) === 6000);
await A.waitForTimeout(800);

// walk out of the fountain toward mid (the path bends around the base partitions)
const p0 = await json(A, `(() => { const m = ${S}._me(); return { x: m.x, y: m.y }; })()`);
await ev(A, `${S}._send('order', { type: 'move', x: 2400, y: 3600 })`);
await A.waitForTimeout(4000);
const p1 = await json(A, `(() => { const m = ${S}._me(); return { x: m.x, y: m.y, blocked: ${S}.world.nav.isBlocked(m.x, m.y, 24) }; })()`);
const moved = Math.hypot((p1.x || 0) - (p0.x || 0), (p1.y || 0) - (p0.y || 0));
check('offline: a move order walks the champion', moved > 300 && p1.blocked === false, `moved ${Math.round(moved)} px · inside a wall ${p1.blocked}`);

// skills: level 11, then Q W E R at a point ahead
await ev(A, `${S}._sim.debug('level', 11)`);
const cds = [];
for (const slot of ['q', 'w', 'e', 'r']) {
  await ev(A, `(() => { const m = ${S}._me(); ${S}._sim.debug('cast', { slot: '${slot}', x: m.x + 260, y: m.y - 260 }); })()`);
  await A.waitForTimeout(250);
  cds.push(await ev(A, `${S}._me().cd${slot.toUpperCase()} > Date.now()`));
}
check('offline: Q W E R casts go on cooldown', cds.every((v) => v === true), JSON.stringify(cds));
await A.screenshot({ path: path.join(outDir, 'offline_cast.png') });

// a 10-champion brawl in the top jungle for 6 s
await ev(A, `${S}._sim.debug('brawl', 2100, 2500)`);
await A.waitForTimeout(6000);
const brawl = await json(A, `(() => { const st = ${S}._sim.state; let hurt = 0, dead = 0; st.champions.forEach((c) => { if (c.dead) dead++; else if (c.hp < c.maxHp) hurt++; }); return { hurt, dead, phase: st.phase }; })()`);
check('offline: a 10-champion brawl deals damage', (brawl.hurt || 0) + (brawl.dead || 0) >= 2, JSON.stringify(brawl));
await A.screenshot({ path: path.join(outDir, 'offline_brawl.png') });

check('offline: 0 page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);

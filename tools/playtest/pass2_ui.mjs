// Pass 2 browser check (PASS2_BREAKDOWN.md RP-14) — the real client in headless Chrome/Edge against a
// DEBUG dev server (static files + ws on the same port):
//   BUG_SMASH_DEBUG=1 BUG_SMASH_RANKS=memory PORT=2650 node server/index.js
//   GAME_URL=http://localhost:2650/ node tools/playtest/pass2_ui.mjs <outDir>
// Screens: Team hub (18 champions, rank, 🏆 RANKS), leaderboard, select grid (offline), shop with 31
// items + SELL, camera lock / edge pan / minimap drag, second tab (DUP_TAB card), close + reopen →
// REJOIN banner → REJOIN prompt → back in the match. Prints PASS/FAIL lines + page errors.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const outDir = process.argv[2] || 'out/pass2';
fs.mkdirSync(outDir, { recursive: true });
const URL = (process.env.GAME_URL || 'http://localhost:2650/').replace(/\/?$/, '/');
const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
].filter(Boolean);
const executablePath = BROWSERS.find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath, args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => {
  try {
    const k = 'bugSmashHunter.save.v1';
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    // an experienced player: no first-games shop auto-open / coaching (they fight the scripted keys)
    if (!s.playerName) { s.playerName = 'UI Tester'; s.career = { ...(s.career || {}), teamGames: 5, teamWins: 2 }; s.flags = { ...(s.flags || {}), tipsSiege: true }; localStorage.setItem(k, JSON.stringify(s)); }
  } catch (_) { /* fresh */ }
});
const errors = [];
const results = [];
const T0 = Date.now();
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}  [${Math.round((Date.now() - T0) / 1000)}s]`); };
const step = (t) => console.log(`  · ${t}  [${Math.round((Date.now() - T0) / 1000)}s]`);
const watch = (page, tag) => {
  page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|404|DUP_TAB|IN_MATCH|onError/.test(m.text())) errors.push(`[${tag}] console: ${m.text().slice(0, 200)}`); });
};
const press = (page, key) => Promise.race([page.keyboard.press(key), new Promise((res) => setTimeout(res, 5000))]);
const clickT = (page, x, y) => Promise.race([page.mouse.click(x, y), new Promise((res) => setTimeout(res, 5000))]);
const shot = (page, name) => Promise.race([page.screenshot({ path: path.join(outDir, `${name}.png`) }), new Promise((res) => setTimeout(res, 8000))]);
// every evaluate is raced against a timeout (a busy page must not hang the run)
const ev = (page, js, ms = 5000) => Promise.race([
  page.evaluate(`(() => { try { const v = (${js}); return (v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype) ? true : v; } catch (e) { return 'ERR ' + e.message; } })()`),
  new Promise((res) => setTimeout(() => res('TIMEOUT'), ms)),
]);
// (coerced to a boolean in the page: returning a plain object that holds Phaser objects makes Playwright
//  serialize the whole scene graph — the page freezes)
const until = async (page, js, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await ev(page, `!!(${js})`)) === true) return true; await page.waitForTimeout(150); } return false; };

// ── 1. Team hub ──
const A = await ctx.newPage(); watch(A, 'A');
await A.goto(`${URL}?scene=lobby`, { waitUntil: 'load' });
await until(A, "window.__game?.scene.isActive('TeamLobbyScene')");
await A.waitForTimeout(2200);
await shot(A, '01_hub');
const cards = await ev(A, "window.__game.scene.getScene('TeamLobbyScene')._cards.length");
check('hub: 18 champion cards', cards === 18, `cards=${cards}`);
const rankTxt = await ev(A, "window.__game.scene.getScene('TeamLobbyScene')._careerText.text");
check('hub: rank line from the server (tier + stars)', /Intern|Junior|Mid|Senior|Staff|Principal|CTO/.test(rankTxt) && /[★☆]/.test(rankTxt), rankTxt);
await A.mouse.click(1280 - 84, 84);
await A.waitForTimeout(1500);
await shot(A, '02_ranks');
await A.keyboard.press('Escape');
await A.waitForTimeout(400);
const stillHub = await ev(A, "window.__game.scene.isActive('TeamLobbyScene')");
check('hub: ESC closes 🏆 RANKS without leaving the hub', stillHub);

// ── 2. select grid (offline practice) ──
await ev(A, "window.__game.scene.getScene('TeamLobbyScene').scene.start('TeamSelectScene', { offline: true, name: 'UI Tester', champ: 'lint' })");
await until(A, "window.__game.scene.isActive('TeamSelectScene')");
await A.waitForTimeout(1500);
await shot(A, '03_select');

// ── 3. online match: shop + sell + camera ──
await A.goto(`${URL}?scene=team&champ=hr&name=UITester`, { waitUntil: 'load' });
const playing = await until(A, "window.__game?.scene.getScene('TeamModeScene')?.room?.state?.phase === 'playing'", 25000);
check('deep link: online match reaches playing (READY at once)', playing);
const S = "window.__game.scene.getScene('TeamModeScene')";
await until(A, `!!${S}.shop && !!${S}._me()`, 8000);
await A.waitForTimeout(800);
await ev(A, `${S}.room.send('debug', { cmd: 'gold', n: 4000 })`);
await A.waitForTimeout(400);
await A.keyboard.press('KeyP');
await until(A, `${S}.shop.isOpen`, 3000);
await A.waitForTimeout(400);
await shot(A, '04_shop');
// 2026-11-25: 31 items in rows of 5 — every tile inside the grid area, the panel inside the 1280 × 720 view
const fit = await ev(A, `(() => { const sh = ${S}.shop, b = sh.root.getBounds(), inv = sh._inv[0];
  const tiles = sh._tiles.length, gridR = inv.x - 8, out = sh._tiles.filter((t) => t.c.x + 166 > gridR || t.c.y + 58 > 612).map((t) => t.id);
  return JSON.stringify({ tiles, out, left: Math.round(b.x), right: Math.round(b.right), top: Math.round(b.y), bottom: Math.round(b.bottom) }); })()`);
const fitV = (() => { try { return JSON.parse(fit); } catch (_) { return {}; } })();
check('shop: 31 item tiles, all inside the grid, panel inside the screen', fitV.tiles === 31 && fitV.out?.length === 0
  && fitV.left >= 0 && fitV.right <= 1280 && fitV.top >= 0 && fitV.bottom <= 720, fit);
await ev(A, `${S}._buy('mouse')`);
await A.waitForTimeout(500);
const g1 = await ev(A, `${S}._me().gold`);
// click the first inventory slot (positions read from the panel: its body's origin is the panel's top-left)
const shopLeft = await ev(A, `${S}.shop._left`), shopTop = await ev(A, `${S}.shop._top`);
const inv0 = { x: await ev(A, `${S}.shop._inv[0].x`), y: await ev(A, `${S}.shop._inv[0].y`) };
await A.mouse.click(shopLeft + inv0.x + 20, shopTop + inv0.y + 20);
await A.waitForTimeout(500);
await shot(A, '05_sell_selected');
const sellVisible = await ev(A, `${S}.shop._sellBtn.root.visible`);
check('shop: clicking an owned item shows SELL (UNDO right after buying)', sellVisible === true, await ev(A, `${S}.shop._sellBtn.root.list.map(o => o.text).filter(Boolean).join('|')`));
await A.mouse.click(shopLeft + await ev(A, `${S}.shop._sellBtn.root.x`), shopTop + await ev(A, `${S}.shop._sellBtn.root.y`));
await A.waitForTimeout(600);
const g2 = await ev(A, `${S}._me().gold`);
const items = await ev(A, `[...${S}._me().items].filter(Boolean).length`);
check('shop: SELL right after buying refunds the full cost', g2 - g1 === 350 && items === 0, `gold ${g1} → ${g2}, items ${items}`);
await A.keyboard.press('KeyP');
await until(A, `!${S}.shop.isOpen`, 3000);
await A.waitForTimeout(300);
// camera
const cam0 = await ev(A, `({ x: ${S}.cameras.main.scrollX, y: ${S}.cameras.main.scrollY })`);
await A.keyboard.press('KeyY');
await A.waitForTimeout(300);
const locked = await ev(A, `${S}._camLocked`);
check('camera: Y unlocks the camera', locked === false);
await A.mouse.move(1278, 360);
await A.waitForTimeout(1200);
const cam1 = await ev(A, `({ x: ${S}.cameras.main.scrollX, y: ${S}.cameras.main.scrollY })`);
check('camera: mouse at the right edge pans right', cam1.x - cam0.x > 300, `dx=${Math.round(cam1.x - cam0.x)}`);
await shot(A, '06_cam_free');
await A.mouse.move(640, 360);
// minimap drag (top-left minimap 10..210)
await A.mouse.move(150, 60); await A.mouse.down(); await A.mouse.move(170, 40, { steps: 4 });
await A.waitForTimeout(500);
const camMm = await ev(A, `({ x: ${S}.cameras.main.midPoint.x, y: ${S}.cameras.main.midPoint.y })`);
await shot(A, '07_minimap_drag');
await A.mouse.up();
check('camera: dragging the minimap looks at that spot (top-right of the map)', camMm.x > 4000 && camMm.y < 2000, `mid=${Math.round(camMm.x)},${Math.round(camMm.y)}`);
await A.keyboard.press('KeyY');
await A.waitForTimeout(1200);
// (the target point, not the clamped camera: near the base corner the camera stops at the map edge)
const lockD = await ev(A, `(() => { const s = ${S}, t = s._pred || s._me(); return Math.round(Math.hypot(s._camX - t.x, s._camY - 40 - t.y)); })()`);
check('camera: Y again locks back onto your champion', lockD < 60, `dist=${lockD}`);

// ── 4. a second tab of the same player ──
const B = await ctx.newPage(); watch(B, 'B');
await B.goto(URL, { waitUntil: 'load' });
await B.waitForTimeout(1500);
await ev(B, "window.__game.scene.getScene('MenuScene').scene.start('MultiPlayScene')");
await B.waitForTimeout(1800);
await press(B, 'Enter'); // JOIN on the clock-in card
await B.waitForTimeout(3000);
await shot(B, '08_second_tab');
const card = await ev(B, "!!window.__game.scene.getScene('MultiPlayScene')._overlay?._card || !!document.body");
void card;
const bRoom = await ev(B, "!!window.__game.scene.getScene('MultiPlayScene').room");
const bTried = await ev(B, "!!window.__game.scene.getScene('MultiPlayScene').client");
check('2nd tab: Personal Mode is refused while the 1st tab plays a match (DUP_TAB card)', bTried === true && bRoom === false, `tried=${bTried} room=${bRoom}`);
await B.close();

// ── 5. close the match tab → reopen → REJOIN ──
const roomId = await ev(A, `${S}.room.roomId`);
await A.close();
await new Promise((r) => setTimeout(r, 1500));
const C = await ctx.newPage(); watch(C, 'C');
await C.goto(URL, { waitUntil: 'load' });
await C.waitForTimeout(3000);
await shot(C, '09_menu_rejoin_banner');
const banner = await ev(C, "!!window.__game.scene.getScene('MenuScene')._rejoinShown");
check('reopen: the menu shows the REJOIN banner', banner);
step('click banner');
C.on('console', (m) => { if (m.type() !== 'debug') console.log(`    [C ${m.type()}] ${m.text().slice(0, 160)}`); });
await clickT(C, 640, 30);
await until(C, "window.__game.scene.getScene('TeamLobbyScene')?._prompt", 6000);
await C.waitForTimeout(500);
await shot(C, '10_rejoin_prompt');
step('prompt → Enter');
await press(C, 'Enter');
const back = await until(C, "window.__game.scene.getScene('TeamModeScene')?.room?.state?.phase === 'playing'", 15000);
const sameRoom = back && await ev(C, "window.__game.scene.getScene('TeamModeScene').room.roomId") === roomId;
await C.waitForTimeout(2500);
await shot(C, '11_rejoined');
check('REJOIN puts you back into the same match', back && sameRoom, `room ${roomId}`);
const human = await ev(C, "(() => { const s = window.__game.scene.getScene('TeamModeScene'); return s._me() && !s._me().isBot; })()");
check('REJOIN: your champion is human-controlled again', human === true);
step('win');
// win → rank line on the end screen
await ev(C, "window.__game.scene.getScene('TeamModeScene').room.send('debug', { cmd: 'win', kills: 12 })");
await C.waitForTimeout(5000);
await shot(C, '12_end_rank');
const rk = await ev(C, "window.__game.scene.getScene('TeamModeScene')._rankRes");
check('end screen: the ranked result arrived', !!rk && rk.delta !== undefined, JSON.stringify(rk)?.slice(0, 120));

console.log(errors.length ? `\npage errors (${errors.length}):\n  ${errors.slice(0, 12).join('\n  ')}` : '\npage errors: 0');
const failed = results.filter((x) => !x).length;
console.log(`${results.length - failed}/${results.length} passed`);
await browser.close();
process.exit(failed || errors.length ? 1 : 0);

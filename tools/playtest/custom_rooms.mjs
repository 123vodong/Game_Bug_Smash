// custom_rooms.mjs — Team Mode v4 custom-rooms flow in two headless browsers (host + guest).
// lobby → CUSTOM ROOMS (C) → CREATE ROOM (N, typed name) → guest JOIN BY CODE (J) → guest switches
// sides (← / →) → guest ENTER (non-host START: must stay in phase 'room') → host clicks START →
// both in TeamSelectScene → ENTER lock in → loading → TeamModeScene → scoreboard (from state.scores).
// Usage:  node custom_rooms.mjs <outDir>          (outDir must exist; PNGs 01_… 13_…)
// Env:    GAME_URL (default http://localhost:2670/ — the client-ui debug server), CHROME_PATH.
// Prints [info] lines + console errors/warnings + [PAGEERROR]s (should be none).
import { chromium } from 'playwright-core';
const OUT = process.argv[2] || 'out';
const URL = process.env.GAME_URL || 'http://localhost:2670/';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const logs = [];
async function mk(tag) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('GL Driver')) logs.push(`[${tag}][${m.type()}] ${m.text()}`); });
  p.on('pageerror', (e) => logs.push(`[${tag}][PAGEERROR] ${e.message}\n${e.stack}`));
  await p.goto(URL, { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__game && window.__game.scene.getScene('TeamLobbyScene'), null, { timeout: 30000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const g = window.__game; g.scene.getScenes(true).forEach((s) => g.scene.stop(s.scene.key)); g.scene.start('TeamLobbyScene'); });
  await p.waitForTimeout(1500);
  await p.evaluate((n) => { window.__game.scene.getScene('TeamLobbyScene')._name = n; }, tag);
  return p;
}
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });
const scene = (p) => p.evaluate(() => window.__game.scene.getScenes(true).map((s) => s.scene.key).join(','));
const host = await mk('Hosty');
await shot(host, '01_lobby');
await host.keyboard.press('c'); await host.waitForTimeout(1500);
await shot(host, '02_list');
await host.keyboard.press('n'); await host.waitForTimeout(600);
await host.keyboard.type('Friday Siege 🔥', { delay: 20 });
await shot(host, '03_create');
await host.keyboard.press('Enter'); await host.waitForTimeout(2000);
await shot(host, '04_host_room');
const code = await host.evaluate(() => window.__game.scene.getScene('TeamCustomScene')._room?.roomId || '');
logs.push('[info] roomName=' + await host.evaluate(() => window.__game.scene.getScene('TeamCustomScene')._room?.state?.roomName)); logs.push('[info] code=' + code + ' scene=' + await scene(host));
let guest = null;
if (code) {
  guest = await mk('Guesty');
  await guest.keyboard.press('c'); await guest.waitForTimeout(1800);
  await shot(guest, '05_guest_list');
  await guest.keyboard.press('j'); await guest.waitForTimeout(500);
  await guest.keyboard.type(code, { delay: 20 });
  await guest.keyboard.press('Enter'); await guest.waitForTimeout(1800);
  const sideOf = (pg) => pg.evaluate(() => { const s = window.__game.scene.getScene('TeamCustomScene'); return s._roomRead()?.myTeam; });
  await guest.waitForTimeout(500);
  const t0 = await sideOf(guest);
  await guest.keyboard.press(t0 === 'red' ? 'ArrowLeft' : 'ArrowRight'); await guest.waitForTimeout(900);
  const t1 = await sideOf(guest);
  await guest.keyboard.press(t1 === 'red' ? 'ArrowLeft' : 'ArrowRight'); await guest.waitForTimeout(900);
  logs.push(`[info] guest side ${t0} -> ${t1} -> ${await sideOf(guest)}`);
  await guest.keyboard.press('Enter'); await guest.waitForTimeout(500);   // non-host START → toast, no start
  await shot(guest, '06_guest_room');
  logs.push('[info] after guest ENTER phase=' + await guest.evaluate(() => window.__game.scene.getScene('TeamCustomScene')._room?.state?.phase));
  await shot(host, '07_host_room2');
  await host.mouse.click(1096, 664); await host.waitForTimeout(2500);
  await shot(host, '08_host_select'); await shot(guest, '09_guest_select');
  logs.push('[info] host=' + await scene(host) + ' guest=' + await scene(guest));
  for (const pg of [host, guest]) await pg.keyboard.press('Enter');          // lock in
  await host.waitForTimeout(4000);
  await shot(host, '10_loading');
  await host.waitForTimeout(8000);
  await shot(host, '11_match_host'); await shot(guest, '12_match_guest');
  logs.push('[info] scores=' + await host.evaluate(() => { const s = window.__game.scene.getScene('TeamModeScene'); const st = s.room?.state || s._room?.state; return st?.scores ? st.scores.size : 'n/a'; }));
  await host.evaluate(() => { const s = window.__game.scene.getScene('TeamModeScene'); const st = s.room?.state || s._room?.state; s.scoreboard?.update?.(st, s.localId); s.scoreboard?.show?.(); });
  await host.waitForTimeout(500); await shot(host, '13_scoreboard');
  logs.push('[info] final host=' + await scene(host) + ' guest=' + await scene(guest));
}
console.log(logs.join('\n') || '(no warnings)');
await browser.close();

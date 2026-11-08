// Drive the real game in headless Chrome/Edge: menu → MULTIPLAYER → join, then
// screenshot + run scripted steps. Prints console warnings/errors (PAGEERROR = crash).
//
// Usage:  node shot.mjs <outPrefix> [waitMs] [steps...]
//   node shot.mjs out/arena 6000                         # join, wait 6 s, out/arena.png
//   node shot.mjs out/p 3000 "play:15000" "shot:mid"     # wander + mash SPACE 15 s
//   node shot.mjs out/c 3000 "key:Enter" "type:hi bots" "key:Enter" "wait:3000" "shot:chat"
//   MENU_ONLY=1 node shot.mjs out/menu 2500              # just the main menu
// Steps: key:<Key> down:<Key> up:<Key> wait:<ms> shot:<suffix> click:<x>,<y>
//        type:<text> play:<ms> eval:<js expression>
// Env:  GAME_URL (default http://localhost:2567/)  CHROME_PATH  NAME_SHOT=1 (shot of join box)
//       ALL_LOGS=1 (print every console line, incl. eval results)
import { chromium } from 'playwright-core';
import fs from 'fs';

const out = process.argv[2] || 'shot';
const waitMs = Number(process.argv[3] || 4000);
const steps = process.argv.slice(4);
const URL = process.env.GAME_URL || 'http://localhost:2567/';
const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const executablePath = BROWSERS.find((p) => fs.existsSync(p));

const browser = await chromium.launch({
  executablePath,
  args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}\n${e.stack || ''}`));

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1500);
if (!process.env.MENU_ONLY) {
  // Click the PERSONAL multiplayer button (canvas is 1:1 at 1280x720)
  await page.mouse.click(540, 551);
  await page.waitForTimeout(800);
  if (process.env.NAME_SHOT) await page.screenshot({ path: `${out}-join.png` });
  await page.keyboard.press('Enter'); // confirm default name
}
await page.waitForTimeout(waitMs);
await page.screenshot({ path: `${out}.png` });

for (const s of steps) {
  const [cmd, arg] = s.split(/:(.*)/s);
  if (cmd === 'key') await page.keyboard.press(arg);
  else if (cmd === 'down') await page.keyboard.down(arg);
  else if (cmd === 'up') await page.keyboard.up(arg);
  else if (cmd === 'wait') await page.waitForTimeout(Number(arg));
  else if (cmd === 'shot') await page.screenshot({ path: `${out}-${arg}.png` });
  else if (cmd === 'click') { const [x, y] = arg.split(',').map(Number); await page.mouse.click(x, y); }
  else if (cmd === 'eval') logs.push('[eval] ' + JSON.stringify(await page.evaluate(arg)));
  else if (cmd === 'type') await page.keyboard.type(arg, { delay: 40 });
  else if (cmd === 'play') {
    // Wander with the arrow keys and mash SPACE, like a casual player.
    const dirs = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    const end = Date.now() + Number(arg);
    let held = null;
    while (Date.now() < end) {
      if (!held || Math.random() < 0.12) {
        if (held) await page.keyboard.up(held);
        held = dirs[Math.floor(Math.random() * 4)];
        await page.keyboard.down(held);
      }
      await page.keyboard.press('Space');
      await page.waitForTimeout(240);
    }
    if (held) await page.keyboard.up(held);
  }
}

const errs = logs.filter((l) => /error|PAGEERROR|warn/i.test(l));
console.log('--- console (' + logs.length + ' lines, ' + errs.length + ' warn/err) ---');
for (const l of (process.env.ALL_LOGS ? logs : errs).slice(0, 60)) console.log(l);
await browser.close();

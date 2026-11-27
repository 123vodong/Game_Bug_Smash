// HUD completeness check for the 3D renderer: sandbox toolbar, shop, info, touch controls. node three_hud_check.mjs <outDir> [touch]
import { chromium } from 'file:///C:/Users/ADLV/AppData/Local/ms-playwright-go/1.57.0/package/index.mjs';
import fs from 'fs';
const out = process.argv[2] || 'out/hud'; const touch = process.argv[3] === 'touch'; fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext(touch ? { viewport: { width: 800, height: 360 }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 12; Pixel 5) Mobile' } : { viewport: { width: 1280, height: 720 } });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|404/.test(m.text())) errs.push(m.text().slice(0, 200)); });
await p.goto('http://localhost:2567/?scene=team&champ=pixel&offline=1&sandbox=1&renderer=3d&autoq=0');
await p.waitForFunction(() => window.__three && window.__three.source.state().phase === 'playing', null, { timeout: 45000 });
await p.waitForTimeout(1500);
const ev = (f) => p.evaluate(f);
const R = {};
R.toolbar = await ev(() => [...document.querySelectorAll('.bsx-sb')].map((x) => x.textContent));
const me = () => window.__three.source.state().champions.get(window.__three.source.localId);
const click = async (t) => { await p.locator('.bsx-sb', { hasText: t }).first().click({ force: true }); await p.waitForTimeout(250); };
const lv0 = await ev(() => window.__three.source.state().champions.get(window.__three.source.localId).level);
await click('+LV'); R.lv = [lv0, await ev(() => window.__three.source.state().champions.get(window.__three.source.localId).level)];
const g0 = await ev(() => window.__three.source.state().champions.get(window.__three.source.localId).gold); await click('+5000g'); R.gold = [g0, await ev(() => window.__three.source.state().champions.get(window.__three.source.localId).gold)];
await click('0s CD'); R.noCd = await ev(() => window.__three.source.sim.noCd); await click('NO MANA'); R.noMana = await ev(() => window.__three.source.sim.noMana); await click('NO DMG'); R.god = await ev(() => window.__three.source.sim.godMode);
await click('+DUMMY'); R.dummies = await ev(() => { let n = 0; window.__three.source.state().units.forEach((u) => { if (u.kind === 'dummy' || /dummy/i.test(u.id || '')) n++; }); return n; });
await click('CLEAR'); R.dummiesAfter = await ev(() => { let n = 0; window.__three.source.state().units.forEach((u) => { if (u.kind === 'dummy' || /dummy/i.test(u.id || '')) n++; }); return n; });
const t0 = await ev(() => window.__three.source.state().startedAt); await click('+30s'); R.wave = await ev(() => Date.now() - window.__three.source.state().startedAt);
await click('SWAP'); await p.waitForTimeout(300); await p.screenshot({ path: `${out}/swap.png` });
await p.locator('.bsx-ch', { hasText: 'Stack' }).first().click({ force: true }); await p.waitForTimeout(500); R.swapped = await ev(() => window.__three.source.state().champions.get(window.__three.source.localId).champ);
// shop: dead => can buy; use debug tp to fountain instead
await ev(() => { const s = window.__three.source; const f = s.world.fountain.blue; s.sim.debug('tp', f.x, f.y); }); await p.waitForTimeout(500);
await p.keyboard.press('KeyP'); await p.waitForTimeout(500); await p.screenshot({ path: `${out}/shop.png` });
const it0 = await ev(() => [...window.__three.source.state().champions.get(window.__three.source.localId).items]);
await p.locator('.bsx-it:not(.off)').first().click({ force: true }); await p.waitForTimeout(500);
R.bought = [it0.length, await ev(() => [...window.__three.source.state().champions.get(window.__three.source.localId).items].filter(Boolean).length)];
await p.keyboard.press('Escape'); await p.keyboard.press('KeyC'); await p.waitForTimeout(400); await p.screenshot({ path: `${out}/info.png` }); R.infoOpen = await ev(() => !document.querySelector('.bsx-panel').hidden);
await p.keyboard.press('KeyC'); await p.waitForTimeout(300);
if (touch) {
  const j = await p.locator('.bsx-joy').boundingBox(); const x0 = await ev(() => window.__three.source.state().champions.get(window.__three.source.localId).x);
  const cdp = await ctx.newCDPSession(p); const c = { x: j.x + j.width / 2, y: j.y + j.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y, id: 1 }] });
  for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x + 50, y: c.y, id: 1 }] });
  await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/touch_move.png` });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  R.joyMoved = Math.round((await ev(() => window.__three.source.state().champions.get(window.__three.source.localId).x)) - x0);
  await p.locator('.bsx-w').tap({ force: true }); await p.waitForTimeout(300);
  R.wCd = await ev(() => { const m = window.__three.source.state().champions.get(window.__three.source.localId); return m.cdW > Date.now(); });
}
await p.screenshot({ path: `${out}/final.png` });
console.log(JSON.stringify(R)); console.log(errs.length ? errs.map((e) => '[PAGEERROR] ' + e).join('\n') : 'no page errors'); await b.close();

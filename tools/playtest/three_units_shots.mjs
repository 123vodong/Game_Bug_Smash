// Screenshots of the 3D unit models (lane fight, camps, towers, core, pets/wards/dummy, rubble).
//   GAME_URL=http://localhost:2690/ node three_units_shots.mjs <outDir>
import { chromium } from 'file:///C:/Users/ADLV/AppData/Local/ms-playwright-go/1.57.0/package/index.mjs';
import fs from 'fs'; import path from 'path';
const outDir = process.argv[2] || 'out/units'; fs.mkdirSync(outDir, { recursive: true });
const URL = (process.env.GAME_URL || 'http://localhost:2690/').replace(/\/?$/, '/');
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${URL}?scene=team&champ=pixel&offline=1&sandbox=1&renderer=3d${process.env.EXTRA || ''}`, { waitUntil: 'load' });
  const t0 = Date.now(); while (Date.now() - t0 < 45000) { if (await page.evaluate(() => !!(window.__three && window.__three.source.state().phase === 'playing')).catch(() => false)) break; await page.waitForTimeout(200); }
  await page.waitForTimeout(1000);
  if (process.env.ZOOM) { await page.mouse.move(640, 300); await page.mouse.wheel(0, -Number(process.env.ZOOM)); }
  const shot = async (name, ms = 4500) => { await page.waitForTimeout(ms); console.log(name, JSON.stringify(await page.evaluate(() => { const s = window.__three.source; const m = s.state().champions.get(s.localId); return [m.x | 0, m.y | 0, m.dead, s.state().phase]; }))); await page.screenshot({ path: path.join(outDir, name + '.png') }); };
  const tp = (x, y) => page.evaluate(([x, y]) => { const s = window.__three.source.sim; s.debug('godMode', true); s.debug('tp', x, y); }, [x, y]);
  const info = await page.evaluate(() => { const st = window.__three.source.state(); const o = { structs: [], camps: {}, minions: [] };
    st.structures.forEach((s) => o.structs.push([s.id, s.kind, s.team, s.x | 0, s.y | 0]));
    st.units.forEach((u) => { if (['small', 'medium', 'big', 'golden', 'deadline'].includes(u.kind)) o.camps[u.kind] = o.camps[u.kind] || [u.x | 0, u.y | 0]; });
    return o; });
  console.log(JSON.stringify(info));
  const which = (process.env.ONLY || 'camps,towers,core,pets,lane,rubble').split(',');
  if (which.includes('camps')) for (const [k, p] of Object.entries(info.camps)) { await tp(p[0] - 150, p[1] + 200); await shot('camp_' + k); }
  const tw = info.structs.filter((s) => s[1] === 'tower'), cores = info.structs.filter((s) => s[1] === 'core');
  if (which.includes('towers') && tw[0]) { await tp(tw[0][3] - 120, tw[0][4] + 250); await shot('tower_' + tw[0][2]); }
  if (which.includes('towers') && tw.length > 1) { const r = tw.find((s) => s[2] === 'red'); if (r) { await tp(r[3] - 120, r[4] + 250); await shot('tower_red'); } }
  if (which.includes('core')) for (const c of cores) { await tp(c[3] - 150, c[4] + 330); await shot('core_' + c[2]); }
  if (which.includes('pets')) { await tp(1350, 2700); await page.waitForTimeout(4000);
    await page.evaluate(() => { const s = window.__three.source.sim, me = s.state.champions.get(s.localId); const o = (k, dx, dy, t) => { const id = s._addUnit({ team: t, kind: k, x: me.x + dx, y: me.y + dy, hp: k === 'dummy' ? 10000 : 3, owner: me.id }); s.state.units.get(id)._expiresAt = 1e12; }; o('ward', -220, -60, 'blue'); o('ward', -140, -60, 'red'); o('dummy', 200, -20, 'red'); o('pet', -60, 60, 'blue'); o('pet', 0, 60, 'red'); o('melee', -220, 40, 'blue'); o('melee', -140, 40, 'red'); o('siege', 80, 0, 'blue'); o('siege', 140, 60, 'red'); o('ranged', -60, -60, 'red'); o('ranged', 20, -60, 'blue'); });
    await shot('pets'); }
  if (which.includes('lane')) { await tp(2100, 2500); await page.evaluate(() => window.__three.source.sim.debug('brawl', 2100, 2500)); await shot('lane', 7000); }
  if (which.includes('rubble') && tw[0]) { await page.evaluate((id) => { const s = window.__three.source.state().structures.get(id); s.hp = 0; s.alive = false; }, tw[0][0]); await tp(tw[0][3] - 120, tw[0][4] + 250); await shot('rubble'); }
  console.log(errors.length ? errors.map((e) => '[PAGEERROR] ' + e).join('\n') : 'no page errors');
} finally { await browser.close(); }

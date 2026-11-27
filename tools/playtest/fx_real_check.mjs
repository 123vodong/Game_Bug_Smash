// Casts Q/W/E/R/D/F for 4 champions through the REAL offline sim (debug cast -> SkillEngine -> fx messages -> router) and asserts that
// visible shapes/particles/bolts were spawned (fx.stats()) for each cast. Screenshots at +100/+300 ms.
//   GAME_URL=http://localhost:2567/ node fx_real_check.mjs [outDir] [champ,champ,..]
import { chromium } from 'file:///C:/Users/ADLV/AppData/Local/ms-playwright-go/1.57.0/package/index.mjs';
import fs from 'fs'; import path from 'path';
const outDir = process.argv[2] || 'out/fxreal'; fs.mkdirSync(outDir, { recursive: true });
const champs = (process.argv[3] || 'pixel,stack,courier,guard').split(',');
const URL = (process.env.GAME_URL || 'http://localhost:2567/').replace(/\/?$/, '/');
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0; const errors = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (process.env.V && m.text().startsWith('[fxdbg]')) console.log(m.text()); });
  await page.goto(`${URL}?scene=team&champ=${champs[0]}&offline=1&sandbox=1&renderer=3d`, { waitUntil: 'load' });
  const t0 = Date.now(); while (Date.now() - t0 < 45000) { if (await page.evaluate(() => !!(window.__three && window.__three.source.state().phase === 'playing')).catch(() => false)) break; await page.waitForTimeout(200); }
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const s = window.__three.source; s.sim.debug('godMode', true); s.sim.debug('tp', 2100, 2500); s.sim.debug('level', 6); s.sim.debug('fight');
    window.__fxLog = []; s.on('fx', (m) => window.__fxLog.push(m.k + (m.slot ? ':' + m.slot : '')));
  });
  for (const ch of champs) {
    await page.evaluate((ch) => { const s = window.__three.source.sim; s.debug('champ', ch); s.debug('tp', 2100, 2500); s.debug('fight'); }, ch);
    await page.waitForTimeout(600);
    for (const slot of ['q', 'w', 'e', 'r', 'd', 'f']) {
      await page.evaluate(async (slot) => {
        const src = window.__three.source, s = src.sim, me = s.state.champions.get(s.localId), fx = window.__three.renderer.modules.fx;
        window.__fxLog.length = 0; const before = fx.stats(); let peak = { particles: 0, flips: 0, teles: 0, bolts: 0 };
        const tx = Math.round(me.x + 280), ty = Math.round(me.y + 40);
        if (slot === 'd' || slot === 'f') s.debug('spell', { slot, x: tx, y: ty }); else s.debug('cast', { slot, x: tx, y: ty });
        window.__peak = peak; const iv = setInterval(() => { const st = fx.stats(); for (const k in peak) peak[k] = Math.max(peak[k], st[k]); }, 30); setTimeout(() => clearInterval(iv), 600);
      }, slot);
      await page.waitForTimeout(90); if (process.env.SHOTS) await page.screenshot({ path: path.join(outDir, `${ch}_${slot}_100.png`) });
      await page.waitForTimeout(560); const res = await page.evaluate(() => ({ msgs: window.__fxLog.slice(), peak: window.__peak }));
      const ok = res.msgs.length > 0 && res.peak.flips + res.peak.particles + res.peak.teles + res.peak.bolts > 0;
      if (!ok) fails++;
      console.log(`${ok ? 'OK  ' : 'FAIL'} ${ch}.${slot} msgs=[${res.msgs.join(',')}] peak=${JSON.stringify(res.peak)}`);
      await page.waitForTimeout(150);
    }
  }
  console.log(errors.length ? errors.map((e) => '[PAGEERROR] ' + e).join('\n') : 'no page errors');
} finally { await browser.close(); }
if (fails || errors.length) { console.log('FAILED', fails); process.exitCode = 1; } else console.log('PASS');

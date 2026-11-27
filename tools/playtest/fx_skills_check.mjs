// Casts every champion's Q/W/E/R (synthetic fx messages built from champions.js) + D/F spells, screenshots per champion, logs fx stats.
//   GAME_URL=http://localhost:2720/ node fx_skills_check.mjs <outDir> [champ,champ] [extraQuery]
import { chromium } from 'file:///C:/Users/ADLV/AppData/Local/ms-playwright-go/1.57.0/package/index.mjs';
import fs from 'fs'; import path from 'path';
const outDir = process.argv[2] || 'out/fxskills'; fs.mkdirSync(outDir, { recursive: true });
const only = process.argv[3] ? process.argv[3].split(',') : null; const extra = process.argv[4] || '';
const URL = (process.env.GAME_URL || 'http://localhost:2720/').replace(/\/?$/, '/');
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|404/.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });
  await page.goto(`${URL}?scene=team&champ=pixel&offline=1&sandbox=1&renderer=3d${extra}`, { waitUntil: 'load' });
  const t0 = Date.now(); while (Date.now() - t0 < 45000) { if (await page.evaluate(() => !!(window.__three && window.__three.source.state().phase === 'playing')).catch(() => false)) break; await page.waitForTimeout(200); }
  await page.waitForTimeout(1500);
  const ids = await page.evaluate(async () => { const m = await import('/shared/moba/champions.js'); window.__C = m.CHAMPIONS; return Object.keys(m.CHAMPIONS); });
  await page.evaluate(() => { const s = window.__three.source.sim; s.debug('godMode', true); s.debug('tp', 2100, 2500); });
  for (const id of ids) {
    if (only && !only.includes(id)) continue;
    const res = await page.evaluate(async (id) => {
      const s = window.__three.source.sim, me = s.state.champions.get(s.localId), C = window.__C[id]; me.champ = id; const o = (a) => Math.round(a);
      const emit = (m) => s.emit('fx', m); const base = { sid: me.id }; const col = (k) => k.color;
      const ev = [];
      for (const [slot, ang] of [['q', -0.6], ['w', 0.6], ['e', 2.5], ['r', 3.9]]) {
        const k = C.skills[slot], dx = Math.cos(ang), dy = Math.sin(ang), rg = Math.min(k.range || 400, 380), x = o(me.x + dx * rg * 0.7), y = o(me.y + dy * rg * 0.7);
        const t = k.type, r = k.radius || 150;
        if (t === 'projectile') emit({ ...base, k: 'proj', slot, x: o(me.x), y: o(me.y), dx, dy, speed: k.speed, range: Math.min(k.range, 420), width: k.width, color: col(k) });
        else if (t === 'dash' || t === 'blink') emit({ ...base, k: t === 'dash' ? 'dash' : 'blink', slot, x0: o(me.x), y0: o(me.y), x1: x, y1: y, color: col(k) });
        else if (t === 'target') emit({ ...base, k: 'tgt', slot, x0: o(me.x), y0: o(me.y), x1: x, y1: y, color: col(k) });
        else if (t === 'zone') emit({ ...base, k: 'zone', slot, tid: 'z' + slot, x, y, r, ms: 1500, tickMs: 500, color: col(k) });
        else if (t === 'circle' || t === 'arc' || t === 'serve') emit({ ...base, k: 'circle', slot, x: k.range === 0 ? o(me.x) : x, y: k.range === 0 ? o(me.y) : y, r, delay: 300, color: col(k) });
        else if (t === 'allies' || t === 'self' || t === 'rewind') { emit({ ...base, k: 'buff', slot, r, color: col(k) }); }
        else emit({ ...base, k: 'obj', slot, x, y, r: k.radius || 80, color: col(k) });
        ev.push(slot + ':' + t);
      }
      return ev.join(' ');
    }, id);
    await page.waitForTimeout(+(process.env.WAIT || 200));
    const st = await page.evaluate(() => window.__three.renderer.modules.fx.stats()).catch(() => null);
    await page.screenshot({ path: path.join(outDir, id + '.png') }); console.log(id, res, st ? JSON.stringify(st) : '');
    await page.waitForTimeout(900);
  }
  // spells
  await page.evaluate(() => { const s = window.__three.source.sim, me = s.state.champions.get(s.localId); me.champ = 'pixel'; const x = Math.round(me.x), y = Math.round(me.y); ['flash', 'heal', 'ghost', 'barrier', 'ignite', 'smite'].forEach((sp, i) => s.emit('fx', { k: 'spell', sid: me.id, spell: sp, x0: x - 250 + i * 100, y0: y, x1: x - 250 + i * 100 + (sp === 'flash' ? 150 : 0), y1: y + (sp === 'ignite' || sp === 'smite' ? 60 : 0) })); });
  await page.waitForTimeout(+(process.env.WAIT || 200)); await page.screenshot({ path: path.join(outDir, 'spells.png') });
  console.log(errors.length ? errors.map((e) => '[PAGEERROR] ' + e).join('\n') : 'no page errors');
} finally { await browser.close(); }

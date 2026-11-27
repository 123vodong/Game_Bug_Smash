// Skill VFX contact shots (offline sandbox): for each champion cast Q/W/E/R toward the right and
// screenshot the area around the player twice (just after the cast, then ~0.4 s later).
//   GAME_URL=http://localhost:2600/ CHAMPS=pixel,stack node tools/playtest/skill_fx_shots.mjs <outDir>
// Prints page errors (a missing sprite key or a thrown style = FAIL).
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const outDir = process.argv[2] || 'out/skillfx';
fs.mkdirSync(outDir, { recursive: true });
const URL = (process.env.GAME_URL || 'http://localhost:2650/').replace(/\/?$/, '/');
const CHAMPS = (process.env.CHAMPS || 'pixel').split(',');
const executablePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath, args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
for (const champ of CHAMPS) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => {
    try {
      const k = 'bugSmashHunter.save.v1';
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      if (!s.playerName) { s.playerName = 'FxTester'; s.career = { ...(s.career || {}), teamGames: 5 }; s.flags = { ...(s.flags || {}), tipsSiege: true }; localStorage.setItem(k, JSON.stringify(s)); }
    } catch (_) { /* fresh */ }
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${champ}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|404/.test(m.text())) errors.push(`${champ}: console: ${m.text().slice(0, 160)}`); });
  await page.goto(`${URL}?scene=team&offline=1&sandbox=1&champ=${champ}&name=FxTester`, { waitUntil: 'load' });
  const S = "window.__game.scene.getScene('TeamModeScene')";
  for (let i = 0; i < 100; i++) { if (await page.evaluate(`${S}?._sim?.state?.phase === 'playing'`).catch(() => false)) break; await page.waitForTimeout(300); }
  await page.waitForTimeout(800);
  await page.evaluate(`(() => { const sim = ${S}._sim; sim.debug('level', 18); sim.state.champions.get('me').ranks = { q: 3, w: 3, e: 3, r: 2 }; sim.debug('tp', 2400, 3600); })()`).catch(() => {});
  await page.waitForTimeout(600);
  // one enemy champion in front of the caster so impacts / marks are visible
  await page.evaluate(`(() => { const sim = ${S}._sim, me = ${S}._me(); sim.state.champions.forEach((c) => { if (c.team !== me.team) { c.x = me.x + 330; c.y = me.y; c.hp = c.maxHp = 99999; c.rootedUntil = Date.now() + 60000; c._order = null; } }); })()`).catch(() => {});
  for (const slot of ['q', 'w', 'e', 'r']) {
    await page.evaluate(`(() => { const sim = ${S}._sim, m = ${S}._me(); const foe = [...sim.state.champions.values()].find((c) => c.team !== m.team); sim.debug('cast', { slot: '${slot}', x: m.x + 300, y: m.y, id: foe && foe.id }); })()`).catch(() => {});
    await page.waitForTimeout(160);
    await page.screenshot({ path: path.join(outDir, `${champ}_${slot}_a.png`), clip: { x: 290, y: 130, width: 700, height: 460 } });
    await page.waitForTimeout(380);
    await page.screenshot({ path: path.join(outDir, `${champ}_${slot}_b.png`), clip: { x: 290, y: 130, width: 700, height: 460 } });
    await page.waitForTimeout(1200);
  }
  await ctx.close();
}
await browser.close();
console.log(errors.length ? `ERRORS (${errors.length}):\n${errors.slice(0, 12).join('\n')}` : 'no page errors');
process.exit(errors.length ? 1 : 0);

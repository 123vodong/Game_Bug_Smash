// Story Mode 2.0 prototype check (M1, 2026-11-25): the real client in headless Chrome/Edge.
//   GAME_URL=http://localhost:2650/ node tools/playtest/story2_check.mjs <outDir>
// Walks floor 1 end to end: loads on the story floor (not the 5v5 map), walks around walls, talks to
// Ops (T key) who joins the party, gets locked into the Server Room, fights the nest, clears the room
// (doors reopen, the blue keycard drops), picks the card up, opens the Records door, walks up the
// stairs, sees the FLOOR CLEARED panel. Prints PASS / FAIL lines + page errors.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const outDir = process.argv[2] || 'out/story2';
fs.mkdirSync(outDir, { recursive: true });
const URL = (process.env.GAME_URL || 'http://localhost:2650/').replace(/\/?$/, '/');
const CHAMP = process.env.CHAMP || 'dev';
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
    if (!s.playerName) { s.playerName = 'Story Tester'; s.career = { ...(s.career || {}), teamGames: 5 }; s.flags = { ...(s.flags || {}), tipsSiege: true }; localStorage.setItem(k, JSON.stringify(s)); }
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
const shot = (page, name) => page.screenshot({ path: path.join(outDir, `${name}.png`) }).catch(() => {});

const A = await ctx.newPage();
A.on('pageerror', (e) => errors.push(e.message));
A.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|404/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
await A.goto(`${URL}?scene=story&champ=${CHAMP}&name=StoryTester`, { waitUntil: 'load' });
const S = "window.__game.scene.getScene('StoryWorldScene')";
const SIM = `${S}._sim`;
const playing = await until(A, `${S}?._sim?.state?.phase === 'playing'`, 30000);
check('story: StoryWorldScene reaches playing', playing);
const info = await json(A, `({ world: ${S}.world.id, w: ${S}.world.w, walls: ${S}.map.walls.length, doors: ${S}.map.doors.size, units: ${SIM}.state.units.size, champ: ${S}._me()?.champ, lv: ${S}._me()?.level })`);
check('story: floor 1 world + map (not the 5v5 map)', info.world === 'f1' && info.w === 7200 && info.walls > 20 && info.doors === 3, JSON.stringify(info));
check('story: bugs + nest spawned, your champion at level 3', info.units >= 15 && info.champ === CHAMP && info.lv === 3);
await A.waitForTimeout(1500);
check('story: the Rubber Duck talks (dialogue box)', (await ev(A, `${S}._dlg.c.visible && ${S}._dlg.name.text === 'RUBBER DUCK'`)) === true, await ev(A, `${S}._dlg.text.text`));
const tracker = await ev(A, `${S}.hud.epicT.text`);
check('story: objective tracker in the HUD top bar', /nest|keycard/i.test(String(tracker)), tracker);
await shot(A, '01_start');

// walk out of the lobby into the hallway (the door gap at x 1000–1400)
const p0 = await json(A, `({ x: ${S}._me().x, y: ${S}._me().y })`);
await ev(A, `${S}._send('order', { type: 'move', x: 1200, y: 2500 })`);
await A.waitForTimeout(5000);
const p1 = await json(A, `(() => { const m = ${S}._me(); return { x: m.x, y: m.y, blocked: ${S}.world.nav.isBlocked(m.x, m.y, 24), room: ${SIM}.story.room }; })()`);
check('story: walks through the lobby door into the hallway', p1.room === 'hall' && !p1.blocked, `${Math.round(p0.x)},${Math.round(p0.y)} → ${Math.round(p1.x)},${Math.round(p1.y)} room ${p1.room}`);

// talk to Ops (T key) → joins after the lines
await ev(A, `${SIM}.debug('tpTo', 'npc_ops')`);
await A.waitForTimeout(700);
check('story: a TALK prompt shows next to Ops', (await ev(A, `${S}._talkUi.c.visible && /OPS/.test(${S}._talkUi.text.text)`)) === true, await ev(A, `${S}._talkUi.text.text`));
await A.keyboard.press('KeyT');
await A.waitForTimeout(1200);
check('story: Ops speaks in the dialogue box (portrait + name)', (await ev(A, `/OPS/.test(${S}._dlg.name.text)`)) === true, await ev(A, `${S}._dlg.name.text`));
const joined = await until(A, `${SIM}.story.allies.includes('npc_ops')`, 14000);
check('story: Ops joins the party', joined);
await shot(A, '02_ops');

// the Server Room: lock-in
await ev(A, `${SIM}.debug('tpTo', 'd_server', -520)`);
await A.waitForTimeout(1600);
const lock = await json(A, `({ door: ${SIM}.story.doors.find((d) => d.id === 'd_server').state, view: ${S}.map.doors.get('d_server').state, room: ${SIM}.story.room })`);
check('story: stepping into the nest room locks its door', lock.door === 'closed' && lock.view === 'closed', JSON.stringify(lock));
const allyIn = await ev(A, `(() => { const c = ${SIM}.state.champions.get('npc_ops'); return ${SIM}._roomAt(c.x, c.y)?.id; })()`);
check('story: the ally is brought into the locked room', allyIn === 'server', allyIn);
// fight: Q at the nest a few times, let the bugs come
await ev(A, `${SIM}.debug('level', 6)`);
for (let i = 0; i < 3; i++) {
  await ev(A, `(() => { const n = [...${SIM}.state.units.values()].find((u) => u.kind === 'nest'); const m = ${S}._me(); ${SIM}.debug('cast', { slot: 'q', x: n ? n.x : m.x, y: n ? n.y : m.y - 300 }); })()`);
  await A.waitForTimeout(1500);
}
await shot(A, '03_nest_fight');
const fight = await json(A, `({ hpPct: Math.round(${S}._me().hp / ${S}._me().maxHp * 100), nest: Math.round(([...${SIM}.state.units.values()].find((u) => u.kind === 'nest') || {}).hp || 0), alive: [...${SIM}.state.units.values()].filter((u) => u.alive && u._room === 'server').length })`);
check('story: the nest room fights back', fight.alive >= 1, JSON.stringify(fight));
await ev(A, `${SIM}.debug('clearRoom', 'server')`);
await A.waitForTimeout(800);
const after = await json(A, `({ door: ${SIM}.story.doors.find((d) => d.id === 'd_server').state, card: ${SIM}.story.pickups.some((p) => p.kind === 'keycard' && !p.taken), sprite: [...${S}._pickupViews.keys()].length })`);
check('story: clearing the room reopens the door and drops the blue keycard', after.door === 'open' && after.card, JSON.stringify(after));

// pick up the card
await ev(A, `${SIM}.debug('tpTo', ${SIM}.story.pickups.find((p) => p.kind === 'keycard').id)`);
await A.waitForTimeout(700);
const keyOk = await ev(A, `${SIM}.story.keys.has('blue')`);
check('story: the blue keycard is picked up (tracker updates)', keyOk === true, await ev(A, `${S}.hud.epicT.text`));

// the Records door opens when you walk up with the card
await ev(A, `${SIM}.debug('tpTo', 'd_records', 220)`);
const opened = await until(A, `${SIM}.story.doors.find((d) => d.id === 'd_records').state === 'open'`, 4000);
check('story: the keycard door opens', opened);
await shot(A, '04_records_door');

// walk up the stairs: from just inside the door to the exit (a real walk)
await ev(A, `${SIM}.debug('tpTo', 'd_records', -260)`);
await A.waitForTimeout(300);
const ex = await json(A, `${SIM}.floor.exit`);
await ev(A, `${S}._send('order', { type: 'move', x: ${ex.x}, y: ${ex.y} })`);
const ended = await until(A, `${SIM}.state.phase === 'ended'`, 20000);
check('story: walking onto the stairs clears the floor', ended, await ev(A, `${SIM}.story.room`));
const panel = await until(A, `!!${S}._clearedPanel`, 8000);
check('story: FLOOR CLEARED panel', panel);
await shot(A, '05_cleared');

check('story: 0 page errors', errors.length === 0, errors.slice(0, 6).join(' | '));
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);

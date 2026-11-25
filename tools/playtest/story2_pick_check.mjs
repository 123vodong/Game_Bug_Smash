// Story Mode 2.0 menu entry + free pick check (2026-11-25): the real client in headless Chrome/Edge.
//   GAME_URL=http://localhost:2650/ node tools/playtest/story2_pick_check.mjs <outDir>
// Menu STORY card → champion pick (18 cards, mouse + keys, summoner spells) → START → the floor with
// that champion; the pick is remembered; FLOOR CLEARED records the clear and CHAMPION goes back to the
// pick; picking Ops swaps floor 1's Ops NPC for a stand-in; then EVERY champion plays the floor and
// casts Q W E R at a bug pack (champion-only skills must hit bugs too). Prints PASS / FAIL lines.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const outDir = process.argv[2] || 'out/story2_pick';
fs.mkdirSync(outDir, { recursive: true });
const URL = (process.env.GAME_URL || 'http://localhost:2650/').replace(/\/?$/, '/');
const executablePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
].filter(Boolean).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath, args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => {
  try {   // a returning player (no welcome card), no story save yet
    const k = 'bugSmashHunter.save.v1';
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.playerName) { s.playerName = 'Pick Tester'; s.career = { ...(s.career || {}), teamGames: 5 }; s.flags = { ...(s.flags || {}), welcomeSeen: true, tipsSiege: true }; localStorage.setItem(k, JSON.stringify(s)); }
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
await A.goto(URL, { waitUntil: 'load' });
const G = 'window.__game';
const M = `${G}.scene.getScene('MenuScene')`;
const P = `${G}.scene.getScene('StoryPickScene')`;
const S = `${G}.scene.getScene('StoryWorldScene')`;
const active = (key) => `${G}.scene.isActive('${key}')`;
const save = `JSON.parse(localStorage.getItem('bugSmashHunter.save.v1') || '{}').story2 || {}`;

// ── menu: the STORY card ──
check('menu: MenuScene up', await until(A, active('MenuScene'), 20000));
await A.waitForTimeout(900);
const card = await json(A, `(() => { const c = ${M}._storyCard; return c ? { x: c.x, y: c.y, vis: c.visible, kids: c.list.length } : null; })()`);
check('menu: STORY card on the left (mirrors DAILY MISSIONS)', card && card.vis && card.x < 300 && card.kids > 10, JSON.stringify(card));
await shot(A, '01_menu');
// click PLAY STORY (bottom strip of the card); the canvas is 1280×720 at 1:1
await A.mouse.click(card.x, card.y + 84);
check('menu: PLAY STORY opens the champion pick', await until(A, active('StoryPickScene'), 12000));
check('menu: the menu stops behind it', (await ev(A, active('MenuScene'))) === false);
await A.waitForTimeout(800);

// ── the pick ──
const pick0 = await json(A, `({ n: ${P}._cards.length, sel: ${P}._sel, spells: ${P}._spells, floor: ${P}._floor.id, ids: ${P}._cards.map((c) => c.id) })`);
check('pick: all 18 champions, no locks', pick0.n === 18 && new Set(pick0.ids).size === 18, `${pick0.n} cards`);
check('pick: default = Patch (dev) on a fresh save, floor 1', pick0.sel === 'dev' && pick0.floor === 'f1', JSON.stringify({ sel: pick0.sel, floor: pick0.floor }));
await shot(A, '02_pick');
// mouse: click the Pager card
const pg = await json(A, `(() => { const c = ${P}._cards.find((k) => k.id === 'oncall'); return { x: c.c.x, y: c.c.y }; })()`);
await A.mouse.click(pg.x, pg.y);
await A.waitForTimeout(300);
check('pick: clicking a card picks it (detail follows)', (await ev(A, `${P}._sel`)) === 'oncall' && (await ev(A, `${P}._detailFor`)) === 'oncall');
// keys: → then ←
await A.mouse.move(1100, 700);   // off the grid (hover would show another champion's detail)
await A.keyboard.press('ArrowRight');
const right = await ev(A, `${P}._sel`);
await A.keyboard.press('ArrowLeft');
check('pick: arrow keys move the pick', right !== 'oncall' && (await ev(A, `${P}._sel`)) === 'oncall', `→ ${right}`);
// summoner spells: D cycles the first slot, never onto the other slot's spell
const sp0 = await json(A, `${P}._spells`);
await A.keyboard.press('KeyD');
const sp1 = await json(A, `${P}._spells`);
check('pick: D changes the first summoner spell (story-useful spells only)', sp1[0] !== sp0[0] && sp1[0] !== sp1[1] && ['flash', 'heal', 'ghost', 'barrier'].includes(sp1[0]), `${sp0} → ${sp1}`);
await shot(A, '03_pick_pager');
await A.keyboard.press('Enter');
check('pick: ENTER starts the floor', await until(A, `${S}?._sim?.state?.phase === 'playing'`, 25000));
const me1 = await json(A, `(() => { const m = ${S}._me(); return { champ: m.champ, d: m.spellD, f: m.spellF }; })()`);
check('story: plays the picked champion with the picked spells', me1.champ === 'oncall' && me1.d === sp1[0] && me1.f === sp1[1], JSON.stringify(me1));
const sv = await json(A, save);
check('story: the pick is saved (story2.champ / spells)', sv.champ === 'oncall' && Array.isArray(sv.spells) && sv.spells[0] === sp1[0], JSON.stringify(sv));
check('story: champion-only skills aim at bugs here (client rule)', (await ev(A, `${S}._champOnly({ targets: 'enemyChamp' })`)) === false);

// ── floor cleared → record + CHAMPION back to the pick ──
await ev(A, `${S}._sim._clearFloor()`);
check('story: FLOOR CLEARED panel', await until(A, `!!${S}._clearedPanel`, 10000));
const sv2 = await json(A, save);
check('story: the clear is recorded (clears 1, best time)', sv2.floors?.f1?.clears === 1 && sv2.floors.f1.bestMs >= 0 && sv2.floors.f1.champ === 'oncall', JSON.stringify(sv2.floors));
await shot(A, '04_cleared');
const champBtn = await json(A, `(() => { const p = ${S}._clearedPanel; const t = p.list.find((o) => o.type === 'Text' && /CHAMPION/.test(o.text)); return t ? { x: p.x + t.x, y: p.y + t.y } : null; })()`);
check('story: the cleared panel has a CHAMPION button', !!champBtn, JSON.stringify(champBtn));
if (champBtn) await A.mouse.click(champBtn.x, champBtn.y);
check('story: CHAMPION goes back to the pick', await until(A, active('StoryPickScene'), 12000));
await A.waitForTimeout(700);
check('pick: remembers Pager', (await ev(A, `${P}._sel`)) === 'oncall');
check('pick: the floor card shows the clear', (await ev(A, `${P}.children.list.some((o) => o.type === 'Text' && /cleared 1×/.test(o.text))`)) === true);
await shot(A, '05_pick_after_clear');
await A.keyboard.press('Escape');
check('pick: ESC goes back to the menu', await until(A, active('MenuScene'), 12000));
await A.waitForTimeout(700);
check('menu: the STORY card shows the remembered champion', (await ev(A, `${M}._storyCard.list.some((o) => o.type === 'Text' && o.text === 'Pager')`)) === true);
check('menu: 1/5 floors on the card', (await ev(A, `${M}._storyCard.list.some((o) => o.type === 'Text' && /^1\\/5/.test(o.text))`)) === true);
await shot(A, '06_menu_after');

// ── picking Ops: the Ops NPC on floor 1 becomes a stand-in ──
const startStory = (champ) => ev(A, `(() => {
  const g = ${G};
  const run = (key) => g.scene.isActive(key) ? g.scene.getScene(key) : null;
  const from = run('StoryWorldScene') || run('StoryPickScene') || run('MenuScene');
  if (from === run('StoryWorldScene')) from._cleanup();
  from.scene.start('StoryWorldScene', { champ: '${champ}', name: 'Pick Tester', floor: 'f1', story: true });
  return true;
})()`);
await startStory('ops');
const opsOk = await until(A, `${S}?._sim?.state?.phase === 'playing' && ${S}._me()?.champ === 'ops'`, 25000);
const npc = await json(A, `(() => { const c = ${S}._sim.state.champions.get('npc_ops'); return c ? { champ: c.champ, name: c.name } : null; })()`);
check('story as Ops: the floor NPC is a stand-in (Brew), not a second Ops', opsOk && npc?.champ === 'barista' && npc?.name === 'Brew', JSON.stringify(npc));
await ev(A, `${S}._sim.debug('tpTo', 'npc_ops')`);
await A.waitForTimeout(600);
await A.keyboard.press('KeyT');
await A.waitForTimeout(1200);
check('story as Ops: the stand-in speaks the NPC lines', /BREW/.test(String(await ev(A, `${S}._dlg.name.text`))), await ev(A, `${S}._dlg.name.text`));

// ── every champion: Q W E R at a bug pack ──
const ids = pick0.ids;
const rows = [];
for (const id of ids) {
  await startStory(id);
  const ok = await until(A, `${S}?._sim?.state?.phase === 'playing' && ${S}._me()?.champ === '${id}'`, 25000);
  if (!ok) { rows.push({ id, ok: false }); continue; }
  const r = await json(A, `(() => {
    const sc = ${S}, sim = sc._sim, me = sim.state.champions.get(sc.localId);
    sim.debug('level', 9);
    const q = sim.nav.nearestFree(2800, 900, 24); me.x = q.x; me.y = q.y; me._order = null; me._nav = null;
    sc._hitLog = [];
    if (!sim._emitWrapped) { const em = sim.emit; sim.emit = (t, m) => { if (t === 'fx' && m && m.k === 'hit') sc._hitLog.push(m.id); return em(t, m); }; sim._emitWrapped = true; }
    return { x: me.x, y: me.y };
  })()`);
  const casts = {};
  for (const slot of ['q', 'w', 'e', 'r']) {
    const res = await json(A, `(() => {
      const sc = ${S}, sim = sc._sim, me = sim.state.champions.get(sc.localId);
      me.hp = me.maxHp; me.dead = false;
      let best = null, bd = 1e9;
      sim.state.units.forEach((u) => { if (u.alive && u._story && u.kind !== 'nest') { const d = Math.hypot(u.x - me.x, u.y - me.y); if (d < bd) { bd = d; best = u; } } });
      if (!best) return { none: true };
      if (bd > 420) { const q = sim.nav.nearestFree(best.x - 300, best.y, 24); me.x = q.x; me.y = q.y; me._order = null; me._nav = null; }
      sc._hitLog.length = 0;
      sim.debug('cast', { slot: '${slot}', x: best.x, y: best.y, id: best.id });
      return { t: best.id, cd: me['cd${slot.toUpperCase()}'] > sim.t };
    })()`);
    await A.waitForTimeout(1100);   // projectiles / delayed circles land
    const hits = await ev(A, `${S}._hitLog.length`);
    casts[slot] = { cd: !!res.cd, hits: Number(hits) || 0 };
  }
  rows.push({ id, ok: true, casts });
}
const dmgSlots = (row) => Object.entries(row.casts || {}).filter(([, v]) => v.hits > 0).map(([k]) => k.toUpperCase()).join('') || '-';
console.log('\n  champion    cast (on cooldown)   hit a bug');
for (const row of rows) console.log(`  ${row.id.padEnd(10)}  ${row.ok ? Object.entries(row.casts).map(([k, v]) => (v.cd ? k.toUpperCase() : '·')).join('') : 'NO START'}                 ${row.ok ? dmgSlots(row) : ''}`);
check('every champion: the floor starts (18/18)', rows.filter((r) => r.ok).length === 18, rows.filter((r) => !r.ok).map((r) => r.id).join(', '));
check('every champion: Q W E R all cast on a story floor', rows.every((r) => r.ok && ['q', 'w', 'e', 'r'].every((s) => r.casts[s].cd)), rows.filter((r) => r.ok && !['q', 'w', 'e', 'r'].every((s) => r.casts[s].cd)).map((r) => r.id).join(', '));
const champOnlyUlts = { zero: 'r', dev: 'r', oncall: 'r', tester: 'r' };
const coc = Object.entries(champOnlyUlts).map(([id, s]) => ({ id, hits: rows.find((r) => r.id === id)?.casts?.[s]?.hits || 0 }));
check('champion-only ults hit bugs here (Zero-Day, Merge Conflict, On My Way, Regression Barrage)', coc.every((x) => x.hits > 0), coc.map((x) => `${x.id} ${x.hits}`).join(' · '));
check('every champion: at least one damaging skill hit a bug', rows.every((r) => r.ok && Object.values(r.casts).some((v) => v.hits > 0)), rows.filter((r) => r.ok && !Object.values(r.casts).some((v) => v.hits > 0)).map((r) => r.id).join(', '));
await shot(A, '07_last_champion');

check('0 page errors', errors.length === 0, errors.slice(0, 6).join(' | '));
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);

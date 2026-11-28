// Sprite layer for skills: 2D-parity flipbooks (assets/moba/fb/*.webp, same sheets/tints/sizes as SkillFx.js FBX/MUZZLE tables)
// drawn as pooled billboards / ground decals at the true sim positions. One pooled flipbook system (flipbook.js), hard cap on live quads.
// Resolution: FBX[kind][style] (extracted 2D data) -> EXTRA[champ.slot] (hand-authored for skills the 2D drew with canvas shapes) -> generic by message kind
// (sheet picked from the skill colour + a per-champion signature sheet so champions never share the same fallback).
import { createFlipbooks } from './flipbook.js';
import { FBX, MUZZLE } from './skills/fbdata.js';
import { CHAMPIONS, resolveSkill, parseKitTags } from '../../../shared/moba/champions.js'; // read-only: skill.fx style + skill type + stance resolution

const fin = Number.isFinite;
// layer = [sheet, relR|null, absPx|null, lifeMs|'ms', tint|'col'|null, additive, alpha, ground, delayMs, anchor, dyPx, rot]
const L = (key, sz, life, tint = null, o = {}) => [key, typeof sz === 'string' ? +sz : null, typeof sz === 'number' ? sz : null, life, tint, o.n ? 0 : 1, o.a ?? 1, o.g ? 1 : 0, o.d || 0, o.an || 'c', o.dy || 0, 0];
const G = { g: 1 };
const EXTRA = {
  'pixel.q': [L('ringBlue', '2.2', 800, null, G), L('vfConstellation', '2.0', 900, 0xff5fa3), L('burstBlue', 200, 600, null, { an: 'b' })],
  'pixel.w': [L('vfPuffStars', 220, 700, 0xff7fd0, { an: '1' }), L('burstBlue', 170, 550, null, { an: '1', d: 250 })],
  'pixel.e': [L('ringPurple', 320, 800, null, G), L('vfWheel', 260, 800, 0xb6a8ff, G)],
  'stack.e': [L('vfVortex', 220, 1200, 0x7ed957, G), L('ringGreen', 260, 900, null, G)],
  'ops.w': [L('ringGreen', 240, 700, null, { an: '0', g: 1 }), L('sparkGold', 200, 600, null, { an: '1' })],
  'tester.w': [L('ringOrange', 300, 800, null, G), L('vfCharged', 210, 700, 0xff9800)],
  'zero.q': [L('smoke', 220, 900, 0x2b1a4a, { n: 1, a: 0.85 }), L('vfPuffStars', 190, 800, 0xb084ff)],
  'model.e': [L('impactLeaf', 240, 800), L('burstGreen', 210, 700), L('vfTentacles', 260, 900, 0x2ecc71, { an: 'b' })],
  'guard.e': [L('vfElectricShield', 240, 900, 0x4a7bd0), L('impactAir', 210, 600, 0xffd23f)],
  'cleaner.w': [L('ringBlue', 260, 700, 0xbfe6ff, G), L('vfWheel', 250, 700, 0x7ec8ff, G)],
  'courier.w': [L('impactGold', 210, 600), L('sparkGold', 190, 600, 0xc8a165)],
  'courier.e': [L('smoke', 200, 800, 0xc8a165, { n: 1, a: 0.7 }), L('burstOrange', 220, 600, null, { an: '1' })],
  'embedded.q': [L('ringBlue', 300, 800, null, G), L('vfElectricShield', 210, 900, 0x00e5ff), L('burstBlue', 180, 600)],
  'embedded.w': [L('flameB', 140, 600, 0xff9800), L('vfAnima', 155, 650, 0xffb347)],
  'embedded.e': [L('ringBlue', 320, 800, 0x9be7ff, G), L('airCloud', 190, 700, 0x9be7ff, { a: 0.45 })],
  'embedded.r': [L('vfExplosion2', 240, 800, 0x00ffff), L('burstBlue', 220, 700), L('ringBlue', 360, 800, 0x00ffff, G)],
  'appdev.e': [L('impactAir', 220, 500), L('ringWhite', 260, 600, null, G)],
  'sprint.w': [L('ringGold', 280, 1000, 0xffe066, G), L('divineCloud', 220, 1000, null, { a: 0.5 })],
  'cache.w': [L('ringBlue', 260, 800, 0x91a7ff, G), L('vfAnima', 210, 800, 0x91a7ff)],
  'hr.w': [L('ringGreen', 250, 800, null, { an: '0', g: 1 }), L('ringGreen', 250, 800, null, { an: '1', g: 1 }), L('sparkGold', 190, 700, 0x7ed957, { an: '1' })],
  'lint.q': [L('crosshair', 210, 750, 0xff7675), L('burstBlood', 180, 600, 0xff7675)],
  'lint.w': [L('crosshair', 210, 750, 0xd63031), L('splatter', 200, 700, 0xff4040)],
  'lint.e': [L('impactLeaf', 200, 700, 0x55efc4), L('ringGreen', 240, 800, 0x55efc4, G)],
  'lint.r': [L('burstFire', 260, 800, 0xe17055), L('ringOrange', 380, 800, 0xe17055, G)],
  'barista.r': [L('vfPuffStars', 240, 800, 0xffd27a), L('ringOrange', 320, 800, null, G)],
  'oncall.r': [L('vfEldenRing', 360, 900, 0xff1744, G), L('ringOrange', 380, 800, 0xff1744, G)],
};
// area (line/cone/arc) skills: sheet laid along the true length/width; tint = skill colour unless set
const AREA = { 'pixel.r': ['vfPixelFire', null], 'cleaner.q': ['impactAir', 0xe3c88e], 'dev.q': ['bloodSlash', 0xb084ff] };
// champion signature sheets for the generic fallback [ground ring, burst]
const SIG = { pixel: ['ringBlue', 'vfPuffStars'], stack: ['ringGreen', 'impactLeaf'], ops: ['ringGold', 'sparkGold'], tester: ['ringOrange', 'vfCharged'], zero: ['ringPurple', 'chaosSpike'],
  model: ['ringBlue', 'chaosCloud'], guard: ['ringGold', 'vfElectricShield'], cleaner: ['ringBlue', 'impactWater'], courier: ['ringOrange', 'vfHyperspeed'], embedded: ['ringBlue', 'vfExplosion2'],
  dev: ['ringPurple', 'vfSmallHit'], appdev: ['ringWhite', 'burstOrange'], sprint: ['ringGold', 'divineCloud'], cache: ['ringBlue', 'vfAnima'], hr: ['ringGreen', 'sparkGold'],
  lint: ['ringOrange', 'crosshair'], barista: ['ringOrange', 'smoke'], oncall: ['ringPurple', 'vfEldenRing'] };
// projectile head sprite by 2D style: [sheet, tint|'col'|null, additive]
const HEAD = { hook: ['sparkGold', null, 1], sniperCharge: ['vfCharged', 'col', 1], sniper: ['vfCharged', 'col', 1], snipeGlobal: ['vfPowerChords', 'col', 1], notif: ['vfSmallHit', 'col', 1], burstUpdate: ['vfPuffStars', 'col', 1],
  storeLaunch: ['fireball', 0xff5fb0, 1], batch: ['ringBlue', null, 1], tableScan: ['vfConstellation', 'col', 1], charmInvite: ['sparkGold', 0xffb088, 1], invite: ['sparkGold', 0xffb088, 1],
  espressoSpray: ['fireball', 0xc8864a, 1], pageWave: ['ringOrange', null, 1], prism: ['vfPuffStars', null, 1], crescent: ['impactAir', 0x9ec5ff, 1], rail: ['iceBolt', 'col', 1],
  stale: ['smoke', 0x8a9a6a, 0], coffee: ['fireball', 0xc8864a, 1], broomSweep: ['impactAir', 0xe3c88e, 1] };
const SPELL = { flash: [['burstBlue', 220, 550, 0xffe066, '0'], ['burstBlue', 260, 600, 0xffffff, '1']], heal: [['ringGreen', 330, 800, null, '0'], ['impactLeaf', 240, 700, null, '0']],
  ghost: [['impactAir', 260, 600, 0x39c2ff, '0'], ['ringBlue', 280, 700, null, '0']], barrier: [['vfElectricShield', 280, 900, 0xbfe6ff, '0']],
  ignite: [['burstFire', 260, 700, null, '1'], ['crosshair', 240, 600, 0xff7a1a, '1']], smite: [['bloodSlash', 260, 500, 0xff3b8a, '1'], ['burstBlood', 230, 600, null, '1']] };
const HOT = ['ringBlue', 'ringGold', 'ringGreen', 'ringOrange', 'ringPurple', 'ringWhite', 'burstBlue', 'burstOrange', 'burstGreen', 'burstWhite', 'burstFire', 'impactAir', 'impactGold', 'impactLeaf', 'sparkGold', 'vfSmallHit', 'vfPuffStars', 'fireball'];
const ATK_SHEETS = ['bloodSlash', 'vfCharged', 'vfPixelFire', 'crosshair', 'impactGold', 'impactLeaf', 'impactWater', 'burstOrange', 'burstFire', 'burstBlue', 'burstBlood', 'vfSmallHit', 'fireball', 'waterDots', 'sparkGold', 'ringBlue', 'ringPurple', 'ringOrange'];

export function createSprites({ THREE, scene, S = 0.01, lite = true, ent, pos, source }) {
  const cap = lite ? 24 : 40;
  const fb = createFlipbooks(THREE, scene, { cap, S });
  fb.preload(HOT);
  // warm the rest of the sheets shortly after start so the first cast of a skill is not invisible while its sheet loads
  const rest = new Set(); const addK = (a) => a.forEach((l) => rest.add(l[0]));
  for (const k of Object.values(FBX)) for (const v of Object.values(k)) addK(v);
  for (const v of Object.values(EXTRA)) addK(v); for (const v of Object.values(MUZZLE)) addK(v); for (const v of Object.values(HEAD)) rest.add(v[0]); for (const v of Object.values(AREA)) rest.add(v[0]);
  for (const v of Object.values(SPELL)) addK(v); for (const v of Object.values(SIG)) v.forEach((s) => rest.add(s)); rest.add('vfBigHit');
  for (const s of ATK_SHEETS) rest.add(s);
  const warm = setTimeout(() => fb.preload([...rest]), 800);
  // the LOCAL champion's sheets load as soon as it is known (first cast must show); everything else stays lazy/warm
  let localDone = false, now = 0;
  const recentBuff = new Map();
  function addSpecSheets(ks, sk) {
    if (!sk) return;
    const addFx = (fx) => {
      if (!fx) return;
      for (const kind of Object.keys(FBX)) {
        const st = typeof fx === 'string' ? fx : fx[kind];
        for (const l of (FBX[kind][st] || [])) ks.add(l[0]);
      }
      const pk = typeof fx === 'string' ? fx : fx.proj;
      if (MUZZLE[pk]) MUZZLE[pk].forEach((l) => ks.add(l[0]));
      if (HEAD[pk]) ks.add(HEAD[pk][0]);
    };
    addFx(sk.fx);
    if (sk.stances) for (const v of Object.values(sk.stances)) addFx(v && v.fx);
    if (sk.serve && sk.serve.outcomes) for (const v of Object.values(sk.serve.outcomes)) addFx(v && v.fx);
  }
  function preloadChamp(champ) {
    const ks = new Set(), sig = SIG[champ]; if (sig) sig.forEach((s) => ks.add(s));
    const def = CHAMPIONS[champ];
    for (const sl of 'qwer') {
      for (const l of EXTRA[champ + '.' + sl] || []) ks.add(l[0]); if (AREA[champ + '.' + sl]) ks.add(AREA[champ + '.' + sl][0]);
      addSpecSheets(ks, def && def.skills && def.skills[sl]);
    }
    fb.preload([...ks]);
  }
  function update(dt) { now += dt; if (!localDone) { const me = ent(source && source.localId); if (me && me.champ) { localDone = true; preloadChamp(me.champ); } } fb.update(dt); }
  const skillOf = (m) => {
    const c = m && m.sid ? ent(m.sid) : null;
    const def = c && c.champ ? CHAMPIONS[c.champ] : null;
    const stance = c && c.buffs ? parseKitTags(c.buffs).stance || '' : '';
    const sk = def && m.slot ? resolveSkill(def, m.slot, stance) : null;
    return { champ: c && c.champ, sk, id: c && c.champ && m.slot ? c.champ + '.' + m.slot : null };
  };
  const styleFor = (sk, kind) => (!sk || !sk.fx ? null : typeof sk.fx === 'string' ? sk.fx : sk.fx[kind] || null);
  const hueSheets = (color) => [fb.ringKey(color), fb.burstKey(color)];

  function anchor(an, c) { // -> [x, y] sim px
    if (an === '0' && fin(c.x0)) return [c.x0, c.y0];
    if (an === '1' && fin(c.x1)) return [c.x1, c.y1];
    if (an === 'b' && fin(c.x2)) return [c.x2, c.y2];
    return [c.x, c.y];
  }
  function playLayer(layer, c, follow, baseDelay) {
    const [key, rel, abs, life, tint, add, a0, ground, delay, an, dy] = layer;
    const [x, y] = anchor(an, c); if (!fin(x, y)) return;
    let size = rel ? rel * c.R * S : abs * S * (ground ? 1.15 : 1.0);
    size *= (c.big ? (ground ? 1.25 : 1.15) : 1);
    size = ground ? Math.max(1.4, Math.min(16.0, size)) : Math.max(1.1, Math.min(4.5, size));
    const z = ground ? 0.06 : Math.min(2.0, Math.max(0.5 + (-dy) * S * 0.5, size * 0.28));
    const dSec = (baseDelay !== undefined ? baseDelay : c.delay) + delay / 1000;
    fb.flip(key, { x: x * S, y: y * S, z, size, color: tint === 'col' ? c.color : tint == null ? 0xffffff : tint, dur: Math.max(0.2, (life === 'ms' ? c.ms : life) / 1000) * (c.big && life !== 'ms' ? 1.3 : 1), flat: !!ground, alpha: a0, delay: dSec, add: !!add, follow: follow && an === 'c' ? follow : null });
  }
  const run = (layers, c, follow) => {
    const ownTiming = layers.some((l) => l[8] > 0);
    const baseDelay = ownTiming ? 0 : c.delay;
    for (const l of layers) playLayer(l, c, follow, baseDelay);
    return layers.length > 0;
  };

  function generic(kind, c, champ) {
    const sig = SIG[champ] || null, [ring, burst] = hueSheets(c.color), rg = sig ? sig[0] : ring, bs = sig ? sig[1] : burst, R = c.R;
    switch (kind) {
      case 'circle': return run([L(ring, '2.3', 700, null, G), L(bs, '2.0', 650, c.color)], c);
      case 'zone': return run([L(rg, '2.3', 'ms', c.color, { g: 1, a: 0.6 }), L('airCloud', '1.8', 'ms', c.color, { a: 0.3 })], c);
      case 'dash': {
        if (fin(c.x0, c.x1)) { const n = Math.min(4, Math.max(2, Math.round(Math.hypot(c.x1 - c.x0, c.y1 - c.y0) / 150))); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; playLayer(L('impactAir', 190, 450, c.color, { d: i * 40 }), { ...c, x: c.x0 + (c.x1 - c.x0) * t, y: c.y0 + (c.y1 - c.y0) * t }); } }
        return run([L(bs, 230, 600, null, { an: '1' })], c);
      }
      case 'blink': return run([L(bs, 200, 550, c.color, { an: '0' }), L(bs, 230, 600, null, { an: '1' })], c);
      case 'buff': return run([L(rg, 290, 800, null), L(bs, 190, 700, null)], c, c.follow);
      case 'tgt': return run([L(bs, 240, 650, c.color, { an: '1' }), L('crosshair', 200, 500, c.color, { an: '1' })], c);
      case 'obj': return run([L(rg, Math.max(260, R * 2.6), 900, c.color, G), L(bs, Math.max(200, R * 2), 700)].concat(fin(c.x2) ? [L(bs, 220, 700, c.color, { an: 'b' })] : []), c);
      default: return run([L(rg, 260, 700, c.color), L(bs, 200, 600, null)], c);
    }
  }

  /** called by the router for every 'fx' message (before the registry/generic effects). Returns true when sprites were played. */
  function cast(m, color) {
    if (!m || !m.k) return false;
    const k = m.k, { champ, sk, id } = skillOf(m);
    const caster = m.sid ? pos(m.sid) : null;
    const c = { x: fin(m.x) ? m.x : fin(m.x1) ? m.x1 : caster ? caster.x : NaN, y: fin(m.y) ? m.y : fin(m.y1) ? m.y1 : caster ? caster.y : NaN, x0: fin(m.x0) ? m.x0 : caster ? caster.x : NaN, y0: fin(m.y0) ? m.y0 : caster ? caster.y : NaN,
      x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2, R: Math.max(60, m.r || 120), ms: m.ms || 1000, big: m.slot === 'r', delay: (m.delay || 0) / 1000, color: fin(m.color) ? m.color : color, follow: null };
    if (k === 'spell') {
      const l = SPELL[m.spell]; if (!l || !fin(m.x0, m.y0)) return false;
      return run(l.map(([a, s, lf, t, an]) => L(a, s, lf, t, { an })), { ...c, x: m.x0, y: m.y0 });
    }
    if (k === 'buff' || k === 'heal') {
      if (m.sid && m.slot) {
        const bk = m.sid + ':' + m.slot, prev = recentBuff.get(bk);
        if (prev !== undefined && now - prev < 0.08) return false;
        recentBuff.set(bk, now); if (recentBuff.size > 64) recentBuff.clear();
      }
      c.x = c.x0; c.y = c.y0; if (m.sid) c.follow = () => pos(m.sid);
    }
    const tk = k === 'tp' ? 'blink' : (k === 'heal' || k === 'timebox' || k === 'echo' || k === 'reload' || k === 'stance' || k === 'pkg') ? 'buff' : (k === 'zap' || k === 'tether' || k === 'link') ? 'tgt' : k === 'deliver' ? 'dash' : k === 'shadow' ? 'obj' : k;
    if (k === 'proj') {
      const st = styleFor(sk, 'proj'), mz = st && MUZZLE[st];
      if (mz && mz.length) { for (const [key, size, life, tint, add, a0] of mz) fb.flip(key, { x: m.x * S + (m.dx || 0) * 0.4, y: m.y * S + (m.dy || 0) * 0.4, z: 0.9, size: Math.min(3.5, Math.max(1.1, size * S * 1.1)), color: tint === 'col' ? c.color : tint == null ? 0xffffff : tint, dur: life / 1000, alpha: a0, add: !!add }); }
      else if (m.slot) { const sig = SIG[champ]; fb.flip(sig ? sig[0] : fb.ringKey(c.color), { x: m.x * S, y: m.y * S, z: 0.8, size: 1.5, color: c.color, dur: 0.45 }); }
      return true;
    }
    if (k === 'area') {
      const len = m.len || 600, ang = fin(m.a) ? m.a : 0, w = Math.max(120, m.w || m.width || m.thick || 160), cone = m.shape === 'cone' || m.shape === 'arc';
      const [sheet, tint] = AREA[id] || [fb.burstKey(c.color), null], n = cone ? 3 : Math.min(5, Math.max(2, Math.round(len / (w * 1.1))));
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / (n + (cone ? 0.5 : 0)), px = m.x + Math.cos(ang) * len * t, py = m.y + Math.sin(ang) * len * t, sz = cone ? len * (0.3 + 0.25 * t) : w * 1.5;
        fb.flip(sheet, { x: px * S, y: py * S, z: 0.7, size: Math.min(4.5, Math.max(1.4, sz * S)), color: tint == null ? c.color : tint, dur: 0.5, delay: c.delay + 0.03 * i });
      }
      return true;
    }
    if (k === 'serve') {
      if (!fin(c.x, c.y) && !fin(c.x0, c.y0)) return false;
      const fxName = m.fx;
      const tbl = fxName && (FBX.circle[fxName] || FBX.buff[fxName] || FBX.zone[fxName]);
      if (tbl && tbl.length) return run(tbl, c, c.follow);
      const ex = EXTRA[id] || EXTRA['barista.r'];
      return ex ? run(ex, c, c.follow) : generic('buff', c, champ);
    }
    if (k === 'pkg' && !m.on) return false;
    if (!['circle', 'zone', 'dash', 'blink', 'tp', 'buff', 'heal', 'tgt', 'zap', 'obj', 'rewind', 'knock', 'revive', 'untarget', 'timebox', 'echo', 'link', 'reload', 'deliver', 'stance', 'tether', 'shadow', 'pkg'].includes(k)) return false;
    if (!fin(c.x, c.y) && !fin(c.x0, c.y0)) return false;
    const style = m.fx || styleFor(sk, tk), tbl = style && FBX[tk] && FBX[tk][style];
    if (tbl && tbl.length) return run(tbl, c, c.follow);
    const ex = EXTRA[id];
    if (ex) {
      const ok = run(ex, c, c.follow);
      if (k === 'rewind' && Array.isArray(m.list)) {
        const rKey = fb.ringKey(c.color);
        for (const e of m.list) if (e && fin(e.x1, e.y1)) playLayer(L(rKey, 260, 700, c.color, G), { ...c, x: e.x1, y: e.y1 });
      }
      return ok;
    }
    return generic(k === 'rewind' || k === 'knock' || k === 'revive' || k === 'untarget' ? 'buff' : tk, c, champ);
  }
  /** projectile head: looping flipbook following getPos() (sim px). Returns a handle (set .kill = true to remove) or null. Min ~0.9 world units. */
  function head(m, color, widthPx, getPos) {
    const { sk, champ } = skillOf(m), st = styleFor(sk, 'proj'), h = HEAD[st], sig = SIG[champ];
    const key = h ? h[0] : (sig ? sig[1] : 'fireball'), tint = h ? (h[1] === 'col' ? color : h[1] == null ? 0xffffff : h[1]) : color;
    return fb.flip(key, { x: m.x * S, y: m.y * S, z: 0.8, size: Math.max(0.9, (widthPx || 60) * S * 1.9), color: tint, dur: 0.5, loops: 40, follow: getPos, add: h ? !!h[2] : true });
  }
  /** small hit flipbook for champion skill hits (skipped when the pool is nearly full) */
  function hit(x, y, color, big) {
    if (fb.count > cap - 5) return;
    fb.flip(big ? 'vfBigHit' : 'vfSmallHit', { x: x * S, y: y * S, z: 0.7, size: big ? 1.7 : 1.15, color, dur: big ? 0.45 : 0.35 });
  }
  /** lightweight flipbook helper for auto-attacks (world coords wx, wz). Reserves pool headroom for skills & respects lite quality. */
  function play(sheetName, wx, wz, { size = 1.2, dur = 0.28, color = 0xffffff, ground = 0, z = 0.75, rot = 0, alpha = 1, add = true, minor = false } = {}) {
    if (!sheetName || !fin(wx) || !fin(wz)) return null;
    const reserve = minor ? (lite ? 12 : 10) : (lite ? 8 : 6);
    if (fb.count >= cap - reserve) return null;
    return fb.flip(sheetName, { x: wx, y: wz, z: ground ? 0.06 : z, size, color, dur, flat: !!ground, rot, alpha, add });
  }
  return { cast, head, hit, play, update, get count() { return fb.count; }, dispose() { clearTimeout(warm); fb.dispose(); } };
}

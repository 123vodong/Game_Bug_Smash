// Overhead nameplates (LoL style, DOM, pooled). Own rAF loop (30 fps cap) so plates follow the camera smoothly,
// independent of the 10-20 Hz HUD update. Dirty-checked writes, transform-only positioning, skipped while the tab is hidden.
// Champions: level badge, name (+bot/crown tag), segmented HP bar, shield, mana (allies only), status chips, cast bar.
// Units / structures: thin HP bar; towers + epics get a bigger bar and a name.
import { CHAMPIONS, parseCcTags, CC_TYPES } from '../../../shared/moba/champions.js';
import { RECALL_MS } from '../../../shared/moba/rules.js';
import { hatById } from '../../data/cosmetics.js';

const UNIT_NAMES = { dummy: 'Training Dummy', big: 'Memory Leak', medium: 'Stubborn Bug', small: 'Stray Bug', golden: 'Golden Bug', deadline: 'THE DEADLINE', siege: 'Legacy Code', pet: 'Rubber Duck', ward: 'CCTV' };
const BUFF_ICONS = { deadline: ['⏰', 'Deadline'], coffee: ['☕', 'Coffee'], ghost: ['👻', 'Ghost'], ignited: ['🔥', 'Ignited'], recall: ['🏠', 'Recall'], spotted: ['🎯', 'Spotted', '#ff4040'], silenced: ['🔇', 'Silenced'] };
const MAX_CHIPS = 5, MAX_PLATES = 90;
const T_PX = 12; // champion-plate world offset above the feet, in world px at scale 1 (tuned from screenshots)

function heatColor(k) {
  const c = Math.max(0, Math.min(1, k));
  let r, g, b;
  if (c <= 0.5) { const t = c * 2; r = 255; g = Math.round(210 + (140 - 210) * t); b = Math.round(63 + (42 - 63) * t); }
  else { const t = (c - 0.5) * 2; r = 255; g = Math.round(140 + (42 - 140) * t); b = 42; }
  return `rgb(${r},${g},${b})`;
}

const mk = (p, tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (p) p.appendChild(e); return e; };
const sText = (e, v) => { if (e._v !== v) { e._v = v; e.textContent = v; } };
const sSty = (e, k, v) => { const key = '_' + k; if (e[key] !== v) { e[key] = v; e.style.setProperty(k, v); } };
const sHid = (e, h) => { if (e.hidden !== h) e.hidden = h; };
const sCls = (e, c) => { if (e._c !== c) { e._c = c; e.className = c; } };

export function createNameplates({ source, project, root }) {
  const layer = mk(root, 'div', 'bsh-np-layer');
  const plates = new Map(), free = [], objHeat = new Map();
  const offFx = source && source.on ? source.on('fx', (m) => {
    if (!m) return;
    if (m.k === 'objHeat' && m.oid != null) objHeat.set(m.oid, m.h || 0);
    else if (m.k === 'objEnd' && m.oid != null) objHeat.delete(m.oid);
  }) : null;
  const flags = (window.__three = window.__three || {}); flags.hud = flags.hud || {};
  if (flags.hud.hideChampBars == null) flags.hud.hideChampBars = true; // units/index.js should skip its 3D champion HP bar while this is true
  let raf = 0, last = 0, disposed = false, suppressed = false, mePos = null, pxScale = 1, W = innerWidth, H = innerHeight;
  const onResize = () => { W = innerWidth; H = innerHeight; };
  addEventListener('resize', onResize);

  function build(kind) {
    const el = mk(layer, 'div', 'bsh-np');
    const p = { el, kind, id: '', cls: '', x: 0, y: 0, init: false, seen: 0 };
    if (kind === 'champ') {
      el.innerHTML = '<div class="lv"></div><div class="col"><div class="nm"><span class="tg"></span><span class="nt"></span></div>'
        + '<div class="hb"><i class="hp"></i><i class="sh"></i><u></u></div><div class="mb"><i></i></div>'
        + '<div class="cs"><i></i><b></b></div><div class="cc"></div></div>';
      p.lv = el.querySelector('.lv'); p.tg = el.querySelector('.tg'); p.nt = el.querySelector('.nt');
      p.hb = el.querySelector('.hb'); p.hp = p.hb.children[0]; p.sh = p.hb.children[1]; p.ticks = p.hb.children[2];
      p.mb = el.querySelector('.mb'); p.mp = p.mb.firstChild; p.cs = el.querySelector('.cs'); p.csf = p.cs.firstChild; p.cst = p.cs.lastChild; p.cc = el.querySelector('.cc');
      p.chips = [];
      for (let i = 0; i < MAX_CHIPS; i++) { const c = mk(p.cc, 'span', 'chip', '<em></em><b></b>'); c.hidden = true; p.chips.push(c); }
    } else if (kind === 'obj') {
      el.innerHTML = '<div class="nt"></div><div class="hb"><i class="hp"></i></div><div class="heat" style="width:44px;height:4px;background:rgba(0,0,0,.82);border:1px solid #000;overflow:hidden;margin-top:1px;"><i style="display:block;height:100%;width:0%;background:#ffd23f;"></i></div>';
      p.nt = el.children[0]; p.hb = el.children[1]; p.hp = p.hb.firstChild;
      p.heatWrap = el.children[2]; p.heatFill = p.heatWrap.firstChild;
    } else {
      el.innerHTML = '<div class="nt"></div><div class="hb"><i class="hp"></i><b class="hpt" style="position:absolute;inset:0;text-align:center;font:700 9px/11px Consolas,monospace;color:#fff;text-shadow:0 0 2px #000;pointer-events:none;"></b></div>';
      p.nt = el.firstChild; p.hb = el.lastChild; p.hp = p.hb.firstChild; p.hpt = p.hb.lastChild;
      p.hpt.hidden = true;
    }
    return p;
  }
  const getPlate = (id, kind) => {
    let p = plates.get(id);
    if (p && p.kind !== kind) { release(id); p = null; }
    if (!p) {
      if (plates.size >= MAX_PLATES) return null;
      const i = free.findIndex((f) => f.kind === kind);
      p = i >= 0 ? free.splice(i, 1)[0] : build(kind);
      p.id = id; p.init = false; plates.set(id, p);
    }
    return p;
  };
  function release(id) { const p = plates.get(id); if (!p) return; plates.delete(id); sHid(p.el, true); free.push(p); }

  const place = (p, sx, sy, offPx) => {
    if (!p.init) { p.x = sx; p.y = sy; p.init = true; } else { p.x += (sx - p.x) * 0.45; p.y += (sy - p.y) * 0.45; }
    const t = `translate3d(${Math.round(p.x)}px,${Math.round(p.y - offPx)}px,0) translate(-50%,-100%)`;
    if (p._t !== t) { p._t = t; p.el.style.transform = t; }
    sHid(p.el, false);
  };
  const frac = (a, b) => Math.max(0, Math.min(1, b > 0 ? a / b : 0));

  function champPlate(c, id, myId, myTeam, srvNow, scale, tick) {
    const sx = (id === myId && mePos) ? mePos.x : c.x, sy = (id === myId && mePos) ? mePos.y : c.y;
    const pr = project(sx, sy); if (!pr || !pr.visible) { const q = plates.get(id); if (q) sHid(q.el, true); return; }
    const p = getPlate(id, 'champ'); if (!p) return; p.seen = tick;
    const me = id === myId, ally = c.team === myTeam, rel = me ? 'me' : ally ? 'ally' : 'foe';
    const def = CHAMPIONS[c.champ];
    sCls(p.el, `bsh-np champ ${rel}`);
    sText(p.lv, String(c.level | 0));
    const hat = c.hat ? hatById(c.hat) : null;
    const hatEmoji = hat && hat.id ? hat.emoji : '';
    sText(p.tg, (c.isBot ? '🤖' : '') + (c.rank && /Principal|Lead|Staff/i.test(c.rank) ? '👑' : '') + hatEmoji);
    sText(p.nt, c.name || (def && def.name) || '?');
    const mhp = Math.max(1, c.maxHp || 1), hp = Math.max(0, c.hp || 0), sh = c.shield || 0, f = Math.min(1, hp / mhp);
    sSty(p.hp, 'width', `${f * 100}%`);
    const shw = Math.max(0, Math.min(1 - f, sh / mhp)) * 100; sSty(p.sh, 'left', `${f * 100}%`); sSty(p.sh, 'width', `${shw}%`);
    const unit = mhp > 3000 ? 500 : mhp > 1400 ? 250 : 100, tk = Math.max(3, 112 * unit / mhp); // 112 = bar width px (css)
    sSty(p.ticks, '--tk', `${tk.toFixed(2)}px`);
    const showMp = (me || ally) && c.maxMana > 0; sHid(p.mb, !showMp); if (showMp) sSty(p.mp, 'width', `${frac(c.mana || 0, c.maxMana) * 100}%`);
    // status chips
    let n = 0;
    const add = (ic, label, until, accent) => {
      if (n >= MAX_CHIPS) return; const ch = p.chips[n++]; sHid(ch, false); sText(ch.firstChild, ic); ch.title = label;
      sText(ch.lastChild, until > 0 ? (until >= 1000 ? String(Math.ceil(until / 1000)) : (until / 1000).toFixed(1)) : '');
      sSty(ch, 'border-color', accent || ''); sSty(ch, 'color', accent || '');
    };
    if ((c.stunnedUntil || 0) > srvNow) add('💫', 'Stunned', c.stunnedUntil - srvNow);
    if ((c.rootedUntil || 0) > srvNow) add('⛓', 'Rooted', c.rootedUntil - srvNow);
    if ((c.slowUntil || 0) > srvNow) add('🐌', `Slowed ${c.slowPct | 0}%`, c.slowUntil - srvNow);
    const tags = c.buffs || '';
    if (tags) {
      const ccs = parseCcTags(tags);
      for (const k of ccs) { const ty = CC_TYPES[k]; if (ty) add(ty.icon, ty.label, 0); }
      for (const k in BUFF_ICONS) {
        if (k === 'recall' || (k === 'silenced' && ccs.includes('silence'))) continue;
        if (tags.indexOf(k) >= 0) add(BUFF_ICONS[k][0], BUFF_ICONS[k][1], 0, BUFF_ICONS[k][2]);
      }
    }
    if (c.stealthed) add('🌿', 'Hidden', 0);
    if (c.inBush && !c.stealthed) add('🌿', 'In bush', 0);
    for (; n < MAX_CHIPS; n++) sHid(p.chips[n], true);
    // cast bar (recall)
    const rec = (c.recallUntil || 0) > srvNow; sHid(p.cs, !rec);
    if (rec) { const l = c.recallUntil - srvNow; sSty(p.csf, 'width', `${Math.max(0, 1 - l / RECALL_MS) * 100}%`); sText(p.cst, `Recall ${(l / 1000).toFixed(1)}s`); }
    place(p, pr.x, pr.y, T_PX * 0 + 150 * scale);
  }

  function smallPlate(key, e, kind, myTeam, scale, tick, myAd) {
    const pr = project(e.x, e.y); if (!pr || !pr.visible) { const q = plates.get(key); if (q) sHid(q.el, true); return; }
    const p = getPlate(key, 'small'); if (!p) return; p.seen = tick;
    const isStruct = kind === 'struct', k = e.kind;
    const big = isStruct || k === 'deadline' || k === 'golden' || k === 'big' || k === 'dummy';
    const rel = e.team === 'neutral' || !e.team ? 'neu' : e.team === myTeam ? 'ally' : 'foe';
    sCls(p.el, `bsh-np small ${rel}${big ? ' big' : ''}${k === 'deadline' || k === 'golden' ? ' epic' : ''}${isStruct ? ' struct' : ''}`);
    const lock = isStruct && e.invulnerable ? '🛡️ ' : '';
    const name = isStruct ? `${lock}${k === 'core' ? 'Production Server' : 'Server Rack'}` : (big ? UNIT_NAMES[k] || '' : '');
    sText(p.nt, name); sHid(p.nt, !name);
    sSty(p.hp, 'width', `${frac(e.hp || 0, e.maxHp || 1) * 100}%`);
    const lastHit = !isStruct && e.team !== myTeam && (k === 'melee' || k === 'ranged' || k === 'siege') && myAd > 0 && e.hp > 0 && e.hp <= myAd;
    sSty(p.hp, 'background', lastHit ? '#ffffff' : '');
    sSty(p.hp, 'box-shadow', lastHit ? '0 0 6px #ffffff' : '');
    const showHpText = isStruct && k === 'core';
    sHid(p.hpt, !showHpText);
    if (showHpText) sText(p.hpt, `${Math.max(0, Math.round(e.hp || 0))} / ${Math.round(e.maxHp || 1)}`);
    const up = (isStruct ? (k === 'core' ? 330 : 300) : k === 'deadline' ? 360 : k === 'golden' ? 200 : k === 'big' ? 220 : k === 'dummy' ? 190 : 110);
    place(p, pr.x, pr.y, up * scale);
  }

  function objPlate(key, id, u, st, myTeam, scale, tick) {
    const pr = project(u.x, u.y); if (!pr || !pr.visible) { const q = plates.get(key); if (q) sHid(q.el, true); return; }
    const p = getPlate(key, 'obj'); if (!p) return; p.seen = tick;
    const rel = u.team === 'neutral' || !u.team ? 'neu' : u.team === myTeam ? 'ally' : 'foe';
    sCls(p.el, `bsh-np small ${rel}`);
    sHid(p.nt, true);
    sSty(p.hp, 'width', `${frac(u.hp || 0, u.maxHp || 1) * 100}%`);
    const extH = window.__threeObjHeat && window.__threeObjHeat.get ? window.__threeObjHeat.get(id) : undefined;
    const hVal = extH !== undefined ? extH : objHeat.get(id);
    const ownerChamp = u.owner && st.champions && st.champions.get ? st.champions.get(u.owner)?.champ : '';
    const isTurret = u.objKind === 'turret' || u.campId === 'turret' || ownerChamp === 'embedded' || hVal !== undefined;
    sHid(p.heatWrap, !isTurret);
    if (isTurret) {
      const k = Math.max(0, Math.min(1, (hVal || 0) / 10));
      sSty(p.heatFill, 'width', `${k * 100}%`);
      sSty(p.heatFill, 'background', heatColor(k));
    }
    place(p, pr.x, pr.y, 115 * scale);
  }

  let tickN = 0;
  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (disposed || document.hidden || t - last < 50) return; last = t;
    if (suppressed) { layer.hidden = true; return; }
    const st = source.state && source.state(); if (!st) return;
    const myId = source.localId, srvNow = source.srvNow(), me = st.champions && st.champions.get ? st.champions.get(myId) : null, myTeam = me ? me.team : 'blue';
    const hide = (flags.hud && flags.hud.nameplates === false);
    if (hide) { layer.hidden = true; return; } layer.hidden = false;
    const a = project(me ? me.x : 3000, me ? me.y : 3000), b = project((me ? me.x : 3000) + 200, me ? me.y : 3000);
    const sc = a && b ? Math.abs(b.x - a.x) / 200 : 0.3; pxScale = Math.max(0.05, Math.min(3, sc));
    const tick = ++tickN, scale = pxScale, myAd = (me && me.ad) || 0;
    if (st.champions) st.champions.forEach((c, key) => {
      const id = c.id || key; if (c.dead || (c.stealthed && c.team !== myTeam)) { const q = plates.get(id); if (q) sHid(q.el, true); return; }
      champPlate(c, id, myId, myTeam, srvNow, scale, tick);
    });
    if (st.units) st.units.forEach((u, key) => {
      if (u.alive === false || u.kind === 'pet' || u.kind === 'ward' || !(u.maxHp > 0)) return;
      if (u.kind === 'obj') { objPlate('u' + key, u.id || key, u, st, myTeam, scale, tick); return; }
      smallPlate('u' + key, u, 'unit', myTeam, scale, tick, myAd);
    });
    if (st.structures) st.structures.forEach((s, key) => { if (s.alive === false || !(s.maxHp > 0)) return; smallPlate('s' + key, s, 'struct', myTeam, scale, tick, 0); });
    for (const [id, p] of plates) if (p.seen !== tick) release(id);
  }
  raf = requestAnimationFrame(frame);

  return {
    setMePos(p) { mePos = p; },
    setHidden(on) { suppressed = !!on; if (suppressed) layer.hidden = true; },
    dispose() { disposed = true; cancelAnimationFrame(raf); removeEventListener('resize', onResize); if (typeof offFx === 'function') offFx(); layer.remove(); plates.clear(); free.length = 0; objHeat.clear(); },
  };
}

export default createNameplates;

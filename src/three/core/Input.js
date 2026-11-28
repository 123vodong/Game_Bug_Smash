// Input (breakdown 3.3, task C5): DOM -> source.send. Ported (copy) from TeamModeScene.js: _onPointerDown/_onKeyDown
// (~982-1082), _order/_castSend + flush in update (~1450,1500,2019), _predict (~2431), fx snaps (~837-938).
//
// createInput({canvas, source, pick, project, camera, mode}) -> input
//   input.update(dtSec)      per frame (flushes throttled order/cast queue, runs prediction, drag-move repeat)
//   input.dispose()
//   input.pred               {x,y}|null  predicted own position (sim px). ALSO written to camera.userData.pred each frame
//                            (Camera.js follows it). Units/HUD should draw the local champion at input.pred online.
//   input.mouseWorld         {x,y}|null  cursor on the ground (sim px)
//   input.selectedId         id|null     desktop left-click inspect target
//   input.isBlocked          assignable () => bool; return true while a modal/shop/chat overlay is open (HUD sets it)
//   input.hooks              assignable callbacks, all optional: {scoreboard(bool), chat(), shop(), info(), escape(),
//                            select(id|null), ping({x,y,enemy}), toast(msg), clickMark(x,y,isAttack)}
//   input.minimapTap(x,y)    HUD minimap click (sim px) -> move order        input.minimapView(x,y,'down'|'move'|'up') camera peek
//   input.cast(slot,viaButton) / input.spell(slot,viaButton) / input.upgrade(slot) / input.recall() / input.attackNearest()
//                            / input.stop() / input.vote(yes): for HUD buttons (viaButton = auto-aim, as on touch)
// Sim px: world 0..6000 (same as server). pick(sx,sy) takes canvas-relative CSS px -> {ground:{x,y}|null, unitId|null}
// where ground is in sim px (Renderer.pick contract). Prediction needs source.world.nav (findPath/isBlocked/pushOut).
import * as R from '../../../shared/moba/rules.js';
import { CHAMP_RADIUS } from '../../../shared/moba/map.js';
import { CHAMPIONS, resolveSkill, parseKitTags, parseCcTags, CC_TYPES, autoAimsAtEnemy, autoAimReach } from '../../../shared/moba/champions.js';
import { SPELLS } from '../../../shared/moba/spells.js';
import { t } from '../../core/I18n.js';
import { AudioManager } from '../../core/AudioManager.js';
import { SaveManager } from '../../core/SaveManager.js';
import { createAim } from './aim.js';
import * as THREE from 'three';

const PRED_SNAP_PX = 120;     // mirrors TeamModeScene PRED_SNAP_PX
const DRAG_ORDER_MS = 100;    // held-button move repeat (Phaser: _dragAt)
const STICK_ORDER_MS = 110;   // arrow-key move cadence
const MOUSE_IDLE_MS = 1000;   // mouse idle -> auto-aim
const AUTO_AIM_SELF_PX = 60;  // cursor on your own champion -> auto-aim
const PING_COOLDOWN_MS = 900;
const AIM_DRAG_PX = 14;        // touch: finger travel from a skill button before it counts as a drag-aim
const NO_AIM_TYPES = new Set(['stance', 'echo', 'timebox', 'pickup', 'objcmd', 'resolve', 'rewind']); // mirrors TeamModeScene
const FORCED_CC = new Set(['suppress', 'airborne', 'charm', 'fear', 'taunt']);   // mirrors TeamModeScene
const approach = (dt, k) => 1 - Math.exp(-dt * k);

export function createInput({ canvas, source, pick, project, camera, mode = 'team' }) {
  const hooks = {};
  const input = { hooks, isBlocked: null, pred: null, mouseWorld: null, selectedId: null };
  const subs = [];
  let disposed = false;
  let lastOrderAt = -1e9, pendingOrder = null, lastCastAt = -1e9, castQueue = [], pendingCast = null;
  let moveDest = null, movePath = null, dashUntil = 0, lastMoveDir = null;
  let ptrX = -1, ptrY = -1, ptrIn = false, ptrType = 'mouse', mouseMovedAt = 0, lastPtrX = -1, lastPtrY = -1;
  let dragAt = 0, stickAt = 0, sticking = false, lastPingAt = 0, voteOpen = false, voteMine = false, noEnemyAt = -1e9, stunToastAt = -1e9, hoverAt = 0, lastCursor = '';
  const keys = new Set();
  const now = () => performance.now();
  const cam = () => (camera && camera.userData && camera.userData.cam) || null;
  const toggleCamLock = () => { const c = cam(); return c && typeof c.toggleLock === 'function' ? c.toggleLock() : undefined; };
  let audioPrimed = false;
  const primeAudio = () => {
    if (audioPrimed) return;
    audioPrimed = true;
    try { AudioManager.prime?.(); } catch (_) { /* ignore */ }
  };

  const state = () => source.state();
  const me = () => { const st = state(); return st && st.champions && st.champions.get ? st.champions.get(source.localId) : null; };
  const srvNow = () => (source.srvNow ? source.srvNow() : Date.now());
  const toast = (m) => { try { hooks.toast && hooks.toast(m); } catch (_) { /* ignore */ } };
  const blocked = () => {
    if (disposed) return true;
    const st = state();
    if (!st || (st.phase && st.phase !== 'playing') || st.winner) return true;
    return !!(input.isBlocked && input.isBlocked());
  };
  const canAct = () => { const m = me(); return !!m && !m.dead && !blocked(); };
  const send = (type, msg) => { try { source.send(type, msg); } catch (e) { console.error('[Input] send', type, e); } };

  // ---------------- throttled order / cast (copy of _order / _castSend + update flush) ----------------
  function order(msg) {
    const t = now();
    if (t - lastOrderAt < R.MOVE_ORDER_RATE_MS + 10) { pendingOrder = msg; return; }
    lastOrderAt = t; pendingOrder = null; send('order', msg);
  }
  function castSend(msg, type = 'cast') {
    const t = now(), item = { type, msg };
    if (t - lastCastAt < R.CAST_RATE_MS + 10) {
      if (castQueue.length < 3) castQueue.push(item);
      pendingCast = castQueue[0];
      return;
    }
    lastCastAt = t; pendingCast = null; send(type, msg);
  }
  function flush(t) {
    if (pendingOrder && t - lastOrderAt >= R.MOVE_ORDER_RATE_MS + 10) { const m = pendingOrder; pendingOrder = null; lastOrderAt = t; send('order', m); }
    if (pendingCast && t - lastCastAt >= R.CAST_RATE_MS + 10) {
      const it = castQueue.length ? castQueue.shift() : pendingCast;
      pendingCast = castQueue.length ? castQueue[0] : null; lastCastAt = t; send(it.type, it.msg);
    }
  }

  // ---------------- world helpers ----------------
  const entity = (id) => {
    const st = state(); if (!st || !id) return null;
    return (st.champions && st.champions.get(id)) || (st.units && st.units.get && st.units.get(id)) || (st.structures && st.structures.get && st.structures.get(id)) || null;
  };
  const myTeam = () => { const m = me(); return m ? m.team : ''; };
  const isEnemyId = (id) => { const e = entity(id); return !!e && e.team !== myTeam() && e.dead !== true && e.alive !== false && e.kind !== 'pet' && !e.invulnerable; };
  const posNow = () => input.pred || me();

  /** nearest visible enemy (champions first) to (x,y) within radius; returns entity with id or null */
  function nearestEnemy(x, y, radius, champsOnly, filt, includeStructs) {
    const st = state(); if (!st) return null;
    let best = null, bd = radius;
    const consider = (e, id) => { if (filt && !filt(id, e)) return; const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = { id, x: e.x, y: e.y }; } };
    if (st.champions) st.champions.forEach((e, id) => { if (!e.dead && e.team !== myTeam()) consider(e, id); });
    if (best || champsOnly) return best;
    if (st.units) st.units.forEach((e, id) => { if (e.hp > 0 && e.kind !== 'pet' && e.team !== myTeam()) consider(e, id); });
    if (includeStructs && st.structures) st.structures.forEach((s, id) => { if (s.alive !== false && s.hp > 0 && !s.invulnerable && s.team !== myTeam()) consider(s, id); });
    return best;
  }

  // ---------------- orders ----------------
  function checkHardCcToast() {
    const m = me(); if (!m) return;
    const sn = srvNow();
    if ((m.stunnedUntil || 0) > sn || ccList(m).includes('suppress')) {
      const t = now();
      if (t - stunToastAt >= 1200) { stunToastAt = t; toast('💫 Stunned!'); }
    }
  }
  function moveOrder(x, y, mark) {
    checkHardCcToast();
    const w = source.world, c = w && w.clampToMap ? w.clampToMap(x, y) : { x, y };
    order({ type: 'move', x: Math.round(c.x), y: Math.round(c.y) });
    const from = posNow();
    if (from) { const dx = c.x - from.x, dy = c.y - from.y, l = Math.hypot(dx, dy); if (l > 20) lastMoveDir = { x: dx / l, y: dy / l }; }
    let path = null;
    if (from && w && w.nav && w.nav.findPath) { try { path = w.nav.findPath(from.x, from.y, c.x, c.y, CHAMP_RADIUS); } catch (_) { path = null; } }
    if (!path || !path.length) path = [{ x: c.x, y: c.y }];
    movePath = path.map((q) => ({ x: q.x, y: q.y }));
    const end = movePath[movePath.length - 1];
    moveDest = { x: end.x, y: end.y };
    if (mark && hooks.clickMark) hooks.clickMark(end.x, end.y, false);
  }
  function attackOrder(id) {
    const e = entity(id);
    if (e && e.invulnerable) { toast('🛡️ That Firewall is still protected'); return; }
    checkHardCcToast();
    order({ type: 'attack', id });
    moveDest = null; movePath = null;
    if (e && hooks.clickMark) hooks.clickMark(e.x, e.y, true);
  }
  function stop() { if (!canAct()) return; cancelHeld(); order({ type: 'stop' }); moveDest = null; movePath = null; }
  function attackNearest() {
    if (!canAct()) return;
    const m = me(), p = posNow(), reach = (m.range || 300) + 160;
    const t = nearestEnemy(p.x, p.y, reach, true) || nearestEnemy(p.x, p.y, reach, false, null, true);
    if (!t) { const n = now(); if (n - noEnemyAt > 3000) { noEnemyAt = n; toast('No enemy in range'); } return; }
    attackOrder(t.id);
  }

  // ---------------- casts ----------------
  // Port of TeamModeScene._tryCast / _releaseCast / _cancelHeld / _autoAim (cast modes: tap, hold, drag, recast, global, ally targeting).
  let held = null, aimSess = null, aimFlash = null, hoverSlot = null, recastUntil = {};
  const ccList = (m) => parseCcTags((m && m.buffs) || '') || [];
  const ccForced = (m) => ccList(m).find((k) => FORCED_CC.has(k)) || '';
  const ccLabel = (k) => { const s = t(`cc.${k}`); return s === `cc.${k}` ? ((CC_TYPES[k] && CC_TYPES[k].label) || k) : s; };
  const kt = (key, def) => { const s = t(key); return s === key ? def : s; };
  const deny = (slot, text) => { try { if (hooks.deny) hooks.deny(slot, text); } catch (_) { /* ignore */ } toast(text); };
  const specFor = (m, slot) => (m ? resolveSkill(CHAMPIONS[m.champ], slot, parseKitTags(m.buffs).stance) : null);
  /** cursor on the ground; while a touch drag-aim is active, the dragged finger */
  const effMouse = () => (aimSess && aimSess.moved && aimSess.world ? aimSess.world : input.mouseWorld);
  function autoAimWanted(pos) {
    if (aimSess && aimSess.moved) return false;
    const m = input.mouseWorld;
    if (ptrType !== 'mouse' || !m || !ptrIn || !pos) return true;
    if (now() - mouseMovedAt > MOUSE_IDLE_MS) return true;
    return Math.hypot(m.x - pos.x, m.y - pos.y) <= AUTO_AIM_SELF_PX;
  }
  function allyNear(x, y, range, pos, toStruct) { // hovered / nearest living ally champion (never self) or allied tower (when toStruct) within range of the caster
    const st = state(); let best = null, bd = Infinity;
    const lim = (range || 600) + 40;
    if (st && st.champions) st.champions.forEach((v, id) => {
      if (v.dead || v.team !== myTeam() || id === source.localId) return;
      if (Math.hypot(v.x - pos.x, v.y - pos.y) > lim) return;
      const d = Math.hypot(v.x - x, v.y - y); if (d < bd) { bd = d; best = { id, x: v.x, y: v.y }; }
    });
    if (toStruct && st && st.structures) st.structures.forEach((s, id) => {
      if (s.alive === false || s.team !== myTeam() || s.kind === 'core') return;
      if (Math.hypot(s.x - pos.x, s.y - pos.y) > lim) return;
      const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = { id, x: s.x, y: s.y }; }
    });
    return best;
  }
  /** point-and-click target near a world point: picked enemy, else nearest champion, else nearest unit; range-limited for `target` skills */
  function targetNear(x, y, champOnly, sk, pos) {
    const st = state(), lim = sk && sk.type === 'target' && sk.range ? sk.range + 90 : Infinity;
    const okR = (e) => !pos || Math.hypot(e.x - pos.x, e.y - pos.y) <= lim;
    const hit = pick && ptrIn && !(aimSess && aimSess.moved) ? pick(ptrX, ptrY) : null;
    if (hit && hit.unitId && isEnemyId(hit.unitId)) {
      const e = entity(hit.unitId), isChamp = !!(st && st.champions && st.champions.get(hit.unitId)), isStruct = !!(st && st.structures && st.structures.get && st.structures.get(hit.unitId));
      if (e && !isStruct && (isChamp || !champOnly) && okR(e)) return { id: hit.unitId, x: e.x, y: e.y };
    }
    const f = (id, e) => okR(e);
    return nearestEnemy(x, y, 160, true, f) || (champOnly ? null : nearestEnemy(x, y, 160, false, f));
  }
  /** auto-aim (touch / button / idle mouse / cursor on self): self-casts, ally targeting, nearest enemy in spec reach, else facing */
  function autoAim(sk, pos) {
    if (sk.type === 'self' || sk.type === 'allies' || NO_AIM_TYPES.has(sk.type)) return { x: pos.x, y: pos.y, id: null };
    if (sk.targets === 'ally') { const al = allyNear(pos.x, pos.y, sk.range, pos, !!sk.toStruct); if (al) return al; return sk.type === 'link' ? { x: pos.x, y: pos.y, id: null } : null; }
    if (sk.type === 'swap') { const al = allyNear(pos.x, pos.y, sk.range, pos); return al ? { x: al.x, y: al.y, id: null } : null; }
    if ((sk.type === 'circle' || sk.type === 'zone' || sk.type === 'place') && !sk.range) return { x: pos.x, y: pos.y, id: null };
    if (sk.global) {
      const st = state(); let spot = null, sd = Infinity, low = null, lp = Infinity;
      if (st && st.champions) st.champions.forEach((v, id) => {
        if (v.dead || v.team === myTeam()) return;
        const d = Math.hypot(v.x - pos.x, v.y - pos.y); if (d > autoAimReach(sk)) return;
        if (String(v.buffs || '').split(',').includes('spotted') && d < sd) { sd = d; spot = { id, x: v.x, y: v.y }; }
        const f = (v.hp || 0) / Math.max(1, v.maxHp || 1); if (f < lp) { lp = f; low = { id, x: v.x, y: v.y }; }
      });
      const gt = spot || low; if (gt) return gt;
    } else if (autoAimsAtEnemy(sk)) {
      const reach = autoAimReach(sk, R.AUTO_AIM_SLACK != null ? R.AUTO_AIM_SLACK : 150), champOnly = sk.targets === 'enemyChamp';
      const tg = nearestEnemy(pos.x, pos.y, reach, true) || (champOnly ? null : nearestEnemy(pos.x, pos.y, reach, false));
      if (tg) return { x: tg.x, y: tg.y, id: tg.id };
    }
    if (sk.type === 'target') return null;
    const d = lastMoveDir || { x: 1, y: 0 }, r = sk.type === 'place' ? Math.min(sk.range || 350, 350) : Math.min(sk.range || 400, 450);
    return { x: pos.x + d.x * r, y: pos.y + d.y * r, id: null };
  }
  function kitDeny(m, sk, kit) {
    const sp = sk.spend;
    if (sp && Number(kit[sp.res] || 0) < sp.min) return kt('kit.needRes', 'Not enough resource');
    if (sk.type === 'shadow' && sk.shadow && sk.shadow.mode === 'swap' && !kit.shadow) return kt('kit.noShadow', 'No shadow to swap with');
    if (sk.type === 'deliver' && !kit.pkg) return kt('kit.noPackage', 'You are not carrying a package');
    if (sk.type === 'resolve' && !(Number(kit.pins) > 0)) return kt('kit.noPins', 'No pins placed');
    if (sk.type === 'objcmd' && !(Number(kit.turrets) > 0)) return kt('kit.noTurrets', 'No turrets deployed');
    const def = CHAMPIONS[m.champ];
    if (kit.reload && sk.type !== 'reload' && def && Object.values(def.skills || {}).some((s) => s.reload && s.reload.lockCasts)) return kt('kit.reloading', 'Reloading');
    return '';
  }
  /** Q/W/E/R. manual = {x,y} ground point (touch drag-aim) forces manual aim; viaButton = auto-aim. Returns true when something was started/sent. */
  function tryCast(slot, viaButton, manual) {
    const m = me(); if (!m || blocked()) return false;
    const sk = specFor(m, slot); if (!sk) return false;
    const sn = srvNow(), tNow = now();
    if (m.dead) { deny(slot, '\u{1F480} You are respawning'); return false; }
    if (slot === 'r' && (m.level || 1) < R.ULT_UNLOCK_LEVEL) { deny(slot, `\u{1F512} ${sk.name} unlocks at level ${R.ULT_UNLOCK_LEVEL}`); return false; }
    if (m.ranks && !(m.ranks[slot] > 0)) { deny(slot, t('skill.unlearned')); return false; }
    const kit = parseKitTags(m.buffs);
    const rcLive = (!!sk.recast && (recastUntil[slot] || 0) > tNow) || (sk.type === 'reload' && !!kit.reload) || (sk.type === 'tether' && !!kit.tether && !!(sk.tether && sk.tether.recastEnds));
    const left = (m['cd' + slot.toUpperCase()] || 0) - sn;
    if (!rcLive && left > 0) { deny(slot, `${sk.icon || ''} ${sk.name} ready in ${(left / 1000).toFixed(1)}s`); return false; }
    if (!rcLive && (m.mana || 0) < sk.mana) { deny(slot, '\u{1F4A7} Not enough mana'); return false; }
    if ((m.stunnedUntil || 0) > sn) { deny(slot, '\u{1F4AB} Stunned!'); return false; }
    const fc = ccForced(m); if (fc) { deny(slot, `${(CC_TYPES[fc] && CC_TYPES[fc].icon) || ''} ${ccLabel(fc)}`.trim()); return false; }
    const kd = rcLive ? '' : kitDeny(m, sk, kit); if (kd) { deny(slot, kd); return false; }
    const pos = posNow(); if (!pos) return false;
    const auto = !manual && (viaButton || autoAimWanted(pos));
    const em = manual || effMouse();
    let aim = auto || !em ? autoAim(sk, pos) : { x: em.x, y: em.y, id: null };
    if (!aim) { deny(slot, sk.targets === 'ally' ? kt('kit.noAlly', 'No ally in range') : '\u{1F3AF} No target in range'); return false; }
    if (sk.targets === 'ally' && !aim.id) { const al = allyNear(aim.x, aim.y, sk.range, pos, !!sk.toStruct); if (al) aim = al; }
    const mode = sk.input || 'tap';
    if (mode === 'hold' || mode === 'drag') { // hold = down now / up on release; drag = A now / B on release
      held = { slot, mode, viaButton: !!viaButton, auto, since: tNow, ax: aim.x, ay: aim.y, spec: sk };
      if (mode === 'hold') castSend({ slot, x: Math.round(aim.x), y: Math.round(aim.y), ph: 'down' });
      aimFlash = { slot, until: tNow + 260, x: aim.x, y: aim.y, id: null, auto };
      return true;
    }
    if (sk.type === 'stance') recastUntil = {};
    let id = aim.id || null;
    if ((sk.type === 'target' || (sk.type === 'dash' && sk.toTarget)) && !id) {
      const tg = targetNear(aim.x, aim.y, sk.targets === 'enemyChamp', sk, pos);
      if (tg) { id = tg.id; aim = { x: tg.x, y: tg.y }; }
    }
    if (sk.type === 'target') {
      if (!id) { deny(slot, '\u{1F3AF} Point at an enemy'); return false; }
      const tv = entity(id);
      if (tv && Math.hypot(tv.x - pos.x, tv.y - pos.y) > sk.range + 90) { deny(slot, '\u{1F4CF} Out of range'); return false; }
    }
    const msg = { slot, x: Math.round(aim.x), y: Math.round(aim.y) };
    if (id) msg.id = id;
    castSend(msg);
    if (sk.recast) recastUntil[slot] = rcLive ? 0 : tNow + sk.recast.ms;
    if (sk.type === 'dash' || sk.type === 'blink') { moveDest = null; movePath = null; }
    aimFlash = { slot, until: tNow + 260, x: aim.x, y: aim.y, id: auto ? id : null, auto };
    return true;
  }
  /** key / button up: fire a held skill at the release aim, or send a drag's second point. manual = {x,y} release point (touch drag). */
  function release(slot, manual) {
    const h = held; if (!h || h.slot !== slot) return;
    held = null;
    const m = me(); if (!m || blocked()) return;
    const pos = posNow(), mw = manual || effMouse();
    let aim = h.auto || !mw ? autoAim(h.spec, pos) : { x: mw.x, y: mw.y, id: null };
    if (!aim) aim = { x: h.ax, y: h.ay, id: null };
    if (h.mode === 'hold') send('cast', { slot, x: Math.round(aim.x), y: Math.round(aim.y), ph: 'up' }); // up / cancel are exempt from the cast rate limit
    else {
      const msg = { slot, x: Math.round(h.ax), y: Math.round(h.ay) };
      if (!h.auto && mw) { msg.x2 = Math.round(mw.x); msg.y2 = Math.round(mw.y); } // auto / touch tap: no B = server default wall
      castSend(msg);
    }
    aimFlash = { slot, until: now() + 260, x: aim.x, y: aim.y, id: null, auto: h.auto };
  }
  /** Esc / S / stun / death: cancel a held charge (free) or drop a drag in progress. */
  function cancelHeld(sendIt = true) {
    const h = held; if (!h) return;
    held = null;
    if (h.mode === 'hold' && sendIt) send('cast', { slot: h.slot, x: Math.round(h.ax), y: Math.round(h.ay), ph: 'cancel' });
  }
  const cast = (slot, viaButton) => tryCast(slot, viaButton);
  function spell(slot, viaButton, manual) {
    const m = me(); if (!m || blocked()) return;
    const K = slot.toUpperCase();
    if (!m['spell' + K]) { deny(slot, '❔ No summoner spell in that slot'); return; }
    if (m.dead) { deny(slot, '\u{1F480} You are respawning'); return; }
    const left = (m['cd' + K] || 0) - srvNow();
    if (left > 0) { deny(slot, `Ready in ${(left / 1000).toFixed(1)}s`); return; }
    if ((m.stunnedUntil || 0) > srvNow()) { deny(slot, '\u{1F4AB} Stunned!'); return; }
    const hc = ccList(m).find((k) => k === 'suppress' || k === 'airborne'); // spells stay usable under charm / fear / taunt / silence
    if (hc) { deny(slot, `${(CC_TYPES[hc] && CC_TYPES[hc].icon) || ''} ${ccLabel(hc)}`.trim()); return; }
    const aim = manual ? { x: manual.x, y: manual.y, id: null } : aimFor(viaButton); if (!aim) return;
    const msg = { slot, x: Math.round(aim.x), y: Math.round(aim.y) };
    if (aim.id) msg.id = aim.id;
    castSend(msg, 'spell');
    if (m['spell' + K] === 'flash') { moveDest = null; movePath = null; }
  }
  /** aim for a summoner spell: cursor (+ nearest enemy id) or auto-aim */
  function aimFor(viaButton) {
    const pos = posNow(); if (!pos) return null;
    if (!viaButton && !autoAimWanted(pos)) {
      const m = effMouse(); let id = null;
      const hit = pick && ptrIn ? pick(ptrX, ptrY) : null;
      if (hit && hit.unitId && isEnemyId(hit.unitId)) id = hit.unitId;
      else { const tg = nearestEnemy(m.x, m.y, 140, true); if (tg) id = tg.id; }
      return { x: m.x, y: m.y, id };
    }
    const tg = nearestEnemy(pos.x, pos.y, 900, true) || nearestEnemy(pos.x, pos.y, 700, false);
    if (tg) return { x: tg.x, y: tg.y, id: tg.id };
    const d = lastMoveDir || { x: 1, y: 0 };
    return { x: pos.x + d.x * 400, y: pos.y + d.y * 400, id: null };
  }
  // ---- touch drag-from-button aiming (HUD): beginAim on pointerdown of a skill button, moveAim on move, endAim on up ----
  function groundAt(cx, cy) { const r = canvas.getBoundingClientRect(); const h = pick ? pick(cx - r.left, cy - r.top) : null; return h && h.ground ? { x: h.ground.x, y: h.ground.y } : null; }
  function beginAim(slot, ev) {
    if (!canAct() || !'qwerdf'.includes(slot)) return false;
    aimSess = { slot, sx: ev.clientX, sy: ev.clientY, cx: ev.clientX, cy: ev.clientY, moved: false, world: null };
    if ('qwer'.includes(slot)) { const m = me(), sk = m && specFor(m, slot); if (sk && (sk.input === 'hold' || sk.input === 'drag')) tryCast(slot, true); } // starts the charge / first point (auto) now
    return true;
  }
  function moveAim(ev) {
    const s = aimSess; if (!s) return;
    s.cx = ev.clientX; s.cy = ev.clientY;
    if (!s.moved && Math.hypot(s.cx - s.sx, s.cy - s.sy) > AIM_DRAG_PX) { s.moved = true; if (held && held.slot === s.slot) held.auto = false; }
    if (s.moved) s.world = groundAt(s.cx, s.cy) || s.world;
  }
  /** cancel=true: finger released over the HUD / outside -> drop the aim (a held charge sends ph:'cancel') */
  function endAim(slot, ev, cancel) {
    const s = aimSess; if (!s || s.slot !== slot) return;
    if (ev) moveAim(ev);
    if (cancel) { aimSess = null; if (held && held.slot === slot) cancelHeld(); return; }
    const moved = s.moved, w = s.world;
    if (held && held.slot === slot) { release(slot, moved ? w : null); aimSess = null; return; }
    if (!moved || !w) { aimSess = null; if ('qwer'.includes(slot)) tryCast(slot, true); else spell(slot, true); return; }
    if ('qwer'.includes(slot)) tryCast(slot, false, w); else spell(slot, false, w);
    aimSess = null;
  }
  function upgrade(slot) {
    const m = me(); if (!canAct() || !m || !(m.skillPoints > 0) || !'qwer'.includes(slot)) return;
    send('upgrade', { slot });
  }
  function recall() { const m = me(); if (!canAct() || !m) return; if ((m.recallUntil || 0) > srvNow()) return; send('recall'); moveDest = null; movePath = null; }
  function vote(yes) {
    if (!voteOpen || voteMine || source.kind === 'offline') return;
    voteMine = true; send('vote', { yes: !!yes });
  }
  function ping() {
    const st = state(); if (!st || st.phase !== 'playing' || !input.mouseWorld) return;
    const t = now(); if (t - lastPingAt < PING_COOLDOWN_MS) return; lastPingAt = t;
    const hit = pick && ptrIn ? pick(ptrX, ptrY) : null;
    const enemy = !!(hit && hit.unitId && isEnemyId(hit.unitId));
    if (hooks.ping) hooks.ping({ x: input.mouseWorld.x, y: input.mouseWorld.y, enemy }); // Phaser pings are local only (no send)
  }

  // ---------------- pointer ----------------
  function setPtr(ev) {
    const r = canvas.getBoundingClientRect();
    ptrX = ev.clientX - r.left; ptrY = ev.clientY - r.top;
    ptrType = ev.pointerType || 'mouse';
    if (Math.abs(ptrX - lastPtrX) + Math.abs(ptrY - lastPtrY) > 3) { mouseMovedAt = now(); lastPtrX = ptrX; lastPtrY = ptrY; }
    ptrIn = ptrX >= 0 && ptrY >= 0 && ptrX <= r.width && ptrY <= r.height;
  }
  function refreshMouse() {
    if (!pick || !ptrIn) return;
    const h = pick(ptrX, ptrY);
    if (h && h.ground) input.mouseWorld = { x: h.ground.x, y: h.ground.y };
  }
  let rightHeld = false, touchHeld = false;
  const onDown = (ev) => {
    if (disposed) return;
    primeAudio();
    setPtr(ev); refreshMouse();
    if (ev.button === 1) return; // middle: camera drag handled by Camera.js
    if (!canAct()) return;
    if (ev.button === 2 && (held || (aimSess && aimSess.moved))) { cancelHeld(); aimSess = null; return; } // right-click cancels an aim in progress
    const hit = pick ? pick(ptrX, ptrY) : null;
    const g = hit && hit.ground; if (!g) return;
    const right = ev.button === 2, touch = ev.pointerType === 'touch' || ev.pointerType === 'pen';
    const picked = hit.unitId ? entity(hit.unitId) : null;
    const invulnEnemy = !!(picked && picked.invulnerable && picked.team !== myTeam() && picked.alive !== false);
    const enemyId = hit.unitId && (isEnemyId(hit.unitId) || invulnEnemy) ? hit.unitId : null;
    if (!right && !touch) { // desktop left-click: attack an enemy under the cursor, else inspect / clear selection
      input.selectedId = hit.unitId || null;
      if (hooks.select) hooks.select(input.selectedId);
      if (enemyId) attackOrder(enemyId);
      return;
    }
    if (enemyId) { attackOrder(enemyId); return; }
    moveOrder(g.x, g.y, true);
    if (right) rightHeld = true; else touchHeld = true;
    dragAt = now();
  };
  function setCursor(c) { if (c !== lastCursor) { lastCursor = c; canvas.style.cursor = c; } }
  function clearHover() { if (hooks.setHover) hooks.setHover(null); setCursor(''); }
  const onMove = (ev) => {
    if (disposed) return;
    setPtr(ev); refreshMouse();
    const t = now();
    if (t - hoverAt < 50) return;
    hoverAt = t;
    const st = state();
    if (!ptrIn || !input.mouseWorld || !st || st.phase !== 'playing' || (input.isBlocked && input.isBlocked())) { clearHover(); return; }
    const hv = hooks.hoverPick ? hooks.hoverPick(input.mouseWorld.x, input.mouseWorld.y) : null;
    if (hooks.setHover) hooks.setHover(hv);
    setCursor(hv ? (hv.rel === 'ally' ? 'pointer' : 'crosshair') : '');
  };
  const onUp = (ev) => { if (ev.button === 2) rightHeld = false; touchHeld = false; };
  const onLeave = () => { ptrIn = false; clearHover(); };
  const onCtx = (ev) => ev.preventDefault();

  // ---------------- keyboard ----------------
  const typing = (ev) => { const t = ev.target; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
  const onKeyDown = (ev) => {
    if (disposed || typing(ev)) return;
    primeAudio();
    const code = ev.code;
    keys.add(code);
    if (code === 'Escape') { if (held) { cancelHeld(); return; } hooks.escape && hooks.escape(); return; }
    if (code === 'Tab') { ev.preventDefault(); if (!ev.repeat && !(input.isBlocked && input.isBlocked())) hooks.scoreboard && hooks.scoreboard(true); return; }
    if (input.isBlocked && input.isBlocked()) return;
    if (code === 'Enter') { hooks.chat && hooks.chat(); return; }
    if (ev.ctrlKey && (code === 'KeyQ' || code === 'KeyW' || code === 'KeyE' || code === 'KeyR')) {
      ev.preventDefault(); ev.stopPropagation();
      if (!ev.repeat) upgrade(code[3].toLowerCase());
      return;
    }
    if (ev.repeat) return;
    switch (code) {
      case 'KeyQ': case 'KeyW': case 'KeyE': case 'KeyR': {
        const sl = code[3].toLowerCase();
        if (ev.shiftKey || ev.ctrlKey) { ev.preventDefault(); ev.stopPropagation(); upgrade(sl); } else tryCast(sl, false);
        break;
      }
      case 'KeyD': case 'KeyF': spell(code[3].toLowerCase(), false); break;
      case 'KeyC': hooks.info && hooks.info(); break;
      case 'KeyB': recall(); break;
      case 'KeyP': hooks.shop && hooks.shop(); break;
      case 'Space': ev.preventDefault(); attackNearest(); break; // Camera.js also treats held Space as "look at you"
      case 'KeyS': stop(); break;
      case 'Digit1': if (canAct()) send('active', {}); break;
      case 'Digit4': if (canAct() && input.mouseWorld) send('ward', { x: input.mouseWorld.x, y: input.mouseWorld.y }); break;
      case 'KeyG': ping(); break;
      case 'KeyM': {
        try {
          const muted = AudioManager.toggleMute();
          SaveManager.setMuted(muted);
          toast(muted ? '🔇 Sound muted' : '🔊 Sound on');
        } catch (_) { /* ignore */ }
        break;
      }
      case 'KeyY': if (!voteOpen) toggleCamLock(); break;
      default: break;
    }
  };
  const onKeyUp = (ev) => {
    keys.delete(ev.code);
    if (held && (ev.code === 'KeyQ' || ev.code === 'KeyW' || ev.code === 'KeyE' || ev.code === 'KeyR')) release(ev.code[3].toLowerCase());
    if (ev.code === 'Tab') { ev.preventDefault(); hooks.scoreboard && hooks.scoreboard(false); }
  };
  const onBlur = () => { cancelHeld(); aimSess = null; keys.clear(); rightHeld = touchHeld = false; hooks.scoreboard && hooks.scoreboard(false); };

  // ---------------- prediction (copy of _predict) ----------------
  function snapPred(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    moveDest = null; movePath = null;
    if (input.pred) { input.pred.x = x; input.pred.y = y; }
  }
  function predict(c, dt, t) {
    if (c.dead) { input.pred = { x: c.x, y: c.y }; moveDest = null; return; }
    if (!input.pred) input.pred = { x: c.x, y: c.y };
    const p = input.pred, sn = srvNow(), w = source.world, nav = w && w.nav;
    const err = Math.hypot(c.x - p.x, c.y - p.y);
    if (t < dashUntil) { const k = approach(dt, 18); p.x += (c.x - p.x) * k; p.y += (c.y - p.y) * k; return; }
    if (err > PRED_SNAP_PX) { p.x = c.x; p.y = c.y; if (err > 400) { moveDest = null; movePath = null; } return; }
    const canMove = !((c.stunnedUntil || 0) > sn) && !((c.rootedUntil || 0) > sn) && !((c.recallUntil || 0) > sn);
    if (moveDest && canMove) {
      const slow = (c.slowUntil || 0) > sn ? 1 - Math.min(90, c.slowPct || 0) / 100 : 1;
      let step = Math.max(0, (c.ms || 330) * slow) * dt;
      for (let guard = 0; guard < 4 && moveDest && step > 0; guard++) {
        const wp = movePath && movePath.length ? movePath[0] : moveDest;
        const dx = wp.x - p.x, dy = wp.y - p.y, d = Math.hypot(dx, dy);
        if (d <= step) {
          if (nav && nav.moveSlide) { const m = nav.moveSlide(p.x, p.y, wp.x, wp.y, CHAMP_RADIUS); p.x = m.x; p.y = m.y; }
          else { p.x = wp.x; p.y = wp.y; }
          step -= d;
          if (movePath && movePath.length) movePath.shift();
          if (!movePath || !movePath.length) { moveDest = null; movePath = null; }
        } else {
          const nx = p.x + (dx / d) * step, ny = p.y + (dy / d) * step;
          if (nav && nav.moveSlide) { const m = nav.moveSlide(p.x, p.y, nx, ny, CHAMP_RADIUS); p.x = m.x; p.y = m.y; }
          else { p.x = nx; p.y = ny; }
          step = 0;
        }
      }
      if (err > 60) {
        const k = approach(dt, 2), bx = p.x + (c.x - p.x) * k, by = p.y + (c.y - p.y) * k;
        if (nav && nav.moveSlide) { const m = nav.moveSlide(p.x, p.y, bx, by, CHAMP_RADIUS); p.x = m.x; p.y = m.y; }
        else { p.x = bx; p.y = by; }
      }
    } else {
      const k = approach(dt, 9), bx = p.x + (c.x - p.x) * k, by = p.y + (c.y - p.y) * k;
      if (nav && nav.moveSlide) { const m = nav.moveSlide(p.x, p.y, bx, by, CHAMP_RADIUS); p.x = m.x; p.y = m.y; }
      else { p.x = bx; p.y = by; }
    }
    if (nav && nav.isBlocked && nav.isBlocked(p.x, p.y, CHAMP_RADIUS)) { const q = nav.pushOut(p.x, p.y, CHAMP_RADIUS); p.x = q.x; p.y = q.y; }
  }

  // ---------------- source messages ----------------
  const sub = (type, fn) => { try { const off = source.on(type, (m) => { if (!disposed) fn(m || {}); }); if (off) subs.push(off); } catch (_) { /* ignore */ } };
  sub('fx', (m) => {
    const mine = m.sid === source.localId, t = now();
    switch (m.k) {
      case 'dash': if (mine) { moveDest = null; movePath = null; dashUntil = t + 450; } break;
      case 'blink': if (mine) { moveDest = null; movePath = null; snapPred(m.x1, m.y1); } break;
      case 'spell': if (mine && m.spell === 'flash') snapPred(m.x1, m.y1); break;
      case 'tp': if (m.id === source.localId) snapPred(m.x1, m.y1); break;
      case 'rewind': { const e = Array.isArray(m.list) ? m.list.find((q) => q && q.id === source.localId) : null; if (e) snapPred(e.x1, e.y1); break; }
      case 'reload': if (mine) { if (Number.isFinite(m.x1) && Number.isFinite(m.y1)) snapPred(m.x1, m.y1); else { moveDest = null; movePath = null; dashUntil = t + 350; } } break;
      default: break;
    }
  });
  sub('vote', (m) => {
    if (!Number.isFinite(m.endsAt)) return;
    if (m.mine === true) voteMine = true; else if (m.mine === false) voteMine = false; else if (input._voteEnds !== m.endsAt) voteMine = false;
    input._voteEnds = m.endsAt; voteOpen = true;
  });
  sub('voteEnd', () => { voteOpen = false; voteMine = false; input._voteEnds = 0; });

  // ---------------- aim preview (ground meshes, aim.js) ----------------
  let aim = null, aimTried = 0;
  function getAim(t) {
    if (aim || t - aimTried < 500) return aim;
    aimTried = t;
    const sc = (window.__three && window.__three.renderer && window.__three.renderer.scene) || null; // Renderer exposes its scene here
    if (sc) { try { aim = createAim({ THREE, scene: sc }); } catch (e) { console.warn('[Input] aim preview', e); } }
    return aim;
  }
  function updatePreview(t, m) {
    const A = getAim(t); if (!A) return;
    const pos = posNow(), fl = aimFlash && t < aimFlash.until ? aimFlash : null;
    const slot = held ? held.slot : aimSess && aimSess.moved ? aimSess.slot : hoverSlot || (fl && fl.slot);
    const sk = m && !m.dead && pos && slot && 'qwer'.includes(slot) ? specFor(m, slot) : null;
    A.begin();
    if (sk) {
      const live = !!held || !!(aimSess && aimSess.moved) || !!hoverSlot, a = live ? 1 : Math.max(0, (fl.until - t) / 260);
      const nav = source.world && source.world.nav, kit = parseKitTags(m.buffs), em = effMouse();
      if (held && held.mode === 'drag') A.drawDrag(sk, pos, { x: held.ax, y: held.ay }, held.auto || !em ? { x: held.ax, y: held.ay } : em, 1);
      else if (!(sk.range === undefined && !sk.radius && !sk.obj && !(sk.rewind && sk.rewind.radius))) {
        const charge = held && held.slot === slot && held.mode === 'hold' && sk.hold && sk.hold.maxMs > 0
          ? Math.max(0, Math.min(1, (t - held.since) / sk.hold.maxMs)) : null;
        let tg = null, tpos = null;
        if (!live) tg = fl; else if (autoAimWanted(pos) || (hoverSlot && !held)) tg = autoAim(sk, pos); else tg = em;
        if (tg) {
          const tid = live ? tg.id : fl.id; const te = tid ? entity(tid) : null;
          if (te) tpos = { x: te.x, y: te.y };
          else if ((sk.type === 'target' || (sk.type === 'dash' && sk.toTarget)) && tg) { const tn = targetNear(tg.x, tg.y, sk.targets === 'enemyChamp', sk, pos); if (tn) tpos = tn; }
          else if ((sk.targets === 'ally' || sk.type === 'swap') && tg) { const al = allyNear(tg.x, tg.y, sk.range, pos, !!sk.toStruct); if (al) tpos = al; }
          A.drawSkill(sk, pos, tg, { alpha: a, nav, kit, targetPos: tpos, charge });
        } else A.drawSkill(sk, pos, null, { alpha: a, nav, kit, charge });
      }
    } else if (m && !m.dead && pos && (slot === 'd' || slot === 'f')) {
      const spId = m['spell' + slot.toUpperCase()];
      const sp = spId && SPELLS[spId];
      if (sp) {
        const live = !!(aimSess && aimSess.moved) || !!hoverSlot;
        const a = live ? 1 : (fl ? Math.max(0, (fl.until - t) / 260) : 1);
        const nav = source.world && source.world.nav, em = effMouse();
        if (sp.kind === 'blink') {
          const tg = !live && fl ? fl : (autoAimWanted(pos) || (hoverSlot && !held) ? aimFor(true) : em);
          A.drawSkill({ type: 'blink', range: sp.range || 420, color: sp.color ?? 0xffe066 }, pos, tg, { alpha: a, nav });
        } else if (sp.kind === 'heal') {
          A.drawSelf(pos, sp.radius || 750, sp.color ?? 0x7ed957, a);
        } else if (sp.kind === 'haste' || sp.kind === 'shield') {
          A.drawSelf(pos, 110, sp.color ?? 0x39c2ff, a);
        } else if (sp.kind === 'dot' || sp.kind === 'smite') {
          const tg = !live && fl ? fl : (autoAimWanted(pos) || (hoverSlot && !held) ? aimFor(true) : em);
          let tpos = null;
          if (tg) {
            const tid = tg.id; const te = tid ? entity(tid) : null;
            if (te) tpos = { x: te.x, y: te.y };
            else { const tn = nearestEnemy(tg.x, tg.y, 160, sp.kind === 'dot'); if (tn) tpos = tn; }
          }
          A.drawSkill({ type: 'target', range: sp.range || 500, color: sp.color ?? 0xff7a1a }, pos, tg, { alpha: a, nav, targetPos: tpos });
        }
      }
    }
    A.end();
  }

  // ---------------- per-frame ----------------
  input.update = function update(dtSec) {
    if (disposed) return;
    const t = now(), dt = Math.min(0.1, Math.max(0, dtSec || 0));
    flush(t);
    const m = me();
    if (m) {
      predict(m, dt, t);
      if (camera) { camera.userData = camera.userData || {}; camera.userData.pred = input.pred; camera.userData.dead = !!m.dead; }
    } else input.pred = null;
    refreshMouse(); // the camera moves under a still cursor
    if (held && (!m || m.dead || (m.stunnedUntil || 0) > srvNow() || ccForced(m) || blocked())) cancelHeld(!(m && (m.dead || (m.stunnedUntil || 0) > srvNow()))); // stun / death / CC drop a charge or drag
    if (aimSess && aimSess.moved) { aimSess.world = groundAt(aimSess.cx, aimSess.cy) || aimSess.world; }
    updatePreview(t, m);
    // held right button / touch: repeated move orders while dragging
    if ((rightHeld || touchHeld) && ptrIn && canAct() && t - dragAt > DRAG_ORDER_MS) {
      dragAt = t;
      const h = pick ? pick(ptrX, ptrY) : null;
      if (h && h.ground && !(h.unitId && isEnemyId(h.unitId))) moveOrder(h.ground.x, h.ground.y, false);
    }
    // arrow keys -> move orders toward a point ahead (Phaser cursors)
    const ax = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0), ay = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
    if ((ax || ay) && m && canAct()) {
      sticking = true;
      if (t - stickAt > STICK_ORDER_MS) { stickAt = t; const l = Math.hypot(ax, ay), p = posNow(); moveOrder(p.x + (ax / l) * 260, p.y + (ay / l) * 260, false); }
    } else if (sticking) { sticking = false; if (canAct()) order({ type: 'stop' }); moveDest = null; }
  };

  // ---------------- public hooks for HUD ----------------
  input.minimapTap = (x, y) => { if (canAct()) moveOrder(x, y, true); };
  input.minimapView = (x, y, phase) => { const c = cam(); if (!c) return; if (phase === 'up') c.endPeek(); else c.panTo(x, y); };
  input.beginAim = beginAim; input.moveAim = moveAim; input.endAim = endAim; input.release = release; input.cancelAim = () => { cancelHeld(); aimSess = null; };
  function setHoverSlot(slot) {
    hoverSlot = slot && 'qwerdf'.includes(slot) ? slot : null;
    if (!hoverSlot && !held && !(aimSess && aimSess.moved) && aim) {
      aim.begin();
      aim.end();
    }
  }
  input.setHoverSlot = setHoverSlot;
  input.hoverSlot = setHoverSlot;
  input.toggleCamLock = toggleCamLock;
  input.heldInfo = () => held && { slot: held.slot, mode: held.mode, since: Date.now() - (now() - held.since), spec: held.spec };
  input.cast = cast; input.spell = spell; input.upgrade = upgrade; input.recall = recall;
  input.attackNearest = attackNearest; input.stop = stop; input.vote = vote;

  canvas.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('contextmenu', onCtx);
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', onBlur);

  input.dispose = function dispose() {
    if (disposed) return; disposed = true;
    clearHover();
    canvas.removeEventListener('pointerdown', onDown);
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('contextmenu', onCtx);
    removeEventListener('keydown', onKeyDown);
    removeEventListener('keyup', onKeyUp);
    removeEventListener('blur', onBlur);
    if (aim) { try { aim.dispose(); } catch (_) { /* ignore */ } aim = null; }
    for (const off of subs) { try { off(); } catch (_) { /* ignore */ } }
    subs.length = 0; pendingOrder = null; pendingCast = null; castQueue = [];
  };
  return input;
}

export default createInput;

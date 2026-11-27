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

const PRED_SNAP_PX = 120;     // mirrors TeamModeScene PRED_SNAP_PX
const DRAG_ORDER_MS = 100;    // held-button move repeat (Phaser: _dragAt)
const STICK_ORDER_MS = 110;   // arrow-key move cadence
const MOUSE_IDLE_MS = 1000;   // mouse idle -> auto-aim
const AUTO_AIM_SELF_PX = 60;  // cursor on your own champion -> auto-aim
const PING_COOLDOWN_MS = 900;
const approach = (dt, k) => 1 - Math.exp(-dt * k);

export function createInput({ canvas, source, pick, project, camera, mode = 'team' }) {
  const hooks = {};
  const input = { hooks, isBlocked: null, pred: null, mouseWorld: null, selectedId: null };
  const subs = [];
  let disposed = false;
  let lastOrderAt = -1e9, pendingOrder = null, lastCastAt = -1e9, castQueue = [], pendingCast = null;
  let moveDest = null, movePath = null, dashUntil = 0, lastMoveDir = null;
  let ptrX = -1, ptrY = -1, ptrIn = false, ptrType = 'mouse', mouseMovedAt = 0, lastPtrX = -1, lastPtrY = -1;
  let held = null, dragAt = 0, stickAt = 0, sticking = false, lastPingAt = 0, voteOpen = false, voteMine = false, noEnemyAt = -1e9;
  const keys = new Set();
  const now = () => performance.now();
  const cam = () => (camera && camera.userData && camera.userData.cam) || null;

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
  function nearestEnemy(x, y, radius, champsOnly) {
    const st = state(); if (!st) return null;
    let best = null, bd = radius;
    const consider = (e, id) => { const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = { id, x: e.x, y: e.y }; } };
    if (st.champions) st.champions.forEach((e, id) => { if (!e.dead && e.team !== myTeam()) consider(e, id); });
    if (best || champsOnly) return best;
    if (st.units) st.units.forEach((e, id) => { if (e.hp > 0 && e.kind !== 'pet' && e.team !== myTeam()) consider(e, id); });
    return best;
  }

  // ---------------- orders ----------------
  function moveOrder(x, y, mark) {
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
    order({ type: 'attack', id });
    moveDest = null; movePath = null;
    const e = entity(id);
    if (e && hooks.clickMark) hooks.clickMark(e.x, e.y, true);
  }
  function stop() { if (!canAct()) return; cancelHeld(); order({ type: 'stop' }); moveDest = null; movePath = null; }
  function attackNearest() {
    if (!canAct()) return;
    const m = me(), p = posNow(), reach = (m.range || 300) + 160;
    const t = nearestEnemy(p.x, p.y, reach, true) || nearestEnemy(p.x, p.y, reach, false);
    if (!t) { const n = now(); if (n - noEnemyAt > 3000) { noEnemyAt = n; toast('No enemy in range'); } return; }
    attackOrder(t.id);
  }

  // ---------------- casts ----------------
  function autoAimWanted(pos) {
    const m = input.mouseWorld;
    if (ptrType !== 'mouse' || !m || !ptrIn || !pos) return true;
    if (now() - mouseMovedAt > MOUSE_IDLE_MS) return true;
    return Math.hypot(m.x - pos.x, m.y - pos.y) <= AUTO_AIM_SELF_PX;
  }
  /** aim for a cast: cursor on the ground (+ hovered/nearest-to-cursor enemy id so `target` skills work), or auto-aim */
  function aimFor(viaButton) {
    const pos = posNow(); if (!pos) return null;
    if (!viaButton && !autoAimWanted(pos)) {
      const m = input.mouseWorld;
      let id = null;
      const hit = pick && ptrIn ? pick(ptrX, ptrY) : null;
      if (hit && hit.unitId && isEnemyId(hit.unitId)) id = hit.unitId;
      else { const t = nearestEnemy(m.x, m.y, 140, true); if (t) id = t.id; }
      return { x: m.x, y: m.y, id };
    }
    const t = nearestEnemy(pos.x, pos.y, 900, true) || nearestEnemy(pos.x, pos.y, 700, false);
    if (t) return { x: t.x, y: t.y, id: t.id };
    const d = lastMoveDir || { x: 1, y: 0 };
    return { x: pos.x + d.x * 400, y: pos.y + d.y * 400, id: null };
  }
  function cast(slot, viaButton) {
    const m = me(); if (!m || blocked() || m.dead) return;
    if (((m.stunnedUntil || 0) > srvNow())) { toast('Stunned!'); return; }
    // no local cooldown/mana deny: recast windows make a second press free and the server is authoritative
    const aim = aimFor(viaButton); if (!aim) return;
    const msg = { slot, x: Math.round(aim.x), y: Math.round(aim.y) };
    if (aim.id) msg.id = aim.id;
    castSend(msg);
    if (aim.id) { /* mark handled by units module via source state targetId */ }
  }
  function spell(slot, viaButton) {
    const m = me(); if (!m || blocked() || m.dead) return;
    if (!m['spell' + slot.toUpperCase()]) return; // no spell equipped
    const left = (m['cd' + slot.toUpperCase()] || 0) - srvNow();
    if (left > 0) { toast(`Ready in ${(left / 1000).toFixed(1)}s`); return; }
    if ((m.stunnedUntil || 0) > srvNow()) { toast('Stunned!'); return; }
    const aim = aimFor(viaButton); if (!aim) return;
    const msg = { slot, x: Math.round(aim.x), y: Math.round(aim.y) };
    if (aim.id) msg.id = aim.id;
    castSend(msg, 'spell');
    if (m['spell' + slot.toUpperCase()] === 'flash') { moveDest = null; movePath = null; }
  }
  function upgrade(slot) {
    const m = me(); if (!canAct() || !m || !(m.skillPoints > 0) || !'qwer'.includes(slot)) return;
    send('upgrade', { slot });
  }
  function recall() { const m = me(); if (!canAct() || !m) return; if ((m.recallUntil || 0) > srvNow()) return; send('recall'); moveDest = null; movePath = null; }
  function cancelHeld() { held = null; }
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
    setPtr(ev); refreshMouse();
    if (ev.button === 1) return; // middle: camera drag handled by Camera.js
    if (!canAct()) return;
    const hit = pick ? pick(ptrX, ptrY) : null;
    const g = hit && hit.ground; if (!g) return;
    const right = ev.button === 2, touch = ev.pointerType === 'touch' || ev.pointerType === 'pen';
    const enemyId = hit.unitId && isEnemyId(hit.unitId) ? hit.unitId : null;
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
  const onMove = (ev) => { if (disposed) return; setPtr(ev); refreshMouse(); };
  const onUp = (ev) => { if (ev.button === 2) rightHeld = false; touchHeld = false; };
  const onLeave = () => { ptrIn = false; };
  const onCtx = (ev) => ev.preventDefault();

  // ---------------- keyboard ----------------
  const typing = (ev) => { const t = ev.target; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
  const onKeyDown = (ev) => {
    if (disposed || typing(ev)) return;
    const code = ev.code;
    keys.add(code);
    if (code === 'Escape') { if (held) { cancelHeld(); return; } hooks.escape && hooks.escape(); return; }
    if (input.isBlocked && input.isBlocked()) return;
    if (code === 'Tab') { ev.preventDefault(); hooks.scoreboard && hooks.scoreboard(true); return; }
    if (code === 'Enter') { hooks.chat && hooks.chat(); return; }
    if (ev.repeat) return;
    switch (code) {
      case 'KeyQ': case 'KeyW': case 'KeyE': case 'KeyR': {
        const sl = code[3].toLowerCase();
        if (ev.shiftKey || ev.ctrlKey) { ev.preventDefault(); ev.stopPropagation(); upgrade(sl); } else cast(sl, false);
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
      case 'KeyY': if (voteOpen) vote(true); else { const c = cam(); if (c) c.toggleLock(); } break;
      case 'KeyN': if (voteOpen) vote(false); break;
      default: break;
    }
  };
  const onKeyUp = (ev) => {
    keys.delete(ev.code);
    if (ev.code === 'Tab') hooks.scoreboard && hooks.scoreboard(false);
  };
  const onBlur = () => { keys.clear(); rightHeld = touchHeld = false; };

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
          p.x = wp.x; p.y = wp.y; step -= d;
          if (movePath && movePath.length) movePath.shift();
          if (!movePath || !movePath.length) { moveDest = null; movePath = null; }
        } else { p.x += (dx / d) * step; p.y += (dy / d) * step; step = 0; }
      }
      if (err > 60) { const k = approach(dt, 2); p.x += (c.x - p.x) * k; p.y += (c.y - p.y) * k; }
    } else { const k = approach(dt, 9); p.x += (c.x - p.x) * k; p.y += (c.y - p.y) * k; }
    if (nav && nav.isBlocked && nav.isBlocked(p.x, p.y, CHAMP_RADIUS - 4)) { const q = nav.pushOut(p.x, p.y, CHAMP_RADIUS); p.x = q.x; p.y = q.y; }
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
      default: break;
    }
  });
  sub('vote', (m) => {
    if (!Number.isFinite(m.endsAt)) return;
    if (m.mine === true) voteMine = true; else if (m.mine === false) voteMine = false; else if (input._voteEnds !== m.endsAt) voteMine = false;
    input._voteEnds = m.endsAt; voteOpen = true;
  });
  sub('voteEnd', () => { voteOpen = false; voteMine = false; input._voteEnds = 0; });

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
    canvas.removeEventListener('pointerdown', onDown);
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('contextmenu', onCtx);
    removeEventListener('keydown', onKeyDown);
    removeEventListener('keyup', onKeyUp);
    removeEventListener('blur', onBlur);
    for (const off of subs) { try { off(); } catch (_) { /* ignore */ } }
    subs.length = 0; pendingOrder = null; pendingCast = null; castQueue = [];
  };
  return input;
}

export default createInput;

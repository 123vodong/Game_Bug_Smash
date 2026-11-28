// Arena input + local prediction. Click/drag to move, click a bug/dev/boss to lock on (chase + auto-smash),
// SPACE smash, Q/W/E/R skills, arrow keys, touch joystick (left half). Server stays authoritative:
// we send move{x,y} at ~20 Hz and send smash{id|targetSid|boss,kind} / castSkill{slot,dirX,dirY}.
import { WORLD_W, WORLD_H } from './source.js';
import { AudioManager } from '../../core/AudioManager.js';
import { SaveManager } from '../../core/SaveManager.js';

const MOVE_SPEED = 240;            // px/s, mirrors server client speed (MultiPlayScene MOVE_SPEED)
const SMASH_REACH = 96;            // mirrors server SMASH_RADIUS
const SKILL_COST = { q: 10, w: 15, e: 8, r: 25 };
const SEND_MS = 50;

export function skillCost(slot, st) { return st && st.event === 'hackathon' ? 0 : (SKILL_COST[slot] || 0); }

export function createArenaInput({ canvas, source, view, hudRoot, onMenu = null, onChatFocus = null }) {
  const pos = view.localPos;
  let dead = false, moveTarget = null, lastDX = 1, lastDY = 0, lastSent = 0, smashCdUntil = 0;
  let predictUntil = 0, passUntil = 0, dash = null, chatOpen = false;
  const keys = new Set(), stick = { x: 0, y: 0, id: -1, ox: 0, oy: 0 };
  const ptr = { down: false, id: -1, sx: 0, sy: 0, t0: 0, moved: false };
  const tmp = { x: 0, y: 0 };
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || /[?&]touch=1/.test(location.search);
  const now = () => performance.now();
  const meState = () => source.state().me;
  const truce = () => { const st = source.state(); return st.event === 'deadline_boss' || Date.now() < truceUntil; };
  let truceUntil = 0;
  const offs = [source.on('announce', (m) => { if (m && m.kind === 'eventEnd' && m.id === 'deadline_boss') truceUntil = Date.now() + 4000; })];

  // ----- obstacles: slide-along clamp mirroring server rules.clampToFreeSpace -----
  let obCache = null;
  const inOb = (x, y) => {
    let hit = false;
    source.state().obstacles.forEach((o) => { if (!hit && x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) hit = true; });
    return hit;
  };
  function clampMove(fx, fy, tx, ty) {
    if (now() < passUntil || inOb(fx, fy)) { tmp.x = tx; tmp.y = ty; return tmp; }
    let x = tx; if (inOb(x, fy)) x = fx;
    let y = ty; if (inOb(x, y)) y = fy;
    tmp.x = x; tmp.y = y; return tmp;
  }

  // ----- targets -----
  const tp = { x: 0, y: 0 };
  function lockPos() { return view.lock.kind ? view.entityPos(view.lock.kind, view.lock.id, tp) : null; }
  function setLock(kind, id) { view.lock.kind = kind || ''; view.lock.id = id || ''; }

  function smash(kind = 'smash') {
    const t = now(); if (t < smashCdUntil) return false;
    const me = meState(); if (!me || me.broken || me.away) return false;
    if ((me.stunnedUntil || 0) > source.srvNow()) return false;
    const st = source.state(), reach = kind === 'punch' ? 112 : SMASH_REACH, bossReach = reach + 64, ts = truce();
    const bp = view.boss && view.boss.alive ? view.boss : null;
    const bossD = bp ? Math.hypot(bp.x - pos.x, bp.y - pos.y) : Infinity;
    const swing = () => { smashCdUntil = t + 220; view.localAct('smash'); };
    // locked target first
    if (view.lock.kind) {
      const p = lockPos(); if (!p) { setLock(); return false; }
      const d = Math.hypot(p.x - pos.x, p.y - pos.y);
      if (view.lock.kind === 'boss') { if (d < bossReach) { source.send('smash', { boss: view.lock.id, kind }); swing(); return true; } return false; }
      if (d >= reach) return false;
      source.send('smash', view.lock.kind === 'player' ? { kind, targetSid: view.lock.id } : { kind, id: view.lock.id }); swing(); return true;
    }
    let bestId = null, bestD = Infinity;
    st.bugs.forEach((b, id) => { if (!b.alive || b.hidden) return; const d = Math.hypot(b.x - pos.x, b.y - pos.y); if (d < reach && d < bestD) { bestD = d; bestId = id; } });
    if (bossD < bossReach && (bestId == null || bossD - 64 < bestD)) { source.send('smash', { boss: bp.id, kind }); swing(); return true; }
    let pSid = null, pD = Infinity;
    if (!ts) st.players.forEach((p, sid) => { if (sid === source.localId || p.broken) return; const d = Math.hypot(p.x - pos.x, p.y - pos.y); if (d < reach && d < pD) { pD = d; pSid = sid; } });
    if (pSid != null && pD < bestD) { source.send('smash', { kind, targetSid: pSid }); swing(); return true; }
    if (bestId == null) { smashCdUntil = t + 220; return false; }
    source.send('smash', { kind, id: bestId }); swing(); return true;
  }

  // ----- skills -----
  const SEARCH = 360;
  function cast(slot) {
    const me = meState(); if (!me || me.broken || me.away) return false;
    if ((me.stunnedUntil || 0) > source.srvNow()) return false;
    const st = source.state();
    if ((me.energy | 0) < skillCost(slot, st)) return false;
    if ((me['cd' + slot.toUpperCase()] || 0) > source.srvNow()) return false;
    const payload = { slot }, t = now();
    const anim = slot === 'q' ? 'punch' : slot === 'w' ? 'parry' : slot === 'e' ? 'jump' : 'kick';
    if (slot === 'q') { // Bug Dash: auto-aim nearest enemy within SEARCH
      let bx = null, by = null, bd = Infinity;
      st.bugs.forEach((b) => { if (!b.alive || b.hidden) return; const d = Math.hypot(b.x - pos.x, b.y - pos.y); if (d < SEARCH && d < bd) { bd = d; bx = b.x; by = b.y; } });
      if (!truce()) st.players.forEach((p, sid) => { if (sid === source.localId) return; const d = Math.hypot(p.x - pos.x, p.y - pos.y); if (d < SEARCH && d < bd) { bd = d; bx = p.x; by = p.y; } });
      const bp = view.boss && view.boss.alive ? view.boss : null;
      if (bp) { const d = Math.hypot(bp.x - pos.x, bp.y - pos.y) - 60; if (d < SEARCH && d < bd) { bd = d; bx = bp.x; by = bp.y; } }
      if (bx == null) return false; // whiff, no energy spent
      const dx = bx - pos.x, dy = by - pos.y, l = Math.hypot(dx, dy) || 1; payload.dirX = dx / l; payload.dirY = dy / l;
      startDash(payload.dirX, payload.dirY, 140, 180); predictUntil = t + 500; passUntil = t + 350;
    } else if (slot === 'e') { // Debug Roll along last movement direction
      const l = Math.hypot(lastDX, lastDY) || 1; payload.dirX = lastDX / l; payload.dirY = lastDY / l;
      startDash(payload.dirX, payload.dirY, 180, 250); predictUntil = t + 570; passUntil = t + 350;
    } else if (slot === 'r') { view.shockwave(pos.x, pos.y, 160, 0xff5252); view.shake(0.6); }
    else if (slot === 'w') view.shockwave(pos.x, pos.y, 70, 0x39c2ff);
    view.localAct(anim);
    source.send('castSkill', payload);
    return true;
  }
  function startDash(dx, dy, dist, ms) {
    dash = { fx: pos.x, fy: pos.y, tx: Math.max(0, Math.min(WORLD_W, pos.x + dx * dist)), ty: Math.max(0, Math.min(WORLD_H, pos.y + dy * dist)), t0: now(), ms };
  }

  // ----- pointer / keyboard -----
  let audioPrimed = false;
  const primeAudio = () => { if (audioPrimed) return; audioPrimed = true; try { AudioManager.prime?.(); } catch (_) { /* audio optional */ } };
  const rect = () => canvas.getBoundingClientRect();
  function onDown(e) {
    primeAudio();
    if (dead || (isTouch && e.pointerType === 'touch' && e.clientX < rect().left + rect().width * 0.4 && !e.target.closest('[data-bsa-tap]') && false)) return;
    if (e.pointerType === 'touch' && e.clientX < window.innerWidth * 0.5 && stick.id < 0) { stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0; showStick(e.clientX, e.clientY); try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } return; }
    if (e.button > 0) return;
    ptr.down = true; ptr.id = e.pointerId; ptr.t0 = now(); ptr.moved = false; ptr.sx = e.clientX; ptr.sy = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    const r = rect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const t = view.pickTarget(x, y, truce());
    if (t) { setLock(t.kind, t.id); moveTarget = null; }
    else if (view.pickGround(x, y, tmp)) { setLock(); moveTarget = { x: tmp.x, y: tmp.y }; view.moveMarker(tmp.x, tmp.y); }
  }
  function onMove(e) {
    if (e.pointerId === stick.id) { const dx = e.clientX - stick.ox, dy = e.clientY - stick.oy, l = Math.hypot(dx, dy), m = Math.min(l, 60); stick.x = l > 8 ? dx / l * (m / 60) : 0; stick.y = l > 8 ? dy / l * (m / 60) : 0; moveStick(stick.ox + stick.x * 60, stick.oy + stick.y * 60); return; }
    if (!ptr.down || e.pointerId !== ptr.id) return;
    if (Math.hypot(e.clientX - ptr.sx, e.clientY - ptr.sy) > 10) ptr.moved = true;
    if (ptr.moved && !view.lock.kind) { const r = rect(); if (view.pickGround(e.clientX - r.left, e.clientY - r.top, tmp)) moveTarget = { x: tmp.x, y: tmp.y }; }
  }
  function onUp(e) {
    if (e.pointerId === stick.id) { stick.id = -1; stick.x = stick.y = 0; hideStick(); return; }
    if (e.pointerId === ptr.id) { ptr.down = false; ptr.id = -1; }
  }
  const KEYMAP = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd' };
  function onKeyDown(e) {
    if (dead || chatOpen) return;
    const tag = (e.target && e.target.tagName) || ''; if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    primeAudio();
    const k = e.key;
    if (e.code === 'KeyM') { try { const m = AudioManager.toggleMute(); SaveManager.setMuted(m); } catch (_) { /* ignore */ } return; }
    if (k === ' ') { e.preventDefault(); smash(); return; }
    if (k === 'q' || k === 'Q') return void cast('q');
    if (k === 'w' || k === 'W') return void cast('w');
    if (k === 'e' || k === 'E') return void cast('e');
    if (k === 'r' || k === 'R') return void cast('r');
    if (k === 'Enter' || k === 't' || k === 'T') { e.preventDefault(); if (onChatFocus) onChatFocus(); return; }
    if (k === 'Escape') { if (onMenu) onMenu(); return; }
    const m = KEYMAP[k];
    if (m) { if (k.startsWith('Arrow')) e.preventDefault(); keys.add(m); }
  }
  function onKeyUp(e) { const m = KEYMAP[e.key]; if (m) keys.delete(m); }
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp);
  canvas.style.touchAction = 'none';

  // touch joystick visuals (created lazily, DOM)
  let stickEl = null, knobEl = null;
  function showStick(x, y) {
    if (!stickEl) {
      stickEl = document.createElement('div'); stickEl.style.cssText = 'position:fixed;width:120px;height:120px;border-radius:50%;border:2px solid rgba(57,194,255,.6);background:rgba(20,27,54,.35);pointer-events:none;z-index:5;transform:translate(-50%,-50%)';
      knobEl = document.createElement('div'); knobEl.style.cssText = 'position:absolute;left:50%;top:50%;width:52px;height:52px;border-radius:50%;background:rgba(126,217,87,.8);transform:translate(-50%,-50%)'; stickEl.appendChild(knobEl); (hudRoot || document.body).appendChild(stickEl);
    }
    stickEl.style.left = x + 'px'; stickEl.style.top = y + 'px'; stickEl.style.display = 'block'; knobEl.style.transform = 'translate(-50%,-50%)';
  }
  function moveStick(x, y) { if (knobEl) knobEl.style.transform = `translate(calc(-50% + ${x - stick.ox}px),calc(-50% + ${y - stick.oy}px))`; }
  function hideStick() { if (stickEl) stickEl.style.display = 'none'; }

  // ----- per-frame -----
  let ready = false;
  function update(dt) {
    if (dead) return;
    const me = meState(); if (!me) return;
    const t = now();
    if (!ready) { pos.x = me.x; pos.y = me.y; pos.has = true; ready = true; }
    const stunned = (me.stunnedUntil || 0) > source.srvNow(), frozen = me.broken || me.away;
    // adopt server moves we did not predict (slam / knockback / respawn)
    if (t > predictUntil && !dash && Math.hypot(me.x - pos.x, me.y - pos.y) > 90) { pos.x = me.x; pos.y = me.y; }
    if (me.broken && Math.hypot(me.x - pos.x, me.y - pos.y) > 4) { pos.x = me.x; pos.y = me.y; }
    if (dash) {
      const u = Math.min(1, (t - dash.t0) / dash.ms), e = 1 - Math.pow(1 - u, 3);
      pos.x = dash.fx + (dash.tx - dash.fx) * e; pos.y = dash.fy + (dash.ty - dash.fy) * e; if (u >= 1) dash = null;
    } else if (!frozen && !stunned && !chatOpen) {
      let dx = 0, dy = 0;
      if (keys.size) { dx = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0); dy = (keys.has('d') ? 1 : 0) - (keys.has('u') ? 1 : 0); const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; moveTarget = null; setLock(); }
      else if (stick.x || stick.y) { dx = stick.x; dy = stick.y; moveTarget = null; setLock(); }
      else if (view.lock.kind) {
        const p = lockPos();
        if (!p) setLock();
        else {
          const tx = p.x - pos.x, ty = p.y - pos.y, d = Math.hypot(tx, ty), boss = view.lock.kind === 'boss';
          const reach = boss ? SMASH_REACH + 64 : SMASH_REACH, hug = boss ? 110 : view.lock.kind === 'player' ? 60 : 28;
          if (d < reach - 6) smash();
          if (d > hug) { dx = tx / d; dy = ty / d; }
        }
      } else if (moveTarget) {
        const tx = moveTarget.x - pos.x, ty = moveTarget.y - pos.y, d = Math.hypot(tx, ty);
        if (d < 4) moveTarget = null; else { dx = tx / d; dy = ty / d; }
      }
      if (dx || dy) {
        const o = clampMove(pos.x, pos.y, Math.max(0, Math.min(WORLD_W, pos.x + dx * MOVE_SPEED * dt)), Math.max(0, Math.min(WORLD_H, pos.y + dy * MOVE_SPEED * dt)));
        pos.x = o.x; pos.y = o.y; lastDX = dx; lastDY = dy;
      }
      if (t - lastSent > SEND_MS && (dx || dy || t - lastSent > 1000)) { lastSent = t; source.send('move', { x: pos.x, y: pos.y }); }
    }
    if (dash && t - lastSent > SEND_MS) { /* server runs the dash itself */ }
  }

  return {
    update, smash, cast, isTouch, skillCost,
    setChatOpen(v) { chatOpen = !!v; if (v) keys.clear(); },
    get pos() { return pos; },
    dispose() {
      dead = true; offs.forEach((f) => f());
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp);
      if (stickEl) stickEl.remove();
    },
  };
}

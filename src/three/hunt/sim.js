// HuntSim — Phaser-free port of the SP campaign (HuntScene + Hunter + Bug + BugSpawner + SkillManager).
// Injected clock: the sim owns `now` (ms) and advances it only in update(dtMs). Injected rng for tests.
// Playfield is the classic 1280x720 px space (mirrors Phaser scale; the view maps px -> world).
// Events (sim.on(name, fn)): smash{bug,killed,dmg}, kill{bug,score,combo,tier,tierUp}, combo{combo,tier,mult},
//   comboEnd, pickupSpawn{pickup}, pickup{pickup,def}, pickupExpire{pickup}, skillEnd{id}, bugHide{bug}, bugRespawn{bug},
//   glitch{bug,from,to}, extraBug{bug}, coach{step,line}, coachEnd, clockRelease, tick{sec}, warn{sec}, win{...}, lose{...}.
import { BUGS } from '../../data/bugs.js';
import { SKILLS, SKILL_IDS } from '../../data/skills.js';
import { LEVELS, TOTAL_LEVELS, starsFor } from '../../data/levels.js';
import { TALK, pickWinCategory, pickLoseCategory } from '../../data/talk.js';

export const W = 1280, H = 720;
export const FAIL_MESSAGES = [
  'CUSTOMER IS ANGRY', 'WHY IS THIS NOT FIXED?', '8PM EMERGENCY MEETING',
  'BUG STILL OPEN', 'PRODUCTION IS DOWN', 'ROLLBACK INITIATED',
];
export const PLAYER_RADIUS = 24;
const MAX_SPEED = 380, ACCEL = 1800, STOP_RADIUS = 8, MOVE_THRESHOLD = 30, SMASH_POSE_MS = 150;
const FLEE_RADIUS = 260, PANIC_RADIUS = 110, WANDER_MS = 1500, SMASH_COOLDOWN_MS = 200;
const BASE_HIDDEN_MS = 3500, MIN_HIDDEN_MS = 1100;
const PICKUP_LIFE_MS = 12000, PICKUP_RADIUS = 20;
const COMBO_WINDOW_MS = 1500, CLOCK_HOLD_MAX_MS = 6000;

export class Emitter {
  constructor() { this._h = {}; }
  on(n, f) { (this._h[n] ||= []).push(f); return () => this.off(n, f); }
  off(n, f) { const a = this._h[n]; if (a) this._h[n] = a.filter((x) => x !== f); }
  emit(n, p) { const a = this._h[n]; if (a) for (const f of a.slice()) f(p); }
}

export function comboMult(c) { return c >= 10 ? 3 : c >= 5 ? 2 : c >= 3 ? 1.5 : 1; }
export function comboTier(c) { return c >= 10 ? 3 : c >= 5 ? 2 : c >= 3 ? 1 : 0; }
export function comboColor(c) { return c >= 10 ? '#ff5252' : c >= 5 ? '#ff9800' : c >= 3 ? '#ffd23f' : '#ffffff'; }

export class HuntSim extends Emitter {
  /** @param {{levelIndex?:number, rng?:()=>number, flags?:{get(k):any,set(k,v):void}, touch?:boolean}} o */
  constructor(o = {}) {
    super();
    let idx = o.levelIndex ?? 0;
    idx = Math.max(0, Math.min(TOTAL_LEVELS - 1, idx | 0));
    this.levelIndex = idx;
    this.level = LEVELS[idx];
    this.rng = o.rng || Math.random;
    this.flags = o.flags || null;
    this.touch = !!o.touch;
    this.now = 0;
    this.state = 'playing'; // 'playing' | 'won' | 'lost'
    this.score = 0;
    this.timeLeftMs = this.level.timeLimitMs;
    this.deadlineProgress = 0;
    this.combo = 0; this.comboTimeoutMs = 0;
    this.hunter = { x: W / 2, y: H / 2, vx: 0, vy: 0, tx: W / 2, ty: H / 2, speedMul: 1, facingLeft: false, pose: 'idle', smashUntil: 0 };
    this.hold = false; this._pressAt = 0;
    this.bugs = []; this.totalSpawned = 0; this.totalKilled = 0;
    this.pickups = []; this.effects = {}; this._extraBugOnHit = 0; this._nid = 1;
    this.result = null; this.failMessage = null; this.talk = null;

    this.totalBugs = Object.values(this.level.wave).reduce((s, n) => s + n, 0);
    this._spawnWave(this.level.wave);
    const tut = this.level.tutorialBugs;
    if (tut && tut.count > 0) for (const b of this.bugs.slice(0, tut.count)) if (b.maxHp < tut.hp) { b.maxHp = tut.hp; b.hp = tut.hp; }

    // Timers (Phaser time events): skills every N ms starting at (N - 5000); glitch every 12 s starting at 6 s.
    const sk = this.level.skillSpawnEveryMs ?? 8000;
    this._skillEvery = sk; this._nextSkillAt = Math.max(0, sk - 5000);
    this._glitch = this.level.gimmick === 'glitchRelocate'; this._nextGlitchAt = 6000;

    // Coach (1-1): move -> HOLD -> AI tools; the clock waits for the first kill (or 6 s).
    this.coach = null; this.clockHeld = false; this._heldMs = 0; this._lastKey = null;
    if (idx === 0 && !(this.flags && this.flags.get('coachCampaign'))) this._startCoach();
    this._lastSecond = Math.ceil(this.timeLeftMs / 1000); this._warned = new Set();
    this.lastKill = null;
  }

  // ------------------------------------------------------------ input
  setTarget(x, y) { if (this.state !== 'playing') return; this.hunter.tx = x; this.hunter.ty = y; }
  setHold(on) {
    if (on && !this.hold) this._pressAt = this.now;
    if (!on && this.hold) this._onRelease();
    this.hold = !!on;
  }

  // ------------------------------------------------------------ spawning
  _edgePos() {
    const e = Math.floor(this.rng() * 4), r = this.rng;
    if (e === 0) return [r() * (W - 100) + 50, 70];
    if (e === 1) return [W - 30, r() * (H - 110) + 80];
    if (e === 2) return [r() * (W - 100) + 50, H - 40];
    return [30, r() * (H - 110) + 80];
  }
  _spawnWave(cfg) {
    for (const [id, n] of Object.entries(cfg)) for (let i = 0; i < n; i++) { const [x, y] = this._edgePos(); this.spawnBug(id, x, y); }
  }
  spawnBug(id, x, y) {
    const d = BUGS[id]; if (!d) throw new Error('Unknown bug id: ' + id);
    const m = this.level;
    let hp = d.hp;
    if ((m.bugHpMul ?? 1) !== 1) hp = Math.max(1, Math.ceil(hp * m.bugHpMul));
    const b = {
      uid: this._nid++, id, maxHp: hp, hp, baseSpeed: d.speed * (m.bugSpeedMul ?? 1), lifetimeMs: d.lifetimeMs,
      score: d.score, radius: d.radius, panic: d.panic, x, y, vx: 0, vy: 0, alive: true, visible: true,
      diesAt: this.now + d.lifetimeMs, nextWanderAt: this.now + 600, burstUntil: 0, lastSmashAt: 0, respawnAt: 0, flashUntil: 0, fading: false,
    };
    this.bugs.push(b); this.totalSpawned++;
    return b;
  }

  // ------------------------------------------------------------ bug AI
  _bugUpdate(b, dtMs) {
    const dt = dtMs / 1000, now = this.now, hx = this.hunter.x, hy = this.hunter.y, rng = this.rng;
    if (now > b.diesAt) { this._hide(b); return; }
    const dx = b.x - hx, dy = b.y - hy, dist = Math.hypot(dx, dy);
    let speed = b.baseSpeed; if (now < b.burstUntil) speed *= 1.6;
    if (dist < FLEE_RADIUS) {
      const f = 1 - dist / FLEE_RADIUS, sm = 1 + f * 0.6, len = Math.max(dist, 1);
      b.vx = b.vx * 0.78 + (dx / len) * speed * sm * 0.22;
      b.vy = b.vy * 0.78 + (dy / len) * speed * sm * 0.22;
      if (dist < PANIC_RADIUS) {
        const pc = b.panic * dt;
        if (rng() < pc) { const a = rng() * Math.PI * 2; b.vx = Math.cos(a) * speed * 1.5; b.vy = Math.sin(a) * speed * 1.5; }
        if (now > b.burstUntil && rng() < pc * 0.6) b.burstUntil = now + 400;
      }
    } else if (now > b.nextWanderAt) {
      const a = rng() * Math.PI * 2;
      b.vx = Math.cos(a) * speed * 0.55; b.vy = Math.sin(a) * speed * 0.55; b.nextWanderAt = now + WANDER_MS;
    }
    const vm = Math.hypot(b.vx, b.vy), vmax = speed * 1.9;
    if (vm > vmax) { const k = vmax / vm; b.vx *= k; b.vy *= k; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < 22) { b.x = 22; b.vx = Math.abs(b.vx); }
    if (b.x > W - 22) { b.x = W - 22; b.vx = -Math.abs(b.vx); }
    if (b.y < 70) { b.y = 70; b.vy = Math.abs(b.vy); }
    if (b.y > H - 30) { b.y = H - 30; b.vy = -Math.abs(b.vy); }
    b.blink = (b.diesAt - now) / b.lifetimeMs < 0.3; // view pulses alpha when about to hide
  }
  _hide(b) {
    if (!b.alive || !b.visible) return;
    b.visible = false;
    const dl = Math.max(0, Math.min(1, this.deadlineProgress));
    b.respawnAt = this.now + (BASE_HIDDEN_MS - (BASE_HIDDEN_MS - MIN_HIDDEN_MS) * dl);
    this.emit('bugHide', { bug: b });
  }
  _respawn(b) {
    if (!b.alive) return;
    const [x, y] = this._edgePos();
    b.x = x; b.y = y; b.vx = 0; b.vy = 0; b.diesAt = this.now + b.lifetimeMs; b.nextWanderAt = this.now + 600;
    b.lastSmashAt = 0; b.visible = true; b.blink = false; b.respawnAt = 0;
    this.emit('bugRespawn', { bug: b });
  }
  _trySmash(b, dmg) {
    if (!b.alive || !b.visible) return { hit: false, killed: false };
    if (this.now - b.lastSmashAt < SMASH_COOLDOWN_MS) return { hit: false, killed: false };
    b.lastSmashAt = this.now; b.hp -= dmg; b.flashUntil = this.now + 60;
    if (b.hp <= 0) { b.alive = false; b.visible = false; this.totalKilled++; return { hit: true, killed: true }; }
    return { hit: true, killed: false };
  }

  // ------------------------------------------------------------ hunter
  _hunterUpdate(dtMs) {
    const h = this.hunter, dt = dtMs / 1000;
    const dx = h.tx - h.x, dy = h.ty - h.y, dist = Math.hypot(dx, dy);
    if (dist > STOP_RADIUS) { h.vx += (dx / dist) * ACCEL * dt; h.vy += (dy / dist) * ACCEL * dt; } else { h.vx *= 0.82; h.vy *= 0.82; }
    const sp = Math.hypot(h.vx, h.vy), maxV = MAX_SPEED * h.speedMul;
    if (sp > maxV) { const k = maxV / sp; h.vx *= k; h.vy *= k; }
    h.x += h.vx * dt; h.y += h.vy * dt;
    if (h.x < 30) { h.x = 30; h.vx = 0; } if (h.x > W - 30) { h.x = W - 30; h.vx = 0; }
    if (h.y < 40) { h.y = 40; h.vy = 0; } if (h.y > H - 40) { h.y = H - 40; h.vy = 0; }
    if (Math.sign(h.vx) !== 0) h.facingLeft = h.vx < 0;
    h.speed = Math.hypot(h.vx, h.vy);
    h.pose = this.now < h.smashUntil ? 'smash' : (h.speed > MOVE_THRESHOLD ? 'run' : 'idle');
  }
  teleportTo(x, y) { const h = this.hunter; h.x = x; h.y = y; h.vx = 0; h.vy = 0; h.tx = x; h.ty = y; this.emit('teleport', { x, y }); }

  // ------------------------------------------------------------ skills
  _rollSkill() {
    const bag = [];
    for (const id of SKILL_IDS) for (let i = 0; i < (SKILLS[id].spawnWeight ?? 1); i++) bag.push(id);
    return bag[Math.floor(this.rng() * bag.length)];
  }
  spawnPickup(id, x, y) {
    const def = SKILLS[id]; if (!def) throw new Error('Unknown skill id: ' + id);
    const p = { uid: this._nid++, id, def, x, y, radius: PICKUP_RADIUS, alive: true, diesAt: this.now + PICKUP_LIFE_MS };
    this.pickups.push(p); this.emit('pickupSpawn', { pickup: p }); return p;
  }
  spawnPickupRandom() {
    const m = 80;
    return this.spawnPickup(this._rollSkill(), m + this.rng() * (W - m * 2), m + 60 + this.rng() * (H - m * 2 - 60));
  }
  _collect(p) {
    p.alive = false; this.emit('pickup', { pickup: p, def: p.def });
    const e = p.def.effect, h = this.hunter;
    if (e.teleportToBug) { const t = this._nearestBug(); if (t) this.teleportTo(t.x, t.y); }
    if (e.respawnAllBugs) for (const b of this.bugs) if (b.alive && !b.visible) this._respawn(b);
    if (e.speedBoost) { this._activate(p.def, { speedBoost: e.speedBoost }); h.speedMul *= e.speedBoost; }
    if (e.oneShotSmash) this._activate(p.def, { oneShotSmash: true });
    if (e.random) {
      const pick = e.random[Math.floor(this.rng() * e.random.length)];
      const [kind, vs] = pick.split(':'); const v = parseFloat(vs);
      if (kind === 'slowPlayer') { this._activate(p.def, { slowPlayer: v, _label: 'SLOWED' }); h.speedMul *= v; }
      else if (kind === 'extraBugOnHit') { this._activate(p.def, { extraBugOnHit: v, _label: 'BUGS PER HIT' }); this._extraBugOnHit += v; }
    }
  }
  _activate(def, mods) {
    if (this.effects[def.id]) this._deactivate(def.id, true);
    this.effects[def.id] = { def, modifiers: mods, startedAt: this.now, endsAt: this.now + def.durationMs };
  }
  _deactivate(id, silent) {
    const a = this.effects[id]; if (!a) return;
    const m = a.modifiers;
    if (m.speedBoost) this.hunter.speedMul /= m.speedBoost;
    if (m.slowPlayer) this.hunter.speedMul /= m.slowPlayer;
    if (m.extraBugOnHit) this._extraBugOnHit -= m.extraBugOnHit;
    delete this.effects[id];
    if (!silent) this.emit('skillEnd', { id });
  }
  isActive(id) { return !!this.effects[id]; }
  _nearestBug() {
    let best = null, bd = Infinity;
    for (const b of this.bugs) { if (!b.alive || !b.visible) continue; const d = Math.hypot(b.x - this.hunter.x, b.y - this.hunter.y); if (d < bd) { bd = d; best = b; } }
    return best;
  }

  // ------------------------------------------------------------ gimmick
  _glitchRelocateOne() {
    const alive = this.bugs.filter((b) => b.alive && b.visible);
    if (!alive.length) return;
    const b = alive[Math.floor(this.rng() * alive.length)], m = 60;
    const from = { x: b.x, y: b.y }, to = { x: m + this.rng() * (W - m * 2), y: m + this.rng() * (H - m * 2) };
    b.x = to.x; b.y = to.y;
    this.emit('glitch', { bug: b, from, to });
  }

  // ------------------------------------------------------------ coach
  _startCoach() {
    const t = this.touch;
    this.coach = {
      step: 0, t: 0, moved: 0, nudgeUntil: 0,
      lines: [
        t ? 'Drag your finger — you follow it like a PM follows deadlines.' : 'Move the mouse — you follow it like a PM follows deadlines.',
        t ? 'HOLD your finger on a bug to smash it.\nOne tap is a code review, not a fix.' : 'HOLD the click on a bug to smash it.\nOne click is a code review, not a fix.',
        'Glowing things are AI tools. Results may vary.',
      ],
      nudge: t ? 'Keep your finger DOWN — hold it on the bug!' : 'Keep the button DOWN — hold it on the bug!',
    };
    this.clockHeld = true;
    this._coachStep(0);
  }
  _coachStep(i) {
    const co = this.coach; if (!co) return;
    co.step = i; co.t = 0;
    if (i >= co.lines.length) { this._endCoach(); return; }
    this.emit('coach', { step: i, total: co.lines.length, line: co.lines[i] });
  }
  _endCoach() {
    if (!this.coach) return;
    this.coach = null;
    if (this.flags) this.flags.set('coachCampaign', true);
    this.emit('coachEnd', {});
  }
  _releaseClock() { if (!this.clockHeld) return; this.clockHeld = false; this.emit('clockRelease', {}); }
  _onRelease() {
    const co = this.coach;
    if (!co || co.step !== 1 || this.state !== 'playing') return;
    if (this.now - this._pressAt < 220) { co.nudgeUntil = this.now + 1600; this.emit('coachNudge', { line: co.nudge }); }
  }
  /** Text the coach pill should show right now (nudge overrides the step line for 1.6 s). */
  coachLine() { const c = this.coach; if (!c) return ''; return (c.step === 1 && this.now < c.nudgeUntil) ? c.nudge : c.lines[c.step]; }

  // ------------------------------------------------------------ main step
  update(dtMs) {
    if (this.state !== 'playing') return;
    dtMs = Math.min(dtMs, 100); // tab-switch safety
    this.now += dtMs;
    const now = this.now, h = this.hunter;

    if (this.coach) {
      const co = this.coach, k = `${h.x},${h.y}`;
      if (this._lastKey) co.moved += Math.hypot(h.x - this._lx, h.y - this._ly);
      this._lastKey = k; this._lx = h.x; this._ly = h.y;
      co.t += dtMs;
      if (co.step === 0) { if (co.moved > 160 || co.t > 4000) this._coachStep(1); }
      else if (co.step === 2 && co.t > 5000) this._coachStep(3);
    }
    if (this.clockHeld) { this._heldMs += dtMs; if (this._heldMs >= CLOCK_HOLD_MAX_MS) this._releaseClock(); }

    // timers
    if (now >= this._nextSkillAt) { this._nextSkillAt = now + this._skillEvery; this.spawnPickupRandom(); }
    if (this._glitch && now >= this._nextGlitchAt) { this._nextGlitchAt = now + 12000; this._glitchRelocateOne(); }

    this._hunterUpdate(dtMs);
    for (const b of this.bugs) {
      if (!b.alive) continue;
      if (b.visible) this._bugUpdate(b, dtMs); else if (b.respawnAt && now >= b.respawnAt) this._respawn(b);
    }
    // pickups: lifetime + collection, then effect expiry
    for (const p of this.pickups) {
      if (!p.alive) continue;
      if (now > p.diesAt) { p.alive = false; this.emit('pickupExpire', { pickup: p }); continue; }
      if (Math.hypot(p.x - h.x, p.y - h.y) < p.radius + PLAYER_RADIUS) this._collect(p);
    }
    if (this.pickups.length > 24) this.pickups = this.pickups.filter((p) => p.alive);
    for (const id of Object.keys(this.effects)) if (now > this.effects[id].endsAt) this._deactivate(id);

    // combo timeout
    if (this.combo > 0) { this.comboTimeoutMs -= dtMs; if (this.comboTimeoutMs <= 0) { this.combo = 0; this.emit('comboEnd', {}); } }

    // hold-to-smash
    if (this.hold) {
      const dmg = this.isActive('opus') ? 999 : 1;
      for (const b of this.bugs.slice()) {
        if (!b.alive || !b.visible) continue;
        if (Math.hypot(b.x - h.x, b.y - h.y) >= PLAYER_RADIUS + b.radius) continue;
        const res = this._trySmash(b, dmg);
        if (!res.hit) continue;
        h.smashUntil = now + SMASH_POSE_MS;
        this.emit('smash', { bug: b, killed: res.killed, dmg });
        if (res.killed) {
          this._releaseClock();
          if (this.coach && this.coach.step === 1) this._coachStep(2);
          this.lastKill = { x: b.x, y: b.y, id: b.id };
          const prevTier = comboTier(this.combo);
          this.combo++; this.comboTimeoutMs = COMBO_WINDOW_MS;
          const mult = comboMult(this.combo), gain = Math.round(b.score * mult);
          this.score += gain;
          const tier = comboTier(this.combo);
          this.emit('kill', { bug: b, score: b.score, gain, combo: this.combo, mult, tier, tierUp: tier > prevTier });
          if (this.combo >= 3) this.emit('combo', { combo: this.combo, tier, mult, x: b.x, y: b.y });
        }
        const extra = this._extraBugOnHit;
        if (extra > 0) {
          const types = ['bug-null', 'bug-ladybug', 'bug-beetle', 'bug-race'];
          for (let i = 0; i < extra; i++) {
            const nb = this.spawnBug(types[Math.floor(this.rng() * types.length)], b.x + (this.rng() - 0.5) * 60, b.y + (this.rng() - 0.5) * 60);
            this.totalBugs++; this.emit('extraBug', { bug: nb });
          }
        }
      }
    }

    // deadline
    if (!this.clockHeld) this.timeLeftMs -= dtMs;
    this.deadlineProgress = 1 - Math.max(0, this.timeLeftMs / this.level.timeLimitMs);
    const sec = Math.ceil(this.timeLeftMs / 1000);
    if (sec !== this._lastSecond) {
      if ([15, 10, 5].includes(sec) && !this._warned.has(sec)) { this._warned.add(sec); this.emit('warn', { sec }); }
      else if (sec > 0 && sec <= 10) this.emit('tick', { sec });
      this._lastSecond = sec;
    }
    if (this.timeLeftMs <= 0) {
      this.timeLeftMs = 0;
      if (this.totalKilled >= this.totalBugs) this._win(); else this._lose();
    }
    if (this.state === 'playing' && this.totalKilled >= this.totalBugs) this._win();
  }

  counts() {
    let visible = 0, hidden = 0;
    for (const b of this.bugs) { if (!b.alive) continue; if (b.visible) visible++; else hidden++; }
    return { visible, hidden, alive: visible + hidden, killed: this.totalKilled, remaining: this.totalBugs - this.totalKilled };
  }

  _win() {
    if (this.state !== 'playing') return;
    this.state = 'won';
    if (this.coach) this._endCoach();
    const timeBonus = Math.round(this.timeLeftMs / 100);
    const base = this.score; this.score += timeBonus;
    const stars = starsFor(this.timeLeftMs, this.level.timeLimitMs);
    const cat = pickWinCategory(this.timeLeftMs, this.level.timeLimitMs);
    this.talk = TALK.win[cat] || [];
    const hasNext = this.levelIndex + 1 < TOTAL_LEVELS;
    this.result = {
      won: true, stars, timeBonus, baseScore: base, score: this.score, timeLeftMs: this.timeLeftMs, hasNext,
      title: hasNext ? 'BUGS FIXED!' : 'ALL DEADLINES MET!',
      subtitle: hasNext ? 'DEPLOY SUCCESSFUL. NEXT TICKET READY.' : 'YOU CONQUERED THE BACKLOG.', talk: this.talk,
    };
    this.emit('win', this.result);
  }
  _lose() {
    if (this.state !== 'playing') return;
    this.state = 'lost';
    const c = this.counts();
    this.failMessage = FAIL_MESSAGES[Math.floor(this.rng() * FAIL_MESSAGES.length)];
    this.talk = TALK.lose[pickLoseCategory(c.killed, this.totalBugs)] || [];
    this.result = { won: false, score: this.score, unfixed: c.alive, hiding: c.hidden, failMessage: this.failMessage, talk: this.talk };
    this.emit('lose', this.result);
  }
}

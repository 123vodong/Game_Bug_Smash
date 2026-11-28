// server/tests/cc_smoke.mjs — fast smoke check of the v6.1 CC + shape primitives against a fake room
// (docs/02_CHAMPIONS_AND_SKILLS.md [v6.1 numbering]). Run: node server/tests/cc_smoke.mjs   (no server, no network)
// Covers: every new CC applies / expires / shows its tag, DR chain, spell shield, immunity, blind miss, disarm,
// forced charm / fear / taunt movement, suppress (strike at end, cancel on hard CC / death / breakDist / untarget /
// teleport / revive), untarget, revive guard (once), cone / line / arc / donut hit tests, global shot windup,
// phase dash through a thin wall, barrier wall (push-out, clip, hit once, cap).
// Author: Duke Nguyen
import assert from 'node:assert/strict';
import { CHAMPIONS, CC_TYPES, CC_TUNING, parseCcTags } from '../../shared/moba/champions.js';
import { CHAMP_RADIUS } from '../../shared/moba/map.js';
import { isBlocked } from '../../shared/moba/nav.js';
import { SkillEngine } from '../game/moba/SkillEngine.js';
import { Kits } from '../game/moba/Kits.js';
import { Objects } from '../game/moba/Objects.js';
import { Rewind } from '../game/moba/Rewind.js';
import { Cc } from '../game/moba/Cc.js';
import { TeamRoom } from '../rooms/TeamRoom.js';

const fx = [];
const room = {
  champs: new Map(), units: new Map(), structs: new Map(), _knocked: new Set(), _nextUnitId: 1, _atkBatch: [],
  state: { phase: 'playing', units: new Map() },
  _fx: (e) => fx.push(e), _feed() {}, _syncUnit() {}, _syncStruct() {}, _giveGold() {}, _petOf: () => null,
  _isAlive: (e) => !!e && (e.etype === 'champ' ? !e.dead : e.alive),
  canSee: () => true, _cancelRecall() {}, _resumePath() {}, teamBuffActive: () => false,
  _heal(c, a) { c.hp = Math.min(c.maxHp, c.hp + a); },
  _addShield() {}, _addBuff() {}, _knockback() {}, _queueShot() {},
  _teleport(e, x, y) { e.x = x; e.y = y; },
  _dealDamage(src, t, raw) { t.hp -= raw; t.dmgTaken = (t.dmgTaken || 0) + raw; return raw; },
  _skillTarget: (ch, aim) => room.champs.get(aim.id) || null,
  mover: { calls: 0, move(e, gx, gy, speed, dt) { this.calls++; const d = Math.hypot(gx - e.x, gy - e.y) || 1; const s = Math.min(d, speed * dt / 1000); e.x += ((gx - e.x) / d) * s; e.y += ((gy - e.y) / d) * s; return false; } },
  _applyCC: TeamRoom.prototype._applyCC, // the REAL table-driven pipeline (CC_HANDLERS -> Cc.apply)
  _tryChampAttack: TeamRoom.prototype._tryChampAttack,
  _buffTags: TeamRoom.prototype._buffTags,
};
room.cc = new Cc(room);
room.skills = new SkillEngine(room);
room.kits = new Kits(room);
room.objects = new Objects(room);
room.rewind = new Rewind(room);

let n = 0;
function champ(key, team, x, y) {
  const def = CHAMPIONS[key];
  const ch = {
    id: `c${++n}`, etype: 'champ', team, champ: key, def, name: key, x, y, radius: 30, faceX: 1, faceY: 0, dead: false,
    level: 6, ad: 80, ap: 80, maxHp: 1000, hp: 1000, ms: 300, as: 1, range: 100, atkReadyAt: 0, cd: { q: 0, w: 0, e: 0, r: 0 },
    ranks: { q: 1, w: 1, e: 1, r: 1 }, stunnedUntil: 0, rootedUntil: 0, slowUntil: 0, slowPct: 0, silencedUntil: 0,
    buffs: [], shields: [], regens: [], burns: [], _marks: {}, _recast: {}, _ccChainCount: 0, _ccChainUntil: 0, _ccImmuneUntil: 0,
  };
  room.kits.reset(ch);
  room.champs.set(ch.id, ch);
  return ch;
}
function minion(team, x, y) {
  const u = { id: `u${++n}`, etype: 'unit', utype: 'minion', team, x, y, radius: 22, alive: true, hp: 300, maxHp: 300, stunnedUntil: 0, rootedUntil: 0, slowUntil: 0, slowPct: 0 };
  room.units.set(u.id, u);
  return u;
}
const T0 = 1_000_000;
const aim = (x, y, id = '') => ({ x, y, id });
const last = (k) => fx.filter((f) => f.k === k).pop();
const FAR = (i) => 100 + i * 150; // spread dummies far from each other

// 1. every new CC applies, shows its tag, expires; DR chain + MAX_MS clamp
{
  const src = champ('hr', 'blue', 4000, 4000);
  const tag = (t, now) => room.cc.tags(t, now);
  const keys = ['airborne', 'charm', 'fear', 'taunt', 'blind', 'disarm'];
  keys.forEach((k, i) => {
    const t = champ('dev', 'red', FAR(i), 100);
    fx.length = 0;
    room._applyCC(t, { [k]: { ms: 500 } }, T0, src);
    const f = last('cc');
    assert.ok(f && f.type === k && f.ms === 500 && f.id === t.id && f.sid === src.id, `${k}: cc fx`);
    assert.ok(tag(t, T0 + 100).includes(`cc:${CC_TYPES[k].tag}`), `${k}: tag while active`);
    assert.ok(!tag(t, T0 + 501).includes('cc:'), `${k}: tag gone after expiry`);
  });
  // clamp to MAX_MS
  const a = champ('dev', 'red', 100, 400);
  room._applyCC(a, { airborne: { ms: 9000 } }, T0, src);
  assert.equal(last('cc').ms, CC_TUNING.MAX_MS.airborne);
  // DR chain 1 / 0.5 / 0.25 then immune (ccBlock immune)
  const d = champ('dev', 'red', 100, 550);
  const ms = [];
  for (let i = 0; i < 3; i++) { room._applyCC(d, { charm: { ms: 1000 } }, T0 + i * 100, src); ms.push(last('cc').ms); }
  assert.deepEqual(ms, [1000, 500, 250]);
  fx.length = 0;
  room._applyCC(d, { fear: { ms: 800 } }, T0 + 400, src);
  assert.ok(fx.some((f) => f.k === 'ccBlock' && f.why === 'immune') && !fx.some((f) => f.k === 'cc'), 'immune after the third hard CC');
  // soft CC: no DR, no immunity
  const s = champ('dev', 'red', 100, 700);
  for (let i = 0; i < 4; i++) room._applyCC(s, { blind: { ms: 1000 } }, T0 + i * 100, src);
  assert.equal(last('cc').ms, 1000);
  // spell shield blocks (and is consumed)
  const sh = champ('dev', 'red', 100, 850);
  sh._spellShieldUntil = T0 + 5000; fx.length = 0;
  room._applyCC(sh, { taunt: { ms: 800 } }, T0, src);
  assert.ok(fx.some((f) => f.k === 'ccBlock' && f.why === 'shield') && !(sh.tauntUntil > 0) && sh._spellShieldUntil === 0);
  // immunities: epic monster, structure, obj, pet; minions take it, but never suppress
  const epic = { id: 'e1', etype: 'unit', utype: 'monster', epic: true, team: 'neutral', x: 0, y: 0, radius: 60, alive: true, stunnedUntil: 0 };
  room._applyCC(epic, { airborne: { ms: 500 } }, T0, src);
  assert.equal(epic.stunnedUntil, 0, 'epic immune');
  const st = { id: 's1', etype: 'struct', team: 'red', alive: true }; room._applyCC(st, { charm: { ms: 500 } }, T0, src);
  const m = minion('red', 100, 1000);
  room._applyCC(m, { airborne: { ms: 500 }, suppress: { ms: 800, strikeAtEnd: true } }, T0, src);
  assert.equal(m.stunnedUntil, T0 + 500, 'minion takes airborne (no DR)');
  assert.ok(!src._suppressing, 'minions are immune to suppress');
  // tag order: silenced is added by the room, then cc: in CC_PRIORITY order, then kit: tags
  const o = champ('dev', 'red', 100, 1200);
  room._applyCC(o, { blind: { ms: 800 }, charm: { ms: 800 } }, T0, src);
  o.silencedUntil = T0 + 800;
  const tags = room._buffTags(o, T0 + 10);
  assert.ok(/(^|,)silenced,cc:charm,cc:blind,kit:stance:/.test(tags), tags);
  assert.deepEqual(parseCcTags(tags), ['charm', 'blind']);
  // cleanse: charm and blind go, airborne stays
  room._applyCC(o, { airborne: { ms: 800 } }, T0, src);
  fx.length = 0;
  room.cc.cleanse(o, T0 + 10);
  assert.ok(!(o.charmUntil > T0 + 10) && !(o.blindUntil > T0 + 10) && o.airUntil > T0 + 10);
  assert.ok(fx.some((f) => f.k === 'ccBreak' && f.type === 'charm' && f.why === 'cleanse'));
}

// 2. blind = miss, disarm = no attack, forced charm / fear / taunt movement, locks
{
  const src = champ('hr', 'blue', 3000, 3000);
  const a = champ('dev', 'red', 3100, 3000), foe = champ('dev', 'blue', 3140, 3000);
  fx.length = 0; foe.dmgTaken = 0;
  room._tryChampAttack(a, foe, T0);
  assert.ok(foe.dmgTaken > 0, 'an unblinded melee attack hits');
  foe.dmgTaken = 0; a.atkReadyAt = 0; a.blindUntil = T0 + 1000;
  room._tryChampAttack(a, foe, T0 + 10);
  assert.equal(foe.dmgTaken, 0, 'blind: 0 damage');
  assert.ok(fx.some((f) => f.k === 'miss' && f.id === a.id), 'blind: miss fx');
  a.atkReadyAt = 0; fx.length = 0;
  room._tryChampAttack(a, foe, T0 + 20); // inside the 700 ms throttle
  assert.ok(!fx.some((f) => f.k === 'miss'), 'miss text is throttled');
  a.atkReadyAt = 0; a.blindUntil = 0; a.disarmUntil = T0 + 1000; foe.dmgTaken = 0;
  room._tryChampAttack(a, foe, T0 + 30);
  assert.equal(foe.dmgTaken, 0, 'disarm: no basic attack');

  const c = champ('dev', 'red', 3400, 3000);
  room._applyCC(c, { charm: { ms: 1000 } }, T0, src);
  room.mover.calls = 0;
  assert.ok(room.cc.forced(c, 50, T0 + 50) && room.mover.calls === 1 && c.x < 3400, 'charm walks toward the source');
  assert.ok(room.cc.cantCast(c, T0 + 50) && !room.cc.stunLike(c, T0 + 50), 'charm: no skills, summoner spells ok');
  c.x = src.x + CC_TUNING.CHARM_STOP_PX - 5; room.mover.calls = 0;
  room.cc.forced(c, 50, T0 + 60);
  assert.equal(room.mover.calls, 0, 'stops at CHARM_STOP_PX');
  src.dead = true; fx.length = 0;
  room.cc.forced(c, 50, T0 + 70);
  assert.ok(fx.some((f) => f.k === 'ccBreak' && f.why === 'src_dead') && !(c.charmUntil > 0), 'charm ends when the source dies');
  src.dead = false;

  const f = champ('dev', 'red', 3300, 3000);
  room._applyCC(f, { fear: { ms: 1000 } }, T0, src);
  const x0 = f.x;
  for (let i = 1; i <= 6; i++) room.cc.forced(f, 50, T0 + i * 50);
  assert.ok(f.x > x0 + 50, 'fear flees away from the source');

  const tt = champ('dev', 'red', 3200, 3000);
  room._applyCC(tt, { taunt: { ms: 1000 } }, T0, src);
  assert.equal(room.cc.forced(tt, 50, T0 + 50), false, 'taunt lets the normal act code run');
  assert.deepEqual(tt.order, { type: 'attack', id: src.id });
  const other = champ('dev', 'blue', 3230, 3000); other.dmgTaken = 0; tt.atkReadyAt = 0;
  room._tryChampAttack(tt, other, T0 + 60);
  assert.equal(other.dmgTaken, 0, 'taunted: cannot hit anyone but the source');
  room._applyCC(tt, { charm: { ms: 500 } }, T0 + 100, src);
  assert.ok(!(tt.tauntUntil > 0) && tt.charmUntil > 0, 'charm replaces taunt');
}

// 3. suppress (Zero R): strike at the end, cancels, DR floor
{
  const spec = CHAMPIONS.zero.skills.r;
  const mk = (x) => { const z = champ('zero', 'blue', x, 3000), v = champ('dev', 'red', x + 200, 3000); z.cd.r = T0 + 68000; v.hp = v.maxHp = 5000; return [z, v]; };
  // full channel
  let [z, v] = mk(3000);
  fx.length = 0;
  assert.ok(room.skills.cast(z, 'r', spec, aim(v.x, v.y, v.id), T0));
  assert.ok(v.suppressUntil === T0 + 1000 && z._suppressing && z._suppressing.tid === v.id);
  assert.equal(v.dmgTaken || 0, 0, 'no damage at cast (strikeAtEnd)');
  assert.ok(room.cc.stunLike(z, T0 + 10) && room.cc.stunLike(v, T0 + 10), 'both locked');
  assert.ok(room.cc.tags(v, T0 + 10).includes('cc:suppress'));
  room.cc.tick(T0 + 500); assert.equal(v.dmgTaken || 0, 0);
  room.cc.tick(T0 + 1000);
  assert.ok(v.dmgTaken >= 145, 'strike at the end');
  assert.ok(fx.some((f) => f.k === 'suppressEnd' && f.why === 'done') && !z._suppressing && v.suppressUntil === 0);
  assert.ok(fx.some((f) => f.k === 'suppress' && f.sid === z.id && f.tid === v.id));
  // cancel on Zero stunned: no damage, R cooldown shortened to cancelCdPct of the remainder
  [z, v] = mk(3600); fx.length = 0;
  room.skills.cast(z, 'r', spec, aim(v.x, v.y, v.id), T0);
  z.stunnedUntil = T0 + 300;
  room.cc.tick(T0 + 100);
  assert.ok(!z._suppressing && v.suppressUntil === 0 && !v.dmgTaken, 'cancelled, no damage');
  assert.ok(fx.some((f) => f.k === 'suppressEnd' && f.why === 'cancel') && fx.some((f) => f.k === 'ccBreak' && f.type === 'suppress' && f.why === 'cancel'));
  assert.ok(Math.abs((z.cd.r - (T0 + 100)) - (68000 - 100) * 0.5) < 1500, 'R cooldown = 50% of the remainder');
  // silence alone does not cancel; knock does
  [z, v] = mk(100); z.y = v.y = 5000;
  room.skills.cast(z, 'r', spec, aim(v.x, v.y, v.id), T0);
  z.silencedUntil = T0 + 900; room.cc.tick(T0 + 100);
  assert.ok(z._suppressing, 'silence does not cancel');
  z.knock = { until: T0 + 200 }; room.cc.tick(T0 + 150);
  assert.ok(!z._suppressing, 'knock cancels');
  // breakDist, target death, untarget, teleport, revive
  const cases = {
    breakDist: (zz, vv) => { vv.x += 600; },
    targetDeath: (zz, vv) => { vv.dead = true; },
    casterDeath: (zz) => { zz.dead = true; },
    untarget: (zz, vv) => { vv._untargetUntil = T0 + 500; },
  };
  let i = 0;
  for (const [name, mut] of Object.entries(cases)) {
    [z, v] = mk(200 + 700 * i++); z.y = v.y = 4400; fx.length = 0;
    room.skills.cast(z, 'r', spec, aim(v.x, v.y, v.id), T0);
    mut(z, v); room.cc.tick(T0 + 100);
    assert.ok(!z._suppressing && !v.dmgTaken, `${name}: cancelled without damage`);
  }
  [z, v] = mk(200); z.y = v.y = 3800;
  room.skills.cast(z, 'r', spec, aim(v.x, v.y, v.id), T0);
  fx.length = 0; assert.ok(room.cc.breakOn(v, 'teleport'));
  assert.ok(!z._suppressing && !(v.suppressUntil > 0) && fx.some((f) => f.k === 'ccBreak' && f.why === 'teleport'), 'teleport breaks it');
  // spell shield: the suppress fizzles (no channel, no damage)
  [z, v] = mk(3000); z.y = v.y = 4800; v._spellShieldUntil = T0 + 5000;
  room.skills.cast(z, 'r', spec, aim(v.x, v.y, v.id), T0);
  assert.ok(!z._suppressing && !v.dmgTaken && !(v.suppressUntil > 0), 'shield: fizzle');
  // DR floor: a second hard CC inside the window never drops suppress below 60% of base
  [z, v] = mk(3000); z.y = v.y = 5200;
  room._applyCC(v, { airborne: { ms: 1000 } }, T0 - 100, z); room._applyCC(v, { airborne: { ms: 1000 } }, T0 - 50, z); // chain count 2, next would be x0.25
  fx.length = 0;
  room._applyCC(v, { suppress: { ms: 1000, strikeAtEnd: true } }, T0, z);
  assert.ok(last('cc') ? last('cc').ms >= 600 : v._ccImmuneUntil > T0, 'suppress >= 60% of base (or immune)');
}

// 4. untarget blocks damage + CC, ghost fx on dash / blink; revive guard once
{
  const foe = champ('dev', 'blue', 3000, 5600);
  const sp = champ('sprint', 'red', 3200, 5600), ca = champ('cache', 'red', 3300, 5700);
  fx.length = 0;
  assert.ok(room.skills.cast(ca, 'e', CHAMPIONS.cache.skills.e, aim(ca.x + 300, ca.y), T0));
  assert.ok(ca._untargetUntil === T0 + 600 && fx.some((f) => f.k === 'untarget' && f.id === ca.id && f.ms === 600));
  assert.ok(fx.some((f) => f.k === 'blink' && f.ghost === 1), 'ghost blink');
  assert.ok(room.cc.tags(ca, T0 + 10).includes('cc:untarget'));
  room.skills._applyHit(foe, ca, { dmg: { base: 1 }, stun: { ms: 800 } }, 500, T0 + 100, foe.x, foe.y);
  assert.ok(!ca.dmgTaken && !(ca.stunnedUntil > 0), 'untargetable: no damage, no CC');
  ca._untargetUntil = Date.now() + 5000; // _alongSegment reads the wall clock
  assert.equal(room.skills._alongSegment('blue', ca.x - 100, ca.y, ca.x + 100, ca.y, 40, true).length, 0, 'projectiles pass through');
  ca._untargetUntil = T0 + 600;
  room.skills._applyHit(foe, ca, { dmg: { base: 1 } }, 500, T0 + 700, foe.x, foe.y);
  assert.ok(ca.dmgTaken >= 500 - 1, 'targetable again after the window');
  assert.ok(room.skills.cast(sp, 'e', CHAMPIONS.sprint.skills.e, aim(foe.x, foe.y, foe.id), T0));
  assert.ok(sp._untargetUntil > T0 + 350, 'dash window = travel + ms');
  assert.ok(fx.some((f) => f.k === 'dash' && f.ghost === 1));

  // revive guard (Ops R): armed on allies in radius, reboots once, clears all CC, untargetable, tag while armed
  const ops = champ('ops', 'blue', 400, 5400), ally = champ('dev', 'blue', 500, 5400);
  assert.ok(room.skills.cast(ops, 'r', CHAMPIONS.ops.skills.r, aim(ops.x, ops.y), T0));
  assert.ok(ally._reviveUntil === T0 + 3000 && room.cc.tags(ally, T0 + 1).includes('cc:revive'));
  ally.hp = 0; ally.airUntil = T0 + 900; ally.stunnedUntil = T0 + 900; fx.length = 0;
  assert.ok(room.cc.tryRevive(ally, T0 + 500), 'lethal hit reboots');
  assert.equal(ally.hp, Math.ceil(ally.maxHp * 0.3));
  assert.ok(ally.airUntil === 0 && ally.stunnedUntil === 0 && ally._untargetUntil === T0 + 1500);
  assert.ok(fx.some((f) => f.k === 'revive' && f.id === ally.id) && fx.some((f) => f.k === 'ccBreak' && f.why === 'revive'));
  ally.hp = 0;
  assert.equal(room.cc.tryRevive(ally, T0 + 600), false, 'once only');
  const late = champ('dev', 'blue', 600, 5400); late.hp = 0;
  assert.equal(room.cc.tryRevive(late, T0), false, 'not armed: no revive');
  assert.ok(String(TeamRoom.prototype._dealDamage).includes('tryRevive') && String(TeamRoom.prototype._dealDamage).includes('_untargetUntil'), '_dealDamage hook wired');
}

// 5. cone / line / arc / donut hit tests (units spread over x so ids stay independent)
{
  const hit = (t) => (t.dmgTaken || 0) > 0;
  const put = (team, x, y, r = 30) => { const t = champ('dev', team, x, y); t.radius = r; t.hp = t.maxHp = 9999; return t; };
  // cone: Mop Q 90 deg x 380, delay 120
  const cl = champ('cleaner', 'blue', 1500, 3000);
  const inC = put('red', 1500 + 300, 3000), edge = put('red', 1500 + 300 * Math.cos(0.7), 3000 + 300 * Math.sin(0.7)); // 40 deg: inside 45
  const out45 = put('red', 1500 + 300 * Math.cos(0.9), 3000 + 300 * Math.sin(0.9));            // 51.6 deg: outside
  const tooFar = put('red', 1500 + 380 + 30 + 10, 3000), behind = put('red', 1500 - 300, 3000), close = put('red', 1500 - 20, 3000 + 20);
  fx.length = 0;
  room.skills.cast(cl, 'q', CHAMPIONS.cleaner.skills.q, aim(1900, 3000), T0);
  const area = last('area');
  assert.ok(area && area.shape === 'cone' && area.len === 380 && area.delay === 120 && Math.abs(area.ang - Math.PI / 2) < 0.01 && area.a === 0 && area.sid === cl.id);
  room.skills.tick(50, T0 + 60); assert.ok(!hit(inC), 'nothing before the delay');
  room.skills.tick(50, T0 + 130);
  assert.ok(hit(inC) && hit(edge) && hit(close), 'cone hits inside + within 50 px of the origin');
  assert.ok(!hit(out45) && !hit(tooFar) && !hit(behind), 'cone misses outside angle / range / behind');
  // line: Pixel R 1050 x 170, delay 700
  const px = champ('pixel', 'blue', 100, 2000);
  const l1 = put('red', 600, 2000), l2 = put('red', 600, 2100), l3 = put('red', 600, 2150), l4 = put('red', 100 - 60, 2000), l5 = put('red', 100 + 1050 + 50, 2000);
  fx.length = 0;
  room.skills.cast(px, 'r', CHAMPIONS.pixel.skills.r, aim(900, 2000), T0);
  assert.ok(last('area').shape === 'line' && last('area').w === 170 && last('area').len === 1050 && last('area').delay === 700);
  room.skills.tick(50, T0 + 690); assert.ok(!hit(l1));
  room.skills.tick(50, T0 + 710);
  assert.ok(hit(l1) && hit(l2), 'line hits inside (perp <= w/2 + r)');
  assert.ok(!hit(l3) && !hit(l4) && !hit(l5), 'line misses wide / behind / past the range');
  // arc: Dev Q 200 deg, 330, inner 40, sweep 260, delay 80: left edge first, right edge last
  const dv = champ('dev', 'blue', 3000, 1000);
  const L = put('red', 3000, 1000 - 250), R = put('red', 3000, 1000 + 250), B = put('red', 3000 - 250, 1000), inner = put('red', 3020, 1000), far = put('red', 3000 + 400, 1000);
  fx.length = 0;
  room.skills.cast(dv, 'q', CHAMPIONS.dev.skills.q, aim(3400, 1000), T0);
  const ar = last('area');
  assert.ok(ar.shape === 'arc' && ar.sweep === 260 && ar.inner === 40 && ar.delay === 80 && Math.abs(ar.ang - (200 * Math.PI) / 180) < 0.01);
  room.skills.tick(50, T0 + 70); assert.ok(!hit(L));
  room.skills.tick(50, T0 + 100); assert.ok(hit(L) && !hit(R), 'left edge hit first (f=0.05 -> ~93 ms)');
  room.skills.tick(50, T0 + 250); assert.ok(!hit(R), 'right edge not yet (f=0.95 -> ~327 ms)');
  room.skills.tick(50, T0 + 340); assert.ok(hit(R), 'right edge hit at the end of the sweep');
  assert.ok(!hit(B) && !hit(inner) && !hit(far), 'arc misses behind / inside the donut hole / out of range');
  assert.equal(L.dmgTaken, L.hp === 9999 ? 0 : 9999 - L.hp); // consistency; each target is hit once per cast (see next line)
  assert.equal(room.skills.shapes.length, 0, 'finished shapes are dropped');
  // donut: Volt vent (turret ring) and circle inner through _resolveZone
  const vt = champ('embedded', 'blue', 5000, 5000);
  assert.ok(room.skills.cast(vt, 'q', CHAMPIONS.embedded.skills.q, aim(5050, 5000), T0));
  const turret = [...room.objects.list.values()].find((o) => o.kind === 'turret');
  const inHole = put('red', turret.x + 60, turret.y), ring = put('red', turret.x, turret.y + 200);
  fx.length = 0;
  assert.ok(room.skills.cast(vt, 'e', CHAMPIONS.embedded.skills.e, aim(vt.x, vt.y), T0 + 10));
  assert.ok(!(inHole.slowUntil > 0) && ring.slowUntil > 0, 'vent: centre safe, ring slowed');
  assert.ok(fx.some((f) => f.k === 'circle' && f.inner === 110 && f.r === 260), 'circle fx carries inner');
  const z = put('red', 5600, 5600), zh = put('red', 5750, 5600);
  room.skills._resolveZone({ owner: vt, team: 'blue', x: 5600, y: 5600, r: 200, inner: 100, spec: { dmg: { base: 1 } }, amount: 10, hit: null }, T0);
  assert.ok(!hit(z) && hit(zh), 'zone inner: centre unit untouched, ring unit hit');
  room.objects.clear(true);
}

// 6. global shot: gping to both teams, windup lock + slow, launch; a stun during the windup cancels it
{
  const tp = champ('tester', 'blue', 500, 100), spec = CHAMPIONS.tester.skills.r;
  fx.length = 0;
  assert.ok(room.skills.cast(tp, 'r', spec, aim(5000, 100), T0));
  const g = last('gping');
  assert.ok(g && g.sid === tp.id && g.x0 === 500 && g.ms === CC_TUNING.GLOBAL_WARN_MS && g.x1 > 5000, 'gping line');
  assert.ok(room.cc.cantCast(tp, T0 + 100) && !room.cc.cantCast(tp, T0 + 460), 'windup locks other casts');
  assert.ok(tp.slowUntil > T0 && Math.abs(tp.slowPct - 0.5) < 1e-9, 'moveSlow 0.5');
  room.skills.tick(50, T0 + 400); assert.ok(!fx.some((f) => f.k === 'proj'), 'no projectile during the windup');
  room.skills.tick(50, T0 + 460);
  const pr = last('proj');
  assert.ok(pr && pr.range === 5600 && pr.speed === 2600 && pr.sid === tp.id, 'projectile launches after windupMs');
  const tp2 = champ('tester', 'blue', 500, 300);
  fx.length = 0;
  room.skills.cast(tp2, 'r', spec, aim(5000, 300), T0);
  tp2.stunnedUntil = T0 + 300;
  room.skills.tick(50, T0 + 100); // the stun is seen during the windup
  room.skills.tick(50, T0 + 460);
  assert.ok(!fx.some((f) => f.k === 'proj' && f.sid === tp2.id), 'stun cancels the shot');
}

// 7. phase dash through a thin wall
{
  const spec = CHAMPIONS.courier.skills.q;
  const run = (s) => { const c = champ('courier', 'blue', 700, 2000); fx.length = 0; room.skills.cast(c, 'q', s, aim(1200, 2000), T0); return c; };
  let firstBlockedX = Infinity;
  for (let x = 704; x <= 1200; x += 4) {
    if (isBlocked(x, 2000, CHAMP_RADIUS)) { firstBlockedX = x; break; }
  }
  assert.ok(Number.isFinite(firstBlockedX), 'test path intersects a wall');
  const c1 = run(spec);
  assert.ok(c1.x > 1100, `phase lands past the wall (x=${c1.x})`);
  assert.ok(last('dash').phase === 1, 'dash fx carries phase:1');
  const c2 = run({ ...spec, phase: undefined });
  assert.ok(c2.x > 700 && c2.x < firstBlockedX && isBlocked(c2.x + 4, c2.y, CHAMP_RADIUS), 'plain dash stops at the wall');
  assert.ok(!last('dash').phase);
  const c3 = run({ ...spec, phase: { maxWall: 20 } });
  assert.ok(c3.x > 700 && c3.x < firstBlockedX && !last('dash').phase, 'wall thicker than maxWall: stops short');
  // a long wall in the way of the whole dash: stop at the last free point before it
  const c4 = champ('courier', 'blue', 700, 2000);
  room.skills.cast(c4, 'q', { ...spec, range: 160 }, aim(1200, 2000), T0);
  assert.ok(c4.x <= 920 && c4.x >= 700, 'ends inside the wall -> shortened');
}

// 8. barrier wall (Model E): hit once at placement, push-out, clip, cap
{
  const m = champ('model', 'blue', 3000, 4600), spec = CHAMPIONS.model.skills.e;
  const e1 = champ('dev', 'red', 3500, 4600), e2 = champ('dev', 'red', 3500, 4700), e3 = champ('dev', 'red', 3500, 5400);
  e1.hp = e2.hp = e3.hp = 5000;
  fx.length = 0;
  assert.ok(room.skills.cast(m, 'e', spec, aim(3500, 4600), T0));
  const ob = fx.find((f) => f.k === 'obj' && f.kind === 'barrier');
  assert.ok(ob && ob.x2 !== undefined && ob.thick === 44 && ob.ms === 3500 && ob.sid === m.id, 'obj fx');
  assert.ok(Math.hypot(ob.x2 - ob.x, ob.y2 - ob.y) > 340 && Math.abs(ob.x - ob.x2) < 5, 'perpendicular to the cast direction, len 360');
  assert.ok(e1.dmgTaken > 0 && e1.rootedUntil >= T0 + 700 && e2.dmgTaken > 0, 'overlapping enemies: dmg + root once');
  assert.ok(!e3.dmgTaken, 'far enemy untouched');
  const bar = [...room.objects.list.values()].find((o) => o.kind === 'barrier');
  for (const e of [e1, e2]) assert.ok(Math.abs(e.x - 3500) >= 22 + 30 * 0.8 - 1, 'pushed out along the normal');
  const k = room.objects.clip(3200, 4650, 3800, 4650, 30);
  assert.ok(k.hit && k.x < 3500, 'dashes / knockbacks stop at the barrier');
  assert.ok(room.objects.solidAt(bar.x, (bar.y + bar.y2) / 2, 30) && !room.objects.solidAt(3000, 4000, 30));
  const h0 = e1.dmgTaken;
  room.objects.tick(T0 + 200); room.objects.tick(T0 + 400);
  assert.equal(e1.dmgTaken, h0, 'no re-hit after placement');
  room.skills.cast(m, 'e', spec, aim(3500, 4600), T0 + 1000);
  assert.equal([...room.objects.list.values()].filter((o) => o.kind === 'barrier').length, 1, 'maxActive 1: the old wall is replaced');
  room.objects.tick(T0 + 1000 + 3600);
  assert.equal(room.objects.list.size, 0, 'expires after ms');
}

console.log('cc smoke: all checks passed');

// server/tests/kits_smoke.mjs — fast smoke check of the v6 kit primitives against a fake room.
// Run: node server/tests/kits_smoke.mjs   (no server, no network)
// Covers: hold scale, portal teleport + gap lock, spend/resource gate, rewind restore, link share (never lethal), turret heat explode.
// Author: Duke Nguyen
import assert from 'node:assert/strict';
import { CHAMPIONS, KIT_TUNING } from '../../shared/moba/champions.js';
import { SkillEngine } from '../game/moba/SkillEngine.js';
import { Kits } from '../game/moba/Kits.js';
import { Objects } from '../game/moba/Objects.js';
import { Rewind } from '../game/moba/Rewind.js';
import { Cc } from '../game/moba/Cc.js';

const fx = [];
const room = {
  champs: new Map(), units: new Map(), structs: new Map(), _knocked: new Set(), _nextUnitId: 1,
  state: { phase: 'playing', units: new Map() },
  _fx: (e) => fx.push(e), _feed() {}, _syncUnit() {}, _syncStruct() {}, _giveGold() {}, _petOf: () => null,
  _isAlive: (e) => !!e && (e.etype === 'champ' ? !e.dead : e.alive),
  canSee: () => true, _cancelRecall() {}, _resumePath() {},
  _heal(c, a) { c.hp = Math.min(c.maxHp, c.hp + a); },
  _addShield() {}, _addBuff() {}, _applyCC() {}, _knockback() {},
  _teleport(e, x, y) { e.x = x; e.y = y; },
  _dealDamage(src, t, raw) { t.hp -= raw; t.dmgTaken = (t.dmgTaken || 0) + raw; return raw; },
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
    level: 6, ad: 80, ap: 80, maxHp: 1000, hp: 1000, cd: { q: 0, w: 0, e: 0, r: 0 }, ranks: { q: 1, w: 1, e: 1, r: 1 },
    stunnedUntil: 0, rootedUntil: 0, slowUntil: 0, slowPct: 0, buffs: [], shields: [], _marks: {}, _recast: {},
  };
  room.kits.reset(ch);
  room.champs.set(ch.id, ch);
  return ch;
}
const aimAt = (x, y) => ({ x, y, id: '' });
const T0 = 1_000_000;

// 1. hold scale: charge 0 / 1 / quick-cast tap
{
  const t = champ('tester', 'blue', 3000, 3000);
  const q = t.def.skills.q;
  const p0 = room.kits.prepare(t, q, { f: 0 }), p1 = room.kits.prepare(t, q, { f: 1 }), pq = room.kits.prepare(t, q, { f: q.hold.quick });
  assert.equal(Math.round(p0.spec.range), 600); assert.equal(Math.round(p1.spec.range), 1500);
  assert.ok(Math.abs(p0.mul - 0.6) < 1e-9 && Math.abs(p1.mul - 1.8) < 1e-9);
  assert.ok(pq.mul > p0.mul && pq.mul < p1.mul);
  // hold protocol: start, fraction, cancel
  room.kits.holdStart(t, 'q', q, aimAt(3500, 3000), T0);
  assert.equal(room.kits.holdFraction(t._hold, T0 + q.hold.maxMs + 500), 1);
  assert.ok(room.kits.holdCancel(t) && !t._hold);
}

// 2. spend gate + consume
{
  const m = champ('model', 'blue', 3000, 3000);
  m._res.orbs = 0;
  assert.equal(room.kits.prepare(m, m.def.skills.w), null, 'W needs >= 1 orb');
  assert.ok(room.kits.prepare(m, m.def.skills.q), 'Q needs none');
  m._res.orbs = 2.5;
  const pr = room.kits.prepare(m, m.def.skills.r);
  assert.equal(pr.units, 2); assert.ok(Math.abs(pr.mul - 1.5) < 1e-9);
  room.kits.commit(m, 'r', m.def.skills.r, pr, T0, 80000, aimAt(3000, 3000), {});
  assert.ok(Math.abs(m._res.orbs - 0.5) < 1e-9);
}

// 3. portal: place A, recast B, teleport, gap lock
{
  const s = champ('stack', 'blue', 3000, 3000);
  const e = s.def.skills.e;
  assert.ok(room.skills.cast(s, 'e', e, aimAt(3300, 3000), T0));
  assert.ok(room.skills.recast(s, 'e', e, aimAt(3300, 2400), T0 + 500, null));
  const ends = [...room.objects.list.values()].filter((o) => o.kind === 'portal');
  assert.equal(ends.length, 2);
  const [A, B] = ends;
  const walker = champ('pixel', 'red', A.x, A.y); // open filter: enemies may enter
  let now = T0 + 600;
  room.objects.tick(now);
  assert.ok(Math.hypot(walker.x - B.x, walker.y - B.y) < B.r + 60, 'walker exits at B');
  const at = { x: walker.x, y: walker.y };
  walker.x = A.x; walker.y = A.y; // stepping back in during the gap lock does nothing
  now += KIT_TUNING.OBJ_TICK_MS + 1;
  room.objects.tick(now);
  assert.equal(walker.x, A.x); assert.notEqual(at.x, undefined);
  now += e.obj.gapMs + 200; // lock expired: teleports again
  room.objects.tick(now);
  assert.ok(Math.hypot(walker.x - B.x, walker.y - B.y) < B.r + 60);
  room.objects.clear(true);
}

// 4. rewind restore (Pager R: position + HP of 3 s ago)
{
  const p = champ('oncall', 'blue', 3000, 3000);
  const a = champ('dev', 'blue', 3200, 3000);
  for (let i = 0; i <= 16; i++) { // 4 s of history, one sample per 250 ms
    if (i === 8) { a.x = 3600; a.hp = 300; p.x = 3400; } // moved + hurt after the sample 3 s back
    room.rewind._sampleAt = 0; room.rewind.sample(T0 + i * 250);
  }
  a.hp = 200; a.stunnedUntil = T0 + 99999;
  assert.ok(room.rewind.rewind(p, 'r', p.def.skills.r, T0 + 4000));
  assert.ok(a.hp >= 1000 - 1, 'ally HP restored to the old sample'); assert.equal(a.stunnedUntil, 0, 'cleansed');
  assert.ok(Math.abs(a.x - 3200) < 80 && Math.abs(p.x - 3000) < 80, 'positions restored');
  const rw = fx.filter((f) => f.k === 'rewind').pop();
  assert.ok(rw.list.length >= 2 && rw.list.length <= 6); // earlier test champions of the same team are in radius too
}

// 5. link share: never lethal, never re-shared
{
  const h = champ('hr', 'blue', 4400, 4400); // far from the other test champions so the nearest partner is unambiguous
  const a = champ('dev', 'blue', 4500, 4400), b = champ('pixel', 'blue', 4600, 4400);
  assert.ok(room.rewind.link(h, 'w', h.def.skills.w, { x: a.x, y: a.y, id: a.id }, T0));
  b.hp = 5; h.hp = 5; a.hp = 500; // whichever one is the partner is nearly dead
  const left = room.rewind.shareDamage(a, 400, T0 + 10);
  assert.ok(b.hp >= 1 && h.hp >= 1, 'partner never dies from shared damage');
  assert.ok(left >= 400 * 0.5 && left <= 400, 'victim keeps at least the unshared half');
  assert.ok([b.id, h.id].includes(room.rewind.linkPartner(a.id))); // the caster counts as a partner candidate
}

// 6. turret heat -> explode
{
  const v = champ('embedded', 'blue', 3000, 3000);
  const foe = champ('stack', 'red', 3200, 3000);
  foe.hp = foe.maxHp = 100000;
  assert.ok(room.skills.cast(v, 'q', v.def.skills.q, aimAt(3050, 3000), T0));
  assert.equal(v._ntur, 1);
  let now = T0, boom = false;
  for (let i = 0; i < 160 && !boom; i++) {
    now += KIT_TUNING.OBJ_TICK_MS;
    room.objects.tick(now);
    boom = fx.some((f) => f.k === 'objEnd' && f.boom);
  }
  assert.ok(boom, 'turret exploded at max heat');
  assert.ok(fx.some((f) => f.k === 'objHeat' && f.h === 10), 'heat reached 10 tenths');
  assert.ok((foe.dmgTaken || 0) > 0 && v._ntur === 0);
  room.objects.clear(true);
  assert.equal(room.objects.list.size, 0);
}
console.log('kits smoke: all checks passed');

// shared/moba/champions.js — Team Mode champions (original office-dev roster).
// Shared by server (stats + skill engine) and client (select screen, HUD, VFX).
// Author: Duke Nguyen
//
// ── Skill spec (interpreted by the server's skill engine) ──
// Every skill: { name, desc, icon, type, mana, cd (seconds), color, ...type fields }
// Amount specs (dmg / heal / shield): { base, perLevel, ad, ap, hp }  → rules.scaledAmount()
//   type 'projectile' — skillshot from the caster toward (x,y): range, speed, width,
//                       pierce?, champOnly?, dmg, slow?, root?, stun?
//   type 'circle'     — area at (x,y) within `range` (range 0 = centered on self):
//                       radius, delay (ms telegraph), dmg, slow?, root?, stun?
//   type 'target'     — point-and-click on an enemy within `range`: targets
//                       ('enemy' any unit | 'enemyChamp'), dmg, slow?, stun?, execute?
//   type 'dash'       — move the caster up to `range` toward (x,y) (or onto the
//                       target with toTarget): hitRadius, stopAtFirst?, dmg?, stun?
//   type 'blink'      — instant teleport toward (x,y), up to `range`
//   type 'self'       — shield? heal? buff? on the caster for `duration` ms
//   type 'allies'     — heal? shield? buff? on allied champions within `radius` (incl. self)
// Effects: slow { pct, ms } · root { ms } (can't move) · stun { ms } (can't act)
//          execute { missingHpPct } (bonus = pct × target's missing HP)
//   type 'zone'       — PERSISTENT area at (x,y) within `range` (range 0 = on self) for
//                       `duration` ms; every `tickMs` it deals `dmg` (per tick) and applies
//                       `slow` to enemies inside, and `heal`s allied champions inside (if set)
// Buff fields: as (attack-speed %), msPct, armor (flat), dmgReduction, apPct, adPct,
//              petPct (the caster's pet deals +pct damage and attacks +pct faster)
// R unlocks at rules.ULT_UNLOCK_LEVEL. Skills scale with champion level (no skill ranks).
//
// ── v2 extensions (walls + new hires, 2026-11-07) ──
//   projectile `count` + `spread` (deg): a fan of `count` projectiles across `spread` degrees,
//              centered on the aim. All projectiles of ONE cast share a hit set — each
//              target is damaged at most once per cast.
//   knockback { dist }   pushes each enemy hit `dist` px straight away from the caster
//              (circle/zone: from the area center) over ~200 ms; stopped by walls
//              (nav.clipMove). The target can't move/attack/cast while displaced.
//              Epic monsters + structures are immune.
//   wallStun { ms }      a knockback stopped early by a WALL stuns the target for `ms`.
//   at: 'pet'            (circle) the area is centered on the caster's pet (`range` ignored).
//   Champion `pet`       { name, emoji, range, atkMs, dmg (amount spec), follow } — a
//              companion unit (kind 'pet', TeamUnit.owner = champion key) that follows
//              its owner ~`follow` px behind, is untargetable/invulnerable, attacks the
//              owner's auto-attack target (or the last enemy champion the owner hit within
//              3 s) within `range` every `atkMs`, despawns while the owner is dead.
//   Champion `look`      { outfit, hat, prop, vehicle?, palette:[main, accent] } — render-only
//              hints for the client's procedural costume (src/entities/moba/looks.js).
//   Dash/blink vs walls: dashes stop at walls (clipMove); blinks land on nav.nearestFree.
//
// ── v5 extensions (skill diversity rework, 2026-11-27) ──
//   silence { ms }       target cannot cast skills (basic attacks / movement still work).
//   recast { ms, mode }  after the first cast, the SAME key can be pressed again within `ms`
//              for free (no mana, no cooldown): mode 'back' = return to where the first cast
//              started; mode 'again' = repeat the skill at the new aim.
//   type 'swap'          trade places with the allied champion nearest the aim within `range`;
//              both get `shield` / `buff` for `duration`.
//   trail { radius, duration, tickMs, dmg?, slow? }   a dash leaves a persistent zone midway along its path.
//   mark { tag, ms, max }          a champion hit gains a mark stack (refreshes the timer).
//   detonate { tag, pctPerStack }  consumes all `tag` stacks on a champion hit: bonus TRUE damage =
//              pctPerStack x stacks x the hit's damage.
//   stasis { ms }        (self) cannot be damaged and cannot act for `ms` (a Zhonya-style hourglass).
//
// ── v6 kit redesign (2026-11-27) — full contract in docs/02_CHAMPIONS_AND_SKILLS.md [v6 numbering] ──
//   Every champion has one core SYSTEM. New spec fields (all optional unless the type needs them):
//   input 'tap'|'hold'|'drag'   how the key is pressed (default tap). 'hold' = charge on key down, fire on
//              release (cast.ph protocol). 'drag' = the client sends two world points (x,y)->(x2,y2).
//   hold { minMs, maxMs, moveSlow, quick, scale:{dmg|range|radius|width|knockback:[atCharge0, atCharge1]} }
//   spend { res, min, max, per:{dmg,radius,range,rootMs,stunMs,slowPct,count (additive per unit);
//              shield (amount spec per unit)} }   consumes `res` units (kit.res) and scales the cast.
//   type 'place' + obj { kind:'wall'|'portal'|'barricade'|'turret'|'beacon'|'pin', ... } a placed world object.
//   type 'rewind' + rewind { lookbackMs, radius, pos, hp, cleanse, allies }   restore a past position/HP.
//   type 'tether' + tether { ... }  heal link to an ally (channel).     type 'link' + link { ... } shared damage.
//   type 'stance' + cycle:[names]   switch the champion's stance; `stances:{name:fullSpec}` on OTHER slots
//              replace the base spec while that stance is active (see resolveSkill()).
//   type 'shadow' + shadow { mode:'place'|'swap' } ; at:'shadow' ; alsoAtShadow ; shadowAt:'origin'.
//   type 'summon' (drone) · 'echo' · 'timebox' · 'reload' · 'pickup' · 'deliver' · 'serve' · 'resolve' · 'objcmd'.
//   addMix 'S'|'M'|'G' · resetOnCast:[slots] · tipMul · bot hint ('skip'|'escape'|'peel'|'opener'|'self').
//   Champion-level `kit`: { res:{key,max,start,gainPerSec,show} | stance:{names,default,botPref} | mix | pkg }.

/** Engine constants for the v6 primitives (shared by server + OfflineSim; never hard-code these in logic). */
export const KIT_TUNING = {
  HIST_SAMPLE_MS: 250,       // position + hp history sample period (every champion)
  HIST_KEEP_MS: 5000,        // history kept per champion (20 samples)
  HOLD_GRACE_MS: 600,        // a held skill auto-releases at hold.maxMs + this
  DRAG_MIN_PX: 30,           // drag shorter than this = a tap (server default orientation)
  DRAG_DEFAULT_FRAC: 0.6,    // tap on a 'drag' wall: segment length = obj.len * this, perpendicular to the cast direction
  MAX_OBJECTS_PER_TEAM: 14,  // hard cap of live placed objects per team (oldest dropped first)
  OBJ_TICK_MS: 100,          // placed-object logic cadence (walls / pins / portals)
  TETHER_MIN_TICK_MS: 250,
  RES_TAG_STEP: 1,           // resources are synced as integers in the buffs tag (heat is never synced per champion)
  PORTAL_ENTER_PAD: 14,      // px added to a portal's radius when testing entry
  DRONE_MAX_ACTIVE: 1,
};

// ── v6.1 (2026-11-27) — full contract in docs/02_CHAMPIONS_AND_SKILLS.md [v6.1 numbering] ──
//   New CC spec keys (handled by CC_HANDLERS, usable anywhere slow/root/stun are): airborne{ms} charm{ms} fear{ms}
//   taunt{ms} blind{ms} disarm{ms} suppress{ms, strikeAtEnd, breakDist, cancelCdPct}.
//   New states: untarget{ms} (caster cannot be targeted/hit, can still act) · reviveGuard{ms,hpPct,untargetMs} on allies/self.
//   New types: 'cone' {range, angle, delay} · 'line' {range, width, delay} · 'arc' {range, inner, angle, sweepMs, delay}.
//   New fields: inner (donut, on circle/zone/objcmd) · global + windupMs (map-wide projectile) · phase{maxWall} (dash crosses thin
//   terrain) · self{...} (circle/zone/cone/line/arc: shield/heal/buff/spellShieldMs applied to the caster at cast start)
//   · obj.kind 'barrier' (solid segment) · cast message flag `mm` (aim came from the minimap).

/** v6.1 CC constants (ms). Server, OfflineSim, HUD and VFX read these; never hard-code them. */
export const CC_TUNING = {
  MAX_MS: { airborne: 1200, charm: 1500, fear: 1500, taunt: 1500, blind: 3000, disarm: 2500, suppress: 2000, untarget: 800 },
  SUPPRESS_MIN_FRAC: 0.6,    // chain-CC diminishing never shortens a suppress below this fraction of its base ms
  CHARM_STOP_PX: 95,         // a charmed unit stops walking this close to the source
  FEAR_MS_MUL: 0.85,         // fleeing speed multiplier
  FEAR_JITTER_DEG: 25,       // flee direction noise, re-rolled every FEAR_REROLL_MS
  FEAR_REROLL_MS: 400,
  AIR_LIFT_PX: 70,           // client-only: how high an airborne unit is drawn
  MISS_TEXT_THROTTLE_MS: 700,
  GLOBAL_WARN_MS: 600,       // enemy minimap warning line lifetime for a global shot
  PHASE_STEP_PX: 20,         // terrain sampling step for phase dashes
  PHASE_LAND_SEARCH_PX: 60,  // nearestFree search radius for a phase landing
};

/**
 * v6.1 CC catalogue. `tag` is the string appended to TeamChamp.buffs as `cc:<tag>` (after 'silenced', before the
 * `kit:` tags). hard = goes through applyHardCcDuration. cleanse = removed by cleanse effects. prio = overhead icon
 * priority (lower = more important). typMs = default ring length for a HUD timer when no `cc` fx was seen.
 */
export const CC_TYPES = {
  suppress: { tag: 'suppress', icon: '🔒', label: 'Suppressed', hard: true,  cleanse: false, prio: 0, typMs: 1000, color: 0xff3b8a },
  airborne: { tag: 'air',      icon: '🎈', label: 'Airborne',   hard: true,  cleanse: false, prio: 1, typMs: 800,  color: 0xffe066 },
  charm:    { tag: 'charm',    icon: '💘', label: 'Charmed',    hard: true,  cleanse: true,  prio: 3, typMs: 1100, color: 0xff7eb6 },
  fear:     { tag: 'fear',     icon: '😱', label: 'Feared',     hard: true,  cleanse: true,  prio: 4, typMs: 800,  color: 0x9b6bff },
  taunt:    { tag: 'taunt',    icon: '🤬', label: 'Taunted',    hard: true,  cleanse: true,  prio: 5, typMs: 1000, color: 0xff5252 },
  disarm:   { tag: 'disarm',   icon: '🚫', label: 'Disarmed',   hard: false, cleanse: true,  prio: 8, typMs: 1800, color: 0xffa94d },
  blind:    { tag: 'blind',    icon: '🕶️', label: 'Blinded',    hard: false, cleanse: true,  prio: 9, typMs: 1000, color: 0x444466 },
  untarget: { tag: 'untarget', icon: '👻', label: 'Untargetable', hard: false, cleanse: false, prio: 10, typMs: 600, color: 0xbfd4ff },
  revive:   { tag: 'revive',   icon: '😇', label: 'Failover armed', hard: false, cleanse: false, prio: 11, typMs: 3000, color: 0xfff3a0 },
};
/** Spec key (airborne, charm, ...) -> CC_TYPES key list in priority order, used by HUD/ChampionView. */
export const CC_PRIORITY = Object.keys(CC_TYPES).sort((a, b) => CC_TYPES[a].prio - CC_TYPES[b].prio);

/** v6.1: parse `cc:<tag>` entries of TeamChamp.buffs into CC_TYPES keys, most important first (e.g. ['suppress','blind']). */
export function parseCcTags(buffs) {
  if (!buffs) return [];
  const have = new Set();
  for (const t of String(buffs).split(',')) if (t.startsWith('cc:')) have.add(t.slice(3));
  return CC_PRIORITY.filter((k) => have.has(CC_TYPES[k].tag));
}

export const CHAMPIONS = {
  pixel: {
    id: 'pixel', name: 'Pixel', title: 'the Frontend Wizard', role: 'Mage', lane: 'mid',
    emoji: '🎨', color: 0x39c2ff, difficulty: 3, ranged: true,
    blurb: 'Ships beautiful damage from a safe distance. Breaks if you look at it on Internet Explorer.',
    look: { outfit: 'turtleneck', hat: 'beret', prop: 'stylus', palette: [0x39c2ff, 0xff4fa3] },
    base:   { hp: 520, mana: 420, ad: 48, ap: 0, armor: 20, mr: 30, as: 0.65, range: 460, ms: 330 },
    growth: { hp: 86,  mana: 42,  ad: 3,  armor: 3.4, mr: 1.2, as: 0.01 },
    skills: {
      q: { name: 'Laser Fence', icon: '📏', type: 'place', input: 'drag', mana: 60, cd: 9, color: 0x39c2ff,
           range: 700, obj: { kind: 'wall', len: 520, thick: 46, ms: 4000, maxActive: 1, rehitMs: 700 },
           dmg: { base: 50, perLevel: 11, ap: 0.45 }, slow: { pct: 0.3, ms: 800 }, mark: { tag: 'glitch', ms: 5000, max: 1 }, bot: 'opener',
           desc: 'Press Q at the start point, drag toward the other end and release: a laser fence (max 520 px) stands for 4s. Enemies crossing it take damage, slow and a Glitch mark.' },
      w: { name: 'Flexbox Orbs', icon: '⚡', type: 'target', mana: 55, cd: 9, color: 0x7ec8ff,
           range: 620, targets: 'enemy', chain: { bounces: 2, range: 360, decay: 0.8 }, dmg: { base: 70, perLevel: 16, ap: 0.55 },
           detonate: { tag: 'glitch', pctPerStack: 0.3 },
           desc: 'Zaps an enemy and chains to 2 nearby targets. Glitch-marked targets take +30% true damage.' },
      e: { name: 'Ctrl+Z', icon: '⏪', type: 'rewind', mana: 50, cd: 16, color: 0xffffff,
           rewind: { lookbackMs: 3000, radius: 0, pos: true, hp: false, cleanse: true }, bot: 'escape',
           desc: 'Rewinds your position to where you stood 3s ago and cleanses stun, root and slow.' },
      r: { name: 'Framework Rewrite', icon: '🌀', type: 'line', mana: 100, cd: 70, color: 0xb084ff,
           range: 1050, width: 170, delay: 700, dmg: { base: 270, perLevel: 32, ap: 0.95 }, detonate: { tag: 'glitch', pctPerStack: 0.25 },
           desc: 'Marks a long lane; after 0.7s a rewrite wipes everything in it for massive damage. Glitch-marked champions take +25% true damage.' },
    },
    build: ['tech_book', 'sneakers', 'headphones', 'frost_cache', 'stackoverflow', 'freeze_frame'],
    lines: { pick: 'It works in Chrome.', kill: 'Pixel-perfect.', death: 'Who added !important?!' },
  },

  stack: {
    id: 'stack', name: 'Stack', title: 'the Backend Tank', role: 'Tank', lane: 'top',
    emoji: '🗄️', color: 0x7ed957, difficulty: 2, ranged: false,
    blurb: 'Handles any load you throw at it. Scales horizontally into your face.',
    look: { outfit: 'armor', hat: 'hardhat', prop: 'database', palette: [0x3b7a2a, 0x7ed957] },
    kit: { stance: { names: ['open', 'allies'], default: 'open', affectsSkills: false } },
    base:   { hp: 650, mana: 280, ad: 62, ap: 0, armor: 36, mr: 34, as: 0.66, range: 125, ms: 340 },
    growth: { hp: 112, mana: 30,  ad: 4,  armor: 4.6, mr: 2.0, as: 0.01 },
    skills: {
      q: { name: 'SQL Hook', icon: '🪝', type: 'projectile', mana: 55, cd: 11, color: 0x7ed957,
           range: 820, speed: 1750, width: 72, pull: true, pullDist: 680, dmg: { base: 75, perLevel: 15, ad: 0.7 }, stun: { ms: 600 },
           desc: 'Launches a query hook that yanks the first enemy hit right to you and stuns briefly.' },
      w: { name: 'Access Control', icon: '🔐', type: 'stance', mana: 0, cd: 1.5, color: 0xb6ff8a,
           cycle: ['open', 'allies'], duration: 2500, shield: { base: 60, perLevel: 10, hp: 0.05 }, bot: 'skip',
           desc: 'Toggles who your portals admit: everyone, or allies only. Switching grants a small shield.' },
      e: { name: 'Portal Pair', icon: '🌀', type: 'place', mana: 60, cd: 16, color: 0x7ed957,
           range: 600, obj: { kind: 'portal', r: 70, ms: 9000, gapMs: 1500, pair: true, range2: 900 },
           recast: { ms: 6000, mode: 'place2' }, bot: 'skip',
           desc: 'Drops portal A, then press E again within 6s to drop portal B. Anyone who steps in one exits the other for 9s.' },
      r: { name: 'Database Lock', icon: '🔒', type: 'circle', mana: 100, cd: 75, color: 0x55ff55,
           range: 0, radius: 350, delay: 0, pullIn: true, pullInDist: 170, dmg: { base: 185, perLevel: 20, ad: 0.55 }, airborne: { ms: 900 },
           desc: 'Locks every table in range: nearby enemies are pulled inward, damaged and knocked into the air (0.9s).' },
    },
    build: ['chair', 'sneakers', 'standing_desk', 'thornmail_rack', 'server_rack', 'guardian_backup'],
    lines: { pick: 'Scaling up.', kill: '200 OK.', death: '503 Service Unavailable.' },
  },

  ops: {
    id: 'ops', name: 'Ops', title: 'the DevOps Medic', role: 'Support', lane: 'support',
    emoji: '⚙️', color: 0xffd23f, difficulty: 2, ranged: true,
    blurb: 'Keeps the team alive at 3 a.m. Speaks fluent YAML.',
    look: { outfit: 'vest', hat: 'headlamp', prop: 'wrench', palette: [0xffd23f, 0x333333] },
    base:   { hp: 540, mana: 400, ad: 46, ap: 0, armor: 24, mr: 30, as: 0.62, range: 450, ms: 330 },
    growth: { hp: 90,  mana: 45,  ad: 2.6, armor: 3.5, mr: 1.2, as: 0.01 },
    skills: {
      q: { name: 'Health Check', icon: '🚇', type: 'circle', mana: 45, cd: 6, color: 0xffd23f,
           range: 820, radius: 200, delay: 300, dmg: { base: 65, perLevel: 14, ap: 0.55 }, slow: { pct: 0.35, ms: 1500 },
           healOnHit: { base: 35, perLevel: 8, ap: 0.25 },
           desc: 'Scans an area: slows enemies inside and heals you for each champion hit.' },
      w: { name: 'Hotfix Tether', icon: '🔗', type: 'tether', targets: 'ally', mana: 50, cd: 9, color: 0x7ed957,
           range: 600, tether: { breakRange: 850, durationMs: 5000, tickMs: 500, heal: { base: 22, perLevel: 5, ap: 0.15 },
                                 selfPct: 0.4, casterSlow: 0.25, allyMsPct: 0.1, recastEnds: true }, bot: 'peel',
           desc: 'Links to an ally for 5s: heals them every 0.5s (and you for 40% of it). You move 25% slower. Press W again to cut the link.' },
      e: { name: 'Hot Swap', icon: '🔁', type: 'swap', mana: 55, cd: 14, color: 0x7ec8ff,
           targets: 'ally', range: 650, duration: 2500, shield: { base: 70, perLevel: 14, ap: 0.4 }, buff: { msPct: 0.3 }, bot: 'skip',
           desc: 'Swaps places with the allied champion nearest your aim, pulling them out of danger. Both of you gain a shield and +30% MS for 2.5s.' },
      r: { name: 'Blue-Green Deploy', icon: '🔄', type: 'allies', mana: 110, cd: 85, color: 0x39c2ff,
           radius: 800, duration: 3000, heal: { base: 160, perLevel: 22, ap: 0.55 }, shield: { base: 130, perLevel: 13, ap: 0.35 }, buff: { dmgReduction: 0.15 },
           reviveGuard: { ms: 3000, hpPct: 0.3, untargetMs: 1000 },
           desc: 'Swaps the whole team to a fresh deployment: heal, shield, 15% damage reduction, and a Failover standby for 3s: a lethal hit instead reboots the ally at 30% HP (1s untargetable). Once per ally.' },
    },
    build: ['power_bank', 'sneakers', 'rubber_duck', 'team_lunch', 'headphones', 'stackoverflow'],
    lines: { pick: 'It is always DNS.', kill: 'Rolled back.', death: 'Pager is going off...' },
  },

  tester: {
    id: 'tester', name: 'Tester', title: 'the QA Sniper', role: 'Marksman', lane: 'bot',
    emoji: '🔍', color: 0xff9800, difficulty: 3, ranged: true,
    blurb: 'Finds your weak spot from across the map. Files a ticket about it.',
    look: { outfit: 'shirt', hat: 'visor', prop: 'magnifier', palette: [0xff9800, 0xffffff] },
    pet: { name: 'Scout', emoji: '🛸', range: 0, atkMs: 0, follow: 0, summonOnly: true },
    base:   { hp: 560, mana: 300, ad: 60, ap: 0, armor: 24, mr: 30, as: 0.68, range: 500, ms: 330 },
    growth: { hp: 90,  mana: 36,  ad: 3.6, armor: 3.5, mr: 1.2, as: 0.025 },
    skills: {
      q: { name: 'Unit Test', icon: '🧪', type: 'projectile', input: 'hold', mana: 50, cd: 6, color: 0xffb347,
           hold: { minMs: 250, maxMs: 1400, moveSlow: 0.5, quick: 0.35, scale: { dmg: [0.6, 1.8], range: [0.6, 1.5], width: [1, 0.8] } },
           range: 1000, speed: 1950, width: 75, pierce: true, dmg: { base: 75, perLevel: 16, ad: 1.0 },
           detonate: { tag: 'spotted', pctPerStack: 0.2 },
           desc: 'Hold to charge a piercing sniper bolt (up to 1.4s): more range and damage the longer you hold. +20% vs spotted targets.' },
      w: { name: 'Scout Drone', icon: '🛸', type: 'summon', mana: 40, cd: 20, color: 0xff9800,
           range: 900, summon: { kind: 'drone', ms: 7000, speed: 520, vision: 650, maxActive: 1, mark: { tag: 'spotted', ms: 3000, max: 1 } }, bot: 'skip',
           desc: 'Flies a drone toward the aim for 7s. It sees through bushes and spots enemies (3s) so your shots hit harder.' },
      e: { name: 'Edge Case', icon: '↗️', type: 'dash', mana: 45, cd: 11, color: 0xffffff,
           range: 400, hitRadius: 120, dmg: { base: 45, perLevel: 10, ad: 0.5 }, slow: { pct: 0.4, ms: 1600 },
           desc: 'Vaults away and throws an edge-case net that damages and slows foes passed.' },
      r: { name: 'Regression Barrage', icon: '🎯', type: 'projectile', mana: 100, cd: 65, color: 0xff5e5e,
           global: true, windupMs: 450, range: 5600, speed: 2600, width: 120, champOnly: true, dmg: { base: 240, perLevel: 30, ad: 1.25 },
           detonate: { tag: 'spotted', pctPerStack: 0.25 },
           desc: 'Aim anywhere (click the minimap, or auto-target a spotted champion). After a 0.45s windup, a map-wide shot hits the first champion; enemies see a warning line. +25% true damage on spotted targets.' },
    },
    build: ['mouse', 'jetpack', 'crit_compiler', 'grievous_linter', 'ultrawide', 'armor_shredder'],
    lines: { pick: 'Works on my machine? Prove it.', kill: 'Bug confirmed.', death: 'Cannot reproduce.' },
  },

  zero: {
    id: 'zero', name: 'Zero', title: 'the Security Ninja', role: 'Assassin', lane: 'jungle',
    emoji: '🥷', color: 0xb084ff, difficulty: 3, ranged: false,
    blurb: 'Gets in, gets admin, gets out. You never saw the commit.',
    look: { outfit: 'hoodie', hat: 'mask', prop: 'dagger', palette: [0x1a1a2e, 0xb084ff] },
    base:   { hp: 580, mana: 300, ad: 66, ap: 0, armor: 28, mr: 32, as: 0.68, range: 125, ms: 350 },
    growth: { hp: 95,  mana: 35,  ad: 4.2, armor: 4, mr: 1.6, as: 0.012 },
    skills: {
      q: { name: 'Fork Process', icon: '👤', type: 'shadow', mana: 30, cd: 7, color: 0xb084ff,
           range: 650, shadow: { mode: 'place', ms: 6000 }, bot: 'skip',
           desc: 'Forks a shadow clone to the aimed spot for 6s. It cannot be hit; it is your second body.' },
      w: { name: 'Context Switch', icon: '🔀', type: 'shadow', mana: 25, cd: 5, color: 0x8a6cff,
           shadow: { mode: 'swap' }, invisMs: 900, duration: 1500, buff: { msPct: 0.25 }, bot: 'escape',
           desc: 'Instantly swap places with your shadow, vanish for 0.9s and gain +25% move speed.' },
      e: { name: 'Brute Force', icon: '💥', type: 'circle', mana: 35, cd: 6, color: 0xd0a0ff,
           range: 0, radius: 240, delay: 0, alsoAtShadow: true, dmg: { base: 60, perLevel: 15, ad: 0.75 },
           mark: { tag: 'vuln', ms: 4000, max: 1 },
           desc: 'Slashes around you AND around your shadow at once. Hit champions are marked Vulnerable (4s) for Zero-Day.' },
      r: { name: 'Zero-Day', icon: '☠️', type: 'target', mana: 90, cd: 68, color: 0xff3b8a,
           range: 520, targets: 'enemyChamp', behindTarget: true, killReset: true, shadowAt: 'origin',
           suppress: { ms: 1000, strikeAtEnd: true, breakDist: 420, cancelCdPct: 0.5 },
           dmg: { base: 145, perLevel: 24, ad: 1.0 }, execute: { missingHpPct: 0.38 }, detonate: { tag: 'vuln', pctPerStack: 0.3 },
           desc: 'Blinks behind an enemy champion and suppresses them for 1s, then executes them, leaving a shadow where you stood. If you are stunned, knocked or killed first, the strike is cancelled. Vulnerable targets take +30% true damage. A kill resets R.' },
    },
    build: ['red_pen', 'sneakers', 'gauntlet', 'armor_shredder', 'crit_compiler', 'git_revert'],
    lines: { pick: 'sudo make me a sandwich.', kill: 'Access granted.', death: 'Firewall says no.' },
  },

  model: {
    id: 'model', name: 'Model', title: 'the Data Sorcerer', role: 'Controller', lane: 'mid',
    emoji: '📊', color: 0x00d4aa, difficulty: 3, ranged: true,
    blurb: 'Predicted you would stand there. Was right, with p < 0.05.',
    look: { outfit: 'sweater', hat: 'glasses', prop: 'chart', palette: [0x00d4aa, 0x005f4b] },
    kit: { res: { key: 'orbs', max: 3, start: 3, gainPerSec: 0.4, show: 'orbs' } },
    base:   { hp: 530, mana: 430, ad: 46, ap: 0, armor: 20, mr: 30, as: 0.62, range: 480, ms: 330 },
    growth: { hp: 86,  mana: 43,  ad: 3,  armor: 3.4, mr: 1.2, as: 0.01 },
    skills: {
      q: { name: 'Gradient Descent', icon: '📉', type: 'circle', mana: 45, cd: 5, color: 0x00d4aa,
           range: 850, radius: 200, delay: 350, dmg: { base: 65, perLevel: 15, ap: 0.6 }, slow: { pct: 0.4, ms: 1500 },
           spend: { res: 'orbs', min: 0, max: 3, per: { dmg: 0.3, radius: 0.08 } },
           desc: 'Collapses a data sphere. Spend 0-3 orbs: each adds +30% damage and a wider sphere.' },
      w: { name: 'Overfit', icon: '🛡️', type: 'self', mana: 40, cd: 12, color: 0x6cffd6,
           duration: 3500, buff: { msPct: 0.15 },
           spend: { res: 'orbs', min: 1, max: 3, per: { shield: { base: 45, perLevel: 8, ap: 0.22 } } },
           desc: 'Spend 1-3 orbs to wrap yourself in them: each orb is a shield layer. Also +15% move speed.' },
      e: { name: 'Random Forest', icon: '🌲', type: 'place', mana: 55, cd: 11, color: 0x2ecc71,
           range: 880, obj: { kind: 'barrier', len: 360, thick: 44, ms: 3500, orient: 'perp', maxActive: 1 },
           dmg: { base: 50, perLevel: 11, ap: 0.42 }, root: { ms: 700 },
           spend: { res: 'orbs', min: 0, max: 3, per: { rootMs: 250, radius: 0.12 } },
           desc: 'Plants a tree line across the aim (3.5s): a solid wall nobody can walk through. Enemies overlapping it when it sprouts are damaged and rooted. Spend 0-3 orbs: each adds +0.25s root and a longer wall.' },
      r: { name: 'Big Data', icon: '🌌', type: 'circle', mana: 100, cd: 80, color: 0x00ffcc,
           range: 1050, radius: 340, delay: 850, pullIn: true, pullInDist: 210, dmg: { base: 230, perLevel: 28, ap: 0.9 },
           spend: { res: 'orbs', min: 1, max: 3, per: { dmg: 0.25, radius: 0.07, stunMs: 250 } },
           desc: 'Singularity that drags enemies to the center. Spends 1-3 orbs: each adds +25% damage, +0.25s stun and range.' },
    },
    build: ['tech_book', 'sneakers', 'headphones', 'stackoverflow', 'rubber_duck', 'firewall'],
    lines: { pick: 'Correlation achieved.', kill: 'As predicted.', death: 'Outlier. Ignore it.' },
  },

  // ───────────── v2 "New Hires" (2026-11-07) ─────────────
  guard: {
    id: 'guard', name: 'Brick', title: 'the Security Guard', role: 'Tank', lane: 'top',
    emoji: '👮', color: 0x4a7bd0, difficulty: 2, ranged: false,
    blurb: 'Nobody gets past the lobby without a badge. Throws trespassers into the nearest wall.',
    look: { outfit: 'uniform', hat: 'cap', prop: 'flashlight', palette: [0x24324f, 0xffd23f] },
    base:   { hp: 680, mana: 280, ad: 58, ap: 0, armor: 38, mr: 34, as: 0.64, range: 125, ms: 335 },
    growth: { hp: 115, mana: 30,  ad: 3.6, armor: 4.8, mr: 2.0, as: 0.01 },
    skills: {
      q: { name: 'Shoulder Bash', icon: '🚨', type: 'dash', input: 'hold', mana: 40, cd: 9, color: 0xff5e5e,
           hold: { minMs: 200, maxMs: 1100, moveSlow: 0.5, quick: 0.4, scale: { range: [0.5, 1.4], dmg: [0.6, 1.6], knockback: [0.6, 1.6] } },
           range: 520, hitRadius: 95, stopAtFirst: true, dmg: { base: 55, perLevel: 14, ad: 0.7, hp: 0.03 },
           knockback: { dist: 260 }, wallStun: { ms: 1000 },
           desc: 'Hold to charge (up to 1.1s, you move slower), release to bash forward: longer charge means a longer rush, harder hit and bigger shove. Walls stun.' },
      w: { name: 'Clipboard of Rules', icon: '📋', type: 'circle', mana: 50, cd: 13, color: 0x9ec5ff,
           range: 0, radius: 300, delay: 200, taunt: { ms: 1000 },
           self: { duration: 4000, spellShieldMs: 2000, shield: { base: 95, perLevel: 18, hp: 0.07 }, buff: { armor: 20 } },
           desc: 'Reads out the rules: you instantly gain a max-HP shield, +20 armor and a 2s Spell Shield; after 0.2s every enemy within 300 px is TAUNTED for 1s and must attack you.' },
      e: { name: 'Barricade', icon: '🚧', type: 'place', mana: 50, cd: 14, color: 0x4a7bd0,
           range: 380, obj: { kind: 'barricade', r: 62, hp: { base: 260, perLevel: 40, hp: 0.12 }, ms: 6000, maxActive: 2 }, bot: 'opener',
           desc: 'Drops a solid barricade (max 2, 6s) that blocks movement for everyone until it is destroyed.' },
      r: { name: 'Building Lockdown', icon: '🔔', type: 'circle', mana: 100, cd: 78, color: 0xffd23f,
           range: 0, radius: 390, delay: 250, dmg: { base: 165, perLevel: 22, hp: 0.06 }, knockback: { dist: 320 }, wallStun: { ms: 1000 }, slow: { pct: 0.35, ms: 2000 },
           desc: 'Locks down the floor: every enemy nearby is damaged, slowed and blasted outward. Walls and barricades stun.' },
    },
    build: ['chair', 'sneakers', 'standing_desk', 'hoodie', 'kanban', 'server_rack'],
    lines: { pick: 'Badge, please.', kill: 'Escorted off the premises.', death: 'I need backup on floor 3...' },
  },

  cleaner: {
    id: 'cleaner', name: 'Mop', title: 'the Night-Shift Cleaner', role: 'Mage', lane: 'mid',
    emoji: '🧹', color: 0x2ecc71, difficulty: 2, ranged: true,
    blurb: 'Has seen everything this office did after 9 p.m. Mops the floor with you, literally.',
    look: { outfit: 'apron', hat: 'bandana', prop: 'broom', palette: [0x2e8b57, 0xffe066] },
    kit: { stance: { names: ['mop', 'bucket'], default: 'mop', affectsSkills: true, botPref: { near: 'mop', far: 'bucket', dist: 360 } } },
    base:   { hp: 510, mana: 440, ad: 46, ap: 0, armor: 20, mr: 30, as: 0.63, range: 450, ms: 330 },
    growth: { hp: 84,  mana: 44,  ad: 2.8, armor: 3.3, mr: 1.2, as: 0.01 },
    skills: {
      q: { name: 'Sweep', icon: '🧹', type: 'cone', mana: 35, cd: 5, color: 0xc8a165,
           range: 380, angle: 90, delay: 120, dmg: { base: 55, perLevel: 12, ap: 0.45 }, knockback: { dist: 160 },
           stances: {
             bucket: { name: 'Bucket Toss', icon: '🪣', type: 'circle', mana: 45, cd: 5.5, color: 0x7ec8ff, fx: 'bucketToss',
                       range: 760, radius: 190, delay: 450, dmg: { base: 60, perLevel: 13, ap: 0.5 }, slow: { pct: 0.3, ms: 1200 },
                       desc: 'Bucket stance: lobs a bucket of dirty water; it splashes after 0.45s, damaging and slowing.' },
           },
           desc: 'Mop stance: sweeps a 90 degree cone in front of you after 0.12s and shoves every enemy hit back.' },
      w: { name: 'Switch Gear', icon: '🔄', type: 'stance', mana: 0, cd: 3, color: 0xbfe6ff,
           cycle: ['mop', 'bucket'], duration: 1500, buff: { msPct: 0.15 }, bot: 'skip',
           desc: 'Swaps between Mop stance (melee: sweep, slide, mop-up) and Bucket stance (ranged: toss, bubble, flood).' },
      e: { name: 'Mop Slide', icon: '🌊', type: 'dash', mana: 45, cd: 12, color: 0xbfe6ff,
           range: 460, hitRadius: 70, dmg: { base: 45, perLevel: 10, ap: 0.4 }, slow: { pct: 0.25, ms: 1200 },
           trail: { radius: 230, duration: 3000, tickMs: 500, dmg: { base: 12, perLevel: 3, ap: 0.08 }, slow: { pct: 0.45, ms: 700 } },
           stances: {
             bucket: { name: 'Soap Bubble', icon: '🫧', type: 'circle', mana: 55, cd: 11, color: 0x7ec8ff, fx: 'bubble',
                       range: 800, radius: 200, delay: 700, dmg: { base: 60, perLevel: 14, ap: 0.5 }, slow: { pct: 0.6, ms: 2000 },
                       desc: 'Bucket stance: a giant soap bubble pops after 0.7s, damaging and slowing 60%.' },
           },
           desc: 'Mop stance: slides forward splashing enemies and leaves a Wet Floor that slows and burns for 3s.' },
      r: { name: 'Mop Up', icon: '🌀', type: 'zone', mana: 100, cd: 70, color: 0xbfe6ff,
           range: 0, radius: 380, duration: 3500, tickMs: 500, dmg: { base: 34, perLevel: 6, ap: 0.12 }, slow: { pct: 0.6, ms: 700 },
           stances: {
             bucket: { name: 'Flood', icon: '🌊', type: 'zone', mana: 110, cd: 82, color: 0x00e5ff, fx: 'flood',
                       range: 900, radius: 420, duration: 4500, tickMs: 500, dmg: { base: 40, perLevel: 6, ap: 0.14 }, slow: { pct: 0.65, ms: 700 },
                       desc: 'Bucket stance: floods a huge faraway area for 4.5s; everything inside crawls and is scalded.' },
           },
           desc: 'Mop stance: spins the mop around you for 3.5s: a big wet ring that slows 60% and burns.' },
    },
    build: ['tech_book', 'sneakers', 'headphones', 'midnight_oil', 'stackoverflow', 'pomodoro'],
    lines: { pick: 'Who left pizza in the server room?', kill: 'Swept.', death: 'Caution... wet... floor...' },
  },

  courier: {
    id: 'courier', name: 'Rush', title: 'the Delivery Rider', role: 'Jungler', lane: 'jungle',
    emoji: '🛵', color: 0xff7a1a, difficulty: 3, ranged: false,
    blurb: 'Rides a scooter through the jungle. Delivers in 30 minutes or your death is free.',
    look: { outfit: 'jacket', hat: 'helmet', prop: 'box', vehicle: 'scooter', palette: [0xff7a1a, 0xffffff] },
    kit: { pkg: { maxCarryMs: 25000, tipDist: 2600, tipMin: 0.25 } },
    base:   { hp: 600, mana: 300, ad: 64, ap: 0, armor: 28, mr: 32, as: 0.68, range: 125, ms: 355 },
    growth: { hp: 98,  mana: 34,  ad: 4,  armor: 4, mr: 1.6, as: 0.012 },
    skills: {
      q: { name: 'Express Delivery', icon: '🏍️', type: 'dash', mana: 45, cd: 8, color: 0xff9a3a,
           range: 620, hitRadius: 85, phase: { maxWall: 200 }, cdRefundOnHit: { slot: 'q', ms: 1500 }, dmg: { base: 70, perLevel: 16, ad: 0.8 },
           desc: 'Revs through a line, damaging every enemy and refunding 1.5s Q cooldown per champion hit. Cuts through thin walls (up to 200 px) like a shortcut. Distance counts toward your tip.' },
      w: { name: 'Pick Up Order', icon: '📦', type: 'pickup', mana: 30, cd: 14, color: 0xc8a165,
           pickup: { speedPct: -0.08 }, bot: 'skip',
           desc: 'Grabs a package (lost after 25s or on death). The farther you travel with it, the bigger the tip when you deliver.' },
      e: { name: 'Deliver', icon: '🏁', type: 'deliver', targets: 'ally', mana: 40, cd: 4, color: 0xffc04d,
           range: 700, toStruct: true,
           deliver: { shield: { base: 100, perLevel: 18, ad: 0.3 }, buff: { msPct: 0.3, as: 0.2 }, buffMs: 3000, goldBase: 30, goldPerTip: 90, structHealPct: 0.2 }, bot: 'skip',
           desc: 'Needs a package. Rushes to an ally (shield, +30% MS, +20% AS) or an allied tower (heals it) and hands it over. Longer trips pay more: tip scales the reward and gives you gold.' },
      r: { name: 'Peak Hours', icon: '💸', type: 'self', mana: 80, cd: 72, color: 0xff3b3b,
           duration: 6000, buff: { msPct: 0.25 }, resetOnCast: ['w'], tipMul: { ms: 6000, mul: 2 }, bot: 'self',
           desc: 'Surge pricing for 6s: +25% move speed, tips are doubled, and Pick Up Order is ready again.' },
    },
    build: ['mouse', 'sneakers', 'gauntlet', 'kanban', 'rgb_keyboard', 'ultrawide'],
    lines: { pick: 'Order picked up!', kill: 'Delivered.', death: 'Customer not home...' },
  },

  embedded: {
    id: 'embedded', name: 'Volt', title: 'the Embedded Engineer', role: 'Support', lane: 'support',
    emoji: '🔌', color: 0x00bcd4, difficulty: 3, ranged: true,
    blurb: 'Built Servo from a toaster and a microcontroller. Servo does most of the work.',
    look: { outfit: 'labcoat', hat: 'goggles', prop: 'solder', palette: [0xe0f7fa, 0x00bcd4] },
    pet: { name: 'Servo', emoji: '🤖', range: 320, atkMs: 900, follow: 110, dmg: { base: 20, perLevel: 4, ad: 0.15, ap: 0.12 } },
    base:   { hp: 540, mana: 410, ad: 44, ap: 0, armor: 22, mr: 30, as: 0.62, range: 470, ms: 330 },
    growth: { hp: 88,  mana: 42,  ad: 2.6, armor: 3.5, mr: 1.2, as: 0.01 },
    skills: {
      q: { name: 'Deploy Turret', icon: '🗼', type: 'place', mana: 55, cd: 8, color: 0x00e5ff,
           range: 650,
           obj: { kind: 'turret', r: 34, hp: { base: 140, perLevel: 22, ap: 0.2 }, ms: 20000, maxActive: 3, range: 520, atkMs: 700,
                  dmg: { base: 16, perLevel: 3, ad: 0.12, ap: 0.1 },
                  heat: { perShot: 6, max: 100, coolPerSec: 10, coolDelayMs: 1500,
                          explode: { radius: 230, dmg: { base: 80, perLevel: 14, ap: 0.5 }, stun: { ms: 400 } } } },
           desc: 'Deploys a gun turret (max 3, 20s). It fires at the nearest enemy and heats up; at 100 heat it EXPLODES, hurting enemies nearby.' },
      w: { name: 'Overclock', icon: '🔥', type: 'objcmd', mana: 50, cd: 12, color: 0xff9800,
           objcmd: { cmd: 'overclock', ms: 4000, atkMul: 0.5, heatMul: 2 }, duration: 4000, buff: { petPct: 0.5 }, bot: 'self',
           desc: 'All your turrets fire twice as fast for 4s but heat twice as fast. Servo gets +50% damage too.' },
      e: { name: 'Coolant Vent', icon: '🧊', type: 'objcmd', mana: 45, cd: 10, color: 0x9be7ff,
           objcmd: { cmd: 'vent', radius: 260, inner: 110, slow: { pct: 0.5, ms: 1500 } }, bot: 'self',
           desc: 'Vents every turret: heat drops to 0 and a ring of coolant mist (110-260 px from each turret) slows enemies 50%. The pocket right next to a turret stays clear.' },
      r: { name: 'Controlled Burst', icon: '🌩️', type: 'objcmd', mana: 100, cd: 62, color: 0x00ffff,
           objcmd: { cmd: 'detonate', heatMulPerPct: 0.01 }, bot: 'self',
           desc: 'Detonates all your turrets at once. Each blast deals more damage the hotter that turret is (up to double) and stuns.' },
    },
    build: ['power_bank', 'sneakers', 'headphones', 'rubber_duck', 'firewall', 'stackoverflow'],
    lines: { pick: 'Servo, boot up.', kill: 'Bit flipped.', death: 'Brown-out detected...' },
  },

  dev: {
    id: 'dev', name: 'Patch', title: 'the Software Engineer', role: 'Fighter', lane: 'top',
    emoji: '💻', color: 0x8e44ad, difficulty: 3, ranged: false,
    blurb: 'Fixes one bug, ships two. Fights with a mechanical keyboard and pure caffeine.',
    look: { outfit: 'hoodie', hat: 'headset', prop: 'laptop', palette: [0x5b2c83, 0x39c2ff] },
    kit: { stance: { names: ['main', 'hotfix', 'feature'], default: 'main', affectsSkills: true,
                     botPref: { near: 'hotfix', far: 'main', dist: 300, lowHp: 'feature', lowHpPct: 0.35 } } },
    base:   { hp: 600, mana: 300, ad: 62, ap: 0, armor: 30, mr: 32, as: 0.66, range: 150, ms: 340 },
    growth: { hp: 100, mana: 34,  ad: 4,  armor: 4.2, mr: 1.6, as: 0.012 },
    skills: {
      q: { name: 'Refactor', icon: '♻️', type: 'arc', mana: 35, cd: 5.5, color: 0xb084ff,
           range: 330, inner: 40, angle: 200, sweepMs: 260, delay: 80, dmg: { base: 70, perLevel: 16, ad: 0.85 }, healOnHit: { base: 45, perLevel: 10, hp: 0.04 },
           stances: {
             hotfix: { name: 'Hotfix', icon: '🩹', type: 'dash', mana: 30, cd: 4, color: 0xff3b8a, fx: 'hotfixSlash',
                       range: 300, hitRadius: 100, dmg: { base: 60, perLevel: 14, ad: 0.9 }, slow: { pct: 0.25, ms: 800 },
                       desc: 'Hotfix branch: a quick slashing dash through enemies. Short cooldown.' },
             feature: { name: 'Feature Creep', icon: '🌱', type: 'zone', mana: 45, cd: 8, color: 0x7ed957, fx: 'featureAura',
                        range: 0, radius: 280, duration: 2500, tickMs: 500, dmg: { base: 22, perLevel: 5, ad: 0.25 }, slow: { pct: 0.35, ms: 700 },
                        desc: 'Feature branch: a spreading aura for 2.5s that burns and slows everyone nearby.' },
           },
           desc: 'Main branch: swings the keyboard in a 200 degree arc in front of you (sweeping left to right in 0.26s), cleaving enemies and healing you for each champion hit.' },
      w: { name: 'git checkout', icon: '🌳', type: 'stance', mana: 0, cd: 2.5, color: 0x39c2ff,
           cycle: ['main', 'hotfix', 'feature'], duration: 3000, buff: { adPct: 0.1 }, bot: 'skip',
           desc: 'Cycles your branch: main (balanced), hotfix (fast, mobile, execute) or feature (tanky, area, team buffs). Q, E and R change with it.' },
      e: { name: 'git checkout -b', icon: '🌿', type: 'dash', mana: 50, cd: 11, color: 0xff3b8a,
           range: 380, hitRadius: 90, dmg: { base: 50, perLevel: 12, ad: 0.6 }, recast: { ms: 3000, mode: 'again' },
           stances: {
             hotfix: { name: 'Cherry-pick', icon: '🍒', type: 'blink', mana: 40, cd: 8, color: 0xff3b8a, fx: 'cherryPick',
                       range: 450, desc: 'Hotfix branch: blinks 450 px instantly.' },
             feature: { name: 'Scope Creep', icon: '🔨', type: 'circle', mana: 55, cd: 12, color: 0x7ed957, fx: 'scopeCreep',
                        range: 500, radius: 260, delay: 500, pullIn: true, pullInDist: 150,
                        dmg: { base: 55, perLevel: 12, ad: 0.6 }, desc: 'Feature branch: the scope grows. After 0.5s an area drags enemies inward and damages them.' },
           },
           desc: 'Main branch: branches off in a dash that damages enemies in your path. Press E again within 3s for a second dash.' },
      r: { name: 'Merge Conflict', icon: '⚔️', type: 'target', mana: 100, cd: 72, color: 0xff5e5e,
           range: 420, targets: 'enemyChamp', dmg: { base: 150, perLevel: 22, ad: 0.9 }, stun: { ms: 1500 },
           healOnHit: { base: 120, perLevel: 20, ad: 0.4 },
           stances: {
             hotfix: { name: 'Force Push', icon: '📤', type: 'target', mana: 90, cd: 60, color: 0xff1744, fx: 'forcePush',
                       range: 520, targets: 'enemyChamp', dmg: { base: 140, perLevel: 22, ad: 0.9 }, execute: { missingHpPct: 0.5 },
                       desc: 'Hotfix branch: force-pushes an enemy champion for heavy damage that grows with their missing HP.' },
             feature: { name: 'Release', icon: '🚀', type: 'allies', mana: 110, cd: 80, color: 0x7ed957, fx: 'release',
                        radius: 800, duration: 5000, heal: { base: 110, perLevel: 16, ad: 0.3 }, shield: { base: 100, perLevel: 14, ad: 0.3 }, buff: { adPct: 0.2 },
                        desc: 'Feature branch: ships a release to the team: heal, shield and +20% AD for 5s.' },
           },
           desc: 'Main branch: locks an enemy champion in a merge conflict: heavy damage, a 1.5s stun, and you heal from the fight.' },
    },
    build: ['mouse', 'sneakers', 'gauntlet', 'kanban', 'standing_desk', 'server_rack'],
    lines: { pick: 'LGTM.', kill: 'Fixed in prod.', death: 'It compiled on my machine...' },
  },

  appdev: {
    id: 'appdev', name: 'Swipe', title: 'the App Developer', role: 'Marksman', lane: 'bot',
    emoji: '📱', color: 0xff4fa3, difficulty: 3, ranged: true,
    blurb: "Throws last year's flagship phones at you. Ships an update mid-fight.",
    look: { outfit: 'tshirt', hat: 'beanie', prop: 'phone', palette: [0xff4fa3, 0x222222] },
    kit: { res: { key: 'ammo', max: 6, start: 6, gainPerSec: 0, show: 'ammo' } },
    base:   { hp: 550, mana: 300, ad: 60, ap: 0, armor: 22, mr: 30, as: 0.67, range: 500, ms: 330 },
    growth: { hp: 88,  mana: 36,  ad: 3.5, armor: 3.4, mr: 1.2, as: 0.025 },
    skills: {
      q: { name: 'Push Notification', icon: '🔔', type: 'projectile', mana: 8, cd: 0.8, color: 0xff4fa3,
           range: 840, speed: 1900, width: 62, dmg: { base: 48, perLevel: 10, ad: 0.62 }, slow: { pct: 0.15, ms: 600 },
           spend: { res: 'ammo', min: 1, max: 1 },
           desc: 'Fires one phone (1 ammo). Fast and cheap, but the magazine holds only 6.' },
      w: { name: 'Burst Update', icon: '📲', type: 'projectile', mana: 20, cd: 5, color: 0xff2d95,
           range: 760, speed: 1800, width: 62, count: 3, spread: 24, dmg: { base: 62, perLevel: 14, ad: 0.75 }, slow: { pct: 0.25, ms: 1000 },
           spend: { res: 'ammo', min: 2, max: 3 },
           desc: 'Fans out 3 phones (needs 2 ammo, spends up to 3) with a slow.' },
      e: { name: 'Swipe Left', icon: '👈', type: 'reload', mana: 0, cd: 1.5, color: 0xffffff,
           reload: { ms: 1700, perfect: [0.4, 0.6], jamMs: 500, step: 220, lockCasts: true,
                     perfectBonus: { buff: { as: 0.35, msPct: 0.2 }, ms: 3000 } },
           desc: 'Flicks back 220 px and reloads (1.7s). Press E again inside the gold window for an instant reload and +35% AS, +20% MS for 3s. Miss it and the gun jams.' },
      r: { name: 'App Store Launch', icon: '🚀', type: 'projectile', mana: 90, cd: 62, color: 0xff2d95,
           range: 1200, speed: 1950, width: 72, count: 7, spread: 50, execute: { missingHpPct: 0.15 }, dmg: { base: 160, perLevel: 22, ad: 0.9 },
           spend: { res: 'ammo', min: 1, max: 6, per: { dmg: 0.1 } },
           desc: 'Launches a 7-phone barrage and dumps the magazine: +10% damage per ammo spent (needs 1+). Bonus damage from missing HP.' },
    },
    build: ['caffeine', 'jetpack', 'rgb_keyboard', 'gauntlet', 'ultrawide', 'standing_desk'],
    lines: { pick: 'Shipping to both stores.', kill: '5 stars.', death: 'App not responding...' },
  },

  // ───────────── Pass 2 "Q4 Hires" (2026-11-21, RP-10) ─────────────
  sprint: {
    id: 'sprint', name: 'Sprint', title: 'the Scrum Master', role: 'Jungler', lane: 'jungle',
    emoji: '📌', color: 0xffb300, difficulty: 3, ranged: false,
    blurb: 'Timeboxes every fight to 15 minutes. Somehow they all run over.',
    look: { outfit: 'polo', hat: 'headband', prop: 'stopwatch', palette: [0xffb300, 0x1e3a5f] },
    base:   { hp: 610, mana: 300, ad: 63, ap: 0, armor: 30, mr: 32, as: 0.67, range: 125, ms: 350 },
    growth: { hp: 98,  mana: 34,  ad: 4,  armor: 4.1, mr: 1.6, as: 0.012 },
    skills: {
      q: { name: 'Daily Stand-up', icon: '🧍', type: 'circle', mana: 35, cd: 5.5, color: 0xffc94d,
           range: 0, radius: 260, delay: 0, dmg: { base: 65, perLevel: 15, ad: 0.85 }, slow: { pct: 0.35, ms: 1500 },
           desc: 'Calls a stand-up: slams nearby foes and slows them.' },
      w: { name: 'Sprint Planning', icon: '⏱️', type: 'timebox', mana: 40, cd: 16, color: 0xffe066,
           timebox: { ms: 4000, refundPct: 0.6, exclude: ['w', 'r'], buff: { adPct: 0.12, as: 0.15 } }, bot: 'self',
           desc: 'Opens a 4s timebox (+12% AD, +15% AS). When it ends, 60% of the cooldown of every Q and E you cast inside it is refunded.' },
      e: { name: 'Story Points', icon: '🃏', type: 'dash', mana: 45, cd: 10, color: 0xffffff,
           range: 520, toTarget: true, killReset: true, hitRadius: 65, stopAtFirst: true, dmg: { base: 65, perLevel: 15, ad: 0.8 }, stun: { ms: 700 },
           untarget: { ms: 350 },
           desc: 'Leaps onto a target to damage and stun (0.7s). You cannot be targeted while in the air. Killing a champion resets E cooldown.' },
      r: { name: 'All Hands Sprint', icon: '📣', type: 'allies', mana: 100, cd: 75, color: 0xff9800,
           radius: 750, duration: 5000, buff: { msPct: 0.4, adPct: 0.15, as: 0.2 },
           desc: 'Rallies the team for a 5s sprint: allies within range get +40% MS, +15% AD and +20% AS.' },
    },
    build: ['red_pen', 'sneakers', 'gauntlet', 'second_monitor', 'standing_desk', 'letter_opener'],
    lines: { pick: "Let's timebox this.", kill: 'Done done.', death: 'Moving it to next sprint...' },
  },

  cache: {
    id: 'cache', name: 'Cache', title: 'the Data Engineer', role: 'Marksman', lane: 'bot',
    emoji: '💾', color: 0x5c7cfa, difficulty: 3, ranged: true,
    blurb: 'Remembers every mistake you made. Serves them back to you in under 2 ms.',
    look: { outfit: 'flannel', hat: 'snapback', prop: 'usb', palette: [0x5c7cfa, 0xd64545] },
    base:   { hp: 545, mana: 310, ad: 59, ap: 0, armor: 22, mr: 30, as: 0.67, range: 520, ms: 330 },
    growth: { hp: 87,  mana: 36,  ad: 3.5, armor: 3.4, mr: 1.2, as: 0.024 },
    skills: {
      q: { name: 'Batch Job', icon: '🗃️', type: 'projectile', mana: 40, cd: 6, color: 0x5c7cfa,
           range: 960, speed: 1850, width: 75, pierce: true, cdRefundOnHit: { slot: 'all', ms: 1000 }, dmg: { base: 68, perLevel: 15, ad: 0.9 },
           mark: { tag: 'stale', ms: 6000, max: 3 },
           desc: 'Fires a piercing batch bolt; hitting a champion refunds 1s off ALL cooldowns and adds a Stale stack (max 3, 6s).' },
      w: { name: 'Cache Line', icon: '🪞', type: 'echo', mana: 40, cd: 14, color: 0x91a7ff,
           echo: { armMs: 5000, delayMs: 1200, mulPct: 0.6, exclude: ['w', 'r'] }, bot: 'self',
           desc: 'Stores your next Q or E (within 5s). It fires a free copy of itself 1.2s later at 60% power, aimed the same way.' },
      e: { name: 'Failover', icon: '🔀', type: 'blink', mana: 50, cd: 14, color: 0xffffff,
           range: 400, untarget: { ms: 600 },
           desc: 'Instantly blinks to a standby position and stays untargetable for 0.6s while the failover completes. Storable by Cache Line: the copy blinks too.' },
      r: { name: 'Full Table Scan', icon: '🧮', type: 'projectile', mana: 100, cd: 68, color: 0xd64545,
           range: 2100, speed: 2450, width: 115, pierce: true, dmg: { base: 210, perLevel: 28, ad: 1.15 },
           detonate: { tag: 'stale', pctPerStack: 0.2 },
           desc: 'Fires a lane-wide beam through every enemy; each Stale stack on a champion adds +20% of the hit as true damage.' },
    },
    build: ['mouse', 'jetpack', 'rgb_keyboard', 'energy_crate', 'ultrawide', 'letter_opener'],
    lines: { pick: 'SELECT * FROM enemies;', kill: 'Row deleted.', death: 'Cache miss...' },
  },

  hr: {
    id: 'hr', name: 'Hira', title: 'the People Partner', role: 'Support', lane: 'support',
    emoji: '🤝', color: 0xf7a072, difficulty: 2, ranged: true,
    blurb: 'Keeps the team together with snacks, policies and the occasional mandatory meeting.',
    look: { outfit: 'blazer', hat: 'bun', prop: 'clipboard', palette: [0x6d597a, 0xf7a072] },
    base:   { hp: 545, mana: 420, ad: 44, ap: 0, armor: 23, mr: 30, as: 0.62, range: 460, ms: 330 },
    growth: { hp: 89,  mana: 43,  ad: 2.6, armor: 3.5, mr: 1.2, as: 0.01 },
    skills: {
      q: { name: 'Feedback Hook', icon: '💬', type: 'projectile', mana: 55, cd: 11, color: 0xf7a072,
           range: 880, speed: 1650, width: 75, dmg: { base: 60, perLevel: 14, ap: 0.5 }, charm: { ms: 1100 },
           desc: 'Sends a flirty meeting invite: the first enemy hit is CHARMED for 1.1s and walks toward you, unable to attack or cast.' },
      w: { name: 'Buddy System', icon: '🪢', type: 'link', targets: 'ally', mana: 60, cd: 14, color: 0x7ed957,
           range: 700, link: { ms: 6000, sharePct: 0.5, breakRange: 900, pairRange: 700, heal: { base: 40, perLevel: 9, ap: 0.25 } }, bot: 'peel',
           desc: 'Links an ally with the teammate nearest to them (you count). For 6s each takes only half of the damage dealt to either; the rest is shared. Breaks beyond 900 px.' },
      e: { name: 'Policy Update', icon: '📜', type: 'zone', mana: 55, cd: 10, color: 0xffd8a8,
           range: 750, radius: 225, duration: 3000, tickMs: 500, dmg: { base: 14, perLevel: 3, ap: 0.1 }, slow: { pct: 0.45, ms: 700 },
           desc: 'Spreads a 3s policy puddle that slows and burns everyone standing inside.' },
      r: { name: 'Mandatory Meeting', icon: '📅', type: 'circle', mana: 110, cd: 82, color: 0xff6b6b,
           range: 800, radius: 360, delay: 650, dmg: { base: 150, perLevel: 20, ap: 0.6 }, silence: { ms: 2500 }, slow: { pct: 0.4, ms: 2500 },
           desc: 'Calls an all-hands: after 0.65s enemies in the area are damaged, slowed 40% and SILENCED for 2.5s.' },
    },
    build: ['power_bank', 'sneakers', 'rubber_duck', 'team_lunch', 'cloud_credits', 'vpn_hoodie'],
    lines: { pick: "Let's circle back.", kill: 'Your position has been eliminated.', death: "I'll take this offline..." },
  },

  lint: {
    id: 'lint', name: 'Lint', title: 'the Code Reviewer', role: 'Controller', lane: 'mid',
    emoji: '📝', color: 0xe17055, difficulty: 3, ranged: true,
    blurb: 'Has never approved a pull request on the first try. Never will.',
    look: { outfit: 'cardigan', hat: 'monocle', prop: 'redpen', palette: [0xe17055, 0x2d3436] },
    base:   { hp: 525, mana: 430, ad: 46, ap: 0, armor: 21, mr: 30, as: 0.63, range: 470, ms: 330 },
    growth: { hp: 85,  mana: 43,  ad: 2.9, armor: 3.4, mr: 1.2, as: 0.01 },
    skills: {
      q: { name: 'Nit Pin', icon: '✏️', type: 'place', mana: 35, cd: 4, color: 0xff7675,
           range: 700, obj: { kind: 'pin', pin: 'nit', r: 90, ms: 30000, group: 'pins', maxActive: 5, armMs: 400, trigger: 'enemy', hideAfterMs: 1500 },
           dmg: { base: 55, perLevel: 12, ap: 0.45 }, slow: { pct: 0.3, ms: 1200 }, mark: { tag: 'nit', ms: 6000, max: 4 }, bot: 'opener',
           desc: 'Pins a comment on the map (max 5 pins total, 30s). The first enemy to touch it takes damage, a slow and a Nit stack.' },
      w: { name: 'Blocker Pin', icon: '🛑', type: 'place', mana: 50, cd: 9, color: 0xd63031,
           range: 700, obj: { kind: 'pin', pin: 'block', r: 100, ms: 30000, group: 'pins', maxActive: 5, armMs: 400, trigger: 'enemy', hideAfterMs: 1500 },
           dmg: { base: 50, perLevel: 11, ap: 0.45 }, disarm: { ms: 1800 }, mark: { tag: 'nit', ms: 6000, max: 4 }, bot: 'opener',
           desc: 'Pins a Request Changes blocker: the first enemy to touch it is damaged and DISARMED (1.8s: no basic attacks, skills still work) and gains a Nit stack.' },
      e: { name: 'Suggestion Pin', icon: '💡', type: 'place', mana: 45, cd: 8, color: 0x55efc4,
           range: 700, obj: { kind: 'pin', pin: 'suggest', r: 100, ms: 30000, group: 'pins', maxActive: 5, armMs: 200, trigger: 'ally', hideAfterMs: 0 },
           heal: { base: 55, perLevel: 11, ap: 0.35 }, duration: 1800, buff: { msPct: 0.25 }, bot: 'skip',
           desc: 'Pins a friendly suggestion: the first ALLY to touch it is healed and gets +25% move speed. Enemies see it and avoid it.' },
      r: { name: 'Merge When Resolved', icon: '🧨', type: 'resolve', mana: 90, cd: 70, color: 0xe17055,
           resolve: { group: 'pins', radiusMul: 1.5, dmgMul: 1.0, detonate: { tag: 'nit', pctPerStack: 0.18 } }, bot: 'self',
           desc: 'Resolves every thread: ALL your pins detonate at once with a 1.5x radius and normal effects. Each Nit stack on a champion adds +18% true damage. Needs at least one pin.' },
    },
    build: ['tech_book', 'smartwatch', 'headphones', 'cloud_credits', 'stackoverflow', 'vpn_hoodie'],
    lines: { pick: 'Nit: everything.', kill: 'Changes requested.', death: 'LGTM... wait... no...' },
  },

  // ── 2026-11-25 "Night Shift" hires ──
  barista: {
    id: 'barista', name: 'Brew', title: 'the Office Barista', role: 'Support', lane: 'support',
    emoji: '☕', color: 0xc8864a, difficulty: 3, ranged: true,
    blurb: 'Knows everyone\'s order and everyone\'s secrets. Runs the break room, and so runs the office.',
    look: { outfit: 'barista', hat: 'flatcap', prop: 'mug', palette: [0x6f4e37, 0xf5e6d3] },
    kit: { mix: { max: 3, expireMs: 15000 } },
    base:   { hp: 540, mana: 410, ad: 45, ap: 0, armor: 22, mr: 30, as: 0.63, range: 480, ms: 330 },
    growth: { hp: 88,  mana: 42,  ad: 2.7, armor: 3.4, mr: 1.2, as: 0.011 },
    skills: {
      q: { name: 'Espresso Shot', icon: '☕', type: 'projectile', mana: 35, cd: 5, color: 0xc8864a, addMix: 'S',
           range: 700, speed: 1450, width: 70, count: 3, spread: 28, dmg: { base: 45, perLevel: 10, ap: 0.38 }, slow: { pct: 0.2, ms: 1200 }, blind: { ms: 1000 },
           desc: 'Sprays three streams of scalding coffee that burn, slow and BLIND (1s: basic attacks miss). Adds a SHOT to your mix.' },
      w: { name: 'Steamed Milk', icon: '🥛', type: 'allies', mana: 40, cd: 8, color: 0xf5e6d3, addMix: 'M',
           radius: 450, duration: 3000, heal: { base: 40, perLevel: 9, ap: 0.28 }, buff: { msPct: 0.12 },
           desc: 'Steams a round of milk: heals nearby allies and speeds them up. Adds MILK to your mix.' },
      e: { name: 'Syrup Spill', icon: '🍯', type: 'circle', mana: 40, cd: 8, color: 0xffb347, addMix: 'G',
           range: 700, radius: 190, delay: 400, dmg: { base: 35, perLevel: 8, ap: 0.3 }, slow: { pct: 0.5, ms: 1800 },
           desc: 'Spills sticky syrup: a small blast that slows 50%. Adds SYRUP to your mix.' },
      r: { name: 'Serve', icon: '🛎️', type: 'serve', mana: 90, cd: 60, color: 0x7ed957,
           serve: {
             range: 700, sizeMul: [0.6, 0.85, 1.0],
             outcomes: {
               shot:  { name: 'Triple Espresso', type: 'circle', radius: 290, delay: 450, range: 700, dmg: { base: 200, perLevel: 26, ap: 0.8 }, stun: { ms: 800 }, fx: 'serveShot', color: 0xc8864a },
               milk:  { name: 'Latte Art', type: 'allies', radius: 650, duration: 3000, heal: { base: 150, perLevel: 20, ap: 0.55 }, shield: { base: 90, perLevel: 12, ap: 0.3 }, fx: 'serveMilk', color: 0xf5e6d3 },
               syrup: { name: 'Sugar Rush', type: 'allies', radius: 650, duration: 4000, buff: { msPct: 0.35, as: 0.35 }, fx: 'serveSugar', color: 0xffb347 },
               mocha: { name: 'Mocha Break', type: 'zone', radius: 330, range: 700, duration: 4000, tickMs: 500, heal: { base: 16, perLevel: 3, ap: 0.08 }, dmg: { base: 22, perLevel: 4, ap: 0.1 }, slow: { pct: 0.35, ms: 700 }, fx: 'serveMocha', color: 0x7ed957 },
               plain: { name: 'Plain Drip', type: 'circle', radius: 200, delay: 350, range: 700, dmg: { base: 70, perLevel: 12, ap: 0.4 }, slow: { pct: 0.3, ms: 1000 }, fx: 'servePlain', color: 0x8d6e63 },
             },
           }, bot: 'opener',
           desc: 'Serves your mix (up to 3 ingredients, 15s). Mostly SHOT: stunning blast. Mostly MILK: team heal+shield. Mostly SYRUP: team speed. A tie or all three: Mocha zone. Empty: a weak drip. Fewer ingredients, weaker serve.' },
    },
    build: ['power_bank', 'sneakers', 'team_lunch', 'headphones', 'firewall', 'midnight_oil'],
    lines: { pick: 'One oat-milk latte for the whole team!', kill: 'Order up!', death: 'Out of beans...' },
  },

  oncall: {
    id: 'oncall', name: 'Pager', title: 'the On-Call SRE', role: 'Jungler', lane: 'jungle',
    emoji: '📟', color: 0xff5252, difficulty: 3, ranged: false,
    blurb: 'Has not slept through the night since 2019. Answers every page within a minute, and arrives angry.',
    look: { outfit: 'hoodie', hat: 'sleepmask', prop: 'pager', palette: [0x2b2d42, 0xff5252] },
    base:   { hp: 615, mana: 300, ad: 64, ap: 0, armor: 30, mr: 32, as: 0.67, range: 140, ms: 345 },
    growth: { hp: 97,  mana: 34,  ad: 4.1, armor: 4, mr: 1.6,  as: 0.012 },
    skills: {
      q: { name: 'Ping', icon: '📶', type: 'dash', mana: 35, cd: 6, color: 0xff5252,
           range: 560, toTarget: true, targets: 'enemy', hitRadius: 65, dmg: { base: 60, perLevel: 14, ad: 0.7 }, slow: { pct: 0.4, ms: 1500 },
           detonate: { tag: 'paged', pctPerStack: 0.3 },
           desc: 'Pings a target and rushes onto it, slowing them 40%; +30% true damage if they are Paged. Works on monsters to hop between camps.' },
      w: { name: 'Page Everyone', icon: '📟', type: 'projectile', mana: 50, cd: 12, color: 0xffb347,
           range: 1400, speed: 1800, width: 90, pierce: true, champOnly: true, dmg: { base: 45, perLevel: 10, ad: 0.45 }, slow: { pct: 0.3, ms: 1500 },
           mark: { tag: 'paged', ms: 6000, max: 1 },
           desc: 'Sends a long-range alert through every champion in a line: damage, slow, and a Paged mark that Ping cashes in.' },
      e: { name: 'Postmortem', icon: '📋', type: 'circle', mana: 55, cd: 16, color: 0xffffff,
           range: 0, radius: 270, delay: 150, dmg: { base: 55, perLevel: 12, ad: 0.5 }, fear: { ms: 800 }, slow: { pct: 0.4, ms: 1500 },
           desc: 'Reads the incident report out loud: after 0.15s enemies nearby take damage, FLEE in fear for 0.8s, then stay slowed 40% for 1.5s.' },
      r: { name: 'Rollback', icon: '⏮️', type: 'rewind', mana: 100, cd: 90, color: 0xff1744,
           rewind: { lookbackMs: 3000, radius: 900, pos: true, hp: true, cleanse: true, allies: true }, bot: 'self',
           desc: 'Rolls the whole team back 3s: you and every ally within 900 px return to where they stood and regain the HP they had (never lose HP), and are cleansed.' },
    },
    build: ['red_pen', 'sneakers', 'gauntlet', 'kanban', 'rgb_keyboard', 'standing_desk'],
    lines: { pick: 'Acknowledged.', kill: 'Incident resolved.', death: 'Escalating to the next on-call...' },
  },
};

/**
 * v6 visual identity: the render style of every skill (client only — resolved by src/entities/moba/SkillFx.js).
 * A string applies to every effect kind of the skill; an object picks one per kind (dash / zone / ...).
 * Stance variants and Brew's serve outcomes carry their own inline `fx` (see champions above).
 * Every style name is specified in docs/02_CHAMPIONS_AND_SKILLS.md [v6 numbering] section 7 and, for v6.1, in docs/02_CHAMPIONS_AND_SKILLS.md [v6.1 numbering]
 * section 7 (the per-skill recipe table is normative and overrides any older description of the same style name).
 */
export const SKILL_FX = {
  pixel:    { q: 'laserFence', w: 'pixelOrb', e: 'rewind', r: 'pixelWipe' },
  stack:    { q: 'hook', w: 'accessToggle', e: 'portal', r: 'rowLift' },
  ops:      { q: 'scan', w: 'tether', e: 'swap', r: 'blueGreen' },
  tester:   { q: 'sniperCharge', w: 'drone', e: 'vault', r: 'snipeGlobal' },
  zero:     { q: 'shadowCast', w: 'shadowSwap', e: 'bladeSpin', r: 'suppressStrike' },
  model:    { q: 'dataSphere', w: 'orbShield', e: 'forestWall', r: 'singularity' },
  guard:    { q: 'bashCharge', w: 'badgeCheck', e: 'barricade', r: 'lockdown' },
  cleaner:  { q: 'broomCone', w: 'gearSwitch', e: { dash: 'skid', zone: 'puddle' }, r: 'mopSpin' },
  courier:  { q: 'tirePhase', w: 'pickup', e: 'deliver', r: 'rushHour' },
  embedded: { q: 'turretDeploy', w: 'overclockTurrets', e: 'ventRing', r: 'chainBlast' },
  dev:      { q: 'arcSwing', w: 'checkout', e: 'branch', r: 'mergeLock' },
  appdev:   { q: 'notif', w: 'burstUpdate', e: 'swipeReload', r: 'storeLaunch' },
  sprint:   { q: 'standup', w: 'timebox', e: 'leapGhost', r: 'rally' },
  cache:    { q: 'batch', w: 'echoArm', e: 'failoverBlink', r: 'tableScan' },
  hr:       { q: 'charmInvite', w: 'buddyLink', e: 'policy', r: 'allHands' },
  lint:     { q: 'pinNit', w: 'pinBlock', e: 'pinSuggest', r: 'resolveBurst' },
  barista:  { q: 'espressoSpray', w: 'milkSteam', e: 'syrup', r: 'serve' },
  oncall:   { q: 'pingHop', w: 'pageWave', e: 'postmortem', r: 'rollback' },
};
for (const [id, slots] of Object.entries(SKILL_FX)) {
  for (const [slot, fx] of Object.entries(slots)) CHAMPIONS[id].skills[slot].fx = fx;
}

export const CHAMPION_IDS = Object.keys(CHAMPIONS);

/** Role order bots fill a team in (the human's pick takes its role first). */
export const ROLE_ORDER = ['top', 'jungle', 'mid', 'bot', 'support'];
/** Champions bots may pick for each role — v2: a RANDOM available one (variety), else any free champion. */
export const ROLE_PICKS = {
  top: ['stack', 'guard', 'dev', 'oncall'],
  jungle: ['zero', 'courier', 'sprint', 'dev', 'oncall'],
  mid: ['pixel', 'model', 'cleaner', 'lint'],
  bot: ['tester', 'appdev', 'cache', 'pixel'],
  support: ['ops', 'embedded', 'hr', 'guard', 'model', 'barista'],
};

/** v6: spec types whose cast never auto-aims at an enemy (self / ally / world-point / mode skills). */
const NO_ENEMY_AIM_TYPES = new Set([
  'blink', 'self', 'allies', 'swap', 'place', 'rewind', 'tether', 'link', 'stance', 'shadow', 'summon',
  'echo', 'timebox', 'reload', 'pickup', 'deliver', 'serve', 'resolve', 'objcmd',
]);

/** v4 auto-aim policy (shared by client + server): does a no-direction cast of this skill aim at an
 *  enemy? Abilities that MOVE the caster along a direction never do — blinks and every dash that isn't
 *  toTarget go in the direction of travel (stick / last move / facing) instead (player request 2026-11-08).
 *  v6: ally-targeted skills (`targets: 'ally'`) and the types in NO_ENEMY_AIM_TYPES never aim at an enemy. */
export function autoAimsAtEnemy(spec) {
  if (!spec || NO_ENEMY_AIM_TYPES.has(spec.type) || spec.targets === 'ally') return false;
  if (spec.at === 'pet' || spec.at === 'shadow' || !(spec.range > 0)) return false;
  if (spec.type === 'dash' && !spec.toTarget) return false;
  return true;
}
/** Auto-aim search radius: point-and-click (target / toTarget) skills only look within castable
 *  range (+30, the server's cast slack) so an out-of-range champion never beats an in-range minion. */
export function autoAimReach(spec, slack = 150) {
  if (spec.global) return spec.range; // v6.1: map-wide skills search the whole castable range (prefer spotted champions)
  const castable = spec.type === 'target' || !!spec.toTarget;
  return (spec.range || spec.radius || 500) + (castable ? 30 : slack);
}

/**
 * v6: the spec that is ACTIVE for `slot` given the champion's current stance (null/undefined = default
 * stance). A stance variant (`spec.stances[name]`) FULLY REPLACES the base spec; the base spec is the
 * default stance. Server, OfflineSim, HUD and VFX must all call this instead of reading def.skills directly.
 */
export function resolveSkill(def, slot, stance) {
  const base = def?.skills?.[slot];
  if (!base) return null;
  if (stance && base.stances && Object.hasOwn(base.stances, stance)) return base.stances[stance];
  return base;
}
/** v6: default stance name of a champion ('' if it has none). */
export function defaultStance(def) { return def?.kit?.stance?.default || ''; }
/** v6: the `cycle` successor of `cur` for a 'stance' skill (wraps around). */
export function nextStance(spec, cur) {
  const c = spec?.cycle || [];
  if (!c.length) return '';
  const i = c.indexOf(cur);
  return c[(i + 1) % c.length];
}

/**
 * v6: parse the `kit:<key>:<value>` tags out of TeamChamp.buffs (comma string) into { key: value } (values are
 * strings). Keys: stance, orbs, ammo, mix, pkg, shadow, echo, tbox, tether, link, reload, turrets, pins.
 * Generic buff-icon renderers must skip every tag that starts with 'kit:'.
 */
export function parseKitTags(buffs) {
  const out = {};
  if (!buffs) return out;
  for (const t of String(buffs).split(',')) {
    if (!t.startsWith('kit:')) continue;
    const i = t.indexOf(':', 4);
    if (i > 4) out[t.slice(4, i)] = t.slice(i + 1);
  }
  return out;
}

export function isChampionId(id) { return typeof id === 'string' && Object.hasOwn(CHAMPIONS, id); }

/** 18 unique champion passives — one distinct mechanic per champion. */
export const CHAMPION_PASSIVES = {
  pixel:    { id: 'syntax_surge',   name: 'Syntax Surge',    desc: 'Casting a skill grants +12% move speed for 1.5s and restores 4% max mana on champion hit.' },
  stack:    { id: 'failover',       name: 'Failover Armor',  desc: 'Taking damage grants +3 armor (stacks up to +15 for 4s).' },
  ops:      { id: 'uptime_pulse',   name: 'Uptime Pulse',    desc: 'Healing or shielding an ally reduces your ultimate cooldown by 2s and grants +15% MS.' },
  tester:   { id: 'regression_mark',name: 'Regression Mark', desc: 'Every 3rd basic attack on a target detonates a bug report for +35% bonus physical damage.' },
  zero:     { id: 'zero_day',       name: 'Zero-Day Strike', desc: 'First attack after leaving a bush or out-of-combat deals +30% bonus damage.' },
  model:    { id: 'gradient_stack', name: 'Gradient Descent',desc: 'Consecutive skill hits within 4s deal +10% escalating magic damage (up to +30%).' },
  guard:    { id: 'brick_wall',     name: 'Firewall Plating',desc: 'Standing near an allied tower or champion reduces incoming damage by 10%.' },
  cleaner:  { id: 'clean_sweep',    name: 'Clean Sweep',     desc: 'Killing a minion or monster restores 25 HP and 20 mana instantly.' },
  courier:  { id: 'slipstream',     name: 'Express Delivery',desc: 'Moving continuously builds momentum: next basic attack deals +25% bonus damage and slows 15%.' },
  embedded: { id: 'servo_emp',      name: 'Servo EMP',       desc: 'Every 4th basic attack discharges a pulse through your pet for +40 bonus magic damage.' },
  dev:      { id: 'hotfix_fury',    name: 'Hotfix Fury',     desc: 'Below 50% HP, gain +12% attack damage and +12% lifesteal.' },
  appdev:   { id: 'swipe_combo',    name: 'Swipe Combo',     desc: 'Alternating a skill and a basic attack empowers the attack with +28% bonus damage.' },
  sprint:   { id: 'velocity_rush',  name: 'Sprint Velocity', desc: 'Takedowns and camp kills grant +25% move speed for 2.5s and heal 45 HP.' },
  cache:    { id: 'cache_hit',      name: 'Cache Hit',       desc: 'Attacking the same target repeatedly grants +6% bonus damage per hit (up to +24%).' },
  hr:       { id: 'team_bond',      name: 'Culture Fit',     desc: 'Nearby allied champions grant +10% shield/heal power and +12% move speed when assisting.' },
  lint:     { id: 'strict_audit',   name: 'Strict Audit',    desc: 'Skills apply a 2s mark reducing enemy armor by 15%.' },
  barista:  { id: 'caffeine_brew',  name: 'Espresso Shot',   desc: 'Every 2nd skill cast brews a shot that restores 6% max HP to you and the nearest ally.' },
  oncall:   { id: 'pager_alert',    name: 'Incident Response',desc: 'Deal +25% bonus damage to jungle monsters/epics and gain +15% MS toward low-HP enemies.' },
};

export function championPassive(def) {
  if (!def) return null;
  return def.passive || CHAMPION_PASSIVES[def.id] || CHAMPION_PASSIVES.dev;
}

/** Classify skill damage channel for armor vs magic resist resolution. */
export function skillDamageType(skill) {
  if (skill?.dmgType) return skill.dmgType;
  if ((skill?.dmg?.ap || 0) > 0 && !(skill?.dmg?.ad > 0)) return 'magic';
  return 'physical';
}

// shared/moba/champions.js — Team Mode champions (original office-dev roster).
// Shared by server (stats + skill engine) and client (select screen, HUD, VFX).
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

export const CHAMPIONS = {
  pixel: {
    id: 'pixel', name: 'Pixel', title: 'the Frontend Wizard', role: 'Mage', lane: 'mid',
    emoji: '🎨', color: 0x39c2ff, difficulty: 2, ranged: true,
    blurb: 'Ships beautiful damage from a safe distance. Breaks if you look at it on Internet Explorer.',
    look: { outfit: 'turtleneck', hat: 'beret', prop: 'stylus', palette: [0x39c2ff, 0xff4fa3] },
    base:   { hp: 520, mana: 420, ad: 48, ap: 0, armor: 20, as: 0.65, range: 460, ms: 330 },
    growth: { hp: 86,  mana: 42,  ad: 3,  armor: 3.4, as: 0.01 },
    skills: {
      q: { name: 'CSS Bolt', icon: '💠', type: 'projectile', mana: 45, cd: 5, color: 0x39c2ff,
           range: 950, speed: 1500, width: 70, dmg: { base: 80, perLevel: 18, ap: 0.7 },
           desc: 'Fires a styled bolt that damages the first enemy hit.' },
      w: { name: 'Flexbox Barrier', icon: '📦', type: 'self', mana: 60, cd: 12, color: 0x7ec8ff,
           duration: 3000, shield: { base: 90, perLevel: 20, ap: 0.5 }, buff: { msPct: 0.15 },
           desc: 'Wraps yourself in a shield that flexes to fit any damage. +15% move speed.' },
      e: { name: 'Hot Reload', icon: '⚡', type: 'blink', mana: 70, cd: 13, color: 0xffffff,
           range: 420, desc: 'Instantly reloads yourself somewhere else nearby.' },
      r: { name: 'Framework Rewrite', icon: '🌀', type: 'circle', mana: 100, cd: 70, color: 0xb084ff,
           range: 950, radius: 320, delay: 750, dmg: { base: 260, perLevel: 30, ap: 0.9 },
           desc: 'After a short delay, rewrites a whole area in the new framework. Massive damage.' },
    },
    build: ['tech_book', 'sneakers', 'headphones', 'stackoverflow', 'rubber_duck', 'standing_desk'],
    lines: { pick: 'It works in Chrome.', kill: 'Pixel-perfect.', death: 'Who added !important?!' },
  },

  stack: {
    id: 'stack', name: 'Stack', title: 'the Backend Tank', role: 'Tank', lane: 'top',
    emoji: '🗄️', color: 0x7ed957, difficulty: 1, ranged: false,
    blurb: 'Handles any load you throw at it. Scales horizontally into your face.',
    look: { outfit: 'armor', hat: 'hardhat', prop: 'database', palette: [0x3b7a2a, 0x7ed957] },
    base:   { hp: 650, mana: 280, ad: 62, ap: 0, armor: 36, as: 0.66, range: 125, ms: 340 },
    growth: { hp: 112, mana: 30,  ad: 4,  armor: 4.6, as: 0.01 },
    skills: {
      q: { name: 'Heavy Query', icon: '🔨', type: 'target', mana: 35, cd: 6, color: 0x7ed957,
           range: 210, targets: 'enemy', dmg: { base: 50, perLevel: 15, ad: 1.1 }, slow: { pct: 0.35, ms: 1500 },
           desc: 'Slams a target with an unindexed query. Damages and slows.' },
      w: { name: 'Load Balancer', icon: '🛡️', type: 'self', mana: 50, cd: 14, color: 0xb6ff8a,
           duration: 4000, shield: { base: 100, perLevel: 18, hp: 0.08 }, buff: { armor: 25 },
           desc: 'Spreads incoming damage across a shield and +25 armor.' },
      e: { name: 'Connection Pool', icon: '🔗', type: 'dash', mana: 60, cd: 12, color: 0x9cff6a,
           range: 420, hitRadius: 70, stopAtFirst: true, dmg: { base: 60, perLevel: 14, ad: 0.6 }, stun: { ms: 700 },
           desc: 'Charges forward and stuns the first enemy it connects to.' },
      r: { name: 'Database Lock', icon: '🔒', type: 'circle', mana: 100, cd: 80, color: 0x55ff55,
           range: 0, radius: 340, delay: 0, dmg: { base: 180, perLevel: 20, ad: 0.5 }, stun: { ms: 1300 },
           desc: 'Locks every table in range. Nearby enemies are damaged and stunned.' },
    },
    build: ['chair', 'sneakers', 'standing_desk', 'server_rack', 'gauntlet', 'rgb_keyboard'],
    lines: { pick: 'Scaling up.', kill: '200 OK.', death: '503 Service Unavailable.' },
  },

  ops: {
    id: 'ops', name: 'Ops', title: 'the DevOps Medic', role: 'Support', lane: 'support',
    emoji: '⚙️', color: 0xffd23f, difficulty: 1, ranged: true,
    blurb: 'Keeps the team alive at 3 a.m. Speaks fluent YAML.',
    look: { outfit: 'vest', hat: 'headlamp', prop: 'wrench', palette: [0xffd23f, 0x333333] },
    base:   { hp: 540, mana: 400, ad: 46, ap: 0, armor: 24, as: 0.62, range: 450, ms: 330 },
    growth: { hp: 90,  mana: 45,  ad: 2.6, armor: 3.5, as: 0.01 },
    skills: {
      q: { name: 'Pipeline', icon: '🚇', type: 'projectile', mana: 50, cd: 6, color: 0xffd23f,
           range: 1000, speed: 1700, width: 80, pierce: true, dmg: { base: 70, perLevel: 15, ap: 0.6 },
           desc: 'Pushes a deploy straight through every enemy in a line.' },
      w: { name: 'Auto-Heal', icon: '💚', type: 'allies', mana: 70, cd: 11, color: 0x7ed957,
           radius: 480, heal: { base: 70, perLevel: 16, ap: 0.4 },
           desc: 'Restarts unhealthy containers: heals you and nearby allies.' },
      e: { name: 'Hotfix', icon: '🩹', type: 'allies', mana: 50, cd: 15, color: 0x7ec8ff,
           radius: 480, duration: 2500, buff: { msPct: 0.3 },
           desc: 'Ships an emergency patch: nearby allies gain 30% move speed.' },
      r: { name: 'Blue-Green Deploy', icon: '🔄', type: 'allies', mana: 110, cd: 90, color: 0x39c2ff,
           radius: 750, duration: 3000, heal: { base: 180, perLevel: 25, ap: 0.6 }, shield: { base: 150, perLevel: 15, ap: 0.4 },
           desc: 'Swaps the whole team to a fresh deployment: big heal + shield.' },
    },
    build: ['power_bank', 'sneakers', 'rubber_duck', 'headphones', 'standing_desk', 'stackoverflow'],
    lines: { pick: 'It is always DNS.', kill: 'Rolled back.', death: 'Pager is going off...' },
  },

  tester: {
    id: 'tester', name: 'Tester', title: 'the QA Sniper', role: 'Marksman', lane: 'bot',
    emoji: '🔍', color: 0xff9800, difficulty: 2, ranged: true,
    blurb: 'Finds your weak spot from across the map. Files a ticket about it.',
    look: { outfit: 'shirt', hat: 'visor', prop: 'magnifier', palette: [0xff9800, 0xffffff] },
    base:   { hp: 560, mana: 300, ad: 60, ap: 0, armor: 24, as: 0.68, range: 500, ms: 330 },
    growth: { hp: 90,  mana: 36,  ad: 3.6, armor: 3.5, as: 0.025 },
    skills: {
      q: { name: 'Unit Test', icon: '🧪', type: 'self', mana: 40, cd: 9, color: 0xffb347,
           duration: 4000, buff: { as: 0.5 },
           desc: 'Runs the test suite at full speed: +50% attack speed.' },
      w: { name: 'Bug Report', icon: '🐞', type: 'projectile', mana: 55, cd: 8, color: 0xff9800,
           range: 1000, speed: 1800, width: 70, dmg: { base: 60, perLevel: 14, ad: 0.9 }, slow: { pct: 0.3, ms: 2000 },
           desc: 'Files a detailed report at the first enemy hit. Damages and slows.' },
      e: { name: 'Edge Case', icon: '↗️', type: 'dash', mana: 40, cd: 12, color: 0xffffff,
           range: 360, hitRadius: 0, desc: 'Finds an edge case and slips through it.' },
      r: { name: 'Regression Barrage', icon: '🎯', type: 'projectile', mana: 100, cd: 60, color: 0xff5e5e,
           range: 2400, speed: 1900, width: 130, champOnly: true, dmg: { base: 240, perLevel: 30, ad: 1.2 },
           desc: 'A map-wide shot that flies past minions and hits the first champion.' },
    },
    build: ['mouse', 'jetpack', 'rgb_keyboard', 'gauntlet', 'ultrawide', 'standing_desk'],
    lines: { pick: 'Works on my machine? Prove it.', kill: 'Bug confirmed.', death: 'Cannot reproduce.' },
  },

  zero: {
    id: 'zero', name: 'Zero', title: 'the Security Ninja', role: 'Assassin', lane: 'jungle',
    emoji: '🥷', color: 0xb084ff, difficulty: 3, ranged: false,
    blurb: 'Gets in, gets admin, gets out. You never saw the commit.',
    look: { outfit: 'hoodie', hat: 'mask', prop: 'dagger', palette: [0x1a1a2e, 0xb084ff] },
    base:   { hp: 580, mana: 300, ad: 66, ap: 0, armor: 28, as: 0.68, range: 125, ms: 350 },
    growth: { hp: 95,  mana: 35,  ad: 4.2, armor: 4, as: 0.012 },
    skills: {
      q: { name: 'Pen Test', icon: '🗡️', type: 'dash', mana: 40, cd: 7, color: 0xb084ff,
           range: 520, toTarget: true, hitRadius: 60, stopAtFirst: true, dmg: { base: 70, perLevel: 16, ad: 0.9 },
           desc: 'Dashes onto a target and probes it for weaknesses.' },
      w: { name: 'Encrypt', icon: '🔐', type: 'self', mana: 50, cd: 15, color: 0x8a6cff,
           duration: 3000, buff: { msPct: 0.35, dmgReduction: 0.3 },
           desc: 'Encrypts yourself: +35% move speed and 30% damage reduction.' },
      e: { name: 'Brute Force', icon: '💥', type: 'circle', mana: 35, cd: 5, color: 0xd0a0ff,
           range: 0, radius: 240, delay: 0, dmg: { base: 60, perLevel: 15, ad: 0.75 },
           desc: 'Tries every password at once. Damages everything around you.' },
      r: { name: 'Zero-Day', icon: '☠️', type: 'target', mana: 90, cd: 70, color: 0xff3b8a,
           range: 480, targets: 'enemyChamp', dmg: { base: 150, perLevel: 25, ad: 1.0 }, execute: { missingHpPct: 0.35 },
           desc: 'Exploits an unpatched champion. Bonus damage from their missing HP.' },
    },
    build: ['mouse', 'sneakers', 'gauntlet', 'rgb_keyboard', 'ultrawide', 'standing_desk'],
    lines: { pick: 'sudo make me a sandwich.', kill: 'Access granted.', death: 'Firewall says no.' },
  },

  model: {
    id: 'model', name: 'Model', title: 'the Data Sorcerer', role: 'Controller', lane: 'mid',
    emoji: '📊', color: 0x00d4aa, difficulty: 2, ranged: true,
    blurb: 'Predicted you would stand there. Was right, with p < 0.05.',
    look: { outfit: 'sweater', hat: 'glasses', prop: 'chart', palette: [0x00d4aa, 0x005f4b] },
    base:   { hp: 530, mana: 430, ad: 46, ap: 0, armor: 20, as: 0.62, range: 480, ms: 330 },
    growth: { hp: 86,  mana: 43,  ad: 3,  armor: 3.4, as: 0.01 },
    skills: {
      q: { name: 'Gradient Descent', icon: '📉', type: 'circle', mana: 45, cd: 6, color: 0x00d4aa,
           range: 850, radius: 230, delay: 400, dmg: { base: 70, perLevel: 16, ap: 0.6 }, slow: { pct: 0.4, ms: 1500 },
           desc: 'Descends on an area: damages and slows everything inside.' },
      w: { name: 'Overfit', icon: '📈', type: 'self', mana: 60, cd: 14, color: 0x6cffd6,
           duration: 4000, buff: { apPct: 0.3, msPct: 0.15 },
           desc: 'Overfits to the current fight: +30% ability power, +15% move speed.' },
      e: { name: 'Random Forest', icon: '🌲', type: 'projectile', mana: 60, cd: 12, color: 0x2ecc71,
           range: 900, speed: 1400, width: 70, dmg: { base: 50, perLevel: 12, ap: 0.4 }, root: { ms: 1200 },
           desc: 'Grows a forest around the first enemy hit, rooting them in place.' },
      r: { name: 'Big Data', icon: '🌌', type: 'circle', mana: 110, cd: 85, color: 0x00ffcc,
           range: 1100, radius: 420, delay: 1200, dmg: { base: 320, perLevel: 35, ap: 1.0 },
           desc: 'Drops a petabyte on an area after a long load time. Enormous damage.' },
    },
    build: ['tech_book', 'sneakers', 'headphones', 'stackoverflow', 'rubber_duck', 'server_rack'],
    lines: { pick: 'Correlation achieved.', kill: 'As predicted.', death: 'Outlier. Ignore it.' },
  },

  // ───────────── v2 "New Hires" (2026-11-07) ─────────────
  guard: {
    id: 'guard', name: 'Brick', title: 'the Security Guard', role: 'Tank', lane: 'top',
    emoji: '👮', color: 0x4a7bd0, difficulty: 1, ranged: false,
    blurb: 'Nobody gets past the lobby without a badge. Throws trespassers into the nearest wall.',
    look: { outfit: 'uniform', hat: 'cap', prop: 'flashlight', palette: [0x24324f, 0xffd23f] },
    base:   { hp: 680, mana: 280, ad: 58, ap: 0, armor: 38, as: 0.64, range: 125, ms: 335 },
    growth: { hp: 115, mana: 30,  ad: 3.6, armor: 4.8, as: 0.01 },
    skills: {
      q: { name: 'HALT!', icon: '🚨', type: 'projectile', mana: 40, cd: 7, color: 0xff5e5e,
           range: 750, speed: 1500, width: 90, dmg: { base: 60, perLevel: 15, ad: 0.6, hp: 0.03 }, slow: { pct: 0.4, ms: 1500 },
           desc: 'Shines a flashlight and yells. The first enemy hit is damaged and slowed.' },
      w: { name: 'Clipboard of Rules', icon: '📋', type: 'self', mana: 50, cd: 13, color: 0x9ec5ff,
           duration: 4000, shield: { base: 90, perLevel: 18, hp: 0.07 }, buff: { armor: 20 },
           desc: 'Hides behind the rules: a shield that scales with max HP and +20 armor.' },
      e: { name: 'Escort Out', icon: '🚪', type: 'target', mana: 55, cd: 11, color: 0x4a7bd0,
           range: 220, targets: 'enemy', dmg: { base: 50, perLevel: 14, ad: 0.8 }, knockback: { dist: 320 }, wallStun: { ms: 1400 },
           desc: 'Shoves an enemy far away. If they hit a WALL, they are stunned.' },
      r: { name: 'Building Lockdown', icon: '🚧', type: 'circle', mana: 100, cd: 80, color: 0xffd23f,
           range: 0, radius: 380, delay: 250, dmg: { base: 160, perLevel: 22, hp: 0.06 }, knockback: { dist: 300 }, wallStun: { ms: 1200 }, slow: { pct: 0.35, ms: 2000 },
           desc: 'Locks down the floor: every enemy nearby is damaged, slowed and thrown back. Walls stun.' },
    },
    build: ['chair', 'sneakers', 'standing_desk', 'hoodie', 'server_rack', 'gauntlet'],
    lines: { pick: 'Badge, please.', kill: 'Escorted off the premises.', death: 'I need backup on floor 3...' },
  },

  cleaner: {
    id: 'cleaner', name: 'Mop', title: 'the Night-Shift Cleaner', role: 'Mage', lane: 'mid',
    emoji: '🧹', color: 0x2ecc71, difficulty: 2, ranged: true,
    blurb: 'Has seen everything this office did after 9 p.m. Mops the floor with you, literally.',
    look: { outfit: 'apron', hat: 'bandana', prop: 'broom', palette: [0x2e8b57, 0xffe066] },
    base:   { hp: 510, mana: 440, ad: 46, ap: 0, armor: 20, as: 0.63, range: 450, ms: 330 },
    growth: { hp: 84,  mana: 44,  ad: 2.8, armor: 3.3, as: 0.01 },
    skills: {
      q: { name: 'Broom Sweep', icon: '🧹', type: 'projectile', mana: 45, cd: 6, color: 0xc8a165,
           range: 800, speed: 1400, width: 120, pierce: true, dmg: { base: 70, perLevel: 16, ap: 0.6 }, knockback: { dist: 90 },
           desc: 'A wide sweep that hits every enemy in a line and nudges them back.' },
      w: { name: 'Wet Floor', icon: '⚠️', type: 'zone', mana: 60, cd: 12, color: 0x7ec8ff,
           range: 800, radius: 220, duration: 3000, tickMs: 500, dmg: { base: 12, perLevel: 3, ap: 0.08 }, slow: { pct: 0.45, ms: 700 },
           desc: 'Mops an area for 3 s. Enemies inside slip: slowed and damaged every half second.' },
      e: { name: 'Mop Slide', icon: '🫧', type: 'dash', mana: 50, cd: 13, color: 0xbfe6ff,
           range: 450, hitRadius: 0, desc: 'Slides across the floor she just mopped.' },
      r: { name: 'Deep Clean', icon: '🧽', type: 'zone', mana: 110, cd: 85, color: 0x00e5ff,
           range: 900, radius: 360, duration: 4000, tickMs: 500, dmg: { base: 45, perLevel: 6, ap: 0.14 }, slow: { pct: 0.25, ms: 700 },
           desc: 'Floods a huge area with industrial cleaner for 4 s. Heavy damage over time + slow.' },
    },
    build: ['tech_book', 'sneakers', 'headphones', 'stackoverflow', 'pomodoro', 'standing_desk'],
    lines: { pick: 'Who left pizza in the server room?', kill: 'Swept.', death: 'Caution... wet... floor...' },
  },

  courier: {
    id: 'courier', name: 'Rush', title: 'the Delivery Rider', role: 'Jungler', lane: 'jungle',
    emoji: '🛵', color: 0xff7a1a, difficulty: 2, ranged: false,
    blurb: 'Rides a scooter through the jungle. Delivers in 30 minutes or your death is free.',
    look: { outfit: 'jacket', hat: 'helmet', prop: 'box', vehicle: 'scooter', palette: [0xff7a1a, 0xffffff] },
    base:   { hp: 600, mana: 300, ad: 64, ap: 0, armor: 28, as: 0.68, range: 125, ms: 365 },
    growth: { hp: 98,  mana: 34,  ad: 4,  armor: 4, as: 0.012 },
    skills: {
      q: { name: 'Express Delivery', icon: '🏍️', type: 'dash', mana: 45, cd: 8, color: 0xff9a3a,
           range: 600, hitRadius: 80, dmg: { base: 70, perLevel: 16, ad: 0.8 },
           desc: 'Revs through a line, damaging every enemy along the route.' },
      w: { name: 'Hot Meal', icon: '🍜', type: 'self', mana: 45, cd: 12, color: 0xffc04d,
           duration: 4000, heal: { base: 60, perLevel: 14, ad: 0.3 }, buff: { as: 0.35 },
           desc: "Eats a customer's order: heals and gains +35% attack speed." },
      e: { name: 'Package Drop', icon: '📦', type: 'circle', mana: 55, cd: 11, color: 0xc8a165,
           range: 650, radius: 210, delay: 550, dmg: { base: 60, perLevel: 15, ad: 0.7 }, stun: { ms: 800 },
           desc: 'Throws a heavy parcel. After a moment it lands: damage + stun.' },
      r: { name: 'Rush Hour', icon: '🚦', type: 'self', mana: 90, cd: 75, color: 0xff3b3b,
           duration: 6000, buff: { msPct: 0.55, adPct: 0.3, dmgReduction: 0.15 },
           desc: 'Full throttle for 6 s: +55% move speed, +30% attack damage, 15% damage reduction.' },
    },
    build: ['mouse', 'sneakers', 'gauntlet', 'rgb_keyboard', 'standing_desk', 'ultrawide'],
    lines: { pick: 'Order picked up!', kill: 'Delivered.', death: 'Customer not home...' },
  },

  embedded: {
    id: 'embedded', name: 'Volt', title: 'the Embedded Engineer', role: 'Support', lane: 'support',
    emoji: '🔌', color: 0x00bcd4, difficulty: 2, ranged: true,
    blurb: 'Built Servo from a toaster and a microcontroller. Servo does most of the work.',
    look: { outfit: 'labcoat', hat: 'goggles', prop: 'solder', palette: [0xe0f7fa, 0x00bcd4] },
    pet: { name: 'Servo', emoji: '🤖', range: 320, atkMs: 900, follow: 110, dmg: { base: 20, perLevel: 4, ad: 0.15, ap: 0.12 } },
    base:   { hp: 540, mana: 410, ad: 44, ap: 0, armor: 22, as: 0.62, range: 470, ms: 330 },
    growth: { hp: 88,  mana: 42,  ad: 2.6, armor: 3.5, as: 0.01 },
    skills: {
      q: { name: 'Interrupt Signal', icon: '📡', type: 'projectile', mana: 55, cd: 9, color: 0x00e5ff,
           range: 850, speed: 1600, width: 70, dmg: { base: 60, perLevel: 14, ap: 0.5 }, stun: { ms: 800 },
           desc: 'Fires a hardware interrupt. The first enemy hit is damaged and stunned.' },
      w: { name: 'Overclock', icon: '🔥', type: 'self', mana: 60, cd: 13, color: 0xff9800,
           duration: 4000, buff: { as: 0.3, petPct: 1.0 },
           desc: 'Overclocks you and Servo: +30% attack speed; Servo deals double damage.' },
      e: { name: 'Watchdog Reset', icon: '🛟', type: 'allies', mana: 70, cd: 14, color: 0x7ed957,
           radius: 480, duration: 2500, heal: { base: 55, perLevel: 13, ap: 0.35 }, shield: { base: 50, perLevel: 10, ap: 0.25 },
           desc: 'Resets everyone nearby to a known-good state: heal + small shield.' },
      r: { name: 'Servo EMP', icon: '🌩️', type: 'circle', at: 'pet', mana: 110, cd: 70, color: 0x00ffff,
           range: 0, radius: 380, delay: 700, dmg: { base: 200, perLevel: 25, ap: 0.8 }, stun: { ms: 1200 },
           desc: 'Servo overloads: after a short charge, everything around SERVO is shocked and stunned.' },
    },
    build: ['power_bank', 'sneakers', 'headphones', 'rubber_duck', 'standing_desk', 'stackoverflow'],
    lines: { pick: 'Servo, boot up.', kill: 'Bit flipped.', death: 'Brown-out detected...' },
  },

  dev: {
    id: 'dev', name: 'Patch', title: 'the Software Engineer', role: 'Fighter', lane: 'top',
    emoji: '💻', color: 0x8e44ad, difficulty: 2, ranged: false,
    blurb: 'Fixes one bug, ships two. Fights with a mechanical keyboard and pure caffeine.',
    look: { outfit: 'hoodie', hat: 'headset', prop: 'laptop', palette: [0x5b2c83, 0x39c2ff] },
    base:   { hp: 600, mana: 300, ad: 62, ap: 0, armor: 30, as: 0.66, range: 150, ms: 340 },
    growth: { hp: 100, mana: 34,  ad: 4,  armor: 4.2, as: 0.012 },
    skills: {
      q: { name: 'Refactor', icon: '♻️', type: 'circle', mana: 35, cd: 6, color: 0xb084ff,
           range: 0, radius: 260, delay: 0, dmg: { base: 65, perLevel: 15, ad: 0.8 },
           desc: 'Spins the keyboard around, refactoring everything nearby.' },
      w: { name: 'Pair Programming', icon: '👥', type: 'self', mana: 50, cd: 14, color: 0x39c2ff,
           duration: 4000, shield: { base: 60, perLevel: 12, ad: 0.3 }, buff: { adPct: 0.2, as: 0.3 },
           desc: 'An imaginary pair partner helps: shield, +20% attack damage, +30% attack speed.' },
      e: { name: 'git push --force', icon: '💢', type: 'dash', mana: 50, cd: 11, color: 0xff3b8a,
           range: 450, hitRadius: 70, stopAtFirst: true, dmg: { base: 55, perLevel: 14, ad: 0.7 }, knockback: { dist: 260 }, wallStun: { ms: 1000 },
           desc: 'Force-pushes into the first enemy and shoves them back. Into a wall = stunned.' },
      r: { name: 'Merge Conflict', icon: '⚔️', type: 'target', mana: 100, cd: 75, color: 0xff5e5e,
           range: 420, targets: 'enemyChamp', dmg: { base: 170, perLevel: 25, ad: 1.0 }, stun: { ms: 1300 },
           desc: 'Creates a merge conflict in an enemy champion. Big damage + long stun while they resolve it.' },
    },
    build: ['mouse', 'sneakers', 'gauntlet', 'standing_desk', 'rgb_keyboard', 'server_rack'],
    lines: { pick: 'LGTM.', kill: 'Fixed in prod.', death: 'It compiled on my machine...' },
  },

  appdev: {
    id: 'appdev', name: 'Swipe', title: 'the App Developer', role: 'Marksman', lane: 'bot',
    emoji: '📱', color: 0xff4fa3, difficulty: 2, ranged: true,
    blurb: "Throws last year's flagship phones at you. Ships an update mid-fight.",
    look: { outfit: 'tshirt', hat: 'beanie', prop: 'phone', palette: [0xff4fa3, 0x222222] },
    base:   { hp: 550, mana: 300, ad: 60, ap: 0, armor: 22, as: 0.67, range: 500, ms: 330 },
    growth: { hp: 88,  mana: 36,  ad: 3.5, armor: 3.4, as: 0.025 },
    skills: {
      q: { name: 'Push Notification', icon: '🔔', type: 'projectile', mana: 45, cd: 6, color: 0xff4fa3,
           range: 820, speed: 1700, width: 60, count: 3, spread: 24, dmg: { base: 60, perLevel: 13, ad: 0.7 },
           desc: 'Throws 3 phones in a fan. Each enemy can be hit by one of them.' },
      w: { name: 'Dark Mode', icon: '🌙', type: 'self', mana: 45, cd: 12, color: 0x6a5acd,
           duration: 4000, buff: { msPct: 0.25, as: 0.3 },
           desc: 'Switches to dark mode: +25% move speed and +30% attack speed.' },
      e: { name: 'Swipe Left', icon: '👈', type: 'dash', mana: 40, cd: 11, color: 0xffffff,
           range: 380, hitRadius: 0, desc: 'Swipes out of danger.' },
      r: { name: 'App Store Launch', icon: '📲', type: 'projectile', mana: 100, cd: 65, color: 0xff2d95,
           range: 1200, speed: 1900, width: 70, count: 7, spread: 50, dmg: { base: 170, perLevel: 25, ad: 1.0 },
           desc: 'Launch day! A wide fan of 7 phones. Each enemy can be hit by one of them.' },
    },
    build: ['mouse', 'jetpack', 'rgb_keyboard', 'gauntlet', 'ultrawide', 'standing_desk'],
    lines: { pick: 'Shipping to both stores.', kill: '5 stars.', death: 'App not responding...' },
  },
};

export const CHAMPION_IDS = Object.keys(CHAMPIONS);

/** Role order bots fill a team in (the human's pick takes its role first). */
export const ROLE_ORDER = ['top', 'jungle', 'mid', 'bot', 'support'];
/** Champions bots may pick for each role — v2: a RANDOM available one (variety), else any free champion. */
export const ROLE_PICKS = {
  top: ['stack', 'guard', 'dev'],
  jungle: ['zero', 'courier', 'dev'],
  mid: ['pixel', 'model', 'cleaner'],
  bot: ['tester', 'appdev', 'pixel'],
  support: ['ops', 'embedded', 'guard', 'model'],
};

/** v4 auto-aim policy (shared by client + server): does a no-direction cast of this skill aim at an
 *  enemy? Abilities that MOVE the caster along a direction never do — blinks and every dash that isn't
 *  toTarget go in the direction of travel (stick / last move / facing) instead (player request 2026-11-08). */
export function autoAimsAtEnemy(spec) {
  if (!spec || spec.type === 'blink' || spec.type === 'self' || spec.type === 'allies') return false;
  if (spec.at === 'pet' || !(spec.range > 0)) return false;
  if (spec.type === 'dash' && !spec.toTarget) return false;
  return true;
}
/** Auto-aim search radius: point-and-click (target / toTarget) skills only look within castable
 *  range (+30, the server's cast slack) so an out-of-range champion never beats an in-range minion. */
export function autoAimReach(spec, slack = 150) {
  const castable = spec.type === 'target' || !!spec.toTarget;
  return (spec.range || spec.radius || 500) + (castable ? 30 : slack);
}

export function isChampionId(id) { return typeof id === 'string' && Object.hasOwn(CHAMPIONS, id); }

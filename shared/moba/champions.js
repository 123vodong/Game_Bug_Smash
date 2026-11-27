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

export const CHAMPIONS = {
  pixel: {
    id: 'pixel', name: 'Pixel', title: 'the Frontend Wizard', role: 'Mage', lane: 'mid',
    emoji: '🎨', color: 0x39c2ff, difficulty: 2, ranged: true,
    blurb: 'Ships beautiful damage from a safe distance. Breaks if you look at it on Internet Explorer.',
    look: { outfit: 'turtleneck', hat: 'beret', prop: 'stylus', palette: [0x39c2ff, 0xff4fa3] },
    base:   { hp: 520, mana: 420, ad: 48, ap: 0, armor: 20, mr: 30, as: 0.65, range: 460, ms: 330 },
    growth: { hp: 86,  mana: 42,  ad: 3,  armor: 3.4, mr: 1.2, as: 0.01 },
    skills: {
      q: { name: 'CSS Boomerang', icon: '💠', type: 'projectile', mana: 45, cd: 5.5, color: 0x39c2ff,
           range: 880, speed: 1500, width: 72, pierce: true, boomerang: true, returnTrueDmg: true, returnMul: 1.0,
           dmg: { base: 65, perLevel: 14, ap: 0.55 },
           desc: 'Fires a boomerang orb that pierces out and deals True Damage on return; marks targets (4s) for Framework Rewrite.' },
      w: { name: 'Flexbox Orbs', icon: '⚡', type: 'target', mana: 60, cd: 10, color: 0x7ec8ff,
           range: 620, targets: 'enemy', chain: { bounces: 2, range: 360, decay: 0.8 }, dmg: { base: 70, perLevel: 16, ap: 0.55 },
           desc: 'Zaps an enemy and chains lightning to 2 nearby targets.' },
      e: { name: 'Hot Reload', icon: '✨', type: 'blink', mana: 65, cd: 12, color: 0xffffff,
           range: 430, recast: { ms: 3000, mode: 'back' },
           desc: 'Blinks nearby and empowers your next Q or R (+20%). Press E again within 3s to snap back to where you started.' },
      r: { name: 'Framework Rewrite', icon: '🌀', type: 'circle', mana: 100, cd: 70, color: 0xb084ff,
           range: 950, radius: 320, delay: 700, dmg: { base: 250, perLevel: 30, ap: 0.9 },
           desc: 'After a short delay, rewrites an area for massive damage; detonates Q marks for +25% bonus true damage.' },
    },
    build: ['tech_book', 'sneakers', 'headphones', 'frost_cache', 'stackoverflow', 'freeze_frame'],
    lines: { pick: 'It works in Chrome.', kill: 'Pixel-perfect.', death: 'Who added !important?!' },
  },

  stack: {
    id: 'stack', name: 'Stack', title: 'the Backend Tank', role: 'Tank', lane: 'top',
    emoji: '🗄️', color: 0x7ed957, difficulty: 1, ranged: false,
    blurb: 'Handles any load you throw at it. Scales horizontally into your face.',
    look: { outfit: 'armor', hat: 'hardhat', prop: 'database', palette: [0x3b7a2a, 0x7ed957] },
    base:   { hp: 650, mana: 280, ad: 62, ap: 0, armor: 36, mr: 34, as: 0.66, range: 125, ms: 340 },
    growth: { hp: 112, mana: 30,  ad: 4,  armor: 4.6, mr: 2.0, as: 0.01 },
    skills: {
      q: { name: 'SQL Hook', icon: '🪝', type: 'projectile', mana: 55, cd: 11, color: 0x7ed957,
           range: 820, speed: 1750, width: 72, pull: true, pullDist: 680, dmg: { base: 75, perLevel: 15, ad: 0.7 }, stun: { ms: 600 },
           desc: 'Launches a query hook that yanks the first enemy hit right to you and stuns briefly.' },
      w: { name: 'Load Balancer', icon: '🛡️', type: 'self', mana: 50, cd: 13, color: 0xb6ff8a,
           duration: 4000, shield: { base: 100, perLevel: 18, hp: 0.08 }, buff: { armor: 25 },
           desc: 'Gains a shield and +25 armor; if the shield breaks, releases an AoE shockwave (80 + 40% armor).' },
      e: { name: 'Rate Limit', icon: '🚦', type: 'zone', mana: 55, cd: 12, color: 0x9cff6a,
           range: 0, radius: 270, duration: 3000, tickMs: 500, dmg: { base: 22, perLevel: 4, ad: 0.18 }, slow: { pct: 0.5, ms: 700 },
           desc: 'Throttles everything around you for 3s: enemies inside take damage every 0.5s and are heavily slowed.' },
      r: { name: 'Database Lock', icon: '🔒', type: 'circle', mana: 100, cd: 75, color: 0x55ff55,
           range: 0, radius: 350, delay: 0, pullIn: true, pullInDist: 170, dmg: { base: 185, perLevel: 20, ad: 0.55 }, stun: { ms: 1000 },
           desc: 'Locks every table in range, pulling nearby enemies inward, damaging and stunning them.' },
    },
    build: ['chair', 'sneakers', 'standing_desk', 'thornmail_rack', 'server_rack', 'guardian_backup'],
    lines: { pick: 'Scaling up.', kill: '200 OK.', death: '503 Service Unavailable.' },
  },

  ops: {
    id: 'ops', name: 'Ops', title: 'the DevOps Medic', role: 'Support', lane: 'support',
    emoji: '⚙️', color: 0xffd23f, difficulty: 1, ranged: true,
    blurb: 'Keeps the team alive at 3 a.m. Speaks fluent YAML.',
    look: { outfit: 'vest', hat: 'headlamp', prop: 'wrench', palette: [0xffd23f, 0x333333] },
    base:   { hp: 540, mana: 400, ad: 46, ap: 0, armor: 24, mr: 30, as: 0.62, range: 450, ms: 330 },
    growth: { hp: 90,  mana: 45,  ad: 2.6, armor: 3.5, mr: 1.2, as: 0.01 },
    skills: {
      q: { name: 'Health Check', icon: '🚇', type: 'circle', mana: 45, cd: 6, color: 0xffd23f,
           range: 820, radius: 200, delay: 300, dmg: { base: 65, perLevel: 14, ap: 0.55 }, slow: { pct: 0.35, ms: 1500 },
           healOnHit: { base: 35, perLevel: 8, ap: 0.25 },
           desc: 'Scans an area: slows enemies inside and heals you for each champion hit.' },
      w: { name: 'Auto-Heal', icon: '💚', type: 'allies', mana: 65, cd: 10, color: 0x7ed957,
           radius: 500, heal: { base: 75, perLevel: 16, ap: 0.42 },
           desc: 'Restarts unhealthy containers: heals you and nearby allies.' },
      e: { name: 'Hot Swap', icon: '🔁', type: 'swap', mana: 55, cd: 14, color: 0x7ec8ff,
           range: 650, duration: 2500, shield: { base: 70, perLevel: 14, ap: 0.4 }, buff: { msPct: 0.3 },
           desc: 'Swaps places with the allied champion nearest your aim, rescuing them. Both gain a shield and +30% MS for 2.5s.' },
      r: { name: 'Blue-Green Deploy', icon: '🔄', type: 'allies', mana: 110, cd: 85, color: 0x39c2ff,
           radius: 800, duration: 3000, heal: { base: 185, perLevel: 25, ap: 0.6 }, shield: { base: 155, perLevel: 15, ap: 0.4 }, buff: { dmgReduction: 0.15 },
           desc: 'Swaps the whole team to a fresh deployment: big heal, shield, and 15% damage reduction.' },
    },
    build: ['power_bank', 'sneakers', 'rubber_duck', 'team_lunch', 'headphones', 'stackoverflow'],
    lines: { pick: 'It is always DNS.', kill: 'Rolled back.', death: 'Pager is going off...' },
  },

  tester: {
    id: 'tester', name: 'Tester', title: 'the QA Sniper', role: 'Marksman', lane: 'bot',
    emoji: '🔍', color: 0xff9800, difficulty: 2, ranged: true,
    blurb: 'Finds your weak spot from across the map. Files a ticket about it.',
    look: { outfit: 'shirt', hat: 'visor', prop: 'magnifier', palette: [0xff9800, 0xffffff] },
    base:   { hp: 560, mana: 300, ad: 60, ap: 0, armor: 24, mr: 30, as: 0.68, range: 500, ms: 330 },
    growth: { hp: 90,  mana: 36,  ad: 3.6, armor: 3.5, mr: 1.2, as: 0.025 },
    skills: {
      q: { name: 'Unit Test', icon: '🧪', type: 'projectile', mana: 45, cd: 7, color: 0xffb347,
           range: 1050, speed: 1950, width: 75, pierce: true, dmg: { base: 75, perLevel: 16, ad: 1.0 },
           desc: 'Fires a piercing sniper bolt through every enemy in a line.' },
      w: { name: 'Bug Trap', icon: '🪤', type: 'circle', mana: 40, cd: 12, color: 0xff9800,
           range: 720, radius: 95, trap: { durationMs: 25000, maxActive: 3, armMs: 500 }, dmg: { base: 60, perLevel: 14, ad: 0.7 }, root: { ms: 1200 },
           desc: 'Deploys a hidden unit-test trap (max 3, 25s). Snaps shut to damage and root the first enemy stepping on it.' },
      e: { name: 'Edge Case', icon: '↗️', type: 'dash', mana: 45, cd: 11, color: 0xffffff,
           range: 400, hitRadius: 120, dmg: { base: 45, perLevel: 10, ad: 0.5 }, slow: { pct: 0.4, ms: 1600 },
           desc: 'Vaults away and throws an edge-case net that damages and slows foes passed.' },
      r: { name: 'Regression Barrage', icon: '🎯', type: 'projectile', mana: 100, cd: 58, color: 0xff5e5e,
           range: 2400, speed: 2000, width: 130, champOnly: true, dmg: { base: 240, perLevel: 30, ad: 1.25 },
           desc: 'A map-wide sniper shot hitting the first champion; detonates Bug Detection stacks (0-4) for +12% true dmg/stack.' },
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
      q: { name: 'Pen Test', icon: '🗡️', type: 'dash', mana: 40, cd: 7, color: 0xb084ff,
           range: 520, toTarget: true, behindTarget: true, hitRadius: 60, dmg: { base: 70, perLevel: 16, ad: 0.9 },
           desc: 'Dashes directly behind a target and applies Vulnerability (4s).' },
      w: { name: 'Encrypt', icon: '🔐', type: 'self', mana: 50, cd: 14, color: 0x8a6cff,
           duration: 3000, invisMs: 1800, buff: { msPct: 0.35, dmgReduction: 0.2 },
           desc: 'Vanishes into stealth for 1.8s with +35% move speed and 20% damage reduction.' },
      e: { name: 'Brute Force', icon: '💥', type: 'circle', mana: 35, cd: 5, color: 0xd0a0ff,
           range: 0, radius: 240, delay: 0, dmg: { base: 60, perLevel: 15, ad: 0.75 },
           desc: 'Slashes nearby enemies; consumes Q Vulnerability (+30% true dmg, -1.5s Q CD; basic attacks also consume it).' },
      r: { name: 'Zero-Day', icon: '☠️', type: 'target', mana: 90, cd: 68, color: 0xff3b8a,
           range: 520, targets: 'enemyChamp', behindTarget: true, killReset: true, dmg: { base: 145, perLevel: 24, ad: 1.0 }, execute: { missingHpPct: 0.38 },
           desc: 'Blinks behind an enemy champion to execute them (missing HP bonus). Killing the target resets R cooldown.' },
    },
    build: ['red_pen', 'sneakers', 'gauntlet', 'armor_shredder', 'crit_compiler', 'git_revert'],
    lines: { pick: 'sudo make me a sandwich.', kill: 'Access granted.', death: 'Firewall says no.' },
  },

  model: {
    id: 'model', name: 'Model', title: 'the Data Sorcerer', role: 'Controller', lane: 'mid',
    emoji: '📊', color: 0x00d4aa, difficulty: 2, ranged: true,
    blurb: 'Predicted you would stand there. Was right, with p < 0.05.',
    look: { outfit: 'sweater', hat: 'glasses', prop: 'chart', palette: [0x00d4aa, 0x005f4b] },
    base:   { hp: 530, mana: 430, ad: 46, ap: 0, armor: 20, mr: 30, as: 0.62, range: 480, ms: 330 },
    growth: { hp: 86,  mana: 43,  ad: 3,  armor: 3.4, mr: 1.2, as: 0.01 },
    skills: {
      q: { name: 'Gradient Descent', icon: '📉', type: 'circle', mana: 45, cd: 5.5, color: 0x00d4aa,
           range: 850, radius: 230, delay: 350, dmg: { base: 70, perLevel: 16, ap: 0.6 }, slow: { pct: 0.4, ms: 1500 },
           desc: 'Collapses a data sphere on an area: damages and slows everything inside.' },
      w: { name: 'Hibernate', icon: '⏳', type: 'self', mana: 60, cd: 16, color: 0x6cffd6,
           duration: 4500, stasis: { ms: 1500 }, buff: { apPct: 0.3 },
           desc: 'Freezes your own process for 1.5s: you cannot act or be damaged. Wake up with +30% AP and your next Q or R within 4.5s deals +20%.' },
      e: { name: 'Random Forest', icon: '🌲', type: 'circle', mana: 60, cd: 12, color: 0x2ecc71,
           range: 880, radius: 220, delay: 450, dmg: { base: 55, perLevel: 12, ap: 0.45 }, root: { ms: 1000 },
           desc: 'Sprouts a snare zone that roots all enemies inside after a short delay.' },
      r: { name: 'Big Data', icon: '🌌', type: 'circle', mana: 110, cd: 82, color: 0x00ffcc,
           range: 1050, radius: 400, delay: 850, pullIn: true, pullInDist: 210, dmg: { base: 290, perLevel: 32, ap: 0.95 },
           desc: 'Shockwave singularity: drags all enemies violently to the center for massive burst damage.' },
    },
    build: ['tech_book', 'sneakers', 'headphones', 'stackoverflow', 'rubber_duck', 'firewall'],
    lines: { pick: 'Correlation achieved.', kill: 'As predicted.', death: 'Outlier. Ignore it.' },
  },

  // ───────────── v2 "New Hires" (2026-11-07) ─────────────
  guard: {
    id: 'guard', name: 'Brick', title: 'the Security Guard', role: 'Tank', lane: 'top',
    emoji: '👮', color: 0x4a7bd0, difficulty: 1, ranged: false,
    blurb: 'Nobody gets past the lobby without a badge. Throws trespassers into the nearest wall.',
    look: { outfit: 'uniform', hat: 'cap', prop: 'flashlight', palette: [0x24324f, 0xffd23f] },
    base:   { hp: 680, mana: 280, ad: 58, ap: 0, armor: 38, mr: 34, as: 0.64, range: 125, ms: 335 },
    growth: { hp: 115, mana: 30,  ad: 3.6, armor: 4.8, mr: 2.0, as: 0.01 },
    skills: {
      q: { name: 'HALT!', icon: '🚨', type: 'projectile', mana: 40, cd: 6.5, color: 0xff5e5e,
           range: 780, speed: 1550, width: 95, pierce: true, dmg: { base: 65, perLevel: 15, ad: 0.6, hp: 0.03 }, slow: { pct: 0.4, ms: 1500 },
           desc: 'Sends a piercing security wave that damages and slows every enemy hit.' },
      w: { name: 'Clipboard of Rules', icon: '📋', type: 'self', mana: 50, cd: 13, color: 0x9ec5ff,
           duration: 4000, spellShieldMs: 2000, shield: { base: 95, perLevel: 18, hp: 0.07 }, buff: { armor: 20 },
           desc: 'Hides behind the rules: max-HP shield, +20 armor, and a 2s Spell Shield blocking the next enemy skill.' },
      e: { name: 'Escort Out', icon: '🚪', type: 'dash', mana: 55, cd: 11, color: 0x4a7bd0,
           range: 420, toTarget: true, targets: 'enemy', dmg: { base: 55, perLevel: 14, ad: 0.8 }, knockback: { dist: 340 }, wallStun: { ms: 1200 },
           desc: 'Charges an enemy and slams them far away. Pinning them into a WALL stuns for 1.2s.' },
      r: { name: 'Building Lockdown', icon: '🚧', type: 'circle', mana: 100, cd: 78, color: 0xffd23f,
           range: 0, radius: 390, delay: 250, dmg: { base: 165, perLevel: 22, hp: 0.06 }, knockback: { dist: 320 }, wallStun: { ms: 1000 }, slow: { pct: 0.35, ms: 2000 },
           desc: 'Locks down the floor: every enemy nearby is damaged, slowed and blasted outward. Walls stun.' },
    },
    build: ['chair', 'sneakers', 'standing_desk', 'hoodie', 'kanban', 'server_rack'],
    lines: { pick: 'Badge, please.', kill: 'Escorted off the premises.', death: 'I need backup on floor 3...' },
  },

  cleaner: {
    id: 'cleaner', name: 'Mop', title: 'the Night-Shift Cleaner', role: 'Mage', lane: 'mid',
    emoji: '🧹', color: 0x2ecc71, difficulty: 2, ranged: true,
    blurb: 'Has seen everything this office did after 9 p.m. Mops the floor with you, literally.',
    look: { outfit: 'apron', hat: 'bandana', prop: 'broom', palette: [0x2e8b57, 0xffe066] },
    base:   { hp: 510, mana: 440, ad: 46, ap: 0, armor: 20, mr: 30, as: 0.63, range: 450, ms: 330 },
    growth: { hp: 84,  mana: 44,  ad: 2.8, armor: 3.3, mr: 1.2, as: 0.01 },
    skills: {
      q: { name: 'Sweep', icon: '🧹', type: 'projectile', mana: 45, cd: 6, color: 0xc8a165,
           range: 520, speed: 1500, width: 70, count: 5, spread: 80, dmg: { base: 50, perLevel: 12, ap: 0.45 }, knockback: { dist: 150 },
           desc: 'Sweeps a 5-broom fan in front of you that shoves every enemy hit back.' },
      w: { name: 'Soap Bubble', icon: '🫧', type: 'circle', mana: 60, cd: 11, color: 0x7ec8ff,
           range: 800, radius: 200, delay: 700, dmg: { base: 60, perLevel: 14, ap: 0.5 }, slow: { pct: 0.6, ms: 2000 },
           desc: 'Drops a giant soap bubble that pops after 0.7s, damaging enemies and slowing them by 60% for 2s.' },
      e: { name: 'Mop Slide', icon: '🌊', type: 'dash', mana: 45, cd: 12, color: 0xbfe6ff,
           range: 460, hitRadius: 70, dmg: { base: 45, perLevel: 10, ap: 0.4 }, slow: { pct: 0.25, ms: 1200 },
           trail: { radius: 230, duration: 3000, tickMs: 500, dmg: { base: 12, perLevel: 3, ap: 0.08 }, slow: { pct: 0.45, ms: 700 } },
           desc: 'Slides forward splashing enemies and leaves a Wet Floor behind that slows and burns for 3s.' },
      r: { name: 'Flood', icon: '🌊', type: 'zone', mana: 110, cd: 82, color: 0x00e5ff,
           range: 900, radius: 420, duration: 4500, tickMs: 500, dmg: { base: 40, perLevel: 6, ap: 0.14 }, slow: { pct: 0.65, ms: 700 },
           desc: 'Floods a huge area for 4.5s: everything inside crawls at 35% speed and is scalded every 0.5s.' },
    },
    build: ['tech_book', 'sneakers', 'headphones', 'midnight_oil', 'stackoverflow', 'pomodoro'],
    lines: { pick: 'Who left pizza in the server room?', kill: 'Swept.', death: 'Caution... wet... floor...' },
  },

  courier: {
    id: 'courier', name: 'Rush', title: 'the Delivery Rider', role: 'Jungler', lane: 'jungle',
    emoji: '🛵', color: 0xff7a1a, difficulty: 2, ranged: false,
    blurb: 'Rides a scooter through the jungle. Delivers in 30 minutes or your death is free.',
    look: { outfit: 'jacket', hat: 'helmet', prop: 'box', vehicle: 'scooter', palette: [0xff7a1a, 0xffffff] },
    base:   { hp: 600, mana: 300, ad: 64, ap: 0, armor: 28, mr: 32, as: 0.68, range: 125, ms: 355 },
    growth: { hp: 98,  mana: 34,  ad: 4,  armor: 4, mr: 1.6, as: 0.012 },
    skills: {
      q: { name: 'Express Delivery', icon: '🏍️', type: 'dash', mana: 45, cd: 8, color: 0xff9a3a,
           range: 620, hitRadius: 85, cdRefundOnHit: { slot: 'q', ms: 1500 }, dmg: { base: 70, perLevel: 16, ad: 0.8 },
           desc: 'Revs through a line, damaging every enemy and refunding 1.5s Q cooldown per champion hit.' },
      w: { name: 'Hot Meal', icon: '🍜', type: 'self', mana: 45, cd: 12, color: 0xffc04d,
           duration: 4000, heal: { base: 65, perLevel: 14, ad: 0.35 }, buff: { as: 0.35, msPct: 0.2 },
           desc: "Eats a customer's order: heals and gains +35% attack speed and +20% move speed." },
      e: { name: 'Package Drop', icon: '📦', type: 'circle', mana: 55, cd: 11, color: 0xc8a165,
           range: 650, radius: 220, delay: 500, dmg: { base: 65, perLevel: 15, ad: 0.75 }, knockback: { dist: 160 }, stun: { ms: 800 },
           desc: 'Lobs a heavy parcel that explodes after 0.5s: AoE damage, knockback, and stun.' },
      r: { name: 'Surge Pricing', icon: '💸', type: 'circle', mana: 90, cd: 72, color: 0xff3b3b,
           range: 900, radius: 360, delay: 600, dmg: { base: 190, perLevel: 26, ad: 0.9 }, slow: { pct: 0.5, ms: 2000 },
           desc: 'Triples the price on a huge area: after 0.6s enemies take heavy damage and are slowed 50% for 2s.' },
    },
    build: ['mouse', 'sneakers', 'gauntlet', 'kanban', 'rgb_keyboard', 'ultrawide'],
    lines: { pick: 'Order picked up!', kill: 'Delivered.', death: 'Customer not home...' },
  },

  embedded: {
    id: 'embedded', name: 'Volt', title: 'the Embedded Engineer', role: 'Support', lane: 'support',
    emoji: '🔌', color: 0x00bcd4, difficulty: 2, ranged: true,
    blurb: 'Built Servo from a toaster and a microcontroller. Servo does most of the work.',
    look: { outfit: 'labcoat', hat: 'goggles', prop: 'solder', palette: [0xe0f7fa, 0x00bcd4] },
    pet: { name: 'Servo', emoji: '🤖', range: 320, atkMs: 900, follow: 110, dmg: { base: 20, perLevel: 4, ad: 0.15, ap: 0.12 } },
    base:   { hp: 540, mana: 410, ad: 44, ap: 0, armor: 22, mr: 30, as: 0.62, range: 470, ms: 330 },
    growth: { hp: 88,  mana: 42,  ad: 2.6, armor: 3.5, mr: 1.2, as: 0.01 },
    skills: {
      q: { name: 'Servo Zap', icon: '📡', type: 'circle', at: 'pet', mana: 50, cd: 8, color: 0x00e5ff,
           range: 0, radius: 210, delay: 350, dmg: { base: 65, perLevel: 14, ap: 0.55 }, stun: { ms: 700 },
           desc: 'Servo discharges around itself: enemies near Servo are damaged and stunned. Position your pet, then zap.' },
      w: { name: 'Overclock', icon: '🔥', type: 'self', mana: 60, cd: 12, color: 0xff9800,
           duration: 4000, buff: { as: 0.35, petPct: 1.0 },
           desc: 'Overclocks you and Servo: +35% attack speed; Servo attacks twice as fast and deals double damage.' },
      e: { name: 'Watchdog Trap', icon: '🛟', type: 'circle', mana: 60, cd: 13, color: 0x7ed957,
           range: 700, radius: 110, trap: { durationMs: 25000, maxActive: 3, armMs: 450 }, dmg: { base: 55, perLevel: 12, ap: 0.45 }, stun: { ms: 850 },
           desc: 'Plants a Watchdog sensor trap (max 3, 25s). Shocks and stuns the first enemy to trigger it.' },
      r: { name: 'Servo EMP', icon: '🌩️', type: 'circle', at: 'pet', mana: 110, cd: 68, color: 0x00ffff,
           range: 0, radius: 390, delay: 650, dmg: { base: 205, perLevel: 26, ap: 0.85 }, knockback: { dist: 260 }, wallStun: { ms: 900 },
           desc: 'Servo overloads: blasts every enemy around SERVO outward. Pinning them into a wall stuns for 0.9s.' },
    },
    build: ['power_bank', 'sneakers', 'headphones', 'rubber_duck', 'firewall', 'stackoverflow'],
    lines: { pick: 'Servo, boot up.', kill: 'Bit flipped.', death: 'Brown-out detected...' },
  },

  dev: {
    id: 'dev', name: 'Patch', title: 'the Software Engineer', role: 'Fighter', lane: 'top',
    emoji: '💻', color: 0x8e44ad, difficulty: 2, ranged: false,
    blurb: 'Fixes one bug, ships two. Fights with a mechanical keyboard and pure caffeine.',
    look: { outfit: 'hoodie', hat: 'headset', prop: 'laptop', palette: [0x5b2c83, 0x39c2ff] },
    base:   { hp: 600, mana: 300, ad: 62, ap: 0, armor: 30, mr: 32, as: 0.66, range: 150, ms: 340 },
    growth: { hp: 100, mana: 34,  ad: 4,  armor: 4.2, mr: 1.6, as: 0.012 },
    skills: {
      q: { name: 'Refactor', icon: '♻️', type: 'circle', mana: 35, cd: 5.5, color: 0xb084ff,
           range: 0, radius: 270, delay: 0, dmg: { base: 70, perLevel: 16, ad: 0.85 }, healOnHit: { base: 45, perLevel: 10, hp: 0.04 },
           desc: 'Spins the keyboard in a wide arc, cleaving nearby enemies and healing you for each champion hit.' },
      w: { name: 'Pair Programming', icon: '👥', type: 'self', mana: 50, cd: 13, color: 0x39c2ff,
           duration: 4000, shield: { base: 70, perLevel: 14, ad: 0.35 }, buff: { adPct: 0.2, as: 0.3 },
           desc: 'Gains a shield, +20% AD and +30% AS for 4s.' },
      e: { name: 'git checkout -b', icon: '🌿', type: 'dash', mana: 50, cd: 11, color: 0xff3b8a,
           range: 380, hitRadius: 90, dmg: { base: 50, perLevel: 12, ad: 0.6 }, recast: { ms: 3000, mode: 'again' },
           desc: 'Branches off in a dash that damages enemies in your path. Press E again within 3s for a second dash.' },
      r: { name: 'Merge Conflict', icon: '⚔️', type: 'target', mana: 100, cd: 72, color: 0xff5e5e,
           range: 420, targets: 'enemyChamp', dmg: { base: 150, perLevel: 22, ad: 0.9 }, stun: { ms: 1500 },
           healOnHit: { base: 120, perLevel: 20, ad: 0.4 },
           desc: 'Locks an enemy champion in a merge conflict: heavy damage, a 1.5s stun, and you heal from the fight.' },
    },
    build: ['mouse', 'sneakers', 'gauntlet', 'kanban', 'standing_desk', 'server_rack'],
    lines: { pick: 'LGTM.', kill: 'Fixed in prod.', death: 'It compiled on my machine...' },
  },

  appdev: {
    id: 'appdev', name: 'Swipe', title: 'the App Developer', role: 'Marksman', lane: 'bot',
    emoji: '📱', color: 0xff4fa3, difficulty: 2, ranged: true,
    blurb: "Throws last year's flagship phones at you. Ships an update mid-fight.",
    look: { outfit: 'tshirt', hat: 'beanie', prop: 'phone', palette: [0xff4fa3, 0x222222] },
    base:   { hp: 550, mana: 300, ad: 60, ap: 0, armor: 22, mr: 30, as: 0.67, range: 500, ms: 330 },
    growth: { hp: 88,  mana: 36,  ad: 3.5, armor: 3.4, mr: 1.2, as: 0.025 },
    skills: {
      q: { name: 'Push Notification', icon: '🔔', type: 'projectile', mana: 45, cd: 5.5, color: 0xff4fa3,
           range: 840, speed: 1750, width: 62, count: 3, spread: 24, slow: { pct: 0.2, ms: 1000 }, dmg: { base: 62, perLevel: 14, ad: 0.75 },
           desc: 'Throws 3 phones in a fan that slow enemies hit by 20%. Cheap, fast poke.' },
      w: { name: 'Dark Mode', icon: '🌙', type: 'self', mana: 45, cd: 12, color: 0x6a5acd,
           duration: 4000, invisMs: 1200, buff: { msPct: 0.25, as: 0.35 },
           desc: 'Enters Dark Mode: 1.2s stealth plus +25% move speed and +35% attack speed.' },
      e: { name: 'Swipe Left', icon: '👈', type: 'dash', mana: 35, cd: 7, color: 0xffffff,
           range: 390, hitRadius: 0, desc: 'Quickly dashes in the aimed direction.' },
      r: { name: 'App Store Launch', icon: '📲', type: 'projectile', mana: 100, cd: 62, color: 0xff2d95,
           range: 1200, speed: 1950, width: 72, count: 7, spread: 50, execute: { missingHpPct: 0.15 }, dmg: { base: 175, perLevel: 25, ad: 1.0 },
           desc: 'Launches a 7-phone barrage dealing bonus damage based on enemy missing HP.' },
    },
    build: ['caffeine', 'jetpack', 'rgb_keyboard', 'gauntlet', 'ultrawide', 'standing_desk'],
    lines: { pick: 'Shipping to both stores.', kill: '5 stars.', death: 'App not responding...' },
  },

  // ───────────── Pass 2 "Q4 Hires" (2026-11-21, RP-10) ─────────────
  sprint: {
    id: 'sprint', name: 'Sprint', title: 'the Scrum Master', role: 'Jungler', lane: 'jungle',
    emoji: '📌', color: 0xffb300, difficulty: 2, ranged: false,
    blurb: 'Timeboxes every fight to 15 minutes. Somehow they all run over.',
    look: { outfit: 'polo', hat: 'headband', prop: 'stopwatch', palette: [0xffb300, 0x1e3a5f] },
    base:   { hp: 610, mana: 300, ad: 63, ap: 0, armor: 30, mr: 32, as: 0.67, range: 125, ms: 350 },
    growth: { hp: 98,  mana: 34,  ad: 4,  armor: 4.1, mr: 1.6, as: 0.012 },
    skills: {
      q: { name: 'Daily Stand-up', icon: '🧍', type: 'circle', mana: 35, cd: 5.5, color: 0xffc94d,
           range: 0, radius: 260, delay: 0, dmg: { base: 65, perLevel: 15, ad: 0.85 }, slow: { pct: 0.35, ms: 1500 },
           desc: 'Calls a stand-up: slams nearby foes and slows them.' },
      w: { name: 'Burndown', icon: '📉', type: 'self', mana: 45, cd: 12, color: 0xffe066,
           duration: 3000, shield: { base: 80, perLevel: 16, ad: 0.3 }, heal: { base: 40, perLevel: 9, ad: 0.2 }, buff: { dmgReduction: 0.3 },
           desc: 'Burns down the backlog: heals, gains a shield and takes 30% less damage for 3s.' },
      e: { name: 'Story Points', icon: '🃏', type: 'dash', mana: 45, cd: 10, color: 0xffffff,
           range: 520, toTarget: true, killReset: true, hitRadius: 65, stopAtFirst: true, dmg: { base: 65, perLevel: 15, ad: 0.8 }, stun: { ms: 700 },
           desc: 'Leaps onto a target to damage and stun (0.7s). Killing a champion resets E cooldown.' },
      r: { name: 'All Hands Sprint', icon: '📣', type: 'allies', mana: 100, cd: 75, color: 0xff9800,
           radius: 750, duration: 5000, buff: { msPct: 0.4, adPct: 0.15, as: 0.2 },
           desc: 'Rallies the team for a 5s sprint: allies within range get +40% MS, +15% AD and +20% AS.' },
    },
    build: ['red_pen', 'sneakers', 'gauntlet', 'second_monitor', 'standing_desk', 'letter_opener'],
    lines: { pick: "Let's timebox this.", kill: 'Done done.', death: 'Moving it to next sprint...' },
  },

  cache: {
    id: 'cache', name: 'Cache', title: 'the Data Engineer', role: 'Marksman', lane: 'bot',
    emoji: '💾', color: 0x5c7cfa, difficulty: 2, ranged: true,
    blurb: 'Remembers every mistake you made. Serves them back to you in under 2 ms.',
    look: { outfit: 'flannel', hat: 'snapback', prop: 'usb', palette: [0x5c7cfa, 0xd64545] },
    base:   { hp: 545, mana: 310, ad: 59, ap: 0, armor: 22, mr: 30, as: 0.67, range: 520, ms: 330 },
    growth: { hp: 87,  mana: 36,  ad: 3.5, armor: 3.4, mr: 1.2, as: 0.024 },
    skills: {
      q: { name: 'Batch Job', icon: '🗃️', type: 'projectile', mana: 40, cd: 6, color: 0x5c7cfa,
           range: 960, speed: 1850, width: 75, pierce: true, cdRefundOnHit: { slot: 'all', ms: 1000 }, dmg: { base: 68, perLevel: 15, ad: 0.9 },
           desc: 'Fires a piercing batch bolt; hitting a champion refunds 1s off ALL skill cooldowns.' },
      w: { name: 'Stale Data', icon: '🛢️', type: 'projectile', mana: 50, cd: 12, color: 0x91a7ff,
           range: 900, speed: 1900, width: 70, champOnly: true, dmg: { base: 55, perLevel: 12, ad: 0.6 }, slow: { pct: 0.45, ms: 2000 },
           mark: { tag: 'stale', ms: 6000, max: 3 },
           desc: 'Poisons the first champion hit with stale data: slow 45% and a Stale stack (max 3, 6s) that Full Table Scan cashes in.' },
      e: { name: 'Failover', icon: '🔀', type: 'blink', mana: 50, cd: 13, color: 0xffffff,
           range: 400, desc: 'Instantly blinks to a standby position.' },
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
      q: { name: 'Feedback Hook', icon: '💬', type: 'projectile', mana: 55, cd: 10, color: 0xf7a072,
           range: 880, speed: 1650, width: 75, pull: true, pullDist: 380, dmg: { base: 60, perLevel: 14, ap: 0.5 }, root: { ms: 1000 },
           desc: 'Lashes out a meeting invite that drags the first enemy toward you and roots them (1.0s).' },
      w: { name: 'Team Building', icon: '🎳', type: 'allies', mana: 65, cd: 12, color: 0x7ed957,
           radius: 520, duration: 3000, spellShieldMs: 2500, heal: { base: 65, perLevel: 14, ap: 0.35 }, buff: { msPct: 0.2 },
           desc: 'Heals nearby allies, grants +20% MS, and places a 2.5s Spell Shield blocking 1 enemy skill.' },
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
      q: { name: 'Nitpick', icon: '✏️', type: 'target', mana: 40, cd: 5.5, color: 0xff7675,
           range: 650, targets: 'enemy', dmg: { base: 75, perLevel: 16, ap: 0.55 }, slow: { pct: 0.3, ms: 1200 },
           mark: { tag: 'nit', ms: 6000, max: 4 },
           desc: 'Flags an enemy with a nitpick: damage, slow, and a Nit stack (max 4, 6s) that Hard Reset cashes in.' },
      w: { name: 'Request Changes', icon: '🛑', type: 'circle', mana: 60, cd: 11, color: 0xd63031,
           range: 850, radius: 215, delay: 650, dmg: { base: 65, perLevel: 14, ap: 0.55 }, root: { ms: 1100 },
           desc: 'Blocks the merge: after a delay, enemies in the area are damaged and rooted.' },
      e: { name: 'Code Freeze', icon: '🧊', type: 'zone', mana: 55, cd: 13, color: 0x55efc4,
           range: 700, radius: 210, duration: 3000, tickMs: 600, dmg: { base: 12, perLevel: 3, ap: 0.08 }, silence: { ms: 700 }, slow: { pct: 0.25, ms: 700 },
           desc: 'Freezes the codebase in an area for 3s: enemies inside are SILENCED, slightly slowed, and take damage over time.' },
      r: { name: 'Hard Reset', icon: '🧨', type: 'circle', mana: 110, cd: 78, color: 0xe17055,
           range: 720, radius: 330, delay: 480, dmg: { base: 200, perLevel: 26, ap: 0.8 }, detonate: { tag: 'nit', pctPerStack: 0.18 },
           desc: 'git reset --hard on an area for big damage; each Nit stack on a champion adds +18% of the hit as true damage.' },
    },
    build: ['tech_book', 'smartwatch', 'headphones', 'cloud_credits', 'stackoverflow', 'vpn_hoodie'],
    lines: { pick: 'Nit: everything.', kill: 'Changes requested.', death: 'LGTM... wait... no...' },
  },

  // ── 2026-11-25 "Night Shift" hires ──
  barista: {
    id: 'barista', name: 'Brew', title: 'the Office Barista', role: 'Support', lane: 'support',
    emoji: '☕', color: 0xc8864a, difficulty: 1, ranged: true,
    blurb: 'Knows everyone\'s order and everyone\'s secrets. Runs the break room, and so runs the office.',
    look: { outfit: 'barista', hat: 'flatcap', prop: 'mug', palette: [0x6f4e37, 0xf5e6d3] },
    base:   { hp: 540, mana: 410, ad: 45, ap: 0, armor: 22, mr: 30, as: 0.63, range: 480, ms: 330 },
    growth: { hp: 88,  mana: 42,  ad: 2.7, armor: 3.4, mr: 1.2, as: 0.011 },
    skills: {
      q: { name: 'Hot Pour', icon: '☕', type: 'projectile', mana: 50, cd: 7.5, color: 0xc8864a,
           range: 700, speed: 1450, width: 70, count: 3, spread: 28, dmg: { base: 50, perLevel: 11, ap: 0.4 }, slow: { pct: 0.35, ms: 1500 },
           desc: 'Sprays three streams of scalding coffee in a cone that burn and slow whoever they hit.' },
      w: { name: 'Espresso Shot', icon: '⚡', type: 'allies', mana: 60, cd: 13, color: 0xffb347,
           radius: 520, duration: 4000, heal: { base: 45, perLevel: 10, ap: 0.3 }, buff: { as: 0.25, msPct: 0.15 },
           desc: 'Serves a double shot to nearby allies: heals + grants 25% attack speed and 15% move speed.' },
      e: { name: 'Decaf', icon: '😴', type: 'circle', mana: 60, cd: 12, color: 0x9b7bd4,
           range: 780, radius: 185, delay: 600, dmg: { base: 45, perLevel: 11, ap: 0.4 }, stun: { ms: 1050 },
           desc: 'Swaps an area\'s coffee for decaf. After 0.6s, enemies inside fall asleep (stun).' },
      r: { name: 'Break Room', icon: '🛋️', type: 'zone', mana: 110, cd: 82, color: 0x7ed957,
           range: 700, radius: 330, duration: 4000, tickMs: 500, heal: { base: 16, perLevel: 3, ap: 0.08 },
           dmg: { base: 12, perLevel: 3, ap: 0.06 }, slow: { pct: 0.35, ms: 700 },
           desc: 'Opens the break room for 4s: allies inside heal every 0.5s while enemies are slowed and scalded.' },
    },
    build: ['power_bank', 'sneakers', 'team_lunch', 'headphones', 'firewall', 'midnight_oil'],
    lines: { pick: 'One oat-milk latte for the whole team!', kill: 'Order up!', death: 'Out of beans...' },
  },

  oncall: {
    id: 'oncall', name: 'Pager', title: 'the On-Call SRE', role: 'Jungler', lane: 'jungle',
    emoji: '📟', color: 0xff5252, difficulty: 2, ranged: false,
    blurb: 'Has not slept through the night since 2019. Answers every page within a minute, and arrives angry.',
    look: { outfit: 'hoodie', hat: 'sleepmask', prop: 'pager', palette: [0x2b2d42, 0xff5252] },
    base:   { hp: 615, mana: 300, ad: 64, ap: 0, armor: 30, mr: 32, as: 0.67, range: 140, ms: 345 },
    growth: { hp: 97,  mana: 34,  ad: 4.1, armor: 4, mr: 1.6,  as: 0.012 },
    skills: {
      q: { name: 'Ping', icon: '📶', type: 'dash', mana: 35, cd: 6, color: 0xff5252,
           range: 560, toTarget: true, targets: 'enemy', hitRadius: 65, dmg: { base: 60, perLevel: 14, ad: 0.7 }, slow: { pct: 0.4, ms: 1500 },
           desc: 'Pings a target and rushes onto it, slowing them 40%. Works on monsters to hop between camps.' },
      w: { name: 'Page Everyone', icon: '📟', type: 'projectile', mana: 50, cd: 12, color: 0xffb347,
           range: 1400, speed: 1800, width: 90, pierce: true, champOnly: true, dmg: { base: 45, perLevel: 10, ad: 0.45 }, slow: { pct: 0.3, ms: 1500 },
           mark: { tag: 'paged', ms: 6000, max: 1 },
           desc: 'Sends a long-range alert through every champion in a line: damage, slow, and a Paged mark that On My Way cashes in.' },
      e: { name: 'Postmortem', icon: '⏪', type: 'circle', mana: 55, cd: 14, color: 0xffffff,
           range: 0, radius: 270, delay: 0, dmg: { base: 55, perLevel: 12, ad: 0.5 }, slow: { pct: 0.5, ms: 1500 },
           desc: 'Holds a blameless postmortem around you: enemies nearby take damage and are slowed 50% for 1.5s.' },
      r: { name: 'On My Way', icon: '🏃', type: 'dash', mana: 100, cd: 75, color: 0xff1744,
           range: 920, toTarget: true, targets: 'enemyChamp', behindTarget: true, hitRadius: 65, dmg: { base: 175, perLevel: 25, ad: 0.95 }, stun: { ms: 1000 },
           detonate: { tag: 'paged', pctPerStack: 0.35 },
           desc: 'Launches across long range straight behind an enemy champion: big damage + 1.0s stun, +35% true damage if Paged.' },
    },
    build: ['red_pen', 'sneakers', 'gauntlet', 'kanban', 'rgb_keyboard', 'standing_desk'],
    lines: { pick: 'Acknowledged.', kill: 'Incident resolved.', death: 'Escalating to the next on-call...' },
  },
};

/**
 * v5 visual identity: the render style of every skill (client only — resolved by src/entities/moba/SkillFx.js).
 * A string applies to every effect kind of the skill; an object picks one per kind (dash / zone / ...).
 * Skills without an entry (trap skills, Swipe's phone fans) use the generic MobaFx look.
 */
export const SKILL_FX = {
  pixel:    { q: 'prism', w: 'pixelOrb', e: 'glitch', r: 'rune' },
  stack:    { q: 'hook', w: 'hexDome', e: 'throttle', r: 'vortex' },
  ops:      { q: 'scan', w: 'plusRain', e: 'swap', r: 'deploy' },
  tester:   { q: 'sniper', e: 'vault', r: 'rail' },
  zero:     { q: 'shadowStep', w: 'smoke', e: 'bladeSpin', r: 'execute' },
  model:    { q: 'dataSphere', w: 'hourglass', e: 'roots', r: 'singularity' },
  guard:    { q: 'crescent', w: 'shieldPlate', e: 'charge', r: 'lockdown' },
  cleaner:  { q: 'broomSweep', w: 'bubble', e: { dash: 'skid', zone: 'puddle' }, r: 'flood' },
  courier:  { q: 'tire', w: 'noodles', e: 'parcelDrop', r: 'priceTag' },
  embedded: { q: 'tesla', w: 'overclock', r: 'emp' },
  dev:      { q: 'keyboardSpin', w: 'pair', e: 'branch', r: 'mergeLock' },
  appdev:   { w: 'darkMode', e: 'swipeLeft' },
  sprint:   { q: 'standup', w: 'burndown', e: 'leap', r: 'rally' },
  cache:    { q: 'batch', w: 'stale', e: 'failover', r: 'tableScan' },
  hr:       { q: 'invite', w: 'cheer', e: 'policy', r: 'allHands' },
  lint:     { q: 'nitpick', w: 'stopSign', e: 'freeze', r: 'hardReset' },
  barista:  { q: 'coffee', w: 'espresso', e: 'sleepZ', r: 'breakRoom' },
  oncall:   { q: 'ping', w: 'pageWave', e: 'postmortem', r: 'onMyWay' },
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

/** v4 auto-aim policy (shared by client + server): does a no-direction cast of this skill aim at an
 *  enemy? Abilities that MOVE the caster along a direction never do — blinks and every dash that isn't
 *  toTarget go in the direction of travel (stick / last move / facing) instead (player request 2026-11-08). */
export function autoAimsAtEnemy(spec) {
  if (!spec || spec.type === 'blink' || spec.type === 'self' || spec.type === 'allies' || spec.type === 'swap') return false;
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

// events.js — world events announced by the PM over the office PA.
// Pure data (durations, multipliers, copy). Behavior: server/game/EventDirector.js.
//
// Modifier keys an event may set (read by ArenaRoom / BotDirector each tick):
//   scoreMul      ×XP/score for bug kills          (default 1)
//   bugSpeedMul   ×bug movement speed              (default 1; 0 = frozen)
//   bugsAttack    whether beetles/robots can bite  (default true)
//   spawnEveryMs  bug spawn cadence override       (default: room's normal cadence)
//   maxBugs       alive-bug cap override           (default MAX_BUGS)
//   skillCostMul  ×energy cost of Q/W/E/R          (default 1; 0 = free)
//   pickupTarget  health-pickup pool override      (default PICKUP_TARGET_COUNT)

export const FIRST_EVENT_DELAY_MS = 25000;       // after the room opens
export const EVENT_GAP_MS = [38000, 55000];      // quiet time between events
export const BOSS_EVERY_N_EVENTS = 3;            // every Nth event is the Deadline boss (~3.5 min)
export const PM_NAG_EVERY_MS = [30000, 55000];   // ambient PM chatter between events

export const WORLD_EVENTS = {
  prod_down: {
    weight: 3, durationMs: 24000, color: '#ff5252',
    title: '🚨 PROD IS DOWN!', sub: 'Bug surge · every bug is worth ×1.5 XP',
    mods: { spawnEveryMs: 150, maxBugs: 130, scoreMul: 1.5 },
    surge: 16, // bugs dropped around humans the moment it starts
    pm: ['PROD IS DOWN! Drop everything!', 'The CEO is asking why the website is purple.',
         'Customers are tweeting. EVERYONE, FIX IT.', 'Who pushed to main?! Fix it NOW.'],
    end: 'Prod is back up. For now.',
  },
  coffee_break: {
    weight: 2, durationMs: 18000, color: '#d9a066',
    title: '☕ COFFEE BREAK', sub: 'Health + energy rain down · bugs slow down',
    mods: { bugSpeedMul: 0.6, pickupTarget: 14 },
    rain: 10, // pickups dropped near humans
    pm: ['Fine. 18 seconds of coffee. Then back to work.', 'The new espresso machine works! Go go go.',
         'Coffee break! Not you, Kevin.'],
    end: 'Break is over. Back to your desks.',
  },
  code_freeze: {
    weight: 2, durationMs: 14000, color: '#7ec8ff',
    title: '🧊 CODE FREEZE', sub: 'Every bug is frozen solid · smash freely',
    mods: { bugSpeedMul: 0, bugsAttack: false },
    pm: ['CODE FREEZE! Nobody touch anything!', 'Freeze until the release. Except bugs. Smash those.',
         'Legal says no more changes. Bugs included.'],
    end: 'The freeze has thawed. Bugs are moving again!',
  },
  friday_deploy: {
    weight: 2, durationMs: 24000, color: '#ffa84a',
    title: '🚀 FRIDAY DEPLOY', sub: '×2 XP · but the bugs are faster',
    mods: { scoreMul: 2, bugSpeedMul: 1.35 },
    pm: ["We're deploying on a Friday at 5pm. What could go wrong?", 'Deploy now, test on Monday!',
         'YOLO release. Double bonus for everyone who survives.'],
    end: 'Deploy finished. Nobody check the error logs.',
  },
  hackathon: {
    weight: 2, durationMs: 15000, color: '#ff66ff',
    title: '🍕 HACKATHON', sub: 'Skills cost 0 energy · spam them!',
    mods: { skillCostMul: 0 },
    pm: ['Hackathon! Free pizza and unlimited energy drinks!', '24-hour hackathon starts... now. Ship something!',
         'Hackathon rules: no rules. Unlimited skills.'],
    end: 'Hackathon over. Please clean up the pizza boxes.',
  },
  golden_bug: {
    weight: 2, durationMs: 45000, color: '#ffd700',
    title: '✨ THE CEO FOUND A BUG', sub: 'Fix the golden bug for a promotion · check the minimap',
    mods: {},
    pm: ['The CEO found a bug during the demo. Whoever fixes it gets promoted!',
         'Investors saw a bug. FIX IT before the board meeting!'],
    end: 'Nobody fixed it. The CEO fixed it himself. Embarrassing.',
  },
  deadline_boss: {
    boss: true, durationMs: 80000, color: '#ff3b3b',
    title: '⏰ THE DEADLINE IS HERE', sub: 'TRUCE — PvP is off · team up and dodge the red circles',
    // Co-op moment: no PvP damage, fewer stray bugs so the raid stays on the boss.
    mods: { truce: true, spawnEveryMs: 800, maxBugs: 80 },
    pm: ['THE DEADLINE IS HERE. All hands on deck!', 'The deadline was yesterday. Smash it TOGETHER.',
         'Sprint is over. The DEADLINE has arrived.'],
    end: 'DEADLINE MISSED! Everyone into a 2-hour post-mortem.',
  },
};

// Golden bug — the CEO's bug. HP must fit the uint8 Bug.hp field (≤255).
// Spawned relative to a HUMAN (bots outnumber humans 8:1, so "far from any
// player" always handed it to a bot); bots only join the race once it's close
// or after a head start for the humans.
export const GOLDEN_BUG = {
  kind: 'bug-golden', hp: 240, speed: 175, fleeRadius: 300,
  rewardXp: 400,
  spawnFromHuman: [700, 1300],   // px from a randomly chosen human
  minDistFromOthers: 700,        // px from every other player (bots included)
  botChaseRadius: 450,           // bots chase only if they stumble onto it…
  botChaseDelayMs: 10000,        // …until the humans have had this head start
  // (Playtest 2026-11-07: with 600/900/8 s a bot still won 1 of 1 — an Intern
  //  needs ~3–5 s to arrive + ~5 s of smashing.)
};

// The Deadline — co-op boss. HP is uint16 in the schema (≤65535).
export const DEADLINE_BOSS = {
  radius: 70,                    // hit radius added to each attack's reach
  // Playtest 2026-11-07: 1200+520/player died in ~20 s of 80 → ~35 s target.
  hpBase: 1200, hpPerPlayer: 950, hpMax: 30000,
  speed: [72, 105],              // phase 1, phase 2
  firstSlamDelayMs: 4200,        // let the "dodge the red circles" banner land first
  slamEveryMs: [4200, 3000],
  slamWindupMs: 1100,
  slamRadius: 150,
  // Slams hit for a share of the victim's max HP (min 8) so every level needs
  // ~6 slams to break — a flat 18 broke Interns (50 HP) in 3 while bots shrugged.
  slamDamagePct: 0.16,
  slamDamageMin: 8,
  slamKnockback: 150,
  secondSlamMinPlayers: 3,       // phase 2 double-slam needs a crowd
  minionEveryMs: [8000, 6000],
  minionKinds: [['bug-ladybug', 'bug-null'], ['bug-ladybug', 'bug-null', 'bug-beetle']],
  minions: [2, 3],
  pizzaEveryMs: 9000,            // "the PM ordered pizza" — heal drops near the fight
  pizzaCount: 2,
  xpPool: 1500,                  // split by damage share
  participationXp: 100,          // flat bonus for everyone who dealt ≥1% (bots out-DPS humans)
  lastHitXp: 300,
  failStunMs: 1600,
  failBugs: 14,
};

// Ambient PM chatter (between events). {name} = a random online human.
export const PM_NAGS = [
  '@{name}, quick question — is it done yet?', 'Can we make the logo bigger?',
  'Just a small change: rewrite everything in Rust.', 'Per my last email...',
  "Let's circle back on that.", 'The client wants it yesterday.',
  "Who's on call this weekend? 🙂", '@{name}, can you hop on a quick call? (2 hours)',
  'Reminder: standup is in 5 minutes. And every 5 minutes after that.',
  'Can we add AI to it?', "Let's take this offline.", 'Great work everyone! Anyway, about the bugs...',
  '@{name}, your Jira ticket has 47 subtasks now.', 'New requirement: it must also work on a smart fridge.',
  'Deadline is fixed. Scope is flexible. Budget is zero.', 'Ai fix xong bug chưa? 🙂',
];

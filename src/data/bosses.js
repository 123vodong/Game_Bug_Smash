// Boss catalog for the redesigned 3-boss encounter. NOT YET WIRED — current BossScene
// still runs the Mega Deadline Bug single-boss fight. Implementation deferred until
// boss sprite assets are in place.
//
// Design philosophy:
//   PM         -> scope pressure, spawns bugs (support)
//   Tech Lead  -> quality control, punishes spam (controller)
//   Deadline   -> environmental countdown, cannot be killed
// All three interact via boss_synergy triggers below.

export const BOSSES = {
  boss_pm: {
    id: 'boss_pm', name: 'Product Manager', type: 'boss_support',
    description: 'Constantly changes scope and spawns new bugs.',
    lore: 'Everything is urgent. Everything is important.',
    sprite: 'boss_pm', color: 0x6f4caf,
    stats: { hp: 300, speed: 0.7, damage: 15 },
    behavior: {
      movement: 'patrol',
      abilities: [
        { id: 'scope_change', name: 'Scope Change',
          effect: 'spawn_random_bugs', cooldown: 8 },
        { id: 'urgent_ping',  name: 'Urgent Ping',
          effect: 'player_stress_increase', cooldown: 12 },
      ],
    },
    weakness: ['chatgpt'],
    dialog: [
      'Can we add one small feature?',
      'This should be easy, right?',
      'Why is this taking so long?',
    ],
    // Gameplay role: not directly dangerous, but prolongs the level and breaks rhythm.
    // Ignored too long -> overwhelm by spawned bugs.
  },

  boss_tech_lead: {
    id: 'boss_tech_lead', name: 'Tech Lead', type: 'boss_controller',
    description: 'Reviews, blocks, and reflects poor-quality attacks.',
    lore: 'Not evil. Just disappointed.',
    sprite: 'boss_tech_lead', color: 0x1a3a8a,
    stats: { hp: 450, speed: 0.9, damage: 25 },
    behavior: {
      movement: 'adaptive_chase',
      abilities: [
        { id: 'code_review', name: 'Code Review',
          effect: 'reflect_damage', condition: 'spam_attack' },
        { id: 'refactor_request', name: 'Refactor Request',
          effect: 'disable_player_skill', cooldown: 10 },
      ],
    },
    weakness: ['claude_opus'],
    dialog: [
      'Why is this function doing that?',
      'This needs refactoring.',
      "It works, but I don't like it.",
    ],
    // Gameplay role: punishes mash-smashing. Rewards combo + timing.
    // Claude Opus counters him ("the perfect code review").
  },

  boss_deadline: {
    id: 'boss_deadline', name: 'Deadline', type: 'environment_boss',
    description: 'Time pressure that never stops.',
    lore: "You can't defeat it. Only delay it.",
    sprite: 'boss_deadline', color: 0xff3333,
    stats: { timer: 180 },                 // seconds
    behavior: {
      countdown: true,
      effects: [
        { time_left: 120, effect: 'increase_bug_spawn' },
        { time_left:  60, effect: 'panic_mode' },
        { time_left:  30, effect: 'screen_shake' },
      ],
    },
    interaction: {
      // Things the player can do to push the timer back.
      delay_methods: ['clear_bugs', 'use_ai_skill'],
    },
    dialog: [
      'Release in 3…2…1…',
      'Why is this not done yet?',
      'We go live today.',
    ],
    // Gameplay role: panic pressure, forces fast decisions. Cannot be smashed.
  },
};

/** Triggered effects when boss state combinations are met. */
export const BOSS_SYNERGY = [
  {
    id: 'pm_late_game',
    trigger: 'pm_alive_and_deadline_below_60',
    effect: 'spawn_extra_logic_bugs',
  },
  {
    id: 'tech_lead_spam_punish',
    trigger: 'tech_lead_alive_and_player_spam',
    effect: 'damage_reflect',
  },
  {
    id: 'deadline_expired',
    trigger: 'deadline_zero',
    effect: 'bad_ending',
  },
];

export const BOSS_ENDINGS = {
  bad: {
    trigger: 'deadline_zero',
    dialog: "Why wasn't this tested?",
    visual: 'office_overrun_by_bugs',
  },
  good: {
    trigger: 'pm_and_tech_lead_defeated_and_deadline_positive',
    dialog: "Good job. Let's ship.",
    visual: 'team_celebration',
  },
};

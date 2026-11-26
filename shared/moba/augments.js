// shared/moba/augments.js — Code Augments v1 (26 augments across 5 groups, 3 rarities, 3 synergies).
// Triggered at levels 5, 10, 15: pick 1 of 3 random augments (1 free reroll per pick, no duplicates).
// Author: Duke Nguyen (duc.nguyen@onethesis.com)

export const AUGMENT_LEVELS = [5, 10, 15];
export const RARITY_WEIGHTS = { common: 60, rare: 30, epic: 10 };
export const RARITY_COLOR = { common: 0x39c2ff, rare: 0xc44dff, epic: 0xffd23f };

export const AUGMENTS = {
  // ── A. Combat Augments (6) ──
  chain_reaction: {
    id: 'chain_reaction', name: 'Chain Reaction', group: 'Combat', rarity: 'rare', icon: '💥',
    desc: 'Skill hits on enemy champions trigger a small AoE blast for +55 damage (6s CD).',
  },
  last_stand: {
    id: 'last_stand', name: 'Last Stand', group: 'Combat', rarity: 'rare', icon: '🛡️',
    desc: 'Dropping below 30% HP grants 15% damage reduction for 3s (45s CD).',
  },
  overload: {
    id: 'overload', name: 'Overload', group: 'Combat', rarity: 'rare', icon: '⚡',
    desc: 'Every 4th skill cast deals +28% bonus damage.',
  },
  execution_protocol: {
    id: 'execution_protocol', name: 'Execution Protocol', group: 'Combat', rarity: 'common', icon: '🎯',
    desc: 'Deal +14% bonus damage to enemies below 25% HP.',
  },
  emergency_patch: {
    id: 'emergency_patch', name: 'Emergency Patch', group: 'Combat', rarity: 'rare', icon: '🩹',
    desc: 'Champion takedowns restore 18% of your missing HP.',
  },
  crowd_control: {
    id: 'crowd_control', name: 'Crowd Control', group: 'Combat', rarity: 'common', icon: '⛓️',
    desc: 'Deal +15% bonus damage to stunned, rooted, or slowed enemies.',
  },

  // ── B. Skill Evolution (8) ──
  evo_pixel_split: {
    id: 'evo_pixel_split', name: 'CSS Split-Bolt', group: 'Skill Evolution', rarity: 'epic', icon: '💠',
    champs: ['pixel'],
    desc: 'Pixel Q (CSS Bolt) splashes 45% damage to up to 2 nearby enemies on hit.',
  },
  evo_stack_lock: {
    id: 'evo_stack_lock', name: 'Cluster Shield', group: 'Skill Evolution', rarity: 'epic', icon: '🔒',
    champs: ['stack', 'guard'],
    desc: 'Ultimate grants a +140 shield for each enemy champion hit.',
  },
  evo_tester_barrage: {
    id: 'evo_tester_barrage', name: 'CI/CD Pipeline', group: 'Skill Evolution', rarity: 'epic', icon: '🚀',
    champs: ['tester', 'appdev'],
    desc: 'Ultimate refunds 35% of its cooldown on enemy champion hit.',
  },
  evo_zero_reset: {
    id: 'evo_zero_reset', name: 'Exploit Chain', group: 'Skill Evolution', rarity: 'epic', icon: '🗡️',
    champs: ['zero', 'dev', 'courier', 'sprint', 'oncall'],
    desc: 'Takedowns within 3s of casting Q refund 50% of Q cooldown.',
  },
  evo_ops_field: {
    id: 'evo_ops_field', name: 'Auto-Scaler Field', group: 'Skill Evolution', rarity: 'epic', icon: '💚',
    champs: ['ops', 'barista', 'hr'],
    desc: 'Healing or buffing allies pulses an extra +70 HP heal to nearby allies.',
  },
  evo_model_nova: {
    id: 'evo_model_nova', name: 'Overfit Nova', group: 'Skill Evolution', rarity: 'epic', icon: '🧠',
    champs: ['model', 'lint', 'cleaner'],
    desc: 'Ultimate casts slow enemies by 30% and shred 15% armor for 2.5s.',
  },
  evo_volt_overdrive: {
    id: 'evo_volt_overdrive', name: 'Servo Overdrive', group: 'Skill Evolution', rarity: 'epic', icon: '⚡',
    champs: ['embedded'],
    desc: 'Volt R (Servo EMP) empowers Servo with +45% attack speed and +35% damage for 4s.',
  },
  evo_cache_prefetch: {
    id: 'evo_cache_prefetch', name: 'Branch Predictor', group: 'Skill Evolution', rarity: 'epic', icon: '🧠',
    champs: ['cache'],
    desc: 'Cache 4th Cache Hit stack deals +45 bonus magic damage and grants +20% attack speed for 2.5s.',
  },
  evo_dev_cleave: {
    id: 'evo_dev_cleave', name: 'Merge Cleave', group: 'Skill Evolution', rarity: 'rare', icon: '⚔️',
    champs: ['dev', 'guard', 'stack', 'courier'],
    desc: 'After casting any skill, your next basic attack cleaves nearby foes for 40% AoE damage.',
  },
  evo_sprint_surge: {
    id: 'evo_sprint_surge', name: 'Turbo Deploy', group: 'Skill Evolution', rarity: 'rare', icon: '💨',
    champs: ['sprint', 'oncall', 'courier', 'appdev', 'pixel', 'zero', 'stack', 'dev', 'cleaner'],
    desc: 'Casting a dash or blink skill grants +25% move speed for 2s.',
  },

  // ── C. Utility Augments (4) ──
  flash_cache: {
    id: 'flash_cache', name: 'Flash Cache', group: 'Utility', rarity: 'common', icon: '👟',
    desc: 'Casting a summoner spell (D/F) grants +25% move speed for 2s.',
  },
  ghost_protocol: {
    id: 'ghost_protocol', name: 'Ghost Protocol', group: 'Utility', rarity: 'common', icon: '👻',
    desc: 'After 5s out of combat, gain +15% bonus move speed.',
  },
  bush_hacker: {
    id: 'bush_hacker', name: 'Bush Hacker', group: 'Utility', rarity: 'rare', icon: '🌿',
    desc: 'Entering a bush reveals nearby hidden enemies within 750 px for 2s (12s CD).',
  },
  recall_opt: {
    id: 'recall_opt', name: 'Recall Optimization', group: 'Utility', rarity: 'common', icon: '🏠',
    desc: 'Reduces Recall channel time by 35% (4.0s -> 2.6s).',
  },

  // ── D. Economy & Scaling Augments (3) ──
  bug_bounty: {
    id: 'bug_bounty', name: 'Bug Bounty', group: 'Economy', rarity: 'common', icon: '🪙',
    desc: 'Champion kills grant +45 bonus gold.',
  },
  efficient_farming: {
    id: 'efficient_farming', name: 'Efficient Farming', group: 'Economy', rarity: 'common', icon: '🌾',
    desc: 'Minion kills grant +5 bonus gold.',
  },
  jungle_contract: {
    id: 'jungle_contract', name: 'Jungle Contract', group: 'Economy', rarity: 'rare', icon: '🐺',
    desc: 'Large jungle monsters & river epics grant +35 bonus gold and +15% XP.',
  },

  // ── E. Team Synergy Augments (3) ──
  pair_shield: {
    id: 'pair_shield', name: 'Pair Shielding', group: 'Team Synergy', rarity: 'common', icon: '🤝',
    desc: 'Standing within 450 px of an allied champion grants +12 bonus armor.',
  },
  shared_resources: {
    id: 'shared_resources', name: 'Shared Resources', group: 'Team Synergy', rarity: 'rare', icon: '🔋',
    desc: 'Healing or shielding an ally also restores 40 HP to yourself.',
  },
  coordinated_strike: {
    id: 'coordinated_strike', name: 'Coordinated Strike', group: 'Team Synergy', rarity: 'rare', icon: '🎯',
    desc: 'Deal +12% bonus damage to enemies recently damaged by an allied champion.',
  },
};

export const AUGMENT_IDS = Object.keys(AUGMENTS);

export const AUGMENT_SYNERGIES = [
  {
    id: 'cascade_overflow', name: 'Cascade Overflow',
    requires: ['chain_reaction', 'overload'],
    desc: 'Overload casts bypass Chain Reaction 6s CD once (non-recursive, 55 bonus AoE dmg).',
  },
  {
    id: 'immortal_hotfix', name: 'Immortal Hotfix',
    requires: ['last_stand', 'emergency_patch'],
    desc: 'If HP < 35% before healing, Emergency Patch heals +50% more (27% missing HP).',
  },
  {
    id: 'shadow_ops', name: 'Shadow Ops',
    requires: ['bush_hacker', 'ghost_protocol'],
    desc: 'Leaving a bush grants +20% burst move speed for 2s (8s internal CD).',
  },
];

export function activeSynergies(ownedIds) {
  const set = new Set(ownedIds || []);
  return AUGMENT_SYNERGIES.filter((s) => s.requires.every((r) => set.has(r)));
}

/**
 * Two-step rarity roll with optional Level 10 Epic Skill Evolution guarantee:
 *   1. If `guaranteeEpic` and an unowned Epic is available, reserve 1 Epic card first.
 *   2. For remaining cards, roll rarity tier using RARITY_WEIGHTS (Common 60% / Rare 30% / Epic 10%),
 *      then pick uniformly among unowned eligible augments in that tier.
 */
export function rollAugmentChoices(champId, ownedIds = [], count = 3, opts = {}) {
  const owned = new Set(ownedIds || []);
  const excluded = new Set(opts.excludeIds || []);
  const pool = AUGMENT_IDS.map((id) => AUGMENTS[id]).filter((a) => {
    if (owned.has(a.id) || excluded.has(a.id)) return false;
    if (a.champs && !a.champs.includes(champId)) return false;
    return true;
  });
  const picked = [];
  const avail = [...pool];
  if (opts.guaranteeEpic && picked.length < count) {
    const epics = avail.filter((a) => a.rarity === 'epic');
    const highTier = epics.length > 0 ? epics : avail.filter((a) => a.rarity === 'rare');
    if (highTier.length > 0) {
      const chosen = highTier[Math.floor(Math.random() * highTier.length)];
      picked.push(chosen.id);
      avail.splice(avail.indexOf(chosen), 1);
    }
  }
  const tiers = ['common', 'rare', 'epic'];
  while (picked.length < count && avail.length > 0) {
    const activeTiers = tiers.filter((tr) => avail.some((a) => a.rarity === tr));
    const totalW = activeTiers.reduce((s, tr) => s + (RARITY_WEIGHTS[tr] || 10), 0);
    let r = Math.random() * totalW;
    let chosenTier = activeTiers[0];
    for (const tr of activeTiers) {
      r -= RARITY_WEIGHTS[tr] || 10;
      if (r <= 0) { chosenTier = tr; break; }
    }
    const candidates = avail.filter((a) => a.rarity === chosenTier);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    picked.push(chosen.id);
    avail.splice(avail.indexOf(chosen), 1);
  }
  return picked;
}

/** Roll 1 replacement augment excluding owned and currently displayed card IDs. */
export function rollSingleAugment(champId, ownedIds = [], excludeIds = [], opts = {}) {
  return rollAugmentChoices(champId, ownedIds, 1, { ...opts, excludeIds })[0] || null;
}

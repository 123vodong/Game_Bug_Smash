// Skill catalog for BUG SMASH: Deadline Hunter.
// Each skill is triggered on PICKUP (no manual activation), per the design plan.
//
// Categories:
//   buff    - positive effect for the player
//   debuff  - negative effect (chaos)
//   utility - movement / convenience
//   chaos   - high-risk high-reward
//
// Fields:
//   id          - texture key + reference id
//   name        - display name (e.g., "Claude Sonnet")
//   category    - 'buff' | 'debuff' | 'utility' | 'chaos'
//   color       - hex (used for pickup glow + HUD chip)
//   durationMs  - how long the active effect lasts (0 = instant)
//   spawnWeight - relative spawn chance among skills (higher = more common)
//   rarity      - 'common' | 'uncommon' | 'rare' (display-only)
//   flavor      - one-line description for the toast on pickup
//   effect      - structured params for the skill manager:
//     - speedBoost     : player.speedMultiplier multiplier
//     - oneShotSmash   : every smash is an instant kill
//     - slowPlayer     : player.speedMultiplier multiplier (<1)
//     - extraBugOnHit  : N additional bugs spawn per smash hit
//     - teleportToBug  : instantly teleport to nearest bug (instant)
//     - respawnAllBugs : pull every hiding bug back onto the screen (instant)

export const SKILLS = {
  sonnet: {
    id: 'sonnet', name: 'Claude Sonnet', category: 'buff',
    color: 0x4a8af0, durationMs: 5000, spawnWeight: 4, rarity: 'common',
    flavor: 'Speed boost! Move faster.',
    effect: { speedBoost: 1.5 },
  },
  opus: {
    id: 'opus', name: 'Claude Opus', category: 'buff',
    color: 0xffd23f, durationMs: 3000, spawnWeight: 1, rarity: 'rare',
    flavor: 'One-hit kill! Maximum power.',
    effect: { oneShotSmash: true },
  },
  haiku: {
    id: 'haiku', name: 'Claude Haiku', category: 'debuff',
    color: 0xff5252, durationMs: 6000, spawnWeight: 3, rarity: 'common',
    flavor: 'Random debuff. Anything can happen.',
    effect: { random: ['slowPlayer:0.55', 'extraBugOnHit:1'] },
  },
  cursor: {
    id: 'cursor', name: 'Cursor', category: 'utility',
    color: 0x7ec8ff, durationMs: 0, spawnWeight: 3, rarity: 'common',
    flavor: 'Teleport to the nearest bug.',
    effect: { teleportToBug: true },
  },
  copilot: {
    id: 'copilot', name: 'GitHub Copilot', category: 'chaos',
    color: 0x7ed957, durationMs: 0, spawnWeight: 2, rarity: 'uncommon',
    flavor: 'All remaining bugs appear at once!',
    effect: { respawnAllBugs: true },
  },
};

export const SKILL_IDS = Object.keys(SKILLS);

/** Roll a weighted random skill id. */
export function rollSkill() {
  const weighted = [];
  for (const id of SKILL_IDS) {
    const w = SKILLS[id].spawnWeight ?? 1;
    for (let i = 0; i < w; i++) weighted.push(id);
  }
  return weighted[Math.floor(Math.random() * weighted.length)];
}

// cosmetics.js — hats worn above the stickman's head (Personal) and over the champion (Team).
// Cosmetic only (never stats). Unlocked by lifetime career stats tracked in
// SaveManager (any mode). Server allowlist mirror: server/data/cosmetics.js — add new ids
// in BOTH places.
//
// unlock: { stat, at, label } — stat is a key of SaveManager.getCareer().
// mode: where the stat is earned (profile panel grouping / "how do I get this").

export const HATS = [
  { id: '',        emoji: '',   name: 'No hat',          unlock: null },
  { id: 'cap',     emoji: '🧢', name: 'Dev Cap',         mode: 'arena', unlock: { stat: 'sessions',  at: 1,    label: 'Finish your first online session' } },
  { id: 'headset', emoji: '🎧', name: 'Headset',         mode: 'arena', unlock: { stat: 'bugs',      at: 100,  label: 'Smash 100 bugs online' } },
  { id: 'coffee',  emoji: '☕', name: 'Coffee Addict',   mode: 'arena', unlock: { stat: 'pickups',   at: 25,   label: 'Grab 25 health pickups' } },
  { id: 'gradcap', emoji: '🎓', name: 'Graduate',        mode: 'arena', unlock: { stat: 'maxLevel',  at: 3,    label: 'Reach Junior (Lv3) in one life' } },
  { id: 'duck',    emoji: '🦆', name: 'Rubber Duck',     mode: 'arena', unlock: { stat: 'kos',       at: 10,   label: 'Break 10 laptops in PvP' } },
  { id: 'fire',    emoji: '🔥', name: 'On Fire',         mode: 'arena', unlock: { stat: 'bestCombo', at: 20,   label: 'Hit a ×20 combo' } },
  { id: 'skull',   emoji: '💀', name: 'Deadline Slayer', mode: 'arena', unlock: { stat: 'bosses',    at: 1,    label: 'Help defeat THE DEADLINE' } },
  { id: 'golden',  emoji: '✨', name: "CEO's Favorite",  mode: 'arena', unlock: { stat: 'goldens',   at: 1,    label: "Fix the CEO's golden bug" } },
  { id: 'pizza',   emoji: '🍕', name: 'Hackathon Pizza', mode: 'arena', unlock: { stat: 'bugs',      at: 500,  label: 'Smash 500 bugs online' } },
  { id: 'tophat',  emoji: '🎩', name: 'Senior Hat',      mode: 'arena', unlock: { stat: 'maxLevel',  at: 5,    label: 'Reach Senior (Lv5) in one life' } },
  { id: 'brain',   emoji: '🧠', name: 'Galaxy Brain',    mode: 'arena', unlock: { stat: 'bestScore', at: 2000, label: 'Score 2000 in one life' } },
  { id: 'rocket',  emoji: '🚀', name: 'Shipper',         mode: 'arena', unlock: { stat: 'bosses',    at: 5,    label: 'Defeat THE DEADLINE 5 times' } },
  // Experience Pass 1 — every mode moves the career forward.
  { id: 'badge',   emoji: '🪪', name: 'Badge Access',    mode: 'team',     unlock: { stat: 'teamGames',      at: 1,  label: 'Play an online Office Siege match' } },
  { id: 'captain', emoji: '🏆', name: 'Release Captain', mode: 'team',     unlock: { stat: 'teamWins',       at: 5,  label: 'Win 5 online Office Siege matches' } },
  { id: 'standup', emoji: '📅', name: 'Standup Regular', mode: 'daily',    unlock: { stat: 'bestStreak',     at: 3,  label: 'Reach a 3-day mission streak' } },
  { id: 'unicorn', emoji: '🦄', name: 'Unicorn',         mode: 'daily',    unlock: { stat: 'bestStreak',     at: 7,  label: 'Reach a 7-day mission streak' } },
  { id: 'broom',   emoji: '🧹', name: 'Backlog Zero',    mode: 'campaign', unlock: { stat: 'campaignLevels', at: 12, label: 'Clear all 12 campaign levels' } },
];

export function hatById(id) {
  return HATS.find((h) => h.id === id) || HATS[0];
}

export function isHatUnlocked(hat, career) {
  if (!hat || !hat.unlock) return true;
  return (career?.[hat.unlock.stat] || 0) >= hat.unlock.at;
}

/** { cur, at, frac } toward a hat's unlock (frac 0..1). "No hat" → full. */
export function hatProgress(hat, career) {
  if (!hat?.unlock) return { cur: 0, at: 0, frac: 1 };
  const cur = Math.max(0, career?.[hat.unlock.stat] || 0);
  return { cur: Math.min(cur, hat.unlock.at), at: hat.unlock.at, frac: Math.min(1, cur / hat.unlock.at) };
}

/** Hats whose unlock threshold was crossed going from `before` to `after` career. */
export function newlyUnlockedHats(before, after) {
  return HATS.filter((h) => h.unlock
    && (before?.[h.unlock.stat] || 0) < h.unlock.at
    && (after?.[h.unlock.stat] || 0) >= h.unlock.at);
}

/** Closest still-locked hat (highest progress fraction) — "next hat: 🎧 82/100". null when all unlocked. */
export function nextHat(career) {
  let best = null, bestFrac = -1;
  for (const h of HATS) {
    if (!h.unlock || isHatUnlocked(h, career)) continue;
    const p = hatProgress(h, career);
    if (p.frac > bestFrac) { best = { hat: h, ...p }; bestFrac = p.frac; }
  }
  return best;
}

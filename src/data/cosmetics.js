// cosmetics.js — hats worn above the stickman's head in Multiplayer.
// Cosmetic only (never stats). Unlocked by lifetime career stats tracked in
// SaveManager. Server allowlist mirror: server/data/cosmetics.js — add new ids
// in BOTH places.
//
// unlock: { stat, at, label } — stat is a key of SaveManager.getCareer().

export const HATS = [
  { id: '',        emoji: '',   name: 'No hat',          unlock: null },
  { id: 'cap',     emoji: '🧢', name: 'Dev Cap',         unlock: { stat: 'sessions',  at: 1,    label: 'Finish your first online session' } },
  { id: 'headset', emoji: '🎧', name: 'Headset',         unlock: { stat: 'bugs',      at: 100,  label: 'Smash 100 bugs online' } },
  { id: 'coffee',  emoji: '☕', name: 'Coffee Addict',   unlock: { stat: 'pickups',   at: 25,   label: 'Grab 25 health pickups' } },
  { id: 'gradcap', emoji: '🎓', name: 'Graduate',        unlock: { stat: 'maxLevel',  at: 3,    label: 'Reach Junior (Lv3) in one life' } },
  { id: 'duck',    emoji: '🦆', name: 'Rubber Duck',     unlock: { stat: 'kos',       at: 10,   label: 'Break 10 laptops in PvP' } },
  { id: 'fire',    emoji: '🔥', name: 'On Fire',         unlock: { stat: 'bestCombo', at: 20,   label: 'Hit a ×20 combo' } },
  { id: 'skull',   emoji: '💀', name: 'Deadline Slayer', unlock: { stat: 'bosses',    at: 1,    label: 'Help defeat THE DEADLINE' } },
  { id: 'golden',  emoji: '✨', name: "CEO's Favorite",  unlock: { stat: 'goldens',   at: 1,    label: "Fix the CEO's golden bug" } },
  { id: 'pizza',   emoji: '🍕', name: 'Hackathon Pizza', unlock: { stat: 'bugs',      at: 500,  label: 'Smash 500 bugs online' } },
  { id: 'tophat',  emoji: '🎩', name: 'Senior Hat',      unlock: { stat: 'maxLevel',  at: 5,    label: 'Reach Senior (Lv5) in one life' } },
  { id: 'brain',   emoji: '🧠', name: 'Galaxy Brain',    unlock: { stat: 'bestScore', at: 2000, label: 'Score 2000 in one life' } },
  { id: 'rocket',  emoji: '🚀', name: 'Shipper',         unlock: { stat: 'bosses',    at: 5,    label: 'Defeat THE DEADLINE 5 times' } },
];

export function hatById(id) {
  return HATS.find((h) => h.id === id) || HATS[0];
}

export function isHatUnlocked(hat, career) {
  if (!hat || !hat.unlock) return true;
  return (career?.[hat.unlock.stat] || 0) >= hat.unlock.at;
}

/** Hats whose unlock threshold was crossed going from `before` to `after` career. */
export function newlyUnlockedHats(before, after) {
  return HATS.filter((h) => h.unlock
    && (before?.[h.unlock.stat] || 0) < h.unlock.at
    && (after?.[h.unlock.stat] || 0) >= h.unlock.at);
}

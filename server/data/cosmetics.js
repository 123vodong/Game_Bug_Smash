// cosmetics.js — server allowlist of hat ids. Mirrors src/data/cosmetics.js
// (the client owns the emoji + unlock rules; the server only validates ids).
// Cosmetic-only: unlocks are tracked client-side, there are no stat effects.
export const HAT_IDS = new Set([
  'headset', 'cap', 'coffee', 'gradcap', 'tophat', 'duck',
  'pizza', 'fire', 'skull', 'brain', 'golden', 'rocket',
]);

export function sanitizeHat(id) {
  return (typeof id === 'string' && HAT_IDS.has(id)) ? id : '';
}

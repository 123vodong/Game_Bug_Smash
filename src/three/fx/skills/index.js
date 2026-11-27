// Per-skill VFX registry: champion id -> slot (q/w/e/r) -> { cast(k,m), land(k,m,x,y), fl? }, plus summoner spells (D/F).
// The router consults this first: cast() runs at message time (return true to replace the generic effect), land() runs at impact
// (circle/area/proj end). Generic kind mapping (true radius/range telegraphs) always remains the fallback + fairness baseline.
import pixel from './pixel.js'; import stack from './stack.js'; import ops from './ops.js'; import tester from './tester.js'; import zero from './zero.js'; import model from './model.js';
import guard from './guard.js'; import cleaner from './cleaner.js'; import courier from './courier.js'; import embedded from './embedded.js'; import dev from './dev.js'; import appdev from './appdev.js';
import sprint from './sprint.js'; import cache from './cache.js'; import hr from './hr.js'; import lint from './lint.js'; import barista from './barista.js'; import oncall from './oncall.js';
import spells from './spells.js';
export { createKit } from './kit.js';
export const REGISTRY = { pixel, stack, ops, tester, zero, model, guard, cleaner, courier, embedded, dev, appdev, sprint, cache, hr, lint, barista, oncall };
export const resolveSkill = (champ, slot) => { const c = REGISTRY[champ]; return (c && c[slot]) || null; };
export const resolveSpell = (id) => spells[id] || null;

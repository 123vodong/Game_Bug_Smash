// Progress — one door for "the player did something that counts" in ANY mode.
// Updates the lifetime career (SaveManager), feeds today's daily missions, and reports
// what just happened so the caller can toast it (EXPERIENCE_PASS_BREAKDOWN.md §3.4).
//
//   import { Progress } from '../core/Progress.js';
//   const { missions, hats } = Progress.add('teamGames', 1, { daily: 'teamGames' });
//   for (const m of missions) toast(`✅ Daily mission complete: ${m.text}`);
//   for (const h of hats)     toast(`🎉 New hat unlocked: ${h.emoji} ${h.name}`);
//
// `daily` is the mission METRIC to feed (see src/data/missions.js), or `true` for "same name
// as the career key". Omit it to touch only the career. Pass careerKey = null to feed only a
// daily metric (or use Progress.track).
// Every call returns { missions: Mission[], hats: Hat[] } — the missions completed and hats
// unlocked by THIS call (a finished mission day can unlock streak hats too).
import { SaveManager } from './SaveManager.js';
import { missionsForDay, dayKey } from '../data/missions.js';
import { newlyUnlockedHats } from '../data/cosmetics.js';

function feedDaily(metric, value) {
  if (!metric || !(value > 0)) return [];
  const day = dayKey();
  return SaveManager.trackDaily(day, missionsForDay(day), metric, value);
}

function run(careerKey, value, daily, apply) {
  const before = SaveManager.getCareer();
  if (careerKey) apply();
  const metric = daily === true ? careerKey : daily;
  const missions = feedDaily(metric, value);
  const after = SaveManager.getCareer();
  return { missions, hats: newlyUnlockedHats(before, after) };
}

export const Progress = {
  /** Counter: career[careerKey] += n (and today's `daily` metric += n). */
  add(careerKey, n = 1, { daily } = {}) {
    const v = Number(n) || 0;
    return run(careerKey, v, daily, () => { if (v) SaveManager.addCareer(careerKey, v); });
  },

  /** Best-of: career[careerKey] = max(old, value) (and feed `value` into today's `daily` metric). */
  max(careerKey, value, { daily } = {}) {
    const v = Number(value) || 0;
    return run(careerKey, v, daily, () => SaveManager.maxCareer(careerKey, v));
  },

  /** Daily-mission metric only (no career stat), e.g. Progress.track('events', 1). */
  track(metric, value = 1) {
    return run(null, Number(value) || 0, metric, () => {});
  },

  /**
   * A campaign level was cleared with `stars` (1..3). Saves the best stars, feeds the daily
   * metrics campaignLevels (+1) and campaignStars3 (+1 on a 3★ clear), and the derived career
   * stats campaignLevels / campaignStars (→ 🧹 Backlog Zero).
   * Returns { prev, best, improved, missions, hats } — improved = "NEW BEST!".
   */
  campaignClear(levelId, stars) {
    const before = SaveManager.getCareer();
    const res = SaveManager.setLevelStars(levelId, stars);
    const missions = [...feedDaily('campaignLevels', 1)];
    if (Math.floor(Number(stars) || 0) >= 3) missions.push(...feedDaily('campaignStars3', 1));
    const after = SaveManager.getCareer();
    return { ...res, missions, hats: newlyUnlockedHats(before, after) };
  },

  /** Today's missions with progress: [{ ...mission, progress, done }] (menu / profile / trackers). */
  today() {
    const day = dayKey();
    const daily = SaveManager.getDaily(day);
    return missionsForDay(day).map((m) => ({
      ...m,
      progress: Math.min(m.goal, daily.progress[m.id] || 0),
      done: !!daily.done[m.id],
    }));
  },
};

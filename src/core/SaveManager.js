// LocalStorage wrapper for persistent flags, high scores, and level progression.
// Schema keyed under a single localStorage entry so we can wipe/migrate easily.

const KEY = 'bugSmashHunter.save.v1';

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; }
  catch { return {}; }
}
function write(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

export const SaveManager = {
  // -------- Overall high score --------
  getHighScore() { return read().highScore ?? 0; },
  setHighScore(score) {
    const d = read();
    if (score > (d.highScore ?? 0)) { d.highScore = score; write(d); return true; }
    return false;
  },

  // -------- Per-level best scores --------
  getLevelBest(id) { return (read().levelBests ?? {})[id] ?? 0; },
  setLevelBest(id, score) {
    const d = read();
    d.levelBests = d.levelBests ?? {};
    if (score > (d.levelBests[id] ?? 0)) {
      d.levelBests[id] = score;
      write(d);
      return true;
    }
    return false;
  },

  // -------- Highest level index unlocked (0-based; 0 = first level available) --------
  getUnlockedIndex() { return read().unlockedIndex ?? 0; },
  setUnlockedIndex(i) {
    const d = read();
    if (i > (d.unlockedIndex ?? 0)) { d.unlockedIndex = i; write(d); }
  },

  // -------- Campaign cleared flag --------
  isCampaignCleared() { return !!read().campaignCleared; },
  setCampaignCleared() { const d = read(); d.campaignCleared = true; write(d); },

  // -------- Audio prefs --------
  isMuted() { return !!read().muted; },
  setMuted(m) { const d = read(); d.muted = !!m; write(d); },

  // -------- MP display name (persists across sessions) --------
  getPlayerName() { return read().playerName ?? ''; },
  setPlayerName(name) {
    const d = read();
    const clean = String(name || '').trim().slice(0, 16);
    d.playerName = clean;
    write(d);
    return clean;
  },

  // -------- MP career stats (lifetime; drive hat unlocks) --------
  getCareer() {
    return { ...CAREER_DEFAULTS, ...(read().career ?? {}) };
  },
  /** Add `n` to a counter stat. Returns the career snapshot after the change. */
  addCareer(key, n = 1) {
    const d = read();
    d.career = { ...CAREER_DEFAULTS, ...(d.career ?? {}) };
    d.career[key] = (d.career[key] || 0) + n;
    write(d);
    return d.career;
  },
  /** Raise a "best" stat if `value` beats it. Returns the career snapshot. */
  maxCareer(key, value) {
    const d = read();
    d.career = { ...CAREER_DEFAULTS, ...(d.career ?? {}) };
    if (value > (d.career[key] || 0)) { d.career[key] = value; write(d); }
    return d.career;
  },

  // -------- MP hat (cosmetic id from src/data/cosmetics.js) --------
  getHat() { return read().hat ?? ''; },
  setHat(id) { const d = read(); d.hat = String(id || ''); write(d); },

  // -------- Team Mode: last picked champion (id from shared/moba/champions.js) --------
  // Career counters for Team Mode use addCareer('teamGames' | 'teamWins').
  getTeamChamp() { return read().teamChamp ?? ''; },
  setTeamChamp(id) { const d = read(); d.teamChamp = String(id || '').slice(0, 32); write(d); },

  // -------- Daily missions (progress resets each local day) --------
  getDaily(day) {
    const daily = read().daily;
    return (daily && daily.day === day) ? daily : { day, progress: {}, done: {} };
  },
  /**
   * Feed a metric into today's missions. `missions` = missionsForDay(day).
   * Counters add `value`; `max` missions keep the best value. Returns the
   * missions that became complete with this update (for the in-game toast).
   */
  trackDaily(day, missions, metric, value) {
    // Cheap exit: nothing today tracks this metric.
    if (!missions.some((m) => m.metric === metric)) return [];
    const d = read();
    const daily = (d.daily && d.daily.day === day) ? d.daily : { day, progress: {}, done: {} };
    const completed = [];
    let changed = !(d.daily && d.daily.day === day);
    for (const m of missions) {
      if (m.metric !== metric || daily.done[m.id]) continue;
      const cur = daily.progress[m.id] || 0;
      const next = m.max ? Math.max(cur, value) : cur + value;
      if (next === cur) continue;
      daily.progress[m.id] = next;
      changed = true;
      if (next >= m.goal) { daily.done[m.id] = true; completed.push(m); }
    }
    if (!changed) return completed;
    // All three done today → extend the streak (once per day).
    if (missions.length && missions.every((m) => daily.done[m.id]) && d.streakDay !== day) {
      // "Yesterday" relative to the mission DAY (not the wall clock) — a session
      // that runs past midnight still extends the streak correctly.
      const [yy, mm, dd] = String(day).split('-').map(Number);
      const prev = new Date(yy, (mm || 1) - 1, (dd || 1) - 1);
      const yKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
      d.streak = (d.streakDay === yKey) ? (d.streak || 0) + 1 : 1;
      d.streakDay = day;
    }
    d.daily = daily;
    write(d);
    return completed;
  },
  getStreak() { const d = read(); return { streak: d.streak || 0, day: d.streakDay || '' }; },

  // -------- Reset (debug) --------
  reset() {
    try { localStorage.removeItem(KEY); } catch {}
  },
};

const CAREER_DEFAULTS = {
  bugs: 0, kos: 0, deaths: 0, pickups: 0, bosses: 0, goldens: 0,
  bestCombo: 0, bestScore: 0, maxLevel: 1, sessions: 0, playMs: 0,
  teamGames: 0, teamWins: 0,   // Team Mode (Office Siege) — bumped by src/ui/moba/EndScreen.js
};

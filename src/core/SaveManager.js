// LocalStorage wrapper for persistent flags, high scores, and level progression.
// Schema keyed under a single localStorage entry so we can wipe/migrate easily.
//
// Save migration rule (EXPERIENCE_PASS_BREAKDOWN.md §3.4): keys are only ever ADDED, every
// new key has a default on read, `muted` is never renamed, and `reset()` stays the one wipe.
//   settings   { volume:0.8, shake:true, flashes:true }
//   flags      { welcomeSeen, coachCampaign, tipsArena, tipsSiege }  (any JSON value; falsy = unset)
//   levelStars { [levelId]: 0..3 }   — best stars per campaign level
//   career     += teamPractice, teamTakedowns, bestStreak, campaignLevels, campaignStars
//                 (campaignLevels / campaignStars are DERIVED from levelStars on read; see careerOf)
import './FxPrefs.js'; // side effect: camera shake/flash obey settings.shake / settings.flashes

const KEY = 'bugSmashHunter.save.v1';
const TEAM_FX_KEY = 'bugsmash.team.fx'; // read by TeamModeScene: 'auto' | 'high' | 'low'

const SETTINGS_DEFAULTS = { volume: 0.8, shake: true, flashes: true };
// Tutorial flags that "replay tutorials" clears. welcomeSeen is kept (it's the name card).
const TUTORIAL_FLAGS = ['coachCampaign', 'tipsArena', 'tipsSiege'];

// In-memory fallback when localStorage writes fail (Safari private mode, blocked storage,
// quota): the session keeps working (welcome card / coach don't repeat on every menu visit).
let memSave = null;
function read() {
  if (memSave) return JSON.parse(JSON.stringify(memSave));
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    return (d && typeof d === 'object') ? d : {};
  } catch { return {}; }
}
function write(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); memSave = null; }
  catch { memSave = JSON.parse(JSON.stringify(data)); }
}

function clampStars(s) { return Math.max(0, Math.min(3, Math.floor(Number(s) || 0))); }

/** Best stars per level, with the legacy fallback: a level with a saved best score was cleared → ≥1★. */
function starsMap(d) {
  const out = {};
  for (const [id, s] of Object.entries(d.levelBests ?? {})) if (s > 0) out[id] = 1;
  for (const [id, s] of Object.entries(d.levelStars ?? {})) out[id] = Math.max(out[id] || 0, clampStars(s));
  return out;
}

function careerOf(d) {
  const c = { ...CAREER_DEFAULTS, ...(d.career ?? {}) };
  // Derived: distinct campaign levels cleared + total best stars (replays never double-count).
  const stars = Object.values(starsMap(d));
  c.campaignLevels = stars.filter((s) => s > 0).length;
  c.campaignStars = stars.reduce((a, s) => a + s, 0);
  c.bestStreak = Math.max(c.bestStreak || 0, d.streak || 0);
  return c;
}
const DERIVED_CAREER = new Set(['campaignLevels', 'campaignStars']);

function prevDayKey(day) {
  const [yy, mm, dd] = String(day).split('-').map(Number);
  const prev = new Date(yy, (mm || 1) - 1, (dd || 1) - 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
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

  // -------- Per-level best stars (0..3) — computed by HuntScene's win screen --------
  /** Best stars for a level (0 = never cleared). Old saves: a cleared level counts as 1★. */
  getLevelStars(id) { return starsMap(read())[id] || 0; },
  /** { [levelId]: stars } for every cleared level (level select). */
  getAllLevelStars() { return starsMap(read()); },
  /**
   * Record the stars of a clear; keeps the best. Returns { prev, best, improved }.
   * Prefer Progress.campaignClear(levelId, stars) — it also feeds missions + hats.
   */
  setLevelStars(id, stars) {
    const d = read();
    const prev = starsMap(d)[id] || 0;
    const best = Math.max(prev, clampStars(stars));
    d.levelStars = d.levelStars ?? {};
    d.levelStars[id] = best;
    write(d);
    return { prev, best, improved: best > prev };
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
  /** Legacy TipManager hook (LevelScene/BossScene): extra tips once the campaign is beaten. */
  isOpusUnlocked() { return !!read().campaignCleared; },

  // -------- Audio prefs (key `muted` — never rename) --------
  isMuted() { return !!read().muted; },
  setMuted(m) { const d = read(); d.muted = !!m; write(d); },

  // -------- Settings (volume / screen shake / flashes) --------
  /** Always a full object: { volume: 0..1, shake: bool, flashes: bool }. */
  getSettings() {
    const s = { ...SETTINGS_DEFAULTS, ...(read().settings ?? {}) };
    const v = Number(s.volume);
    s.volume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : SETTINGS_DEFAULTS.volume;
    s.shake = !!s.shake; s.flashes = !!s.flashes;
    return s;
  },
  /** Merge a patch (e.g. { shake:false }). Returns the new full settings. */
  setSettings(patch = {}) {
    const d = read();
    d.settings = { ...SETTINGS_DEFAULTS, ...(d.settings ?? {}), ...patch };
    write(d);
    return this.getSettings();
  },
  /** Team FX quality lives in its own key (TeamModeScene reads it): 'auto' | 'high' | 'low'. */
  getTeamFx() {
    try { const v = localStorage.getItem(TEAM_FX_KEY); return (v === 'high' || v === 'low') ? v : 'auto'; }
    catch { return 'auto'; }
  },
  setTeamFx(v) {
    const val = (v === 'high' || v === 'low') ? v : 'auto';
    try { localStorage.setItem(TEAM_FX_KEY, val); } catch {}
    return val;
  },

  // -------- One-shot flags (tutorials, first-run) --------
  /** Raw stored value (undefined when unset). Truthy = seen/done. Numbers are fine (e.g. a match counter). */
  getFlag(id) { return (read().flags ?? {})[id]; },
  setFlag(id, v = true) {
    const d = read();
    d.flags = d.flags ?? {};
    d.flags[id] = v;
    write(d);
  },
  /** "Replay tutorials": clears coachCampaign / tipsArena / tipsSiege (keeps welcomeSeen). */
  clearFlags() {
    const d = read();
    if (!d.flags) return;
    for (const k of TUTORIAL_FLAGS) delete d.flags[k];
    write(d);
  },

  // -------- MP display name (persists across sessions) --------
  getPlayerName() { return read().playerName ?? ''; },
  setPlayerName(name) {
    const d = read();
    // NFC + code-point slice: a 16-char Vietnamese name ("Đông") is never cut mid-character.
    const clean = Array.from(String(name || '').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim())
      .slice(0, 16).join('').trim();
    d.playerName = clean;
    write(d);
    return clean;
  },

  // -------- Career stats (lifetime; drive hat unlocks) --------
  // Prefer Progress.add / Progress.max (src/core/Progress.js): they also feed daily
  // missions and report new hats. These stay for old callers.
  getCareer() { return careerOf(read()); },
  /** Add `n` to a counter stat. Returns the career snapshot after the change. */
  addCareer(key, n = 1) {
    const d = read();
    if (!DERIVED_CAREER.has(key)) {
      d.career = { ...CAREER_DEFAULTS, ...(d.career ?? {}) };
      d.career[key] = (d.career[key] || 0) + n;
      write(d);
    }
    return careerOf(d);
  },
  /** Raise a "best" stat if `value` beats it. Returns the career snapshot. */
  maxCareer(key, value) {
    const d = read();
    if (!DERIVED_CAREER.has(key)) {
      d.career = { ...CAREER_DEFAULTS, ...(d.career ?? {}) };
      if (value > (d.career[key] || 0)) { d.career[key] = value; write(d); }
    }
    return careerOf(d);
  },

  // -------- Hat (cosmetic id from src/data/cosmetics.js) — worn in Personal AND Team --------
  getHat() { return read().hat ?? ''; },
  setHat(id) { const d = read(); d.hat = String(id || ''); write(d); },

  // -------- Team Mode: last picked champion (id from shared/moba/champions.js) --------
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
   * Finishing all of today's missions extends the streak and raises career.bestStreak.
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
    // All of today's missions done → extend the streak (once per day).
    if (missions.length && missions.every((m) => daily.done[m.id]) && d.streakDay !== day) {
      // "Yesterday" relative to the mission DAY (not the wall clock) — a session
      // that runs past midnight still extends the streak correctly.
      d.streak = (d.streakDay === prevDayKey(day)) ? (d.streak || 0) + 1 : 1;
      d.streakDay = day;
      d.career = { ...CAREER_DEFAULTS, ...(d.career ?? {}) };
      d.career.bestStreak = Math.max(d.career.bestStreak || 0, d.streak);
    }
    d.daily = daily;
    write(d);
    return completed;
  },
  /** Raw stored streak: { streak, day } (day = last full mission day). See getLiveStreak. */
  getStreak() { const d = read(); return { streak: d.streak || 0, day: d.streakDay || '' }; },
  /** Streak that still counts (all missions finished today or yesterday), else 0. `today` = dayKey(). */
  getLiveStreak(today) {
    const d = read();
    const live = d.streak > 0 && (d.streakDay === today || d.streakDay === prevDayKey(today));
    return live ? d.streak : 0;
  },

  // -------- Reset (debug) --------
  reset() {
    memSave = null;
    try { localStorage.removeItem(KEY); } catch {}
  },
};

const CAREER_DEFAULTS = {
  bugs: 0, kos: 0, deaths: 0, pickups: 0, bosses: 0, goldens: 0,
  bestCombo: 0, bestScore: 0, maxLevel: 1, sessions: 0, playMs: 0,
  // Team Mode (Office Siege): online matches → teamGames / teamWins (the W/L record);
  // offline practice → teamPractice only.
  teamGames: 0, teamWins: 0, teamPractice: 0, teamTakedowns: 0,
  bestStreak: 0,                       // best daily-mission streak
  campaignLevels: 0, campaignStars: 0, // derived from levelStars on read (writes are ignored)
};

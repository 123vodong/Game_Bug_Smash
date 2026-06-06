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

  // -------- Reset (debug) --------
  reset() {
    try { localStorage.removeItem(KEY); } catch {}
  },
};

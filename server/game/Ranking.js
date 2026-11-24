// server/game/Ranking.js — Pass 2 RP-11/12: Team Mode rank store + match results.
//
// Profiles are keyed by the PUBLIC id (server/game/identity.js), never the secret pid:
//   { name, rating (visible rank points), mmr (hidden skill), games, wins, losses, streak, peak, lastAt }
// Stored as JSON in $BUG_SMASH_DATA_DIR/ranks.json (default server/.data/ranks.json), written
// atomically (tmp + rename) at most every SAVE_MS, and flushed on SIGINT / SIGTERM.
// NOTE: a host without a persistent disk (Render free) loses the file on every deploy / restart.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  RATING_START, MMR_START, BOT_RATING, PLACEMENT_GAMES, RANK_FLOOR, ratingDelta, visibleDelta, rankOf, rankLabel, totalStars,
  applyPerfBonus,
} from '../../shared/moba/ranks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.BUG_SMASH_DATA_DIR || path.resolve(__dirname, '../.data');
const FILE = path.join(DATA_DIR, 'ranks.json');
const SAVE_MS = 2000;
const TOP_MAX = 50;
// Tests / harness: BUG_SMASH_RANKS=memory keeps everything in memory (no file).
const MEMORY_ONLY = process.env.BUG_SMASH_RANKS === 'memory';

let profiles = new Map();
let loaded = false;
let saveTimer = null;
let dirty = false;

function load() {
  if (loaded) return;
  loaded = true;
  if (MEMORY_ONLY) return;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const list = raw && typeof raw.profiles === 'object' ? raw.profiles : {};
    for (const [pub, p] of Object.entries(list)) {
      if (!/^[0-9a-f]{16}$/.test(pub) || !p || typeof p !== 'object') continue;
      profiles.set(pub, {
        name: String(p.name || '').slice(0, 16),
        rating: Number.isFinite(p.rating) ? p.rating : RATING_START,
        mmr: Number.isFinite(p.mmr) ? p.mmr : MMR_START,
        games: p.games | 0, wins: p.wins | 0, losses: p.losses | 0,
        streak: p.streak | 0, peak: Number.isFinite(p.peak) ? p.peak : RATING_START,
        lastAt: Number(p.lastAt) || 0,
      });
    }
    console.log(`[Ranking] loaded ${profiles.size} profiles from ${FILE}`);
  } catch (e) {
    if (e?.code !== 'ENOENT') console.warn('[Ranking] could not read', FILE, e?.message || e);
  }
}

function writeNow() {
  if (MEMORY_ONLY || !dirty) return;
  dirty = false;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const out = { v: 1, savedAt: Date.now(), profiles: Object.fromEntries(profiles) };
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(out));
    fs.renameSync(tmp, FILE);
  } catch (e) {
    console.warn('[Ranking] save failed:', e?.message || e);
  }
}

function scheduleSave() {
  dirty = true;
  if (saveTimer || MEMORY_ONLY) return;
  saveTimer = setTimeout(() => { saveTimer = null; writeNow(); }, SAVE_MS);
  saveTimer.unref?.();
}

let hooked = false;
function hookExit() {
  if (hooked || MEMORY_ONLY) return;
  hooked = true;
  const flush = () => { try { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } writeNow(); } catch (_) { /* exiting */ } };
  // Colyseus' graceful shutdown owns SIGINT / SIGTERM (it exits after disposing the rooms, which
  // is when the last results land) — flush on the signal AND on 'exit' (sync writes are fine there).
  process.once('exit', flush);
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, flush);
}

function fresh(name = '') {
  return { name, rating: RATING_START, mmr: MMR_START, games: 0, wins: 0, losses: 0, streak: 0, peak: RATING_START, lastAt: 0 };
}

/** Public view of a profile (+ visible rank). */
function view(pub, p) {
  const r = rankOf(p.rating, p.games);
  return {
    id: pub, name: p.name, rating: Math.round(p.rating), games: p.games, wins: p.wins, losses: p.losses,
    streak: p.streak, peak: Math.round(p.peak), tier: r.tier.id, tierName: r.tier.name, div: r.div, lp: r.lp,
    stars: r.stars, starText: r.starText,
    label: r.label, placed: r.placed, placement: r.placement, placementLeft: Math.max(0, PLACEMENT_GAMES - p.games),
  };
}

export const Ranking = {
  /** Profile (read-only view) — a new player gets a default one (not stored until a match). */
  profile(pub) {
    load();
    if (!pub) return null;
    return view(pub, profiles.get(pub) || fresh());
  },

  /** Hidden skill rating (MMR) of a player — MMR_START for a new or anonymous one (server-only). */
  skill(pub) {
    load();
    const p = pub && profiles.get(pub);
    return p && Number.isFinite(p.mmr) ? p.mmr : MMR_START;
  },

  /** Seat label for lobby / select / scoreboard ('' without an id). */
  label(pub) {
    load();
    if (!pub) return '';
    const p = profiles.get(pub);
    return p ? rankLabel(p.rating, p.games) : rankLabel(RATING_START, 0);
  },

  /** Leaderboard: everyone with ≥ 1 ranked match, by rating (ties: more wins first). */
  top(n = TOP_MAX) {
    load();
    const list = [];
    for (const [pub, p] of profiles) if (p.games >= 1) list.push(view(pub, p));
    list.sort((a, b) => (b.rating - a.rating) || (b.wins - a.wins) || (a.games - b.games));
    return list.slice(0, Math.max(1, Math.min(TOP_MAX, n | 0)));
  },

  /** 1-based leaderboard position of `pub` (0 = no ranked match yet). */
  place(pub) {
    load();
    const p = pub && profiles.get(pub);
    if (!p || p.games < 1) return 0;
    let n = 1;
    for (const [k, q] of profiles) {
      if (k === pub || q.games < 1) continue;
      if (q.rating > p.rating || (q.rating === p.rating && q.wins > p.wins)) n++;
    }
    return n;
  },

  /**
   * Apply one finished match.
   *   players: [{ pub, name, team, abandoned, perf }] — humans with an id who played
   *            (perf: 'mvp' = best of the winning team · 'svp' = best of the losing team · '')
   *   seats:   { blue: n, red: n } — seats per team (bots fill the rest at BOT_RATING)
   *   unranked humans (no id) count as RATING_START in the averages.
   *   winner:  'blue' | 'red'
   * → Map pub → { before, after, delta, won, games, placed, promoted, demoted, rankBefore, rankAfter }
   */
  applyMatch({ players, winner, seats = { blue: 5, red: 5 }, anonHumans = { blue: 0, red: 0 } }) {
    load();
    hookExit();
    const out = new Map();
    if (!Array.isArray(players) || !players.length || (winner !== 'blue' && winner !== 'red')) return out;
    const sum = { blue: 0, red: 0 }, cnt = { blue: 0, red: 0 };
    const seen = new Set();
    const list = [];
    for (const pl of players) {
      if (!pl?.pub || seen.has(pl.pub) || (pl.team !== 'blue' && pl.team !== 'red')) continue;
      seen.add(pl.pub);
      const p = profiles.get(pl.pub) || fresh(pl.name);
      list.push({ pl, p });
      sum[pl.team] += p.mmr; cnt[pl.team]++;              // fair odds: hidden MMR, not the visible rank
    }
    for (const t of ['blue', 'red']) {
      const anon = Math.max(0, anonHumans[t] | 0);
      sum[t] += anon * MMR_START; cnt[t] += anon;
      const bots = Math.max(0, (seats[t] | 0) - cnt[t]);
      sum[t] += bots * BOT_RATING; cnt[t] += bots;
    }
    const avg = { blue: cnt.blue ? sum.blue / cnt.blue : BOT_RATING, red: cnt.red ? sum.red / cnt.red : BOT_RATING };
    const now = Date.now();
    for (const { pl, p } of list) {
      const won = pl.team === winner && !pl.abandoned;
      const other = pl.team === 'blue' ? 'red' : 'blue';
      const before = p.rating;
      const rankBefore = rankOf(before, p.games);
      const mmrDelta = ratingDelta({ teamAvg: avg[pl.team], enemyAvg: avg[other], won, games: p.games });
      // Visible points follow the MMR change, scaled to catch up with it; never below Intern IV 0 LP
      // (a loss there costs nothing) — `delta` is the real visible change.
      const perf = pl.abandoned ? null : applyPerfBonus(visibleDelta(mmrDelta, before, p.mmr, won), pl.perf, won, before, p.mmr);
      const vis = perf ? perf.delta : visibleDelta(mmrDelta, before, p.mmr, won);
      p.rating = Math.max(RANK_FLOOR, before + vis);
      p.mmr += mmrDelta;
      const delta = Math.round(p.rating - before);
      p.games += 1;
      if (won) { p.wins += 1; p.streak = p.streak > 0 ? p.streak + 1 : 1; } else { p.losses += 1; p.streak = p.streak < 0 ? p.streak - 1 : -1; }
      p.peak = Math.max(p.peak, p.rating);
      p.lastAt = now;
      if (pl.name) p.name = String(pl.name).slice(0, 16);
      profiles.set(pl.pub, p);
      const rankAfter = rankOf(p.rating, p.games);
      out.set(pl.pub, {
        before: Math.round(before), after: Math.round(p.rating), delta, won, abandoned: !!pl.abandoned,
        games: p.games, wins: p.wins, losses: p.losses, streak: p.streak,
        placed: rankAfter.placed, placement: rankAfter.placement, justPlaced: false,
        promoted: rankBefore.placed && rankAfter.step > rankBefore.step,
        demoted: rankBefore.placed && rankAfter.step < rankBefore.step,
        lpBefore: rankBefore.lp, lpAfter: rankAfter.lp,
        starsAfter: rankAfter.stars, starText: rankAfter.starText, starDelta: totalStars(p.rating) - totalStars(before),
        bonus: perf ? perf.bonus : '',
        labelBefore: rankBefore.label, labelAfter: rankAfter.label, tier: rankAfter.tier.id,
        placementLeft: Math.max(0, PLACEMENT_GAMES - p.games),
      });
    }
    scheduleSave();
    return out;
  },

  /** Tests: wipe (memory) + write. */
  _reset() { profiles = new Map(); dirty = true; },
  _flush() { writeNow(); },
  get file() { return FILE; },
};

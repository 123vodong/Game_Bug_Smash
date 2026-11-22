// shared/moba/ranks.js — Team Mode ranking (Pass 2, RP-11/13). Pure data + helpers, shared by
// the server (server/game/Ranking.js) and the client (badges, end screen, leaderboard).
//
// Two numbers per player (LoL-style):
//   • `mmr`    — hidden skill rating (starts MMR_START = 1000, bots count BOT_RATING): plain Elo on
//                 team averages, so every match is scored fairly.
//   • `rating` — the VISIBLE rank points (starts RATING_START = Intern IV 0 LP). Each match moves it by
//                 the MMR change scaled by visibleDelta(): while your rank is below your MMR, wins count
//                 up to 3× and losses as little as ¼× — the rank climbs to your real level, then tracks it.
// The visible rank is derived from `rating`:
//   tiers Intern … Principal have 4 divisions (IV → I) of DIV_SPAN rating each; 1 rating = 2 LP,
//   so a division is 100 LP. CTO (the top tier) has no divisions — LP just keeps counting.
// Everyone has a visible rank from the first match: new players start at Intern IV 0 LP (rating =
// RANK_FLOOR, and the rating never drops below it). The first PLACEMENT_GAMES matches are a
// "placement" phase where LP moves ~2× faster (K_PLACEMENT), so strong players climb quickly.

export const RATING_START = 700;         // = RANK_FLOOR → Intern IV 0 LP (visible)
export const MMR_START = 1000;           // hidden skill rating
export const CATCH_UP_SPAN = 150;        // visibleDelta: every 150 points of (MMR − rank) adds +100 % to wins
export const BOT_RATING = 1000;          // bots count as this in the team average
export const PLACEMENT_GAMES = 5;
export const K_PLACEMENT = 48;
export const K_RANKED = 24;
export const DIV_SPAN = 50;              // rating per division (= 100 LP)
export const LP_PER_RATING = 100 / DIV_SPAN;
export const RANK_FLOOR = 700;           // Intern IV 0 LP — the lowest rating (losses stop here)

// ── Stars (display, Wild Rift / Arena of Valor style) ──
// A division shows 5 stars; 1 star = 20 LP = 10 rank points. Filling the 5th star = promotion to the
// next division (☆☆☆☆☆ again). A normal win is about +1 star, a catch-up win +2–3, a loss about −1.
// CTO has no divisions: its stars just keep counting (★ × n).
export const STARS_PER_DIV = 5;
export const LP_PER_STAR = 100 / STARS_PER_DIV;
const RATING_PER_STAR = DIV_SPAN / STARS_PER_DIV;

/** Stars from Intern IV 0 LP up to `rating` (a monotone count — the difference of two = stars won / lost). */
export function totalStars(rating) {
  return Math.floor((Math.max(RANK_FLOOR, Number(rating) || RANK_FLOOR) - RANK_FLOOR) / RATING_PER_STAR);
}

/** "★★☆☆☆" for a division (filled = LP / 20); CTO → "★ × 12". */
export function starText(lp, top = false) {
  const n = Math.floor(Math.max(0, lp | 0) / LP_PER_STAR);
  if (top) return `★ × ${n}`;
  const f = Math.min(STARS_PER_DIV - 1, n);
  return '★'.repeat(f) + '☆'.repeat(STARS_PER_DIV - f);
}

export const TIERS = [
  { id: 'intern',    name: 'Intern',    emoji: '🎒', color: 0x9aa7b4, css: '#9aa7b4', from: 700 },
  { id: 'junior',    name: 'Junior',    emoji: '🌱', color: 0x7ed957, css: '#7ed957', from: 900 },
  { id: 'mid',       name: 'Mid-level', emoji: '💼', color: 0x39c2ff, css: '#39c2ff', from: 1100 },
  { id: 'senior',    name: 'Senior',    emoji: '🎖️', color: 0xb084ff, css: '#b084ff', from: 1300 },
  { id: 'staff',     name: 'Staff',     emoji: '🏅', color: 0xffd23f, css: '#ffd23f', from: 1500 },
  { id: 'principal', name: 'Principal', emoji: '💎', color: 0x00e5ff, css: '#00e5ff', from: 1700 },
  { id: 'cto',       name: 'CTO',       emoji: '👑', color: 0xff4fa3, css: '#ff4fa3', from: 1900 },
];
const DIVS = ['IV', 'III', 'II', 'I'];

/**
 * Visible rank for a rating (always shown — no "Unranked").
 * → { tier (TIERS entry), div ('IV'…'I' | ''), lp, label ('Senior II' | 'CTO'), short ('S2' style),
 *     placed (always true, kept for callers), placement (games < PLACEMENT_GAMES: LP moves faster),
 *     step (a comparable integer: tier*4 + division) }
 */
export function rankOf(rating, games = PLACEMENT_GAMES) {
  const r = Math.max(RANK_FLOOR, Number.isFinite(rating) ? rating : RATING_START);
  let ti = 0;
  for (let i = 0; i < TIERS.length; i++) if (r >= TIERS[i].from) ti = i;
  const tier = TIERS[ti];
  const placed = true;
  const placement = (games | 0) < PLACEMENT_GAMES;
  if (ti === TIERS.length - 1) {
    const lp = Math.floor((r - tier.from) * LP_PER_RATING);
    return { tier, div: '', lp, label: tier.name, short: tier.name, placed, placement, step: ti * 4 + 3, stars: Math.floor(lp / LP_PER_STAR), starText: starText(lp, true) };
  }
  const off = r - tier.from;
  const d = Math.min(3, Math.floor(off / DIV_SPAN));
  const lp = Math.min(99, Math.floor((off - d * DIV_SPAN) * LP_PER_RATING));
  const div = DIVS[d];
  return {
    tier, div, lp, placed, placement, step: ti * 4 + d,
    stars: Math.min(STARS_PER_DIV - 1, Math.floor(lp / LP_PER_STAR)), starText: starText(lp),
    label: `${tier.name} ${div}`,
    short: `${tier.name[0]}${4 - d}`,
  };
}

/** Elo expectation of a team rated `a` against a team rated `b`. */
export function expectedScore(a, b) { return 1 / (1 + Math.pow(10, (b - a) / 400)); }

/** Rating change for one player: K by placement, team averages, win = 1 / loss = 0. */
export function ratingDelta({ teamAvg, enemyAvg, won, games }) {
  const k = (games | 0) < PLACEMENT_GAMES ? K_PLACEMENT : K_RANKED;
  const e = expectedScore(teamAvg, enemyAvg);
  const d = Math.round(k * ((won ? 1 : 0) - e));
  // Never a zero-change result (a win always gains ≥ 1, a loss always costs ≥ 1).
  return won ? Math.max(1, d) : Math.min(-1, d);
}

/**
 * Visible change for a match from the hidden MMR change. gap = mmr − rating: below your MMR wins are
 * worth more (×1 … ×3) and losses less (×1 … ×¼); above it the reverse (wins ×½, losses ×2).
 * A win always gains ≥ 4 points (8 LP) — climbing must always feel like progress.
 */
export function visibleDelta(mmrDelta, rating, mmr, won) {
  const gap = (Number(mmr) || MMR_START) - (Number(rating) || RATING_START);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mul = won ? clamp(1 + gap / CATCH_UP_SPAN, 0.5, 3) : clamp(1 - gap / CATCH_UP_SPAN, 0.25, 2);
  const d = Math.round(mmrDelta * mul);
  return won ? Math.max(4, d) : Math.min(-1, d);
}

// ── Performance bonus (visible rank only — the hidden MMR stays a pure team result) ──
// Team MVP of the WINNING team: +1 extra ★. Best player of the LOSING team: loses only half
// ("star protection"). Only while the visible rank is less than BONUS_CAP_GAP above the MMR (2
// divisions) — so an always-MVP player can't drift above their real level forever.
export const MVP_BONUS = RATING_PER_STAR;   // +1 ★ (10 rank points = 20 LP)
export const SVP_LOSS_MUL = 0.5;            // losing-team best: half the loss
export const BONUS_CAP_GAP = 2 * DIV_SPAN;  // 100 rank points = 2 divisions

/** Performance score (same idea as the end screen's MVP badge): KDA first, then kills, assists, farm. */
export function perfScore({ kills = 0, deaths = 0, assists = 0, cs = 0 } = {}) {
  const k = Number(kills) || 0, d = Number(deaths) || 0, a = Number(assists) || 0;
  return ((k + a) / Math.max(1, d)) * 10 + k * 2 + a + (Number(cs) || 0) / 25;
}

/** Apply 'mvp' (winner) / 'svp' (losing-team best) to a visible delta. → { delta, bonus: 'mvp'|'svp'|'' } */
export function applyPerfBonus(delta, perf, won, rating, mmr) {
  if (!perf || !((Number(rating) || 0) < (Number(mmr) || 0) + BONUS_CAP_GAP)) return { delta, bonus: '' };
  if (perf === 'mvp' && won) return { delta: delta + MVP_BONUS, bonus: 'mvp' };
  if (perf === 'svp' && !won && delta < 0) return { delta: Math.min(-1, Math.round(delta * SVP_LOSS_MUL)), bonus: 'svp' };
  return { delta, bonus: '' };
}

/** Seat label shown next to names ("" for bots / unknown). */
export function rankLabel(rating, games) {
  if (!Number.isFinite(rating)) return '';
  const r = rankOf(rating, games);
  return `${r.tier.emoji} ${r.label} ${r.tier.id === 'cto' ? `★${r.stars}` : `★${r.stars}/${STARS_PER_DIV}`}`;
}

/** Parse a seat label back into its tier (badge colors on the client). */
export function tierOfLabel(label) {
  const s = String(label || '');
  for (let i = TIERS.length - 1; i >= 0; i--) if (s.includes(TIERS[i].name)) return TIERS[i];
  return null;
}

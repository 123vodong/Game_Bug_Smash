// End-of-game dialog between DEV (player) and PM.
// Categories:
//   win.short      — quick / easy win
//   win.epic       — narrow / impressive win
//   lose.short     — gave up early
//   lose.epic      — nearly won but ran out of time
//   lose.badEnding — timer hit 0 with many bugs left

export const TALK = {
  win: {
    short: [
      { pm: 'Huh, it actually works.',  dev: "I'm surprised too." },
      { pm: 'Nice, no bugs.',           dev: 'For now.' },
      { pm: 'So… we can ship?',         dev: 'Before you change the requirements? Yes.' },
    ],
    epic: [
      { pm: 'All bugs fixed. Impossible.', dev: 'I turned off Slack.' },
      { pm: 'The client is happy!',        dev: "I'll wait 5 minutes before believing that." },
    ],
  },
  lose: {
    short: [
      { pm: "You're so bad at this.",     dev: 'Yeah, but this bug would make a great new project.' },
      { pm: "Why doesn't the code run?",  dev: 'It runs. Just not here.' },
      { pm: 'The deadline is gone.',      dev: 'So is my motivation.' },
    ],
    epic: [
      { pm: 'Did you even test this?',         dev: 'Yes. The bug passed all tests.' },
      { pm: 'Why are there MORE bugs now?',    dev: "They're multiplying. Nature is amazing." },
      { pm: 'AI was supposed to help!',        dev: 'AI suggested rewriting everything.' },
    ],
    badEnding: [
      { pm: 'This should have worked.',         dev: 'It worked yesterday.' },
      { pm: 'Why is nothing fixed?',            dev: 'Because everything is connected.' },
      { pm: 'The client wants an explanation.', dev: "Tell them it's an MVP." },
      { pm: 'Emergency meeting. Now.',          dev: 'Let me guess… 8 PM?' },
      { pm: "Why didn't you finish?",           dev: "Because you said 'just one small change'." },
    ],
  },
};

/** Pick win category. `epic` if cleared with notable time remaining. */
export function pickWinCategory(timeLeftMs, totalLimitMs) {
  const ratio = totalLimitMs > 0 ? timeLeftMs / totalLimitMs : 0;
  return ratio > 0.5 ? 'epic' : 'short';
}

/**
 * Pick lose category based on how much was completed.
 *   badEnding — killed less than 30% (timer ran out with most bugs alive)
 *   epic      — killed 70%+ (just missed the win)
 *   short     — everything else
 */
export function pickLoseCategory(killed, total) {
  if (total <= 0) return 'short';
  const ratio = killed / total;
  if (ratio < 0.3) return 'badEnding';
  if (ratio >= 0.7) return 'epic';
  return 'short';
}

/** Pick N consecutive exchanges from a category list. */
export function pickExchanges(category, n = 2) {
  const list = TALK?.[category?.[0]]?.[category?.[1]] ?? category;
  if (!list || !list.length) return [];
  const total = list.length;
  const take = Math.min(Math.max(1, n), total);
  if (take === total) return list.slice();
  const start = Math.floor(Math.random() * (total - take + 1));
  return list.slice(start, start + take);
}

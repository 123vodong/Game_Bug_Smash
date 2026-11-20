// feed.js — kill-feed copy. {a} = attacker, {b} = victim, {bug} = bug name.
// Every PvP KO picks a random line, so the feed reads like office gossip.

export const KO_LINES = [
  "{a} broke {b}'s laptop",
  '{a} force-pushed over {b}',
  "{a} rejected {b}'s pull request",
  "{a} deleted {b}'s node_modules",
  '{a} git-blamed {b}',
  "{a} reverted {b}'s last commit",
  '{a} closed {b} as "won\'t fix"',
  '{a} refactored {b} into oblivion',
  '{a} deprecated {b}',
  '{a} sent {b} back to code review',
  '{a} merged {b} into /dev/null',
  "{a} 404'd {b}",
];

export const BUG_KO_LINES = [
  '{b} got eaten by a {bug}',
  "a {bug} crashed {b}'s laptop",
  "{b} couldn't handle the {bug}",
  '{b} was segfaulted by a {bug}',
];

export const CLOUD_KO_LINES = [
  '{b} inhaled toxic code fumes ☠️',
  '{b} opened a 10-year-old legacy file ☠️',
];

export const BOSS_KO_LINES = [
  'THE DEADLINE crushed {b}',
  '{b} missed their personal deadline',
];

export const JOIN_LINES = ['{a} joined the office', '{a} clocked in', '{a} logged on to Slack'];
export const LEAVE_LINES = ['{a} left the office', '{a} logged off', '{a} went home'];

// Reconnect grace (EP-01): a dropped connection, then the comeback.
export const AWAY_LINES = [
  "{a}'s Wi-Fi went to lunch",
  "{a} is restarting their router",
];
export const BACK_LINES = [
  "{a} is back — 'just restarting my router'",
  '{a} returned. The bot already pushed to main.',
];

export function fillLine(line, vars) {
  return line.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}
export function pickLine(lines, vars) {
  return fillLine(lines[Math.floor(Math.random() * lines.length)], vars);
}

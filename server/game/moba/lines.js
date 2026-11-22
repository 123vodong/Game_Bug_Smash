// server/game/moba/lines.js — Team Mode copy: kill feed, announcements, bot
// chat. Pure data. Placeholders: {a} killer, {b} victim, {team}/{enemy} team
// labels, {n} numbers. Champion-specific lines (pick/kill/death) live in
// shared/moba/champions.js → `lines`.

/** Champion kill lines (breakdown §5 humor pass). */
export const KILL_LINES = [
  '{a} pushed {b} to production',
  '{a} code-reviewed {b} into oblivion',
  '{a} force-merged over {b}',
  "{a} closed {b} as Won't Fix",
  "{a} reverted {b}'s last commit",
  '{a} moved {b} to the backlog',
  '{a} rebased {b} out of existence',
  '{a} deprecated {b}',
  '{a} found a race condition in {b}',
  '{a} git-blamed {b}',
];

/** Deaths without a champion to credit ("executed"). */
export const EXECUTE_LINES = {
  tower:    ['{b} got blocked by the Firewall', '{b} failed the security audit'],
  minion:   ['{b} got swarmed by a bug wave', '{b} drowned in tickets'],
  monster:  ['{b} touched legacy code and regretted it', '{b} got eaten by legacy code'],
  epic:     ['{b} was crushed by THE DEADLINE', "{b} got distracted by the CEO's bug"],
  fountain: ["{b} tried to deploy straight to the enemy's prod"],
  other:    ['{b} crashed'],
};

/** Kill streak banners (killer's streak after the kill). */
export const STREAKS = {
  3: { icon: '🔥', label: 'is on a hot streak' },
  5: { icon: '🚀', label: 'is SHIPPING NONSTOP' },
  7: { icon: '👑', label: 'is a 10x ENGINEER' },
  10: { icon: '🤖', label: 'replaced the whole team with AI' },
};
export const SHUTDOWN_MIN_STREAK = 3;

/** Structure display names. */
export const TOWER_NAMES = { 1: 'outer Firewall', 2: 'inner Firewall', 3: 'Core Firewall' };
export const CORE_NAME = 'Production Server';

/** Bot chat by trigger (kept short — chat is a sidebar). */
export const BOT_TEAM_LINES = {
  start: ['gl hf', 'standup is over, lets ship', 'who has the jira ticket for this?', 'chúc team may mắn 🍀', 'remember: no deploys on friday'],
  recall: ['b', 'brb coffee ☕', 'going back to buy a keyboard', 'recalling, cover me'],
  kill: ['ez', 'merged ✅', 'LGTM', 'ship it 🚀', 'closed as fixed'],
  death: ['lag', 'who put a firewall there', 'my bad', 'it works on my machine!!', 'Code chạy trên máy em mà!'],
  towerWon: ['firewall down 🔥', 'push push push', 'their prod is next', 'deploying to their server rn'],
  towerLost: ['they took our firewall 😭', 'defend!!', 'who was on call??'],
  epicWon: ['CEO bug fixed 💰', 'deadline met. barely.', 'gg objective', 'bonus secured'],
  epicSpawn: ['group for the objective!', 'river, now', 'who wants overtime?'],
  win: ['gg ez', 'gg wp', 'shipped 🚀', 'GG', 'prod is down, not our problem anymore'],
  lose: ['gg', 'post-mortem at 9am...', 'ff... jk gg', 'gg, who wrote the rollback plan?'],
  idle: ['farm farm farm', "who's doing the code review after?", 'mid missing', 'my keyboard is clicky', 'anyone else hungry?', 'cà phê đâu rồi ☕'],
  takeover: ['{b} disconnected, I got this', 'covering for {b} until they reboot'],
  // Experience Pass 1 (§5): rollback vote
  voteYes: ['ok rollback đi, tôi muốn về nhà', 'yes. revert everything.', 'rollback, I have a dentist appointment'],
  voteNo: ['I voted no, I have stock options', 'no. we can still hotfix this', 'no rollback, I believe in this sprint'],
  handback: ['welcome back {b}, I only pushed to main twice', '{b} is back, returning the laptop 💻'],
};

/** Experience Pass 1 (§5): reconnect / disconnect feed lines ({a} = the human). */
export const DISCONNECT_LINE = '📶 {a} lost Wi-Fi — a bot holds their laptop until they are back';
export const RECONNECT_LINES = [
  "🔌 {a} is back — 'just restarting my router'",
  '☕ {a} returned. The bot already pushed to main.',
];
export const RECONNECT_TIMEOUT_LINE = '🤖 {a} did not come back — the bot keeps their laptop';

/** Experience Pass 1 (§5): rollback (concede) vote copy. */
export const ROLLBACK_PASS_TITLE = '🔙 {team} rolled back. {other} ships unopposed.';
export const ROLLBACK_PASS_SUB = 'Rollback vote passed {yes}/{need} after {t}';
export const ROLLBACK_FAIL_LINE = 'Rollback rejected. The sprint continues 😩';
export const ROLLBACK_START_LINE = "🏳 {by} wants last Friday's build back — rollback vote ({yes}/{need})";

/** Bots answer humans in chat when a message matches (first match wins). */
export const BOT_TEAM_REPLIES = [
  { re: /\bbots?\b|\bai\b|robot/i,
    lines: ["I'm not a bot, I'm a contractor", 'beep boop... I mean, hello fellow dev', 'bot? I have feelings. and deadlines.'] },
  { re: /\b(help|how|what do i do)\b|làm sao/i,
    lines: ['last-hit the bugs for gold 🐞', 'B to recall, shop in the fountain', 'stay behind your minions near towers',
      'R unlocks at level 6', 'kill the Firewalls, then their Production Server'] },
  { re: /\b(gank|mid|top|bot lane)\b/i, lines: ['omw', 'on my way', 'give me 10 sec', 'ping me when they push'] },
  { re: /\bgg\b/i, lines: ['gg', 'gg wp', 'gg, ship it 🚀'] },
  { re: /\b(lol|lmao|haha|hihi|kkk)\b|=\)\)/i, lines: ['😂', 'lmao', 'this codebase is the real joke'] },
  { re: /\b(noob|ez|trash|bad)\b/i, lines: ['skill issue tbh', "that's going in your perf review", "calm down, it's just a sprint"] },
  { re: /\b(coffee|cafe)\b|cà phê/i, lines: ['☕☕☕', 'coffee is a dependency', 'buy a coffee in the shop, it heals'] },
  { re: /\b(hi|hello|hey|yo|sup)\b|chào|hế lô/i, lines: ['hey 👋', 'morning ☕', 'chào bạn 👋', 'welcome to the sprint'] },
];


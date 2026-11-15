// bots.js — content for the AI coworkers that fill the arena when few humans
// are online. Pure data: names, personalities, chat lines. Behavior lives in
// server/game/BotDirector.js.
//
// Names must be ≤16 chars (the Player.name limit). Lines may use {name},
// {other} (the other party in an interaction) and {title} placeholders.

// Population: keep (humans + bots) near this many while humans are scarce.
export const BOT_FILL_TARGET = 9;
export const BOT_MAX = 8;
// Gradual join/leave so the room feels organic, not scripted.
export const BOT_ADJUST_EVERY_MS = [1800, 4200];
// Background churn while the room is full of bots: one heads home this often
// (and a fresh coworker clocks in on the next adjust).
export const BOT_CHURN_EVERY_MS = [150000, 300000];

export const BOT_NAMES = [
  'WorksOnMyMachine', 'git_push_-f', 'TabsNotSpaces', 'VimEscapee',
  'NullPointerNinja', 'CtrlC_CtrlV', '10x_Engineer', 'Intern_Kevin',
  'SeniorGoogler', 'JiraHoarder', 'RubberDuck', 'CSS_Wizard',
  'Ctrl_Z_Hero', 'MergeConflict', 'FridayDeployer', 'console.log(me)',
  'sudo_rm_rf', '404_NotFound', 'KubernetesKaren', 'BlockchainBro',
  'LegacyLarry', 'CoffeeDrivenDev', 'HotfixHarry', 'YAML_Whisperer',
  'RegexWizard', 'OffByOne', 'TechnicalDebt', 'AgileAndy',
  'ScrumLord', 'DockerDan', 'NaN_Nancy', 'UndefinedUrsula',
  'SegfaultSam', 'RefactorRita', 'CopyPastePete', 'CacheMissCathy',
  'AsyncAnnie', 'StackTraceSteve', 'LGTM_Larry', 'PrintfDebugger',
  // A few Vietnamese-office regulars (the core community is Vietnamese).
  'TuanBackend', 'LinhQA', 'NamIntern', 'MinhDevOps', 'ThaoFrontend',
];

// Archetypes shape how a bot plays. Every number is a 0..1 dial except the ms/px ones.
//   aggression   — chance to pick a PvP fight when an opportunity shows up
//   retaliate    — chance to fight back when hit by a player (vs. running)
//   fleeHp       — health ratio below which the bot breaks off to heal
//   skill        — reaction speed + skill accuracy (higher = sharper)
//   chatty       — multiplier on chat probability
//   skillSpam    — willingness to spend energy on skills
export const BOT_ARCHETYPES = {
  grinder:  { weight: 4, aggression: 0.06, retaliate: 0.55, fleeHp: 0.35, skill: 0.55, chatty: 0.8, skillSpam: 0.4 },
  brawler:  { weight: 2, aggression: 0.45, retaliate: 0.95, fleeHp: 0.22, skill: 0.6,  chatty: 1.1, skillSpam: 0.7 },
  coward:   { weight: 2, aggression: 0.0,  retaliate: 0.2,  fleeHp: 0.55, skill: 0.45, chatty: 1.0, skillSpam: 0.3 },
  tryhard:  { weight: 2, aggression: 0.25, retaliate: 0.85, fleeHp: 0.3,  skill: 0.85, chatty: 0.6, skillSpam: 0.8 },
  chaos:    { weight: 1, aggression: 0.2,  retaliate: 0.6,  fleeHp: 0.25, skill: 0.5,  chatty: 1.6, skillSpam: 1.0 },
};

// Hats bots may wear (ids must exist in the client's src/data/cosmetics.js).
// Bots showing off hats is the advertisement that makes players want them.
export const BOT_HATS = ['', '', 'headset', 'cap', 'coffee', 'gradcap', 'tophat', 'duck', 'pizza', 'fire', 'skull', 'brain'];

// Why a bot leaves the room (shown in the feed).
export const BOT_LEAVE_REASONS = [
  'went to lunch', 'is on PTO', 'got promoted to management', 'went to fix prod',
  'rage-quit after a merge conflict', 'has another meeting', 'went home at 5pm sharp',
  'is rewriting it in Rust', 'went to find the coffee machine',
];

// Chat lines by trigger. Kept short — chat is a sidebar, not a novel.
export const BOT_LINES = {
  join: [
    'morning everyone ☕', 'who broke the build?', 'is this the standup?',
    'ok who deployed on friday', 'hi team 👋', 'just here for the free pizza',
    'did someone say bugs?', 'Chào cả nhà 👋', 'hôm nay lại OT à?',
  ],
  idle: [
    'anyone know how to exit vim?', "it's not a bug, it's a feature",
    'TODO: fix later', 'who left console.log in prod', 'my code works and I have no idea why',
    'the tests pass on CI... sometimes', 'it works on my machine ¯\\_(ツ)_/¯',
    'have you tried turning it off and on again?', 'just one more bug then lunch',
    '99 little bugs in the code...', 'who wrote this?? ...oh. me.', 'git blame says it was you',
    'chạy được là được, đừng hỏi tại sao', 'cà phê đâu rồi ☕', 'Bug này không phải của em!',
  ],
  streak: [ // big bug combo
    '10x engineer coming through', 'ez', 'I am the senior now',
    'bugs fear me', 'combo go brrrr', 'shipping it 🚀',
  ],
  levelup: [
    'PROMOTED! now I just attend meetings', 'finally {title}. now I say "it depends"',
    'new title, same salary', '{title}! where is my raise?', 'lên {title} rồi nha 😎',
  ],
  broken: [
    'it works on my machine!!', 'who wrote this? ...oh, me', 'rm -rf node_modules and retry',
    'F', 'git revert HEAD', 'my laptop 😭', 'blue screen of death...',
    'that was a feature', 'Code chạy trên máy em mà!', 'IT, help 💀',
  ],
  ko: [ // the bot broke a player's laptop
    '@{other} git gud', '@{other} LGTM 👍', '@{other} have you tried turning it off and on?',
    '@{other} see you in code review', '@{other} closed as won\'t fix', 'skill issue',
    '@{other} that\'s a rejected PR', 'sorry @{other}, nothing personal, just business logic',
  ],
  hit: [ // a player hit the bot
    '@{other} that\'s an HR violation', '@{other} see you in code review',
    '@{other} I\'m telling the PM', 'hey! I\'m on your team @{other}', '@{other} why tho',
    '@{other} I will remember this in your perf review',
  ],
  // World events (keys match server/data/events.js ids)
  ev_prod_down:     ['not again 😩', 'PROD IS DOWN?! who deployed', 'everyone to the war room', 'ai push thẳng lên main vậy?'],
  ev_coffee_break:  ['COFFEE ☕☕☕', 'finally a break', 'grab the health while you can', 'cà phê sữa đá please'],
  ev_code_freeze:   ['code freeze but we smash anyway', 'bugs are frozen, free XP!', 'nobody touch anything... except bugs'],
  ev_friday_deploy: ['who deploys on a friday??', 'double XP, let\'s gooo', 'đừng deploy chiều thứ Sáu!', 'this is fine 🔥'],
  ev_hackathon:     ['FREE ULTS 🍕', 'unlimited energy drinks!!', 'spam R spam R spam R', 'hackathon = no sleep'],
  ev_golden_bug:    ['THE GOLDEN BUG IS MINE', 'promotion here I come', 'where is it?? check the map', 'CEO bug = free promo'],
  ev_deadline_boss: ['everyone focus the DEADLINE!!', 'dodge the red circles!', 'Deadline dí rồi anh em ơi!', 'we can make it... maybe'],
  boss_win:         ['WE SHIPPED IT 🚀', 'deadline: met. barely.', 'gg team', 'ship it!!!'],
  boss_fail:        ['we missed the deadline 💀', 'post-mortem at 9am...', 'the PM is typing...'],
  golden_win:       ['gg, enjoy the promo', 'ugh I was SO close', 'nice catch!'],
};

// Bots reply to humans in chat when a message matches one of these.
// First match wins, so the specific rules come before the generic greeting.
export const BOT_REPLIES = [
  { re: /\bbots?\b|\bai\b|robot/i,
    lines: ["I'm not a bot, I'm a contractor", 'beep boop... I mean, hello fellow human',
            'all my code is written by AI anyway', 'bot? I have feelings. and deadlines.'] },
  { re: /\b(help|how|what do i do|làm sao)\b/i,
    lines: ['click a bug to smash it 🐞', 'grab the green + to heal', 'press R when you\'re surrounded 💥',
            'Q dashes into enemies, E jumps over stuff', 'kill the 👑 guy for the bounty'] },
  { re: /\bgg\b/i, lines: ['gg', 'gg wp', 'gg, ship it 🚀'] },
  { re: /\b(lol|lmao|haha|hihi|kkk)\b|=\)\)/i, lines: ['😂', 'lmao', 'this codebase is the real joke'] },
  { re: /\b(noob|ez|trash|bad)\b/i, lines: ['skill issue tbh', 'that\'s going in your perf review', 'calm down, it\'s just a standup'] },
  { re: /\b(coffee|cafe|cà phê)\b/i, lines: ['☕☕☕', 'coffee is a dependency', 'cà phê muối đi'] },
  { re: /\b(hi|hello|hey|yo|sup|chào|xin chào|hế lô)\b/i,
    lines: ['hey 👋', 'morning ☕', 'yo! grab a laptop and smash', 'chào bạn 👋', 'welcome to the team'] },
];

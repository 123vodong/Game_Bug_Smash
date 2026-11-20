// Tip pools selected by game state.

// Jokes (menu DEV TIP card alternates these 1:1 with TIPS_REAL).
export const TIPS_DEFAULT = [
  "It's not a bug. It's a feature.",
  "Bug makes the project more interesting.",
  "Works on my machine.",
  "Powered by AI. Broken by humans.",
  "Smash bugs before they smash your weekend.",
  "Standup at 9. Smashing at 9:05.",
];

// Real, useful tips (menu DEV TIP card). Short: the card is small.
export const TIPS_REAL = [
  "HOLD click to smash. One click is a code review, not a fix.",
  "Campaign: finish with time to spare for ★★ and ★★★.",
  "Glowing power-ups are office tools. Results may vary.",
  "Campaign, Personal and Team 5v5 all count toward your career.",
  "Team 5v5: last hits pay. Everyone else just 'contributed'.",
  "Team 5v5: low HP? Press B to recall to the break room.",
  "Hats are cosmetic. Equip them from 👤 CAREER.",
  "Finish all 3 daily missions to grow your 🔥 streak.",
  "Personal: a broken laptop sends you back to Intern for a bit.",
  "Press M anywhere to mute. Volume lives in ⚙ SETTINGS.",
];

export const TIPS_OPUS_UNLOCKED = [
  "Senior Review is online. The bugs already lost.",
  "When in doubt, ask for a Senior Review.",
  "Time slows. Bugs fall. Deadlines tremble.",
  "You no longer fix bugs. You delete their will to exist.",
];

// Keyed by skill id; shown while that skill is active.
export const TIPS_ACTIVE_SKILL = {
  haiku:   "The intern is helping. Brace yourself.",
  sonnet:  "Espresso kicked in. Go go go.",
  opus:    "Senior Review: every smash ships.",
  chatgpt: "All bugs visible. No excuses.",
  copilot: "All-hands called. Everyone showed up. Even the bugs.",
  cursor:  "Hot desk claimed. Right next to a bug.",
};

// src/core/I18n.js — Live runtime language switcher (zero game reset).
// Switch language in ESC menu via setLang('en' | 'vi'); subscribers update in place.
// Optional external locale packs (e.g., assets/locales/vi.json) are loaded on demand.

const LANG_KEY = 'bugsmash.lang';
const listeners = new Set();

const EN = {
  'menu.title': 'Match Menu',
  'menu.body': 'Adjust display, camera, or language, or leave the match.',
  'menu.resume': 'RESUME',
  'menu.leave': 'LEAVE MATCH',
  'menu.fx': 'FX',
  'menu.cam.locked': 'CAM: LOCKED',
  'menu.cam.free': 'CAM: FREE',
  'menu.lang': 'LANG',
  'ping.attack': 'ATTACK!',
  'ping.omw': 'ON MY WAY',
  'skill.unlearned': 'Upgrade this skill first (Shift + Q/W/E/R)',
  'skill.upgraded': 'Skill upgraded to Lv',
  // ShopPanel
  'shop.title': 'OFFICE SUPPLY STORE',
  'shop.inBase': 'In base - L-click to inspect, R-click to buy/sell',
  'shop.outBase': 'Return to base to shop - or shop while respawning (B = recall)',
  'shop.buildsInto': 'BUILDS INTO',
  'shop.requires': 'REQUIRES',
  'shop.reqHint': 'L-click: view · R-click: buy',
  'shop.finalTier': 'Final tier item',
  'shop.baseItem': 'Base component · no recipe',
  'shop.consumable': 'Consumable · used instantly',
  'shop.pickItem': 'Pick an item',
  'shop.pickHint': 'Left-click any item to inspect its recipe and stats.',
  'shop.inventory': 'INVENTORY',
  'shop.recommended': 'RECOMMENDED',
  'shop.hint': 'L-click: select · R-click: buy / sell · P / ESC close',
  'shop.buy': 'BUY',
  'shop.upgrade': 'UPGRADE',
  'shop.sell': 'SELL',
  'shop.undo': 'UNDO',
  'shop.ready': 'Ready to buy',
  'shop.combines': 'Combines owned components',
  'shop.instant': 'Used instantly on purchase',
  'shop.needGold': 'Need {gold} more gold',
  'shop.returnShop': 'Return to base to shop',
  'shop.returnSell': 'Return to base to sell',
  'shop.undoHint': 'Just bought - full refund',
  'shop.sellHint': 'Sells for 70% · right-click to sell',
  'shop.owned': 'OWNED',
  'shop.complete': 'Build complete - go push!',
  // AugmentPanel
  'aug.title': 'CODE AUGMENT - LEVEL {lv}',
  'aug.sub': 'Choose 1 permanent upgrade for the rest of the match',
  'aug.pickHint': '[{n}] CLICK OR PRESS {n}',
  'aug.reroll': 'REROLL',
  'aug.rerolled': 'REROLLED',
  'aug.rerollFree': 'REROLL ({n} FREE)',
  'aug.readyOnDeath': 'Augment Lv {lv} ready — opens on next death',
  'aug.synergy': 'SYNERGY: {name}',
  // HUD & Scoreboard
  'hud.base': 'BASE',
  'hud.shop': 'SHOP',
  'hud.info': 'INFO',
  'sb.yourTeam': 'YOUR TEAM',
  'sb.kills': 'kills',
  'sb.towers': 'towers',
  // Practice & Swap Champ
  'prac.swap': 'SWAP CHAMP',
  'prac.swapTitle': 'SWAP CHAMPION (PRACTICE)',
  'prac.swapBody': 'Pick any champion to switch immediately mid-match:',
  'prac.noCd': '0s CD',
  'prac.noMana': 'NO MANA',
  'prac.noDmg': 'NO DMG',
  'prac.lvUp': '+LV',
  'prac.gold': '+5000g',
  'prac.dummy': '+DUMMY',
  'prac.clearDummy': 'CLEAR',
  'prac.status': 'PRACTICE MODE · sandbox controls top-right / ESC',
  // Main Menu & Settings
  'main.play': 'PLAY',
  'main.multiplayer': 'TEAM & ONLINE',
  'main.personal': 'PERSONAL',
  'main.team': 'TEAM 5v5',
  'main.practice': 'TEST CHAMPS',
  'main.settings': 'SETTINGS',
  'main.career': 'CAREER',
  'main.levels': 'LEVELS',
  'main.about': 'ⓘ about · credits',
  'main.story': '📖 STORY MODE',
  'main.daily': 'DAILY MISSIONS',
  'main.devTip': 'DEV TIP',
  'set.title': '⚙ SETTINGS',
  'set.tab.settings': 'AUDIO & FX',
  'set.tab.controls': 'CONTROLS',
  'set.tab.about': 'ABOUT',
  'set.volume': 'Volume',
  'set.sound': 'Sound',
  'set.soundSub': 'M key mutes in every mode',
  'set.shake': 'Screen shake',
  'set.shakeSub': 'Slams, explosions, boss hits',
  'set.flashes': 'Flashes',
  'set.flashesSub': 'Full-screen flashes (turn off if they bother your eyes)',
  'set.fx': 'Team 5v5 effects',
  'set.fxSub': 'Low = smoother on old laptops / phones',
  'set.lang': 'Language',
  'set.langSub': 'English / Tiếng Việt (applies immediately)',
  'set.replay': '↺ REPLAY TUTORIALS',
  'set.replaySub': 'Campaign coach, arena tips and siege tips',
  'set.replayToast': 'Tutorials reset — the coach and tips will show again.',
  // Team Lobby / Select / Custom
  'ui.back': '◀ BACK',
  'ui.backLobby': '◀ BACK TO LOBBY',
  'ui.cancel': '✕ CANCEL',
  'ui.leave': '✕ LEAVE',
  'ui.join': 'JOIN',
  'ui.start': '▶ START',
  'ui.startNow': '▶ START NOW',
  'lobby.quickMatch': 'QUICK MATCH',
  'lobby.practice': '🤖 PRACTICE',
  'lobby.custom': '🏠 CUSTOM ROOMS',
  'lobby.ranks': '🏆 RANKS',
  'select.lockIn': 'LOCK IN',
  'custom.title': 'CUSTOM ROOMS',
  'custom.refresh': '⟳ REFRESH',
  'custom.code': '🔑 JOIN BY CODE',
  'custom.create': '＋ CREATE ROOM',
};

const DICTS = { en: EN, vi: { ...EN } };
let current = 'en';
let viLoaded = false;

try {
  const saved = window.localStorage?.getItem(LANG_KEY);
  if (saved === 'en' || saved === 'vi') current = saved;
} catch (_) { /* default en */ }

async function loadExternalLocale(code) {
  if (code !== 'vi' || viLoaded) return;
  viLoaded = true;
  try {
    const res = await fetch('assets/locales/vi.json', { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (json && typeof json === 'object') Object.assign(DICTS.vi, json);
      notify();
    }
  } catch (_) { /* optional external locale file */ }
}

function notify() {
  for (const fn of listeners) {
    try { fn(current); } catch (_) { /* ignore */ }
  }
}

export function getLang() { return current; }

export function setLang(code) {
  const next = code === 'vi' ? 'vi' : 'en';
  current = next;
  try { window.localStorage?.setItem(LANG_KEY, next); } catch (_) { /* ignore */ }
  if (next === 'vi') loadExternalLocale('vi');
  notify();
  return current;
}

export function toggleLang() {
  return setLang(current === 'en' ? 'vi' : 'en');
}

export function registerLocale(code, map) {
  if (!DICTS[code]) DICTS[code] = { ...EN };
  Object.assign(DICTS[code], map || {});
  if (code === current) notify();
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(key, vars = null) {
  let s = DICTS[current]?.[key] ?? DICTS.en[key] ?? key;
  if (vars && typeof vars === 'object') {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

/** Look up a localized content string (skill/item/spell/augment desc), falling back to English data. */
export function tText(key, fallback = '') {
  return current === 'en' ? fallback : (DICTS[current]?.[key] || fallback);
}

if (current === 'vi') loadExternalLocale('vi');

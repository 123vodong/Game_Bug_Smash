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
  'skill.unlearned': 'Upgrade this skill first (Ctrl + Q/W/E/R)',
  'skill.upgraded': 'Skill upgraded to Lv',
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

export function t(key, fallback = '') {
  return DICTS[current]?.[key] ?? DICTS.en[key] ?? fallback ?? key;
}

if (current === 'vi') loadExternalLocale('vi');

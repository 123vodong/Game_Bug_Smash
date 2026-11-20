// FxPrefs — makes every camera shake / camera flash in the game obey the player's settings
// (Settings panel: "Screen shake", "Flashes"). Installed once, as a side effect of importing
// SaveManager (which nearly every scene does), by wrapping Phaser's Camera prototype — so
// Hunt, Personal, Team (MobaFx, MPBossView…) are covered without touching each call site.
//
// Code that draws its own full-screen flash (a white rectangle tween) should check
// `fxAllowed('flashes')` itself.

const KEY = 'bugSmashHunter.save.v1';
let cache = null;
let cacheAt = 0;

function prefs() {
  // Shakes can fire every frame in a big fight — re-read localStorage at most twice a second.
  const now = Date.now();
  if (cache && now - cacheAt < 500) return cache;
  let s = {};
  try { s = (JSON.parse(localStorage.getItem(KEY)) || {}).settings || {}; } catch { s = {}; }
  cache = { shake: s.shake !== false, flashes: s.flashes !== false };
  cacheAt = now;
  return cache;
}

/** true when the player allows this effect: 'shake' | 'flashes'. */
export function fxAllowed(kind) { return !!prefs()[kind]; }

/** Drop the cache (SettingsPanel calls this after a change so it applies immediately). */
export function fxPrefsChanged() { cache = null; }

(function install() {
  const P = typeof window !== 'undefined' ? window.Phaser : null;
  const Cam = P?.Cameras?.Scene2D?.Camera;
  if (!Cam || Cam.prototype.__fxPrefs) return;
  const shake = Cam.prototype.shake;
  const flash = Cam.prototype.flash;
  Cam.prototype.shake = function (...args) { return fxAllowed('shake') ? shake.apply(this, args) : this; };
  Cam.prototype.flash = function (...args) { return fxAllowed('flashes') ? flash.apply(this, args) : this; };
  Cam.prototype.__fxPrefs = true;
})();

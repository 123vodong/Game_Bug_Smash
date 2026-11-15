// shared/moba/spells.js — Team Mode summoner spells ("office perks").
// Every champion brings TWO, picked in champion select, cast with D / F.
// Shared by server (TeamRoom: validation + effects + bots) and client (select
// screen, HUD slots, info panel, aim previews). Pure data + helpers.
//
// Effect kinds (implemented by the server per `kind`, NOT the skill engine):
//   blink   — instant teleport toward (x,y) up to `range`; lands on nav.nearestFree,
//             so it CROSSES WALLS. Not while rooted/stunned/displaced.
//   heal    — heal self `heal` (amount spec, by champion level) and the most-injured
//             allied champion within `radius`; both get +`msPct` move speed for `ms`.
//   haste   — +`msPct` move speed for `ms`; ghosted (ignores unit collision).
//   shield  — shield self `shield` (amount spec) for `ms`.
//   dot     — target ENEMY CHAMPION within `range`: `dmg` true damage over `ms`
//             (ticks every 500 ms) and −`healCut` healing received meanwhile.
//   smite   — target MONSTER (camp or epic) or enemy MINION within `range`: `dmg` true
//             damage instantly (+`healSelf` × max HP heal on a monster). Junglers' perk.
// `cd` in seconds (NOT reduced by haste). Amount specs { base, perLevel } use
// rules.scaledAmount(spec, level, 0, 0).
export const SPELLS = {
  flash: {
    id: 'flash', name: 'Alt+Tab', icon: '⚡', kind: 'blink', cd: 150, range: 420, color: 0xffe066,
    desc: 'Instantly teleport a short distance — even over a wall.',
  },
  heal: {
    id: 'heal', name: 'Coffee Break', icon: '☕', kind: 'heal', cd: 120, radius: 750, color: 0x7ed957,
    heal: { base: 80, perLevel: 18 }, msPct: 0.3, ms: 1000,
    desc: 'Heal yourself and the most-injured nearby ally, with a short speed boost.',
  },
  ghost: {
    id: 'ghost', name: 'Overtime', icon: '🏃', kind: 'haste', cd: 120, msPct: 0.35, ms: 6000, color: 0x39c2ff,
    desc: '+35% move speed for 6 s and walk through units.',
  },
  barrier: {
    id: 'barrier', name: 'Ctrl+Z', icon: '🛡️', kind: 'shield', cd: 120, ms: 2500, color: 0xbfe6ff,
    shield: { base: 100, perLevel: 22 },
    desc: 'Undo incoming damage: a big shield for 2.5 s.',
  },
  ignite: {
    id: 'ignite', name: 'Escalate', icon: '🔥', kind: 'dot', cd: 150, range: 600, ms: 5000, healCut: 0.5, color: 0xff7a1a,
    dmg: { base: 60, perLevel: 20 },
    desc: 'Escalate an enemy champion to management: true damage over 5 s, −50% healing.',
  },
  smite: {
    id: 'smite', name: 'kill -9', icon: '💀', kind: 'smite', cd: 60, range: 500, color: 0xff3b8a,
    dmg: { base: 450, perLevel: 35 }, healSelf: 0.08,
    desc: 'Terminate a monster or enemy minion: big true damage. Junglers take this.',
  },
};
export const SPELL_IDS = Object.keys(SPELLS);
export const DEFAULT_SPELLS = ['flash', 'heal'];        // humans' default D / F
/** Bot defaults by role (D, F). */
export const ROLE_SPELLS = {
  top: ['ghost', 'barrier'], jungle: ['flash', 'smite'], mid: ['flash', 'ignite'],
  bot: ['flash', 'heal'], support: ['flash', 'heal'],
};
export function isSpellId(id) { return typeof id === 'string' && Object.hasOwn(SPELLS, id); }
/** Valid pair: two DIFFERENT known spells. */
export function validSpellPair(d, f) { return isSpellId(d) && isSpellId(f) && d !== f; }

// Visual language for every champion ability.
// These profiles are intentionally data-only: the router can preserve authoritative
// gameplay telegraphs while changing silhouette, rhythm, colour pairing and "weapon".
const p = (primary, secondary, shape, motion, weapon) =>
  Object.freeze({ primary, secondary, shape, motion, weapon });

export const SKILL_IDENTITY = Object.freeze({
  pixel: Object.freeze({
    q: p(0x39c2ff, 0xff5fa3, 'BITS', 'grid', 'laser fence'),
    w: p(0xff5fa3, 0xffffff, 'BLOT', 'splash', 'paint bomb'),
    e: p(0x39c2ff, 0xb084ff, 'RING', 'rewind', 'history dial'),
    r: p(0xff5fa3, 0x39c2ff, 'HEX', 'lattice', 'pixel storm'),
  }),
  stack: Object.freeze({
    q: p(0x7ed957, 0xb7ff9a, 'CHEVRON', 'cleave', 'stack blade'),
    w: p(0xb7ff9a, 0xffd23f, 'HEX', 'fortify', 'access shield'),
    e: p(0x39c2ff, 0x7ed957, 'RING', 'portal', 'gateway'),
    r: p(0x7ed957, 0xffffff, 'RAYS', 'tower', 'overflow pillar'),
  }),
  ops: Object.freeze({
    q: p(0x00e5ff, 0xffd23f, 'RAYS', 'deploy', 'command beacon'),
    w: p(0xffd23f, 0x39ff9a, 'STREAK', 'tether', 'hotfix cable'),
    e: p(0x39ff9a, 0x00e5ff, 'CHEVRON', 'swap', 'cursor gate'),
    r: p(0x39c2ff, 0x39ff9a, 'RING', 'wave', 'deployment field'),
  }),
  tester: Object.freeze({
    q: p(0xff9800, 0xffffff, 'STREAK', 'snipe', 'test probe'),
    w: p(0xffd23f, 0xff9800, 'PLUS', 'scan', 'scout lens'),
    e: p(0xff5e5e, 0xffd23f, 'PLUS', 'mark', 'edge crosshair'),
    r: p(0xffffff, 0xff3b3b, 'RAYS', 'verdict', 'assertion rail'),
  }),
  zero: Object.freeze({
    q: p(0xb084ff, 0xffffff, 'BITS', 'fork', 'twin process daggers'),
    w: p(0x7656d6, 0x39c2ff, 'CHEVRON', 'switch', 'context blades'),
    e: p(0x9b6cff, 0xffffff, 'SHARD', 'bruteforce', 'exploit shards'),
    r: p(0x5b2f91, 0xff5fa3, 'BLOT', 'breach', 'zero-day spike'),
  }),
  model: Object.freeze({
    q: p(0xb084ff, 0x6cffd6, 'HEX', 'predict', 'vector emitter'),
    w: p(0x6cffd6, 0xb084ff, 'PLUS', 'fit', 'parameter nodes'),
    e: p(0x7d70ff, 0x6cffd6, 'SHARD', 'forest', 'decision branches'),
    r: p(0xb084ff, 0xffffff, 'RING', 'inference', 'model halo'),
  }),
  guard: Object.freeze({
    q: p(0xffd23f, 0xffffff, 'CHEVRON', 'bash', 'clipboard ram'),
    w: p(0xc89b3c, 0xfff2a8, 'HEX', 'guard', 'policy shield'),
    e: p(0xffd23f, 0xff7a1a, 'HEX', 'wall', 'barricade stamp'),
    r: p(0xffffff, 0xffd23f, 'RAYS', 'judgement', 'compliance hammer'),
  }),
  cleaner: Object.freeze({
    q: p(0x39c2ff, 0xffffff, 'CHEVRON', 'sweep', 'mop wave'),
    w: p(0xffd23f, 0x39c2ff, 'RING', 'switch', 'bucket gear'),
    e: p(0x39c2ff, 0x7ec8ff, 'BLOT', 'wash', 'pressure spray'),
    r: p(0xffffff, 0x39c2ff, 'RAYS', 'sanitize', 'clean-room cyclone'),
  }),
  courier: Object.freeze({
    q: p(0xff7a1a, 0xffd23f, 'CHEVRON', 'rush', 'parcel blade'),
    w: p(0xffd23f, 0xffffff, 'HEX', 'pickup', 'delivery crate'),
    e: p(0xffa63d, 0xffffff, 'STREAK', 'deliver', 'express package'),
    r: p(0xff7a1a, 0xffd23f, 'RAYS', 'traffic', 'peak-hour route'),
  }),
  embedded: Object.freeze({
    q: p(0x00e5ff, 0xfff35c, 'RAYS', 'pulse', 'solder lance'),
    w: p(0xfff35c, 0xff7a1a, 'RING', 'overclock', 'clock crystal'),
    e: p(0x00e5ff, 0xffffff, 'STREAK', 'interrupt', 'signal needle'),
    r: p(0xfff35c, 0x00e5ff, 'RAYS', 'burst', 'capacitor array'),
  }),
  dev: Object.freeze({
    q: p(0x39ff9a, 0x5c7cfa, 'BITS', 'commit', 'code axe'),
    w: p(0x5c7cfa, 0x39ff9a, 'RING', 'checkout', 'branch dial'),
    e: p(0xff4f8b, 0x39ff9a, 'CHEVRON', 'merge', 'laptop blade'),
    r: p(0x39ff9a, 0xffffff, 'STREAK', 'release', 'terminal barrage'),
  }),
  appdev: Object.freeze({
    q: p(0xff4fa3, 0xffffff, 'RING', 'tap', 'phone pulse'),
    w: p(0xb084ff, 0xff4fa3, 'HEX', 'widget', 'app tile'),
    e: p(0xff4fa3, 0x39c2ff, 'CHEVRON', 'swipe', 'gesture blade'),
    r: p(0xffffff, 0xff4fa3, 'RAYS', 'launch', 'store burst'),
  }),
  sprint: Object.freeze({
    q: p(0xffd23f, 0xfff2a8, 'RING', 'standup', 'clock ring'),
    w: p(0xfff2a8, 0xff7a1a, 'RAYS', 'planning', 'story-point stars'),
    e: p(0xffd23f, 0xffffff, 'CHEVRON', 'leap', 'stopwatch jab'),
    r: p(0xffd23f, 0xff7a1a, 'RING', 'allhands', 'sprint clock'),
  }),
  cache: Object.freeze({
    q: p(0x74c0fc, 0xc5d0ff, 'CHEVRON', 'fetch', 'memory bolt'),
    w: p(0xc5d0ff, 0x74c0fc, 'RING', 'line', 'cache ring'),
    e: p(0x74c0fc, 0xffffff, 'HEX', 'failover', 'mirror node'),
    r: p(0x4dabf7, 0xc5d0ff, 'BITS', 'flush', 'memory cascade'),
  }),
  hr: Object.freeze({
    q: p(0xffd27a, 0xfff0e0, 'PLUS', 'invite', 'contract card'),
    w: p(0xff8fab, 0xfff0e0, 'PLUS', 'buddy', 'link badge'),
    e: p(0xffd27a, 0xff8fab, 'HEX', 'policy', 'handbook seal'),
    r: p(0xfff0e0, 0xffd27a, 'RAYS', 'townhall', 'megaphone wave'),
  }),
  lint: Object.freeze({
    q: p(0xff7675, 0xffe0e0, 'SHARD', 'underline', 'red pen'),
    w: p(0xffa8a8, 0xffffff, 'PLUS', 'correct', 'fix marker'),
    e: p(0xff5252, 0xffd23f, 'STREAK', 'warning', 'error slash'),
    r: p(0xff3b3b, 0xffffff, 'RAYS', 'report', 'diagnostic storm'),
  }),
  barista: Object.freeze({
    q: p(0xc8864a, 0xf5e6d3, 'BLOT', 'pour', 'coffee splash'),
    w: p(0xf5e6d3, 0xc8864a, 'RING', 'steam', 'milk wand'),
    e: p(0x8b5a2b, 0xffd27a, 'CHEVRON', 'serve', 'cup toss'),
    r: p(0x7ed957, 0xf5e6d3, 'PLUS', 'refresh', 'cafe tray'),
  }),
  oncall: Object.freeze({
    q: p(0xff5252, 0xffffff, 'RING', 'ping', 'pager signal'),
    w: p(0xffb347, 0xff5252, 'RAYS', 'page', 'alert beacon'),
    e: p(0xff1744, 0xffffff, 'STREAK', 'escalate', 'incident line'),
    r: p(0xff1744, 0xffb347, 'RING', 'rollback', 'alarm siren'),
  }),
});

const MOTION = Object.freeze({
  grid: [2.2, .7, 0], splash: [1.7, 1.35, 3], rewind: [2.0, .85, -6], lattice: [2.5, .72, 5],
  cleave: [1.8, 1.3, 0], fortify: [1.5, 1.45, 2], portal: [2.0, .8, 8], tower: [1.5, 1.15, 3],
  deploy: [3.0, .62, 0], tether: [3.8, .45, 0], swap: [2.7, .65, 0], wave: [2.0, 1.15, 4],
  snipe: [4.4, .42, 0], scan: [2.0, .75, 4], mark: [2.8, .55, 0], verdict: [3.5, .5, 0],
  fork: [2.4, .62, 9], switch: [2.7, .55, -8], bruteforce: [2.0, .85, 11], breach: [1.6, 1.35, 2],
  predict: [2.3, .75, 4], fit: [1.8, 1.0, 6], forest: [2.0, .72, -5], inference: [2.0, .95, 3],
  bash: [1.7, 1.35, 0], guard: [1.4, 1.5, 2], wall: [1.5, 1.35, 0], judgement: [1.8, 1.25, 4],
  sweep: [2.2, 1.2, 0], wash: [2.0, 1.3, 3], sanitize: [2.0, 1.2, 8],
  rush: [3.6, .55, 0], pickup: [1.6, 1.2, 3], deliver: [3.8, .5, 0], traffic: [2.8, .7, 0],
  pulse: [3.0, .48, 10], overclock: [2.0, .9, 12], interrupt: [4.0, .4, 0], burst: [2.8, .65, 14],
  commit: [2.5, .6, 0], checkout: [2.0, .9, -6], merge: [2.8, .58, 0], release: [3.4, .48, 0],
  tap: [2.2, .72, 7], widget: [1.8, 1.0, 3], swipe: [3.0, .58, 0], launch: [2.3, .8, 8],
  standup: [2.0, .9, 5], planning: [2.2, .75, 9], leap: [3.0, .6, 0], allhands: [2.0, 1.0, 12],
  fetch: [3.2, .5, 0], line: [2.2, .72, 5], failover: [2.4, .68, -4], flush: [2.6, .6, 10],
  invite: [2.0, .8, 3], buddy: [2.4, .65, 5], policy: [1.7, 1.1, 2], townhall: [2.4, .8, 7],
  underline: [3.6, .42, 0], correct: [2.1, .75, 4], warning: [3.2, .5, 0], report: [2.7, .7, 8],
  pour: [1.8, 1.25, 3], steam: [1.6, 1.35, 2], serve: [2.4, .75, 5], refresh: [1.9, 1.1, 4],
  ping: [2.4, .72, 7], page: [2.8, .65, 10], escalate: [3.5, .45, 0], rollback: [2.0, 1.0, -10],
});

export function getSkillIdentity(champion, slot) {
  const kit = SKILL_IDENTITY[champion];
  const identity = (kit && kit[String(slot || '').toLowerCase()]) || null;
  if (!identity) return null;
  const m = MOTION[identity.motion] || [2.6, .75, 5];
  return { ...identity, tailLength: m[0], tailWidth: m[1], spin: m[2] };
}

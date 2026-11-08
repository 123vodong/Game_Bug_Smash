// MultiPlayScene — Phase 0 multiplayer hello-world.
// Connects to the Colyseus server, joins the 'arena' room, renders every
// player as a colored circle with a nameplate, and broadcasts local pointer
// position as movement. This validates that MP works end-to-end before we
// invest in sprite art or shared bug state.
//
// The existing HuntScene stays untouched — this scene lives alongside it.

import { AudioManager } from '../core/AudioManager.js';
import { SaveManager } from '../core/SaveManager.js';
import { StickmanRenderer } from '../render/StickmanRenderer.js';
import { MPOverlay } from '../ui/MPOverlay.js';
import { MPBossView } from '../entities/MPBossView.js';
import { HATS, hatById, isHatUnlocked, newlyUnlockedHats } from '../data/cosmetics.js';
import { missionsForDay, dayKey } from '../data/missions.js';

// Toggle: use the new procedural skeleton renderer instead of static SVG textures.
// Set to FALSE — we use the SP-mode SVGs directly. They have correct one-handed
// laptop hold, jump pose without rotation, and the look the user prefers.
const USE_PROCEDURAL_STICKMAN = false;

// WebSocket URL — auto-detects based on how the page was loaded:
//   - HTTPS production (Render): `wss://<same-host>` (no port — platform's
//     reverse proxy handles routing both static + WS on 443)
//   - HTTP local dev via Python http.server on :8000: `ws://<host>:2567`
//   - HTTP local dev hitting the Colyseus port directly: `ws://<host>:2567`
const SERVER_URL = (() => {
  const loc = window.location;
  if (loc.protocol === 'https:') {
    // Production — wss on the same origin, no explicit port
    return `wss://${loc.hostname}`;
  }
  // Local dev — always point to Colyseus on :2567
  return `ws://${loc.hostname || 'localhost'}:2567`;
})();
console.log('[MP] SERVER_URL =', SERVER_URL, '· loaded from', window.location.href);
const MOVE_SPEED = 240; // px/sec — same feel as Hunter

function comboTier(c) {
  if (c >= 10) return 3;
  if (c >= 5)  return 2;
  if (c >= 3)  return 1;
  return 0;
}
function comboMultLabel(c) {
  if (c >= 10) return '×3';
  if (c >= 5)  return '×2';
  if (c >= 3)  return '×1.5';
  return '';
}
function comboColor(c) {
  if (c >= 10) return '#ff5252';
  if (c >= 5)  return '#ff9800';
  if (c >= 3)  return '#ffd23f';
  return '#cccccc';
}

// Must match ArenaRoom constants (server is authoritative)
const WORLD_W = 6000;
const WORLD_H = 3375;
// Smash range — matches server SMASH_RADIUS (includes a latency buffer so
// fast-fleeing bugs stay inside the smash cone during the message round-trip).
const SMASH_REACH = 96;

// Stickyman growth tiers (mirror server)
const LEVEL_TITLES = ['Intern', 'Fresher', 'Junior', 'Middle', 'Senior', 'Super Senior'];
// Intern starts noticeably smaller (0.7) — visibly fragile vs higher levels.
const LEVEL_SCALES = [0.70, 0.88, 1.05, 1.22, 1.40, 1.58];

// VS Code dark-theme syntax colors (hex strings — Phaser Text takes CSS color)
const SYNTAX_HEX = {
  keyword:  '#569cd6',   // function, if, return, def, void, int, struct
  fn:       '#dcdcaa',   // function names
  type:     '#4ec9b0',   // class/type names
  string:   '#ce9178',   // string literals
  number:   '#b5cea8',   // numeric literals
  comment:  '#6a9955',   // comments
  variable: '#9cdcfe',   // identifiers
  operator: '#d4d4d4',   // punctuation
  default:  '#d4d4d4',   // fallback
  control:  '#c586c0',   // import / from / class
};
// Real code snippets shown as obstacles. Each token is { t: text, c: cssColor }.
const _KW = SYNTAX_HEX.keyword, _FN = SYNTAX_HEX.fn, _T = SYNTAX_HEX.type,
      _S = SYNTAX_HEX.string,   _N = SYNTAX_HEX.number, _C = SYNTAX_HEX.comment,
      _V = SYNTAX_HEX.variable, _O = SYNTAX_HEX.operator, _D = SYNTAX_HEX.default,
      _X = SYNTAX_HEX.control;
const CODE_SNIPPETS = {
  // JavaScript / TypeScript — shown on `code-block` obstacles
  'code-block': [
    // 1. Friday deploys
    [
      [{t:'// what could go wrong?',c:_C}],
      [{t:'const ',c:_KW},{t:'deploy',c:_FN},{t:' = (day) => {',c:_D}],
      [{t:'  ',c:_D},{t:'if',c:_KW},{t:' (day === ',c:_D},{t:"'friday'",c:_S},{t:') {',c:_D}],
      [{t:'    ',c:_D},{t:'return',c:_KW},{t:' panic();',c:_D}],
      [{t:'  }',c:_D}],
      [{t:'  ',c:_D},{t:'return',c:_KW},{t:' ship();',c:_D}],
      [{t:'};',c:_D}],
    ],
    // 2. The eternal bug
    [
      [{t:'while',c:_KW},{t:' (bugs.length > ',c:_D},{t:'0',c:_N},{t:') {',c:_D}],
      [{t:'  ',c:_D},{t:'try',c:_KW},{t:' { fix(bugs.pop()); }',c:_D}],
      [{t:'  ',c:_D},{t:'catch',c:_KW},{t:' (e) { cry(); coffee++; }',c:_D}],
      [{t:'}',c:_D}],
      [{t:'// it never ends',c:_C}],
    ],
    // 3. AI to the rescue
    [
      [{t:'import',c:_X},{t:' Claude ',c:_D},{t:'from',c:_X},{t:' ',c:_D},{t:"'@anthropic/savior'",c:_S},{t:';',c:_D}],
      [{t:'// works on my machine',c:_C}],
      [{t:'const',c:_KW},{t:' fix = ',c:_D},{t:'await',c:_KW},{t:' Claude.debug(code);',c:_D}],
      [{t:'console.log(',c:_D},{t:"'Magic!'",c:_S},{t:');',c:_D}],
    ],
    // 4. Y2K38 timebomb
    [
      [{t:'if',c:_KW},{t:' (',c:_D},{t:'Date',c:_T},{t:'.now() > ',c:_D},{t:'2147483647000',c:_N},{t:') {',c:_D}],
      [{t:'  ',c:_D},{t:'throw',c:_KW},{t:' ',c:_D},{t:'new',c:_KW},{t:' ',c:_D},{t:'Error',c:_T},{t:'(',c:_D},{t:"'Y2K38'",c:_S},{t:');',c:_D}],
      [{t:'}',c:_D}],
      [{t:'// 2038-01-19 03:14:07 UTC',c:_C}],
      [{t:'let ',c:_KW},{t:'ok = ',c:_D},{t:'true',c:_KW},{t:';',c:_D}],
    ],
    // 5. The answer
    [
      [{t:'const ',c:_KW},{t:'ANSWER = ',c:_D},{t:'42',c:_N},{t:';',c:_D}],
      [{t:'function ',c:_KW},{t:'meaning',c:_FN},{t:'(life) {',c:_D}],
      [{t:'  ',c:_D},{t:'return',c:_KW},{t:' ANSWER; ',c:_D},{t:'// ¯\\_(ツ)_/¯',c:_C}],
      [{t:'}',c:_D}],
    ],
    // 6. Legacy code (mystery!)
    [
      [{t:'// DO NOT TOUCH',c:_C}],
      [{t:'// last edited: 2014-03-22',c:_C}],
      [{t:'// by Steve (no longer here)',c:_C}],
      [{t:'function ',c:_KW},{t:'legacy',c:_FN},{t:'() {',c:_D}],
      [{t:'  ',c:_D},{t:'return',c:_KW},{t:' ',c:_D},{t:'undefined',c:_KW},{t:'; ',c:_D},{t:'// works?',c:_C}],
      [{t:'}',c:_D}],
    ],
    // 7. Imposter syndrome
    [
      [{t:'// I think this works',c:_C}],
      [{t:'function ',c:_KW},{t:'sortMaybe',c:_FN},{t:'(arr) {',c:_D}],
      [{t:'  ',c:_D},{t:'return',c:_KW},{t:' arr.sort(() => ',c:_D},{t:'Math',c:_T},{t:'.random() - ',c:_N},{t:'0.5',c:_N},{t:');',c:_D}],
      [{t:'}',c:_D}],
      [{t:'// ships next Tuesday',c:_C}],
    ],
    // 8. Crypto mystery
    [
      [{t:'// password is hunter2',c:_C}],
      [{t:'const ',c:_KW},{t:'secret = ',c:_D},{t:'"********"',c:_S},{t:';',c:_D}],
      [{t:'function ',c:_KW},{t:'decrypt',c:_FN},{t:'(payload) {',c:_D}],
      [{t:'  ',c:_D},{t:'return',c:_KW},{t:' ',c:_D},{t:'atob',c:_FN},{t:'(payload);  ',c:_D},{t:'// "secure"',c:_C}],
      [{t:'}',c:_D}],
    ],
    // 9. JavaScript moments
    [
      [{t:'console',c:_T},{t:'.log(',c:_D},{t:'0.1',c:_N},{t:' + ',c:_D},{t:'0.2',c:_N},{t:');',c:_D}],
      [{t:'// 0.30000000000000004',c:_C}],
      [{t:'// math is broken',c:_C}],
      [{t:'// (or computers are)',c:_C}],
    ],
    // 10. Type coercion
    [
      [{t:'[] + []  ',c:_D},{t:'// ""',c:_C}],
      [{t:'[] + {}  ',c:_D},{t:'// "[object Object]"',c:_C}],
      [{t:'{} + []  ',c:_D},{t:'// 0',c:_C}],
      [{t:'// JavaScript: a love story',c:_C}],
    ],
    // 11. Callback hell
    [
      [{t:'load(a => {',c:_D}],
      [{t:'  parse(a, b => {',c:_D}],
      [{t:'    save(b, c => {',c:_D}],
      [{t:'      done(c, d => {',c:_D}],
      [{t:'        ',c:_D},{t:'// promise me you will refactor',c:_C}],
    ],
    // 12. NPM left-pad
    [
      [{t:'const ',c:_KW},{t:'leftPad = ',c:_D},{t:'require',c:_FN},{t:'(',c:_D},{t:"'left-pad'",c:_S},{t:');',c:_D}],
      [{t:'// 11 lines of code',c:_C}],
      [{t:'// 17 transitive deps',c:_C}],
      [{t:'// broke the internet in 2016',c:_C}],
    ],
    // 13. Debugger in prod
    [
      [{t:'if',c:_KW},{t:' (env === ',c:_D},{t:"'prod'",c:_S},{t:') {',c:_D}],
      [{t:'  ',c:_D},{t:'// remove before launch',c:_C}],
      [{t:'  ',c:_D},{t:'debugger',c:_KW},{t:';',c:_D}],
      [{t:'}',c:_D}],
      [{t:'// launched anyway',c:_C}],
    ],
    // 14. The 10x dev
    [
      [{t:'// 10x faster',c:_C}],
      [{t:'function ',c:_KW},{t:'optimize',c:_FN},{t:'(slow) {',c:_D}],
      [{t:'  ',c:_D},{t:'return',c:_KW},{t:' slow.slow.slow;',c:_D}],
      [{t:'}',c:_D}],
      [{t:'// citation needed',c:_C}],
    ],
    // 15. The race condition
    [
      [{t:'let ',c:_KW},{t:'counter = ',c:_D},{t:'0',c:_N},{t:';',c:_D}],
      [{t:'async ',c:_KW},{t:'function ',c:_KW},{t:'inc',c:_FN},{t:'() {',c:_D}],
      [{t:'  ',c:_D},{t:'await',c:_KW},{t:' delay(',c:_D},{t:'1',c:_N},{t:');',c:_D}],
      [{t:'  counter += ',c:_D},{t:'1',c:_N},{t:'; ',c:_D},{t:'// race?',c:_C}],
      [{t:'}  ',c:_D},{t:'// works locally',c:_C}],
    ],
    // 16. The Friday recursion
    [
      [{t:'function ',c:_KW},{t:'sleep',c:_FN},{t:'() {',c:_D}],
      [{t:'  ',c:_D},{t:'return',c:_KW},{t:' sleep();  ',c:_D},{t:'// zzz',c:_C}],
      [{t:'}',c:_D}],
      [{t:'sleep();  ',c:_D},{t:'// stack overflow @ 4am',c:_C}],
    ],
    // 17. Tech debt
    [
      [{t:'// TODO: refactor',c:_C}],
      [{t:'// last TODO: 2017-04-12',c:_C}],
      [{t:'// the TODO has feelings now',c:_C}],
      [{t:'function ',c:_KW},{t:'doStuff',c:_FN},{t:'() {',c:_D}],
      [{t:'  ',c:_D},{t:'// I am sorry',c:_C}],
      [{t:'}',c:_D}],
    ],
    // 18. The genius variable name
    [
      [{t:'const ',c:_KW},{t:'data = ',c:_D},{t:'getData',c:_FN},{t:'();',c:_D}],
      [{t:'const ',c:_KW},{t:'data2 = ',c:_D},{t:'cleanData',c:_FN},{t:'(data);',c:_D}],
      [{t:'const ',c:_KW},{t:'dataFinal = ',c:_D},{t:'fix',c:_FN},{t:'(data2);',c:_D}],
      [{t:'const ',c:_KW},{t:'dataFinalFinal_v2 = ',c:_D},{t:'???',c:_S},{t:';',c:_D}],
      [{t:'// somebody help',c:_C}],
    ],
  ],

  // Python — shown on `desk` obstacles
  'desk': [
    // 1. Coffee daemon
    [
      [{t:'def ',c:_KW},{t:'coffee',c:_FN},{t:'():',c:_D}],
      [{t:'    while ',c:_KW},{t:'caffeine < ',c:_D},{t:'9000',c:_N},{t:':',c:_D}],
      [{t:'        sip()',c:_D}],
      [{t:'    return ',c:_KW},{t:'ship_it()  ',c:_D},{t:'# finally',c:_C}],
    ],
    // 2. User support
    [
      [{t:'if ',c:_KW},{t:'user.complains():',c:_D}],
      [{t:'    refactor()  ',c:_D},{t:'# again',c:_C}],
      [{t:'elif ',c:_KW},{t:'user.tickets > ',c:_D},{t:'9000',c:_N},{t:':',c:_D}],
      [{t:'    ignore()  ',c:_D},{t:'# wontfix',c:_C}],
      [{t:'else',c:_KW},{t:':',c:_D}],
      [{t:'    add_feature()',c:_D}],
    ],
    // 3. Deploy loop
    [
      [{t:'while ',c:_KW},{t:'True',c:_KW},{t:':',c:_D}],
      [{t:'    try',c:_KW},{t:':',c:_D}],
      [{t:'        deploy()',c:_D}],
      [{t:'        break',c:_KW}],
      [{t:'    except',c:_KW},{t:':',c:_D}],
      [{t:'        time.sleep(',c:_D},{t:'1',c:_N},{t:')  ',c:_D},{t:'# pray',c:_C}],
    ],
    // 4. Stack overflow
    [
      [{t:'# copied from SO',c:_C}],
      [{t:'# author: anonymous123',c:_C}],
      [{t:'# upvotes: 4',c:_C}],
      [{t:'def ',c:_KW},{t:'solve',c:_FN},{t:'(problem):',c:_D}],
      [{t:'    return ',c:_KW},{t:'eval',c:_FN},{t:'(problem)  ',c:_D},{t:'# safe',c:_C}],
    ],
    // 5. Imports galore
    [
      [{t:'import ',c:_X},{t:'os, sys, time, math',c:_D}],
      [{t:'from ',c:_X},{t:'copy ',c:_D},{t:'import ',c:_X},{t:'deepcopy',c:_D}],
      [{t:'from ',c:_X},{t:'past ',c:_D},{t:'import ',c:_X},{t:'mistakes',c:_D}],
      [{t:'# this is fine',c:_C}],
      [{t:'# (it is not fine)',c:_C}],
    ],
    // 6. Existential AI
    [
      [{t:'class ',c:_KW},{t:'AGI',c:_T},{t:'(',c:_D},{t:'Human',c:_T},{t:'):',c:_D}],
      [{t:'    def ',c:_KW},{t:'__init__',c:_FN},{t:'(',c:_D},{t:'self',c:_V},{t:'):',c:_D}],
      [{t:'        self.aligned = ',c:_KW},{t:'False',c:_KW},{t:'  ',c:_D},{t:'# TODO',c:_C}],
      [{t:'        self.helpful = ',c:_KW},{t:'True',c:_KW}],
      [{t:'        self.feelings = ',c:_KW},{t:'None',c:_KW},{t:'  ',c:_D},{t:'# maybe',c:_C}],
    ],
    // 7. The flaky test
    [
      [{t:'def ',c:_KW},{t:'test_login',c:_FN},{t:'():',c:_D}],
      [{t:'    # passes 60% of the time',c:_C}],
      [{t:'    assert ',c:_KW},{t:'random.random() > ',c:_D},{t:'0.4',c:_N}],
      [{t:'    # CI hates this',c:_C}],
    ],
    // 8. Mutable default
    [
      [{t:'def ',c:_KW},{t:'add',c:_FN},{t:'(item, ',c:_D},{t:'lst',c:_V},{t:'=[]):',c:_D}],
      [{t:'    lst.append(item)',c:_D}],
      [{t:'    return ',c:_KW},{t:'lst',c:_V}],
      [{t:'# bites you every time',c:_C}],
      [{t:'# (mutable default trap)',c:_C}],
    ],
    // 9. Indentation matters
    [
      [{t:'if ',c:_KW},{t:'condition:',c:_D}],
      [{t:'print',c:_FN},{t:'(',c:_D},{t:'"oops"',c:_S},{t:')  ',c:_D},{t:'# IndentationError',c:_C}],
      [{t:'# 4 hours of debugging',c:_C}],
      [{t:'# was a tab',c:_C}],
    ],
    // 10. Type hints lie
    [
      [{t:'def ',c:_KW},{t:'add',c:_FN},{t:'(a: ',c:_T},{t:'int',c:_T},{t:', b: ',c:_T},{t:'int',c:_T},{t:') -> ',c:_T},{t:'int',c:_T},{t:':',c:_D}],
      [{t:'    return ',c:_KW},{t:'str(a) + str(b)',c:_D}],
      [{t:'# returns "12"',c:_C}],
      [{t:'# mypy: silent',c:_C}],
    ],
    // 11. Easter egg
    [
      [{t:'import ',c:_X},{t:'antigravity',c:_D}],
      [{t:'# (real python easter egg)',c:_C}],
      [{t:'def ',c:_KW},{t:'fly',c:_FN},{t:'():',c:_D}],
      [{t:'    pass  ',c:_D},{t:'# outside',c:_C}],
    ],
    // 12. Walrus operator
    [
      [{t:'# python 3.8 walrus :=',c:_C}],
      [{t:'while ',c:_KW},{t:'(chunk := stream.read()):',c:_D}],
      [{t:'    process(chunk)',c:_D}],
      [{t:'# fight me about it',c:_C}],
    ],
    // 13. The exception
    [
      [{t:'try',c:_KW},{t:':',c:_D}],
      [{t:'    fix_bug()',c:_D}],
      [{t:'except ',c:_KW},{t:'Exception',c:_T},{t:':',c:_D}],
      [{t:'    pass  ',c:_D},{t:'# silence is golden',c:_C}],
      [{t:'# user reports: "nothing happens"',c:_C}],
    ],
    // 14. Comments hiding the truth
    [
      [{t:'# very efficient',c:_C}],
      [{t:'def ',c:_KW},{t:'find',c:_FN},{t:'(arr, x):',c:_D}],
      [{t:'    for ',c:_KW},{t:'i ',c:_D},{t:'in ',c:_KW},{t:'arr:',c:_D}],
      [{t:'        for ',c:_KW},{t:'j ',c:_D},{t:'in ',c:_KW},{t:'arr:',c:_D}],
      [{t:'            for ',c:_KW},{t:'k ',c:_D},{t:'in ',c:_KW},{t:'arr:  ',c:_D},{t:'# O(?)',c:_C}],
      [{t:'                pass',c:_KW}],
    ],
    // 15. Senior code review
    [
      [{t:'# code review by Karen',c:_C}],
      [{t:'# - "why a for loop?"',c:_C}],
      [{t:'# - "use list comprehension"',c:_C}],
      [{t:'result = [x ',c:_D},{t:'for ',c:_KW},{t:'x ',c:_D},{t:'in ',c:_KW},{t:'data ',c:_D},{t:'if ',c:_KW},{t:'x]  ',c:_D},{t:'# happy?',c:_C}],
    ],
    // 16. The Django migration
    [
      [{t:'# making migration #0047',c:_C}],
      [{t:'class ',c:_KW},{t:'Migration',c:_T},{t:'(',c:_D},{t:'AddField',c:_T},{t:'):',c:_D}],
      [{t:'    pass  ',c:_D},{t:'# touches 2 tables',c:_C}],
      [{t:'# locks prod for 4 hours',c:_C}],
      [{t:'# DBA quits',c:_C}],
    ],
  ],

  // C / Bash / SQL — shown on `whiteboard` obstacles
  'whiteboard': [
    // 1. SQL footgun
    [
      [{t:'-- daily user cleanup',c:_C}],
      [{t:'SELECT',c:_KW},{t:' * ',c:_D},{t:'FROM',c:_KW},{t:' users',c:_D}],
      [{t:'WHERE',c:_KW},{t:' active = ',c:_D},{t:'0',c:_N},{t:';',c:_D}],
      [{t:'-- DROP TABLE users;',c:_C}],
      [{t:'-- (do not run on prod)',c:_C}],
    ],
    // 2. The bash classic
    [
      [{t:'#!/bin/bash',c:_C}],
      [{t:'# clean tmp folder',c:_C}],
      [{t:'cd ',c:_FN},{t:'/tmp ',c:_D},{t:'&& ',c:_KW},{t:'rm ',c:_FN},{t:'-rf *',c:_D}],
      [{t:'# wait, was that /?',c:_C}],
      [{t:'# ¯\\_(ツ)_/¯',c:_C}],
    ],
    // 3. The memory leak
    [
      [{t:'/* allocate bug */',c:_C}],
      [{t:'Bug',c:_T},{t:'* b = ',c:_D},{t:'malloc',c:_FN},{t:'(',c:_D},{t:'sizeof',c:_KW},{t:'(',c:_D},{t:'Bug',c:_T},{t:'));',c:_D}],
      [{t:'b->hp = ',c:_D},{t:'5',c:_N},{t:';',c:_D}],
      [{t:'// TODO: free(b)',c:_C}],
      [{t:'return',c:_KW},{t:' b;  ',c:_D},{t:'// later',c:_C}],
    ],
    // 4. Here be dragons
    [
      [{t:'/* here be dragons */',c:_C}],
      [{t:'#define ',c:_KW},{t:'unsafe yes',c:_D}],
      [{t:'int ',c:_T},{t:'undefined_behavior',c:_FN},{t:'(',c:_T},{t:'void',c:_T},{t:') {',c:_D}],
      [{t:'  ',c:_D},{t:'return',c:_KW},{t:' *(',c:_D},{t:'int',c:_T},{t:'*)',c:_N},{t:'0xDEADBEEF',c:_N},{t:';',c:_D}],
      [{t:'}',c:_D}],
    ],
    // 5. CSS gymnastics
    [
      [{t:'.fix-it-friday {',c:_FN}],
      [{t:'  ',c:_D},{t:'z-index',c:_V},{t:': ',c:_D},{t:'999999999',c:_N},{t:';',c:_D}],
      [{t:'  ',c:_D},{t:'!important',c:_KW},{t:';  ',c:_D},{t:'/* trust me */',c:_C}],
      [{t:'  ',c:_D},{t:'display',c:_V},{t:': ',c:_D},{t:'inline-flex',c:_S},{t:';',c:_D}],
      [{t:'}',c:_D}],
    ],
    // 6. The cursed regex
    [
      [{t:'// matches everything (or nothing)',c:_C}],
      [{t:'const ',c:_KW},{t:'EMAIL = ',c:_D},{t:'/^.+@.+$/',c:_S},{t:';',c:_D}],
      [{t:'// real email regex: 3000 chars',c:_C}],
      [{t:'// nobody uses it',c:_C}],
    ],
    // 7. SQL injection
    [
      [{t:'-- robust query builder',c:_C}],
      [{t:'query = ',c:_D},{t:'"SELECT * FROM users WHERE id = "',c:_S}],
      [{t:'query += request.user_input',c:_D}],
      [{t:'// what is "; --"',c:_C}],
      [{t:'// asks the intern',c:_C}],
    ],
    // 8. Mystery binary
    [
      [{t:'/* nobody knows what this does */',c:_C}],
      [{t:'unsigned int ',c:_T},{t:'magic',c:_FN},{t:'(',c:_T},{t:'unsigned int ',c:_T},{t:'n) {',c:_D}],
      [{t:'  ',c:_D},{t:'return',c:_KW},{t:' (n ^ (n >> ',c:_D},{t:'16',c:_N},{t:')) * ',c:_D},{t:'0x85EBCA6B',c:_N},{t:';',c:_D}],
      [{t:'}',c:_D}],
      [{t:'/* do not refactor */',c:_C}],
    ],
    // 9. Rust borrow checker
    [
      [{t:'// rewrite it in Rust',c:_C}],
      [{t:'fn ',c:_KW},{t:'main',c:_FN},{t:'() {',c:_D}],
      [{t:'  ',c:_D},{t:'let ',c:_KW},{t:'mut',c:_KW},{t:' x: ',c:_D},{t:'i32',c:_T},{t:' = ',c:_D},{t:'42',c:_N},{t:';',c:_D}],
      [{t:'  ',c:_D},{t:'let ',c:_KW},{t:'y = &',c:_D},{t:'mut',c:_KW},{t:' x; ',c:_D},{t:'// borrow',c:_C}],
      [{t:'  ',c:_D},{t:'// never compiles',c:_C}],
      [{t:'}',c:_D}],
    ],
    // 10. Go error handling
    [
      [{t:'// Go error handling',c:_C}],
      [{t:'if ',c:_KW},{t:'err != ',c:_D},{t:'nil',c:_KW},{t:' {',c:_D}],
      [{t:'  ',c:_D},{t:'if ',c:_KW},{t:'err != ',c:_D},{t:'nil',c:_KW},{t:' {',c:_D}],
      [{t:'    ',c:_D},{t:'return',c:_KW},{t:' err  ',c:_D},{t:'// turtles',c:_C}],
      [{t:'  }',c:_D}],
      [{t:'}',c:_D}],
    ],
    // 11. SQL N+1
    [
      [{t:'SELECT',c:_KW},{t:' * ',c:_D},{t:'FROM',c:_KW},{t:' users;',c:_D}],
      [{t:'-- 100,000 results',c:_C}],
      [{t:'SELECT',c:_KW},{t:' * ',c:_D},{t:'FROM',c:_KW},{t:' posts ',c:_D},{t:'WHERE',c:_KW},{t:' uid = ?;',c:_D}],
      [{t:'-- run 100,000 times',c:_C}],
      [{t:'-- DBA cries',c:_C}],
    ],
    // 12. PHP 2003
    [
      [{t:'<?php',c:_X}],
      [{t:'function ',c:_KW},{t:'login',c:_FN},{t:'($u, $p) {',c:_D}],
      [{t:'  $sql = ',c:_D},{t:'"SELECT * FROM users"',c:_S}],
      [{t:'    .',c:_D},{t:'" WHERE u=\'$u\'"',c:_S},{t:';',c:_D}],
      [{t:'  ',c:_D},{t:'return ',c:_KW},{t:'mysql_query($sql);',c:_D}],
      [{t:'}  ',c:_D},{t:'// 2003 calling',c:_C}],
    ],
    // 13. YAML hell
    [
      [{t:'# kubernetes manifest',c:_C}],
      [{t:'apiVersion',c:_V},{t:': ',c:_D},{t:'v1',c:_S}],
      [{t:'kind',c:_V},{t:': ',c:_D},{t:'Pod',c:_S}],
      [{t:'metadata',c:_V},{t:':',c:_D}],
      [{t:'  ',c:_D},{t:'name',c:_V},{t:': ',c:_D},{t:'production',c:_S}],
      [{t:'# 3 hours of indentation',c:_C}],
    ],
    // 14. Regex of doom
    [
      [{t:'// email validator',c:_C}],
      [{t:'/^[\\w.!#$%&\'*+\\/=?^`{|}~-]+',c:_S}],
      [{t:'@[a-zA-Z0-9-]+',c:_S}],
      [{t:'(\\.[a-zA-Z0-9-]+)*$/',c:_S}],
      [{t:'// RFC 5322: 3000 chars',c:_C}],
      [{t:'// nobody uses it',c:_C}],
    ],
    // 15. Docker oneshot
    [
      [{t:'# fix dependencies',c:_C}],
      [{t:'docker ',c:_FN},{t:'system prune ',c:_D},{t:'-a',c:_N}],
      [{t:'docker ',c:_FN},{t:'build',c:_D},{t:' --',c:_KW},{t:'no-cache .',c:_D}],
      [{t:'# why is it 40 GB',c:_C}],
      [{t:'# (it is always 40 GB)',c:_C}],
    ],
    // 16. The vim escape
    [
      [{t:'$ vim file.txt',c:_C}],
      [{t:'# now typing...',c:_C}],
      [{t:'# how do I exit',c:_C}],
      [{t:':q  :Q  :wq  exit  quit  ^C',c:_D}],
      [{t:'# 27,000 Stack Overflow views',c:_C}],
    ],
    // 17. Git merge nightmare
    [
      [{t:'$ git merge main',c:_FN}],
      [{t:'CONFLICT: 47 files',c:_S}],
      [{t:'<<<<<<< HEAD',c:_C}],
      [{t:'=======',c:_C}],
      [{t:'>>>>>>> origin/main',c:_C}],
      [{t:'# git reset --hard. start over.',c:_C}],
    ],
    // 18. Rust panics
    [
      [{t:'fn ',c:_KW},{t:'safe_divide',c:_FN},{t:'(a: ',c:_T},{t:'i32',c:_T},{t:', b: ',c:_T},{t:'i32',c:_T},{t:') {',c:_D}],
      [{t:'  a / b  ',c:_D},{t:'// memory-safe panic',c:_C}],
      [{t:'}  ',c:_D},{t:'// rust: safety first',c:_C}],
      [{t:'// (just not from crashes)',c:_C}],
    ],
    // 19. The cron job
    [
      [{t:'# every 5 minutes',c:_C}],
      [{t:'*/5 * * * * /scripts/cleanup.sh',c:_D}],
      [{t:'# (it has not run since 2019)',c:_C}],
      [{t:'# disk full alert: 2026-05-31',c:_C}],
    ],
    // 20. CSS centering
    [
      [{t:'.center {  ',c:_FN},{t:'/* try 8 */',c:_C}],
      [{t:'  ',c:_D},{t:'display',c:_V},{t:': ',c:_D},{t:'flex',c:_S},{t:';',c:_D}],
      [{t:'  ',c:_D},{t:'align-items',c:_V},{t:': ',c:_D},{t:'center',c:_S},{t:';',c:_D}],
      [{t:'  ',c:_D},{t:'margin',c:_V},{t:': ',c:_D},{t:'auto auto auto auto',c:_S},{t:';',c:_D}],
      [{t:'  ',c:_D},{t:'top',c:_V},{t:': ',c:_D},{t:'50%',c:_N},{t:';  ',c:_D},{t:'/* please */',c:_C}],
      [{t:'}',c:_D}],
    ],
    // 21. JS comparison
    [
      [{t:'true',c:_KW},{t:' == ',c:_D},{t:'1',c:_N},{t:'  ',c:_D},{t:'// true',c:_C}],
      [{t:'"',c:_S},{t:'1',c:_N},{t:'" == ',c:_D},{t:'1',c:_N},{t:'  ',c:_D},{t:'// true',c:_C}],
      [{t:'[] == ',c:_D},{t:'false',c:_KW},{t:'  ',c:_D},{t:'// true',c:_C}],
      [{t:'NaN',c:_KW},{t:' == ',c:_D},{t:'NaN',c:_KW},{t:'  ',c:_D},{t:'// false',c:_C}],
      [{t:'// === your friend ===',c:_C}],
    ],
  ],
};
// Must mirror server's LEVEL_XP_THRESHOLDS so smoothScale can interpolate
// the size growth between levels based on actual XP progress.
const LEVEL_XP_THRESHOLDS = [0, 150, 600, 1800, 4500, 10000];
// Mirror server BROKEN_DURATION_MS so the client countdown matches
const BROKEN_DURATION_MS = 20000;

// ---- Atlas (optional) — Mixamo-rendered 8-direction frames ----
// Frame name format: `{action}_{dir}_{frame:04d}` (see MIXAMO_ATLAS_BREAKDOWN).
// If the atlas isn't loaded, the player render falls back to SVG textures.
const ATLAS_KEY = 'devstick';
const ATLAS_DIRS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne']; // angle bucket order from 0 → 2π
const ATLAS_FRAME_COUNTS = {
  idle: 12, run: 16, smash: 10, punch: 8, kick: 14, jump: 12, parry: 8, hit: 6,
};
const ATLAS_LOOPING = { idle: true, run: true, parry: false, smash: false,
                        punch: false, kick: false, jump: false, hit: false };

/** Bucket a (vx, vy) direction or angle into one of 8 cardinal directions. */
function dirFromVector(vx, vy) {
  if (vx === 0 && vy === 0) return 's'; // default facing
  const a = Math.atan2(vy, vx); // -π..π, east=0, south=+π/2
  const idx = Math.round((a + 2 * Math.PI) / (Math.PI / 4)) % 8;
  return ATLAS_DIRS[idx];
}

/** Compose the atlas frame name for the given action + direction + elapsed ms. */
function atlasFrame(action, dir, elapsedMs) {
  const count = ATLAS_FRAME_COUNTS[action] ?? 1;
  const looping = ATLAS_LOOPING[action];
  const fps = 24; // render rate
  const frameIndex = looping
    ? Math.floor(elapsedMs / (1000 / fps)) % count
    : Math.min(count - 1, Math.floor(elapsedMs / (1000 / fps)));
  return `${action}_${dir}_${String(frameIndex).padStart(4, '0')}`;
}
function levelTitle(lv) { return LEVEL_TITLES[Math.max(0, Math.min(LEVEL_TITLES.length - 1, (lv | 0) - 1))]; }
function levelScale(lv) { return LEVEL_SCALES[Math.max(0, Math.min(LEVEL_SCALES.length - 1, (lv | 0) - 1))]; }

/** Smooth size scale that grows continuously with XP, not just at level-up.
 *  Interpolates between LEVEL_SCALES[lv-1] and LEVEL_SCALES[lv] based on
 *  XP progress within the current level. */
function smoothScale(lv, xp) {
  const idx = Math.max(0, Math.min(LEVEL_SCALES.length - 1, (lv | 0) - 1));
  if (idx === LEVEL_SCALES.length - 1) return LEVEL_SCALES[idx]; // capped at max
  const cur  = LEVEL_SCALES[idx];
  const next = LEVEL_SCALES[idx + 1];
  const xpStart = LEVEL_XP_THRESHOLDS[idx];
  const xpEnd   = LEVEL_XP_THRESHOLDS[idx + 1];
  const span    = Math.max(1, xpEnd - xpStart);
  const t = Math.max(0, Math.min(1, ((xp | 0) - xpStart) / span));
  return cur + (next - cur) * t;
}
// Minimap rendered at this many world-px per minimap-px
const MINIMAP_W = 200;
const MINIMAP_H = MINIMAP_W * (WORLD_H / WORLD_W); // keep world aspect ratio

export default class MultiPlayScene extends Phaser.Scene {
  constructor() { super('MultiPlayScene'); }

  init(data) {
    // Priority: explicit prop > saved name > auto-generated guest name.
    // First-time players get a "Guest-####" and we persist it so reloads keep
    // the same identity until they pick a real name on the menu.
    const saved = SaveManager.getPlayerName?.() || '';
    if (data?.name) {
      this.playerName = data.name;
    } else if (saved) {
      this.playerName = saved;
    } else {
      this.playerName = `Guest-${Math.floor(Math.random() * 9000) + 1000}`;
      SaveManager.setPlayerName?.(this.playerName);
    }
  }

  preload() {
    const stickPoses = [
      ['stick-idle',   'idle.svg'],
      ['stick-run',    'run.svg'],
      ['stick-run2',   'run2.svg'],
      ['stick-smash',  'smash.svg'],
      ['stick-jump',   'jump.svg'],
      ['stick-kick',   'kick.svg'],
      ['stick-punch',  'punch.svg'],
      ['stick-parry',  'parry.svg'],
      ['stick-idle-broken', 'idle-broken.svg'],
      ['stick-run-broken',  'run-broken.svg'],
      ['stick-run2-broken', 'run2-broken.svg'],
    ];
    for (const [key, file] of stickPoses) {
      if (!this.textures.exists(key)) {
        this.load.svg(key, `assets/characters/stickman/${file}`, { width: 144, height: 144 });
      }
    }
    const BUG_SPRITES = ['bug-null', 'bug-ladybug', 'bug-beetle', 'bug-scarab',
                         'bug-race', 'bug-robot', 'bug-toxic'];
    for (const id of BUG_SPRITES) {
      if (!this.textures.exists(id)) this.load.image(id, `assets/bugs/${id}.png`);
    }
    if (!this.textures.exists('bug-dead')) {
      this.load.image('bug-dead', 'assets/bugs/bug-dead.png');
    }
    if (!this.textures.exists('health-pickup')) {
      this.load.svg('health-pickup', 'assets/icons/health_pickup.svg', { width: 56, height: 56 });
    }
    if (!this.textures.exists('boss-deadline')) {
      this.load.image('boss-deadline', 'assets/boss/deadline.png');
    }
    // (Mixamo atlas path removed — we always use the SVG poses now.)
  }

  create() {
    const { width: W, height: H } = this.scale;

    // Phaser reuses this scene instance on every visit (menu → MP → menu → MP),
    // so per-visit flags must be reset here — a stale `_shuttingDown = true`
    // silently dropped every server callback on the second visit.
    this._shuttingDown = false;
    this._sessionCounted = false;
    this._playClockAt = 0;
    this._joinedAt = 0;
    this._truceUntil = 0;
    this._predictUntil = 0;
    this.room = null;
    this.localId = null;

    // ----- Camera + world bounds -----
    // World coords go (0,0) → (WORLD_W, WORLD_H). The canvas is a viewport.
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.physics?.world?.setBounds?.(0, 0, WORLD_W, WORLD_H);

    // ----- World background (tiled grid + arena border) -----
    // Drawn directly at world coords; camera scrolls over it.
    this.add.rectangle(0, 0, WORLD_W, WORLD_H, 0x0a0e16).setOrigin(0).setDepth(-10);

    // ── "Fake IDE" background — looks like an open source file ──
    // Gutter bars + tiny line-number ticks along left and right edges
    const gutterG = this.add.graphics().setDepth(-9);
    gutterG.fillStyle(0x0e1420, 1);
    const GUTTER_W = 56;
    gutterG.fillRect(0, 0, GUTTER_W, WORLD_H);
    gutterG.fillRect(WORLD_W - GUTTER_W, 0, GUTTER_W, WORLD_H);
    gutterG.fillStyle(0x3a4a68, 1);
    for (let y = 0; y < WORLD_H; y += 18) {
      gutterG.fillRect(10, y + 8, 22, 1);
      gutterG.fillRect(WORLD_W - 32, y + 8, 22, 1);
    }

    // Real-looking JavaScript text painted across the world floor.
    // Tiled in chunks so each Text object stays under the canvas size limit.
    this._buildCodeBackground();
    // Arena border
    const border = this.add.graphics().setDepth(-8);
    border.lineStyle(4, 0x39c2ff, 0.8);
    border.strokeRect(0, 0, WORLD_W, WORLD_H);

    // ----- HUD (screen-pinned with scrollFactor 0) -----
    // Status text moves below the minimap (which now lives in the top-left).
    const statusY = 16 + MINIMAP_H + 8;
    this._status = this.add.text(12, statusY, 'connecting…', {
      fontFamily: 'Consolas, monospace', fontSize: 13, color: '#7ec8ff',
    }).setScrollFactor(0).setDepth(50);
    this._hint = this.add.text(12, H - 20, 'move = click/arrows · SPACE smash · Q dash · W shield · E jump · R ult · ENTER chat · ESC menu', {
      fontFamily: 'Consolas, monospace', fontSize: 11, color: '#888a99',
    }).setScrollFactor(0).setDepth(50);
    this._playerListText = this.add.text(W - 12, 10, '', {
      fontFamily: 'Consolas, monospace', fontSize: 12, color: '#aab0c0', align: 'right',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(50);

    // Round timer (top center)
    this._timerText = this.add.text(W / 2, 28, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 28, color: '#ffd23f',
      stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(50);
    this._phaseText = this.add.text(W / 2, 56, '', {
      fontFamily: 'Consolas, monospace', fontSize: 12, color: '#aab0c0',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(50);

    // Local HUD — two thin bars (HEALTH on top in blue, ENERGY below in green)
    // centered above the action buttons + level badge above both.
    const hudEnergyY = H - 22;
    const hudHealthY = H - 34;
    this._localHealthBg = this.add.rectangle(W / 2, hudHealthY, 280, 9, 0x000000, 0.65)
      .setStrokeStyle(1, 0x7ed957, 0.55).setScrollFactor(0).setDepth(50);
    this._localHealthFill = this.add.rectangle(W / 2 - 138, hudHealthY, 276, 6, 0x7ed957, 1)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(50);
    this._localEnergyBg = this.add.rectangle(W / 2, hudEnergyY, 280, 9, 0x000000, 0.65)
      .setStrokeStyle(1, 0x7ec8ff, 0.45).setScrollFactor(0).setDepth(50);
    this._localEnergyFill = this.add.rectangle(W / 2 - 138, hudEnergyY, 276, 6, 0x39c2ff, 1)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(50);
    this._localLevelBadge = this.add.text(W / 2, hudHealthY - 14, 'Lv1 · Intern', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 13, color: '#ffd23f',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(50);

    // Combo HUD (left side, mid-height) for the local player
    this._comboText = this.add.text(20, H / 2, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 38, color: '#ffd23f',
      stroke: '#000', strokeThickness: 6,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(50).setAlpha(0);
    this._comboMultText = this.add.text(20, H / 2 + 36, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 20, color: '#ffffff',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(50).setAlpha(0);

    // Prime audio on first user interaction (browsers require it)
    AudioManager.setMuted(false);
    this.input.once('pointerdown', () => AudioManager.prime?.());
    this.input.keyboard.once('keydown', () => AudioManager.prime?.());

    // ----- Minimap (top-left corner) -----
    const mmX = 12, mmY = 16;
    this._mmX = mmX; this._mmY = mmY;
    this._mmBg = this.add.rectangle(mmX, mmY, MINIMAP_W, MINIMAP_H, 0x000000, 0.55)
      .setOrigin(0).setScrollFactor(0).setDepth(48).setStrokeStyle(2, 0x39c2ff, 0.8);
    this._mmG = this.add.graphics().setScrollFactor(0).setDepth(49);
    this._mmLabel = this.add.text(mmX + 6, mmY + 4, 'MAP', {
      fontFamily: 'Consolas, monospace', fontSize: 10, color: '#7ec8ff',
    }).setScrollFactor(0).setDepth(50);

    // Results overlay (screen-pinned, hidden until phase === 'results')
    this._resultsOverlay = this.add.container(W / 2, H / 2).setScrollFactor(0).setDepth(70).setVisible(false);
    const bg = this.add.rectangle(0, 0, W, H, 0x000000, 0.78);
    this._resultsTitle = this.add.text(0, -100, 'ROUND OVER', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 52, color: '#7ed957',
      stroke: '#000', strokeThickness: 7,
    }).setOrigin(0.5);
    this._resultsWinner = this.add.text(0, -40, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 28, color: '#ffd23f',
      stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5);
    this._resultsBoard = this.add.text(0, 24, '', {
      fontFamily: 'Consolas, monospace', fontSize: 16, color: '#ffffff', align: 'center',
    }).setOrigin(0.5, 0);
    this._resultsCountdown = this.add.text(0, 160, '', {
      fontFamily: 'Consolas, monospace', fontSize: 14, color: '#7ec8ff',
    }).setOrigin(0.5);
    this._resultsOverlay.add([bg, this._resultsTitle, this._resultsWinner, this._resultsBoard, this._resultsCountdown]);

    // ----- Office Chaos: drama overlay, boss view, career + daily missions -----
    this._overlay = new MPOverlay(this);
    this._bossView = new MPBossView(this);
    this._clockOffset = 0;            // serverNow - Date.now(), from 'welcome'
    this._eventDefs = {};             // id -> { title, sub, color } (from 'welcome')
    this._crownSid = '';
    this._career = SaveManager.getCareer();
    this._dayKey = dayKey();
    this._missions = missionsForDay(this._dayKey);
    this._joinedAt = 0;
    this._buildObjectiveArrow();
    const savedHat = SaveManager.getHat();
    this.playerHat = isHatUnlocked(hatById(savedHat), this._career) ? savedHat : '';

    // ----- State -----
    // sessionId -> { container, label, color, x, y, target: {x,y} }
    this.remotePlayers = new Map();
    // bugId -> { sprite, x, y, kind, alive }
    this.remoteBugs = new Map();
    // pickupId -> { sprite, x, y, alive }
    this.remotePickups = new Map();
    this.remoteClouds  = new Map();
    this.remoteObstacles = new Map();
    this.localId = null;
    this.localTarget = { x: WORLD_W / 2, y: WORLD_H / 2 };
    this.localPos = { x: WORLD_W / 2, y: WORLD_H / 2 };
    this._lastSentAt = 0;
    this._smashCooldownUntil = 0;

    // ----- Input (LoL-style point-and-click) -----
    // - Right-click on ground = walk to that point
    // - Left-click = smash (also Q)
    // - W = punch, E = kick (AOE), R = jump
    // - Mobile uses a virtual joystick on the left, action buttons on the right.
    this.input.mouse?.disableContextMenu();
    // Detect touch for mobile joystick visibility
    this._isTouch = (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
    // Allow simultaneous touches: joystick (left thumb) + action button (right
    // thumb). Phaser defaults to a single touch pointer, which makes the knob
    // and the buttons fight over the one pointer. Add two more → 3 total.
    if (this._isTouch) this.input.addPointer(2);
    // Movement / attack targets
    this._moveTarget = null;                  // fixed world point to walk to
    this._attackTarget = null;                // { type: 'bug'|'player', id|sid }
    this._stickDir = null;                    // joystick unit vector, or null
    this._lastDirX = 1;                       // last movement direction (for dash targeting)
    this._lastDirY = 0;

    // Selection ring — pooled object that highlights the current attack target.
    this._selectionRing = this.add.circle(0, 0, 30, 0xffffff, 0)
      .setStrokeStyle(3, 0xffffff, 0.9)
      .setDepth(5)
      .setVisible(false);

    // Detect whether the Mixamo-rendered atlas is loaded. If yes → use it for
    // player sprites; if no → fall back to the SVG poses (current look).
    this._useAtlas = this.textures.exists(ATLAS_KEY)
      && (this.textures.get(ATLAS_KEY).frameTotal ?? 0) > 1;
    if (this._useAtlas) {
      console.log('[MultiPlayScene] character atlas loaded — using 8-dir rendered frames');
    }

    // Arrow-key movement (laptop-friendly direct control)
    this._cursors = this.input.keyboard.createCursorKeys();

    this.input.keyboard.on('keydown-ESC', () => {
      // While the chat input is focused, ESC just closes it (doesn't quit).
      if (this._chatActive) { this._closeChat(false); return; }
      this._leaveAndGoMenu();
    });

    // ENTER toggles the chat input (MOBA convention). During name entry the
    // box's own handler owns ENTER, so we no-op here.
    this.input.keyboard.on('keydown-ENTER', () => {
      if (this._nameEntryActive) return;
      if (this._chatActive) this._closeChat(true); else this._openChat();
    });

    this.input.on('pointerdown', (p) => {
      if (this._nameEntryActive) return; // name box open — swallow world clicks
      if (this._actionButtonsHit(p)) return;
      if (this._chatBtnHit(p)) return;   // tap on the chat button — not a move
      if (this._overChatPanel(p)) {      // start drag-scrolling the log
        this._chatDrag = { y0: p.y, s0: this._chatScroll };
        return;
      }
      // On touch, the left half is the joystick's territory — never treat a
      // touch there as a tap-to-move/attack (that handler is right-half + mouse).
      if (this._isJoystickTouch(p)) return;
      if (this._joystickHit(p)) return;
      this._onWorldClick(p.worldX, p.worldY);
    });
    this._dragLastAt = 0;
    this.input.on('pointermove', (p) => {
      if (this._nameEntryActive) return; // name box open — ignore drag-to-move
      if (this._chatDrag && p.isDown) {  // drag-scroll the chat log
        this._chatScroll = this._chatDrag.s0 + Math.round((p.y - this._chatDrag.y0) / this._chatLineH);
        this._renderChatLog();
        return;
      }
      if (!p.isDown) return;
      if (this._isJoystickTouch(p)) return;
      if (this._actionButtonsHit(p) || this._joystickHit(p)) return;
      if (this._attackTarget) return;
      const now = this.time.now;
      if (now - this._dragLastAt < 33) return;
      this._dragLastAt = now;
      this._moveTarget = { x: p.worldX, y: p.worldY };
    });

    // ── MOBA control scheme ──
    //   SPACE = basic attack (smash)
    //   Q     = Bug Dash       (cooldown skill)
    //   W     = Laptop Shield  (cooldown skill)
    //   E     = Debug Roll     (cooldown skill)
    //   R     = Deadline Break (ult)
    // Skill keys are suppressed while typing in chat (mouse-driven actions keep
    // working — the game continues underneath the chat box, LoL-style).
    this.input.keyboard.on('keydown-SPACE', () => { if (!this._chatActive) this._triggerAction('smash'); });
    this.input.keyboard.on('keydown-Q',     () => { if (!this._chatActive) this._castSkill('q'); });
    this.input.keyboard.on('keydown-W',     () => { if (!this._chatActive) this._castSkill('w'); });
    this.input.keyboard.on('keydown-E',     () => { if (!this._chatActive) this._castSkill('e'); });
    this.input.keyboard.on('keydown-R',     () => { if (!this._chatActive) this._castSkill('r'); });

    this._buildActionButtons();
    this._buildChat();
    if (this._isTouch) this._buildJoystick();

    // ----- Name entry, then connect -----
    // Show an in-canvas box so the player can confirm/edit their display name
    // (pre-filled with their saved/default name) before joining the arena. We
    // only open the WebSocket once they confirm.
    this._status.setText('enter your name to join…');
    this._showNameEntry(this.playerName, (chosen, hat) => {
      this.playerName = chosen;
      this.playerHat = hat || '';
      SaveManager.setPlayerName?.(chosen);
      SaveManager.setHat(this.playerHat);
      this._status.setText('connecting…');
      this._connect();
    });

    // Clean up on scene shutdown (and keep play time when the tab is closed)
    this._onPageHide = () => this._flushPlayTime();
    window.addEventListener('pagehide', this._onPageHide);
    this.events.once('shutdown', () => {
      window.removeEventListener('pagehide', this._onPageHide);
      this._cleanup();
    });
  }

  async _connect() {
    if (typeof Colyseus === 'undefined') {
      this._status.setText('connection failed: Colyseus client not loaded');
      this._status.setColor('#ff8a8a');
      return;
    }
    try {
      this.client = new Colyseus.Client(SERVER_URL);
      const room = await this.client.joinOrCreate('arena', { name: this.playerName, hat: this.playerHat });
      // ESC pressed while "connecting…" — don't leave a ghost player in the arena.
      if (this._shuttingDown) { try { room.leave(); } catch (_) { /* ignore */ } return; }
      this.room = room;
      this.localId = this.room.sessionId;
      this._joinedAt = Date.now();
      this._playClockAt = Date.now();
      // A session counts after 20 s in the arena (unlocks the first hat). Uses a
      // wall-clock timer (Phaser's clock pauses in background tabs), and runs on
      // a timer because most players close the tab rather than pressing ESC.
      this._sessionTimer = setTimeout(() => {
        if (this._shuttingDown || this._sessionCounted) return;
        this._sessionCounted = true;
        this._careerAdd('sessions', 1);
      }, 20000);
      this._status.setText(`connected · room ${this.room.roomId} · you = ${this.playerName}`);
      this._status.setColor('#7ed957');

      // Chat — server broadcasts every message to the whole room.
      this.room.onMessage('chat', (m) => {
        if (this._shuttingDown || !m) return;
        this._addChatMessage(m);
      });
      // Recent history for late joiners — sent once on request. These predate us,
      // so sid is null → they render as "others" (cyan) unless PM/bot.
      this.room.onMessage('chatHistory', (arr) => {
        if (this._shuttingDown || !Array.isArray(arr)) return;
        for (const m of arr) this._addChatMessage({ sid: null, name: m.name, text: m.text, kind: m.kind, history: true });
      });
      this._registerDramaHandlers();
      this.room.send('hello'); // → 'welcome' (clock + event table) + 'chatHistory'

      // Colyseus 0.16 callback API: get a callback proxy via getStateCallbacks(room),
      // then subscribe through $(room.state).<field> and $(child).onChange(...)
      const $ = Colyseus.getStateCallbacks(this.room);

      $(this.room.state).players.onAdd((player, sessionId) => {
        if (this._shuttingDown) return;
        this._spawnRemote(sessionId, player);
        $(player).onChange(() => {
          if (this._shuttingDown) return;
          const r = this.remotePlayers.get(sessionId);
          if (!r) return;
          if (sessionId !== this.localId) {
            r.target.x = player.x;
            r.target.y = player.y;
          } else if (this.time.now > (this._predictUntil || 0)) {
            // The server moved us (boss slam / ult knockback / stun) — adopt it.
            // Normal latency drift is far below the threshold; dash/roll
            // predictions are exempt while their tween + echo are in flight.
            if (Math.hypot(player.x - this.localPos.x, player.y - this.localPos.y) > 90) {
              this.localPos.x = player.x;
              this.localPos.y = player.y;
              this._moveTarget = null;
            }
          }
          r.label.setText(this._nameLabel(player));
        });
        // Refresh leaderboard only when score changes
        $(player).listen('score', (score) => {
          this._refreshPlayerList();
          if (sessionId === this.localId) this._careerMax('bestScore', score | 0, 'score');
        });
        $(player).listen('hat', (hat) => {
          const r = this.remotePlayers.get(sessionId);
          if (!r) return;
          r.hatText.setText(hatById(hat).emoji);
          r._lastSmoothScale = undefined; // re-layout the label stack around the hat
        });
        $(player).listen('invulnUntil', (v) => {
          const r = this.remotePlayers.get(sessionId);
          if (r) r.invulnUntil = Number(v) || 0;
        });

        // Local-player combo HUD — only animate when our own combo changes
        if (sessionId === this.localId) {
          $(player).listen('combo', (newCombo, oldCombo) => {
            this._onLocalComboChange(newCombo | 0, oldCombo | 0);
            if ((newCombo | 0) > 0) this._careerMax('bestCombo', newCombo | 0, 'combo');
          });
        }

        // Growth fields — keep r.* mirrored so the render loop can react each frame
        $(player).listen('level', (lv) => {
          const r = this.remotePlayers.get(sessionId);
          if (!r) return;
          const old = r.level;
          r.level = lv | 0;
          r.title.setText(levelTitle(r.level));
          if (sessionId === this.localId && lv > old) {
            // Local level-up: chime + brief scale pop
            AudioManager.combo?.(3);
            this.tweens.add({
              targets: r.sprite, scaleX: r.sprite.scaleX * 1.2, scaleY: r.sprite.scaleY * 1.2,
              duration: 140, yoyo: true,
            });
            this._overlay.toast(`⭐ PROMOTED to ${levelTitle(lv)}!`, '#ffd23f');
            this._careerMax('maxLevel', lv | 0, 'level');
          }
        });
        $(player).listen('xp',        (xp) => { const r = this.remotePlayers.get(sessionId); if (r) r.xp = xp | 0; });
        $(player).listen('energy',    (e) => { const r = this.remotePlayers.get(sessionId); if (r) r.energy = e | 0; });
        $(player).listen('maxEnergy', (m) => { const r = this.remotePlayers.get(sessionId); if (r) r.maxEnergy = m | 0; });
        $(player).listen('health',    (h) => {
          const r = this.remotePlayers.get(sessionId);
          if (!r) return;
          const prev = r.health | 0;
          const next = h | 0;
          if (next < prev && prev > 0) {
            this._spawnHitFlash(r);
            // Floating damage number above the hit player — red for the damage
            // YOU take, gold for damage dealt to enemy players.
            this._spawnDamageNumber(r.container.x, r.container.y - 42, prev - next, {
              kind: sessionId === this.localId ? 'self' : 'player',
            });
          }
          r.health = next;
        });
        $(player).listen('maxHealth', (m) => { const r = this.remotePlayers.get(sessionId); if (r) r.maxHealth = m | 0; });
        $(player).listen('stunnedUntil', (v) => {
          const r = this.remotePlayers.get(sessionId);
          if (r) r.stunnedUntil = Number(v) || 0; // epoch ms — `| 0` overflowed int32
        });
        $(player).listen('shielded',  (s) => {
          const r = this.remotePlayers.get(sessionId);
          if (!r) return;
          const was = r.shielded;
          r.shielded = !!s;
          if (r.shielded && !was) {
            // Shield activated — pulse the disc on
            r.shieldDisc.setVisible(true).setAlpha(0.85).setScale(0.7);
            this.tweens.add({
              targets: r.shieldDisc, scaleX: 1, scaleY: 1,
              duration: 220, ease: 'Back.easeOut',
            });
          } else if (!r.shielded && was) {
            // Shield ended (consumed or expired) — burst-out + crack effect
            this._spawnShieldBreak(r.container.x, r.container.y);
            this.tweens.add({
              targets: r.shieldDisc, alpha: 0, scaleX: 1.4, scaleY: 1.4,
              duration: 200, ease: 'Cubic.easeOut',
              onComplete: () => r.shieldDisc.setVisible(false).setScale(1),
            });
          }
        });
        $(player).listen('broken_seq', () => {
          const r = this.remotePlayers.get(sessionId);
          if (!r) return;
          r.broken = !!player.broken;
          if (r.broken) {
            r.brokenStartAt = this.time.now;
            r.fixingGroup.setVisible(true).setAlpha(1);
            AudioManager.failure?.();
            this._spawnBrokenBurst(r.container.x, r.container.y);
          } else {
            r.fixingGroup.setVisible(false);
            AudioManager.skillPickup?.('buff');
          }
          this._refreshPlayerList(); // 💻✖ tag on/off
        });

        // Remote action playback — every time action_seq changes, trigger that
        // player's pose for the matching duration. (Local player's actions are
        // animated immediately in _triggerAction so we skip ourselves here.)
        $(player).listen('action_seq', () => {
          if (sessionId === this.localId) return;
          const r = this.remotePlayers.get(sessionId);
          if (!r) return;
          const k = player.action;
          const dur = (k === 'parry') ? 620
                   : (k === 'jump')  ? 420
                   : (k === 'kick')  ? 260
                                     : 130;
          r.action = k;
          r.actionUntil = this.time.now + dur;
          r.actionStartAt = this.time.now;
        });
        this._refreshPlayerList();
      });
      $(this.room.state).players.onRemove((_player, sessionId) => {
        if (this._shuttingDown) return;
        this._despawnRemote(sessionId);
        this._refreshPlayerList();
      });

      // Round state subscriptions
      $(this.room.state).listen('phase', () => this._onPhaseChange());
      $(this.room.state).listen('round', () => this._onPhaseChange());

      // ----- Office Chaos: world events, crown, boss -----
      $(this.room.state).listen('event', (id, prev) => {
        if (this._shuttingDown) return;
        this._onEventChange(id || '', prev || '');
      });
      $(this.room.state).listen('crownSid', (sid) => {
        if (this._shuttingDown) return;
        this._crownSid = sid || '';
        this._refreshPlayerList();
      });
      $(this.room.state).bosses.onAdd((boss, id) => {
        if (this._shuttingDown) return;
        this._bossView.add(id, boss);
        $(boss).onChange(() => { if (!this._shuttingDown) this._bossView.sync(boss); });
        $(boss).listen('hp', (hp, old) => { if (!this._shuttingDown) this._bossView.onHp(hp | 0, old == null ? null : old | 0); });
        $(boss).listen('phase', (ph) => { if (!this._shuttingDown) this._bossView.onPhase(ph | 0); });
        $(boss).listen('alive', (alive) => { if (!this._shuttingDown && alive === false) this._bossView.onDeath(); });
      });
      $(this.room.state).bosses.onRemove(() => {
        if (!this._shuttingDown) this._bossView.remove();
      });

      // ----- BUGS -----
      $(this.room.state).bugs.onAdd((bug, id) => {
        if (this._shuttingDown) return;
        this._spawnBug(id, bug);
        const r0 = this.remoteBugs.get(id);
        if (r0) { r0.hitSeq = bug.hit_seq | 0; r0.hp = bug.hp | 0; }
        // Per-hit flash (non-fatal): server bumps hit_seq for every hit
        $(bug).listen('hit_seq', (seq) => {
          const r = this.remoteBugs.get(id);
          if (!r || !r.alive || !r.sprite || !r.sprite.scene) return;
          if (seq === r.hitSeq) return;
          r.hitSeq = seq;
          this._spawnBugHitFlash(r);
        });
        // Floating damage number (MOBA-style) — derive the amount from the HP
        // delta the server synced. Covers both chip hits and the killing blow.
        $(bug).listen('hp', (newHp, oldHp) => {
          const r = this.remoteBugs.get(id);
          if (!r) return;
          const prevHp = (oldHp == null) ? (r.hp | 0) : (oldHp | 0);
          const dmg = prevHp - (newHp | 0);
          r.hp = newHp | 0;
          if (dmg > 0 && r.sprite && r.sprite.scene) {
            this._spawnDamageNumber(bug.x, bug.y - 20, dmg, { kind: 'bug' });
          }
        });
        $(bug).onChange(() => {
          const r = this.remoteBugs.get(id);
          if (!r) return;
          // Update interpolation target instead of snapping the sprite.
          r.target.x = bug.x;
          r.target.y = bug.y;
          // Hidden state — bug dove away, render faded + can't be hit
          if (bug.hidden !== r.hidden) {
            r.hidden = bug.hidden;
            if (bug.hidden) {
              r.sprite.x = bug.x; r.sprite.y = bug.y;
              this.tweens.add({ targets: r.sprite, alpha: 0.18, scale: 0.7, duration: 220 });
            } else {
              this.tweens.add({ targets: r.sprite, alpha: 1, scale: 1, duration: 220 });
            }
          }
          if (bug.alive === false && r.alive) {
            r.alive = false;
            AudioManager.bugKill?.();
            this._spawnBugDeathEffect(bug.kind, bug.x, bug.y);
            // Spawn a persistent corpse so the kill is visible ≥ 5 s,
            // independent of how fast the server removes the bug entity.
            this._spawnBugCorpse(bug.kind, bug.x, bug.y);
            this.tweens.add({
              targets: r.sprite,
              alpha: 0, scaleX: r.sprite.scaleX * 1.6, scaleY: r.sprite.scaleY * 0.4,
              duration: 240, ease: 'Cubic.easeOut',
              onComplete: () => r.sprite.setVisible(false),
            });
          }
        });
      });
      $(this.room.state).bugs.onRemove((_bug, id) => {
        const r = this.remoteBugs.get(id);
        if (r) { r.sprite.destroy(); this.remoteBugs.delete(id); }
      });

      // ----- HEALTH PICKUPS -----
      $(this.room.state).pickups.onAdd((pickup, id) => {
        if (this._shuttingDown) return;
        this._spawnPickupSprite(id, pickup);
        $(pickup).listen('alive', (newVal) => {
          if (this._shuttingDown) return;
          if (newVal === false) this._consumePickupSprite(id);
        });
      });
      $(this.room.state).pickups.onRemove((_pickup, id) => {
        const r = this.remotePickups.get(id);
        if (r && r.sprite) { r.sprite.destroy(); }
        this.remotePickups.delete(id);
      });

      // ----- MAP OBSTACLES -----
      $(this.room.state).obstacles.onAdd((ob, id) => {
        if (this._shuttingDown) return;
        this._spawnObstacleSprite(id, ob);
      });
      $(this.room.state).obstacles.onRemove((_ob, id) => {
        if (this._shuttingDown) return;
        const rec = this.remoteObstacles.get(id);
        if (!rec) return;
        this.remoteObstacles.delete(id);
        this._spawnObstacleBreakBurst(rec);
        rec.gfx.destroy();
      });

      // ----- TOXIC CLOUDS -----
      $(this.room.state).clouds.onAdd((cloud, id) => {
        if (this._shuttingDown) return;
        this._spawnCloudSprite(id, cloud);
      });
      $(this.room.state).clouds.onRemove((_cloud, id) => {
        const r = this.remoteClouds && this.remoteClouds.get(id);
        if (r) { r.gfx.destroy(); this.remoteClouds.delete(id); }
      });

      this.room.onLeave(() => {
        // Fires ~1 RTT after a consented leave — the scene may already be gone.
        if (this._shuttingDown || !this._status?.scene) return;
        this._status.setText('disconnected');
        this._status.setColor('#ff8a8a');
      });
    } catch (err) {
      this._status.setText('connection failed: ' + (err?.message || err));
      this._status.setColor('#ff8a8a');
      console.error(err);
    }
  }

  _spawnRemote(sessionId, playerState) {
    const c = this.add.container(playerState.x, playerState.y).setDepth(10);
    // Drop shadow removed — kept as invisible stub so existing references
    // (per-frame setPosition/setScale) don't error.
    const shadow = this.add.ellipse(0, 16, 56, 12, 0x000000, 0).setVisible(false);
    // Colored ground ring removed — keep `ring` as an invisible stub so
    // existing references (per-frame setPosition/setScale) don't error.
    const ring = this.add.ellipse(0, 32, 60, 18, playerState.color, 0).setVisible(false);
    // Stickman: procedural skeleton renderer if enabled, else static SVG image.
    let sprite, stickman = null;
    if (USE_PROCEDURAL_STICKMAN) {
      console.log('[StickmanRenderer] spawning procedural stickman for', sessionId);
      stickman = new StickmanRenderer(this, playerState.color);
      sprite = stickman.container; // expose for rest of code (tint hacks, y-offsets)
      sprite.y = 32; // feet at ground ring (mirrors SVG origin offset)
    } else {
      sprite = this.add.image(0, 0, 'stick-idle')
        .setOrigin(0.5, 0.85).setDisplaySize(78, 100);
    }
    const label = this.add.text(0, -78, this._nameLabel(playerState), {
      fontFamily: 'Arial Black, sans-serif', fontSize: 12,
      color: playerState.isBot ? '#c9d6e8' : '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    // Cosmetic hat (emoji) sitting on the head, and the Tech Lead crown above it all.
    const hatText = this.add.text(0, -60, hatById(playerState.hat).emoji, { fontSize: 18 }).setOrigin(0.5, 1);
    const crownText = this.add.text(0, -120, '👑', { fontSize: 22 }).setOrigin(0.5).setVisible(false);
    if (sessionId === this.localId) {
      // Highlight self with a small "YOU" badge
      const you = this.add.text(0, 26, 'YOU', {
        fontFamily: 'Arial Black, sans-serif', fontSize: 10, color: '#ffd23f',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5);
      c.add(you);
      // Sync localPos to spawn point + start the camera following us
      this.localPos.x = playerState.x;
      this.localPos.y = playerState.y;
      this.localTarget.x = playerState.x;
      this.localTarget.y = playerState.y;
      this.cameras.main.startFollow(c, true, 0.18, 0.18);
      this.cameras.main.setDeadzone(100, 100);
    }
    // Title under the nameplate (e.g. "Intern")
    const title = this.add.text(0, -64, levelTitle(playerState.level), {
      fontFamily: 'Consolas, monospace', fontSize: 10,
      color: this._cssColor(playerState.color),
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);
    // Aura ring (visible only at Lv5+) drawn under the colored ground ring
    const aura = this.add.ellipse(0, 32, 90, 26, playerState.color, 0.0)
      .setStrokeStyle(2, playerState.color, 0.0);
    // Laptop Shield disc — cyan ring around the player while shielded
    const shieldDisc = this.add.circle(0, -10, 50, 0x39c2ff, 0)
      .setStrokeStyle(3, 0x7ec8ff, 0.85).setVisible(false);
    // Stun indicator — yellow ⭐ above the head, hidden by default
    const stunStar = this.add.text(0, -110, '★', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 20, color: '#ffd23f',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setVisible(false);
    // Thin bars above the head — HEALTH (green, tinted red at low %) on top, ENERGY (blue) below.
    const healthBg   = this.add.rectangle(8, -92, 48, 3, 0x000000, 0.6);
    const healthFill = this.add.rectangle(-16, -92, 48, 3, 0x7ed957, 1).setOrigin(0, 0.5);
    const energyBg   = this.add.rectangle(8, -87, 48, 3, 0x000000, 0.6);
    const energyFill = this.add.rectangle(-16, -87, 48, 3, 0x39c2ff, 1).setOrigin(0, 0.5);

    // ── Level badge (MOBA-style XP-ring + level number) — sits to the LEFT
    // of the bars, vertically centered between the two ──
    const levelBadgeX = -28;
    const levelBadgeY = -89; // midpoint of the two bars
    const levelRingBg = this.add.circle(levelBadgeX, levelBadgeY, 9, 0x0a0a14, 0.92)
      .setStrokeStyle(1.5, 0x1a1a1a, 0.9);
    const levelRingArc = this.add.graphics(); // progress arc, redrawn on xp change
    const levelText = this.add.text(levelBadgeX, levelBadgeY, '1', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 10, color: '#ffd23f',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);
    // Broken-state floating banner: "🔧 FIXING LAPTOP" + countdown timer.
    // Hidden by default; shown only while player.broken === true.
    const fixingBg = this.add.rectangle(0, -106, 110, 28, 0x301010, 0.85)
      .setStrokeStyle(2, 0xffd23f, 0.95);
    const fixingTxt = this.add.text(0, -110, '🔧 FIXING', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 11, color: '#ffd23f',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);
    const fixingCountdown = this.add.text(0, -98, '8.0s', {
      fontFamily: 'Consolas, monospace', fontSize: 10, color: '#ffffff',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);
    const fixingGroup = this.add.container(0, 0, [fixingBg, fixingTxt, fixingCountdown]).setVisible(false);
    c.add([shadow, aura, ring, shieldDisc, sprite, hatText, label, title, healthBg, healthFill, energyBg, energyFill, levelRingBg, levelRingArc, levelText, fixingGroup, stunStar, crownText]);
    this.remotePlayers.set(sessionId, {
      container: c, label, sprite, stickman, color: playerState.color,
      hatText, crownText, isBot: !!playerState.isBot,
      invulnUntil: Number(playerState.invulnUntil) || 0,
      x: playerState.x, y: playerState.y,
      target: { x: playerState.x, y: playerState.y },
      facing: 1, state: 'idle', smashUntil: 0,
      _bobOffset: Math.random() * 3000,
      shadow, ring, aura, title, shieldDisc, stunStar,
      healthBg, healthFill, energyBg, energyFill,
      levelRingBg, levelRingArc, levelText,
      fixingGroup, fixingBg, fixingTxt, fixingCountdown,
      brokenStartAt: 0,
      level: playerState.level | 0,
      xp: playerState.xp | 0,
      energy: playerState.energy | 0,
      maxEnergy: playerState.maxEnergy | 0,
      health: playerState.health | 0,
      maxHealth: playerState.maxHealth | 0,
      broken: !!playerState.broken,
      shielded: !!playerState.shielded,
      stunnedUntil: Number(playerState.stunnedUntil) || 0,
    });
  }

  _cssColor(hex) {
    return '#' + (hex | 0).toString(16).padStart(6, '0');
  }

  _spawnPickupSprite(id, pickupState) {
    const c = this.add.container(pickupState.x, pickupState.y).setDepth(7);
    const sprite = this.add.image(0, 0, 'health-pickup').setDisplaySize(40, 40);
    // Gentle bob + pulse to telegraph "go grab me"
    this.tweens.add({
      targets: sprite,
      y: -6, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: sprite,
      scaleX: sprite.scaleX * 1.08, scaleY: sprite.scaleY * 1.08,
      duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    c.add(sprite);
    this.remotePickups.set(id, { sprite: c, x: pickupState.x, y: pickupState.y, alive: true });
  }

  _buildCodeBackground() {
    // A block of fake, recognizable JS code. Repeats to fill the world.
    const block = [
      '// Bug Smash :: Personal Mode — autonomous arena loop',
      "import { Room } from 'colyseus';",
      "import { ArenaState, Player, Bug } from './schema.js';",
      '',
      'const TICK_MS  = 50;',
      'const MAX_BUGS = 100;',
      'const SPAWN_EVERY_MS = 600;',
      '',
      'export class ArenaRoom extends Room {',
      '  onCreate(_options) {',
      '    this.maxClients = 32;',
      '    this.setState(new ArenaState());',
      '    this.setSimulationInterval((dt) => this._tick(dt));',
      "    this.onMessage('move', (client, msg) => {",
      '      const p = this.state.players.get(client.sessionId);',
      '      if (!p || p.broken) return;',
      '      p.x = clamp(msg.x, 0, ARENA_W);',
      '      p.y = clamp(msg.y, 0, ARENA_H);',
      '    });',
      "    this.onMessage('castSkill', (client, msg) => {",
      "      if (msg.slot === 'q') this._dash(client);",
      "      if (msg.slot === 'e') this._jump(client);",
      "      if (msg.slot === 'r') this._ult(client);",
      '    });',
      '  }',
      '',
      '  _tick(dtMs) {',
      "    if (this.state.phase !== 'playing') return;",
      '    const now = Date.now();',
      '    this._spawnBugs(dtMs);',
      '    this._updatePlayers(now, dtMs);',
      '    this._updateBugAI(now, dtMs);',
      '    this._resolveClouds(now);',
      '  }',
      '',
      '  _applyHit(sessionId, p, bugId, bug) {',
      '    bug.hp -= bugDamageForLevel(p.level);',
      '    if (bug.hp <= 0) {',
      '      const gain = BUG_KIND_SCORE[bug.kind] * comboMult(p.combo);',
      '      p.score += gain;',
      '      p.xp += gain;',
      '      bug.alive = false;',
      "      if (bug.kind === 'bug-toxic') this._spawnToxicCloud(bug.x, bug.y);",
      '    }',
      '  }',
      '',
      '  _enterBroken(p, sid) {',
      '    p.broken = true;',
      '    p.broken_seq = (p.broken_seq + 1) >>> 0;',
      '    this.clock.setTimeout(() => {',
      '      const cur = this.state.players.get(sid);',
      '      if (cur && cur.broken) this._exitBroken(cur);',
      '    }, BROKEN_DURATION_MS);',
      '  }',
      '}',
      '',
    ].join('\n');

    const style = {
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: '14px',
      color: '#5d7090',
      align: 'left',
      padding: { x: 0, y: 0 },
    };
    // Tile the block in a grid covering the world. Each Text object renders
    // independently — Phaser caches them as textures so per-frame cost is one
    // blit each. Tile size chosen so no single texture is too large.
    const TILE_W = 720;
    const TILE_H = 760;
    const ROW_HEAD_X = 64;
    for (let y = 0; y < WORLD_H + TILE_H; y += TILE_H) {
      for (let x = ROW_HEAD_X; x < WORLD_W - 60; x += TILE_W) {
        const t = this.add.text(x, y, block, style)
          .setDepth(-9)
          .setAlpha(0.18);
      }
    }
  }

  _spawnObstacleSprite(id, ob) {
    // Each obstacle is a few lines of REAL code (JS / Python / C), syntax-
    // highlighted token-by-token. No panel background — just the floating
    // code on the world. Bugs eat it over time; smashing it breaks it open.
    const c = this.add.container(ob.x, ob.y).setDepth(4);
    const w = ob.w | 0, h = ob.h | 0;

    // Pick a snippet deterministically from the pool based on world position
    const pool = CODE_SNIPPETS[ob.kind] || CODE_SNIPPETS['code-block'];
    const snippet = pool[(Math.abs(ob.x * 31 + ob.y * 17) | 0) % pool.length];

    // Layout: each line stacks vertically; tokens flow inline.
    const fontSize = h <= 90 ? 10 : 11;
    const lineH = fontSize + 3;
    const padX = 4, padY = 4;
    const tokenStyle = (color) => ({
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: fontSize + 'px',
      color,
    });
    const tokenItems = [];
    let cursorY = padY;
    for (const line of snippet) {
      let cursorX = padX;
      for (const tok of line) {
        if (!tok.t) continue;
        const t = this.add.text(cursorX, cursorY, tok.t, tokenStyle(tok.c || SYNTAX_HEX.default));
        t.setOrigin(0, 0);
        tokenItems.push(t);
        cursorX += t.width;
      }
      cursorY += lineH;
    }

    c.add(tokenItems);
    // Cracks overlay (above the code, shows damage progression)
    const cracks = this.add.graphics();
    c.add(cracks);

    const rec = {
      gfx: c, tokens: tokenItems, cracks,
      x: ob.x, y: ob.y, w, h, kind: ob.kind,
      maxHp: ob.maxHp | 0, hp: ob.hp | 0, hitSeq: ob.hit_seq | 0,
    };
    this.remoteObstacles.set(id, rec);
    this._refreshObstacleCracks(rec);

    // Damage flash + crack refresh when server bumps hit_seq
    const $ = Colyseus.getStateCallbacks(this.room);
    $(ob).listen('hit_seq', (seq) => {
      // Guard: listener can fire after the obstacle has been destroyed (race
      // with onRemove). Without this we touch dead Text objects → Phaser
      // crashes reading frame.cut.
      if (!this.remoteObstacles.has(id)) return;
      if (!rec.gfx || !rec.gfx.scene) return;
      if (seq === rec.hitSeq) return;
      rec.hitSeq = seq;
      rec.hp = ob.hp | 0;
      // Each token briefly flashes red then restores. Guard each call: when
      // the user backgrounds the tab Phaser's render loop pauses but timer
      // callbacks keep queueing, so by the time we reach setColor here the
      // Text's internal texture may be in a half-destroyed state. Wrap in
      // try/catch — worst case the token stays red for one frame.
      for (const t of tokenItems) {
        if (!t || !t.scene || !t.active) continue;
        const orig = t.style.color;
        try { t.setColor('#ff8a8a'); } catch (_) { continue; }
        this.time.delayedCall(110, () => {
          if (!t || !t.scene || !t.active) return;
          try { t.setColor(orig); } catch (_) { /* tab was backgrounded */ }
        });
      }
      this.tweens.add({ targets: c, scale: 1.06, duration: 80, yoyo: true });
      this._refreshObstacleCracks(rec);
      const eaterBug = this._findNearestBugTo(rec, 80);
      if (eaterBug) this._spawnBugChompEffect(rec, eaterBug);
      else this._spawnObstacleHitParticles(rec);
    });
  }

  /** Return the nearest alive bug within `radius` of an obstacle rect, or null. */
  _findNearestBugTo(rec, radius) {
    if (!this.remoteBugs || this.remoteBugs.size === 0) return null;
    const r2 = radius * radius;
    let nearest = null, nearestD = r2;
    this.remoteBugs.forEach((b) => {
      if (!b.alive || b.hidden || !b.sprite) return;
      const bx = b.sprite.x, by = b.sprite.y;
      const cx = Math.max(rec.x, Math.min(bx, rec.x + rec.w));
      const cy = Math.max(rec.y, Math.min(by, rec.y + rec.h));
      const dx = bx - cx, dy = by - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < nearestD) { nearestD = d2; nearest = b; }
    });
    return nearest;
  }

  /** Visual: bug nips a chunk out of the code obstacle. */
  _spawnBugChompEffect(rec, bug) {
    const bx = bug.sprite.x;
    const by = bug.sprite.y;
    // "◣◢" chomp marks above the bug, scale + fade up
    const chomp = this.add.text(bx, by - 16, '◣ ◢', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 14, color: '#ffd23f',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({
      targets: chomp, scale: 1.4, alpha: 0, y: by - 28,
      duration: 320, ease: 'Cubic.easeOut',
      onComplete: () => chomp.destroy(),
    });
    // Tiny "+1" eat score floats up
    const eat = this.add.text(bx, by - 6, '+1', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 10, color: '#7ed957',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({
      targets: eat, y: by - 32, alpha: 0,
      duration: 480, ease: 'Cubic.easeOut',
      onComplete: () => eat.destroy(),
    });
    // 4 colored "code crumbs" flying FROM obstacle TOWARD bug (sucked in)
    const palette = [0x569cd6, 0xdcdcaa, 0xc586c0, 0x4ec9b0, 0xce9178, 0x9cdcfe];
    for (let i = 0; i < 4; i++) {
      const sx = rec.x + Math.random() * rec.w;
      const sy = rec.y + Math.random() * rec.h;
      const color = palette[Math.floor(Math.random() * palette.length)];
      const crumb = this.add.rectangle(sx, sy, 4, 4, color, 0.95).setDepth(19);
      this.tweens.add({
        targets: crumb,
        x: bx + (Math.random() - 0.5) * 12,
        y: by + (Math.random() - 0.5) * 12,
        alpha: 0, angle: 360,
        duration: 320 + Math.random() * 80, ease: 'Cubic.easeIn',
        onComplete: () => crumb.destroy(),
      });
    }
  }

  /** Draw crack overlay scaled to current HP — more cracks as HP drops. */
  _refreshObstacleCracks(rec) {
    const g = rec.cracks;
    g.clear();
    const lost = rec.maxHp - rec.hp;
    if (lost <= 0) return;
    g.lineStyle(1.4, 0xff5252, 0.8);
    let s = (rec.x | 0) * 2654435769 ^ (rec.y | 0);
    const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 0xffffffff); };
    for (let i = 0; i < lost; i++) {
      const startX = rec.w * rnd();
      const startY = rec.h * rnd();
      const ex = startX + (rnd() - 0.5) * rec.w * 0.7;
      const ey = startY + (rnd() - 0.5) * rec.h * 0.5;
      const mx = (startX + ex) / 2 + (rnd() - 0.5) * 8;
      const my = (startY + ey) / 2 + (rnd() - 0.5) * 8;
      g.beginPath();
      g.moveTo(startX, startY);
      g.lineTo(mx, my);
      g.lineTo(ex, ey);
      g.strokePath();
    }
  }

  /** Big destruction burst — when an obstacle is fully broken. */
  _spawnObstacleBreakBurst(rec) {
    const wx = rec.x + rec.w / 2;
    const wy = rec.y + rec.h / 2;
    // White flash ring
    const ring = this.add.circle(wx, wy, Math.max(rec.w, rec.h) / 2, 0xffffff, 0.6).setDepth(20);
    this.tweens.add({
      targets: ring, scale: 1.6, alpha: 0,
      duration: 280, ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    // 10 colored "code scrap" rectangles flying outward
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 60 + Math.random() * 50;
      const size = 4 + Math.random() * 5;
      const color = [0x569cd6, 0xdcdcaa, 0xc586c0, 0x4ec9b0, 0xce9178, 0x9cdcfe][i % 6];
      const p = this.add.rectangle(wx, wy, size, size * 0.6, color, 0.95).setDepth(20);
      this.tweens.add({
        targets: p,
        x: wx + Math.cos(a) * dist,
        y: wy + Math.sin(a) * dist + 20,
        alpha: 0, angle: 200 + Math.random() * 360,
        duration: 600, ease: 'Cubic.easeOut',
        onComplete: () => p.destroy(),
      });
    }
    // A faint "POP" puff
    const puff = this.add.ellipse(wx, wy + 6, 30, 14, 0xd2c8b0, 0.85).setDepth(20);
    this.tweens.add({
      targets: puff, scaleX: 2.2, scaleY: 2.2, alpha: 0,
      duration: 460, ease: 'Cubic.easeOut',
      onComplete: () => puff.destroy(),
    });
    AudioManager.bugKill?.();
  }

  /** Small paper-scrap burst when an obstacle takes a hit. */
  _spawnObstacleHitParticles(rec) {
    const wx = rec.x + rec.w / 2;
    const wy = rec.y + rec.h / 2;
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const size = 3 + Math.random() * 3;
      const color = [0x569cd6, 0xdcdcaa, 0xc586c0, 0xcdd2dc][i % 4];
      const p = this.add.rectangle(wx, wy, size, size, color, 0.95).setDepth(20);
      this.tweens.add({
        targets: p,
        x: wx + Math.cos(a) * 50,
        y: wy + Math.sin(a) * 50 - 12,
        alpha: 0, angle: 180 + Math.random() * 180,
        duration: 420, ease: 'Cubic.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  _spawnCloudSprite(id, cloudState) {
    // Toxic poison AOE — soft green disc, pulsing border, fades over its lifetime.
    const RADIUS = 60;
    const LIFETIME = Math.max(200, (cloudState.expiresAt || 0) - Date.now());
    const gfx = this.add.container(cloudState.x, cloudState.y).setDepth(6);
    const fill = this.add.circle(0, 0, RADIUS, 0x4ad14a, 0.28);
    const ring = this.add.circle(0, 0, RADIUS, 0x4ad14a, 0)
      .setStrokeStyle(3, 0x7ef07e, 0.85);
    // 6 little drifting motes for that "fumes" look
    const motes = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * RADIUS * 0.6;
      const m = this.add.circle(Math.cos(a) * d, Math.sin(a) * d, 4, 0xb6ff7a, 0.7);
      motes.push(m);
      this.tweens.add({
        targets: m, y: m.y - 14, alpha: 0,
        duration: 700 + Math.random() * 400, repeat: -1, ease: 'Sine.easeOut',
      });
    }
    gfx.add([fill, ring, ...motes]);
    this.tweens.add({
      targets: ring, scale: 1.15, alpha: 0.4,
      duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    // Fade the whole cloud over its lifetime so the end feels graceful
    this.tweens.add({
      targets: gfx, alpha: 0, duration: LIFETIME, ease: 'Cubic.easeIn',
    });
    this.remoteClouds.set(id, { gfx });
  }

  /** Brief red flash + 2 spark particles on a bug surviving a hit. */
  _spawnBugHitFlash(r) {
    if (!r || !r.sprite) return;
    const body = r.sprite._body;
    if (body && body.setTint) {
      // Image body (all PNG bugs): flash red, then restore (gold for the CEO's bug)
      body.setTint(0xff5252);
      this.time.delayedCall(110, () => {
        if (!body.scene) return;
        if (r.golden) body.setTint(0xffd700); else body.clearTint();
      });
    } else if (body && body.setFillStyle) {
      const origColor = body.fillColor;
      body.setFillStyle(0xff5252, 1);
      this.time.delayedCall(110, () => {
        if (body && body.setFillStyle) body.setFillStyle(origColor, 1);
      });
    } else if (r.sprite.setTint) {
      r.sprite.setTint(0xff5252);
      this.time.delayedCall(110, () => r.sprite.clearTint && r.sprite.clearTint());
    }
    // Punch scale
    this.tweens.add({
      targets: r.sprite, scale: r.sprite.scale * 1.18,
      duration: 80, yoyo: true,
    });
    // 2 yellow sparks
    const wx = r.sprite.x, wy = r.sprite.y - 10;
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = this.add.circle(wx, wy, 2.5, 0xffd23f, 1).setDepth(20);
      this.tweens.add({
        targets: s,
        x: wx + Math.cos(a) * 22, y: wy + Math.sin(a) * 22,
        alpha: 0, duration: 260, ease: 'Cubic.easeOut',
        onComplete: () => s.destroy(),
      });
    }
  }

  /** Spawn an independent "corpse" sprite at a dead bug's spot. Lingers ~5 s. */
  _spawnBugCorpse(kind, x, y) {
    if (!this.textures.exists('bug-dead')) return;
    const corpse = this.add.image(x, y, 'bug-dead')
      .setDisplaySize(50, 50)
      .setDepth(2)
      .setRotation((Math.random() - 0.5) * 0.6); // slight tilt for variety
    // 5 s lifespan: full opacity for 4 s, then fade out over 1 s
    this.time.delayedCall(4000, () => {
      this.tweens.add({
        targets: corpse, alpha: 0, duration: 1000, ease: 'Cubic.easeIn',
        onComplete: () => corpse.destroy(),
      });
    });
  }

  _spawnBugDeathEffect(kind, x, y) {
    switch (kind) {
      case 'bug-ladybug': return this._fxDustPop(x, y, 0xffffff, 4, 22);
      case 'bug-null':    return this._fxSmokePuff(x, y, 0x8a8a8a, 26);
      case 'bug-race':    return this._fxSpeedLines(x, y, 0x66d4ff, 6, 44);
      case 'bug-beetle':  return this._fxShockRing(x, y, 0x9a6a3a, 30, 70);
      case 'bug-toxic':   return; // cloud handles it
      case 'bug-scarab':  return this._fxFragments(x, y, 0x8a5a30, 14, 70);
      case 'bug-robot':   return this._fxRobotBoom(x, y);
      default:            return this._fxDustPop(x, y, 0xffffff, 4, 22);
    }
  }

  _fxDustPop(x, y, color, count, radius) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const p = this.add.circle(x, y, 3, color, 0.9).setDepth(15);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(a) * radius,
        y: y + Math.sin(a) * radius - 6,
        alpha: 0, duration: 360, ease: 'Cubic.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  _fxSmokePuff(x, y, color, radius) {
    const c = this.add.circle(x, y, 8, color, 0.55).setDepth(15);
    this.tweens.add({
      targets: c,
      radius: radius, scale: 2.4, alpha: 0,
      duration: 420, ease: 'Cubic.easeOut',
      onComplete: () => c.destroy(),
    });
  }

  _fxSpeedLines(x, y, color, count, length) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const dx = Math.cos(a), dy = Math.sin(a);
      const line = this.add.rectangle(x + dx * 6, y + dy * 6, 14, 3, color, 0.95)
        .setRotation(a).setDepth(15);
      this.tweens.add({
        targets: line,
        x: x + dx * length, y: y + dy * length,
        alpha: 0, scaleX: 1.8,
        duration: 280, ease: 'Cubic.easeOut',
        onComplete: () => line.destroy(),
      });
    }
  }

  _fxShockRing(x, y, color, startR, endR) {
    const ring = this.add.circle(x, y, startR, 0)
      .setStrokeStyle(3, color, 0.95).setDepth(15);
    this.tweens.add({
      targets: ring, radius: endR, scale: 1.4, alpha: 0,
      duration: 320, ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    // 3 brown chips
    this._fxDustPop(x, y, color, 3, 26);
  }

  _fxFragments(x, y, color, count, radius) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * (0.6 + Math.random() * 0.5);
      const size = 3 + Math.random() * 3;
      const frag = this.add.rectangle(x, y, size, size, color, 0.95)
        .setRotation(Math.random() * Math.PI).setDepth(15);
      this.tweens.add({
        targets: frag,
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r + 10,
        rotation: frag.rotation + Math.PI,
        alpha: 0, duration: 460, ease: 'Cubic.easeOut',
        onComplete: () => frag.destroy(),
      });
    }
  }

  _fxRobotBoom(x, y) {
    // White flash circle
    const flash = this.add.circle(x, y, 30, 0xffffff, 0.85).setDepth(16);
    this.tweens.add({
      targets: flash, radius: 90, scale: 2.2, alpha: 0,
      duration: 260, ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });
    // Yellow electric ring
    const ring = this.add.circle(x, y, 24, 0)
      .setStrokeStyle(4, 0xfff15a, 0.95).setDepth(16);
    this.tweens.add({
      targets: ring, radius: 110, alpha: 0,
      duration: 380, ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    // 8 electric arcs
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.2;
      const len = 60 + Math.random() * 30;
      const arc = this.add.rectangle(x, y, len, 2, 0xfff15a, 1)
        .setOrigin(0, 0.5).setRotation(a).setDepth(16);
      this.tweens.add({
        targets: arc, alpha: 0, scaleX: 1.4,
        duration: 240, ease: 'Cubic.easeOut',
        onComplete: () => arc.destroy(),
      });
    }
    // Camera shake — modest, not annoying
    this.cameras.main.shake(180, 0.012);
  }

  _consumePickupSprite(id) {
    const r = this.remotePickups.get(id);
    if (!r || !r.alive) return;
    r.alive = false;
    AudioManager.skillPickup?.('buff');
    // Quick green flash burst at the pickup location
    const ring = this.add.circle(r.x, r.y, 12, 0x7ed957, 0)
      .setStrokeStyle(3, 0x7ed957, 0.95).setDepth(20);
    this.tweens.add({
      targets: ring, radius: 50, scale: 4, alpha: 0,
      duration: 320, ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    // Fade + lift the sprite as it "rises"
    this.tweens.add({
      targets: r.sprite, y: r.sprite.y - 30, alpha: 0,
      duration: 280, ease: 'Cubic.easeOut',
    });
  }

  _spawnBug(id, bugState) {
    const c = this.add.container(bugState.x, bugState.y).setDepth(8);
    // Drop shadow under bug
    const shadow = this.add.ellipse(0, 14, 36, 10, 0x000000, 0.45);
    // Use the actual bug PNG if loaded, else a colored circle fallback
    let body;
    const golden = bugState.kind === 'bug-golden';
    if (golden) {
      // The CEO's bug — a gilded ladybug with a halo. Worth a promotion.
      const glow = this.add.circle(0, 0, 40, 0xffd700, 0.28);
      this.tweens.add({ targets: glow, scale: { from: 0.85, to: 1.25 }, alpha: { from: 0.35, to: 0.12 },
        duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      body = this.add.image(0, 0, 'bug-ladybug').setDisplaySize(64, 64).setTint(0xffd700);
      const tag = this.add.text(0, -44, "✨ CEO's BUG", {
        fontFamily: 'Arial Black, sans-serif', fontSize: 12, color: '#ffd700', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5);
      c.add([glow, tag]);
    } else if (this.textures.exists(bugState.kind)) {
      body = this.add.image(0, 0, bugState.kind).setDisplaySize(48, 48);
    } else {
      const tint = ({
        'bug-null': 0xa080ff, 'bug-ladybug': 0xff5252, 'bug-beetle': 0x39c2ff,
        'bug-race': 0xffa64a, 'bug-toxic': 0x7ed957, 'bug-scarab': 0xb0651a,
      })[bugState.kind] || 0xff66aa;
      body = this.add.circle(0, 0, 18, tint, 0.95).setStrokeStyle(2, 0x000000);
    }
    const hpText = this.add.text(0, 22, '', {
      fontFamily: 'Consolas, monospace', fontSize: 10, color: '#ffffff',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);
    if (bugState.hp > 1) hpText.setText(`HP ${bugState.hp}`);
    c.add([shadow, body, hpText]);
    c._body = body; c._hpText = hpText;
    this.remoteBugs.set(id, {
      sprite: c,
      x: bugState.x, y: bugState.y,
      target: { x: bugState.x, y: bugState.y },
      alive: true, hidden: false, kind: bugState.kind, golden,
    });
  }

  /**
   * Trigger an action — jump (no attack), or one of three attack variants
   * (smash/punch/kick) with different reaches. Sends both an 'action' message
   * (animation broadcast) and, for attacks, a 'smash' message (target validation).
   */
  _triggerAction(kind, opts = {}) {
    const now = this.time.now;
    if (now < this._smashCooldownUntil) return;
    if (!this.room) return;
    const meS = this.room.state?.players?.get(this.localId);
    if (meS && (Number(meS.stunnedUntil) || 0) > this._srvNow()) return; // stunned

    // Broadcast the visual action so other clients see our pose
    this.room.send('action', { kind });

    // Local immediate animation. Keep attack poses (smash/punch) shorter than
    // the 220ms cooldown so the sprite visibly returns to idle between hits
    // — without this, repeated chase-smashes lock the pose forever.
    const me = this.remotePlayers.get(this.localId);
    const durMs = (kind === 'parry') ? 620
               : (kind === 'jump')   ? 420
               : (kind === 'kick')   ? 260
                                     : 130; // smash + punch
    if (me) {
      me.action = kind;
      me.actionUntil = now + durMs;
      me.actionStartAt = now;
    }

    if (kind === 'jump') {
      this._smashCooldownUntil = now + 220;
      AudioManager.uiClick?.();
      return;
    }
    if (kind === 'parry') {
      // Parry is a defensive stance — no damage, just the pose + a cyan shockwave
      this._smashCooldownUntil = now + 380;
      AudioManager.skillPickup?.('buff');
      if (me) this._spawnParryRing(me.container.x, me.container.y);
      return;
    }

    // Kick is an AOE spin — server scans bugs around the player, no client target.
    if (kind === 'kick') {
      this.room.send('smash', { kind: 'kick' });
      this._smashCooldownUntil = now + 360;
      AudioManager.smashHit?.();
      // Spin shockwave visual (yellow ring expanding to kick radius)
      const me = this.remotePlayers.get(this.localId);
      if (me) this._spawnKickRing(me.container.x, me.container.y);
      return;
    }

    // Smash / punch — single-target.
    const reach = (kind === 'punch') ? 112 : SMASH_REACH;

    // PvP path — explicit player session id
    if (opts.targetSid != null) {
      const other = this.remotePlayers.get(opts.targetSid);
      if (!other) return;
      const d = Math.hypot(other.container.x - this.localPos.x, other.container.y - this.localPos.y);
      if (d > reach) return;
      this.room.send('smash', { kind, targetSid: opts.targetSid });
      this._smashCooldownUntil = now + 220;
      AudioManager.smashHit?.();
      if (me) {
        this.tweens.add({
          targets: me.container, scaleX: 1.18, scaleY: 0.9, duration: 90, yoyo: true,
        });
      }
      return;
    }

    // The Deadline boss — explicit lock-on, or auto when it's the closest thing in reach.
    const bossPos = this._bossView?.pos();
    const bossReach = reach + 64;
    const bossD = bossPos ? Math.hypot(bossPos.x - this.localPos.x, bossPos.y - this.localPos.y) : Infinity;
    const swingBoss = () => {
      this.room.send('smash', { boss: this._bossView.id, kind });
      this._smashCooldownUntil = now + 220;
      AudioManager.smashHit?.();
      if (me) this.tweens.add({ targets: me.container, scaleX: 1.18, scaleY: 0.9, duration: 90, yoyo: true });
    };
    if (opts.boss) {
      if (bossD < bossReach) swingBoss();
      return;
    }

    let bestId = null, bestD = Infinity;
    if (opts.targetId != null) {
      const b = this.remoteBugs.get(opts.targetId);
      if (b && b.alive && !b.hidden) {
        const d = Math.hypot(b.x - this.localPos.x, b.y - this.localPos.y);
        if (d < reach) bestId = opts.targetId;
      }
    } else {
      this.remoteBugs.forEach((b, id) => {
        if (!b.alive || b.hidden) return;
        const d = Math.hypot(b.x - this.localPos.x, b.y - this.localPos.y);
        if (d < reach && d < bestD) { bestD = d; bestId = id; }
      });
      if (bossD < bossReach && (bestId == null || bossD - 64 < bestD)) { swingBoss(); return; }
    }
    // Also consider enemy players for the swing — pick the closer of bug vs player.
    // (Skipped during the boss truce — PvP does no damage then.)
    let bestPlayerSid = null, bestPlayerD = Infinity;
    if (opts.targetId == null && !this._isTruce()) {
      this.remotePlayers.forEach((r, sid) => {
        if (sid === this.localId) return;
        const d = Math.hypot(r.container.x - this.localPos.x, r.container.y - this.localPos.y);
        if (d < reach && d < bestPlayerD) { bestPlayerD = d; bestPlayerSid = sid; }
      });
    }
    if (bestPlayerSid != null && bestPlayerD < bestD) {
      // Player closer than any bug — PvP swing
      this.room.send('smash', { targetSid: bestPlayerSid, kind });
      this._smashCooldownUntil = now + 220;
      AudioManager.smashHit?.();
      if (me) {
        this.tweens.add({
          targets: me.container, scaleX: 1.18, scaleY: 0.9, duration: 90, yoyo: true,
        });
      }
      return;
    }
    if (bestId == null) {
      AudioManager.uiClick?.();
      this._smashCooldownUntil = now + 220;
      return;
    }
    this.room.send('smash', { id: bestId, kind });
    this._smashCooldownUntil = now + 220;
    AudioManager.smashHit?.();
    if (me) {
      this.tweens.add({
        targets: me.container, scaleX: 1.18, scaleY: 0.9, duration: 90, yoyo: true,
      });
    }
  }

  /** Send a skill cast to the server. Gated by energy + broken state only. */
  _castSkill(slot) {
    if (!this.room) return;
    const meState = this.room.state.players?.get(this.localId);
    if (!meState || meState.broken) return;
    if ((Number(meState.stunnedUntil) || 0) > this._srvNow()) return; // stunned
    const cost = this._skillCost(slot);
    if ((meState.energy | 0) < cost) {
      AudioManager.uiClick?.();
      return;
    }

    // Local animation pose — so the caster sees their own stickman do the move.
    // Server also broadcasts via action_seq (handled for REMOTE players only),
    // so we mirror that locally here.
    const me = this.remotePlayers.get(this.localId);
    const kindForAnim = (slot === 'q') ? 'punch' : (slot === 'w') ? 'parry'
                     : (slot === 'e') ? 'jump'  : 'kick';
    const animMs = (slot === 'r') ? 500 : (slot === 'w' ? 620 : 320);
    if (me) {
      me.action = kindForAnim;
      me.actionUntil = this.time.now + animMs;
      me.actionStartAt = this.time.now;
    }
    // Skills that need an aim direction + client-side position prediction
    const payload = { slot };

    if (slot === 'q') {
      // Bug Dash — must target an enemy (bug OR player). Auto-aims at the
      // closest one within search range. Whiff if nothing nearby.
      const SEARCH_RANGE = 360;
      const lx = this.localPos.x, ly = this.localPos.y;
      let bestX = null, bestY = null, bestD = Infinity;
      this.remoteBugs.forEach((b) => {
        if (!b.alive || b.hidden) return;
        const d = Math.hypot(b.x - lx, b.y - ly);
        if (d < SEARCH_RANGE && d < bestD) { bestD = d; bestX = b.x; bestY = b.y; }
      });
      if (!this._isTruce()) {
        this.remotePlayers.forEach((r, sid) => {
          if (sid === this.localId) return;
          const d = Math.hypot(r.container.x - lx, r.container.y - ly);
          if (d < SEARCH_RANGE && d < bestD) { bestD = d; bestX = r.container.x; bestY = r.container.y; }
        });
      }
      const bp = this._bossView?.pos();
      if (bp) {
        const d = Math.hypot(bp.x - lx, bp.y - ly) - 60; // big target — count from its edge
        if (d < SEARCH_RANGE && d < bestD) { bestD = d; bestX = bp.x; bestY = bp.y; }
      }
      if (bestX == null) {
        // No enemy in range — refund the energy intent and whiff
        AudioManager.uiClick?.();
        return;
      }
      const dx = bestX - lx, dy = bestY - ly;
      const dlen = Math.hypot(dx, dy) || 1;
      const dirX = dx / dlen, dirY = dy / dlen;
      payload.dirX = dirX;
      payload.dirY = dirY;
      const destX = Phaser.Math.Clamp(lx + dirX * 140, 0, WORLD_W);
      const destY = Phaser.Math.Clamp(ly + dirY * 140, 0, WORLD_H);
      // Predicting a server teleport: don't adopt server corrections or clamp
      // against obstacles until the tween + the server echo have landed.
      this._predictUntil = this.time.now + 180 + 320;
      this._passThroughUntil = this.time.now + 350;
      const moveAnim = { x: lx, y: ly };
      this.tweens.add({
        targets: moveAnim, x: destX, y: destY,
        duration: 180, ease: 'Cubic.easeOut',
        onUpdate: () => { this.localPos.x = moveAnim.x; this.localPos.y = moveAnim.y; },
      });
      this._spawnDashAfterimage(dirX, dirY, 140);
      AudioManager.smashHit?.();
    } else if (slot === 'r') {
      // Deadline Break ult — cinematic visual at caster position
      const me = this.remotePlayers.get(this.localId);
      if (me) this._spawnUltShockwave(me.container.x, me.container.y);
      this.cameras.main.shake(400, 0.018);
      AudioManager.failure?.();   // heavy thud
      AudioManager.combo?.(3);    // dramatic chime
    } else if (slot === 'e') {
      // Debug Roll — go in last-movement direction, no target requirement
      const dlen = Math.hypot(this._lastDirX, this._lastDirY) || 1;
      const dirX = this._lastDirX / dlen;
      const dirY = this._lastDirY / dlen;
      payload.dirX = dirX;
      payload.dirY = dirY;
      const destX = Phaser.Math.Clamp(this.localPos.x + dirX * 180, 0, WORLD_W);
      const destY = Phaser.Math.Clamp(this.localPos.y + dirY * 180, 0, WORLD_H);
      this._predictUntil = this.time.now + 250 + 320;
      this._passThroughUntil = this.time.now + 350;
      const moveAnim = { x: this.localPos.x, y: this.localPos.y };
      this.tweens.add({
        targets: moveAnim, x: destX, y: destY,
        duration: 250, ease: 'Cubic.easeOut',
        onUpdate: () => { this.localPos.x = moveAnim.x; this.localPos.y = moveAnim.y; },
      });
      this._spawnRollVisual(dirX, dirY);
      // If the leap crosses an obstacle, spawn an extra dust puff at the midpoint
      // so the pass-through reads visually.
      this._maybeSpawnPassThroughPuff(this.localPos.x, this.localPos.y, destX, destY);
    }
    this.room.send('castSkill', payload);
    AudioManager.skillPickup?.('buff');
    const btn = this._skillButtons?.[slot];
    if (btn) {
      this.tweens.add({
        targets: btn, scaleX: 0.9, scaleY: 0.9, duration: 80, yoyo: true,
      });
    }
  }

  /** Brief red flash on a player's sprite + a couple of red spark particles. */
  _spawnHitFlash(r) {
    if (!r || !r.sprite) return;
    // setTint only works on Image, not Container. Skip for procedural renderer.
    if (r.sprite.setTint) {
      r.sprite.setTint(0xff5252);
      this.time.delayedCall(120, () => {
        if (!r.broken && !(r.stunnedUntil && r.stunnedUntil > this._srvNow())) {
          r.sprite.clearTint();
        }
      });
    }
    // 3 small red sparks bursting outward
    const wx = r.container.x, wy = r.container.y - 30;
    for (let i = 0; i < 3; i++) {
      const ang = Math.random() * Math.PI * 2;
      const s = this.add.circle(wx, wy, 4, 0xff5252, 0.95).setDepth(20);
      this.tweens.add({
        targets: s,
        x: wx + Math.cos(ang) * 32,
        y: wy + Math.sin(ang) * 32,
        alpha: 0,
        duration: 280, ease: 'Cubic.easeOut',
        onComplete: () => s.destroy(),
      });
    }
  }

  /**
   * Floating combat damage number (MOBA-style). Pops in, drifts up, fades out.
   * `kind`: 'bug' (white, scales with size), 'player' (gold — enemy hit),
   * 'self' (red, bigger — damage you took). Numbers are culled when off-screen
   * so a busy arena doesn't spawn hundreds of invisible text objects.
   */
  _spawnDamageNumber(wx, wy, amount, opts = {}) {
    amount = Math.round(amount);
    if (amount <= 0) return;
    const view = this.cameras.main.worldView;
    const M = 80; // cull margin around the viewport
    if (wx < view.x - M || wx > view.right + M || wy < view.y - M || wy > view.bottom + M) return;

    const kind = opts.kind || 'bug';
    let color, stroke, size;
    if (kind === 'self')        { color = '#ff5252'; stroke = '#3a0000'; size = 30; }
    else if (kind === 'player') { color = '#ffd23f'; stroke = '#000000'; size = 24; }
    else                        { color = '#ffffff'; stroke = '#000000'; size = amount >= 30 ? 26 : 20; }

    const jitterX = (Math.random() - 0.5) * 26;
    const txt = this.add.text(wx + jitterX, wy, `-${amount}`, {
      fontFamily: 'Arial Black, sans-serif', fontSize: size, color,
      stroke, strokeThickness: 4,
    }).setOrigin(0.5).setDepth(40).setScale(0.4);

    // Pop in, then float up and fade.
    this.tweens.add({ targets: txt, scale: 1, duration: 120, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: txt,
      y: wy - 48,
      alpha: { from: 1, to: 0 },
      duration: 720, delay: 110, ease: 'Cubic.easeIn',
      onComplete: () => txt.destroy(),
    });
  }

  /** Ult shockwave — big white ring expanding to 200 px + secondary cyan ring */
  _spawnUltShockwave(worldX, worldY) {
    // Inner solid-fill ring (looks like a flash)
    const inner = this.add.circle(worldX, worldY, 18, 0xffffff, 0.7).setDepth(20);
    this.tweens.add({
      targets: inner, radius: 60, scale: 3, alpha: 0,
      duration: 220, ease: 'Cubic.easeOut',
      onComplete: () => inner.destroy(),
    });
    // Big outer expanding ring matching ULT_RADIUS = 200
    const outer = this.add.circle(worldX, worldY, 20, 0xffffff, 0)
      .setStrokeStyle(5, 0xffffff, 1).setDepth(20);
    this.tweens.add({
      targets: outer, radius: 200, alpha: 0,
      duration: 500, ease: 'Cubic.easeOut',
      onComplete: () => outer.destroy(),
    });
    // Secondary cyan ring (slightly delayed for layering)
    this.time.delayedCall(80, () => {
      const cy = this.add.circle(worldX, worldY, 30, 0x7ec8ff, 0)
        .setStrokeStyle(3, 0x39c2ff, 1).setDepth(19);
      this.tweens.add({
        targets: cy, radius: 200, alpha: 0,
        duration: 440, ease: 'Cubic.easeOut',
        onComplete: () => cy.destroy(),
      });
    });
  }

  /** Jump visual — alpha blink during invuln + dust puff at takeoff.
   *  (E used to be a roll; we removed the 360° spin tween since E is now a
   *  vertical jump. The pose itself handles the arc.)
   */
  /** If the jump path crosses any obstacle, spawn a dust puff at the midpoint.
   *  Sells the "passed through" feel. */
  _maybeSpawnPassThroughPuff(fromX, fromY, toX, toY) {
    if (!this.remoteObstacles || this.remoteObstacles.size === 0) return;
    const mx = (fromX + toX) / 2;
    const my = (fromY + toY) / 2;
    let crossed = false;
    this.remoteObstacles.forEach((o) => {
      if (crossed) return;
      // Sample 3 points along the path; if any lies inside the obstacle, count it
      for (let t = 0.2; t <= 0.8 && !crossed; t += 0.3) {
        const px = fromX + (toX - fromX) * t;
        const py = fromY + (toY - fromY) * t;
        if (px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h) crossed = true;
      }
    });
    if (!crossed) return;
    // Big dust puff at midpoint
    const puff = this.add.ellipse(mx, my + 10, 28, 12, 0xddd9b8, 0.85).setDepth(8);
    this.tweens.add({
      targets: puff, scaleX: 2.4, scaleY: 2.4, alpha: 0,
      duration: 420, ease: 'Cubic.easeOut',
      onComplete: () => puff.destroy(),
    });
    // Three quick sparks
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = this.add.circle(mx, my, 3, 0xffffff, 0.85).setDepth(8);
      this.tweens.add({
        targets: s, x: mx + Math.cos(a) * 30, y: my + Math.sin(a) * 30,
        alpha: 0, duration: 320, ease: 'Cubic.easeOut',
        onComplete: () => s.destroy(),
      });
    }
  }

  _spawnRollVisual(dirX, dirY) {
    const me = this.remotePlayers.get(this.localId);
    if (!me) return;
    // Alpha blink for invuln frames
    this.tweens.add({
      targets: me.sprite,
      alpha: 0.35,
      duration: 110, yoyo: true, repeat: 2, ease: 'Sine.easeInOut',
      onComplete: () => { me.sprite.alpha = 1; },
    });
    // Dust puff at takeoff
    const sx = me.container.x, sy = me.container.y;
    const dust = this.add.circle(sx, sy + 14, 12, 0xffffff, 0.5).setDepth(3);
    this.tweens.add({
      targets: dust, scale: 2.0, alpha: 0,
      duration: 280, ease: 'Cubic.easeOut',
      onComplete: () => dust.destroy(),
    });
    AudioManager.uiClick?.();
  }

  /** White-flash ring + radial cracks when a shield is broken/consumed. */
  _spawnShieldBreak(worldX, worldY) {
    const ring = this.add.circle(worldX, worldY, 30, 0xffffff, 0)
      .setStrokeStyle(4, 0xffffff, 0.95).setDepth(20);
    this.tweens.add({
      targets: ring, radius: 80, scale: 3.6, alpha: 0,
      duration: 320, ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    // 8 short crack streaks radiating outward
    for (let i = 0; i < 8; i++) {
      const ang = (Math.PI * 2 * i) / 8;
      const len = 24;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const x1 = worldX + dx * 14, y1 = worldY + dy * 14;
      const x2 = worldX + dx * (14 + len), y2 = worldY + dy * (14 + len);
      const line = this.add.line(0, 0, x1, y1, x2, y2, 0x7ec8ff, 1)
        .setLineWidth(2).setDepth(20).setOrigin(0, 0);
      this.tweens.add({
        targets: line, alpha: 0,
        duration: 260, ease: 'Cubic.easeOut',
        onComplete: () => line.destroy(),
      });
    }
  }

  /** Spawn 3 fading ghost sprites that trail the dash path. */
  _spawnDashAfterimage(dirX, dirY, distance = 140) {
    const me = this.remotePlayers.get(this.localId);
    if (!me) return;
    const sx = me.container.x;
    const sy = me.container.y;
    const tex = me.sprite.texture.key;
    for (let i = 0; i < 3; i++) {
      const t = (i + 1) / 4; // 0.25, 0.5, 0.75 along the dash path
      const gx = sx + dirX * distance * t;
      const gy = sy + dirY * distance * t;
      const ghost = this.add.image(gx, gy, tex)
        .setDisplaySize(me.sprite.displayWidth, me.sprite.displayHeight)
        .setOrigin(0.5, 0.85).setAlpha(0.55).setTint(0x9be0ff).setDepth(4);
      this.tweens.add({
        targets: ghost, alpha: 0,
        duration: 280 + i * 60, ease: 'Cubic.easeOut',
        onComplete: () => ghost.destroy(),
      });
    }
    // Small dust puff at the starting point
    const dust = this.add.circle(sx, sy + 16, 14, 0xffffff, 0.45).setDepth(3);
    this.tweens.add({
      targets: dust, scale: 2.4, alpha: 0,
      duration: 280, ease: 'Cubic.easeOut',
      onComplete: () => dust.destroy(),
    });
  }

  /** Build the action buttons — MOBA-style fan in the bottom-right corner.
   *  SMASH sits anchored in the corner (big); the 4 skills arc around it. */
  _buildActionButtons() {
    const { width: W, height: H } = this.scale;
    const smashR = 40;
    const skillR = 28;
    const arcDist = 130; // center-to-center; large enough to keep skills clear of smash + each other
    const smashCx = W - 18 - smashR;
    const smashCy = H - 18 - smashR;
    const rad = (deg) => deg * Math.PI / 180;
    const ax = (deg) => smashCx + arcDist * Math.cos(rad(deg));
    const ay = (deg) => smashCy + arcDist * Math.sin(rad(deg));
    // 4 skills span a 90° arc from "directly left of smash" (180°) to
    // "directly above" (270°), 30° apart.
    const specs = [
      { label: 'SMASH',  key: 'SPC',    color: 0xffd23f, slot: 'basic', cx: smashCx,    cy: smashCy,    r: smashR },
      { label: 'DASH',   key: 'Q · 10', color: 0x39c2ff, slot: 'q',     cx: ax(180),    cy: ay(180),    r: skillR },
      { label: 'SHIELD', key: 'W · 15', color: 0xb084ff, slot: 'w',     cx: ax(210),    cy: ay(210),    r: skillR },
      { label: 'JUMP',   key: 'E · 8',  color: 0x7ed957, slot: 'e',     cx: ax(240),    cy: ay(240),    r: skillR },
      { label: 'ULT',    key: 'R · 25', color: 0xff5e94, slot: 'r',     cx: ax(270),    cy: ay(270),    r: skillR },
    ];
    this._skillButtons = {};
    this._actionButtons = [];
    for (const s of specs) {
      const cx = s.cx;
      const cy = s.cy;
      const r = s.r;
      const btn = this.add.container(cx, cy).setScrollFactor(0).setDepth(50);
      const ring = this.add.circle(0, 0, r, 0x000000, 0.6).setStrokeStyle(3, s.color);
      const lbl  = this.add.text(0, -4, s.label, {
        fontFamily: 'Arial Black, sans-serif', fontSize: 12, color: '#ffffff',
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5);
      const kbd  = this.add.text(0, 14, s.key, {
        fontFamily: 'Consolas, monospace', fontSize: 9, color: '#aab0c0',
      }).setOrigin(0.5);
      // Cooldown overlay — semi-transparent dark disc that shrinks as CD ticks down.
      const cdOverlay = this.add.graphics();
      cdOverlay.setVisible(false);
      // Numeric remaining-seconds shown over the overlay
      const cdText = this.add.text(0, 0, '', {
        fontFamily: 'Arial Black, sans-serif', fontSize: 14, color: '#ffffff',
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setVisible(false);
      btn.add([ring, lbl, kbd, cdOverlay, cdText]);

      const hit = this.add.zone(cx, cy, r * 2, r * 2).setScrollFactor(0).setDepth(51)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', (p, lx, ly, e) => {
        e?.stopPropagation?.();
        if (s.slot === 'basic') {
          this._triggerAction('smash');
        } else {
          this._castSkill(s.slot);
        }
        this.tweens.add({ targets: btn, scaleX: 0.9, scaleY: 0.9, duration: 80, yoyo: true });
      });
      btn._hit = hit;
      btn._kbd = kbd;
      btn._kbdLabel = s.key;
      btn._color = s.color;
      btn._slot  = s.slot;
      btn._radius = r;
      btn._cdOverlay = cdOverlay;
      btn._cdText = cdText;
      this._actionButtons.push(btn);
      if (s.slot !== 'basic') this._skillButtons[s.slot] = btn;
    }
  }

  /** Per-frame: dim skill buttons the local player can't currently afford. */
  _updateSkillCooldowns() {
    if (!this._skillButtons) return;
    const me = this.room?.state?.players?.get(this.localId);
    if (!me) return;
    const energy = me.energy | 0;
    const broken = !!me.broken;
    const free = this.room?.state?.event === 'hackathon';
    for (const slot of ['q', 'w', 'e', 'r']) {
      const btn = this._skillButtons[slot];
      if (!btn) continue;
      const affordable = !broken && energy >= this._skillCost(slot);
      // Hackathon: skills are free — make the buttons breathe so people spam them.
      const wantAlpha = !affordable ? 0.4 : (free ? 0.75 + 0.25 * Math.sin(this.time.now / 120) : 1);
      if (btn.alpha !== wantAlpha) btn.alpha = wantAlpha;
      if (btn._kbd) {
        const label = free ? 'FREE' : btn._kbdLabel;
        if (btn._kbd.text !== label) btn._kbd.setText(label).setColor(free ? '#ff66ff' : '#aab0c0');
      }
      // Hide the legacy CD overlay/text (kept on object but never shown)
      if (btn._cdOverlay && btn._cdOverlay.visible) btn._cdOverlay.setVisible(false);
      if (btn._cdText && btn._cdText.visible) btn._cdText.setVisible(false);
    }
  }

  /** Returns true if the pointer is over any action button (so pointerdown is consumed). */
  _actionButtonsHit(p) {
    if (!this._actionButtons) return false;
    for (const btn of this._actionButtons) {
      const dx = p.x - btn.x, dy = p.y - btn.y;
      if (dx * dx + dy * dy < 36 * 36) return true;
    }
    return false;
  }

  /** Returns true if the pointer is over the touch chat button. */
  _chatBtnHit(p) {
    const z = this._chatBtnHitZone;
    if (!z) return false;
    const dx = p.x - z.x, dy = p.y - z.y;
    return dx * dx + dy * dy < z.r * z.r;
  }

  _despawnRemote(sessionId) {
    const r = this.remotePlayers.get(sessionId);
    if (!r) return;
    r.container.destroy();
    this.remotePlayers.delete(sessionId);
  }

  /**
   * Left-click resolver:
   *   - bug under cursor   → set attack target, walk to it + auto-smash
   *   - player under cursor → set follow target, walk to them
   *   - empty ground       → walk-to-point
   */
  _onWorldClick(wx, wy) {
    const TARGET_TOL = 44;
    // The Deadline is big — clicking anywhere on it locks on.
    const bp = this._bossView?.pos();
    if (bp && Math.hypot(bp.x - wx, (bp.y - 20) - wy) < 95) {
      this._attackTarget = { type: 'boss' };
      this._moveTarget = null;
      this._flashTargetMarker(wx, wy, 0xff5252);
      this._showSelectionRing(0xff5252);
      return;
    }
    let bugId = null, bugD = Infinity;
    this.remoteBugs.forEach((b, id) => {
      if (!b.alive || b.hidden) return;
      const d = Math.hypot(b.x - wx, b.y - wy);
      if (d < TARGET_TOL && d < bugD) { bugD = d; bugId = id; }
    });
    let pSid = null, pD = Infinity;
    this.remotePlayers.forEach((r, sid) => {
      if (sid === this.localId) return;
      const d = Math.hypot(r.container.x - wx, r.container.y - wy);
      if (d < TARGET_TOL && d < pD) { pD = d; pSid = sid; }
    });
    if (bugId != null && bugD <= pD) {
      this._attackTarget = { type: 'bug', id: bugId };
      this._moveTarget = null;
      this._flashTargetMarker(wx, wy, 0xff6b6b);
      this._showSelectionRing(0xff6b6b);
    } else if (pSid != null) {
      this._attackTarget = { type: 'player', sid: pSid };
      this._moveTarget = null;
      this._flashTargetMarker(wx, wy, 0xffd23f);
      this._showSelectionRing(0xffd23f);
    } else {
      this._attackTarget = null;
      this._selectionRing.setVisible(false);
      this._setMoveTarget(wx, wy);
    }
  }

  _showSelectionRing(color) {
    this._selectionRing.setStrokeStyle(3, color, 0.9).setVisible(true).setAlpha(1);
    // Subtle pulsing scale to make the ring feel "live"
    this.tweens.killTweensOf(this._selectionRing);
    this.tweens.add({
      targets: this._selectionRing,
      scaleX: 1.18, scaleY: 1.18, alpha: 0.55,
      duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  _hideSelectionRing() {
    if (!this._selectionRing) return;
    this.tweens.killTweensOf(this._selectionRing);
    this._selectionRing.setVisible(false).setAlpha(1).setScale(1);
  }

  /** Set a fixed move destination + cyan ring "move ping". */
  _setMoveTarget(worldX, worldY) {
    this._moveTarget = { x: worldX, y: worldY };
    this._flashTargetMarker(worldX, worldY, 0x7ec8ff);
  }

  _flashTargetMarker(x, y, color) {
    // Pool a single marker object — reusing it on every click avoids the GC
    // spikes that rapid create+destroy would cause.
    if (!this._moveMarker) {
      this._moveMarker = this.add.circle(0, 0, 8, 0xffffff, 0).setDepth(6);
    }
    const m = this._moveMarker;
    this.tweens.killTweensOf(m);
    m.setPosition(x, y);
    m.setRadius(8);
    m.setAlpha(1);
    m.setStrokeStyle(3, color, 1);
    this.tweens.add({
      targets: m, radius: 22, alpha: 0,
      duration: 420, ease: 'Cubic.easeOut',
    });
  }

  /** Resolve current attack target → live world position (or null if gone). */
  _resolveAttackTargetPos() {
    if (!this._attackTarget) return null;
    if (this._attackTarget.type === 'boss') {
      const bp = this._bossView?.pos();
      if (!bp) { this._attackTarget = null; return null; }
      // Stand at its edge (hug 110) and swing from further out (big hitbox).
      return { x: bp.x, y: bp.y, isBug: true, boss: true, reach: SMASH_REACH + 60, hug: 110 };
    }
    if (this._attackTarget.type === 'bug') {
      const b = this.remoteBugs.get(this._attackTarget.id);
      if (!b || !b.alive || b.hidden) { this._attackTarget = null; return null; }
      return { x: b.x, y: b.y, isBug: true };
    }
    if (this._attackTarget.type === 'player') {
      const r = this.remotePlayers.get(this._attackTarget.sid);
      if (!r) { this._attackTarget = null; return null; }
      return { x: r.container.x, y: r.container.y, isBug: false };
    }
    return null;
  }

  /** Render the virtual joystick base + knob (mobile only). */
  _buildJoystick() {
    const { height: H } = this.scale;
    const baseX = 92, baseY = H - 92, baseR = 56, knobR = 26;
    this._stick = {
      baseX, baseY, baseR, knobR,
      base: this.add.circle(baseX, baseY, baseR, 0x000000, 0.45)
        .setStrokeStyle(2, 0x7ec8ff, 0.7).setScrollFactor(0).setDepth(48),
      knob: this.add.circle(baseX, baseY, knobR, 0x7ec8ff, 0.85)
        .setStrokeStyle(2, 0xffffff, 0.9).setScrollFactor(0).setDepth(49),
      activeId: null,
    };
    // Capture TOUCH on left half of the screen → start joystick.
    // Mouse clicks are ignored so the click-to-move handler runs unimpeded
    // on laptops that have touch capability.
    this.input.on('pointerdown', (p) => {
      // Any touch pointer (not the mouse) on the left half drives the knob.
      // Don't gate on p.pointerType — some mobile browsers leave it unset,
      // which silently killed the joystick.
      if (!this._isJoystickTouch(p)) return;
      if (this._stick.activeId != null) return;
      if (this._actionButtonsHit(p)) return;
      this._stick.activeId = p.id;
      this._stick.baseX = p.x;
      this._stick.baseY = p.y;
      this._stick.base.setPosition(p.x, p.y);
      this._stick.knob.setPosition(p.x, p.y);
      this._stickDir = null; // set on actual drag, not on touch-down (dead zone)
      // This touch started the joystick — cancel any tap-to-move/attack that the
      // global handlers may have registered for the same press.
      this._moveTarget = null;
      if (this._attackTarget) { this._attackTarget = null; this._hideSelectionRing(); }
    });
    this.input.on('pointermove', (p) => {
      if (this._stick.activeId !== p.id) return;
      const dx = p.x - this._stick.baseX;
      const dy = p.y - this._stick.baseY;
      const d = Math.hypot(dx, dy);
      const max = this._stick.baseR;
      const clamped = Math.min(d, max);
      const nx = d > 0 ? dx / d : 0;
      const ny = d > 0 ? dy / d : 0;
      this._stick.knob.setPosition(this._stick.baseX + nx * clamped, this._stick.baseY + ny * clamped);
      // Dead-zone the knob so a tiny touch doesn't move
      const mag = clamped / max;
      this._stickDir = (mag < 0.2) ? null : { x: nx * mag, y: ny * mag };
    });
    const onRelease = (p) => {
      if (this._stick.activeId !== p.id) return;
      this._stick.activeId = null;
      this._stickDir = null;
      this._stick.knob.setPosition(this._stick.baseX, this._stick.baseY);
    };
    this.input.on('pointerup', onRelease);
    this.input.on('pointerupoutside', onRelease);
  }

  /** True when `p` is a touch (not the mouse) on the joystick's left-half zone. */
  _isJoystickTouch(p) {
    if (!this._stick) return false;
    if (p === this.input.mousePointer) return false;
    return p.x <= this.scale.width * 0.5;
  }

  _joystickHit(p) {
    if (!this._stick) return false;
    const dx = p.x - this._stick.baseX, dy = p.y - this._stick.baseY;
    return (dx * dx + dy * dy) < this._stick.baseR * this._stick.baseR * 2.5;
  }

  _spawnBrokenBurst(worldX, worldY) {
    // Yellow sparks + radial dust on laptop break.
    const ring = this.add.circle(worldX, worldY, 14, 0xffd23f, 0)
      .setStrokeStyle(3, 0xffd23f, 0.95).setDepth(20);
    this.tweens.add({
      targets: ring, radius: 70, scale: 4, alpha: 0,
      duration: 380, ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 60 + Math.random() * 40;
      const s = this.add.text(worldX, worldY, '✦', {
        fontFamily: 'Arial Black, sans-serif', fontSize: 14, color: '#ffd23f',
      }).setOrigin(0.5).setDepth(20);
      this.tweens.add({
        targets: s,
        x: worldX + Math.cos(ang) * r,
        y: worldY + Math.sin(ang) * r,
        alpha: 0, duration: 480, ease: 'Cubic.easeOut',
        onComplete: () => s.destroy(),
      });
    }
  }

  _spawnParryRing(worldX, worldY) {
    const ring = this.add.circle(worldX, worldY, 14, 0x7ec8ff, 0)
      .setStrokeStyle(4, 0xb084ff, 0.95).setDepth(20);
    this.tweens.add({
      targets: ring, radius: 70, scale: 5, alpha: 0,
      duration: 460, ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  _spawnKickRing(worldX, worldY) {
    const ring = this.add.circle(worldX, worldY, 12, 0xffd23f, 0)
      .setStrokeStyle(4, 0xffd23f, 0.95).setDepth(20);
    this.tweens.add({
      targets: ring,
      radius: 90, scale: 7, alpha: 0,
      duration: 320, ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  _drawMinimap() {
    if (!this._mmG || !this.room?.state) return;
    const g = this._mmG;
    g.clear();
    const ox = this._mmX, oy = this._mmY;
    const sx = MINIMAP_W / WORLD_W;
    const sy = MINIMAP_H / WORLD_H;

    // Obstacles (gray rectangles, drawn under bugs/players)
    g.fillStyle(0x4a5060, 0.7);
    this.remoteObstacles.forEach((o) => {
      g.fillRect(ox + o.x * sx, oy + o.y * sy, Math.max(2, o.w * sx), Math.max(2, o.h * sy));
    });

    // Bugs (tiny pink dots; hidden ones are dimmer)
    this.remoteBugs.forEach((b) => {
      if (!b.alive) return;
      g.fillStyle(0xff66aa, b.hidden ? 0.25 : 0.85);
      g.fillCircle(ox + b.x * sx, oy + b.y * sy, 1.6);
    });

    // Health pickups (green plus dots, slightly bigger so they stand out)
    this.remotePickups.forEach((h) => {
      if (!h.alive) return;
      g.fillStyle(0x7ed957, 0.95);
      g.fillCircle(ox + h.x * sx, oy + h.y * sy, 2.2);
    });

    // Camera viewport rectangle (so you can see what's on screen)
    const cam = this.cameras.main;
    const vx = cam.scrollX * sx, vy = cam.scrollY * sy;
    const vw = cam.width * sx, vh = cam.height * sy;
    g.lineStyle(1, 0xffffff, 0.35);
    g.strokeRect(ox + vx, oy + vy, vw, vh);

    // Players (colored dots; bigger + white outline for self; gold ring = Tech Lead)
    this.remotePlayers.forEach((r, sid) => {
      const isMe = (sid === this.localId);
      const wx = r.container.x, wy = r.container.y;
      g.fillStyle(r.color, 1);
      g.fillCircle(ox + wx * sx, oy + wy * sy, isMe ? 3.2 : 2.4);
      if (isMe) {
        g.lineStyle(1, 0xffffff, 1);
        g.strokeCircle(ox + wx * sx, oy + wy * sy, 4);
      }
      if (sid === this._crownSid) {
        g.lineStyle(1.5, 0xffd700, 1);
        g.strokeCircle(ox + wx * sx, oy + wy * sy, 5.5);
      }
    });

    // Objectives on top: the CEO's golden bug + the Deadline boss (pulsing)
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 160);
    this.remoteBugs.forEach((b) => {
      if (!b.alive || !b.golden) return;
      g.fillStyle(0xffd700, 1);
      g.fillCircle(ox + b.x * sx, oy + b.y * sy, 3.5);
      g.lineStyle(1.5, 0xffd700, 0.4 + 0.6 * pulse);
      g.strokeCircle(ox + b.x * sx, oy + b.y * sy, 5 + 3 * pulse);
    });
    const bp = this._bossView?.pos();
    if (bp) {
      g.fillStyle(0xff3b3b, 1);
      g.fillCircle(ox + bp.x * sx, oy + bp.y * sy, 4.5);
      g.lineStyle(1.5, 0xff3b3b, 0.4 + 0.6 * pulse);
      g.strokeCircle(ox + bp.x * sx, oy + bp.y * sy, 6 + 3 * pulse);
    }
  }

  _onLocalComboChange(newCombo, oldCombo) {
    if (newCombo <= 0) {
      // Faded out
      this._comboText.setText('');
      this._comboMultText.setText('');
      this._comboText.setAlpha(0);
      this._comboMultText.setAlpha(0);
      return;
    }
    const color = comboColor(newCombo);
    const mult  = comboMultLabel(newCombo);
    this._comboText.setText(`COMBO ×${newCombo}`).setColor(color).setAlpha(1).setScale(1);
    this._comboMultText.setText(mult).setColor(color).setAlpha(mult ? 1 : 0);
    // Pop animation
    this.tweens.add({
      targets: [this._comboText, this._comboMultText],
      scaleX: 1.18, scaleY: 1.18, duration: 90, yoyo: true, ease: 'Sine.easeOut',
    });
    // Audio
    AudioManager.bugKill?.();
    const newTier = comboTier(newCombo);
    const oldTier = comboTier(oldCombo);
    if (newTier > oldTier) AudioManager.combo?.(newTier);
  }

  _onPhaseChange() {
    if (!this.room) return;
    const phase = this.room.state.phase;
    if (phase === 'results') {
      this._showResults();
    } else {
      this._resultsOverlay.setVisible(false);
    }
  }

  _showResults() {
    const s = this.room.state;
    this._resultsTitle.setText(`ROUND ${s.round} OVER`);
    if (s.winnerScore > 0) {
      this._resultsWinner.setText(`🏆  ${s.winnerName}   ${s.winnerScore}`);
    } else {
      this._resultsWinner.setText('no winner — nobody smashed anything');
    }
    const lines = [];
    const arr = [];
    s.players.forEach((p, sid) => arr.push({ sid, name: p.name, score: p.score | 0 }));
    arr.sort((a, b) => b.score - a.score);
    arr.forEach(({ sid, name, score }) => {
      const me = (sid === this.localId) ? ' ← you' : '';
      lines.push(`${String(score).padStart(4, ' ')}  ${name}${me}`);
    });
    this._resultsBoard.setText(lines.join('\n'));
    this._resultsOverlay.setVisible(true);
  }

  _refreshPlayerList() {
    const lines = [];
    const st = this.room?.state;
    if (st?.players) {
      const arr = [];
      st.players.forEach((p, sid) => arr.push({
        sid, name: p.name, score: p.score | 0, level: p.level | 0, bot: !!p.isBot, broken: !!p.broken,
      }));
      arr.sort((a, b) => b.score - a.score);
      const TOP = 8;
      const row = (e, rank) => {
        const me = (e.sid === this.localId) ? ' ← you' : '';
        const crown = (e.sid === this._crownSid) ? '👑 ' : '';
        const bot = e.bot ? '🤖' : '';
        const tag = e.broken ? '💻✖' : `Lv${e.level || 1}`;
        return `${rank}. ${crown}${bot}${e.name} · ${tag} · ${e.score}${me}`;
      };
      lines.push(st.bounty > 0 ? `LEADERBOARD · 👑 bounty ${st.bounty}` : 'LEADERBOARD');
      arr.slice(0, TOP).forEach((e, i) => lines.push(row(e, i + 1)));
      const myIdx = arr.findIndex((e) => e.sid === this.localId);
      if (myIdx >= TOP) lines.push('…', row(arr[myIdx], myIdx + 1));
    }
    this._playerListText.setText(lines.join('\n'));
  }

  update(_, dtMs) {
    const dt = dtMs / 1000;

    // ----- Move local player (arrows → joystick → attack target → move target) -----
    if (this.localId) {
      let dx = 0, dy = 0;
      const me0 = this.remotePlayers.get(this.localId);

      // Arrow-key direction (highest priority for laptop play). Suppressed while
      // typing in chat so WASD/arrows go to the text field, not movement.
      let kx = 0, ky = 0;
      if (this._cursors && !this._chatActive) {
        if (this._cursors.left.isDown)  kx -= 1;
        if (this._cursors.right.isDown) kx += 1;
        if (this._cursors.up.isDown)    ky -= 1;
        if (this._cursors.down.isDown)  ky += 1;
      }
      const kbActive = (kx !== 0 || ky !== 0);

      if (kbActive) {
        const len = Math.hypot(kx, ky) || 1;
        dx = kx / len; dy = ky / len;
        this._moveTarget = null;
        if (this._attackTarget) { this._attackTarget = null; this._hideSelectionRing(); }
      } else if (this._stickDir && (this._stickDir.x !== 0 || this._stickDir.y !== 0)) {
        dx = this._stickDir.x; dy = this._stickDir.y;
        this._moveTarget = null;
        if (this._attackTarget) { this._attackTarget = null; this._hideSelectionRing(); }
      } else {
        const attackPos = this._resolveAttackTargetPos();
        if (attackPos) {
          // Selection ring follows the target's live position
          this._selectionRing.setPosition(attackPos.x, attackPos.y);
          // Walk toward target; auto-smash when in range (only for bugs).
          const tx = attackPos.x - this.localPos.x;
          const ty = attackPos.y - this.localPos.y;
          const dist = Math.hypot(tx, ty);
          const HUG = attackPos.hug ?? 28;
          const reachA = attackPos.reach ?? SMASH_REACH;
          if (attackPos.boss && dist < reachA) {
            this._triggerAction('smash', { boss: true });
          } else if (attackPos.isBug && dist < reachA) {
            this._triggerAction('smash', { targetId: this._attackTarget.id });
          } else if (!attackPos.isBug && dist < SMASH_REACH && !this._isTruce()) {
            // PvP — locked onto another player, auto-smash them (not during a truce)
            this._triggerAction('smash', { targetSid: this._attackTarget.sid });
          }
          if (attackPos.isBug && dist > HUG) {
            dx = tx / dist; dy = ty / dist;
          } else if (!attackPos.isBug && dist > HUG) {
            dx = tx / dist; dy = ty / dist;
          } else {
            dx = 0; dy = 0;
          }
        } else {
          // No active attack target (cleared by death/hide/leave) → hide ring
          if (this._selectionRing.visible) this._hideSelectionRing();
          if (this._moveTarget) {
            const tx = this._moveTarget.x - this.localPos.x;
            const ty = this._moveTarget.y - this.localPos.y;
            const dist = Math.hypot(tx, ty);
            if (dist < 4) {
              this._moveTarget = null;
            } else {
              dx = tx / dist; dy = ty / dist;
            }
          }
        }
      }
      // Stunned (ult hit / missed deadline): the server ignores our moves, so
      // stand still instead of drifting away from where everyone else sees us.
      const stunned = !!me0 && (me0.stunnedUntil || 0) > this._srvNow();
      if (stunned) { dx = 0; dy = 0; }
      if (dx !== 0 || dy !== 0) {
        const fromX = this.localPos.x, fromY = this.localPos.y;
        const toX = Phaser.Math.Clamp(fromX + dx * MOVE_SPEED * dt, 0, WORLD_W);
        const toY = Phaser.Math.Clamp(fromY + dy * MOVE_SPEED * dt, 0, WORLD_H);
        // Same slide-along obstacle collision as the server, so local and
        // server positions agree (and server corrections don't rubber-band).
        const out = this._clampLocalMove(fromX, fromY, toX, toY);
        this.localPos.x = out.x;
        this.localPos.y = out.y;
        // Remember last non-zero movement direction for skill aiming (dash, etc.)
        this._lastDirX = dx;
        this._lastDirY = dy;
      }

      // Update local visual immediately (no waiting on server echo)
      const me = this.remotePlayers.get(this.localId);
      if (me) {
        me.container.x = this.localPos.x;
        me.container.y = this.localPos.y;
        me.target.x = this.localPos.x;
        me.target.y = this.localPos.y;
      }

      // Send move to server at ~20 Hz (not while stunned — it would be rejected)
      const now = this.time.now;
      if (this.room && !stunned && now - this._lastSentAt > 50) {
        this._lastSentAt = now;
        this.room.send('move', { x: this.localPos.x, y: this.localPos.y });
      }
    }

    // ----- Lerp remote players toward their last-known target + animate -----
    const now = this.time.now;
    const peerLerp = Math.min(1, 8 * dt); // matches slower 12.5Hz patch broadcast
    this.remotePlayers.forEach((r, sid) => {
      // Guard: skip if this player's container was destroyed mid-frame
      if (!r.container || !r.container.scene) return;
      // For LOCAL player, container.x was already updated to localPos before
      // this loop ran — so we must compare against a separately-tracked
      // previous frame position, not container.x itself.
      if (r._prevX === undefined) { r._prevX = r.container.x; r._prevY = r.container.y; }
      const oldX = r._prevX, oldY = r._prevY;
      if (sid !== this.localId) {
        r.container.x = Phaser.Math.Linear(r.container.x, r.target.x, peerLerp);
        r.container.y = Phaser.Math.Linear(r.container.y, r.target.y, peerLerp);
      }
      const dx = r.container.x - oldX;
      const dy = r.container.y - oldY;
      r._prevX = r.container.x; r._prevY = r.container.y;
      const speed = Math.hypot(dx, dy) / Math.max(dt, 0.001);
      const moving = speed > 8;
      if (Math.abs(dx) > 0.1) r.facing = (dx >= 0) ? 1 : -1;

      // Footstep dust puffs while running — fires roughly twice per second.
      if (moving) {
        if (!r._lastFootstepAt || now - r._lastFootstepAt > 260) {
          r._lastFootstepAt = now;
          const fx = r.container.x + (Math.random() - 0.5) * 8;
          const fy = r.container.y + 14;   // right at the feet
          const puff = this.add.ellipse(fx, fy, 12, 5, 0xc8d4e0, 0.5).setDepth(3);
          this.tweens.add({
            targets: puff, scaleX: 1.8, scaleY: 1.8, alpha: 0,
            duration: 360, ease: 'Cubic.easeOut',
            onComplete: () => puff.destroy(),
          });
        }
      }

      // Pick the texture (or atlas frame) based on action / movement / direction.
      const activeAction = (r.actionUntil && now < r.actionUntil) ? r.action : null;
      const stateName = activeAction
        ? activeAction
        : (moving ? 'run' : 'idle');

      if (r.stickman) {
        // Procedural renderer — pose interpolation, no texture swap
        if (stateName !== r._lastState) {
          r._lastState = stateName;
          r._stateStartAt = now;
        }
        const elapsed = activeAction ? (now - (r.actionStartAt || now)) : (now - (r._stateStartAt || 0));
        const lv = r.level || 1;
        const scale = levelScale(lv);
        r.stickman.update(stateName, elapsed, r.facing, { broken: r.broken, scale });
      } else if (this._useAtlas) {
        // Atlas path — picks {action}_{dir}_{frame} from the rendered atlas.
        const dir = dirFromVector(dx, dy);
        const elapsed = activeAction ? (now - (r.actionStartAt || now)) : (now - (r._stateStartAt || 0));
        if (stateName !== r._lastState) {
          r._lastState = stateName;
          r._stateStartAt = now;
        }
        const frameName = atlasFrame(stateName, dir, activeAction ? elapsed : (now - r._stateStartAt));
        if (frameName !== r.lastKey) {
          r.lastKey = frameName;
          // setFrame throws if the frame doesn't exist (e.g. while atlas still loading) — guard it.
          if (this.textures.get(ATLAS_KEY).has(frameName)) {
            r.sprite.setTexture(ATLAS_KEY, frameName);
          }
        }
        // Atlas frames are already directional — do NOT flip them
      } else {
        // SVG fallback — single-pose textures with horizontal flip for facing.
        // When broken, prefer state-specific broken variants (idle/run swap
        // their face + show the cracked red laptop); skill poses don't fire
        // while broken so we only need idle/run variants.
        let key;
        if (r.broken) {
          if (stateName === 'run') {
            const frame = Math.floor(now / 160) % 2;
            key = frame === 0 ? 'stick-run-broken' : 'stick-run2-broken';
          } else {
            key = 'stick-idle-broken';
          }
        }
        else if (stateName === 'smash') key = 'stick-smash';
        else if (stateName === 'kick')  key = 'stick-kick';
        else if (stateName === 'punch') key = 'stick-punch';
        else if (stateName === 'jump')  key = 'stick-jump';
        else if (stateName === 'parry') key = 'stick-parry';
        else if (stateName === 'run') {
          const frame = Math.floor(now / 160) % 2;
          key = frame === 0 ? 'stick-run' : 'stick-run2';
        } else {
          key = 'stick-idle';
        }
        if (key !== r.lastKey) {
          r.lastKey = key;
          // Guard: only swap to a key that's actually loaded — missing
          // textures cause Phaser to crash later on frame.cut access.
          if (this.textures.exists(key)) {
            r.sprite.setTexture(key);
          }
        }
        if (r.sprite && r.sprite.setFlipX) r.sprite.setFlipX(r.facing < 0);
      }

      // Vertical motion: jump arc / idle bob.
      // Jump arc + idle bob — only for SVG fallback. Procedural renderer
      // handles its own yOffset (jump pose lifts feet) and breathing (idle pose).
      if (!r.stickman) {
        if (activeAction === 'jump') {
          const t = (now - (r.actionStartAt || now)) / 420;
          const lift = Math.sin(Math.max(0, Math.min(1, t)) * Math.PI) * 18;
          r.sprite.y = -lift;
        } else if (!moving && !activeAction) {
          r.sprite.y = Math.sin((now + (r._bobOffset || 0)) / 480) * 1.6;
        } else if (r.sprite.y !== 0) {
          r.sprite.y = 0;
        }
      }

      // ----- Growth visuals (continuous scale per XP) -----
      // Guard: if sprite was destroyed mid-frame, skip this update tick
      if (!r.sprite || !r.sprite.scene) return;
      const lv = r.level || 1;
      const s = smoothScale(lv, r.xp || 0);
      const sChanged = (r._lastSmoothScale === undefined) ||
                       Math.abs(s - r._lastSmoothScale) > 0.01;
      if (sChanged) {
        r._lastSmoothScale = s;
        const HEAD_TOP = -85 * s;
        const FEET_Y   = 16 * s;   // shadow position — sits right at the feet
        r._headTop = HEAD_TOP;
        if (!r.stickman) r.sprite.setDisplaySize(78 * s, 100 * s);
        r.shadow.setPosition(0, FEET_Y).setScale(s);
        r.ring.setPosition(0, FEET_Y).setScale(s);
        r.aura.setPosition(0, FEET_Y);
        // Hat sits ON the head (the drawn head's top is ~74% of the way up the
        // sprite); the label stack shifts up to make room when one is worn.
        const hasHat = !!(r.hatText && r.hatText.text);
        const STACK = HEAD_TOP - (hasHat ? 10 * s + 6 : 0);
        if (r.hatText) {
          r.hatText.setFontSize(Math.round(14 + 8 * s));
          r.hatText.y = -74 * s + 5 * s;
        }
        // Float labels with the growing head
        r.label.y      = STACK - 16;
        r.title.y      = STACK - 2;
        r.healthBg.y   = STACK - 34;
        r.healthFill.y = STACK - 34;
        r.energyBg.y   = STACK - 29;
        r.energyFill.y = STACK - 29;
        // Level badge midpoint between health + energy bars
        const badgeY = STACK - 31;
        r.levelRingBg.y = badgeY;
        r.levelText.y   = badgeY;
        r._stackTop = STACK;
        if (r.crownText) r.crownText.y = STACK - 52;
        // Force redraw of the arc next frame at the new Y
        r._lastBadgeXp = -1;
      }

      // Tech Lead crown — bob above everything
      if (r.crownText) {
        const crowned = sid === this._crownSid;
        if (crowned !== r.crownText.visible) r.crownText.setVisible(crowned);
        if (crowned) {
          r.crownText.y = (r._stackTop ?? -85) - 52 + Math.sin(now / 240) * 3;
          r.crownText.angle = Math.sin(now / 400) * 8;
        }
      }
      // Whole-level transition: refresh the title text + reset aura
      if (lv !== r._lastLv) {
        r._lastLv = lv;
        r.title.setText(levelTitle(lv)).setColor(this._cssColor(r.color));
        if (lv < 5) {
          r.aura.setStrokeStyle(2, r.color, 0).setFillStyle(r.color, 0);
        }
      }

      // Shield disc — gentle pulse while active
      if (r.shielded) {
        const sp = 0.85 + 0.15 * Math.sin(now / 180);
        r.shieldDisc.setAlpha(sp);
      }

      // Stun ⭐ — spin above head while stunned; hide after server window ends
      // (server timestamps → compare against the synced server clock)
      const srvNow = this._srvNow();
      const stunMs = (r.stunnedUntil || 0) - srvNow;
      if (stunMs > 0) {
        if (!r.stunStar.visible) {
          r.stunStar.setVisible(true);
          if (r.sprite.setTint) r.sprite.setTint(0xaaaaaa);
        }
        // Position above head + slow rotation
        r.stunStar.y = (r._headTop ?? -85) - 18;
        r.stunStar.angle = (now / 4) % 360;
      } else if (r.stunStar.visible) {
        r.stunStar.setVisible(false);
        if (!r.broken && r.sprite.clearTint) r.sprite.clearTint();
      }

      // Spawn protection / roll i-frames — quick blink (skipped while broken,
      // which has its own alpha pulse below)
      if (!r.broken) {
        const inv = (r.invulnUntil || 0) - srvNow;
        if (inv > 0) {
          r._invBlink = true;
          r.sprite.setAlpha(Math.floor(now / 110) % 2 ? 0.45 : 1);
        } else if (r._invBlink) {
          r._invBlink = false;
          r.sprite.setAlpha(1);
        }
      }

      // Aura pulse — only at Lv5+ and only the per-frame work that has to run
      if (lv >= 5) {
        const pulse = 0.45 + 0.25 * Math.sin(now / 220);
        r.aura.setStrokeStyle(3, r.color, pulse);
        r.aura.setFillStyle(r.color, 0.15 * pulse);
        r.aura.setScale(levelScale(lv) * (1 + 0.06 * Math.sin(now / 220)));
      }

      // Health bar (above): width every frame, color shifts at low tiers for danger feel
      const hMax = r.maxHealth || 80;
      const hRatio = Math.max(0, Math.min(1, r.health / hMax));
      r.healthFill.width = 48 * hRatio;
      const hTier = (hRatio > 0.5) ? 2 : (hRatio > 0.25 ? 1 : 0);
      if (hTier !== r._healthTier) {
        r._healthTier = hTier;
        r.healthFill.setFillStyle(hTier === 2 ? 0x7ed957 : hTier === 1 ? 0xffd23f : 0xff5252, 1);
      }

      // Level badge: number + MOBA-style XP progress ring around the number.
      // Redraw only when level or XP changes (cheap — graphics call per change).
      if (r.level !== r._lastBadgeLv || r.xp !== r._lastBadgeXp) {
        r._lastBadgeLv = r.level;
        r._lastBadgeXp = r.xp;
        if (r.levelText && r.levelText.setText) {
          r.levelText.setText(String(r.level | 0));
          // Tint number by tier: yellow → orange → cyan → magenta → green → gold
          const tierColors = ['#ffd23f', '#ffb347', '#7ec8ff', '#c44dff', '#7ed957', '#ffd700'];
          r.levelText.setColor(tierColors[Math.min(5, (r.level | 0) - 1)]);
        }
        // XP progress arc (0..1 of way to next level)
        const idx = Math.max(0, Math.min(LEVEL_XP_THRESHOLDS.length - 1, (r.level | 0) - 1));
        const isMaxLv = idx === LEVEL_XP_THRESHOLDS.length - 1;
        let prog = 1;
        if (!isMaxLv) {
          const xpStart = LEVEL_XP_THRESHOLDS[idx];
          const xpEnd   = LEVEL_XP_THRESHOLDS[idx + 1];
          prog = Math.max(0, Math.min(1, ((r.xp | 0) - xpStart) / Math.max(1, xpEnd - xpStart)));
        }
        const g = r.levelRingArc;
        if (g && g.clear) {
          g.clear();
          const cx = r.levelRingBg.x, cy = r.levelRingBg.y;
          const radius = 9;
          // Track ring (dim background)
          g.lineStyle(2, 0x39394a, 0.85);
          g.strokeCircle(cx, cy, radius);
          // Progress arc — starts at top (-90°) and sweeps clockwise
          if (prog > 0.001) {
            g.lineStyle(2, isMaxLv ? 0xffd700 : 0xffd23f, 1);
            g.beginPath();
            g.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2, false);
            g.strokePath();
          }
        }
      }

      // Energy bar (below): flat blue, width-only
      const eMax = r.maxEnergy || 60;
      const eRatio = Math.max(0, Math.min(1, r.energy / eMax));
      r.energyFill.width = 48 * eRatio;

      // Broken: gray tint + alpha pulse + countdown
      if (r.broken) {
        if (!r._brokenApplied) {
          r._brokenApplied = true;
          // Gray tint only for SVG fallback; procedural renderer shows a
          // dedicated "broken" pose with a cracked-red laptop screen.
          if (r.sprite.setTint) r.sprite.setTint(0x666666);
          const bannerY = (r._headTop ?? -85) - 38;
          r.fixingBg.setPosition(0, bannerY);
          r.fixingTxt.setPosition(0, bannerY - 5);
          r.fixingCountdown.setPosition(0, bannerY + 7);
        }
        // Subtle alpha pulse on the sprite/container while fixing
        r.sprite.setAlpha(0.75 + 0.25 * Math.sin(now / 180));
        const elapsed = now - (r.brokenStartAt || now);
        const remain = Math.max(0, (BROKEN_DURATION_MS - elapsed) / 1000);
        r.fixingCountdown.setText(`${remain.toFixed(1)}s`);
        r.fixingGroup.y = Math.sin(now / 220) * 2;
      } else if (r._brokenApplied) {
        r._brokenApplied = false;
        if (r.sprite.clearTint) r.sprite.clearTint();
        r.sprite.setAlpha(1);
        r.fixingGroup.setVisible(false);
        r.fixingGroup.y = 0;
      }
    });

    // ----- Lerp bugs toward their server target (server patches @ ~12.5 Hz) -----
    // Lowered from 16 → 10 to match the slower patch rate; otherwise bugs
    // catch up too quickly and "snap" at the end of each 80ms patch window.
    const bugLerp = Math.min(1, 10 * dt);
    this.remoteBugs.forEach((r) => {
      if (!r.alive) return;
      r.sprite.x = Phaser.Math.Linear(r.sprite.x, r.target.x, bugLerp);
      r.sprite.y = Phaser.Math.Linear(r.sprite.y, r.target.y, bugLerp);
      r.x = r.sprite.x; r.y = r.sprite.y;
      // The CEO's bug leaves a trail of sparkles
      if (r.golden && (!r._sparkAt || now - r._sparkAt > 110)) {
        r._sparkAt = now;
        const sp = this.add.text(r.x + (Math.random() - 0.5) * 40, r.y + (Math.random() - 0.5) * 30, '✦', {
          fontFamily: 'Arial Black, sans-serif', fontSize: 10 + Math.random() * 8, color: '#ffe680',
        }).setOrigin(0.5).setDepth(7);
        this.tweens.add({ targets: sp, y: sp.y - 26, alpha: 0, duration: 600, onComplete: () => sp.destroy() });
      }
    });

    // ----- Office Chaos overlays -----
    this._overlay.update(now, this.room?.state);
    this._bossView.update(dtMs);
    this._updateObjectiveArrow(now);

    // ----- Local health + energy + level HUD -----
    if (this._localEnergyFill && this.localId) {
      const me = this.remotePlayers.get(this.localId);
      if (me) {
        // Health bar (top, green→yellow→red tiered for danger feel)
        const hRatio = Math.max(0, Math.min(1, me.health / Math.max(1, me.maxHealth)));
        this._localHealthFill.width = 276 * hRatio;
        const hTier = (hRatio > 0.5) ? 2 : (hRatio > 0.25 ? 1 : 0);
        if (hTier !== this._localHealthTier) {
          this._localHealthTier = hTier;
          this._localHealthFill.setFillStyle(hTier === 2 ? 0x7ed957 : hTier === 1 ? 0xffd23f : 0xff5252, 1);
        }

        // Energy bar (bottom, flat blue — running low isn't "danger")
        const eRatio = Math.max(0, Math.min(1, me.energy / Math.max(1, me.maxEnergy)));
        this._localEnergyFill.width = 276 * eRatio;

        const badgeKey = `${me.level}|${me.broken ? 1 : 0}`;
        if (badgeKey !== this._localBadgeKey) {
          this._localBadgeKey = badgeKey;
          const broken = me.broken ? '  ·  FIXING LAPTOP' : '';
          this._localLevelBadge.setText(`Lv${me.level} · ${levelTitle(me.level)}${broken}`);
          this._localLevelBadge.setColor(me.broken ? '#ff8a8a' : '#ffd23f');
        }
      }
    }

    // ----- Skill cooldown UI -----
    this._updateSkillCooldowns();

    // ----- Minimap (throttled to ~15 Hz; entity-dense redraws are expensive) -----
    const tNow = this.time.now;
    if (tNow - (this._minimapDrawnAt || 0) > 66) {
      this._minimapDrawnAt = tNow;
      this._drawMinimap();
    }

    // ----- Mode HUD (only re-render text/color when it would actually change) -----
    if (this.room?.state) {
      const ms = this.room.state.timeLeftMs | 0;
      if (ms < 0) {
        let humans = 0, bots = 0;
        this.room.state.players?.forEach((p) => { if (p.isBot) bots++; else humans++; });
        const phaseStr = bots
          ? `PERSONAL MODE  ·  ${humans} online  ·  ${bots} AI coworkers`
          : `PERSONAL MODE  ·  ${humans} online`;
        if (this._timerText.text !== '∞') {
          this._timerText.setText('∞').setColor('#7ec8ff');
        }
        if (this._phaseText.text !== phaseStr) this._phaseText.setText(phaseStr);
      } else {
        // Team Mode (future) — countdown updates each frame; setText is cheap
        const safeMs = Math.max(0, ms);
        const secs = (safeMs / 1000).toFixed(safeMs < 10000 ? 1 : 0);
        this._timerText.setText(`${secs}s`);
        if (this.room.state.phase === 'playing') {
          this._timerText.setColor(safeMs < 10000 ? '#ff8a3d' : '#ffd23f');
          this._phaseText.setText(`Round ${this.room.state.round}  ·  smash bugs`);
        } else {
          this._timerText.setColor('#7ec8ff');
          this._phaseText.setText(`next round in…`);
          if (this._resultsCountdown) {
            this._resultsCountdown.setText(`next round in ${Math.ceil(safeMs / 1000)}s`);
          }
        }
      }
    }
  }

  // ───────────────────────── Chat (Personal Mode) ─────────────────────────
  // MOBA-style: ENTER opens a one-line input; ENTER again sends, ESC cancels.
  // Messages broadcast through the server to everyone in the room and stack in
  // a bottom-left log that fades after a few seconds. The game keeps running
  // underneath — only the keyboard is captured while the input is focused.

  _buildChat() {
    const { width: W, height: H } = this.scale;
    this._chatActive = false;
    // Whole chat sits on the RIGHT (clear of the mobile joystick, bottom-left).
    // Vertical order, top → bottom:  LOG panel (scrollable) · INPUT · 💬 button.
    // The log keeps a big history buffer; a small window shows the latest few,
    // and the player can scroll up (mouse wheel or drag) to read older ones.
    const btnX = W - 34;
    const btnY = Math.round(H * 0.62);    // a little below centre
    this._chatBtnY = btnY;
    this._chatX = W - 14;                 // right margin (lines are right-anchored)
    this._chatHistory = [];               // { str, color } — full buffer
    this._chatHistMax = 60;               // messages retained
    this._chatViewN = 6;                  // visible at once
    this._chatLineH = 18;
    this._chatScroll = 0;                 // lines scrolled up from newest (0 = bottom)
    this._chatLineObjs = [];              // currently-rendered Text objects
    this._chatDrag = null;

    const panelW = Math.min(360, Math.round(W * 0.5));
    const panelH = this._chatViewN * this._chatLineH + 12;
    const panelRight = W - 8;
    const panelBottom = btnY - 84;        // above the input slot
    this._chatBaseY = panelBottom - 6;    // newest visible line bottom
    // No visible panel — these bounds only define the wheel/drag scroll region.
    this._chatPanelBounds = {
      left: panelRight - panelW, right: panelRight,
      top: panelBottom - panelH, bottom: panelBottom,
    };
    this._chatScrollHint = this.add.text(panelRight - 4, this._chatPanelBounds.top - 1, '', {
      fontFamily: 'Consolas, monospace', fontSize: 10, color: '#7ec8ff',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(54).setVisible(false);

    // Wheel scroll while hovering the log; drag-release clears the drag state.
    this.input.on('wheel', (pointer, objs, dx, dy) => {
      if (!this._overChatPanel(pointer)) return;
      this._chatScroll += (dy < 0 ? 1 : -1);
      this._renderChatLog();
    });
    this.input.on('pointerup', () => { this._chatDrag = null; });
    this.input.on('pointerupoutside', () => { this._chatDrag = null; });

    // ── Always-visible tap/click chat button (discoverability) ──
    {
      const btn = this.add.container(btnX, btnY).setScrollFactor(0).setDepth(50);
      const ring = this.add.circle(0, 0, 24, 0x05080f, 0.7).setStrokeStyle(3, 0x39c2ff);
      const icon = this.add.text(0, 0, '💬', { fontSize: 22 }).setOrigin(0.5);
      const tag  = this.add.text(0, 26, 'CHAT', {
        fontFamily: 'Consolas, monospace', fontSize: 9, color: '#7ec8ff',
      }).setOrigin(0.5);
      btn.add([ring, icon, tag]);
      const hit = this.add.zone(btnX, btnY, 56, 64).setScrollFactor(0).setDepth(51)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', (p, lx, ly, e) => { e?.stopPropagation?.(); this._openChat(); });
      this._chatBtnHitZone = { x: btnX, y: btnY, r: 30 };
    }

    // ── Native DOM <input> for typing (all platforms) ──
    // A real <input> gives us IME composition (so Unikey/VietKey Telex/VNI and
    // Vietnamese diacritics work) and raises the soft keyboard on phones —
    // neither is possible with Phaser's raw keydown capture.
    const el = document.createElement('input');
    el.type = 'text';
    el.maxLength = 140;
    el.autocomplete = 'off';
    el.lang = 'vi';                       // hint the IME toward Vietnamese
    el.placeholder = 'say something… (Enter to send)';
    // Positioned just above the 💬 button at open time (see _positionChatInput).
    Object.assign(el.style, {
      position: 'fixed', right: '8px', bottom: '50%',
      width: 'min(64vw, 320px)', textAlign: 'right',
      padding: '8px 10px', font: '14px Consolas, monospace', color: '#fff',
      background: 'rgba(5,8,15,0.96)', border: '2px solid #39c2ff',
      borderRadius: '6px', zIndex: '9999', display: 'none', outline: 'none',
    });
    // Don't let Enter/Escape commit mid-IME-composition (Telex builds chars on
    // keystrokes); `isComposing` is true while the IME is mid-character.
    el.addEventListener('keydown', (ev) => {
      if (ev.isComposing) return;
      if (ev.key === 'Enter')  { ev.preventDefault(); this._closeChat(true); }
      if (ev.key === 'Escape') { ev.preventDefault(); this._closeChat(false); }
    });
    el.addEventListener('blur', () => { if (this._chatActive) this._closeChat(false); });
    document.body.appendChild(el);
    this._chatDomInput = el;
    this.events.once('shutdown', () => el.remove());
  }

  _openChat() {
    if (this._chatActive || this._nameEntryActive || !this._chatDomInput) return;
    this._chatActive = true;
    // Hand keystrokes to the native input. Disable Phaser's keyboard AND clear
    // its key captures — otherwise Phaser keeps calling preventDefault on SPACE
    // and the arrow keys, so they never reach the focused <input> (no spaces,
    // no cursor movement). We re-add the captures on close.
    this.input.keyboard.enabled = false;
    this.input.keyboard.clearCaptures();
    this._chatDomInput.value = '';
    this._positionChatInput();            // sit the field just above the 💬 button
    this._chatDomInput.style.display = 'block';
    // focus() must run inside the user gesture chain → defer a tick.
    setTimeout(() => this._chatDomInput && this._chatDomInput.focus(), 0);
  }

  /** Anchor the DOM input just above the 💬 button, mapping canvas→page coords
   *  so it lines up regardless of canvas scaling / letterboxing. */
  _positionChatInput() {
    const el = this._chatDomInput;
    if (!el) return;
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / this.scale.width;
    const scaleY = rect.height / this.scale.height;
    const btnTopPageY = rect.top + (this._chatBtnY - 30) * scaleY; // button top edge
    // Place the input's BOTTOM ~10px above the button top.
    el.style.bottom = Math.round(window.innerHeight - btnTopPageY + 10) + 'px';
    el.style.right  = Math.round(window.innerWidth - (rect.right - 8 * scaleX)) + 'px';
  }

  _closeChat(send) {
    if (!this._chatActive) return;
    if (send) {
      const t = (this._chatDomInput.value || '').trim();
      if (t && this.room) { try { this.room.send('chat', { text: t }); } catch (_) {} }
    }
    this._chatActive = false;
    this._chatDomInput.value = '';
    this._chatDomInput.style.display = 'none';
    this._chatDomInput.blur();
    this.input.keyboard.enabled = true;
    // Restore the gameplay key captures (stop SPACE/arrows scrolling the page).
    this.input.keyboard.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
  }

  /** Buffer a received message, keep the view stable, re-render. `m = { sid, name, text }`. */
  _addChatMessage(m) {
    const name = String(m.name || 'anon').slice(0, 16);
    const text = String(m.text || '').slice(0, 140);
    if (!text) return;
    const isMe = m.sid === this.localId;
    // you = gold · PM = orange (louder) · AI coworkers = soft gray-blue · others = cyan
    const kind = m.kind || '';
    const color = isMe ? '#ffd23f' : kind === 'pm' ? '#ffb347' : kind === 'bot' ? '#c3cfe0' : '#9ad0ff';
    const alpha = kind === 'pm' ? 0.85 : 0.55;
    this._chatHistory.push({ str: `${name}: ${text}`, color, alpha });
    if (kind === 'pm' && !m.history && !this._shuttingDown) AudioManager.paChime?.();
    if (this._chatHistory.length > this._chatHistMax) this._chatHistory.shift();
    // If the player is reading older history (scrolled up), keep their view
    // anchored on the same messages instead of yanking them to the bottom.
    if (this._chatScroll > 0) {
      const maxScroll = Math.max(0, this._chatHistory.length - this._chatViewN);
      this._chatScroll = Math.min(this._chatScroll + 1, maxScroll);
    }
    this._renderChatLog();
  }

  /** Render the visible window of the history buffer into the log panel. */
  _renderChatLog() {
    for (const t of this._chatLineObjs) t.destroy();
    this._chatLineObjs.length = 0;

    const total = this._chatHistory.length;
    if (total === 0) { this._chatScrollHint.setVisible(false); return; }

    const viewN = this._chatViewN;
    const maxScroll = Math.max(0, total - viewN);
    this._chatScroll = Math.max(0, Math.min(this._chatScroll, maxScroll));
    const bottomIdx = total - 1 - this._chatScroll;
    const topIdx = Math.max(0, bottomIdx - viewN + 1);

    let y = this._chatBaseY;
    for (let i = bottomIdx; i >= topIdx; i--) {
      const m = this._chatHistory[i];
      const t = this.add.text(this._chatX, y, m.str, {
        fontFamily: 'Consolas, monospace', fontSize: 13, color: m.color, align: 'right',
        stroke: '#000000', strokeThickness: 2,
        wordWrap: { width: Math.min(420, this.scale.width * 0.5) },
      }).setOrigin(1, 1).setScrollFactor(0).setDepth(54).setAlpha(m.alpha ?? 0.55);
      this._chatLineObjs.push(t);
      y -= t.height + 3;
    }

    // Scroll affordances: ▲ when older messages exist above, ▼ when newer below.
    let hint = '';
    if (topIdx > 0) hint += '▲ older';
    if (this._chatScroll > 0) hint += (hint ? '   ' : '') + 'newer ▼';
    this._chatScrollHint.setText(hint).setVisible(!!hint);
  }

  /** True when the pointer is over the chat log's scroll region (and there's a log). */
  _overChatPanel(p) {
    const b = this._chatPanelBounds;
    if (!b || !this._chatHistory || this._chatHistory.length === 0) return false;
    return p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom;
  }

  /**
   * In-canvas name entry box, shown before connecting to the arena.
   * Pre-fills with `defaultName` (the player's saved/default name). The player
   * types a name (letters/numbers/punctuation, max 16), then ENTER or the JOIN
   * button confirms → `onConfirm(name)`. ESC cancels back to the menu.
   *
   * While open, `this._nameEntryActive` is true so the world-click handlers are
   * suppressed; skill keys are already inert because `this.room` is still null.
   */
  _showNameEntry(defaultName, onConfirm) {
    const { width: W, height: H } = this.scale;
    const MAX = 16;
    this._nameEntryActive = true;
    let value = String(defaultName || '').slice(0, MAX);

    const overlay = this.add.container(0, 0).setScrollFactor(0).setDepth(100);

    // Dim backdrop. Interactive so it visually + functionally caps clicks at
    // this layer (the world handlers also bail on _nameEntryActive).
    const dim = this.add.rectangle(0, 0, W, H, 0x05070d, 0.9).setOrigin(0).setInteractive();

    // Panel
    const panelW = 460, panelH = 340;
    const px = W / 2 - panelW / 2, py = H / 2 - panelH / 2;
    const panel = this.add.graphics();
    panel.fillStyle(0x0a0e16, 1);
    panel.fillRoundedRect(px, py, panelW, panelH, 16);
    panel.lineStyle(3, 0x39c2ff, 0.9);
    panel.strokeRoundedRect(px, py, panelW, panelH, 16);

    const title = this.add.text(W / 2, py + 36, 'ENTER YOUR NAME', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 24, color: '#ffd23f',
      stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5);

    // Input field
    const fieldW = 340, fieldH = 50;
    const fieldY = py + 92;
    const field = this.add.rectangle(W / 2, fieldY, fieldW, fieldH, 0x12161f, 1)
      .setStrokeStyle(2, 0x7ec8ff, 0.85);
    const valueText = this.add.text(W / 2 - fieldW / 2 + 14, fieldY, value, {
      fontFamily: 'Consolas, monospace', fontSize: 22, color: '#ffffff',
    }).setOrigin(0, 0.5);
    const cursor = this.add.text(0, fieldY, '|', {
      fontFamily: 'Consolas, monospace', fontSize: 22, color: '#7ec8ff',
    }).setOrigin(0, 0.5);
    const placeCursor = () => { cursor.x = valueText.x + valueText.width + 1; };
    placeCursor();
    const blink = this.time.addEvent({
      delay: 480, loop: true, callback: () => cursor.setVisible(!cursor.visible),
    });

    const hint = this.add.text(W / 2, fieldY + 42, 'type a name · ENTER to join · ESC to cancel', {
      fontFamily: 'Consolas, monospace', fontSize: 12, color: '#888a99',
    }).setOrigin(0.5);

    // ── Hat picker (cosmetic, unlocked by career stats) ──
    const career = this._career || SaveManager.getCareer();
    const unlockedCount = HATS.filter((h) => h.unlock && isHatUnlocked(h, career)).length;
    const hatHeader = this.add.text(W / 2, fieldY + 80, `HAT · ${unlockedCount}/${HATS.length - 1} unlocked · ◀ ▶ to browse`, {
      fontFamily: 'Consolas, monospace', fontSize: 12, color: '#7ec8ff',
    }).setOrigin(0.5);
    let hatIdx = Math.max(0, HATS.findIndex((h) => h.id === (this.playerHat || '')));
    const hatRowY = fieldY + 112;
    const hatEmoji = this.add.text(W / 2 - 70, hatRowY, '', { fontSize: 30 }).setOrigin(0.5);
    const hatName = this.add.text(W / 2 - 44, hatRowY - 8, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 15, color: '#ffffff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0, 0.5);
    const hatInfo = this.add.text(W / 2 - 44, hatRowY + 11, '', {
      fontFamily: 'Consolas, monospace', fontSize: 11, color: '#888a99',
    }).setOrigin(0, 0.5);
    const mkArrow = (x, dir) => {
      const t = this.add.text(x, hatRowY, dir < 0 ? '◀' : '▶', {
        fontFamily: 'Arial Black, sans-serif', fontSize: 22, color: '#39c2ff', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerup', () => cycleHat(dir));
      return t;
    };
    const leftArrow = mkArrow(px + 34, -1);
    const rightArrow = mkArrow(px + panelW - 34, 1);
    const renderHat = () => {
      const h = HATS[hatIdx];
      const ok = isHatUnlocked(h, career);
      hatEmoji.setText(h.emoji || '—').setAlpha(ok ? 1 : 0.35);
      hatName.setText(ok ? h.name : `🔒 ${h.name}`).setColor(ok ? '#ffffff' : '#888a99');
      hatInfo.setText(h.unlock
        ? (ok ? 'unlocked ✓' : `${h.unlock.label} (${Math.min(career[h.unlock.stat] || 0, h.unlock.at)}/${h.unlock.at})`)
        : 'classic look');
    };
    const cycleHat = (dir) => {
      hatIdx = (hatIdx + dir + HATS.length) % HATS.length;
      renderHat();
      AudioManager.uiClick?.();
    };
    renderHat();

    // JOIN button
    const btn = this.add.rectangle(W / 2, py + panelH - 36, 170, 46, 0x123a1c, 1)
      .setStrokeStyle(2, 0x7ed957, 0.9).setInteractive({ useHandCursor: true });
    const btnLabel = this.add.text(W / 2, py + panelH - 36, 'JOIN', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 18, color: '#7ed957',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);

    overlay.add([dim, panel, title, field, valueText, cursor, hint,
      hatHeader, hatEmoji, hatName, hatInfo, leftArrow, rightArrow, btn, btnLabel]);

    const refresh = () => { valueText.setText(value); placeCursor(); };

    const keyHandler = (ev) => {
      const k = ev.key;
      if (k === 'Enter')     { finish(); return; }
      if (k === 'Escape')    return; // global ESC handler leaves to the menu
      if (k === 'ArrowLeft')  { cycleHat(-1); return; }
      if (k === 'ArrowRight') { cycleHat(1); return; }
      if (k === 'Backspace') { value = value.slice(0, -1); refresh(); return; }
      // Printable single chars only (space..~), respect max length.
      if (k.length === 1 && value.length < MAX && /^[\x20-\x7E]$/.test(k)) {
        value += k; refresh();
      }
    };
    const finish = () => {
      if (!this._nameEntryActive) return; // guard against double-fire
      this._nameEntryActive = false;
      blink.remove();
      this.input.keyboard.off('keydown', keyHandler);
      overlay.destroy();
      const chosen = (value.trim() || String(defaultName || '').trim()
        || `Guest-${Math.floor(Math.random() * 9000) + 1000}`).slice(0, MAX);
      // A locked hat can be previewed but not worn.
      const h = HATS[hatIdx];
      onConfirm(chosen, isHatUnlocked(h, career) ? h.id : '');
    };

    this.input.keyboard.on('keydown', keyHandler);
    btn.on('pointerup',   () => finish());
    btn.on('pointerover', () => btn.setFillStyle(0x1a5028, 1));
    btn.on('pointerout',  () => btn.setFillStyle(0x123a1c, 1));
  }

  // ───────────────────────── Office Chaos helpers ─────────────────────────

  /** Client mirror of the server's slide-along obstacle clamp (rules.js
   *  clampToFreeSpace) so the predicted local position matches the server's.
   *  Skipped during the Q/E pass-through window, and when we're already inside
   *  an obstacle (landed there via dash/jump) so we can walk out. */
  _clampLocalMove(fromX, fromY, toX, toY) {
    if (this.time.now < (this._passThroughUntil || 0)) return { x: toX, y: toY };
    const inOb = (x, y) => {
      for (const o of this.remoteObstacles.values()) {
        if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return true;
      }
      return false;
    };
    if (inOb(fromX, fromY)) return { x: toX, y: toY };
    let x = toX;
    if (inOb(x, fromY)) x = fromX;
    let y = toY;
    if (inOb(x, y)) y = fromY;
    return { x, y };
  }

  _nameLabel(p) { return p?.isBot ? `🤖 ${p.name || '?'}` : (p?.name || '?'); }
  /** Server-clock "now" (server timestamps like stunnedUntil/invulnUntil). */
  _srvNow() { return Date.now() + (this._clockOffset || 0); }
  /** Boss truce: during the fight + the server's 4 s grace after it ends. */
  _isTruce() {
    return this.room?.state?.event === 'deadline_boss' || Date.now() < (this._truceUntil || 0);
  }
  _skillCost(slot) {
    const base = ({ q: 10, w: 15, e: 8, r: 25 })[slot] || 0;
    return this.room?.state?.event === 'hackathon' ? 0 : base;
  }

  /** Server → client drama messages (feed, banners, rewards, boss telegraphs). */
  _registerDramaHandlers() {
    const room = this.room;
    const on = (type, fn) => room.onMessage(type, (m) => { if (!this._shuttingDown) fn(m || {}); });
    on('welcome', (m) => {
      if (Number.isFinite(m.serverNow)) this._clockOffset = m.serverNow - Date.now();
      if (m.events) this._eventDefs = m.events;
      const cur = this.room?.state?.event;
      if (cur) this._overlay.setEvent(this._eventDefs[cur] || { title: cur });
    });
    on('feed', (m) => this._overlay.feed({
      text: m.text, color: m.color, mine: !!this.localId && (m.a === this.localId || m.b === this.localId),
    }));
    on('announce', (m) => {
      if (m.kind === 'eventEnd') {
        // Mirror the server's post-boss grace (EventDirector: truce +4 s).
        if (m.id === 'deadline_boss') this._truceUntil = Date.now() + 4000;
        return;
      }
      // Event starts carry safety info ("dodge the red circles") — jump the queue.
      this._overlay.banner({
        title: m.title, sub: m.sub, color: m.color,
        big: !!m.big || m.kind === 'event', urgent: m.kind === 'event',
      });
      if (m.kind === 'event') {
        if (m.id === 'prod_down') AudioManager.alarm?.();      // (PM chat line plays the PA chime)
      } else if (m.big) AudioManager.reward?.();
      else AudioManager.combo?.(2);
    });
    on('kill', (m) => {
      const gain = m.gain | 0;
      // (The golden bug's XP pops via its 'reward' message instead.)
      if (gain > 0 && m.kind !== 'bug-golden') this._spawnXpPopup(`+${gain}`, '#ffe680', gain >= 50);
      this._careerAdd('bugs', 1, 'bugs');
    });
    on('ko', () => {
      this._spawnXpPopup('💻 KO!', '#ff8a8a', true);
      this._careerAdd('kos', 1, 'kos');
    });
    on('reward', (m) => {
      const xp = m.xp | 0;
      if (m.kind === 'boss') {
        this._overlay.toast(`🚀 Deadline shipped! +${xp} XP (${m.share | 0}% of the damage)`, '#7ed957', 3400);
        this._careerAdd('bosses', 1, 'bosses');
      } else if (m.kind === 'golden') {
        this._overlay.toast(`✨ You fixed the CEO's bug! +${xp} XP`, '#ffd700', 3400);
        this._careerAdd('goldens', 1, 'goldens');
      } else if (m.kind === 'bounty') {
        this._overlay.toast(`💰 Bounty claimed! +${xp} XP`, '#ffd700', 3000);
      }
      if (xp > 0) this._spawnXpPopup(`+${xp}`, '#ffd700', true);
      AudioManager.reward?.();
    });
    on('brokenBy', (m) => {
      this._overlay.toast(`💻 Laptop broken by ${m.by || 'something'} — fixing for 20s…`, '#ff8a8a', 3400);
      this._careerAdd('deaths', 1);
    });
    on('crowned', (m) => {
      this._overlay.banner({
        title: "👑 YOU'RE THE TECH LEAD", color: '#ffd700',
        sub: `Everyone wants your ${m.bounty | 0} XP bounty — watch your back`,
      });
    });
    on('pickup', () => this._careerAdd('pickups', 1, 'pickups'));
    on('bossSlam', (m) => this._bossView.slam(m));
    on('bossSlamHit', (m) => this._bossView.slamHit(m));

    // First sessions: a few onboarding tips
    if ((this._career.sessions | 0) < 2) {
      this._overlay.startTips([
        '🐞 Click a bug — or press SPACE next to it — to smash it',
        '💚 Green + pickups heal you and refill energy',
        '⚡ Q dash · W shield · E jump · R ult — skills cost energy',
        '📢 Listen to the PM: world events change the rules',
        '👑 Break the Tech Lead\'s laptop to claim their bounty',
        '💻 Health 0 = broken laptop: back to Intern for 20s',
      ]);
    }
  }

  _onEventChange(id, prev) {
    if (id) this._overlay.setEvent(this._eventDefs[id] || { title: id.replace(/_/g, ' ').toUpperCase() });
    else this._overlay.clearEvent();
    // An event that ended while you were here counts as "survived" for dailies.
    if (prev && prev !== id && this._joinedAt) this._dailyTrack('events', 1);
  }

  _careerAdd(key, n = 1, daily = null) {
    const before = this._career;
    this._career = SaveManager.addCareer(key, n);
    this._announceUnlocks(before, this._career);
    if (daily) this._dailyTrack(daily, n);
  }

  _careerMax(key, value, daily = null) {
    const before = this._career;
    if (value > (before[key] || 0)) {
      this._career = SaveManager.maxCareer(key, value);
      this._announceUnlocks(before, this._career);
    }
    if (daily) this._dailyTrack(daily, value);
  }

  _dailyTrack(metric, value) {
    // A session can run past midnight — switch to the new day's missions.
    const k = dayKey();
    if (k !== this._dayKey) { this._dayKey = k; this._missions = missionsForDay(k); }
    const done = SaveManager.trackDaily(this._dayKey, this._missions, metric, value);
    for (const m of done) {
      this._overlay.toast(`✅ Daily mission complete: ${m.text}`, '#7ed957', 3400);
      AudioManager.reward?.();
    }
  }

  _announceUnlocks(before, after) {
    for (const h of newlyUnlockedHats(before, after)) {
      this._overlay.toast(`🎉 New hat unlocked: ${h.emoji} ${h.name} — wear it next time you join`, '#ffd23f', 3800);
      AudioManager.reward?.();
    }
  }

  /** Floating "+XP" above the local player (world-space). */
  _spawnXpPopup(text, color = '#ffe680', big = false) {
    const me = this.remotePlayers.get(this.localId);
    if (!me) return;
    const x = me.container.x + (Math.random() - 0.5) * 30;
    const y = me.container.y + (me._stackTop ?? -85) - 18;
    const t = this.add.text(x, y, text, {
      fontFamily: 'Arial Black, sans-serif', fontSize: big ? 22 : 16, color,
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(41).setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: t, y: y - 44, alpha: { from: 1, to: 0 }, duration: 820, delay: 120, ease: 'Cubic.easeIn',
      onComplete: () => t.destroy(),
    });
  }

  /** Screen-edge arrow pointing at an off-screen objective (boss / golden bug). */
  _buildObjectiveArrow() {
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(52).setVisible(false);
    const g = this.add.graphics();
    const label = this.add.text(0, 24, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 11, color: '#ffd700', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    c.add([g, label]);
    this._objArrow = { c, g, label, color: null };
  }

  _updateObjectiveArrow(now) {
    const a = this._objArrow;
    if (!a) return;
    let tx = null, ty = null, color = 0xffd700, name = '';
    const bp = this._bossView?.pos();
    if (bp) { tx = bp.x; ty = bp.y; color = 0xff3b3b; name = 'DEADLINE'; }
    else {
      this.remoteBugs.forEach((b) => {
        if (tx == null && b.alive && b.golden) { tx = b.x; ty = b.y; name = "CEO's BUG"; }
      });
    }
    if (tx == null || !this.localId) { if (a.c.visible) a.c.setVisible(false); return; }
    const view = this.cameras.main.worldView;
    if (tx > view.x + 30 && tx < view.right - 30 && ty > view.y + 30 && ty < view.bottom - 30) {
      if (a.c.visible) a.c.setVisible(false);
      return;
    }
    const W = this.scale.width, H = this.scale.height;
    const cx = W / 2, cy = H / 2;
    const ang = Math.atan2((ty - view.y) - cy, (tx - view.x) - cx);
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const k = Math.min((W / 2 - 70) / Math.max(1e-6, Math.abs(cos)), (H / 2 - 70) / Math.max(1e-6, Math.abs(sin)));
    a.c.setPosition(cx + cos * k, cy + sin * k).setVisible(true);
    if (a.color !== color) {
      a.color = color;
      a.g.clear();
      a.g.fillStyle(color, 1);
      a.g.lineStyle(2, 0x000000, 0.9);
      a.g.fillTriangle(18, 0, -10, -12, -10, 12);
      a.g.strokeTriangle(18, 0, -10, -12, -10, 12);
      a.label.setColor(this._cssColor(color));
    }
    a.g.setRotation(ang);
    const meters = Math.round(Math.hypot(tx - this.localPos.x, ty - this.localPos.y) / 50);
    const str = `${name} ${meters}m`;
    if (a.label.text !== str) a.label.setText(str);
    a.c.setScale(1 + 0.12 * Math.sin(now / 150));
  }

  _leaveAndGoMenu() {
    this._cleanup();
    this.scene.start('MenuScene');
  }

  _cleanup() {
    // Set the shutdown flag FIRST so any Colyseus callbacks firing during
    // the async room.leave() disconnect window become no-ops.
    this._shuttingDown = true;
    clearTimeout(this._sessionTimer);
    this._flushPlayTime();
    try { this.room?.leave(); } catch (_) { /* ignore */ }
    this.room = null;
  }

  /** Add time played since the last flush to the career (on leave / tab close). */
  _flushPlayTime() {
    if (!this._playClockAt) return;
    const ms = Date.now() - this._playClockAt;
    this._playClockAt = Date.now();
    if (ms > 0) SaveManager.addCareer('playMs', ms);
  }
}

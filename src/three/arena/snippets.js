// Copied verbatim from src/scenes/MultiPlayScene.js (lines 72-540, which cannot be imported: it needs Phaser). Keep in sync.
// VS Code dark-theme syntax colors (hex strings — Phaser Text takes CSS color)
export const SYNTAX_HEX = {
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
export const CODE_SNIPPETS = {
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

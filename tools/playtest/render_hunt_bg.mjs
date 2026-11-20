// Renders the HuntScene backdrop (1536x1024): a generic, brand-free IDE desktop.
// Usage (from tools/playtest/): node render_hunt_bg.mjs ../../assets/background/image.png
import { chromium } from 'playwright-core';
const OUT = process.argv[2] || 'out/bg.png';
const code = [
  ['kw', "import"], ' { Office } ', ['kw', 'from'], ' ', ['str', "'./core/office.js'"], ';\n',
  ['kw', "import"], ' { Bug, Swarm } ', ['kw', 'from'], ' ', ['str', "'./entity/bug.js'"], ';\n',
  ['kw', "import"], ' { Deadline } ', ['kw', 'from'], ' ', ['str', "'./core/deadline.js'"], ';\n',
  ['kw', "import"], ' { Laptop } ', ['kw', 'from'], ' ', ['str', "'./gear/laptop.js'"], ';\n',
  '\n',
  ['cm', '// TODO: fix every bug before Friday 17:00'], '\n',
  '\n',
  ['kw', 'const'], ' ', ['var', 'sprint'], ' = {\n',
  '    goal: ', ['str', "'ship it'"], ',\n',
  '    coffee: ', ['num', '9001'], ',\n',
  '    meetings: ', ['num', '0'], ',  ', ['cm', '// optimistic'], '\n',
  '    deadline: ', ['kw', 'new'], ' ', ['fn', 'Deadline'], '(', ['str', "'FRIDAY'"], '),\n',
  '    team: [', ['str', "'you'"], ', ', ['str', "'the intern'"], ', ', ['str', "'a rubber duck'"], '],\n',
  '};\n',
  '\n',
  ['kw', 'function'], ' ', ['fn', 'smashBugs'], '(swarm) {\n',
  '    ', ['kw', 'for'], ' (', ['kw', 'const'], ' bug ', ['kw', 'of'], ' swarm) {\n',
  '        ', ['kw', 'if'], ' (bug.', ['fn', 'isFeature'], '()) ', ['kw', 'continue'], ';  ', ['cm', '// allegedly'], '\n',
  '        laptop.', ['fn', 'smash'], '(bug);\n',
  '    }\n',
  '}\n',
  '\n',
  ['cm', "// Fix bugs. Save the deadline. Don't let the PM down."], '\n',
];
const html = (spans) => spans.map((s) => typeof s === 'string' ? s.replace(/</g, '&lt;') : `<span class="${s[0]}">${s[1].replace(/</g, '&lt;')}</span>`).join('');
const lines = html(code).split('\n');
const page = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
body{margin:0;width:1536px;height:1024px;background:#11141c;color:#c9d1dc;font:16px 'Segoe UI',Arial,sans-serif;overflow:hidden;position:relative}
.mono{font-family:Consolas,'Courier New',monospace}
.top{position:absolute;left:0;top:0;right:0;height:46px;background:#161a24;border-bottom:1px solid #232a38;display:flex;align-items:center;padding:0 16px;gap:26px;color:#aab3c2}
.logo{width:26px;height:26px;border-radius:7px;background:linear-gradient(135deg,#39ff14,#00d9c2);display:flex;align-items:center;justify-content:center;font-size:16px;color:#0b0f17;font-weight:900}
.search{margin-left:120px;width:430px;height:30px;border:1px solid #2a3242;border-radius:7px;background:#1b2130;display:flex;align-items:center;justify-content:center;color:#8a94a6;font-size:15px}
.rail{position:absolute;left:0;top:46px;bottom:32px;width:56px;background:#141822;border-right:1px solid #232a38}
.rail i{display:block;width:26px;height:26px;margin:22px auto;border:2px solid #4a5468;border-radius:6px;opacity:.8}
.rail i.on{border-color:#c9d1dc}
.tree{position:absolute;left:56px;top:46px;bottom:32px;width:226px;background:#151923;border-right:1px solid #232a38;padding:14px 0;color:#aab3c2;font-size:16px}
.tree div{padding:5px 18px;white-space:nowrap}.tree .h{font-size:13px;letter-spacing:1px;color:#7d8798}
.tree .sel{background:#1f2636;color:#e6edf5}
.ed{position:absolute;left:282px;top:46px;width:818px;bottom:32px;background:#12161f}
.tabs{height:44px;background:#151923;border-bottom:1px solid #232a38;display:flex}
.tab{padding:12px 20px;color:#8a94a6;font-size:15px;border-right:1px solid #232a38}.tab.on{background:#12161f;color:#e6edf5;border-top:2px solid #39ff14}
.crumb{padding:8px 22px;color:#7d8798;font-size:14px}
.code{position:absolute;left:0;top:84px;right:60px;font-size:17px;line-height:23.5px;white-space:pre;color:#c9d1dc;opacity:.92}
.code .ln{display:inline-block;width:62px;text-align:right;padding-right:22px;color:#4a5468}
.kw{color:#c792ea}.str{color:#c3e88d}.cm{color:#5f7a6a;font-style:italic}.num{color:#f78c6c}.fn{color:#82aaff}.var{color:#ffcb6b}
.mini{position:absolute;right:10px;top:84px;width:46px;height:300px;opacity:.35;background:repeating-linear-gradient(#2c3a52 0 2px,transparent 2px 5px)}
.term{position:absolute;left:0;right:0;bottom:0;height:290px;border-top:1px solid #232a38;background:#11141c;padding:10px 22px;font-size:16px}
.tt{display:flex;gap:30px;color:#7d8798;font-size:14px;margin-bottom:14px}.tt b{color:#e6edf5;font-weight:400;border-bottom:2px solid #39ff14;padding-bottom:4px}
.term pre{margin:0;font-size:15.5px;line-height:21px;color:#aab3c2}
.ok{color:#7ed957}.err{color:#ff6b6b}.dim{color:#5c6678}.cy{color:#00d9c2}
.side{position:absolute;right:0;top:46px;width:436px;bottom:32px;background:#141822;border-left:1px solid #232a38;padding:16px 20px}
.side h4{margin:0 0 14px;font-size:14px;letter-spacing:1px;color:#7d8798;font-weight:600}
.msg{margin:14px 0 0}.side h4+.msg{margin-top:120px}.bub{opacity:.85}.who{font-weight:600;color:#e6edf5;margin-bottom:6px;display:flex;align-items:center;gap:8px}
.av{width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:15px}
.bub{background:#1b2130;border:1px solid #262e3e;border-radius:10px;padding:10px 12px;color:#b8c2d0;font-size:15px;line-height:21px}
.snip{margin-top:10px;background:#10131a;border:1px solid #262e3e;border-radius:8px;padding:10px 12px;font-size:13.5px;line-height:19px;white-space:pre;color:#aab3c2}
.ask{position:absolute;left:20px;right:20px;bottom:20px;height:92px;border:1px solid #2a3242;border-radius:12px;background:#1b2130;padding:14px;color:#6c7688;font-size:15px}
.status{position:absolute;left:0;right:0;bottom:0;height:32px;background:#0f1a14;border-top:1px solid #1d3326;display:flex;align-items:center;gap:26px;padding:0 16px;color:#9fb3a6;font-size:14px}
.status .r{margin-left:auto;display:flex;gap:26px}
</style></head><body>
<div class="top"><div class="logo">🐞</div><span>File</span><span>Edit</span><span>Selection</span><span>View</span><span>Run</span><span>Terminal</span><span>Help</span><div class="search">🔍&nbsp; bug-smash-office</div></div>
<div class="rail"><i class="on"></i><i></i><i></i><i></i><i></i></div>
<div class="tree"><div class="h">EXPLORER</div><div>▾ BUG-SMASH</div><div>&nbsp;&nbsp;› assets</div><div>&nbsp;&nbsp;› sounds</div><div>&nbsp;&nbsp;▾ src</div><div>&nbsp;&nbsp;&nbsp;&nbsp;› core</div><div>&nbsp;&nbsp;&nbsp;&nbsp;› entity</div><div>&nbsp;&nbsp;&nbsp;&nbsp;› gear</div><div>&nbsp;&nbsp;&nbsp;&nbsp;› scenes</div><div class="sel">&nbsp;&nbsp;&nbsp;&nbsp;JS main.js</div><div>&nbsp;&nbsp;&nbsp;&nbsp;JS sprint.js</div><div>&nbsp;&nbsp;&nbsp;&nbsp;JS deadline.js</div><div>&nbsp;&nbsp;.gitignore</div><div>&nbsp;&nbsp;package.json</div><div>&nbsp;&nbsp;README.md</div><div>&nbsp;&nbsp;TODO.txt <span class="dim">(312)</span></div></div>
<div class="ed"><div class="tabs"><div class="tab on">JS main.js ●</div><div class="tab">JS bug.js</div><div class="tab">JS deadline.js</div><div class="tab">TODO.txt</div></div>
<div class="crumb">src › main.js › smashBugs</div>
<div class="code mono">${lines.map((l, i) => `<span class="ln">${i + 1}</span>${l}`).join('\n')}</div><div class="mini"></div>
<div class="term mono"><div class="tt"><span>PROBLEMS 4</span><span>OUTPUT</span><b>TERMINAL</b><span>DEBUG CONSOLE</span></div>
<pre><span class="cy">~/bug-smash</span> <span class="dim">(main)</span> $ npm run dev
<span class="dim">&gt; bug-smash@1.0.0 dev</span>
<span class="ok">  ready</span> in 362 ms · local: <span class="cy">http://localhost:5173/</span>
<span class="dim">15:42:10</span> reloaded src/scenes/office.js
<span class="dim">15:42:11</span> <span class="err">error: Cannot read property 'deadline' of undefined</span>
<span class="err">    at Sprint.plan (src/sprint.js:128:22)</span>
<span class="dim">15:42:12</span> <span class="ok">✓ 41 tests passed</span> <span class="err">· 3 bugs escaped</span></pre></div></div>
<div class="side"><h4>PAIR CHAT · RUBBER DUCK</h4>
<div class="msg"><div class="who"><span class="av" style="background:#2b3a5a">🙂</span>You</div><div class="bub">The bugs keep running off the screen. How do I fix it?</div></div>
<div class="msg"><div class="who"><span class="av" style="background:#4a3d12">🦆</span>Rubber Duck</div><div class="bub">Quack. Have you tried explaining it slowly? Also: clamp them to the screen.</div>
<div class="snip mono"><span class="cm">// keep bugs inside the office</span>
bug.x = <span class="fn">clamp</span>(bug.x, <span class="num">0</span>, W);
bug.y = <span class="fn">clamp</span>(bug.y, <span class="num">0</span>, H);

<span class="cm">// or just smash them</span>
laptop.<span class="fn">smash</span>(bug);</div>
<div class="bub" style="margin-top:10px">Let me know if they unionize.</div></div>
<div class="ask">Ask the duck anything…</div></div>
<div class="status"><span>⎇ main</span><span>⟳</span><span>⊗ 2 ⚠ 0</span><div class="r"><span>Ln 24, Col 1</span><span>Spaces: 4</span><span>UTF-8</span><span>LF</span><span>{ } JavaScript</span><span>🔔</span></div></div>
</body></html>`;
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const p = await b.newPage({ viewport: { width: 1536, height: 1024 } });
await p.setContent(page);
await p.waitForTimeout(800);
await p.screenshot({ path: OUT });
await b.close();
console.log('wrote', OUT);

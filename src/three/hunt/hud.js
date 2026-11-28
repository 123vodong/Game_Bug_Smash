// Hunt HUD: pure DOM over the canvas. createHuntHud(root, {level, onPause, onMute}) -> {layer, update(sim), ...}.
// DEADLINE timer + urgency bar, BUGS n/total + hiding, SCORE, combo badge, hint line, pause, coach pill, skill chips,
// toast, pause card and the minimal win / lose overlays (stars, FAIL_MESSAGE, DEV/PM line, RETRY / MENU).
import { comboMult, comboColor } from './sim.js';

const CSS = `
.hx-root{position:fixed;inset:0;pointer-events:none;overflow:hidden;font-family:'Arial Black',Arial,sans-serif;color:#fff;user-select:none;-webkit-user-select:none}
.hx-root *{box-sizing:border-box}
.hx-txt{text-shadow:-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000}
.hx-mono{font-family:Consolas,'Courier New',monospace}
.hx-top{position:absolute;top:8px;left:50%;transform:translateX(-50%);text-align:center;width:min(300px,50vw)}
.hx-dl{font-size:12px;color:#9aa3b2;letter-spacing:1px}
.hx-time{font-size:24px;color:#ffd23f;line-height:1.1}
.hx-bar{height:6px;margin-top:4px;background:rgba(0,0,0,.7);border:1px solid #555a6a;border-radius:3px;overflow:hidden}
.hx-bar>i{display:block;height:100%;width:100%;background:#7ed957;transform-origin:left}
.hx-left{position:absolute;top:26px;left:16px}.hx-right{position:absolute;top:26px;right:16px;text-align:right}
.hx-big{font-size:20px}.hx-sm{font-size:11px;color:#9aa3b2}
.hx-combo{position:absolute;top:84px;left:50%;transform:translateX(-50%);font-size:22px;white-space:nowrap;display:none}
.hx-hint{position:absolute;right:14px;bottom:10px;font-size:11px;color:#6a7088}
.hx-pause{position:absolute;top:12px;left:calc(50% + min(190px,34vw));width:40px;height:40px;border-radius:50%;background:rgba(5,8,15,.75);border:2px solid #9aa3b2;color:#e8f4ff;font-size:16px;pointer-events:auto;cursor:pointer;display:flex;align-items:center;justify-content:center}
.hx-coach{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);text-align:center;max-width:min(760px,92vw)}
.hx-coach .p{display:inline-block;background:rgba(5,12,24,.78);padding:10px 16px;font-size:20px;white-space:pre-line;border-radius:4px;transition:transform .15s}
.hx-coach .n{font-size:12px;color:#7ec8ff;margin-bottom:6px}
.hx-chips{position:absolute;top:112px;left:50%;transform:translateX(-50%);display:flex;gap:8px}
.hx-chip{position:relative;width:130px;height:30px;border:2px solid;border-radius:3px;overflow:hidden;background:rgba(0,0,0,.35);font-size:11px;display:flex;align-items:center;gap:6px;padding-left:6px}
.hx-chip i{position:absolute;left:0;top:0;bottom:0;opacity:.45}.hx-chip img{width:20px;height:20px;z-index:1}.hx-chip span{z-index:1}
.hx-toast{position:absolute;top:150px;left:50%;transform:translateX(-50%);font-size:18px;color:#ffd23f;opacity:0;transition:opacity .25s;white-space:nowrap}
.hx-fl{position:absolute;left:0;top:0;white-space:nowrap;font-weight:900;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;will-change:transform}
.hx-flash{position:absolute;inset:0;opacity:0}
.hx-modal{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;pointer-events:auto;padding:16px;overflow:hidden;overscroll-behavior:none}
.hx-modal h1{font-size:clamp(36px,8vw,64px);margin:0;line-height:1}
.hx-stars{font-size:44px;letter-spacing:6px;color:#3a4050}.hx-stars b{color:#ffd23f;font-weight:900}
.hx-btns{display:flex;gap:14px;margin-top:14px;flex-wrap:wrap;justify-content:center}
.hx-btn{pointer-events:auto;cursor:pointer;border:3px solid #000;border-radius:8px;padding:10px 22px;font:900 18px 'Arial Black',Arial,sans-serif;color:#10131a}
.hx-talk{display:flex;gap:14px;margin-top:10px;flex-wrap:wrap;justify-content:center}
.hx-bub{background:#fff;color:#111;border:3px solid #000;border-radius:10px;padding:8px 12px;max-width:260px;font-size:14px;text-align:left}
.hx-bub b{display:inline-block;color:#fff;border-radius:4px;padding:0 6px;margin-right:6px;font-size:11px}
.hx-guide{position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(0,0,0,.85);pointer-events:auto;cursor:pointer;padding:24px}
.hx-guide img{max-width:calc(100vw - 80px);max-height:calc(100vh - 140px);object-fit:contain;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.6)}
.hx-guide .cap{font:14px Consolas,'Courier New',monospace;color:#ccc}
@media (max-width:700px){.hx-time{font-size:20px}.hx-big{font-size:16px}.hx-hint{display:none}.hx-coach .p{font-size:15px}.hx-chip{width:104px}}
`;

const el = (tag, cls, parent, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; if (parent) parent.appendChild(e); return e; };
const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const css = (n) => '#' + n.toString(16).padStart(6, '0');

export function createHuntHud({ level, onPause, onMute }) {
  if (!document.getElementById('hx-style')) { const s = el('style'); s.id = 'hx-style'; s.textContent = CSS; document.head.appendChild(s); }
  const root = el('div', 'hx-root', document.body);
  const top = el('div', 'hx-top', root);
  const lbl = el('div', 'hx-dl hx-mono hx-txt', top, 'DEADLINE');
  const time = el('div', 'hx-time hx-txt', top, '01:00');
  const bar = el('div', 'hx-bar', top); const fill = el('i', '', bar);
  const left = el('div', 'hx-left', root);
  const bugs = el('div', 'hx-big hx-txt', left, 'BUGS'); const hiding = el('div', 'hx-sm hx-mono', left, '');
  const right = el('div', 'hx-right', root);
  const score = el('div', 'hx-big hx-txt', right, 'SCORE 0'); score.style.color = '#ffd23f';
  el('div', 'hx-sm hx-mono', right, level.name);
  const combo = el('div', 'hx-combo hx-txt', root);
  const chips = el('div', 'hx-chips', root);
  const coach = el('div', 'hx-coach', root); coach.style.display = 'none';
  const coachN = el('div', 'n hx-mono hx-txt', coach); const coachP = el('div', 'p hx-txt', coach);
  const toast = el('div', 'hx-toast hx-txt', root);
  el('div', 'hx-hint hx-mono', root, '[hold] smash  [P] pause  [H] guide  [M] mute  [ESC] menu');
  const pb = el('div', 'hx-pause', root, '||'); pb.setAttribute('aria-label', 'pause');
  pb.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); onPause && onPause(); });
  const layer = el('div', '', root); layer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  let modal = null, guide = null, toastT = 0, lastChips = '', lastCoach = '';

  function update(sim, tMs) {
    const pct = Math.max(0, sim.timeLeftMs / sim.level.timeLimitMs);
    fill.style.transform = `scaleX(${pct})`;
    fill.style.background = pct > 0.5 ? '#7ed957' : pct > 0.25 ? '#ffd23f' : pct > 0.1 ? '#ff9800' : '#ff5252';
    const secs = Math.ceil(sim.timeLeftMs / 1000);
    time.textContent = fmt(sim.timeLeftMs);
    time.style.color = secs <= 5 ? '#ff5252' : secs <= 15 ? '#ff9800' : '#ffd23f';
    time.style.transform = secs <= 10 ? `scale(${1 + Math.sin(tMs / 110) * 0.08})` : '';
    lbl.textContent = sim.clockHeld ? 'DEADLINE · starts at your first fix' : 'DEADLINE';
    const c = sim.counts();
    bugs.textContent = `BUGS ${c.remaining}/${sim.totalBugs}`;
    hiding.textContent = c.hidden > 0 ? `${c.hidden} hiding` : '';
    score.textContent = `SCORE ${sim.score}`;
    if (sim.combo >= 2) {
      combo.style.display = 'block'; combo.textContent = `COMBO x${sim.combo}  ·  ${comboMult(sim.combo).toFixed(1)}× SCORE`;
      combo.style.color = comboColor(sim.combo); combo.style.transform = `translateX(-50%) scale(${1 + Math.sin(tMs / 90) * 0.05})`;
    } else combo.style.display = 'none';
    // skill chips (rebuilt only when the set changes; bar width every frame)
    const ids = Object.keys(sim.effects), key = ids.join(',');
    if (key !== lastChips) {
      lastChips = key; chips.textContent = '';
      for (const id of ids) {
        const a = sim.effects[id], col = css(a.def.color), ch = el('div', 'hx-chip hx-mono hx-txt', chips); ch.style.borderColor = col; ch.dataset.id = id;
        const f = el('i', '', ch); f.style.background = col;
        const im = el('img', '', ch); im.src = `assets/skill_icons/skill-${id}.svg`; im.alt = '';
        el('span', '', ch, (a.modifiers._label || a.def.name.toUpperCase()));
      }
    }
    for (const ch of chips.children) {
      const a = sim.effects[ch.dataset.id]; if (!a) continue;
      ch.firstChild.style.width = `${Math.max(0, (a.endsAt - sim.now) / a.def.durationMs) * 100}%`;
    }
    // coach pill
    if (sim.coach) {
      coach.style.display = 'block';
      const ln = sim.coachLine(); if (ln !== lastCoach) { lastCoach = ln; coachP.textContent = ln; }
      coachN.textContent = `TRAINING ${sim.coach.step + 1}/${sim.coach.lines.length}`;
      coachP.style.transform = sim.coach.step === 1 ? `scale(${1 + 0.03 * Math.sin(tMs / 140)})` : '';
    } else if (coach.style.display !== 'none') { coach.style.display = 'none'; lastCoach = ''; }
    if (toastT > 0 && (toastT -= 16) <= 0) toast.style.opacity = 0;
  }
  function showToast(text, color = '#ffd23f') { toast.textContent = text; toast.style.color = color; toast.style.opacity = 1; toastT = 1400; }
  function clearModal() { if (modal) { modal.remove(); modal = null; } }
  function closeGuide() { if (guide) { guide.remove(); guide = null; } }
  function showGuide(onClose) {
    closeGuide();
    guide = el('div', 'hx-guide', root);
    const img = el('img', '', guide);
    img.src = 'assets/ai_skills_icons/image.png';
    img.alt = 'AI Skills Guide';
    el('div', 'cap', guide, 'press H, ESC, or click anywhere to close');
    guide.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); if (onClose) onClose(); else closeGuide(); });
  }
  function hideGameplay() { for (const e of [top, left, right, combo, chips, coach, pb]) e.style.display = 'none'; }
  function showGameplay() { for (const e of [top, left, right, chips, pb]) e.style.display = ''; }

  function buttons(parent, list) {
    const row = el('div', 'hx-btns', parent);
    for (const b of list) { const x = el('div', 'hx-btn', row, b.label); x.style.background = b.color; x.addEventListener('click', b.action); }
  }
  function talk(parent, ex) {
    if (!ex || !ex.length) return;
    const e = ex[Math.floor(Math.random() * ex.length)], row = el('div', 'hx-talk', parent);
    for (const [who, txt, col] of [['PM', e.pm, '#ff5252'], ['DEV', e.dev, '#39c2ff']]) {
      const b = el('div', 'hx-bub', row); const t = el('b', '', b, who); t.style.background = col; b.appendChild(document.createTextNode(txt || ''));
    }
  }
  function showPause(quitAsk, a) {
    clearModal(); modal = el('div', 'hx-modal', root); modal.style.background = 'rgba(0,0,0,.65)';
    const h = el('h1', 'hx-txt', modal, quitAsk ? 'LEAVE THE LEVEL?' : 'PAUSED'); h.style.color = '#ffd23f';
    el('div', 'hx-mono', modal, quitAsk ? "This attempt won't be saved. ESC again = keep smashing." : 'press P to resume').style.color = '#9aa3b2';
    buttons(modal, [{ label: quitAsk ? 'KEEP SMASHING' : 'RESUME', color: '#7ed957', action: a.resume }, { label: quitAsk ? 'QUIT TO MENU' : 'MENU', color: '#2d6cdf', action: a.menu }]);
  }
  function showWin(r, info, a) {
    hideGameplay(); clearModal(); modal = el('div', 'hx-modal', root); modal.style.background = 'rgba(0,0,0,.78)';
    const stars = el('div', 'hx-stars hx-txt', modal);
    for (let i = 0; i < 3; i++) stars.appendChild(i < r.stars ? el('b', '', null, '★') : el('span', '', null, '★'));
    const tag = info && (info.newBest ? 'NEW BEST!' : info.firstClear ? 'FIRST CLEAR!' : '');
    if (tag) el('div', 'hx-txt', modal, tag).style.color = '#7ed957';
    if (r.stars < 3) el('div', 'hx-mono', modal, r.stars < 2 ? '2★ = 25% time left' : '3★ = 45% time left').style.color = '#9aa3b2';
    el('h1', 'hx-txt', modal, 'YOU WIN').style.color = '#7ed957';
    el('div', 'hx-txt', modal, r.title).style.color = '#ccffcc';
    el('div', 'hx-mono', modal, r.subtitle).style.color = '#9be59b';
    el('div', 'hx-mono', modal, `SCORE  ${r.baseScore}    TIME BONUS  +${r.timeBonus}    TOTAL  ${r.score}`).style.color = '#ffd23f';
    const rew = [...((info && info.missions) || []).map((m) => `Daily mission complete: ${m.text}`), ...((info && info.hats) || []).map((h) => `New hat unlocked: ${h.emoji || ''} ${h.name}`)];
    if (rew.length) el('div', 'hx-txt', modal, rew.join('\n')).style.cssText = 'color:#7ed957;white-space:pre-line;font-size:14px';
    talk(modal, r.talk);
    buttons(modal, r.hasNext ? [{ label: 'NEXT LEVEL', color: '#7ed957', action: a.next }, { label: 'MENU', color: '#2d6cdf', action: a.menu }]
      : [{ label: 'PLAY AGAIN', color: '#7ed957', action: a.again }, { label: 'MENU', color: '#2d6cdf', action: a.menu }]);
  }
  function showLose(r, a) {
    hideGameplay(); clearModal(); modal = el('div', 'hx-modal', root); modal.style.background = 'rgba(48,0,0,.82)';
    el('h1', 'hx-txt', modal, 'YOU LOSE').style.color = '#ff8a3d';
    el('div', 'hx-txt', modal, 'Better luck next time!').style.color = '#ffd6b8';
    el('div', 'hx-mono', modal, r.failMessage).style.color = '#ffaaaa';
    el('div', 'hx-mono', modal, `bugs unfixed ${r.unfixed}     bugs hiding ${r.hiding}     score ${r.score}`).style.color = '#ffd6d6';
    talk(modal, r.talk);
    buttons(modal, [{ label: 'RETRY (R)', color: '#f5a623', action: a.retry }, { label: 'MENU (ESC)', color: '#2d6cdf', action: a.menu }]);
  }
  function dispose() { closeGuide(); root.remove(); }
  void onMute;
  return { root, layer, update, showToast, showPause, showWin, showLose, showGuide, closeGuide, clearModal, showGameplay, hideGameplay, dispose, get modalOpen() { return !!modal; }, get guideOpen() { return !!guide; } };
}

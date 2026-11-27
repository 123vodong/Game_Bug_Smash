// story/ui.js - Story Mode DOM UI for the 3D renderer: dialogue box (typewriter + champion portrait), objective tracker
// (floor clock, bugs smashed, keys), TALK prompt (T / tap) with a bubble over NPCs, FLOOR CLEARED panel (best time, saved via
// SaveManager.story2 like the 2D scene). Behaviour is copied from story2/StoryWorldScene.js (lines ~101-295).
// createStoryUi({ source, floor, project, onAgain, onChampion, onMenu }) -> { onMsg(m), update(nowMs), dispose() }
import { CHAMPIONS } from '../../../shared/moba/champions.js';
import { AudioManager } from '../../core/AudioManager.js';
import { SaveManager } from '../../core/SaveManager.js';
import { fmtRunTime } from '../../story2/catalog.js';

const TYPE_MS = 22, HOLD_MS = 2300;
const SPEAKER = { duck: { icon: '🦆', name: 'RUBBER DUCK' }, note: { icon: '📝', name: 'STICKY NOTE' } };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sfx = (fn, ...a) => { try { AudioManager[fn] && AudioManager[fn](...a); } catch (_) { /* audio is optional */ } };

const CSS = `
#bs3d-story{position:fixed;inset:0;z-index:30;pointer-events:none;font:14px Consolas,"Courier New",monospace;color:#eef3ff}
#bs3d-story .top{position:absolute;left:50%;top:48px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;max-width:min(46vw,560px)}
#bs3d-story .chips{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
#bs3d-story .chip{padding:2px 9px;background:rgba(7,11,22,.85);border:1.5px solid #39c2ff;border-radius:4px;font-weight:700;white-space:nowrap}
#bs3d-story .obj{padding:4px 12px;background:rgba(7,11,22,.88);border:2px solid #ffd23f;border-radius:4px;color:#ffe9a6;font-size:14px;text-align:center}
#bs3d-story .obj.pop{animation:stypop .38s ease-out}
#bs3d-story .opt{font-size:12px;color:#9fe39f;background:rgba(7,11,22,.7);padding:1px 8px;border-radius:3px}
@keyframes stypop{from{transform:scale(1.25)}to{transform:scale(1)}}
#bs3d-story .dlg{position:absolute;left:50%;bottom:232px;transform:translateX(-50%);width:min(760px,94vw);box-sizing:border-box;display:flex;gap:12px;align-items:center;padding:10px 14px;min-height:96px;background:#070b16;border:3px solid #ffd23f;border-radius:6px;pointer-events:auto;cursor:pointer}
#bs3d-story .por{flex:0 0 74px;height:74px;border-radius:50%;background:#14203a;border:2px solid #39c2ff;display:flex;align-items:center;justify-content:center;font-size:44px}
#bs3d-story .nm{font:900 14px Arial,sans-serif;color:#ffd23f;text-shadow:0 0 3px #000;margin-bottom:3px}
#bs3d-story .tx{font-size:16px;line-height:1.35;min-height:3.9em}
#bs3d-story .hint{position:absolute;right:10px;bottom:4px;font-size:11px;color:#7f8db0}
#bs3d-story .talk{position:absolute;left:50%;bottom:342px;transform:translateX(-50%);padding:10px 20px;background:rgba(16,48,28,.96);border:2px solid #7ed957;border-radius:6px;font:900 16px Arial,sans-serif;color:#fff;pointer-events:auto;cursor:pointer;text-shadow:0 0 3px #000}
#bs3d-story .bub{position:absolute;left:0;top:0;font-size:34px;text-shadow:0 0 4px #000;will-change:transform}
.bsx-end{display:none!important}/* story has its own FLOOR CLEARED panel; hide the 5v5 end screen */
#bs3d-story .clr{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);pointer-events:auto;animation:stypop .25s ease-out}
#bs3d-story .box{width:min(560px,92vw);padding:22px 20px;background:rgba(7,11,22,.97);border:4px solid #ffd23f;border-radius:8px;text-align:center}
#bs3d-story .box h2{margin:0 0 4px;font:900 32px Arial,sans-serif;color:#ffd23f;text-shadow:0 0 6px #000}
#bs3d-story .box .sub{font:900 15px Arial,sans-serif;color:#c9d6ee;margin-bottom:14px}
#bs3d-story .box .ln{font-size:17px;line-height:1.9}
#bs3d-story .btns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:18px}
#bs3d-story .btns button{padding:12px 16px;min-width:150px;background:#0b1322;color:#fff;border:3px solid var(--c);border-radius:6px;font:900 15px Arial,sans-serif;cursor:pointer}
#bs3d-story .btns button:hover{background:#17243b}
`;

export function createStoryUi({ source, floor, project, onAgain, onChampion, onMenu } = {}) {
  const styleEl = document.createElement('style'); styleEl.id = 'bs3d-story-css'; styleEl.textContent = CSS; document.head.appendChild(styleEl);
  const root = document.createElement('div'); root.id = 'bs3d-story';
  root.innerHTML = `
    <div class="top"><div class="chips"><span class="chip" data-r="clock"></span><span class="chip" data-r="bugs"></span><span class="chip" data-r="keys"></span></div>
      <div class="obj" data-r="obj" hidden></div><div class="opt" data-r="opt" hidden></div></div>
    <div class="bub" data-r="bub" hidden>💬</div>
    <div class="talk" data-r="talk" hidden></div>
    <div class="dlg" data-r="dlg" hidden><div class="por" data-r="por"></div><div><div class="nm" data-r="nm"></div><div class="tx" data-r="tx"></div></div><span class="hint">click / T ▸</span></div>`;
  document.body.appendChild(root);
  const $ = (r) => root.querySelector(`[data-r="${r}"]`);
  const el = { clock: $('clock'), bugs: $('bugs'), keys: $('keys'), obj: $('obj'), opt: $('opt'), bub: $('bub'), talk: $('talk'), dlg: $('dlg'), por: $('por'), nm: $('nm'), tx: $('tx') };
  const last = {}; const setText = (k, v) => { if (last[k] !== v) { last[k] = v; el[k].textContent = v; } };
  const show = (k, on) => { if (el[k].hidden === on) el[k].hidden = !on; };

  let q = [], cur = null, objective = { text: '', optional: '' }, talkTarget = null, ended = false, disposed = false, clearedStats = null, clearRecord = null, panelTimer = 0;
  const now = () => performance.now();

  // ----- dialogue (queue, urgent champion lines cut in front of narration, typewriter) -----
  function queueSay(who, line, ttl = 0) {
    if (!line) return;
    const item = { who: String(who || ''), line: String(line), urgent: !!CHAMPIONS[who], until: ttl > 0 ? now() + ttl : 0 };
    if (item.urgent && cur && !cur.urgent) { q.unshift({ who: cur.who, line: cur.line, urgent: false }); q.unshift(item); cur = null; nextSay(); return; }
    if (item.urgent) { let i = 0; while (i < q.length && q[i].urgent) i++; q.splice(i, 0, item); } else q.push(item);
    if (!cur) nextSay();
  }
  function nextSay() {
    let n = q.shift();
    while (n && n.until && now() > n.until) n = q.shift(); // stale room lines are skipped
    if (!n) { cur = null; show('dlg', false); return; }
    const d = CHAMPIONS[n.who];
    if (d) { el.por.textContent = d.emoji || '🐞'; el.por.style.borderColor = d.color ? '#' + Number(d.color).toString(16).padStart(6, '0') : '#39c2ff'; setText('nm', `${d.name.toUpperCase()} · ${d.title || ''}`); }
    else { const sp = SPEAKER[n.who] || { icon: '💬', name: '' }; el.por.textContent = sp.icon; el.por.style.borderColor = '#ffd23f'; setText('nm', sp.name); }
    el.tx.textContent = ''; last.tx = ''; show('dlg', true);
    cur = { ...n, at: now(), shown: -1, doneAt: 0 };
    if (n.who === 'duck') sfx('uiHover');
  }
  function skipSay() { if (!cur) return; if (cur.shown < cur.line.length) cur.at = -1e9; else nextSay(); }
  function tickSay(t) {
    if (!cur) return;
    const n = Math.min(cur.line.length, Math.floor((t - cur.at) / TYPE_MS));
    if (n !== cur.shown) { cur.shown = n; setText('tx', cur.line.slice(0, n)); }
    if (n >= cur.line.length && !cur.doneAt) cur.doneAt = t;
    if (cur.doneAt && t - cur.doneAt > HOLD_MS) nextSay();
  }
  el.dlg.addEventListener('pointerdown', (e) => { e.stopPropagation(); skipSay(); });

  // ----- talk -----
  function talk() { if (!talkTarget || ended) return; source.send('talk', { id: talkTarget }); show('talk', false); sfx('uiClick'); }
  el.talk.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); talk(); });
  const onKey = (e) => {
    if (e.code !== 'KeyT' || e.repeat) return;
    const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    if (talkTarget && !el.talk.hidden) talk(); else if (cur) skipSay();
  };
  window.addEventListener('keydown', onKey);

  // ----- sim messages: story{k} -----
  function onMsg(m) {
    if (disposed || !m) return;
    switch (m.k) {
      case 'say': queueSay(m.who, m.line, m.ttl); break;
      case 'door': sfx(m.state === 'open' ? 'skillPickup' : 'skillExpire', 'buff'); break; // the door mesh itself is moved by launch.js
      case 'join': sfx('reward'); break;
      case 'pickup': if (m.kind === 'gold') sfx('coin'); else sfx('skillPickup', m.kind === 'keycard' ? 'buff' : 'heal'); break;
      case 'objective': objective = { text: m.text || '', optional: m.optional || '' }; el.obj.classList.remove('pop'); void el.obj.offsetWidth; el.obj.classList.add('pop'); break;
      case 'cleared':
        clearedStats = m;
        try { clearRecord = SaveManager.recordStory2Clear(floor.id, { ms: m.ms, smashed: m.smashed, champ: source.sim.state.champions.get(source.localId).champ }); } catch (_) { clearRecord = null; }
        ended = true; show('talk', false); sfx('victory');
        panelTimer = setTimeout(() => { if (!disposed) showCleared(); }, 2600);
        break;
      default: break;
    }
  }
  const offStory = source.on('story', onMsg);

  function showCleared() {
    const st = clearedStats || {}, s = (source.sim && source.sim.story) || {}, rec = clearRecord;
    const best = !rec ? '' : (rec.best ? (rec.clears > 1 ? '  🏅 new best!' : '') : `  (best ${fmtRunTime(rec.bestMs)})`);
    const d = document.createElement('div'); d.className = 'clr';
    d.innerHTML = `<div class="box"><h2>🏆 FLOOR CLEARED</h2><div class="sub">${esc(floor.name)} · ${esc(floor.clock)}</div>
      <div class="ln">🐞 Bugs smashed: ${st.smashed ?? s.smashed ?? 0}<br>⏱ Time: ${fmtRunTime(st.ms)}${esc(best)}<br>🤝 Coworkers in your party: ${st.allies ?? (s.allies && s.allies.length) ?? 0}<br>Next: 1F · Open Office (coming soon)</div>
      <div class="btns"><button style="--c:#7ed957" data-b="again">▶ PLAY AGAIN</button><button style="--c:#ffd23f" data-b="champ">👥 CHAMPION</button><button style="--c:#39c2ff" data-b="menu">🏠 MENU</button></div></div>`;
    d.addEventListener('pointerdown', (e) => e.stopPropagation());
    d.querySelector('[data-b="again"]').onclick = () => { sfx('uiClick'); onAgain && onAgain(); };
    d.querySelector('[data-b="champ"]').onclick = () => { sfx('uiClick'); onChampion && onChampion(); };
    d.querySelector('[data-b="menu"]').onclick = () => { sfx('uiClick'); onMenu && onMenu(); };
    root.appendChild(d);
  }

  // ----- per frame (DOM writes only on change) -----
  function update(t = now()) {
    if (disposed) return;
    tickSay(t);
    const sim = source.sim, s = sim && sim.story; if (!s) return;
    const mins = s.startedAt ? Math.floor((Date.now() - s.startedAt) / 60000) : 0;
    const base = String(floor.clock || '8:00 PM').match(/^(\d+):(\d+)\s*(AM|PM)$/i);
    setText('clock', '🕗 ' + (base ? `${base[1]}:${String((Number(base[2]) + mins) % 60).padStart(2, '0')} ${base[3].toUpperCase()}` : floor.clock));
    setText('bugs', `🐞 ${s.smashed}`);
    setText('keys', s.keys.size ? [...s.keys].map(() => '🔑').join('') : '🔒');
    show('obj', !!objective.text); setText('obj', objective.text);
    show('opt', !!objective.optional); setText('opt', objective.optional);
    // NPC bubble + talk prompt
    const st = source.state(), me = st && st.champions && st.champions.get(source.localId);
    let npc = null, nd = 330, any = null;
    if (st && st.champions) st.champions.forEach((c) => {
      if (!c._npc) return; if (!any) any = c;
      if (me && !me.dead && !c._talking) { const d = Math.hypot(me.x - c.x, me.y - c.y); if (d < nd) { nd = d; npc = c; } }
    });
    if (any && !any._talking && project && !ended) {
      const p = project(any.x, any.y - 20);
      if (p.visible) { el.bub.hidden = false; el.bub.style.transform = `translate(${Math.round(p.x - 17)}px,${Math.round(p.y - 120)}px)`; } else el.bub.hidden = true;
    } else el.bub.hidden = true;
    talkTarget = npc ? npc.id : null;
    const showTalk = !!npc && !ended; show('talk', showTalk);
    if (showTalk) setText('talk', `💬 TALK TO ${String(npc.name).toUpperCase()}  [T]`);
  }

  return {
    onMsg, update,
    dispose() { disposed = true; clearTimeout(panelTimer); window.removeEventListener('keydown', onKey); try { offStory && offStory(); } catch (_) { /* ignore */ } root.remove(); styleEl.remove(); },
  };
}
export default createStoryUi;

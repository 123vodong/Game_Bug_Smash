// DOM modals for the 3D menu: Levels, Settings, Career, Leaderboard, Welcome/Rename.
// Same data as the Phaser panels in src/ui (SaveManager / Progress / i18n / cosmetics / missions / Identity).
// Each open*() returns { close(), closed } and calls onClose() once when it goes away.
import { SaveManager } from '../../core/SaveManager.js';
import { Progress } from '../../core/Progress.js';
import { AudioManager } from '../../core/AudioManager.js';
import { fxPrefsChanged } from '../../core/FxPrefs.js';
import { getLang, setLang, t } from '../../core/I18n.js';
import { LEVELS, TOTAL_LEVELS } from '../../data/levels.js';
import { HATS, hatById, isHatUnlocked, hatProgress, nextHat } from '../../data/cosmetics.js';
import { MISSION_MODES, dayKey } from '../../data/missions.js';
import { fetchMe, fetchLeaderboard } from '../../core/Identity.js';
import { TIERS, PLACEMENT_GAMES, rankOf } from '../../../shared/moba/ranks.js';

export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const click = () => { try { AudioManager.uiClick?.(); } catch (_) { /* no audio yet */ } };

let openCount = 0;
export const modalOpen = () => openCount > 0;

function modal({ title, accent = '#39ff14', closable = true, onClose, tabs, onTab, startTab }) {
  const body = h('div', { class: 'bsm-mb' });
  const mh = h('div', { class: 'bsm-mh' }, h('h2', null, title));
  const box = h('div', { class: 'bsm-modal', style: `--c:${accent}`, role: 'dialog', 'aria-modal': 'true' }, mh);
  const ov = h('div', { class: 'bsm-ov' }, box);
  const api = { closed: false, body, title: mh.firstChild, close };
  let tabEls = [];
  function close(silent) {
    if (api.closed) return; api.closed = true; openCount--;
    document.removeEventListener('keydown', onKey, true); ov.remove();
    if (!silent) onClose?.();
  }
  function onKey(e) {
    if (e.key === 'Escape' && closable) { e.preventDefault(); e.stopPropagation(); close(); }
  }
  if (closable) {
    mh.append(h('button', { class: 'bsm-x', 'aria-label': 'Close', onclick: () => { click(); close(); } }, '✕'));
    ov.addEventListener('pointerdown', (e) => { if (e.target === ov) close(); });
  }
  if (tabs) {
    const bar = h('div', { class: 'bsm-tabs' });
    api.setTab = (id) => { tabEls.forEach((b) => b.classList.toggle('on', b.dataset.id === id)); body.replaceChildren(); onTab(id, body); };
    tabEls = tabs.map(([id, txt]) => h('button', { class: 'bsm-tab', 'data-id': id, onclick: () => { click(); api.setTab(id); } }, txt));
    bar.append(...tabEls); box.append(bar);
  }
  box.append(body);
  document.addEventListener('keydown', onKey, true);
  document.body.append(ov); openCount++;
  if (tabs) api.setTab(startTab || tabs[0][0]);
  return api;
}

const kv = (k, v) => h('div', { class: 'kv' }, h('span', null, k), h('b', null, String(v)));
const bar = (frac, col) => h('div', { class: 'bsm-pb' }, h('i', { style: `width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%;${col ? `background:${col}` : ''}` }));

// ------------------------------------------------------------------ LEVELS
const WORLD_NAMES = { 1: 'Junior Dev Hell', 2: 'Feature Creep', 3: 'Legacy Codebase', 4: 'AI-Assisted Chaos' };
const WORLD_COLORS = { 1: '#39ff14', 2: '#00d9ff', 3: '#c44dff', 4: '#ff3ef2' };

export function openLevels({ onPlay, onClose } = {}) {
  const m = modal({ title: '🗂 LEVELS', accent: '#39ff14', onClose });
  const stars = SaveManager.getAllLevelStars();
  const unlocked = SaveManager.getUnlockedIndex();
  const allOpen = unlocked >= TOTAL_LEVELS || SaveManager.isCampaignCleared();
  const total = Object.values(stars).reduce((a, s) => a + s, 0);
  m.body.append(h('div', { class: 'bsm-gold', style: 'text-align:center;font-size:13px' },
    `★ ${total}/${TOTAL_LEVELS * 3}  ·  ★ clear  ★★ beat the deadline with time to spare  ★★★ way ahead of it`));
  for (const w of [...new Set(LEVELS.map((l) => l.world))]) {
    const col = WORLD_COLORS[w] || '#00d9ff';
    m.body.append(h('div', { class: 'bsm-world', style: `color:${col}` }, `WORLD ${w}`, h('span', { class: 'bsm-sub' }, WORLD_NAMES[w] || '')));
    const g = h('div', { class: 'bsm-grid g4' });
    LEVELS.forEach((l, i) => {
      if (l.world !== w) return;
      const open = allOpen || i <= unlocked, s = stars[l.id] || 0, isNext = !allOpen && i === unlocked;
      const best = SaveManager.getLevelBest(l.id);
      const nm = String(l.name || '').replace(/^World\s*\d+-\d+\s*·\s*/, '');
      g.append(h('button', { class: 'bsm-lv' + (isNext ? ' next' : ''), style: `--wc:${col}`, disabled: !open || null,
        onclick: () => { click(); m.close(true); onPlay?.(i); } },
        h('span', { class: 'id' }, l.id, open ? '' : ' 🔒'), h('span', { class: 'nm' }, nm),
        open ? h('span', { class: 'st' }, '★'.repeat(s) + '☆'.repeat(3 - s)) : h('span', { class: 'meta' }, 'clear the level before'),
        open ? h('span', { class: 'meta' }, isNext ? h('b', { style: `color:${col}` }, 'NEXT ▶') : '', best ? `best ${best}` : '') : null));
    });
    m.body.append(g);
  }
  return m;
}

// ------------------------------------------------------------------ SETTINGS
const isTouch = () => (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
const CONTROLS = {
  campaign: ['🎯 CAMPAIGN', [['Mouse', 'stickman follows the cursor'], ['HOLD click', 'smash (one click is a code review, not a fix)'], ['P', 'pause'], ['H', 'skill guide'], ['M', 'mute'], ['ESC', 'back to menu']],
    [['Drag', 'move'], ['Hold finger', 'smash'], ['⏸', 'pause']]],
  arena: ['🌐 PERSONAL (online)', [['Click / arrows', 'move'], ['SPACE / click bug', 'smash'], ['Q', 'dash'], ['W', 'shield'], ['E', 'jump'], ['R', 'ultimate'], ['ENTER', 'chat'], ['M', 'mute'], ['ESC', 'clock out']],
    [['Left thumb', 'joystick'], ['Tap a bug', 'smash'], ['Buttons', 'skills (bottom-right)'], ['☰', 'break room']]],
  team: ['⚔️ TEAM 5v5 (Office Siege)', [['Right/left-click', 'move · click enemy = attack'], ['Q W E R', 'skills at cursor'], ['D F', 'summoner spells'], ['SPACE', 'attack nearest'], ['B', 'recall'], ['P', 'shop'], ['C', 'info'], ['TAB', 'scores']],
    [['Joystick', 'move'], ['⚔', 'attack'], ['Skill / D F', 'auto-aim'], ['🏠 🛒 ℹ', 'recall · shop · info']]],
};
const CREDITS = ['BUG SMASH: Deadline Hunter', '', 'A tiny office comedy about fixing bugs before Friday.', 'Game design, code & art direction: the Bug Smash team',
  'Built with Phaser, Three.js, Colyseus and WebAudio (every sound is synthesized).', 'Stickmen animated with love and too much coffee.', '', 'No bugs were harmed. Most of them were features.'];

const MENU3D_KEY = 'bs.menu3d';
export const getMenu3d = () => { try { const v = localStorage.getItem(MENU3D_KEY); return v === 'med' || v === 'off' ? v : 'low'; } catch (_) { return 'low'; } };

export function switchRenderer(mode) {
  const target = mode === '3d' ? '3d' : '2d';
  try { localStorage.setItem('bs.renderer', target); } catch (_) { /* private mode */ }
  const cur = new URLSearchParams(location.search);
  const next = new URLSearchParams();
  const sc = cur.get('scene');
  if (sc) next.set('scene', sc);
  const srv = cur.get('server');
  if (srv) next.set('server', srv);
  next.set('renderer', target);
  location.href = `${location.pathname}?${next.toString()}`;
}

function toggle(on, fn) {
  const b = h('button', { class: 'bsm-sw' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(!!on) });
  b.onclick = () => { on = !on; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); click(); fn(on); };
  return b;
}
function seg(opts, cur, fn) {
  const w = h('div', { class: 'bsm-seg' });
  for (const [id, txt] of opts) {
    const b = h('button', { class: id === cur ? 'on' : '', onclick: () => { w.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); fn(id); } }, txt);
    w.append(b);
  }
  return w;
}
const setRow = (title, sub, ctl) => h('div', { class: 'bsm-set' }, h('div', { class: 'l' }, h('b', null, title), sub ? h('span', { class: 'bsm-sub' }, sub) : null), ctl);

export function openSettings({ tab = 'settings', onClose, onBackdrop } = {}) {
  const m = modal({
    title: t('set.title'), accent: '#00d9c2', onClose, startTab: tab,
    tabs: [['settings', t('set.tab.settings')], ['controls', t('set.tab.controls')], ['about', t('set.tab.about')]],
    onTab(id, body) {
      if (id === 'settings') {
        const s = SaveManager.getSettings();
        const vol = h('input', { class: 'bsm-range', type: 'range', min: '0', max: '100', value: String(Math.round(s.volume * 100)) });
        vol.oninput = () => AudioManager.setVolume(vol.value / 100);
        vol.onchange = () => { SaveManager.setSettings({ volume: vol.value / 100 }); AudioManager.volumePreview?.(); };
        body.append(
          setRow(t('set.volume'), '', vol),
          setRow(t('set.sound'), t('set.soundSub'), toggle(!SaveManager.isMuted(), (on) => { SaveManager.setMuted(!on); AudioManager.setMuted(!on); if (on) AudioManager.volumePreview?.(); })),
          setRow(t('set.shake'), t('set.shakeSub'), toggle(s.shake, (on) => { SaveManager.setSettings({ shake: on }); fxPrefsChanged(); })),
          setRow(t('set.flashes'), t('set.flashesSub'), toggle(s.flashes, (on) => { SaveManager.setSettings({ flashes: on }); fxPrefsChanged(); })),
          setRow(t('set.fx'), t('set.fxSub'), seg([['auto', 'AUTO'], ['high', 'HIGH'], ['low', 'LOW']], SaveManager.getTeamFx(), (id) => SaveManager.setTeamFx(id))),
          setRow('3D Renderer (Beta)', 'Now your bugs cast shadows. Off = classic 2D.', toggle(true, (on) => {
            if (!on) switchRenderer('2d');
          })),
          setRow('Menu backdrop (3D)', 'Low = default, light on phones. Off = plain gradient.', seg([['low', 'LOW'], ['med', 'MED'], ['off', 'OFF']], getMenu3d(), (id) => {
            try { localStorage.setItem(MENU3D_KEY, id); } catch (_) { /* private mode */ }
            onBackdrop?.(id);
          })),
          setRow(t('set.lang'), t('set.langSub'), seg([['en', 'ENGLISH'], ['vi', 'TIẾNG VIỆT']], getLang(), (id) => {
            setLang(id); click(); m.title.textContent = t('set.title'); m.setTab('settings');
          })),
          setRow(t('set.replay'), t('set.replaySub'), h('button', { class: 'bsm-btn', style: '--c:#ffd23f;min-height:44px;font-size:13px', onclick: () => { SaveManager.clearFlags(); toast(t('set.replayToast')); } }, t('set.replay'))),
        );
      } else if (id === 'controls') {
        const g = h('div', { class: 'bsm-ctl' });
        for (const [title, keys, touch] of Object.values(CONTROLS)) {
          const p = h('div', { class: 'bsm-panel', style: '--pc:#00d9c2' }, h('h4', null, title));
          if (isTouch()) { for (const [k, v] of touch) p.append(h('div', { class: 'kv' }, h('span', null, k), h('b', null, v))); p.append(h('div', { class: 'bsm-sub', style: 'text-align:center' }, '— keyboard —')); }
          for (const [k, v] of keys) p.append(h('div', { class: 'kv' }, h('span', null, k), h('b', null, v)));
          g.append(p);
        }
        body.append(g);
      } else {
        body.append(h('div', { class: 'bsm-about' }, h('div', { style: 'font-size:54px' }, '🐞'),
          CREDITS.map((l, i) => h('div', { style: i === 0 ? 'font:900 22px "Arial Black",sans-serif;color:#39ff14' : '' }, l || ' ')),
          h('div', { class: 'bsm-sub' }, 'Tip: your settings, career and hats live in this browser.')));
      }
    },
  });
  return m;
}

// ------------------------------------------------------------------ CAREER
const LEVEL_TITLES = ['Intern', 'Fresher', 'Junior', 'Middle', 'Senior', 'Super Senior']; // mirrors MultiPlayScene (display only)
const fmtTime = (ms) => { const m = Math.floor((ms || 0) / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

function careerHeader() {
  const hat = hatById(SaveManager.getHat());
  const streak = SaveManager.getLiveStreak(dayKey());
  return h('div', { style: 'display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:10px' },
    h('b', { style: 'font:900 20px "Arial Black",sans-serif' }, `${hat.emoji ? hat.emoji + ' ' : ''}${SaveManager.getPlayerName() || 'New hire'}`),
    h('span', { style: `color:${streak > 0 ? '#ffb347' : '#8fa8b8'}` }, `🔥 streak ${streak} day${streak === 1 ? '' : 's'} · best ${SaveManager.getCareer().bestStreak}`));
}

export function openCareer({ tab = 'stats', onClose } = {}) {
  const m = modal({
    title: '👤 CAREER', accent: '#ffd23f', onClose, startTab: tab, tabs: [['stats', 'STATS'], ['hats', 'HATS'], ['today', 'TODAY']],
    onTab(id, body) {
      const k = SaveManager.getCareer();
      if (id === 'stats') {
        const lvl = Math.max(1, Math.min(6, k.maxLevel || 1));
        const wr = k.teamGames ? `${Math.round((k.teamWins / k.teamGames) * 100)}%` : '—';
        const card = (ti, col, rows) => h('div', { class: 'bsm-panel', style: `--pc:${col}` }, h('h4', null, ti), rows.map(([a, b]) => kv(a, b)));
        body.append(careerHeader(), h('div', { class: 'bsm-grid g3' },
          card('🌐 PERSONAL', '#39ff14', [['Bugs smashed', k.bugs], ['Laptops broken (KOs)', k.kos], ['Burnouts', k.deaths], ['Peak title', `Lv${lvl} ${LEVEL_TITLES[lvl - 1]}`], ['Best combo', `×${k.bestCombo}`], ['Best score', k.bestScore], ['Deadlines defeated', k.bosses], ['Time at the office', fmtTime(k.playMs)], ['Shifts', k.sessions]]),
          card('⚔️ TEAM 5v5', '#c44dff', [['Online matches', k.teamGames], ['Wins', k.teamWins], ['Win rate', wr], ['Takedowns', k.teamTakedowns], ['Practice matches', k.teamPractice]]),
          card('🎯 CAMPAIGN', '#00d9ff', [['Levels cleared', `${Math.min(k.campaignLevels, TOTAL_LEVELS)}/${TOTAL_LEVELS}`], ['Stars', `${k.campaignStars}/${TOTAL_LEVELS * 3} ★`], ['Best score', SaveManager.getHighScore()], ['Campaign beaten', SaveManager.isCampaignCleared() ? 'yes 🎉' : 'not yet']])));
      } else if (id === 'hats') {
        const owned = HATS.filter((x) => x.unlock && isHatUnlocked(x, k)).length;
        const info = h('div', { class: 'bsm-sub', style: 'text-align:center;margin-top:10px;font-size:14px' }, 'Tap a hat to wear it. Locked hats show how to earn them.');
        const grid = h('div', { class: 'bsm-grid g6' });
        const draw = () => {
          grid.replaceChildren();
          const eq = SaveManager.getHat();
          for (const x of HATS) {
            const ok = isHatUnlocked(x, k), on = (x.id || '') === (eq || '');
            const p = x.unlock ? hatProgress(x, k) : null;
            grid.append(h('button', { class: 'bsm-hat' + (on ? ' on' : '') + (ok ? '' : ' lock'), onclick: () => {
              click();
              if (!ok) { info.textContent = `🔒 ${x.emoji} ${x.name}: ${x.unlock.label} (${p.cur}/${p.at})`; return; }
              SaveManager.setHat(x.id); info.textContent = x.id ? `${x.emoji} ${x.name} equipped. You'll wear it in Personal and Team 5v5.` : 'Hat off. Bold.'; draw();
            } }, h('span', { class: 'e' }, (ok ? x.emoji : '🔒') || '🚫'), h('span', { class: 'n' }, x.name), p ? bar(p.frac, ok ? '#39ff14' : '#00d9ff') : null,
            h('span', { class: 'p' }, on ? 'WEARING' : ok ? 'tap to wear' : p ? `${p.cur}/${p.at}` : '')));
          }
        };
        draw();
        body.append(h('div', { class: 'bsm-gold', style: 'text-align:center;margin-bottom:10px' }, `${owned}/${HATS.length - 1} hats unlocked · cosmetic only · worn in Personal and Team 5v5`), grid, info);
      } else {
        const ms = Progress.today(), done = ms.filter((x) => x.done).length, streak = SaveManager.getLiveStreak(dayKey());
        body.append(careerHeader(), h('h4', { class: 'bsm-gold' }, `TODAY'S MISSIONS · ${done}/${ms.length}`),
          ms.map((x) => { const md = MISSION_MODES[x.mode] || MISSION_MODES.arena;
            return h('div', { class: 'bsm-panel', style: `--pc:${x.done ? '#39ff14' : '#00d9ff'};margin-bottom:8px;display:grid;grid-template-columns:auto 1fr minmax(80px,200px) auto;gap:12px;align-items:center` },
              h('span', { style: 'font-size:24px' }, md.icon), h('div', null, h('div', { style: x.done ? 'color:#8fa8b8' : '' }, x.text), h('div', { class: 'bsm-sub' }, md.label)),
              bar(x.progress / x.goal, x.done ? '#39ff14' : '#00d9ff'), h('b', { style: `color:${x.done ? '#7ed957' : '#00cfff'}` }, x.done ? '✓ done' : `${x.progress}/${x.goal}`)); }),
          h('div', { style: 'color:#ffb347;text-align:center;margin-top:12px' }, done === ms.length ? `All done today 🎉 Come back tomorrow to keep the ${streak}-day streak.`
            : `Finish all ${ms.length} today to ${streak > 0 ? `extend your ${streak}-day streak` : 'start a streak'}. 📅 3 days and 🦄 7 days unlock hats.`));
        const nh = nextHat(k);
        body.append(h('div', { class: 'bsm-gold', style: 'text-align:center;margin-top:10px' }, nh ? `Next hat: ${nh.hat.emoji} ${nh.hat.name} — ${nh.hat.unlock.label} (${nh.cur}/${nh.at})` : 'Every hat unlocked. HR is concerned.'), nh ? bar(nh.frac, '#ffd23f') : null);
      }
    },
  });
  return m;
}

// ------------------------------------------------------------------ LEADERBOARD
export function openLeaderboard({ onClose } = {}) {
  const m = modal({ title: '🏆 OFFICE RANKS · TEAM MODE', accent: '#ffd23f', onClose });
  m.body.append(h('div', { class: 'bsm-sub', style: 'text-align:center;padding:30px' }, 'loading the rankings…'));
  Promise.all([fetchMe(), fetchLeaderboard()]).then(([me, top]) => {
    if (m.closed) return;
    m.body.replaceChildren();
    if (!me && !top) { m.body.append(h('div', { style: 'color:#ff8a8a;text-align:center;padding:30px' }, "📡 Can't reach the ranking server. Ranks are kept by the online server. Try again when it is up.")); return; }
    const r = me?.rank, tier = r ? (TIERS.find((x) => x.id === r.tier) || TIERS[0]) : TIERS[0];
    if (r) {
      m.body.append(h('div', { class: 'bsm-panel', style: `--pc:${tier.css}` },
        h('div', { style: 'display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px' },
          h('b', { style: `font:900 24px "Arial Black",sans-serif;color:${tier.css}` }, `${tier.emoji} ${r.label} `, h('span', { class: 'bsm-gold' }, r.starText || '')),
          h('b', null, `${r.wins}W ${r.losses}L (${r.games ? Math.round((r.wins / r.games) * 100) : 0}%)`)),
        h('div', { class: 'bsm-gold', style: 'font-size:13px' }, `${r.lp} LP${r.place ? ` · #${r.place} in the office` : ''}` + (r.placementLeft > 0 ? ` · placement ${r.games}/${PLACEMENT_GAMES}: you climb fast` : ` · peak ${rankOf(r.peak, PLACEMENT_GAMES).label}`)),
        bar(r.lp / 100, tier.css)));
    }
    m.body.append(h('div', { class: 'bsm-ladder' }, TIERS.map((x) => h('span', { style: `color:${x.css};border-color:${x.css}${r && x.id === r.tier ? '' : '66'};${r && x.id === r.tier ? `background:${x.css}33` : ''}` }, `${x.emoji} ${x.name}`))),
      h('div', { class: 'bsm-sub' }, 'Start: Intern IV. Win ≈ +1 ★, loss ≈ −1 ★. 5 ★ = next division.'));
    const list = Array.isArray(top) ? top : [];
    if (!list.length) { m.body.append(h('div', { class: 'bsm-gold', style: 'text-align:center;padding:18px' }, 'Nobody has played a ranked match yet. Win one (quick play or custom rooms) to top the board! 🥇')); return; }
    let page = 0; const PAGE = 20, pages = Math.ceil(list.length / PAGE);
    const box = h('div', { style: 'margin-top:10px' }), pg = h('div', { class: 'bsm-sub', style: 'text-align:center;margin-top:8px' });
    const render = () => {
      box.replaceChildren();
      list.slice(page * PAGE, page * PAGE + PAGE).forEach((p, k) => {
        const n = page * PAGE + k + 1, tt = TIERS.find((x) => x.id === p.tier) || TIERS[0], mine = me && p.id === me.id;
        box.append(h('div', { class: 'bsm-lbrow' + (mine ? ' me' : '') }, n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : `${n}.`,
          `${String(p.name || 'Player').slice(0, 16)}${mine ? ' (you)' : ''}`, h('span', { style: `color:${tt.css}` }, `${tt.emoji} ${p.label}`), h('span', { class: 'bsm-gold' }, `${p.starText || ''} ${p.wins}W`)));
      });
      pg.textContent = pages > 1 ? `page ${page + 1} / ${pages}` : `${list.length} ranked player${list.length === 1 ? '' : 's'}`;
    };
    render();
    m.body.append(box, pg);
    if (pages > 1) m.body.append(h('div', { class: 'bsm-row', style: 'margin-top:8px' },
      h('button', { class: 'bsm-btn', style: '--c:#ffd23f;min-width:80px', onclick: () => { page = (page + pages - 1) % pages; render(); } }, '◀'),
      h('button', { class: 'bsm-btn', style: '--c:#ffd23f;min-width:80px', onclick: () => { page = (page + 1) % pages; render(); } }, '▶')));
  });
  return m;
}

// ------------------------------------------------------------------ WELCOME / RENAME
/** mode 'welcome' -> onChoice('campaign'|'online'|'menu', name); mode 'rename' -> onDone(name). */
export function openWelcome({ mode = 'welcome', onChoice, onDone, onClose } = {}) {
  const welcome = mode === 'welcome';
  const m = modal({ title: welcome ? '👋 WELCOME, NEW HIRE!' : '✏️ YOUR NAME', accent: '#39ff14', closable: !welcome, onClose });
  const input = h('input', { class: 'bsm-input', type: 'text', maxlength: '32', autocomplete: 'off', spellcheck: 'false', lang: 'vi', placeholder: 'your name', enterkeyhint: 'done', value: SaveManager.getPlayerName() });
  const finish = (choice) => {
    const name = SaveManager.setPlayerName(input.value);
    if (welcome) SaveManager.setFlag('welcomeSeen', true);
    m.close(true);
    if (welcome) onChoice?.(choice, name); else onDone?.(name);
    onClose?.();
  };
  if (welcome) m.body.append(h('div', { style: 'text-align:center;font-size:17px' }, 'HR lost your paperwork, so just smash bugs.'),
    h('div', { class: 'bsm-sub', style: 'text-align:center;margin:6px 0 16px' }, 'Bugs are eating the deadline. You have a laptop. Do the math.'));
  m.body.append(h('div', { class: 'bsm-gold', style: 'text-align:center;margin:8px 0;font:900 16px "Arial Black",sans-serif' }, 'What should the office call you?'), input,
    h('div', { class: 'bsm-sub', style: 'text-align:center;margin-top:8px' }, 'max 16 characters · Vietnamese welcome (Đông, Hằng…)'));
  if (welcome) m.body.append(h('div', { class: 'bsm-pick' },
    h('button', { class: 'bsm-btn', onclick: () => { click(); finish('campaign'); } }, '▶ START TRAINING'),
    h('button', { class: 'bsm-btn', style: '--c:#00d9ff', onclick: () => { click(); finish('online'); } }, '🌐 JUMP ONLINE')),
  h('div', { style: 'text-align:center;margin-top:8px' }, h('button', { class: 'bsm-link', onclick: () => finish('menu') }, 'look around the menu first')));
  else m.body.append(h('div', { class: 'bsm-pick' }, h('button', { class: 'bsm-btn', onclick: () => { click(); finish('save'); } }, 'SAVE'),
    h('button', { class: 'bsm-btn', style: '--c:#8a94a8', onclick: () => m.close() }, 'CANCEL')));
  input.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.isComposing || ev.keyCode === 229) return;
    if (ev.key === 'Enter') { ev.preventDefault(); finish(welcome ? 'campaign' : 'save'); }
  });
  input.addEventListener('keyup', (ev) => ev.stopPropagation());
  if (!isTouch()) setTimeout(() => { if (!m.closed) input.focus(); }, 160);
  return m;
}

export function toast(msg) {
  const el = h('div', { class: 'bsm-toast' }, msg);
  document.body.append(el); setTimeout(() => el.remove(), 2500);
}

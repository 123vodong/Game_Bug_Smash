// BUG SMASH: Deadline Hunter — main menu as a DOM/CSS screen over a light Three.js backdrop.
//   const handle = await startMenu({ params, navigate });   // handle.stop() removes everything
// navigate(target, opts) is supplied by the caller (routing lives outside). Targets:
//   campaign {levelIndex}   personal {}   team {rejoin?}   practice {offline,sandbox,champ,name}
//   story {}   lobby {}   custom {joinCode, name}
// The menu fades out, calls navigate(), then tears itself down (stop()). If navigate throws, the menu comes back.
// Keys: ENTER play · L levels · S story · M mute. Ignored while a panel is open or an input has focus.
import { SaveManager } from '../../core/SaveManager.js';
import { AudioManager } from '../../core/AudioManager.js';
import { TOTAL_LEVELS } from '../../data/levels.js';
import { TIPS_DEFAULT, TIPS_REAL } from '../../data/tips.js';
import { MISSION_MODES, dayKey } from '../../data/missions.js';
import { HATS, isHatUnlocked } from '../../data/cosmetics.js';
import { Progress } from '../../core/Progress.js';
import { loadMatch, clearMatch, fetchMe, apiUrl } from '../../core/Identity.js';
import { CHAMPIONS, isChampionId } from '../../../shared/moba/champions.js';
import { STORY_FLOORS, STORY_DEFAULT_CHAMP, nextStoryFloor, fmtRunTime } from '../../story2/catalog.js';
import { t, onLangChange } from '../../core/I18n.js';
import { h, openLevels, openSettings, openCareer, openLeaderboard, openWelcome, modalOpen, toast, getMenu3d, switchRenderer } from './panels.js';

let cssLoaded = false;
function loadCss() {
  if (cssLoaded) return; cssLoaded = true;
  document.head.append(h('link', { rel: 'stylesheet', href: new URL('./menu.css', import.meta.url).href }));
}

const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

export async function startMenu({ params = new URLSearchParams(location.search), navigate } = {}) {
  loadCss();
  document.getElementById('bs3d-menu')?.remove();
  AudioManager.applySaved();
  let dead = false, starting = false, backdrop = null;
  const timers = [], unsubs = [];

  // ---------------------------------------------------------------- DOM
  const i18n = []; // [el, key] pairs refreshed on language change
  const L = (el, key) => { el.textContent = t(key); i18n.push([el, key]); return el; };
  const btn = (cls, color, ic, key, fn, extra) => {
    const label = h('span', null);
    const b = h('button', { class: `bsm-btn ${cls}`, style: `--c:${color}`, onclick: () => { AudioManager.uiClick?.(); fn(); } }, ic ? h('span', { class: 'ic' }, ic) : null, L(label, key), extra);
    b.addEventListener('pointerenter', () => AudioManager.uiHover?.());
    return b;
  };
  const newTag = () => h('span', { class: 'bsm-new' }, 'NEW');

  const root = h('div', { class: 'bsm-root', id: 'bs3d-menu' });
  const vig = h('div', { class: 'bsm-vig' }), scan = h('div', { class: 'bsm-scan' });
  root.style.background = 'radial-gradient(ellipse at 50% 30%,#10243a,#070b14 70%)';

  // title block
  const term = h('div', { class: 'bsm-term' }, '$ ', h('b', null, 'git blame'), ' deadline ', h('span', { class: 'bsm-cur' }));
  const title = h('h1', { class: 'bsm-title', 'aria-label': 'BUG SMASH: Deadline Hunter' },
    h('span', { class: 'a' }, '🐞 BUG SMASH'), h('span', { class: 'b' }, h('i', null, ':'), ' Deadline Hunter'));
  const tagline = h('div', { class: 'bsm-tag' }, '// the bugs ate the sprint. you have a laptop.');

  const playBtn = btn('bsm-play', '#39ff14', '▶', 'main.play', () => playGame());
  const onlineEl = h('div', { class: 'bsm-online' }, "● checking who's online…");
  const personal = btn('', '#39ff14', '∞', 'main.personal', () => go('personal'));
  const team = btn('', '#c44dff', '⚔', 'main.team', () => go('team'), newTag());
  const practice = btn('', '#ffb347', '⚔', 'main.practice', () => practiceGo());
  const mpCap = L(h('span', { class: 'cap' }), 'main.multiplayer');
  const frame = h('div', { class: 'bsm-frame' }, mpCap, personal, team, practice);
  const settings = btn('', '#00d9c2', '⚙', 'main.settings', () => panel(() => openSettings({ onClose: after, onBackdrop: setBackdrop })));
  const career = btn('', '#ffd23f', '👤', 'main.career', () => panel(() => openCareer({ onClose: after })));
  const levels = btn('', '#00d9c2', '▦', 'main.levels', () => panel(() => openLevels({ onClose: after, onPlay: (i) => go('campaign', { levelIndex: i }) })));
  const ranks = h('button', { class: 'bsm-btn', style: '--c:#ffd23f', onclick: () => { AudioManager.uiClick?.(); panel(() => openLeaderboard({ onClose: after })); } }, h('span', { class: 'ic' }, '🏆'), h('span', null, 'RANKS'));
  const subRow = h('div', { class: 'bsm-row' }, settings, career, levels, ranks);
  const main = h('div', { class: 'bsm-main' }, term, title, tagline, playBtn, frame, onlineEl, subRow);

  // cards
  const storyCard = buildStory();
  const dailyCard = h('button', { class: 'bsm-card', onclick: () => { AudioManager.uiClick?.(); panel(() => openCareer({ tab: 'today', onClose: after })); } });
  const tipP = h('p', null);
  const tipTitle = L(h('span', { class: 'ttl' }), 'main.devTip');
  const tipCard = h('div', { class: 'bsm-card bsm-tip' }, h('h3', null, tipTitle), h('div', { class: 'code' }, '</>'), tipP);
  const dailyTitle = h('h3', null);
  L(dailyTitle, 'main.daily');

  const rendBtn = h('button', {
    class: 'bsm-icobtn',
    id: 'bsm-renderer',
    title: '3D (beta): now your bugs cast shadows.',
    'aria-label': 'Switch to classic 2D renderer',
    style: 'padding:0 12px;font:900 12px "Arial Black",sans-serif;border-color:#00d9ff88;color:#7ec8ff;display:inline-flex;align-items:center;gap:6px',
    onclick: () => { AudioManager.uiClick?.(); switchRenderer('2d'); },
  }, '🧊 3D (beta)');
  const top = h('div', { class: 'bsm-top' }, rendBtn, h('button', { class: 'bsm-icobtn', 'aria-label': 'Mute', id: 'bsm-mute', onclick: () => toggleMute() }, AudioManager.isMuted?.() ? '🔇' : '🔊'));
  const careerLine = h('button', { class: 'bsm-link bsm-career', onclick: () => panel(() => openCareer({ onClose: after })) });
  const nameBtn = h('button', { class: 'bsm-link', style: 'color:#aab0c0', onclick: () => rename() });
  const about = L(h('button', { class: 'bsm-link', onclick: () => panel(() => openSettings({ tab: 'about', onClose: after, onBackdrop: setBackdrop })) }), 'main.about');
  const keysEl = h('div', { class: 'bsm-keys' });
  const foot = h('div', { class: 'bsm-foot' }, h('div', null, careerLine, h('br'), keysEl, h('br'), about), nameBtn);
  const wrap = h('div', { class: 'bsm-wrap' }, top, h('div', { class: 'bsm-story' }, storyCard), main,
    h('div', { class: 'bsm-side' }, dailyCard, tipCard), foot);
  const fade = h('div', { class: 'bsm-fade' });
  root.append(vig, scan, h('div', { class: 'bsm-scroll' }, wrap), fade);
  document.body.append(root);

  // ---------------------------------------------------------------- data views
  function buildStory() {
    const save = SaveManager.getStory2(), floor = nextStoryFloor(save.floors), tc = SaveManager.getTeamChamp();
    const champ = isChampionId(save.champ) ? save.champ : (isChampionId(tc) ? tc : STORY_DEFAULT_CHAMP), def = CHAMPIONS[champ];
    const cleared = STORY_FLOORS.filter((f) => save.floors[f.id]?.clears > 0).length, rec = save.floors[floor.id];
    const ttl = L(h('h3', null), 'main.story');
    return h('button', { class: 'bsm-card bsm-story-card', onclick: () => { AudioManager.uiClick?.(); go('story'); } }, newTag(), ttl,
      h('div', { class: 'who' }, h('div', { class: 'face' }, def?.emoji || '🧑‍💻'),
        h('div', null, h('div', { class: 'fl' }, `FLOOR ${floor.n}`), h('div', { class: 'fs' }, `${floor.name} · ${floor.clock}`), h('div', null, floor.sub))),
      h('div', { class: 'pips' }, STORY_FLOORS.map((f) => h('i', { class: save.floors[f.id]?.clears > 0 ? 'd' : f.id === floor.id ? 'n' : '' })), h('span', { style: 'color:#ffcf8a;font-size:11px;margin-left:4px' }, `${cleared}/${STORY_FLOORS.length} floors`)),
      h('div', { style: 'color:#e6dccb' }, rec?.clears > 0 ? `Best ${fmtRunTime(rec.bestMs)} on this floor. Floors 2-5 are on the way.` : 'Climb the office tower by midnight. Smash bug nests, recruit coworkers.'),
      h('span', { class: 'go' }, '▶  PLAY STORY'));
  }

  function renderDaily() {
    const day = dayKey(), ms = Progress.today(), doneN = ms.filter((m) => m.done).length, streak = SaveManager.getLiveStreak(day);
    dailyCard.replaceChildren(dailyTitle,
      ...ms.map((m) => h('div', { class: 'bsm-m' + (m.done ? ' done' : '') }, h('span', { class: 'ck' }, m.done ? '✓' : '○'), h('span', null, (MISSION_MODES[m.mode] || MISSION_MODES.arena).icon),
        h('span', null, m.text), h('span', { class: 'pr' }, m.done ? 'done' : `${m.progress}/${m.goal}`))),
      h('div', { class: 'bsm-bar' }, h('i', { style: `width:${ms.length ? (doneN / ms.length) * 100 : 0}%` })),
      h('div', { class: 'bsm-cardfoot' }, h('span', { style: `color:${streak > 0 ? '#ffb347' : '#5a7a90'}` }, streak > 0 ? `🔥 ${streak}-day streak` : 'finish all 3 to start a streak'), h('span', { style: 'color:#00cfff' }, `${doneN}/${ms.length}`)));
  }

  const nameText = () => { const n = SaveManager.getPlayerName(); return n ? `name: ${n} (edit)` : 'name: (click to set)'; };
  function careerText() {
    const c = SaveManager.getCareer(), hats = HATS.filter((x) => x.unlock && isHatUnlocked(x, c)).length, total = HATS.length - 1;
    const played = c.bugs > 0 || c.sessions > 0 || c.teamGames > 0 || c.teamPractice > 0 || c.campaignLevels > 0;
    if (!played) return `career: ${total} hats to unlock across every mode 🎩`;
    const p = [];
    if (c.bugs || c.sessions) p.push(`${c.bugs} bugs`);
    if (c.teamGames) p.push(`siege ${c.teamWins}W/${c.teamGames}`);
    p.push(`hats ${hats}/${total}`);
    return `career · ${p.join(' · ')}`;
  }
  function renderBits() {
    const c = SaveManager.getCareer();
    nameBtn.textContent = nameText(); careerLine.textContent = careerText();
    keysEl.textContent = `levels ${Math.min(c.campaignLevels, TOTAL_LEVELS)}/${TOTAL_LEVELS} ★${c.campaignStars}   [S] story  [L] levels  [M] mute  [ENTER] play`;
    renderDaily();
  }
  const after = () => { if (!dead) renderBits(); };
  renderBits();

  // dev tips: real tips and jokes alternate 1:1, each pool shuffled
  const pools = { real: shuffle(TIPS_REAL), joke: shuffle(TIPS_DEFAULT) }, idx = { real: 0, joke: 0 };
  let useReal = true;
  const nextTip = () => { const k = useReal ? 'real' : 'joke'; useReal = !useReal; const p = pools[k], v = p[idx[k]++ % p.length]; return k === 'real' ? `💡 ${v}` : `"${v}"`; };
  tipP.textContent = nextTip();
  timers.push(setInterval(() => {
    if (document.hidden) return;
    tipP.style.opacity = '0';
    setTimeout(() => { if (!dead) { tipP.textContent = nextTip(); tipP.style.opacity = '1'; } }, 300);
  }, 6000));

  // online count (Presence = GET /api/stats), polled every 10 s, paused when hidden
  async function refreshOnline() {
    if (dead || document.hidden) return;
    try {
      const ctrl = new AbortController(), tm = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(apiUrl('/api/stats'), { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(tm); const s = await res.json(); if (dead) return;
      const n = s.online | 0;
      onlineEl.className = 'bsm-online ' + (n > 0 ? 'ok' : '');
      onlineEl.textContent = n > 0 ? `● ${n === 1 ? '1 dev' : `${n} devs`} online now · AI coworkers on duty` : '● arena is open · AI coworkers waiting for you';
    } catch (_) {
      if (dead) return;
      onlineEl.className = 'bsm-online off'; onlineEl.textContent = '● multiplayer server offline (start: node server/index.js)';
    }
  }
  refreshOnline(); timers.push(setInterval(refreshOnline, 10000));

  // rejoin banner for an open team match
  (async () => {
    const saved = loadMatch(); if (!saved) return;
    const me = await fetchMe(); if (dead) return;
    const m = me?.match;
    if (!m || m.roomId !== saved.roomId) { if (me) clearMatch(); return; }
    const b = h('button', { class: 'bsm-rejoin', onclick: () => { AudioManager.uiClick?.(); go('team', { rejoin: true }); } },
      m.connected ? '⚔️ Your Team match is open in another tab. Tap to play it here' : '⚔️ Your Team match is still running. Tap to REJOIN');
    root.append(b);
  })();

  // language
  unsubs.push(onLangChange(() => { for (const [el, key] of i18n) el.textContent = t(key); }));

  // ---------------------------------------------------------------- actions
  const panel = (make) => { if (modalOpen() || starting) return null; return make(); };
  function setMute(m) { const e = document.getElementById('bsm-mute'); if (e) e.textContent = m ? '🔇' : '🔊'; }
  function toggleMute() { const m = AudioManager.toggleMute(); SaveManager.setMuted(m); setMute(m); toast(m ? '🔇 muted' : '🔊 sound on'); }
  function go(target, opts = {}) {
    if (starting || dead) return;
    if (modalOpen() && target !== 'campaign') return;
    starting = true; AudioManager.uiClick?.();
    fade.classList.add('on');
    setTimeout(() => {
      if (dead) return;
      try { navigate?.(target, opts); } catch (e) {
        console.error('[menu] navigate failed', e); starting = false; fade.classList.remove('on'); toast('Could not start. Try again.'); return;
      }
      stop();
    }, 300);
  }
  function playGame() {
    let i = SaveManager.getUnlockedIndex(); if (i >= TOTAL_LEVELS) i = 0;   // PLAY = next unplayed level (or 1-1 once beaten)
    go('campaign', { levelIndex: Math.max(0, Math.min(TOTAL_LEVELS - 1, i)) });
  }
  function practiceGo() {
    const saved = SaveManager.getTeamChamp();
    go('practice', { offline: true, sandbox: true, champ: isChampionId(saved) ? saved : 'pixel', name: SaveManager.getPlayerName() || 'Tester' });
  }
  function rename() { panel(() => openWelcome({ mode: 'rename', onClose: after, onDone: after })); }

  function setBackdrop(q) {
    if (q === 'off') { backdrop?.stop(); backdrop = null; return; }
    if (backdrop) backdrop.setQuality(q); else mountBackdrop(q);
  }
  async function mountBackdrop(q) {
    try {
      const { ensureImportMap } = await import('../vendor/importmap.js'); ensureImportMap();
      const m = await import('./backdrop.js'); if (dead) return;
      const qq = params.get('q') === 'med' ? 'med' : q;
      backdrop = m.createBackdrop(root, { quality: qq });
    } catch (e) { console.warn('[menu] 3D backdrop unavailable, using the plain gradient', e); }
  }
  const q0 = getMenu3d();
  if (q0 !== 'off' && params.get('backdrop') !== '0') mountBackdrop(q0);

  // keyboard
  const onKey = (e) => {
    if (dead || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
    if (modalOpen() || starting) return;
    const k = e.key.toLowerCase();
    if (k === 'enter' && !(tg && tg.tagName === 'BUTTON')) { e.preventDefault(); playGame(); }
    else if (k === 'm') toggleMute();
    else if (k === 'l') panel(() => openLevels({ onClose: after, onPlay: (i) => go('campaign', { levelIndex: i }) }));
    else if (k === 's') go('story');
  };
  window.addEventListener('keydown', onKey);

  function stop() {
    if (dead) return; dead = true;
    window.removeEventListener('keydown', onKey);
    timers.forEach(clearInterval); unsubs.forEach((u) => u());
    backdrop?.stop(); backdrop = null; root.remove(); fade.remove();
  }

  // first run: welcome card (veterans skip it)
  if (!SaveManager.getFlag('welcomeSeen')) {
    const c = SaveManager.getCareer();
    const veteran = SaveManager.getPlayerName() || c.sessions > 0 || c.teamGames > 0 || c.teamPractice > 0 || SaveManager.getUnlockedIndex() > 0;
    if (veteran) SaveManager.setFlag('welcomeSeen', true);
    else setTimeout(() => {
      if (dead || starting) return;
      openWelcome({ mode: 'welcome', onClose: after, onChoice: (choice) => { after(); if (choice === 'campaign') go('campaign', { levelIndex: 0 }); else if (choice === 'online') go('personal'); } });
    }, 350);
  }

  // deep links: ?room=<id> -> custom room join
  const room = params.get('room');
  if (room && /^[A-Za-z0-9_-]{1,32}$/.test(room)) setTimeout(() => go('custom', { joinCode: room, name: SaveManager.getPlayerName() || '' }), 0);

  return { stop, root, get backdrop() { return backdrop; } };
}

export default startMenu;

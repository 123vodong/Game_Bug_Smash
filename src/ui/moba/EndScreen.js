// src/ui/moba/EndScreen.js — Team Mode victory / defeat screen.
//
// Contract (.claude/context/tasks/TEAM_MODE_BREAKDOWN.md §3.4):
//   const end = new EndScreen(scene, { onPlayAgain, onMenu });
//   end.show({ winner, myTeam, rows, state?, localSid? })   // v4: state.scores fills rows missing from champions
//     winner, myTeam: 'blue' | 'red'   (unknown / '' → neutral "MATCH OVER")
//     rows: [{ sid, team, name, champ, level, kills, deaths, assists, cs, gold, items, isBot, isMe }]
// Career (Experience Pass 1, EP-09): the FIRST show() of an instance feeds Progress (career +
// daily missions + hat unlocks) once — online: teamGames (+ teamWins); offline practice
// (payload.practice): teamPractice only (+ daily teamGames / teamWins) — practice NEVER touches the
// W/L record; takedowns → teamTakedowns. A "YOUR SHIFT" strip shows ≤ 3 personal highlights, the
// record, completed missions and new hats; 📋 COPY RESULT copies a share line.
// payload extras: { practice, winReason ('' | 'core' | 'rollback'), firstBlood (sid), durationMs }.
// Buttons only (no keyboard shortcuts — ENTER is the chat key in matches); each
// callback fires at most once. Extras: end.isVisible, end.hide(), end.root,
// end.destroy() (auto on scene shutdown). Screen-pinned, depth 94, full-screen dim
// that swallows clicks.
import { CHAMPIONS } from '../../../shared/moba/champions.js';
import { portraitKey } from '../../entities/moba/looks.js';
import { ITEMS } from '../../../shared/moba/items.js';
import { TEAM_INFO, TEAM_SIZE, INVENTORY_SLOTS } from '../../../shared/moba/rules.js';
import { SaveManager } from '../../core/SaveManager.js';
import { AudioManager } from '../../core/AudioManager.js';
import { Progress } from '../../core/Progress.js';
import { HATS, hatProgress, isHatUnlocked } from '../../data/cosmetics.js';
import { fxAllowed } from '../../core/FxPrefs.js';
import {
  FONT_TITLE, FONT_MONO, FONT_UI, NEON, glow, pin, drawPanel, makePill, makeButton,
  fillRR, strokeRR, slotAt, fmtGold, laneRank, kdaRatio, clipName,
} from './uiKit.js';

const DEPTH = 94;
const TABLE = { x: 100, y: 168, w: 1080, h: 344 };
const RH = 24;                                   // table row height
const STRIP = { x: 100, y: 520, w: 1080, h: 86 }; // "YOUR SHIFT"
const ROLLBACK_WIN = [(l) => `🔙 ${l} rolled back. You ship unopposed.`, () => "They asked for last Friday's build. Granted."];
const ROLLBACK_LOSS = [(w) => `🔙 Rolled back. ${w} ships unopposed.`, () => 'Rollback approved. See you at the retro.'];
// column x (relative to TABLE.x)
const C = { mvp: 44, emoji: 98, name: 122, champ: 336, lv: 486, kda: 560, ratio: 644, cs: 712, gold: 782, items: 838 };
const VICTORY_LINES = [
  (l) => `Production is down — and it's ${l}'s.`,
  () => 'Shipped on a Friday. Nothing broke. Legendary.',
  (l) => `${l}'s server is now a very expensive paperweight.`,
  () => 'Merged to main, CI is green. Go home early.',
  () => 'Zero bugs in prod. (Theirs, on the other hand…)',
];
const DEFEAT_LINES = [
  () => 'Your Production Server crashed. Post-mortem at 9am.',
  () => 'Root cause: skill issue. Action items: 47.',
  () => "The on-call pager is ringing. It's for you.",
  () => 'It worked on your machine. It did not work in prod.',
  () => 'Rollback failed. Updating résumé…',
];
const swallow = (p, x, y, ev) => ev?.stopPropagation?.();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * v4 §3.2b: complete the table from the never-view-filtered `state.scores` (a champion hidden in a
 * bush is absent from `state.champions`). Rows the caller built win; scores only add missing sids.
 * Gold is not in scores → 0 for a row only known from scores.
 */
function mergeScoreRows(rows, state, localSid) {
  const scores = state?.scores;
  if (!scores || typeof scores.forEach !== 'function') return rows;
  const have = new Set(rows.map((r) => r && r.sid));
  const out = rows.slice();
  scores.forEach((sc, sid) => {
    if (!sc || have.has(sid)) return;
    out.push({
      sid, team: sc.team, name: sc.name, champ: sc.champ, level: sc.level | 0, kills: sc.kills | 0, deaths: sc.deaths | 0,
      assists: sc.assists | 0, cs: sc.cs | 0, gold: 0, items: sc.items ? Array.from(sc.items) : [], isBot: !!sc.isBot,
      isMe: sid === localSid,
    });
  });
  return out;
}

export class EndScreen {
  constructor(scene, { onPlayAgain, onMenu } = {}) {
    this.scene = scene;
    this.onPlayAgain = typeof onPlayAgain === 'function' ? onPlayAgain : null;
    this.onMenu = typeof onMenu === 'function' ? onMenu : null;
    this._visible = false;
    this._counted = false;
    this._fired = false;
    this._content = null;
    this._sub = null;
    const { width: W, height: H } = scene.scale;
    this.W = W; this.H = H;
    this.root = scene.add.container(0, 0).setDepth(DEPTH).setVisible(false);
    const dim = scene.add.rectangle(0, 0, W, H, 0x02040a, 0.84).setOrigin(0).setInteractive();
    dim.on('pointerdown', swallow);
    dim.on('pointerup', swallow);
    this.root.add(dim);
    pin(this.root);
    scene.events.once('shutdown', () => this.destroy());
  }

  get isVisible() { return this._visible; }

  show({ winner, myTeam, rows, state, localSid, practice = false, winReason = '', firstBlood = '', durationMs = 0 } = {}) {
    rows = mergeScoreRows(Array.isArray(rows) ? rows : [], state, localSid);
    if (!this.root.scene) return;
    const first = !this._visible && !this._content;
    const win = TEAM_INFO[winner] ? winner : '';
    const mine = TEAM_INFO[myTeam] ? myTeam : '';
    const outcome = !win || !mine ? 'neutral' : (win === mine ? 'win' : 'loss');
    const reason = winReason || String(state?.winReason || '');
    const me = rows.find((r) => r && (r.isMe || (localSid && r.sid === localSid))) || null;
    this._meta = { practice: !!practice, reason, firstBlood: firstBlood || '', durationMs: Number(durationMs) || 0, outcome, win, me };
    if (!this._counted && mine && win) {
      this._counted = true;
      this._gains = this._track(outcome, me, !!practice);
    }
    if (!this._sub) {
      const loser = TEAM_INFO[win === 'blue' ? 'red' : 'blue'];
      const winner_ = TEAM_INFO[win];
      if (reason === 'rollback' && winner_) {
        this._sub = outcome === 'win' ? pick(ROLLBACK_WIN)(loser.name) : outcome === 'loss' ? pick(ROLLBACK_LOSS)(winner_.name)
          : `🔙 ${loser.name} rolled back. ${winner_.name} ships unopposed.`;
      } else this._sub = outcome === 'win' ? pick(VICTORY_LINES)(loser.name)
        : outcome === 'loss' ? pick(DEFEAT_LINES)()
          : winner_ ? `${winner_.emoji} ${winner_.name} ships it. Production is down for ${loser.name}.`
            : 'Nobody shipped. Classic.';
    }
    this._visible = true;
    this.root.setVisible(true);
    this._build(outcome, win, rows);
    if (first) this._celebrate(outcome);
  }

  /** Progress once per match (contract §3.4 + coordinator's mapping). Returns { missions, hats }. */
  _track(outcome, me, practice) {
    const out = { missions: [], hats: [] };
    const merge = (r) => { if (r) { out.missions.push(...(r.missions || [])); out.hats.push(...(r.hats || [])); } };
    const won = outcome === 'win';
    const td = me ? (me.kills | 0) + (me.assists | 0) : 0;
    // Each step on its own: one failure never re-applies (or skips) another — no fallback writes,
    // so nothing can be counted twice (review fix 7).
    const step = (fn) => { try { merge(fn()); } catch (e) { console.warn('[EndScreen] Progress step failed:', e?.message); } };
    if (practice) {
      step(() => Progress.add('teamPractice', 1, { daily: 'teamGames' }));
      if (won) step(() => Progress.track('teamWins', 1));
    } else {
      step(() => Progress.add('teamGames', 1, { daily: true }));
      if (won) step(() => Progress.add('teamWins', 1, { daily: true }));
    }
    if (td > 0) step(() => Progress.add('teamTakedowns', td, { daily: true }));
    const uniq = (arr) => arr.filter((x, i) => x && arr.findIndex((y) => y && y.id === x.id) === i);
    out.missions = uniq(out.missions); out.hats = uniq(out.hats);
    return out;
  }

  /** <= 3 personal highlights: [icon, title, detail]. */
  _highlights(rows, me, mvp) {
    if (!me) return [];
    const H = [];
    const team = rows.filter((r) => r.team === me.team);
    const td = (r) => (r.kills | 0) + (r.assists | 0);
    if (this._meta.firstBlood && this._meta.firstBlood === me.sid) H.push(['🩸', 'FIRST BLOOD', 'you opened the incident']);
    if (mvp === me) H.push(['⭐', 'MATCH MVP', 'the whole floor saw it']);
    if (td(me) > 0) {
      if (td(me) >= Math.max(...rows.map(td))) H.push(['⚔', 'MOST TAKEDOWNS', `${td(me)} in the match`]);
      else if (td(me) >= Math.max(...team.map(td))) H.push(['⚔', 'MOST TAKEDOWNS ON TEAM', `${td(me)} kills + assists`]);
    }
    if ((me.cs | 0) > 0 && (me.cs | 0) >= Math.max(...team.map((r) => r.cs | 0))) H.push(['🐞', 'MOST CS ON TEAM', `${me.cs | 0} bugs last-hit`]);
    if (team.length > 1 && (me.deaths | 0) <= Math.min(...team.map((r) => r.deaths | 0))) {
      H.push(['🛡', (me.deaths | 0) === 0 ? 'DEATHLESS' : 'FEWEST DEATHS ON TEAM', (me.deaths | 0) === 0 ? 'zero incidents filed' : `only ${me.deaths | 0}`]);
    }
    const k = kdaRatio(me.kills, me.deaths, me.assists);
    if (k >= 3) H.push(['🎯', `KDA ${k.toFixed(1)}`, 'clean commits only']);
    if (!H.length) H.push(['🪑', 'SHOWED UP', "that's half the job"]);
    return H.slice(0, 3);
  }

  /** Right side of the strip: record / practice note, then missions done + hats unlocked + next hat. */
  _progressLines() {
    const L = [];
    const c = SaveManager.getCareer() || {};
    if (this._meta.practice) L.push({ t: `🤖 Practice · not on your record (${c.teamPractice | 0} played)`, c: '#9fb0c8' });
    else {
      const w = c.teamWins | 0, g = c.teamGames | 0;
      L.push({ t: `📈 Siege record  ${w}W – ${Math.max(0, g - w)}L`, c: '#cfe3f5' });
    }
    const gains = this._gains || { missions: [], hats: [] };
    for (const m of gains.missions) L.push({ t: `✅ Mission done: ${m.text}`, c: '#7ed957', pop: true });
    for (const h of gains.hats) L.push({ t: `🎉 New hat: ${h.emoji} ${h.name}`, c: '#ffd23f', pop: true });
    if (!gains.hats.length) {
      let best = null;
      for (const h of HATS) {
        if (h.mode !== 'team' || !h.unlock || isHatUnlocked(h, c)) continue;
        const pr = hatProgress(h, c);
        if (!best || pr.frac > best.frac) best = { h, ...pr };
      }
      if (best) L.push({ t: `next hat: ${best.h.emoji} ${best.cur}/${best.at} · ${best.h.unlock.label}`, c: '#8fa3bf' });
    }
    return L.slice(0, 4);
  }

  /** Share line for chat apps (Zalo / Messenger). */
  _resultText(rows) {
    const m = this._meta || {}, me = m.me;
    const kills = { blue: 0, red: 0 };
    for (const r of rows) if (kills[r.team] !== undefined) kills[r.team] += (r.kills | 0);
    const word = m.outcome === 'win' ? '🏆 VICTORY' : m.outcome === 'loss' ? '💀 DEFEAT' : '🏁 MATCH OVER';
    const champ = me ? CHAMPIONS[me.champ] : null;
    const mins = m.durationMs ? ` · ${Math.floor(m.durationMs / 60000)}:${String(Math.floor(m.durationMs / 1000) % 60).padStart(2, '0')}` : '';
    const mine = me ? ` · ${champ ? `${champ.emoji} ${champ.name}` : 'me'} ${me.kills | 0}/${me.deaths | 0}/${me.assists | 0} · ${me.cs | 0} CS` : '';
    const url = `${window.location.origin}${window.location.pathname}`;
    return `🐞 Bug Smash Office Siege: ${word}${m.reason === 'rollback' ? ' (rollback)' : ''}${m.practice ? ' (practice)' : ''}`
      + ` · ${TEAM_INFO.blue.emoji} ${kills.blue} ⚔ ${kills.red} ${TEAM_INFO.red.emoji}${mine}${mins} — ${url}`;
  }

  async _copy(rows, btn) {
    const text = this._resultText(rows);
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (_) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch (_) { ok = false; }
    }
    this._lastCopied = text;
    if (!this.root.scene) return;
    AudioManager.uiClick?.();
    btn?.setLabel?.(ok ? '✓ COPIED' : 'COPY FAILED');
    this.scene.time.delayedCall(1800, () => { if (this.root.scene) btn?.setLabel?.('📋 COPY RESULT'); });
  }

  hide() {
    this._visible = false;
    if (this.root.scene) this.root.setVisible(false);
  }

  destroy() {
    this._visible = false;
    if (this.root && this.root.scene) this.root.destroy();
  }

  // ───────────────────────── build ─────────────────────────
  _build(outcome, win, rows) {
    const s = this.scene, W = this.W;
    if (this._content) this._content.destroy();
    const C0 = s.add.container(0, 0);
    this._content = C0;
    this.root.add(C0);

    // ── title: 🏆 VICTORY / 💀 DEFEAT / 🏁 MATCH OVER ──
    const word = outcome === 'win' ? 'VICTORY' : outcome === 'loss' ? 'DEFEAT' : 'MATCH OVER';
    const icon = outcome === 'win' ? '🏆' : outcome === 'loss' ? '💀' : '🏁';
    const col = outcome === 'win' ? '#ffd23f' : outcome === 'loss' ? '#ff5e5e' : '#7ec8ff';
    const tc = s.add.container(W / 2, 64);
    const em = s.add.text(0, 0, icon, { fontSize: 56, padding: { y: 10 } }).setOrigin(0, 0.5);
    const wt = s.add.text(0, 0, word, {
      fontFamily: FONT_TITLE, fontSize: 64, color: col, stroke: '#000000', strokeThickness: 8,
    }).setOrigin(0, 0.5);
    const p = glow(wt, col, 18);
    const total = em.width + 16 + (wt.width - 2 * p);
    em.x = -total / 2;
    wt.x = em.x + em.width + 16 - p;
    tc.add([em, wt]);
    C0.add(tc);
    tc.setScale(0.4).setAlpha(0);
    s.tweens.add({ targets: tc, scale: 1, alpha: 1, duration: 420, ease: 'Back.easeOut' });

    C0.add(s.add.text(W / 2, 114, this._sub, {
      fontFamily: FONT_MONO, fontSize: 17, fontStyle: 'italic', color: '#ffffff', stroke: '#000000',
      strokeThickness: 4, align: 'center', padding: { y: 2 },
    }).setOrigin(0.5));

    // ── score line: 🚀 STARTUP 23 ⚔ 14 MEGACORP 🏢 ──
    const kills = { blue: 0, red: 0 };
    for (const r of rows) if (kills[r.team] !== undefined) kills[r.team] += (r.kills | 0);
    const blue = TEAM_INFO.blue, red = TEAM_INFO.red;
    const score = (x, str, css, ox) => s.add.text(x, 144, str, {
      fontFamily: FONT_TITLE, fontSize: 16, color: css, stroke: '#000000', strokeThickness: 4, padding: { y: 3 },
    }).setOrigin(ox, 0.5);
    C0.add([
      score(W / 2 - 64, `${win === 'blue' ? '🏆 ' : ''}${blue.emoji} ${blue.name.toUpperCase()}`, blue.css, 1),
      score(W / 2 - 30, String(kills.blue), '#ffffff', 0.5),
      s.add.text(W / 2, 144, '⚔', { fontSize: 18, padding: { y: 3 } }).setOrigin(0.5),
      score(W / 2 + 30, String(kills.red), '#ffffff', 0.5),
      score(W / 2 + 64, `${red.name.toUpperCase()} ${red.emoji}${win === 'red' ? ' 🏆' : ''}`, red.css, 0),
    ]);

    // ── stats table ──
    const T = TABLE;
    const g = s.add.graphics();
    drawPanel(g, T.x, T.y, T.w, T.h, { color: 0x7ec8ff, radius: 14, halo: 0.1, fill: 0x060a14, fillAlpha: 0.96 });
    C0.add(g);
    const lab = (x, txt, ox = 0.5) => s.add.text(T.x + x, T.y + 15, txt, {
      fontFamily: FONT_MONO, fontSize: 10, color: '#6f86a6',
    }).setOrigin(ox, 0.5);
    C0.add([lab(C.name, 'PLAYER', 0), lab(C.champ, 'CHAMPION', 0), lab(C.lv, 'LV'), lab(C.kda, 'K / D / A'),
      lab(C.ratio, 'KDA'), lab(C.cs, 'CS'), lab(C.gold, 'GOLD'), lab(C.items, 'ITEMS', 0)]);

    // MVP = best (K+A)/D, with kills, gold (damage proxy) and CS as tie-breakers.
    let mvp = null, best = -Infinity;
    for (const r of rows) {
      const sc = kdaRatio(r.kills, r.deaths, r.assists) * 10 + (r.kills | 0) * 2
        + (Number(r.gold) || 0) / 400 + (r.cs | 0) / 25;
      if (sc > best) { best = sc; mvp = r; }
    }
    const teams = win === 'red' ? ['red', 'blue'] : ['blue', 'red'];
    let y = T.y + 30;
    for (const team of teams) {
      const list = rows.filter((r) => r.team === team)
        .sort((a, b) => laneRank(a.champ) - laneRank(b.champ))
        .slice(0, TEAM_SIZE);
      this._teamHeader(C0, team, y, team === win, kills[team]);
      y += 26;
      for (let i = 0; i < TEAM_SIZE; i++) {
        if (list[i]) this._row(C0, list[i], y, list[i] === mvp);
        y += RH;
      }
      y += 4;
    }

    // ── EP-09: YOUR SHIFT strip ──
    this._buildStrip(C0, rows, mvp);

    // ── buttons ──
    const again = makeButton(s, {
      x: W / 2 - 250, y: 652, w: 230, h: 54, label: 'PLAY AGAIN', color: NEON.green, fontSize: 20, primary: true,
      onClick: () => this._fire(this.onPlayAgain),
    });
    const copy = makeButton(s, {
      x: W / 2, y: 652, w: 230, h: 54, label: '📋 COPY RESULT', color: NEON.purple, fontSize: 17,
      onClick: () => this._copy(rows, copy),
    });
    const menu = makeButton(s, {
      x: W / 2 + 250, y: 652, w: 200, h: 54, label: 'MENU', color: NEON.teal, fontSize: 20,
      onClick: () => this._fire(this.onMenu),
    });
    C0.add([again.root, copy.root, menu.root]);
    pin(C0);
  }

  _buildStrip(C0, rows, mvp) {
    const s = this.scene, S = STRIP, me = this._meta?.me;
    const g = s.add.graphics();
    drawPanel(g, S.x, S.y, S.w, S.h, { color: NEON.yellow, radius: 12, halo: 0.08, fill: 0x0b0d06, fillAlpha: 0.95 });
    C0.add(g);
    C0.add(s.add.text(S.x + 18, S.y + 14, 'YOUR SHIFT', { fontFamily: FONT_TITLE, fontSize: 11, color: '#ffd23f', padding: { y: 2 } }).setOrigin(0, 0.5));
    const hl = this._highlights(rows, me, mvp);
    hl.forEach(([icon, title, detail], i) => {
      const x = S.x + 18 + i * 232, y = S.y + 28;
      const cg = s.add.graphics();
      cg.fillStyle(0x1a1c10, 1); fillRR(cg, x, y, 222, 48, 9);
      cg.lineStyle(1.2, NEON.yellow, 0.5); strokeRR(cg, x, y, 222, 48, 9);
      const ic = s.add.text(x + 24, y + 24, icon, { fontSize: 22, padding: { y: 4 } }).setOrigin(0.5);
      const tt = s.add.text(x + 46, y + 15, title, { fontFamily: FONT_TITLE, fontSize: 12, color: '#ffffff', padding: { y: 2 } }).setOrigin(0, 0.5);
      const dt = s.add.text(x + 46, y + 33, detail, { fontFamily: FONT_MONO, fontSize: 11, color: '#c9c39a' }).setOrigin(0, 0.5);
      const parts = [cg, ic, tt, dt];
      C0.add(parts);
      if (!this._stripShown) {
        for (const o of parts) o.setAlpha(0);
        s.tweens.add({ targets: parts, alpha: 1, duration: 260, delay: 500 + i * 220 });
      }
    });
    const lines = this._progressLines();
    const rx = S.x + 18 + 3 * 232 + 6;
    lines.forEach((ln, i) => {
      const t = s.add.text(rx, S.y + 14 + i * 19, clipName(ln.t, 48), {
        fontFamily: FONT_MONO, fontSize: 12, color: ln.c, fontStyle: ln.pop ? 'bold' : '', padding: { y: 2 },
      }).setOrigin(0, 0.5);
      C0.add(t);
      if (ln.pop && !this._stripShown) {
        t.setAlpha(0).setScale(1.15);
        s.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 300, delay: 1200 + i * 350, ease: 'Back.easeOut',
          onStart: () => AudioManager.reward?.() });
      }
    });
    this._stripShown = true;
  }

  _teamHeader(C0, team, y, isWinner, kills) {
    const s = this.scene, T = TABLE, info = TEAM_INFO[team];
    const g = s.add.graphics();
    g.fillStyle(info.color, isWinner ? 0.2 : 0.1);
    fillRR(g, T.x + 14, y, T.w - 28, 24, 7);
    g.lineStyle(1.2, info.color, isWinner ? 0.85 : 0.4);
    strokeRR(g, T.x + 14, y, T.w - 28, 24, 7);
    C0.add([
      g,
      s.add.text(T.x + 26, y + 12, `${info.emoji} ${info.name.toUpperCase()}${isWinner ? '  · 🏆 SHIPPED IT' : ''}`, {
        fontFamily: FONT_TITLE, fontSize: 12, color: info.css, padding: { y: 3 },
      }).setOrigin(0, 0.5),
      s.add.text(T.x + T.w - 26, y + 12, `${kills} kills`, {
        fontFamily: FONT_MONO, fontSize: 11, color: '#dfe6f0',
      }).setOrigin(1, 0.5),
    ]);
  }

  _row(C0, r, y, isMvp) {
    const s = this.scene, T = TABLE;
    const info = CHAMPIONS[r.champ];
    const mid = y + (RH - 2) / 2;
    const g = s.add.graphics();
    if (r.isMe) {
      g.fillStyle(0x3a2f0a, 0.9);
      fillRR(g, T.x + 14, y, T.w - 28, RH - 2, 6);
    }
    if (isMvp) {
      g.lineStyle(1.5, NEON.yellow, 0.95);
      strokeRR(g, T.x + 14, y, T.w - 28, RH - 2, 6);
    }
    C0.add(g);
    if (isMvp) {
      const pl = makePill(s, 0, mid, '⭐ MVP', { color: NEON.yellow, fontSize: 9, fill: 0x2a2208, fillAlpha: 1 });
      pl.x = T.x + C.mvp - pl.pillW / 2;
      C0.add(pl);
    }
    const txt = (x, str, style, ox = 0.5) => s.add.text(T.x + x, mid, str, style).setOrigin(ox, 0.5);
    const mono = (size, color, bold) => ({ fontFamily: FONT_MONO, fontSize: size, color, fontStyle: bold ? 'bold' : '' });
    const nameStr = `${r.isBot ? '🤖 ' : ''}${clipName(r.name || '?', 14)}${r.isMe ? '  (you)' : ''}`;
    const pk = info ? portraitKey(s, r.champ) : null;
    C0.add([
      pk ? s.add.image(T.x + C.emoji, mid, pk).setDisplaySize(24, 24)
        : txt(C.emoji, info ? info.emoji : '❔', { fontSize: 18, padding: { y: 3 } }),
      txt(C.name, nameStr, {
        fontFamily: FONT_UI, fontSize: 14, fontStyle: 'bold', color: r.isMe ? '#ffd23f' : '#ffffff', padding: { y: 2 },
      }, 0),
      txt(C.champ, info ? `${info.name} · ${info.role}` : String(r.champ || ''), mono(12, '#8fa3bf'), 0),
      txt(C.lv, String(r.level | 0), { fontFamily: FONT_TITLE, fontSize: 14, color: '#ffffff' }),
      txt(C.kda, `${r.kills | 0} / ${r.deaths | 0} / ${r.assists | 0}`, mono(14, '#ffffff', true)),
      txt(C.ratio, kdaRatio(r.kills, r.deaths, r.assists).toFixed(1), mono(13, isMvp ? '#ffd23f' : '#cfe3f5', isMvp)),
      txt(C.cs, String(r.cs | 0), mono(13, '#cfe3f5')),
      txt(C.gold, fmtGold(r.gold), mono(13, '#ffd23f')),
    ]);
    for (let k = 0; k < INVENTORY_SLOTS; k++) {
      const it = ITEMS[slotAt(r.items, k)];
      if (it) C0.add(txt(C.items + k * 38 + 14, it.emoji, { fontSize: 18, padding: { y: 3 } }));
    }
  }

  _fire(cb) {
    if (this._fired) return;
    this._fired = true;
    try {
      if (cb) cb();
    } catch (e) {
      this._fired = false;            // let the player try again
      console.warn('[EndScreen] callback failed', e);
    }
  }

  // ───────────────────────── effects (bounded, self-destroying) ─────────────────────────
  _celebrate(outcome) {
    const s = this.scene;
    if (outcome === 'win') {
      AudioManager.victory?.();
      const colors = [NEON.yellow, NEON.green, NEON.cyan, NEON.pink, 0xffffff];
      for (let i = 0; i < 70; i++) {
        const x = Math.random() * this.W;
        const bit = s.add.rectangle(x, -10 - Math.random() * 120, 5 + Math.random() * 6, 8 + Math.random() * 8,
          colors[i % colors.length], 1).setScrollFactor(0).setAngle(Math.random() * 360);
        this.root.addAt(bit, 1);          // above the dim, below the table
        s.tweens.add({
          targets: bit, y: this.H + 30, x: x + (Math.random() - 0.5) * 160, angle: bit.angle + 360 + Math.random() * 360,
          duration: 1800 + Math.random() * 1600, delay: Math.random() * 600, ease: 'Sine.easeIn',
          onComplete: () => bit.destroy(),
        });
      }
    } else if (outcome === 'loss') {
      AudioManager.failure?.();
      const codes = ['500', '503', '502', 'ERR', '💥', '🔥', 'NaN', 'null'];
      for (let i = 0; i < 22; i++) {
        const x = Math.random() * this.W;
        const t = s.add.text(x, -20 - Math.random() * 200, codes[i % codes.length], {
          fontFamily: FONT_MONO, fontSize: 14 + Math.random() * 10, color: '#ff5e5e', padding: { y: 3 },
        }).setScrollFactor(0).setAlpha(0.55);
        this.root.addAt(t, 1);
        s.tweens.add({
          targets: t, y: this.H + 30, alpha: 0.1, duration: 2600 + Math.random() * 2000, delay: Math.random() * 900,
          ease: 'Sine.easeIn', onComplete: () => t.destroy(),
        });
      }
      if (fxAllowed('shake')) s.cameras.main.shake(260, 0.006);
    } else {
      AudioManager.reward?.();
    }
  }
}

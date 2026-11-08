// src/ui/moba/EndScreen.js — Team Mode victory / defeat screen.
//
// Contract (.claude/context/tasks/TEAM_MODE_BREAKDOWN.md §3.4):
//   const end = new EndScreen(scene, { onPlayAgain, onMenu });
//   end.show({ winner, myTeam, rows, state?, localSid? })   // v4: state.scores fills rows missing from champions
//     winner, myTeam: 'blue' | 'red'   (unknown / '' → neutral "MATCH OVER")
//     rows: [{ sid, team, name, champ, level, kills, deaths, assists, cs, gold, items, isBot, isMe }]
// Career: the FIRST show() of an instance bumps SaveManager career `teamGames`
// (+ `teamWins` on a win). One EndScreen per match → counted once even if the
// scene calls show() again to refresh the table.
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
import {
  FONT_TITLE, FONT_MONO, FONT_UI, NEON, glow, pin, drawPanel, makePill, makeButton,
  fillRR, strokeRR, slotAt, fmtGold, laneRank, kdaRatio, clipName,
} from './uiKit.js';

const DEPTH = 94;
const TABLE = { x: 100, y: 204, w: 1080, h: 388 };
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

  show({ winner, myTeam, rows, state, localSid } = {}) {
    rows = mergeScoreRows(Array.isArray(rows) ? rows : [], state, localSid);
    if (!this.root.scene) return;
    const first = !this._visible && !this._content;
    const win = TEAM_INFO[winner] ? winner : '';
    const mine = TEAM_INFO[myTeam] ? myTeam : '';
    const outcome = !win || !mine ? 'neutral' : (win === mine ? 'win' : 'loss');
    if (!this._counted && mine && win) {
      this._counted = true;
      SaveManager.addCareer('teamGames', 1);
      if (outcome === 'win') SaveManager.addCareer('teamWins', 1);
    }
    if (!this._sub) {
      const loser = TEAM_INFO[win === 'blue' ? 'red' : 'blue'];
      const winner_ = TEAM_INFO[win];
      this._sub = outcome === 'win' ? pick(VICTORY_LINES)(loser.name)
        : outcome === 'loss' ? pick(DEFEAT_LINES)()
          : winner_ ? `${winner_.emoji} ${winner_.name} ships it. Production is down for ${loser.name}.`
            : 'Nobody shipped. Classic.';
    }
    this._visible = true;
    this.root.setVisible(true);
    this._build(outcome, win, rows);
    if (first) this._celebrate(outcome);
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
    const tc = s.add.container(W / 2, 86);
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

    C0.add(s.add.text(W / 2, 146, this._sub, {
      fontFamily: FONT_MONO, fontSize: 17, fontStyle: 'italic', color: '#ffffff', stroke: '#000000',
      strokeThickness: 4, align: 'center', padding: { y: 2 },
    }).setOrigin(0.5));

    // ── score line: 🚀 STARTUP 23 ⚔ 14 MEGACORP 🏢 ──
    const kills = { blue: 0, red: 0 };
    for (const r of rows) if (kills[r.team] !== undefined) kills[r.team] += (r.kills | 0);
    const blue = TEAM_INFO.blue, red = TEAM_INFO.red;
    const score = (x, str, css, ox) => s.add.text(x, 180, str, {
      fontFamily: FONT_TITLE, fontSize: 16, color: css, stroke: '#000000', strokeThickness: 4, padding: { y: 3 },
    }).setOrigin(ox, 0.5);
    C0.add([
      score(W / 2 - 64, `${win === 'blue' ? '🏆 ' : ''}${blue.emoji} ${blue.name.toUpperCase()}`, blue.css, 1),
      score(W / 2 - 30, String(kills.blue), '#ffffff', 0.5),
      s.add.text(W / 2, 180, '⚔', { fontSize: 18, padding: { y: 3 } }).setOrigin(0.5),
      score(W / 2 + 30, String(kills.red), '#ffffff', 0.5),
      score(W / 2 + 64, `${red.name.toUpperCase()} ${red.emoji}${win === 'red' ? ' 🏆' : ''}`, red.css, 0),
    ]);

    // ── stats table ──
    const T = TABLE;
    const g = s.add.graphics();
    drawPanel(g, T.x, T.y, T.w, T.h, { color: 0x7ec8ff, radius: 14, halo: 0.1, fill: 0x060a14, fillAlpha: 0.96 });
    C0.add(g);
    const lab = (x, txt, ox = 0.5) => s.add.text(T.x + x, T.y + 18, txt, {
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
    let y = T.y + 36;
    for (const team of teams) {
      const list = rows.filter((r) => r.team === team)
        .sort((a, b) => laneRank(a.champ) - laneRank(b.champ))
        .slice(0, TEAM_SIZE);
      this._teamHeader(C0, team, y, team === win, kills[team]);
      y += 28;
      for (let i = 0; i < TEAM_SIZE; i++) {
        if (list[i]) this._row(C0, list[i], y, list[i] === mvp);
        y += 28;
      }
      y += 6;
    }

    // ── buttons ──
    const again = makeButton(s, {
      x: W / 2 - 130, y: 642, w: 230, h: 56, label: 'PLAY AGAIN', color: NEON.green, fontSize: 20, primary: true,
      onClick: () => this._fire(this.onPlayAgain),
    });
    const menu = makeButton(s, {
      x: W / 2 + 130, y: 642, w: 200, h: 56, label: 'MENU', color: NEON.teal, fontSize: 20,
      onClick: () => this._fire(this.onMenu),
    });
    C0.add([again.root, menu.root]);
    pin(C0);
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
    const mid = y + 13;
    const g = s.add.graphics();
    if (r.isMe) {
      g.fillStyle(0x3a2f0a, 0.9);
      fillRR(g, T.x + 14, y, T.w - 28, 26, 6);
    }
    if (isMvp) {
      g.lineStyle(1.5, NEON.yellow, 0.95);
      strokeRR(g, T.x + 14, y, T.w - 28, 26, 6);
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
      s.cameras.main.shake(260, 0.006);
    } else {
      AudioManager.reward?.();
    }
  }
}

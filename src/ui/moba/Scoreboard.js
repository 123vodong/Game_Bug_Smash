// src/ui/moba/Scoreboard.js — Team Mode scoreboard (shown while TAB is held).
//
// Contract (.claude/context/tasks/TEAM_MODE_BREAKDOWN.md §3.4):
//   const sb = new Scoreboard(scene);
//   sb.show(); sb.hide();
//   sb.update(state, localSid)   // state = Colyseus TeamState (v4: scores, else champions / structures
//                                // MapSchemas, blueKills / redKills). Cheap: it only keeps
//                                // the reference while hidden, and re-reads at most every
//                                // 200 ms while shown — safe to call every frame.
// Extras: sb.isVisible, sb.root, sb.destroy() (auto on scene shutdown).
// Two team columns (🚀 Startup | 🏢 MegaCorp) — rows ordered top → jungle → mid →
// bot → support; the local player's row is gold, bots get 🤖, the dead are dimmed.
// Not interactive (clicks pass through to the battlefield). Screen-pinned, depth 88.
import { CHAMPIONS } from '../../../shared/moba/champions.js';
import { SPELLS } from '../../../shared/moba/spells.js';
import { portraitKey } from '../../entities/moba/looks.js';
import { ITEMS } from '../../../shared/moba/items.js';
import { TEAM_INFO, TEAM_SIZE, INVENTORY_SLOTS } from '../../../shared/moba/rules.js';
import {
  FONT_TITLE, FONT_MONO, FONT_UI, pin, drawPanel, fillRR, strokeRR, slotAt, fmtGold, laneRank, clipName,
} from './uiKit.js';

const DEPTH = 88;
const PW = 1200, PH = 404;
const COL_W = 576, COL_GAP = 16;
const ROW_Y0 = 112, ROW_H = 50, ROW_STEP = 54;
const C = { emoji: 28, name: 56, lv: 214, kda: 274, cs: 342, gold: 396, items: 432 };   // column x
const REFRESH_MS = 200;

export class Scoreboard {
  constructor(scene) {
    this.scene = scene;
    this._visible = false;
    this._state = null;
    this._sid = '';
    this._lastAt = -1e9;
    const { width: W, height: H } = scene.scale;
    this.root = scene.add.container(Math.round(W / 2), Math.round(H / 2) - 14)
      .setDepth(DEPTH).setVisible(false);
    this._body = scene.add.container(-PW / 2, -PH / 2);
    this.root.add(this._body);
    this._buildFrame();
    this._cols = {
      blue: this._buildColumn('blue', 12),
      red: this._buildColumn('red', 12 + COL_W + COL_GAP),
    };
    pin(this.root);
    scene.events.once('shutdown', () => this.destroy());
  }

  get isVisible() { return this._visible; }

  show() {
    if (this._visible || !this.root.scene) return;
    this._visible = true;
    this.root.setVisible(true);
    this._lastAt = -1e9;
    this._render();           // with the last state we were given
  }

  hide() {
    if (!this._visible) return;
    this._visible = false;
    if (this.root.scene) this.root.setVisible(false);
  }

  update(state, localSid) {
    if (state) this._state = state;
    if (localSid !== undefined && localSid !== null) this._sid = String(localSid);
    if (!this._visible) return;
    const now = this.scene.time.now;
    if (now - this._lastAt < REFRESH_MS) return;
    this._render();
  }

  destroy() {
    this._visible = false;
    if (this.root && this.root.scene) this.root.destroy();
  }

  // ───────────────────────── build ─────────────────────────
  _buildFrame() {
    const s = this.scene, B = this._body;
    const g = s.add.graphics();
    drawPanel(g, 0, 0, PW, PH, { color: 0x7ec8ff, radius: 16, halo: 0.12, fill: 0x060a14, fillAlpha: 0.95 });
    const blue = TEAM_INFO.blue, red = TEAM_INFO.red;
    const mid = PW / 2;
    const teamTxt = (x, str, css, ox) => s.add.text(x, 32, str, {
      fontFamily: FONT_TITLE, fontSize: 20, color: css, stroke: '#000000', strokeThickness: 4, padding: { y: 3 },
    }).setOrigin(ox, 0.5);
    const killTxt = (x) => s.add.text(x, 32, '0', {
      fontFamily: FONT_TITLE, fontSize: 30, color: '#ffffff', stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5);
    this._killsBlue = killTxt(mid - 40);
    this._killsRed = killTxt(mid + 40);
    B.add([
      g,
      s.add.text(18, 32, 'SCOREBOARD', { fontFamily: FONT_TITLE, fontSize: 13, color: '#7ec8ff' }).setOrigin(0, 0.5),
      teamTxt(mid - 78, `${blue.emoji} ${blue.name.toUpperCase()}`, blue.css, 1),
      this._killsBlue,
      s.add.text(mid, 32, '⚔', { fontSize: 22, padding: { y: 3 } }).setOrigin(0.5),
      this._killsRed,
      teamTxt(mid + 78, `${red.name.toUpperCase()} ${red.emoji}`, red.css, 0),
      s.add.text(PW - 18, 32, 'hold TAB', { fontFamily: FONT_MONO, fontSize: 11, color: '#6f86a6' }).setOrigin(1, 0.5),
      s.add.text(PW / 2, PH - 14,
        '🤖 = AI coworker · 💀 = respawning · K / D / A = kills / deaths / assists · CS = bugs last-hit', {
          fontFamily: FONT_MONO, fontSize: 10, color: '#4f6380', padding: { y: 2 },
        }).setOrigin(0.5),
    ]);
  }

  _buildColumn(team, x0) {
    const s = this.scene, B = this._body, info = TEAM_INFO[team];
    const g = s.add.graphics();
    g.fillStyle(info.color, 0.14);
    fillRR(g, x0, 64, COL_W, 30, 8);
    g.lineStyle(1.5, info.color, 0.6);
    strokeRR(g, x0, 64, COL_W, 30, 8);
    const title = s.add.text(x0 + 12, 79, `${info.emoji} ${info.name.toUpperCase()}`, {
      fontFamily: FONT_TITLE, fontSize: 15, color: info.css, stroke: '#000000', strokeThickness: 3, padding: { y: 3 },
    }).setOrigin(0, 0.5);
    const you = s.add.text(title.x + title.width + 10, 79, '', {
      fontFamily: FONT_TITLE, fontSize: 10, color: '#ffd23f',
    }).setOrigin(0, 0.5);
    const meta = s.add.text(x0 + COL_W - 12, 79, '', {
      fontFamily: FONT_MONO, fontSize: 12, color: '#dfe6f0', padding: { y: 2 },
    }).setOrigin(1, 0.5);
    const lab = (x, txt, ox = 0.5) => s.add.text(x0 + x, 102, txt, {
      fontFamily: FONT_MONO, fontSize: 10, color: '#6f86a6',
    }).setOrigin(ox, 0.5);
    B.add([g, title, you, meta, lab(C.name, 'CHAMPION', 0), lab(C.lv, 'LV'), lab(C.kda, 'K / D / A'),
      lab(C.cs, 'CS'), lab(C.gold, 'GOLD'), lab(C.items, 'ITEMS', 0)]);
    const rows = [];
    for (let i = 0; i < TEAM_SIZE; i++) rows.push(this._buildRow(x0, ROW_Y0 + i * ROW_STEP, info));
    return { you, meta, rows };
  }

  _buildRow(x0, y, info) {
    const s = this.scene;
    const c = s.add.container(x0, y);
    const mid = ROW_H / 2;
    const bg = s.add.graphics();
    const portrait = s.add.circle(C.emoji, mid, 19, info.color, 0.18).setStrokeStyle(1.5, info.color, 0.8);
    const emoji = s.add.text(C.emoji, mid + 1, '', { fontSize: 22, padding: { y: 4 } }).setOrigin(0.5);
    const pimg = s.add.image(C.emoji, mid, '__DEFAULT').setDisplaySize(38, 38).setVisible(false);
    const dead = s.add.text(C.emoji + 15, mid + 13, '💀', { fontSize: 13, padding: { y: 2 } }).setOrigin(0.5);
    const name = s.add.text(C.name, 16, '', {
      fontFamily: FONT_UI, fontSize: 14, fontStyle: 'bold', color: '#ffffff', padding: { y: 2 },
    }).setOrigin(0, 0.5);
    const sub = s.add.text(C.name, 35, '', { fontFamily: FONT_MONO, fontSize: 11, color: '#8fa3bf' }).setOrigin(0, 0.5);
    const lv = s.add.text(C.lv, mid, '', { fontFamily: FONT_TITLE, fontSize: 16, color: '#ffffff' }).setOrigin(0.5);
    const kda = s.add.text(C.kda, mid, '', {
      fontFamily: FONT_MONO, fontSize: 15, fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);
    const cs = s.add.text(C.cs, mid, '', { fontFamily: FONT_MONO, fontSize: 14, color: '#cfe3f5' }).setOrigin(0.5);
    const gold = s.add.text(C.gold, mid, '', { fontFamily: FONT_MONO, fontSize: 14, color: '#ffd23f' }).setOrigin(0.5);
    const ig = s.add.graphics();
    ig.lineStyle(1, 0xffffff, 0.12);
    const items = [];
    for (let k = 0; k < INVENTORY_SLOTS; k++) {
      const ix = C.items + k * 24 + 11;
      strokeRR(ig, ix - 11, mid - 11, 22, 22, 4);
      items.push(s.add.text(ix, mid + 1, '', { fontSize: 15, padding: { y: 3 } }).setOrigin(0.5));
    }
    const empty = s.add.text(C.name, mid, '— open seat —', {
      fontFamily: FONT_MONO, fontSize: 12, color: '#4a5a72',
    }).setOrigin(0, 0.5);
    const cells = [portrait, emoji, name, sub, lv, kda, cs, gold, ig, ...items];
    c.add([bg, ...cells, pimg, dead, empty]);
    this._body.add(c);
    return { c, bg, emoji, pimg, pkey: null, dead, name, sub, lv, kda, cs, gold, items, cells, empty, look: '' };
  }

  // ───────────────────────── render ─────────────────────────
  _render() {
    if (!this.root.scene) return;
    this._lastAt = this.scene.time.now;
    const st = this._state;
    const teams = { blue: [], red: [] };
    const towers = { blue: 0, red: 0 };
    if (st) {
      // v4 §3.2b: rows come from the never-view-filtered `scores` (enemies hidden in bushes are
      // REMOVED from `champions`); fall back to champions (offline sim / older server).
      const scores = st.scores, champs = st.champions;
      if (scores && typeof scores.forEach === 'function' && (scores.size ?? 1) > 0) {
        const goldSeen = this._goldSeen || (this._goldSeen = new Map());
        scores.forEach((sc, key) => {
          if (!sc || !teams[sc.team]) return;
          const live = champs?.get?.(key);
          if (live && Number.isFinite(live.gold)) goldSeen.set(key, live.gold);   // gold is not in scores
          teams[sc.team].push({ key, ch: {
            team: sc.team, champ: sc.champ, name: sc.name, isBot: sc.isBot, level: sc.level, kills: sc.kills,
            deaths: sc.deaths, assists: sc.assists, cs: sc.cs, items: sc.items, dead: sc.dead,
            spellD: sc.spellD, spellF: sc.spellF, gold: goldSeen.has(key) ? goldSeen.get(key) : null,
          } });
        });
      } else {
        champs?.forEach?.((ch, key) => { if (ch && teams[ch.team]) teams[ch.team].push({ key, ch }); });
      }
      st.structures?.forEach?.((s) => {
        if (s && s.kind === 'tower' && s.alive && towers[s.team] !== undefined) towers[s.team]++;
      });
    }
    const order = (a, b) => (laneRank(a.ch.champ) - laneRank(b.ch.champ)) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    teams.blue.sort(order);
    teams.red.sort(order);
    const bk = st ? (st.blueKills | 0) : 0;
    const rk = st ? (st.redKills | 0) : 0;
    this._killsBlue.setText(String(bk));
    this._killsRed.setText(String(rk));
    this._fillColumn(this._cols.blue, teams.blue, bk, towers.blue);
    this._fillColumn(this._cols.red, teams.red, rk, towers.red);
  }

  _fillColumn(col, list, kills, towers) {
    col.you.setText(list.some((e) => e.key === this._sid) ? '★ YOUR TEAM' : '');
    col.meta.setText(`${kills} kills · 🏰 ${towers} towers`);
    col.rows.forEach((r, i) => {
      const e = list[i];
      this._paintRow(r, e ? e.ch : null, !!e && e.key === this._sid);
    });
  }

  _paintRow(r, ch, isMe) {
    const look = !ch ? 'empty' : `${isMe ? 1 : 0}${ch.dead ? 1 : 0}`;
    if (look !== r.look) {
      r.look = look;
      r.bg.clear();
      if (ch) {
        r.bg.fillStyle(isMe ? 0x3a2f0a : 0x0b1322, isMe ? 0.92 : 0.82);
        fillRR(r.bg, 0, 0, COL_W, ROW_H, 8);
        if (isMe) { r.bg.lineStyle(2, 0xffd23f, 0.9); strokeRR(r.bg, 0, 0, COL_W, ROW_H, 8); }
      } else {
        r.bg.lineStyle(1, 0xffffff, 0.06);
        strokeRR(r.bg, 0, 0, COL_W, ROW_H, 8);
      }
      for (const o of r.cells) o.setVisible(!!ch);
      if (!ch) r.pimg.setVisible(false);
      r.empty.setVisible(!ch);
      r.dead.setVisible(!!ch && !!ch.dead);
      r.c.setAlpha(ch && ch.dead ? 0.55 : 1);
    }
    if (!ch) return;
    const info = CHAMPIONS[ch.champ];
    r.emoji.setText(info ? info.emoji : '❔');
    const pk = info ? portraitKey(this.scene, ch.champ) : null;
    if (pk !== r.pkey) { r.pkey = pk; if (pk) r.pimg.setTexture(pk).setDisplaySize(38, 38); }
    r.pimg.setVisible(!!pk);
    r.emoji.setVisible(!pk);
    r.name.setText(`${ch.isBot ? '🤖 ' : ''}${clipName(ch.name || '?', 14)}`).setColor(isMe ? '#ffd23f' : '#ffffff');
    const sp = [ch.spellD, ch.spellF].map((id) => SPELLS[id]?.icon || '').join('');   // v3 summoner spells
    r.sub.setText((info ? `${info.name} · ${info.role}` : String(ch.champ || '')) + (sp ? `  ${sp}` : ''));
    r.lv.setText(String(ch.level | 0));
    r.kda.setText(`${ch.kills | 0} / ${ch.deaths | 0} / ${ch.assists | 0}`);
    r.cs.setText(String(ch.cs | 0));
    r.gold.setText(ch.gold == null ? '—' : fmtGold(ch.gold));   // null = never seen (hidden enemy)
    for (let k = 0; k < INVENTORY_SLOTS; k++) {
      const it = ITEMS[slotAt(ch.items, k)];
      r.items[k].setText(it ? it.emoji : '');
    }
  }
}

// src/story2/StoryPickScene.js — Story Mode 2.0 champion pick (2026-11-25: "free pick").
// Every champion is playable from the start: no unlocks, no roles to fill, no timer.
//
//   started with { champ? }   from the menu's STORY card (src/story2/launch.js openStoryPick),
//                             or from the FLOOR CLEARED panel ("CHANGE CHAMPION").
//
// Layout (1280×720): champion grid 9 × 2 (top left) · skills of the hovered / picked champion
// (bottom left) · tonight's floor + the 5-floor ladder, summoner spells, START (right column).
// Keys: ← → ↑ ↓ pick · ENTER / SPACE start · D / F change a summoner spell · ESC back to the menu.
// The pick (champion + spells) is remembered in SaveManager.story2.
import { CHAMPIONS, CHAMPION_IDS, ROLE_ORDER, isChampionId } from '../../shared/moba/champions.js';
import { SPELLS, validSpellPair } from '../../shared/moba/spells.js';
import { drawChampionPortrait } from '../entities/moba/looks.js';
import { showSkillTipPanel } from '../entities/moba/MobaHud.js';
import { SaveManager } from '../core/SaveManager.js';
import { AudioManager } from '../core/AudioManager.js';
import { tText } from '../core/I18n.js';
import {
  FONT_TITLE, FONT_MONO, NEON, hex, glow, drawPanel, makePill, makeButton, fillRR, strokeRR,
  fillCircleLP, strokeCircleLP, loadSpellPrefs, LANE_LABEL, SKILL_TYPE_LABEL, mechanicHints,
} from '../ui/moba/uiKit.js';
import { STORY_FLOORS, STORY_DEFAULT_CHAMP, STORY_SPELLS, nextStoryFloor, fmtRunTime } from './catalog.js';

const ORDER = [...CHAMPION_IDS].sort((a, b) => {
  const la = ROLE_ORDER.indexOf(CHAMPIONS[a].lane), lb = ROLE_ORDER.indexOf(CHAMPIONS[b].lane);
  return (la - lb) || (CHAMPION_IDS.indexOf(a) - CHAMPION_IDS.indexOf(b));
});
const COLS = 9;
const GRID = { x: 40, y: 104, w: 80, h: 104, gap: 7 };          // 9 × 80 + 8 × 7 = 776
const DET = { x: 40, y: 334, w: 776, h: 262 };
const HELP = { x: 40, y: 610, w: 776, h: 90 };
const COL_R = { x: 842, w: 398 };
const FLOOR = { y: 104, h: 318 };
const SPELL = { y: 438, h: 100 };
const UI_KEYS = ['LEFT', 'RIGHT', 'UP', 'DOWN', 'ENTER', 'SPACE', 'ESC', 'D', 'F'];
// one line per spell that fits a slot (the full 5v5 descriptions are longer)
const SPELL_SHORT = {
  flash: 'Teleport a short hop, even over a wall', heal: 'Heal you and a hurt ally, plus speed',
  ghost: '+35% move speed for 6 s', barrier: 'A big shield for 2.5 s',
};

export default class StoryPickScene extends Phaser.Scene {
  constructor() { super('StoryPickScene'); }

  init(data) { this._data = data || {}; }

  preload() {   // the costume portraits are drawn over the idle stickman
    if (!this.textures.exists('stick-idle')) this.load.svg('stick-idle', 'assets/characters/stickman/idle.svg', { width: 144, height: 144 });
  }

  create() {
    const { width: W, height: H } = this.scale;
    this.W = W; this.H = H;
    this._leaving = false;
    AudioManager.setMuted?.(SaveManager.isMuted());
    const save = SaveManager.getStory2();
    this._save = save;
    this._floor = nextStoryFloor(save.floors);
    const want = [this._data.champ, save.champ, SaveManager.getTeamChamp(), STORY_DEFAULT_CHAMP].find((id) => isChampionId(id));
    this._sel = want || ORDER[0];
    this._inspect = null;
    this._spells = this._initialSpells(save.spells);
    this._cards = [];

    this._drawBackdrop();
    this._drawHeader();
    this._buildGrid();
    this._detailG = this.add.graphics();
    this._dyn = null;
    this._detailFor = null;
    this._drawHelp();
    this._drawFloorCard();
    this._buildSpells();
    this._startBtn = makeButton(this, {
      x: COL_R.x + COL_R.w / 2, y: 650, w: COL_R.w, h: 92, radius: 16, primary: true,
      label: `▶ START FLOOR ${this._floor.n}`, sub: ' ', fontSize: 26, color: NEON.green,   // sub = "as <champion>" (_refresh)
      onClick: () => this._start(),
    });
    this._refresh();

    const kb = this.input.keyboard;
    kb.addCapture(UI_KEYS.map((k) => Phaser.Input.Keyboard.KeyCodes[k]));
    kb.on('keydown-LEFT', () => this._move(-1));
    kb.on('keydown-RIGHT', () => this._move(1));
    kb.on('keydown-UP', () => this._move(-COLS));
    kb.on('keydown-DOWN', () => this._move(COLS));
    kb.on('keydown-ENTER', () => this._start());
    kb.on('keydown-SPACE', () => this._start());
    kb.on('keydown-ESC', () => this._back());
    kb.on('keydown-D', () => this._cycleSpell(0));
    kb.on('keydown-F', () => this._cycleSpell(1));
    this.events.once('shutdown', () => { try { kb.removeCapture(UI_KEYS.map((k) => Phaser.Input.Keyboard.KeyCodes[k])); } catch (_) { /* ignore */ } });
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  // ───────────────────────── static parts ─────────────────────────
  _drawBackdrop() {
    const { W, H } = this;
    const g = this.add.graphics();
    g.fillStyle(0x070b16, 1); g.fillRect(0, 0, W, H);
    g.fillStyle(0x0d1530, 0.7); g.fillRect(0, 0, W, 92);
    g.lineStyle(1, 0x1b2a4a, 0.35);
    for (let x = 0; x <= W; x += 40) g.lineBetween(x, 92, x, H);
    for (let y = 92; y <= H; y += 40) g.lineBetween(0, y, W, y);
    g.lineStyle(2, NEON.yellow, 0.35); g.lineBetween(0, 92, W, 92);
    // night skyline strip with lit windows (the office tower you are about to climb)
    const sky = this.add.graphics();
    for (let i = 0; i < 26; i++) {
      const bw = 34 + ((i * 37) % 30), bh = 22 + ((i * 53) % 46), bx = 470 + i * 30;
      if (bx > W - 230) break;
      sky.fillStyle(0x111c36, 1); sky.fillRect(bx, 92 - bh, bw, bh);
      for (let k = 0; k < 4; k++) if ((i * 7 + k * 3) % 5 === 0) { sky.fillStyle(0xffd23f, 0.55); sky.fillRect(bx + 5 + k * 7, 92 - bh + 6, 3, 4); }
    }
  }

  _drawHeader() {
    const t = this.add.text(36, 34, '📖 STORY MODE', {
      fontFamily: FONT_TITLE, fontSize: 30, color: '#ffd23f', stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0, 0.5);
    t.x -= glow(t, NEON.yellow, 12);
    this.add.text(40, 70, 'NIGHT SHIFT · pick any champion, every one of them is playable', {
      fontFamily: FONT_MONO, fontSize: 14, color: '#b7c7da', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0, 0.5);
    makeButton(this, {
      x: this.W - 112, y: 46, w: 176, h: 46, radius: 12, label: '◀ MENU', fontSize: 16, color: NEON.blue,
      onClick: () => this._back(),
    });
  }

  _drawHelp() {
    const B = HELP;
    const g = this.add.graphics();
    drawPanel(g, B.x, B.y, B.w, B.h, { color: 0x7ec8ff, radius: 14, halo: 0.05 });
    this.add.text(B.x + 16, B.y + 16, 'HOW TO PLAY', { fontFamily: FONT_TITLE, fontSize: 11, color: '#7ec8ff' }).setOrigin(0, 0.5);
    this.add.text(B.x + 16, B.y + 32, [
      '🖱 right-click: move / attack · Q W E R: skills · D F: spells · T: talk to people',
      '☕ break room: heals, P opens the shop, B (recall) takes you back there',
      '🎯 Story rule: skills that only hit champions in 5v5 also hit bugs and nests here',
    ].join('\n'), { fontFamily: FONT_MONO, fontSize: 12, color: '#cfe3f5', lineSpacing: 3 });
  }

  _drawFloorCard() {
    const x = COL_R.x, w = COL_R.w, y = FLOOR.y, h = FLOOR.h;
    const f = this._floor;
    const g = this.add.graphics();
    drawPanel(g, x, y, w, h, { color: NEON.yellow, radius: 16, halo: 0.08 });
    this.add.text(x + 18, y + 20, "TONIGHT'S FLOOR", { fontFamily: FONT_TITLE, fontSize: 11, color: '#ffd23f' }).setOrigin(0, 0.5);
    const name = this.add.text(x + 18, y + 48, `FLOOR ${f.n} · ${f.name.toUpperCase()}`, {
      fontFamily: FONT_TITLE, fontSize: 22, color: '#ffffff', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0, 0.5);
    name.x -= glow(name, NEON.yellow, 8);
    this.add.text(x + 18, y + 74, `${f.sub} · ${f.clock}`, { fontFamily: FONT_MONO, fontSize: 13, color: '#ffcf8a' }).setOrigin(0, 0.5);
    this.add.text(x + 18, y + 90, f.pitch || '', {
      fontFamily: FONT_MONO, fontSize: 12, color: '#cfe3f5', lineSpacing: 2, wordWrap: { width: w - 36, useAdvancedWrap: true },
    });
    // the ladder: 5 floors, bottom to top = 8 PM to midnight
    const top = y + 140, rowH = 28;
    STORY_FLOORS.slice().reverse().forEach((fl, k) => {
      const ry = top + k * rowH;
      const rec = this._save.floors[fl.id];
      const cur = fl.id === f.id, done = rec?.clears > 0;
      const rg = this.add.graphics();
      rg.fillStyle(cur ? 0x2a2108 : 0x0b1322, cur ? 0.95 : 0.8); fillRR(rg, x + 14, ry, w - 28, rowH - 4, 7);
      if (cur) { rg.lineStyle(2, NEON.yellow, 1); strokeRR(rg, x + 14, ry, w - 28, rowH - 4, 7); }
      const col = !fl.ready ? '#55657d' : (cur ? '#ffd23f' : (done ? '#7ed957' : '#cfe3f5'));
      this.add.text(x + 26, ry + (rowH - 4) / 2, `${fl.n}  ${fl.name} · ${fl.sub}`, {
        fontFamily: FONT_TITLE, fontSize: 12, color: col,
      }).setOrigin(0, 0.5);
      const tag = !fl.ready ? `${fl.clock} · soon` : (done ? `✓ best ${fmtRunTime(rec.bestMs)}` : fl.clock);
      this.add.text(x + w - 26, ry + (rowH - 4) / 2, tag, { fontFamily: FONT_MONO, fontSize: 11, color: col }).setOrigin(1, 0.5);
    });
    const rec = this._save.floors[f.id];
    const line = rec?.clears > 0
      ? `✓ cleared ${rec.clears}× · best ${fmtRunTime(rec.bestMs)}${CHAMPIONS[rec.champ] ? ` with ${CHAMPIONS[rec.champ].name}` : ''}`
      : 'First visit · about 10–15 minutes';
    this.add.text(x + 18, y + h - 18, line, { fontFamily: FONT_MONO, fontSize: 11, color: rec?.clears > 0 ? '#7ed957' : '#8fa8c0' }).setOrigin(0, 0.5);
  }

  // ───────────────────────── champion grid ─────────────────────────
  _buildGrid() {
    const { w, h, gap } = GRID;
    ORDER.forEach((id, i) => {
      const champ = CHAMPIONS[id];
      const x = GRID.x + (i % COLS) * (w + gap) + w / 2;
      const y = GRID.y + Math.floor(i / COLS) * (h + gap) + h / 2;
      const c = this.add.container(x, y);
      const g = this.add.graphics();
      const portrait = drawChampionPortrait(this, id, 0, -14, 56);
      const name = this.add.text(0, 28, champ.name, {
        fontFamily: FONT_TITLE, fontSize: 13, color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5);
      if (name.width > w - 8) name.setScale((w - 8) / name.width);
      const lane = this.add.text(0, 43, (LANE_LABEL[champ.lane] || champ.lane).replace(' LANE', ''), {
        fontFamily: FONT_MONO, fontSize: 10, color: hex(champ.color),
      }).setOrigin(0.5);
      const badge = this.add.text(w / 2 - 5, -h / 2 + 5, 'YOU', {
        fontFamily: FONT_TITLE, fontSize: 9, color: '#06101c', backgroundColor: '#ffd23f', padding: { x: 4, y: 1 },
      }).setOrigin(1, 0).setVisible(false);
      const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0).setInteractive({ useHandCursor: true });
      c.add([g, portrait, name, lane, badge, hit]);
      const card = { id, champ, c, g, badge, hover: false };
      hit.on('pointerover', () => { card.hover = true; this._inspect = id; this._paintCard(card); this._renderDetail(); AudioManager.uiHover(); });
      hit.on('pointerout', () => { card.hover = false; if (this._inspect === id) this._inspect = null; this._paintCard(card); this._renderDetail(); });
      hit.on('pointerup', () => this._select(id));
      this._cards.push(card);
      c.setAlpha(0); c.y += 10;
      this.tweens.add({ targets: c, alpha: 1, y, duration: 180, delay: 60 + i * 16 });
    });
  }

  _paintCard(card) {
    const { g, champ } = card;
    const { w, h } = GRID;
    const lit = card.id === this._sel, col = champ.color;
    g.clear();
    g.fillStyle(0x000000, 0.45); fillRR(g, -w / 2 + 3, -h / 2 + 5, w, h, 12);
    g.fillStyle(lit ? 0x13203a : (card.hover ? 0x0f1726 : 0x0a0e18), 0.96); fillRR(g, -w / 2, -h / 2, w, h, 12);
    if (lit) { g.fillStyle(col, 0.18); fillRR(g, -w / 2, -h / 2, w, h, 12); }
    g.fillStyle(col, lit ? 0.32 : 0.12); fillCircleLP(g, 0, -14, 33);
    g.lineStyle(lit ? 3 : 1.5, lit ? NEON.yellow : col, lit ? 1 : (card.hover ? 0.9 : 0.38));
    strokeRR(g, -w / 2, -h / 2, w, h, 12);
    card.badge.setVisible(lit);
    card.c.setScale(card.hover || lit ? 1.04 : 1);
  }

  _select(id) {
    if (!isChampionId(id) || this._leaving) return;
    if (id !== this._sel) AudioManager.uiClick();
    this._sel = id;
    this._refresh();
  }

  _move(step) {
    const i = ORDER.indexOf(this._sel);
    const n = ORDER.length;
    let j = i + step;
    if (Math.abs(step) === 1) j = (j + n) % n;
    else if (j < 0 || j >= n) return;
    this._inspect = null;
    this._select(ORDER[j]);
  }

  _refresh() {
    for (const card of this._cards) this._paintCard(card);
    this._renderDetail();
    const c = CHAMPIONS[this._sel];
    this._startBtn?.setSub(c ? `as ${c.name.toUpperCase()}, ${c.title}` : '');
  }

  // ───────────────────────── detail (hovered, else picked) ─────────────────────────
  _renderDetail() {
    const id = this._inspect || this._sel;
    if (this._detailFor === id) return;
    this._hideSkillTip();
    this._detailFor = id;
    if (this._dyn) { this.tweens.killTweensOf(this._dyn); this._dyn.destroy(); this._dyn = null; }
    const D = DET, g = this._detailG, c = CHAMPIONS[id];
    g.clear();
    if (!c) return;
    const col = c.color;
    drawPanel(g, D.x, D.y, D.w, D.h, { color: col, radius: 14, halo: 0.08 });
    const dyn = this.add.container(0, 0);
    this._dyn = dyn;
    const add = (o) => { dyn.add(o); return o; };
    const px = D.x + 58, py = D.y + 58;
    const ring = add(this.add.graphics());
    ring.fillStyle(col, 0.14); fillCircleLP(ring, px, py, 46);
    ring.lineStyle(3, col, 1); strokeCircleLP(ring, px, py, 40);
    add(drawChampionPortrait(this, id, px, py, 78));
    const name = add(this.add.text(D.x + 112, D.y + 30, c.name.toUpperCase(), {
      fontFamily: FONT_TITLE, fontSize: 22, color: '#ffffff', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0, 0.5));
    name.x -= glow(name, hex(col), 10);
    add(this.add.text(D.x + 113, D.y + 56, c.title || '', {
      fontFamily: FONT_MONO, fontSize: 11, color: '#b7c7da', wordWrap: { width: 150, useAdvancedWrap: true },
    }).setOrigin(0, 0.5));
    let tx = D.x + 16;
    const tag = (text, color) => { const p = add(makePill(this, tx, D.y + 116, text, { color, fontSize: 8, padX: 5 })); tx += p.pillW + 5; };
    const dif = Math.max(1, Math.min(3, c.difficulty | 0));
    tag(c.role.toUpperCase(), col);
    tag((LANE_LABEL[c.lane] || c.lane).replace(' LANE', ''), 0x9fb3c8);
    tag(c.ranged ? 'RANGED' : 'MELEE', 0xcfe3f5);
    add(this.add.text(tx + 2, D.y + 116, '★'.repeat(dif) + '☆'.repeat(3 - dif), {
      fontFamily: 'Arial, sans-serif', fontSize: 11, color: '#ffd23f',
    }).setOrigin(0, 0.5));
    const b = c.base || {};
    add(this.add.text(D.x + 16, D.y + 136, `❤ ${b.hp}  ⚔ ${b.ad}  🛡 ${b.armor}  🎯 ${b.range}  👟 ${b.ms}`, {
      fontFamily: FONT_MONO, fontSize: 11, color: '#cfe3f5', padding: { y: 2 },
    }));
    add(this.add.text(D.x + 16, D.y + 160, [c.blurb, ...mechanicHints(c).slice(0, 1)].filter(Boolean).join('\n'), {
      fontFamily: FONT_MONO, fontSize: 11, color: '#9fb3c8', lineSpacing: 2,
      wordWrap: { width: 250, useAdvancedWrap: true }, fixedHeight: 92,
    }));
    const sx = D.x + 282, sw = D.w - 282 - 12;
    g.lineStyle(1, 0xffffff, 0.08); g.lineBetween(sx - 8, D.y + 14, sx - 8, D.y + D.h - 14);
    ['q', 'w', 'e', 'r'].forEach((slot, k) => {
      const s = c.skills?.[slot];
      if (!s) return;
      const y = D.y + 10 + k * 62;
      const sc = s.color ?? 0x7ec8ff;
      const rg = add(this.add.graphics());
      rg.fillStyle(0x0b1322, 0.94); fillRR(rg, sx, y, sw, 56, 9);
      rg.lineStyle(1.2, slot === 'r' ? NEON.yellow : sc, slot === 'r' ? 0.6 : 0.35); strokeRR(rg, sx, y, sw, 56, 9);
      rg.fillStyle(sc, 0.24); fillRR(rg, sx + 8, y + 8, 26, 26, 6);
      rg.lineStyle(2, sc, 1); strokeRR(rg, sx + 8, y + 8, 26, 26, 6);
      add(this.add.text(sx + 21, y + 21, slot.toUpperCase(), {
        fontFamily: FONT_TITLE, fontSize: 13, color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5));
      add(this.add.text(sx + 21, y + 45, `${s.cd}s`, { fontFamily: FONT_MONO, fontSize: 9, color: '#c3cfe0' }).setOrigin(0.5));
      add(this.add.text(sx + 44, y + 13, `${s.icon || '✨'} ${s.name}`, {
        fontFamily: FONT_TITLE, fontSize: 12, color: '#ffffff', padding: { y: 2 },
      }).setOrigin(0, 0.5));
      const meta = `${SKILL_TYPE_LABEL[s.type] || String(s.type || '').toUpperCase()} · 💧${s.mana}${slot === 'r' ? ' · ULT' : ''}`;
      add(this.add.text(sx + sw - 8, y + 13, meta, { fontFamily: FONT_MONO, fontSize: 9, color: hex(sc), padding: { y: 2 } }).setOrigin(1, 0.5));
      add(this.add.text(sx + 44, y + 24, tText(`skill.${c.id}.${slot}`, s.desc || ''), {
        fontFamily: FONT_MONO, fontSize: 11, color: '#cfe3f5', wordWrap: { width: sw - 54, useAdvancedWrap: true }, fixedHeight: 30,
      }));
      const paintRow = (lit) => {
        rg.clear();
        rg.fillStyle(lit ? 0x13223c : 0x0b1322, 0.96); fillRR(rg, sx, y, sw, 56, 9);
        rg.lineStyle(lit ? 2 : 1.2, lit ? 0xffffff : (slot === 'r' ? NEON.yellow : sc), lit ? 0.9 : (slot === 'r' ? 0.6 : 0.35));
        strokeRR(rg, sx, y, sw, 56, 9);
        rg.fillStyle(sc, lit ? 0.36 : 0.24); fillRR(rg, sx + 8, y + 8, 26, 26, 6);
        rg.lineStyle(2, sc, 1); strokeRR(rg, sx + 8, y + 8, 26, 26, 6);
      };
      const rowHit = add(this.add.rectangle(sx + sw / 2, y + 28, sw, 56, 0xffffff, 0).setInteractive({ useHandCursor: true }));
      rowHit.on('pointerover', () => {
        paintRow(true);
        this._showSkillTip(c, slot, sx + sw / 2, y - 6);
        AudioManager.uiHover?.();
      });
      rowHit.on('pointerout', () => {
        paintRow(false);
        this._hideSkillTip();
      });
    });
    dyn.setAlpha(0);
    this.tweens.add({ targets: dyn, alpha: 1, duration: 120 });
  }

  _showSkillTip(c, slot, x, y) {
    this._hideSkillTip();
    this._skillTip = showSkillTipPanel(this, c, slot, { x, y, W: this.W, H: this.H, depth: 95 });
  }
  _hideSkillTip() { this._skillTip?.destroy(); this._skillTip = null; }

  // ───────────────────────── summoner spells ─────────────────────────
  _initialSpells(saved) {
    const ok = (p) => Array.isArray(p) && validSpellPair(p[0], p[1]) && STORY_SPELLS.includes(p[0]) && STORY_SPELLS.includes(p[1]);
    if (ok(saved)) return saved.slice(0, 2);
    const team = loadSpellPrefs(validSpellPair, ['flash', 'heal']);
    return ok(team) ? team : ['flash', 'heal'];
  }

  _buildSpells() {
    const x = COL_R.x, w = COL_R.w, y = SPELL.y, h = SPELL.h;
    const g = this.add.graphics();
    drawPanel(g, x, y, w, h, { color: 0x7ec8ff, radius: 14, halo: 0.05 });
    this.add.text(x + 16, y + 16, 'SUMMONER SPELLS', { fontFamily: FONT_TITLE, fontSize: 11, color: '#7ec8ff' }).setOrigin(0, 0.5);
    this.add.text(x + w - 16, y + 16, 'click or D / F to change', { fontFamily: FONT_MONO, fontSize: 10, color: '#6f86a6' }).setOrigin(1, 0.5);
    this._spellSlots = [0, 1].map((i) => {
      const sw = (w - 44) / 2, sx = x + 16 + i * (sw + 12), sy = y + 34, sh = 54;
      const sg = this.add.graphics();
      const icon = this.add.text(sx + 28, sy + sh / 2, '', { fontSize: 24, padding: { y: 4 } }).setOrigin(0.5);
      const key = this.add.text(sx + sw - 8, sy + 8, i ? 'F' : 'D', { fontFamily: FONT_TITLE, fontSize: 11, color: '#ffd23f' }).setOrigin(1, 0);
      const name = this.add.text(sx + 52, sy + 18, '', { fontFamily: FONT_TITLE, fontSize: 13, color: '#ffffff' }).setOrigin(0, 0.5);
      const desc = this.add.text(sx + 52, sy + 36, '', { fontFamily: FONT_MONO, fontSize: 9, color: '#9fb3c8', wordWrap: { width: sw - 60, useAdvancedWrap: true }, fixedHeight: 22 }).setOrigin(0, 0.5);
      const hit = this.add.rectangle(sx + sw / 2, sy + sh / 2, sw, sh, 0xffffff, 0).setInteractive({ useHandCursor: true });
      const slot = { i, sx, sy, sw, sh, sg, icon, key, name, desc, hover: false };
      hit.on('pointerover', () => { slot.hover = true; this._paintSpells(); AudioManager.uiHover(); });
      hit.on('pointerout', () => { slot.hover = false; this._paintSpells(); });
      hit.on('pointerup', () => this._cycleSpell(i));
      return slot;
    });
    this._paintSpells();
  }

  _paintSpells() {
    for (const s of this._spellSlots || []) {
      const sp = SPELLS[this._spells[s.i]];
      const col = sp?.color ?? 0x7ec8ff;
      s.sg.clear();
      s.sg.fillStyle(s.hover ? 0x13203a : 0x0b1322, 0.96); fillRR(s.sg, s.sx, s.sy, s.sw, s.sh, 10);
      s.sg.lineStyle(s.hover ? 2.5 : 1.5, col, s.hover ? 1 : 0.6); strokeRR(s.sg, s.sx, s.sy, s.sw, s.sh, 10);
      s.icon.setText(sp?.icon || '?');
      s.name.setText(sp?.name || '');
      const spId = this._spells[s.i];
      s.desc.setText(tText(`spell.${spId}`, SPELL_SHORT[spId] || sp?.desc || ''));
    }
  }

  _cycleSpell(i) {
    if (this._leaving) return;
    const other = this._spells[1 - i];
    const list = STORY_SPELLS.filter((id) => id !== other);
    const k = list.indexOf(this._spells[i]);
    this._spells[i] = list[(k + 1) % list.length];
    AudioManager.uiClick();
    this._paintSpells();
  }

  // ───────────────────────── leave ─────────────────────────
  _start() {
    if (this._leaving || !isChampionId(this._sel)) return;
    this._leaving = true;
    this._hideSkillTip();
    const champ = this._sel, spells = this._spells.slice(0, 2);
    SaveManager.setStory2Pick(champ, spells);
    AudioManager.reward?.();
    this.cameras.main.flash(120, 255, 210, 63);
    const data = { champ, spells, floor: this._floor.id, name: SaveManager.getPlayerName() || 'Intern', story: true };
    this._go('StoryWorldScene', data);
  }

  _back() {
    if (this._leaving) return;
    this._leaving = true;
    this._hideSkillTip();
    AudioManager.uiClick();
    this._go('MenuScene');
  }

  /** Fade, but never wait on the camera for more than 700 ms of real time (slow devices). */
  _go(key, data) {
    let done = false;
    const go = () => { if (done) return; done = true; if (this.sys?.isActive()) this.scene.start(key, data); };
    this.cameras.main.once('camerafadeoutcomplete', go);
    this.cameras.main.fadeOut(260, 0, 0, 0);
    setTimeout(go, 700);
  }
}

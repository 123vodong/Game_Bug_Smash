// src/story2/StoryWorldScene.js — Story Mode 2.0 (prototype, M1): TeamModeScene on a story floor.
//
// Everything a 5v5 player does works unchanged (right-click move / attack, Q W E R, D F, B recall to
// the break room, P shop there, C info, Y camera) because this IS TeamModeScene, with its three
// world hooks overridden:
//   _makeWorld → the floor's walls / bushes / break room (src/entities/moba/world.js makeWorld)
//   _makeMap   → FloorMap (rooms, furniture, doors, stairs)
//   _startWorld → StorySim (OfflineSim + doors, nests, keycards, NPCs who join, objectives)
// On top: a dialogue box (Rubber Duck + champions), the objective tracker in the HUD top bar,
// pickups, "💬 TALK" prompts (T or click) and a floor-cleared panel. Registered at runtime by
// src/story2/launch.js, so none of this loads for 5v5.
import TeamModeScene from '../scenes/TeamModeScene.js';
import { CHAMPIONS } from '../../shared/moba/champions.js';
import { AudioManager } from '../core/AudioManager.js';
import { SaveManager } from '../core/SaveManager.js';
import { makeWorld } from '../entities/moba/world.js';
import { drawChampionPortrait } from '../entities/moba/looks.js';
import { depthAt } from '../entities/moba/mobaGfx.js';
import { FloorMap } from './FloorMap.js';
import { StorySim } from './StorySim.js';
import { ensureStoryTextures } from './bugs.js';
import F1 from './floors/f1.js';

export const FLOORS = { f1: F1 };
const UI_DEPTH = 57;
const TYPE_MS = 22, HOLD_MS = 2300;
const PICKUP_ICON = { coffee: '☕', gold: '💰', keycard: '🔑', note: '📝' };
const PICKUP_GLOW = { coffee: 0xc8864a, gold: 0xffd23f, keycard: 0x39c2ff, note: 0xffffff };
const SPEAKER = { duck: { icon: '🦆', name: 'RUBBER DUCK' }, note: { icon: '📝', name: 'NOTE' } };

export default class StoryWorldScene extends TeamModeScene {
  constructor() { super('StoryWorldScene'); }

  // ───────────────────────── world hooks ─────────────────────────
  _makeWorld(d) {
    const f = FLOORS[d?.floor] || F1;
    this._floorDef = f;
    return makeWorld({
      id: f.id, w: f.w, h: f.h, bushes: f.bushes, fountain: { blue: f.breakRoom },
      walls: f.walls.map((w, i) => ({ ...w, id: w.id || `${f.id}_w${i}` })),
    });
  }

  _makeMap() {
    ensureStoryTextures(this);
    return new FloorMap(this, this._floorDef, this.world);
  }

  _startWorld() {
    const f = this._floorDef;
    this._sim = new StorySim({
      floor: f, world: this.world, champ: this.myChamp, name: this.playerName, spells: this.mySpells,
      hat: SaveManager.getHat?.() || '',
      emit: (type, m) => { if (!this._shuttingDown) this._onMsg(type, m ?? {}); },
    });
    this.localId = this._sim.localId;
    this._sim.receive('hello');
    this.hud.setStatus(`📖 STORY MODE · ${f.clock}`, '#ffd23f');
    this._coach = null; this._shopAssist = false; this._shopAssistAt = 0;   // no 5v5 lane tips here
    this._buildStoryUi();
    return true;
  }

  // ───────────────────────── messages ─────────────────────────
  _onMsg(type, m) {
    if (type !== 'story') { super._onMsg(type, m); return; }
    switch (m.k) {
      case 'say': this._queueSay(m.who, m.line, m.ttl); break;
      case 'door':
        this.map.setDoor?.(m.id, m.state);
        if (m.state === 'open') AudioManager.skillPickup?.('buff'); else AudioManager.skillExpire?.();
        break;
      case 'join': AudioManager.reward?.(); break;   // the sim's announce banner says who joined
      case 'pickup':
        if (m.kind === 'gold') AudioManager.coin?.(); else AudioManager.skillPickup?.(m.kind === 'keycard' ? 'buff' : 'heal');
        break;
      case 'objective': this._objective = { text: m.text, optional: m.optional }; this._flashTracker(); break;
      case 'cleared': this._clearedStats = m; break;
      default: break;
    }
  }

  _onEnded() {
    if (this._ended) return;
    this._ended = true;
    this.shop?.close?.(); this.info?.close?.(); this.scoreboard?.hide?.(); this._sbOpen = false;
    this.hud.closeModal();
    this.hud.banner({ title: '🪜 FLOOR CLEARED', sub: this._floorDef.name, color: '#ffd23f', big: true });
    AudioManager.victory?.();
    this.time.delayedCall(2600, () => { if (!this._shuttingDown) this._showClearedPanel(); });
  }

  // ───────────────────────── story UI ─────────────────────────
  _buildStoryUi() {
    const W = this.scale.width;
    this._sayQ = []; this._sayCur = null; this._objective = { text: '', optional: '' };
    this._pickupViews = new Map(); this._npcMarks = new Map(); this._talkTarget = null; this._clearedStats = null;
    // dialogue box (screen-pinned)
    const c = this.add.container(W / 2, 540).setScrollFactor(0).setDepth(UI_DEPTH + 1).setVisible(false);
    const bg = this.add.rectangle(0, 0, 760, 112, 0x070b16, 1).setStrokeStyle(3, 0xffd23f, 0.9);
    const emoji = this.add.text(-326, 0, '', { fontSize: 54 }).setOrigin(0.5);
    const name = this.add.text(-268, -40, '', { fontFamily: 'Arial Black, sans-serif', fontSize: 15, color: '#ffd23f', stroke: '#000', strokeThickness: 3 });
    const text = this.add.text(-268, -16, '', {
      fontFamily: 'Consolas, monospace', fontSize: 16, color: '#eef3ff', lineSpacing: 3, wordWrap: { width: 610, useAdvancedWrap: true },
    });
    const hint = this.add.text(366, 46, 'click / T ▸', { fontFamily: 'Consolas, monospace', fontSize: 11, color: '#7f8db0' }).setOrigin(1, 1);
    const hit = this.add.rectangle(0, 0, 760, 112, 0xffffff, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (p, x, y, ev) => { ev?.stopPropagation?.(); this._skipSay(); });
    c.add([bg, emoji, name, text, hint, hit]);
    this._dlg = { c, emoji, name, text, portrait: null };
    // talk prompt (screen-pinned button)
    const tp = this.add.container(W / 2, 452).setScrollFactor(0).setDepth(UI_DEPTH).setVisible(false);
    const tbg = this.add.rectangle(0, 0, 300, 44, 0x10301c, 0.95).setStrokeStyle(2, 0x7ed957, 1);
    const tt = this.add.text(0, 0, '', { fontFamily: 'Arial Black, sans-serif', fontSize: 16, color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    const thit = this.add.rectangle(0, 0, 300, 44, 0xffffff, 0).setInteractive({ useHandCursor: true });
    thit.on('pointerdown', (p, x, y, ev) => { ev?.stopPropagation?.(); this._talk(); });
    tp.add([tbg, tt, thit]);
    this._talkUi = { c: tp, text: tt };
    this.input.keyboard?.on('keydown-T', this._onKeyT, this);
    this.events.once('shutdown', () => this.input.keyboard?.off('keydown-T', this._onKeyT, this));
  }

  /** T: talk when a TALK prompt is up (even while the Duck is still talking), else advance the dialogue. */
  _onKeyT() {
    if (this._talkTarget && this._talkUi.c.visible) this._talk();
    else if (this._sayCur) this._skipSay();
  }

  _talk() {
    if (!this._talkTarget || this._ended) return;
    this._send('talk', { id: this._talkTarget });
    this._talkUi.c.setVisible(false);
    AudioManager.uiClick?.();
  }

  /** Lines play in order; a champion's lines (a conversation you started) cut in front of the
   *  narration, and the interrupted narration line replays after them. */
  _queueSay(who, line, ttl = 0) {
    if (!line) return;
    const item = { who: String(who || ''), line: String(line), urgent: !!CHAMPIONS[who], until: ttl > 0 ? this.time.now + ttl : 0 };
    if (item.urgent && this._sayCur && !this._sayCur.urgent) {
      const cur = this._sayCur;
      this._sayQ.unshift({ who: cur.who, line: cur.line, urgent: false });
      this._sayQ.unshift(item);
      this._sayCur = null;
      this._nextSay();
      return;
    }
    if (item.urgent) {
      let i = 0;
      while (i < this._sayQ.length && this._sayQ[i].urgent) i++;
      this._sayQ.splice(i, 0, item);
    } else this._sayQ.push(item);
    if (!this._sayCur) this._nextSay();
  }

  _nextSay() {
    const d = this._dlg;
    let n = this._sayQ.shift();
    while (n && n.until && this.time.now > n.until) n = this._sayQ.shift();   // stale room lines are skipped
    if (d.portrait) { d.portrait.destroy(); d.portrait = null; }
    if (!n) { this._sayCur = null; d.c.setVisible(false); return; }
    const champ = CHAMPIONS[n.who] ? n.who : null;
    if (champ) {
      try { d.portrait = drawChampionPortrait(this, champ, -326, 0, 80); d.c.addAt(d.portrait, 1); } catch (_) { d.portrait = null; }
      d.emoji.setText(d.portrait ? '' : CHAMPIONS[champ].emoji);
      d.name.setText(`${CHAMPIONS[champ].name.toUpperCase()} · ${CHAMPIONS[champ].title}`);
    } else {
      const sp = SPEAKER[n.who] || { icon: '💬', name: '' };
      d.emoji.setText(sp.icon); d.name.setText(sp.name);
    }
    d.text.setText('');
    d.c.setVisible(true);
    this._sayCur = { ...n, at: this.time.now, shown: -1, doneAt: 0 };
    if (n.who === 'duck') AudioManager.uiHover?.();
  }

  _skipSay() {
    const c = this._sayCur;
    if (!c) return;
    if (c.shown < c.line.length) c.at = -1e9;    // finish typing first
    else this._nextSay();
  }

  _tickSay(now) {
    const c = this._sayCur;
    if (!c) return;
    const n = Math.min(c.line.length, Math.floor((now - c.at) / TYPE_MS));
    if (n !== c.shown) { c.shown = n; this._dlg.text.setText(c.line.slice(0, n)); }
    if (n >= c.line.length && !c.doneAt) c.doneAt = now;
    if (c.doneAt && now - c.doneAt > HOLD_MS) this._nextSay();
  }

  _flashTracker() {
    const t = this.hud?.epicT;
    if (!t) return;
    this.tweens.killTweensOf(t);
    this.tweens.add({ targets: t, scale: { from: 1.25, to: 1 }, duration: 380, ease: 'Back.easeOut' });
  }

  update(time, delta) {
    super.update(time, delta);
    if (this._shuttingDown || !this._sim?.story) return;
    const now = this.time.now, sim = this._sim, s = sim.story, me = this._me();
    this._tickSay(now);
    // HUD top bar: floor clock · bugs smashed · keys · objective (+ optional)
    const h = this.hud;
    const mins = s.startedAt ? Math.floor((Date.now() - s.startedAt) / 60000) : 0;
    const base = (this._floorDef.clock || '8:00 PM').match(/^(\d+):(\d+)\s*(AM|PM)$/i);
    const clk = base ? `${base[1]}:${String((Number(base[2]) + mins) % 60).padStart(2, '0')} ${base[3].toUpperCase()}` : this._floorDef.clock;
    if (h.clock && h.clock.text !== clk) h.clock.setText(clk);
    const left = `🐞 ${s.smashed}`, right = s.keys.size ? `${[...s.keys].map(() => '🔑').join('')}` : '🔒';
    if (h.blueK && h.blueK.text !== left) h.blueK.setText(left);
    if (h.redK && h.redK.text !== right) h.redK.setText(right);
    const obj = this._objective?.text || '', opt = this._objective?.optional || '';
    if (h.epicT && h.epicT.text !== obj) h.epicT.setText(obj).setFontSize(13).setColor('#ffe9a6');
    if (h.buffT && h.buffT.text !== opt) h.buffT.setText(opt).setColor('#9fe39f').setFontSize(12);
    // pickups (world sprites)
    for (const p of s.pickups) {
      let v = this._pickupViews.get(p.id);
      if (!p.taken && !v) {
        const glow = this.add.circle(p.x, p.y, 34, PICKUP_GLOW[p.kind] ?? 0xffffff, 0.22).setDepth(depthAt(p.y) - 0.1);
        const icon = this.add.text(p.x, p.y - 18, PICKUP_ICON[p.kind] || '❔', { fontSize: p.kind === 'keycard' ? 46 : 38 }).setOrigin(0.5).setDepth(depthAt(p.y));
        this.tweens.add({ targets: icon, y: p.y - 30, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: glow, scale: { from: 0.85, to: 1.15 }, duration: 700, yoyo: true, repeat: -1 });
        v = { glow, icon }; this._pickupViews.set(p.id, v);
      } else if (p.taken && v && !v.gone) {
        v.gone = true;
        this.tweens.killTweensOf([v.icon, v.glow]);
        this.tweens.add({ targets: [v.icon, v.glow], y: '-=60', alpha: 0, scale: 1.6, duration: 380, onComplete: () => { v.icon.destroy(); v.glow.destroy(); } });
      }
    }
    // NPC "💬" markers + the talk prompt
    let talk = null, talkD = 330;
    sim.state.champions.forEach((c, id) => {
      let mk = this._npcMarks.get(id);
      const v = this.views.champs.get(id);
      if (c._npc && v) {
        if (!mk) {
          mk = this.add.text(v.x, v.y - 150, '💬', { fontSize: 40, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(depthAt(v.y) + 0.5);
          this.tweens.add({ targets: mk, scale: { from: 0.9, to: 1.15 }, duration: 600, yoyo: true, repeat: -1 });
          this._npcMarks.set(id, mk);
        }
        mk.setPosition(v.x, v.y - 150).setVisible(!c._talking);
        if (me && !me.dead && !c._talking) { const d = Math.hypot(me.x - c.x, me.y - c.y); if (d < talkD) { talkD = d; talk = c; } }
      } else if (mk) { mk.destroy(); this._npcMarks.delete(id); }
    });
    this._talkTarget = talk ? talk.id : null;
    const showTalk = !!talk && !this._ended;
    if (this._talkUi.c.visible !== showTalk) this._talkUi.c.setVisible(showTalk);
    if (showTalk) {
      const t = `💬 TALK TO ${talk.name.toUpperCase()}  [T]`;
      if (this._talkUi.text.text !== t) this._talkUi.text.setText(t);
    }
  }

  _showClearedPanel() {
    const W = this.scale.width, H = this.scale.height, st = this._clearedStats || {}, s = this._sim?.story || {};
    const c = this.add.container(W / 2, H / 2).setScrollFactor(0).setDepth(UI_DEPTH + 5);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.55).setInteractive();
    const bg = this.add.rectangle(0, 0, 560, 330, 0x070b16, 0.97).setStrokeStyle(4, 0xffd23f, 1);
    const title = this.add.text(0, -122, '🏆 FLOOR CLEARED', { fontFamily: 'Arial Black, sans-serif', fontSize: 34, color: '#ffd23f', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5);
    const sub = this.add.text(0, -80, `${this._floorDef.name} · ${this._floorDef.clock}`, { fontFamily: 'Arial Black, sans-serif', fontSize: 16, color: '#c9d6ee' }).setOrigin(0.5);
    const secs = Math.round((st.ms || 0) / 1000);
    const lines = [
      `🐞 Bugs smashed: ${st.smashed ?? s.smashed ?? 0}`,
      `⏱ Time: ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`,
      `🤝 Coworkers in your party: ${st.allies ?? s.allies?.length ?? 0}`,
      'Next: 1F · Open Office (coming soon)',
    ];
    const body = this.add.text(0, -20, lines.join('\n'), { fontFamily: 'Consolas, monospace', fontSize: 17, color: '#eef3ff', align: 'center', lineSpacing: 8 }).setOrigin(0.5, 0.3);
    const btn = (x, label, col, fn) => {
      const r = this.add.rectangle(x, 118, 210, 50, 0x0b1322, 1).setStrokeStyle(3, col, 1).setInteractive({ useHandCursor: true });
      const t = this.add.text(x, 118, label, { fontFamily: 'Arial Black, sans-serif', fontSize: 17, color: '#ffffff' }).setOrigin(0.5);
      r.on('pointerover', () => r.setFillStyle(0x17243b, 1)); r.on('pointerout', () => r.setFillStyle(0x0b1322, 1));
      r.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); AudioManager.uiClick?.(); fn(); });
      return [r, t];
    };
    c.add([dim, bg, title, sub, body,
      ...btn(-120, '▶ PLAY AGAIN', 0x7ed957, () => { const d = this._data; this._cleanup(); this.scene.start('StoryWorldScene', d); }),
      ...btn(120, '🏠 MENU', 0x39c2ff, () => this._goMenu())]);
    c.setScale(0.9).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
    this._clearedPanel = c;
  }
}

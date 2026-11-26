// MobaHud — the screen-pinned Team Mode HUD (drawn by TeamModeScene's HUD camera):
//   • bottom-center champion panel: portrait + level/XP ring, HP / mana bars,
//     Q W E R (icon, key, mana cost, cooldown sweep + seconds, R locked < Lv6),
//     6 item slots, gold, K/D/A + CS, recall + shop buttons, stat line
//   • top-center: 🚀 kills · timer · kills 🏢, epic timers, active team buffs
//   • minimap (top-left; click/tap to move), kill feed (top-right),
//     center announcements, toasts, chat log, recall bar
//   • overlays: death (respawn countdown), lobby roster (+ START NOW),
//     leave confirm, connection problems
//   • touch: virtual joystick, attack + skill buttons, recall / shop / scores / chat
// Pure presentation + input callbacks — TeamModeScene owns the game logic.
// v3: summoner spell slots D / F (icon, key, cooldown sweep from cdD / cdF), an ℹ
// info button (InfoPanel), touch D / F buttons, and the waiting overlay shows the
// select / loading phases (deep-link joins) instead of the old lobby roster only.
// v2: skill tooltips list the mechanics (zone, fan, knockback / wall-stun, pet,
// CC); the portrait comes from looks.js drawChampionPortrait (emoji fallback);
// pets are left off the minimap.
// Experience Pass 1 (EXPERIENCE_PASS_BREAKDOWN.md): toasts are QUEUED (≤ 2 on screen, laid out by
// their real height — no early-match overlap), the death screen fades its lines in one by one,
// modalSet() updates an open modal (reconnect countdown), a 🏳 ROLLBACK button + team vote panel
// (EP-08), a coaching tip card under the minimap (EP-10) and a pulsing "🛒 Buy <item> (P)" nudge
// (EP-21). The left column (under the minimap) never overlaps the skill buttons.
import { CHAMPIONS } from '../../../shared/moba/champions.js';
import { ITEMS } from '../../../shared/moba/items.js';
import {
  TEAM_INFO, TEAM_SIZE, XP_TABLE, MAX_LEVEL, ULT_UNLOCK_LEVEL, RECALL_MS, EPICS,
} from '../../../shared/moba/rules.js';
import { MAP_W, MAP_H } from '../../../shared/moba/map.js';
import { SPELLS, spellCooldownMs } from '../../../shared/moba/spells.js';
import { t, tText, onLangChange } from '../../core/I18n.js';
import { FONT, MONO, ME_COLOR, LOOKS, teamColor, teamCss, css, fmtTime, toArr } from './mobaGfx.js';

const sec = (ms) => `${+(Math.max(0, ms || 0) / 1000).toFixed(1)}s`;
/** "60 (+15/lv) +70% AP" for an amount spec. */
function amountText(a) {
  if (!a) return '';
  const parts = [`${a.base || 0}${a.perLevel ? ` (+${a.perLevel}/lv)` : ''}`];
  for (const [k, lbl] of [['ad', 'AD'], ['ap', 'AP'], ['hp', 'max HP']]) if (a[k]) parts.push(`+${Math.round(a[k] * 100)}% ${lbl}`);
  return parts.join(' ');
}
/** Mechanics lines for a skill tooltip (v2 fields included). */
export function skillMechanics(sk, def) {
  const L = [];
  const petName = def?.pet?.name || 'your pet';
  if (sk.dmg) L.push(`⚔ ${amountText(sk.dmg)} dmg${sk.type === 'zone' ? ' per tick' : ''}`);
  if (sk.heal) L.push(`💚 heal ${amountText(sk.heal)}${sk.type === 'zone' ? ' per tick to allies inside' : ''}`);
  if (sk.shield) L.push(`🛡 shield ${amountText(sk.shield)}`);
  if (sk.type === 'zone') L.push(`🟦 Zone lasts ${sec(sk.duration)} · ticks every ${sec(sk.tickMs)}`);
  if ((sk.count | 0) > 1) L.push(`📱 Fan of ${sk.count} across ${sk.spread || 0}° · each enemy hit once`);
  if (sk.pierce) L.push('➡ pierces every enemy in the line');
  if (sk.champOnly) L.push('🎯 flies past minions');
  if (sk.knockback) L.push(`💨 Knockback ${sk.knockback.dist}px${sk.wallStun ? ` · into a WALL → stun ${sec(sk.wallStun.ms)}` : ''}`);
  if (sk.at === 'pet') L.push(`🤖 Centered on ${petName}`);
  if (sk.buff?.petPct) L.push(`🤖 ${petName}: +${Math.round(sk.buff.petPct * 100)}% dmg & attack speed`);
  if (sk.stun) L.push(`💫 Stun ${sec(sk.stun.ms)}`);
  if (sk.root) L.push(`🌿 Root ${sec(sk.root.ms)}`);
  if (sk.slow) L.push(`🐌 Slow ${Math.round(sk.slow.pct * 100)}% for ${sec(sk.slow.ms)}`);
  if (sk.execute) L.push(`☠ +${Math.round(sk.execute.missingHpPct * 100)}% of missing HP`);
  if (sk.delay) L.push(`⏳ lands after ${sec(sk.delay)}`);
  if (sk.duration && sk.type !== 'zone') L.push(`⏱ lasts ${sec(sk.duration)}`);
  if (sk.type === 'dash') L.push('🧱 stops at walls');
  if (sk.type === 'blink') L.push('🧱 lands beside walls');
  return L;
}

const SLOTS = ['q', 'w', 'e', 'r'];
const SPELL_SLOTS = ['d', 'f'];
const PANEL_W = 816, PANEL_H = 114;
const SP = 116;                 // x shift of everything right of the skills (room for D / F)
const FEED_MAX = 6, FEED_TTL = 10000;
const CHAT_MAX = 7, CHAT_TTL = 14000;

export class MobaHud {
  constructor(scene, opts) {
    this.s = scene;
    this.o = opts;               // callbacks: onSkill(slot) onSkillHover(slot|null) onRecall onShop onStartNow
                                 //            onMinimap(wx, wy) onScoreboard(show) onChat onAttack onStick(dir|null)
                                 //            onLeave onStay onMenu onOffline
    this.touch = !!opts.touch;
    const { width: W, height: H } = scene.scale;
    this.W = W; this.H = H;
    this.px = this.touch ? 606 : W / 2;      // panel center x (touch: clear of the joystick + skill arc)
    this.pl = this.px - PANEL_W / 2;          // panel left
    this.pt = H - PANEL_H;                    // panel top
    this._cache = {};
    this._feed = [];
    this._chat = [];
    this._toasts = [];
    this._toastQ = [];
    this._bannerQ = []; this._bannerCur = null;
    this.cdTotal = { q: 1, w: 1, e: 1, r: 1, d: 1, f: 1 };
    this._cdPrev = { q: 0, w: 0, e: 0, r: 0, d: 0, f: 0 };
    this._buildPanel();
    this._buildTop();
    this._buildMinimap(opts.map);
    this._buildMisc();
    if (this.touch) this._buildTouch();
  }

  // ───────────────────────── helpers ─────────────────────────
  _t(x, y, str, style, ox = 0.5, oy = 0.5) {
    return this.s.add.text(x, y, str, { fontFamily: FONT, color: '#ffffff', ...style })
      .setOrigin(ox, oy).setScrollFactor(0);
  }
  _r(x, y, w, h, color, a = 1) { return this.s.add.rectangle(x, y, w, h, color, a).setScrollFactor(0); }
  _set(key, obj, str) { if (this._cache[key] !== str) { this._cache[key] = str; obj.setText(str); } }
  /** A rounded pill button. Returns the container; `fn` fires on press. */
  _button(x, y, w, h, label, color, fn, depth = 52, size = 14) {
    const s = this.s;
    const c = s.add.container(x, y).setScrollFactor(0).setDepth(depth);
    // Rectangle shapes cache their triangulation (Graphics re-tessellates every frame).
    const bg = s.add.rectangle(0, 0, w, h, 0x111a28, 0.95).setStrokeStyle(2, color, 0.8);
    const t = s.add.text(0, 0, label, { fontFamily: FONT, fontSize: size, color: css(color), stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x1d2a40, 0.98).setStrokeStyle(2, color, 1));
    bg.on('pointerout', () => bg.setFillStyle(0x111a28, 0.95).setStrokeStyle(2, color, 0.8));
    bg.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); fn(); });
    c.add([bg, t]);
    c._label = t;
    return c;
  }

  // ───────────────────────── bottom panel ─────────────────────────
  _buildPanel() {
    const s = this.s;
    const L = -PANEL_W / 2, T = -PANEL_H;
    const root = s.add.container(this.px, this.H).setScrollFactor(0).setDepth(46);
    this.panelRoot = root;
    let savedScale = 0.75;
    try {
      const raw = window.localStorage.getItem('bugsmash.hud.scale');
      const v = raw != null && raw !== '' ? Number(raw) : NaN;
      if (Number.isFinite(v)) savedScale = Math.max(0.7, Math.min(1.15, v));
    } catch (_) { /* default compact legible 0.75 */ }
    this._hudScale = savedScale;
    const addR = (x, y, w, h, color, a = 1) => {
      const r = s.add.rectangle(x, y, w, h, color, a);
      root.add(r);
      return r;
    };
    const addT = (x, y, str, style, ox = 0.5, oy = 0.5) => {
      const t = s.add.text(x, y, str, { fontFamily: FONT, color: '#ffffff', ...style }).setOrigin(ox, oy);
      root.add(t);
      return t;
    };
    const mkPanelBtn = (x, y, w, h, label, color, fn, size = 12) => {
      const c = s.add.container(x, y);
      const bg = s.add.rectangle(0, 0, w, h, 0x111a28, 0.95).setStrokeStyle(2, color, 0.8);
      const t = s.add.text(0, 0, label, { fontFamily: FONT, fontSize: size, color: css(color), stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
      if (this.touch) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); fn(); });
      }
      c.add([bg, t]);
      c._label = t;
      root.add(c);
      return c;
    };

    // Panel background — non-interactive on desktop so world right-clicks pass through.
    const panelBg = addR(0, -PANEL_H / 2 + 4, PANEL_W, PANEL_H + 8, 0x0a0f18, 0.92).setStrokeStyle(2, 0x2c3a55, 1);
    if (this.touch) panelBg.setInteractive();
    addR(0, T + 1, PANEL_W - 28, 2, 0x39c2ff, 0.35);

    // Portrait + XP ring + level.
    const pcx = L + 52, pcy = T + 52;
    this.portraitRing = s.add.circle(pcx, pcy, 40, 0x141b28, 1).setStrokeStyle(3, ME_COLOR, 1);
    this.xpG = s.add.graphics();
    this.portrait = s.add.text(pcx, pcy + 2, '❔', { fontFamily: FONT, fontSize: 40 }).setOrigin(0.5);
    this.lvBadge = s.add.circle(pcx, T + 98, 14, 0x0a0d14, 1).setStrokeStyle(2, ME_COLOR, 1);
    this.lvText = s.add.text(pcx, T + 98, '1', { fontFamily: FONT, fontSize: 13, color: '#ffd23f', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    root.add([this.portraitRing, this.xpG, this.portrait, this.lvBadge, this.lvText]);
    this._xpPos = { x: pcx, y: pcy };

    // Skills (non-interactive on desktop — cast via Q/W/E/R keys only).
    this.slots = {};
    SLOTS.forEach((slot, i) => {
      const x = L + 147 + i * 66, y = T + 36;
      const c = s.add.container(x, y);
      const frame = s.add.rectangle(0, 0, 58, 58, 0x131b2a, 1).setStrokeStyle(2, 0x3a4a66, 1);
      const icon = s.add.text(0, -1, '·', { fontSize: 28 }).setOrigin(0.5);
      const noMana = s.add.rectangle(0, 0, 56, 56, 0x1d4fb5, 0.4).setVisible(false);
      const dim = s.add.rectangle(0, 0, 56, 56, 0x000000, 0.55).setVisible(false);
      const pie = s.add.graphics();
      const cd = s.add.text(0, 0, '', { fontFamily: FONT, fontSize: 20, color: '#ffffff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
      const lock = s.add.text(0, 2, '', { fontFamily: FONT, fontSize: 12, color: '#c9d3e6', stroke: '#000', strokeThickness: 3, align: 'center' }).setOrigin(0.5);
      const key = s.add.text(-26, -27, slot.toUpperCase(), {
        fontFamily: FONT, fontSize: 11, color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 3, y: 0 },
      }).setOrigin(0, 0);
      const mana = s.add.text(26, 27, '', { fontFamily: FONT, fontSize: 11, color: '#9cd6ff', stroke: '#000', strokeThickness: 3 }).setOrigin(1, 1);
      const flash = s.add.rectangle(0, 0, 58, 58, 0xffffff, 0).setStrokeStyle(3, 0xffffff, 0);
      const pips = s.add.text(-26, 27, '', { fontFamily: MONO, fontSize: 10, color: '#ffd23f', stroke: '#000', strokeThickness: 2 }).setOrigin(0, 1);
      // Gold '+' upgrade badge above the skill slot (generous 44x32 hit-area for reliable clicks/taps)
      const upBg = s.add.rectangle(0, -39, 34, 18, 0x3b2c06, 0.96).setStrokeStyle(2, 0xffd23f, 1).setVisible(false);
      const upTxt = s.add.text(0, -39, '+', { fontFamily: FONT, fontSize: 14, color: '#ffd23f' }).setOrigin(0.5).setVisible(false);
      upBg.setInteractive(new Phaser.Geom.Rectangle(-5, -7, 44, 32), Phaser.Geom.Rectangle.Contains);
      if (upBg.input) upBg.input.cursor = 'pointer';
      upBg.on('pointerdown', (p, lx, ly, ev) => {
        if (p.rightButtonDown?.()) return;
        ev?.stopPropagation?.();
        this.o.onUpgrade?.(slot);
      });
      if (this.touch) {
        frame.setInteractive({ useHandCursor: true });
        frame.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); this.o.onSkill?.(slot, true); });
      }
      c.add([frame, icon, noMana, dim, pie, cd, lock, key, mana, pips, flash, upBg, upTxt]);
      root.add(c);
      this.slots[slot] = { c, frame, icon, noMana, dim, pie, cd, lock, mana, pips, flash, upBg, upTxt, x, y };
    });

    // HP / mana bars.
    const bx = L + 114, bw = 270 + SP - 10;
    this._bar = { x: bx, w: bw };
    addR(bx + bw / 2, T + 81, bw + 4, 17, 0x000000, 0.9).setStrokeStyle(1, 0x7ed957, 0.4);
    this.hpFill = addR(bx, T + 81, bw, 13, 0x5fbf3a, 1).setOrigin(0, 0.5);
    this.shFill = addR(bx, T + 81, 0, 13, 0xffffff, 0.92).setOrigin(0, 0.5);
    this.hpText = addT(bx + bw / 2, T + 81, '', { fontSize: 11, stroke: '#000', strokeThickness: 3 });
    addR(bx + bw / 2, T + 99, bw + 4, 13, 0x000000, 0.9).setStrokeStyle(1, 0x39c2ff, 0.4);
    this.mpFill = addR(bx, T + 99, bw, 9, 0x2f86e8, 1).setOrigin(0, 0.5);
    this.mpText = addT(bx + bw / 2, T + 99, '', { fontSize: 10, stroke: '#000', strokeThickness: 3 });

    // Items (3×2) + stat line.
    this.items = [];
    for (let i = 0; i < 6; i++) {
      const x = L + SP + 425 + (i % 3) * 43, y = T + 26 + Math.floor(i / 3) * 43;
      const fr = addR(x, y, 38, 38, 0x0f1622, 1).setStrokeStyle(1, 0x2c3a55, 1);
      const t = addT(x, y + 1, '', { fontSize: 22 });
      this.items.push({ fr, t, id: '' });
    }
    this.stats = addT(L + SP + 404, T + 103, '', { fontFamily: MONO, fontSize: 11, color: '#aebbd2' }, 0, 0.5);

    // Gold, K/D/A, indicators (non-interactive on desktop — use B / P / C keys).
    const rx = L + SP + 620;
    this.gold = addT(rx, T + 20, '🪙 0', { fontSize: 19, color: '#ffd23f', stroke: '#000', strokeThickness: 4 });
    this.kda = addT(rx, T + 45, '', { fontFamily: MONO, fontSize: 12, color: '#cfd8e8' });
    this.baseBtn = mkPanelBtn(rx - 50, T + 80, 46, 34, this.touch ? t('hud.base') : 'B', 0x39c2ff, () => this.o.onRecall?.(), 12);
    this.shopBtn = mkPanelBtn(rx, T + 80, 46, 34, this.touch ? t('hud.shop') : 'P', 0xffd23f, () => this.o.onShop?.(), 12);
    this.infoBtn = mkPanelBtn(rx + 50, T + 80, 46, 34, this.touch ? t('hud.info') : 'C', 0x7ed957, () => this.o.onInfo?.(), 12);
    if (this.touch) {
      this._unsubLang = onLangChange(() => {
        this.baseBtn?._label?.setText(t('hud.base'));
        this.shopBtn?._label?.setText(t('hud.shop'));
        this.infoBtn?._label?.setText(t('hud.info'));
      });
      s.events.once('shutdown', () => { this._unsubLang?.(); this._unsubLang = null; });
    }

    // Summoner spells D / F (non-interactive on desktop — use D / F keys).
    this.spellSlots = {};
    SPELL_SLOTS.forEach((slot, i) => {
      const x = L + 147 + 4 * 66 + 2 + i * 54, y = T + 40;
      const c = s.add.container(x, y);
      const frame = s.add.rectangle(0, 0, 48, 48, 0x131b2a, 1).setStrokeStyle(2, 0x3a4a66, 1);
      const icon = s.add.text(0, 0, '·', { fontSize: 22 }).setOrigin(0.5);
      const dim = s.add.rectangle(0, 0, 46, 46, 0x000000, 0.55).setVisible(false);
      const pie = s.add.graphics();
      const cd = s.add.text(0, 1, '', { fontFamily: FONT, fontSize: 16, color: '#ffffff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
      const key = s.add.text(-22, -23, slot.toUpperCase(), {
        fontFamily: FONT, fontSize: 10, color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 3, y: 0 },
      }).setOrigin(0, 0);
      const charges = s.add.text(22, 23, '', {
        fontFamily: FONT, fontSize: 11, color: '#ffd23f', backgroundColor: '#000000cc', padding: { x: 3, y: 0 },
      }).setOrigin(1, 1).setVisible(false);
      const flash = s.add.rectangle(0, 0, 48, 48, 0xffffff, 0).setStrokeStyle(3, 0xffffff, 0);
      if (this.touch) {
        frame.setInteractive({ useHandCursor: true });
        frame.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); this.o.onSpell?.(slot, true); });
      }
      c.add([frame, icon, dim, pie, cd, key, charges, flash]);
      root.add(c);
      this.spellSlots[slot] = { c, frame, icon, dim, pie, cd, charges, flash, x, y, id: null };
    });

    // Compact +/- HUD scale controls (expanded 36x26 hit area, stacked on right edge of bottom HUD)
    const mkScaleBtn = (dy, label, delta) => {
      const bx = PANEL_W / 2 + 18, by = T + dy;
      const bg = s.add.rectangle(bx, by, 22, 20, 0x111a28, 0.88).setStrokeStyle(1, 0x39c2ff, 0.8);
      const txt = s.add.text(bx, by, label, { fontFamily: FONT, fontSize: 13, color: '#a8e0ff' }).setOrigin(0.5);
      bg.setInteractive(new Phaser.Geom.Rectangle(-7, -3, 36, 26), Phaser.Geom.Rectangle.Contains);
      if (bg.input) bg.input.cursor = 'pointer';
      bg.on('pointerdown', (p, lx, ly, ev) => {
        if (p.rightButtonDown?.()) return;
        ev?.stopPropagation?.();
        this.adjustHudScale(delta);
      });
      root.add([bg, txt]);
    };
    mkScaleBtn(16, '+', 0.1);
    mkScaleBtn(42, '-', -0.1);
    this._shopLocalX = rx;
    root.setScale(this._hudScale);
  }

  _panelTop() { return this.H - PANEL_H * (this._hudScale || 1); }

  _syncScaledHud() {
    const sc = this._hudScale || 1;
    const top = this._panelTop();
    if (this.recallBox) this.recallBox.setPosition(this.px, top - 56);
    if (this.hideBox) this.hideBox.setPosition(this.px, top - 18);
    if (this.buyNudge) {
      const localX = this._shopLocalX ?? (-PANEL_W / 2 + 752);
      this.buyNudge.setPosition(Math.min(this.W - 130, this.px + localX * sc), top - 20);
    }
    if (this._toasts?.length) this._layoutToasts();
  }

  adjustHudScale(delta) {
    this._hudScale = Math.max(0.7, Math.min(1.15, Math.round((this._hudScale + delta) * 100) / 100));
    this.panelRoot?.setScale(this._hudScale);
    this._syncScaledHud();
    try { window.localStorage.setItem('bugsmash.hud.scale', String(this._hudScale)); } catch (_) { /* ignore */ }
  }

  setChampion(champId, team) {
    const def = CHAMPIONS[champId] || CHAMPIONS.pixel;
    this.def = def;
    this.portrait.setText(def.emoji);
    this._portraitC?.destroy(); this._portraitC = null;
    const draw = LOOKS.mod?.drawChampionPortrait;
    if (typeof draw === 'function') {
      try {
        const c = draw(this.s, def.id, this._xpPos.x, this._xpPos.y, 72);
        if (c) {
          this.panelRoot?.add(c);
          this.panelRoot?.bringToTop(this.lvBadge);
          this.panelRoot?.bringToTop(this.lvText);
          this._portraitC = c;
          this.portrait.setVisible(false);
        }
      } catch (e) { console.warn('[MobaHud] drawChampionPortrait failed:', e?.message); this.portrait.setVisible(true); }
    }
    this.portraitRing.setStrokeStyle(3, ME_COLOR, 1).setFillStyle(teamColor(team) & 0x3f3f3f | 0x101010, 1);
    for (const slot of SLOTS) {
      const sk = def.skills[slot], sl = this.slots[slot];
      sl.icon.setText(sk.icon);
      sl.mana.setText(String(sk.mana));
      sl.frame.setStrokeStyle(2, sk.color, 0.85);
    }
    for (const b of this._touchSkills || []) b.icon.setText(def.skills[b.slot].icon);
  }

  flashSlot(slot, bad) {
    const sl = this.slots[slot] || this.spellSlots?.[slot] || null;
    const color = bad ? 0xff4a4a : 0xffffff;
    const targets = [sl?.flash, this._touchSkillMap?.[slot]?.flash].filter(Boolean);
    for (const f of targets) {
      f.setStrokeStyle(3, color, 1).setFillStyle(color, bad ? 0.25 : 0.35);
      this.s.tweens.add({ targets: f, alpha: { from: 1, to: 0 }, duration: 260, onComplete: () => f.setAlpha(1).setFillStyle(color, 0).setStrokeStyle(3, color, 0) });
    }
  }

  _showSkillTip(slot) {
    const sk = this.def?.skills?.[slot];
    if (!sk) return;
    const sl = this.slots[slot], sc = this._hudScale || 1;
    const range = sk.at === 'pet' ? ` · radius ${sk.radius}` : sk.range ? ` · range ${sk.range}${sk.radius ? ` · radius ${sk.radius}` : ''}` : (sk.radius ? ` · radius ${sk.radius}` : '');
    const mech = skillMechanics(sk, this.def);
    const desc = tText(`skill.${this.def.id}.${slot}`, sk.desc);
    this._showTip(this.px + sl.x * sc, this._panelTop() - 8,
      `${sk.icon} ${sk.name}  [${slot.toUpperCase()}]${slot === 'r' ? `  (Lv ${ULT_UNLOCK_LEVEL}+)` : ''}`,
      `${sk.mana} mana · ${sk.cd}s cooldown${range}\n${desc}${mech.length ? `\n${mech.join('\n')}` : ''}`, sk.color);
  }
  _showSpellTip(slot) {
    const sl = this.spellSlots?.[slot], sp = sl && SPELLS[sl.id];
    if (!sp) return;
    const lv = this._lv || 1, sc = this._hudScale || 1;
    const amt = (a) => Math.round((a?.base || 0) + (a?.perLevel || 0) * (lv - 1));
    const L = [`${sp.cd}s cooldown${sp.range ? ` · range ${sp.range}` : ''}${sp.radius ? ` · radius ${sp.radius}` : ''}`, tText(`spell.${sp.id}`, sp.desc)];
    if (sp.heal) L.push(`💚 heal ${amt(sp.heal)} (+${sp.heal.perLevel}/lv)`);
    if (sp.shield) L.push(`🛡 shield ${amt(sp.shield)} for ${sec(sp.ms)}`);
    if (sp.dmg) L.push(`⚔ ${amt(sp.dmg)} true damage${sp.kind === 'dot' ? ` over ${sec(sp.ms)} · −${Math.round(sp.healCut * 100)}% healing` : ''}`);
    if (sp.msPct) L.push(`👟 +${Math.round(sp.msPct * 100)}% move speed for ${sec(sp.ms)}`);
    if (sp.kind === 'blink') L.push('🧱 crosses walls (lands on the nearest free spot)');
    if (sp.kind === 'smite') L.push('🎯 monsters + enemy minions only');
    if (sp.kind === 'dot') L.push('🎯 enemy champions only');
    this._showTip(this.px + sl.x * sc, this._panelTop() - 8, `${sp.icon} ${sp.name}  [${slot.toUpperCase()}]`, L.join('\n'), sp.color);
  }
  _showChampTip() {
    const def = this.def;
    if (!def) return;
    const sc = this._hudScale || 1;
    const pet = def.pet ? `\n${def.pet.emoji || '🤖'} Pet: ${def.pet.name} — follows you, zaps your target (range ${def.pet.range}, every ${sec(def.pet.atkMs)}), can't be targeted` : '';
    this._showTip(this.px + (this._xpPos.x + 40) * sc, this._panelTop() - 8, `${def.emoji} ${def.name} ${def.title || ''}`, `${def.role}${def.ranged ? ' · ranged' : ' · melee'}\n${def.blurb || ''}${pet}`, def.color || 0xffd23f);
  }
  _showItemTip(i, x) {
    const it = ITEMS[this.items[i].id];
    if (!it) return;
    const stats = Object.entries(it.stats || {}).map(([k, v]) => `${k} ${v < 1 && v > 0 ? `${Math.round(v * 100)}%` : `+${v}`}`).join(' · ');
    this._showTip(x, this._panelTop() - 8, `${it.emoji} ${it.name}`, `${stats ? stats + '\n' : ''}${tText(`item.${it.id}`, it.desc)}`, 0xffd23f);
  }
  _showTip(x, y, title, body, color) {
    this._hideTip();
    const s = this.s;
    const c = s.add.container(0, 0).setScrollFactor(0).setDepth(60);
    const t1 = s.add.text(0, 0, title, { fontFamily: FONT, fontSize: 14, color: css(color), stroke: '#000', strokeThickness: 3 });
    const t2 = s.add.text(0, 22, body, { fontFamily: MONO, fontSize: 12, color: '#dfe7f5', wordWrap: { width: 300 }, lineSpacing: 3 });
    const w = Math.max(t1.width, t2.width) + 20, h = 22 + t2.height + 16;
    const bx = Math.max(8, Math.min(this.W - w - 8, x - w / 2)), by = y - h;
    const bg = s.add.rectangle(bx, by, w, h, 0x070b12, 0.95).setOrigin(0).setStrokeStyle(2, color, 0.8);
    t1.setPosition(bx + 10, by + 8); t2.setPosition(bx + 10, by + 30);
    c.add([bg, t1, t2]);
    this._tip = c;
  }
  _hideTip() { this._tip?.destroy(); this._tip = null; }

  // ───────────────────────── top center ─────────────────────────
  _buildTop() {
    const s = this.s, cx = this.W / 2;
    this._r(cx, 26, 236, 44, 0x0a0f18, 0.55).setStrokeStyle(1.5, 0x2c3a55, 0.55).setDepth(48);
    this.blueK = this._t(cx - 66, 19, `${TEAM_INFO.blue.emoji} 0`, { fontSize: 16, color: TEAM_INFO.blue.css, stroke: '#000', strokeThickness: 3 }).setAlpha(0.82).setDepth(49);
    this.redK = this._t(cx + 66, 19, `0 ${TEAM_INFO.red.emoji}`, { fontSize: 16, color: TEAM_INFO.red.css, stroke: '#000', strokeThickness: 3 }).setAlpha(0.82).setDepth(49);
    this.clock = this._t(cx, 18, '0:00', { fontSize: 13, color: '#ffffff', stroke: '#000', strokeThickness: 2.5 }).setAlpha(0.82).setDepth(49);
    this.epicT = this._t(cx, 37, '', { fontFamily: MONO, fontSize: 11, color: '#d5e0f2' }).setAlpha(0.82).setDepth(49);
    this.buffT = this._t(cx, 58, '', { fontSize: 11, stroke: '#000', strokeThickness: 3 }).setAlpha(0.85).setDepth(49);
  }

  // ───────────────────────── minimap ─────────────────────────
  _buildMinimap(map) {
    const s = this.s;
    const size = this.touch ? 168 : 200;
    // 2026-11-25: the floor size comes from the world (Story Mode floors are not 6000 square)
    const WW = this.o.world?.w || MAP_W, WH = this.o.world?.h || MAP_H;
    this.mm = { x: 10, y: 10, size, k: size / Math.max(WW, WH) };
    // Static minimap baked once into a small texture (Graphics would re-tessellate every frame).
    if (map) {
      const g = s.make.graphics({}, false);
      map.drawMinimap(g, 0, 0, size);
      s.add.renderTexture(this.mm.x, this.mm.y, size, size).setOrigin(0, 0).setScrollFactor(0).setDepth(46).draw(g, 0, 0);
      g.destroy();
    }
    this.mmDyn = s.add.graphics().setScrollFactor(0).setDepth(47);
    // Pass 2 RP-08 (LoL): left-drag = look there (onMinimapView), right-click = move there
    // (onMinimap). Touch: a quick tap = move (as before), press + drag = look. Without an
    // onMinimapView handler every press is a move order (old behaviour).
    const toWorld = (p) => ({
      x: Math.max(0, Math.min(WW, (p.x - this.mm.x) / this.mm.k)),
      y: Math.max(0, Math.min(WH, (p.y - this.mm.y) / this.mm.k)),
    });
    this._mmDrag = null;
    this._r(this.mm.x + size / 2, this.mm.y + size / 2, size, size, 0x000000, 0).setDepth(46).setInteractive()
      .on('pointerdown', (p, lx, ly, ev) => {
        ev?.stopPropagation?.();
        const w = toWorld(p);
        if (!this.o.onMinimapView || p.rightButtonDown?.()) { this.o.onMinimap?.(w.x, w.y); return; }
        this._mmDrag = { id: p.id, x: p.x, y: p.y, at: Date.now(), moved: false, touch: !!this.touch && p.wasTouch !== false };
        if (!this._mmDrag.touch) this.o.onMinimapView(w.x, w.y, 'down');
      });
    s.input.on('pointermove', (p) => {
      const d = this._mmDrag;
      if (!d || d.id !== p.id || !p.isDown) return;
      if (Math.abs(p.x - d.x) + Math.abs(p.y - d.y) > 8) d.moved = true;
      if (d.touch && !d.moved) return;
      this.o.onMinimapView?.(toWorld(p).x, toWorld(p).y, 'move');
    });
    const up = (p) => {
      const d = this._mmDrag;
      if (!d || d.id !== p.id) return;
      this._mmDrag = null;
      if (d.touch && !d.moved && Date.now() - d.at < 350) { const w = toWorld(d); this.o.onMinimap?.(w.x, w.y); return; }
      this.o.onMinimapView?.(0, 0, 'up');
    };
    s.input.on('pointerup', up);
    s.input.on('pointerupoutside', up);
    this._mmAt = 0;
  }

  /** Redraw minimap dots (throttled ~8 Hz). me = {x,y} predicted local position. */
  _drawMinimap(st, myId, me, view) {
    const g = this.mmDyn, { x: x0, y: y0, k } = this.mm;
    g.clear();
    st.structures?.forEach((t) => {
      const r = t.kind === 'core' ? 6 : 4;
      g.fillStyle(t.alive ? teamColor(t.team) : 0x4a4f58, 1);
      g.fillRect(x0 + t.x * k - r, y0 + t.y * k - r, r * 2, r * 2);
      g.lineStyle(1, 0x000000, 1); g.strokeRect(x0 + t.x * k - r, y0 + t.y * k - r, r * 2, r * 2);
    });
    // Squares only: fillCircle would re-tessellate ~100 points per dot every frame.
    st.units?.forEach((u) => {
      if (!u.alive || u.kind === 'pet') return;
      const epic = u.kind === 'golden' || u.kind === 'deadline';
      const col = u.team === 'blue' || u.team === 'red' ? teamColor(u.team) : (epic ? (u.kind === 'golden' ? 0xffd700 : 0xff3b3b) : 0xd8b65a);
      const r = epic ? 4.5 : (u.campId ? 2 : 1.6);
      g.fillStyle(col, 1);
      g.fillRect(x0 + u.x * k - r, y0 + u.y * k - r, r * 2, r * 2);
    });
    st.champions?.forEach((c, id) => {
      if (c.dead) return;
      const mine = id === myId;
      const x = x0 + (mine && me ? me.x : c.x) * k, y = y0 + (mine && me ? me.y : c.y) * k;
      const r = mine ? 5.5 : 4.5;
      g.fillStyle(mine ? ME_COLOR : 0x000000, 1); g.fillRect(x - r - 1.5, y - r - 1.5, r * 2 + 3, r * 2 + 3);
      g.fillStyle(teamColor(c.team), 1); g.fillRect(x - r, y - r, r * 2, r * 2);
    });
    if (view) {
      g.lineStyle(1, 0xffffff, 0.85);
      g.strokeRect(x0 + view.x * k, y0 + view.y * k, view.width * k, view.height * k);
    }
  }

  // ───────────────────────── misc: feed, banners, toasts, overlays ─────────────────────────
  _buildMisc() {
    const s = this.s, W = this.W, H = this.H;
    this.recallBox = s.add.container(this.px, this.pt - 62).setScrollFactor(0).setDepth(52).setVisible(false);
    const rb = s.add.rectangle(0, 0, 240, 34, 0x061220, 0.85).setStrokeStyle(2, 0x39c2ff, 0.9);
    this.recallFill = s.add.rectangle(-116, 9, 232, 5, 0x39c2ff, 1).setOrigin(0, 0.5);
    this.recallTxt = s.add.text(0, -5, '', { fontFamily: FONT, fontSize: 13, color: '#bfe6ff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    this.recallBox.add([rb, this.recallFill, this.recallTxt]);

    // Death overlay (the scene desaturates the world camera). EP-21 calm death screen: below the
    // banner lane, lines laid out by their real height (a wrapped killer line never stacks on the
    // countdown) and faded in one after another.
    this.death = s.add.container(W / 2, H * 0.42).setScrollFactor(0).setDepth(53).setVisible(false);
    this.deathBand = s.add.rectangle(0, 0, W, 132, 0x000000, 0.5);
    this.deathTitle = s.add.text(0, 0, '💀 YOU WERE PUSHED TO PRODUCTION', {
      fontFamily: FONT, fontSize: 22, color: '#ff8a8a', stroke: '#000', strokeThickness: 5, align: 'center', wordWrap: { width: W * 0.7 },
    }).setOrigin(0.5, 1);
    this.deathCount = s.add.text(0, 0, '', { fontFamily: FONT, fontSize: 30, color: '#ffffff', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5, 0);
    this.deathHint = s.add.text(0, 0, '🛒 The shop is open while you are dead — spend while you wait', { fontFamily: MONO, fontSize: 13, color: '#ffd23f' }).setOrigin(0.5, 0);
    this.death.add([this.deathBand, this.deathTitle, this.deathCount, this.deathHint]);
    this._layoutDeath();

    this.status = this._t(this.mm.x, this.mm.y + this.mm.size + 8, '', { fontFamily: MONO, fontSize: 12, color: '#7ec8ff' }, 0, 0).setDepth(50);

    // v4: "you are hidden in a bush" pill just above the panel.
    this.hideBox = s.add.container(this.px, this.pt - 22).setScrollFactor(0).setDepth(52).setVisible(false);
    this.hideBg = s.add.rectangle(0, 0, 300, 26, 0x0b2412, 0.9).setStrokeStyle(2, 0x5fd17a, 0.95);
    this.hideTxt = s.add.text(0, 0, '', { fontFamily: FONT, fontSize: 13, color: '#9dffb4', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    this.hideBox.add([this.hideBg, this.hideTxt]);
    this._hideState = null;
    // Target Info Panel (next to minimap — replaces old FX/CAM buttons which moved into ESC menu).
    this._buildTargetPanel();
    this._buildExtras();
  }

  _buildTargetPanel() {
    const s = this.s;
    const x = this.mm.x + this.mm.size + 10, y = this.mm.y, w = 232, h = 112;
    const c = s.add.container(x, y).setScrollFactor(0).setDepth(51).setVisible(false);
    const bg = s.add.rectangle(0, 0, w, h, 0x0a0f18, 0.94).setOrigin(0).setStrokeStyle(2, 0x39c2ff, 0.9);
    const title = s.add.text(10, 8, '', { fontFamily: FONT, fontSize: 13, color: '#ffffff', stroke: '#000', strokeThickness: 3 });
    const sub = s.add.text(w - 10, 9, '', { fontFamily: MONO, fontSize: 10, color: '#9fdcff' }).setOrigin(1, 0);
    const hpBg = s.add.rectangle(10, 38, w - 20, 16, 0x000000, 0.85).setOrigin(0, 0.5).setStrokeStyle(1, 0x7ed957, 0.45);
    const hpFill = s.add.rectangle(10, 38, w - 20, 12, 0x5fbf3a, 1).setOrigin(0, 0.5);
    const hpTxt = s.add.text(w / 2, 38, '', { fontFamily: MONO, fontSize: 10, color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    const mpBg = s.add.rectangle(10, 58, w - 20, 12, 0x000000, 0.85).setOrigin(0, 0.5).setStrokeStyle(1, 0x39c2ff, 0.45);
    const mpFill = s.add.rectangle(10, 58, w - 20, 8, 0x2f86e8, 1).setOrigin(0, 0.5);
    const mpTxt = s.add.text(w / 2, 58, '', { fontFamily: MONO, fontSize: 9, color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    const stats = s.add.text(10, 74, '', { fontFamily: MONO, fontSize: 11, color: '#cfd8e8', wordWrap: { width: w - 20 }, lineSpacing: 3 });
    c.add([bg, title, sub, hpBg, hpFill, hpTxt, mpBg, mpFill, mpTxt, stats]);
    this.targetPanel = { c, bg, title, sub, hpBg, hpFill, hpTxt, mpBg, mpFill, mpTxt, stats, bw: w - 20 };
  }

  /** Show or hide the selected target's live stats next to the minimap (dirty-checked: 0 text uploads when unchanged). */
  setTarget(info) {
    const tp = this.targetPanel;
    if (!tp) return;
    if (!info) {
      if (tp.c.visible) tp.c.setVisible(false);
      tp._sig = '';
      return;
    }
    const hp = Math.max(0, Math.round(info.hp || 0));
    const maxHp = Math.round(info.maxHp || 1);
    const mp = Math.max(0, Math.round(info.mana || 0));
    const maxMp = Math.round(info.maxMana || 0);
    const sig = `${info.rel}|${info.name}|${info.sub}|${hp}/${maxHp}|${mp}/${maxMp}|${info.stats}`;
    if (sig === tp._sig && tp.c.visible) return;
    tp._sig = sig;
    const col = info.rel === 'enemy' ? 0xff5e5e : (info.rel === 'neutral' ? 0xffd23f : 0x39c2ff);
    if (tp._col !== col) {
      tp._col = col;
      tp.bg.setStrokeStyle(2, col, 0.92);
      tp.title.setColor(css(col));
      tp.hpFill.setFillStyle(info.rel === 'enemy' ? 0xe04848 : (info.rel === 'neutral' ? 0xe0a838 : 0x5fbf3a), 1);
    }
    const nameStr = info.name || 'Target';
    if (tp._name !== nameStr) { tp._name = nameStr; tp.title.setText(nameStr); }
    const subStr = info.sub || '';
    if (tp._sub !== subStr) { tp._sub = subStr; tp.sub.setText(subStr); }
    const hpP = Math.max(0, Math.min(1, (info.hp || 0) / Math.max(1, info.maxHp || 1)));
    tp.hpFill.width = tp.bw * hpP;
    const hpStr = `HP ${hp} / ${maxHp}`;
    if (tp._hpStr !== hpStr) { tp._hpStr = hpStr; tp.hpTxt.setText(hpStr); }
    const hasMp = maxMp > 0;
    if (tp._hasMp !== hasMp) {
      tp._hasMp = hasMp;
      tp.mpBg.setVisible(hasMp); tp.mpFill.setVisible(hasMp); tp.mpTxt.setVisible(hasMp);
      tp.stats.setY(hasMp ? 72 : 56);
    }
    if (hasMp) {
      const mpP = Math.max(0, Math.min(1, (info.mana || 0) / Math.max(1, maxMp)));
      tp.mpFill.width = tp.bw * mpP;
      const mpStr = `MP ${mp} / ${maxMp}`;
      if (tp._mpStr !== mpStr) { tp._mpStr = mpStr; tp.mpTxt.setText(mpStr); }
    }
    const statsStr = info.stats || '';
    if (tp._statsStr !== statsStr) { tp._statsStr = statsStr; tp.stats.setText(statsStr); }
    if (!tp.c.visible) tp.c.setVisible(true);
  }

  // ───────────────────────── Experience Pass 1 widgets ─────────────────────────
  _buildExtras() {
    const s = this.s;
    const colX = 10, colY = this.mm.y + this.mm.size + 32; // left column under the minimap + status line
    this._colX = colX; this._colY = colY;
    // EP-08: 🏳 ROLLBACK (visible from ROLLBACK_FROM_MS online; the scene decides).
    this.rbBtn = this._button(this.mm.x + this.mm.size + 56, this.mm.y + 128, 86, 24, '🏳 ROLLBACK', 0xffb347, () => this.o.onRollback?.(), 50, 10);
    this.rbBtn.setVisible(false);
    // EP-08: team vote panel.
    const vw = 300, vh = 128;
    this.vote = s.add.container(colX, colY).setScrollFactor(0).setDepth(56).setVisible(false);
    const vbg = s.add.rectangle(0, 0, vw, vh, 0x140d04, 0.94).setOrigin(0).setStrokeStyle(2, 0xffb347, 0.95).setInteractive();
    vbg.on('pointerdown', (p, lx, ly, ev) => ev?.stopPropagation?.());
    this.voteTitle = s.add.text(12, 8, '🏳 ROLLBACK THE RELEASE?', { fontFamily: FONT, fontSize: 14, color: '#ffb347', stroke: '#000', strokeThickness: 3 });
    this.voteBy = s.add.text(12, 30, '', { fontFamily: MONO, fontSize: 12, color: '#f2e6d0', wordWrap: { width: vw - 24 } });
    this.voteCount = s.add.text(12, 64, '', { fontFamily: FONT, fontSize: 13, color: '#ffffff', stroke: '#000', strokeThickness: 3 });
    this.voteBarBg = s.add.rectangle(12, 86, vw - 24, 4, 0x000000, 0.8).setOrigin(0, 0.5);
    this.voteBar = s.add.rectangle(12, 86, vw - 24, 4, 0xffb347, 1).setOrigin(0, 0.5);
    this.voteMine = s.add.text(vw / 2, 108, '', { fontFamily: MONO, fontSize: 12, color: '#9fb0c8' }).setOrigin(0.5);
    this.vote.add([vbg, this.voteTitle, this.voteBy, this.voteCount, this.voteBarBg, this.voteBar, this.voteMine]);
    this.voteYes = this._button(colX + 78, colY + 108, 128, 28, this.touch ? '✔ YES' : '✔ YES (Y)', 0x7ed957, () => this.o.onVote?.(true), 57, 13);
    this.voteNo = this._button(colX + vw - 78, colY + 108, 128, 28, this.touch ? '✖ NO' : '✖ NO (N)', 0xff5e5e, () => this.o.onVote?.(false), 57, 13);
    this.voteYes.setVisible(false); this.voteNo.setVisible(false);
    this._voteW = vw;
    // EP-10: coaching tip card (same column; hidden while a vote is open).
    this.tipBox = s.add.container(colX, colY).setScrollFactor(0).setDepth(55).setVisible(false);
    this.tipBg = s.add.rectangle(0, 0, vw, 60, 0x07131f, 0.92).setOrigin(0).setStrokeStyle(2, 0x7ec8ff, 0.9);
    this.tipHead = s.add.text(12, 8, '💡 FIRST-DAY TIP', { fontFamily: FONT, fontSize: 11, color: '#7ec8ff' });
    this.tipTxt = s.add.text(12, 26, '', { fontFamily: MONO, fontSize: 13, color: '#ffffff', wordWrap: { width: vw - 24 }, lineSpacing: 2 });
    this.tipBox.add([this.tipBg, this.tipHead, this.tipTxt]);
    // EP-21: first-buy nudge, anchored above the scaled shop button via _syncScaledHud().
    this.buyNudge = s.add.container(this.px, this._panelTop() - 20).setScrollFactor(0).setDepth(52).setVisible(false);
    this.buyBg = s.add.rectangle(0, 0, 230, 28, 0x2a2208, 0.95).setStrokeStyle(2, 0xffd23f, 1).setInteractive({ useHandCursor: true });
    this.buyBg.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); this.o.onShop?.(); });
    this.buyTxt = s.add.text(0, 0, '', { fontFamily: FONT, fontSize: 13, color: '#ffe680', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    this.buyNudge.add([this.buyBg, this.buyTxt]);
    this._buyStr = null;
    this._syncScaledHud();
  }

  /** Round 2: the end screen covers the match — remove banners, toasts and the side widgets. */
  clearTransient() {
    this._quiet = true; // later banners / toasts would draw over the end screen
    this._bannerQ.length = 0;
    if (this._bannerCur) { this.s.tweens.killTweensOf(this._bannerCur); this._bannerCur.destroy(); this._bannerCur = null; }
    this._toastQ.length = 0;
    for (const t of this._toasts) t.destroy();
    this._toasts.length = 0;
    this._tipEvt?.remove(false);
    this.tipBox.setVisible(false);
    this.setBuyNudge(null);
    this.showVote(null);
    this.setRollbackVisible(false);
    this.death.setVisible(false);
    this.hideBox.setVisible(false); this._hideState = null;
  }

  /** EP-08: show / hide the 🏳 ROLLBACK button. */
  setRollbackVisible(on) { if (this.rbBtn.visible !== !!on) this.rbBtn.setVisible(!!on); }

  /** EP-08: v = { yes, no, need, endsAt, by, mine: true|false|'voted'|null } or null (closed). srvNow for the timer bar. */
  showVote(v, srvNow, totalMs) {
    const open = !!v;
    if (this.vote.visible !== open) {
      this.vote.setVisible(open);
      if (open) { this.tipBox.setVisible(false); this.vote.setAlpha(0); this.s.tweens.add({ targets: this.vote, alpha: 1, duration: 180 }); }
    }
    const canVote = open && v.mine == null;
    this.voteYes.setVisible(canVote); this.voteNo.setVisible(canVote);
    if (!open) return;
    this._set('vBy', this.voteBy, `${String(v.by || 'Someone').slice(0, 18)} wants last Friday's build back`);
    this._set('vCount', this.voteCount, `✔ ${v.yes | 0} / ${v.need | 0} needed   ✖ ${v.no | 0}`);
    const left = Math.max(0, (v.endsAt || 0) - srvNow);
    this.voteBar.width = (this._voteW - 24) * Math.max(0, Math.min(1, left / Math.max(1, totalMs || 20000)));
    const how = v.mine === 'voted' ? 'already voted' : `voted ${v.mine ? '✔ yes' : '✖ no'}`;
    this._set('vMine', this.voteMine, v.mine == null ? '' : `you ${how} · ${Math.ceil(left / 1000)}s left`);
  }

  /** EP-10: one coaching tip in the left column for `ms` (replaces any tip on screen). */
  tip(text, ms = 7000) {
    if (!text) return;
    const s = this.s;
    this.tipTxt.setText(String(text));
    this.tipBg.setSize(this._voteW, 26 + this.tipTxt.height + 12);
    s.tweens.killTweensOf(this.tipBox);
    this.tipBox.setVisible(!this.vote.visible).setAlpha(0).setX(this._colX - 20);
    s.tweens.add({ targets: this.tipBox, alpha: 1, x: this._colX, duration: 260, ease: 'Cubic.easeOut' });
    this._tipEvt?.remove(false);
    this._tipEvt = s.time.delayedCall(ms, () => {
      if (!this.tipBox.scene) return;
      s.tweens.add({ targets: this.tipBox, alpha: 0, duration: 300, onComplete: () => this.tipBox.setVisible(false) });
    });
  }
  get tipShowing() { return this.tipBox.visible; }

  /** EP-21: pulsing "🛒 Buy <item> (P)" pill (null = hide). */
  setBuyNudge(str) {
    if (str === this._buyStr) return;
    this._buyStr = str;
    const s = this.s;
    s.tweens.killTweensOf(this.buyNudge);
    if (!str) { this.buyNudge.setVisible(false); return; }
    this.buyTxt.setText(str);
    this.buyBg.setSize(this.buyTxt.width + 26, 28);
    this.buyBg.input?.hitArea?.setSize?.(this.buyTxt.width + 26, 28);
    this.buyNudge.setVisible(true).setScale(1).setAlpha(1);
    s.tweens.add({ targets: this.buyNudge, scale: 1.08, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** v4: effects mode label — pref 'auto' | 'high' | 'low', low = currently low effects. */
  /** Pass 2 RP-08: show the camera lock state on the CAM button. */
  setCamLocked(locked) {
    const str = locked ? '🔒 CAM' : '🔓 CAM';
    if (this.camBtn && this.camBtn._label.text !== str) this.camBtn._label.setText(str);
  }

  setFxMode(pref, low) {
    const str = pref === 'auto' ? (low ? '✨AUTO·lo' : '✨AUTO') : (pref === 'low' ? '✨LOW' : '✨HIGH');
    if (this.fxBtn && this.fxBtn._label.text !== str) this.fxBtn._label.setText(str);
  }

  /** v4: bush hint for the local champion — null | 'hidden' | 'attacked' | 'enemy' | 'revealed'. */
  _setHidden(state) {
    if (state === this._hideState) return;
    this._hideState = state;
    if (!state) { this.hideBox.setVisible(false); return; }
    const hidden = state === 'hidden';
    const txt = hidden ? "🌿 HIDDEN — enemies can't see you"
      : state === 'enemy' ? '👀 An enemy is in your bush — you are visible'
        : '🌿 Revealed — you attacked (hidden again in 1.5s)';
    this.hideTxt.setText(txt).setColor(hidden ? '#9dffb4' : '#ffd27a');
    this.hideBg.setStrokeStyle(2, hidden ? 0x5fd17a : 0xffb347, 0.95).setFillStyle(hidden ? 0x0b2412 : 0x2a1a06, 0.9);
    this.hideBg.setSize(Math.max(220, this.hideTxt.width + 26), 26);
    this.hideBox.setVisible(true);
  }

  /** entry: { text, color?, mine? } — top-right, newest at the bottom. */
  feed(entry) {
    if (!entry?.text) return;
    const s = this.s;
    const t = s.add.text(this.W - 12, 0, String(entry.text).slice(0, 96), {
      fontFamily: MONO, fontSize: 13, color: entry.color || '#dfe6f0', stroke: '#000', strokeThickness: 3,
      backgroundColor: entry.mine ? 'rgba(255,210,63,0.22)' : 'rgba(5,9,16,0.6)', padding: { x: 6, y: 2 },
      wordWrap: { width: this.W / 2 - 200 }, align: 'right', // stays clear of the top score widget
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(55);
    t._born = s.time.now;
    this._feed.push(t);
    while (this._feed.length > FEED_MAX) this._feed.shift().destroy();
    this._layoutFeed();
  }
  _layoutFeed() {
    let y = 10;
    for (const f of this._feed) { f.y = y; y += f.height + 3; }
  }

  /** b: { title, sub?, color?, big? } — center banner, queued. */
  banner(b) {
    if (!b?.title || this._quiet) return;
    this._bannerQ.push(b);
    while (this._bannerQ.length > 4) {
      const i = this._bannerQ.findIndex((x) => !x.big);
      this._bannerQ.splice(i >= 0 ? i : 0, 1);
    }
    if (!this._bannerCur) this._nextBanner();
  }
  _nextBanner() {
    const b = this._bannerQ.shift();
    if (!b) { this._bannerCur = null; return; }
    const s = this.s;
    const c = s.add.container(this.W / 2, this.H * 0.24).setScrollFactor(0).setDepth(58);
    const title = s.add.text(0, 0, b.title, {
      fontFamily: FONT, fontSize: b.big ? 34 : 26, color: b.color || '#ffd23f', stroke: '#000', strokeThickness: 7,
      align: 'center', wordWrap: { width: this.W * 0.8 },
    }).setOrigin(0.5);
    c.add(title);
    if (b.sub) {
      c.add(s.add.text(0, title.height / 2 + 15, b.sub, {
        fontFamily: MONO, fontSize: 15, color: '#ffffff', stroke: '#000', strokeThickness: 4, align: 'center', wordWrap: { width: this.W * 0.8 },
      }).setOrigin(0.5));
    }
    c.setScale(0.6).setAlpha(0);
    s.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
    this._bannerCur = c;
    s.time.delayedCall(b.big ? 2800 : 2000, () => {
      s.tweens.add({
        targets: c, alpha: 0, y: c.y - 16, duration: 280,
        onComplete: () => { c.destroy(); if (this._bannerCur === c) this._nextBanner(); },
      });
    });
  }

  /** Queued toast: ≤ 2 visible (newest at the bottom), the rest wait their turn; duplicates are dropped. */
  toast(text, color = '#ffffff', ms = 1600) {
    if (!text || this._quiet) return;
    const now = this.s.time.now;
    if (this._lastToast === text && now - this._lastToastAt < 700) return; // no spam
    if (this._toasts.some((t) => t.text === text) || this._toastQ.some((q) => q.text === text)) return;
    this._lastToast = text; this._lastToastAt = now;
    this._toastQ.push({ text: String(text), color, ms });
    while (this._toastQ.length > 4) this._toastQ.shift();
    this._pumpToasts();
  }
  _pumpToasts() {
    const s = this.s;
    while (this._toasts.length < 2 && this._toastQ.length) {
      const q = this._toastQ.shift();
      const t = s.add.text(this.px, 0, q.text, {
        fontFamily: FONT, fontSize: 15, color: q.color, stroke: '#000', strokeThickness: 4,
        align: 'center', wordWrap: { width: Math.min(760, this.W - 300) },
      }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(57).setAlpha(0);
      this._toasts.push(t);
      s.tweens.add({ targets: t, alpha: 1, duration: 140 });
      // A waiting queue shortens the visible ones so feedback never lags far behind.
      const life = this._toastQ.length ? Math.min(q.ms, 1100) : q.ms;
      s.time.delayedCall(life, () => {
        if (!t.scene) return;
        s.tweens.add({
          targets: t, alpha: 0, duration: 220,
          onComplete: () => {
            const i = this._toasts.indexOf(t); if (i >= 0) this._toasts.splice(i, 1);
            t.destroy(); this._layoutToasts(); this._pumpToasts();
          },
        });
      });
    }
    this._layoutToasts();
  }
  _layoutToasts() {
    let y = this._panelTop() - 86;
    for (let i = this._toasts.length - 1; i >= 0; i--) { const t = this._toasts[i]; t.y = y; y -= t.height + 4; }
  }

  chat(m) {
    if (!m?.text) return;
    const s = this.s;
    const who = m.kind === 'bot' ? `🤖 ${m.name || 'bot'}` : (m.name || '?');
    const t = s.add.text(12, 0, `${who}: ${String(m.text).slice(0, 140)}`, {
      fontFamily: MONO, fontSize: 13, color: m.mine ? '#ffd23f' : (m.color || '#dfe6f0'), stroke: '#000', strokeThickness: 3,
      wordWrap: { width: Math.min(420, this.pl - 24 > 200 ? this.pl - 24 : 420) },
    }).setOrigin(0, 1).setScrollFactor(0).setDepth(54);
    t._born = s.time.now;
    this._chat.push(t);
    while (this._chat.length > CHAT_MAX) this._chat.shift().destroy();
    this._layoutChat();
  }
  _layoutChat() {
    let y = this.touch ? this.H - 150 : this.H - 12;
    for (let i = this._chat.length - 1; i >= 0; i--) { const t = this._chat[i]; t.y = y; y -= t.height + 2; }
  }

  setStatus(text, color = '#7ec8ff') { this.status.setText(text || '').setColor(color); }

  // ───────────────────────── lobby overlay ─────────────────────────
  showLobby(on) {
    if (on && !this.lobby) this._buildLobby();
    if (!this.lobby) return;
    this.lobby.setVisible(!!on);
    this._lobbyBtns.forEach((b) => b.setVisible(!!on));
    this._lobbyBtnsVisible = !!on;
  }
  _buildLobby() {
    const s = this.s, W = this.W, H = this.H;
    const c = s.add.container(0, 0).setScrollFactor(0).setDepth(100);
    const dim = s.add.rectangle(0, 0, W, H, 0x05080f, 0.97).setOrigin(0).setInteractive(); // opaque: no world before playing
    dim.on('pointerdown', (p, lx, ly, ev) => ev?.stopPropagation?.());
    const title = s.add.text(W / 2, 54, '⚔️ OFFICE SIEGE — 5v5', { fontFamily: FONT, fontSize: 34, color: '#ffd23f', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5);
    const sub = s.add.text(W / 2, 92, `${TEAM_INFO.blue.emoji} Startup vs ${TEAM_INFO.red.emoji} MegaCorp · destroy the enemy Production Server`, {
      fontFamily: MONO, fontSize: 14, color: '#c9d3e6',
    }).setOrigin(0.5);
    this.lobbyCount = s.add.text(W / 2, 132, '', { fontFamily: FONT, fontSize: 22, color: '#ffffff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
    c.add([dim, title, sub, this.lobbyCount]);
    this.lobbyRows = { blue: [], red: [] };
    for (const [ti, team] of ['blue', 'red'].entries()) {
      const x0 = ti === 0 ? 110 : W / 2 + 30, w = W / 2 - 140;
      const head = s.add.text(x0 + w / 2, 172, `${TEAM_INFO[team].emoji} ${TEAM_INFO[team].name.toUpperCase()}`, {
        fontFamily: FONT, fontSize: 20, color: TEAM_INFO[team].css, stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5);
      c.add(head);
      for (let i = 0; i < TEAM_SIZE; i++) {
        const y = 214 + i * 56;
        const bg = s.add.rectangle(x0, y, w, 48, teamColor(team), 0.1).setOrigin(0, 0.5).setStrokeStyle(2, teamColor(team), 0.35);
        const em = s.add.text(x0 + 30, y, '🤖', { fontSize: 26 }).setOrigin(0.5);
        const nm = s.add.text(x0 + 58, y - 9, '', { fontFamily: FONT, fontSize: 15, color: '#ffffff' }).setOrigin(0, 0.5);
        const ch = s.add.text(x0 + 58, y + 11, '', { fontFamily: MONO, fontSize: 12, color: '#9fb0c8' }).setOrigin(0, 0.5);
        c.add([bg, em, nm, ch]);
        this.lobbyRows[team].push({ bg, em, nm, ch, team });
      }
    }
    const start = this._button(W / 2, H - 96, 260, 50, '▶ START NOW', 0x7ed957, () => this.o.onStartNow?.(), 101, 20);
    const back = this._button(W / 2, H - 40, 200, 36, '← LEAVE', 0x8a94a8, () => this.o.onLeave?.(), 101, 14);
    const hint = s.add.text(W / 2, H - 140, this.touch
      ? 'Joystick: move · ⚔ attack · skill + D/F buttons auto-aim · 🏠 recall · 🛒 shop · ℹ info'
      : 'Right/left-click: move · click enemy: attack · Q W E R: skills at cursor · D F: summoner spells · SPACE: attack nearest · B recall · P shop · C info · TAB scores',
    { fontFamily: MONO, fontSize: 13, color: '#7ec8ff', align: 'center', wordWrap: { width: W - 120 } }).setOrigin(0.5);
    c.add(hint);
    start.setVisible(true); back.setVisible(true);
    this.lobby = c;
    this._lobbyBtns = [start, back];
    c.on('destroy', () => this._lobbyBtns?.forEach((b) => b.destroy()));
    this._lobbyBtnsVisible = true;
  }
  /** Waiting overlay: lobby (queue) · select (champion select) · loading — v3 deep-link joins. */
  updateLobby(st, myId, srvNow) {
    if (!this.lobby) return;
    const ph = st.phase || 'lobby';
    const myTeam = st.champions?.get?.(myId)?.team || null;
    const secs = (at) => Math.ceil(Math.max(0, (at || 0) - srvNow) / 1000);
    let line;
    if (ph === 'select') line = `🎯 Champion select — locks in ${secs(st.selectEndsAt)} s`;
    else if (ph === 'loading') line = `⏳ Loading the office… ${secs(st.loadingEndsAt)} s`;
    else line = st.lobbyEndsAt ? `Match starts in ${secs(st.lobbyEndsAt)} s — empty seats are filled by bots` : 'Waiting for players…';
    this._set('lobbyCount', this.lobbyCount, line);
    const startVis = ph === 'lobby';
    if (this._lobbyBtns?.[0] && this._lobbyBtns[0].visible !== (startVis && this.lobby.visible)) this._lobbyBtns[0].setVisible(startVis && this.lobby.visible);
    const by = { blue: [], red: [] };
    st.champions?.forEach((c, id) => { if (by[c.team]) by[c.team].push([id, c]); });
    for (const team of ['blue', 'red']) {
      this.lobbyRows[team].forEach((row, i) => {
        const e = by[team][i];
        if (e) {
          const [id, c] = e;
          // Enemy picks stay hidden until locked (like the draft screen).
          const hidden = ph === 'select' && team !== myTeam && !c.locked;
          const def = hidden ? null : CHAMPIONS[c.champ];
          row.em.setText(def?.emoji || '❔');
          const lock = ph === 'select' ? (c.locked ? '✅ ' : '… ') : '';
          this._set(`ln_${team}${i}`, row.nm, `${lock}${c.isBot ? '🤖 ' : ''}${c.name || '?'}${id === myId ? '  (you)' : ''}`);
          const sp = (ph === 'select' || ph === 'loading') && !hidden ? `  ${SPELLS[c.spellD]?.icon || ''}${SPELLS[c.spellF]?.icon || ''}` : '';
          this._set(`lc_${team}${i}`, row.ch, def ? `${def.name} · ${def.role}${ph === 'select' && !c.locked ? ' (hovering)' : ''}${sp}` : (ph === 'select' ? 'choosing…' : (c.champ || '')));
          row.nm.setColor(id === myId ? '#ffd23f' : '#ffffff');
          row.bg.setFillStyle(teamColor(team), id === myId ? 0.26 : 0.14);
        } else {
          row.em.setText('🤖');
          this._set(`ln_${team}${i}`, row.nm, 'open seat');
          this._set(`lc_${team}${i}`, row.ch, 'a bot fills this seat at start');
          row.nm.setColor('#8a94a8');
          row.bg.setFillStyle(teamColor(team), 0.05);
        }
      });
    }
    const vis = this.lobby.visible;
    if (this._lobbyBtnsVisible !== vis) { this._lobbyBtnsVisible = vis; this._lobbyBtns.forEach((b, i) => b.setVisible(vis && (i > 0 || startVis))); }
  }
  hideLobbyButtons() { this._lobbyBtns?.forEach((b) => b.setVisible(false)); this._lobbyBtnsVisible = false; }

  // ───────────────────────── modal dialogs ─────────────────────────
  /** Generic modal: { title, body, buttons:[{label,color,fn}] } → returns close(). */
  modal({ title, body, buttons }) {
    this.closeModal();
    const s = this.s, W = this.W, H = this.H;
    const arr = buttons || [];
    const twoRows = arr.length > 2;
    const rows = twoRows ? Math.ceil(arr.length / 2) : 1;
    const boxH = twoRows ? (148 + rows * 56) : 210;
    const c = s.add.container(0, 0).setScrollFactor(0).setDepth(102);
    const dim = s.add.rectangle(0, 0, W, H, 0x000000, 0.6).setOrigin(0).setInteractive();
    dim.on('pointerdown', (p, lx, ly, ev) => ev?.stopPropagation?.());
    const box = s.add.rectangle(W / 2, H / 2, 540, boxH, 0x0a0f18, 0.97).setStrokeStyle(2, 0x39c2ff, 0.9);
    const t = s.add.text(W / 2, H / 2 - boxH / 2 + 34, title, { fontFamily: FONT, fontSize: 22, color: '#ffd23f', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
    const b = s.add.text(W / 2, H / 2 - boxH / 2 + 74, body || '', { fontFamily: MONO, fontSize: 14, color: '#dfe7f5', align: 'center', wordWrap: { width: 490 } }).setOrigin(0.5);
    c.add([dim, box, t, b]);
    const btns = arr.map((bt, i) => {
      const col = twoRows ? (i % 2) : i;
      const row = twoRows ? Math.floor(i / 2) : 0;
      const rowCount = twoRows ? Math.min(2, arr.length - row * 2) : arr.length;
      const bx = W / 2 + (col - (rowCount - 1) / 2) * 210;
      const by = twoRows ? (H / 2 - boxH / 2 + 132 + row * 56) : (H / 2 + 56);
      const btn = this._button(bx, by, 192, 42, bt.label, bt.color || 0x39c2ff, () => bt.fn?.(btn), 103, 14);
      return btn;
    });
    this._modal = { c, btns, t, b };
    return () => this.closeModal();
  }
  /** Update the open modal's title / body in place (reconnect countdown). */
  modalSet({ title, body } = {}) {
    const m = this._modal;
    if (!m) return;
    if (title != null && m.t.text !== title) m.t.setText(title);
    if (body != null && m.b.text !== body) m.b.setText(body);
  }
  closeModal() {
    if (!this._modal) return;
    this._modal.c.destroy(); this._modal.btns.forEach((b) => b.destroy());
    this._modal = null;
  }
  get modalOpen() { return !!this._modal; }

  // ───────────────────────── touch controls ─────────────────────────
  _buildTouch() {
    const s = this.s, W = this.W, H = this.H;
    this.stick = {
      baseX: 120, baseY: H - 150, r: 62, id: null,
      base: s.add.circle(120, H - 150, 62, 0x000000, 0.35).setStrokeStyle(3, 0x7ec8ff, 0.6).setScrollFactor(0).setDepth(52),
      knob: s.add.circle(120, H - 150, 28, 0x7ec8ff, 0.8).setStrokeStyle(2, 0xffffff, 0.9).setScrollFactor(0).setDepth(53),
    };
    const ax = W - 92, ay = H - 104;
    const mk = (x, y, r, label, color, fn, size = 26) => {
      const c = s.add.container(x, y).setScrollFactor(0).setDepth(52);
      const bg = s.add.circle(0, 0, r, 0x0b1220, 0.8).setStrokeStyle(3, color, 0.95);
      const icon = s.add.text(0, 0, label, { fontFamily: FONT, fontSize: size, color: '#ffffff' }).setOrigin(0.5);
      const flash = s.add.circle(0, 0, r, 0xffffff, 0).setStrokeStyle(3, 0xffffff, 0);
      bg.setInteractive();
      bg.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); fn(); });
      c.add([bg, icon, flash]);
      return { c, bg, icon, flash };
    };
    this._touchAtk = mk(ax, ay, 50, '⚔️', 0xffd23f, () => this.o.onAttack?.(), 34);
    this._touchSkills = [];
    this._touchSkillMap = {};
    const ANG = [180, 214, 248, 284];
    SLOTS.forEach((slot, i) => {
      const a = (ANG[i] * Math.PI) / 180, R = 112;
      const b = mk(ax + Math.cos(a) * R, ay + Math.sin(a) * R, 31, '·', 0x7ec8ff, () => this.o.onSkill?.(slot, false), 24);
      b.slot = slot;
      b.cd = s.add.text(0, 0, '', { fontFamily: FONT, fontSize: 16, color: '#ffffff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
      b.dim = s.add.circle(0, 0, 31, 0x000000, 0.55).setVisible(false);
      b.c.add([b.dim, b.cd]);
      this._touchSkills.push(b);
      this._touchSkillMap[slot] = b;
    });
    // Summoner spells D / F: left of the attack button, under the Q arc.
    this._touchSpells = {};
    [['d', W - 238, H - 34], ['f', W - 180, H - 30]].forEach(([slot, x, y]) => {
      const b = mk(x, y, 25, '·', 0x8a94a8, () => this.o.onSpell?.(slot, false), 20);
      b.slot = slot;
      b.cd = s.add.text(0, 0, '', { fontFamily: FONT, fontSize: 14, color: '#ffffff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
      b.dim = s.add.circle(0, 0, 25, 0x000000, 0.55).setVisible(false);
      b.charges = s.add.text(17, 17, '', {
        fontFamily: FONT, fontSize: 11, color: '#ffd23f', backgroundColor: '#000000cc', padding: { x: 3, y: 0 },
      }).setOrigin(1, 1).setVisible(false);
      b.c.add([b.dim, b.cd, b.charges]);
      this._touchSpells[slot] = b;
      this._touchSkillMap[slot] = b; // flashSlot() feedback
    });
    mk(W - 36, 150, 24, '📊', 0x9fb0c8, () => this.o.onScoreboard?.('toggle'), 18);
    mk(W - 36, 262, 24, 'ℹ', 0x7ed957, () => this.o.onInfo?.(), 18);
    mk(W - 36, 206, 24, '💬', 0x39c2ff, () => this.o.onChat?.(), 18);
  }

  /** Touch joystick: call from scene pointer handlers. Returns true if consumed. */
  stickDown(p) {
    if (!this.stick || this.stick.id != null || p.x > this.W * 0.45 || p.y < 120) return false;
    const st = this.stick;
    st.id = p.id; st.baseX = p.x; st.baseY = p.y;
    st.base.setPosition(p.x, p.y); st.knob.setPosition(p.x, p.y);
    return true;
  }
  stickMove(p) {
    const st = this.stick;
    if (!st || st.id !== p.id) return false;
    const dx = p.x - st.baseX, dy = p.y - st.baseY, d = Math.hypot(dx, dy), cl = Math.min(d, st.r);
    const nx = d ? dx / d : 0, ny = d ? dy / d : 0;
    st.knob.setPosition(st.baseX + nx * cl, st.baseY + ny * cl);
    this.o.onStick?.(cl / st.r < 0.22 ? null : { x: nx, y: ny });
    return true;
  }
  stickUp(p) {
    const st = this.stick;
    if (!st || st.id !== p.id) return false;
    st.id = null;
    st.knob.setPosition(st.baseX, st.baseY);
    this.o.onStick?.(null);
    return true;
  }

  // ───────────────────────── per frame ─────────────────────────
  /**
   * ctx: { st, me, myId, srvNow, now, mePos, view, canShop }
   */
  update(ctx) {
    const { st, me, srvNow, now } = ctx;
    // Expire feed + chat.
    if (this._feed.length && now - this._feed[0]._born > FEED_TTL) {
      const t = this._feed.shift();
      this.s.tweens.add({ targets: t, alpha: 0, duration: 300, onComplete: () => t.destroy() });
      this._layoutFeed();
    }
    if (this._chat.length && now - this._chat[0]._born > CHAT_TTL) {
      const t = this._chat.shift();
      this.s.tweens.add({ targets: t, alpha: 0, duration: 300, onComplete: () => t.destroy() });
    }
    if (!st) return;
    // Top bar.
    this._set('bk', this.blueK, `${TEAM_INFO.blue.emoji} ${st.blueKills | 0}`);
    this._set('rk', this.redK, `${st.redKills | 0} ${TEAM_INFO.red.emoji}`);
    const t = st.phase === 'playing' && st.startedAt ? srvNow - st.startedAt : (st.phase === 'ended' && st.startedAt ? this._endClock ?? (this._endClock = srvNow - st.startedAt) : 0);
    this._set('clock', this.clock, fmtTime(t));
    if (now >= (this._slowAt || 0)) {
      this._slowAt = now + 250;
      const ep = (kind, at, icon) => (at > srvNow ? `${icon} ${fmtTime(at - srvNow)}` : (st.phase === 'playing' ? `${icon} UP` : `${icon} —`));
      this._set('epic', this.epicT, `${ep('golden', st.epicGoldenAt || 0, '✨')}    ${ep('deadline', st.epicDeadlineAt || 0, '⏰')}`);
      const buffs = [];
      for (const team of ['blue', 'red']) {
        const id = team === 'blue' ? st.buffBlue : st.buffRed, until = team === 'blue' ? st.buffBlueUntil : st.buffRedUntil;
        if (id && until > srvNow) {
          const name = id === 'deadline' ? `${EPICS.deadline.title} buff` : id;
          buffs.push({ team, str: `${TEAM_INFO[team].emoji} ${name} ${fmtTime(until - srvNow)}` });
        }
      }
      const str = buffs.map((b) => b.str).join('   ');
      this._set('buff', this.buffT, str);
      const bcol = buffs.length ? teamCss(buffs[0].team) : null;
      if (bcol && this._cache.buffCol !== bcol) { this._cache.buffCol = bcol; this.buffT.setColor(bcol); }
    }
    if (this.lobby?.visible) this.updateLobby(st, ctx.myId, srvNow);
    if (now >= this._mmAt) {
      this._mmAt = now + 120;
      this._drawMinimap(st, ctx.myId, ctx.mePos, ctx.view);
    }
    this._updatePanel(me, srvNow, ctx);
    this._setHidden(me && !me.dead && ctx.phase === 'playing' ? (ctx.hidden || null) : null);
  }

  _updatePanel(me, srvNow, ctx) {
    if (!me) return;
    // Bars.
    const maxHp = Math.max(1, me.maxHp || 1), hp = Math.max(0, me.hp || 0), sh = me.shield || 0;
    const p = Math.min(1, hp / maxHp);
    const bw = this._bar.w;
    this.hpFill.width = bw * p;
    this.shFill.x = this._bar.x + bw * p; this.shFill.width = bw * Math.max(0, Math.min(1 - p, sh / maxHp));
    this._set('hp', this.hpText, `${Math.round(hp)} / ${Math.round(maxHp)}${sh > 0 ? `  (+${Math.round(sh)})` : ''}`);
    const maxMp = Math.max(1, me.maxMana || 1), mp = Math.max(0, me.mana || 0);
    this.mpFill.width = bw * Math.min(1, mp / maxMp);
    this._set('mp', this.mpText, `${Math.round(mp)} / ${Math.round(maxMp)}`);
    // Level + XP ring.
    const lv = me.level || 1;
    this._set('lv', this.lvText, String(lv));
    const xp = me.xp || 0;
    const xpKey = `${lv}:${xp}`;
    if (this._cache.xpKey !== xpKey) {
      this._cache.xpKey = xpKey;
      const lo = XP_TABLE[lv - 1] || 0, hi = XP_TABLE[lv] ?? lo;
      const f = lv >= MAX_LEVEL || hi <= lo ? 1 : Math.max(0, Math.min(1, (xp - lo) / (hi - lo)));
      const g = this.xpG, { x, y } = this._xpPos;
      g.clear();
      g.lineStyle(5, 0x000000, 0.7); g.strokeCircle(x, y, 45);
      if (f > 0) { g.lineStyle(4, 0xb084ff, 1); g.beginPath(); g.arc(x, y, 45, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); g.strokePath(); }
    }
    // Skills.
    const def = this.def;
    for (const slot of SLOTS) {
      const sl = this.slots[slot], sk = def?.skills?.[slot];
      if (!sk) continue;
      const readyAt = me['cd' + slot.toUpperCase()] || 0;
      const left = readyAt > srvNow ? readyAt - srvNow : 0;
      if (readyAt !== this._cdPrev[slot]) {
        this._cdPrev[slot] = readyAt;
        if (left > 0) this.cdTotal[slot] = Math.max(left, 300);
      }
      const locked = slot === 'r' && lv < ULT_UNLOCK_LEVEL;
      const hasRanks = !!me.ranks || Number.isFinite(me.rankQ);
      const rank = me.ranks ? (me.ranks[slot] || 0) : (Number.isFinite(me.rankQ) ? (me[`rank${slot.toUpperCase()}`] || 0) : (locked ? 0 : 1));
      const maxR = slot === 'r' ? 3 : 5;
      const canUp = (me.skillPoints || 0) > 0 && !locked && rank < maxR;
      if (sl.upBg) { sl.upBg.setVisible(canUp); sl.upTxt.setVisible(canUp); }
      if (sl.pips) {
        const pStr = hasRanks ? ('●'.repeat(rank) + '○'.repeat(Math.max(0, maxR - rank))) : '';
        this._set(`pip_${slot}`, sl.pips, pStr);
      }
      const unlearned = hasRanks && rank <= 0 && !locked;
      const noMana = !locked && !unlearned && left <= 0 && (me.mana || 0) < sk.mana;
      sl.lock.setVisible(locked || unlearned);
      if (locked) this._set(`lock_${slot}`, sl.lock, `🔒\nLv ${ULT_UNLOCK_LEVEL}`);
      else if (unlearned) this._set(`lock_${slot}`, sl.lock, 'Lv 0');
      sl.dim.setVisible(locked || unlearned || left > 0 || !!me.dead);
      sl.noMana.setVisible(noMana);
      sl.icon.setAlpha(locked || unlearned ? 0.3 : 1);
      if (sl._pie) { sl.pie.clear(); sl._pie = false; }
      if (left > 0 && !locked && !unlearned) {
        sl._pie = true;
        const f = Math.min(1, left / this.cdTotal[slot]);
        sl.pie.fillStyle(0x000000, 0.5);
        sl.pie.slice(0, 0, 27, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2, false); sl.pie.fillPath();
        this._set(`cd_${slot}`, sl.cd, left >= 1000 ? String(Math.ceil(left / 1000)) : (left / 1000).toFixed(1));
      } else this._set(`cd_${slot}`, sl.cd, '');
      const tb = this._touchSkillMap?.[slot];
      if (tb) {
        tb.dim.setVisible(locked || unlearned || left > 0);
        this._set(`tcd_${slot}`, tb.cd, locked ? '🔒' : (unlearned ? '+' : (left > 0 ? String(Math.ceil(left / 1000)) : '')));
        tb.icon.setAlpha(locked || unlearned ? 0.3 : noMana ? 0.55 : 1);
      }
    }
    // Summoner spells (cooldowns are NOT reduced by haste → total = spell cd).
    this._lv = lv;
    for (const slot of SPELL_SLOTS) {
      const sl = this.spellSlots[slot], K = slot.toUpperCase();
      const id = me['spell' + K] || '', sp = SPELLS[id] || null;
      const tb = this._touchSpells?.[slot];
      if (sl.id !== id) {
        sl.id = id;
        sl.icon.setText(sp?.icon || '·');
        sl.frame.setStrokeStyle(2, sp ? sp.color : 0x3a4a66, sp ? 0.9 : 1);
        if (tb) { tb.icon.setText(sp?.icon || '·'); tb.bg.setStrokeStyle(3, sp ? sp.color : 0x8a94a8, 0.95); }
      }
      const readyAt = me['cd' + K] || 0;
      const left = readyAt > srvNow ? readyAt - srvNow : 0;
      const hasCharges = !!(sp && sp.maxCharges > 1);
      const chg = hasCharges ? (me['charges' + K] ?? sp.maxCharges) : 0;
      if (sl.charges) {
        sl.charges.setVisible(hasCharges);
        if (hasCharges) {
          this._set(`chg_${slot}`, sl.charges, String(chg));
          const cc = chg > 0 ? '#ffd23f' : '#ff6b6b';
          if (this._cache[`chgc_${slot}`] !== cc) { this._cache[`chgc_${slot}`] = cc; sl.charges.setColor(cc); }
        }
      }
      if (readyAt !== this._cdPrev[slot]) {
        this._cdPrev[slot] = readyAt;
        if (left > 0) {
          const baseTotal = sp ? (hasCharges && chg > 0 ? (sp.castCd || 10) * 1000 : spellCooldownMs(sp, lv)) : 300;
          this.cdTotal[slot] = Math.max(left, baseTotal);
        }
      }
      sl.dim.setVisible(left > 0 || !!me.dead || !sp);
      if (sl._pie) { sl.pie.clear(); sl._pie = false; }
      if (left > 0) {
        sl._pie = true;
        const f = Math.min(1, left / this.cdTotal[slot]);
        sl.pie.fillStyle(0x000000, 0.5);
        sl.pie.slice(0, 0, 22, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2, false); sl.pie.fillPath();
        this._set(`cd_${slot}`, sl.cd, left >= 10000 ? `${Math.ceil(left / 1000)}` : (left >= 1000 ? String(Math.ceil(left / 1000)) : (left / 1000).toFixed(1)));
      } else this._set(`cd_${slot}`, sl.cd, '');
      if (tb) {
        tb.dim.setVisible(left > 0);
        this._set(`tcd_${slot}`, tb.cd, left > 0 ? String(Math.ceil(left / 1000)) : '');
        if (tb.charges) {
          tb.charges.setVisible(hasCharges);
          if (hasCharges) {
            this._set(`tchg_${slot}`, tb.charges, String(chg));
            const cc = chg > 0 ? '#ffd23f' : '#ff6b6b';
            if (this._cache[`tchgc_${slot}`] !== cc) { this._cache[`tchgc_${slot}`] = cc; tb.charges.setColor(cc); }
          }
        }
      }
    }
    // Items, gold, K/D/A, stats.
    const items = toArr(me.items);
    for (let i = 0; i < 6; i++) {
      const id = items[i] || '';
      const slot = this.items[i];
      if (slot.id !== id) { slot.id = id; slot.t.setText(ITEMS[id]?.emoji || ''); slot.fr.setStrokeStyle(1, id ? 0x6a7fa8 : 0x2c3a55, 1); }
    }
    this._set('gold', this.gold, `🪙 ${me.gold | 0}`);
    const shopCol = ctx.canShop ? '#ffe680' : '#ffd23f';
    if (this._cache.goldCol !== shopCol) { this._cache.goldCol = shopCol; this.gold.setColor(shopCol); }
    this._set('kda', this.kda, `${me.kills | 0} / ${me.deaths | 0} / ${me.assists | 0} · 🐞 ${me.cs | 0}`);
    this._set('stats', this.stats, `⚔${me.ad | 0} ✦${me.ap | 0} 🛡${me.armor | 0} 👟${me.ms | 0}`);
    const sbCol = ctx.canShop ? '#ffe680' : '#b49a3a';
    if (this._cache.shopCol !== sbCol) { this._cache.shopCol = sbCol; this.shopBtn._label.setColor(sbCol); }
    // Recall bar.
    const rec = (me.recallUntil || 0) > srvNow && !me.dead;
    this.recallBox.setVisible(rec);
    if (rec) {
      const l = me.recallUntil - srvNow;
      this.recallFill.width = 232 * Math.max(0, 1 - l / RECALL_MS);
      this._set('rec', this.recallTxt, `🏠 Recalling to the break room… ${(l / 1000).toFixed(1)}s`);
    }
    // Death overlay.
    const dead = !!me.dead && ctx.phase === 'playing';
    if (this.death.visible !== dead) { this.death.setVisible(dead); if (dead) this._deathIn(); }
    if (dead) {
      const l = Math.max(0, (me.respawnAt || 0) - srvNow);
      this._set('death', this.deathCount, l > 0 ? `Respawning in ${Math.ceil(l / 1000)} s` : 'Respawning…');
    }
  }

  setDeathTitle(text) {
    this.deathTitle.setText(text || '💀 YOU WERE PUSHED TO PRODUCTION');
    this._layoutDeath();
  }
  _layoutDeath() {
    const th = this.deathTitle.height;
    this.deathTitle.y = -8;
    this.deathCount.y = 4;
    this.deathHint.y = 4 + this.deathCount.height + 6;
    const top = -8 - th - 12, bot = this.deathHint.y + this.deathHint.height + 12;
    this.deathBand.setSize(this.W, bot - top).setPosition(0, (top + bot) / 2);
    this.deathBand.setOrigin(0.5);
  }
  /** Fade the death lines in one after another (no wall of text at the moment of death). */
  _deathIn() {
    const s = this.s, parts = [this.deathBand, this.deathTitle, this.deathCount, this.deathHint];
    s.tweens.killTweensOf(parts);
    parts.forEach((o, i) => { o.setAlpha(0); s.tweens.add({ targets: o, alpha: 1, duration: 260, delay: [0, 120, 650, 1300][i] }); });
  }
}

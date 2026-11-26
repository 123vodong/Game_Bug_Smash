// src/ui/moba/ShopPanel.js — Team Mode shop: the "Office Supply Store".
//
// Contract (.claude/context/tasks/TEAM_MODE_BREAKDOWN.md §3.4):
//   const shop = new ShopPanel(scene, { onBuy, onSell }); // onBuy(itemId) → 'buy' { item }
//                                                  // Pass 2: onSell(slot) → 'sell' { slot } — click an
//                                                  // owned item (SELL button) or right-click it
//   shop.open(); shop.close(); shop.toggle(); shop.isOpen
//   shop.update({ gold, items, canShop })          // every frame — cheap, re-renders only on change
//                                                  // items: 6-slot array or Colyseus ArraySchema
// Optional extras:
//   shop.setChampion(champId)  → "Recommended" row from CHAMPIONS[champId].build
//   shop.contains(x, y)        → true while open and the SCREEN point is over the panel
//   shop.root                  → top-level container (e.g. for a UI camera's ignore list)
//   shop.destroy()             → also runs automatically on scene shutdown
// Keys: the SCENE binds P → toggle(). The panel closes itself on ESC, deferred one
// tick, so a scene ESC handler that checks `isOpen` on the same key press still
// sees true. Pointer events on the panel are stopped (never world move orders).
// Screen-pinned (scrollFactor 0), depth 86, hidden until open(); safe to
// construct before connecting.
import { ITEMS, SHOP_ORDER, buyBlocker, recipePlan } from '../../../shared/moba/items.js';
import { CHAMPIONS } from '../../../shared/moba/champions.js';
import { INVENTORY_SLOTS, sellValue, SELL_UNDO_MS } from '../../../shared/moba/rules.js';
import { AudioManager } from '../../core/AudioManager.js';
import {
  FONT_TITLE, FONT_MONO, FONT_UI, NEON, hex, glow, pin, drawPanel, makeButton,
  fillRR, strokeRR, itemStatLine, slotAt, fmtGold,
} from './uiKit.js';

const DEPTH = 86;
const GRID_X = 16, GRID_Y = 72, HEAD_H = 17, SECTION_GAP = 4;
const TILE_W = 166, TILE_H = 49, COL_GAP = 8, ROW_GAP = 5, COLS = 5;
const GRID_W = COLS * TILE_W + (COLS - 1) * COL_GAP;
const RX = GRID_X + GRID_W + 16, RW = 264;   // right column: detail, inventory, recommended
const PW = RX + RW + 16, PH = 682;           // 39 items (1 + 10 + 28 → 9 rows of 5) → 1174 × 682
const DETAIL_H = 414;
const INV_Y = GRID_Y + DETAIL_H + 14;
const REC_Y = INV_Y + 70;
const MAX_RECIPE_COMPONENTS = Math.max(3, ...Object.values(ITEMS).map((it) => it.recipe?.length || 0));
const MAX_BUILDS_INTO = 5;
const DOUBLE_CLICK_MS = 380;
const TIERS = [
  { id: 'consumable', label: 'CONSUMABLES · used instantly', color: 0x7ed957 },
  { id: 'basic', label: 'BASIC GEAR', color: 0x7ec8ff },
  { id: 'core', label: 'CORE GEAR', color: 0xffd23f },
];
const TIER_COLOR = { consumable: 0x7ed957, basic: 0x7ec8ff, core: 0xffd23f };
const swallow = (p, x, y, ev) => ev?.stopPropagation?.();

/** Shrink a wrapped title (12 → 10 px) until it fits maxH; then ellipsize it. */
function fitTitle(t, full, maxH) {
  for (let fs = 12; fs >= 10 && t.height > maxH; fs--) t.setFontSize(fs);
  if (t.height <= maxH) return;
  const words = String(full).split(' ');
  while (words.length > 1 && t.height > maxH) { words.pop(); t.setText(`${words.join(' ')}…`); }
}

export class ShopPanel {
  constructor(scene, { onBuy, onSell } = {}) {
    this.scene = scene;
    this.onBuy = typeof onBuy === 'function' ? onBuy : null;
    this.onSell = typeof onSell === 'function' ? onSell : null;
    this._selSlot = null;                           // Pass 2: inventory slot picked for SELL
    this._boughtAt = new Array(INVENTORY_SLOTS).fill(0); // scene ms an item appeared (undo refund display)
    this._seeded = false;
    this._open = false;
    this._gold = 0;
    this._canShop = false;
    this._slots = new Array(INVENTORY_SLOTS).fill('');
    this._sel = null;
    this._hover = null;
    this._build = [];
    this._champ = null;
    this._dirty = true;
    this._last = { id: null, at: 0 };
    this._tiles = [];
    this._inv = [];
    this._rec = [];

    const { width: W, height: H } = scene.scale;
    this._left = Math.round(W / 2 - PW / 2);
    this._top = Math.round(H / 2 - PH / 2);
    this.root = scene.add.container(this._left + PW / 2, this._top + PH / 2)
      .setDepth(DEPTH).setVisible(false);
    this._body = scene.add.container(-PW / 2, -PH / 2);
    this.root.add(this._body);
    this._buildFrame();
    this._buildGrid();
    this._buildDetail();
    this._buildInventory();
    this._buildRecommended();
    pin(this.root);

    this._onEsc = () => { if (this._open) scene.time.delayedCall(0, () => this.close()); };
    scene.input.keyboard?.on('keydown-ESC', this._onEsc);
    scene.events.once('shutdown', () => this.destroy());
  }

  // ───────────────────────── public API ─────────────────────────
  get isOpen() { return this._open; }

  open() {
    if (this._open || !this.root.scene) return;
    this._open = true;
    if (!this._sel) this._sel = this._defaultSelection();
    this._render();
    const r = this.root;
    this.scene.tweens.killTweensOf(r);
    r.setVisible(true).setAlpha(0).setScale(0.96);
    this.scene.tweens.add({ targets: r, alpha: 1, scale: 1, duration: 140, ease: 'Cubic.easeOut' });
    AudioManager.uiClick();
  }

  close() {
    if (!this._open) return;
    this._open = false;
    this._hover = null;
    this._treeHover = -1;
    const r = this.root;
    if (!r.scene) return;
    this.scene.tweens.killTweensOf(r);
    this.scene.tweens.add({
      targets: r, alpha: 0, scale: 0.97, duration: 110, ease: 'Cubic.easeIn',
      onComplete: () => r.setVisible(false),
    });
  }

  toggle() { if (this._open) this.close(); else this.open(); }

  /** Feed live values. Allocation-free; marks dirty only when something changed. */
  update(s) {
    if (!s) return;
    const gold = Math.max(0, Math.floor(Number(s.gold) || 0));
    const canShop = !!s.canShop;
    let changed = false;
    if (gold !== this._gold) { this._gold = gold; changed = true; }
    if (canShop !== this._canShop) { this._canShop = canShop; changed = true; }
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const v = slotAt(s.items, i);
      if (v !== this._slots[i]) {
        this._slots[i] = v; changed = true;
        // items already owned on the first update (reconnect) never show the undo refund
        this._boughtAt[i] = v && this._seeded ? this.scene.time.now : 0;
        if (!v && this._selSlot === i) this._selSlot = null;
      }
    }
    this._seeded = true;
    // the undo window closing changes the SELL label
    if (this._selSlot != null && this._boughtAt[this._selSlot] && this.scene.time.now - this._boughtAt[this._selSlot] > SELL_UNDO_MS
      && !this._undoExpired) { this._undoExpired = true; changed = true; }
    if (changed) this._dirty = true;
    if (this._open && this._dirty) this._render();
  }

  /** Optional: show CHAMPIONS[champId].build as a "Recommended" row. */
  setChampion(champId) {
    const c = CHAMPIONS[champId] || null;
    this._champ = c;
    this._build = c && Array.isArray(c.build) ? c.build.filter((id) => ITEMS[id]).slice(0, 6) : [];
    if (!this._sel) this._sel = this._defaultSelection();
    this._dirty = true;
    if (this._open) this._render();
  }

  /** True while open and the screen point (x, y) is over the panel. */
  contains(x, y) {
    return this._open && x >= this._left && x <= this._left + PW && y >= this._top && y <= this._top + PH;
  }

  destroy() {
    this.scene?.input?.keyboard?.off('keydown-ESC', this._onEsc);
    if (this.root && this.root.scene) this.root.destroy();
    this._open = false;
  }

  // ───────────────────────── build ─────────────────────────
  _buildFrame() {
    const s = this.scene, B = this._body;
    const blocker = s.add.rectangle(0, 0, PW, PH, 0x000000, 0).setOrigin(0).setInteractive();
    blocker.on('pointerdown', swallow);
    blocker.on('pointerup', swallow);
    const g = s.add.graphics();
    drawPanel(g, 0, 0, PW, PH, { color: NEON.yellow, radius: 18, halo: 0.14, fill: 0x070b16, fillAlpha: 1 });
    g.fillStyle(NEON.yellow, 0.07);
    fillRR(g, 8, 8, PW - 16, 38, 12);
    g.lineStyle(1, 0xffffff, 0.08);
    g.lineBetween(RX - 9, GRID_Y, RX - 9, PH - 14);
    const title = s.add.text(20, 27, '🛒 OFFICE SUPPLY STORE', {
      fontFamily: FONT_TITLE, fontSize: 20, color: '#ffffff', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0, 0.5);
    title.x -= glow(title, NEON.yellow, 8);
    this._goldText = s.add.text(PW - 56, 27, '💰 0', {
      fontFamily: FONT_TITLE, fontSize: 20, color: '#ffd23f', stroke: '#000000', strokeThickness: 4,
      padding: { y: 3 },
    }).setOrigin(1, 0.5);
    // ✕ close
    const cbg = s.add.circle(PW - 28, 27, 15, 0x1a0a10, 1).setStrokeStyle(2, NEON.red, 0.9);
    const cx = s.add.text(PW - 28, 27, '✕', {
      fontFamily: FONT_UI, fontSize: 16, fontStyle: 'bold', color: '#ff8a8a',
    }).setOrigin(0.5);
    const chit = s.add.rectangle(PW - 28, 27, 38, 38, 0xffffff, 0).setInteractive({ useHandCursor: true });
    chit.on('pointerover', () => cbg.setFillStyle(0x3a0a18, 1));
    chit.on('pointerout', () => cbg.setFillStyle(0x1a0a10, 1));
    chit.on('pointerdown', swallow);
    chit.on('pointerup', (p, x, y, ev) => { ev?.stopPropagation?.(); AudioManager.uiClick(); this.close(); });
    // status line: "in base ✓" or the "return to base" banner
    this._statusG = s.add.graphics();
    this._statusText = s.add.text(PW / 2, 67, '', {
      fontFamily: FONT_MONO, fontSize: 13, fontStyle: 'bold', color: '#7ed957', padding: { y: 2 },
    }).setOrigin(0.5);
    B.add([blocker, g, title, this._goldText, cbg, cx, chit, this._statusG, this._statusText]);
  }

  _buildGrid() {
    const s = this.scene, B = this._body;
    const gridW = GRID_W;
    let y = GRID_Y;
    for (const tier of TIERS) {
      const ids = SHOP_ORDER.filter((id) => ITEMS[id] && ITEMS[id].tier === tier.id);
      if (!ids.length) continue;
      const head = s.add.text(GRID_X + 2, y + HEAD_H / 2, tier.label, {
        fontFamily: FONT_TITLE, fontSize: 11, color: hex(tier.color),
      }).setOrigin(0, 0.5);
      const line = s.add.rectangle(GRID_X + head.width + 12, y + HEAD_H / 2,
        Math.max(0, gridW - head.width - 14), 1, tier.color, 0.3).setOrigin(0, 0.5);
      B.add([head, line]);
      y += HEAD_H;
      ids.forEach((id, k) => {
        const tx = GRID_X + (k % COLS) * (TILE_W + COL_GAP);
        const ty = y + Math.floor(k / COLS) * (TILE_H + ROW_GAP);
        this._tiles.push(this._makeTile(id, tx, ty));
      });
      const rows = Math.ceil(ids.length / COLS);
      y += rows * TILE_H + (rows - 1) * ROW_GAP + SECTION_GAP;
    }
  }

  _makeTile(id, x, y) {
    const s = this.scene, it = ITEMS[id];
    const c = s.add.container(x, y);
    const bg = s.add.graphics();
    const emoji = s.add.text(24, 17, it.emoji, { fontSize: 20, padding: { y: 2 } }).setOrigin(0.5);
    const cost = s.add.text(24, 39, `${it.cost}g`, {
      fontFamily: FONT_MONO, fontSize: 10, fontStyle: 'bold', color: '#ffd23f',
    }).setOrigin(0.5);
    const name = s.add.text(48, 5, it.name, {
      fontFamily: FONT_UI, fontSize: 12, fontStyle: 'bold', color: '#ffffff', lineSpacing: -2,
      wordWrap: { width: TILE_W - 68, useAdvancedWrap: true },
    });
    fitTitle(name, it.name, TILE_H - 24);   // ≤ 2 lines, above the stat line
    const stat = s.add.text(48, TILE_H - 5, itemStatLine(it, true), {
      fontFamily: FONT_MONO, fontSize: 10, color: '#8fd0ff',
    }).setOrigin(0, 1);
    // Pass 2: 3-stat items (VPN Hoodie, Letter Opener…) — single spaces first, then shrink so the line
    // stays inside the tile.
    if (stat.width > TILE_W - 52) stat.setText(stat.text.replace(/ {2}/g, ' '));
    for (let fs = 9; fs >= 7 && stat.width > TILE_W - 52; fs--) stat.setFontSize(fs);
    const badge = s.add.text(TILE_W - 5, 4, '', {
      fontFamily: FONT_TITLE, fontSize: 10, color: '#7ed957', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(1, 0);
    const hit = s.add.rectangle(0, 0, TILE_W, TILE_H, 0xffffff, 0).setOrigin(0)
      .setInteractive({ useHandCursor: true });
    c.add([bg, emoji, cost, name, stat, badge, hit]);
    this._body.add(c);
    hit.on('pointerover', () => this._setHover(id));
    hit.on('pointerout', () => { if (this._hover === id) this._setHover(null); });
    hit.on('pointerdown', swallow);
    hit.on('pointerup', (p, lx, ly, ev) => { ev?.stopPropagation?.(); if (this._open) this._clickItem(id, p); });
    return { id, it, c, bg, emoji, cost, badge };
  }

  _buildDetail() {
    const s = this.scene, B = this._body;
    const x = RX, y = GRID_Y;
    this._treeHover = -1;
    this._intoHover = -1;
    this._detailG = s.add.graphics();
    this._treeLines = s.add.graphics();

    // 1. Top strip: BUILDS INTO (LoL-style horizontal icon row)
    this._intoLabel = s.add.text(x + 12, y + 14, 'BUILDS INTO', {
      fontFamily: FONT_TITLE, fontSize: 10, color: '#7ec8ff',
    }).setOrigin(0, 0.5);
    this._intoEmpty = s.add.text(x + 12, y + 44, 'Final tier item', {
      fontFamily: FONT_MONO, fontSize: 10, color: '#5a6f8c',
    }).setOrigin(0, 0.5);
    B.add([this._detailG, this._treeLines, this._intoLabel, this._intoEmpty]);

    this._intoNodes = [];
    const iSz = 38, iGap = 10;
    for (let i = 0; i < MAX_BUILDS_INTO; i++) {
      const ix = x + 12 + i * (iSz + iGap) + iSz / 2;
      const iy = y + 44;
      const c = s.add.container(ix, iy);
      const bg = s.add.graphics();
      const icon = s.add.text(0, 0, '', { fontSize: 20, padding: { y: 2 } }).setOrigin(0.5);
      const hit = s.add.rectangle(0, 0, iSz, iSz, 0xffffff, 0).setInteractive({ useHandCursor: true });
      const idx = i;
      hit.on('pointerover', () => { this._intoHover = idx; this._renderInlineRecipeTree(); });
      hit.on('pointerout', () => { if (this._intoHover === idx) { this._intoHover = -1; this._renderInlineRecipeTree(); } });
      hit.on('pointerdown', swallow);
      hit.on('pointerup', (p, lx, ly, ev) => {
        ev?.stopPropagation?.();
        const nd = this._intoNodes[idx];
        if (this._open && nd?.itemId) this._clickItem(nd.itemId, p);
      });
      c.add([bg, icon, hit]);
      B.add(c);
      this._intoNodes.push({ c, bg, icon, w: iSz, h: iSz, itemId: null });
    }

    // 2. Middle: REQUIRES / Recipe Tree (LoL-style icon nodes + gold cost + tree connectors)
    this._reqLabel = s.add.text(x + 12, y + 84, 'REQUIRES', {
      fontFamily: FONT_TITLE, fontSize: 10, color: '#7ec8ff',
    }).setOrigin(0, 0.5);
    this._reqHint = s.add.text(x + RW - 12, y + 84, 'L-click: view · R-click: buy', {
      fontFamily: FONT_MONO, fontSize: 8.5, color: '#6f85a3',
    }).setOrigin(1, 0.5);
    this._treeEmpty = s.add.text(x + RW / 2, y + 186, '', {
      fontFamily: FONT_MONO, fontSize: 10, color: '#5a6f8c', align: 'center',
    }).setOrigin(0.5);
    B.add([this._reqLabel, this._reqHint, this._treeEmpty]);

    // Root icon tile (selected item)
    const rSz = 44;
    const rc = s.add.container(x + RW / 2, y + 118);
    const rBg = s.add.graphics();
    const rIcon = s.add.text(0, -1, '', { fontSize: 22, padding: { y: 2 } }).setOrigin(0.5);
    const rCost = s.add.text(0, rSz / 2 + 9, '', {
      fontFamily: FONT_MONO, fontSize: 10, fontStyle: 'bold', color: '#ffd23f',
    }).setOrigin(0.5);
    const rHit = s.add.rectangle(0, 0, rSz, rSz, 0xffffff, 0).setInteractive({ useHandCursor: true });
    rHit.on('pointerdown', swallow);
    rHit.on('pointerup', (p, lx, ly, ev) => {
      ev?.stopPropagation?.();
      if (this._open && this._treeRoot?.itemId) this._clickItem(this._treeRoot.itemId, p);
    });
    rc.add([rBg, rIcon, rCost, rHit]);
    B.add(rc);
    this._treeRoot = { c: rc, bg: rBg, icon: rIcon, cost: rCost, w: rSz, h: rSz, itemId: null };

    // Component icon tiles (below root)
    this._treeNodes = [];
    const cSz = 44;
    for (let i = 0; i < MAX_RECIPE_COMPONENTS; i++) {
      const c = s.add.container(x + RW / 2, y + 194);
      const bg = s.add.graphics();
      const icon = s.add.text(0, -1, '', { fontSize: 22, padding: { y: 2 } }).setOrigin(0.5);
      const check = s.add.text(cSz / 2 - 2, -cSz / 2 + 1, '', {
        fontFamily: FONT_TITLE, fontSize: 10, color: '#7ed957', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(1, 0);
      const cost = s.add.text(0, cSz / 2 + 9, '', {
        fontFamily: FONT_MONO, fontSize: 10, fontStyle: 'bold', color: '#ffd23f',
      }).setOrigin(0.5);
      const hit = s.add.rectangle(0, 0, cSz + 10, cSz + 16, 0xffffff, 0).setInteractive({ useHandCursor: true });
      const idx = i;
      hit.on('pointerover', () => { this._treeHover = idx; this._renderInlineRecipeTree(); });
      hit.on('pointerout', () => { if (this._treeHover === idx) { this._treeHover = -1; this._renderInlineRecipeTree(); } });
      hit.on('pointerdown', swallow);
      hit.on('pointerup', (p, lx, ly, ev) => {
        ev?.stopPropagation?.();
        const nd = this._treeNodes[idx];
        if (this._open && nd?.itemId) this._clickItem(nd.itemId, p);
      });
      c.add([bg, icon, check, cost, hit]);
      B.add(c);
      this._treeNodes.push({ c, bg, icon, check, cost, w: cSz, h: cSz, itemId: null, owned: false });
    }

    // 3. Bottom: Selected Item Info + BUY / SELL button (unified inside the same LoL panel)
    const dy = y + 244;
    this._dEmoji = s.add.text(x + 32, dy + 24, '', { fontSize: 32, padding: { y: 4 } }).setOrigin(0.5);
    this._dName = s.add.text(x + 60, dy + 6, '', {
      fontFamily: FONT_TITLE, fontSize: 14, color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      wordWrap: { width: RW - 70, useAdvancedWrap: true },
    });
    this._dMeta = s.add.text(x + 60, dy + 26, '', {
      fontFamily: FONT_MONO, fontSize: 11, fontStyle: 'bold', color: '#ffd23f', padding: { y: 1 },
    });
    this._dStats = s.add.text(x + 12, dy + 50, '', {
      fontFamily: FONT_UI, fontSize: 12, fontStyle: 'bold', color: '#8fd0ff',
      wordWrap: { width: RW - 24, useAdvancedWrap: true },
    });
    this._dDesc = s.add.text(x + 12, dy + 70, '', {
      fontFamily: FONT_MONO, fontSize: 10.5, color: '#cfe3f5', lineSpacing: 1,
      wordWrap: { width: RW - 24, useAdvancedWrap: true },
    });
    this._dReason = s.add.text(x + RW / 2, y + DETAIL_H - 54, '', {
      fontFamily: FONT_MONO, fontSize: 11, fontStyle: 'bold', color: '#ff8a8a', padding: { y: 1 },
    }).setOrigin(0.5);
    B.add([this._dEmoji, this._dName, this._dMeta, this._dStats, this._dDesc, this._dReason]);

    this._buyBtn = makeButton(s, {
      x: x + RW / 2, y: y + DETAIL_H - 24, w: RW - 24, h: 36, label: 'BUY', color: NEON.green, fontSize: 15,
      onClick: () => { if (this._open) this._tryBuy(this._sel); },
    });
    this._sellBtn = makeButton(s, {
      x: x + RW / 2, y: y + DETAIL_H - 24, w: RW - 24, h: 36, label: 'SELL', color: NEON.orange, fontSize: 15,
      onClick: () => { if (this._open && this._selSlot != null) this._trySell(this._selSlot); },
    });
    this._sellBtn.root.setVisible(false);
    B.add([this._buyBtn.root, this._sellBtn.root]);
  }

  _renderInlineRecipeTree() {
    const id = this._sel;
    const it = id ? ITEMS[id] : null;
    const lines = this._treeLines;
    lines.clear();

    // 1. BUILDS INTO strip
    const upgrades = it ? SHOP_ORDER.filter((oid) => ITEMS[oid]?.recipe?.includes(id)).slice(0, MAX_BUILDS_INTO) : [];
    this._intoEmpty.setVisible(!upgrades.length).setText(it ? 'Final tier item' : '—');
    for (let i = 0; i < this._intoNodes.length; i++) {
      const nd = this._intoNodes[i];
      const oid = upgrades[i] || null;
      const target = oid ? ITEMS[oid] : null;
      nd.c.setVisible(!!target);
      nd.itemId = oid;
      if (!target) continue;
      const hov = this._intoHover === i;
      nd.bg.clear();
      nd.bg.fillStyle(hov ? 0x1a2c4b : 0x0f192c, 0.98);
      fillRR(nd.bg, -nd.w / 2, -nd.h / 2, nd.w, nd.h, 6);
      nd.bg.lineStyle(hov ? 2 : 1.4, hov ? 0xffffff : NEON.yellow, hov ? 0.95 : 0.72);
      strokeRR(nd.bg, -nd.w / 2, -nd.h / 2, nd.w, nd.h, 6);
      nd.icon.setText(target.emoji);
    }

    // 2. REQUIRES tree
    const root = this._treeRoot;
    if (!it) {
      root.c.setVisible(false); root.itemId = null;
      for (const nd of this._treeNodes) { nd.c.setVisible(false); nd.itemId = null; }
      this._treeEmpty.setText('Left-click an item to inspect').setVisible(true);
      return;
    }

    const plan = recipePlan(this._slots, id);
    const payCost = it.consumable ? it.cost : plan.cost;
    const hasComps = plan.components.length > 0;
    const rootY = hasComps ? (GRID_Y + 118) : (GRID_Y + 148);
    root.itemId = id;
    root.c.setPosition(RX + RW / 2, rootY).setVisible(true);
    const rCol = TIER_COLOR[it.tier] ?? NEON.yellow;
    root.bg.clear();
    root.bg.fillStyle(0x132038, 0.98);
    fillRR(root.bg, -root.w / 2, -root.h / 2, root.w, root.h, 7);
    root.bg.lineStyle(2, rCol, 0.95);
    strokeRR(root.bg, -root.w / 2, -root.h / 2, root.w, root.h, 7);
    root.icon.setText(it.emoji);
    root.cost.setText(fmtGold(payCost)).setColor(this._gold >= payCost ? (plan.discount > 0 ? '#7ed957' : '#ffd23f') : '#ff6b6b');

    if (!hasComps) {
      for (const nd of this._treeNodes) { nd.c.setVisible(false); nd.itemId = null; }
      this._treeEmpty.setPosition(RX + RW / 2, GRID_Y + 206)
        .setText(it.consumable ? 'Consumable · used instantly' : 'Base component · no recipe')
        .setVisible(true);
      return;
    }

    this._treeEmpty.setVisible(false);
    const counts = {};
    for (const owned of this._slots) if (owned) counts[owned] = (counts[owned] || 0) + 1;
    const n = Math.min(plan.components.length, this._treeNodes.length);
    const compY = GRID_Y + 194;
    const spread = n === 1 ? 0 : (n === 2 ? 104 : 80);
    const startX = RX + RW / 2 - ((n - 1) * spread) / 2;
    const centers = [];

    for (let i = 0; i < this._treeNodes.length; i++) {
      const nd = this._treeNodes[i];
      const cid = i < n ? plan.components[i] : null;
      const comp = cid ? ITEMS[cid] : null;
      nd.c.setVisible(!!comp);
      nd.itemId = cid;
      if (!comp) continue;
      const cx = startX + i * spread;
      nd.c.setPosition(cx, compY);
      centers.push(cx);

      const owned = (counts[cid] || 0) > 0;
      if (owned) counts[cid]--;
      nd.owned = owned;
      const hov = this._treeHover === i;
      const canBuy = !owned && this._canShop && !buyBlocker(this._slots, cid) && this._gold >= comp.cost;
      const col = owned ? NEON.green : (canBuy ? NEON.yellow : 0x3b5275);

      nd.bg.clear();
      nd.bg.fillStyle(owned ? 0x0c2416 : (hov ? 0x1a2c4b : 0x0f192c), 0.98);
      fillRR(nd.bg, -nd.w / 2, -nd.h / 2, nd.w, nd.h, 7);
      nd.bg.lineStyle(hov ? 2.2 : 1.6, hov ? 0xffffff : col, owned || canBuy || hov ? 0.95 : 0.75);
      strokeRR(nd.bg, -nd.w / 2, -nd.h / 2, nd.w, nd.h, 7);

      nd.icon.setText(comp.emoji).setAlpha(owned ? 0.65 : 1);
      nd.check.setText(owned ? '✓' : '');
      nd.cost.setText(owned ? 'OWNED' : fmtGold(comp.cost))
        .setColor(owned ? '#7ed957' : (this._gold >= comp.cost ? '#ffd23f' : '#ff6b6b'));
    }

    if (centers.length) {
      const rootBot = rootY + root.h / 2 + 16;
      const childTop = compY - 22;
      const midY = Math.round((rootBot + childTop) / 2);
      lines.lineStyle(1.8, 0x4b6a8e, 0.9);
      lines.lineBetween(RX + RW / 2, rootBot, RX + RW / 2, midY);
      if (centers.length > 1) lines.lineBetween(centers[0], midY, centers[centers.length - 1], midY);
      for (const cx of centers) lines.lineBetween(cx, midY, cx, childTop);
    }
  }

  _buildInventory() {
    const s = this.scene, B = this._body;
    const y0 = INV_Y;
    this._invLabel = s.add.text(RX + 2, y0, '', {
      fontFamily: FONT_TITLE, fontSize: 11, color: '#7ec8ff',
    }).setOrigin(0, 0.5);
    this._invG = s.add.graphics();
    B.add([this._invLabel, this._invG]);
    const size = 40, gap = (RW - size * INVENTORY_SLOTS) / Math.max(1, INVENTORY_SLOTS - 1);
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const x = RX + i * (size + gap), y = y0 + 12;
      const t = s.add.text(x + size / 2, y + size / 2, '', { fontSize: 22, padding: { y: 4 } }).setOrigin(0.5);
      const hit = s.add.rectangle(x, y, size, size, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => this._setHover(this._slots[i] || null));
      hit.on('pointerout', () => { if (this._hover && this._hover === this._slots[i]) this._setHover(null); });
      hit.on('pointerdown', swallow);
      hit.on('pointerup', (p, lx, ly, ev) => {
        ev?.stopPropagation?.();
        const id = this._slots[i];
        if (!id || !this._open) return;
        // Pass 2 RP-07: click = pick it (the detail shows SELL) · right-click = sell now
        this._selSlot = i; this._undoExpired = false;
        this._select(id);
        if (p && p.button === 2) this._trySell(i);
        else AudioManager.uiClick();
      });
      B.add([t, hit]);
      this._inv.push({ x, y, size, t });
    }
  }

  _buildRecommended() {
    const s = this.scene, B = this._body;
    const y0 = REC_Y;
    this._recLabel = s.add.text(RX + 2, y0, '⭐ RECOMMENDED', {
      fontFamily: FONT_TITLE, fontSize: 11, color: '#ffd23f', padding: { y: 3 },
    }).setOrigin(0, 0.5);
    this._recG = s.add.graphics();
    this._recRing = s.add.graphics();
    this._recNext = s.add.text(RX + RW / 2, y0 + 68, '', {
      fontFamily: FONT_MONO, fontSize: 11, color: '#cfe3f5', padding: { y: 2 },
    }).setOrigin(0.5);
    const hint = s.add.text(RX + RW / 2, PH - 16, 'L-click: select · R-click: buy / sell · P / ESC close', {
      fontFamily: FONT_MONO, fontSize: 9.5, color: '#5a6f8c',
    }).setOrigin(0.5);
    B.add([this._recLabel, this._recG, this._recRing, this._recNext, hint]);
    const size = 40, gap = (RW - size * 6) / 5;
    for (let i = 0; i < 6; i++) {
      const x = RX + i * (size + gap), y = y0 + 12;
      const t = s.add.text(x + size / 2, y + size / 2, '', { fontSize: 22, padding: { y: 4 } }).setOrigin(0.5);
      const check = s.add.text(x + size - 2, y + 1, '', {
        fontFamily: FONT_TITLE, fontSize: 10, color: '#7ed957', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(1, 0);
      const hit = s.add.rectangle(x, y, size, size, 0xffffff, 0).setOrigin(0)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => this._setHover(this._build[i] || null));
      hit.on('pointerout', () => { if (this._hover && this._hover === this._build[i]) this._setHover(null); });
      hit.on('pointerdown', swallow);
      hit.on('pointerup', (p, lx, ly, ev) => {
        ev?.stopPropagation?.();
        const id = this._build[i];
        if (id && this._open) this._clickItem(id, p);
      });
      B.add([t, check, hit]);
      this._rec.push({ x, y, size, t, check, hit });
    }
    s.tweens.add({ targets: this._recRing, alpha: { from: 0.3, to: 1 }, duration: 650, yoyo: true, repeat: -1 });
  }

  // ───────────────────────── interaction ─────────────────────────
  _setHover(id) {
    if (this._hover === id) return;
    this._hover = id;
    this._dirty = true;
    if (this._open) this._render();
  }

  _select(id) {
    this._sel = id;
    this._dirty = true;
    if (this._open) this._render();
  }

  _clickItem(id, p) {
    this._selSlot = null; // a shop tile → BUY mode
    const now = this.scene.time.now;
    const dbl = this._last.id === id && now - this._last.at < DOUBLE_CLICK_MS;
    this._last.id = id;
    this._last.at = now;
    this._select(id);
    if ((p && p.button === 2) || dbl) {
      this._last.id = null;
      this._tryBuy(id);
    } else {
      AudioManager.uiClick();
    }
  }

  _ownedCount(id) {
    let n = 0;
    for (let i = 0; i < this._slots.length; i++) if (this._slots[i] === id) n++;
    return n;
  }

  /** null when buyable, else a short player-facing reason. */
  _whyNot(id) {
    const it = ITEMS[id];
    if (!it) return 'Unknown item';
    if (!this._canShop) return '🏠 Return to base to shop';
    const b = buyBlocker(this._slots, id);
    if (b) return `⛔ ${b.charAt(0).toUpperCase()}${b.slice(1)}`;
    const cost = it.consumable ? it.cost : recipePlan(this._slots, id).cost;
    if (this._gold < cost) return `💰 Need ${fmtGold(cost - this._gold)} more gold`;
    return null;
  }

  _tryBuy(id) {
    if (!id || !ITEMS[id]) return;
    const why = this._whyNot(id);
    if (why) {
      AudioManager.skillExpire?.();
      this._buyBtn.shake();
      const r = this._dReason;
      r.setText(why).setColor(this._canShop ? '#ff8a8a' : '#ffcf8a');
      this.scene.tweens.killTweensOf(r);
      this.scene.tweens.add({ targets: r, scale: { from: 1.25, to: 1 }, duration: 220, ease: 'Back.easeOut' });
      return;
    }
    AudioManager.skillPickup?.('buff');
    const tile = this._tiles.find((t) => t.id === id);
    if (tile) this.scene.tweens.add({ targets: tile.emoji, scale: { from: 1.6, to: 1 }, duration: 280, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: this._dEmoji, scale: { from: 1.4, to: 1 }, duration: 280, ease: 'Back.easeOut' });
    try { this.onBuy?.(id); } catch (e) { console.warn('[ShopPanel] onBuy failed', e); }
  }

  /** Pass 2 RP-07: refund shown for inventory slot i (the server decides the real one). */
  _sellValue(i) {
    const it = ITEMS[this._slots[i]];
    if (!it) return 0;
    const at = this._boughtAt[i];
    return sellValue(it.cost, at || 0, at ? this.scene.time.now : 1e15);
  }

  _trySell(i) {
    const it = ITEMS[this._slots[i]];
    if (!it) return;
    if (!this._canShop) {
      AudioManager.skillExpire?.();
      this._sellBtn.shake();
      this._dReason.setText('🏠 Return to base to sell').setColor('#ffcf8a');
      return;
    }
    const sl = this._inv[i];
    if (sl) this.scene.tweens.add({ targets: sl.t, scale: { from: 1.5, to: 0 }, duration: 240, ease: 'Back.easeIn', onComplete: () => sl.t.setScale(1) });
    AudioManager.coin?.() ?? AudioManager.uiClick?.();
    try { this.onSell?.(i); } catch (e) { console.warn('[ShopPanel] onSell failed', e); }
  }

  _defaultSelection() {
    for (const id of this._build) if (!this._ownedCount(id)) return id;
    return SHOP_ORDER.find((id) => ITEMS[id]) || null;
  }

  // ───────────────────────── render (on change only) ─────────────────────────
  _render() {
    if (!this.root.scene) return;
    this._dirty = false;
    this._goldText.setText(`💰 ${fmtGold(this._gold)}`);
    this._paintStatus();
    for (const t of this._tiles) this._paintTile(t);
    this._renderInventory();
    this._renderRecommended();
    this._renderDetail();
  }

  _paintStatus() {
    const g = this._statusG;
    g.clear();
    if (this._canShop) {
      this._statusText.setText('✅ In base — click an item, then BUY (or right-click it) · click your own item to SELL')
        .setColor('#7ed957');
    } else {
      g.fillStyle(0x3a2006, 0.95);
      fillRR(g, 16, 55, PW - 32, 25, 8);
      g.lineStyle(1.5, NEON.orange, 1);
      strokeRR(g, 16, 55, PW - 32, 25, 8);
      this._statusText.setText('🏠 Return to base to shop — or shop while respawning  ·  B = recall')
        .setColor('#ffcf8a');
    }
  }

  _paintTile(t) {
    const { it, id } = t;
    const owned = this._ownedCount(id);
    const block = buyBlocker(this._slots, id);       // null for consumables
    const plan = recipePlan(this._slots, id);
    const cost = it.consumable ? it.cost : plan.cost;
    const sel = this._sel === id, hov = this._hover === id;
    const col = TIER_COLOR[it.tier] ?? 0x7ec8ff;
    const g = t.bg;
    g.clear();
    g.fillStyle(sel ? 0x17243b : (hov ? 0x111b2e : 0x0b1322), 0.97);
    fillRR(g, 0, 0, TILE_W, TILE_H, 8);
    g.lineStyle(sel ? 2.5 : 1.2, sel ? 0xffffff : col, sel ? 0.95 : (hov ? 0.85 : 0.35));
    strokeRR(g, 0, 0, TILE_W, TILE_H, 8);
    t.c.setAlpha(!this._canShop ? 0.5 : (block ? 0.45 : 1));
    t.cost.setText(`${cost}g`).setColor(this._gold >= cost ? (plan.discount > 0 ? '#7ed957' : '#ffd23f') : '#ff5e5e');
    t.badge.setText(owned ? (owned > 1 ? `✓${owned}` : '✓') : (block ? '⛔' : (plan.discount > 0 ? '⚒️' : '')));
  }

  _renderInventory() {
    const g = this._invG;
    g.clear();
    let n = 0;
    this._inv.forEach((sl, i) => {
      const it = ITEMS[this._slots[i]];
      if (it) n++;
      g.fillStyle(it ? 0x111b2e : 0x080d18, 1);
      fillRR(g, sl.x, sl.y, sl.size, sl.size, 7);
      g.lineStyle(1.5, it ? (TIER_COLOR[it.tier] ?? 0x7ec8ff) : 0x2a3850, 0.85);
      strokeRR(g, sl.x, sl.y, sl.size, sl.size, 7);
      sl.t.setText(it ? it.emoji : '');
      if (it && this._selSlot === i) { g.lineStyle(2.5, NEON.orange, 1); strokeRR(g, sl.x - 2, sl.y - 2, sl.size + 4, sl.size + 4, 8); }
    });
    this._invLabel.setText(`INVENTORY ${n}/${INVENTORY_SLOTS}`);
  }

  _renderRecommended() {
    const g = this._recG, ring = this._recRing;
    g.clear();
    ring.clear();
    const c = this._champ;
    this._recLabel.setText(c ? `⭐ RECOMMENDED · ${c.emoji} ${c.name.toUpperCase()}` : '⭐ RECOMMENDED');
    let next = null;
    this._rec.forEach((r, i) => {
      const it = ITEMS[this._build[i]];
      r.hit.setVisible(!!it);
      if (!it) { r.t.setText(''); r.check.setText(''); return; }
      const have = this._ownedCount(it.id) > 0;
      if (!have && !next) next = r;
      g.fillStyle(have ? 0x0c2414 : 0x111b2e, 1);
      fillRR(g, r.x, r.y, r.size, r.size, 7);
      g.lineStyle(1.5, have ? 0x7ed957 : (TIER_COLOR[it.tier] ?? 0x7ec8ff), have ? 0.9 : 0.5);
      strokeRR(g, r.x, r.y, r.size, r.size, 7);
      r.t.setText(it.emoji).setAlpha(have ? 0.55 : 1);
      r.check.setText(have ? '✓' : '');
      r.id = it.id;
    });
    if (next) {
      const it = ITEMS[next.id];
      const cost = it.consumable ? it.cost : recipePlan(this._slots, it.id).cost;
      ring.lineStyle(2.5, NEON.yellow, 1);
      strokeRR(ring, next.x - 3, next.y - 3, next.size + 6, next.size + 6, 9);
      this._recNext.setText(`next: ${it.emoji} ${it.name} · ${cost}g`)
        .setColor(this._gold >= cost ? '#ffd23f' : '#9fb3c8');
    } else if (this._build.length) {
      this._recNext.setText('build complete — go push! ✓').setColor('#7ed957');
    } else {
      this._recNext.setText('no build yet — anything with ✓ fits').setColor('#5a6f8c');
    }
  }

  _renderDetail() {
    const id = this._sel;
    const it = id ? ITEMS[id] : null;
    const g = this._detailG;
    g.clear();
    const col = it ? (TIER_COLOR[it.tier] ?? 0x7ec8ff) : 0x2a3850;
    g.fillStyle(0x0b1322, 0.96);
    fillRR(g, RX, GRID_Y, RW, DETAIL_H, 12);
    g.lineStyle(1.5, col, 0.75);
    strokeRR(g, RX, GRID_Y, RW, DETAIL_H, 12);
    // Horizontal section dividers (Builds Into | Requires | Item Detail)
    g.lineStyle(1, 0xffffff, 0.1);
    g.lineBetween(RX + 10, GRID_Y + 72, RX + RW - 10, GRID_Y + 72);
    g.lineBetween(RX + 10, GRID_Y + 236, RX + RW - 10, GRID_Y + 236);
    const dy = GRID_Y + 244;
    if (!it) {
      this._dEmoji.setText('🛒');
      this._dName.setText('Pick an item');
      this._dMeta.setText('');
      this._dStats.setText('');
      this._dDesc.setText('Left-click any item to inspect its recipe and stats.').setY(dy + 68);
      this._dReason.setText('');
      this._buyBtn.setLabel('BUY').setDimmed(true);
      this._renderInlineRecipeTree();
      return;
    }
    const plan = recipePlan(this._slots, id);
    const payCost = it.consumable ? it.cost : plan.cost;
    this._dEmoji.setText(it.emoji);
    this._dName.setText(it.name);
    this._dMeta.setText(plan.discount > 0
      ? `${it.tier.toUpperCase()} · 💰 ${fmtGold(payCost)} (-${fmtGold(plan.discount)}g)`
      : `${it.tier.toUpperCase()} · 💰 ${fmtGold(it.cost)}`)
      .setColor(this._gold >= payCost ? (plan.discount > 0 ? '#7ed957' : '#ffd23f') : '#ff5e5e')
      .setY(this._dName.y + this._dName.height + 2);
    this._dStats.setText(itemStatLine(it)).setY(Math.max(dy + 48, this._dMeta.y + this._dMeta.height + 5));
    this._dDesc.setText(it.desc || '').setY(this._dStats.y + this._dStats.height + 4);
    const why = this._whyNot(id);
    this._dReason.setVisible(true);
    this._dReason.setText(why || (it.consumable ? '☕ used instantly on purchase' : (plan.discount > 0 ? '⚒️ combines owned components' : '✓ ready to buy')))
      .setColor(why ? (this._canShop ? '#ff8a8a' : '#ffcf8a') : '#7ed957');
    // Pass 2 RP-07: an owned item picked from the inventory → SELL instead of BUY.
    const sellSlot = this._selSlot != null && this._slots[this._selSlot] === id ? this._selSlot : null;
    this._sellBtn.root.setVisible(sellSlot != null);
    this._buyBtn.root.setVisible(sellSlot == null);
    if (sellSlot != null) {
      const v = this._sellValue(sellSlot), undo = v >= it.cost;
      this._sellBtn.setLabel(`${undo ? 'UNDO' : 'SELL'} · +${fmtGold(v)}g`).setDimmed(!this._canShop);
      this._dReason.setText(!this._canShop ? '🏠 Return to base to sell' : (undo ? '↩ just bought — full refund' : '💸 sells for 70% · right-click to sell'))
        .setColor(!this._canShop ? '#ffcf8a' : '#ffb347');
      this._renderInlineRecipeTree();
      return;
    }
    this._buyBtn.setLabel(`${plan.discount > 0 ? 'UPGRADE' : 'BUY'} · ${fmtGold(payCost)}g`).setDimmed(!!why);
    this._renderInlineRecipeTree();
  }
}

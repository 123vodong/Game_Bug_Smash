// Fallbacks — bare-bones versions of the §3.4 UI modules (ShopPanel, Scoreboard,
// EndScreen). TeamModeScene uses the real ones from src/ui/moba/* when they load;
// these only keep a match playable if those files are missing or broken.
// Same interfaces as the contract; screen-pinned, depth 80–95.
import { ITEMS, SHOP_ORDER, buyBlocker } from '../../../shared/moba/items.js';
import { CHAMPIONS } from '../../../shared/moba/champions.js';
import { TEAM_INFO } from '../../../shared/moba/rules.js';
import { FONT, MONO, toArr } from './mobaGfx.js';

const pin = (o, d) => o.setScrollFactor(0).setDepth(d);

export class FallbackShopPanel {
  constructor(scene, { onBuy }) {
    this.s = scene; this.onBuy = onBuy;
    const W = scene.scale.width;
    // 8 columns × 4 rows of 76 × 80 cells: room for 32 items (SHOP_ORDER has 31)
    const COLS = 8, CW = 76, CH = 80, PW = 16 * 2 + COLS * CW - 6, rows = Math.ceil(SHOP_ORDER.length / COLS);
    this.c = pin(scene.add.container(W / 2 - PW / 2, 80), 85).setVisible(false);
    const bg = scene.add.rectangle(0, 0, PW, 50 + rows * CH + 10, 0x0a0f18, 0.96).setOrigin(0).setStrokeStyle(2, 0xffd23f, 0.9).setInteractive();
    bg.on('pointerdown', (p, x, y, ev) => ev?.stopPropagation?.());
    this.title = scene.add.text(16, 12, '🛒 OFFICE SUPPLY STORE', { fontFamily: FONT, fontSize: 18, color: '#ffd23f' });
    this.note = scene.add.text(PW - 16, 16, '', { fontFamily: MONO, fontSize: 12, color: '#ff8a8a' }).setOrigin(1, 0);
    this.c.add([bg, this.title, this.note]);
    this.cells = SHOP_ORDER.map((id, i) => {
      const it = ITEMS[id], x = 16 + (i % COLS) * CW, y = 50 + Math.floor(i / COLS) * CH;
      const box = scene.add.rectangle(x, y, CW - 6, CH - 6, 0x131b2a, 1).setOrigin(0).setStrokeStyle(1, 0x3a4a66, 1).setInteractive({ useHandCursor: true });
      const em = scene.add.text(x + 35, y + 22, it.emoji, { fontSize: 24 }).setOrigin(0.5);
      const nm = scene.add.text(x + 35, y + 47, it.name, { fontFamily: MONO, fontSize: 9, color: '#dfe7f5', align: 'center', wordWrap: { width: 66 } }).setOrigin(0.5);
      const cost = scene.add.text(x + 35, y + 66, `🪙 ${it.cost}`, { fontFamily: FONT, fontSize: 10, color: '#ffd23f' }).setOrigin(0.5);
      box.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); this.onBuy?.(id); });
      this.c.add([box, em, nm, cost]);
      return { id, box, cost };
    });
  }
  open() { this.c.setVisible(true); }
  close() { this.c.setVisible(false); }
  toggle() { this.c.setVisible(!this.c.visible); }
  get isOpen() { return this.c.visible; }
  update({ gold = 0, items = [], canShop = false } = {}) {
    if (!this.c.visible) return;
    const note = canShop ? '' : 'Visit your break room (or be dead) to buy';
    if (this.note.text !== note) this.note.setText(note);
    for (const cell of this.cells) {
      const ok = canShop && gold >= ITEMS[cell.id].cost && !buyBlocker(items, cell.id);
      cell.box.setAlpha(ok ? 1 : 0.45);
    }
  }
}

export class FallbackScoreboard {
  constructor(scene) {
    this.s = scene;
    const W = scene.scale.width;
    this.c = pin(scene.add.container(W / 2 - 360, 100), 88).setVisible(false);
    this.bg = scene.add.rectangle(0, 0, 720, 420, 0x05080f, 0.93).setOrigin(0).setStrokeStyle(2, 0x39c2ff, 0.8);
    this.txt = scene.add.text(16, 14, '', { fontFamily: MONO, fontSize: 14, color: '#dfe7f5', lineSpacing: 8 });
    this.c.add([this.bg, this.txt]);
  }
  show() { this.c.setVisible(true); }
  hide() { this.c.setVisible(false); }
  update(state, localSid) {
    if (!this.c.visible || !state?.champions) return;
    const lines = [];
    for (const team of ['blue', 'red']) {
      lines.push(`${TEAM_INFO[team].emoji} ${TEAM_INFO[team].name.toUpperCase()}   kills ${team === 'blue' ? state.blueKills : state.redKills}`);
      state.champions.forEach((c, id) => {
        if (c.team !== team) return;
        const items = toArr(c.items).map((i) => ITEMS[i]?.emoji || '·').join('');
        lines.push(`${id === localSid ? '▶' : ' '} ${CHAMPIONS[c.champ]?.emoji || '?'} ${String(c.name).padEnd(12).slice(0, 12)} Lv${String(c.level).padStart(2)}  ${c.kills}/${c.deaths}/${c.assists}  🐞${String(c.cs).padStart(3)}  ${items}${c.dead ? '  💀' : ''}`);
      });
      lines.push('');
    }
    const s = lines.join('\n');
    if (this.txt.text !== s) this.txt.setText(s);
  }
}

export class FallbackEndScreen {
  constructor(scene, { onPlayAgain, onMenu }) { this.s = scene; this.onPlayAgain = onPlayAgain; this.onMenu = onMenu; }
  show({ winner, myTeam, rows }) {
    const s = this.s, W = s.scale.width, H = s.scale.height;
    const won = winner === myTeam;
    const c = pin(s.add.container(0, 0), 92);
    const dim = s.add.rectangle(0, 0, W, H, 0x000000, 0.8).setOrigin(0).setInteractive();
    dim.on('pointerdown', (p, x, y, ev) => ev?.stopPropagation?.());
    const title = s.add.text(W / 2, 90, won ? '🏆 VICTORY — SHIPPED!' : '💀 DEFEAT — PRODUCTION IS DOWN', {
      fontFamily: FONT, fontSize: 38, color: won ? '#ffd23f' : '#ff8a8a', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5);
    const list = (rows || []).map((r) => `${r.isMe ? '▶' : ' '} ${TEAM_INFO[r.team]?.emoji || ''} ${CHAMPIONS[r.champ]?.emoji || ''} ${String(r.name).padEnd(12).slice(0, 12)} Lv${r.level}  ${r.kills}/${r.deaths}/${r.assists}  🐞${r.cs}`).join('\n');
    const body = s.add.text(W / 2, 140, list, { fontFamily: MONO, fontSize: 14, color: '#dfe7f5', lineSpacing: 6 }).setOrigin(0.5, 0);
    const mk = (x, label, color, fn) => {
      const b = s.add.text(x, H - 70, label, { fontFamily: FONT, fontSize: 20, color, backgroundColor: '#111a28', padding: { x: 16, y: 8 } })
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      b.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); fn?.(); });
      return b;
    };
    c.add([dim, title, body, mk(W / 2 - 130, '▶ PLAY AGAIN', '#7ed957', this.onPlayAgain), mk(W / 2 + 130, '☰ MENU', '#c9d3e6', this.onMenu)]);
    this.c = c;
  }
}

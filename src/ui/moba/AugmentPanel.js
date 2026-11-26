// src/ui/moba/AugmentPanel.js — 3-card Code Augment picker overlay (Lv 5, 10, 15).
// Screen-pinned, depth 92, supports 1 free reroll per pick + synergy hints.
import { AUGMENTS, RARITY_COLOR, AUGMENT_SYNERGIES } from '../../../shared/moba/augments.js';
import { FONT_TITLE, FONT_MONO, FONT_UI, hex, pin, drawPanel, makeButton } from './uiKit.js';

const DEPTH = 92;

export class AugmentPanel {
  constructor(scene, { onPick, onReroll } = {}) {
    this.scene = scene;
    this.onPick = onPick;
    this.onReroll = onReroll;
    this.isOpen = false;
    this._sig = '';
    this.root = scene.add.container(0, 0).setDepth(DEPTH).setVisible(false);
    pin(this.root);
    scene.events.once('shutdown', () => this.destroy());
  }

  update(offer, owned = []) {
    if (!offer || !Array.isArray(offer.choices) || !offer.choices.length) {
      if (this.isOpen) this.hide();
      return;
    }
    const sig = `${offer.level}:${offer.rerolls}:${(offer.slotRerolls || []).join(',')}:${offer.choices.join(',')}:${(owned || []).join(',')}`;
    if (sig === this._sig && this.isOpen) return;
    this._sig = sig;
    this._render(offer, owned || []);
    this.isOpen = true;
    this.root.setVisible(true);
  }

  hide() {
    this.isOpen = false;
    this._sig = '';
    this.root.setVisible(false);
    this.root.removeAll(true);
  }

  _render(offer, owned) {
    this.root.removeAll(true);
    const s = this.scene;
    const { width: W, height: H } = s.scale;
    const ownedSet = new Set(owned);

    const dim = s.add.rectangle(0, 0, W, H, 0x050812, 0.72).setOrigin(0).setInteractive();
    dim.on('pointerdown', (p, lx, ly, ev) => ev?.stopPropagation?.());
    this.root.add(dim);

    const header = s.add.text(W / 2, 92, `CODE AUGMENT — LEVEL ${offer.level}`, {
      fontFamily: FONT_TITLE, fontSize: 28, color: '#ffd23f', stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5);
    const sub = s.add.text(W / 2, 128, 'Choose 1 permanent upgrade for the rest of the match', {
      fontFamily: FONT_MONO, fontSize: 13, color: '#bfd0ea',
    }).setOrigin(0.5);
    this.root.add([header, sub]);

    const cardW = 310, cardH = 340, gap = 28;
    const totalW = offer.choices.length * cardW + (offer.choices.length - 1) * gap;
    const x0 = W / 2 - totalW / 2;
    const cy = 160;

    offer.choices.forEach((id, i) => {
      const a = AUGMENTS[id];
      if (!a) return;
      const col = RARITY_COLOR[a.rarity] || 0x39c2ff;
      const cx = x0 + i * (cardW + gap);
      const card = s.add.container(cx, cy);
      const bg = s.add.rectangle(0, 0, cardW, cardH, 0x0d1424, 0.96).setOrigin(0).setStrokeStyle(2.5, col, 0.92);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => bg.setFillStyle(0x16223d, 0.98).setStrokeStyle(3.5, 0xffffff, 1));
      bg.on('pointerout', () => bg.setFillStyle(0x0d1424, 0.96).setStrokeStyle(2.5, col, 0.92));
      bg.on('pointerdown', (p, lx, ly, ev) => {
        if (p.rightButtonDown?.()) return;
        ev?.stopPropagation?.();
        this.onPick?.(a.id);
      });

      const rar = s.add.text(14, 14, `${a.rarity.toUpperCase()} · ${a.group.toUpperCase()}`, {
        fontFamily: FONT_MONO, fontSize: 11, color: hex(col),
      });
      const icon = s.add.text(cardW / 2, 82, a.icon || '⚡', { fontSize: 44 }).setOrigin(0.5);
      const name = s.add.text(cardW / 2, 134, a.name, {
        fontFamily: FONT_TITLE, fontSize: 18, color: '#ffffff', stroke: '#000', strokeThickness: 3, align: 'center', wordWrap: { width: cardW - 24 },
      }).setOrigin(0.5);
      const desc = s.add.text(cardW / 2, 198, a.desc, {
        fontFamily: FONT_UI, fontSize: 13, color: '#d5e2f5', align: 'center', wordWrap: { width: cardW - 32 }, lineSpacing: 4,
      }).setOrigin(0.5);

      const syn = AUGMENT_SYNERGIES.find((sy) => sy.requires.includes(a.id) && sy.requires.some((r) => r !== a.id && ownedSet.has(r)));
      const synTxt = s.add.text(cardW / 2, 274, syn ? `SYNERGY: ${syn.name}` : '', {
        fontFamily: FONT_MONO, fontSize: 11, color: '#39ff14', align: 'center',
      }).setOrigin(0.5);

      const pickHint = s.add.text(cardW / 2, cardH - 22, 'CLICK TO SELECT', {
        fontFamily: FONT_TITLE, fontSize: 12, color: hex(col),
      }).setOrigin(0.5);

      card.add([bg, rar, icon, name, desc, synTxt, pickHint]);
      this.root.add(card);

      if ((offer.slotRerolls?.[i] || 0) > 0) {
        const srr = makeButton(s, {
          x: cx + cardW / 2, y: cy + cardH + 28, w: 150, h: 32,
          label: '↻ REROLL', color: 0x39c2ff, fontSize: 13,
          onClick: () => this.onReroll?.(i),
        });
        this.root.add(srr);
      }
    });

    if (!Array.isArray(offer.slotRerolls) && (offer.rerolls || 0) > 0) {
      const rr = makeButton(s, {
        x: W / 2, y: cy + cardH + 46, w: 220, h: 42,
        label: `REROLL (${offer.rerolls} FREE)`, color: 0x39c2ff,
        onClick: () => this.onReroll?.(),
      });
      this.root.add(rr);
    }
    pin(this.root);
  }

  destroy() {
    this.root?.destroy();
    this.root = null;
  }
}

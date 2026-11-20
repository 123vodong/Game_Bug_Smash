// LevelSelectPanel — campaign level picker with best stars (EP-14 menu part).
// Stars are written by HuntScene's win screen via Progress.campaignClear(levelId, stars)
// (SaveManager.levelStars); old saves show 1★ for any level with a saved best score.
//
//   LevelSelectPanel.open(scene, { onPlay: (levelIndex) => … , onClose });
import { SaveManager } from '../core/SaveManager.js';
import { LEVELS, TOTAL_LEVELS } from '../data/levels.js';
import { Modal, NEON, FONT_HEAD, label, hex } from './panelKit.js';

const WORLD_NAMES = { 1: 'Junior Dev Hell', 2: 'Feature Creep', 3: 'Legacy Codebase', 4: 'AI-Assisted Chaos' };
const WORLD_COLORS = { 1: NEON.green, 2: NEON.cyan, 3: NEON.purple, 4: NEON.pink };

export const LevelSelectPanel = {
  open(scene, { onPlay, onClose } = {}) {
    const m = new Modal(scene, { w: 1060, h: 640, title: '🗂 LEVELS', accent: NEON.green, onClose });
    const c = m.body;
    const stars = SaveManager.getAllLevelStars();
    const unlocked = SaveManager.getUnlockedIndex();
    const allOpen = unlocked >= TOTAL_LEVELS || SaveManager.isCampaignCleared();
    const total = Object.values(stars).reduce((a, s) => a + s, 0);
    c.add(label(scene, 0, -m.h / 2 + 70, `★ ${total}/${TOTAL_LEVELS * 3}   ·   ★ clear   ★★ beat the deadline with time to spare   ★★★ way ahead of it`, {
      fontSize: 14, color: '#ffd23f',
    }).setOrigin(0.5));

    const worlds = [...new Set(LEVELS.map((l) => l.world))];
    const rowH = 118, cardW = 236, cardH = 104, gap = 14;
    const top = -m.h / 2 + 100;
    worlds.forEach((w, wi) => {
      const y = top + wi * rowH + cardH / 2;
      const col = WORLD_COLORS[w] || NEON.cyan;
      c.add(scene.add.text(-500, y - 14, `WORLD ${w}`, {
        fontFamily: FONT_HEAD, fontSize: 18, color: hex(col), stroke: '#000', strokeThickness: 3,
      }).setOrigin(0, 0.5));
      c.add(label(scene, -500, y + 12, WORLD_NAMES[w] || '', { fontSize: 13, color: '#aab8c8' }).setOrigin(0, 0.5));
      LEVELS.map((l, i) => ({ l, i })).filter((x) => x.l.world === w).forEach(({ l, i }, k) => {
        const x = -250 + cardW / 2 + k * (cardW + gap);
        const open = allOpen || i <= unlocked;
        const s = stars[l.id] || 0;
        const isNext = !allOpen && i === unlocked;
        const card = scene.add.container(x, y);
        const g = scene.add.graphics();
        const draw = (hover) => {
          g.clear();
          g.fillStyle(open ? (hover ? 0x14233a : 0x0d1626) : 0x0a0d14, 1);
          g.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 12);
          g.lineStyle(isNext ? 3 : 2, open ? col : NEON.grey, open ? (hover || isNext ? 1 : 0.6) : 0.35);
          g.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 12);
        };
        draw(false);
        card.add(g);
        card.add(scene.add.text(-cardW / 2 + 14, -cardH / 2 + 18, l.id, {
          fontFamily: FONT_HEAD, fontSize: 22, color: open ? '#ffffff' : '#5a6a80', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0, 0.5));
        const nm = String(l.name || '').replace(/^World\s*\d+-\d+\s*·\s*/, '');
        card.add(label(scene, -cardW / 2 + 14, -2, nm, {
          fontSize: 14, color: open ? '#dfe8f0' : '#5a6a80', wordWrap: { width: cardW - 24 },
        }).setOrigin(0, 0.5));
        if (open) {
          card.add(scene.add.text(-cardW / 2 + 14, cardH / 2 - 22, '★'.repeat(s) + '☆'.repeat(3 - s), {
            fontFamily: FONT_HEAD, fontSize: 22, color: s ? '#ffd23f' : '#4a5668', stroke: '#000', strokeThickness: 2,
          }).setOrigin(0, 0.5));
          const best = SaveManager.getLevelBest(l.id);
          card.add(label(scene, cardW / 2 - 14, cardH / 2 - 22, isNext ? 'NEXT ▶' : best ? `best ${best}` : '', {
            fontSize: 13, color: isNext ? hex(col) : '#8fa8b8', ...(isNext ? { fontFamily: FONT_HEAD } : {}),
          }).setOrigin(1, 0.5));
        } else {
          card.add(scene.add.text(cardW / 2 - 22, -cardH / 2 + 20, '🔒', { fontSize: 18 }).setOrigin(0.5));
          card.add(label(scene, -cardW / 2 + 14, cardH / 2 - 22, 'clear the level before', { fontSize: 12, color: '#5a6a80' }).setOrigin(0, 0.5));
        }
        const hit = scene.add.rectangle(0, 0, cardW, cardH, 0xffffff, 0).setInteractive({ useHandCursor: open });
        if (open) {
          hit.on('pointerover', () => draw(true));
          hit.on('pointerout', () => draw(false));
          hit.on('pointerup', () => { m.close(true); onPlay?.(i); });
        }
        card.add(hit);
        c.add(card);
      });
    });
    m.pin();
    return m;
  },
};

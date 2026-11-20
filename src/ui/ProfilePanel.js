// ProfilePanel — "👤 CAREER": lifetime stats per mode, the hat collection (progress + EQUIP;
// the equipped hat is worn in Personal AND Team), the daily-mission streak and today's missions.
//
//   import { ProfilePanel } from '../ui/ProfilePanel.js';
//   ProfilePanel.open(this, { tab: 'hats', onClose });   // tab: stats | hats | today
import { SaveManager } from '../core/SaveManager.js';
import { Progress } from '../core/Progress.js';
import { HATS, hatById, isHatUnlocked, hatProgress, nextHat } from '../data/cosmetics.js';
import { MISSION_MODES, dayKey } from '../data/missions.js';
import { TOTAL_LEVELS } from '../data/levels.js';
import { Modal, NEON, FONT_HEAD, label, tabs, bar, hex, pinTree } from './panelKit.js';

// Mirrors MultiPlayScene LEVEL_TITLES (server career ladder) — display only.
const LEVEL_TITLES = ['Intern', 'Fresher', 'Junior', 'Middle', 'Senior', 'Super Senior'];

function fmtTime(ms) {
  const m = Math.floor((ms || 0) / 60000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export const ProfilePanel = {
  open(scene, { tab = 'stats', onClose } = {}) {
    const m = new Modal(scene, { w: 1040, h: 640, title: '👤 CAREER', accent: NEON.yellow, onClose });
    const content = scene.add.container(0, 0);
    m.body.add(content);
    tabs(scene, m.body, -m.h / 2 + 84, [
      { id: 'stats', text: 'STATS' },
      { id: 'hats', text: 'HATS' },
      { id: 'today', text: 'TODAY' },
    ], tab, (id) => {
      content.removeAll(true);
      if (id === 'stats') buildStats(scene, content);
      else if (id === 'hats') buildHats(scene, content);
      else buildToday(scene, content);
      m.pin();
    }, NEON.yellow);
    return m;
  },
};

function header(scene, c, y) {
  const name = SaveManager.getPlayerName() || 'New hire';
  const hat = hatById(SaveManager.getHat());
  const streak = SaveManager.getLiveStreak(dayKey());
  const best = SaveManager.getCareer().bestStreak;
  c.add(label(scene, -480, y, `${hat.emoji ? hat.emoji + ' ' : ''}${name}`, {
    fontSize: 22, fontFamily: FONT_HEAD, color: '#ffffff', stroke: '#000', strokeThickness: 3,
  }).setOrigin(0, 0.5));
  c.add(label(scene, 480, y, `🔥 streak ${streak} day${streak === 1 ? '' : 's'} · best ${best}`, {
    fontSize: 16, color: streak > 0 ? '#ffb347' : '#8fa8b8',
  }).setOrigin(1, 0.5));
}

function card(scene, c, x, y, w, h, title, rows, color) {
  const g = scene.add.graphics();
  g.fillStyle(0x0d1626, 1);
  g.fillRoundedRect(x - w / 2, y, w, h, 12);
  g.lineStyle(2, color, 0.7);
  g.strokeRoundedRect(x - w / 2, y, w, h, 12);
  c.add(g);
  c.add(scene.add.text(x, y + 22, title, {
    fontFamily: FONT_HEAD, fontSize: 17, color: hex(color), stroke: '#000', strokeThickness: 3,
  }).setOrigin(0.5));
  rows.forEach(([k, v], i) => {
    const yy = y + 58 + i * 34;
    c.add(label(scene, x - w / 2 + 18, yy, k, { fontSize: 15, color: '#aab8c8' }).setOrigin(0, 0.5));
    c.add(label(scene, x + w / 2 - 18, yy, String(v), { fontSize: 17, color: '#ffffff', fontFamily: FONT_HEAD }).setOrigin(1, 0.5));
  });
}

function buildStats(scene, c) {
  header(scene, c, -190);
  const k = SaveManager.getCareer();
  const lvl = Math.max(1, Math.min(6, k.maxLevel || 1));
  const winRate = k.teamGames ? `${Math.round((k.teamWins / k.teamGames) * 100)}%` : '—';
  const w = 318, y = -158;
  card(scene, c, -335, y, w, 400, '🌐 PERSONAL', [
    ['Bugs smashed', k.bugs], ['Laptops broken (KOs)', k.kos], ['Burnouts', k.deaths],
    ['Peak title', `Lv${lvl} ${LEVEL_TITLES[lvl - 1]}`], ['Best combo', `×${k.bestCombo}`],
    ['Best score', k.bestScore], ['Deadlines defeated', k.bosses], ['Time at the office', fmtTime(k.playMs)],
    ['Shifts', k.sessions],
  ].slice(0, 9), NEON.green);
  card(scene, c, 0, y, w, 400, '⚔️ TEAM 5v5', [
    ['Online matches', k.teamGames], ['Wins', k.teamWins], ['Win rate', winRate],
    ['Takedowns', k.teamTakedowns], ['Practice matches', k.teamPractice],
  ], NEON.purple);
  card(scene, c, 335, y, w, 400, '🎯 CAMPAIGN', [
    ['Levels cleared', `${Math.min(k.campaignLevels, TOTAL_LEVELS)}/${TOTAL_LEVELS}`],
    ['Stars', `${k.campaignStars}/${TOTAL_LEVELS * 3} ★`],
    ['Best score', SaveManager.getHighScore()],
    ['Campaign beaten', SaveManager.isCampaignCleared() ? 'yes 🎉' : 'not yet'],
  ], NEON.cyan);
}

function buildHats(scene, c) {
  const career = SaveManager.getCareer();
  const owned = HATS.filter((h) => h.unlock && isHatUnlocked(h, career)).length;
  c.add(label(scene, 0, -192, `${owned}/${HATS.length - 1} hats unlocked · cosmetic only · worn in Personal and Team 5v5`, {
    fontSize: 15, color: '#ffd23f',
  }).setOrigin(0.5));
  const grid = scene.add.container(0, 0);
  c.add(grid);
  const info = label(scene, 0, 262, 'Tap a hat to wear it. Locked hats show how to earn them.', {
    fontSize: 15, color: '#aab8c8', align: 'center',
  }).setOrigin(0.5);
  c.add(info);

  const cols = 6, cw = 156, ch = 124, gap = 8;
  const draw = () => {
    grid.removeAll(true);
    const equipped = SaveManager.getHat();
    HATS.forEach((h, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = -((cols * cw + (cols - 1) * gap) / 2) + cw / 2 + col * (cw + gap);
      const y = -160 + ch / 2 + row * (ch + gap);
      const ok = isHatUnlocked(h, career);
      const on = (h.id || '') === (equipped || '');
      const cell = scene.add.container(x, y);
      const g = scene.add.graphics();
      g.fillStyle(on ? 0x2a2410 : 0x0d1626, 1);
      g.fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 10);
      g.lineStyle(on ? 3 : 1, on ? NEON.yellow : (ok ? NEON.cyan : NEON.grey), on ? 1 : 0.6);
      g.strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 10);
      cell.add(g);
      const emo = scene.add.text(0, -30, h.emoji || '🚫', { fontSize: 32 }).setOrigin(0.5).setAlpha(ok ? 1 : 0.35);
      cell.add(emo);
      if (!ok) cell.add(scene.add.text(cw / 2 - 18, -ch / 2 + 16, '🔒', { fontSize: 15 }).setOrigin(0.5));
      cell.add(label(scene, 0, 8, h.name, { fontSize: 13, color: ok ? '#ffffff' : '#8a94a8', fontFamily: FONT_HEAD }).setOrigin(0.5));
      if (h.unlock) {
        const p = hatProgress(h, career);
        cell.add(bar(scene, -cw / 2 + 14, 24, cw - 28, 8, p.frac, ok ? NEON.green : NEON.cyan));
        cell.add(label(scene, 0, 44, on ? 'WEARING' : ok ? 'tap to wear' : `${p.cur}/${p.at}`, {
          fontSize: 13, color: on ? '#ffd23f' : ok ? '#7ed957' : '#00cfff',
        }).setOrigin(0.5));
      } else {
        cell.add(label(scene, 0, 36, on ? 'WEARING' : 'tap to wear', { fontSize: 13, color: on ? '#ffd23f' : '#7ed957' }).setOrigin(0.5));
      }
      const hit = scene.add.rectangle(0, 0, cw, ch, 0xffffff, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        if (!ok) {
          const p = hatProgress(h, career);
          info.setText(`🔒 ${h.emoji} ${h.name}: ${h.unlock.label} (${p.cur}/${p.at})`).setColor('#00cfff');
          return;
        }
        SaveManager.setHat(h.id);
        info.setText(h.id ? `${h.emoji} ${h.name} equipped — you'll wear it in Personal and Team 5v5.` : 'Hat off. Bold.')
          .setColor('#7ed957');
        draw();
      });
      cell.add(hit);
      grid.add(cell);
    });
    pinTree(grid);
  };
  draw();
}

function buildToday(scene, c) {
  header(scene, c, -190);
  const missions = Progress.today();
  const done = missions.filter((x) => x.done).length;
  c.add(label(scene, -480, -142, `TODAY'S MISSIONS · ${done}/${missions.length}`, {
    fontSize: 17, fontFamily: FONT_HEAD, color: '#ffd23f',
  }).setOrigin(0, 0.5));
  missions.forEach((ms, i) => {
    const y = -96 + i * 66;
    const mode = MISSION_MODES[ms.mode] || MISSION_MODES.arena;
    const g = scene.add.graphics();
    g.fillStyle(0x0d1626, 1);
    g.fillRoundedRect(-480, y - 26, 960, 56, 10);
    g.lineStyle(1, ms.done ? NEON.green : NEON.cyan, 0.6);
    g.strokeRoundedRect(-480, y - 26, 960, 56, 10);
    c.add(g);
    c.add(scene.add.text(-450, y, mode.icon, { fontSize: 24 }).setOrigin(0.5));
    c.add(label(scene, -420, y - 8, ms.text, { fontSize: 17, color: ms.done ? '#8fa8b8' : '#ffffff' }).setOrigin(0, 0.5));
    c.add(label(scene, -420, y + 14, mode.label, { fontSize: 12, color: '#5a7a90' }).setOrigin(0, 0.5));
    c.add(bar(scene, 160, y - 5, 200, 10, ms.progress / ms.goal, ms.done ? NEON.green : NEON.cyan));
    c.add(label(scene, 460, y, ms.done ? '✓ done' : `${ms.progress}/${ms.goal}`, {
      fontSize: 17, color: ms.done ? '#7ed957' : '#00cfff', fontFamily: FONT_HEAD,
    }).setOrigin(1, 0.5));
  });
  const streak = SaveManager.getLiveStreak(dayKey());
  c.add(label(scene, 0, 112, done === missions.length
    ? `All done today 🎉 Come back tomorrow to keep the ${streak}-day streak.`
    : `Finish all ${missions.length} today to ${streak > 0 ? `extend your ${streak}-day streak` : 'start a streak'}. 📅 3 days and 🦄 7 days unlock hats.`, {
    fontSize: 15, color: '#ffb347', align: 'center', wordWrap: { width: 900 },
  }).setOrigin(0.5));
  const nh = nextHat(SaveManager.getCareer());
  if (nh) {
    c.add(label(scene, 0, 170, `Next hat: ${nh.hat.emoji} ${nh.hat.name} — ${nh.hat.unlock.label} (${nh.cur}/${nh.at})`, {
      fontSize: 16, color: '#ffd23f', align: 'center', wordWrap: { width: 900 },
    }).setOrigin(0.5));
    c.add(bar(scene, -200, 196, 400, 10, nh.frac, NEON.yellow));
  } else {
    c.add(label(scene, 0, 170, 'Every hat unlocked. HR is concerned.', { fontSize: 16, color: '#ffd23f' }).setOrigin(0.5));
  }
}

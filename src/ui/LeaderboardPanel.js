// LeaderboardPanel — "🏆 OFFICE RANKS": your Team Mode rank
// (tier · division · LP · W/L · placement progress), the tier ladder, and the top 50 (pages of 20).
//
//   import { LeaderboardPanel } from '../ui/LeaderboardPanel.js';
//   LeaderboardPanel.open(this, { onClose });
// Data: POST /api/me + GET /api/rank/top (src/core/Identity.js). Offline → a friendly note.
import { Modal, NEON, FONT_HEAD, FONT_MONO, label, button, hex } from './panelKit.js';
import { fetchMe, fetchLeaderboard } from '../core/Identity.js';
import { TIERS, PLACEMENT_GAMES, rankOf } from '../../shared/moba/ranks.js';

const PAGE = 20;

export const LeaderboardPanel = {
  open(scene, { onClose } = {}) {
    const m = new Modal(scene, { w: 1040, h: 640, title: '🏆 OFFICE RANKS · TEAM MODE', accent: NEON.yellow, onClose });
    const status = label(scene, 0, 0, 'loading the rankings…', { fontSize: 16, color: '#8fa8b8' }).setOrigin(0.5);
    m.body.add(status);
    m.pin();
    Promise.all([fetchMe(), fetchLeaderboard()]).then(([me, top]) => {
      if (m.closed) return;
      status.destroy();
      if (!me && !top) {
        m.body.add(label(scene, 0, 0, "📡 Can't reach the ranking server.\nRanks are kept by the online server — try again when it is up.", {
          fontSize: 16, color: '#ff8a8a', align: 'center',
        }).setOrigin(0.5));
        m.pin();
        return;
      }
      build(scene, m, me, Array.isArray(top) ? top : []);
    });
    return m;
  },
};

function build(scene, m, me, top) {
  const c = scene.add.container(0, 0);
  m.body.add(c);
  const y0 = -m.h / 2 + 70;
  // ── your rank card ──
  const r = me?.rank;
  const g = scene.add.graphics();
  g.fillStyle(0x0d1626, 1); g.fillRoundedRect(-490, y0, 980, 96, 14);
  const tier = r ? TIERS.find((t) => t.id === r.tier) || TIERS[0] : TIERS[0];
  g.lineStyle(2, r ? tier.color : NEON.grey, 0.9); g.strokeRoundedRect(-490, y0, 980, 96, 14);
  c.add(g);
  if (r) {
    const big = label(scene, -466, y0 + 30, `${tier.emoji} ${r.label}`, { fontFamily: FONT_HEAD, fontSize: 26, color: tier.css, stroke: '#000', strokeThickness: 4 }).setOrigin(0, 0.5);
    c.add(big);
    // stars (5 per division — the 5th one promotes you)
    c.add(label(scene, big.x + big.width + 16, y0 + 30, r.starText || '', { fontFamily: 'Arial, sans-serif', fontSize: 28, color: '#ffd23f', stroke: '#000', strokeThickness: 4 }).setOrigin(0, 0.5));
    const sub = `${r.lp} LP${r.place ? `  ·  #${r.place} in the office` : ''}`
      + (r.placementLeft > 0 ? `  ·  placement ${r.games}/${PLACEMENT_GAMES}: you climb fast` : `  ·  peak ${rankOf(r.peak, PLACEMENT_GAMES).label}`);
    c.add(label(scene, -466, y0 + 68, sub, { fontSize: 14, color: '#ffd23f' }).setOrigin(0, 0.5));
    const wr = r.games ? Math.round((r.wins / r.games) * 100) : 0;
    const streak = r.streak > 1 ? `  ·  🔥 ${r.streak} wins in a row` : (r.streak < -1 ? `  ·  ${-r.streak} losses in a row` : '');
    c.add(label(scene, 466, y0 + 30, `${r.wins}W ${r.losses}L  (${wr}%)`, { fontFamily: FONT_HEAD, fontSize: 20, color: '#ffffff' }).setOrigin(1, 0.5));
    c.add(label(scene, 466, y0 + 68, `${r.games} ranked match${r.games === 1 ? '' : 'es'}${streak}`, { fontSize: 13, color: '#8fa8b8' }).setOrigin(1, 0.5));
    { // LP bar
      const bw = 300, bx = -40, by = y0 + 66;
      const bg = scene.add.graphics();
      bg.fillStyle(0x1a2233, 1); bg.fillRoundedRect(bx, by - 5, bw, 10, 5);
      bg.fillStyle(tier.color, 1); bg.fillRoundedRect(bx, by - 5, Math.max(6, bw * Math.min(1, r.lp / 100)), 10, 5);
      c.add(bg);
    }
  } else {
    c.add(label(scene, 0, y0 + 48, 'Your rank shows up here once the server answers.', { fontSize: 15, color: '#8fa8b8' }).setOrigin(0.5));
  }
  // ── tier ladder ──
  const ly = y0 + 122;
  const step = 980 / TIERS.length;
  TIERS.forEach((t, i) => {
    const x = -490 + step * i + step / 2;
    const on = !!r && t.id === r.tier;
    const tg = scene.add.graphics();
    tg.fillStyle(on ? t.color : 0x111a2b, on ? 0.35 : 1); tg.fillRoundedRect(x - step / 2 + 4, ly - 16, step - 8, 32, 8);
    tg.lineStyle(1.5, t.color, on ? 1 : 0.5); tg.strokeRoundedRect(x - step / 2 + 4, ly - 16, step - 8, 32, 8);
    c.add(tg);
    c.add(label(scene, x, ly, `${t.emoji} ${t.name}`, { fontSize: 13, color: t.css, fontFamily: FONT_HEAD }).setOrigin(0.5));
  });
  c.add(label(scene, 0, ly + 30, 'Start: Intern IV. Win ≈ +1 ★ (more while you climb), loss ≈ −1 ★. Team MVP on a win: +1 ★ · best on a losing team: half the loss. 5 ★ = next division.', {
    fontSize: 12, color: '#6f86a6',
  }).setOrigin(0.5));
  // ── top list ──
  const listY = ly + 58;
  const list = scene.add.container(0, 0);
  c.add(list);
  let page = 0;
  const pages = Math.max(1, Math.ceil(top.length / PAGE));
  const pageTxt = label(scene, 0, m.h / 2 - 34, '', { fontSize: 13, color: '#8fa8b8' }).setOrigin(0.5);
  c.add(pageTxt);
  const render = () => {
    list.removeAll(true);
    if (!top.length) {
      list.add(label(scene, 0, listY + 80, 'Nobody has played a ranked match yet — win one (quick play or custom rooms) to top the board! 🥇', {
        fontSize: 15, color: '#ffd23f',
      }).setOrigin(0.5));
    }
    const rows = top.slice(page * PAGE, page * PAGE + PAGE);
    rows.forEach((p, k) => {
      const col = k < 10 ? 0 : 1, row = k % 10;
      const x = col ? 10 : -490, y = listY + row * 26;
      const n = page * PAGE + k + 1;
      const mine = me && p.id === me.id;
      const t = TIERS.find((q) => q.id === p.tier) || TIERS[0];
      const bg = scene.add.graphics();
      bg.fillStyle(mine ? 0x3a2f0a : (row % 2 ? 0x0b1220 : 0x0d1626), 1); bg.fillRoundedRect(x, y - 11, 480, 23, 6);
      list.add(bg);
      const medal = n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : `${n}.`;
      list.add(label(scene, x + 12, y, medal, { fontSize: 13, color: '#cfe3f5' }).setOrigin(0, 0.5));
      list.add(label(scene, x + 52, y, `${String(p.name || 'Player').slice(0, 16)}${mine ? '  (you)' : ''}`, { fontSize: 13, color: mine ? '#ffd23f' : '#ffffff' }).setOrigin(0, 0.5));
      list.add(label(scene, x + 250, y, `${t.emoji} ${p.label}`, { fontSize: 12, color: t.css }).setOrigin(0, 0.5));
      list.add(label(scene, x + 470, y, `${p.starText || ''}  ${p.wins}W`, { fontSize: 15, color: '#ffd23f', fontFamily: 'Arial, sans-serif' }).setOrigin(1, 0.5));
    });
    pageTxt.setText(pages > 1 ? `page ${page + 1} / ${pages}` : `${top.length} ranked player${top.length === 1 ? '' : 's'}`);
    m.pin();
  };
  if (pages > 1) {
    c.add(button(scene, -110, m.h / 2 - 34, 70, 34, '◀', { color: NEON.yellow, fontSize: 16, onClick: () => { page = (page + pages - 1) % pages; render(); } }));
    c.add(button(scene, 110, m.h / 2 - 34, 70, 34, '▶', { color: NEON.yellow, fontSize: 16, onClick: () => { page = (page + 1) % pages; render(); } }));
  }
  void hex; void FONT_MONO;
  render();
}

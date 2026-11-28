// hud/scoreboard.js - STANDUP BOARD (TAB, hold): both teams, champion, spells, rank, augments, level, K/D/A/CS, items, gold, towers.
// createScoreboard({root, source}) -> {set(on), isOpen(), update(now) (<= 4 Hz repaint while open), dispose()}
import { CHAMPIONS } from '../../../shared/moba/champions.js';
import { ITEMS } from '../../../shared/moba/items.js';
import { SPELLS } from '../../../shared/moba/spells.js';
import { AUGMENTS } from '../../../shared/moba/augments.js';
import { TEAM_INFO, TEAM_SIZE, INVENTORY_SLOTS } from '../../../shared/moba/rules.js';
import { t, onLangChange } from '../../core/I18n.js';
import { esc } from './tooltip.js';

const toArr = (a) => (!a ? [] : Array.isArray(a) ? a : Array.from(a));
const LANE_ORDER = ['top', 'jungle', 'mid', 'bot', 'support'];
const laneRank = (champId) => {
  const lane = CHAMPIONS[champId] && CHAMPIONS[champId].lane;
  const i = LANE_ORDER.indexOf(lane);
  return i < 0 ? LANE_ORDER.length : i;
};

export function createScoreboard({ root, source }) {
  const box = document.createElement('div'); box.className = 'bsx-board'; box.hidden = true; root.appendChild(box);
  let open = false, nextAt = 0, cacheAt = 0, disposed = false;
  const goldSeen = new Map();
  const tcss = (t0) => (TEAM_INFO[t0] && TEAM_INFO[t0].css) || (t0 === 'blue' ? '#39c2ff' : '#ff5e5e');

  function snapshotGold() {
    const st = (source.kind === 'offline' && source.sim && source.sim.state) || source.state();
    if (!st || !st.champions || !st.champions.forEach) return;
    st.champions.forEach((c, id) => { if (c && c.gold != null) goldSeen.set(id, c.gold | 0); });
  }

  function paint() {
    const st = (source.kind === 'offline' && source.sim && source.sim.state) || source.state(); if (!st || !st.champions) return;
    const rows = [], seen = new Set();
    st.champions.forEach((c, id) => {
      seen.add(id);
      if (c && c.gold != null) goldSeen.set(id, c.gold | 0);
      rows.push({ id, c });
    });
    if (st.scores && st.scores.forEach) st.scores.forEach((c, id) => { if (!seen.has(id)) rows.push({ id, c, hiddenRow: true }); });
    const me = source.localId;
    const myChamp = st.champions.get ? st.champions.get(me) : null;
    const myTeam = myChamp ? myChamp.team : '';
    const tot = { blue: { k: 0, g: 0, tw: 0 }, red: { k: 0, g: 0, tw: 0 } };
    if (st.structures && st.structures.forEach) {
      st.structures.forEach((s) => {
        if (s && s.kind === 'tower' && s.alive !== false && tot[s.team]) tot[s.team].tw++;
      });
    }
    const blueInfo = TEAM_INFO.blue || { emoji: '🚀', name: 'Startup' };
    const redInfo = TEAM_INFO.red || { emoji: '🏢', name: 'MegaCorp' };
    const bk = st.blueKills | 0, rk = st.redKills | 0;
    const order = (a, b) => (laneRank(a.c.champ) - laneRank(b.c.champ)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

    let colsHtml = '';
    for (const team of ['blue', 'red']) {
      const info = TEAM_INFO[team] || { emoji: '', name: team };
      const list = rows.filter((r) => r.c.team === team).sort(order);
      for (const r of list) {
        const g = r.c.gold != null && !r.hiddenRow ? (r.c.gold | 0) : (goldSeen.get(r.id) || 0);
        tot[team].g += g;
      }
      const kills = team === 'blue' ? bk : rk;
      const yours = team === myTeam ? ` <span class="sbt-you">★ ${esc(t('sb.yourTeam'))}</span>` : '';
      let rowsHtml = '';
      for (let i = 0; i < TEAM_SIZE; i++) {
        const entry = list[i];
        if (!entry) {
          rowsHtml += '<div class="sbr empty"><span class="nm">— open seat —</span></div>';
          continue;
        }
        const { id, c, hiddenRow } = entry;
        const d = CHAMPIONS[c.champ], its = toArr(c.items);
        const augs = Array.isArray(c.augments) ? c.augments : (typeof c.augmentsCsv === 'string' && c.augmentsCsv ? c.augmentsCsv.split(',') : toArr(c.augments));
        const nm = (c.isBot ? '🤖 ' : '') + esc(c.name || id);
        const rk = !c.isBot && c.rank ? ` · ${esc(c.rank)}` : '';
        const sp = [c.spellD, c.spellF].map((sid) => (SPELLS[sid] ? SPELLS[sid].icon : '')).join('');
        const augStr = augs.map((a) => (AUGMENTS[a] ? AUGMENTS[a].icon : '')).join('');
        const subLine = `${d ? esc(d.name) : esc(c.champ || '')}${sp ? ` ${sp}` : ''}${rk}${augStr ? ` · ${augStr}` : ''}${c.dead ? ' · 💀' : ''}`;
        let goldHtml = '?';
        if (c.gold != null && !hiddenRow) goldHtml = String(c.gold | 0);
        else if (goldSeen.has(id)) goldHtml = `<span class="seen">~${goldSeen.get(id)}</span>`;
        let itemHtml = '';
        for (let slot = 0; slot < INVENTORY_SLOTS; slot++) {
          const x = !hiddenRow ? its[slot] : '';
          itemHtml += x && ITEMS[x] ? `<i title="${esc(ITEMS[x].name)}">${ITEMS[x].emoji}</i>` : '<i class="e"></i>';
        }
        rowsHtml += `<div class="sbr${id === me ? ' me' : ''}${c.dead ? ' dead' : ''}" style="--tc:${tcss(team)}">`
          + `<span class="nm"><em>${d ? d.emoji : '🐞'}${c.dead ? '<sub>💀</sub>' : ''}</em><span><b>${nm}</b><small class="sub">${subLine}</small></span></span>`
          + `<span class="lv">${c.level | 0}</span>`
          + `<span class="kda">${c.kills | 0} / ${c.deaths | 0} / ${c.assists | 0}</span>`
          + `<span class="cs">${c.cs | 0}</span>`
          + `<span class="gd">${goldHtml}</span>`
          + `<span class="it">${itemHtml}</span>`
          + `</div>`;
      }
      colsHtml += `<div class="sbcol">`
        + `<div class="sbt" style="--tc:${tcss(team)}"><b>${info.emoji || ''} ${esc((info.name || team).toUpperCase())}${yours}</b><span>${kills} ${esc(t('sb.kills'))} · 🏰 ${tot[team].tw} ${esc(t('sb.towers'))} · 🪙 ${tot[team].g}</span></div>`
        + `<div class="sbh"><span class="nm">CHAMPION</span><span class="lv">LV</span><span class="kda">K / D / A</span><span class="cs">CS</span><span class="gd">GOLD</span><span class="it">ITEMS</span></div>`
        + rowsHtml
        + `</div>`;
    }

    box.innerHTML = `<div class="sbhead"><span class="sbl">SCOREBOARD</span>`
      + `<div class="sbscore"><b style="color:${tcss('blue')}">${blueInfo.emoji} ${esc(blueInfo.name.toUpperCase())}</b>`
      + `<strong>${bk}</strong><i>⚔</i><strong>${rk}</strong>`
      + `<b style="color:${tcss('red')}">${esc(redInfo.name.toUpperCase())} ${redInfo.emoji}</b></div>`
      + `<span class="sbrh">hold TAB</span></div>`
      + `<div class="sbcols">${colsHtml}</div>`
      + `<div class="sbfoot">🤖 = AI coworker · 💀 = respawning · K / D / A = kills / deaths / assists · CS = bugs last-hit</div>`;
  }
  const offLang = onLangChange(() => { if (open) paint(); });
  return {
    set(on) { on = !!on; if (on === open) return; open = on; box.hidden = !on; if (on) { paint(); nextAt = Date.now() + 250; } },
    isOpen: () => open,
    update(now) {
      if (disposed) return;
      if (!open) {
        if (now >= cacheAt) { cacheAt = now + 500; snapshotGold(); }
        return;
      }
      if (now < nextAt) return;
      nextAt = now + 250; paint();
    },
    dispose() { disposed = true; offLang(); box.remove(); },
  };
}

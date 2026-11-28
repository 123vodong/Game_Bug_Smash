// hud/scoreboard.js - STANDUP BOARD (TAB, hold): both teams, champion, spells, rank, augments, level, K/D/A/CS, items, gold, towers.
// createScoreboard({root, source}) -> {set(on), isOpen(), update(now) (<= 4 Hz repaint while open), dispose()}
import { CHAMPIONS } from '../../../shared/moba/champions.js';
import { ITEMS } from '../../../shared/moba/items.js';
import { SPELLS } from '../../../shared/moba/spells.js';
import { AUGMENTS } from '../../../shared/moba/augments.js';
import { TEAM_INFO } from '../../../shared/moba/rules.js';
import { esc } from './tooltip.js';

const toArr = (a) => (!a ? [] : Array.isArray(a) ? a : Array.from(a));
const JOKES = ['Yesterday: smashed bugs. Today: smash more bugs. Blockers: the other team.', 'Standup: keep it under 15 minutes. The bugs disagree.', 'Reminder: "it works on my machine" is not a build strategy.', 'Burndown chart: it is mostly down.'];

export function createScoreboard({ root, source }) {
  const box = document.createElement('div'); box.className = 'bsx-board bsh-pop'; box.hidden = true; root.appendChild(box);
  let open = false, nextAt = 0, cacheAt = 0, disposed = false, joke = JOKES[0];
  const goldSeen = new Map();
  const tcss = (t) => (TEAM_INFO[t] && TEAM_INFO[t].css) || (t === 'blue' ? '#39c2ff' : '#ff5e5e');

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
    let h = '';
    for (const team of ['blue', 'red']) {
      const info = TEAM_INFO[team] || { emoji: '', name: team };
      const list = rows.filter((r) => r.c.team === team).sort((a, b) => (b.c.kills | 0) - (a.c.kills | 0) || (a.c.deaths | 0) - (b.c.deaths | 0));
      for (const r of list) {
        const g = r.c.gold != null && !r.hiddenRow ? (r.c.gold | 0) : (goldSeen.get(r.id) || 0);
        tot[team].g += g;
      }
      const kills = team === 'blue' ? st.blueKills | 0 : st.redKills | 0;
      const yours = team === myTeam ? ' <span class="sbt-you">★ YOUR TEAM</span>' : '';
      h += `<div class="sbt" style="--tc:${tcss(team)}"><b>${info.emoji || ''} ${esc(info.name || team)}${yours}</b><span>${kills} bugs squashed · 🗼 ${tot[team].tw} · 🪙 ${tot[team].g}</span></div>`;
      h += '<div class="sbh"><span class="nm">ENGINEER</span><span class="sp">DF</span><span class="lv">LV</span><span class="kda">K / D / A</span><span class="cs">🐞</span><span class="it">LOADOUT</span><span class="ag">AUG</span><span class="gd">GOLD</span></div>';
      for (const { id, c, hiddenRow } of list) {
        const d = CHAMPIONS[c.champ], its = toArr(c.items), augs = toArr(c.augments);
        const nm = esc(c.name || id) + (c.isBot ? ' <i>(bot)</i>' : '');
        const rk = c.rank ? ` <span class="sbr-rk">${esc(c.rank)}</span>` : '';
        const spD = SPELLS[c.spellD], spF = SPELLS[c.spellF];
        const spHtml = `<i title="${esc(spD ? spD.name : '')}">${spD ? spD.icon : '·'}</i><i title="${esc(spF ? spF.name : '')}">${spF ? spF.icon : '·'}</i>`;
        const augHtml = augs.map((a) => (AUGMENTS[a] ? `<i title="${esc(AUGMENTS[a].name)}">${AUGMENTS[a].icon}</i>` : '')).join('');
        let goldHtml = '?';
        if (c.gold != null && !hiddenRow) goldHtml = String(c.gold | 0);
        else if (goldSeen.has(id)) goldHtml = `<span class="seen" title="Last seen gold">~${goldSeen.get(id)}</span>`;
        h += `<div class="sbr${id === me ? ' me' : ''}${c.dead ? ' dead' : ''}" style="--tc:${tcss(team)}"><span class="nm"><em>${d ? d.emoji : '🐞'}</em>${nm}${rk}<small>${d ? esc(d.name) : esc(c.champ || '')}${c.dead ? ' · 💀 pushed to prod' : ''}</small></span><span class="sp">${spHtml}</span><span class="lv">${c.level | 0}</span><span class="kda">${c.kills | 0} / ${c.deaths | 0} / ${c.assists | 0}</span><span class="cs">${c.cs | 0}</span><span class="it">${hiddenRow ? '' : its.map((x) => (ITEMS[x] ? `<i title="${esc(ITEMS[x].name)}">${ITEMS[x].emoji}</i>` : '<i class="e"></i>')).join('')}</span><span class="ag">${augHtml}</span><span class="gd">${goldHtml}</span></div>`;
      }
    }
    box.innerHTML = `<div class="sbtitle">📋 STANDUP BOARD <small>hold TAB · bugs squashed / reverts / assists</small></div>${h}<div class="sbjoke">${esc(joke)}</div>`;
  }
  return {
    set(on) { on = !!on; if (on === open) return; open = on; box.hidden = !on; if (on) { joke = JOKES[Math.floor(Math.random() * JOKES.length)]; paint(); nextAt = Date.now() + 250; } },
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
    dispose() { disposed = true; box.remove(); },
  };
}

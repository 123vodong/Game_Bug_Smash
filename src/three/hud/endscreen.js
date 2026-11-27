// hud/endscreen.js - match result: DEPLOYED TO PROD / ROLLED BACK banner, stats table, MVP, PLAY AGAIN + BACK.
// createEndScreen({root, source, hooks:{onPlayAgain, onExit}}) -> {update(st, phase, srvNow), isOpen(), show(payload?), hide(), dispose()}
// Opens ~2 s after state.phase==='ended' with a winner (lets the core explosion + announce banner play first). Rank result (online) arrives as source 'rank'.
import { CHAMPIONS } from '../../../shared/moba/champions.js';
import { ITEMS } from '../../../shared/moba/items.js';
import { TEAM_INFO } from '../../../shared/moba/rules.js';
import { esc } from './tooltip.js';

const toArr = (a) => (!a ? [] : Array.isArray(a) ? a : Array.from(a));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const WIN = ['Merged to main, CI is green. Go home early.', 'Shipped on a Friday. Nothing broke. Legendary.', 'Zero bugs in prod. (Theirs, on the other hand...)'];
const LOSE = ['Root cause: skill issue. Action items: 47.', 'It worked on your machine. It did not work in prod.', 'Your Production Server crashed. Post-mortem at 9am.'];
const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const kda = (r) => ((r.kills + r.assists) / Math.max(1, r.deaths));
const score = (r) => kda(r) * 10 + r.kills * 2 + (r.gold || 0) / 400 + r.cs / 25; // same MVP formula as ui/moba/EndScreen.js

export function createEndScreen({ root, source, hooks = {} }) {
  const box = document.createElement('div'); box.className = 'bsx-end bsh-pop'; box.hidden = true; root.appendChild(box);
  let open = false, endedSince = 0, cached = null, rank = null, disposed = false, fired = false;
  const offRank = source.on ? source.on('rank', (m) => { if (disposed) return; rank = m && typeof m === 'object' ? m : null; if (open && cached) paint(); }) : null;
  const call = (name, fallback) => { if (fired) return; fired = true; try { if (typeof hooks[name] === 'function') hooks[name](); else fallback(); } catch (e) { console.warn('[endscreen]', name, e); fired = false; } };
  box.addEventListener('click', (e) => {
    const t = e.target.closest('[data-a]'); if (!t) return;
    if (t.dataset.a === 'again') call('onPlayAgain', () => location.reload());
    else if (t.dataset.a === 'exit') call('onExit', () => { location.href = location.pathname; });
    else if (t.dataset.a === 'hide') { box.hidden = true; box.classList.add('min'); }
  });

  function collect(st, srvNow) {
    const rows = [], seen = new Set(), me = source.localId;
    const add = (c, id) => { if (seen.has(id)) return; seen.add(id); rows.push({ id, team: c.team, name: c.name || id, champ: c.champ, level: c.level | 0, kills: c.kills | 0, deaths: c.deaths | 0, assists: c.assists | 0, cs: c.cs | 0, gold: c.gold | 0, items: toArr(c.items), isBot: !!c.isBot, isMe: id === me }); };
    st.champions.forEach(add);
    if (st.scores && st.scores.forEach) st.scores.forEach((c, id) => { if (!seen.has(id)) add({ ...c, items: [], gold: 0 }, id); }); // bush-hidden players still count
    let mvp = null, best = -Infinity; for (const r of rows) { const s = score(r); if (s > best) { best = s; mvp = r; } }
    const mine = st.champions.get(me), myTeam = mine ? mine.team : 'blue';
    return { rows, mvp: mvp && mvp.id, myTeam, winner: st.winner, reason: String(st.winReason || ''), dur: st.startedAt ? Math.max(0, srvNow - st.startedAt) : 0, practice: source.kind === 'offline' };
  }

  function paint() {
    const p = cached, won = p.winner === p.myTeam, info = TEAM_INFO[p.winner] || { name: p.winner, emoji: '' };
    const title = won ? '🚀 DEPLOYED TO PROD' : '↩️ ROLLED BACK', sub = p.reason === 'rollback' ? (won ? 'They asked for last Friday\'s build. Granted.' : 'Rollback approved. See you at the retro.') : (won ? pick(WIN) : pick(LOSE));
    const mk = (team) => {
      const ti = TEAM_INFO[team] || { name: team, emoji: '', css: '#fff' }, list = p.rows.filter((r) => r.team === team).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      return `<div class="et" style="--tc:${ti.css || '#fff'}"><b>${ti.emoji || ''} ${esc(ti.name || team)}${team === p.winner ? ' · SHIPPED' : ' · CRASHED'}</b></div>` + list.map((r) => { const d = CHAMPIONS[r.champ]; return `<div class="er${r.isMe ? ' me' : ''}${r.id === p.mvp ? ' mvp' : ''}" style="--tc:${ti.css || '#fff'}"><span class="nm">${r.id === p.mvp ? '⭐ ' : ''}<em>${d ? d.emoji : '🐞'}</em>${esc(r.name)}${r.isBot ? ' <i>(bot)</i>' : ''}</span><span>Lv${r.level}</span><span class="k">${r.kills}/${r.deaths}/${r.assists}</span><span>🐞${r.cs}</span><span>🪙${r.gold}</span><span class="it">${r.items.map((x) => (ITEMS[x] ? ITEMS[x].emoji : '')).join('')}</span></div>`; }).join('');
    };
    const mvp = p.rows.find((r) => r.id === p.mvp), mc = mvp && CHAMPIONS[mvp.champ];
    const rk = rank ? `<div class="erank">${rank.labelAfter ? 'Rank: <b>' + esc(rank.labelAfter) + '</b>' : ''} ${Number.isFinite(rank.delta) ? `<span style="color:${rank.delta >= 0 ? '#7ed957' : '#ff8a8a'}">${rank.delta >= 0 ? '+' : ''}${rank.delta} LP</span>` : ''}</div>` : (p.practice ? '<div class="erank dim">Practice match: unranked, your standup has no consequences.</div>' : '');
    box.innerHTML = `<div class="end-box ${won ? 'win' : 'lose'}"><div class="end-t">${title}</div><div class="end-s">${esc(info.emoji || '')} ${esc(info.name || '')} pushed to production · ${fmt(p.dur)} · ${esc(sub)}</div>`
      + (mvp ? `<div class="end-mvp">⭐ MVP: ${mc ? mc.emoji : ''} <b>${esc(mvp.name)}</b> ${mvp.kills}/${mvp.deaths}/${mvp.assists} · 🐞 ${mvp.cs}</div>` : '')
      + `<div class="end-tbl">${mk(p.myTeam)}${mk(p.myTeam === 'blue' ? 'red' : 'blue')}</div>${rk}<div class="end-b"><button class="bsh-btn yes" data-a="again">▶ PLAY AGAIN</button><button class="bsh-btn" data-a="exit">← BACK TO MENU</button><button class="bsh-btn" data-a="hide">view map</button></div></div>`;
  }

  return {
    update(st, phase, srvNow) {
      if (disposed) return;
      if (phase !== 'ended' || !st || !st.winner) { if (open) { open = false; box.hidden = true; endedSince = 0; cached = null; fired = false; box.classList.remove('min'); } else endedSince = 0; return; }
      const now = Date.now(); if (!endedSince) endedSince = now;
      if (!open && now - endedSince >= 1800) { cached = collect(st, srvNow || now); open = true; box.hidden = false; paint(); }
    },
    isOpen: () => open && !box.hidden,
    show(st, srvNow) { cached = collect(st, srvNow || Date.now()); open = true; box.hidden = false; paint(); },
    hide() { open = false; box.hidden = true; },
    dispose() { disposed = true; try { offRank && offRank(); } catch (_) { /* ignore */ } box.remove(); },
  };
}

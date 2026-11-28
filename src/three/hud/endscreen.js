// hud/endscreen.js - match result: DEPLOYED TO PROD / ROLLED BACK banner, stats table, MVP, YOUR SHIFT strip, Progress, COPY RESULT, PLAY AGAIN + BACK.
// createEndScreen({root, source, hooks:{onPlayAgain, onExit}, toast}) -> {update(st, phase, srvNow), isOpen(), show(payload?), hide(), dispose()}
// Opens ~1.8 s after state.phase==='ended' with a winner (lets the core explosion + announce banner play first). Rank result (online) arrives as source 'rank'.
import { CHAMPIONS } from '../../../shared/moba/champions.js';
import { ITEMS } from '../../../shared/moba/items.js';
import { TEAM_INFO } from '../../../shared/moba/rules.js';
import { Progress } from '../../core/Progress.js';
import { SaveManager } from '../../core/SaveManager.js';
import { AudioManager } from '../../core/AudioManager.js';
import { HATS, hatProgress, isHatUnlocked } from '../../data/cosmetics.js';
import { esc } from './tooltip.js';

const toArr = (a) => (!a ? [] : Array.isArray(a) ? a : Array.from(a));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const WIN = ['Merged to main, CI is green. Go home early.', 'Shipped on a Friday. Nothing broke. Legendary.', 'Zero bugs in prod. (Theirs, on the other hand...)'];
const LOSE = ['Root cause: skill issue. Action items: 47.', 'It worked on your machine. It did not work in prod.', 'Your Production Server crashed. Post-mortem at 9am.'];
const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const kda = (r) => ((r.kills + r.assists) / Math.max(1, r.deaths));
const kdaStr = (r) => (r.deaths === 0 ? (r.kills + r.assists > 0 ? '∞' : '0.0') : kda(r).toFixed(1));
const score = (r) => kda(r) * 10 + r.kills * 2 + (r.gold || 0) / 400 + r.cs / 25; // same MVP formula as ui/moba/EndScreen.js

export function createEndScreen({ root, source, hooks = {}, toast = () => {} }) {
  const box = document.createElement('div'); box.className = 'bsx-end bsh-pop'; box.hidden = true; root.appendChild(box);
  let open = false, endedSince = 0, cached = null, rank = null, disposed = false, fired = false, counted = false, gains = { missions: [], hats: [] }, subLine = '';
  const offRank = source.on ? source.on('rank', (m) => { if (disposed) return; rank = m && typeof m === 'object' ? m : null; if (open && cached) paint(); }) : null;
  const call = (name, fallback) => { if (fired) return; fired = true; try { if (typeof hooks[name] === 'function') hooks[name](); else fallback(); } catch (e) { console.warn('[endscreen]', name, e); fired = false; } };

  function recordProgress(p) {
    const out = { missions: [], hats: [] };
    if (!p || !p.winner || !p.myTeam) return out;
    const won = p.winner === p.myTeam;
    const me = p.rows.find((r) => r.isMe) || null;
    const td = me ? (me.kills | 0) + (me.assists | 0) : 0;
    const merge = (r) => { if (r) { out.missions.push(...(r.missions || [])); out.hats.push(...(r.hats || [])); } };
    const step = (fn) => { try { merge(fn()); } catch (e) { console.warn('[endscreen] Progress step failed:', e?.message); } };
    if (p.practice) {
      step(() => Progress.add('teamPractice', 1, { daily: 'teamGames' }));
      if (won) step(() => Progress.track('teamWins', 1));
    } else {
      step(() => Progress.add('teamGames', 1, { daily: true }));
      if (won) step(() => Progress.add('teamWins', 1, { daily: true }));
    }
    if (td > 0) step(() => Progress.add('teamTakedowns', td, { daily: true }));
    const uniq = (arr) => arr.filter((x, i) => x && arr.findIndex((y) => y && y.id === x.id) === i);
    out.missions = uniq(out.missions);
    out.hats = uniq(out.hats);
    return out;
  }

  function resultText(p) {
    const won = p.winner === p.myTeam;
    const kills = { blue: 0, red: 0 };
    for (const r of p.rows) if (kills[r.team] !== undefined) kills[r.team] += (r.kills | 0);
    const word = won ? '🏆 VICTORY' : '💀 DEFEAT';
    const me = p.rows.find((r) => r.isMe);
    const champ = me ? CHAMPIONS[me.champ] : null;
    const mins = p.dur ? ` · ${fmt(p.dur)}` : '';
    const mine = me ? ` · ${champ ? `${champ.emoji} ${champ.name}` : 'me'} ${me.kills}/${me.deaths}/${me.assists} (${kdaStr(me)} KDA) · ${me.cs} CS` : '';
    const rsn = p.reason === 'rollback' ? ' (rollback)' : p.reason === 'abandon' ? ' (abandoned)' : '';
    return `🐞 Bug Smash Office Siege: ${word}${rsn}${p.practice ? ' (practice)' : ''} · ${TEAM_INFO.blue.emoji} ${kills.blue} ⚔ ${kills.red} ${TEAM_INFO.red.emoji}${mine}${mins} — ${location.origin}${location.pathname}`;
  }

  async function copyResult(btn) {
    if (!cached) return;
    const text = resultText(cached);
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (_) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch (_) { ok = false; }
    }
    AudioManager.uiClick?.();
    toast(ok ? '📋 Match result copied to clipboard!' : 'Could not copy result', ok ? '#7ed957' : '#ff8a8a', 2000);
    if (btn) {
      btn.textContent = ok ? '✓ COPIED' : 'COPY FAILED';
      setTimeout(() => { if (!disposed && btn.isConnected) btn.textContent = '📋 COPY RESULT'; }, 1800);
    }
  }

  box.addEventListener('click', (e) => {
    const t = e.target.closest('[data-a]'); if (!t) return;
    if (t.dataset.a === 'again') { AudioManager.uiClick?.(); call('onPlayAgain', () => location.reload()); }
    else if (t.dataset.a === 'exit') { AudioManager.uiClick?.(); call('onExit', () => { location.href = location.pathname + '?scene=menu&renderer=3d'; }); }
    else if (t.dataset.a === 'copy') copyResult(t);
    else if (t.dataset.a === 'hide') { AudioManager.uiClick?.(); box.hidden = true; box.classList.add('min'); }
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

  function buildShiftHtml(p) {
    const me = p.rows.find((r) => r.isMe);
    const hl = [];
    if (me) {
      const team = p.rows.filter((r) => r.team === me.team);
      const td = (r) => (r.kills | 0) + (r.assists | 0);
      if (me.id === p.mvp) hl.push(['⭐', 'MATCH MVP', 'the whole floor saw it']);
      if (td(me) > 0) {
        if (td(me) >= Math.max(...p.rows.map(td))) hl.push(['⚔', 'MOST TAKEDOWNS', `${td(me)} in match`]);
        else if (td(me) >= Math.max(...team.map(td))) hl.push(['⚔', 'TOP TEAM TAKEDOWNS', `${td(me)} K+A`]);
      }
      if ((me.cs | 0) > 0 && (me.cs | 0) >= Math.max(...team.map((r) => r.cs | 0))) hl.push(['🐞', 'MOST CS ON TEAM', `${me.cs} bugs`]);
      if ((me.deaths | 0) === 0) hl.push(['🛡', 'DEATHLESS', 'zero incidents filed']);
      const kr = kda(me);
      if (kr >= 3) hl.push(['🎯', `KDA ${kdaStr(me)}`, 'clean commits only']);
      if (!hl.length) hl.push(['🪑', 'SHOWED UP', "that's half the job"]);
    }
    const c = SaveManager.getCareer() || {};
    const rightLines = [];
    if (p.practice) {
      rightLines.push(`<div class="es-line dim">🤖 Practice · unranked (${c.teamPractice | 0} played)</div>`);
    } else {
      const w = c.teamWins | 0, g = c.teamGames | 0;
      rightLines.push(`<div class="es-line">📈 Siege record: <b>${w}W – ${Math.max(0, g - w)}L</b></div>`);
    }
    for (const m of gains.missions || []) rightLines.push(`<div class="es-line ok">✅ Mission done: ${esc(m.text)}</div>`);
    for (const h of gains.hats || []) rightLines.push(`<div class="es-line gold">🎉 New hat: ${h.emoji} ${esc(h.name)}</div>`);
    if (!(gains.hats && gains.hats.length)) {
      let best = null;
      for (const h of HATS) {
        if (h.mode !== 'team' || !h.unlock || isHatUnlocked(h, c)) continue;
        const pr = hatProgress(h, c);
        if (!best || pr.frac > best.frac) best = { h, ...pr };
      }
      if (best) rightLines.push(`<div class="es-line dim">Next hat: ${best.h.emoji} ${best.cur}/${best.at} · ${esc(best.h.unlock.label)}</div>`);
    }
    return `<div class="end-shift"><div class="es-l"><div class="es-lab">YOUR SHIFT</div><div class="es-badges">${hl.slice(0, 3).map(([ic, t, d]) => `<span class="es-b"><b>${ic} ${esc(t)}</b><small>${esc(d)}</small></span>`).join('')}</div></div><div class="es-r">${rightLines.slice(0, 4).join('')}</div></div>`;
  }

  function buildRankHtml(p) {
    if (p.practice) return '';
    if (!rank) return '';
    const lp = (rank.delta | 0) * 2;
    const sign = lp >= 0 ? '+' : '';
    const parts = [];
    if (rank.justPlaced) parts.push(`<span class="rk-pop">🎖️ PLACED: ${esc(rank.labelAfter || '')}!</span>`);
    else if (rank.promoted) parts.push(`<span class="rk-pop">⬆️ PROMOTED: ${esc(rank.labelAfter || '')}!</span>`);
    else if (rank.demoted) parts.push(`<span class="rk-dn">⬇️ Demoted: ${esc(rank.labelAfter || '')}</span>`);
    const tail = rank.placementLeft > 0 ? ` · placement ${Math.min(5, rank.games | 0)}/5` : (rank.place ? ` · #${rank.place}` : '');
    const sd = rank.starDelta | 0;
    const deltaStr = Number.isFinite(rank.starDelta) ? `${sd > 0 ? '+' : ''}${sd} ★` : `${sign}${lp} LP`;
    const col = lp >= 0 ? '#7ed957' : '#ff8a8a';
    parts.push(`<span>🏆 <b>${esc(rank.labelAfter || '')}</b> ${esc(rank.starText || '')} <b style="color:${col}">(${deltaStr})</b>${rank.abandoned ? ' (left)' : ''}${esc(tail)}</span>`);
    if (rank.bonus === 'mvp') parts.push('<span class="rk-pop">⭐ Team MVP bonus: +1 ★</span>');
    else if (rank.bonus === 'svp') parts.push('<span class="rk-svp">🛡 Best on team: half ★ lost</span>');
    return `<div class="erank">${parts.join(' · ')}</div>`;
  }

  function paint() {
    const p = cached, won = p.winner === p.myTeam, info = TEAM_INFO[p.winner] || { name: p.winner, emoji: '' };
    const title = won ? '🚀 DEPLOYED TO PROD' : '↩️ ROLLED BACK';
    if (!subLine) {
      if (p.reason === 'abandon') subLine = `🏳 Abandoned — nobody came back. ${info.name || p.winner} takes it.`;
      else if (p.reason === 'rollback') subLine = won ? "They asked for last Friday's build. Granted." : 'Rollback approved. See you at the retro.';
      else subLine = won ? pick(WIN) : pick(LOSE);
    }
    const mk = (team) => {
      const ti = TEAM_INFO[team] || { name: team, emoji: '', css: '#fff' }, list = p.rows.filter((r) => r.team === team).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      return `<div class="et" style="--tc:${ti.css || '#fff'}"><b>${ti.emoji || ''} ${esc(ti.name || team)}${team === p.winner ? ' · SHIPPED' : ' · CRASHED'}</b></div>`
        + list.map((r) => {
          const d = CHAMPIONS[r.champ];
          return `<div class="er${r.isMe ? ' me' : ''}${r.id === p.mvp ? ' mvp' : ''}" style="--tc:${ti.css || '#fff'}"><span class="nm">${r.id === p.mvp ? '⭐ ' : ''}<em>${d ? d.emoji : '🐞'}</em>${esc(r.name)}${r.isBot ? ' <i>(bot)</i>' : ''}</span><span>Lv${r.level}</span><span class="k">${r.kills}/${r.deaths}/${r.assists}</span><span class="kr">${kdaStr(r)}</span><span>🐞${r.cs}</span><span>🪙${r.gold}</span><span class="it">${r.items.map((x) => (ITEMS[x] ? ITEMS[x].emoji : '')).join('')}</span></div>`;
        }).join('');
    };
    const mvp = p.rows.find((r) => r.id === p.mvp), mc = mvp && CHAMPIONS[mvp.champ];
    box.innerHTML = `<div class="end-box ${won ? 'win' : 'lose'}"><div class="end-t">${title}</div><div class="end-s">${esc(info.emoji || '')} ${esc(info.name || '')} pushed to production · ${fmt(p.dur)} · ${esc(subLine)}</div>`
      + (mvp ? `<div class="end-mvp">⭐ MVP: ${mc ? mc.emoji : ''} <b>${esc(mvp.name)}</b> ${mvp.kills}/${mvp.deaths}/${mvp.assists} (${kdaStr(mvp)} KDA) · 🐞 ${mvp.cs}</div>` : '')
      + `<div class="end-tbl">${mk(p.myTeam)}${mk(p.myTeam === 'blue' ? 'red' : 'blue')}</div>${buildShiftHtml(p)}${buildRankHtml(p)}`
      + `<div class="end-b"><button class="bsh-btn yes" data-a="again">▶ PLAY AGAIN</button><button class="bsh-btn" data-a="copy">📋 COPY RESULT</button><button class="bsh-btn" data-a="exit">← BACK TO MENU</button><button class="bsh-btn" data-a="hide">view map</button></div></div>`;
  }

  function openWith(st, srvNow) {
    cached = collect(st, srvNow);
    if (!counted) { counted = true; gains = recordProgress(cached); }
    open = true; box.hidden = false; paint();
  }

  return {
    update(st, phase, srvNow) {
      if (disposed) return;
      if (phase !== 'ended' || !st || !st.winner) {
        if (open) { open = false; box.hidden = true; endedSince = 0; cached = null; fired = false; counted = false; gains = { missions: [], hats: [] }; subLine = ''; box.classList.remove('min'); }
        else endedSince = 0;
        return;
      }
      const now = Date.now(); if (!endedSince) endedSince = now;
      if (!open && now - endedSince >= 1800) openWith(st, srvNow || now);
    },
    isOpen: () => open && !box.hidden,
    show(st, srvNow) { openWith(st, srvNow || Date.now()); },
    hide() { open = false; box.hidden = true; },
    dispose() { disposed = true; try { offRank && offRank(); } catch (_) { /* ignore */ } box.remove(); },
  };
}

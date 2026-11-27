// hud.js - HTML overlay: HP/mana, QWER cooldowns, minimap, stats panel.
import { CHAMPIONS } from '../shared/moba/champions.js';
import { MAP_W, LANES, LANE_WIDTH, FOUNTAIN, BASE_RADIUS, WALLS, RIVER } from '../shared/moba/map.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.slots = {};
    const box = $('slots');
    for (const k of ['q', 'w', 'e', 'r', 'd', 'f']) {
      const d = document.createElement('div'); d.className = 'slot'; d.innerHTML = `<small>${k.toUpperCase()}</small><span class="nm"></span><div class="cd" style="display:none"></div>`;
      box.appendChild(d); this.slots[k] = { d, nm: d.querySelector('.nm'), cd: d.querySelector('.cd') };
      this.slots[k].nm.style.fontSize = '10px'; this.slots[k].nm.style.padding = '12px 2px 0'; this.slots[k].nm.style.textAlign = 'center'; this.slots[k].nm.style.lineHeight = '1.1';
    }
    this.mm = $('mm'); this.g = this.mm.getContext('2d'); this.bg = this.buildMinimapBg(); this.mmAt = 0; this.statAt = 0;
    this.toastEl = $('toast'); this.toastT = 0; this.fpsSamples = []; this.maxMs = 0; this.name = '';
  }
  toast(txt, ms = 2200) { this.toastEl.textContent = txt; this.toastEl.style.display = 'block'; clearTimeout(this.toastT); this.toastT = setTimeout(() => { this.toastEl.style.display = 'none'; }, ms); }
  buildMinimapBg() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 200; const g = cv.getContext('2d'); const k = 200 / MAP_W;
    g.fillStyle = '#1a2036'; g.fillRect(0, 0, 200, 200);
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#1c4a8a'; g.lineWidth = RIVER.width * k;
    g.beginPath(); g.moveTo(RIVER.from.x * k, RIVER.from.y * k); g.lineTo(RIVER.to.x * k, RIVER.to.y * k); g.stroke();
    g.strokeStyle = '#4b5578'; g.lineWidth = LANE_WIDTH * k;
    for (const pts of Object.values(LANES)) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x * k, p.y * k) : g.moveTo(p.x * k, p.y * k))); g.stroke(); }
    for (const [f, c] of [[FOUNTAIN.blue, '#39a8ff55'], [FOUNTAIN.red, '#ff4d5e55']]) { g.fillStyle = c; g.beginPath(); g.arc(f.x * k, f.y * k, BASE_RADIUS * k * 0.8, 0, 7); g.fill(); }
    g.strokeStyle = '#9aa4c4'; g.lineWidth = 1;
    for (const w of WALLS) if (w.kind === 'seg') { g.beginPath(); g.moveTo(w.x1 * k, w.y1 * k); g.lineTo(w.x2 * k, w.y2 * k); g.stroke(); }
    return cv;
  }
  minimap(sim, camTarget, halfW, halfH, t) {
    if (t - this.mmAt < 0.1) return; this.mmAt = t;
    const g = this.g, k = 200 / MAP_W, st = sim.clientState, me = st.champions.get('me');
    g.drawImage(this.bg, 0, 0);
    st.structures.forEach((s) => { if (s.alive === false) return; g.fillStyle = s.team === 'blue' ? '#39a8ff' : '#ff4d5e'; const r = s.kind === 'core' ? 6 : 3.5; g.fillRect(s.x * k - r / 2, s.y * k - r / 2, r, r); });
    st.units.forEach((u) => { if (u.alive === false) return; g.fillStyle = u.team === 'blue' ? '#7cc8ff' : u.team === 'red' ? '#ff8a96' : '#d6b84a'; g.fillRect(u.x * k - 1, u.y * k - 1, 2, 2); });
    st.champions.forEach((c) => { if (c.dead) return; g.fillStyle = c.id === 'me' ? '#ffffff' : c.team === me.team ? '#39e08a' : '#ff3b4f'; g.beginPath(); g.arc(c.x * k, c.y * k, c.id === 'me' ? 4 : 3, 0, 7); g.fill(); });
    g.strokeStyle = '#ffffffcc'; g.lineWidth = 1; g.strokeRect((camTarget.x / 0.01 - halfW) * k, (camTarget.z / 0.01 - halfH) * k, halfW * 2 * k, halfH * 2 * k);
  }
  bars(sim) {
    const c = sim.clientState.champions.get('me'); if (!c) return;
    if (this.name !== c.champ) { this.name = c.champ; const d = CHAMPIONS[c.champ]; $('name').textContent = `${d.name} ${d.title} (${d.role})`; }
    $('hpf').style.width = `${Math.max(0, c.hp / c.maxHp) * 100}%`; $('hpt').textContent = `${Math.max(0, Math.round(c.hp))} / ${c.maxHp}`;
    $('mpf').style.width = `${Math.max(0, c.mana / c.maxMana) * 100}%`; $('mpt').textContent = `${Math.round(c.mana)} / ${c.maxMana}`;
    const def = CHAMPIONS[c.champ], now = sim.t;
    for (const k of ['q', 'w', 'e', 'r']) {
      const s = this.slots[k], rem = ((c['cd' + k.toUpperCase()] || 0) - now) / 1000, locked = (c.ranks?.[k] || 0) <= 0 || (k === 'r' && c.level < 6);
      s.nm.textContent = def.skills[k]?.name || ''; s.d.classList.toggle('off', locked);
      s.cd.style.display = rem > 0 ? 'grid' : 'none'; if (rem > 0) s.cd.textContent = rem >= 10 ? Math.ceil(rem) : rem.toFixed(1);
    }
    for (const k of ['d', 'f']) { const s = this.slots[k], rem = ((c['cd' + k.toUpperCase()] || 0) - now) / 1000; s.nm.textContent = c['spell' + k.toUpperCase()] || ''; s.cd.style.display = rem > 0 ? 'grid' : 'none'; if (rem > 0) s.cd.textContent = Math.ceil(rem); }
  }
  stats(info, ctx, t) {
    this.fpsSamples.push(ctx.frameMs); if (ctx.frameMs > this.maxMs) this.maxMs = ctx.frameMs;
    if (t - this.statAt < 0.5) return; this.statAt = t;
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length; this.fpsSamples.length = 0;
    const heap = performance.memory ? `${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)} MB` : 'n/a';
    this.avgMs = avg;
    $('statsTxt').textContent =
`FPS          ${(1000 / avg).toFixed(0)}
frame ms     ${avg.toFixed(1)} (max ${this.maxMs.toFixed(0)})
draw calls   ${info.render.calls}
triangles    ${info.render.triangles.toLocaleString('en-US')}
geometries   ${info.memory.geometries}
textures     ${info.memory.textures}
programs     ${info.programs ? info.programs.length : 'n/a'}
JS heap      ${heap}
canvas       ${ctx.w}x${ctx.h} (pr ${ctx.pr})
shadow/bloom ${ctx.shadow} / ${ctx.bloom ? 'on' : 'off'}
instanced    ${ctx.inst ? 'on' : 'off'}
units/fx     ${ctx.units} / ${ctx.fx} (particles ${ctx.particles})
quality      ${ctx.note}`;
    this.maxMs = 0;
  }
}

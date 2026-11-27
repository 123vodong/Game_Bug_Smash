// units/index.js - champions, minions/monsters, towers/cores and HP bars from source.state() (already fog-filtered:
// fog-hidden enemies are simply absent, their view is hidden). Contract (Renderer.js):
//   createUnits({THREE,scene,source,mode}) -> {sync(state,dtSec,tSec), pick(wx,wy)->id|null, dispose()}
// Extras: ready (Promise, champion GLBs loaded; minions/structures work immediately), flash(id), lunge(id), entity(id).
import * as THREE from 'three';
import { S, TEAM_COL, disposeTree } from '../world/ground.js';
import { makeBatches } from './instanced.js';
import { FX } from './geo.js';
import { HpBars } from './hpbars.js';
import { syncStructures } from './structures.js';
import { loadChampionModels, ChampView } from './champions.js';
import { ChampIcons } from './icons.js';

const COLS = { ally: 0x5fe36a, foe: 0xff4f5f, me: 0x39e8ff, neutral: 0xffd23f };
const each = (m, fn) => { if (m && m.forEach) m.forEach(fn); };

export function createUnits({ scene, source } = {}) {
  const root = new THREE.Group(); root.name = 'units'; scene.add(root);
  const b = makeBatches(scene), hp = new HpBars(scene), icons = new ChampIcons(scene);
  const batchList = Object.values(b), seen = new Set(), seenU = new Set(); // reused every frame
  const champs = new Map(), minions = new Map(), flashes = new Map(), lunges = new Map();
  let models = null, disposed = false;
  const ready = loadChampionModels().then((m) => { if (!disposed) models = m; }).catch((e) => console.warn('[units] champion models failed', e));

  const myTeam = (st) => { const me = st.champions && st.champions.get && st.champions.get(source.localId); return me ? me.team : 'blue'; };

  function sync(st, dt = 0.016, t = 0, pred = null) {
    if (disposed || !st) return;
    dt = Math.min(Math.max(dt, 0), 0.1);
    FX.uT.value = t;
    for (let i = 0; i < batchList.length; i++) batchList[i].begin();
    hp.begin(); icons.begin();
    const team = myTeam(st), myId = source.localId;
    // champions
    seen.clear();
    each(st.champions, (c, key) => {
      const id = c.id || key; seen.add(id);
      let v = champs.get(id);
      if (v && v.champ !== c.champ) { v.dispose(); champs.delete(id); v = null; } // sandbox SWAP CHAMP
      if (!v) { if (!models) return; v = new ChampView(root, c, id, models); champs.set(id, v); }
      const pc = pred && id === myId && !c.dead ? Object.assign(Object.create(c), { x: pred.x, y: pred.y }) : c; // online prediction for the local champion
      v.update(pc, dt);
      v.root.visible = !(c.stealthed && c.team !== team);
      if (!c.dead && v.root.visible) { if (!window.__three?.hud?.hideChampBars) hp.add(pc.x * S, 1.5, pc.y * S, 0.95, 0.11, c.maxHp > 0 ? c.hp / c.maxHp : 0, id === myId ? COLS.me : c.team === team ? COLS.ally : COLS.foe); icons.add(c.champ, pc.x * S, 1.9, pc.y * S); }
    });
    for (const [id, v] of champs) if (!seen.has(id)) v.root.visible = false; // fog-hidden / left
    // minions, monsters, misc units
    seenU.clear();
    each(st.units, (u, key) => {
      if (u.alive === false) return;
      const id = u.id || key; seenU.add(id);
      let ms = minions.get(id);
      if (!ms) { ms = { x: u.x, y: u.y, yaw: u.team === 'blue' ? 2.4 : -0.7, ph: Math.random() * 6 }; minions.set(id, ms); }
      const dx = u.x - ms.x, dy = u.y - ms.y, d = Math.hypot(dx, dy);
      ms.x += dx * Math.min(1, dt * 18); ms.y += dy * Math.min(1, dt * 18);
      if (d > 0.6) { const want = Math.atan2(dx, dy); let df = want - ms.yaw; df = Math.atan2(Math.sin(df), Math.cos(df)); ms.yaw += df * Math.min(1, dt * 10); }
      const moving = d / Math.max(dt, 1e-3) > 30; ms.ph += dt * (moving ? 12 : 2);
      let lg = lunges.get(id) || 0; if (lg > 0) { lg -= dt; lunges.set(id, lg); }
      const bob = moving ? Math.abs(Math.sin(ms.ph)) * 0.06 : Math.sin(ms.ph) * 0.01;
      const f = Math.max(0, flashes.get(id) || 0); if (f > 0) flashes.set(id, f - dt);
      const fl = f / 0.14, lungeD = lg > 0 ? Math.sin((lg / 0.18) * Math.PI) * 0.2 : 0;
      const px = ms.x * S + Math.sin(ms.yaw) * lungeD, pz = ms.y * S + Math.cos(ms.yaw) * lungeD;
      const col = u.team === 'blue' ? TEAM_COL.blue : u.team === 'red' ? TEAM_COL.red : 0xb18cff;
      let top = 1.2, w = 0.55;
      if (u.kind === 'melee' || u.kind === 'ranged') b[u.kind].add(px, bob, pz, ms.yaw, 1.25, 1.25, 1.25, col, fl);
      else if (u.kind === 'pet') { b.duck.add(px, bob * 1.5, pz, ms.yaw, 1.3, 1.3, 1.3, 0xffffff, fl); top = 0.7; w = 0.3; } // rubber duck
      else if (u.kind === 'ward') { b.ward.add(px, 0, pz, ms.yaw, 1.2, 1.2, 1.2, col, fl); top = 0.9; w = 0.3; } // CCTV eye
      else if (u.kind === 'dummy') { b.dummy.add(px, 0, pz, 0.4, 1.4, 1.4, 1.4, 0xffffff, fl); top = 1.8; w = 0.6; } // training dummy w/ bug sticker
      else if (u.kind === 'siege') { b.siege.add(px, bob * 0.3, pz, ms.yaw, 1.2, 1.2, 1.2, col, fl); top = 0.9; w = 0.7; }
      else if (u.kind === 'small' || u.kind === 'medium' || u.kind === 'big' || u.kind === 'golden' || u.kind === 'deadline') {
        // dev-themed camps (Coffee Drone / Shredder Bot / Legacy Mainframe / golden scarab / THE DEADLINE bomb-clock), see instanced.js campGeos
        const key = { small: 'drone', medium: 'shredder', big: 'mainframe', golden: 'scarab', deadline: 'clock' }[u.kind];
        const k = { small: 1.2, medium: 1.3, big: 1.5, golden: 1.8, deadline: 2.6 }[u.kind];
        const wob = u.kind === 'small' ? 0.12 + Math.sin(ms.ph * 3) * 0.04 : bob * 0.6;
        b[key].add(px, wob, pz, ms.yaw, k, k, k, 0xe6e6e6, fl); top = 1.1 * k; w = 0.5 * k + 0.2;
      } else if (u.team === 'neutral' || u.kind === 'small' || u.kind === 'medium' || u.kind === 'big') {
        const k = { small: 0.8, medium: 1.1, big: 1.5 }[u.kind] || (u.maxHp > 3000 ? 2.4 : 1.7);
        const hue = { small: 0x7ed957, medium: 0xb18cff, big: 0xff9a4a }[u.kind] || 0xff5ad8;
        b.monster.add(px, bob * 0.6, pz, ms.yaw, k, k, k, hue, fl); top = 0.95 * k + 0.1; w = 0.5 * k + 0.2;
      } else { b.misc.add(px, bob * 0.3, pz, ms.yaw, 1, 1, 1, col, fl); top = 0.75; w = 0.4; }
      if ((u.hp < u.maxHp || u.team === 'neutral') && !window.__three?.hud?.hideChampBars) hp.add(px, top, pz, w, 0.07, u.maxHp > 0 ? u.hp / u.maxHp : 0, u.team === team ? COLS.ally : u.team === 'neutral' ? COLS.neutral : COLS.foe);
    });
    for (const id of minions.keys()) if (!seenU.has(id)) { minions.delete(id); lunges.delete(id); }
    syncStructures(st, b, hp, flashes, dt, t, team, COLS);
    for (let i = 0; i < batchList.length; i++) batchList[i].end();
    hp.end(); icons.end();
  }

  /** nearest attackable enemy champion / unit / structure around a sim-space point -> id | null */
  function pick(x, y) {
    const st = source.state(); if (!st) return null;
    const team = myTeam(st); let best = null, bd = 1e9;
    const test = (e, key, r, ok) => { if (!ok) return; const d = Math.hypot(e.x - x, e.y - y); if (d < r && d < bd) { bd = d; best = e.id || key; } };
    each(st.champions, (c, k) => test(c, k, 90, c.team !== team && !c.dead && !(c.stealthed)));
    each(st.units, (u, k) => test(u, k, 70, u.team !== team && u.alive !== false && u.kind !== 'pet' && u.kind !== 'obj'));
    each(st.structures, (s, k) => test(s, k, s.kind === 'core' ? 150 : 110, s.team !== team && s.alive !== false));
    return best;
  }

  return {
    ready, sync, pick,
    flash(id) { const v = champs.get(id); if (v) v.flash(); else flashes.set(id, 0.14); },
    lunge(id) { lunges.set(id, 0.18); },
    entity(id) { const st = source.state(); return st && ((st.champions && st.champions.get(id)) || (st.units && st.units.get(id)) || (st.structures && st.structures.get(id))); },
    dispose() {
      disposed = true;
      for (const v of champs.values()) v.dispose();
      champs.clear(); minions.clear();
      for (const x of Object.values(b)) x.dispose();
      hp.dispose(); icons.dispose(); disposeTree(root);
    },
  };
}
export default createUnits;

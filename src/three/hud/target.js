// Target frame (C6): live stats of the selected champion / unit / structure, dirty-checked (no DOM writes when unchanged).
// Mirrors TeamModeScene._updateTargetPanel + MobaHud.setTarget.
import { CHAMPIONS } from '../../../shared/moba/champions.js';

const UNIT_NAMES = { melee: 'Intern Bug', ranged: 'Spam Bug', siege: 'Legacy Code', small: 'Stray Bug', medium: 'Stubborn Bug', big: 'Memory Leak', golden: 'Golden Bug', deadline: 'The Deadline', pet: 'Pet' };

export function createTarget({ parent }) {
  const el = document.createElement('div'); el.className = 'bsh-target'; el.hidden = true;
  el.innerHTML = '<div class="tt"><span class="tn bsh-stroke"></span><span class="ts bsh-mono"></span></div>'
    + '<div class="tb"><i></i><b></b></div><div class="tb mp"><i></i><b></b></div><div class="tx bsh-mono"></div>';
  parent.appendChild(el);
  const q = (s) => el.querySelector(s);
  const tn = q('.tn'), ts = q('.ts'), hpb = q('.tb:not(.mp)'), mpb = q('.tb.mp'), tx = q('.tx');
  let sig = '';

  function set(info) {
    if (!info) { if (!el.hidden) el.hidden = true; sig = ''; return; }
    const hp = Math.max(0, Math.round(info.hp || 0)), mhp = Math.round(info.maxHp || 1), mp = Math.max(0, Math.round(info.mana || 0)), mmp = Math.round(info.maxMana || 0);
    const s = `${info.rel}|${info.name}|${info.sub}|${hp}/${mhp}|${mp}/${mmp}|${info.stats}`;
    if (s === sig && !el.hidden) return;
    sig = s;
    el.className = `bsh-target ${info.rel === 'enemy' ? 'enemy' : info.rel === 'neutral' ? 'neutral' : ''}`;
    tn.textContent = info.name || 'Target'; ts.textContent = info.sub || '';
    hpb.firstChild.style.width = `${Math.max(0, Math.min(1, (info.hp || 0) / Math.max(1, info.maxHp || 1))) * 100}%`;
    hpb.lastChild.textContent = `HP ${hp} / ${mhp}`;
    mpb.hidden = !(mmp > 0);
    if (mmp > 0) { mpb.firstChild.style.width = `${Math.max(0, Math.min(1, (info.mana || 0) / mmp)) * 100}%`; mpb.lastChild.textContent = `MP ${mp} / ${mmp}`; }
    tx.textContent = info.stats || '';
    el.hidden = false;
  }

  /** Resolve `id` against the state; returns false when the target is gone (caller should clear its selection). */
  function update(st, id, myTeam) {
    if (!id || !st) { set(null); return false; }
    const c = st.champions && st.champions.get && st.champions.get(id);
    if (c) {
      if (c.dead) { set(null); return false; }
      const def = CHAMPIONS[c.champ];
      set({ name: c.name || (def && def.name) || 'Champion', sub: `Lv.${c.level || 1} · ${(def && def.role) || ''}`, rel: c.team === myTeam ? 'ally' : 'enemy', hp: c.hp, maxHp: c.maxHp, mana: c.mana, maxMana: c.maxMana,
        stats: `AD ${Math.round(c.ad || 0)} · AP ${Math.round(c.ap || 0)} · ARM ${Math.round(c.armor || 0)} · MS ${Math.round(c.ms || 0)}` });
      return true;
    }
    const u = st.units && st.units.get && st.units.get(id);
    if (u) {
      if (!u.alive) { set(null); return false; }
      const rel = u.team === myTeam ? 'ally' : (u.team === 'blue' || u.team === 'red' ? 'enemy' : 'neutral');
      set({ name: UNIT_NAMES[u.kind] || u.kind || 'Unit', sub: rel.toUpperCase(), rel, hp: u.hp, maxHp: u.maxHp, mana: 0, maxMana: 0, stats: `ATK ${Math.round(u.ad || 0)} · ARM ${Math.round(u.armor || 0)} · MS ${Math.round(u.ms || 0)}` });
      return true;
    }
    const s = st.structures && st.structures.get && st.structures.get(id);
    if (s) {
      if (!s.alive) { set(null); return false; }
      const rel = s.team === myTeam ? 'ally' : 'enemy';
      const towerStats = `ATK ${Math.round(s.atk || 120)} · RNG ${Math.round(s.range || 600)}${s.invulnerable ? ' · 🛡️ INVULNERABLE' : ''}`;
      const coreStats = s.invulnerable ? 'Core Objective · 🛡️ INVULNERABLE' : 'Core Objective · Destroy to win';
      set({ name: s.kind === 'core' ? 'Production Server' : 'Firewall Tower', sub: s.invulnerable ? '🛡️ INVULNERABLE' : rel.toUpperCase(), rel, hp: s.hp, maxHp: s.maxHp, mana: 0, maxMana: 0,
        stats: s.kind === 'core' ? coreStats : towerStats });
      return true;
    }
    set(null); return false;
  }
  return { el, set, update, dispose() { el.remove(); } };
}

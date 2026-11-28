// InfoPanel — Team Mode "champion sheet" (v3 contract §4.2 C3). Screen-pinned,
// depth 80–95; toggled by key C and the HUD ℹ button (TeamModeScene owns that).
// Shows the champion's portrait / name / role, live stats, the BASIC ATTACK, Q W E R
// with numbers scaled to the current level + items (cost, cooldown incl. haste,
// remaining cooldown, mechanics badges) and the two summoner spells.
//
//   const ip = new InfoPanel(scene, { onClose })
//   ip.open(sid?) / ip.close() / ip.toggle(sid?) / ip.isOpen / ip.sid
//   ip.update({ c, srvNow, buffPct })   c = TeamChamp-shaped object (live), refreshed ~4 Hz while open
//   ip.destroy()
import { CHAMPIONS } from '../../../shared/moba/champions.js';
import { SPELLS } from '../../../shared/moba/spells.js';
import { tText } from '../../core/I18n.js';
import { itemStats, ITEMS } from '../../../shared/moba/items.js';
import { ULT_UNLOCK_LEVEL, scaledAmount, cooldownMs, MAX_HASTE_PCT, TEAM_INFO } from '../../../shared/moba/rules.js';
import { LOOKS } from '../../entities/moba/mobaGfx.js';
import { showSkillTipPanel } from '../../entities/moba/MobaHud.js';

const FONT = 'Arial Black, sans-serif';
const MONO = 'Consolas, monospace';
const css = (n) => '#' + ((n >>> 0) & 0xffffff).toString(16).padStart(6, '0');
const toArr = (a) => (!a ? [] : Array.isArray(a) ? a : Array.from(a));
const s1 = (ms) => `${+(Math.max(0, ms || 0) / 1000).toFixed(1)}s`;
const pct = (v) => `${Math.round((v || 0) * 100)}%`;
const PW = 860, PH = 548;
const DEPTH = 82;

/** "182 (80 +18/lv +70% AP)" — the live number and where it comes from. */
function amount(spec, c, maxHp) {
  if (!spec) return '';
  const v = Math.round(scaledAmount(spec, c.level || 1, c.ad || 0, c.ap || 0, maxHp || c.maxHp || 0));
  const parts = [`${spec.base || 0}`];
  if (spec.perLevel) parts.push(`+${spec.perLevel}/lv`);
  if (spec.ad) parts.push(`+${pct(spec.ad)} AD`);
  if (spec.ap) parts.push(`+${pct(spec.ap)} AP`);
  if (spec.hp) parts.push(`+${pct(spec.hp)} max HP`);
  return `${v} (${parts.join(' ')})`;
}

/** Short mechanics badges for a skill. */
function badges(sk, def) {
  const b = [];
  const T = { projectile: 'Skillshot', circle: 'Area', target: 'Targeted', dash: 'Dash', blink: 'Blink', self: 'Self', allies: 'Team', zone: 'Zone' };
  b.push(T[sk.type] || sk.type);
  if ((sk.count | 0) > 1) b.push(`Fan ×${sk.count}`);
  if (sk.pierce) b.push('Pierce');
  if (sk.champOnly) b.push('Champions only');
  if (sk.targets === 'enemyChamp') b.push('Champions only');
  if (sk.stun) b.push(`Stun ${s1(sk.stun.ms)}`);
  if (sk.root) b.push(`Root ${s1(sk.root.ms)}`);
  if (sk.slow) b.push(`Slow ${pct(sk.slow.pct)} ${s1(sk.slow.ms)}`);
  if (sk.knockback) b.push(`Knockback ${sk.knockback.dist}`);
  if (sk.wallStun) b.push(`Wall-stun ${s1(sk.wallStun.ms)}`);
  if (sk.execute) b.push(`Execute +${pct(sk.execute.missingHpPct)} missing HP`);
  if (sk.delay) b.push(`Delay ${s1(sk.delay)}`);
  if (sk.at === 'pet') b.push(`On ${def?.pet?.name || 'pet'}`);
  if (sk.type === 'dash') b.push('Stops at walls');
  if (sk.type === 'blink') b.push('Crosses walls');
  if (sk.buff) {
    const f = sk.buff;
    if (f.msPct) b.push(`+${pct(f.msPct)} MS`);
    if (f.as) b.push(`+${pct(f.as)} AS`);
    if (f.armor) b.push(`+${f.armor} armor`);
    if (f.dmgReduction) b.push(`−${pct(f.dmgReduction)} dmg taken`);
    if (f.adPct) b.push(`+${pct(f.adPct)} AD`);
    if (f.apPct) b.push(`+${pct(f.apPct)} AP`);
    if (f.petPct) b.push(`Pet +${pct(f.petPct)}`);
  }
  return [...new Set(b)];
}

export class InfoPanel {
  constructor(scene, { onClose } = {}) {
    this.s = scene;
    this.onClose = onClose;
    this.sid = null;
    this._key = '';
    const W = scene.scale.width;
    this.x0 = Math.round(W / 2 - PW / 2); this.y0 = 62;
    this.c = scene.add.container(this.x0, this.y0).setScrollFactor(0).setDepth(DEPTH).setVisible(false);
    const bg = scene.add.rectangle(0, 0, PW, PH, 0x070b12, 0.96).setOrigin(0).setStrokeStyle(2, 0x39c2ff, 0.9).setInteractive();
    bg.on('pointerdown', (p, lx, ly, ev) => ev?.stopPropagation?.());
    this.c.add(bg);
    const close = scene.add.text(PW - 14, 10, '✕', { fontFamily: FONT, fontSize: 20, color: '#c9d3e6' }).setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); this.close(); this.onClose?.(); });
    this.c.add(close);
    this.hint = scene.add.text(PW - 44, 16, 'C / Esc to close', { fontFamily: MONO, fontSize: 11, color: '#6f7d96' }).setOrigin(1, 0);
    this.c.add(this.hint);
    this.body = scene.add.container(0, 0);
    this.c.add(this.body);
  }

  get isOpen() { return this.c.visible; }
  open(sid) { if (sid !== undefined && sid !== this.sid) { this.sid = sid; this._key = ''; } this.c.setVisible(true); }
  close() { this._hideSkillTip(); this.c.setVisible(false); }
  toggle(sid) { if (this.isOpen && (sid === undefined || sid === this.sid)) this.close(); else this.open(sid); }
  destroy() { this._hideSkillTip(); this.c?.destroy(); this.c = null; }
  _showSkillTip(def, slot, x, y) { this._hideSkillTip(); this._skillTip = showSkillTipPanel(this.s, def, slot, { x, y, depth: 95 }); }
  _hideSkillTip() { this._skillTip?.destroy(); this._skillTip = null; }

  _t(x, y, str, style = {}, ox = 0, oy = 0) {
    const t = this.s.add.text(x, y, str, { fontFamily: MONO, fontSize: 12, color: '#dfe7f5', ...style }).setOrigin(ox, oy);
    this.body.add(t);
    return t;
  }
  _badge(x, y, str, color) {
    const t = this.s.add.text(x, y, str, {
      fontFamily: MONO, fontSize: 10, color: '#0a0f18', backgroundColor: css(color), padding: { x: 4, y: 1 },
    });
    this.body.add(t);
    return t.width + 5;
  }

  /** ctx: { c (champion state), srvNow, buffPct (team damage buff, e.g. 0.2) } */
  update({ c, srvNow = Date.now(), buffPct = 0 } = {}) {
    if (!this.isOpen || !c) return;
    const def = CHAMPIONS[c.champ];
    if (!def) return;
    // Layout is rebuilt only when the scaled numbers change (champ, level, stats, items, spells,
    // team buff); HP / mana / cooldowns are live texts updated in place (_refresh).
    const key = [c.champ, c.level, c.ad, c.ap, c.armor, c.ms, c.as, c.range, c.maxHp, c.maxMana,
      toArr(c.items).join('|'), c.spellD, c.spellF, buffPct, c.team].join(';');
    if (key !== this._key) {
      this._key = key;
      this._hideSkillTip();
      this.body.removeAll(true);
      this._live = { hp: null, mana: null, skills: [], spells: [] };
      this._build(c, def, srvNow, buffPct);
    }
    this._refresh(c, srvNow);
  }

  _setT(t, str, color) {
    if (!t) return;
    if (t.text !== str) t.setText(str);
    if (color && t._col !== color) { t._col = color; t.setColor(color); }
  }

  /** Live values only — no objects are created here. */
  _refresh(c, srvNow) {
    const L = this._live;
    if (!L) return;
    this._setT(L.hp, `${Math.round(c.hp || 0)} / ${Math.round(c.maxHp || 0)}`);
    this._setT(L.mana, `${Math.round(c.mana || 0)} / ${Math.round(c.maxMana || 0)}`);
    for (const k of L.skills) {
      const left = Math.max(0, (c['cd' + k.K] || 0) - srvNow);
      const sk = k.sk;
      const str = `💧${sk.mana} · ⏱ ${s1(k.cdTot)}${k.haste ? ` (${sk.cd}s base)` : ''}${left > 0 ? ` · ready in ${s1(left)}` : (k.locked ? '' : ' · READY')}${k.locked ? ` · 🔒 Lv ${ULT_UNLOCK_LEVEL}` : ''}`;
      this._setT(k.t, str, left > 0 || k.locked ? '#ffb347' : '#7ed957');
    }
    for (const k of L.spells) {
      const left = Math.max(0, (c['cd' + k.K] || 0) - srvNow);
      this._setT(k.t, left > 0 ? (left >= 10000 ? `${Math.ceil(left / 1000)}s` : s1(left)) : 'READY', left > 0 ? '#ffb347' : '#7ed957');
    }
  }

  _build(c, def, srvNow, buffPct) {
    const s = this.s, lv = c.level || 1;
    const it = itemStats(toArr(c.items));
    const haste = Math.min(MAX_HASTE_PCT, it.haste || 0);
    // ── header ──
    const team = TEAM_INFO[c.team];
    let portrait = null;
    try {
      const draw = LOOKS.mod?.drawChampionPortrait;
      if (typeof draw === 'function') portrait = draw(s, def.id, 52, 52, 72);
    } catch (_) { portrait = null; }
    if (portrait) { this.body.add(portrait); }
    else {
      const ring = s.add.circle(52, 52, 38, 0x141b28, 1).setStrokeStyle(3, def.color || 0xffd23f, 1);
      this.body.add(ring);
      this._t(52, 54, def.emoji || '❔', { fontSize: 40 }, 0.5, 0.5);
    }
    this._t(104, 14, `${def.name}`, { fontFamily: FONT, fontSize: 24, color: css(def.color || 0xffd23f), stroke: '#000', strokeThickness: 4 });
    this._t(106, 48, `${def.title || ''}`, { fontSize: 13, color: '#c9d3e6' });
    this._t(106, 68, `${def.role}${def.lane ? ` · ${def.lane}` : ''} · ${def.ranged ? 'ranged' : 'melee'} · Lv ${lv}${team ? `  ${team.emoji} ${team.name}` : ''}${c.name ? `  — ${c.name}` : ''}`,
      { fontSize: 12, color: '#9fb0c8' });
    if (def.blurb) this._t(106, 84, def.blurb.length > 118 ? `${def.blurb.slice(0, 116)}…` : def.blurb, { fontSize: 10, color: '#6f7d96' });

    // ── stats (left column) ──
    const sx = 18, sy = 108;
    this._t(sx, sy, 'STATS', { fontFamily: FONT, fontSize: 13, color: '#ffd23f' });
    const rows = [
      ['❤️ Health', `${Math.round(c.hp || 0)} / ${Math.round(c.maxHp || 0)}`],
      ['💧 Mana', `${Math.round(c.mana || 0)} / ${Math.round(c.maxMana || 0)}`],
      ['⚔️ Attack dmg', `${c.ad | 0}`],
      ['✦ Ability pwr', `${c.ap | 0}`],
      ['🛡️ Armor', `${c.armor | 0}  (−${Math.round(100 - 10000 / (100 + Math.max(0, c.armor || 0)))}% dmg)`],
      ['⚡ Attack spd', `${(+c.as || 0).toFixed(2)} /s`],
      ['🎯 Range', `${c.range | 0}`],
      ['👟 Move spd', `${c.ms | 0}`],
      ['⏱️ Haste', `${pct(haste)} cdr${(it.haste || 0) > MAX_HASTE_PCT ? ` (cap ${pct(MAX_HASTE_PCT)})` : ''}`],
    ];
    if (it.lifesteal) rows.push(['🩸 Lifesteal', pct(it.lifesteal)]);
    if (buffPct) rows.push(['⏰ Deadline', `+${pct(buffPct)} damage`]);
    rows.forEach(([k, v], i) => {
      this._t(sx, sy + 22 + i * 19, k, { fontSize: 12, color: '#9fb0c8' });
      const vt = this._t(sx + 196, sy + 22 + i * 19, v, { fontSize: 12, color: '#ffffff' }, 1, 0);
      if (i === 0) this._live.hp = vt; else if (i === 1) this._live.mana = vt;
    });

    // ── basic attack ──
    const by = sy + 30 + rows.length * 19;
    this._t(sx, by, 'BASIC ATTACK', { fontFamily: FONT, fontSize: 13, color: '#ffd23f' });
    const dmg = Math.round((c.ad || 0) * (1 + (buffPct || 0)));
    const ba = [
      `${def.ranged ? '🏹 Ranged' : '🗡️ Melee'} · range ${c.range | 0}`,
      `${dmg} physical dmg (100% AD${buffPct ? ` +${pct(buffPct)}` : ''})`,
      `${(+c.as || 0).toFixed(2)} attacks/s · ${Math.round(dmg * (c.as || 0))} dps`,
    ];
    const onHit = [];
    if (it.lifesteal) onHit.push(`heals ${pct(it.lifesteal)} of damage`);
    for (const id of toArr(c.items)) { const x = ITEMS[id]; if (x?.onHit) onHit.push(`${x.emoji} ${x.onHit}`); }
    if (def.pet) onHit.push(`${def.pet.emoji || '🤖'} ${def.pet.name} zaps your target`);
    ba.push(onHit.length ? `on-hit: ${onHit.join(' · ')}` : 'on-hit: — (no item effects)');
    this._t(sx, by + 22, ba.join('\n'), { fontSize: 12, color: '#dfe7f5', lineSpacing: 4, wordWrap: { width: 222 } });

    // ── abilities (right) ──
    const ax = 262, aw = PW - ax - 16;
    let ay = 104;
    this._t(ax, ay - 4, 'ABILITIES', { fontFamily: FONT, fontSize: 13, color: '#ffd23f' });
    ay += 18;
    for (const slot of ['q', 'w', 'e', 'r']) {
      const sk = def.skills?.[slot];
      if (!sk) continue;
      const K = slot.toUpperCase();
      const cdTot = cooldownMs(sk.cd, haste), left = Math.max(0, (c['cd' + K] || 0) - srvNow);
      const locked = slot === 'r' && lv < ULT_UNLOCK_LEVEL;
      const col = sk.color ?? 0x39c2ff;
      const box = s.add.rectangle(ax, ay, aw, 66, col, 0.08).setOrigin(0).setStrokeStyle(1, col, 0.45)
        .setInteractive({ useHandCursor: true });
      const rowY = ay;
      box.on('pointerover', () => { box.setFillStyle(col, 0.16).setStrokeStyle(2, 0xffffff, 0.85); this._showSkillTip(def, slot, this.x0 + ax + aw / 2, this.y0 + rowY - 6); });
      box.on('pointerout', () => { box.setFillStyle(col, 0.08).setStrokeStyle(1, col, 0.45); this._hideSkillTip(); });
      this.body.add(box);
      const iconTexture = typeof sk.iconKey === 'string' && /^pixel-[qwer]$/.test(sk.iconKey) ? `skill-${sk.iconKey}` : null;
      if (iconTexture && s.textures.exists(iconTexture)) {
        this.body.add(s.add.image(ax + 23, ay + 34, iconTexture).setDisplaySize(30, 30));
        this._t(ax + 44, ay + 6, `[${K}] ${sk.name}`, { fontFamily: FONT, fontSize: 13, color: css(sk.color ?? 0xffffff), stroke: '#000', strokeThickness: 3 });
      } else this._t(ax + 8, ay + 6, `${sk.icon} [${K}] ${sk.name}`, { fontFamily: FONT, fontSize: 13, color: css(sk.color ?? 0xffffff), stroke: '#000', strokeThickness: 3 });
      const meta = `💧${sk.mana} · ⏱ ${s1(cdTot)}${haste ? ` (${sk.cd}s base)` : ''}${left > 0 ? ` · ready in ${s1(left)}` : (locked ? '' : ' · READY')}${locked ? ` · 🔒 Lv ${ULT_UNLOCK_LEVEL}` : ''}`;
      const mt = this._t(ax + aw - 8, ay + 8, meta, { fontSize: 11, color: left > 0 || locked ? '#ffb347' : '#7ed957' }, 1, 0);
      this._live.skills.push({ t: mt, sk, K, cdTot, haste, locked });
      const nums = [];
      if (sk.dmg) nums.push(`⚔ ${amount(sk.dmg, c)} dmg${sk.type === 'zone' ? '/tick' : ''}`);
      if (sk.heal) nums.push(`💚 ${amount(sk.heal, c)} heal`);
      if (sk.shield) nums.push(`🛡 ${amount(sk.shield, c)} shield`);
      const geo = [];
      if (sk.range && sk.at !== 'pet') geo.push(`range ${sk.range}`);
      if (sk.radius) geo.push(`radius ${sk.radius}`);
      if (sk.duration) geo.push(`${s1(sk.duration)}`);
      this._t(ax + 8, ay + 26, `${nums.join(' · ')}${nums.length && geo.length ? ' · ' : ''}${geo.join(' · ')}`, { fontSize: 11, color: '#ffffff' });
      let bx = ax + 8;
      for (const b of badges(sk, def)) { if (bx > ax + aw - 60) break; bx += this._badge(bx, ay + 46, b, sk.color ?? 0x7ec8ff); }
      ay += 72;
    }
    // ── summoner spells ──
    this._t(ax, ay + 2, 'SUMMONER SPELLS', { fontFamily: FONT, fontSize: 13, color: '#ffd23f' });
    ay += 22;
    const half = (aw - 8) / 2;
    ['D', 'F'].forEach((K, i) => {
      const sp = SPELLS[c['spell' + K]];
      const x = ax + i * (half + 8);
      this.body.add(s.add.rectangle(x, ay, half, 92, sp?.color ?? 0x8a94a8, 0.08).setOrigin(0).setStrokeStyle(1, sp?.color ?? 0x8a94a8, 0.5));
      if (!sp) { this._t(x + 8, ay + 8, `[${K}] —`, { fontFamily: FONT, fontSize: 13, color: '#8a94a8' }); return; }
      const left = Math.max(0, (c['cd' + K] || 0) - srvNow);
      this._t(x + 8, ay + 6, `${sp.icon} [${K}] ${sp.name}`, { fontFamily: FONT, fontSize: 13, color: css(sp.color), stroke: '#000', strokeThickness: 3 });
      const rt = this._t(x + half - 8, ay + 8, left > 0 ? `${s1(left)}` : 'READY', { fontSize: 11, color: left > 0 ? '#ffb347' : '#7ed957' }, 1, 0);
      this._live.spells.push({ t: rt, K });
      const L = [];
      if (sp.range) L.push(`range ${sp.range}`);
      if (sp.radius) L.push(`radius ${sp.radius}`);
      L.push(`cd ${sp.cd}s (no haste)`);
      const lvNum = (spec) => Math.round(scaledAmount(spec, lv, 0, 0));
      if (sp.heal) L.push(`heal ${lvNum(sp.heal)}`);
      if (sp.shield) L.push(`shield ${lvNum(sp.shield)} for ${s1(sp.ms)}`);
      if (sp.dmg) L.push(`${lvNum(sp.dmg)} true dmg${sp.kind === 'dot' ? ` over ${s1(sp.ms)}` : ''}`);
      if (sp.msPct) L.push(`+${pct(sp.msPct)} MS ${s1(sp.ms)}`);
      if (sp.healCut) L.push(`−${pct(sp.healCut)} healing`);
      if (sp.healSelf) L.push(`+${pct(sp.healSelf)} max HP on monsters`);
      this._t(x + 8, ay + 26, L.join(' · '), { fontSize: 11, color: '#ffffff', wordWrap: { width: half - 16 } });
      this._t(x + 8, ay + 58, tText(`spell.${sp.id}`, sp.desc || ''), { fontSize: 10, color: '#9fb0c8', wordWrap: { width: half - 16 } });
    });
  }
}

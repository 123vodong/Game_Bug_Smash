// ChampionView — a Team Mode champion: the stickman SVG poses (shared with
// Personal Mode) with a team-colored outline so the black line art reads on the
// dark floor, the champion's emoji above the head, a team ground ring (gold for
// YOU), name + level badge, HP bar (green you / blue ally / red enemy) with
// shield + 100-HP ticks, mana bar for you, and status visuals (stun, slow, root,
// shield, recall channel, buff auras). Pose comes from `action` / `action_seq`.
// v7: champions are CC0 'Puny Characters' pixel sprites (champUiKit.js, palette-swapped per champion, 8 facing rows,
// walk / melee / bow / cast / death frames); the stick poses + costume remain as a fallback when the atlas is missing.
// v2: a procedural costume from `def.look` (looks.js): outfit (between the team
// outline and the stickman), hat + held prop (in front), and for Rush a scooter
// (deck + 2 spinning wheels; he leans instead of running). ≤ 6 extra images.
import { CHAMPIONS, parseKitTags, parseCcTags, CC_TYPES, CC_TUNING, resolveSkill } from '../../../shared/moba/champions.js';
import { RECALL_MS } from '../../../shared/moba/rules.js';
import { FONT, BAR, ME_COLOR, D, depthAt, teamColor, teamCss, relation, approach, calmPrefs, hatEmoji } from './mobaGfx.js';

// Nameplate / HP+mana bars / level badge / status icons live in a SEPARATE container at a
// fixed depth just below damage numbers, so opaque walls (v3 partitions, cubicles, shelves)
// y-sorted in front of the champion never cover them. It follows the display position.
const OVERLAY_DEPTH = D.numbers - 1;
import { ensureMobaLooks, costumeLayout, costumeKeys, lookMeta, SCOOTER_LIFT } from './looks.js';
import { loopFb } from './SkillFx.js';
import { CHAMP_ATLAS, ANIM, FEET, champAtlasReady, champFrame, champIndex, champScale, dirRow, CELL } from './champUiKit.js';

const PUNY_PX = 156; // displayed size of one 32 px champion frame (nearest-neighbour upscale)

export const POSE_KEYS = {
  idle: 'stick-idle', run: 'stick-run', run2: 'stick-run2', smash: 'stick-smash', kick: 'stick-kick',
  punch: 'stick-punch', parry: 'stick-parry', jump: 'stick-jump',
};
const TYPE_POSE = { projectile: 'smash', circle: 'smash', target: 'punch', dash: 'kick', blink: 'jump', self: 'parry', allies: 'parry' };
const OUTLINE = [[-2.5, 0], [2.5, 0], [0, -2.5], [0, 2.5]];
const SPR_W = 78, SPR_H = 100, BAR_W = 76, BAR_Y = -114;
const BUFF_PRIORITY = ['deadline', 'r', 'q', 'w', 'e'];
// v4 bushes: an own-team champion standing in a bush is drawn translucent with a leaf tint.
const HIDDEN_ALPHA = 0.5, HIDDEN_OV_ALPHA = 0.8, LEAF_TINT = 0xa6f0a0, SLOW_TINT = 0x8fc4ff;
const FADE_MS = 200;
const CC_TINT = { suppress: 0x8a8a99, charm: 0xffb0d6, fear: 0xb79cff }; // v6.1 body tints (grey = desaturated)
const CC_ALPHA = { untarget: 0.3, ghost: 0.35 };
// v6 kit visuals (docs/02_CHAMPIONS_AND_SKILLS.md [v6 numbering] 3.2): stance body tint, orbiting data orbs, carried box, drink cup.
const STANCE_TINT = { hotfix: 0xffb0d0, feature: 0xb8f5a0, bucket: 0xb0dcff }; // main / mop = default look
const MIX_COLOR = { S: 0x5a3a22, M: 0xf5e6d3, G: 0xffb347 };

/** Map the server's free-form `action` string onto one of the stickman poses (null = none). */
export function poseForAction(action, def, alt, stance) {
  const a = String(action || '').toLowerCase();
  // Server actions: idle | attack | q | w | e | r | recall | dead (anything else → best guess).
  if (!a || a === 'idle' || a === 'move' || a === 'run' || a === 'none' || a === 'dead' || a.includes('recall')) return null;
  let slot = null;
  if (a.length === 1 && 'qwer'.includes(a)) slot = a;
  else {
    const m = a.match(/(?:cast|skill|spell)[_:\- ]?([qwer])(?![a-z])/) || a.match(/^([qwer])[_:\-]/);
    if (m) slot = m[1];
  }
  if (slot) return TYPE_POSE[(def ? resolveSkill(def, slot, stance) : null)?.type] || 'smash'; // stance-resolved (Mop / Patch)
  if (POSE_KEYS[a]) return a;
  if (a.includes('dash')) return 'kick';
  if (a.includes('blink')) return 'jump';
  if (a.includes('shield') || a.includes('buff') || a.includes('heal')) return 'parry';
  if (def?.ranged) return 'punch';
  return alt ? 'kick' : 'punch';
}

export class ChampionView {
  constructor(scene, id, ch, { isMe, myTeam }) {
    this.scene = scene;
    this.id = id;
    this.isMe = !!isMe;
    this.team = ch.team;
    this.champ = ch.champ;
    this.def = CHAMPIONS[ch.champ] || CHAMPIONS.pixel;
    this.rel = isMe ? 'me' : relation(ch.team, myTeam);
    this.x = ch.x; this.y = ch.y; this.tx = ch.x; this.ty = ch.y;
    this._px = ch.x; this._py = ch.y;
    this.facing = ch.team === 'red' ? -1 : 1;
    this.pose = null;
    this.actionSeq = ch.action_seq || 0;
    this.actionUntil = 0; this.actionPose = null; this._alt = false;
    this.faceTo = null;
    this.dead = !!ch.dead;
    this.hp = -1; this.maxHp = -1; this.shield = -1; this.mana = -1; this.maxMana = -1;
    this.level = 0;
    this._buffs = null; this._auraColor = null;
    this._kit = {}; this._kitKey = ''; this._stanceTint = null; this._spotted = false;
    this._ccList = []; this._ccTint = null; this._ccO = null; this._airY = 0; this._shakeX = 0; this._stealth = false; this._bodyA = -1; // v6.1 CC looks
    this._flashUntil = 0;
    this._phase = Math.random() * 4000;
    this.moving = false;
    this.hidden = false;           // v4: in a bush (own team only — hidden enemies are not sent)
    this.plateDy = 0; this._plateDy = 0; this._plateScale = 1; // round 2: crowded-fight nameplate stacking
    this.destroyed = false;
    this._fading = false;

    const col = teamColor(ch.team);
    this.outlineColor = isMe ? ME_COLOR : col;
    const c = scene.add.container(ch.x, ch.y).setDepth(depthAt(ch.y));
    this.c = c;
    this._puny = champAtlasReady(scene);
    this._ci = champIndex(ch.champ);
    this._fvx = this.facing; this._fvy = 0.6; this._dirRow = dirRow(this._fvx, this._fvy); this._frameKey = '';
    this._kind = this.def.role === 'Marksman' ? 'bow' : (this.def.ranged ? 'cast' : 'melee');
    this._actStart = 0; this._actDur = 400; this._deathUntil = 0;
    this._sc = (PUNY_PX / CELL) * champScale(ch.champ);
    // soft contact shadow (radial glow tinted black) instead of a hard ellipse
    const shadow = scene.textures.exists('moba-glow')
      ? scene.add.image(0, 3, 'moba-glow').setTint(0x000000).setDisplaySize(84, 34).setAlpha(0.62)
      : scene.add.ellipse(0, 3, 62, 18, 0x000000, 0.42);
    this.shadow = shadow;
    ensureMobaLooks(scene);
    this._buildCostume(scene);
    this.ring = scene.add.ellipse(0, 2, 76, 27, col, isMe ? 0.3 : 0.2)
      .setStrokeStyle(isMe ? 4 : 3, this.outlineColor, 1);
    this.aura = scene.add.ellipse(0, 2, 108, 40).setStrokeStyle(4, 0xffffff, 0.9).setVisible(false);
    this.rootFx = scene.add.ellipse(0, 2, 92, 34).setStrokeStyle(5, 0x2ecc71, 0.95).setVisible(false);
    this.recallG = scene.add.graphics().setVisible(false);
    this.light = scene.add.image(0, -46, 'moba-glow').setTint(this.outlineColor).setDisplaySize(118, 140).setAlpha(0.26);
    if (this._puny) {
      const f0 = champFrame(scene, this._ci, this._dirRow, 0);
      this.outlines = OUTLINE.map(([dx, dy]) => scene.add.image(dx, dy, CHAMP_ATLAS, f0)
        .setOrigin(0.5, FEET).setScale(this._sc).setTintFill(this.outlineColor).setAlpha(0.95));
      this.sprite = scene.add.image(0, 0, CHAMP_ATLAS, f0).setOrigin(0.5, FEET).setScale(this._sc);
      this._frameKey = f0;
    } else {
      this.outlines = OUTLINE.map(([dx, dy]) => scene.add.image(dx, dy, POSE_KEYS.idle)
        .setOrigin(0.5, 0.85).setDisplaySize(SPR_W, SPR_H).setTintFill(this.outlineColor).setAlpha(0.95));
      this.sprite = scene.add.image(0, 0, POSE_KEYS.idle).setOrigin(0.5, 0.85).setDisplaySize(SPR_W, SPR_H);
    }
    // Emoji legend at the right end of the HP bar (the costume now marks the head).
    this.emoji = scene.add.text(BAR_W / 2 + 15, BAR_Y - 1, this.def.emoji, { fontSize: 17, padding: { y: 3 } }).setOrigin(0.5);
    this.shieldFx = scene.add.image(0, -42, 'moba-ring').setDisplaySize(116, 116).setTint(0xbfe6ff)
      .setAlpha(0.8).setVisible(false);
    this.spellBubble = scene.add.circle(0, -46, 46, 0x7b61ff, 0.14).setStrokeStyle(2.5, 0xa78bfa, 0.92).setVisible(false);
    this.stunFx = scene.add.text(0, -150, '💫', { fontSize: 24 }).setOrigin(0.5).setVisible(false);
    this.silenceFx = scene.add.text(0, -178, '🔇', { fontSize: 22 }).setOrigin(0.5).setVisible(false);
    this.ccIcon = scene.add.text(0, BAR_Y - 66, '', { fontSize: 28, padding: { y: 4 } }).setOrigin(0.5).setVisible(false); // v6.1: top CC icon above the plate
    this.status = scene.add.text(BAR_W / 2 + 6, BAR_Y + 20, '', { fontSize: 15 }).setOrigin(0, 0.5);
    // Bars
    this.hpBg = scene.add.rectangle(0, BAR_Y, BAR_W + 4, 11, 0x05080e, 0.9).setStrokeStyle(1.5, this.outlineColor, 0.9);
    this.hpGloss = scene.add.rectangle(0, BAR_Y - 1.5, BAR_W, 3, 0xffffff, 0.22);
    this.hpFill = scene.add.rectangle(-BAR_W / 2, BAR_Y, BAR_W, 7, BAR[this.rel] || BAR.enemy, 1).setOrigin(0, 0.5);
    this.shieldFill = scene.add.rectangle(-BAR_W / 2, BAR_Y, 0, 7, 0xffffff, 0.95).setOrigin(0, 0.5);
    this.ticks = scene.add.graphics();
    const parts = [shadow, this.aura, this.rootFx, this.ring, this.recallG, this.light, ...this._cBack, ...this.outlines,
      ...this._cMid, this.sprite, ...this._cFront,
      this.shieldFx, this.spellBubble, this.silenceFx];
    const over = [this.emoji, this.hpBg, this.hpFill, this.shieldFill, this.hpGloss, this.ticks];
    if (isMe) {
      this.mpBg = scene.add.rectangle(0, BAR_Y + 8, BAR_W + 4, 6, 0x05080e, 0.9).setStrokeStyle(1, 0x2f86e8, 0.7);
      this.mpFill = scene.add.rectangle(-BAR_W / 2, BAR_Y + 8, BAR_W, 3, 0x4aa8ff, 1).setOrigin(0, 0.5);
      over.push(this.mpBg, this.mpFill);
    }
    this.lvBg = scene.add.circle(-BAR_W / 2 - 13, BAR_Y + 1, 11.5, 0x0a0d14, 0.97).setStrokeStyle(2.5, this.outlineColor, 1);
    this.lvText = scene.add.text(-BAR_W / 2 - 13, BAR_Y + 1, '1', {
      fontFamily: FONT, fontSize: 11, color: '#ffd23f', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);
    const nm = String(ch.name || this.def.name).slice(0, 18);
    this.name = scene.add.text(0, BAR_Y - 17, ch.isBot ? `🤖 ${nm}` : nm, {
      fontFamily: FONT, fontSize: 13, color: isMe ? '#ffd23f' : teamCss(ch.team), stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);
    this.nameBg = scene.add.rectangle(0, BAR_Y - 17, this.name.width + 12, 17, 0x05080e, 0.55);
    this._isBot = !!ch.isBot;
    // EP-11: the player's cosmetic hat (TeamChamp.hat → emoji) floats above the nameplate.
    this._hat = null;
    this.hatT = scene.add.text(0, BAR_Y - 40, '', { fontSize: 20, padding: { y: 4 } }).setOrigin(0.5).setVisible(false);
    this._setHat(ch.hat);
    over.unshift(this.nameBg);
    over.push(this.lvBg, this.lvText, this.name, this.status, this.stunFx, this.hatT, this.ccIcon);
    c.add(parts);
    this.ov = scene.add.container(ch.x, ch.y, over).setDepth(OVERLAY_DEPTH);
    this._setPose('idle');
    this._buildKit(scene, c);
    if (this.dead) { c.setVisible(false); this.ov.setVisible(false); }
  }

  // ───────────────────────── v6 kit visuals ─────────────────────────
  _buildKit(scene, c) {
    // Model: up to 3 data orbs orbiting the body (kit:orbs)
    this._orbs = [];
    if (this.def.kit?.res?.show === 'orbs' && scene.textures.exists('vfx-magic_01')) {
      for (let i = 0; i < 3; i++) {
        const o = scene.add.image(0, -46, 'vfx-magic_01').setBlendMode(1).setTint(this.def.color || 0x6cffd6).setDisplaySize(22, 22).setVisible(false);
        c.add(o); this._orbs.push(o);
      }
    }
    // Rush: the carried package (kit:pkg)
    this._box = null;
    if (this.def.kit?.pkg) {
      const g = scene.add.graphics();
      g.fillStyle(0xc8a165, 1); g.fillRect(-12, -10, 24, 20);
      g.fillStyle(0xe8d4a8, 1); g.fillRect(-2, -10, 4, 20);
      g.lineStyle(2, 0x5a4020, 1); g.strokeRect(-12, -10, 24, 20);
      g.setVisible(false); c.add(g); this._box = g;
    }
    // Brew: a cup whose layers show the mix (kit:mix, oldest first)
    this._cup = null;
    if (this.def.kit?.mix) { this._cup = scene.add.graphics().setVisible(false); c.add(this._cup); }
    // Zero: a purple ring while a shadow clone exists (the clone itself is a world fx)
    this._shadowRing = null;
    if (this.def.kit?.shadow || this.champ === 'zero') {
      this._shadowRing = scene.add.ellipse(0, 2, 98, 36).setStrokeStyle(3, 0xa77bff, 0.85).setVisible(false);
      c.add(this._shadowRing);
    }
    // Tester: crosshair on an enemy while Spotted (buff tag 'spotted')
    this._cross = null;
  }

  /** Re-read the kit tags (only when the buffs string changed). */
  _applyKit(tags) {
    const k = parseKitTags(this._buffs);
    this._kit = k;
    const st = this.def.kit?.stance?.affectsSkills ? (STANCE_TINT[k.stance] ?? null) : null;
    if (st !== this._stanceTint) {
      this._stanceTint = st;
      this._applyTint();
      this.light.setTint(st ?? this.outlineColor);
    }
    const n = Math.max(0, Math.min(3, parseInt(k.orbs, 10) || 0));
    this._orbs.forEach((o, i) => o.setVisible(i < n));
    if (this._box) this._box.setVisible(!!k.pkg);
    if (this._shadowRing) this._shadowRing.setVisible(k.shadow === '1');
    if (this._cup) {
      const mix = (k.mix || '').slice(0, 3);
      this._cup.setVisible(mix.length > 0);
      if (mix !== this._mix) {
        this._mix = mix;
        const g = this._cup;
        g.clear();
        g.fillStyle(0x000000, 0.35); g.fillRect(-9, -12, 18, 24);
        for (let i = 0; i < mix.length; i++) { g.fillStyle(MIX_COLOR[mix[i]] ?? 0xffffff, 1); g.fillRect(-7, 8 - (i + 1) * 6, 14, 6); }
        g.lineStyle(2, 0xffffff, 0.9); g.strokeRect(-9, -12, 18, 24);
      }
    }
    const spotted = tags.includes('spotted') && this.rel === 'enemy';
    if (spotted !== this._spotted) {
      this._spotted = spotted;
      if (spotted && !this._cross) {
        this._cross = loopFb({ scene: this.scene }, 'crosshair', 0, -46, { size: 130, tint: 0xff4040, add: true, a: 0.9, rate: 12 });
        if (this._cross) { this._cross.setDepth(0); this.ov.add(this._cross); this.ov.sendToBack(this._cross); }
      }
      this._cross?.setVisible(spotted);
    }
  }

  /** Per-frame kit motion: orbiting orbs, bobbing box / cup (cheap, only visible nodes move). */
  _kitMotion(now) {
    const n = Math.max(0, Math.min(3, parseInt(this._kit.orbs, 10) || 0));
    for (let i = 0; i < n; i++) {
      const o = this._orbs[i], a = now / 520 + (i * Math.PI * 2) / 3;
      o.setPosition(Math.cos(a) * 40, -46 + Math.sin(a) * 14).setAlpha(0.75 + 0.25 * Math.sin(a));
    }
    const f = this.facing < 0 ? -1 : 1;
    if (this._box?.visible) this._box.setPosition(26 * f, -62 + Math.sin(now / 260) * 2);
    if (this._cup?.visible) this._cup.setPosition(-30 * f, -58 + Math.sin(now / 300 + 1) * 1.5);
  }

  _setHat(id) {
    const hid = typeof id === 'string' ? id : '';
    if (hid === this._hat) return;
    this._hat = hid;
    const e = hatEmoji(hid);
    this.hatT.setText(e).setVisible(!!e);
  }

  /** World point projectiles / sparks aim at (chest). */
  aimPoint() { return { x: this.x, y: this.y - 46 }; }
  hitTest(wx, wy) {
    const dx = wx - this.x, dy = wy - this.y;
    return Math.abs(dx) <= 36 && dy >= -104 && dy <= 16;
  }

  /** Apply synced state. Called every frame; heavy work only on change. */
  sync(ch, srvNow, now) {
    // Bot takeover keeps the same sid — refresh the 🤖 tag when isBot flips.
    if (!!ch.isBot !== this._isBot) {
      this._isBot = !!ch.isBot;
      const nm = String(ch.name || this.def.name).slice(0, 18);
      this.name.setText(this._isBot ? `🤖 ${nm}` : nm);
      this.nameBg.width = this.name.width + 12;
    }
    if ((ch.hat || '') !== this._hat) this._setHat(ch.hat || '');
    this.tx = ch.x; this.ty = ch.y;
    const dead = !!ch.dead;
    if (dead !== this.dead) {
      this.dead = dead;
      // puny: the body stays up for a short death animation (update() hides it); the plates hide at once
      if (dead && this._puny) this._deathUntil = now + 900; else { this.c.setVisible(!dead); this._deathUntil = 0; }
      this.ov.setVisible(!dead);
      if (!dead) { this.x = this._px = ch.x; this.y = this._py = ch.y; } // respawn → snap
    }
    if (ch.hp !== this.hp || ch.maxHp !== this.maxHp || ch.shield !== this.shield) {
      if (ch.maxHp !== this.maxHp) this._drawTicks(ch.maxHp);
      this.hp = ch.hp; this.maxHp = Math.max(1, ch.maxHp || 1); this.shield = ch.shield || 0;
      const p = Math.max(0, Math.min(1, this.hp / this.maxHp));
      this.hpFill.width = BAR_W * p;
      const sp = Math.min(1 - p, this.shield / this.maxHp);
      this.shieldFill.x = -BAR_W / 2 + BAR_W * p;
      this.shieldFill.width = BAR_W * Math.max(0, sp);
      if (this.shieldFx.visible && !(this.shield > 0) && this.def.kit?.res?.show === 'orbs' && !this.dead) {
        this.scene.fx?.sparks?.(this.x, this.y - 42, this.def.color || 0x6cffd6, 12, 230); // Overfit layers shatter
      }
      this.shieldFx.setVisible(this.shield > 0);
    }
    if (this.mpFill && (ch.mana !== this.mana || ch.maxMana !== this.maxMana)) {
      this.mana = ch.mana; this.maxMana = Math.max(1, ch.maxMana || 1);
      this.mpFill.width = BAR_W * Math.max(0, Math.min(1, this.mana / this.maxMana));
    }
    if ((ch.level || 1) !== this.level) {
      this.level = ch.level || 1;
      this.lvText.setText(String(this.level));
    }
    const seq = ch.action_seq || 0;
    if (seq !== this.actionSeq) {
      this.actionSeq = seq;
      this._alt = !this._alt;
      const pose = poseForAction(ch.action, this.def, this._alt, this._kit?.stance);
      if (pose) {
        this.actionPose = pose; this._actStart = now; this._actDur = pose === 'punch' || pose === 'kick' ? 320 : 430;
        this.actionUntil = now + this._actDur;
      }
    }
    // Status effects (server timestamps → compare against the server clock).
    const stunned = (ch.stunnedUntil || 0) > srvNow;
    if (stunned !== this.stunFx.visible) this.stunFx.setVisible(stunned);
    const rooted = (ch.rootedUntil || 0) > srvNow;
    if (rooted !== this.rootFx.visible) this.rootFx.setVisible(rooted);
    this.slowed = (ch.slowUntil || 0) > srvNow && (ch.slowPct || 0) > 0;
    this.recallUntil = (ch.recallUntil || 0) > srvNow ? ch.recallUntil : 0;
    if (ch.buffs !== this._buffs) this._applyBuffs(ch.buffs || '');
    const icons = (this.slowed ? '🐌' : '') + (this._coffee ? '☕' : '') + (this._silenced ? '🔇' : '');
    if (icons !== this.status.text) this.status.setText(icons);
    this.targetId = ch.targetId || '';
  }

  /** Round 2: crowded fights — shrink a non-focused nameplate (1 = normal). */
  setPlateScale(s) { if (s !== this._plateScale) { this._plateScale = s; this.ov.setScale(s); } }

  /** Local prediction drives the local champion's displayed position. */
  setDisplayPos(x, y) { this.x = x; this.y = y; }

  update(dt, now, srvNow, predicted) {
    if (this.dead) {
      if (this._deathUntil) {
        if (now < this._deathUntil) { this._setFrame(this._dirRow, ANIM.dead[now - (this._deathUntil - 900) > 260 ? 1 : 0]); this.sprite.y = 0; for (const o of this.outlines) o.y = 0; }
        else { this._deathUntil = 0; this.c.setVisible(false); }
      }
      return;
    }
    if (!predicted) {
      const dx = this.tx - this.x, dy = this.ty - this.y;
      if (dx * dx + dy * dy > 320 * 320) { this.x = this.tx; this.y = this.ty; } else {
        const k = approach(dt, 13);
        this.x += dx * k; this.y += dy * k;
      }
    }
    const mdx = this.x - this._px, mdy = this.y - this._py;
    this._px = this.x; this._py = this.y;
    const speed = Math.hypot(mdx, mdy) / Math.max(dt, 0.001);
    this.moving = speed > 30;
    const acting = now < this.actionUntil;
    if (acting && this.faceTo != null && Math.abs(this.faceTo - this.x) > 4) this.facing = this.faceTo < this.x ? -1 : 1;
    else if (Math.abs(mdx) > 0.4) this.facing = mdx < 0 ? -1 : 1;
    let pose;
    if (acting) pose = this.actionPose;
    else if (this.moving && !this._vehicle) pose = Math.floor((now + this._phase) / 150) % 2 ? 'run' : 'run2';
    else pose = 'idle';                         // Rush rides: idle stance on the deck
    this._setPose(pose);
    const flip = this.facing < 0;
    if (this._puny) {
      // 8-way facing from the (smoothed) travel vector; attacks turn toward the target (screen side)
      if (acting && this.faceTo != null && Math.abs(this.faceTo - this.x) > 4) { this._fvx = this.faceTo < this.x ? -1 : 1; this._fvy = 0; }
      else if (this.moving && !this._vehicle) {
        const l = Math.hypot(mdx, mdy) || 1, k = approach(dt, 12);
        this._fvx += (mdx / l - this._fvx) * k; this._fvy += (mdy / l - this._fvy) * k;
      } else if (this._vehicle && Math.abs(mdx) > 0.4) { this._fvx = mdx < 0 ? -1 : 1; this._fvy = 0.3; }
      this._dirRow = dirRow(this._fvx, this._fvy);
      let col = 0;
      if (this._flashUntil && now < this._flashUntil) col = ANIM.flash;
      else if (acting) {
        const a = ANIM[pose === 'parry' ? 'cast' : this._kind], p = Math.max(0, Math.min(0.999, (now - this._actStart) / this._actDur));
        col = a[Math.floor(p * a.length)];
      } else if (this.moving && !this._vehicle) col = ANIM.walk[Math.floor((now + this._phase) / 115) % 4];
      this._setFrame(this._dirRow, col);
    } else if (this.sprite.flipX !== flip) {
      this.sprite.setFlipX(flip);
      for (const o of this.outlines) o.setFlipX(flip);
    }
    let bob, lean = 0;
    if (this._vehicle) {
      bob = this.moving ? Math.sin((now + this._phase) / 45) * 0.6 : Math.sin((now + this._phase) / 520) * 0.8;
      lean = this.moving && !acting ? 0.13 : 0;
      this._lean += (lean - this._lean) * approach(dt, 10);
      if (this.moving) this._wheelRot += (Math.hypot(mdx, mdy) / 5.5) * this.facing;
    } else {
      bob = (!this.moving && !acting) ? Math.sin((now + this._phase) / 480) * 1.6 : (this._puny && this.moving && !acting ? -Math.abs(Math.sin((now + this._phase) / 115 * 0.5 * Math.PI)) * 3 : 0);
      this._lean = 0;
    }
    const lift = (this._vehicle ? -SCOOTER_LIFT : 0) - this._airY;
    const rot = this._lean * this.facing;
    this.sprite.y = bob + lift;
    this.sprite.rotation = rot;
    for (let i = 0; i < this.outlines.length; i++) {
      const o = this.outlines[i];
      o.y = OUTLINE[i][1] + bob + lift; o.rotation = rot;
    }
    this._layoutCostume(bob + lift, rot);
    // Hit flash (outline goes white for a moment).
    if (this._flashUntil && now >= this._flashUntil) {
      this._flashUntil = 0;
      for (const o of this.outlines) o.setTintFill(this.outlineColor);
    }
    if (this.slowed !== this._slowTint) {
      this._slowTint = this.slowed;
      this._applyTint();
    }
    if (this.stunFx.visible) this.stunFx.setAngle((now / 4) % 360);
    if (this.shieldFx.visible) this.shieldFx.setAlpha(0.55 + 0.25 * Math.sin(now / 160));
    if (this.aura.visible) {
      const s = 1 + 0.08 * Math.sin((now + this._phase) / 180);
      this.aura.setScale(s);
    }
    this._drawRecall(srvNow);
    this._kitMotion(now);
    this._ccFrame(dt, now);
    this.c.setPosition(this.x + this._shakeX, this.y);
    if (this._plateDy !== this.plateDy) {
      const d = this.plateDy - this._plateDy;
      this._plateDy = Math.abs(d) < 0.5 ? this.plateDy : this._plateDy + d * approach(dt, 14);
    }
    this.ov.setPosition(this.x, this.y + this._plateDy);
    const dep = depthAt(this.y);
    if (Math.abs(dep - this.c.depth) > 0.01) this.c.setDepth(dep);
  }

  // ───────────────────────── v6.1 CC looks (docs/02_CHAMPIONS_AND_SKILLS.md [v6.1 numbering] section 7.1) ─────────────────────────
  /** Re-read the cc: tags (called when the buffs string changes): top icon, tint, lazily built overlays (built once per view, then only toggled). */
  _applyCc(list) {
    const was = this._ccList;
    if (list.length === was.length && list.every((k, i) => k === was[i])) return;
    this._ccList = list;
    const has = (k) => list.includes(k);
    if (was.includes('airborne') && !has('airborne')) this.scene.fx?.part?.(this.x, this.y, { tex: 'vfx-smoke_04', tint: 0xffffff, s0: 40, s1: 130, a0: 0.5, life: 0.4, depth: D.fx }); // thud
    this._ccTint = has('suppress') ? CC_TINT.suppress : has('charm') ? CC_TINT.charm : has('fear') ? CC_TINT.fear : null;
    this._applyTint();
    if (list.length) { this.ccIcon.setText(CC_TYPES[list[0]].icon).setVisible(true); if (!this._ccO) this._ccO = this._buildCc(); } else this.ccIcon.setVisible(false);
    const o = this._ccO;
    if (!o) return;
    o.hearts.forEach((h) => h.setVisible(has('charm')));
    o.stars.forEach((s) => s.setVisible(has('airborne')));
    o.sweat.forEach((s) => s.setVisible(has('fear')));
    o.anger.setVisible(has('taunt'));
    o.visor.setVisible(has('blind'));
    o.halo.setVisible(has('revive'));
    o.dots.setVisible(has('untarget'));
    if (!has('charm') && !has('taunt')) o.line.clear().setVisible(false);
  }

  _buildCc() {
    const sc = this.scene;
    const img = (k, tint, size) => {
      if (!sc.textures.exists('vfx-' + k)) return sc.add.circle(0, 0, size / 2, tint).setVisible(false);
      return sc.add.image(0, 0, 'vfx-' + k).setTint(tint).setBlendMode(1).setDisplaySize(size, size).setVisible(false);
    };
    const o = {
      hearts: [0, 1, 2].map(() => sc.add.text(0, 0, '\u2665', { fontSize: 16, color: '#ff8fb3', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5).setVisible(false)),
      stars: [0, 1, 2].map(() => img('star_04', 0xffe066, 20)),
      sweat: [0, 1, 2].map(() => img('symbol_01', 0x9fd4ff, 16)),
      anger: img('symbol_01', 0xff4040, 30),
      visor: sc.add.graphics().setVisible(false),
      halo: sc.add.graphics().setVisible(false),
      dots: sc.add.graphics().setVisible(false),
      line: sc.add.graphics().setVisible(false),
    };
    o.visor.fillStyle(0x0a0a14, 0.85); o.visor.fillRoundedRect(-17, -88, 34, 10, 3);
    o.halo.lineStyle(9, 0xfff3a0, 0.25); o.halo.strokeEllipse(0, 0, 54, 15); o.halo.lineStyle(4, 0xfff3a0, 0.95); o.halo.strokeEllipse(0, 0, 54, 15);
    o.dots.lineStyle(3, 0xbfd4ff, 0.9);
    for (let i = 0; i < 28; i += 2) { // dotted outline: 14 short arcs of an ellipse around the body
      o.dots.beginPath();
      for (let k = 0; k <= 3; k++) { const t = ((i + k / 3) / 28) * Math.PI * 2; const px = Math.cos(t) * 36, py = -46 + Math.sin(t) * 58; if (k) o.dots.lineTo(px, py); else o.dots.moveTo(px, py); }
      o.dots.strokePath();
    }
    this.c.add([...o.hearts, ...o.stars, ...o.sweat, o.anger, o.visor, o.halo, o.dots, o.line]);
    return o;
  }

  /** Per-frame CC motion: air lift + shadow, orbiting hearts / stars, shake, halo bob, lines to the charm / taunt source; also the body alpha. */
  _ccFrame(dt, now) {
    const fx = this.scene.fx, list = this._ccList, has = (k) => list.includes(k);
    const a = Math.min(this._stealth ? 0.42 : 1, has('untarget') ? CC_ALPHA.untarget : 1, (fx?.ghostUntil?.get(this.id) || 0) > now ? CC_ALPHA.ghost : 1);
    if (a !== this._bodyA) {
      this._bodyA = a;
      this.sprite.setAlpha(a);
      for (const ol of this.outlines) ol.setAlpha(a < 1 ? a : 0.95);
      for (const im of this._costumeImgs) im.setAlpha(a);
    }
    const air = has('airborne') ? CC_TUNING.AIR_LIFT_PX : 0;
    if (air || this._airY) {
      this._airY += (air - this._airY) * approach(dt, 16);
      if (Math.abs(air - this._airY) < 0.5) this._airY = air;
      this.shadow.setScale(1 - 0.4 * (this._airY / CC_TUNING.AIR_LIFT_PX));
    }
    this._shakeX = has('fear') ? ((Math.floor(now / 40) & 1) ? 2 : -2) : 0;
    const o = this._ccO;
    if (!o || !list.length) return;
    if (has('airborne')) o.stars.forEach((s, i) => { const t = now / 220 + i * 2.09; s.setPosition(Math.cos(t) * 24, -112 - this._airY + Math.sin(t) * 6).setRotation(t); });
    if (has('charm')) o.hearts.forEach((h, i) => { const t = now / 380 + i * 2.09; h.setPosition(Math.cos(t) * 30, -104 + Math.sin(t) * 9).setAlpha(0.7 + 0.3 * Math.sin(t)); });
    if (has('fear')) o.sweat.forEach((s, i) => { const k = (now / 7 + i * 13) % 36; s.setPosition((i - 1) * 24, -96 + k).setAlpha(0.9 - k / 50); });
    if (has('taunt')) { const z = 30 + 4 * Math.sin(now / 90); o.anger.setPosition(22, -110 + Math.sin(now / 90) * 2).setDisplaySize(z, z); }
    if (has('blind')) o.visor.setY(-this._airY);
    if (has('revive')) o.halo.setPosition(0, -150 - 3 * Math.sin(now / 300)).setAlpha(0.75 + 0.25 * Math.sin(now / 200));
    const lk = has('charm') ? 'charm' : has('taunt') ? 'taunt' : '';
    if (lk) {
      const info = fx?.ccInfo?.get(this.id + '|' + lk), sv = info && info.sid ? this.scene.views?.champs?.get(info.sid) : null;
      o.line.clear();
      if (sv && !sv.dead) {
        o.line.setVisible(true).lineStyle(2, lk === 'charm' ? 0xff7eb6 : 0xff4040, 0.55);
        o.line.beginPath(); o.line.moveTo(0, -46); o.line.lineTo(sv.x - this.x, sv.y - this.y - 46); o.line.strokePath();
      } else o.line.setVisible(false);
    }
  }

  /** Brief white outline (took damage). */
  flash(color = 0xffffff) {
    if (this.dead || !calmPrefs().flashes) return; // EP-10: settings.flashes off → no white outline
    for (const o of this.outlines) o.setTintFill(color);
    this._flashUntil = this.scene.time.now + 90;
  }

  /**
   * v4 bushes: translucent + leaf tint while hidden in a bush (the world scene calls this for
   * own-team champions with `inBush`). Cheap to call every frame — work only on change.
   */
  setHidden(on) {
    on = !!on;
    if (on === this.hidden || this.destroyed) return this;
    this.hidden = on;
    this._applyTint();
    if (!this._fading) this._tweenAlpha(on ? HIDDEN_ALPHA : 1, on ? HIDDEN_OV_ALPHA : 1, 160);
    return this;
  }

  /** Fade in from transparent (an enemy re-added by the server when it leaves a bush). */
  fadeIn(ms = FADE_MS) {
    if (this.destroyed) return this;
    this._fading = false;
    this.c.setAlpha(0); this.ov.setAlpha(0);
    this._tweenAlpha(this.hidden ? HIDDEN_ALPHA : 1, this.hidden ? HIDDEN_OV_ALPHA : 1, ms);
    return this;
  }

  /** Fade out, then destroy (the server removed this view, e.g. an enemy went into a bush). */
  fadeOut(ms = FADE_MS, onDone = null) {
    if (this.destroyed) { onDone?.(); return this; }
    this._fading = true;
    this._tweenAlpha(0, 0, ms, () => { this.destroy(); onDone?.(); });
    return this;
  }

  /** Idempotent; kills this view's tweens so nothing touches destroyed objects. */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const tw = this.scene?.tweens;
    if (tw) { tw.killTweensOf(this.c); tw.killTweensOf(this.ov); }
    this.c.destroy(); this.ov.destroy();
  }

  _tweenAlpha(a, aOv, ms, onComplete) {
    const tw = this.scene.tweens;
    tw.killTweensOf(this.c); tw.killTweensOf(this.ov);
    tw.add({ targets: this.c, alpha: a, duration: ms, ease: 'Sine.easeOut', onComplete: onComplete || undefined });
    tw.add({ targets: this.ov, alpha: aOv, duration: ms, ease: 'Sine.easeOut' });
  }

  /** Body tint: slow (blue) beats bush (leaf); none otherwise. */
  _applyTint() {
    const t = this._ccTint ?? (this.slowed ? SLOW_TINT : (this.hidden ? LEAF_TINT : this._stanceTint));
    for (const o of [this.sprite, ...this._costumeImgs]) { if (t != null) o.setTint(t); else o.clearTint(); }
    this.light.setAlpha(this.hidden ? 0.1 : 0.26);
  }

  // ───────────────────────── internals ─────────────────────────
  // ── costume (looks.js) ──
  _buildCostume(scene) {
    this._cBack = []; this._cMid = []; this._cFront = []; this._costumeImgs = [];
    this._costume = new Map();                  // slot → image
    this._layout = null; this._layoutPose = null;
    this._lean = 0; this._wheelRot = 0;
    const keys = costumeKeys(this.champ);
    this._vehicle = keys.vehicle === 'scooter' && scene.textures.exists('look-scooter') ? 'scooter' : null;
    const mk = (key) => {
      const m = lookMeta(key);
      if (!m || !scene.textures.exists(key)) return null;
      const img = scene.add.image(0, 0, key).setOrigin(m.ox, m.oy).setDisplaySize(m.w, m.h);
      this._costumeImgs.push(img);
      return img;
    };
    if (this._vehicle) {
      const deck = mk('look-scooter');
      this._wheels = [mk('look-wheel'), mk('look-wheel')].filter(Boolean);
      if (deck) this._cBack.push(deck);
      this._cBack.push(...this._wheels);
      this._deck = deck;
    }
    for (const p of (this._puny ? [] : costumeLayout(this.champ, 'idle'))) {
      const img = mk(p.key);
      if (!img) continue;
      this._costume.set(p.slot, img);
      (p.layer === 'front' ? this._cFront : this._cMid).push(img);
    }
  }

  /** Position the costume for the current pose / facing / bob / lean (cheap: ≤ 6 images). */
  _layoutCostume(dy, rot) {
    if (this._layoutPose !== this.pose) { this._layoutPose = this.pose; this._layout = costumeLayout(this.champ, this.pose); }
    const f = this.facing < 0 ? -1 : 1, flip = f < 0;
    const c = Math.cos(rot), s = Math.sin(rot);
    // Rotate around the feet (sprite origin) like the sprite itself.
    const place = (img, lx, ly, r) => {
      const x = lx * f, y = ly;
      img.x = x * c - y * s;
      img.y = x * s + y * c + dy;
      img.rotation = r * f + rot;
      if (img.flipX !== flip) img.setFlipX(flip);
    };
    for (const p of this._layout) {
      const img = this._costume.get(p.slot);
      if (img) place(img, p.x, p.y, p.rot);
    }
    if (this._vehicle) {
      // The scooter stays on the ground (no bob / lift), tilts slightly with the lean.
      if (this._deck) { this._deck.x = 0; this._deck.y = 0; this._deck.rotation = rot * 0.35; if (this._deck.flipX !== flip) this._deck.setFlipX(flip); }
      const wx = [-17, 20];
      this._wheels.forEach((w, i) => { w.x = wx[i] * f; w.y = 1; w.rotation = this._wheelRot; });
    }
  }

  /** Swap the atlas frame of the body + its 4 outline copies (only on change). */
  _setFrame(row, col) {
    const k = champFrame(this.scene, this._ci, row, col);
    if (k === this._frameKey) return;
    this._frameKey = k;
    this.sprite.setFrame(k);
    for (const o of this.outlines) o.setFrame(k);
  }

  _setPose(pose) {
    if (this._puny) { this.pose = pose; return; }
    if (pose === this.pose) return;
    const key = POSE_KEYS[pose] || POSE_KEYS.idle;
    if (!this.scene.textures.exists(key)) return;
    this.pose = pose;
    this.sprite.setTexture(key).setDisplaySize(SPR_W, SPR_H);
    for (const o of this.outlines) o.setTexture(key).setDisplaySize(SPR_W, SPR_H);
  }

  _drawTicks(maxHp) {
    const g = this.ticks;
    g.clear();
    const m = Math.max(1, maxHp || 1);
    for (let hp = 100; hp < m; hp += 100) {
      const x = -BAR_W / 2 + BAR_W * (hp / m);
      const big = hp % 1000 === 0;
      g.lineStyle(big ? 2 : 1, 0x000000, big ? 0.95 : 0.7);
      g.lineBetween(x, BAR_Y - 3.5, x, BAR_Y + (big ? 3.5 : 0.5));
    }
  }

  _applyBuffs(str) {
    this._buffs = str;
    const tags = str ? str.split(',').map((t) => t.trim()).filter(Boolean) : [];
    this._coffee = tags.includes('coffee');
    this._applyKit(tags);
    this._silenced = tags.includes('silenced');
    this.spellBubble?.setVisible(tags.includes('spellshield'));
    this.silenceFx?.setVisible(tags.includes('silenced'));
    this._stealth = tags.includes('stealth');
    this._bodyA = -1; // body alpha (stealth / untargetable / ghost dash) is re-applied in update()
    this._applyCc(parseCcTags(str));
    let color = null;
    for (const t of BUFF_PRIORITY) {
      if (!tags.includes(t)) continue;
      color = t === 'deadline' ? 0xff5a2a : (resolveSkill(this.def, t, parseKitTags(str).stance)?.color ?? 0xffffff);
      break;
    }
    this._auraColor = color;
    if (color == null) { this.aura.setVisible(false); return; }
    this.aura.setStrokeStyle(4, color, 0.95).setFillStyle(color, 0.12).setVisible(true);
  }

  _drawRecall(srvNow) {
    const g = this.recallG;
    if (!this.recallUntil) { if (g.visible) g.clear().setVisible(false); return; }
    const left = Math.max(0, this.recallUntil - srvNow);
    const p = 1 - Math.min(1, left / RECALL_MS);
    g.clear().setVisible(true);
    g.fillStyle(0x39c2ff, 0.16); g.fillRect(-26, -150, 52, 152);
    g.fillStyle(0x9fe0ff, 0.22); g.fillRect(-10, -150, 20, 152);
    g.lineStyle(5, 0x39c2ff, 0.35); g.strokeEllipse(0, 2, 98, 36);
    g.lineStyle(5, 0x39c2ff, 0.3); g.strokeCircle(0, -46, 60);
    g.lineStyle(5, 0x9fe0ff, 1);
    g.beginPath(); g.arc(0, -46, 60, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); g.strokePath();
  }
}

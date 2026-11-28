// units/champions.js - rigged GLB champions (4 base models x per-champion hand items + palette tint), team ring,
// animation state machine (idle / run / cast one-shots / death). Ported from three/units3d.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CHAMPIONS, parseKitTags } from '../../../shared/moba/champions.js';
import { HATS } from '../../data/cosmetics.js';
import { S, TEAM_COL, asset } from '../world/ground.js';
import { gearGeometry, gearMaterial } from './gear.js';
import { ProcRig } from './proc.js';
const EXT = (n) => new URL('../assets/ext/' + n + '.glb', import.meta.url).href; // extra CC0 KayKit Skeletons (src/three/assets/LICENSE.txt)
const SKEL = new Set(['Skeleton_Warrior', 'Skeleton_Mage', 'Skeleton_Rogue', 'Skeleton_Minion']);

const CHAMP_SCALE = 0.72;
const TELEPORT_PX = 500; // a one-frame jump bigger than this (respawn, recall, blink) is not "running"
const STANCE_TINT = { hotfix: 0xffb0d0, feature: 0xb8f5a0, bucket: 0xb0dcff };
const _tmpCol = new THREE.Color();
const HAT_EMOJI = Object.fromEntries(HATS.filter((h) => h.id && h.emoji).map((h) => [h.id, h.emoji]));
const _hatTex = new Map();
function hatTexture(emoji) {
  let t = _hatTex.get(emoji);
  if (!t) {
    const cv = document.createElement('canvas'); cv.width = 96; cv.height = 96;
    const g = cv.getContext('2d');
    g.font = '64px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = 8;
    g.fillText(emoji, 48, 52);
    t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    _hatTex.set(emoji, t);
  }
  return t;
}

// champion id -> [base model, right-hand item, left-hand item]
export const LOOK = {
  // KayKit Adventurers (CC0)
  stack: ['Knight', '1H_Sword', 'Rectangle_Shield'], dev: ['Barbarian', '2H_Axe', null], pixel: ['Mage', '1H_Wand', 'Spellbook'], courier: ['Rogue', 'Knife', null],
  hr: ['Mage', '2H_Staff', null],
  // KayKit Skeletons (CC0): undead / ghost-in-the-machine silhouettes with their own hood / hat / helmet / cloak
  guard: ['Skeleton_Warrior', null, null], model: ['Skeleton_Mage', null, null], zero: ['Skeleton_Rogue', null, null], sprint: ['Skeleton_Minion', null, null],
  // procedural rigs (proc.js)
  ops: ['P:robot', null, null], embedded: ['P:robot:dome', null, null], barista: ['P:round', null, null], cleaner: ['P:round', null, null],
  lint: ['P:tall', null, null], oncall: ['P:tall:hood', null, null], tester: ['P:block', null, null], appdev: ['P:block', null, null], cache: ['P:block', null, null],
};
// per-champion size multiplier [height, width] on top of ROLE_SIZE - widens the silhouette gaps between champions sharing a body
const SIZE_K = { stack: [1.08, 1.12], guard: [1.12, 1.15], ops: [1.18, 1.15], embedded: [0.86, 0.92], barista: [0.95, 1.0], cleaner: [1.08, 0.88], lint: [1.12, 0.95], oncall: [0.98, 1.0], sprint: [1.25, 1.0],
  tester: [1.0, 1.0], appdev: [1.1, 0.95], cache: [0.9, 1.1], hr: [1.1, 0.92], pixel: [1.0, 0.95], model: [1.1, 0.95], zero: [0.95, 0.88], courier: [0.95, 0.95], dev: [1.0, 1.1] };
const ITEM_NAMES = new Set(['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield', '1H_Sword', '2H_Sword', 'Spellbook', 'Spellbook_open', '1H_Wand', '2H_Staff',
  'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable', '1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', '2H_Axe', 'Mug']);
const SLOT_ANIM = { melee: { q: '2H_Melee_Attack_Slice', w: 'Block_Attack', e: 'Dodge_Forward', r: '2H_Melee_Attack_Spin' }, ranged: { q: 'Spellcast_Shoot', w: 'Spellcast_Raise', e: 'Dodge_Forward', r: 'Spellcast_Long' } };

/** -> {base:{Knight,...gltf}, clips} (all four models share the Rig_Medium clip set) */
export async function loadChampionModels() {
  const gl = new GLTFLoader();
  const names = ['Knight', 'Barbarian', 'Mage', 'Rogue', ...SKEL];
  const res = await Promise.all(names.map((n) => gl.loadAsync(SKEL.has(n) ? EXT(n) : asset(`models/${n}.glb`)).catch((e) => { console.warn('[units] model', n, e); return null; })));
  names.forEach((n, i) => { if (!res[i]) res[i] = res[0]; }); // missing extra model -> Knight
  const base = {}, gray = {}; names.forEach((n, i) => { base[n] = res[i]; gray[n] = SKEL.has(n) ? null : desaturatedMap(res[i].scene); });
  return { base, gray, clips: res[0].animations };
}
/** Palette atlas -> 35% saturated copy (built once per base model) so a champion palette tint reads as a real hue instead of a dark multiply. */
function desaturatedMap(scene) {
  try {
    let src = null; scene.traverse((o) => { if (!src && o.isMesh && o.material && o.material.map) src = o.material.map; });
    const im = src && src.image; if (!im || !im.width) return null;
    const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) { const l = (p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11) * 1.08; p[i] = p[i] * 0.35 + l * 0.65; p[i + 1] = p[i + 1] * 0.35 + l * 0.65; p[i + 2] = p[i + 2] * 0.35 + l * 0.65; }
    g.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.flipY = src.flipY; t.colorSpace = src.colorSpace; t.wrapS = src.wrapS; t.wrapT = src.wrapT; t.magFilter = src.magFilter; t.minFilter = src.minFilter; t.generateMipmaps = src.generateMipmaps; return t;
  } catch (e) { return null; }
}
// silhouette by role: [height scale, width multiplier]
const ROLE_SIZE = { Tank: [0.84, 1.14], Fighter: [0.77, 1.05], Controller: [0.72, 0.98], Mage: [0.72, 0.98], Marksman: [0.7, 0.93], Assassin: [0.66, 0.9], Jungler: [0.71, 1.0], Support: [0.68, 0.98] };

export class ChampView {
  constructor(parent, c, id, models) {
    const def = CHAMPIONS[c.champ] || CHAMPIONS.stack || Object.values(CHAMPIONS)[0];
    this.id = id; this.def = def; this.ranged = !!def.ranged;
    this.root = new THREE.Group(); parent.add(this.root);
    this.champ = c.champ;
    const [model, , left] = LOOK[c.champ] || ['Knight', '1H_Sword', null];
    const [hs, ws] = ROLE_SIZE[def.role] || [CHAMP_SCALE, 1], look = def.look || {}, [kh, kw] = SIZE_K[c.champ] || [1, 1];
    const proc = model.startsWith('P:'), skel = SKEL.has(model), pal = look.palette || [0xffffff, 0xffffff];
    this.mats = []; this.own = []; this.rig = null; let bones = {};
    if (proc) {
      const [, kind, variant] = model.split(':'); this.rig = new ProcRig(c.champ, kind, pal, variant); this.model = this.rig.model; this.mats.push(this.rig.mat); bones = this.rig.bones;
    } else this.model = SkeletonUtils.clone((models.base[model] || models.base.Knight).scene);
    const CK = 0.8; this.model.scale.set(CK * hs * ws * kw, CK * hs * kh, CK * hs * ws * kw);
    this.root.add(this.model);
    let hasHead = false;
    if (!proc) {
      const gmap = models.gray && models.gray[model];
      const tint = new THREE.Color(1, 1, 1).lerp(new THREE.Color(pal[0]), skel ? 0.42 : gmap ? 0.8 : 0.5), capeTint = new THREE.Color(1, 1, 1).lerp(new THREE.Color(pal[1]), skel ? 0.5 : gmap ? 0.85 : 0.5);
      this.model.traverse((o) => {
        if (ITEM_NAMES.has(o.name)) o.visible = o.name === left; // the right-hand weapon is replaced by the champion's own prop (gear.js)
        if (!skel && /_Hat$|Helmet$/.test(o.name)) o.visible = false; // base-model headwear is replaced by the champion's own hat
        if (skel && /_Hat$|_Helmet$|_Hood$/.test(o.name)) hasHead = true; // skeleton keeps its own headwear: no gear hat on top
        if (o.name === 'head' || o.name === 'chest' || o.name === 'handslot.r') bones[o.name] = o;
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
          const eyes = /Eyes$/.test(o.name);
          o.material = new THREE.MeshStandardMaterial({ map: (gmap && !ITEM_NAMES.has(o.name) ? gmap : o.material.map), color: eyes ? 0xffffff : /Cape$|Cloak$|Hood$/.test(o.name) ? capeTint : tint, roughness: 0.72, metalness: 0.0, envMapIntensity: 0.45, emissive: new THREE.Color(0) }); this.mats.push(o.material);
        }
      });
    }
    for (const [slot, bone] of [['hat', 'head'], ['prop', 'handslot.r'], ['outfit', 'chest']]) {
      if (slot === 'hat' && hasHead) continue;
      const geo = bones[bone] && gearGeometry(c.champ, look, slot); if (!geo) continue;
      const mesh = new THREE.Mesh(geo, gearMaterial()); mesh.castShadow = true; mesh.frustumCulled = false; bones[bone].add(mesh); this.own.push(mesh);
    }
    if (look.vehicle) { // courier scooter under the feet, attached to this.model so it rotates with yaw
      const geo = gearGeometry(c.champ, look, 'vehicle');
      if (geo) {
        const v = new THREE.Mesh(geo, gearMaterial());
        const sx = this.model.scale.x || 1, sy = this.model.scale.y || 1, sz = this.model.scale.z || 1;
        this.model.position.y = 0.16;
        v.position.y = (0.1 - 0.16) / sy;
        v.scale.set(0.8 / sx, 0.8 / sy, 0.8 / sz);
        v.frustumCulled = false;
        this.model.add(v);
        this.own.push(v);
      }
    }
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: TEAM_COL[c.team] || TEAM_COL.neutral, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
    this.ring.position.y = 0.03; this.root.add(this.ring);
    this.mixer = this.rig ? null : new THREE.AnimationMixer(this.model);
    this.clips = models.clips; this.act = {}; this.cur = null; this.busy = 0; this.dead = false; this.flashT = 0; this.atkRecoil = 0;
    this._alpha = 1; this._buffs = ''; this._stanceCol = 0; this._hoverCol = 0;
    this._hatId = ''; this.hatSprite = null; this._hatY = THREE.MathUtils.clamp(1.38 * (hs / CHAMP_SCALE) * kh, 1.24, 1.56);
    this.px = c.x; this.py = c.y; this.yaw = c.team === 'blue' ? -0.7 : 2.4; this.faceYaw = undefined; this.speed = 0; this.moving = false; this.seq = c.action_seq || 0;
    this.team = c.team;
    this.play('Idle', 0);
  }
  action(name) {
    if (!this.mixer) return null;
    let a = this.act[name];
    if (!a) { const clip = this.clips.find((k) => k.name === name); if (!clip) return null; a = this.act[name] = this.mixer.clipAction(clip); }
    return a;
  }
  play(name, fade = 0.15, { once = false, ts = 1 } = {}) {
    if (this.rig) { if (!once) this.rig.mode = name; return; }
    const a = this.action(name); if (!a) return;
    if (this.cur === a && !once) { a.timeScale = ts; return; }
    a.reset(); a.timeScale = ts; a.enabled = true;
    if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } else a.setLoop(THREE.LoopRepeat, Infinity);
    if (this.cur && this.cur !== a) a.crossFadeFrom(this.cur, fade, false);
    a.play(); this.cur = a;
  }
  oneShot(name, ts = 1.4) {
    if (this.rig) { if (this.dead) return; const k = /Spell|Ranged/.test(name) ? 'cast' : /Dodge/.test(name) ? 'dash' : 'swing'; this.rig.once(k, k === 'dash' ? 0.35 : 0.42); this.busy = 0.4; return; }
    const a = this.action(name); if (!a || this.dead) return;
    this.play(name, 0.06, { once: true, ts });
    this.busy = Math.min(a.getClip().duration / ts, 0.9);
  }
  flash() { this.flashT = 0.14; }
  attack(tx, ty) {
    if (this.dead) return;
    if (Number.isFinite(tx) && Number.isFinite(ty)) this.faceYaw = Math.atan2(tx - this.px, ty - this.py);
    this.oneShot(this.ranged ? (this.def.role === 'Marksman' ? '1H_Ranged_Shoot' : 'Spellcast_Shoot') : '1H_Melee_Attack_Slice_Horizontal', 2.0);
    this.atkRecoil = 0.16;
  }
  _applyBaseEmissive() {
    if (this._hoverCol) { _tmpCol.setHex(this._hoverCol).multiplyScalar(0.38); for (const m of this.mats) m.emissive.copy(_tmpCol); }
    else if (this._stanceCol) { _tmpCol.setHex(this._stanceCol).multiplyScalar(0.28); for (const m of this.mats) m.emissive.copy(_tmpCol); }
    else { for (const m of this.mats) m.emissive.setRGB(0, 0, 0); }
  }
  setHover(rel) {
    const col = rel === 'enemy' ? 0xff4a4a : rel === 'ally' ? 0x5fe36a : rel === 'neutral' ? 0xffd23f : 0;
    if (col === this._hoverCol) return;
    this._hoverCol = col;
    if (this.flashT <= 0) this._applyBaseEmissive();
  }
  update(c, dt) {
    const dx = c.x - this.px, dy = c.y - this.py, d = Math.hypot(dx, dy);
    const tele = d > TELEPORT_PX;
    const v = dt > 0 && !tele ? d / dt : 0;
    this.speed += (v - this.speed) * Math.min(1, dt * 12);
    this.px = c.x; this.py = c.y;
    if (d > 1.5 && !tele) this.faceYaw = Math.atan2(dx, dy);
    if (this.faceYaw !== undefined) { let df = this.faceYaw - this.yaw; df = Math.atan2(Math.sin(df), Math.cos(df)); this.yaw += df * Math.min(1, dt * 14); }
    this.root.position.set(c.x * S, 0, c.y * S); this.model.rotation.y = this.yaw;
    if (c.dead && !this.dead) { this.dead = true; this.atkRecoil = 0; this.play('Death_A', 0.1, { once: true }); }
    else if (!c.dead && this.dead) { this.dead = false; this.cur = null; this.busy = 0; this.atkRecoil = 0; this.play('Idle', 0.2); }
    if (this.atkRecoil > 0 && !this.dead) {
      this.atkRecoil = Math.max(0, this.atkRecoil - dt);
      const k = Math.sin((this.atkRecoil / 0.16) * Math.PI) * (this.ranged ? -0.14 : 0.22);
      this.model.position.x = Math.sin(this.yaw) * k;
      this.model.position.z = Math.cos(this.yaw) * k;
    } else if (this.model.position.x !== 0 || this.model.position.z !== 0) {
      this.model.position.x = 0;
      this.model.position.z = 0;
    }
    this.ring.visible = !c.dead;
    if (!this.dead) {
      if (c.action_seq !== this.seq) {
        this.seq = c.action_seq; const slot = c.action;
        if (slot && slot.length === 1 && 'qwer'.includes(slot)) this.oneShot(SLOT_ANIM[this.ranged ? 'ranged' : 'melee'][slot], 1.5);
      }
      if (this.busy > 0) this.busy -= dt;
      else {
        const moving = this.moving ? this.speed > 25 : this.speed > 70; this.moving = moving;
        if (moving) this.play('Running_A', 0.12, { ts: THREE.MathUtils.clamp(this.speed / 300, 0.7, 1.7) }); else this.play('Idle', 0.2);
      }
    }
    if (this.rig) this.rig.update(dt, this.speed, this.dead); else this.mixer.update(dt);
    const tags = c.buffs || '';
    const src = typeof window !== 'undefined' && window.__three && window.__three.source;
    const st = src && src.state && src.state();
    const me = st && st.champions && st.champions.get && st.champions.get(src.localId);
    const isOwnTeam = !me || c.team === me.team;
    const ghosted = !!c.stealthed || tags.includes('cc:untarget') || tags.includes('cc:ghost');
    const bushHidden = !this.dead && !!c.inBush && isOwnTeam;
    const wantA = ghosted ? 0.38 : bushHidden ? 0.48 : 1;
    if (wantA !== this._alpha) {
      this._alpha = wantA;
      for (const m of this.mats) { m.transparent = wantA < 1; m.opacity = wantA; m.depthWrite = wantA >= 1; m.needsUpdate = true; }
    }
    const hatId = c.hat || '';
    if (hatId !== this._hatId) {
      this._hatId = hatId;
      const emoji = HAT_EMOJI[hatId] || '';
      if (emoji) {
        if (!this.hatSprite) {
          this.hatSprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: true, toneMapped: false }));
          this.hatSprite.scale.set(0.42, 0.42, 1);
          this.hatSprite.position.set(0, this._hatY, 0);
          this.hatSprite.renderOrder = 15;
          this.root.add(this.hatSprite);
        }
        this.hatSprite.material.map = hatTexture(emoji);
        this.hatSprite.material.needsUpdate = true;
      }
    }
    if (this.hatSprite) {
      this.hatSprite.visible = !this.dead && !!HAT_EMOJI[this._hatId];
      this.hatSprite.material.opacity = this._alpha;
    }
    if (tags !== this._buffs) {
      this._buffs = tags;
      const st = parseKitTags(tags).stance || '';
      const wantCol = STANCE_TINT[st] || 0;
      if (wantCol !== this._stanceCol) {
        this._stanceCol = wantCol;
        if (this.flashT <= 0) this._applyBaseEmissive();
      }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        this._applyBaseEmissive();
      } else {
        const k = Math.max(0, this.flashT / 0.14) * 0.9;
        for (const m of this.mats) m.emissive.setRGB(k, k * 0.8, k * 0.7);
      }
    }
  }
  dispose() {
    if (this.mixer) this.mixer.stopAllAction(); if (this.rig) this.rig.dispose();
    for (const m of this.mats) m.dispose(); // (proc geometry is cached in proc.js)
    for (const g of this.own) g.parent && g.parent.remove(g); // gear geometry / material are shared + cached (gear.js)
    this.ring.geometry.dispose(); this.ring.material.dispose();
    if (this.hatSprite) { this.hatSprite.material.dispose(); this.root.remove(this.hatSprite); this.hatSprite = null; }
    this.root.parent && this.root.parent.remove(this.root);
  }
}

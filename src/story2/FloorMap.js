// src/story2/FloorMap.js — static renderer of a Story Mode floor, with MobaMap's API so
// TeamModeScene drives it unchanged: update(dt, view, info) · rustle(id) · setBushFocus(id) ·
// setQuality(low) · drawMinimap(g, x0, y0, size). Extra: setDoor(id, state) (doors animate).
//
// Reuses the 5v5 art (MobaMap exports): furniture / partitions (wallLayout + drawWall into one canvas
// atlas, y-sorted pieces), break-room plants (drawBush), palette. Floor = carpet per room kind +
// grid, baked once into one RenderTexture (like MobaMap). Doors are small Graphics redrawn on change.
import {
  wallLayout, drawWall, drawBush, bushBounds, WALL_H, BUSH_ALPHA, BUSH_FOCUS_ALPHA, BUSH_SOIL, BUSH_EDGE, BUSH_MAP, FLOOR, GRID,
} from '../entities/moba/MobaMap.js';
import { D, FONT, MONO, depthAt } from '../entities/moba/mobaGfx.js';

const ROOM_FILL = { calm: 0x1c2333, infested: 0x2a1e26, nest: 0x2e1a20, break: 0x18291f, keycard: 0x1a2340, arena: 0x2b1b2e };
const ROOM_EDGE = { calm: 0x33405c, infested: 0x5a3040, nest: 0x6a2c3a, break: 0x2f6a45, keycard: 0x2f4f8a, arena: 0x6a3a7a };
const ROOM_ICON = { nest: '🐞', break: '☕', keycard: '🔑', infested: '🪲', arena: '⚔️', calm: '' };
const DOOR_COL = { lockin: 0xff5e5e, keycard: 0x39c2ff, boss: 0xffd23f, auto: 0x9fdcff };
const KEY_COL = { blue: 0x39c2ff, red: 0xff5e5e, gold: 0xffd23f };
const PROPS = ['🖨️', '🗄️', '📦', '🪑', '🖥️', '📚', '🧯', '🗃️'];   // never pickup look-alikes (☕ 💰 🔑 📝)

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export class FloorMap {
  constructor(scene, floor, world) {
    this.scene = scene; this.floor = floor; this.world = world;
    this.W = floor.w; this.H = floor.h;
    this.walls = []; this.bushImgs = new Map(); this.doors = new Map();
    this.lowFx = false; this._bushFocus = '';
    this._wallList = world.walls;
    scene.cameras.main.setBackgroundColor(FLOOR);
    const g = scene.make.graphics({}, false);
    this._drawFloor(g);
    this._drawWallShadows(g);
    this._drawBushSoil(g);
    this._bake(g);
    g.destroy();
    this._buildWalls();
    this._buildBushes();
    this._buildLabels();
    this._buildDecor();
    this._buildDoors();
    this._buildExit();
    this._collectStatics();
  }

  // ───────────────────────── baked floor ─────────────────────────
  _drawFloor(g) {
    const { W, H } = this;
    g.fillStyle(FLOOR, 1); g.fillRect(0, 0, W, H);
    for (const r of this.floor.rooms) {
      const [x, y, w, h] = r.rect;
      g.fillStyle(ROOM_FILL[r.kind] ?? ROOM_FILL.calm, 1); g.fillRect(x, y, w, h);
      // carpet tiles
      g.lineStyle(2, 0x000000, 0.18);
      for (let xx = x + 120; xx < x + w; xx += 120) g.lineBetween(xx, y, xx, y + h);
      for (let yy = y + 120; yy < y + h; yy += 120) g.lineBetween(x, yy, x + w, yy);
      g.lineStyle(6, ROOM_EDGE[r.kind] ?? ROOM_EDGE.calm, 0.55); g.strokeRect(x + 14, y + 14, w - 28, h - 28);
    }
    g.lineStyle(3, GRID, 0.6);
    for (let x = 100; x < W; x += 100) g.lineBetween(x, 0, x, 120);
    // break-room fountain pad + spawn mat
    const f = this.floor.breakRoom;
    if (f) { g.fillStyle(0x2f6a45, 0.35); g.fillCircle(f.x, f.y, 520); g.lineStyle(8, 0x7ed957, 0.35); g.strokeCircle(f.x, f.y, 520); }
    const sp = this.floor.spawn;
    if (sp) { g.fillStyle(0xffd23f, 0.12); g.fillRoundedRect(sp.x - 160, sp.y - 110, 320, 220, 24); g.lineStyle(4, 0xffd23f, 0.35); g.strokeRoundedRect(sp.x - 160, sp.y - 110, 320, 220, 24); }
  }

  _drawWallShadows(g) {
    for (const w of this._wallList) {
      const H = WALL_H[w.look] ?? 30;
      if (w.kind === 'circle') {
        g.fillStyle(0x000000, 0.16); g.fillCircle(w.x + H * 0.45 + 6, w.y + 8, w.r + 10);
      } else if (w.kind === 'seg') {
        g.lineStyle(w.w + 22, 0x000000, w.look === 'glass' ? 0.08 : 0.15);
        g.lineBetween(w.x1 + H * 0.4 + 6, w.y1 + 10, w.x2 + H * 0.4 + 6, w.y2 + 10);
      } else {
        g.fillStyle(0x000000, 0.16); g.fillRect(w.x + 4, w.y + 4, w.w + H * 0.5 + 10, w.h + 12);
      }
    }
  }

  _drawBushSoil(g) {
    for (const b of this.world.bushes) {
      if (b.kind === 'circle') { g.fillStyle(BUSH_EDGE, 0.55); g.fillCircle(b.x, b.y, b.r + 8); g.fillStyle(BUSH_SOIL, 0.95); g.fillCircle(b.x, b.y, b.r); continue; }
      for (const [lw, col, a] of [[b.w + 16, BUSH_EDGE, 0.55], [b.w, BUSH_SOIL, 0.95]]) {
        g.lineStyle(lw, col, a); g.lineBetween(b.x1, b.y1, b.x2, b.y2);
        g.fillStyle(col, a); g.fillCircle(b.x1, b.y1, lw / 2); g.fillCircle(b.x2, b.y2, lw / 2);
      }
    }
  }

  _bake(g) {
    const s = this.scene;
    const max = s.sys.game.device.os.desktop ? 3000 : 2048;
    const k = max / Math.max(this.W, this.H);
    g.setScale(k);
    const rt = s.add.renderTexture(0, 0, Math.ceil(this.W * k), Math.ceil(this.H * k)).setOrigin(0, 0).setDepth(D.river);
    rt.draw(g, 0, 0);
    rt.setScale(1 / k);
    this.rt = rt;
  }

  // ───────────────────────── furniture + plants ─────────────────────────
  _buildWalls() {
    const s = this.scene;
    const layout = wallLayout(s.sys.game.device.os.desktop ? 0.85 : 0.6, this._wallList);
    const key = `story-walls-${this.floor.id}`;
    if (!s.textures.exists(key)) {
      const tex = s.textures.createCanvas(key, layout.W, layout.H);
      if (tex) {
        const ctx = tex.getContext();
        for (const f of layout.frames) {
          ctx.save();
          ctx.beginPath(); ctx.rect(f.fx, f.fy, f.fw, f.fh); ctx.clip();
          ctx.setTransform(layout.k, 0, 0, layout.k, f.fx - f.b.x0 * layout.k, f.fy - f.b.y0 * layout.k);
          if (f.clip) {
            ctx.beginPath();
            for (const poly of f.clip) { ctx.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]); ctx.closePath(); }
            ctx.clip();
          }
          try { drawWall(ctx, f.w, f.b.H); } catch (e) { console.warn('[FloorMap] wall draw failed', f.w.id, e?.message); }
          ctx.restore();
          tex.add(f.name, 0, f.fx, f.fy, f.fw, f.fh);
        }
        tex.refresh();
      }
    }
    if (!s.textures.exists(key)) return;
    const tex = s.textures.get(key);
    for (const f of layout.frames) {
      if (!tex.has(f.name)) continue;
      this.walls.push(s.add.image(f.b.x0, f.b.y0, key, f.name).setOrigin(0, 0).setScale(1 / layout.k).setDepth(depthAt(f.depthY)));
    }
  }

  _buildBushes() {
    const s = this.scene, k = s.sys.game.device.os.desktop ? 0.8 : 0.55;
    const key = `story-bushes-${this.floor.id}`;
    const frames = this.world.bushes.map((b) => { const bb = bushBounds(b); return { b, bb, fw: Math.ceil((bb.x1 - bb.x0) * k), fh: Math.ceil((bb.y1 - bb.y0) * k) }; });
    let x = 0, y = 0, rowH = 0;
    for (const f of [...frames].sort((a, c) => c.fh - a.fh)) {
      if (x + f.fw > 2048) { x = 0; y += rowH + 2; rowH = 0; }
      f.fx = x; f.fy = y; x += f.fw + 2; rowH = Math.max(rowH, f.fh);
    }
    const H = Math.max(2, y + rowH);
    if (!s.textures.exists(key) && frames.length && H <= 4096) {
      const tex = s.textures.createCanvas(key, 2048, H);
      const ctx = tex.getContext();
      for (const f of frames) {
        ctx.save(); ctx.beginPath(); ctx.rect(f.fx, f.fy, f.fw, f.fh); ctx.clip();
        ctx.setTransform(k, 0, 0, k, f.fx - f.bb.x0 * k, f.fy - f.bb.y0 * k);
        try { drawBush(ctx, f.b); } catch (e) { console.warn('[FloorMap] bush draw failed', e?.message); }
        ctx.restore();
        tex.add(f.b.id, 0, f.fx, f.fy, f.fw, f.fh);
      }
      tex.refresh();
    }
    if (!s.textures.exists(key)) return;
    const tex = s.textures.get(key);
    for (const f of frames) {
      if (!tex.has(f.b.id)) continue;
      this.bushImgs.set(f.b.id, s.add.image(f.bb.x0, f.bb.y0, key, f.b.id).setOrigin(0, 0).setScale(1 / k)
        .setDepth(depthAt(f.bb.footY) + 0.02).setAlpha(BUSH_ALPHA));
    }
  }

  // ───────────────────────── labels, decor, doors, exit ─────────────────────────
  _buildLabels() {
    const s = this.scene;
    for (const r of this.floor.rooms) {
      const [x, y, w] = r.rect;
      const icon = ROOM_ICON[r.kind] ? `${ROOM_ICON[r.kind]} ` : '';
      s.add.text(x + w / 2, y + 60, `${icon}${r.name.toUpperCase()}`, {
        fontFamily: FONT, fontSize: 30, color: '#c9d6ee', stroke: '#000', strokeThickness: 6,
      }).setOrigin(0.5).setAlpha(0.55).setDepth(D.decor);
    }
    const f = this.floor.breakRoom;
    if (f) {
      s.add.text(f.x, f.y - 10, '⛲', { fontSize: 72 }).setOrigin(0.5).setDepth(D.decor);
      s.add.text(f.x, f.y + 120, 'BREAK ROOM · heal · shop (P) · respawn', {
        fontFamily: FONT, fontSize: 20, color: '#7ed957', stroke: '#000', strokeThickness: 5,
      }).setOrigin(0.5).setAlpha(0.85).setDepth(D.decor);
    }
  }

  _buildDecor() {
    const s = this.scene, rand = rng(this.floor.id.length * 977 + 13);
    const nav = this.world.nav;
    let placed = 0;
    for (let tries = 0; tries < 300 && placed < 22; tries++) {
      const r = this.floor.rooms[Math.floor(rand() * this.floor.rooms.length)];
      const [x, y, w, h] = r.rect;
      const px = x + 120 + rand() * (w - 240), py = y + 140 + rand() * (h - 260);
      if (nav.isBlocked(px, py, 110)) continue;
      s.add.text(px, py, PROPS[Math.floor(rand() * PROPS.length)], { fontSize: 38 }).setOrigin(0.5).setAlpha(0.35).setDepth(D.decor);
      placed++;
    }
  }

  _buildDoors() {
    for (const d of this.floor.doors) {
      const g = this.scene.add.graphics().setDepth(depthAt(Math.max(d.y1, d.y2)) - 0.05);
      const icon = this.scene.add.text((d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2 - 44, '', {
        fontSize: 30, stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(depthAt(Math.max(d.y1, d.y2)) + 0.05);
      const v = { d, g, icon, state: '' };
      this.doors.set(d.id, v);
      this.setDoor(d.id, d.kind === 'keycard' || d.kind === 'boss' ? 'locked' : 'open', true);
    }
  }

  /** Redraw a door: 'open' | 'closed' | 'locked'. */
  setDoor(id, state, instant = false) {
    const v = this.doors.get(id);
    if (!v || v.state === state) return;
    v.state = state;
    const { d, g, icon } = v;
    const col = d.kind === 'keycard' ? (KEY_COL[d.key] ?? DOOR_COL.keycard) : (DOOR_COL[d.kind] ?? 0x9fdcff);
    const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) || 1, ux = (d.x2 - d.x1) / len, uy = (d.y2 - d.y1) / len;
    g.clear();
    if (state === 'open') {
      // two panels slid into the walls + a floor threshold
      g.lineStyle(10, col, d.kind === 'auto' ? 0.25 : 0.35); g.lineBetween(d.x1, d.y1, d.x2, d.y2);
      g.fillStyle(col, 0.5);
      g.fillRect(d.x1 - 10 - (uy ? 10 : 0), d.y1 - 10, 20, 20); g.fillRect(d.x2 - 10, d.y2 - 10, 20, 20);
      icon.setText(d.kind === 'keycard' ? '🔓' : '');
      if (!instant && icon.text) this.scene.tweens.add({ targets: icon, alpha: { from: 1, to: 0 }, delay: 1500, duration: 600 });
    } else {
      icon.setAlpha(1);
      const H = 64;                                    // oblique door slab (top face lifted like the walls)
      g.fillStyle(0x0b0f18, 0.95); g.fillRect(Math.min(d.x1, d.x2) - 4, Math.min(d.y1, d.y2) - H, Math.abs(d.x2 - d.x1) + 8 || 54, H + 30);
      g.fillStyle(col, 0.85);
      g.fillRect(Math.min(d.x1, d.x2), Math.min(d.y1, d.y2) - H + 6, Math.abs(d.x2 - d.x1) || 46, 14);
      g.lineStyle(4, col, 1); g.strokeRect(Math.min(d.x1, d.x2) - 4, Math.min(d.y1, d.y2) - H, Math.abs(d.x2 - d.x1) + 8 || 54, H + 30);
      for (let t = 40; t < len - 20; t += 60) { g.fillStyle(col, 0.35); g.fillRect(d.x1 + ux * t - 4, d.y1 + uy * t - H + 28, 8, 26); }
      icon.setText(state === 'locked' ? '🔒' : '⛔');
      if (!instant) {
        this.scene.tweens.add({ targets: icon, scale: { from: 1.8, to: 1 }, duration: 260, ease: 'Back.easeOut' });
      }
    }
  }

  _buildExit() {
    const ex = this.floor.exit;
    if (!ex) return;
    const s = this.scene;
    const ring = s.add.circle(ex.x, ex.y, ex.r, 0xffd23f, 0.12).setStrokeStyle(6, 0xffd23f, 0.8).setDepth(D.ground);
    s.tweens.add({ targets: ring, alpha: { from: 0.5, to: 1 }, duration: 900, yoyo: true, repeat: -1 });
    s.add.text(ex.x, ex.y - 10, '🪜', { fontSize: 76 }).setOrigin(0.5).setDepth(D.decor);
    s.add.text(ex.x, ex.y + ex.r + 14, ex.label || 'STAIRS UP', {
      fontFamily: FONT, fontSize: 22, color: '#ffd23f', stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5, 0).setDepth(D.decor);
  }

  // ───────────────────────── MobaMap API ─────────────────────────
  _collectStatics() {
    this._statics = [];
    this._cullAt = 0;
    for (const o of [...this.walls, ...this.bushImgs.values()]) {
      const b = o.getBounds();
      this._statics.push({ o, x0: b.x, y0: b.y, x1: b.right, y1: b.bottom, on: true });
    }
  }

  _cullStatics(view) {
    const now = this.scene.time.now;
    if (now < this._cullAt) return;
    this._cullAt = now + 100;
    const m = 80, x0 = view.x - m, y0 = view.y - m, x1 = view.right + m, y1 = view.bottom + m;
    for (const st of this._statics) {
      const on = st.x1 > x0 && st.x0 < x1 && st.y1 > y0 && st.y0 < y1;
      if (on !== st.on) { st.on = on; st.o.setVisible(on); }
    }
  }

  update(dt, view) { if (view) this._cullStatics(view); }

  setBushFocus(id) {
    id = id || '';
    if (id === this._bushFocus) return;
    const prev = this.bushImgs.get(this._bushFocus), next = this.bushImgs.get(id);
    this._bushFocus = id;
    const tw = this.scene.tweens;
    if (prev) { tw.killTweensOf(prev); tw.add({ targets: prev, alpha: BUSH_ALPHA, duration: 220 }); }
    if (next) { tw.killTweensOf(next); tw.add({ targets: next, alpha: BUSH_FOCUS_ALPHA, duration: 160 }); }
  }

  rustle(id) {
    const img = this.bushImgs.get(id);
    if (!img || img._rustling || this.lowFx) return;
    img._rustling = true;
    const x0 = img.x;
    this.scene.tweens.add({ targets: img, x: x0 + 3, duration: 70, yoyo: true, repeat: 1, onComplete: () => { img.x = x0; img._rustling = false; } });
  }

  setQuality(low) { this.lowFx = !!low; }

  /** Static minimap: rooms, walls, doors, break room, exit (callers bake it). */
  drawMinimap(g, x0, y0, size) {
    const k = size / Math.max(this.W, this.H);
    const ox = x0, oy = y0;   // top-left aligned: MobaHud maps world → minimap as mm.x + x·k (no centering)
    g.fillStyle(0x0b0f17, 0.94); g.fillRect(x0, y0, size, size);
    for (const r of this.floor.rooms) {
      const [x, y, w, h] = r.rect;
      g.fillStyle(ROOM_FILL[r.kind] ?? ROOM_FILL.calm, 1); g.fillRect(ox + x * k, oy + y * k, w * k, h * k);
    }
    g.lineStyle(2, 0x9aa7c4, 0.9);
    for (const w of this._wallList) {
      if (w.kind === 'seg') g.lineBetween(ox + w.x1 * k, oy + w.y1 * k, ox + w.x2 * k, oy + w.y2 * k);
      else if (w.kind === 'rect') { g.fillStyle(0x6a7894, 0.9); g.fillRect(ox + w.x * k, oy + w.y * k, Math.max(1, w.w * k), Math.max(1, w.h * k)); }
    }
    for (const b of this.world.bushes) {
      g.fillStyle(BUSH_MAP, 0.8);
      if (b.kind === 'circle') g.fillCircle(ox + b.x * k, oy + b.y * k, Math.max(2, b.r * k));
      else { g.lineStyle(Math.max(2, b.w * k), BUSH_MAP, 0.8); g.lineBetween(ox + b.x1 * k, oy + b.y1 * k, ox + b.x2 * k, oy + b.y2 * k); }
    }
    for (const d of this.floor.doors) {
      const col = d.kind === 'keycard' ? (KEY_COL[d.key] ?? DOOR_COL.keycard) : (DOOR_COL[d.kind] ?? 0x9fdcff);
      g.lineStyle(4, col, 1); g.lineBetween(ox + d.x1 * k, oy + d.y1 * k, ox + d.x2 * k, oy + d.y2 * k);
    }
    const f = this.floor.breakRoom, ex = this.floor.exit;
    if (f) { g.fillStyle(0x7ed957, 1); g.fillCircle(ox + f.x * k, oy + f.y * k, 4); }
    if (ex) { g.fillStyle(0xffd23f, 1); g.fillCircle(ox + ex.x * k, oy + ex.y * k, 5); }
  }
}

/** Monospace helper for other story UI (shared look). */
export const STORY_MONO = MONO;

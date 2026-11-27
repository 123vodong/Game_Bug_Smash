// MobaMap — static rendering of "The Open Office" (shared/moba/map.js):
// dark office floor grid, carpet lanes, the glowing "data stream" river with
// drifting 0/1 glyphs, darker "legacy code" jungle quadrants, team bases +
// break-room fountains, camp pads and the river epic pits.
//
// Perf: Phaser 3.70 re-tessellates Graphics every frame (each arc = ~100 new
// points, fills go through earcut), so every static vector layer is drawn ONCE
// into an off-screen Graphics and baked into a single RenderTexture (one quad).
// Per frame only the river glyphs move and the camp / epic timers refresh (2 Hz).
//
// Walls (map.js WALLS): v3 = long thin office partitions (`kind:'seg'`, look
// partition | cubicles | glass | shelf) bordering the lanes / river / camps, plus a
// few round plants; rect + circle furniture from v2 still render. Drop shadows are
// baked into the floor RenderTexture; every wall is drawn ONCE with canvas 2D into
// a single atlas texture ('moba-walls') and shown as y-sorted images.
// Oblique "height": the top face is lifted by H px and the visible side faces
// (the long face whose normal points south, + the south end cap) fill the gap,
// so the drawing always covers the whole collision footprint.
// y-sort: a seg wall is cut into short PIECES along its length (≤ 70 px of y per
// piece, ≤ 240 px long); each piece is its own image whose depth is the y of the
// wall's center line at the piece's middle, so a champion walking along a diagonal
// or vertical wall is correctly in front of / behind each part of it. Each piece
// draws the WHOLE wall clipped to its own faces, so patterns run seamlessly.
//
// v4 bushes (map.js BUSHES — "break-room plants", hiding spots): a dark soil patch is
// baked into the floor RenderTexture, and each bush's leafy canopy is drawn ONCE with
// canvas 2D into one atlas ('moba-bushes') and shown as one image per bush, y-sorted at
// the footprint's south edge, semi-transparent so units inside read as "in the bush".
// The bush you stand in thins out (setBushFocus) so you can still see yourself.
import {
  MAP_W, MAP_H, LANES, LANE_WIDTH, RIVER, FOUNTAIN, BASE_RADIUS, STRUCTURES, CAMPS,
  EPIC_SPOTS, WALLS, BUSHES, distToSeg, mirror,
} from '../../../shared/moba/map.js';
import { wallDist } from '../../../shared/moba/nav.js';
import { FOUNTAIN_RADIUS, TEAM_INFO, EPICS } from '../../../shared/moba/rules.js';
import { D, FONT, MONO, NEUTRAL, teamColor, teamCss, fmtTime, css, shade, depthAt, wallStyle, wallMapColor } from './mobaGfx.js';
import { preloadEnvAssets, setEnvImages, ENV, texPattern, drawSprite, shadedSprite, drawShaded } from './envAssets.js';
import { bakeFloor } from './envFloor.js';

// Visual height (px the top face is lifted) and extra stuff sticking up above it.
const WALL_H = {
  partition: 58, cubicles: 50, glass: 62, shelf: 72,                         // v3 seg walls
  cubicle: 46, desk: 26, rack: 74, copier: 40, plant: 26, cooler: 30, sofa: 30, // v2 furniture
};
const WALL_UP = { plant: 64, cooler: 70 };
const WALL_PAD = 8;
const BUSH_LIFT = 58;            // canopy leaves rise this far above the footprint (covers legs + body)
const BUSH_ALPHA = 0.74, BUSH_FOCUS_ALPHA = 0.36;
const BUSH_SOIL = 0x13261a, BUSH_EDGE = 0x2c5a34, BUSH_MAP = 0x2f8a45;

const FLOOR = 0x141924, GRID = 0x1f2738;
const CARPET = 0x2c3650, CARPET_EDGE = 0x4a5a80, CARPET_LINE = 0x55648a;
const RIVER_DEEP = 0x06233a, RIVER_MID = 0x0b3a5e, RIVER_GLOW = 0x39c2ff;

const JUNGLES = [ // the four triangles between the outer lanes, the river and mid
  [[650, 650], [3000, 3000], [650, 5350]],     // west  (blue jungle)
  [[650, 5350], [3000, 3000], [5350, 5350]],   // south (blue jungle)
  [[650, 650], [5350, 650], [3000, 3000]],     // north (red jungle)
  [[5350, 650], [5350, 5350], [3000, 3000]],   // east  (red jungle)
];

const LEGACY = [
  '// TODO: refactor before launch (2009)\nvar self = this; var that = self;\nif (x == true) { return true; }\nelse { return false; }',
  '10 PRINT "HELLO WORLD"\n20 GOTO 10\nOn Error Resume Next\nPERFORM 2000-LEGACY-BILLING.',
  '<?php include($_GET["page"]); ?>\nSELECT * FROM users WHERE 1=1\n// do not touch. it works.\ncatch (e) { /* ¯\\_(ツ)_/¯ */ }',
  'function doStuff2_final_v3() {\n  // magic number, ask Dave\n  return 42 * 1.0000001;\n}',
  '$(document).ready(function () {\n  $("#btn").live("click", go);\n});\n<marquee>NEW!!!</marquee>',
  '#define TRUE FALSE // good luck\nint main() { return 0; } // TODO\nDim i As Variant\nC:\\> FORMAT A:',
  '// written by an intern, 2011\neval(atob(config));\nwhile (true) { /* hope */ }\nsleep(1000); // fixes race',
  '<table><tr><td><font color=red>\n<!-- legacy layout, DO NOT REMOVE -->\n</font></td></tr></table>\n<blink>under construction</blink>',
];
// Blue-side anchors (west + south quadrants); red side is mirrored.
const LEGACY_SPOTS = [{ x: 930, y: 1750 }, { x: 1000, y: 3480 }, { x: 1900, y: 4700 }, { x: 3700, y: 4250 }];
const PROPS = ['🪴', '🖨️', '🗄️', '☕', '📠', '🧯', '💾', '📦', '🪑', '🖥️', '🪴', '📚'];

/** Small deterministic RNG so the decor is identical for every player. */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export class MobaMap {
  constructor(scene) {
    this.scene = scene;
    this.glyphs = [];
    this.campIcons = new Map();   // campId → Text (shown while the camp is down)
    this.epicLabels = {};         // kind → { timer: Text }
    const r = RIVER;
    const len = Math.hypot(r.to.x - r.from.x, r.to.y - r.from.y);
    this._river = { len, ux: (r.to.x - r.from.x) / len, uy: (r.to.y - r.from.y) / len };
    this._river.nx = -this._river.uy; this._river.ny = this._river.ux;
    this._laneSegs = [];
    for (const pts of Object.values(LANES)) {
      for (let i = 0; i < pts.length - 1; i++) this._laneSegs.push([pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y]);
    }
    scene.cameras.main.setBackgroundColor(FLOOR);
    this.lowFx = !!scene._lowFx;
    setEnvImages(scene);
    this._planProps();
    this._bake();
    this._buildWalls();
    this._buildBushes();
    this._buildTexts();
    this._buildDecor();
    this._buildProps();
    this._buildFlow();
    this._buildGlyphs();
    this._buildFog();
    this._timerAt = 0;
    this._collectStatics();
  }

  /** Disabled full-screen Fog canvas overlay (vision/bush hiding is enforced by server StateView & OfflineSim; avoids full-viewport overdraw + gl.texImage2D stalls). */
  _buildFog() {
    this._fogTex = null;
    this._fogCtx = null;
    this._fogImg = null;
  }

  shouldUpdateFog() { return false; }

  updateFog() {}

    /** v4 perf: static world images / decor texts with precomputed bounds, culled vs the camera. */
    _collectStatics() {
      this._statics = [];
      this._cullAt = 0;
      const add = (o, decor = false) => {
        if (!o?.getBounds) return;
        const b = o.getBounds();
        this._statics.push({ o, x0: b.x, y0: b.y, x1: b.right, y1: b.bottom, on: true, decor });
      };
      for (const w of this.walls || []) add(w);
      for (const b of this.bushImgs?.values() || []) add(b);
      // Only always-on decor texts are culled: skip texts hidden at build time (graffiti with no clear
      // spot) and texts whose visibility other logic owns (camp 💤 icons, epic timers) — review v4.
      const owned = new Set([...this.campIcons.values(), ...Object.values(this.epicLabels).map((l) => l?.timer)]);
      for (const o of this.scene.children.list) {
        if (o.type === 'Text' && o.depth === D.decor && o.visible && !owned.has(o)) add(o, true);
      }
    }

    _cullStatics(view) {
      const now = this.scene.time.now;
      if (now < this._cullAt || !this._statics) return;
      this._cullAt = now + 100;
      const m = 80, x0 = view.x - m, y0 = view.y - m, x1 = view.right + m, y1 = view.bottom + m;
      for (const st of this._statics) {
        const on = st.x1 > x0 && st.x0 < x1 && st.y1 > y0 && st.y0 < y1 && !(st.decor && this.lowFx);
        if (on !== st.on) { st.on = on; st.o.setVisible(on); }
      }
    }

    /** Loads every CC0 texture / sprite atlas the environment uses (call from Scene.preload). */
    static preload(scene) { preloadEnvAssets(scene); }

    /** Bake the whole textured ground into one canvas texture (~0.6 px/unit on desktop, 1/3 on mobile / low fx). */
    _bake() {
      const s = this.scene;
      const size = s.sys.game.device.os.desktop && !this.lowFx ? 3584 : 2048;
      if (!ENV.ready) { // assets missing: plain floor so the game still runs
        const rt = s.add.rectangle(0, 0, MAP_W, MAP_H, FLOOR).setOrigin(0, 0).setDepth(D.river);
        this.rt = rt; return;
      }
      const { key, k } = bakeFloor(s, { size, low: this.lowFx, props: this._propList });
      this.rt = s.add.image(0, 0, key).setOrigin(0, 0).setScale(1 / k).setDepth(D.river);
    }

    /** Deterministic scenery plan (jungle foliage + map-edge clutter); shadows are baked, sprites y-sorted. */
    _planProps() {
      this._propList = [];
      if (!ENV.ready) return;
      const rand = rng(777);
      const cores = STRUCTURES.filter((st) => st.kind === 'core');
      const free = (x, y, wallM, laneM) => {
        if (x < 70 || y < 70 || x > MAP_W - 70 || y > MAP_H - 70) return false;
        for (const sg of this._laneSegs) if (distToSeg(x, y, sg[0], sg[1], sg[2], sg[3]) < LANE_WIDTH / 2 + laneM) return false;
        if (distToSeg(x, y, RIVER.from.x, RIVER.from.y, RIVER.to.x, RIVER.to.y) < RIVER.width / 2 + 110) return false;
        for (const c of CAMPS) if (Math.hypot(c.x - x, c.y - y) < 190) return false;
        for (const p of Object.values(EPIC_SPOTS)) if (Math.hypot(p.x - x, p.y - y) < 300) return false;
        for (const st of STRUCTURES) if (Math.hypot(st.x - x, st.y - y) < 200) return false;
        for (const f of Object.values(FOUNTAIN)) if (Math.hypot(f.x - x, f.y - y) < 300) return false;
        for (const w of WALLS) if (wallDist(x, y, w) < wallM) return false;
        for (const b of BUSHES) if (wallDist(x, y, b) < 90) return false;
        return true;
      };
      const out = this._propList;
      const put = (x, y, name, w, minGap) => {
        for (const p of out) if (Math.hypot(p.x - x, p.y - y) < minGap) return false;
        out.push({ x, y, name, w: w * 0.85 * (0.9 + rand() * 0.25), flip: rand() < 0.5 }); return true;
      };
      // jungle foliage / rocks / legacy crates (blue quadrants; red = mirror)
      const JUNGLE_SETS = [['plant1', 70], ['plant2', 84], ['tree1', 78], ['tree2', 54], ['tree3', 96], ['rock1', 60], ['rock2', 84], ['rock3', 74], ['crate1', 52], ['crate2', 52], ['barrel1', 40], ['barrel2', 40], ['rack1', 88], ['rack2', 88], ['pod1', 76]];
      for (let tries = 0; tries < 3000 && out.length < 170; tries++) {
        const t = JUNGLES[tries % 2];
        let a = rand(), b = rand(); if (a + b > 1) { a = 1 - a; b = 1 - b; }
        const x = t[0][0] + a * (t[1][0] - t[0][0]) + b * (t[2][0] - t[0][0]), y = t[0][1] + a * (t[1][1] - t[0][1]) + b * (t[2][1] - t[0][1]);
        if (!free(x, y, 120, 80)) continue;
        const [n, w] = JUNGLE_SETS[Math.floor(rand() * JUNGLE_SETS.length)];
        if (put(x, y, n, w, 190)) { const m = mirror({ x, y }); out.push({ x: m.x, y: m.y, name: n, w: out[out.length - 1].w, flip: !out[out.length - 1].flip }); }
      }
      // map-edge + base clutter: racks, plants, crates, relays along the outer border
      const EDGE = [['rack1', 92], ['rack2', 92], ['pod1', 80], ['pod2', 80], ['plant1', 74], ['plant2', 88], ['crate1', 56], ['crate2', 56], ['tank', 84], ['relay', 64], ['sandbag', 60]];
      const n0 = out.length;
      for (let tries = 0; tries < 2600 && out.length - n0 < 110; tries++) {
        const along = rand() * MAP_W, depth = 100 + rand() * 170, side = Math.floor(rand() * 4);
        const x = side === 0 ? along : side === 1 ? MAP_W - depth : side === 2 ? along : depth;
        const y = side === 0 ? depth : side === 1 ? along : side === 2 ? MAP_H - depth : along;
        if (!free(x, y, 110, 60)) continue;
        const [n, w] = EDGE[Math.floor(rand() * EDGE.length)];
        put(x, y, n, w, 200);
      }
      // inside the bases: servers + plants behind the structures (never near the lanes / fountain)
      for (const c of cores) {
        const sgn = c.team === 'blue' ? 1 : -1;
        for (let tries = 0, got = 0; tries < 500 && got < 10; tries++) {
          const ang = rand() * Math.PI * 2, r = 330 + rand() * 640;
          const x = c.x + Math.cos(ang) * r, y = c.y + Math.sin(ang) * r;
          if (!free(x, y, 110, 90) || Math.hypot(x - c.x, y - c.y) > BASE_RADIUS - 90) continue;
          const [n, w] = EDGE[Math.floor(rand() * EDGE.length)];
          if (put(x, y, n, w * 1.05, 240)) got++;
        }
      }
    }

    /** Scenery sprites: y-sorted images from the env-props atlas, culled by the static system. */
    _buildProps() {
      const s = this.scene;
      this.propImgs = [];
      if (!ENV.ready || !s.textures.exists('env-props')) return;
      for (const p of this._propList || []) {
        const im = s.add.image(p.x, p.y + 6, 'env-props', p.name).setOrigin(0.5, 1).setDepth(depthAt(p.y)).setFlipX(p.flip);
        im.setScale(p.w / im.width);
        this.propImgs.push(im);
        this.walls.push(im);
      }
    }

    /** Flowing data-stream: two scrolling additive streak layers over the river, cut where lanes cross it. */
    _buildFlow() {
      const s = this.scene;
      this._flow = [];
      if (!s.textures.exists('env-flow')) return;
      const rv = this._river, W = RIVER.width;
      const cuts = [[330, rv.len / 2 - 235], [rv.len / 2 + 235, rv.len - 330]];
      const ang = Math.atan2(rv.uy, rv.ux);
      for (const [t0, t1] of cuts) {
        for (const [i, o] of [[0, { sp: 70, h: 0.9, a: 0.5, sc: 0.8 }], [1, { sp: -38, h: 0.6, a: 0.28, sc: 1.4 }]]) {
          const len = t1 - t0;
          const ts = s.add.tileSprite(RIVER.from.x + rv.ux * t0, RIVER.from.y + rv.uy * t0, len, W * o.h, 'env-flow')
            .setOrigin(0, 0.5).setRotation(ang).setDepth(D.glyphs - 0.1 + i * 0.01).setAlpha(o.a).setBlendMode(1);
          ts.setTileScale(o.sc, o.sc);
          ts._sp = o.sp; ts._i = i;
          this._flow.push(ts);
        }
      }
      for (const ts of this._flow) ts.setVisible(!(this.lowFx && ts._i));
    }


    _buildBushes() {
      const s = this.scene;
      this.bushImgs = new Map();
      this._bushFocus = '';
      const k = s.sys.game.device.os.desktop ? 0.8 : 0.55;
      const key = 'moba-bushes';
      const frames = BUSHES.map((b) => {
        const bb = bushBounds(b);
        return { b, bb, fw: Math.ceil((bb.x1 - bb.x0) * k), fh: Math.ceil((bb.y1 - bb.y0) * k) };
      });
      // Shelf-pack into a 2048-wide atlas.
      let x = 0, y = 0, rowH = 0;
      for (const f of [...frames].sort((a, c) => c.fh - a.fh)) {
        if (x + f.fw > 2048) { x = 0; y += rowH + 2; rowH = 0; }
        f.fx = x; f.fy = y; x += f.fw + 2; rowH = Math.max(rowH, f.fh);
      }
      const H = Math.max(2, y + rowH);
      if (!s.textures.exists(key)) {
        const tex = H <= 4096 ? s.textures.createCanvas(key, 2048, H) : null;
        if (!tex) return;
        const ctx = tex.getContext();
        for (const f of frames) {
          ctx.save();
          ctx.beginPath(); ctx.rect(f.fx, f.fy, f.fw, f.fh); ctx.clip();
          ctx.setTransform(k, 0, 0, k, f.fx - f.bb.x0 * k, f.fy - f.bb.y0 * k);
          try { drawBush(ctx, f.b); } catch (e) { console.warn('[MobaMap] bush draw failed', f.b.id, e?.message); }
          ctx.restore();
          tex.add(f.b.id, 0, f.fx, f.fy, f.fw, f.fh);
        }
        tex.refresh();
      }
      const tex = s.textures.get(key);
      for (const f of frames) {
        if (!tex.has(f.b.id)) continue;
        const img = s.add.image(f.bb.x0, f.bb.y0, key, f.b.id).setOrigin(0, 0).setScale(1 / k)
          .setDepth(depthAt(f.bb.footY) + 0.02).setAlpha(BUSH_ALPHA);
        this.bushImgs.set(f.b.id, img);
      }
    }

    /** v4: the bush the local player stands in ('' = none) thins out so you can see yourself. */
    setBushFocus(id) {
      id = id || '';
      if (id === this._bushFocus || !this.bushImgs) return;
      const prev = this.bushImgs.get(this._bushFocus), next = this.bushImgs.get(id);
      this._bushFocus = id;
      const tw = this.scene.tweens;
      if (prev) { tw.killTweensOf(prev); tw.add({ targets: prev, alpha: BUSH_ALPHA, duration: 220 }); }
      if (next) { tw.killTweensOf(next); tw.add({ targets: next, alpha: BUSH_FOCUS_ALPHA, duration: 160 }); }
    }

    /** v4: brief leaf rustle when a visible unit enters a bush. */
    rustle(id) {
      const img = this.bushImgs?.get(id);
      if (!img || img._rustling || this.lowFx) return;
      img._rustling = true;
      const x0 = img.x;
      this.scene.tweens.add({ targets: img, x: x0 + 3, duration: 70, yoyo: true, repeat: 1, onComplete: () => { img.x = x0; img._rustling = false; } });
    }

    /** v4 quality: low effects hide the drifting river glyphs + decor props / legacy-code texts. */
    setQuality(low) {
      this.lowFx = !!low;
      if (low) for (const g of this.glyphs) if (g.img.visible) g.img.setVisible(false);
      for (const ts of this._flow || []) ts.setVisible(!(low && ts._i)); // low: keep only the main flow layer
      this._cullAt = 0; // re-evaluate decor visibility next frame
    }

    /** All furniture/partitions → one tight piece-sliced canvas atlas (minimal overdraw, 1 WebGL texture). */
    _buildWalls() {
      const s = this.scene;
      const layout = wallLayout(s.sys.game.device.os.desktop ? 0.85 : 0.6);
      const key = 'moba-walls';
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
            try { drawWall(ctx, f.w, f.b.H); } catch (e) { console.warn('[MobaMap] wall draw failed', f.w.id, e?.message); }
            ctx.restore();
            tex.add(f.name, 0, f.fx, f.fy, f.fw, f.fh);
          }
          tex.refresh();
        }
      }
      this.walls = [];
      if (s.textures.exists(key)) {
        const tex = s.textures.get(key);
        for (const f of layout.frames) {
          if (!tex.has(f.name)) continue;
          const img = s.add.image(f.b.x0, f.b.y0, key, f.name).setOrigin(0, 0).setScale(1 / layout.k).setDepth(depthAt(f.depthY));
          this.walls.push(img);
        }
      }
      // Subtle river & base environment accents (assets/moba/*)
      const props = [
        { x: 2680, y: 2680, k: 'moba-prop-crystal', s: 54 },
        { x: 3320, y: 3320, k: 'moba-prop-crystal', s: 54 },
        { x: 2810, y: 3190, k: 'moba-prop-barricade', s: 52, rot: -45 },
        { x: 3190, y: 2810, k: 'moba-prop-barricade', s: 52, rot: -45 },
        { x: 1080, y: 4920, k: 'moba-prop-beacon', s: 50 },
        { x: 4920, y: 1080, k: 'moba-prop-beacon', s: 50 },
      ];
      for (const p of props) {
        if (!s.textures.exists(p.k)) continue;
        const im = s.add.image(p.x, p.y, p.k).setDisplaySize(p.s, p.s).setDepth(D.ground + 0.5).setAlpha(0.9);
        if (p.rot) im.setAngle(p.rot);
        this.walls.push(im);
      }
    }

    // ───────────────────────── text + decor (separate objects) ─────────────────────────
    _buildTexts() {
      const s = this.scene;
      const spots = [...LEGACY_SPOTS, ...LEGACY_SPOTS.map(mirror)];
      spots.forEach((p, i) => {
        const t = s.add.text(p.x, p.y, LEGACY[i % LEGACY.length], {
          fontFamily: MONO, fontSize: 24, color: '#7f95c4', lineSpacing: 10,
        }).setAlpha(0.16).setDepth(D.decor);
        // Keep the floor graffiti off the partitions: nudge it to the nearest clear spot.
        const clear = (x, y) => {
          for (let yy = y; yy <= y + t.height; yy += 35) {
            for (let xx = x; xx <= x + t.width; xx += 35) {
              for (const w of WALLS) if (wallDist(xx, yy, w) < 30) return false;
              if (this._onLane(xx, yy)) return false;
            }
          }
          return true;
        };
        if (clear(p.x, p.y)) return;
        for (let rad = 60; rad <= 900; rad += 60) {
          for (let a = 0; a < 12; a++) {
            const x = p.x + Math.cos((a / 12) * Math.PI * 2) * rad, y = p.y + Math.sin((a / 12) * Math.PI * 2) * rad;
            if (clear(x, y)) { t.setPosition(x, y); return; }
          }
        }
        t.setVisible(false);
      });
      for (const team of ['blue', 'red']) {
        const f = FOUNTAIN[team];
        if (ENV.ready && s.textures.exists('env-props')) {
          const im = s.add.image(f.x, f.y + 40, 'env-props', 'tank').setOrigin(0.5, 1).setDepth(depthAt(f.y + 40));
          im.setScale(150 / im.width);
          s.add.image(f.x, f.y - 30, 'moba-glow').setTint(0x66d8ff).setDisplaySize(260, 260).setAlpha(0.5).setBlendMode(1).setDepth(D.decor);
        } else s.add.text(f.x, f.y - 10, '⛲', { fontSize: 72 }).setOrigin(0.5).setDepth(D.decor);
        const lx = f.x + (team === 'blue' ? 40 : -40), ly = f.y + (team === 'blue' ? -230 : 230);
        s.add.text(lx, ly, `${TEAM_INFO[team].emoji} BREAK ROOM\nheal · shop`, {
          fontFamily: FONT, fontSize: 22, color: teamCss(team), align: 'center', stroke: '#000', strokeThickness: 5,
        }).setOrigin(0.5).setAlpha(0.85).setDepth(D.decor);
      }
      for (const c of CAMPS) {
        const icon = s.add.text(c.x, c.y, '💤', { fontSize: 30 }).setOrigin(0.5).setAlpha(0.6)
          .setDepth(D.decor).setVisible(false);
        this.campIcons.set(c.id, icon);
      }
      for (const [kind, p] of Object.entries(EPIC_SPOTS)) {
        const col = kind === 'golden' ? 0xffd700 : 0xff4a4a;
        s.add.text(p.x, p.y + 262, EPICS[kind]?.title || kind, {
          fontFamily: FONT, fontSize: 20, color: css(col), stroke: '#000', strokeThickness: 5,
        }).setOrigin(0.5, 0).setAlpha(0.8).setDepth(D.decor);
        const timer = s.add.text(p.x, p.y, '', {
          fontFamily: FONT, fontSize: 30, color: '#ffffff', stroke: '#000', strokeThickness: 6, align: 'center',
        }).setOrigin(0.5).setDepth(D.decor).setVisible(false);
        this.epicLabels[kind] = { timer };
      }
    }

    _buildDecor() {
      if (ENV.ready) return; // real sprite scenery (_buildProps) replaces the emoji decor
      const s = this.scene, rand = rng(1337);
      const cores = STRUCTURES.filter((st) => st.kind === 'core');
      const ok = (x, y) => {
        for (const sg of this._laneSegs) if (distToSeg(x, y, sg[0], sg[1], sg[2], sg[3]) < LANE_WIDTH / 2 + 90) return false;
        if (distToSeg(x, y, RIVER.from.x, RIVER.from.y, RIVER.to.x, RIVER.to.y) < RIVER.width / 2 + 90) return false;
        for (const c of CAMPS) if (Math.hypot(c.x - x, c.y - y) < 260) return false;
        for (const p of Object.values(EPIC_SPOTS)) if (Math.hypot(p.x - x, p.y - y) < 340) return false;
        for (const c of cores) if (Math.hypot(c.x - x, c.y - y) < BASE_RADIUS + 60) return false;
        for (const w of WALLS) if (wallDist(x, y, w) < 130) return false; // walls are mirror-symmetric
        return true;
      };
      const placed = [];
      for (let tries = 0; tries < 400 && placed.length < 16; tries++) {
        const t = JUNGLES[tries % 2]; // blue-side quadrants, mirrored below
        let a = rand(), b = rand();
        if (a + b > 1) { a = 1 - a; b = 1 - b; }
        const x = t[0][0] + a * (t[1][0] - t[0][0]) + b * (t[2][0] - t[0][0]);
        const y = t[0][1] + a * (t[1][1] - t[0][1]) + b * (t[2][1] - t[0][1]);
        if (!ok(x, y) || placed.some((p) => Math.hypot(p.x - x, p.y - y) < 260)) continue;
        placed.push({ x, y, e: PROPS[Math.floor(rand() * PROPS.length)] });
      }
      for (const p of placed) {
        for (const q of [p, { ...mirror(p), e: p.e }]) {
          s.add.text(q.x, q.y, q.e, { fontSize: 44 }).setOrigin(0.5).setAlpha(0.5).setDepth(D.decor);
        }
      }
    }

    _buildGlyphs() {
      const s = this.scene, rand = rng(42);
      const { from, width } = RIVER, rv = this._river;
      for (let i = 0; i < 110; i++) {
        const t = rand() * rv.len;
        const off = (rand() - 0.5) * width * 0.84;
        const img = s.add.image(0, 0, 'moba-bits', rand() < 0.5 ? '0' : '1')
          .setDepth(D.glyphs).setAlpha(0.2 + rand() * 0.45).setScale(0.6 + rand() * 0.6).setVisible(false);
        this.glyphs.push({ img, t, off, v: 40 + rand() * 80 });
      }
      this._glyphFrom = from;
    }

    _onLane(x, y) {
      const lim = LANE_WIDTH / 2 + 12;
      for (const sg of this._laneSegs) if (distToSeg(x, y, sg[0], sg[1], sg[2], sg[3]) < lim) return true;
      return false;
    }

    // ───────────────────────── per frame ─────────────────────────
    /**
     * @param dt seconds
     * @param view camera worldView (Rectangle) — glyphs outside it are hidden, not moved
     * @param info { liveCamps:Set<campId>, epicAt:{golden,deadline} (server ms, 0 = alive), srvNow, playing }
     */
    update(dt, view, info) {
      const rv = this._river, f = this._glyphFrom;
      this._cullStatics(view);
      for (const ts of this._flow || []) if (ts.visible) ts.tilePositionX += ts._sp * dt;
      if (this.lowFx) { this._updateTimers(info); return; }
      const vx0 = view.x - 60, vy0 = view.y - 60, vx1 = view.right + 60, vy1 = view.bottom + 60;
      for (const g of this.glyphs) {
        g.t += g.v * dt;
        if (g.t > rv.len) g.t -= rv.len;
        const x = f.x + rv.ux * g.t + rv.nx * g.off, y = f.y + rv.uy * g.t + rv.ny * g.off;
        // Glyphs flow under the lane "bridges": hide them where a lane crosses the river.
        const show = x >= vx0 && x <= vx1 && y >= vy0 && y <= vy1 && !this._onLane(x, y);
        if (g.img.visible !== show) g.img.setVisible(show);
        if (show) g.img.setPosition(x, y);
      }
      this._updateTimers(info);
    }

    _updateTimers(info) {
      if (!info) return;
      const now = this.scene.time.now;
      if (now < this._timerAt) return;
      this._timerAt = now + 500;
      for (const [id, icon] of this.campIcons) {
        const down = !!info.playing && !!info.liveCamps && !info.liveCamps.has(id);
        if (icon.visible !== down) icon.setVisible(down);
      }
      for (const kind of ['golden', 'deadline']) {
        const at = info.epicAt?.[kind] || 0, lbl = this.epicLabels[kind];
        if (!lbl) continue;
        const show = !!info.playing && at > 0 && at > info.srvNow;
        if (show) {
          const str = `⏳ ${fmtTime(at - info.srvNow)}`;
          if (lbl.timer.text !== str) lbl.timer.setText(str);
        }
        if (lbl.timer.visible !== show) lbl.timer.setVisible(show);
      }
    }

    // ───────────────────────── minimap ─────────────────────────
    /** Draws the static minimap into `g` at (x0, y0), `size` px square (callers bake it). */
    drawMinimap(g, x0, y0, size) {
      const k = size / MAP_W;
      const P = (x, y) => [x0 + x * k, y0 + y * k];
      g.fillStyle(0x0b0f17, 0.94); g.fillRect(x0, y0, size, size);
      g.fillStyle(0x000000, 0.35);
      for (const t of JUNGLES) {
        const [a, b, c] = t.map(([x, y]) => P(x, y));
        g.fillTriangle(a[0], a[1], b[0], b[1], c[0], c[1]);
      }
      for (const team of ['blue', 'red']) {
        const core = STRUCTURES.find((st) => st.team === team && st.kind === 'core');
        const [cx, cy] = P(core.x, core.y);
        g.fillStyle(teamColor(team), 0.2); g.fillCircle(cx, cy, BASE_RADIUS * k);
        const [fx, fy] = P(FOUNTAIN[team].x, FOUNTAIN[team].y);
        g.fillStyle(teamColor(team), 0.35); g.fillCircle(fx, fy, FOUNTAIN_RADIUS * k);
      }
      const [rx0, ry0] = P(RIVER.from.x, RIVER.from.y), [rx1, ry1] = P(RIVER.to.x, RIVER.to.y);
      g.lineStyle(Math.max(4, RIVER.width * k), 0x15598a, 0.95); g.lineBetween(rx0, ry0, rx1, ry1);
      g.lineStyle(Math.max(4, LANE_WIDTH * k), 0x46557a, 1);
      for (const pts of Object.values(LANES)) {
        g.beginPath();
        pts.forEach((p, i) => { const [x, y] = P(p.x, p.y); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
        g.strokePath();
      }
      // v4 bushes — green blobs (drawn under the walls).
      for (const b of BUSHES) {
        if (b.kind === 'circle') {
          const [cx, cy] = P(b.x, b.y);
          g.fillStyle(BUSH_MAP, 0.95); g.fillCircle(cx, cy, Math.max(2.5, b.r * k));
          continue;
        }
        const [ax, ay] = P(b.x1, b.y1), [bx, by] = P(b.x2, b.y2), lw = Math.max(3, b.w * k);
        g.lineStyle(lw, BUSH_MAP, 0.95); g.lineBetween(ax, ay, bx, by);
        g.fillStyle(BUSH_MAP, 0.95); g.fillCircle(ax, ay, lw / 2); g.fillCircle(bx, by, lw / 2);
      }
      // Walls (solid obstacles) — light so they read against the dark jungle.
      for (const w of WALLS) {
        const col = shade(wallMapColor(w.look), 0.3);
        if (w.kind === 'seg') {
          const [ax, ay] = P(w.x1, w.y1), [bx, by] = P(w.x2, w.y2), lw = Math.max(2, w.w * k);
          g.lineStyle(lw + 2, 0x000000, 0.6); g.lineBetween(ax, ay, bx, by);
          g.lineStyle(lw, col, 1); g.lineBetween(ax, ay, bx, by);
          continue;
        }
        g.fillStyle(0x000000, 0.6);
        if (w.kind === 'circle') { const [cx, cy] = P(w.x, w.y); g.fillCircle(cx, cy, Math.max(2, w.r * k) + 1); }
        else { const [rx, ry] = P(w.x, w.y); g.fillRect(rx - 1, ry - 1, Math.max(2, w.w * k) + 2, Math.max(2, w.h * k) + 2); }
        g.fillStyle(col, 1);
        if (w.kind === 'circle') { const [cx, cy] = P(w.x, w.y); g.fillCircle(cx, cy, Math.max(2, w.r * k)); }
        else { const [rx, ry] = P(w.x, w.y); g.fillRect(rx, ry, Math.max(2, w.w * k), Math.max(2, w.h * k)); }
      }
      g.lineStyle(2, 0x39c2ff, 0.85); g.strokeRect(x0 + 1, y0 + 1, size - 2, size - 2);
    }
  }

// ───────────────────────── furniture (walls) — canvas 2D, world units ─────────────────────────
// ── seg geometry (shared by the piece layout, the clip polygons and the drawing) ──
/** Center line A→B extended by half the thickness at both ends (covers the capsule caps). */
function segGeom(w) {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, hw = w.w / 2;
  // Normal pointing "south" (toward the camera); a vertical wall has no visible long face.
  let nx = -uy, ny = ux;
  if (ny < 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; }
  return {
    ax: w.x1, ay: w.y1, ux, uy, nx, ny, hw, len, t0: -hw, t1: len + hw, front: ny > 0.05,
    endT: uy > 0.05 ? len + hw : (uy < -0.05 ? -hw : null)
  };
}
const gAt = (G, t, off = 0) => [G.ax + G.ux * t + G.nx * off, G.ay + G.uy * t + G.ny * off];
const up = (p, H) => [p[0], p[1] - H];
/** Faces of the slice [ta, tb] of a seg wall (world coords; `m` = outward margin). */
function segFaces(G, H, ta, tb, m = 0) {
  const hw = G.hw + m, faces = [];
  faces.push([up(gAt(G, ta, hw), H), up(gAt(G, tb, hw), H), up(gAt(G, tb, -hw), H), up(gAt(G, ta, -hw), H)]); // top
  if (G.front) {
    const e0 = gAt(G, ta, G.hw), e1 = gAt(G, tb, G.hw);
    faces.push([up(e0, H), up(e1, H), [e1[0], e1[1] + m], [e0[0], e0[1] + m]]); // long south face
  }
  if (G.endT != null && G.endT >= ta - 0.01 && G.endT <= tb + 0.01) {
    const t = G.endT + (G.endT > 0 ? m : -m);
    const p0 = gAt(G, t, -hw), p1 = gAt(G, t, hw);
    faces.push([up(p0, H), up(p1, H), [p1[0], p1[1] + m], [p0[0], p0[1] + m]]); // south end cap
  }
  // Consistent winding so the union clip (nonzero rule) never cancels an overlap.
  return faces.map((f) => {
    let a = 0;
    for (let i = 0; i < f.length; i++) { const p = f[i], q = f[(i + 1) % f.length]; a += p[0] * q[1] - q[0] * p[1]; }
    return a < 0 ? f.slice().reverse() : f;
  });
}
const SEG_PIECE_LEN = 240, SEG_PIECE_DY = 70;

/** Drawing pieces of one wall: [{ name, b:{x0,y0,x1,y1,H}, depthY, clip? }]. */
function wallPieces(w) {
  const H = WALL_H[w.look] ?? 30, up2 = WALL_UP[w.look] || 0;
  if (w.kind === 'circle') {
    const rx = w.r * 1.18 + WALL_PAD;
    return [{ name: w.id, depthY: w.y + w.r * 0.35, b: { x0: w.x - rx, y0: w.y - w.r - H - up2 - WALL_PAD, x1: w.x + rx, y1: w.y + w.r + WALL_PAD, H } }];
  }
  if (w.kind !== 'seg') {
    return [{ name: w.id, depthY: w.y + w.h, b: { x0: w.x - WALL_PAD, y0: w.y - H - WALL_PAD, x1: w.x + w.w + WALL_PAD, y1: w.y + w.h + WALL_PAD, H } }];
  }
  const G = segGeom(w), L = G.t1 - G.t0;
  const n = Math.max(1, Math.ceil(L / SEG_PIECE_LEN), Math.ceil((L * Math.abs(G.uy)) / SEG_PIECE_DY));
  const out = [];
  for (let i = 0; i < n; i++) {
    const ta = G.t0 + (L * i) / n, tb = G.t0 + (L * (i + 1)) / n;
    // 1.5 px overlap along the wall hides anti-aliased seams; 3 px outward keeps the outline strokes.
    const clip = segFaces(G, H, ta - (i ? 1.5 : 3), tb + (i < n - 1 ? 1.5 : 3), 3);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const f of clip) for (const [x, y] of f) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const mid = gAt(G, (ta + tb) / 2);
    out.push({ name: `${w.id}_${i}`, depthY: mid[1], clip, b: { x0: x0 - 2, y0: y0 - 2, x1: x1 + 2, y1: y1 + 2, H } });
  }
  return out;
}

/** Deterministic shelf-packing of every wall piece into one atlas at scale k. */
// ───────────────────────── bushes (canopy) — canvas 2D, world units ─────────────────────────
/** Footprint bounds (+ pad, + the canopy lift above) and the south edge used for y-sorting. */
function bushBounds(b) {
  const pad = 26;
  let x0, y0, x1, y1;
  if (b.kind === 'circle') { x0 = b.x - b.r; x1 = b.x + b.r; y0 = b.y - b.r; y1 = b.y + b.r; }
  else {
    const h = b.w / 2;
    x0 = Math.min(b.x1, b.x2) - h; x1 = Math.max(b.x1, b.x2) + h; y0 = Math.min(b.y1, b.y2) - h; y1 = Math.max(b.y1, b.y2) + h;
  }
  return { x0: x0 - pad, y0: y0 - pad - BUSH_LIFT, x1: x1 + pad, y1: y1 + pad, footY: y1 };
}

/** Leafy office-plant clusters filling the bush footprint, lifted for an oblique look. */
function drawBush(ctx, b) {
  const rand = wallRng(b.id);
  const pts = [];
  if (b.kind === 'circle') {
    pts.push({ x: b.x, y: b.y, r: b.r * 0.62 });
    const n = Math.max(5, Math.round(b.r / 18));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.4;
      pts.push({ x: b.x + Math.cos(a) * b.r * 0.58, y: b.y + Math.sin(a) * b.r * 0.58, r: b.r * (0.42 + rand() * 0.12) });
    }
  } else {
    const L = Math.hypot(b.x2 - b.x1, b.y2 - b.y1) || 1, ux = (b.x2 - b.x1) / L, uy = (b.y2 - b.y1) / L;
    const nx = -uy, ny = ux, h = b.w / 2;
    const step = Math.max(34, b.w * 0.34);
    for (let t = -h * 0.35; t <= L + h * 0.35; t += step) {
      for (const off of [-0.5, 0, 0.5]) {
        const o = off * h + (rand() - 0.5) * h * 0.25, tt = t + (rand() - 0.5) * step * 0.5;
        pts.push({ x: b.x1 + ux * tt + nx * o, y: b.y1 + uy * tt + ny * o, r: h * (0.5 + rand() * 0.18) });
      }
    }
  }
  pts.sort((a, c) => a.y - c.y); // back (north) clumps first
  if (ENV.ready && ENV.frames.bush1) { // CC0 sprite canopy (Kenney Tower Defense bushes + sci-fi plants), shaded + tinted
    const cans = [shadedSprite('bush1', 0x5fae62, 0.45), shadedSprite('bush2', 0x4f9e58, 0.4), shadedSprite('bush1', 0x7cc070, 0.5)];
    const leaves = [shadedSprite('plant1', 0xb8e8a8, 0.25), shadedSprite('plant2', 0xb8e8a8, 0.25)];
    for (const p of pts) {
      const lift = BUSH_LIFT * (0.55 + rand() * 0.45), size = p.r * 2.5, hy = p.y - lift;
      ctx.fillStyle = 'rgba(0,10,0,0.35)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, p.r * 0.9, p.r * 0.34, 0, 0, Math.PI * 2); ctx.fill();
      drawShaded(ctx, cans[Math.floor(rand() * cans.length)], p.x, hy + size * 0.5, size, rand() < 0.5);
      if (rand() < 0.55) drawShaded(ctx, leaves[Math.floor(rand() * 2)], p.x + (rand() - 0.5) * p.r * 0.8, hy + size * 0.2, p.r * 1.1, rand() < 0.5);
    }
    return;
  }
  const greens = [0x2f7d3b, 0x3a9446, 0x2a6b34, 0x45a852, 0x337f2f];
  for (const p of pts) {
    const lift = BUSH_LIFT * (0.55 + rand() * 0.45);
    const hx = p.x, hy = p.y - lift;
    ctx.strokeStyle = 'rgba(20,40,20,0.55)'; ctx.lineWidth = 3; // stalks down to the soil
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(p.x + (rand() - 0.5) * 14, p.y); ctx.lineTo(hx + (rand() - 0.5) * p.r * 0.6, hy); ctx.stroke(); }
    const base = greens[Math.floor(rand() * greens.length)];
    const leaf = (ang, len, wid, col) => {
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang);
      ctx.fillStyle = css(col); ctx.beginPath(); ctx.ellipse(len * 0.5, 0, len * 0.5, wid, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = css(shade(col, -0.5)); ctx.lineWidth = 1.4; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(len * 0.88, 0); ctx.strokeStyle = css(shade(col, 0.25)); ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    };
    for (let i = 0; i < 11; i++) leaf((i / 11) * Math.PI * 2 + rand() * 0.35, p.r * (0.95 + rand() * 0.3), p.r * 0.2, shade(base, -0.28 + rand() * 0.12));
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i / 6 - 0.5) * 2.7 + (rand() - 0.5) * 0.3;
      leaf(a, p.r * (0.7 + rand() * 0.35), p.r * 0.17, shade(base, 0.05 + rand() * 0.22));
    }
  }
}

function wallLayout(k, walls = WALLS) {
  const pieces = [];
  for (const w of walls) for (const pc of wallPieces(w)) pieces.push({ w, ...pc });
  for (let tries = 0; tries < 4; tries++, k *= 0.8) {
    const AW = 2048, frames = [];
    for (const pc of pieces) frames.push({ ...pc, fw: Math.max(1, Math.ceil((pc.b.x1 - pc.b.x0) * k)), fh: Math.max(1, Math.ceil((pc.b.y1 - pc.b.y0) * k)) });
    const order = [...frames].sort((a, b) => b.fh - a.fh || (a.name < b.name ? -1 : 1));
    let x = 0, y = 0, rowH = 0;
    for (const f of order) {
      if (x + f.fw > AW) { x = 0; y += rowH + 2; rowH = 0; }
      f.fx = x; f.fy = y; x += f.fw + 2; rowH = Math.max(rowH, f.fh);
    }
    const H = y + rowH;
    if (H <= 4096) return { k, W: AW, H: Math.max(2, H), frames };
  }
  return { k, W: 2, H: 2, frames: [] };
}

function wallRng(id) {
  let s = 2166136261;
  for (const ch of String(id)) s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const num = (c, d) => (typeof c === 'number' && Number.isFinite(c) ? c : (typeof c === 'string' && /^#?[0-9a-f]{6}$/i.test(c) ? parseInt(c.replace('#', ''), 16) : d));

function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Oblique box: front face (south) H px tall under a top face lifted by H. Returns the top rect. */
function box(ctx, x, y, w, h, H, top, side, stroke, rad = 6, tk = null) {
  const g = ctx.createLinearGradient(0, y + h - H, 0, y + h);
  g.addColorStop(0, css(side)); g.addColorStop(1, css(shade(side, -0.4)));
  const tp = tk && texPattern(ctx, tk[0], side, tk[1], 0.7), tt = tk && texPattern(ctx, tk[0], top, tk[1], 0.8);
  if (tp) { ctx.fillStyle = tp; rr(ctx, x, y + h - H - rad, w, H + rad, rad); ctx.fill(); ctx.globalAlpha = 0.6; }
  ctx.fillStyle = g; rr(ctx, x, y + h - H - rad, w, H + rad, rad); ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = css(stroke); ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = tt || css(top); rr(ctx, x, y - H, w, h, rad); ctx.fill();
  if (tt) { ctx.globalAlpha = 0.3; ctx.fillStyle = css(top); ctx.fill(); ctx.globalAlpha = 1; }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + rad, y - H + 2.5); ctx.lineTo(x + w - rad, y - H + 2.5); ctx.stroke();
  return { x, y: y - H, w, h };
}

/** Oblique vertical cylinder (pots, bottles): base circle at (cx, cy), top lifted by H. */
function cyl(ctx, cx, cy, r, H, top, side, stroke) {
  const g = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
  g.addColorStop(0, css(shade(side, -0.35))); g.addColorStop(0.35, css(side)); g.addColorStop(1, css(shade(side, -0.5)));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI); ctx.lineTo(cx - r, cy - H); ctx.arc(cx, cy - H, r, Math.PI, 0, true); ctx.closePath();
  ctx.fill(); ctx.strokeStyle = css(stroke); ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = css(top); ctx.beginPath(); ctx.arc(cx, cy - H, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

function label(ctx, text, x, y, maxW) {
  if (!text || typeof text !== 'string') return;
  ctx.font = 'bold 13px Arial Black, sans-serif';
  if (ctx.measureText(text).width > maxW) return;
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function drawWall(ctx, w, H) {
  // looks.js WALL_STYLE.label is a display NAME (tooltips) — don't paint it onto the furniture.
  const st = { ...wallStyle(w.look), label: '' };
  const rand = wallRng(w.id);
  if (w.kind === 'seg') { drawSegWall(ctx, w, H, st, rand); return; }
  const round = w.look === 'plant' || w.look === 'cooler';
  if (w.kind === 'circle' && !round) {
    // A circular wall with a box look: draw the box inscribed in the footprint circle's bounding square.
    const sq = { ...w, kind: 'rect', x: w.x - w.r, y: w.y - w.r, w: w.r * 2, h: w.r * 2 };
    (WALL_DRAW[w.look] || WALL_DRAW.desk)(ctx, sq, H, st, rand);
  } else if (w.kind !== 'circle' && round) {
    WALL_DRAW.desk(ctx, w, H, st, rand);
  } else (WALL_DRAW[w.look] || WALL_DRAW.desk)(ctx, w, H, st, rand);
}

/** Fill + stroke helper: path of a polygon of [x, y] points. */
function polyPath(ctx, pts) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}
const rgba = (c, a) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

/**
 * v3 office partition (kind 'seg'): oblique box along A→B. Looks:
 *   partition — drywall panels, baseboard, top trim, the odd poster / whiteboard
 *   cubicles  — fabric cubicle backs with aluminium rails, seams, push-pin memos
 *   glass     — translucent glass wall, metal mullions, reflections (you see through it)
 *   shelf     — bookshelf: wooden frame, rows of colourful book spines
 */
const SEG_TEX = { partition: ['plaster', 0.5], cubicles: ['carpet', 0.45], shelf: ['wood', 0.4] }; // look -> [env texture, world units per texel]
function drawSegWall(ctx, w, H, st, rand) {
  const G = segGeom(w);
  const look = w.look;
  const top = num(st.top, 0x6c7280), side = num(st.fill, 0xb9b2a4), stroke = num(st.stroke, 0x23262d), acc = num(st.accent, 0xe6dfcf);
  const glass = look === 'glass';
  const ga = Math.max(0.15, Math.min(0.9, Number.isFinite(st.alpha) ? st.alpha : 0.45)); // glass opacity (looks.js WALL_STYLE.alpha)
  const faces = segFaces(G, H, G.t0, G.t1, 0);
  const topF = faces[0], frontF = G.front ? faces[1] : null, endF = G.endT != null ? faces[G.front ? 2 : 1] : null;
  const eAt = (t, h) => { const p = gAt(G, t, G.hw); return [p[0], p[1] - h]; };
  /** Quad on the long face between arclength t0..t1 and heights h0..h1 (from the floor). */
  const faceQuad = (t0, t1, h0, h1) => [eAt(t0, h0), eAt(t1, h0), eAt(t1, h1), eAt(t0, h1)];
  const seg2 = (a, b) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
  const vline = (t, h0, h1) => seg2(eAt(t, h0), eAt(t, h1));
  const sideGrad = (pts, c) => {
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    const g = ctx.createLinearGradient(0, y0, 0, y1 + 0.01);
    g.addColorStop(0, glass ? rgba(c, ga * 0.75) : css(shade(c, 0.06)));
    g.addColorStop(1, glass ? rgba(shade(c, -0.3), ga * 0.95) : css(shade(c, -0.32)));
    return g;
  };
  ctx.lineJoin = 'round';
  // ── end cap + long face ──
  if (endF) { ctx.fillStyle = glass ? rgba(shade(side, -0.2), ga) : css(shade(side, -0.42)); polyPath(ctx, endF); ctx.fill(); }
  if (frontF) {
    const tk = !glass && SEG_TEX[look], tpF = tk && texPattern(ctx, tk[0], side, tk[1], 0.75);
    if (tpF) {
      ctx.fillStyle = tpF; polyPath(ctx, frontF); ctx.fill();
      ctx.globalAlpha = 0.6; ctx.fillStyle = sideGrad(frontF, side); polyPath(ctx, frontF); ctx.fill(); ctx.globalAlpha = 1;
    } else { ctx.fillStyle = sideGrad(frontF, side); polyPath(ctx, frontF); ctx.fill(); }
    ctx.save(); polyPath(ctx, frontF); ctx.clip();
    const L0 = G.t0, L1 = G.t1;
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; polyPath(ctx, faceQuad(L0, L1, 0, 14)); ctx.fill();   // contact shadow at the foot
    if (look === 'cubicles') {
      ctx.strokeStyle = css(shade(side, -0.5)); ctx.lineWidth = 3;
      for (let t = L0 + 90; t < L1 - 20; t += 90) vline(t, 0, H);                      // panel posts
      ctx.strokeStyle = rgba(0xffffff, 0.06); ctx.lineWidth = 1;                         // fabric weave
      for (let h = 8; h < H - 6; h += 6) seg2(eAt(L0, h), eAt(L1, h));
      ctx.fillStyle = css(shade(side, -0.6)); polyPath(ctx, faceQuad(L0, L1, 0, 5)); ctx.fill();
      for (let t = L0 + 30 + rand() * 60; t < L1 - 40; t += 120 + rand() * 160) {      // pinned memos
        ctx.save(); const c = eAt(t, H * 0.55); ctx.translate(c[0], c[1]); ctx.rotate((rand() - 0.5) * 0.3);
        ctx.fillStyle = ['#fff59d', '#ffffff', '#ffd1dc', '#c8f7c5'][Math.floor(rand() * 4)]; ctx.fillRect(-8, -9, 16, 18);
        ctx.fillStyle = '#ff5e5e'; ctx.beginPath(); ctx.arc(0, -7, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      ctx.fillStyle = css(acc); polyPath(ctx, faceQuad(L0, L1, H - 5, H)); ctx.fill();   // aluminium top rail
    } else if (look === 'glass') {
      ctx.strokeStyle = rgba(0xffffff, 0.28); ctx.lineWidth = 6;                         // reflections
      for (let t = L0 + 40; t < L1; t += 150) seg2(eAt(t, 10), eAt(t + 34, H - 8));
      ctx.lineWidth = 2;
      for (let t = L0 + 66; t < L1; t += 150) seg2(eAt(t, 10), eAt(t + 16, H - 8));
      ctx.strokeStyle = rgba(stroke, 0.8); ctx.lineWidth = 4;
      for (let t = L0 + 100; t < L1 - 20; t += 100) vline(t, 0, H);                      // mullions
      ctx.fillStyle = css(stroke); polyPath(ctx, faceQuad(L0, L1, 0, 6)); ctx.fill();
      ctx.fillStyle = rgba(acc, 0.5); polyPath(ctx, faceQuad(L0, L1, H * 0.45, H * 0.45 + 4)); ctx.fill(); // frosted band
    } else if (look === 'shelf') {
      const rows = 3, rh = (H - 8) / rows;
      ctx.fillStyle = css(shade(side, -0.55)); polyPath(ctx, faceQuad(L0, L1, 4, H - 4)); ctx.fill(); // shelf interior
      const spines = [0xff5e5e, 0x39c2ff, 0xffd23f, 0x7ed957, 0xb084ff, 0xe8e4da, 0xff8a3c, 0x2f86e8, 0x8b5a2b];
      for (let r = 0; r < rows; r++) {
        const h0 = 4 + r * rh + 3, h1 = 4 + (r + 1) * rh - 1;
        for (let t = L0 + 6; t < L1 - 6;) {
          const bw = 5 + rand() * 7, gap = rand() < 0.08 ? 10 + rand() * 18 : 0.8;
          const bh = h0 + (h1 - h0) * (0.72 + rand() * 0.28);
          ctx.fillStyle = css(shade(spines[Math.floor(rand() * spines.length)], -0.1 + rand() * 0.2));
          polyPath(ctx, faceQuad(t, Math.min(L1 - 6, t + bw), h0, bh)); ctx.fill();
          t += bw + gap;
        }
        ctx.fillStyle = css(side); polyPath(ctx, faceQuad(L0, L1, 4 + (r + 1) * rh - 2, 4 + (r + 1) * rh + 2)); ctx.fill(); // shelf board
      }
      ctx.strokeStyle = css(shade(side, 0.1)); ctx.lineWidth = 4;
      for (let t = L0 + 160; t < L1 - 20; t += 160) vline(t, 0, H);                      // uprights
      ctx.fillStyle = css(shade(side, -0.3)); polyPath(ctx, faceQuad(L0, L1, 0, 5)); ctx.fill();
    } else { // partition (drywall) — also the fallback for unknown looks
      ctx.strokeStyle = rgba(shade(side, -0.45), 0.55); ctx.lineWidth = 2;
      for (let t = L0 + 120; t < L1 - 20; t += 120) vline(t, 6, H - 4);              // panel joints
      ctx.fillStyle = css(shade(side, -0.62)); polyPath(ctx, faceQuad(L0, L1, 0, 7)); ctx.fill(); // baseboard
      for (let t = L0 + 70 + rand() * 120; t < L1 - 90; t += 260 + rand() * 220) {  // posters / whiteboards / outlets
        const r = rand();
        if (r < 0.4) { // whiteboard with scribbles
          ctx.fillStyle = '#eef2f6'; polyPath(ctx, faceQuad(t, t + 64, 16, H - 12)); ctx.fill();
          ctx.strokeStyle = '#8a94a8'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.strokeStyle = rand() < 0.5 ? '#39c2ff' : '#ff5e5e'; ctx.lineWidth = 2;
          for (let k = 0; k < 3; k++) seg2(eAt(t + 8, H - 20 - k * 9), eAt(t + 30 + rand() * 26, H - 20 - k * 9));
        } else if (r < 0.75) { // motivational poster
          const pc = [0xffd23f, 0x7ed957, 0xb084ff, 0xff8a3c][Math.floor(rand() * 4)];
          ctx.fillStyle = css(pc); polyPath(ctx, faceQuad(t, t + 30, 18, H - 10)); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.75)'; polyPath(ctx, faceQuad(t + 5, t + 25, H - 20, H - 16)); ctx.fill();
        } else { // power outlet
          ctx.fillStyle = '#e8e4da'; polyPath(ctx, faceQuad(t, t + 9, 11, 21)); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke();
        }
      }
    }
    ctx.restore();
    ctx.strokeStyle = css(stroke); ctx.lineWidth = 3; polyPath(ctx, frontF); ctx.stroke();
    ctx.strokeStyle = glass ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2; seg2(eAt(L0 + 3, H - 2), eAt(L1 - 3, H - 2)); // lit top edge
  }
  if (endF) { ctx.strokeStyle = css(stroke); ctx.lineWidth = 3; polyPath(ctx, endF); ctx.stroke(); }
  // ── top face ──
  const tpT = !glass && SEG_TEX[look] && texPattern(ctx, SEG_TEX[look][0], top, SEG_TEX[look][1], 0.8);
  if (tpT) { ctx.fillStyle = tpT; polyPath(ctx, topF); ctx.fill(); ctx.globalAlpha = 0.35; ctx.fillStyle = css(top); ctx.fill(); ctx.globalAlpha = 1; }
  else { ctx.fillStyle = glass ? rgba(top, Math.min(0.9, ga + 0.15)) : css(top); polyPath(ctx, topF); ctx.fill(); }
  ctx.save(); polyPath(ctx, topF); ctx.clip();
  const T0 = G.t0, T1 = G.t1;
  const ln = (t0, o0, t1, o1) => seg2(up(gAt(G, t0, o0), H), up(gAt(G, t1, o1), H));
  const band = (o) => [up(gAt(G, T0, o), H), up(gAt(G, T1, o), H), up(gAt(G, T1, -o), H), up(gAt(G, T0, -o), H)];
  if (look === 'cubicles') {
    ctx.fillStyle = css(shade(side, -0.25)); polyPath(ctx, band(G.hw * 0.62)); ctx.fill();
    ctx.strokeStyle = css(shade(top, -0.4)); ctx.lineWidth = 3;
    for (let t = T0 + 90; t < T1 - 20; t += 90) ln(t, G.hw, t, -G.hw);                  // post caps
    for (let t = T0 + 40 + rand() * 60; t < T1 - 40; t += 140 + rand() * 120) {           // monitor tops peeking over
      const c = up(gAt(G, t, -G.hw * 0.2), H);
      ctx.fillStyle = '#0d1018'; ctx.fillRect(c[0] - 12, c[1] - 4, 24, 7);
      ctx.fillStyle = 'rgba(57,194,255,0.8)'; ctx.fillRect(c[0] - 10, c[1] + 1, 20, 2);
    }
  } else if (look === 'glass') {
    ctx.strokeStyle = css(stroke); ctx.lineWidth = 7; ln(T0, 0, T1, 0);                     // the glass edge, seen from above
    ctx.strokeStyle = rgba(acc, 0.7); ctx.lineWidth = 2; ln(T0, 0, T1, 0);
  } else if (look === 'shelf') {
    ctx.strokeStyle = 'rgba(0,0,0,0.14)'; ctx.lineWidth = 2;                              // wood grain
    for (let o = -G.hw + 8; o < G.hw - 4; o += 10) ln(T0, o + (rand() - 0.5) * 2, T1, o + (rand() - 0.5) * 2);
    for (let t = T0 + 60 + rand() * 100; t < T1 - 40; t += 180 + rand() * 200) {        // plant pot / box / binders on top
      const c = up(gAt(G, t, 0), H), r = rand();
      if (r < 0.4) { ctx.fillStyle = '#a65530'; ctx.beginPath(); ctx.arc(c[0], c[1], 10, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#3fa34d'; ctx.beginPath(); ctx.arc(c[0], c[1] - 6, 11, 0, Math.PI * 2); ctx.fill(); }
      else if (r < 0.7) { ctx.fillStyle = '#c8a574'; ctx.fillRect(c[0] - 13, c[1] - 11, 26, 20); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5; ctx.strokeRect(c[0] - 13, c[1] - 11, 26, 20); }
      else { ctx.fillStyle = '#ffd23f'; ctx.fillRect(c[0] - 4, c[1] - 12, 8, 22); ctx.fillStyle = '#39c2ff'; ctx.fillRect(c[0] + 5, c[1] - 12, 8, 22); }
    }
  } else {
    ctx.strokeStyle = rgba(acc, 0.35); ctx.lineWidth = 3; ln(T0, 0, T1, 0);
    ctx.strokeStyle = rgba(0x000000, 0.25); ctx.lineWidth = 2; ln(T0, G.hw * 0.55, T1, G.hw * 0.55); ln(T0, -G.hw * 0.55, T1, -G.hw * 0.55);
  }
  ctx.restore();
  ctx.strokeStyle = css(stroke); ctx.lineWidth = 3; polyPath(ctx, topF); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2; // north-edge highlight
  seg2(up(gAt(G, T0 + 4, -G.hw + 3), H), up(gAt(G, T1 - 4, -G.hw + 3), H));
}

const WALL_DRAW = {
  /** Cubicle block: fabric partition panels around 1–3 cells, each with a desk, monitor + chair. */
  cubicle(ctx, w, H, st, rand) {
    const top = num(st.top, 0x66779a), side = num(st.fill, 0x3b475f), stroke = num(st.stroke, 0x0c1019);
    box(ctx, w.x, w.y, w.w, w.h, H, top, side, stroke, 5, ['carpet', 0.45]);
    ctx.strokeStyle = css(shade(side, -0.45)); ctx.lineWidth = 2; // panel seams on the front face
    for (let x = w.x + 46; x < w.x + w.w - 10; x += 46) { ctx.beginPath(); ctx.moveTo(x, w.y + w.h - H + 3); ctx.lineTo(x, w.y + w.h - 3); ctx.stroke(); }
    const T = 15, tx = w.x + T, ty = w.y - H + T, tw = w.w - T * 2, th = w.h - T * 2;
    const vertical = th >= tw;
    const L = vertical ? th : tw;
    const n = Math.max(1, Math.round(L / 230));
    const cell = (L - (n - 1) * 10) / n;
    for (let i = 0; i < n; i++) {
      const cx = vertical ? tx : tx + i * (cell + 10), cy = vertical ? ty + i * (cell + 10) : ty;
      const cw = vertical ? tw : cell, ch = vertical ? cell : th;
      ctx.fillStyle = '#232a39'; ctx.fillRect(cx, cy, cw, ch); // carpet
      const sg = ctx.createLinearGradient(0, cy, 0, cy + 22);
      sg.addColorStop(0, 'rgba(0,0,0,0.55)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg; ctx.fillRect(cx, cy, cw, 22);
      const dh = Math.min(46, ch * 0.32), sw = Math.min(44, cw * 0.3);
      ctx.fillStyle = '#9c6b42'; // L-desk
      ctx.fillRect(cx + 4, cy + 4, cw - 8, dh);
      const left = rand() < 0.5;
      ctx.fillRect(left ? cx + 4 : cx + cw - 4 - sw, cy + 4, sw, ch * 0.62);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(cx + 4, cy + 4, cw - 8, dh);
      const mx = cx + cw * (0.3 + rand() * 0.2), my = cy + 10; // monitor + keyboard
      ctx.fillStyle = '#0d1018'; ctx.fillRect(mx, my, 52, 12);
      ctx.fillStyle = 'rgba(57,194,255,0.85)'; ctx.fillRect(mx + 3, my + 8, 46, 3);
      ctx.fillStyle = '#c9ced8'; ctx.fillRect(mx + 8, my + 18, 36, 9);
      ctx.save(); ctx.translate(mx - 20, my + 14); ctx.rotate(rand() - 0.5); // paper
      ctx.fillStyle = '#eef1f6'; ctx.fillRect(-9, -12, 18, 24); ctx.restore();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(Math.min(cx + cw - 14, mx + 66), my + 16, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a3216'; ctx.beginPath(); ctx.arc(Math.min(cx + cw - 14, mx + 66), my + 16, 3.5, 0, Math.PI * 2); ctx.fill();
      const chx = cx + cw * 0.5, chy = cy + Math.min(ch - 24, dh + 34); // office chair
      ctx.fillStyle = '#14171f'; ctx.beginPath(); ctx.arc(chx, chy, 17, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2d3342'; ctx.beginPath(); ctx.arc(chx, chy - 2, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#14171f'; ctx.fillRect(chx - 15, chy - 20, 30, 7);
    }
    ctx.strokeStyle = css(shade(top, 0.25)); ctx.lineWidth = 2; // panel top rails
    ctx.strokeRect(w.x + 3, w.y - H + 3, w.w - 6, w.h - 6);
    label(ctx, st.label, w.x + w.w / 2, w.y + w.h - H / 2, w.w - 20);
  },

  /** Desk island: wooden top with monitors, keyboards, papers, a mug; drawers on the front. */
  desk(ctx, w, H, st, rand) {
    const top = num(st.top, 0x9c6b42), side = num(st.fill, 0x5b3c24), stroke = num(st.stroke, 0x170d05);
    const t = box(ctx, w.x, w.y, w.w, w.h, H, top, side, stroke, 6, ['wood', 0.4]);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2; // wood grain
    for (let y = t.y + 14; y < t.y + t.h - 6; y += 13) { ctx.beginPath(); ctx.moveTo(t.x + 6, y); ctx.lineTo(t.x + t.w - 6, y + (rand() - 0.5) * 4); ctx.stroke(); }
    const cols = Math.max(1, Math.floor((t.w - 20) / 90));
    const rows = t.h > 150 ? 2 : 1; // facing rows of workstations
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = t.x + 14 + (c + 0.5) * ((t.w - 28) / cols);
        const base = rows === 2 ? (r === 0 ? t.y + t.h * 0.42 : t.y + t.h * 0.58) : t.y + t.h * 0.42;
        const dir = rows === 2 && r === 0 ? -1 : 1;
        ctx.fillStyle = '#0d1018'; ctx.fillRect(cx - 28, base - 6, 56, 12);
        ctx.fillStyle = 'rgba(126,200,255,0.9)'; ctx.fillRect(cx - 25, base + (dir > 0 ? 3 : -5), 50, 3);
        ctx.fillStyle = '#d7dbe3'; ctx.fillRect(cx - 20, base + dir * 22 - 5, 40, 10);
        ctx.fillStyle = '#2a2f3a'; ctx.fillRect(cx + 26, base + dir * 22 - 4, 9, 13);
        if (rand() < 0.6) {
          ctx.save(); ctx.translate(cx - 36 + rand() * 6, base + dir * 30); ctx.rotate((rand() - 0.5) * 0.8);
          ctx.fillStyle = '#eef1f6'; ctx.fillRect(-10, -13, 20, 26); ctx.fillStyle = 'rgba(0,0,0,0.25)';
          for (let l = -8; l < 10; l += 5) ctx.fillRect(-7, l, 14, 1.5);
          ctx.restore();
        }
      }
    }
    const mx = t.x + t.w * (0.2 + rand() * 0.6), my = t.y + t.h * (rows === 2 ? 0.5 : 0.8);
    ctx.fillStyle = '#ff5e5e'; ctx.beginPath(); ctx.arc(mx, my, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a2a12'; ctx.beginPath(); ctx.arc(mx, my, 4.5, 0, Math.PI * 2); ctx.fill();
    const fy = w.y + w.h - H; // drawers + knobs on the front face
    ctx.strokeStyle = css(shade(side, -0.55)); ctx.lineWidth = 2;
    const dn = Math.max(1, Math.floor(w.w / 70));
    for (let i = 1; i < dn; i++) { const x = w.x + (i * w.w) / dn; ctx.beginPath(); ctx.moveTo(x, fy + 3); ctx.lineTo(x, w.y + w.h - 3); ctx.stroke(); }
    ctx.fillStyle = '#d8b878';
    for (let i = 0; i < dn; i++) ctx.fillRect(w.x + ((i + 0.5) * w.w) / dn - 7, fy + H * 0.45, 14, 3);
    label(ctx, st.label, w.x + w.w / 2, t.y + t.h - 14, w.w - 20);
  },

  /** Row of server racks: vented metal roofs, blinking-LED rack units on the front. */
  rack(ctx, w, H, st, rand) {
    const top = num(st.top, 0x2f3749), side = num(st.fill, 0x161b28), stroke = num(st.stroke, 0x04060a);
    const t = box(ctx, w.x, w.y, w.w, w.h, H, top, side, stroke, 4, ['plate', 0.3]);
    const n = Math.max(1, Math.round(w.w / 76)), cw = w.w / n;
    const leds = ['#39ff7a', '#39ff7a', '#39c2ff', '#ffb347', '#39ff7a', '#ff5e5e'];
    for (let i = 0; i < n; i++) {
      const x = w.x + i * cw;
      if (i) { ctx.fillStyle = css(stroke); ctx.fillRect(x - 1.5, t.y, 3, t.h + H); }
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2; // roof vents
      for (let y = t.y + 14; y < t.y + t.h - 10; y += 9) { ctx.beginPath(); ctx.moveTo(x + 10, y); ctx.lineTo(x + cw - 10, y); ctx.stroke(); }
      ctx.fillStyle = 'rgba(57,194,255,0.35)'; ctx.fillRect(x + 8, t.y + 6, cw - 16, 3);
      const fy = w.y + w.h - H + 5;
      for (let u = 0; u < 6; u++) { // rack units with LEDs
        const uy = fy + u * ((H - 10) / 6);
        ctx.fillStyle = u % 2 ? '#1f2636' : '#262f42'; ctx.fillRect(x + 6, uy, cw - 12, (H - 10) / 6 - 2);
        for (let l = 0; l < 4; l++) {
          if (rand() < 0.3) continue;
          ctx.fillStyle = leds[Math.floor(rand() * leds.length)];
          ctx.fillRect(x + 10 + l * 7, uy + 3, 4, 4);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x + cw - 34, uy + 4, 24, 2);
      }
    }
    label(ctx, st.label, w.x + w.w / 2, t.y + t.h / 2, w.w - 20);
  },

  /** Big office copier: glass platen, control panel, paper output, drawers. */
  copier(ctx, w, H, st, rand) {
    const top = num(st.top, 0xd3d8df), side = num(st.fill, 0x878e9b), stroke = num(st.stroke, 0x262a31);
    const t = box(ctx, w.x, w.y, w.w, w.h, H, top, side, stroke, 8);
    const gx = t.x + 16, gy = t.y + 14, gw = t.w * 0.6, gh = t.h - 28; // glass platen
    const gg = ctx.createLinearGradient(gx, gy, gx + gw, gy + gh);
    gg.addColorStop(0, '#30465e'); gg.addColorStop(0.5, '#4f6f8f'); gg.addColorStop(1, '#2a3c52');
    ctx.fillStyle = gg; rr(ctx, gx, gy, gw, gh, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(gx + gw * 0.25, gy + 6); ctx.lineTo(gx + 8, gy + gh * 0.45); ctx.stroke();
    const px = gx + gw + 12, pw = Math.max(20, t.x + t.w - px - 12); // control panel
    ctx.fillStyle = '#3a3f4a'; rr(ctx, px, gy, pw, Math.min(70, gh), 4); ctx.fill();
    ctx.fillStyle = '#7ff7ff'; ctx.fillRect(px + 6, gy + 6, pw - 12, 14);
    const btn = ['#7ed957', '#ff5e5e', '#ffd23f', '#c9ced8'];
    for (let i = 0; i < 4; i++) { ctx.fillStyle = btn[i]; ctx.beginPath(); ctx.arc(px + 10 + i * ((pw - 20) / 3), gy + 34, 4.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#f4f6fa'; ctx.fillRect(px + 4, t.y + t.h - 34, pw - 8, 22); // paper in the output tray
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1.5; ctx.strokeRect(px + 4, t.y + t.h - 34, pw - 8, 22);
    const fy = w.y + w.h - H; // drawers
    ctx.strokeStyle = css(shade(side, -0.5)); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w.x + 8, fy + H / 2); ctx.lineTo(w.x + w.w - 8, fy + H / 2); ctx.stroke();
    ctx.fillStyle = '#2a2e36'; ctx.fillRect(w.x + w.w / 2 - 16, fy + H * 0.25 - 2, 32, 4); ctx.fillRect(w.x + w.w / 2 - 16, fy + H * 0.75 - 2, 32, 4);
    ctx.fillStyle = rand() < 0.5 ? '#ff3b3b' : '#ffb347'; // PAPER JAM light
    ctx.beginPath(); ctx.arc(w.x + w.w - 16, fy + H * 0.25, 4, 0, Math.PI * 2); ctx.fill();
    label(ctx, st.label, w.x + w.w / 2, t.y + t.h - 14, gw);
  },

  /** Big potted office plant: terracotta pot + a crown of leaves covering the footprint. */
  plant(ctx, w, H, st, rand) {
    const pot = num(st.fill, 0xa65530), leaf = num(st.top, 0x3fa34d);
    const cx = w.x, cy = w.y + w.r * 0.25, pr = w.r * 0.62;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.fill();
    cyl(ctx, cx, cy, pr, H, shade(pot, 0.15), pot, shade(pot, -0.6));
    ctx.fillStyle = '#3a2414'; ctx.beginPath(); ctx.arc(cx, cy - H, pr * 0.8, 0, Math.PI * 2); ctx.fill();
    const hx = cx, hy = cy - H - 8;
    const leafAt = (ang, len, wid, col) => {
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang);
      ctx.fillStyle = css(col); ctx.beginPath(); ctx.ellipse(len * 0.5, 0, len * 0.5, wid, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = css(shade(col, -0.45)); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(len * 0.9, 0); ctx.stroke();
      ctx.restore();
    };
    const N = 13;
    for (let i = 0; i < N; i++) leafAt((i / N) * Math.PI * 2 + rand() * 0.3, w.r * (0.95 + rand() * 0.2), w.r * 0.17, shade(leaf, -0.25 + rand() * 0.15));
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (i / 7 - 0.5) * 2.6 + (rand() - 0.5) * 0.3;
      leafAt(a, w.r * (0.7 + rand() * 0.35), w.r * 0.15, shade(leaf, 0.05 + rand() * 0.2));
    }
  },

  /** Water cooler on an anti-slip mat: white cabinet, blue bottle, cup dispenser. */
  cooler(ctx, w, H, st, rand) {
    const body = num(st.fill, 0xd7dee7), water = num(st.top, 0x5fb8ff), stroke = num(st.stroke, 0x232c38);
    ctx.fillStyle = '#2b3240'; ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 3;
    for (let r = w.r - 10; r > 20; r -= 14) { ctx.beginPath(); ctx.arc(w.x, w.y, r, 0, Math.PI * 2); ctx.stroke(); }
    const bw = w.r * 1.25, bd = w.r * 0.95;
    const t = box(ctx, w.x - bw / 2, w.y - bd / 2 + 6, bw, bd, H, shade(body, 0.1), body, stroke, 6);
    const fy = w.y + bd / 2 + 6 - H; // taps + drip tray
    ctx.fillStyle = '#2a2e36'; ctx.fillRect(w.x - 16, fy + H * 0.55, 32, 6);
    ctx.fillStyle = '#39c2ff'; ctx.fillRect(w.x - 12, fy + 6, 7, 9);
    ctx.fillStyle = '#ff5e5e'; ctx.fillRect(w.x + 5, fy + 6, 7, 9);
    const bx = w.x, by = t.y + t.h * 0.5, br = w.r * 0.42, bh = 58; // bottle
    const g = ctx.createLinearGradient(bx - br, 0, bx + br, 0);
    g.addColorStop(0, css(shade(water, -0.35))); g.addColorStop(0.35, css(shade(water, 0.25))); g.addColorStop(1, css(shade(water, -0.45)));
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI); ctx.lineTo(bx - br, by - bh); ctx.arc(bx, by - bh, br, Math.PI, 0, true); ctx.closePath(); ctx.fill();
    ctx.fillStyle = css(shade(water, 0.3)); ctx.beginPath(); ctx.arc(bx, by - bh, br, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = css(shade(water, -0.6)); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(bx, by - bh, br, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(bx - br * 0.55, by - bh + 10); ctx.lineTo(bx - br * 0.55, by - 6); ctx.stroke();
    ctx.fillStyle = css(shade(water, -0.2)); ctx.beginPath(); ctx.arc(bx, by - bh, br * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f4f6fa'; ctx.fillRect(t.x + t.w - 14, t.y + 6, 10, t.h - 16); // cup tube
    ctx.strokeStyle = '#8a94a8'; ctx.lineWidth = 1.5; ctx.strokeRect(t.x + t.w - 14, t.y + 6, 10, t.h - 16);
    if (rand() < 0.5) { ctx.fillStyle = 'rgba(95,184,255,0.45)'; ctx.beginPath(); ctx.ellipse(w.x + w.r * 0.5, w.y + w.r * 0.6, 14, 7, 0, 0, Math.PI * 2); ctx.fill(); }
  },

  /** Break-room sofa: back + arm rests + seat cushions. */
  sofa(ctx, w, H, st, rand) {
    const top = num(st.top, 0xab4656), side = num(st.fill, 0x6f2a35), stroke = num(st.stroke, 0x240a10);
    const t = box(ctx, w.x, w.y, w.w, w.h, H, top, side, stroke, 14);
    const horiz = w.w >= w.h;
    const back = Math.min(36, (horiz ? t.h : t.w) * 0.3), arm = Math.min(28, (horiz ? t.w : t.h) * 0.12);
    ctx.fillStyle = css(shade(top, -0.2));
    if (horiz) { rr(ctx, t.x + 4, t.y + 4, t.w - 8, back, 10); ctx.fill(); rr(ctx, t.x + 4, t.y + 4, arm, t.h - 8, 10); ctx.fill(); rr(ctx, t.x + t.w - 4 - arm, t.y + 4, arm, t.h - 8, 10); ctx.fill(); }
    else { rr(ctx, t.x + 4, t.y + 4, back, t.h - 8, 10); ctx.fill(); rr(ctx, t.x + 4, t.y + 4, t.w - 8, arm, 10); ctx.fill(); rr(ctx, t.x + 4, t.y + t.h - 4 - arm, t.w - 8, arm, 10); ctx.fill(); }
    const L = horiz ? t.w - arm * 2 - 8 : t.h - arm * 2 - 8;
    const n = Math.max(1, Math.round(L / 90));
    ctx.fillStyle = css(shade(top, 0.12)); ctx.strokeStyle = css(shade(top, -0.4)); ctx.lineWidth = 2;
    for (let i = 0; i < n; i++) {
      const a = (L / n) * i;
      if (horiz) rr(ctx, t.x + 4 + arm + a + 3, t.y + 4 + back + 3, L / n - 6, t.h - back - 14, 9);
      else rr(ctx, t.x + 4 + back + 3, t.y + 4 + arm + a + 3, t.w - back - 14, L / n - 6, 9);
      ctx.fill(); ctx.stroke();
    }
    if (rand() < 0.7) { ctx.fillStyle = '#ffd23f'; rr(ctx, t.x + t.w * 0.5 - 14, t.y + t.h * 0.55 - 10, 28, 20, 6); ctx.fill(); }
  },
};

// 2026-11-25 (Story Mode 2.0): the furniture / plant art + palette for other floor renderers (src/story2/FloorMap.js).
export { wallLayout, wallPieces, drawWall, drawBush, bushBounds, WALL_H, BUSH_ALPHA, BUSH_FOCUS_ALPHA, BUSH_SOIL, BUSH_EDGE, BUSH_MAP, FLOOR, GRID, CARPET, CARPET_EDGE, CARPET_LINE };

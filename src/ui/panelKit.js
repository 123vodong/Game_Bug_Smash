// panelKit — small Phaser UI kit for the menu-side panels (Settings, Career, Levels,
// Welcome). Screen-pinned (scrollFactor 0), modal depth 100 — usable from any scene
// (e.g. a pause menu can open SettingsPanel). No DOM except where text input needs it.
import { AudioManager } from '../core/AudioManager.js';

export const FONT_HEAD = 'Arial Black, Impact, sans-serif';
export const FONT_MONO = 'Consolas, monospace';
export const NEON = {
  green: 0x39ff14, teal: 0x00d9c2, cyan: 0x00d9ff, purple: 0xc44dff,
  pink: 0xff3ef2, yellow: 0xffd23f, red: 0xff5a5a, grey: 0x5a6a80,
};
export const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');

/** Text with sane defaults; `style` overrides. */
export function label(scene, x, y, text, style = {}) {
  return scene.add.text(x, y, text, {
    fontFamily: FONT_MONO, fontSize: 16, color: '#ffffff', ...style,
  });
}

/** scrollFactor 0 on an object and all its descendants (screen-pinned UI). */
export function pinTree(o) {
  o.setScrollFactor?.(0);
  if (o.list) o.list.forEach(pinTree);
  return o;
}

/** Local point of a pointer inside a (possibly nested / scaled) game object. */
export function localPoint(obj, p) {
  const m = obj.getWorldTransformMatrix();
  return m.applyInverse(p.x, p.y);
}

/**
 * Rounded neon button. Returns a Container with .hit, .setLabel(text), .setEnabled(bool),
 * .setActive(bool) (filled look, for tabs/segments).
 */
export function button(scene, x, y, w, h, text, { color = NEON.cyan, fontSize = 16, onClick, filled = false, font = FONT_HEAD } = {}) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const t = scene.add.text(0, 0, text, {
    fontFamily: font, fontSize, color: '#ffffff', stroke: '#000000', strokeThickness: 3, align: 'center',
  }).setOrigin(0.5);
  let enabled = true;
  let active = filled;
  const draw = (hover) => {
    g.clear();
    g.fillStyle(active ? color : 0x0a0a14, active ? (hover ? 0.55 : 0.42) : 0.95);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, Math.min(12, h / 3));
    g.lineStyle(2, enabled ? color : NEON.grey, enabled ? (hover ? 1 : 0.85) : 0.5);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, Math.min(12, h / 3));
    t.setAlpha(enabled ? 1 : 0.45);
  };
  draw(false);
  const hit = scene.add.rectangle(0, 0, w, h, 0xffffff, 0).setInteractive({ useHandCursor: true });
  hit.on('pointerover', () => { if (enabled) { draw(true); AudioManager.uiHover(); } });
  hit.on('pointerout', () => { draw(false); c.setScale(1); });
  hit.on('pointerdown', () => { if (enabled) { c.setScale(0.96); AudioManager.uiClick(); } });
  hit.on('pointerup', () => { c.setScale(1); if (enabled) onClick?.(); });
  c.add([g, t, hit]);
  c.hit = hit;
  c.text = t;
  c.setLabel = (s) => { t.setText(s); return c; };
  c.setEnabled = (on) => { enabled = !!on; draw(false); return c; };
  c.setOn = (on) => { active = !!on; draw(false); return c; };
  c.setColorTheme = (col) => { color = col; draw(false); return c; };
  return c;
}

/** Labeled on/off switch. Returns a Container with .set(value) (no callback). */
export function toggle(scene, x, y, w, text, value, onChange, { sub = '' } = {}) {
  const c = scene.add.container(x, y);
  const name = label(scene, -w / 2, sub ? -9 : 0, text, { fontSize: 18 }).setOrigin(0, 0.5);
  c.add(name);
  if (sub) c.add(label(scene, -w / 2, 13, sub, { fontSize: 12, color: '#8fa8b8' }).setOrigin(0, 0.5));
  const sw = scene.add.graphics();
  const st = label(scene, w / 2 - 92, 0, '', { fontSize: 14, fontFamily: FONT_HEAD }).setOrigin(1, 0.5);
  let on = !!value;
  const draw = () => {
    sw.clear();
    sw.fillStyle(on ? NEON.green : 0x26303f, on ? 0.9 : 1);
    sw.fillRoundedRect(w / 2 - 74, -15, 74, 30, 15);
    sw.lineStyle(2, on ? NEON.green : NEON.grey, 1);
    sw.strokeRoundedRect(w / 2 - 74, -15, 74, 30, 15);
    sw.fillStyle(0xffffff, 1);
    sw.fillCircle(on ? w / 2 - 16 : w / 2 - 58, 0, 11);
    st.setText(on ? 'ON' : 'OFF').setColor(on ? '#7ed957' : '#8a94a8');
  };
  draw();
  const hit = scene.add.rectangle(0, 0, w, 40, 0xffffff, 0).setInteractive({ useHandCursor: true });
  hit.on('pointerup', () => { on = !on; draw(); AudioManager.uiClick(); onChange?.(on); });
  c.add([sw, st, hit]);
  c.set = (v) => { on = !!v; draw(); return c; };
  return c;
}

/** Horizontal 0..1 slider with a % readout. onChange(v, final) — final=true on release. */
export function slider(scene, x, y, w, value, onChange) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const pct = label(scene, w / 2 + 14, 0, '', { fontSize: 16, fontFamily: FONT_HEAD }).setOrigin(0, 0.5);
  let v = Math.max(0, Math.min(1, value));
  const draw = () => {
    g.clear();
    g.fillStyle(0x26303f, 1);
    g.fillRoundedRect(-w / 2, -5, w, 10, 5);
    g.fillStyle(NEON.cyan, 1);
    g.fillRoundedRect(-w / 2, -5, Math.max(10, w * v), 10, 5);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(-w / 2 + w * v, 0, 13);
    g.lineStyle(3, NEON.cyan, 1);
    g.strokeCircle(-w / 2 + w * v, 0, 13);
    pct.setText(`${Math.round(v * 100)}%`);
  };
  draw();
  // Tall hit zone so a thumb can grab it on a phone.
  const hit = scene.add.rectangle(0, 0, w + 30, 44, 0xffffff, 0).setInteractive({ useHandCursor: true });
  let dragging = false;
  const setFrom = (p) => {
    const lp = localPoint(c, p);
    v = Math.max(0, Math.min(1, (lp.x + w / 2) / w));
    v = Math.round(v * 20) / 20; // 5 % steps
    draw();
    onChange?.(v, false);
  };
  const move = (p) => { if (dragging) setFrom(p); };
  const up = () => { if (dragging) { dragging = false; onChange?.(v, true); } };
  hit.on('pointerdown', (p) => { dragging = true; setFrom(p); });
  scene.input.on('pointermove', move);
  scene.input.on('pointerup', up);
  c.once('destroy', () => { scene.input.off('pointermove', move); scene.input.off('pointerup', up); });
  c.add([g, pct, hit]);
  c.set = (nv) => { v = Math.max(0, Math.min(1, nv)); draw(); return c; };
  return c;
}

/** Row of segment buttons (one active). options = [{ id, text }]. */
export function segmented(scene, x, y, segW, h, options, value, onChange, color = NEON.cyan) {
  const c = scene.add.container(x, y);
  const btns = [];
  const total = segW * options.length + 8 * (options.length - 1);
  options.forEach((o, i) => {
    const b = button(scene, -total / 2 + segW / 2 + i * (segW + 8), 0, segW, h, o.text, {
      color, fontSize: 14, filled: o.id === value,
      onClick: () => { btns.forEach((bb, j) => bb.setOn(j === i)); onChange?.(o.id); },
    });
    btns.push(b);
  });
  c.add(btns);
  return c;
}

/** Progress bar (frac 0..1). Returns a Graphics. */
export function bar(scene, x, y, w, h, frac, color = NEON.cyan) {
  const g = scene.add.graphics();
  g.fillStyle(0x1a2433, 1);
  g.fillRoundedRect(x, y, w, h, h / 2);
  if (frac > 0) {
    g.fillStyle(color, 1);
    g.fillRoundedRect(x, y, Math.max(h, w * Math.min(1, frac)), h, h / 2);
  }
  return g;
}

/**
 * Modal panel: dims the screen, swallows input under it, ESC / ✕ closes.
 * Content goes in `modal.body` (a Container centered on the panel; (0,0) = panel center).
 * opts: { w, h, title, accent, onClose, onCleanup, closable=true, depth=100 }
 *   onClose   — user closed it (✕ / ESC / close()); not called by close(true) or scene shutdown.
 *   onCleanup — ALWAYS called once when the modal goes away (free DOM nodes etc. here).
 */
export class Modal {
  constructor(scene, { w = 900, h = 560, title = '', accent = NEON.cyan, onClose, onCleanup, closable = true, depth = 100 } = {}) {
    this.scene = scene;
    this.w = w; this.h = h;
    this._onClose = onClose;
    this._onCleanup = onCleanup;
    this.closed = false;
    const { width: W, height: H } = scene.scale;
    this.root = scene.add.container(0, 0).setDepth(depth).setScrollFactor(0);
    // Backdrop eats every click/tap so nothing underneath fires.
    const dim = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.72).setInteractive();
    dim.on('pointerup', (p, lx, ly, e) => e?.stopPropagation?.());
    this.root.add(dim);

    this.panel = scene.add.container(W / 2, H / 2);
    const g = scene.add.graphics();
    g.fillStyle(accent, 0.16);
    g.fillRoundedRect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16, 22);
    g.fillStyle(0x070b16, 0.98);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 16);
    g.lineStyle(3, accent, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 16);
    g.lineStyle(1, accent, 0.35);
    g.strokeRoundedRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 12);
    // Swallow clicks on the panel body too (so they don't reach the dim → nothing, but explicit).
    const body = scene.add.rectangle(0, 0, w, h, 0xffffff, 0).setInteractive();
    this.panel.add([g, body]);
    if (title) {
      const t = scene.add.text(0, -h / 2 + 32, title, {
        fontFamily: FONT_HEAD, fontSize: 26, color: hex(accent), stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5);
      t.setShadow(0, 0, hex(accent), 8, true, true);
      this.panel.add(t);
    }
    if (closable) {
      const x = button(scene, w / 2 - 34, -h / 2 + 32, 48, 42, '✕', { color: accent, fontSize: 20, onClick: () => this.close() });
      this.panel.add(x);
      this._esc = () => this.close();
      scene.input.keyboard?.on('keydown-ESC', this._esc);
    }
    this.body = scene.add.container(0, 0);
    this.panel.add(this.body);
    this.root.add(this.panel);
    this.pin();
    this.panel.setScale(0.94).setAlpha(0);
    scene.tweens.add({ targets: this.panel, scale: 1, alpha: 1, duration: 140, ease: 'Back.easeOut' });
    this._shutdown = () => this.close(true);
    scene.events.once('shutdown', this._shutdown);
  }

  /**
   * Pin every descendant to the screen (scrollFactor 0) so the panel also works in scenes
   * with a scrolling camera (Personal arena). Call again after adding content.
   */
  pin() {
    pinTree(this.root);
    return this;
  }

  /** Remove everything inside body (tab switch). */
  clearBody() { this.body.removeAll(true); }

  close(silent = false) {
    if (this.closed) return;
    this.closed = true;
    if (this._esc) this.scene.input.keyboard?.off('keydown-ESC', this._esc);
    this.scene.events.off('shutdown', this._shutdown);
    this.root.destroy(true);
    try { this._onCleanup?.(); } catch (e) { console.warn('[Modal] cleanup', e); }
    if (!silent) this._onClose?.();
  }
}

/** Simple tab strip; tabs = [{ id, text }]. Calls onSelect(id) (also once for `initial`). */
export function tabs(scene, parent, y, tabsDef, initial, onSelect, color = NEON.cyan, tabW = 170) {
  const btns = [];
  const total = tabW * tabsDef.length + 10 * (tabsDef.length - 1);
  tabsDef.forEach((tdef, i) => {
    const b = button(scene, -total / 2 + tabW / 2 + i * (tabW + 10), y, tabW, 40, tdef.text, {
      color, fontSize: 15, filled: tdef.id === initial,
      onClick: () => { btns.forEach((bb, j) => bb.setOn(j === i)); onSelect(tdef.id); },
    });
    btns.push(b);
  });
  parent.add(btns);
  onSelect(initial);
  return btns;
}

/** Brief centered toast (screen-pinned, depth 110). */
export function toast(scene, msg, color = '#ffffff', ms = 2200) {
  const { width: W, height: H } = scene.scale;
  const t = scene.add.text(W / 2, H * 0.16, msg, {
    fontFamily: FONT_MONO, fontSize: 18, color, backgroundColor: '#05101e',
    padding: { x: 18, y: 10 }, align: 'center', wordWrap: { width: W - 120 },
  }).setOrigin(0.5).setDepth(110).setScrollFactor(0);
  t.setShadow(0, 0, '#00d9ff', 10, true, true);
  scene.tweens.add({ targets: t, alpha: 0, delay: ms, duration: 500, onComplete: () => t.destroy() });
  return t;
}

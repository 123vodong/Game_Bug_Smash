// MPOverlay — screen-pinned "drama" UI for the multiplayer arena:
//   • kill feed        (left, under the minimap)
//   • center banners   (streaks, bounties, events, boss results) — queued
//   • event HUD        (top-center title + countdown bar + screen-edge tint)
//   • toasts           (personal: +hat unlocked, daily mission done, broken by…)
//   • tips             (first-session onboarding hints)
// Pure presentation — MultiPlayScene feeds it from server messages.

const FEED_X = 12;
const FEED_Y = 160;
const FEED_LINE_H = 17;
const FEED_MAX = 6;
const FEED_TTL_MS = 9000;

export class MPOverlay {
  constructor(scene) {
    this.scene = scene;
    const { width: W, height: H } = scene.scale;
    this.W = W; this.H = H;
    this._feed = [];
    this._bannerQueue = [];
    this._bannerBusy = false;
    this._toasts = [];
    this._eventColor = null;

    // ── Event HUD (hidden until an event starts) ──
    this._evBox = scene.add.container(W / 2, 84).setScrollFactor(0).setDepth(56).setVisible(false);
    this._evTitle = scene.add.text(0, 0, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 15, color: '#ffffff',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);
    this._evBarBg = scene.add.rectangle(0, 16, 240, 6, 0x000000, 0.65).setStrokeStyle(1, 0xffffff, 0.25);
    this._evBarFill = scene.add.rectangle(-119, 16, 238, 4, 0xffffff, 1).setOrigin(0, 0.5);
    this._evTime = scene.add.text(128, 16, '', {
      fontFamily: 'Consolas, monospace', fontSize: 11, color: '#ffffff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0, 0.5);
    this._evBox.add([this._evTitle, this._evBarBg, this._evBarFill, this._evTime]);

    // ── Screen-edge tint (event mood) ──
    this._edge = scene.add.graphics().setScrollFactor(0).setDepth(45).setVisible(false);

    // ── Tip pill (onboarding) ──
    this._tip = scene.add.text(W / 2, H - 118, '', {
      fontFamily: 'Consolas, monospace', fontSize: 13, color: '#e8f4ff',
      backgroundColor: 'rgba(5,12,24,0.82)', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(57).setAlpha(0);
  }

  // ───────────────────────── kill feed ─────────────────────────
  /** entry: { text, color?, mine? } */
  feed(entry) {
    const s = this.scene;
    if (!entry || !entry.text) return;
    const t = s.add.text(FEED_X, 0, String(entry.text).slice(0, 90), {
      fontFamily: 'Consolas, monospace', fontSize: 12, color: entry.color || '#dfe6f0',
      stroke: '#000', strokeThickness: 3,
      backgroundColor: entry.mine ? 'rgba(255,210,63,0.16)' : undefined,
      padding: entry.mine ? { x: 4, y: 1 } : undefined,
    }).setScrollFactor(0).setDepth(55).setAlpha(0);
    t._bornAt = s.time.now;
    this._feed.push(t);
    while (this._feed.length > FEED_MAX) this._feed.shift().destroy();
    this._layoutFeed();
    s.tweens.add({ targets: t, alpha: entry.mine ? 1 : 0.9, duration: 180 });
  }

  _layoutFeed() {
    this._feed.forEach((t, i) => { t.y = FEED_Y + i * FEED_LINE_H; });
  }

  // ───────────────────────── center banners ─────────────────────────
  /** b: { title, sub?, color?, big?, urgent? } — queued, one at a time.
   *  `urgent` (event starts — they carry "dodge the red circles" safety info)
   *  jumps the queue and cuts the current banner short. */
  banner(b) {
    if (!b || !b.title) return;
    if (b.urgent) {
      this._bannerQueue = [b, ...this._bannerQueue.filter((x) => x.big)];
      if (this._bannerCur) this._dismissBanner(this._bannerCur, 140);
    } else {
      this._bannerQueue.push(b);
    }
    // Don't let a burst of announcements back up for ages.
    while (this._bannerQueue.length > 3) {
      const idx = this._bannerQueue.findIndex((x) => !x.big && !x.urgent);
      this._bannerQueue.splice(idx >= 0 ? idx : this._bannerQueue.length - 1, 1);
    }
    if (!this._bannerBusy) this._nextBanner();
  }

  /** Fade out the shown banner, then show the next. Safe to call twice. */
  _dismissBanner(cur, ms) {
    if (!cur || cur.done) return;
    cur.done = true;
    if (cur.timer) cur.timer.remove(false);
    const s = this.scene;
    s.tweens.add({
      targets: cur.c, alpha: 0, y: cur.c.y - 18, duration: ms, ease: 'Cubic.easeIn',
      onComplete: () => {
        cur.c.destroy();
        if (this._bannerCur === cur) this._bannerCur = null;
        this._nextBanner();
      },
    });
  }

  _nextBanner() {
    const b = this._bannerQueue.shift();
    if (!b) { this._bannerBusy = false; return; }
    this._bannerBusy = true;
    const s = this.scene;
    const c = s.add.container(this.W / 2, this.H * 0.27).setScrollFactor(0).setDepth(58);
    const title = s.add.text(0, 0, b.title, {
      fontFamily: 'Arial Black, sans-serif', fontSize: b.big ? 36 : 28, color: b.color || '#ffd23f',
      stroke: '#000', strokeThickness: 7, align: 'center',
      wordWrap: { width: this.W * 0.8 },
    }).setOrigin(0.5);
    c.add(title);
    if (b.sub) {
      const sub = s.add.text(0, title.height / 2 + 16, b.sub, {
        fontFamily: 'Consolas, monospace', fontSize: 15, color: '#ffffff',
        stroke: '#000', strokeThickness: 4, align: 'center',
        wordWrap: { width: this.W * 0.8 },
      }).setOrigin(0.5);
      c.add(sub);
    }
    c.setScale(0.55).setAlpha(0);
    s.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 240, ease: 'Back.easeOut' });
    const hold = b.big ? 3000 : 2200;
    const cur = { c, timer: null, done: false };
    this._bannerCur = cur;
    cur.timer = s.time.delayedCall(hold, () => this._dismissBanner(cur, 320));
  }

  // ───────────────────────── event HUD ─────────────────────────
  setEvent(def) {
    if (!def) { this.clearEvent(); return; }
    const col = def.color || '#ffd23f';
    this._eventColor = Phaser.Display.Color.HexStringToColor(col).color;
    this._evTitle.setText(def.title || '').setColor(col);
    this._evBarFill.setFillStyle(this._eventColor, 1);
    this._evBox.setVisible(true).setScale(0.7).setAlpha(0);
    this.scene.tweens.add({ targets: this._evBox, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    this._edge.setVisible(true);
  }

  clearEvent() {
    this._eventColor = null;
    if (this._evBox.visible) {
      this.scene.tweens.add({
        targets: this._evBox, alpha: 0, duration: 260,
        onComplete: () => this._evBox.setVisible(false),
      });
    }
    this._edge.clear().setVisible(false);
  }

  // ───────────────────────── toasts + tips ─────────────────────────
  /** Personal message near the bottom-center (stacks upward). */
  toast(text, color = '#ffffff', ms = 2400) {
    const s = this.scene;
    const t = s.add.text(this.W / 2, 0, text, {
      fontFamily: 'Arial Black, sans-serif', fontSize: 15, color,
      stroke: '#000', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(58).setAlpha(0);
    this._toasts.push(t);
    while (this._toasts.length > 3) this._toasts.shift().destroy();
    this._layoutToasts();
    s.tweens.add({ targets: t, alpha: 1, duration: 160 });
    s.time.delayedCall(ms, () => {
      if (!t.scene) return;
      s.tweens.add({
        targets: t, alpha: 0, duration: 300,
        onComplete: () => {
          const i = this._toasts.indexOf(t);
          if (i >= 0) this._toasts.splice(i, 1);
          t.destroy();
          this._layoutToasts();
        },
      });
    });
  }

  _layoutToasts() {
    const base = this.H - 82;
    for (let i = 0; i < this._toasts.length; i++) {
      this._toasts[this._toasts.length - 1 - i].y = base - i * 24;
    }
  }

  /** Cycle onboarding tips: show each for ~6 s, one every `everyMs`. */
  startTips(tips, everyMs = 9000, firstDelayMs = 4000) {
    const s = this.scene;
    let i = 0;
    const showNext = () => {
      if (i >= tips.length || !this._tip.scene) return;
      this._tip.setText(tips[i++]);
      s.tweens.add({ targets: this._tip, alpha: 1, duration: 300 });
      s.time.delayedCall(6000, () => {
        if (this._tip.scene) s.tweens.add({ targets: this._tip, alpha: 0, duration: 400 });
      });
      s.time.delayedCall(everyMs, showNext);
    };
    s.time.delayedCall(firstDelayMs, showNext);
  }

  // ───────────────────────── per-frame ─────────────────────────
  /** state: the room state (for event countdown). */
  update(now, state) {
    // Expire old feed lines
    if (this._feed.length && now - this._feed[0]._bornAt > FEED_TTL_MS) {
      const old = this._feed.shift();
      this.scene.tweens.add({ targets: old, alpha: 0, duration: 400, onComplete: () => old.destroy() });
      this._layoutFeed();
    }
    // Event countdown bar
    if (this._evBox.visible && state) {
      const total = Math.max(1, state.eventTotalMs | 0);
      const left = Math.max(0, state.eventLeftMs | 0);
      this._evBarFill.width = 238 * Math.min(1, left / total);
      const secs = Math.ceil(left / 1000);
      const str = `${secs}s`;
      if (this._evTime.text !== str) this._evTime.setText(str);
    }
    // Screen-edge mood tint, gently pulsing
    if (this._eventColor != null) {
      const a = 0.10 + 0.08 * Math.sin(now / 260);
      const g = this._edge;
      g.clear();
      g.fillStyle(this._eventColor, a);
      const t = 10, W = this.W, H = this.H;
      g.fillRect(0, 0, W, t); g.fillRect(0, H - t, W, t);
      g.fillRect(0, 0, t, H); g.fillRect(W - t, 0, t, H);
      g.fillStyle(this._eventColor, a * 0.45);
      g.fillRect(0, t, W, t); g.fillRect(0, H - 2 * t, W, t);
      g.fillRect(t, 0, t, H); g.fillRect(W - 2 * t, 0, t, H);
    }
  }
}

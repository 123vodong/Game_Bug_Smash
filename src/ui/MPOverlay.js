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

/** setScrollFactor(0) on a container AND every descendant — Phaser hit-tests
 *  container children with their own scroll factor, so a screen-pinned card
 *  whose children keep factor 1 stops taking clicks once the camera scrolls. */
function pinToScreen(obj) {
  obj.setScrollFactor?.(0);
  if (obj.list) for (const ch of obj.list) pinToScreen(ch);
}

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

    this._feedTop = FEED_Y;
    this._card = null;          // the open modal card (depth 100), if any
    this._veil = null;          // reconnect veil
    this._missionPill = null;   // collapsible daily-mission tracker
  }

  /** True while a modal card or the reconnect veil is up (world input is blocked). */
  get modalOpen() { return !!(this._card || this._veil || this.extModal); }

  // ───────────────────────── modal cards ─────────────────────────
  /**
   * Centered modal card. opts: { title, titleColor?, sub?, body?, bodyColor?, foot?,
   * buttons: [{ label, color?, onClick }], w? }. Replaces any open card.
   * Returns { c, setBody(text), setFoot(text) }.
   */
  card(opts = {}) {
    this.closeCard();
    const s = this.scene, W = this.W, H = this.H;
    const c = s.add.container(0, 0).setScrollFactor(0).setDepth(100);
    const dim = s.add.rectangle(0, 0, W, H, 0x02040a, 0.72).setOrigin(0).setInteractive();
    dim._uiBlock = true;
    const pw = Math.min(opts.w || 560, W - 32);
    const title = s.add.text(W / 2, 0, opts.title || '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: 26, color: opts.titleColor || '#ffd23f',
      stroke: '#000', strokeThickness: 5, align: 'center', wordWrap: { width: pw - 40 },
    }).setOrigin(0.5, 0);
    const sub = s.add.text(W / 2, 0, opts.sub || '', {
      fontFamily: 'Consolas, monospace', fontSize: 14, color: '#c8d3e6', align: 'center',
      wordWrap: { width: pw - 48 },
    }).setOrigin(0.5, 0);
    const body = s.add.text(W / 2, 0, opts.body || '', {
      fontFamily: 'Consolas, monospace', fontSize: 15, color: opts.bodyColor || '#ffffff',
      align: opts.bodyAlign || 'center', lineSpacing: 5, wordWrap: { width: pw - 48 },
    }).setOrigin(0.5, 0);
    const foot = s.add.text(W / 2, 0, opts.foot || '', {
      fontFamily: 'Consolas, monospace', fontSize: 12, color: '#7ec8ff', align: 'center',
      wordWrap: { width: pw - 48 },
    }).setOrigin(0.5, 0);
    // buttons: one row [b, b] or several rows [[b, b], [b]]
    const rawRows = opts.buttons || [];
    const rowSpecs = rawRows.length && Array.isArray(rawRows[0]) ? rawRows : (rawRows.length ? [rawRows] : []);
    const rows = rowSpecs.map((row) => {
      const bw = Math.min(200, (pw - 40 - (row.length - 1) * 10) / Math.max(1, row.length));
      return { bw, items: row.map((b) => this._cardButton(b, bw)) };
    });
    const btns = rows.flatMap((r) => r.items);
    const panel = s.add.graphics();
    c.add([dim, panel, title, sub, body, foot, ...btns.map((b) => b.c)]);

    const layout = () => {
      const gap = 12;
      const btnRows = rows.length;
      const hTitle = title.height, hSub = sub.text ? sub.height + gap : 0;
      const hBody = body.text ? body.height + gap : 0, hFoot = foot.text ? foot.height + gap : 0;
      const ph = Math.min(H - 16, 28 + hTitle + gap + hSub + hBody + hFoot + btnRows * 56 + 14);
      const top = Math.max(8, H / 2 - ph / 2);
      panel.clear();
      panel.fillStyle(0x0a0e16, 0.98).fillRoundedRect(W / 2 - pw / 2, top, pw, ph, 14);
      panel.lineStyle(3, Phaser.Display.Color.HexStringToColor(opts.titleColor || '#39c2ff').color, 0.9)
        .strokeRoundedRect(W / 2 - pw / 2, top, pw, ph, 14);
      let y = top + 22;
      title.y = y; y += hTitle + gap;
      sub.y = y; y += hSub;
      body.y = y; y += hBody;
      foot.y = y; y += hFoot;
      rows.forEach((row, ri) => {
        const by = top + ph - 36 - (rows.length - 1 - ri) * 56;
        const n = row.items.length;
        const total = n * row.bw + (n - 1) * 10;
        row.items.forEach((b, i) => b.c.setPosition(W / 2 - total / 2 + row.bw / 2 + i * (row.bw + 10), by));
      });
    };
    layout();
    pinToScreen(c);
    c.setAlpha(0);
    s.tweens.add({ targets: c, alpha: 1, duration: 140 });
    this._card = {
      c,
      setBody: (t) => { if (body.scene && body.text !== t) { body.setText(t); layout(); } },
      setFoot: (t) => { if (foot.scene && foot.text !== t) { foot.setText(t); layout(); } },
      setTitle: (t) => { if (title.scene && title.text !== t) { title.setText(t); layout(); } },
      opts,
    };
    return this._card;
  }

  _cardButton(b, w = 180) {
    const s = this.scene;
    const color = b.color ?? 0x2d6cdf;
    const c = s.add.container(0, 0);
    const bg = s.add.rectangle(0, 0, w, 44, color, 1).setStrokeStyle(2, 0x000000, 0.9)
      .setInteractive({ useHandCursor: true });
    bg._uiBlock = true;
    const txt = s.add.text(0, 0, b.label, {
      fontFamily: 'Arial Black, sans-serif', fontSize: 15, color: '#ffffff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    if (txt.width > w - 12) txt.setFontSize(Math.max(10, Math.floor(15 * (w - 12) / txt.width)));
    c.add([bg, txt]);
    bg.on('pointerover', () => c.setScale(1.05));
    bg.on('pointerout', () => c.setScale(1));
    // pointerup (not down) so the tap that opened a card can't also press its button
    bg.on('pointerup', () => { c.setScale(1); b.onClick?.(); });
    return { c };
  }

  closeCard() {
    if (!this._card) return;
    const c = this._card.c;
    this._card = null;
    c.destroy();
  }

  get cardOpen() { return !!this._card; }

  // ───────────────────────── reconnect veil ─────────────────────────
  /** Dimmed "reconnecting" veil with a countdown. secsLeft updates via the return value. */
  showVeil(title, sub, onMenu) {
    this.hideVeil();
    const s = this.scene, W = this.W, H = this.H;
    const c = s.add.container(0, 0).setScrollFactor(0).setDepth(99);
    const dim = s.add.rectangle(0, 0, W, H, 0x02040a, 0.6).setOrigin(0).setInteractive();
    dim._uiBlock = true;
    const t = s.add.text(W / 2, H / 2 - 30, title, {
      fontFamily: 'Arial Black, sans-serif', fontSize: 26, color: '#7ec8ff',
      stroke: '#000', strokeThickness: 6, align: 'center', wordWrap: { width: W - 40 },
    }).setOrigin(0.5);
    const st = s.add.text(W / 2, H / 2 + 14, sub || '', {
      fontFamily: 'Consolas, monospace', fontSize: 14, color: '#c8d3e6', align: 'center',
    }).setOrigin(0.5);
    c.add([dim, t, st]);
    if (onMenu) {
      const b = this._cardButton({ label: 'MENU', color: 0x2d6cdf, onClick: onMenu }, 140);
      b.c.setPosition(W / 2, H / 2 + 70);
      c.add(b.c);
    }
    s.tweens.add({ targets: t, alpha: { from: 1, to: 0.55 }, duration: 600, yoyo: true, repeat: -1 });
    pinToScreen(c);
    this._veil = { c, t, st };
    return {
      setTitle: (txt) => { if (t.scene && t.text !== txt) t.setText(txt); },
    };
  }

  hideVeil() {
    if (!this._veil) return;
    this._veil.c.destroy();
    this._veil = null;
  }

  // ───────────────────────── mission tracker pill ─────────────────────────
  /** rows: [{ icon, text, cur, goal, done, mine }] — `mine` = trackable in this mode. */
  setMissions(rows) {
    const s = this.scene;
    if (!this._missionPill) {
      const t = s.add.text(FEED_X, FEED_Y - 24, '', {
        fontFamily: 'Consolas, monospace', fontSize: 12, color: '#e8f4ff',
        backgroundColor: 'rgba(5,12,24,0.78)', padding: { x: 8, y: 4 }, lineSpacing: 3,
      }).setScrollFactor(0).setDepth(55).setInteractive({ useHandCursor: true });
      t._uiBlock = true;
      t.on('pointerup', () => this.toggleMissions());
      this._missionPill = { t, open: false, rows: [] };
    }
    this._missionPill.rows = rows || [];
    this._renderMissions();
  }

  toggleMissions() {
    const p = this._missionPill;
    if (!p) return;
    p.open = !p.open;
    this._renderMissions();
  }

  _renderMissions() {
    const p = this._missionPill;
    if (!p) return;
    const rows = p.rows;
    const done = rows.filter((r) => r.done).length;
    let str = `📋 MISSIONS ${done}/${rows.length} ${p.open ? '▴' : '▾'}`;
    if (p.open) {
      for (const r of rows) {
        const prog = r.done ? '✓' : `${Math.min(r.cur, r.goal)}/${r.goal}`;
        const dim = r.mine ? '' : ' (other mode)';
        str += `\n${r.done ? '✅' : (r.icon || '▫')} ${r.text} · ${prog}${dim}`;
      }
    }
    if (p.t.text !== str) p.t.setText(str);
    p.t.setColor(done === rows.length && rows.length ? '#7ed957' : '#e8f4ff');
    // Push the kill feed below the (expanded) pill
    this._feedTop = Math.max(FEED_Y, p.t.y + p.t.height + 6);
    this._layoutFeed();
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
    this._feed.forEach((t, i) => { t.y = (this._feedTop || FEED_Y) + i * FEED_LINE_H; });
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

// src/ui/moba/uiKit.js — small drawing + formatting helpers shared by the Team
// Mode UI (TeamLobbyScene, ShopPanel, Scoreboard, EndScreen). Same neon look as
// MenuScene: dark rounded panels, glowing borders, Arial Black + Consolas.
// Pure helpers: no state, no listeners (except the button's own pointer events).
import { AudioManager } from '../../core/AudioManager.js';
import { CHAMPIONS, ROLE_ORDER } from '../../../shared/moba/champions.js';

export const FONT_TITLE = 'Arial Black, Impact, sans-serif';
export const FONT_MONO = 'Consolas, "Courier New", monospace';
export const FONT_UI = 'Arial, Helvetica, sans-serif';

export const NEON = {
  green: 0x39ff14, teal: 0x00d9c2, cyan: 0x00d9ff, purple: 0xc44dff,
  pink: 0xff3ef2, yellow: 0xffd23f, red: 0xff5e5e, blue: 0x39c2ff, orange: 0xff9f43,
};

/** 0xRRGGBB → '#rrggbb' */
export const hex = (c) => '#' + ((c >>> 0) & 0xffffff).toString(16).padStart(6, '0');

/**
 * Pin a HUD object to the screen: scrollFactor 0 on it AND on every descendant.
 * (Phaser hit-tests container children with the CHILD's own scrollFactor, so a
 * pinned container with unpinned children renders fine but clicks miss once
 * the camera scrolls.)
 */
export function pin(obj) {
  if (!obj) return obj;
  if (typeof obj.setScrollFactor === 'function') obj.setScrollFactor(0);
  if (Array.isArray(obj.list)) for (const ch of obj.list) pin(ch);
  return obj;
}

/**
 * Neon glow on a Text. Pads the text canvas so the blur fits inside it (without
 * padding the blur is clipped into a visible rectangle). Returns the padding
 * added on each side — offset left/right-anchored texts by it.
 */
export function glow(t, color, blur = 10, stroke = true) {
  const p = Math.ceil(blur * 1.2);
  t.setPadding(p, Math.ceil(p * 0.8));
  t.setShadow(0, 0, typeof color === 'number' ? hex(color) : color, blur, stroke, true);
  return p;
}

// ── Low-poly shapes ──
// Phaser 3.70's WebGL Graphics re-tessellates EVERY arc into 100 freshly
// allocated points EVERY frame, so fillRoundedRect / fillCircle cost ~400 /
// ~100 points per shape per frame. These helpers draw the same shapes as short
// polygons (5 segments per corner) — visually identical at UI sizes.
const CORNER_SEG = 5;
function rrPoints(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const pts = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= CORNER_SEG; i++) {
      const a = a0 + (Math.PI / 2) * (i / CORNER_SEG);
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  return pts;
}
function circlePoints(x, y, r) {
  const n = Math.max(16, Math.min(40, Math.round(r * 0.8)));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
  }
  return pts;
}
export function fillRR(g, x, y, w, h, r) {
  if (r <= 0) g.fillRect(x, y, w, h); else g.fillPoints(rrPoints(x, y, w, h, r), true, true);
  return g;
}
export function strokeRR(g, x, y, w, h, r) {
  if (r <= 0) g.strokeRect(x, y, w, h); else g.strokePoints(rrPoints(x, y, w, h, r), true, true);
  return g;
}
export function fillCircleLP(g, x, y, r) { g.fillPoints(circlePoints(x, y, r), true, true); return g; }
export function strokeCircleLP(g, x, y, r) { g.strokePoints(circlePoints(x, y, r), true, true); return g; }

/** Neon hologram panel (shadow, halo, dark fill, double border) into Graphics `g`. */
export function drawPanel(g, x, y, w, h, opts = {}) {
  const {
    color = NEON.cyan, fill = 0x070c18, fillAlpha = 0.95, radius = 14,
    border = 2, halo = 0.16, shadow = true, inner = true,
  } = opts;
  const r = Math.min(radius, h / 2, w / 2);
  if (shadow) { g.fillStyle(0x000000, 0.5); fillRR(g, x + 4, y + 6, w, h, r); }
  if (halo > 0) { g.fillStyle(color, halo); fillRR(g, x - 6, y - 6, w + 12, h + 12, r + 4); }
  g.fillStyle(fill, fillAlpha); fillRR(g, x, y, w, h, r);
  if (border > 0) { g.lineStyle(border, color, 1); strokeRR(g, x, y, w, h, r); }
  if (inner) { g.lineStyle(1, color, 0.28); strokeRR(g, x + 4, y + 4, w - 8, h - 8, Math.max(2, r - 4)); }
  return g;
}

/**
 * Start another scene after a camera fade — but never wait longer than
 * `maxWallMs` of real time (tweens/camera effects use Phaser's clamped delta,
 * so on a very slow device a 400 ms fade can take seconds).
 */
export function fadeToScene(scene, key, data, fadeMs = 400, maxWallMs = 900) {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    if (scene.sys && scene.sys.isActive()) scene.scene.start(key, data);
  };
  const cam = scene.cameras.main;
  cam.once('camerafadeoutcomplete', go);
  cam.fadeOut(fadeMs, 0, 0, 0);
  setTimeout(go, Math.max(fadeMs, maxWallMs));
}

/**
 * Rounded "pill" tag. Returns a container whose LEFT edge is at x (vertically
 * centered on y); `.pillW` = its width, handy for laying out a row of pills.
 */
export function makePill(scene, x, y, text, opts = {}) {
  const {
    color = NEON.blue, fontSize = 10, textColor = null, fill = 0x000000,
    fillAlpha = 0.55, padX = 7, height = 0, font = FONT_TITLE,
  } = opts;
  const c = scene.add.container(x, y);
  const t = scene.add.text(0, 0, text, {
    fontFamily: font, fontSize, color: textColor || hex(color),
  }).setOrigin(0.5);
  const w = Math.ceil(t.width + padX * 2);
  const h = height || Math.ceil(fontSize + 8);
  const g = scene.add.graphics();
  g.fillStyle(fill, fillAlpha); fillRR(g, 0, -h / 2, w, h, h / 2);
  g.lineStyle(1.5, color, 0.95); strokeRR(g, 0, -h / 2, w, h, h / 2);
  t.x = w / 2;
  c.add([g, t]);
  c.pillW = w;
  return c;
}

/**
 * Neon rounded button (MenuScene style). x,y = center.
 * Returns { root, hit, label, setLabel(s), setDimmed(bool), shake() }.
 * `onClick` fires on pointerup over the button; pointer events are stopped so
 * they never reach scene-level handlers (no accidental world move orders).
 */
export function makeButton(scene, opts) {
  const {
    x, y, w, h, label, sub = '', color = NEON.green, fontSize = 18, radius = 12,
    primary = false, onClick = null, textColor = '#ffffff',
  } = opts;
  const c = scene.add.container(x, y);
  const shadow = scene.add.graphics();
  shadow.fillStyle(0x000000, 0.55);
  fillRR(shadow, -w / 2 + 2, -h / 2 + 6, w, h, radius);
  const halo = scene.add.graphics();
  halo.fillStyle(color, 1);
  fillRR(halo, -w / 2 - 9, -h / 2 - 9, w + 18, h + 18, radius + 6);
  halo.setAlpha(0.2);
  const panel = scene.add.graphics();
  const paint = (lit) => {
    panel.clear();
    panel.fillStyle(lit ? 0x141a2a : 0x0a0a14, 0.96);
    fillRR(panel, -w / 2, -h / 2, w, h, radius);
    panel.lineStyle(3, color, 1);
    strokeRR(panel, -w / 2, -h / 2, w, h, radius);
  };
  paint(false);
  const gloss = scene.add.graphics();
  gloss.fillStyle(0xffffff, 0.06);
  fillRR(gloss, -w / 2 + 6, -h / 2 + 4, w - 12, h * 0.35, Math.max(2, radius - 6));
  const txt = scene.add.text(0, sub ? -9 : 0, label, {
    fontFamily: FONT_TITLE, fontSize, color: textColor, stroke: '#000000', strokeThickness: 3,
  }).setOrigin(0.5);
  glow(txt, color, primary ? 12 : 7);
  c.add([shadow, halo, panel, gloss, txt]);
  let subT = null;
  if (sub) {
    subT = scene.add.text(0, h / 2 - 15, sub, {
      fontFamily: FONT_MONO, fontSize: 11, color: hex(color),
    }).setOrigin(0.5);
    c.add(subT);
  }
  const hit = scene.add.rectangle(0, 0, w, h, 0xffffff, 0).setInteractive({ useHandCursor: true });
  c.add(hit);

  let dimmed = false;
  hit.on('pointerover', () => {
    c.setScale(dimmed ? 1.01 : 1.05); paint(true);
    AudioManager.uiHover();
  });
  hit.on('pointerout', () => { c.setScale(1); paint(false); });
  hit.on('pointerdown', (p, lx, ly, ev) => {
    ev?.stopPropagation?.();
    c.setScale(0.96);
    AudioManager.uiClick();
  });
  hit.on('pointerup', (p, lx, ly, ev) => {
    ev?.stopPropagation?.();
    c.setScale(1.05);
    if (onClick) onClick(p);
  });
  // Breathing halo.
  scene.tweens.add({
    targets: halo, alpha: { from: primary ? 0.2 : 0.14, to: primary ? 0.5 : 0.32 },
    duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
  });

  return {
    root: c, hit, label: txt,
    setLabel(s) { txt.setText(s); return this; },
    setSub(s) { if (subT) subT.setText(s); return this; },
    setDimmed(on) {
      dimmed = !!on;
      txt.setAlpha(dimmed ? 0.45 : 1);
      if (subT) subT.setAlpha(dimmed ? 0.6 : 1);
      halo.setVisible(!dimmed);
      return this;
    },
    shake() {
      if (c._shaking) return;
      c._shaking = true;
      const x0 = c.x;
      scene.tweens.add({
        targets: c, x: x0 + 6, duration: 45, yoyo: true, repeat: 2,
        onComplete: () => { c.x = x0; c._shaking = false; },
      });
    },
  };
}

// ───────────────────────── formatting ─────────────────────────
const pct = (v) => Math.round((Number(v) || 0) * 100);

/** Short stat line for an item. compact → tile-sized ("+35 AD +15% AS"). */
export function itemStatLine(it, compact = false) {
  if (!it) return '';
  const sep = compact ? '  ' : ' · ';
  if (it.consumable) {
    const e = it.effect || {};
    const parts = [];
    if (e.heal) parts.push(`+${e.heal} HP`);
    if (e.mana) parts.push(`+${e.mana} Mana`);
    let s = parts.join(sep);
    if (e.ms && !compact) s += ` over ${Math.round(e.ms / 100) / 10}s`;
    return s;
  }
  const F = {
    ad: (v) => `+${v} AD`, ap: (v) => `+${v} AP`, hp: (v) => `+${v} HP`, mana: (v) => `+${v} Mana`,
    armor: (v) => `+${v} Armor`, ms: (v) => `+${v} MS`, as: (v) => `+${pct(v)}% AS`,
    haste: (v) => `${pct(v)}% CDR`, lifesteal: (v) => (compact ? `${pct(v)}% LS` : `${pct(v)}% lifesteal`),
    apPct: (v) => `+${pct(v)}% AP`,
  };
  return Object.entries(it.stats || {})
    .map(([k, v]) => (F[k] ? F[k](v) : `+${v} ${k}`))
    .join(sep);
}

/** Item id in slot i of a plain array OR a Colyseus ArraySchema ('' when empty). */
export function slotAt(items, i) {
  if (!items) return '';
  let v = items[i];
  if (v === undefined && typeof items.at === 'function') v = items.at(i);
  return typeof v === 'string' ? v : '';
}

/** 1234 → '1,234' */
export function fmtGold(n) {
  return Math.max(0, Math.floor(Number(n) || 0)).toLocaleString('en-US');
}

/** Sort key so team lists read top → jungle → mid → bot → support. */
export function laneRank(champId) {
  const lane = CHAMPIONS[champId]?.lane;
  const i = ROLE_ORDER.indexOf(lane);
  return i < 0 ? ROLE_ORDER.length : i;
}

/** (K + A) / max(1, D), one decimal. */
export function kdaRatio(k, d, a) {
  return Math.round(((Number(k) || 0) + (Number(a) || 0)) / Math.max(1, Number(d) || 0) * 10) / 10;
}

/** Trim a display name to `max` characters (code points, so emoji don't split). */
export function clipName(s, max = 16) {
  const arr = Array.from(String(s ?? ''));
  return arr.length > max ? arr.slice(0, max - 1).join('') + '…' : arr.join('');
}

// ───────────────────────── v3: connection + local prefs ─────────────────────────
/** ws URL for the Team Mode server — SAME logic as TeamModeScene.serverUrl():
 *  same host:port as the page, except the :8000 python dev server → :2567; `?server=` overrides. */
export function teamServerUrl() {
  const loc = window.location;
  const o = new URLSearchParams(loc.search).get('server');
  if (o && /^wss?:\/\//.test(o)) return o;
  if (loc.port === '8000') return `ws://${loc.hostname || 'localhost'}:2567`;
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host || 'localhost:2567'}`;
}

const SPELL_PREF_KEY = 'bugsmash.team.spells';
/** Remembered summoner spells [d, f] (localStorage; validated by the caller's `valid(d,f)`). */
export function loadSpellPrefs(valid, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(SPELL_PREF_KEY) || 'null');
    if (Array.isArray(v) && v.length === 2 && valid(v[0], v[1])) return [v[0], v[1]];
  } catch (_) { /* private mode / bad JSON */ }
  return [...fallback];
}
export function saveSpellPrefs(d, f) {
  try { localStorage.setItem(SPELL_PREF_KEY, JSON.stringify([d, f])); } catch (_) { /* ignore */ }
}

// ───────────────────────── v3: champion / skill text (lobby + select) ─────────────────────────
export const LANE_LABEL = { top: 'TOP LANE', mid: 'MID LANE', bot: 'BOT LANE', jungle: 'JUNGLE', support: 'SUPPORT' };
export const SKILL_TYPE_LABEL = {
  projectile: 'SKILLSHOT', circle: 'AREA', target: 'TARGETED', dash: 'DASH',
  blink: 'BLINK', self: 'SELF', allies: 'TEAM', zone: 'ZONE',
};
const secsTxt = (ms) => `${Math.round((Number(ms) || 0) / 100) / 10}s`;

/** New-mechanic badges for a skill (v2): fan, zone, knockback, wall-stun, pet. */
export function skillTags(s) {
  const out = [];
  if (s.count > 1) out.push({ t: `FAN ×${s.count}`, c: 0xff4fa3 });
  if (s.type === 'zone') out.push({ t: `LINGERS ${secsTxt(s.duration)}`, c: 0x7ec8ff });
  if (s.knockback) out.push({ t: `KNOCKBACK ${s.knockback.dist}`, c: 0xffb347 });
  if (s.wallStun) out.push({ t: `WALL = STUN ${secsTxt(s.wallStun.ms)}`, c: 0xff5e5e });
  if (s.at === 'pet') out.push({ t: 'AROUND SERVO', c: 0x00e5ff });
  if (s.buff && s.buff.petPct) out.push({ t: `SERVO +${pct(s.buff.petPct)}%`, c: 0x00e5ff });
  return out;
}

/** "80 dmg (+70% AP)" from an amount spec { base, perLevel, ad, ap, hp }. */
export function amountStr(spec, label) {
  if (!spec) return '';
  const sc = [];
  if (spec.ad) sc.push(`${pct(spec.ad)}% AD`);
  if (spec.ap) sc.push(`${pct(spec.ap)}% AP`);
  if (spec.hp) sc.push(`${pct(spec.hp)}% max HP`);
  return `${spec.base || 0} ${label}${sc.length ? ` (+${sc.join(', +')})` : ''}`;
}

/** One compact line of the numbers behind a skill (data from champions.js). */
export function skillFacts(s) {
  const out = [];
  if (s.dmg) out.push(amountStr(s.dmg, 'dmg'));
  if (s.heal) out.push(amountStr(s.heal, 'heal'));
  if (s.shield) out.push(amountStr(s.shield, 'shield'));
  if (s.slow) out.push(`slow ${pct(s.slow.pct)}% ${secsTxt(s.slow.ms)}`);
  if (s.root) out.push(`root ${secsTxt(s.root.ms)}`);
  if (s.stun) out.push(`stun ${secsTxt(s.stun.ms)}`);
  if (s.execute) out.push(`+${pct(s.execute.missingHpPct)}% missing HP`);
  if (s.type === 'zone' && s.tickMs) out.push(`every ${secsTxt(s.tickMs)}`);
  const b = s.buff;
  if (b) {
    if (b.as) out.push(`+${pct(b.as)}% attack speed`);
    if (b.msPct) out.push(`+${pct(b.msPct)}% MS`);
    if (b.armor) out.push(`+${b.armor} armor`);
    if (b.dmgReduction) out.push(`-${pct(b.dmgReduction)}% dmg taken`);
    if (b.apPct) out.push(`+${pct(b.apPct)}% AP`);
    if (b.adPct) out.push(`+${pct(b.adPct)}% AD`);
  }
  if (s.duration && (b || s.shield) && s.type !== 'zone') out.push(secsTxt(s.duration));
  if (s.delay && s.type === 'circle') out.push(`${secsTxt(s.delay)} delay`);
  if (!out.length && s.range) out.push(`${s.range} range`);
  return out.join(' · ');
}

/** One-line explanations of the v2 mechanics this champion uses (detail panel). */
export function mechanicHints(c) {
  const sk = Object.values(c.skills || {});
  const out = [];
  if (c.pet) out.push(`🤖 ${c.pet.name}: robot pet, follows you + zaps what you attack. Untargetable.`);
  if (sk.some((s) => s.wallStun)) out.push('🧱 Knock enemies into office walls (partitions, shelves, glass) to STUN them.');
  else if (sk.some((s) => s.knockback)) out.push('💨 Knockbacks shove enemies away from you.');
  if (sk.some((s) => s.type === 'zone')) out.push('🧽 Zones stay on the floor and hit everyone inside every tick.');
  if (sk.some((s) => s.count > 1)) out.push('📱 Fans throw several projectiles; each enemy is hit once per cast.');
  if (c.look && c.look.vehicle === 'scooter') out.push('🛵 Rides a scooter: the fastest base move speed in the office.');
  return out;
}

// ───────────────────────── v3 §3.6: server clock sync ─────────────────────────
/**
 * Repeatable clock sync over the `time` message: send { t: Date.now() } now and every
 * `everyMs` (server accepts ≥ 500 ms apart) → reply { serverNow, t };
 * offset = serverNow + (Date.now() − t) / 2 − Date.now(), keeping the sample with the
 * smallest round trip. `seed` = { offset, rtt } from a previous scene (optional).
 * Returns { offset(), rtt(), stop() } — stop() unbinds the handler + timer (room survives).
 */
export function startClockSync(room, { everyMs = 3000, seed = null } = {}) {
  let best = seed && Number.isFinite(seed.offset) && Number.isFinite(seed.rtt) ? { ...seed } : null;
  let off = null, timer = null, stopped = false;
  const ping = () => {
    if (stopped) return;
    try { room.send('time', { t: Date.now() }); } catch (_) { /* socket closing */ }
  };
  try {
    off = room.onMessage('time', (m) => {
      if (stopped || !m || !Number.isFinite(m.serverNow) || !Number.isFinite(m.t) || !m.t) return;
      const now = Date.now();
      const rtt = now - m.t;
      if (rtt < 0 || rtt > 10000) return;
      const offset = m.serverNow + rtt / 2 - now;
      if (!best || rtt <= best.rtt) best = { offset, rtt };
    });
  } catch (_) { off = null; }
  ping();
  timer = setInterval(ping, Math.max(600, everyMs));
  return {
    offset: () => (best ? best.offset : (seed && Number.isFinite(seed.offset) ? seed.offset : 0)),
    rtt: () => (best ? best.rtt : Infinity),
    sample: () => (best ? { ...best } : null),
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      try { off?.(); } catch (_) { /* ignore */ }
    },
  };
}

// ───────────────────────── Experience Pass 1: §3.3 reconnect loop ─────────────────────────
// Mirrors server/game/moba/tuning.js TEAM_RECONNECT_GRACE_S (used until `welcome.reconnectS` arrives).
// Pass 2: the seat is held for the whole match — this is only how long the page keeps retrying
// by itself; later the menu / Team hub offers REJOIN (saved token, src/core/Identity.js).
export const TEAM_RECONNECT_GRACE_S = 300;

/**
 * Retry `client.reconnect(token)` every `everyMs` (each attempt raced against `attemptMs`) until
 * `graceS` runs out. Real-time timers (the Phaser clock slows on weak devices / hidden tabs).
 *   onTick(secondsLeft, attempts) · onSuccess(room, client) · onFail('timeout' | 'gone', msg)
 * 'gone' = the room itself no longer exists `goneAfter` times in a row (match over / disposed).
 * A late success of an attempt that already timed out is still taken while the loop runs.
 * Returns { cancel() }.
 */
export function reconnectLoop({
  token, graceS = TEAM_RECONNECT_GRACE_S, url = teamServerUrl(), everyMs = 2000, attemptMs = 5000, goneAfter = 3,
  onTick, onSuccess, onFail,
}) {
  const until = Date.now() + Math.max(1, graceS) * 1000;
  let attempts = 0, gone = 0, done = false, timer = null;
  const left = () => Math.max(0, Math.ceil((until - Date.now()) / 1000));
  const finish = (fn) => {
    if (done) return;
    done = true; clearTimeout(timer); clearInterval(ticker);
    try { fn?.(); } catch (e) { console.warn('[reconnect] callback failed', e); }
  };
  const ticker = setInterval(() => {
    if (done) return;
    try { onTick?.(left(), attempts); } catch (_) { /* scene gone */ }
    if (Date.now() >= until) finish(() => onFail?.('timeout', ''));
  }, 250);
  const attempt = async () => {
    if (done) return;
    if (Date.now() >= until) { finish(() => onFail?.('timeout', '')); return; }
    attempts++;
    let client = null, settled = false;
    const next = () => { if (!done && !settled) { settled = true; timer = setTimeout(attempt, everyMs); } };
    try {
      if (typeof Colyseus === 'undefined') throw new Error('no Colyseus client');
      client = new Colyseus.Client(url);
      const p = client.reconnect(token);
      p.then((room) => { // may land after the race timed out
        if (done) { if (settled) { try { room.leave(); } catch (_) { /* ignore */ } } return; }
        finish(() => onSuccess?.(room, client));
      }, () => {});
      await Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('attempt timed out')), attemptMs))]);
    } catch (e) {
      if (done) return;
      const msg = String(e?.message || e);
      // (Pass 2: an expired / invalid token = the hold was released → the match is over)
      gone = /not found|no room|does not exist|disposed|expired|invalid/i.test(msg) ? gone + 1 : 0;
      if (gone >= goneAfter) { finish(() => onFail?.('gone', msg)); return; }
      next();
    }
  };
  timer = setTimeout(attempt, 400);
  return { cancel() { finish(null); } };
}

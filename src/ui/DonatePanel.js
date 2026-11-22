// DonatePanel — "💵 GIVE ME A DOLLAR": the developer's VietQR code + the dollar stickman video.
//
//   import { DonatePanel } from '../ui/DonatePanel.js';
//   DonatePanel.open(this, { onClose });
//
// The video and the QR are real DOM elements over the canvas (same idea as WelcomePanel's input):
// the browser plays the mp4 with sound, the QR stays sharp enough to scan, and phones can
// long-press / SAVE QR it to scan from the photo gallery in a banking app.
// The video plays once with sound (unless the game is muted), then loops silently; tap it to replay.
import { Modal, FONT_HEAD, label, button } from './panelKit.js';
import { AudioManager } from '../core/AudioManager.js';

const QR_URL = 'assets/donate/vietqr.png';
const VIDEO_URL = 'assets/donate/dollar_developer_stickman.mp4';
export const MONEY = 0x4cff8f;
const MONEY_CSS = '#4cff8f';

// Panel layout (game space, relative to the panel center).
const PANEL_W = 860, PANEL_H = 580;
const VID = { x: -266, y: 10, w: 248, h: 441 };     // portrait 720×1280 clip (9:16)
const QR = { x: 145, y: -50, w: 300, h: 302 };      // 468×471 image

/** Put a DOM element over a game-space rect (center cx, cy) and keep it there on resize. */
function overlay(scene, el, cx, cy, w, h) {
  Object.assign(el.style, {
    position: 'fixed', zIndex: '9500', boxSizing: 'border-box', opacity: '0', transition: 'opacity 180ms ease-out',
  });
  const place = () => {
    const canvas = scene.game.canvas;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const sx = r.width / scene.scale.width, sy = r.height / scene.scale.height;
    Object.assign(el.style, {
      left: `${r.left + (cx - w / 2) * sx}px`, top: `${r.top + (cy - h / 2) * sy}px`,
      width: `${w * sx}px`, height: `${h * sy}px`, borderRadius: `${Math.round(14 * sy)}px`,
    });
  };
  place();
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  window.addEventListener('resize', place);
  scene.scale.on('resize', place);
  return () => {
    window.removeEventListener('resize', place);
    scene.scale.off('resize', place);
    el.remove();
  };
}

export const DonatePanel = {
  open(scene, { onClose } = {}) {
    const cleanups = [];
    const m = new Modal(scene, {
      w: PANEL_W, h: PANEL_H, title: '💵 GIVE ME A DOLLAR', accent: MONEY, onClose,
      onCleanup: () => cleanups.forEach((f) => { try { f(); } catch (_) { /* already gone */ } }),
    });
    const { width: W, height: H } = scene.scale;
    const cx = W / 2, cy = H / 2;

    // ── the video (left) ──
    const v = document.createElement('video');
    v.src = VIDEO_URL;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.preload = 'auto';
    v.title = 'tap to replay';
    Object.assign(v.style, {
      objectFit: 'cover', background: '#000', border: `3px solid ${MONEY_CSS}`,
      boxShadow: `0 0 18px ${MONEY_CSS}66`, cursor: 'pointer',
    });
    const playWithSound = () => {
      v.loop = false;
      v.muted = AudioManager.isMuted();
      v.volume = Math.max(0, Math.min(1, AudioManager.getVolume()));
      try { v.currentTime = 0; } catch (_) { /* not loaded yet */ }
      // The click that opened the panel allows sound; if the browser still refuses, play muted.
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    };
    v.addEventListener('ended', () => { v.muted = true; v.loop = true; v.play().catch(() => {}); });
    v.addEventListener('click', playWithSound);
    cleanups.push(overlay(scene, v, cx + VID.x, cy + VID.y, VID.w, VID.h));
    cleanups.push(() => { v.pause(); v.removeAttribute('src'); v.load(); });
    playWithSound();
    m.body.add(label(scene, VID.x, VID.y + VID.h / 2 + 22, '🔊 tap the video to replay', { fontSize: 12, color: '#8fa8b8' }).setOrigin(0.5));

    // ── the QR (right) ──
    const img = document.createElement('img');
    img.src = QR_URL;
    img.alt = 'VietQR donation code';
    Object.assign(img.style, { objectFit: 'contain', background: '#ffffff', border: `3px solid ${MONEY_CSS}` });
    cleanups.push(overlay(scene, img, cx + QR.x, cy + QR.y, QR.w, QR.h));

    const ty = QR.y + QR.h / 2;
    m.body.add(label(scene, QR.x, ty + 26, 'Every dollar fixes one more bug 🐛', {
      fontFamily: FONT_HEAD, fontSize: 18, color: MONEY_CSS, stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5));
    m.body.add(label(scene, QR.x, ty + 56, 'Scan with any Vietnamese banking app (VietQR · Napas 247)', {
      fontSize: 13, color: '#cfe3f5',
    }).setOrigin(0.5));
    m.body.add(label(scene, QR.x, ty + 78, 'Any amount is welcome. Thank you! 💚', { fontSize: 13, color: '#ffd23f' }).setOrigin(0.5));

    // Phones: save the QR, then pick it from the gallery inside the banking app.
    const save = button(scene, QR.x, ty + 124, 190, 40, '⬇ SAVE QR', {
      color: MONEY, fontSize: 15,
      onClick: () => {
        const a = document.createElement('a');
        a.href = QR_URL;
        a.download = 'bug-smash-donate-vietqr.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        save.setLabel('✔ SAVED');
        scene.time.delayedCall(1800, () => { if (!m.closed) save.setLabel('⬇ SAVE QR'); });
      },
    });
    m.body.add(save);
    m.pin();
    return m;
  },
};

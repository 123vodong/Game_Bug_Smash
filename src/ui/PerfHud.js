// src/ui/PerfHud.js — Global top-left FPS + Ping benchmark HUD (works in 2D Phaser, 3D Three.js, and Menu).
// Idempotent: calling mountPerfHud() multiple times returns the same controller on window.__bsPerf.

const STALE_PING_MS = 25000;
const WINDOW_MS = 500;

function fpsColor(fps) {
  if (fps >= 50) return '#5fe07a';
  if (fps >= 30) return '#ffd23f';
  return '#ff5e5e';
}

function pingColor(ms) {
  if (ms <= 60) return '#5fe07a';
  if (ms <= 130) return '#ffd23f';
  return '#ff5e5e';
}

export function mountPerfHud() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (window.__bsPerf) return window.__bsPerf;

  const pill = document.createElement('div');
  pill.id = 'bs-perf-hud';
  pill.style.cssText = [
    'position: fixed',
    'top: 8px',
    'left: 10px',
    'z-index: 9500',
    'pointer-events: none',
    'font: 600 11px/1 Consolas, "Courier New", monospace',
    'background: rgba(8,12,24,0.72)',
    'border: 1px solid rgba(200,170,110,0.45)',
    'border-radius: 6px',
    'padding: 4px 8px',
    'display: flex',
    'gap: 8px',
    'align-items: center',
    'backdrop-filter: blur(2px)',
    'user-select: none',
    'letter-spacing: 0.2px',
  ].join(';');

  const fpsEl = document.createElement('span');
  fpsEl.textContent = '-- FPS';
  fpsEl.style.color = '#5fe07a';

  const sepEl = document.createElement('span');
  sepEl.textContent = '·';
  sepEl.style.color = 'rgba(200,170,110,0.5)';

  const pingEl = document.createElement('span');
  pingEl.textContent = 'LOCAL';
  pingEl.style.color = '#8ea2c8';

  const extraEl = document.createElement('span');
  extraEl.style.cssText = 'color:#8ea2c8;display:none';

  pill.append(fpsEl, sepEl, pingEl, extraEl);

  const attach = () => {
    if (!pill.isConnected && document.body) document.body.appendChild(pill);
  };
  if (document.body) attach();
  else window.addEventListener('DOMContentLoaded', attach, { once: true });

  let pingMs = null;
  let pingAt = 0;

  function renderPing(now) {
    if (pingMs !== null && now - pingAt <= STALE_PING_MS) {
      const r = Math.max(0, Math.round(pingMs));
      pingEl.textContent = `${r} ms`;
      pingEl.style.color = pingColor(r);
    } else {
      pingEl.textContent = 'LOCAL';
      pingEl.style.color = '#8ea2c8';
    }
  }

  let frames = 0;
  let winStart = performance.now();
  let lastFrame = winStart;
  let frameTimeSum = 0;

  function tick(now) {
    const dt = now - lastFrame;
    lastFrame = now;
    if (dt > 0 && dt < 1000) {
      frames++;
      frameTimeSum += dt;
    } else if (dt >= 1000) {
      // Tab returned from background — reset sampling window.
      frames = 0;
      frameTimeSum = 0;
      winStart = now;
    }

    const elapsed = now - winStart;
    if (elapsed >= WINDOW_MS) {
      const fps = Math.round((frames * 1000) / elapsed);
      const avgMs = frames > 0 ? (frameTimeSum / frames).toFixed(1) : '0.0';
      fpsEl.textContent = `${fps} FPS`;
      fpsEl.style.color = fpsColor(fps);
      fpsEl.title = `${avgMs} ms/frame`;
      renderPing(Date.now());
      frames = 0;
      frameTimeSum = 0;
      winStart = now;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  const api = {
    setPing(rttMs) {
      if (!Number.isFinite(rttMs) || rttMs < 0) return;
      pingMs = rttMs;
      pingAt = Date.now();
      renderPing(pingAt);
    },
    clearPing() {
      pingMs = null;
      pingAt = 0;
      renderPing(Date.now());
    },
    setExtra(text) {
      const s = text == null ? '' : String(text).trim();
      if (s) {
        extraEl.textContent = `· ${s}`;
        extraEl.style.display = '';
      } else {
        extraEl.textContent = '';
        extraEl.style.display = 'none';
      }
    },
    show() { pill.style.display = 'flex'; },
    hide() { pill.style.display = 'none'; },
  };

  window.__bsPerf = api;
  return api;
}

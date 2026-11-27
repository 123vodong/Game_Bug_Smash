// DOM loading screen for the 3D renderer: progress bar + office-humor tips. No Phaser dependency.
const TIPS = [
  'Compiling shaders... and excuses.',
  'Reticulating splines. Also your standup.',
  'Loading 4.5 MB of models, 0 MB of work-life balance.',
  'Dang chay build, doi chut nhe.',
  'Dang tai... uong ly cafe di.',
];
let root = null, bar = null, label = null, tipEl = null, tipTimer = 0;

export function showLoading(text = 'Loading') {
  if (root) { setProgress(0, text); return root; }
  root = document.createElement('div');
  root.id = 'bs3d-loading';
  root.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#0b0f1e;color:#e8eefc;font:16px "Segoe UI",system-ui,sans-serif;padding:16px;text-align:center';
  root.innerHTML = '<div class="l" style="font-weight:600;letter-spacing:.06em"></div>' +
    '<div style="width:min(420px,80vw);height:10px;background:#1a2447;border-radius:5px;overflow:hidden"><i style="display:block;height:100%;width:0;background:linear-gradient(#9cf06f,#4fa02e);transition:width .15s"></i></div>' +
    '<div class="t" style="color:#8fa0c4;font-size:13px;min-height:1.4em"></div>';
  label = root.querySelector('.l'); bar = root.querySelector('i'); tipEl = root.querySelector('.t');
  document.body.appendChild(root);
  const next = () => { tipEl.textContent = TIPS[Math.floor(Math.random() * TIPS.length)]; };
  next(); tipTimer = setInterval(next, 2500);
  setProgress(0, text);
  return root;
}

export function setProgress(frac, text) {
  if (!root) return;
  bar.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
  if (text) label.textContent = text + ' ' + Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
}

/** Replace the tip line with a visible message (e.g. 'not ready'); keeps the screen up. */
export function showMessage(msg) {
  if (!root) showLoading('');
  clearInterval(tipTimer);
  tipEl.textContent = msg;
  tipEl.style.color = '#ffd166';
}

export function hideLoading() {
  clearInterval(tipTimer);
  if (root) root.remove();
  root = bar = label = tipEl = null;
}

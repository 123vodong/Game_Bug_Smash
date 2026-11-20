// WelcomePanel — first-run welcome card (EP-13) and the "edit your name" card.
// Uses a real DOM <input> over the canvas so IME typing (Telex/VNI → "Đông") and phone
// soft keyboards work; it replaces window.prompt.
//
//   WelcomePanel.open(scene, { mode: 'welcome', onChoice: (choice) => … })  // 'campaign' | 'online'
//   WelcomePanel.open(scene, { mode: 'rename', onDone: (name) => … })
import { SaveManager } from '../core/SaveManager.js';
import { Modal, NEON, FONT_HEAD, label, button } from './panelKit.js';

const MAX_NAME = 16;

/** DOM input placed over a game-space rect (cx, cy, w, h); follows canvas resizes. */
function domInput(scene, cx, cy, w, h, value) {
  const el = document.createElement('input');
  el.type = 'text';
  el.value = value || '';
  el.maxLength = 32;               // UTF-16 units; trimmed to 16 code points on save
  el.autocomplete = 'off';
  el.spellcheck = false;
  el.lang = 'vi';                  // hint the IME toward Vietnamese
  el.placeholder = 'your name';
  el.setAttribute('enterkeyhint', 'done');
  Object.assign(el.style, {
    position: 'fixed', zIndex: '9500', boxSizing: 'border-box', textAlign: 'center',
    color: '#ffffff', background: 'rgba(5,10,20,0.98)', border: '3px solid #39ff14',
    borderRadius: '10px', outline: 'none', fontFamily: 'Consolas, monospace', padding: '0 10px',
  });
  const place = () => {
    const canvas = scene.game.canvas;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const sx = r.width / scene.scale.width, sy = r.height / scene.scale.height;
    Object.assign(el.style, {
      left: `${r.left + (cx - w / 2) * sx}px`, top: `${r.top + (cy - h / 2) * sy}px`,
      width: `${w * sx}px`, height: `${h * sy}px`,
      fontSize: `${Math.max(16, Math.round(24 * sy))}px`, // ≥16px: iOS won't zoom on focus
    });
  };
  place();
  // Keys typed here must not reach Phaser (it listens on window): M would mute, ENTER would start…
  const stop = (ev) => ev.stopPropagation();
  el.addEventListener('keyup', stop);
  el.addEventListener('keypress', stop);
  document.body.appendChild(el);
  window.addEventListener('resize', place);
  scene.scale.on('resize', place);
  const kb = scene.input.keyboard;
  kb?.disableGlobalCapture?.();     // captured keys (SPACE, arrows, WASD…) must reach the input
  return {
    el,
    destroy() {
      window.removeEventListener('resize', place);
      scene.scale.off('resize', place);
      kb?.enableGlobalCapture?.();
      el.remove();
    },
  };
}

export const WelcomePanel = {
  open(scene, { mode = 'welcome', onChoice, onDone, onClose } = {}) {
    const welcome = mode === 'welcome';
    const w = 820, h = welcome ? 500 : 360;
    let input = null;
    const m = new Modal(scene, {
      w, h, accent: NEON.green, closable: !welcome,
      title: welcome ? '👋 WELCOME, NEW HIRE!' : '✏️ YOUR NAME',
      onCleanup: () => input?.destroy(),
      onClose,
    });
    const { width: W, height: H } = scene.scale;
    const c = m.body;
    let y = -h / 2 + 84;
    if (welcome) {
      c.add(label(scene, 0, y, 'HR lost your paperwork, so just smash bugs.', { fontSize: 19, color: '#dfe8f0' }).setOrigin(0.5));
      y += 30;
      c.add(label(scene, 0, y, 'Bugs are eating the deadline. You have a laptop. Do the math.', { fontSize: 15, color: '#8fa8b8' }).setOrigin(0.5));
      y += 46;
    }
    c.add(label(scene, 0, y, 'What should the office call you?', { fontSize: 17, color: '#ffd23f', fontFamily: FONT_HEAD }).setOrigin(0.5));
    y += 48;
    const fieldY = y;
    // Field frame drawn in Phaser (visible in screenshots even before the DOM input paints).
    const frame = scene.add.graphics();
    frame.lineStyle(2, NEON.green, 0.4);
    frame.strokeRoundedRect(-212, fieldY - 30, 424, 60, 12);
    c.add(frame);
    input = domInput(scene, W / 2, H / 2 + fieldY, 400, 52, SaveManager.getPlayerName());
    y += 44;
    const err = label(scene, 0, y, `max ${MAX_NAME} characters · Vietnamese welcome (Đông, Hằng…)`, { fontSize: 13, color: '#8fa8b8' }).setOrigin(0.5);
    c.add(err);

    const commit = () => {
      const raw = input.el.value;
      const clean = SaveManager.setPlayerName(raw);
      return clean;
    };
    const finish = (choice) => {
      const name = commit();
      if (welcome) SaveManager.setFlag('welcomeSeen', true);
      m.close(true);   // onCleanup removes the DOM input
      if (welcome) onChoice?.(choice, name);
      else onDone?.(name);
    };

    y += 70;
    if (welcome) {
      c.add(button(scene, -190, y, 330, 64, '▶ START TRAINING', {
        color: NEON.green, fontSize: 20, filled: true, onClick: () => finish('campaign'),
      }));
      c.add(button(scene, 190, y, 330, 64, '🌐 JUMP ONLINE', {
        color: NEON.cyan, fontSize: 20, onClick: () => finish('online'),
      }));
      c.add(label(scene, -190, y + 48, 'campaign 1-1 · learn the ropes', { fontSize: 13, color: '#8fa8b8' }).setOrigin(0.5));
      c.add(label(scene, 190, y + 48, 'endless office arena with others', { fontSize: 13, color: '#8fa8b8' }).setOrigin(0.5));
      const later = label(scene, 0, h / 2 - 24, 'look around the menu first', { fontSize: 13, color: '#5a7a90' }).setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      later.on('pointerup', () => finish('menu'));
      c.add(later);
    } else {
      c.add(button(scene, -120, y - 10, 200, 52, 'SAVE', { color: NEON.green, fontSize: 18, filled: true, onClick: () => finish('save') }));
      c.add(button(scene, 120, y - 10, 200, 52, 'CANCEL', { color: NEON.grey, fontSize: 18, onClick: () => m.close() }));
    }

    input.el.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.isComposing || ev.keyCode === 229) return; // mid-IME-composition: let Telex/VNI finish
      if (ev.key === 'Enter') { ev.preventDefault(); finish(welcome ? 'campaign' : 'save'); }
      else if (ev.key === 'Escape' && !welcome) { ev.preventDefault(); m.close(); }
    });
    const touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (!touch) setTimeout(() => { if (!m.closed) input.el.focus(); }, 160);
    m.pin();
    return m;
  },
};

// SettingsPanel — volume, mute, screen shake, flashes, Team FX quality, "replay tutorials",
// a controls card per mode, and About/credits. Opens from the menu (SETTINGS / about link)
// and can be opened from any scene (e.g. a pause card):
//
//   import { SettingsPanel } from '../ui/SettingsPanel.js';
//   SettingsPanel.open(this, { tab: 'controls', onClose: () => … });   // tab: settings|controls|about
//
// Everything persists immediately (SaveManager settings / `muted` / bugsmash.team.fx).
import { SaveManager } from '../core/SaveManager.js';
import { AudioManager } from '../core/AudioManager.js';
import { fxPrefsChanged } from '../core/FxPrefs.js';
import { Modal, NEON, FONT_HEAD, FONT_MONO, label, toggle, slider, segmented, button, tabs, toast } from './panelKit.js';

const isTouch = () => (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));

// Controls per mode (kept in sync with each scene's own hint line).
const CONTROLS = {
  campaign: {
    title: '🎯 CAMPAIGN',
    keys: [
      ['Mouse', 'your stickman follows the cursor'],
      ['HOLD click', 'smash (one click is a code review, not a fix)'],
      ['P', 'pause'], ['H', 'skill guide'], ['M', 'mute'], ['ESC', 'back to menu'],
    ],
    touch: [['Drag', 'move'], ['Hold finger', 'smash'], ['⏸', 'pause']],
  },
  arena: {
    title: '🌐 PERSONAL (online)',
    keys: [
      ['Click / arrows', 'move'], ['SPACE / click bug', 'smash'],
      ['Q', 'dash'], ['W', 'shield'], ['E', 'jump'], ['R', 'ultimate'],
      ['ENTER', 'chat'], ['M', 'mute'], ['ESC', 'clock out'],
    ],
    touch: [['Left thumb', 'joystick'], ['Tap a bug', 'smash'], ['Buttons', 'skills (bottom-right)'], ['☰', 'break room']],
  },
  team: {
    title: '⚔️ TEAM 5v5 (Office Siege)',
    keys: [
      ['Right/left-click', 'move · click enemy = attack'], ['Q W E R', 'skills at cursor'],
      ['D F', 'summoner spells'], ['SPACE', 'attack nearest'], ['B', 'recall'],
      ['P', 'shop'], ['C', 'info'], ['TAB', 'scores'],
    ],
    touch: [['Joystick', 'move'], ['⚔', 'attack'], ['Skill / D F', 'auto-aim'], ['🏠 🛒 ℹ', 'recall · shop · info']],
  },
};

const CREDITS = [
  'BUG SMASH — Save the Deadline',
  '',
  'A tiny office comedy about fixing bugs before Friday.',
  'Game design, code & art direction: the Bug Smash team',
  'Built with Phaser 3, Colyseus and WebAudio (every sound is synthesized).',
  'Stickmen animated with love and too much coffee.',
  '',
  'No bugs were harmed. Most of them were features.',
];

export const SettingsPanel = {
  /** Open the panel. Returns the Modal. */
  open(scene, { tab = 'settings', onClose } = {}) {
    const m = new Modal(scene, { w: 960, h: 600, title: '⚙ SETTINGS', accent: NEON.teal, onClose });
    const content = scene.add.container(0, 0);
    m.body.add(content);
    tabs(scene, m.body, -m.h / 2 + 84, [
      { id: 'settings', text: 'AUDIO & FX' },
      { id: 'controls', text: 'CONTROLS' },
      { id: 'about', text: 'ABOUT' },
    ], tab, (id) => {
      content.removeAll(true);
      if (id === 'settings') buildSettings(scene, content, m);
      else if (id === 'controls') buildControls(scene, content, m);
      else buildAbout(scene, content, m);
      m.pin();
    }, NEON.teal);
    return m;
  },
};

function buildSettings(scene, c, m) {
  const s = SaveManager.getSettings();
  const colW = 760;
  let y = -150;
  // Volume
  c.add(label(scene, -colW / 2, y, 'Volume', { fontSize: 18 }).setOrigin(0, 0.5));
  const vol = slider(scene, 30, y, 380, s.volume, (v, final) => {
    AudioManager.setVolume(v);
    if (final) { SaveManager.setSettings({ volume: v }); AudioManager.volumePreview(); }
  });
  c.add(vol);
  y += 62;
  const mute = toggle(scene, 0, y, colW, 'Sound', !SaveManager.isMuted(), (on) => {
    SaveManager.setMuted(!on); AudioManager.setMuted(!on);
    if (on) AudioManager.volumePreview();
  }, { sub: 'M key mutes in every mode' });
  c.add(mute);
  y += 62;
  c.add(toggle(scene, 0, y, colW, 'Screen shake', s.shake, (on) => {
    SaveManager.setSettings({ shake: on }); fxPrefsChanged();
    if (on) scene.cameras.main.shake(160, 0.006);
  }, { sub: 'Slams, explosions, boss hits' }));
  y += 62;
  c.add(toggle(scene, 0, y, colW, 'Flashes', s.flashes, (on) => {
    SaveManager.setSettings({ flashes: on }); fxPrefsChanged();
  }, { sub: 'Full-screen flashes (turn off if they bother your eyes)' }));
  y += 66;
  c.add(label(scene, -colW / 2, y - 9, 'Team 5v5 effects', { fontSize: 18 }).setOrigin(0, 0.5));
  c.add(label(scene, -colW / 2, y + 13, 'Low = smoother on old laptops / phones', { fontSize: 12, color: '#8fa8b8' }).setOrigin(0, 0.5));
  c.add(segmented(scene, colW / 2 - 165, y, 104, 38, [
    { id: 'auto', text: 'AUTO' }, { id: 'high', text: 'HIGH' }, { id: 'low', text: 'LOW' },
  ], SaveManager.getTeamFx(), (id) => SaveManager.setTeamFx(id), NEON.teal));
  y += 76;
  c.add(button(scene, -colW / 2 + 150, y, 300, 46, '↺ REPLAY TUTORIALS', {
    color: NEON.yellow, fontSize: 15,
    onClick: () => {
      SaveManager.clearFlags();
      toast(scene, 'Tutorials reset — the coach and tips will show again.', '#ffd23f');
    },
  }));
  c.add(label(scene, -colW / 2 + 320, y, 'Campaign coach, arena tips and siege tips', { fontSize: 13, color: '#8fa8b8' }).setOrigin(0, 0.5));
}

function buildControls(scene, c) {
  const touch = isTouch();
  const cols = ['campaign', 'arena', 'team'];
  const colW = 290;
  cols.forEach((id, i) => {
    const def = CONTROLS[id];
    const x = -colW - 10 + i * (colW + 10);
    const g = scene.add.graphics();
    g.fillStyle(0x0d1626, 1);
    g.fillRoundedRect(x - colW / 2, -160, colW, 400, 12);
    g.lineStyle(1, NEON.teal, 0.5);
    g.strokeRoundedRect(x - colW / 2, -160, colW, 400, 12);
    c.add(g);
    c.add(scene.add.text(x, -138, def.title, {
      fontFamily: FONT_HEAD, fontSize: 15, color: '#ffd23f', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));
    // Touch devices see their touch controls first, then the keyboard list.
    const rows = touch ? [...def.touch, ['—', ''], ...def.keys] : def.keys;
    const keyW = 118;
    let y = -116;
    for (const [k, v] of rows) {
      if (y > 222) break;
      if (k === '—') { c.add(label(scene, x, y + 6, '— keyboard —', { fontSize: 12, color: '#5a7a90' }).setOrigin(0.5, 0)); y += 26; continue; }
      const kt = label(scene, x - colW / 2 + 14, y, k, {
        fontSize: 13, color: '#00d9ff', fontFamily: FONT_HEAD, wordWrap: { width: keyW - 8 },
      });
      const vt = label(scene, x - colW / 2 + 14 + keyW, y + 1, v, {
        fontSize: 13, color: '#dfe8f0', wordWrap: { width: colW - keyW - 26, useAdvancedWrap: true },
      });
      c.add([kt, vt]);
      y += Math.max(kt.height, vt.height) + 10;
    }
  });
}

function buildAbout(scene, c) {
  c.add(scene.add.text(0, -150, '🐞', { fontSize: 54 }).setOrigin(0.5));
  CREDITS.forEach((line, i) => {
    c.add(label(scene, 0, -92 + i * 28, line, {
      fontSize: i === 0 ? 22 : 16, fontFamily: i === 0 ? FONT_HEAD : FONT_MONO,
      color: i === 0 ? '#39ff14' : '#dfe8f0', align: 'center',
    }).setOrigin(0.5));
  });
  c.add(label(scene, 0, 170, 'Tip: your settings, career and hats live in this browser.', {
    fontSize: 13, color: '#8fa8b8',
  }).setOrigin(0.5));
}

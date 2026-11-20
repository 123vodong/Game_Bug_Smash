// In-game HUD overlay. Reads game state each frame via update().
import { Player } from '../entities/Player.js';
import { AISkillManager } from '../systems/AISkillManager.js';
import { SKILLS } from '../data/skills.js';

export class HUD {
  constructor(scene, ctx) {
    this.scene = scene; this.ctx = ctx;
    const { width: W, height: H } = scene.scale;

    // Top bar background
    this.add = scene.add.rectangle(0, 0, W, 44, 0x000000, 0.55).setOrigin(0).setDepth(40);

    this.bugText = scene.add.text(16, 12, '', this._style(20)).setDepth(41);
    this.levelText = scene.add.text(W / 2, 12, '', this._style(20)).setOrigin(0.5, 0).setDepth(41);
    this.scoreText = scene.add.text(W - 16, 12, '', this._style(20)).setOrigin(1, 0).setDepth(41);
    this.comboText = scene.add.text(W - 16, 38, '', this._style(16, '#ffd23f')).setOrigin(1, 0).setDepth(41);
    this.timerText = scene.add.text(W / 2, 38, '', this._style(14, '#bbbbbb')).setOrigin(0.5, 0).setDepth(41);

    // Skill slots (bottom-left)
    this.slotGfx = [];
    for (let i = 0; i < AISkillManager.MAX_SLOTS; i++) {
      const x = 24 + i * 64, y = H - 60;
      const ring = scene.add.circle(x, y, 26, 0x000000, 0.55).setStrokeStyle(2, 0xffffff).setDepth(40);
      const icon = scene.add.text(x, y, '', { fontFamily: 'Arial Black', fontSize: 16, color: '#fff' }).setOrigin(0.5).setDepth(41);
      const key = scene.add.text(x, y + 28, ['Q','E','R'][i], this._style(12, '#bbbbbb')).setOrigin(0.5).setDepth(41);
      const cd = scene.add.text(x, y, '', this._style(14, '#ff6666')).setOrigin(0.5).setDepth(42);
      this.slotGfx.push({ ring, icon, key, cd });
    }

    // Stamina bar (bottom-right)
    this.staminaBg = scene.add.rectangle(W - 200, H - 30, 180, 14, 0x000000, 0.55).setOrigin(0, 0.5).setDepth(40).setStrokeStyle(1, 0xffffff);
    this.staminaFg = scene.add.rectangle(W - 199, H - 30, 178, 12, 0x6cc04a).setOrigin(0, 0.5).setDepth(41);
    this.staminaLbl = scene.add.text(W - 200, H - 50, 'STAMINA', this._style(12, '#bbbbbb')).setDepth(40);

    // Proximity warning (edge tint)
    this.warn = scene.add.rectangle(W / 2, H / 2, W, H, 0xff0000, 0).setDepth(45).setBlendMode(Phaser.BlendModes.ADD);

    // Active-skill tip ticker (top-middle, below level text)
    this.tipText = scene.add.text(W / 2, H - 90, '', this._style(16, '#ffd23f')).setOrigin(0.5).setDepth(42);
  }

  _style(size, color = '#ffffff') {
    return { fontFamily: 'Arial Black, sans-serif', fontSize: size, color, stroke: '#000', strokeThickness: 3 };
  }

  setTip(text) { this.tipText.setText(text || ''); }

  update() {
    const { ctx } = this;
    this.bugText.setText(`BUGS  ${ctx.bugsRemaining()}/${ctx.bugsTotal}`);
    this.levelText.setText(`LEVEL ${ctx.levelNum}: ${ctx.levelName}`);
    this.scoreText.setText(`SCORE  ${ctx.score.score}`);
    const m = ctx.combo.multiplier();
    this.comboText.setText(ctx.combo.count > 1 ? `COMBO x${ctx.combo.count}  (${m.toFixed(1)}x)` : '');
    if (ctx.timeLeftMs > 0) {
      const s = Math.max(0, Math.ceil(ctx.timeLeftMs / 1000));
      this.timerText.setText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    } else this.timerText.setText('');

    // Slots
    const skills = ctx.skills;
    const now = this.scene.time.now;
    for (let i = 0; i < AISkillManager.MAX_SLOTS; i++) {
      const slot = skills.slots[i]; const g = this.slotGfx[i];
      if (!slot) {
        g.ring.setStrokeStyle(2, 0x555555); g.icon.setText(''); g.cd.setText('');
        continue;
      }
      const def = SKILLS[slot.id];
      g.ring.setStrokeStyle(3, def.color);
      g.icon.setText(this._abbrev(def.name));
      if (skills.active === i) {
        g.cd.setText('ON'); g.cd.setColor('#7ed957');
      } else if (now < slot.readyAt) {
        const left = Math.ceil((slot.readyAt - now) / 1000);
        g.cd.setText(String(left)); g.cd.setColor('#ff6666');
      } else { g.cd.setText(''); }
    }

    // Stamina
    const sPct = ctx.player.stamina / Player.STAMINA_MAX;
    this.staminaFg.width = 178 * sPct;
    this.staminaFg.setFillStyle(sPct > 0.3 ? 0x6cc04a : 0xc0392b);

    // Proximity
    let nearest = Infinity;
    for (const c of ctx.getChasers()) {
      const d = c.distTo(ctx.player.x, ctx.player.y);
      if (d < nearest) nearest = d;
    }
    const danger = Math.max(0, 1 - nearest / 220);
    this.warn.setFillStyle(0xff0000, danger * 0.25);
  }

  _abbrev(name) {
    // Short labels for the office-named skills (src/data/skills.js, EP-22 rename)
    const map = { 'Intern Bot': 'INT', 'Espresso Bot': 'ESP', 'Senior Review': 'SR',
                  'Hot Desk': 'DESK', 'All-Hands Ping': 'PING' };
    return map[name] ?? name.slice(0, 3).toUpperCase();
  }
}

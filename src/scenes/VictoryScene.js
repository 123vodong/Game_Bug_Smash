import { SaveManager } from '../core/SaveManager.js';

export default class VictoryScene extends Phaser.Scene {
  constructor() { super('VictoryScene'); }
  init(data) { this.data_ = data ?? {}; }

  create() {
    const { width: W, height: H } = this.scale;
    this.add.rectangle(0, 0, W, H, 0x05210d).setOrigin(0);

    this.add.text(W / 2, H / 2 - 160, 'BUGS FIXED.', {
      fontFamily: 'Arial Black', fontSize: 64, color: '#7ed957', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5);
    this.add.text(W / 2, H / 2 - 90, 'DEPLOY SUCCESSFUL. WEEKEND SAVED.', {
      fontFamily: 'Arial Black', fontSize: 28, color: '#ccffcc',
    }).setOrigin(0.5);

    this.add.text(W / 2, H / 2, `FINAL SCORE: ${this.data_.score ?? 0}`, {
      fontFamily: 'Arial Black', fontSize: 32, color: '#ffffff',
    }).setOrigin(0.5);
    this.add.text(W / 2, H / 2 + 40, `GRADE: ${this.data_.grade ?? 'C'}`, {
      fontFamily: 'Arial Black', fontSize: 40, color: '#ffd23f',
    }).setOrigin(0.5);
    this.add.text(W / 2, H / 2 + 90, `High Score: ${SaveManager.getHighScore()}`, {
      fontFamily: 'Arial', fontSize: 20, color: '#bbbbbb',
    }).setOrigin(0.5);

    const bg = this.add.rectangle(W / 2, H / 2 + 170, 260, 56, 0xf5a623).setStrokeStyle(4, 0x000).setInteractive({ useHandCursor: true });
    this.add.text(W / 2, H / 2 + 170, 'MAIN MENU', {
      fontFamily: 'Arial Black', fontSize: 24, color: '#fff', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);
    bg.on('pointerup', () => this.scene.start('MenuScene'));
    this.input.keyboard.on('keydown-ENTER', () => this.scene.start('MenuScene'));
  }
}

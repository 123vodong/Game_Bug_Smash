export default class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOverScene'); }
  init(data) { this.data_ = data ?? {}; }

  create() {
    const { width: W, height: H } = this.scale;
    this.add.rectangle(0, 0, W, H, 0x1a0000).setOrigin(0);

    this.add.text(W / 2, H / 2 - 140, 'BUGS NOT FIXED.', {
      fontFamily: 'Arial Black', fontSize: 56, color: '#ff5252', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5);
    this.add.text(W / 2, H / 2 - 80, 'CLIENT ANGRY. MEETING AT 8AM.', {
      fontFamily: 'Arial Black', fontSize: 28, color: '#ffcccc',
    }).setOrigin(0.5);

    this.add.text(W / 2, H / 2, `Level ${this.data_.level ?? 1}  |  Score ${this.data_.score ?? 0}  |  Bugs Smashed ${this.data_.bugsKilled ?? 0}`, {
      fontFamily: 'Arial', fontSize: 22, color: '#ffffff',
    }).setOrigin(0.5);

    this._btn(W / 2 - 130, H / 2 + 100, 'RETRY',     () => this.scene.start('LevelScene', { level: this.data_.level ?? 1 }));
    this._btn(W / 2 + 130, H / 2 + 100, 'MAIN MENU', () => this.scene.start('MenuScene'));

    this.input.keyboard.on('keydown-ENTER', () => this.scene.start('LevelScene', { level: this.data_.level ?? 1 }));
    this.input.keyboard.on('keydown-ESC',   () => this.scene.start('MenuScene'));
  }

  _btn(x, y, label, onClick) {
    const bg = this.add.rectangle(x, y, 220, 56, 0x2d6cdf).setStrokeStyle(4, 0x000).setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, { fontFamily: 'Arial Black', fontSize: 22, color: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(0x4a8af0));
    bg.on('pointerout',  () => bg.setFillStyle(0x2d6cdf));
    bg.on('pointerup', onClick);
  }
}

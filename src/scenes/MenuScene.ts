import Phaser from 'phaser';
import { heroes } from '../data/heroes';
import { bosses } from '../data/bosses';
import { ART, textureKey } from '../data/art';
import { Sfx } from '../systems/Sfx';

const FONT = 'Consolas, "Courier New", monospace';

export class MenuScene extends Phaser.Scene {
  private hero = 0;
  private boss = 0;
  private cards: Phaser.GameObjects.Rectangle[] = [];
  private heroInfo!: Phaser.GameObjects.Text;
  private bossInfo!: Phaser.GameObjects.Text;
  private muteTxt!: Phaser.GameObjects.Text;

  constructor() {
    super('Menu');
  }

  init(data?: { heroId?: string }): void {
    this.hero = Math.max(0, heroes.findIndex((h) => h.id === data?.heroId));
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x0b0f1a);
    Sfx.attach(this);
    const grid = this.add.graphics().setAlpha(0.35);
    grid.lineStyle(1, 0x1e293b, 1);
    for (let x = 0; x <= 960; x += 40) grid.lineBetween(x, -40, x, 540);
    for (let y = -40; y <= 540; y += 40) grid.lineBetween(0, y, 960, y);
    this.tweens.add({ targets: grid, y: 40, duration: 4000, repeat: -1 });
    const title = this.add
      .text(480, 44, 'TRAN TECH BRAWL', { fontFamily: FONT, fontSize: '48px', fontStyle: 'bold', color: '#60a5fa' })
      .setOrigin(0.5)
      .setStroke('#1e3a8a', 8);
    this.tweens.add({ targets: title, scale: 1.04, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.InOut' });
    this.add.text(480, 86, 'choose your fighter, pick your boss', { fontFamily: FONT, fontSize: '16px', color: '#94a3b8' }).setOrigin(0.5);

    this.add
      .text(930, 22, '[ C ] CHARACTER MANAGER', { fontFamily: FONT, fontSize: '14px', color: '#facc15' })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.openManager());

    // hero cards
    this.cards = [];
    heroes.forEach((h, i) => {
      const x = 480 + (i - (heroes.length - 1) / 2) * 190;
      const card = this.add.rectangle(x, 200, 170, 190, 0x131a2b).setStrokeStyle(3, 0x334155).setInteractive({ useHandCursor: true });
      card.on('pointerdown', () => this.pickHero(i));
      this.cards.push(card);
      if (this.textures.exists(`portrait_${h.id}`)) {
        const p = this.add.image(x, 190, `portrait_${h.id}`);
        p.setScale(144 / p.height);
      } else {
        const preview = this.add.sprite(x, ART[h.id] ? 190 : 195, textureKey(h.id)).setScale((ART[h.id] ? 2 : 2.4) * h.scale);
        if (ART[h.id] && this.anims.exists(`${h.id}:idle`)) preview.play(`${h.id}:idle`);
      }
      this.add.text(x, 274, h.name, { fontFamily: FONT, fontSize: '14px', color: '#e2e8f0' }).setOrigin(0.5);
    });
    this.heroInfo = this.add.text(480, 328, '', { fontFamily: FONT, fontSize: '15px', color: '#cbd5e1', align: 'center' }).setOrigin(0.5);

    // boss picker
    this.add.text(480, 382, '▲ boss ▼', { fontFamily: FONT, fontSize: '14px', color: '#64748b' }).setOrigin(0.5);
    this.bossInfo = this.add
      .text(480, 420, '', { fontFamily: FONT, fontSize: '22px', color: '#f87171', align: 'center' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.bossInfo.on('pointerdown', () => this.pickBoss(this.boss + 1));

    const go = this.add
      .text(480, 478, '[ ENTER ] FIGHT', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#facc15' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    go.on('pointerdown', () => this.start());
    this.tweens.add({ targets: go, alpha: 0.4, yoyo: true, repeat: -1, duration: 700 });
    this.add
      .text(480, 504, 'MOVE WASD / arrows  ·  JUMP W / up / space  ·  DROP S / down  ·  ATTACK J / Z  ·  SPECIAL K / X', { fontFamily: FONT, fontSize: '12px', color: '#94a3b8' })
      .setOrigin(0.5);
    this.add
      .text(480, 522, 'P pause  ·  M mute / unmute  ·  Esc leave fight', { fontFamily: FONT, fontSize: '12px', color: '#64748b' })
      .setOrigin(0.5);
    this.muteTxt = this.add.text(20, 22, '', { fontFamily: FONT, fontSize: '14px', color: '#f87171' });
    const onMute = () => this.muteTxt.setText(Sfx.muted ? 'MUTED (M to unmute)' : '');
    window.addEventListener('ttb:mute', onMute);
    this.events.once('shutdown', () => window.removeEventListener('ttb:mute', onMute));
    onMute();

    const kb = this.input.keyboard!;
    kb.on('keydown-LEFT', () => this.pickHero(this.hero - 1));
    kb.on('keydown-A', () => this.pickHero(this.hero - 1));
    kb.on('keydown-RIGHT', () => this.pickHero(this.hero + 1));
    kb.on('keydown-D', () => this.pickHero(this.hero + 1));
    kb.on('keydown-UP', () => this.pickBoss(this.boss - 1));
    kb.on('keydown-DOWN', () => this.pickBoss(this.boss + 1));
    kb.on('keydown-C', () => this.openManager());
    kb.on('keydown-ENTER', () => this.start());
    kb.on('keydown-SPACE', () => this.start());

    this.refresh();
  }

  private pickHero(i: number): void {
    this.hero = Phaser.Math.Wrap(i, 0, heroes.length);
    Sfx.play('move');
    this.refresh();
  }

  private pickBoss(i: number): void {
    this.boss = Phaser.Math.Wrap(i, 0, bosses.length);
    Sfx.play('move');
    this.refresh();
  }

  private refresh(): void {
    this.cards.forEach((c, i) => c.setStrokeStyle(3, i === this.hero ? 0x60a5fa : 0x334155).setFillStyle(i === this.hero ? 0x1e2a44 : 0x131a2b));
    const h = heroes[this.hero];
    this.heroInfo.setText(`${h.role}\nattack: ${h.melee.name}   special: ${h.special.name}`);
    const b = bosses[this.boss];
    this.bossInfo.setText(`${b.name}\n${b.title}`);
  }

  private openManager(): void {
    Sfx.play('select');
    this.scene.start('Manager', { heroId: heroes[this.hero].id });
  }

  private start(): void {
    Sfx.play('select');
    this.scene.start('Fight', { heroId: heroes[this.hero].id, bossIndex: this.boss });
  }
}

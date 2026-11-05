import Phaser from 'phaser';
import { Sfx } from '../systems/Sfx';

const FONT = 'Consolas, "Courier New", monospace';

/** Optional extra fields. If FightScene passes `timeMs` / `kos` they win; otherwise the
 *  HUD scene's registry entry 'fightStats' ({ timeMs, kos }) is used. */
interface ResultData {
  won: boolean;
  heroId: string;
  bossIndex: number;
  timeMs?: number;
  kos?: number;
}

export class ResultScene extends Phaser.Scene {
  private data0!: ResultData;

  constructor() {
    super('Result');
  }

  init(data: ResultData): void {
    this.data0 = data;
  }

  create(): void {
    const { won, heroId, bossIndex } = this.data0;
    const reg = this.registry.get('fightStats') as { timeMs: number; kos: number } | undefined;
    const timeMs = this.data0.timeMs ?? reg?.timeMs;
    const kos = this.data0.kos ?? reg?.kos;

    this.cameras.main.setBackgroundColor(0x0b0f1a);
    Sfx.attach(this);
    Sfx.play(won ? 'win' : 'lose');

    const col = won ? '#4ade80' : '#f87171';
    const title = this.add
      .text(480, 150, won ? 'VICTORY' : 'DEFEATED', { fontFamily: FONT, fontSize: '80px', fontStyle: 'bold', color: col })
      .setOrigin(0.5)
      .setStroke('#000000', 10)
      .setScale(0.3)
      .setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 350, ease: 'Back.Out' });
    this.add
      .text(480, 220, won ? 'Ticket closed. Boss rebooted.' : 'Escalate and try again.', { fontFamily: FONT, fontSize: '20px', color: '#94a3b8' })
      .setOrigin(0.5);

    if (timeMs !== undefined || kos !== undefined) {
      const s = Math.floor((timeMs ?? 0) / 1000);
      const time = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      const stat = (x: number, label: string, value: string) => {
        this.add.rectangle(x, 310, 200, 80, 0x131a2b).setStrokeStyle(2, 0x334155);
        this.add.text(x, 292, label, { fontFamily: FONT, fontSize: '14px', color: '#64748b' }).setOrigin(0.5);
        this.add.text(x, 322, value, { fontFamily: FONT, fontSize: '36px', fontStyle: 'bold', color: '#e2e8f0' }).setOrigin(0.5);
      };
      if (timeMs !== undefined) stat(kos !== undefined ? 380 : 480, 'TIME', time);
      if (kos !== undefined) stat(timeMs !== undefined ? 580 : 480, 'KOs', String(kos));
    }

    const prompt = this.add
      .text(480, 420, 'ENTER = rematch   ·   Esc = menu   ·   M = mute', { fontFamily: FONT, fontSize: '20px', color: '#facc15' })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.5, yoyo: true, repeat: -1, duration: 700 });

    // M is the global mute key (Sfx), so menu moved to Esc / Backspace.
    const kb = this.input.keyboard!;
    kb.once('keydown-ENTER', () => {
      Sfx.play('select');
      this.scene.start('Fight', { heroId, bossIndex });
    });
    const toMenu = () => {
      Sfx.play('select');
      this.scene.start('Menu', { heroId });
    };
    kb.once('keydown-ESC', toMenu);
    kb.once('keydown-BACKSPACE', toMenu);
  }
}

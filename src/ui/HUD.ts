import Phaser from 'phaser';
import type { Fighter } from '../entities/Fighter';

const FONT = 'Consolas, "Courier New", monospace';
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Red-shifts as damage climbs. */
function pctColor(dmg: number): string {
  const g = Math.round(255 * (1 - Math.min(1, dmg / 150)));
  return `rgb(255,${g},${g})`;
}

/** Row of stock pips: filled for remaining, hollow for lost. */
class Pips {
  private g: Phaser.GameObjects.Graphics;
  constructor(scene: Phaser.Scene, private x: number, private y: number, private color: number, private right: boolean) {
    this.g = scene.add.graphics().setDepth(21);
  }
  draw(now: number, max: number): void {
    const g = this.g.clear();
    const r = 6;
    const step = 17;
    for (let i = 0; i < max; i++) {
      const cx = this.right ? this.x - r - i * step : this.x + r + i * step;
      if (i < now) {
        g.fillStyle(this.color, 1).fillCircle(cx, this.y, r).lineStyle(2, 0x000000, 1).strokeCircle(cx, this.y, r);
      } else {
        g.lineStyle(2, 0x475569, 1).strokeCircle(cx, this.y, r - 1);
      }
    }
  }
}

/** Player card, bottom-left: portrait, name, big damage %, stocks. */
class PlayerCard {
  private pct: Phaser.GameObjects.Text;
  private pips: Pips;
  private lastDmg = 0;
  private bump = 0;

  constructor(scene: Phaser.Scene, private f: Fighter, x: number, y: number) {
    const color = f.def.color;
    scene.add.rectangle(x, y, 250, 86, 0x0b0f1a, 0.78).setOrigin(0, 0).setStrokeStyle(2, color).setDepth(19);
    const key = `portrait_${f.def.id}`;
    if (scene.textures.exists(key)) {
      const img = scene.add.image(x + 43, y + 43, key).setDepth(20);
      img.setScale(Math.min(66 / img.width, 66 / img.height));
      scene.add.rectangle(x + 43, y + 43, 70, 70).setStrokeStyle(2, color).setDepth(21);
    } else {
      scene.add.rectangle(x + 43, y + 43, 66, 66, color).setDepth(20);
      scene.add.text(x + 43, y + 43, f.def.name.charAt(0), { fontFamily: FONT, fontSize: '36px', fontStyle: 'bold', color: '#0b0f1a' }).setOrigin(0.5).setDepth(21);
    }
    scene.add.text(x + 86, y + 6, f.def.name, { fontFamily: FONT, fontSize: '15px', color: '#cbd5e1' }).setDepth(20);
    this.pct = scene.add
      .text(x + 86, y + 20, '0%', { fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#ffffff' })
      .setDepth(20)
      .setStroke('#000000', 5);
    this.pips = new Pips(scene, x + 88, y + 74, color, false);
  }

  update(): void {
    const dmg = Math.round(this.f.damage);
    if (dmg > this.lastDmg) this.bump = 1;
    this.lastDmg = dmg;
    this.bump = Math.max(0, this.bump - 0.08);
    this.pct.setText(`${dmg}%`).setColor(pctColor(dmg)).setScale(1 + this.bump * 0.25);
    this.pips.draw(Math.max(0, this.f.stocks), this.f.def.stocks);
  }
}

/** Boss bar, top-centre: name, damage-driven bar, stocks. */
class BossBar {
  private fill: Phaser.GameObjects.Rectangle;
  private pct: Phaser.GameObjects.Text;
  private pips: Pips;
  private readonly w = 420;

  constructor(scene: Phaser.Scene, private f: Fighter) {
    const x = 480 - this.w / 2;
    const y = 12;
    scene.add.rectangle(480, y + 28, this.w + 20, 64, 0x0b0f1a, 0.8).setStrokeStyle(2, f.def.color).setDepth(19);
    scene.add
      .text(480, y + 4, f.def.name.toUpperCase(), { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: hex(f.def.color) })
      .setOrigin(0.5, 0)
      .setDepth(21)
      .setStroke('#000000', 4);
    scene.add.rectangle(x, y + 30, this.w, 14, 0x1e293b).setOrigin(0, 0).setDepth(20);
    this.fill = scene.add.rectangle(x, y + 30, 0, 14, f.def.color).setOrigin(0, 0).setDepth(21);
    scene.add.rectangle(x, y + 30, this.w, 14).setOrigin(0, 0).setStrokeStyle(2, 0x000000).setDepth(22);
    this.pct = scene.add
      .text(x + this.w, y + 4, '', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(1, 0)
      .setDepth(21)
      .setStroke('#000000', 3);
    this.pips = new Pips(scene, x, y + 56, f.def.color, false);
  }

  update(): void {
    const dmg = Math.round(this.f.damage);
    // Bar fills toward 150% (the point where launches get dangerous).
    this.fill.width = this.w * Math.min(1, dmg / 150);
    this.pct.setText(`${dmg}%`).setColor(pctColor(dmg));
    this.pips.draw(Math.max(0, this.f.stocks), this.f.def.stocks);
  }
}

export class HUD {
  private card: PlayerCard;
  private bossBar: BossBar;
  private info: Phaser.GameObjects.Text;
  private lastStocks: { p: number; b: number };

  constructor(private scene: Phaser.Scene, private player: Fighter, private boss: Fighter) {
    this.card = new PlayerCard(scene, player, 16, 440);
    this.bossBar = new BossBar(scene, boss);
    this.lastStocks = { p: player.stocks, b: boss.stocks };
    this.info = scene.add
      .text(480, 82, '', { fontFamily: FONT, fontSize: '13px', color: '#94a3b8' })
      .setOrigin(0.5, 0)
      .setDepth(20)
      .setStroke('#000000', 3);
  }

  update(minions: number, wave: number, allies: number): void {
    this.card.update();
    this.bossBar.update();
    this.info.setText(`allies ${allies}  ·  wave ${wave}  ·  minions ${minions}  ·  P pause  ·  M mute`);
    // KO banner when a stock is lost
    if (this.player.stocks < this.lastStocks.p) this.banner('YOU GOT KO\'D', '#f87171');
    if (this.boss.stocks < this.lastStocks.b) this.banner(`${this.boss.def.name.toUpperCase()} KO!`, '#facc15');
    this.lastStocks = { p: this.player.stocks, b: this.boss.stocks };
  }

  banner(text: string, color: string): void {
    const t = this.scene.add
      .text(480, 190, text, { fontFamily: FONT, fontSize: '54px', fontStyle: 'bold', color })
      .setOrigin(0.5)
      .setDepth(40)
      .setStroke('#000000', 8)
      .setScale(0.4)
      .setAlpha(0);
    this.scene.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 160, ease: 'Back.Out' });
    this.scene.tweens.add({ targets: t, alpha: 0, y: 160, delay: 900, duration: 350, onComplete: () => t.destroy() });
  }
}

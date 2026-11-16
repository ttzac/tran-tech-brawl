import Phaser from 'phaser';
import type { Fighter } from '../entities/Fighter';
import { LEDGE_MAX_GRABS } from '../entities/Fighter';
import { POWERS } from '../data/powerups';

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
  private icons: Phaser.GameObjects.Image[] = [];
  constructor(private scene: Phaser.Scene, private x: number, private y: number, private color: number, private right: boolean) {
    this.g = scene.add.graphics().setDepth(21);
  }
  draw(now: number, max: number): void {
    if (this.scene.textures.exists('ui_hud_stock_icon')) {
      // Codex stock icon (heart with a wrench): bright while the stock is left, dark when lost
      while (this.icons.length < max) this.icons.push(this.scene.add.image(0, 0, 'ui_hud_stock_icon').setDepth(21).setDisplaySize(20, 20));
      for (let i = 0; i < this.icons.length; i++) {
        const cx = this.right ? this.x - 10 - i * 22 : this.x + 10 + i * 22;
        this.icons[i].setPosition(cx, this.y).setVisible(i < max);
        if (i < now) this.icons[i].clearTint().setAlpha(1);
        else this.icons[i].setTint(0x1e293b).setAlpha(0.55);
      }
      return;
    }
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
  private face: Phaser.GameObjects.Image | null = null;
  private mood = '';
  private faceSize = 66;
  private ultBar: Phaser.GameObjects.Rectangle | null = null;
  private ultTxt: Phaser.GameObjects.Text | null = null;

  constructor(private scene: Phaser.Scene, private f: Fighter, x: number, y: number) {
    const color = f.def.color;
    if (scene.textures.exists('ui_hud_frame')) {
      scene.add.image(x, y, 'ui_hud_frame').setOrigin(0, 0).setDisplaySize(250, 86).setDepth(19); // opaque Codex frame: portrait slot left, stock pills bottom right
    } else scene.add.rectangle(x, y, 250, 86, 0x0b0f1a, 0.78).setOrigin(0, 0).setStrokeStyle(2, color).setDepth(19);
    const key = `portrait_${f.def.id}`;
    if (scene.textures.exists(key)) {
      const framed = scene.textures.exists('ui_hud_frame');
      this.faceSize = framed ? 44 : 66;
      this.face = scene.add.image(framed ? x + 30 : x + 43, framed ? y + 40 : y + 43, key).setDepth(20);
      this.face.setScale(Math.min(this.faceSize / this.face.width, this.faceSize / this.face.height));
      if (!framed) scene.add.rectangle(x + 43, y + 43, 70, 70).setStrokeStyle(2, color).setDepth(21);
    } else {
      scene.add.rectangle(x + 43, y + 43, 66, 66, color).setDepth(20);
      scene.add.text(x + 43, y + 43, f.def.name.charAt(0), { fontFamily: FONT, fontSize: '36px', fontStyle: 'bold', color: '#0b0f1a' }).setOrigin(0.5).setDepth(21);
    }
    const fr = scene.textures.exists('ui_hud_frame');
    scene.add.text(fr ? x + 64 : x + 86, fr ? y + 12 : y + 6, f.def.name, { fontFamily: FONT, fontSize: fr ? '13px' : '15px', color: '#cbd5e1' }).setDepth(20);
    this.pct = scene.add
      .text(fr ? x + 64 : x + 86, fr ? y + 24 : y + 20, '0%', { fontFamily: FONT, fontSize: fr ? '30px' : '40px', fontStyle: 'bold', color: '#ffffff' })
      .setDepth(20)
      .setStroke('#000000', 5);
    // ultimate meter under the card
    scene.add.rectangle(x + 2, y + 90, 246, 6, 0x0b0f1a, 0.85).setOrigin(0, 0.5).setDepth(19).setStrokeStyle(1, 0x475569);
    this.ultBar = scene.add.rectangle(x + 3, y + 90, 0, 4, 0xffc857).setOrigin(0, 0.5).setDepth(20);
    this.ultTxt = scene.add.text(x + 246, y + 11, 'ULT', { fontFamily: FONT, fontSize: '10px', fontStyle: 'bold', color: '#94a3b8' }).setOrigin(1, 0).setDepth(20);
    this.pips = fr ? new Pips(scene, x + 98, y + 67, color, false) : new Pips(scene, x + 88, y + 74, color, false);
  }

  update(): void {
    const dmg = Math.round(this.f.damage);
    if (dmg > this.lastDmg) this.bump = 1;
    this.lastDmg = dmg;
    this.bump = Math.max(0, this.bump - 0.08);
    this.pct.setText(`${dmg}%`).setColor(pctColor(dmg)).setScale(1 + this.bump * 0.25);
    this.pips.draw(Math.max(0, this.f.stocks), this.f.def.stocks);
    const ult = Math.min(1, this.f.ult / 100);
    const ready = ult >= 1;
    this.ultBar?.setSize(244 * ult, 4).setFillStyle(ready && Math.floor(this.scene.time.now / 180) % 2 ? 0xffffff : 0xffc857);
    this.ultTxt?.setText(ready ? 'ULTIMATE READY: L / C' : `ULT ${Math.floor(ult * 100)}%`).setColor(ready ? '#ffc857' : '#94a3b8');
    // the portrait gets angrier, then battered, as damage climbs
    const mood = dmg >= 125 ? '_hurt' : dmg >= 70 ? '_angry' : '';
    if (this.face && mood !== this.mood) {
      const key = `portrait_${this.f.def.id}${mood}`;
      if (this.scene.textures.exists(key)) {
        this.mood = mood;
        this.face.setTexture(key).setScale(Math.min(this.faceSize / this.face.width, this.faceSize / this.face.height));
      }
    }
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
    if (scene.textures.exists('ui_hud_boss_bar')) {
      scene.add.image(480, y + 40, 'ui_hud_boss_bar').setDisplaySize(this.w + 70, (this.w + 70) / 10).setDepth(19);
    } else scene.add.rectangle(480, y + 28, this.w + 20, 64, 0x0b0f1a, 0.8).setStrokeStyle(2, f.def.color).setDepth(19);
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
  private combo: Phaser.GameObjects.Text;
  private comboSub: Phaser.GameObjects.Text;
  private lastCombo = 0;
  private bump = 0;
  private score: Phaser.GameObjects.Text;
  private powerBg: Phaser.GameObjects.Rectangle;
  private powerFill: Phaser.GameObjects.Rectangle;
  private powerTxt: Phaser.GameObjects.Text;
  private grabs: Phaser.GameObjects.Graphics;
  private grabTxt: Phaser.GameObjects.Text;

  constructor(private scene: Phaser.Scene, private player: Fighter, private boss: Fighter) {
    this.card = new PlayerCard(scene, player, 16, 440);
    this.bossBar = new BossBar(scene, boss);
    this.lastStocks = { p: player.stocks, b: boss.stocks };
    this.info = scene.add
      .text(480, 82, '', { fontFamily: FONT, fontSize: '13px', color: '#94a3b8' })
      .setOrigin(0.5, 0)
      .setDepth(20)
      .setStroke('#000000', 3);
    // combo counter (right side), score (top right), power-up timer (above the player card), ledge-grab pips (beside it)
    this.combo = scene.add.text(944, 150, '', { fontFamily: FONT, fontSize: '46px', fontStyle: 'bold', color: '#facc15' }).setOrigin(1, 0.5).setDepth(30).setStroke('#0b1026', 8);
    this.comboSub = scene.add.text(944, 186, '', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#e2e8f0' }).setOrigin(1, 0).setDepth(30).setStroke('#0b1026', 4);
    this.score = scene.add.text(944, 12, '', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#e2e8f0' }).setOrigin(1, 0).setDepth(30).setStroke('#0b1026', 4);
    this.powerBg = scene.add.rectangle(16, 420, 250, 14, 0x0b0f1a, 0.8).setOrigin(0, 0).setStrokeStyle(2, 0x334155).setDepth(30).setVisible(false);
    this.powerFill = scene.add.rectangle(16, 420, 250, 14, 0xffffff).setOrigin(0, 0).setDepth(31).setVisible(false);
    this.powerTxt = scene.add.text(20, 407, '', { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0, 1).setDepth(32).setStroke('#0b1026', 4).setVisible(false);
    this.grabs = scene.add.graphics().setDepth(30);
    this.grabTxt = scene.add.text(272, 454, 'LEDGE', { fontFamily: FONT, fontSize: '11px', color: '#94a3b8' }).setDepth(30);
  }

  update(minions: number, wave: number, allies: number, info?: string): void {
    this.card.update();
    this.bossBar.update();
    this.info.setText(info ?? `allies ${allies}  ·  wave ${wave}  ·  minions ${minions}  ·  P pause  ·  M mute`);
    this.updateExtras();
    // KO banner when a stock is lost
    if (this.player.stocks < this.lastStocks.p) this.banner('YOU GOT KO\'D', '#f87171');
    if (this.boss.stocks < this.lastStocks.b) this.banner(`${this.boss.def.name.toUpperCase()} KO!`, '#facc15', true);
    this.lastStocks = { p: this.player.stocks, b: this.boss.stocks };
  }

  private updateExtras(): void {
    const p = this.player;
    // combo: grows and warms up as the chain climbs
    if (p.combo >= 2 && p.comboMs > 0) {
      if (p.combo > this.lastCombo) this.bump = 1;
      const hot = Math.min(1, (p.combo - 2) / 10);
      this.combo.setText(`${p.combo} HITS`).setColor(hot > 0.7 ? '#ff5a5f' : hot > 0.35 ? '#ffa31a' : '#facc15').setVisible(true).setScale(1 + this.bump * 0.35 + hot * 0.3);
      this.comboSub.setText(p.combo >= 10 ? 'ABSOLUTELY SERVICED' : p.combo >= 6 ? 'TICKET STORM' : 'COMBO').setAlpha(Math.min(1, p.comboMs / 500)).setVisible(true);
    } else {
      this.combo.setVisible(false);
      this.comboSub.setVisible(false);
    }
    this.lastCombo = p.combo;
    this.bump = Math.max(0, this.bump - 0.07);
    this.score.setText(`SCORE ${p.score}   KOs ${p.kos}`);
    // held power-up: coloured bar draining to zero
    if (p.power && p.alive) {
      const def = POWERS[p.power];
      const frac = Math.max(0, Math.min(1, p.powerMs / def.ms));
      const low = frac < 0.25 && Math.floor(p.powerMs / 120) % 2 === 0;
      this.powerBg.setVisible(true);
      this.powerFill.setVisible(true).setFillStyle(def.color, low ? 0.35 : 1).setSize(250 * frac, 14);
      this.powerTxt.setVisible(true).setText(`${def.icon} ${def.name.toUpperCase()}`).setColor(`#${def.color.toString(16).padStart(6, '0')}`);
    } else {
      this.powerBg.setVisible(false);
      this.powerFill.setVisible(false);
      this.powerTxt.setVisible(false);
    }
    // ledge grabs left (Smash rule: two per airtime, touching down refills)
    const g = this.grabs.clear();
    for (let i = 0; i < LEDGE_MAX_GRABS; i++) {
      const used = i < p.ledgeGrabs;
      g.fillStyle(used ? 0x334155 : 0xffc857, 1).fillCircle(318 + i * 14, 459, 5).lineStyle(1.5, 0x0b1026, 1).strokeCircle(318 + i * 14, 459, 5);
    }
    this.grabTxt.setAlpha(p.hanging ? 1 : 0.7);
  }

  /** Big centre-screen call-out. `ko` adds the Codex "K.O.!" art above the text (boss stock lost). */
  banner(text: string, color: string, ko = false): void {
    if (ko && this.scene.textures.exists('ui_hud_ko_banner')) {
      const img = this.scene.add.image(480, 120, 'ui_hud_ko_banner').setDepth(40).setScale(0.25).setAlpha(0);
      this.scene.tweens.add({ targets: img, scale: 0.62, alpha: 1, duration: 180, ease: 'Back.Out' });
      this.scene.tweens.add({ targets: img, alpha: 0, y: 95, delay: 900, duration: 350, onComplete: () => img.destroy() });
    }
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

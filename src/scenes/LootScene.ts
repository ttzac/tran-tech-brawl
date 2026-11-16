import Phaser from 'phaser';
import { fitUi } from '../ui/hires';
import { Sfx } from '../systems/Sfx';
import { RARITY_COLOR, RARITY_LABEL } from '../data/items';
import { MAX_RUN_STOCKS, ROOM_KINDS, type RunState } from '../data/dungeon';
import { currentNode, leaveRoom, rollOffers, takeOffer, type Offer } from '../sim/crawl';

const FONT = 'Consolas, "Courier New", monospace';
const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

export interface LootData {
  /** the run, still standing in the room that was just cleared (or a Break Room) */
  run: RunState;
  /** title of the room that was just cleared */
  cleared: string;
}

/** After a room: pick 1 of 3 rewards (1 / 2 / 3, arrows + Enter, or click), then back to the floor map.
 *  Harder rooms offer rarer relics; a Break Room also offers a stock back. Cards flip in one at a time. */
export class LootScene extends Phaser.Scene {
  private data0!: LootData;
  private offers: Offer[] = [];
  private cards: { bg: Phaser.GameObjects.Rectangle; glow: Phaser.GameObjects.Rectangle }[] = [];
  private sel = 1;
  private picked = false;

  constructor() {
    super('Loot');
  }

  init(data: LootData): void {
    this.data0 = data;
    this.picked = false;
    this.sel = 1;
  }

  create(): void {
    fitUi(this);
    Sfx.attach(this);
    this.cards = [];
    const { run, cleared } = this.data0;
    this.cameras.main.setBackgroundColor(0x0b0f1a);
    this.add.graphics().fillGradientStyle(0x0b0f1a, 0x0b0f1a, 0x16213d, 0x16213d, 1).fillRect(0, 0, 960, 540);

    const node = currentNode(run);
    const rest = node?.kind === 'rest';
    const t = this.add.text(480, 56, rest ? 'BREAK ROOM' : node?.kind === 'boss' ? 'BOSS DOWN' : 'ROOM CLEARED', { fontFamily: FONT, fontSize: '48px', fontStyle: 'bold', color: '#4ade80' }).setOrigin(0.5).setStroke('#052e16', 8).setScale(0.3).setAlpha(0);
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 320, ease: 'Back.Out' });
    this.add.text(480, 98, node?.kind === 'boss' ? `${cleared}  ·  +1 stock for beating the boss` : `${cleared}${node && ROOM_KINDS[node.kind].relicBoost > 1 ? '  ·  better relics' : ''}`, { fontFamily: FONT, fontSize: '14px', color: '#94a3b8' }).setOrigin(0.5);
    this.add
      .text(480, 126, `Stocks ${'● '.repeat(run.stocks)}${'○ '.repeat(Math.max(0, MAX_RUN_STOCKS - run.stocks))}  ·  relics ${run.relics.length}  ·  score ${run.score}`, { fontFamily: FONT, fontSize: '14px', color: '#e2e8f0' })
      .setOrigin(0.5);
    this.add.text(480, 160, rest ? 'TAKE A BREAK' : 'CHOOSE A RELIC', { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#facc15' }).setOrigin(0.5);

    this.offers = rollOffers(run);
    this.offers.forEach((r, i) => this.card(r, i));
    this.add.text(480, 506, '1 / 2 / 3  or  ← → + ENTER  to pick   ·   M mute   ·   Esc to quit the run', { fontFamily: FONT, fontSize: '12px', color: '#64748b' }).setOrigin(0.5);

    const kb = this.input.keyboard!;
    kb.on('keydown-ONE', () => this.pick(0));
    kb.on('keydown-TWO', () => this.pick(1));
    kb.on('keydown-THREE', () => this.pick(2));
    kb.on('keydown-LEFT', () => this.choose(this.sel - 1));
    kb.on('keydown-A', () => this.choose(this.sel - 1));
    kb.on('keydown-RIGHT', () => this.choose(this.sel + 1));
    kb.on('keydown-D', () => this.choose(this.sel + 1));
    kb.on('keydown-ENTER', () => this.pick(this.sel));
    kb.once('keydown-ESC', () => this.scene.start('Menu', { heroId: run.heroId }));
    this.choose(1, true);
  }

  private card(o: Offer, i: number): void {
    const r = o.relic ?? { icon: '🩹', name: 'Patch Up', rarity: 'common' as const, desc: `+${o.heal} stock. Coffee, a biscuit and a reboot.` };
    const x = 200 + i * 280;
    const y = 320;
    const color = RARITY_COLOR[r.rarity];
    const glow = this.add.rectangle(x, y, 252, 300, color, 0.12).setStrokeStyle(2, color).setAlpha(0);
    const bg = this.add.rectangle(x, y, 240, 288, 0x131a2b).setStrokeStyle(3, color).setAlpha(0).setInteractive({ useHandCursor: true });
    const icon = this.add.text(x, y - 84, r.icon, { fontSize: '64px' }).setOrigin(0.5).setAlpha(0);
    const rarity = this.add.text(x, y - 28, RARITY_LABEL[r.rarity], { fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: hex(color) }).setOrigin(0.5).setAlpha(0);
    const name = this.add.text(x, y - 4, r.name, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#f8fafc', align: 'center', wordWrap: { width: 216 } }).setOrigin(0.5, 0).setAlpha(0);
    const desc = this.add.text(x, y + 48, r.desc, { fontFamily: FONT, fontSize: '13px', color: '#cbd5e1', align: 'center', wordWrap: { width: 208 } }).setOrigin(0.5, 0).setAlpha(0);
    const key = this.add.text(x, y + 130, `[ ${i + 1} ]`, { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#facc15' }).setOrigin(0.5).setAlpha(0);
    const parts = [glow, bg, icon, rarity, name, desc, key];
    // cards flip in one after another: a little drum roll
    this.time.delayedCall(350 + i * 200, () => {
      Sfx.play('combo', 2 + i * 2);
      parts.forEach((p) => p.setScale(0.6));
      this.tweens.add({ targets: parts, alpha: 1, scale: 1, duration: 240, ease: 'Back.Out' });
    });
    bg.on('pointerover', () => this.choose(i));
    bg.on('pointerdown', () => this.pick(i));
    this.cards.push({ bg, glow });
  }

  private choose(i: number, quiet = false): void {
    if (this.picked) return;
    const n = Phaser.Math.Wrap(i, 0, this.cards.length);
    if (n !== this.sel && !quiet) Sfx.play('move');
    this.sel = n;
    this.cards.forEach((c, k) => {
      const color = RARITY_COLOR[this.offers[k].relic?.rarity ?? 'common'];
      c.bg.setFillStyle(k === n ? 0x1e2a44 : 0x131a2b).setStrokeStyle(k === n ? 5 : 3, color);
    });
  }

  private pick(i: number): void {
    if (this.picked || i < 0 || i >= this.offers.length) return;
    this.picked = true;
    const o = this.offers[i];
    const r = o.relic ?? { icon: '🩹', name: 'Patched up' };
    Sfx.play('pickup');
    this.cameras.main.flash(250, 255, 255, 255);
    const run: RunState = leaveRoom(takeOffer(this.data0.run, o));
    this.cards.forEach((c, k) => {
      if (k !== i) this.tweens.add({ targets: [c.bg, c.glow], alpha: 0.15, duration: 200 });
    });
    this.add.text(480, 250, `${r.icon} ${r.name.toUpperCase()}${o.relic ? ' EQUIPPED' : ''}`, { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#facc15' }).setOrigin(0.5).setStroke('#0b1026', 8).setDepth(50);
    this.time.delayedCall(900, () => {
      if (run.done) this.scene.start('Result', { won: true, heroId: run.heroId, bossIndex: 0, mode: 'dungeon', run });
      else this.scene.start('Map', { run });
    });
  }
}

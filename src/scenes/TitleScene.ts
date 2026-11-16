import Phaser from 'phaser';
import { fitUi } from '../ui/hires';
import { heroes } from '../data/heroes';
import { Sfx } from '../systems/Sfx';
import type { GameMode } from '../data/types';

type MenuMode = GameMode | 'solo';

interface Item {
  label: string;
  sub: string;
  color: number;
  /** Opens a submenu when set, otherwise runs `go`. */
  children?: Item[];
  go?: () => void;
}

let joinRouted = false;
const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const MENU_X = 70;
const MENU_Y = 190;
const ROW_H = 62;
const ROW_W = 380;

/** Main menu: Singleplayer / Multiplayer / Manager / Settings in front of the fighter-select screen. */
export class TitleScene extends Phaser.Scene {
  private stack: Item[][] = [];
  private index = 0;
  private rows: Phaser.GameObjects.GameObject[] = [];
  private heading!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private art?: Phaser.GameObjects.Image;
  private artIdx = 0;
  private root: Item[] = [];
  private heroId?: string;

  constructor() {
    super('Title');
  }

  init(data?: { heroId?: string }): void {
    this.heroId = data?.heroId;
    this.stack = [];
    this.index = 0;
    this.rows = [];
  }

  create(): void {
    fitUi(this);
    this.cameras.main.setBackgroundColor(0x070a14);
    Sfx.attach(this);

    this.buildBackdrop();
    this.buildMenuData();
    this.buildBrand();
    this.heading = this.add.text(MENU_X, MENU_Y - 34, '', { fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: '#64748b' }).setDepth(5);
    this.hint = this.add.text(MENU_X, 512, '', { fontFamily: FONT, fontSize: '11px', color: '#64748b' }).setDepth(5);
    this.add.text(950, 512, 'v0.1  ·  TRANTECH COMPUTERS', { fontFamily: FONT, fontSize: '10px', color: '#64748b' }).setOrigin(1, 0).setDepth(5);

    this.stack = [this.root];
    this.render(false);

    const kb = this.input.keyboard!;
    kb.on('keydown-UP', () => this.move(-1));
    kb.on('keydown-W', () => this.move(-1));
    kb.on('keydown-DOWN', () => this.move(1));
    kb.on('keydown-S', () => this.move(1));
    kb.on('keydown-ENTER', () => this.choose(this.index));
    kb.on('keydown-SPACE', () => this.choose(this.index));
    kb.on('keydown-RIGHT', () => this.choose(this.index, true));
    kb.on('keydown-ESC', () => this.back());
    kb.on('keydown-BACKSPACE', () => this.back());
    kb.on('keydown-LEFT', () => this.back());

    // a shared ?join=CODE link skips straight to the join flow
    const code = new URLSearchParams(location.search).get('join');
    if (code && !joinRouted) {
      joinRouted = true;
      this.time.delayedCall(0, () => this.scene.start('Menu', { heroId: this.heroId }));
    }
  }

  // ---------------------------------------------------------------- data

  private buildMenuData(): void {
    const play = (mode: MenuMode) => () => this.scene.start('Menu', { heroId: this.heroId, mode });
    const online = (m: 'host' | 'join') => () => this.scene.start('Menu', { heroId: this.heroId, online: m });
    this.root = [
      {
        label: 'SINGLEPLAYER', sub: 'You and your crew against the machines', color: 0xfacc15,
        children: [
          { label: 'BOSS FIGHT', sub: 'You + 4 AI allies vs a boss and their bot army', color: 0xf87171, go: play('boss') },
          { label: 'TEAM BRAWL', sub: 'Your crew vs a rival crew. Last team standing', color: 0xffa31a, go: play('brawl') },
          { label: 'DUNGEON CRAWL', sub: '3 floors, relics, a new map every run', color: 0x2ee6d6, go: play('dungeon') },
          { label: 'SOLO CRAWL', sub: 'Just you. Longer map, 4 stocks, softer enemies', color: 0xc084fc, go: play('solo') },
        ],
      },
      {
        label: 'MULTIPLAYER', sub: 'Team up online with friends', color: 0x4ade80,
        children: [
          { label: 'HOST GAME', sub: 'Get a room code to share', color: 0x4ade80, go: online('host') },
          { label: 'JOIN GAME', sub: 'Enter a friend’s room code', color: 0x60a5fa, go: online('join') },
        ],
      },
      { label: 'CHARACTER MANAGER', sub: 'Gear, loadouts and your crew', color: 0x60a5fa, go: () => this.scene.start('Manager', { heroId: this.heroId ?? heroes[0].id }) },
      {
        label: 'SETTINGS', sub: 'Sound and controls', color: 0x94a3b8,
        children: [
          { label: 'SOUND', sub: '', color: 0x94a3b8, go: () => { Sfx.toggleMute(); this.render(false); } },
        ],
      },
    ];
  }

  // ---------------------------------------------------------------- visuals

  private buildBackdrop(): void {
    this.add.graphics().fillGradientStyle(0x070a14, 0x0d1530, 0x070a14, 0x14102e, 1).fillRect(0, 0, 960, 540).setDepth(-5);
    if (this.textures.exists('ui_title_background')) this.add.image(480, 270, 'ui_title_background').setDisplaySize(960, 540).setAlpha(0.22).setDepth(-4);

    // big soft colour blobs that drift
    const blob = (x: number, y: number, r: number, c: number, a: number) => {
      const e = this.add.ellipse(x, y, r, r, c, a).setDepth(-3);
      this.tweens.add({ targets: e, x: x + 60, y: y - 30, duration: 7000 + r * 10, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    };
    blob(220, 440, 420, 0x2563eb, 0.12);
    blob(760, 120, 360, 0xa855f7, 0.1);
    blob(820, 430, 300, 0xfacc15, 0.06);

    // rising particles
    this.time.addEvent({
      delay: 160, loop: true, callback: () => {
        const x = Math.random() * 960;
        const m = this.add.image(x, 550, 'proj').setTint(Phaser.Utils.Array.GetRandom([0x60a5fa, 0xfacc15, 0xc084fc, 0x2ee6d6])).setAlpha(0.5).setScale(0.05 + Math.random() * 0.1).setDepth(-2);
        this.tweens.add({ targets: m, y: -20, x: x + (Math.random() - 0.5) * 120, alpha: 0, duration: 5000 + Math.random() * 4000, onComplete: () => m.destroy() });
      },
    });

    // diagonal hero art panel on the right, rotating through the crew
    const keys = heroes.map((h) => `keyart_${h.id}`).filter((k) => this.textures.exists(k));
    if (keys.length) {
      this.artIdx = Math.floor(Math.random() * keys.length);
      const shape = this.make.graphics({}, false);
      shape.fillStyle(0xffffff).fillPoints([new Phaser.Math.Vector2(600, 0), new Phaser.Math.Vector2(960, 0), new Phaser.Math.Vector2(960, 540), new Phaser.Math.Vector2(520, 540)], true);
      const mask = shape.createGeometryMask();
      const show = (first: boolean) => {
        const next = this.add.image(760, 280, keys[this.artIdx]).setDepth(-1).setMask(mask);
        const s = Math.max(440 / next.width, 560 / next.height);
        next.setScale(s * 1.06).setAlpha(0).setTint(0x8a8fb8);
        this.tweens.add({ targets: next, alpha: 0.95, x: 750, scale: s, duration: first ? 600 : 900, ease: 'Cubic.Out' });
        const old = this.art;
        if (old) this.tweens.add({ targets: old, alpha: 0, duration: 700, onComplete: () => old.destroy() });
        this.art = next;
      };
      show(true);
      this.time.addEvent({ delay: 5000, loop: true, callback: () => { this.artIdx = (this.artIdx + 1) % keys.length; show(false); } });
    }
    // accent edge along the diagonal
    this.add.graphics().lineStyle(3, 0xfacc15, 0.9).lineBetween(600, 0, 520, 540).setDepth(0);
    this.add.graphics().lineStyle(1, 0xffffff, 0.15).lineBetween(612, 0, 532, 540).setDepth(0);
    // left readability shade
    this.add.graphics().fillGradientStyle(0x070a14, 0x070a14, 0x070a14, 0x070a14, 0.85, 0, 0.85, 0).fillRect(0, 0, 620, 540).setDepth(0);
  }

  private buildBrand(): void {
    if (this.textures.exists('ui_logo_game')) {
      const logo = this.add.image(MENU_X, 36, 'ui_logo_game').setOrigin(0, 0).setDepth(5);
      logo.setScale(110 / logo.height);
      this.tweens.add({ targets: logo, y: 42, yoyo: true, repeat: -1, duration: 2400, ease: 'Sine.InOut' });
    } else {
      const t = this.add.text(MENU_X, 28, 'TRAN TECH', { fontFamily: FONT, fontSize: '54px', fontStyle: 'bold', color: '#ffffff' }).setStroke('#1e3a8a', 8).setDepth(5);
      this.add.text(MENU_X + 2, 90, 'B R A W L', { fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#facc15' }).setStroke('#713f12', 6).setDepth(5);
      this.tweens.add({ targets: t, y: 33, yoyo: true, repeat: -1, duration: 2400, ease: 'Sine.InOut' });
    }
  }

  // ---------------------------------------------------------------- menu

  private current(): Item[] {
    return this.stack[this.stack.length - 1];
  }

  private render(animate: boolean): void {
    for (const r of this.rows) r.destroy();
    this.rows = [];
    const items = this.current();
    const parent = this.stack.length > 1 ? this.stack[this.stack.length - 2][this.parentIndex] : undefined;
    this.heading.setText(parent ? parent.label : 'MAIN MENU');
    this.hint.setText(this.stack.length > 1 ? '↑↓ select    ENTER confirm    ESC back' : '↑↓ select    ENTER confirm    M mute');

    items.forEach((it, i) => {
      const y = MENU_Y + i * ROW_H;
      const sel = i === this.index;
      const label = it.label === 'SOUND' ? `SOUND:  ${Sfx.muted ? 'OFF' : 'ON'}` : it.label;
      const sub = it.label === 'SOUND' ? 'Press ENTER to toggle (or M anywhere)' : it.sub;

      const plate = this.add.graphics().setDepth(4);
      const bar = this.add.rectangle(MENU_X, y + ROW_H / 2 - 4, 6, ROW_H - 12, it.color).setOrigin(0, 0.5).setDepth(5);
      const title = this.add.text(MENU_X + 24, y + 8, label, { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#ffffff' }).setDepth(6);
      const subT = this.add.text(MENU_X + 24, y + 36, sub, { fontFamily: FONT, fontSize: '11px', color: '#94a3b8' }).setDepth(6);
      const chev = this.add.text(MENU_X + ROW_W - 14, y + ROW_H / 2 - 4, it.children ? '▸' : '', { fontFamily: FONT, fontSize: '22px', color: hex(it.color) }).setOrigin(1, 0.5).setDepth(6);
      const hit = this.add.rectangle(MENU_X, y - 2, ROW_W, ROW_H - 8, 0xffffff, 0.001).setOrigin(0, 0).setDepth(7).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => { if (this.index !== i) { this.index = i; Sfx.play('move'); this.paint(); } });
      hit.on('pointerdown', () => this.choose(i));

      const group = [plate, bar, title, subT, chev, hit];
      this.rows.push(...group);
      (plate as unknown as { _row: unknown })._row = { i, it, bar, title, subT, y };
      if (animate) {
        for (const g of [plate, bar, title, subT, chev]) {
          const o = g as unknown as { x: number; setAlpha: (a: number) => void };
          o.setAlpha(0);
          this.tweens.add({ targets: g, alpha: 1, duration: 220, delay: i * 50 });
        }
      }
      void sel;
    });
    this.paint();
  }

  /** Redraw the highlight state of every row (no rebuild, so hover is cheap). */
  private paint(): void {
    const items = this.current();
    for (const r of this.rows) {
      const d = (r as unknown as { _row?: { i: number; it: Item; bar: Phaser.GameObjects.Rectangle; title: Phaser.GameObjects.Text; subT: Phaser.GameObjects.Text; y: number } })._row;
      if (!d) continue;
      const g = r as Phaser.GameObjects.Graphics;
      const sel = d.i === this.index;
      g.clear();
      if (sel) {
        const c = d.it.color;
        g.fillStyle(c, 0.16).fillPoints([new Phaser.Math.Vector2(MENU_X, d.y - 2), new Phaser.Math.Vector2(MENU_X + ROW_W + 16, d.y - 2), new Phaser.Math.Vector2(MENU_X + ROW_W, d.y + ROW_H - 10), new Phaser.Math.Vector2(MENU_X, d.y + ROW_H - 10)], true);
        g.lineStyle(1, c, 0.6).strokePoints([new Phaser.Math.Vector2(MENU_X, d.y - 2), new Phaser.Math.Vector2(MENU_X + ROW_W + 16, d.y - 2), new Phaser.Math.Vector2(MENU_X + ROW_W, d.y + ROW_H - 10), new Phaser.Math.Vector2(MENU_X, d.y + ROW_H - 10)], true);
      } else {
        g.fillStyle(0x0b1224, 0.55).fillRect(MENU_X, d.y - 2, ROW_W, ROW_H - 8);
      }
      d.bar.setAlpha(sel ? 1 : 0.35).setScale(sel ? 1.6 : 1, 1);
      d.title.setColor(sel ? hex(d.it.color) : '#e2e8f0');
      d.subT.setColor(sel ? '#cbd5e1' : '#64748b');
    }
    void items;
  }

  private parentIndex = 0;

  private move(d: number): void {
    const n = this.current().length;
    this.index = Phaser.Math.Wrap(this.index + d, 0, n);
    Sfx.play('move');
    this.paint();
  }

  private choose(i: number, onlySub = false): void {
    const it = this.current()[i];
    if (!it) return;
    if (it.children) {
      Sfx.play('select');
      this.parentIndex = i;
      this.stack.push(it.children);
      this.index = 0;
      this.render(true);
    } else if (!onlySub && it.go) {
      Sfx.play('select');
      it.go();
    }
  }

  private back(): void {
    if (this.stack.length <= 1) return;
    Sfx.play('move');
    this.stack.pop();
    this.index = this.parentIndex;
    this.parentIndex = 0;
    this.render(true);
  }
}

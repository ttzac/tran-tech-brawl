import Phaser from 'phaser';
import { fitUi } from '../ui/hires';
import { heroes } from '../data/heroes';
import { bosses } from '../data/bosses';
import { artScale, FEET_ORIGIN_Y, itemIconKey, textureKey } from '../data/art';
import { RARITY_COLOR, SLOTS, findItem } from '../data/items';
import { getLoadout } from '../systems/Loadout';
import { Sfx } from '../systems/Sfx';
import type { LobbyData } from './LobbyScene';
import type { GameMode } from '../data/types';

/** The menu's mode strip: the three game modes plus Solo Crawl (a dungeon run with no AI allies, on its own winding map). */
type MenuMode = GameMode | 'solo';

const MODES: { id: MenuMode; label: string; color: number; name: string; blurb: string }[] = [
  { id: 'boss', label: 'BOSS', color: 0xf87171, name: '', blurb: '' },
  { id: 'brawl', label: 'BRAWL', color: 0xffa31a, name: 'TEAM BRAWL', blurb: 'Your crew vs a rival crew. Random map, falling power-ups. Last team standing.' },
  { id: 'dungeon', label: 'DUNGEON', color: 0x2ee6d6, name: 'DUNGEON CRAWL', blurb: '3 floors, a new map every run. Pick your path, collect relics, beat the boss of each floor.' },
  { id: 'solo', label: 'SOLO', color: 0xc084fc, name: 'SOLO CRAWL', blurb: 'Just you, no AI allies. A longer winding map, 4 stocks, softer enemies. Heal or gamble at the fork.' },
];

/** A `?join=ABCD` link opens the join screen once per page load. */
let urlJoinHandled = false;

const FONT = 'Consolas, "Courier New", monospace';
const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

// Showcase panel (left): the picked hero performs a looping show-reel on a lit floor.
const PANEL = { x: 215, y: 222, w: 390, h: 292 }; // centre + size (top 76, bottom 368)
const FLOOR_Y = 322;
const RUN_LEFT = PANEL.x - 100;
const RUN_RIGHT = PANEL.x + 90;
const SHOW_SCALE = 1.85; // showcase size against the in-fight size

// Roster grid (right): 4 / 4 / 3 cards.
const GRID = { cx: 695, top: 122, dx: 122, dy: 94, cols: 4, w: 114, h: 86 };

const STATS: { label: string; get: (h: (typeof heroes)[number]) => number }[] = [
  { label: 'SPEED', get: (h) => h.speed / 340 },
  { label: 'POWER', get: (h) => (h.melee.damage * h.melee.knockback) / (12 * 330) },
  { label: 'WEIGHT', get: (h) => h.weight / 1.5 },
  { label: 'JUMPS', get: (h) => h.jumps / 3 },
];

export class MenuScene extends Phaser.Scene {
  private hero = 0;
  private boss = 0;
  private cards: Phaser.GameObjects.Rectangle[] = [];
  private plates: Phaser.GameObjects.Rectangle[] = [];
  private heroInfo!: Phaser.GameObjects.Text;
  private bossName!: Phaser.GameObjects.Text;
  private bossTitle!: Phaser.GameObjects.Text;
  private muteTxt!: Phaser.GameObjects.Text;
  private statGfx!: Phaser.GameObjects.Graphics;

  // showcase
  private panel!: Phaser.GameObjects.Rectangle;
  private beam!: Phaser.GameObjects.Graphics;
  private floorGlow!: Phaser.GameObjects.Ellipse;
  private floorRing!: Phaser.GameObjects.Ellipse;
  private star!: Phaser.GameObjects.Sprite;
  private nameTxt!: Phaser.GameObjects.Text;
  private gearTxt: Phaser.GameObjects.Text[] = [];
  private gearImg: Phaser.GameObjects.Image[] = [];
  private reelToken = 0;
  private motes!: Phaser.Time.TimerEvent;
  private notice = '';
  private gmode: MenuMode = 'boss';
  private modePills: { bg: Phaser.GameObjects.Rectangle; txt: Phaser.GameObjects.Text; id: MenuMode }[] = [];
  private arrows: Phaser.GameObjects.Text[] = [];

  constructor() {
    super('Menu');
  }

  private pendingOnline?: 'host' | 'join';

  init(data?: { heroId?: string; notice?: string; mode?: MenuMode; online?: 'host' | 'join' }): void {
    this.hero = Math.max(0, heroes.findIndex((h) => h.id === data?.heroId));
    this.notice = data?.notice ?? '';
    if (data?.mode) this.gmode = data.mode;
    this.pendingOnline = data?.online;
  }

  create(): void {
    fitUi(this);
    this.cameras.main.setBackgroundColor(0x0b0f1a);
    Sfx.attach(this);
    this.cards = [];
    this.plates = [];
    this.gearTxt = [];
    this.gearImg = [];
    this.reelToken++; // a rebuilt scene never inherits an old reel

    // backdrop: a vertical gradient with a slowly drifting grid on top
    this.add.graphics().fillGradientStyle(0x0b0f1a, 0x0b0f1a, 0x16213d, 0x16213d, 1).fillRect(0, 0, 960, 540).setDepth(-2);
    if (this.textures.exists('ui_title_background')) this.add.image(480, 270, 'ui_title_background').setDisplaySize(960, 540).setAlpha(0.25).setDepth(-2);
    const grid = this.add.graphics().setAlpha(0.28).setDepth(-1);
    grid.lineStyle(1, 0x1e293b, 1);
    for (let x = 0; x <= 960; x += 40) grid.lineBetween(x, -40, x, 540);
    for (let y = -40; y <= 540; y += 40) grid.lineBetween(0, y, 960, y);
    this.tweens.add({ targets: grid, y: 40, duration: 4000, repeat: -1 });

    // top bar
    this.add.rectangle(480, 25, 960, 50, 0x090d18, 0.92).setStrokeStyle(1, 0x1e293b).setDepth(10);
    if (this.textures.exists('ui_logo_game')) {
      const logo = this.add.image(14, 25, 'ui_logo_game').setOrigin(0, 0.5).setDepth(11);
      logo.setScale(44 / logo.height);
    } else {
      this.add.text(24, 3, 'TRAN TECH BRAWL', { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#60a5fa' }).setStroke('#1e3a8a', 6).setDepth(11);
      this.add.text(26, 38, 'CO-OP PLATFORM BRAWLER  ·  PICK YOUR FIGHTER', { fontFamily: FONT, fontSize: '10px', color: '#64748b' }).setDepth(11);
    }
    this.pill(880, 500, 100, '◀ MENU', 0x94a3b8, () => this.toTitle());
    this.pill(619, 25, 156, '[ C ]  MANAGER', 0xfacc15, () => this.openManager());
    this.pill(757, 25, 110, '[ H ]  HOST', 0x4ade80, () => this.online('host'));
    this.pill(873, 25, 110, '[ J ]  JOIN', 0x4ade80, () => this.online('join'));
    if (this.notice) {
      // e.g. why an online game ended
      const n = this.add.text(480, 68, this.notice, { fontFamily: FONT, fontSize: '15px', color: '#fca5a5', backgroundColor: '#1f1115', padding: { x: 10, y: 4 } }).setOrigin(0.5).setDepth(20);
      this.tweens.add({ targets: n, alpha: 0, delay: 5000, duration: 800, onComplete: () => n.destroy() });
    }

    this.buildShowcase();
    this.buildRoster();

    // opponent picker (right column, under the roster)
    this.add.rectangle(GRID.cx, 398, 452, 70, 0x1a1016).setStrokeStyle(2, 0x7f1d1d);
    this.add.text(GRID.cx, 372, 'OPPONENT', { fontFamily: FONT, fontSize: '10px', color: '#fca5a5' }).setOrigin(0.5);
    this.bossName = this.add.text(GRID.cx, 395, '', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#f87171', align: 'center' }).setOrigin(0.5);
    this.bossTitle = this.add.text(GRID.cx, 419, '', { fontFamily: FONT, fontSize: '12px', color: '#fca5a5', align: 'center' }).setOrigin(0.5);
    const arrow = (x: number, label: string, d: number): Phaser.GameObjects.Text =>
      this.add
        .text(x, 398, label, { fontFamily: FONT, fontSize: '22px', color: '#94a3b8' })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', function (this: Phaser.GameObjects.Text) { this.setColor('#ffffff'); })
        .on('pointerout', function (this: Phaser.GameObjects.Text) { this.setColor('#94a3b8'); })
        .on('pointerdown', () => this.pickBoss(this.boss + d));
    this.arrows = [arrow(GRID.cx - 200, '◀', -1), arrow(GRID.cx + 200, '▶', 1)];

    this.buildModes(); // after the opponent picker: setMode() fills bossName / bossTitle

    const goBg = this.add.rectangle(GRID.cx, 468, 250, 46, 0xfacc15).setStrokeStyle(3, 0xfef08a).setInteractive({ useHandCursor: true });
    const goTx = this.add.text(GRID.cx, 468, 'FIGHT  ▶', { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#0b0f1a' }).setOrigin(0.5);
    this.add.text(GRID.cx, 498, 'press ENTER', { fontFamily: FONT, fontSize: '10px', color: '#94a3b8' }).setOrigin(0.5);
    goBg.on('pointerdown', () => this.start());
    goBg.on('pointerover', () => goBg.setFillStyle(0xfde047));
    goBg.on('pointerout', () => goBg.setFillStyle(0xfacc15));
    this.tweens.add({ targets: [goBg, goTx], scale: 1.04, yoyo: true, repeat: -1, duration: 800, ease: 'Sine.InOut' });

    // footer: one line of controls
    this.add.rectangle(480, 524, 960, 32, 0x090d18, 0.92).setStrokeStyle(1, 0x1e293b);
    this.add
      .text(480, 524, 'MOVE WASD   JUMP W / SPACE   DUCK / DROP S   ATTACK J / Z   SPECIAL K / X   ULT L / C   MODE TAB   PAUSE P   MUTE M   ESC', { fontFamily: FONT, fontSize: '10px', color: '#94a3b8' })
      .setOrigin(0.5);
    this.muteTxt = this.add.text(930, 58, '', { fontFamily: FONT, fontSize: '12px', color: '#f87171' }).setOrigin(1, 0).setDepth(11);
    const onMute = () => this.muteTxt.setText(Sfx.muted ? 'MUTED (M to unmute)' : '');
    window.addEventListener('ttb:mute', onMute);
    this.events.once('shutdown', () => {
      window.removeEventListener('ttb:mute', onMute);
      this.reelToken++; // stops the show-reel loop
    });
    onMute();

    const kb = this.input.keyboard!;
    kb.on('keydown-LEFT', () => this.pickHero(this.hero - 1));
    kb.on('keydown-A', () => this.pickHero(this.hero - 1));
    kb.on('keydown-RIGHT', () => this.pickHero(this.hero + 1));
    kb.on('keydown-D', () => this.pickHero(this.hero + 1));
    kb.on('keydown-UP', () => this.pickBoss(this.boss - 1));
    kb.on('keydown-DOWN', () => this.pickBoss(this.boss + 1));
    kb.on('keydown-TAB', () => this.setMode(MODES[(MODES.findIndex((m) => m.id === this.gmode) + 1) % MODES.length].id));
    kb.on('keydown-C', () => this.openManager());
    kb.on('keydown-H', () => this.online('host'));
    kb.on('keydown-J', () => this.online('join'));
    kb.on('keydown-ESC', () => this.toTitle());
    kb.on('keydown-ENTER', () => this.start());
    kb.on('keydown-SPACE', () => this.start());

    this.refresh(false);
    if (this.pendingOnline) {
      const m = this.pendingOnline;
      this.pendingOnline = undefined;
      this.time.delayedCall(0, () => this.online(m));
      return;
    }

    const code = new URLSearchParams(location.search).get('join');
    if (code && !urlJoinHandled) {
      urlJoinHandled = true;
      this.time.delayedCall(0, () => this.online('join', code));
    }
  }

  /** A small outlined button for the top bar. */
  private pill(x: number, y: number, w: number, label: string, color: number, cb: () => void): void {
    const bg = this.add.rectangle(x, y, w, 28, 0x0f1729).setStrokeStyle(2, color, 0.85).setInteractive({ useHandCursor: true }).setDepth(11);
    this.add.text(x, y, label, { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: hex(color) }).setOrigin(0.5).setDepth(12);
    bg.on('pointerover', () => bg.setFillStyle(color, 0.22));
    bg.on('pointerout', () => bg.setFillStyle(0x0f1729));
    bg.on('pointerdown', cb);
  }

  // ---------------------------------------------------------------- roster grid

  private buildRoster(): void {
    const rows = Math.ceil(heroes.length / GRID.cols);
    this.add.text(GRID.cx - (GRID.cols * GRID.dx) / 2 + 4, 56, 'FIGHTERS', { fontFamily: FONT, fontSize: '11px', fontStyle: 'bold', color: '#64748b' });
    heroes.forEach((h, i) => {
      const row = Math.floor(i / GRID.cols);
      const inRow = row === rows - 1 ? heroes.length - row * GRID.cols : GRID.cols;
      const col = i - row * GRID.cols;
      const x = GRID.cx + (col - (inRow - 1) / 2) * GRID.dx;
      const y = GRID.top + row * GRID.dy;
      const card = this.add.rectangle(x, y, GRID.w, GRID.h, 0x131a2b).setStrokeStyle(2, 0x2a3650).setInteractive({ useHandCursor: true });
      card.on('pointerdown', () => this.pickHero(i));
      card.on('pointerover', () => i !== this.hero && card.setFillStyle(0x1a2440));
      card.on('pointerout', () => i !== this.hero && card.setFillStyle(0x131a2b));
      this.cards.push(card);
      if (this.textures.exists(`portrait_${h.id}`)) {
        const p = this.add.image(x, y - 8, `portrait_${h.id}`);
        p.setScale(60 / p.height);
      } else {
        const s = this.add.sprite(x, y - 8, textureKey(h.id));
        s.setScale(56 / s.height);
      }
      const plate = this.add.rectangle(x, y + GRID.h / 2 - 11, GRID.w - 4, 18, 0x0a0e1a, 0.85);
      this.plates.push(plate);
      this.add.text(x, y + GRID.h / 2 - 11, h.name.toUpperCase(), { fontFamily: FONT, fontSize: '11px', fontStyle: 'bold', color: '#e2e8f0' }).setOrigin(0.5);
    });
  }

  // ---------------------------------------------------------------- showcase

  private buildShowcase(): void {
    this.add.text(PANEL.x - PANEL.w / 2 + 4, 56, 'SELECTED', { fontFamily: FONT, fontSize: '11px', fontStyle: 'bold', color: '#64748b' });
    this.panel = this.add.rectangle(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 0x0e1424).setStrokeStyle(3, 0x334155);
    // light cone from above, redrawn in the hero's colour
    this.beam = this.add.graphics().setDepth(1);
    // lit floor: glow, a slowly pulsing ring and the platform slab
    this.floorGlow = this.add.ellipse(PANEL.x, FLOOR_Y + 2, 300, 46, 0xffffff, 0.22).setDepth(1);
    this.floorRing = this.add.ellipse(PANEL.x, FLOOR_Y + 2, 250, 34).setStrokeStyle(2, 0xffffff, 0.8).setDepth(1);
    this.tweens.add({ targets: this.floorRing, scaleX: 1.22, scaleY: 1.22, alpha: 0.2, duration: 1500, repeat: -1, ease: 'Sine.Out' });
    this.add.rectangle(PANEL.x, FLOOR_Y + 14, PANEL.w - 20, 6, 0x1e293b).setDepth(1);

    this.star = this.add.sprite(PANEL.x, FLOOR_Y, textureKey(heroes[this.hero].id)).setOrigin(0.5, FEET_ORIGIN_Y).setDepth(5);

    // info block under the stage: name + role, moves, stat bars, gear
    this.nameTxt = this.add.text(PANEL.x, 386, '', { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(5);
    this.heroInfo = this.add.text(PANEL.x, 412, '', { fontFamily: FONT, fontSize: '12px', color: '#cbd5e1', align: 'center' }).setOrigin(0.5);
    this.statGfx = this.add.graphics();
    STATS.forEach((st, i) => {
      const x = PANEL.x - PANEL.w / 2 + 14 + (i % 2) * 190;
      const y = 440 + Math.floor(i / 2) * 16;
      this.add.text(x, y, st.label, { fontFamily: FONT, fontSize: '10px', color: '#94a3b8' }).setOrigin(0, 0.5);
    });
    for (let i = 0; i < SLOTS.length; i++) {
      this.gearTxt.push(this.add.text(PANEL.x + (i - 1) * 128, 492, '', { fontFamily: FONT, fontSize: '11px', color: '#e2e8f0', align: 'center' }).setOrigin(0.5));
      this.gearImg.push(this.add.image(PANEL.x + (i - 1) * 128, 474, 'proj').setVisible(false).setDisplaySize(26, 26));
    }

    // drifting motes in the hero colour so the stage feels alive between moves
    this.motes = this.time.addEvent({ delay: 140, loop: true, callback: () => this.spawnMote() });
  }

  private drawStats(color: number): void {
    const h = heroes[this.hero];
    this.statGfx.clear();
    STATS.forEach((st, i) => {
      const x = PANEL.x - PANEL.w / 2 + 14 + (i % 2) * 190 + 54;
      const y = 440 + Math.floor(i / 2) * 16;
      const w = 110;
      this.statGfx.fillStyle(0x1e293b, 1).fillRect(x, y - 4, w, 8);
      this.statGfx.fillStyle(color, 1).fillRect(x, y - 4, Math.max(6, Math.min(1, st.get(h)) * w), 8);
    });
  }

  private spawnMote(): void {
    const c = heroes[this.hero].color;
    const x = PANEL.x - PANEL.w / 2 + 24 + Math.random() * (PANEL.w - 48);
    const m = this.add.image(x, FLOOR_Y + 6 - Math.random() * 12, 'proj').setTint(c).setAlpha(0.7).setScale(0.12 + Math.random() * 0.22).setDepth(2);
    this.tweens.add({ targets: m, y: m.y - 120 - Math.random() * 120, x: x + (Math.random() - 0.5) * 50, alpha: 0, duration: 1600 + Math.random() * 1400, onComplete: () => m.destroy() });
  }

  /** Recolour everything that carries the hero's theme colour. */
  private theme(color: number): void {
    this.panel.setStrokeStyle(3, color, 0.9);
    this.floorGlow.setFillStyle(color, 0.22);
    this.floorRing.setStrokeStyle(2, color, 0.8);
    this.beam.clear();
    this.beam.fillStyle(color, 0.11).fillPoints(
      [new Phaser.Math.Vector2(PANEL.x - 26, PANEL.y - PANEL.h / 2 + 3), new Phaser.Math.Vector2(PANEL.x + 26, PANEL.y - PANEL.h / 2 + 3), new Phaser.Math.Vector2(PANEL.x + 150, FLOOR_Y + 8), new Phaser.Math.Vector2(PANEL.x - 150, FLOOR_Y + 8)],
      true,
    );
    this.nameTxt.setColor(hex(color)).setStroke('#0b0f1a', 5);
    this.drawStats(color);
  }

  // ---------------------------------------------------------------- show-reel

  private wait(ms: number): Promise<void> {
    return new Promise((res) => this.time.delayedCall(ms, res));
  }

  /** Tweens the showcase sprite and resolves when finished (the reel awaits it). */
  private tween(config: Omit<Phaser.Types.Tweens.TweenBuilderConfig, 'targets'>): Promise<void> {
    return new Promise((res) => this.tweens.add({ ...config, targets: this.star, onComplete: () => res() } as Phaser.Types.Tweens.TweenBuilderConfig));
  }

  private base(): number {
    return SHOW_SCALE * artScale(heroes[this.hero].id, heroes[this.hero].scale);
  }

  /** Plays the hero's own animation when the art has it; single-pose stand-ins keep their pose (motion comes from tweens). */
  private anim(state: string, loop = true): void {
    const key = `${heroes[this.hero].id}:${state}`;
    if (this.anims.exists(key)) this.star.play({ key, repeat: loop ? -1 : 0 }, true);
    else if (this.anims.exists(`${heroes[this.hero].id}:idle`)) this.star.play(`${heroes[this.hero].id}:idle`, true);
  }

  private dust(x: number, flip = false): void {
    const d = this.add.sprite(x, FLOOR_Y + 4, 'fx_dust').setOrigin(0.5, 1).setScale(2.2).setDepth(4).setFlipX(flip).setAlpha(0.85);
    d.play('fx_dust').once('animationcomplete', () => d.destroy());
  }

  private slash(x: number, y: number, color: number): void {
    const tk = `fx_${heroes[this.hero].id}_trail`;
    if (this.anims.exists(tk)) {
      const t = this.add.sprite(x - 10, y + 10, tk).setScale(1.5).setDepth(6);
      t.play(tk).once('animationcomplete', () => t.destroy());
      return;
    }
    const s = this.add.image(x, y, 'slash').setTint(color).setScale(1.5).setAlpha(0.95).setDepth(6).setAngle(-35);
    this.tweens.add({ targets: s, angle: 35, alpha: 0, scale: 1.9, duration: 260, ease: 'Cubic.Out', onComplete: () => s.destroy() });
  }

  private bolt(x: number, y: number, color: number): void {
    const p = this.add.image(x, y, 'proj').setTint(color).setScale(1.5).setDepth(6);
    const glow = this.add.image(x, y, 'proj').setTint(0xffffff).setScale(0.8).setDepth(7);
    this.tweens.add({ targets: [p, glow], x: x + 150, duration: 520, ease: 'Sine.In', onUpdate: () => {
      const t = this.add.image(p.x, p.y, 'proj').setTint(color).setScale(1.1).setAlpha(0.6).setDepth(5);
      this.tweens.add({ targets: t, alpha: 0, scale: 0.1, duration: 280, onComplete: () => t.destroy() });
    }, onComplete: () => {
      const hk = `fx_${heroes[this.hero].id}_shit`;
      const hit = this.anims.exists(hk);
      const ring = this.add.sprite(p.x, p.y, hit ? hk : 'fx_burst').setScale(hit ? 1 : 2.2).setDepth(7);
      ring.play(hit ? hk : 'fx_burst').once('animationcomplete', () => ring.destroy());
      p.destroy();
      glow.destroy();
    } });
  }

  private async reel(token: number): Promise<void> {
    const alive = () => token === this.reelToken && this.sys.isActive();
    const h = heroes[this.hero];
    const star = this.star;
    const full = this.anims.exists(`${h.id}:run`);
    const b = this.base();
    const lean = (deg: number, ms: number) => this.tween({ angle: deg, duration: ms, ease: 'Sine.InOut' });

    while (alive()) {
      // 1) idle, breathing
      star.setFlipX(false).setAngle(0).setPosition(RUN_LEFT, FLOOR_Y).setScale(b);
      this.anim('idle');
      if (!full) this.tweens.add({ targets: star, scaleY: b * 1.035, scaleX: b * 0.985, yoyo: true, repeat: 1, duration: 450, ease: 'Sine.InOut' });
      await this.wait(1800);
      if (!alive()) return;

      // 2) run to the right
      this.anim('run');
      const dusting = this.time.addEvent({ delay: 170, loop: true, callback: () => this.dust(star.x - 22, true) });
      if (!full) lean(10, 150);
      await this.tween({ x: RUN_RIGHT, duration: 1250, ease: 'Sine.InOut' });
      dusting.remove();
      if (!alive()) return;
      this.anim('idle');
      star.setAngle(0);
      await this.wait(220);
      if (!alive()) return;

      // 3) melee swing
      this.anim('melee', false);
      if (!full) await lean(16, 90);
      this.time.delayedCall(full ? 170 : 40, () => alive() && this.slash(star.x + 70, star.y - 80, h.trail ?? h.color));
      await this.wait(full ? 520 : 260);
      if (!alive()) return;
      if (!full) await lean(0, 140);
      this.anim('idle');
      await this.wait(260);
      if (!alive()) return;

      // 4) special: charge, release a bolt
      this.anim('special', false);
      if (!full) await lean(-10, 120);
      this.time.delayedCall(full ? 110 : 40, () => alive() && this.bolt(star.x + 60, star.y - 86, h.special.color));
      await this.wait(full ? 420 : 260);
      if (!alive()) return;
      if (!full) await lean(0, 120);
      this.anim('idle');
      await this.wait(650);
      if (!alive()) return;

      // 4b) the ultimate pose (6 frames), for heroes that have it
      if (this.anims.exists(`${h.id}:ultimate`)) {
        this.anim('ultimate', false);
        await this.wait(780);
        if (!alive()) return;
        this.anim('idle');
        await this.wait(400);
        if (!alive()) return;
      }

      // 4c) taunt, then the victory pose, for heroes that have them
      for (const pose of ['taunt', 'victory'] as const) {
        if (!this.anims.exists(`${h.id}:${pose}`)) continue;
        this.anim(pose, false);
        await this.wait(pose === 'taunt' ? 700 : 900);
        if (!alive()) return;
        this.anim('idle');
        await this.wait(300);
        if (!alive()) return;
      }

      // 5) hop with a flip-style spin for the stand-ins, jump / fall frames for animated heroes
      // (the flip spins around the body centre, not the feet, so it never swings through the floor)
      const lift = full ? 0 : (158 - 0.69 * 160) * b;
      if (!full) star.setOrigin(0.5, 0.69).setY(FLOOR_Y - lift);
      this.anim('jump');
      if (!full) this.tween({ angle: 360, duration: 540, ease: 'Sine.InOut' });
      await this.tween({ y: FLOOR_Y - lift - 48, duration: 280, ease: 'Quad.Out' });
      this.anim('fall');
      await this.tween({ y: FLOOR_Y - lift, duration: 260, ease: 'Quad.In' });
      if (!alive()) return;
      star.setAngle(0).setOrigin(0.5, FEET_ORIGIN_Y).setY(FLOOR_Y);
      this.dust(star.x - 18, true);
      this.dust(star.x + 18);
      this.anim('idle');
      await this.wait(380);
      if (!alive()) return;

      // 6) run back to the left, facing left
      star.setFlipX(true);
      this.anim('run');
      const dusting2 = this.time.addEvent({ delay: 170, loop: true, callback: () => this.dust(star.x + 22) });
      if (!full) lean(-10, 150);
      await this.tween({ x: RUN_LEFT, duration: 1250, ease: 'Sine.InOut' });
      dusting2.remove();
      star.setAngle(0);
    }
  }


  // ---------------------------------------------------------------- state

  private pickHero(i: number): void {
    this.hero = Phaser.Math.Wrap(i, 0, heroes.length);
    Sfx.play('move');
    this.refresh(true);
  }

  private pickBoss(i: number): void {
    if (this.gmode !== 'boss') return;
    this.boss = Phaser.Math.Wrap(i, 0, bosses.length);
    Sfx.play('move');
    this.showBoss();
  }

  private showBoss(): void {
    const m = MODES.find((x) => x.id === this.gmode)!;
    if (this.gmode === 'boss') {
      const b = bosses[this.boss];
      this.bossName.setText(b.name).setColor('#f87171');
      this.bossTitle.setText(b.title);
    } else {
      this.bossName.setText(m.name).setColor(hex(m.color));
      this.bossTitle.setText(m.blurb).setWordWrapWidth(400);
    }
    for (const a of this.arrows) a.setVisible(this.gmode === 'boss');
  }

  /** Mode strip in the top bar: BOSS co-op, team BRAWL, DUNGEON crawl (TAB cycles). */
  private buildModes(): void {
    this.modePills = MODES.map((m, i) => {
      const x = 296 + i * 70;
      const bg = this.add.rectangle(x, 25, 64, 28, 0x131a2b).setStrokeStyle(2, m.color).setDepth(11).setInteractive({ useHandCursor: true });
      const txt = this.add.text(x, 25, m.label, { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: hex(m.color) }).setOrigin(0.5).setDepth(12);
      bg.on('pointerdown', () => this.setMode(m.id));
      return { bg, txt, id: m.id };
    });
    this.setMode(this.gmode, true);
  }

  private setMode(id: MenuMode, quiet = false): void {
    this.gmode = id;
    if (!quiet) Sfx.play('move');
    for (const p of this.modePills) {
      const m = MODES.find((x) => x.id === p.id)!;
      const on = p.id === id;
      p.bg.setFillStyle(on ? m.color : 0x131a2b);
      p.txt.setColor(on ? '#0b0f1a' : hex(m.color));
    }
    this.showBoss();
  }

  private refresh(swap: boolean): void {
    const h = heroes[this.hero];
    this.cards.forEach((c, i) => c.setStrokeStyle(i === this.hero ? 3 : 2, i === this.hero ? h.color : 0x2a3650).setFillStyle(i === this.hero ? 0x1e2a44 : 0x131a2b).setScale(i === this.hero ? 1.05 : 1));
    this.plates.forEach((p, i) => p.setFillStyle(i === this.hero ? h.color : 0x0a0e1a, i === this.hero ? 0.35 : 0.85));
    this.heroInfo.setText(`${h.role.toUpperCase()}\nattack: ${h.melee.name}   special: ${h.special.name}`);
    this.showBoss();
    this.theme(h.color);

    // gear row: what this hero currently has equipped (set in the Character Manager)
    const l = getLoadout(h.id);
    SLOTS.forEach((s, i) => {
      const it = findItem(s, l[s]);
      const icon = it ? itemIconKey(s, it.id) : '';
      const art = !!icon && this.textures.exists(icon);
      this.gearImg[i].setVisible(art);
      if (art) this.gearImg[i].setTexture(icon).setDisplaySize(26, 26);
      this.gearTxt[i].setText(it ? `${art ? '' : it.icon + '\n'}${it.name}` : '').setColor(it ? hex(RARITY_COLOR[it.rarity]) : '#64748b');
    });

    // restart the show-reel for the new hero: reset the sprite, pop it in, then loop
    this.reelToken++;
    this.tweens.killTweensOf(this.star);
    this.star.setTexture(textureKey(h.id)).setOrigin(0.5, FEET_ORIGIN_Y).setFlipX(false).setAngle(0).setAlpha(1).setPosition(RUN_LEFT - (swap ? 60 : 0), FLOOR_Y);
    this.star.setScale(this.base() * (swap ? 0.8 : 1));
    if (swap) {
      this.star.setTintFill(0xffffff);
      this.time.delayedCall(90, () => this.star.clearTint());
      this.tweens.add({ targets: this.star, x: RUN_LEFT, scale: this.base(), duration: 260, ease: 'Back.Out' });
      this.nameTxt.setAlpha(0).setY(396);
      this.tweens.add({ targets: this.nameTxt, alpha: 1, y: 386, duration: 220, ease: 'Cubic.Out' });
    }
    this.nameTxt.setText(h.name.toUpperCase());
    const token = this.reelToken;
    this.time.delayedCall(swap ? 300 : 0, () => token === this.reelToken && void this.reel(token));
  }

  private toTitle(): void {
    Sfx.play('move');
    this.scene.start('Title', { heroId: heroes[this.hero].id });
  }

  private openManager(): void {
    Sfx.play('select');
    this.scene.start('Manager', { heroId: heroes[this.hero].id });
  }

  private online(mode: 'host' | 'join', code?: string): void {
    Sfx.play('select');
    this.scene.start('Lobby', { mode, code, heroId: heroes[this.hero].id } satisfies LobbyData);
  }

  private start(): void {
    Sfx.play('select');
    if (this.gmode === 'dungeon') this.scene.start('Map', { heroId: heroes[this.hero].id });
    else if (this.gmode === 'solo') this.scene.start('Map', { heroId: heroes[this.hero].id, solo: true });
    else this.scene.start('Fight', { heroId: heroes[this.hero].id, bossIndex: this.boss, mode: this.gmode });
  }
}

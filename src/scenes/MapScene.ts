import Phaser from 'phaser';
import { fitUi } from '../ui/hires';
import { Sfx } from '../systems/Sfx';
import { getLoadout } from '../systems/Loadout';
import { heroes } from '../data/heroes';
import { themeById } from '../data/procgen';
import { FLOORS, MAX_RUN_STOCKS, ROOM_KINDS, modById, relicById, type FloorMap, type MapNode, type RunState } from '../data/dungeon';
import { choices, enterNode, floorMap, layersOf, newRun } from '../sim/crawl';
import { randomSeed } from '../sim/rng';

const FONT = 'Consolas, "Courier New", monospace';
const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

export interface MapData {
  /** the run so far (omit to start a new one) */
  run?: RunState;
  heroId?: string;
  seed?: number;
  /** start a new Solo Crawl run (no AI allies, the winding map) */
  solo?: boolean;
}

// classic map: 5 columns, wide spacing. Solo map: 7 columns, tighter, and the road wiggles up and down.
const nodeX = (n: MapNode, solo: boolean): number => (solo ? 130 + n.layer * 118 : 170 + n.layer * 150);
const nodeY = (n: MapNode, solo: boolean): number => 262 + (n.lane - (n.lanes - 1) / 2) * 84 + (solo ? (n.layer % 2 ? 20 : -20) : 0);

/** Dungeon floor map: pick which room to walk into next (← → / ↑ ↓, Enter). The map, like everything in a run, comes from the run seed. */
export class MapScene extends Phaser.Scene {
  private run!: RunState;
  private map!: FloorMap;
  private opts: MapNode[] = [];
  private sel = 0;
  private boxes = new Map<number, Phaser.GameObjects.Rectangle>();
  private info!: Phaser.GameObjects.Text;
  private infoTitle!: Phaser.GameObjects.Text;
  private cursor!: Phaser.GameObjects.Rectangle;
  private going = false;
  private solo = false;

  constructor() {
    super('Map');
  }

  init(data: MapData): void {
    const heroId = data?.heroId ?? heroes[0].id;
    this.run = data?.run ?? newRun(heroId, data?.seed ?? randomSeed(), getLoadout(heroId), data?.solo);
    this.solo = !!this.run.solo;
    this.map = floorMap(this.run);
    this.opts = choices(this.run, this.map);
    this.sel = 0;
    this.going = false;
    this.boxes.clear();
  }

  create(): void {
    fitUi(this);
    Sfx.attach(this);
    const run = this.run;
    this.cameras.main.setBackgroundColor(0x0b0f1a);
    this.add.graphics().fillGradientStyle(0x0b0f1a, 0x0b0f1a, 0x16213d, 0x16213d, 1).fillRect(0, 0, 960, 540);
    this.add.text(480, 34, `${this.solo ? 'SOLO CRAWL' : 'DUNGEON'} · FLOOR ${run.floor + 1} / ${FLOORS}`, { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#2ee6d6' }).setOrigin(0.5).setStroke('#0b1026', 6);
    this.add.text(480, 66, `${themeById(this.map.theme).name}  ·  seed ${run.seed.toString(16).toUpperCase()}`, { fontFamily: FONT, fontSize: '13px', color: '#64748b' }).setOrigin(0.5);
    const relics = run.relics.map((id) => relicById(id)?.icon ?? '').join(' ');
    this.add
      .text(480, 92, `Stocks ${'● '.repeat(run.stocks)}${'○ '.repeat(Math.max(0, MAX_RUN_STOCKS - run.stocks))} ·  rooms cleared ${run.cleared}  ·  score ${run.score}${relics ? `  ·  ${relics}` : ''}`, { fontFamily: FONT, fontSize: '14px', color: '#e2e8f0' })
      .setOrigin(0.5);

    // links first (under the rooms): the path walked is bright, the rest dim
    const g = this.add.graphics();
    const visited = new Set(run.path);
    const startX = this.solo ? 50 : 60;
    const s = this.solo;
    for (const n of this.map.nodes) {
      if (n.layer === 0) this.link(g, startX, 262, nodeX(n, s), nodeY(n, s), run.path[0] === n.id, run.at < 0);
      for (const id of n.next) {
        const m = this.map.nodes[id];
        const walked = visited.has(n.id) && visited.has(m.id);
        this.link(g, nodeX(n, s), nodeY(n, s), nodeX(m, s), nodeY(m, s), walked, n.id === run.at);
      }
    }
    this.add.text(startX, 262, '🚪', { fontSize: '26px' }).setOrigin(0.5);
    const layers = layersOf(run);
    for (let l = 0; l <= layers; l++) this.add.text(nodeX({ layer: l } as MapNode, s), 148, l === layers ? 'BOSS' : `ROOM ${l + 1}`, { fontFamily: FONT, fontSize: '11px', color: '#475569' }).setOrigin(0.5);

    this.cursor = this.add.rectangle(0, 0, 76, 76).setStrokeStyle(3, 0xfacc15).setDepth(5);
    this.tweens.add({ targets: this.cursor, scale: 1.12, yoyo: true, repeat: -1, duration: 420 });
    for (const n of this.map.nodes) this.drawNode(n, visited.has(n.id), this.opts.includes(n));

    this.infoTitle = this.add.text(480, 404, '', { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#f8fafc' }).setOrigin(0.5);
    this.info = this.add.text(480, 446, '', { fontFamily: FONT, fontSize: '13px', color: '#cbd5e1', align: 'center', wordWrap: { width: 760 } }).setOrigin(0.5);
    this.add.text(480, 518, '← →  choose a room   ·   ENTER  go   ·   M mute   ·   Esc  quit the run', { fontFamily: FONT, fontSize: '12px', color: '#64748b' }).setOrigin(0.5);

    const kb = this.input.keyboard!;
    for (const k of ['LEFT', 'UP', 'A', 'W']) kb.on(`keydown-${k}`, () => this.choose(this.sel - 1));
    for (const k of ['RIGHT', 'DOWN', 'D', 'S']) kb.on(`keydown-${k}`, () => this.choose(this.sel + 1));
    kb.on('keydown-ENTER', () => this.go());
    kb.on('keydown-SPACE', () => this.go());
    kb.once('keydown-ESC', () => this.scene.start('Menu', { heroId: run.heroId }));
    this.choose(0, true);
  }

  private link(g: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, walked: boolean, open: boolean): void {
    g.lineStyle(walked ? 4 : 2, walked ? 0x2ee6d6 : open ? 0xfacc15 : 0x334155, walked || open ? 0.9 : 0.6);
    g.lineBetween(x1, y1, x2, y2);
  }

  private drawNode(n: MapNode, visited: boolean, open: boolean): void {
    const kind = ROOM_KINDS[n.kind];
    const x = nodeX(n, this.solo);
    const y = nodeY(n, this.solo);
    const here = n.id === this.run.at;
    const box = this.add
      .rectangle(x, y, 64, 64, visited ? 0x0f2a2a : 0x131a2b)
      .setStrokeStyle(open || here ? 3 : 2, visited ? 0x2ee6d6 : kind.color, open || visited ? 1 : 0.45)
      .setDepth(2);
    const dim = open || visited ? 1 : 0.45;
    this.add.text(x, y - 6, kind.icon, { fontSize: '26px' }).setOrigin(0.5).setDepth(3).setAlpha(dim);
    this.add.text(x, y + 22, kind.name.toUpperCase(), { fontFamily: FONT, fontSize: '9px', fontStyle: 'bold', color: hex(kind.color) }).setOrigin(0.5).setDepth(3).setAlpha(dim);
    const mod = modById(n.mod);
    if (mod) this.add.text(x + 26, y - 26, mod.icon, { fontSize: '16px' }).setOrigin(0.5).setDepth(4).setAlpha(dim);
    if (visited) this.add.text(x - 26, y - 26, '✔', { fontSize: '14px', color: '#4ade80' }).setOrigin(0.5).setDepth(4);
    if (open) {
      box.setInteractive({ useHandCursor: true });
      box.on('pointerover', () => this.choose(this.opts.indexOf(n)));
      box.on('pointerdown', () => {
        this.choose(this.opts.indexOf(n), true);
        this.go();
      });
    }
    this.boxes.set(n.id, box);
  }

  private choose(i: number, quiet = false): void {
    if (this.going || !this.opts.length) return;
    const k = Phaser.Math.Wrap(i, 0, this.opts.length);
    if (k !== this.sel && !quiet) Sfx.play('move');
    this.sel = k;
    const n = this.opts[k];
    const kind = ROOM_KINDS[n.kind];
    const mod = modById(n.mod);
    this.cursor.setPosition(nodeX(n, this.solo), nodeY(n, this.solo));
    this.infoTitle.setText(`${kind.icon}  ${kind.name.toUpperCase()}${mod ? `   +   ${mod.icon} ${mod.name.toUpperCase()}` : ''}`).setColor(hex(kind.color));
    this.info.setText(`${kind.blurb}${mod ? `\n${mod.name}: ${mod.blurb}` : ''}`);
  }

  private go(): void {
    const n = this.opts[this.sel];
    if (this.going || !n) return;
    this.going = true;
    Sfx.play('select');
    const run = enterNode(this.run, n.id);
    this.cameras.main.fadeOut(180, 11, 15, 26);
    this.time.delayedCall(200, () => {
      if (ROOM_KINDS[n.kind].fight) this.scene.start('Fight', { mode: 'dungeon', dungeon: run, heroId: run.heroId });
      else this.scene.start('Loot', { run, cleared: `FLOOR ${run.floor + 1} · ${ROOM_KINDS[n.kind].name.toUpperCase()}` });
    });
  }
}

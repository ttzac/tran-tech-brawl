import Phaser from 'phaser';
import { fitUi } from '../ui/hires';
import type { Fighter } from '../entities/Fighter';
import { HUD } from '../ui/HUD';
import { Sfx } from '../systems/Sfx';
import { leaveNet } from '../net/session';

export interface HUDData {
  /** online match: the pause menu must not freeze the fight (other players are still playing) */
  online?: boolean;
  player: Fighter;
  boss: Fighter;
  stats: () => { minions: number; wave: number; allies: number; info?: string };
}

/** Registry key where HUDScene leaves fight stats for ResultScene: { timeMs, kos }. */
export const FIGHT_STATS_KEY = 'fightStats';

const FONT = 'Consolas, "Courier New", monospace';

/** Runs on top of the fight with its own un-zoomed camera, so the HUD stays put
 *  while the fight camera scrolls and zooms. Also owns sound wiring, pause and fight stats. */
export class HUDScene extends Phaser.Scene {
  private hud!: HUD;
  private stats!: HUDData['stats'];
  private unbind: (() => void) | null = null;
  private paused = false;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private options: Phaser.GameObjects.Text[] = [];
  private sel = 0;
  private timeMs = 0;
  private kos = 0;
  private muteTxt!: Phaser.GameObjects.Text;
  private online = false;

  constructor() {
    super('HUD');
  }

  create(data: HUDData): void {
    fitUi(this);
    this.stats = data.stats;
    this.online = !!data.online;
    this.paused = false;
    this.overlay = [];
    this.timeMs = 0;
    this.kos = 0;
    this.hud = new HUD(this, data.player, data.boss);
    this.registry.set(FIGHT_STATS_KEY, { timeMs: 0, kos: 0 });

    Sfx.attach(this);
    const fight = this.scene.get('Fight');
    this.unbind = Sfx.bindFight(fight.events);
    const onKo = () => {
      this.kos++;
    };
    fight.events.on('sfx:ko', onKo);
    // announcer: FightScene says what to shout, we draw it
    const onBanner = (text: string, color: string) => this.hud.banner(text, color);
    fight.events.on('hud:banner', onBanner);

    this.muteTxt = this.add
      .text(944, 520, '', { fontFamily: 'Consolas, monospace', fontSize: '13px', color: '#f87171' })
      .setOrigin(1, 1)
      .setDepth(20);
    const onMute = () => this.muteTxt.setText(Sfx.muted ? 'MUTED (M)' : '');
    window.addEventListener('ttb:mute', onMute);
    onMute();

    const kb = this.input.keyboard!;
    kb.on('keydown-P', () => (this.paused ? this.resume() : this.pause()));
    // Resume on key *up*: FightScene's own once('keydown-ESC') -> menu can never see this press.
    kb.on('keyup-ESC', () => this.paused && this.resume());
    kb.on('keydown-UP', () => this.paused && this.choose(this.sel - 1));
    kb.on('keydown-DOWN', () => this.paused && this.choose(this.sel + 1));
    kb.on('keydown-W', () => this.paused && this.choose(this.sel - 1));
    kb.on('keydown-S', () => this.paused && this.choose(this.sel + 1));
    kb.on('keydown-ENTER', () => this.paused && this.activate());

    this.events.once('shutdown', () => {
      this.unbind?.();
      this.unbind = null;
      fight.events.off('sfx:ko', onKo);
      fight.events.off('hud:banner', onBanner);
      window.removeEventListener('ttb:mute', onMute);
      this.registry.set(FIGHT_STATS_KEY, { timeMs: this.timeMs, kos: this.kos });
    });
  }

  update(_t: number, delta: number): void {
    if (this.paused) return;
    this.timeMs += delta;
    if (this.sys.game.getFrame() % 30 === 0) this.registry.set(FIGHT_STATS_KEY, { timeMs: this.timeMs, kos: this.kos });
    const s = this.stats();
    this.hud.update(s.minions, s.wave, s.allies, s.info);
  }

  private pause(): void {
    if (!this.scene.isActive('Fight')) return;
    this.paused = true;
    if (!this.online) this.scene.pause('Fight');
    this.registry.set(FIGHT_STATS_KEY, { timeMs: this.timeMs, kos: this.kos });
    Sfx.play('select');
    const dim = this.add.rectangle(480, 270, 960, 540, 0x000000, 0.6).setDepth(100);
    const title = this.add.text(480, 170, 'PAUSED', { fontFamily: FONT, fontSize: '56px', fontStyle: 'bold', color: '#60a5fa' }).setOrigin(0.5).setDepth(101);
    const hint = this.add
      .text(480, 470, 'P / Esc resume  ·  W/S + Enter choose  ·  M mute', { fontFamily: FONT, fontSize: '14px', color: '#94a3b8' })
      .setOrigin(0.5)
      .setDepth(101);
    this.options = ['Resume', 'Quit to menu'].map((label, i) =>
      this.add
        .text(480, 260 + i * 54, label, { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#cbd5e1' })
        .setOrigin(0.5)
        .setDepth(101)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => this.choose(i))
        .on('pointerdown', () => {
          this.sel = i;
          this.activate();
        }),
    );
    this.overlay = [dim, title, hint, ...this.options];
    this.choose(0);
  }

  private choose(i: number): void {
    const n = Phaser.Math.Wrap(i, 0, this.options.length);
    if (n !== this.sel) Sfx.play('move');
    this.sel = n;
    this.options.forEach((t, k) => t.setColor(k === n ? '#facc15' : '#cbd5e1').setText(`${k === n ? '> ' : '  '}${['Resume', 'Quit to menu'][k]}`));
  }

  private activate(): void {
    Sfx.play('select');
    if (this.sel === 0) this.resume();
    else this.quit();
  }

  private resume(): void {
    this.paused = false;
    this.overlay.forEach((o) => o.destroy());
    this.overlay = [];
    this.options = [];
    if (!this.online) this.scene.resume('Fight');
  }

  private quit(): void {
    this.registry.set(FIGHT_STATS_KEY, { timeMs: this.timeMs, kos: this.kos });
    if (this.online) leaveNet();
    this.scene.stop('Fight');
    this.scene.start('Menu');
  }
}

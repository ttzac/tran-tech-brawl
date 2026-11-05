import Phaser from 'phaser';
import { heroes } from '../data/heroes';
import { bosses } from '../data/bosses';
import { ART, FX, PORTRAITS, STAGE_IMAGES } from '../data/art';
import type { FighterDef } from '../data/types';

export const TEX_W = 28;
export const TEX_H = 44;

/** No art files needed yet: every sprite is drawn procedurally here. Drop real PNGs in
 *  public/assets/sprites and load them here when you have art. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.showProgress();
    for (const [k, v] of Object.entries(FX)) this.load.spritesheet(`fx_${k}`, `assets/fx/${k}.png`, { frameWidth: v.w, frameHeight: v.h });
    for (const k of STAGE_IMAGES) this.load.image(`stage_${k}`, `assets/stages/${k}.png`);
    for (const id of PORTRAITS) this.load.image(`portrait_${id}`, `assets/portraits/${id}.png`);
    for (const id of Object.keys(ART)) this.load.aseprite(id, `assets/sprites/${id}.png`, `assets/sprites/${id}.json`);
  }

  /** Simple loading bar; removes itself when the loader finishes. */
  private showProgress(): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;
    const w = Math.min(320, width * 0.6);
    const label = this.add.text(cx, cy - 28, 'Loading...', { fontSize: '18px', color: '#cbd5e1' }).setOrigin(0.5);
    const frame = this.add.rectangle(cx, cy, w + 4, 20).setStrokeStyle(2, 0x64748b);
    const bar = this.add.rectangle(cx - w / 2, cy, 0, 14, 0x38bdf8).setOrigin(0, 0.5);
    const failed: string[] = [];
    this.load.on('progress', (p: number) => bar.setSize(w * p, 14));
    this.load.on('loaderror', (f: Phaser.Loader.File) => {
      failed.push(f.key);
      console.warn('Failed to load asset:', f.key, f.url);
      label.setText(`Missing asset: ${f.key}`).setColor('#fca5a5');
    });
    this.load.once('complete', () => {
      label.destroy();
      frame.destroy();
      bar.destroy();
    });
  }

  create(): void {
    for (const k of Object.keys(FX)) this.anims.create({ key: `fx_${k}`, frames: this.anims.generateFrameNumbers(`fx_${k}`), frameRate: 16, repeat: 0 });
    const defs: FighterDef[] = [...heroes, ...bosses.flatMap((b) => [b.fighter, b.minion])];
    // Phaser creates Aseprite tags as one-shot animations; loop the cyclic ones.
    for (const id of Object.keys(ART)) {
      for (const a of this.anims.createFromAseprite(id)) if (/:(idle|run|fall|launch)$/.test(a.key)) a.repeat = -1;
    }
    for (const d of defs) if (!ART[d.id]) this.makeFighter(d);
    for (const [id, a] of Object.entries(ART)) if (a.smooth) this.textures.get(id).setFilter(Phaser.Textures.FilterMode.LINEAR); // fine art stays smooth, old art stays crisp
    this.makeSlash();

    const g = this.add.graphics();
    g.fillStyle(0xffffff).fillCircle(8, 8, 8);
    g.generateTexture('proj', 16, 16);
    g.destroy();

    this.scene.start('Menu');
  }

  /** Crescent swing arc facing right (tinted per hero in Combat). */
  private makeSlash(): void {
    const g = this.add.graphics();
    const pts: Phaser.Math.Vector2[] = [];
    const steps = 14;
    for (let i = 0; i <= steps; i++) { const a = -0.85 + (1.7 * i) / steps; pts.push(new Phaser.Math.Vector2(-20 + 140 * Math.cos(a), 64 + 62 * Math.sin(a))); }
    for (let i = steps; i >= 0; i--) { const a = -0.85 + (1.7 * i) / steps; pts.push(new Phaser.Math.Vector2(-46 + 140 * Math.cos(a), 64 + 62 * Math.sin(a))); }
    g.fillStyle(0xffffff, 1).fillPoints(pts, true);
    g.generateTexture('slash', 128, 128);
    g.destroy();
  }

  private makeFighter(d: FighterDef): void {
    const dark = Phaser.Display.Color.IntegerToColor(d.color).darken(35).color;
    const g = this.add.graphics();
    g.fillStyle(dark).fillRoundedRect(0, 0, TEX_W, TEX_H, 7);
    g.fillStyle(d.color).fillRoundedRect(2, 2, TEX_W - 4, TEX_H - 4, 6);
    // visor / eyes (faces right; flipX handles left)
    g.fillStyle(0xffffff).fillRect(13, 9, 12, 9);
    g.fillStyle(0x0f172a).fillRect(20, 11, 5, 5);
    // belt
    g.fillStyle(dark).fillRect(2, 28, TEX_W - 4, 4);
    g.generateTexture(`fighter_${d.id}`, TEX_W, TEX_H);
    g.destroy();
  }
}

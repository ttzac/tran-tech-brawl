import Phaser from 'phaser';
import type { Fighter } from '../entities/Fighter';
import type { Shot } from '../systems/Combat';
import { meleeBox } from '../systems/Combat';
import { HERO_FX } from '../data/art';

/** A fading slash attached to the fighter who swung. */
interface Slash {
  img: Phaser.GameObjects.Image;
  f: Fighter | null;
  range: number;
  dir: 1 | -1;
  age: number;
}

const SLASH_MS = 160;
const SLASH_ALPHA = 0.55;
const MAX_SLASHES = 24;
const MAX_FX = 36;
const box = { x: 0, y: 0, w: 0, h: 0 };

/** Visuals for combat: slashes, projectile sprites, hit/dust/KO effects. Everything pooled and capped,
 *  and nothing uses timers or tweens, so a scene restart can't leave anything behind. */
export class CombatView {
  private slashes: Slash[] = [];
  private shotSprites: Phaser.GameObjects.Sprite[] = [];
  private fxPool: Phaser.GameObjects.Sprite[] = [];
  private fxSteal = 0;
  private puffs: { dust?: Phaser.GameObjects.Particles.ParticleEmitter; spark?: Phaser.GameObjects.Particles.ParticleEmitter; confetti?: Phaser.GameObjects.Particles.ParticleEmitter } = {};

  constructor(private scene: Phaser.Scene) {}

  swing(f: Fighter, range: number, dir: 1 | -1): void {
    const trail = `fx_${f.def.id}_trail`;
    if (HERO_FX[f.def.id] && this.scene.anims.exists(trail)) {
      // Codex weapon trail: 3 frames in a 160px cell, sized to the reach of the swing
      const r = meleeBox(f, dir, range, box);
      this.fx(trail, r.x + r.w / 2, r.y + r.h / 2, Math.max(0.8, (range * 1.5 + f.body.width) / 160), 7, 0.5, dir < 0);
      return;
    }
    let s = this.slashes.find((x) => !x.f);
    if (!s && this.slashes.length < MAX_SLASHES) {
      const img = this.scene.add.image(0, 0, this.scene.textures.exists('slash') ? 'slash' : 'proj').setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
      s = { img, f: null, range: 0, dir: 1, age: 0 };
      this.slashes.push(s);
    }
    if (!s) return;
    s.f = f;
    s.range = range;
    s.dir = dir;
    s.age = 0;
    s.img.setDisplaySize(range * 1.15, f.body.height * 0.95).setFlipX(dir < 0).setTint(f.def.trail ?? f.def.color).setActive(true).setVisible(true);
    this.placeSlash(s);
  }

  /** Per render frame: fade slashes, draw projectiles at their interpolated positions. */
  update(dt: number, shots: readonly Shot[], alpha: number): void {
    for (const s of this.slashes) {
      if (!s.f) continue;
      s.age += dt;
      if (s.age >= SLASH_MS || !s.f.alive) {
        s.f = null;
        s.img.setActive(false).setVisible(false);
        continue;
      }
      this.placeSlash(s);
      s.img.setAlpha(SLASH_ALPHA * (1 - s.age / SLASH_MS));
    }

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      let img = this.shotSprites[i];
      if (!img) img = this.shotSprites[i] = this.scene.add.sprite(0, 0, 'proj');
      const key = `fx_${shot.owner.def.id}_proj`;
      const art = this.scene.anims.exists(key) ? key : ''; // heroes and bosses that have projectile art
      if (img.getData('k') !== art) {
        img.setData('k', art);
        if (art) { img.setTexture(art); img.play(art); } else { img.stop(); img.setTexture('proj'); }
      }
      if (art) img.clearTint().setScale(0.4 * shot.move.size).setFlipX(shot.vx < 0);
      else img.setTint(shot.move.color).setScale(shot.move.size).setFlipX(false);
      img.setPosition(shot.prevX + (shot.x - shot.prevX) * alpha, shot.y).setDepth(6).setVisible(true);
    }
    for (let i = shots.length; i < this.shotSprites.length; i++) this.shotSprites[i].setVisible(false);
  }

  private placeSlash(s: Slash): void {
    const r = meleeBox(s.f!, s.dir, s.range, box);
    s.img.setPosition(r.x + r.w / 2, r.y + r.h / 2);
  }

  /** Knockout shockwave ring. */
  ring(x: number, y: number): void {
    if (this.scene.anims.exists('fx_ring')) this.fx('fx_ring', x, y, 3.5, 9);
  }

  /** Small grey puff for jumps and landings. */
  dust(x: number, y: number, count = 6): void {
    if (this.scene.anims.exists('fx_dust')) {
      this.fx('fx_dust', x, y, 1.3, 4, 1);
      return;
    }
    // fallback (no art): one shared emitter, never one per call
    const e = (this.puffs.dust ??= this.scene.add
      .particles(0, 0, 'proj', {
        speedX: { min: -100, max: 100 },
        speedY: { min: -70, max: -10 },
        lifespan: 300,
        scale: { start: 0.45, end: 0 },
        alpha: { start: 0.7, end: 0 },
        tint: 0xcbd5e1,
        emitting: false,
      })
      .setDepth(4));
    e.explode(count, x, y);
  }

  /** Hit effect: heavy hits use the shared heavy burst, otherwise the attacker's own melee / special impact, then the generic spark. */
  hit(x: number, y: number, power: number, by?: Fighter, special?: boolean): void {
    const id = by?.def.id;
    const hero = id ? `fx_${id}_${special ? 'shit' : 'hit'}` : ''; // the attacker's own impact art (heroes, and bosses that have it)
    if (power > 900 && this.scene.anims.exists('fx_hit_heavy')) this.fx('fx_hit_heavy', x, y, 1.0, 8);
    else if (hero && this.scene.anims.exists(hero)) this.fx(hero, x, y, special ? 0.85 : 0.9, 8);
    else this.spark(x, y);
  }

  /** Takeoff puff (ground jump) or the ring of a double jump. */
  jump(f: Fighter, grounded: boolean): void {
    const feet = f.body.bottom;
    if (grounded && this.scene.anims.exists('fx_dust_run')) this.fx('fx_dust_run', f.x, feet - 6, 0.9, 4, 0.5, f.facing < 0);
    else if (!grounded && this.scene.anims.exists('fx_jump_ring')) this.fx('fx_jump_ring', f.x, feet, 0.8, 4);
    else this.dust(f.x, feet, 5);
  }

  /** Landing dust, wider for harder landings. */
  land(f: Fighter, vy: number): void {
    if (this.scene.anims.exists('fx_dust_land')) this.fx('fx_dust_land', f.x, f.body.bottom - 10, vy > 700 ? 1.3 : 0.9, 4);
    else this.dust(f.x, f.body.bottom, 6);
  }

  /** Flash at the hands as a special leaves (heroes with a `charge` strip). */
  specialCast(f: Fighter): void {
    const key = `fx_${f.def.id}_charge`;
    if (this.scene.anims.exists(key)) this.fx(key, f.x + f.facing * f.body.width * 0.7, f.y - f.body.height * 0.1, 0.55, 7, 0.5, f.facing < 0);
  }

  /** A stock comes back: the teleport pad under the fighter's feet. */
  respawn(f: Fighter): void {
    if (this.scene.anims.exists('fx_respawn_pad')) this.fx('fx_respawn_pad', f.x, f.body.bottom + 6, 0.75, 4, 1, false);
  }

  /** Reinforcements arrive in a puff of smoke. */
  puff(x: number, y: number): void {
    if (this.scene.anims.exists('fx_smoke_puff')) this.fx('fx_smoke_puff', x, y, 1.1, 6);
    else this.dust(x, y, 8);
  }

  /** Power-up collected: a glow rising from the feet. */
  pickup(f: Fighter): void {
    if (this.scene.anims.exists('fx_pickup_glow')) this.fx('fx_pickup_glow', f.x, f.body.bottom + 4, 0.9, 6, 1, false);
    else this.spark(f.x, f.y - 20, 8);
  }

  /** Boss ground-pound: the boss's own shockwave art along the ground (drawn to the radius of the hit). */
  shock(x: number, y: number, r: number, bossId: string): void {
    const key = `fx_${bossId}_shock`;
    if (this.scene.anims.exists(key)) this.fx(key, x, y + 10, Math.max(1, (r * 2) / 256), 4, 0.72, false);
  }

  /** Ultimate wind-up: the hero's charge effect around them (Codex art, heroes that have it). */
  ultimateStart(f: Fighter): void {
    const id = f.def.id;
    if (this.scene.anims.exists(`fx_${id}_ulta`)) this.fx(`fx_${id}_ulta`, f.x, f.y, 1.5, 7, 0.5, false);
    if (this.scene.anims.exists(`fx_${id}_aura`)) this.fx(`fx_${id}_aura`, f.x, f.y, 1.6, 6, 0.5, false);
  }

  /** Ultimate blast: the hero's own burst, plus a heavy hit and the shockwave ring. */
  ultimate(f: Fighter): void {
    const id = f.def.id;
    if (this.scene.anims.exists(`fx_${id}_ultb`)) this.fx(`fx_${id}_ultb`, f.x, f.y, 1.6, 9, 0.5, false); // about the size of the blast radius without hiding the whole screen
    this.fx('fx_ko_blast', f.x, f.y, 1.3, 9, 0.5, false);
    if (HERO_FX[id]?.special && this.scene.anims.exists(`fx_${id}_shit`)) {
      this.fx(`fx_${id}_shit`, f.x - 110, f.y - 10, 1.1, 10);
      this.fx(`fx_${id}_shit`, f.x + 110, f.y - 10, 1.1, 10);
    }
    this.fx('fx_hit_heavy', f.x, f.y, 1.8, 8);
  }

  /** Knockout blast at the blast-zone edge, with a star shooting back toward the stage. */
  koBlast(x: number, y: number, towardX = x): void {
    if (this.scene.anims.exists('fx_ko_blast')) this.fx('fx_ko_blast', x, y, 1.5, 9);
    else this.spark(x, y, 24);
    if (this.scene.anims.exists('fx_ko_star')) this.fx('fx_ko_star', x + Math.sign(towardX - x) * 90, y - 30, 1.3, 10, 0.5, towardX < x);
  }

  spark(x: number, y: number, count = 10): void {
    const big = count > 15;
    const key = big ? 'fx_hit_medium' : 'fx_hit_small';
    if (this.scene.anims.exists(key)) {
      this.fx(key, x, y, big ? 1.7 : 1.0, 8);
      return;
    }
    if (this.scene.anims.exists('fx_burst')) {
      this.fx('fx_burst', x, y, count > 15 ? 2.6 : 1.5, 8);
      return;
    }
    const e = (this.puffs.spark ??= this.scene.add
      .particles(0, 0, 'proj', {
        speed: { min: 80, max: 300 },
        lifespan: 320,
        scale: { start: 0.7, end: 0 },
        emitting: false,
      })
      .setDepth(8));
    e.explode(count, x, y);
  }

  /** Victory confetti: Codex bursts around the point, plus one shared emitter of coloured scraps that fall. */
  confetti(x: number, y: number): void {
    if (this.scene.anims.exists('fx_confetti')) {
      this.fx('fx_confetti', x, y, 1.6, 12);
      this.fx('fx_confetti', x - 170, y + 40, 1.2, 12);
      this.fx('fx_confetti', x + 170, y + 40, 1.2, 12);
    }
    const e = (this.puffs.confetti ??= this.scene.add
      .particles(0, 0, 'proj', {
        speed: { min: 140, max: 520 },
        angle: { min: 200, max: 340 },
        gravityY: 700,
        lifespan: 1800,
        scale: { start: 0.5, end: 0.2 },
        rotate: { min: 0, max: 360 },
        tint: [0x2ee6d6, 0xffc857, 0xffa31a, 0x3ea6ff, 0x4dff88, 0xf6ead2],
        emitting: false,
      })
      .setDepth(12));
    e.explode(70, x, y);
  }

  /** Play a one-shot effect animation on a pooled sprite (capped at MAX_FX, oldest reused when full). */
  private fx(key: string, x: number, y: number, scale: number, depth: number, originY = 0.5, flip = Math.random() < 0.5): void {
    let s: Phaser.GameObjects.Sprite | undefined;
    for (const p of this.fxPool) if (!p.active) { s = p; break; }
    if (!s) {
      if (this.fxPool.length < MAX_FX) {
        s = this.scene.add.sprite(x, y, key);
        s.on('animationcomplete', () => s!.setActive(false).setVisible(false));
        this.fxPool.push(s);
      } else {
        s = this.fxPool[this.fxSteal++ % this.fxPool.length];
      }
    }
    s.setActive(true).setVisible(true).setPosition(x, y).setScale(scale).setDepth(depth).setOrigin(0.5, originY);
    s.setFlipX(flip); // random unless the caller needs a direction
    s.play(key);
  }

  /** Drop references; the scene's display list owns and destroys the objects. */
  destroy(): void {
    this.slashes.length = 0;
    this.shotSprites.length = 0;
    this.fxPool.length = 0;
    this.puffs = {};
  }
}

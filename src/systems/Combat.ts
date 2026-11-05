import Phaser from 'phaser';
import type { Fighter } from '../entities/Fighter';
import type { MoveDef, ProjectileDef } from '../data/types';

/** A live projectile. x / y / vx mirror the sprite (refreshed every frame) so AI code can read them cheaply. */
export interface Shot {
  sprite: Phaser.Physics.Arcade.Sprite;
  owner: Fighter;
  move: ProjectileDef;
  life: number;
  team: 'hero' | 'enemy';
  x: number;
  y: number;
  vx: number;
}

/** A swing waiting for its hitbox to go live, plus its fading slash visual. */
interface Swing {
  used: boolean;
  a: Fighter | null;
  move: MoveDef | null;
  range: number;
  dir: 1 | -1;
  age: number;
  windup: number;
  hitDone: boolean;
  slash: Phaser.GameObjects.Image;
}

const SLASH_MS = 160;
const SLASH_ALPHA = 0.55;
const MAX_SWINGS = 24;
const MAX_SHOTS = 32;
const MAX_FX = 36;

// Scratch rectangles: reused every frame instead of allocating per fighter / shot.
const hitbox = new Phaser.Geom.Rectangle();
const shotBox = new Phaser.Geom.Rectangle();
const bodyBox = new Phaser.Geom.Rectangle();

function bodyRect(f: Fighter): Phaser.Geom.Rectangle {
  const b = f.body;
  return bodyBox.setTo(b.x, b.y, b.width, b.height);
}

function setMeleeBox(a: Fighter, dir: number, range: number): Phaser.Geom.Rectangle {
  const b = a.body;
  return hitbox.setTo(dir > 0 ? b.right : b.left - range, b.y + b.height * 0.1, range, b.height * 0.8);
}

/** Hitboxes vs hurtboxes for melee swings and projectiles. All visuals are pooled and capped,
 *  and nothing uses timers or tweens, so a scene restart can't leave anything behind. */
export class Combat {
  readonly shots: Shot[] = [];

  private swings: Swing[] = [];
  private freeShots: Shot[] = [];
  private fxPool: Phaser.GameObjects.Sprite[] = [];
  private fxSteal = 0;
  private puffs: { dust?: Phaser.GameObjects.Particles.ParticleEmitter; spark?: Phaser.GameObjects.Particles.ParticleEmitter } = {};

  constructor(private scene: Phaser.Scene, private getFighters: () => Fighter[]) {}

  melee(a: Fighter): void {
    const m = a.def.melee;
    const range = m.range * a.def.scale;
    this.scene.events.emit('sfx:swing');

    let sw: Swing | undefined;
    for (const s of this.swings) if (!s.used) { sw = s; break; }
    if (!sw && this.swings.length < MAX_SWINGS) {
      const slash = this.scene.add.image(0, 0, this.scene.textures.exists('slash') ? 'slash' : 'proj').setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
      sw = { used: false, a: null, move: null, range: 0, dir: 1, age: 0, windup: 0, hitDone: false, slash };
      this.swings.push(sw);
    }
    if (!sw) return; // pool exhausted: skip the swing (can't happen at normal cooldowns)

    sw.used = true;
    sw.a = a;
    sw.move = m;
    sw.range = range;
    sw.dir = a.facing;
    sw.age = 0;
    sw.windup = m.windup ?? 70;
    sw.hitDone = false;
    const r = setMeleeBox(a, sw.dir, range);
    sw.slash.setDisplaySize(range * 1.15, a.body.height * 0.95).setFlipX(sw.dir < 0).setTint(a.def.trail ?? a.def.color).setPosition(r.centerX, r.centerY).setAlpha(SLASH_ALPHA).setActive(true).setVisible(true);
  }

  fire(a: Fighter): void {
    if (this.shots.length >= MAX_SHOTS) return;
    const s = a.def.special;
    const x = a.x + a.facing * a.body.halfWidth;
    const y = a.y - a.body.height * 0.1;
    let shot = this.freeShots.pop();
    if (shot) {
      shot.sprite.enableBody(true, x, y, true, true);
    } else {
      const sprite = this.scene.physics.add.sprite(x, y, 'proj');
      sprite.body.setAllowGravity(false);
      shot = { sprite, owner: a, move: s, life: 0, team: a.team, x, y, vx: 0 };
    }
    shot.sprite.setTint(s.color).setScale(s.size).setDepth(6).setActive(true).setVisible(true);
    shot.sprite.setVelocityX(a.facing * s.speed);
    shot.owner = a;
    shot.move = s;
    shot.life = s.life;
    shot.team = a.team;
    shot.x = x;
    shot.y = y;
    shot.vx = a.facing * s.speed;
    this.shots.push(shot);
    this.scene.events.emit('sfx:special');
  }

  update(dt: number): void {
    const fighters = this.getFighters();

    // melee swings: fade the slash, fire the hitbox once after the wind-up
    for (const sw of this.swings) {
      if (!sw.used) continue;
      sw.age += dt;
      const a = sw.a!;
      if (!sw.hitDone && sw.age >= sw.windup) {
        sw.hitDone = true;
        if (a.alive && a.hitstun <= 0) {
          const r = setMeleeBox(a, sw.dir, sw.range);
          sw.slash.setPosition(r.centerX, r.centerY);
          for (const t of fighters) {
            if (t.team === a.team || !t.alive) continue;
            if (Phaser.Geom.Intersects.RectangleToRectangle(r, bodyRect(t))) this.hit(t, sw.move!, a.x);
          }
        }
      }
      if (sw.age >= SLASH_MS && sw.hitDone) {
        sw.used = false;
        sw.a = null;
        sw.slash.setActive(false).setVisible(false);
      } else {
        sw.slash.setAlpha(SLASH_ALPHA * Math.max(0, 1 - sw.age / SLASH_MS));
      }
    }

    // projectiles
    for (let n = this.shots.length - 1; n >= 0; n--) {
      const s = this.shots[n];
      s.life -= dt;
      s.x = s.sprite.x;
      s.y = s.sprite.y;
      s.vx = s.sprite.body?.velocity.x ?? 0;
      let done = s.life <= 0;
      if (!done) {
        const r = 8 * s.move.size;
        shotBox.setTo(s.x - r, s.y - r, r * 2, r * 2);
        for (const t of fighters) {
          if (t.team === s.owner.team || !t.alive) continue;
          if (Phaser.Geom.Intersects.RectangleToRectangle(shotBox, bodyRect(t)) && this.hit(t, s.move, s.x)) {
            done = true;
            break;
          }
        }
      }
      if (done) {
        s.sprite.disableBody(true, true); // inactive + invisible, kept for reuse
        this.freeShots.push(s);
        this.shots[n] = this.shots[this.shots.length - 1];
        this.shots.pop();
      }
    }
  }

  /** Drop all references. The scene's display list owns the actual objects and destroys them. */
  destroy(): void {
    this.swings.length = 0;
    this.shots.length = 0;
    this.freeShots.length = 0;
    this.fxPool.length = 0;
    this.puffs = {};
  }

  private hit(target: Fighter, move: MoveDef, fromX: number): boolean {
    if (!target.takeHit(move, fromX)) return false;
    this.spark(target.x, target.y);
    return true;
  }

  /** Knockout shockwave ring. */
  ring(x: number, y: number): void {
    if (this.scene.anims.exists('fx_ring')) this.fx('fx_ring', x, y, 3.5, 9);
  }

  /** Play a one-shot effect animation on a pooled sprite (capped at MAX_FX, oldest reused when full). */
  private fx(key: string, x: number, y: number, scale: number, depth: number, originY = 0.5): void {
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
    s.setFlipX(Math.random() < 0.5);
    s.play(key);
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

  spark(x: number, y: number, count = 10): void {
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
}

import type { Fighter } from '../entities/Fighter';
import type { MoveDef, ProjectileDef } from '../data/types';
import type { World } from '../sim/World';

/** A live projectile: plain data, moved by World.step. x / y are the centre. */
export interface Shot {
  owner: Fighter;
  move: ProjectileDef;
  life: number;
  team: 'hero' | 'enemy';
  x: number;
  y: number;
  vx: number;
  /** position at the start of the last tick (render interpolation) */
  prevX: number;
}

/** A swing waiting for its hitbox to go live. */
interface Swing {
  used: boolean;
  a: Fighter | null;
  move: MoveDef | null;
  range: number;
  dir: 1 | -1;
  age: number;
  windup: number;
  dmgMul: number;
}

const MAX_SWINGS = 24;
const MAX_SHOTS = 32;

/** Axis-aligned box, reused (no per-tick allocation). */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const hitbox: Box = { x: 0, y: 0, w: 0, h: 0 };
const shotBox: Box = { x: 0, y: 0, w: 0, h: 0 };

const overlaps = (a: Box, f: Fighter): boolean => {
  const b = f.body;
  return a.x < b.right && a.x + a.w > b.left && a.y < b.bottom && a.y + a.h > b.top;
};

/** The melee hitbox in front of a fighter (also used by the view to place the slash). */
export function meleeBox(a: Fighter, dir: number, range: number, out: Box = hitbox): Box {
  const b = a.body;
  out.x = dir > 0 ? b.right : b.left - range;
  out.y = b.y + b.height * 0.1;
  out.w = range;
  out.h = b.height * 0.8;
  return out;
}

/** Hitboxes vs hurtboxes for melee swings and projectiles. Pure simulation: visuals live in CombatView,
 *  which hears about swings/hits through World events and draws `shots` each frame. */
export class Combat {
  readonly shots: Shot[] = [];

  private swings: Swing[] = [];
  private freeShots: Shot[] = [];

  constructor(private world: World) {}

  melee(a: Fighter): void {
    const m = a.def.melee;
    const range = m.range * a.def.scale * a.meleeRangeMul;
    if (this.world.predicting) {
      this.world.emit({ k: 'swing', f: a, range, dir: a.facing }); // client prediction: show the swing, the host decides what it hits
      return;
    }
    let sw: Swing | undefined;
    for (const s of this.swings) if (!s.used) { sw = s; break; }
    if (!sw && this.swings.length < MAX_SWINGS) {
      sw = { used: false, a: null, move: null, range: 0, dir: 1, age: 0, windup: 0, dmgMul: 1 };
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
    sw.dmgMul = a.meleeDamageMul;
    this.world.emit({ k: 'swing', f: a, range, dir: a.facing });
  }

  /** `move` overrides the fighter's special (power-up rounds), `yOff` shifts the shot up/down (DDoS lanes, minigun spread), `quiet` skips the sound event. */
  fire(a: Fighter, move?: ProjectileDef, yOff = 0, quiet = false): void {
    if (this.world.predicting) {
      if (!quiet) this.world.emit({ k: 'special', f: a }); // client prediction: the shot itself comes from the host
      return;
    }
    if (this.shots.length >= MAX_SHOTS) return;
    const s = move ?? a.def.special;
    const x = a.x + a.facing * a.body.halfWidth;
    const y = a.y - a.body.height * 0.1 + yOff;
    const shot = this.freeShots.pop() ?? { owner: a, move: s, life: 0, team: a.team, x, y, vx: 0, prevX: x };
    shot.owner = a;
    shot.move = s;
    shot.life = s.life;
    shot.team = a.team;
    shot.x = shot.prevX = x;
    shot.y = y;
    shot.vx = a.facing * s.speed;
    this.shots.push(shot);
    if (!quiet) this.world.emit({ k: 'special', f: a });
  }

  /** Move projectiles (part of the physics phase, before fighters act). */
  move(dt: number): void {
    const s = dt / 1000;
    for (const shot of this.shots) {
      shot.prevX = shot.x;
      shot.x += shot.vx * s;
    }
  }

  /** Resolve hits: swings whose wind-up just ended, and projectiles. */
  update(dt: number): void {
    const fighters = this.world.fighters;

    for (const sw of this.swings) {
      if (!sw.used) continue;
      sw.age += dt;
      if (sw.age < sw.windup) continue;
      const a = sw.a!;
      if (a.alive && a.hitstun <= 0) {
        const r = meleeBox(a, sw.dir, sw.range);
        for (const t of fighters) {
          if (t.team === a.team || !t.alive) continue;
          if (overlaps(r, t)) t.takeHit(sw.move!, a.x, a, sw.dmgMul);
        }
      }
      sw.used = false;
      sw.a = null;
    }

    for (let n = this.shots.length - 1; n >= 0; n--) {
      const s = this.shots[n];
      s.life -= dt;
      let done = s.life <= 0;
      if (!done) {
        const r = 8 * s.move.size;
        shotBox.x = s.x - r;
        shotBox.y = s.y - r;
        shotBox.w = shotBox.h = r * 2;
        for (const t of fighters) {
          if (t.team === s.owner.team || !t.alive) continue;
          if (overlaps(shotBox, t) && t.takeHit(s.move, s.x, s.owner)) {
            done = true;
            break;
          }
        }
      }
      if (done) {
        this.freeShots.push(s);
        this.shots[n] = this.shots[this.shots.length - 1];
        this.shots.pop();
      }
    }
  }
}

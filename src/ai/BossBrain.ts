import type { BossPattern } from '../data/types';
import type { Bot } from '../entities/Bot';
import type { Fighter } from '../entities/Fighter';

type Move = 'barrage' | 'charge' | 'leap' | 'quake' | 'summon';

/** Each boss rotates through a small moveset built around its data-defined signature pattern, so fights are not one loop.
 *  (BossPattern only names the signature; the extra moves are tuned here. every/duration still come from bosses.ts.) */
const SEQ: Record<BossPattern['kind'], Move[]> = {
  barrage: ['barrage', 'leap', 'barrage', 'charge'],
  charge: ['charge', 'barrage', 'leap', 'charge'],
  summon: ['summon', 'barrage', 'quake', 'charge'],
  quake: ['quake', 'charge', 'summon', 'barrage'],
};

/** Telegraph length (boss freezes, faces the target and flashes), and the exhausted "punish window" after the move. */
const WARN: Record<Move, number> = { barrage: 650, charge: 750, leap: 550, quake: 700, summon: 700 };
const TIRED: Record<Move, number> = { barrage: 250, charge: 800, leap: 600, quake: 900, summon: 500 };
/** Flash colour per move so players can read which one is coming: red = shots, yellow = charge, cyan = jump slam. */
const FLASH: Record<Move, number> = { barrage: 0xff6b6b, charge: 0xffe066, leap: 0x7dd3fc, quake: 0xffa31a, summon: 0x9b5cff };
const LEAP_MS = 1100;

type Phase = 'idle' | 'warn' | 'act' | 'tired';

/** Boss-only signature moves layered on top of the normal bot states. */
export class BossBrain {
  private timer: number;
  private phase: Phase = 'idle';
  private t = 0;
  private n = 0; // index into SEQ
  private move: Move = 'barrage';
  private airborne = false;
  private summoned = false;
  private readonly seq: Move[];

  constructor(private pattern: BossPattern) {
    this.seq = SEQ[pattern.kind];
    this.timer = pattern.every;
  }

  /** Returns true while the pattern is in control of the boss's inputs. */
  update(self: Bot, target: Fighter | null, dt: number): boolean {
    const i = self.intent;
    if (this.phase === 'idle') {
      // enraged below half stocks: moves come 50% more often
      this.timer -= self.stocks <= self.def.stocks / 2 ? dt * 1.5 : dt;
      if (this.timer <= 0 && target) {
        this.move = this.seq[this.n++ % this.seq.length];
        this.timer = this.pattern.every; // start-to-start spacing
        this.phase = 'warn';
        this.t = WARN[this.move];
      }
      return false;
    }

    // a big launch interrupts the move (small chip hits do not, or five allies would lock the boss out forever)
    if (self.hitstun > 260) {
      this.cancel(self);
      return false;
    }

    this.t -= dt;
    i.dir = 0;
    if (target) self.facing = target.x > self.x ? 1 : -1;

    switch (this.phase) {
      case 'warn':
        self.tint = Math.floor(this.t / 110) % 2 ? FLASH[this.move] : 0xffffff;
        if (this.t <= 0) {
          self.tint = null;
          this.phase = 'act';
          this.airborne = false;
          this.summoned = false;
          this.t = this.move === 'leap' || this.move === 'quake' ? LEAP_MS : this.move === 'summon' ? 700 : this.pattern.duration;
        }
        return true;
      case 'act':
        if (this.t <= 0 || !target) return this.finish(self);
        this.act(self, target);
        return true;
      default: // tired
        self.tint = 0xb8b8c8;
        if (this.t <= 0) {
          self.tint = null;
          this.phase = 'idle';
          return false;
        }
        return true;
    }
  }

  cancel(self: Bot): void {
    if (this.phase === 'idle') return;
    this.phase = 'idle';
    self.speedMul = 1;
    self.tint = null;
  }

  private finish(self: Bot): boolean {
    self.speedMul = 1;
    this.phase = 'tired';
    this.t = TIRED[this.move];
    return true;
  }

  private act(self: Bot, target: Fighter): void {
    const i = self.intent;
    const dx = target.x - self.x;
    const toward = dx > 0 ? 1 : -1;
    const reach = self.def.melee.range * self.def.scale;
    if (this.move === 'barrage') {
      i.special = true;
    } else if (this.move === 'charge') {
      self.speedMul = 2.6;
      i.dir = toward;
      if (Math.abs(dx) < reach + self.body.halfWidth + target.body.halfWidth) i.attack = true;
    } else if (this.move === 'quake') {
      // ground-pound: jump at the target, slam down, shockwave along the floor (jump over it!)
      self.speedMul = 1.5;
      i.dir = toward;
      if (!this.airborne) {
        if (self.grounded) i.jump = true;
        else this.airborne = true;
      } else if (self.grounded) {
        self.world.shockwave(self);
        this.t = 0;
      }
    } else if (this.move === 'summon') {
      i.dir = 0;
      if (!this.summoned) {
        this.summoned = true;
        self.world.summon(self, self.stocks <= self.def.stocks / 2 ? 3 : 2);
      }
    } else {
      // leap: jump at the target and swing on the way down
      self.speedMul = 2;
      i.dir = toward;
      if (!this.airborne) {
        if (self.grounded) i.jump = true;
        else this.airborne = true;
      } else {
        if (self.body.vy > 0 && Math.abs(dx) < reach + 60) i.attack = true;
        if (self.grounded) this.t = 0; // landed: move over
      }
    }
  }
}

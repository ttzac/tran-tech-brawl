import Phaser from 'phaser';
import type { WaveDef } from '../data/types';

/** Drops waves of minions into the fight on a timer, capped at a max alive.
 *  A wave is spread over evenly spaced slots (with jitter, randomly shuffled) so minions do not land in one clump. */
export class Spawner {
  private timer: number;
  wave = 0;

  constructor(
    private cfg: WaveDef,
    private spawn: (x: number) => void,
    private aliveCount: () => number,
    private xRange: [number, number],
  ) {
    this.timer = cfg.firstDelay;
  }

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.cfg.interval;
    const n = Math.min(this.cfg.count, this.cfg.max - this.aliveCount());
    if (n <= 0) return;
    this.wave++;
    const [lo, hi] = this.xRange;
    const slot = (hi - lo) / n;
    const offset = Phaser.Math.Between(0, n - 1); // rotate which slot is first so side order varies
    for (let i = 0; i < n; i++) {
      const s = (i + offset) % n;
      this.spawn(Math.round(lo + slot * (s + 0.15 + Math.random() * 0.7)));
    }
  }
}

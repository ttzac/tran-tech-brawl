/** Small seeded PRNG (mulberry32). Every gameplay roll goes through the World's Rng so a match is
 *  reproducible from its seed + inputs (needed for network play and tests). Cosmetic randomness may still use Math.random. */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** 0 <= n < 1 */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Current internal state (for snapshots / debugging). */
  get state(): number {
    return this.s;
  }
}

export const randomSeed = (): number => (Math.random() * 4294967296) >>> 0;

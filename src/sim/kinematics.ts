import type { StageDef } from '../data/types';

/** Fixed simulation step: 60 ticks per second. */
export const TICK_MS = 1000 / 60;
export const GRAVITY = 1400; // px/s²
export const MAX_VX = 1100;
export const MAX_VY = 1300;
/** Arcade-style tolerance: how far (px) a body may already be inside a surface and still be pushed back out of the side it came from. */
const BIAS = 4;

/** Static platform as an AABB. Soft platforms are one-way (land from above, drop through). */
export interface Platform {
  left: number;
  right: number;
  top: number;
  bottom: number;
  solid: boolean;
}

/** Stage platforms are centre-based (x, y = middle); convert once per match. */
export function platformsOf(stage: StageDef): Platform[] {
  return stage.platforms.map((p) => ({ left: p.x - p.w / 2, right: p.x + p.w / 2, top: p.y - p.h / 2, bottom: p.y + p.h / 2, solid: p.solid }));
}

/** Axis-aligned physics body. x / y are the top-left corner (px), velocities in px/s. Pure data: no Phaser. */
export class Body {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  grounded = false;
  /** the surface under the feet is a solid platform (not a drop-through one) */
  groundSolid = false;
  /** fall through soft (one-way) platforms this step */
  dropThrough = false;
  /** position before the last step (top-left) */
  prevX = 0;
  prevY = 0;

  constructor(
    readonly width: number,
    /** mutable: ducking shrinks the box with the feet pinned */
    public height: number,
    public gravity = true,
  ) {}

  get left(): number {
    return this.x;
  }
  get right(): number {
    return this.x + this.width;
  }
  get top(): number {
    return this.y;
  }
  get bottom(): number {
    return this.y + this.height;
  }
  get halfWidth(): number {
    return this.width / 2;
  }
  get centerX(): number {
    return this.x + this.width / 2;
  }
  get centerY(): number {
    return this.y + this.height / 2;
  }
}

/** Semi-implicit Euler like Arcade physics: gravity into velocity, clamp, move, then push out of platforms
 *  (top first, so standing bodies re-land every step and stay `grounded`). dt in ms. */
export function stepBody(b: Body, dt: number, platforms: readonly Platform[]): void {
  const s = dt / 1000;
  b.prevX = b.x;
  b.prevY = b.y;
  if (b.gravity) b.vy += GRAVITY * s;
  if (b.vx > MAX_VX) b.vx = MAX_VX;
  else if (b.vx < -MAX_VX) b.vx = -MAX_VX;
  if (b.vy > MAX_VY) b.vy = MAX_VY;
  else if (b.vy < -MAX_VY) b.vy = -MAX_VY;
  b.x += b.vx * s;
  b.y += b.vy * s;
  b.grounded = false;
  b.groundSolid = false;

  for (const p of platforms) {
    if (b.right <= p.left || b.left >= p.right || b.bottom <= p.top || b.top >= p.bottom) continue;
    const prevBottom = b.prevY + b.height;
    if (!p.solid) {
      // one-way: only land when falling onto it from above (8px grace) and not dropping through
      if (!b.dropThrough && b.vy >= 0 && prevBottom <= p.top + 8) land(b, p);
      continue;
    }
    // solid: resolve from the side we came from
    if (prevBottom <= p.top + BIAS && b.vy >= 0) land(b, p);
    else if (b.prevY >= p.bottom - BIAS && b.vy <= 0) {
      b.y = p.bottom; // bonk your head
      b.vy = 0;
    } else if (b.prevX + b.width <= p.left + BIAS) {
      b.x = p.left - b.width;
      if (b.vx > 0) b.vx = 0;
    } else if (b.prevX >= p.right - BIAS) {
      b.x = p.right;
      if (b.vx < 0) b.vx = 0;
    } else {
      // already embedded (teleport, huge launch): leave by the shortest way out
      const up = b.bottom - p.top;
      const down = p.bottom - b.top;
      const left = b.right - p.left;
      const right = p.right - b.left;
      const m = Math.min(up, down, left, right);
      if (m === up) land(b, p);
      else if (m === down) {
        b.y = p.bottom;
        b.vy = Math.max(0, b.vy);
      } else if (m === left) {
        b.x = p.left - b.width;
        b.vx = Math.min(0, b.vx);
      } else {
        b.x = p.right;
        b.vx = Math.max(0, b.vx);
      }
    }
  }
}

function land(b: Body, p: Platform): void {
  b.y = p.top - b.height;
  if (b.vy > 0) b.vy = 0;
  b.grounded = true;
  b.groundSolid = p.solid;
}

/** A grabbable platform corner. `side` -1 = the platform's left edge (a fighter hangs on its left), +1 = the right edge. */
export interface Ledge {
  x: number;
  y: number;
  side: -1 | 1;
  /** id of the fighter hanging here, 0 = free (one fighter per ledge, like Smash) */
  holder: number;
}

/** Every solid platform has a ledge on each end. */
export function ledgesOf(platforms: readonly Platform[]): Ledge[] {
  const out: Ledge[] = [];
  for (const p of platforms) {
    if (!p.solid) continue;
    out.push({ x: p.left, y: p.top, side: -1, holder: 0 }, { x: p.right, y: p.top, side: 1, holder: 0 });
  }
  return out;
}

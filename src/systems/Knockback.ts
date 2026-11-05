import type { MoveDef } from '../data/types';

export interface Launch {
  vx: number;
  vy: number;
  stun: number; // ms of hitstun
  power: number;
}

/** Smash-style: launch power grows with the victim's damage %, shrinks with weight.
 *  Balance note: Fighter caps velocity at 1100/axis, so stun time is what turns a big launch into a KO:
 *  longer stun = more uncontrolled travel before the victim can steer back (tools/balance/sim.mts).
 *  Stun now scales 140 + 0.42*power up to 800ms (was 0.25 up to 650), so ~150% hits from a boss can end a stock
 *  while 0-60% hits still only flinch (<=300ms). */
export function launch(damage: number, move: MoveDef, weight: number, dir: 1 | -1): Launch {
  const power = Math.min(1600, (move.knockback + damage * move.scaling) / weight);
  const angle = ((move.angle ?? 40) * Math.PI) / 180;
  return {
    vx: dir * Math.cos(angle) * power,
    vy: -Math.sin(angle) * power,
    stun: Math.min(800, 140 + power * 0.42),
    power,
  };
}

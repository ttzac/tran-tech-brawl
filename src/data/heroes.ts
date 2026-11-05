import type { FighterDef } from './types';
// Hero numbers: Knockback.ts stun scaling is what makes KOs reachable; see tools/balance/sim.mts.

// TranTech crew. Zac and Chain have real art (frames drawn at 0.15 of the source, shown at scale 0.9, so `range` is in
// pre-scale px). The third slot is still the Sysadmin Tank placeholder until Aiden's art exists.
// windup values match the contact / release frame of each hero's animation (4 melee frames at 80 ms, 3 special frames at 100 ms).
export const heroes: FighterDef[] = [
  {
    id: 'zac',
    name: 'Zac',
    role: 'All-rounder',
    color: 0x2ee6d6,
    trail: 0x7ff6ea,
    scale: 0.9,
    speed: 260,
    jumpVelocity: 640,
    jumps: 2,
    weight: 1,
    stocks: 3,
    melee: { name: 'Quick Fix', damage: 8, knockback: 260, scaling: 7, cooldown: 330, range: 53, windup: 160 },
    special: { name: 'Ticket Escalation', damage: 6, knockback: 220, scaling: 6, cooldown: 900, speed: 520, size: 1, color: 0xffc857, life: 1400, windup: 100 },
  },
  {
    id: 'chain',
    name: 'Chain',
    role: 'Fast & light',
    color: 0x19d3c5,
    trail: 0x8ff7ee,
    scale: 0.9,
    speed: 330,
    jumpVelocity: 680,
    jumps: 3,
    weight: 0.8,
    stocks: 3,
    melee: { name: 'Layer Cut', damage: 7, knockback: 240, scaling: 7, cooldown: 230, range: 66, windup: 160 },
    special: { name: 'Remote Print', damage: 4, knockback: 160, scaling: 5, cooldown: 600, speed: 760, size: 0.7, color: 0xffa31a, life: 1100, windup: 100 },
  },
  {
    id: 'sysadmin',
    name: 'Sysadmin Tank',
    role: 'Heavy hitter',
    color: 0xf97316,
    scale: 1.15,
    speed: 200,
    jumpVelocity: 600,
    jumps: 2,
    weight: 1.4,
    stocks: 3,
    melee: { name: 'Hard Reboot', damage: 12, knockback: 330, scaling: 9, cooldown: 520, range: 44 },
    special: { name: 'Blue Screen', damage: 10, knockback: 300, scaling: 9, cooldown: 1400, speed: 360, size: 1.7, color: 0x2563eb, life: 1800 },
  },
];

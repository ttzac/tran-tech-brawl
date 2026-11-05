import type { FighterDef, MeleeDef } from './types';

export type Slot = 'weapon' | 'item' | 'powerup';
export const SLOTS: Slot[] = ['weapon', 'item', 'powerup'];

export type Rarity = 'common' | 'rare' | 'epic';
export const RARITIES: Rarity[] = ['common', 'rare', 'epic'];
export const RARITY_COLOR: Record<Rarity, number> = { common: 0x94a3b8, rare: 0x38bdf8, epic: 0xc084fc };
export const RARITY_LABEL: Record<Rarity, string> = { common: 'COMMON', rare: 'RARE', epic: 'EPIC' };

/** Multipliers (x) unless noted. All optional. */
export interface Mods {
  speed?: number;
  jumpVelocity?: number;
  weight?: number;
  jumps?: number; // added, not multiplied
  meleeDamage?: number;
  meleeKnockback?: number;
  meleeRange?: number;
  meleeCooldown?: number; // <1 = swings faster
  specialDamage?: number;
  specialKnockback?: number;
  specialCooldown?: number;
  specialSize?: number; // projectile size (bigger = easier to hit)
}

export interface ItemDef {
  id: string;
  slot: Slot;
  name: string;
  icon: string; // emoji
  desc: string;
  rarity: Rarity;
  /** weapons only: replaces these melee fields (the swing animation/windup stays the hero's own) */
  melee?: Partial<Omit<MeleeDef, 'windup'>>;
  mods?: Mods;
}

export const ITEMS: ItemDef[] = [
  // ---- weapons (replace the melee attack) ----
  { id: 'default', slot: 'weapon', rarity: 'common', name: 'Signature', icon: '🛠️', desc: "The hero's own weapon. Balanced." },
  { id: 'cable', slot: 'weapon', rarity: 'common', name: 'Ethernet Cable', icon: '🔌', desc: 'Long reach and quick, but lighter hits.',
    melee: { name: 'Cable Whip', damage: 6, knockback: 220, scaling: 6, cooldown: 260, range: 60 } },
  { id: 'screwdriver', slot: 'weapon', rarity: 'common', name: 'Screwdriver', icon: '🪛', desc: 'Very fast jabs, short reach, low knockback.',
    melee: { name: 'Quick Jab', damage: 5, knockback: 170, scaling: 5, cooldown: 170, range: 30 } },
  { id: 'keyboard', slot: 'weapon', rarity: 'common', name: 'Mech Keyboard', icon: '⌨️', desc: 'Clacky and reliable. Slightly quicker than average.',
    melee: { name: 'Keyboard Smash', damage: 7, knockback: 235, scaling: 7, cooldown: 270, range: 36 } },
  { id: 'server', slot: 'weapon', rarity: 'rare', name: 'Rack Server', icon: '🖥️', desc: 'Slow and brutal. Big launch power.',
    melee: { name: 'Server Slam', damage: 14, knockback: 340, scaling: 10, cooldown: 620, range: 44 } },
  { id: 'mallet', slot: 'weapon', rarity: 'rare', name: 'Rubber Mallet', icon: '🔨', desc: 'Pops foes steeply upward. Medium speed.',
    melee: { name: 'Percussive Fix', damage: 10, knockback: 290, scaling: 8, cooldown: 450, range: 42, angle: 65 } },
  { id: 'solder', slot: 'weapon', rarity: 'rare', name: 'Soldering Iron', icon: '🔥', desc: 'Burns damage on fast. Barely launches.',
    melee: { name: 'Hot Joint', damage: 11, knockback: 140, scaling: 4, cooldown: 300, range: 32, angle: 25 } },
  { id: 'fibre', slot: 'weapon', rarity: 'epic', name: 'Fibre Whip', icon: '💡', desc: 'Light-speed lash. Long, fast and punchy.',
    melee: { name: 'Light Speed', damage: 8, knockback: 285, scaling: 8, cooldown: 280, range: 54 } },

  // ---- items (passive gear) ----
  { id: 'none', slot: 'item', rarity: 'common', name: 'Empty', icon: '➖', desc: 'No item equipped.' },
  { id: 'headset', slot: 'item', rarity: 'common', name: 'Headset', icon: '🎧', desc: 'Focus. +8% speed.', mods: { speed: 1.08 } },
  { id: 'coffee', slot: 'item', rarity: 'common', name: 'Coffee Mug', icon: '☕', desc: 'Jittery. +15% speed, -8% weight.', mods: { speed: 1.15, weight: 0.92 } },
  { id: 'boots', slot: 'item', rarity: 'common', name: 'Steel Boots', icon: '🥾', desc: 'Planted. +18% weight, -5% speed.', mods: { weight: 1.18, speed: 0.95 } },
  { id: 'lanyard', slot: 'item', rarity: 'common', name: 'Staff Lanyard', icon: '🪪', desc: 'Swing it. +12% melee reach, +5% melee launch.', mods: { meleeRange: 1.12, meleeKnockback: 1.05 } },
  { id: 'toolbelt', slot: 'item', rarity: 'rare', name: 'Toolbelt', icon: '🧰', desc: 'One extra air jump.', mods: { jumps: 1 } },
  { id: 'duck', slot: 'item', rarity: 'rare', name: 'Rubber Duck', icon: '🦆', desc: 'Debugs the jump. +8% jump height, specials 10% faster.', mods: { jumpVelocity: 1.08, specialCooldown: 0.9 } },
  { id: 'energy', slot: 'item', rarity: 'rare', name: 'Energy Drink', icon: '🥤', desc: '+10% speed, swings 8% faster, -5% weight.', mods: { speed: 1.1, meleeCooldown: 0.92, weight: 0.95 } },
  { id: 'watch', slot: 'item', rarity: 'epic', name: 'Smartwatch', icon: '⌚', desc: 'Optimised routine. +6% speed, +6% jump, swings 7% faster.', mods: { speed: 1.06, jumpVelocity: 1.06, meleeCooldown: 0.93 } },

  // ---- powerups ----
  { id: 'none', slot: 'powerup', rarity: 'common', name: 'Empty', icon: '➖', desc: 'No powerup equipped.' },
  { id: 'surge', slot: 'powerup', rarity: 'common', name: 'Surge Protector', icon: '🛡️', desc: '+25% weight. Much harder to launch.', mods: { weight: 1.25 } },
  { id: 'ups', slot: 'powerup', rarity: 'common', name: 'UPS Battery', icon: '🔋', desc: 'Backup power. +12% weight, +5% jump height.', mods: { weight: 1.12, jumpVelocity: 1.05 } },
  { id: 'overclock', slot: 'powerup', rarity: 'rare', name: 'Overclock', icon: '⚡', desc: 'Specials recharge 35% faster.', mods: { specialCooldown: 0.65 } },
  { id: 'turbo', slot: 'powerup', rarity: 'rare', name: 'Turbo Boost', icon: '🚀', desc: '+25% melee damage, +10% speed.', mods: { meleeDamage: 1.25, speed: 1.1 } },
  { id: 'phish', slot: 'powerup', rarity: 'rare', name: 'Phishing Lure', icon: '🎣', desc: 'Specials are 40% bigger and launch 15% further.', mods: { specialSize: 1.4, specialKnockback: 1.15 } },
  { id: 'defrag', slot: 'powerup', rarity: 'rare', name: 'Defrag', icon: '🧹', desc: 'Melee swings 20% faster, +10% melee reach.', mods: { meleeCooldown: 0.8, meleeRange: 1.1 } },
  { id: 'zeroday', slot: 'powerup', rarity: 'epic', name: 'Zero Day', icon: '💀', desc: 'Specials hit 50% harder and launch further.', mods: { specialDamage: 1.5, specialKnockback: 1.3 } },
  { id: 'root', slot: 'powerup', rarity: 'epic', name: 'Root Access', icon: '👑', desc: '+15% melee and special damage, +5% speed and weight.', mods: { meleeDamage: 1.15, specialDamage: 1.15, speed: 1.05, weight: 1.05 } },
];

export const itemsFor = (slot: Slot): ItemDef[] => ITEMS.filter((i) => i.slot === slot);
export const findItem = (slot: Slot, id: string): ItemDef | undefined => ITEMS.find((i) => i.slot === slot && i.id === id);

export interface Loadout {
  weapon: string;
  item: string;
  powerup: string;
}
export const DEFAULT_LOADOUT: Loadout = { weapon: 'default', item: 'none', powerup: 'none' };

/** Replaces unknown or stale ids with the slot default. Always returns a fresh, valid Loadout. */
export function sanitizeLoadout(l: unknown): Loadout {
  const src = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>;
  const out: Loadout = { ...DEFAULT_LOADOUT };
  for (const s of SLOTS) {
    const id = src[s];
    if (typeof id === 'string' && findItem(s, id)) out[s] = id;
  }
  return out;
}

/** Returns a new FighterDef with the loadout's weapon and modifiers applied. Unknown ids are ignored. */
export function applyLoadout(def: FighterDef, l: Loadout): FighterDef {
  const out: FighterDef = { ...def, melee: { ...def.melee }, special: { ...def.special } };
  const weapon = findItem('weapon', l.weapon);
  if (weapon?.melee) out.melee = { ...out.melee, ...weapon.melee };
  for (const it of [findItem('item', l.item), findItem('powerup', l.powerup)]) {
    const m = it?.mods;
    if (!m) continue;
    out.speed *= m.speed ?? 1;
    out.jumpVelocity *= m.jumpVelocity ?? 1;
    out.weight *= m.weight ?? 1;
    out.jumps += m.jumps ?? 0;
    out.melee.damage *= m.meleeDamage ?? 1;
    out.melee.knockback *= m.meleeKnockback ?? 1;
    out.melee.range *= m.meleeRange ?? 1;
    out.melee.cooldown *= m.meleeCooldown ?? 1;
    out.special.damage *= m.specialDamage ?? 1;
    out.special.knockback *= m.specialKnockback ?? 1;
    out.special.cooldown *= m.specialCooldown ?? 1;
    out.special.size *= m.specialSize ?? 1;
  }
  return out;
}

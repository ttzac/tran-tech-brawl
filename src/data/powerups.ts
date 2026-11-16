import type { ProjectileDef } from './types';

/** Pickups that fall out of the sky in Brawl and Dungeon matches. Data-driven: add one here, give it an effect
 *  in `Fighter` (timed) or `World.applyInstant` (instant), and Codex draws its icon (`items/pickup_<id>`). */
export type PowerId = 'ap' | 'espresso' | 'ups' | 'cat6' | 'ddos' | 'duck' | 'firewall' | 'patch' | 'reboot' | 'ticket';

export interface PowerDef {
  id: PowerId;
  name: string;
  /** emoji stand-in drawn on the crate until Codex's icon is imported */
  icon: string;
  color: number;
  /** shown when you grab it */
  blurb: string;
  /** timed effect length in ms; 0 = instant */
  ms: number;
  /** drop weight: higher = more common */
  weight: number;
}

export const POWERS: Record<PowerId, PowerDef> = {
  ap: { id: 'ap', name: 'UniFi AP Minigun', icon: '📡', color: 0x2ee6d6, ms: 9000, weight: 10, blurb: 'Mesh topology, now with extra bullets' },
  espresso: { id: 'espresso', name: 'Triple Espresso', icon: '☕', color: 0xffa31a, ms: 10000, weight: 14, blurb: 'Speed x1.45, swings faster, mild regret' },
  ups: { id: 'ups', name: 'UPS Battery Pack', icon: '🔋', color: 0x4dff88, ms: 8000, weight: 12, blurb: 'Brownout-proof: nearly unlaunchable' },
  cat6: { id: 'cat6', name: 'Cat6 Mega Whip', icon: '🔌', color: 0x3ea6ff, ms: 10000, weight: 12, blurb: 'Double reach, extra pain, certified to 10 gig' },
  ddos: { id: 'ddos', name: 'DDoS Cannon', icon: '💥', color: 0xff5a5f, ms: 9000, weight: 8, blurb: 'Five lanes of unsolicited traffic' },
  duck: { id: 'duck', name: 'Rubber Duck Debugger', icon: '🦆', color: 0xffe066, ms: 12000, weight: 10, blurb: 'Explains the jump so well you gain two more' },
  firewall: { id: 'firewall', name: 'Firewall', icon: '🧱', color: 0xff8a5c, ms: 3500, weight: 5, blurb: 'Blocks everything, including fun' },
  patch: { id: 'patch', name: 'Patch Tuesday', icon: '🩹', color: 0x9b5cff, ms: 0, weight: 12, blurb: 'Installs updates: -50% damage. Do not reboot' },
  reboot: { id: 'reboot', name: 'Turn It Off And On', icon: '🔄', color: 0xf6ead2, ms: 0, weight: 7, blurb: 'Freezes every foe nearby. Fixes everything' },
  ticket: { id: 'ticket', name: 'P1 Ticket Closed', icon: '🎫', color: 0xffc857, ms: 0, weight: 2, blurb: 'Resolved on first contact: +1 stock' },
};
export const POWER_IDS = Object.keys(POWERS) as PowerId[];
export const isTimed = (id: PowerId): boolean => POWERS[id].ms > 0;

/** Stat changes while a timed power is held. All multipliers, `jumps` is added. */
export interface PowerMods {
  speed?: number;
  weight?: number;
  meleeRange?: number;
  meleeDamage?: number;
  meleeCooldown?: number;
  jumps?: number;
  jumpVelocity?: number;
}
export const POWER_MODS: Partial<Record<PowerId, PowerMods>> = {
  espresso: { speed: 1.45, meleeCooldown: 0.8 },
  ups: { weight: 5 },
  cat6: { meleeRange: 2, meleeDamage: 1.4 },
  duck: { jumps: 2, jumpVelocity: 1.1 },
};

/** The AP minigun's rounds: tiny, fast, many. */
export const PACKET: ProjectileDef = { name: 'Packet', damage: 2.4, knockback: 90, scaling: 2.4, cooldown: 0, speed: 950, size: 0.45, color: 0x2ee6d6, life: 650 };
export const MINIGUN_ROUNDS = 12;
export const MINIGUN_GAP_MS = 55;
/** DDoS lanes: vertical offsets (px) of the five parallel shots. */
export const DDOS_LANES = [-64, -32, 0, 32, 64];

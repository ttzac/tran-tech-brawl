import type { Loadout, Mods, Rarity } from './items';

/** Dungeon Crawler data. A run is FLOORS floors; each floor is a small branching map (LAYERS columns of rooms, then a boss).
 *  The rules that turn this data + a seed into a run live in `src/sim/crawl.ts` (no Phaser, seeded RNG only).
 *  Add content here: a relic, a room kind's numbers or a room modifier, and it is in rotation. */
export const FLOORS = 3;
/** Columns of rooms to pick a path through before the floor's boss. */
export const LAYERS = 4;
export const MAX_RUN_STOCKS = 5;
export const START_STOCKS = 3;
/** Solo Crawl: just the hero, no AI allies, on a longer winding map ("the Gauntlet"): more rooms per floor, mostly one road with
 *  the odd fork, a guaranteed Break Room / Elite choice mid-floor. One extra stock and softer enemies make up for the missing party. */
export const SOLO_LAYERS = 6;
export const SOLO_START_STOCKS = 4;
/** Enemy damage multiplier and wave-size trim in Solo Crawl (nobody to share the hits with). */
export const SOLO_ENEMY_DAMAGE = 0.85;

// ---- relics ---------------------------------------------------------------------------------------

export interface Relic {
  id: string;
  name: string;
  icon: string;
  desc: string;
  rarity: Rarity;
  mods?: Mods;
  /** extra stocks gained when picked */
  stocks?: number;
  /** ultimate meter (0-100) you start every room with; stacks */
  startUlt?: number;
}

/** Run upgrades, themed on the stuff an IT shop is full of. Stack freely. Codex draws `items/relic_<id>`. */
export const RELICS: Relic[] = [
  { id: 'psu', name: 'Redundant PSU', icon: '🔌', rarity: 'rare', stocks: 1, desc: '+1 stock. If one dies, the other carries on.' },
  { id: 'chair', name: 'Ergonomic Chair', icon: '🪑', rarity: 'common', mods: { weight: 1.18 }, desc: '+18% weight. Lumbar support for your hitbox.' },
  { id: 'switches', name: 'Hot-swap Switches', icon: '⌨️', rarity: 'common', mods: { meleeCooldown: 0.84 }, desc: 'Melee 16% faster. Thocky.' },
  { id: 'backbone', name: 'Fibre Backbone', icon: '💡', rarity: 'rare', mods: { specialDamage: 1.4, specialKnockback: 1.1 }, desc: 'Specials hit 40% harder.' },
  { id: 'cablemgmt', name: 'Cable Management', icon: '🧵', rarity: 'common', mods: { meleeRange: 1.22 }, desc: '+22% melee reach. Velcro ties everywhere.' },
  { id: 'standing', name: 'Standing Desk', icon: '🧍', rarity: 'common', mods: { jumpVelocity: 1.07 }, desc: '+7% jump height. Up, up, up.' },
  { id: 'monitor', name: 'Second Monitor', icon: '🖥️', rarity: 'rare', mods: { jumps: 1 }, desc: 'One extra air jump. Productivity doubled.' },
  { id: 'coffee', name: 'Spare Coffee', icon: '☕', rarity: 'common', mods: { speed: 1.12 }, desc: '+12% speed. Mostly jitters.' },
  { id: 'overtime', name: 'Unpaid Overtime', icon: '⏰', rarity: 'epic', mods: { meleeDamage: 1.28, speed: 1.05 }, desc: '+28% melee damage, +5% speed. Zero thanks.' },
  { id: 'zerotrust', name: 'Zero Trust', icon: '🛡️', rarity: 'rare', mods: { weight: 1.3, speed: 0.95 }, desc: '+30% weight, -5% speed. Verify everything.' },
  { id: 'overclock', name: 'Liquid Cooling', icon: '🧊', rarity: 'rare', mods: { specialCooldown: 0.65 }, desc: 'Specials recharge 35% faster.' },
  { id: 'phish', name: 'Phishing Net', icon: '🎣', rarity: 'common', mods: { specialSize: 1.35 }, desc: 'Specials are 35% bigger.' },
  { id: 'root', name: 'Domain Admin', icon: '👑', rarity: 'epic', mods: { meleeDamage: 1.15, specialDamage: 1.15, speed: 1.05, weight: 1.05 }, desc: 'A bit of everything. Do not tell the auditors.' },
  { id: 'runbook', name: 'Incident Runbook', icon: '📕', rarity: 'rare', startUlt: 50, desc: 'Start every room with half an ultimate. Page 1: do not panic.' },
  { id: 'sla', name: 'Gold SLA', icon: '🥇', rarity: 'epic', startUlt: 100, mods: { meleeDamage: 1.08 }, desc: 'Start every room with a full ultimate, +8% melee damage.' },
];
export const relicById = (id: string): Relic | undefined => RELICS.find((r) => r.id === id);
/** How often each rarity is offered (before a room's boost). */
export const RARITY_WEIGHT: Record<Rarity, number> = { common: 6, rare: 3, epic: 1 };

// ---- rooms ----------------------------------------------------------------------------------------

export type RoomKind = 'skirmish' | 'horde' | 'elite' | 'rest' | 'boss';

export interface RoomKindDef {
  name: string;
  icon: string;
  color: number;
  blurb: string;
  /** false = no fight, just the reward screen */
  fight: boolean;
  /** how often the map generator picks it (0 = placed by rule, never rolled) */
  weight: number;
  /** first map column it may appear in */
  minLayer: number;
  /** rare / epic relics are this many times more likely after the room */
  relicBoost: number;
  /** flat score for clearing it */
  score: number;
}

export const ROOM_KINDS: Record<RoomKind, RoomKindDef> = {
  skirmish: { name: 'Skirmish', icon: '⚔️', color: 0x38bdf8, fight: true, weight: 5, minLayer: 0, relicBoost: 1, score: 200, blurb: 'A room guardian and its bots. Beat the guardian.' },
  horde: { name: 'Horde', icon: '🐜', color: 0xf59e0b, fight: true, weight: 3, minLayer: 0, relicBoost: 1.5, score: 300, blurb: 'Waves of mixed bots. Clear enough of them and the pack leader shows up.' },
  elite: { name: 'Elite Pack', icon: '💀', color: 0xf43f5e, fight: true, weight: 2, minLayer: 1, relicBoost: 4, score: 500, blurb: 'A guardian with lieutenants. Hard fight, better relics.' },
  rest: { name: 'Break Room', icon: '☕', color: 0x4ade80, fight: false, weight: 0, minLayer: 2, relicBoost: 1, score: 0, blurb: 'No fight. Patch up a stock, or raid the spare-parts shelf.' },
  boss: { name: 'Boss', icon: '👹', color: 0xc084fc, fight: true, weight: 0, minLayer: 99, relicBoost: 3, score: 1000, blurb: 'The floor boss. Beat it to go down a floor (and get a stock back).' },
};

export type ModId = 'swarm' | 'armoured' | 'frenzy' | 'overclocked' | 'supply';

/** A twist on a fight room. Enemy numbers are multipliers; wave numbers are added. */
export interface RoomMod {
  id: ModId;
  name: string;
  icon: string;
  blurb: string;
  /** rooms cleared in the run before it can show up */
  minDepth: number;
  enemy?: { speed?: number; weight?: number; damage?: number; cooldown?: number };
  waves?: { count?: number; max?: number; interval?: number };
  /** crates fall this often (ms) instead of the usual 15 s */
  crateEvery?: number;
  /** room score multiplier */
  scoreMul: number;
}

export const ROOM_MODS: RoomMod[] = [
  { id: 'supply', name: 'Supply Drop', icon: '📦', minDepth: 0, crateEvery: 6000, scoreMul: 1, blurb: 'Power-up crates rain down.' },
  { id: 'swarm', name: 'Swarm', icon: '🐝', minDepth: 1, waves: { count: 1, max: 2, interval: 0.8 }, scoreMul: 1.3, blurb: 'Bigger, faster waves.' },
  { id: 'armoured', name: 'Armoured', icon: '🧱', minDepth: 2, enemy: { weight: 1.35 }, scoreMul: 1.3, blurb: 'Enemies are much harder to launch.' },
  { id: 'frenzy', name: 'Frenzy', icon: '🔥', minDepth: 3, enemy: { speed: 1.18, cooldown: 0.8 }, scoreMul: 1.4, blurb: 'Enemies move and swing faster.' },
  { id: 'overclocked', name: 'Overclocked', icon: '⚡', minDepth: 4, enemy: { damage: 1.3, weight: 0.85 }, scoreMul: 1.4, blurb: 'Enemies hit 30% harder but fly further.' },
];
export const modById = (id: ModId | undefined): RoomMod | undefined => ROOM_MODS.find((m) => m.id === id);

// ---- run state (plain data: safe to pass between scenes, save or send) ---------------------------------

export interface MapNode {
  /** index into FloorMap.nodes */
  id: number;
  /** column, 0..LAYERS (the last column is the boss) */
  layer: number;
  /** row within the column, and how many rows the column has (for drawing) */
  lane: number;
  lanes: number;
  kind: RoomKind;
  mod?: ModId;
  /** ids of the rooms you can go to from here */
  next: number[];
}

export interface FloorMap {
  floor: number;
  /** biome of this floor's rooms (a procgen theme id) */
  theme: string;
  nodes: MapNode[];
  /** columns of rooms before the boss column (default LAYERS) */
  layers?: number;
  /** Solo Crawl's winding map */
  solo?: boolean;
}

export interface RunState {
  seed: number;
  heroId: string;
  /** Solo Crawl: no AI allies, the winding solo map */
  solo?: boolean;
  /** the gear the run started with (Character Manager) */
  loadout: Loadout;
  floor: number; // 0-based
  /** node the player is in on this floor's map; -1 = at the stairs, choosing the first room */
  at: number;
  /** nodes visited on this floor, in order */
  path: number[];
  /** rooms cleared over the whole run (drives difficulty) */
  cleared: number;
  stocks: number;
  relics: string[];
  score: number;
  kos: number;
  bestCombo: number;
  /** ms spent fighting over the whole run */
  timeMs: number;
  /** set when the last boss falls */
  done?: boolean;
  /** set when the hero is out of stocks */
  dead?: boolean;
}

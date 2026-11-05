export interface MoveDef {
  name: string;
  damage: number; // % added to the victim
  knockback: number; // base launch power
  scaling: number; // extra launch power per 1% damage
  cooldown: number; // ms
  angle?: number; // launch angle in degrees (default 40)
}

export interface MeleeDef extends MoveDef {
  range: number; // px in front of the fighter (before scale)
  windup?: number; // ms before the hitbox goes live (default 70). Match your attack animation.
}

export interface ProjectileDef extends MoveDef {
  speed: number;
  size: number; // sprite scale
  color: number;
  life: number; // ms
  windup?: number; // ms from the start of the special animation until the projectile leaves (match the release frame)
}

export interface FighterDef {
  id: string;
  name: string;
  role: string;
  color: number;
  trail?: number; // colour of the melee slash (defaults to color)
  scale: number;
  speed: number;
  jumpVelocity: number;
  jumps: number; // total jumps incl. the ground jump (2 = double jump)
  weight: number; // heavier = launched less
  stocks: number;
  melee: MeleeDef;
  special: ProjectileDef;
}

export interface BotSkill {
  reactionMs: number; // how often the bot makes decisions
  specialChance: number; // 0-1 chance to use special when lined up
  dodgeChance: number; // 0-1 chance to dodge an incoming shot
}

export interface WaveDef {
  firstDelay: number;
  interval: number;
  count: number; // minions per wave
  max: number; // max minions alive at once
}

export interface BossPattern {
  kind: 'barrage' | 'charge';
  every: number; // ms between uses
  duration: number; // ms the pattern lasts
}

export interface BossDef {
  id: string;
  name: string;
  title: string;
  stageId: string;
  fighter: FighterDef;
  skill: BotSkill;
  pattern: BossPattern;
  minion: FighterDef;
  minionSkill: BotSkill;
  waves: WaveDef;
}

export interface StageDef {
  id: string;
  name: string;
  width: number;
  height: number;
  bg: number;
  rack: number;
  platforms: { x: number; y: number; w: number; h: number; solid: boolean }[];
  spawns: { x: number; y: number }[];
  blast: { left: number; right: number; top: number; bottom: number };
  ground: { left: number; right: number; top: number };
  /** optional art: texture names from STAGE_IMAGES */
  art?: { solid: string; soft: string; backdrop: string[] }; // backdrop layers, bottom to top
}

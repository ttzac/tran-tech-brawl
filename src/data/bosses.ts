import type { BossDef } from './types';
// Balance (tools/balance/sim.mts): hero KO'd by a boss in ~7-11 hits, boss takes ~30-45 hits per stock; sim fight ~90s at 90%+ win,
// real bots miss more so expect ~2-3 min. Boss weight 3.3-3.6 + 4 stocks keeps it tanky; boss launch scaling is high so 100-150% hurts.

// All parody characters. Rename freely.
export const bosses: BossDef[] = [
  {
    id: 'altwave',
    name: 'Chairman Altwave',
    title: 'Controls the swarm of chatbots',
    stageId: 'serverroom',
    fighter: {
      id: 'altwave', name: 'Chairman Altwave', role: 'Boss', color: 0x8b5cf6,
      scale: 1, speed: 150, jumpVelocity: 600, jumps: 2, weight: 3.3, stocks: 4,
      melee: { name: 'Hostile Takeover', damage: 11, knockback: 380, scaling: 12, cooldown: 700, range: 68, windup: 260 },
      special: { name: 'Prompt Flood', damage: 6, knockback: 260, scaling: 9, cooldown: 520, speed: 430, size: 1, color: 0xc4b5fd, life: 1600 },
    },
    skill: { reactionMs: 160, specialChance: 0.5, dodgeChance: 0.3 },
    pattern: { kind: 'barrage', every: 7000, duration: 2200 },
    minion: {
      id: 'chatbot', name: 'Chatbot', role: 'Minion', color: 0x14b8a6,
      scale: 1, speed: 170, jumpVelocity: 600, jumps: 2, weight: 0.7, stocks: 1,
      melee: { name: 'Hallucinate', damage: 5, knockback: 200, scaling: 6, cooldown: 800, range: 30 },
      special: { name: 'Autocomplete', damage: 3, knockback: 120, scaling: 4, cooldown: 2500, speed: 380, size: 0.6, color: 0x5eead4, life: 1200 },
    },
    minionSkill: { reactionMs: 320, specialChance: 0.15, dodgeChance: 0.05 },
    waves: { firstDelay: 3000, interval: 9000, count: 2, max: 4 },
  },
  {
    id: 'muskbot',
    name: 'Mecha Musk-Bot',
    title: 'Pilots a giant laser robot',
    stageId: 'rooftop',
    fighter: {
      id: 'muskbot', name: 'Mecha Musk-Bot', role: 'Boss', color: 0xef4444,
      scale: 1, speed: 130, jumpVelocity: 580, jumps: 2, weight: 3.6, stocks: 4,
      melee: { name: 'Robo Stomp', damage: 13, knockback: 400, scaling: 13, cooldown: 800, range: 84, windup: 300 },
      special: { name: 'Laser Eyes', damage: 7, knockback: 280, scaling: 10, cooldown: 700, speed: 760, size: 0.8, color: 0xfca5a5, life: 1400 },
    },
    skill: { reactionMs: 140, specialChance: 0.6, dodgeChance: 0.35 },
    pattern: { kind: 'charge', every: 6000, duration: 1500 },
    minion: {
      id: 'neurobot', name: 'Neuro-Bot', role: 'Minion', color: 0xf472b6,
      scale: 1, speed: 200, jumpVelocity: 620, jumps: 2, weight: 0.75, stocks: 1,
      melee: { name: 'Zap', damage: 5, knockback: 210, scaling: 6, cooldown: 700, range: 30 },
      special: { name: 'Spark', damage: 3, knockback: 130, scaling: 4, cooldown: 2200, speed: 460, size: 0.6, color: 0xf9a8d4, life: 1100 },
    },
    minionSkill: { reactionMs: 280, specialChance: 0.2, dodgeChance: 0.1 },
    waves: { firstDelay: 3000, interval: 8000, count: 2, max: 4 },
  },
];

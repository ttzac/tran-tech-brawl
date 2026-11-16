import type { Fighter } from '../entities/Fighter';
import type { PowerId } from '../data/powerups';

/** Things that happened during a tick that the view (sound, effects, camera) or the network layer needs to hear about.
 *  The sim never touches Phaser: it appends events and FightScene plays them after each tick. */
export type SimEvent =
  | { k: 'ultimate'; f: Fighter; phase: 'start' | 'burst' } // hero ultimate: animation starts / blast goes off
  | { k: 'special'; f: Fighter } // projectile left the hands
  | { k: 'land'; f: Fighter; vy: number; dust: boolean }
  | { k: 'jump'; f: Fighter; grounded: boolean }
  | { k: 'swing'; f: Fighter; range: number; dir: 1 | -1 }
  | { k: 'hit'; f: Fighter; power: number; dmg?: number; crit?: boolean; by?: Fighter; special?: boolean } // by = attacker, special = hit by a projectile (view picks the hero's hit effect)
  | { k: 'blast'; f: Fighter; x: number; y: number; killer?: Fighter | null } // left the blast zone (KO)
  | { k: 'spawn'; f: Fighter }
  | { k: 'despawn'; f: Fighter }
  | { k: 'end'; won: boolean }
  // ---- new in the Smash + dopamine update ----
  | { k: 'combo'; f: Fighter; n: number } // attacker is on an n-hit chain
  | { k: 'streak'; f: Fighter; n: number } // attacker has n KOs in a row without dying
  | { k: 'ledge'; f: Fighter; kind: 'grab' | 'climb' | 'jump' | 'drop'; n: number }
  | { k: 'pickup'; f: Fighter; power: PowerId }
  | { k: 'crate'; x: number; y: number; power: PowerId } // a crate dropped
  | { k: 'shock'; x: number; y: number; r: number } // boss ground-pound shockwave
  | { k: 'summon'; f: Fighter } // boss called reinforcements
  | { k: 'arrive'; f: Fighter } // horde room: the pack leader dropped in
  | { k: 'freeze'; x: number; y: number; r: number }; // "turn it off and on again"

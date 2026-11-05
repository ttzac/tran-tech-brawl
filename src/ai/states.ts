import type { Bot } from '../entities/Bot';
import type { Fighter } from '../entities/Fighter';
import type { StageDef } from '../data/types';

export type BotState = 'approach' | 'attack' | 'dodge' | 'recover';

export interface BrainCtx {
  self: Bot;
  target: Fighter | null;
  stage: StageDef;
  threat: number; // direction (-1/1) of an incoming shot, 0 if none
}

/** A state mutates self.intent and returns the next state (or nothing to stay). The ctx object is reused: never keep it. */
export type StateFn = (c: BrainCtx) => BotState | void;

/** True when the bot is off the stage (past an edge, or below the stage top surface) and should fly back. */
export function needsRecovery(self: Fighter, stage: StageDef): boolean {
  const g = stage.ground;
  return self.x < g.left - 20 || self.x > g.right + 20 || self.body.bottom > g.top + 30;
}

/** Stay this far inside the stage edge when walking (AI never walks itself off). */
export const EDGE_MARGIN = 36;

const reach = (s: Fighter, t: Fighter) => s.def.melee.range * s.def.scale + s.body.halfWidth + t.body.halfWidth;

export const STATES: Record<BotState, StateFn> = {
  approach({ self: s, target: t, threat }) {
    const i = s.intent;
    if (!t) {
      i.dir = 0;
      return;
    }
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dist = Math.abs(dx);
    const r = reach(s, t);
    const face = dx > 0 ? 1 : -1;

    if (s.retreat > 0) {
      // short back-step after a swing so fights have spacing instead of face-hugging
      s.retreat--;
      i.dir = (-face) as 1 | -1;
      return;
    }

    // each bot has its own standoff (stopFrac) so a group fans out rather than stacking on one pixel
    i.dir = dist < r * s.stopFrac ? 0 : face;
    const nudge = s.crowdNudge();
    if (nudge !== 0 && dist > r * 0.5) i.dir = nudge;
    s.facing = face;

    if (dy < -70 && s.grounded && Math.random() < 0.5) i.jump = true; // target is above
    if (dy > 90 && dist < 140) i.drop = true; // target is on a lower platform

    if (threat !== 0 && Math.random() < s.skill.dodgeChance) return 'dodge';

    if (s.specialCd <= 0 && dist > 200 && dist < 700 && Math.abs(dy) < 60 && Math.random() < s.skill.specialChance) {
      i.special = true;
    }
    if (dist < r && Math.abs(dy) < s.body.height * 1.3) return 'attack';
  },

  attack({ self: s, target: t }) {
    if (!t) return 'approach';
    const i = s.intent;
    const roll = Math.random();
    s.facing = t.x > s.x ? 1 : -1;
    i.dir = 0;
    if (roll < 0.12 && s.specialCd <= 0) i.special = true; // point-blank shot
    else i.attack = true;
    if (!s.isBoss) {
      if (roll > 0.55 && roll < 0.68 && s.grounded && Math.abs(t.y - s.y) < 40) i.jump = true; // jump-in swing
      else if (roll > 0.78) s.retreat = roll > 0.92 ? 2 : 1; // hit and step back
    }
    return 'approach';
  },

  // Shots travel horizontally, so the dodge is a hop (plus, usually, a step toward the shooter to close in).
  dodge({ self: s, threat }) {
    s.intent.dir = threat !== 0 && Math.random() < 0.6 ? ((-threat) as 1 | -1) : 0;
    if (s.jumpsLeft > 0) s.intent.jump = true;
    return 'approach';
  },

  recover({ self: s, stage }) {
    const g = stage.ground;
    const i = s.intent;
    const cx = (g.left + g.right) / 2;
    // underneath the stage slab: go out to the nearest side first, then climb back (heading for the middle would hit the slab)
    const under = s.body.bottom > g.top + 10 && s.x > g.left - 10 && s.x < g.right + 10;
    i.dir = under ? (s.x < cx ? -1 : 1) : s.x < cx ? 1 : -1;
    s.facing = i.dir;
    // all jumps give the same height, so use them as soon as we are falling; not while still under the slab
    if (s.body.velocity.y > 0 && s.jumpsLeft > 0 && (!under || s.x < g.left || s.x > g.right)) i.jump = true;
    if (s.grounded) return 'approach';
  },
};

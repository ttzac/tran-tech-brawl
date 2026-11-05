import Phaser from 'phaser';
import type { BotSkill, FighterDef, StageDef } from '../data/types';
import { BossBrain } from '../ai/BossBrain';
import { EDGE_MARGIN, STATES, needsRecovery, type BotState, type BrainCtx } from '../ai/states';
import { Fighter, type Team } from './Fighter';

export interface ThinkCtx {
  foes: Fighter[];
  stage: StageDef;
  /** world positions + horizontal velocity of enemy projectiles */
  shots: { x: number; y: number; vx: number }[];
  // (already filtered to enemy-team shots)
}

/** Allies prefer the boss when its distance (x this) beats the nearest minion: "boss first when close". */
const BOSS_BIAS = 0.6;
/** Extra distance (px) per teammate already on a foe, so groups spread over targets instead of piling on one. */
const LOAD_PENALTY = 120;

/** AI fighter driven by a tiny state machine (approach / attack / dodge / recover). */
export class Bot extends Fighter {
  state: BotState = 'approach';
  target: Fighter | null = null;
  /** ticks of back-stepping left (set by the attack state) */
  retreat = 0;
  /** preferred standoff as a fraction of melee reach (0.55-0.9), random per bot so groups fan out */
  readonly stopFrac = 0.55 + Math.random() * 0.35;

  private static roster: Bot[] = [];
  private thinkTimer = Phaser.Math.Between(0, 200);
  private retargetTimer = 0;
  private jumpCd = 0;
  /** reused every think: no per-frame allocation */
  private readonly bctx: BrainCtx;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    def: FighterDef,
    team: Team,
    readonly skill: BotSkill,
    private brain?: BossBrain,
  ) {
    super(scene, x, y, def, team);
    this.bctx = { self: this, target: null, stage: undefined as unknown as StageDef, threat: 0 };
    Bot.roster.push(this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      const n = Bot.roster.indexOf(this);
      if (n >= 0) Bot.roster.splice(n, 1);
    });
  }

  get isBoss(): boolean {
    return this.brain !== undefined;
  }

  think(dt: number, ctx: ThinkCtx): void {
    if (!this.alive) return;
    const i = this.intent;
    i.jump = i.attack = i.special = i.drop = false;
    this.jumpCd = Math.max(0, this.jumpCd - dt);

    this.retargetTimer -= dt;
    if (this.retargetTimer <= 0 || !this.target?.alive) {
      this.retargetTimer = 400;
      this.target = this.pickTarget(ctx.foes);
    }

    const recovering = needsRecovery(this, ctx.stage);
    if (recovering) {
      this.brain?.cancel(this);
      this.state = 'recover';
      this.fillCtx(ctx);
      STATES.recover(this.bctx);
    } else if (this.brain?.update(this, this.target, dt)) {
      // boss pattern has control this frame
    } else {
      if (this.state === 'recover') this.state = 'approach';
      this.thinkTimer -= dt;
      if (this.thinkTimer <= 0) {
        this.thinkTimer = this.skill.reactionMs;
        this.fillCtx(ctx);
        this.state = STATES[this.state](this.bctx) ?? this.state;
      }
    }

    // Never walk off the stage edge on purpose (every frame, since intent persists between decisions).
    if (!recovering) {
      const g = ctx.stage.ground;
      if ((i.dir > 0 && this.x > g.right - EDGE_MARGIN) || (i.dir < 0 && this.x < g.left + EDGE_MARGIN)) i.dir = 0;
    }

    // Don't burn every air jump at once.
    if (i.jump) {
      if (this.jumpCd > 0) i.jump = false;
      else this.jumpCd = 380;
    }
  }

  /** Direction (-1/1) to step aside when overlapping a teammate that stands closer than we do; 0 if free. */
  crowdNudge(): -1 | 0 | 1 {
    for (const b of Bot.roster) {
      if (b === this || !b.alive || b.team !== this.team) continue;
      if (Math.abs(b.x - this.x) < 24 && Math.abs(b.y - this.y) < 50 && this.stopFrac > b.stopFrac) return b.x <= this.x ? 1 : -1;
    }
    return 0;
  }

  private pickTarget(foes: Fighter[]): Fighter | null {
    const hero = this.team === 'hero';
    let best: Fighter | null = null;
    let bestScore = Infinity;
    for (const f of foes) {
      if (!f.alive) continue;
      const boss = f instanceof Bot && f.isBoss;
      let score = Math.hypot(this.x - f.x, this.y - f.y);
      if (hero && boss) score *= BOSS_BIAS;
      if (!boss) score += this.loadOn(f) * LOAD_PENALTY;
      if (f === this.target) score *= 0.8; // hysteresis: don't flip-flop between near-equal foes
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    return best;
  }

  private loadOn(f: Fighter): number {
    let n = 0;
    for (const b of Bot.roster) if (b !== this && b.alive && b.team === this.team && b.target === f) n++;
    return n;
  }

  private fillCtx(ctx: ThinkCtx): void {
    let threat = 0;
    for (const s of ctx.shots) {
      const dx = this.x - s.x;
      if (Math.abs(dx) < 170 && Math.abs(s.y - this.y) < 40 && Math.sign(dx) === Math.sign(s.vx)) {
        threat = Math.sign(s.vx);
        break;
      }
    }
    const c = this.bctx;
    c.target = this.target;
    c.stage = ctx.stage;
    c.threat = threat;
  }
}

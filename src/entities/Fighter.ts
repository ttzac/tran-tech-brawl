import type { FighterDef, MoveDef } from '../data/types';
import { ART, fighterBox } from '../data/art';
import { launch } from '../systems/Knockback';
import { Body, type Ledge } from '../sim/kinematics';
import type { World } from '../sim/World';
import { DDOS_LANES, MINIGUN_GAP_MS, MINIGUN_ROUNDS, PACKET, POWER_MODS, POWERS, type PowerId, type PowerMods } from '../data/powerups';

/** Snapshot of a fighter's own simulation state (see Fighter.capture). */
export interface FighterMemo {
  x: number; y: number; vx: number; vy: number; prevX: number; prevY: number; height: number; grounded: boolean; groundSolid: boolean; gravity: boolean;
  facing: 1 | -1; hitstun: number; invuln: number; attackCd: number; specialCd: number; dropTimer: number;
  jumpsLeft: number; flash: number; action: 'melee' | 'special' | 'ultimate' | null; actionSeq: number; ducking: boolean; hanging: boolean;
  ledgeGrabs: number; power: PowerId | null; powerMs: number; ult: number; ultMs: number; ultBurst: boolean;
  hang: Ledge | null; hangMs: number; ledgeCd: number; wasGrounded: boolean; lastVy: number;
  fireTimer: number; burstLeft: number; burstGap: number; fx: number; fy: number;
}

export type Team = 'hero' | 'enemy';

export interface Intent {
  dir: -1 | 0 | 1;
  jump: boolean; // one-tick pulses
  /** held: on a drop-through platform = fall through it; on solid ground = duck; on a ledge = let go */
  drop: boolean;
  attack: boolean;
  special: boolean;
  /** one-tick pulse: fire the ultimate (needs a full meter) */
  ultimate: boolean;
}

export const emptyIntent = (): Intent => ({ dir: 0, jump: false, drop: false, attack: false, special: false, ultimate: false });

/** Ultimate: the meter fills as heroes deal (x0.9) and take (x0.35) damage. At ULT_MAX press the ultimate button: the hero is
 *  invulnerable for ULT_WIND_MS playing the 6-frame ultimate animation, and the blast goes off ULT_BURST_AT ms before it ends. */
export const ULT_MAX = 100;
export const ULT_WIND_MS = 660;
export const ULT_BURST_AT = 330; // = start of ultimate frame 4 ("RELEASE") at 110 ms a frame

const frame = (dt: number) => dt / 16.667;

/** Smash-style ledge rules: you may grab at most this many times before you touch down again. */
export const LEDGE_MAX_GRABS = 2;
/** Ledge hang: how long you can dangle, and how long you can't re-grab after letting go (ms). */
const LEDGE_MAX_HANG = 3600;
const LEDGE_REGRAB_CD = 450;
/** Ducking shrinks the hurtbox to this fraction of standing height. */
export const DUCK_FRAC = 0.55;
/** A hit within this window of the last one extends the attacker's combo (ms). */
const COMBO_WINDOW = 1500;
/** Chance a hit is a crit (x1.6 damage). Seeded rng, so still deterministic. */
const CRIT_CHANCE = 0.07;

/** Simulation-side fighter: movement, jumping, ducking, ledge grabs, attacks, power-ups, damage %, stocks. Plain data + logic, no Phaser,
 *  so the same code runs on a network host, in tests and (later) in a worker. FighterView draws it.
 *  Bot extends it; human fighters are plain Fighters whose intent is filled by an input source. */
export class Fighter {
  readonly id: number;
  readonly def: FighterDef;
  readonly team: Team;
  readonly world: World;
  readonly body: Body;
  /** distance from the sprite centre (x, y) down to the feet */
  readonly foot: number;
  /** real art present: specials wait for their wind-up (release frame) */
  readonly hasArt: boolean;

  damage = 0;
  stocks: number;
  facing: 1 | -1 = 1;
  intent: Intent = emptyIntent();
  alive = true;
  speedMul = 1;

  hitstun = 0;
  invuln = 0;
  attackCd = 0;
  specialCd = 0;
  dropTimer = 0;
  jumpsLeft: number;
  spawn: { x: number; y: number };
  /** ms of white hit-flash left */
  flash = 0;
  /** boss telegraph colour (view tints the sprite), null = none */
  tint: number | null = null;
  /** last move started, and a counter that ticks each time one starts (the view restarts the animation on change) */
  action: 'melee' | 'special' | 'ultimate' | null = null;
  actionSeq = 0;
  /** sprite-centre position at the start of the last tick (for render interpolation) */
  prevX: number;
  prevY: number;

  // ---- new mechanics -------------------------------------------------------------------------
  /** crouching on solid ground (smaller hurtbox, can't walk). Replicated to clients. */
  ducking = false;
  /** hanging off a platform corner. Replicated to clients. */
  hanging = false;
  /** ledge grabs used since last touching down (max LEDGE_MAX_GRABS) */
  ledgeGrabs = 0;
  /** held timed power-up (null = none) and ms left. Replicated to clients. */
  power: PowerId | null = null;
  powerMs = 0;
  /** ultimate meter 0..ULT_MAX (heroes only; replicated), ms of the ultimate animation left, and whether its blast already went off */
  ult = 0;
  ultMs = 0;
  private ultBurst = false;

  /** view-only: how far the sprite is drawn from the fighter while a network prediction error is smoothed away */
  offX = 0;
  offY = 0;

  // ---- dopamine bookkeeping ------------------------------------------------------------------
  /** hits landed in the current chain, and ms until it drops */
  combo = 0;
  comboMs = 0;
  bestCombo = 0;
  /** who hit us last (kill credit) and for how long that still counts (ms) */
  lastHitBy: Fighter | null = null;
  lastHitMs = 0;
  /** KOs credited to this fighter, current streak (resets when they are KO'd), and style score */
  kos = 0;
  streak = 0;
  score = 0;

  private hang: Ledge | null = null;
  private hangMs = 0;
  private ledgeCd = 0;
  private readonly standH: number;
  private wasGrounded = false;
  private lastVy = 0;
  private fireTimer = 0; // ms until a wound-up special leaves the hands (0 = none pending)
  private burstLeft = 0; // minigun rounds still to fire
  private burstGap = 0;

  constructor(world: World, x: number, y: number, def: FighterDef, team: Team) {
    this.world = world;
    this.id = world.newId();
    this.def = def;
    this.team = team;
    this.stocks = def.stocks;
    this.jumpsLeft = def.jumps;
    this.hasArt = !!ART[def.id];
    const box = fighterBox(def.id, def.scale);
    this.body = new Body(box.w, box.h);
    this.standH = box.h;
    this.foot = box.foot;
    this.spawn = { x, y };
    this.setPosition(x, y);
    this.prevX = x;
    this.prevY = y;
  }

  /** Sprite centre (the frame middle; feet are `foot` below it). */
  get x(): number {
    return this.body.centerX;
  }
  get y(): number {
    return this.body.bottom - this.foot;
  }

  get grounded(): boolean {
    return this.body.grounded;
  }

  // ---- effective stats (def + held power-up) -------------------------------------------------
  private get pm(): PowerMods | undefined {
    return this.power ? POWER_MODS[this.power] : undefined;
  }
  get speedNow(): number {
    return this.def.speed * (this.pm?.speed ?? 1);
  }
  get weightNow(): number {
    return this.def.weight * (this.pm?.weight ?? 1);
  }
  get jumpsNow(): number {
    return this.def.jumps + (this.pm?.jumps ?? 0);
  }
  get jumpVelNow(): number {
    return this.def.jumpVelocity * (this.pm?.jumpVelocity ?? 1);
  }
  get meleeRangeMul(): number {
    return this.pm?.meleeRange ?? 1;
  }
  get meleeDamageMul(): number {
    return this.pm?.meleeDamage ?? 1;
  }
  private get meleeCdMul(): number {
    return this.pm?.meleeCooldown ?? 1;
  }

  /** Teleport (also resets render interpolation so the sprite doesn't sweep across the map). */
  setPosition(x: number, y: number): void {
    const b = this.body;
    b.x = b.prevX = x - b.width / 2;
    b.y = b.prevY = y + this.foot - b.height;
    this.prevX = x;
    this.prevY = y;
  }

  /** Crouch / stand up with the feet pinned to the ground. */
  setDuck(on: boolean): void {
    if (on === this.ducking) return;
    this.ducking = on;
    const b = this.body;
    const h = on ? this.standH * DUCK_FRAC : this.standH;
    const bottom = b.bottom;
    const d = b.height - h; // positive when shrinking
    b.height = h;
    b.y = bottom - h;
    b.prevY += d; // keep the previous bottom where it was so landing checks stay valid
  }

  /** Take a timed power-up (replaces the current one). */
  givePower(id: PowerId): void {
    const def = POWERS[id];
    if (def.ms <= 0) return;
    this.power = id;
    this.powerMs = def.ms;
    this.burstLeft = 0;
    const mods = POWER_MODS[id];
    if (mods?.jumps) this.jumpsLeft += mods.jumps;
  }

  clearPower(): void {
    this.power = null;
    this.powerMs = 0;
    this.burstLeft = 0;
    this.jumpsLeft = Math.min(this.jumpsLeft, this.jumpsNow);
  }

  tick(dt: number): void {
    if (!this.alive) return;
    const body = this.body;
    const w = this.world;
    this.flash = Math.max(0, this.flash - dt);
    this.hitstun = Math.max(0, this.hitstun - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.specialCd = Math.max(0, this.specialCd - dt);
    this.dropTimer = Math.max(0, this.dropTimer - dt);
    this.ledgeCd = Math.max(0, this.ledgeCd - dt);
    if (this.comboMs > 0 && (this.comboMs -= dt) <= 0) this.combo = 0;
    if (this.lastHitMs > 0 && (this.lastHitMs -= dt) <= 0) this.lastHitBy = null;
    if (this.power && (this.powerMs -= dt) <= 0) this.clearPower();
    if (this.fireTimer > 0) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0 && this.hitstun <= 0) this.releaseSpecial();
    }
    if (this.burstLeft > 0) this.tickBurst(dt);

    const grounded = this.grounded;
    if (this.ultMs > 0) {
      // ultimate in progress: planted, untouchable; the blast goes off near the end of the animation
      this.ultMs -= dt;
      this.invuln = Math.max(this.invuln, 120);
      body.vx *= 0.7;
      if (!this.ultBurst && this.ultMs <= ULT_BURST_AT) {
        this.ultBurst = true;
        w.ultimateBlast(this);
      }
      if (this.ultMs <= 0) this.ultMs = 0;
      this.wasGrounded = grounded;
      this.lastVy = body.vy;
      return;
    }
    if (grounded) this.ledgeGrabs = 0; // touching down refills the ledge grabs (Smash rule)

    if (this.hang) {
      this.tickHang(dt);
      this.wasGrounded = false;
      this.lastVy = 0;
      return;
    }

    if (grounded && body.vy >= 0) this.jumpsLeft = this.jumpsNow;
    if (grounded && !this.wasGrounded && this.lastVy > 250) w.emit({ k: 'land', f: this, vy: this.lastVy, dust: this.lastVy > 350 });
    const i = this.intent;

    // duck: hold down on solid ground (on a drop-through platform, down drops instead)
    this.setDuck(i.drop && grounded && body.groundSolid && this.hitstun <= 0);

    if (this.hitstun <= 0) {
      const target = this.ducking ? 0 : i.dir * this.speedNow * this.speedMul;
      const k = 1 - Math.pow(1 - (grounded ? 0.3 : 0.12), frame(dt));
      body.vx += (target - body.vx) * k;
      if (i.dir !== 0) this.facing = i.dir;
      if (i.drop && grounded && !body.groundSolid) this.dropTimer = 220;

      let jumped = false;
      if (i.jump && this.jumpsLeft > 0) {
        body.vy = -this.jumpVelNow * (grounded ? 1 : 0.92);
        this.jumpsLeft--;
        jumped = true;
        w.emit({ k: 'jump', f: this, grounded });
      }
      // Walking off a ledge costs the ground jump.
      if (this.wasGrounded && !grounded && !jumped) this.jumpsLeft = Math.min(this.jumpsLeft, this.jumpsNow - 1);

      if (i.ultimate && this.ult >= ULT_MAX) {
        this.ult = 0;
        this.ultMs = ULT_WIND_MS;
        this.ultBurst = false;
        this.invuln = Math.max(this.invuln, ULT_WIND_MS + 150);
        this.fireTimer = 0;
        this.burstLeft = 0;
        this.startAction('ultimate');
        w.emit({ k: 'ultimate', f: this, phase: 'start' });
        this.wasGrounded = grounded;
        this.lastVy = body.vy;
        return;
      }
      if (i.attack && this.attackCd <= 0) {
        this.attackCd = this.def.melee.cooldown * this.meleeCdMul;
        this.startAction('melee');
        w.combat.melee(this);
      }
      if (i.special && this.specialCd <= 0) {
        this.specialCd = this.power === 'ap' ? 800 : this.def.special.cooldown * (this.power === 'ddos' ? 1.15 : 1);
        this.startAction('special');
        const wind = this.hasArt ? this.def.special.windup ?? 0 : 0;
        if (wind > 0) this.fireTimer = wind;
        else this.releaseSpecial();
      }
      if (!grounded && !jumped) this.tryGrabLedge();
    } else if (grounded) {
      body.vx *= Math.pow(0.9, frame(dt)); // slide to a stop
    }
    this.wasGrounded = grounded;
    this.lastVy = body.vy;
  }

  /** Returns true if the hit connected. `by` = the attacker (for combos and kill credit), `dmgMul` = attacker power-up scaling. */
  takeHit(move: MoveDef, fromX: number, by?: Fighter, dmgMul = 1): boolean {
    if (!this.alive || this.invuln > 0) return false;
    const w = this.world;
    const crit = by !== undefined && w.rng.next() < CRIT_CHANCE;
    const dealt = move.damage * dmgMul * (crit ? 1.6 : 1);
    this.damage += dealt;
    if (this.hang) this.releaseLedge(LEDGE_REGRAB_CD, 'drop'); // knocked off the ledge
    this.setDuck(false);
    const l = launch(this.damage, move, this.weightNow, this.x < fromX ? -1 : 1);
    this.body.vx = l.vx;
    this.body.vy = l.vy;
    this.hitstun = l.stun;
    this.action = null; // getting hit cancels your own move...
    this.fireTimer = 0; // ...and a special that has not left the hands yet
    this.burstLeft = 0;
    this.jumpsLeft = Math.max(this.jumpsLeft, 1);
    this.flash = 70;
    if (this.team === 'hero') this.ult = Math.min(ULT_MAX, this.ult + dealt * 0.35);
    if (by && by !== this) {
      if (by.team === 'hero') by.ult = Math.min(ULT_MAX, by.ult + dealt * 0.9);
      this.lastHitBy = by;
      this.lastHitMs = 6000;
      by.combo++;
      by.comboMs = COMBO_WINDOW;
      if (by.combo > by.bestCombo) by.bestCombo = by.combo;
      by.score += Math.round(dealt) * by.combo;
      if (by.combo >= 2) w.emit({ k: 'combo', f: by, n: by.combo });
    }
    w.emit({ k: 'hit', f: this, power: l.power, dmg: dealt, crit, by, special: 'speed' in move });
    return true;
  }

  /** Lose a stock. Returns true if the fighter is out of the match. */
  ko(): boolean {
    this.stocks--;
    this.damage = 0;
    this.hitstun = 0;
    this.action = null;
    this.ultMs = 0;
    this.fireTimer = 0;
    this.flash = 0;
    this.tint = null;
    this.combo = this.comboMs = 0;
    this.streak = 0;
    this.lastHitBy = null;
    this.lastHitMs = 0;
    if (this.hang) this.releaseLedge(0, 'drop');
    this.ledgeGrabs = 0;
    this.setDuck(false);
    this.clearPower();
    this.body.vx = this.body.vy = 0;
    if (this.stocks <= 0) {
      this.alive = false;
      return true;
    }
    this.setPosition(this.spawn.x, this.spawn.y);
    this.invuln = 2000;
    this.jumpsLeft = this.jumpsNow;
    return false;
  }

  // ---- specials ------------------------------------------------------------------------------

  /** The special leaves the hands: normal shot, AP minigun burst or DDoS lanes. */
  private releaseSpecial(): void {
    const c = this.world.combat;
    if (this.power === 'ap') {
      this.burstLeft = MINIGUN_ROUNDS;
      this.burstGap = 0;
    } else if (this.power === 'ddos') {
      DDOS_LANES.forEach((lane, n) => c.fire(this, undefined, lane, n > 0));
    } else {
      c.fire(this);
    }
  }

  private tickBurst(dt: number): void {
    if (this.hitstun > 0) {
      this.burstLeft = 0;
      return;
    }
    this.burstGap -= dt;
    if (this.burstGap > 0) return;
    this.burstGap = MINIGUN_GAP_MS;
    const first = this.burstLeft === MINIGUN_ROUNDS;
    this.burstLeft--;
    this.world.combat.fire(this, PACKET, (this.world.rng.next() - 0.5) * 30, !first && this.burstLeft % 4 !== 0);
  }

  // ---- ledges --------------------------------------------------------------------------------

  /** A free ledge is almost within reach on the side we face (AI uses this to hold its jumps and catch the ledge instead). */
  get ledgeAlmostInReach(): boolean {
    if (this.ledgeGrabs >= LEDGE_MAX_GRABS || this.hanging) return false;
    const b = this.body;
    for (const L of this.world.ledges) {
      if (L.holder !== 0 || this.facing !== -L.side) continue;
      const reach = L.side < 0 ? L.x - b.right : b.left - L.x;
      const dy = b.top - L.y;
      if (reach > -4 && reach < 110 && dy > -40 && dy < 70) return true;
    }
    return false;
  }

  /** Airborne, falling, facing a free ledge with the hands near it: grab on (Smash rules, max LEDGE_MAX_GRABS per airtime). */
  private tryGrabLedge(): void {
    if (this.ledgeGrabs >= LEDGE_MAX_GRABS || this.ledgeCd > 0 || this.body.vy < -60) return;
    const b = this.body;
    for (const L of this.world.ledges) {
      if (L.holder !== 0 || this.facing !== -L.side) continue;
      const reach = L.side < 0 ? L.x - b.right : b.left - L.x; // how far the near edge is from the corner
      const dy = b.top - L.y;
      if (reach < -4 || reach > 30 || dy < -30 || dy > 60) continue;
      this.grabLedge(L);
      return;
    }
  }

  private grabLedge(L: Ledge): void {
    const b = this.body;
    this.setDuck(false);
    L.holder = this.id;
    this.hang = L;
    this.hanging = true;
    this.hangMs = 0;
    this.ledgeGrabs++;
    b.gravity = false;
    b.vx = b.vy = 0;
    b.x = b.prevX = L.side < 0 ? L.x - 2 - b.width : L.x + 2;
    b.y = b.prevY = L.y + 8;
    this.prevX = this.x;
    this.prevY = this.y;
    this.facing = (-L.side) as 1 | -1;
    // ledge intangibility, shorter on the second grab so the ledge can't be camped forever
    this.invuln = Math.max(this.invuln, this.ledgeGrabs === 1 ? 1400 : 700);
    this.jumpsLeft = this.jumpsNow;
    this.action = null;
    this.fireTimer = 0;
    this.burstLeft = 0;
    this.world.emit({ k: 'ledge', f: this, kind: 'grab', n: this.ledgeGrabs });
  }

  private releaseLedge(cd: number, kind: 'drop' | 'jump' | 'climb'): void {
    const L = this.hang;
    if (!L) return;
    L.holder = 0;
    this.hang = null;
    this.hanging = false;
    this.body.gravity = true;
    this.ledgeCd = cd;
    this.world.emit({ k: 'ledge', f: this, kind, n: this.ledgeGrabs });
  }

  /** While hanging: toward the stage = climb up, jump = ledge jump, attack = climb + swing, down / away = let go. */
  private tickHang(dt: number): void {
    const L = this.hang!;
    const i = this.intent;
    const b = this.body;
    this.hangMs += dt;
    b.vx = b.vy = 0;
    const toward = (-L.side) as 1 | -1;
    const ready = this.hangMs > 140 && this.hitstun <= 0;
    if (!ready) {
      if (this.hangMs > LEDGE_MAX_HANG) this.releaseLedge(LEDGE_REGRAB_CD, 'drop');
      return;
    }
    if (i.jump) {
      this.releaseLedge(LEDGE_REGRAB_CD, 'jump');
      b.vy = -this.jumpVelNow;
      b.vx = toward * 170;
      this.jumpsLeft = Math.max(0, this.jumpsLeft - 1);
      this.facing = toward;
    } else if (i.attack || i.dir === toward) {
      const swing = i.attack;
      this.releaseLedge(200, 'climb');
      b.x = b.prevX = L.x + toward * (b.halfWidth + 6) - b.halfWidth;
      b.y = b.prevY = L.y - b.height - 0.5;
      b.vx = b.vy = 0;
      this.facing = toward;
      this.invuln = Math.max(this.invuln, 350);
      this.prevX = this.x;
      this.prevY = this.y;
      if (swing && this.attackCd <= 0) {
        this.attackCd = this.def.melee.cooldown * this.meleeCdMul;
        this.startAction('melee');
        this.world.combat.melee(this);
      }
    } else if (i.drop || i.dir === L.side || this.hangMs > LEDGE_MAX_HANG) {
      this.releaseLedge(LEDGE_REGRAB_CD, 'drop');
    }
  }

  // ---- network prediction ------------------------------------------------------------------

  /** Copy of everything tick() reads or writes (a client re-simulates its own fighter from one of these). */
  capture(): FighterMemo {
    const b = this.body;
    return {
      x: b.x, y: b.y, vx: b.vx, vy: b.vy, prevX: b.prevX, prevY: b.prevY, height: b.height, grounded: b.grounded, groundSolid: b.groundSolid, gravity: b.gravity,
      facing: this.facing, hitstun: this.hitstun, invuln: this.invuln, attackCd: this.attackCd, specialCd: this.specialCd, dropTimer: this.dropTimer,
      jumpsLeft: this.jumpsLeft, flash: this.flash, action: this.action, actionSeq: this.actionSeq, ducking: this.ducking, hanging: this.hanging,
      ledgeGrabs: this.ledgeGrabs, power: this.power, powerMs: this.powerMs, ult: this.ult, ultMs: this.ultMs, ultBurst: this.ultBurst,
      hang: this.hang, hangMs: this.hangMs, ledgeCd: this.ledgeCd, wasGrounded: this.wasGrounded, lastVy: this.lastVy,
      fireTimer: this.fireTimer, burstLeft: this.burstLeft, burstGap: this.burstGap, fx: this.prevX, fy: this.prevY,
    };
  }

  restore(m: FighterMemo): void {
    const b = this.body;
    b.x = m.x; b.y = m.y; b.vx = m.vx; b.vy = m.vy; b.prevX = m.prevX; b.prevY = m.prevY; b.height = m.height; b.grounded = m.grounded; b.groundSolid = m.groundSolid; b.gravity = m.gravity;
    this.facing = m.facing; this.hitstun = m.hitstun; this.invuln = m.invuln; this.attackCd = m.attackCd; this.specialCd = m.specialCd; this.dropTimer = m.dropTimer;
    this.jumpsLeft = m.jumpsLeft; this.flash = m.flash; this.action = m.action; this.actionSeq = m.actionSeq; this.ducking = m.ducking; this.hanging = m.hanging;
    this.ledgeGrabs = m.ledgeGrabs; this.power = m.power; this.powerMs = m.powerMs; this.ult = m.ult; this.ultMs = m.ultMs; this.ultBurst = m.ultBurst;
    this.hang = m.hang; this.hangMs = m.hangMs; this.ledgeCd = m.ledgeCd; this.wasGrounded = m.wasGrounded; this.lastVy = m.lastVy;
    this.fireTimer = m.fireTimer; this.burstLeft = m.burstLeft; this.burstGap = m.burstGap; this.prevX = m.fx; this.prevY = m.fy;
  }

  /** Network client: the host says this fighter is / is not on a ledge; make the private ledge state agree (quietly, no events). */
  syncHang(on: boolean): void {
    if (on === (this.hang !== null)) {
      this.hanging = on;
      return;
    }
    if (!on) {
      this.hang = null;
      this.hanging = false;
      this.body.gravity = true;
      return;
    }
    let best: Ledge | null = null;
    let bd = Infinity;
    for (const L of this.world.ledges) {
      const d = Math.abs(L.x - this.body.centerX) + Math.abs(L.y - this.body.top);
      if (d < bd) {
        bd = d;
        best = L;
      }
    }
    if (!best) return;
    this.hang = best;
    this.hanging = true;
    this.hangMs = 200;
    this.body.gravity = false;
  }

  /** The ledge this fighter is holding (network client keeps the ledge's holder flag in step with it). */
  get ledge(): Ledge | null {
    return this.hang;
  }

  private startAction(state: 'melee' | 'special' | 'ultimate'): void {
    this.action = state;
    this.actionSeq++;
  }
}

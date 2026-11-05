import Phaser from 'phaser';
import type { FighterDef, MoveDef } from '../data/types';
import { ART, textureKey, type ArtState } from '../data/art';
import { launch } from '../systems/Knockback';
import type { Combat } from '../systems/Combat';

export type Team = 'hero' | 'enemy';

export interface Intent {
  dir: -1 | 0 | 1;
  jump: boolean; // one-frame pulses
  drop: boolean;
  attack: boolean;
  special: boolean;
}

export const emptyIntent = (): Intent => ({ dir: 0, jump: false, drop: false, attack: false, special: false });

const frame = (dt: number) => dt / 16.667;

/** Base fighter: movement, jumping, attacks, damage %, stocks, animation state.
 *  Player and Bot extend it. */
export class Fighter extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  readonly def: FighterDef;
  readonly team: Team;
  combat!: Combat;

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
  spawn: Phaser.Math.Vector2;
  private wasGrounded = false;
  private lastVy = 0;
  private flash = 0; // ms of white hit-flash left
  private fireTimer = 0; // ms until a wound-up special leaves the hands (0 = none pending)
  private animKeys: Partial<Record<ArtState, string | null>> = {};

  // animation (only used when the character has Aseprite art)
  private hasArt = false;
  private animated = false; // art has a real run cycle; otherwise we fake motion with lean/tumble
  private action: ArtState | null = null;
  private actionTimer = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, def: FighterDef, team: Team) {
    super(scene, x, y, textureKey(def.id));
    this.def = def;
    this.team = team;
    this.stocks = def.stocks;
    this.jumpsLeft = def.jumps;
    this.spawn = new Phaser.Math.Vector2(x, y);
    this.setScale(def.scale);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body.setMaxVelocity(1100, 1300);
    this.setDepth(5);

    const art = ART[def.id];
    if (art) {
      this.hasArt = true;
      this.animated = scene.anims.exists(`${def.id}:run`);
      // physics body is independent of the (larger) art frame; feet sit on the frame's bottom edge
      this.body.setSize(art.body.w, art.body.h, false);
      this.body.setOffset((art.frame - art.body.w) / 2, art.frame - art.body.h);
      this.playState('idle');
    }
  }

  get grounded(): boolean {
    return this.body.blocked.down || this.body.touching.down;
  }

  tick(dt: number): void {
    if (!this.alive) return;
    if (this.flash > 0) {
      this.flash -= dt;
      if (this.flash <= 0) this.clearTint();
    }
    const body = this.body;
    this.hitstun = Math.max(0, this.hitstun - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.specialCd = Math.max(0, this.specialCd - dt);
    this.dropTimer = Math.max(0, this.dropTimer - dt);
    this.actionTimer = Math.max(0, this.actionTimer - dt);
    if (this.fireTimer > 0) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0 && this.hitstun <= 0) this.combat.fire(this);
    }

    const grounded = this.grounded;
    if (grounded && body.velocity.y >= 0) this.jumpsLeft = this.def.jumps;
    if (grounded && !this.wasGrounded && this.lastVy > 250) {
      this.scene.events.emit('sfx:land', this.lastVy);
      if (this.lastVy > 350) this.combat.dust(this.x, body.bottom, 6);
    }
    const i = this.intent;

    if (this.hitstun <= 0) {
      const target = i.dir * this.def.speed * this.speedMul;
      const k = 1 - Math.pow(1 - (grounded ? 0.3 : 0.12), frame(dt));
      body.setVelocityX(body.velocity.x + (target - body.velocity.x) * k);
      if (i.dir !== 0) this.facing = i.dir;
      if (i.drop && grounded) this.dropTimer = 220;

      let jumped = false;
      if (i.jump && this.jumpsLeft > 0) {
        if (grounded) this.combat.dust(this.x, body.bottom, 5);
        body.setVelocityY(-this.def.jumpVelocity * (grounded ? 1 : 0.92));
        this.jumpsLeft--;
        jumped = true;
        this.scene.events.emit('sfx:jump');
      }
      // Walking off a ledge costs the ground jump.
      if (this.wasGrounded && !grounded && !jumped) this.jumpsLeft = Math.min(this.jumpsLeft, this.def.jumps - 1);

      if (i.attack && this.attackCd <= 0) {
        this.attackCd = this.def.melee.cooldown;
        this.startAction('melee');
        this.combat.melee(this);
      }
      if (i.special && this.specialCd <= 0) {
        this.specialCd = this.def.special.cooldown;
        this.startAction('special');
        const w = this.hasArt ? this.def.special.windup ?? 0 : 0;
        if (w > 0) this.fireTimer = w;
        else this.combat.fire(this);
      }
    } else if (grounded) {
      body.setVelocityX(body.velocity.x * Math.pow(0.9, frame(dt))); // slide to a stop
    }
    this.wasGrounded = grounded;
    this.lastVy = body.velocity.y;

    this.setFlipX(this.facing < 0);
    this.setAlpha(this.invuln > 0 ? (Math.floor(this.invuln / 90) % 2 ? 0.3 : 0.75) : 1);
    this.updateAnim(grounded);
    this.updateLean();
  }

  /** Single-pose art (bosses, minions): lean into movement and tumble when launched. Rotation never touches the physics body. */
  private updateLean(): void {
    if (this.animated) return;
    const v = this.body.velocity;
    if (this.hitstun > 0 && Math.hypot(v.x, v.y) > 450) {
      this.angle += Math.sign(v.x || 1) * 14; // tumble
      return;
    }
    const wrapped = Phaser.Math.Angle.WrapDegrees(this.angle);
    const target = Phaser.Math.Clamp(v.x / 300, -1, 1) * 6;
    this.setAngle(Math.abs(wrapped) > 90 ? 0 : Phaser.Math.Linear(wrapped, target, 0.25));
  }

  /** Returns true if the hit connected. */
  takeHit(move: MoveDef, fromX: number): boolean {
    if (!this.alive || this.invuln > 0) return false;
    this.damage += move.damage;
    const l = launch(this.damage, move, this.def.weight, this.x < fromX ? -1 : 1);
    this.body.setVelocity(l.vx, l.vy);
    this.hitstun = l.stun;
    this.actionTimer = 0; // getting hit cancels your own move animation
    this.fireTimer = 0; // ...and a special that has not left the hands yet
    this.jumpsLeft = Math.max(this.jumpsLeft, 1);
    this.setTintFill(0xffffff);
    this.flash = 70;
    this.scene.events.emit('sfx:hit', l.power, this.x);
    if (l.power > 700) this.scene.cameras.main.shake(100, 0.004);
    return true;
  }

  /** Lose a stock. Returns true if the fighter is out of the match. */
  ko(): boolean {
    this.stocks--;
    this.damage = 0;
    this.hitstun = 0;
    this.actionTimer = 0;
    this.fireTimer = 0;
    this.body.setVelocity(0, 0);
    if (this.stocks <= 0) {
      this.alive = false;
      this.setActive(false).setVisible(false);
      this.body.enable = false;
      return true;
    }
    this.setPosition(this.spawn.x, this.spawn.y);
    this.invuln = 2000;
    this.jumpsLeft = this.def.jumps;
    return false;
  }

  // ---- animation -------------------------------------------------------

  /** Animation key for a state, or null when the sheet lacks it (resolved once, then cached). */
  private animKey(state: ArtState): string | null {
    let k = this.animKeys[state];
    if (k === undefined) {
      const key = `${this.def.id}:${state}`;
      k = this.scene.anims.exists(key) ? key : null;
      this.animKeys[state] = k;
    }
    return k;
  }

  /** Play a state's animation, falling back gracefully if a sheet lacks that tag. */
  private playState(state: ArtState): void {
    const fallback: Partial<Record<ArtState, ArtState>> = { launch: 'hurt', hurt: 'idle', fall: 'jump', jump: 'idle', run: 'idle', melee: 'idle', special: 'melee' };
    let s: ArtState | undefined = state;
    while (s && !this.animKey(s)) s = fallback[s];
    if (s) this.anims.play(this.animKey(s)!, true);
  }

  private startAction(state: 'melee' | 'special'): void {
    if (!this.hasArt) return;
    const key = this.animKey(state) ?? this.animKey('melee');
    const anim = key ? this.scene.anims.get(key) : null;
    if (!anim) return;
    this.action = state;
    this.actionTimer = anim.duration;
    this.anims.play(anim.key, false);
  }

  private updateAnim(grounded: boolean): void {
    if (!this.hasArt) return;
    const vx = this.body.velocity.x;
    let s: ArtState;
    if (this.hitstun > 0) s = Math.hypot(vx, this.body.velocity.y) > 450 ? 'launch' : 'hurt';
    else if (this.actionTimer > 0 && this.action) return; // let the move animation finish
    else if (!grounded) s = this.body.velocity.y < 0 ? 'jump' : 'fall';
    else s = Math.abs(vx) > 40 && this.intent.dir !== 0 ? 'run' : 'idle';
    this.anims.timeScale = s === 'run' ? Phaser.Math.Clamp(Math.abs(vx) / this.def.speed, 0.6, 1.5) : 1; // legs match the ground speed
    this.playState(s);
  }
}

import Phaser from 'phaser';
import type { Fighter } from '../entities/Fighter';
import { artScale, textureKey, type ArtState } from '../data/art';
import { POWERS, type PowerId } from '../data/powerups';

/** Crouch for sheets with no `<id>:duck` tag (bosses, minions): squash to this fraction of height (matches DUCK_FRAC in Fighter). Heroes use their landing crouch. */
const DUCK_SQUASH = 0.62;

type ActionState = 'melee' | 'melee2' | 'special' | 'aspecial' | 'scharge' | 'ultimate' | 'land' | 'respawn' | 'taunt' | 'victory' | 'intro';
/** Action poses that give way as soon as the fighter moves or leaves the ground (every other action animation plays to the end). */
const SOFT_ACTIONS = new Set<ActionState>(['taunt', 'land']);

/** Draws one sim Fighter: position (interpolated between ticks), facing, hit flash, boss telegraph tint,
 *  invulnerability blink and the animation state. Reads the fighter, never writes it. */
export class FighterView extends Phaser.GameObjects.Sprite {
  private animKeys: Partial<Record<ArtState, string | null>> = {};
  private hasArt: boolean;
  private animated: boolean; // art has a real run cycle; otherwise we fake motion with lean/tumble
  private action: ActionState | null = null;
  private wasGrounded = true;
  private wasHanging = false;
  private launched = false; // tumbling from a big hit (latched until landing)
  private knocked = false; // landed while tumbling: lying in the ko pose until hitstun ends
  private thrust: Phaser.GameObjects.Sprite | null = null;
  private downed = false; // shut down for good (defeat frames playing): only the position still follows the sim
  private lastInvuln = 0;
  private lastMeleeAt = -1e9; // alternate melee / melee2 on quick follow-up swings
  private meleeFlip = false;
  private actionTimer = 0;
  private seenSeq: number;
  private aura: PowerId | null = null;
  private glow: Phaser.FX.Glow | null = null;
  /** Called when this fighter comes back from a KO (the scene plays the respawn pad). */
  onRespawn: ((f: Fighter) => void) | null = null;

  constructor(
    scene: Phaser.Scene,
    readonly f: Fighter,
  ) {
    super(scene, f.x, f.y, textureKey(f.def.id));
    this.setScale(artScale(f.def.id, f.def.scale)).setDepth(5);
    scene.add.existing(this);
    this.hasArt = f.hasArt;
    this.animated = scene.anims.exists(`${f.def.id}:run`);
    this.seenSeq = f.actionSeq;
    if (this.hasArt) this.playState('idle');
    const thrustKey = `fx_${f.def.id}_thrust`;
    if (scene.anims.exists(thrustKey)) this.thrust = scene.add.sprite(f.x, f.y, thrustKey).setVisible(false).setAlpha(0.9);
  }

  /** alpha = how far we are between the previous and the current tick (0..1); dt = render frame ms. */
  sync(alpha: number, dt: number): void {
    const f = this.f;
    this.setVisible(f.alive);
    if (!f.alive) {
      this.thrust?.setVisible(false);
      return;
    }
    if (this.downed) {
      this.setPosition(f.prevX + (f.x - f.prevX) * alpha, f.prevY + (f.y - f.prevY) * alpha).setAngle(0);
      this.thrust?.setVisible(false);
      return;
    }
    const base = artScale(f.def.id, f.def.scale);
    // crouch with no real duck frames: squash toward the feet
    const squash = f.ducking && !this.animKey('duck');
    this.setScale(base, squash ? base * DUCK_SQUASH : base);
    this.setPosition(f.prevX + (f.x - f.prevX) * alpha + f.offX, f.prevY + (f.y - f.prevY) * alpha + f.offY + (squash ? f.foot * (1 - DUCK_SQUASH) : 0));
    this.setFlipX(f.facing < 0);
    if (f.power !== this.aura) this.setAura(f.power);
    if (f.flash > 0) this.setTintFill(0xffffff);
    else if (f.tint !== null) this.setTint(f.tint);
    else this.clearTint();
    this.setAlpha(f.invuln > 0 ? (Math.floor(f.invuln / 90) % 2 ? 0.3 : 0.75) : 1);

    if (f.actionSeq !== this.seenSeq) {
      this.seenSeq = f.actionSeq;
      if (f.action) this.startAction(f.action);
    }
    this.actionTimer = f.hitstun > 0 ? 0 : Math.max(0, this.actionTimer - dt); // getting hit cancels the move animation
    this.autoActions(f);
    this.updateAnim();
    this.updateLean(dt);
    this.updateThrust();
    if (this.animated) this.setAngle(f.hanging ? f.facing * 12 : 0); // dangling off a ledge: lean toward the platform
    else if (f.hanging) this.setAngle(f.facing * 12);
  }

  /** Coloured glow while a timed power-up is held (WebGL only; skipped quietly elsewhere). */
  private setAura(p: PowerId | null): void {
    this.aura = p;
    try {
      if (this.glow) {
        this.preFX?.remove(this.glow);
        this.glow = null;
      }
      if (p && this.preFX) this.glow = this.preFX.addGlow(POWERS[p].color, 5, 0, false, 0.1, 10);
    } catch {
      /* no FX support: the pickup banner and HUD timer still show it */
    }
  }

  /** Single-pose art (bosses, minions): lean into movement and tumble when launched. */
  private updateLean(dt: number): void {
    if (this.animated) return;
    const { vx, vy } = this.f.body;
    if (this.f.hitstun > 0 && Math.hypot(vx, vy) > 450) {
      this.angle += Math.sign(vx || 1) * 14 * (dt / 16.667); // tumble
      return;
    }
    const wrapped = Phaser.Math.Angle.WrapDegrees(this.angle);
    const target = Phaser.Math.Clamp(vx / 300, -1, 1) * 6;
    this.setAngle(Math.abs(wrapped) > 90 ? 0 : Phaser.Math.Linear(wrapped, target, 0.25));
  }

  /** Animation key for a state, or null when the sheet lacks it (resolved once, then cached). */
  private animKey(state: ArtState): string | null {
    let k = this.animKeys[state];
    if (k === undefined) {
      const key = `${this.f.def.id}:${state}`;
      k = this.scene.anims.exists(key) ? key : null;
      this.animKeys[state] = k;
    }
    return k;
  }

  /** Play a state's animation, falling back gracefully if a sheet lacks that tag. */
  private playState(state: ArtState): void {
    const fallback: Partial<Record<ArtState, ArtState>> = { launch: 'hurt', hurt: 'idle', fall: 'jump', apex: 'jump', jump: 'idle', aspecial: 'special', scharge: 'special', run: 'idle', melee: 'idle', special: 'melee', duck: 'idle', hang: 'apex', climb: 'jump', land: 'idle', melee2: 'melee', ultimate: 'special', respawn: 'idle', ko: 'hurt' };
    let s: ArtState | undefined = state;
    while (s && !this.animKey(s)) s = fallback[s];
    if (s) this.anims.play(this.animKey(s)!, true);
  }

  /** Animations started from what the sim state shows (no sim events needed, so online clients get them too):
   *  respawn, landing, climbing up from a ledge, and the knockdown when a launched hero hits the floor. */
  private autoActions(f: Fighter): void {
    if (!this.hasArt) return;
    const landed = f.grounded && !this.wasGrounded;
    const climbed = this.wasHanging && !f.hanging && f.hitstun <= 0;
    this.wasGrounded = f.grounded;
    this.wasHanging = f.hanging;
    if (landed && this.action === 'aspecial') this.actionTimer = 0; // the air special pose ends on touchdown
    // getting up after a knockdown: the rising half of the landing
    if (this.knocked && f.hitstun <= 0) {
      this.knocked = false;
      if (f.grounded && f.intent.dir === 0) this.startAction('land');
    }
    const busy = this.actionTimer > 0 && this.action !== null;
    // a respawn sets 2000 ms of invulnerability; smaller jumps are a ledge grab (1400) or an ultimate (810), which must not restart this
    if (f.invuln > this.lastInvuln + 1500) {
      this.onRespawn?.(f);
      if (this.animKey('respawn') && f.hitstun <= 0) this.startAction('respawn');
    } else if (climbed && f.grounded) this.startAction('land'); // pulled up onto the platform
    else if (landed && f.hitstun > 150 && this.launched && f.team === 'hero' && this.animKey('ko')) this.knocked = true; // hit the floor while tumbling
    else if (landed && f.hitstun <= 0 && f.intent.dir === 0 && !busy) this.startAction('land');
    if (f.grounded) this.launched = false;
    this.lastInvuln = f.invuln;
  }

  /** Show-off pose: `taunt` after scoring a KO, `victory` when the fight is won. Only from a calm standing state, and only if the sheet has it. */
  cheer(state: 'taunt' | 'victory'): void {
    const f = this.f;
    if (!f.alive || !f.grounded || f.hitstun > 0 || f.hanging || !this.animKey(state)) return;
    if (state === 'taunt' && ((this.actionTimer > 0 && this.action) || f.intent.dir !== 0)) return;
    this.startAction(state);
  }

  /** Shut down for good (minions when their boss falls): play the defeat / death frames once and stop animating. */
  defeat(): boolean {
    const k = this.animKey('defeat');
    if (!k || !this.f.alive || this.downed) return false;
    this.downed = true;
    this.clearTint().setAlpha(1);
    this.anims.timeScale = 1;
    this.anims.play(k, false);
    return true;
  }

  /** Boss entrance (`intro` frames) when the fight starts. */
  intro(): void {
    if (this.animKey('intro')) this.startAction('intro');
  }

  private startAction(state: ActionState): void {
    if (!this.hasArt) return;
    const f = this.f;
    if (state === 'melee') {
      // a second swing soon after the first plays the follow-up (melee2) animation
      const now = this.scene.time.now;
      this.meleeFlip = now - this.lastMeleeAt < 700 ? !this.meleeFlip : false;
      this.lastMeleeAt = now;
      if (this.meleeFlip && this.animKey('melee2')) state = 'melee2';
    }
    // special variants: the air pose when fired off the ground, the charged pose while a power-up boosts the special
    if (state === 'special' && !f.grounded && this.animKey('aspecial')) state = 'aspecial';
    else if (state === 'special' && (f.power === 'ap' || f.power === 'ddos') && this.animKey('scharge')) state = 'scharge';
    // moves without their own frames borrow a related move (ultimate -> special -> melee); poses without frames
    // (land, respawn, taunt, victory, intro) are simply not played, so a landing boss or minion no longer swings its attack
    const isMove = state === 'melee' || state === 'melee2' || state === 'special' || state === 'aspecial' || state === 'scharge' || state === 'ultimate';
    const key = this.animKey(state) ?? (isMove ? (state === 'ultimate' ? this.animKey('special') : null) ?? this.animKey('melee') : null);
    const anim = key ? this.scene.anims.get(key) : null;
    if (!anim) return;
    this.action = state;
    // single-frame variants hold for as long as the normal special; the victory pose holds until the result screen
    const special = this.animKey('special');
    this.actionTimer = state === 'victory' ? 4000 : state === 'aspecial' || state === 'scharge' ? Math.max(anim.duration, special ? this.scene.anims.get(special).duration : 300) : anim.duration;
    this.anims.play(anim.key, false);
  }

  private updateAnim(): void {
    if (!this.hasArt) return;
    const f = this.f;
    const { vx, vy } = f.body;
    let s: ArtState;
    if (f.hitstun > 0) {
      // once sent flying, stay in the tumble until landing (speed dips below the threshold at the top of the arc, which used to flicker hurt/launch)
      if (!f.grounded && Math.hypot(vx, vy) > 450) this.launched = true;
      s = this.knocked && f.grounded ? 'ko' : this.launched ? 'launch' : 'hurt';
    } else if (f.hanging) s = 'hang';
    else if (f.ducking) s = 'duck';
    else if (this.actionTimer > 0 && this.action) {
      // moving or leaving the ground cuts the soft poses (taunt, landing, getting up) short; move animations always finish
      if (!SOFT_ACTIONS.has(this.action) || (f.grounded && f.intent.dir === 0)) return;
      this.actionTimer = 0;
      s = !f.grounded ? 'jump' : Math.abs(vx) > 40 ? 'run' : 'idle';
    } else if (!f.grounded) s = vy < -220 ? 'jump' : vy < 200 ? 'apex' : 'fall'; // rising, floating at the top, dropping
    else s = Math.abs(vx) > 40 && f.intent.dir !== 0 ? 'run' : 'idle';
    if (f.hitstun <= 0) this.launched = this.knocked = false;
    this.anims.timeScale = s === 'run' ? Phaser.Math.Clamp(Math.abs(vx) / f.def.speed, 0.6, 1.5) : 1; // legs match the ground speed
    this.playState(s);
  }

  /** Thruster / hover glow under bosses that have one, while they are off the ground. */
  private updateThrust(): void {
    const f = this.f;
    if (!this.thrust) return;
    const on = f.alive && !f.grounded && !f.hanging && f.hitstun <= 0;
    this.thrust.setVisible(on);
    if (!on) return;
    this.thrust.setPosition(this.x, this.y + f.foot * 0.85).setScale(f.body.width / 110).setDepth(this.depth - 0.1);
    if (!this.thrust.anims.isPlaying) this.thrust.play(this.thrust.texture.key);
  }

  override destroy(fromScene?: boolean): void {
    this.thrust?.destroy();
    this.thrust = null;
    super.destroy(fromScene);
  }
}

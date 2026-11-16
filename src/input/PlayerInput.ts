import Phaser from 'phaser';
import type { Intent } from '../entities/Fighter';
import { touchState, resetTouchState, isTouchDevice } from './touchState';

type Key = Phaser.Input.Keyboard.Key;

const DEADZONE = 0.3;

/** Local controls: keyboard + gamepad + touch. WASD / arrows move, J or Z attack, K or X special.
 *  poll() runs every render frame and latches button presses; consume() hands them to exactly one sim tick,
 *  so a press is never lost on a frame without a tick (high-refresh screens) and never fires twice. */
export class PlayerInput {
  private k: Record<'left' | 'right' | 'up' | 'down' | 'a' | 'd' | 'w' | 's' | 'space' | 'j' | 'k' | 'z' | 'x' | 'l' | 'c', Key>;
  private padPrev = { jump: false, attack: false, special: false, ult: false };
  private dir: -1 | 0 | 1 = 0;
  private drop = false;
  private jump = false;
  private attack = false;
  private special = false;
  private ultimate = false;

  constructor(private scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    const C = Phaser.Input.Keyboard.KeyCodes;
    // addKey captures the key (preventDefault) so space/arrows never scroll the page
    this.k = {
      left: kb.addKey(C.LEFT, true), right: kb.addKey(C.RIGHT, true), up: kb.addKey(C.UP, true), down: kb.addKey(C.DOWN, true),
      a: kb.addKey(C.A), d: kb.addKey(C.D), w: kb.addKey(C.W), s: kb.addKey(C.S),
      space: kb.addKey(C.SPACE, true), j: kb.addKey(C.J), k: kb.addKey(C.K), z: kb.addKey(C.Z), x: kb.addKey(C.X), l: kb.addKey(C.L), c: kb.addKey(C.C),
    };

    if (isTouchDevice()) {
      resetTouchState();
      if (scene.scene.isActive('Touch')) scene.scene.stop('Touch');
      scene.scene.launch('Touch');
      scene.events.once('shutdown', () => {
        scene.scene.stop('Touch');
        resetTouchState();
        touchState.active = false;
      });
    }
  }

  /** Read devices (once per render frame). Held state is replaced; presses accumulate until consumed. */
  poll(): void {
    const k = this.k;
    const JD = Phaser.Input.Keyboard.JustDown;
    let l = k.left.isDown || k.a.isDown;
    let r = k.right.isDown || k.d.isDown;
    let jump = JD(k.up) || JD(k.w) || JD(k.space);
    let drop = k.down.isDown || k.s.isDown;
    let attack = JD(k.j) || JD(k.z);
    let special = JD(k.k) || JD(k.x);
    let ultimate = JD(k.l) || JD(k.c);

    // gamepad (first connected pad, standard mapping)
    const gp = this.scene.input.gamepad;
    const pad = gp && gp.total > 0 ? gp.getPad(0) : null;
    if (pad && pad.connected) {
      const sx = pad.leftStick.x;
      const sy = pad.leftStick.y;
      if (pad.left || sx < -DEADZONE) l = true;
      if (pad.right || sx > DEADZONE) r = true;
      if (pad.down || sy > DEADZONE) drop = true;
      const pj = pad.A;
      const pa = pad.X;
      const ps = pad.B || pad.Y;
      const pu = pad.R1 > 0.5 || pad.L1 > 0.5;
      jump = jump || (pj && !this.padPrev.jump);
      attack = attack || (pa && !this.padPrev.attack);
      special = special || (ps && !this.padPrev.special);
      this.padPrev.jump = pj;
      this.padPrev.attack = pa;
      this.padPrev.special = ps;
      ultimate = ultimate || (pu && !this.padPrev.ult);
      this.padPrev.ult = pu;
    }

    // touch (pulses are consumed here)
    if (touchState.active) {
      if (touchState.dir < 0) l = true;
      if (touchState.dir > 0) r = true;
      if (touchState.drop) drop = true;
      jump = jump || touchState.jump;
      attack = attack || touchState.attack;
      special = special || touchState.special;
      ultimate = ultimate || touchState.ultimate;
      touchState.jump = touchState.attack = touchState.special = touchState.ultimate = false;
    }

    this.dir = l === r ? 0 : l ? -1 : 1;
    this.drop = drop;
    this.jump ||= jump;
    this.attack ||= attack;
    this.special ||= special;
    this.ultimate ||= ultimate;
  }

  /** Write the current controls into a fighter's intent for one tick, then clear the latched presses. */
  consume(i: Intent): void {
    i.dir = this.dir;
    i.drop = this.drop;
    i.jump = this.jump;
    i.attack = this.attack;
    i.special = this.special;
    i.ultimate = this.ultimate;
    this.jump = this.attack = this.special = this.ultimate = false;
  }
}

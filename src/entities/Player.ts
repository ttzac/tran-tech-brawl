import Phaser from 'phaser';
import type { FighterDef } from '../data/types';
import { Fighter } from './Fighter';
import { touchState, resetTouchState, isTouchDevice } from '../input/touchState';

type Key = Phaser.Input.Keyboard.Key;

const DEADZONE = 0.3;

/** Fighter controlled by keyboard, gamepad and touch. WASD / arrows move, J or Z attack, K or X special. */
export class Player extends Fighter {
  private k: Record<'left' | 'right' | 'up' | 'down' | 'a' | 'd' | 'w' | 's' | 'space' | 'j' | 'k' | 'z' | 'x', Key>;
  private padPrev = { jump: false, attack: false, special: false };

  constructor(scene: Phaser.Scene, x: number, y: number, def: FighterDef) {
    super(scene, x, y, def, 'hero');
    const kb = scene.input.keyboard!;
    const C = Phaser.Input.Keyboard.KeyCodes;
    // addKey captures the key (preventDefault) so space/arrows never scroll the page
    this.k = {
      left: kb.addKey(C.LEFT, true), right: kb.addKey(C.RIGHT, true), up: kb.addKey(C.UP, true), down: kb.addKey(C.DOWN, true),
      a: kb.addKey(C.A), d: kb.addKey(C.D), w: kb.addKey(C.W), s: kb.addKey(C.S),
      space: kb.addKey(C.SPACE, true), j: kb.addKey(C.J), k: kb.addKey(C.K), z: kb.addKey(C.Z), x: kb.addKey(C.X),
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

  readInput(): void {
    const k = this.k;
    const JD = Phaser.Input.Keyboard.JustDown;
    let l = k.left.isDown || k.a.isDown;
    let r = k.right.isDown || k.d.isDown;
    let jump = JD(k.up) || JD(k.w) || JD(k.space);
    let drop = k.down.isDown || k.s.isDown;
    let attack = JD(k.j) || JD(k.z);
    let special = JD(k.k) || JD(k.x);

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
      jump = jump || (pj && !this.padPrev.jump);
      attack = attack || (pa && !this.padPrev.attack);
      special = special || (ps && !this.padPrev.special);
      this.padPrev.jump = pj;
      this.padPrev.attack = pa;
      this.padPrev.special = ps;
    }

    // touch (pulses are consumed here)
    if (touchState.active) {
      if (touchState.dir < 0) l = true;
      if (touchState.dir > 0) r = true;
      if (touchState.drop) drop = true;
      jump = jump || touchState.jump;
      attack = attack || touchState.attack;
      special = special || touchState.special;
      touchState.jump = touchState.attack = touchState.special = false;
    }

    this.intent.dir = l === r ? 0 : l ? -1 : 1;
    this.intent.jump = jump;
    this.intent.drop = drop;
    this.intent.attack = attack;
    this.intent.special = special;
  }
}

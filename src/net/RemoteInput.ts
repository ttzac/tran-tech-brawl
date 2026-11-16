import type { Intent } from '../entities/Fighter';
import { unpackIntent, type InputMsg } from './protocol';

/** Held controls (dir + drop) carry over a missing tick; presses (jump/attack/special/ultimate) never repeat. */
const HELD = 0b000111;
const PRESSES = 0b1111000;
/** If inputs pile up (a burst after a stall), apply the extra ones at once so the remote player's delay can't grow. */
const MAX_BACKLOG = 3;
/** Nothing new from the player for this many ticks: stop holding their last direction (so they do not run off the stage)... */
const IDLE_NEUTRAL = 20;
/** ...and for this many: treat them as away, the AI plays for them until their inputs come back. */
const IDLE_AWAY = 150;

/** Host side: turns a remote player's input packets into one intent per sim tick.
 *  - In order: input seq N drives one host tick; duplicates (redundant copies) are ignored.
 *  - A late tick holds the last movement and waits, so a press is never lost to jitter.
 *  - A backlog gets merged (presses OR-ed together), and a tick lost for good is skipped, so delay stays bounded. */
export class RemoteInput {
  /** last input seq applied to the sim (sent back as the ack) */
  applied = 0;
  connected = true;

  private buf = new Map<number, number>();
  private next = -1;
  private newest = -1;
  private last = 0;
  private idle = 0;

  /** The player dropped out or went quiet (hidden tab, frozen PC): the host hands their fighter to the AI. */
  get away(): boolean {
    return !this.connected || this.idle >= IDLE_AWAY;
  }

  push(m: InputMsg): void {
    if (this.next < 0) this.next = Math.max(1, m.seq - m.inputs.length + 1);
    for (let k = 0; k < m.inputs.length; k++) {
      const seq = m.seq - k;
      if (seq < this.next) break; // already applied (or skipped)
      if (!this.buf.has(seq)) this.buf.set(seq, m.inputs[k]);
    }
    if (m.seq > this.newest) this.newest = m.seq;
  }

  /** Fill the fighter's intent for this tick. */
  apply(out: Intent): void {
    if (!this.connected || this.next < 0) {
      unpackIntent(0, out);
      return;
    }
    let presses = 0;
    // too far behind: fold the oldest ticks in (skipping any that never arrived)
    while (this.newest - this.next >= MAX_BACKLOG) {
      const b = this.buf.get(this.next);
      if (b !== undefined) {
        presses |= b & PRESSES;
        this.last = b;
        this.buf.delete(this.next);
      }
      this.applied = this.next++;
    }
    const b = this.buf.get(this.next);
    if (b !== undefined) {
      this.buf.delete(this.next);
      this.applied = this.next++;
      this.last = b;
      this.idle = 0;
      unpackIntent(b | presses, out);
    } else {
      if (presses === 0) this.idle++;
      unpackIntent((this.idle > IDLE_NEUTRAL ? 0 : this.last & HELD) | presses, out); // late: keep moving the same way for a moment, wait for it
    }
  }

  /** How many received ticks are waiting (for the net debug overlay). */
  get backlog(): number {
    return this.buf.size;
  }
}

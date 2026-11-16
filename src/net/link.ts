import { MSG, decodeCtrl, decodePingTime, encodeCtrl, encodePing, type CtrlMsg } from './protocol';

/** Fake network trouble applied to everything a link receives (dev and tests). lag/jitter in ms, loss 0..1.
 *  Loss only hits the unreliable state channel; ctrl messages are delayed but stay ordered and never drop. */
export interface NetConditions {
  lag: number;
  jitter: number;
  loss: number;
}

/** Shared default used by every link unless one is given its own. Tweak from the dev console: __net.cond({ lag: 50 }). */
export const netConditions: NetConditions = { lag: 0, jitter: 0, loss: 0 };

export interface LinkStats {
  /** smoothed round-trip time in ms (0 until the first pong) */
  rtt: number;
  bytesOut: number;
  bytesIn: number;
  /** state packets thrown away by the simulated loss */
  dropped: number;
}

const PING_MS = 1000;
/** No bytes from the peer for this long = the connection is dead (a closed tab / lost Wi-Fi does not always say goodbye). */
export const LINK_TIMEOUT_MS = 10000;
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** One connection to one peer, with two channels:
 *  - state: unordered, unreliable binary (inputs, snapshots). Latest wins; lost packets are not resent.
 *  - ctrl: ordered, reliable JSON (lobby, match start, events).
 *  Subclasses move the bytes (WebRTC, BroadcastChannel, memory); this base adds ping/RTT, byte counts and fake conditions. */
export abstract class Link {
  onOpen: (() => void) | null = null;
  onState: ((buf: Uint8Array) => void) | null = null;
  onCtrl: ((m: CtrlMsg) => void) | null = null;
  onClose: (() => void) | null = null;
  readonly stats: LinkStats = { rtt: 0, bytesOut: 0, bytesIn: 0, dropped: 0 };
  open = false;
  closed = false;

  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private ctrlDueAt = 0;
  private lastRecvAt = 0;

  constructor(
    readonly peer: string,
    protected cond: NetConditions = netConditions,
  ) {}

  sendState(buf: Uint8Array): void {
    if (!this.open) return;
    this.stats.bytesOut += buf.byteLength;
    this.rawState(buf);
  }

  sendCtrl(m: CtrlMsg): void {
    if (!this.open) return;
    const s = encodeCtrl(m);
    this.stats.bytesOut += s.length;
    this.rawCtrl(s);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.rawClose();
    this.onClose?.();
  }

  protected abstract rawState(buf: Uint8Array): void;
  protected abstract rawCtrl(text: string): void;
  protected abstract rawClose(): void;

  /** Call once both channels can carry data. */
  protected markOpen(): void {
    if (this.open || this.closed) return;
    this.open = true;
    this.lastRecvAt = now();
    this.ping();
    this.pingTimer = setInterval(() => this.ping(), PING_MS);
    this.onOpen?.();
  }

  /** Bytes arrived on the state channel. */
  protected recvState(buf: Uint8Array): void {
    this.lastRecvAt = now();
    const c = this.cond;
    if (c.loss > 0 && Math.random() < c.loss) {
      this.stats.dropped++;
      return;
    }
    const delay = c.lag + Math.random() * c.jitter;
    if (delay <= 0) this.handleState(buf);
    else setTimeout(() => this.handleState(buf), delay);
  }

  /** Text arrived on the ctrl channel. */
  protected recvCtrl(text: string): void {
    const c = this.cond;
    const t = now();
    this.lastRecvAt = t;
    // reliable + ordered: a later message never overtakes an earlier one
    const due = Math.max(this.ctrlDueAt, t + c.lag + Math.random() * c.jitter);
    this.ctrlDueAt = due;
    const deliver = (): void => {
      if (this.closed) return;
      this.stats.bytesIn += text.length;
      const m = decodeCtrl(text);
      if (m) this.onCtrl?.(m);
    };
    if (due <= t) deliver();
    else setTimeout(deliver, due - t);
  }

  private handleState(buf: Uint8Array): void {
    if (this.closed || buf.byteLength === 0) return;
    this.stats.bytesIn += buf.byteLength;
    const type = buf[0];
    if (type === MSG.PING) {
      if (this.open) this.rawState(encodePing(MSG.PONG, decodePingTime(buf)));
    } else if (type === MSG.PONG) {
      const sample = now() - decodePingTime(buf);
      this.stats.rtt = this.stats.rtt === 0 ? sample : this.stats.rtt * 0.8 + sample * 0.2;
    } else {
      this.onState?.(buf);
    }
  }

  private ping(): void {
    if (this.open && now() - this.lastRecvAt > LINK_TIMEOUT_MS) {
      this.close();
      return;
    }
    if (this.open) this.rawState(encodePing(MSG.PING, now()));
  }
}

/** The host's view of a game session: one link per joined player. */
export interface HostSession {
  readonly code: string;
  readonly links: ReadonlyMap<string, Link>;
  /** a player's link opened */
  onJoin: ((l: Link) => void) | null;
  /** a player's link closed */
  onLeave: ((l: Link) => void) | null;
  close(): void;
}

/** A player's view of a game session: one link to the host. */
export interface ClientSession {
  readonly code: string;
  readonly link: Link;
  close(): void;
}

/** In-memory link (tests): delivers straight to its partner. */
class PipeLink extends Link {
  other: PipeLink | null = null;

  protected rawState(buf: Uint8Array): void {
    this.other?.recvState(buf.slice());
  }
  protected rawCtrl(text: string): void {
    this.other?.recvCtrl(text);
  }
  protected rawClose(): void {
    const o = this.other;
    this.other = null;
    o?.close();
  }
  start(): void {
    this.markOpen();
  }
}

/** Two connected in-memory links (a <-> b), already open. Each side's conditions apply to what it receives. */
export function linkPair(condA: NetConditions = { lag: 0, jitter: 0, loss: 0 }, condB: NetConditions = condA, names: [string, string] = ['a', 'b']): [Link, Link] {
  const a = new PipeLink(names[1], condA); // a's peer is b
  const b = new PipeLink(names[0], condB);
  a.other = b;
  b.other = a;
  a.start();
  b.start();
  return [a, b];
}

export { makeCode, isCode } from './signalRoom';

export const randomId = (): string => Math.random().toString(36).slice(2, 10);

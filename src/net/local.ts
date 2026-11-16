import { Link, makeCode, randomId, netConditions, type ClientSession, type HostSession, type NetConditions } from './link';

/** Two (or more) tabs of the game on one PC talk over a BroadcastChannel: no server, no network.
 *  For developing and testing netcode; combine with netConditions to fake lag and loss. */

type Wire =
  | { k: 'join'; from: string }
  | { k: 'accept'; from: string; to: string }
  | { k: 'state'; from: string; to: string; d: Uint8Array }
  | { k: 'ctrl'; from: string; to: string; d: string }
  | { k: 'leave'; from: string; to?: string };

const channelName = (code: string): string => `ttb-net-${code}`;

class BcLink extends Link {
  constructor(
    private bc: BroadcastChannel,
    private me: string,
    peer: string,
    cond: NetConditions,
    /** the joining side owns its channel and closes it with the link */
    private ownsChannel = false,
  ) {
    super(peer, cond);
  }
  protected rawState(buf: Uint8Array): void {
    this.post({ k: 'state', from: this.me, to: this.peer, d: buf });
  }
  protected rawCtrl(text: string): void {
    this.post({ k: 'ctrl', from: this.me, to: this.peer, d: text });
  }
  protected rawClose(): void {
    this.post({ k: 'leave', from: this.me, to: this.peer });
    if (this.ownsChannel) this.bc.close();
  }
  start(): void {
    this.markOpen();
  }
  deliver(w: Wire): void {
    if (w.k === 'state') this.recvState(w.d);
    else if (w.k === 'ctrl') this.recvCtrl(w.d);
  }
  private post(w: Wire): void {
    try {
      this.bc.postMessage(w);
    } catch {
      // channel closed: the session is going away
    }
  }
}

export function hostLocal(code = makeCode(), cond: NetConditions = netConditions): HostSession {
  const me = randomId();
  const bc = new BroadcastChannel(channelName(code));
  const links = new Map<string, BcLink>();
  const session: HostSession = {
    code,
    links,
    onJoin: null,
    onLeave: null,
    close() {
      for (const l of [...links.values()]) l.close();
      bc.postMessage({ k: 'leave', from: me } satisfies Wire);
      bc.close();
    },
  };
  bc.onmessage = (ev: MessageEvent<Wire>) => {
    const w = ev.data;
    if (w.k === 'join') {
      if (links.has(w.from)) return;
      const l = new BcLink(bc, me, w.from, cond);
      links.set(w.from, l);
      l.onClose = () => {
        links.delete(w.from);
        session.onLeave?.(l);
      };
      bc.postMessage({ k: 'accept', from: me, to: w.from } satisfies Wire);
      l.start();
      session.onJoin?.(l);
      return;
    }
    if ('to' in w && w.to !== me) return;
    const l = links.get(w.from);
    if (!l) return;
    if (w.k === 'leave') l.close();
    else l.deliver(w);
  };
  return session;
}

/** Join a tab that is hosting `code`. Rejects if nobody answers within the timeout. */
export function joinLocal(code: string, cond: NetConditions = netConditions, timeoutMs = 2000): Promise<ClientSession> {
  const me = randomId();
  const bc = new BroadcastChannel(channelName(code));
  return new Promise((resolve, reject) => {
    let link: BcLink | null = null;
    const timer = setTimeout(() => {
      bc.close();
      reject(new Error(`No game hosting ${code} in another tab`));
    }, timeoutMs);
    bc.onmessage = (ev: MessageEvent<Wire>) => {
      const w = ev.data;
      if (!link) {
        if (w.k !== 'accept' || w.to !== me) return;
        clearTimeout(timer);
        const l = (link = new BcLink(bc, me, w.from, cond, true));
        l.start();
        resolve({ code, link: l, close: () => l.close() });
        return;
      }
      if (w.from !== link.peer || ('to' in w && w.to !== undefined && w.to !== me)) return;
      if (w.k === 'leave') link.close();
      else link.deliver(w);
    };
    bc.postMessage({ k: 'join', from: me } satisfies Wire);
  });
}

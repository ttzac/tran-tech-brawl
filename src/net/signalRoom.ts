/** Signalling: the tiny server part. It only introduces players to the host (room codes + WebRTC offer/answer/ICE relay);
 *  game traffic never goes through it. This file is pure logic shared by the dev server (tools/net/viteSignal.ts)
 *  and the Cloudflare Worker (server/signal/worker.ts), so both behave the same. No DOM or Node APIs here.
 *
 *  Client connects to  <signal url>?role=host            (server picks a free code)
 *                  or  <signal url>?role=guest&room=ABCD
 *  and speaks JSON (SignalIn / SignalOut below). Guests may only signal the host (star topology). */

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Server -> client */
export type SignalOut =
  | { t: 'welcome'; you: string; room: string; host: string; ice: IceServer[] }
  | { t: 'peer-joined'; id: string } // to the host
  | { t: 'peer-left'; id: string } // to the host
  | { t: 'signal'; from: string; data: unknown }
  | { t: 'host-left' } // to guests; the room is gone
  | { t: 'error'; code: 'no-room' | 'taken' | 'full' | 'bad-request'; msg: string };

/** Client -> server */
export type SignalIn = { t: 'signal'; to: string; data: unknown };

/** Host + up to 9 guests. */
export const MAX_PEERS = 10;
const MAX_MSG = 16 * 1024;

export interface Sock {
  send(text: string): void;
  close(code?: number, reason?: string): void;
}

const out = (s: Sock, m: SignalOut): void => {
  try {
    s.send(JSON.stringify(m));
  } catch {
    // socket already gone
  }
};

export class SignalRoom {
  host: string | null = null;
  private peers = new Map<string, Sock>();
  private seq = 0;

  constructor(readonly code: string) {}

  get size(): number {
    return this.peers.size;
  }

  /** Add a socket. Returns its peer id, or null if refused (an error was sent and the socket closed). */
  join(sock: Sock, role: 'host' | 'guest', ice: IceServer[]): string | null {
    const refuse = (code: 'no-room' | 'taken' | 'full', msg: string): null => {
      out(sock, { t: 'error', code, msg });
      sock.close(4000, code);
      return null;
    };
    if (role === 'host' && this.host) return refuse('taken', `Room ${this.code} already has a host`);
    if (role === 'guest' && !this.host) return refuse('no-room', `No game is hosting ${this.code}`);
    if (this.peers.size >= MAX_PEERS) return refuse('full', `Room ${this.code} is full`);

    const id = `${role === 'host' ? 'h' : 'p'}${++this.seq}`;
    this.peers.set(id, sock);
    if (role === 'host') this.host = id;
    out(sock, { t: 'welcome', you: id, room: this.code, host: this.host!, ice });
    if (role === 'guest') this.toHost({ t: 'peer-joined', id });
    return id;
  }

  /** A text frame from peer `id`. */
  message(id: string, text: string): void {
    const sock = this.peers.get(id);
    if (!sock) return;
    let m: SignalIn;
    try {
      if (text.length > MAX_MSG) throw new Error('too big');
      m = JSON.parse(text) as SignalIn;
      if (m.t !== 'signal' || typeof m.to !== 'string') throw new Error('bad');
    } catch {
      out(sock, { t: 'error', code: 'bad-request', msg: 'Unrecognised message' });
      return;
    }
    // star: guests talk to the host only; the host talks to anyone
    if (id !== this.host && m.to !== this.host) return;
    const to = this.peers.get(m.to);
    if (to) out(to, { t: 'signal', from: id, data: m.data });
  }

  /** Socket closed. When the host goes, everyone is told and dropped. */
  leave(id: string): void {
    if (!this.peers.delete(id)) return;
    if (id === this.host) {
      this.host = null;
      for (const s of this.peers.values()) {
        out(s, { t: 'host-left' });
        s.close(1000, 'host left');
      }
      this.peers.clear();
    } else {
      this.toHost({ t: 'peer-left', id });
    }
  }

  private toHost(m: SignalOut): void {
    const h = this.host ? this.peers.get(this.host) : undefined;
    if (h) out(h, m);
  }
}

/** Room codes: 4 letters, no look-alikes (O, I, L) and no M (M is the game's mute key). */
export const CODE_ALPHABET = 'ABCDEFGHJKNPQRSTUVWXYZ';
export function makeCode(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}
export const isCode = (s: string): boolean => /^[A-HJKNP-Z]{4}$/.test(s);

/** Default ICE servers when no TURN is configured: Cloudflare's public STUN (enough on LAN and most home NAT). */
export const DEFAULT_ICE: IceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];

/**
 * Production signalling for Tran Tech Brawl multiplayer: a Cloudflare Worker + one Durable Object per room code.
 * Same room logic as the dev server (src/net/signalRoom.ts). Game traffic never comes here: players only use it
 * to find the host and set up WebRTC, then the socket closes.
 *
 *   wss://<worker>/signal?role=host            -> new room, code in the welcome
 *   wss://<worker>/signal?role=guest&room=ABCD -> join
 *
 * Optional secrets/vars (see README.md): TURN_KEY_ID + TURN_KEY_API_TOKEN (Cloudflare Realtime TURN, for players whose
 * network blocks peer-to-peer), ALLOWED_ORIGINS (comma list, e.g. https://brawl.example.com; empty = allow all).
 */
import { DEFAULT_ICE, SignalRoom, makeCode, isCode, type IceServer, type Sock } from '../../src/net/signalRoom.ts';

// ---- minimal Workers runtime types (keeps this folder free of extra dependencies) ----
interface CfWebSocket extends Sock {
  accept(): void;
  addEventListener(type: 'message', cb: (e: { data: unknown }) => void): void;
  addEventListener(type: 'close' | 'error', cb: () => void): void;
}
declare const WebSocketPair: { new (): { 0: CfWebSocket; 1: CfWebSocket } };
interface DurableObjectId {}
interface DurableObjectStub {
  fetch(req: Request): Promise<Response>;
}
interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
interface Env {
  ROOMS: DurableObjectNamespace;
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
  ALLOWED_ORIGINS?: string;
}

const text = (status: number, body: string): Response => new Response(body, { status, headers: { 'content-type': 'text/plain' } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/health') return text(200, 'ttb-signal ok');
    if (url.pathname !== '/signal') return text(404, 'not found');
    if (req.headers.get('Upgrade') !== 'websocket') return text(426, 'expected a websocket');

    const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const origin = req.headers.get('Origin') ?? '';
    if (allowed.length && !allowed.includes(origin)) return text(403, 'origin not allowed');

    const role = url.searchParams.get('role') === 'host' ? 'host' : 'guest';
    let code = (url.searchParams.get('room') ?? '').toUpperCase();
    if (role === 'host') code = makeCode();
    else if (!isCode(code)) return text(400, 'room codes are 4 letters');
    url.searchParams.set('room', code);
    url.searchParams.set('role', role);

    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    return stub.fetch(new Request(url.toString(), req));
  },
};

/** One room. Lives only while sockets are connected; nothing is stored. */
export class Room {
  private room: SignalRoom | null = null;

  constructor(
    _state: unknown,
    private env: Env,
  ) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const code = url.searchParams.get('room') ?? '';
    const role = url.searchParams.get('role') === 'host' ? 'host' : 'guest';
    const room = (this.room ??= new SignalRoom(code));

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    const id = room.join(server, role, await this.iceServers());
    if (id) {
      server.addEventListener('message', (e) => room.message(id, typeof e.data === 'string' ? e.data : ''));
      const gone = (): void => {
        room.leave(id);
        if (room.size === 0) this.room = null;
      };
      server.addEventListener('close', gone);
      server.addEventListener('error', gone);
    }
    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }

  /** Short-lived TURN credentials when configured, else public STUN only. */
  private async iceServers(): Promise<IceServer[]> {
    const { TURN_KEY_ID: id, TURN_KEY_API_TOKEN: token } = this.env;
    if (!id || !token) return DEFAULT_ICE;
    try {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: 6 * 60 * 60 }),
      });
      if (!r.ok) throw new Error(`TURN ${r.status}`);
      const j = (await r.json()) as { iceServers?: IceServer[] };
      return j.iceServers?.length ? j.iceServers : DEFAULT_ICE;
    } catch {
      return DEFAULT_ICE; // TURN trouble shouldn't stop LAN / home players from connecting
    }
  }
}

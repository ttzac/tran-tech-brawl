import { Link, isCode, netConditions, type ClientSession, type HostSession, type NetConditions } from './link';
import type { IceServer, SignalOut } from './signalRoom';

/** WebRTC game links: one RTCPeerConnection per guest, star around the host, with two pre-negotiated data channels
 *  (id 0 "state" unordered/no retransmits = UDP-like, id 1 "ctrl" reliable/ordered). The host always makes the offer. */

const BUFFER_LIMIT = 64 * 1024; // skip unreliable sends while the channel is this backed up (stale state is useless)
const JOIN_TIMEOUT_MS = 15000;

type SignalData = { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit | null };

class RtcLink extends Link {
  readonly pc: RTCPeerConnection;
  private state: RTCDataChannel;
  private ctrl: RTCDataChannel;
  private pending: RTCIceCandidateInit[] = [];

  constructor(peer: string, ice: IceServer[], private sendSignal: (d: SignalData) => void, cond: NetConditions) {
    super(peer, cond);
    const pc = (this.pc = new RTCPeerConnection({ iceServers: ice as RTCIceServer[] }));
    this.state = pc.createDataChannel('state', { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 });
    this.ctrl = pc.createDataChannel('ctrl', { negotiated: true, id: 1, ordered: true });
    for (const ch of [this.state, this.ctrl]) {
      ch.binaryType = 'arraybuffer';
      ch.onopen = () => {
        if (this.state.readyState === 'open' && this.ctrl.readyState === 'open') this.markOpen();
      };
      ch.onclose = () => this.close();
    }
    this.state.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) this.recvState(new Uint8Array(e.data));
    };
    this.ctrl.onmessage = (e) => {
      if (typeof e.data === 'string') this.recvCtrl(e.data);
    };
    pc.onicecandidate = (e) => this.sendSignal({ candidate: e.candidate ? e.candidate.toJSON() : null });
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.close();
    };
  }

  /** Host side: make and send the offer. */
  async offer(): Promise<void> {
    await this.pc.setLocalDescription(await this.pc.createOffer());
    this.sendSignal({ sdp: this.pc.localDescription!.toJSON() });
  }

  /** Feed a message relayed by the signalling server. */
  async signal(d: SignalData): Promise<void> {
    try {
      if (d.sdp) {
        await this.pc.setRemoteDescription(d.sdp);
        if (d.sdp.type === 'offer') {
          await this.pc.setLocalDescription(await this.pc.createAnswer());
          this.sendSignal({ sdp: this.pc.localDescription!.toJSON() });
        }
        for (const c of this.pending.splice(0)) await this.pc.addIceCandidate(c);
      } else if (d.candidate) {
        if (this.pc.remoteDescription) await this.pc.addIceCandidate(d.candidate);
        else this.pending.push(d.candidate);
      }
    } catch (err) {
      console.warn('[net] signalling failed', err);
      this.close();
    }
  }

  /** ICE candidate type in use (host = LAN, srflx = through NAT, relay = TURN), for the net debug overlay. */
  async route(): Promise<string> {
    const stats = await this.pc.getStats();
    let pairId = '';
    stats.forEach((s) => {
      if (s.type === 'transport' && s.selectedCandidatePairId) pairId = s.selectedCandidatePairId;
    });
    const pair = pairId ? stats.get(pairId) : undefined;
    const local = pair ? stats.get(pair.localCandidateId) : undefined;
    return local?.candidateType ?? 'unknown';
  }

  protected rawState(buf: Uint8Array): void {
    if (this.state.readyState === 'open' && this.state.bufferedAmount < BUFFER_LIMIT) this.state.send(buf as Uint8Array<ArrayBuffer>);
  }
  protected rawCtrl(text: string): void {
    if (this.ctrl.readyState === 'open') this.ctrl.send(text);
  }
  protected rawClose(): void {
    this.state.close();
    this.ctrl.close();
    this.pc.close();
  }
}

/** WebSocket to the signalling server. */
class Signal {
  onMsg: ((m: SignalOut) => void) | null = null;
  onClose: (() => void) | null = null;
  private constructor(private ws: WebSocket) {
    ws.onmessage = (e) => {
      try {
        this.onMsg?.(JSON.parse(String(e.data)) as SignalOut);
      } catch {
        // ignore junk
      }
    };
    ws.onclose = () => this.onClose?.();
  }

  /** Connect and wait for the welcome (or the server's refusal). */
  static connect(url: string, role: 'host' | 'guest', room?: string): Promise<{ sig: Signal; welcome: Extract<SignalOut, { t: 'welcome' }> }> {
    const u = new URL(url, location.href);
    u.searchParams.set('role', role);
    if (room) u.searchParams.set('room', room);
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(u);
      const sig = new Signal(ws);
      sig.onMsg = (m) => {
        if (m.t === 'welcome') resolve({ sig, welcome: m });
        else if (m.t === 'error') reject(new Error(m.msg));
      };
      sig.onClose = () => reject(new Error('Could not reach the signalling server'));
    });
  }

  send(to: string, data: unknown): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'signal', to, data }));
  }

  close(): void {
    this.ws.close();
  }
}

/** Default signalling endpoint: VITE_SIGNAL_URL in production builds, the dev server's /signal while developing. */
export function defaultSignalUrl(): string {
  const env = import.meta.env.VITE_SIGNAL_URL as string | undefined;
  if (env) return env;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/signal`;
}

export interface RtcHostSession extends HostSession {
  routeOf(peer: string): Promise<string>;
}

/** Open a room and accept players. The signalling socket stays open so more players can join. */
export async function hostRtc(url = defaultSignalUrl(), cond: NetConditions = netConditions): Promise<RtcHostSession> {
  const { sig, welcome } = await Signal.connect(url, 'host');
  const links = new Map<string, RtcLink>();
  const session: RtcHostSession = {
    code: welcome.room,
    links,
    onJoin: null,
    onLeave: null,
    close() {
      sig.close();
      for (const l of [...links.values()]) l.close();
    },
    routeOf: (peer) => links.get(peer)?.route() ?? Promise.resolve('none'),
  };
  sig.onMsg = (m) => {
    if (m.t === 'peer-joined') {
      const l = new RtcLink(m.id, welcome.ice, (d) => sig.send(m.id, d), cond);
      links.set(m.id, l);
      let joined = false;
      // give up on a guest that never connects (blocked network); 'peer-left' can't be used for this because
      // guests close their signalling socket as soon as their side of the link is open
      const timer = setTimeout(() => !l.open && l.close(), JOIN_TIMEOUT_MS);
      l.onOpen = () => {
        joined = true;
        clearTimeout(timer);
        session.onJoin?.(l);
      };
      l.onClose = () => {
        clearTimeout(timer);
        if (links.get(m.id) === l) links.delete(m.id);
        if (joined) session.onLeave?.(l);
      };
      void l.offer();
    } else if (m.t === 'signal') {
      void links.get(m.from)?.signal(m.data as SignalData);
    }
  };
  return session;
}

/** Join a room by code. Resolves once the WebRTC link to the host is open. */
export async function joinRtc(code: string, url = defaultSignalUrl(), cond: NetConditions = netConditions): Promise<ClientSession> {
  const room = code.trim().toUpperCase();
  if (!isCode(room)) throw new Error('Room codes are 4 letters');
  const { sig, welcome } = await Signal.connect(url, 'guest', room);
  const link = new RtcLink(welcome.host, welcome.ice, (d) => sig.send(welcome.host, d), cond);
  sig.onMsg = (m) => {
    if (m.t === 'signal' && m.from === welcome.host) void link.signal(m.data as SignalData);
    else if (m.t === 'host-left' && !link.open) link.close();
  };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      link.close();
      sig.close();
      reject(new Error('Could not connect to the host (network blocked? try the same Wi-Fi, or set up TURN)'));
    }, JOIN_TIMEOUT_MS);
    link.onOpen = () => {
      clearTimeout(timer);
      sig.close(); // signalling is only needed to connect
      resolve({ code: room, link, close: () => link.close() });
    };
    link.onClose = () => {
      clearTimeout(timer);
      sig.close();
      reject(new Error('Connection to the host failed'));
    };
  });
}

import type Phaser from 'phaser';
import { netConditions, type ClientSession, type HostSession, type Link, type NetConditions } from './link';
import { hostLocal, joinLocal } from './local';
import { hostRtc, joinRtc, type RtcHostSession } from './rtc';
import { captureSnapshot, decodeSnapshot, encodeSnapshot } from './protocol';
import type { World } from '../sim/World';

/** Dev-only console helpers for poking at the network layer before the lobby exists (Phase 3).
 *  Tab A: await __net.host()        -> prints a room code
 *  Tab B: await __net.join('ABCD')  -> connects over WebRTC (use host('local') / join(code, 'local') for BroadcastChannel)
 *  Then: __net.chat('hi'), __net.stats(), __net.cond({ lag: 80, jitter: 20, loss: 0.05 }), __net.stream() on the host during a fight. */
export function installNetConsole(game: Phaser.Game): void {
  let host: HostSession | null = null;
  let client: ClientSession | null = null;
  let streamTimer: ReturnType<typeof setInterval> | null = null;
  const log: string[] = [];
  const recv = { snapshots: 0, bytes: 0, lastTick: 0, lastFighters: 0 };

  const note = (s: string): void => {
    log.push(s);
    console.info(`[net] ${s}`);
  };

  const wire = (l: Link): void => {
    l.onCtrl = (m) => note(`ctrl from ${l.peer}: ${JSON.stringify(m)}`);
    l.onState = (buf) => {
      const s = decodeSnapshot(buf);
      if (!s) return;
      recv.snapshots++;
      recv.bytes += buf.byteLength;
      recv.lastTick = s.tick;
      recv.lastFighters = s.fighters.length;
    };
  };

  const links = (): Link[] => (host ? [...host.links.values()] : client ? [client.link] : []);

  const api = {
    log,
    recv,
    async host(kind: 'rtc' | 'local' = 'rtc'): Promise<string> {
      api.close();
      host = kind === 'local' ? hostLocal() : await hostRtc();
      host.onJoin = (l) => {
        wire(l);
        note(`player ${l.peer} joined (${host!.links.size} connected)`);
      };
      host.onLeave = (l) => note(`player ${l.peer} left`);
      note(`hosting ${kind} room ${host.code}`);
      return host.code;
    },
    async join(code: string, kind: 'rtc' | 'local' = 'rtc'): Promise<string> {
      api.close();
      client = kind === 'local' ? await joinLocal(code) : await joinRtc(code);
      wire(client.link);
      client.link.onClose = () => note('disconnected from host');
      note(`joined ${kind} room ${client.code}`);
      return 'connected';
    },
    chat(text: string): void {
      for (const l of links()) l.sendCtrl({ t: 'chat', text });
    },
    cond(c: Partial<NetConditions>): NetConditions {
      return Object.assign(netConditions, c);
    },
    async stats(): Promise<Record<string, unknown>[]> {
      return Promise.all(
        links().map(async (l) => ({
          peer: l.peer,
          open: l.open,
          rtt: Math.round(l.stats.rtt * 10) / 10,
          bytesOut: l.stats.bytesOut,
          bytesIn: l.stats.bytesIn,
          dropped: l.stats.dropped,
          route: host && 'routeOf' in host ? await (host as RtcHostSession).routeOf(l.peer) : undefined,
        })),
      );
    },
    /** Host: send real 30 Hz snapshots of the running fight to every player (what Phase 3 will do). */
    stream(on = true): string {
      if (streamTimer) clearInterval(streamTimer);
      streamTimer = null;
      if (!on) return 'stopped';
      streamTimer = setInterval(() => {
        const fight = game.scene.getScene('Fight') as unknown as { world?: World } | null;
        const w = fight?.world;
        if (!w || !game.scene.isActive('Fight')) return;
        const buf = encodeSnapshot(captureSnapshot(w));
        for (const l of links()) l.sendState(buf);
      }, 1000 / 30);
      return 'streaming snapshots at 30 Hz';
    },
    close(): void {
      api.stream(false);
      host?.close();
      client?.close();
      host = client = null;
    },
  };
  (window as unknown as { __net: typeof api }).__net = api;
}

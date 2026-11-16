import type { Plugin } from 'vite';
import { WebSocketServer, type WebSocket } from 'ws';
import { DEFAULT_ICE, SignalRoom, makeCode, isCode } from '../../src/net/signalRoom.ts';

/** Dev-only signalling server on the Vite dev server: ws://localhost:5173/signal. Same room logic as the Cloudflare Worker,
 *  so `npm run dev` is all you need to test multiplayer on one PC or across the LAN (`npm run dev -- --host`). */
export function signalPlugin(): Plugin {
  return {
    name: 'ttb-signal',
    apply: 'serve',
    configureServer(server) {
      const rooms = new Map<string, SignalRoom>();
      const wss = new WebSocketServer({ noServer: true });

      server.httpServer?.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (url.pathname !== '/signal') return; // leave Vite's HMR socket alone
        wss.handleUpgrade(req, socket, head, (ws) => accept(ws, url.searchParams));
      });

      function accept(ws: WebSocket, q: URLSearchParams): void {
        const role = q.get('role') === 'host' ? 'host' : 'guest';
        let code = (q.get('room') ?? '').toUpperCase();
        if (role === 'host') {
          do code = makeCode();
          while (rooms.has(code));
        } else if (!isCode(code)) {
          ws.send(JSON.stringify({ t: 'error', code: 'bad-request', msg: 'Room codes are 4 letters' }));
          ws.close();
          return;
        }
        const room = rooms.get(code) ?? new SignalRoom(code);
        const id = room.join(ws, role, DEFAULT_ICE);
        if (!id) return;
        rooms.set(code, room);
        server.config.logger.info(`[signal] ${role} ${id} -> room ${code} (${room.size} connected)`, { timestamp: true });
        ws.on('message', (data) => room.message(id, String(data)));
        ws.on('close', () => {
          room.leave(id);
          if (room.size === 0) rooms.delete(code);
        });
      }
    },
  };
}

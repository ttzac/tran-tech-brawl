# Multiplayer signalling (Cloudflare Worker)

Players use this only to find the host and set up a WebRTC connection; game traffic goes player-to-host and never through here. Free-tier friendly: no storage, rooms live in memory while sockets are open.

While developing you don't need it: `npm run dev` serves the same thing at `ws://localhost:5173/signal` (`tools/net/viteSignal.ts`).

## Deploy (not done yet)
1. `cd server/signal` then `npx wrangler login` and `npx wrangler deploy`. It prints the URL, e.g. `https://ttb-signal.<you>.workers.dev`.
2. Build the game against it: set `VITE_SIGNAL_URL=wss://ttb-signal.<you>.workers.dev/signal` when running `npm run build` (for example in a `.env.production` file).
3. Set `ALLOWED_ORIGINS` in `wrangler.toml` to the game's URL so other sites can't use your signalling and TURN credentials.

## TURN (optional, for players behind strict networks)
Peer-to-peer works on the same LAN and on most home internet. Some office/mobile networks block it; TURN relays traffic for those players.
1. Cloudflare dashboard → Realtime → TURN → create a key.
2. `npx wrangler secret put TURN_KEY_ID` and `npx wrangler secret put TURN_KEY_API_TOKEN`.
The Worker then hands each player 6-hour TURN credentials (`generate-ice-servers` API). Without them it uses Cloudflare's public STUN only.

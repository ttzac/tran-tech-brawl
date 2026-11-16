# Online multiplayer: plan

Status: **Phases 1-5 done** (1-3 on 2026-11-06, 4-5 on 2026-11-16): online co-op and team brawl are playable with prediction, interpolation, AI takeover, rejoin and a host that keeps running in a hidden tab. Not done: lag compensation, host migration. Track progress in `TODO.md`.

## TL;DR
- **Architecture:** one player's browser is the **host** and runs the real fight (the code we have now: AI, combat, KOs). Other players send **inputs** and get **snapshots** back. Each client **predicts its own fighter** so controls feel instant, and **interpolates** everyone else.
- **Transport:** **WebRTC DataChannels** in a star around the host. The `state` channel is unordered with no retransmits (UDP-like) and carries inputs and snapshots. The `ctrl` channel is reliable and carries lobby messages, KOs and match end. No library needed: `RTCPeerConnection` is built into every browser.
- **Server:** only a tiny **signalling** service (room codes plus the WebRTC handshake), for example a Cloudflare Worker with a Durable Object. That's about 100 lines. Game traffic goes player-to-host, so there is no game server to run or pay for.
- **Upgrade path:** if this goes public later, run the same sim in Node on a Sydney server and swap the transport for **WebTransport datagrams** with a WebSocket fallback. The message format and sim stay the same.

## Why this and not the alternatives

### Transport (browser-compatible options, late 2026)
| Option | Latency under packet loss | Browser support | Server side | Fit |
|---|---|---|---|---|
| WebSocket | Worst. TCP head-of-line blocking: one lost packet stalls everything for 100+ ms | Everywhere | Trivial (`ws`, Durable Objects) | Signalling and lobby only |
| **WebRTC DataChannel** (unordered, `maxRetransmits: 0`) | **Best** (UDP-like) | Everywhere | **None for game traffic** (peer-to-peer). Needs signalling + STUN, plus TURN for the ~10-20% of networks that block P2P | **Chosen** |
| WebTransport datagrams | Best (QUIC/UDP) | Baseline since March 2026 (Safari 26.4) | Client-server only, no P2P. Node core `node:quic` is experimental and has no WebTransport yet, so it needs the native `@fails-components/webtransport` addon, a real TLS cert and a UDP-capable host (Fly.io has had QUIC hiccups; a plain VPS works) | Later, for a dedicated server |
| geckos.io | Best (WebRTC client/server) | Everywhere | Node server with an open UDP port range. Last release about a year old | Heavier ops than P2P for no gain here |
| Colyseus / Socket.IO | WebSocket underneath | Everywhere | Framework + server | Not the lowest latency, adds weight |

### Netcode model
| Model | Verdict |
|---|---|
| Rollback (GGPO-style) | No. Needs a bit-exact deterministic sim (Phaser Arcade + `Math.pow/cos/hypot` aren't guaranteed identical across browsers), and rollback cost and visual pops grow with 10 players plus AI |
| Lockstep | No. Everyone plays at the worst player's ping |
| **Authoritative host + client prediction + interpolation** (Quake/Overwatch model) | **Yes.** Suits co-op vs AI: bots, boss patterns and the spawner run in one place only. Tolerates non-determinism. Our `Intent` struct is already the input boundary (`Player.readInput` and `Bot.think` both just fill `fighter.intent`) |

### Why a browser host and not a dedicated server (for now)
- **Lowest latency for us:** the crew is mostly in one office or one city. Same LAN is about 1 ms, Brisbane home-to-home about 10-25 ms RTT. The nearest cloud regions are Sydney (about 15-20 ms each way from Brisbane before any game logic).
- **Lightest:** the game stays a static site. The host's browser already runs the whole fight in about 1.5 ms per frame. Host upload is about 100 KB/s for 9 clients (see bandwidth below).
- **Trade-offs we accept:** the host has 0 ping (fine in co-op), the match ends if the host leaves, and cheating is possible (irrelevant for internal fun).

## Latency budget (what players will feel)
| | Same office (LAN) | Brisbane, different homes | Brisbane to Sydney players |
|---|---|---|---|
| Own movement / jump / swing animation | Instant (predicted) | Instant | Instant |
| Hit confirmed (spark, damage %) | about 1 tick | about 1 RTT (20-40 ms) | about 1 RTT (40-60 ms) |
| Other players and enemies shown | about 50 ms in the past (interp buffer) | about 70-100 ms | about 100 ms |

## Phases

### Phase 1: sim core (single-player keeps working; biggest piece) ✅ done 2026-11-06
Built as: `src/sim/World.ts` (match setup + tick), `sim/kinematics.ts`, `sim/rng.ts`, `sim/events.ts`; `entities/Fighter.ts` and `Bot.ts` are now Phaser-free, drawn by `view/FighterView.ts` / `view/CombatView.ts`; `input/PlayerInput.ts` latches presses per tick. Arcade physics is no longer used. Tests in `tests/sim.test.ts`. Not yet done from the list below: running the sim in a Web Worker (Phase 5).

Goal: the fight logic runs on a fixed 60 Hz tick, uses no Phaser physics or `Math.random`, and keeps its state in plain data that can be snapshotted, replayed and later run in Node or a Web Worker.
1. **Fixed tick.** Accumulator in `FightScene.update`: step the sim in 16.667 ms ticks, render in between. Today `update` uses variable `delta` (capped 50) while Arcade physics already steps at a fixed 60 fps, so the two can drift.
2. **Own kinematics** in `src/sim/kinematics.ts` (pure functions): gravity 1400, max velocity 1100/1300, AABB vs static platforms, one-way platforms with drop-through (port `FightScene.platformCheck`), `grounded` flag. Shots are straight lines with no gravity. This replaces Arcade bodies for fighters and shots. It's small, because fighters only collide with static platforms and combat already uses its own rectangles.
3. **Split `Fighter`:** `FighterState` (plain data: x, y, vx, vy, facing, damage, stocks, hitstun, invuln, cooldowns, jumpsLeft, action, actionTimer, fireTimer) plus the sim step, and a `FighterView` sprite that only draws (animation, tint, lean, alpha blink). The same split for `Combat`: hit logic vs swing/fx pools.
4. **Side effects become events.** `sfx:*`, camera shake, dust, sparks and hit-flash come out of `Fighter.tick/takeHit` and go into a per-tick event list the view layer plays. The host replicates these events, and clients play them.
5. **Seeded RNG** (`src/sim/rng.ts`, mulberry32) replaces `Math.random` / `Phaser.Math.Between` in `ai/states.ts`, `Bot.ts`, `Spawner.ts`. Cosmetic randomness (`fx` flipX, menu particles) can stay random.
6. **Tests:** kinematics (landing, one-way platforms, drop-through, ledge jump loss), same seed + same inputs gives the same state, `npm run build` and play-test unchanged feel.

### Phase 2: net layer (no gameplay change yet) ✅ done 2026-11-06
Built as: `src/net/protocol.ts` (codecs, `captureSnapshot`/`applyFighterSnap`, ctrl messages, `toNetEvent`, `toNetMatch`/`fromNetMatch`), `net/link.ts` (`Link` base: ping/RTT, stats, `netConditions`; in-memory `linkPair` for tests; `HostSession`/`ClientSession`), `net/rtc.ts` (`hostRtc`/`joinRtc`), `net/local.ts` (`hostLocal`/`joinLocal`, BroadcastChannel), `net/signalRoom.ts` (room logic shared by `tools/net/viteSignal.ts` and `server/signal/worker.ts`), `net/devConsole.ts` (`window.__net`, dev only). Tests: `tests/net.test.ts`. Differences from the sketch below: ctrl messages (lobby, events, match start) are JSON, since they are rare; only input and snapshot are binary. The client World is rebuilt from the same `NetMatchConfig`, so fighter ids match the host's without sending them; minions still need a spawn message (Phase 3).

- `src/net/protocol.ts`: binary codecs (DataView, no dependencies), each with a round-trip test.
  - `Input` (client to host, every tick): tick number, dir (2 bits), held drop, pulse bits (jump/attack/special) tagged with the tick they were pressed. **Each packet repeats the last 4 inputs**, so a lost packet never eats a jump.
  - `Snapshot` (host to client, 30 Hz): host tick, last input tick processed per player (the ack), and per fighter: id, x/y as int16, vx/vy as int16, facing, anim state, damage, stocks, flags (hitstun, invuln, alive). Plus live shots. About 16 bytes per fighter and 8 per shot, so about 400 bytes per snapshot.
  - `Event` (reliable): hit (target, power), KO, spawn/despawn minion, wave, match start (heroes, boss, seed), match end.
  - `Lobby` (reliable): hello/name, hero pick, ready, start.
- `src/net/transport.ts`: a `Transport` interface with unreliable `send` and reliable `sendReliable`, plus three implementations:
  - `RtcTransport`: two DataChannels, `state` (`ordered:false, maxRetransmits:0`) and `ctrl` (reliable).
  - `BroadcastChannelTransport`: two browser tabs on one PC, no network. Used for dev and tests, with **artificial lag/jitter/loss knobs**.
  - `LoopbackTransport` for vitest.
- `src/net/signal.ts` (client) and `server/signal/` (Cloudflare Worker + Durable Object per room code): relays offer/answer/ICE over WebSocket and hands out short-lived TURN credentials. ICE: STUN `stun:stun.cloudflare.com:3478`, TURN via Cloudflare Realtime TURN (free tier). A local `tools/net/signal-dev.mjs` (`ws`) for offline dev.

### Phase 3: lobby and host/client fight modes ✅ done 2026-11-06
Built as: `net/NetHost.ts` (seats, lobby broadcast, match start, `beforeTick`/`afterTick` feeding `RemoteInput`s and sending snapshots + events at 30 Hz), `net/RemoteInput.ts` (one input per tick, late ticks hold movement, backlog merged at 3 so delay stays bounded, presses never lost), `net/NetClient.ts` (lobby state, `sendInput` each tick, `sync()` mirrors fighters/minions/shots from the newest snapshot, drawn one snapshot interval behind), `net/session.ts` (the one session per tab, `goto()` scene routing for start / back to lobby / disconnect), `scenes/LobbyScene.ts`; FightScene `mode` solo/host/client. Duplicate hero picks are allowed. A guest who drops mid-match leaves their fighter standing still (Phase 5 hands it to the AI). Tests: `tests/netgame.test.ts` (host + client over an in-memory link: lobby, 12 s of play with exact mirroring, minions, back to lobby, leave, version refusal).

- Menu: **Host game** / **Join game** (4-letter code, or `?room=ABCD` link). New `LobbyScene`: player list with pings, each picks a hero (duplicate picks allowed?), host picks the boss, ready-up, host starts.
- **Host** `FightScene`: humans take hero slots first, and **empty slots stay AI allies** exactly as now. New `RemotePlayer extends Fighter` fills `intent` from its input buffer (one input per tick; if one is missing, it repeats `dir`/`drop` and drops pulses). The host sends snapshots every 2nd tick and events on `ctrl`.
- **Client** `FightScene`: no AI, spawner or hit resolution. It builds `FighterView`s from snapshots, plays replicated events (sfx, fx, shake), and the HUD reads replicated state (HUD already takes plain data via `HUDData`). The camera follows its own fighter; spectating works as now.
- Gameplay settings come from the host (seed, loadouts, so Character Manager gear of each player travels in the match start).

### Phase 4: feel (what makes it feel local) ✅ done 2026-11-16 (except lag compensation)
Built as:
- **Prediction** (`NetClient.sendInput`): each client tick the input is sent and applied to the player's own fighter at once with `World.predictStep` (the same `stepBody` + `Fighter.tick` the host runs). The client World has `predicting = true`, so a predicted swing / special only makes its event (slash, sound): hitboxes, shots and the ultimate blast stay the host's.
- **Reconciliation** (`NetClient.reconcile`): on every new snapshot the fighter is put back to the host's state after input `ack` (private timers such as cooldowns come from a memo saved at that input, `Fighter.capture / restore`), then the unacknowledged inputs are replayed with events muted. If the result differs from what was on screen by more than 0.75 px it counts as a correction and the sprite glides to the new spot over about 90 ms (`Fighter.offX / offY`, drawn by `FighterView`); more than 220 px (respawn) snaps. With no outside interference (walk, jump, drop, attack, special at 0 / 100 / 270 ms round trip) the tests see zero corrections.
- Prediction starts with the first acknowledged input and pauses while the fighter is KO'd or the match is over (then it is mirrored like everyone else). The host's copies of `jump / land / swing / special / ledge` and ultimate-start events for the local fighter are dropped, since the client already played them.
- **Interpolation** (`NetClient.drawOthers`): snapshots go into a small buffer; the host clock is estimated from arrival times; other fighters are drawn at (host time - delay), blended between the two snapshots around that moment. Delay = 2 snapshot intervals (67 ms), more when arrivals wobble (up to 200 ms). A late snapshot: coast on the last velocity for one interval. Jumps over 220 px between snapshots are not blended. Events wait until the drawn moment reaches their tick, so sparks line up with what is on screen. Shots are placed exactly (they fly straight).
- **Net overlay**: F3 in an online fight replaces the info line with ping, interpolation delay, inputs in flight and corrections (host: each player's ping).
- Not built: **lag compensation** on the host for remote players' hits. Hits are judged where enemies are on the host, so at high ping a swing that looks on target can miss a fast minion.
- Tests: `tests/netplay.test.ts` (in-memory links with a fixed packet delay).

Original plan:
- **Prediction + reconciliation** for your own fighter: apply your input locally right away with the Phase 1 kinematics. On each snapshot, reset to the host's state at your acked input tick, then replay the inputs not yet acked. Smooth small corrections over about 100 ms instead of snapping.
- **Interpolation** for everyone else: render about 2 snapshots behind (adaptive to measured jitter, about 50-100 ms). Extrapolate at most 1 snapshot if one is late.
- **Predicted actions:** own swing animation, slash and swing sfx play instantly. The spark, damage and launch come from the host. Hitstun on yourself snaps to the host.
- **Lag compensation on the host** for remote players' melee and specials: the host keeps 200 ms of fighter positions and checks a remote player's swing against where enemies were *on that player's screen* (capped at 150 ms). Without it, hits on fast minions feel unfair at 40+ ms.
- **Net HUD** (dev toggle): RTT, loss %, snapshot age, corrections per second. Test with the BroadcastChannel transport at 50/100/150 ms + 5% loss.

### Phase 5: robustness ✅ done 2026-11-16 (except host migration)
Built as:
- **AI takeover**: human fighters are `Bot`s with `manual = true`; `World.setAutopilot(i, on)` hands one to the AI. `NetHost.beforeTick` does that for a player whose link closed, or who has sent nothing for 150 ticks (2.5 s: hidden tab, frozen PC), and gives control back when inputs return. A held direction is released after 20 silent ticks, so nobody runs off the stage.
- **Rejoin**: the host's `welcome` carries a seat token. If a client's link dies without a refusal, `session.ts` sends it to the lobby's "Connection lost" screen, which re-joins the room code with the token every 1.5 s for 20 s. The host keeps a dropped player's seat for 30 s (`REJOIN_MS`); a hello with a known token re-attaches the link and re-sends `start` (`resume: true`), so the player is back on the same fighter. Strangers are still refused mid-match; a page refresh loses the token.
- **Dead links**: a link that receives nothing for 10 s closes itself (`LINK_TIMEOUT_MS`), so a closed laptop lid is noticed on both sides.
- **Hidden host tab**: `net/background.ts` runs a tiny Web Worker timer; while the tab is hidden and hosting, its ticks call `game.step`, so the sim, the network and scene changes keep running without animation frames. Checked with a simulated hidden tab (the fight ran in real time with zero frames). The host's own fighter is not taken over by the AI; clients in a hidden tab are (see above).
- **Host leaves**: guests get "The host ended the game" (deliberate) or try to rejoin and then give up (crash). No host migration.
- **Modes**: the lobby message carries the mode. Boss co-op and Team Brawl work online (`NetMatchConfig.mode / rivals`; brawl maps come from the match seed; crates travel in snapshots). Dungeon Crawl is solo only and the lobby says so. Protocol version is now 2.

Original plan:
- A client drops: its fighter **becomes a Bot** (the class exists) until they rejoin (30 s window, same slot).
- The host leaves: the match ends with a message. Host migration is not planned.
- **Background-tab throttling:** browsers slow hidden tabs to about 1 fps (we already see this in the preview pane), which would freeze the host's sim. v1: warn the host to keep the tab visible and pause the match if it isn't. v2: move the sim tick into a Web Worker (possible once Phase 1 makes the sim Phaser-free).
- Touch and gamepad players can join; recommend the host is on a desktop.

## Bandwidth
- Client to host: about 60 packets/s × about 20 bytes, about 1.2 KB/s.
- Host to each client: 30 snapshots/s × about 450 bytes, about 13.5 KB/s, so **about 120 KB/s up for 9 clients** (fine on NBN). Delta-compress later only if needed.

## Decisions needed (you)
1. **Who can humans play?** Plan assumes **up to 5 humans on the hero team** (empty slots = AI allies) vs AI boss + minions. "10 real players" means humans also play the boss/minions, which turns it partly PvP: that needs boss controls for a human and fairer lag compensation. Do co-op first?
2. **Free-for-all** later or never? (TODO already asks.) It works on the same netcode, but host advantage matters more in PvP.
3. **Hosting:** static game plus signalling on Cloudflare (Pages + Worker + Durable Object + TURN, free tiers), or keep the static site on Vercel with only signalling on Cloudflare? Vercel functions can't hold the signalling WebSockets.

## Later: dedicated server (only if the game goes public)
Run `src/sim` in Node on a Sydney VPS, using the same protocol. The transport becomes WebTransport datagrams with a WebSocket fallback. This adds fairness (no host advantage), no NAT/TURN issues and host-leave immunity, at the cost of about $5-10 a month and ops work.

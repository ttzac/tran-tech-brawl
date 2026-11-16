import { heroes } from '../data/heroes';
import { bosses } from '../data/bosses';
import { applyLoadout, sanitizeLoadout, type Loadout } from '../data/items';
import type { FighterDef } from '../data/types';
import type { World, MatchConfig } from '../sim/World';
import { Rng } from '../sim/rng';
import { randomSeed } from '../sim/rng';
import type { HostSession, Link } from './link';
import {
  PROTOCOL_VERSION,
  captureSnapshot,
  decodeInput,
  encodeSnapshot,
  fromNetMatch,
  toNetEvent,
  type CtrlMsg,
  type LobbyPlayer,
  type NetEvent,
  type NetMatchConfig,
} from './protocol';
import { RemoteInput } from './RemoteInput';
import { emptyIntent } from '../entities/Fighter';
import { allyLoadout } from '../systems/Loadout';

/** Humans on the hero team (empty places are AI allies). */
export const MAX_HUMANS = 5;
const TEAM_SIZE = 5;
/** Snapshot every 2nd tick = 30 Hz. */
const SNAPSHOT_EVERY = 2;
const LOBBY_REFRESH_MS = 2000;
/** A player who drops mid-match keeps their seat this long (the AI plays for them meanwhile). */
export const REJOIN_MS = 30000;
const BRAWL_TEAM = 4;

interface Seat {
  slot: number;
  name: string;
  hero: string;
  loadout: Loadout;
  ready: boolean;
  link: Link | null; // null = the host
  /** secret the player shows to take this seat back after a dropped connection */
  token: string;
  /** dropped mid-match at this time (ms); 0 = connected */
  goneAt: number;
}

/** Host side of an online game: the lobby (seats, picks, ready), then during a match it feeds remote inputs
 *  into the World and streams snapshots + events back. Phaser-free: FightScene / LobbyScene call into it. */
export class NetHost {
  readonly role = 'host';
  bossIndex = 0;
  /** what the next match is: co-op vs a boss, or team brawl (dungeon runs are solo only) */
  mode: 'boss' | 'brawl' = 'boss';
  inMatch = false;
  /** in-match message for the host's own screen (the same text is sent to every player) */
  onNotice: ((text: string) => void) | null = null;
  /** last refusal / join / leave message for the lobby screen */
  notice = '';

  private seats: Seat[] = [];
  private lobbyTimer: ReturnType<typeof setInterval>;
  // match state
  private world: World | null = null;
  /** world.humans index -> seat (index 0 is the host) */
  private matchSeats: Seat[] = [];
  private inputs = new Map<Link, RemoteInput>();
  private pending: NetEvent[] = [];
  private acks: number[] = [];
  private match: NetMatchConfig | null = null;

  constructor(
    readonly session: HostSession,
    hero: string,
    loadout: Loadout,
    name = 'Host',
  ) {
    this.seats.push({ slot: 0, name, hero, loadout, ready: true, link: null, token: '', goneAt: 0 });
    session.onJoin = (l) => this.join(l);
    session.onLeave = (l) => this.leave(l);
    this.lobbyTimer = setInterval(() => !this.inMatch && this.broadcastLobby(), LOBBY_REFRESH_MS); // keeps pings fresh
  }

  get code(): string {
    return this.session.code;
  }

  get players(): LobbyPlayer[] {
    return this.seats.filter((s) => !s.goneAt).map((s) => ({ slot: s.slot, name: s.name, hero: s.hero, ready: s.ready, ping: s.link ? Math.round(s.link.stats.rtt) : 0 }));
  }

  /** Every guest is ready (a host on their own may start too). */
  get canStart(): boolean {
    return !this.inMatch && this.seats.every((s) => s.ready);
  }

  // ---- lobby ----------------------------------------------------------------------------------

  setHero(hero: string, loadout: Loadout): void {
    this.seats[0].hero = hero;
    this.seats[0].loadout = loadout;
    this.broadcastLobby();
  }

  setBoss(i: number): void {
    this.bossIndex = ((i % bosses.length) + bosses.length) % bosses.length;
    this.broadcastLobby();
  }

  setMode(mode: 'boss' | 'brawl'): void {
    this.mode = mode;
    this.broadcastLobby();
  }

  /** Build the match, tell every guest, and return the config for the host's own FightScene (host = human 0). */
  start(seed = randomSeed()): { match: NetMatchConfig; config: MatchConfig } {
    const seats = [...this.seats].sort((a, b) => a.slot - b.slot).slice(0, MAX_HUMANS);
    const humans: FighterDef[] = seats.map((s) => applyLoadout(heroDef(s.hero), s.loadout));
    // AI allies fill the team, preferring heroes nobody picked
    const taken = new Set(seats.map((s) => s.hero));
    const pool = heroes.filter((h) => !taken.has(h.id));
    const allies: FighterDef[] = [];
    let match: NetMatchConfig;
    if (this.mode === 'brawl') {
      // the players (+ AI up to 4) vs a rival crew of the same size, drawn from the heroes nobody picked
      const rng = new Rng(seed);
      const draw = (i: number): FighterDef => {
        const src = pool.length ? pool : [...heroes];
        const h = src.splice(rng.int(0, src.length - 1), 1)[0];
        return applyLoadout(h, allyLoadout(h.id, i));
      };
      const size = Math.max(BRAWL_TEAM, humans.length);
      for (let i = 0; humans.length + allies.length < size; i++) allies.push(draw(i));
      const rivals: FighterDef[] = [];
      for (let i = 0; i < size; i++) rivals.push({ ...draw(i + 3), stocks: 3 });
      match = { mode: 'brawl', bossIndex: this.bossIndex, humans, allies, rivals, seed };
    } else {
      for (let i = 0; humans.length + allies.length < TEAM_SIZE; i++) allies.push(aiAlly(pool.length ? pool : heroes, i));
      match = { bossIndex: this.bossIndex, humans, allies, seed };
    }
    this.match = match;
    this.matchSeats = seats;
    this.inMatch = true;
    seats.forEach((s, i) => s.link?.sendCtrl({ t: 'start', match, slot: i }));
    return { match, config: fromNetMatch(match) };
  }

  /** After the results screen: everyone back to the lobby, ready flags cleared. */
  backToLobby(): void {
    this.endMatch();
    this.seats = this.seats.filter((s) => !s.goneAt); // anyone still missing has lost their seat
    for (const s of this.seats) s.ready = s.link === null;
    this.broadcastLobby();
  }

  close(): void {
    clearInterval(this.lobbyTimer);
    this.endMatch();
    for (const s of this.seats) s.link?.sendCtrl({ t: 'refuse', reason: 'The host ended the game' }); // tells guests why
    this.session.close();
  }

  // ---- match ----------------------------------------------------------------------------------

  /** FightScene built the World from start()'s config. */
  beginMatch(world: World): void {
    this.world = world;
    this.inputs.clear();
    this.pending.length = 0;
    this.acks = this.matchSeats.map(() => 0);
    for (const s of this.matchSeats) {
      if (!s.link) continue;
      const ri = new RemoteInput();
      ri.connected = s.link.open;
      this.inputs.set(s.link, ri);
    }
  }

  /** Before world.step(): remote humans' intents for this tick. */
  beforeTick(): void {
    const w = this.world;
    if (!w) return;
    this.matchSeats.forEach((s, i) => {
      if (i === 0 && !s.link) return; // the host plays from this PC
      const ri = s.link ? this.inputs.get(s.link) : undefined;
      // a player who dropped out or went quiet is played by the AI until they are back
      const away = !ri || ri.away;
      w.setAutopilot(i, away);
      if (!ri) return;
      if (away) ri.apply(scratch); // keep draining their packets so we notice when they return
      else ri.apply(w.humans[i].intent);
      this.acks[i] = ri.applied;
    });
  }

  /** After world.step() (before the scene clears world.events): queue events, send a snapshot every 2nd tick. */
  afterTick(): void {
    const w = this.world;
    if (!w) return;
    for (const e of w.events) if (e.k !== 'spawn' && e.k !== 'despawn') this.pending.push(toNetEvent(e)); // roster travels in snapshots
    if (w.tick % SNAPSHOT_EVERY !== 0) return;
    const snap = encodeSnapshot(captureSnapshot(w, this.acks));
    const events = this.pending.length ? ({ t: 'events', tick: w.tick, list: this.pending.splice(0) } as const) : null;
    for (const s of this.matchSeats) {
      if (!s.link?.open) continue;
      if (events) s.link.sendCtrl(events);
      s.link.sendState(snap);
    }
  }

  endMatch(): void {
    this.world = null;
    this.inMatch = false;
    this.inputs.clear();
    this.matchSeats = [];
    this.match = null;
  }

  // ---- connections ----------------------------------------------------------------------------

  private join(l: Link): void {
    l.onCtrl = (m) => this.onCtrl(l, m);
    l.onState = (buf) => {
      const m = decodeInput(buf);
      if (m) this.inputs.get(l)?.push(m);
    };
    // the seat is created when the guest says hello (so we can check its version first)
  }

  private leave(l: Link): void {
    const seat = this.seats.find((s) => s.link === l);
    if (!seat) return;
    const ri = this.inputs.get(l);
    if (ri) ri.connected = false; // beforeTick hands their fighter to the AI
    this.inputs.delete(l);
    seat.link = null;
    if (this.inMatch && this.matchSeats.includes(seat)) {
      // mid-match: hold the seat so they can come back to their own fighter
      seat.goneAt = Date.now();
      this.say(`${seat.name} dropped out: AI took over`);
      setTimeout(() => {
        if (seat.goneAt && !seat.link) this.seats = this.seats.filter((s) => s !== seat);
      }, REJOIN_MS);
    } else {
      this.seats = this.seats.filter((s) => s !== seat);
      this.notice = `${seat.name} left`;
    }
    this.broadcastLobby();
  }

  private onCtrl(l: Link, m: CtrlMsg): void {
    const seat = this.seats.find((s) => s.link === l);
    switch (m.t) {
      case 'hello': {
        if (seat) return;
        const refuse = (reason: string): void => {
          l.sendCtrl({ t: 'refuse', reason });
          setTimeout(() => l.close(), 250); // let the refusal arrive first
        };
        if (m.v !== PROTOCOL_VERSION) return refuse('Different game version: refresh the page on both PCs');
        const old = m.token ? this.seats.find((s) => s.token === m.token && s.slot !== 0) : undefined;
        if (old) return this.rejoin(old, l);
        if (this.inMatch) return refuse('A match is in progress: try again after it');
        if (this.seats.length >= MAX_HUMANS) return refuse('The game is full');
        const slot = this.freeSlot();
        const name = cleanName(m.name) || `Player ${slot + 1}`;
        const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
        this.seats.push({ slot, name, hero: heroes[slot % heroes.length].id, loadout: sanitizeLoadout(undefined), ready: false, link: l, token, goneAt: 0 });
        l.sendCtrl({ t: 'welcome', v: PROTOCOL_VERSION, slot, token });
        this.notice = `${name} joined`;
        this.broadcastLobby();
        return;
      }
      case 'pick':
        if (!seat || this.inMatch || !heroes.some((h) => h.id === m.hero)) return;
        seat.hero = m.hero;
        seat.loadout = sanitizeLoadout(m.loadout);
        this.broadcastLobby();
        return;
      case 'ready':
        if (!seat || this.inMatch) return;
        seat.ready = !!m.ready;
        this.broadcastLobby();
        return;
      case 'bye':
        l.close();
        return;
      default:
        return;
    }
  }

  /** A player is back on a new connection: give them their seat, and their fighter if the match is still on. */
  private rejoin(seat: Seat, l: Link): void {
    const stale = seat.link;
    seat.link = l;
    seat.goneAt = 0;
    if (stale) {
      this.inputs.delete(stale);
      stale.close(); // (leave() no longer finds a seat for it)
    }
    l.sendCtrl({ t: 'welcome', v: PROTOCOL_VERSION, slot: seat.slot, token: seat.token });
    const i = this.matchSeats.indexOf(seat);
    if (this.inMatch && this.match && i >= 0) {
      this.inputs.set(l, new RemoteInput());
      l.sendCtrl({ t: 'start', match: this.match, slot: i, resume: true });
      this.say(`${seat.name} is back`);
    } else {
      seat.ready = false;
      this.notice = `${seat.name} is back`;
    }
    this.broadcastLobby();
  }

  /** Message for everyone in the match (and the lobby line). */
  private say(text: string): void {
    this.notice = text;
    this.onNotice?.(text);
    for (const s of this.matchSeats) if (s.link?.open) s.link.sendCtrl({ t: 'notice', text });
  }

  private freeSlot(): number {
    for (let i = 1; ; i++) if (!this.seats.some((s) => s.slot === i)) return i;
  }

  broadcastLobby(): void {
    if (this.inMatch) return; // a lobby message tells clients the match is over
    const msg = { t: 'lobby', players: this.players, bossIndex: this.bossIndex, mode: this.mode } as const;
    for (const s of this.seats) if (s.link?.open) s.link.sendCtrl(msg);
  }
}

const scratch = emptyIntent();

function heroDef(id: string): FighterDef {
  return heroes.find((h) => h.id === id) ?? heroes[0];
}

/** Same themed gear the solo game gives AI allies. */
function aiAlly(pool: FighterDef[], i: number): FighterDef {
  const base = pool[i % pool.length];
  return applyLoadout(base, allyLoadout(base.id, i));
}

const cleanName = (s: unknown): string => (typeof s === 'string' ? s.replace(/[^\w .'-]/g, '').trim().slice(0, 16) : '');

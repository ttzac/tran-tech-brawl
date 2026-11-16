import type { Loadout } from '../data/items';
import type { Fighter, FighterMemo, Intent } from '../entities/Fighter';
import type { Shot } from '../systems/Combat';
import type { World } from '../sim/World';
import { TICK_MS } from '../sim/kinematics';
import type { ClientSession } from './link';
import {
  INPUT_REDUNDANCY,
  PROTOCOL_VERSION,
  applyCrates,
  applyFighterSnap,
  decodeSnapshot,
  encodeInput,
  fromNetEvent,
  packIntent,
  unpackIntent,
  type CtrlMsg,
  type FighterSnap,
  type LobbyPlayer,
  type NetEvent,
  type NetMatchConfig,
  type SnapshotMsg,
} from './protocol';

/** Host snapshot spacing (30 Hz). */
export const SNAPSHOT_MS = 1000 / 30;
/** Other fighters are drawn this far in the past at least, so there are always two snapshots to blend between. */
const INTERP_MIN_MS = SNAPSHOT_MS * 2;
const INTERP_MAX_MS = 200;
/** A late snapshot: keep fighters moving on their last velocity for at most this long. */
const EXTRAPOLATE_MS = SNAPSHOT_MS;
/** Bigger jumps than this between snapshots (respawn, ledge snap) are not blended. */
const TELEPORT_PX = 220;
/** Prediction errors under this are left alone; bigger ones are corrected and the sprite glides to the new spot. */
const CORRECT_PX = 0.75;
const SMOOTH_MS = 90;
const HISTORY = 240;
/** Events the client already played from its own prediction (so the host's copy for the local fighter is skipped). */
const PREDICTED = new Set(['jump', 'land', 'swing', 'special', 'ledge']);

const realNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Player side of an online game: lobby state from the host, then during a match it
 *  - sends this player's inputs every tick and predicts their own fighter straight away (no waiting for the host),
 *  - on every snapshot rewinds that fighter to the host's state and replays the inputs the host has not seen yet,
 *  - draws everyone else a few snapshots in the past, blended between the two snapshots around that moment.
 *  Phaser-free. */
export class NetClient {
  readonly role = 'client';
  slot = -1;
  players: LobbyPlayer[] = [];
  bossIndex = 0;
  mode: 'boss' | 'brawl' = 'boss';
  inMatch = false;
  notice = '';
  /** given by the host at welcome: lets this player take their seat back after a dropped connection */
  token = '';

  /** Called when the host starts (or, after a rejoin, resumes) a match. A start that arrived before a handler was set is delivered when one is. */
  get onStart(): ((match: NetMatchConfig, humanIndex: number) => void) | null {
    return this.startHandler;
  }
  set onStart(fn: ((match: NetMatchConfig, humanIndex: number) => void) | null) {
    this.startHandler = fn;
    const p = this.pendingStart;
    if (fn && p) {
      this.pendingStart = null;
      fn(p.match, p.slot);
    }
  }
  private startHandler: ((match: NetMatchConfig, humanIndex: number) => void) | null = null;
  private pendingStart: { match: NetMatchConfig; slot: number } | null = null;
  onBackToLobby: (() => void) | null = null;
  /** lost = the connection died on its own (worth trying to rejoin); false = refused, host ended the game, or we left */
  onClosed: ((reason: string, lost: boolean) => void) | null = null;
  /** in-match message from the host ("Bob dropped out: AI took over") */
  onNotice: ((text: string) => void) | null = null;

  /** projectiles at the drawn moment, for CombatView */
  readonly shots: Shot[] = [];
  /** newest input seq the host has applied for us */
  acked = 0;
  /** false = no prediction: the local fighter is drawn from snapshots like everyone else (dev comparison) */
  predict = true;
  /** for the net overlay */
  /** local clock in ms (tests swap in a fake one) */
  clock: () => number = realNow;
  readonly stats = { corrections: 0, lastError: 0, delay: 0, buffered: 0, pending: 0 };

  private closedReason = 'Lost connection to the host';
  private deliberate = false;
  private world: World | null = null;
  private humanIndex = 0;
  private local: Fighter | null = null;
  /** our fighter is being predicted right now (false while it is KO'd or the match is over: then it is mirrored like the rest) */
  private predicting = false;
  private seq = 0;
  private history: number[] = [];
  /** packed inputs and fighter memos by input seq, for replay */
  private sent = new Map<number, number>();
  private memos = new Map<number, FighterMemo>();
  /** snapshots not yet drawn past, oldest first */
  private buf: SnapshotMsg[] = [];
  private reconciledTick = -1;
  /** host clock minus local clock (ms), smoothed; and how much arrival times wobble */
  private offset = NaN;
  private jitter = 0;
  private lastSyncAt = 0;
  private events: { tick: number; e: NetEvent }[] = [];
  private shotPool: Shot[] = [];

  constructor(
    readonly session: ClientSession,
    name = '',
    token = '',
  ) {
    const l = session.link;
    l.onCtrl = (m) => this.onCtrl(m);
    l.onState = (buf) => {
      const s = decodeSnapshot(buf);
      if (s) this.receive(s);
    };
    l.onClose = () => {
      this.endMatch();
      this.onClosed?.(this.closedReason, !this.deliberate && this.slot >= 0);
    };
    l.sendCtrl({ t: 'hello', v: PROTOCOL_VERSION, name, token: token || undefined });
  }

  get code(): string {
    return this.session.code;
  }

  get rtt(): number {
    return this.session.link.stats.rtt;
  }

  pick(hero: string, loadout: Loadout): void {
    this.session.link.sendCtrl({ t: 'pick', hero, loadout });
  }

  ready(ready: boolean): void {
    this.session.link.sendCtrl({ t: 'ready', ready });
  }

  /** Is this player ready, according to the host's last lobby update? */
  get isReady(): boolean {
    return this.players.find((p) => p.slot === this.slot)?.ready ?? false;
  }

  close(): void {
    this.closedReason = 'You left the game';
    this.deliberate = true;
    this.session.link.sendCtrl({ t: 'bye' });
    this.session.close();
  }

  // ---- match ----------------------------------------------------------------------------------

  /** FightScene built a World from the host's match config (same fighter ids as the host's). */
  beginMatch(world: World, humanIndex: number): void {
    this.world = world;
    world.predicting = true;
    this.humanIndex = humanIndex;
    this.local = world.humans[humanIndex] ?? null;
    this.predicting = false;
    this.lastSyncAt = 0;
    this.seq = 0;
    this.history.length = 0;
    this.sent.clear();
    this.memos.clear();
    this.reconciledTick = -1;
    this.acked = 0;
    this.shots.length = 0;
    this.stats.corrections = 0;
    // (snapshots that arrived before the scene was ready stay in the buffer)
  }

  endMatch(): void {
    this.world = null;
    this.local = null;
    this.buf.length = 0;
    this.offset = NaN;
    this.events.length = 0;
    this.shots.length = 0;
  }

  /** Once per client tick: send this tick's controls (with the last few repeated, in case packets drop) and move
   *  our own fighter with them right now. */
  sendInput(i: Intent): void {
    this.seq++;
    const bits = packIntent(i);
    this.history.unshift(bits);
    if (this.history.length > INPUT_REDUNDANCY) this.history.length = INPUT_REDUNDANCY;
    this.session.link.sendState(encodeInput({ seq: this.seq, ack: this.buf.length ? this.buf[this.buf.length - 1].tick : 0, inputs: this.history }));

    const w = this.world;
    const f = this.local;
    this.sent.set(this.seq, bits);
    this.sent.delete(this.seq - HISTORY);
    if (!w || !f || !this.predicting || !f.alive || w.result) return;
    unpackIntent(bits, f.intent);
    w.predictStep(f);
    this.memos.set(this.seq, f.capture());
    this.memos.delete(this.seq - HISTORY);
  }

  /** Once per render frame: fold in new snapshots. Returns true when a new snapshot was used.
   *  `time` is the local clock in ms (defaults to `clock`). */
  sync(time = this.clock()): boolean {
    const w = this.world;
    if (!w) return false;
    const dt = this.lastSyncAt ? Math.min(250, Math.max(0, time - this.lastSyncAt)) : 0;
    this.lastSyncAt = time;
    const newest = this.buf[this.buf.length - 1];
    let fresh = false;
    if (newest && newest.tick > this.reconciledTick) {
      this.reconciledTick = newest.tick;
      this.reconcile(w, newest);
      applyCrates(w, newest.crates);
      fresh = true;
    }
    if (newest) this.drawOthers(w, time);

    // the correction glide: the sprite's offset from the true position shrinks to nothing
    const f = this.local;
    if (f && (f.offX !== 0 || f.offY !== 0)) {
      const k = Math.exp(-dt / SMOOTH_MS);
      f.offX = Math.abs(f.offX) < 0.3 ? 0 : f.offX * k;
      f.offY = Math.abs(f.offY) < 0.3 ? 0 : f.offY * k;
    }

    // events wait until the drawn moment reaches them, so a hit spark lines up with what is on screen
    const drawn = w.tick;
    let kept = 0;
    for (const q of this.events) {
      if (q.tick > drawn && !w.result) {
        this.events[kept++] = q;
        continue;
      }
      const e = q.e;
      if (e.k === 'end') continue; // the snapshot's result drives the end (it can't arrive before the final state)
      if (this.predict && f && 'f' in e && e.f === f.id && PREDICTED.has(e.k)) continue;
      if (this.predict && f && e.k === 'ultimate' && e.f === f.id && e.phase === 'start') continue;
      const se = fromNetEvent(e, (id) => byId(w, id));
      if (se) w.emit(se);
    }
    this.events.length = kept;
    this.stats.buffered = this.buf.length;
    this.stats.pending = this.seq - this.acked;
    return fresh;
  }

  private receive(s: SnapshotMsg): void {
    // unordered channel: insert by tick, drop duplicates and anything older than what we already drew past
    const buf = this.buf;
    if (buf.length && s.tick <= buf[0].tick) return;
    let i = buf.length;
    while (i > 0 && buf[i - 1].tick > s.tick) i--;
    if (i > 0 && buf[i - 1].tick === s.tick) return;
    buf.splice(i, 0, s);
    if (buf.length > 40) buf.shift();
    // host clock estimate: each arrival says "host time was tick * TICK_MS, some delay ago"
    const sample = s.tick * TICK_MS - this.clock();
    if (Number.isNaN(this.offset) || Math.abs(sample - this.offset) > 400) {
      this.offset = sample;
      this.jitter = 0;
    } else {
      this.jitter = this.jitter * 0.9 + Math.abs(sample - this.offset) * 0.1;
      this.offset += (sample - this.offset) * 0.1;
    }
  }

  /** Our own fighter: take the host's word for where it was after input `ack`, then replay what the host has not seen. */
  private reconcile(w: World, s: SnapshotMsg): void {
    this.acked = s.acks.find((a) => a.slot === this.humanIndex)?.seq ?? this.acked;
    const f = this.local;
    if (!f) return;
    const fs = s.fighters.find((x) => x.id === f.id);
    if (!fs) return;
    const wasPredicting = this.predicting;
    // (until the host has answered our first input there is nothing to line the two timelines up with: just mirror)
    this.predicting = this.predict && fs.alive && s.result === 0 && this.acked > 0;
    if (!this.predicting) {
      // not predicting (or out of the fight): plain mirror
      const moved = Math.hypot(fs.x - f.x, fs.y - f.y);
      applyFighterSnap(f, fs);
      f.syncHang((fs.ext & 2) !== 0);
      if (moved > TELEPORT_PX || !this.predict) {
        f.prevX = f.x;
        f.prevY = f.y;
      }
      f.offX = f.offY = 0;
      this.memos.clear();
      return;
    }
    const seenX = f.x + f.offX;
    const seenY = f.y + f.offY;
    const wasX = f.x;
    const wasY = f.y;
    const wasSeq = f.actionSeq;
    const memo = this.memos.get(this.acked);
    if (memo) f.restore(memo); // cooldowns and other private timers as they were right after that input
    applyFighterSnap(f, fs);
    f.syncHang((fs.ext & 2) !== 0);
    f.prevX = f.x;
    f.prevY = f.y;
    w.muted = true;
    for (let seq = this.acked + 1; seq <= this.seq; seq++) {
      const bits = this.sent.get(seq);
      if (bits === undefined) continue;
      unpackIntent(bits, f.intent);
      w.predictStep(f);
      this.memos.set(seq, f.capture());
    }
    w.muted = false;
    for (const L of w.ledges) L.holder = f.ledge === L ? f.id : 0;
    // the view restarts a move animation when actionSeq changes: don't let the 6-bit wire value look like a new move
    if (((f.actionSeq - wasSeq) & 63) === 0) f.actionSeq = wasSeq;

    const err = Math.hypot(f.x - wasX, f.y - wasY);
    this.stats.lastError = err;
    if (err < CORRECT_PX || !wasPredicting) {
      // (the first predicted frame after mirroring is a hand-over, not a mistake: glide across it)
      f.offX = seenX - f.x;
      f.offY = seenY - f.y;
      return;
    }
    this.stats.corrections++;
    if (err > TELEPORT_PX) f.offX = f.offY = 0; // respawn / big launch: jump there
    else {
      f.offX = seenX - f.x;
      f.offY = seenY - f.y;
    }
  }

  /** Everyone except our predicted fighter: positions blended between the two snapshots around (host time - delay). */
  private drawOthers(w: World, time: number): void {
    const buf = this.buf;
    const delay = Math.min(INTERP_MAX_MS, Math.max(INTERP_MIN_MS, SNAPSHOT_MS + this.jitter * 3));
    this.stats.delay = delay;
    const rt = time + this.offset - delay;
    // drop snapshots we are past (keep the one just before the drawn moment)
    while (buf.length > 2 && buf[1].tick * TICK_MS <= rt) buf.shift();
    const a = buf[0];
    const b = buf[1] ?? a;
    const ta = a.tick * TICK_MS;
    const tb = b.tick * TICK_MS;
    let t = tb > ta ? (rt - ta) / (tb - ta) : 1;
    if (t < 0) t = 0;
    const over = Math.min(EXTRAPOLATE_MS, Math.max(0, rt - tb)); // past the newest snapshot: coast briefly
    if (t > 1) t = 1;

    for (const fs of b.fighters) {
      const f = byId(w, fs.id) ?? w.addMinionWithId(fs.id, fs.x, fs.y);
      if (f === this.local && this.predicting) continue; // predicted
      if (f === this.local && !this.predict) continue; // mirrored in reconcile
      applyFighterSnap(f, fs);
      const from = a === b ? undefined : a.fighters.find((x) => x.id === fs.id);
      let x = fs.x;
      let y = fs.y;
      if (from && Math.hypot(fs.x - from.x, fs.y - from.y) < TELEPORT_PX) {
        x = from.x + (fs.x - from.x) * t;
        y = from.y + (fs.y - from.y) * t;
      }
      if (over > 0 && fs.hitstun <= 0) x += (fs.vx * over) / 1000;
      place(f, fs, x, y);
    }
    for (let i = w.fighters.length - 1; i >= 0; i--) {
      const f = w.fighters[i];
      if (!b.fighters.some((fs) => fs.id === f.id)) w.removeFighter(f);
    }

    for (const sh of this.shots) this.shotPool.push(sh);
    this.shots.length = 0;
    const ahead = Math.max(-SNAPSHOT_MS * 2, Math.min(EXTRAPOLATE_MS, rt - tb)); // shots fly straight: place them exactly
    for (const ss of b.shots) {
      const owner = byId(w, ss.owner);
      if (!owner) continue;
      const shot = this.shotPool.pop() ?? ({} as Shot);
      shot.owner = owner;
      shot.move = owner.def.special;
      shot.life = 1;
      shot.team = owner.team;
      shot.x = shot.prevX = ss.x + (ss.vx * ahead) / 1000;
      shot.y = ss.y;
      shot.vx = ss.vx;
      this.shots.push(shot);
    }

    w.tick = b.tick;
    w.spawner.wave = b.wave;
    if (b.result !== 0 && !w.result) {
      w.result = b.result === 1 ? 'won' : 'lost';
      w.emit({ k: 'end', won: b.result === 1 });
    }
  }

  private onCtrl(m: CtrlMsg): void {
    switch (m.t) {
      case 'welcome':
        this.slot = m.slot;
        this.token = m.token ?? '';
        return;
      case 'refuse':
        this.closedReason = m.reason;
        this.deliberate = true; // the host said no (or ended the game): do not try to rejoin
        return;
      case 'lobby':
        this.players = m.players;
        this.bossIndex = m.bossIndex;
        this.mode = m.mode ?? 'boss';
        if (this.inMatch) {
          this.inMatch = false;
          this.endMatch();
          this.onBackToLobby?.();
        }
        return;
      case 'start':
        this.inMatch = true;
        this.buf.length = 0;
        this.offset = NaN;
        this.events.length = 0;
        if (this.startHandler) this.startHandler(m.match, m.slot);
        else this.pendingStart = { match: m.match, slot: m.slot };
        return;
      case 'events':
        if (this.inMatch) for (const e of m.list) this.events.push({ tick: m.tick, e });
        return;
      case 'notice':
        this.notice = m.text;
        this.onNotice?.(m.text);
        return;
      default:
        return;
    }
  }
}

/** Put a mirrored fighter at an interpolated spot (and make the view's own tick interpolation a no-op for it). */
function place(f: Fighter, fs: FighterSnap, x: number, y: number): void {
  const b = f.body;
  b.x = x - b.width / 2;
  b.y = y + f.foot - b.height;
  b.vx = fs.vx;
  b.vy = fs.vy;
  f.prevX = x;
  f.prevY = y;
}

function byId(w: World, id: number): Fighter | undefined {
  for (const f of w.fighters) if (f.id === id) return f;
  return undefined;
}

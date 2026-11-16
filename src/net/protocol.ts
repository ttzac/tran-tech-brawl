import type { Fighter, Intent } from '../entities/Fighter';
import type { BossDef, FighterDef } from '../data/types';
import type { Loadout } from '../data/items';
import { bosses } from '../data/bosses';
import { stages } from '../data/stages';
import { generateStage } from '../data/procgen';
import { POWER_IDS, type PowerId } from '../data/powerups';
import { Body } from '../sim/kinematics';
import type { MatchConfig, World } from '../sim/World';
import type { SimEvent } from '../sim/events';

/** Bump when a wire format changes; peers with a different version are refused at hello. */
export const PROTOCOL_VERSION = 2;

/** First byte of every binary (state channel) message. */
export const MSG = { INPUT: 1, SNAPSHOT: 2, PING: 0xf0, PONG: 0xf1 } as const;

/** Each input packet repeats this many recent ticks, so one lost packet never eats a jump. */
export const INPUT_REDUNDANCY = 4;

// ---- quantisation -----------------------------------------------------------------------------

const POS_Q = 2; // 0.5 px
const VEL_Q = 4; // 0.25 px/s
const DMG_Q = 10; // 0.1 %
const i16 = (v: number): number => Math.max(-32768, Math.min(32767, Math.round(v)));
const u16 = (v: number): number => Math.max(0, Math.min(65535, Math.round(v)));

// ---- intents ----------------------------------------------------------------------------------

/** One tick of controls in a byte: bits 0-1 dir (0 none, 1 left, 2 right), 2 drop, 3 jump, 4 attack, 5 special, 6 ultimate. */
export function packIntent(i: Intent): number {
  return (i.dir < 0 ? 1 : i.dir > 0 ? 2 : 0) | (i.drop ? 4 : 0) | (i.jump ? 8 : 0) | (i.attack ? 16 : 0) | (i.special ? 32 : 0) | (i.ultimate ? 64 : 0);
}

export function unpackIntent(bits: number, out: Intent): Intent {
  const d = bits & 3;
  out.dir = d === 1 ? -1 : d === 2 ? 1 : 0;
  out.drop = (bits & 4) !== 0;
  out.jump = (bits & 8) !== 0;
  out.attack = (bits & 16) !== 0;
  out.special = (bits & 32) !== 0;
  out.ultimate = (bits & 64) !== 0;
  return out;
}

// ---- INPUT: client -> host, every tick ------------------------------------------------------------

export interface InputMsg {
  /** sequence number of the newest input (the client's own tick counter) */
  seq: number;
  /** newest snapshot tick the client has received (lets the host measure what the client sees) */
  ack: number;
  /** packed intents, newest first: inputs[k] belongs to seq - k */
  inputs: number[];
}

export function encodeInput(m: InputMsg): Uint8Array {
  const n = Math.min(m.inputs.length, 255);
  const buf = new Uint8Array(10 + n);
  const v = new DataView(buf.buffer);
  v.setUint8(0, MSG.INPUT);
  v.setUint32(1, m.seq >>> 0, true);
  v.setUint32(5, m.ack >>> 0, true);
  v.setUint8(9, n);
  for (let k = 0; k < n; k++) buf[10 + k] = m.inputs[k] & 0xff;
  return buf;
}

export function decodeInput(buf: Uint8Array): InputMsg | null {
  if (buf.length < 10 || buf[0] !== MSG.INPUT) return null;
  const v = view(buf);
  const n = v.getUint8(9);
  if (buf.length < 10 + n) return null;
  const inputs: number[] = [];
  for (let k = 0; k < n; k++) inputs.push(buf[10 + k]);
  return { seq: v.getUint32(1, true), ack: v.getUint32(5, true), inputs };
}

// ---- SNAPSHOT: host -> client, 30 Hz ------------------------------------------------------------

export interface FighterSnap {
  id: number;
  /** sprite centre */
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  dir: -1 | 0 | 1;
  alive: boolean;
  grounded: boolean;
  flash: boolean;
  damage: number;
  stocks: number;
  jumpsLeft: number;
  hitstun: number;
  invuln: number;
  /** 0 none, 1 melee, 2 special, 3 ultimate */
  action: 0 | 1 | 2 | 3;
  /** ultimate meter, 0..100 */
  ult: number;
  /** low 6 bits of the fighter's action counter (a change = a new move started) */
  actionSeq: number;
  tint: number | null;
  /** bit 0 ducking, bit 1 hanging on a ledge, bits 2-6 held power-up (index into POWER_IDS + 1, 0 = none) */
  ext: number;
}

export interface ShotSnap {
  owner: number;
  x: number;
  y: number;
  vx: number;
}

/** A power-up crate (brawl): centre position. */
export interface CrateSnap {
  id: number;
  power: number; // index into POWER_IDS
  x: number;
  y: number;
}

export interface SnapshotMsg {
  tick: number;
  wave: number;
  /** 0 running, 1 won, 2 lost */
  result: 0 | 1 | 2;
  /** newest input seq the host has applied, per human slot */
  acks: { slot: number; seq: number }[];
  fighters: FighterSnap[];
  shots: ShotSnap[];
  crates: CrateSnap[];
}

const ACTION_CODE = { melee: 1, special: 2, ultimate: 3 } as const;

/** Read the replicated part of a World. `acks[slot]` = last input seq applied for that human. */
export function captureSnapshot(w: World, acks: readonly number[] = []): SnapshotMsg {
  const fighters: FighterSnap[] = w.fighters.map((f) => ({
    id: f.id,
    x: f.x,
    y: f.y,
    vx: f.body.vx,
    vy: f.body.vy,
    facing: f.facing,
    dir: f.intent.dir,
    alive: f.alive,
    grounded: f.grounded,
    flash: f.flash > 0,
    damage: f.damage,
    stocks: f.stocks,
    jumpsLeft: f.jumpsLeft,
    hitstun: f.hitstun,
    invuln: f.invuln,
    action: f.action ? ACTION_CODE[f.action] : 0,
    actionSeq: f.actionSeq & 63,
    ult: f.ult,
    tint: f.tint,
    ext: (f.ducking ? 1 : 0) | (f.hanging ? 2 : 0) | (((f.power ? POWER_IDS.indexOf(f.power) + 1 : 0) & 31) << 2),
  }));
  return {
    tick: w.tick,
    wave: w.spawner.wave,
    result: w.result === 'won' ? 1 : w.result === 'lost' ? 2 : 0,
    acks: acks.map((seq, slot) => ({ slot, seq })),
    fighters,
    shots: w.combat.shots.map((s) => ({ owner: s.owner.id, x: s.x, y: s.y, vx: s.vx })),
    crates: w.crates.map((c) => ({ id: c.id, power: POWER_IDS.indexOf(c.power), x: c.body.centerX, y: c.body.centerY })),
  };
}

const FIGHTER_BYTES = 22; // + 3 when tinted
const SHOT_BYTES = 8;
const CRATE_BYTES = 7;

export function encodeSnapshot(m: SnapshotMsg): Uint8Array {
  const nf = Math.min(m.fighters.length, 255);
  const ns = Math.min(m.shots.length, 255);
  const na = Math.min(m.acks.length, 255);
  const nc = Math.min(m.crates.length, 255);
  let size = 11 + na * 5 + ns * SHOT_BYTES + nc * CRATE_BYTES;
  for (let i = 0; i < nf; i++) size += FIGHTER_BYTES + (m.fighters[i].tint !== null ? 3 : 0);
  const buf = new Uint8Array(size);
  const v = new DataView(buf.buffer);
  let o = 0;
  v.setUint8(o++, MSG.SNAPSHOT);
  v.setUint32(o, m.tick >>> 0, true);
  o += 4;
  v.setUint8(o++, Math.min(m.wave, 255));
  v.setUint8(o++, m.result);
  v.setUint8(o++, na);
  for (let i = 0; i < na; i++) {
    v.setUint8(o++, m.acks[i].slot);
    v.setUint32(o, m.acks[i].seq >>> 0, true);
    o += 4;
  }
  v.setUint8(o++, nf);
  v.setUint8(o++, ns);
  v.setUint8(o++, nc);
  for (let i = 0; i < nf; i++) {
    const f = m.fighters[i];
    const flags =
      (f.alive ? 1 : 0) | (f.facing < 0 ? 2 : 0) | (f.grounded ? 4 : 0) | (f.flash ? 8 : 0) | (f.tint !== null ? 16 : 0) | ((f.dir < 0 ? 1 : f.dir > 0 ? 2 : 0) << 5);
    v.setUint16(o, f.id, true);
    v.setInt16(o + 2, i16(f.x * POS_Q), true);
    v.setInt16(o + 4, i16(f.y * POS_Q), true);
    v.setInt16(o + 6, i16(f.vx * VEL_Q), true);
    v.setInt16(o + 8, i16(f.vy * VEL_Q), true);
    v.setUint16(o + 10, u16(f.damage * DMG_Q), true);
    v.setUint8(o + 12, Math.max(0, Math.min(255, f.stocks)));
    v.setUint8(o + 13, flags);
    v.setUint8(o + 14, f.action | ((f.actionSeq & 63) << 2));
    v.setUint8(o + 15, Math.max(0, Math.min(255, f.jumpsLeft)));
    v.setUint16(o + 16, u16(f.hitstun), true);
    v.setUint16(o + 18, u16(f.invuln), true);
    v.setUint8(o + 20, f.ext & 0xff);
    v.setUint8(o + 21, Math.max(0, Math.min(100, Math.round(f.ult))));
    o += FIGHTER_BYTES;
    if (f.tint !== null) {
      v.setUint8(o, (f.tint >> 16) & 0xff);
      v.setUint8(o + 1, (f.tint >> 8) & 0xff);
      v.setUint8(o + 2, f.tint & 0xff);
      o += 3;
    }
  }
  for (let i = 0; i < ns; i++) {
    const s = m.shots[i];
    v.setUint16(o, s.owner, true);
    v.setInt16(o + 2, i16(s.x * POS_Q), true);
    v.setInt16(o + 4, i16(s.y * POS_Q), true);
    v.setInt16(o + 6, i16(s.vx * VEL_Q), true);
    o += SHOT_BYTES;
  }
  for (let i = 0; i < nc; i++) {
    const c = m.crates[i];
    v.setUint16(o, c.id & 0xffff, true);
    v.setUint8(o + 2, Math.max(0, c.power));
    v.setInt16(o + 3, i16(c.x * POS_Q), true);
    v.setInt16(o + 5, i16(c.y * POS_Q), true);
    o += CRATE_BYTES;
  }
  return buf;
}

export function decodeSnapshot(buf: Uint8Array): SnapshotMsg | null {
  if (buf.length < 10 || buf[0] !== MSG.SNAPSHOT) return null;
  const v = view(buf);
  try {
    let o = 1;
    const tick = v.getUint32(o, true);
    o += 4;
    const wave = v.getUint8(o++);
    const result = v.getUint8(o++) as 0 | 1 | 2;
    const na = v.getUint8(o++);
    const acks: SnapshotMsg['acks'] = [];
    for (let i = 0; i < na; i++) {
      acks.push({ slot: v.getUint8(o), seq: v.getUint32(o + 1, true) });
      o += 5;
    }
    const nf = v.getUint8(o++);
    const ns = v.getUint8(o++);
    const nc = v.getUint8(o++);
    const fighters: FighterSnap[] = [];
    for (let i = 0; i < nf; i++) {
      const flags = v.getUint8(o + 13);
      const act = v.getUint8(o + 14);
      const d = (flags >> 5) & 3;
      const f: FighterSnap = {
        id: v.getUint16(o, true),
        x: v.getInt16(o + 2, true) / POS_Q,
        y: v.getInt16(o + 4, true) / POS_Q,
        vx: v.getInt16(o + 6, true) / VEL_Q,
        vy: v.getInt16(o + 8, true) / VEL_Q,
        damage: v.getUint16(o + 10, true) / DMG_Q,
        stocks: v.getUint8(o + 12),
        alive: (flags & 1) !== 0,
        facing: flags & 2 ? -1 : 1,
        grounded: (flags & 4) !== 0,
        flash: (flags & 8) !== 0,
        dir: d === 1 ? -1 : d === 2 ? 1 : 0,
        action: (act & 3) as 0 | 1 | 2 | 3,
        ult: v.getUint8(o + 21),
        actionSeq: act >> 2,
        jumpsLeft: v.getUint8(o + 15),
        hitstun: v.getUint16(o + 16, true),
        invuln: v.getUint16(o + 18, true),
        tint: null,
        ext: v.getUint8(o + 20),
      };
      o += FIGHTER_BYTES;
      if (flags & 16) {
        f.tint = (v.getUint8(o) << 16) | (v.getUint8(o + 1) << 8) | v.getUint8(o + 2);
        o += 3;
      }
      fighters.push(f);
    }
    const shots: ShotSnap[] = [];
    for (let i = 0; i < ns; i++) {
      shots.push({ owner: v.getUint16(o, true), x: v.getInt16(o + 2, true) / POS_Q, y: v.getInt16(o + 4, true) / POS_Q, vx: v.getInt16(o + 6, true) / VEL_Q });
      o += SHOT_BYTES;
    }
    const crates: CrateSnap[] = [];
    for (let i = 0; i < nc; i++) {
      crates.push({ id: v.getUint16(o, true), power: v.getUint8(o + 2), x: v.getInt16(o + 3, true) / POS_Q, y: v.getInt16(o + 5, true) / POS_Q });
      o += CRATE_BYTES;
    }
    return { tick, wave, result, acks, fighters, shots, crates };
  } catch {
    return null; // truncated packet
  }
}

/** Overwrite a fighter's replicated state from a snapshot (client side). Keeps render interpolation from the old position. */
export function applyFighterSnap(f: Fighter, s: FighterSnap): void {
  f.setDuck((s.ext & 1) !== 0); // resize first: the position below is relative to the box height
  f.hanging = (s.ext & 2) !== 0;
  const pi = (s.ext >> 2) & 31;
  f.power = pi > 0 ? POWER_IDS[pi - 1] ?? null : null;
  const b = f.body;
  f.prevX = f.x;
  f.prevY = f.y;
  b.x = s.x - b.width / 2;
  b.y = s.y + f.foot - b.height;
  b.vx = s.vx;
  b.vy = s.vy;
  b.grounded = s.grounded;
  f.facing = s.facing;
  f.intent.dir = s.dir;
  f.alive = s.alive;
  f.damage = s.damage;
  f.stocks = s.stocks;
  f.jumpsLeft = s.jumpsLeft;
  f.hitstun = s.hitstun;
  f.invuln = s.invuln;
  f.flash = s.flash ? Math.max(f.flash, 1) : 0;
  f.tint = s.tint;
  f.actionSeq = s.actionSeq; // the view only looks for a change
  f.ult = s.ult;
  f.action = s.action === 1 ? 'melee' : s.action === 2 ? 'special' : s.action === 3 ? 'ultimate' : null;
}

/** Client: make the World's crate list match the host's (the view only reads id, power and the body's position). */
export function applyCrates(w: World, crates: readonly CrateSnap[]): void {
  const list = w.crates;
  for (let i = list.length - 1; i >= 0; i--) if (!crates.some((c) => c.id === list[i].id)) list.splice(i, 1);
  for (const c of crates) {
    let cr = list.find((x) => x.id === c.id);
    if (!cr) {
      cr = { id: c.id, power: (POWER_IDS[c.power] ?? POWER_IDS[0]) as PowerId, body: new Body(30, 30), age: 0 };
      list.push(cr);
    }
    cr.body.x = c.x - cr.body.width / 2;
    cr.body.y = c.y - cr.body.height / 2;
  }
}

// ---- PING / PONG (state channel, link-level) ------------------------------------------------------

export function encodePing(type: typeof MSG.PING | typeof MSG.PONG, time: number): Uint8Array {
  const buf = new Uint8Array(9);
  const v = new DataView(buf.buffer);
  v.setUint8(0, type);
  v.setFloat64(1, time, true);
  return buf;
}

export function decodePingTime(buf: Uint8Array): number {
  return view(buf).getFloat64(1, true);
}

// ---- reliable control messages (JSON on the ctrl channel) ----------------------------------------

/** Everything needed to rebuild the host's MatchConfig on a client. Defs travel whole so loadouts apply. */
export interface NetMatchConfig {
  /** 'boss' (default) or 'brawl'. Dungeon runs are solo only. */
  mode?: 'boss' | 'brawl';
  /** brawl: the rival crew */
  rivals?: FighterDef[];
  bossIndex: number;
  humans: FighterDef[];
  allies: FighterDef[];
  seed: number;
}

export interface LobbyPlayer {
  slot: number;
  name: string;
  hero: string;
  ready: boolean;
  /** round trip to the host in ms (0 for the host itself) */
  ping: number;
}

/** Sim events with fighters referenced by id. */
export type NetEvent = SimEvent extends infer E ? (E extends { f: Fighter } ? Omit<E, 'f' | 'killer' | 'by'> & { f: number; killer?: number | null; by?: number | null } : E) : never;

export type CtrlMsg =
  | { t: 'hello'; v: number; name: string; token?: string }
  | { t: 'welcome'; v: number; slot: number; token?: string }
  | { t: 'refuse'; reason: string }
  | { t: 'lobby'; players: LobbyPlayer[]; bossIndex: number; mode?: 'boss' | 'brawl' }
  | { t: 'pick'; hero: string; loadout?: Loadout }
  | { t: 'ready'; ready: boolean }
  | { t: 'start'; match: NetMatchConfig; slot: number; resume?: boolean }
  | { t: 'notice'; text: string }
  | { t: 'events'; tick: number; list: NetEvent[] }
  | { t: 'chat'; text: string }
  | { t: 'bye' };

const CTRL_TYPES = new Set(['hello', 'welcome', 'refuse', 'lobby', 'pick', 'ready', 'start', 'events', 'chat', 'bye', 'notice']);

export function encodeCtrl(m: CtrlMsg): string {
  return JSON.stringify(m);
}

/** Parse a ctrl message from a peer; null if it is not one we know. */
export function decodeCtrl(text: string): CtrlMsg | null {
  if (text.length > 64 * 1024) return null;
  try {
    const m = JSON.parse(text) as { t?: unknown };
    return m && typeof m === 'object' && typeof m.t === 'string' && CTRL_TYPES.has(m.t) ? (m as CtrlMsg) : null;
  } catch {
    return null;
  }
}

export function toNetEvent(e: SimEvent): NetEvent {
  if (!('f' in e)) return e as NetEvent;
  const out: Record<string, unknown> = { ...e, f: e.f.id };
  if (e.k === 'blast' && e.killer !== undefined) out.killer = e.killer ? e.killer.id : null; // a Fighter would make the message circular JSON
  if (e.k === 'hit') out.by = e.by ? e.by.id : null; // attacker id (picks the hero's hit effect on the client)
  return out as unknown as NetEvent;
}

/** Resolve ids back to fighters; null if the fighter is unknown here. */
export function fromNetEvent(e: NetEvent, byId: (id: number) => Fighter | undefined): SimEvent | null {
  if (!('f' in e)) return e as SimEvent;
  const f = byId(e.f);
  if (!f) return null;
  const out: Record<string, unknown> = { ...e, f };
  if ('killer' in e) out.killer = e.killer != null ? byId(e.killer) ?? null : null;
  if ('by' in e) out.by = e.by != null ? byId(e.by) : undefined;
  return out as unknown as SimEvent;
}

export function toNetMatch(bossIndex: number, humans: FighterDef[], allies: FighterDef[], seed: number): NetMatchConfig {
  return { bossIndex, humans, allies, seed };
}

export function fromNetMatch(m: NetMatchConfig): MatchConfig {
  const boss: BossDef = bosses[m.bossIndex] ?? bosses[0];
  const seed = m.seed >>> 0;
  // brawl: a generated map (the seed makes it the same on every PC), crates on (they travel in snapshots)
  if (m.mode === 'brawl') return { stage: generateStage(seed), boss, humans: m.humans, allies: m.allies, rivals: m.rivals, seed, mode: 'brawl', items: true };
  return { stage: stages[boss.stageId], boss, humans: m.humans, allies: m.allies, seed };
}

function view(buf: Uint8Array): DataView {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
}

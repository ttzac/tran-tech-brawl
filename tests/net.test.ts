import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  INPUT_REDUNDANCY,
  applyFighterSnap,
  captureSnapshot,
  decodeCtrl,
  decodeInput,
  decodeSnapshot,
  encodeCtrl,
  encodeInput,
  encodeSnapshot,
  fromNetEvent,
  fromNetMatch,
  packIntent,
  toNetEvent,
  toNetMatch,
  unpackIntent,
} from '../src/net/protocol';
import { linkPair, isCode, makeCode } from '../src/net/link';
import { SignalRoom, MAX_PEERS, type Sock, type SignalOut } from '../src/net/signalRoom';
import { World, type MatchConfig } from '../src/sim/World';
import { emptyIntent, type Intent } from '../src/entities/Fighter';
import type { SimEvent } from '../src/sim/events';
import { heroes } from '../src/data/heroes';
import { bosses } from '../src/data/bosses';
import { stages } from '../src/data/stages';

const cfg = (seed = 3): MatchConfig => ({ stage: stages[bosses[0].stageId], boss: bosses[0], humans: [heroes[0]], allies: heroes.slice(1, 5), seed });

/** A world some way into a fight (bots fighting, shots flying, minions spawned). */
function busyWorld(ticks = 60 * 12): World {
  const w = new World(cfg());
  for (let t = 0; t < ticks; t++) {
    const i = w.humans[0].intent;
    i.dir = t % 200 < 100 ? 1 : -1;
    i.attack = t % 15 === 0;
    i.special = t % 90 === 0;
    i.jump = t % 70 === 0;
    w.step();
    w.events.length = 0;
  }
  return w;
}

describe('intent packing', () => {
  it('round-trips every combination in one byte', () => {
    const out = emptyIntent();
    for (const dir of [-1, 0, 1] as const)
      for (let b = 0; b < 32; b++) {
        const i: Intent = { dir, drop: !!(b & 1), jump: !!(b & 2), attack: !!(b & 4), special: !!(b & 8), ultimate: !!(b & 16) };
        const bits = packIntent(i);
        expect(bits).toBeLessThan(128);
        expect(unpackIntent(bits, out)).toEqual(i);
      }
  });
});

describe('input message', () => {
  it('round-trips with redundancy and stays tiny', () => {
    const m = { seq: 123456, ack: 99, inputs: [8 | 2, 2, 2, 16] };
    const buf = encodeInput(m);
    expect(buf.byteLength).toBe(10 + INPUT_REDUNDANCY);
    expect(decodeInput(buf)).toEqual(m);
  });
  it('rejects garbage without throwing', () => {
    expect(decodeInput(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(decodeInput(new Uint8Array(12).fill(9))).toBeNull();
  });
});

describe('snapshot', () => {
  it('round-trips a busy fight within quantisation, in well under 1 KB', () => {
    const w = busyWorld();
    w.boss.tint = 0xffe066; // boss telegraph colour must survive
    const snap = captureSnapshot(w, [42]);
    const buf = encodeSnapshot(snap);
    expect(buf.byteLength).toBeLessThan(700);
    const back = decodeSnapshot(buf)!;
    expect(back.tick).toBe(w.tick);
    expect(back.acks).toEqual([{ slot: 0, seq: 42 }]);
    expect(back.fighters.length).toBe(w.fighters.length);
    expect(back.shots.length).toBe(w.combat.shots.length);
    snap.fighters.forEach((f, n) => {
      const g = back.fighters[n];
      expect(g.id).toBe(f.id);
      expect(Math.abs(g.x - f.x)).toBeLessThanOrEqual(0.25);
      expect(Math.abs(g.y - f.y)).toBeLessThanOrEqual(0.25);
      expect(Math.abs(g.vx - f.vx)).toBeLessThanOrEqual(0.125);
      expect(Math.abs(g.damage - f.damage)).toBeLessThanOrEqual(0.05);
      expect([g.facing, g.dir, g.alive, g.grounded, g.flash, g.stocks, g.jumpsLeft, g.action, g.actionSeq, g.tint]).toEqual([
        f.facing, f.dir, f.alive, f.grounded, f.flash, f.stocks, f.jumpsLeft, f.action, f.actionSeq, f.tint,
      ]);
      expect(Math.abs(g.hitstun - f.hitstun)).toBeLessThanOrEqual(0.5);
    });
  });

  it('truncated packets decode to null instead of throwing', () => {
    const buf = encodeSnapshot(captureSnapshot(busyWorld(120)));
    expect(decodeSnapshot(buf.slice(0, buf.length - 3))).toBeNull();
  });

  it('a client world built from the same match config has the same fighter ids; applying a snapshot moves them', () => {
    const host = busyWorld();
    const client = new World(cfg());
    const snap = decodeSnapshot(encodeSnapshot(captureSnapshot(host)))!;
    const byId = new Map(client.fighters.map((f) => [f.id, f]));
    for (const s of snap.fighters) {
      const f = byId.get(s.id);
      if (!f) continue; // minions spawned on the host only (Phase 3 creates them from spawn events)
      applyFighterSnap(f, s);
      expect(Math.abs(f.x - s.x)).toBeLessThan(1e-9);
      expect(Math.abs(f.y - s.y)).toBeLessThan(1e-9);
      expect(f.damage).toBe(s.damage);
    }
    expect(client.humans[0].id).toBe(host.humans[0].id);
    expect(client.boss.id).toBe(host.boss.id);
  });
});

describe('ctrl messages and events', () => {
  it('encode / decode, and refuse junk', () => {
    const m = { t: 'lobby', players: [{ slot: 0, name: 'Zac', hero: 'zac', ready: true, ping: 0 }], bossIndex: 1 } as const;
    expect(decodeCtrl(encodeCtrl(m))).toEqual(m);
    expect(decodeCtrl('not json')).toBeNull();
    expect(decodeCtrl('{"t":"rm -rf"}')).toBeNull();
    expect(decodeCtrl('null')).toBeNull();
  });

  it('sim events travel with fighter ids and resolve back', () => {
    const w = new World(cfg());
    const z = w.humans[0];
    const evs: SimEvent[] = [
      { k: 'hit', f: z, power: 812 },
      { k: 'blast', f: w.boss, x: 10, y: 20 },
      { k: 'end', won: true },
    ];
    const byId = (id: number) => w.fighters.find((f) => f.id === id);
    for (const e of evs) {
      const ne = JSON.parse(JSON.stringify(toNetEvent(e)));
      expect(fromNetEvent(ne, byId)).toEqual(e);
    }
    expect(fromNetEvent({ k: 'hit', f: 9999, power: 1 }, byId)).toBeNull();
  });

  it('match config survives the trip and rebuilds an identical world', () => {
    const net = JSON.parse(JSON.stringify(toNetMatch(0, [heroes[0]], heroes.slice(1, 5), 77)));
    const a = new World(fromNetMatch(net));
    const b = new World(cfg(77));
    for (let t = 0; t < 600; t++) {
      a.step();
      b.step();
    }
    expect(a.fighters.map((f) => [f.id, f.x, f.y])).toEqual(b.fighters.map((f) => [f.id, f.x, f.y]));
  });
});

describe('links (in-memory pair)', () => {
  afterEach(() => vi.useRealTimers());

  it('delivers state and ctrl both ways; close reaches the other side', () => {
    const [a, b] = linkPair();
    const got: unknown[] = [];
    b.onState = (buf) => got.push([...buf]);
    b.onCtrl = (m) => got.push(m);
    a.onCtrl = (m) => got.push(['a', m]);
    a.sendState(new Uint8Array([2, 7, 7]));
    a.sendCtrl({ t: 'chat', text: 'hi' });
    b.sendCtrl({ t: 'bye' });
    expect(got).toEqual([[2, 7, 7], { t: 'chat', text: 'hi' }, ['a', { t: 'bye' }]]);
    let closed = false;
    b.onClose = () => (closed = true);
    a.close();
    expect(closed).toBe(true);
    expect(b.open).toBe(false);
  });

  it('loss drops state packets but never ctrl', () => {
    const [a, b] = linkPair({ lag: 0, jitter: 0, loss: 1 });
    let state = 0;
    let ctrl = 0;
    b.onState = () => state++;
    b.onCtrl = () => ctrl++;
    for (let i = 0; i < 20; i++) {
      a.sendState(new Uint8Array([2]));
      a.sendCtrl({ t: 'bye' });
    }
    expect(state).toBe(0);
    expect(ctrl).toBe(20);
    expect(b.stats.dropped).toBe(21); // 20 + the link's opening ping
    a.close();
  });

  it('lag + jitter delay messages; ctrl stays in order; ping measures the round trip', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearInterval', 'clearTimeout', 'performance', 'Date'] });
    const cond = { lag: 50, jitter: 30, loss: 0 };
    const [a, b] = linkPair(cond);
    const order: number[] = [];
    b.onCtrl = (m) => m.t === 'chat' && order.push(Number(m.text));
    for (let i = 0; i < 10; i++) a.sendCtrl({ t: 'chat', text: String(i) });
    vi.advanceTimersByTime(49);
    expect(order).toEqual([]);
    vi.advanceTimersByTime(100);
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    vi.advanceTimersByTime(3000); // a few ping rounds
    expect(a.stats.rtt).toBeGreaterThanOrEqual(100);
    expect(a.stats.rtt).toBeLessThanOrEqual(160);
    a.close();
  });
});

describe('signalling room', () => {
  class FakeSock implements Sock {
    msgs: SignalOut[] = [];
    closed = false;
    send(t: string) {
      this.msgs.push(JSON.parse(t));
    }
    close() {
      this.closed = true;
    }
    last() {
      return this.msgs[this.msgs.length - 1];
    }
  }

  it('host opens, guests join and can only signal the host, host leaving ends the room', () => {
    const room = new SignalRoom('ABCD');
    const guestEarly = new FakeSock();
    expect(room.join(guestEarly, 'guest', [])).toBeNull();
    expect(guestEarly.last()).toMatchObject({ t: 'error', code: 'no-room' });

    const h = new FakeSock();
    const hid = room.join(h, 'host', [{ urls: 'stun:x' }])!;
    expect(h.last()).toMatchObject({ t: 'welcome', you: hid, host: hid, room: 'ABCD', ice: [{ urls: 'stun:x' }] });
    expect(room.join(new FakeSock(), 'host', [])).toBeNull(); // second host refused

    const g1 = new FakeSock();
    const g2 = new FakeSock();
    const id1 = room.join(g1, 'guest', [])!;
    const id2 = room.join(g2, 'guest', [])!;
    expect(h.msgs.filter((m) => m.t === 'peer-joined').map((m) => (m as { id: string }).id)).toEqual([id1, id2]);

    room.message(id1, JSON.stringify({ t: 'signal', to: hid, data: { sdp: 1 } }));
    expect(h.last()).toEqual({ t: 'signal', from: id1, data: { sdp: 1 } });
    room.message(hid, JSON.stringify({ t: 'signal', to: id2, data: 'answer' }));
    expect(g2.last()).toEqual({ t: 'signal', from: hid, data: 'answer' });
    const before = g2.msgs.length;
    room.message(id1, JSON.stringify({ t: 'signal', to: id2, data: 'sneaky' })); // guest -> guest is blocked
    expect(g2.msgs.length).toBe(before);
    room.message(id1, '{bad json');
    expect(g1.last()).toMatchObject({ t: 'error', code: 'bad-request' });

    room.leave(id1);
    expect(h.last()).toEqual({ t: 'peer-left', id: id1 });
    room.leave(hid);
    expect(g2.last()).toEqual({ t: 'host-left' });
    expect(g2.closed).toBe(true);
    expect(room.size).toBe(0);
  });

  it(`caps a room at ${MAX_PEERS} sockets`, () => {
    const room = new SignalRoom('WXYZ');
    room.join(new FakeSock(), 'host', []);
    for (let i = 1; i < MAX_PEERS; i++) expect(room.join(new FakeSock(), 'guest', [])).not.toBeNull();
    const late = new FakeSock();
    expect(room.join(late, 'guest', [])).toBeNull();
    expect(late.last()).toMatchObject({ code: 'full' });
  });

  it('room codes are 4 unambiguous letters', () => {
    for (let i = 0; i < 200; i++) {
      const c = makeCode();
      expect(isCode(c)).toBe(true);
      expect(c).not.toMatch(/[OILM]/);
    }
  });
});

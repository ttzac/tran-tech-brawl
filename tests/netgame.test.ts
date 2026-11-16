import { describe, it, expect } from 'vitest';
import { RemoteInput } from '../src/net/RemoteInput';
import { NetHost } from '../src/net/NetHost';
import { NetClient } from '../src/net/NetClient';
import { linkPair, type ClientSession, type HostSession, type Link, type NetConditions } from '../src/net/link';
import { fromNetMatch, packIntent, type NetMatchConfig } from '../src/net/protocol';
import { World } from '../src/sim/World';
import { DEFAULT_LOADOUT } from '../src/data/items';
import { emptyIntent, type Intent } from '../src/entities/Fighter';

const bits = (i: Partial<Intent>): number => packIntent({ ...emptyIntent(), ...i });

describe('RemoteInput', () => {
  const msg = (seq: number, inputs: number[]) => ({ seq, ack: 0, inputs });

  it('applies one input per tick in order and ignores redundant copies', () => {
    const ri = new RemoteInput();
    const out = emptyIntent();
    ri.push(msg(1, [bits({ dir: 1 })]));
    ri.push(msg(2, [bits({ dir: 1, jump: true }), bits({ dir: 1 })]));
    ri.push(msg(3, [bits({ dir: -1 }), bits({ dir: 1, jump: true }), bits({ dir: 1 })]));
    ri.apply(out);
    expect([out.dir, out.jump, ri.applied]).toEqual([1, false, 1]);
    ri.apply(out);
    expect([out.dir, out.jump, ri.applied]).toEqual([1, true, 2]);
    ri.apply(out);
    expect([out.dir, out.jump, ri.applied]).toEqual([-1, false, 3]);
  });

  it('a late tick holds movement without repeating presses, then catches up', () => {
    const ri = new RemoteInput();
    const out = emptyIntent();
    ri.push(msg(1, [bits({ dir: 1, attack: true })]));
    ri.apply(out);
    expect(out.attack).toBe(true);
    ri.apply(out); // seq 2 not here yet
    expect([out.dir, out.attack, ri.applied]).toEqual([1, false, 1]);
    ri.push(msg(2, [bits({ dir: 1, special: true }), bits({ dir: 1, attack: true })]));
    ri.apply(out);
    expect([out.special, ri.applied]).toEqual([true, 2]);
  });

  it('never loses a press when packets drop, and backlog merges so delay stays bounded', () => {
    const ri = new RemoteInput();
    const out = emptyIntent();
    const sent: number[] = [];
    let jumps = 0;
    for (let seq = 1; seq <= 40; seq++) {
      sent.unshift(bits({ dir: 1, jump: seq % 5 === 0 }));
      if (sent.length > 4) sent.length = 4;
      if (seq % 3 !== 0) ri.push(msg(seq, [...sent])); // a third of packets lost
      if (seq % 7 === 0) continue; // host stalls a tick now and then -> backlog
      ri.apply(out);
      if (out.jump) jumps++;
    }
    for (let k = 0; k < 6; k++) {
      ri.apply(out);
      if (out.jump) jumps++;
    }
    expect(jumps).toBe(8); // every 5th of 40 ticks
    expect(ri.applied).toBe(40);
  });

  it('skips a tick that is lost for good instead of stalling', () => {
    const ri = new RemoteInput();
    const out = emptyIntent();
    ri.push(msg(1, [bits({})]));
    ri.apply(out);
    // seq 2 never arrives (all 4 copies lost); later packets only carry 3+ ... (redundancy 1 here)
    for (let seq = 3; seq <= 8; seq++) {
      ri.push(msg(seq, [bits({ dir: -1 })]));
      ri.apply(out);
    }
    expect(ri.applied).toBeGreaterThanOrEqual(5);
    expect(out.dir).toBe(-1);
  });
});

/** A host session whose links are in-memory pairs; connect() plays a guest joining. */
function fakeHost(cond?: NetConditions) {
  const links = new Map<string, Link>();
  let n = 0;
  const session: HostSession & { connect(): ClientSession } = {
    code: 'TEST',
    links,
    onJoin: null,
    onLeave: null,
    close() {
      for (const l of [...links.values()]) l.close();
    },
    connect() {
      const id = `p${++n}`;
      const [h, c] = linkPair(cond, cond, [id, 'host']);
      links.set(id, h);
      h.onClose = () => {
        links.delete(id);
        session.onLeave?.(h);
      };
      session.onJoin?.(h);
      return { code: 'TEST', link: c, close: () => c.close() };
    },
  };
  return session;
}

describe('online game (host + client over an in-memory link)', () => {
  it('lobby: join, pick, ready, start, play, back to lobby, leave', () => {
    const session = fakeHost();
    const host = new NetHost(session, 'zac', DEFAULT_LOADOUT);
    const client = new NetClient(session.connect(), 'Bob');

    expect(client.slot).toBe(1);
    expect(host.players.map((p) => p.name)).toEqual(['Host', 'Bob']);
    expect(client.players.length).toBe(2);
    expect(host.canStart).toBe(false);

    client.pick('chain', DEFAULT_LOADOUT);
    client.ready(true);
    expect(host.players[1]).toMatchObject({ hero: 'chain', ready: true });
    expect(client.isReady).toBe(true);
    expect(host.canStart).toBe(true);

    let started: { m: NetMatchConfig; i: number } | null = null;
    client.onStart = (m, i) => (started = { m, i });
    const { config } = host.start(4242);
    expect(started!.i).toBe(1);
    expect(config.humans.map((h) => h.id)).toEqual(['zac', 'chain']);
    expect(config.humans.length + config.allies.length).toBe(5);
    expect(config.allies.some((a) => a.id === 'zac' || a.id === 'chain')).toBe(false);

    // a late joiner is refused while the match runs
    let refused = '';
    const late = new NetClient(session.connect(), 'Late');
    late.onClosed = (r) => (refused = r);
    return new Promise<void>((done) => setTimeout(done, 300)).then(() => {
      expect(refused).toMatch(/in progress/);

      const hw = new World(config);
      const cw = new World(fromNetMatch(started!.m));
      host.beginMatch(hw);
      client.beginMatch(cw, 1);
      let now = 0;
      client.clock = () => now; // game time, not wall time (this loop runs far faster than real time)
      const startX = hw.humans[1].x;
      const mine = emptyIntent();
      let sawMinions = false;
      for (let t = 1; t <= 60 * 12; t++) {
        mine.dir = t < 90 ? 1 : 0; // walk right for 1.5 s
        mine.jump = t === 30;
        now = t * (1000 / 60);
        client.sendInput(mine);
        host.beforeTick();
        hw.step();
        host.afterTick();
        hw.events.length = 0;
        client.sync();
        cw.events.length = 0;
        if (cw.fighters.length > hw.humans.length + 4 + 1) sawMinions = true;
        // our own fighter is predicted: it tracks the host's copy closely the whole way
        if (t > 10 && hw.humans[1].hitstun <= 0) expect(Math.abs(cw.humans[1].x - hw.humans[1].x)).toBeLessThan(12);
      }
      // other fighters are drawn a few ticks in the past: the same roster, close to where the host has them
      const there = new Map(hw.fighters.map((f) => [f.id, f.x]));
      expect(cw.fighters.filter((f) => !there.has(f.id)).length).toBeLessThanOrEqual(1);
      for (const f of cw.fighters) if (there.has(f.id)) expect(Math.abs(f.x - there.get(f.id)!)).toBeLessThan(120);
      expect(hw.humans[1].x).toBeGreaterThan(startX + 150); // the remote player's input moved their fighter on the host
      expect(client.acked).toBeGreaterThan(60 * 12 - 4);
      expect(sawMinions).toBe(true); // minions the host spawned appeared on the client

      let back = false;
      client.onBackToLobby = () => (back = true);
      host.backToLobby();
      expect(back).toBe(true);
      expect(client.inMatch).toBe(false);
      expect(host.players[1].ready).toBe(false);

      client.close();
      expect(host.players.length).toBe(1);
    });
  });

  it('host ending the game tells the client', () => {
    const session = fakeHost();
    const host = new NetHost(session, 'zac', DEFAULT_LOADOUT);
    const client = new NetClient(session.connect(), '');
    let reason = '';
    client.onClosed = (r) => (reason = r);
    host.close();
    expect(reason).toBe('The host ended the game');
  });

  it('refuses a different protocol version', () => {
    const session = fakeHost();
    new NetHost(session, 'zac', DEFAULT_LOADOUT);
    const c = session.connect();
    let got = '';
    c.link.onCtrl = (m) => m.t === 'refuse' && (got = m.reason);
    c.link.sendCtrl({ t: 'hello', v: 999, name: 'x' });
    expect(got).toMatch(/version/);
  });
});
